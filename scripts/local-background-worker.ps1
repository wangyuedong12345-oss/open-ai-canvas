[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateSet('backend', 'web')][string]$Service,
    [Parameter(Mandatory)][string]$ToolPath,
    [Parameter(Mandatory)][string]$NodePath
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runtimeDir = Join-Path $repoRoot '.local\run\dev-background'
$logDir = Join-Path $repoRoot '.local\logs\dev-background'
New-Item -ItemType Directory -Force -Path $runtimeDir, $logDir | Out-Null
$workerLog = Join-Path $logDir "$Service.worker.log"
$runStamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$stdoutLog = Join-Path $logDir "$Service-$runStamp.stdout.log"
$stderrLog = Join-Path $logDir "$Service-$runStamp.stderr.log"

try {
    $env:Path = "$(Split-Path $ToolPath);$(Split-Path $NodePath);$env:Path"
    if ($Service -eq 'backend') {
        $workDir = Join-Path $repoRoot 'backend'
        $env:CANVAS_BACKEND_ADDR = '127.0.0.1:8080'
        $env:CANVAS_BACKEND_DATA_DIR = Join-Path $repoRoot '.local\project-workbench-debug'
        $env:CGO_ENABLED = '1'
        $env:GIN_MODE = 'release'
        if (-not $env:CC) {
            $compiler = Get-Command gcc.exe -ErrorAction SilentlyContinue
            if ($compiler) {
                $env:CC = $compiler.Source
            } else {
                $zig = Get-ChildItem (Join-Path $repoRoot '.local\cache\toolchains\zig-*\zig.exe') -ErrorAction SilentlyContinue | Select-Object -First 1
                if (-not $zig) { throw 'SQLite development requires a C compiler (gcc or the cached Zig toolchain).' }
                $env:CC = '"' + $zig.FullName.Replace('\', '/') + '" cc'
                $env:ZIG_GLOBAL_CACHE_DIR = Join-Path $repoRoot '.local\cache\zig'
            }
        }
        $arguments = @('run', './cmd/server')
    } else {
        $workDir = Join-Path $repoRoot 'web'
        $env:VITE_API_PROXY_TARGET = 'http://127.0.0.1:8080'
        $arguments = @('run', 'dev', '--strictPort')
    }

    Add-Content -LiteralPath $workerLog -Value "$(Get-Date -Format o) starting $Service, worker=$PID"
    $child = Start-Process -FilePath $ToolPath -ArgumentList $arguments -WorkingDirectory $workDir -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $stdoutLog `
        -RedirectStandardError $stderrLog
    @{ service = $Service; workerPid = $PID; servicePid = $child.Id; startedAt = (Get-Date -Format o); stdoutLog = $stdoutLog; stderrLog = $stderrLog } |
        ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runtimeDir "$Service.json") -Encoding UTF8
    $child.WaitForExit()
    Add-Content -LiteralPath $workerLog -Value "$(Get-Date -Format o) exited, code=$($child.ExitCode)"
    exit $child.ExitCode
} catch {
    Add-Content -LiteralPath $workerLog -Value "$(Get-Date -Format o) ERROR: $($_.Exception.Message)"
    exit 1
}
