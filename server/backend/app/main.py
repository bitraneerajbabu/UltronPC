from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
import os
from app.core.config import settings
from app.db.database import engine, Base
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Import models so they are registered with Base.metadata before create_all
from app.models.core import IndustrySite, Device, Parameter, TelemetryData, Broadcast

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
        existing_cols = {c["name"] for c in inspector.get_columns("industry_sites")}
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

_run_auto_migrations()

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
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post(f"{settings.API_V1_STR}/auth/login")
async def login(payload: dict):
    if payload.get("password") == settings.ADMIN_KEY:
        return {"success": True}
    return JSONResponse({"success": False, "detail": "Invalid credentials"}, status_code=401)


from app.api.endpoints import sync, sites, downloads, tgpcb_sync, broadcasts, commands

app.include_router(sync.router, prefix=f"{settings.API_V1_STR}/sync", tags=["sync"])
app.include_router(tgpcb_sync.router, prefix=f"{settings.API_V1_STR}/tgpcb", tags=["tgpcb-sync"])
app.include_router(sites.router, prefix=f"{settings.API_V1_STR}/sites", tags=["sites"])
app.include_router(downloads.router, prefix=f"{settings.API_V1_STR}/downloads", tags=["downloads"])
app.include_router(broadcasts.router, prefix=f"{settings.API_V1_STR}/broadcasts", tags=["broadcasts"])
app.include_router(commands.router, prefix=f"{settings.API_V1_STR}/commands", tags=["commands"])

@app.on_event("startup")
async def startup_mqtt():
    from app.services.mqtt_publisher import start_mqtt_client
    await start_mqtt_client()

# Serve frontend build if it exists
frontend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist"))
if os.path.exists(frontend_path):
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_path, "assets")), name="assets")
    
    @app.get("/")
    async def serve_frontend_root():
        return FileResponse(os.path.join(frontend_path, "index.html"))
        
    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        # Allow API requests to pass through (this catch-all must be defined AFTER API routers)
        if full_path.startswith("api/"):
            return JSONResponse({"detail": "Not Found"}, status_code=404)
            
        file_path = os.path.join(frontend_path, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(frontend_path, "index.html"))

# To run locally:
# uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
