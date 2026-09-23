<#
    push.ps1 —— 把你本地的改动存一笔账，并推到 GitHub 私有仓库备份。

    它会同时处理两个仓库：
      C:\Users\28041\vrcx-fork   代码（当前分支）
      C:\Users\28041\vrcx-mod    维护脚本和指南

    用法：
        .\push.ps1                      有改动时会让你输入一句说明
        .\push.ps1 -Message "修了XX"    直接指定说明
        .\push.ps1 -OnlyCode            只推代码
        .\push.ps1 -OnlyMod             只推脚本
#>
[CmdletBinding()]
param(
    [string]$Message,
    [switch]$OnlyCode,
    [switch]$OnlyMod
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\config.ps1"
$Cfg = $script:VrcxMod

function Invoke-GitAt([string]$Path) {
    $eap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $out = & git.exe -C $Path $args 2>&1 | ForEach-Object { "$_" }
    $code = $LASTEXITCODE
    $ErrorActionPreference = $eap
    $out
}

function Push-One([string]$Path, [string]$Label) {
    Write-Host "`n── $Label  ($Path)" -ForegroundColor Cyan

    if (-not (Test-Path (Join-Path $Path '.git'))) { Write-Host "   不是 git 仓库，跳过" -ForegroundColor Yellow; return }

    $branch = (Invoke-GitAt $Path rev-parse --abbrev-ref HEAD).Trim()
    $dirty = @(Invoke-GitAt $Path status --porcelain)

    if ($dirty.Count -gt 0) {
        Write-Host "   有 $($dirty.Count) 处未保存改动：" -ForegroundColor Yellow
        $dirty | Select-Object -First 12 | ForEach-Object { Write-Host "     $_" }
        if ($dirty.Count -gt 12) { Write-Host "     …还有 $($dirty.Count - 12) 个文件" }

        $msg = $Message
        if (-not $msg) {
            Write-Host ''
            $msg = Read-Host "   给这次保存写一句说明（回车取消，不提交）"
        }
        if (-not $msg) { Write-Host '   跳过提交，改动仍留在本地' -ForegroundColor Yellow; return }

        Invoke-GitAt $Path add -A | Out-Null
        Invoke-GitAt $Path commit -m $msg | Out-Null
        if ($LASTEXITCODE -ne 0) { Write-Host '   提交失败，看上面的提示' -ForegroundColor Red; return }
        Write-Host "   已提交：$msg" -ForegroundColor Green
    }
    else {
        Write-Host '   没有未保存改动' -ForegroundColor DarkGray
    }

    Write-Host "   推送 $branch → origin ..."
    $result = Invoke-GitAt $Path push origin $branch
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   [OK] 已推到 GitHub" -ForegroundColor Green
    }
    else {
        Write-Host '   [x] 推送失败：' -ForegroundColor Red
        $result | ForEach-Object { Write-Host "       $_" }
        Write-Host '       常见原因：没开梯子但用了 https 地址 / 密钥被删了 / 远端有别人推的新提交' -ForegroundColor Yellow
        Write-Host '       自检： ssh -T git@github.com  应该回 "Hi W4nN1ng! You'"'"'ve successfully authenticated"' -ForegroundColor Yellow
    }
}

Write-Host "`nVRCX 改版 → GitHub 备份" -ForegroundColor Cyan

if (-not $OnlyMod) { Push-One $Cfg.Repo '代码' }
if (-not $OnlyCode) { Push-One $PSScriptRoot '维护脚本' }

Write-Host "`n完成。网页上看： https://github.com/W4nN1ng/VRCX-sweetCandy/branches" -ForegroundColor Cyan
