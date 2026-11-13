param(
    [ValidateSet('check', 'snapshot', 'render')]
    [string]$Action = 'check',
    [string]$Output = ''
)

$ErrorActionPreference = 'Stop'
$videoNpmCli = Join-Path $env:LOCALAPPDATA 'hermes\tools\node-26.12.1-win32-x64\node_modules\npm\bin\npm-cli.js'
if (-not (Test-Path -LiteralPath $videoNpmCli)) {
    throw 'Не найден рабочий npm CLI. Укажите путь к npm-cli.js из установленного Node.js 22+ в run-video.ps1.'
}
$env:HYPERFRAMES_NO_TELEMETRY = '1'
$env:DO_NOT_TRACK = '1'
Push-Location $PSScriptRoot
try {
    if ($Action -eq 'check') {
        & node $videoNpmCli exec --yes --package=hyperframes@0.9.41 -- hyperframes check --samples 12 --at-transitions
    } elseif ($Action -eq 'snapshot') {
        & node $videoNpmCli exec --yes --package=hyperframes@0.9.41 -- hyperframes snapshot --at 0,3,6.2,9,12.2,15,18.2,21 --no-end
    } else {
        if (-not $Output) { $Output = Join-Path $PSScriptRoot 'renders\how-to-month-20261113.mp4' }
        & node $videoNpmCli exec --yes --package=hyperframes@0.9.41 -- hyperframes render --output $Output --fps 30 --quality high --workers 2 --strict
    }
    if ($LASTEXITCODE -ne 0) { throw "HyperFrames завершился с кодом $LASTEXITCODE" }
} finally {
    Pop-Location
}
