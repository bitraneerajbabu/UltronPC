"""UltrON — System State ORM Model (key-value persistent state storage)"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime
from app.database import Base


class SystemState(Base):
    """
    Key-value store for persistent system state.

    Used by the License Protection system (Phase 2+) to record:
      - last_successful_validation  (ISO timestamp of last successful RajAPI heartbeat)
      - last_seen_timestamp         (high-water mark clock timestamp, per Section 2)

    Future phases will add additional keys as needed.
    Each key is unique — upsert via `INSERT OR REPLACE` / merge logic.
    """
    __tablename__ = "system_state"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), unique=True, nullable=False, index=True)
    value = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<SystemState key={self.key} value={self.value[:40] if self.value else None}>"
