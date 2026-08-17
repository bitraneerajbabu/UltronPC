# RajAPI — Phase 5A Credential Hardening Report

**Date:** 2026-08-14 · **Scope:** Steps 1–2 only (approved) · **Server:** pi@raj.local (192.168.137.30)

---

## 1. Previous permissions

| Path | Before |
|---|---|
| `/home/pi/rajapi_backend/.env` | **0664** (pi:pi) — world-readable, group-writable |
| `/etc/systemd/system/rajapi.service` | **0644** (pi:pi) — DB password inline in `Environment=` (world-readable) |
| `/home/pi/rajapi_server/backend/.env` | 0600 (pi:pi) — already correct, untouched |
| `/home/pi/rajapi_backend/rajapi.env` | did not exist |

## 2. New permissions

| Path | After |
|---|---|
| `/home/pi/rajapi_backend/.env` | **0600** (pi:pi) |
| `/etc/systemd/system/rajapi.service` | **0644 (root:root)** — no secrets in file |
| `/home/pi/rajapi_backend/rajapi.env` | **0600** (pi:pi) — new protected env file |

## 3. Owner / group

- All changed files: owner **pi**, group **pi**, mode **0600** — except the unit file, now **root:root 0644** (standard systemd practice, matches `rajapi-python.service`).

## 4. EnvironmentFile implementation

- Sensitive `DATABASE_URL` extracted from `rajapi.service` into `/home/pi/rajapi_backend/rajapi.env` (0600 pi:pi).
- Unit now loads it via `EnvironmentFile=/home/pi/rajapi_backend/rajapi.env` — confirmed loaded by systemd (`EnvironmentFiles=…rajapi.env (ignore_errors=no)`).
- Integrity gate before restart: env file = exactly 1 line, correct `DATABASE_URL=` prefix, **SHA-256 hash matched the source line byte-for-byte** (value copied exactly, nothing printed).
- Unit verified secret-free (`DATABASE_URL` occurrences in unit = 0), `systemd-analyze verify` passed.
- Non-secret `RUST_LOG` remains inline in the unit (harmless).

## 5. Systemd status

- `daemon-reload` → clean.
- `rajapi.service` restarted **only** (no other service touched): restart → `active (running)`, MainPID 5293, NRestarts 0.
- Service log: `RajAPI v3 listening on 127.0.0.1:8080` — clean start with the protected env file.
- Service identity unchanged: `User=pi`, `Restart=always`.

## 6. API health

- `http://127.0.0.1:8080/` → 404 (same as pre-change baseline — this server has no root route; normal).
- DB read-only probe `SELECT 1` → 1 (PostgreSQL reachable).
- `https://rajapi.com` → **200** (public reachable via tunnel).

## 7. Login verification (read-only, loopback, key never printed/transmitted publicly)

- `POST /api/v1/auth/login` (admin + env ADMIN_KEY) → **200**
- `GET /api/v1/sites/` with admin key → **200**
- Both loopback-only; key unset from shell afterwards.

## 8. Rollback backup location

`/home/pi/rajapi_backups/20260814_creds/`
- `rajapi.service.bak` — pre-change unit (includes inline secret, restored if ever needed; stored 0644 pi:pi)
- `rajapi.service.bak.pre-edit` — unit snapshot taken between backup and edit
- `rajapi_backend.env.bak` — pre-change `.env`

Rollback procedure (documented, not executed): restore `rajapi.service.bak` → `daemon-reload` → `systemctl restart rajapi` → verify health.

## 9. Secrets exposed in this report = **NONE**

- No password, ADMIN_KEY, ADMIN_PASSWORD, SECRET_KEY, JWT, or token value appears anywhere in this report or in any log/command transcript of this operation. Verification used SHA-256 hash comparison and prefix checks only.
- Secrets remain only in: `.env` (0600), `rajapi.env` (0600), and the offline rollback backup (0644 pi:pi, on-Pi, non-world-readable by any other user).

---

## Verification checklist (from approval)

- [x] `.env` permissions = 0600
- [x] `rajapi.env` permissions = 0600
- [x] systemd unit no longer contains plaintext DB password
- [x] RajAPI service = active (running, clean restart)
- [x] API = healthy (loopback probes pass)
- [x] rajapi.com = reachable (200)
- [x] login = working (200, loopback)
- [x] database connectivity = working (SELECT 1)
- [x] No state-changing API operations performed
- [x] No other service restarted (PostgreSQL / Docker / nginx / cloudflared / Rust / UltrON untouched)

**Scope respected:** rclone, OneDrive backup, nginx restart policy, PostgreSQL startup, monitoring, UptimeRobot, plant fixes, and reboot testing were NOT implemented — each awaits separate approval.
