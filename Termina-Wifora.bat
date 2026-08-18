@echo off
title Arresto Wifora
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo  [WIFORA] Chiusura dei processi Wifora in corso...
echo.

powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3975 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id  -Force -ErrorAction SilentlyContinue }"

echo.
echo  [WIFORA] Processi terminati con successo.
echo.
timeout /t 2 >nul
