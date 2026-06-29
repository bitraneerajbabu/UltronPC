@echo off
echo =====================================================
echo   UltrON Full Deploy  (Backend + Frontend + Pi)
echo =====================================================
echo.
echo This script will:
echo  [1] Deploy updated backend files to Raspberry Pi
echo  [2] Deploy freshly built frontend dist/ to Pi
echo  [3] Copy MQTT broker config to Pi
echo  [4] Restart RajAPI service + migrate DB
echo.
set /p PI_HOST="Enter Pi hostname or IP (default: rajapi.com): "
if "%PI_HOST%"=="" set PI_HOST=rajapi.com

echo.
echo ------ [1/5] Deploying backend Python files ------
scp "%~dp0server\backend\app\api\endpoints\sites.py" pi@%PI_HOST%:/home/pi/rajapi_backend/app/api/endpoints/sites.py
scp "%~dp0server\backend\app\api\endpoints\sync.py" pi@%PI_HOST%:/home/pi/rajapi_backend/app/api/endpoints/sync.py
scp "%~dp0server\backend\app\models\core.py" pi@%PI_HOST%:/home/pi/rajapi_backend/app/models/core.py
scp "%~dp0server\backend\app\schemas\api_models.py" pi@%PI_HOST%:/home/pi/rajapi_backend/app/schemas/api_models.py
scp "%~dp0server\backend\migrate_add_last_sync.py" pi@%PI_HOST%:/home/pi/rajapi_backend/migrate_add_last_sync.py

echo.
echo ------ [2/5] Deploying frontend dist/ ------
scp -r "%~dp0server\frontend\dist" pi@%PI_HOST%:/home/pi/rajapi_backend/frontend/

echo.
echo ------ [3/5] Deploying MQTT broker config ------
ssh pi@%PI_HOST% "mkdir -p /home/pi/rajapi_backend/mqtt/config && mkdir -p /home/pi/rajapi_backend/mqtt/data && mkdir -p /home/pi/rajapi_backend/mqtt/log"
scp "%~dp0rajapi_server\config\mosquitto.conf" pi@%PI_HOST%:/home/pi/rajapi_backend/mqtt/config/mosquitto.conf
scp "%~dp0rajapi_server\docker-compose.yml" pi@%PI_HOST%:/home/pi/rajapi_backend/mqtt/docker-compose.yml

echo.
echo ------ [4/5] Running DB migration + Restarting backend ------
ssh pi@%PI_HOST% "cd /home/pi/rajapi_backend && python3 migrate_add_last_sync.py; sudo systemctl restart rajapi"

echo.
echo ------ [5/5] Starting MQTT broker (Docker) ------
ssh pi@%PI_HOST% "cd /home/pi/rajapi_backend/mqtt && docker-compose up -d --remove-orphans"

echo.
echo =====================================================
echo   DEPLOY COMPLETE!
echo   - RajAPI backend restarted
echo   - Frontend updated
echo   - MQTT broker running at %PI_HOST%:1883
echo   Please hard-refresh rajapi.com (Ctrl+Shift+R)
echo =====================================================
pause
