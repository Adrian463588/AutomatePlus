@echo off
setlocal EnableExtensions
set "ROOT=%~dp0.."
set "NATIVE=%ROOT%\apps\desktop\src-tauri\target\release\AutomatePlus.exe"
set "FORCE_BROWSER=0"
if /I "%~1"=="--browser" set "FORCE_BROWSER=1"
cd /d "%ROOT%"

where node >nul 2>nul
if errorlevel 1 (
  if exist "%NATIVE%" if "%FORCE_BROWSER%"=="0" goto launch_native
  echo [AutomatePlus] BLOCKED: local Node.js is required for the browser shell or native build. No download will be attempted.
  exit /b 2
)

if exist "%NATIVE%" if "%FORCE_BROWSER%"=="0" goto launch_native

if exist "%ROOT%\runtime-packs\manifest.json" if "%FORCE_BROWSER%"=="0" (
  node "%ROOT%\scripts\build-native-offline.mjs" --preflight
  if not errorlevel 1 (
    echo [AutomatePlus] Native sources and offline packs are ready; building the local host.
    node "%ROOT%\scripts\build-native-offline.mjs" --build
    if not errorlevel 1 if exist "%NATIVE%" goto launch_native
    echo [AutomatePlus] Native build did not complete; opening browser-safe shell.
  ) else (
    echo [AutomatePlus] Native preflight is blocked; opening browser-safe shell.
  )
)

if not exist "%ROOT%\node_modules\.bin\vite.cmd" (
  echo [AutomatePlus] BLOCKED: frontend dependencies are missing. Run npm ci --offline, then retry.
  exit /b 2
)

echo [AutomatePlus] Native host is unavailable; Android farm and recording stay Blocked.
echo [AutomatePlus] Starting browser-safe migration shell at http://127.0.0.1:5173
start "" /b "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:5173'"
call npm run dev --workspace=@automate-plus/desktop -- --host 127.0.0.1 --strictPort
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" echo [AutomatePlus] Browser shell exited with code %EXIT_CODE%.
exit /b %EXIT_CODE%

:launch_native
set "AUTOMATE_PLUS_WORKSPACE=%ROOT%"
echo [AutomatePlus] Starting native Tauri/Rust host.
start "AutomatePlus" /wait "%NATIVE%"
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" echo [AutomatePlus] Native host exited with code %EXIT_CODE%.
exit /b %EXIT_CODE%
