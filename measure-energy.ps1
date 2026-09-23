Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
    [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
}
"@

function Get-Mem([string]$label) {
    $ps = @(Get-Process VRCX-Candy -ErrorAction SilentlyContinue)
    if ($ps.Count -eq 0) { Write-Output "$label : NO PROCESS"; return }
    $total = [math]::Round(($ps | Measure-Object WorkingSet64 -Sum).Sum / 1MB)
    $gpu = 0
    $rend = 0
    foreach ($p in $ps) {
        $cl = (Get-CimInstance Win32_Process -Filter "ProcessId=$($p.Id)").CommandLine
        if ($cl -match '--type=gpu-process') { $gpu += [math]::Round($p.WorkingSet64 / 1MB) }
        if ($cl -match '--type=renderer') { $rend += [math]::Round($p.WorkingSet64 / 1MB) }
    }
    $cpu = [math]::Round(($ps | Measure-Object CPU -Sum).Sum, 1)
    Write-Output ("{0} : procs={1} totalWS={2}MB gpu={3}MB renderer={4}MB cpuSeconds={5}" -f $label, $ps.Count, $total, $gpu, $rend, $cpu)
}

$exe = 'C:\Users\28041\vrcx-fork\build\Cef\VRCX-Candy.exe'
Start-Process -FilePath $exe -WorkingDirectory 'C:\Users\28041\vrcx-fork\build\Cef'
Write-Output "launched, waiting 100s to reach steady state..."
Start-Sleep -Seconds 100
Get-Mem "VISIBLE-STABLE"

$main = @(Get-Process VRCX-Candy -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 })
if ($main.Count -eq 0) { Write-Output "no main window found"; exit 1 }
Write-Output ("minimizing pid={0}" -f $main[0].Id)
[void][Win32]::ShowWindowAsync($main[0].MainWindowHandle, 6)
Write-Output "waiting 25s (3s debounce + settle)..."
Start-Sleep -Seconds 25
Get-Mem "MINIMIZED"

Write-Output "restoring..."
[void][Win32]::ShowWindowAsync($main[0].MainWindowHandle, 9)
Start-Sleep -Seconds 8
Get-Mem "RESTORED "
Write-Output "done"
