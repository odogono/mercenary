from __future__ import annotations

import sys
import unittest
from pathlib import Path

LAB_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB_ROOT))

from c64lab.laboratory import parse_monitor_address  # noqa: E402


class MonitorAddressTests(unittest.TestCase):
    def test_accepts_only_a_loopback_ipv4_monitor_address(self) -> None:
        self.assertEqual(parse_monitor_address("ip4://127.0.0.1:6502"), ("127.0.0.1", 6502))

    def test_rejects_a_non_loopback_monitor_address(self) -> None:
        with self.assertRaisesRegex(Exception, "loopback"):
            parse_monitor_address("ip4://0.0.0.0:6502")


if __name__ == "__main__":
    unittest.main()
