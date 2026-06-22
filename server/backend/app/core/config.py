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
    DATABASE_URL: str = os.environ.get("DATABASE_URL", "postgresql://ultron_admin:my_secure_password@127.0.0.1:5432/ultron_central")

    # Admin key for protected endpoints (site creation, deletion)
    # Set ADMIN_KEY in server .env — must match what's in client_manager.py
    ADMIN_KEY: str = os.environ.get("ADMIN_KEY", "Raj123.0")

    model_config = SettingsConfigDict(env_file=".env")

settings = Settings()

if not settings.SECRET_KEY:
    print("WARNING: SECRET_KEY is not set in .env! Generate one with: openssl rand -hex 32", file=sys.stderr)
if settings.ADMIN_KEY == "Raj123.0":
    print("WARNING: ADMIN_KEY is using default (Raj123.0). For production set via .env", file=sys.stderr)
