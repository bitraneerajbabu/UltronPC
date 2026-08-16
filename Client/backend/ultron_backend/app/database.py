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
engine = create_async_engine(settings.DATABASE_URL, echo=False)


@event.listens_for(engine.sync_engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL;")
    cursor.execute("PRAGMA synchronous=NORMAL;")
    cursor.execute("PRAGMA busy_timeout=10000;")
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
                    ("command_format", "VARCHAR(10)"),
                    ("request_command", "TEXT"),
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
                "pending_uploads": [
                    ("server_config_id", "INTEGER"),
                    ("protocol", "VARCHAR(20) DEFAULT 'spcb'"),
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
            sec_cols = {
                "failed_login_attempts",
                "locked_until",
                "password_changed_at",
                "require_password_change",
                "allow_server_mgmt",
                "is_super_admin",
            }
            missing = sec_cols - cols
            for col_name in missing:
                col_type = {
                    "failed_login_attempts": "INTEGER DEFAULT 0",
                    "locked_until": "DATETIME",
                    "password_changed_at": "DATETIME",
                    "require_password_change": "BOOLEAN DEFAULT FALSE",
                    "allow_server_mgmt": "BOOLEAN DEFAULT TRUE",
                    "is_super_admin": "BOOLEAN DEFAULT FALSE",
                }[col_name]
                sync_conn.execute(text(f"ALTER TABLE users ADD COLUMN {col_name} {col_type}"))
                log.info(f"Security migration: added '{col_name}' to users")

        await conn.run_sync(_ensure_security_columns)

        # 2.12 Always-checked: Serial ASCII columns (added v1.0.70+)
        def _ensure_serial_ascii_columns(sync_conn):
            from sqlalchemy import inspect
            inspector = inspect(sync_conn)
            try:
                cols = {col["name"] for col in inspector.get_columns("devices")}
            except Exception:
                return
            new_cols = {
                "command_format":  "VARCHAR(10)",
                "request_command": "TEXT",
            }
            for col_name, col_type in new_cols.items():
                if col_name not in cols:
                    sync_conn.execute(text(f"ALTER TABLE devices ADD COLUMN {col_name} {col_type}"))
                    log.info(f"Serial ASCII migration: added '{col_name}' to devices")

        await conn.run_sync(_ensure_serial_ascii_columns)

        # 2.14 Always-checked: PendingUpload schema migration (added v1.0.70+)
        def _ensure_pending_upload_columns(sync_conn):
            from sqlalchemy import inspect, text
            inspector = inspect(sync_conn)
            try:
                columns = inspector.get_columns("pending_uploads")
            except Exception:
                return
            col_names = {col["name"] for col in columns}

            if "protocol" not in col_names:
                sync_conn.execute(text("ALTER TABLE pending_uploads ADD COLUMN protocol VARCHAR(20) DEFAULT 'spcb'"))
                log.info("PendingUpload migration: added 'protocol' to pending_uploads")

            server_cfg_col = next((col for col in columns if col["name"] == "server_config_id"), None)
            if server_cfg_col and not server_cfg_col.get("nullable", True):
                log.info("PendingUpload migration: rebuilding table to make server_config_id nullable …")
                sync_conn.execute(text("""
                    CREATE TABLE pending_uploads_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        server_config_id INTEGER,
                        url VARCHAR(500) NOT NULL,
                        payload JSON NOT NULL,
                        mode VARCHAR(20) DEFAULT 'live',
                        protocol VARCHAR(20) DEFAULT 'spcb',
                        retry_count INTEGER DEFAULT 0,
                        last_error VARCHAR(500),
                        created_at DATETIME,
                        updated_at DATETIME
                    )
                """))
                sync_conn.execute(text("""
                    INSERT INTO pending_uploads_new (id, server_config_id, url, payload, mode, protocol, retry_count, last_error, created_at, updated_at)
                    SELECT id, server_config_id, url, payload, mode, COALESCE(protocol, 'spcb'), retry_count, last_error, created_at, updated_at
                    FROM pending_uploads
                """))
                sync_conn.execute(text("DROP TABLE pending_uploads"))
                sync_conn.execute(text("ALTER TABLE pending_uploads_new RENAME TO pending_uploads"))
                log.info("PendingUpload migration: server_config_id rebuilt to nullable [OK]")

        await conn.run_sync(_ensure_pending_upload_columns)

        # 2.15 Always-checked: Broadcast schema migration (added v1.0.70+)
        def _ensure_broadcast_columns(sync_conn):
            from sqlalchemy import inspect, text
            inspector = inspect(sync_conn)
            try:
                columns = inspector.get_columns("broadcasts")
            except Exception:
                return
            col_names = {col["name"] for col in columns}
            if "server_id" not in col_names:
                sync_conn.execute(text("ALTER TABLE broadcasts ADD COLUMN server_id VARCHAR(100)"))
                log.info("Broadcast migration: added 'server_id' to broadcasts")

        await conn.run_sync(_ensure_broadcast_columns)

        # 2.13 Centralized ORM-driven database defaults initializer
        from app.database_initializer import initialize_defaults
        await initialize_defaults()

        # 2.11 Data migrations are no-ops for current deployments.

    log.info("Database ready [OK]")


