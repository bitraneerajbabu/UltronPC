# RajAPI — Phase 5D nginx Recovery Fix Report

**Date:** 2026-08-14 · **Scope:** Step 4 only (approved) — nginx restart/recovery policy · **Server:** pi@raj.local (192.168.137.30)

---

## Previous configuration

- Unit: packaged `/usr/lib/systemd/system/nginx.service` (Type=forking, PIDFile=/run/nginx.pid, KillMode=mixed, TimeoutStopSec=5).
- `Restart=no` — nginx would NOT auto-recover if the process died unexpectedly.
- `RestartSec` = n/a (no restart). StartLimit: systemd defaults **5 restarts / 10 s**.
- No drop-in directory existed (`/etc/systemd/system/nginx.service.d` absent).

## New configuration

Drop-in `/etc/systemd/system/nginx.service.d/restart.conf` (smallest safe change):

```
[Service]
Restart=always
RestartSec=3
```

- nginx now auto-restarts on any unexpected exit, 3 s delay.
- **Start-rate limiting retained**: systemd defaults 5 restarts / 10 s still apply — a genuinely broken nginx hits the limit, the unit enters `failed`, and the loop stops (no infinite restart loop).
- **Normal reload behavior unchanged**: drop-in touches only `Restart`/`RestartSec`; `ExecReload` (`nginx -s reload`) untouched; `ExecStop`/`TimeoutStopSec`/`KillMode` untouched.
- No nginx configuration files (`nginx.conf`, sites) modified.

## Backup location

- `/home/pi/rajapi_backups/20260814_nginx/nginx.service.bak` — original packaged unit.
- Note: no pre-existing drop-in files to back up (directory did not exist before this change).

## nginx -t result

- Pre-change (root): `syntax is ok … test is successful`.
- Post-change (root): `syntax is ok … test is successful`.

## systemd verification

- `systemd-analyze verify nginx.service` → OK (no warnings).
- `daemon-reload` → clean.
- Loaded properties after reload: `Restart=always`, `RestartSec=3`, `StartLimitBurst=5`, `StartLimitIntervalUSec=10s` (defaults retained), `ActiveState=active`.

## HTTPS result

- `https://rajapi.com` → **200** (unchanged).

## RajAPI API result

- Login (loopback, key never printed) → **200**
- Sites GET (loopback, key) → **200**
- `/api/v1/cpcb/status` (loopback, key) → **200**

## Service status

- `nginx` active, **NRestarts = 0** — nginx was NOT restarted or killed during this step (drop-in takes effect on the next process start; no restart loop observed).
- `rajapi`, `rajapi-python`, `docker`, `cloudflared` — all `active`.

## Rollback procedure

```
sudo rm /etc/systemd/system/nginx.service.d/restart.conf
sudo systemctl daemon-reload
# policy reverts to Restart=no on next nginx start; no restart required for the change itself
```
(If the packaged unit ever needs restoring: copy back `nginx.service.bak` to `/usr/lib/systemd/system/nginx.service`, daemon-reload.)

## Scope / secrets

- Not touched: RajAPI/FastAPI, PostgreSQL, Docker, cloudflared, frontend, database, UltrON, CPCB/SPCB, Broadcast, AMC, plant records. Pi NOT rebooted. nginx config files untouched.
- No credentials printed; no key/cert values exposed (the earlier `nginx -t` permission error was simply the non-root run lacking read access to `/etc/ssl/private/rajapi.key` — resolved by running the test as root; config itself was always valid).

---

**Stopped after Step 4.** Not implemented: rclone, monitoring, UptimeRobot, plant fixes, reboot testing, credential rotation — each awaits separate approval.