from __future__ import annotations

import sys
import unittest
from pathlib import Path

LAB_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB_ROOT))

from c64lab.core import LabError
from c64lab.interaction import (
    BOARD_KEY_SITE,
    BOARD_RANGE_SITE,
    CARRIED_MASK_SITE,
    CRAFT_SLOT_BOUND_SITE,
    DESCRIPTION_MASK_SITE,
    FIXED_MASK_SITE,
    HEAVY_MASK_SITE,
    INTERACTION_SCHEMA_VERSION,
    INVENTORY_LIMIT_SITE,
    TAKE_KEY_SITE,
    TAKE_OR_BOARD,
    TAKE_RANGE_SITE,
    TOO_HEAVY_MESSAGE_SITE,
    decode_interaction,
)


class Builder:
    """A synthetic image carrying the routine's shape but invented rules.

    Only the opcodes the decoder asserts are placed; the operands beside them are
    what it reads, so a test can state a rule and check it comes back.
    """

    def __init__(self) -> None:
        self.ram = bytearray(65536)
        self.ram[TAKE_OR_BOARD:TAKE_OR_BOARD + 2] = bytes([0xA5, 0xB8])
        self.ram[0x9804] = 0x20
        self.rule(TAKE_KEY_SITE, 0xC9, 0x16)
        self.rule(BOARD_KEY_SITE, 0xC9, 0x1C)
        self.rule(TAKE_RANGE_SITE, 0xA2, 1)
        self.rule(BOARD_RANGE_SITE, 0xA2, 2)
        self.rule(CRAFT_SLOT_BOUND_SITE, 0xC9, 8)
        self.rule(INVENTORY_LIMIT_SITE, 0xE0, 11)
        self.rule(FIXED_MASK_SITE, 0x29, 0x10)
        self.rule(HEAVY_MASK_SITE, 0x29, 0x20)
        self.rule(CARRIED_MASK_SITE, 0x09, 0x80)
        self.rule(DESCRIPTION_MASK_SITE, 0x29, 0x0C)
        self.rule(TOO_HEAVY_MESSAGE_SITE, 0xA2, 2)

    def rule(self, site: int, opcode: int, operand: int) -> None:
        self.ram[site] = opcode
        self.ram[site + 1] = operand

    def build(self) -> bytes:
        return bytes(self.ram)


class EngineGuardTests(unittest.TestCase):
    def test_requires_a_full_memory_image(self) -> None:
        with self.assertRaisesRegex(LabError, "64 KiB physical RAM"):
            decode_interaction(bytes(1024))

    def test_rejects_a_build_whose_routine_does_not_begin_with_the_saved_key(self) -> None:
        builder = Builder()
        builder.ram[TAKE_OR_BOARD] = 0xEA

        with self.assertRaisesRegex(LabError, "saved key"):
            decode_interaction(builder.build())

    def test_rejects_a_build_whose_range_is_not_an_immediate(self) -> None:
        builder = Builder()
        builder.ram[BOARD_RANGE_SITE] = 0xEA

        with self.assertRaisesRegex(LabError, "board does not pass an immediate range"):
            decode_interaction(builder.build())

    def test_rejects_a_build_that_does_not_mask_for_weight(self) -> None:
        builder = Builder()
        builder.ram[HEAVY_MASK_SITE] = 0xEA

        with self.assertRaisesRegex(LabError, "mask the object flags for weight"):
            decode_interaction(builder.build())


class RuleTests(unittest.TestCase):
    def test_reads_both_keys(self) -> None:
        rules = decode_interaction(Builder().build())

        self.assertEqual(rules["takeKey"], 0x16)
        self.assertEqual(rules["boardKey"], 0x1C)

    def test_take_reaches_less_far_than_board(self) -> None:
        rules = decode_interaction(Builder().build())

        self.assertEqual((rules["takeRange"], rules["boardRange"]), (1, 2))
        self.assertEqual(rules["rangeUnit"], 256)

    def test_reads_the_flag_masks_and_the_craft_bound(self) -> None:
        rules = decode_interaction(Builder().build())

        self.assertEqual(rules["fixedMask"], 0x10)
        self.assertEqual(rules["heavyMask"], 0x20)
        self.assertEqual(rules["carriedMask"], 0x80)
        self.assertEqual(rules["descriptionMask"], 0x0C)
        self.assertEqual(rules["craftSlotBound"], 8)

    def test_the_inventory_limit_is_what_fits_rather_than_what_fails(self) -> None:
        # The engine compares against one past the limit, so ten items fit.
        rules = decode_interaction(Builder().build())

        self.assertEqual(rules["inventoryLimit"], 10)

    def test_reports_the_schema_and_counts(self) -> None:
        rules = decode_interaction(Builder().build())

        self.assertEqual(rules["schemaVersion"], INTERACTION_SCHEMA_VERSION)
        self.assertEqual(rules["counts"]["craftSlots"], 8)


class SanityTests(unittest.TestCase):
    def test_rejects_a_board_range_tighter_than_take(self) -> None:
        builder = Builder()
        builder.rule(BOARD_RANGE_SITE, 0xA2, 0)

        with self.assertRaisesRegex(LabError, "take-tighter-than-board"):
            decode_interaction(builder.build())

    def test_rejects_a_mask_with_no_bits(self) -> None:
        builder = Builder()
        builder.rule(FIXED_MASK_SITE, 0x29, 0)

        with self.assertRaisesRegex(LabError, "fixedMask decodes as no bits"):
            decode_interaction(builder.build())

    def test_rejects_one_key_serving_both_actions(self) -> None:
        builder = Builder()
        builder.rule(BOARD_KEY_SITE, 0xC9, 0x16)

        with self.assertRaisesRegex(LabError, "same key code"):
            decode_interaction(builder.build())

    def test_rejects_an_empty_inventory_limit(self) -> None:
        builder = Builder()
        builder.rule(INVENTORY_LIMIT_SITE, 0xE0, 1)

        with self.assertRaisesRegex(LabError, "limits decode as empty"):
            decode_interaction(builder.build())


if __name__ == "__main__":
    unittest.main()
