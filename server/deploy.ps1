# Run this from your machine on the Pi's network (192.168.1.x)
# Usage: .\deploy.ps1
# Prerequisites:
#   1. SSH key-based auth configured: ssh-copy-id pi@raj.local
#   2. Passwordless sudo for rajapi on Pi:
#      echo "pi ALL=(ALL) NOPASSWD: /bin/systemctl restart rajapi" | sudo tee /etc/sudoers.d/rajapi

$PI = "pi@raj.local"
$REMOTE = "/home/pi/rajapi_server/backend"
$LOCAL = Join-Path $PSScriptRoot "."

Write-Host "=== Deploying RajAPI server updates ===" -ForegroundColor Cyan

# 1. Python backend files
Write-Host "`n[1/4] Copying Python backend files..." -ForegroundColor Yellow
scp "$LOCAL\backend\app\services\__init__.py" "${PI}:${REMOTE}/app/services/"
scp "$LOCAL\backend\app\api\endpoints\commands.py" "${PI}:${REMOTE}/app/api/endpoints/"
scp "$LOCAL\backend\app\api\endpoints\broadcasts.py" "${PI}:${REMOTE}/app/api/endpoints/"
scp "$LOCAL\backend\app\api\endpoints\tgpcb_sync.py" "${PI}:${REMOTE}/app/api/endpoints/"
scp "$LOCAL\backend\app\api\endpoints\sites.py" "${PI}:${REMOTE}/app/api/endpoints/"
scp "$LOCAL\backend\app\core\config.py" "${PI}:${REMOTE}/app/core/"
scp "$LOCAL\backend\app\main.py" "${PI}:${REMOTE}/app/"
scp "$LOCAL\backend\app\models\core.py" "${PI}:${REMOTE}/app/models/"
scp "$LOCAL\backend\app\schemas\api_models.py" "${PI}:${REMOTE}/app/schemas/"

# 2. Frontend dist
Write-Host "`n[2/4] Copying frontend build..." -ForegroundColor Yellow
scp -r "$LOCAL\frontend\dist\*" "${PI}:${REMOTE}/frontend/dist/"

# 3. Restart service using key-based auth + passwordless sudo
Write-Host "`n[3/4] Restarting rajapi service..." -ForegroundColor Yellow
ssh "${PI}" "sudo systemctl restart rajapi"
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to restart rajapi service. Check SSH key setup." -ForegroundColor Red
    exit 1
}

# 4. Health check
Write-Host "`n[4/4] Running health check..." -ForegroundColor Yellow
Start-Sleep -Seconds 3
$health = ssh "${PI}" "curl -sf http://localhost:8000/api/v1/sites/ > /dev/null && echo 'healthy' || echo 'failed'"
if ($health -eq 'healthy') {
    Write-Host "API health check: OK" -ForegroundColor Green
} else {
    Write-Host "WARNING: API health check failed — service may still be starting." -ForegroundColor Yellow
}

Write-Host "`n=== Deployment complete! ===" -ForegroundColor Green
