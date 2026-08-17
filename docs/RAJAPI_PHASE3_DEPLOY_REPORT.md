# RajAPI.com — Phase 3 Production Deployment Report

**Date:** 2026-08-14 · **Server:** pi@raj.local (192.168.137.30) · **Scope:** FRONTEND ONLY

## 1. Deployment: **PASS**

## 2. Previous deployment backup path
`/home/pi/rajapi_www_backup_20260814_115327.tar.gz` (19,923,970 bytes · SHA256 `50699caf054428eef41e550002c502cb624e3f6196c4ca1ac704db27c2117b96`)
Full `/var/www/rajapi` snapshot (141 files, 65 MB incl. all legacy bundles), created BEFORE any change; spot-verified (141 files + 2 dir entries, index.html present). Backup kept on Pi.

## 3. New deployment path
`/var/www/rajapi` (nginx document root, unchanged config)

## 4. Build version/hash
- Phase 2 verified build from `server/frontend/dist` — no rebuild, no new deps
- `assets/index-BnkNGb3t.js` SHA256 `abe738aff990b9c3e8d5a56aa1fea02a8e12b9ebb870824c9724f54138f8ac91` (identical on local disk, Pi staging, and live server — verified 3×)
- `assets/index-COdSUdb4.css` SHA256 `8080c25e3e8527d84ef747babc0a28da665faec0943f50488123f9286b04b72c`
- `index.html` references only `index-BnkNGb3t.js` + `index-COdSUdb4.css`

## 5. File count
90 files (was 141 — old dead bundles removed; non-build files `station-telemetry.html`, `theme-dark-teal.css`, `patch_html*.py`, `index.html.bak`, `llms.txt`, `robots.txt` preserved)

## 6. Total deployment size
2.0 MB (was 65 MB)

## 7. HTTPS result
**PASS** — `https://rajapi.com/` 200, `/assets/index-BnkNGb3t.js` 200, `/sw.js` 200 (through Cloudflare edge). Note: during testing the Pi rebooted (power/network event, unrelated to deploy), dropping the tunnel ~30 min; after reboot all services came back `active` and HTTPS verified 200 again. Deploy files verified intact post-reboot.

## 8. Login result
**PASS** — production login form → username + admin key → dashboard rendered; `/api/v1/auth/login` returned 200; invalid key rejected 403

## 9. Screen-by-screen result (browser E2E, headless Chrome, desktop 1440×900, real production HTTPS)
| Screen | Result |
|---|---|
| Dashboard | PASS |
| Sites | PASS |
| UltrON Clients | PASS |
| Broadcast Center | PASS |
| AMC & Control | PASS |
| Regulatory | PASS |
| Reports | PASS |
| Commands | PASS |
| Notifications | PASS |
| Activity | PASS |
| Users (placeholder) | PASS |
| Roles (placeholder) | PASS |
| Settings (placeholder) | PASS |
| Audit Trail (placeholder) | PASS |

## 10. Console result
**PASS** — 0 unexpected errors

## 11. Network result
**PASS** — 0 failed requests, 0 unexpected 4xx/5xx; 17 API responses logged, all 200

## 12. API smoke-test result
**PASS** (read-only) — login 200; `sites/`, `sites/locks/summary`, `broadcasts/`, `cpcb/status`, `cpcb/summary`, `quality/`, `alarms/`, `alarms/stats` all 200 via production HTTPS; bad admin key → 403. No state-changing calls made (no sites/broadcasts created/deleted, no locks/AMC/alarms touched).

## 13. Backend changes = **NONE**
## 14. Database changes = **NONE**
## 15. nginx changes = **NONE** (config untouched, no reload)
## 16. systemd changes = **NONE** (cloudflared, nginx, rajapi all still `active`)

## 17. Rollback backup verified = **PASS**
- Archive exists, 19.9 MB, 143 tar entries (141 files + 2 dirs), index.html spot-checked, SHA recorded, stored in `/home/pi/`
- Live deployment hashes recorded pre- and post-swap (see §4)

## 18. Rollback procedure
```
ssh pi@raj.local
tar -xzf /home/pi/rajapi_www_backup_20260814_115327.tar.gz -C /var/www
# restores old index.html + assets (index-OMr4Gfv4.v4.js + inter fonts + workbox)
find /var/www/rajapi -type d -exec chmod 755 {} + ; find /var/www/rajapi -type f -exec chmod 755 {} +
chown -R pi:pi /var/www/rajapi
curl -sI https://rajapi.com/ && curl -s https://rajapi.com/assets/index-OMr4Gfv4.v4.js | head -c 100
```
Verify: rajapi.com loads, login works, APIs respond. No code/debugging changes on production — restore only.

---

**Incident log:** 12:44 IST — Cloudflare Tunnel error 1033 during E2E; root cause = Pi rebooted (services down → tunnel down). Not deploy-related. Pi returned with all services `active`; deploy verified intact; testing completed. **Deployment complete and verified.**