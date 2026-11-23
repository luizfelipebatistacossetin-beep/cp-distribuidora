# Instala o robo do Recover (rodar no PowerShell do usuario que usa o Noturno)
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path C:\PonteCPFotos | Out-Null
Invoke-WebRequest "https://cpdistribuidorapa.com.br/instalar/recover.ps1" -OutFile C:\PonteCPFotos\recover.ps1 -UseBasicParsing
$a = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File C:\PonteCPFotos\recover.ps1"
$t = @( (New-ScheduledTaskTrigger -Daily -At "11:15"), (New-ScheduledTaskTrigger -Daily -At "18:05") )
$u = (New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited)
$s = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName "RoboRecoverCP" -Action $a -Trigger $t -Principal $u -Settings $s -Force | Out-Null
Write-Host "PRONTO! Robo do Recover agendado para 11:15 e 18:05." -ForegroundColor Green
