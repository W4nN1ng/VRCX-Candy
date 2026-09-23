@echo off
chcp 65001 >nul
rem 回滚前端。不带参数=最近一份备份；-List 看所有；-Stock 直接回官方原版
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0rollback.ps1" %*
echo.
pause
