@echo off
setlocal EnableExtensions
set "ROOT=%~dp0.."
set "NATIVE=%ROOT%\release\AutomatePlus.exe"
if not exist "%NATIVE%" set "NATIVE=%ROOT%\apps\desktop\src-tauri\target\release\AutomatePlus.exe"
set "BOOTSTRAP=%ROOT%\release\AutomatePlusBootstrap.exe"
set "FORCE_BROWSER=0"
set "DOCTOR=0"
set "DEV_BUILD=0"
if /I "%~1"=="--browser" set "FORCE_BROWSER=1"
if /I "%~1"=="--doctor" set "DOCTOR=1"
if /I "%~1"=="--build-dev" set "DEV_BUILD=1"
cd /d "%ROOT%"

if "%DOCTOR%"=="1" goto doctor

if "%FORCE_BROWSER%"=="0" if exist "%NATIVE%" goto launch_native
if "%FORCE_BROWSER%"=="0" if exist "%BOOTSTRAP%" goto launch_bootstrap

if "%FORCE_BROWSER%"=="0" if "%DEV_BUILD%"=="0" (
  echo [AutomatePlus] BLOCKED: AutomatePlus.exe and AutomatePlusBootstrap.exe are not present.
  echo [AutomatePlus] Install the signed offline release package, or use --browser explicitly for migration-shell diagnostics.
  exit /b 2
)

where node >nul 2>nul
if errorlevel 1 (
  echo [AutomatePlus] BLOCKED: local Node.js is required for this launch mode. No download will be attempted.
  exit /b 2
)

if "%FORCE_BROWSER%"=="1" goto launch_browser

echo [AutomatePlus] Running native offline preflight...
node "%ROOT%\scripts\build-native-offline.mjs" --preflight
set "PREFLIGHT_CODE=%ERRORLEVEL%"
if not "%PREFLIGHT_CODE%"=="0" (
  echo [AutomatePlus] Native launch blocked by the preflight result above.
  exit /b 2
)

echo [AutomatePlus] Native host prerequisites are ready; building Tauri/Rust host offline.
node "%ROOT%\scripts\build-native-offline.mjs" --build
set "BUILD_CODE=%ERRORLEVEL%"
if not "%BUILD_CODE%"=="0" (
  echo [AutomatePlus] BLOCKED: native Tauri/Rust build failed with code %BUILD_CODE%.
  exit /b 1
)
if not exist "%NATIVE%" (
  echo [AutomatePlus] BLOCKED: native build returned success but AutomatePlus.exe is missing.
  exit /b 1
)
goto launch_native

:launch_bootstrap
set "AUTOMATE_PLUS_WORKSPACE=%ROOT%"
echo [AutomatePlus] Starting offline bootstrap host. Runtime Manager is available for explicit pack setup.
start "AutomatePlus Bootstrap" /wait "%BOOTSTRAP%"
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" echo [AutomatePlus] Bootstrap exited with code %EXIT_CODE%.
exit /b %EXIT_CODE%

:launch_browser
if not exist "%ROOT%\node_modules" (
  echo [AutomatePlus] BLOCKED: frontend dependencies are missing. Run npm ci --offline, then retry.
  exit /b 2
)

echo [AutomatePlus] Starting explicit browser migration shell. Native capabilities remain Blocked.
node "%ROOT%\scripts\serve-desktop.mjs" %*
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" echo [AutomatePlus] Server exited with code %EXIT_CODE%.
exit /b %EXIT_CODE%

:doctor
where node >nul 2>nul
if errorlevel 1 (
  echo [AutomatePlus] BLOCKED: local Node.js is required for diagnostics. No download will be attempted.
  exit /b 2
)
echo [AutomatePlus] Running native offline diagnostics...
node "%ROOT%\scripts\build-native-offline.mjs" --preflight
exit /b %ERRORLEVEL%

:launch_native
set "AUTOMATE_PLUS_WORKSPACE=%ROOT%"
echo [AutomatePlus] Starting native Tauri/Rust host.
start "AutomatePlus" /wait "%NATIVE%"
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" echo [AutomatePlus] Native host exited with code %EXIT_CODE%.
exit /b %EXIT_CODE%
