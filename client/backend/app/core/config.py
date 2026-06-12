# -*- coding: utf-8 -*-
"""
Configuration Loader.
"""
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite+aiosqlite:///./local_telemetry.db"
    SUPABASE_URL: str = ""
    SUPABASE_ANON_KEY: str = ""
    
    class Config:
        env_file = ".env"

settings = Settings()\n