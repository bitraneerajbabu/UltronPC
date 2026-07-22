"""
UltrON — Database Engine
Supports:
  • SQLite (aiosqlite) embedded database
"""

from sqlalchemy import event, text
import aiosqlite
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.config import settings
from app.core.logger import get_logger

log = get_logger("ultron.database")

# ─── Connection Pool ──────────────────────────────────────────────────────────
engine_kwargs: dict = {
    "echo": False,  # Never log SQL statements (performance + security)
}

if settings.DB_TYPE == "postgresql":
    engine_kwargs["pool_size"] = 10
    engine_kwargs["max_overflow"] = 20

engine = create_async_engine(settings.DATABASE_URL, **engine_kwargs)


if settings.DB_TYPE == "sqlite":
    @event.listens_for(engine.sync_engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL;")
        cursor.execute("PRAGMA synchronous=NORMAL;")
        cursor.execute("PRAGMA busy_timeout=10000;")  # 10 seconds timeout
        cursor.execute("PRAGMA foreign_keys=ON;")
        cursor.close()




AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


# ─── Base Model ───────────────────────────────────────────────────────────────
class Base(DeclarativeBase):
    pass


# ─── Dependency ───────────────────────────────────────────────────────────────
async def get_db() -> AsyncSession:
    """FastAPI dependency — yields an async DB session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# ─── Init DB ──────────────────────────────────────────────────────────────────
async def init_db():
    """
    Create all tables, and ensure schema migrations are applied.
    """
    # Import all models so SQLAlchemy sees them
    from app.models import station, device, parameter, telemetry, user, server_config, cpcb, calibration, plant_settings, security, rajapi, system_state  # noqa: F401
    from sqlalchemy import text

    log.info("Initialising database tables …")
    async with engine.begin() as conn:
        # 1. Create standard tables
        await conn.run_sync(Base.metadata.create_all)

        # 2. Enable TimescaleDB hypertables
        try:
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;"))
            await conn.execute(text("SELECT create_hypertable('historical_data', 'timestamp', if_not_exists => TRUE);"))
            await conn.execute(text("SELECT create_hypertable('averages', 'timestamp', if_not_exists => TRUE);"))
            log.info("TimescaleDB extension loaded and hypertables initialized.")
        except Exception as ts_err:
            log.info(f"TimescaleDB extension check skipped or failed: {ts_err}")

        # 2. One-time column migrations (gated — skip if sentinel column exists)
        def get_columns(sync_conn, table_name):
            from sqlalchemy import inspect
            inspector = inspect(sync_conn)
            try:
                return {col["name"] for col in inspector.get_columns(table_name)}
            except Exception:
                return set()

        needs_migration = True
        try:
            existing_cpcb = await conn.run_sync(get_columns, "cpcb_station_config")
            if "retention_count" in existing_cpcb:
                needs_migration = False
        except Exception:
            pass

        if needs_migration:
            log.info("Applying column migrations …")
            for table, cols in {
                "server_config": [
                    ("protocol", "VARCHAR(20) DEFAULT 'tspcb'"),
                    ("cpcb_file_path", "VARCHAR(500)"),
                    ("is_cpcb_active", "BOOLEAN DEFAULT TRUE"),
                    ("led_station_name", "VARCHAR(100)"),
                    ("live_url", "VARCHAR(500)"),
                    ("delay_url", "VARCHAR(500)"),
                ],
                "server_parameter_mapping": [
                    ("cpcb_station_name", "VARCHAR(100)"),
                    ("cpcb_parameter", "VARCHAR(100)"),
                    ("led_channel_name", "VARCHAR(100)"),
                    ("led_unit", "VARCHAR(50)"),
                    ("api_id", "VARCHAR(100)"),
                    ("api_name", "VARCHAR(100)"),
                    ("api_password", "VARCHAR(100)"),
                    ("api_vname", "VARCHAR(100)"),
                    ("api_unit", "VARCHAR(50)"),
                ],
                "devices": [
                    ("csv_folder", "VARCHAR(500)"),
                    ("csv_filename_pattern", "VARCHAR(200)"),
                    ("csv_delimiter", "VARCHAR(5) DEFAULT ','"),
                    ("csv_timestamp_col", "INTEGER"),
                    ("request_hex", "VARCHAR(500)"),
                    ("response_delimiter", "VARCHAR(20) DEFAULT 'newline'"),
                ],
                "parameters": [
                    ("parse_method", "VARCHAR(30) DEFAULT 'csv_col'"),
                    ("parse_config", "TEXT"),
                    ("host", "VARCHAR(100)"),
                    ("port", "INTEGER"),
                    ("serial_port", "VARCHAR(50)"),
                    ("baud_rate", "INTEGER"),
                    ("data_bits", "INTEGER"),
                    ("parity", "VARCHAR(5)"),
                    ("stop_bits", "INTEGER"),
                    ("slave_id", "INTEGER"),
                ],
                "stations": [
                    ("last_seen", "DATETIME"),
                    ("last_error", "TEXT"),
                ],
                "users": [
                    ("created_by", "VARCHAR(80)"),
                    ("last_login", "DATETIME"),
                    ("failed_login_attempts", "INTEGER DEFAULT 0"),
                    ("locked_until", "DATETIME"),
                    ("password_changed_at", "DATETIME"),
                    ("require_password_change", "BOOLEAN DEFAULT FALSE"),
                ],
                "cpcb_station_config": [
                    ("calibration_mode", "BOOLEAN DEFAULT FALSE"),
                    ("maintenance_mode", "BOOLEAN DEFAULT FALSE"),
                    ("station_code", "VARCHAR(50)"),
                    ("export_enabled", "BOOLEAN DEFAULT TRUE"),
                    ("export_path", "VARCHAR(500) DEFAULT 'C:\\Data'"),
                    ("cpcb_enabled", "BOOLEAN DEFAULT TRUE"),
                    ("timezone", "VARCHAR(50) DEFAULT 'Asia/Kolkata'"),
                    ("retention_count", "INTEGER DEFAULT 97"),
                ],
            }.items():
                try:
                    existing = await conn.run_sync(get_columns, table)
                    for col_name, col_type in cols:
                        if col_name not in existing:
                            await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_type}"))
                            log.info(f"Migrated: added '{col_name}' to {table}")
                except Exception as e:
                    log.warning(f"{table} migration skipped: {e}")
        else:
            log.info("Column migrations already applied, skipping.")

        # 2.1 Always-checked migrations (security columns — not gated by sentinel)
        def _ensure_security_columns(sync_conn):
            from sqlalchemy import inspect
            inspector = inspect(sync_conn)
            try:
                cols = {col["name"] for col in inspector.get_columns("users")}
            except Exception:
                return
            sec_cols = {"failed_login_attempts", "locked_until", "password_changed_at", "require_password_change"}
            missing = sec_cols - cols
            for col_name in missing:
                col_type = {
                    "failed_login_attempts": "INTEGER DEFAULT 0",
                    "locked_until": "DATETIME",
                    "password_changed_at": "DATETIME",
                    "require_password_change": "BOOLEAN DEFAULT FALSE",
                }[col_name]
                sync_conn.execute(text(f"ALTER TABLE users ADD COLUMN {col_name} {col_type}"))
                log.info(f"Security migration: added '{col_name}' to users")

        await conn.run_sync(_ensure_security_columns)

        # 2.11 Data migrations are no-ops for current deployments.

    log.info("Database ready [OK]")
