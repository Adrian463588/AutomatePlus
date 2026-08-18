@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "AUTOMATEPLUS_ROOT=%~dp0"
if "!AUTOMATEPLUS_ROOT:~-1!"=="\" set "AUTOMATEPLUS_ROOT=!AUTOMATEPLUS_ROOT:~0,-1!"
set "NO_PAUSE=0"
set "MODE=native"
set "DOCTOR=0"
set "BUILD_DEV=0"
set "BROWSER_DEV=0"
set "NO_OPEN=0"
set "PORT="
set "AUTOMATE_PLUS_PORT="

:parse_args
if "%~1"=="" goto args_parsed
set "ARG=%~1"
if /I "!ARG!"=="--help" goto help
if /I "!ARG!"=="--no-pause" (
  set "NO_PAUSE=1"
  shift
  goto parse_args
)
if /I "!ARG!"=="--browser" (
  set "MODE=browser"
  shift
  goto parse_args
)
if /I "!ARG!"=="--doctor" (
  set "DOCTOR=1"
  shift
  goto parse_args
)
if /I "!ARG!"=="--build-dev" (
  set "BUILD_DEV=1"
  shift
  goto parse_args
)
if /I "!ARG!"=="--dev" (
  set "BROWSER_DEV=1"
  shift
  goto parse_args
)
if /I "!ARG!"=="--no-open" (
  set "NO_OPEN=1"
  shift
  goto parse_args
)
if /I "!ARG!"=="--port" goto port_value_arg
if /I "!ARG:~0,7!"=="--port=" goto port_arg
goto invalid_args

:port_value_arg
shift
if "%~1"=="" goto invalid_args
set "PORT=%~1"
shift
goto parse_args

:port_arg
set "PORT=!ARG:~7!"
if "!PORT!"=="" goto invalid_args
shift
goto parse_args

:args_parsed
set "INVALID_ARGS=0"
if "!DOCTOR!"=="1" if not "!MODE!"=="native" set "INVALID_ARGS=1"
if "!DOCTOR!"=="1" if "!BUILD_DEV!"=="1" set "INVALID_ARGS=1"
if "!DOCTOR!"=="1" if "!BROWSER_DEV!"=="1" set "INVALID_ARGS=1"
if "!DOCTOR!"=="1" if "!NO_OPEN!"=="1" set "INVALID_ARGS=1"
if "!DOCTOR!"=="1" if defined PORT set "INVALID_ARGS=1"
if "!BUILD_DEV!"=="1" if "!MODE!"=="browser" set "INVALID_ARGS=1"
if "!MODE!"=="native" if "!BROWSER_DEV!"=="1" set "INVALID_ARGS=1"
if "!MODE!"=="native" if "!NO_OPEN!"=="1" set "INVALID_ARGS=1"
if "!MODE!"=="native" if defined PORT set "INVALID_ARGS=1"
if "!INVALID_ARGS!"=="1" goto invalid_args

pushd "!AUTOMATEPLUS_ROOT!" >nul 2>nul
if errorlevel 1 goto blocked_root
set "AUTOMATE_PLUS_WORKSPACE=!AUTOMATEPLUS_ROOT!"
if defined PORT set "AUTOMATE_PLUS_PORT=!PORT!"

if "!DOCTOR!"=="1" goto doctor
if "!MODE!"=="browser" goto browser
goto native

:native
set "NATIVE=!AUTOMATEPLUS_ROOT!\release\AutomatePlus.exe"
if exist "!NATIVE!" goto launch_native
set "NATIVE=!AUTOMATEPLUS_ROOT!\backend\target\release\AutomatePlus.exe"
if exist "!NATIVE!" goto launch_native

set "BOOTSTRAP=!AUTOMATEPLUS_ROOT!\release\AutomatePlusBootstrap.exe"
if exist "!BOOTSTRAP!" goto launch_bootstrap
if "!BUILD_DEV!"=="1" goto build_dev

echo [AutomatePlus] BLOCKED: native host is unavailable.
echo [AutomatePlus] Expected release\AutomatePlus.exe or release\AutomatePlusBootstrap.exe.
echo [AutomatePlus] Run "Run-AutomatePlus.bat --doctor" for diagnostics.
echo [AutomatePlus] Use "Run-AutomatePlus.bat --browser" only for explicit migration-shell testing.
goto finish_blocked

:build_dev
call :require_node
if errorlevel 1 goto finish_blocked
if not exist "!AUTOMATEPLUS_ROOT!\scripts\build-native-offline.mjs" (
  echo [AutomatePlus] BLOCKED: native build script is missing.
  goto finish_blocked
)
echo [AutomatePlus] Running native offline preflight...
node "!AUTOMATEPLUS_ROOT!\scripts\build-native-offline.mjs" --preflight
if errorlevel 1 (
  echo [AutomatePlus] Native build blocked by the preflight result above.
  goto finish_blocked
)
echo [AutomatePlus] Building Tauri/Rust host offline...
node "!AUTOMATEPLUS_ROOT!\scripts\build-native-offline.mjs" --build
if errorlevel 1 (
  echo [AutomatePlus] Native build failed.
  goto finish_failed
)
set "NATIVE=!AUTOMATEPLUS_ROOT!\backend\target\release\AutomatePlus.exe"
if not exist "!NATIVE!" set "NATIVE=!AUTOMATEPLUS_ROOT!\release\AutomatePlus.exe"
if not exist "!NATIVE!" (
  echo [AutomatePlus] Native build returned success but AutomatePlus.exe is missing.
  goto finish_failed
)
goto launch_native

:launch_native
echo [AutomatePlus] Starting native Tauri/Rust host.
start "AutomatePlus" /wait "!NATIVE!"
set "EXIT_CODE=!ERRORLEVEL!"
goto finish

:launch_bootstrap
echo [AutomatePlus] Starting offline bootstrap host.
start "AutomatePlus Bootstrap" /wait "!BOOTSTRAP!"
set "EXIT_CODE=!ERRORLEVEL!"
goto finish

:browser
call :require_node
if errorlevel 1 goto finish_blocked
if not exist "!AUTOMATEPLUS_ROOT!\scripts\serve-desktop.mjs" (
  echo [AutomatePlus] BLOCKED: browser migration server script is missing.
  goto finish_blocked
)
set "SERVER_ARGS="
if "!BROWSER_DEV!"=="1" set "SERVER_ARGS=!SERVER_ARGS! --dev"
if "!NO_OPEN!"=="1" set "SERVER_ARGS=!SERVER_ARGS! --no-open"
echo [AutomatePlus] Starting explicit browser migration shell. Native capabilities remain Blocked.
node "!AUTOMATEPLUS_ROOT!\scripts\serve-desktop.mjs" !SERVER_ARGS!
set "EXIT_CODE=!ERRORLEVEL!"
goto finish

:doctor
call :require_node
if errorlevel 1 goto finish_blocked
if not exist "!AUTOMATEPLUS_ROOT!\scripts\build-native-offline.mjs" (
  echo [AutomatePlus] BLOCKED: diagnostics script is missing.
  goto finish_blocked
)
echo [AutomatePlus] Running native offline diagnostics...
node "!AUTOMATEPLUS_ROOT!\scripts\build-native-offline.mjs" --preflight
set "EXIT_CODE=!ERRORLEVEL!"
goto finish

:require_node
where node >nul 2>nul
if errorlevel 1 (
  echo [AutomatePlus] BLOCKED: local Node.js is required. No download will be attempted.
  exit /b 1
)
exit /b 0

:invalid_args
echo [AutomatePlus] BLOCKED: invalid launcher arguments.
echo [AutomatePlus] Run "Run-AutomatePlus.bat --help" for supported commands.
set "EXIT_CODE=2"
goto finish

:blocked_root
echo [AutomatePlus] BLOCKED: launcher workspace cannot be opened.
set "EXIT_CODE=2"
goto finish

:finish_blocked
set "EXIT_CODE=2"
goto finish

:finish_failed
set "EXIT_CODE=1"
goto finish

:help
echo AutomatePlus local launcher
echo.
echo   Run-AutomatePlus.bat                  Start native release or bootstrap host.
echo   Run-AutomatePlus.bat --doctor         Print native and runtime preflight JSON.
echo   Run-AutomatePlus.bat --browser        Start explicit browser migration shell.
echo   Run-AutomatePlus.bat --browser --dev --port=5173 --no-open
echo                                         Start Vite migration shell without auto-opening a browser.
echo   Run-AutomatePlus.bat --build-dev      Build native host only after offline preflight.
echo   Run-AutomatePlus.bat --no-pause       Do not pause after a non-zero result.
echo.
echo Exit codes: 0 normal, 1 runtime/build failure, 2 blocked or invalid arguments.
set "EXIT_CODE=0"
goto finish

:finish
popd >nul 2>nul
if not "!EXIT_CODE!"=="0" if "!NO_PAUSE!"=="0" pause
exit /b !EXIT_CODE!
