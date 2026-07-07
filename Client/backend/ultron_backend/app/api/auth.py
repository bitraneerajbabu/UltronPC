"""
UltrON — Auth API
Provides login, logout, and current-user endpoints.
"""

import hmac
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.database import get_db
from app.models.user import User
from app.schemas.user import LoginRequest, Token, UserOut
from app.core.security import (
    verify_password,
    create_access_token,
    get_current_user,
    blacklist_token,
    oauth2_scheme,
)
from app.core.logger import get_logger, get_audit_logger
from app.config import settings

log = get_logger("ultron.auth")
audit = get_audit_logger()
limiter = Limiter(key_func=get_remote_address)
router = APIRouter(prefix="/auth", tags=["Authentication"])


# ─── Setup Override ────────────────────────────────────────────────────────────
class SetupOverrideRequest(BaseModel):
    username: str
    password: str


@router.post("/setup-override")
@limiter.limit("5/minute")
async def setup_override(request: Request, payload: SetupOverrideRequest):
    """Validate setup override credentials server-side against ADMIN_PASSWORD."""
    expected_password = settings.ADMIN_PASSWORD.encode("utf-8")
    provided_password = payload.password.encode("utf-8")
    password_match = hmac.compare_digest(provided_password, expected_password)
    username_match = payload.username == "token" or payload.username == settings.ADMIN_USERNAME
    if username_match and password_match:
        audit.info(f"Setup override successful: username='{payload.username}'")
        return {"success": True}
    audit.warning(f"Failed setup override attempt: username='{payload.username}'")
    return JSONResponse(
        {"success": False, "detail": "Invalid setup credentials."},
        status_code=401,
    )


# ─── Login ────────────────────────────────────────────────────────────────────
@router.post("/login", response_model=Token)
@limiter.limit("5/minute")
async def login(request: Request, payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == payload.username))
    user = result.scalar_one_or_none()

    if not user or not verify_password(payload.password, user.hashed_password):
        audit.warning(f"Failed login attempt for username='{payload.username}'")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled. Contact your administrator.",
        )

    # Update last_login
    user.last_login = datetime.now(timezone.utc)
    await db.commit()

    token = create_access_token({"sub": user.username, "role": user.role})
    audit.info(f"Login success: username='{user.username}' role='{user.role}'")
    log.info(f"User '{user.username}' ({user.role}) logged in")

    return Token(
        access_token=token,
        token_type="bearer",
        role=user.role,
        username=user.username,
        full_name=user.full_name,
    )


# ─── Logout ───────────────────────────────────────────────────────────────────
@router.post("/logout")
async def logout(
    token: str = Depends(oauth2_scheme),
    current_user: User = Depends(get_current_user),
):
    """Blacklist the current JWT token (server-side logout)."""
    blacklist_token(token)
    audit.info(f"Logout: username='{current_user.username}'")
    log.info(f"User '{current_user.username}' logged out")
    return {"message": "Logged out successfully"}


# ─── Me ───────────────────────────────────────────────────────────────────────
@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(get_current_user)):
    """Return the currently authenticated user's profile."""
    return current_user
