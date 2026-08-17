"""
Unit tests for Deployment Mode Service (online | offline_only storage and reconfiguration)
"""

import unittest
from app.config import settings
from app.services.deployment_mode import (
    get_deployment_mode,
    is_online_mode,
    is_offline_only_mode,
    set_deployment_mode,
)


class TestDeploymentMode(unittest.TestCase):

    def setUp(self):
        # Reset settings to default before each test
        self.original_mode = getattr(settings, "DEPLOYMENT_MODE", "online")
        settings.DEPLOYMENT_MODE = "online"

    def tearDown(self):
        settings.DEPLOYMENT_MODE = self.original_mode

    def test_default_deployment_mode_is_online(self):
        mode = get_deployment_mode()
        self.assertEqual(mode, "online")
        self.assertTrue(is_online_mode())
        self.assertFalse(is_offline_only_mode())

    def test_set_deployment_mode_success(self):
        result = set_deployment_mode("offline_only", settings.ADMIN_PASSWORD)
        self.assertEqual(result["status"], "success")
        self.assertEqual(result["current_mode"], "offline_only")
        self.assertEqual(get_deployment_mode(), "offline_only")
        self.assertTrue(is_offline_only_mode())
        self.assertFalse(is_online_mode())

    def test_set_deployment_mode_invalid_password_raises_permission_error(self):
        with self.assertRaises(PermissionError):
            set_deployment_mode("offline_only", "wrong_password_123")
        self.assertEqual(get_deployment_mode(), "online")

    def test_set_deployment_mode_invalid_mode_raises_value_error(self):
        with self.assertRaises(ValueError):
            set_deployment_mode("invalid_mode_xyz", settings.ADMIN_PASSWORD)
        self.assertEqual(get_deployment_mode(), "online")


if __name__ == "__main__":
    unittest.main()
