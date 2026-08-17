@echo off
setlocal EnableExtensions
set "SCRIPT=%~dp0scripts\Run-AutomatePlus.bat"

if not exist "%SCRIPT%" (
  echo [AutomatePlus] BLOCKED: launcher script is missing.
  exit /b 2
)

call "%SCRIPT%" %*
exit /b %ERRORLEVEL%
