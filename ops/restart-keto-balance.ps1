$ErrorActionPreference = 'SilentlyContinue'
# Restart Keto Balance cleanly: the scheduled task alone does NOT kill the detached
# python tree, so we stop the task, kill the whole tree, then start the task again.

$pat = 'home_pilot\.py|run_staging\.py|run_ssh_tunnel\.py'

Stop-ScheduledTask -TaskName 'KetoBalanceHomePilot'
Start-Sleep -Seconds 3

$sup = @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'home_pilot\.py' } | Sort-Object CreationDate)
Write-Output ('supervisor processes found: ' + $sup.Count)
if ($sup.Count -gt 0) {
    # taskkill /T kills the whole tree including detached children (ssh, staging)
    & taskkill.exe /F /T /PID $sup[0].ProcessId 2>&1 | Out-Null
    Write-Output ('killed tree of pid=' + $sup[0].ProcessId)
}
Start-Sleep -Seconds 4

# safety net: kill any remaining keto process
$left = @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match $pat -and $_.ProcessId -ne $PID })
foreach ($p in $left) { Stop-Process -Id $p.ProcessId -Force }
Start-Sleep -Seconds 2
$leftCount = @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match $pat -and $_.ProcessId -ne $PID }).Count
Write-Output ('left before start: ' + $leftCount)

Start-ScheduledTask -TaskName 'KetoBalanceHomePilot'
Write-Output 'task started'
