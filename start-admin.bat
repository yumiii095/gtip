@echo off
rem Double-click to open the admin page at http://localhost:8080 (needed for "Link folder" to work).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\serve.ps1" -Port 8080 -Open admin.html
pause
