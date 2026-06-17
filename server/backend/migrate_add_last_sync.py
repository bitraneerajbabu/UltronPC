"""
Run this ONCE on the Raspberry Pi to add the last_sync column.
Safe to run multiple times (uses IF NOT EXISTS logic).

Usage:
  ssh pi@<IP>
  cd /home/pi/rajapi_server/backend
  python3 migrate_add_last_sync.py
"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))

from app.db.database import engine
from sqlalchemy import text

with engine.connect() as conn:
    try:
        conn.execute(text(
            "ALTER TABLE industry_sites ADD COLUMN last_sync TIMESTAMP"
        ))
        conn.commit()
        print("✅ Migration complete: added 'last_sync' column to industry_sites")
    except Exception as e:
        if "already exists" in str(e).lower() or "duplicate column" in str(e).lower():
            print("ℹ️  Column 'last_sync' already exists — skipping.")
        else:
            raise
