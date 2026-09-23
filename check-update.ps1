<#
    check-update.ps1 —— 只读检查：官方是不是出新版了、你的分支跟不跟得上。
    不改任何东西，随时可以跑。

    用法：
        .\check-update.ps1
        .\check-update.ps1 -Quiet        只在有更新时输出（适合放计划任务）
#>
[CmdletBinding()]
param(
    [switch]$Quiet,
    [string]$Remote
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\config.ps1"
$Cfg = $script:VrcxMod
if (-not $Remote) { $Remote = $Cfg.Upstream }

# git 会把正常提示写到 stderr，配合 ErrorActionPreference=Stop 会被误判成异常，
# 所以这里临时降级，并且把 stderr 并进 stdout。
function Invoke-Git {
    $eap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $out = & git.exe -C $Cfg.Repo $args 2>&1 | ForEach-Object { "$_" }
    $code = $LASTEXITCODE
    $ErrorActionPreference = $eap
    $out
}

$Installed = (Get-Content -LiteralPath (Join-Path $Cfg.InstallDir 'Version') -Raw).Trim()

Invoke-Git fetch $Remote master | Out-Null
$Fetched = $LASTEXITCODE -eq 0

$UpstreamVer = $null
$Behind = '未知'
if ($Fetched) {
    $UpstreamVer = (Invoke-Git show "$Remote/master`:Version").Trim()
    $Base = (Invoke-Git merge-base $Cfg.Branch "$Remote/master").Trim()
    $Behind = [int](Invoke-Git rev-list --count "$Base..$Remote/master")
}

$Deployed = '未部署（当前是官方原版前端）'
$StampPath = Join-Path $Cfg.InstallDir 'html\.vrcx-mod-stamp'
if (Test-Path $StampPath) { $Deployed = (Get-Content -LiteralPath $StampPath -Raw).Trim() }

if ($Quiet -and ((-not $Fetched) -or ($UpstreamVer -eq $Installed))) { exit 0 }

Write-Host ''
Write-Host ("  已安装的 VRCX   : {0}" -f $Installed)
Write-Host ("  上游最新发布    : {0}" -f $(if ($Fetched) { $UpstreamVer } else { '拉取失败（镜像不通？）' }))
Write-Host ("  你的分支落后    : {0} 个提交" -f $Behind)
Write-Host ("  当前生效的前端  : {0}" -f $Deployed)
Write-Host ''

if ($Fetched -and $UpstreamVer -ne $Installed) {
    Write-Host '[!] 官方出了新版本，更新会覆盖你的前端。步骤：' -ForegroundColor Yellow
    Write-Host '    1) 先让 VRCX 正常更新完'
    Write-Host "    2) cd $PSScriptRoot; .\update.ps1"
}
elseif (-not $Fetched) {
    Write-Host "[!] 没能从 $Remote 拉到数据，有梯子可以试 .\check-update.ps1 -Remote upstream_github" -ForegroundColor Yellow
}
else {
    Write-Host '[OK] 分支和已安装版本一致，不用动。' -ForegroundColor Green
}
