"""UltrON — Pydantic Schemas for User & Auth"""

from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, Literal


# ─── Login ────────────────────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=1, max_length=256)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    username: str
    full_name: Optional[str] = None
    allow_server_mgmt: Optional[bool] = None
    is_super_admin: Optional[bool] = None
    refresh_token: Optional[str] = None


# ─── Token Refresh ────────────────────────────────────────────────────────────
class RefreshRequest(BaseModel):
    refresh_token: str


class RefreshResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


# ─── Password Change ──────────────────────────────────────────────────────────
class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=1, max_length=128)


# ─── User Schemas ─────────────────────────────────────────────────────────────
class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=80)
    password: str = Field(..., min_length=1, max_length=128)
    role: Literal["admin", "client"] = "client"
    full_name: Optional[str] = Field(None, max_length=150)
    is_active: bool = True
    allow_server_mgmt: bool = True
    is_super_admin: bool = False


class UserUpdate(BaseModel):
    password: Optional[str] = Field(None, min_length=1, max_length=128)
    full_name: Optional[str] = Field(None, max_length=150)
    is_active: Optional[bool] = None
    role: Optional[Literal["admin", "client"]] = None
    allow_server_mgmt: Optional[bool] = None
    is_super_admin: Optional[bool] = None


class UserOut(BaseModel):
    id: int
    username: str
    role: str
    full_name: Optional[str] = None
    is_active: bool
    allow_server_mgmt: bool = True
    is_super_admin: bool = False
    created_at: datetime
    created_by: Optional[str] = None
    last_login: Optional[datetime] = None

    class Config:
        from_attributes = True


# ─── Security Endpoints ───────────────────────────────────────────────────────
class SecurityEventOut(BaseModel):
    id: int
    event_type: str
    severity: str
    username: Optional[str] = None
    details: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ActiveSession(BaseModel):
    id: int
    created_at: datetime
    expires_at: datetime
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None

    class Config:
        from_attributes = True
