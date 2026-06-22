# Run this from your machine on the Pi's network (192.168.1.x)
# Usage: .\deploy.ps1

$PI = "pi@ultron.local"
$REMOTE = "/home/pi/rajapi_backend"
$LOCAL = "C:\Users\sunsh\OneDrive\Music\UltrON\server"

Write-Host "=== Deploying RajAPI server updates ===" -ForegroundColor Cyan

# 1. Python backend files
Write-Host "`n[1/4] Copying Python backend files..." -ForegroundColor Yellow
scp "$LOCAL\backend\app\services\mqtt_publisher.py" "${PI}:${REMOTE}/app/services/"
scp "$LOCAL\backend\app\services\__init__.py" "${PI}:${REMOTE}/app/services/"
scp "$LOCAL\backend\app\api\endpoints\commands.py" "${PI}:${REMOTE}/app/api/endpoints/"
scp "$LOCAL\backend\app\api\endpoints\broadcasts.py" "${PI}:${REMOTE}/app/api/endpoints/"
scp "$LOCAL\backend\app\api\endpoints\tgpcb_sync.py" "${PI}:${REMOTE}/app/api/endpoints/"
scp "$LOCAL\backend\app\core\config.py" "${PI}:${REMOTE}/app/core/"
scp "$LOCAL\backend\app\main.py" "${PI}:${REMOTE}/app/"
scp "$LOCAL\backend\app\models\core.py" "${PI}:${REMOTE}/app/models/"
scp "$LOCAL\backend\app\schemas\api_models.py" "${PI}:${REMOTE}/app/schemas/"

# 2. Frontend dist
Write-Host "`n[2/4] Copying frontend build..." -ForegroundColor Yellow
scp -r "$LOCAL\frontend\dist\*" "${PI}:${REMOTE}/frontend/dist/"

# 3. Install gmqtt on Pi
Write-Host "`n[3/4] Installing gmqtt on Pi..." -ForegroundColor Yellow
ssh "${PI}" "pip install --break-system-packages gmqtt"

# 4. Restart service
Write-Host "`n[4/4] Restarting rajapi service..." -ForegroundColor Yellow
$pw = Read-Host -Prompt "Enter sudo password for pi" -AsSecureString; $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($pw); $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr); echo $plain | ssh "${PI}" "sudo -S systemctl restart rajapi"

Write-Host "`n=== Deployment complete! ===" -ForegroundColor Green
