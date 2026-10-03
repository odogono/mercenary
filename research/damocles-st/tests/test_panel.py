import hashlib
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from damocleslab.panel import (  # noqa: E402
    ROWS,
    STRIP,
    WRITER,
    WRITER_CODE,
    extract,
    extract_panel,
    nibble_rows,
    compare_attitude,
)

REPOSITORY = Path(__file__).resolve().parents[3]
PINNED = (Path(__file__).resolve().parents[1] / 'work'
          / 'observe-first-world-20260818T101013Z-c5a32b7d' / 'observed.ram')
PINNED_SHA256 = 'b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967'
STX = REPOSITORY / 'roms/atarist/damocles_-_mercenary_ii_novagen_software_(uk).stx'


def image(strip: bytes) -> bytearray:
    data = bytearray(0x10_0000)
    data[WRITER:WRITER + len(WRITER_CODE)] = WRITER_CODE
    data[STRIP:STRIP + len(strip)] = strip
    return data


class PitchStripTests(unittest.TestCase):
    def test_each_row_is_the_plane_1_word_then_the_plane_3_word(self):
        strip = bytes(i & 0xFF for i in range(ROWS * 4))
        rows = extract(bytes(image(strip)), {})['pitch']['rows']
        self.assertEqual(len(rows), 83)
        self.assertEqual(rows[0], [format(0x0001, '016b'), format(0x0203, '016b')])
        self.assertEqual(rows[82][1], format(0x4A4B, '016b'))

    def test_another_writer_is_refused(self):
        data = image(b'')
        data[WRITER] ^= 0xFF
        with self.assertRaisesRegex(ValueError, 'not the recovered routine'):
            extract(bytes(data), {})

    def test_the_payload_matches_the_pinned_run(self):
        if not PINNED.is_file():
            self.skipTest('the first-world capture lives in the ignored research workspace')
        data = PINNED.read_bytes()
        self.assertEqual(hashlib.sha256(data).hexdigest(), PINNED_SHA256)
        payload = json.loads((REPOSITORY / 'payload/damocles/panel.json').read_text())
        self.assertEqual(extract(data, payload['source'])['pitch'], payload['pitch'])

    def test_the_strip_is_the_one_mercenary_iii_draws(self):
        damocles = json.loads((REPOSITORY / 'payload/damocles/panel.json').read_text())
        dion = json.loads((REPOSITORY / 'payload/dion/panel.json').read_text())
        self.assertEqual(damocles['pitch']['rows'], dion['fields']['pitch']['strip']['rows'])


class CompletePanelTests(unittest.TestCase):
    def test_interleaved_planes_decode_to_palette_indices_left_to_right(self):
        self.assertEqual(nibble_rows(bytes.fromhex('8000400020001000'), 1),
                         ['1248' + '0' * 12])

    def test_the_tracked_art_is_pristine_and_the_compass_has_64_native_frames(self):
        payload = json.loads((REPOSITORY / 'payload/damocles/panel.json').read_text())
        self.assertEqual((payload['panelArt']['width'], payload['panelArt']['height']), (320, 64))
        self.assertEqual(payload['panelArt']['provenance']['sha256'],
                         'd90473c1442e98ab086c5573c1e34ed738dfbaa813fe0a0f83d88fd0c61928e6')
        frames = payload['compass']['frames']
        self.assertEqual(len(frames), 64)
        self.assertTrue(all(len(frame) == 9 and all(len(row) == 40 for row in frame)
                            for frame in frames))
        native = bytes(byte for frame in payload['compass']['frameWords'] for row in frame
                       for word in row for byte in word.to_bytes(2, 'big'))
        self.assertEqual(len(native), 64 * 54)
        self.assertEqual(hashlib.sha256(native).hexdigest(),
                         'd8af9950d7fedda5030ec8752192bd167c47a51c5d65053f0e7ad122ac319e54')
        dion = json.loads((REPOSITORY / 'payload/dion/panel.json').read_text())
        strip = dion['fields']['compass']['strip']['rows']
        for heading in range(1024):
            n = (-heading & 0x3F0) >> 4
            m = (-(heading + 0x70) & 0x3F0) >> 4
            for y in range(9):
                self.assertEqual(frames[n][y], '111111' + strip[y][m + 7:m + 39] + '11')

    def test_regeneration_is_byte_identical_and_keeps_the_pitch_contract(self):
        if not STX.is_file() or not PINNED.is_file():
            self.skipTest('pinned STX and RAM are Restricted Material')
        from damocleslab.panel import document_source, dumps
        original = (REPOSITORY / 'payload/damocles/panel.json').read_text()
        payload = json.loads(original)
        ram, stx = PINNED.read_bytes(), STX.read_bytes()
        source = document_source(ram, PINNED.parent.name, hashlib.sha256(stx).hexdigest())
        regenerated = extract_panel(stx, ram, source)
        self.assertEqual(dumps(regenerated), original)
        self.assertEqual(regenerated['pitch'], extract(ram, source)['pitch'])
        self.assertNotEqual(regenerated['panelArt']['pixels'], nibble_rows(ram[0x6D500:0x6FD00], 20))

    def test_wrong_media_and_changed_pinned_ram_are_rejected(self):
        if not STX.is_file() or not PINNED.is_file():
            self.skipTest('pinned STX and RAM are Restricted Material')
        ram, stx = PINNED.read_bytes(), STX.read_bytes()
        with self.assertRaisesRegex(ValueError, 'pinned Working Authority'):
            extract_panel(stx[:-1], ram, {})
        damaged = bytearray(ram)
        damaged[0x6D500] ^= 1
        with self.assertRaisesRegex(ValueError, 'pinned first-world RAM'):
            extract_panel(stx, bytes(damaged), {})

    def test_both_captured_buffers_match_including_non_level_pitch(self):
        from damocleslab.catalogue import hatari_memstate_ram
        payload = json.loads((REPOSITORY / 'payload/damocles/panel.json').read_text())
        captures = [
            ('eris-spaceport-onfoot', '1366881c62ab9e80a5fe8b1dcbb5dfa2ccc0142e4a921cd029f9dfc8f6b16465', 31),
            ('boarded-limo', '2e1218cfcd7554520de5f0f56588a9920d976d8efa4b4c97508058e76759b224', 31),
            ('dion-north-airborne', 'faf7a4acb3c7d4bec435bea716ba5626389338b0522bf399e20d11896a8197cc', 37),
        ]
        for name, digest, start in captures:
            with self.subTest(capture=name):
                path = PINNED.parents[1].parent / 'snapshots' / (name + '.sav')
                if not path.is_file():
                    self.skipTest('Hatari captures are Restricted Material')
                ram = hatari_memstate_ram(path.read_bytes())
                self.assertEqual(hashlib.sha256(ram).hexdigest(), digest)
                result = compare_attitude(payload, ram)
                self.assertEqual(result['pitchStart'], start)
                self.assertEqual(result['buffers'], [
                    {'base': '$68000', 'pitch': True, 'compass': True},
                    {'base': '$78000', 'pitch': True, 'compass': True},
                ])
                damaged = bytearray(ram)
                damaged[0x6F1EE] ^= 1
                self.assertFalse(compare_attitude(payload, bytes(damaged))['buffers'][0]['compass'])

    def test_native_fonts_and_field_geometry_reproduce_captured_readouts(self):
        from damocleslab.catalogue import hatari_memstate_ram
        payload = json.loads((REPOSITORY / 'payload/damocles/panel.json').read_text())
        self.assertEqual(set(payload['fonts']), {'panel', 'message', 'digits', 'cardDigits', 'clock'})
        captures = [
            ('eris-spaceport-onfoot', '+000000000', '000000', '022303'),
            ('boarded-limo', '+000000000', '000000', '022132'),
            ('dion-north-airborne', '+000000039', '000668', '015636'),
        ]
        for name, speed, altitude, clock in captures:
            path = PINNED.parents[1].parent / 'snapshots' / (name + '.sav')
            if not path.is_file():
                self.skipTest('Hatari captures are Restricted Material')
            ram = hatari_memstate_ram(path.read_bytes())
            for base in (0x68000, 0x78000):
                with self.subTest(capture=name, buffer=hex(base)):
                    pixels = nibble_rows(ram[base + 136 * 160:base + 200 * 160], 20)
                    for field_name, chars in (('speed', speed), ('altitude', altitude), ('clock', clock)):
                        field = payload['fields'][field_name]
                        font = payload['fonts'][field['font']]
                        for x, char in zip(field['cells'], chars):
                            code = {'+': '11', '-': '12'}.get(char, char)
                            for y, row in enumerate(font['glyphs'][code]):
                                for dx, ink in enumerate(row):
                                    colour = int(pixels[field['y'] - 136 + y][x + dx], 16)
                                    for plane in field.get('planes', [field.get('plane')]):
                                        self.assertEqual((colour >> plane) & 1, 1 - int(ink))

    def test_every_disk_slice_carries_a_matching_range_and_hash(self):
        if not STX.is_file():
            self.skipTest('Working-Authority STX is Restricted Material')
        from damocleslab.title import stx_tracks, directory, read_file, decrypt_file, unpack
        tracks = stx_tracks(STX.read_bytes())
        files = {entry['name'].strip(): unpack(decrypt_file(read_file(tracks, entry)[0]))
                 for entry in directory(tracks)[1] if entry['name'].strip() in ('DAM0', 'DAM1')}
        payload = json.loads((REPOSITORY / 'payload/damocles/panel.json').read_text())
        checked = 0

        def check(value):
            nonlocal checked
            if isinstance(value, list):
                for item in value:
                    check(item)
            elif isinstance(value, dict):
                if 'file' in value and 'offsetRange' in value:
                    lo, hi = [int(at[1:], 16) for at in value['offsetRange']]
                    data = files[value['file']][lo:hi]
                    self.assertEqual(len(data), hi - lo)
                    self.assertEqual(hashlib.sha256(data).hexdigest(), value['sha256'])
                    checked += 1
                for item in value.values():
                    check(item)

        check(payload)
        self.assertGreaterEqual(checked, 25)

    def test_centre_and_palette_keep_damocles_rules_and_explicit_gaps(self):
        payload = json.loads((REPOSITORY / 'payload/damocles/panel.json').read_text())
        centre = payload['centre']
        self.assertEqual(len(centre['definitions']['records']), 29)
        self.assertEqual(len(centre['categories']), 7)
        self.assertEqual([(b['category'], len(b['rows']), b['ink'], b['paper'])
                          for b in centre['bands']], [(2, 19, 14, 1), (6, 8, 14, 1)])
        palette = payload['palette']
        self.assertEqual([r['row'] for r in palette['rules']], [136, 152])
        self.assertIn('$7862', palette['centreSwap']['colour4'])
        self.assertIn('$7864', palette['centreSwap']['colour1From152'])
        self.assertEqual(palette['baseline']['capturedDifferences'],
                         [{'index': 4, 'baselineXor': 0x707, 'active': 0}])
        self.assertEqual(palette['rows136to151'][4], palette['centreSwap']['capturedWords'][0])
        self.assertTrue(payload['gaps'])


if __name__ == '__main__':
    unittest.main()
