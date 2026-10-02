"""Recover road pass inputs from each Settlement's own authored stream."""
import struct
import unittest

from damocleslab.catalogue import road_line_inputs


class RoadLineRecoveryTests(unittest.TestCase):
    def test_retains_overwritten_run_cells_and_the_group_colour(self):
        data = bytearray(0x100000)
        struct.pack_into('>H', data, 0x1E64C, 0x1000)
        struct.pack_into('>H', data, 0x1F004, 0x100)
        # First row run is 7..11; a later overlapping run is 9..13.
        # Slot 8 keeps the first, slot 10 keeps the second.
        stream = bytes([9, 7, 11, 9, 9, 13, 0, 0x03, 0x22]) + bytes(6)
        data[0x1F102:0x1F102 + len(stream)] = stream
        recovered = road_line_inputs(bytes(data), 2)
        self.assertEqual(len(recovered['corners']), 256)
        self.assertEqual(recovered['corners'][0x88], 0x878B0000)
        self.assertEqual(recovered['corners'][0x8A], 0x898D0000)
        self.assertEqual(recovered['sourceRoadColour'], 0x322)
        self.assertEqual(recovered['roadColour'], '#664444')

