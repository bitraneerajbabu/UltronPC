from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
from app.core.config import settings
from app.db.database import engine, Base
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Import models so they are registered with Base.metadata before create_all
from app.models.core import IndustrySite, Device, Parameter, TelemetryData

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# Set all CORS enabled origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict this to specific domains
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


from app.api.endpoints import sync, sites, downloads

app.include_router(sync.router, prefix=f"{settings.API_V1_STR}/sync", tags=["sync"])
app.include_router(sites.router, prefix=f"{settings.API_V1_STR}/sites", tags=["sites"])
app.include_router(downloads.router, prefix=f"{settings.API_V1_STR}/downloads", tags=["downloads"])

# Serve frontend build if it exists
frontend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist"))
if os.path.exists(frontend_path):
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_path, "assets")), name="assets")
    
    @app.get("/")
    async def serve_frontend_root():
        return FileResponse(os.path.join(frontend_path, "index.html"))
        
    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        # Allow API requests to pass through (this catch-all must be defined AFTER API routers)
        if full_path.startswith("api/"):
            return
            
        file_path = os.path.join(frontend_path, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(frontend_path, "index.html"))

# To run locally:
# uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
