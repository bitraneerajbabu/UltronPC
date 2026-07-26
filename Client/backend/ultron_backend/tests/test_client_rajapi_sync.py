"""
Unit tests for Ultron Client's rajapi_sync.py auto-provisioning guard and duplicate parameter prevention.
"""

import unittest
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.services.rajapi_sync import _get_or_create_param
from app.models.station import Station
from app.models.device import Device
from app.models.parameter import Parameter


class TestClientRajAPISync(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self):
        self.engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        self.async_session = sessionmaker(
            self.engine, class_=AsyncSession, expire_on_commit=False
        )
        self.db = self.async_session()

    async def asyncTearDown(self):
        await self.db.close()
        await self.engine.dispose()

    async def test_client_sync_no_station_skips_creation(self):
        """1. Sync payload with no station specified -> no parameter/device created, warning logged."""
        with self.assertLogs("ultron.rajapi_sync", level="WARNING") as cm:
            param = await _get_or_create_param(
                db=self.db,
                tag_name="PM10",
                unit="ug/m3",
                station_id=None,
                station_name=None
            )
        self.assertIsNone(param)
        self.assertTrue(any("No valid explicit station specified" in log for log in cm.output))

    async def test_client_sync_valid_station_creates_param(self):
        """2. Sync payload with valid station -> creates parameter linked to station."""
        st = Station(name="Main Stack 1", protocol="modbus_tcp")
        self.db.add(st)
        await self.db.flush()

        param = await _get_or_create_param(
            db=self.db,
            tag_name="SO2",
            unit="mg/m3",
            station_id=st.id
        )
        self.assertIsNotNone(param)
        self.assertEqual(param.tag_name, "SO2")

    async def test_client_sync_duplicate_prevention_reuses_existing(self):
        """3. Sync payload for an existing parameter -> reuses existing row, no duplicate."""
        st = Station(name="Main Stack 2", protocol="modbus_tcp")
        self.db.add(st)
        await self.db.flush()

        param1 = await _get_or_create_param(
            db=self.db,
            tag_name="NO2",
            unit="ppm",
            station_id=st.id
        )
        param2 = await _get_or_create_param(
            db=self.db,
            tag_name="NO2",
            unit="ppm",
            station_id=st.id
        )
        self.assertEqual(param1.id, param2.id)

    async def test_device_dedup_same_station_reuses_device(self):
        """4. Sync two params for same station+name -> one device created, second reuses it."""
        st = Station(name="AAQMS 1", protocol="modbus_tcp")
        self.db.add(st)
        await self.db.flush()

        # First param creates device "AAQMS 1 Sync Device"
        param1 = await _get_or_create_param(
            db=self.db, tag_name="PM10", unit="ug/m3", station_id=st.id
        )
        # Second param with same station reuses same device
        param2 = await _get_or_create_param(
            db=self.db, tag_name="SO2", unit="ppm", station_id=st.id
        )

        self.assertIsNotNone(param1)
        self.assertIsNotNone(param2)
        self.assertEqual(param1.device_id, param2.device_id,
                         "Both parameters should share the same device")

        # Verify exactly one device exists for this station
        from sqlalchemy import select
        from app.models.device import Device
        res = await self.db.execute(
            select(Device).where(Device.station_id == st.id)
        )
        devices = res.scalars().all()
        self.assertEqual(len(devices), 1,
                         "Only one device row should exist for the station")

    async def test_device_dedup_different_stations_create_separate_devices(self):
        """5. Params for different stations -> separate devices created, no cross-contamination."""
        st1 = Station(name="Stack A", protocol="modbus_tcp")
        st2 = Station(name="Stack B", protocol="modbus_tcp")
        self.db.add(st1)
        self.db.add(st2)
        await self.db.flush()

        # Use different tag_names so parameter dedup doesn't short-circuit
        param1 = await _get_or_create_param(
            db=self.db, tag_name="CO", unit="ppm", station_id=st1.id
        )
        param2 = await _get_or_create_param(
            db=self.db, tag_name="NO2", unit="ppm", station_id=st2.id
        )

        self.assertIsNotNone(param1)
        self.assertIsNotNone(param2)
        self.assertIsNotNone(param1.device_id)
        self.assertIsNotNone(param2.device_id)
        self.assertNotEqual(param1.device_id, param2.device_id,
                            "Different stations must have different devices")


if __name__ == "__main__":
    unittest.main()
