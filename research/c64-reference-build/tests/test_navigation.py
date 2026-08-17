import sys
import unittest
from pathlib import Path

LAB_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB_ROOT))

from c64lab.core import LabError
from c64lab.navigation import (
    ARRIVAL_INDEX_SITE,
    DARK_COLOUR_CLEAR_SITE,
    KEY_TABLE_SITE,
    LOCK_BOUNDARY_SITE,
    PHOTON_SEARCH_SITE,
    SKELETON_KEY_SITE,
    WORLD_FLIP_TEST_SITE,
    decode_navigation_rules,
    lock_for,
    require_navigation,
)


#: The traversal and Room-setup opcodes, written out site by site. This is the same
#: shape the other engine-constant tests use: a synthetic image carrying only the
#: fingerprints, so a decode that stopped reading the Reference Build and started
#: guessing would fail here rather than quietly agree.
SITES = {
    0x90BE: (0xA6, 0x08, 0xD0, 0x34),
    0x9106: (0xB1, 0x1B, 0x10, 0x3E),
    0x910A: (0xE0, 0x72),
    0x910E: (0x20, 0xEF, 0xAD, 0x29, 0x0E),
    0x9119: (0xA5, 0xCD, 0xA0, 0x0A),
    0x912F: (0xA0, 0x05, 0xB1, 0x1B, 0x29, 0x8F),
    0x913D: (0xA9, 0x0A),
    0x9141: (0xE0, 0x7F, 0xD0, 0x03, 0x20, 0x53, 0x93),
    0x9148: (0xA4, 0x09, 0x86, 0xCD, 0xB1, 0x1B, 0x85, 0x73),
    0x915A: (0x29, 0x80, 0x85, 0x78, 0x49, 0x80, 0x85, 0x72),
    0x91EE: (0xC9, 0x80),
    0x91F2: (0xA9, 0x10, 0x20, 0x1A, 0x94, 0xF0, 0x11, 0x20, 0x25, 0x94),
    0x91FE: (0xA9, 0x00, 0x85, 0xC2, 0x85, 0xC4, 0x85, 0xC5),
    0x9206: (0xA9, 0x01),
    0x9353: (0xA5, 0xF1, 0x49, 0x01, 0x85, 0xF1),
    0x936F: (0xA9, 0x1F),
    0x9399: (0xA9, 0x01),
    0x9430: (0xA2, 0x00, 0x20),
    0x9437: (0xA5, 0xF0, 0xD0),
    0x943F: (0xB1, 0x1B, 0x85, 0x09),
    0x9443: (0x0A, 0xF0),
    0x944D: (0x29, 0x80),
    0x945D: (0x38, 0xE9, 0x40),
    0x9478: (0x38, 0xE9, 0x28),
    0x9484: (0x69, 0x02),
    0x948E: (0xAD, 0xF0, 0x29),
    0x9493: (0xA5, 0x09, 0x29, 0x0F),
    0x9497: (0xC9, 0x08),
    0x949B: (0xAA, 0xBD, 0xC8, 0x29),
    0x94C6: (0xA5, 0x09, 0x4A, 0x4A, 0x29, 0x1C, 0x18, 0x69, 0x07),
    # A walking frame's ordered gate: containment, the step interlock, the predicate,
    # then setup. Written out whole because the order is the behaviour.
    0x8570: (0x20, 0x9E, 0x93, 0xF0, 0x14, 0xA5, 0xB1, 0xD0, 0x10,
             0x20, 0x37, 0x94, 0x90, 0x0B, 0x20, 0xBE, 0x90),
    0x8585: (0xA9, 0x02, 0x85, 0xB1),
    0x90C2: (0x86, 0xA8, 0x86, 0xCD),
    0x90D3: (0xA2, 0x08, 0xBD, 0xED, 0x90, 0x95, 0x72),
    0x939E: (0xA9, 0x00, 0x85, 0xAE),
    0x93AA: (0xC9, 0x20),
    0x93AE: (0xA9, 0x20),
    0x93C3: (0xC9, 0x20),
    0x93C7: (0xA9, 0x20),
    0x93DE: (0xC9, 0xDF),
    0x93E8: (0xA9, 0xDF),
    0x93F8: (0xC9, 0xDF),
    0x9402: (0xA9, 0xDF),
    0x9411: (0xA9, 0x14, 0x20, 0x58, 0xB9, 0x68, 0x85, 0xF8),
    0xA165: (0xA5, 0xF1, 0xF0, 0x07, 0xA6, 0x80, 0xBD, 0x7B, 0xA1, 0x85, 0x80),
    0xA243: (0xA5, 0xB1, 0xF0, 0x02, 0xC6, 0xB1),
    0xAFA8: (0xA5, 0xF0, 0xF0, 0x11, 0xC6, 0xF0, 0xD0, 0x07, 0xA5, 0xC4, 0x85, 0xA5),
    0xAFB7: (0xAA, 0xBD, 0x7E, 0xBB, 0x85, 0xA5),
}

#: The two tables the rules carry wholesale rather than as an immediate. They are
#: data, not opcodes, so they live apart from the fingerprints: a wrong byte here is
#: caught by what the table has to be, not by what instruction sits at its address.
TABLES = {
    # Read downwards by the countdown: the long transition fades orange to black,
    # then both lengths run the same grey-white-grey flash.
    0xBB7E: (0x00, 0x0B, 0x0C, 0x0F, 0x01, 0x01, 0x01, 0x0F, 0x0C, 0x0B,
             0x00, 0x02, 0x04, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08,
             0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08),
    # The fixed position leaving the underground puts the player at, three
    # little-endian 24-bit coordinates: the middle of surface cell 8,8.
    0x90ED: (0xC0, 0x67, 0x08, 0x80, 0xF8, 0x40, 0x00, 0x70, 0x08),
    # Bits 2 and 3 of the input byte swapped, which is turn-left and turn-right.
    0xA17B: (0x00, 0x01, 0x02, 0x03, 0x08, 0x09, 0x0A, 0x0B,
             0x04, 0x05, 0x06, 0x07, 0x0C, 0x0D, 0x0E, 0x0F),
}


def image() -> bytearray:
    ram = bytearray(65536)
    for address, opcodes in list(SITES.items()) + list(TABLES.items()):
        ram[address : address + len(opcodes)] = bytes(opcodes)
    return ram


class NavigationFingerprintTests(unittest.TestCase):
    """The traversal routines have to be the ones these rules were read from."""

    def test_accepts_the_reference_build_fingerprints(self) -> None:
        require_navigation(image())

    def test_rejects_an_image_of_the_wrong_size(self) -> None:
        with self.assertRaisesRegex(LabError, "64 KiB"):
            require_navigation(bytes(1024))

    def test_rejects_a_changed_fingerprint_at_every_site(self) -> None:
        # One flipped byte anywhere the decode reads has to be a refusal, not a
        # different answer: these are all immediates, so a wrong one would silently
        # become a wrong rule.
        for address in SITES:
            with self.subTest(site=f"${address:04X}"):
                ram = image()
                ram[address] ^= 0xFF
                with self.assertRaises(LabError):
                    require_navigation(ram)

    def test_rejects_a_world_flip_that_calls_somewhere_else(self) -> None:
        ram = image()
        ram[WORLD_FLIP_TEST_SITE + 5] = 0x00
        with self.assertRaisesRegex(LabError, "rather than the flip"):
            require_navigation(ram)

    def test_rejects_darkness_that_searches_the_wrong_routine(self) -> None:
        ram = image()
        ram[PHOTON_SEARCH_SITE + 3] = 0x00
        with self.assertRaisesRegex(LabError, "carried inventory"):
            require_navigation(ram)


class NavigationRuleTests(unittest.TestCase):
    """Every rule is an immediate or a table address, never a number chosen here."""

    def setUp(self) -> None:
        self.rules = decode_navigation_rules(image())

    def test_reads_the_traversal_windows_and_the_cooldowns(self) -> None:
        self.assertEqual(self.rules["depthHalfWindow"], 0x40)
        self.assertEqual(self.rules["alongWallBias"], 0x28)
        self.assertEqual(self.rules["headingRounding"], 0x02)
        self.assertEqual(self.rules["cooldownFrames"], 0x0A)
        # Entering the flip Room installs a longer transition than an ordinary one.
        self.assertEqual(self.rules["worldFlipCooldownFrames"], 0x1F)
        self.assertGreater(self.rules["worldFlipCooldownFrames"], self.rules["cooldownFrames"])

    def test_the_arrival_offset_is_a_record_offset_rather_than_a_list_index(self) -> None:
        # $94C6 folds bits 4-6 into 4n + 7, which is the offset of command n's x byte:
        # five header bytes, four bytes a command, then two past its opcode and room.
        self.assertEqual(self.rules["arrivalIndexMask"], 0x70)
        self.assertEqual(self.rules["arrivalOffsetBias"], 7)

    def test_the_key_table_is_indexed_by_the_raw_shape_nibble(self) -> None:
        # The table sits eight slots past slot zero and is indexed by the nibble
        # itself, so the object a lock wants is the nibble plus that bias — not the
        # nibble less the boundary.
        self.assertEqual(self.rules["lockBoundary"], 8)
        self.assertEqual(self.rules["keySlotBias"], 8)
        self.assertEqual(self.rules["skeletonKeySlot"], 0x30)

    def test_reads_the_slots_and_messages_darkness_depends_on(self) -> None:
        self.assertEqual(self.rules["photonEmitterSlot"], 0x10)
        self.assertEqual(self.rules["darkMessage"], 1)
        self.assertEqual(self.rules["lockedMessage"], 0)

    def test_the_line_colour_is_one_immediate_rather_than_a_room_field(self) -> None:
        # Every Room setup stores the same value, which is why no Room carries it.
        self.assertEqual(self.rules["lineColour"], 1)

    def test_names_the_two_special_rooms_from_the_routines_own_compares(self) -> None:
        self.assertEqual(self.rules["randomRoom"], 0x72)
        self.assertEqual(self.rules["worldFlipRoom"], 0x7F)
        self.assertEqual(self.rules["randomSelectorMask"], 0x0E)
        self.assertEqual(self.rules["pairTableOffset"], 0x0A)

    def test_the_random_selector_reaches_eight_pairs(self) -> None:
        # AND #$0E keeps three bits, so the offsets run 10, 12 ... 24 and the last
        # pair's second byte is at 25. Two pairs would leave six of them unreachable.
        offsets = {(value & self.rules["randomSelectorMask"]) + self.rules["pairTableOffset"] for value in range(256)}
        self.assertEqual(len(offsets), 8)
        self.assertEqual(max(offsets) + 1, 25)

    def test_rejects_a_key_table_outside_the_object_state_flags(self) -> None:
        ram = image()
        ram[KEY_TABLE_SITE + 3] = 0x40
        with self.assertRaisesRegex(LabError, "outside the object state flags"):
            decode_navigation_rules(ram)

    def test_rejects_a_skeleton_key_outside_the_object_state_flags(self) -> None:
        ram = image()
        ram[SKELETON_KEY_SITE + 2] = 0x40
        with self.assertRaisesRegex(LabError, "outside the object state flags"):
            decode_navigation_rules(ram)

    def test_the_one_way_out_of_the_underground_is_a_fixed_position(self) -> None:
        # Not derived from where the player was: nine bytes copied over all three
        # coordinates. The horizontal pair is the middle of the cell the lift serves.
        self.assertEqual(self.rules["surfaceExit"]["x"], 0x0867C0)
        self.assertEqual(self.rules["surfaceExit"]["z"], 0x087000)
        self.assertEqual(self.rules["surfaceExit"]["x"] // 0x10000, 8)
        self.assertEqual(self.rules["surfaceExit"]["z"] // 0x10000, 8)

    def test_the_way_out_is_read_from_the_table_the_copy_names(self) -> None:
        # Rather than from a constant here that happens to agree with it.
        ram = image()
        ram[0x90D3 + 3] = 0xF0
        ram[0x90F0 : 0x90F0 + 9] = bytes(9)

        self.assertEqual(decode_navigation_rules(ram)["surfaceExit"], {"x": 0, "y": 0, "z": 0})

    def test_a_room_is_bounded_by_two_margins_the_same_on_both_axes(self) -> None:
        self.assertEqual(self.rules["nearMargin"], 0x20)
        self.assertEqual(self.rules["farMargin"], 0xDF)

    def test_the_far_margin_leaves_one_more_unit_than_the_near_one(self) -> None:
        # The derived form of the same two bytes, asserted here so the app can be
        # written as the literal arithmetic without anybody having to trust that the
        # walls are where they look: a Room of n cells is walkable over
        # [32, n*256 - 33], which is 33 from the far wall and 32 from the near.
        cells = 7
        near = self.rules["nearMargin"]
        far = (cells - 1) * 256 + self.rules["farMargin"]
        self.assertEqual(near, 32)
        self.assertEqual(cells * 256 - far, 33)

    def test_traversal_needs_wall_contact_and_a_spent_interlock(self) -> None:
        # This is the counterintuitive one, and the reason it is spelled out: the
        # Reference Build only looks for a Doorway on a frame where containment had
        # to move the player. Walking into the wall is how a door is opened.
        self.assertIn("clamped none", self.rules["traversalGate"])
        self.assertIn("step interlock", self.rules["traversalGate"])
        self.assertEqual(self.rules["stepInterlock"], 2)
        self.assertEqual(self.rules["wallThudSound"], 0x14)

    def test_the_transition_shows_one_colour_per_frame_it_lasts(self) -> None:
        colours = self.rules["transitionColours"]
        # One entry per frame the longest transition can be in. Index zero is never
        # read — reaching zero restores the Room's own colour instead.
        self.assertEqual(len(colours), self.rules["worldFlipCooldownFrames"])
        self.assertTrue(all(colour < 16 for colour in colours))
        # An ordinary transition only ever sees the tail, counting down from nine.
        ordinary = list(reversed(colours[1 : self.rules["cooldownFrames"]]))
        self.assertEqual(ordinary, [0x0B, 0x0C, 0x0F, 0x01, 0x01, 0x01, 0x0F, 0x0C, 0x0B])

    def test_the_world_flip_swaps_the_two_turn_bits_and_nothing_else(self) -> None:
        remap = self.rules["worldFlipInputRemap"]
        for value in range(16):
            expected = value & 0b0011
            expected |= (value & 0b0100) << 1
            expected |= (value & 0b1000) >> 1
            self.assertEqual(remap[value], expected, f"input {value:#06b}")

    def test_rejects_an_input_remap_that_is_not_its_own_inverse(self) -> None:
        ram = image()
        # A three-cycle: still a permutation, so only the involution check catches it.
        ram[0xA17B + 4], ram[0xA17B + 5], ram[0xA17B + 6] = 0x09, 0x0A, 0x08
        with self.assertRaisesRegex(LabError, "not its own inverse"):
            decode_navigation_rules(ram)

    def test_rejects_an_input_remap_that_loses_an_input(self) -> None:
        ram = image()
        ram[0xA17B + 4] = 0x00
        with self.assertRaisesRegex(LabError, "not a permutation"):
            decode_navigation_rules(ram)

    def test_rejects_a_transition_table_that_is_not_colours(self) -> None:
        ram = image()
        ram[0xBB7E + 3] = 0x7F
        with self.assertRaisesRegex(LabError, "not\n?\\s*colours|are not "):
            decode_navigation_rules(ram)

    def test_rejects_containment_that_bounds_the_two_axes_differently(self) -> None:
        ram = image()
        ram[0x93C3 + 1] = 0x40
        with self.assertRaisesRegex(LabError, "bounded differently"):
            require_navigation(ram)

    def test_rejects_containment_that_clamps_somewhere_it_does_not_test(self) -> None:
        ram = image()
        for site in (0x93AE, 0x93C7):
            ram[site + 1] = 0x21
        with self.assertRaisesRegex(LabError, "near margin"):
            require_navigation(ram)

    def test_records_the_predicate_and_the_arrival_contract_as_prose(self) -> None:
        # The accepted region depends on the command's plane bit, so it is the app's
        # to implement; writing a window here would be a second reading to keep in step.
        self.assertIn("cooldown", self.rules["predicate"])
        self.assertIn("Altitude is not written", self.rules["arrivalContract"])


class LockMappingTests(unittest.TestCase):
    """Which object a lock class wants, and which shapes are locks at all."""

    def setUp(self) -> None:
        self.rules = decode_navigation_rules(image())

    def test_shapes_below_the_boundary_are_not_locked(self) -> None:
        for shape in range(8):
            self.assertIsNone(lock_for(shape, self.rules), f"shape {shape:#x}")

    def test_the_seven_lock_classes_want_seven_consecutive_slots(self) -> None:
        wanted = [lock_for(shape, self.rules)["requiresObject"] for shape in range(9, 16)]
        self.assertEqual(wanted, [0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17])

    def test_a_locks_class_is_the_doors_shape(self) -> None:
        # They are one nibble, so nothing should ever treat them as independent.
        for shape in range(8, 16):
            self.assertEqual(lock_for(shape, self.rules)["class"], shape)

    def test_the_boundary_admits_one_class_the_world_never_uses(self) -> None:
        # Shape 8 is inside the compare's range and maps to the photon emitter's own
        # slot, but no Room command in the Reference Build carries it, so it is dead.
        self.assertEqual(lock_for(8, self.rules)["requiresObject"], self.rules["photonEmitterSlot"])


class DarknessTests(unittest.TestCase):
    """Darkness clears a third colour the payload has no per-Room source for."""

    def test_all_three_room_colours_are_cleared_together(self) -> None:
        ram = image()
        cleared = {ram[DARK_COLOUR_CLEAR_SITE + offset] for offset in (3, 5, 7)}
        self.assertEqual(cleared, {0xC2, 0xC4, 0xC5})

    def test_the_boundary_between_terminator_and_darkness_is_one_value(self) -> None:
        # $80 ends a record and marks it dark; the decode depends on those being the
        # same byte rather than two fields.
        rules = decode_navigation_rules(image())
        self.assertEqual(rules["planeMask"], 0x80)


class LockBoundarySiteTests(unittest.TestCase):
    def test_the_boundary_is_read_rather_than_assumed(self) -> None:
        ram = image()
        ram[LOCK_BOUNDARY_SITE + 1] = 0x0A
        self.assertEqual(decode_navigation_rules(ram)["lockBoundary"], 0x0A)
        self.assertIsNone(lock_for(9, decode_navigation_rules(ram)))


class ArrivalIndexSiteTests(unittest.TestCase):
    def test_the_offset_bias_is_read_rather_than_assumed(self) -> None:
        ram = image()
        ram[ARRIVAL_INDEX_SITE + 8] = 0x0B
        self.assertEqual(decode_navigation_rules(ram)["arrivalOffsetBias"], 0x0B)


if __name__ == "__main__":
    unittest.main()
