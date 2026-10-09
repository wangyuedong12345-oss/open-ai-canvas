[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$workerScript = Join-Path $PSScriptRoot 'local-background-worker.ps1'
$runtimeDir = Join-Path $repoRoot '.local\run\dev-background'
$shell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$go = (Get-Command go.exe -ErrorAction Stop).Source
$node = (Get-Command node.exe -ErrorAction Stop).Source
$bun = (& bun -e 'process.stdout.write(process.execPath)').Trim()
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $bun)) { throw 'Unable to resolve the Bun executable.' }
if (-not (Test-Path -LiteralPath (Join-Path $repoRoot 'web\node_modules\vite'))) { throw 'Install web dependencies with Bun first.' }
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

foreach ($service in @('backend', 'web')) {
    $port = if ($service -eq 'backend') { 8080 } else { 3000 }
    $stateFile = Join-Path $runtimeDir "$service.json"
    if (Test-Path -LiteralPath $stateFile) {
        $state = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
        $worker = Get-CimInstance Win32_Process -Filter "ProcessId=$($state.workerPid)"
        if ($worker -and $worker.CommandLine.Contains($workerScript) -and $worker.CommandLine.Contains("-Service $service")) {
            Write-Host "$service worker already running"
            continue
        }
    }
    $listener = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
    if ($listener) {
        throw "Port $port is occupied by a process not managed by this launcher."
    }
    $tool = if ($service -eq 'backend') { $go } else { $bun }
    $command = '"{0}" -NoProfile -WindowStyle Hidden -File "{1}" -Service {2} -ToolPath "{3}" -NodePath "{4}"' -f $shell, $workerScript, $service, $tool, $node
    # WMI creates an independent Windows process outside the calling terminal's job.
    $result = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $command; CurrentDirectory = $repoRoot }
    if ($result.ReturnValue -ne 0) { throw "Unable to create $service worker: $($result.ReturnValue)" }
    @{ service = $service; workerPid = $result.ProcessId; startedAt = (Get-Date -Format o) } |
        ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runtimeDir "$service.json") -Encoding UTF8
    Write-Host "Started independent $service worker: $($result.ProcessId)"
}

$deadline = (Get-Date).AddMinutes(2)
do {
    try {
        $response = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/api/health/ready' -UseBasicParsing -TimeoutSec 3
        if ($response.StatusCode -eq 200) {
            Write-Host 'Ready: http://localhost:3000/'
            Write-Host "Logs: $(Join-Path $repoRoot '.local\logs\dev-background')"
            return
        }
    } catch { }
    Start-Sleep -Seconds 1
} while ((Get-Date) -lt $deadline)
throw 'Startup timed out. Inspect .local/logs/dev-background/*.log for the failure.'
