@echo off
echo ===================================================
echo     RajAPI Backend Deployer (Raspberry Pi)
echo ===================================================
echo.
echo Please enter your Raspberry Pi password when prompted.
echo.

set /p PI_IP="Enter Raspberry Pi IP Address (e.g. 192.168.1.100): "

echo.
echo Uploading updated backend files to %PI_IP%...
scp "%~dp0server\backend\app\schemas\api_models.py" pi@%PI_IP%:/home/pi/rajapi_server/backend/app/schemas/api_models.py
scp "%~dp0server\backend\app\api\endpoints\sites.py" pi@%PI_IP%:/home/pi/rajapi_server/backend/app/api/endpoints/sites.py
scp "%~dp0server\backend\app\api\endpoints\sync.py" pi@%PI_IP%:/home/pi/rajapi_server/backend/app/api/endpoints/sync.py
scp "%~dp0server\backend\app\api\endpoints\broadcasts.py" pi@%PI_IP%:/home/pi/rajapi_server/backend/app/api/endpoints/broadcasts.py
scp "%~dp0server\backend\app\models\core.py" pi@%PI_IP%:/home/pi/rajapi_server/backend/app/models/core.py
scp "%~dp0server\backend\migrate_add_last_sync.py" pi@%PI_IP%:/home/pi/rajapi_server/backend/migrate_add_last_sync.py

echo.
echo Running database migration on Pi...
ssh pi@%PI_IP% "cd /home/pi/rajapi_server/backend && python3 migrate_add_last_sync.py"

echo.
echo Restarting the RajAPI backend service on Pi...
ssh pi@%PI_IP% "sudo systemctl restart rajapi-python"

echo.
echo ===================================================
echo     BACKEND DEPLOY COMPLETE!
echo     RajAPI backend has been updated and restarted.
echo ===================================================
pause
