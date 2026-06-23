@echo off
chcp 65001 >nul
title Carrera Live - TikTok Live
cd /d "%~dp0"

echo ============================================
echo    CARRERA LIVE  -  Iniciando...
echo ============================================
echo.

REM ---------- 1) Comprobar Node.js ----------
where node >nul 2>nul
if errorlevel 1 (
  echo [!] Node.js no esta instalado.
  where winget >nul 2>nul
  if errorlevel 1 (
    echo [X] Tampoco se encontro 'winget'.
    echo     Instala Node.js LTS manualmente desde: https://nodejs.org
    echo.
    pause
    exit /b 1
  )
  echo [*] Instalando Node.js LTS con winget...
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  echo.
  echo [!] Node.js instalado. CIERRA esta ventana y vuelve a abrir
  echo     "Iniciar Carrera Live.bat" para que tome los cambios.
  echo.
  pause
  exit /b 0
)

REM ---------- 2) Instalar dependencias (solo la 1a vez) ----------
cd server
if not exist node_modules (
  echo [*] Instalando dependencias por primera vez. Puede tardar un minuto...
  call npm install
  if errorlevel 1 (
    echo [X] Fallo "npm install". Revisa tu conexion a internet.
    echo.
    pause
    exit /b 1
  )
  echo [OK] Dependencias instaladas.
  echo.
)

REM ---------- Liberar el puerto 8123 (cierra cualquier puente viejo que siga corriendo) ----------
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8123 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>nul

REM ---------- Clave de firma de Euler Stream (sube los limites de conexion) ----------
set SIGN_API_KEY=euler_ZDNiM2E3ZTI2OGVmZmVjODk3N2QxMWNiNzI2NzA3MTUwMmMzNTU1MmJlZWU2ZjMyZGU5ZDVk

REM ---------- 3) Abrir el navegador 3s despues (en segundo plano) ----------
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 3; Start-Process 'http://localhost:8123'"

REM ---------- 4) Arrancar el servidor (se queda corriendo en esta ventana) ----------
echo [OK] Servidor en  http://localhost:8123
echo     ^>^> Deja esta ventana abierta mientras juegas.
echo     ^>^> Cierrala para detener el juego.
echo.
node bridge.js

echo.
echo [i] El servidor se detuvo.
pause
