@echo off
setlocal EnableExtensions
set "SCRIPT_DIR=%~dp0"
call "%SCRIPT_DIR%Run-AutomatePlus.bat" %*
exit /b %ERRORLEVEL%
