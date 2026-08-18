import os
import pytest
import asyncio
from datetime import datetime, timedelta, timezone
from sqlalchemy import select
from app.database import AsyncSessionLocal, init_db
from app.models.station import Station
from app.models.device import Device, DeviceType
from app.models.parameter import Parameter
from app.models.telemetry import HistoricalData, Averages, AverageType, DataQuality
from app.models.cpcb import CPCBStationConfig, CPCBParameterMapping
import uuid
from app.models.server_config import ServerConfig, ServerParameterMapping
from app.services.data_quality import DataQualityEngine
from app.services.averaging_engine import run_averaging_for_all_parameters
from app.services.cpcb.scheduler_service import run_cpcb_pipeline
from app.services.server_push import _push_cpcb
from sqlalchemy import text

@pytest.mark.asyncio
async def test_cpcb_15min_pipeline_verification(tmp_path):
    await init_db()
    dq_engine = DataQualityEngine()
    uid = uuid.uuid4().hex[:6]
    st_name = f"Station_{uid}"
    tag_name = f"SO2_{uid}"
    
    async with AsyncSessionLocal() as db:
        await db.execute(text("UPDATE devices SET device_type='ANALYZER' WHERE device_type='modbus_tcp'"))
        await db.commit()
        
        # 1. Setup Station, Device, Parameter
        station = Station(name=st_name, is_active=True)
        db.add(station)
        await db.flush()
        
        device = Device(station_id=station.id, name=f"Analyzer_{uid}", device_type=DeviceType.ANALYZER, is_active=True)
        db.add(device)
        await db.flush()
        
        param = Parameter(
            device_id=device.id,
            tag_name=tag_name,
            name="Sulphur Dioxide",
            unit="mg/Nm3",
            register_address=40001,
            is_active=True,
            alarm_high=80.0,  # Warning High limit
            alarm_high_high=100.0,
            min_valid=0.0,
            max_valid=500.0,
        )
        db.add(param)
        await db.flush()
        
        # Setup CPCB Station Config & Mapping
        cpcb_dir = str(tmp_path / "cpcb_export")
        os.makedirs(cpcb_dir, exist_ok=True)
        
        st_cfg = CPCBStationConfig(
            station_id=station.id,
            station_name=station.name,
            export_enabled=True,
            export_path=cpcb_dir,
            retention_count=95,
        )
        db.add(st_cfg)
        
        p_map = CPCBParameterMapping(
            internal_parameter=param.tag_name,
            cpcb_parameter="SO2",
            conversion_factor=1.0,
            enabled=True,
        )
        db.add(p_map)
        
        # Setup ServerConfig (Server Push path)
        cpcb_file = str(tmp_path / "cpcb_push.txt")
        srv_cfg = ServerConfig(
            name=f"CPCB_Server_{uid}",
            protocol="cpcb",
            cpcb_file_path=cpcb_file,
            is_active=True,
            is_cpcb_active=True,
        )
        db.add(srv_cfg)
        await db.flush()
        
        srv_map = ServerParameterMapping(
            server_id=srv_cfg.id,
            parameter_id=param.id,
            cpcb_station_name=station.name,
            cpcb_parameter="SO2",
            is_active=True,
        )
        db.add(srv_map)
        await db.commit()

        # 2. Insert 15 minutes of historical readings (1 reading per minute)
        # Some readings exceed alarm_high (80.0) -> verify warning high lock clamping
        base_time = datetime.utcnow().replace(second=0, microsecond=0)
        # Align to window
        mins_offset = base_time.minute % 15
        window_start = base_time - timedelta(minutes=mins_offset + 15)
        
        param_meta = {
            param.id: {
                "min_valid": param.min_valid,
                "max_valid": param.max_valid,
                "alarm_high": param.alarm_high,
                "alarm_high_high": param.alarm_high_high,
            }
        }
        
        for i in range(15):
            ts = window_start + timedelta(minutes=i)
            raw_val = 75.0 if i < 10 else 95.0 # 95.0 exceeds alarm_high (80.0)
            
            # Run through quality engine (applies warning high limit lock)
            records = [{"parameter_id": param.id, "value": raw_val, "timestamp": ts, "quality": "U"}]
            cleaned = dq_engine.bulk_check(records, param_meta)
            
            val = cleaned[0]["value"] # 95.0 should be clamped to 80.0
            assert val <= 80.0, f"Value {val} was not clamped to alarm_high 80.0"
            
            db.add(HistoricalData(
                parameter_id=param.id,
                value=val,
                timestamp=ts,
                quality=DataQuality.good,
            ))
            
            # Also add 1-min average for CPCB average service
            db.add(Averages(
                parameter_id=param.id,
                value=val,
                timestamp=ts,
                avg_type=AverageType.avg_1min,
                quality=DataQuality.good,
                source="calc",
            ))
            
        await db.commit()

    # 3. Run Averaging Engine & CPCB Pipelines
    await run_averaging_for_all_parameters()
    await run_cpcb_pipeline()
    
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(ServerConfig).where(ServerConfig.name == f"CPCB_Server_{uid}"))
        srv = res.scalar_one()
        await _push_cpcb(srv, db)

    # 4. Verify Generated CPCB Files
    # Check Server Push CPCB file
    assert os.path.exists(cpcb_file), "CPCB push file was not generated"
    with open(cpcb_file, "r") as f:
        lines = [l.strip() for l in f if l.strip()]
        
    print(f"\n--- CPCB PUSH FILE CONTENT ({len(lines)} lines) ---")
    for l in lines:
        print(l)
        
    assert lines[0].startswith("1,2,3,4,5,6,7,8")
    assert "Station name" in lines[1]
    assert len(lines) >= 3, "No data rows written to CPCB file"
    
    data_row = lines[2]
    parts = data_row.split(",")
    assert parts[0] == st_name
    assert parts[1] == "SO2"
    # Average of ten 75.0 and five 80.0 (clamped from 95.0) = (750 + 400)/15 = 76.67
    avg_val = float(parts[4])
    assert 76.0 <= avg_val <= 77.0, f"Expected average ~76.67, got {avg_val}"
    
    # Check CPCB Exporter station file
    station_file = os.path.join(cpcb_dir, f"{st_name}.txt")
    assert os.path.exists(station_file), "CPCB station export file was not generated"
    with open(station_file, "r") as f:
        st_lines = [l.strip() for l in f if l.strip()]
        
    print(f"\n--- CPCB STATION EXPORT FILE CONTENT ({len(st_lines)} lines) ---")
    for l in st_lines:
        print(l)
        
    assert st_lines[0].startswith("1,2,3,4,5,6,7,8")
    assert len(st_lines) >= 2
    st_data_row = st_lines[1]
    st_parts = st_data_row.split(",")
    assert st_parts[0] == st_name
    assert st_parts[1] == "SO2"
    st_avg_val = float(st_parts[4])
    assert 76.0 <= st_avg_val <= 77.0
    assert st_parts[5] == "0"
    assert st_parts[6] == "0"
    assert st_parts[7] == "0"
