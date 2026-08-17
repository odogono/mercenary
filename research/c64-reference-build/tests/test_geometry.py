from __future__ import annotations

import json
import hashlib
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

from c64lab.core import LabError
from c64lab.geometry import (
    _resolve_room_arrivals,
    _require_room_pair_tables,
    _surface_y,
    canonical_digest,
    core_dataset_digest,
    decode_object_model,
    decode_high_altitude_map,
    decode_primitive_templates,
    decode_room_record,
    decode_surface_structure,
    encode_object_model,
    encode_room_record,
    encode_surface_structure,
    expand_room,
    load_geometry_source,
    render_road_network_svg,
    select_comparison_subjects,
    signed24,
    validate_curation,
    validate_references,
    validate_redacted_summary,
)


class NumericTests(unittest.TestCase):
    def test_interprets_signed_24_bit_values_without_float_conversion(self) -> None:
        self.assertEqual(signed24(0x7FFFFF), 0x7FFFFF)
        self.assertEqual(signed24(0x800000), -0x800000)
        self.assertEqual(signed24(0xFFFFFF), -1)

    def test_decodes_the_fixed_high_altitude_map(self) -> None:
        ram = bytearray(0x10000)
        ram[0x902A:0x9030] = bytes([0x3E, 0x12, 0x34, 3, 0x3F, 0x3E])

        decoded = decode_high_altitude_map(bytes(ram))

        self.assertEqual(decoded["packedPoints"], [0x12, 0x34])
        self.assertEqual(decoded["segments"], [{
            "slot": 0,
            "startPacked": 0x34,
            "endPacked": 0x12,
            "startGrid": [4, 3],
            "endGrid": [2, 1],
        }])
        self.assertEqual(decoded["runtimeSpan"], [0x902A, 0x902F])

    def test_extended_surface_height_discards_the_first_shift_carry(self) -> None:
        # The routine performs one ASL before the three ASL/ROL pairs. The lift's
        # $86 byte is therefore $0060 high, not $0430.
        low, middle = _surface_y(15, 0x86)

        self.assertEqual((low, middle), (0x60, 0x00))


class RoadNetworkSVGTests(unittest.TestCase):
    def test_renders_only_unique_road_table_lines_with_metadata(self) -> None:
        surface = {
            "cells": [
                {
                    "cell": 1,
                    "roads": [
                        {"segment": 0, "startPacked": 0x01, "endPacked": 0x0F,
                         "startGrid": [1, 0], "endGrid": [15, 0]},
                        {"segment": 1, "startPacked": 0x01, "endPacked": 0xF1,
                         "startGrid": [1, 0], "endGrid": [1, 15]},
                    ],
                    "expanded": {"vertices": [{"position": [999, 0, 999]}], "edges": []},
                },
                {
                    "cell": 2,
                    "roads": [
                        {"segment": 0, "startPacked": 0x0F, "endPacked": 0x01,
                         "startGrid": [15, 0], "endGrid": [1, 0]},
                    ],
                },
            ]
        }

        svg, summary = render_road_network_svg(surface, dataset_id="world-test", core_digest="a" * 64)

        self.assertEqual(summary, {"sourceEntries": 3, "uniqueLines": 2})
        self.assertEqual(svg.count('<line class="road"'), 2)
        self.assertIn('data-sources="01:0 02:0"', svg)
        self.assertIn('data-sources="01:1"', svg)
        self.assertIn('data-dataset-id="world-test"', svg)
        root = ET.fromstring(svg)
        self.assertEqual(root.tag, "{http://www.w3.org/2000/svg}svg")
        road = root.findall(".//{http://www.w3.org/2000/svg}line")[-2]
        self.assertEqual((road.attrib["x1"], road.attrib["y1"]), ("1.5", "0.5"))
        self.assertIn('fill="#008000"', svg)
        self.assertIn('class="road"', svg)
        self.assertIn('stroke-width="1" vector-effect="non-scaling-stroke"', svg)
        self.assertNotIn("999", svg)
        self.assertLess(svg.index('class="grid"'), svg.index('class="road"'))

    def test_svg_is_deterministic_when_cells_are_reordered(self) -> None:
        cells = [
            {"cell": 2, "roads": [{"segment": 0, "startPacked": 0x0F, "endPacked": 0x01,
                                     "startGrid": [15, 0], "endGrid": [1, 0]}]},
            {"cell": 1, "roads": [{"segment": 0, "startPacked": 0x01, "endPacked": 0x0F,
                                     "startGrid": [1, 0], "endGrid": [15, 0]}]},
        ]

        first, _ = render_road_network_svg({"cells": cells}, dataset_id="world-test", core_digest="b" * 64)
        second, _ = render_road_network_svg({"cells": list(reversed(cells))}, dataset_id="world-test", core_digest="b" * 64)

        self.assertEqual(first, second)


class ObjectModelTests(unittest.TestCase):
    def test_decodes_and_reconstructs_packed_edges(self) -> None:
        raw = bytes([1, 0xFF, 0x00, 0x01, 0x7F, 0x80, 0x81, 0, 0x01])

        model = decode_object_model(raw, address=0x2000)

        self.assertEqual(model["vertexCount"], 2)
        self.assertEqual(model["vertices"][0]["normalized"], [-16, 0, 16])
        self.assertEqual(model["vertices"][1]["normalized"], [2032, -2048, -2032])
        self.assertEqual({key: model["edges"][0][key] for key in ("start", "end", "rawHex")}, {"start": 0, "end": 1, "rawHex": "01"})
        self.assertEqual(bytes.fromhex(model["reconstructedHex"]), raw)

    def test_decodes_and_reconstructs_wide_edges(self) -> None:
        vertices = bytes([0x80, 0x80, 0x80] * 17)
        raw = bytes([16]) + vertices + bytes([0x80, 0, 16])

        model = decode_object_model(raw, address=0x3000)

        self.assertEqual(model["edgeEncoding"], "wide")
        self.assertEqual(model["edges"][0]["end"], 16)
        self.assertEqual(bytes.fromhex(model["reconstructedHex"]), raw)

    def test_rejects_an_edge_outside_the_vertex_range(self) -> None:
        raw = bytes([1, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0, 0x02])
        with self.assertRaisesRegex(LabError, "edge index"):
            decode_object_model(raw, address=0x2000)

    def test_inverse_encoder_uses_normalized_fields_instead_of_echoing_raw_bytes(self) -> None:
        raw = bytes([1, 0x80, 0x80, 0x80, 0x81, 0x81, 0x81, 0, 0x01])
        model = decode_object_model(raw, address=0x2000)
        model["edges"][0]["end"] = 0
        self.assertEqual(encode_object_model(model)[-1], 0x00)


class SurfaceStructureTests(unittest.TestCase):
    def test_zero_switches_the_rest_of_the_edge_table_to_full_width_pairs(self) -> None:
        raw = bytes(
            [
                1, 2, 2, 0,  # two points, three lines, no rotation
                0x01,  # packed 0 -> 1
                0, 1, 0,  # switch mode, then full-width 1 -> 0
                0, 1,  # full-width 0 -> 1; no second marker
                0, 0, 1, 1,  # points
            ]
        )

        structure = decode_surface_structure(raw, address=0xC000)

        self.assertEqual(
            [(line["start"], line["end"], line["rawHex"]) for line in structure["lines"]],
            [(0, 1, "01"), (1, 0, "000100"), (0, 1, "0001")],
        )
        self.assertEqual(structure["points"][0]["rawHex"], "0000")
        self.assertEqual(encode_surface_structure(structure), raw)

    def test_decodes_full_width_edge_and_escaped_height(self) -> None:
        # Two points, one escaped full-width edge, no rotated prefix.  Point 1
        # uses height code 15 and therefore carries an extra height byte.
        raw = bytes([1, 0, 0, 0, 0, 0, 1, 0x00, 0x00, 0xC0, 0xC0, 0x55])

        structure = decode_surface_structure(raw, address=0xC000)

        self.assertEqual({key: structure["lines"][0][key] for key in ("start", "end", "rawHex")}, {"start": 0, "end": 1, "rawHex": "000001"})
        self.assertEqual(structure["points"][1]["heightCode"], 15)
        self.assertEqual(structure["points"][1]["extendedHeight"], 0x55)
        self.assertEqual(bytes.fromhex(structure["reconstructedHex"]), raw)
        self.assertEqual(encode_surface_structure(structure), raw)

    def test_preserves_rotated_point_inputs_without_treating_them_as_quantized_points(self) -> None:
        raw = bytes([0, 0, 0, 0x10, 0x20, 0x30, 0, 0, 0, 0x44, 0x55, 0x66])

        structure = decode_surface_structure(raw, address=0xC100)

        self.assertEqual(structure["points"][0]["kind"], "rotated")
        self.assertEqual(structure["points"][0]["rotationInput"], [0x44, 0x55, 0x66])
        self.assertEqual(bytes.fromhex(structure["reconstructedHex"]), raw)


class UndergroundRoomTests(unittest.TestCase):
    def test_preserves_command_bytes_and_special_terminator(self) -> None:
        raw = bytes([1, 2, 3, 4, 5, 0x11, 0x22, 0x33, 0x44, 0x80])

        room = decode_room_record(raw, address=0x3000)

        self.assertEqual(room["commands"][0]["primitiveIndex"], 1)
        self.assertEqual(room["commands"][0]["plane"], "xy")
        self.assertEqual(room["terminator"], 0x80)
        self.assertEqual(bytes.fromhex(room["reconstructedHex"]), raw)
        self.assertEqual(encode_room_record(room), raw)

    def test_negative_opcode_selects_rotated_plane(self) -> None:
        raw = bytes([1, 2, 3, 4, 5, 0xF2, 0, 0, 0, 0])
        room = decode_room_record(raw, address=0x3100)
        self.assertEqual(room["commands"][0]["primitiveIndex"], 2)
        self.assertEqual(room["commands"][0]["plane"], "zy")

    def test_expands_primitive_chains_and_room_boundary_geometry(self) -> None:
        ram = bytearray(0x10000)
        ram[0x932B:0x932E] = bytes([0, 0, 0])
        ram[0x928A:0x928F] = bytes([0x10, 0x20, 0x30, 0x40, 0xFF])
        templates = decode_primitive_templates(bytes(ram))
        room = decode_room_record(bytes([1, 2, 3, 4, 5, 0x01, 0, 0x06, 0x07, 0]), address=0x3000)

        expanded = expand_room(room, templates)

        self.assertEqual(expanded["vertices"][8]["position"], [0x0610, 0x20, 0x0700])
        self.assertEqual(expanded["vertices"][9]["position"], [0x0630, 0x40, 0x0700])
        self.assertEqual(expanded["edges"][-1]["indices"], [8, 9])

    def test_a_dollar_eighty_terminator_marks_the_room_dark(self) -> None:
        # The setup routine tests one byte for both, so darkness is the terminator
        # rather than a field of its own.
        dark = decode_room_record(bytes([1, 2, 3, 4, 5, 0x11, 0x22, 0x33, 0x44, 0x80]), address=0x3000)
        lit = decode_room_record(bytes([1, 2, 3, 4, 5, 0x11, 0x22, 0x33, 0x44, 0x00]), address=0x3000)

        self.assertTrue(dark["dark"])
        self.assertFalse(lit["dark"])

    def test_the_commands_middle_bits_are_the_destinations_arrival_index(self) -> None:
        room = decode_room_record(bytes([1, 2, 3, 4, 5, 0x62, 0x2A, 0x03, 0x04, 0]), address=0x3000)
        command = room["commands"][0]

        # $62: plane bit clear, shape 2, and bits 4-6 holding 6.
        self.assertEqual(command["arrivalCommandIndex"], 6)
        self.assertEqual(command["primitiveIndex"], 2)
        self.assertEqual(command["plane"], "xy")
        self.assertEqual(command["linkedRoom"], 0x2A)
        self.assertEqual(command["uncertainties"], [])

    def test_entry_is_a_script_or_a_message_but_never_both(self) -> None:
        # header[1] >> 3 carries the index and header[2]'s top bit chooses which of
        # the two it is, so the two readings are alternatives in the Reference Build.
        script = decode_room_record(bytes([1, 9 << 3, 0x80, 4, 5, 0]), address=0x3000)
        message = decode_room_record(bytes([1, 9 << 3, 0x00, 4, 5, 0]), address=0x3000)
        neither = decode_room_record(bytes([1, 0x07, 0x80, 4, 5, 0]), address=0x3000)

        self.assertEqual(script["entry"], {"script": 9})
        self.assertEqual(message["entry"], {"message": 9})
        self.assertIsNone(neither["entry"])

    def test_a_special_record_carries_two_alternates_past_its_terminator(self) -> None:
        raw = bytes([0x83, 1, 3, 0, 10, 0x97, 0x8D, 3, 1, 0, 0x8D, 0x10, 0x56, 0x00])

        room = decode_room_record(raw, address=0x3800)

        self.assertEqual(room["specialSetup"]["selector"], "previousRoom")
        self.assertEqual(
            [(entry["room"], entry["arrivalCommandIndex"]) for entry in room["specialSetup"]["alternates"]],
            [(0x8D, 1), (0x56, 0)],
        )
        # The pair table is inside the record, so the round trip has to carry it.
        self.assertEqual(encode_room_record(room), raw)
        self.assertEqual(room["runtimeSpan"], [0x3800, 0x380D])

    def test_the_random_record_carries_eight_alternates(self) -> None:
        raw = bytes([0x83, 1, 3, 0, 13, 0x26, 0x14, 1, 3, 0]) + bytes(
            [0x14, 0x00, 0x3D, 0x10, 0x2E, 0x00, 0x21, 0x50, 0x70, 0x10, 0x04, 0x10, 0x06, 0x30, 0x68, 0x00]
        )

        room = decode_room_record(raw, address=0x375E, special_pairs=8, special_selector="random")

        self.assertEqual(room["specialSetup"]["selector"], "random")
        self.assertEqual(len(room["specialSetup"]["alternates"]), 8)
        self.assertEqual(room["specialSetup"]["alternates"][3], {
            "geometryIdentity": "room-record:375e:alternate:03",
            "room": 0x21,
            "arrivalCommandIndex": 5,
            # Pair 3 sits at record offset 16, which is where AND #$0E / ADC #$0A
            # lands its fourth selector value.
            "provenanceRefs": ["span:376e-376f"],
        })
        self.assertEqual(encode_room_record(room), raw)

    def test_an_ordinary_record_carries_no_alternates(self) -> None:
        room = decode_room_record(bytes([0x03, 1, 3, 0, 10, 0x97, 0x8D, 3, 1, 0]), address=0x3800)
        self.assertIsNone(room["specialSetup"])

    def test_rejects_an_alternate_that_is_not_a_bare_arrival_index(self) -> None:
        # A pair byte is a pre-shifted $70 value; anything else means the record is
        # not the shape the patch at $9133 splices into.
        raw = bytes([0x83, 1, 3, 0, 10, 0x97, 0x8D, 3, 1, 0, 0x8D, 0x11, 0x56, 0x00])
        with self.assertRaisesRegex(LabError, "not a bare arrival index"):
            decode_room_record(raw, address=0x3800)

    def test_rejects_an_alternate_naming_a_room_that_does_not_exist(self) -> None:
        raw = bytes([0x83, 1, 3, 0, 10, 0x97, 0x8D, 3, 1, 0, 0xC0, 0x10, 0x56, 0x00])
        with self.assertRaisesRegex(LabError, "does not exist"):
            decode_room_record(raw, address=0x3800)

    def test_rejects_an_unknown_special_selector(self) -> None:
        raw = bytes([0x83, 1, 3, 0, 10, 0x97, 0x8D, 3, 1, 0, 0x8D, 0x10, 0x56, 0x00])
        with self.assertRaisesRegex(LabError, "Unknown special-setup selector"):
            decode_room_record(raw, address=0x3800, special_selector="whenever")

    def test_rejects_a_special_record_truncated_before_its_pair_table(self) -> None:
        raw = bytes([0x83, 1, 3, 0, 10, 0x97, 0x8D, 3, 1, 0, 0x8D])
        with self.assertRaisesRegex(LabError, "pair table"):
            decode_room_record(raw, address=0x3800)


class RoomPairTableTests(unittest.TestCase):
    """Both record shapes are asserted, because the region tiles exactly.

    Reading the wrong number of pairs would consume a neighbour's header rather
    than fail, so the shapes cannot be left to trust.
    """

    @staticmethod
    def record(address, selector, pairs):
        return {
            "geometryIdentity": f"room-record:{address:04x}",
            "runtimeAddress": address,
            "specialSetup": {
                "selector": selector,
                "alternates": [{"room": 1, "arrivalCommandIndex": 0} for _ in range(pairs)],
            },
        }

    def ordinary(self, address):
        return {"geometryIdentity": f"room-record:{address:04x}", "runtimeAddress": address, "specialSetup": None}

    def test_accepts_one_random_record_and_the_rest_by_previous_room(self) -> None:
        _require_room_pair_tables(
            [self.record(0x375E, "random", 8), self.record(0x3778, "previousRoom", 2), self.ordinary(0x3000)]
        )

    def test_rejects_a_second_random_record(self) -> None:
        with self.assertRaisesRegex(LabError, "Exactly one Room record"):
            _require_room_pair_tables([self.record(0x375E, "random", 8), self.record(0x3778, "random", 8)])

    def test_rejects_no_random_record_at_all(self) -> None:
        with self.assertRaisesRegex(LabError, "Exactly one Room record"):
            _require_room_pair_tables([self.record(0x3778, "previousRoom", 2)])

    def test_rejects_a_random_record_with_the_narrow_table(self) -> None:
        with self.assertRaisesRegex(LabError, "carries 2 alternates rather than 8"):
            _require_room_pair_tables([self.record(0x375E, "random", 2)])

    def test_rejects_a_previous_room_record_with_the_wide_table(self) -> None:
        with self.assertRaisesRegex(LabError, "carries 8 alternates rather than 2"):
            _require_room_pair_tables(
                [self.record(0x375E, "random", 8), self.record(0x3778, "previousRoom", 8)]
            )

    def test_rejects_special_records_an_ordinary_one_sits_between(self) -> None:
        with self.assertRaisesRegex(LabError, "not contiguous"):
            _require_room_pair_tables(
                [
                    self.record(0x3000, "random", 8),
                    self.ordinary(0x3010),
                    self.record(0x3020, "previousRoom", 2),
                ]
            )


class RoomArrivalTests(unittest.TestCase):
    """Where a Doorway puts the player, resolved the way the Room setup does."""

    @staticmethod
    def image(records):
        ram = bytearray(0x10000)
        for room_id, (pointer, raw) in records.items():
            ram[0x2300 + room_id] = pointer & 0xFF
            ram[0x23C0 + room_id] = pointer >> 8
            ram[pointer : pointer + len(raw)] = raw
        return bytes(ram)

    def resolve(self, records, room_ids=None):
        ram = self.image(records)
        slots = {}
        for room_id, (pointer, _) in records.items():
            slots.setdefault(pointer, []).append(room_id)
        decoded = [
            decode_room_record(ram[pointer:], address=pointer) for pointer in sorted(slots)
        ]
        _resolve_room_arrivals(decoded, slots, ram)
        return {record["runtimeAddress"]: record for record in decoded}

    def test_arrival_comes_from_the_destinations_own_command(self) -> None:
        # Room 1's Doorway names room 2's command 1, whose x is $22 and z is $33 and
        # whose plane bit is clear, so the low bytes are $80 and $00.
        records = {
            1: (0x3000, bytes([1, 0, 0, 4, 5, 0x12, 0x02, 0x07, 0x08, 0])),
            2: (0x3010, bytes([1, 0, 0, 4, 5, 0x02, 0x01, 0x11, 0x12, 0x02, 0x01, 0x22, 0x33, 0])),
        }
        resolved = self.resolve(records)
        command = resolved[0x3000]["commands"][0]

        self.assertEqual(command["arrivalCommandIndex"], 1)
        self.assertEqual(command["destination"], {"room": 2})
        self.assertEqual(command["arrival"], {"x": 0x2280, "z": 0x3300})
        self.assertTrue(command["arrivalWithinDestination"])

    def test_a_rotated_destination_command_swaps_the_low_bytes(self) -> None:
        records = {
            1: (0x3000, bytes([1, 0, 0, 4, 5, 0x02, 0x02, 0x07, 0x08, 0])),
            2: (0x3010, bytes([1, 0, 0, 4, 5, 0x82, 0x01, 0x22, 0x33, 0])),
        }
        resolved = self.resolve(records)

        # The destination's own plane bit is set, so z takes $80 and x takes $00.
        self.assertEqual(resolved[0x3000]["commands"][0]["arrival"], {"x": 0x2200, "z": 0x3380})

    def test_a_special_records_alternates_are_resolved_like_its_commands(self) -> None:
        # The rewrite at $9127 changes the first command's destination *and* its
        # arrival index together, so an alternate needs the same resolution a command
        # gets. Room 1 is a special record whose two alternates name room 2's
        # commands 0 and 1.
        records = {
            1: (
                0x3800,
                bytes([0x81, 0, 0, 4, 5, 0x02, 0x02, 0x07, 0x08, 0, 0x02, 0x00, 0x56, 0x10]),
            ),
            2: (
                0x3810,
                bytes([1, 0, 0, 4, 5, 0x02, 0x01, 0x11, 0x12, 0x02, 0x01, 0x22, 0x33, 0]),
            ),
            0x56: (0x3810, None),
        }
        records[0x56] = (0x3810, records[2][1])
        resolved = self.resolve(records)
        alternates = resolved[0x3800]["specialSetup"]["alternates"]

        self.assertEqual(alternates[0]["destination"], {"room": 2})
        self.assertEqual(alternates[0]["arrival"], {"x": 0x1180, "z": 0x1200})
        self.assertEqual(alternates[1]["destination"], {"room": 0x56})
        self.assertEqual(alternates[1]["arrival"], {"x": 0x2280, "z": 0x3300})
        self.assertTrue(all(entry["arrivalWithinDestination"] for entry in alternates))

    def test_the_doorway_out_of_the_underground_resolves_to_no_arrival_index(self) -> None:
        # A destination of zero is not room zero: Room setup branches out before it
        # reads any record and never consults the arrival index, so there is nothing
        # for this to resolve. Where the player *does* land is a fixed position in the
        # navigation rules rather than anything derived from the Doorway.
        records = {1: (0x3000, bytes([1, 0, 0, 4, 5, 0x82, 0x00, 0x00, 0x06, 0]))}
        command = self.resolve(records)[0x3000]["commands"][0]

        self.assertEqual(command["destination"], {"colonyCraft": True})
        self.assertIsNone(command["arrival"])
        self.assertTrue(command["arrivalWithinDestination"])

    def test_an_index_past_the_destination_reads_on_rather_than_being_repaired(self) -> None:
        # One Doorway in the Reference Build names an index its destination does not
        # have. The setup routine reads past that record's terminator and lands the
        # player outside the Room; resolving from the bytes reproduces that instead
        # of quietly correcting the index.
        records = {
            1: (0x3000, bytes([1, 0, 0, 4, 5, 0x22, 0x02, 0x07, 0x08, 0])),
            2: (0x3010, bytes([1, 0, 0, 4, 5, 0x02, 0x01, 0x11, 0x12, 0])),
        }
        resolved = self.resolve(records)
        command = resolved[0x3000]["commands"][0]

        self.assertFalse(command["arrivalWithinDestination"])
        self.assertIn("arrival-index-past-destination", command["uncertainties"])
        # Offset 4*2 + 7 = 15, two past room 2's ten-byte record.
        self.assertEqual(command["arrival"], {"x": 0x0080, "z": 0x0000})


class DatasetContractTests(unittest.TestCase):
    def test_digest_is_independent_of_mapping_order(self) -> None:
        first = {"objects": {"b": 2, "a": 1}, "surface": [], "underground": []}
        second = {"underground": [], "surface": [], "objects": {"a": 1, "b": 2}}
        self.assertEqual(canonical_digest(first), canonical_digest(second))

    def test_core_dataset_digest_excludes_the_volatile_capture_run_id(self) -> None:
        first = {"provenance": {"source": {"runId": "one", "ramSha256": "a"}}, "objects": {}, "surface": {}, "underground": {}}
        second = {"provenance": {"source": {"runId": "two", "ramSha256": "a"}}, "objects": {}, "surface": {}, "underground": {}}
        self.assertEqual(core_dataset_digest(first), core_dataset_digest(second))

    def test_curation_requires_authoritative_evidence_for_verified_names(self) -> None:
        curation = {
            "schemaVersion": 1,
            "names": [
                {
                    "geometryIdentity": "object-instance:3f",
                    "preferredName": "Orbital station",
                    "kind": "object",
                    "status": "verified",
                    "evidence": [{"authority": "secondary", "reference": "manual"}],
                }
            ],
        }
        with self.assertRaisesRegex(LabError, "Authoritative Evidence"):
            validate_curation(curation, {"object-instance:3f"})

    def test_selects_lowest_stable_coverage_subjects(self) -> None:
        dataset = {
            "objects": {
                "instances": [
                    {"geometryIdentity": "object-instance:03", "slot": 3, "rotatable": True, "curatedName": {"status": "verified", "kind": "vehicle"}},
                    {"geometryIdentity": "object-instance:02", "slot": 2, "rotatable": True, "curatedName": {"status": "candidate", "kind": "vehicle"}},
                    {"geometryIdentity": "object-instance:3f", "slot": 63, "rotatable": False},
                ]
            },
            "surface": {
                "cells": [
                    {"geometryIdentity": "surface-cell:05", "cell": 5, "hasStructure": True, "roadCount": 1},
                    {"geometryIdentity": "surface-cell:02", "cell": 2, "hasStructure": True, "roadCount": 1},
                ]
            },
            "underground": {
                "rooms": [
                    {"geometryIdentity": "room:02", "roomId": 2, "hasDoorway": True, "edgeCount": 1},
                    {"geometryIdentity": "room:01", "roomId": 1, "hasDoorway": True, "edgeCount": 1},
                ]
            },
        }

        selected = select_comparison_subjects(dataset)

        self.assertEqual(selected["surface"], "surface-cell:02")
        self.assertEqual(selected["underground"], "room:01")
        self.assertEqual(selected["vehicle"], "object-instance:03")
        self.assertEqual(selected["orbital"], "object-instance:3f")

    def test_geometry_source_requires_conditioned_interactive_physical_ram(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            run = Path(directory)
            ram = bytearray(65536)
            ram[0x7F] = 0x3F
            ram_path = run / "interactive.ram"
            ram_path.write_bytes(ram)
            digest = hashlib.sha256(ram).hexdigest()
            manifest = {
                "schemaVersion": 1,
                "runId": "synthetic",
                "createdAt": "2026-08-11T00:00:00Z",
                "build": {"hashes": {"sha256": "f" * 64}},
                "toolchain": {},
                "machine": {},
                "scenario": {"name": "interactive"},
                "checkpoint": {"name": "post-unpack", "address": 486},
                "artifacts": [{"role": "ram", "path": ram_path.name, "size": len(ram), "sha256": digest}],
            }
            (run / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")

            with self.assertRaisesRegex(LabError, "interactive checkpoint"):
                load_geometry_source(run)

            manifest["checkpoint"] = {"name": "interactive", "address": 33911}
            (run / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
            loaded, source = load_geometry_source(run)
            self.assertEqual(loaded[0x7F], 0x3F)
            self.assertEqual(source["ramSha256"], digest)

    def test_rejects_duplicate_identities_and_broken_provenance_references(self) -> None:
        documents = {
            "provenance": {"entries": [{"provenanceId": "span:1000-10ff", "runtimeSpan": [0x1000, 0x10FF]}]},
            "objects": {
                "models": [
                    {"geometryIdentity": "duplicate", "provenanceRefs": ["span:1001-1002"]},
                    {"geometryIdentity": "duplicate", "provenanceRefs": ["missing"]},
                ]
            },
            "surface": {},
            "underground": {},
        }
        with self.assertRaisesRegex(LabError, "duplicate Geometry Identity"):
            validate_references(documents)

        documents["objects"]["models"][1]["geometryIdentity"] = "second"
        with self.assertRaisesRegex(LabError, "unknown provenance"):
            validate_references(documents)

    def test_redacted_summary_rejects_payload_fields(self) -> None:
        summary = {
            "schemaVersion": 1,
            "qualification": "restricted",
            "decoderVersion": 1,
            "datasetId": "world-geometry-test",
            "coreDigest": "a" * 64,
            "curationDigest": None,
            "counts": {},
            "reproduction": {},
            "comparisons": [],
            "review": {},
            "restrictedEvidence": {},
            "rawHex": "deadbeef",
        }
        with self.assertRaisesRegex(LabError, "not allowlisted"):
            validate_redacted_summary(summary)


if __name__ == "__main__":
    unittest.main()
