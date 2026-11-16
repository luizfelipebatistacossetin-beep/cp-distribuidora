@echo off
chcp 65001 >nul
REM Use so se precisar parar. Abrir como administrador.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Stop-ScheduledTask -TaskName 'PonteCPFotos' -ErrorAction SilentlyContinue; Unregister-ScheduledTask -TaskName 'PonteCPFotos' -Confirm:$false -ErrorAction SilentlyContinue; Write-Host 'Ponte de fotos desligada.'"
pause
