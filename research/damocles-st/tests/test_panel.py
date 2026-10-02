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
)

REPOSITORY = Path(__file__).resolve().parents[3]
PINNED = (Path(__file__).resolve().parents[1] / 'work'
          / 'observe-first-world-20260818T101013Z-c5a32b7d' / 'observed.ram')
PINNED_SHA256 = 'b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967'


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


if __name__ == '__main__':
    unittest.main()
