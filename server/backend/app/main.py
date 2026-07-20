from fastapi import FastAPI, Request, Depends, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
import time
import uuid
import traceback
from collections import defaultdict
from app.core.config import settings
from app.db.database import engine, Base, get_db
from app.models.core import IndustrySite, Device
import logging
import asyncio

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Import models so they are registered with Base.metadata before create_all
from app.models.core import IndustrySite, Device, Parameter, TelemetryData, Broadcast, PendingCommand, Alarm, SoftwareVersion, OTADeployment, Station

# Create database tables
Base.metadata.create_all(bind=engine)

# Auto-migrate: safely add any new columns that may not exist yet
def _run_auto_migrations():
    from sqlalchemy import text, inspect
    with engine.connect() as conn:
        inspector = inspect(engine)
        existing_cols = {c["name"] for c in inspector.get_columns("industry_sites")}
        if "last_sync" not in existing_cols:
            try:
                conn.execute(text("ALTER TABLE industry_sites ADD COLUMN last_sync TIMESTAMP"))
                conn.commit()
                logger.info("Auto-migration: added 'last_sync' column to industry_sites")
            except Exception as e:
                logger.warning(f"Auto-migration skipped: {e}")

        # Add performance indexes for latest-telemetry query (DISTINCT ON pattern)
        for idx_sql, idx_name in [
            (
                "CREATE INDEX IF NOT EXISTS ix_telemetry_site_ts "
                "ON telemetry_data (site_id, timestamp DESC)",
                "ix_telemetry_site_ts"
            ),
            (
                "CREATE INDEX IF NOT EXISTS ix_telemetry_param_ts "
                "ON telemetry_data (parameter_id, timestamp DESC)",
                "ix_telemetry_param_ts"
            ),
            (
                "CREATE INDEX IF NOT EXISTS ix_telemetry_site_param_ts "
                "ON telemetry_data (site_id, parameter_id, timestamp DESC)",
                "ix_telemetry_site_param_ts"
            ),
        ]:
            try:
                conn.execute(text(idx_sql))
                conn.commit()
                logger.info(f"Auto-migration: ensured index '{idx_name}'")
            except Exception as e:
                logger.warning(f"Index '{idx_name}' skipped: {e}")

        # Add lock fields & error tracking & version/notes to industry_sites if missing
        # (existing_cols already fetched above — indexes don't change columns)
        for col_name, col_def in [
            ("lock_status", "VARCHAR(50) DEFAULT 'unlocked'"),
            ("lock_reason", "TEXT"),
            ("lock_updated_at", "TIMESTAMP"),
            ("last_error", "TEXT"),
            ("last_error_at", "TIMESTAMP"),
            ("client_version", "VARCHAR(20)"),
            ("notes", "TEXT"),
        ]:
            if col_name not in existing_cols:
                try:
                    conn.execute(text(f"ALTER TABLE industry_sites ADD COLUMN {col_name} {col_def}"))
                    conn.commit()
                    logger.info(f"Auto-migration: added '{col_name}' to industry_sites")
                except Exception as e:
                    logger.warning(f"Auto-migration for '{col_name}' skipped: {e}")

        # Create broadcasts table if it doesn't exist
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS broadcasts (
                    id SERIAL PRIMARY KEY,
                    message TEXT NOT NULL,
                    message_type VARCHAR(50) DEFAULT 'info',
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT NOW(),
                    expires_at TIMESTAMP
                )
            """))
            conn.commit()
            logger.info("Auto-migration: ensured 'broadcasts' table")
        except Exception as e:
            logger.warning(f"Auto-migration for broadcasts table skipped: {e}")

        # Add broadcast targeting columns if missing
        try:
            bc_cols = {c["name"] for c in inspector.get_columns("broadcasts")}
            if "target_all" not in bc_cols:
                conn.execute(text("ALTER TABLE broadcasts ADD COLUMN target_all BOOLEAN DEFAULT TRUE"))
                conn.commit()
                logger.info("Auto-migration: added 'target_all' to broadcasts")
            if "target_site_id" not in bc_cols:
                conn.execute(text("ALTER TABLE broadcasts ADD COLUMN target_site_id INTEGER REFERENCES industry_sites(id) ON DELETE SET NULL"))
                conn.commit()
                logger.info("Auto-migration: added 'target_site_id' to broadcasts")
        except Exception as e:
            logger.warning(f"Auto-migration for broadcast columns skipped: {e}")

        # Add api_key column to devices table if missing
        try:
            dev_cols = {c["name"] for c in inspector.get_columns("devices")}
            if "api_key" not in dev_cols:
                conn.execute(text("ALTER TABLE devices ADD COLUMN api_key VARCHAR(255) UNIQUE"))
                conn.commit()
                logger.info("Auto-migration: added 'api_key' column to devices")
        except Exception as e:
            logger.warning(f"Auto-migration for devices.api_key skipped: {e}")

        # Create pending_commands table if not exists
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS pending_commands (
                    id SERIAL PRIMARY KEY,
                    site_id INTEGER REFERENCES industry_sites(id) ON DELETE SET NULL,
                    station_id VARCHAR(255) NOT NULL,
                    action VARCHAR(50) NOT NULL,
                    status VARCHAR(20) DEFAULT 'pending',
                    created_at TIMESTAMP DEFAULT NOW(),
                    delivered_at TIMESTAMP,
                    completed_at TIMESTAMP,
                    error TEXT
                )
            """))
            conn.commit()
            logger.info("Auto-migration: ensured 'pending_commands' table")
        except Exception as e:
            logger.warning(f"Auto-migration for pending_commands skipped: {e}")

        # Add quality count columns to industry_sites for quick dashboard stats
        try:
            existing_cols = {c["name"] for c in inspector.get_columns("industry_sites")}
            for col_name, col_def in [
                ("quality_u_count", "INTEGER DEFAULT 0"),
                ("quality_o_count", "INTEGER DEFAULT 0"),
                ("quality_e_count", "INTEGER DEFAULT 0"),
                ("quality_n_count", "INTEGER DEFAULT 0"),
            ]:
                if col_name not in existing_cols:
                    conn.execute(text(f"ALTER TABLE industry_sites ADD COLUMN {col_name} {col_def}"))
                    conn.commit()
                    logger.info(f"Auto-migration: added '{col_name}' to industry_sites")
        except Exception as e:
            logger.warning(f"Auto-migration for quality count columns skipped: {e}")

        # Create alarms table if not exists
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS alarms (
                    id SERIAL PRIMARY KEY,
                    site_id INTEGER REFERENCES industry_sites(id) ON DELETE CASCADE,
                    parameter_id INTEGER REFERENCES parameters(id) ON DELETE SET NULL,
                    value FLOAT,
                    quality VARCHAR(10),
                    message TEXT,
                    status VARCHAR(20) DEFAULT 'active',
                    created_at TIMESTAMP DEFAULT NOW(),
                    acknowledged_at TIMESTAMP
                )
            """))
            conn.commit()
            logger.info("Auto-migration: ensured 'alarms' table")
        except Exception as e:
            logger.warning(f"Auto-migration for alarms table skipped: {e}")

        # Create stations table if not exists
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS stations (
                    id SERIAL PRIMARY KEY,
                    site_id INTEGER NOT NULL REFERENCES industry_sites(id) ON DELETE CASCADE,
                    station_id VARCHAR(100) NOT NULL,
                    username VARCHAR(200) NOT NULL,
                    category VARCHAR(50) NOT NULL,
                    station_name VARCHAR(200) NOT NULL,
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT NOW()
                )
            """))
            conn.commit()
            logger.info("Auto-migration: ensured 'stations' table")
        except Exception as e:
            logger.warning(f"Auto-migration for stations table skipped: {e}")

_run_auto_migrations()

# ─── Rate Limiting & Account Lockout ──────────────────────────────────────────
_LOGIN_WINDOW = 60        # seconds
_LOGIN_MAX_ATTEMPTS = 5    # per IP per window
_KEY_LOCK_THRESHOLD = 10   # failed attempts before key lockout
_KEY_LOCK_DURATION = 900   # seconds (15 min)
_API_RATE_WINDOW = 60      # seconds
_API_RATE_MAX = 200        # requests per window per IP
_DATA_INGEST_PREFIXES = ("/api/v1/sync", "/api/v1/heartbeat", "/api/v1/spcb")

# IP → [timestamps] for login endpoint
_login_attempts: dict[str, list[float]] = defaultdict(list)
# Key value → [timestamps] for distributed brute-force detection
_key_attempts: dict[str, list[float]] = defaultdict(list)
# Key value → locked_until timestamp
_key_lockouts: dict[str, float] = {}
# IP → [timestamps] for general API rate limiting
_api_requests: dict[str, list[float]] = defaultdict(list)


def _check_login_rate_limit(ip: str, key: str) -> None:
    now = time.time()

    # Per-key lockout check (catches distributed brute-force on same key)
    if key in _key_lockouts:
        if now < _key_lockouts[key]:
            raise HTTPException(
                status_code=429,
                detail="Too many login attempts. Try again later."
            )
        del _key_lockouts[key]  # lock expired

    # Per-IP rate limit (catches single-source brute-force)
    ip_attempts = _login_attempts[ip]
    ip_attempts[:] = [t for t in ip_attempts if now - t < _LOGIN_WINDOW]
    if len(ip_attempts) >= _LOGIN_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=429,
            detail="Too many login attempts. Try again in 60 seconds."
        )
    ip_attempts.append(now)
    ip_attempts[:] = ip_attempts[-(_LOGIN_MAX_ATTEMPTS + 5):]


def _record_failed_login(ip: str, key: str) -> None:
    """Track failed attempts per key and lock it after threshold."""
    now = time.time()
    key_attempts = _key_attempts[key]
    key_attempts[:] = [t for t in key_attempts if now - t < _KEY_LOCK_DURATION]
    key_attempts.append(now)
    if len(key_attempts) >= _KEY_LOCK_THRESHOLD:
        _key_lockouts[key] = now + _KEY_LOCK_DURATION
        logger.warning(
            "Key locked out: '%s...' (%d failures in %ds)",
            key[:12], _KEY_LOCK_THRESHOLD, _KEY_LOCK_DURATION
        )


def _clear_key_lockout(key: str) -> None:
    """Clear lockout state on successful login."""
    _key_lockouts.pop(key, None)
    _key_attempts.pop(key, None)


async def _api_rate_limit_middleware(request: Request, call_next):
    """Per-IP rate limit for all API endpoints except data ingestion."""
    path = request.url.path
    if path.startswith(settings.API_V1_STR) and not path.startswith(_DATA_INGEST_PREFIXES):
        ip = request.client.host if request.client else "unknown"
        now = time.time()
        reqs = _api_requests[ip]
        reqs[:] = [t for t in reqs if now - t < _API_RATE_WINDOW]
        if len(reqs) >= _API_RATE_MAX:
            logger.warning("API rate limit hit: ip=%s path=%s", ip, path[:60])
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Try again later."}
            )
        reqs.append(now)
        reqs[:] = reqs[-250:]
    return await call_next(request)


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=1, max_length=256)


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# ─── Global Exception Handler ───────────────────────────────────────────────
# Catches all unhandled exceptions, returns consistent JSON with request_id.
# Never leaks stack traces, paths, or internal state to the client.

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    request_id = str(uuid.uuid4())
    logger.error(
        "Unhandled exception: request_id=%s path=%s method=%s",
        request_id, request.url.path, request.method,
        exc_info=True
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error", "request_id": request_id},
        headers={"X-Request-Id": request_id},
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Return HTTPException as-is with consistent JSON shape."""
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )


# ─── Request ID Middleware (outermost — adds X-Request-Id to every response) ──
@app.middleware("http")
async def add_request_id(request: Request, call_next):
    request_id = request.headers.get("X-Request-Id", str(uuid.uuid4()))
    response = await call_next(request)
    response.headers["X-Request-Id"] = request_id
    return response


# Apply API rate limiter
app.middleware("http")(_api_rate_limit_middleware)

# Set all CORS enabled origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://rajapi.com",
        "http://rajapi.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post(f"{settings.API_V1_STR}/auth/login")
async def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    import bcrypt
    from app.core.config import ADMIN_PASSWORD_HASH

    ip = request.client.host if request.client else "unknown"
    key = payload.password

    # IP rate limit + key lockout check
    _check_login_rate_limit(ip, key)

    from app.api.deps import find_site_by_key, find_device_by_key

    # Check admin login (username + hashed password)
    if payload.username == settings.ADMIN_USERNAME and bcrypt.checkpw(
        payload.password.encode("utf-8"), ADMIN_PASSWORD_HASH.encode("utf-8")
    ):
        _clear_key_lockout(key)
        return {"success": True}

    # Check admin key (backward compat for X-Admin-Key header users)
    if key == settings.ADMIN_KEY:
        _clear_key_lockout(key)
        return {"success": True}

    # Check site-level key
    site = find_site_by_key(db, key)
    if site:
        if not site.is_active:
            logger.warning("Login attempt for inactive site from %s", ip)
            _record_failed_login(ip, key)
            return JSONResponse({"success": False, "detail": "Invalid credentials"}, status_code=401)
        _clear_key_lockout(key)
        return {"success": True}

    # Check device-level key (validate parent site is active)
    device = find_device_by_key(db, key)
    if device:
        if not device.site or not device.site.is_active:
            logger.warning("Login attempt for inactive site device from %s", ip)
            _record_failed_login(ip, key)
            return JSONResponse({"success": False, "detail": "Invalid credentials"}, status_code=401)
        _clear_key_lockout(key)
        return {"success": True}

    logger.warning("Failed login attempt from %s", ip)
    _record_failed_login(ip, key)
    return JSONResponse({"success": False, "detail": "Invalid credentials"}, status_code=401)


from app.api.endpoints import sync, sites, downloads, spcb_sync, broadcasts, commands, quality, alarms, cpcb, ota, stations

app.include_router(sync.router, prefix=f"{settings.API_V1_STR}/sync", tags=["sync"])
app.include_router(sync.heartbeat_router, prefix=f"{settings.API_V1_STR}/heartbeat", tags=["heartbeat"])
app.include_router(spcb_sync.router, prefix=f"{settings.API_V1_STR}/spcb", tags=["spcb-sync"])
app.include_router(sites.router, prefix=f"{settings.API_V1_STR}/sites", tags=["sites"])
app.include_router(downloads.router, prefix=f"{settings.API_V1_STR}/downloads", tags=["downloads"])
app.include_router(broadcasts.router, prefix=f"{settings.API_V1_STR}/broadcasts", tags=["broadcasts"])
app.include_router(commands.router, prefix=f"{settings.API_V1_STR}/commands", tags=["commands"])
app.include_router(quality.router, prefix=f"{settings.API_V1_STR}/quality", tags=["quality"])
app.include_router(alarms.router, prefix=f"{settings.API_V1_STR}/alarms", tags=["alarms"])
app.include_router(cpcb.router, prefix=f"{settings.API_V1_STR}/cpcb", tags=["cpcb"])
app.include_router(ota.router, prefix=f"{settings.API_V1_STR}/ota", tags=["ota"])
app.include_router(stations.router, prefix=f"{settings.API_V1_STR}/stations", tags=["stations"])

# Background heartbeat monitor loop for server
from datetime import datetime, timezone, timedelta
from app.db.database import SessionLocal
from app.models.core import IndustrySite, Device

_prev_online: set[int] = set()

async def monitor_heartbeats_loop():
    global _prev_online
    logger.info("Server Heartbeat Monitor loop started")
    while True:
        try:
            db = SessionLocal()
            now = datetime.now(timezone.utc)
            cutoff = now - timedelta(seconds=90)

            sites = db.query(IndustrySite).all()
            new_online: set[int] = set()
            for site in sites:
                is_online = site.last_sync is not None and site.last_sync.replace(tzinfo=timezone.utc) >= cutoff
                if is_online:
                    new_online.add(site.id)
                # Only UPDATE when status actually changed since last check
                was_online = site.id in _prev_online
                if is_online != was_online:
                    status_str = "online" if is_online else "offline"
                    db.query(Device).filter(Device.site_id == site.id).update({"status": status_str})
            _prev_online = new_online
            db.commit()
            db.close()
        except Exception as e:
            logger.error(f"Error in monitor_heartbeats_loop: {e}")
        await asyncio.sleep(60)

@app.on_event("startup")
async def start_heartbeat_monitor():
    asyncio.create_task(monitor_heartbeats_loop())

# To run locally:
# uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

