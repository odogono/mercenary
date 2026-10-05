"""Synthetic boundary/provenance controls; no natural-route claims."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

from m3lab.ram import Ram

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/object-interaction-r3-frontier.py'
spec = importlib.util.spec_from_file_location('r3_frontier', SCRIPT)
frontier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(frontier)


class FrontierTests(unittest.TestCase):
    def ram(self, values):
        raw = bytearray(0x100000)
        for address, width, value in values:
            raw[address:address+width] = value.to_bytes(width, 'big')
        return Ram(bytes(raw), 'synthetic-frontier-control')

    def test_scan_includes_zero_but_not_void_or_physical_sentinel(self):
        rows = frontier.scan_rows(self.ram([(0x72AA, 4, 116)]))
        self.assertEqual([r['bodyOffset'] for r in rows if r['scanned']], list(range(0, 120, 4)))
        self.assertEqual([r['bodyOffset'] for r in rows if r['initialEntryCandidate']], list(range(4, 120, 4)))
        self.assertFalse(rows[30]['scanned'])
        self.assertFalse(rows[0]['initialEntryCandidate'])

    def test_negative_y_is_a_scan_gate_and_long_endpoint_is_not_word(self):
        rows = frontier.scan_rows(self.ram([(0x72AA, 4, 116), (0x56DA+24, 4, 0xFFFFFFFF)]))
        self.assertFalse(rows[6]['initialEntryCandidate'])
        for endpoint in (124, 116 << 16):
            with self.subTest(endpoint=endpoint), self.assertRaisesRegex(ValueError, 'endpoint'):
                frontier.scan_rows(self.ram([(0x72AA, 4, endpoint)]))

    def test_script_held_bit_does_not_replace_residence_or_stack_membership(self):
        r = self.ram([(0x64B6, 1, 128), (0x68B4, 4, 0x3C010026)])
        record = frontier.resident_record(r, 38, [104, 103, 135])
        self.assertTrue(record['held'])
        self.assertFalse(record['inStack'])
        self.assertEqual(record['residenceBytes'], [60, 1, 0, 38])
        self.assertEqual(record['initialRole'], 'structure')

    def test_foreign_mutable_seed_is_refused_before_catalogue_access(self):
        with self.assertRaisesRegex(ValueError, 'coherent'):
            frontier.build(self.ram([]), Path('/missing-catalogue'))

    def test_geometry_identity_and_raw_provenance_must_both_match(self):
        r = self.ram([(0x100, 1, 42)])
        geometry = {'id': 'model-test', 'record': '$00100', 'variants': {'default': {'range': 42, 'sha256': 'semantic-record-hash'}},
                    'provenance': [r.slice(0x100, 0x101)]}
        geometry['sha256'] = frontier.digest(geometry)
        doc = {'source': {'programSha256': frontier.PROGRAM, 'openingRamSha256': 'independent'},
               'geometry': geometry}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'model-test.json'
            path.write_text(json.dumps(doc))
            row = frontier.geometry_reference(r, path, 'model-test')
            self.assertEqual(row['catalogueSource']['openingRamSha256'], 'independent')
            self.assertEqual(row['disposition'], 'reference-candidate-only')
            with self.assertRaisesRegex(ValueError, 'documented'):
                frontier.geometry_reference(self.ram([]), path, 'model-test')
            with self.assertRaisesRegex(ValueError, 'identity'):
                frontier.geometry_reference(r, path, 'model-foreign')
            doc['geometry']['variants']['default'] = {'changed': True}
            path.write_text(json.dumps(doc))
            with self.assertRaisesRegex(ValueError, 'record'):
                frontier.geometry_reference(r, path, 'model-test')


if __name__ == '__main__':
    unittest.main()
