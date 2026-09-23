<#
    sync.ps1 —— 把当前分支编译出的前端部署进 VRCX，让你看到自己的改动。

    用法：
        .\sync.ps1                正常构建并部署（会先关掉检查）
        .\sync.ps1 -SkipBuild     用上次 build/html 的结果，不重新构建
        .\sync.ps1 -Force         跳过版本一致性检查（知道自己在做什么再用）
        .\sync.ps1 -Check         只检查当前部署是不是本分支的产物，不写入

    官方更新会重装整个目录并覆盖 html，届时重跑本脚本即可。
#>
[CmdletBinding()]
param(
    [switch]$SkipBuild,
    [switch]$Force,
    [switch]$Check,
    [string]$InstallDir
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\config.ps1"
$Cfg = $script:VrcxMod
if (-not $InstallDir) { $InstallDir = $Cfg.InstallDir }

$RepoHtml   = Join-Path $Cfg.Repo 'build\html'
$TargetHtml = Join-Path $InstallDir 'html'

function Read-VersionFile([string]$Path) {
    if (-not (Test-Path $Path)) { return $null }
    (Get-Content -LiteralPath $Path -Raw).Trim()
}

function Fail([string]$Message) {
    Write-Host "`n[x] $Message" -ForegroundColor Red
    exit 1
}

# --- 前置检查 ---------------------------------------------------------------

if (-not (Test-Path (Join-Path $InstallDir 'VRCX.exe'))) {
    Fail "在 $InstallDir 没找到 VRCX.exe，检查一下 config.ps1 里的 InstallDir"
}

if ($Check) {
    $stamp = Join-Path $TargetHtml '.vrcx-mod-stamp'
    if (-not (Test-Path $stamp)) { Write-Host '当前装的是官方原版前端，不是你的分支'; exit 0 }
    Write-Host "当前部署来源：$(Get-Content -LiteralPath $stamp -Raw)"
    exit 0
}

if (Get-Process -Name VRCX -ErrorAction SilentlyContinue) {
    Fail 'VRCX 正在运行，文件会被占用。先完全退出 VRCX（注意托盘图标也要关）再跑。'
}

$RepoVersion     = Read-VersionFile (Join-Path $Cfg.Repo 'Version')
$InstalledVersion = Read-VersionFile (Join-Path $InstallDir 'Version')

if ($RepoVersion -ne $InstalledVersion -and -not $Force) {
    Fail @"
分支版本 ($RepoVersion) 和已安装的 VRCX 版本 ($InstalledVersion) 不一致。
前端和 .NET 宿主是配对的，装错版本可能出现界面调用不到接口。
官方刚更新过的话，先跑 .\update.ps1 把分支 rebase 到新版，再跑本脚本。
确认没问题要强行部署就用 -Force。
"@
}

# --- 构建 -------------------------------------------------------------------

$Branch = (& git -C $Cfg.Repo rev-parse --abbrev-ref HEAD)
Write-Host "`n分支: $Branch   版本: $RepoVersion" -ForegroundColor Cyan

if (-not $SkipBuild) {
    if (-not (Test-Path (Join-Path $Cfg.Repo 'node_modules'))) {
        Fail '缺少 node_modules，先在仓库目录跑： $env:ELECTRON_SKIP_BINARY_DOWNLOAD=1; npm ci'
    }
    Push-Location $Cfg.Repo
    try {
        Write-Host '构建前端 (vite build src) ...'
        & npx vite build src
        if ($LASTEXITCODE -ne 0) { Fail '构建失败，上面有 vite 的报错' }
    }
    finally { Pop-Location }
}

if (-not (Test-Path (Join-Path $RepoHtml 'index.html'))) {
    Fail "没有 $RepoHtml，先不带 -SkipBuild 跑一次"
}

# --- 部署 -------------------------------------------------------------------

$Stamp = "$Branch @ $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
$BackupRoot = Join-Path $InstallDir 'html_backup'

if (Test-Path $TargetHtml) {
    New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null
    $BackupName = "html_$((Get-Date -Format 'yyyyMMdd-HHmmss'))"
    $BackupPath = Join-Path $BackupRoot $BackupName
    Move-Item -LiteralPath $TargetHtml -Destination $BackupPath
    Write-Host "旧前端已备份到 $BackupPath" -ForegroundColor Green

    # licenses 由单独的脚本生成，不在 vite 产物里，从备份里带过来
    $OldLicenses = Join-Path $BackupPath 'licenses'
    if (Test-Path $OldLicenses) {
        Copy-Item -LiteralPath $OldLicenses -Destination (Join-Path $RepoHtml 'licenses') -Recurse -Force
    }
}

Copy-Item -LiteralPath $RepoHtml -Destination $TargetHtml -Recurse -Force
Set-Content -LiteralPath (Join-Path $TargetHtml '.vrcx-mod-stamp') -Value $Stamp -NoNewline

# 只保留最近几份备份
if (Test-Path $BackupRoot) {
    Get-ChildItem -LiteralPath $BackupRoot -Directory |
        Sort-Object Name -Descending |
        Select-Object -Skip $Cfg.KeepBackups |
        Remove-Item -Recurse -Force
}

# --- 验证 -------------------------------------------------------------------

$Marker = $false
$Assets = Join-Path $TargetHtml 'assets'
if (Test-Path $Assets) {
    $Marker = Get-ChildItem -LiteralPath $Assets -Filter *.js |
        Select-String -Pattern 'getBioHistoryForUserId' -SimpleMatch -Quiet
}
if (-not $Marker) {
    Write-Host '[!] 部署完成，但没在产物里找到简介历史的代码 —— 确认一下当前分支对不对' -ForegroundColor Yellow
}

Write-Host "`n[OK] 已部署 $Stamp" -ForegroundColor Green
Write-Host '现在启动 VRCX 就能用了。回滚： .\rollback.ps1'
