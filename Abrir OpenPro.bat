@echo off
chcp 65001 >nul
setlocal enableextensions
cd /d "%~dp0"

rem Critico: si ELECTRON_RUN_AS_NODE=1 esta en el entorno, Electron arranca como
rem si fuera Node y la app muere al instante sin mostrar nada.
set "ELECTRON_RUN_AS_NODE="
set "NODE_OPTIONS="

set "LOG=%~dp0abrir-openpro.log"
set "APP=%~dp0node_modules\electron\dist\electron.exe"

echo [%time%] Doble clic en el lanzador >> "%LOG%"

if not exist "%APP%" (
  echo.
  echo  No se encontro Electron en esta carpeta.
  echo  Abre una consola aqui y ejecuta:  npm install
  echo.
  echo [%time%] ERROR: falta electron.exe >> "%LOG%"
  pause
  exit /b 1
)

if not exist "out\main\index.js" (
  echo.
  echo  Compilando la aplicacion por primera vez. Puede tardar un minuto...
  echo.
  call npm run build >> "%LOG%" 2>&1
  if errorlevel 1 (
    echo  La compilacion fallo. Revisa el archivo abrir-openpro.log
    echo [%time%] ERROR: fallo npm run build >> "%LOG%"
    pause
    exit /b 1
  )
)

rem Cierra solo una instancia anterior de ESTA app
powershell -NoProfile -Command "Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq '%APP%' } | Stop-Process -Force" >nul 2>&1
ping -n 3 127.0.0.1 >nul

echo [%time%] Lanzando OpenPro Agente >> "%LOG%"
echo.
echo  Abriendo OpenPro Agente... (esta ventana se cerrara sola)
echo.
start "" "%APP%" . --no-sandbox --disable-gpu

rem Comprueba que el proceso sigue vivo unos segundos despues
ping -n 9 127.0.0.1 >nul
powershell -NoProfile -Command "if (Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq '%APP%' }) { exit 0 } else { exit 1 }" >nul 2>nul
if errorlevel 1 (
  echo.
  echo  La aplicacion no llego a arrancar.
  echo.
  echo  Revisa estos dos archivos:
  echo    - %~dp0abrir-openpro.log
  echo    - %%APPDATA%%\openpro-agente\logs\openpro.log
  echo.
  echo [%time%] ERROR: electron no quedo vivo >> "%LOG%"
  pause
  exit /b 1
)

echo [%time%] Arrancada correctamente >> "%LOG%"
exit /b 0
