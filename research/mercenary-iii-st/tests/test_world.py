"""World decoders against a loaded-play capture (`M3_RAM`, Restricted Material).

The opening image defaults to the same capture; set `M3_OPENING` to the game-start
image (`start.ram`) to check the fresh game's state as the export reads it.
"""

import json
import os
import unittest
from functools import lru_cache

from _capture import capture
from m3lab.geometry import (cell_entry, decode_detail, decode_ground, decode_model,
                            decode_structure, ground_transform, resolve_structure)
from m3lab.ram import Ram
from m3lab.world import ROUTE_CELLS, extract_world, road_points


@lru_cache(maxsize=1)
def world() -> dict:
    opening = os.environ.get('M3_OPENING')
    return extract_world(capture(), Ram.load(opening) if opening else capture())


class WorldTests(unittest.TestCase):
    def test_serialisable_with_every_published_slice(self):
        out = world()
        json.dumps(out)
        self.assertEqual(len(out['stableSlices']), 39)

    def test_fifteen_cells_over_five_geometry_records(self):
        out = world()
        self.assertEqual([(c['x'], c['z']) for c in out['cells']], ROUTE_CELLS)
        self.assertEqual(sorted(int(k) for k in out['structures']), [57, 65, 132, 146, 150])
        self.assertEqual(sorted(int(k) for k in out['details']), [1, 36, 49, 56, 59])

    def test_prison_structure_matches_r2(self):
        ram = capture()
        resolved = resolve_structure(ram, cell_entry(ram, 0x62)['slot'])
        self.assertEqual(resolved['scale'], [-3, -3])
        self.assertEqual((resolved['palette'], resolved['detail']), (58, 49))
        prison = decode_structure(ram, resolved['record'], resolved['scale'])
        self.assertEqual(len(prison['regions']), 9)
        self.assertEqual([r['flags'] for r in prison['regions']][:3], [0x8000, 0x83FC, 0xD000])
        door = prison['attachments'][0]
        self.assertEqual((door['control'], door['twoLeaves']), (0x42F0, True))
        self.assertEqual(door['box'], {'x': [-150, 150], 'z': [-1200, 300]})
        # The association list hooks the occupants of region 1 after its queue (id 1).
        self.assertEqual(prison['associations'], [{'id': 1, 'hooks': [[2, 5], [3, 5]]}])

    def test_templates_match_r2(self):
        ram = capture()
        def models(cell):
            start, _, _ = ground_transform(ram, cell)
            return sorted(p['model'] for p in decode_ground(ram, start)['primitives']
                          if p['kind'] == 'template')
        self.assertEqual(models(0x61), [337] * 6 + [370, 372, 373])
        self.assertEqual(models(0x60), [331, 331])

    def test_road_points_match_the_live_table_where_bound(self):
        ram = capture()
        cell = ram.word(0x71F4)
        _, transform, _ = ground_transform(ram, cell)
        slots = road_points(ram, cell, transform)['slots']
        self.assertEqual([slots[str(s)] for s in (240, 244, 248, 252)],
                         [ram.byte(a) for a in (0x4160, 0x4164, 0x4168, 0x416C)])

    def test_detail_selection_groups_are_word_aligned(self):
        detail = decode_detail(capture(), 59)
        boxes = detail['groups'][1]['boxes']
        self.assertTrue(all(b['tag'] == 0xFFFF for b in boxes))
        self.assertIn([1, 2, 3, 4, 5, 6, 7, 8, 9], [b['records'] for b in boxes])

    def test_taxi_and_passenger_form(self):
        taxi = decode_model(capture(), 318)
        self.assertEqual((taxi['name'], len(taxi['vertices']), len(taxi['faces'])), ('TAXI', 32, 30))
        self.assertEqual(taxi['header']['op'], 0xD)
        self.assertEqual(len(taxi['passenger']['vertices']), 18)

    def test_lettering_glyph_totals(self):
        glyphs = world()['glyphs']
        nonblank = [glyphs[f'5:{c:02X}'] for c in range(0x40, 0x47)]
        self.assertEqual(sum(len(g['points']) for g in nonblank), 95)
        self.assertEqual(sum(len(g['primitives']) for g in nonblank), 86)


if __name__ == '__main__':
    unittest.main()
