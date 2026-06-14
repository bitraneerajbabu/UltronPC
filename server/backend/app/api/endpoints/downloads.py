import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

router = APIRouter()

@router.get("/latest-client")
async def download_latest_client():
    # Use absolute path to the downloads folder
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
    installer_path = os.path.join(base_dir, "downloads", "UltrON_Installer.exe")
    
    if not os.path.exists(installer_path):
        raise HTTPException(status_code=404, detail="Latest installer not found on server")
        
    return FileResponse(
        path=installer_path,
        filename="UltrON_Installer_v1.0.2.exe",
        media_type="application/x-msdownload"
    )
