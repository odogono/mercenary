from __future__ import annotations

import json
import hashlib
import tempfile
import unittest
from pathlib import Path

from c64lab.core import LabError
from c64lab.geometry import (
    canonical_digest,
    core_dataset_digest,
    decode_object_model,
    decode_primitive_templates,
    decode_room_record,
    decode_surface_structure,
    encode_object_model,
    encode_room_record,
    encode_surface_structure,
    expand_room,
    load_geometry_source,
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


class ObjectModelTests(unittest.TestCase):
    def test_decodes_and_reconstructs_packed_edges(self) -> None:
        raw = bytes([1, 0x7F, 0x80, 0x81, 0x82, 0x83, 0x84, 0, 0x01])

        model = decode_object_model(raw, address=0x2000)

        self.assertEqual(model["vertexCount"], 2)
        self.assertEqual(model["vertices"][0]["normalized"], [-16, 0, 16])
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
                    {"geometryIdentity": "room:02", "roomId": 2, "hasPortal": True, "edgeCount": 1},
                    {"geometryIdentity": "room:01", "roomId": 1, "hasPortal": True, "edgeCount": 1},
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
