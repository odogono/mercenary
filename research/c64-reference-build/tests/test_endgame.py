from __future__ import annotations

import sys
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from unittest.mock import patch

LAB_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB_ROOT))

from c64lab.core import LabError
from c64lab.cli import main
from c64lab.endgame import (
    DROP_DISPATCH,
    DROP_ROUTINE,
    ENDING_COMPLETE_SITE,
    ENDING_DISPATCH,
    ENDGAME_SCHEMA_VERSION,
    FIRE_CALL_SITE,
    FIRE_ROUTINE,
    HOSTILE_ROUTINE,
    ORBITAL_PREDICATE,
    PROJECTILE_UPDATE,
    census_terminal_dispatches,
    decode_endgame,
)


class Builder:
    """A synthetic image carrying the decoded endgame routines' shape."""

    def __init__(self) -> None:
        self.ram = bytearray(65536)

        self.ram[DROP_DISPATCH:DROP_DISPATCH + 10] = bytes(
            [0xC0, 0x12, 0xD0, 0x06, 0x20, 0xB2, 0xB4, 0x4C, 0xFE, 0x98]
        )
        self.ram[DROP_ROUTINE:DROP_ROUTINE + 30] = bytes(
            [
                0xAD, 0xF8, 0x29, 0x30, 0x04, 0xA5, 0x7F, 0xF0, 0xC5,
                0xA6, 0xEB, 0xF0, 0xC1, 0xC6, 0xEB, 0xBC, 0xB0, 0xBE,
                0xB9, 0xC0, 0x29, 0x29, 0x7F, 0x99, 0xC0, 0x29, 0x20,
                0x4D, 0xB9, 0xA5,
            ]
        )
        self.ram[0x991B:0x9925] = bytes(
            [0xA5, 0xCD, 0x99, 0x40, 0x29, 0xA5, 0x72, 0x99, 0x80, 0x28]
        )

        self.ram[FIRE_CALL_SITE:FIRE_CALL_SITE + 5] = bytes([0xA9, 0x30, 0x20, 0x6A, 0x88])
        self.ram[FIRE_ROUTINE:FIRE_ROUTINE + 36] = bytes(
            [
                0x85, 0x09, 0xA5, 0x81, 0xF0, 0x01, 0x60, 0xA5, 0xA9,
                0x30, 0xFB, 0xA5, 0xF4, 0xD0, 0xF7, 0xA0, 0x08, 0xB9,
                0xA3, 0xBD, 0xD0, 0xF0, 0xA9, 0x08, 0x20, 0x58, 0xB9,
                0xA5, 0xCD, 0x99, 0x40, 0x29, 0xA9, 0x10, 0x99, 0xA3,
            ]
        )

        self.ram[PROJECTILE_UPDATE:PROJECTILE_UPDATE + 8] = bytes(
            [0xA2, 0x0F, 0xBD, 0xA3, 0xBD, 0xF0, 0x71, 0xC9]
        )
        for site, data in (
            (0x8701, [0xE0, 0x08]),
            (0x872E, [0xC9, 0x70]),
            (0x8732, [0xC9, 0x90]),
            (0x8739, [0xC9, 0x70]),
            (0x873D, [0xC9, 0x90]),
            (0x875E, [0xB9, 0x00, 0x2B]),
            (0x8763, [0x09, 0x80]),
            (0x8768, [0xA9, 0x10]),
            (0x8782, [0xA0, 0x0F]),
            (0x878E, [0xA0, 0x00]),
            (0x8789, [0xA2, 0x31]),
            (0x8795, [0xA9, 0x1B]),
        ):
            self.ram[site:site + len(data)] = bytes(data)

        self.ram[HOSTILE_ROUTINE:HOSTILE_ROUTINE + 12] = bytes(
            [0xAD, 0xF8, 0xBE, 0xD0, 0x01, 0x60, 0xA5, 0xCA, 0xD0, 0xFB, 0xA2, 0x0F]
        )
        for site, data in (
            (0x893E, [0xA2, 0x0E]),
            (0x894A, [0xA9, 0x20]),
            (0x897C, [0xA9, 0x00, 0x8D, 0xF8, 0xBE]),
            (0x8986, [0xA9, 0x09, 0x85, 0xA9]),
            (0x898D, [0xA9, 0xFF, 0x8D, 0x4E, 0x29, 0x8D, 0x4F, 0x29]),
        ):
            self.ram[site:site + len(data)] = bytes(data)

        self.ram[ORBITAL_PREDICATE:ORBITAL_PREDICATE + 40] = bytes(
            [
                0xA5, 0x74, 0xC9, 0x08, 0xD0, 0x20, 0xA5, 0x7A, 0xC9,
                0x08, 0xD0, 0x1A, 0xA5, 0x73, 0x38, 0xE9, 0x68, 0xC9,
                0x10, 0xB0, 0x11, 0xA5, 0x79, 0x38, 0xE9, 0x68, 0xC9,
                0x10, 0xB0, 0x08, 0xA5, 0x76, 0xC9, 0xFC, 0x90, 0x02,
                0x18, 0x60, 0x38, 0x60,
            ]
        )
        for site in (0xA01F, 0xA0E6, 0xA1DA):
            self.ram[site:site + 3] = bytes([0x20, 0x3D, 0xA1])

        self.ram[ENDING_DISPATCH:ENDING_DISPATCH + 12] = bytes(
            [0xAD, 0xFE, 0xBE, 0xD0, 0x05, 0xA9, 0x01, 0x85, 0x2B, 0x60, 0xA9, 0x70]
        )
        self.ram[ENDING_COMPLETE_SITE:ENDING_COMPLETE_SITE + 6] = bytes(
            [0xA9, 0xFF, 0x8D, 0xFE, 0xBE, 0x60]
        )

    def build(self) -> bytes:
        return bytes(self.ram)


class DecodeTests(unittest.TestCase):
    def test_decodes_drop_as_a_lifo_inventory_mutation(self) -> None:
        document = decode_endgame(Builder().build())
        drop = document["controls"]["drop"]

        self.assertEqual(drop["keyCode"], 0x12)
        self.assertEqual(drop["inventorySelection"], "last-in-first-out")
        self.assertEqual(drop["carriedMask"], 0x80)
        self.assertEqual(drop["carriedExemptionSlot"], 56)
        self.assertTrue(drop["copiesCurrentRoomAndPosition"])

    def test_decodes_fire_and_site_destruction(self) -> None:
        combat = decode_endgame(Builder().build())["combat"]

        self.assertEqual(combat["fire"]["effectSlot"], 8)
        self.assertEqual(combat["fire"]["lifecycleFrames"], 16)
        self.assertEqual(combat["fire"]["directionOffset"], 0x30)
        self.assertEqual(combat["siteDestruction"]["destroyedMask"], 0x80)
        self.assertEqual(combat["siteDestruction"]["axisWindow"], [0x70, 0x90])
        self.assertEqual(combat["objectHits"]["targetSlots"], [15, 0])

    def test_decodes_the_hostile_craft_capture_transition(self) -> None:
        hostile = decode_endgame(Builder().build())["combat"]["hostileCraft"]

        self.assertEqual(hostile["inboundSlot"], 14)
        self.assertEqual(hostile["attackingSlot"], 15)
        self.assertEqual(hostile["captureMover"], 9)
        self.assertEqual(hostile["captureRemovesSlots"], [14, 15])
        self.assertTrue(hostile["surfaceOnly"])

    def test_decodes_the_orbital_predicate_and_all_three_callers(self) -> None:
        orbital = decode_endgame(Builder().build())["orbitalTransition"]

        self.assertEqual(orbital["cell"], [8, 8])
        self.assertEqual(orbital["axisMiddleByteWindow"], [0x68, 0x78])
        self.assertEqual(orbital["minimumAltitudeByte"], 0xFC)
        self.assertEqual(orbital["callSites"], [0xA01F, 0xA0E6, 0xA1DA])
        self.assertEqual(orbital["successCarry"], "clear")

    def test_decodes_all_game_complete_phases_instead_of_a_boolean(self) -> None:
        ending = decode_endgame(Builder().build())["endingPresentation"]

        self.assertEqual(ending["activeValue"], 0)
        self.assertEqual(ending["scriptedValue"], 1)
        self.assertEqual(ending["completedValue"], 255)
        self.assertEqual(ending["dispatch"], "nonzero-enters-terminal-presentation")

    def test_reports_a_version_and_bounded_counts(self) -> None:
        document = decode_endgame(Builder().build())

        self.assertEqual(document["schemaVersion"], ENDGAME_SCHEMA_VERSION)
        self.assertEqual(document["counts"], {"orbitalCallSites": 3, "objectHitTargets": 2})


class TerminalCensusTests(unittest.TestCase):
    @staticmethod
    def document(*, terminal_value: int = 1, terminal_script: int = 7) -> dict:
        scripts = [{"id": script, "entry": 0} for script in range(51)]
        scripts[terminal_script]["entry"] = 1
        return {
            "scripts": scripts,
            "instructions": [
                {"op": "ret"},
                {"op": "stor", "symbol": "gameComplete", "value": terminal_value},
                {"op": "ret"},
            ],
            "counts": {"scripts": 51, "unreachableBytes": 8},
        }

    def test_finds_the_only_reachable_terminal_dispatch(self) -> None:
        census = census_terminal_dispatches(self.document())

        self.assertEqual(
            census["dispatches"],
            [{"script": 7, "instruction": 1, "value": 1}],
        )
        self.assertEqual(census["endingIdentities"], ["escape"])
        self.assertEqual(census["defeatDispatches"], 0)
        self.assertEqual(census["unreachableCodeBytes"], 8)

    def test_rejects_a_second_terminal_script(self) -> None:
        document = self.document()
        document["scripts"][8]["entry"] = 1

        with self.assertRaisesRegex(LabError, "exactly script 7"):
            census_terminal_dispatches(document)

    def test_rejects_an_unknown_terminal_value(self) -> None:
        with self.assertRaisesRegex(LabError, "value is not the decoded Escape phase"):
            census_terminal_dispatches(self.document(terminal_value=2))


class GuardTests(unittest.TestCase):
    def test_requires_a_full_physical_ram_image(self) -> None:
        with self.assertRaisesRegex(LabError, "64 KiB physical RAM"):
            decode_endgame(bytes(1024))

    def test_rejects_a_changed_drop_dispatch(self) -> None:
        builder = Builder()
        builder.ram[DROP_DISPATCH] = 0xEA

        with self.assertRaisesRegex(LabError, "drop key dispatch"):
            decode_endgame(builder.build())

    def test_rejects_a_changed_projectile_target_order(self) -> None:
        builder = Builder()
        builder.ram[0x8782] = 0xEA

        with self.assertRaisesRegex(LabError, "first object target"):
            decode_endgame(builder.build())

    def test_rejects_a_changed_orbital_bound(self) -> None:
        builder = Builder()
        builder.ram[0xA14D] = 0x69

        with self.assertRaisesRegex(LabError, "Orbital axes use different lower bounds"):
            decode_endgame(builder.build())

    def test_rejects_a_booleanized_terminal_completion(self) -> None:
        builder = Builder()
        builder.ram[ENDING_COMPLETE_SITE + 1] = 0x01

        with self.assertRaisesRegex(LabError, "terminal presentation does not advance"):
            decode_endgame(builder.build())


class CliTests(unittest.TestCase):
    def test_cli_decodes_a_verified_interactive_capture(self) -> None:
        output = StringIO()
        benson = TerminalCensusTests.document()
        with (
            patch("c64lab.cli.load_geometry_source", return_value=(Builder().build(), {"runId": "run-1"})),
            patch("c64lab.cli.decode_benson", return_value=benson),
            redirect_stdout(output),
        ):
            status = main(["endgame", "decode", "--run", "some-run"])

        self.assertEqual(status, 0)
        self.assertIn('"runId": "run-1"', output.getvalue())
        self.assertIn('"completedValue": 255', output.getvalue())
        self.assertIn('"defeatDispatches": 0', output.getvalue())


if __name__ == "__main__":
    unittest.main()
