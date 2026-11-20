@echo off
rem Chay web Load Planner ngam (khong cua so). Tu khoi dong lai neu server bi tat / loi.
rem Duoc goi tu Startup cua Windows (file "Load-Planner-web.vbs"). Log: logs\server.log
rem Link noi bo: http://localhost:3200 · Link Internet (Tailscale Funnel): https://desktop-89se9ff.tail325211.ts.net:8443/
cd /d "%~dp0"
if not exist logs mkdir logs

:loop
rem da co server khac dang chay cong 3200 -> doi, khong chay trung
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 3200 -State Listen -ErrorAction SilentlyContinue) { exit 1 } else { exit 0 }"
if errorlevel 1 (
  timeout /t 60 /nobreak >nul
  goto loop
)
echo [%date% %time%] Khoi dong server >> logs\server.log
node server.js >> logs\server.log 2>&1
echo [%date% %time%] Server dung (ma %errorlevel%), chay lai sau 5 giay >> logs\server.log
timeout /t 5 /nobreak >nul
goto loop
