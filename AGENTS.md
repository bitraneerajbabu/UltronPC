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
- **IP/Host:** raj.local (Raspberry Pi 5, Debian 13, aarch64)
- **Services:** nginx (port 80) → uvicorn (port 8080), PostgreSQL in Docker (port 5432), cloudflared tunnel to rajapi.com
- **WARNING:** No HTTPS — all traffic plain HTTP. Cloudflare edge has HTTPS, but origin connection is HTTP
- **Secrets file:** `/home/pi/rajapi_server/backend/.env` (world-readable — FIX: restrict to 600)
- **Running instance:** `/home/pi/rajapi_backend/` (no .env file — falls back to empty defaults)
- **Systemd points to:** `/home/pi/rajapi_server/backend/` (different directory, has .env)
- **DB:** PostgreSQL 15 Alpine in Docker, user `ultron_admin`, password `<REDACTED>`, database `ultron_central`
- **API keys:** Static, stored in DB plaintext. No JWTs.
- **Login:** Returns `admin_key` in response body (plaintext echo)

## Latest Session (2026-07-07) — UltrON v1.0.69 Release & Fixes
- **APP_VERSION:** `1.0.69` — EXE built at `client/backend/ultron_backend/dist/UltrON.exe` (40.0 MB)
- **PyInstaller Hidden Imports:** Added `psutil` system monitoring library to PyInstaller hidden imports list in `UltrON.spec` to fix `ModuleNotFoundError` on client PC.
- **SQLite Concurrency & Write Contention:** Integrated semaphores, randomized backoffs, and jitter in the polling engine to prevent database write conflicts.
- **Header Cleanups:** Removed the duplicate logo in `App.tsx` header (keeping it only in the navigation-rail sidebar).
- **Server Fleet Monitoring & OTA:** Implemented modern dashboards, fleet tracking, and OTA updates with appropriate fallback routes for legacy clients.
- **Pi Security Hardening & MQTT Proxy (v1.0.66):** Restricted MQTT listener ports (1883/9001) to loopback `127.0.0.1`, set up Nginx WebSocket reverse-proxy for dashboard connectivity, and fixed `.rajapi_secrets.env` VAPID loading.

## Previous Session (2026-06-30) — Edit Gateway Rule Fixes
- **Fixed `handleChange` NaN bug in `DevicesScreen.tsx:129-137`:** Number inputs (`scale_factor`, `offset`, etc.) stored raw string value instead of `Number(value)`. `Number("-")` → `NaN` → React renders blank, losing negative sign. Now converts to number only at save time.
- **Fixed `description` overwrite (`DevicesScreen.tsx:196-207`):** Removed `description: form.station_name` from parameter save payload — no longer corrupts parameter description with station name.
- **Numeric fields converted on save (`DevicesScreen.tsx:203-208`):** Added explicit `Number()` conversion for 13 numeric fields in `handleSave` payload, with NaN guard.
- **Device update numeric fields (`DevicesScreen.tsx:157-175`):** Added `toNum()` helper for device-level fields (`slave_id`, `baud_rate`, etc.) to handle string → number conversion with fallback.
- Fixed `===` → `==` in AppContext (`:607,614`) for `editParameter`/`deleteParameter`
- Removed hardcoded `host: '192.168.1.101'`/`port: '502'`/`slave_id: '1'` from DEFAULT_PARAM (`:33`)

## Guardrails
- **Master password (Master/Ultronpoiu) is LOCKED.** Never change it via API or direct DB edit unless Dev explicitly says "change the Master password". The PATCH `/users/{id}` endpoint rejects password changes for user Master. Intentional — manual DB update only.
