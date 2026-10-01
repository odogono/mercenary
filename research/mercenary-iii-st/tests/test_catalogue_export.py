"""Integration tests use the recovery handoff; payload checks need no original media."""
import copy
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from m3lab.boot import REPOSITORY
from m3lab.catalogue_export import build_export, write_export


class CatalogueExportTests(unittest.TestCase):
    def setUp(self):
        self.ledger = REPOSITORY / 'research/mercenary-iii-st/catalogue-ledger.json'
        self.inputs = [REPOSITORY / f'restricted/mercenary-iii-{n}/{name}.json'
                       for n, name in [(681, 'objects'), (682, 'surface'), (683, 'interiors')]]
        if not all(p.exists() for p in self.inputs):
            self.skipTest('recovery handoff unavailable; browser tests validate the tracked export')
        self.recoveries = [json.loads(p.read_text()) for p in self.inputs]

    def build(self):
        return build_export(self.ledger, *self.recoveries)

    def test_full_export_and_repeatable_regeneration_leave_playable_payload_unchanged(self):
        playable = {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                    for p in (REPOSITORY / 'payload/dion').glob('*.json')}
        document, geometry = self.build()
        self.assertEqual(len(geometry), 529)
        self.assertEqual(len(document['objects']), 246)
        self.assertEqual(len(document['placements']), 795)
        self.assertEqual(len(document['areas']), 57)
        self.assertEqual(len(document['structures']), 198)
        self.assertEqual(document['field']['physicalCount'], None)
        self.assertEqual([s['id'] for s in document['constructions']['states']], ['initial', 'constructed'])
        object1 = document['objects'][0]
        host = next(p for p in document['placements'] if p['id'] == object1['host']['placement'])
        self.assertEqual(host['body'], object1['body'])
        self.assertEqual(host['bodyCell'], object1['bodyCell'])
        upper = document['objects'][29]
        self.assertGreater(upper['floor'], 0)
        self.assertIsNone(document['objects'][103]['position'])
        self.assertEqual(document['objects'][100]['host'], {'field': 'midas', 'cell': 105})
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'catalogue'
            write_export(output, document, geometry)
            first = {str(p.relative_to(output)): p.read_bytes() for p in output.rglob('*.json')}
            write_export(output, *self.build())
            self.assertEqual(first, {str(p.relative_to(output)): p.read_bytes() for p in output.rglob('*.json')})
            tracked = REPOSITORY / 'payload/dion/catalogue'
            self.assertEqual(first, {str(p.relative_to(tracked)): p.read_bytes() for p in tracked.rglob('*.json')})
        self.assertEqual(playable, {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                                   for p in (REPOSITORY / 'payload/dion').glob('*.json')})

    def test_missing_corrupt_and_mixed_recovery_records_are_refused(self):
        original = copy.deepcopy(self.recoveries)
        key = next(iter(self.recoveries[0]['geometry']))
        del self.recoveries[0]['geometry'][key]
        with self.assertRaisesRegex(ValueError, key):
            self.build()
        self.recoveries = copy.deepcopy(original)
        self.recoveries[0]['geometry'][key]['name'] = 'corrupt'
        with self.assertRaisesRegex(ValueError, key):
            self.build()
        self.recoveries = copy.deepcopy(original)
        self.recoveries[2]['source']['title'] = 'damocles'
        with self.assertRaisesRegex(ValueError, 'source'):
            self.build()
