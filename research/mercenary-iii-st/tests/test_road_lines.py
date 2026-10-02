"""The road pass needs the complete native grid, independently of exported cells."""
import hashlib
import json
import struct
import unittest
from pathlib import Path

from m3lab.ram import Ram
from m3lab.world import road_lines


class RoadLineRecoveryTests(unittest.TestCase):
    def test_all_catalogue_workspaces_and_play_keep_the_native_miii_radius_table(self):
        payload = Path(__file__).resolve().parents[3] / 'payload/dion'
        support = json.loads((payload / 'catalogue/render-support.json').read_text())
        world = json.loads((payload / 'world.json').read_text())
        for roads in [world['roads'], *[g['roads'] for g in support['groups'].values()]]:
            self.assertEqual(len(roads['corners']), 256)
            self.assertEqual(hashlib.sha256(bytes(roads['radiusTable'])).hexdigest(),
                             '72ff92f0ccc3a56ac0e4ca81d0670906b3f551b43bc45b52cb053d29097e135c')
            self.assertEqual(roads['radiusTable'][:5], [3, 3, 3, 3, 3])
        self.assertEqual(support['groups']['2']['roads']['colour'], 0x322)
        self.assertEqual(support['groups']['8']['roads']['colour'], 0x411)
        self.assertEqual(support['groups']['56']['roads']['colour'], 0x555)

    def test_keeps_zero_cells_and_overlapping_run_endpoints_in_the_native_grid(self):
        data = bytearray(0x100000)
        struct.pack_into('>I', data, 0x1AAC0 + 0x87 * 4, 0x878B24B4)
        struct.pack_into('>H', data, 0x7186, 0x322)
        result = road_lines(Ram(bytes(data)))
        self.assertEqual(len(result['corners']), 256)
        self.assertEqual(result['corners'][0x87], 0x878B24B4)
        self.assertEqual(result['corners'][0x88], 0)
        self.assertEqual(result['colour'], 0x322)
        self.assertEqual(result['height'], 0)
        self.assertEqual(result['provenance'][0]['sha256'],
                         hashlib.sha256(data[0x1AAC0:0x1AEC0]).hexdigest())
