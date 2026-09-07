from __future__ import annotations

import sys
import unittest
from pathlib import Path

LAB_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB_ROOT))

from c64lab.core import LabError
from c64lab.sound import (
    INITIAL_REGISTERS,
    LIFT_PROFILES,
    ONE_SHOT_TABLE,
    SOUND_SCHEMA_VERSION,
    decode_sound,
)


class Builder:
    """A synthetic image carrying only the guarded sound-program shapes."""

    def __init__(self) -> None:
        self.ram = bytearray(65536)
        self.ram[0xB910:0xB921] = bytes(
            [
                0xA2, 0x18, 0xBD, 0x21, 0xB9, 0x9D, 0x00, 0xD4,
                0xCA, 0x10, 0xF7, 0xA9, 0x41, 0x8D, 0x12, 0xD4, 0x60,
            ]
        )
        self.ram[0xB921:0xB93A] = INITIAL_REGISTERS
        self.ram[0xB93A:0xB985] = bytes(
            [
                0x8E, 0x85, 0xB9, 0x8C, 0x86, 0xB9, 0xAA, 0xA0,
                0x07, 0xD0, 0x1C, 0xA5, 0xA8, 0xD0, 0x0E, 0xA5,
                0xA9, 0x30, 0x0A, 0x48, 0xA9, 0x00, 0x20, 0x58,
                0xB9, 0x20, 0xEF, 0xAD, 0x68, 0x60, 0x8C, 0x86,
                0xB9, 0x8E, 0x85, 0xB9, 0xAA, 0xA0, 0x00, 0xA9,
                0x00, 0x99, 0x04, 0xD4, 0xBD, 0x87, 0xB9, 0x99,
                0x01, 0xD4, 0xBD, 0x88, 0xB9, 0x99, 0x05, 0xD4,
                0xBD, 0x89, 0xB9, 0x99, 0x06, 0xD4, 0xBD, 0x8A,
                0xB9, 0x99, 0x04, 0xD4, 0xAC, 0x86, 0xB9, 0xAE,
                0x85, 0xB9, 0x60,
            ]
        )
        self.ram[0xB987:0xB9BB] = ONE_SHOT_TABLE
        self.ram[0xAF3A:0xAF52] = bytes(
            [
                0xA0, 0x1B, 0xD0, 0x02, 0xA0, 0x0D, 0xA2, 0x0D,
                0xB9, 0x52, 0xAF, 0x9D, 0x00, 0xD4, 0x88, 0xCA,
                0xD0, 0xF6, 0xA9, 0x15, 0x8D, 0x0B, 0xD4, 0x60,
            ]
        )
        self.ram[0xAF52:0xAF6E] = LIFT_PROFILES
        for address, data in (
            (0x8DCB, bytes([0xA2, 0x00, 0x8E, 0x0F, 0xD4])),
            (0x8DEE, bytes([0x29, 0x3F, 0xC9, 0x20, 0xD0, 0x02, 0xA9, 0xD0, 0x18, 0x69, 0x30, 0x8D, 0x0F, 0xD4])),
            (0xB5D8, bytes([0xA5, 0xA8, 0xD0, 0x41, 0xA5, 0xA9, 0xC9, 0x0A, 0xF0, 0x3B])),
            (0xB5E2, bytes([0xA5, 0x27, 0x10, 0x04, 0xA9, 0x00, 0xF0, 0x0D, 0x38, 0xE9, 0x0C, 0xF0, 0x02, 0x10, 0x02, 0xA9, 0x04, 0x0A, 0x0A, 0x09, 0x08])),
            (0xB5F8, bytes([0x29, 0xF0, 0x85, 0x06, 0xA5, 0x26, 0x4A, 0x4A, 0x4A, 0x4A, 0x05, 0x06, 0x8D, 0xAB, 0xB9, 0x8D, 0x08, 0xD4])),
            (0xB60A, bytes([0x68, 0xCD, 0xAD, 0xB9, 0xF0, 0x0D, 0x8D, 0xAD, 0xB9, 0x8D, 0x0D, 0xD4, 0x90, 0x05, 0xA9, 0x24, 0x20, 0x3A, 0xB9])),
            (0xBB2F, bytes([0xA0, 0x00, 0x84, 0xCA, 0x8C, 0x0B, 0xD4, 0x60])),
            (0xB43E, bytes([0x20, 0x4D, 0xB9, 0x86, 0xCD])),
            (0xB476, bytes([0xA9, 0x30, 0x20, 0x3A, 0xB9])),
            (0xBA84, bytes([0xB9, 0xA5, 0xBB, 0x8D, 0x08, 0xD4])),
            (0xBAE6, bytes([0xB9, 0xA5, 0xBB, 0x8D, 0x08, 0xD4])),
        ):
            self.ram[address:address + len(data)] = data


class SoundDecodeTests(unittest.TestCase):
    def test_decodes_a_closed_bounded_sound_document(self) -> None:
        sound = decode_sound(bytes(Builder().ram))

        self.assertEqual(sound["schemaVersion"], SOUND_SCHEMA_VERSION)
        self.assertEqual(sound["counts"], {
            "initialRegisters": 25,
            "liftProfiles": 2,
            "oneShotPrograms": 13,
            "voices": 3,
        })
        self.assertEqual(sound["sid"]["model"], "6581")
        self.assertEqual(sound["sid"]["clockHz"], 985248)
        self.assertEqual(sound["initialRegisters"][18], 0x41)
        self.assertEqual(sound["oneShots"][2], {
            "attackDecay": 9,
            "control": 0x81,
            "frequencyHigh": 0x12,
            "selector": 8,
            "sustainRelease": 9,
        })
        self.assertEqual(sound["liftProfiles"][0]["registers"][7], 0x50)
        self.assertEqual(sound["liftProfiles"][1]["registers"][7], 0xE4)
        self.assertEqual(sound["liftProfiles"][0]["startControl"], 0x15)
        self.assertEqual(
            [profile["entry"] for profile in sound["liftProfiles"]],
            ["af3e", "af3a"],
        )
        self.assertEqual(sound["craft"]["programSelector"], 36)
        self.assertEqual(sound["bensonDisplay"]["frequencyHighRegister"], 15)
        self.assertEqual(sound["stopRules"]["liftControlRegister"], 11)
        self.assertEqual(sound["liftJourney"], {
            "dingSelector": 0,
            "programSelector": 48,
            "pitchHighRegister": 8,
            "controlRegister": 11,
            "stoppedValue": 0,
        })

    def test_rejects_non_physical_ram(self) -> None:
        with self.assertRaisesRegex(LabError, "64 KiB"):
            decode_sound(bytes(100))

    def test_guards_code_that_gives_the_tables_their_meaning(self) -> None:
        builder = Builder()
        builder.ram[0xB969] ^= 1

        with self.assertRaisesRegex(LabError, "one-shot dispatch"):
            decode_sound(bytes(builder.ram))

    def test_guards_continuous_modulation_and_stop_paths(self) -> None:
        for address, label in ((0xB604, "craft modulation"), (0xBB33, "lift stop")):
            with self.subTest(address=address):
                builder = Builder()
                builder.ram[address] ^= 1
                with self.assertRaisesRegex(LabError, label):
                    decode_sound(bytes(builder.ram))


if __name__ == "__main__":
    unittest.main()
