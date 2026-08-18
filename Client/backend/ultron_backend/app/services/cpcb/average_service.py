"""UltrON — CPCB 15-Minute Averaging Service

Computes 15-minute CPCB-compliant averages from existing 1-min averages
and stores them as CPCBExportRecord rows.
"""

from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload
from app.models.telemetry import Averages, AverageType, DataQuality
from app.models.cpcb import CPCBExportRecord, CPCBStationConfig, CPCBParameterMapping
from app.core.logger import get_logger

log = get_logger("ultron.cpcb.average")


def get_cpcb_window(timestamp: datetime) -> tuple[datetime, datetime]:
    aligned = timestamp.replace(second=0, microsecond=0)
    minute_block = (aligned.minute // 15) * 15
    end = aligned.replace(minute=minute_block, second=0, microsecond=0)
    start = end - timedelta(minutes=15)
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

    # Batch load all Parameters with device relation to avoid N+1 queries and ensure station isolation
    from app.models.parameter import Parameter
    internal_tags = [m.internal_parameter for m in mappings if m.internal_parameter]
    if not internal_tags:
        return 0
    params_result = await db.execute(
        select(Parameter).options(selectinload(Parameter.device)).where(Parameter.tag_name.in_(internal_tags))
    )
    all_params = {p.tag_name: p for p in params_result.scalars().all()}

    for mapping in mappings:
        internal_param = mapping.internal_parameter
        cpcb_param = mapping.cpcb_parameter

        param = all_params.get(internal_param)
        if not param:
            continue

        # Isolate parameters strictly to their owning station
        if station_config.station_id and param.device and param.device.station_id != station_config.station_id:
            continue

        avg_result = await db.execute(
            select(func.avg(Averages.value))
            .where(
                and_(
                    Averages.parameter_id == param.id,
                    Averages.avg_type == AverageType.avg_1min,
                    Averages.timestamp >= window_start,
                    Averages.timestamp < window_end,
                    Averages.quality.in_((DataQuality.good, DataQuality.out_of_range, DataQuality.uncertain, "U")),
                )
            )
        )
        avg_val = avg_result.scalar()
        if avg_val is None:
            continue

        converted_val = round(float(avg_val) * mapping.conversion_factor, 4)

        live_name = station_config.station.name if station_config.station else station_config.station_name

        cal_flag = 1 if station_config.calibration_mode else 0
        maint_flag = 1 if station_config.maintenance_mode else 0
        remark = "Calibration" if cal_flag else ("Maintenance" if maint_flag else "")

        existing = await db.execute(
            select(CPCBExportRecord).where(
                and_(
                    CPCBExportRecord.station_name == live_name,
                    CPCBExportRecord.parameter == cpcb_param,
                    CPCBExportRecord.date_from == window_start,
                    CPCBExportRecord.date_to == window_end,
                )
            )
        )
        rec = existing.scalar_one_or_none()
        if rec:
            rec.value = converted_val
            rec.calibration_flag = cal_flag
            rec.maintenance_flag = maint_flag
            rec.remark = remark
            records_created += 1
            log.debug(f"Updated existing CPCB record: {live_name}/{cpcb_param} @ {window_start}")
        else:
            db.add(CPCBExportRecord(
                station_name=live_name,
                parameter=cpcb_param,
                date_from=window_start,
                date_to=window_end,
                value=converted_val,
                calibration_flag=cal_flag,
                maintenance_flag=maint_flag,
                remark=remark,
            ))
            records_created += 1

    if records_created > 0:
        await db.flush()
        log.info(f"Processed {records_created} CPCB records for {station_config.station.name if station_config.station else station_config.station_name} window {window_start}")

    return records_created


async def run_cpcb_averaging(db: AsyncSession) -> dict:
    now = datetime.utcnow()
    window_start, window_end = get_cpcb_window(now)

    configs_result = await db.execute(
        select(CPCBStationConfig)
        .options(selectinload(CPCBStationConfig.station))
        .where(CPCBStationConfig.export_enabled == True)
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
