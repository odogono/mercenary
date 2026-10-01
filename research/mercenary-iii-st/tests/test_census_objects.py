"""Initial-object census checked against a fresh original-game capture."""

import os
import unittest

from m3lab.ram import Ram
from m3lab.census_objects import extract_objects


class CensusObjectTests(unittest.TestCase):
    def objects(self):
        opening = os.environ.get('M3_OPENING')
        if not opening:
            self.skipTest('set M3_OPENING to a fresh-game Mercenary III RAM capture')
        return extract_objects(Ram.load(opening))

    def test_craft_residence_distinguishes_body_from_floor(self):
        eagle = self.objects()['objects'][2]
        self.assertEqual(eagle['name'], 'EAGLE NINE S E')
        self.assertEqual(eagle['bodyName'], 'METIS')
        self.assertEqual((eagle['bodyOffset'], eagle['floor']), (60, 0))
        self.assertEqual(eagle['residence'], 'surface')

    def test_carried_stack_not_dummy_world_coordinates(self):
        out = self.objects()
        self.assertEqual(out['carriedStack'], [104, 103, 135])
        for slot in out['carriedStack']:
            self.assertEqual(out['objects'][slot - 1]['residence'], 'carried')
        self.assertEqual(out['objects'][73]['residence'], 'out-of-world')

    def test_host_floor_and_unplaced_service(self):
        out = self.objects()['objects']
        self.assertEqual((out[29]['bodyName'], out[29]['floor']), ('DION', 4))
        self.assertEqual(out[29]['residence'], 'structure')
        self.assertEqual(out[16]['residence'], 'out-of-world')
        self.assertEqual(out[16]['name'], 'BUS')

    def test_template_slots_have_no_permanent_object_identity(self):
        out = self.objects()
        self.assertEqual([o['slot'] for o in out['objects']], list(range(1, 247)))
        self.assertEqual(out['templateWorkingSlots'], list(range(247, 256)))


if __name__ == '__main__':
    unittest.main()
