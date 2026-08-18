@echo off
setlocal EnableExtensions
set "SCRIPT=%~dp0scripts\Run-AutomatePlus.bat"

if not exist "%SCRIPT%" (
  echo [AutomatePlus] BLOCKED: launcher script is missing.
  echo.
  pause
  exit /b 2
)

call "%SCRIPT%" %*
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
  echo.
  echo [AutomatePlus] Execution stopped with code %EXIT_CODE%.
  pause
)
exit /b %EXIT_CODE%
