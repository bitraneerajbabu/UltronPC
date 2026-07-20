# UltrON Security Architecture

## Overview

UltrON's security model follows a **defense-in-depth** approach with layered controls at the network, transport, application, and data layers. This document describes the enterprise-grade authentication, secrets management, and authorization system.

---

## Enterprise Secrets Management

### Secrets Vault

All application secrets are managed through a centralized `SecretsVault` singleton (`app/core/secrets_vault.py`). This vault provides:

- **Multi-source loading**: Secrets are loaded from `.env.enc` (encrypted) → `.env` → environment variables → fallback files, in priority order
- **Fail-fast validation**: Required secrets are checked at startup
- **In-memory caching**: Secrets are loaded once and cached for the lifetime of the process
- **Access audit trail**: Every secret retrieval is logged (key name only, never the value)
- **Runtime rotation**: Secrets can be rotated without restarting the server
- **Masked output**: Debug/status endpoints show only masked values (`xxxx****xxxx`)

### Required Secrets

| Secret | Config Key | Description |
|--------|-----------|-------------|
| Admin password | `ADMIN_PASSWORD` | Login password for the Master admin account |
| JWT signing key | `SECRET_KEY` | Symmetric key for signing all JWT access tokens |
| Gateway ID | `GATEWAY_ID` | UltrON gateway identifier for RajAPI central sync |
| Device secret | `DEVICE_SECRET` | Shared secret for RajAPI device authentication |

### Optional Secrets

| Secret | Config Key | Description |
|--------|-----------|-------------|
| Legacy API key | `RAJAPI_API_KEY` | Legacy RajAPI API key (backward compatibility) |
| LED auth token | `LED_AUTH_TOKEN` | Static token for LED board authentication |
| SMTP credentials | `SMTP_USER` / `SMTP_PASSWORD` | Email alert credentials |
| DB password | `DB_PASSWORD` | PostgreSQL password |

### How Secrets Are Loaded

```
1. .env.enc (Fernet AES-128-CBC encrypted)
2. .env (plaintext, development only)
3. os.environ (environment variables override all)
4. secret.key (JWT key fallback file)
```

### Secret Rotation

```python
from app.core.secrets_vault import vault

# Rotate at runtime (immediate, all new requests use new value)
vault.rotate("ADMIN_PASSWORD", "new-strong-password-2024!")

# Persist to .env for next restart
vault.rotate("SECRET_KEY", "new-key-value", persist=True)

# Reload all secrets from sources
vault.reload()
```

### Scanner / Validation

Run secret validation at startup:

```python
from app.core.secrets_vault import validate_secrets_on_startup
validate_secrets_on_startup()  # exits with code 1 if required secrets missing
```

Check vault status via API (admin only):

```bash
GET /api/v1/security/vault/status
```

---

## Rate Limiting

UltrON uses a sliding-window in-memory rate limiter (`app/core/rate_limiter.py`) with per-IP and per-user buckets.

### Default Limits

| Route | Requests | Window |
|-------|----------|--------|
| `/api/v1/auth/login` | 5 | 60s |
| `/api/v1/auth/refresh` | 10 | 60s |
| `/api/v1/auth/setup-override` | 3 | 300s |
| `/api/v1/users/` | 30 | 60s |
| `/api/v1/led` | 60 | 60s |
| `/api/v1/reports/` | 10 | 60s |
| `/ws/live` | 20 | 60s |
| `/api/v1/led` | 60 | 60s |

### 429 Response

All rate-limited endpoints return:

```json
{
  "detail": "Too many requests. Please slow down."
}
```

With `Retry-After: 60` header.

---

## Global Error Handling

All unhandled exceptions are caught by `GlobalExceptionMiddleware` (`app/core/error_handler.py`).

### Never Exposed

- Stack traces
- Filesystem paths
- SQL queries or DB errors
- Secret values
- Internal IP addresses
- Framework versions
- Driver error messages

### Response Format

```json
{
  "detail": "An unexpected error occurred. Please try again later.",
  "request_id": "uuid-string"
}
```

In `DEBUG=True` mode, the actual exception type and message are included.

### Request Tracking

Every request gets:
- `X-Request-Id`: Unique request identifier
- `X-Correlation-Id`: Correlation ID for distributed tracing
- `X-Response-Time-Ms`: Server processing time in milliseconds

---

## Authentication

### Password Policy

| Rule | Default | Config Key |
|------|---------|------------|
| Minimum length | 8 | `PASSWORD_MIN_LENGTH` |
| Require uppercase | Yes | `PASSWORD_REQUIRE_UPPERCASE` |
| Require lowercase | Yes | `PASSWORD_REQUIRE_LOWERCASE` |
| Require digit | Yes | `PASSWORD_REQUIRE_DIGIT` |
| Require special char | Yes | `PASSWORD_REQUIRE_SPECIAL` |
| History count (no reuse) | 5 | `PASSWORD_HISTORY_COUNT` |

Password validation runs on:
- User creation (`POST /api/v1/users/`)
- Password change (`POST /api/v1/auth/change-password`)
- Admin-initiated password updates (`PATCH /api/v1/users/{id}`)

### JWT Access Tokens

- Algorithm: HS256
- Issued at login and token refresh
- Each token carries a unique `jti` (JWT ID) for blacklisting
- Default expiry: configurable via `ACCESS_TOKEN_EXPIRE_MINUTES`
- Payload: `{sub: username, role: role, jti: unique_id, exp: timestamp}`

### Refresh Tokens

- Cryptographically random (96 bytes, URL-safe base64)
- Stored as SHA-256 hash in the `refresh_tokens` table
- Configurable expiry: `REFRESH_TOKEN_EXPIRE_DAYS` (default: 7)
- **Rotation**: every refresh invalidates the previous token and issues a new pair
- Revoked on logout, password change, or explicit session revocation

### Token Refresh Flow

```
1. Client sends refresh_token to POST /api/v1/auth/refresh
2. Server validates token hash against DB (not revoked, not expired)
3. Old refresh token is revoked (rotation)
4. New access_token + new refresh_token are issued
5. Client replaces stored tokens
```

### Account Lockout

| Setting | Default | Config Key |
|---------|---------|------------|
| Max failed attempts | 5 | `MAX_FAILED_LOGIN_ATTEMPTS` |
| Lockout duration | 15 min | `ACCOUNT_LOCKOUT_MINUTES` |

- Login attempts are tracked per-username in `login_attempts` table
- After threshold, account is locked with a `locked_until` timestamp
- Expired locks auto-clear on next login attempt
- Successful login resets the counter
- Returns HTTP 423 during lockout with retry time estimate

---

## Authorization (RBAC)

### Roles

| Role | Privileges |
|------|-----------|
| `admin` | Full access to all endpoints, user management, security events |
| `client` | Read telemetry, manage own stations/devices, limited settings |

Authorization is enforced at the endpoint level via FastAPI dependencies:

- `get_current_user` — validates JWT, checks active status, blacklist
- `require_admin` — wraps `get_current_user`, additionally checks `role == "admin"`
- `optional_current_user` — returns `None` instead of 401 for public endpoints

### RBAC Audit

Every authorization decision is logged:
- Successful/failed admin access attempts
- User creation, update, deletion
- Role changes
- Security event log is queryable via `GET /api/v1/auth/events`

---

## Token Blacklist (JWT Revocation)

| Setting | Default | Config Key |
|---------|---------|------------|
| Blacklist enabled | True | `JWT_BLACKLIST_ENABLED` |

When enabled:
- Logout adds the JWT's `jti` to the `revoked_tokens` table
- Password change revokes all tokens for the user
- Every authenticated request checks the blacklist
- Expired entries auto-cleanup on server restart

---

## Session Management

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/auth/sessions` | List active sessions for current user |
| `POST` | `/api/v1/auth/sessions/{id}/revoke` | Revoke a specific session |
| `POST` | `/api/v1/auth/logout` | Revoke current session and blacklist JWT |
| `POST` | `/api/v1/auth/logout-all` | Revoke all sessions, force re-login |

### Session Timeout

- Optional: `SESSION_TIMEOUT_MINUTES` (default: 0 = disabled)
- Checked server-side by comparing `last_login` against current time
- When enabled, idle sessions beyond timeout are rejected

---

## HTTP Security Headers

### Content-Security-Policy (CSP)

```
default-src 'self';
script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline';
img-src 'self' data:;
font-src 'self' data:;
connect-src 'self' ws:;
frame-ancestors 'none';
form-action 'self'
```

### Strict-Transport-Security (HSTS)

```
max-age=31536000; includeSubDomains
```

### Other Headers

| Header | Value | Purpose |
|--------|-------|---------|
| `X-Content-Type-Options` | `nosniff` | Prevent MIME sniffing |
| `X-Frame-Options` | `DENY` | Prevent clickjacking |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Control referrer leakage |
| `Permissions-Policy` | `camera=(), microphone=(), ...` | Restrict browser features |

### Request Size Limiting

- Default limit: 10 MB
- Returns HTTP 413 if `Content-Length` exceeds threshold
- Configured via `RequestSizeLimitMiddleware`

---

## WebSocket Security

- Authentication via JWT in `token` query parameter
- Blacklist check on connect (revoked tokens rejected)
- Token is never logged in server logs
- Per-message auth is not enforced to maintain performance; all WS operations are read-only (live data push)
- Connection closed with code 4001 on invalid/revoked token

---

## Security Event Logging

### Dual Logging

1. **File audit log** (`logs/audit.log`) — rotating file handler (5 MB, 10 backups)
2. **Database audit trail** (`security_events` table) — queryable via API

### Events Tracked

| Event Type | Severity | Description |
|-----------|----------|-------------|
| `login_success` | info | Successful authentication |
| `token_refreshed` | info | Refresh token used |
| `logout` | info | User initiated logout |
| `logout_all` | info | All sessions terminated |
| `password_changed` | info | Password updated |
| `session_revoked` | info | Specific session killed |
| `account_locked` | warning | Account locked after N failures |
| `failed_login` | warning | Failed authentication attempt |

---

## Security Configuration

All security settings are in `.env` or configurable at runtime:

```ini
# Token Lifetimes
ACCESS_TOKEN_EXPIRE_MINUTES=5256000
REFRESH_TOKEN_EXPIRE_DAYS=7

# Account Lockout
MAX_FAILED_LOGIN_ATTEMPTS=5
ACCOUNT_LOCKOUT_MINUTES=15

# Password Policy
PASSWORD_MIN_LENGTH=8
PASSWORD_REQUIRE_UPPERCASE=True
PASSWORD_REQUIRE_LOWERCASE=True
PASSWORD_REQUIRE_DIGIT=True
PASSWORD_REQUIRE_SPECIAL=True
PASSWORD_HISTORY_COUNT=5

# Session
SESSION_TIMEOUT_MINUTES=0

# JWT Blacklist
JWT_BLACKLIST_ENABLED=True
```

---

## API Reference — Auth Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/v1/auth/login` | None | Login (with lockout protection) |
| `POST` | `/api/v1/auth/refresh` | None | Refresh access token (rotation) |
| `POST` | `/api/v1/auth/logout` | JWT | Logout (revoke session + blacklist) |
| `POST` | `/api/v1/auth/logout-all` | JWT | Logout all sessions |
| `POST` | `/api/v1/auth/change-password` | JWT | Change password (with history check) |
| `GET` | `/api/v1/auth/me` | JWT | Current user profile |
| `GET` | `/api/v1/auth/sessions` | JWT | List active sessions |
| `POST` | `/api/v1/auth/sessions/{id}/revoke` | JWT | Revoke specific session |
| `GET` | `/api/v1/auth/events` | Admin | Security event log |
| `POST` | `/api/v1/auth/setup-override` | None | First-time setup override |

---

---

## RajAPI Server Security (Central Server)

### Authentication Model

The RajAPI server supports dual auth:

| Auth Method | Mechanism | Use Case |
|-------------|-----------|----------|
| **Admin username/password** | bcrypt `checkpw` against hash computed at config load | Admin dashboard login |
| **Static API key (legacy)** | `X-API-Key` header, DB lookup | Site/device sync, backward compatibility |

### Rate Limiting (Server-side)

| Limit | Scope | Window | Action |
|-------|-------|--------|--------|
| Login attempts | Per-IP | 5 req / 60s | HTTP 429 + clear old entries |
| Key lockout | Per-key | 10 failures → 15min lock | In-memory lockout, auto-clear |
| API rate limit | Per-IP | 200 req / 60s | HTTP 429 exempts sync/heartbeat/spcb |

Implemented via in-memory sliding-window counters in `main.py`.

### User Enumeration Protection

All failed auth paths return identical generic error:

| Key Type | Failure Response |
|----------|-----------------|
| Invalid key | `401 {"detail": "Invalid credentials"}` |
| Inactive site key | `401 {"detail": "Invalid credentials"}` (not 403) |
| Expired AMC | `403 {"detail": "Could not validate API Key"}` (generic) |

### Password Security

- Admin password hashed at config load via `bcrypt.hashpw(settings.ADMIN_PASSWORD, bcrypt.gensalt())`
- Login uses constant-time `bcrypt.checkpw` against the in-memory hash
- On first successful login, the hash is persisted to DB for restart survival
- Old `ADMIN_KEY` env var retained for backward compatibility
- Default credentials: `admin` / `Ultron@2026` (change immediately)

### Remaining Gaps

See TRD.md §4.3 for full list. Key open items:
- No HTTPS between cloudflared → uvicorn (HTTP origin)
- Static API keys stored plaintext in PostgreSQL
- CPCB export path traversal (input validation exists, blocking char set needs audit)
- `.env` on Pi world-readable (should be chmod 600)

---

## Upgrade Notes

### v1.0.71 → v1.0.72 (RajAPI Security Hardening)

**Changes:**
- RajAPI server: bcrypt admin username/password login added
- RajAPI server: per-IP login rate limit (5 req/60s) + per-key lockout (10 failures → 15min)
- RajAPI server: API rate limiter middleware (200 req/min)
- RajAPI server: user enumeration fixed — uniform 401/403 responses
- Client: default admin password changed to `Ultron123.0`
- Client backend: user enumeration fixed (`auth.py` 423 vs 403 consolidation)
- `spcb_sync.py`: consistent 403 responses for all auth failures

**Backward Compatibility:**
- Old `ADMIN_KEY` env var still works on server for existing scripts
- Client `.env` file fully compatible with new defaults
- No DB migration required for server changes

### v1.0.70 → v1.0.71 (Refresh Token System)

**Backward Compatibility:**
- All existing JWT tokens remain valid until their natural expiry
- The `/login` endpoint now returns an additional `refresh_token` field
- Existing frontends that ignore unknown fields continue to work
- Old `.env` files are fully compatible (new settings use safe defaults)

**Database Migration:**
New tables are created automatically on startup:
- `refresh_tokens`
- `revoked_tokens`
- `password_history`
- `login_attempts`
- `security_events`

New columns added to `users` table:
- `failed_login_attempts` (INTEGER, default 0)
- `locked_until` (DATETIME, nullable)
- `password_changed_at` (DATETIME, nullable)
- `require_password_change` (BOOLEAN, default FALSE)

**Frontend Migration:**
The frontend should be updated to:
1. Store `refresh_token` from login response
2. Call `POST /api/v1/auth/refresh` when access token expires
3. Use `POST /api/v1/auth/change-password` for password changes
4. Display session management UI from `GET /api/v1/auth/sessions`

---

## Security Best Practices

1. **HTTPS**: Always deploy behind a reverse proxy with HTTPS enabled
2. **Secret Key**: Rotate `SECRET_KEY` periodically (invalidates all JWTs)
3. **Least Privilege**: Create client accounts with minimal required permissions
4. **Monitor**: Regularly review `GET /api/v1/auth/events` for suspicious activity
5. **Password Rotation**: Enforce periodic password changes via policy
6. **Session Cleanup**: Old refresh tokens auto-expire; blacklist entries auto-clean
