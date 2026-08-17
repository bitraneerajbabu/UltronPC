# RajAPI.com — Phase 4 Production Hardening & Reliability Audit

**Date:** 2026-08-14 · **Server:** pi@192.168.137.30 (Raspberry Pi 3 Model B Plus Rev 1.4) · **Mode:** READ-ONLY (no changes, no restarts, no installs)

---

## 1. Executive Summary

RajAPI production is **functional and healthy under load**: all services active, DB consistent, frontend deployed correctly, API surface verified 200s, telemetry flowing from 2/6 clients, AMC safe until mid-2027, disk 14% used, RAM 63% available, temperature 42°C.

However the audit found **resilience and hygiene gaps**, not current failures:

- **CRITICAL:** production depends on a single network path — the Pi's only route to the internet is this laptop's Wi-Fi Direct ICS link (192.168.137.1). If the laptop is off/asleep/link drops, rajapi.com is unreachable (observed: 28-minute 1033 outage on 2026-08-14).
- **CRITICAL:** automated off-Pi backup does not exist. `rclone` is installed but has zero remotes. The only off-Pi copy is a manual download.
- **CRITICAL:** the automated DB backup is fragile — the Pi was powered off at the 03:00 cron window on 2026-08-14 (zero journal activity 01:45→12:36), so the scheduled backup did not run. `backup.log` shows exactly one entry (the manual run).
- **HIGH:** 2 of 5 cron jobs reference scripts that do not exist (`check_sites_health.sh` hourly, `backup_sd_card.sh` weekly) — silent failures.
- **HIGH:** DB password embedded world-readable in `rajapi.service` unit (owner pi, 0644) and in `/home/pi/rajapi_backend/.env` (0664).
- **HIGH:** FastAPI boot race — `rajapi-python.service` declares `After=postgresql.service` which does not exist (Postgres runs in Docker), so uvicorn starts before the DB container; observed SQLAlchemy connection traceback at boot (recovered automatically).
- **HIGH:** zero monitoring — no disk/service/tunnel/backup/heartbeat alerting of any kind.
- **MEDIUM:** 4/6 client plants are offline or never synced — including KTPP (flagship) which has **no last_sync at all**; Honour Labs, KTPS7 likewise. Only Beger Paints and ABD are live.

---

## 2. Pi Health

| Metric | Value | Assessment |
|---|---|---|
| CPU | 4 cores (BCM2837), model freq 1400 MHz | OK |
| Load average | 0.06 / 0.06 / 0.07 | Idle |
| RAM | 905 MiB total, 334 MiB used, 571 MiB available | OK, 63% headroom |
| Swap | 904 MiB zram, 0 used | OK |
| Disk `/` | 7.5 G / 58 G used (**14%**), inodes 5% | OK |
| Disk `/boot` | 74 M / 505 M (15%) | OK |
| Filesystem | ext4 rw,noatime; mmcblk0p2; clean mount (no I/O errors in dmesg) | OK |
| SD card | SD64G 59.5 GiB; smartctl not installed; no life_time counter available | No proactive SD health signal |
| Temperature | 41.9 °C | OK |
| Uptime | 28 min (boot 12:36) | — |

**Sufficient resources for all services: YES.** Core services ≈ 300 MiB RSS; 571 MiB available; load negligible.

## 3. Service Health

| Service | Unit | Status | Boot-start | Restart policy | Last failure | Mem | CPU |
|---|---|---|---|---|---|---|---|
| FastAPI (uvicorn :8081) | rajapi-python.service | active | enabled | `always` (RestartSec 5) | 12:36:43 boot DB traceback; NRestarts=2 | 86 MB | 3.9% |
| Rust server (:8080) | rajapi.service | active | enabled | `always` (RestartSec 5) | none (NRestarts=1) | 6 MB | 0% |
| nginx (:80/:443) | nginx.service | active | enabled | **`no`** — will NOT auto-restart if the process dies | none | 3 MB | 0% |
| cloudflared | cloudflared.service | active | enabled | `on-failure` (RestartSec 5) | none (stuck in activating 28 min at boot) | 39 MB | 1.4% |
| PostgreSQL | Docker `ultron_db` (postgres:17-alpine) | Up | via docker.service | `unless-stopped` | none | 26 MB | 0% |
| Docker engine | docker.service | active | enabled | default | none | 84 MB | 0.1% |
| fail2ban (sshd jail) | fail2ban.service | active | enabled | default | ufw jail config error (benign) | 26 MB | 0.1% |

**After a reboot:** all services auto-start via systemd (`enabled`). nginx is the exception — systemd will not restart it if it crashes after boot (Restart=no). Boot order has a FastAPI↔Postgres race (see §4/§19).

## 4. Reboot Incident Analysis (2026-08-14)

Evidence chain from journal/logs:

1. Journal has **zero entries between 01:45 and 12:36:17** → the Pi was **powered off** overnight (user-controlled power). The 03:00 backup cron did not run (machine off).
2. Pi booted 12:36:17 (`Booting Linux`), nginx started 12:36:50, docker socket 12:36:24, uvicorn first attempt 12:36:43 → **SQLAlchemy DB connection traceback** (container not ready yet — `After=postgresql.service` dependency is a no-op).
3. uvicorn restarted (Restart=always) and recovered; NRestarts=2, current PID started 13:04:43.
4. **cloudflared started 12:36:49 but remained `activating` until 13:04:38** (Wants network-online.target; `Type=notify`, TimeoutStartSec 15) — the laptop-side ICS link (192.168.137.1) did not come up until ~13:04. Tunnel established 13:04:38 (`Starting tunnel`).
5. During 12:36–13:04 Cloudflare served **Error 1033** (tunnel unreachable). That is the entire outage cause: **Pi powered off + slow link recovery**, not a cloudflared or nginx fault.
6. Recovery was **fully automatic** — no manual intervention: cloudflared (on-failure), nginx (started at boot), FastAPI (always), PostgreSQL (unless-stopped) all returned to active. Deployed frontend verified intact post-reboot.

## 5. PostgreSQL

| Item | Value |
|---|---|
| Version | PostgreSQL 17.10 (postgres:17-alpine, created 2026-07-02) |
| Port binding | **127.0.0.1:5432 only** (Docker `HostIp 127.0.0.1`) — not exposed to LAN |
| Database size | ultron_central **16 MB**; all DBs 38 MB |
| Largest table | telemetry_data 7.6 MB (raw 1.4 MB); heartbeat_log 496 KB; industry_sites 104 KB |
| Row counts | telemetry_data ~24.5k (ABD 20,157 / Beger 3,804 / Test 570); alarms 0; broadcasts 0; commands 2 |
| Growth | ~1,036 rows 08-13, ~2,539 rows 08-14 → ~30–70 KB/day → **years of disk headroom** (58 GB disk) |
| Connections | 11 total / 1 active / 5 idle / **max 100** |
| WAL | 32 MB (normal for alpine default) |
| Slow queries | pg_stat_statements **not enabled** — no slow-query visibility |
| pg_hba | `trust` for local + loopback; final line `host all all all scram-sha-256` (password auth, no host restriction — defense-in-depth gap only, port is loopback) |
| Log errors (200 lines) | `relation "sites" does not exist` (08-13, stale app query), `role "root" does not exist` (benign) |

## 6. Backup

| Check | Result |
|---|---|
| Script | `/home/pi/backup_postgres.sh` exists, 0700 pi, pg_dump -Fc, chmod 600 dumps, retention 14, logs to `/home/pi/pg_backups/backup.log` |
| Cron schedule | 03:00 and 15:00 daily (crontab confirmed with sudo) |
| Last successful backup | **2026-08-14 01:45:20 (manual)** — `ultron_central_20260814_014519.dump`, 260 KB |
| Log evidence | backup.log contains **exactly one entry** (the manual run) — the 03:00 cron run did not happen (Pi powered off at that time) |
| Integrity | Dump header `PGDMP`, SHA256 `f3c8ac9a…` — matches the off-Pi copy verified earlier |
| Retention | Only 1 dump present (would keep 14) |
| Off-Pi automation | **NONE** — rclone installed but `listremotes` is empty; no scp/rsync/OneDrive cron. The only off-Pi copy was downloaded manually |
| Disk for backups | 49 GB available |
| Other cron jobs | `check_sites_health.sh` (hourly) and `backup_sd_card.sh` (weekly) **referenced but the files do not exist** → silent failures every hour and every week; `ping_uptime.sh` disabled (commented) |

**Verdict: FAIL** (automated backup is unreliable: machine-off at window + no off-Pi copy + two dead cron jobs).

## 7. Disaster Recovery

| Scenario | Current recovery method | Auto? | Manual? | Steps | Missing component |
|---|---|---|---|---|---|
| A. App failure (FastAPI) | systemd Restart=always | Yes | — | restart in ≤5 s | none |
| B. Pi reboot | systemd enabled units + Docker unless-stopped | Yes | Power-on if unplugged | full boot ~46 s; FastAPI race may need 1–2 retries | Boot dependency ordering (see §19) |
| C. SD-card failure | Backups on same SD; off-Pi dump is 3 weeks old, not automated | No | Reimage + restore dump + rebuild config | high | Automated off-Pi backup; SD health monitoring; documented rebuild runbook |
| D. PostgreSQL failure | Container restart unless-stopped | Yes | — | auto-restart | none (restore-from-dump runbook not documented) |
| E. nginx failure | **Restart=no** | **No** | `systemctl start nginx` | 1 manual command | Restart=always in unit |
| F. Tunnel failure | cloudflared on-failure + systemd notify | Yes | — | auto-retry | none |
| G. Whole-host network (laptop ICS) | nothing | No | Restore laptop link/power | unknown (observed 28 min) | Independent uplink (Wi-Fi/WAN failover) — **single point of failure** |

## 8. Log Management

| Log | Location | Rotation | Size | Risk |
|---|---|---|---|---|
| FastAPI/uvicorn | systemd journal (no files) | journald defaults (no explicit cap; currently 3 MB total) | 3 MB | Low; recommend explicit SystemMaxUse |
| nginx | /var/log/nginx/access.log (+error) | logrotate daily, rotate 14, compress | 638 KB current | OK |
| cloudflared | journal (via unit) | journald | in 3 MB total | OK |
| PostgreSQL | docker logs (journald driver) | journald | small | OK |
| fail2ban | /var/log/fail2ban.log | logrotate | 4.8 KB | OK |
| /var/log total | — | — | 2.6 MB | OK |
| journald | — | default 10% of disk (≈5.8 GB cap), 0 explicit | 3 MB | OK for now |

No disk risk from logs. Journal is capped by defaults; no explicit policy.

## 9. Network

| Item | Value | Assessment |
|---|---|---|
| Interfaces | wlan0 UP 192.168.137.30/24 (only uplink); eth0 DOWN | Single uplink via laptop ICS |
| Default route | via 192.168.137.1 (this laptop) | **Single point of failure** |
| DNS | 192.168.137.1 (laptop) | Same dependency |
| Public path | Cloudflare → tunnel (quic) → nginx :80 → FastAPI :8081 / Rust :8080 | OK |
| Tunnel | rajapi.com → http://localhost:80; 404 catch-all; credentials file 0400 | OK |
| Listening ports | 80/443 nginx (0.0.0.0), 22 ssh (0.0.0.0), 5432 PG (127.0.0.1), 8080 Rust (127.0.0.1), 8081 FastAPI (127.0.0.1), 20241 cloudflared metrics (127.0.0.1) | Backends loopback-only ✓ |
| Firewall | iptables INPUT ACCEPT, ufw **not enabled**; fail2ban sshd jail active (0 banned) | No host firewall; LAN can reach 80/443/22 directly |
| Port 22 | exposed on the 192.168.137.x LAN; PasswordAuthentication **no**, key-only | Acceptable; fail2ban active |
| Unnecessary exposure | 80/443/22 reachable from LAN bypassing Cloudflare | MEDIUM |

## 10. Security

| File/Item | Permission | Risk | Recommendation |
|---|---|---|---|
| `/home/pi/rajapi_server/backend/.env` | **0600** | None ✓ | keep |
| `/home/pi/rajapi_backend/.env` | **0664** (world-readable, group-writable) | HIGH — DB creds readable by any user | chmod 600 |
| `rajapi.service` unit (embeds DB URL+password in `Environment=`) | **0644 owner pi** | HIGH — password world-readable via `systemctl cat` | move creds to EnvironmentFile 0600; chmod 644→600 owner root |
| `.cloudflared/` credentials json | 0400, dir 0700 | None ✓ | keep |
| cloudflared config.yml | 0664 (contains tunnel id only) | LOW | 600 |
| SSH | PasswordAuthentication **no**, 1 authorized key, root locked, fail2ban sshd (maxRetry 3, ban 3600s) | Good ✓ | — |
| config.py default password fallback (`Ultron@2026` as ADMIN_PASSWORD default) | in source | HIGH — if .env lacks ADMIN_PASSWORD the default is live; `ADMIN_KEY` default empty | remove default / fail fast |
| pg_hba | `trust` loopback + `host all all all scram` | MEDIUM (port loopback-only mitigates) | password auth on loopback, restrict host |
| nginx security headers | **none** (no HSTS/X-Frame-Options/CSP/X-Content-Type-Options; public shows only `server: cloudflare`) | MEDIUM | add headers in nginx or Cloudflare |
| Source maps | 0 in /var/www/rajapi | None ✓ | — |
| Backend bind | 127.0.0.1 only | Good ✓ | — |
| Admin API key handling | X-Admin-Key header; key in env (0600) | OK | — |
| Served headers | `Server: nginx`, no cache for index, assets immutable 1y | OK | — |

No passwords, keys, or secrets printed anywhere in this audit.

## 11. API Health (read-only, localhost)

| Endpoint | Result |
|---|---|
| POST /api/v1/auth/login | 200, admin_key returned |
| GET sites/, sites/locks/summary, broadcasts/, cpcb/status, cpcb/summary, quality/, alarms/, alarms/stats | **all 200** |
| GET stations/ | 422 (requires query params — endpoint exists, expected) |
| GET commands/, notifications/, gateways/, users/, roles/, telemetry/latest | 404 — **no such admin GET routes** (notifications/gateways/users/roles have no backend — consistent with Phase 2 PendingScreens) |
| Bad key | 403 (verified in Phase 3) |

## 12. UltrON Synchronization

| Check | Evidence |
|---|---|
| Heartbeat endpoint | POST /api/v1/heartbeat/ + /sync/ — live (200s every ~20–30 s in uvicorn journal) |
| Clients syncing now | **Beger Paints (v1.0.71)** last_sync 13:42:56; **ABD (v1.0.71.3)** 13:43:53 — online, telemetry current (08:13 UTC) |
| Offline / never synced | **Test** (last 07-22), **Honour labs Unit 5** (never), **KTPS7** (never), **KTPP (never)** — 4/6 plants not syncing; KTPP has no last_error (never attempted or DB migration lost history) |
| heartbeat_log table | last row **2026-07-15** — current clients (≥1.0.70) do not write it; heartbeat truth lives in `industry_sites.last_sync` |
| Command delivery | 7 pending_commands rows, all `restart_polling`, **all delivered** (07-20→07-23), none stuck |
| Broadcast/AMC/lock propagation | 0 broadcasts; all 6 sites `unlocked`, no locks in history; propagation path exists (broadcasts + locks tables used by FastAPI) — nothing to observe while idle |
| last_error / last_error_at | empty for all sites |

## 13. Broadcast

- Active broadcasts: **0** (table empty; nothing to audit in motion).
- Infrastructure: broadcasts table + FastAPI routes (GET /broadcasts 200; create/toggle/delete verified in Phase 2/3 tests against throwaway creds, records deleted). Expiry/target/duplicate logic client-side; no data to validate while empty.

## 14. AMC / Remote Control

- All 6 sites **unlocked**, lock_status/reason/updated_at present, no locks active.
- AMC expiry: **Beger/ABD/Honour 2027-07-14, Test/KTPS7 2027-07-20, KTPP 2027-07-25** — 334–345 days remaining; **no AMC risk window**.
- Locks/summary + renew/renew-key endpoints verified 200 in Phase 2/3; authorization via X-Admin-Key.

## 15. CPCB / SPCB

- Service: transmission is **client-side** (UltrON plants push); RajAPI receives telemetry + serves cpcb/status + cpcb/summary (both 200, polled by dashboard).
- No transmission errors in uvicorn journal (3 days); no pending-data errors; no CPCB-related log lines other than GETs.
- No retry/queue evidence needed server-side; clients own retry.

## 16. Frontend (deployed)

| Check | Result |
|---|---|
| Build hash | `index-BnkNGb3t.js` SHA256 `abe738af…` — **matches Phase 2/3 verified build** |
| CSS | `index-COdSUdb4.css` SHA256 `8080c25e…` ✓ |
| Files / size | 90 files, 2.0 MB, /var/www/rajapi pi:pi 755 |
| Source maps | **0 exposed** |
| API config | bundle references `/api/v1` (relative — same-origin via nginx) ✓ |
| PWA | sw.js 4450 B, 50 precache entries, assets-only (no API caching) ✓ |
| Caching | index no-store; /assets immutable 1y; API no-store ✓ |

## 17. Performance

| Service | RSS | CPU |
|---|---|---|
| uvicorn (FastAPI) | 86 MB | 3.9% |
| dockerd | 84 MB | 0.1% |
| containerd | 48 MB | 0.1% |
| cloudflared | 39 MB | 1.4% |
| postgres (main + 4 conns) | 26 MB | 0% |
| fail2ban | 26 MB | 0.1% |
| nginx | 3 MB | 0% |
| rajapi_server (Rust) | 6 MB | 0% |
| **Total used** | **334 MB** | load 0.06 |

**Headroom: 571 MiB available of 905 MiB; zram swap 904 MiB untouched.** The Pi 3 B+ comfortably serves the current fleet (2 active clients, admin workload is browser-side). Headroom shrinks with fleet growth: ~+15–20 MB per syncing client (uvicorn connections + PG conns). Watchpoint, not a problem today.

## 18. Monitoring Gaps (none exist today — identification only)

| Signal | Gap |
|---|---|
| Disk nearly full | none |
| PostgreSQL down | none |
| FastAPI down | none |
| nginx down | none |
| cloudflared down / tunnel dead | none (1033 discovered by user) |
| Pi offline / powered off | none |
| High RAM / CPU | none |
| Backup failure / machine-off at backup window | none |
| Failed / stale UltrON heartbeat (last_sync) | none — KTPP, Honour, KTPS7, Test silently stale |
| Tools present | none (no prometheus/node_exporter/telegraf/netdata/monit; fail2ban is auth only) |

## 19. Critical Findings (priority order)

**CRITICAL**
1. **Single network path** — Pi's only uplink is the laptop ICS (192.168.137.1). Laptop off/asleep → rajapi.com down (proven 08-14). *Evidence:* ip route, cloudflared 28-min activating, 1033. *Fix:* independent uplink (Wi-Fi to router/WAN, or second path), documented power policy. *Reboot:* no. *Downtime:* yes (requires link change).
2. **No automated off-Pi backup** — rclone has 0 remotes; only off-Pi copy is manual. *Evidence:* listremotes empty, crontab, backup dir. *Fix:* rclone remote to OneDrive + cron after each dump + retention. *Reboot:* no. *Downtime:* no.
3. **Backup window machine-off** — Pi powered off at 03:00 on 08-14 → no backup. *Evidence:* journal gap 01:45→12:36, backup.log single entry. *Fix:* run backup at multiple windows (e.g., 03:00+15:00 keep, add 12:00), or battery/RTC UPS, or shift to on-boot + every-6h. *Reboot:* no. *Downtime:* no.

**HIGH**
4. **DB password world-readable** — `rajapi.service` unit 0644 (owner pi) embeds DATABASE_URL with password; `/home/pi/rajapi_backend/.env` 0664. *Evidence:* stat + systemctl cat. *Fix:* EnvironmentFile= 0600, unit 0644 root:root, .env → 600. *Reboot:* no. *Downtime:* brief (service restart).
5. **Boot dependency race** — `rajapi-python.service` After=postgresql.service (nonexistent; PG is a container) → uvicorn crashed once at boot (SQLAlchemy traceback) before auto-recovering. *Evidence:* journal 12:36:43. *Fix:* `After=docker.service` + retry/health-wait in unit, or wait-for-DB in app. *Reboot:* yes (test at next reboot). *Downtime:* none (auto-recovered).
6. **nginx Restart=no** — a crashed nginx stays dead. *Evidence:* systemctl show nginx. *Fix:* `Restart=always` + `RestartSec=2` in unit override. *Reboot:* no. *Downtime:* none (config change).
7. **Zero monitoring** — no alerts for disk/service/tunnel/backup/heartbeat. *Evidence:* §18. *Fix:* minimal cron/script watcher or UptimeRobot-style external ping + on-Pi checks; report on 404/last_sync staleness. *Reboot:* no. *Downtime:* no.
8. **Default admin password in source** — config.py falls back to a known default if ADMIN_PASSWORD unset. *Evidence:* grep hit. *Fix:* remove fallback; fail if not in env. *Reboot:* no. *Downtime:* brief restart.
9. **4/6 plants not syncing incl. KTPP (never)** — business-continuity blind spot. *Evidence:* §12 last_sync. *Fix:* field investigation (KTPP gateway connectivity), then heartbeat monitoring. *Reboot:* no. *Downtime:* no.

**MEDIUM**
10. **No security headers** (HSTS/X-Frame-Options/CSP/X-Content-Type-Options). *Fix:* nginx add_header or Cloudflare. *Reboot:* no. *Downtime:* no.
11. **No host firewall** (ufw inactive; INPUT ACCEPT) — LAN peers can hit :80/:443/:22 directly. *Fix:* ufw allow 22/80/443 from trusted + tunnel-only policy. *Reboot:* no. *Downtime:* brief.
12. **pg_hba trust on loopback + `all all all scram`** — *Fix:* scram on loopback, drop trust. *Reboot:* no. *Downtime:* brief (PG reload).
13. **No slow-query visibility** (pg_stat_statements off). *Fix:* enable extension (tiny change). *Reboot:* no. *Downtime:* none.
14. **Dead cron scripts** — check_sites_health.sh / backup_sd_card.sh missing. *Fix:* create or remove entries. *Reboot:* no. *Downtime:* none.
15. **heartbeat_log unused by current clients** — monitoring must key off last_sync, not heartbeat_log. *Fix:* document/align. *Reboot:* no. *Downtime:* none.

**LOW**
16. cloudflared config.yml 0664; journald no explicit cap; SD health unmonitorable (no smartctl); duplicate backend codebases (Rust + FastAPI) both running.

## 20. Recommended Fix Order

1. Off-Pi backup automation (rclone → OneDrive, cron after dump) + verify restore (CRIT-2/3)
2. Independent Pi uplink or power-policy (CRIT-1)
3. Credentials hygiene: chmod 600 .env + unit EnvironmentFile (HIGH-4)
4. Monitoring watcher (disk/services/tunnel/backup/last_sync) (HIGH-7, covers CRIT-1/2/3 detection)
5. nginx Restart=always (HIGH-6)
6. FastAPI boot wait (HIGH-5) — apply and verify at next natural reboot
7. Remove default password fallback (HIGH-8)
8. Security headers + ufw (MED-10/11)
9. Client connectivity investigation (HIGH-9)
10. pg_hba + pg_stat_statements + cron hygiene (MED-12/13/14)

---

## PRODUCTION HEALTH: PASS WITH WARNINGS

System is functional, fast, and resource-healthy (load 0.06, RAM 63% free, disk 14%, temp 42°C, all services active, API + frontend verified). Warnings: backup automation unreliable + no off-Pi copy, single network path, no monitoring, 4/6 plants offline, credential hygiene, boot race. None of these currently degrade service — they degrade recovery and observability.

**Awaiting your approval before fixing anything.**