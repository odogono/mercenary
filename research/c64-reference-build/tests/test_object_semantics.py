from __future__ import annotations

import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path

LAB_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB_ROOT))

from c64lab.core import LabError
from c64lab.object_semantics import (
    BLOCK_LENGTH,
    BLOCK_TABLE_BASE,
    ENTRY_SLOT_BOUND_SITE,
    HANDLER_INDIRECT_SITE,
    LIVE_BLOCK_BASE,
    BLOCK_COPY_ROUTINE,
    corroborate_observations,
    decode_enterable_inventory,
    enterable_slot_bound,
    mapping_content_digest,
    validate_mapping,
    verify_object_semantics,
)


def _synthetic_ram(
    *,
    bound: int = 4,
    handlers: tuple[int, ...] = (0x9000, 0x9000, 0x9100, 0x9200),
    trims: tuple[int, ...] = (0x10, 0x20, 0x30, 0x40),
    inert: tuple[int, ...] = (0x77, 0x77, 0x77, 0x77),
) -> bytearray:
    """Build a synthetic image with the dispatch shape the decoder requires.

    Nothing here is Reference Build data: the block table is invented so the
    decoder's structural contract can be exercised without any restricted input.
    """
    ram = bytearray(65536)
    # Entry dispatch: CMP #bound ; <2-byte gap> ; BCS reject
    ram[ENTRY_SLOT_BOUND_SITE] = 0xC9
    ram[ENTRY_SLOT_BOUND_SITE + 1] = bound
    ram[ENTRY_SLOT_BOUND_SITE + 2] = 0xB0
    # Block selection scales the slot index by the block length.
    ram[BLOCK_COPY_ROUTINE:BLOCK_COPY_ROUTINE + 4] = bytes((0x0A, 0x0A, 0x0A, 0x0A))
    # Locomotion dispatches indirectly through the live block.
    ram[HANDLER_INDIRECT_SITE] = 0x6C
    ram[HANDLER_INDIRECT_SITE + 1] = LIVE_BLOCK_BASE & 0xFF
    ram[HANDLER_INDIRECT_SITE + 2] = LIVE_BLOCK_BASE >> 8
    for slot in range(bound):
        start = BLOCK_TABLE_BASE + slot * BLOCK_LENGTH
        block = bytearray(BLOCK_LENGTH)
        handler = handlers[slot % len(handlers)]
        block[0] = handler & 0xFF
        block[1] = handler >> 8
        block[12] = inert[slot % len(inert)]   # the offset the ledger treats as inert
        block[14] = trims[slot % len(trims)]   # a rate offset inside the class key
        ram[start:start + BLOCK_LENGTH] = block
    return ram


def _enter(ram: bytearray, slot: int) -> bytearray:
    """Put the image in a reached enterable state for one slot."""
    ram[0xA9] = slot
    start = BLOCK_TABLE_BASE + slot * BLOCK_LENGTH
    ram[LIVE_BLOCK_BASE:LIVE_BLOCK_BASE + BLOCK_LENGTH] = ram[start:start + BLOCK_LENGTH]
    return ram


def _observations(mapping: dict, slot: int) -> dict:
    block = {member["slot"]: member for member in mapping["members"]}[slot]["parameterBlock"]

    def little(start: int, length: int) -> int:
        return int.from_bytes(bytes(block[start:start + length]), "little")

    return {
        "walking-mode": False,
        "craft-mode-class": slot,
        "enterable-block-handler": little(0, 2),
        "enterable-block-rates-low": little(2, 8),
        "enterable-block-rates-high": little(10, 6),
    }


class EnterableInventoryDecodeTests(unittest.TestCase):
    def test_reads_the_enterable_bound_from_the_dispatch(self) -> None:
        self.assertEqual(enterable_slot_bound(bytes(_synthetic_ram(bound=6))), 6)

    def test_rejects_an_image_without_the_expected_dispatch_shape(self) -> None:
        ram = _synthetic_ram()
        ram[ENTRY_SLOT_BOUND_SITE] = 0xEA

        with self.assertRaisesRegex(LabError, "does not bound the enterable slot range"):
            enterable_slot_bound(bytes(ram))

    def test_rejects_a_bound_outside_the_object_slot_space(self) -> None:
        ram = _synthetic_ram()
        ram[ENTRY_SLOT_BOUND_SITE + 1] = 0x50

        with self.assertRaisesRegex(LabError, "outside the object slot space"):
            enterable_slot_bound(bytes(ram))

    def test_rejects_an_image_that_does_not_dispatch_through_the_live_block(self) -> None:
        ram = _synthetic_ram()
        ram[HANDLER_INDIRECT_SITE] = 0x4C

        with self.assertRaisesRegex(LabError, "not dispatched indirectly through the live parameter block"):
            decode_enterable_inventory(bytes(ram))

    def test_rejects_an_image_that_does_not_scale_the_slot_index(self) -> None:
        ram = _synthetic_ram()
        ram[BLOCK_COPY_ROUTINE] = 0xEA

        with self.assertRaisesRegex(LabError, "does not scale the slot index"):
            decode_enterable_inventory(bytes(ram))

    def test_rejects_an_image_that_is_not_64_kib(self) -> None:
        with self.assertRaisesRegex(LabError, "64 KiB physical RAM"):
            decode_enterable_inventory(bytes(1024))

    def test_enumerates_every_slot_below_the_bound(self) -> None:
        mapping = decode_enterable_inventory(bytes(_synthetic_ram(bound=4)))

        self.assertEqual(mapping["inventory"]["memberCount"], 4)
        self.assertEqual(
            [member["geometryIdentity"] for member in mapping["members"]],
            ["object-instance:00", "object-instance:01", "object-instance:02", "object-instance:03"],
        )

    def test_groups_slots_that_project_to_the_same_class_key(self) -> None:
        mapping = decode_enterable_inventory(
            bytes(_synthetic_ram(handlers=(0x9000, 0x9000, 0x9100, 0x9200), trims=(0x10, 0x10, 0x30, 0x40)))
        )

        self.assertEqual(mapping["inventory"]["classCount"], 3)
        self.assertEqual(mapping["inventory"]["dispatchHandlerCount"], 3)
        first = {member["slot"]: member["classId"] for member in mapping["members"]}
        self.assertEqual(first[0], first[1])
        self.assertNotEqual(first[0], first[2])

    def test_excludes_the_inert_offset_from_the_class_key(self) -> None:
        shared = _synthetic_ram(handlers=(0x9000, 0x9000, 0x9100, 0x9200), trims=(0x10, 0x10, 0x30, 0x40))
        mapping = decode_enterable_inventory(bytes(shared))
        # Slots 0 and 1 differ only at the inert offset, so they must stay one class.
        divergent = _synthetic_ram(
            handlers=(0x9000, 0x9000, 0x9100, 0x9200),
            trims=(0x10, 0x10, 0x30, 0x40),
            inert=(0x01, 0x02, 0x03, 0x04),
        )
        divergent_mapping = decode_enterable_inventory(bytes(divergent))

        self.assertEqual(mapping["inventory"]["classCount"], divergent_mapping["inventory"]["classCount"])
        self.assertEqual(divergent_mapping["inertOffsets"], [12])
        slots = {member["slot"]: member["classId"] for member in divergent_mapping["members"]}
        self.assertEqual(slots[0], slots[1])

    def test_splits_slots_whose_rate_fields_differ(self) -> None:
        mapping = decode_enterable_inventory(
            bytes(_synthetic_ram(handlers=(0x9000, 0x9000, 0x9000, 0x9000), trims=(0x10, 0x20, 0x30, 0x40)))
        )

        self.assertEqual(mapping["inventory"]["dispatchHandlerCount"], 1)
        self.assertEqual(mapping["inventory"]["classCount"], 4)

    def test_field_ledger_disposes_of_every_offset_once(self) -> None:
        mapping = decode_enterable_inventory(bytes(_synthetic_ram()))

        self.assertEqual(
            sorted(mapping["classKeyOffsets"] + mapping["inertOffsets"]),
            list(range(BLOCK_LENGTH)),
        )
        self.assertEqual(len(mapping["fieldLedger"]), BLOCK_LENGTH)


class MappingValidationTests(unittest.TestCase):
    def test_accepts_a_freshly_decoded_mapping(self) -> None:
        mapping = decode_enterable_inventory(bytes(_synthetic_ram()))

        self.assertEqual(validate_mapping(mapping)["status"], "verified")

    def test_rejects_a_tampered_content_digest(self) -> None:
        mapping = decode_enterable_inventory(bytes(_synthetic_ram()))
        mapping["contentDigest"] = "0" * 64

        with self.assertRaisesRegex(LabError, "content digest does not match"):
            validate_mapping(mapping)

    def test_rejects_a_class_key_that_does_not_project_its_block(self) -> None:
        mapping = decode_enterable_inventory(bytes(_synthetic_ram()))
        mapping["members"][0]["classKey"][0] ^= 0xFF
        mapping["contentDigest"] = mapping_content_digest(mapping)

        with self.assertRaisesRegex(LabError, "does not project its parameter block"):
            validate_mapping(mapping)

    def test_rejects_stale_class_membership(self) -> None:
        mapping = decode_enterable_inventory(bytes(_synthetic_ram()))
        mapping["classes"][0]["memberSlots"] = []
        mapping["contentDigest"] = mapping_content_digest(mapping)

        with self.assertRaisesRegex(LabError, "has stale membership"):
            validate_mapping(mapping)

    def test_rejects_a_non_contiguous_enterable_range(self) -> None:
        mapping = decode_enterable_inventory(bytes(_synthetic_ram()))
        mapping["members"] = mapping["members"][:-1]
        mapping["inventory"]["memberCount"] = len(mapping["members"])
        mapping["contentDigest"] = mapping_content_digest(mapping)

        with self.assertRaisesRegex(LabError, "every slot below the decoded bound"):
            validate_mapping(mapping)

    def test_rejects_a_misreported_dispatch_handler_count(self) -> None:
        mapping = decode_enterable_inventory(bytes(_synthetic_ram()))
        mapping["inventory"]["dispatchHandlerCount"] = mapping["inventory"]["classCount"] + 1
        mapping["contentDigest"] = mapping_content_digest(mapping)

        with self.assertRaisesRegex(LabError, "dispatch handler count is inconsistent"):
            validate_mapping(mapping)

    def test_rejects_a_mapping_that_is_not_scoped_to_unc_0002(self) -> None:
        mapping = decode_enterable_inventory(bytes(_synthetic_ram()))
        mapping["uncertaintyId"] = "UNC-0001"
        mapping["contentDigest"] = mapping_content_digest(mapping)

        with self.assertRaisesRegex(LabError, "must target UNC-0002"):
            validate_mapping(mapping)

    def test_content_digest_ignores_the_capture_it_was_decoded_from(self) -> None:
        mapping = decode_enterable_inventory(bytes(_synthetic_ram()))
        without_source = mapping_content_digest(mapping)
        mapping["source"] = {"runId": "interactive-elsewhere", "buildSha256": "a" * 64, "ramSha256": "b" * 64}

        self.assertEqual(mapping_content_digest(mapping), without_source)

    def test_verify_requires_a_restricted_path(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "mapping.json"
            path.write_text(json.dumps(decode_enterable_inventory(bytes(_synthetic_ram()))), encoding="utf-8")

            with self.assertRaisesRegex(LabError, "must remain under ignored work/ or restricted/"):
                verify_object_semantics(path)


class CorroborationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.mapping = decode_enterable_inventory(bytes(_synthetic_ram()))

    def test_accepts_observations_that_match_the_decoded_block(self) -> None:
        result = corroborate_observations(self.mapping, _observations(self.mapping, 2))

        self.assertTrue(result["liveBlockMatchesDecodedBlock"])
        self.assertEqual(result["geometryIdentity"], "object-instance:02")

    def test_rejects_a_walking_state(self) -> None:
        observed = _observations(self.mapping, 1)
        observed["walking-mode"] = True

        with self.assertRaisesRegex(LabError, "reached enterable state, not a walking state"):
            corroborate_observations(self.mapping, observed)

    def test_rejects_a_slot_outside_the_decoded_inventory(self) -> None:
        observed = _observations(self.mapping, 1)
        observed["craft-mode-class"] = 0x3F

        with self.assertRaisesRegex(LabError, "outside the decoded enterable inventory"):
            corroborate_observations(self.mapping, observed)

    def test_rejects_a_live_block_that_disagrees_with_the_decoded_block(self) -> None:
        observed = _observations(self.mapping, 1)
        observed["enterable-block-rates-high"] += 1

        with self.assertRaisesRegex(LabError, "enterable-block-rates-high does not match"):
            corroborate_observations(self.mapping, observed)

    def test_rejects_a_missing_block_observation(self) -> None:
        observed = _observations(self.mapping, 1)
        del observed["enterable-block-handler"]

        with self.assertRaisesRegex(LabError, "missing observation enterable-block-handler"):
            corroborate_observations(self.mapping, observed)

    def test_rejects_a_non_integer_selector(self) -> None:
        observed = _observations(self.mapping, 1)
        observed["craft-mode-class"] = True

        with self.assertRaisesRegex(LabError, "integer enterable selector"):
            corroborate_observations(self.mapping, observed)

    def test_a_reached_state_corroborates_its_own_class(self) -> None:
        ram = _enter(_synthetic_ram(), 3)
        mapping = decode_enterable_inventory(bytes(ram))
        expected = {member["slot"]: member["classId"] for member in mapping["members"]}[3]

        self.assertEqual(corroborate_observations(mapping, _observations(mapping, 3))["classId"], expected)

    def test_corroboration_does_not_mutate_the_mapping(self) -> None:
        before = copy.deepcopy(self.mapping)
        corroborate_observations(self.mapping, _observations(self.mapping, 0))

        self.assertEqual(self.mapping, before)


if __name__ == "__main__":
    unittest.main()
