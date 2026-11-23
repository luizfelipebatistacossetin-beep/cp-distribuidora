# Mostra a tela e a janela do Noturno (para calibrar o robo do Recover)
Add-Type -AssemblyName System.Windows.Forms, UIAutomationClient, UIAutomationTypes
$A = [System.Windows.Automation.AutomationElement]
$s = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
"TELA: $($s.Width) x $($s.Height)"
$p = Get-Process NOTURNO -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $p) { "NOTURNO NAO ENCONTRADO"; return }
$cond = New-Object System.Windows.Automation.PropertyCondition($A::ProcessIdProperty, $p.Id)
$jan = $A::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children, $cond)
foreach ($w in $jan) {
  $r = $w.Current.BoundingRectangle
  "JANELA '$($w.Current.Name)' @ $($r.X),$($r.Y) $($r.Width)x$($r.Height)"
}
$main = $jan | Sort-Object { $_.Current.BoundingRectangle.Width * $_.Current.BoundingRectangle.Height } -Descending | Select-Object -First 1
$all = $main.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
"ELEMENTOS NA PRINCIPAL: $($all.Count)"
$all | Where-Object { $_.Current.Name -match '^(Sistema|Diversos|Recover|Estoque|Vendas)' } | Select-Object -First 12 | ForEach-Object {
  $b = $_.Current.BoundingRectangle
  "  [$($_.Current.ControlType.ProgrammaticName)] '$($_.Current.Name)' @ $($b.X),$($b.Y) $($b.Width)x$($b.Height)"
}
