@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\local-app.ps1" -Mode browser %*
