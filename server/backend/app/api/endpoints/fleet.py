from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional, Dict, Any
from datetime import datetime

from app.db.database import get_db
from app.api.deps import AuthContext, get_auth_context
from app.models.core import IndustrySite

router = APIRouter()

@router.get("/hierarchy")
def get_fleet_hierarchy(db: Session = Depends(get_db), auth: AuthContext = Depends(get_auth_context)):
    if not auth.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    # Fetch all sites
    sites = db.query(IndustrySite).all()
    
    # Efficiently fetch latest telemetry for all parameters across all sites using DISTINCT ON
    sql = text("""
        SELECT DISTINCT ON (t.parameter_id)
               t.site_id,
               t.parameter_id,
               p.tag_name,
               p.name       AS param_name,
               p.unit,
               p.std_limit,
               p.station_name,
               d.id         AS device_id,
               d.name       AS device_name,
               d.status     AS device_status,
               d.api_key    AS device_api_key,
               t.value,
               t.quality,
               t.timestamp  AS last_telemetry_time
        FROM   telemetry_data t
        JOIN   parameters     p ON p.id = t.parameter_id
        JOIN   devices        d ON d.id = p.device_id
        ORDER  BY t.parameter_id, t.timestamp DESC
    """)
    rows = db.execute(sql).fetchall()

    # If there is no telemetry for a parameter, we still need to show the parameter in the hierarchy.
    # So we must also fetch all parameters/devices that might not have telemetry yet.
    # To do this cleanly, we fetch all devices and parameters in a single pass.
    
    devices_params_sql = text("""
        SELECT p.device_id,
               d.site_id,
               d.name AS device_name,
               d.status AS device_status,
               p.id AS parameter_id,
               p.tag_name,
               p.name AS param_name,
               p.unit,
               p.station_name
        FROM parameters p
        JOIN devices d ON d.id = p.device_id
    """)
    dp_rows = db.execute(devices_params_sql).fetchall()
    
    # We will build a tree: site_id -> station_name -> device_id -> parameter_id
    
    hierarchy = []
    
    for site in sites:
        site_data = {
            "id": site.id,
            "name": site.name,
            "location": site.location,
            "last_sync": site.last_sync.isoformat() if site.last_sync else None,
            "is_active": site.is_active,
            "amc_expiry": site.amc_expiry.isoformat() if site.amc_expiry else None,
            "stations": []
        }
        
        # Filter dp_rows for this site
        site_dp_rows = [r for r in dp_rows if r.site_id == site.id]
        site_t_rows = [r for r in rows if r.site_id == site.id]
        
        # Map parameter_id -> telemetry
        telemetry_map = {r.parameter_id: r for r in site_t_rows}
        
        # Group by station_name
        stations_map = {}
        
        for dp in site_dp_rows:
            station_name = dp.station_name or "Unknown Station"
            if station_name not in stations_map:
                stations_map[station_name] = {
                    "name": station_name,
                    "devices_map": {}
                }
            
            s_map = stations_map[station_name]
            dev_id = dp.device_id
            if dev_id not in s_map["devices_map"]:
                s_map["devices_map"][dev_id] = {
                    "id": dev_id,
                    "name": dp.device_name,
                    "status": dp.device_status,
                    "protocol": "Modbus TCP", # Legacy static value or parse from elsewhere
                    "parameters": []
                }
            
            d_map = s_map["devices_map"][dev_id]
            t_data = telemetry_map.get(dp.parameter_id)
            
            param_received_at = t_data.last_telemetry_time if t_data else None
            
            p_status = "NORMAL"
            if not t_data:
                p_status = "NO DATA"
            elif dp.device_status == "offline":
                p_status = "OFFLINE"
            
            d_map["parameters"].append({
                "id": dp.parameter_id,
                "name": dp.param_name,
                "tag_name": dp.tag_name,
                "value": t_data.value if t_data else None,
                "unit": dp.unit,
                "status": p_status,
                "received_at": param_received_at.isoformat() if param_received_at else None
            })
            
        for s_name, s_data in stations_map.items():
            devices_list = list(s_data["devices_map"].values())
            
            all_param_times = []
            for d in devices_list:
                d_times = [datetime.fromisoformat(p["received_at"]) for p in d["parameters"] if p["received_at"]]
                if d_times:
                    d["last_contact"] = max(d_times).isoformat()
                else:
                    d["last_contact"] = None
                
                all_param_times.extend(d_times)
                
            station_last_telemetry = max(all_param_times).isoformat() if all_param_times else None
            
            station_last_sync = site.last_sync.isoformat() if site.last_sync and station_last_telemetry else None
            
            param_count = sum(len(d["parameters"]) for d in devices_list)
            
            site_data["stations"].append({
                "name": s_name,
                "device_count": len(devices_list),
                "parameter_count": param_count,
                "last_sync": station_last_sync,
                "last_telemetry": station_last_telemetry,
                "devices": devices_list
            })
            
        hierarchy.append(site_data)
        
    return {"industries": hierarchy}
