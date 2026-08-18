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

        # 2. Automated Safe Pre-Migration Backup (SQLite)
        def _backup_sqlite_db():
            import shutil, glob
            from datetime import datetime
            from pathlib import Path
            db_path_str = settings.DATABASE_URL.replace("sqlite+aiosqlite:///", "").replace("sqlite:///", "")
            if not db_path_str or db_path_str.startswith(":memory:"):
                return
            p = Path(db_path_str)
            if p.is_file() and p.stat().st_size > 0:
                backup_dir = p.parent / "backups"
                backup_dir.mkdir(parents=True, exist_ok=True)
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                backup_file = backup_dir / f"ultron_pre_update_{timestamp}.db"
                try:
                    shutil.copy2(str(p), str(backup_file))
                    log.info(f"Database pre-update backup created: {backup_file.name}")
                    # Keep latest 5 backups
                    backups = sorted(backup_dir.glob("ultron_pre_update_*.db"), key=os.path.getmtime)
                    if len(backups) > 5:
                        for old_b in backups[:-5]:
                            try:
                                old_b.unlink()
                            except Exception:
                                pass
                except Exception as b_err:
                    log.warning(f"Database pre-update backup warning: {b_err}")

        _backup_sqlite_db()

        # 3. Universal Non-Destructive Schema Auto-Migrator
        # Dynamically inspects all tables/columns across all ORM models against the database.
        # Safely runs ALTER TABLE ADD COLUMN for any missing column on every startup.
        def _auto_migrate_all_models(sync_conn):
            from sqlalchemy import inspect, text
            from sqlalchemy.dialects import sqlite
            import enum
            inspector = inspect(sync_conn)
            existing_tables = set(inspector.get_table_names())
            
            for table_name, table in Base.metadata.tables.items():
                if table_name not in existing_tables:
                    continue
                try:
                    existing_cols = {c["name"] for c in inspector.get_columns(table_name)}
                except Exception:
                    continue
                    
                for column in table.columns:
                    if column.name not in existing_cols:
                        col_type = column.type.compile(dialect=sqlite.dialect())
                        default_clause = ""
                        if column.default is not None and column.default.arg is not None:
                            arg = column.default.arg
                            if isinstance(arg, enum.Enum):
                                default_clause = f" DEFAULT '{arg.value}'"
                            elif isinstance(arg, bool):
                                default_clause = f" DEFAULT {1 if arg else 0}"
                            elif isinstance(arg, (int, float)):
                                default_clause = f" DEFAULT {arg}"
                            elif isinstance(arg, str):
                                default_clause = f" DEFAULT '{arg}'"
                        
                        alter_sql = f"ALTER TABLE {table_name} ADD COLUMN {column.name} {col_type}{default_clause}"
                        try:
                            sync_conn.execute(text(alter_sql))
                            log.info(f"Schema Auto-Migrate: added '{column.name}' ({col_type}) to table '{table_name}' [OK]")
                        except Exception as alter_err:
                            log.warning(f"Schema Auto-Migrate warning for {table_name}.{column.name}: {alter_err}")

        await conn.run_sync(_auto_migrate_all_models)

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

    log.info("Database ready [OK]")


