@echo off
echo 🐶 Starting Shipping Speed Visualizer...
cd /d "%~dp0"

:: Check if venv exists
if not exist ".venv" (
    echo ❌ Virtual environment not found!
    echo Please run 'setup_windows.bat' first to install everything.
    pause
    exit /b
)

:: Activate and Run
call .venv\Scripts\activate
python main.py
pause
