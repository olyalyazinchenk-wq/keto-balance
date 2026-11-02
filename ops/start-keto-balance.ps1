# ops/start-keto-balance.ps1
# Единый надежный скрипт запуска Keto Balance на домашнем ПК (порт 18081)
param(
    [switch]$NoTunnel,
    [switch]$Background,
    [string]$Receipt
)

$ErrorActionPreference = "Stop"
$ROOT = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $ROOT

# --- single instance guard: atomic mutex + process check (added 2026-11-02) ---
$mutex = New-Object System.Threading.Mutex($false, 'Global\KetoBalanceHomePilot')
$gotLock = $false
try { $gotLock = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $gotLock = $true }
if (-not $gotLock) {
    Write-Host "[GUARD] Another supervisor instance holds the lock - exiting." -ForegroundColor Yellow
    exit 0
}
$existingSup = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -like '*home_pilot.py*supervisor*' -and $_.ProcessId -ne $PID
})
if ($existingSup.Count -gt 0) {
    $pids = ($existingSup | ForEach-Object { $_.ProcessId }) -join ','
    Write-Host "[GUARD] Supervisor already running (pid=$pids) - skipping duplicate start." -ForegroundColor Yellow
    exit 0
}

$PYTHON = Join-Path $ROOT ".venv-p0\Scripts\python.exe"
if (-not (Test-Path $PYTHON)) {
    $PYTHON = (Get-Command python.exe).Source
}

Write-Host "=== Запуск Keto Balance Home Pilot (порт 18081) ===" -ForegroundColor Cyan
Write-Host "Python: $PYTHON"

$action = if ($Background) { "supervisor" } else { "start" }
$argsList = @("scripts/home_pilot.py", $action)
if ($NoTunnel) {
    $argsList += "--no-tunnel"
}
if ($Receipt) {
    $argsList += @("--receipt", $Receipt)
}

& $PYTHON @argsList
exit $LASTEXITCODE
