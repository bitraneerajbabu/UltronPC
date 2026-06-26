"""UltrON — CPCB Validation Service"""

import re

VALID_CPCB_PARAMETERS = {
    "CO", "SO2", "NO", "NO2", "NOx", "Ozone", "PM10", "PM2.5",
    "WS", "WD", "AT", "RH", "BP", "SR", "RF", "VWS",
    "Benzene", "Toluene", "Xylene", "Eth-Benzene", "MP-Xylene",
    "CH4", "NH3", "HCHO", "Hg",
}


def validate_station_name(name: str) -> tuple[bool, str]:
    if not name or not name.strip():
        return False, "Station name is required."
    if re.search(r'\s', name):
        return False, "Station name must not contain spaces."
    if re.search(r'[^a-zA-Z0-9_]', name):
        return False, "Station name must not contain special characters (only letters, numbers, underscores)."
    return True, ""


def validate_cpcb_parameter(param: str) -> tuple[bool, str]:
    if not param:
        return False, "CPCB parameter is required."
    if param not in VALID_CPCB_PARAMETERS:
        return False, f"'{param}' is not a valid CPCB parameter. Allowed: {', '.join(sorted(VALID_CPCB_PARAMETERS))}"
    return True, ""


def validate_export_path(path: str) -> tuple[bool, str]:
    if not path or not path.strip():
        return False, "Export path is required."
    return True, ""


def validate_retention_count(count: int) -> tuple[bool, str]:
    if count < 1:
        return False, "Retention count must be at least 1."
    if count > 1000:
        return False, "Retention count must not exceed 1000."
    return True, ""


def validate_conversion_factor(factor: float) -> tuple[bool, str]:
    if factor <= 0:
        return False, "Conversion factor must be positive."
    return True, ""
