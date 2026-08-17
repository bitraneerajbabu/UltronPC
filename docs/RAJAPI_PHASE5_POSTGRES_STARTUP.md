# RajAPI — Phase 5C PostgreSQL Startup Fix Report

**Date:** 2026-08-14 · **Scope:** Step 3 only (approved) — FastAPI systemd startup dependency · **Server:** pi@raj.local (192.168.137.30)

---

## Previous dependency (broken)

`rajapi-python.service` declared:
```
After=network.target postgresql.service
Wants=postgresql.service
```
`postgresql.service` does not exist on this system — PostgreSQL runs as the Docker container `ultron_db` (`postgres:17-alpine`, restart `unless-stopped`, data in `/home/pi/ultron_db_data`). Both directives were silent no-ops → uvicorn raced the container at boot → observed SQLAlchemy DB traceback (journal 12:36:43) and a second exit-code crash (13:04:38); NRestarts had reached 2.

## New dependency (implemented)

```
[Unit]
Description=RajAPI Python Backend (v1.0.10)
After=network.target docker.service
Wants=docker.service
StartLimitBurst=6
StartLimitIntervalSec=120s

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/rajapi_server/backend
ExecStartPre=/bin/bash -c 'timeout 90 bash -c "until /usr/bin/docker exec ultron_db pg_isready -U ultron_admin -d ultron_central -q >/dev/null 2>&1; do sleep 2; done"'
ExecStart=/home/pi/rajapi_server/backend/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8081
Restart=always
RestartSec=10
EnvironmentFile=/home/pi/rajapi_server/backend/.env

[Install]
WantedBy=multi-user.target
```

## Readiness mechanism

- `docker.service` dependency replaces the dead `postgresql.service`.
- `ExecStartPre` polls **PostgreSQL readiness**, not container existence: `docker exec ultron_db pg_isready -U ultron_admin -d ultron_central -q`, retry every 2 s.
- `pg_isready` requires **no credentials** (readiness probe only, verifies the server accepts connections) — nothing secret in the unit. Unit confirmed secret-free: 0 occurrences of `DATABASE_URL`, 0 of `postgresql.service`.
- Verified in the running container before use: `pg_isready` present at `/usr/local/bin/pg_isready` (official postgres image).
- DB parameters confirmed against the env file (password redacted): host `localhost`, port `5432`, user `ultron_admin`, database `ultron_central`.

## Timeout

- `timeout 90` bounds the wait. If the DB never becomes ready within 90 s the unit fails; `Restart=always` retries — no infinite hang, no silent stall.
- Confirmed startup-time behavior: restart → pg_isready gate (DB already up → passed instantly) → uvicorn boot + startup migrations (~7 s total) → serving.

## StartLimit configuration

- `StartLimitBurst=6`, `StartLimitIntervalSec=120s` (was default 5/10 s — too tight for a slow DB boot; could lock the unit into `failed` and require manual `reset-failed`).
- With the 90 s ExecStartPre bound and 10 s RestartSec, the 6-per-120 s limit only trips on a genuine rapid crash loop — transient DB startup delays can never permanently block recovery.

## Verification results

| Check | Result |
|---|---|
| systemd-analyze verify | OK (no warnings) |
| daemon-reload | clean; loaded props: After=docker.service, Wants=docker.service, StartLimit 6/2min, RestartSec=10 |
| Restart (only rajapi-python) | clean start, MainPID 5760, NRestarts **0** |
| Startup log | `Application startup complete. Uvicorn running on http://127.0.0.1:8081` — **no DB traceback, no crash**; auto-migration checks passed (proves DB connectivity) |
| PostgreSQL connectivity | `SELECT 1` → 1 |
| GET health-equivalent | `/api/v1/cpcb/status` with key → **200** (no-key probe → 403, expected auth behavior) |
| /api/v1/quality/ with key | **200** |
| rajapi.com | **200** |
| Login (loopback, key never printed) | **200** |
| Sites GET (loopback, key) | **200** |
| NRestarts | **0** |
| Client traffic | heartbeats/sync from live plants flowing (200s every ~5 s) |
| rust :8080 | unaffected (404 root = baseline), still listening |

## Rollback backup

`/home/pi/rajapi_backups/20260814_startup/rajapi-python.service.bak` (pre-change unit, root:root).
Rollback: restore file → `systemctl daemon-reload` → `systemctl restart rajapi-python` → verify health.

## Services restarted

**Only `rajapi-python.service`** (one restart). Not touched: PostgreSQL, Docker containers/daemon, nginx, cloudflared, `rajapi.service` (Rust), frontend, backend source, database, plant records. Pi not rebooted.

## Secrets

None printed in this report. No passwords/keys in the unit. One prior-session output incident (a DB password echoed once by an unredacted grep in a probe script) is documented in the conversation; it touched no file, log, or repository — recommend rotating that credential in a future approved step.

---

**Scope respected:** monitoring, rclone, nginx policy, reboot testing, plant fixes — NOT implemented. Awaiting approval for Step 4 or anything else.
