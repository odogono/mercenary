from __future__ import annotations

import sys
import unittest
from pathlib import Path

LAB_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB_ROOT))

from c64lab.core import LabError
from c64lab.object_effects import decode_object_effects


def reference_shaped_ram() -> bytearray:
    ram = bytearray(65536)
    ram[0x8140:0x8145] = bytes.fromhex("a9968d00dd")
    setup = bytes.fromhex(
        "a9008d12d08d1bd0a9018d19d08d1ad08d17d08d1dd0"
        "a9a08d00d0a90f8d27d0a9748d01d0"
    )
    ram[0x8167 : 0x8167 + len(setup)] = setup
    ram[0x91DD:0x91E2] = bytes.fromhex("a9018d27d0")
    ram[0xB23C:0xB242] = bytes.fromhex("a90f8d27d060")
    visibility = bytes.fromhex("a900aee8291002a9018d15d0")
    ram[0x9374 : 0x9374 + len(visibility)] = visibility
    ram[0x00C7] = 0x70
    ram[0x5FF8] = 0xD9
    ram[0x7640:0x7680] = bytes.fromhex("ff00ff" + "00" * 61)
    return ram


class ObjectEffectsDecoderTests(unittest.TestCase):
    def test_decodes_sights_slot_bitmap_placement_expansion_and_colours(self) -> None:
        document = decode_object_effects(bytes(reference_shaped_ram()))

        self.assertEqual(document["schemaVersion"], 1)
        self.assertEqual(document["counts"], {"effects": 1, "sightsPixels": 16})
        self.assertEqual(
            document["sights"],
            {
                "bitmapRows": [0xFF00FF] + [0] * 20,
                "colours": {"room": 1, "surface": 15},
                "height": 21,
                "origin": [136, 66],
                "pixelScale": [2, 2],
                "slot": 40,
                "width": 24,
            },
        )

    def test_rejects_an_altered_sights_instruction_shape(self) -> None:
        ram = reference_shaped_ram()
        ram[0x9376] = 0xAD

        with self.assertRaisesRegex(LabError, "visibility guard changed"):
            decode_object_effects(bytes(ram))

    def test_rejects_an_invalid_sprite_pointer_or_mask(self) -> None:
        ram = reference_shaped_ram()
        ram[0x5FF8] = 0xD8
        with self.assertRaisesRegex(LabError, "sprite pointer"):
            decode_object_effects(bytes(ram))

        ram = reference_shaped_ram()
        ram[0x7643] = 1
        with self.assertRaisesRegex(LabError, "sprite mask"):
            decode_object_effects(bytes(ram))

    def test_requires_a_complete_physical_ram_image(self) -> None:
        with self.assertRaisesRegex(LabError, "64 KiB"):
            decode_object_effects(b"")


if __name__ == "__main__":
    unittest.main()
