"""The reviewed selection is the only dependency between Catalogue and play."""
import copy
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from m3lab.tourcraft_export import select_catalogue, digest, content_identity, legacy_document, pickup_scripts

from m3lab.ram import Ram, RAM_SIZE
from m3lab.scripts import BASE, ENTRY_TABLE

ROOT = Path(__file__).resolve().parents[3]


class TourcraftExportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec = json.loads((ROOT / 'research/mercenary-iii-st/tourcraft-promotion-manifest.json').read_text())
        cls.catalogue = json.loads((ROOT / 'payload/dion/catalogue/catalogue.json').read_text())
        cls.support = json.loads((ROOT / 'payload/dion/catalogue/render-support.json').read_text())
        cls.geometry = {g['id']: json.loads((ROOT / f"payload/dion/catalogue/geometry/{g['id']}.json").read_text())
                        for g in cls.spec['geometry']}

    def test_pickup_graph_keeps_both_branches_calls_and_repeating_timed_edges(self):
        data = bytearray(RAM_SIZE)
        def put(at, value):
            data[at:at+len(value)] = value
        for script, offset in ((28, 0x100), (115, 0x120), (24, 0x140)):
            put(ENTRY_TABLE + 2*script, offset.to_bytes(2, 'big'))
        # CHILD has an inverted branch with both return successors.
        put(BASE + 0x100, bytes([0x92, 10, 1, 0x60, 5]))
        put(BASE + 0x160, bytes([5]))
        # PCB's timed continuation points to itself; ORE calls CHILD's target.
        put(BASE + 0x120, bytes([0x26, 0x0B, 0xB8, 1, 0x20, 5]))
        put(BASE + 0x140, bytes([4, 1, 0x60, 5]))
        put(0x75C01, bytes([5]))
        routine = pickup_scripts(Ram(bytes(data)), {})
        sites = {i['address']: i for i in routine['instructions']}
        self.assertEqual(len(sites), 8)
        self.assertEqual(sites[f'${BASE+0x100:05X}']['branch'], {'invert': True, 'call': False})
        self.assertIn(f'${BASE+0x104:05X}', sites)
        self.assertIn(f'${BASE+0x160:05X}', sites)
        self.assertIn(f'${BASE+0x125:05X}', sites)
        put(BASE + 0x140, bytes([0x2C]))
        with self.assertRaisesRegex(ValueError, 'unknown instruction'):
            pickup_scripts(Ram(bytes(data)), {})

    def test_exact_reviewed_forms_and_complete_workspaces(self):
        unchanged = copy.deepcopy(self.catalogue)
        metadata, geometry, support = select_catalogue(self.spec, self.catalogue, self.geometry, self.support)
        self.assertEqual(len(geometry), 79)
        self.assertEqual(sum(len(g['geometry']['variants']) for g in geometry.values()), 109)
        self.assertEqual(len(metadata['surfaceCells']), 512)
        self.assertEqual(len(metadata['placements']), 39)
        self.assertEqual(len(support['glyphs']), 385)
        self.assertEqual(len(support['palettes']), 13)
        self.assertNotIn('ledgerSha256', metadata['sources']['catalogue-immutable'])
        self.assertNotIn('catalogueFileSha256', metadata['geometry'][0])
        self.assertNotIn('surfaceYaw', support)
        self.assertEqual(self.catalogue, unchanged)

    def test_unused_catalogue_records_and_tables_do_not_change_output(self):
        before = select_catalogue(self.spec, self.catalogue, self.geometry, self.support)
        catalogue, support = copy.deepcopy(self.catalogue), copy.deepcopy(self.support)
        catalogue['objects'][100]['name'] = 'unselected inspection change'
        support['glyphs']['3:20']['points'] = [[4, 5]]
        support['groups']['3']['roads']['corners'][0] = 123
        after = select_catalogue(self.spec, catalogue, self.geometry, support)
        self.assertEqual(before, after)

    def test_historical_dependency_survives_a_new_current_d1_export(self):
        data = b'historical D1 dependency\n'
        row = {'kind': 'world', 'path': 'payload/dion/world.json',
               'sha256': hashlib.sha256(data).hexdigest()}
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            current = root / row['path']
            retained = root / 'payload/dion/tourcraft/world.json'
            retained.parent.mkdir(parents=True)
            current.write_bytes(b'new D1 road export\n')
            retained.write_bytes(data)
            self.assertEqual(legacy_document(root, row), data)
            retained.write_bytes(b'altered retained dependency\n')
            with self.assertRaisesRegex(ValueError, 'world.json.*sha256'):
                legacy_document(root, row)

    def test_altered_selected_record_is_refused(self):
        geometry = copy.deepcopy(self.geometry)
        geometry['model-03005c']['geometry']['record'] = '$3005E'
        with self.assertRaisesRegex(ValueError, 'model-03005c.*sha256'):
            select_catalogue(self.spec, self.catalogue, geometry, self.support)

    def test_binding_or_selected_support_change_is_refused(self):
        catalogue = copy.deepcopy(self.catalogue)
        next(p for p in catalogue['placements'] if p['id'] == 'placement-03-02')['slot'] = 1
        with self.assertRaisesRegex(ValueError, 'placement-03-02.*sourceRecordSha256'):
            select_catalogue(self.spec, catalogue, self.geometry, self.support)
        support = copy.deepcopy(self.support)
        support['glyphs']['0:20']['code'] = 33
        with self.assertRaisesRegex(ValueError, '0:20.*sourceRecordSha256'):
            select_catalogue(self.spec, self.catalogue, self.geometry, support)

    def test_changed_decoded_placement_string_is_refused(self):
        support = copy.deepcopy(self.support)
        support['tokens']['$89']['default'] = [65]
        with self.assertRaisesRegex(ValueError, r'\$89.*string'):
            select_catalogue(self.spec, self.catalogue, self.geometry, support)

    def test_missing_dependency_and_foreign_program_are_refused(self):
        geometry = dict(self.geometry)
        del geometry['model-03005c']
        with self.assertRaisesRegex(ValueError, 'model-03005c.*missing'):
            select_catalogue(self.spec, self.catalogue, geometry, self.support)
        catalogue = copy.deepcopy(self.catalogue)
        catalogue['source']['programSha256'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'source.programSha256'):
            select_catalogue(self.spec, catalogue, self.geometry, self.support)

    def test_identity_uses_paths_and_unambiguous_lengths(self):
        self.assertEqual(content_identity([('a', b'bc'), ('d', b'e')]),
                         'adfbc36f7a52dbc748b6832a1c449671d1513fe055dbd799cd15a265f91b9565')
        self.assertNotEqual(content_identity([('a', b'bc')]), content_identity([('ab', b'c')]))
        self.assertNotEqual(content_identity([('a', b'bc')]), content_identity([('a', b'bd')]))
        self.assertEqual(digest({'é': [1, 'λ']}),
                         '7620d26612a161d00cc2f3218e0f7449526bedbae43309256de1a9e03e74eb6a')


if __name__ == '__main__':
    unittest.main()
