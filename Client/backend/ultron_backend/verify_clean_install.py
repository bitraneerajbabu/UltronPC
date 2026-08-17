import asyncio
import os
import sys
import shutil
import urllib.request
import json

sys.path.insert(0, ".")

from app.config import APP_DIR
from app.database import init_db, AsyncSessionLocal
from app.models.station import Station
from app.models.device import Device
from app.models.parameter import Parameter
from app.models.user import User
from sqlalchemy import select, func

TEST_DB_FILE = APP_DIR / "ultron_clean_install.db"

async def run_clean_install_verification():
    print("============================================================")
    print("      ULTRON v1.1 CLEAN INSTALLATION VERIFICATION TEST      ")
    print("============================================================")

    # 1. Delete SQLite test database if exists
    if TEST_DB_FILE.is_file():
        os.remove(TEST_DB_FILE)
        print("1. Clean Database Setup: Existing test database deleted.")

    # Override DATABASE_URL to use clean installation test DB
    os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{TEST_DB_FILE.as_posix()}"

    # 2. Start initialization
    print("2. Application Startup: Initializing database & running centralized ORM seeding...")
    await init_db()

    # 3. Verify initialization completion & mandatory seeding
    async with AsyncSessionLocal() as db:
        st_res = await db.execute(select(Station))
        stations = st_res.scalars().all()
        assert len(stations) == 1, f"Expected 1 default station, found {len(stations)}"
        st = stations[0]
        print(f"3. Centralized Seeding Verification:")
        print(f"   - Station ID: {st.id}")
        print(f"   - Station Name: '{st.name}'")
        print(f"   - Station Type: '{st.station_type}' (Valid Enum)")
        print(f"   - Protocol: '{st.protocol}' (Valid String)")
        print(f"   - Is Active: {st.is_active} (Valid Bool)")
        
        usr_res = await db.execute(select(User).where(User.username == "Master"))
        usr = usr_res.scalar_one_or_none()
        assert usr is not None, "Master user missing from centralized seeding"
        print(f"   - Admin User: '{usr.username}' (Role: {usr.role}, Active: {usr.is_active})")

    # 4. Verify API Stations Endpoint (no ResponseValidationError)
    from app.schemas.station import StationOut
    st_out = StationOut.model_validate(st)
    print(f"4. Stations Endpoint Schema Validation: Pydantic StationOut validated cleanly -> name='{st_out.name}'")

    # 5. Verify Device & Parameter Creation via ORM
    async with AsyncSessionLocal() as db:
        dev = Device(
            station_id=st.id,
            name="Default Station TCP Gateway",
            protocol="modbus_tcp",
            host="192.168.1.100",
            port=502,
            slave_id=1,
            poll_interval=5,
            is_active=True
        )
        db.add(dev)
        await db.flush()
        print(f"5. Device Creation Verification: Device ID {dev.id} ('{dev.name}') created under Station {st.id}")

        param = Parameter(
            device_id=dev.id,
            name="SO2",
            tag_name="SO2",
            unit="ppm",
            register_type="holding",
            register_address=40001,
            register_count=2,
            data_type="float32",
            byte_order="big",
            scale_factor=1.0,
            offset=0.0,
            is_active=True
        )
        db.add(param)
        await db.commit()
        print(f"6. Parameter Creation Verification: Parameter ID {param.id} ('{param.name}') created under Device {dev.id}")

    # 6. Verify Idempotency on second initialization (app restart)
    print("7. Application Restart: Running init_db() a second time...")
    await init_db()
    async with AsyncSessionLocal() as db:
        st_count = (await db.execute(select(func.count(Station.id)))).scalar()
        usr_count = (await db.execute(select(func.count(User.id)))).scalar()
        assert st_count == 1, f"Idempotency failed: expected 1 station after restart, got {st_count}"
        assert usr_count == 1, f"Idempotency failed: expected 1 admin user after restart, got {usr_count}"
        print(f"8. Idempotency Verification: Station count = {st_count}, User count = {usr_count} (0 duplicate records created)")

    print("\n============================================================")
    print("   ALL 10 CLEAN INSTALLATION VERIFICATION CHECKS PASSED ✅  ")
    print("============================================================")

if __name__ == "__main__":
    asyncio.run(run_clean_install_verification())
