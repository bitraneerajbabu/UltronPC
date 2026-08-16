"""
UltrON — Security Helpers
Provides:
  - Password hashing / verification
  - JWT access token creation / decoding
  - Refresh token creation / verification
  - Token blacklist integration
  - FastAPI dependencies: get_current_user, require_admin
"""

import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
import bcrypt
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import settings
from app.database import get_db
from app.core.logger import get_logger

log = get_logger("ultron.security")

if not settings.SECRET_KEY:
    raise ValueError(
        "SECRET_KEY is not configured. Set a valid SECRET_KEY in your environment or .env file."
    )

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def _generate_jti() -> str:
    return secrets.token_urlsafe(24)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire, "jti": _generate_jti()})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> dict:
    """Decode and validate a JWT token. Raises JWTError on failure."""
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])


# ─── Blacklist Check ─────────────────────────────────────────────────────────

async def is_token_blacklisted(token: str, db: AsyncSession) -> bool:
    """Check if a token's JTI is in the blacklist."""
    if not settings.JWT_BLACKLIST_ENABLED:
        return False
    try:
        payload = decode_token(token)
        jti = payload.get("jti")
        if not jti:
            return False
        from app.models.security import RevokedToken
        result = await db.execute(
            select(RevokedToken).where(RevokedToken.jti == jti)
        )
        return result.scalar_one_or_none() is not None
    except Exception:
        return False


# ─── FastAPI Dependencies ─────────────────────────────────────────────────────

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
):
    """
    Dependency: resolve the current authenticated user from the JWT.
    Raises 401 if token is invalid, expired, or blacklisted.
    """
    from app.models.user import User

    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not token:
        raise credentials_exc

    try:
        payload = decode_token(token)
        username: str = payload.get("sub")
        if not username:
            raise credentials_exc
    except JWTError:
        raise credentials_exc

    # Blacklist check
    if settings.JWT_BLACKLIST_ENABLED:
        try:
            blacklisted = await is_token_blacklisted(token, db)
            if blacklisted:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Token has been revoked",
                    headers={"WWW-Authenticate": "Bearer"},
                )
        except HTTPException:
            raise
        except Exception:
            pass

    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise credentials_exc

    return user


async def require_admin(current_user=Depends(get_current_user)):
    """Dependency: ensure the current user is an admin."""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user


async def require_server_mgmt(current_user=Depends(require_admin)):
    """Dependency: admin with Server Management permission (allow_server_mgmt)."""
    if not getattr(current_user, "allow_server_mgmt", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Server Management access required",
        )
    return current_user


async def require_super_admin(current_user=Depends(require_admin)):
    """Dependency: top-rank admin (SuperMaster) — full control (user mgmt, resets, firmware)."""
    if not getattr(current_user, "is_super_admin", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super admin access required",
        )
    return current_user


async def optional_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
):
    """Like get_current_user but returns None instead of 401 on missing/invalid token."""
    if not token:
        return None
    try:
        return await get_current_user(token=token, db=db)
    except HTTPException:
        return None
