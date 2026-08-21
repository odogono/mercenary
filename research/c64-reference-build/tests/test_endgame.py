from __future__ import annotations

import sys
import unittest
from contextlib import redirect_stderr, redirect_stdout
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
    FIELD_COLOUR_TABLE,
    FIELD_ENTRY,
    FIELD_LOOP,
    FIELD_POINT_COUNT_SITE,
    FIRE_CALL_SITE,
    FIRE_ROUTINE,
    HOSTILE_ROUTINE,
    ORBITAL_PREDICATE,
    PROJECTILE_UPDATE,
    census_terminal_dispatches,
    decode_endgame,
)
from c64lab.prng import RANDOM_ROUTINE, RANDOM_STATE, RANDOM_VALUE


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
        self.ram[0x980B:0x980E] = bytes([0xAD, 0xEF, 0x29])
        self.ram[0x9817:0x981A] = bytes([0xAD, 0xDB, 0x29])

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

        self._terminal_field()

    def _place(self, address: int, *values: int) -> None:
        self.ram[address:address + len(values)] = bytes(values)

    def _terminal_field(self) -> None:
        # Sparse structural fingerprints. Colour values are deliberately invented.
        for address, values in (
            (RANDOM_ROUTINE, (0xA5, RANDOM_VALUE, 0x6A, 0x6A, 0x6A)),
            (RANDOM_ROUTINE + 5, (0x45, RANDOM_VALUE, 0x6A)),
            (RANDOM_ROUTINE + 8, (0x66, RANDOM_STATE)),
            (RANDOM_ROUTINE + 10, (0x66, RANDOM_VALUE, 0x60)),
            (FIELD_ENTRY, (0xA9, 0x70, 0x85, 0xC7)),
            (0xAA77, (0x20, 0x26, 0xAC)),
            (0xAA7A, (0xAE, 0x4A, 0xAC, 0xA9, 0x01)),
            (0xAA7F, (0x9D, 0x80, 0x03)),
            (0xAA82, (0x9D, 0xC0, 0x06)),
            (0xAA85, (0x9D, 0x80, 0x06)),
            (0xAA8F, (0x20, 0xA1, 0xB1)),
            (0xAA92, (0x4C, 0xF2, 0xAA)),
            (FIELD_LOOP, (0x20, 0xB2, 0x8A)),
            (0xAA98, (0x20, 0xFE, 0xB2)),
            (0xAA9B, (0x20, 0x1C, 0xAC)),
            (0xAA9E, (0xAD, 0x12, 0xD0, 0xC9, 0xE0, 0xD0, 0xF9)),
            (0xAAAA, (0xBC, 0x80, 0x04)),
            (0xAAB2, (0xBD, 0x00, 0x04)),
            (0xAACF, (0xBC, 0xC0, 0x06)),
            (0xAAD7, (0xBD, 0x80, 0x06)),
            (0xAAF2, (0xAE, 0x4A, 0xAC)),
            (0xAAF7, (0xBD, 0x00, 0x01)),
            (0xAAFC, (0xBD, 0x40, 0x01)),
            (0xAB01, (0xBD, 0x80, 0x01)),
            (0xAB06, (0xBD, 0xC0, 0x02)),
            (0xAB0B, (0xBD, 0x40, 0x03)),
            (0xAB10, (0xBD, 0x80, 0x03)),
            (0xAB15, (0xBD, 0x80, 0x06)),
            (0xAB18, (0x9D, 0x00, 0x04)),
            (0xAB1B, (0xBD, 0xC0, 0x06)),
            (0xAB1E, (0x9D, 0x80, 0x04)),
            (0xAB29, (0xAE, 0x4E, 0xAC, 0xAC, 0x4F, 0xAC)),
            (0xAB2F, (0x20, 0x8B, 0x83, 0x98, 0x4A, 0xB0)),
            (0xAB46, (0x20, 0x34, 0x83, 0x20, 0x77, 0x84, 0xB0)),
            (0xAB4E, (0x69, 0x50, 0xC9, 0xA0, 0xB0)),
            (0xAB62, (0x20, 0x34, 0x83, 0x20, 0x77, 0x84, 0xB0)),
            (0xAB6A, (0x69, 0x44, 0xC9, 0x88, 0xB0)),
            (0xAB70, (0xA6, 0x19, 0x9D, 0xC0, 0x06)),
            (0xAB77, (0x9D, 0x80, 0x06)),
            (0xAB7C, (0x9D, 0x40, 0x03)),
            (0xAB81, (0x9D, 0x80, 0x03)),
            (0xAB97, (0xAD, 0xFE, 0xBE, 0x10)),
            (0xAB9C, (0xC0, 0x25, 0xF0)),
            (0xABA0, (0xAE, 0x50, 0xAC, 0xAC, 0x51, 0xAC)),
            (0xABA6, (0xA9, 0x00, 0x8D, 0x51, 0xAC)),
            (0xABAB, (0x20, 0xFA, 0x82)),
            (0xABAE, (0x8E, 0x4E, 0xAC, 0x8C, 0x4F, 0xAC)),
            (0xABB4, (0xCE, 0x52, 0xAC)),
            (0xABB7, (0xAD, 0x52, 0xAC)),
            (0xABBF, (0x20, 0xEF, 0xAD)),
            (0xABC4, (0x20, 0xEF, 0xAD)),
            (0xABC8, (0x20, 0xEF, 0xAD)),
            (0xABCB, (0x2D, 0x4B, 0xAC, 0x38, 0xED, 0x4C, 0xAC)),
            (0xABD2, (0x20, 0x10, 0x85, 0x99, 0x00, 0x01)),
            (0xABDC, (0x20, 0xEF, 0xAD)),
            (0xABE1, (0x20, 0xEF, 0xAD)),
            (0xABE5, (0x20, 0xEF, 0xAD)),
            (0xABE8, (0x2D, 0x4B, 0xAC, 0x38, 0xED, 0x4C, 0xAC)),
            (0xABEF, (0x20, 0x10, 0x85, 0x99, 0x80, 0x01)),
            (0xABF6, (0x99, 0xC0, 0x02)),
            (0xABF9, (0x20, 0xEF, 0xAD, 0x99, 0x40, 0x03)),
            (0xABFF, (0xAD, 0x4D, 0xAC, 0x99, 0x80, 0x03)),
            (0xAC1C, (0xCE, 0x0A, 0xAC, 0xD0)),
            (0xAC21, (0xA9, 0x03, 0x8D, 0x0A, 0xAC)),
            (0xAC26, (0xAE, 0x0B, 0xAC)),
            (0xAC29, (0xBD, 0x0C, 0xAC, 0x85, 0xA3)),
            (0xAC2E, (0xBC, 0x0D, 0xAC, 0x85, 0xA4)),
            (0xAC35, (0x20, 0x4F, 0xBB)),
            (0xAC3A, (0xE0, 0x0E, 0xF0, 0x06)),
            (0xAC3E, (0xE8, 0xE8, 0x8E, 0x0B, 0xAC)),
        ):
            self._place(address, *values)

        invented_colours = (
            0x10, 0x20, 0x10, 0x30, 0x20, 0x30, 0x20, 0x40,
            0x30, 0x40, 0x30, 0x50, 0x40, 0x50, 0x40, 0x60,
        )
        self._place(FIELD_COLOUR_TABLE, *invented_colours)
        self._place(0xAC0A, 0x60, 0x00)
        self._place(FIELD_POINT_COUNT_SITE, 0x14, 0x3F, 0x20, 0x38, 0x00, 0x15, 0x03, 0x08, 0x99)

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

    def test_decodes_the_two_take_override_identities(self) -> None:
        overrides = decode_endgame(Builder().build())["controls"]["takeOverrides"]

        self.assertEqual(overrides["sinkSlot"], 47)
        self.assertEqual(overrides["antigravSlot"], 27)

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

    def test_decodes_the_interstellar_ship_fields_points_and_first_visible_state(self) -> None:
        field = decode_endgame(Builder().build())["endingPresentation"]["interstellarShipField"]

        self.assertEqual(field["pointSlots"], {"first": 0, "last": 20, "count": 21, "identity": "stable-index"})
        self.assertEqual(field["storage"]["components"]["x"], {"mantissaBase": 0x0100, "exponentBase": 0x0140})
        self.assertEqual(field["initialization"]["stages"][1]["result"], "all-slots-respawn-and-project")
        self.assertEqual(field["initialization"]["stages"][2]["result"], "all-slots-visible")

    def test_decodes_motion_projection_and_validity_driven_respawn(self) -> None:
        field = decode_endgame(Builder().build())["endingPresentation"]["interstellarShipField"]

        self.assertEqual(field["motion"]["phaseBranch"], "sign")
        self.assertEqual(field["motion"]["provenPhaseValues"], [0, 1, 255])
        self.assertEqual(field["motion"]["scriptedPhaseDepthDelta"], -32.0)
        self.assertEqual(field["motion"]["maturePhaseFirstMultiplier"], 4.046875)
        self.assertEqual(field["motion"]["maturePhaseLaterMultiplier"], 1.01171875)
        self.assertEqual(field["motion"]["accelerationSideByteEffect"], "decremented-and-loaded-without-control-flow-use")
        self.assertEqual(field["projection"]["horizontal"], {"centre": 80, "range": [0, 160]})
        self.assertEqual(field["projection"]["vertical"], {"centre": 68, "range": [0, 136]})
        self.assertEqual(field["respawn"]["lifetime"], "none")
        self.assertEqual(field["respawn"]["randomDraws"], 7)
        self.assertEqual(field["respawn"]["x"]["range"], [-2097152, 2097151])
        self.assertEqual(field["respawn"]["y"]["range"], [-2097152, 2097151])
        self.assertEqual(field["respawn"]["z"]["range"], [16384, 32704])

    def test_decodes_ordered_loop_colour_timeline_and_continuation_state(self) -> None:
        field = decode_endgame(Builder().build())["endingPresentation"]["interstellarShipField"]

        self.assertEqual(
            field["loopOrder"],
            ["benson-step", "input-sample", "colour-step", "raster-wait", "erase-prior-points", "draw-current-points", "update-project-respawn"],
        )
        self.assertEqual([event["loop"] for event in field["colours"]["events"]], [0, 96, 99, 102, 105, 108, 111, 114])
        self.assertEqual(field["colours"]["events"][0]["lineColour"], 1)
        self.assertEqual(field["colours"]["events"][-1]["screenColour"], 6)
        self.assertEqual(field["colours"]["completedPhaseLoop"], 114)
        self.assertEqual(field["colours"]["repeatFinalEveryLoops"], 3)
        state_names = {item["name"] for item in field["continuationState"]}
        self.assertTrue({"terminalPhase", "pointComponents", "currentScreenPositions", "priorScreenPositions", "colourState", "motionState", "accelerationSideByte", "sharedPrngState"} <= state_names)

    def test_reports_a_version_and_bounded_counts(self) -> None:
        document = decode_endgame(Builder().build())

        self.assertEqual(ENDGAME_SCHEMA_VERSION, 2)
        self.assertEqual(document["schemaVersion"], ENDGAME_SCHEMA_VERSION)
        self.assertEqual(document["counts"], {"orbitalCallSites": 3, "objectHitTargets": 2, "interstellarShipFieldPoints": 21})


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
                {"op": "call", "target": 12},
                {"op": "stor", "symbol": "messageInterval", "value": 150},
                {"op": "tstf", "mask": 0x20, "onTaken": {"kind": "jmp", "target": 6}},
                {"op": "msg", "tokens": []},
                {"op": "call", "target": 15},
                {"op": "call", "target": 15},
                {"op": "msg", "tokens": []},
                {"op": "sound", "symbol": "voice1.control", "value": 0},
                {"op": "sound", "symbol": "voice2.control", "value": 0},
                {"op": "jmp", "target": 7},
                {"op": "cfr"},
                {"op": "wfr", "ticks": 2, "onTaken": {"kind": "jmp", "target": 13}},
                {"op": "ret"},
                {"op": "cfr"},
                {"op": "wfr", "ticks": 15, "onTaken": {"kind": "jmp", "target": 16}},
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
        self.assertEqual(
            census["endingScriptLoop"],
            {
                "script": 7,
                "initialWaitTicks": 2,
                "messageInterval": 150,
                "optionalEpilogueFlagMask": 0x20,
                "preLoopWaitTicks": 15,
                "repeat": {
                    "waitTicks": 15,
                    "messageInstructions": 1,
                    "sidControlRequests": [
                        {"symbol": "voice1.control", "value": 0},
                        {"symbol": "voice2.control", "value": 0},
                    ],
                },
            },
        )

    def test_rejects_a_second_terminal_script(self) -> None:
        document = self.document()
        document["scripts"][8]["entry"] = 1

        with self.assertRaisesRegex(LabError, "exactly script 7"):
            census_terminal_dispatches(document)

    def test_rejects_an_unknown_terminal_value(self) -> None:
        with self.assertRaisesRegex(LabError, "value is not the decoded Escape phase"):
            census_terminal_dispatches(self.document(terminal_value=2))

    def test_rejects_a_changed_repeating_terminal_tail(self) -> None:
        document = self.document()
        document["instructions"][11]["target"] = 8

        with self.assertRaisesRegex(LabError, "repeat from its terminal label wait"):
            census_terminal_dispatches(document)

    def test_rejects_a_changed_sid_control_identity(self) -> None:
        document = self.document()
        document["instructions"][10]["symbol"] = "voice3.control"

        with self.assertRaisesRegex(LabError, "repeating SID-control tail"):
            census_terminal_dispatches(document)


class GuardTests(unittest.TestCase):
    def test_requires_a_full_physical_ram_image(self) -> None:
        with self.assertRaisesRegex(LabError, "64 KiB physical RAM"):
            decode_endgame(bytes(1024))

    def test_rejects_a_changed_drop_dispatch(self) -> None:
        builder = Builder()
        builder.ram[DROP_DISPATCH] = 0xEA

        with self.assertRaisesRegex(LabError, "drop key dispatch"):
            decode_endgame(builder.build())

    def test_rejects_changed_take_override_fingerprints(self) -> None:
        for address, complaint in ((0x980B, "Sink override"), (0x9817, "Antigrav override")):
            with self.subTest(address=address):
                builder = Builder()
                builder.ram[address] = 0xEA

                with self.assertRaisesRegex(LabError, complaint):
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

    def test_rejects_a_changed_point_bound(self) -> None:
        builder = Builder()
        builder.ram[FIELD_POINT_COUNT_SITE] = 19

        with self.assertRaisesRegex(LabError, "21 stable point slots"):
            decode_endgame(builder.build())

    def test_rejects_a_changed_point_storage_identity(self) -> None:
        builder = Builder()
        builder.ram[0xAA80] = 0x40

        with self.assertRaisesRegex(LabError, "depth exponent storage"):
            decode_endgame(builder.build())

    def test_rejects_a_changed_respawn_random_call(self) -> None:
        builder = Builder()
        builder.ram[0xABBF] = 0xEA

        with self.assertRaisesRegex(LabError, "seven shared random draws"):
            decode_endgame(builder.build())

    def test_rejects_a_changed_respawn_coordinate_bound(self) -> None:
        builder = Builder()
        builder.ram[FIELD_POINT_COUNT_SITE + 1] = 0x1F

        with self.assertRaisesRegex(LabError, "respawn coordinate bounds"):
            decode_endgame(builder.build())

    def test_rejects_a_changed_projection_bound(self) -> None:
        builder = Builder()
        builder.ram[0xAB51] = 0x90

        with self.assertRaisesRegex(LabError, "horizontal projection bound"):
            decode_endgame(builder.build())

    def test_rejects_a_changed_phase_branch(self) -> None:
        builder = Builder()
        builder.ram[0xAB9A] = 0x30

        with self.assertRaisesRegex(LabError, "terminal phase sign"):
            decode_endgame(builder.build())

    def test_rejects_a_changed_acceleration_side_byte_read(self) -> None:
        builder = Builder()
        builder.ram[0xABB7] = 0xA5

        with self.assertRaisesRegex(LabError, "acceleration side byte read"):
            decode_endgame(builder.build())

    def test_rejects_a_changed_colour_completion_branch(self) -> None:
        builder = Builder()
        builder.ram[0xAC3C] = 0xD0

        with self.assertRaisesRegex(LabError, "colour sequence completion"):
            decode_endgame(builder.build())

    def test_rejects_a_changed_terminal_loop_order(self) -> None:
        builder = Builder()
        builder.ram[FIELD_LOOP] = 0xEA

        with self.assertRaisesRegex(LabError, "Benson before input"):
            decode_endgame(builder.build())


class CliTests(unittest.TestCase):
    def test_cli_decodes_a_verified_interactive_capture(self) -> None:
        output = StringIO()
        benson = TerminalCensusTests.document()
        configured_hash = "f" * 64
        with (
            patch("c64lab.cli.load_configuration", return_value=({"hashes": {"sha256": configured_hash}}, {})),
            patch("c64lab.cli.load_geometry_source", return_value=(Builder().build(), {"runId": "run-1"})) as load_source,
            patch("c64lab.cli.decode_benson", return_value=benson),
            redirect_stdout(output),
        ):
            status = main(["endgame", "decode", "--run", "some-run"])

        self.assertEqual(status, 0)
        self.assertIn('"runId": "run-1"', output.getvalue())
        self.assertIn('"completedValue": 255', output.getvalue())
        self.assertIn('"defeatDispatches": 0', output.getvalue())
        load_source.assert_called_once_with(Path("some-run"), expected_build_sha256=configured_hash)

    def test_cli_rejects_a_capture_from_another_reference_build(self) -> None:
        error = StringIO()
        configured_hash = "f" * 64
        with (
            patch("c64lab.cli.load_configuration", return_value=({"hashes": {"sha256": configured_hash}}, {})),
            patch("c64lab.cli.load_geometry_source", side_effect=LabError("Geometry capture Reference Build hash does not match the configured Reference Build")) as load_source,
            redirect_stderr(error),
        ):
            status = main(["endgame", "decode", "--run", "wrong-run"])

        self.assertEqual(status, 1)
        self.assertIn("does not match the configured Reference Build", error.getvalue())
        load_source.assert_called_once_with(Path("wrong-run"), expected_build_sha256=configured_hash)


if __name__ == "__main__":
    unittest.main()
