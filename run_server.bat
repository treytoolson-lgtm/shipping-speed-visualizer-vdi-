@echo off
echo 🚀 Starting Shipping Speed Visualizer Server...
echo 📡 Listening on http://0.0.0.0:5004
echo (Accessible to other machines on the network)
cd /d "%~dp0"

:: Check if venv exists
if not exist ".venv" (
    echo ❌ Virtual environment not found!
    echo Please run 'setup_windows.bat' first.
    pause
    exit /b
)

:: Activate and Run with Uvicorn (Production-like settings)
call .venv\Scripts\activate
:: Using 4 workers for better concurrency
uvicorn main:app --host 0.0.0.0 --port 5004 --workers 4
pause