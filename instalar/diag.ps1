# Diagnostico rapido das pontes da CP (so le, nao muda nada)
$ErrorActionPreference = "SilentlyContinue"
Write-Host "==== $env:COMPUTERNAME  $(Get-Date) ====" -ForegroundColor Cyan
foreach ($t in "PonteCP","PonteCPFotos","RoboRecoverCP") {
  $x = Get-ScheduledTask $t
  if ($x) { $i = Get-ScheduledTaskInfo $t; Write-Host ("TAREFA {0}: {1} | ultima {2} (res {3}) | proxima {4}" -f $t, $x.State, $i.LastRunTime, $i.LastTaskResult, $i.NextRunTime) }
}
Write-Host ("NODE rodando: " + @(Get-Process node).Count)
foreach ($p in "C:\PonteCPFotos","C:\PonteCP") {
  if (Test-Path "$p\ponte.log") { Write-Host "--- $p\ponte.log" -ForegroundColor Yellow; Get-Content "$p\ponte.log" -Tail 6 }
  if (Test-Path "$p\config.txt") { Write-Host ("config: " + ((Get-Content "$p\config.txt") -notmatch "KEY" -join " | ")) }
}
if (Test-Path C:\PonteCPFotos\recover.log) { Write-Host "--- recover.log" -ForegroundColor Yellow; Get-Content C:\PonteCPFotos\recover.log -Tail 6 }
$f = "C:\NoturnoSysUtils\Photos"
if (Test-Path $f) {
  $all = Get-ChildItem $f -File
  Write-Host ("--- Photos: {0} arquivos, mexidos 24h: {1}, criados desde terca: {2}" -f $all.Count, @($all | ? { $_.LastWriteTime -gt (Get-Date).AddDays(-1) }).Count, @($all | ? { $_.CreationTime -gt (Get-Date).AddDays(-4) }).Count) -ForegroundColor Yellow
  $all | Sort-Object CreationTime -Descending | Select-Object -First 8 | % { "{0}  criado {1:dd/MM HH:mm}  mod {2:dd/MM HH:mm}  {3}KB" -f $_.Name, $_.CreationTime, $_.LastWriteTime, [int]($_.Length/1kb) }
}
