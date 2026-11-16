@echo off
chcp 65001 >nul
cd /d "%~dp0"
"C:\Program Files\nodejs\node.exe" ponte.js fotos-uma-vez
echo.
echo Tire um print desta tela e mande para o Claude.
pause
