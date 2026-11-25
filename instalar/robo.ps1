# Instala o robo do Recover (rodar no PowerShell do usuario que usa o Noturno)
# O robo sempre baixa a versao mais nova do site antes de rodar.
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path C:\PonteCPFotos | Out-Null
$l = @'
try { [Net.ServicePointManager]::SecurityProtocol = 'Tls12'; Invoke-WebRequest "https://cpdistribuidorapa.com.br/instalar/recover.ps1" -OutFile C:\PonteCPFotos\recover.ps1 -UseBasicParsing } catch {}
& C:\PonteCPFotos\recover.ps1
'@
Set-Content -Path C:\PonteCPFotos\robo-recover.ps1 -Value $l -Encoding ASCII
Invoke-WebRequest "https://cpdistribuidorapa.com.br/instalar/recover.ps1" -OutFile C:\PonteCPFotos\recover.ps1 -UseBasicParsing
$a = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File C:\PonteCPFotos\robo-recover.ps1"
$t = @( (New-ScheduledTaskTrigger -Daily -At "11:15"), (New-ScheduledTaskTrigger -Daily -At "18:05") )
$u = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
$s = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName "RoboRecoverCP" -Action $a -Trigger $t -Principal $u -Settings $s -Force | Out-Null
Write-Host "PRONTO! Robo do Recover agendado para 11:15 e 18:05." -ForegroundColor Green
