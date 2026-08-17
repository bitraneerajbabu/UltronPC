"""
UltrON — Offline License Validator (Phase 3, License Protection)

Reads and validates a local .lic file in offline_only mode.

Per LICENSE_LOCK_PLAN.md Section 5:
  - RSA-2048 signature verification against Sunshine public key
  - HWID match against local machine (via hwid_generator)
  - Expiry date check
  - Replay protection via system_state tracking of license_id

╔══════════════════════════════════════════════════════════════════╗
║  PLACEHOLDER KEYPAIR — NOT FOR PRODUCTION                       ║
║  Replace PLACEHOLDER_PUBKEY_PEM below with the real Sunshine    ║
║  Technologies RSA-2048 public key before any production deploy. ║
╚══════════════════════════════════════════════════════════════════╝
"""

from __future__ import annotations

import base64
import json
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPublicKey
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logger import get_logger
from app.database import AsyncSessionLocal
from app.models.system_state import SystemState
from app.services.hwid_generator import generate_hwid

log = get_logger("ultron.offline_license")

# ─── Placeholder RSA-2048 Public Key ──────────────────────────────────────────
# ⚠️  PLACEHOLDER TEST KEY — DO NOT USE IN PRODUCTION  ⚠️
# Replace this PEM string with the real Sunshine Technologies public key
# before deploying to any production site.
_PLACEHOLDER_PUBKEY_PEM: bytes = b"""
-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuOvK+xGrxfnqpdtETzri
Q0xmKjPkkXINuF/qOSH4+/kv+v4i9vp5JFPZ5epEPiTDiSTjRDQOWnWnPvPgHPyu
y2lppoqhrDQLoQ3XpJSmxsVKbcNW68W1hF1wsi7iO4OrP8CyDqQxZz93bkQg7e4s
GFF4lRxAyaFvWlIIW+yLeocg7UyjEzo3rTOVuudd8fgz/fWD0dxpTI3866e3vvJp
cDtjwRjOKu4DvvQuii5zigQKorIdp+vTGg+VB3o2KdhHsYQmESqm4ZIqzI23DvP0
Bz67MsLmtPRHg9C3V2uYOJ9Nv3zLgFGXB1nzWWH7kF98a3lYdBr2BQPvittgdf3L
5QIDAQAB
-----END PUBLIC KEY-----
"""  # noqa: E501

# Cache the parsed public key after first load
_PUBLIC_KEY: RSAPublicKey | None = None


def _get_public_key() -> RSAPublicKey:
    """Return the embedded RSA-2048 public key (cached after first parse)."""
    global _PUBLIC_KEY
    if _PUBLIC_KEY is None:
        _PUBLIC_KEY = serialization.load_pem_public_key(_PLACEHOLDER_PUBKEY_PEM)  # type: ignore[assignment]
        assert isinstance(_PUBLIC_KEY, rsa.RSAPublicKey), "Key must be RSA"
    return _PUBLIC_KEY


# ─── Exceptions ───────────────────────────────────────────────────────────────

class LicenseValidationError(Exception):
    """Raised when a .lic file fails validation."""


class LicenseSignatureError(LicenseValidationError):
    """Signature verification failed."""


class LicenseHWIDMismatchError(LicenseValidationError):
    """HWID in license does not match this machine."""


class LicenseExpiredError(LicenseValidationError):
    """License expiry date has passed."""


class LicenseReplayError(LicenseValidationError):
    """This license_id has already been applied (replay)."""


# ─── Core validation logic (sync helpers) ────────────────────────────────────

_LIC_FIELDS = {
    "license_id", "client_name", "hwid", "allowed_stations",
    "deployment_mode", "issue_date", "expiry_date",
}


def _canonical_payload(data: dict[str, Any]) -> bytes:
    """
    Serialise all fields except 'signature' into a canonical JSON byte string.
    Sort keys so the serialisation is deterministic.
    """
    payload = {k: v for k, v in data.items() if k != "signature"}
    return json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")


def verify_license_signature(data: dict[str, Any]) -> bool:
    """
    Verify the RSA-2048 PKCS1v15 signature on the canonical payload.

    The .lic file contains a 'signature' field which is a base64-encoded
    RSA-2048 signature over the remaining payload fields (sorted, compact JSON).

    Returns True if valid, raises LicenseSignatureError otherwise.
    """
    signature_b64 = data.get("signature")
    if not isinstance(signature_b64, str) or not signature_b64.strip():
        raise LicenseSignatureError("Missing or empty 'signature' field")

    try:
        signature = base64.b64decode(signature_b64)
    except (ValueError, TypeError) as exc:
        raise LicenseSignatureError(f"Invalid base64 signature: {exc}") from exc

    payload_bytes = _canonical_payload(data)
    pubkey = _get_public_key()

    try:
        pubkey.verify(
            signature,
            payload_bytes,
            padding.PKCS1v15(),
            hashes.SHA256(),
        )
        return True
    except Exception as exc:
        raise LicenseSignatureError(f"Signature verification failed: {exc}") from exc


def check_hwid(data: dict[str, Any]) -> bool:
    """
    Verify the HWID in the license matches the local machine.

    The .lic file stores the formatted HWID (e.g. 'SUN-8F92-A410-BC77').
    We compare against the current machine's formatted HWID.

    Returns True if match, raises LicenseHWIDMismatchError otherwise.
    """
    lic_hwid = data.get("hwid")
    if not isinstance(lic_hwid, str) or not lic_hwid.strip():
        raise LicenseHWIDMismatchError("Missing or empty 'hwid' in license file")

    _, local_hwid = generate_hwid()
    if lic_hwid.strip().upper() != local_hwid:
        raise LicenseHWIDMismatchError(
            f"License HWID '{lic_hwid}' does not match this machine ('{local_hwid}')"
        )
    return True


def check_expiry(data: dict[str, Any], reference_date: date | None = None) -> bool:
    """
    Verify the license expiry_date has not passed.

    Accepts an optional reference_date (defaults to today in UTC).
    The expiry_date in the license is a YYYY-MM-DD string.
    Expiry is considered inclusive: if expiry_date == today, still valid.

    Returns True if valid, raises LicenseExpiredError otherwise.
    """
    raw = data.get("expiry_date")
    if not isinstance(raw, str) or not raw.strip():
        raise LicenseExpiredError("Missing or empty 'expiry_date' in license file")

    try:
        expiry = date.fromisoformat(raw)
    except (ValueError, TypeError) as exc:
        raise LicenseExpiredError(f"Invalid expiry_date '{raw}': {exc}") from exc

    ref = reference_date if reference_date is not None else datetime.now(timezone.utc).date()
    if expiry < ref:
        raise LicenseExpiredError(
            f"License expired on {expiry.isoformat()} (today is {ref.isoformat()})"
        )
    return True


# ─── Replay protection (async — touches DB) ──────────────────────────────────

_REPLAY_KEY_PREFIX = "applied_license:"


async def is_license_replayed(license_id: str, db: AsyncSession | None = None) -> bool:
    """
    Check whether this license_id has already been applied (replay protection).

    Uses the system_state table with key 'applied_license:{license_id}'.
    Returns True if the license_id is already registered.
    """
    key = f"{_REPLAY_KEY_PREFIX}{license_id}"
    if db is not None:
        result = await db.execute(
            select(SystemState.value).where(SystemState.key == key)
        )
        return result.scalar_one_or_none() is not None
    else:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(SystemState.value).where(SystemState.key == key)
            )
            return result.scalar_one_or_none() is not None


async def register_license_id(
    license_id: str,
    data: dict[str, Any] | None = None,
    db: AsyncSession | None = None,
) -> None:
    """
    Register a license_id as applied (replay protection).

    Stores a JSON blob with metadata about the application in system_state.
    """
    meta = json.dumps({
        "applied_at": datetime.now(timezone.utc).isoformat(),
        "license_id": license_id,
        "hwid": data.get("hwid") if data else None,
        "client_name": data.get("client_name") if data else None,
        "expiry_date": data.get("expiry_date") if data else None,
    })
    key = f"{_REPLAY_KEY_PREFIX}{license_id}"

    if db is not None:
        existing = await db.execute(
            select(SystemState).where(SystemState.key == key)
        )
        row = existing.scalar_one_or_none()
        if row:
            row.value = meta
            row.updated_at = datetime.utcnow()
        else:
            db.add(SystemState(key=key, value=meta))
    else:
        async with AsyncSessionLocal() as session:
            existing = await session.execute(
                select(SystemState).where(SystemState.key == key)
            )
            row = existing.scalar_one_or_none()
            if row:
                row.value = meta
                row.updated_at = datetime.utcnow()
            else:
                session.add(SystemState(key=key, value=meta))
            await session.commit()

    log.info(f"License {license_id} registered (replay protection)")


async def check_replay(
    data: dict[str, Any],
    db: AsyncSession | None = None,
) -> bool:
    """
    Verify this license has not been replayed (already applied).

    Returns True if not replayed, raises LicenseReplayError otherwise.
    """
    lic_id = data.get("license_id")
    if not isinstance(lic_id, str) or not lic_id.strip():
        raise LicenseReplayError("Missing or empty 'license_id' in license file")

    if await is_license_replayed(lic_id, db=db):
        raise LicenseReplayError(f"License '{lic_id}' has already been applied")
    return True


# ─── Full validation pipeline ────────────────────────────────────────────────

def parse_license_file(path: str | Path) -> dict[str, Any]:
    """
    Read and parse a .lic JSON file from disk.

    Returns the parsed dict. Raises LicenseValidationError on parse failure.
    """
    p = Path(path)
    if not p.exists():
        raise LicenseValidationError(f"License file not found: {p}")
    if not p.is_file():
        raise LicenseValidationError(f"Not a file: {p}")

    try:
        raw = p.read_text(encoding="utf-8")
    except Exception as exc:
        raise LicenseValidationError(f"Cannot read license file: {exc}") from exc

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise LicenseValidationError(f"Invalid JSON in license file: {exc}") from exc

    if not isinstance(data, dict):
        raise LicenseValidationError("License file must contain a JSON object")

    # Verify all required fields are present
    missing = _LIC_FIELDS - set(data.keys())
    if missing:
        raise LicenseValidationError(f"Missing required fields: {sorted(missing)}")

    return data


FieldValidation = tuple[str, Any, Any]  # (field_name, raw_value, parsed_value)


async def validate_license_file(
    path: str | Path,
    reference_date: date | None = None,
    db: AsyncSession | None = None,
) -> dict[str, Any]:
    """
    Full offline license validation pipeline.

    Steps:
      1. Parse the .lic JSON file
      2. Verify RSA-2048 signature
      3. Check HWID matches local machine
      4. Check expiry date
      5. Check replay protection
      6. Register license_id if all checks pass

    Returns the parsed license dict on success.
    Raises LicenseValidationError (subclass) on first failure.
    """
    data = parse_license_file(path)

    # Step 2 — signature
    verify_license_signature(data)

    # Step 3 — HWID
    check_hwid(data)

    # Step 4 — expiry
    check_expiry(data, reference_date=reference_date)

    # Step 5 — replay
    await check_replay(data, db=db)

    # Step 6 — register
    await register_license_id(data.get("license_id", ""), data=data, db=db)

    log.info(f"License {data.get('license_id')} validated successfully")
    return data
