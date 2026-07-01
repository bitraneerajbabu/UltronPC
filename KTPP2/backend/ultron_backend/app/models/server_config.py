"""UltrON — Server Config ORM Model"""

from sqlalchemy import Column, Integer, String, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base

class ServerConfig(Base):
    __tablename__ = "server_config"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, index=True)
    protocol = Column(String(20), default="tspcb")      # "tspcb" | "cpcb" | "led"
    live_url = Column(String(500), nullable=True)        # TSPCB live HTTP push URL
    delay_url = Column(String(500), nullable=True)       # TSPCB delay HTTP push URL
    cpcb_file_path = Column(String(500), nullable=True)  # CPCB output file path
    is_active = Column(Boolean, default=True)
    is_cpcb_active = Column(Boolean, default=True)

    # ─── LED Board (LAN) ──────────────────────────────────────────────────────
    led_channel_id = Column(Integer, nullable=True)      # PCB/ChannelId integer (e.g. 7003)
    led_station_name = Column(String(100), nullable=True) # Station label on LED board

    mappings = relationship("ServerParameterMapping", back_populates="server", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<ServerConfig name={self.name} protocol={self.protocol}>"

class ServerParameterMapping(Base):
    __tablename__ = "server_parameter_mapping"

    id = Column(Integer, primary_key=True, index=True)
    server_id = Column(Integer, ForeignKey("server_config.id", ondelete="CASCADE"), nullable=False)
    parameter_id = Column(Integer, ForeignKey("parameters.id", ondelete="CASCADE"), nullable=False)

    is_active = Column(Boolean, default=True)
    api_id = Column(String(100), nullable=True)       # TSPCB: DeviceID  | CPCB: Station name
    api_name = Column(String(100), nullable=True)     # TSPCB: API-Name  | CPCB: unused
    api_password = Column(String(100), nullable=True) # TSPCB: Password  | CPCB: unused
    api_vname = Column(String(100), nullable=True)    # TSPCB: var-name  | CPCB: param abbreviation (CO, SO2 …)
    api_unit = Column(String(50), nullable=True)      # unit override
    cpcb_station_name = Column(String(100), nullable=True)
    cpcb_parameter = Column(String(100), nullable=True)

    # ─── LED Board (LAN) ──────────────────────────────────────────────────────
    led_channel_name = Column(String(100), nullable=True)  # Label shown on LED (e.g. "NOX", "PM10")
    led_unit = Column(String(50), nullable=True)           # Unit override for LED display

    server = relationship("ServerConfig", back_populates="mappings")
    parameter = relationship("Parameter", lazy="selectin")

    def __repr__(self):
        return f"<ServerParameterMapping server_id={self.server_id} parameter_id={self.parameter_id}>"
