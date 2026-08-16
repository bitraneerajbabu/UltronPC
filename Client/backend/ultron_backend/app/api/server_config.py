"""UltrON — Server Config API"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func
from sqlalchemy.orm import joinedload
from typing import List, Optional
from app.database import get_db
from app.models.server_config import ServerConfig, ServerParameterMapping
from app.models.parameter import Parameter
from app.models.device import Device
from app.models.station import Station
from app.models.telemetry import PendingUpload
from app.schemas.server_config import (
    ServerConfigCreate, ServerConfigUpdate, ServerConfigResponse,
    ParameterMappingResponse, BulkMappingUpdate, ServerMappingBase
)
from app.core.security import require_server_mgmt, require_server_mgmt
from app.core.logger import get_logger

log = get_logger("ultron.api.server_config")
router = APIRouter(prefix="/server-config", tags=["Server Config"], dependencies=[Depends(require_server_mgmt)])

@router.get("/", response_model=List[ServerConfigResponse], dependencies=[Depends(require_server_mgmt)])
async def get_all_servers(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ServerConfig).order_by(ServerConfig.id))
    servers = result.scalars().all()
    
    # Delete legacy RajAPI ServerConfig entry if it still exists
    rajapi = next((s for s in servers if s.name == "RajAPI"), None)
    if rajapi:
        await db.delete(rajapi)
        await db.commit()
        servers = [s for s in servers if s.id != rajapi.id]

    return servers

@router.post("/", response_model=ServerConfigResponse, dependencies=[Depends(require_server_mgmt)])
async def create_server(config_in: ServerConfigCreate, db: AsyncSession = Depends(get_db)):
    # Check if name exists
    res = await db.execute(select(ServerConfig).filter(ServerConfig.name == config_in.name))
    if res.scalars().first():
        raise HTTPException(status_code=400, detail="Server with this name already exists")
    
    server = ServerConfig(**config_in.model_dump())
    db.add(server)
    await db.commit()
    await db.refresh(server)
    return server

@router.get("/mappings", response_model=List[ParameterMappingResponse], dependencies=[Depends(require_server_mgmt)])
async def get_mappings(db: AsyncSession = Depends(get_db)):
    # Fetch all active parameters with device and station
    stmt = (
        select(Parameter)
        .options(
            joinedload(Parameter.device).joinedload(Device.station),
            joinedload(Parameter.server_mappings)
        )
        .outerjoin(Parameter.device)
        .filter(Parameter.is_active == True)
        .order_by(Device.station_id, Device.id, Parameter.id)
    )
    result = await db.execute(stmt)
    parameters = result.scalars().unique().all()
    
    response = []
    for p in parameters:
        mappings_dict = {}
        for m in p.server_mappings:
            mappings_dict[m.server_id] = ServerMappingBase(
                server_id=m.server_id,
                is_active=m.is_active,
                api_id=m.api_id,
                api_name=m.api_name,
                api_password=m.api_password,
                api_vname=m.api_vname,
                api_unit=m.api_unit,
                cpcb_station_name=m.cpcb_station_name,
                cpcb_parameter=m.cpcb_parameter,
                led_channel_name=m.led_channel_name,
                led_unit=m.led_unit,
                appcb_monitoring_unit_id=m.appcb_monitoring_unit_id,
                appcb_analyzer_id=m.appcb_analyzer_id,
                appcb_parameter_id=m.appcb_parameter_id,
                appcb_parameter_name=m.appcb_parameter_name,
                appcb_unit_id=m.appcb_unit_id,
            )
            
        station_name = p.device.station.name if p.device and p.device.station else "Unknown Station"
        device_name = p.device.name if p.device else "Unknown Device"
        device_id = p.device_id if p.device else None
        
        response.append(ParameterMappingResponse(
            parameter_id=p.id,
            parameter_name=p.tag_name,
            station_name=station_name,
            device_id=device_id,
            device_name=device_name,
            channel_no=p.display_order,
            mappings=mappings_dict
        ))
    return response

@router.put("/mappings", dependencies=[Depends(require_server_mgmt)])
async def update_mappings(updates: List[BulkMappingUpdate], db: AsyncSession = Depends(get_db)):
    for update in updates:
        for server_id, mapping_data in update.mappings.items():
            # Find existing mapping
            stmt = select(ServerParameterMapping).filter(
                ServerParameterMapping.parameter_id == update.parameter_id,
                ServerParameterMapping.server_id == server_id
            )
            res = await db.execute(stmt)
            mapping = res.scalars().first()

            # Dump mapping fields, always exclude server_id (it's the FK key — never update it)
            data_dict = mapping_data.model_dump(exclude={"server_id"})

            if mapping:
                # Update existing — never overwrite the FK server_id
                for key, value in data_dict.items():
                    setattr(mapping, key, value)
            else:
                # Create new — set server_id explicitly from the loop key
                new_mapping = ServerParameterMapping(
                    parameter_id=update.parameter_id,
                    server_id=server_id,
                    **data_dict
                )
                db.add(new_mapping)

    await db.commit()
    return {"detail": "Mappings updated successfully"}

@router.put("/{server_id}", response_model=ServerConfigResponse, dependencies=[Depends(require_server_mgmt)])
async def update_server(server_id: int, config_in: ServerConfigUpdate, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(ServerConfig).filter(ServerConfig.id == server_id))
    server = res.scalars().first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
        
    for key, value in config_in.model_dump(exclude_unset=True).items():
        setattr(server, key, value)
        
    await db.commit()
    await db.refresh(server)
    return server

@router.delete("/{server_id}", dependencies=[Depends(require_server_mgmt)])
async def delete_server(server_id: int, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(ServerConfig).filter(ServerConfig.id == server_id))
    server = res.scalars().first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    
    # Delete associated child records (mappings and pending uploads)
    await db.execute(delete(ServerParameterMapping).where(ServerParameterMapping.server_id == server_id))
    await db.execute(delete(PendingUpload).where(PendingUpload.server_config_id == server_id))
    
    await db.delete(server)
    await db.commit()
    return {"detail": "Server deleted"}

@router.post("/{server_id}/generate-historical", dependencies=[Depends(require_server_mgmt)])
async def generate_historical(server_id: int, date: str, db: AsyncSession = Depends(get_db)):
    from fastapi.responses import PlainTextResponse
    from app.services.server_push import generate_historical_cpcb_file

    res = await db.execute(select(ServerConfig).filter(ServerConfig.id == server_id))
    server = res.scalars().first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    
    if (server.protocol or "tspcb").lower() != "cpcb":
        raise HTTPException(status_code=400, detail="Historical generation only supported for CPCB protocol")
        
    try:
        content = await generate_historical_cpcb_file(db, server, date)
        headers = {
            "Content-Disposition": f'attachment; filename="{server.name or "cpcb"}_makeup_{date}.txt"'
        }
        return PlainTextResponse(content, headers=headers)
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as e:
        log.error(f"Failed to generate historical CPCB file for server {server_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")

@router.post("/{server_id}/test-push", dependencies=[Depends(require_server_mgmt)])
async def test_server_push(
    server_id: int,
    parameter_id: Optional[int] = Query(None),
    api_id: Optional[str] = Query(None),
    device_id: Optional[int] = Query(None),
    station_name: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(select(ServerConfig).filter(ServerConfig.id == server_id))
    server = res.scalars().first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    
    proto = (server.protocol or "tspcb").lower()
    if proto == "cpcb":
        raise HTTPException(status_code=400, detail="Test push only supported for HTTP/JSON/APPCB protocols")

    if proto == "appcb":
        from app.services.server_push import _push_appcb
        res_dict = await _push_appcb(server, db, mode="live", bypass_license=True)
        return {
            "results": [{
                "device_id": server.appcb_site_id or "APPCB",
                "status_code": res_dict.get("status_code", 0),
                "response": res_dict.get("response", ""),
                "success": res_dict.get("success", False)
            }]
        }
        
    from app.services.server_push import _build_spcb_payloads
    import httpx
    
    payloads = await _build_spcb_payloads(
        db, server_id, mode="live",
        parameter_id=parameter_id, api_id=api_id, device_id=device_id, station_name=station_name
    )
    if not payloads:
        raise HTTPException(
            status_code=400,
            detail="No active mappings found to push. Please: 1. Turn the Push toggle ON for at least one parameter in the table, 2. Enter a Device ID, and 3. Click Save."
        )
        
    target_url = server.live_url
    if not target_url:
        raise HTTPException(status_code=400, detail="Live URL is not configured")
        
    results = []
    async with httpx.AsyncClient(timeout=10.0) as client:
        for payload in payloads:
            device_id = payload.get("DeviceID", "?")
            try:
                response = await client.post(target_url, json=payload)
                results.append({
                    "device_id": device_id,
                    "status_code": response.status_code,
                    "response": response.text,
                    "success": response.status_code < 300
                })
            except Exception as e:
                err_detail = str(e).strip() or repr(e) or type(e).__name__
                results.append({
                    "device_id": device_id,
                    "status_code": 0,
                    "response": (
                        f"Connection Failed (HTTP 0): Could not reach target server at '{target_url}'.\n"
                        f"Reason: {err_detail}\n\n"
                        f"Troubleshooting Hints:\n"
                        f"1. Check if the target server URL ('{target_url}') is correct.\n"
                        f"2. Ensure the SPCB receiving server is running and online on your network.\n"
                        f"3. Verify firewall settings permit outbound HTTP traffic on this port."
                    ),
                    "success": False
                })
                
    return {"results": results}


@router.post("/{server_id}/test-delay-push", dependencies=[Depends(require_server_mgmt)])
async def test_server_delay_push(
    server_id: int,
    parameter_id: Optional[int] = Query(None),
    api_id: Optional[str] = Query(None),
    device_id: Optional[int] = Query(None),
    station_name: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """Test the DELAY (15-min) push to verify the Delay URL is working."""
    res = await db.execute(select(ServerConfig).filter(ServerConfig.id == server_id))
    server = res.scalars().first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    proto = (server.protocol or "tspcb").lower()
    if proto == "cpcb":
        raise HTTPException(status_code=400, detail="Test delay push only supported for HTTP/JSON/APPCB protocols")

    if not server.delay_url:
        raise HTTPException(
            status_code=400,
            detail="Delay URL is not configured for this server. "
                   "Set a Delay URL in the Server Push Mappings page."
        )

    if proto == "appcb":
        from app.services.server_push import _push_appcb
        res_dict = await _push_appcb(server, db, mode="delay", bypass_license=True)
        return {
            "results": [{
                "device_id": server.appcb_site_id or "APPCB",
                "status_code": res_dict.get("status_code", 0),
                "response": res_dict.get("response", ""),
                "success": res_dict.get("success", False)
            }],
            "url_used": server.delay_url
        }

    from app.services.server_push import _build_spcb_payloads
    import httpx

    payloads = await _build_spcb_payloads(
        db, server_id, mode="delay",
        parameter_id=parameter_id, api_id=api_id, device_id=device_id, station_name=station_name
    )
    if not payloads:
        raise HTTPException(
            status_code=400,
            detail="No active mappings found to push. Please: 1. Turn the Push toggle ON for at least one parameter in the table, 2. Enter a Device ID, and 3. Click Save."
        )

    results = []
    async with httpx.AsyncClient(timeout=10.0) as client:
        for payload in payloads:
            device_id = payload.get("DeviceID", "?")
            try:
                response = await client.post(server.delay_url, json=payload)
                results.append({
                    "device_id": device_id,
                    "status_code": response.status_code,
                    "response": response.text,
                    "success": response.status_code < 300
                })
            except Exception as e:
                err_detail = str(e).strip() or repr(e) or type(e).__name__
                results.append({
                    "device_id": device_id,
                    "status_code": 0,
                    "response": (
                        f"Connection Failed (HTTP 0): Could not reach delay server at '{server.delay_url}'.\n"
                        f"Reason: {err_detail}\n\n"
                        f"Troubleshooting Hints:\n"
                        f"1. Check if the Delay URL ('{server.delay_url}') is correct.\n"
                        f"2. Ensure the SPCB receiving server is running and online on your network.\n"
                        f"3. Verify firewall settings permit outbound HTTP traffic on this port."
                    ),
                    "success": False
                })

    return {"results": results, "url_used": server.delay_url}


@router.post("/{server_id}/test-url", dependencies=[Depends(require_server_mgmt)])
async def test_server_urls(server_id: int, payload: dict | None = None, db: AsyncSession = Depends(get_db)):
    """Check reachability of Live and Delay URLs without sending data.
    Accepts optional {'live_url': ..., 'delay_url': ...} to test URLs not yet saved."""
    res = await db.execute(select(ServerConfig).filter(ServerConfig.id == server_id))
    server = res.scalars().first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    live_url = (payload or {}).get("live_url") or server.live_url
    delay_url = (payload or {}).get("delay_url") or server.delay_url

    import httpx
    from datetime import datetime

    async def _check(label: str, url: str | None) -> dict:
        if not url:
            return {"label": label, "url": "", "reachable": False, "status_code": 0, "latency_ms": 0, "error": "URL not configured", "body": ""}
        try:
            start = datetime.utcnow()
            async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
                resp = await client.get(url)
            latency_ms = int((datetime.utcnow() - start).total_seconds() * 1000)
            body = resp.text.strip()[:500] if resp.text else ""
            return {
                "label": label, "url": url, "reachable": resp.status_code < 500,
                "status_code": resp.status_code, "latency_ms": latency_ms,
                "error": None if resp.status_code < 500 else f"Server responded with HTTP {resp.status_code}",
                "body": body,
            }
        except Exception as e:
            return {"label": label, "url": url, "reachable": False, "status_code": 0, "latency_ms": 0, "error": str(e).strip() or repr(e), "body": ""}

    results = []
    if (server.protocol or "tspcb").lower() != "cpcb":
        results.append(await _check("Live URL", live_url))
        results.append(await _check("Delay URL", delay_url))

    return {"results": results}


# ─── Pending Uploads ──────────────────────────────────────────────────────────

@router.get("/{server_id}/pending-count", dependencies=[Depends(require_server_mgmt)])
async def get_pending_count(server_id: int, db: AsyncSession = Depends(get_db)):
    """Return count of pending uploads for a given server config."""
    result = await db.execute(
        select(func.count(PendingUpload.id)).where(PendingUpload.server_config_id == server_id)
    )
    count = result.scalar() or 0
    return {"server_id": server_id, "pending_count": count}


@router.get("/pending-counts", dependencies=[Depends(require_server_mgmt)])
async def get_all_pending_counts(db: AsyncSession = Depends(get_db)):
    """Return pending counts grouped by server config."""
    rows = await db.execute(
        select(PendingUpload.server_config_id, func.count(PendingUpload.id).label("cnt"))
        .group_by(PendingUpload.server_config_id)
    )
    counts = {row.server_config_id: row.cnt for row in rows}
    return counts


@router.delete("/{server_id}/pending-records", dependencies=[Depends(require_server_mgmt)])
async def delete_pending_records(server_id: int, db: AsyncSession = Depends(get_db)):
    """Delete all pending upload records for a given server config."""
    result = await db.execute(
        delete(PendingUpload).where(PendingUpload.server_config_id == server_id)
    )
    await db.commit()
    return {"deleted": result.rowcount, "server_id": server_id}


