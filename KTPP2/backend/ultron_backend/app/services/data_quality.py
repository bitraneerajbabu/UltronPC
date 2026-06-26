"""
UltrON — Data Quality Engine
Validates raw values against configured limits, assigns quality flags,
and detects stuck sensors / frozen data.
"""

from datetime import datetime
from typing import Optional
from app.core.logger import get_logger

log = get_logger("ultron.data_quality")

# Maximum time (seconds) a value can be identical before flagging "frozen"
FROZEN_THRESHOLD_SEC = 86400   # 24 hours


class DataQualityEngine:
    """
    Stateful quality checker per parameter.
    Tracks last values to detect frozen/stuck sensors.
    """

    def __init__(self):
        # parameter_id → {last_value, last_change_ts}
        self._state: dict[int, dict] = {}

    def check(
        self,
        parameter_id: int,
        value: Optional[float],
        quality_from_driver: str,
        min_valid: Optional[float] = None,
        max_valid: Optional[float] = None,
        timestamp: Optional[datetime] = None,
    ) -> str:
        """
        Returns a CPCB-standard quality code:
          U = Valid (reading within range)
          O = Out of Range (reading exceeds range)
          E = Error (no response / communication failure)
          N = Negative (negative value received)

        Priority order:
        1. Driver-reported comms_fail / sensor_fail → E
        2. None value → U (CPCB has no equivalent for missing)
        3. Negative value → N
        4. Out of range → O
        5. Frozen/stuck → U
        6. Good → U
        """
        ts = timestamp or datetime.utcnow()

        # Driver-reported failure
        if quality_from_driver in ("E", "comms_fail", "sensor_fail"):
            return "E"

        # Missing value
        if value is None:
            return "U"

        # Negative value check
        if value < 0:
            log.debug(f"Param {parameter_id}: negative value {value}")
            return "N"

        # Range check
        if min_valid is not None and value < min_valid:
            log.debug(f"Param {parameter_id}: value {value} below min {min_valid}")
            return "O"
        if max_valid is not None and value > max_valid:
            log.debug(f"Param {parameter_id}: value {value} above max {max_valid}")
            return "O"

        # Frozen sensor check
        state = self._state.get(parameter_id)
        if state:
            if value == state["last_value"]:
                age = (ts - state["last_change_ts"]).total_seconds()
                if age > FROZEN_THRESHOLD_SEC:
                    log.warning(f"Param {parameter_id}: frozen value {value} for {age:.0f}s")
                    return "U"
            else:
                self._state[parameter_id] = {"last_value": value, "last_change_ts": ts}
        else:
            self._state[parameter_id] = {"last_value": value, "last_change_ts": ts}

        return "U"

    def reset(self, parameter_id: int):
        """Reset frozen-sensor tracking for a parameter (e.g. after maintenance)."""
        self._state.pop(parameter_id, None)

    def bulk_check(self, readings: list[dict], parameters_meta: dict) -> list[dict]:
        """
        readings: list of {parameter_id, value, raw_value, quality}
        parameters_meta: {parameter_id → {min_valid, max_valid, ...}}
        Returns same list with 'quality' updated.
        """
        for r in readings:
            pid = r["parameter_id"]
            meta = parameters_meta.get(pid, {})
            r["quality"] = self.check(
                parameter_id=pid,
                value=r.get("value"),
                quality_from_driver=r.get("quality", "U"),
                min_valid=meta.get("min_valid"),
                max_valid=meta.get("max_valid"),
            )
        return readings


# ─── Singleton ────────────────────────────────────────────────────────────────
dq_engine = DataQualityEngine()
