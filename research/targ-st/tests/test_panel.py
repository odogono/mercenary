"""Recovered panel contract; disk tests use only the pinned Restricted Material."""
import json
import unittest

from targlab import disk, panel
from test_title import PRESENT, TRACKED


class Decode(unittest.TestCase):
    def test_plane_zero_is_low_bit_and_words_are_big_endian(self):
        raw = bytes.fromhex('8000400020001000') + bytes(152)
        self.assertEqual(panel.indices(raw, 1)[0][:5], [1, 2, 4, 8, 0])

    def test_rejects_extra_copy_tail(self):
        with self.assertRaises(ValueError):
            panel.indices(bytes(0x2b00), 64)


@unittest.skipUnless(PRESENT, 'pinned STX absent')
class PinnedPanel(unittest.TestCase):
    def test_visible_art_and_writer_data_are_reproducible(self):
        result = panel.extract(disk.pinned_floppy())
        self.assertEqual(result['art']['length'], 10240)
        self.assertEqual(result['art']['planarSha256'],
                         '1d18eb35125356ad2d6fc488fe5ed8e823eded5d0757dd9e2355315a8fff94be')
        self.assertEqual(result['art']['indicesSha256'],
                         '475012e3da3ee53d4b568dbfa21983f10e322249f6e409d5124193b38091279e')
        self.assertEqual(result, json.loads((TRACKED / 'panel.json').read_text()))
        self.assertEqual(len(result['pitch']['rows']), 608)
        self.assertEqual(len(result['compass']['frames']), 576)
        self.assertEqual(len(result['fonts']['message']['glyphs']['A']), 7)
        self.assertEqual(len(result['fonts']['number']['glyphs']['0']), 5)

    def test_refuses_changed_writer_path(self):
        floppy = disk.pinned_floppy()
        code = bytearray(floppy.read('E1'))
        code[0x3828] ^= 1
        with self.assertRaises(ValueError):
            panel.check_code(bytes(code))


@unittest.skipUnless((disk.REPOSITORY / 'restricted/targ-st-panel-742/arrival.ram').exists(),
                     'Restricted #742 captures absent')
class ArtworkCaptures(unittest.TestCase):
    def test_pristine_copy_and_both_arrival_static_regions(self):
        base = disk.REPOSITORY / 'restricted/targ-st-panel-742'
        source = disk.pinned_floppy().read('M')
        pristine = (base / 'pristine.ram').read_bytes()
        self.assertEqual(pristine[0x6d500:0x70000], source[:0x2b00])
        art = panel.indices(source[:0x2800])
        arrival = (base / 'arrival.ram').read_bytes()
        boxes = [(12, 8, 36, 50), (48, 8, 260, 23), (268, 8, 312, 50), (60, 35, 252, 49)]
        static = [(x, y) for y in range(64) for x in range(320)
                  if not any(l <= x < r and t <= y < b for l, t, r, b in boxes)]
        self.assertEqual(len(static), 11756)
        for address in [0x6d500, 0x7d500]:
            actual = panel.indices(arrival[address:address + 0x2800])
            self.assertTrue(all(actual[y][x] == art[y][x] for x, y in static))


if __name__ == '__main__':
    unittest.main()
