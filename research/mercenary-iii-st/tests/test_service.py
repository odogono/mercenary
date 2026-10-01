import json
import unittest

from _capture import capture
from m3lab.service import extract_service

ROUTE = [(2, 6), (1, 6), (0, 6), (0, 5), (0, 4), (0, 3), (0, 2), (0, 1), (1, 1), (2, 1), (3, 1), (4, 1), (4, 0),
         (3, 0), (2, 0), (3, 0), (4, 0), (4, 1), (4, 2), (4, 3), (3, 3), (2, 3), (1, 3), (1, 4), (1, 5), (1, 6)]
# The cadence model's per-cell nibbles for the first sixteen points (#642).
NIBBLES = [0, 0, 0, 3, 7, 7, 3, 0, 1, 1, 1, 0, 0, 1, 0, 1]


class ServiceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.out = extract_service(capture())

    def test_serialisable(self):
        json.dumps(self.out)

    def test_definition(self):
        taxi = self.out['taxi']
        self.assertTrue(taxi['lookup']['matches'])
        self.assertEqual((taxi['rate'], taxi['metadata'], taxi['route_origin']), (-1024, '$2528020E', '$41F22'))
        self.assertEqual((taxi['arrival_message'], taxi['boarding_message']), ('$25', '$28'))

    def test_route(self):
        points = self.out['taxi']['points']
        self.assertEqual([tuple(p['cell']) for p in points], ROUTE)
        self.assertEqual([p['control'] for p in points[:16]], NIBBLES)
        self.assertEqual(self.out['taxi']['terminator'], '$41F56')

    def test_destinations_and_narrative(self):
        self.assertEqual([d['code'] for d in self.out['destinations']], ['$62', '$60', '$02'])
        first = self.out['narrative'][:2]
        self.assertEqual([(n['origin'], n['destination'], n['script']) for n in first],
                         [('$62', '$02', '$33'), ('$62', '$60', '$34')])

    def test_heights(self):
        h = self.out['heights']
        self.assertEqual(h['descent']['heights'], [25, 20, 16, 13, 10, 7, 5, 3, 2, 1] + [0] * 10)
        self.assertEqual(h['lift_off']['heights'], [5, 10, 20, 35, 45, 45, 40, 30, 20, 20, 22, 26, 25])
        self.assertEqual((h['descent']['terminator'], h['lift_off']['terminator']), ('$51CB6', '$51CC4'))

    def test_head_turns(self):
        seq = {s['value']: s['counts'] for s in self.out['head_turns']['sequences']}
        self.assertEqual(seq['$0407'], [1, 8])
        self.assertEqual(seq['$040A'], [3, 5])
        self.assertEqual(seq['$0410'], [1, 7, 5, 7])
        self.assertEqual(seq['$041A'], [3, 5, 5, 5])

    def test_labels(self):
        codes = {r['code']: r['text'] for r in self.out['labels']['records']}
        self.assertEqual(codes['$60'], 'DOOBERRYS SOLICITORS')
        self.assertEqual(self.out['labels']['header'], 'METIS     MOONBASE  ')

    def test_opening_state_invariants(self):
        state = self.out['opening_state']
        self.assertEqual(state['carried']['count'], 3)
        self.assertEqual(state['carried']['head_item'], '$68')
        self.assertEqual(state['cash_bcd']['digits'], '005100900000')


if __name__ == '__main__':
    unittest.main()
