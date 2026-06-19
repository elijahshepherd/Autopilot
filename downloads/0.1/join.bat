@echo off
setlocal
rem Joins split parts back into the original archives.
rem Run this batch file from the directory containing the parts.

echo Joining autopilot-win32-x64.zip...
copy /b autopilot-win32-x64.part001.zip + autopilot-win32-x64.part002.zip + autopilot-win32-x64.part003.zip + autopilot-win32-x64.part004.zip autopilot-win32-x64.zip >nul
echo Done.

echo Joining autopilot-darwin-arm64.zip...
copy /b autopilot-darwin-arm64.part001.zip + autopilot-darwin-arm64.part002.zip + autopilot-darwin-arm64.part003.zip + autopilot-darwin-arm64.part004.zip autopilot-darwin-arm64.zip >nul
echo Done.

echo Joining autopilot-darwin-x64.zip...
copy /b autopilot-darwin-x64.part001.zip + autopilot-darwin-x64.part002.zip + autopilot-darwin-x64.part003.zip + autopilot-darwin-x64.part004.zip autopilot-darwin-x64.zip >nul
echo Done.

echo Joining autopilot-linux-x64.tar.gz...
copy /b autopilot-linux-x64.part001.tar.gz + autopilot-linux-x64.part002.tar.gz + autopilot-linux-x64.part003.tar.gz + autopilot-linux-x64.part004.tar.gz autopilot-linux-x64.tar.gz >nul
echo Done.

echo.
echo All archives joined. Extract and run:
echo   Windows: unzip autopilot-win32-x64.zip, run Autopilot.exe
echo   macOS:   unzip autopilot-darwin-arm64.zip (or -x64), open Autopilot.app
echo   Linux:   tar -xzf autopilot-linux-x64.tar.gz, run ./autopilot
