import json
import unittest

from _capture import capture
from m3lab.scripts import extract_scripts

OPENING = [
    'MESSAGE FROM THE CHIEF PRISON OFFICER:',
    'YOUR SENTENCE WAS TO WAIT HERE FOR MERCENARY III',
    "CONGRATULATIONS ON YOUR PATIENCE - IT'S ARRIVED!",
    'YOU WILL NOW FIND THINGS SOMEWHAT DIFFERENT SO',
    'I HAVE ADDED TWO ITEMS TO YOUR POSSESSIONS',
    'QUITE ESSENTIAL - A BUS PASS AND A TAXICARD',
    'THERE HAS BEEN A CALL FOR YOU TODAY',
    'A MR P C BIL INVITES YOU TO CALL ON HIM . .',
    'HIS PERSONAL CRAFT AWAITS YOU AT THE SPACEPORT',
    'OH YES - THE LETTER OUTSIDE ARRIVED THIS MORNING',
    "GOOD LUCK - CALL A TAXI WHEN YOU'RE READY TO GO",
    "PRESS 'ENTER' KEY TO ACTIVATE YOUR TAXICARD",
    "PRESS * TO CALL TAXI - ON ARRIVAL 'B' TO BOARD",
]


class ScriptTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.out = extract_scripts(capture())
        cls.ins = {i['address']: i for r in cls.out['routines'] for i in r['instructions']}

    def test_serialisable(self):
        json.dumps(self.out)

    def test_entries(self):
        self.assertEqual({e['script']: e['address'] for e in self.out['entries']},
                         {'$19': '$6FF57', '$33': '$701E0', '$34': '$703B5'})

    def test_decode_is_closed(self):
        self.assertTrue(all(r['aligned'] for r in self.out['routines']))
        self.assertEqual(self.out['unresolved_targets'], [])
        self.assertEqual(self.out['unknown_opcodes'], [])

    def test_opening_texts(self):
        self.assertEqual(self.out['summary']['$19']['texts'], OPENING)

    def test_trip_texts(self):
        sol = self.out['summary']['$34']['texts']
        self.assertEqual(sol, ["DOOBERRY'S IT IS - AND THE GUVENOR IS PAYING",
                               "HERE'S WISHING YOU THE VERY BEST OF LUCK"])
        sp = self.out['summary']['$33']['texts']
        self.assertEqual(len(sp), 16)
        self.assertEqual(self.out['summary']['$33']['blank_calls'], 8)
        self.assertIn('WELL HERE WE ARE', sp)
        self.assertEqual(sp[-1], "PRESS 'B' TO BOARD THE SPACECRAFT")

    def test_key_bit(self):
        op = self.ins['$6FF5F']
        self.assertEqual((op['op'], op['operands']), ('$20', ['$26', '$87']))
        self.assertEqual(op['note'], 'set bit 7 of $64B6')

    def test_shared_waits(self):
        self.assertEqual(self.out['shared_waits'],
                         {'$766DF': 50, '$766E6': 100, '$766ED': 150, '$766F4': 200,
                          '$766FB': 250, '$76702': 500, '$76709': 750})

    def test_cabin_animation_writes(self):
        self.assertEqual(self.out['summary']['$33']['cabin_animation'],
                         ['$0410', '$0407', '$040A', '$0407', '$0410', '$0410', '$0407'])
        self.assertEqual(self.out['summary']['$34']['cabin_animation'], ['$0410', '$0407'])


if __name__ == '__main__':
    unittest.main()
