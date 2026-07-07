# RajAPI Enterprise v3 — Complete Technical Audit

**Date:** 2026-07-04
**Audited by:** Dev
**Scope:** RajAPI backend (Rust/Axum), Fleet Dashboard (vanilla HTML/JS), UltrON client integration (Python)

---

## 1. Complete Folder Structure

```
pi@raj.local:/home/pi/rajapi_backend/
├── Cargo.toml                         # Rust project manifest (Axum 0.7, SQLx 0.8)
├── .env                               # DATABASE_URL + RUST_LOG (world-readable)
├── migrations/
│   ├── 20260704000000_initial.sql      # Full schema: gateways, heartbeat_log, commands, broadcasts, users
│   └── 20260704000001_add_auth.sql     # Adds last_token column, sets admin password hash
├── src/
│   ├── main.rs                         # Server entry: router nesting, CORS, tracing, migrations
│   ├── routes.rs                       # All API route handlers (12 endpoints)
│   ├── auth.rs                         # Login handler + Bearer token extractor
│   ├── models.rs                       # Struct definitions (HeartbeatRequest, Gateway, Command, etc.)
│   └── db.rs                           # PostgreSQL pool initialization
├── target/release/rajapi_server        # Compiled binary (~7 MB)
└── target/release/build/ ...           # Build artifacts

/etc/nginx/
└── sites-enabled/default               # Proxies /api/ → 127.0.0.1:8080, serves dashboard at /

/etc/systemd/system/rajapi.service       # systemd unit for auto-restart

/var/www/rajapi/
└── index.html                          # Fleet Dashboard SPA (~380 lines inline HTML/CSS/JS)

Windows client: C:\Users\sunsh\OneDrive\Music\UltrON\client\backend\ultron_backend\app\
├── main.py                             # FastAPI entry: lifespan, routers, APScheduler
├── config.py                           # Pydantic Settings + encrypted config loader
└── services/
    ├── rajapi_sync.py                  # Heartbeat sender + command/broadcast executor
    └── polling_engine.py               # Per-device poll loops with reader pooling
```

---

## 2. Frontend Architecture

**Framework:** None — vanilla HTML/CSS/JS single file.

**Style:** Inline `<style>` block, no CSS preprocessor, no build step.

**JS:** Inline `<script>` block, no modules, no transpiler.

**Deployment:** Direct file copy to `/var/www/rajapi/index.html`, served by nginx with `try_files $uri $uri/ /index.html` fallback.

**Key characteristics:**
- No framework, no router, no virtual DOM
- State held in global variables (`token`, `gateways`, `commands`, etc.)
- DOM manipulation via `innerHTML` reassignment
- Polling-based refresh (every 15 seconds)
- CSS: dark theme (`#0f172a` base), cyan accent (`#38bdf8`), green/red/amber status badges

---

## 3. Backend Architecture

### RajAPI Server (Rust/Axum)

| Layer | Component | Description |
|---|---|---|
| HTTP | Axum 0.7 | Async web framework, path params via `:param` syntax |
| Auth | Custom Bearer token | `AuthUser` extractor via `FromRequestParts`, UUID tokens stored in DB |
| DB | SQLx 0.8 + PostgreSQL 15 | Connection pool (max 10), compiled migrations |
| Middleware | Tower HTTP | CORS (permissive), Trace (request logging) |
| Deploy | systemd | Restart=always, RestartSec=5 |

### UltrON Client (Python/FastAPI)

| Layer | Component | Description |
|---|---|---|
| HTTP | FastAPI | Uvicorn ASGI |
| Auth | JWT (HS256) | Custom `hash_password` + `decode_token` |
| DB | SQLAlchemy async + aiosqlite/sqlite | Local SQLite per client |
| Polling | asyncio tasks | Per-device poll loops with reader pooling |
| Scheduler | APScheduler | Averaging, heartbeat, CPCB pipeline |
| Config | Pydantic Settings | Encrypted `.env.enc`, auto-decrypt on boot |

---

## 4. API Structure

### RajAPI Server Endpoints

| Method | Path | Auth | Handler | Description |
|---|---|---|---|---|
| POST | `/api/v1/auth/login` | None | `login_handler` | Returns Bearer token |
| POST | `/api/v1/heartbeat` | Gateway + Secret | `handle_heartbeat` | Authenticated heartbeat, returns commands + broadcasts |
| GET | `/api/v1/gateways` | Bearer token | `list_gateways` | All gateways |
| GET | `/api/v1/gateways/:id` | Bearer token | `get_gateway` | Single gateway detail |
| GET | `/api/v1/gateways/:id/history` | Bearer token | `list_heartbeat_history` | Last 50 heartbeat logs |
| POST | `/api/v1/commands` | Bearer token | `create_command` | Dispatch remote command |
| GET | `/api/v1/commands/pending/:gateway_id` | Bearer token | `get_pending_commands` | Pending commands |
| PATCH | `/api/v1/commands/:id` | Bearer token | `update_command_status` | Mark executed/failed |
| GET | `/api/v1/commands/history/:gateway_id` | Bearer token | `list_command_history` | Last 50 commands |
| POST | `/api/v1/broadcasts` | Bearer token | `create_broadcast` | Create broadcast |
| GET | `/api/v1/broadcasts` | Bearer token | `list_broadcasts` | Active broadcasts |
| GET | `/api/v1/health` | None | `health_check` | Returns `{"status":"ok"}` |
| GET | `/api/v1/stats` | Bearer token | `fleet_stats` | Total/online/offline counts |

### UltrON Client Heartbeat Request

```json
{
  "gateway_id": "ULTRON-IND-000001",
  "device_secret": "sk_test_heartbeat_2024",
  "version": "1.0.67",
  "heartbeat_ts": "2026-07-04T07:30:00Z",
  "status": "online",
  "cpu_usage": 42.5,
  "ram_usage": 61.2,
  "disk_usage": 33.7,
  "internet": true,
  "vpn": true,
  "polling_active": true,
  "service_status": {"polling": true, "cpcb_push": true},
  "hostname": "ultron-pc-01"
}
```

### Heartbeat Response

```json
{
  "status": "ok",
  "commands": [],
  "broadcasts": [],
  "lock_status": "unlocked",
  "allow_spcbcpcb_push": true
}
```

---

## 5. Database Models

### `gateways`

| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | |
| gateway_id | VARCHAR(64) UNIQUE | e.g. `ULTRON-IND-000001` |
| device_secret | VARCHAR(128) | Plaintext — authentication credential |
| plant_name | VARCHAR(255) | |
| location | VARCHAR(255) | Nullable |
| is_active | BOOLEAN | Default true |
| last_heartbeat | TIMESTAMPTZ | Nullable |
| last_status | VARCHAR(20) | `online` / `offline` |
| last_version | VARCHAR(20) | e.g. `1.0.67` |
| last_ip | VARCHAR(255) | Actually stores hostname |
| cpu_usage | FLOAT | |
| ram_usage | FLOAT | |
| disk_usage | FLOAT | |
| internet | BOOLEAN | |
| vpn | BOOLEAN | |

### `heartbeat_log`

| Column | Type | Notes |
|---|---|---|
| id | BIGSERIAL PK | |
| gateway_id | VARCHAR(64) FK → gateways | |
| heartbeat_ts | TIMESTAMPTZ | Client-reported time |
| status | VARCHAR(20) | |
| cpu_usage | FLOAT | |
| ram_usage | FLOAT | |
| disk_usage | FLOAT | |
| internet | BOOLEAN | |
| vpn | BOOLEAN | |
| version | VARCHAR(20) | |
| hostname | VARCHAR(255) | |
| received_at | TIMESTAMPTZ | Server receipt time |

### `commands`

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| gateway_id | VARCHAR(64) FK → gateways | |
| command_type | VARCHAR(64) | `restart_polling`, `show_toast`, etc. |
| payload | JSONB | |
| status | VARCHAR(20) | `pending` / `delivered` / `executed` / `failed` |
| created_at | TIMESTAMPTZ | |
| expires_at | TIMESTAMPTZ | |
| executed_at | TIMESTAMPTZ | |

### `broadcasts`

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| message | TEXT | |
| severity | VARCHAR(20) | `info` / `warn` / `critical` |
| gateway_ids | TEXT[] | Nullable — null = all gateways |
| is_active | BOOLEAN | Default true |
| created_at | TIMESTAMPTZ | |
| expires_at | TIMESTAMPTZ | |

### `users`

| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | |
| username | VARCHAR(64) UNIQUE | |
| password_hash | VARCHAR(256) | SHA-256 hex |
| role | VARCHAR(20) | `admin` |
| last_token | VARCHAR(64) | Nullable — current session token |
| created_at | TIMESTAMPTZ | |

---

## 6. Authentication Flow

### Login
1. Client sends `POST /api/v1/auth/login` with `{username, password}`
2. Server SHA-256 hashes password
3. Queries `users WHERE username = $1 AND password_hash = $2`
4. On match: generates UUID v4 token, saves to `users.last_token`, returns `{token, username, role}`
5. On mismatch: returns `401 {"error":"Invalid username or password"}`

### API Auth
1. Frontend stores token in `localStorage` (`rajapi_token`)
2. Every API call adds header `Authorization: Bearer <token>`
3. `AuthUser` extractor reads header, queries `users WHERE last_token = $1`
4. Valid token → request proceeds. Invalid/missing → `401`

### Weaknesses
- Token stored in localStorage (XSS-vulnerable)
- Token never expires (permanent until server restart or re-login)
- SHA-256 is fast (no bcrypt/argon2 salt) — vulnerable to offline brute-force if DB leaked
- No token refresh mechanism
- No session invalidation endpoint

---

## 7. Routing Structure

### RajAPI Axum Routing

```
/api/v1/
├── /auth/login                    POST → login_handler
├── /heartbeat                     POST → handle_heartbeat
├── /gateways                      GET  → list_gateways
├── /gateways/:id                  GET  → get_gateway
├── /gateways/:id/history          GET  → list_heartbeat_history
├── /commands                      POST → create_command
├── /commands/pending/:gateway_id  GET  → get_pending_commands
├── /commands/:id                  PATCH → update_command_status
├── /commands/history/:gateway_id  GET  → list_command_history
├── /broadcasts                    POST → create_broadcast
├── /broadcasts                    GET  → list_broadcasts
├── /health                        GET  → health_check
└── /stats                         GET  → fleet_stats
```

All routes nested via `Router::new().nest("/api/v1", routes::api_routes())`.

### UltrON FastAPI Routing

```
/api/v1/  (18 routers: stations, devices, parameters, telemetry, trends, reports, alarms, logs, settings, server_config, auth, users, license, led, broadcasts, cpcb, calibration, version)
/ws/live  WebSocket
```

---

## 8. Component Hierarchy

### Fleet Dashboard (single-file SPA)

```
RajAPI Fleet Dashboard
├── Login Page (#loginPage)
│   ├── Username input
│   ├── Password input
│   └── Sign In button → login()
├── App Shell (#app)
│   ├── Nav bar
│   │   ├── Title "RajAPI Fleet"
│   │   ├── User display
│   │   └── Sign Out → logout()
│   ├── Container
│   │   ├── Alert (#alert)
│   │   ├── Stats bar (#stats) — 3 stat cards
│   │   ├── Tabs — Gateways | Commands | Broadcasts
│   │   ├── Gateways Panel (#panelGateways)
│   │   │   ├── Filter input + Refresh button
│   │   │   └── Gateway table (clickable rows)
│   │   ├── Commands Panel (#panelCommands)
│   │   │   ├── Command dispatch form (select, dropdown, payload, button)
│   │   │   └── Command list
│   │   └── Broadcasts Panel (#panelBroadcasts)
│   │       ├── Create broadcast form (textarea, severity, expiry, button)
│   │       └── Active broadcasts list
│   └── Gateway Detail Modal (#gatewayModal)
│       └── Detail rows: status, ID, plant, location, version, host, CPU, RAM, disk, internet, VPN, last heartbeat, active, registered
```

---

## 9. State Management

**Approach:** Global variables + localStorage persistence.

```javascript
let token = localStorage.getItem('rajapi_token');
let user = JSON.parse(localStorage.getItem('rajapi_user') || '{}');
let gateways = [];
let commands = [];
let broadcasts = [];
let stats = {};
let pollInterval = null;
```

**Pattern:**
1. `login()` saves token+user to localStorage, calls `initApp()`
2. `initApp()` calls `loadAll()` then starts `setInterval(loadAll, 15000)`
3. Each `load*()` function fetches from API → stores in global → calls `render*()`
4. `render*()` functions completely overwrite `innerHTML`

**Issues:**
- Every render destroys and recreates all DOM nodes
- No memoization — filter values are recomputed on every render
- Commands are hardcoded to `ULTRON-IND-000001` (see #11)
- No loading state between fetch and render
- Race conditions if API responses arrive out of order

---

## 10. Reusable Components

**None identified.** The single-file SPA has no component abstraction. Every UI element is DOM strings in `innerHTML` assignments:

- `renderStats()` — inline HTML template
- `renderGateways()` — inline table template
- `renderCommands()` — inline card template
- `renderBroadcasts()` — inline card template
- `showGateway()` — inline modal template

The `status-badge` CSS class is reused across `renderGateways()` and `showGateway()`. The alert pattern is defined once via `showAlert()`.

---

## 11. Duplicate Code

1. **Hardcoded gateway ID** — `loadCommands()` hardcodes `ULTRON-IND-000001` instead of reading from selected gateway or iterating the gateways list. This means the Commands panel only ever shows commands for this one gateway.

2. **Status/active checks repeated** — `isOnline` logic duplicated in `renderGateways()` and `showGateway()`:
   ```javascript
   const isOnline = g.last_status === 'online' && g.last_heartbeat && (Date.now() - new Date(g.last_heartbeat).getTime() < 120000);
   ```

3. **Broadcast storage in client** — Same broadcast processing logic appears in both `rajapi_sync.py:_execute_command("show_toast")` (lines 85-90) and `rajapi_sync.py:send_heartbeat()` (lines 146-160).

4. **Secret key fallback** — `_load_or_create_secret_key()` in `config.py` and `validate_secret_key()` validator have overlapping logic.

5. **DB copy logic** — `config.py` lines 39-68 (template/db copy from bundle) duplicated in `main.py:131-142`.

6. **CSS classList manipulation** — `switchTab()` manually selects tabs and panels by hardcoded index.

---

## 12. Dead Code

1. **`CENTRAL_API_URL` and `_central_sync_worker()`** — The old `_central_sync_worker()` method in `polling_engine.py:403-462` is completely replaced by `rajapi_sync.py`, but the code still exists. It is never called (no reference in `main.py`).

2. **`RAJAPI_API_KEY` and `RAJAPI_STATION_ID` legacy fields** — `config.py:275-282` keeps these for backward compatibility but they are only used as fallback values:
   ```python
   "gateway_id": settings.GATEWAY_ID or settings.RAJAPI_STATION_ID,
   "device_secret": settings.DEVICE_SECRET or settings.RAJAPI_API_KEY,
   ```

3. **`push_to_rajapi` alias** — `rajapi_sync.py:185` defines `push_to_rajapi = send_heartbeat` — a legacy alias kept for existing APScheduler references.

4. **`_recover_config()` function in config.py** — Large (70+ lines) recovery routine for edge cases (missing/corrupted `.env.enc`) that may never execute in normal operation.

5. **`/show-window` endpoint** — `main.py:385-409` provides a ctypes-based window restoration on Windows. This is a debug utility shipped in production.

6. **`/shutdown` endpoint** — `main.py:412-419` allows remote shutdown of the client server via `os._exit(0)`.

7. **`DeviceProtocol.modbus_rtu` conditional** — `polling_engine.py:487` has special RTU interval handling that may be dead if no RTU devices are deployed.

---

## 13. Performance Issues

1. **Full DOM re-render** — Every 15-second poll cycle destroys and recreates all HTML via `innerHTML =`. No virtual DOM, no diffing. For a fleet of 100+ gateways, this will cause visible jank.

2. **No pagination** — `list_gateways` returns ALL gateways. The frontend renders them in a single table. With 1000+ gateways this will be unusable.

3. **Parallel fetch, serial render** — `loadAll()` uses `Promise.all` for fetches, but each render function runs independently. If stats loads first and gateways lags, the UI updates in multiple flashes.

4. **setInterval instead of setTimeout** — `setInterval(loadAll, 15000)` doesn't account for fetch duration. If the API starts slowing down, requests will pile up. Should use recursive `setTimeout`.

5. **No data caching** — Every 15 seconds re-fetches all data: stats, gateways, broadcasts, commands. No ETags, no If-Modified-Since, no client-side cache.

6. **`heartbeat_log` table unbounded growth** — No cleanup/rotation mechanism. Every heartbeat creates a row. At 60s intervals for a single gateway: ~52K rows/year. For 1000 gateways: ~52M rows/year.

7. **PostgreSQL pool fixed at 10** — `db.rs:7` hardcodes `max_connections(10)`. With many concurrent heartbeats and dashboard queries, this will become a bottleneck.

8. **Inline CSS in HTML** — The full stylesheet is in the HTML `<style>` block (~380 lines). Not cached separately.

---

## 14. Security Issues

### Critical

1. **Password stored as raw SHA-256** — `auth.rs:23-27` hashes with SHA-256, no salt, no bcrypt/argon2. Vulnerable to rainbow table and fast GPU-based attacks.

2. **World-readable `.env`** — Contains `DATABASE_URL` with plaintext PostgreSQL password. Any process on the Pi can read it.

3. **PostgreSQL exposed to Docker network without TLS** — `DATABASE_URL` uses TCP without SSL. Password transmitted in plaintext over the network.

### High

4. **Token never expires** — `last_token` stored in DB indefinitely. No TTL, no refresh mechanism. A leaked token works until manually cleared.

5. **XSS via broadcast/command payload** — The dashboard renders broadcast messages and command payloads directly via `innerHTML`:
   ```javascript
   container.innerHTML = commands.map(c => `...${JSON.stringify(c.payload)}...`).join('');
   ```
   A crafted payload like `{"x":"<script>alert(1)</script>"}` executes arbitrary JS.

6. **No HTTPS on origin** — nginx proxies `http://127.0.0.1:8080` (plain HTTP). Cloudflare tunnel has HTTPS, but the origin does not.

7. **`CorsLayer::permissive()`** — `main.rs:41` allows all origins. Fine for a tunneled admin panel, but not recommended.

### Medium

8. **`localStorage` token storage** — Vulnerable to XSS. Should use `httpOnly` cookies or at least `sessionStorage`.

9. **No rate limiting on login** — `/api/v1/auth/login` has no throttling. An attacker can brute-force passwords.

10. **`os._exit(0)` in `/shutdown`** — Remote shutdown endpoint has no auth protection on the client.

11. **`last_ip` stores hostname** — Column says "IP" but stores `platform.node()`. Misleading semantics.

### Low

12. **`device_secret` in heartbeat response** — The `HeartbeatRequest` deserializes the secret but the response doesn't echo it. However the gateway query selects `device_secret` unnecessarily.

13. **UUID v4 for session tokens** — Cryptographically random, but stored in DB without hashing. DB compromise reveals all tokens.

---

## 15. UI Inconsistencies

1. **Command history hardcoded** — The Commands tab always shows commands for `ULTRON-IND-000001` regardless of which gateway is selected in the dispatch dropdown.

2. **No empty state for gateway detail modal** — `showGateway()` always shows unless `!g` (API returns null). No "Gateway not found" state.

3. **Broadcast form lacks character count/limit** — No indication of how long a broadcast message can be.

4. **Command dispatch form doesn't clear type dropdown** — Only the payload field is cleared after dispatch.

5. **Tab switching loses filter state** — The gateway filter input retains its value when switching tabs but the issue is that `renderGateways()` only runs on data load, not tab switch, so stale data may show.

6. **Stats precision inconsistency** — CPU/RAM/disk show as `42.5`, `61.2`, `33.7` in the backend but rendered as `42.5%`, `61.2%`, `33.7%` on the frontend. However they may show `42.5000001%` if float rounding varies.

7. **No responsive design for modals** — `max-width: 600px` works on desktop but may overflow on mobile.

8. **Severity coloring mismatch** — `broadcast-card` uses left border for severity, but command cards don't use any severity indicator for failed commands.

---

## 16. Missing Error Handling

1. **`api()` catch clause** — All API errors are caught by `api()` which calls `res.json()`. If the response is not JSON (e.g., nginx HTML error page), it throws `Unexpected end of JSON input` — exactly the error in the console.

2. **Network errors unhandled** — `login()` has a try/catch, but `initApp()` and `loadAll()` don't. A network outage shows blank UI, no reconnect.

3. **401 leads to silent logout** — `api()` calls `logout()` on 401, which clears everything. The user sees the login screen — no error message.

4. **Gateway detail fetch failure** — `showGateway()` returns early if `!g`, but doesn't show any error message in the modal.

5. **Command dispatch on empty gateway** — Shows alert, but doesn't clear the form or reset to a safe state.

6. **Broadcast creation with no message** — Shows "Enter a message" alert, but doesn't validate for whitespace-only messages.

7. **JS `Date` parsing with null values** — `renderGateways()` and `showGateway()` call `new Date(g.last_heartbeat).toLocaleString()` without checking if `g.last_heartbeat` is null (the backend returns it as null for never-heard gateways).

8. **`logout()` is not async** — The function clears state but doesn't call any API to invalidate the token on the server (no logout endpoint exists).

---

## 17. Missing Loading States

1. **Login button** — No disabled state or spinner while waiting for login response. Double-click can cause duplicate requests.

2. **Stats** — Renders empty values (`0`) before data arrives. No skeleton loader.

3. **Gateway table** — Renders "No gateways registered" before first fetch completes. Very brief flash.

4. **Command dispatch** — Button stays active while request is in flight. Can dispatch the same command multiple times.

5. **Broadcast creation** — Same as commands — no in-flight state.

6. **Data polling** — No indicator that data is being fetched. Users don't know if the dashboard is live or stale.

---

## 18. Build Warnings

### Rust (RajAPI Server)
```
warning: unused variable: `gateway`
  → src/routes.rs:62:9
  → variable is not read in heartbeat handler (queried but only used for auth check)

warning: fields `polling_active` and `service_status` are never read
  → src/models.rs:26-27 (HeartbeatRequest struct)
  → These fields are sent by the client but never stored or acted upon

warning: dead code: `ApiError`
  → src/models.rs:110-112 (struct defined but never used)
```

### Python (UltrON Client)
- No standard build system — PyInstaller `.exe` bundling. No linter or type checker enforced.
- `_central_sync_worker()` in `polling_engine.py:403-462` — fully unreachable dead code.
- `config.py:71-142` — `_recover_config()` has deep nested paths (30-50 lines deep) that could benefit from early returns.
- `rajapi_sync.py` — `_execute_command` imports inside function body (lazy imports at lines 52, 56, 60, 68).

---

## 19. Future Scalability Problems

1. **Single-file frontend** — At ~380 lines it's already difficult to navigate. Adding fleet map, user management, gateway grouping, or analytics will make it unmaintainable.

2. **No database migrations for schema changes** — SQLx migrations exist but are idempotent. Adding columns requires manual migration files. No rollback support.

3. **No gateway grouping/organization** — All gateways in a flat list. No tags, no sites, no hierarchy. A fleet of 1000+ gateways has no organizational structure.

4. **Command fan-out** — To send a command to all gateways, the dashboard must select each individually. No bulk/batch command endpoint.

5. **No WebSocket push** — The dashboard polls every 15 seconds. For real-time fleet monitoring, add WebSocket support for instant updates.

6. **Heartbeat log archive/purge** — No data lifecycle management. `heartbeat_log` grows unbounded. At scale, queries will degrade.

7. **Single admin user** — `users` table supports one hardcoded admin. No role-based access control.

8. **No gateway registration flow** — Gateways are registered manually via SQL INSERT. No self-registration or API endpoint for gateway signup.

9. **No metrics/monitoring** — No exposed metrics endpoint, no health check aggregation, no alerting for fleet-wide issues (mass gateway disconnection, etc.).

10. **Cloudflared tunnel as single point of failure** — If cloudflared goes down, `rajapi.com` is unreachable. No failover tunnel or direct IP access for critical management.

11. **Client-side `GATEWAY_ID` hardcoded in EXE** — The encrypted `.env.enc` bundles `GATEWAY_ID=ULTRON-IND-000001`. Every client needs a unique build. No runtime gateway registration.

12. **No API versioning strategy** — `/api/v1/` is hardcoded. Adding breaking changes requires a new nested router. No deprecation headers.
