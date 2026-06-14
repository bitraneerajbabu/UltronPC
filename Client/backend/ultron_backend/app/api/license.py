from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import os
import httpx
from app.core.config_crypt import write_env_enc_from_dict
from app.config import APP_DIR

router = APIRouter(prefix="/license", tags=["License Setup"])

class LicenseVerifyRequest(BaseModel):
    api_url: str
    api_key: str

@router.get("/status")
async def get_license_status():
    """Returns whether the client has an active license key configured and valid."""
    key = os.environ.get("CENTRAL_API_KEY", "").strip()
    url = os.environ.get("CENTRAL_API_URL", "https://rajapi.com/api/v1/sync/").strip()
    
    if not key:
        return {"licensed": False}
        
    # Actively test the key against the server
    payload = {"client_id": "setup_test", "points": []}
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, json=payload, headers={"X-API-Key": key}, timeout=5.0)
            if resp.status_code == 401:
                # Key is invalid or AMC expired! Wipe it out so UI locks.
                if "CENTRAL_API_KEY" in os.environ:
                    del os.environ["CENTRAL_API_KEY"]
                # Wipe from .env.enc
                enc_file = str(APP_DIR / ".env.enc")
                write_env_enc_from_dict({"CENTRAL_API_URL": url, "CENTRAL_API_KEY": ""}, enc_file)
                return {"licensed": False}
                
            # If 200 (or any other error like network failure, we assume licensed for offline fallback)
            return {"licensed": True}
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
                
            # If valid, write to .env.enc and update current environment
            data = {
                "CENTRAL_API_URL": url,
                "CENTRAL_API_KEY": key
            }
            
            enc_file = str(APP_DIR / ".env.enc")
            write_env_enc_from_dict(data, enc_file)
            
            os.environ["CENTRAL_API_URL"] = url
            os.environ["CENTRAL_API_KEY"] = key
            
            return {"success": True, "detail": "License verified and saved successfully."}
            
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Cannot reach server: {str(e)}")
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))
