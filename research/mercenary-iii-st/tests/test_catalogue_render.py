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
        self.assertEqual(len(support['glyphs']), 513)
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

    def test_support_covers_full_colour_selector_and_opening_computer_glyph(self):
        support = json.loads(self.path.read_text())
        self.assertTrue(all(len(p['day']) == len(p['night']) == 64
                            for p in support['palettes'].values()))
        self.assertIn('2:01', support['glyphs'])

    def test_workspace_road_colours_are_not_copied_from_metis(self):
        support = json.loads(self.path.read_text())
        self.assertEqual(support['groups']['2']['road'], 0x322)
        self.assertEqual(support['groups']['8']['road'], 0x411)
        self.assertEqual(support['groups']['56']['road'], 0x555)
        self.assertEqual(support['groups']['2']['land'], 0x030)

    def test_live_strings_stop_at_the_first_nul_not_at_adjacent_buffers(self):
        census = REPOSITORY / 'restricted/mercenary-iii-647/runs/location-census-334983y7'
        self.assertEqual(render_support(self.catalogue, census)['tokens']['$80']['default'], [ord('G')])
