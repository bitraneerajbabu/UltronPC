"""
UltrON — Server Push Engine

Supports two push protocols:
  • TGPCB  — HTTP POST JSON (like TGPCB / CPCB online portals that accept JSON)
             Live push  : every 1 minute  → live_url
             Delay push : every 15 minutes → delay_url

  • CPCB   — CSV flat-file (CPCB IT Division Annexure-I format)
             Written every 15 minutes to cpcb_file_path
             Format: StationName,Parameter,DateFrom,DateTo,Value,CalibFlag,MaintFlag,Remark
"""

import os
import asyncio
import httpx
from datetime import datetime, timedelta, timezone
from sqlalchemy import select
from sqlalchemy.orm import joinedload, selectinload
from collections import defaultdict

from app.database import AsyncSessionLocal
from app.models.server_config import ServerConfig, ServerParameterMapping
from app.models.telemetry import LiveData, Averages, AverageType, DataQuality
from app.models.parameter import Parameter
from app.models.device import Device
from app.models.station import Station
from app.core.logger import get_logger

log = get_logger("ultron.server_push")


# ─────────────────────────────────────────────────────────────────────────────
# TGPCB — JSON HTTP Push
# ─────────────────────────────────────────────────────────────────────────────

async def _build_tgpcb_payloads(db, server_id: int) -> list:
    """
    Build TGPCB-style JSON payload list.
    Groups parameters by (api_id, api_name, api_password) → one payload per group.

    Payload format (sent as HTTP POST JSON):
    {
      "DeviceID": "<api_id>",
      "FunctionName": 53,
      "Datetime": "YYYY-MM-DD HH:MM:SS",
      "Name": "<api_name>",
      "Password": "<api_password>",
      "additionalInfo": { "Longitude": "...", "Lattitude": "...", "SoftwareNameVersion": "Logon" },
      "Variables": [
        { "Variablename": "<api_vname>", "Value": <float>, "Unit": "<unit>", "Flags": "" }
      ]
    }
    """
    stmt = (
        select(ServerParameterMapping)
        .options(selectinload(ServerParameterMapping.parameter))
        .filter(ServerParameterMapping.server_id == server_id)
        .filter(ServerParameterMapping.is_active == True)
    )
    res = await db.execute(stmt)
    mappings = res.scalars().all()

    if not mappings:
        return []

    # Group by (api_id, api_name, api_password) — each group = one JSON POST
    grouped = defaultdict(list)
    for m in mappings:
        key = (m.api_id, m.api_name, m.api_password)
        grouped[key].append(m)

    payloads = []
    for (api_id, api_name, api_password), maps in grouped.items():
        if not api_id:
            continue

        try:
            device_id_val = int(api_id)
        except (ValueError, TypeError):
            device_id_val = api_id

        payload = {
            "DeviceID": device_id_val,
            "FunctionName": 53,
            "Datetime": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "Name": api_name or "",
            "Password": api_password or "",
            "additionalInfo": {
                "Longitude": "000.000000",
                "Lattitude": "000.000000",
                "SoftwareNameVersion": "UltrON",
            },
            "Variables": [],
        }

        for m in maps:
            # LiveData holds exactly one row per parameter (delete-then-insert in polling engine)
            ld_res = await db.execute(
                select(LiveData).where(LiveData.parameter_id == m.parameter_id)
            )
            ld = ld_res.scalars().first()
            if ld and ld.value is not None:
                try:
                    val = round(float(ld.value), 2)
                except (ValueError, TypeError):
                    val = ld.value
            else:
                val = ""

            param = m.parameter
            payload["Variables"].append({
                "Variablename": m.api_vname or (param.tag_name if param else ""),
                "Value": val,
                "Unit": m.api_unit or (param.unit if param else ""),
                "Flags": "",
            })

        payloads.append(payload)

    return payloads


async def _push_tgpcb(config: ServerConfig, db, mode: str):
    """HTTP POST each payload to the configured TGPCB URL."""
    target_url = config.live_url if mode == "live" else config.delay_url
    if not target_url:
        return

    try:
        payloads = await _build_tgpcb_payloads(db, config.id)
        if not payloads:
            log.debug(f"[TGPCB/{mode.upper()}] No active mappings for '{config.name}' — skipping.")
            return

        async with httpx.AsyncClient(timeout=10.0) as client:
            for payload in payloads:
                device_id = payload.get("DeviceID", "?")
                
                # Extract parameter names and values for logging
                variables = payload.get("Variables", [])
                posted_list = []
                for v in variables:
                    val_repr = str(v.get("Value"))
                    if val_repr == "" or val_repr is None:
                        val_repr = "NOT_POSTED (No telemetry)"
                    posted_list.append(f"{v.get('Variablename')}={val_repr}")
                param_summary = ", ".join(posted_list)

                try:
                    res = await client.post(target_url, json=payload)
                    if res.status_code < 300:
                        log.info(
                            f"[TGPCB/{mode.upper()}] ✓ DeviceID={device_id} → '{config.name}' HTTP {res.status_code}. "
                            f"Parameters Posted: [{param_summary}]"
                        )
                    else:
                        log.warning(
                            f"[TGPCB/{mode.upper()}] ✗ DeviceID={device_id} → '{config.name}' HTTP {res.status_code}: {res.text[:200]}. "
                            f"Parameters Attempted: [{param_summary}]"
                        )
                except Exception as e:
                    log.error(
                        f"[TGPCB/{mode.upper()}] Push error DeviceID={device_id} → "
                        f"'{config.name}' (Parameters: [{param_summary}]): {e}"
                    )
    except Exception as e:
        log.error(f"[TGPCB/{mode.upper()}] Build/push failed for '{config.name}': {e}")


# ─────────────────────────────────────────────────────────────────────────────
# CPCB — CSV Flat-File (Annexure-I format, CPCB IT Division)
# ─────────────────────────────────────────────────────────────────────────────
#
# File format (one row per parameter per 15-min interval):
#   StationName,ParamAbbr,DateFrom,DateTo,Value,CalibFlag,MaintFlag,Remark,
#
# Example:
#   Sanathnagar,CO,27-04-2015 13:00,27-04-2015 13:15,0.2497,0,0,
#   Sanathnagar,SO2,27-04-2015 13:00,27-04-2015 13:15,3.5233,0,0,
#
# Rules (per CPCB IT Division spec):
#   • 15-minute average values
#   • Date format: DD-MM-YYYY HH:MM
#   • File max 97 lines, FIFO rotation
#   • CalibFlag: 0=normal, 1=calibration mode ON
#   • MaintFlag: 0=normal, 1=maintenance mode ON
#   • Remark: blank=normal, or reason string (analyserfaulty, flowproblem …)
#
# Mapping field usage for CPCB:
#   api_id    → Station name string used in the CSV (e.g., "Sanathnagar")
#   api_vname → CPCB parameter abbreviation (CO, SO2, PM10, NO2 …)
#   api_unit  → unit override (optional)
#   api_name, api_password → not used for CPCB
# ─────────────────────────────────────────────────────────────────────────────

_CPCB_MAX_LINES = 97


def _append_to_cpcb_file(file_path: str, new_rows: list[str]) -> None:
    """
    Appends new data rows to the CPCB file at file_path.
    Enforces a strict limit of 97 total lines, keeping the first 2 header lines
    and performing FIFO rotation on the remaining 95 data lines.
    """
    header1 = "1,2,3,4,5,6,7,8,"
    header2 = "Station name, Parameter, Date from, Date to, Value,calibrationflag,maint flag,Remark,"
    
    existing_data_lines = []
    
    if os.path.exists(file_path):
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                lines = [line.rstrip("\n\r") for line in f.readlines() if line.strip()]
                if len(lines) >= 2:
                    if lines[0].strip().startswith("1,2,3,4,5") or "Station name" in lines[1]:
                        existing_data_lines = lines[2:]
                    else:
                        existing_data_lines = lines
                else:
                    existing_data_lines = lines
        except Exception as read_err:
            log.warning(f"[CPCB] Could not read existing file '{file_path}': {read_err}")
            
    all_data_lines = existing_data_lines + new_rows
    
    max_data_lines = 95
    if len(all_data_lines) > max_data_lines:
        all_data_lines = all_data_lines[-max_data_lines:]
        
    parent = os.path.dirname(file_path)
    if parent:
        os.makedirs(parent, exist_ok=True)
        
    try:
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(header1 + "\n")
            f.write(header2 + "\n")
            for line in all_data_lines:
                f.write(line + "\n")
    except Exception as write_err:
        log.error(f"[CPCB] Failed to write file '{file_path}': {write_err}")


async def _push_cpcb(config: ServerConfig, db):
    """Write missing 15-minute averages to CPCB Annexure-I CSV file."""
    if not getattr(config, "is_cpcb_active", True):
        log.debug(f"[CPCB] CPCB push is disabled for server '{config.name}'.")
        return

    file_path = config.cpcb_file_path
    if not file_path:
        log.warning(f"[CPCB] Server '{config.name}' has no file path configured — skipped.")
        return

    # Fetch all active mappings for this server
    stmt = (
        select(ServerParameterMapping)
        .options(selectinload(ServerParameterMapping.parameter))
        .filter(ServerParameterMapping.server_id == config.id)
        .filter(ServerParameterMapping.is_active == True)
    )
    res = await db.execute(stmt)
    mappings = res.scalars().all()

    if not mappings:
        log.debug(f"[CPCB] No active mappings for '{config.name}' — skipped.")
        return

    # 1. Parse existing records from the CPCB file to prevent duplicates
    existing_records = set()
    if os.path.exists(file_path):
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    if line.startswith("1,2,3,4,5") or "Station name" in line:
                        continue
                    parts = line.split(",")
                    if len(parts) >= 4:
                        station = parts[0].strip()
                        param = parts[1].strip()
                        dt_from = parts[2].strip()
                        dt_to = parts[3].strip()
                        existing_records.add((station, param, dt_from, dt_to))
        except Exception as read_err:
            log.warning(f"[CPCB] Could not parse existing file '{file_path}' for duplicate check: {read_err}")

    # 2. Get averages in the last 24 hours (using UTC query)
    dt_end = datetime.utcnow()
    dt_start = dt_end - timedelta(hours=24)

    param_ids = [m.parameter_id for m in mappings]
    mapping_by_param_id = {m.parameter_id: m for m in mappings}

    avg_stmt = (
        select(Averages)
        .where(
            Averages.parameter_id.in_(param_ids),
            Averages.avg_type == AverageType.avg_15min,
            Averages.timestamp >= dt_start,
            Averages.timestamp <= dt_end,
        )
        .order_by(Averages.timestamp.asc())
    )
    avg_res = await db.execute(avg_stmt)
    averages = avg_res.scalars().all()

    new_rows = []
    skipped_count = 0
    written_summary_items = []

    for avg in averages:
        m = mapping_by_param_id.get(avg.parameter_id)
        if not m:
            continue
        
        param = m.parameter
        station_name = m.cpcb_station_name or m.api_id or (
            param.device.station.name
            if param and hasattr(param, "device") and param.device and param.device.station
            else "Unknown"
        )
        param_code = m.cpcb_parameter or m.api_vname or (param.tag_name if param else "")
        if not param_code:
            continue

        # Convert UTC database timestamp to local time for formatting
        local_from = avg.timestamp.replace(tzinfo=timezone.utc).astimezone()
        local_to = local_from + timedelta(minutes=15)

        date_from_str = local_from.strftime("%d-%m-%Y %H:%M")
        date_to_str   = local_to.strftime("%d-%m-%Y %H:%M")

        # Check for duplicates
        if (station_name, param_code, date_from_str, date_to_str) in existing_records:
            skipped_count += 1
            continue

        # Value: 2 decimal places
        value_str = f"{avg.value:.2f}" if avg.value is not None else ""

        # Flags: 0 = normal operation
        calib_flag = 0
        maint_flag = 0

        # Remark: blank when quality is good, otherwise quality string
        remark = ""
        if avg.quality and str(avg.quality.value if hasattr(avg.quality, "value") else avg.quality) != "good":
            remark = str(avg.quality.value if hasattr(avg.quality, "value") else avg.quality)

        val_repr = value_str if value_str != "" else "NOT_POSTED (No average)"
        row = f"{station_name},{param_code},{date_from_str},{date_to_str},{value_str},{calib_flag},{maint_flag},{remark},"
        
        new_rows.append(row)
        written_summary_items.append(f"{param_code}@{date_from_str}={val_repr}")

    if not new_rows:
        if skipped_count > 0:
            log.debug(f"[CPCB] All {skipped_count} recent averages are already present in '{file_path}'.")
        else:
            log.warning(f"[CPCB] No recent 15-min averages found in DB for '{config.name}'.")
        return

    _append_to_cpcb_file(file_path, new_rows)
    
    param_summary = ", ".join(written_summary_items)
    log.info(
        f"[CPCB] ✓ Wrote {len(new_rows)} new row(s) to '{file_path}'. "
        f"Parameters Written: [{param_summary}]"
    )


async def generate_historical_cpcb_file(db, config: ServerConfig, date_str: str) -> str:
    """
    Generates a historical makeup data file content for the given date (YYYY-MM-DD local time)
    and saves it to the configured directory as a makeup file.
    Returns the complete file content.
    """
    try:
        parsed_date = datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        raise ValueError("Invalid date format. Expected YYYY-MM-DD.")

    # Convert start/end of the day (in local time) to UTC naive datetimes for database query
    from datetime import time
    local_start = datetime.combine(parsed_date, time.min).astimezone()
    local_end = datetime.combine(parsed_date, time.max).astimezone()

    utc_start = local_start.astimezone(timezone.utc).replace(tzinfo=None)
    utc_end = local_end.astimezone(timezone.utc).replace(tzinfo=None)

    # Fetch all active mappings
    stmt = (
        select(ServerParameterMapping)
        .options(selectinload(ServerParameterMapping.parameter))
        .filter(ServerParameterMapping.server_id == config.id)
        .filter(ServerParameterMapping.is_active == True)
    )
    res = await db.execute(stmt)
    mappings = res.scalars().all()

    if not mappings:
        raise ValueError(f"No active mappings for server '{config.name}'")

    param_ids = [m.parameter_id for m in mappings]

    # Query 15-minute averages in this range
    avg_stmt = (
        select(Averages)
        .where(
            Averages.parameter_id.in_(param_ids),
            Averages.avg_type == AverageType.avg_15min,
            Averages.timestamp >= utc_start,
            Averages.timestamp <= utc_end,
        )
        .order_by(Averages.timestamp.asc())
    )
    avg_res = await db.execute(avg_stmt)
    averages = avg_res.scalars().all()

    # Group averages by parameter_id
    averages_by_param = defaultdict(list)
    for avg in averages:
        averages_by_param[avg.parameter_id].append(avg)

    new_rows = []
    for m in mappings:
        param = m.parameter
        station_name = m.cpcb_station_name or m.api_id or (
            param.device.station.name
            if param and hasattr(param, "device") and param.device and param.device.station
            else "Unknown"
        )
        param_code = m.cpcb_parameter or m.api_vname or (param.tag_name if param else "")
        if not param_code:
            continue

        param_avgs = sorted(averages_by_param[m.parameter_id], key=lambda x: x.timestamp)
        for avg in param_avgs:
            # Convert UTC database timestamp to local time for formatting
            local_from = avg.timestamp.replace(tzinfo=timezone.utc).astimezone()
            local_to = local_from + timedelta(minutes=15)

            date_from_str = local_from.strftime("%d-%m-%Y %H:%M")
            date_to_str   = local_to.strftime("%d-%m-%Y %H:%M")

            value_str = f"{avg.value:.2f}" if avg.value is not None else ""
            calib_flag = 0
            maint_flag = 0
            remark = ""
            if avg.quality and str(avg.quality.value if hasattr(avg.quality, "value") else avg.quality) != "good":
                remark = str(avg.quality.value if hasattr(avg.quality, "value") else avg.quality)

            row = f"{station_name},{param_code},{date_from_str},{date_to_str},{value_str},{calib_flag},{maint_flag},{remark},"
            new_rows.append(row)

    header1 = "1,2,3,4,5,6,7,8,"
    header2 = "Station name, Parameter, Date from, Date to, Value,calibrationflag,maint flag,Remark,"
    file_content = header1 + "\n" + header2 + "\n"
    for r in new_rows:
        file_content += r + "\n"

    # Save to file locally if path is configured
    base_file_path = config.cpcb_file_path
    if base_file_path:
        dir_name = os.path.dirname(base_file_path)
        base_name = os.path.basename(base_file_path)
        name_part, ext_part = os.path.splitext(base_name)
        makeup_filename = f"{name_part}_makeup_{date_str}{ext_part}"
        makeup_file_path = os.path.join(dir_name, makeup_filename)

        try:
            if dir_name:
                os.makedirs(dir_name, exist_ok=True)
            with open(makeup_file_path, "w", encoding="utf-8") as f:
                f.write(file_content)
            log.info(f"[CPCB] Saved historical makeup file: '{makeup_file_path}'")
        except Exception as write_err:
            log.error(f"[CPCB] Failed to write makeup file '{makeup_file_path}': {write_err}")

    return file_content


# ─────────────────────────────────────────────────────────────────────────────
# Main scheduler entry point
# ─────────────────────────────────────────────────────────────────────────────

async def run_server_push(mode: str = "live"):
    """
    Called by APScheduler:
      mode="live"  → every  1 minute  — TGPCB live push, check CPCB files
      mode="delay" → every 15 minutes — TGPCB delay push, check CPCB files
    """
    async with AsyncSessionLocal() as db:
        conf_result = await db.execute(
            select(ServerConfig).filter(ServerConfig.is_active == True)
        )
        servers = conf_result.scalars().all()

        for config in servers:
            proto = (config.protocol or "tspcb").lower()

            if proto == "cpcb":
                # Check CPCB flat-file on every run (both live & delay)
                await _push_cpcb(config, db)

            elif proto == "both":
                # Both — TGPCB (live + delay) and CPCB (on every run)
                if mode == "live":
                    await _push_tgpcb(config, db, "live")
                elif mode == "delay":
                    await _push_tgpcb(config, db, "delay")
                
                await _push_cpcb(config, db)

            else:
                # TGPCB — HTTP JSON push (live + delay)
                await _push_tgpcb(config, db, mode)
