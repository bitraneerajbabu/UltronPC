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
    from app.models import station, device, parameter, telemetry, user, server_config, cpcb, calibration  # noqa: F401
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

        # 2. Migrate: add new columns to server_config if they don't exist yet
        # (SQLAlchemy create_all won't add columns to existing tables)
        def get_columns(sync_conn, table_name):
            from sqlalchemy import inspect
            inspector = inspect(sync_conn)
            try:
                return {col["name"] for col in inspector.get_columns(table_name)}
            except Exception:
                return set()

        try:
            existing_cols = await conn.run_sync(get_columns, "server_config")
            if existing_cols:
                if "protocol" not in existing_cols:
                    await conn.execute(text("ALTER TABLE server_config ADD COLUMN protocol VARCHAR(20) DEFAULT 'tspcb'"))
                    log.info("Migrated: added 'protocol' column to server_config")
                if "cpcb_file_path" not in existing_cols:
                    await conn.execute(text("ALTER TABLE server_config ADD COLUMN cpcb_file_path VARCHAR(500)"))
                    log.info("Migrated: added 'cpcb_file_path' column to server_config")
                if "is_cpcb_active" not in existing_cols:
                    await conn.execute(text("ALTER TABLE server_config ADD COLUMN is_cpcb_active BOOLEAN DEFAULT TRUE"))
                    log.info("Migrated: added 'is_cpcb_active' column to server_config")
                if "led_channel_id" not in existing_cols:
                    await conn.execute(text("ALTER TABLE server_config ADD COLUMN led_channel_id INTEGER"))
                    log.info("Migrated: added 'led_channel_id' column to server_config")
                if "led_station_name" not in existing_cols:
                    await conn.execute(text("ALTER TABLE server_config ADD COLUMN led_station_name VARCHAR(100)"))
                    log.info("Migrated: added 'led_station_name' column to server_config")
                if "live_url" not in existing_cols:
                    await conn.execute(text("ALTER TABLE server_config ADD COLUMN live_url VARCHAR(500)"))
                    log.info("Migrated: added 'live_url' column to server_config")
                if "delay_url" not in existing_cols:
                    await conn.execute(text("ALTER TABLE server_config ADD COLUMN delay_url VARCHAR(500)"))
                    log.info("Migrated: added 'delay_url' column to server_config")
        except Exception as mig_err:
            log.warning(f"server_config migration skipped: {mig_err}")

        # 2.5 Migrate: add new columns to server_parameter_mapping if they don't exist yet
        try:
            existing_mapping_cols = await conn.run_sync(get_columns, "server_parameter_mapping")
            if existing_mapping_cols:
                if "cpcb_station_name" not in existing_mapping_cols:
                    await conn.execute(text("ALTER TABLE server_parameter_mapping ADD COLUMN cpcb_station_name VARCHAR(100)"))
                    log.info("Migrated: added 'cpcb_station_name' column to server_parameter_mapping")
                if "cpcb_parameter" not in existing_mapping_cols:
                    await conn.execute(text("ALTER TABLE server_parameter_mapping ADD COLUMN cpcb_parameter VARCHAR(100)"))
                    log.info("Migrated: added 'cpcb_parameter' column to server_parameter_mapping")
                if "led_channel_name" not in existing_mapping_cols:
                    await conn.execute(text("ALTER TABLE server_parameter_mapping ADD COLUMN led_channel_name VARCHAR(100)"))
                    log.info("Migrated: added 'led_channel_name' column to server_parameter_mapping")
                if "led_unit" not in existing_mapping_cols:
                    await conn.execute(text("ALTER TABLE server_parameter_mapping ADD COLUMN led_unit VARCHAR(50)"))
                    log.info("Migrated: added 'led_unit' column to server_parameter_mapping")
                if "api_id" not in existing_mapping_cols:
                    await conn.execute(text("ALTER TABLE server_parameter_mapping ADD COLUMN api_id VARCHAR(100)"))
                    log.info("Migrated: added 'api_id' column to server_parameter_mapping")
                if "api_name" not in existing_mapping_cols:
                    await conn.execute(text("ALTER TABLE server_parameter_mapping ADD COLUMN api_name VARCHAR(100)"))
                    log.info("Migrated: added 'api_name' column to server_parameter_mapping")
                if "api_password" not in existing_mapping_cols:
                    await conn.execute(text("ALTER TABLE server_parameter_mapping ADD COLUMN api_password VARCHAR(100)"))
                    log.info("Migrated: added 'api_password' column to server_parameter_mapping")
                if "api_vname" not in existing_mapping_cols:
                    await conn.execute(text("ALTER TABLE server_parameter_mapping ADD COLUMN api_vname VARCHAR(100)"))
                    log.info("Migrated: added 'api_vname' column to server_parameter_mapping")
                if "api_unit" not in existing_mapping_cols:
                    await conn.execute(text("ALTER TABLE server_parameter_mapping ADD COLUMN api_unit VARCHAR(50)"))
                    log.info("Migrated: added 'api_unit' column to server_parameter_mapping")
        except Exception as mig_err:
            log.warning(f"server_parameter_mapping migration skipped: {mig_err}")

        # 2.6 Migrate: add daily CSV device columns if they don't exist yet
        try:
            existing_device_cols = await conn.run_sync(get_columns, "devices")
            if existing_device_cols:
                if "csv_folder" not in existing_device_cols:
                    await conn.execute(text("ALTER TABLE devices ADD COLUMN csv_folder VARCHAR(500)"))
                    log.info("Migrated: added 'csv_folder' column to devices")
                if "csv_filename_pattern" not in existing_device_cols:
                    await conn.execute(text("ALTER TABLE devices ADD COLUMN csv_filename_pattern VARCHAR(200)"))
                    log.info("Migrated: added 'csv_filename_pattern' column to devices")
                if "csv_delimiter" not in existing_device_cols:
                    await conn.execute(text("ALTER TABLE devices ADD COLUMN csv_delimiter VARCHAR(5) DEFAULT ','"))
                    log.info("Migrated: added 'csv_delimiter' column to devices")
                if "csv_timestamp_col" not in existing_device_cols:
                    await conn.execute(text("ALTER TABLE devices ADD COLUMN csv_timestamp_col INTEGER"))
                    log.info("Migrated: added 'csv_timestamp_col' column to devices")
                if "request_hex" not in existing_device_cols:
                    await conn.execute(text("ALTER TABLE devices ADD COLUMN request_hex VARCHAR(500)"))
                    log.info("Migrated: added 'request_hex' column to devices")
                if "response_delimiter" not in existing_device_cols:
                    await conn.execute(text("ALTER TABLE devices ADD COLUMN response_delimiter VARCHAR(20) DEFAULT 'newline'"))
                    log.info("Migrated: added 'response_delimiter' column to devices")
        except Exception as mig_err:
            log.warning(f"devices migration skipped: {mig_err}")

        # 2.7 Migrate: add calibration_mode / maintenance_mode to cpcb_station_config
        try:
            existing_cpcb_cols = await conn.run_sync(get_columns, "cpcb_station_config")
            if existing_cpcb_cols:
                if "calibration_mode" not in existing_cpcb_cols:
                    await conn.execute(text("ALTER TABLE cpcb_station_config ADD COLUMN calibration_mode BOOLEAN DEFAULT FALSE"))
                    log.info("Migrated: added 'calibration_mode' column to cpcb_station_config")
                if "maintenance_mode" not in existing_cpcb_cols:
                    await conn.execute(text("ALTER TABLE cpcb_station_config ADD COLUMN maintenance_mode BOOLEAN DEFAULT FALSE"))
                    log.info("Migrated: added 'maintenance_mode' column to cpcb_station_config")
                if "station_code" not in existing_cpcb_cols:
                    await conn.execute(text("ALTER TABLE cpcb_station_config ADD COLUMN station_code VARCHAR(50)"))
                    log.info("Migrated: added 'station_code' column to cpcb_station_config")
                if "export_enabled" not in existing_cpcb_cols:
                    await conn.execute(text("ALTER TABLE cpcb_station_config ADD COLUMN export_enabled BOOLEAN DEFAULT TRUE"))
                    log.info("Migrated: added 'export_enabled' column to cpcb_station_config")
                if "export_path" not in existing_cpcb_cols:
                    await conn.execute(text("ALTER TABLE cpcb_station_config ADD COLUMN export_path VARCHAR(500) DEFAULT 'C:\\Data'"))
                    log.info("Migrated: added 'export_path' column to cpcb_station_config")
                if "cpcb_enabled" not in existing_cpcb_cols:
                    await conn.execute(text("ALTER TABLE cpcb_station_config ADD COLUMN cpcb_enabled BOOLEAN DEFAULT TRUE"))
                    log.info("Migrated: added 'cpcb_enabled' column to cpcb_station_config")
                if "timezone" not in existing_cpcb_cols:
                    await conn.execute(text("ALTER TABLE cpcb_station_config ADD COLUMN timezone VARCHAR(50) DEFAULT 'Asia/Kolkata'"))
                    log.info("Migrated: added 'timezone' column to cpcb_station_config")
                if "retention_count" not in existing_cpcb_cols:
                    await conn.execute(text("ALTER TABLE cpcb_station_config ADD COLUMN retention_count INTEGER DEFAULT 97"))
                    log.info("Migrated: added 'retention_count' column to cpcb_station_config")
        except Exception as mig_err:
            log.warning(f"cpcb_station_config migration skipped: {mig_err}")

        pass

    log.info("Database ready [OK]")
