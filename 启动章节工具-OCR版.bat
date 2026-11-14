@echo off
setlocal
cd /d "%~dp0chapter_helper"
if not exist ".venv\Scripts\python.exe" (
    echo Please run chapter_helper setup first. See README.md.
    pause
    exit /b 1
)
".venv\Scripts\python.exe" main.py --ocr
if errorlevel 1 pause
