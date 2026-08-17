# RajAPI.com — Phase 5 Production Hardening Plan

**Date:** 2026-08-14 · **Mode:** PLANNING/AUDIT ONLY — nothing below has been implemented. Every fix awaits explicit approval.
**Baseline:** Phase 4 audit = PASS WITH WARNINGS.

---

## 1. Backup Architecture

### Current state (verified)

| Component | Status |
|---|---|
| Script | `/home/pi/backup_postgres.sh` (0700, pg_dump -Fc, retention 14, logs to `backup.log`) |
| Cron | 03:00 and 15:00 daily (crontab confirmed) |
| Last dump | `ultron_central_20260814_014519.dump` (260 KB, SHA f3c8ac9a…, manual run 01:45) |
| Cron reliability | **Fragile** — Pi was powered off at the 03:00 window on 08-14 (journal gap 01:45→12:36); backup did not run |
| Off-Pi copy | **NONE automated** — only copy is a manual download |
| rclone | Installed `v1.60.1-DEV` at `/usr/bin/rclone`; `~/.config/rclone/` exists but **empty** (no remotes, no credentials anywhere) |
| Restore | Verified (Phase 4: dump header PGDMP, hash matches off-Pi copy) |

### 1.1 Network connectivity (read-only probes, all FROM the Pi)

| Destination | Result |
|---|---|
| api.onedrive.com | 302 (reachable) |
| login.microsoftonline.com | 302 (OAuth reachable) |
| 1.1.1.1 | 301 (internet path OK) |
| api.github.com | 200 |
| rajapi.com | 200 |

Internet path from the Pi works — cloud backup is feasible.

### 1.2 Available backup destinations (evaluated)

| Option | Exists? | Verdict |
|---|---|---|
| **OneDrive (personal Microsoft account) via rclone** | Account exists (laptop syncs to OneDrive); rclone present; destination reachable | **SAFEST cloud option** — existing account, app-scoped OAuth token, no password stored, private folder, ~260 KB/day payload, 5 GB quota ample |
| USB drive attached to Pi | No USB drives present (`lsblk`: only mmcblk0 + zram0) | Second-tier option (off-SD but same-premises; survives SD failure, not site loss) |
| Another Linux/Windows peer via rsync/scp | Only peer = this laptop, which is already the **single point of failure** | Rejected — backup over the failing link |
| GitHub repo | Account only on laptop | Rejected — wrong tool for binary dumps, size limits |
| Restic/Borg + cloud | Not installed | Rejected — rclone already installed; extra binary not needed for 260 KB/day |

### 1.3 Security implications (rclone → OneDrive)

- OAuth app-permission token, scoped to the rclone app; **no Microsoft password ever stored on the Pi**.
- Token lives in `/home/pi/.config/rclone/rclone.conf` → **chmod 0600 pi:pi** immediately after creation.
- Credentials entered once, interactively, from the laptop browser (OAuth loopback).
- Dump files are plain pg_dump binary — the DB password itself is not in the dumps (pg_dump stores data, not credentials).

### 1.4 Proposed architecture (pending approval)

```
cron 03:00, 15:00   → backup_postgres.sh (existing)           local /home/pi/pg_backups/ (keep 14)
cron 15:20, @reboot → rclone push newest dump                 OneDrive:backups/rajapi/ (keep 30)
                      one-way copy only (copyto newest file; --min-age 30d cleanup)
```

- Boot catch-up: `@reboot` job dumps immediately if newest local dump is older than 24 h (compensates the powered-off-window failure mode).
- Remote keep-30 via `rclone delete --min-age 30d`.
- Verification: quarterly manual restore drill (already verified once).

**RECOMMENDATION: OneDrive via rclone. STOP — awaiting approval before any credential configuration.**

---

## 2. Credential Security (audit complete, no changes made)

### Current state (verified)

| Path | Owner:Group | Mode | Contains secrets | Required by |
|---|---|---|---|---|
| `/home/pi/rajapi_server/backend/.env` | pi:pi | **0600** | DATABASE_URL, SECRET_KEY, ADMIN_KEY | systemd (reads as root) → uvicorn runs as User=pi |
| `/home/pi/rajapi_backend/.env` | pi:pi | **0664** | DATABASE_URL | systemd → rajapi_server (Rust, User=pi) |
| `/etc/systemd/system/rajapi.service` | **pi:pi** | **0644** | **DATABASE_URL inline in `Environment=`** | systemd (root) |
| `/etc/systemd/system/rajapi-python.service` | root:root | 0644 | none (EnvironmentFile) | systemd (root) |
| `/etc/systemd/system/cloudflared.service` | root:root | 0644 | none | systemd (root) |
| Docker `ultron_db` container env | — | container-only | POSTGRES_PASSWORD (in container env, not on disk) | postgres init |
| `~/.config/rclone/` | pi:pi | 0755/empty | none | — |

### Access requirements (who really needs what)

| Reader | Needs | File |
|---|---|---|
| systemd (root) | yes — starts services, reads EnvironmentFile | units + .env files |
| pi | yes — owns both service processes (User=pi); manual ops; docker group member | env files (read), units (read via systemctl) |
| nginx / www-data / others | **none** | — |

### Proposed exact permissions (pending approval)

| Path | Proposed owner:group | Proposed mode | Change |
|---|---|---|---|
| `/home/pi/rajapi_server/backend/.env` | pi:pi | 0600 | none (already correct) |
| `/home/pi/rajapi_backend/.env` | pi:pi | **0600** | 0664 → 0600 |
| `/home/pi/rajapi.service` | **root:root** | 0644 | owner pi→root |
| DATABASE_URL in rajapi.service | moved to `EnvironmentFile=/home/pi/rajapi_backend/rajapi.env` (new file, **0600 pi:pi**) | | secret leaves the unit file |

Rationale: systemd reads units and EnvironmentFile as root (never blocked by 0600 pi:pi); pi owns both runtimes; no group/shared access needed. Unit becomes root-owned standard practice (matching rajapi-python.service).

**STOP — awaiting approval for the permission changes.**

---

## 3. PostgreSQL Startup Dependency (FastAPI)

### Actual dependency chain (verified, not assumed)

```
multi-user.target
  ├── docker.service          (After=network-online.target; Restart=always)
  │     └── containerd.service
  │           └── ultron_db container   (RestartPolicy=unless-stopped, no healthcheck)
  └── rajapi-python.service   (After=network.target postgresql.service; Wants=postgresql.service)
```

- `postgresql.service` **does not exist** on this system (PostgreSQL is the `ultron_db` Docker container) → `After=` and `Wants=` are silent no-ops. **This is the Phase 4 boot-race root cause.**
- Observed consequence: uvicorn started while the container was still initializing → SQLAlchemy connection failure (journal 12:36:43, NRestarts=2) → auto-recovered by `Restart=always` after a second crash at 13:04:38 (both exit-code failures, both auto-recovered).

### Current (verbatim structure)

```
[Unit]
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=pi
ExecStart=…/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8081
Restart=always
RestartSec=5
EnvironmentFile=/home/pi/rajapi_server/backend/.env
```

### Proposed (pending approval) — readiness-verified, not existence-based

```
[Unit]
After=network.target docker.service
Wants=docker.service

[Service]
Type=simple
User=pi
ExecStartPre=/bin/bash -c 'timeout 90 bash -c "until /usr/bin/docker exec ultron_db pg_isready -U ultron_admin -d ultron_central -q >/dev/null 2>&1; do sleep 2; done"'
ExecStart=…/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8081
Restart=always
RestartSec=10
StartLimitBurst=6
StartLimitIntervalSec=120s
EnvironmentFile=/home/pi/rajapi_server/backend/.env
```

- `pg_isready` inside the container verifies **PostgreSQL readiness** (accepts connections), not merely container existence.
- `timeout 90` bounds the wait; if the DB never comes up within 90 s the unit fails and `Restart=always` retries — no infinite hang.
- Raised `RestartSec` 5→10 and widened StartLimit window (default 5 per 10 s) so a slow boot cannot trigger a restart-limit lockout.
- Rust service (`rajapi.service`) already has `After=docker.service` — consistent with the corrected chain.

### Rollback

Backup the unit to `/home/pi/rajapi_backups/systemd/rajapi-python.service.bak`, then `systemctl daemon-reload && systemctl restart rajapi-python`; on failure, restore backup + reload + restart.

**STOP — awaiting approval before any systemd change.**

---

## 4. Service Recovery (audit complete, no changes made)

| Service | Starts at boot | Restart on failure | RestartSec | Restart-limit (start) | Health check today | Verdict |
|---|---|---|---|---|---|---|
| FastAPI (rajapi-python) | enabled | `always` | 5 s | default 5/10 s (too tight — crash-loop lockout risk) | none | Needs: pg_isready pre-wait (§3), RestartSec 10, wider StartLimit |
| Rust (rajapi) | enabled | `always` | 5 s | default | none | OK, keep |
| nginx | enabled | **`no`** | — | — | none | **Fix: Restart=always, RestartSec=3** (drop-in, no downtime) |
| cloudflared | enabled | `on-failure` + Type=notify | 5 s | TimeoutStartSec=15 | none | OK; notify-style is correct; 28-min boot stall was network-link absence, not a restart failure |
| PostgreSQL container | via docker.service | `unless-stopped` | — | — | none | OK; add `healthcheck` to container optional (monitor-side instead) |
| Docker daemon | enabled | `always` | — | 3/1 min | none | OK, keep |

**Conservative proposed restart policies (pending approval):**

| Service | Proposed policy |
|---|---|
| nginx | drop-in `/etc/systemd/system/nginx.service.d/restart.conf`: `Restart=always`, `RestartSec=3` |
| FastAPI | §3 (RestartSec 10, StartLimitBurst 6 / 120 s) |
| Rust / cloudflared / docker | **no change** (already conservative) |
| All | monitoring adds health checks (§5); systemd restarts are the last line, monitoring is the first |

No restart loop risk after the StartLimit fix: worst case a genuinely broken service hits the widened limit and stays failed **loudly** (monitoring alert), instead of silently cycling.

---

## 5. Monitoring Design (proposed, not implemented)

Constraint: Pi 3, no heavy stacks, no extra containers, no new packages (everything below ships with the OS). `bash + systemd timer + curl + psql + docker exec`.

### Components

1. **`/home/pi/monitor/health_check.sh`** — single bash script, run by systemd timer every 5 min:
   - Service state: `systemctl is-active` for rajapi, rajapi-python, nginx, cloudflared, docker
   - DB container: `docker ps --filter name=ultron_db` running?
   - FastAPI API: `curl -s -o /dev/null -w %{http_code} http://127.0.0.1:8081/api/v1/cpcb/status` (expect 200)
   - Rust API: `curl` on http://127.0.0.1:8080/ (expect 200/404-shaped response)
   - Public tunnel: `curl -s -o /dev/null -w %{http_code} https://rajapi.com` (expect 200 — detects 1033/tunnel loss from outside)
   - Disk: `/` usage % > 85 → WARN
   - RAM: available < 100 MB → WARN
   - Backup: newest `/home/pi/pg_backups/*.dump` age > 26 h → CRIT (catches powered-off-at-cron-window)
   - Off-Pi backup: newest remote file age (via `rclone lsl`) > 50 h → CRIT
   - **UltrON heartbeat**: `last_sync` per site from DB — sites expected live (Beger, ABD): > 15 min → WARN; any other registered site (KTPP, KTPS7, Honour, Test): > 24 h → CRIT (one alert per site, first alert only, no spam)
   - cloudflared metrics: `curl http://127.0.0.1:20241/ready` (endpoint already exists)
   - State files under `/home/pi/monitor/state/` (dedup alerts), log to `/home/pi/monitor/health.log`
2. **Alert channel**: log + state file on-Pi; **external visibility via free UptimeRobot-style HTTP ping on https://rajapi.com** (recommended — survives Pi network failure, which on-Pi monitoring cannot see). Email/SMS deferred (no SMTP on Pi; UptimeRobot email is the pragmatic first channel).
3. **systemd timer** `health-check.timer`: `OnCalendar=*:0/5`, `Persistent=true` (missed runs caught up after reboot — no extra cron).
4. **Log hygiene**: health.log capped by logrotate (daily, keep 14) or 1000-line tail-rewrite.

Nothing to install; nothing runs as root; reads only. Startup delay after reboot handled by `Persistent=true` + first-run-after-boot sanity check (skip if `uptime < 300`).

---

## 6. Network Dependency (carried from Phase 4 — context for backup/DR)

- Pi's ONLY uplink: wlan0 192.168.137.30 via this laptop's Wi-Fi Direct ICS (gateway/DNS 192.168.137.1). eth0 down.
- Proven outage: 08-14 tunnel 1033 for 28 min (12:36→13:04) = Pi powered off + laptop link recovery delay.
- **Impact on backup design**: off-Pi backup must tolerate the laptop link being down — that is why `@reboot` + 15:20 jobs run from the Pi itself and why UptimeRobot (external) is the alert channel. A cloud destination reached via the same flaky path is still strictly better than nothing (retries on next run), and USB drive attachment remains a recommended second copy.
- Long-term (out of scope for Phase 5 code): independent uplink (Wi-Fi to a router/WAN) — decision point for Neeraj.

---

## 7. Offline Plants Investigation (READ-ONLY — no records touched, no commands sent)

### Evidence per plant (all from DB + journal, 08-14)

| Plant | Stations registered | client_version | last_sync | Telemetry (rows, latest) | Heartbeat log (ever) | AMC | Classification |
|---|---|---|---|---|---|---|---|
| Beger Paints Ltd | 2 | 1.0.71 | **13:42:56 (live)** | 3,804 @ 08:12 UTC | none (post-migration flow) | 2027-07-14 | **ONLINE** |
| ABD | 3 | 1.0.71.3 | **13:43:53 (live)** | 20,157 @ 08:13 UTC | none | 2027-07-14 | **ONLINE** |
| Test | 0 | 1.0.71 | 2026-07-22 | 570 @ 2026-07-21 (stopped) | none | 2027-07-20 | **CLIENT** — was syncing, stopped 3 weeks ago; stations list now empty |
| Honour labs Unit 5 | **0** | — | never | none | none | 2027-07-14 | **CONFIGURATION** — registered as site but no stations, never contacted server |
| KTPS7 | 1 | — | never | none | none | 2027-07-20 | **CLIENT/NETWORK** — fully registered (1 station) but **zero contact ever** |
| KTPP | **1** | — | **never** | none | none | 2027-07-25 | **CLIENT/NETWORK** — fully registered (1 station, API key present, unlocked) but **zero contact ever** |

### Key facts

- `heartbeat_log` holds only gateway `ULTRON-IND-000001` (1,386 rows, 07-04→07-15) — current clients (v1.0.71+) don't write it; truth lives in `industry_sites.last_sync`. Monitoring must key off `last_sync` (§5).
- No last_error / last_error_at on any plant → no server-side rejection evidence; server accepts whatever arrives (login 200s for Beger/ABD every ~20-30 s).
- nginx/uvicorn journal shows only localhost sources (clients come via tunnel) — client identity is not visible server-side; zero auth failures for the two live clients in 3 days.
- KTPP/KTPS7/Honour have never contacted the server at all — **server-side config is complete and unlocked; the break is at the plant** (gateway off, not pointed at rajapi.com, new build not installed, or plant LAN/network down). Distinguishing CLIENT vs NETWORK requires field access to the plant gateway — outside server authority.

### Recommended follow-up (field, NOT via server)

- KTPP: verify the plant PC/gateway runs a build ≥1.0.71, internet reachable, and its stored API key matches the DB key (can be done with the user; server-side compare only, no writes).
- KTPS7: same check; station exists so server side is ready.
- Honour: station registration must be completed server-side (needs admin) before a client can sync — CONFIGURATION finding.
- Test: re-inspect why telemetry stopped 07-21 and stations were cleared.

---

## 8. Proposed Implementation Order (each step approved separately, per your instruction)

| # | Phase | Change | Service impact | Revert |
|---|---|---|---|---|
| 1 | 5B-1 | `chmod 600 /home/pi/rajapi_backend/.env` | none | chmod back |
| 2 | 5B-2 | Move DATABASE_URL out of `rajapi.service` → `rajapi.env` 0600; unit root:root 0644; daemon-reload + restart rajapi | ~2 s restart (Rust) | restore unit backup + reload |
| 3 | 5C | rajapi-python.service: docker After/Wants + ExecStartPre pg_isready + RestartSec 10 + StartLimit; daemon-reload + restart | ~2 s restart (FastAPI) | restore unit backup + reload |
| 4 | 5D | nginx drop-in `Restart=always/RestartSec=3`; `systemctl reload nginx` | **zero downtime** | remove drop-in + reload |
| 5 | 5A | rclone OneDrive remote (interactive OAuth once) + rclone.conf 0600 + cron 15:20 + `@reboot` catch-up + remote retention 30 | none (new files only) | remove cron lines, delete remote config |
| 6 | 5A-verify | First push + restore drill (pg_restore to throwaway DB or file check) | none | delete test artifacts |
| 7 | 5E | `/home/pi/monitor/health_check.sh` + systemd timer (persistent, 5 min) + UptimeRobot ping | none (new files only) | stop timer, remove files |
| 8 | 5F | Field checks at plants (KTPP/KTPS7/Honour/Test) — human/remote desktop, no server writes | none | n/a |
| 9 | 5D-verify | Full reboot test: services come up clean, monitoring green, no crash-loop | 1 reboot | n/a |

Steps 1–2 are zero-risk; step 3–4 need a maintenance window of ~1 minute; step 5 needs one interactive OAuth session; step 9 is the only reboot and can be deferred until the next natural reboot.

## 9. Rollback Procedures (all changes)

- **Files changed**: every edited file gets a dated backup in `/home/pi/rajapi_backups/<date>/` before modification (units, .env, cron, rclone.conf, monitor scripts).
- **systemd**: `systemctl daemon-reload && systemctl restart <unit>` is the rollback trigger; restore the backup file first, then reload. Both units' current files are captured in this audit (A2) and will be archived at change time.
- **nginx**: drop-in removal + `systemctl reload nginx` — instant, zero downtime.
- **rclone**: remove cron entries, `rclone config delete onedrive` — nothing else to clean (only pushes).
- **Monitoring**: `systemctl disable --now health-check.timer`, delete `/home/pi/monitor/`.
- **Full rollback = Phase 3 state** if ever required: `tar -xzf /home/pi/rajapi_www_backup_20260814_115327.tar.gz -C /var/www` (frontend) + DB restore from dump (verified).

## 10. Risk Assessment

| Change | Risk | Mitigation |
|---|---|---|
| 5B chmod | None (0600 readable by root+owner only) | owner is pi; systemd reads as root |
| 5B unit move | ~2 s Rust restart; if restart fails, service down until rollback | backup + documented rollback; Rust has no DB dependency on boot (After=docker only) |
| 5C systemd | Slow-boot lockout if StartLimit still tight | widened limits + timeout 90 s; rollback file ready |
| 5D nginx | Restart=always can mask a config error by looping | nginx validates config at `reload`; if it fails to start, monitoring + manual stop; drop-in is minimal |
| 5A OAuth | Token exposure on Pi | rclone.conf 0600 immediately; scoped app token; no password stored |
| 5A push | Cloud quota (5 GB) | retention 30 × 260 KB ≈ 8 MB/yr — negligible |
| 5E monitoring | False alerts spam | dedup state files, alert-once logic, 5-min cadence, logrotate cap |
| 5F field work | None server-side | no server writes at all |
| Reboot test (9) | 28-min link-recovery window reappears if laptop link is down | schedule for when laptop link is up; tunnel auto-recovers; monitoring confirms |

**Net: every change is small, reversible, and carries ≤ seconds of service impact except the optional scheduled reboot (step 9).**

---

## STATUS

- [x] 5A destination analysis + recommendation (OneDrive via rclone)
- [x] 5B credential audit + exact proposed owner/group/mode
- [x] 5C dependency-chain audit + current/proposed/rollback
- [x] 5D recovery audit + conservative policies
- [x] 5E monitoring design (no implementation)
- [x] 5F offline-plant evidence + classification (KTPP = CLIENT/NETWORK)
- [x] Plan + order + rollback + risk
- [ ] **Awaiting your approval to begin implementation** (recommend starting with §8 step 1–2: zero-risk credential hygiene)
