"""
UltrON — Lock Status Store

Stores lock_status and allow_spcbcpcb_push flags received from RajAPI sync response.
Uses a JSON file for persistence across restarts.
Thread-safe via asyncio.Lock.
"""

import json
import os
import asyncio
from pathlib import Path
from app.core.logger import get_logger

log = get_logger("ultron.lock_store")

LOCK_FILE = Path(__file__).parent.parent.parent / "client_lock.json"

_lock = asyncio.Lock()
_cache = {
    "lock_status": "unlocked",
    "lock_reason": None,
    "allow_spcbcpcb_push": True,
    "amc_expiry": None,
}


def _read_sync() -> dict:
    try:
        return json.loads(LOCK_FILE.read_text(encoding="utf-8")) if LOCK_FILE.is_file() else dict(_cache)
    except Exception as e:
        log.warning(f"Failed to read lock file: {e}")
        return dict(_cache)


def _write_sync(data: dict):
    try:
        LOCK_FILE.write_text(json.dumps(data, indent=2, default=str), encoding="utf-8")
    except Exception as e:
        log.warning(f"Failed to write lock file: {e}")


async def update_from_sync_response(sync_resp: dict):
    """Update lock status from RajAPI sync response."""
    async with _lock:
        data = _read_sync()
        changed = False
        for key in ("lock_status", "lock_reason", "allow_spcbcpcb_push", "amc_expiry"):
            if key in sync_resp:
                data[key] = sync_resp[key]
                changed = True
        if changed:
            _write_sync(data)
            _cache.update(data)
            log.info(f"Lock status updated: {data.get('lock_status')} (push={data.get('allow_spcbcpcb_push')})")


async def get_lock_status() -> dict:
    """Return current lock status."""
    async with _lock:
        return dict(_cache | _read_sync())


async def is_push_allowed() -> bool:
    """Check if SPCB/CPCB push is allowed."""
    data = await get_lock_status()
    return data.get("allow_spcbcpcb_push", True) and data.get("lock_status", "unlocked") == "unlocked"
