"""UltrON — Plant Settings ORM Model"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime
from app.database import Base


class PlantSettings(Base):
    __tablename__ = "plant_settings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    plant_name = Column(String(200), nullable=False, default="UltrON Industrial Plant")
    plant_address = Column(String(500), nullable=False, default="Industrial Zone, Block A")
    plant_logo = Column(Text, nullable=False, default="")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
