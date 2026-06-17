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
scp server\backend\app\api\endpoints\sites.py pi@%PI_HOST%:/home/pi/rajapi_server/backend/app/api/endpoints/sites.py
scp server\backend\app\api\endpoints\sync.py pi@%PI_HOST%:/home/pi/rajapi_server/backend/app/api/endpoints/sync.py
scp server\backend\app\models\core.py pi@%PI_HOST%:/home/pi/rajapi_server/backend/app/models/core.py
scp server\backend\app\schemas\api_models.py pi@%PI_HOST%:/home/pi/rajapi_server/backend/app/schemas/api_models.py
scp server\backend\migrate_add_last_sync.py pi@%PI_HOST%:/home/pi/rajapi_server/backend/migrate_add_last_sync.py

echo.
echo ------ [2/5] Deploying frontend dist/ ------
scp -r server\frontend\dist pi@%PI_HOST%:/home/pi/rajapi_server/frontend/

echo.
echo ------ [3/5] Deploying MQTT broker config ------
ssh pi@%PI_HOST% "mkdir -p /home/pi/rajapi_server/mqtt/config && mkdir -p /home/pi/rajapi_server/mqtt/data && mkdir -p /home/pi/rajapi_server/mqtt/log"
scp rajapi_server\config\mosquitto.conf pi@%PI_HOST%:/home/pi/rajapi_server/mqtt/config/mosquitto.conf
scp rajapi_server\docker-compose.yml pi@%PI_HOST%:/home/pi/rajapi_server/mqtt/docker-compose.yml

echo.
echo ------ [4/5] Running DB migration + Restarting backend ------
ssh pi@%PI_HOST% "cd /home/pi/rajapi_server/backend && python3 migrate_add_last_sync.py; sudo systemctl restart rajapi"

echo.
echo ------ [5/5] Starting MQTT broker (Docker) ------
ssh pi@%PI_HOST% "cd /home/pi/rajapi_server/mqtt && docker-compose up -d --remove-orphans"

echo.
echo =====================================================
echo   DEPLOY COMPLETE!
echo   - RajAPI backend restarted
echo   - Frontend updated
echo   - MQTT broker running at %PI_HOST%:1883
echo   Please hard-refresh rajapi.com (Ctrl+Shift+R)
echo =====================================================
pause
