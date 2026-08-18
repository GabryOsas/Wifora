@echo off
title Wifora Studio - PC Audio Streamer
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
    echo.
    echo  [ERROR] Node.js is not installed or is not available in the system PATH.
    echo  Download and install Node.js from: https://nodejs.org
    echo.
    pause
    exit /b 1
)

if not exist node_modules (
    echo.
    echo  [WIFORA] Installing initial dependencies...
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo  [ERROR] npm installation failed. Check your Internet connection.
        echo.
        pause
        exit /b 1
    )
)

node cli-menu.mjs
