"""UltrON — CPCB Parameter Mapping Service"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.cpcb import CPCBParameterMapping
from app.services.cpcb.validation_service import validate_cpcb_parameter, validate_conversion_factor


DEFAULT_MAPPINGS = [
    ("CO", "CO", "ppm", 1.145),
    ("SO2", "SO2", "ppb", 0.00262),
    ("NO", "NO", "ppb", 0.00123),
    ("NO2", "NO2", "ppb", 0.00188),
    ("NOX", "NOx", "ppb", 0.001),
    ("OZONE", "Ozone", "ppb", 0.00196),
    ("PM10", "PM10", "ug/m3", 1.0),
    ("PM25", "PM2.5", "ug/m3", 1.0),
    ("WS", "WS", "m/s", 1.0),
    ("WD", "WD", "degree", 1.0),
    ("AT", "AT", "degC", 1.0),
    ("RH", "RH", "%", 1.0),
    ("BP", "BP", "hPa", 1.0),
    ("SR", "SR", "W/m2", 1.0),
    ("RF", "RF", "mm", 1.0),
    ("VWS", "VWS", "m/s", 1.0),
    ("BENZENE", "Benzene", "ppb", 0.00319),
    ("TOLUENE", "Toluene", "ppb", 0.00377),
    ("XYLENE", "Xylene", "ppb", 0.00434),
    ("ETH_BENZENE", "Eth-Benzene", "ppb", 0.001),
    ("MP_XYLENE", "MP-Xylene", "ppb", 0.001),
    ("CH4", "CH4", "ppb", 0.00065),
    ("NH3", "NH3", "ppb", 0.00070),
    ("HCHO", "HCHO", "ppb", 0.00123),
    ("HG", "Hg", "ppb", 0.00820),
]


async def seed_default_mappings(db: AsyncSession):
    result = await db.execute(select(CPCBParameterMapping).limit(1))
    if result.scalar_one_or_none() is not None:
        return
    for internal_param, cpcb_param, unit, factor in DEFAULT_MAPPINGS:
        db.add(CPCBParameterMapping(
            internal_parameter=internal_param,
            cpcb_parameter=cpcb_param,
            unit=unit,
            conversion_factor=factor,
            enabled=True,
        ))
    await db.commit()


async def get_all_mappings(db: AsyncSession) -> list[CPCBParameterMapping]:
    result = await db.execute(
        select(CPCBParameterMapping).order_by(CPCBParameterMapping.id)
    )
    return result.scalars().all()


async def get_mapping_by_internal(db: AsyncSession, internal_parameter: str) -> CPCBParameterMapping | None:
    result = await db.execute(
        select(CPCBParameterMapping).where(
            CPCBParameterMapping.internal_parameter == internal_parameter,
            CPCBParameterMapping.enabled == True,
        )
    )
    return result.scalar_one_or_none()


async def get_mapping_by_cpcb(db: AsyncSession, cpcb_parameter: str) -> CPCBParameterMapping | None:
    result = await db.execute(
        select(CPCBParameterMapping).where(
            CPCBParameterMapping.cpcb_parameter == cpcb_parameter,
            CPCBParameterMapping.enabled == True,
        )
    )
    return result.scalar_one_or_none()


async def create_mapping(db: AsyncSession, internal_parameter: str, cpcb_parameter: str, unit: str, conversion_factor: float, enabled: bool = True) -> CPCBParameterMapping:
    valid, msg = validate_cpcb_parameter(cpcb_parameter)
    if not valid:
        raise ValueError(msg)
    valid, msg = validate_conversion_factor(conversion_factor)
    if not valid:
        raise ValueError(msg)
    mapping = CPCBParameterMapping(
        internal_parameter=internal_parameter,
        cpcb_parameter=cpcb_parameter,
        unit=unit,
        conversion_factor=conversion_factor,
        enabled=enabled,
    )
    db.add(mapping)
    await db.flush()
    return mapping


async def update_mapping(db: AsyncSession, mapping_id: int, **kwargs) -> CPCBParameterMapping | None:
    result = await db.execute(select(CPCBParameterMapping).where(CPCBParameterMapping.id == mapping_id))
    mapping = result.scalar_one_or_none()
    if not mapping:
        return None
    if "cpcb_parameter" in kwargs:
        valid, msg = validate_cpcb_parameter(kwargs["cpcb_parameter"])
        if not valid:
            raise ValueError(msg)
    if "conversion_factor" in kwargs:
        valid, msg = validate_conversion_factor(kwargs["conversion_factor"])
        if not valid:
            raise ValueError(msg)
    for key, val in kwargs.items():
        setattr(mapping, key, val)
    await db.flush()
    return mapping


async def delete_mapping(db: AsyncSession, mapping_id: int) -> bool:
    result = await db.execute(select(CPCBParameterMapping).where(CPCBParameterMapping.id == mapping_id))
    mapping = result.scalar_one_or_none()
    if not mapping:
        return False
    await db.delete(mapping)
    await db.flush()
    return True
