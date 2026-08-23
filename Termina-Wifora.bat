@echo off
title Stop Wifora
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo  [WIFORA] Stopping Wifora processes...
echo.

powershell -NoProfile -Command "$orphans = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match '--(wifora-managed|wifora-control)' }; foreach ($p in $orphans) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }; foreach ($port in 3975, 3976) { $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue; $owners = $conns | Select-Object -ExpandProperty OwningProcess -Unique; foreach ($owner in $owners) { Stop-Process -Id $owner -Force -ErrorAction SilentlyContinue } }; Start-Sleep -Milliseconds 600; $busy = @(); foreach ($port in 3975, 3976) { if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { $busy += $port } }; if ($busy.Count -gt 0) { Write-Host ('  [WARN] Still busy ports: ' + ($busy -join ', ')) } else { Write-Host '  [OK] Verified: ports 3975 and 3976 are free.' }"

echo.
echo  [WIFORA] Processes stopped successfully.
echo.
timeout /t 2 >nul
