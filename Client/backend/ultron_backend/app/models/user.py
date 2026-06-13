"""UltrON — User ORM Model"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id          = Column(Integer, primary_key=True, index=True)
    username    = Column(String(80), unique=True, nullable=False, index=True)
    hashed_password = Column(String(200), nullable=False)
    role        = Column(String(20), default="client")   # "admin" | "client"
    full_name   = Column(String(150), nullable=True)
    is_active   = Column(Boolean, default=True)
    created_at  = Column(DateTime, default=datetime.utcnow)
    created_by  = Column(String(80), nullable=True)      # username of creator
    last_login  = Column(DateTime, nullable=True)

    def __repr__(self):
        return f"<User id={self.id} username={self.username} role={self.role}>"
