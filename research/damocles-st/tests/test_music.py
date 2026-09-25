import hashlib
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from damocleslab.music import (  # noqa: E402
    PITCH_TABLES,
    VOICE_STARTS,
    VOLUME_TABLES,
    extract,
    voice,
    walk_table,
)

REPOSITORY = Path(__file__).resolve().parents[3]
PINNED = (Path(__file__).resolve().parents[1] / 'work'
          / 'observe-first-world-20260818T101013Z-c5a32b7d' / 'observed.ram')
PINNED_SHA256 = 'b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967'


def put_long(data: bytearray, address: int, value: int) -> None:
    data[address:address + 4] = value.to_bytes(4, 'big')


def image() -> bytearray:
    """A synthetic player area: three one-note voices and one table of each kind."""
    data = bytearray(0x04_0000)
    data[0:8] = bytes([0x60, 0x2E, 0x02, 0x06, 0x00, 0xE0, 0x00, 0x30])
    put_long(data, VOLUME_TABLES + 4, 0x03_4FC8)
    data[0x03_4FC8:0x03_4FCE] = bytes([2, 15, 3, 0xFE, 0, 0])
    put_long(data, PITCH_TABLES + 4, 0x03_5036)
    # (1, -2), (1, 2), then $80 and the aligned long back to the first entry.
    data[0x03_5036:0x03_503A] = bytes([1, 0xFE, 1, 2])
    data[0x03_503A] = 0x80
    put_long(data, 0x03_503C, 0x03_5036)
    for start in VOICE_STARTS:
        body = bytes([0, 1, 1, 1, 10, 0x01, 0x00, 6, 0xC0, 0x00, 2]) + start.to_bytes(3, 'big')
        data[start:start + len(body)] = body
    return data


class TableTests(unittest.TestCase):
    def test_a_table_ends_on_a_zero_count_and_keeps_signed_values(self):
        table = walk_table(image(), 0x03_4FC8)
        self.assertEqual(table['entries'], [[2, 15], [3, -2]])
        self.assertIsNone(table['loop'])

    def test_a_jump_is_recorded_as_the_entry_it_lands_on(self):
        table = walk_table(image(), 0x03_5036)
        self.assertEqual(table['entries'], [[1, -2], [1, 2]])
        self.assertEqual(table['loop'], 0)

    def test_a_jump_between_entries_is_refused(self):
        data = image()
        put_long(data, 0x03_503C, 0x03_5037)
        with self.assertRaises(ValueError):
            walk_table(data, 0x03_5036)


class VoiceTests(unittest.TestCase):
    def test_a_stream_decodes_to_ops_and_closes_on_its_loop(self):
        decoded = voice(image(), VOICE_STARTS[0])
        self.assertEqual(decoded['ops'], [
            {'op': 'volume', 'table': 1},
            {'op': 'pitch', 'table': 1},
            {'op': 'note', 'period': 0x0100, 'vbls': 8},
            {'op': 'note', 'period': 0xC000, 'vbls': 4},
        ])
        self.assertEqual((decoded['loop'], decoded['loopVbls'], decoded['notes']), (0, 12, 2))

    def test_voices_of_different_lengths_are_refused(self):
        data = image()
        data[VOICE_STARTS[2] + 4] = 11
        with self.assertRaises(ValueError):
            extract(data, {})

    def test_an_unrecovered_table_is_refused(self):
        data = image()
        data[VOICE_STARTS[1] + 1] = 4
        with self.assertRaises(ValueError):
            extract(data, {})

    def test_address_zero_is_carried_for_the_unset_tables(self):
        self.assertEqual(extract(image(), {})['addressZero']['bytes'][:2], [0x60, 0x2E])


@unittest.skipUnless(PINNED.is_file(), 'pinned first-world RAM not present')
class PinnedTests(unittest.TestCase):
    def test_the_payload_reproduces_from_the_pinned_capture(self):
        data = PINNED.read_bytes()
        self.assertEqual(hashlib.sha256(data).hexdigest(), PINNED_SHA256)
        payload = json.loads((REPOSITORY / 'payload/damocles/music.json').read_text())
        self.assertEqual(extract(data, payload['source']), payload)


if __name__ == '__main__':
    unittest.main()
