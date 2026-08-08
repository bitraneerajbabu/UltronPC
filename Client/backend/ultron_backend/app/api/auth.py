"""
UltrON — Auth API
Provides login (with lockout protection), token refresh (with rotation),
logout (with revocation), password change (with history), and session management.
"""

import hmac
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.database import get_db
from app.models.user import User
from app.models.security import RefreshToken, SecurityEvent, LoginAttempt
from app.schemas.user import (
    LoginRequest, Token, RefreshRequest, RefreshResponse,
    ChangePasswordRequest, UserOut, SecurityEventOut, ActiveSession,
)
from app.core.security import (
    verify_password,
    create_access_token,
    decode_token,
    get_current_user,
    require_admin,
    hash_password,
)
from app.core.logger import get_logger, get_audit_logger
from app.config import settings
from app.services.security_service import (
    validate_password_complexity,
    check_password_history,
    record_password_history,
    create_refresh_token_value,
    store_refresh_token,
    consume_refresh_token,
    revoke_user_refresh_tokens,
    blacklist_jwt,
    check_account_locked,
    record_failed_login,
    reset_login_attempts,
    log_security_event_db,
    _hash_token,
)

log = get_logger("ultron.auth")
audit = get_audit_logger()
router = APIRouter(prefix="/auth", tags=["Authentication"])


def _get_client_info(request: Request) -> tuple[Optional[str], Optional[str]]:
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    return ip, ua


# ─── Setup Override ──────────────────────────────────────────────────────────
class SetupOverrideRequest:
    """Backward-compatible setup override request."""
    def __init__(self, username: str = "", password: str = ""):
        self.username = username
        self.password = password


@router.post("/setup-override")
async def setup_override(payload: dict):
    """Validate setup override credentials server-side against ADMIN_PASSWORD."""
    expected_password = settings.ADMIN_PASSWORD.encode("utf-8")
    provided_password = payload.get("password", "").encode("utf-8")
    password_match = hmac.compare_digest(provided_password, expected_password)
    username = payload.get("username", "")
    username_match = username == "token" or username == settings.ADMIN_USERNAME
    if username_match and password_match:
        audit.info(f"Setup override successful: username='{username}'")
        return {"success": True}
    audit.warning(f"Failed setup override attempt: username='{username}'")
    return JSONResponse(
        {"success": False, "detail": "Invalid setup credentials."},
        status_code=401,
    )


# ─── Login ──────────────────────────────────────────────────────────────────
@router.post("/login", response_model=Token)
async def login(
    payload: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    ip_address, user_agent = _get_client_info(request)

    result = await db.execute(select(User).where(User.username == payload.username))
    user = result.scalar_one_or_none()

    # Invalid credentials
    if not user or not verify_password(payload.password, user.hashed_password):
        audit.warning(f"Failed login attempt for username='{payload.username}' ip='{ip_address}'")
        if user:
            await record_failed_login(db, payload.username, ip_address, user_agent)
        else:
            attempt = LoginAttempt(
                username=payload.username,
                success=False,
                ip_address=ip_address,
                user_agent=user_agent,
            )
            db.add(attempt)
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Password is valid — check account state (same 401 response to
    # prevent username enumeration via distinct status codes)
    locked_reason = await check_account_locked(user)
    if locked_reason or not user.is_active:
        audit.warning(f"Blocked login: username='{payload.username}' reason='locked_or_disabled' ip='{ip_address}'")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Success — reset attempts, update login time
    await reset_login_attempts(db, user)
    user.last_login = datetime.now(timezone.utc)
    await db.flush()

    # Issue tokens
    access_token = create_access_token({"sub": user.username, "role": user.role})
    refresh_token_value = create_refresh_token_value()
    await store_refresh_token(db, user.id, refresh_token_value, ip_address, user_agent)
    await db.commit()

    await log_security_event_db(
        db, "login_success", "info",
        user_id=user.id, username=user.username, ip_address=ip_address,
        details=f"Login from {ip_address or 'unknown'}",
    )
    audit.info(f"Login success: username='{user.username}' role='{user.role}' ip='{ip_address}'")
    log.info(f"User '{user.username}' ({user.role}) logged in")

    return Token(
        access_token=access_token,
        token_type="bearer",
        role=user.role,
        username=user.username,
        full_name=user.full_name,
        allow_server_mgmt=user.allow_server_mgmt,
        refresh_token=refresh_token_value,
    )


# ─── Token Refresh (with rotation) ─────────────────────────────────────────
@router.post("/refresh", response_model=RefreshResponse)
async def refresh_token(
    payload: RefreshRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    ip_address, user_agent = _get_client_info(request)

    consumed = await consume_refresh_token(db, payload.refresh_token)
    if not consumed:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    result = await db.execute(select(User).where(User.id == consumed.user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is disabled or removed",
        )

    # Rotation: issue new tokens, old refresh token already consumed
    new_access_token = create_access_token({"sub": user.username, "role": user.role})
    new_refresh_value = create_refresh_token_value()
    await store_refresh_token(
        db, user.id, new_refresh_value, ip_address, user_agent,
        replace_token_id=consumed.id,
    )
    await db.commit()

    await log_security_event_db(
        db, "token_refreshed", "info",
        user_id=user.id, username=user.username, ip_address=ip_address,
    )

    return RefreshResponse(
        access_token=new_access_token,
        refresh_token=new_refresh_value,
    )


# ─── Logout ────────────────────────────────────────────────────────────────
@router.post("/logout")
async def logout(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ip_address, _ = _get_client_info(request)

    # Get the token from Authorization header to blacklist it
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        await blacklist_jwt(db, token)

    # Revoke all refresh tokens for this user
    await revoke_user_refresh_tokens(db, current_user.id)
    await db.commit()

    await log_security_event_db(
        db, "logout", "info",
        user_id=current_user.id, username=current_user.username, ip_address=ip_address,
    )
    audit.info(f"Logout: username='{current_user.username}' ip='{ip_address}'")
    log.info(f"User '{current_user.username}' logged out")

    return {"message": "Logged out successfully"}


# ─── Logout All Sessions ──────────────────────────────────────────────────
@router.post("/logout-all")
async def logout_all(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ip_address, _ = _get_client_info(request)

    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        await blacklist_jwt(db, token)

    await revoke_user_refresh_tokens(db, current_user.id)
    await db.commit()

    await log_security_event_db(
        db, "logout_all", "info",
        user_id=current_user.id, username=current_user.username, ip_address=ip_address,
    )
    audit.info(f"Logout all sessions: username='{current_user.username}'")
    return {"message": "All sessions logged out successfully"}


# ─── Change Password ──────────────────────────────────────────────────────
@router.post("/change-password")
async def change_password(
    payload: ChangePasswordRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ip_address, _ = _get_client_info(request)

    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    complexity_errors = validate_password_complexity(payload.new_password)
    if complexity_errors:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="; ".join(complexity_errors),
        )

    history_ok = await check_password_history(db, current_user.id, payload.new_password)
    if not history_ok:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot reuse any of the last {settings.PASSWORD_HISTORY_COUNT} passwords",
        )

    new_hash = hash_password(payload.new_password)
    current_user.hashed_password = new_hash
    current_user.password_changed_at = datetime.now(timezone.utc)
    current_user.require_password_change = False

    # Record to history
    await record_password_history(db, current_user.id, new_hash)

    # Revoke all other sessions (force re-login everywhere)
    await revoke_user_refresh_tokens(db, current_user.id)

    # Blacklist current token
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        await blacklist_jwt(db, auth_header[7:])

    await db.commit()

    await log_security_event_db(
        db, "password_changed", "info",
        user_id=current_user.id, username=current_user.username, ip_address=ip_address,
    )
    audit.info(f"Password changed: username='{current_user.username}'")
    return {"message": "Password changed successfully. Other sessions have been terminated."}


# ─── Me ──────────────────────────────────────────────────────────────────
@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(get_current_user)):
    """Return the currently authenticated user's profile."""
    return current_user


# ─── List Active Sessions ───────────────────────────────────────────────
@router.get("/sessions", response_model=list[ActiveSession])
async def list_sessions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List active refresh token sessions for the current user."""
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.user_id == current_user.id,
            RefreshToken.revoked_at.is_(None),
            RefreshToken.expires_at > datetime.utcnow(),
        ).order_by(RefreshToken.created_at.desc())
    )
    sessions = result.scalars().all()
    return [
        ActiveSession(
            id=s.id,
            created_at=s.created_at,
            expires_at=s.expires_at,
            ip_address=s.ip_address,
            user_agent=s.user_agent,
        )
        for s in sessions
    ]


# ─── Revoke Specific Session ────────────────────────────────────────────
@router.post("/sessions/{session_id}/revoke")
async def revoke_session(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Revoke a specific refresh token session."""
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.id == session_id,
            RefreshToken.user_id == current_user.id,
        )
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=404, detail="Session not found")

    token.revoked_at = datetime.utcnow()
    await db.commit()

    await log_security_event_db(
        db, "session_revoked", "info",
        user_id=current_user.id, username=current_user.username,
        details=f"Session {session_id} revoked",
    )
    return {"message": "Session revoked"}


# ─── Security Events (admin) ────────────────────────────────────────────
@router.get("/events", response_model=list[SecurityEventOut])
async def list_security_events(
    limit: int = 50,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """List recent security events (admin only)."""
    from app.models.security import SecurityEvent as SEC
    result = await db.execute(
        select(SEC).order_by(SEC.created_at.desc()).limit(limit)
    )
    return result.scalars().all()
