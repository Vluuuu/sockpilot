@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js 20+ is required. Download from https://nodejs.org/
  pause
  exit /b 1
)
node bridge.js
if errorlevel 1 (
  echo.
  echo Bridge stopped with an error. Read the message above.
  pause
)
