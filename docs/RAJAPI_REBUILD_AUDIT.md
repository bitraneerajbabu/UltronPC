# RajAPI.com — Phase 1 Audit Report (Read-Only)

Date: 2026-08-14 | Target: pi@raj.local (production) | PHASE 1 = READ ONLY. Nothing modified, nothing restarted, no commits.

---

## 1. Raspberry Pi Environment

| Item | Value |
|---|---|
| Host | `raj.local` (SSH `pi@raj.local`, key auth works) |
| Board | Raspberry Pi 3 B/B+ class, aarch64 |
| OS | Debian GNU/Linux 13 (trixie), kernel 6.12.75+rpt-rpi-v8 |
| CPU/RAM | 905 MiB RAM total (329 MiB used, 576 MiB available), swap 904 MiB (unused) |
| Storage | 58 GB SD (mmcblk0), 7.6 GB used, 49 GB free |
| Temp | 42.9 °C |
| Load | 0.00 (idle) |
| Python | 3.13.5 (system), venv at `/home/pi/rajapi_server/backend/venv` |
| Docker | containerd + docker running; 1 container: `ultron_db` (postgres:17-alpine) |
| Other | fail2ban active, NetworkManager, cloudflared 2026.6.0 (tunnel `ultron_central`) |

## 2. Production Service Map

| Port | Bind | Service | Purpose |
|---|---|---|---|
| 22 | 0.0.0.0 | sshd | admin access |
| 80/443 | 0.0.0.0 | nginx | TLS terminate + reverse proxy + static `/var/www/rajapi` |
| 8080 | 127.0.0.1 | `rajapi.service` — **Rust backend v3** (axum, `rajapi_server` binary) | legacy `/api/*` routes |
| 8081 | 127.0.0.1 | `rajapi-python.service` — **Python FastAPI v1.0.10** | new `/api/v1/*` routes |
| 5432 | 127.0.0.1 | PostgreSQL 17.10 (Docker `ultron_db`, data `/home/pi/ultron_db_data`) | DB — **loopback only** ✓ |
| 20241 | 127.0.0.1 | cloudflared | tunnel management socket |
| — | — | cloudflared ingress | `rajapi.com` → `http://localhost:80` (origin over HTTP) |

systemd: `rajapi.service`, `rajapi-python.service`, nginx, cloudflared, docker, fail2ban all enabled+active. `certbot.timer` enabled but unused (self-signed cert).

## 3. Current Deployment Architecture

```
Internet → Cloudflare edge (TLS) → cloudflared tunnel → nginx :80/:443 (self-signed CN=rajapi.com)
nginx regex:
  ^/api/v1/(sites|cpcb|quality|alarms|sync|heartbeat|spcb|tgpcb|downloads|ota|broadcasts|commands|auth/login|stations)(/.*)?$  → 127.0.0.1:8081 (Python)
  all other /api/  → 127.0.0.1:8080 (Rust)
  / → /var/www/rajapi (Vite React SPA static export)
```

- **Frontend**: React SPA "UltrON Super Admin Portal" served from `/var/www/rajapi`. Source = `server/frontend` (Vite). Deployed Jul 24.
- **Python backend**: source = repo `server/backend`, deployed to `/home/pi/rajapi_server/backend` (byte-identical for `app/` files verified via diff, minus a few extras on Pi: `api_models.py`, `deps.py`, `core/ssl_utils.py`, `services/`).
- **Rust backend**: `/home/pi/rajapi_backend` (compiled binary, source = 5 .rs files). **NOT in this repo.**
- Deploy method (repo scripts): manual `scp` file copies + `systemctl restart rajapi-python` / `rajapi`. No git-based deploy, no version tags, no automated rollback.
- **⚠ Deployed frontend ≠ repo dist** (deployed `index-OMr4Gfv4.v4.js` vs repo `index-BS_EaBtZ.js`). Manual `patch_html*.py` patches + `.bak2/3/4` files present in `/var/www/rajapi/assets`. Source drift must be resolved before Phase 2.

## 4. Backend Architecture (three codebases, one DB)

1. **Python FastAPI v1.0.10** (`:8081`) — authoritative for: sites, telemetry ingest, heartbeat, broadcasts, commands, CPCB/quality, alarms, stations, OTA, downloads, auth/login. SQLAlchemy + PostgreSQL. Background task: `monitor_heartbeats_loop` (60 s, marks devices online/offline). Startup auto-migrations (`create_all` + conditional `ALTER TABLE` — schema drift risk). In-memory rate limiting + key lockout.
2. **Rust axum v3** (`:8080`) — legacy: gateways CRUD, heartbeat handler, commands, broadcasts, fleet stats, health. **Mostly shadowed by nginx regex → effectively serves only `/api/v1/gateways*`, `/api/v1/stats`, `/api/v1/health`.** Its heartbeat response hardcodes `lock_status:"unlocked"` and `allow_spcbcpcb_push:true` (no lock/AMC logic).
3. **React SPA** — no router, single `App.tsx` (1527 lines), MUI v9, tab-based navigation.

## 5. Database Architecture (PostgreSQL 17.10, db `ultron_central`, user `ultron_admin`)

16 tables. 2 gateways, 6 industry_sites, 7 stations, 17 parameters, 21,581 telemetry rows, 1,386 heartbeat_log, 2 commands, 0 broadcasts, 0 alarms, 0 OTA.

| Owner | Tables |
|---|---|
| Rust (sqlx migrations) | `users`, `gateways`, `heartbeat_log`, `commands`, `broadcasts` (severity/gateway_ids model), `_sqlx_migrations` |
| Python (SQLAlchemy) | `industry_sites`, `devices`, `parameters`, `telemetry_data`, `alarms`, `stations`, `pending_commands`, `ota_deployments`, `software_versions`, `_migration_done` |
| Legacy | `__migration_done` marker |

- **Two parallel broadcast tables** (Rust `broadcasts` w/ `gateway_ids`, Python `broadcasts` w/ `target_all`/`target_site_id`) — Python one is live.
- **Two parallel command systems** (`commands` Rust, `pending_commands` Python) — Python one is live.
- **Two parallel site models** (`gateways` Rust vs `industry_sites` Python) — Python one is live; `gateways` rows are stale.
- `users`: **1 user** (`admin`, role admin). No multi-user, no permissions table, no audit table.
- Postgres: `max_connections=100`, `wal_level=replica`, `archive_mode=off` (no PITR). No `audit_logs` table exists.

## 6. API Inventory (complete, from live code — nothing invented)

### Python (:8081) — auth = `X-Admin-Key` header (or X-API-Key for devices), rate-limited

| METHOD | PATH | PURPOSE | AUTH | CONSUMER |
|---|---|---|---|---|
| POST | `/api/v1/auth/login` | login; returns `admin_key` (echoes key — legacy) | rate-limit + key lockout | SPA |
| POST | `/api/v1/sync/` | telemetry ingest (auto-provisions devices/params/stations) | site/device API key | UltrON client |
| POST | `/api/v1/heartbeat/` | client heartbeat (60 s); returns broadcasts + pending commands | `device_secret` body | UltrON client |
| POST | `/api/v1/spcb` | SPCB payload ingest (auth = payload `Name` = api_key) | payload key | UltrON client |
| GET | `/api/v1/sites/` | list sites (+devices) | admin | SPA |
| POST | `/api/v1/sites/` | create site | admin | SPA |
| PATCH | `/api/v1/sites/{id}` | edit site (name/location/notes/amc_expiry) | admin | SPA |
| DELETE | `/api/v1/sites/{id}` | delete site | admin | SPA |
| PUT | `/api/v1/sites/{id}/status?is_active=` | activate/deactivate | admin | SPA |
| POST | `/api/v1/sites/{id}/renew` | AMC renew + key regen | admin | SPA |
| POST | `/api/v1/sites/{id}/renew-key` | regenerate site key | admin | SPA |
| PUT | `/api/v1/sites/{id}/lock` | lock/unlock + reason | admin | SPA |
| GET | `/api/v1/sites/locks/summary` | lock states all sites | admin | SPA |
| GET | `/api/v1/sites/{id}/devices` | devices per site | admin | SPA |
| POST | `/api/v1/sites/{id}/devices` | create device | admin | SPA |
| PATCH | `/api/v1/sites/{id}/devices/{dev}` | update device | admin | SPA |
| DELETE | `/api/v1/sites/{id}/devices/{dev}` | delete device | admin | SPA |
| POST | `/api/v1/sites/{id}/devices/{dev}/renew-key` | rotate device key | admin | SPA |
| GET | `/api/v1/sites/{id}/telemetry/latest` | latest points | admin | SPA (10 s live poll) |
| GET | `/api/v1/sites/{id}/telemetry/history?parameter_id=&from_date=&to_date=&before=` | history w/ cursor | admin | SPA |
| DELETE | `/api/v1/sites/{id}/telemetry/prune?keep_days=` | prune site telemetry | admin | ops |
| DELETE | `/api/v1/telemetry/prune-all?keep_days=` | prune all telemetry | admin | ops |
| GET | `/api/v1/broadcasts/` | list broadcasts | admin | SPA |
| GET | `/api/v1/broadcasts/active` | active broadcasts | site key | client |
| POST | `/api/v1/broadcasts/` | create broadcast | admin | SPA |
| PUT | `/api/v1/broadcasts/{id}` | edit broadcast | admin | SPA |
| DELETE | `/api/v1/broadcasts/{id}` | delete broadcast | admin | SPA |
| PUT | `/api/v1/broadcasts/{id}/toggle` | activate/deactivate | admin | SPA |
| POST | `/api/v1/commands/sites/{id}/command` | restart_polling / reboot_system / factory_reset | admin | SPA |
| GET | `/api/v1/commands/supported` | list command types | — | SPA |
| GET | `/api/v1/commands/pending?site_id=` | pending commands (X-Station-Id header) | station | client |
| POST | `/api/v1/commands/{id}/ack` | ack command | station | client |
| GET | `/api/v1/cpcb/status` | CPCB transmission status per site | admin | SPA |
| GET | `/api/v1/cpcb/summary` | 30-day daily counts | admin | SPA |
| GET | `/api/v1/quality/` | U/O/E/N summary per site | admin | SPA |
| GET | `/api/v1/quality/{site_id}` | per-parameter quality drill-down | admin | SPA |
| GET | `/api/v1/alarms/` | alarms list | admin | SPA |
| GET | `/api/v1/alarms/stats` | active/today stats | admin | SPA |
| POST | `/api/v1/alarms/{id}/ack` | acknowledge | admin | SPA |
| GET | `/api/v1/stations/?site_id=` | stations per site | admin | SPA |
| POST | `/api/v1/stations/?site_id=` | create station | admin | SPA |
| PATCH | `/api/v1/stations/{id}?site_id=` | update station | admin | SPA |
| DELETE | `/api/v1/stations/{id}?site_id=` | delete station | admin | SPA |
| GET | `/api/v1/downloads/installer` | UltrON installer download | admin | SPA |
| GET | `/api/v1/downloads/latest-client` | latest client binary | admin | SPA |
| GET | `/api/v1/downloads/version` | latest version | admin | SPA |
| POST | `/api/v1/ota/versions` | register software version | admin | SPA/ops |
| GET | `/api/v1/ota/versions` | list versions | admin | SPA/ops |
| GET | `/api/v1/ota/versions/{id}` | version detail | admin | SPA/ops |
| DELETE | `/api/v1/ota/versions/{id}` | delete version | admin | SPA/ops |
| POST | `/api/v1/ota/deployments` | create deployment | admin | SPA/ops |
| GET | `/api/v1/ota/deployments` | list deployments | admin | SPA/ops |
| GET | `/api/v1/ota/deployments/{id}` | deployment detail | admin | SPA/ops |
| GET | `/api/v1/ota/deployments/site/{site_id}` | deployments by site | admin | SPA/ops |
| PATCH | `/api/v1/ota/deployments/{id}` | update deployment | admin | SPA/ops |

Dead: `tgpcb_sync.py` exists but **router never registered** in `main.py` — nginx routes `/api/v1/tgpcb` → Python → 404.

### Rust (:8080) — auth = `Bearer <last_token>` (users.last_token)

| METHOD | PATH | PURPOSE | Status |
|---|---|---|---|
| POST | `/api/v1/auth/login` | login (SHA-256 pwd) | **shadowed** by nginx |
| POST | `/api/v1/heartbeat` | client heartbeat | **shadowed** |
| POST | `/api/v1/commands` | create command | **shadowed** |
| GET | `/api/v1/commands/pending/:gw` | pending | **shadowed** |
| PATCH | `/api/v1/commands/:id` | update status | **shadowed** |
| GET | `/api/v1/commands/history/:gw` | history | **shadowed** |
| POST | `/api/v1/broadcasts` | create | **shadowed** |
| GET | `/api/v1/broadcasts` | list | **shadowed** |
| GET | `/api/v1/gateways` | gateway fleet | reachable (unused by SPA) |
| GET | `/api/v1/gateways/:id` | gateway detail | reachable |
| GET | `/api/v1/gateways/:id/history` | heartbeat history | reachable |
| GET | `/api/v1/health` | health | reachable |
| GET | `/api/v1/stats` | total/online/offline | reachable (unused by SPA) |

## 7. Frontend Architecture

- Vite 8 + React 19 + **MUI v9** + Tabler icons + chart.js + vite-plugin-pwa (workbox). Tailwind installed, unused. TypeScript.
- **No router** — `useState activeTab` in App.tsx; nav via `Sidebar.tsx` `navGroups` + `tabMapping`.
- **No API client file** — inline `adminFetch` (App.tsx:176), `X-Admin-Key` from `sessionStorage['rajapi_admin_key']`.
- **Polling**: `setInterval(load, 30000)` → **8 GETs every 30 s** unconditionally (sites, broadcasts, locks/summary, cpcb/status, cpcb/summary, quality/, alarms/, alarms/stats) + 10 s live telemetry poll per active site + 60 fps canvas globe loop. No AbortController anywhere.
- PWA workbox caches `rajapi.com/api/*` GETs 5 min (admin data can go stale / persist across sessions).
- No 401 handling, no error boundaries, `alert()`/`confirm()` destructive flows.

## 8. Current Routes

None — SPA tab state. Tabs: dashboard, broadcasts, commands, history (unreachable), locks, cpcb (unreachable), quality, alarms, fleet (dead alias), login gate.

## 9. Current Components

`Layout/{Layout,Sidebar,Header}`, `Dialogs/{CreateSiteDialog,EditSiteDialog,BroadcastDialog,LockDialog}`, `Common/{KpiCard,StatusBadge,SectionCard,PageHeader,SearchBar,EmptyState,Icon,Telemetry3DVisualizer,SkeletonLoader(dead)}`.

## 10. Current Navigation

Dashboard · Live Monitoring (dup→dashboard) · Plants (→dashboard) | Notifications · Configuration(Commands) · Broadcast Center · AMC Management | Audit Logs(quality). Footer: collapse, logout. Header: breadcrumb, search, dark toggle, bell, avatar.

## 11. Broadcast Architecture

Client polls heartbeat (60 s) → Python returns active broadcasts (target_all or target_site_id). SPA: GET/POST/PUT/DELETE/toggle on `/api/v1/broadcasts`. Rust broadcast table unused. **Fully sufficient — reuse as-is.**

## 12. AMC Architecture

`industry_sites.amc_expiry` + `lock_status` (unlocked/manual_lock/amc_expired) + `lock_reason` + `lock_updated_at`. Enforcement: Python `_validate_site` rejects expired AMC/inactive sites at API-key auth; client enforces locally (license/AMC lock propagation). APIs: PATCH site (amc_expiry), POST renew, PUT lock, GET locks/summary. **Sufficient — reuse as-is.**

## 13. Heartbeat Architecture

Client `rajapi_sync.py` → POST `/api/v1/heartbeat` every 60 s (gateway_id, device_secret, version, system stats) → Python updates `last_sync`/`client_version`, returns broadcasts + pending commands (marks delivered). `monitor_heartbeats_loop` (60 s) flips device status online/offline. Online = last_sync < 90 s. Rust heartbeat handler dead (shadowed). **Python path is live and sufficient.**

## 14. UltrON Synchronization Architecture

Client telemetry → POST `/api/v1/sync/` (X-API-Key) → auto-provisions generic device + parameters (per station_name), stores `telemetry_data`, updates quality counts. SPCB: client `server_push.py` pushes to external SPCB endpoint; RajAPI `/api/v1/spcb` also accepts SPCB payloads (auth = Name=api_key). CPCB status/summary derived from telemetry quality + sync times.

## 15. Authentication Architecture

- Python: `X-Admin-Key` static ADMIN_KEY (admin), site/device `api_key` (X-API-Key). Login = bcrypt admin password OR plaintext key match; **response echoes `admin_key`** (legacy). Rate limiting + per-key lockout (in-memory). SECRET_KEY/HS256/JWT **defined but never used** — auth is static-key, not JWT.
- Rust: SHA-256 password (unsalted), `last_token` session in users table, `Bearer` header, **no expiry**. Migration SQL hardcodes an admin password hash.
- No roles/permissions beyond admin-vs-site. `users` table has 1 row. SPA stores key in sessionStorage, falls back to storing the password as key if `admin_key` missing (App.tsx:196).

## 16. Current Problems (severity-ranked)

1. **CRITICAL — No database backups.** Cron references `backup_postgres.sh` (03:00, 15:00), `backup_sd_card.sh` (Sun 02:00), `check_sites_health.sh` (hourly) — **all three files DO NOT EXIST**. Only stale manual dump `pre_fk_fix_backup_20260714_095613.sql` (Jul 14). Production DB on a single SD card with no copy.
2. **CRITICAL — Deployed frontend ≠ repo source.** Manual `.bak`/patch-HTML workflow; rebuilding from repo will lose deployed changes. Unversioned production.
3. **HIGH — Dual backend shadowing.** Rust v3 mostly dead behind nginx regex (2 parallel broadcast/command/site models in one DB). Confusing, wasteful (2 processes on 905 MiB RAM), schema ambiguity.
4. **HIGH — Secrets hygiene.** Rust `.env` world-readable (`rw-rw-r--`); hardcoded DB credential fallback in `src/db.rs`; admin password hash in migration SQL; `admin_key` echoed in login; API keys displayed plaintext in SPA.
5. **HIGH — Frontend polling.** 8 API calls/30 s unconditional + 10 s poll + PWA caching admin GETs; no 401/error handling; stale-data risk.
6. **HIGH — tgpcb routed but dead** (404); apscheduler installed unused; mosquitto config deployed but no broker running.
7. **MEDIUM — Self-signed cert on 443** (browser warning); origin HTTP over tunnel (Cloudflare edge TLS only).
8. **MEDIUM — Auto-migrations on startup** (`create_all` + ALTER) — schema drift, non-deterministic upgrades.
9. **MEDIUM — No audit/activity table** — "Audit Trail"/"Recent Activity" cannot be built from existing data.
10. **MEDIUM — No user/role management** — single admin user; Administration section requires new backend work.
11. **LOW — No version control on Pi Rust backend** (git repo has 0 commits, all untracked); SPA hardcoded branding (Neeraj); unreachable tabs (history, cpcb); globe uses fake lat/lon.

## 17. Proposed New RajAPI Architecture

Keep 3-tier but consolidate: **Python backend remains authoritative** (UI rebuild does NOT touch it except 2 minor additions). Rust stays as-is (gateways/stats/health legacy) — do NOT rewrite. Frontend becomes a structured multi-screen SPA: same MUI stack, new IA, single poll loop, no new heavy deps.

## 18. Proposed Navigation

```
DASHBOARD
MONITORING     Sites | UltrON Clients
CONTROL        Broadcast Center | AMC & Control
COMPLIANCE     Regulatory | Reports
OPERATIONS     Commands | Notifications | Activity
ADMINISTRATION Users | Roles | Settings | Audit Trail   ← Phase 3 (needs backend)
Bottom: System status · Admin profile · Logout
```

## 19. Proposed Screens

1. **Dashboard** — Fleet status (total/online/offline/critical), AMC (active/expiring/expired), Broadcast (active/scheduled), Regulatory (healthy/pending/failed), System (last sync, last heartbeat, API status, DB status), Recent activity.
2. **Sites** — list (site, location, client, online, last heartbeat, AMC, lock, regulatory, actions) + detail (overview/connection/UltrON/AMC/broadcast/regulatory/activity).
3. **UltrON Clients** — fleet table (site, version, online, last heartbeat, sync, AMC, lock) + detail.
4. **Broadcast Center** — active/scheduled/expired, create/edit/activate/deactivate/delete. Reuse existing APIs.
5. **AMC & Control** — AMC states + lock/unlock with confirmation. Reuse existing APIs.
6. **Regulatory** — CPCB/SPCB transmission status, pending/failed, last success/failure. Reuse existing data only.
7. **Commands** — existing 3 command types + confirmation.
8. **Notifications** — alarms list/ack. Reuse.
9. **Activity** — Phase 3 (needs audit table).
10. **Reports** — telemetry history + quality drill-down (existing history API).
11. **Users / Roles / Settings / Audit Trail** — Phase 3.

## 20. Current → New Screen Mapping

| Current | New |
|---|---|
| Dashboard (plants table + globe) | Dashboard + Sites list |
| Plants (dup) | Sites |
| Live Monitoring (dup) | UltrON Clients (new composition) |
| Broadcast Center | Broadcast Center |
| AMC Management | AMC & Control |
| Configuration (Commands) | Operations → Commands |
| Notifications (alarms) | Operations → Notifications |
| Audit Logs (quality) | Compliance → Regulatory (+ Reports) |
| CPCB (unreachable) | Compliance → Regulatory |
| History (unreachable) | Compliance → Reports |
| — | Administration (Phase 3) |

## 21. Existing APIs Reusable (Use as-is)

Sites list/create/edit/delete/status/renew/renew-key, locks + locks/summary, lock/unlock, broadcasts CRUD+toggle, commands (supported/send), alarms + stats + ack, cpcb status/summary, quality, stations CRUD, telemetry latest/history, downloads, OTA.

## 22. APIs That Genuinely Need Changes

| Feature | Classification | Action |
|---|---|---|
| Fleet summary counts (dashboard KPIs) | UI ADAPTATION ONLY | compute client-side from `GET /sites/` + `locks/summary` + `broadcasts/` (0 backend change) |
| Online/critical status | UI ADAPTATION ONLY | derive from `last_sync` (90 s rule) — already the server's own rule |
| UltrON Clients fleet view | MINOR BACKEND CHANGE | `GET /sites/{id}/devices` exists per-site; a cross-site device list needs one small endpoint (`GET /api/v1/devices`) — optional, can be composed client-side from sites+devices for now |
| System status (API/DB health) | MINOR BACKEND CHANGE | Python lacks `/health`; add 5-line `GET /api/v1/health` (DB ping) to main.py |
| tgpcb | MINOR | register router in main.py or remove nginx rule (dead either way) |
| Recent Activity / Audit Trail | MISSING API + schema | needs new `audit_logs` table + write hooks + endpoints — **Phase 3, not Phase 2** |
| Users / Roles / Permissions | MISSING API + schema | new tables + endpoints + role enforcement — **Phase 3** |
| Settings | MISSING API | server config is `.env`-based; read-only display or deferred — Phase 3 |
| SPCB per-site status | UI ADAPTATION ONLY | derive from spcb ingestion + last_sync; no change |

**Phase 2 backend footprint: main.py +2 endpoints (health, optional devices), tgpcb registration OR nginx note. Nothing else.**

## 23. Components Reusable

`KpiCard`, `StatusBadge`, `SectionCard`, `PageHeader`, `SearchBar`, `EmptyState`, `Icon`, `BroadcastDialog`, `LockDialog`, `CreateSiteDialog`, `EditSiteDialog`, `Layout` shell, MUI theme (retokenized), chart.js history chart.

## 24. Components to Replace

- `Sidebar.tsx` — new IA groups (rewrite).
- `Header.tsx` — breadcrumbs per new IA + status indicator.
- `Telemetry3DVisualizer.tsx` — decorative 3D globe with fake lat/lon; replace with clean status grid/list (per design brief: no decorative 3D). Chart.js history stays.
- `App.tsx` — restructure: move screens to per-screen render functions/modules, single load loop, kill dead tabs, wire cpcb/history into nav.

## 25. Dependencies That Should NOT Be Added

framer-motion / anime.js (no animation libs), three.js / react-globe (no 3D), recharts (chart.js already there), react-router (tab state suffices; adding router = churn, not value, on a tab-driven SPA), axios (fetch wrapper exists), redux/zustand (single App-level state), Tailwind usage (installed, unused — keep unused), @fontsource/inter stays (swap to Source Sans 3 — one font package).

## 26. Performance Risks on Raspberry Pi

- 905 MiB RAM total; Python + Rust + nginx + Postgres + cloudflared already resident. Any new Python process/loop = risk. Backend polls must stay as-is.
- 8×30 s SPA poll per admin session is fine (rate limit 200/min/IP) but wasteful; consolidate to 1 aggregate poll or split per visible tab. No AbortController → race overlap under slow SD-card I/O.
- PWA workbox 5-min caching of API GETs → stale admin data; restrict caching to `/assets/` only.
- Avoid per-screen duplicate polling, avoid WebSocket churn, keep the 60 fps canvas globe removed.
- Telemetry history queries on 21.5 k rows: indexes exist (`ix_telemetry_site_ts` etc.). Do not add pagination-less report queries.

## 27. Security Risks

- No DB backups (single SD card) → total data loss exposure.
- Static keys in sessionStorage + `admin_key` echoed at login + SPA displays site API keys → XSS = full fleet takeover. (No XSS hardening audit of SPA done here.)
- No HTTPS origin; self-signed cert; keys travel plaintext through Cloudflare tunnel origin leg.
- Rust `.env` world-readable; hardcoded DB fallback creds in Rust source; admin password hash in migration file.
- Single admin account, no MFA, static keys never rotate (renew-key exists but unused habitually).
- Per-IP rate limits are in-memory (restart clears).
- Frontend trusts `sessionStorage` flag only; backend auth is authoritative ✓ (keep it that way — never move auth decisions client-side).

## 28. Backup / Rollback Requirements

- **Immediate (before any Phase 2 work):** create working `backup_postgres.sh` (pg_dump via docker exec, timestamped, keep N) — cron entries already exist. Restore the 3 missing scripts or remove their cron lines. Verify a restore path.
- Weekly SD image backup script restore.
- Rollback procedure for deploys: pre-deploy `cp -r /var/www/rajapi /var/www/rajapi.bak-$(date)`; backend = keep prior .py copies (or git init on Pi + commit before change). Document `systemctl restart rajapi-python` as the revert trigger.
- Postgres `archive_mode=on` + WAL archiving for PITR (Phase 2 prep, needs container config change — flag for approval, do NOT do now).

## 29. Recommended Implementation Phases

- **Phase 2 — Frontend rebuild (UI only):** new IA/navigation, Site/Client/Broadcast/AMC/Regulatory/Operations/Reports screens, Source Sans 3 light theme, single poll loop, remove globe/dead tabs, fix PWA caching, remove stale .bak files. Backend: +`/api/v1/health` (+optional devices endpoint), register tgpcb or remove. **No schema changes.**
- **Phase 2.5 — Ops hardening (recommended, small):** working backup scripts + verify restore; git-init + baseline commit on Pi; `.env` 600; deploy frontend via script with automatic .bak.
- **Phase 3 — Administration & Activity:** audit_logs table + write hooks + endpoints; users/roles/permissions tables + mgmt UI + role enforcement (backend authoritative); settings screen.
- **Phase 4 — Consolidation (optional):** retire Rust shadowed routes or remove Rust service; merge gateways model into industry_sites; single broadcast/command model; HTTPS origin via Cloudflare origin cert.

## 30. EXACT Files That Would Change in Phase 2

Frontend — repo `server/frontend`:
- `src/App.tsx` — restructure screens + single poll loop (rewrite, keep API client pattern)
- `src/components/Layout/Sidebar.tsx` — new IA groups
- `src/components/Layout/Header.tsx` — breadcrumbs/status/branding
- `src/components/Layout/Layout.tsx` — footer/branding, remove hardcoded "Neeraj"
- `src/theme.ts` — Source Sans 3, light-only tokens, remove dark mode
- `src/index.css` — font import, base styles
- `src/main.tsx` — ThemeProvider/CssBaseline lift (optional), fontsource import
- `src/components/Common/Telemetry3DVisualizer.tsx` — REPLACE with status grid (or delete)
- `src/components/Common/SkeletonLoader.tsx` — delete or wire in
- `src/components/Dialogs/*` — reuse (only if copy needed: no)
- `src/components/Common/{KpiCard,StatusBadge,SectionCard,PageHeader,SearchBar,EmptyState,Icon}.tsx` — reuse as-is
- `vite.config.ts` — restrict workbox caching to `/assets/`
- `package.json` — add `@fontsource/source-sans-3`, remove none

Backend — repo `server/backend` (deployed `/home/pi/rajapi_server/backend`):
- `app/main.py` — add `GET /api/v1/health` (DB ping) + register tgpcb router (or document removal)
- `app/api/endpoints/tgpcb_sync.py` — register or delete (decision item)
- (optional) `app/api/endpoints/devices.py` — cross-site device list (only if UltrON Clients screen needs it; can be composed client-side first)

Deployment (no service changes):
- `deploy_rajapi_frontend.bat` — add pre-deploy `.bak` of `/var/www/rajapi`
- Pi: `backup_postgres.sh` (recreate), `backup_sd_card.sh` (recreate), `check_sites_health.sh` (recreate or remove cron)

**NOT touched in Phase 2:** nginx config, systemd units, Docker/Postgres, `.env` files, Rust backend, client code, DB schema, DNS/TLS.

---

*Audit method: live read-only probes via SSH (systemctl, ss, nginx config, systemd units, docker ps, psql \dt + row counts, journalctl, cron, file listings, source cat via base64 transport), full source reads of deployed Python app (2,582 lines), Rust (738 lines), and repo frontend (App.tsx 1,527 lines + components). No files modified, no services touched, no packages installed, no commits made.*
