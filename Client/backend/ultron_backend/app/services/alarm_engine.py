"""
UltrON — Alarm Engine
Evaluates parameter values against thresholds,
creates/clears alarm records in the DB, and pushes alarm events via WebSocket.
"""

from datetime import datetime
from typing import Optional
# pyrefly: ignore [missing-import]
from sqlalchemy.ext.asyncio import AsyncSession
# pyrefly: ignore [missing-import]
from sqlalchemy import select, and_
from app.models.telemetry import Alarm, AlarmState, SystemLog
from app.models.parameter import Parameter
from app.websocket_manager import ws_manager
from app.core.logger import get_logger, get_alarm_logger

log = get_logger("ultron.alarm_engine")
alarm_log = get_alarm_logger()


class AlarmEngine:
    """
    Evaluates readings against parameter alarm thresholds.
    Manages alarm lifecycle: trigger → acknowledge → clear.
    Uses hysteresis (deadband) to prevent alarm chatter.
    """

    # Track active alarm IDs per (parameter_id, threshold_type)
    _active: dict[tuple, int] = {}

    @classmethod
    async def evaluate(
        cls,
        db: AsyncSession,
        parameter: Parameter,
        value: Optional[float],
        quality: str,
    ):
        """Check value against all configured thresholds."""
        if not parameter.alarm_enabled or value is None:
            return

        # Evaluate each threshold level
        checks = [
            ("high_high", parameter.alarm_high_high, "≥", "EMERGENCY: Value critically high"),
            ("high",      parameter.alarm_high,      "≥", "WARNING: Value high"),
            ("low",       parameter.alarm_low,       "≤", "WARNING: Value low"),
            ("low_low",   parameter.alarm_low_low,   "≤", "EMERGENCY: Value critically low"),
        ]

        for thresh_type, threshold, direction, base_msg in checks:
            if threshold is None:
                continue

            db_band = parameter.alarm_deadband or 0.0
            key = (parameter.id, thresh_type)

            # Determine if breached (with deadband hysteresis)
            if direction == "≥":
                breached = value >= threshold
                cleared = value < (threshold - db_band)
            else:
                breached = value <= threshold
                cleared = value > (threshold + db_band)

            existing_id = cls._active.get(key)

            if breached and not existing_id:
                # New alarm
                msg = f"{base_msg}: {parameter.tag_name} = {value:.3f} {parameter.unit or ''} (threshold: {threshold})"
                alarm = Alarm(
                    parameter_id=parameter.id,
                    severity=parameter.alarm_severity,
                    message=msg,
                    threshold_type=thresh_type,
                    threshold_value=threshold,
                    actual_value=value,
                    state=AlarmState.active,
                    triggered_at=datetime.utcnow(),
                )
                db.add(alarm)
                await db.flush()
                cls._active[key] = alarm.id

                alarm_log.warning(msg)

                # Push to WebSocket
                await ws_manager.send_alarm({
                    "alarm_id": alarm.id,
                    "parameter_id": parameter.id,
                    "tag_name": parameter.tag_name,
                    "severity": str(parameter.alarm_severity),
                    "message": msg,
                    "value": value,
                    "threshold": threshold,
                    "threshold_type": thresh_type,
                    "ts": datetime.utcnow().isoformat(),
                })

            elif cleared and existing_id:
                # Auto-clear alarm
                result = await db.execute(
                    select(Alarm).where(Alarm.id == existing_id)
                )
                alarm = result.scalar_one_or_none()
                if alarm and alarm.state != AlarmState.cleared:
                    alarm.state = AlarmState.cleared
                    alarm.cleared_at = datetime.utcnow()
                    cls._active.pop(key, None)
                    log.info(f"Alarm cleared: {parameter.tag_name} ({thresh_type})")

    @classmethod
    async def acknowledge(
        cls,
        db: AsyncSession,
        alarm_ids: list[int],
        acknowledged_by: str,
        notes: Optional[str] = None,
    ) -> int:
        """Acknowledge a list of alarms. Returns count updated."""
        count = 0
        for alarm_id in alarm_ids:
            result = await db.execute(
                select(Alarm).where(and_(Alarm.id == alarm_id, Alarm.state == AlarmState.active))
            )
            alarm = result.scalar_one_or_none()
            if alarm:
                alarm.state = AlarmState.acknowledged
                alarm.acknowledged_at = datetime.utcnow()
                alarm.acknowledged_by = acknowledged_by
                alarm.notes = notes
                count += 1
        return count

    @classmethod
    async def get_active_count(cls, db: AsyncSession) -> int:
        result = await db.execute(
            select(Alarm).where(Alarm.state == AlarmState.active)
        )
        return len(result.scalars().all())


# ─── Singleton ────────────────────────────────────────────────────────────────
alarm_engine = AlarmEngine()
