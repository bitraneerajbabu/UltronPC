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
    ADMIN_KEY: str = os.environ.get("ADMIN_KEY", "")

    # MQTT Broker settings (for remote commands to clients)
    MQTT_ENABLED: bool = os.environ.get("MQTT_ENABLED", "true").lower() == "true"
    MQTT_HOST: str = os.environ.get("MQTT_HOST", "localhost")
    MQTT_PORT: int = int(os.environ.get("MQTT_PORT", "1883"))
    MQTT_USER: str = os.environ.get("MQTT_USER", "")
    MQTT_PASSWORD: str = os.environ.get("MQTT_PASSWORD", "")

    model_config = SettingsConfigDict(env_file=".env")

settings = Settings()

if not settings.SECRET_KEY:
    print("WARNING: SECRET_KEY is not set in .env! Generate one with: openssl rand -hex 32", file=sys.stderr)
if not settings.ADMIN_KEY:
    print("WARNING: ADMIN_KEY is not set in .env! Set a strong admin key.", file=sys.stderr)
