# -*- coding: utf-8 -*-
"""
Database SQLAlchemy Models.
"""
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy import String, Float, DateTime
from datetime import datetime

class Base(DeclarativeBase):
    pass

class LocalReading(Base):
    __tablename__ = "local_readings"
    id: Mapped[int] = mapped_column(primary_key=True)
    tag_name: Mapped[str] = mapped_column(String(100))
    value: Mapped[float] = mapped_column(Float)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)\n