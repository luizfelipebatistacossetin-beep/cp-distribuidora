# ROBO DO RECOVER IMAGE - roda no PC do Wender em horarios fixos.
# Abre Sistema > Diversos > Recover Image no Noturno e clica em Recover.
# A ponte de fotos (C:\PonteCPFotos) envia as fotos exportadas para o site.
$ErrorActionPreference = "Stop"
$LOG = "C:\PonteCPFotos\recover.log"
function Log($m) { $l = "[$(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')] $m"; Write-Host $l; Add-Content -Path $LOG -Value $l }

Add-Type -AssemblyName System.Windows.Forms, UIAutomationClient, UIAutomationTypes
Add-Type @"
using System; using System.Runtime.InteropServices;
public class W32 {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(int f, int x, int y, int d, int e);
  [DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, int f, int e);
  public static void Click(int x, int y) { SetCursorPos(x, y); System.Threading.Thread.Sleep(150); mouse_event(2,0,0,0,0); mouse_event(4,0,0,0,0); }
  public static void Key(byte k) { keybd_event(k,0,0,0); keybd_event(k,0,2,0); }
}
"@
$A = [System.Windows.Automation.AutomationElement]
$TS = [System.Windows.Automation.TreeScope]

function JanelasNoturno() {
  $p = Get-Process NOTURNO -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $p) { return @() }
  $c = New-Object System.Windows.Automation.PropertyCondition($A::ProcessIdProperty, $p.Id)
  return @($A::RootElement.FindAll($TS::Children, $c))
}

try {
  $jan = JanelasNoturno
  if (-not $jan.Count) { Log "Noturno fechado - nada feito."; exit 0 }
  $main = $jan | Sort-Object { $_.Current.BoundingRectangle.Width * $_.Current.BoundingRectangle.Height } -Descending | Select-Object -First 1
  $h = [IntPtr]$main.Current.NativeWindowHandle
  [W32]::ShowWindow($h, 3) | Out-Null          # maximiza
  [W32]::Key(0x12)                              # ALT (libera o foco)
  [W32]::SetForegroundWindow($h) | Out-Null
  Start-Sleep -Milliseconds 800

  # posicoes medidas com a janela maximizada em 1920x1080
  $sis = $main.FindFirst($TS::Descendants, (New-Object System.Windows.Automation.PropertyCondition($A::NameProperty, "Sistema")))
  if ($sis) { $r = $sis.Current.BoundingRectangle; [W32]::Click([int]($r.X + $r.Width/2), [int]($r.Y + $r.Height/2)) }
  else { [W32]::Click(28, 38) }
  Start-Sleep -Milliseconds 900
  [W32]::Click(97, 271)        # Diversos
  Start-Sleep -Milliseconds 900
  [W32]::Click(303, 313)       # Recover Image
  Start-Sleep -Milliseconds 400
  [W32]::Key(0x0D)             # Enter abre a tela
  Start-Sleep -Seconds 3

  $dlg = (JanelasNoturno) | Where-Object { $_.Current.Name -eq "Recover Image" } | Select-Object -First 1
  if (-not $dlg) { Log "ERRO: a tela Recover Image nao abriu."; [W32]::Key(0x1B); [W32]::Key(0x1B); exit 1 }
  $btn = $dlg.FindFirst($TS::Descendants, (New-Object System.Windows.Automation.PropertyCondition($A::NameProperty, "Recover")))
  if ($btn) { $r = $btn.Current.BoundingRectangle; [W32]::Click([int]($r.X + $r.Width/2), [int]($r.Y + $r.Height/2)) }
  else { $r = $dlg.Current.BoundingRectangle; [W32]::Click([int]($r.X + 48), [int]($r.Y + 154)) }
  Log "Recover iniciado."

  # espera terminar (a tela fecha sozinha)
  for ($i = 0; $i -lt 100; $i++) {
    Start-Sleep -Seconds 3
    if (-not ((JanelasNoturno) | Where-Object { $_.Current.Name -eq "Recover Image" })) { Log "Recover concluido."; exit 0 }
  }
  Log "Aviso: Recover demorou mais de 5 minutos."
} catch { Log "ERRO: $($_.Exception.Message)" ; exit 1 }
