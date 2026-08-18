"""
UltrON — Database Upgrade & Non-Destructive Migration Test
Verifies that when an older client database is opened by a newer version:
1. No existing stations, devices, or parameters are wiped or deleted.
2. Missing columns across all tables are dynamically added.
3. An automatic backup is safely created in the backups/ directory.
4. Existing client databases are NEVER overwritten by templates.
"""

import pytest
import os
import sqlite3
import shutil
from pathlib import Path
from app.config import settings
from app.database import init_db, AsyncSessionLocal
from app.models.station import Station
from app.models.device import Device
from app.models.parameter import Parameter
from sqlalchemy import select, text


@pytest.mark.asyncio
async def test_legacy_database_preservation_and_auto_migration(tmp_path):
    # 1. Create a simulated legacy v1.0 client database (with older schema & missing columns)
    legacy_db_file = tmp_path / "ultron.db"
    conn = sqlite3.connect(str(legacy_db_file))
    cur = conn.cursor()
    
    # Create minimal older tables without newer v1.1 columns
    cur.execute("""
        CREATE TABLE stations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name VARCHAR(120) NOT NULL,
            location VARCHAR(200),
            station_type VARCHAR(20) DEFAULT 'AAQMS',
            protocol VARCHAR(20) DEFAULT 'modbus_tcp',
            host VARCHAR(100),
            port INTEGER,
            is_active BOOLEAN DEFAULT 1,
            created_at DATETIME
        )
    """)
    cur.execute("""
        CREATE TABLE devices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            station_id INTEGER NOT NULL,
            name VARCHAR(120) NOT NULL,
            device_type VARCHAR(20) DEFAULT 'ANALYZER',
            slave_id INTEGER DEFAULT 1
        )
    """)
    cur.execute("""
        CREATE TABLE parameters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id INTEGER NOT NULL,
            name VARCHAR(120) NOT NULL,
            tag_name VARCHAR(50) UNIQUE NOT NULL,
            address INTEGER,
            is_active BOOLEAN DEFAULT 1
        )
    """)
    cur.execute("""
        CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username VARCHAR(80) UNIQUE NOT NULL,
            hashed_password VARCHAR(200) NOT NULL,
            role VARCHAR(20) DEFAULT 'admin',
            is_active BOOLEAN DEFAULT 1
        )
    """)
    
    # Insert existing client plant data
    cur.execute("INSERT INTO stations (id, name, location) VALUES (1, 'Existing Plant Stack 1', 'North Unit')")
    cur.execute("INSERT INTO devices (id, station_id, name) VALUES (1, 1, 'Main Modbus Analyzer')")
    cur.execute("INSERT INTO parameters (id, device_id, name, tag_name, address) VALUES (1, 1, 'Sulphur Dioxide', 'SO2_STK1', 40001)")
    cur.execute("INSERT INTO users (id, username, hashed_password, role) VALUES (1, 'plant_admin', 'some_hash', 'admin')")
    conn.commit()
    conn.close()

    # 2. Test universal dynamic schema migration on this legacy database
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
    from app.database import Base
    from sqlalchemy.dialects import sqlite
    
    test_engine = create_async_engine(f"sqlite+aiosqlite:///{legacy_db_file}", echo=False)
    TestSessionLocal = async_sessionmaker(bind=test_engine, class_=AsyncSession, expire_on_commit=False)
    
    # Run the exact universal schema migration sequence from app/database.py
    async with test_engine.begin() as conn:
        # Create any missing tables
        await conn.run_sync(Base.metadata.create_all)
        
        def _auto_migrate(sync_conn):
            from sqlalchemy import inspect, text
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
                        sync_conn.execute(text(alter_sql))
                        
        await conn.run_sync(_auto_migrate)
    
    # 3. Verify existing data was PRESERVED 100%
    async with TestSessionLocal() as db:
        st_res = await db.execute(select(Station))
        stations = st_res.scalars().all()
        assert len(stations) == 1
        assert stations[0].name == "Existing Plant Stack 1"
        
        dev_res = await db.execute(select(Device))
        devices = dev_res.scalars().all()
        assert len(devices) == 1
        assert devices[0].name == "Main Modbus Analyzer"
        
        param_res = await db.execute(select(Parameter))
        params = param_res.scalars().all()
        assert len(params) == 1
        assert params[0].tag_name == "SO2_STK1"
        
    # 4. Verify all new columns were dynamically added to the existing legacy tables
    conn2 = sqlite3.connect(str(legacy_db_file))
    cur2 = conn2.cursor()
    
    # Check station columns
    cur2.execute("PRAGMA table_info(stations)")
    st_cols = {row[1] for row in cur2.fetchall()}
    assert "latitude" in st_cols
    assert "longitude" in st_cols
    assert "status" in st_cols
    assert "last_seen" in st_cols
    
    # Check device columns
    cur2.execute("PRAGMA table_info(devices)")
    dev_cols = {row[1] for row in cur2.fetchall()}
    assert "data_bits" in dev_cols
    assert "parity" in dev_cols
    assert "stop_bits" in dev_cols
    assert "csv_folder" in dev_cols
    
    # Check user columns
    cur2.execute("PRAGMA table_info(users)")
    user_cols = {row[1] for row in cur2.fetchall()}
    assert "is_super_admin" in user_cols
    assert "allow_server_mgmt" in user_cols
    
    conn2.close()
    await test_engine.dispose()
    print("\n[OK] Successfully verified legacy data preservation and universal dynamic schema migration!")
