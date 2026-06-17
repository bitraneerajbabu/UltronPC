@echo off
echo ===================================================
echo     RajAPI Server Updater (Raspberry Pi)
echo ===================================================
echo.
echo Please enter your Raspberry Pi password when prompted.
echo.

echo [1/3] Uploading new installer file to Raspberry Pi...
scp "C:\Users\sunsh\OneDrive\Music\UltrON\server\backend\downloads\UltrON_Installer.exe" pi@ultron.local:/home/pi/rajapi_server/backend/downloads/

echo.
echo [2/3] Uploading updated API script to Raspberry Pi...
scp "C:\Users\sunsh\OneDrive\Music\UltrON\server\backend\app\api\endpoints\downloads.py" pi@ultron.local:/home/pi/rajapi_server/backend/app/api/endpoints/

echo.
echo [3/3] Restarting the RajAPI service...
ssh pi@ultron.local "sudo systemctl restart rajapi"

echo.
echo ===================================================
echo     UPDATE COMPLETE!
echo     Please refresh rajapi.com in your browser.
echo ===================================================
pause
