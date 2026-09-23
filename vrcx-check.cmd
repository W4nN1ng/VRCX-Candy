@echo off
chcp 65001 >nul
rem 只读检查：官方有没有新版、你的分支跟不跟得上、现在装的是哪个前端
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0check-update.ps1" %*
echo.
pause
