@echo off
chcp 65001 >nul
title Crear Carrera Live portable (.exe)
cd /d "%~dp0"

echo ============================================
echo   Creando CarreraLive.exe portable...
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [X] Necesitas Node.js instalado para CREAR el .exe.
  echo     ^(Las personas a las que les pases el .exe NO lo necesitan.^)
  echo.
  pause
  exit /b 1
)

REM ---------- Dependencias del servidor ----------
if not exist server\node_modules (
  echo [*] Instalando dependencias del servidor...
  pushd server
  call npm install
  popd
)

REM ---------- Empaquetar ----------
echo [*] Empaquetando con @yao-pkg/pkg (la 1a vez descarga ~60MB)...
call npx --yes @yao-pkg/pkg . --fallback-to-source --output dist\CarreraLive.exe
if errorlevel 1 (
  echo.
  echo [X] Fallo el empaquetado. Revisa el mensaje de arriba.
  echo.
  pause
  exit /b 1
)

echo.
echo [OK] Listo:  %~dp0dist\CarreraLive.exe
echo     Es portable: copialo a cualquier Windows y dale doble clic.
echo     (Abre el navegador solo en http://localhost:8123)
echo.
pause
