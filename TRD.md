# UltrON — Technical Requirements Document (TRD)

**Version:** 1.0  
**Date:** 2026-07-13  
**Status:** Draft  

---

## 1. System Architecture

### 1.1 High-Level Topology

```
┌──────────────────────────────────────────────────────────────────┐
│                     CENTRAL SERVER (RajAPI)                        │
│  Raspberry Pi 5 | Debian 13 | cloudflared → rajapi.com            │
│                                                                    │
│  ┌─ nginx (:80) ──→ uvicorn (:8080) ──→ FastAPI ──→ PostgreSQL ┐ │
│  │  (HTTP origin, HTTPS edge via cloudflare)                     │ │
│  └──────────────────────────────────────────────────────────────┘ │
│  ┌─ React/Vite PWA ───────────────────────────────────────────┐ │
│  │  Dashboard | Telemetry | Broadcasts | Commands | OTA | AMC │ │
│  └─────────────────────────────────────────────────────────────┘ │
│  ┌─ Background ───────────────────────────────────────────────┐  │
│  │  No scheduler — UI polls endpoints every 30s               │  │
│  └────────────────────────────────────────────────────────────┘  │
└─────────────────────────────┬────────────────────────────────────┘
                              │ HTTPS (cloudflared tunnel)
                              │ 60s heartbeat + telemetry sync
                              │ Auth: X-API-Key (static, plaintext)
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                     CLIENT INSTANCE (x N plants)                   │
│  Windows PC | Python 3.14+ | PyInstaller-packaged EXE             │
│                                                                    │
│  ┌─ FastAPI/Uvicorn ────────────────────────────────────────────┐ │
│  │  17 API routers, ~120 endpoints                              │ │
│  │  Auth: JWT (10-year expiry)                                   │ │
│  └─────────────────────────────────────────────────────────────┘ │
│  ┌─ Polling Engine ────────────────────────────────────────────┐ │
│  │  asyncio event loop — 5 protocol readers                     │ │
│  │  Dispatches per-device schedule (10-60s)                     │ │
│  └─────────────────────────────────────────────────────────────┘ │
│  ┌─ Averaging Engine ──────────────────────────────────────────┐ │
│  │  APScheduler — 60s tick — 10 windows                        │ │
│  │  Stores to SQLite Averages table                            │ │
│  └─────────────────────────────────────────────────────────────┘ │
│  ┌─ CPCB Pipeline ─────────────────────────────────────────────┐ │
│  │  APScheduler — 15min cycle                                   │ │
│  │  Validate → Map → Convert → Average → Export → Retain       │ │
│  └─────────────────────────────────────────────────────────────┘ │
│  ┌─ Push Services ─────────────────────────────────────────────┐ │
│  │  TGPCB Live (60s) | TGPCB Delay (15min) | PendingUpload    │ │
│  │  RajAPI Heartbeat (60s) | LED Display (on demand)           │ │
│  └─────────────────────────────────────────────────────────────┘ │
│  ┌─ Frontend ──────────────────────────────────────────────────┐ │
│  │  React/Vite | 10 screens | WebSocket live data              │ │
│  │  Chart.js | Reusable components (Modal, Table, Sparkline)   │ │
│  └─────────────────────────────────────────────────────────────┘ │
│  ┌─ Database ──────────────────────────────────────────────────┐ │
│  │  SQLite (WAL mode, aiosqlite async driver)                   │ │
│  │  21 tables — telemetry, config, CPCB, alarms, calibration   │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### 1.2 Technology Stack (Detailed)

| Layer | Client | Server |
|-------|--------|--------|
| Runtime | Python 3.14+, Windows 10/11 | Python 3.13+, Debian 13 (aarch64) |
| Web Server | Uvicorn (in-process) | Nginx → Uvicorn |
| App Framework | FastAPI | FastAPI |
| ORM | SQLAlchemy 2.x (async) | SQLAlchemy 2.x |
| DB Driver | aiosqlite + sqlite3 | asyncpg |
| DB | SQLite 3 (WAL, single-file) | PostgreSQL 15 (Docker) |
| Auth | JWT (24h access + 7d refresh token rotation) | Static API Key + bcrypt admin username/password login |
| Serialization | Pydantic v2 | Pydantic v2 |
| Frontend | React 18 + TypeScript + Vite | React 18 + TypeScript + Vite |
| Charts | react-chartjs-2 (Chart.js 4) | react-chartjs-2 (Chart.js 4) |
| Scheduler | APScheduler (BackgroundScheduler) | None (poll-based UI) |
| Realtime | WebSocket (broadcast per connection) | Polling (30s interval) |
| Packaging | PyInstaller (single EXE, ~40MB) | systemd service |
| Icon Library | None — inline SVG components | None — inline SVG components |
| CSS | Inline styles + glassmorphism patterns | Inline styles |

### 1.3 Key Design Decisions

| Decision | Rationale | Status |
|----------|-----------|--------|
| SQLite over PostgreSQL | Single-user Windows app; no concurrent write contention beyond polling threads; simplified deployment (no Docker/PostgreSQL on client PC) | Accepted |
| Inline styles over CSS modules | Expedient for single-developer project; component-level scoping without build tooling | Accepted (technical debt: 667 inline styles) |
| JWT over sessions | Stateless auth — no server-side token storage needed; works with localStorage | Accepted |
| 10-year token expiry | Product assumption: "never force logout on plant operators" | Accepted (should add revocation) |
| APScheduler over OS scheduler | Cross-platform (Windows/Linux); in-process — no cron/service dependency | Accepted |
| No message broker (RabbitMQ/Kafka) | Single-machine deployment; all services are in-process; no benefit at this scale | Accepted |
| WebSocket over SSE | Full-duplex needed for alarm acknowledgments; wider library support | Accepted |
| Composite PKs on telemetry | (parameter_id, timestamp) avoids auto-increment overhead; natural key for timeseries | Accepted |
| PyInstaller over Nuitka | Simpler build process; fewer edge cases with hidden imports | Accepted |

---

## 2. Data Flow Diagrams

### 2.1 Polling → Storage → UI

```
Device ──→ Protocol Reader ──→ DataQuality.check() ──→ AlarmEngine.evaluate()
              │                                              │
              ▼                                              ▼
         HistoricalData.insert()                       Alarm.create/update
         LiveData.upsert()
              │
              ▼
         WebSocket.broadcast() ──→ Browser clients
```

### 2.2 Averaging Pipeline

```
APScheduler tick (60s)
       │
       ▼
Fetch raw data from HistoricalData (last 60min)
       │
       ▼
Group by parameter_id, compute per-window aggregates
  ┌─────┬─────┬──────┬──────┬──────┐
  │1min │5min │15min │30min │ ...  │
  └─────┴─────┴──────┴──────┴──────┘
  Special: wind direction → circular mean
       │
       ▼
Batch upsert to Averages table
```

### 2.3 CPCB Export Pipeline (15-min cycle)

```
APScheduler tick (00, 15, 30, 45 min past hour)
       │
       ▼
┌─────────────────────┐
│ Validation Service   │ ← station names, param names, paths
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│ Mapping Service      │ ← internal_param → CPCB_param × conversion_factor
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│ Conversion Service   │ ← ppb→µg/m³, ppm→mg/m³ per CPCB protocol
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│ Average Service      │ ← 15-min aligned windows from 1-min averages
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│ Export Service       │ ← Annexure-I CSV + FIFO retention
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│ Export Log Service   │ ← record count, status, execution time
└─────────────────────┘
```

### 2.4 RajAPI Heartbeat + Command Flow

```
Client (every 60s)                          Server
       │                                        │
       │── POST /api/v1/sync ──────────────────►│
       │   {                                     │
       │     system: { cpu, ram, disk, ... },    │
       │     telemetry: [ { param, value, ...} ] │
       │   }                                     │
       │                                         │── Ingest telemetry
       │                                         │── Check pending commands
       │                                         │── Check broadcasts
       │                                         │── Check AMC/lock status
       │◄── Response ────────────────────────────│
       │   {                                     │
       │     commands: [ { action, ... } ],      │
       │     broadcasts: [ { message, ... } ],   │
       │     lock_status: "unlocked",            │
       │     ota_deployment: { version, ... }    │
       │   }                                     │
       │                                         │
       │── Execute commands locally ─────────────│
       │── Update lock_store.json ───────────────│
       │── Display broadcasts ──────────────────│
```

---

## 3. API Contract Summary

### 3.1 Client API (17 routers, ~120 endpoints)

| Router | Prefix | Auth | Key Endpoints |
|--------|--------|------|---------------|
| Auth | `/auth` | None (login), JWT (rest) | `POST /login`, `POST /logout`, `GET /me` |
| Users | `/users` | Admin JWT | CRUD users |
| Stations | `/stations` | Admin JWT | CRUD + status |
| Devices | `/devices` | Admin JWT | CRUD + `/{id}/test-connection`, `/{id}/poll-now` |
| Parameters | `/parameters` | Admin JWT | CRUD + `/{id}/test-read`, `/tree` |
| Telemetry | `/telemetry` | JWT | `GET /latest`, `GET /dashboard-summary`, `GET /raw`, `GET /averaged` |
| Alarms | `/alarms` | JWT | `GET /`, `GET /active-count`, `PATCH /{id}/acknowledge` |
| Settings | `/settings` | Admin JWT | Plant info, DB ops, firmware check, network test, CPCB config |
| Calibration | `/calibration` | Admin JWT | Start jobs, approve, history |
| CPCB | `/cpcb` | Admin JWT | Station config, mappings, compute, export, backfill, records, logs |
| Reports | `/reports` | JWT | Generate, list, download |
| Logs | `/logs` | Admin JWT | Query, purge |
| Trends | `/trends` | JWT | Chart data, CSV export |
| Broadcasts | `/broadcasts` | JWT | List, create (admin) |
| LED | `/led` | None | `GET /` — live JSON for LAN displays |
| Server Config | `/server-config` | Admin JWT | CRUD server connections + parameter mappings |
| License | `/license` | JWT | Status, verify |

### 3.2 Server API (10 routers, ~50 endpoints)

| Router | Prefix | Auth | Key Endpoints |
|--------|--------|------|---------------|
| Sync | `/api/v1/sync` | API Key | `POST /` — telemetry ingestion + command response |
| Sites | `/api/v1/sites` | Admin Key | CRUD + telemetry queries + lock/unlock + AMC renew |
| Commands | `/api/v1/commands` | Admin Key | CRUD pending commands per site |
| Broadcasts | `/api/v1/broadcasts` | Admin Key | CRUD + activate/deactivate |
| Alarms | `/api/v1/alarms` | Admin Key | List, acknowledge |
| Quality | `/api/v1/quality` | Admin Key | U/O/E/N breakdown per site |
| OTA | `/api/v1/ota` | Admin Key | Version registry + deployment management |
| Downloads | `/api/v1/downloads` | None | Serve installer EXE |
| CPCB | `/api/v1/cpcb` | Admin Key | Cross-site CPCB status, daily records |
| TGPCB | `/api/v1/tgpcb` | API Key | Legacy format compatibility |

### 3.3 WebSocket (Client only)

- **Endpoint:** `ws://{host}/ws/live?token={jwt}`
- **Message types (server → client):**
  - `live_data`: `{ type: "live_data", payload: { parameter_id, value, quality, timestamp } }`
  - `alarm`: `{ type: "alarm", payload: { id, severity, message, parameter_id, state } }`
- **Reconnection:** Auto-retry every 5 seconds on close

---

## 4. Security Architecture

### 4.1 Client Auth Flow

```
Login ──→ POST /auth/login ──→ JWT ──→ localStorage
                                            │
                              ┌─────────────┴─────────────┐
                              ▼                           ▼
                      authFetch()                  WebSocket connect
                      Header: Authorization         wss://...?token=...
                      Bearer <jwt>                        │
                              │                           │
                     Server validates JWT           Server validates JWT
                     (PyJWT.decode + SECRET_KEY)    (same key)
```

### 4.2 Server Auth Flow

```
Client Sync ──→ POST /api/v1/sync ──→ Header: X-API-Key ──→ DB lookup by key
Admin Login ──→ POST /api/v1/auth/login ──→ username + password
                  │
                  ├── bcrypt.checkpw against ADMIN_PASSWORD_HASH (config-time hash)
                  ├── OR key == ADMIN_KEY (legacy backward compat)
                  ├── OR find_site_by_key(db, key) + check is_active
                  └── OR find_device_by_key(db, key) + check parent site is_active
                  │
                  └── Rate limited: 5 req/60s per-IP, 10 failures → 15min key lockout
Admin UI ──→ Login success ──→ sessionStorage ──→ Header: X-Admin-Key
```

### 4.3 Security Gaps (Known)

| Issue | Impact | Mitigation Status |
|-------|--------|-------------------|
| Static API keys in DB plaintext | Key leak = full site access | Open — migrate to JWT. Mitigated: bcrypt admin login added |
| No HTTPS on Pi origin | HTTP between cloudflared → uvicorn | Open — Let's Encrypt pending |
| CPCB file path traversal | Arbitrary file read/write via export_path | Open — validate path |
| API keys in URL query params | Logged in nginx/cloudflare access logs | Open — move to headers |
| Hardcoded encryption key | `.env.enc` obfuscation can be reversed | Open — hardware binding |
| JWT expiry | Stolen token usable | Mitigated: 24h + refresh token rotation (client), 7d (server) |
| `.env` on Pi world-readable | Secrets readable by any process | Open — chmod 600 |
| PostgreSQL exposed to LAN | Brute-force on 5432 | Open — firewall |
| User enumeration | Distinct error codes leak valid keys | Fixed — uniform 401/403 responses |
| Missing rate limiting | Brute-force login | Fixed — per-IP (5/60s) + per-key lockout (10/15min) + API limit (200/min) |
| Weak default passwords | Guessable template defaults | Fixed — bcrypt hashing, `Ultron@2026` / `Ultron123.0` |

---

## 5. Database Architecture

### 5.1 Client — SQLite (21 tables)

Full schema in `BACKEND_SCHEMA.md`. Key design decisions:

- **Composite primary keys** on telemetry tables `(parameter_id, timestamp)` for natural timeseries indexing
- **Three-tier hierarchy:** Station → Device → Parameter (4-1-M relationships)
- **Cascade deletes** on all child tables (Device → Parameter → Telemetry/Alarms/CPCB)
- **WAL mode** for concurrent read/write from polling engine + API server
- **SQLite concurrency:** Semaphore + randomized backoff + jitter prevents `database is locked` errors

### 5.2 Server — PostgreSQL (9 tables)

- **IndustrySite** as root entity — all telemetry, alarms, and commands keyed to site
- **Static API key** stored in `industry_sites.api_key` (plaintext, unique)
- **UUID primary key** on Broadcasts for non-sequential IDs
- **OTADeployment** tracks per-site deployment lifecycle (pending → in_progress → success/failed)
- **PendingCommand** queue consumed by client heartbeat

---

## 6. Performance Requirements

| Metric | Target | Measurement |
|--------|--------|-------------|
| Poll → SQLite latency | < 1s per device per poll cycle | Log-based |
| WebSocket push latency | < 200ms (poll → browser) | Browser DevTools |
| Averaging (all windows) | < 5s per 60s tick | Log-based |
| CPCB pipeline | < 30s per 15-min cycle | CPCBExportLog.execution_time_ms |
| Dashboard load | < 2s (client), < 5s (server, 100 plants) | Frontend timing |
| API response (CRUD) | < 500ms P95 | Server timing headers |
| Concurrent UI clients | 5 per client PC | — |
| Concurrent device polls | 50 devices × 10s interval | Async event loop |
| SQLite concurrent writers | 3 (poll + scheduler + manual) | Semaphore queue |

---

## 7. Deployment Architecture

### 7.1 Client Build Pipeline (Windows)

```
Source Python/FastAPI ──→ PyInstaller ──→ UltrON.exe (~40MB)
     │                                            │
     ▼                                            ▼
React/Vite ──→ npm run build ──→ dist/ ──────→ Bundled into EXE
                                               via --add-data
```

**Startup:** `UltrON.exe` → uvicorn on `0.0.0.0:8000` → serves API + static frontend + WebSocket. Runs as Windows scheduled task (auto-restart on crash).

### 7.2 Server Deployment (Pi 5)

```
systemd ──→ uvicorn (port 8080) ←── nginx (port 80, reverse proxy)
                                             │
                                             ├── serves React/Vite PWA build
                                             │
                                    cloudflared tunnel → rajapi.com (HTTPS)
                                             │
                                    Docker PostgreSQL 15 (port 5432)
```

**Startup:** systemd service → uvicorn with 4 workers. Auto-restart on crash. Nginx serves static frontend build.

### 7.3 Environment Configuration

| File | Location | Purpose |
|------|----------|---------|
| `.env` | Client root | DB creds, admin password, gateway ID |
| `.env.enc` | Client root | Encrypted license + API keys |
| `secret.key` | Client data dir | JWT signing key (auto-generated) |
| `lock_store.json` | Client data dir | Remote lock state (synced) |
| `ultron.db` | Client data dir | SQLite database |
| `.env` | Server root | DB creds, secrets (world-readable — FIXME) |

---

## 8. Monitoring & Observability

### 8.1 Logging (Client)

| Log Channel | Level | Output | Retention |
|-------------|-------|--------|-----------|
| `ultron.polling` | DEBUG+ | Console + DB (SystemLog) | 30-90 days |
| `ultron.api` | INFO+ | Console + DB | 30-90 days |
| `ultron.cpcb` | INFO+ | Console + DB + CPCBExportLog | Indefinite |
| `ultron.scheduler` | INFO+ | Console + DB | 30-90 days |
| `ultron.auth` | INFO+ | Audit log | Indefinite |
| `ultron.ssl` | WARNING+ | Console | N/A |

### 8.2 Health Check Endpoints

| Endpoint | Purpose | Route |
|----------|---------|-------|
| Client `/health` | Uptime + DB status | GET /health |
| Client `/api/v1/settings/network-test` | Internet + DNS + firewall | POST /settings/network-test |
| Server `/api/v1/sites/{id}` | Last sync, version, error | GET /sites/{id} |

---

## 9. Hardening Priorities

Ordered by impact/effort:

1. **HTTPS on Pi** — Let's Encrypt cert + nginx SSL termination on port 443 (1 day)
2. **CPCB path traversal fix** — Validate `export_path` is under allowed directory (2 hrs)
3. **Server .env permissions** — `chmod 600` on secrets file (5 min)
4. **Token revocation** — Server-side blacklist so logout actually kills the JWT (4 hrs)
5. **API keys in headers only** — Remove query-param auth fallback (1 hr)
6. **Database migration versioning** — Alembic or manual version table (1 day)
7. **PostgreSQL LAN firewall** — Bind to 127.0.0.1 or firewall rule (30 min)
8. **Remove API key echo from responses** — Stop leaking keys in sync response (2 hrs)

### Completed hardening (this sprint):
- ✅ **User enumeration** — Uniform error responses for all key types
- ✅ **Rate limiting** — Per-IP login (5/60s) + per-key lockout (10/15min) + API rate (200/min)
- ✅ **Weak passwords** — bcrypt hashing for server admin login; default passwords updated
- ✅ **Account lockout** — 5 failed attempts → 15min auto-clear lock
- ✅ **JWT 10yr → 24h** — Access token reduced; refresh token rotation (7d)
