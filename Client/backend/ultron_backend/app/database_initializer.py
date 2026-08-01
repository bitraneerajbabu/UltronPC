"""
UltrON — Centralized Database Initialization & Seeding Module
Responsible for seeding mandatory ORM default records during clean database setup.
"""

from sqlalchemy import select, func
from app.config import settings
from app.core.logger import get_logger

log = get_logger("ultron.database_initializer")


async def seed_default_station(db) -> bool:
    """
    Seed a neutral Default Station if the stations table is empty.
    Populates all required ORM fields (station_type, protocol, is_active).
    """
    from app.models.station import Station, StationType
    from app.models.device import DeviceProtocol

    res = await db.execute(select(func.count(Station.id)))
    count = res.scalar() or 0
    if count == 0:
        default_station = Station(
            name="Default Station",
            location="Plant Zone",
            station_type=StationType.AAQMS,
            protocol=DeviceProtocol.modbus_tcp.value if hasattr(DeviceProtocol.modbus_tcp, 'value') else "modbus_tcp",
            is_active=True,
        )
        db.add(default_station)
        await db.commit()
        log.info("Database Initializer: Default Station seeded via ORM model [OK]")
        return True
    return False


async def seed_default_admin(db) -> bool:
    """
    Seed mandatory Default Admin User if Master admin user is missing.
    """
    from app.models.user import User
    from app.core.security import hash_password

    res = await db.execute(select(User).where(User.username == settings.ADMIN_USERNAME))
    admin = res.scalar_one_or_none()
    if admin is None:
        admin_user = User(
            username=settings.ADMIN_USERNAME,
            hashed_password=hash_password(settings.ADMIN_PASSWORD),
            role="admin",
            full_name="System Administrator",
            is_active=True,
            created_by="system",
        )
        db.add(admin_user)
        await db.commit()
        log.info(f"Database Initializer: Admin user '{settings.ADMIN_USERNAME}' seeded via ORM model [OK]")
        return True
    return False


async def initialize_defaults():
    """
    Single centralized entry point for database default seeding.
    Invoked during init_db() execution.
    """
    try:
        from app.database import AsyncSessionLocal
        async with AsyncSessionLocal() as db:
            await seed_default_admin(db)
    except Exception as err:
        log.warning(f"Database Initializer: Seeding check skipped ({err})")
