"""
UltrON — Security Helpers
Provides:
  - Password hashing / verification (bcrypt via passlib)
  - JWT access token creation / decoding (python-jose)
  - FastAPI dependencies: get_current_user, require_admin
"""

from datetime import datetime, timedelta
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

# ─── OAuth2 Scheme ────────────────────────────────────────────────────────────
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

# ─── In-memory token blacklist (for logout) ───────────────────────────────────
_blacklisted_tokens: set[str] = set()


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> dict:
    """Decode and validate a JWT token. Raises JWTError on failure."""
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])


def blacklist_token(token: str):
    _blacklisted_tokens.add(token)


def is_blacklisted(token: str) -> bool:
    return token in _blacklisted_tokens


# ─── FastAPI Dependencies ─────────────────────────────────────────────────────

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
):
    """
    Dependency: resolve the current authenticated user from the JWT.
    Raises 401 if token is invalid, expired, or blacklisted.
    """
    from app.models.user import User  # avoid circular import at module level

    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if is_blacklisted(token):
        raise credentials_exc

    try:
        payload = decode_token(token)
        username: str = payload.get("sub")
        if not username:
            raise credentials_exc
    except JWTError:
        raise credentials_exc

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


async def get_current_user_optional(
    token: Optional[str] = Depends(OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)),
    db: AsyncSession = Depends(get_db),
):
    """
    Optional auth dependency — returns None if no token is provided.
    Used for endpoints that are public but can optionally show more data when authenticated.
    """
    if not token:
        return None
    try:
        return await get_current_user(token, db)
    except HTTPException:
        return None
