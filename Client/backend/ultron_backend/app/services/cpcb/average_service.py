"""UltrON — CPCB 15-Minute Averaging Service

Computes 15-minute CPCB-compliant averages from existing 1-min averages
and stores them as CPCBExportRecord rows.
"""

from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from app.models.telemetry import Averages, AverageType
from app.models.cpcb import CPCBExportRecord, CPCBStationConfig, CPCBParameterMapping
from app.core.logger import get_logger

log = get_logger("ultron.cpcb.average")


def get_cpcb_window(timestamp: datetime) -> tuple[datetime, datetime]:
    aligned = timestamp.replace(second=0, microsecond=0)
    minute_block = (aligned.minute // 15) * 15
    start = aligned.replace(minute=minute_block, second=0, microsecond=0)
    end = start + timedelta(minutes=15)
    return start, end


async def compute_15min_averages_for_station(
    db: AsyncSession,
    station_config: CPCBStationConfig,
    window_start: datetime,
    window_end: datetime,
) -> int:
    records_created = 0
    mappings_result = await db.execute(
        select(CPCBParameterMapping).where(CPCBParameterMapping.enabled == True)
    )
    mappings = mappings_result.scalars().all()

    for mapping in mappings:
        internal_param = mapping.internal_parameter
        cpcb_param = mapping.cpcb_parameter

        from app.models.parameter import Parameter
        param_result = await db.execute(
            select(Parameter).where(Parameter.tag_name == internal_param)
        )
        param = param_result.scalar_one_or_none()
        if not param:
            continue

        avg_result = await db.execute(
            select(func.avg(Averages.value))
            .where(
                and_(
                    Averages.parameter_id == param.id,
                    Averages.avg_type == AverageType.avg_1min,
                    Averages.timestamp >= window_start,
                    Averages.timestamp < window_end,
                    Averages.quality.in_(["good", "out_of_range", "uncertain"]),
                )
            )
        )
        avg_val = avg_result.scalar()
        if avg_val is None:
            continue

        converted_val = round(float(avg_val) * mapping.conversion_factor, 4)

        existing = await db.execute(
            select(CPCBExportRecord).where(
                and_(
                    CPCBExportRecord.station_name == station_config.station_name,
                    CPCBExportRecord.parameter == cpcb_param,
                    CPCBExportRecord.date_from == window_start,
                    CPCBExportRecord.date_to == window_end,
                )
            )
        )
        if existing.scalar_one_or_none():
            log.debug(f"Duplicate skipped: {station_config.station_name}/{cpcb_param} @ {window_start}")
            continue

        db.add(CPCBExportRecord(
            station_name=station_config.station_name,
            parameter=cpcb_param,
            date_from=window_start,
            date_to=window_end,
            value=converted_val,
            calibration_flag=0,
            maintenance_flag=0,
            remark="Normal",
        ))
        records_created += 1

    if records_created > 0:
        await db.flush()
        log.info(f"Created {records_created} CPCB records for {station_config.station_name} window {window_start}")

    return records_created


async def run_cpcb_averaging(db: AsyncSession) -> dict:
    now = datetime.utcnow()
    window_start, window_end = get_cpcb_window(now)

    configs_result = await db.execute(
        select(CPCBStationConfig).where(CPCBStationConfig.export_enabled == True)
    )
    configs = configs_result.scalars().all()

    total_records = 0
    for config in configs:
        try:
            records = await compute_15min_averages_for_station(db, config, window_start, window_end)
            total_records += records
        except Exception as e:
            log.error(f"CPCB averaging error for station {config.station_name}: {e}")

    return {"records_created": total_records, "stations": len(configs), "window_start": str(window_start), "window_end": str(window_end)}
