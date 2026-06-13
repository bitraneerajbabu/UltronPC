"""
UltrON — Database Engine
Supports:
  • SQLite (aiosqlite) embedded database
"""

from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.config import settings
from app.core.logger import get_logger

log = get_logger("ultron.database")

# ─── Connection Pool ──────────────────────────────────────────────────────────
engine_kwargs: dict = {
    "echo": False,  # Never log SQL statements (performance + security)
}

if settings.DB_TYPE == "sqlite":
    from sqlalchemy.pool import NullPool
    engine_kwargs.update({
        "connect_args": {"check_same_thread": False, "timeout": 30.0},
        "poolclass": NullPool,
    })
else:
    engine_kwargs.update({
        "pool_size": 10,
        "max_overflow": 20,
    })

engine = create_async_engine(settings.DATABASE_URL, **engine_kwargs)

if settings.DB_TYPE == "sqlite":
    @event.listens_for(engine.sync_engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        # Disable pysqlite's default transaction handling for BEGIN IMMEDIATE
        dbapi_connection.isolation_level = None
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute("PRAGMA journal_mode=WAL;")
            cursor.execute("PRAGMA synchronous=NORMAL;")
        except Exception:
            pass
        finally:
            cursor.close()

    @event.listens_for(engine.sync_engine, "begin")
    def do_begin(conn):
        # Emit BEGIN IMMEDIATE to lock writer early and prevent lock-upgrade deadlocks
        conn.exec_driver_sql("BEGIN IMMEDIATE")

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
    from app.models import station, device, parameter, telemetry, user, server_config  # noqa: F401
    from sqlalchemy import text

    log.info("Initialising database tables …")
    async with engine.begin() as conn:
        # Enable WAL mode if SQLite
        if settings.DB_TYPE == "sqlite":
            try:
                await conn.execute(text("PRAGMA journal_mode=WAL;"))
                await conn.execute(text("PRAGMA synchronous=NORMAL;"))
            except Exception as pragma_err:
                log.warning(f"Failed to set WAL pragma: {pragma_err}")

        # 1. Create standard tables
        await conn.run_sync(Base.metadata.create_all)

        # Enable TimescaleDB hypertables if PostgreSQL is active and extension is available
        if settings.DB_TYPE == "postgresql":
            try:
                await conn.execute(text("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;"))
                await conn.execute(text("SELECT create_hypertable('historical_data', 'timestamp', if_not_exists => TRUE);"))
                await conn.execute(text("SELECT create_hypertable('averages', 'timestamp', if_not_exists => TRUE);"))
                log.info("TimescaleDB extension loaded and hypertables initialized.")
            except Exception as ts_err:
                log.info(f"TimescaleDB extension check skipped (using standard PostgreSQL): {ts_err}")

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
        except Exception as mig_err:
            log.warning(f"server_parameter_mapping migration skipped: {mig_err}")

        pass

    log.info("Database ready ✓")
