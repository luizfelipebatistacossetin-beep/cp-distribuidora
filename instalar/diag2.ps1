# Mostra as fotos de alguns produtos nesta maquina (so le)
$ids = if ($ids) { $ids } else { 132,126,151,160,157 }
$f = "C:\NoturnoSysUtils\Photos"
Write-Host "==== $env:COMPUTERNAME ====" -ForegroundColor Cyan
foreach ($i in $ids) {
  Get-ChildItem $f -File | ? { $_.BaseName -match "^PRODUTO_$i\d?$" } | Sort-Object Name | % {
    $h = (Get-FileHash $_.FullName -Algorithm MD5).Hash.Substring(0,8)
    "{0,-18} criado {1:dd/MM HH:mm} mod {2:dd/MM HH:mm} {3,6}KB {4}" -f $_.Name, $_.CreationTime, $_.LastWriteTime, [int]($_.Length/1kb), $h
  }
}
