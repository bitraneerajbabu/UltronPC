"""UltrON — CPCB Historical Backfill Service

Recalculates and regenerates CPCB export records for a given date range.
"""

from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, delete, func
from app.models.cpcb import CPCBExportRecord, CPCBStationConfig
from app.models.telemetry import Averages, AverageType
from app.models.parameter import Parameter
from app.models.cpcb import CPCBParameterMapping
from app.core.logger import get_logger

log = get_logger("ultron.cpcb.backfill")


def _iter_cpcb_windows(start_date: datetime, end_date: datetime):
    current = start_date.replace(second=0, microsecond=0)
    minute_block = (current.minute // 15) * 15
    current = current.replace(minute=minute_block)
    while current < end_date:
        yield current, current + timedelta(minutes=15)
        current += timedelta(minutes=15)


async def run_backfill(
    db: AsyncSession,
    station_name: str,
    start_date: datetime,
    end_date: datetime,
) -> dict:
    config_result = await db.execute(
        select(CPCBStationConfig).where(CPCBStationConfig.station_name == station_name)
    )
    config = config_result.scalar_one_or_none()
    if not config:
        raise ValueError(f"Station config not found: {station_name}")

    await db.execute(
        delete(CPCBExportRecord).where(
            and_(
                CPCBExportRecord.station_name == station_name,
                CPCBExportRecord.date_from >= start_date,
                CPCBExportRecord.date_to <= end_date,
            )
        )
    )
    await db.flush()

    mappings_result = await db.execute(
        select(CPCBParameterMapping).where(CPCBParameterMapping.enabled == True)
    )
    mappings = mappings_result.scalars().all()

    records_created = 0
    for window_start, window_end in _iter_cpcb_windows(start_date, end_date):
        for mapping in mappings:
            param_result = await db.execute(
                select(Parameter).where(Parameter.tag_name == mapping.internal_parameter)
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
                        Averages.quality.in_(["U"]),
                    )
                )
            )
            avg_val = avg_result.scalar()
            if avg_val is not None:
                converted_val = round(float(avg_val) * mapping.conversion_factor, 4)
                db.add(CPCBExportRecord(
                    station_name=station_name,
                    parameter=mapping.cpcb_parameter,
                    date_from=window_start,
                    date_to=window_end,
                    value=converted_val,
                    calibration_flag=0,
                    maintenance_flag=0,
                    remark="Normal",
                ))
                records_created += 1

        if records_created % 50 == 0 and records_created > 0:
            await db.flush()

    await db.flush()
    log.info(f"Backfill complete: {station_name} {start_date} -> {end_date}: {records_created} records")
    return {"station": station_name, "records_created": records_created, "start": str(start_date), "end": str(end_date)}
