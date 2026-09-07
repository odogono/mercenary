from __future__ import annotations

import sys
import unittest
from pathlib import Path

LAB_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB_ROOT))

from c64lab.core import LabError
from c64lab.underground import decode_lift_journey, require_indoor_presentation


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


class LiftJourneyDecodeTests(unittest.TestCase):
    def test_decodes_the_raster_clock_motion_sound_and_access_tables(self) -> None:
        ram = bytearray(65536)
        ram[0xBB89:0xBBA5] = bytes(
            [2, 4, *([8] * 22), 5, 3, 2, 1]
        )
        ram[0xBBA5:0xBBC2] = bytes(
            [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 4, *([5] * 12), 4, 3, 2, 0]
        )
        ram[0xBBC2:0xBBCF] = bytes([2, 6, 9, 4, 5, 2, 2, 8, 11, 0, 9, 0, 11])

        self.assertEqual(
            decode_lift_journey(bytes(ram)),
            {
                "framesPerSecond": 50,
                "positionWrap": 132,
                "motionRates": [2, 4, *([8] * 22), 5, 3, 2, 1],
                "pitchHighBytes": [
                    2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 4,
                    *([5] * 12), 4, 3, 2, 0,
                ],
                "ascending": {"stage": 0, "position": 66, "sceneAt": 12, "stopAt": 14},
                "descending": {"stage": 13, "position": 131, "sceneAt": 8, "floor": 128},
                "cameraOffsets": {"ascending": 38, "descending": 6},
                "screen": {
                    "rasterBase": 50,
                    "rasterLimit": 133,
                    "outdoorLineColours": [6, 9, 4, 5, 2, 2, 8],
                    "indoorLineColours": [11, 0, 9, 0],
                    "descendingInitialLineColour": 11,
                    "descendingInitialScreenColour": 0,
                },
                "timing": [
                    {"room": 1, "down": {"sceneAt": 193, "stopAt": 340}, "up": {"sceneAt": 206, "stopAt": 338}},
                    {"room": 2, "down": {"sceneAt": 193, "stopAt": 336}, "up": {"sceneAt": 207, "stopAt": 338}},
                    {"room": 3, "down": {"sceneAt": 193, "stopAt": 340}, "up": {"sceneAt": 208, "stopAt": 338}},
                    {"room": 4, "down": {"sceneAt": 193, "stopAt": 336}, "up": {"sceneAt": 206, "stopAt": 338}},
                    {"room": 5, "down": {"sceneAt": 193, "stopAt": 340}, "up": {"sceneAt": 204, "stopAt": 338}},
                    {"room": 8, "down": {"sceneAt": 191, "stopAt": 339}, "up": {"sceneAt": 209, "stopAt": 338}},
                ],
                "access": {"restrictedRoom": 5, "passSlot": 46, "refusalMessage": 57},
            },
        )

    def test_rejects_changed_motion_table_length_or_tail(self) -> None:
        ram = bytearray(65536)
        ram[0xBB89:0xBBA5] = bytes([2, 4, *([8] * 22), 5, 3, 2, 0])
        ram[0xBBA5:0xBBC2] = bytes([2] * 29)
        ram[0xBBC2:0xBBCF] = bytes([2, 6, 9, 4, 5, 2, 2, 8, 11, 0, 9, 0, 11])
        with self.assertRaises(LabError):
            decode_lift_journey(bytes(ram))
