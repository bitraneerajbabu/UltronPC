from fastapi import FastAPI, Request, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
import time
from collections import defaultdict
from app.core.config import settings
from app.db.database import engine, Base, get_db
from app.models.core import IndustrySite, Device
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Import models so they are registered with Base.metadata before create_all
from app.models.core import IndustrySite, Device, Parameter, TelemetryData, Broadcast, PendingCommand, Alarm, SoftwareVersion, OTADeployment

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

_run_auto_migrations()

# ─── Simple In-Memory Rate Limiter ─────────────────────────────────────────────
_login_attempts: dict[str, list[float]] = defaultdict(list)

def _check_login_rate_limit(ip: str) -> None:
    now = time.time()
    attempts = _login_attempts[ip]
    attempts[:] = [t for t in attempts if now - t < 60]
    if len(attempts) >= 5:
        raise HTTPException(status_code=429, detail="Too many login attempts. Try again in 60 seconds.")
    attempts.append(now)


class LoginRequest(BaseModel):
    username: str
    password: str


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

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
    _check_login_rate_limit(request.client.host if request.client else "unknown")
    key = payload.password

    # Check admin key
    if key == settings.ADMIN_KEY:
        return {"success": True}

    # Check site-level key
    site = db.query(IndustrySite).filter(IndustrySite.api_key == key).first()
    if site:
        if not site.is_active:
            return JSONResponse({"success": False, "detail": "Site is inactive"}, status_code=403)
        return {"success": True}

    # Check device-level key
    device = db.query(Device).filter(Device.api_key == key).first()
    if device:
        return {"success": True}

    logger.warning(f"Failed login attempt from {request.client.host if request.client else 'unknown'}")
    return JSONResponse({"success": False, "detail": "Invalid credentials"}, status_code=401)


from app.api.endpoints import sync, sites, downloads, tgpcb_sync, broadcasts, commands, quality, alarms, cpcb, ota

app.include_router(sync.router, prefix=f"{settings.API_V1_STR}/sync", tags=["sync"])
app.include_router(tgpcb_sync.router, prefix=f"{settings.API_V1_STR}/tgpcb", tags=["tgpcb-sync"])
app.include_router(sites.router, prefix=f"{settings.API_V1_STR}/sites", tags=["sites"])
app.include_router(downloads.router, prefix=f"{settings.API_V1_STR}/downloads", tags=["downloads"])
app.include_router(broadcasts.router, prefix=f"{settings.API_V1_STR}/broadcasts", tags=["broadcasts"])
app.include_router(commands.router, prefix=f"{settings.API_V1_STR}/commands", tags=["commands"])
app.include_router(quality.router, prefix=f"{settings.API_V1_STR}/quality", tags=["quality"])
app.include_router(alarms.router, prefix=f"{settings.API_V1_STR}/alarms", tags=["alarms"])
app.include_router(cpcb.router, prefix=f"{settings.API_V1_STR}/cpcb", tags=["cpcb"])
app.include_router(ota.router, prefix=f"{settings.API_V1_STR}/ota", tags=["ota"])

# Background heartbeat monitor loop for server
import asyncio
from datetime import datetime, timezone, timedelta
from app.db.database import SessionLocal
from app.models.core import IndustrySite, Device

async def monitor_heartbeats_loop():
    logger.info("Server Heartbeat Monitor loop started")
    while True:
        try:
            db = SessionLocal()
            now = datetime.now(timezone.utc)
            cutoff = now - timedelta(seconds=90)
            
            # Find sites with last_sync older than 90 seconds
            # And update status of all their devices to offline
            # sites newer than 90 seconds, update to online
            sites = db.query(IndustrySite).all()
            for site in sites:
                is_online = site.last_sync is not None and site.last_sync.replace(tzinfo=timezone.utc) >= cutoff
                status_str = "online" if is_online else "offline"
                db.query(Device).filter(Device.site_id == site.id).update({"status": status_str})
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

