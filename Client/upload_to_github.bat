@echo off
echo =========================================================
echo    UltrON GitHub Release Uploader
echo =========================================================
echo.
echo Please enter your GitHub Personal Access Token (starts with ghp_):
set /p GITHUB_TOKEN="Token: "

if "%GITHUB_TOKEN%"=="" (
    echo.
    echo [ERROR] No token entered. Exiting...
    pause
    exit /b
)

echo.
echo Uploading UltrON.exe to GitHub release v1.0.0...
python publish_release.py

echo.
pause
