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
