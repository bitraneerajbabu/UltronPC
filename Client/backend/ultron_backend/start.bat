@echo off
:: Ensure working directory is the script's directory
cd /d "%~dp0"

echo ============================================================
echo   UltrON Backend - Setup and Launch
echo   All Rights Reserved to Neeraj
echo ============================================================
echo.

REM Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found!
    echo Please install Python 3.11+ from https://www.python.org/downloads/
    echo Make sure to check "Add Python to PATH" during install.
    pause
    exit /b 1
)

echo [OK] Python found
python --version

REM Create venv if not exists (checking activate.bat ensures venv is not corrupted/incomplete)
if not exist "venv\Scripts\activate.bat" (
    echo.
    echo [STEP 1] Creating virtual environment...
    python -m venv venv
    if errorlevel 1 (
        echo [ERROR] Failed to create virtual environment
        pause
        exit /b 1
    )
    echo [OK] Virtual environment created
)

REM Activate venv
echo.
echo [STEP 2] Activating virtual environment...
if not exist "venv\Scripts\activate.bat" (
    echo [ERROR] Virtual environment activation script not found!
    pause
    exit /b 1
)
call venv\Scripts\activate.bat

REM Install requirements
echo.
echo [STEP 3] Installing dependencies (this may take a few minutes)...
if not exist "requirements.txt" (
    echo [ERROR] requirements.txt not found!
    pause
    exit /b 1
)
pip install -r requirements.txt --quiet
if errorlevel 1 (
    echo [ERROR] Failed to install dependencies
    pause
    exit /b 1
)
echo [OK] All dependencies installed

REM Start server
echo.
echo ============================================================
echo   Starting UltrON Backend Server...
echo   API: http://localhost:8000
echo   Docs: http://localhost:8000/docs
echo   WebSocket: ws://localhost:8000/ws/live
echo ============================================================
echo.
if not exist "run.py" (
    echo [ERROR] run.py not found!
    pause
    exit /b 1
)
python run.py
if errorlevel 1 (
    echo [ERROR] Server exited with an error.
    pause
    exit /b 1
)

pause
