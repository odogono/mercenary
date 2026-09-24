"""The structure a level binds, and the gate that holds the rule to it (#355).

``$7B0E`` is not a property of the cell. The native walk at ``$05A266`` consumes
one structure's region descriptors and ``$05A2FA`` publishes where it stopped,
so the root identifies whichever structure the game has bound -- and above level
0 that is the interior, not the cell's authored instance. Vesta cell ``$64``
binds slot 90 at level 0 and slot 91 at level 10.

#324 could only read that binding off a live capture. The static rule is the
alias record's floor table: ``$054DBC`` publishes the record plus six in
``$7C1E``, ``$054DC2`` takes its level-0 entry as ``$7AF0``, and the lift at
``$055B24``-``$055B28`` indexes the same table by the destination level, keeping
the byte in d0 through ``$055BD8``, which assembles that structure. These tests
pin the decode, its extent honesty, and the gate that now requires a capture's
live ``$7B0E`` at whatever level it stands.
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

from damocleslab.catalogue import read_catalogue, structure_level_binding  # noqa: E402

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


def _structure_table(records: dict[int, bytes], count: int = 4) -> bytearray:
    """A minimal RAM with a structure pointer table at ``$04BD0C`` -> ``$E900``."""
    data = bytearray(0x100000)
    base = 0xE900
    struct.pack_into('>I', data, 0x4bd0c, base)
    cursor = base + count * 4 + 8      # leave room for the first record's prologue
    for slot in range(count):
        body = records.get(slot, b'\x00\x64')
        struct.pack_into('>I', data, base + slot * 4, cursor - base)
        data[cursor:cursor + len(body)] = body
        cursor += len(body) + 8        # a plain record's prologue follows
    return data


class LevelBindingTests(unittest.TestCase):
    def test_a_plain_structure_record_has_no_floor_table(self):
        data = _structure_table({})
        self.assertIsNone(structure_level_binding(data, 0, count=4))

    def test_an_alias_record_publishes_one_structure_slot_per_level(self):
        # Vesta Parliament's shape: ground, then two levels sharing a floor, and
        # a level ten far above the gap. Zero means the level has no floor.
        alias = b'\x81\x3d\x03\x03\x00\x46' + bytes([1, 2, 2, 0, 0, 0, 0, 0, 0, 0, 3, 0])
        data = _structure_table({0: alias})
        binding = structure_level_binding(data, 0, count=4)
        self.assertEqual(binding['levelsAuthored'], 12)
        self.assertEqual([(f['level'], f['structureSlot']) for f in binding['floors']],
                         [(0, 1), (1, 2), (2, 2), (10, 3)])

    def test_the_table_is_not_read_past_the_record_that_authored_it(self):
        # Two authored records are shorter than the twelve-byte format and run
        # into the record that follows. Entries past the extent are not claimed.
        alias = b'\x80\x96\x01\x01\x16\x02' + bytes([1, 0])
        data = _structure_table({0: alias})
        binding = structure_level_binding(data, 0, count=4)
        self.assertEqual(binding['levelsAuthored'], 2)
        self.assertEqual([f['level'] for f in binding['floors']], [0])

    def test_a_palette_byte_binds_every_floor_to_one_palette(self):
        # $054DB4: a non-zero record+4 is the palette of every level.
        alias = b'\x80\x96\x01\x01\x42\x02' + bytes([1, 2, 2]) + bytes(9)
        data = _structure_table({0: alias})
        binding = structure_level_binding(data, 0, count=4)
        self.assertEqual([(f['level'], f['paletteIndex']) for f in binding['floors']],
                         [(0, 0x42), (1, 0x42), (2, 0x42)])

    def test_a_zero_palette_byte_defers_to_the_per_level_table(self):
        # $054DC8 and $055B36: the palette table runs parallel, twelve on.
        palettes = bytes([30, 30, 71, 30, 0, 0, 0, 0, 0, 0, 30, 0])
        alias = (b'\x81\x3d\x03\x03\x00\x46' + bytes([1, 2, 2, 3, 0, 0, 0, 0, 0, 0, 3, 0])
                 + palettes)
        data = _structure_table({0: alias})
        binding = structure_level_binding(data, 0, count=4)
        self.assertEqual([(f['level'], f['paletteIndex']) for f in binding['floors']],
                         [(0, 30), (1, 30), (2, 71), (3, 30), (10, 30)])

    def test_a_per_level_palette_past_the_record_is_not_claimed(self):
        # Slot 37's record omits its palette table; what follows is another record.
        alias = b'\x81\x3d\x03\x03\x00\x46' + bytes([1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
        data = _structure_table({0: alias})
        binding = structure_level_binding(data, 0, count=4)
        self.assertEqual([f['level'] for f in binding['floors']], [0, 1])
        self.assertTrue(all('paletteIndex' not in f for f in binding['floors']))

    def test_the_probe_offers_level_zero_alone_for_a_plain_record(self):
        data = _structure_table({})
        self.assertEqual(probe.level_structure(data, 0, 0), 0)
        self.assertIsNone(probe.level_structure(data, 0, 1))


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


class LiveCaptures:
    """The gates run against the captures themselves when they are present."""

    def setUp(self):
        run = LAB_ROOT / 'work' / 'observe-first-world-20260818T101013Z-c5a32b7d'
        if not (run / 'observed.ram').is_file():
            self.skipTest('captures live in the ignored research workspace')
        self.ram = (run / 'observed.ram').read_bytes()

    def live(self, name: str) -> bytes:
        from damocleslab.catalogue import hatari_memstate_ram

        for candidate in (f'{name}.sav', 'damocles.' + name.replace('-', '.') + '.sav'):
            path = LAB_ROOT / 'snapshots' / candidate
            if path.is_file():
                return hatari_memstate_ram(path.read_bytes())
        self.skipTest(f'{name} is Restricted Material and is not present')


class LiveCaptureGateTests(LiveCaptures, unittest.TestCase):
    CAPTURES = ('vesta-parliament-4-6', 'vesta-transporter', 'gaea-transporter',
                'dion-transporter', 'metis-transporter', 'logos-transporter', 'pan')

    def test_vesta_binds_a_different_structure_at_level_ten_than_at_level_zero(self):
        ground = probe.check_memstate(self.ram, self.live('vesta-parliament-4-6'),
                                      'vesta-parliament-4-6')
        upper = probe.check_memstate(self.ram, self.live('vesta-transporter'),
                                     'vesta-transporter')
        self.assertEqual((ground['playerCell'], upper['playerCell']), (0x64, 0x64))
        self.assertEqual(ground['playerLevel'], 0)
        self.assertEqual(upper['playerLevel'], 10)
        self.assertEqual(ground['boundStructure']['slot'], 90)
        self.assertEqual(upper['boundStructure']['slot'], 91)
        # $08 is what the level-10 transporter names, and it is absent below.
        self.assertIn('0x08', upper['boundStructure']['insertionGroups'])
        self.assertNotIn('0x08', ground['boundStructure']['insertionGroups'])

    def test_the_floor_table_predicts_the_live_root_for_every_capture(self):
        # check_memstate raises when it does not, so reaching the end is the
        # assertion; the slots are pinned so a silent change cannot pass.
        bound = {}
        for name in self.CAPTURES:
            bound[name] = probe.check_memstate(self.ram, self.live(name), name)['boundStructure']['slot']
        self.assertEqual(bound, {
            'vesta-parliament-4-6': 90, 'vesta-transporter': 91, 'gaea-transporter': 58,
            'dion-transporter': 58, 'metis-transporter': 58, 'logos-transporter': 67,
            'pan': 55,
        })

    def test_gaea_group_0f_is_bound_to_chaldea_metropolis(self):
        check = probe.check_memstate(self.ram, self.live('gaea-transporter'),
                                     'gaea-transporter')
        self.assertEqual(check['boundGroup'], 0x0F)
        self.assertEqual(check['overrideTable'], 'identical')
        self.assertEqual(check['placeList'], '0x024ab4')

    def test_every_resident_naming_a_captured_scene_resolves_in_the_bound_list(self):
        import json

        catalogue = read_catalogue((LAB_ROOT.parents[1] / 'payload' / 'damocles' / 'catalogue.json'))
        resolved = 0
        for name in self.CAPTURES:
            check = probe.check_memstate(self.ram, self.live(name), name, catalogue)
            resolved += len(check['residentsResolved'])
        self.assertGreaterEqual(resolved, 10)


class FloorPaletteGateTests(LiveCaptures, unittest.TestCase):
    """The palette a Floor is drawn in is the alias record's (#493)."""

    CAPTURES = {'metis-transporter': 66, 'eris-lift': 26, 'vesta-transporter': 30,
                'vesta-parliament-4-6': 30}

    def bound_floor(self, live: bytes) -> tuple[dict, int]:
        from damocleslab.catalogue import u32

        record = u32(live, 0x7C1E) - 6
        base = u32(self.ram, 0x4bd0c)
        slot = next(s for s in range(280) if base + u32(self.ram, base + s * 4) == record)
        level = struct.unpack_from('>H', live, 0x7AC4)[0]
        binding = structure_level_binding(self.ram, slot)
        return next(f for f in binding['floors'] if f['level'] == level), slot

    def test_the_floor_table_predicts_the_live_palette_binding(self):
        # $054E12-$054E28 and $055B3C-$055B52 write the palette's base to $7A12.
        bound = {}
        for name in self.CAPTURES:
            live = self.live(name)
            floor, _ = self.bound_floor(live)
            index = floor['paletteIndex']
            address = 0xD200 + struct.unpack_from('>H', live, 0xD200 + index * 2)[0]
            self.assertEqual(struct.unpack_from('>H', live, 0x7A12)[0], address, name)
            bound[name] = index
        self.assertEqual(bound, self.CAPTURES)

    def test_metis_floor_nine_draws_its_floor_face_in_the_alias_palette(self):
        # Slot 58's own palette 28 would give $C086 #882222; the ST draws #444444.
        from damocleslab.catalogue import st_rgb

        live = self.live('metis-transporter')
        floor, slot = self.bound_floor(live)
        self.assertEqual((slot, floor['level'], floor['structureSlot']), (155, 9, 58))
        active = struct.unpack_from('>H', live, 0x7A10)[0]
        entry = (0xC086 & 0x7e) // 2
        self.assertEqual(st_rgb(struct.unpack_from('>H', live, active + entry * 2)[0]), '#444444')
        catalogue = read_catalogue(LAB_ROOT.parents[1] / 'payload' / 'damocles' / 'catalogue.json')
        model = next(m for m in catalogue['models'] if m['kind'] == 'structure' and 155 in m['slots'])
        palette = next(p for p in model['levelBinding']['palettes'] if p['paletteIndex'] == 66)
        self.assertEqual(palette['colours'][entry], '#444444')


if __name__ == '__main__':
    unittest.main()
