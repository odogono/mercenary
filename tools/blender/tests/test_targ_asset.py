"""The `assets/targ/` file rules in targ_asset.py. Plain unittest; web/test/blender-roundtrip.test.ts
runs it inside Blender's Python, so CI needs no Python of its own."""

import copy
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from mercenary_geometry import contract as C  # noqa: E402
from mercenary_geometry import targ_asset as T  # noqa: E402


def errors(relative, value):
    return [d.message for d in T.check_file(relative, value) if d.severity == "error"]


class TargAssetFiles(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp()
        self.object = T.new_authored("objects", "beacon", self.root)
        self.structure = T.new_authored("structures", "tower", self.root)

    def read(self, relative):
        import json

        with open(T.absolute_path(relative, self.root), encoding="utf-8") as handle:
            return json.load(handle)

    def relinked(self, value):
        value["asset"]["sidecarSha256"] = C.sidecar_sha256(value["sidecar"])
        return value

    def test_a_new_authored_asset_needs_only_its_placements(self):
        self.assertEqual(self.object, "objects/authored-beacon.json")
        for relative in (self.object, self.structure):
            diagnostics = T.check_file(relative, self.read(relative))
            self.assertEqual([(d.severity, d.site) for d in diagnostics], [("warning", "sidecar.placements")])

    def test_a_new_authored_asset_never_overwrites(self):
        with self.assertRaises(C.Rejected):
            T.new_authored("objects", "beacon", self.root)

    def test_a_slug_is_lowercase_and_hyphenated(self):
        for slug in ("Beacon", "radio_mast", "-mast", ""):
            with self.assertRaises(C.Rejected, msg=slug):
                T.new_authored("objects", slug, self.root)

    def test_the_folder_decides_the_family(self):
        value = self.read(self.object)
        self.assertIn("a structures sidecar's family is targ-surface-cell", errors("structures/authored-beacon.json", value))

    def test_the_identity_decides_the_file_name(self):
        self.assertIn("authored:beacon is stored as authored-beacon.json", errors("objects/beacon.json", self.read(self.object)))
        self.assertEqual(T.asset_file_name("targ:object:model:1700"), "object-model-1700.json")

    def test_geometry_is_linked_to_its_sidecar(self):
        value = self.read(self.object)
        value["sidecar"]["record"]["note"] = "edited by hand"
        self.assertIn("geometry is linked to a different sidecar; re-export it", errors(self.object, value))
        self.assertEqual(errors(self.object, self.relinked(value)), [])

    def test_an_authored_asset_has_no_baseline(self):
        value = self.read(self.object)
        value["ledger"]["baseline"] = "0" * 64
        self.assertIn("an Authored Asset has no Recovered Baseline", errors(self.object, value))

    def test_an_edit_keeps_its_payload_placement(self):
        value = self.read(self.object)
        for key, identity in (("asset", "targ:beacon"), ("sidecar", "targ:beacon")):
            value[key]["asset"] = identity
        del value["sidecar"]["placements"]
        self.relinked(value)
        self.assertIn("an edit names the Recovered Baseline its ledger reviewed", errors("objects/beacon.json", value))
        value["ledger"]["baseline"] = "0" * 64
        self.assertEqual(errors("objects/beacon.json", value), [])
        value["sidecar"]["placements"] = []
        self.assertIn("an edit keeps its payload placement; only Authored Assets place", errors("objects/beacon.json", self.relinked(value)))

    def test_only_a_structure_has_a_reach_or_a_distant_part(self):
        value = self.read(self.object)
        value["sidecar"]["reach"] = "cell"
        self.assertIn("only a structure has a Structure Reach", errors(self.object, self.relinked(value)))
        value = self.read(self.object)
        value["asset"]["parts"].append({**T.wireframe("none"), "id": "distant", "role": "distant"})
        self.assertIn("a Targ object has only its wireframe part", errors(self.object, value))
        value = self.read(self.structure)
        value["sidecar"]["reach"] = "far"
        self.assertIn('reach is "all" or "cell"', errors(self.structure, self.relinked(value)))

    def test_an_export_replaces_only_the_geometry(self):
        value = self.read(self.object)
        value["sidecar"]["placements"] = [{"slot": 1}]
        value["ledger"]["changes"] = [{"element": "wireframe", "note": "drawn", "provenance": "creative"}]
        T.write(self.object, value, self.root)
        part = copy.deepcopy(T.wireframe("none"))
        part["vertices"] = [{"co": [0, 0, 0], "id": 0}, {"co": [0, 512, 0], "id": 1}]
        part["lines"] = [{"ends": [0, 1], "id": 0}]
        written, diagnostics = T.with_parts(self.object, [part], "authored:beacon", self.root)
        self.assertEqual(diagnostics, [])
        self.assertEqual(written["sidecar"], value["sidecar"])
        self.assertEqual(written["ledger"], value["ledger"])
        self.assertEqual(written["asset"]["parts"], [part])
        self.assertEqual(written["asset"]["sidecarSha256"], C.sidecar_sha256(value["sidecar"]))

    def test_an_object_mixes_fixed_colours_with_uncoloured_primitives(self):
        value = self.read(self.object)
        part = value["asset"]["parts"][0]
        self.assertEqual(part["colourModel"], "palette")
        part["vertices"] = [{"co": [0, 0, 0], "id": 0}, {"co": [0, 512, 0], "id": 1}, {"co": [512, 0, 0], "id": 2}]
        part["lines"] = [{"colour": {"colour": "#ff0000", "kind": "palette"}, "ends": [0, 1], "id": 0}, {"ends": [1, 2], "id": 1}]
        part["faces"] = [{"id": 0, "loop": [0, 1, 2]}]
        self.assertEqual(errors(self.object, value), [])
        part["colourModel"] = "none"
        self.assertIn("this part carries no colours", errors(self.object, value))

    def test_a_fixed_colour_keys_without_a_colour_word(self):
        colour = {"colour": "#ff0000", "kind": "palette"}
        self.assertEqual(C.colour_from_key(C.colour_key(colour)), colour)
        self.assertFalse(C.colour_optional("damocles", "palette"))
        self.assertFalse(C.colour_optional("targ", "ink"))

    def test_an_export_refuses_a_file_that_now_holds_another_asset(self):
        with self.assertRaises(C.Rejected):
            T.with_parts(self.object, [], "authored:tower", self.root)

    def test_a_file_outside_assets_targ_is_refused(self):
        with self.assertRaises(C.Rejected):
            T.relative_path(os.path.join(self.root, "payload", "objects.json"), self.root)
        self.assertEqual(T.relative_path(T.absolute_path(self.structure, self.root), self.root), self.structure)


if __name__ == "__main__":
    unittest.main()
