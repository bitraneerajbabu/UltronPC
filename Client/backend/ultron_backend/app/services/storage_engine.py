"""
UltrON — Storage Engine Layer (storage_engine.py)

Abstract storage layer decoupling the Historian Service from SQLite database specifics.
Enables plug-and-play database backends (SQLite, PostgreSQL, TimescaleDB).
"""

from abc import ABC, abstractmethod
from datetime import datetime
from typing import List, Dict, Any, Optional

from sqlalchemy import select
from app.core.logger import get_logger
from app.database import AsyncSessionLocal
from app.models.telemetry import HistoricalData, DataQuality
from app.services.time_sync import get_utc_now

log = get_logger("ultron.storage_engine")


class BaseStorageEngine(ABC):
    """Abstract interface for Historian database backends."""

    @abstractmethod
    async def save_history_batch(self, records: List[dict]) -> int:
        """
        Save a batch of historical records.
        Returns the number of records successfully written.
        """
        pass

    @abstractmethod
    async def close(self) -> None:
        """Close storage connections."""
        pass


class SQLiteStorageEngine(BaseStorageEngine):
    """
    Concrete SQLite storage engine implementation.
    Inserts batch historical records in a single atomic transaction.
    Preserves Dual Timestamps (timestamp = measurement time, created_at = storage time).
    """

    async def save_history_batch(self, records: List[dict]) -> int:
        if not records:
            return 0

        _VALID_QUALITIES = {q.value for q in DataQuality}
        now = get_utc_now()
        rows = []

        for r in records:
            q_str = r.get("quality", "U")
            quality_enum = DataQuality(q_str) if q_str in _VALID_QUALITIES else DataQuality.good
            ts = r.get("timestamp") or now
            val = r.get("value")
            raw_val = r.get("raw_value")

            rows.append(
                HistoricalData(
                    parameter_id=r["parameter_id"],
                    timestamp=ts,
                    value=val,
                    raw_value=raw_val,
                    quality=quality_enum,
                    source=r.get("source", "poll"),
                    created_at=now,  # Storage Timestamp
                )
            )

        async with AsyncSessionLocal() as db:
            try:
                db.add_all(rows)
                await db.commit()
                log.info(f"SQLiteStorageEngine: committed batch of {len(rows)} historical records")
                return len(rows)
            except Exception as e:
                await db.rollback()
                log.error(f"SQLiteStorageEngine: batch insert failed: {e}")
                raise e

    async def close(self) -> None:
        """SQLite uses connection pool; no explicit close needed."""
        pass


class StorageFactory:
    """Factory creating configured storage engine instances."""

    def __init__(self):
        self._engines: Dict[str, Type[BaseStorageEngine]] = {
            "sqlite": SQLiteStorageEngine,
        }

    def register_engine(self, engine_name: str, engine_cls: Type[BaseStorageEngine]) -> None:
        self._engines[engine_name.lower().strip()] = engine_cls
        log.info(f"StorageFactory: registered storage engine '{engine_name}'")

    def create_engine(self, engine_name: str = "sqlite") -> BaseStorageEngine:
        cls = self._engines.get(engine_name.lower().strip(), SQLiteStorageEngine)
        return cls()


# Global Factory Instance
storage_factory = StorageFactory()
