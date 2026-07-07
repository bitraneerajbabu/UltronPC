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
    from app.models import station, device, parameter, telemetry, user, server_config, cpcb, calibration, plant_settings  # noqa: F401
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

        # 2.7 Migrate: add new columns to parameters table (TCP Custom parsing + connection overrides)
        try:
            existing_param_cols = await conn.run_sync(get_columns, "parameters")
            if existing_param_cols:
                if "parse_method" not in existing_param_cols:
                    await conn.execute(text("ALTER TABLE parameters ADD COLUMN parse_method VARCHAR(30) DEFAULT 'csv_col'"))
                    log.info("Migrated: added 'parse_method' column to parameters")
                if "parse_config" not in existing_param_cols:
                    await conn.execute(text("ALTER TABLE parameters ADD COLUMN parse_config TEXT"))
                    log.info("Migrated: added 'parse_config' column to parameters")
                if "host" not in existing_param_cols:
                    await conn.execute(text("ALTER TABLE parameters ADD COLUMN host VARCHAR(100)"))
                    log.info("Migrated: added 'host' column to parameters")
                if "port" not in existing_param_cols:
                    await conn.execute(text("ALTER TABLE parameters ADD COLUMN port INTEGER"))
                    log.info("Migrated: added 'port' column to parameters")
                if "serial_port" not in existing_param_cols:
                    await conn.execute(text("ALTER TABLE parameters ADD COLUMN serial_port VARCHAR(50)"))
                    log.info("Migrated: added 'serial_port' column to parameters")
                if "baud_rate" not in existing_param_cols:
                    await conn.execute(text("ALTER TABLE parameters ADD COLUMN baud_rate INTEGER"))
                    log.info("Migrated: added 'baud_rate' column to parameters")
                if "data_bits" not in existing_param_cols:
                    await conn.execute(text("ALTER TABLE parameters ADD COLUMN data_bits INTEGER"))
                    log.info("Migrated: added 'data_bits' column to parameters")
                if "parity" not in existing_param_cols:
                    await conn.execute(text("ALTER TABLE parameters ADD COLUMN parity VARCHAR(5)"))
                    log.info("Migrated: added 'parity' column to parameters")
                if "stop_bits" not in existing_param_cols:
                    await conn.execute(text("ALTER TABLE parameters ADD COLUMN stop_bits INTEGER"))
                    log.info("Migrated: added 'stop_bits' column to parameters")
                if "slave_id" not in existing_param_cols:
                    await conn.execute(text("ALTER TABLE parameters ADD COLUMN slave_id INTEGER"))
                    log.info("Migrated: added 'slave_id' column to parameters")
        except Exception as mig_err:
            log.warning(f"parameters migration skipped: {mig_err}")

        # 2.8 Migrate: add new columns to stations table (connection config + status)
        try:
            existing_station_cols = await conn.run_sync(get_columns, "stations")
            if existing_station_cols:
                if "last_seen" not in existing_station_cols:
                    await conn.execute(text("ALTER TABLE stations ADD COLUMN last_seen DATETIME"))
                    log.info("Migrated: added 'last_seen' column to stations")
                if "last_error" not in existing_station_cols:
                    await conn.execute(text("ALTER TABLE stations ADD COLUMN last_error TEXT"))
                    log.info("Migrated: added 'last_error' column to stations")
        except Exception as mig_err:
            log.warning(f"stations migration skipped: {mig_err}")

        # 2.9 Migrate: add new columns to users table (created_by, last_login)
        try:
            existing_user_cols = await conn.run_sync(get_columns, "users")
            if existing_user_cols:
                if "created_by" not in existing_user_cols:
                    await conn.execute(text("ALTER TABLE users ADD COLUMN created_by VARCHAR(80)"))
                    log.info("Migrated: added 'created_by' column to users")
                if "last_login" not in existing_user_cols:
                    await conn.execute(text("ALTER TABLE users ADD COLUMN last_login DATETIME"))
                    log.info("Migrated: added 'last_login' column to users")
        except Exception as mig_err:
            log.warning(f"users migration skipped: {mig_err}")

        # 2.10 Migrate: add calibration_mode / maintenance_mode to cpcb_station_config
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

        # 2.11 Migrate plant_settings from JSON file to DB table
        try:
            from app.config import APP_DIR
            plant_json = APP_DIR / "plant_settings.json"
            if plant_json.exists():
                existing_plant = await conn.run_sync(get_columns, "plant_settings")
                if existing_plant:
                    count = await conn.execute(text("SELECT COUNT(*) FROM plant_settings"))
                    if count.scalar() == 0:
                        import json
                        try:
                            with open(plant_json, "r", encoding="utf-8") as f:
                                data = json.load(f)
                            await conn.execute(
                                text("INSERT INTO plant_settings (plant_name, plant_address, plant_logo) VALUES (:name, :addr, :logo)"),
                                {"name": data.get("plantName", "UltrON Industrial Plant"),
                                 "addr": data.get("plantAddress", "Industrial Zone, Block A"),
                                 "logo": data.get("plantLogo", "")},
                            )
                            log.info("Migrated plant_settings from JSON file to DB")
                        except Exception:
                            log.warning("plant_settings.json found but could not be parsed")
        except Exception as mig_err:
            log.warning(f"plant_settings migration skipped: {mig_err}")

        # 2.13 Database cleanup: delete duplicate 'Global Gateway' devices with no parameters
        try:
            r = await conn.execute(text("SELECT id FROM devices WHERE name = 'Global Gateway'"))
            gg_ids = [row[0] for row in r.fetchall()]
            if len(gg_ids) > 1:
                gg_ids_str = ",".join(str(i) for i in gg_ids)
                r_used = await conn.execute(text(
                    f"SELECT DISTINCT device_id FROM parameters WHERE device_id IN ({gg_ids_str})"
                ))
                used_ids = {row[0] for row in r_used.fetchall()}
                
                # Keep at least one Global Gateway even if none are used
                to_keep = None
                if used_ids:
                    to_keep = used_ids
                else:
                    to_keep = {gg_ids[0]}
                
                unused_ids = [gid for gid in gg_ids if gid not in to_keep]
                if unused_ids:
                    unused_ids_str = ",".join(str(i) for i in unused_ids)
                    await conn.execute(text(
                        f"DELETE FROM devices WHERE id IN ({unused_ids_str})"
                    ))
                    log.info(f"Cleaned up {len(unused_ids)} duplicate Global Gateway devices.")
        except Exception as clean_err:
            log.warning(f"Device cleanup failed: {clean_err}")

        # 2.13.5 Fix NULL status values in stations and devices (safety net for existing DBs)
        try:
            await conn.execute(text("UPDATE stations SET status = 'offline' WHERE status IS NULL"))
            await conn.execute(text("UPDATE devices SET status = 'offline' WHERE status IS NULL"))
        except Exception as fix_err:
            log.warning(f"Status NULL cleanup skipped: {fix_err}")

        # 2.13.6 Remove accidental demo broadcasts from existing/bundled databases.
        # Real broadcasts should only come from RajAPI/manual creation.
        try:
            result = await conn.execute(
                text(
                    "DELETE FROM broadcasts "
                    "WHERE lower(trim(message)) = :message "
                    "AND CAST(expires_at AS TEXT) LIKE :expires_at"
                ),
                {
                    "message": "scheduled maintenance tonight at 2 am",
                    "expires_at": "2026-07-05%",
                },
            )
            if result.rowcount and result.rowcount > 0:
                log.info(f"Removed {result.rowcount} accidental placeholder broadcast(s).")
        except Exception as clean_err:
            log.warning(f"Broadcast cleanup skipped: {clean_err}")

        # 2.14 Seed default 'Global Gateway' if devices table is completely empty
        try:
            count = await conn.execute(text("SELECT COUNT(*) FROM devices"))
            if count.scalar() == 0:
                # Find or create a default station first
                st_count = await conn.execute(text("SELECT COUNT(*) FROM stations"))
                if st_count.scalar() == 0:
                    from datetime import datetime
                    now_str = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S.%f')
                    await conn.execute(text(
                        "INSERT INTO stations (name, station_type, status, is_active, created_at, updated_at) "
                        "VALUES ('Default Station', 'AAQMS', 'offline', 1, :now, :now)"
                    ), {"now": now_str})
                st_res = await conn.execute(text("SELECT id FROM stations ORDER BY id LIMIT 1"))
                station_id = st_res.scalar()
                
                from datetime import datetime
                now_str = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S.%f')
                await conn.execute(text(
                    "INSERT INTO devices (name, protocol, is_active, station_id, created_at, updated_at) "
                    "VALUES ('Global Gateway', 'modbus_tcp', 1, :station_id, :now, :now)"
                ), {"station_id": station_id, "now": now_str})
                log.info("Seeded default Global Gateway device.")
        except Exception as seed_err:
            log.warning(f"Device seeding failed: {seed_err}")

    log.info("Database ready [OK]")
