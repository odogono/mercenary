"""The committed Dion Catalogue coverage ledger against the merged #678 census.

These run without original captures: the ledger is checked on its own and
reconciled with the generated census documents. Set M3_CENSUS_RUN to a
census_capture run to also prove the committed ledger regenerates exactly.
"""

import copy
import json
import os
import re
from pathlib import Path
import unittest

from m3lab.catalogue_ledger import (LEDGER_PATH, REPOSITORY, build_ledger, completion,
                                    dumps, load_ledger, validate_ledger)

DOCS = REPOSITORY / 'docs'


def rows(path: Path, pattern: str) -> list[re.Match]:
    return [m for line in path.read_text().splitlines() if (m := re.match(pattern, line))]


class CatalogueLedgerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ledger = load_ledger()
        cls.geometry = {g['id']: g for g in cls.ledger['geometry']}
        cls.slots = {s['slot']: s for s in cls.ledger['structureSlots']}

    def problems(self, mutate) -> list[str]:
        ledger = copy.deepcopy(self.ledger)
        mutate(ledger)
        return validate_ledger(ledger)

    def test_committed_ledger_is_valid(self):
        self.assertEqual(validate_ledger(self.ledger), [])

    def test_accounts_for_the_whole_census(self):
        totals = self.ledger['totals']
        self.assertEqual((totals['objectSlots'], totals['groups'], totals['authoredBindings'],
                          totals['initialBindings'], totals['selectedStructureSlots'],
                          totals['floorGeometrySlots'], totals['bodies']),
                         (246, 57, 795, 794, 198, 78, 31))
        self.assertEqual(totals['residence'],
                         {'structure': 180, 'surface': 38, 'out-of-world': 25, 'carried': 3})
        self.assertEqual(self.ledger['carriedStack'], [104, 103, 135])

    def test_every_group_has_an_explicit_disposition(self):
        by = {}
        for g in self.ledger['groups']:
            by.setdefault(g['disposition'], []).append(g['group'])
        self.assertEqual(by['unused'], [1, 10, 13, 19, 25, *range(41, 49)])
        self.assertEqual(by['outline-only'], list(range(29, 41)))  # LUCAN
        self.assertEqual(by['label-only'], [54])  # CRONUS MUSEUM
        self.assertEqual((by['bare-islands'], by['void-storage'], by['repeating-field']),
                         ([0], [49], [56]))
        self.assertEqual(len(by['settlement']), 28)

    def test_midas_is_a_rule_not_a_count(self):
        midas = self.ledger['midas']
        self.assertIsNone(midas['physicalCount'])
        self.assertEqual((midas['period'], midas['workspaceBindings'], midas['workspaceSlots']),
                         (16, 256, [68]))
        self.assertEqual(midas['residents'], [101, 118])
        self.assertEqual([b['id'] for b in self.ledger['bindings'] if b['group'] == 56],
                         ['placement-56-00'])
        for slot in (101, 118):
            self.assertEqual(self.ledger['objects'][slot - 1]['host'],
                             {'field': 'midas', 'cell': 0x69})
        self.assertIn('MIDAS is a repeating field', ' '.join(self.problems(
            lambda d: d['midas'].update(physicalCount=256))))

    def test_logos_construction_has_two_inspection_states(self):
        logos = self.ledger['logos']
        self.assertEqual((logos['binding'], logos['slot']), ('placement-08-32', 136))
        self.assertEqual([s['slot'] for s in logos['states']], [None, 136])
        logos_group = self.ledger['groups'][8]
        self.assertEqual((logos_group['authoredBindings'], logos_group['initialBindings']),
                         (24, 23))

    def test_shared_geometry_is_separate_from_placements(self):
        houses = [b for b in self.ledger['bindings'] if b['slot'] == 100]
        self.assertGreater(len(houses), 1)
        self.assertEqual(len({b['id'] for b in houses}), len(houses))
        geometry = self.geometry[self.slots[100]['floors'][0][2]]
        self.assertEqual(geometry['record'], '$18470')
        self.assertNotIn('name', geometry)
        # Interior floors of COMPANIES HOUSE share one geometry above Floor 0.
        self.assertEqual({key for f, _, key in self.slots[203]['floors'] if f},
                         {'structure-0116b8'})

    def test_object_rows_reconcile_with_the_object_census(self):
        found = rows(DOCS / 'dion-object-locations.md',
                     r'^\| (\d+) \| `\$[0-9A-F]+` \| (.*?) \| (.*?) \| (.*?) \| (.*?) \| (.*?) \| (.*?) \| (.*?) \| (.*?) \|$')
        self.assertEqual([int(m[1]) for m in found], list(range(1, 247)))
        bodies = {b['id']: b['name'] for b in self.ledger['bodies']}
        for m, o in zip(found, self.ledger['objects']):
            with self.subTest(slot=o['slot']):
                self.assertEqual(m[2], o['name'] or 'Unnamed slot')
                self.assertEqual(m[3], bodies[o['body']] if o['body'] else '—')
                self.assertEqual(m[6], str(o['floor']) if o['floor'] is not None else '—')
                cell = f"`{o['bodyCell'][0]}, {o['bodyCell'][1]}`" if o['bodyCell'] else '—'
                self.assertEqual(m[7], cell)
                record = self.geometry[o['geometry']]['record'] if o['geometry'] else '—'
                self.assertEqual(m[9].strip('`'), record)
                residence = {'Carried': 'carried', 'Out of world': 'out-of-world'}.get(m[4])
                if residence is None:
                    residence = 'surface' if m[4].endswith('/ Surface') else 'structure'
                self.assertEqual(residence, o['residence'])

    def test_bindings_reconcile_with_the_structure_census(self):
        path = DOCS / 'dion-structure-locations.md'
        placed = rows(path, r'^\| `(\d+):([0-9A-F]{2})` \| .*? \| (\d+) → (\d+) \| `(\$[0-9A-F]+)` \|')
        cells = {(int(m[1]), int(m[2], 16)): (int(m[3]), int(m[4]), m[5]) for m in placed}
        self.assertEqual(len(cells), len(placed))
        seed = re.search(r'seed binding, \*\*`56:00`\*\*, selected slot \*\*(\d+)\*\*, geometry\n?'
                         r'\*\*(\d+)\*\*, record \*\*`(\$[0-9A-F]+)`', path.read_text())
        cells[(56, 0)] = (int(seed[1]), int(seed[2]), seed[3])
        ledger = {(b['group'], b['cell']): b for b in self.ledger['bindings']}
        self.assertEqual(set(cells), set(ledger))
        for key, (slot, geometry_slot, record) in cells.items():
            floor0 = self.slots[ledger[key]['slot']]['floors'][0]
            self.assertEqual((ledger[key]['slot'], floor0[1], self.geometry[floor0[2]]['record']),
                             (slot, geometry_slot, record), key)

    def test_structure_slots_reconcile_with_the_floor_index(self):
        found = rows(DOCS / 'dion-structure-locations.md',
                     r'^\| (\d+) \| `(\$[0-9A-F]+)` \| `(-?\d+), (-?\d+)` \| (\d+) \| (.*?) \| (.*?) \|$')
        self.assertEqual([int(m[1]) for m in found], sorted(self.slots))
        for m in found:
            s = self.slots[int(m[1])]
            with self.subTest(slot=s['slot']):
                self.assertEqual((m[2], [int(m[3]), int(m[4])], int(m[5])),
                                 (s['record'], s['scale'], s['detailIndex']))
                self.assertEqual(m[6], str(s['pitch']) if s['pitch'] is not None else '—')
                if 'empty road' in m[7]:
                    continue
                floors = {}
                for part in m[7].split('; '):
                    indices, geometry_slot = part.split(' → ')
                    for index in indices.split(','):
                        floors[int(index)] = int(geometry_slot)
                self.assertEqual(floors, {f: g for f, g, _ in s['floors']})

    def test_every_family_names_its_decoder_and_owner(self):
        families = {g['family'] for g in self.ledger['geometry']}
        self.assertEqual(families, {'model', 'structure', 'detail', 'island', 'ground'})
        self.assertLessEqual(families, set(self.ledger['decoders']))
        self.assertEqual([f for f, d in self.ledger['decoders'].items() if d['module'] is None], [])
        owners = {(g['family'], g['owner']) for g in self.ledger['geometry']}
        # Street-furniture models reach the census only through ground templates (#682).
        self.assertEqual(owners, {('model', 681), ('model', 682), ('structure', 682),
                                  ('structure', 683), ('detail', 682), ('island', 682),
                                  ('ground', 682)})
        self.assertIn('decoder m3lab.geometry.decode_nothing does not exist', self.problems(
            lambda d: d['decoders']['model'].update(function='decode_nothing')))

    def test_required_missing_geometry_keeps_the_milestone_open(self):
        c = self.ledger['completion']
        self.assertFalse(c['complete'])
        self.assertEqual(c['required'], len(self.ledger['geometry']))

        def finished(d):
            for g in d['geometry']:
                if g['family'] != 'island':
                    g.update(state='recovered', preview={'catalogue': True})
            d['gaps'] = [gap for gap in d['gaps'] if not gap['blocking']]
        done = copy.deepcopy(self.ledger)
        finished(done)
        # Recovered but unpreviewed geometry still keeps the milestone open.
        self.assertFalse(completion(done)['complete'])
        self.assertEqual(completion(done)['outstandingByOwner'], {'682': 17})
        for g in done['geometry']:
            g.update(state='recovered', preview={'catalogue': True})
        self.assertTrue(completion(done)['complete'])
        self.assertIn('completion disagrees with the ledger', validate_ledger(done))

    def test_recovery_needs_a_decoder_path(self):
        def lose_decoder(d):
            d['decoders']['island'].update(module=None, function=None)
        problems = self.problems(lose_decoder)
        self.assertTrue(any('without a decoder path' in p for p in problems))
        self.assertIn('family island has no decoder and no blocking gap', problems)

    def test_surface_recovery_is_accounted(self):
        surface = [g for g in self.ledger['geometry'] if g['owner'] == 682]
        self.assertTrue(all(g['state'] in ('recovered', 'empty') and g['sha256'] for g in surface))
        self.assertEqual(sum(g['family'] == 'ground' for g in surface), 153)
        self.assertEqual(self.ledger['totals']['surfaceCells'], 44 * 256)
        # Road structure 146 and the plain ground most cells name hold nothing to draw.
        empty = {g['id'] for g in surface if g['state'] == 'empty'}
        self.assertIn('structure-019d0e', empty)
        self.assertEqual(max((g for g in surface if g['family'] == 'ground'),
                             key=lambda g: g['references'])['id'], 'ground-01b250')
        self.assertIn('ground-01b250', empty)
        self.assertEqual({g['id'] for g in self.ledger['resolvedGaps']},
                         {'island-decoder', 'ground-inventory', 'detail-lettering',
                          'empty-road-geometry'})
        self.assertEqual({t for t, kind in self.ledger['lettering'].items() if kind == 'placement'},
                         {'$89', '$9D'})
        self.assertEqual([s['ramSha256'] is not None for s in self.ledger['logos']['states']],
                         [True, True])
        self.assertIn('gap island-decoder is both open and resolved', self.problems(
            lambda d: d['gaps'].append({**d['gaps'][0], 'id': 'island-decoder'})))
        self.assertTrue(any('ground references cover' in p for p in self.problems(
            lambda d: d['totals'].update(surfaceCells=256))))

    def test_original_scene_comparisons_are_recorded(self):
        scenes = {c['id']: c for c in self.ledger['comparisons'] if c['kind'] == 'scene'}
        # Every structure scene matches; the coasts expose the planner's missing sea fill.
        for name in ('companies-house', 'connection-mirrored', 'olearys-farm', 'empty-slot-100',
                     'connection-lettered', 'charlenes-disco', 'midas-field-far',
                     'logos-initial', 'logos-constructed', 'vulcan-island'):
            self.assertGreater(scenes[name]['agreement'], 0.97, name)
        coasts = [c for c in self.ledger['comparisons'] if c['kind'] == 'land-sea']
        self.assertEqual([(c['agree'], c['points']) for c in coasts], [(20, 20), (16, 16)])

    def test_malformed_and_foreign_ledgers_are_diagnosed(self):
        self.assertEqual(self.problems(lambda d: d.update(title='damocles')),
                         ["ledger belongs to Title 'damocles', not dion"])

        def repeat_cell(d):
            d['bindings'].append({**d['bindings'][0], 'id': 'placement-02-ff'})
        self.assertIn('a group cell is bound twice: count cells, not writes',
                      self.problems(repeat_cell))
        self.assertIn('residence totals disagree with objects', self.problems(
            lambda d: d['objects'][0].update(residence='surface', host=None, floor=None)))
        self.assertIn('binding placement-02-03 selects unlisted structure slot 999', self.problems(
            lambda d: d['bindings'][0].update(slot=999)))
        self.assertIn('the LOGOS construction must start absent', self.problems(
            lambda d: next(b for b in d['bindings'] if b['id'] == 'placement-08-32')
            .update(state='present')))
        self.assertTrue(any('unresolved without a blocking gap' in p for p in self.problems(
            lambda d: d.update(gaps=[g for g in d['gaps'] if g['subject'] != 'structureSlot:46']))))

    def test_regenerates_from_the_census_run(self):
        run, surface = os.environ.get('M3_CENSUS_RUN'), os.environ.get('M3_SURFACE')
        if not run or not surface:
            self.skipTest('set M3_CENSUS_RUN and M3_SURFACE (the surface extraction directory)')
        directory = Path(surface)
        comparisons = {kind: json.loads((directory / f'{kind}.json').read_text())
                       for kind in ('scenes', 'coasts')}
        ledger = build_ledger(Path(run), surface=json.loads((directory / 'surface.json').read_text()),
                              comparisons=comparisons)
        self.assertEqual(dumps(ledger), LEDGER_PATH.read_text())


if __name__ == '__main__':
    unittest.main()
