# TESTE: cria uma foto "TESTE" para o produto $id, envia pelo caminho normal da ponte e apaga a copia local.
# Uso: $id=3214; iwr https://cpdistribuidorapa.com.br/instalar/teste-foto.ps1 -useb | iex
if (-not $id) { Write-Host "Defina `$id antes." -ForegroundColor Red; return }
Add-Type -AssemblyName System.Drawing
$arq = "C:\NoturnoSysUtils\Photos\PRODUTO_${id}0.jpg"
if (Test-Path $arq) { Write-Host "Ja existe $arq - escolha outro produto." -ForegroundColor Red; return }
$b = New-Object System.Drawing.Bitmap 800, 800
$g = [System.Drawing.Graphics]::FromImage($b)
$g.Clear([System.Drawing.Color]::FromArgb(255, 220, 0))
$f1 = New-Object System.Drawing.Font("Arial", 110, [System.Drawing.FontStyle]::Bold)
$f2 = New-Object System.Drawing.Font("Arial", 36, [System.Drawing.FontStyle]::Bold)
$fmt = New-Object System.Drawing.StringFormat; $fmt.Alignment = "Center"; $fmt.LineAlignment = "Center"
$g.DrawString("TESTE", $f1, [System.Drawing.Brushes]::Black, (New-Object System.Drawing.RectangleF(0, 150, 800, 300)), $fmt)
$g.DrawString("foto de teste do site`n$(Get-Date -Format 'dd/MM HH:mm')", $f2, [System.Drawing.Brushes]::Black, (New-Object System.Drawing.RectangleF(0, 430, 800, 200)), $fmt)
$b.Save($arq, [System.Drawing.Imaging.ImageFormat]::Jpeg); $g.Dispose(); $b.Dispose()
Push-Location C:\PonteCPFotos
& "C:\Program Files\nodejs\node.exe" ponte.js fotos-uma-vez
Pop-Location
Remove-Item $arq -Force
Write-Host "Foto de teste enviada (e apagada deste PC). Aparece no site em ate ~15 min." -ForegroundColor Green
