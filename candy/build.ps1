#Requires -Version 5.1
<#
.SYNOPSIS
    Builds the standalone VRCX-Candy: interface, program, portable zip and installer.

.DESCRIPTION
    Four steps in order. The host program has to exist before the archive is made and
    the interface has to exist before either, because the host build links its html
    folder to the one the frontend build produces.

    The toolchain is not in the repository. The .NET SDK and NSIS are both installed
    per user rather than system wide, so the paths below are searched rather than
    assumed; override either if they move.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File candy\build.ps1
#>
[CmdletBinding()]
param(
    [string]$DotnetRoot = "$env:USERPROFILE\dotnet",
    [string]$MakensisPath,
    [string]$CopyTo = "$env:USERPROFILE\Desktop",
    [switch]$SkipFrontend,
    [switch]$SkipHost
)

$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

function Find-Tool {
    param([string[]]$Candidates, [string]$What)
    foreach ($candidate in $Candidates) {
        if ($candidate -and (Test-Path $candidate)) { return $candidate }
    }
    throw "$What not found. Looked in:`n  $($Candidates -join "`n  ")"
}

$dotnet = Find-Tool -What '.NET SDK' -Candidates @(
    (Join-Path $DotnetRoot 'dotnet.exe'),
    "$env:ProgramFiles\dotnet\dotnet.exe"
)

if (-not $MakensisPath) {
    $MakensisPath = Find-Tool -What 'NSIS' -Candidates @(
        (Join-Path $env:USERPROFILE 'nsis\nsis-3.11\makensis.exe'),
        'C:\Program Files (x86)\NSIS\makensis.exe',
        'C:\Program Files\NSIS\makensis.exe'
    )
}

$python = Find-Tool -What 'Python' -Candidates @(
    (Get-Command python -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source)
)

$version = (Get-Content -Path 'Version' -Raw).Trim()
Write-Host "VRCX-Candy $version" -ForegroundColor Green

if (-not $SkipFrontend) {
    Write-Host "`n[1/4] Interface" -ForegroundColor Green
    npm run prod
    if ($LASTEXITCODE -ne 0) { throw 'frontend build failed' }
}

if (-not $SkipHost) {
    Write-Host "`n[2/4] Program" -ForegroundColor Green
    & $dotnet build Dotnet\VRCX-Cef.csproj -p:Configuration=Release -p:WarningLevel=0 `
        -p:Platform=x64 -p:PlatformTarget=x64 -t:"Clean;Build" -maxcpucount `
        --runtime win-x64 --self-contained
    if ($LASTEXITCODE -ne 0) { throw 'host build failed' }
}

Write-Host "`n[3/4] Portable zip" -ForegroundColor Green
& $python candy\make-portable.py
if ($LASTEXITCODE -ne 0) { throw 'packaging failed' }

Write-Host "`n[4/4] Installer" -ForegroundColor Green
# Written without a BOM: NSIS reads this file literally, and a byte order mark in front
# of the first !define would end up in the version string it defines.
$define = "!define PRODUCT_VERSION_FROM_FILE `"$version.0`"`r`n"
[System.IO.File]::WriteAllText(
    (Join-Path $PSScriptRoot 'version_define.nsh'), $define, [System.Text.Encoding]::ASCII)

& $MakensisPath (Join-Path $PSScriptRoot 'installer.nsi')
if ($LASTEXITCODE -ne 0) { throw 'installer build failed' }

$artifacts = @(
    (Get-ChildItem -Path . -Filter 'VRCX-Candy-*-portable.zip'),
    (Get-Item 'VRCX-Candy-Setup.exe')
)

Write-Host "`nBuilt:" -ForegroundColor Green
foreach ($artifact in $artifacts) {
    $mb = [math]::Round($artifact.Length / 1MB, 1)
    Write-Host ("  {0}  ({1} MB)" -f $artifact.Name, $mb)
    if ($CopyTo) { Copy-Item $artifact.FullName -Destination $CopyTo -Force }
}
if ($CopyTo) { Write-Host "`nCopied to $CopyTo" -ForegroundColor Green }
