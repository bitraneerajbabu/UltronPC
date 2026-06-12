"""
UltrON — Application Configuration
Loads from .env and provides typed settings for the entire app.
"""

from pydantic_settings import BaseSettings
from pydantic import field_validator
from typing import Optional
import os


class Settings(BaseSettings):
    # ─── App ─────────────────────────────────────────────────
    APP_NAME: str = "UltrON"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # ─── Database ─────────────────────────────────
    DB_TYPE: str = "sqlite"   # 'sqlite' | 'postgresql'
    DB_PATH: str = "./ultron.db"  # used when DB_TYPE=sqlite
    DB_USER: str = "ultron"
    DB_PASSWORD: str = "ultron"
    DB_HOST: str = "localhost"
    DB_PORT: int = 5432
    DB_NAME: str = "ultron_db"

    @property
    def DATABASE_URL(self) -> str:
        if self.DB_TYPE == "sqlite":
            # aiosqlite uses 3 slashes for relative path, 4 for absolute
            return f"sqlite+aiosqlite:///{self.DB_PATH}"
        return f"postgresql+asyncpg://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"

    @property
    def SYNC_DATABASE_URL(self) -> str:
        if self.DB_TYPE == "sqlite":
            return f"sqlite:///{self.DB_PATH}"
        return f"postgresql+psycopg2://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"

    # ─── Security ─────────────────────────────────────────────
    SECRET_KEY: str = "ultron-super-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    ADMIN_USERNAME: str = "Master"
    ADMIN_PASSWORD: str = "Ultron123.0"

    # ─── WebSocket ────────────────────────────────────────────
    WS_LIVE_PUSH_INTERVAL: int = 5

    # ─── Polling Engine ───────────────────────────────────────
    POLLING_DEFAULT_INTERVAL: int = 60
    POLLING_MAX_RETRIES: int = 3
    POLLING_RETRY_DELAY: int = 5

    # ─── Averaging ────────────────────────────────────────────
    AVG_1MIN: bool = True
    AVG_5MIN: bool = True
    AVG_15MIN: bool = True
    AVG_1HR: bool = True
    AVG_8HR: bool = True
    AVG_DAILY: bool = True

    # ─── Alarm Engine ─────────────────────────────────────────
    ALARM_CHECK_INTERVAL: int = 30

    # ─── Storage Directories ──────────────────────────────────
    REPORTS_DIR: str = "./reports"
    LOGS_DIR: str = "./logs"
    BACKUPS_DIR: str = "./backups"
    UPLOADS_DIR: str = "./uploads"

    # ─── Security ────────────────────────────────────────────────
    EMAIL_ENABLED: bool = False
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    ALERT_RECIPIENTS: str = ""

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False

    def ensure_dirs(self):
        """Create all required storage directories on startup."""
        for d in [self.REPORTS_DIR, self.LOGS_DIR, self.BACKUPS_DIR, self.UPLOADS_DIR]:
            os.makedirs(d, exist_ok=True)


# Singleton instance — import this everywhere
settings = Settings()
