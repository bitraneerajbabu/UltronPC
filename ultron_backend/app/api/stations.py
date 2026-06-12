"""UltrON — Stations API"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from app.database import get_db
from app.models.station import Station
from app.schemas.station import StationCreate, StationUpdate, StationOut

router = APIRouter(prefix="/stations", tags=["Stations"])


@router.get("/", response_model=List[StationOut])
async def list_stations(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Station).order_by(Station.id))
    return result.scalars().all()


@router.post("/", response_model=StationOut, status_code=status.HTTP_201_CREATED)
async def create_station(payload: StationCreate, db: AsyncSession = Depends(get_db)):
    station = Station(**payload.model_dump())
    db.add(station)
    await db.flush()
    await db.refresh(station)
    return station


@router.get("/{station_id}", response_model=StationOut)
async def get_station(station_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Station).where(Station.id == station_id))
    station = result.scalar_one_or_none()
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
    return station


@router.patch("/{station_id}", response_model=StationOut)
async def update_station(station_id: int, payload: StationUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Station).where(Station.id == station_id))
    station = result.scalar_one_or_none()
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
    for field, val in payload.model_dump(exclude_unset=True).items():
        setattr(station, field, val)
    await db.flush()
    await db.refresh(station)
    return station


@router.delete("/{station_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_station(station_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Station).where(Station.id == station_id))
    station = result.scalar_one_or_none()
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
    await db.delete(station)
