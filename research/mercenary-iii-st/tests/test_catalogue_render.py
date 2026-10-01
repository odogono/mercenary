"""Catalogue render support is deterministic and independent of playable content."""
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from m3lab.boot import REPOSITORY
from m3lab.catalogue_render import render_support

class CatalogueRenderTests(unittest.TestCase):
    def setUp(self):
        self.path = REPOSITORY / 'payload/dion/catalogue/render-support.json'
        self.catalogue = json.loads((self.path.parent / 'catalogue.json').read_text())

    def test_tracked_support_uses_the_catalogue_capture_and_all_body_palettes(self):
        support = json.loads(self.path.read_text())
        self.assertEqual(support['source'], self.catalogue['source'])
        self.assertEqual(set(support['bodies']), {b['id'] for b in self.catalogue['bodies']})
        self.assertEqual(len(support['glyphs']), 512)
        self.assertEqual(len(support['rotationTable']['words']), 320)
        self.assertEqual(support['bodies']['body-15']['land'], 0x411)

    def test_refuses_a_foreign_capture_before_reading_tables(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            (path / 'start.ram').write_bytes(bytes(0x100000))
            with self.assertRaisesRegex(ValueError, 'differs from Catalogue source'):
                render_support(self.catalogue, path)

    def test_support_regenerates_without_changing_playable_documents(self):
        census = REPOSITORY / 'restricted/mercenary-iii-647/runs/location-census-334983y7'
        if not (census / 'start.ram').exists():
            self.skipTest('census unavailable; browser admission tests validate tracked support')
        playable = {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                    for p in (REPOSITORY / 'payload/dion').glob('*.json')}
        first = render_support(self.catalogue, census)
        self.assertEqual(first, render_support(self.catalogue, census))
        self.assertEqual(first, json.loads(self.path.read_text()))
        self.assertEqual(playable, {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                                   for p in (REPOSITORY / 'payload/dion').glob('*.json')})
