"""
UltrON — Structured Logger
Provides a consistent rotating-file + console logger for all modules.
Also records info/warning/error logs to the database for the Log Viewer.
"""

import logging
import os
from logging.handlers import RotatingFileHandler
from pathlib import Path
from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

LOG_DIR = Path("./logs")
LOG_DIR.mkdir(parents=True, exist_ok=True)

_FMT = "%(asctime)s | %(levelname)-8s | %(name)-30s | %(message)s"
_DATE = "%Y-%m-%d %H:%M:%S"


class SQLAlchemyHandler(logging.Handler):
    def __init__(self):
        super().__init__()
        self._session_maker = None

    def _get_session(self):
        if self._session_maker is None:
            try:
                from app.config import settings
                engine = create_engine(settings.SYNC_DATABASE_URL, pool_pre_ping=True)
                self._session_maker = sessionmaker(bind=engine)
            except Exception:
                pass
        return self._session_maker() if self._session_maker else None

    def emit(self, record):
        # Prevent recursion & circular logs
        if (record.name.startswith("sqlalchemy") or 
            record.name.startswith("aiosqlite") or 
            record.name.startswith("uvicorn") or
            record.name.startswith("fastapi") or
            "database" in record.name):
            return

        session = self._get_session()
        if not session:
            return

        try:
            level = record.levelname
            name = record.name
            
            if "audit" in name:
                log_type = "audit"
            elif "alarm" in name:
                log_type = "alarm"
            elif any(x in name for x in ["comm", "modbus", "tcp", "csv"]):
                log_type = "comm"
            else:
                log_type = "system"

            from app.models.telemetry import SystemLog
            
            log_entry = SystemLog(
                log_type=log_type,
                level=level,
                source=record.name,
                message=record.getMessage(),
                details=None,
                timestamp=datetime.utcfromtimestamp(record.created)
            )
            session.add(log_entry)
            session.commit()
        except Exception:
            session.rollback()
        finally:
            session.close()


def _setup_ultron_logger() -> logging.Logger:
    """Ensure the parent 'ultron' logger is configured with handlers exactly once."""
    parent = logging.getLogger("ultron")
    if parent.handlers:
        return parent

    parent.setLevel(logging.DEBUG)
    formatter = logging.Formatter(_FMT, datefmt=_DATE)

    # Console
    console = logging.StreamHandler()
    console.setLevel(logging.INFO)
    console.setFormatter(formatter)
    parent.addHandler(console)

    # Rotating file — general
    file_handler = RotatingFileHandler(
        LOG_DIR / "ultron.log",
        maxBytes=10 * 1024 * 1024,   # 10 MB
        backupCount=5,
        encoding="utf-8",
    )
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(formatter)
    parent.addHandler(file_handler)

    # DB handler
    db_handler = SQLAlchemyHandler()
    db_handler.setLevel(logging.INFO)
    parent.addHandler(db_handler)

    return parent


def get_logger(name: str) -> logging.Logger:
    """
    Return a named logger that propagates to the parent 'ultron' logger.
    """
    _setup_ultron_logger()
    
    # Ensure the requested name is mapped under "ultron" namespace if it isn't already
    if name != "ultron" and not name.startswith("ultron."):
        name = f"ultron.{name}"

    logger = logging.getLogger(name)
    logger.setLevel(logging.DEBUG)
    # Ensure it propagates up to the parent "ultron" logger
    logger.propagate = True
    return logger


def get_alarm_logger() -> logging.Logger:
    """Dedicated logger that writes only to logs/alarms.log and DB."""
    logger = logging.getLogger("ultron.alarms")
    logger.propagate = False

    if logger.handlers:
        return logger

    logger.setLevel(logging.WARNING)
    formatter = logging.Formatter(_FMT, datefmt=_DATE)

    handler = RotatingFileHandler(
        LOG_DIR / "alarms.log",
        maxBytes=5 * 1024 * 1024,
        backupCount=10,
        encoding="utf-8",
    )
    handler.setLevel(logging.WARNING)
    handler.setFormatter(formatter)
    logger.addHandler(handler)

    # DB handler
    db_handler = SQLAlchemyHandler()
    db_handler.setLevel(logging.WARNING)
    logger.addHandler(db_handler)

    return logger


def get_audit_logger() -> logging.Logger:
    """Dedicated logger that writes only to logs/audit.log and DB."""
    logger = logging.getLogger("ultron.audit")
    logger.propagate = False

    if logger.handlers:
        return logger

    logger.setLevel(logging.INFO)
    formatter = logging.Formatter(_FMT, datefmt=_DATE)

    handler = RotatingFileHandler(
        LOG_DIR / "audit.log",
        maxBytes=5 * 1024 * 1024,
        backupCount=10,
        encoding="utf-8",
    )
    handler.setLevel(logging.INFO)
    handler.setFormatter(formatter)
    logger.addHandler(handler)

    # DB handler
    db_handler = SQLAlchemyHandler()
    db_handler.setLevel(logging.INFO)
    logger.addHandler(db_handler)

    return logger
