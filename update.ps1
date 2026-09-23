<#
    update.ps1 —— 官方 VRCX 出了新版本之后跑这个，把你的改动搬到新版上。

    四步：
      1. 从上游拉最新代码（默认走镜像；能直连 github 时用 -Remote upstream_github）
      2. 把功能分支 rebase 到新版 master
      3. 跑 lint + 构建，确认你的改动在新版上还是好的
      4. 调 sync.ps1 部署

    rebase 冲突时脚本会停下并保留冲突状态；不想处理就
        git -C C:\Users\28041\vrcx-fork rebase --abort
    完全退回。

    用法：
        .\update.ps1
        .\update.ps1 -DryRun                 只看会不会冲突，不动分支
        .\update.ps1 -Remote upstream_github 从官方源拉
        .\update.ps1 -NoSync                 只 rebase + 体检，不部署
#>
[CmdletBinding()]
param(
    [string]$Remote,
    [switch]$DryRun,
    [switch]$NoSync
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\config.ps1"
$Cfg = $script:VrcxMod
if (-not $Remote) { $Remote = $Cfg.Upstream }

$Repo = $Cfg.Repo
$Branch = $Cfg.Branch

# git 会把正常提示写到 stderr，配合 ErrorActionPreference=Stop 会被误判成异常，
# 所以这里临时降级，并且把 stderr 并进 stdout。
function Invoke-Git {
    $eap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $out = & git.exe -C $Repo $args 2>&1 | ForEach-Object { "$_" }
    $code = $LASTEXITCODE
    $ErrorActionPreference = $eap
    $out
}
function Fail([string]$Message) { Write-Host "`n[x] $Message" -ForegroundColor Red; exit 1 }

Write-Host "`n[1/4] 拉取 $Remote/master ..." -ForegroundColor Cyan
Invoke-Git fetch $Remote master
if ($LASTEXITCODE -ne 0) {
    Fail @"
拉取失败。镜像 $Remote 可能不可用，可以试：
  .\update.ps1 -Remote upstream_github     （需要能直连 github.com）
或者给 git 配好代理后再跑。
"@
}

$OldBase = (Invoke-Git merge-base $Branch "$Remote/master").Trim()
$NewHead = (Invoke-Git rev-parse --short "$Remote/master").Trim()
$UpVersion = (Invoke-Git show "$Remote/master`:Version").Trim()
$Ahead = [int](Invoke-Git rev-list --count "$OldBase..$Remote/master")
Write-Host "上游 $NewHead (VRCX $UpVersion)，比你的分支基点多 $Ahead 个提交" -ForegroundColor Green

Invoke-Git checkout $Branch | Out-Null

if ($DryRun) {
    Write-Host "`n[DryRun] 试探性 rebase ..." -ForegroundColor Cyan
    $tmp = "dryrun-$([DateTime]::Now.Ticks)"
    Invoke-Git branch $tmp | Out-Null
    Invoke-Git checkout $tmp | Out-Null
    $result = Invoke-Git rebase "$Remote/master"
    $code = $LASTEXITCODE
    Invoke-Git rebase --abort | Out-Null
    Invoke-Git checkout $Branch | Out-Null
    Invoke-Git branch -D $tmp | Out-Null
    if ($code -eq 0) {
        Write-Host '[OK] 不会冲突，直接跑不带 -DryRun 的 .\update.ps1 就行' -ForegroundColor Green
    }
    else {
        Write-Host '[!] 会冲突，涉及文件：' -ForegroundColor Yellow
        $result | Select-String -Pattern 'CONFLICT' | ForEach-Object { Write-Host "    $_" }
    }
    exit 0
}

Write-Host "`n[2/4] rebase $Branch 到 $Remote/master ..." -ForegroundColor Cyan
Invoke-Git rebase "$Remote/master"
if ($LASTEXITCODE -ne 0) {
    Write-Host @"

rebase 停住了，多半是上游也改了你改过的文件。仓库现在处于冲突状态，二选一：

  A. 解决冲突后继续
       git -C "$Repo" status            查看冲突文件
       （改完）git -C "$Repo" add -A
       git -C "$Repo" rebase --continue

  B. 放弃这次升级，完全退回原状
       git -C "$Repo" rebase --abort

也可以直接让 Qoder 执行："把 vrcx-fork 的 $Branch rebase 到最新上游并修好冲突"。
"@ -ForegroundColor Yellow
    exit 1
}
Write-Host 'rebase 干净通过' -ForegroundColor Green

Write-Host "`n[3/4] 体检：lint + 构建 ..." -ForegroundColor Cyan
if (-not (Test-Path (Join-Path $Repo 'node_modules'))) {
    Fail '缺少 node_modules，先在仓库目录跑： $env:ELECTRON_SKIP_BINARY_DOWNLOAD=1; npm ci'
}
Push-Location $Repo
try {
    & npm.cmd run lint
    if ($LASTEXITCODE -ne 0) { Fail 'lint 报错，先修掉再部署' }
    & npx.cmd vite build src
    if ($LASTEXITCODE -ne 0) { Fail '新版上构建失败，说明上游接口变了，需要适配代码' }
}
finally { Pop-Location }
Write-Host 'lint 和构建都通过' -ForegroundColor Green

if ($NoSync) { Write-Host "`n[4/4] 按 -NoSync 跳过部署"; exit 0 }

Write-Host "`n[4/4] 部署 ..." -ForegroundColor Cyan
& "$PSScriptRoot\sync.ps1"
