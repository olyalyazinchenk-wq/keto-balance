# ops/setup-home-pilot-task.ps1
# Настройка задачи Планировщика Windows для надёжного автозапуска Home Pilot (Кето Баланс)
# Создаёт задачу с триггером при входе пользователя, автовосстановлением при сбоях
# и делегированием запуска в ops/start-keto-balance.ps1 без создания дублирующих слушателей.

[CmdletBinding()]
param(
    [string]$TaskName = "KetoBalanceHomePilot",
    [switch]$Remove,
    [switch]$Status,
    [switch]$RunNow
)

$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$startScript = Join-Path $projectRoot "ops\start-keto-balance.ps1"
$statusScript = Join-Path $projectRoot "ops\status-keto-balance.ps1"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   Keto Balance — Настройка автозапуска Home Pilot        " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Каталог проекта: $projectRoot" -ForegroundColor Gray
Write-Host "Имя задачи:      $TaskName" -ForegroundColor Gray

# 1. Режим отображения статуса
if ($Status) {
    Write-Host "`nПроверка статуса задачи '$TaskName'..." -ForegroundColor Yellow
    $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Host "Статус задачи в Windows: $($existing.State)" -ForegroundColor Green
        $existing | Format-List TaskName, State, Triggers, Actions
        if (Test-Path $statusScript) {
            Write-Host "`nПроверка runtime-статуса сервисов:" -ForegroundColor Yellow
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $statusScript
        }
    } else {
        Write-Host "Задача '$TaskName' не найдена в Планировщике Windows." -ForegroundColor Yellow
    }
    return
}

# 2. Режим удаления задачи
if ($Remove) {
    Write-Host "`nУдаление задачи '$TaskName'..." -ForegroundColor Yellow
    $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($existing) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "Задача '$TaskName' успешно удалена из Планировщика." -ForegroundColor Green
    } else {
        Write-Host "Задача '$TaskName' не была зарегистрирована." -ForegroundColor Gray
    }
    return
}

# 3. Проверка наличия стартового скрипта
if (-not (Test-Path $startScript)) {
    Write-Error "Не найден стартовый скрипт: $startScript"
    return
}

# 4. Формирование действия (Action)
# Запуск скрытого процесса powershell.exe с вызовом ops/start-keto-balance.ps1
$actionArgs = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$startScript`" -Background"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $actionArgs -WorkingDirectory $projectRoot

# 5. Формирование триггера (Trigger: при входе текущего пользователя в систему)
$currentUser = if ($env:USERDOMAIN -and $env:USERNAME) { "$env:USERDOMAIN\$env:USERNAME" } else { $env:USERNAME }
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser

# 6. Формирование параметров надежности (Settings)
# - Перезапуск при сбое до 5 раз с интервалом 1 минута (auto-recovery)
# - Игнорирование повторных запусков (MultipleInstances: IgnoreNew - защита от дублей)
# - Без ограничения времени работы (ExecutionTimeLimit: 0)
# - Работа при питании от батареи (для ноутбуков)
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -RestartCount 5 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Days 0) `
    -MultipleInstances IgnoreNew

# 7. Формирование принципала безопасности (Principal)
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive

# 8. Регистрация или обновление задачи
Write-Host "`nРегистрация задачи в Планировщике Windows..." -ForegroundColor Yellow
$registeredTask = Register-ScheduledTask `
    -TaskName $TaskName `
    -Description "Keto Balance Home Pilot background supervisor (isolated staging 18081 & tunnel)" `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Force

Write-Host "Задача '$TaskName' успешно зарегистрирована!" -ForegroundColor Green
Write-Host "  Состояние:     $($registeredTask.State)" -ForegroundColor Gray
Write-Host "  Триггер:       При входе пользователя $currentUser" -ForegroundColor Gray
Write-Host "  Автовосстановление: 5 попыток с интервалом 1 мин при сбоях" -ForegroundColor Gray
Write-Host "  Защита дублей: MultipleInstances = IgnoreNew" -ForegroundColor Gray

# 9. Запуск по требованию при ключе -RunNow
if ($RunNow) {
    Write-Host "`nЗапуск задачи '$TaskName' прямо сейчас..." -ForegroundColor Yellow
    Start-ScheduledTask -TaskName $TaskName
    Start-Sleep -Seconds 2
    $state = (Get-ScheduledTask -TaskName $TaskName).State
    Write-Host "Текущее состояние задачи: $state" -ForegroundColor Green
}

Write-Host "`nНастройка завершена. Для проверки выполните: powershell -File ops/setup-home-pilot-task.ps1 -Status" -ForegroundColor Cyan
