import pytest
import asyncio
from unittest.mock import AsyncMock, patch, MagicMock
from sqlalchemy import select

from app.database import AsyncSessionLocal, engine, Base
from app.models.server_config import ServerConfig, ServerParameterMapping
from app.models.parameter import Parameter
from app.models.device import Device
from app.models.station import Station
from app.models.telemetry import LiveData, PendingUpload, DataQuality
from app.services import server_push
from app.services.server_push import run_server_push, retry_pending_uploads, _push_spcb


import uuid

@pytest.mark.asyncio
async def test_offline_gating_and_retry_flow():
    # 1. Setup in-memory DB or test records
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    uid = uuid.uuid4().hex[:6]
    async with AsyncSessionLocal() as db:
        # Create Station, Device, Parameter, LiveData
        st = Station(name=f"TestStation_{uid}")
        db.add(st)
        await db.flush()

        dev = Device(station_id=st.id, name=f"TestDevice_{uid}")
        db.add(dev)
        await db.flush()

        param = Parameter(device_id=dev.id, tag_name="SO2", name="Sulfur Dioxide", unit="ppb", register_address=40001)
        db.add(param)
        await db.flush()

        ld = LiveData(parameter_id=param.id, timestamp=server_push.datetime.now(), value=12.34, quality=DataQuality.good)
        db.add(ld)

        # Deactivate any pre-existing server configs in DB for isolation
        await db.execute(server_push.select(ServerConfig).where(ServerConfig.is_active == True))
        from sqlalchemy import update
        await db.execute(update(ServerConfig).values(is_active=False))

        # Create ServerConfig for SPCB and TNPCB
        cfg_spcb = ServerConfig(name=f"SPCB Server {uid}", protocol="tspcb", live_url="http://spcb.local/api", is_active=True)
        cfg_tnpcb = ServerConfig(name=f"TNPCB Server {uid}", protocol="tnpcb", live_url="http://tnpcb.local/api", is_active=True)
        db.add(cfg_spcb)
        db.add(cfg_tnpcb)
        await db.flush()

        map_spcb = ServerParameterMapping(server_id=cfg_spcb.id, parameter_id=param.id, api_id="101", is_active=True)
        map_tnpcb = ServerParameterMapping(server_id=cfg_tnpcb.id, parameter_id=param.id, api_id="101", is_active=True)
        db.add(map_spcb)
        db.add(map_tnpcb)

        # Ensure RajAPI settings configured
        with patch.object(server_push.settings, "CENTRAL_API_URL", "http://rajapi.local/sync"), \
             patch.object(server_push.settings, "CENTRAL_API_KEY", "test-key"):
            await db.commit()

            # Clean any old pending uploads
            await db.execute(PendingUpload.__table__.delete())
            await db.commit()

            # ------------------------------------------------------------------
            # STEP 1: Simulate Offline State
            # ------------------------------------------------------------------
            server_push._last_net_ok = False
            
            with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post, \
                 patch("app.services.server_push._check_server_reachable", side_effect=AsyncMock(return_value=False)), \
                 patch("app.services.server_push.check_connectivity", side_effect=AsyncMock()), \
                 patch("app.services.server_push.is_cpcb_upload_allowed", side_effect=AsyncMock(return_value=True)), \
                 patch("app.services.server_push.is_push_allowed", side_effect=AsyncMock(return_value=True)):

                # Run push live
                await run_server_push("live")

                # Assert ZERO HTTP POST requests were made
                assert mock_post.call_count == 0, f"Expected 0 HTTP POSTs while offline, got {mock_post.call_count}"

            # Check database for PendingUpload records for our test servers
            res = await db.execute(
                select(PendingUpload).where(
                    (PendingUpload.server_config_id.in_([cfg_spcb.id, cfg_tnpcb.id])) |
                    (PendingUpload.server_config_id.is_(None))
                )
            )
            pending_items = res.scalars().all()

            # We should have queued rows for SPCB, TNPCB, and RajAPI
            protocols_queued = {p.protocol for p in pending_items}
            assert "spcb" in protocols_queued, "SPCB payload should be queued when offline"
            assert "tnpcb" in protocols_queued, "TNPCB payload should be queued when offline"
            assert "rajapi" in protocols_queued, "RajAPI payload should be queued when offline"
            assert len(pending_items) == 3, f"Expected 3 PendingUpload rows for test servers, found {len(pending_items)}"

            # ------------------------------------------------------------------
            # STEP 2: Simulate Online State and Retry
            # ------------------------------------------------------------------
            server_push._last_net_ok = True
            
            mock_res = MagicMock()
            mock_res.status_code = 200
            mock_res.json.return_value = {"status": 1, "msg": "ok"}

            with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post_online, \
                 patch("app.services.server_push.is_cpcb_upload_allowed", side_effect=AsyncMock(return_value=True)):
                
                mock_post_online.return_value = mock_res

                # Run retry
                await retry_pending_uploads(db)

                # Assert that HTTP POST calls were made to send all 3 items
                assert mock_post_online.call_count == 3, f"Expected 3 HTTP POST retries, got {mock_post_online.call_count}"

                # Assert all PendingUpload records for our test servers were deleted on success
                res_after = await db.execute(
                    select(PendingUpload).where(
                        (PendingUpload.server_config_id.in_([cfg_spcb.id, cfg_tnpcb.id])) |
                        (PendingUpload.server_config_id.is_(None))
                    )
                )
                remaining_items = res_after.scalars().all()
                assert len(remaining_items) == 0, f"Expected 0 pending items for test servers after retry, found {len(remaining_items)}"


@pytest.mark.asyncio
async def test_tnpcb_status_rejection_and_permanent_failure():
    async with AsyncSessionLocal() as db:
        server_push._last_net_ok = True

        cfg1 = ServerConfig(name="TNPCB Test 1", protocol="tnpcb", live_url="http://tnpcb.local/api", is_active=True)
        cfg2 = ServerConfig(name="TNPCB Test 2", protocol="tnpcb", live_url="http://tnpcb.local/api", is_active=True)
        cfg3 = ServerConfig(name="TNPCB Test 3", protocol="tnpcb", live_url="http://tnpcb.local/api", is_active=True)
        db.add_all([cfg1, cfg2, cfg3])
        await db.flush()

        # Queue pending items with permanent failure status 101, 11, and 108
        p_101 = PendingUpload(
            server_config_id=cfg1.id,
            url="http://tnpcb.local/api",
            payload=[{"deviceId": "1001", "params": []}],
            mode="live",
            protocol="tnpcb",
            last_error="HTTP 200 | Status 101 (Invalid Industry ID): Invalid Industry ID [PERMANENT FAILURE]"
        )
        p_11 = PendingUpload(
            server_config_id=cfg2.id,
            url="http://tnpcb.local/api",
            payload=[{"deviceId": "1001", "params": []}],
            mode="live",
            protocol="tnpcb",
            last_error="HTTP 200 | Status 11 (Invalid JSON format / schema mismatch): bad payload [PERMANENT FAILURE]"
        )
        p_108 = PendingUpload(
            server_config_id=cfg3.id,
            url="http://tnpcb.local/api",
            payload=[{"deviceId": "1008", "params": []}],
            mode="live",
            protocol="tnpcb",
            last_error="HTTP 200 | Status 108 (Invalid Device ID): device not configured [PERMANENT FAILURE]"
        )
        db.add_all([p_101, p_11, p_108])
        await db.commit()

        mock_res = MagicMock()
        mock_res.status_code = 200
        mock_res.json.return_value = {"status": 1, "msg": "ok"}

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post, \
             patch("app.services.server_push.is_cpcb_upload_allowed", side_effect=AsyncMock(return_value=True)):
            mock_post.return_value = mock_res
            await retry_pending_uploads(db)

            # All permanent failure items (101, 11, 108) must be skipped during retry
            assert mock_post.call_count == 0, "Permanent failure items (11, 101, 108) must be skipped during retry"

        # Cleanup
        await db.delete(p_101)
        await db.delete(p_11)
        await db.delete(p_108)
        await db.delete(cfg1)
        await db.delete(cfg2)
        await db.delete(cfg3)
        await db.commit()


@pytest.mark.asyncio
async def test_spcb_status_rejection_and_permanent_failure():
    async with AsyncSessionLocal() as db:
        server_push._last_net_ok = True

        # 1. Create ServerConfig & Mapping
        cfg = ServerConfig(name="SPCB Error Test", protocol="tspcb", live_url="http://spcb.local/api", is_active=True)
        db.add(cfg)
        await db.flush()

        # Case 1: HTTP 200 with JSON error body {"status": 0, "msg": "Invalid Device ID"}
        res_200_json_error = MagicMock()
        res_200_json_error.status_code = 200
        res_200_json_error.json.return_value = {"status": 0, "msg": "Invalid Device ID"}

        # Case 2: HTTP 400 Bad Request
        res_400 = MagicMock()
        res_400.status_code = 400
        res_400.text = "Bad Request: Invalid mapping"

        # Case 3: HTTP 500 Server Error
        res_500 = MagicMock()
        res_500.status_code = 500
        res_500.text = "Internal Server Error"

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post, \
             patch("app.services.server_push._check_server_reachable", return_value=True), \
             patch("app.services.server_push._build_spcb_payloads", return_value=[{"DeviceID": "101", "Variables": []}]), \
             patch("app.services.server_push.is_cpcb_upload_allowed", side_effect=AsyncMock(return_value=True)):
            
            # Test Case 1 (JSON status 0)
            mock_post.return_value = res_200_json_error
            await _push_spcb(cfg, db, "live")

            # Test Case 2 (HTTP 400)
            mock_post.return_value = res_400
            await _push_spcb(cfg, db, "live")

            # Test Case 3 (HTTP 500)
            mock_post.return_value = res_500
            await _push_spcb(cfg, db, "live")

        # Assert all three generated PendingUpload rows
        res_pending = await db.execute(
            select(PendingUpload).where(PendingUpload.server_config_id == cfg.id)
        )
        items = res_pending.scalars().all()
        assert len(items) == 3, f"Expected 3 PendingUpload rows for SPCB errors, found {len(items)}"

        # Assert Permanent vs Transient classifications
        perm_items = [i for i in items if i.last_error and "PERMANENT FAILURE" in i.last_error]
        assert len(perm_items) == 2, f"Expected 2 permanent failure items (JSON error + HTTP 400), found {len(perm_items)}"

        transient_items = [i for i in items if i.last_error and "PERMANENT FAILURE" not in i.last_error]
        assert len(transient_items) == 1, f"Expected 1 transient failure item (HTTP 500), found {len(transient_items)}"

        # Test Retry Behavior: Permanent ones skipped, transient one retried
        res_retry_200 = MagicMock()
        res_retry_200.status_code = 200
        res_retry_200.json.return_value = {"status": 1, "msg": "ok"}

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post_retry, \
             patch("app.services.server_push.is_cpcb_upload_allowed", side_effect=AsyncMock(return_value=True)):
            mock_post_retry.return_value = res_retry_200
            await retry_pending_uploads(db)

            # Only the 1 transient item (HTTP 500) should be retried
            assert mock_post_retry.call_count == 1, f"Expected 1 retry call for transient SPCB error, got {mock_post_retry.call_count}"

        # Cleanup
        for i in items:
            await db.delete(i)
        await db.delete(cfg)
        await db.commit()

