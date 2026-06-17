@echo off
echo ===================================================
echo     RajAPI Logo Updater (Raspberry Pi)
echo ===================================================
echo.
echo Please enter your Raspberry Pi password when prompted.
echo.

echo Uploading UltrON logo to Raspberry Pi...
scp "C:\Users\sunsh\OneDrive\Music\UltrON\client\frontend\public\assets\Ultron_logo.png" pi@ultron.local:/home/pi/rajapi_server/frontend/dist/assets/Ultron_logo.png

echo.
echo ===================================================
echo     UPLOAD COMPLETE!
echo     Please hard-refresh rajapi.com (Ctrl+Shift+R)
echo ===================================================
pause
