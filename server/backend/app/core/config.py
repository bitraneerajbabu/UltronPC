import os
import sys
from pydantic_settings import BaseSettings, SettingsConfigDict
import bcrypt

class Settings(BaseSettings):
    PROJECT_NAME: str = "RajAPI Central Server v1.0.10"
    API_V1_STR: str = "/api/v1"
    
    # Generate a strong key for JWTs: openssl rand -hex 32
    SECRET_KEY: str = os.environ.get("SECRET_KEY", "")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7 # 7 days
    
    # Postgres Database URI
    # Default assumes postgres runs locally on the Pi
    # IMPORTANT: Set DATABASE_URL in .env for production
    DATABASE_URL: str = os.environ.get("DATABASE_URL", "")

    # Admin login credentials (username + hashed password)
    ADMIN_USERNAME: str = os.environ.get("ADMIN_USERNAME", "admin")
    ADMIN_PASSWORD: str = os.environ.get("ADMIN_PASSWORD", "Ultron@2026")

    # Admin key for protected API endpoints (site creation, deletion)
    # Set ADMIN_KEY in server .env — must match what's in client_manager.py
    ADMIN_KEY: str = os.environ.get("ADMIN_KEY", "")

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()


def _hash_admin_password() -> str:
    """Pre-hash the admin password at import time so login uses constant-time bcrypt check."""
    return bcrypt.hashpw(settings.ADMIN_PASSWORD.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


ADMIN_PASSWORD_HASH: str = _hash_admin_password()

if not settings.SECRET_KEY:
    raise RuntimeError(
        "SECRET_KEY is not set in .env! Generate one with: openssl rand -hex 32\n"
        "Add it to the .env file in the server backend directory."
    )
if not settings.DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not set in .env!\n"
        "Example: DATABASE_URL=postgresql://ultron_admin:strong_password@127.0.0.1:5432/ultron_central\n"
        "Add it to the .env file in the server backend directory."
    )
if not settings.ADMIN_KEY:
    raise RuntimeError(
        "ADMIN_KEY is not set in .env!\n"
        "Set a strong admin key and add it to the .env file in the server backend directory."
    )
