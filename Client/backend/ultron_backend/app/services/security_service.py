"""
UltrON — Security Service Layer
Business logic for refresh tokens, password validation, account lockout,
token blacklisting, and security event logging.
"""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select, delete, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.logger import get_logger, get_audit_logger
from app.models.user import User
from app.models.security import RefreshToken, RevokedToken, PasswordHistory, LoginAttempt, SecurityEvent
from app.core.security import hash_password, verify_password, create_access_token, decode_token

log = get_logger("ultron.security_service")
audit = get_audit_logger()


# ─── Password Complexity ───────────────────────────────────────────────────────

def validate_password_complexity(password: str) -> list[str]:
    """
    Validate password against configured complexity rules.
    Returns a list of failure messages (empty = valid).
    """
    errors: list[str] = []

    if len(password) < settings.PASSWORD_MIN_LENGTH:
        errors.append(f"Password must be at least {settings.PASSWORD_MIN_LENGTH} characters long")

    if settings.PASSWORD_REQUIRE_UPPERCASE and not any(c.isupper() for c in password):
        errors.append("Password must contain at least one uppercase letter")

    if settings.PASSWORD_REQUIRE_LOWERCASE and not any(c.islower() for c in password):
        errors.append("Password must contain at least one lowercase letter")

    if settings.PASSWORD_REQUIRE_DIGIT and not any(c.isdigit() for c in password):
        errors.append("Password must contain at least one digit")

    if settings.PASSWORD_REQUIRE_SPECIAL:
        special_chars = set("!@#$%^&*()_+-=[]{}|;':\",./<>?`~")
        if not any(c in special_chars for c in password):
            errors.append("Password must contain at least one special character")

    return errors


async def check_password_history(db: AsyncSession, user_id: int, new_password: str) -> bool:
    """Check if new password was used recently (within history_count)."""
    if settings.PASSWORD_HISTORY_COUNT <= 0:
        return True

    result = await db.execute(
        select(PasswordHistory)
        .where(PasswordHistory.user_id == user_id)
        .order_by(PasswordHistory.created_at.desc())
        .limit(settings.PASSWORD_HISTORY_COUNT)
    )
    recent = result.scalars().all()
    for entry in recent:
        if verify_password(new_password, entry.password_hash):
            return False
    return True


async def record_password_history(db: AsyncSession, user_id: int, password_hash: str):
    """Store a hashed password in history for future reuse checks."""
    entry = PasswordHistory(user_id=user_id, password_hash=password_hash)
    db.add(entry)


# ─── Refresh Tokens ────────────────────────────────────────────────────────────

def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _generate_jti() -> str:
    return secrets.token_urlsafe(24)


def create_refresh_token_value() -> str:
    """Generate a cryptographically random refresh token string."""
    return secrets.token_urlsafe(48)


async def store_refresh_token(
    db: AsyncSession,
    user_id: int,
    token_value: str,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    replace_token_id: Optional[int] = None,
) -> RefreshToken:
    """
    Store a refresh token in DB with optional rotation (revoke old token).
    Returns the RefreshToken row.
    """
    token_hash = _hash_token(token_value)
    expires_at = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    row = RefreshToken(
        user_id=user_id,
        token_hash=token_hash,
        expires_at=expires_at,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(row)
    await db.flush()

    # Rotation: revoke old token, link chain
    if replace_token_id:
        old = await db.get(RefreshToken, replace_token_id)
        if old and not old.is_revoked:
            old.revoked_at = datetime.utcnow()
            old.replaced_by = token_hash

    return row


async def consume_refresh_token(
    db: AsyncSession,
    token_value: str,
) -> Optional[RefreshToken]:
    """
    Validate a refresh token and mark it as consumed (rotation).
    Returns the token row if valid, None otherwise.
    """
    token_hash = _hash_token(token_value)
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.revoked_at.is_(None),
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        return None
    if row.is_expired:
        row.revoked_at = datetime.utcnow()
        await db.flush()
        return None
    return row


async def revoke_user_refresh_tokens(db: AsyncSession, user_id: int, keep_current: Optional[int] = None):
    """Revoke all refresh tokens for a user (e.g., on password change)."""
    query = select(RefreshToken).where(
        RefreshToken.user_id == user_id,
        RefreshToken.revoked_at.is_(None),
    )
    if keep_current:
        query = query.where(RefreshToken.id != keep_current)
    result = await db.execute(query)
    now = datetime.utcnow()
    for token in result.scalars().all():
        token.revoked_at = now


# ─── Token Blacklisting ────────────────────────────────────────────────────────

async def blacklist_jwt(db: AsyncSession, token: str):
    """Add a JWT's JTI to the blacklist."""
    try:
        payload = decode_token(token)
        jti = payload.get("jti")
        exp = payload.get("exp")
        if jti and exp:
            row = RevokedToken(
                jti=jti,
                expires_at=datetime.fromtimestamp(exp, tz=timezone.utc).replace(tzinfo=None),
            )
            db.add(row)
            await db.flush()
    except Exception as e:
        log.warning(f"Failed to blacklist JWT: {e}")


async def is_jwt_blacklisted(db: AsyncSession, token: str) -> bool:
    """Check if a JWT's JTI is on the blacklist."""
    try:
        payload = decode_token(token)
        jti = payload.get("jti")
        if not jti:
            return False
        result = await db.execute(
            select(RevokedToken).where(RevokedToken.jti == jti)
        )
        return result.scalar_one_or_none() is not None
    except Exception:
        return False


async def cleanup_expired_blacklist(db: AsyncSession):
    """Remove expired entries from the blacklist."""
    await db.execute(
        delete(RevokedToken).where(RevokedToken.expires_at < datetime.utcnow())
    )
    await db.execute(
        delete(RefreshToken).where(RefreshToken.expires_at < datetime.utcnow())
    )


# ─── Account Lockout ───────────────────────────────────────────────────────────

async def check_account_locked(user: User) -> Optional[str]:
    """
    Check if a user account is locked.
    Returns None if not locked, or a detail string if locked.
    """
    if not user.is_active:
        return "Account is disabled. Contact your administrator."

    if user.locked_until and datetime.utcnow() < user.locked_until:
        remaining = int((user.locked_until - datetime.utcnow()).total_seconds() // 60)
        return f"Account temporarily locked. Try again in {remaining} minute(s)."

    if user.locked_until and datetime.utcnow() >= user.locked_until:
        user.failed_login_attempts = 0
        user.locked_until = None

    return None


async def record_failed_login(db: AsyncSession, username: str, ip_address: Optional[str] = None, user_agent: Optional[str] = None):
    """Record a failed login attempt and lock account if threshold reached."""
    attempt = LoginAttempt(
        username=username,
        success=False,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(attempt)

    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if user:
        user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
        if user.failed_login_attempts >= settings.MAX_FAILED_LOGIN_ATTEMPTS:
            user.locked_until = datetime.utcnow() + timedelta(minutes=settings.ACCOUNT_LOCKOUT_MINUTES)
            _log_security_event(
                event_type="account_locked",
                severity="warning",
                user_id=user.id,
                username=username,
                ip_address=ip_address,
                details=f"Account locked after {user.failed_login_attempts} failed attempts",
            )

    await db.flush()


async def reset_login_attempts(db: AsyncSession, user: User):
    """Reset the failed login counter on successful login."""
    user.failed_login_attempts = 0
    user.locked_until = None


# ─── Security Event Logging ────────────────────────────────────────────────────

def _log_security_event(
    event_type: str,
    severity: str = "info",
    user_id: Optional[int] = None,
    username: Optional[str] = None,
    ip_address: Optional[str] = None,
    details: Optional[str] = None,
):
    """Log a security event to the file audit log."""
    parts = [f"event={event_type}", f"severity={severity}"]
    if username:
        parts.append(f"user={username}")
    if ip_address:
        parts.append(f"ip={ip_address}")
    if details:
        parts.append(details)

    message = " | ".join(parts)
    if severity == "critical":
        audit.critical(message)
    elif severity == "warning":
        audit.warning(message)
    else:
        audit.info(message)


async def log_security_event_db(
    db: AsyncSession,
    event_type: str,
    severity: str = "info",
    user_id: Optional[int] = None,
    username: Optional[str] = None,
    ip_address: Optional[str] = None,
    details: Optional[str] = None,
):
    """Record a security event in the database."""
    event = SecurityEvent(
        event_type=event_type,
        severity=severity,
        user_id=user_id,
        username=username,
        ip_address=ip_address,
        details=details,
    )
    db.add(event)
    _log_security_event(
        event_type=event_type,
        severity=severity,
        user_id=user_id,
        username=username,
        ip_address=ip_address,
        details=details,
    )


# ─── Session Timeout ───────────────────────────────────────────────────────────

async def check_session_timeout(user: User) -> bool:
    """Check if the user's session has timed out based on last activity."""
    if settings.SESSION_TIMEOUT_MINUTES <= 0:
        return True
    if not user.last_login:
        return True
    elapsed = datetime.utcnow() - user.last_login.replace(tzinfo=None)
    return elapsed.total_seconds() < (settings.SESSION_TIMEOUT_MINUTES * 60)
