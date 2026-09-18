"""Drop placement above level 0, from the #326 interior captures (#331, #318).

The drop research recovered two placement paths from instructions and could
exercise neither above level 0, because every replayable pose was outdoors with
``$7AC5`` and ``$7AA5`` both zero. That left three things unsettled: whether
those two bytes are one quantity, and whether the model-form and height gates
behave as read.

These tests pin what the live runs established. They assert against the recorded
run results rather than re-driving the emulator, so they stay deterministic; the
run directories are Restricted Material and the tests skip without them.
"""

import json
import unittest
from pathlib import Path

LAB_ROOT = Path(__file__).resolve().parents[1]
WORK = LAB_ROOT / 'work'

# The two runs behind docs/research/damocles-object-drops.md.
DIRECT = 'support-drop-multi-drop-20260918T134822Z-5593cc1f'    # vesta-transporter, level 10
SUPPORT = 'support-drop-multi-drop-20260918T135011Z-b396d011'   # metis-transporter, level 9


def load(run: str) -> dict:
    path = WORK / run / 'result.json'
    if not path.is_file():
        raise unittest.SkipTest(f'{run} lives in the ignored research workspace')
    return json.loads(path.read_text())


class LevelByteIdentityTests(unittest.TestCase):
    """$7AC5 and $7AA5 hold one quantity, shown where it is non-zero."""

    def test_the_two_level_bytes_agree_at_level_ten(self):
        for sample in load(DIRECT)['samples']:
            state = sample['state']
            self.assertEqual(state['dropLevelByte'], 10)
            self.assertEqual(state['builderLevelByte'], 10)

    def test_the_two_level_bytes_agree_at_level_nine(self):
        for sample in load(SUPPORT)['samples']:
            state = sample['state']
            self.assertEqual(state['dropLevelByte'], 9)
            self.assertEqual(state['builderLevelByte'], 9)


class DirectPlacementAboveGroundTests(unittest.TestCase):
    """vesta-transporter, level 10: the direct write set, field for field."""

    def setUp(self):
        samples = load(DIRECT)['samples']
        self.before, self.after = samples[0], samples[1]
        self.placed = self.after['state']['residents']['191']

    def test_the_key_leaves_the_carried_stack(self):
        self.assertEqual(self.before['state']['carriedCount'], 4)
        self.assertEqual(self.before['state']['carriedStack'][0], 191)
        self.assertEqual(self.after['state']['carriedCount'], 3)
        self.assertEqual(self.before['state']['residents']['191']['carried'], 1)
        self.assertEqual(self.placed['carried'], 0)

    def test_the_position_is_the_players_eye_minus_sixty_three(self):
        state = self.after['state']
        self.assertEqual(self.placed['x'], state['playerX'])
        self.assertEqual(self.placed['z'], state['playerZ'])
        self.assertEqual(self.placed['y'], state['playerY'] - 63)

    def test_the_association_records_the_non_zero_level(self):
        # body $38 VESTA, insertion $08, level $0A, cell $64.
        self.assertEqual(self.placed['associationB'], '0x38080a64')
        body, insertion, level, cell = bytes.fromhex(self.placed['associationB'][2:])
        self.assertEqual(level, self.after['state']['dropLevelByte'])
        self.assertEqual(cell, self.after['state']['cell'])
        self.assertEqual(insertion, self.after['state']['region'])
        self.assertEqual(body, int(self.after['state']['body'], 16))


class SupportPlacementAboveGroundTests(unittest.TestCase):
    """metis-transporter, level 9: the rank check passes, so both gates run."""

    def setUp(self):
        samples = load(SUPPORT)['samples']
        self.after = samples[1]
        self.placed = self.after['state']['residents']['191']
        # FILOFAX slot 133, read from the capture: supplies rank 1, 27 units away.
        self.support = {'associationA': '0x00030504', 'associationB': '0x3c050960',
                        'x': 165642643, 'y': 1350, 'z': 70288862}

    def test_the_object_takes_the_supports_position_not_the_players(self):
        state = self.after['state']
        self.assertEqual(self.placed['x'], self.support['x'])
        self.assertEqual(self.placed['z'], self.support['z'])
        self.assertNotEqual(self.placed['x'], state['playerX'])
        self.assertNotEqual(self.placed['z'], state['playerZ'])

    def test_the_height_gate_accepts_and_the_object_rests_on_the_model_top(self):
        state = self.after['state']
        top = self.placed['y']
        self.assertEqual(top, self.support['y'] + 30)
        self.assertLess(top, state['playerY'])
        # Direct placement would have written the player's eye minus 63 instead.
        self.assertNotEqual(top, state['playerY'] - 63)

    def test_the_object_inherits_all_four_association_b_bytes(self):
        self.assertEqual(self.placed['associationB'], self.support['associationB'])

    def test_the_object_keeps_its_own_class_byte(self):
        placed = bytes.fromhex(self.placed['associationA'][2:])
        support = bytes.fromhex(self.support['associationA'][2:])
        self.assertEqual((placed[0], placed[1]), (support[0], support[1]))
        self.assertNotEqual(placed[2], support[2])
        self.assertEqual(placed[2], self.after['state']['dropClassByte'])


if __name__ == '__main__':
    unittest.main()
