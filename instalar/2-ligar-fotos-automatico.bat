@echo off
chcp 65001 >nul
REM Precisa ser aberto com o botao direito > "Executar como administrador"
net session >nul 2>&1
if errorlevel 1 (
  echo.
  echo ERRO: abra este arquivo com o botao direito ^> "Executar como administrador".
  echo.
  pause
  exit /b 1
)
echo Criando a tarefa "PonteCPFotos" para ligar junto com o Windows...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$a = New-ScheduledTaskAction -Execute 'C:\Program Files\nodejs\node.exe' -Argument 'ponte.js fotos' -WorkingDirectory 'C:\PonteCPFotos'; $t = New-ScheduledTaskTrigger -AtStartup; $s = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable; Register-ScheduledTask -TaskName 'PonteCPFotos' -Action $a -Trigger $t -Settings $s -User 'SYSTEM' -RunLevel Highest -Force | Out-Null; Start-ScheduledTask -TaskName 'PonteCPFotos'; Write-Host ''; Write-Host 'PRONTO! As fotos deste computador vao para o site sozinhas, a cada 5 minutos.'"
echo.
pause
