"""#682's surface decoder paths: islands, the Land/Sea answer, cell classes, extraction.

The first tests build records in a blank image, so they need no captures. The
rest read the pinned opening (M3_OPENING) or the census and construction runs
(M3_CENSUS_RUN, M3_CONSTRUCTION_RUN), and skip without them.
"""

import json
import os
import struct
from pathlib import Path
import unittest

from m3lab.catalogue_ledger import load_ledger
from m3lab.catalogue_surface import CLASS_TABLE, SELECTORS, cell_class, extract_surface, selected_piece
from m3lab.geometry import RUN_GRID, decode_island, land_sea
from m3lab.ram import RAM_SIZE, Ram

# The original's Land/Sea answer ($6F56) at teleported points, by the island
# descriptor it selected ($6F44) and the position relative to that island's
# origin in Body cells (coast-birmingham-island-5wi7lyh_, coast-key-west-ifkxmt0h).
OBSERVED = [
    (0x63072, 0.5, 0.5, 0), (0x63072, 8, 8, 0), (0x63072, -10, 0.5, 1), (0x63072, -20, 5, 1),
    (0x63072, -25, -10, -1), (0x63072, -27, 0, -1), (0x63072, 10, -15, -1), (0x63072, 10, -17, -1),
    (0x63072, 30, -5, 1), (0x63086, -25, 26, -1), (0x63086, -23, 26, -1), (0x63072, 20, 25, 1),
    (0x63072, 5, 31, -1), (0x63072, 5, 33, -1), (0x63072, -15, 20, -1), (0x63072, 0, -30, -1),
    (0x63072, -26, 0, -1), (0x63072, -25.9, 0, -1), (0x63072, 0, -16, -1), (0x63072, 0, -15.9, -1),
    (0x63198, 0.5, 0.5, 0), (0x63198, -31, 0, -1), (0x63198, -20, -50, -1), (0x63198, -10, -59, -1),
    (0x63198, 10, -40, 1), (0x63198, 30, -20, -1), (0x63198, 47, 0, 1), (0x63198, 40, 40, -1),
    (0x63198, 20, 47, -1), (0x63198, 0, 47, -1), (0x63198, -20, 30, 1), (0x63198, -30, 40, -1),
    (0x63198, 30, 30, -1), (0x63198, 25, -55, -1), (0x63198, -5, -30, 1), (0x63198, 15, 10, 0),
]


def words(*values: int) -> bytes:
    return b''.join(struct.pack('>h' if v < 0 else '>H', v) for v in values)


def image(writes: dict[int, bytes]) -> Ram:
    data = bytearray(RAM_SIZE)
    for address, value in writes.items():
        data[address:address + len(value)] = value
    return Ram(bytes(data))


def synthetic_island() -> tuple[Ram, int]:
    """A diamond: core box, one sea box, four edges, one polygon, one line."""
    pointer = 0x1000
    # Below the pointer, read downwards: outer, core, sea boxes, $8000, edges, zero.
    # Each box is laid out upwards as Z upper, Z lower, X upper, X lower.
    edges = [0x0204, 0x0308 | 0x4000, 0x040C | 0x8000, 0x0110 | 0xC000]
    sentinel = words(0x8000)
    sea = words(6, 4, 2, 0)          # read as x [0, 2), z [4, 6)
    core = words(1, -1, 1, -1)       # x [-1, 1), z [-1, 1)
    outer = words(10, -10, 10, -10)  # x [-10, 10), z [-10, 10)
    lower = words(0) + b''.join(words(e) for e in reversed(edges)) + sentinel + sea + core + outer
    body = (words(-8, 0, 0, -8, 8, 0, 0, 8, 0x8000)
            + words(0x0123) + bytes([4, 8, 12, 16, 0])
            + words(0x4456) + bytes([4, 12]) + words(0))
    return image({pointer - len(lower): lower, pointer: body}), pointer


class SyntheticSurfaceTests(unittest.TestCase):
    def test_island_record_reads_both_directions_from_its_pointer(self):
        ram, pointer = synthetic_island()
        island = decode_island(ram, pointer)
        self.assertEqual(island['vertices'], [[-8, 0], [0, -8], [8, 0], [0, 8]])
        self.assertEqual(island['primitives'],
                         [{'kind': 'polygon', 'colour': 0x0123, 'refs': [1, 2, 3, 4]},
                          {'kind': 'line', 'colour': 0x0456, 'refs': [1, 3]}])
        self.assertEqual((island['outer'], island['core']),
                         ({'x': [-10, 10], 'z': [-10, 10]}, {'x': [-1, 1], 'z': [-1, 1]}))
        self.assertEqual(island['sea'], [{'x': [0, 2], 'z': [4, 6]}])
        self.assertEqual([(e['from'], e['to'], e['swap'], e['steep']) for e in island['edges']],
                         [(1, 2, False, False), (2, 3, False, True),
                          (3, 4, True, False), (4, 1, True, True)])

    def test_island_offsets_must_name_vertices(self):
        ram, pointer = synthetic_island()
        data = bytearray(ram.data)
        data[pointer + 20] = 5  # the polygon's first offset, not a multiple of four
        with self.assertRaisesRegex(ValueError, 'is not a vertex'):
            decode_island(Ram(bytes(data)), pointer)

    def test_land_sea_rule_order(self):
        island = {'vertices': [[-8, 0], [0, -8], [8, 0], [0, 8]],
                  'outer': {'x': [-10, 10], 'z': [-10, 10]}, 'core': {'x': [-1, 1], 'z': [-1, 1]},
                  'sea': [{'x': [0, 2], 'z': [4, 6]}],
                  'edges': [{'from': 1, 'to': 2, 'swap': False, 'steep': True}]}
        self.assertEqual(land_sea(island, 12, 0), -1)   # outside the outer box
        self.assertEqual(land_sea(island, 0.5, 0.5), 0)  # core
        self.assertEqual(land_sea(island, 1, 5), -1)     # a sea box beats the core rule's absence
        self.assertEqual(land_sea(island, 5, 5), 1)      # no edge bounds it: land
        # The falling edge from (-8, 0) to (0, -8) bounds both points. `$57402`: a
        # point on or below the line's Z is 1, above it -1; a swapped edge reverses.
        self.assertEqual(land_sea(island, -6, -7), 1)
        self.assertEqual(land_sea(island, -2, -1), -1)
        island['edges'][0]['swap'] = True
        island['vertices'] = [[0, -8], [-8, 0], [8, 0], [0, 8]]
        self.assertEqual(land_sea(island, -6, -7), -1)

    def test_cell_class_and_selected_piece_follow_the_run_grid(self):
        grid = bytearray(1024)
        grid[4 * 0x21:4 * 0x21 + 4] = bytes([0x20, 0x23, 0, 0])  # a row run, mid-run
        grid[4 * 0x30:4 * 0x30 + 4] = bytes([0, 0, 0x30, 0x60])   # a column run's start
        classes = bytearray(64)
        classes[1 | 2 | 4] = 0x10  # (entry >> 3) & $E is a byte offset: selector 1
        classes[8 | 32] = 0x30     # selector 3
        ram = image({RUN_GRID: bytes(grid), CLASS_TABLE: bytes(classes),
                     SELECTORS: words(0x100, 0x200, 0x300, 0x400, 0x500, 0x600, 0x700)})
        self.assertEqual(cell_class(ram, 0x21), 7)
        self.assertEqual(cell_class(ram, 0x30), 8 | 32)
        self.assertEqual(cell_class(ram, 0x05), 0)
        self.assertEqual(selected_piece(ram, 0x21), 0x200)
        self.assertEqual(selected_piece(ram, 0x30), 0x400)
        self.assertEqual(selected_piece(ram, 0x05), 0x100)


class CapturedSurfaceTests(unittest.TestCase):
    def opening(self) -> Ram:
        path = os.environ.get('M3_OPENING')
        if not path:
            self.skipTest('set M3_OPENING to the fresh opening capture')
        return Ram.load(path)

    def test_every_island_record_is_closed_and_contiguous(self):
        ram = self.opening()
        records = sorted({int(i['geometry'].split('-')[1], 16) for b in load_ledger()['bodies']
                          for i in b['islands']})
        decoded = [decode_island(ram, pointer) for pointer in records]
        ranges = [[int(a[1:], 16) for a in d['provenance']['range']] for d in decoded]
        self.assertEqual((ranges[0][0], ranges[-1][1]), (0x632F6, 0x639B9))
        for (_, end), (start, _) in zip(ranges, ranges[1:]):
            self.assertIn(start - end, (0, 1))  # back to back, or one alignment byte
        for island in decoded[1:]:
            self.assertEqual(len(island['edges']), len(island['vertices']))
        self.assertEqual(decoded[0]['vertices'], [])  # the record with no coast

    def test_land_sea_agrees_with_the_original_answers(self):
        ram = self.opening()
        for descriptor, x, z, original in OBSERVED:
            island = decode_island(ram, descriptor + ram.sword(descriptor + 4))
            self.assertEqual(land_sea(island, x, z), original, (hex(descriptor), x, z))

    def test_extraction_is_what_the_ledger_records(self):
        census, construction = os.environ.get('M3_CENSUS_RUN'), os.environ.get('M3_CONSTRUCTION_RUN')
        if not census or not construction:
            self.skipTest('set M3_CENSUS_RUN and M3_CONSTRUCTION_RUN')
        surface = extract_surface(Path(census), Path(construction))
        ledger = {g['id']: g for g in load_ledger()['geometry'] if g['owner'] == 682}
        self.assertEqual(set(surface['geometry']), set(ledger))
        for key, record in surface['geometry'].items():
            self.assertEqual(record['sha256'], ledger[key]['sha256'], key)
        self.assertEqual({k: v['slot'] for k, v in surface['logos'].items()},
                         {'initial': None, 'constructed': 136})
        self.assertEqual({c['slot'] for c in surface['midas']['cells']}, {68})
        self.assertEqual(len(surface['midas']['cells']), 256)
        overridden = [r for rows in surface['cells'].values() for r in rows if 'override' in r]
        self.assertTrue(all(r['ground'] != r['selected'] for r in overridden))
        self.assertEqual(json.loads(json.dumps(surface))['source']['census'], Path(census).name)


class DetailLetteringAlignmentTests(unittest.TestCase):
    def test_odd_command_rounds_its_header_down_before_reading(self):
        from unittest.mock import patch
        from m3lab.geometry import decode_detail
        # A three-byte polygon leaves the $6000 command at an odd address.
        # $54FA0 rounds the pointer AFTER that command down to an even word.
        body = (words(0x8000, 0x0777) + bytes([0]) + bytes([0x60])
                + words(25, -50, 70, 580, 0x8000, -9) + bytes([3, 4])
                + words(0x8000) + b'CLOSED\x00' + words(0, 0) + bytes([0, 0])
                + words(0) + bytes([0]))
        ram = image({0x1000: body})
        with patch('m3lab.geometry.detail_record', return_value=0x1000), \
             patch('m3lab.geometry._detail_boxes', return_value=([], [], None, 0x1000)):
            detail = decode_detail(ram, 1)
        text = detail['primitives'][1]
        self.assertEqual(text['anchor'], [-50, 70, 580])
        self.assertEqual(text['flags'], 0x8000)
        self.assertEqual(text['glyphScale'], [3, 4])
        self.assertEqual(text['text'], list(b'CLOSED'))


if __name__ == '__main__':
    unittest.main()
