@echo off
cd /d "%~dp0"

echo ============================================================
echo   UltrON - Standalone Executable Build Script
echo   All Rights Reserved to Neeraj
echo ============================================================
echo.

REM 1. Verify Node.js is installed
where npm >nul 2>&1
if errorlevel 1 goto no_npm

REM 2. Build Frontend
echo [STEP 1] Installing frontend dependencies and building UI...
cd frontend
call npm install
call npm run build
cd ..
if errorlevel 1 goto frontend_failed
echo [OK] Frontend built and copied to backend/ultron_backend/ui_dist/

REM 3. Change directory to backend
cd backend\ultron_backend

REM 4. Verify/Activate venv
if exist "venv\Scripts\activate.bat" goto run_installations
echo.
echo [STEP 2] Creating virtual environment...
python -m venv venv
if errorlevel 1 goto venv_failed

:run_installations
REM 5. Install Python dependencies
echo.
echo [STEP 3] Installing python dependencies...
venv\Scripts\python.exe -m pip install -r requirements.txt
venv\Scripts\python.exe -m pip install pyinstaller pywebview --upgrade
if errorlevel 1 goto pip_failed

REM 6. Decrypt config if it was previously encrypted
if exist ".env.enc" (
    echo.
    echo [STEP 4] Decrypting config file .env.enc to .env for packaging...
    venv\Scripts\python.exe run.py --decrypt-env
)


:build_exe
REM 6b. Pre-build smoke test — imports every app/ module to catch broken
REM imports before a 40MB build + install cycle finds them on a client PC.
echo.
echo [STEP 4b] Running pre-build import smoke test...
venv\Scripts\python.exe tests\smoke_test.py
if errorlevel 1 (
    echo SMOKE TEST FAILED - fix imports before building
    goto smoke_failed
)

REM 7. Build executable via PyInstaller
echo.
echo [STEP 5] Building standalone executable using PyInstaller...
venv\Scripts\python.exe -m PyInstaller UltrON.spec --noconfirm
if errorlevel 1 goto pyinstaller_failed

REM 7b. Installer smoke test — skipped since installer.py is obsolete (replaced by Inno Setup)

REM 8. Build Bootstrapper Installer — skipped (using Inno Setup now)

echo.
echo ============================================================
echo   [SUCCESS] UltrON Standalone App and Installer Built Successfully!
echo   Application Location: backend\ultron_backend\dist\UltrON.exe
echo   Installer Location:   backend\ultron_backend\dist\UltrON_Installer.exe
echo ============================================================
echo.
goto end

:no_npm
echo [ERROR] npm / Node.js not found!
echo Please install Node.js (https://nodejs.org/) to build the frontend.
goto end

:frontend_failed
echo [ERROR] Frontend build failed!
goto end

:venv_failed
echo [ERROR] Failed to create virtual environment!
goto end

:pip_failed
echo [ERROR] Failed to install python dependencies!
goto end

:smoke_failed
echo [ERROR] Pre-build smoke test failed - broken imports found
goto end

:installer_smoke_failed
echo [ERROR] Installer smoke test failed - fix installer.py imports
goto end

:pyinstaller_failed
echo [ERROR] PyInstaller compilation failed!
goto end

:installer_failed
echo [ERROR] Bootstrapper Installer compilation failed!
goto end

:end
