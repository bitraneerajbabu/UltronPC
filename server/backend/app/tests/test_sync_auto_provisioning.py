"""
Unit tests for RajAPI sync auto-provisioning guard and duplicate parameter prevention.
"""

import unittest
import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy import Column, Integer, String, Float, ForeignKey, Boolean, DateTime
from sqlalchemy.orm import relationship

import os
os.environ["SECRET_KEY"] = "test-secret-key-1234567890-secure"
os.environ["DATABASE_URL"] = "sqlite:///test.db"
os.environ["ADMIN_KEY"] = "test-admin-key-123"

from app.api.deps import _get_or_create_param
from app.models.core import IndustrySite, Device, Parameter, Base


class TestSyncAutoProvisioning(unittest.TestCase):

    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        Session = sessionmaker(bind=self.engine)
        self.db = Session()
        self.site = IndustrySite(name="KTPP Plant 1", api_key="ktpp_secret_123")
        self.db.add(self.site)
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_no_station_specified_skips_creation_and_logs_warning(self):
        """1. Sync payload with no station specified -> no parameter/device created, warning logged."""
        with self.assertLogs("app.api.deps", level="WARNING") as cm:
            param = _get_or_create_param(
                db=self.db,
                site=self.site,
                tag_name="PM10",
                unit="ug/m3",
                station_name=None  # No station specified
            )

        self.assertIsNone(param)
        self.assertEqual(self.db.query(Parameter).count(), 0)
        self.assertEqual(self.db.query(Device).count(), 0)
        self.assertTrue(any("No explicit station specified" in log for log in cm.output))

    def test_duplicate_parameter_prevention_reuses_existing_row(self):
        """2. Sync payload for an already-existing parameter -> reuses existing row, no duplicate."""
        # First call with valid station -> creates parameter
        param1 = _get_or_create_param(
            db=self.db,
            site=self.site,
            tag_name="PM10",
            unit="ug/m3",
            station_name="Stack 1"
        )
        self.assertIsNotNone(param1)
        self.assertEqual(self.db.query(Parameter).count(), 1)

        # Second call with same tag_name -> reuses existing row
        param2 = _get_or_create_param(
            db=self.db,
            site=self.site,
            tag_name="PM10",
            unit="ug/m3",
            station_name="Stack 1"
        )
        self.assertIsNotNone(param2)
        self.assertEqual(param1.id, param2.id)
        self.assertEqual(self.db.query(Parameter).count(), 1)

    def test_valid_station_creates_parameter_and_device(self):
        """3. Sync payload for a genuinely new, properly-specified device+station -> creates correctly."""
        param = _get_or_create_param(
            db=self.db,
            site=self.site,
            tag_name="SO2",
            unit="ppm",
            station_name="Ambient Station 2"
        )

        self.assertIsNotNone(param)
        self.assertEqual(param.tag_name, "SO2")
        self.assertEqual(param.station_name, "Ambient Station 2")
        self.assertEqual(self.db.query(Parameter).count(), 1)
        self.assertEqual(self.db.query(Device).count(), 1)
        device = self.db.query(Device).first()
        self.assertEqual(device.name, "Ambient Station 2 Device")


if __name__ == "__main__":
    unittest.main()
