# ops/status-keto-balance.ps1
# Проверка текущего статуса работы Keto Balance Home Pilot
param(
    [string]$Mode
)

$ErrorActionPreference = "Stop"
$ROOT = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $ROOT

$PYTHON = Join-Path $ROOT ".venv-p0\Scripts\python.exe"
if (-not (Test-Path $PYTHON)) {
    $PYTHON = (Get-Command python.exe).Source
}

$argsList = @("scripts/home_pilot.py", "status")
if ($Mode) {
    $argsList += @("--mode", $Mode)
}

& $PYTHON @argsList
exit $LASTEXITCODE
