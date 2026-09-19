"""What bounds each family of Damocles geometry (#370).

The ground family is the only one bounded by a cell window, and that window's
radius is not a constant: ``$054BB6`` indexes the table at ``$00915A`` by the
camera altitude ``$7A30 >> 11`` and caches the byte in ``$7B62``. Entry 0 is
zero, so on foot the window is the occupied cell alone. A capture can still
hold a wider window, because a cache latched at altitude stands until something
recomputes it -- and ``$054B84`` forces that recompute by storing ``$FF`` on
every cell change.

These tests pin the arithmetic that reading depends on, using synthetic RAM so
they need no Restricted Material: the index and its clamp, the latch, the
``$FF`` invalidation, and the gate that refuses a capture whose table is not the
canonical curve.
"""

import hashlib
import importlib.util
import struct
import sys
import unittest
from pathlib import Path

LAB_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB_ROOT))

_spec = importlib.util.spec_from_file_location(
    'draw_reach_check', LAB_ROOT / 'scripts' / 'draw-reach-check.py')
check = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(check)


def canonical_table() -> bytes:
    """Rebuild the $00915A curve the Working Authority carries.

    Entries 0..4 are 0, 1, 2, 3, 3; from index 5 the radius steps once every
    five entries to index 9, then once every four for the rest of the table.
    """
    table = bytearray([0, 1, 2, 3, 3])
    table += bytes([4] * 5)
    table += bytes([5] * 6)
    table += bytes([6] * 8)
    table += bytes([7] * 8)
    value = 8
    while len(table) < 256:
        table += bytes([value] * 4)
        value += 1
    table = table[:256]
    assert hashlib.sha256(bytes(table)).hexdigest() == check.CANONICAL_TABLE_SHA256
    return bytes(table)


CANONICAL = canonical_table()


def ram(*, altitude: int, cached: int, cell: int = 0x87,
        camera: tuple[int, int] = (7, 8), table: bytes = CANONICAL) -> bytes:
    """A synthetic ST RAM window carrying just the words the check reads."""
    data = bytearray(0x100000)
    data[check.RADIUS_TABLE:check.RADIUS_TABLE + 256] = table
    struct.pack_into('>i', data, check.CAMERA_Y, altitude)
    struct.pack_into('>h', data, check.CAMERA_X, camera[0])
    struct.pack_into('>h', data, check.CAMERA_Z, camera[1])
    struct.pack_into('>H', data, check.GRID_X, 16)
    struct.pack_into('>H', data, check.GRID_Z, 16)
    struct.pack_into('>H', data, check.CELL, cell)
    struct.pack_into('>H', data, check.WALK_FLAG, 1)
    data[check.RADIUS_CACHE] = cached
    # $7B5D gates the own-cell seeds; ground-extent-check refuses a zero.
    data[0x7B5D] = 0x87
    return bytes(data)


class RadiusCurve(unittest.TestCase):
    def test_on_foot_altitude_indexes_a_zero_radius(self):
        """63 >> 11 is 0, and the table's first entry is 0."""
        self.assertEqual(CANONICAL[0], 0)
        ground = check.check(ram(altitude=63, cached=0), reconstruct=False)['families']['ground']
        self.assertEqual(ground['altitudeIndex'], 0)
        self.assertEqual(ground['tableRadius'], 0)
        self.assertEqual(ground['state'], 'settled')
        self.assertEqual(ground['reach'], 'the occupied cell alone')
        self.assertEqual(ground['routeList'], 'unbuilt: radius zero')

    def test_the_radius_grows_with_altitude(self):
        for altitude, radius in ((2048, 1), (4096, 2), (6144, 3), (10240, 4),
                                 (0x8000, 6), (0x40000, 32)):
            with self.subTest(altitude=altitude):
                ground = check.check(ram(altitude=altitude, cached=radius), reconstruct=False)['families']['ground']
                self.assertEqual(ground['tableRadius'], radius)
                self.assertEqual(ground['state'], 'settled')

    def test_the_index_is_clamped_to_the_table(self):
        """$054BBE caps the index at $FF however high the camera is."""
        ground = check.check(ram(altitude=0x7FFFFFFF, cached=CANONICAL[255]), reconstruct=False)['families']['ground']
        self.assertEqual(ground['altitudeIndex'], 0xFF)
        self.assertEqual(ground['tableRadius'], CANONICAL[255])


class Latch(unittest.TestCase):
    def test_a_wider_cache_on_foot_reads_as_latched(self):
        """The pinned arrival capture's state: altitude 0, cache 3."""
        ground = check.check(ram(altitude=63, cached=3), reconstruct=False)['families']['ground']
        self.assertEqual(ground['tableRadius'], 0)
        self.assertEqual(ground['cachedRadius'], 3)
        self.assertEqual(ground['state'], 'latched from a higher altitude')
        self.assertEqual(ground['reach'], 'a 7 x 7 cell square')

    def test_the_cell_change_sentinel_is_accepted(self):
        """$054B84 stores $FF, which equals no table entry, so $054888 rebuilds."""
        report = check.check(ram(altitude=63, cached=check.INVALID_RADIUS), reconstruct=False)
        self.assertTrue(report['pass'])
        self.assertEqual(report['families']['ground']['cachedRadius'], 0xFF)

    def test_a_cache_the_table_cannot_produce_fails(self):
        report = check.check(ram(altitude=63, cached=0x7E), reconstruct=False)
        self.assertNotIn(0x7E, set(CANONICAL))
        self.assertFalse(report['pass'])
        self.assertEqual([c['check'] for c in report['checks'] if not c['pass']],
                         ['radius-reachable'])


class TableGate(unittest.TestCase):
    def test_an_unloaded_capture_is_refused(self):
        report = check.check(ram(altitude=0, cached=0, table=bytes(256)), reconstruct=False)
        self.assertFalse(report['pass'])
        self.assertEqual([c['check'] for c in report['checks'] if not c['pass']],
                         ['radius-table'])

    def test_a_patched_low_entry_is_refused(self):
        """One run in the work tree holds 03 03 03 at $915A..$915C. It is kept
        and not used: a table the Working Authority did not load is not evidence."""
        patched = bytearray(CANONICAL)
        patched[0:3] = b'\x03\x03\x03'
        report = check.check(ram(altitude=63, cached=3, table=bytes(patched)), reconstruct=False)
        self.assertFalse(report['pass'])
        self.assertEqual([c['check'] for c in report['checks'] if not c['pass']],
                         ['radius-table'])


class OtherFamilies(unittest.TestCase):
    def test_structures_are_bound_to_the_occupied_cell(self):
        families = check.check(ram(altitude=63, cached=0), reconstruct=False)['families']
        self.assertEqual(families['structures']['boundCell'], '0x87')
        self.assertIn('occupied cell alone', families['structures']['reach'])

    def test_objects_carry_no_distance_test(self):
        families = check.check(ram(altitude=63, cached=0), reconstruct=False)['families']
        self.assertIn('whole body', families['objects']['reach'])


if __name__ == '__main__':
    unittest.main()
