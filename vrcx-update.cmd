@echo off
chcp 65001 >nul
rem 官方更新后：rebase 到新版 + 体检 + 部署。加 -DryRun 只看会不会冲突
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0update.ps1" %*
echo.
pause
