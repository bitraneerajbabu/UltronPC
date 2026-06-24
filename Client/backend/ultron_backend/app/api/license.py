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
    """
    enc_file = str(APP_DIR / ".env.enc")
    existing = _read_existing_env_enc()
    existing.update(updates)
    write_env_enc_from_dict(existing, enc_file)


class LicenseVerifyRequest(BaseModel):
    api_url: str
    api_key: str
    amc_key: str = ""

@router.get("/status")
async def get_license_status():
    """Returns whether the client has an active license key configured and valid."""
    key = os.environ.get("CENTRAL_API_KEY", "").strip()
    url = os.environ.get("CENTRAL_API_URL", "https://rajapi.com/api/v1/sync/").strip()
    
    amc_key = os.environ.get("AMC_KEY", "").strip()
    
    if not key:
        return {"licensed": False, "has_amc_key": bool(amc_key)}
        
    # Actively test the key against the server
    payload = {"client_id": "setup_test", "points": []}
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, json=payload, headers={"X-API-Key": key}, timeout=5.0)
            if resp.status_code == 401:
                # Key is invalid or AMC expired! Wipe it out so UI locks.
                if "CENTRAL_API_KEY" in os.environ:
                    del os.environ["CENTRAL_API_KEY"]
                # Clear only the license key — preserve all other config
                _update_env_enc({"CENTRAL_API_KEY": ""})
                return {"licensed": False}
                
                # If 200 (or any other error like network failure, we assume licensed for offline fallback)
            return {"licensed": True, "has_amc_key": bool(amc_key)}
    except httpx.RequestError:
        # Offline network failure, assume licensed to allow local UI access
        return {"licensed": True}

@router.post("/verify")
async def verify_and_save_license(req: LicenseVerifyRequest):
    """Tests the provided key against the Central server and saves it if valid."""
    url = req.api_url.strip()
    key = req.api_key.strip()
    
    if not url or not key:
        raise HTTPException(status_code=400, detail="URL and API Key are required.")
    
    # Send a dummy payload to test the key
    payload = {"client_id": "setup_test", "points": []}
    
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, json=payload, headers={"X-API-Key": key}, timeout=10.0)
            
            if resp.status_code != 200:
                raise HTTPException(status_code=401, detail=f"Server rejected key (Code {resp.status_code})")
                
            # Merge license keys into existing config — don't overwrite other settings
            amc_key = req.amc_key.strip() if req.amc_key else ""
            updates = {
                "CENTRAL_API_URL": url,
                "CENTRAL_API_KEY": key,
            }
            if amc_key:
                updates["AMC_KEY"] = amc_key
            _update_env_enc(updates)
            
            os.environ["CENTRAL_API_URL"] = url
            os.environ["CENTRAL_API_KEY"] = key
            if amc_key:
                os.environ["AMC_KEY"] = amc_key
            
            log.info(f"License verified and saved: key={key[:10]}...")
            return {"success": True, "detail": "License verified and saved successfully."}
            
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Cannot reach server: {str(e)}")
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))
