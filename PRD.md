# UltrON — Product Requirements Document

**Version:** 1.0  
**Date:** 2026-07-13  
**Status:** Draft  
**Author:** Product Team

---

## 1. Executive Summary

UltrON is an industrial IoT platform purpose-built for **Continuous Emission Monitoring Systems (CEMS)** and **Continuous Ambient Air Quality Monitoring Systems (CAAQMS)** in India. It provides real-time telemetry acquisition, CPCB-mandated data export, alarm management, and multi-site fleet control — all from a single Windows PC at each plant, aggregated into a central admin dashboard (RajAPI).

**Core value:** UltrON bridges the gap between raw industrial sensors and CPCB regulatory compliance. It handles polling, averaging, quality coding, and Annexure-I generation on a 15-minute cadence, with a central command centre for fleet operators.

---

## 2. Problem Statement & Opportunity

### Problem
- Industrial plants run analysers from multiple vendors (Envea, Thermo Fisher, Teledyne, Horiba, etc.) with incompatible protocols
- CPCB mandates 15-minute averaged data with specific quality codes (U/O/E/N) and Annexure-I CSV format
- No off-the-shelf product handles all of: multi-protocol polling → CPCB compliance → fleet aggregation
- Plant engineers manage devices locally; fleet operators have no unified view
- Central authorities (TGPCB, CPCB) require live push (1min) and delayed push (15min) telemetry

### Opportunity
- Single software install per plant handles the entire pipeline: device → CPCB
- Central dashboard gives fleet operators visibility into all plants
- Remote commands, OTA updates, and AMC enforcement reduce on-site visits
- CPCB compliance is a regulatory moat — switching costs are high once certified

---

## 3. Target Users & Personas

| Persona | Role | Needs |
|---------|------|-------|
| **Plant Engineer** | Operates UltrON at a client plant | Set up devices, verify readings, export CPCB data, acknowledge alarms |
| **Fleet Operator** | Manages 5-100+ plants via RajAPI | Dashboard per plant, remote commands, OTA, AMC management, cross-site alarms |
| **Admin / Neeraj (CEO)** | Owns Sunshine Technologies | Provision new sites, manage licenses, push broadcasts, monitor compliance |
| **Regulator (CPCB/TGPCB)** | External | Receives Annexure-I CSV files and JSON push — no direct UI access |
| **Field Technician** | On-site maintenance | Use calibration workflow, check device connectivity, verify logs |

---

## 4. Product Features

### 4.1 Device Connectivity & Protocol Support

| Feature | Description |
|---------|-------------|
| Modbus TCP | Async client reading holding/input/coil/discrete registers; all IEC data types with configurable byte/word order |
| Modbus RTU | Async RS485 serial reader; one instance per COM port shared across slaves; half-duplex bus serialization |
| TCP Custom | Raw socket parser for proprietary analysers; parse methods: CSV-over-TCP, position-based, regex, delimiter, length-prefix |
| UDP Custom | UDP socket parser with same parse methods; includes M10404 protocol decoder (Envco PM10/PM2.5) |
| CSV/Excel | File watcher polling latest row; supports daily date-patterned names, headerless, footer-skip, auto-detection |
| LED Display | Serves live telemetry JSON on `GET /led` for LAN LED display boards |

Every protocol is **read-only** (polling engine pulls data, never writes to devices).

### 4.2 Polling & Telemetry Pipeline

- Central polling engine dispatches all active devices on configurable schedules (10-60s)
- Configurable registers: address, count, data type, byte order, word order
- Inline data quality assignment (range validation, frozen sensor detection)
- Inline alarm threshold evaluation (4 levels with hysteresis)
- HistoricalData persistence to local SQLite
- WebSocket push to all connected browser clients

### 4.3 Averaging Engine

- Tick-based aggregator runs every 60s via APScheduler
- 10 windows: 1min, 5min, 15min, 30min, 1hr, 3hr, 6hr, 8hr, 12hr, 24hr, daily
- Vector averaging for wind direction (CPCB-standard circular mean)
- Stores: avg, count, min, max, std_dev per parameter per window

### 4.4 Data Quality Engine (CPCB Standard)

CPCB defines quality codes applied to every data point:

| Code | Meaning | When Applied |
|------|---------|-------------|
| **U** | Good | Within range, no errors |
| **O** | Invalid (outlier) | Outside min_valid/max_valid, sensor known-to-be-faulty |
| **E** | Error | Communication failure, device offline |
| **N** | No data | Missing value, sensor not reporting |

Additional: frozen sensor detection (flags parameters unchanged for 24h).

### 4.5 Alarm Engine

| Feature | Description |
|---------|-------------|
| 4 threshold levels | high_high, high, low, low_low per parameter |
| Hysteresis deadband | Prevents flapping around threshold |
| State machine | active → acknowledged → cleared |
| WebSocket push | Real-time alarm notifications to UI |
| Server sync | Cross-site alarms visible in RajAPI dashboard |

### 4.6 CPCB Export Pipeline (Regulatory Core)

The 15-minute regulatory pipeline:

1. **Mapping** — Internal parameter ↔ 24 CPCB-standard parameter names with conversion factors
2. **Conversion** — Unit conversion per CPCB IT Division Protocol 30-Apr-2015 (ppb → µg/m³, ppm → mg/m³)
3. **Averaging** — 15-min CPCB-compliant averages from 1-min averages using aligned windows (00:00, 00:15, ...)
4. **Export** — Annexure-I CSV generation with per-station/per-parameter FIFO retention
5. **Backfill** — Recalculate and regenerate exports for a date range
6. **Validation** — Station names (no spaces/special chars), parameter names against 24-item allowlist, export path safety

### 4.7 External Push Services

| Service | Cadence | Format | Destination |
|---------|---------|--------|-------------|
| TGPCB Live Push | 60s | JSON | Configurable live_url |
| TGPCB Delay Push | 15min | JSON | Configurable delay_url |
| CPCB File Export | 15min | Annexure-I CSV | Local export_path |
| Pending Upload Retry | On each push | — | Retries failed transmissions from queue |

### 4.8 RajAPI Heartbeat & Fleet Sync

- 60-second heartbeat to RajAPI with system stats (CPU, RAM, disk, internet, version)
- Receives: pending commands, active broadcasts, lock/AMC status, OTA deployment info
- Updates local `lock_store.json` — stops CPCB pushes when site is locked
- Two-way command channel for remote fleet management
- Auth: bcrypt admin username/password login, static API key per site (legacy), per-key lockout after 10 failures in 15min

### 4.9 Central Server — RajAPI

**Purpose:** Aggregates all plant data, provides admin control, remote commands, OTA, AMC enforcement.

| Feature | Description |
|---------|-------------|
| Site Management | CRUD, API key generation (static, plaintext), location, status |
| Telemetry Ingestion | `POST /api/v1/sync` — accepts bulk telemetry, returns commands + broadcasts |
| Dashboard | KPI cards (online/offline plants, alarms, notifications), per-site filtering |
| Live Telemetry | Per-site real-time telemetry panel with device management |
| Remote Commands | Restart polling, reboot PC, factory reset (with confirmation) |
| Broadcast Center | Create/edit/delete, scheduling, target all or specific site |
| AMC Management | Lock/unlock sites, lock reason tracking, expiry enforcement |
| OTA Deployments | Version registry, per-site deployment with status tracking |
| CPCB Compliance | Cross-site sync status, daily record counts, 30-day trend |
| Audit Logs | U/O/E/N quality breakdown per site and per parameter |
| Alarms | Cross-site alarm list with remote acknowledgment |
| Downloads | Serve UltrON installer with GitHub fallback |

### 4.10 Client Frontend (10 Screens)

| Screen | Key Features |
|--------|-------------|
| **Dashboard** | KPI cards (online/offline devices, active alarms), live sparklines, station/device health, broadcasts banner |
| **Devices** | Hierarchical tree (station → device → parameter), CRUD at all levels, register mapping, test-poll |
| **Trends** | Chart.js time-series, configurable range, averaging selectors, CSV export |
| **Reports** | Generate Excel/PDF/CSV, filter by parameter/date/average type |
| **Logs** | Filtered log viewer (type, level, source, date), purge |
| **Settings** | Plant info, app info, DB maintenance, factory reset, firmware check, network test |
| **Users** | Admin CRUD for user accounts with role assignment |
| **CPCB** | 4 sub-tabs: server config, station/mapping config, compute/export/backfill controls, export log |
| **Calibration** | Start jobs, view status/results, approve/reject |
| **Contact** | Support/contact info |

### 4.11 Server Frontend (PWA)

| Tab | Key Features |
|-----|-------------|
| **Dashboard** | KPI cards (total/online/offline plants, alarms, notifications, AMC expiring), site table with search/filter |
| **Broadcast Center** | CRUD broadcasts with scheduling, multi-site targeting |
| **Remote Commands** | Per-site actions (restart, reboot, factory reset) |
| **Telemetry History** | Site/parameter selector, date picker, Chart.js + data table |
| **AMC Management** | Lock/unlock sites, reason tracking, status per plant |
| **CPCB Compliance** | Sync status, daily records, 30-day trend, error alerts |
| **Audit Logs** | U/O/E/N quality breakdown per site (collapsible to parameter) |
| **Notifications** | Cross-site alarm list with acknowledgments |

### 4.12 Security & Access Control

| Feature | Description |
|---------|-------------|
| JWT Auth (Client) | Login returns JWT + refresh token, stored in localStorage |
| Role-based Access (Client) | admin (full CRUD) vs client (read-only) |
| API Key Auth (Server) | Static key per site, X-API-Key header |
| Admin Key Auth (Server) | Login returns key in sessionStorage; also bcrypt-based admin username/password login |
| Rate Limiting (Server) | Per-IP login rate limit (5 req/60s); per-key lockout (10 failures → 15min); API rate limiter (200 req/min, exempts sync/heartbeat/spcb) |
| Account Lockout (Client) | Per-username tracking, 5 failed attempts → 15min lock, auto-clear on expiry |
| Password Hashing (Server) | bcrypt at config load, constant-time verification, DB sync on first login |
| User Enumeration Protection | Same generic error message for invalid credentials regardless of key type, inactive site returns 401 not 403 |
| AMC Expiry | 403 on expired sites, generic "Could not validate API Key" |
| Remote Lock | Admin locks site → stops CPCB pushes |
| License Verification | Key verified against RajAPI, encrypted in `.env.enc` |
| SQLite Concurrency | Semaphore + randomized backoff + jitter for write contention |

---

## 5. Technical Architecture

```
┌──────────────────────────────────────────────────────────┐
│                   CENTRAL SERVER (RajAPI)                  │
│   Raspberry Pi 5, Debian 13, cloudflared tunnel            │
│                                                            │
│   nginx:80 → uvicorn:8080 → FastAPI → PostgreSQL (Docker)  │
│   React/Vite PWA frontend                                   │
│                                                            │
│   ┌─ Admin Dashboard ─────────────────────────────────┐   │
│   │  Sites | Telemetry | Broadcasts | Commands         │   │
│   │  OTA | AMC | CPCB Compliance | Alarms              │   │
│   └────────────────────────────────────────────────────┘   │
└────────────────────────┬───────────────────────────────────┘
                         │ HTTPS (cloudflared tunnel)
                         │ 60s heartbeat + sync
                         ▼
┌──────────────────────────────────────────────────────────┐
│                   CLIENT INSTANCE                          │
│   Windows PC at each plant                                 │
│                                                            │
│   ┌─ Backend (Python/FastAPI) ────────────────────────┐   │
│   │  Polling Engine (5 protocol readers)                │   │
│   │  Averaging Engine (10 windows, APScheduler)         │   │
│   │  Alarm Engine (4 thresholds, hysteresis)            │   │
│   │  Data Quality Engine (U/O/E/N, frozen detection)    │   │
│   │  CPCB Pipeline (validation → conversion → export)   │   │
│   │  Push Engine (TGPCB live/delay, PendingUploads)     │   │
│   │  Heartbeat Sync (RajAPI bidirectional)              │   │
│   │  SQLite database (telemetry, config, logs)          │   │
│   └────────────────────────────────────────────────────┘   │
│                                                            │
│   ┌─ Frontend (React/Vite) ───────────────────────────┐   │
│   │  Dashboard | Devices | Trends | Reports             │   │
│   │  Logs | Settings | Users | CPCB | Calibration       │   │
│   │  WebSocket live data | Chart.js charts              │   │
│   └────────────────────────────────────────────────────┘   │
│                                                            │
│   ┌─ Device Connectivity ─────────────────────────────┐   │
│   │  Modbus TCP/UDP/RTU | CSV/Excel | LED Display      │   │
│   └────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
        │                   │                    │
    ┌───┴───┐          ┌────┴────┐          ┌───┴────┐
    │Modbus │          │ TCP/UDP │          │ CSV/   │
    │Devices│          │Analysers│          │Excel   │
    └───────┘          └─────────┘          └────────┘
```

### Technology Stack

| Layer | Client | Server |
|-------|--------|--------|
| Backend Runtime | Python 3.14+ (PyInstaller EXE) | Python 3.13+ |
| Web Framework | FastAPI + Uvicorn | FastAPI + Uvicorn |
| Database | SQLite via SQLAlchemy (async) | PostgreSQL 15 via SQLAlchemy |
| ORM | SQLAlchemy 2.x (async) | SQLAlchemy 2.x |
| Auth | JWT (PyJWT) | Static API Key |
| Frontend | React 18 + TypeScript + Vite | React 18 + TypeScript + Vite |
| Charts | Chart.js (react-chartjs-2) | Chart.js (react-chartjs-2) |
| Scheduler | APScheduler | — |
| Realtime | WebSocket (broadcast) | Polling (30s refresh) |
| Serialization | Pydantic v2 | Pydantic v2 |
| Packaging | PyInstaller (single EXE) | systemd service |

---

## 6. Non-Functional Requirements

### 6.1 Performance

| Requirement | Target |
|-------------|--------|
| Polling latency (device → SQLite) | < 1s per device per cycle |
| WebSocket push latency | < 200ms from write to browser |
| Averaging computation (all windows) | < 5s per 60s tick |
| CPCB export pipeline | < 30s per 15min cycle |
| Dashboard load time (client) | < 2s |
| Dashboard load time (server, 100 plants) | < 5s |
| Concurrent browser clients (per client PC) | 5 |

### 6.2 Reliability

| Requirement | Approach |
|-------------|----------|
| No data loss on crash | SQLite WAL mode, polling gaps filled on restart |
| Connectivity loss tolerance | Local operation fully independent of RajAPI |
| Write contention | Semaphore + randomized backoff + jitter |
| Disk usage caps | CPCB export FIFO retention, log purge |
| App crash recovery | Windows scheduled task restart, DB auto-recovery |

### 6.3 Security

| Requirement | Status |
|-------------|--------|
| JWT token expiry | 24h (access) + 7d refresh token (rotation) |
| Role-based access | admin / client |
| HTTPS on client UI | No (localhost-bound) |
| HTTPS on server | Edge only (cloudflare → HTTP origin) |
| Secrets at rest | `.env.enc` with obfuscated key |
| DB encryption | None (SQLite file access = full access) |
| Input validation | Pydantic + path traversal checks (CPCB export) |
| Rate limiting (server) | Per-IP login (5/60s), per-key lockout (10/15min), API (200/min) |
| Account lockout (client) | 5 failed → 15min lock, auto-clear |
| Password hashing | bcrypt at config load (server), bcrypt+verify (client) |
| User enumeration | Fixed — generic error messages, uniform status codes |

### 6.4 Compatibility

| Requirement | Target |
|-------------|--------|
| Client OS | Windows 10/11 (64-bit) |
| Client Python | 3.14+ |
| Server OS | Debian 13 (Raspberry Pi 5) |
| Browser | Chrome 120+, Firefox 120+, Edge 120+ |
| Protocols | Modbus TCP/RTU, TCP/UDP Custom, CSV/XLSX |
| Resolution | 1280×720 minimum |

---

## 7. Constraints & Assumptions

### Constraints
- **Single-user app per plant** — no multi-user concurrent editing on client
- **No message broker** — no RabbitMQ, Kafka, or Redis; everything is in-process
- **No cluster/HA** — single Windows PC per plant, single Pi for central server
- **No write-back to devices** — polling is read-only; device configuration is manual
- **Battery-backed analysers** — no graceful shutdown signalling; rely on resume logic
- **One RajAPI server** — hardcoded `rajapi.com` endpoint in client code

### Assumptions
- Each plant has a Windows PC dedicated to UltrON
- Network between client and RajAPI has internet connectivity (graceful degradation if lost)
- Plant engineers have basic Windows administration skills
- CPCB requirements (Annexure-I format, quality codes, parameter list) remain stable
- All sensors/analysers support at least one of: Modbus, TCP, UDP, CSV export, or serial output

---

## 8. Data Retention & Storage

| Data Type | Retention | Notes |
|-----------|-----------|-------|
| HistoricalData | 90 days (configurable) | Oldest cleaned on poll; can be exported before purge |
| Averages | 365 days (configurable) | All windows |
| LiveData | Row per parameter (upsert) | Only latest value kept |
| CPCB Export Records | Per-station FIFO (retention_count adjustable) | Managed by CPCB pipeline |
| System Logs | 30-90 days (configurable) | Purge via Settings UI |
| Alarms | Until cleared (no auto-purge) | Historical alarms persist indefinitely |
| Calibration Records | Indefinite | Audit requirement |

---

## 9. Known Security Findings (As of Audit)

| Severity | Finding | Status |
|----------|---------|--------|
| CRITICAL | No HTTPS on Pi origin (HTTP from cloudflared → uvicorn) | **Open** |
| HIGH | Static API keys echoed in responses, stored plaintext in DB | **Open** |
| HIGH | CPCB file export path traversal | **Open** |
| HIGH | Secrets file world-readable on Pi | **Open** |
| HIGH | PostgreSQL exposed to LAN | **Open** |
| HIGH | Hardcoded encryption fallback key in client | **Open** |
| MEDIUM | API keys passed in URL query params | **Open** |
| MEDIUM | Weak guessable passwords (template defaults) | Open (env.template updated) |
| MEDIUM | `.env` secrets duplicated across deployments | Mitigated (template fixed) |

**Fixed issues seen in audits:**
- `.env.bak` committed to git → deleted + `.gitignore` updated (Critical)
- `DataQuality` enum bug (all codes → "U") → fixed (Medium)
- User enumeration via distinct error codes → fixed; uniform 401/403 responses (High)
- Missing rate limiting on auth endpoints → implemented per-IP (5/60s) + per-key lockout (High)
- Weak guessable passwords → strengthened defaults; bcrypt hashing added (Medium)
- Username enumeration in RajAPI login → generic "Invalid credentials" for all paths (Medium)
- `_sync_admin_password` race on empty DB → error caught safely (Low)

---

## 10. Open Architecture Decisions

| Decision | Options | Status |
|----------|---------|--------|
| SQLite vs embedded PostgreSQL | SQLite is simpler for single-user Windows PC | Accepted |
| JWT vs sessions | JWT avoids server-side state | Accepted |
| No refresh tokens | Inline with infinite-session model | Accepted, but should revisit |
| 10-year token expiry | Matches "never log out" product assumption | Accepted, but should revisit |
| Static API keys vs JWTs for server | Legacy, simplest v1 auth | In progress — bcrypt admin login added; migrate site keys to JWTs next |
| No message broker | Acceptable for single-machine deployment | Accepted |
| Synced averaging vs event-driven | Tick-based for deterministic CPCB windows | Accepted |

---

## 11. Future Roadmap

### Short-term (v1.1 — Next 3 months)
- Token revocation (server-side blacklist on logout)
- Move from static API keys to JWT-based fleet auth
- Replace `SECRET_KEY` with hardware-bound key (TPM or machine fingerprint)
- Add HTTPS to Pi origin (Let's Encrypt + nginx termination)
- Database migration versioning (replace f-string ALTER TABLE)

### Medium-term (v1.2 — v2.0)
- Multi-user concurrent editing on client
- Expose CPCB Annexure-I as REST API (RajAPI can pull instead of reading files)
- Email/SMS alerting for critical alarms
- Push notifications via Web Push API (browser)
- Historical data export to cloud storage (S3-compatible)
- Client auto-update mechanism (not manual EXE swap)

### Long-term (v2.0+)
- PostgreSQL option for larger deployments
- BI tool integration (Power BI, Tableau via ODBC)
- MQTT bridge for standard IoT ecosystem compatibility
- Mobile app (read-only monitoring)
- AI/ML anomaly detection on historical patterns
- White-label multi-tenant SaaS deployment

---

## 12. Glossary

| Term | Definition |
|------|------------|
| **AAQMS** | Ambient Air Quality Monitoring Station |
| **AMC** | Annual Maintenance Contract — when expired, site is locked remotely |
| **Annexure-I** | CPCB-mandated CSV format for 15-minute averaged emission data |
| **CEMS** | Continuous Emission Monitoring System |
| **CAAQMS** | Continuous Ambient Air Quality Monitoring System |
| **CPCB** | Central Pollution Control Board (India) |
| **EMS** | Emission Monitoring Station |
| **FIFO** | First-In-First-Out — retention policy for CPCB export records |
| **RajAPI** | Central aggregation server (rajapi.com) owned by Sunshine Technologies |
| **TGPCB** | Telangana State Pollution Control Board |
| **U/O/E/N** | CPCB quality codes: Good/Invalid/Error/No data |

---

## 13. Appendices

### A. Client API Endpoints (Summary)
17 routers, ~120+ endpoints. Full listing in `client/backend/ultron_backend/app/api/`.

### B. Server API Endpoints (Summary)
10 routers, ~50+ endpoints. Full listing in `server/backend/app/`.

### C. Database Schema
- Client SQLite: 25+ tables (telemetry, config, CPCB, alarms, calibration, admin)
- Server PostgreSQL: 12+ tables (sites, telemetry, broadcasts, commands, OTA, alerts)

### D. Configuration Files
| File | Purpose |
|------|---------|
| `.env` | Environment variables (secrets, passwords) |
| `.env.enc` | Encrypted config (license keys, API keys) |
| `secret.key` | JWT signing key (auto-generated) |
| `lock_store.json` | Remote lock status (synced from RajAPI) |
| `UltrON.spec` | PyInstaller build spec |
