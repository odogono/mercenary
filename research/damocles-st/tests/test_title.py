import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from damocleslab import png  # noqa: E402
from damocleslab.title import (  # noqa: E402
    HEIGHT,
    IMAGE,
    LOGO_SEED,
    WIDTH,
    decrypt_directory,
    decrypt_file,
    directory_entry,
    extract,
    lettering,
    read_file,
    sha256,
)

REPOSITORY = Path(__file__).resolve().parents[3]
STX = REPOSITORY / 'roms/atarist/damocles_-_mercenary_ii_novagen_software_(uk).stx'
PAYLOAD = REPOSITORY / 'payload/damocles/title.json'


def track(number: int, data: bytes) -> dict:
    """A raw track image as the loader expects it: gap, sync, header, then data bytes."""
    image = b'\x4e' * 12 + b'\xa1\xa1\xa1' + bytes([0x0F, number, 0x0F, 0x44, 0x0F]) + data
    return {'image': image.ljust(6400, b'\x4e'), 'sectors': {}}


class KeystreamTests(unittest.TestCase):
    def test_both_keystreams_are_their_own_inverse(self):
        block = bytes(range(256)) * 4
        self.assertEqual(decrypt_directory(decrypt_directory(block)), block)
        self.assertEqual(decrypt_file(decrypt_file(block)), block)


class DirectoryTests(unittest.TestCase):
    def test_an_entry_unpacks_into_track_offset_and_length(self):
        # The ETITLE entry as the decrypted directory holds it at $68AB4.
        entry = bytes.fromhex('455449544c4520204e454f40032c182d')
        self.assertEqual(
            directory_entry(entry),
            {'name': 'ETITLE  NEO', 'track': 3, 'offset': 4141, 'length': 13500},
        )


class TrackReadTests(unittest.TestCase):
    def test_an_escape_stores_the_next_byte_inverted_across_a_track_boundary(self):
        first = bytes([1, 2, 0x0F, 0x0A]) + bytes(6140 - 1) + b'\x0f'
        second = bytes([0xF0, 9])
        tracks = {(7, 0): track(7, first), (8, 0): track(8, second)}
        data, read = read_file(tracks, {'track': 7, 'offset': 1, 'length': 6143})
        self.assertEqual(read, [7, 8])
        self.assertEqual(data[:2], bytes([2, 0xF5]))
        self.assertEqual(data[-2:], bytes([0x0F, 9]))

    def test_a_track_without_the_loader_header_is_refused(self):
        tracks = {(7, 0): track(6, b'\0' * 6144)}
        with self.assertRaisesRegex(ValueError, 'loader header'):
            read_file(tracks, {'track': 7, 'offset': 0, 'length': 4})


class LetteringTests(unittest.TestCase):
    def test_a_star_beside_the_lettering_is_left_out(self):
        pixels = [[0] * WIDTH for _ in range(HEIGHT)]
        x, y = LOGO_SEED
        for dx in range(5):
            pixels[y][x + dx] = 15
        pixels[y + 1][x + 5] = 12  # touches diagonally
        pixels[y][x + 8] = 15  # a star two pixels clear
        found = lettering(pixels)
        self.assertIn((x + 5, y + 1), found)
        self.assertNotIn((x + 8, y), found)


class PngTests(unittest.TestCase):
    def test_a_mark_survives_the_round_trip_with_its_palette(self):
        rows = [[0, 1, 15], [9, 0, 2]]
        palette = [(i * 16, i * 8, i) for i in range(16)]
        self.assertEqual(png.read(png.write(rows, palette)), (rows, palette))
        self.assertEqual(png.mark_nibbles(rows), bytes([0x01, 0xF0, 0x90, 0x20]))


class TrackedLogoTests(unittest.TestCase):
    def test_the_png_is_the_mark_the_document_hashes(self):
        image = (PAYLOAD.parent / IMAGE).read_bytes()
        logo = json.loads(PAYLOAD.read_text())['logo']
        self.assertEqual(sha256(image), logo['image']['sha256'])
        rows, _ = png.read(image)
        self.assertEqual((len(rows[0]), len(rows)), (logo['width'], logo['height']))
        self.assertEqual(sha256(png.mark_nibbles(rows)), logo['image']['markSha256'])


class WorkingAuthorityTests(unittest.TestCase):
    def test_the_payload_is_reproduced_from_the_stx(self):
        if not STX.exists():
            self.skipTest('Working-Authority STX is Restricted Material')
        document, image = extract(STX.read_bytes())
        tracked = json.loads(PAYLOAD.read_text())
        # The compressed bytes depend on the zlib build; the indices and palette do not.
        self.assertEqual(document['logo']['image'].pop('sha256'), sha256(image))
        tracked['logo']['image'].pop('sha256')
        self.assertEqual(document, tracked)
        self.assertEqual(png.read((PAYLOAD.parent / IMAGE).read_bytes()), png.read(image))
        logo = document['logo']
        self.assertEqual((logo['x'], logo['y'], logo['width'], logo['height']),
                         (16, 0, 284, 43))
        self.assertEqual(document['disk']['file']['tracks'], [3, 4, 5])


if __name__ == '__main__':
    unittest.main()
