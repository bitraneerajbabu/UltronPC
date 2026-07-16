"""
UltrON — Application Configuration
Loads from .env and provides typed settings for the entire app.

WARNING: This encryption is obfuscation only; the derivation key is bundled.
Only the public anon key and non-sensitive settings may be stored here.
Never store the service_role key or other true secrets.
"""

from pydantic_settings import BaseSettings
from pydantic import Field, field_validator
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
    BUNDLE_ENV = BUNDLE_DIR / ".env"
    BUNDLE_ENV_TEMPLATE = BUNDLE_DIR / ".env.template"
    BUNDLE_DB = BUNDLE_DIR / "ultron.db"
    DB_FILE = APP_DIR / "ultron.db"
    
    # If no config files exist next to the executable, copy the bundled one as default
    if not ENV_ENC_FILE.is_file() and not ENV_FILE.is_file():
        for src, dst in [(BUNDLE_ENV, ENV_FILE), (BUNDLE_ENV_ENC, ENV_ENC_FILE)]:
            if src.is_file() and not dst.is_file():
                try:
                    import shutil
                    shutil.copy2(str(src), str(dst))
                    print(f"[UltrON] Copied default template configuration to {dst.name}", file=sys.stderr)
                except Exception as copy_err:
                    print(f"[UltrON] Failed to copy template configuration: {copy_err}", file=sys.stderr)
        # Fallback: use .env.template if no .env was bundled (keeps secrets out of build)
        if not ENV_FILE.is_file() and BUNDLE_ENV_TEMPLATE.is_file():
            try:
                import shutil
                shutil.copy2(str(BUNDLE_ENV_TEMPLATE), str(ENV_FILE))
                print(f"[UltrON] Copied .env.template as default configuration (set RAJAPI_API_KEY before use)", file=sys.stderr)
            except Exception as copy_err:
                print(f"[UltrON] Failed to copy .env.template: {copy_err}", file=sys.stderr)
    
    # Copy bundled DB template to APP_DIR on first run (fresh install)
    if not DB_FILE.is_file() and BUNDLE_DB.is_file():
        try:
            import shutil
            shutil.copy2(str(BUNDLE_DB), str(DB_FILE))
            print(f"[UltrON] Extracted bundled database to {DB_FILE.name}", file=sys.stderr)
        except Exception as copy_err:
            print(f"[UltrON] Failed to extract bundled database: {copy_err}", file=sys.stderr)


def _recover_config(is_frozen: bool, env_file: Path, env_enc_file: Path, app_dir: Path, bundled_env_enc: Path | None, bundled_env: Path | None = None) -> None:
    """Attempt to recover configuration when .env.enc is missing or corrupted.

    Tries bundled copy (frozen mode), then plain .env, then .env.bak,
    then bundled plain .env.
    If a plain config is found, it re-encrypts to .env.enc for next boot.
    """
    recovered = False
    # 1. Frozen mode: try bundled .env.enc from _MEIPASS
    if is_frozen and bundled_env_enc is not None and bundled_env_enc.is_file():
        try:
            import shutil
            shutil.copy2(str(bundled_env_enc), str(env_enc_file))
            print(f"[UltrON] Replaced missing/corrupted .env.enc with bundled version.", file=sys.stderr)
            from app.core.config_crypt import decrypt_file_to_string
            decrypted_content = decrypt_file_to_string(str(env_enc_file))
            config_dict = dotenv.dotenv_values(stream=io.StringIO(decrypted_content))
            for k, v in config_dict.items():
                if v is not None:
                    os.environ[k] = v
            recovered = True
        except Exception as retry_err:
            print(f"[UltrON] Bundled .env.enc recovery failed: {retry_err}", file=sys.stderr)
    # 2. Fallback to plain config file and re-encrypt
    if not recovered:
        for fallback in (env_file, app_dir / ".env.bak"):
            if fallback.is_file():
                try:
                    config_dict = dotenv.dotenv_values(str(fallback))
                    for k, v in config_dict.items():
                        if v is not None:
                            os.environ[k] = v
                    try:
                        from app.core.config_crypt import encrypt_file, secure_delete_file
                        encrypt_file(str(fallback), str(env_enc_file))
                        if is_frozen:
                            secure_delete_file(str(fallback))
                        print(f"[UltrON] Re-encrypted config from {fallback.name} -> .env.enc", file=sys.stderr)
                    except Exception as enc_err:
                        print(f"[UltrON] Could not re-encrypt config: {enc_err}", file=sys.stderr)
                    recovered = True
                    break
                except Exception as fb_err:
                    print(f"[UltrON] Fallback {fallback.name} failed: {fb_err}", file=sys.stderr)
    # 3. Frozen fallback: try bundled plain .env or .env.template (portable across machines)
    if not recovered and is_frozen:
        bundled_sources = [bundled_env]
        if bundled_env and bundled_env.parent:
            bundled_sources.append(bundled_env.parent / ".env.template")
        for bundled_cfg in bundled_sources:
            if bundled_cfg is not None and bundled_cfg.is_file():
                try:
                    import shutil
                    shutil.copy2(str(bundled_cfg), str(env_file))
                    print(f"[UltrON] Copied bundled {bundled_cfg.name} to APP_DIR.", file=sys.stderr)
                    config_dict = dotenv.dotenv_values(str(env_file))
                    for k, v in config_dict.items():
                        if v is not None:
                            os.environ[k] = v
                    try:
                        from app.core.config_crypt import encrypt_file, secure_delete_file
                        encrypt_file(str(env_file), str(env_enc_file))
                        secure_delete_file(str(env_file))
                        print(f"[UltrON] Re-encrypted config from bundled {bundled_cfg.name} -> .env.enc", file=sys.stderr)
                    except Exception as enc_err:
                        print(f"[UltrON] Could not re-encrypt: {enc_err}", file=sys.stderr)
                    recovered = True
                    break
                except Exception as fb_err:
                    print(f"[UltrON] Bundled {bundled_cfg.name} fallback failed: {fb_err}", file=sys.stderr)
    if not recovered:
        print("[UltrON] WARNING: No valid configuration found. Using defaults.", file=sys.stderr)


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
        config_dict = dotenv.dotenv_values(stream=io.StringIO(decrypted_content))
        for k, v in config_dict.items():
            if v is not None:
                os.environ[k] = v
    except Exception as e:
        print(f"[UltrON] Error loading/decrypting .env.enc: {e}", file=sys.stderr)
        _recover_config(IS_FROZEN, ENV_FILE, ENV_ENC_FILE, APP_DIR, BUNDLE_ENV_ENC if IS_FROZEN else None, BUNDLE_ENV if IS_FROZEN else None)
else:
    # No .env.enc — try plain .env or .env.bak, then re-encrypt
    _recover_config(IS_FROZEN, ENV_FILE, ENV_ENC_FILE, APP_DIR, BUNDLE_ENV_ENC if IS_FROZEN else None, BUNDLE_ENV if IS_FROZEN else None)





def _load_or_create_secret_key() -> str:
    """
    Return a stable secret key that persists across restarts.

    On first launch the key is generated with secrets.token_urlsafe(32) and
    written to  <APP_DIR>/secret.key  (next to the EXE in frozen mode, or next
    to the package root in dev mode).  Subsequent launches read the file, so
    all previously issued JWT tokens remain valid.

    Falls back to a fresh random key if the file cannot be read or written
    (e.g. read-only filesystem) — this matches the old behaviour.
    """
    key_file = APP_DIR / "secret.key"
    try:
        if key_file.is_file():
            key = key_file.read_text(encoding="utf-8").strip()
            if key:
                return key
        # Generate a new key and persist it
        key = secrets.token_urlsafe(32)
        key_file.write_text(key, encoding="utf-8")
        return key
    except Exception as e:
        print(f"[UltrON] Could not persist secret key ({e}) — using ephemeral key.", file=sys.stderr)
        return secrets.token_urlsafe(32)


class Settings(BaseSettings):

    # ─── App ─────────────────────────────────────────────────
    APP_NAME: str = "UltrON"
    APP_VERSION: str = "1.0.70.3"
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
    SECRET_KEY: str = Field(default_factory=lambda: _load_or_create_secret_key())
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 5256000  # 10 years — effectively never expires
    ADMIN_USERNAME: str = Field(default="Master")
    ADMIN_PASSWORD: str = Field(default="")

    @field_validator("SECRET_KEY", mode="before")
    @classmethod
    def validate_secret_key(cls, v):
        if not v or str(v).strip() == "":
            return _load_or_create_secret_key()
        return v

    @field_validator("APP_VERSION", mode="before")
    @classmethod
    def validate_app_version(cls, v):
        return cls.model_fields["APP_VERSION"].default

    # ─── WebSocket ────────────────────────────────────────────
    WS_LIVE_PUSH_INTERVAL: int = 5

    # ─── RajAPI URLs (movable to .env; defaults for backward compatibility) ────
    RAJAPI_SYNC_URL: str = "https://rajapi.com/api/v1/heartbeat"
    RAJAPI_COMMANDS_URL: str = "https://rajapi.com/api/v1/commands/pending"
    CENTRAL_API_URL: str = "https://rajapi.com/api/v1/sync/"

    # ─── RajAPI Central Sync (background, invisible to user) ────
    RAJAPI_API_KEY: str = ""                  # Legacy API key — kept for backward compatibility
    RAJAPI_SYNC_ENABLED: bool = True

    RAJAPI_STATION_ID: str = "default_station"  # Legacy station ID — kept for backward compatibility

    # Gateway ID + Device Secret (new auth model, preferred over RAJAPI_API_KEY)
    GATEWAY_ID: str = ""
    DEVICE_SECRET: str = ""

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

    # ─── Security ────────────────────────────────────────────────────
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    MAX_FAILED_LOGIN_ATTEMPTS: int = 5
    ACCOUNT_LOCKOUT_MINUTES: int = 15
    PASSWORD_MIN_LENGTH: int = 8
    PASSWORD_REQUIRE_UPPERCASE: bool = True
    PASSWORD_REQUIRE_LOWERCASE: bool = True
    PASSWORD_REQUIRE_DIGIT: bool = True
    PASSWORD_REQUIRE_SPECIAL: bool = True
    PASSWORD_HISTORY_COUNT: int = 5
    SESSION_TIMEOUT_MINUTES: int = 0
    JWT_BLACKLIST_ENABLED: bool = True

    EMAIL_ENABLED: bool = False
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    ALERT_RECIPIENTS: str = ""

    # ─── LED Board LAN Endpoint ───────────────────────────────────
    # Auth is validated against active user usernames in the DB.
    # LED_AUTH_TOKEN in .env can override as a static fallback if needed.
    LED_AUTH_TOKEN: str = ""
    # Port for the dedicated LED board HTTP server (default 80 for LAN cards)
    # Set LED_HTTP_PORT=0 to disable the secondary LED server.
    LED_HTTP_PORT: int = 80

    class Config:
        # Overrides loading of unencrypted .env if .env.enc exists and was already loaded
        env_file = None if os.path.exists(str(APP_DIR / ".env.enc")) else str(APP_DIR / ".env")
        env_file_encoding = "utf-8"
        case_sensitive = False
        extra = "ignore"

    def model_post_init(self, __context):
        if not self.ADMIN_PASSWORD:
            print(
                "[UltrON] FATAL: ADMIN_PASSWORD is not set in .env! "
                "Set a strong password before starting the server.",
                file=sys.stderr,
            )
            sys.exit(1)

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


