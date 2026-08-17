"""
Unit & integration tests for Offline License Validator (Phase 3, License Protection).

Tests cover:
  - .lic file parsing
  - RSA-2048 signature verification (with dynamically generated test keypair)
  - HWID matching (mocked)
  - Expiry boundary (today, past, future)
  - Replay protection (mocked DB + real SQLite)
  - Full validation pipeline success path
"""

import json
import base64
import os
import tempfile
import unittest
from datetime import date, datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

from app.services import offline_license
from app.services.offline_license import (
    LicenseExpiredError,
    LicenseHWIDMismatchError,
    LicenseReplayError,
    LicenseSignatureError,
    LicenseValidationError,
    check_expiry,
    check_hwid,
    check_replay,
    is_license_replayed,
    parse_license_file,
    register_license_id,
    validate_license_file,
    verify_license_signature,
)

# ─── Test keypair (generated once per test class) ────────────────────────────

def _generate_test_keypair():
    """Generate a fresh RSA-2048 keypair for testing."""
    priv = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pub = priv.public_key()
    return priv, pub


def _pub_key_pem(pub: rsa.RSAPublicKey) -> bytes:
    return pub.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )


def _sign_payload(priv: rsa.RSAPrivateKey, data: dict) -> str:
    payload_bytes = offline_license._canonical_payload(data)
    sig = priv.sign(payload_bytes, padding.PKCS1v15(), hashes.SHA256())
    return base64.b64encode(sig).decode()


def _make_lic_dict(priv: rsa.RSAPrivateKey, overrides: dict | None = None) -> dict:
    data = {
        "license_id": "LIC-9F82-441A-BC01",
        "client_name": "Test Client",
        "hwid": "SUN-FAKE-HWID-FOR-TEST",
        "allowed_stations": 2,
        "deployment_mode": "offline_only",
        "issue_date": "2026-01-01",
        "expiry_date": "2029-12-31",
    }
    if overrides:
        data.update(overrides)
    data["signature"] = _sign_payload(priv, data)
    return data


# ─── Tests ───────────────────────────────────────────────────────────────────

class TestLicenseParsing(unittest.TestCase):
    """File I/O + JSON parsing."""

    @classmethod
    def setUpClass(cls):
        cls._priv, _ = _generate_test_keypair()

    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(
            mode="w", suffix=".lic", delete=False, encoding="utf-8"
        )
        self.path = self.tmp.name

    def tearDown(self):
        try:
            os.unlink(self.path)
        except OSError:
            pass

    def _write_lic(self, content: str):
        with open(self.path, "w", encoding="utf-8") as f:
            f.write(content)

    def test_parse_valid_file(self):
        self._write_lic(json.dumps(_make_lic_dict(self._priv)))
        data = parse_license_file(self.path)
        self.assertEqual(data["license_id"], "LIC-9F82-441A-BC01")

    def test_file_not_found(self):
        with self.assertRaises(LicenseValidationError) as ctx:
            parse_license_file("/nonexistent/license.lic")
        self.assertIn("not found", str(ctx.exception))

    def test_invalid_json(self):
        self._write_lic("not valid json")
        with self.assertRaises(LicenseValidationError) as ctx:
            parse_license_file(self.path)
        self.assertIn("Invalid JSON", str(ctx.exception))

    def test_missing_required_fields(self):
        self._write_lic('{"license_id": "x"}')
        with self.assertRaises(LicenseValidationError) as ctx:
            parse_license_file(self.path)
        self.assertIn("Missing required fields", str(ctx.exception))

    def test_empty_file_is_invalid_json(self):
        self._write_lic("")
        with self.assertRaises(LicenseValidationError):
            parse_license_file(self.path)


class TestSignatureVerification(unittest.TestCase):
    """RSA-2048 PKCS1v15 SHA256 signature verify."""

    @classmethod
    def setUpClass(cls):
        cls.priv, cls.pub = _generate_test_keypair()
        # Patch the module's public key so verify_license_signature uses ours
        cls._orig_pem = offline_license._PLACEHOLDER_PUBKEY_PEM
        offline_license._PLACEHOLDER_PUBKEY_PEM = _pub_key_pem(cls.pub)
        offline_license._PUBLIC_KEY = None  # reset cache

    @classmethod
    def tearDownClass(cls):
        offline_license._PLACEHOLDER_PUBKEY_PEM = cls._orig_pem
        offline_license._PUBLIC_KEY = None

    def _lic(self, overrides=None):
        return _make_lic_dict(self.priv, overrides)

    def test_valid_signature(self):
        data = self._lic()
        self.assertTrue(verify_license_signature(data))

    def test_tampered_payload_fails(self):
        data = self._lic()
        data["allowed_stations"] = 99  # tamper
        with self.assertRaises(LicenseSignatureError):
            verify_license_signature(data)

    def test_tampered_license_id_fails(self):
        data = self._lic()
        data["license_id"] = "LIC-HACKED"
        with self.assertRaises(LicenseSignatureError):
            verify_license_signature(data)

    def test_tampered_expiry_fails(self):
        data = self._lic()
        data["expiry_date"] = "2099-01-01"
        with self.assertRaises(LicenseSignatureError):
            verify_license_signature(data)

    def test_missing_signature_field(self):
        data = self._lic()
        del data["signature"]
        with self.assertRaises(LicenseSignatureError) as ctx:
            verify_license_signature(data)
        self.assertIn("Missing", str(ctx.exception))

    def test_empty_signature_field(self):
        data = self._lic()
        data["signature"] = ""
        with self.assertRaises(LicenseSignatureError):
            verify_license_signature(data)

    def test_invalid_base64_signature(self):
        data = self._lic()
        data["signature"] = "!!!not-base64!!!"
        with self.assertRaises(LicenseSignatureError):
            verify_license_signature(data)

    def test_wrong_key_does_not_verify(self):
        """License signed with different keypair should fail with our key."""
        wrong_priv, _ = _generate_test_keypair()
        data = _make_lic_dict(wrong_priv)
        with self.assertRaises(LicenseSignatureError):
            verify_license_signature(data)


class TestHWIDCheck(unittest.TestCase):
    """HWID matching (mocked local HWID)."""

    @patch("app.services.offline_license.generate_hwid", return_value=("FAKE_DIGEST", "SUN-FAKE-HWID-FOR-TEST"))
    def test_hwid_matches(self, _mock):
        data = {"hwid": "SUN-FAKE-HWID-FOR-TEST"}
        self.assertTrue(check_hwid(data))

    @patch("app.services.offline_license.generate_hwid", return_value=("OTHER_DIGEST", "SUN-OTHER-HWID"))
    def test_hwid_mismatch_raises(self, _mock):
        data = {"hwid": "SUN-FAKE-HWID-FOR-TEST"}
        with self.assertRaises(LicenseHWIDMismatchError) as ctx:
            check_hwid(data)
        self.assertIn("does not match", str(ctx.exception))

    def test_missing_hwid_raises(self):
        data = {}
        with self.assertRaises(LicenseHWIDMismatchError) as ctx:
            check_hwid(data)
        self.assertIn("Missing", str(ctx.exception))

    def test_empty_hwid_raises(self):
        data = {"hwid": ""}
        with self.assertRaises(LicenseHWIDMismatchError):
            check_hwid(data)

    @patch("app.services.offline_license.generate_hwid", return_value=("DIGEST", "SUN-ABCD-1234-XXXX"))
    def test_case_insensitive_match(self, _mock):
        """HWID comparison should be case-insensitive."""
        data = {"hwid": "sun-abcd-1234-xxxx"}
        self.assertTrue(check_hwid(data))


class TestExpiryCheck(unittest.TestCase):
    """Expiry date boundary."""

    def test_not_expired(self):
        data = {"expiry_date": "2099-12-31"}
        self.assertTrue(check_expiry(data, reference_date=date(2026, 7, 22)))

    def test_expired(self):
        data = {"expiry_date": "2025-01-01"}
        with self.assertRaises(LicenseExpiredError):
            check_expiry(data, reference_date=date(2026, 7, 22))

    def test_expiry_today_still_valid(self):
        """Expiry on the same day is inclusive — still valid."""
        data = {"expiry_date": "2026-07-22"}
        self.assertTrue(check_expiry(data, reference_date=date(2026, 7, 22)))

    def test_expiry_tomorrow_valid(self):
        data = {"expiry_date": "2026-07-23"}
        self.assertTrue(check_expiry(data, reference_date=date(2026, 7, 22)))

    def test_expiry_yesterday_invalid(self):
        data = {"expiry_date": "2026-07-21"}
        with self.assertRaises(LicenseExpiredError):
            check_expiry(data, reference_date=date(2026, 7, 22))

    def test_missing_expiry_raises(self):
        data = {}
        with self.assertRaises(LicenseExpiredError):
            check_expiry(data)

    def test_invalid_date_format_raises(self):
        data = {"expiry_date": "not-a-date"}
        with self.assertRaises(LicenseExpiredError):
            check_expiry(data, reference_date=date(2026, 7, 22))


class TestReplayProtection(unittest.IsolatedAsyncioTestCase):
    """Replay detection via system_state table (mocked + real DB)."""

    # ── Mocked DB unit tests ──────────────────────────────────────────────

    def setUp(self):
        self.mock_db = AsyncMock()
        self.mock_db.execute.return_value = Mock()
        self.mock_db.execute.return_value.scalar_one_or_none.return_value = None

    async def test_not_replayed_when_empty(self):
        data = {"license_id": "LIC-FRESH"}
        result = await check_replay(data, db=self.mock_db)
        self.assertTrue(result)

    async def test_replayed_when_already_registered(self):
        self.mock_db.execute.return_value.scalar_one_or_none.return_value = '{"applied_at": "..."}'
        data = {"license_id": "LIC-ALREADY-USED"}
        with self.assertRaises(LicenseReplayError) as ctx:
            await check_replay(data, db=self.mock_db)
        self.assertIn("already been applied", str(ctx.exception))

    async def test_missing_license_id_raises(self):
        data = {}
        with self.assertRaises(LicenseReplayError):
            await check_replay(data, db=self.mock_db)

    async def test_empty_license_id_raises(self):
        data = {"license_id": ""}
        with self.assertRaises(LicenseReplayError):
            await check_replay(data, db=self.mock_db)

    # ── Integration tests (real in-memory SQLite) ─────────────────────────

    async def asyncSetUp(self):
        from app.database import engine, Base
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    async def asyncTearDown(self):
        from app.database import engine, Base
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)

    async def test_integration_register_and_detect_replay(self):
        from app.database import AsyncSessionLocal

        lic_id = "LIC-INTEG-TEST-001"
        # First use should succeed
        async with AsyncSessionLocal() as session:
            result = await is_license_replayed(lic_id, db=session)
            self.assertFalse(result)

        await register_license_id(lic_id)

        # Second use should detect replay
        async with AsyncSessionLocal() as session:
            result = await is_license_replayed(lic_id, db=session)
            self.assertTrue(result)

    async def test_integration_replay_check_in_pipeline(self):
        """Full check_replay pipeline via AsyncSessionLocal."""
        from app.database import AsyncSessionLocal

        lic_id = "LIC-INTEG-REPLAY"
        data = {"license_id": lic_id}
        # First call passes
        async with AsyncSessionLocal() as session:
            result = await check_replay(data, db=session)
            self.assertTrue(result)

        # Register it
        async with AsyncSessionLocal() as session:
            await register_license_id(lic_id, db=session)
            await session.commit()

        # Second call fails
        async with AsyncSessionLocal() as session:
            with self.assertRaises(LicenseReplayError):
                await check_replay(data, db=session)


class TestFullPipeline(unittest.IsolatedAsyncioTestCase):
    """
    Full validate_license_file pipeline with:
      - Real RSA-2048 signing
      - Mocked HWID
      - Real SQLite for replay
      - Temp file for .lic
    """

    @classmethod
    def setUpClass(cls):
        cls.priv, cls.pub = _generate_test_keypair()
        cls._orig_pem = offline_license._PLACEHOLDER_PUBKEY_PEM
        offline_license._PLACEHOLDER_PUBKEY_PEM = _pub_key_pem(cls.pub)
        offline_license._PUBLIC_KEY = None

    @classmethod
    def tearDownClass(cls):
        offline_license._PLACEHOLDER_PUBKEY_PEM = cls._orig_pem
        offline_license._PUBLIC_KEY = None

    async def asyncSetUp(self):
        from app.database import engine, Base
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        self.tmp = tempfile.NamedTemporaryFile(
            mode="w", suffix=".lic", delete=False, encoding="utf-8"
        )
        self.path = self.tmp.name

    async def asyncTearDown(self):
        from app.database import engine, Base
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        try:
            os.unlink(self.path)
        except OSError:
            pass

    def _write_lic(self, data: dict):
        with open(self.path, "w", encoding="utf-8") as f:
            json.dump(data, f)

    @patch("app.services.offline_license.generate_hwid")
    async def test_full_pipeline_success(self, mock_hwid):
        mock_hwid.return_value = ("DIGEST", "SUN-FAKE-HWID-FOR-TEST")
        lic = _make_lic_dict(self.priv, {"hwid": "SUN-FAKE-HWID-FOR-TEST"})
        self._write_lic(lic)

        result = await validate_license_file(
            self.path,
            reference_date=date(2026, 7, 22),
        )
        self.assertEqual(result["license_id"], "LIC-9F82-441A-BC01")

        # Replay should now detect it
        with self.assertRaises(LicenseReplayError):
            await validate_license_file(
                self.path,
                reference_date=date(2026, 7, 22),
            )

    @patch("app.services.offline_license.generate_hwid")
    async def test_full_pipeline_expired_license(self, mock_hwid):
        mock_hwid.return_value = ("DIGEST", "SUN-FAKE-HWID-FOR-TEST")
        lic = _make_lic_dict(self.priv, {
            "hwid": "SUN-FAKE-HWID-FOR-TEST",
            "expiry_date": "2025-01-01",
        })
        self._write_lic(lic)

        with self.assertRaises(LicenseExpiredError):
            await validate_license_file(
                self.path,
                reference_date=date(2026, 7, 22),
            )

    @patch("app.services.offline_license.generate_hwid")
    async def test_full_pipeline_hwid_mismatch(self, mock_hwid):
        mock_hwid.return_value = ("DIGEST", "SUN-OTHER-MACHINE")
        lic = _make_lic_dict(self.priv, {"hwid": "SUN-FAKE-HWID-FOR-TEST"})
        self._write_lic(lic)

        with self.assertRaises(LicenseHWIDMismatchError):
            await validate_license_file(
                self.path,
                reference_date=date(2026, 7, 22),
            )

    @patch("app.services.offline_license.generate_hwid")
    async def test_full_pipeline_bad_signature(self, mock_hwid):
        mock_hwid.return_value = ("DIGEST", "SUN-FAKE-HWID-FOR-TEST")
        lic = _make_lic_dict(self.priv, {
            "hwid": "SUN-FAKE-HWID-FOR-TEST",
            "allowed_stations": 2,
        })
        lic["allowed_stations"] = 999  # tamper AFTER signing
        self._write_lic(lic)

        with self.assertRaises(LicenseSignatureError):
            await validate_license_file(
                self.path,
                reference_date=date(2026, 7, 22),
            )


if __name__ == "__main__":
    unittest.main()
