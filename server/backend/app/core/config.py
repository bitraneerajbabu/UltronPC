import os
import sys
from pydantic_settings import BaseSettings, SettingsConfigDict

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

    # Admin key for protected endpoints (site creation, deletion)
    # Set ADMIN_KEY in server .env — must match what's in client_manager.py
    ADMIN_KEY: str = os.environ.get("ADMIN_KEY", "")

    model_config = SettingsConfigDict(env_file=".env")

settings = Settings()

if not settings.SECRET_KEY:
    print("WARNING: SECRET_KEY is not set in .env! Generate one with: openssl rand -hex 32", file=sys.stderr)
if not settings.DATABASE_URL:
    print("WARNING: DATABASE_URL is not set in .env! Using default localhost.", file=sys.stderr)
    settings.DATABASE_URL = "postgresql://ultron_admin:changeme@127.0.0.1:5432/ultron_central"
if not settings.ADMIN_KEY:
    print("WARNING: ADMIN_KEY is not set in .env! Using insecure default.", file=sys.stderr)
    settings.ADMIN_KEY = "changeme"
