"""
UltrON — Users Management API (Admin only)
Admin can create, list, update, and delete client/admin user accounts.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from app.database import get_db
from app.models.user import User
from app.schemas.user import UserCreate, UserUpdate, UserOut
from app.core.security import hash_password, require_admin, get_current_user
from app.core.logger import get_logger, get_audit_logger

log = get_logger("ultron.users")
audit = get_audit_logger()
router = APIRouter(prefix="/users", tags=["Users"])


# ─── List Users ───────────────────────────────────────────────────────────────
@router.get("/", response_model=List[UserOut], dependencies=[Depends(require_admin)])
async def list_users(db: AsyncSession = Depends(get_db)):
    """List all users (admin only)."""
    result = await db.execute(select(User).order_by(User.created_at))
    return result.scalars().all()


# ─── Create User ──────────────────────────────────────────────────────────────
@router.post("/", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Create a new user account (admin only)."""
    # Check for duplicate username
    existing = await db.execute(select(User).where(User.username == payload.username))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Username '{payload.username}' already exists",
        )

    new_user = User(
        username=payload.username,
        hashed_password=hash_password(payload.password),
        role=payload.role,
        full_name=payload.full_name,
        is_active=payload.is_active,
        created_by=current_user.username,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    audit.info(f"User created: '{new_user.username}' role='{new_user.role}' by '{current_user.username}'")
    log.info(f"New user '{new_user.username}' ({new_user.role}) created by admin '{current_user.username}'")
    return new_user


# ─── Get Single User ──────────────────────────────────────────────────────────
@router.get("/{user_id}", response_model=UserOut)
async def get_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a user by ID. Admins can get any user; clients can only get themselves."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if current_user.role != "admin" and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return user


# ─── Update User ──────────────────────────────────────────────────────────────
@router.patch("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: int,
    payload: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Update a user's password, name, role or active status (admin only)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent removing the last admin
    if payload.role == "client" and user.role == "admin":
        admin_count_res = await db.execute(
            select(User).where(User.role == "admin", User.is_active == True)
        )
        admins = admin_count_res.scalars().all()
        if len(admins) <= 1:
            raise HTTPException(
                status_code=400,
                detail="Cannot demote the last active admin account",
            )

    if payload.password is not None:
        user.hashed_password = hash_password(payload.password)
    if payload.full_name is not None:
        user.full_name = payload.full_name
    if payload.is_active is not None:
        user.is_active = payload.is_active
    if payload.role is not None:
        user.role = payload.role

    await db.commit()
    await db.refresh(user)
    audit.info(f"User updated: '{user.username}' by admin '{current_user.username}'")
    return user


# ─── Delete User ──────────────────────────────────────────────────────────────
@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Delete a user (admin only). Cannot delete yourself."""
    if current_user.id == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent deleting last admin
    if user.role == "admin":
        admin_count_res = await db.execute(
            select(User).where(User.role == "admin", User.is_active == True)
        )
        admins = admin_count_res.scalars().all()
        if len(admins) <= 1:
            raise HTTPException(status_code=400, detail="Cannot delete the last admin account")

    await db.delete(user)
    await db.commit()
    audit.info(f"User deleted: '{user.username}' by admin '{current_user.username}'")
