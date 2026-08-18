@echo off
title Stop Wifora
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo  [WIFORA] Stopping Wifora processes...
echo.

powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3975 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id  -Force -ErrorAction SilentlyContinue }"

echo.
echo  [WIFORA] Processes stopped successfully.
echo.
timeout /t 2 >nul
