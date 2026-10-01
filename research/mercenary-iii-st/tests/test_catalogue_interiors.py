"""Floor binding and resident hooks, independently of original captures."""
import os
import struct
import unittest
from pathlib import Path

from m3lab.ram import Ram, RAM_SIZE
from m3lab.catalogue_interiors import floor_binding, association_hooks, local_position, extract_interiors


def image():
    data = bytearray(RAM_SIZE)
    def put(at, values, fmt):
        data[at:at + struct.calcsize(fmt)] = struct.pack(fmt, *values)
    put(0x4BD0C, [0x1000], '>I')
    for slot, record in ((1, 0x2000), (2, 0x2100), (3, 0x2200)):
        put(0x1000 + slot * 4, [record - 0x1000], '>I')
    # Alias with G, absent 1, 2 and B. Zero palette selects parallel Floor palettes.
    data[0x2000:0x2000 + 29] = bytes([0x80, 150, 0xFE, 3, 0, 7, 2, 0, 3, 0, 0, 0, 0, 0, 0, 0, 2, 0,
                                                20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30])
    # The geometry's metadata must not replace the alias's scale or detail.
    data[0x20F8:0x2100] = bytes([1, 1, 99, 88, 0, 0, 0, 0])
    return data


class InteriorSelectionTests(unittest.TestCase):
    def test_upper_floor_keeps_host_scale_and_detail_and_selects_floor_palette(self):
        binding = floor_binding(Ram(bytes(image())), 1, 2)
        self.assertEqual((binding['geometrySlot'], binding['record'], binding['scale'],
                          binding['detail'], binding['palette'], binding['baseY']),
                         (3, 0x2200, [-2, 3], 7, 22, 300))
        self.assertEqual(floor_binding(Ram(bytes(image())), 1, 10)['baseY'], 1500)

    def test_zero_floor_is_unbound_but_does_not_end_the_table(self):
        with self.assertRaisesRegex(ValueError, 'unbound'):
            floor_binding(Ram(bytes(image())), 1, 1)
        self.assertEqual(floor_binding(Ram(bytes(image())), 1, 10)['geometrySlot'], 2)

    def test_nonzero_alias_palette_overrides_parallel_palettes(self):
        data = image(); data[0x2004] = 19
        self.assertEqual(floor_binding(Ram(bytes(data)), 1, 2)['palette'], 19)

    def test_upper_floor_does_not_recursively_resolve_an_alias(self):
        data = image(); data[0x2200] = 0x80
        with self.assertRaisesRegex(ValueError, 'alias'):
            floor_binding(Ram(bytes(data)), 1, 2)

    def test_floor_range_is_bounded(self):
        for floor in (-1, 11):
            with self.assertRaisesRegex(ValueError, 'Floor'):
                floor_binding(Ram(bytes(image())), 1, floor)

    def test_association_is_default_region_plus_queue_insertions(self):
        structure = {'associations': [{'id': 3, 'hooks': [[2, 16], [4, 0]]}],
                     'regions': [{'queue': []}, {'queue': [4, 16]}, {'queue': []}, {'queue': []}]}
        self.assertEqual(association_hooks(structure, 3), [[3, 0], [2, 16], [4, 0]])
        with self.assertRaisesRegex(ValueError, 'association 7'):
            association_hooks(structure, 7)
        structure['associations'][0]['hooks'] = [[2, 99]]
        # A missing insertion token is a dormant hook retained by the original.
        self.assertEqual(association_hooks(structure, 3), [[3, 0], [2, 99]])

    def test_resident_offsets_use_cell_origin_and_floor_base_not_association(self):
        self.assertEqual(local_position([100 * 65536 + 32808, 340, 200 * 65536 + 32748],
                                        [32798, 32738], 300), [10, 40, 10])


class CapturedInteriorTests(unittest.TestCase):
    def test_full_extraction(self):
        census = os.environ.get('M3_CENSUS_RUN')
        if not census:
            self.skipTest('set M3_CENSUS_RUN')
        interiors = extract_interiors(Path(census))
        self.assertEqual(len(interiors['structures']), 198)
        self.assertEqual(len(interiors['residents']), 180)
        self.assertEqual({o['slot'] for o in interiors['residents'] if o['host'].get('field')}, {101, 118})
        self.assertTrue(all(o['hooks'] for o in interiors['residents']))
        slot46 = interiors['structures']['46']
        self.assertEqual([f['floor'] for f in slot46['floors']], [0])
        self.assertEqual(slot46['nonFloorBytes']['range'], ['$10696', '$1069F'])
        self.assertEqual(interiors['floorInventory']['rawSlots'], 78)
        self.assertEqual(interiors['floorInventory']['authoredSlots'], 74)


if __name__ == '__main__':
    unittest.main()
