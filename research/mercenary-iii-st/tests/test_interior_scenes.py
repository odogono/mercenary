"""The original-scene recipe keeps indoor residence and rejects false matches."""
import struct
import unittest

from m3lab.ram import Ram
from m3lab.interior_scenes import destination_commands, validate_scene, bound_hooks


class InteriorSceneTests(unittest.TestCase):
    def test_existing_indoor_destination_keeps_its_residence(self):
        commands = destination_commands(30, 256)
        self.assertIn('r d0=$78', commands)
        self.assertIn('r pc=$5a006', commands)
        self.assertFalse(any(c.startswith('w $681') for c in commands))
        self.assertFalse(any(c.startswith('w $58') for c in commands))

    def test_displaced_midas_pose_keeps_periodic_cell_and_indoor_metadata(self):
        data = bytearray(0x100000)
        slot = 101
        for address, value in ((0x581C, 139099916), (0x5C1C, 30), (0x601C, 238059817)):
            struct.pack_into('>I', data, address + 4 * slot, value)
        data[0x681C + 4 * slot:0x6820 + 4 * slot] = bytes((8, 1, 0, 0x69))
        data[0x641D + 4 * slot] = 56
        commands = destination_commands(slot, 0, opening=Ram(bytes(data)), cells=(16, 0))
        self.assertIn('w $6840 $08 $01 $00 $69', commands)
        self.assertIn('w $6441 $38', commands)
        self.assertIn('r d0=$24', commands)
        self.assertIn('w $5840 $08 $5a $7f $0c', commands)

    def test_original_hook_list_keeps_own_region_tail_before_explicit_hooks(self):
        data = bytearray(0x100000)
        data[0x50F0:0x50F9] = bytes((30, 3, 0, 1, 8, 2, 4, 0, 0))
        self.assertEqual(bound_hooks(Ram(bytes(data))), {30: [[3, 0], [1, 8], [2, 4]]})

    def test_wrong_floor_cannot_count_as_a_valid_scene(self):
        data = bytearray(0x100000)
        struct.pack_into('>H', data, 0x6FDE, 2)
        struct.pack_into('>H', data, 0x71F4, 3)
        struct.pack_into('>H', data, 0x7158, 0)
        resident = {'slot': 30, 'group': 2, 'cell': 3, 'floor': 4}
        with self.assertRaisesRegex(ValueError, 'Floor'):
            validate_scene(Ram(bytes(data)), resident, {}, [0, 0, 0])


if __name__ == '__main__':
    unittest.main()
