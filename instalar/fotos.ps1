# Instala a ponte de FOTOS da CP neste computador (rodar no PowerShell como administrador)
$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$base = "https://cpdistribuidorapa.com.br/instalar"
$pasta = "C:\PonteCPFotos"
$node = "C:\Program Files\nodejs\node.exe"

if (-not (Test-Path $node)) {
  Write-Host "Instalando o Node.js (pode levar 1-2 minutos)..."
  $v = (Invoke-RestMethod "https://nodejs.org/dist/index.json" | Where-Object { $_.lts } | Select-Object -First 1).version
  $msi = "$env:TEMP\node-$v-x64.msi"
  Invoke-WebRequest "https://nodejs.org/dist/$v/node-$v-x64.msi" -OutFile $msi -UseBasicParsing
  Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /qn /norestart" -Wait
}
if (-not (Test-Path $node)) { Write-Host "ERRO: o Node.js nao instalou." -ForegroundColor Red; return }
Write-Host "Node.js OK."

New-Item -ItemType Directory -Force -Path $pasta | Out-Null
foreach ($f in "ponte.js","1-enviar-fotos-uma-vez.bat","2-ligar-fotos-automatico.bat","desligar-fotos.bat") {
  Invoke-WebRequest "$base/$f" -OutFile (Join-Path $pasta $f) -UseBasicParsing
}
$cfg = Join-Path $pasta "config.txt"
if (-not (Test-Path $cfg)) {
@"
SUPABASE_URL=https://twuanfncbxidvpixkfez.supabase.co
SUPABASE_SECRET_KEY=COLE_A_SECRET_KEY_AQUI
PASTA_FOTOS=C:\NoturnoSysUtils\Photos
DIAS_INICIO=15
MINUTOS=5
"@ | Set-Content -Path $cfg -Encoding ASCII
}
Write-Host ""
Write-Host "Arquivos em $pasta. Agora cole a chave no config.txt que vai abrir e salve (Ctrl+S)." -ForegroundColor Green
Start-Process notepad.exe $cfg
