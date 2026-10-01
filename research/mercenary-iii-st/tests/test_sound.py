import json
import unittest

from _capture import capture
from m3lab.sound import extract_sound


class SoundTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.out = extract_sound(capture())
        cls.p = {p['name']: p for p in cls.out['programmes']}

    def test_serialisable(self):
        json.dumps(self.out)

    def test_ten_programmes_and_ambient(self):
        self.assertEqual(set(self.p), {'key_click', 'door_moving', 'door_stop', 'taxi_set_down', 'lift_off',
                                       'engine', 'leave', 'message_tone', 'cut', 'reset', 'ambient'})

    def test_key_click(self):
        setup = self.p['key_click']['setup']
        self.assertEqual(setup['tone_b_period'], 0x60)
        self.assertEqual((setup['envelope_period'], setup['envelope_shape']), (0x1F00, 9))

    def test_level_streams(self):
        self.assertEqual(self.p['taxi_set_down']['streams'][0]['vbl'], 55)
        self.assertEqual(self.p['lift_off']['streams'][0]['vbl'], 41)
        self.assertEqual(self.p['door_stop']['streams'][1]['vbl'], 4)
        door = self.p['door_moving']['streams']
        self.assertEqual(door[0]['pairs'], [[1, 1000], [1, 1050]])
        self.assertEqual(door[0]['loops_to_pair'], 0)
        self.assertEqual(door[1]['loops_to_pair'], 6)

    def test_engine_rule(self):
        hz = {t['control_low3']: t['hz'] for t in self.out['engine_rule']['targets']}
        self.assertEqual((hz[0], hz[1], hz[3], hz[7]), (75.12, 81.38, 97.66, 162.76))

    def test_reset_table(self):
        regs = self.p['reset']['setup']['registers']
        self.assertEqual(list(regs.values()), [1, 0, 1, 0, 1, 0, 0x1F, 0xDA, 0, 0x10, 0, 0, 0])


if __name__ == '__main__':
    unittest.main()
