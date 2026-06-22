@echo off
cd /d "%~dp0"
node sync-menu-assets.mjs
if errorlevel 1 (
  echo.
  echo No se pudo sincronizar el menu.
)
pause
