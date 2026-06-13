"""UltrON — Pydantic Schemas for User & Auth"""

from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, Literal


# ─── Login ────────────────────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    username: str
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    username: str
    full_name: Optional[str] = None


# ─── User Schemas ─────────────────────────────────────────────────────────────
class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=80)
    password: str = Field(..., min_length=4, max_length=100)
    role: Literal["admin", "client"] = "client"
    full_name: Optional[str] = Field(None, max_length=150)
    is_active: bool = True


class UserUpdate(BaseModel):
    password: Optional[str] = Field(None, min_length=4, max_length=100)
    full_name: Optional[str] = Field(None, max_length=150)
    is_active: Optional[bool] = None
    role: Optional[Literal["admin", "client"]] = None


class UserOut(BaseModel):
    id: int
    username: str
    role: str
    full_name: Optional[str] = None
    is_active: bool
    created_at: datetime
    created_by: Optional[str] = None
    last_login: Optional[datetime] = None

    class Config:
        from_attributes = True
