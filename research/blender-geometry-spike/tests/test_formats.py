"""The add-on's format writers against the committed goldens, in plain Python (no Blender).

    python3 -m unittest discover -s tests      (from research/blender-geometry-spike)

The goldens were written by these writers inside Blender and are read by the TypeScript readers
in web/test/geometry-spike.test.ts, so together the two suites pin both ends of each format.
"""

import json
import os
import sys
import unittest

SPIKE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, SPIKE)

from mercenary_geometry import contract, glb, mgeo  # noqa: E402

GOLDEN = os.path.join(SPIKE, "evidence", "golden")
SLUGS = ["damocles-object-03f774", "damocles-atropos-ground-02064a-00", "targ-surface-cell-1"]


def read(name):
    with open(os.path.join(GOLDEN, name), "rb") as handle:
        return handle.read()


class Formats(unittest.TestCase):
    def test_writers_reproduce_the_goldens_byte_for_byte(self):
        for slug in SLUGS:
            with self.subTest(slug):
                asset = mgeo.decode(read(f"{slug}.mgeo"))
                self.assertEqual(mgeo.encode(asset), read(f"{slug}.mgeo"))
                self.assertEqual(glb.encode(asset), read(f"{slug}.glb"))

    def test_both_candidates_carry_the_same_contract(self):
        for slug in SLUGS:
            with self.subTest(slug):
                self.assertEqual(
                    contract.canonical_json(mgeo.decode(read(f"{slug}.mgeo"))),
                    contract.canonical_json(glb.decode(read(f"{slug}.glb"))),
                )

    def test_canonical_json_matches_typescript(self):
        # The TypeScript baseline hashed its canonical sidecar into the geometry; Python must agree.
        for slug in SLUGS:
            with self.subTest(slug):
                sidecar = json.loads(read(f"{slug}.sidecar.json"))
                self.assertEqual(contract.sidecar_sha256(sidecar), mgeo.decode(read(f"{slug}.mgeo"))["sidecarSha256"])

    def test_malformed_files_are_refused(self):
        data = read("damocles-object-03f774.mgeo")
        for broken, message in [(data[:-3], "truncated"), (data + b"\0", "trailing"), (b"glTF" + data[4:], "not an MGEO")]:
            with self.subTest(message), self.assertRaises(contract.Rejected) as caught:
                mgeo.decode(broken)
            self.assertIn(message, str(caught.exception.diagnostics[0]))
        document, binary = glb.parse(read("damocles-object-03f774.glb"))
        del document["extensions"]
        text = json.dumps(document).encode()
        text += b" " * (-len(text) % 4)
        stripped = b"glTF" + (2).to_bytes(4, "little") + (28 + len(text) + len(binary)).to_bytes(4, "little")
        stripped += len(text).to_bytes(4, "little") + b"JSON" + text + len(binary).to_bytes(4, "little") + b"BIN\0" + binary
        with self.assertRaises(contract.Rejected) as caught:
            glb.decode(stripped)
        self.assertIn("polygon boundaries", str(caught.exception.diagnostics[0]))

    def test_broken_references_are_actionable(self):
        asset = mgeo.decode(read("damocles-object-03f774.mgeo"))
        sidecar = json.loads(read("damocles-object-03f774.sidecar.json"))
        sidecar["references"] = [
            {"baselineResolved": True, "id": 0, "site": "demo.queue[0]", "target": {"kind": "record", "part": "variant:record", "record": 7}}
        ]
        errors = [d for d in contract.check_asset(asset, sidecar) if d.severity == "error"]
        self.assertEqual([d.site for d in errors], ["demo.queue[0]"])
        self.assertIn("remap ref 0", errors[0].message)


if __name__ == "__main__":
    unittest.main()
