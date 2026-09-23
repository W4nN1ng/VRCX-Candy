@echo off
chcp 65001 >nul
rem 部署：构建当前分支并同步到 VRCX
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sync.ps1" %*
echo.
pause
