from __future__ import annotations

import sys
import unittest
from pathlib import Path

LAB_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB_ROOT))

from c64lab.core import LabError
from c64lab.underground import require_indoor_presentation


class IndoorPresentationFingerprintTests(unittest.TestCase):
    def ram(self) -> bytearray:
        ram = bytearray(65536)
        ram[0xB3F6:0xB3FB] = bytes([0xC0, 0x0E, 0xF0, 0x03, 0x4C])
        ram[0xAFC3:0xAFCA] = bytes([0xA5, 0xA8, 0xF0, 0x03, 0x4C, 0x97, 0xB1])
        ram[0xB197:0xB19B] = bytes([0xA9, 0xAA, 0xA2, 0xF8])
        ram[0x91DB:0x91DE] = bytes([0x85, 0xC4, 0xC8])
        ram[0x91E5:0x91E8] = bytes([0x85, 0xC5, 0xC8])
        return ram

    def test_accepts_the_e_dispatch_indoor_branch_fill_and_palette_loads(self) -> None:
        require_indoor_presentation(bytes(self.ram()))

    def test_rejects_a_changed_fingerprint(self) -> None:
        ram = self.ram()
        ram[0xB198] = 0x00
        with self.assertRaises(LabError):
            require_indoor_presentation(bytes(ram))
