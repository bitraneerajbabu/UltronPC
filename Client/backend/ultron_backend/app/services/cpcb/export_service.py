"""UltrON — CPCB File Export Service

Generates CPCB-compliant CSV files from export records.
Maintains FIFO retention (max N records per station per parameter).
"""

import os
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, delete
from app.models.cpcb import CPCBExportRecord, CPCBStationConfig, CPCBExportLog
from app.core.logger import get_logger

log = get_logger("ultron.cpcb.export")


def format_cpcb_value(value: float | None) -> str:
    if value is None:
        return ""
    return f"{value:.4f}"


def format_cpcb_timestamp(dt: datetime) -> str:
    return dt.strftime("%d-%m-%Y %H:%M")


def build_cpcb_line(
    station_name: str,
    parameter: str,
    date_from: datetime,
    date_to: datetime,
    value: float | None,
    calibration_flag: int,
    maintenance_flag: int,
    remark: str,
) -> str:
    return f"{station_name},{parameter},{format_cpcb_timestamp(date_from)},{format_cpcb_timestamp(date_to)},{format_cpcb_value(value)},{calibration_flag},{maintenance_flag},{remark}\n"


async def export_station_file(db: AsyncSession, config: CPCBStationConfig) -> dict:
    station_name = config.station_name
    export_path = config.export_path
    retention_count = config.retention_count

    os.makedirs(export_path, exist_ok=True)
    file_path = os.path.join(export_path, f"{station_name}.txt")

    params_result = await db.execute(
        select(CPCBExportRecord.parameter)
        .where(CPCBExportRecord.station_name == station_name)
        .distinct()
    )
    parameters = [row[0] for row in params_result.all()]

    total_written = 0
    for param in parameters:
        records_result = await db.execute(
            select(CPCBExportRecord)
            .where(
                and_(
                    CPCBExportRecord.station_name == station_name,
                    CPCBExportRecord.parameter == param,
                )
            )
            .order_by(CPCBExportRecord.date_from.asc())
        )
        records = records_result.scalars().all()

        if len(records) > retention_count:
            excess = len(records) - retention_count
            for i in range(excess):
                await db.delete(records[i])
            records = records[excess:]
            await db.flush()

        lines = []
        for rec in records:
            lines.append(build_cpcb_line(
                rec.station_name,
                rec.parameter,
                rec.date_from,
                rec.date_to,
                rec.value,
                rec.calibration_flag,
                rec.maintenance_flag,
                rec.remark,
            ))

        if lines:
            mode = "a" if os.path.exists(file_path) else "w"
            with open(file_path, mode, encoding="utf-8") as f:
                f.writelines(lines)
            total_written += len(lines)

    return {"file": file_path, "records_written": total_written, "parameters": len(parameters)}


async def run_cpcb_export(db: AsyncSession) -> dict:
    start_ts = datetime.utcnow()

    configs_result = await db.execute(
        select(CPCBStationConfig).where(CPCBStationConfig.export_enabled == True)
    )
    configs = configs_result.scalars().all()

    results = []
    for config in configs:
        try:
            result = await export_station_file(db, config)
            results.append(result)
            log.info(f"CPCB export complete: {result['file']} ({result['records_written']} records)")
        except Exception as e:
            log.error(f"CPCB export error for station {config.station_name}: {e}")
            results.append({"file": config.export_path, "records_written": 0, "error": str(e)})

    elapsed = int((datetime.utcnow() - start_ts).total_seconds() * 1000)
    total_records = sum(r.get("records_written", 0) for r in results)
    success = all("error" not in r for r in results)

    for config in configs:
        db.add(CPCBExportLog(
            station_name=config.station_name,
            record_count=total_records,
            status="success" if success else "partial_failure",
            message=f"Exported {total_records} records across {len(results)} stations" if success else str(results),
            execution_time_ms=elapsed,
        ))
    await db.flush()

    return {"stations": len(configs), "total_records": total_records, "execution_time_ms": elapsed, "success": success}
