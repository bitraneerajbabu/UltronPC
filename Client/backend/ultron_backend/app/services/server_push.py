"""
UltrON — Server Push Engine

Supports two push protocols:
  • SPCB  — HTTP POST JSON (like SPCB / CPCB online portals that accept JSON)
              Live push  : every 1 minute  → live_url
              Delay push : every 15 minutes → delay_url (scheduler 900s)

   • CPCB   — CSV flat-file (CPCB IT Division Annexure-I format)
              Written every 1 minute to cpcb_file_path (dedup prevents duplicates)
             Format: StationName,Parameter,DateFrom,DateTo,Value,CalibFlag,MaintFlag,Remark
"""

import os
import asyncio
import json
import httpx
from datetime import datetime, timedelta, timezone
from sqlalchemy import select, func
from sqlalchemy.orm import joinedload, selectinload
from collections import defaultdict

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.server_config import ServerConfig, ServerParameterMapping
from app.models.system_state import SystemState
from app.models.telemetry import LiveData, Averages, AverageType, DataQuality, PendingUpload, SystemLog
from app.models.parameter import Parameter
from app.models.device import Device
from app.models.station import Station
from app.core.logger import get_logger
from app.services.license_manager import is_cpcb_upload_allowed
from app.services.lock_store import is_push_allowed, get_lock_status
from app.services.rajapi_sync import _load_rajapi_config

log = get_logger("ultron.server_push")


def _quality_str(avg: object) -> str:
    if not avg or not hasattr(avg, 'quality'):
        return ""
    q = avg.quality.value if hasattr(avg.quality, "value") else avg.quality
    return str(q)


def _cpcb_row(station_name: str, param_code: str, local_from: datetime, value: float | None, quality: object) -> str:
    local_to = local_from + timedelta(minutes=15)
    date_from = local_from.strftime("%d-%m-%Y %H:%M")
    date_to = local_to.strftime("%d-%m-%Y %H:%M")
    value_str = f"{value:.2f}" if value is not None else ""
    q = _quality_str(quality)
    remark = q if q != "U" else ""
    return f"{station_name},{param_code},{date_from},{date_to},{value_str},0,0,{remark},"


# ─────────────────────────────────────────────────────────────────────────────
# SPCB — JSON HTTP Push
# ─────────────────────────────────────────────────────────────────────────────

async def _build_spcb_payloads(db, server_id: int, mode: str = "live") -> list:
    """
    Build SPCB-style JSON payload list.
    Groups parameters by (api_id, api_name, api_password) → one payload per group.
    
    If mode == "delay", fetches the latest 15-minute average value and sets
    the payload timestamp to that average's timestamp.
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

        # Determine payload Datetime based on averages if in delay mode
        payload_time = datetime.now()
        if mode == "delay" and maps:
            # Query the latest 15-minute average timestamp across mapped parameters in this group
            param_ids = [m.parameter_id for m in maps]
            time_stmt = (
                select(Averages.timestamp)
                .where(Averages.parameter_id.in_(param_ids), Averages.avg_type == AverageType.avg_15min)
                .order_by(Averages.timestamp.desc())
                .limit(1)
            )
            time_res = await db.execute(time_stmt)
            latest_time = time_res.scalar_one_or_none()
            if latest_time:
                payload_time = latest_time

        payload = {
            "DeviceID": device_id_val,
            "FunctionName": 53,
            "Datetime": payload_time.strftime("%Y-%m-%d %H:%M:%S"),
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
            val = ""
            if mode == "delay":
                # Get the latest 15-minute average for this parameter
                avg_res = await db.execute(
                    select(Averages)
                    .where(Averages.parameter_id == m.parameter_id, Averages.avg_type == AverageType.avg_15min)
                    .order_by(Averages.timestamp.desc())
                    .limit(1)
                )
                avg = avg_res.scalars().first()
                if avg and avg.value is not None:
                    try:
                        val = round(float(avg.value), 2)
                    except (ValueError, TypeError):
                        val = avg.value
            else:
                # LiveData holds exactly one row per parameter
                ld_res = await db.execute(
                    select(LiveData).where(LiveData.parameter_id == m.parameter_id)
                )
                ld = ld_res.scalars().first()
                if ld and ld.value is not None:
                    try:
                        val = round(float(ld.value), 2)
                    except (ValueError, TypeError):
                        val = ld.value

            param = m.parameter
            payload["Variables"].append({
                "Variablename": m.api_vname or (param.tag_name if param else ""),
                "Value": val,
                "Unit": m.api_unit or (param.unit if param else ""),
                "Flags": "",
            })

        payloads.append(payload)

    return payloads


async def _check_server_reachable(url: str, timeout: float = 5.0) -> bool:
    """Quick HEAD check if server is reachable before pushing."""
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            await client.head(url, follow_redirects=True)
        return True
    except Exception:
        return False


async def _push_spcb(config: ServerConfig, db, mode: str):
    """HTTP POST each payload to the configured SPCB URL."""
    if not await is_cpcb_upload_allowed(db):
        log.warning(f"[SPCB/{mode.upper()}] Push blocked by license — queuing to PendingUpload")
        payloads = await _build_spcb_payloads(db, config.id, mode)
        target = config.live_url if mode == "live" else config.delay_url
        for payload in payloads:
            db.add(PendingUpload(
                server_config_id=config.id,
                url=target or "",
                payload=payload,
                mode=mode,
                last_error="Queued (license blocked)",
            ))
        await db.commit()
        log.info(f"[SPCB/{mode.upper()}] Queued {len(payloads)} payload(s)")
        return

    target_url = config.live_url if mode == "live" else config.delay_url
    if not target_url:
        log.warning(
            f"[SPCB/{mode.upper()}] ⚠ Server '{config.name}' has no {'Live' if mode == 'live' else 'Delay'} URL configured — "
            f"{mode} push skipped."
        )
        return

    # Quick per-server connectivity check
    if not await _check_server_reachable(target_url):
        log.warning(f"[SPCB/{mode.upper()}] Server '{config.name}' unreachable at {target_url} — skipping push.")
        return

    try:
        payloads = await _build_spcb_payloads(db, config.id, mode)
        if not payloads:
            log.debug(f"[SPCB/{mode.upper()}] No active mappings for '{config.name}' — skipping.")
            return

        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
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
                            f"[SPCB/{mode.upper()}] [OK] DeviceID={device_id} → '{config.name}' HTTP {res.status_code}. "
                            f"Parameters Posted: [{param_summary}]"
                        )
                    else:
                        log.warning(
                            f"[SPCB/{mode.upper()}] [FAIL] DeviceID={device_id} → '{config.name}' HTTP {res.status_code}: {res.text[:200]}. "
                            f"Parameters Attempted: [{param_summary}]"
                        )
                except Exception as e:
                    log.error(
                        f"[SPCB/{mode.upper()}] Push error DeviceID={device_id} → "
                        f"'{config.name}' (Parameters: [{param_summary}]): {e}"
                    )
                    # Queue the failed payload for retry
                    db.add(PendingUpload(
                        server_config_id=config.id,
                        url=target_url,
                        payload=payload,
                        mode=mode,
                        last_error=str(e)[:500],
                    ))
                    await db.commit()
    except Exception as e:
        log.error(f"[SPCB/{mode.upper()}] Build/push failed for '{config.name}': {e}")



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
    if not await is_cpcb_upload_allowed(db):
        log.warning(f"[CPCB] Push blocked by license — deferring")
        return

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
        .options(
            selectinload(ServerParameterMapping.parameter).selectinload(Parameter.device).selectinload(Device.station)
        )
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

        date_from_str = local_from.strftime("%d-%m-%Y %H:%M")

        # Check for duplicates
        if (station_name, param_code, date_from_str, (local_from + timedelta(minutes=15)).strftime("%d-%m-%Y %H:%M")) in existing_records:
            skipped_count += 1
            continue

        val_repr = f"{avg.value:.2f}" if avg.value is not None else "NOT_POSTED (No average)"
        row = _cpcb_row(station_name, param_code, local_from, avg.value, avg)

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
        f"[CPCB] [OK] Wrote {len(new_rows)} new row(s) to '{file_path}'. "
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
        .options(
            selectinload(ServerParameterMapping.parameter).selectinload(Parameter.device).selectinload(Device.station)
        )
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
            local_from = avg.timestamp.replace(tzinfo=timezone.utc).astimezone()
            row = _cpcb_row(station_name, param_code, local_from, avg.value, avg)
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
# Internet Connectivity Check
# ─────────────────────────────────────────────────────────────────────────────

_last_net_ok = True

async def check_connectivity():
    """
    Quick connectivity test by reaching a reliable endpoint.
    Logs a WARNING when internet goes down and INFO when it recovers.
    """
    global _last_net_ok
    try:
        async with httpx.AsyncClient(timeout=5.0, follow_redirects=True) as client:
            await client.get("https://clients3.google.com/generate_204")
        if not _last_net_ok:
            log.info("[NET] [OK] Internet connectivity restored")
            _last_net_ok = True
    except Exception:
        if _last_net_ok:
            log.warning("[NET] [FAIL] Internet connectivity lost — pushes will be queued as pending")
            _last_net_ok = False


# ─────────────────────────────────────────────────────────────────────────────
# Pending Upload Retry
# ─────────────────────────────────────────────────────────────────────────────

async def retry_pending_uploads(db):
    """
    Attempt to send all queued pending uploads (called every 15 min in delay mode).
    Uses each server config's delay_url for retry.
    On success, the PendingUpload record is deleted.
    On failure, retry_count is incremented and last_error updated.
    """
    if not await is_cpcb_upload_allowed(db):
        log.warning(f"[RETRY] Upload blocked by license — deferring retry")
        return
    result = await db.execute(
        select(PendingUpload).order_by(PendingUpload.created_at.asc())
    )
    pending = result.scalars().all()

    if not pending:
        return

    log.info(f"[RETRY] Attempting {len(pending)} pending upload(s)...")

    # Preload server configs for delay URL lookup
    config_ids = {p.server_config_id for p in pending}
    configs = {}
    for cid in config_ids:
        c_res = await db.execute(select(ServerConfig).where(ServerConfig.id == cid))
        c = c_res.scalar_one_or_none()
        if c:
            configs[cid] = c

    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
        for p in pending:
            cfg = configs.get(p.server_config_id)
            target_url = cfg.delay_url if (cfg and cfg.delay_url) else p.url
            if not target_url:
                continue

            headers = {}
            if target_url == settings.CENTRAL_API_URL or "api/v1/sync" in target_url:
                api_key, _ = await _load_rajapi_config(db)
                if api_key:
                    headers["X-API-Key"] = api_key

            try:
                res = await client.post(target_url, json=p.payload, headers=headers)
                if res.status_code < 300:
                    await db.delete(p)
                    log.info(f"[RETRY] [OK] Delivered pending #{p.id} via {target_url}")
                else:
                    p.retry_count += 1
                    p.last_error = f"HTTP {res.status_code}"
                    log.warning(f"[RETRY] [FAIL] Pending #{p.id} HTTP {res.status_code}")
            except Exception as e:
                p.retry_count += 1
                p.last_error = str(e)[:500]
                log.warning(f"[RETRY] [FAIL] Pending #{p.id} failed: {e}")

    await db.commit()


async def _push_telemetry_to_rajapi(db, mode: str):
    """
    Push client telemetry to RajAPI for data analysis and compliance.
    Pushes live values when mode == "live", and 15-minute averages when mode == "delay".
    """
    from app.config import settings
    api_key = getattr(settings, "CENTRAL_API_KEY", "")
    station_id = getattr(settings, "RAJAPI_STATION_ID", "default_station") or "default_station"
    if not api_key:
        return

    target_url = settings.CENTRAL_API_URL
    if not target_url:
        return

    points = []
    try:
        if mode == "live":
            ld_stmt = select(LiveData).options(
                selectinload(LiveData.parameter).selectinload(Parameter.device).selectinload(Device.station)
            )
            ld_res = await db.execute(ld_stmt)
            live_data_list = ld_res.scalars().all()
            for ld in live_data_list:
                if ld.parameter:
                    try:
                        v = float(ld.value) if ld.value is not None else None
                    except (ValueError, TypeError):
                        v = None
                    q = ld.quality.value if hasattr(ld.quality, "value") else str(ld.quality)
                    st_name = (
                        ld.parameter.device.station.name
                        if ld.parameter.device and ld.parameter.device.station
                        else None
                    )
                    points.append({
                        "tag_name": ld.parameter.tag_name,
                        "value": v,
                        "quality": q,
                        "timestamp": ld.timestamp.isoformat() if hasattr(ld.timestamp, "isoformat") else str(ld.timestamp),
                        "unit": ld.parameter.unit or "",
                        "std_limit": ld.parameter.alarm_high,
                        "station_name": st_name,
                    })
        elif mode == "delay":
            cutoff = datetime.utcnow() - timedelta(minutes=30)
            avg_stmt = select(Averages).options(
                selectinload(Averages.parameter).selectinload(Parameter.device).selectinload(Device.station)
            ).where(
                Averages.avg_type == AverageType.avg_15min,
                Averages.timestamp >= cutoff
            )
            avg_res = await db.execute(avg_stmt)
            averages_list = avg_res.scalars().all()
            for avg in averages_list:
                if avg.parameter:
                    try:
                        v = float(avg.value) if avg.value is not None else None
                    except (ValueError, TypeError):
                        v = None
                    q = avg.quality.value if hasattr(avg.quality, "value") else str(avg.quality)
                    st_name = (
                        avg.parameter.device.station.name
                        if avg.parameter.device and avg.parameter.device.station
                        else None
                    )
                    points.append({
                        "tag_name": avg.parameter.tag_name,
                        "value": v,
                        "quality": q,
                        "timestamp": avg.timestamp.isoformat() if hasattr(avg.timestamp, "isoformat") else str(avg.timestamp),
                        "unit": avg.parameter.unit or "",
                        "std_limit": avg.parameter.alarm_high,
                        "station_name": st_name,
                    })

        if not points:
            return

        payload = {
            "client_id": station_id,
            "points": points
        }

        headers = {"X-API-Key": api_key}
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            res = await client.post(target_url, json=payload, headers=headers)
            if res.status_code < 300:
                log.info(f"[RajAPI/{mode.upper()}] [OK] Pushed {len(points)} telemetry points to RajAPI.")
            else:
                log.warning(f"[RajAPI/{mode.upper()}] [FAIL] RajAPI HTTP {res.status_code}: {res.text[:200]}")
    except Exception as e:
        log.error(f"[RajAPI/{mode.upper()}] Sync error: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# Pending Upload FIFO Cap & Audit (Phase 6 — LICENSE_LOCK_PLAN.md §7)
# ─────────────────────────────────────────────────────────────────────────────

async def enforce_pending_upload_cap(db):
    """
    Bounded backlog queue with FIFO overflow policy per LICENSE_LOCK_PLAN.md §7.

    - Reads cap from PENDING_UPLOAD_MAX_RECORDS (default 500000).
    - Warns when queue reaches 90% capacity.
    - When cap exceeded: drops OLDEST pending upload records (FIFO).
    - Each dropped record writes immutable SystemLog audit entry with:
        event_type='PUSH_BACKLOG_DROPPED_FIFO'
        tag_name, record_timestamp, dropped_at, reason
    - historical_data and Averages tables are NEVER touched.
    """
    max_records = getattr(settings, "PENDING_UPLOAD_MAX_RECORDS", 500000)
    warning_threshold = int(max_records * 0.9)

    # 1. Count current queue depth
    count_result = await db.execute(select(func.count(PendingUpload.id)))
    total = count_result.scalar() or 0

    # 2. 90% capacity warning
    if total >= warning_threshold:
        pct = round(total / max_records * 100, 1)
        msg = (
            f"[PENDING] Upload queue at {total}/{max_records} ({pct}%)"
        )
        if total > max_records:
            msg += " — CAPACITY EXCEEDED, dropping oldest FIFO records"
        else:
            msg += " — near capacity"
        log.warning(msg)

    if total <= max_records:
        return

    # 3. FIFO overflow: drop oldest excess records
    excess = total - max_records
    result = await db.execute(
        select(PendingUpload)
        .order_by(PendingUpload.created_at.asc())
        .limit(excess)
    )
    to_drop = result.scalars().all()
    dropped_count = 0

    for record in to_drop:
        # Parse tag_names from payload JSON
        tag_names = []
        if record.payload and isinstance(record.payload, dict):
            variables = record.payload.get("Variables", [])
            timestamp = record.payload.get("Datetime", "")
            for v in variables:
                tn = v.get("Variablename", "")
                if tn:
                    tag_names.append(tn)

        # Immutable audit log entry
        details = {
            "event_type": "PUSH_BACKLOG_DROPPED_FIFO",
            "tag_name": tag_names,
            "payload_id": record.id,
            "server_config_id": record.server_config_id,
            "record_timestamp": str(record.created_at),
            "dropped_at": datetime.utcnow().isoformat(),
            "reason": f"Queue capacity reached — exceeded cap of {max_records}",
        }
        db.add(SystemLog(
            log_type="audit",
            level="WARNING",
            source="ultron.server_push.fifo",
            message=f"PUSH_BACKLOG_DROPPED_FIFO: dropped pending upload #{record.id} (tag_names={tag_names})",
            details=json.dumps(details),
        ))
        await db.delete(record)
        dropped_count += 1

    await db.commit()
    log.warning(
        f"[PENDING] Dropped {dropped_count} oldest record(s). "
        f"Queue now at {max_records}/{max_records}."
    )


# ─────────────────────────────────────────────────────────────────────────────
# Unlock Transition Detection (Phase 7)
# ─────────────────────────────────────────────────────────────────────────────

_FLUSH_STATE_KEY = "last_known_upload_allowed"


async def _detect_and_trigger_flush(db):
    """
    Check if license state transitioned from blocked → allowed.
    If so, trigger the controlled flush of PendingUpload backlog.
    Stores last-known state in system_state for edge-to-edge comparison.

    Called at the start of each run_server_push() cycle.
    """
    allowed_now = await is_cpcb_upload_allowed(db)

    # Read last-known state
    r = await db.execute(
        select(SystemState.value).where(SystemState.key == _FLUSH_STATE_KEY)
    )
    row = r.scalar_one_or_none()
    was_allowed = (row == "True") if row else None

    # Store current state for next cycle
    r2 = await db.execute(
        select(SystemState).where(SystemState.key == _FLUSH_STATE_KEY)
    )
    existing = r2.scalar_one_or_none()
    if existing:
        existing.value = "True" if allowed_now else "False"
        existing.updated_at = datetime.utcnow()
    else:
        db.add(SystemState(
            key=_FLUSH_STATE_KEY,
            value="True" if allowed_now else "False",
        ))
    await db.commit()

    # Detect transition: blocked → allowed
    if was_allowed is False and allowed_now is True:
        log.info("[FLUSH] License state transitioned to allowed — triggering backlog flush")
        await flush_pending_uploads_on_unlock(db)


# ─────────────────────────────────────────────────────────────────────────────
# Controlled Delayed Flush (Phase 7 — LICENSE_LOCK_PLAN.md §8)
# ─────────────────────────────────────────────────────────────────────────────

# SystemState keys for flush progress
_FLUSH_PROGRESS_TOTAL = "flush_total_records"
_FLUSH_PROGRESS_FLUSHED = "flush_flushed_records"
_FLUSH_PROGRESS_IN_PROGRESS = "flush_in_progress"
_FLUSH_PROGRESS_LAST_ID = "last_flushed_record_id"

# Backoff schedule for HTTP 429/5xx responses (seconds)
_BACKOFF_SCHEDULE = [5, 10, 20, 60, 300]


async def _upsert_system_state(db, key: str, value: str):
    """Upsert a single system_state key. Caller must commit."""
    r = await db.execute(
        select(SystemState).where(SystemState.key == key)
    )
    existing = r.scalar_one_or_none()
    if existing:
        existing.value = value
        existing.updated_at = datetime.utcnow()
    else:
        db.add(SystemState(key=key, value=value))


async def flush_pending_uploads_on_unlock(db):
    """
    Rate-limited flush of pending upload backlog triggered on license unlock.

    - Reads PendingUpload in chronological order (oldest created_at first).
    - Rate limited to FLUSH_RATE_PER_SECOND records/sec (default 5).
    - Exponential backoff on HTTP 429/5xx: 5s, 10s, 20s, 60s, 300s cap.
    - Resumable: skips records with id <= last_flushed_record_id.
    - Records deleted ONLY after confirmed HTTP < 300 success.
    - Progress tracked via system_state keys.

    Does NOT modify or replace retry_pending_uploads() — that function
    continues to handle transient failures during normal (non-flush) operation.
    """
    rate = getattr(settings, "FLUSH_RATE_PER_SECOND", 5)
    backoff_cap = getattr(settings, "FLUSH_BACKOFF_CAP_SECONDS", 300)

    # Read last flushed record ID for resumability
    r = await db.execute(
        select(SystemState.value).where(SystemState.key == _FLUSH_PROGRESS_LAST_ID)
    )
    last_id_row = r.scalar_one_or_none()
    last_flushed_id = int(last_id_row) if (last_id_row and last_id_row.isdigit()) else 0

    # Count total records to flush
    count_q = await db.execute(
        select(func.count(PendingUpload.id)).where(PendingUpload.id > last_flushed_id)
    )
    total_to_flush = count_q.scalar() or 0
    if total_to_flush == 0:
        log.info("[FLUSH] No pending uploads to flush — nothing to do.")
        return

    # Set in-progress marker
    await _upsert_system_state(db, _FLUSH_PROGRESS_IN_PROGRESS, "true")
    await _upsert_system_state(db, _FLUSH_PROGRESS_TOTAL, str(total_to_flush))
    await _upsert_system_state(db, _FLUSH_PROGRESS_FLUSHED, "0")
    await db.commit()

    log.info(f"[FLUSH] Starting flush of {total_to_flush} record(s) at {rate}/sec")

    flushed_count = 0

    # Preload server configs for URL lookup
    pending_result = await db.execute(
        select(PendingUpload)
        .where(PendingUpload.id > last_flushed_id)
        .order_by(PendingUpload.created_at.asc())
    )
    pending_list = pending_result.scalars().all()
    config_ids = {p.server_config_id for p in pending_list}
    configs = {}
    for cid in config_ids:
        c_res = await db.execute(select(ServerConfig).where(ServerConfig.id == cid))
        c = c_res.scalar_one_or_none()
        if c:
            configs[cid] = c

    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
        for p in pending_list:
            cfg = configs.get(p.server_config_id)
            target_url = cfg.delay_url if (cfg and cfg.delay_url) else p.url
            if not target_url:
                continue

            # Build headers
            headers = {}
            if target_url == settings.CENTRAL_API_URL or "api/v1/sync" in target_url:
                api_key, _ = await _load_rajapi_config(db)
                if api_key:
                    headers["X-API-Key"] = api_key

            # Attempt POST with exponential backoff on 429/5xx
            success = False
            backoff_idx = 0
            while not success:
                try:
                    res = await client.post(target_url, json=p.payload, headers=headers)
                    if res.status_code < 300:
                        await db.delete(p)
                        flushed_count += 1
                        success = True
                        log.info(
                            f"[FLUSH] [OK] Delivered pending #{p.id} via {target_url} "
                            f"({flushed_count}/{total_to_flush})"
                        )
                    elif res.status_code in (429,) or 500 <= res.status_code < 600:
                        delay = _BACKOFF_SCHEDULE[min(backoff_idx, len(_BACKOFF_SCHEDULE) - 1)]
                        delay = min(delay, backoff_cap)
                        log.warning(
                            f"[FLUSH] [BACKOFF] Pending #{p.id} HTTP {res.status_code} "
                            f"— retrying in {delay}s (backoff idx {backoff_idx})"
                        )
                        await asyncio.sleep(delay)
                        backoff_idx += 1
                    else:
                        # Non-retryable HTTP error (4xx other than 429)
                        p.retry_count += 1
                        p.last_error = f"HTTP {res.status_code}"
                        log.warning(
                            f"[FLUSH] [FAIL] Pending #{p.id} HTTP {res.status_code} "
                            f"— skipped (non-retryable)"
                        )
                        success = True  # Skip this record, don't retry
                except Exception as e:
                    delay = _BACKOFF_SCHEDULE[min(backoff_idx, len(_BACKOFF_SCHEDULE) - 1)]
                    delay = min(delay, backoff_cap)
                    log.warning(
                        f"[FLUSH] [BACKOFF] Pending #{p.id} network error: {e} "
                        f"— retrying in {delay}s"
                    )
                    await asyncio.sleep(delay)
                    backoff_idx += 1

            # Persist progress after each record
            await _upsert_system_state(db, _FLUSH_PROGRESS_LAST_ID, str(p.id))
            await _upsert_system_state(db, _FLUSH_PROGRESS_FLUSHED, str(flushed_count))
            await db.commit()

            # Rate limiting: sleep between records
            await asyncio.sleep(1.0 / rate)

    # Clear in-progress marker
    await _upsert_system_state(db, _FLUSH_PROGRESS_IN_PROGRESS, "false")
    await db.commit()
    log.info(
        f"[FLUSH] Completed flush of {flushed_count}/{total_to_flush} record(s)."
    )


# ─────────────────────────────────────────────────────────────────────────────
# Main scheduler entry point
# ─────────────────────────────────────────────────────────────────────────────

async def run_server_push(mode: str = "live"):
    """
    Called by APScheduler:
      mode="live"  → every  1 minute  — SPCB live push, check CPCB files
      mode="delay" → every 15 minutes — SPCB delay push, check CPCB files

    When lock is active or AMC expired:
      - Polling continues (device reading NEVER stops)
      - Live data is queued as PendingUpload instead of pushed live
      - When lock is removed, queued data is posted from delay queue
    """
    async with AsyncSessionLocal() as db:
        # Check internet connectivity (logs state transitions)
        await check_connectivity()

        # Phase 7: detect license unlock transition and trigger backlog flush
        await _detect_and_trigger_flush(db)

        # Check lock status — if push blocked, queue instead of push
        push_allowed = await is_push_allowed()
        lock_info = await get_lock_status()

        if not push_allowed and mode == "live":
            log.info(f"[PUSH] Locked ({lock_info.get('lock_status')}) — queueing live data as pending")
            # Queue current live data as pending uploads instead of pushing
            ld_stmt = select(LiveData).options(selectinload(LiveData.parameter))
            ld_res = await db.execute(ld_stmt)
            live_data_list = ld_res.scalars().all()
            conf_result = await db.execute(
                select(ServerConfig).filter(ServerConfig.is_active == True)
            )
            servers = conf_result.scalars().all()
            for config in servers:
                payloads = await _build_spcb_payloads(db, config.id, "live")
                for payload in payloads:
                    db.add(PendingUpload(
                        server_config_id=config.id,
                        url=config.live_url or config.delay_url or "",
                        payload=payload,
                        mode="delay",
                        last_error="Queued (locked/AMC expired)",
                    ))
            await db.commit()
            await enforce_pending_upload_cap(db)
            log.info(f"[PUSH] [OK] Queued {len(servers)} server config(s) for delayed push")
            # Skip live push, still process delay retry
            if mode == "delay":
                await retry_pending_uploads(db)
            await enforce_pending_upload_cap(db)
            return

        conf_result = await db.execute(
            select(ServerConfig).filter(ServerConfig.is_active == True)
        )
        servers = conf_result.scalars().all()

        for config in servers:
            try:
                proto = (config.protocol or "tspcb").lower()

                if proto == "cpcb":
                    await _push_cpcb(config, db)

                elif proto == "both":
                    if mode == "live":
                        await _push_spcb(config, db, "live")
                    elif mode == "delay":
                        await _push_spcb(config, db, "delay")
                    await _push_cpcb(config, db)

                else:
                    await _push_spcb(config, db, mode)
            except Exception as e:
                log.error(f"[PUSH] Server '{config.name}' push failed: {e}")

        # Sync telemetry to RajAPI
        await _push_telemetry_to_rajapi(db, mode)

        if mode == "live":
            ld_stmt = select(LiveData).options(selectinload(LiveData.parameter))
            ld_res = await db.execute(ld_stmt)
            live_data_list = ld_res.scalars().all()
            param_vals = []
            for ld in live_data_list:
                if ld.parameter and ld.value is not None:
                    try:
                        v = round(float(ld.value), 2)
                    except (ValueError, TypeError):
                        v = ld.value
                    param_vals.append(f"{ld.parameter.tag_name}={v}")
            if param_vals:
                db.add(SystemLog(
                    log_type="comm",
                    level="INFO",
                    source="ultron.server_push",
                    message=f"Live parameters: {', '.join(param_vals)}",
                ))
                await db.commit()

        if mode == "delay":
            await retry_pending_uploads(db)

        await enforce_pending_upload_cap(db)
