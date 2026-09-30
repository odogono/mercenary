"""Publication rules for arrival poses (#326).

The arrival cell is read from the engine's own cell word rather than derived,
because a 16x16 workspace is a window onto a body surface that spans thousands
of cells and only a handful of window origins are recovered. Deriving the cell
would have left twenty-six of the thirty physical bodies unpublishable and would
have thrown outright on a pose standing in a second window of a body whose first
window is known -- which is exactly what the Gaea transporter destination does.
"""

import importlib.util
import struct
import sys
import tempfile
import unittest
from pathlib import Path

LAB_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB_ROOT))

_spec = importlib.util.spec_from_file_location(
    'location_ledger', LAB_ROOT / 'scripts' / 'location-ledger.py')
location_ledger = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(location_ledger)

CELL_UNITS = location_ledger.CELL_UNITS


def workspace(body_index: int, cell: int, origin: tuple[int, int]) -> bytes:
    """An ST RAM window holding one on-foot pose at ``cell`` within ``origin``."""
    ram = bytearray(0x100000)
    struct.pack_into('>H', ram, location_ledger.BODY_SELECTOR, body_index * 4)
    struct.pack_into('>H', ram, location_ledger.ON_FOOT, 1)
    struct.pack_into('>H', ram, location_ledger.CELL_WORD, cell)
    struct.pack_into('>i', ram, location_ledger.CAMERA_X,
                     (origin[0] + (cell & 0x0F)) * CELL_UNITS + 17)
    struct.pack_into('>i', ram, location_ledger.CAMERA_Y, 63)
    position_x = (origin[0] + (cell & 0x0F)) * CELL_UNITS + 17
    position_z = (origin[1] + (cell >> 4)) * CELL_UNITS + 17
    struct.pack_into('>i', ram, location_ledger.CAMERA_Z, position_z)
    # The engine's own Body Coordinate Readout words, which read_pose checks the camera
    # longwords against (#371).
    derived = location_ledger.body_coordinate(position_x, position_z)
    struct.pack_into('>H', ram, location_ledger.BODY_COORDINATE_X, derived['stepX'])
    struct.pack_into('>H', ram, location_ledger.BODY_COORDINATE_Z, derived['stepZ'])
    # The engine's day flag for a zero turn and sub-stellar longitude (#497).
    lit = location_ledger.daylight(0, 0, derived['stepX'], derived['stepZ'])
    struct.pack_into('>H', ram, location_ledger.DAYLIGHT, 0xFFFF if lit else 0)
    return bytes(ram)


class ArrivalPosePublicationTests(unittest.TestCase):
    def read(self, label: str, ram: bytes) -> dict:
        path = Path(self.enterContext(tempfile.TemporaryDirectory())) / 'probe.ram'
        path.write_bytes(ram)
        return location_ledger.read_pose(label, path)

    def test_body_without_a_recovered_origin_still_publishes_its_cell(self):
        # DAMOCLES is body 29: its one island record binds the empty group $00,
        # so there is no workspace for a pose to be anchored to.
        self.assertNotIn(29, location_ledger.WORKSPACE_ORIGINS)
        self.assertNotIn(29, location_ledger.FIELD_ORIGINS)
        pose = self.read('damocles', workspace(29, 0x5B, (251, 3275)))
        published = location_ledger.published_pose(pose, {'body-29': 'DAMOCLES'})
        self.assertEqual(published['name'], 'DAMOCLES')
        self.assertEqual(published['cell'], 0x5B)
        self.assertEqual(published['localCell'], {'x': 11, 'z': 5})
        self.assertIsNone(published['workspaceOrigin'])
        self.assertEqual(published['impliedWorkspaceOrigin'], {'x': 251, 'z': 3275})
        self.assertIn('no recovered 16x16 workspace origin', published['evidence']['cell'])

    def test_a_uniform_field_anchors_the_window_the_pose_stands_in(self):
        # MIDAS is body 2, a uniform field: the island-local cell wraps at 16
        # ($054B76), so any window congruent to the island origin is a window.
        self.assertNotIn(2, location_ledger.WORKSPACE_ORIGINS)
        self.assertEqual(location_ledger.FIELD_ORIGINS[2][0], (1729, 938))
        pose = self.read('midas', workspace(2, 0xB5, (353, 3482)))
        published = location_ledger.published_pose(pose, {'body-2': 'MIDAS'})
        self.assertEqual(published['cell'], 0xB5)
        self.assertEqual(published['localCell'], {'x': 5, 'z': 11})
        self.assertEqual(published['workspaceOrigin'], {'x': 353, 'z': 3482})
        self.assertIn('uniform field', published['evidence']['cell'])
        with self.assertRaisesRegex(ValueError, 'not congruent'):
            self.read('midas-off', workspace(2, 0xB5, (354, 3482)))

    def test_a_recovered_origin_confirms_the_engine_cell(self):
        # Eris is body 11, origin 64,128 from the catalogue note.
        pose = self.read('eris', workspace(11, 0x87, (64, 128)))
        published = location_ledger.published_pose(pose, {'body-11': 'ERIS'})
        self.assertEqual(published['cell'], 0x87)
        self.assertEqual(published['workspaceOrigin'], {'x': 64, 'z': 128})
        self.assertEqual(published['impliedWorkspaceOrigin'], {'x': 64, 'z': 128})
        self.assertIn('independently confirmed', published['evidence']['cell'])

    def test_a_pose_in_an_unrecovered_window_publishes_unanchored(self):
        # Dion has one recovered window, Birmingham Island at 3252,1314. A pose
        # standing in any other window of that body is not anchored by it.
        self.assertEqual([origin for origin, _ in location_ledger.WORKSPACE_ORIGINS[4]],
                         [(3252, 1314)])
        pose = self.read('dion-elsewhere', workspace(4, 0x88, (256, 768)))
        published = location_ledger.published_pose(pose, {'body-4': 'DION'})
        self.assertEqual(published['cell'], 0x88)
        self.assertEqual(published['localCell'], {'x': 8, 'z': 8})
        self.assertIsNone(published['workspaceOrigin'])
        self.assertEqual(published['impliedWorkspaceOrigin'], {'x': 256, 'z': 768})
        self.assertIn('outside every recovered workspace', published['evidence']['cell'])

    def test_a_body_can_carry_more_than_one_recovered_window(self):
        # Gaea carries two: UR CITY at 512,1792 and CHALDEA METROPOLIS at
        # 256,768 (#172). A pose in either is anchored, against its own origin.
        origins = [origin for origin, _ in location_ledger.WORKSPACE_ORIGINS[8]]
        self.assertEqual(sorted(origins), [(256, 768), (512, 1792)])
        for origin, cell in (((512, 1792), 0x24), ((256, 768), 0x88)):
            pose = self.read('gaea', workspace(8, cell, origin))
            published = location_ledger.published_pose(pose, {'body-8': 'GAEA'})
            self.assertEqual(published['workspaceOrigin'], {'x': origin[0], 'z': origin[1]})
            self.assertIn('independently confirmed', published['evidence']['cell'])

    def test_the_body_coordinate_readout_comes_from_the_camera_longwords(self):
        # The Eris start pose: the original's panel prints 016-283 here (#371).
        pose = self.read('eris', workspace(11, 0x87, (64, 128)))
        self.assertEqual(pose['bodyCoordinate']['readout'], '016-283')
        self.assertEqual(pose['bodyCoordinate']['stepX'], 17)
        self.assertEqual(pose['bodyCoordinate']['stepZ'], 290)
        # One step is four cells, so four cells east reads one higher.
        east = workspace(11, 0x8B, (64, 128))
        self.assertEqual(self.read('eris-east', east)['bodyCoordinate']['readout'],
                         '017-283')

    def test_a_readout_the_camera_longwords_disagree_with_is_refused(self):
        ram = bytearray(workspace(11, 0x87, (64, 128)))
        struct.pack_into('>H', ram, location_ledger.BODY_COORDINATE_X, 99)
        with self.assertRaisesRegex(ValueError, 'disagrees with the camera longwords'):
            self.read('bogus', bytes(ram))

    def test_the_terminator_is_published_as_its_inputs_and_checked_against_the_day_flag(self):
        # The Eris start pose stands at night (#494): turn 358 of 1024 puts the
        # observer's System longitude at 375, 28 steps past the sub-stellar $15B,
        # and latitude step 290 leaves bit 9 clear.
        ram = bytearray(workspace(11, 0x87, (64, 128)))
        struct.pack_into('>I', ram, location_ledger.BODY_TURN + 11 * 4, 0x0166_0000)
        struct.pack_into('>H', ram, location_ledger.SUB_STELLAR_LONGITUDE, 0x15B)
        pose = self.read('eris', bytes(ram))
        self.assertFalse(pose['daylight'])
        published = location_ledger.published_pose(pose, {'body-11': 'ERIS'})
        self.assertEqual((published['bodyTurn'], published['subStellarLongitude']),
                         (0x0166_0000, 0x15B))
        # A quarter turn later (#439's jump) the same place is in daylight, and the
        # engine's flag has to say so.
        struct.pack_into('>I', ram, location_ledger.BODY_TURN + 11 * 4, 0x0266_0000)
        with self.assertRaisesRegex(ValueError, 'terminator disagrees'):
            self.read('eris-day', bytes(ram))
        struct.pack_into('>H', ram, location_ledger.DAYLIGHT, 0xFFFF)
        self.assertTrue(self.read('eris-day', bytes(ram))['daylight'])

    def test_the_latitude_half_turn_flips_the_terminator(self):
        # $05057A: the latitude's bit 9 is added in, so across it the answer inverts.
        self.assertFalse(location_ledger.daylight(0x100, 0, 0x100, 0x000))
        self.assertTrue(location_ledger.daylight(0x100, 0, 0x100, 0x200))
        self.assertTrue(location_ledger.daylight(0x100, 0, 0x300, 0x000))
        self.assertFalse(location_ledger.daylight(0x100, 0, 0x300, 0x200))
        # The turn's high word moves the observer's longitude, not the position.
        self.assertTrue(location_ledger.daylight(0x100, 0x0200_0000, 0x100, 0x000))

    def test_a_cell_word_outside_a_workspace_is_refused(self):
        with self.assertRaisesRegex(ValueError, 'outside a 16x16 workspace'):
            self.read('bogus', workspace(2, 0x1B5, (0, 0)))

    def test_the_floor_is_read_from_the_capture(self):
        # Outside a structure both Floor words are 0 and the eye stands at 63.
        published = location_ledger.published_pose(
            self.read('eris', workspace(11, 0x87, (64, 128))), {})
        self.assertEqual(published['floor'], 0)
        # The Vesta transporter capture: Floor 10 at storey 317 (#505).
        ram = bytearray(workspace(14, 0x64, (1083, 307)))
        struct.pack_into('>H', ram, location_ledger.FLOOR, 10)
        struct.pack_into('>H', ram, location_ledger.FLOOR_LIVE, 10)
        struct.pack_into('>H', ram, location_ledger.STOREY, 317)
        struct.pack_into('>i', ram, location_ledger.CAMERA_Y, 3233)
        published = location_ledger.published_pose(self.read('vesta', bytes(ram)), {})
        self.assertEqual(published['floor'], 10)
        self.assertEqual(published['position']['y'], 3233)

    def test_a_floor_the_capture_does_not_agree_on_is_refused(self):
        ram = bytearray(workspace(14, 0x64, (1083, 307)))
        struct.pack_into('>H', ram, location_ledger.FLOOR, 10)
        struct.pack_into('>H', ram, location_ledger.STOREY, 317)
        struct.pack_into('>i', ram, location_ledger.CAMERA_Y, 3233)
        with self.assertRaisesRegex(ValueError, r'disagrees with \$7AC4'):
            self.read('bogus', bytes(ram))
        struct.pack_into('>H', ram, location_ledger.FLOOR_LIVE, 10)
        struct.pack_into('>i', ram, location_ledger.CAMERA_Y, 3000)
        with self.assertRaisesRegex(ValueError, 'is not Floor 10 x storey 317'):
            self.read('bogus', bytes(ram))


if __name__ == '__main__':
    unittest.main()
