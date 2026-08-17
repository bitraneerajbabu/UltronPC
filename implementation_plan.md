# UltrON — Implementation Plan

**Version:** 1.0  
**Date:** 2026-07-13  
**Status:** Draft  

---

## 1. Plan Overview

This plan covers the UltrON platform as it exists today and the work needed to bring it from its current state (v1.0.70) through hardening, feature completion, and maintenance phases.

**Current state:** Functional product deployed at KTPP and other plants. Known security gaps, technical debt, and pre-production hardening items remain from audits.

---

## 2. Development Phases

### Phase 0 — Foundation & Hardening (Current → v1.1)

**Goal:** Close all CRITICAL/HIGH security findings, fix pre-existing bugs, establish test baseline.

| # | Task | Effort | Priority | Dependencies |
|---|------|--------|----------|-------------|
| 0.1 | HTTPS on Pi origin (Let's Encrypt + nginx SSL termination on port 443) | 1 day | P0-CRIT | nginx on Pi |
| 0.2 | Restrict `.env` on Pi to 600 permissions | 30 min | P0-CRIT | — |
| 0.3 | Bind PostgreSQL to 127.0.0.1 or add firewall rule | 1 hr | P0-CRIT | — |
| 0.4 | CPCB path traversal fix — validate export_path is under allowed directory | 4 hr | P0-CRIT | — |
| 0.5 | Add token revocation (server-side JWT blacklist on logout) | 4 hr | P0-HIGH | — |
| 0.6 | Remove API key echo from RajAPI sync response | 2 hr | P0-HIGH | — |
| 0.7 | Remove API key from URL query param auth (headers only) | 1 hr | P0-HIGH | — |
| 0.8 | Replace secrets with env-specific .env files (no shared defaults) | 2 hr | P0-HIGH | — |
| 0.9 | Replace hardcoded encryption fallback key with hardware binding | 1 day | P0-HIGH | — |
| 0.10 | Add database migration versioning (alembic or version table) | 1 day | P0-MEDIUM | — |
| 0.11 | Fix pre-existing test bugs and increase test coverage to baseline | 2 day | P0-MEDIUM | — |
| 0.12 | Set up CI (GitHub Actions or similar) for automated tests | 1 day | P0-MEDIUM | 0.11 |
| 0.13 | Fix N+1 query patterns (telemetry dashboard, alarm→site lookups) | 4 hr | P0-MEDIUM | — |

**Exit criteria:**
- All CRITICAL and HIGH security findings closed or mitigated
- All syntax/compilation errors eliminated
- Test suite passes 100% (client backend + frontend)
- CI pipeline runs on every push

---

### Phase 1 — Core Pipeline Reliability (v1.1 → v1.2)

**Goal:** Make the polling/averaging/export pipeline production-hardened.

| # | Task | Effort | Priority | Dependencies |
|---|------|--------|----------|-------------|
| 1.1 | Add health check endpoint with DB status, poll stats, queue depth | 4 hr | P1-HIGH | — |
| 1.2 | Add polling engine metrics (poll duration, success rate, lag) | 1 day | P1-HIGH | — |
| 1.3 | Add averaging engine metrics (window count, compute time, gaps) | 4 hr | P1-HIGH | 1.2 |
| 1.4 | Add CPCB pipeline metrics (records/sec, failures, queue depth) | 4 hr | P1-HIGH | — |
| 1.5 | Add polling gap detection and auto-backfill on restart | 1 day | P1-HIGH | — |
| 1.6 | Add CPCB pipeline retry with exponential backoff | 1 day | P1-HIGH | — |
| 1.7 | Add configurable retention cleanup job (HistoricalData, Averages) | 1 day | P1-MEDIUM | — |
| 1.8 | Add alert when CPCB export fails N consecutive times | 4 hr | P1-MEDIUM | — |
| 1.9 | Add DB health monitoring — WAL file size, page count, integrity check | 1 day | P1-MEDIUM | — |
| 1.10 | Replace SQLite polling concurrency semaphore with proper queue | 2 day | P1-MEDIUM | — |
| 1.11 | Add graceful shutdown signal handler (flush queues, close DB) | 4 hr | P1-MEDIUM | — |

**Exit criteria:**
- All pipeline stages have health metrics visible in Settings
- Backfill works correctly for any date range
- Retention cleanups run silently on schedule
- CPCB exports retry with backoff, never silently drop data

---

### Phase 2 — Fleet Management & Admin Tools (v1.2 → v1.3)

**Goal:** RajAPI becomes a full fleet control centre.

| # | Task | Effort | Priority | Dependencies |
|---|------|--------|----------|-------------|
| 2.1 | Add bulk site commands (restart all, broadcast to group) | 2 day | P1-HIGH | — |
| 2.2 | Add site grouping/tagging (region, client, industry type) | 2 day | P1-HIGH | — |
| 2.3 | Add scheduled broadcasts with cron-like recurrence | 1 day | P1-MEDIUM | — |
| 2.4 | Add OTA auto-deploy to version groups | 2 day | P1-MEDIUM | 2.2 |
| 2.5 | Add AMC expiry email alerts to admin | 1 day | P1-MEDIUM | — |
| 2.6 | Add site-level telemetry export (CSV, date range) from RajAPI | 1 day | P1-MEDIUM | — |
| 2.7 | Add per-site CPCB compliance dashboard in RajAPI | 2 day | P1-MEDIUM | — |
| 2.8 | Add multi-site trend overlay (same parameter, multiple plants) | 2 day | P2-LOW | — |

**Exit criteria:**
- RajAPI can manage 100+ sites with sub-5s dashboard load
- OTA deploys work with group targeting
- AMC expiries generate email alerts

---

### Phase 3 — Security & Architecture Upgrade (v1.3 → v2.0)

**Goal:** Modern auth, proper HTTPS everywhere, migration to maintainable patterns.

| # | Task | Effort | Priority | Dependencies |
|---|------|--------|----------|-------------|
| 3.1 | Replace static API keys with JWT-based fleet auth | 3 day | P0-HIGH | — |
| 3.2 | Add refresh token rotation (short-lived access + long-lived refresh) | 2 day | P0-HIGH | — |
| 3.3 | Add rate limiting on API (per-site, per-IP, per-endpoint) | 1 day | P1-HIGH | — |
| 3.4 | Add audit log for all admin actions on RajAPI | 2 day | P1-HIGH | — |
| 3.5 | Add CORS hardening — restrict origins to known client IPs | 1 day | P1-HIGH | — |
| 3.6 | Add input sanitization layer (all user inputs) | 2 day | P1-MEDIUM | — |
| 3.7 | Replace f-string ALTER TABLE migrations with alembic | 1 day | P1-MEDIUM | — |
| 3.8 | Add secrets vault (bcrypt/tink encrypted config fields) | 2 day | P1-MEDIUM | — |
| 3.9 | Add client-side CSP headers | 1 day | P1-MEDIUM | — |
| 3.10 | Penetration test engagement | 3 day | P2-LOW | 3.1-3.9 |

**Exit criteria:**
- All API auth uses JWTs (client + server)
- Refresh tokens with revocation
- All API endpoints have rate limiting
- Input validation at all trust boundaries
- Alembic manages all DB schema changes

---

### Phase 4 — Developer Experience & Extensibility (v2.0 → v2.1)

**Goal:** Reduce technical debt, improve developer velocity.

| # | Task | Effort | Priority | Dependencies |
|---|------|--------|----------|-------------|
| 4.1 | Extract inline styles to CSS modules (priority: 5 most-used components) | 3 day | P2-LOW | — |
| 4.2 | Create reusable component library (Button, Input, Select, Card) | 3 day | P2-LOW | — |
| 4.3 | Add react-router-dom for deep-linking and browser history | 1 day | P2-LOW | — |
| 4.4 | Add React portal-based toast system (replace DOM-created toasts) | 4 hr | P2-LOW | — |
| 4.5 | Add loading skeleton components per page layout | 1 day | P2-LOW | — |
| 4.6 | Add E2E tests (Playwright) for 3 critical user journeys | 3 day | P2-LOW | — |
| 4.7 | Add API documentation (Swagger/OpenAPI) — client + server | 2 day | P2-LOW | — |
| 4.8 | Add developer setup guide with docker-compose for RajAPI | 1 day | P2-LOW | — |
| 4.9 | Add pre-commit hooks (lint, typecheck, test) | 1 day | P2-LOW | — |
| 4.10 | Replace hardcoded `rajapi.com` with configurable endpoint | 2 hr | P2-LOW | — |

**Exit criteria:**
- Design debt items reduced by 50% (measured by inline-style count)
- E2E tests cover login + dashboard + device CRUD
- API docs auto-generated from OpenAPI schema

---

### Phase 5 — New Features & Scale (v2.1+)

**Goal:** Expand product capabilities.

| # | Task | Effort | Priority | Dependencies |
|---|------|--------|----------|-------------|
| 5.1 | PostgreSQL option for larger client deployments | 3 day | P3-FUTURE | — |
| 5.2 | Email/SMS alerting for critical alarms (Twilio/SendGrid) | 3 day | P3-FUTURE | — |
| 5.3 | Web Push API browser notifications for alarms | 2 day | P3-FUTURE | — |
| 5.4 | MQTT bridge for IoT ecosystem | 3 day | P3-FUTURE | — |
| 5.5 | BI tool integration (Power BI, Tableau via ODBC) | 5 day | P3-FUTURE | — |
| 5.6 | Mobile app (PWA or native, read-only monitoring) | 5 day | P3-FUTURE | — |
| 5.7 | AI/ML anomaly detection on historical patterns | 5 day | P3-FUTURE | 4.7 |
| 5.8 | White-label multi-tenant SaaS deployment | 10 day | P3-FUTURE | 5.1 |
| 5.9 | Client auto-update (background download + version check) | 3 day | P3-FUTURE | — |

---

## 3. Effort Summary

| Phase | Tasks | Total Effort | Calendar (1 dev) | Calendar (2 dev) |
|-------|-------|-------------|-------------------|-------------------|
| P0 — Hardening | 13 | ~10 days | 2 weeks | 1.5 weeks |
| P1 — Pipeline Reliability | 11 | ~9 days | 2 weeks | 1.5 weeks |
| P2 — Fleet Management | 8 | ~12 days | 2.5 weeks | 1.5 weeks |
| P3 — Security & Architecture | 10 | ~17 days | 3.5 weeks | 2 weeks |
| P4 — DX & Extensibility | 10 | ~15 days | 3 weeks | 2 weeks |
| P5 — Future Features | 9 | ~39 days | 8 weeks | 5 weeks |
| **Total** | **61** | **~102 days** | **~21 weeks** | **~13.5 weeks** |

---

## 4. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| SQLite corruption on power loss | Medium | High — data loss | WAL mode, integrity check on startup, auto-backup |
| RajAPI Pi SD card failure | Low | High — full server loss | Regular backups, migration guide to new hardware |
| CPCB regulatory format changes | Low | Medium — rework export | Parameterized export templates, not hardcoded format |
| Client PC replaced without notice | Medium | Medium — config lost | Documented restore procedure from exported backup |
| Single developer bus factor | Medium | High — project stalls | Document all patterns in PRD/TRD, inline comments on non-obvious code |
| Browser update breaks inline styles | Low | Low | Phase 4 CSS module extraction removes this risk |
| PyInstaller incompatibility with Python 3.14+ | Medium | Medium — can't build EXE | Test with each Python minor, pin version in build spec |

---

## 5. Dependency Graph

```
P0 (Hardening)
  │
  ▼
P1 (Pipeline Reliability) ──┐
  │                         │
  ▼                         ▼
P2 (Fleet Tools)       P3 (Security Upgrade)
  │                         │
  └─────────┬───────────────┘
            ▼
      P4 (Developer Experience)
            │
            ▼
      P5 (Future Features)
```

- P0 is prerequisite for everything
- P1 and P3 can run in parallel after P0
- P2 depends on P1 (stable pipeline for fleet data)
- P4 depends on P3 (secure auth before inviting contributors)
- P5 is independent

---

## 6. Testing Strategy

### 6.1 Test Pyramid (Target)

```
         ╱─────╲
        ╱  E2E  ╲         3-5 critical user journeys
       ╱ (5-10)  ╲         Playwright, 2-3 min total
      ╱────────────╲
     ╱Integration   ╲      API-level, per router
    ╱ (30-50)       ╲     pytest + httpx, mocks DB
   ╱──────────────────╲
  ╱    Unit Tests      ╲   Pure logic (data quality, averaging,
 ╱ (80-100)            ╲   conversions, CPCB validation)
╱────────────────────────╲
```

### 6.2 Current Coverage

| Layer | Tests | Status |
|-------|-------|--------|
| Frontend smoke | 5 | ✅ Written + passing |
| Backend data quality | 12 | ✅ Written + passing |
| Backend data quality enum | 12 | ✅ Written + passing |
| Backend averaging wind | 10 | ✅ Written + passing (was broken, fixed) |
| Backend config/logger smoke | 3 | ✅ Written + passing |
| Backend CRUD endpoints | 0 | ❌ Not started |
| Backend CPCB pipeline | 0 | ❌ Not started |
| Server (RajAPI) | 0 | ❌ Not started |
| E2E (Playwright) | 0 | ❌ Not started |

### 6.3 Priority Test Additions (Phase 0)

| Test Area | Count | Rationale |
|-----------|-------|-----------|
| Auth router (login, logout, me, 401 handling) | 8 | Security-critical |
| CPCB conversion service | 6 | Regulatory compliance — must be correct |
| CPCB validation service | 6 | Path traversal, param names — security + correctness |
| Polling engine dispatch | 4 | Core pipeline |
| Alarm engine thresholds + hysteresis | 6 | Safety-critical — false negatives = missed alarms |

---

## 7. Build & Release Process

### 7.1 Versioning

**Scheme:** `MAJOR.MINOR.PATCH`

- `MAJOR` — Breaking changes (DB migration, API contract)
- `MINOR` — Features, non-breaking additions
- `PATCH` — Bug fixes, security patches, docs

**Current:** `1.0.70`

### 7.2 Release Checklist

```
□ All tests pass (frontend + backend)
□ Linter clean (no new warnings)
□ Type checker passes
□ CHANGELOG updated
□ VERSION bumped
□ EXE built (PyInstaller)
□ EXE smoke-tested (start → login → dashboard loads)
□ Git tag created
□ EXE uploaded to RajAPI downloads
```

### 7.3 Artifacts

| Artifact | Location | Format |
|----------|----------|--------|
| Client EXE | `client/backend/ultron_backend/dist/UltrON.exe` | PyInstaller single-file |
| Client Source | `client/` | Git |
| Server | `server/` | Git (deployed via git pull + systemctl restart) |
| Frontend Build | `client/frontend/dist/` | Static files (bundled in EXE) |
| RajAPI Frontend Build | `server/frontend/dist/` | Static files (served by nginx) |

---

## 8. Monitoring & Alerts (Post-Phase 1)

### 8.1 Metrics to Track

| Metric | Source | Alert Threshold |
|--------|--------|-----------------|
| Poll success rate | Polling engine logs | < 95% over 5 min |
| CPCB export failures | CPCBExportLog | 3 consecutive failures |
| WebSocket client count | Uvicorn | > 5 per client PC |
| DB file size | SQLite file | > 1 GB |
| WAL file size | SQLite -wal | > 100 MB |
| CPU usage | System stats | > 80% for 5 min |
| RAM usage | System stats | > 90% |
| Disk usage | System stats | > 90% |
| RajAPI sync failures | Heartbeat logs | 5 consecutive failures |

### 8.2 Alert Channels

- **Current:** In-app toast + SystemLog entries
- **Phase 2:** Email alerts to admin
- **Phase 5:** SMS + push notification

---

## 9. Key Technical Decisions for Next Sprint

Based on current state, the next sprint should focus on:

1. **HTTPS on Pi** (0.1) — blocks all other security work
2. **CPCB path traversal fix** (0.4) — regulatory data integrity
3. **Token revocation** (0.5) — basic auth hygiene before JWT replacement
4. **Test expansion** — CPCB conversion + auth tests before touching either module
5. **CI setup** — catch regressions from first 4 items

Estimated: **2 weeks** for a single developer.
