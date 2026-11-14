# ops/agent-ctl.ps1 — Единая точка запуска Agent-First инфраструктуры
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ArgsList
)

$ErrorActionPreference = "Stop"
$ROOT = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $ROOT

$PYTHON = Join-Path $ROOT ".venv-p0\Scripts\python.exe"
if (-not (Test-Path $PYTHON)) {
    $PYTHON = (Get-Command python.exe).Source
}

& $PYTHON (Join-Path $ROOT "scripts\agent_ops.py") @ArgsList
exit $LASTEXITCODE
