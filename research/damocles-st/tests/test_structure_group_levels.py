"""The association list a resident resolves in is bound per level (#324, #326).

``$7B0E`` is not a property of the cell. The native walk at ``$05A266`` consumes
one structure's region descriptors and ``$05A2FA`` publishes where it stopped,
so the root identifies whichever structure the game has bound -- and above level
0 that is the interior, not the cell's authored instance. Vesta cell ``$64``
binds slot 70 (base 90) at level 0 and slot 91 at level 10.

The probe's self-check previously required the cell instance's root at every
level, which made any capture inside a building at a non-zero level read as a
failed derivation. These tests pin the corrected behaviour and the gate that
replaces it: a resident naming this scene must name an insertion group the bound
structure actually offers.
"""

import importlib.util
import struct
import sys
import unittest
from pathlib import Path

LAB_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB_ROOT))

_spec = importlib.util.spec_from_file_location(
    'structure_group_probe', LAB_ROOT / 'scripts' / 'structure-group-probe.py')
probe = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(probe)

from damocleslab.core import LabError  # noqa: E402

CATALOGUE = {
    'instances': [
        {
            'id': 'object-slot-68',
            'name': 'TRANSPORTER a',
            'association': {
                'body': 'body-14', 'structureGroupSelector': 0x05,
                'cell': 0x64, 'levelSelector': 10, 'insertionGroupSelector': 0x08,
            },
        },
        {
            'id': 'object-slot-215',
            'name': 'BENCH',
            'association': {
                'body': 'body-14', 'structureGroupSelector': 0x05,
                'cell': 0x64, 'levelSelector': 0, 'insertionGroupSelector': 0x14,
            },
        },
        {
            'id': 'object-slot-9',
            'name': 'ELSEWHERE',
            'association': {
                'body': 'body-4', 'structureGroupSelector': 0x05,
                'cell': 0x64, 'levelSelector': 10, 'insertionGroupSelector': 0x7F,
            },
        },
    ],
}


class ResidentsInSceneTests(unittest.TestCase):
    def test_a_scene_selects_only_residents_naming_all_four_selectors(self):
        found = probe.residents_in_scene(CATALOGUE, 'body-14', 0x05, 0x64, 10)
        self.assertEqual([r['slot'] for r in found], [68])
        self.assertEqual(found[0]['insertionGroup'], 0x08)

    def test_the_level_is_part_of_the_key(self):
        found = probe.residents_in_scene(CATALOGUE, 'body-14', 0x05, 0x64, 0)
        self.assertEqual([r['slot'] for r in found], [215])

    def test_another_body_with_the_same_selectors_is_not_selected(self):
        # Slot 9 names the same group, cell and level on a different body.
        self.assertEqual(probe.residents_in_scene(CATALOGUE, 'body-14', 0x05, 0x64, 10),
                         [{'slot': 68, 'name': 'TRANSPORTER a', 'insertionGroup': 0x08}])


class BoundStructureTests(unittest.TestCase):
    def test_an_unmatched_root_is_reported_rather_than_guessed(self):
        # A root no slot derives must come back as None, so the caller can say
        # so instead of attributing the interior to an arbitrary structure.
        ram = bytes(0x100000)
        self.assertIsNone(probe.bound_structure(ram, 0x00BADBAD, limit=8))


class LiveCaptureGateTests(unittest.TestCase):
    """The gates run against the captures themselves when they are present."""

    def setUp(self):
        run = LAB_ROOT / 'work' / 'observe-first-world-20260818T101013Z-c5a32b7d'
        if not (run / 'observed.ram').is_file():
            self.skipTest('captures live in the ignored research workspace')
        self.ram = (run / 'observed.ram').read_bytes()

    def live(self, name: str) -> bytes:
        from damocleslab.catalogue import hatari_memstate_ram

        path = LAB_ROOT / 'snapshots' / f'{name}.sav'
        if not path.is_file():
            self.skipTest(f'{name} is Restricted Material and is not present')
        return hatari_memstate_ram(path.read_bytes())

    def test_vesta_binds_a_different_structure_at_level_ten_than_at_level_zero(self):
        ground = probe.check_memstate(self.ram, self.live('vesta-parliament-4-6'),
                                      'vesta-parliament-4-6')
        upper = probe.check_memstate(self.ram, self.live('vesta-transporter'),
                                     'vesta-transporter')
        self.assertEqual((ground['playerCell'], upper['playerCell']), (0x64, 0x64))
        self.assertEqual(ground['playerLevel'], 0)
        self.assertEqual(upper['playerLevel'], 10)
        self.assertNotIn('interiorStructure', ground)
        self.assertEqual(upper['interiorStructure']['slot'], 91)
        self.assertEqual(ground['playerCellInstance']['baseSlot'], 90)
        # $08 is what the level-10 transporter names, and it is absent below.
        self.assertIn('0x08', upper['boundInsertionGroups'])
        self.assertNotIn('0x08', ground['boundInsertionGroups'])

    def test_gaea_group_0f_is_bound_to_chaldea_metropolis(self):
        check = probe.check_memstate(self.ram, self.live('gaea-transporter'),
                                     'gaea-transporter')
        self.assertEqual(check['boundGroup'], 0x0F)
        self.assertEqual(check['overrideTable'], 'identical')
        self.assertEqual(check['placeList'], '0x024ab4')

    def test_every_resident_naming_a_captured_scene_resolves_in_the_bound_list(self):
        import json

        catalogue = json.loads(
            (LAB_ROOT.parents[1] / 'payload' / 'damocles' / 'catalogue.json').read_text())
        resolved = 0
        for name in ('vesta-parliament-4-6', 'vesta-transporter', 'gaea-transporter',
                     'dion-transporter', 'metis-transporter', 'logos-transporter', 'pan'):
            check = probe.check_memstate(self.ram, self.live(name), name, catalogue)
            resolved += len(check['residentsResolved'])
        self.assertGreaterEqual(resolved, 10)


if __name__ == '__main__':
    unittest.main()
