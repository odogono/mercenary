"""Census debugger scripts must select the claimed groups, including decimal 10+."""

import unittest
from pathlib import Path

from m3lab.census_capture import debugger_scripts, validate_capture
from m3lab.ram import RAM_SIZE, Ram


class CensusCaptureTests(unittest.TestCase):
    def test_write_values_are_unambiguously_hexadecimal_for_every_group(self):
        scripts = debugger_scripts(Path('/ignored/census'))
        for group in range(57):
            with self.subTest(group=group):
                line = scripts[f'all-groups/group-{group:02d}.ini'].splitlines()[0]
                command, address, high, low = line.split()
                self.assertEqual((command, address), ('w', '$6fde'))
                self.assertTrue(high.startswith('$') and low.startswith('$'))
                self.assertEqual(int(high[1:], 16) * 256 + int(low[1:], 16), group)

    def test_last_authored_pass_continues_to_midas_uniform_capture(self):
        scripts = debugger_scripts(Path('/ignored/census'))
        self.assertIn('parse /ignored/census/midas/group.ini',
                      scripts['all-groups/save-56.ini'])
        self.assertIn('w $70c0 $ff $ff', scripts['midas/group.ini'])
        self.assertIn('group-56-uniform.ram', scripts['midas/save.ini'])
        self.assertEqual(scripts['midas/save.ini'].splitlines()[-1], 'quit')

    def test_wrong_saved_group_is_rejected_before_decoding(self):
        data = bytearray(RAM_SIZE)
        data[0x6FDE:0x6FE0] = bytes([0, 16])
        with self.assertRaisesRegex(ValueError, 'group 16, expected 10'):
            validate_capture(Ram(bytes(data)), 10, uniform=False)

    def test_unintended_uniform_mode_is_rejected(self):
        data = bytearray(RAM_SIZE)
        data[0x6FDE:0x6FE0] = bytes([0, 56])
        data[0x70C0:0x70C2] = bytes([255, 255])
        with self.assertRaisesRegex(ValueError, 'uniform mode'):
            validate_capture(Ram(bytes(data)), 56, uniform=False)


if __name__ == '__main__':
    unittest.main()
