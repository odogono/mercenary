"""Panel decoder checks against a loaded-play capture (Restricted Material).

Set M3_RAM to a loaded-play RAM image of the METIS taxi slice (for example
restricted/mercenary-iii-647/runs/<run>/v10800.ram) and, optionally,
M3_ENTRY_RAM to the game-entry image (PC $6AC32). Run from the repository root:

    PYTHONPATH=research/mercenary-iii-st python -m unittest discover research/mercenary-iii-st/tests
"""

from __future__ import annotations

import json
import os
import unittest
from pathlib import Path

from m3lab.panel import extract_panel
from m3lab.ram import Ram

RAM = os.environ.get('M3_RAM')
ENTRY = os.environ.get('M3_ENTRY_RAM')


@unittest.skipUnless(RAM, 'set M3_RAM to a loaded-play Mercenary III RAM image')
class PanelTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.panel = extract_panel(Ram.load(Path(RAM)),
                                  Ram.load(Path(ENTRY)) if ENTRY else None)

    def test_json(self):
        json.dumps(self.panel)

    def test_screen_and_art(self):
        art = self.panel['panelArt']
        self.assertEqual((art['top'], art['width'], art['height']), (136, 320, 64))
        self.assertEqual(len(art['pixels']), 64)
        self.assertTrue(all(len(row) == 320 for row in art['pixels']))
        self.assertEqual(self.panel['screen']['bases'], ['$68000', '$78000'])
        self.assertEqual(len(self.panel['palette']['rows136to151']), 16)
        if ENTRY:
            self.assertIn('DAM6', art['source'])

    def test_fonts(self):
        fonts = self.panel['fonts']
        self.assertEqual(len(fonts['panel']['glyphs']), 64)
        self.assertEqual(len(fonts['message']['glyphs']), 64)
        self.assertEqual(len(fonts['digits']['glyphs']), 13)
        self.assertEqual(len(fonts['clock']['glyphs']), 10)
        self.assertEqual(fonts['panel']['glyphs']['T'], ['11111', '00100', '00100', '00100', '00100'])
        self.assertEqual(len(fonts['message']['glyphs']['A']), 6)
        self.assertEqual(fonts['clock']['glyphs']['1'][0], '00011000')

    def test_centre(self):
        centre = self.panel['centre']
        self.assertEqual(centre['box'], {'x': 128, 'y': 160, 'width': 64, 'height': 32})
        card = centre['taxicard']
        self.assertEqual((card['category'], card['band'], card['address']), (5, 4, '$3CE48'))
        self.assertEqual(len(card['pixels']), 32)
        self.assertTrue(all(len(row) == 64 for row in card['pixels']))
        self.assertEqual(card['colours']['colour4'], 0x0760)
        self.assertEqual(card['colours']['colour1From152'], 0x0640)
        self.assertEqual(card['bands']['footer']['lines'], [26, 30])
        self.assertEqual(len(centre['logo']['pixels']), 32)
        self.assertEqual(centre['reveal']['count'], 64)

    def test_strings(self):
        strings = self.panel['strings']
        card = strings['card']
        self.assertEqual(card['outOfRange']['lines'], ['  OUT OF  ', '  RANGE   '])
        self.assertEqual(card['pressToCall']['lines'], ['PRESS * TO', '   CALL   '])
        self.assertEqual(card['selectToStart']['lines'], ['+ SELECT -', '* TO START'])
        self.assertEqual(card['busPass']['lines'], ['   BUS    ', '   PASS   '])
        self.assertEqual(strings['inventory']['name'], 'TAXICARD')
        self.assertEqual(strings['location']['name'], 'METIS')
        self.assertEqual(len(strings['roster']['names']), 30)

    def test_labels(self):
        labels = self.panel['labels']
        self.assertEqual(labels['header'], 'METIS     MOONBASE  ')
        codes = [(r['code'], r['text']) for r in labels['records']]
        self.assertEqual([c for c, _ in codes], [0x65, 0x62, 0x60, 0x02])
        self.assertIn((0x02, 'METIS     SPACEPORT '), codes)
        self.assertEqual(labels['records'][2]['address'], '$21515')

    def test_fields(self):
        fields = self.panel['fields']
        self.assertEqual(len(fields['messageBar']['cells']), 48)
        self.assertEqual(len(fields['cash']['cells']), 11)
        self.assertEqual(fields['clock']['cells'], [240, 248, 264, 272, 288, 296])
        self.assertEqual(fields['cardText']['y'], [170, 177])
        self.assertEqual(len(fields['compass']['strip']['rows']), 9)
        self.assertEqual(len(fields['pitch']['strip']['rows']), 83)


if __name__ == '__main__':
    unittest.main()
