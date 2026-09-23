<#
    rollback.ps1 —— 把 VRCX 前端换回上一个版本（包括换回官方原版）。

    用法：
        .\rollback.ps1 -List        列出所有可回滚的备份
        .\rollback.ps1              回滚到最近一份备份
        .\rollback.ps1 -Name <名字>  回滚到指定备份

    备份来源有两处：
      E:\VRCX\html_backup\html_*        sync.ps1 每次部署前自动留的
      E:\VRCX\html_backup_20260923      第一次改造前手工留的官方原版
#>
[CmdletBinding()]
param(
    [switch]$List,
    [switch]$Stock,
    [string]$Name
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\config.ps1"
$Cfg = $script:VrcxMod
$InstallDir = $Cfg.InstallDir
$TargetHtml = Join-Path $InstallDir 'html'

function Fail([string]$Message) { Write-Host "`n[x] $Message" -ForegroundColor Red; exit 1 }

if (Get-Process -Name VRCX -ErrorAction SilentlyContinue) {
    Fail 'VRCX 正在运行，先完全退出（托盘图标也要关）'
}

# 收集所有候选备份
$Candidates = @()
$Nested = Join-Path $InstallDir 'html_backup'
if (Test-Path $Nested) {
    $Candidates += Get-ChildItem -LiteralPath $Nested -Directory | ForEach-Object {
        [pscustomobject]@{ Path = $_.FullName; Name = "html_backup\$($_.Name)"; Time = $_.CreationTime }
    }
}
$Candidates += Get-ChildItem -LiteralPath $InstallDir -Directory -Filter 'html_backup_*' | ForEach-Object {
    [pscustomobject]@{ Path = $_.FullName; Name = $_.Name; Time = $_.CreationTime }
}
$Candidates = $Candidates | Sort-Object Time -Descending

if (-not $Candidates.Count) { Fail "$InstallDir 下没有找到任何前端备份" }

if ($List) {
    Write-Host "`n可回滚的备份（按时间从新到旧）：`n"
    foreach ($c in $Candidates) {
        $stampPath = Join-Path $c.Path '.vrcx-mod-stamp'
        $source = if (Test-Path $stampPath) { Get-Content -LiteralPath $stampPath -Raw } else { '官方原版 / 未知来源' }
        Write-Host ("  {0,-34} {1}" -f $c.Name, $source)
    }
    Write-Host "`n回滚： .\rollback.ps1 -Name '上面某一列的名字'"
    exit 0
}

if ($Stock) {
    # 最早那份、没有 .vrcx-mod-stamp 标记的，就是官方原版
    $Pick = $Candidates | Where-Object { -not (Test-Path (Join-Path $_.Path '.vrcx-mod-stamp')) } |
        Sort-Object Time | Select-Object -Last 1
    if (-not $Pick) { Fail '没找到官方原版前端的备份' }
}
elseif ($Name) {
    $Pick = $Candidates | Where-Object { $_.Name -eq $Name } | Select-Object -First 1
    if (-not $Pick) { Fail "没有叫 '$Name' 的备份，先跑 .\rollback.ps1 -List" }
}
else {
    $Pick = $Candidates | Select-Object -First 1
}

if (Test-Path $TargetHtml) {
    $Retire = Join-Path $InstallDir ("html_replaced_{0}" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
    Move-Item -LiteralPath $TargetHtml -Destination $Retire
    Write-Host "当前前端移到 $Retire"
}

Move-Item -LiteralPath $Pick.Path -Destination $TargetHtml
Write-Host "`n[OK] 已回滚到：$($Pick.Name)" -ForegroundColor Green
Write-Host 'VRCX 下次启动就是这个版本的前端了。'
