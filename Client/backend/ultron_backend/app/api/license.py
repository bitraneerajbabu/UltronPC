from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import os
import httpx
from app.core.config_crypt import decrypt_file_to_string, write_env_enc_from_dict
from app.config import APP_DIR
from app.core.logger import get_logger
import dotenv
import io

log = get_logger("ultron.license")
router = APIRouter(prefix="/license", tags=["License Setup"])


def _read_existing_env_enc() -> dict:
    """Read existing .env.enc and return all key-value pairs, or empty dict."""
    enc_file = str(APP_DIR / ".env.enc")
    try:
        if os.path.exists(enc_file):
            decrypted = decrypt_file_to_string(enc_file)
            return dict(dotenv.dotenv_values(stream=io.StringIO(decrypted)))
    except Exception as e:
        log.warning(f"Could not read existing .env.enc: {e}")
    return {}


def _update_env_enc(updates: dict) -> None:
    """
    Merge `updates` into the existing .env.enc without losing other keys.
    This prevents overwriting ADMIN_PASSWORD, SECRET_KEY, etc.
    Writes to a temp file first then os.replace() to avoid OneDrive reparse-point locks.
    """
    import tempfile
    enc_file = str(APP_DIR / ".env.enc")
    existing = _read_existing_env_enc()
    existing.update(updates)
    # Write to sibling temp file then atomic replace
    tmp_fd, tmp_path = tempfile.mkstemp(dir=str(APP_DIR), suffix=".enc.tmp")
    try:
        os.close(tmp_fd)
        write_env_enc_from_dict(existing, tmp_path)
        os.replace(tmp_path, enc_file)
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


from app.config import settings

class LicenseVerifyRequest(BaseModel):
    api_key: str
    amc_key: str = ""

@router.get("/status")
async def get_license_status():
    from app.services.lock_store import get_lock_status
    lock_data = await get_lock_status()
    raw = settings.CENTRAL_API_KEY or ""
    masked = raw[:4] + "*" * (len(raw) - 4) if len(raw) > 4 else raw
    return {
        "licensed": True,
        "server_url": settings.CENTRAL_API_URL,
        "lock_status": lock_data.get("lock_status", "unlocked"),
        "lock_reason": lock_data.get("lock_reason"),
        "amc_expiry": lock_data.get("amc_expiry"),
        "key": masked or None,
    }

@router.post("/verify")
async def verify_and_save_license(req: LicenseVerifyRequest):
    """Tests the provided key against rajapi.com and saves it if valid."""
    key = req.api_key.strip()
    
    if not key:
        raise HTTPException(status_code=400, detail="API Key is required.")
    
    url = settings.RAJAPI_SYNC_URL
    payload = {
        "gateway_id": settings.RAJAPI_STATION_ID or "setup_verify",
        "device_secret": key,
        "version": settings.APP_VERSION,
        "status": "online"
    }
    
    try:
        async with httpx.AsyncClient(follow_redirects=True) as client:
            resp = await client.post(url, json=payload, timeout=15.0)
            
            if resp.status_code != 200:
                raise HTTPException(status_code=401, detail=f"Server rejected key (Code {resp.status_code})")
                
            data = resp.json()
            
            updates = {
                "CENTRAL_API_KEY": key,
            }
            _update_env_enc(updates)
            
            settings.CENTRAL_API_KEY = key
            os.environ["CENTRAL_API_KEY"] = key
            
            from app.services.lock_store import update_from_sync_response
            await update_from_sync_response(data)
            
            log.info(f"License verified and saved: key={key[:10]}...")
            return {"success": True, "detail": "License verified and saved successfully."}
            
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Cannot reach server: {str(e)}")
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))
