@echo off
echo ===================================================
echo     RajAPI Server Full Deploy (rajapi.com Pi)
echo ===================================================
echo.
echo Please enter your Raspberry Pi password when prompted.
echo.

set PI=pi@ultron.local
set REMOTE=/home/pi/rajapi_server

echo [1/5] Uploading backend API endpoints...
scp "%~dp0server\backend\app\api\endpoints\downloads.py" %PI%:%REMOTE%/backend/app/api/endpoints/
scp "%~dp0server\backend\app\api\endpoints\sites.py" %PI%:%REMOTE%/backend/app/api/endpoints/
scp "%~dp0server\backend\app\api\endpoints\spcb_sync.py" %PI%:%REMOTE%/backend/app/api/endpoints/
scp "%~dp0server\backend\app\api\endpoints\sync.py" %PI%:%REMOTE%/backend/app/api/endpoints/
scp "%~dp0server\backend\app\api\endpoints\broadcasts.py" %PI%:%REMOTE%/backend/app/api/endpoints/

echo.
echo [2/5] Uploading backend models and schemas...
scp "%~dp0server\backend\app\models\core.py" %PI%:%REMOTE%/backend/app/models/
scp "%~dp0server\backend\app\schemas\api_models.py" %PI%:%REMOTE%/backend/app/schemas/

echo.
echo [3/5] Uploading server main.py...
scp "%~dp0server\backend\app\main.py" %PI%:%REMOTE%/backend/app/

echo.
echo [4/5] Uploading fresh frontend dist/...
scp -r "%~dp0server\frontend\dist\." %PI%:%REMOTE%/frontend/dist/

echo.
echo [5/5] Restarting RajAPI service on Pi...
ssh %PI% "sudo systemctl restart rajapi rajapi-python && sleep 2 && sudo systemctl status rajapi rajapi-python --no-pager -l"

echo.
echo ===================================================
echo     DEPLOY COMPLETE!
echo     rajapi.com is now updated to v1.0.5 backend
echo     Hard-refresh rajapi.com (Ctrl+Shift+R)
echo ===================================================
pause
