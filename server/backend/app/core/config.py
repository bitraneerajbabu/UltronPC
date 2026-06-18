import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str = "RajAPI Central Server"
    API_V1_STR: str = "/api/v1"
    
    # Generate a strong key for JWTs: openssl rand -hex 32
    SECRET_KEY: str = os.environ.get("SECRET_KEY", "SUPER_SECRET_KEY_CHANGE_ME_IN_PROD")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7 # 7 days
    
    # Postgres Database URI
    # Default assumes postgres runs locally on the Pi
    DATABASE_URL: str = os.environ.get("DATABASE_URL", "postgresql://ultron_admin:my_secure_password@localhost:5432/ultron_central")

    # Admin key for protected endpoints (site creation, deletion)
    # Set ADMIN_KEY in server .env — must match what's in client_manager.py
    ADMIN_KEY: str = os.environ.get("ADMIN_KEY", "UltrON@RajAPI_Admin_2026!")

    model_config = SettingsConfigDict(env_file=".env")

settings = Settings()
