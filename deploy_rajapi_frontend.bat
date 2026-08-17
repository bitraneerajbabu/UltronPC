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
ssh pi@%PI_IP% "mkdir -p /var/www/rajapi"
scp -r "%~dp0server\frontend\dist\." pi@%PI_IP%:/var/www/rajapi/
ssh pi@%PI_IP% "sudo chmod -R 755 /var/www/rajapi"

echo.
echo ===================================================
echo     DEPLOY COMPLETE!
echo     Please hard-refresh rajapi.com (Ctrl+Shift+R)
echo ===================================================
pause
