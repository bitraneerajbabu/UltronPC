@echo off
echo ===================================================
echo     RajAPI Frontend Deployer (Raspberry Pi)
echo ===================================================
echo.
echo Please enter your Raspberry Pi password when prompted.
echo.

set /p PI_IP="Enter Raspberry Pi IP Address (e.g. 192.168.1.100) or hostname: "

echo.
echo Deploying updated frontend code to %PI_IP%...
scp -r "%~dp0server\frontend\dist" pi@%PI_IP%:/home/pi/rajapi_backend/frontend/

echo.
echo ===================================================
echo     DEPLOY COMPLETE!
echo     Please hard-refresh rajapi.com (Ctrl+Shift+R)
echo ===================================================
pause
