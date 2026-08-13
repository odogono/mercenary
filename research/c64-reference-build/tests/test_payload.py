from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

LAB_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB_ROOT))

from c64lab.core import LabError
from c64lab.payload import (
    CELL_SIZE,
    build_road_cells,
    build_objects,
    build_surface,
    build_world,
    capture_counts,
    export_payload,
    require_current_geometry_decoder,
)


def _surface() -> dict:
    """A two-cell synthetic surface. Nothing here is Reference Build data."""
    return {
        "schemaVersion": 1,
        "roadAltitudeLookup": {"rawHex": "000103"},
        "transformContract": {"cell": "((zHigh & $0F) << 4) | (xHigh & $0F)"},
        "structures": [
            {
                "geometryIdentity": "surface-structure:test",
                "rotatedPointDescriptor": 0x73,
                "rotationCenter": [132, 132],
            },
            {"geometryIdentity": "surface-structure:plain", "rotatedPointDescriptor": 0},
        ],
        "cells": [
            {
                "cell": 0,
                "grid": [0, 0],
                "structure": "surface-structure:test",
                "roads": [{"startGrid": [0, 0], "endGrid": [3, 0], "segment": 0}],
                "expanded": {
                    "bounds": {"min": [0, 0, 0], "max": [100, 200, 300]},
                    "vertices": [
                        {"kind": "world-point", "position": [0, 0, 0]},
                        {"kind": "world-point", "position": [100, 0, 0]},
                        {"kind": "rotated-input", "rotationInput": [1, 2, 3]},
                    ],
                    "edges": [
                        {"indices": [0, 1], "operation": "white"},
                        {"indices": [1, 2], "operation": "black"},
                    ],
                },
            },
            {
                "cell": 1,
                "grid": [1, 0],
                "structure": "surface-structure:plain",
                # The same segment is listed from the other end, so the road
                # network must deduplicate it.
                "roads": [{"startGrid": [3, 0], "endGrid": [0, 0], "segment": 0}],
                "expanded": {
                    "bounds": {"min": [0, -50, 0], "max": [10, 20, 30]},
                    "vertices": [{"kind": "world-point", "position": [5, 5, 5]}],
                    "edges": [],
                },
            },
        ],
    }


def _objects() -> dict:
    return {
        "schemaVersion": 1,
        "models": [
            {
                "geometryIdentity": "object-model:test",
                "vertices": [
                    {"normalized": [-10, -100, -10]},
                    {"normalized": [10, -100, -10]},
                ],
                "edges": [{"start": 0, "end": 1}],
            }
        ],
        "instances": [
            {
                "geometryIdentity": "object-instance:00",
                "slot": 0,
                "model": "object-model:test",
                "positionSigned24": [500, 0, 500],
                "orientationBytes": [0, 0, 0],
                "roomMembership": 0,
                "stateFlags": 48,
                "rotatable": True,
                "visibility": {"detailCubePerAxis": 0x010000, "farRepresentation": "point"},
            },
            {
                "geometryIdentity": "object-instance:01",
                "slot": 1,
                "model": "object-model:test",
                "positionSigned24": [10, 0, 20],
                "orientationBytes": None,
                "roomMembership": 7,
                "stateFlags": 32,
                "rotatable": False,
                "visibility": {"detailCubePerAxis": 0x010000, "farRepresentation": "point"},
            },
        ],
    }


class WorldExportTests(unittest.TestCase):
    def test_records_grid_metadata_and_world_bounds(self) -> None:
        world = build_world(_surface())

        self.assertEqual(world["grid"], {"cellsPerAxis": 16, "cellSize": CELL_SIZE})
        self.assertEqual(world["bounds"]["min"], [0, -50, 0])
        self.assertEqual(world["bounds"]["max"], [100, 200, 300])

    def test_records_the_established_vertical_convention(self) -> None:
        world = build_world(_surface())

        self.assertEqual(world["verticalConvention"]["axis"], "y")
        self.assertEqual(world["verticalConvention"]["groundLevel"], 0)

    def test_preserves_full_road_table_runs_and_lookup_cells(self) -> None:
        world = build_world(_surface())

        self.assertEqual(len(world["roadCells"]), 2)
        self.assertEqual(
            world["roadCells"][0],
            {"cell": 0, "segments": [{"slot": 0, "from": [0, 0], "to": [3, 0]}]},
        )
        self.assertEqual(
            world["roadCells"][1],
            {"cell": 1, "segments": [{"slot": 0, "from": [3, 0], "to": [0, 0]}]},
        )

    def test_preserves_both_optional_slots_and_empty_cells(self) -> None:
        surface = _surface()
        surface["cells"][0]["roads"].append(
            {"startGrid": [0, 0], "endGrid": [0, 3], "segment": 1}
        )
        surface["cells"][1]["roads"] = []

        cells = build_road_cells(surface)

        self.assertEqual([segment["slot"] for segment in cells[0]["segments"]], [0, 1])
        self.assertEqual(cells[1], {"cell": 1, "segments": []})

    def test_carries_the_road_altitude_lookup_and_transform_contract(self) -> None:
        world = build_world(_surface())

        self.assertEqual(world["roadAltitudeLookup"], [0, 1, 3])
        self.assertIn("cell", world["transformContract"])

    def test_rejects_a_surface_with_no_expanded_cells(self) -> None:
        with self.assertRaisesRegex(LabError, "expanded no cell bounds"):
            build_world({"schemaVersion": 1, "cells": [{"cell": 0, "grid": [0, 0]}]})


class SurfaceExportTests(unittest.TestCase):
    def test_preserves_the_complete_vertex_index_space_and_maps_ink(self) -> None:
        surface = build_surface(_surface())
        first = surface["cells"][0]

        self.assertEqual(
            first["vertices"],
            [
                {"kind": "world-point", "position": [0, 0, 0]},
                {"kind": "world-point", "position": [100, 0, 0]},
                {"kind": "rotated-input", "rotationInput": [1, 2, 3]},
            ],
        )
        self.assertEqual(first["edges"], [[0, 1, 0], [1, 2, 1]])

    def test_attaches_runtime_rotation_to_the_cell_that_uses_it(self) -> None:
        first = build_surface(_surface())["cells"][0]

        self.assertEqual(first["rotation"], {"descriptor": 0x73, "center": [132, 132]})

    def test_plain_cells_do_not_claim_a_rotation(self) -> None:
        second = build_surface(_surface())["cells"][1]

        self.assertIsNone(second["rotation"])

    def test_rejects_an_unknown_ink_operation(self) -> None:
        surface = _surface()
        surface["cells"][0]["expanded"]["edges"][0]["operation"] = "magenta"

        with self.assertRaisesRegex(LabError, "unknown ink operation"):
            build_surface(surface)

    def test_skips_cells_that_were_never_expanded(self) -> None:
        surface = _surface()
        surface["cells"].append({"cell": 2, "grid": [2, 0]})

        self.assertEqual(len(build_surface(surface)["cells"]), 2)


class ObjectExportTests(unittest.TestCase):
    def test_flattens_models_to_vertex_and_edge_lists(self) -> None:
        objects = build_objects(_objects())

        self.assertEqual(objects["models"][0]["vertices"], [[-10, -100, -10], [10, -100, -10]])
        self.assertEqual(objects["models"][0]["edges"], [[0, 1]])

    def test_classifies_placement_by_room_membership(self) -> None:
        instances = build_objects(_objects())["instances"]

        self.assertEqual(instances[0]["placement"], "surface")
        self.assertEqual(instances[1]["placement"], "room")

    def test_carries_the_object_detail_rule(self) -> None:
        instances = build_objects(_objects())["instances"]

        self.assertEqual(instances[0]["visibility"]["detailCubePerAxis"], 0x010000)
        self.assertEqual(instances[0]["visibility"]["farRepresentation"], "point")

    def test_rejects_an_instance_referencing_an_unknown_model(self) -> None:
        objects = _objects()
        objects["instances"][0]["model"] = "object-model:absent"

        with self.assertRaisesRegex(LabError, "unknown model"):
            build_objects(objects)


class CaptureCountsTests(unittest.TestCase):
    def test_prefixes_each_capture_document_with_its_own_name(self) -> None:
        counts = capture_counts(
            {
                "text.json": {"counts": {"messages": 64}},
                "benson.json": {"counts": {"scripts": 51, "instructions": 494}},
            }
        )

        self.assertEqual(
            counts, {"text.messages": 64, "benson.scripts": 51, "benson.instructions": 494}
        )

    def test_reports_nothing_for_a_payload_exported_without_a_capture(self) -> None:
        self.assertEqual(capture_counts({"world.json": {"cells": []}}), {})


class PayloadOutputGuardTests(unittest.TestCase):
    def test_requires_geometry_to_be_reextracted_with_the_current_decoder(self) -> None:
        with self.assertRaisesRegex(LabError, "re-extract"):
            require_current_geometry_decoder({"decoderVersion": 1})

    def test_refuses_to_write_outside_ignored_storage(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            dataset = Path(directory) / "dataset"
            dataset.mkdir()
            with self.assertRaisesRegex(LabError, "must remain under ignored"):
                export_payload(dataset, Path(directory) / "tracked-output")

    def test_accepts_a_destination_under_work_storage(self) -> None:
        # The guard is about the destination, so a missing dataset must fail on
        # the dataset rather than on the path.
        with tempfile.TemporaryDirectory(dir=LAB_ROOT / "work") as directory:
            with self.assertRaises(LabError) as caught:
                export_payload(Path(directory) / "absent-dataset", Path(directory) / "payload")
            self.assertNotIn("must remain under ignored", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
