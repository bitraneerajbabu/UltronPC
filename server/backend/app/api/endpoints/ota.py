from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from app.db.database import get_db
from app.models.core import IndustrySite, SoftwareVersion, OTADeployment
from app.schemas.ota import (
    SoftwareVersionCreate,
    SoftwareVersionResponse,
    OTADeploymentCreate,
    OTADeploymentUpdate,
    OTADeploymentResponse
)
from app.api.deps import AuthContext, get_auth_context

router = APIRouter()

# ─── Software Versions Endpoints ──────────────────────────────────────────────

@router.post("/versions", response_model=SoftwareVersionResponse, status_code=status.HTTP_201_CREATED)
def create_version(
    payload: SoftwareVersionCreate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(get_auth_context)
):
    if not auth.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Check if version already exists
    existing = db.query(SoftwareVersion).filter(SoftwareVersion.version == payload.version).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Version '{payload.version}' already exists")
    
    db_version = SoftwareVersion(**payload.model_dump())
    db.add(db_version)
    db.commit()
    db.refresh(db_version)
    return db_version

@router.get("/versions", response_model=List[SoftwareVersionResponse])
def list_versions(
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(get_auth_context)
):
    # Admins and clients can view available versions
    return db.query(SoftwareVersion).order_by(SoftwareVersion.created_at.desc()).all()

@router.get("/versions/{version_id}", response_model=SoftwareVersionResponse)
def get_version(
    version_id: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(get_auth_context)
):
    version = db.query(SoftwareVersion).filter(SoftwareVersion.id == version_id).first()
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    return version

@router.delete("/versions/{version_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_version(
    version_id: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(get_auth_context)
):
    if not auth.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    version = db.query(SoftwareVersion).filter(SoftwareVersion.id == version_id).first()
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    
    db.delete(version)
    db.commit()
    return None

# ─── OTA Deployments Endpoints ────────────────────────────────────────────────

@router.post("/deployments", response_model=OTADeploymentResponse, status_code=status.HTTP_201_CREATED)
def create_deployment(
    payload: OTADeploymentCreate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(get_auth_context)
):
    if not auth.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Verify site exists
    site = db.query(IndustrySite).filter(IndustrySite.id == payload.site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Target site not found")
        
    # Verify version exists
    version = db.query(SoftwareVersion).filter(SoftwareVersion.id == payload.version_id).first()
    if not version:
        raise HTTPException(status_code=404, detail="Software version not found")

    db_deployment = OTADeployment(
        site_id=payload.site_id,
        version_id=payload.version_id,
        status="pending",
        progress=0,
        logs="Deployment created. Waiting for gateway connection."
    )
    db.add(db_deployment)
    db.commit()
    db.refresh(db_deployment)
    return db_deployment

@router.get("/deployments", response_model=List[OTADeploymentResponse])
def list_deployments(
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(get_auth_context)
):
    # Admins see all deployments, plants see only their own
    if auth.is_admin:
        return db.query(OTADeployment).order_by(OTADeployment.created_at.desc()).all()
    return db.query(OTADeployment).filter(OTADeployment.site_id == auth.site_id).order_by(OTADeployment.created_at.desc()).all()

@router.get("/deployments/{deployment_id}", response_model=OTADeploymentResponse)
def get_deployment(
    deployment_id: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(get_auth_context)
):
    deployment = db.query(OTADeployment).filter(OTADeployment.id == deployment_id).first()
    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")
        
    if not auth.is_admin and auth.site_id != deployment.site_id:
        raise HTTPException(status_code=403, detail="Access denied")
        
    return deployment

@router.get("/deployments/site/{site_id}", response_model=List[OTADeploymentResponse])
def get_site_deployments(
    site_id: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(get_auth_context)
):
    if not auth.is_admin and auth.site_id != site_id:
        raise HTTPException(status_code=403, detail="Access denied")
        
    return db.query(OTADeployment).filter(OTADeployment.site_id == site_id).order_by(OTADeployment.created_at.desc()).all()

@router.patch("/deployments/{deployment_id}", response_model=OTADeploymentResponse)
def update_deployment(
    deployment_id: int,
    payload: OTADeploymentUpdate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(get_auth_context)
):
    # Allow admin OR the client gateway reporting the update to modify deployment
    deployment = db.query(OTADeployment).filter(OTADeployment.id == deployment_id).first()
    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")
        
    if not auth.is_admin and auth.site_id != deployment.site_id:
        raise HTTPException(status_code=403, detail="Access denied")

    if payload.status is not None:
        deployment.status = payload.status
    if payload.progress is not None:
        deployment.progress = payload.progress
    if payload.logs is not None:
        if deployment.logs:
            deployment.logs += f"\n{payload.logs}"
        else:
            deployment.logs = payload.logs

    db.commit()
    db.refresh(deployment)
    return deployment
