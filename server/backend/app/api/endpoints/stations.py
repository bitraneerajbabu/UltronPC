from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.db.database import get_db
from app.models.core import Station
from app.schemas.api_models import StationCreate, StationUpdate, StationResponse
from app.api.deps import get_auth_context, AuthContext

router = APIRouter()

@router.get("/", response_model=List[StationResponse])
def list_stations(site_id: int, db: Session = Depends(get_db), auth: AuthContext = Depends(get_auth_context)):
    if not auth.is_admin:
        raise HTTPException(403, detail="Admin access required")
    return db.query(Station).filter(Station.site_id == site_id).order_by(Station.created_at).all()

@router.post("/", response_model=StationResponse, status_code=201)
def create_station(payload: StationCreate, site_id: int, db: Session = Depends(get_db), auth: AuthContext = Depends(get_auth_context)):
    if not auth.is_admin:
        raise HTTPException(403, detail="Admin access required")
    from app.api.endpoints.sites import generate_token
    from app.models.core import IndustrySite
    site = db.query(IndustrySite).filter(IndustrySite.id == site_id).first()
    
    # StationCreate doesn't have api_key, so we just generate one
    token = getattr(payload, 'api_key', None) or generate_token(site.name if site else "station")
    
    station = Station(site_id=site_id, station_id=payload.station_id, username=payload.username,
                      category=payload.category, station_name=payload.station_name, api_key=token)
    db.add(station)
    db.commit()
    db.refresh(station)
    return station

@router.patch("/{station_id}", response_model=StationResponse)
def update_station(station_id: int, payload: StationUpdate, db: Session = Depends(get_db), auth: AuthContext = Depends(get_auth_context)):
    if not auth.is_admin:
        raise HTTPException(403, detail="Admin access required")
    station = db.query(Station).filter(Station.id == station_id).first()
    if not station:
        raise HTTPException(404, detail="Station not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(station, k, v)
    db.commit()
    db.refresh(station)
    return station

@router.delete("/{station_id}", status_code=204)
def delete_station(station_id: int, db: Session = Depends(get_db), auth: AuthContext = Depends(get_auth_context)):
    if not auth.is_admin:
        raise HTTPException(403, detail="Admin access required")
    station = db.query(Station).filter(Station.id == station_id).first()
    if not station:
        raise HTTPException(404, detail="Station not found")
    db.delete(station)
    db.commit()
