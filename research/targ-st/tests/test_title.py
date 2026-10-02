"""The Title Logo export, against the pinned disk and the tracked documents.

Skips the disk tests when the pinned STX is absent (it is Restricted Material).
"""

from __future__ import annotations

import json
import os
import unittest
from pathlib import Path

from targlab import disk, png, title

ROOTS = [Path(os.environ['TARG_ROM_ROOT'])] if 'TARG_ROM_ROOT' in os.environ else [
    disk.REPOSITORY / 'roms', Path('/Users/alex/work/mercenary/roms')]
PRESENT = any((root / disk.BASELINE['disk']['relativePath']).exists() for root in ROOTS)
TRACKED = disk.REPOSITORY / 'payload' / 'targ-st'


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
        document, image = title.extract(self.floppy)
        logo = document['logo']
        self.assertEqual((logo['x'], logo['y'], logo['width'], logo['height']), (6, 21, 304, 116))
        mark, _ = png.read(image)
        self.assertEqual(sum(map(sum, mark)), sum(row.count(3) for row in rows))

    def test_regenerates_the_tracked_documents(self):
        document, image = title.extract(self.floppy)
        tracked = json.loads((TRACKED / 'title.json').read_text())
        self.assertEqual(document['logo']['image'].pop('sha256'), disk.sha256(image))
        tracked['logo']['image'].pop('sha256')
        self.assertEqual(tracked, document)
        # The mark, not the file: compressed bytes depend on the zlib build.
        self.assertEqual(png.read((TRACKED / title.IMAGE).read_bytes()), png.read(image))


class TrackedDocuments(unittest.TestCase):
    def test_the_png_is_the_mark_the_document_hashes(self):
        logo = json.loads((TRACKED / 'title.json').read_text())['logo']
        image = (TRACKED / logo['image']['file']).read_bytes()
        self.assertEqual(disk.sha256(image), logo['image']['sha256'])
        mark, rgb = png.read(image)
        self.assertEqual((len(mark[0]), len(mark)), (logo['width'], logo['height']))
        self.assertEqual(disk.sha256(png.mark_bits(mark)), logo['image']['markSha256'])
        self.assertEqual(rgb, (255, 255, 0))


if __name__ == '__main__':
    unittest.main()
