from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

LAB_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB_ROOT))

from c64lab.core import LabError
from c64lab.flight import (
    BLOCK_COUNT,
    BLOCK_LENGTH,
    BLOCK_TABLE_BASE,
    CEILING_CLIMB_SITE,
    CONTROL_SLOT7,
    CRAFT_BLOCK_COUNT,
    CRASH_PITCH_SITE,
    CRASH_RATE_SITE,
    FLIGHT_SCHEMA_VERSION,
    GROUND_BAND_SITE,
    HANDLER_NAMES,
    LIVE_BLOCK_BASE,
    PITCH_LEVEL_SITE,
    PITCH_WRAP_SITE,
    POWERAMP_CEILING_SITE,
    POWERAMP_CRAFT_SITE,
    POWERAMP_THROTTLE_SITE,
    TAKEOFF_SPEED_SITE,
    THROTTLE_SATURATION_SITE,
    TOUCHDOWN_GROUND_SITE,
    WALKING_BLOCK_SOURCE,
    WALKING_COPY_COUNT_SITE,
    MOVE_CRAFT_SITE,
    MOVE_UNDERGROUND_SITE,
    WALK_DISPATCH,
    WALK_STEP_SITE,
    WALK_STEP_STATE,
    WALK_TURN_IMMEDIATE_SITE,
    WALK_TURN_STATE,
    WALK_YAW_ADD_SITE,
    WALK_YAW_SUBTRACT_SITE,
    WALKING_COPY_SOURCE_SITE,
    YAW_NEGATE_SITE,
    decode_flight,
    decode_float,
    decode_roll_scale,
    encode_float,
)

REPO_ROOT = LAB_ROOT.parents[1]
FROZEN_LEDGER = REPO_ROOT / "restricted" / "behavior-catalogue" / "unc-0002" / "handler-equivalence.json"
EXPORTED_FLIGHT = REPO_ROOT / "payload" / "flight.json"


class FloatFormatTests(unittest.TestCase):
    """The engine's sixteen-bit float, which every parameter pair is written in."""

    def test_decodes_the_damping_factor_the_first_craft_carries(self) -> None:
        # The pair that first showed the reading was right: a per-frame damping.
        self.assertEqual(decode_float(0xE0, 0xFC), 0.9375)

    def test_a_zero_mantissa_and_exponent_is_one(self) -> None:
        # The mantissa's leading one is implicit, so an all-zero pair is 1.0 and
        # never 0.0 — the format has no zero at all.
        self.assertEqual(decode_float(0x00, 0x00), 1.0)

    def test_one_power_of_two_is_four_in_the_exponent_byte(self) -> None:
        self.assertEqual(decode_float(0x00, 0x04), 2.0)
        self.assertEqual(decode_float(0x00, 0xFC), 0.5)
        self.assertEqual(decode_float(0x00, 0x10), 16.0)
        self.assertEqual(decode_float(0x00, 0xF8), 0.25)

    def test_bit_zero_of_the_exponent_byte_is_the_sign(self) -> None:
        self.assertEqual(decode_float(0x80, 0x00), 1.5)
        self.assertEqual(decode_float(0x80, 0x01), -1.5)

    def test_the_scratch_bit_does_not_disturb_the_exponent(self) -> None:
        # FP_MUL parks the sign's carry in bit 1 before clearing it, so a value
        # carrying that bit must read as the same exponent.
        self.assertEqual(decode_float(0x00, 0x04), decode_float(0x00, 0x06))

    def test_round_trips_every_exponent_and_a_spread_of_mantissas(self) -> None:
        for exponent in range(-30, 30):
            for mantissa in (0x00, 0x01, 0x40, 0x80, 0xE0, 0xFF):
                value = (1.0 + mantissa / 256.0) * 2.0**exponent
                for signed in (value, -value):
                    self.assertEqual(decode_float(*encode_float(signed)), signed)

    def test_refuses_to_encode_a_zero_it_cannot_represent(self) -> None:
        with self.assertRaises(LabError):
            encode_float(0.0)

    def test_the_roll_coupling_byte_is_a_power_of_two(self) -> None:
        self.assertEqual(decode_roll_scale(0x0C), 8.0)
        self.assertEqual(decode_roll_scale(0x08), 4.0)
        self.assertEqual(decode_roll_scale(0x00), 1.0)

    def test_a_roll_coupling_with_the_top_bit_set_is_next_to_nothing(self) -> None:
        # The engine uses such a byte as the exponent outright; carried as zero.
        self.assertEqual(decode_roll_scale(0x80), 0.0)
        self.assertEqual(decode_roll_scale(0xFF), 0.0)


class Builder:
    """A synthetic image carrying the loop's shape but invented parameters.

    Only the opcodes the decoder asserts are placed, so a test can state a
    parameter and check that it comes back as a real number.
    """

    def __init__(self) -> None:
        self.ram = bytearray(65536)
        self.ram[0x9F17:0x9F19] = bytes([0xA5, 0xCA])
        self.ram[0x9EFD:0x9EFF] = bytes([0xA9, 0x00])
        self.ram[CONTROL_SLOT7] = 0x4C
        self.ram[0x9EBE:0x9EC0] = bytes([0xA5, 0x76])
        for address, opcodes in (
            (0x9F26, (0xAE, 0xA2, 0xBE)),
            (0x9F39, (0xAE, 0xA4, 0xBE)),
            (0x9F63, (0x6D, 0xA6, 0xBE)),
            (0x9F9C, (0xAE, 0xAE, 0xBE)),
            (0x9FAF, (0xAE, 0xAA, 0xBE)),
            (0x9EFF, (0x8D, 0xA6, 0xBE)),
            (0xA047, (0xAC, 0xA9, 0xBE)),
            (0xA06B, (0xAE, 0xA8, 0xBE)),
            (0xA04D, (0xAD, 0xAD, 0xBE)),
            (0xA11B, (0xAD, 0xA7, 0xBE)),
        ):
            self.ram[address:address + len(opcodes)] = bytes(opcodes)
        self.ram[YAW_NEGATE_SITE] = 0xC8
        self.ram[0x9F86:0x9F88] = bytes([0xA6, 0xEC])
        self.ram[0x9F02] = 0xA9
        self.ram[CEILING_CLIMB_SITE] = 0xA0
        for address in (0x9F33, 0x9F46, 0x9F5A, 0x9F70, POWERAMP_CEILING_SITE, TOUCHDOWN_GROUND_SITE, PITCH_LEVEL_SITE):
            self.ram[address] = 0xA9
        for address in (PITCH_WRAP_SITE, 0xA0C2):
            self.ram[address] = 0x29
        for address in (TAKEOFF_SPEED_SITE, CRASH_RATE_SITE, CRASH_PITCH_SITE, GROUND_BAND_SITE, THROTTLE_SATURATION_SITE):
            self.ram[address] = 0xC9
        self.ram[POWERAMP_CRAFT_SITE] = 0xC0
        self.ram[POWERAMP_THROTTLE_SITE] = 0x69
        self.ram[WALKING_COPY_COUNT_SITE] = 0xA2
        # The on-foot mover, which is not a parameter block at all.
        self.ram[MOVE_UNDERGROUND_SITE:MOVE_UNDERGROUND_SITE + 2] = bytes([0xA5, 0xA8])
        self.ram[MOVE_CRAFT_SITE:MOVE_CRAFT_SITE + 3] = bytes([0x6C, 0xA0, 0xBE])
        self.ram[WALK_DISPATCH:WALK_DISPATCH + 2] = bytes([0xA5, 0xCA])
        self.ram[WALK_STEP_SITE:WALK_STEP_SITE + 2] = bytes([0xA6, WALK_STEP_STATE])
        self.ram[WALK_YAW_ADD_SITE:WALK_YAW_ADD_SITE + 2] = bytes([0x65, WALK_TURN_STATE])
        self.ram[WALK_YAW_SUBTRACT_SITE:WALK_YAW_SUBTRACT_SITE + 2] = bytes([0xE5, WALK_TURN_STATE])
        self.ram[WALK_TURN_IMMEDIATE_SITE] = 0xA9
        self.walk(step=(0x40, 0x18), turn=0x10)
        self.walking_copy(count=10)
        # Plausible rules, so a test that cares about one can leave the rest alone.
        self.rule(PITCH_WRAP_SITE, 0x03)
        self.rule(PITCH_LEVEL_SITE, 0x02)
        self.rule(TOUCHDOWN_GROUND_SITE, 0x3F)
        self.rule(GROUND_BAND_SITE, 0x40)
        self.rule(TAKEOFF_SPEED_SITE, 0x9C)
        self.rule(CRASH_RATE_SITE, 0xA0)
        self.rule(CRASH_PITCH_SITE, 0xA0)
        self.rule(CEILING_CLIMB_SITE, 0x88)
        self.rule(THROTTLE_SATURATION_SITE, 0x3C)
        self.rule(POWERAMP_CRAFT_SITE, 0x01)
        self.rule(POWERAMP_THROTTLE_SITE, 0x04)
        self.rule(POWERAMP_CEILING_SITE, 0x5A)
        for index in range(BLOCK_COUNT):
            self.block(index)
        self.live_matches_walking()

    def walk(self, *, step: tuple[int, int], turn: int) -> "Builder":
        self.ram[WALK_STEP_STATE], self.ram[WALK_STEP_STATE + 1] = step
        self.ram[WALK_TURN_STATE] = turn
        self.ram[WALK_TURN_IMMEDIATE_SITE + 1] = turn
        return self

    def rule(self, site: int, operand: int) -> "Builder":
        self.ram[site + 1] = operand
        return self

    def walking_copy(self, *, count: int) -> "Builder":
        self.ram[WALKING_COPY_COUNT_SITE + 1] = count - 1
        source = WALKING_BLOCK_SOURCE
        self.ram[WALKING_COPY_SOURCE_SITE] = 0xBD
        self.ram[WALKING_COPY_SOURCE_SITE + 1] = source & 0xFF
        self.ram[WALKING_COPY_SOURCE_SITE + 2] = source >> 8
        return self

    def block(
        self, index: int, *, handler: int = 0x9F17, raw: dict[int, int] | None = None
    ) -> "Builder":
        base = BLOCK_TABLE_BASE + index * BLOCK_LENGTH
        bytes_ = [handler & 0xFF, handler >> 8, 0xE0, 0xFC, 0x00, 0x00, 0x08, 0x08,
                  0x00, 0xFC, 0x00, 0xFC, 0x10, 0x0A, 0x90, 0xF8]
        for offset, value in (raw or {}).items():
            bytes_[offset] = value
        self.ram[base:base + BLOCK_LENGTH] = bytes(bytes_)
        return self

    def live_matches_walking(self) -> "Builder":
        count = self.ram[WALKING_COPY_COUNT_SITE + 1] + 1
        source = WALKING_BLOCK_SOURCE
        self.ram[LIVE_BLOCK_BASE + 2:LIVE_BLOCK_BASE + 2 + count] = self.ram[source:source + count]
        return self

    def decode(self) -> dict:
        return decode_flight(bytes(self.ram))


class DecodeTests(unittest.TestCase):
    def test_reads_eleven_blocks_of_which_eight_are_craft(self) -> None:
        document = Builder().decode()
        self.assertEqual(document["schemaVersion"], FLIGHT_SCHEMA_VERSION)
        self.assertEqual(document["counts"]["flightBlocks"], BLOCK_COUNT)
        self.assertEqual(document["counts"]["flightCraft"], CRAFT_BLOCK_COUNT)
        self.assertEqual(len(document["blocks"]), BLOCK_COUNT)

    def test_the_table_ends_where_the_first_control_routine_begins(self) -> None:
        # This is what pins the count at eleven rather than eight.
        self.assertEqual(BLOCK_TABLE_BASE + BLOCK_COUNT * BLOCK_LENGTH, CONTROL_SLOT7)

    def test_names_the_three_mode_blocks_after_the_craft(self) -> None:
        builder = Builder()
        builder.block(9, handler=0x9EBE)
        builder.block(10, handler=0x9E66)
        blocks = builder.decode()["blocks"]
        self.assertEqual(blocks[8]["mode"], "grounded")
        self.assertEqual(blocks[9]["mode"], "tumble")
        self.assertEqual(blocks[10]["mode"], "descent")
        self.assertNotIn("mode", blocks[0])

    def test_carries_handler_names_rather_than_addresses(self) -> None:
        builder = Builder()
        builder.block(2, handler=0x9EFD)
        builder.block(7, handler=0x9E5D)
        blocks = builder.decode()["blocks"]
        self.assertEqual(blocks[0]["handler"], "standard")
        self.assertEqual(blocks[2]["handler"], "sinking")
        self.assertEqual(blocks[7]["handler"], "slot7")

    def test_refuses_a_block_dispatching_somewhere_unnamed(self) -> None:
        # The export has to fail rather than let an unnamed routine reach the app.
        builder = Builder()
        builder.block(3, handler=0x1234)
        with self.assertRaises(LabError) as raised:
            builder.decode()
        self.assertIn("$1234", str(raised.exception))

    def test_reads_each_pair_as_a_real_number(self) -> None:
        builder = Builder()
        builder.block(
            0,
            raw={
                2: 0x00, 3: 0xFC,   # yaw damping 0.5
                4: 0x00, 5: 0x00,   # yaw authority 1.0
                6: 0x07,            # pitch step
                7: 0x0C,            # roll coupling
                8: 0x00, 9: 0xF8,   # lift factor 0.25
                10: 0x00, 11: 0xF8, # speed damping 0.25
                13: 0x2A,           # ceiling
                14: 0x80, 15: 0xFC, # throttle gain 0.75
            },
        )
        block = builder.decode()["blocks"][0]
        self.assertEqual(block["yawDamping"], 0.5)
        self.assertEqual(block["yawAuthority"], 1.0)
        self.assertEqual(block["pitchStep"], 7)
        self.assertEqual(block["rollCoupling"], 8.0)
        self.assertEqual(block["liftFactor"], 0.25)
        self.assertEqual(block["speedDamping"], 0.25)
        self.assertEqual(block["ceiling"], 0x2A)
        self.assertEqual(block["throttleGain"], 0.75)

    def test_refuses_a_filtering_block_whose_damping_does_not_damp(self) -> None:
        builder = Builder()
        builder.block(0, raw={10: 0x00, 11: 0x00})  # 1.0, which never settles
        with self.assertRaises(LabError):
            builder.decode()

    def test_lets_the_mode_blocks_hold_bytes_that_are_not_dampings(self) -> None:
        # The tumble handler reads the same offsets as plain integers, so its
        # pairs decode as floats that mean nothing and must not be judged.
        builder = Builder()
        builder.block(9, handler=0x9EBE,
                      raw={2: 0x2F, 3: 0x10, 4: 0x15, 5: 0x0D, 10: 0x00, 11: 0x00})
        block = builder.decode()["blocks"][9]
        self.assertEqual(block["tumble"], {"altitudeDrop": 0x2F, "rollStep": 0x10,
                                           "pitchStep": 0x15, "yawStep": 0x0D})

    def test_reads_the_rules_the_loop_applies(self) -> None:
        rules = Builder().decode()["rules"]
        self.assertEqual(rules["angleUnitsPerTurn"], 1024)
        self.assertEqual(rules["levelPitch"], 0x200)
        self.assertEqual(rules["groundAltitude"], 0x3F)
        self.assertEqual(rules["groundBand"], 0x40)
        self.assertEqual(rules["takeoffSpeed"], 128.0)
        self.assertEqual(rules["crashDescentRate"], 256.0)
        self.assertEqual(rules["crashPitch"], 640)
        self.assertEqual(rules["throttleLimit"], 32768.0)
        self.assertEqual(rules["walkingBlock"], CRAFT_BLOCK_COUNT)

    def test_the_poweramp_doubles_the_throttle_rather_than_adding_four(self) -> None:
        rules = Builder().decode()["rules"]
        self.assertEqual(rules["poweramp"]["throttleScale"], 2.0)
        self.assertEqual(rules["poweramp"]["craft"], 1)
        self.assertEqual(rules["poweramp"]["ceiling"], 0x5A)

    def test_the_throttle_ladder_is_ten_notches_of_doubling(self) -> None:
        notches = Builder().decode()["rules"]["throttleNotches"]
        self.assertEqual(len(notches), 10)
        self.assertEqual(notches[0], 32.0)
        self.assertEqual(notches[-1], 16384.0)
        for lower, upper in zip(notches, notches[1:]):
            self.assertEqual(upper, lower * 2)

    def test_the_ceiling_replaces_a_climb_with_next_to_nothing(self) -> None:
        rules = Builder().decode()["rules"]
        self.assertLess(rules["ceilingClimbScale"], 1e-6)

    def test_requires_the_walking_block_to_share_the_craft_handler(self) -> None:
        builder = Builder()
        builder.block(8, handler=0x9EFD)
        builder.live_matches_walking()
        with self.assertRaises(LabError):
            builder.decode()

    def test_requires_a_capture_taken_on_foot_to_carry_walking_dynamics(self) -> None:
        builder = Builder()
        builder.ram[LIVE_BLOCK_BASE + 4] ^= 0xFF
        with self.assertRaises(LabError):
            builder.decode()

    def test_requires_every_asserted_site_to_be_the_routine_it_was_read_from(self) -> None:
        for site in (0x9F26, YAW_NEGATE_SITE, TAKEOFF_SPEED_SITE, CRASH_RATE_SITE,
                     POWERAMP_THROTTLE_SITE, WALKING_COPY_COUNT_SITE):
            builder = Builder()
            builder.ram[site] ^= 0xFF
            with self.assertRaises(LabError, msg=f"site ${site:04X} is not asserted"):
                builder.decode()

    def test_requires_a_sixty_four_kibibyte_image(self) -> None:
        with self.assertRaises(LabError):
            decode_flight(bytes(1024))


@unittest.skipUnless(FROZEN_LEDGER.is_file(), "the frozen UNC-0002 ledger is not present")
class FrozenLedgerTests(unittest.TestCase):
    """The frozen catalogue recorded these bytes once; it is a free check.

    The apparatus is frozen and gets no new records (ADR 0014), but what it
    already holds still cross-checks a fresh extraction of the same table.
    """

    def test_the_frozen_ledger_agrees_the_only_inert_offset_is_twelve(self) -> None:
        ledger = json.loads(FROZEN_LEDGER.read_text())
        self.assertEqual(ledger["inertOffsets"], [12])
        self.assertNotIn(12, ledger["classKeyOffsets"])

    @unittest.skipUnless(EXPORTED_FLIGHT.is_file(), "no Data Payload is exported")
    def test_the_export_reproduces_the_ledger_byte_for_byte_on_every_craft(self) -> None:
        # The ledger froze each craft's raw parameter bytes as its class key.
        # Decoding those bytes with this module's own codec must land exactly on
        # the numbers the exported flight.json carries — the closest thing to a
        # second opinion the frozen apparatus offers (ADR 0014).
        ledger = json.loads(FROZEN_LEDGER.read_text())
        flight = json.loads(EXPORTED_FLIGHT.read_text())
        craft_slots = set()
        for craft_class in ledger["classes"]:
            key = dict(zip(ledger["classKeyOffsets"], craft_class["classKey"]))
            for slot in craft_class["memberSlots"]:
                craft_slots.add(slot)
                block = flight["blocks"][slot]
                self.assertEqual(HANDLER_NAMES[key[0] | (key[1] << 8)], block["handler"])
                self.assertEqual(decode_float(key[2], key[3]), block["yawDamping"])
                self.assertEqual(decode_float(key[4], key[5]), block["yawAuthority"])
                self.assertEqual(key[6], block["pitchStep"])
                self.assertEqual(decode_roll_scale(key[7]), block["rollCoupling"])
                self.assertEqual(decode_float(key[8], key[9]), block["liftFactor"])
                self.assertEqual(decode_float(key[10], key[11]), block["speedDamping"])
                self.assertEqual(key[13], block["ceiling"])
                self.assertEqual(decode_float(key[14], key[15]), block["throttleGain"])
        self.assertEqual(craft_slots, set(range(flight["counts"]["flightCraft"])))


class OnFootTests(unittest.TestCase):
    """The mover the engine uses out of a craft, which is not a block at all."""

    def test_reads_a_fixed_step_and_a_fixed_turn(self) -> None:
        walk = Builder().decode()["walk"]

        self.assertEqual(walk["step"], 80.0)
        self.assertEqual(walk["turnStep"], 16)

    def test_the_step_is_a_float_like_every_other_parameter(self) -> None:
        builder = Builder()
        builder.walk(step=(0x00, 0x10), turn=0x10)

        self.assertEqual(builder.decode()["walk"]["step"], 16.0)

    def test_refuses_a_step_that_is_not_a_step(self) -> None:
        builder = Builder()
        builder.walk(step=(0x00, 0x01), turn=0x10)  # negative

        with self.assertRaises(LabError):
            builder.decode()

    def test_refuses_a_turn_the_engine_disagrees_with(self) -> None:
        # The live value and the one the Reference Build sets have to match, or one
        # of the two is not what this decoder thinks it is.
        builder = Builder()
        builder.ram[WALK_TURN_STATE] = 0x20

        with self.assertRaises(LabError):
            builder.decode()

    def test_names_the_block_after_the_craft_for_what_it_is(self) -> None:
        # It is the block a *landed craft* taxis on, not the on-foot walk.
        blocks = Builder().decode()["blocks"]

        self.assertEqual(blocks[CRAFT_BLOCK_COUNT]["mode"], "grounded")


if __name__ == "__main__":
    unittest.main()
