"""
UltrON — Seed Dummy Station & 3 Days Telemetry Records
Creates:
  1. Station: AAQMS 1
  2. Device: ETP ANALYSER
  3. Parameters: ETP ANALYSER-Flow (m3/hr) and ETP ANALYSER-TSS (mg/l)
  4. 3 Days of minute-by-minute time-series data + precomputed averages.
"""

import asyncio
import math
import random
from datetime import datetime, timedelta

from app.database import AsyncSessionLocal, init_db
from app.models.device import Device, DeviceProtocol
from app.models.parameter import Parameter
from app.models.telemetry import LiveData, HistoricalData, Averages, DataQuality, AverageType
from app.models.station import Station, StationType
from sqlalchemy import select, delete


async def seed():
    print("Initializing Database...")
    await init_db()

    async with AsyncSessionLocal() as db:
        # Check if station already exists
        st_res = await db.execute(select(Station).where(Station.name == "AAQMS 1"))
        station = st_res.scalar_one_or_none()

        if not station:
            station = Station(
                name="AAQMS 1",
                station_type=StationType.AAQMS,
                description="Industrial Continuous Monitoring Station",
            )
            db.add(station)
            await db.flush()
            print(f"Created Station: {station.name} (ID: {station.id})")
        else:
            print(f"Found Existing Station: {station.name} (ID: {station.id})")

        # Device
        dev_res = await db.execute(select(Device).where(Device.station_id == station.id))
        device = dev_res.scalar_one_or_none()

        if not device:
            device = Device(
                station_id=station.id,
                name="ETP ANALYSER",
                protocol=DeviceProtocol.modbus_tcp,
                host="192.168.1.100",
                port=502,
                slave_id=1,
                poll_interval=5,
                is_active=True,
            )
            db.add(device)
            await db.flush()
            print(f"Created Device: {device.name} (ID: {device.id})")
        else:
            print(f"Found Existing Device: {device.name} (ID: {device.id})")

        # Parameters
        p1_res = await db.execute(select(Parameter).where(Parameter.tag_name == "ETP ANALYSER-Flow"))
        p1 = p1_res.scalar_one_or_none()
        if not p1:
            p1 = Parameter(
                device_id=device.id,
                tag_name="ETP ANALYSER-Flow",
                name="Flow Rate",
                unit="m3/hr",
                register_address=40001,
                register_count=2,
                data_type="float32",
                scale_factor=1.0,
                offset=0.0,
                min_valid=0.0,
                max_valid=100.0,
                alarm_high=100.0,
                display_order=1,
                is_active=True,
            )
            db.add(p1)

        p2_res = await db.execute(select(Parameter).where(Parameter.tag_name == "ETP ANALYSER-TSS"))
        p2 = p2_res.scalar_one_or_none()
        if not p2:
            p2 = Parameter(
                device_id=device.id,
                tag_name="ETP ANALYSER-TSS",
                name="Total Suspended Solids",
                unit="mg/l",
                register_address=40003,
                register_count=2,
                data_type="float32",
                scale_factor=1.0,
                offset=0.0,
                min_valid=0.0,
                max_valid=100.0,
                alarm_high=100.0,
                display_order=2,
                is_active=True,
            )
            db.add(p2)

        await db.flush()
        print(f"Parameters Ready: {p1.tag_name} (ID: {p1.id}), {p2.tag_name} (ID: {p2.id})")

        # Live Data
        now_utc = datetime.utcnow()
        for p_obj, val in [(p1, 45.20), (p2, 28.50)]:
            ld_res = await db.execute(select(LiveData).where(LiveData.parameter_id == p_obj.id))
            ld = ld_res.scalar_one_or_none()
            if not ld:
                ld = LiveData(
                    parameter_id=p_obj.id,
                    value=val,
                    raw_value=val,
                    quality=DataQuality.good,
                    timestamp=now_utc,
                )
                db.add(ld)
            else:
                ld.value = val
                ld.timestamp = now_utc

        # Check existing historical records count
        h_cnt = await db.execute(select(HistoricalData).where(HistoricalData.parameter_id == p1.id))
        existing_rows = len(h_cnt.scalars().all())

        if existing_rows < 1000:
            print("Seeding 3 days (4,320 minutes) of time-series records...")
            start_time = now_utc - timedelta(days=3)
            current_time = start_time

            hd_batch = []
            avg_15m_batch = {}
            avg_1h_batch = {}

            minute_idx = 0
            while current_time <= now_utc:
                # Realistic industrial wave functions + random noise
                flow_val = round(45.0 + 35.0 * math.sin(minute_idx / 120.0) + random.uniform(-2.5, 2.5), 2)
                tss_val = round(25.0 + 15.0 * math.cos(minute_idx / 90.0) + random.uniform(-1.5, 1.5), 2)

                flow_val = max(0.0, min(100.0, flow_val))
                tss_val = max(0.0, min(100.0, tss_val))

                hd_batch.append(HistoricalData(
                    parameter_id=p1.id,
                    timestamp=current_time,
                    value=flow_val,
                    raw_value=flow_val,
                    quality=DataQuality.good,
                ))

                hd_batch.append(HistoricalData(
                    parameter_id=p2.id,
                    timestamp=current_time,
                    value=tss_val,
                    raw_value=tss_val,
                    quality=DataQuality.good,
                ))

                # Aggregate for 15m
                ts_15m = current_time.replace(minute=(current_time.minute // 15) * 15, second=0, microsecond=0)
                avg_15m_batch.setdefault((p1.id, ts_15m), []).append(flow_val)
                avg_15m_batch.setdefault((p2.id, ts_15m), []).append(tss_val)

                # Aggregate for 1h
                ts_1h = current_time.replace(minute=0, second=0, microsecond=0)
                avg_1h_batch.setdefault((p1.id, ts_1h), []).append(flow_val)
                avg_1h_batch.setdefault((p2.id, ts_1h), []).append(tss_val)

                current_time += timedelta(minutes=1)
                minute_idx += 1

                # Bulk insert in batches of 1000
                if len(hd_batch) >= 1000:
                    db.add_all(hd_batch)
                    await db.flush()
                    hd_batch = []

            if hd_batch:
                db.add_all(hd_batch)

            # Insert 15m Averages
            for (pid, ts), vals in avg_15m_batch.items():
                if vals:
                    mean_v = round(sum(vals) / len(vals), 2)
                    db.add(Averages(
                        parameter_id=pid,
                        avg_type=AverageType.avg_15min,
                        timestamp=ts,
                        value=mean_v,
                        quality=DataQuality.good,
                    ))

            # Insert 1h Averages
            for (pid, ts), vals in avg_1h_batch.items():
                if vals:
                    mean_v = round(sum(vals) / len(vals), 2)
                    db.add(Averages(
                        parameter_id=pid,
                        avg_type=AverageType.avg_1hr,
                        timestamp=ts,
                        value=mean_v,
                        quality=DataQuality.good,
                    ))

            print(f"Seeded {minute_idx * 2} historical time-series records cleanly!")

        await db.commit()
        print("Dummy Station 'AAQMS 1' and 3 Days Telemetry Records Seeded Successfully!")


if __name__ == "__main__":
    asyncio.run(seed())
