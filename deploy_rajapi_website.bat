@echo off
echo ===================================================
echo     RajAPI Website Landing Page Deployer (Raspberry Pi)
echo ===================================================
echo.
echo Please enter your Raspberry Pi password when prompted.
echo.

set /p PI_IP="Enter Raspberry Pi IP Address (e.g. 192.168.1.100) or hostname: "

echo.
echo Building static export...
cd rajapi_website
call npm run build
cd ..

echo.
echo Deploying updated landing page code to %PI_IP%...
ssh pi@%PI_IP% "mkdir -p /var/www/rajapi_website"
scp -r "%~dp0rajapi_website\out\." pi@%PI_IP%:/var/www/rajapi_website/
ssh pi@%PI_IP% "sudo chmod -R 755 /var/www/rajapi_website"

echo.
echo ===================================================
echo     DEPLOY COMPLETE!
echo     The landing page is in /var/www/rajapi_website
echo     Make sure Nginx is configured to serve it!
echo ===================================================
pause
