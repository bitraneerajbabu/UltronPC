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

LOG_DIR = Path("./logs")
LOG_DIR.mkdir(parents=True, exist_ok=True)

_FMT = "%(asctime)s | %(levelname)-8s | %(name)-30s | %(message)s"
_DATE = "%Y-%m-%d %H:%M:%S"


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
    """Dedicated logger that writes only to logs/alarms.log."""
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

    return logger


def get_audit_logger() -> logging.Logger:
    """Dedicated logger that writes only to logs/audit.log."""
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

    return logger
