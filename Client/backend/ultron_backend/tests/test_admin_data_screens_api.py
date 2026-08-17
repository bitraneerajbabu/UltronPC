"""
Regression test for Admin Data Screens API endpoints & database schema migration.

Verifies:
  1. GET /api/v1/stations/ returns HTTP 200 for authenticated admin.
  2. GET /api/v1/devices/ returns HTTP 200 for authenticated admin.
  3. GET /api/v1/parameters/ returns HTTP 200 for authenticated admin.
  4. GET /api/v1/logs/?limit=100 returns HTTP 200 for authenticated admin.
  5. _ensure_security_columns adds missing columns (allow_server_mgmt, is_super_admin) to users table.
"""

import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import text, inspect

from app.main import app
from app.database import engine, AsyncSessionLocal, init_db
from app.database_initializer import initialize_defaults
from app.models.user import User
from app.core.security import create_access_token


@pytest.mark.asyncio
async def test_user_table_security_columns_migration():
    """Verify that init_db ensures all user security columns exist on users table."""
    await init_db()
    async with engine.connect() as conn:
        def get_cols(sync_conn):
            inspector = inspect(sync_conn)
            return {col["name"] for col in inspector.get_columns("users")}
        
        cols = await conn.run_sync(get_cols)
        assert "allow_server_mgmt" in cols
        assert "is_super_admin" in cols
        assert "failed_login_attempts" in cols
        assert "locked_until" in cols


@pytest.mark.asyncio
async def test_admin_data_screens_endpoints_return_200():
    """Verify stations, devices, parameters, and logs return HTTP 200 for authenticated master/supermaster."""
    await init_db()
    await initialize_defaults()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Login Master
        login_res = await client.post("/api/v1/auth/login", json={"username": "Master", "password": "Ultron123.0"})
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 2. Verify all 4 admin data screen endpoints
        stations_res = await client.get("/api/v1/stations/", headers=headers)
        assert stations_res.status_code == 200, f"Stations endpoint failed: {stations_res.text}"
        assert isinstance(stations_res.json(), list)

        devices_res = await client.get("/api/v1/devices/", headers=headers)
        assert devices_res.status_code == 200, f"Devices endpoint failed: {devices_res.text}"
        assert isinstance(devices_res.json(), list)

        params_res = await client.get("/api/v1/parameters/", headers=headers)
        assert params_res.status_code == 200, f"Parameters endpoint failed: {params_res.text}"
        assert isinstance(params_res.json(), list)

        logs_res = await client.get("/api/v1/logs/?limit=100", headers=headers)
        assert logs_res.status_code == 200, f"Logs endpoint failed: {logs_res.text}"
        assert isinstance(logs_res.json(), list)


@pytest.mark.asyncio
async def test_master_and_supermaster_persistence_and_roles():
    """Verify Master and SuperMaster persist across restarts and maintain distinct roles and permissions."""
    await init_db()
    await initialize_defaults()
    from app.core.rate_limiter import rate_limiter
    rate_limiter._ip_buckets.clear()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Test Master Login
        master_login = await client.post("/api/v1/auth/login", json={"username": "Master", "password": "Ultron123.0"})
        assert master_login.status_code == 200, f"Master login failed: {master_login.text}"
        m_data = master_login.json()
        assert m_data["username"] == "Master"
        assert m_data["role"] == "admin"
        assert m_data["is_super_admin"] is False

        # 2. Test SuperMaster Login
        super_login = await client.post("/api/v1/auth/login", json={"username": "SuperMaster", "password": "Ultron@9493"})
        assert super_login.status_code == 200, f"SuperMaster login failed: {super_login.text}"
        s_data = super_login.json()
        assert s_data["username"] == "SuperMaster"
        assert s_data["role"] == "admin"
        assert s_data["is_super_admin"] is True
        assert s_data["allow_server_mgmt"] is True

        # 3. Simulate App Restart (re-running init_db and initialize_defaults)
        await init_db()
        await initialize_defaults()
        rate_limiter._ip_buckets.clear()

        # 4. Verify both accounts still authenticate smoothly
        master_relogin = await client.post("/api/v1/auth/login", json={"username": "Master", "password": "Ultron123.0"})
        assert master_relogin.status_code == 200
        super_relogin = await client.post("/api/v1/auth/login", json={"username": "SuperMaster", "password": "Ultron@9493"})
        assert super_relogin.status_code == 200

        # 5. Test factory reset core re-seeds both Master and SuperMaster
        from app.api.settings import factory_reset_core
        await factory_reset_core(restart=False)
        rate_limiter._ip_buckets.clear()

        master_after_reset = await client.post("/api/v1/auth/login", json={"username": "Master", "password": "Ultron123.0"})
        assert master_after_reset.status_code == 200
        super_after_reset = await client.post("/api/v1/auth/login", json={"username": "SuperMaster", "password": "Ultron@9493"})
        assert super_after_reset.status_code == 200
