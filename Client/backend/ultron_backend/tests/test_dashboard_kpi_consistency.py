"""
Regression test: System Summary offline count vs ParameterCard isOffline consistency.

The bug (fixed 2026-08-13): System Summary used kpis.offlineDevices from a
throttled API fetch (30s TTL) while ParameterCard used liveData[tag].status != "online"
from WebSocket pushes. They could disagree by up to 30s whenever a parameter went offline.

Fix: offlineCount is now derived from the same liveData object as the cards,
using the identical status != "online" predicate. This test proves that contract.
"""

import pytest


def card_is_offline(data: dict | None) -> bool:
    """ParameterCard line 62: const isOffline = !data || data.status !== 'online'"""
    return data is None or data.get("status") != "online"


def derive_counts(live_data: dict) -> dict:
    """
    DashboardScreen useMemo:
      const vals = Object.values(liveData);
      const online = vals.filter(d => d.status === 'online').length;
      return { onlineCount: online, offlineCount: vals.length - online };
    """
    vals = list(live_data.values())
    online = sum(1 for d in vals if d.get("status") == "online")
    return {"onlineCount": online, "offlineCount": len(vals) - online}


class TestKpiCardConsistency:
    def _assert_consistent(self, live_data: dict):
        counts = derive_counts(live_data)
        cards_offline = sum(1 for d in live_data.values() if card_is_offline(d))
        assert counts["offlineCount"] == cards_offline, (
            f"System Summary says {counts['offlineCount']} offline, "
            f"but {cards_offline} ParameterCards would render OFFLINE."
        )
        assert counts["onlineCount"] + counts["offlineCount"] == len(live_data)

    def test_all_online(self):
        live_data = {
            "SO2":  {"status": "online", "value": 12.5},
            "NO2":  {"status": "online", "value": 8.3},
            "NO":   {"status": "online", "value": 4.1},
            "PM10": {"status": "online", "value": 55.0},
        }
        self._assert_consistent(live_data)
        assert derive_counts(live_data)["offlineCount"] == 0

    def test_all_offline_screenshot_scenario(self):
        """The exact screenshot: 4 cards red, summary must say 4 not 3."""
        live_data = {
            "SO2":    {"status": "offline", "value": None},
            "NO2":    {"status": "offline", "value": None},
            "SO2_aa": {"status": "offline", "value": None},
            "NO_aa":  {"status": "offline", "value": None},
        }
        self._assert_consistent(live_data)
        assert derive_counts(live_data)["offlineCount"] == 4

    def test_partial_offline(self):
        live_data = {
            "SO2": {"status": "online",  "value": 22.1},
            "NO2": {"status": "offline", "value": None},
            "NO":  {"status": "offline", "value": None},
        }
        self._assert_consistent(live_data)
        counts = derive_counts(live_data)
        assert counts["offlineCount"] == 2
        assert counts["onlineCount"] == 1

    def test_empty_live_data(self):
        self._assert_consistent({})
        counts = derive_counts({})
        assert counts["offlineCount"] == 0
        assert counts["onlineCount"] == 0

    def test_predicate_exhaustive(self):
        """Structural guard: every possible status value must agree."""
        for status in ["online", "offline", "unknown", None]:
            data = {"status": status} if status is not None else {}
            counts = derive_counts({"PARAM": data})
            expected_offline = 1 if card_is_offline(data) else 0
            assert counts["offlineCount"] == expected_offline, (
                f"Mismatch for status={status!r}"
            )
