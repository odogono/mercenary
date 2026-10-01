"""Full location recovery compared to the original builder's captured workspaces."""

import os
from pathlib import Path
import unittest

from _capture import capture
from m3lab.ram import Ram
from m3lab.census_locations import read_inventory, read_workspace, structure_floors


class CensusLocationTests(unittest.TestCase):
    def workspace(self, group):
        directory = os.environ.get('M3_GROUPS')
        if not directory:
            self.skipTest('set M3_GROUPS to original-builder workspace captures')
        return Ram.load(Path(directory) / f'group-{group:02d}.ram')

    def test_complete_group_and_body_inventory(self):
        data = read_inventory(capture())
        self.assertEqual(len(data['bodies']), 31)
        self.assertEqual(len(data['groups']), 57)
        dion = data['bodies'][4]
        self.assertEqual(dion['name'], 'DION')
        self.assertEqual([(r['group'], r['origin']) for r in dion['records']],
                         [(2, [3252, 1314]), (27, [3316, 1378]), (28, [3316, 1298])])
        self.assertEqual(sum(sum(c['slot'] != 0 for c in g['cells'])
                             for g in data['groups']), 795)

    def test_whole_metis_map_extends_known_opening(self):
        cells = read_workspace(self.workspace(3), 3)['cells']
        self.assertEqual(len(cells), 25)
        prison = next(c for c in cells if c['cell'] == 0x62)
        self.assertEqual((prison['slot'], prison['geometrySlot'], prison['scale']),
                         (132, 132, [-3, -3]))
        self.assertEqual(prison['origin'], [32768, 34868])

    def test_initial_construction_overlay_is_not_authored_building(self):
        inventory = read_inventory(capture())
        source = next(c for c in inventory['groups'][8]['cells'] if c['cell'] == 0x32)
        self.assertEqual(source['slot'], 136)
        cells = read_workspace(self.workspace(8), 8)['cells']
        self.assertNotIn(0x32, [c['cell'] for c in cells])
        self.assertEqual(len(cells), 23)

    def test_floor_table_excludes_padding_entry(self):
        floors = structure_floors(capture(), 155)
        self.assertEqual(floors['pitch'], 150)
        self.assertEqual([f['floor'] for f in floors['floors']], list(range(10)))
        self.assertEqual(structure_floors(capture(), 132)['floors'],
                         [{'floor': 0, 'geometrySlot': 132}])


if __name__ == '__main__':
    unittest.main()
