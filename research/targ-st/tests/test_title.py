"""The Title Logo export, against the pinned disk and the tracked document.

Skips when the pinned STX is absent (it is Restricted Material).
"""

from __future__ import annotations

import json
import os
import unittest
from pathlib import Path

from targlab import disk, title

ROOTS = [Path(os.environ['TARG_ROM_ROOT'])] if 'TARG_ROM_ROOT' in os.environ else [
    disk.REPOSITORY / 'roms', Path('/Users/alex/work/mercenary/roms')]
PRESENT = any((root / disk.BASELINE['disk']['relativePath']).exists() for root in ROOTS)
TRACKED = disk.REPOSITORY / 'payload' / 'targ-st' / 'title.json'


@unittest.skipUnless(PRESENT, 'pinned Escape from Targ STX not present')
class PinnedDisk(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.floppy = disk.pinned_floppy()

    def test_lists_both_loaders_and_their_hidden_files(self):
        names = {entry.name: entry for entry in self.floppy.entries()}
        self.assertEqual(names['ESCAPE.PRG'].size, 652)
        self.assertEqual(names['SECOND.PRG'].size, 652)
        self.assertEqual(names['E0'].size, 32128)
        self.assertEqual(names['E0'].attributes, 0x02)

    def test_loader_shows_e0_with_its_header_palette(self):
        picture, loader = self.floppy.read('E0'), self.floppy.read('ESCAPE.PRG')
        self.assertEqual(len(title.check_loader(loader, picture)), len(title.LOADER_FACTS))

    def test_logo_is_the_whole_colour_3_layer(self):
        rows = title.indices(self.floppy.read('E0'))
        logo = title.extract(self.floppy)['logo']
        self.assertEqual((logo['x'], logo['y'], logo['width'], logo['height']), (6, 21, 304, 116))
        inside = sum(row.count('3') for row in logo['pixels'])
        self.assertEqual(inside, sum(row.count(3) for row in rows))

    def test_regenerates_the_tracked_document(self):
        self.assertEqual(json.loads(TRACKED.read_text()), title.extract(self.floppy))


class TrackedDocument(unittest.TestCase):
    def test_rows_match_the_declared_box(self):
        logo = json.loads(TRACKED.read_text())['logo']
        self.assertEqual(len(logo['pixels']), logo['height'])
        for row in logo['pixels']:
            self.assertEqual(len(row), logo['width'])
            self.assertLessEqual(set(row), {'0', '3'})


if __name__ == '__main__':
    unittest.main()
