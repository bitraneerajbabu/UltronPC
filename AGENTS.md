# UltrON Project Context

## Team
- **Neeraj** — CEO/owner of Sunshine Technologies, product owner
- **Dev** — engineer/developer building UltrON (the person I'm working with)
- **Sunshine Technologies** — company behind UltrON

## Product Architecture
- **UltrON** — Industrial IoT platform for real-time telemetry, CPCB compliance, alarms
- **Client side** — Python/FastAPI backend + React/Vite frontend. Runs on a Windows PC at each plant
- **Central server** — (Repositories: RajAPI, KTPP2, Server). Neeraj's admin panel at rajapi.com to manage all clients, send broadcasts, lock/unlock AMC
- Each client runs their own UltrON instance; RajAPI aggregates all sites

## Key Context for Reviews
- CPCB compliance is core — quality codes `U`, `O`, `E`, `N` are CPCB standards
- Engineers at client sites know `U` = Valid/Good (CPCB standard)
- All references to "client" = the industrial plant using UltrON (not external customer of Sunshine)
- Neeraj uses RajAPI as admin panel to control all deployed clients remotely
- This is a deployed product (KTPP), not a greenfield project

## Audit History
- CSO Security Audit: 10 findings (2 CRIT, 4 HIGH, 4 MED). Key: .env.bak in git, static API key echoed in responses, CPCB path traversal, hardcoded encryption fallback
- CEO Strategy Review: product is industrial control platform, not telemetry dashboard. Regulatory compliance (CPCB) is a moat
- Senior Developer Code Review: 13 findings. DataQuality enum bug (good/bad/uncertain all = "U"), N+1 wind-direction queries, concurrency issues, hardcoded encryption fallback
- **RajAPI Server Audit (pi@raj.local):** 11 CRITICAL/HIGH findings. No HTTPS, secrets in world-readable .env, PostgreSQL exposed to LAN, API keys in URL query params, weak guessable passwords, dual codebase confusion, uvicorn bound to 0.0.0.0

## RajAPI Server (pi@raj.local) — Key Details
- **IP/Host:** raj.local (Raspberry Pi 3 B/B+, Raspberry Pi OS Lite 64-bit, 64GB SD Card, aarch64)
- **Services:** nginx (port 80) → uvicorn (port 8080), PostgreSQL in Docker (port 5432), cloudflared tunnel to rajapi.com
- **WARNING:** No HTTPS — all traffic plain HTTP. Cloudflare edge has HTTPS, but origin connection is HTTP
- **Secrets file:** `/home/pi/rajapi_server/backend/.env` (world-readable — FIX: restrict to 600)
- **Running instance:** `/home/pi/rajapi_backend/` (no .env file — falls back to empty defaults)
- **Systemd points to:** `/home/pi/rajapi_server/backend/` (different directory, has .env)
- **DB:** PostgreSQL 15 Alpine in Docker, user `ultron_admin`, password `<REDACTED>`, database `ultron_central`
- **API keys:** Static, stored in DB plaintext. No JWTs.
- **Login:** Returns `admin_key` in response body (plaintext echo)

## Latest Session (2026-08-19) — UltrON v1.1 Production Release & Full System Lock
- **Official Version:** Locked to `v1.1` (`1.1.0`) across backend (`config.py`), frontend (`package.json`), installer (`installer.iss`), and fleet sync (`rajapi_sync.py`).
- **CPCB 15-Minute Averaging & Annexure-I TXT Pipeline:**
  - Automated 15-min scheduler writes compliant flat files with `1,2,3,4,5,6,7,8,` header and `,0,0,0` normal flags.
  - Automatic folder/file creation (`os.makedirs`) and 95-interval FIFO rotation.
- **Warning High Limit Lock (`alarm_high` Capping):**
  - When real measured telemetry exceeds `alarm_high` (e.g. 88.0 vs limit 80.0), value is clamped to `alarm_high` (`80.00`) across Dashboard, Historian, Reports, and Cloud Pushes (SPCB, TGPCB, APPCB, TNPCB, RajAPI).
- **Strict Offline Exclusion & Zero Fake Data:**
  - When a device is offline/disconnected, telemetry is marked Quality `E` (`NA`) and completely skipped from state board pushes (no fake zeros, no dummy data, zero junk in `pending_uploads`).
  - Genuine `0.00` physical measurements are preserved as valid Quality `U`.
- **Modbus RTU & Serial Framing (`8-E-1`, `8-N-1`, etc.):**
  - Added Data Bits (`7`, `8`), Parity (`None`, `Even`, `Odd`), and Stop Bits (`1`, `2`) controls in Device Management.
  - Unrestricted Baud Rates (`1200` to `921600 bps` + custom entry).
- **5-Second Deterministic Modbus Loop:**
  - Multi-parameter batch polling on single slave, reads in ~1-2s, immediately closes/releases serial port, and holds in memory for the remainder of the 5-second interval.
- **State Board Outages & Backlog Flush:**
  - Failed live pushes (`HTTP 500`/timeout) queue into SQLite `pending_uploads` and flush rate-controlled to configured `delay_url` upon connectivity restoration.
- **Reports & Trends Synchronization:**
  - Reports: Multi-station ("All Stations") + single/multi parameter selection, normal & average modes (`1m` to `24h`), exported in **PDF, CSV, Excel**. Offline intervals display as `"NA"`.
  - Trends: Time-series line chart with threshold lines, exported exclusively in **PDF and PNG only**.
- **Role Hierarchy Enforced:** `SuperMaster` (Rank 1 Admin), `Master` (Rank 2 Admin), `Client` (Dashboard & Reports only).
- **E2E Practical Verification:** 100% test pass on `test_live_practical_verification.py`, `test_warning_high_lock.py`, and `test_server_push_guard.py`. Server live and serving on port 8000.

## Previous Session (2026-07-07) — UltrON v1.0.69 Release & Fixes

## Previous Session (2026-06-30) — Edit Gateway Rule Fixes
- **Fixed `handleChange` NaN bug in `DevicesScreen.tsx:129-137`:** Number inputs (`scale_factor`, `offset`, etc.) stored raw string value instead of `Number(value)`. `Number("-")` → `NaN` → React renders blank, losing negative sign. Now converts to number only at save time.
- **Fixed `description` overwrite (`DevicesScreen.tsx:196-207`):** Removed `description: form.station_name` from parameter save payload — no longer corrupts parameter description with station name.
- **Numeric fields converted on save (`DevicesScreen.tsx:203-208`):** Added explicit `Number()` conversion for 13 numeric fields in `handleSave` payload, with NaN guard.
- **Device update numeric fields (`DevicesScreen.tsx:157-175`):** Added `toNum()` helper for device-level fields (`slave_id`, `baud_rate`, etc.) to handle string → number conversion with fallback.
- Fixed `===` → `==` in AppContext (`:607,614`) for `editParameter`/`deleteParameter`
- Removed hardcoded `host: '192.168.1.101'`/`port: '502'`/`slave_id: '1'` from DEFAULT_PARAM (`:33`)

## Guardrails
- **Login accounts (2026-08-09):** `Master`/`Ultron123.0` (admin, no server mgmt page) and `SuperMaster`/`Ultron@9493` (admin, server mgmt page). Manually inserted into DB via script — no API path. The old "Ultronpoiu" password is dead; do not restore it.
- **Role hierarchy (2026-08-13):** `SuperMaster` is the ULTIMATE main admin — full control of everything (user mgmt, Server Management, resets, firmware, restart). `Master` is 2nd in rank with LIMITED usage (devices/params/calibration/logs/reports/settings — NO user mgmt, NO Server Management, NO resets/firmware/restart). `client` login = Dashboard + Reports ONLY (enforced: `App.tsx` allowedScreens + nav roles; calibration/contact removed for client). Backend enforcement: `require_super_admin` (new dep, `User.is_super_admin` column) on users router + settings reset/restart/firmware/rajapi/trigger-cpcb; `require_server_mgmt` on server_config + rajapi + cpcb routers; `require_admin` elsewhere. Frontend: `isSuperAdmin` from login response gates User Management tab + reset/firmware/restart buttons; `allowServerMgmt` gates Server Management nav. Master password locked (DB-only change, `users.py:108`).
