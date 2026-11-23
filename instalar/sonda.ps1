# Mostra a tela e a janela do Noturno (para calibrar o robo do Recover)
Add-Type -AssemblyName System.Windows.Forms, UIAutomationClient, UIAutomationTypes
$s = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
"TELA: $($s.Width) x $($s.Height)"
$p = Get-Process | Where-Object { $_.MainWindowTitle -like '*NOTURNO*' } | Select-Object -First 1
if (-not $p) { "NOTURNO NAO ENCONTRADO"; return }
"PROCESSO: $($p.ProcessName)  JANELA: $($p.MainWindowTitle)"
$w = [System.Windows.Automation.AutomationElement]::FromHandle($p.MainWindowHandle)
$r = $w.Current.BoundingRectangle
"RECT: $($r.X),$($r.Y) $($r.Width)x$($r.Height)"
$all = $w.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
"ELEMENTOS: $($all.Count)"
$all | Where-Object { $_.Current.Name -match 'Sistema|Diversos|Recover|Estoque' } | Select-Object -First 15 | ForEach-Object {
  $b = $_.Current.BoundingRectangle
  "  [$($_.Current.ControlType.ProgrammaticName)] '$($_.Current.Name)' @ $($b.X),$($b.Y) $($b.Width)x$($b.Height)"
}
