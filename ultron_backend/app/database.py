"""
UltrON — Database Engine
Supports:
  • SQLite (aiosqlite) for local development
  • TimescaleDB (PostgreSQL) async integration via asyncpg for production
"""

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.config import settings
from app.core.logger import get_logger

log = get_logger("ultron.database")

# ─── Connection Pool ──────────────────────────────────────────────────────────
# SQLite uses StaticPool (single connection) — pool_size/max_overflow not valid
if settings.DB_TYPE == "sqlite":
    from sqlalchemy.pool import StaticPool
    engine_kwargs: dict = {
        "echo": False,
        "connect_args": {"check_same_thread": False},
        "poolclass": StaticPool,
    }
else:
    engine_kwargs: dict = {
        "echo": False,
        "pool_size": 20,
        "max_overflow": 10,
        "pool_pre_ping": True,
    }

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
    Create all tables, enable timescaledb extension, and convert
    live_data, historical_data, and averages into hypertables.
    """
    # Import all models so SQLAlchemy sees them
    from app.models import station, device, parameter, telemetry, user, server_config  # noqa: F401
    from sqlalchemy import text

    log.info("Initialising database tables …")
    async with engine.begin() as conn:
        # 1. Create standard tables
        await conn.run_sync(Base.metadata.create_all)

        # 2. Migrate: add new columns to server_config if they don't exist yet
        # (SQLAlchemy create_all won't add columns to existing tables)
        try:
            existing_cols_res = await conn.execute(text("PRAGMA table_info(server_config)"))
            existing_cols = {row[1] for row in existing_cols_res.fetchall()}
            if "protocol" not in existing_cols:
                await conn.execute(text("ALTER TABLE server_config ADD COLUMN protocol VARCHAR(20) DEFAULT 'tspcb'"))
                log.info("Migrated: added 'protocol' column to server_config")
            if "cpcb_file_path" not in existing_cols:
                await conn.execute(text("ALTER TABLE server_config ADD COLUMN cpcb_file_path VARCHAR(500)"))
                log.info("Migrated: added 'cpcb_file_path' column to server_config")
            if "is_cpcb_active" not in existing_cols:
                await conn.execute(text("ALTER TABLE server_config ADD COLUMN is_cpcb_active BOOLEAN DEFAULT 1"))
                log.info("Migrated: added 'is_cpcb_active' column to server_config")
        except Exception as mig_err:
            log.warning(f"server_config migration skipped (non-SQLite or already migrated): {mig_err}")

        # 2.5 Migrate: add new columns to server_parameter_mapping if they don't exist yet
        try:
            existing_mapping_cols_res = await conn.execute(text("PRAGMA table_info(server_parameter_mapping)"))
            existing_mapping_cols = {row[1] for row in existing_mapping_cols_res.fetchall()}
            if "cpcb_station_name" not in existing_mapping_cols:
                await conn.execute(text("ALTER TABLE server_parameter_mapping ADD COLUMN cpcb_station_name VARCHAR(100)"))
                log.info("Migrated: added 'cpcb_station_name' column to server_parameter_mapping")
            if "cpcb_parameter" not in existing_mapping_cols:
                await conn.execute(text("ALTER TABLE server_parameter_mapping ADD COLUMN cpcb_parameter VARCHAR(100)"))
                log.info("Migrated: added 'cpcb_parameter' column to server_parameter_mapping")
        except Exception as mig_err:
            log.warning(f"server_parameter_mapping migration skipped: {mig_err}")

        # 3. Enable TimescaleDB extension
        try:
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;"))
            log.info("TimescaleDB extension verified.")
        except Exception as ext_err:
            log.warning(f"Could not verify or install TimescaleDB extension: {ext_err}")

        # 3. Convert time-series tables to hypertables partitioned by timestamp
        for table_name in ["live_data", "historical_data", "averages"]:
            try:
                # Check if already a hypertable
                res = await conn.execute(text(
                    f"SELECT 1 FROM timescaledb_information.hypertables WHERE hypertable_name = '{table_name}';"
                ))
                if not res.scalar():
                    log.info(f"Converting '{table_name}' table to TimescaleDB hypertable …")
                    await conn.execute(text(
                        f"SELECT create_hypertable('{table_name}', 'timestamp', if_not_exists => TRUE);"
                    ))
                    log.info(f"'{table_name}' hypertable created ✓")
            except Exception as hyper_err:
                log.warning(f"Skipped hypertable conversion for '{table_name}' (database might be standard PG): {hyper_err}")

    log.info("Database ready ✓")
