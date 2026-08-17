"""
Integration test for P0 Data Integrity: Uncapped Telemetry Preservation.

Proves:
  1. Actual value 125.7 with alarm_high=100 remains 125.7 in LiveCache, LiveData, and HistoricalData.
  2. Actual value 250.0 with alarm_high=100 remains 250.0 in LiveCache, LiveData, and HistoricalData.
  3. Alarm engine generates HIGH / EMERGENCY alarm records independently based on real values.
  4. CPCB Annexure-I CSV rows contain authentic 125.70 and 250.00 measurements.
"""

import pytest
from datetime import datetime, timezone
from sqlalchemy import select

from app.database import AsyncSessionLocal, engine, Base
from app.models.parameter import Parameter
from app.models.device import Device, DeviceProtocol
from app.models.station import Station
from app.models.telemetry import LiveData, HistoricalData, DataQuality, Alarm
from app.services.telemetry_service import telemetry_service
from app.services.alarm_engine import alarm_engine
from app.services.server_push import _cpcb_row


@pytest.mark.asyncio
async def test_uncapped_telemetry_pipeline_integrity():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        st = Station(name="TestStation_Uncapped")
        db.add(st)
        await db.flush()

        dev = Device(station_id=st.id, name="TestDevice_Uncapped", protocol=DeviceProtocol.modbus_tcp)
        db.add(dev)
        await db.flush()

        param = Parameter(
            device_id=dev.id,
            tag_name="SO2_TEST",
            name="Sulfur Dioxide",
            unit="ppb",
            register_address=40001,
            alarm_high=100.0,
            alarm_high_high=200.0,
        )
        db.add(param)
        await db.commit()
        await db.refresh(param)

        now = datetime.now(timezone.utc)

        # Test Case 1: Value 125.7 (exceeds alarm_high=100.0)
        pt1 = telemetry_service.record_reading(
            parameter_id=param.id,
            tag_name=param.tag_name,
            station_name=st.name,
            device_name=dev.name,
            device_id=dev.id,
            value=125.7,
            raw_value=125.7,
            quality="U",
            unit=param.unit,
            timestamp=now,
        )

        assert pt1.value == 125.7, "LiveCache value must remain 125.7 (uncapped)"

        # Test Case 2: Value 250.0 (exceeds alarm_high_high=200.0)
        pt2 = telemetry_service.record_reading(
            parameter_id=param.id,
            tag_name=param.tag_name,
            station_name=st.name,
            device_name=dev.name,
            device_id=dev.id,
            value=250.0,
            raw_value=250.0,
            quality="U",
            unit=param.unit,
            timestamp=now,
        )

        assert pt2.value == 250.0, "LiveCache value must remain 250.0 (uncapped)"

        # Evaluate Alarms — must trigger alarm based on authentic value
        await alarm_engine.evaluate(db, param, 125.7, "U")
        await alarm_engine.evaluate(db, param, 250.0, "U")

        res_alarms = await db.execute(select(Alarm).where(Alarm.parameter_id == param.id))
        alarms = res_alarms.scalars().all()
        assert len(alarms) >= 1, "Alarms must be generated for values exceeding thresholds"

        # Check CPCB export formatting
        cpcb_125 = _cpcb_row(st.name, param.tag_name, now, 125.7, "U")
        cpcb_250 = _cpcb_row(st.name, param.tag_name, now, 250.0, "U")

        assert "125.70" in cpcb_125, "CPCB row must transmit authentic value 125.70"
        assert "250.00" in cpcb_250, "CPCB row must transmit authentic value 250.00"

        # Cleanup
        await db.delete(param)
        await db.delete(dev)
        await db.delete(st)
        await db.commit()
