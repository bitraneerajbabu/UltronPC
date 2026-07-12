"""UltrON — Security ORM Models (Refresh Tokens, Blacklist, Login Attempts, Events)"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey
from app.database import Base


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id          = Column(Integer, primary_key=True, index=True)
    user_id     = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash  = Column(String(128), unique=True, nullable=False, index=True)
    expires_at  = Column(DateTime, nullable=False)
    revoked_at  = Column(DateTime, nullable=True)
    replaced_by = Column(String(128), nullable=True)
    created_at  = Column(DateTime, default=datetime.utcnow)
    user_agent  = Column(String(500), nullable=True)
    ip_address  = Column(String(45), nullable=True)

    @property
    def is_revoked(self) -> bool:
        return self.revoked_at is not None

    @property
    def is_expired(self) -> bool:
        return datetime.utcnow() > self.expires_at

    def __repr__(self):
        return f"<RefreshToken id={self.id} user_id={self.user_id} revoked={self.is_revoked}>"


class RevokedToken(Base):
    """JWT blacklist — stores revoked access token JTIs until they expire."""
    __tablename__ = "revoked_tokens"

    id         = Column(Integer, primary_key=True, index=True)
    jti        = Column(String(128), unique=True, nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False)
    revoked_at = Column(DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<RevokedToken jti={self.jti[:16]}...>"


class PasswordHistory(Base):
    __tablename__ = "password_history"

    id            = Column(Integer, primary_key=True, index=True)
    user_id       = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    password_hash = Column(String(200), nullable=False)
    created_at    = Column(DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<PasswordHistory user_id={self.user_id} created_at={self.created_at}>"


class LoginAttempt(Base):
    __tablename__ = "login_attempts"

    id           = Column(Integer, primary_key=True, index=True)
    username     = Column(String(80), nullable=False, index=True)
    success      = Column(Boolean, nullable=False)
    ip_address   = Column(String(45), nullable=True)
    user_agent   = Column(String(500), nullable=True)
    attempted_at = Column(DateTime, default=datetime.utcnow, index=True)

    def __repr__(self):
        return f"<LoginAttempt username={self.username} success={self.success}>"


class SecurityEvent(Base):
    __tablename__ = "security_events"

    id          = Column(Integer, primary_key=True, index=True)
    event_type  = Column(String(50), nullable=False, index=True)
    severity    = Column(String(10), nullable=False, default="info")
    user_id     = Column(Integer, nullable=True)
    username    = Column(String(80), nullable=True)
    ip_address  = Column(String(45), nullable=True)
    details     = Column(Text, nullable=True)
    created_at  = Column(DateTime, default=datetime.utcnow, index=True)

    def __repr__(self):
        return f"<SecurityEvent type={self.event_type} severity={self.severity}>"
