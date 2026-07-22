"""
UltrON — Validation State Service (Phase 2, License Protection)

Manages persistent license-validation timestamps in the system_state table.
Used by the grace period calculator and clock anti-tampering system.

Keys stored:
  - last_successful_validation : ISO timestamp of the most recent successful RajAPI heartbeat
  - last_seen_timestamp        : High-water mark clock timestamp (Section 2, clock tamper defense)

Per Section 2 of LICENSE_LOCK_PLAN.md:
  - Full CLOCK_TAMPERED state detection is a later phase.
  - This phase builds the STORAGE mechanism and the accessor functions.
"""

from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.models import SystemState
from app.core.logger import get_logger

log = get_logger("ultron.validation_state")

_KEY_LAST_VALIDATION = "last_successful_validation"
_KEY_LAST_SEEN_TS = "last_seen_timestamp"


# ─── Internal helpers ──────────────────────────────────────────────────────────

async def _get_state_value(db: AsyncSession, key: str) -> str | None:
    """Read a single key from system_state (no commit needed)."""
    result = await db.execute(
        select(SystemState.value).where(SystemState.key == key)
    )
    row = result.scalar_one_or_none()
    return row


async def _set_state_value(db: AsyncSession, key: str, value: str) -> None:
    """Upsert a single key in system_state. Caller must commit."""
    existing = await db.execute(
        select(SystemState).where(SystemState.key == key)
    )
    row = existing.scalar_one_or_none()
    if row:
        row.value = value
        row.updated_at = datetime.utcnow()
    else:
        db.add(SystemState(key=key, value=value))


# ─── Public API — last_successful_validation ───────────────────────────────────

async def get_last_successful_validation(db: AsyncSession | None = None) -> datetime | None:
    """
    Return the most recent successful validation timestamp, or None if never validated.

    Accepts an optional existing DB session; opens its own if none provided.
    """
    if db is not None:
        raw = await _get_state_value(db, _KEY_LAST_VALIDATION)
    else:
        async with AsyncSessionLocal()  as session:
            raw = await _get_state_value(session, _KEY_LAST_VALIDATION)

    if raw is None:
        return None
    try:
        # Parse ISO-format timestamp (with or without Z suffix)
        val = raw.replace("Z", "+00:00")
        return datetime.fromisoformat(val)
    except (ValueError, TypeError) as exc:
        log.warning(f"Could not parse {_KEY_LAST_VALIDATION}={raw!r}: {exc}")
        return None


async def set_last_successful_validation(
    when: datetime | None = None,
    db: AsyncSession | None = None,
) -> datetime:
    """
    Record the current time (or *when*) as the last successful validation.

    Returns the datetime that was stored.
    """
    ts = when if when is not None else datetime.now(timezone.utc)
    # Normalise to UTC for consistent comparison
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    value_str = ts.isoformat()

    if db is not None:
        await _set_state_value(db, _KEY_LAST_VALIDATION, value_str)
    else:
        async with AsyncSessionLocal() as session:
            await _set_state_value(session, _KEY_LAST_VALIDATION, value_str)
            await session.commit()

    log.debug(f"Validation timestamp updated to {value_str}")
    return ts


# ─── Public API — last_seen_timestamp (high-water mark) ────────────────────────
# Section 2 clock anti-tampering storage.
# Full CLOCK_TAMPERED detection is implemented in a later phase;
# this phase only provides the storage primitive.

async def get_last_seen_timestamp(db: AsyncSession | None = None) -> datetime | None:
    """Return the high-water mark timestamp, or None if never recorded."""
    if db is not None:
        raw = await _get_state_value(db, _KEY_LAST_SEEN_TS)
    else:
        async with AsyncSessionLocal() as session:
            raw = await _get_state_value(session, _KEY_LAST_SEEN_TS)

    if raw is None:
        return None
    try:
        val = raw.replace("Z", "+00:00")
        return datetime.fromisoformat(val)
    except (ValueError, TypeError) as exc:
        log.warning(f"Could not parse {_KEY_LAST_SEEN_TS}={raw!r}: {exc}")
        return None


async def set_last_seen_timestamp(
    when: datetime | None = None,
    db: AsyncSession | None = None,
) -> datetime:
    """
    Record a high-water mark timestamp (typically called every poll cycle).

    Per Section 2: this is updated every minute during polling.
    """
    ts = when if when is not None else datetime.now(timezone.utc)
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    value_str = ts.isoformat()

    if db is not None:
        await _set_state_value(db, _KEY_LAST_SEEN_TS, value_str)
    else:
        async with AsyncSessionLocal() as session:
            await _set_state_value(session, _KEY_LAST_SEEN_TS, value_str)
            await session.commit()

    return ts
