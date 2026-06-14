"""
UltrON — Application Configuration
Loads from .env and provides typed settings for the entire app.

WARNING: This encryption is obfuscation only; the derivation key is bundled.
Only the public anon key and non-sensitive settings may be stored here.
Never store the service_role key or other true secrets.
"""

from pydantic_settings import BaseSettings
from pydantic import Field
from typing import Optional
import os
import sys
import io
import secrets
from pathlib import Path
import dotenv

# ─── Load Encrypted Settings if Present ──────────────────────────────────────
IS_FROZEN = getattr(sys, "frozen", False)

# Resolve execution directory containing config files
if IS_FROZEN:
    APP_DIR = Path(sys.executable).parent.resolve()
else:
    # Use parent of the app package (ultron_backend/)
    APP_DIR = Path(__file__).parent.parent.resolve()

ENV_FILE = APP_DIR / ".env"
ENV_ENC_FILE = APP_DIR / ".env.enc"

# If frozen, a default .env.enc is bundled inside _MEIPASS (the _internal/ folder)
if IS_FROZEN:
    BUNDLE_DIR = Path(sys._MEIPASS).resolve()
    BUNDLE_ENV_ENC = BUNDLE_DIR / ".env.enc"
    
    # If no config files exist next to the executable, copy the bundled one as default
    if not ENV_ENC_FILE.is_file() and not ENV_FILE.is_file() and BUNDLE_ENV_ENC.is_file():
        try:
            import shutil
            shutil.copy2(str(BUNDLE_ENV_ENC), str(ENV_ENC_FILE))
            print(f"[UltrON] Copied default template configuration to {ENV_ENC_FILE.name}", file=sys.stderr)
        except Exception as copy_err:
            print(f"[UltrON] Failed to copy template configuration: {copy_err}", file=sys.stderr)

if ENV_FILE.is_file() and IS_FROZEN:
    # Auto-encrypt unencrypted .env in packaged mode for security
    try:
        from app.core.config_crypt import encrypt_file, secure_delete_file, decrypt_file_to_string
        print(f"[UltrON] Auto-encrypting plaintext configuration file {ENV_FILE.name}...", file=sys.stderr)
        encrypt_file(str(ENV_FILE), str(ENV_ENC_FILE))
        
        # Verify the newly encrypted file is valid and can be decrypted
        try:
            decrypted_content = decrypt_file_to_string(str(ENV_ENC_FILE))
            if not decrypted_content:
                raise ValueError("Decrypted content is empty")
        except Exception as verify_err:
            raise RuntimeError(f"Verification of encrypted file failed: {verify_err}")
            
        # Securely delete the original plain file and any existing .env.bak
        secure_delete_file(str(ENV_FILE))
        secure_delete_file(str(ENV_FILE.parent / ".env.bak"))
        print(f"[UltrON] Secured configuration! Plaintext file has been securely overwritten and removed.", file=sys.stderr)
        
        # Load from the newly encrypted file
        config_dict = dotenv.dotenv_values(stream=io.StringIO(decrypted_content))
        for k, v in config_dict.items():
            if v is not None:
                os.environ[k] = v
    except Exception as e:
        print(f"[UltrON] Error during auto-encryption of .env: {e}", file=sys.stderr)
elif ENV_ENC_FILE.is_file():
    try:
        from app.core.config_crypt import decrypt_file_to_string
        decrypted_content = decrypt_file_to_string(str(ENV_ENC_FILE))
        # Parse and inject into os.environ
        config_dict = dotenv.dotenv_values(stream=io.StringIO(decrypted_content))
        for k, v in config_dict.items():
            if v is not None:
                os.environ[k] = v
    except Exception as e:
        print(f"[UltrON] Error loading/decrypting .env.enc: {e}", file=sys.stderr)



class Settings(BaseSettings):
    # ─── App ─────────────────────────────────────────────────
    APP_NAME: str = "UltrON"
    APP_VERSION: str = "1.0.1"
    DEBUG: bool = False
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    CORS_ALLOW_ORIGINS: str = (
        "http://localhost:8000,"
        "http://127.0.0.1:8000,"
        "http://localhost:5173,"
        "http://127.0.0.1:5173"
    )
    # ─── Database ───────────────────────────
    DB_TYPE: str = "sqlite"
    DB_HOST: str = "localhost"
    DB_PORT: int = 5432
    DB_USER: str = "postgres"
    DB_PASSWORD: str = ""
    DB_NAME: str = "ultron"

    @property
    def DATABASE_URL(self) -> str:
        if self.DB_TYPE == "postgresql":
            return f"postgresql+asyncpg://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
        return f"sqlite+aiosqlite:///{APP_DIR}/ultron.db"

    @property
    def SYNC_DATABASE_URL(self) -> str:
        if self.DB_TYPE == "postgresql":
            return f"postgresql://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
        return f"sqlite:///{APP_DIR}/ultron.db"

    # ─── Security ─────────────────────────────────────────────
    SECRET_KEY: str = Field(default_factory=lambda: secrets.token_urlsafe(32))
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
        # Overrides loading of unencrypted .env if .env.enc exists and was already loaded
        env_file = None if os.path.exists(str(APP_DIR / ".env.enc")) else ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False

    def ensure_dirs(self):
        """Create all required storage directories on startup."""
        for d in [self.REPORTS_DIR, self.LOGS_DIR, self.BACKUPS_DIR, self.UPLOADS_DIR]:
            os.makedirs(d, exist_ok=True)

    @property
    def cors_allow_origins(self) -> list[str]:
        """Return configured CORS origins as a clean list."""
        return [
            origin.strip()
            for origin in self.CORS_ALLOW_ORIGINS.split(",")
            if origin.strip()
        ]


# Singleton instance — import this everywhere
settings = Settings()
