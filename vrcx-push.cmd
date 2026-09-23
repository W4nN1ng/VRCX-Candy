@echo off
chcp 65001 >nul
rem 保存并推到 GitHub：代码仓库 + 维护脚本仓库一起
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0push.ps1" %*
echo.
pause
