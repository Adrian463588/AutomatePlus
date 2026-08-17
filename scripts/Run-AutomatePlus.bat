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
  echo [AutomatePlus] BLOCKED: local Node.js is required for the desktop server or native build. No download will be attempted.
  exit /b 2
)

if exist "%NATIVE%" if "%FORCE_BROWSER%"=="0" goto launch_native

if exist "%ROOT%\runtime-packs\manifest.json" if "%FORCE_BROWSER%"=="0" (
  node "%ROOT%\scripts\build-native-offline.mjs" --preflight >nul 2>&1
  if not errorlevel 1 (
    echo [AutomatePlus] Native sources and offline packs are ready; building the local host.
    node "%ROOT%\scripts\build-native-offline.mjs" --build
    if not errorlevel 1 if exist "%NATIVE%" goto launch_native
    echo [AutomatePlus] Native build did not complete; opening high-performance local desktop shell.
  )
)

if not exist "%ROOT%\node_modules" (
  echo [AutomatePlus] BLOCKED: frontend dependencies are missing. Run npm ci --offline, then retry.
  exit /b 2
)

echo [AutomatePlus] Starting AutomatePlus desktop platform...
node "%ROOT%\scripts\serve-desktop.mjs" %*
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" echo [AutomatePlus] Server exited with code %EXIT_CODE%.
exit /b %EXIT_CODE%

:launch_native
set "AUTOMATE_PLUS_WORKSPACE=%ROOT%"
echo [AutomatePlus] Starting native Tauri/Rust host.
start "AutomatePlus" /wait "%NATIVE%"
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" echo [AutomatePlus] Native host exited with code %EXIT_CODE%.
exit /b %EXIT_CODE%
