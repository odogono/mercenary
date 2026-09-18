"""Publication rules for arrival poses (#326).

A pose on a body whose 16x16 workspace origin is unrecovered has to publish with
a null cell and a stated reason, because twenty-six of the thirty physical
bodies are in exactly that position and a capture on any of them would otherwise
be unpublishable.
"""

import importlib.util
import sys
import unittest
from pathlib import Path

LAB_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB_ROOT))

_spec = importlib.util.spec_from_file_location(
    'location_ledger', LAB_ROOT / 'scripts' / 'location-ledger.py')
location_ledger = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(location_ledger)


def pose(body: str, *, cell=None, local=None) -> dict:
    return {
        'id': f'{body}-probe',
        'body': body,
        'bodySelector': int(body.split('-')[1]) * 4,
        'onFoot': True,
        'position': {'x': 1, 'y': 63, 'z': 2},
        'yaw': 0x0600,
        'cell': cell,
        'localCell': local,
        'cellEvidence': 'reason',
        'memstateSha256': 'a' * 64,
        'ramSha256': 'b' * 64,
    }


class ArrivalPosePublicationTests(unittest.TestCase):
    def test_body_without_a_recovered_origin_still_publishes(self):
        # MIDAS is body 2: residents, no recovered workspace origin.
        self.assertNotIn(2, location_ledger.WORKSPACE_ORIGINS)
        published = location_ledger.published_pose(pose('body-2'), {'body-2': 'MIDAS'})
        self.assertEqual(published['name'], 'MIDAS')
        self.assertIsNone(published['cell'])
        self.assertIsNone(published['localCell'])
        self.assertIsNone(published['workspaceOrigin'])
        self.assertEqual(published['evidence']['cell'], 'reason')

    def test_body_with_a_recovered_origin_publishes_the_origin(self):
        # Eris is body 11, origin 64,128 from the catalogue note.
        published = location_ledger.published_pose(
            pose('body-11', cell=0x87, local={'x': 7, 'z': 8}), {'body-11': 'ERIS'})
        self.assertEqual(published['cell'], 0x87)
        self.assertEqual(published['workspaceOrigin'], {'x': 64, 'z': 128})

    def test_a_pose_read_without_an_origin_reports_the_reason(self):
        ram = bytearray(0x100000)
        ram[location_ledger.BODY_SELECTOR:location_ledger.BODY_SELECTOR + 2] = (8).to_bytes(2, 'big')
        ram[location_ledger.ON_FOOT:location_ledger.ON_FOOT + 2] = (1).to_bytes(2, 'big')
        path = Path(self.enterContext(__import__('tempfile').TemporaryDirectory())) / 'probe.ram'
        path.write_bytes(bytes(ram))
        decoded = location_ledger.read_pose('probe', path)
        self.assertEqual(decoded['body'], 'body-2')
        self.assertIsNone(decoded['cell'])
        self.assertIn('no recovered body-local workspace origin',
                      decoded['cellEvidence'].lower())


if __name__ == '__main__':
    unittest.main()
