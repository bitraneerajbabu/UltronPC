"""
UltrON — Historian Service (historian_service.py)

Background service snapping in-memory LiveCache data at fixed intervals (default 60s)
and persisting batch records into SQLite/StorageEngine in single transactions.
Independent of hardware polling ticks; zero additional device read requests.
"""

import asyncio
from datetime import datetime
from typing import Optional, List, Dict, Any

from app.core.logger import get_logger
from app.config import settings
from app.services.live_cache import live_cache, LiveCache
from app.services.storage_engine import BaseStorageEngine, storage_factory
from app.services.time_sync import get_utc_now
from app.database import AsyncSessionLocal
from app.models.telemetry import SystemLog

log = get_logger("ultron.historian_service")


class HistorianService:
    """
    Periodic Historian snapshot service.
    Reads atomic snapshot from LiveCache and writes to StorageEngine.
    """

    def __init__(self, storage_engine: Optional[BaseStorageEngine] = None):
        self._storage = storage_engine or storage_factory.create_engine("sqlite")
        self._running: bool = False
        self._task: Optional[asyncio.Task] = None
        self._interval_seconds: int = getattr(settings, "HISTORIAN_INTERVAL_SECONDS", 60)
        self._total_flushes: int = 0
        self._total_records_written: int = 0
        self._last_flush_time: Optional[datetime] = None

    @property
    def interval_seconds(self) -> int:
        return self._interval_seconds

    @interval_seconds.setter
    def interval_seconds(self, value: int):
        self._interval_seconds = max(10, value)

    async def flush_snapshot(self) -> int:
        """
        Take an atomic snapshot of LiveCache and persist a batch to storage.
        Guarantees snapshot consistency (shallow-copy under lock).
        Returns number of records written.
        """
        snapshot = live_cache.get_snapshot()
        if not snapshot:
            log.debug("HistorianService: LiveCache snapshot is empty — skipping flush")
            return 0

        now = get_utc_now()
        records: List[Dict[str, Any]] = []

        for pid, pt in snapshot.items():
            records.append({
                "parameter_id": pt.parameter_id,
                "value": pt.value,
                "raw_value": pt.raw_value,
                "quality": pt.quality,
                "timestamp": pt.timestamp or now,  # Measurement Timestamp
                "source": "poll",
            })

        count = await self._storage.save_history_batch(records)
        self._total_flushes += 1
        self._total_records_written += count
        self._last_flush_time = now

        # SystemLog event logging for Historian Flush
        try:
            async with AsyncSessionLocal() as db:
                db.add(SystemLog(
                    log_type="system",
                    level="INFO",
                    source="ultron.historian",
                    message=f"Historian flush #{self._total_flushes}: {count} records written"
                ))
                await db.commit()
        except Exception as err:
            log.warning(f"HistorianService: failed to write SystemLog entry: {err}")

        log.info(f"HistorianService: flush #{self._total_flushes} complete ({count} records saved)")
        return count

    async def _historian_loop(self):
        """Periodic background ticker loop."""
        log.info(f"HistorianService loop started (interval={self._interval_seconds}s)")
        while self._running:
            try:
                await asyncio.sleep(self._interval_seconds)
                if self._running:
                    await self.flush_snapshot()
            except asyncio.CancelledError:
                log.info("HistorianService loop cancelled")
                break
            except Exception as e:
                log.error(f"HistorianService loop error: {e}")

    def start(self):
        """Start the Historian background task."""
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._historian_loop(), name="historian-service-task")
        log.info("HistorianService started")

    async def stop(self):
        """Gracefully stop Historian and perform final flush."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

        # Final flush on graceful shutdown
        log.info("HistorianService performing final shutdown flush …")
        await self.flush_snapshot()
        log.info("HistorianService stopped")

    def get_metrics(self) -> Dict[str, Any]:
        """Return Historian health and performance metrics."""
        return {
            "is_running": self._running,
            "interval_seconds": self._interval_seconds,
            "total_flushes": self._total_flushes,
            "total_records_written": self._total_records_written,
            "last_flush_time": self._last_flush_time.isoformat() if self._last_flush_time else None,
        }


# Global Historian Singleton Instance
historian_service = HistorianService()
