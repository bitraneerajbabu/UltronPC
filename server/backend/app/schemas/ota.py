from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

class SoftwareVersionBase(BaseModel):
    version: str = Field(..., description="Software version number (e.g. 1.0.68)")
    description: Optional[str] = Field(None, description="Release notes or description")
    file_path: Optional[str] = Field(None, description="Local file path or URL to the firmware binary")
    checksum: Optional[str] = Field(None, description="SHA256 checksum of the firmware file")

class SoftwareVersionCreate(SoftwareVersionBase):
    pass

class SoftwareVersionResponse(SoftwareVersionBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

class OTADeploymentBase(BaseModel):
    site_id: int = Field(..., description="Target site/gateway ID")
    version_id: int = Field(..., description="Software version ID to deploy")

class OTADeploymentCreate(OTADeploymentBase):
    pass

class OTADeploymentUpdate(BaseModel):
    status: Optional[str] = Field(None, description="Deployment status (pending, in_progress, success, failed)")
    progress: Optional[int] = Field(None, description="Deployment progress percentage (0-100)")
    logs: Optional[str] = Field(None, description="Appended deployment log trace")

class OTADeploymentResponse(OTADeploymentBase):
    id: int
    status: str
    progress: int
    logs: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    version: Optional[SoftwareVersionResponse] = None

    class Config:
        from_attributes = True
