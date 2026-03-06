@echo off
echo 📦 Setting up Shipping Speed Visualizer for Windows...
cd /d "%~dp0"

:: Create Venv
if not exist ".venv" (
    echo Creating virtual environment...
    python -m venv .venv
)

:: Activate
call .venv\Scripts\activate

:: Install Dependencies (using Walmart Mirror)
echo Installing dependencies (this might take a minute)...
pip install -r requirements.txt --index-url https://pypi.ci.artifacts.walmart.com/artifactory/api/pypi/external-pypi/simple --trusted-host pypi.ci.artifacts.walmart.com

echo.
echo ✅ Setup Complete!
echo 👉 Double-click 'run_windows.bat' to start the tool.
pause
