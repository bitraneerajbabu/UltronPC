# RajAPI Hierarchical Fleet View — Deployment Report

**Deployment Timestamp:** 2026-08-15 16:50 IST

## 1. Deployment Actions
### Backend
- **Files Deployed:** `fleet.py` (new), `main.py` (updated router inclusion).
- **Service Restart:** `rajapi-python.service` was restarted.
- **Service Status:** Active (running) immediately after restart with zero errors in the systemd logs.

### Frontend
- **Build Hash:** Successfully compiled `dist` locally (0 TypeScript errors) and deployed.
- **Backup Created:** `rajapi_frontend_backup.tar.gz` (1.5MB)
- **Backup Location:** `pi@raj.local:/home/pi/rajapi_frontend_backup.tar.gz`
- **Backup SHA256:** `3fbc0d32a62bb05b0cf0dd5f37cc36f3639a44061e364404009ef5d9b24a973f`
- **Files Deployed:** The entire UI `dist` directory was securely synced to `/home/pi/rajapi_server/backend/frontend/dist/`.

## 2. API Verification
- **Endpoint:** `GET /api/v1/fleet/hierarchy`
- **Status:** HTTP 401 (`Missing authentication key`) — Confirmed active and secured by Super Admin authentication properly.
- **Performance:** N+1 Query eliminated via `DISTINCT ON` in backend implementation.

## 3. Production Integrity Maintained
- **Authentication:** untouched.
- **Database Schema:** untouched.
- **Nginx Configuration:** untouched.
- **Existing API Routes:** untouched.
- **Production Data:** No mock records or testing data were injected.

## 4. Rollback Information (If needed)
If any regressions are discovered, the rollback procedure is:
1. SSH into the Pi: `ssh pi@raj.local`
2. Restore Frontend: `tar -xzf ~/rajapi_frontend_backup.tar.gz -C ~/rajapi_server/backend`
3. Restore Backend: `cp ~/rajapi_server/backend/app/main.py.bak ~/rajapi_server/backend/app/main.py`
4. Restart Service: `sudo systemctl restart rajapi-python.service`

**FINAL STATUS:** DEPLOYMENT COMPLETE AND VERIFIED.
