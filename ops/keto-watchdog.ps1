$ErrorActionPreference = 'SilentlyContinue'
# Keto Balance watchdog: silent when healthy, restarts the scheduled task after 2 consecutive failures.
$root = 'C:\Users\HP\Keto-balance'
$urlFile = Join-Path $root 'current_tunnel_url.txt'
$logDir = Join-Path $root 'logs'
$log = Join-Path $logDir 'watchdog.log'
$counter = Join-Path $logDir 'watchdog_fails.txt'
$stamp = Get-Date -Format 'dd.MM.yyyy HH:mm'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

# --- Бот: getMe отвечает и без запущенного процесса, поэтому живость проверяем по процессу опроса ---
# venv\Scripts\python.exe - это лаунчер: он порождает дочерний python с тем же cmdline, поэтому
# считаем только корневые процессы (у которых родитель не входит в найденный набор).
function Get-BotRoots {
    # Только сам процесс бота: python + строка запуска, оканчивающаяся на "-m bot.bot".
    # Иначе фильтр ловит оболочки, в тексте команды которых есть "bot.bot".
    $all = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
        $_.Name -like 'python*' -and $_.CommandLine -match '-m\s+bot\.bot\s*$'
    })
    if ($all.Count -eq 0) { return @() }
    $ids = @($all | ForEach-Object { $_.ProcessId })
    return @($all | Where-Object { $ids -notcontains $_.ParentProcessId })
}

$botRoots = @(Get-BotRoots)
if ($botRoots.Count -gt 1) {
    $keep = ($botRoots | Sort-Object CreationDate | Select-Object -First 1).ProcessId
    foreach ($p in $botRoots) {
        if ($p.ProcessId -ne $keep) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
    }
    Add-Content -Path $log -Value ("[$stamp] BOT: duplicate pollers stopped, kept pid=$keep")
    $botRoots = @($botRoots | Where-Object { $_.ProcessId -eq $keep })
}
if ($botRoots.Count -eq 0) {
    $py = Join-Path $root '.venv-p0\Scripts\python.exe'
    if (-not (Test-Path $py)) { $py = 'python.exe' }
    Start-Process -FilePath $py -ArgumentList '-B', '-m', 'bot.bot' -WorkingDirectory $root -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logDir 'bot_run.log') -RedirectStandardError (Join-Path $logDir 'bot_run_err.log')
    Start-Sleep -Seconds 6
    $botRoots = @(Get-BotRoots)
    if ($botRoots.Count -gt 0) {
        Add-Content -Path $log -Value ("[$stamp] BOT: polling process missing - started (pid=" + (($botRoots | Select-Object -First 1).ProcessId) + ")")
    } else {
        $tail = ''
        if (Test-Path (Join-Path $logDir 'bot_run_err.log')) {
            $tail = ((Get-Content (Join-Path $logDir 'bot_run_err.log') -Tail 3) -join ' | ')
        }
        Add-Content -Path $log -Value ("[$stamp] BOT: start FAILED - $tail")
    }
}

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

# --- Telegram: доступен ли API с этого ПК и не мешает ли вебхук ---
$botOk = $false
$webhookUrl = ''
$token = ''
$envFile = Join-Path $root '.env'
if (Test-Path $envFile) {
    foreach ($line in Get-Content $envFile) {
        if ($line -match '^(KETO_BOT_TOKEN|TELEGRAM_BOT_TOKEN)=(.*)$') {
            $token = $Matches[2].Trim().Trim('"').Trim("'")
            break
        }
    }
}
if ($token) {
    $px = @{ Proxy = 'http://127.0.0.1:10809' }
    try {
        $me = Invoke-RestMethod -Uri ('https://api.telegram.org/bot' + $token + '/getMe') -TimeoutSec 15 @px -ErrorAction Stop
        $botOk = [bool]$me.ok
    } catch {
        try {
            $me = Invoke-RestMethod -Uri ('https://api.telegram.org/bot' + $token + '/getMe') -TimeoutSec 15 -ErrorAction Stop
            $botOk = [bool]$me.ok
        } catch { $botOk = $false }
    }
    if ($botOk) {
        try {
            $wh = Invoke-RestMethod -Uri ('https://api.telegram.org/bot' + $token + '/getWebhookInfo') -TimeoutSec 15 @px -ErrorAction Stop
            $webhookUrl = [string]$wh.result.url
        } catch { }
    }
}

# Вебхук в режиме опроса ломает приём сообщений — перезапуск тут не поможет, только сообщаем.
if ($webhookUrl) {
    Add-Content -Path $log -Value ("[$stamp] WARNING: установлен вебхук '$webhookUrl' — бот не сможет принимать сообщения (нужен deleteWebhook)")
    exit 1
}

if ($localOk -and $publicOk -and $botOk) {
    if (Test-Path $counter) { Remove-Item $counter -Force }
    exit 0
}

$fails = 0
if (Test-Path $counter) { [void][int]::TryParse((Get-Content $counter -Raw).Trim(), [ref]$fails) }
$fails++
Set-Content -Path $counter -Value $fails -Encoding ASCII
Add-Content -Path $log -Value ("[$stamp] fail #$fails local=$localOk public=$publicOk bot=$botOk url=$url")

if ($fails -lt 2) { exit 0 }

Add-Content -Path $log -Value ("[$stamp] RESTART: local=$localOk public=$publicOk url=$url")
Set-Content -Path $counter -Value 0 -Encoding ASCII
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'ops\restart-keto-balance.ps1') | Out-Null
Add-Content -Path $log -Value ("[$stamp] full restart executed (tree killed)")