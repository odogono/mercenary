import hashlib
import json
import struct
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from damocleslab.system import (  # noqa: E402
    DRAW_LIST_AREA,
    DRAW_LIST_AREA_END,
    DRAW_LIST_POINTERS,
    draw_list,
    extract,
    packed_float,
)

REPOSITORY = Path(__file__).resolve().parents[3]
PINNED = (Path(__file__).resolve().parents[1] / 'work'
          / 'observe-first-world-20260818T101013Z-c5a32b7d' / 'observed.ram')
PINNED_SHA256 = 'b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967'

# The #424 decoded size table, transcribed from docs/research/damocles-gamma-system.md.
DECODED_SIZES = {
    'dialis': 5_120_000, 'icarus': 64_000, 'midas': 128_000, 'acheron': 30_720,
    'dion': 256_000, 'atropos': 20_480, 'clotho': 92_160, 'lachesis': 71_680,
    'gaea': 204_800, 'cronus': 40_960, 'cyclopes': 81_920, 'eris': 307_200,
    'solon': 35_840, 'theon': 10_240, 'vesta': 92_160, 'metis': 23_040,
    'lucan': 20_480, 'logos': 320_000, 'aurora': 10_240, 'triton': 1_536_000,
    'pan': 112_640, 'thalia': 51_200, 'juno': 2_048_000, 'bacchus': 81_920,
    'jason': 81_920, 'tolosa': 92_160, 'perseus': 194_560, 'mentor': 64_000,
    'sapphire': 10_240, 'damocles': 64_000,
}


def lists(*entries: bytes) -> bytearray:
    """A synthetic pointer table and list area holding one list per slot, in order."""
    data = bytearray(0x1_0000)
    cursor = DRAW_LIST_AREA
    for index, entry in enumerate(entries):
        data[DRAW_LIST_POINTERS + index * 4:DRAW_LIST_POINTERS + index * 4 + 4] = \
            cursor.to_bytes(4, 'big')
        data[cursor:cursor + len(entry)] = entry
        cursor += len(entry)
    return data


class DrawListTests(unittest.TestCase):
    def test_a_zero_selector_is_dialis_and_only_a_negative_byte_ends_the_list(self):
        data = lists(b'\x00\xff', b'\x00\x30\x74\xff')
        self.assertEqual(draw_list(data, 0), [0])
        self.assertEqual(draw_list(data, 1), [0, 12, 29])

    def test_a_byte_that_is_not_a_selector_is_refused(self):
        with self.assertRaisesRegex(ValueError, 'not a Body selector'):
            draw_list(lists(b'\x31\xff'), 0)

    def test_a_list_that_runs_past_the_area_is_refused(self):
        data = lists(b'\x00')
        data[DRAW_LIST_AREA + 1:DRAW_LIST_AREA_END] = b'\x00' * (DRAW_LIST_AREA_END - DRAW_LIST_AREA - 1)
        with self.assertRaisesRegex(ValueError, 'not terminated'):
            draw_list(data, 0)

    def test_a_pointer_outside_the_area_is_refused(self):
        data = lists(b'\xff')
        data[DRAW_LIST_POINTERS:DRAW_LIST_POINTERS + 4] = DRAW_LIST_AREA_END.to_bytes(4, 'big')
        with self.assertRaisesRegex(ValueError, 'outside the list area'):
            draw_list(data, 0)


class PackedFloatTests(unittest.TestCase):
    def test_the_mantissa_carries_an_implicit_one_at_bit_twelve(self):
        self.assertEqual(packed_float(0x0012_12C0), 307_200)
        self.assertEqual(packed_float(0xFFFF_1B00), 0.84375)

    def test_an_unnormalised_mantissa_is_refused(self):
        with self.assertRaisesRegex(ValueError, 'unnormalised'):
            packed_float(0x0012_0FFF)


@unittest.skipUnless(PINNED.is_file(), 'pinned first-world RAM not present')
class PinnedTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = PINNED.read_bytes()
        cls.payload = json.loads((REPOSITORY / 'payload/damocles/system.json').read_text())
        cls.bodies = {body['id']: body for body in cls.payload['bodies']}

    def test_the_payload_reproduces_from_the_pinned_capture(self):
        self.assertEqual(hashlib.sha256(self.data).hexdigest(), PINNED_SHA256)
        self.assertEqual(extract(self.data, self.payload['source']), self.payload)

    def test_every_published_list_is_the_bytes_at_its_809c_pointer(self):
        ids = [body['id'] for body in sorted(self.payload['bodies'], key=lambda b: b['sourceIndex'])]
        for body in self.payload['bodies']:
            pointer = struct.unpack_from('>I', self.data, DRAW_LIST_POINTERS + body['sourceIndex'] * 4)[0]
            stop = self.data.index(b'\xff', pointer)
            self.assertEqual([ids[selector // 4] for selector in self.data[pointer:stop]],
                             body['drawList'], body['name'])
        sky = self.payload['sky']
        self.assertEqual(sky['drawListPointers']['sha256'],
                         '5e80c8d7c46cc1a8fef6215f708d4614be403866a4dd58415a9468debf5c0909')
        self.assertEqual(sky['drawListArea']['sha256'],
                         '69f9a21db1c39ac1678a565bc8be685e5bb0a878f06bb8ee75a93dac7abbc9a5')

    def test_the_lists_the_research_names(self):
        self.assertEqual(self.bodies['eris']['drawList'],
                         ['dialis', 'solon', 'theon', 'vesta', 'metis', 'lucan', 'damocles'])
        self.assertEqual(self.bodies['dialis']['drawList'], ['dialis'])
        self.assertEqual(self.bodies['damocles']['drawList'],
                         ['eris', 'solon', 'theon', 'vesta', 'metis', 'lucan', 'dialis', 'icarus'])
        self.assertNotIn('void', self.bodies)

    def test_the_published_size_is_the_424_table_and_radius_is_a_256th_of_it(self):
        self.assertEqual({id: body['size'] for id, body in self.bodies.items()}, DECODED_SIZES)
        for body in self.payload['bodies']:
            self.assertEqual(body['radius'] * 256, body['size'])
        self.assertEqual(self.bodies['eris']['radius'], 1_200)
        self.assertEqual(self.bodies['dialis']['radius'], 20_000)

    def test_the_comet_block_is_the_440_table_and_the_528_geometry(self):
        comet = self.payload['comet']
        records = comet['waypoints']['records']
        self.assertEqual(len(records), 31)
        # docs/research/damocles-script-motion-time.md's table: the guard, a middle record, and
        # record 28 on ERIS at zero on the clock.
        self.assertEqual(records[0], {'seconds': -15500, 'x': -369066, 'z': 1119852})
        self.assertEqual(records[14], {'seconds': -7000, 'x': 50628, 'z': 90831})
        self.assertEqual(records[28], {'seconds': 0, **{axis: self.bodies['eris']['position'][axis]
                                                        for axis in ('x', 'z')}})
        self.assertEqual(comet['tailShift'], 2)
        self.assertEqual(comet['headPoints']['offsets'], [
            {'x': 0, 'y': -250, 'z': 0}, {'x': 0, 'y': 250, 'z': 0},
            {'x': -250, 'y': 0, 'z': 0}, {'x': 250, 'y': 0, 'z': 0}])
        # Two double-sided white triangles: tip and the Y pair, tip and the X pair.
        self.assertEqual([face['points'] for face in comet['polygons']['faces']],
                         [[0, 1, 2], [2, 1, 0], [4, 3, 0], [0, 3, 4]])
        self.assertEqual({face['colour'] for face in comet['polygons']['faces']}, {'#eeeeee'})
        self.assertEqual(comet['headDisc']['slots'], [0, 12])


if __name__ == '__main__':
    unittest.main()
