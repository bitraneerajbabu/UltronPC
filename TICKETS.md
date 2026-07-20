# UltrON — Features & Issues Ticket List

**Version:** 1.0  
**Date:** 2026-07-20  
**Status:** Active

---

## Legend

| Prefix | Area |
|--------|------|
| `SEC-` | Security |
| `BUG-` | Bug fix |
| `FEAT-` | Feature / enhancement |
| `INFRA-` | Infrastructure / ops |
| `DOC-` | Documentation |
| `UX-` | Frontend / UI |

---

## P0 — Critical (Fix Immediately)

| ID | Title | Area | Status |
|----|-------|------|--------|
| SEC-001 | HTTPS on Pi origin (cloudflared → uvicorn) | Infra | **Open** |
| SEC-002 | CPCB file path traversal — validate export_path under allowed dir | Backend | **Open** |
| BUG-001 | Device key login returns success even when parent site inactive (`server/main.py:349`) | Backend | **Open** |
| SEC-003 | PostgreSQL exposed to LAN (port 5432) — bind to 127.0.0.1 | Infra | **Open** |

## P1 — High

| ID | Title | Area | Status |
|----|-------|------|--------|
| SEC-004 | Static API keys stored plaintext in PostgreSQL — migrate to JWT | Backend | **Open** |
| SEC-005 | `.env` world-readable on Pi — chmod 600 | Infra | **Open** |
| SEC-006 | Hardcoded encryption fallback key in client `config_crypt.py` | Backend | **Open** |
| SEC-007 | API keys accepted in URL query params — move to header-only | Backend | **Open** |
| SEC-008 | API keys echoed in response bodies — strip from responses | Backend | **Open** |
| BUG-002 | `security_service.py` datetime mixing — `user.last_login` aware, rest naive | Backend | **Open** |
| BUG-003 | `server_push.py` SPCB failure silently caught — retry queue never populated | Backend | **Open** |
| BUG-004 | `monitor_heartbeats_loop` uses sync Session inside asyncio — blocks event loop | Backend | **Open** |
| FEAT-001 | Token revocation (server-side blacklist on logout) | Backend | **Open** |
| FEAT-002 | Database migration versioning (Alembic or version table) | Infra | **Open** |

## P2 — Medium

| ID | Title | Area | Status |
|----|-------|------|--------|
| SEC-009 | JWT blacklist on server — migrate from `ACCESS_TOKEN_EXPIRE_MINUTES=1440` to refresh tokens | Backend | **Done (client only)** |
| SEC-010 | Rate limit & lockout — RajAPI server | Backend | **Done** |
| SEC-011 | User enumeration fix — uniform error responses | Backend | **Done** |
| SEC-012 | bcrypt admin password hashing — RajAPI server | Backend | **Done** |
| FEAT-003 | Client frontend: NaN fix on negative number input (`DevicesScreen.tsx`) | Frontend | **Done** |
| FEAT-004 | Client frontend: `description` overwrite fix on param save | Frontend | **Done** |
| FEAT-005 | Client frontend: `===` vs `==` in AppContext for edit/delete param | Frontend | **Done** |
| FEAT-006 | Client: default password `Ultron123.0` | Backend | **Done** |
| FEAT-007 | Client: header cleanup — remove duplicate logo from header | Frontend | **Done** |
| FEAT-008 | RajAPI: admin key rotation `ultron@2024` → `ultron@2026` | Backend | **Done** |
| FEAT-009 | Client: refresh token rotation system | Backend | **Done** |
| FEAT-010 | Client: account lockout (5 attempts → 15 min) | Backend | **Done** |
| FEAT-011 | Client: rate limiter middleware | Backend | **Done** |
| BUG-005 | `rajapi_sync.py:86` f-string SQL — replace with parameterized query | Backend | **Open** |
| BUG-006 | `spcb_sync.py` — consistent 403 responses | Backend | **Done** |
| UX-001 | Login screen — add lockout countdown timer display | Frontend | **Open** |
| UX-002 | Login screen — add rate limit "try again in 60s" message | Frontend | **Open** |
| UX-003 | Password change prompt on first login / admin-enforced reset | Frontend | **Open** |

## P3 — Low

| ID | Title | Area | Status |
|----|-------|------|--------|
| INFRA-001 | `_recover_config` code cleanup — reduce redundant `except Exception` blocks | Backend | **Open** |
| INFRA-002 | Client `config.py` — split env loading from Settings class | Backend | **Open** |
| DOC-001 | TRD: update hardening priorities with completed items | Docs | **Done** |
| DOC-002 | SECURITY.md: add RajAPI server security section | Docs | **Done** |
| DOC-003 | PRD: update security findings with recent fixes | Docs | **Done** |
| FEAT-012 | Mobile app (read-only monitoring) | Mobile | **Future** |
| FEAT-013 | Email/SMS alerting for critical alarms | Backend | **Future** |
| FEAT-014 | MQTT bridge for IoT ecosystem compatibility | Backend | **Future** |
| FEAT-015 | AI/ML anomaly detection on historical patterns | Backend | **Future** |

---

## Sprint Backlog — Current

| Sprint | Focus | Tickets |
|--------|-------|---------|
| 2026-07 (Done) | RajAPI security hardening | SEC-010, SEC-011, SEC-012, BUG-006, FEAT-005, FEAT-006, FEAT-007, FEAT-008, FEAT-009, FEAT-010, FEAT-011 |
| 2026-07 (Active) | Remaining security gaps | SEC-001, SEC-002, SEC-003, SEC-004, SEC-005, BUG-001 |
| Next | Code quality & docs | BUG-002, BUG-003, BUG-004, BUG-005, UX-001, UX-002, UX-003, INFRA-001 |

---

## Deployment Checklist

Pre-deploy checks for each release:

- [ ] `.env.bak` not in git
- [ ] No hardcoded secrets in source
- [ ] DB migrations auto-run on startup
- [ ] Rate limiter active on auth endpoints
- [ ] Lockout configured on login
- [ ] Admin password hashed (server: bcrypt, client: bcrypt)
- [ ] User enumeration — no distinct error codes leaking info
- [ ] CORS origins limited to known domains
- [ ] `server/main.py` device key login validates `is_active`
