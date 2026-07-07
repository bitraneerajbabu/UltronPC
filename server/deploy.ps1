# Run this from your machine on the Pi's network (192.168.1.x)
# Usage: .\deploy.ps1
# Prerequisites:
#   1. SSH key-based auth configured: ssh-copy-id pi@raj.local
#   2. Passwordless sudo for rajapi on Pi:
#      echo "pi ALL=(ALL) NOPASSWD: /bin/systemctl restart rajapi" | sudo tee /etc/sudoers.d/rajapi

$PI = "pi@raj.local"
$REMOTE = "/home/pi/rajapi_server/backend"
$LOCAL = $PSScriptRoot

Write-Host "=== Deploying RajAPI server updates ===" -ForegroundColor Cyan

# 1. Python backend files
Write-Host "`n[1/4] Copying Python backend files..." -ForegroundColor Yellow
ssh "${PI}" "mkdir -p ${REMOTE}/app"
scp -r "$LOCAL/backend/app/*" "${PI}:${REMOTE}/app/"

# 2. Frontend dist
Write-Host "`n[2/4] Copying frontend build..." -ForegroundColor Yellow
ssh "${PI}" "mkdir -p /var/www/rajapi"
scp -r "$LOCAL/frontend/dist/." "${PI}:/var/www/rajapi/"
ssh "${PI}" "sudo chmod -R 755 /var/www/rajapi"

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
$health = ssh "${PI}" "if curl -sf http://localhost:8000/api/v1/sites/ >/dev/null; then echo 'healthy'; else echo 'failed'; fi"
if ($health -eq 'healthy') {
    Write-Host "API health check: OK" -ForegroundColor Green
} else {
    Write-Host "WARNING: API health check failed - service may still be starting." -ForegroundColor Yellow
}

Write-Host "`n=== Deployment complete! ===" -ForegroundColor Green
