$ErrorActionPreference = 'SilentlyContinue'
# Keto Balance watchdog: silent when healthy, restarts the scheduled task after 2 consecutive failures.
$root = 'C:\Users\HP\Keto-balance'
$urlFile = Join-Path $root 'current_tunnel_url.txt'
$logDir = Join-Path $root 'logs'
$log = Join-Path $logDir 'watchdog.log'
$counter = Join-Path $logDir 'watchdog_fails.txt'
$stamp = Get-Date -Format 'dd.MM.yyyy HH:mm'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$localOk = $false
$publicOk = $false
try {
    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:18081/api/version' -TimeoutSec 8 -UseBasicParsing
    $localOk = ($r.StatusCode -eq 200)
} catch { }

$url = ''
if (Test-Path $urlFile) { $url = (Get-Content $urlFile -Raw).Trim() }
if ($url -like 'https://*') {
    try {
        $r2 = Invoke-WebRequest -Uri ($url + '/api/version') -TimeoutSec 20 -UseBasicParsing
        $publicOk = ($r2.StatusCode -eq 200)
    } catch { }
}

if ($localOk -and $publicOk) {
    if (Test-Path $counter) { Remove-Item $counter -Force }
    exit 0
}

$fails = 0
if (Test-Path $counter) { [void][int]::TryParse((Get-Content $counter -Raw).Trim(), [ref]$fails) }
$fails++
Set-Content -Path $counter -Value $fails -Encoding ASCII
Add-Content -Path $log -Value ("[$stamp] fail #$fails local=$localOk public=$publicOk url=$url")

if ($fails -lt 2) { exit 0 }

Add-Content -Path $log -Value ("[$stamp] RESTART: local=$localOk public=$publicOk url=$url")
Set-Content -Path $counter -Value 0 -Encoding ASCII
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'ops\restart-keto-balance.ps1') | Out-Null
Add-Content -Path $log -Value ("[$stamp] full restart executed (tree killed)")