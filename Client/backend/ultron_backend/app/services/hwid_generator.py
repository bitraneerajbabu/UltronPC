"""
UltrON — Hardware ID (HWID) Generator

Generates a stable, non-spoofable Hardware ID for the host machine.
Specification (Section 4): SHA256(Motherboard UUID + CPU Serial + BIOS Serial)

Rules:
- MAC address is explicitly excluded (unstable across NIC/USB/VPN changes).
- Uses BIOS Serial Number (wmic bios get serialnumber / PowerShell Get-CimInstance) as fallback if Motherboard UUID is missing or invalid.
- Modern PowerShell Get-CimInstance is prioritized over deprecated wmic, with wmic retained as secondary fallback.
"""

import hashlib
import subprocess
from typing import Dict, Tuple

# Placeholders that represent missing or invalid WMI responses
INVALID_HARDWARE_VALUES = {
    "",
    "none",
    "00000000-0000-0000-0000-000000000000",
    "ffffffff-ffff-ffff-ffff-ffffffffffff",
    "to be filled by o.e.m.",
    "default string",
    "system serial number",
}


def _query_powershell(command: str) -> str:
    """Execute PowerShell Get-CimInstance command to fetch WMI property value."""
    try:
        res = subprocess.check_output(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", command],
            text=True,
            stderr=subprocess.DEVNULL,
            timeout=5,
        )
        val = res.strip()
        return val if val.lower() not in INVALID_HARDWARE_VALUES else ""
    except Exception:
        return ""


def _query_wmic(command: str) -> str:
    """Execute fallback wmic command if PowerShell is unavailable."""
    try:
        res = subprocess.check_output(
            command,
            shell=True,
            text=True,
            stderr=subprocess.DEVNULL,
            timeout=5,
        )
        lines = [line.strip() for line in res.strip().splitlines() if line.strip()]
        if len(lines) > 1:
            val = lines[1]
            return val if val.lower() not in INVALID_HARDWARE_VALUES else ""
    except Exception:
        pass
    return ""


def get_hardware_components() -> Dict[str, str]:
    """
    Query Motherboard UUID, CPU Serial (ProcessorId), and BIOS Serial Number.
    Uses modern PowerShell Get-CimInstance first, with wmic fallback.
    """
    # 1. Motherboard UUID
    mobo_uuid = _query_powershell("(Get-CimInstance -ClassName Win32_ComputerSystemProduct).UUID")
    if not mobo_uuid:
        mobo_uuid = _query_wmic("wmic csproduct get uuid")

    # 2. CPU Serial / ProcessorId
    cpu_serial = _query_powershell("(Get-CimInstance -ClassName Win32_Processor).ProcessorId")
    if not cpu_serial:
        cpu_serial = _query_wmic("wmic cpu get processorid")

    # 3. BIOS Serial
    bios_serial = _query_powershell("(Get-CimInstance -ClassName Win32_BIOS).SerialNumber")
    if not bios_serial:
        bios_serial = _query_wmic("wmic bios get serialnumber")

    return {
        "motherboard_uuid": mobo_uuid.strip(),
        "cpu_serial": cpu_serial.strip(),
        "bios_serial": bios_serial.strip(),
    }


def generate_hwid(components: Dict[str, str] | None = None) -> Tuple[str, str]:
    """
    Generate SHA256 HWID from SHA256(Motherboard UUID + CPU Serial + BIOS Serial).
    If Motherboard UUID is missing, BIOS Serial is used as the fallback component.

    Returns:
        Tuple[str, str]: (raw_sha256_hex_digest, formatted_display_hwid)
        Example: ("8F92A410BC77...", "SUN-8F92-A410-BC77")
    """
    if components is None:
        components = get_hardware_components()

    mobo = components.get("motherboard_uuid", "").strip()
    cpu = components.get("cpu_serial", "").strip()
    bios = components.get("bios_serial", "").strip()

    # Fallback logic per Section 4: Use BIOS Serial if Motherboard UUID is missing/invalid
    primary_component = mobo if mobo else bios

    # Composition string: SHA256(Motherboard UUID + CPU Serial + BIOS Serial)
    composition = f"{primary_component}:{cpu}:{bios}"

    digest = hashlib.sha256(composition.encode("utf-8")).hexdigest().upper()
    formatted_hwid = f"SUN-{digest[:4]}-{digest[4:8]}-{digest[8:12]}"

    return digest, formatted_hwid
