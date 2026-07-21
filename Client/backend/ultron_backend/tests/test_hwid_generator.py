"""
Unit tests for HWID Generator Service (SHA256 composition & fallback behavior)
"""

import hashlib
import unittest
from unittest.mock import patch
from app.services.hwid_generator import (
    generate_hwid,
    get_hardware_components,
    INVALID_HARDWARE_VALUES,
)


class TestHWIDGenerator(unittest.TestCase):

    @patch("app.services.hwid_generator._query_powershell")
    @patch("app.services.hwid_generator._query_wmic")
    def test_get_hardware_components_powershell_success(self, mock_wmic, mock_ps):
        mock_ps.side_effect = lambda cmd: {
            "(Get-CimInstance -ClassName Win32_ComputerSystemProduct).UUID": "6E9AE14C-30B2-11B2-A85C-F2AAECD709C5",
            "(Get-CimInstance -ClassName Win32_Processor).ProcessorId": "BFEBFBFF000806EA",
            "(Get-CimInstance -ClassName Win32_BIOS).SerialNumber": "PF1PDV44",
        }.get(cmd, "")
        mock_wmic.return_value = ""

        components = get_hardware_components()
        self.assertEqual(components["motherboard_uuid"], "6E9AE14C-30B2-11B2-A85C-F2AAECD709C5")
        self.assertEqual(components["cpu_serial"], "BFEBFBFF000806EA")
        self.assertEqual(components["bios_serial"], "PF1PDV44")

    @patch("app.services.hwid_generator._query_powershell")
    @patch("app.services.hwid_generator._query_wmic")
    def test_get_hardware_components_wmic_fallback(self, mock_wmic, mock_ps):
        mock_ps.return_value = ""
        mock_wmic.side_effect = lambda cmd: {
            "wmic csproduct get uuid": "6E9AE14C-30B2-11B2-A85C-F2AAECD709C5",
            "wmic cpu get processorid": "BFEBFBFF000806EA",
            "wmic bios get serialnumber": "PF1PDV44",
        }.get(cmd, "")

        components = get_hardware_components()
        self.assertEqual(components["motherboard_uuid"], "6E9AE14C-30B2-11B2-A85C-F2AAECD709C5")
        self.assertEqual(components["cpu_serial"], "BFEBFBFF000806EA")
        self.assertEqual(components["bios_serial"], "PF1PDV44")

    def test_generate_hwid_full_components(self):
        components = {
            "motherboard_uuid": "MOBO_UUID_123",
            "cpu_serial": "CPU_SERIAL_456",
            "bios_serial": "BIOS_SERIAL_789",
        }
        expected_composition = "MOBO_UUID_123:CPU_SERIAL_456:BIOS_SERIAL_789"
        expected_digest = hashlib.sha256(expected_composition.encode("utf-8")).hexdigest().upper()
        expected_formatted = f"SUN-{expected_digest[:4]}-{expected_digest[4:8]}-{expected_digest[8:12]}"

        raw_digest, formatted = generate_hwid(components)
        self.assertEqual(raw_digest, expected_digest)
        self.assertEqual(formatted, expected_formatted)

    def test_generate_hwid_missing_motherboard_uuid_fallback(self):
        """Verify fallback behavior: BIOS Serial is used as primary component when Motherboard UUID is missing"""
        components = {
            "motherboard_uuid": "",
            "cpu_serial": "CPU_SERIAL_456",
            "bios_serial": "BIOS_SERIAL_789",
        }
        # Fallback uses bios_serial ("BIOS_SERIAL_789") as primary_component
        expected_composition = "BIOS_SERIAL_789:CPU_SERIAL_456:BIOS_SERIAL_789"
        expected_digest = hashlib.sha256(expected_composition.encode("utf-8")).hexdigest().upper()

        raw_digest, formatted = generate_hwid(components)
        self.assertEqual(raw_digest, expected_digest)
        self.assertTrue(formatted.startswith("SUN-"))


if __name__ == "__main__":
    unittest.main()
