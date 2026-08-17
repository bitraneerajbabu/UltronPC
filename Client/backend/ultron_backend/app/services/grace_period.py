"""
UltrON — Grace Period Calculator (Phase 2, License Protection)

Determines whether the client should be treated as within-grace when RajAPI
is unreachable (online heartbeat fails).

Logic (per Section 6 / Guard Logic Matrix):
  - If last_successful_validation is None (first boot / never validated):
        return False (no grace — no prior relationship to extend)
  - If (now - last_successful_validation) <= grace_period_days:
        return True  (within grace)
  - Otherwise:
        return False (beyond grace)

The GRACE_PERIOD state from Section 6 will be wired in a later phase when
the full License Manager Engine & State Guard is built.
"""

from datetime import datetime, timedelta, timezone

from app.core.logger import get_logger

log = get_logger("ultron.grace_period")

# Default grace period (configurable per Section 6 of LICENSE_LOCK_PLAN.md).
# May be overridden via set_grace_period_days() or env for testing.
_GRACE_PERIOD_DAYS: int = 30


def get_grace_period_days() -> int:
    """Return the currently configured grace period in days."""
    return _GRACE_PERIOD_DAYS


def set_grace_period_days(days: int) -> None:
    """
    Override the grace period (used for testing).
    Raises ValueError if days < 0.
    """
    if days < 0:
        raise ValueError(f"grace_period_days must be >= 0, got {days}")
    global _GRACE_PERIOD_DAYS
    _GRACE_PERIOD_DAYS = days
    log.debug(f"Grace period set to {days} day(s)")


def is_within_grace(
    last_successful_validation: datetime | None,
    grace_period_days: int | None = None,
    now: datetime | None = None,
) -> bool:
    """
    Determine whether the client is within the offline grace period.

    Parameters
    ----------
    last_successful_validation:
        The most recent datetime the client successfully validated.
        None means the client has never successfully validated.
    grace_period_days:
        Length of the grace window. Defaults to get_grace_period_days().
    now:
        The "current time" for the calculation. Defaults to datetime.now(timezone.utc).

    Returns
    -------
    bool
        True if within grace, False otherwise.
    """
    if last_successful_validation is None:
        return False

    period = grace_period_days if grace_period_days is not None else _GRACE_PERIOD_DAYS
    current_time = now if now is not None else datetime.now(timezone.utc)

    # Normalise to timezone-aware UTC for safe arithmetic
    if last_successful_validation.tzinfo is None:
        last_successful_validation = last_successful_validation.replace(tzinfo=timezone.utc)
    if current_time.tzinfo is None:
        current_time = current_time.replace(tzinfo=timezone.utc)

    deadline = last_successful_validation + timedelta(days=period)
    return current_time <= deadline


def grace_remaining(
    last_successful_validation: datetime | None,
    grace_period_days: int | None = None,
    now: datetime | None = None,
) -> timedelta | None:
    """
    Return the remaining grace duration, or None if no grace exists.

    Returns a positive timedelta when within grace, a negative timedelta when
    beyond grace, and None if last_successful_validation is None.
    """
    if last_successful_validation is None:
        return None

    period = grace_period_days if grace_period_days is not None else _GRACE_PERIOD_DAYS
    current_time = now if now is not None else datetime.now(timezone.utc)

    if last_successful_validation.tzinfo is None:
        last_successful_validation = last_successful_validation.replace(tzinfo=timezone.utc)
    if current_time.tzinfo is None:
        current_time = current_time.replace(tzinfo=timezone.utc)

    deadline = last_successful_validation + timedelta(days=period)
    return deadline - current_time
