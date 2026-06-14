from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.schemas.api_models import ClientSyncPayload
from app.api.deps import get_current_site
from app.models.core import IndustrySite, TelemetryData, Parameter, Device

router = APIRouter()

@router.post("/")
def sync_telemetry(
    payload: ClientSyncPayload,
    db: Session = Depends(get_db),
    site: IndustrySite = Depends(get_current_site)
):
    # Process the incoming points
    for point in payload.points:
        # Check if parameter exists, create if not
        param = db.query(Parameter).filter(
            Parameter.tag_name == point.tag_name,
            Parameter.device.has(site_id=site.id) # basic check, ideally device_id is part of payload
        ).first()

        if not param:
            # Find or create a generic device for this site to attach parameters to
            generic_device = db.query(Device).filter(Device.site_id == site.id, Device.name == "Default Sync Device").first()
            if not generic_device:
                generic_device = Device(site_id=site.id, name="Default Sync Device", status="online")
                db.add(generic_device)
                db.flush()

            param = Parameter(
                tag_name=point.tag_name,
                name=point.tag_name,
                device_id=generic_device.id
            )
            db.add(param)
            db.flush() # get ID
            
        telemetry = TelemetryData(
            site_id=site.id,
            parameter_id=param.id,
            value=point.value,
            quality=point.quality,
            timestamp=point.timestamp
        )
        db.add(telemetry)
        
    db.commit()
    return {"status": "success", "synced_points": len(payload.points)}
