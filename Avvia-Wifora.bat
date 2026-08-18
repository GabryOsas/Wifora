@echo off
title Wifora Studio - PC Audio Streamer
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
    echo.
    echo  [ERRORE] Node.js non e installato o non e presente nel PATH di sistema.
    echo  Scarica e installa Node.js da: https://nodejs.org
    echo.
    pause
    exit /b 1
)

if not exist node_modules (
    echo.
    echo  [WIFORA] Installazione dipendenze iniziale in corso...
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo  [ERRORE] Installazione npm non riuscita. Verifica la connessione Internet.
        echo.
        pause
        exit /b 1
    )
)

node cli-menu.mjs
