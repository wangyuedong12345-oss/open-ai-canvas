[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$workerScript = Join-Path $PSScriptRoot 'local-background-worker.ps1'
$runtimeDir = Join-Path $repoRoot '.local\run\dev-background'

foreach ($service in @('web', 'backend')) {
    $stateFile = Join-Path $runtimeDir "$service.json"
    if (-not (Test-Path -LiteralPath $stateFile)) { continue }
    $state = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
    $worker = Get-CimInstance Win32_Process -Filter "ProcessId=$($state.workerPid)"
    if (-not $worker) { Write-Host "$service is already stopped"; continue }
    if (-not $worker.CommandLine.Contains($workerScript) -or -not $worker.CommandLine.Contains("-Service $service")) {
        throw "Recorded PID for $service belongs to another process; refusing to stop it."
    }
    Add-Content -LiteralPath (Join-Path $repoRoot ".local\logs\dev-background\$service.worker.log") -Value "$(Get-Date -Format o) stop requested, worker=$($state.workerPid)"
    & taskkill.exe /PID $state.workerPid /T /F
    $port = if ($service -eq 'backend') { 8080 } else { 3000 }
    $deadline = (Get-Date).AddSeconds(5)
    do {
        $remainingWorker = Get-CimInstance Win32_Process -Filter "ProcessId=$($state.workerPid)"
        $listener = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
        if (-not $remainingWorker -and -not $listener) { break }
        Start-Sleep -Milliseconds 200
    } while ((Get-Date) -lt $deadline)
    if ($remainingWorker -or $listener) { throw "Failed to fully stop $service; inspect its log and port $port." }
    Write-Host "Stopped $service"
}
