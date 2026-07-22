"""
UltrON — License Manager Engine & State Guard (Phase 4, License Protection)

Unified state machine tying together Phases 1-3 per LICENSE_LOCK_PLAN.md Section 6.

States:
  ACTIVE           — License valid, full functionality.
  GRACE_PERIOD     — Online mode, RajAPI unreachable, within 30-day offline grace.
  LOCKED           — No valid license / tampered license / beyond grace.
  EXPIRED          — License file present but past expiry date.
  CLOCK_TAMPERED   — System clock rolled back past threshold.

is_cpcb_upload_allowed() per section 6 guard matrix:
  True  for ACTIVE, GRACE_PERIOD
  False for LOCKED, EXPIRED, CLOCK_TAMPERED

Clock tamper check (section 2) runs first and overrides all other states.

── Install vs Routine Check ──────────────────────────────────────────
INSTALL (admin loads a new .lic file):
    install_license_file() runs full validation (signature, HWID, expiry,
    replay-as-rollback-guard), then caches the result in system_state.

ROUTINE STATUS CHECK (every get_license_state() call):
    _get_offline_state() reads the cached license from system_state and
    re-checks ONLY expiry_date against the current date.  Signature,
    HWID, and replay checks are NOT re-run — the cache is trusted.
    This means expiry transitions (ACTIVE → EXPIRED) happen correctly
    on every poll cycle without requiring re-validation of the .lic file.
"""

from __future__ import annotations

import json
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logger import get_logger
from app.database import AsyncSessionLocal
from app.models.system_state import SystemState
from app.services.deployment_mode import is_offline_only_mode
from app.services.grace_period import is_within_grace
from app.services.offline_license import (
    LicenseExpiredError,
    LicenseReplayError,
    LicenseValidationError,
    check_expiry,
    check_hwid,
    parse_license_file,
    verify_license_signature,
)
from app.services.validation_state import (
    get_last_seen_timestamp,
    get_last_successful_validation,
)

log = get_logger("ultron.license_manager")

# ─── State constants ──────────────────────────────────────────────────────────

STATE_ACTIVE = "ACTIVE"
STATE_GRACE_PERIOD = "GRACE_PERIOD"
STATE_LOCKED = "LOCKED"
STATE_EXPIRED = "EXPIRED"
STATE_CLOCK_TAMPERED = "CLOCK_TAMPERED"

_ALL_STATES = {STATE_ACTIVE, STATE_GRACE_PERIOD, STATE_LOCKED, STATE_EXPIRED, STATE_CLOCK_TAMPERED}

# ─── Configuration (overridable for testing) ──────────────────────────────────

_LICENSE_FILE_PATH: str = "license.lic"
_CLOCK_TAMPER_THRESHOLD_SECONDS: int = 300  # 5 minutes
_INSTALLED_LICENSE_KEY: str = "installed_license"


def get_license_file_path() -> str:
    """Return the configured offline license file path."""
    return _LICENSE_FILE_PATH


def set_license_file_path(path: str) -> None:
    """Override the license file path (used for testing)."""
    global _LICENSE_FILE_PATH
    _LICENSE_FILE_PATH = path
    log.debug("License file path set to %s", path)


def get_clock_tamper_threshold_seconds() -> int:
    """Return the clock tamper threshold in seconds."""
    return _CLOCK_TAMPER_THRESHOLD_SECONDS


def set_clock_tamper_threshold_seconds(seconds: int) -> None:
    """Override the clock tamper threshold (used for testing)."""
    global _CLOCK_TAMPER_THRESHOLD_SECONDS
    _CLOCK_TAMPER_THRESHOLD_SECONDS = seconds
    log.debug("Clock tamper threshold set to %d seconds", seconds)


# ─── Clock tamper detection ───────────────────────────────────────────────────

def _is_clock_tampered(last_seen: datetime | None) -> bool:
    """
    Check whether the system clock has been rolled back past the threshold.

    Per Section 2: if current_system_time < last_seen_timestamp - 5 minutes,
    the clock has been tampered with.

    Returns False when last_seen is None (no baseline yet).
    """
    if last_seen is None:
        return False

    now = datetime.now(timezone.utc)
    if last_seen.tzinfo is None:
        last_seen = last_seen.replace(tzinfo=timezone.utc)

    drift_seconds = (now - last_seen).total_seconds()
    return drift_seconds < -_CLOCK_TAMPER_THRESHOLD_SECONDS


# ─── Cached license helpers ───────────────────────────────────────────────────
# The cached license is stored in system_state with key "installed_license".
# It is written only during install_license_file() and read by _get_offline_state().

def _get_today() -> date:
    """Return today's UTC date. Extracted for testability via mock."""
    return datetime.now(timezone.utc).date()


async def _get_cached_license(db: AsyncSession) -> dict[str, Any] | None:
    """Read the currently installed license from the system_state cache."""
    result = await db.execute(
        select(SystemState.value).where(SystemState.key == _INSTALLED_LICENSE_KEY)
    )
    raw = result.scalar_one_or_none()
    if raw is None:
        return None
    try:
        return json.loads(raw)  # type: ignore[no-any-return]
    except (json.JSONDecodeError, TypeError):
        log.warning("Corrupt installed_license cache, treating as unlicensed")
        return None


async def _cache_license(db: AsyncSession, data: dict[str, Any]) -> None:
    """Write license data to the system_state cache (upsert)."""
    cache = {
        "license_id": data.get("license_id"),
        "hwid": data.get("hwid"),
        "issue_date": data.get("issue_date"),
        "expiry_date": data.get("expiry_date"),
        "client_name": data.get("client_name"),
        "allowed_stations": data.get("allowed_stations"),
        "deployment_mode": data.get("deployment_mode"),
        "installed_at": datetime.now(timezone.utc).isoformat(),
    }
    existing = await db.execute(
        select(SystemState).where(SystemState.key == _INSTALLED_LICENSE_KEY)
    )
    row = existing.scalar_one_or_none()
    if row:
        row.value = json.dumps(cache)
        row.updated_at = datetime.utcnow()
    else:
        db.add(SystemState(key=_INSTALLED_LICENSE_KEY, value=json.dumps(cache)))


# ─── Public API: Install a new .lic file ──────────────────────────────────────

async def install_license_file(path: str | Path, db: AsyncSession) -> dict[str, Any]:
    """
    Full INSTALL pipeline: parse, verify signature, HWID, expiry, and replay guard.

    Replay protection rejects a license whose issue_date is older than the
    currently installed license (blocks rollback to a stale file).  Installing
    the same or newer issue_date is allowed (re-install or upgrade).

    On success, caches the installed license data in system_state so that
    subsequent get_license_state() calls can read it without re-validating.

    Returns the parsed license dict on success.
    Raises LicenseValidationError (subclass) on first failure.
    """
    # 1. Parse the .lic file
    data = parse_license_file(path)

    # 2. RSA-2048 signature verification
    verify_license_signature(data)

    # 3. HWID match against local machine
    check_hwid(data)

    # 4. Expiry check
    check_expiry(data)

    # 5. Replay-as-rollback guard: reject if new issue_date < cached issue_date
    cached = await _get_cached_license(db)
    if cached:
        cached_issue_str = cached.get("issue_date", "")
        new_issue_str = data.get("issue_date", "")
        if cached_issue_str and new_issue_str:
            try:
                cached_issue = date.fromisoformat(cached_issue_str)
                new_issue = date.fromisoformat(new_issue_str)
            except (ValueError, TypeError) as exc:
                raise LicenseValidationError(f"Invalid issue_date: {exc}") from exc
            if new_issue < cached_issue:
                raise LicenseReplayError(
                    f"License issued {new_issue_str} is older than currently installed "
                    f"license (issued {cached_issue_str}) — rollback not allowed"
                )

    # 6. Cache the installed license data
    await _cache_license(db, data)

    log.info("License %s installed successfully", data.get("license_id"))
    return data


# ─── Mode-specific state logic ────────────────────────────────────────────────

async def _get_offline_state(db: AsyncSession) -> str:
    """
    Determine license state from the cached installed license (NOT the .lic file).

    Reads the installed_license cache and re-checks ONLY expiry_date against
    the current date.  Signature, HWID, and replay integrity are already
    guaranteed by the prior install_license_file() call.

    Mapping:
      cached license present, not expired   → ACTIVE
      cached license present, expired       → EXPIRED
      no cached license                     → LOCKED
    """
    cached = await _get_cached_license(db)
    if cached is None:
        return STATE_LOCKED

    expiry_str = cached.get("expiry_date")
    if not expiry_str:
        return STATE_LOCKED

    try:
        expiry = date.fromisoformat(str(expiry_str))
    except (ValueError, TypeError):
        return STATE_LOCKED

    if expiry < _get_today():
        return STATE_EXPIRED

    return STATE_ACTIVE


async def _get_online_state(db: AsyncSession) -> str:
    """
    Determine license state in online mode from RajAPI heartbeat history.

    Mapping:
      last_successful_validation is None        → LOCKED (never validated)
      last_successful_validation within grace   → GRACE_PERIOD
      last_successful_validation beyond grace   → LOCKED
    """
    last_valid = await get_last_successful_validation(db=db)

    if last_valid is None:
        return STATE_LOCKED

    if is_within_grace(last_valid):
        return STATE_GRACE_PERIOD

    return STATE_LOCKED


# ─── Public API: State queries ────────────────────────────────────────────────

async def get_license_state(db: AsyncSession) -> str:
    """
    Determine the current license state.

    Priority:
      1. Clock tamper check (overrides all other states)
      2. Branch by deployment mode (offline_only vs online)
    """
    # Step 1 — Clock tamper check (overrides everything)
    last_seen = await get_last_seen_timestamp(db=db)
    if _is_clock_tampered(last_seen):
        log.warning("Clock tamper detected — returning CLOCK_TAMPERED")
        return STATE_CLOCK_TAMPERED

    # Step 2 — Branch by deployment mode
    if is_offline_only_mode():
        return await _get_offline_state(db)

    return await _get_online_state(db)


async def is_cpcb_upload_allowed(db: AsyncSession) -> bool:
    """
    Guard check per LICENSE_LOCK_PLAN.md Section 6.

    Returns True only for ACTIVE and GRACE_PERIOD states.
    All other states (LOCKED, EXPIRED, CLOCK_TAMPERED) freeze CPCB push.
    """
    state = await get_license_state(db)
    allowed = state in (STATE_ACTIVE, STATE_GRACE_PERIOD)
    if not allowed:
        log.warning("CPCB upload blocked — license state is %s", state)
    return allowed
