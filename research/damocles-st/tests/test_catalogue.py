import json
import math
import struct
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from damocleslab.catalogue import SCHEMA_VERSION, decode_mesh, read_catalogue, st_rgb

class CatalogueTests(unittest.TestCase):
    def test_drop_support_scanner_uses_native_form_gate_and_raw_y(self):
        from damocleslab.catalogue import decode_support_top
        vertices = struct.pack('>7h', 10, 2, 30, -10, 48, 20, -32768)
        self.assertEqual(decode_support_top(vertices, 0), 48)
        self.assertEqual(decode_support_top(bytes.fromhex('8006 0000') + vertices, 0), 48)
        self.assertEqual(decode_support_top(bytes.fromhex('8009 0000') + vertices, 0), 48)
        self.assertEqual(decode_support_top(bytes.fromhex('800a 0777 0000 0002') + vertices, 0), 48)
        self.assertIsNone(decode_support_top(bytes.fromhex('8008 564c') + vertices, 0))
        self.assertEqual(decode_support_top(struct.pack('>4h', 0, -20, 0, -32768), 0), 0)

    def test_instance_orientation_reads_the_8001_bias_and_mode(self):
        from damocleslab.catalogue import decode_instance_orientation
        # $0536F6 branches on the mode byte: zero draws unturned, bit 7 articulates,
        # bit 6 turns once about +Y, anything else turns with the camera (#361).
        self.assertEqual(
            decode_instance_orientation(bytes.fromhex('8001 0040'), 0),
            {'angleBiasByte': 0x00, 'modeByte': 0x40, 'rotation': 'yaw'},
        )
        self.assertEqual(
            decode_instance_orientation(bytes.fromhex('8001 8040'), 0)['angleBiasByte'], 0x80
        )
        for mode, rotation in ((0x00, 'none'), (0xFF, 'articulated'), (0x32, 'camera')):
            self.assertEqual(
                decode_instance_orientation(bytes.fromhex('8001 00') + bytes([mode]), 0)['rotation'],
                rotation,
            )
        self.assertIsNone(decode_instance_orientation(bytes.fromhex('8003 8000'), 0))
        self.assertIsNone(decode_instance_orientation(struct.pack('>4h', 0, 0, 0, -32768), 0))

    def test_the_parked_limo_publishes_its_drawn_instance_angle(self):
        from damocleslab.catalogue import extract
        root = Path(__file__).resolve().parents[1]
        first = root / 'work' / 'observe-first-world-20260818T101013Z-c5a32b7d' / 'observed.ram'
        if not first.exists():
            self.skipTest('Working-Authority RAM captures are Restricted Material')
        data = first.read_bytes()
        # $053548 reads $77A8 + 4*slot; $79CD + slot is inside that array, not a table.
        self.assertEqual(data[0x77A8 + 5 * 4], 0x7F)
        self.assertEqual(data[0x79CD + 5], 0x00)
        result = extract(data, {})
        limo = next(i for i in result['instances'] if i['id'] == 'object-slot-5')
        self.assertEqual(limo['location']['heading'], 0x7F)
        model = next(m for m in result['models'] if m['id'] == 'object-036176')
        self.assertEqual(model['instanceOrientation']['rotation'], 'yaw')
        # TRANSPORTER a opens with $8002, so its $FF angle byte never turns the mesh.
        transporter = next(m for m in result['models'] if m['id'] == 'object-038820')
        self.assertNotIn('instanceOrientation', transporter)

    def test_key_header_selects_shared_geometry_and_preserves_display_code(self):
        # $8008 stores a two-character key code, then jumps from the offset
        # word to a shared key geometry stream.
        data = bytes.fromhex('8008 564c 0006 00000000')
        data += struct.pack('>10h', 0, 0, 0, 10, 0, 0, 0, 10, 0, -32768)
        data += bytes.fromhex('0000 0777 04 08 0c 00 6000 fff8 0018 0000 8000 0009 0305 8000 8b00')
        # A further body polygon follows the complete text record. The $8000
        # flags above must not be mistaken for an end-of-model marker.
        data += bytes.fromhex('0543 0c 08 04 00 0000')
        end = len(data)
        data = bytearray(data.ljust(0x31910, b'\0'))
        for char in 'VL':
            struct.pack_into('>h', data, 0x31700 + (ord(char) - 32) * 2, 0x200)
        data[0x31900:0x31908] = bytes.fromhex('0000 0202 81 0408 00')
        mesh = decode_mesh(data, 0, 'object', hardware=[0])
        self.assertEqual(mesh['displayCode'], 'VL')
        self.assertEqual(mesh['labelAnchor'], [-8, 24, 0])
        self.assertEqual(mesh['geometryStart'], 10)
        self.assertEqual(len(mesh['faces']), 2)
        self.assertEqual(mesh['sourceEnd'], end)
        self.assertEqual(mesh['vertices'][3:], [[-8, 24, 0], [-2, 34, 0], [1, 24, 0], [7, 34, 0]])
        self.assertEqual([line['vertices'] for line in mesh['lines']], [[3, 4], [5, 6]])

    def test_truncated_key_text_is_not_reported_as_a_complete_model(self):
        data = bytes.fromhex('8008 564c 0002')
        data += struct.pack('>10h', 0, 0, 0, 10, 0, 0, 0, 10, 0, -32768)
        data += bytes.fromhex('0000 0777 04 08 0c 00 6000 fff8 0018 0000 8000')
        with self.assertRaisesRegex(ValueError, 'truncated record'):
            decode_mesh(data, 0, 'object')

    def test_signed_vertices_and_one_based_polygon_indices(self):
        data = struct.pack('>11h', -10, 0, 10, 10, 0, 10, 0, 20, 0, -32768, 0)
        data += bytes.fromhex('0540 04 08 0c 00 0000')
        mesh = decode_mesh(data, 0, 'object')
        self.assertEqual(mesh['vertices'][0], [-10, 0, 10])
        self.assertEqual(mesh['faces'], [{'vertices': [0, 1, 2], 'colour': '#aa8800', 'sourceColour': 0x540}])
    def test_bad_vertex_reference_is_unresolved_not_a_wrong_mesh(self):
        data = struct.pack('>5h', 0, 0, 0, -32768, 0) + bytes.fromhex('0777 04 08 0c 00 0000')
        with self.assertRaisesRegex(ValueError, 'vertex reference'):
            decode_mesh(data, 0, 'object')
    def test_interior_has_no_object_visibility_header(self):
        data = struct.pack('>10h', 0, 0, 0, 10, 0, 0, 0, 10, 0, -32768)
        data += bytes.fromhex('0777 04 08 0c 00 0000')
        self.assertEqual(len(decode_mesh(data, 0, 'interior')['faces']), 1)

    def test_building_detail_keeps_faces_and_expands_live_vector_text(self):
        data = struct.pack('>10h', 0, 0, 0, 10, 0, 0, 0, 10, 0, -32768)
        data += bytes.fromhex('0777 04 08 0c 00')
        # $6000: offset, anchor X/Y/Z, flags/font, advance, glyph scales,
        # colour, then terminal token $91.
        data += bytes.fromhex(
            '6000 ff2e 0000 005a 0000 8001 0018 0304 0777 9100 0000'
        )
        end = len(data)
        data = bytearray(data.ljust(0x31910, b'\0'))
        struct.pack_into('>I', data, 0xCCA0 + 17 * 4, 0xCD3F)
        data[0xCD3F:0xCD41] = b' \0'
        font_one_e = ord('E') + 64 - 32
        struct.pack_into('>h', data, 0x31700 + font_one_e * 2, 0x200)
        data[0x31900:0x31910] = bytes.fromhex(
            '0000 0200 0202 0002 80 04080c10 00 00'
        )
        workspace = bytearray(data)
        workspace[0xCD3F:0xCD41] = b'E\0'

        mesh = decode_mesh(
            data, 0, 'interior', hardware=[0], text_workspace=workspace
        )

        self.assertEqual(len(mesh['faces']), 2)
        self.assertEqual(mesh['sourceEnd'], end)
        self.assertEqual(mesh['vertices'][3:], [
            [-210, 90, 0], [-204, 90, 0], [-204, 98, 0], [-210, 98, 0],
        ])
        self.assertEqual(mesh['faces'][-1]['vertices'], [3, 4, 5, 6])

    def test_truncated_record_fails(self):
        with self.assertRaises(ValueError):
            decode_mesh(b'\x00', 0, 'object')
    def test_st_colour_channels(self):
        self.assertEqual(st_rgb(0x777), '#eeeeee')
        self.assertEqual(st_rgb(0x066), '#00cccc')
        self.assertEqual(st_rgb(0), '#000000')

class SurfaceTests(unittest.TestCase):
    def test_surface_wall_uses_header_height_and_plan_vertices(self):
        from damocleslab.catalogue import decode_structure
        # Eight metadata bytes, two heights, two colours, two plan points,
        # zero x terminator, one ordinary wall, wall-list zero word, no extras.
        data = bytes.fromhex('01010000 00000000 0064 0050 0777 0444 000a000a 0014000a 0000 01020777 0000 0000')
        mesh, gaps = decode_structure(data, 8)
        self.assertEqual(gaps, [])
        self.assertTrue(mesh['faces'][0]['doubleSided'])
        self.assertEqual(mesh['vertices'], [[10, 0, 10], [20, 0, 10], [20, 100, 10], [10, 100, 10]])

class SourceTests(unittest.TestCase):
    def test_decodes_zero_terminated_structure_association_groups(self):
        from damocleslab.catalogue import decode_structure_associations
        data = bytes.fromhex(
            '01 02 10 03 10 04 10 05 10 09 02 0a 05 0b 05 0c 08 00 '
            '0c 01 18 02 10 03 10 04 10 05 10 09 02 0a 05 0b 05 00 00'
        )
        self.assertEqual(decode_structure_associations(data, 0), {
            1: [
                {'regionSelector': 2, 'insertionKey': 16},
                {'regionSelector': 3, 'insertionKey': 16},
                {'regionSelector': 4, 'insertionKey': 16},
                {'regionSelector': 5, 'insertionKey': 16},
                {'regionSelector': 9, 'insertionKey': 2},
                {'regionSelector': 10, 'insertionKey': 5},
                {'regionSelector': 11, 'insertionKey': 5},
                {'regionSelector': 12, 'insertionKey': 8},
            ],
            12: [
                {'regionSelector': 1, 'insertionKey': 24},
                {'regionSelector': 2, 'insertionKey': 16},
                {'regionSelector': 3, 'insertionKey': 16},
                {'regionSelector': 4, 'insertionKey': 16},
                {'regionSelector': 5, 'insertionKey': 16},
                {'regionSelector': 9, 'insertionKey': 2},
                {'regionSelector': 10, 'insertionKey': 5},
                {'regionSelector': 11, 'insertionKey': 5},
            ],
        })
        self.assertEqual(
            decode_structure_associations(bytes.fromhex('03 04 00 05 07 00 00'), 0),
            {3: [
                {'regionSelector': 4, 'insertionKey': 0},
                {'regionSelector': 5, 'insertionKey': 7},
            ]},
        )

    def test_decodes_surface_placement_streams_until_ff(self):
        from damocleslab.catalogue import decode_surface_placements
        # Selector, cell, structure low/high, signed dx/dz. A zero third byte
        # skips without a cell. $FF ends the stream so a place list can follow.
        data = bytes.fromhex('0c 87 4a 00 e5 34 00 00 00 1a 89 4b 12 00 ce ff')
        data += b'CAPITAL   CITY      '
        cells, end = decode_surface_placements(data, 0)
        self.assertEqual(end, 16)
        self.assertEqual(cells[0x87], {'address': 0, 'slot': 74, 'dx': -27, 'dz': 52, 'selector': 12, 'word': 0x4a})
        self.assertEqual(cells[0x89], {'address': 9, 'slot': 75, 'dx': 0, 'dz': -50, 'selector': 26, 'word': 0x124b})
        self.assertNotIn(0, cells)

    def test_rejects_a_truncated_or_duplicate_surface_placement_stream(self):
        from damocleslab.catalogue import decode_surface_placements
        with self.assertRaisesRegex(ValueError, 'terminator'):
            decode_surface_placements(bytes.fromhex('0c 87 4a 00 e5'), 0)
        with self.assertRaisesRegex(ValueError, 'duplicate'):
            decode_surface_placements(bytes.fromhex('0c 87 4a 00 e5 34 0d 87 4b 00 00 00 ff'), 0)

    def test_named_area_lists_stop_on_a_zero_cell(self):
        from damocleslab.catalogue import decode_named_area, find_area_placements
        data = b'BIRMINGHAMISLAND    \x40ELMDON    SPACEPORT \x70LAWSON    BANK      \x00'
        area = decode_named_area(data, 0)
        self.assertEqual(area['name'], 'BIRMINGHAM ISLAND')
        self.assertEqual(area['places'][0]['cell'], 0x40)
        self.assertEqual(area['places'][0]['name'], 'ELMDON SPACEPORT')
        self.assertEqual(area['places'][1]['cell'], 0x70)
        self.assertEqual(area['places'][1]['name'], 'LAWSON BANK')
        stream = bytes.fromhex(
            '20 e3 38 00 ec f1 1a 70 c2 00 c6 17 0c 40 96 00 dd 32 1a 26 4a 00 00 00 ff'
        )
        blob = stream + data
        cells = find_area_placements(blob, len(stream))
        self.assertEqual(set(cells), {0x26, 0x40, 0x70})
        self.assertNotIn(0xe3, cells)
        self.assertEqual(cells[0x40]['slot'], 150)
        self.assertEqual(cells[0x40]['address'], 12)

    def test_rejects_broken_structure_association_lists(self):
        from damocleslab.catalogue import decode_structure_associations
        with self.assertRaisesRegex(ValueError, 'insertion key'):
            decode_structure_associations(bytes.fromhex('01 02'), 0)
        with self.assertRaisesRegex(ValueError, 'duplicate insertion group'):
            decode_structure_associations(bytes.fromhex('01 02 10 00 01 03 10 00 00'), 0)
        with self.assertRaisesRegex(ValueError, 'terminator'):
            decode_structure_associations(bytes.fromhex('01 02 10 00'), 0)

    def test_preserves_structure_association_pair_order(self):
        from damocleslab.catalogue import decode_structure_associations
        self.assertEqual(
            decode_structure_associations(
                bytes.fromhex('01 02 10 03 20 00 0c 01 18 0c 08 00 00'),
                0,
            ),
            {
                1: [
                    {'regionSelector': 2, 'insertionKey': 0x10},
                    {'regionSelector': 3, 'insertionKey': 0x20},
                ],
                12: [
                    {'regionSelector': 1, 'insertionKey': 0x18},
                    {'regionSelector': 12, 'insertionKey': 0x08},
                ],
            },
        )

    def test_decodes_interior_selectors_without_naming_them_as_rooms(self):
        from damocleslab.catalogue import interior_resident_association
        self.assertEqual(
            interior_resident_association(
                bytes.fromhex('00140404'), bytes.fromhex('2c030126')
            ),
            {
                'body': 11,
                'structureGroupSelector': 20,
                'insertionGroupSelector': 3,
                'levelSelector': 1,
                'cell': 0x26,
            },
        )
        self.assertIsNone(
            interior_resident_association(
                bytes.fromhex('ff072006'), bytes.fromhex('20000017')
            )
        )

    def test_decodes_the_interaction_byte_the_take_handler_tests(self):
        # $6FAA + 4*slot. Bit 4 refuses silently at $05421E, bit 5 diverts to
        # the refusal message at $054238, and the low nibble is the rank pair
        # the drop handler compares: bits 0-1 the rank the slot supplies as a
        # support, bits 2-3 the rank it requires of its support. Nothing here
        # decides which object is selected; that is the per-frame nearest-drawn
        # rule.
        from damocleslab.catalogue import resident_handling
        self.assertEqual(
            resident_handling(bytes.fromhex('00120404')),
            {'byte': 4, 'takeable': True, 'refusal': None,
             'suppliedSupportRank': 0, 'requiredSupportRank': 1,
             'carried': False},
        )
        self.assertEqual(resident_handling(bytes.fromhex('ff122002'))['refusal'], 'message')
        self.assertEqual(resident_handling(bytes.fromhex('00001000'))['refusal'], 'silent')
        self.assertFalse(resident_handling(bytes.fromhex('ff122002'))['takeable'])
        self.assertEqual(
            resident_handling(bytes.fromhex('00000f00')),
            {'byte': 15, 'takeable': True, 'refusal': None,
             'suppliedSupportRank': 3, 'requiredSupportRank': 3,
             'carried': False},
        )
        self.assertTrue(resident_handling(bytes.fromhex('00318404'))['carried'])
        self.assertIsNone(resident_handling(b'\x00\x12'))

    def test_resident_coordinates_are_made_local_by_subtracting_the_structure_origin(self):
        from damocleslab.catalogue import resident_local_position, structure_origin
        data = bytearray(0x100)
        for base, value in zip((0x10, 0x30, 0x50), (1138, 20, 739)):
            struct.pack_into('>i', data, base + 3 * 4, value)
        self.assertEqual(
            resident_local_position(bytes(data), 3, (100, 20, -50), (0x10, 0x30, 0x50)),
            [1038, 0, 789],
        )
        self.assertEqual(
            structure_origin((0x0c067a98, 200, 0x02027890), -33, -125),
            (0x0c067c22, 0, 0x0202715a),
        )

    def test_surface_residence_requires_a_nonzero_aligned_body_and_surface_selector(self):
        from damocleslab.catalogue import surface_resident_body
        self.assertEqual(surface_resident_body(bytes.fromhex('20000017')), 8)
        self.assertEqual(surface_resident_body(bytes.fromhex('2c000099')), 11)
        self.assertIsNone(surface_resident_body(bytes.fromhex('00000087')))
        self.assertIsNone(surface_resident_body(bytes.fromhex('2c010087')))
        self.assertIsNone(surface_resident_body(bytes.fromhex('2d000087')))
        self.assertIsNone(surface_resident_body(bytes.fromhex('78000000')))

    def test_source_identity_and_scenario_must_match(self):
        from damocleslab.catalogue import validate_source
        pin = {'programImage': {'hashes': {'sha256': 'program'}}, 'tosImage': {'hashes': {'sha256': 'tos'}}}
        manifest = {'authority': {'programSha256': 'program', 'tosSha256': 'tos'}, 'scenario': {'sha256': 'wrong'}}
        with self.assertRaisesRegex(ValueError, 'scenario'):
            validate_source(manifest, pin)
        manifest['authority']['programSha256'] = 'other'
        with self.assertRaisesRegex(ValueError, 'authority'):
            validate_source(manifest, pin)

    def test_repeat_extraction_is_deterministic_and_ids_ignore_names(self):
        from damocleslab.catalogue import extract
        data = bytearray(1048576)
        struct.pack_into('>I', data, 0x4bd10, 0x35700)
        struct.pack_into('>I', data, 0x4bd22, 0x26000)
        _empty_island_table(data)
        _board_gate(data)
        # Synthetic table entries share a deliberately empty model in each bank.
        for base, count in [(0x35700, 378), (0xe900, 280), (0x26000, 130)]:
            for slot in range(count):
                struct.pack_into('>I', data, base + slot * 4, 0x1000)
            struct.pack_into('>H', data, base + 0x1000, 0x8000)
        data[0x366f0:0x36700] = b'SYNTHETIC MODEL '
        first = extract(bytes(data), {})
        self.assertEqual(first, extract(bytes(data), {}))
        data[0x366f0:0x36700] = b'RENAMED MODEL   '
        second = extract(bytes(data), {})
        self.assertEqual([m['id'] for m in first['models']], [m['id'] for m in second['models']])
        self.assertNotEqual(first['models'][0]['name'], second['models'][0]['name'])

    def test_extracts_authored_gaea_places_without_inventing_names(self):
        from damocleslab.catalogue import extract
        data = bytearray(1048576)
        struct.pack_into('>I', data, 0x4bd10, 0x35700)
        struct.pack_into('>I', data, 0x4bd22, 0x26000)
        _empty_island_table(data)
        _board_gate(data)
        for base, count in [(0x35700, 378), (0xe900, 280), (0x26000, 130)]:
            for slot in range(count):
                struct.pack_into('>I', data, base + slot * 4, 0x1000)
            struct.pack_into('>H', data, base + 0x1000, 0x8000)
        struct.pack_into('>i', data, 0x63a8 + 2 * 4, 519 << 16)
        struct.pack_into('>i', data, 0x6ba8 + 2 * 4, 1793 << 16)
        stream = bytes.fromhex('0c 40 96 00 dd 32 1a 26 4a 00 00 00 ff')
        header = b'BIRMINGHAMISLAND    '
        places = b'\x40ELMDON    SPACEPORT \x00'
        block = stream + header + places
        start = 0x23c00
        data[start:start + len(block)] = block
        result = extract(bytes(data), {})
        assemblies = [i for i in result['instances'] if i['id'].startswith('gaea-surface-')]
        self.assertEqual({i['id'] for i in assemblies}, {'gaea-surface-26', 'gaea-surface-40'})
        elmdon = next(p for p in result['places'] if p['name'] == 'ELMDON SPACEPORT')
        self.assertEqual(elmdon['body'], 'body-8')
        self.assertEqual(elmdon['instances'], ['gaea-surface-40'])
        neighbor = next(i for i in assemblies if i['id'] == 'gaea-surface-26')
        self.assertIsNone(neighbor['location']['place'])
        self.assertEqual(neighbor['location']['position'][0], 512 + 0x26 % 16 + 0.5)
        self.assertTrue(any('Gaea Birmingham Island' in note for note in result['coverage']['notes']))
        self.assertEqual([p['name'] for p in result['places'] if p['body'] == 'body-8'], ['ELMDON SPACEPORT'])

class AssemblyTests(unittest.TestCase):
    def test_translation_places_geometry_and_its_label_anchor(self):
        from damocleslab.catalogue import translate_mesh
        mesh = {'vertices': [[-10, 0, 4]], 'faces': [], 'lines': [],
                'displayCode': 'VL', 'labelAnchor': [-8, 24, 0]}
        placed = translate_mesh(mesh, (1038, 0, 789))
        self.assertEqual(placed['vertices'], [[1028, 0, 793]])
        self.assertEqual(placed['labelAnchor'], [1030, 24, 789])
        self.assertEqual(mesh['vertices'], [[-10, 0, 4]])

    def test_detail_coordinates_scale_into_structure_and_refs_are_rebased(self):
        from damocleslab.catalogue import assemble_mesh
        base = {'vertices': [[0,0,0]], 'faces': [], 'lines': []}
        detail = {'vertices': [[1,2,3],[2,2,3],[1,4,3]], 'faces': [{'vertices':[0,1,2],'colour':'#ffffff','sourceColour':0x777}], 'lines': []}
        combined = assemble_mesh(base, detail, (2,-3))
        self.assertEqual(combined['vertices'][1], [2,2,-9])
        self.assertEqual(combined['faces'][0]['vertices'], [1,2,3])
        self.assertEqual(base['vertices'], [[0,0,0]])

    def test_interior_negative_height_is_a_transform_tag(self):
        data = struct.pack('>10h', 0,-11,0, 10,0,0, 0,10,0, -32768) + bytes.fromhex('0777 04 08 0c 00 0000')
        self.assertEqual(decode_mesh(data,0,'interior')['vertices'][0], [0,10,0])

class SurfaceBandTests(unittest.TestCase):
    def test_upper_wall_band_has_two_indices_and_uses_both_header_heights(self):
        from damocleslab.catalogue import decode_structure
        data = bytes.fromhex('01010000 00000000 0064 0050 0777 0444 000a000a 0014000a 0000 01027777 0000 0000')
        mesh, gaps = decode_structure(data,8)
        self.assertEqual(gaps, [])
        self.assertEqual([v[1] for v in mesh['vertices']], [100,100,80,80])


class ThirdHeightTests(unittest.TestCase):
    def test_lower_wall_and_sill_require_an_explicit_height_binding(self):
        from damocleslab.catalogue import decode_structure
        data = bytes.fromhex('01010000 00000000 00fa0096 07770444 000a000a 0014000a 00140014 000a0014 0000 01022066 01023044 0304 0000 0000')
        with self.assertRaisesRegex(ValueError, 'no supported surface faces'):
            decode_structure(data, 8)
        mesh, gaps = decode_structure(data, 8, third_height=48)
        self.assertEqual(gaps, [])
        self.assertEqual(mesh['vertices'][:4], [[10,48,10],[20,48,10],[20,0,10],[10,0,10]])
        self.assertEqual([point[1] for point in mesh['vertices'][4:]], [48]*4)
        self.assertEqual(mesh['faces'][0]['colour'], '#00cccc')


class EmptySurfaceTests(unittest.TestCase):
    def test_empty_plan_and_wall_list_is_an_accounted_record(self):
        from damocleslab.catalogue import decode_structure
        # Structure 100 at $01A618: heights 160/128, scene colours, immediate
        # plan terminator, wall-list zero word, no attachments.
        data = bytes.fromhex(
            '01013e01 000a000a 00a0 0080 8082 8092 0000 0000 0000'
        )
        mesh, gaps = decode_structure(data, 8, scale=(1, 1))
        self.assertEqual(mesh['vertices'], [])
        self.assertEqual(mesh['faces'], [])
        self.assertEqual(mesh['lines'], [])
        self.assertTrue(any('Empty surface record' in gap for gap in gaps))

    def test_empty_building_detail_terminates_at_8000(self):
        data = bytes.fromhex('8000')
        with self.assertRaisesRegex(
            ValueError,
            'Empty building-detail record: vertex list terminates immediately',
        ):
            decode_mesh(data, 0, 'interior')


class GroundTests(unittest.TestCase):
    def test_pad_strip_keeps_local_vertices_and_classifies_runtime_horizon_slots(self):
        from damocleslab.catalogue import classify_record, decode_ground
        # Short header $00FF, three plan points around cell centre, white quad
        # that also names the $F0 preprojected horizon slot, then terminator.
        data = bytes.fromhex(
            '00ff'
            '84b080c8 800080c8 7b5080c8 0000'
            '0777 04 08 0c f0 00'
            '0000'
        )
        mesh, gaps, transform, _ = decode_ground(data, 0, 0, hardware=[0] * 16)
        self.assertEqual(transform, 0)
        self.assertEqual(mesh['vertices'][:3], [[1200, 0, 200], [0, 0, 200], [-1200, 0, 200]])
        self.assertEqual(mesh['faces'][0]['sourceColour'], 0x777)
        self.assertEqual(mesh['faces'][0]['vertices'], [0, 1, 2])
        self.assertTrue(any('scene point slot $F0' in gap for gap in gaps))
        model = {'reason': ' '.join(gaps)}
        classify_record(model, False)
        self.assertEqual(model['omissions'], ['scenePoint'])

        # With the scene point placed, the quad keeps its fourth corner.
        placed, placed_gaps, _, _ = decode_ground(
            data, 0, 0, hardware=[0] * 16, scene={0xF0: [0x40000, 0, 0]}
        )
        self.assertEqual(placed_gaps, [])
        self.assertEqual(placed['faces'][0]['vertices'], [0, 1, 2, 3])
        self.assertEqual(placed['vertices'][3], [0x40000, 0, 0])
        self.assertEqual(placed['faces'][0]['sceneSlots'], [0xF0])

    def test_empty_record_is_a_gap_not_a_fabricated_quad(self):
        from damocleslab.catalogue import decode_ground
        mesh, gaps, transform, _ = decode_ground(bytes.fromhex('00ff 0000 0000'), 0, 0)
        self.assertEqual(transform, 0)
        self.assertEqual(mesh['faces'], [])
        self.assertEqual(mesh['lines'], [])
        self.assertTrue(any('Empty ground record' in gap for gap in gaps))

    def test_7000_command_places_an_addressed_object_template(self):
        from damocleslab.catalogue import decode_ground

        data = bytes.fromhex(
            '00ff'
            '0000'
            '7000 800a 7ff6 0004'
            '0000'
        )
        mesh, gaps, _, placements = decode_ground(data, 0, 0)

        self.assertEqual(mesh['faces'], [])
        self.assertEqual(placements, [{
            'objectSlot': 1,
            'position': [10, 0, -10],
        }])
        self.assertEqual(gaps, [])

    def test_7000_command_reuses_its_low_byte_when_word_is_odd_aligned(self):
        from damocleslab.catalogue import decode_ground

        data = bytes.fromhex(
            '0101 00 01 00'
            '0000'
            '7080 0a 7ff6 0004'
            '0000'
        )
        _, _, transform, placements = decode_ground(data, 0, 0)

        self.assertEqual(transform, 0)
        self.assertEqual(placements[0]['position'], [10, 0, -10])
        self.assertEqual(placements[0]['objectSlot'], 1)

    def test_palette_edge_becomes_a_line(self):
        from damocleslab.catalogue import decode_ground
        data = bytes.fromhex('00ff 84b08000 7b508000 0000 c00e 04 08 0000')
        mesh, gaps, _, _ = decode_ground(data, 0, 0, hardware=[0x444] * 16)
        self.assertEqual(len(mesh['lines']), 1)
        self.assertEqual(mesh['lines'][0]['vertices'], [0, 1])


class VisibilityListTests(unittest.TestCase):
    def test_reads_region_face_order_and_retains_special_commands_as_gaps(self):
        from damocleslab.catalogue import decode_visibility_list
        order, gaps = decode_visibility_list(bytes([3, 1, 0xff, 2, 0]), 0, 3)
        self.assertEqual(order, [2, 0, 1])
        self.assertEqual(gaps, ['Region visibility special command $FF is unresolved.'])

    def test_rejects_a_region_face_outside_the_model(self):
        from damocleslab.catalogue import decode_visibility_list
        with self.assertRaisesRegex(ValueError, 'visibility face reference'):
            decode_visibility_list(bytes([4, 0]), 0, 3)


def _empty_island_table(data: bytearray) -> None:
    """A per-body island list that terminates at once: a world with no islands."""
    struct.pack_into('>I', data, 0x4bd1e, 0x63000)
    for body in range(31):
        struct.pack_into('>h', data, 0x63000 + body * 2, 0x40)
    struct.pack_into('>H', data, 0x63040, 0x8000)


def _board_gate(data: bytearray) -> None:
    """The board gate every loaded world carries, which the boarding blocks read (#408)."""
    data[0x542E0:0x542E0 + len(BoardingAdmissionTests.GATE)] = BoardingAdmissionTests.GATE


def _empty_world():
    data = bytearray(1048576)
    struct.pack_into('>I', data, 0x4bd10, 0x35700)
    struct.pack_into('>I', data, 0x4bd22, 0x26000)
    for base, count in [(0x35700, 378), (0xe900, 280), (0x26000, 130)]:
        for slot in range(count):
            struct.pack_into('>I', data, base + slot * 4, 0x1000)
        struct.pack_into('>H', data, base + 0x1000, 0x8000)
    _empty_island_table(data)
    _board_gate(data)
    return data


class CensusTests(unittest.TestCase):
    def test_ground_7000_placement_uses_zero_surface_slot_palette(self):
        from damocleslab.catalogue import extract

        data = _empty_world()
        object_address = 0x36000
        struct.pack_into('>I', data, 0x35700 + 4, object_address - 0x35700)
        structure_address = 0xfA00
        struct.pack_into('>I', data, 0xe900, structure_address - 0xe900)
        data[structure_address - 8:structure_address] = bytes.fromhex('0101 0100 00000000')
        struct.pack_into('>H', data, 0xd200 + 2, 0x100)
        struct.pack_into('>64H', data, 0xd300, 0x000, 0x777, *([0x000] * 62))
        object_mesh = bytes.fromhex(
            '0000 0000 0000'
            '000a 0000 0000'
            '0000 000a 0000'
            '8000'
            '0000'
            '8082 04 08 0c 00'
            '0000'
        )
        data[object_address:object_address + len(object_mesh)] = object_mesh

        ground_address = 0x1e100
        for cell in range(256):
            struct.pack_into('>H', data, 0x1e400 + cell * 2, ground_address - 0x1e000)
        struct.pack_into('>H', data, 0xabdc, 0)
        ground = bytes.fromhex('00ff 0000 7000 800a 7ff6 0004 0000')
        data[ground_address:ground_address + len(ground)] = ground

        result = extract(bytes(data), {})
        target_id = f'object-{object_address:06x}'
        model = next(m for m in result['models'] if m['id'] == f'ground-{ground_address:06x}-00')

        self.assertEqual(model['relatedModels'], [target_id])
        self.assertEqual(model['recordClass'], 'geometry')
        self.assertEqual(model['variants'][0]['mesh']['vertices'][:3], [
            [10, 0, -10],
            [20, 0, -10],
            [10, 10, -10],
        ])
        self.assertEqual(model['variants'][0]['mesh']['faces'][0]['colour'], '#eeeeee')

    def test_ledger_classifies_null_and_empty_records_and_matches_counts(self):
        from damocleslab.catalogue import extract
        result = extract(bytes(_empty_world()), {})
        coverage = result['coverage']
        census = coverage['census']
        models = result['models']
        self.assertEqual(census['unique'], len(models))
        self.assertEqual(
            census['decoded'] + census['partial'] + census['unresolved'],
            census['unique'],
        )
        self.assertEqual(census['decoded'], sum(m['status'] == 'decoded' for m in models))
        self.assertEqual(census['partial'], sum(m['status'] == 'partial' for m in models))
        self.assertEqual(census['unresolved'], sum(m['status'] == 'unresolved' for m in models))
        self.assertFalse(coverage['complete'])
        self.assertTrue(any(m['recordClass'] == 'null' for m in models))
        self.assertTrue(any(m['recordClass'] == 'empty' for m in models))
        self.assertEqual(
            coverage['classifications']['null'],
            sum(m['recordClass'] == 'null' for m in models),
        )
        self.assertEqual(len(coverage['tables']), 4)
        kinds = {row['kind'] for row in coverage['tables']}
        self.assertEqual(kinds, {'object', 'structure', 'interior', 'ground'})
        self.assertTrue(any('disk' in note.lower() for note in coverage['unexplored']))
        self.assertTrue(any('title-screen' in item['path'] for item in coverage['diskLoad']))

    def test_empty_ground_record_is_a_fully_decoded_intentional_empty(self):
        from damocleslab.catalogue import extract

        result = extract(bytes(_empty_world()), {})
        model = next(
            item for item in result['models']
            if item['id'] == 'ground-01e000-00'
        )

        self.assertEqual(model['status'], 'decoded')
        self.assertEqual(model['recordClass'], 'empty')
        self.assertEqual(model['variants'], [])
        self.assertIn('$056634', model['reason'])
        self.assertNotIn('default cell fill', model['reason'])

    def test_keeps_a_selector_that_the_generic_grammar_accepts(self):
        from damocleslab.catalogue import extract
        data = _empty_world()
        start = 0x1a000
        interior = 0x27000
        struct.pack_into('>I', data, 0xe900 + 200 * 4, start - 0xe900)
        struct.pack_into('>I', data, 0x26000 + 5 * 4, interior - 0x26000)
        data[start - 8:start] = bytes.fromhex('01010005 00000000')
        body = bytes.fromhex('0064 0050 0777 0444 000a000a 0014000a 0000 01020777 0000 0000')
        regions = bytes.fromhex('c000 0000000a0000000a 0100 0000')
        data[start:start + len(body) + len(regions)] = body + regions
        mesh = struct.pack('>10h', 0, 0, 0, 10, 0, 0, 0, 10, 0, -32768)
        mesh += bytes.fromhex('0777 04 08 0c 00 0000 0000 0100 0000 0000')
        data[interior:interior + len(mesh)] = mesh
        result = extract(bytes(data), {})
        model = next(m for m in result['models'] if m['id'] == f'structure-{start:06x}')
        self.assertIn('structureSelection', model)
        self.assertNotEqual(model['id'], 'structure-01484e')

    def test_pinned_first_world_captures_extract_equal_models_when_present(self):
        from damocleslab.catalogue import extract
        root = Path(__file__).resolve().parents[1] / 'work'
        runs = [
            root / 'observe-first-world-20260818T101013Z-c5a32b7d' / 'observed.ram',
            root / 'observe-first-world-20260818T101117Z-010b9ad3' / 'observed.ram',
        ]
        if not all(path.exists() for path in runs):
            self.skipTest('pinned first-world RAM captures are Restricted Material')
        first = extract(runs[0].read_bytes(), {'run': 'a'})
        second = extract(runs[1].read_bytes(), {'run': 'b'})
        first['source'] = second['source'] = {}
        self.assertEqual(first, second)

    def test_interior_window_ram_does_not_replace_resident_model_tables(self):
        root = Path(__file__).resolve().parents[1] / 'work'
        first = root / 'observe-first-world-20260818T101013Z-c5a32b7d' / 'observed.ram'
        interior = root / 'interior-window-ram-20260818T172346Z-e3772e4d' / 'interior.ram'
        if not first.exists() or not interior.exists():
            self.skipTest('Working-Authority RAM captures are Restricted Material')
        a, b = first.read_bytes(), interior.read_bytes()
        self.assertEqual(a[0x35700:0x35700 + 378 * 4], b[0x35700:0x35700 + 378 * 4])
        self.assertEqual(a[0xe900:0xe900 + 280 * 4], b[0xe900:0xe900 + 280 * 4])
        self.assertEqual(a[0x26000:0x26000 + 130 * 4], b[0x26000:0x26000 + 130 * 4])
        self.assertEqual(a[0x1e400:0x1e400 + 512], b[0x1e400:0x1e400 + 512])

    def test_research_note_totals_match_the_tracked_payload_census(self):
        root = Path(__file__).resolve().parents[3]
        payload = root / 'payload' / 'damocles' / 'catalogue.json'
        note = root / 'docs' / 'research' / 'damocles-catalogue.md'
        document = json.loads(payload.read_text())
        census = document['coverage']['census']
        text = note.read_text()
        collapsed = ' '.join(text.split())
        marker = (
            f"**{census['unique']} unique records**: **{census['decoded']} decoded**, "
            f"**{census['partial']} partial**, and **{census['unresolved']} unresolved**"
        )
        self.assertIn(marker, collapsed)
        self.assertIn('Building detail', text)
        self.assertIn('$026000', text)
        self.assertIn('Pasti STX', text)
        self.assertIn('Vesta', text)
        self.assertIn('vesta-surface-64', text)
        self.assertIn('UR City', text)
        self.assertIn('gaea-ur-city-surface-24', text)
        self.assertIn('Dion', text)
        self.assertIn('dion-surface-32', text)


    def test_unexplored_notes_name_only_kinds_that_still_carry_the_omission(self):
        """A decode that lands must retire the ledger entry that described it.

        The articulation and live-text entries each outlived a decode once,
        because the entry text is a constant and nothing tied it to the
        omissions it describes.
        """
        root = Path(__file__).resolve().parents[3]
        document = read_catalogue((root / 'payload' / 'damocles' / 'catalogue.json'))
        models = document['models']
        unexplored = document['coverage']['unexplored']

        def carrying(tag):
            return [m for m in models if tag in (m.get('omissions') or [])]

        # Nothing carries the articulated omission any more, so no ledger entry
        # may still describe one. $7888 free-runs, which the models say for
        # themselves; it is a sampling decision rather than an unexplored gap.
        self.assertEqual(carrying('articulated'), [])
        self.assertEqual([note for note in unexplored if '$7888' in note], [])

        # Only the EXPLOSIVE-ARMED! countdown is still live text; the frame
        # animations and slot-derived labels were decoded, so the entry may not
        # claim any other token is unresolved.
        live = next(note for note in unexplored if '$CD14' in note)
        self.assertEqual(
            [m['name'] for m in carrying('liveText')], ['EXPLOSIVE-ARMED!']
        )
        self.assertIn('EXPLOSIVE-ARMED!', live)
        # The indirect-pointer and font-4 paths are unreached, not unresolved,
        # so no entry may present them as something still to be found.
        self.assertEqual(
            [note for note in unexplored
             if 'indirect' in note and 'unreached' not in note], []
        )

    def test_a_decoded_detail_selector_does_not_claim_unsimulated_visibility(self):
        root = Path(__file__).resolve().parents[3]
        document = read_catalogue((root / 'payload' / 'damocles' / 'catalogue.json'))
        details = [m for m in document['models'] if 'detailSelection' in m]
        self.assertEqual(len(details), 59)
        for model in details:
            self.assertIn('Both view-conditioned visibility groups', model['reason'])
            self.assertNotIn('visibility is not simulated', model['reason'])


class IntentionalEmptyTests(unittest.TestCase):
    """One verdict for a record that is authored to hold nothing."""

    def payload(self):
        root = Path(__file__).resolve().parents[3]
        return read_catalogue((root / 'payload' / 'damocles' / 'catalogue.json'))

    def test_every_empty_or_null_record_reads_decoded(self):
        models = self.payload()['models']
        settled = [
            m for m in models if m['recordClass'] in ('empty', 'null')
        ]
        self.assertEqual(len(settled), 13)
        kinds = {m['kind'] for m in settled}
        self.assertEqual(kinds, {'object', 'structure', 'interior', 'ground'})
        for model in settled:
            self.assertTrue(model['reason'].strip(), model['id'])
            if model['variants']:
                # Four empty surface records still show a linked detail's mesh,
                # so they stay partial for that detail's own limitations.
                self.assertEqual(model['status'], 'partial', model['id'])
            else:
                self.assertEqual(model['status'], 'decoded', model['id'])
        self.assertEqual(sum(1 for m in settled if m['variants']), 4)
        self.assertEqual(sum(1 for m in settled if not m['variants']), 9)

    def test_nothing_is_left_unresolved(self):
        document = self.payload()
        census = document['coverage']['census']
        self.assertEqual(census['unresolved'], 0)
        self.assertEqual(
            [m['id'] for m in document['models'] if m['status'] == 'unresolved'],
            [],
        )
        # The census is still incomplete: a full bank is not a full account.
        self.assertFalse(document['coverage']['complete'])

    def test_a_settled_empty_still_needs_an_empty_record_class(self):
        from damocleslab.catalogue import settle_intentional_empties

        keeps = {
            'recordClass': 'empty', 'status': 'unresolved', 'omissions': [],
            'variants': [], 'intentionalEmpty': True,
        }
        drops = [
            # A real gap was appended after the empty was recognised.
            {**keeps, 'omissions': ['articulated']},
            # The record draws something, so it is not an empty.
            {**keeps, 'variants': [{'id': 'record'}]},
            # Nothing marked it as an authored empty in the first place.
            {**keeps, 'intentionalEmpty': False},
        ]
        models = [dict(keeps)] + [dict(m) for m in drops]
        settle_intentional_empties(models)
        self.assertEqual(models[0]['status'], 'decoded')
        for model in models[1:]:
            self.assertEqual(model['status'], 'unresolved')
        # The marker never reaches the payload.
        self.assertTrue(all('intentionalEmpty' not in m for m in models))


class ScaledArticulationTests(unittest.TestCase):
    """A building detail turns in the frame its placing structure scales it into."""

    AXIS_Z_BEFORE_X = 0

    def _world(self, axis: int = AXIS_Z_BEFORE_X) -> bytes:
        # One tagged vertex on the X axis, two plain ones, then the $8001
        # articulation record and a single face.
        record = struct.pack('>9h', 100, -1, 0, 0, 50, 0, 0, 0, 100)
        record += struct.pack('>5h', -32767, axis, 10, 0, 0)
        record += bytes.fromhex('0777 04 08 0c 00 0000')
        data = bytearray(record.ljust(0x92_5a + 0x280, b'\0'))
        for index in range(320):
            struct.pack_into(
                '>h', data, 0x92_5a + index * 2,
                max(-32768, min(32767, round(32768 * math.sin(2 * math.pi * index / 256)))),
            )
        return bytes(data)

    def test_the_pivot_and_the_vertices_are_scaled_before_the_turn(self):
        from damocleslab.catalogue import decode_mesh, turn_detail_mesh

        data = self._world()
        mesh = decode_mesh(data, 0, 'interior')
        self.assertEqual(mesh['articulation']['pivot'], [10, 0, 0])
        self.assertEqual(mesh['articulation']['vertices'], [0])

        # $053B4A scales the pivot by the structure's X/Z bytes and $053D52
        # scales every vertex, so a quarter turn happens 360 units out rather
        # than the model-local 90.
        turned = turn_detail_mesh(data, mesh, (4, 2), 0x40)
        self.assertEqual(turned['vertices'][0], [40, 0, -360])
        # Untagged vertices are only scaled. $539D0 is never written, so Y is not.
        self.assertEqual(turned['vertices'][1:], [[0, 50, 0], [0, 0, 200]])
        self.assertEqual(turned['articulation']['scale'], [4, 2])
        self.assertEqual(turned['articulation']['sampledAngle'], 0x40)

    def test_a_nonuniform_frame_is_not_a_scaled_copy_of_a_uniform_one(self):
        from damocleslab.catalogue import decode_mesh, turn_detail_mesh

        data = self._world()
        mesh = decode_mesh(data, 0, 'interior')
        uniform = turn_detail_mesh(data, mesh, (2, 2), 0x40)['vertices'][0]
        nonuniform = turn_detail_mesh(data, mesh, (4, 2), 0x40)['vertices'][0]
        # Under a uniform frame, turning after scaling and scaling after
        # turning agree: the arm keeps its length either way.
        self.assertEqual(uniform, [20, 0, -180])
        # Under 4x2 they do not. Scaling the model-local turn would put the arm
        # at -180 on Z; the native order doubles it, because the arm is scaled
        # on X before it swings onto Z.
        self.assertEqual(nonuniform, [40, 0, -360])

    def test_a_mirrored_frame_turns_the_other_way(self):
        """Mirroring is not a sign flip: the high-word keep floors both ways."""
        from damocleslab.catalogue import decode_mesh, turn_detail_mesh

        data = self._world()
        mesh = decode_mesh(data, 0, 'interior')
        self.assertEqual(
            turn_detail_mesh(data, mesh, (-4, -2), 0x40)['vertices'][0],
            [-40, 0, 358],
        )

    def test_the_axis_value_names_which_coordinate_leads(self):
        from damocleslab.catalogue import articulation_plane

        # $053DB2 reads Z before X, $053D6A reads X before Y, and $053DF8 reads
        # Y before Z. Leading with the wrong one turns the part backwards.
        self.assertEqual(articulation_plane(0), (2, 0))
        self.assertEqual(articulation_plane(1), (0, 1))
        self.assertEqual(articulation_plane(-1), (1, 2))

    def test_a_turned_form_keeps_the_record_ordinals_it_was_decoded_with(self):
        from damocleslab.catalogue import decode_mesh, turn_detail_mesh

        data = self._world()
        mesh = decode_mesh(data, 0, 'interior')
        turned = turn_detail_mesh(data, mesh, (4, 2), 0x60)
        # A frame moves vertices. It may not renumber, drop or add the source
        # records a detail selector indexes by ordinal.
        self.assertEqual(turned['recordCount'], mesh['recordCount'])
        self.assertEqual(
            [face['sourceIndex'] for face in turned['faces']],
            [face['sourceIndex'] for face in mesh['faces']],
        )
        self.assertEqual(
            [face['vertices'] for face in turned['faces']],
            [face['vertices'] for face in mesh['faces']],
        )


class ArticulatedDetailPayloadTests(unittest.TestCase):
    """The five placed articulated details, as the payload offers them."""

    def payload(self):
        root = Path(__file__).resolve().parents[3]
        return read_catalogue((root / 'payload' / 'damocles' / 'catalogue.json'))

    def test_every_placed_articulated_detail_is_turned_in_each_frame(self):
        document = self.payload()
        details = [
            model for model in document['models']
            if model['kind'] == 'interior'
            and any(c.startswith('structure scale') for c in model.get('conditions') or [])
        ]
        self.assertEqual(
            [model['id'] for model in details],
            ['interior-02630e', 'interior-026556', 'interior-0268ee',
             'interior-02dfb4', 'interior-02e44e'],
        )
        for model in details:
            self.assertEqual(model['omissions'], [])
            frames = {
                tuple(variant['mesh']['articulation']['scale'])
                for variant in model['variants']
                if 'scale' in variant['mesh'].get('articulation', {})
            }
            self.assertTrue(frames, model['id'])
            for frame in frames:
                # One frame may be worn in more than one palette, so compare
                # the angles it offers rather than how many forms carry them.
                angles = {
                    variant['mesh']['articulation']['sampledAngle']
                    for variant in model['variants']
                    if variant['mesh'].get('articulation', {}).get('scale') == list(frame)
                }
                self.assertEqual(angles, {index * 32 for index in range(8)})
            self.assertIn('$054D98', model['reason'])
            self.assertIn('$053B4A', model['reason'])

    def test_one_detail_identity_carries_every_frame_that_reuses_it(self):
        models = {model['id']: model for model in self.payload()['models']}
        reused = models['interior-026556']
        frames = {
            tuple(variant['mesh']['articulation']['scale'])
            for variant in reused['variants']
            if 'scale' in variant['mesh'].get('articulation', {})
        }
        self.assertEqual(frames, {(3, 3), (-3, -3), (4, 2), (-4, -2), (-5, -5)})
        # Five structures place it; there is still one detail model.
        placing = [
            model for model in self.payload()['models']
            if 'interior-026556' in model['relatedModels']
        ]
        self.assertEqual(len(placing), 5)

    def test_the_unreachable_records_stay_excluded_in_every_frame(self):
        models = {model['id']: model for model in self.payload()['models']}
        excluded = models['interior-02e44e']
        for variant in excluded['variants']:
            self.assertEqual(
                variant['mesh']['unreferencedRecords'], [17, 18, 19, 20]
            )
            self.assertEqual(variant['mesh']['recordCount'], 46)


class UnreferencedRecordTests(unittest.TestCase):
    """A face record naming a vertex slot its own list never fills."""

    def test_building_detail_69_keeps_four_records_nothing_selects(self):
        root = Path(__file__).resolve().parents[3]
        document = read_catalogue((root / 'payload' / 'damocles' / 'catalogue.json'))
        model = next(
            m for m in document['models'] if m['id'] == 'interior-02e44e'
        )
        mesh = model['variants'][0]['mesh']

        self.assertEqual(model['status'], 'partial')
        self.assertEqual(mesh['recordCount'], 46)
        self.assertEqual(mesh['unreferencedRecords'], [17, 18, 19, 20])
        # They occupy ordinals so the later selector bytes still line up, but
        # contribute nothing drawable.
        drawn = {
            p['sourceIndex'] for p in mesh['faces'] + mesh['lines']
            if 'sourceIndex' in p
        }
        self.assertEqual(drawn & {17, 18, 19, 20}, set())
        self.assertEqual(max(drawn), 45)
        named = set()
        for group in model['detailSelection']:
            named.update(group['default'])
            for box in group['boxes']:
                named.update(box['records'])
        self.assertEqual(named & {17, 18, 19, 20}, set())
        self.assertEqual(max(named), 45)

    def test_a_selected_unreferenced_record_is_still_an_error(self):
        from damocleslab.catalogue import check_unreferenced

        mesh = {'unreferencedRecords': [17]}
        check_unreferenced(mesh, [{'boxes': [], 'default': [16]}])
        with self.assertRaisesRegex(ValueError, 'visibility group selects it'):
            check_unreferenced(mesh, [{'boxes': [], 'default': [17]}])
        with self.assertRaisesRegex(ValueError, 'visibility group selects it'):
            check_unreferenced(
                mesh, [{'boxes': [{'records': [17]}], 'default': []}]
            )

    def test_only_a_building_detail_may_keep_one(self):
        """Only a detail has selector lists that can prove unreachability."""
        root = Path(__file__).resolve().parents[3]
        document = read_catalogue((root / 'payload' / 'damocles' / 'catalogue.json'))
        carrying = [
            model for model in document['models']
            if any('unreferencedRecords' in variant['mesh']
                   for variant in model['variants'])
        ]
        self.assertEqual([m['id'] for m in carrying], ['interior-02e44e'])
        # Every turned form of detail 69 keeps the same excluded ordinals: a
        # scaled frame changes where its vertices are, not which records draw.
        self.assertTrue(all(
            variant['mesh']['unreferencedRecords'] == [17, 18, 19, 20]
            for variant in carrying[0]['variants']
        ))
        self.assertTrue(all(m['kind'] == 'interior' for m in carrying))


class AttachmentKeyTests(unittest.TestCase):
    def test_the_cell_entry_byte_installs_the_key_base(self):
        from damocleslab.catalogue import cell_key_base

        # $054CBE masks with $FE, so bit 0 belongs to the surface slot.
        self.assertEqual(cell_key_base(0x0A), 0x22)
        self.assertEqual(cell_key_base(0x0B), 0x22)
        self.assertEqual(cell_key_base(0x02), 0x1E)
        self.assertEqual(cell_key_base(0x1E), 0x2C)
        # Empty cells, the $1E000 ground template range and the $CD74 text
        # pointer range all clear the word.
        self.assertEqual(cell_key_base(0x00), 0)
        self.assertEqual(cell_key_base(0x20), 0)
        self.assertEqual(cell_key_base(0xA0), 0)

    def test_the_label_is_a_space_without_a_base_and_a_letter_with_one(self):
        from damocleslab.catalogue import attachment_key_label

        self.assertEqual(attachment_key_label(0x22, 0x4200), 0x20)
        self.assertEqual(attachment_key_label(0x00, 0x42F0), 0x20)
        self.assertEqual(chr(attachment_key_label(0x1E, 0x42F0)), 'A')
        self.assertEqual(chr(attachment_key_label(0x22, 0x42F0)), 'E')
        self.assertEqual(chr(attachment_key_label(0x1E, 0x42F2)), 'C')

    def test_an_f0_control_keeps_the_constructor_of_its_zero_latch_twin(self):
        from damocleslab.catalogue import entrance_constructor

        # $059FAA clears only the low byte, so bits 8, 9 and 15 decide the shape.
        for high in (0x4000, 0x4100, 0x4200, 0x8000, 0x8100, 0x8200):
            self.assertEqual(
                entrance_constructor(high), entrance_constructor(high | 0xF0)
            )

    def test_the_vesta_capture_pins_the_predicted_key_letter(self):
        """The $CD3F letter #271 observed is the one this rule predicts."""
        from damocleslab.catalogue import (
            attachment_key_label, cell_key_base, hatari_memstate_ram,
        )

        root = Path(__file__).resolve().parents[1]
        ram = hatari_memstate_ram(
            (root / 'snapshots' / 'vesta-parliament-4-6.sav').read_bytes()
        )
        cell = int.from_bytes(ram[0x7B5C:0x7B5E], 'big')
        base = cell_key_base(ram[0xABDC + cell * 4])

        self.assertEqual(cell, 100)
        self.assertEqual(base, ram[0x7AFB])
        self.assertEqual(base, 0x22)
        # Slot $3EC is the fifth attachment, so $059FC4 writes $CD35 + 10.
        self.assertEqual(ram[0xCD3F], attachment_key_label(base, 0x42F0))
        self.assertEqual(chr(ram[0xCD3F]), 'E')
        # Its four zero-latch neighbours stay blank.
        self.assertEqual(
            [ram[a] for a in (0xCD37, 0xCD39, 0xCD3B, 0xCD3D)], [0x20] * 4
        )

    def test_the_payload_publishes_the_key_base_of_every_keyed_cell(self):
        """A keyed entrance names an object slot, and the cell chooses which.

        The key slot is the cell's base plus the entrance's low nybble, and the
        letter is that slot's distance from slot 30. Three of these four cells
        are the ones the guide list independently annotates "needs key", and
        they agree letter for letter.
        """
        root = Path(__file__).resolve().parents[3]
        payload = read_catalogue((root / 'payload' / 'damocles' / 'catalogue.json'))
        models = {model['id']: model for model in payload['models']}
        keyed = {}
        for instance in payload['instances']:
            base = instance.get('keyBase')
            selection = models[instance['model']].get('structureSelection')
            if not base or selection is None:
                continue
            for attachment in selection['attachments']:
                if 'keyIndex' in attachment:
                    keyed[instance['id']] = base + attachment['keyIndex']

        self.assertEqual(keyed, {
            'dion-surface-de': 30,
            'dion-surface-b2': 33,
            'vesta-surface-64': 34,
            'gaea-ur-city-surface-17': 31,
            # The authored Birmingham stream repeats the two Dion cells (#324).
            'gaea-surface-de': 30,
            'gaea-surface-b2': 33,
            # Recovered by #172's live TOLOSA workspace: the currency repository
            # at cell $12 is keyed to slot 37, which resides on MIDAS. The guide
            # said Tolosa's repository needs a key found on Midas; this is that
            # claim met by recovered data, and it names the slot rather than the
            # guide's letter.
            'tolosa-surface-12': 37,
        })
        for slot in set(keyed.values()):
            name = next(item['name'] for item in payload['instances']
                        if item['id'] == f'object-slot-{slot}')
            self.assertTrue(name.startswith('DOOR KEY'), name)

    def test_the_eris_keyed_entrances_install_no_base(self):
        """Which is why a shut door never blocked anything on Eris."""
        root = Path(__file__).resolve().parents[3]
        payload = read_catalogue((root / 'payload' / 'damocles' / 'catalogue.json'))
        models = {model['id']: model for model in payload['models']}
        for instance in payload['instances']:
            selection = models.get(instance['model'], {}).get('structureSelection')
            if selection is None or not instance['id'].startswith('eris-surface-'):
                continue
            if any('keyIndex' in item for item in selection['attachments']):
                self.assertIsNone(instance['keyBase'], instance['id'])

    def _every_capture(self):
        """Every independent capture in this checkout, first-world runs first."""
        from damocleslab.catalogue import hatari_memstate_ram

        root = Path(__file__).resolve().parents[1]
        captures = [
            (path.parent.name, path.read_bytes())
            for path in sorted(root.glob('work/observe-first-world-*/observed.ram'))
        ]
        captures += [
            (path.stem, hatari_memstate_ram(path.read_bytes()))
            for path in sorted(root.glob('snapshots/*.sav'))
        ]
        if len(captures) < 2:
            self.skipTest('Working-Authority RAM captures are Restricted Material')
        return captures

    def test_every_capture_agrees_the_animation_character_is_its_indexed_frame(self):
        """The claim that makes a frame script model data rather than capture state.

        Independent captures disagree about the index, which is why baking one
        capture's character in was never deterministic. They agree exactly about
        the script and about the character being the frame the index names, so
        the script is the whole set of forms the record can draw.
        """
        from damocleslab.catalogue import TEXT_ANIMATION_TARGETS, text_animation_script

        captures = self._every_capture()
        for target in TEXT_ANIMATION_TARGETS:
            scripts, indices = set(), set()
            for name, ram in captures:
                # Raises unless character, index and script agree in this capture.
                script = text_animation_script(ram, target)
                scripts.add(script)
                indices.add(int.from_bytes(ram[target + 2:target + 4], 'big'))
            self.assertEqual(len(scripts), 1, f'${target:04X} script differs')
            self.assertGreater(len(indices), 1, f'${target:04X} index never moved')

    def test_the_pinned_scripts_are_the_ones_the_catalogue_offers_frames_from(self):
        from damocleslab.catalogue import text_animation_script

        captures = self._every_capture()
        ram = captures[0][1]
        # $89's script is one character repeated, so a building detail reaching
        # it draws the same space whatever the free-running index holds.
        self.assertEqual(set(text_animation_script(ram, 0xCD9C)), {ord(' ')})
        self.assertEqual(text_animation_script(ram, 0xCDCE), b'IPQRQPIMNONM')
        self.assertEqual(len(text_animation_script(ram, 0xCE6A)), 697)

    def test_every_capture_reads_the_explosive_countdown_as_disarmed(self):
        from damocleslab.catalogue import (
            EXPLOSIVE_COUNTDOWN_DISARMED, EXPLOSIVE_COUNTDOWN_TARGET,
        )

        for name, ram in self._every_capture():
            start = EXPLOSIVE_COUNTDOWN_TARGET
            reading = ram[start:ram.index(b'\0', start)].decode('ascii')
            self.assertEqual(reading, EXPLOSIVE_COUNTDOWN_DISARMED, name)

    def test_a_descriptor_that_does_not_hold_together_fails_closed(self):
        from damocleslab.catalogue import text_animation_script

        good = bytearray(b'B\x00\x00\x01ABC\x00'.ljust(0x20, b'\0'))
        self.assertEqual(text_animation_script(bytes(good), 0), b'ABC')

        for label, mutate in (
            ('character is not its indexed frame', lambda d: d.__setitem__(0, ord('Z'))),
            ('not NUL-terminated', lambda d: d.__setitem__(1, ord('!'))),
            ('outside its script', lambda d: d.__setitem__(3, 9)),
            ('unsupported', lambda d: d.__setitem__(5, 0x01)),
            ('script is empty', lambda d: d.__setitem__(4, 0)),
        ):
            broken = bytearray(good)
            mutate(broken)
            with self.assertRaisesRegex(ValueError, label):
                text_animation_script(bytes(broken), 0)
        with self.assertRaisesRegex(ValueError, 'truncated'):
            text_animation_script(b'B\x00\x00\x00', 0)
        with self.assertRaisesRegex(ValueError, 'terminator missing'):
            text_animation_script(b'A\x00\x00\x00ABC', 0)

    def test_no_record_in_the_census_reaches_indirect_text_or_font_4(self):
        """Why neither path adds a catalogue form: nothing selects them.

        Both were named as unresolved because the decoder fails closed on them,
        not because a record was seen taking either. Inventorying every record
        settles that without needing either path decoded.
        """
        import damocleslab.catalogue as catalogue

        root = Path(__file__).resolve().parents[1]
        run = root / 'work' / 'observe-first-world-20260818T101013Z-c5a32b7d'
        if not (run / 'observed.ram').exists():
            self.skipTest('Working-Authority RAM captures are Restricted Material')
        data = (run / 'observed.ram').read_bytes()
        workspaces = [
            catalogue.hatari_memstate_ram((root / 'snapshots' / f'{name}.sav').read_bytes())
            for name in ('vesta-parliament-4-6', 'gaea-ur-city-4-2', 'dion-2-3')
        ]

        seen = {}
        originals = {}
        for name, flags_at in (('decode_object_lettering', 6),
                               ('decode_ground_lettering', 6),
                               ('decode_building_lettering', 8)):
            originals[name] = getattr(catalogue, name)

            def spy(data, reader, *args, _name=name, _at=flags_at, **kwargs):
                start = (reader.p & ~1) + _at
                seen[start] = struct.unpack_from('>H', data, start)[0]
                return originals[_name](data, reader, *args, **kwargs)

            setattr(catalogue, name, spy)
        try:
            catalogue.extract(data, {'runId': 'inventory'}, workspaces)
        finally:
            for name, original in originals.items():
                setattr(catalogue, name, original)

        # 41 from the captures, and eight more the image-derived road cells
        # letter (#460).
        self.assertEqual(len(seen), 49)
        self.assertEqual([hex(a) for a, f in seen.items() if not f & 0x8000], [])
        self.assertEqual([hex(a) for a, f in seen.items() if f & 0xF == 4], [])
        self.assertEqual(sorted({f & 0xF for f in seen.values()}), [0, 1, 2, 3, 5])

    def test_no_capture_holds_a_visual_change_record_for_the_df_branch(self):
        from damocleslab.catalogue import hatari_memstate_ram

        root = Path(__file__).resolve().parents[1]
        for name in ('vesta-parliament-4-6', 'gaea-ur-city-4-2', 'dion-2-3'):
            ram = hatari_memstate_ram(
                (root / 'snapshots' / f'{name}.sav').read_bytes()
            )
            self.assertEqual(ram[0x6364 + 6], 0, name)


class DiskLoadTests(unittest.TestCase):
    def test_pasti_header_rejects_a_non_stx_image(self):
        from damocleslab.catalogue import pasti_stx_header
        with self.assertRaisesRegex(ValueError, 'Pasti'):
            pasti_stx_header(b'STXFAKE' + b'\0' * 20)

    def test_working_authority_stx_is_pasti_v3_without_resident_labels(self):
        from damocleslab.catalogue import pasti_stx_header
        path = (
            Path(__file__).resolve().parents[3]
            / 'roms/atarist/damocles_-_mercenary_ii_novagen_software_(uk).stx'
        )
        if not path.exists():
            self.skipTest('Working-Authority STX is Restricted Material')
        header = pasti_stx_header(path.read_bytes())
        self.assertEqual(header['magic'], 'RSY')
        self.assertEqual(header['version'], 3)
        self.assertEqual(header['size'], 1031930)
        self.assertEqual(
            header['sha256'],
            '8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef',
        )
        self.assertFalse(header['containsResidentLabels'])

    def test_title_to_world_writes_the_table_base_block(self):
        root = Path(__file__).resolve().parents[1] / 'work'
        title = root / 'title-screen-20260818T100238Z-ba3cfe1d' / 'title-screen.ram'
        world = root / 'observe-first-world-20260818T101013Z-c5a32b7d' / 'observed.ram'
        if not title.exists() or not world.exists():
            self.skipTest('Working-Authority RAM captures are Restricted Material')
        a, b = title.read_bytes(), world.read_bytes()
        self.assertEqual(a[0x4BD00:0x4BD40], b'\0' * 0x40)
        self.assertEqual(int.from_bytes(b[0x4BD0C:0x4BD10], 'big'), 0xE900)
        self.assertEqual(int.from_bytes(b[0x4BD10:0x4BD14], 'big'), 0x35700)
        self.assertEqual(int.from_bytes(b[0x4BD22:0x4BD26], 'big'), 0x26000)
        self.assertEqual(b[0x7AFB], 0)
        self.assertNotIn(b'DART II', a)
        self.assertIn(b'DART II', b)


class LiveWorkspaceTests(unittest.TestCase):
    def test_hatari_memstate_ram_aligns_dialis_at_81dc(self):
        from damocleslab.catalogue import hatari_memstate_ram
        ram = bytearray(1048576)
        ram[0x81DC:0x81E4] = b'DIALIS  '
        blob = b'2.6.1\0' + b'\0' * 100 + bytes(ram)
        self.assertEqual(hatari_memstate_ram(blob)[0x81DC:0x81E4], b'DIALIS  ')
        with self.assertRaisesRegex(ValueError, 'DIALIS'):
            hatari_memstate_ram(b'nope')

    def test_live_workspace_places_the_selected_body_cell(self):
        from damocleslab.catalogue import extract
        data = _empty_world()
        workspace = bytearray(data)
        struct.pack_into('>H', workspace, 0x7AA8, 14 * 4)
        workspace[0x81DC + 14 * 8:0x81E4 + 14 * 8] = b'VESTA   '
        struct.pack_into('>H', workspace, 0x7B5C, 0x64)
        struct.pack_into('>I', workspace, 0x7A92, 1087 << 16)
        struct.pack_into('>I', workspace, 0x7A9A, 313 << 16)
        struct.pack_into('>I', workspace, 0x7A2C, 4 << 16)
        struct.pack_into('>I', workspace, 0x7A34, 6 << 16)
        struct.pack_into('>Hbb', workspace, 0xABDC + 0x64 * 4, 70, 0, 0x46)
        result = extract(bytes(data), {}, bytes(workspace))
        placed = next(i for i in result['instances'] if i['id'] == 'vesta-surface-64')
        self.assertEqual(placed['location']['body'], 'body-14')
        self.assertEqual(placed['model'], result['tables'][1]['entries'][70])
        self.assertTrue(any(item['path'] == 'Vesta live workspace' for item in result['coverage']['diskLoad']))

    def test_live_gaea_workspace_keeps_birmingham_surface_identities(self):
        from damocleslab.catalogue import extract
        data = bytearray(_empty_world())
        struct.pack_into('>i', data, 0x63a8 + 2 * 4, 519 << 16)
        struct.pack_into('>i', data, 0x6ba8 + 2 * 4, 1793 << 16)
        stream = bytes.fromhex('0c 40 96 00 dd 32 1a 26 4a 00 00 00 ff')
        header = b'BIRMINGHAMISLAND    '
        places = b'\x40ELMDON    SPACEPORT \x00'
        block = stream + header + places
        data[0x23c00:0x23c00 + len(block)] = block

        workspace = bytearray(data)
        struct.pack_into('>H', workspace, 0x7AA8, 8 * 4)
        workspace[0x81DC + 8 * 8:0x81E4 + 8 * 8] = b'GAEA    '
        struct.pack_into('>H', workspace, 0x7B5C, 0x24)
        struct.pack_into('>I', workspace, 0x7A92, 516 << 16)
        struct.pack_into('>I', workspace, 0x7A9A, 1794 << 16)
        struct.pack_into('>I', workspace, 0x7A2C, 4 << 16)
        struct.pack_into('>I', workspace, 0x7A34, 2 << 16)
        struct.pack_into('>I', workspace, 0x7A6C, 0x30000)
        workspace[0x30000:0x30000 + 20] = b'UR        CITY      '
        workspace[0x30014:0x30014 + 22] = b'\x24HANTZENS  NEW HOUSE \x00'
        struct.pack_into('>Hbb', workspace, 0xABDC + 0x24 * 4, 70, 0, 0)
        struct.pack_into('>Hbb', workspace, 0xABDC + 0x26 * 4, 70, 0, 0)

        result = extract(bytes(data), {}, bytes(workspace))
        birmingham = next(i for i in result['instances'] if i['id'] == 'gaea-surface-26')
        live = next(i for i in result['instances'] if i['id'] == 'gaea-ur-city-surface-24')
        self.assertIsNone(birmingham['location']['place'])
        self.assertEqual(live['location']['body'], 'body-8')
        self.assertEqual(live['location']['place'], 'place-030014')
        self.assertEqual(live['name'], 'HANTZENS NEW HOUSE')
        self.assertFalse(any(i['id'] == 'gaea-surface-24' for i in result['instances']))
        self.assertEqual(
            [i['id'] for i in result['instances'] if i['id'].startswith('gaea-surface-')],
            ['gaea-surface-26', 'gaea-surface-40'],
        )

    def test_live_dion_workspace_does_not_reuse_gaea_place_names(self):
        from damocleslab.catalogue import extract
        data = bytearray(_empty_world())
        struct.pack_into('>i', data, 0x63a8 + 2 * 4, 519 << 16)
        struct.pack_into('>i', data, 0x6ba8 + 2 * 4, 1793 << 16)
        stream = bytes.fromhex('0c 40 96 00 dd 32 1a 26 4a 00 00 00 ff')
        header = b'BIRMINGHAMISLAND    '
        places = b'\x40ELMDON    SPACEPORT \x00'
        block = stream + header + places
        data[0x23c00:0x23c00 + len(block)] = block

        workspace = bytearray(data)
        struct.pack_into('>H', workspace, 0x7AA8, 4 * 4)
        workspace[0x81DC + 4 * 8:0x81E4 + 4 * 8] = b'DION    '
        struct.pack_into('>H', workspace, 0x7B5C, 0x32)
        struct.pack_into('>I', workspace, 0x7A92, 3254 << 16)
        struct.pack_into('>I', workspace, 0x7A9A, 1317 << 16)
        struct.pack_into('>I', workspace, 0x7A2C, 2 << 16)
        struct.pack_into('>I', workspace, 0x7A34, 3 << 16)
        struct.pack_into('>I', workspace, 0x7A6C, 0x23c00 + len(stream))
        struct.pack_into('>Hbb', workspace, 0xABDC + 0x32 * 4, 70, 0, 0)
        struct.pack_into('>Hbb', workspace, 0xABDC + 0x40 * 4, 70, 0, 0)

        result = extract(bytes(data), {}, bytes(workspace))
        current = next(i for i in result['instances'] if i['id'] == 'dion-surface-32')
        other = next(i for i in result['instances'] if i['id'] == 'dion-surface-40')
        elmdon = next(p for p in result['places'] if p['name'] == 'ELMDON SPACEPORT')
        self.assertEqual(current['location']['body'], 'body-4')
        self.assertIsNone(current['location']['place'])
        self.assertIsNone(other['location']['place'])
        self.assertEqual(other['name'], 'DION surface cell 0,4')
        self.assertEqual(elmdon['body'], 'body-8')
        self.assertEqual(elmdon['instances'], ['gaea-surface-40'])

    def test_pinned_vesta_memstate_rewrites_abdc_without_new_object_banks(self):
        from damocleslab.catalogue import extract, hatari_memstate_ram
        root = Path(__file__).resolve().parents[1]
        first = root / 'work' / 'observe-first-world-20260818T101013Z-c5a32b7d' / 'observed.ram'
        sav = root / 'snapshots' / 'vesta-parliament-4-6.sav'
        if not first.exists() or not sav.exists():
            self.skipTest('Working-Authority RAM captures are Restricted Material')
        workspace = hatari_memstate_ram(sav.read_bytes())
        self.assertEqual(workspace[0x7AA8:0x7AAA], b'\x00\x38')
        self.assertEqual(workspace[0x7B5C:0x7B5E], b'\x00\x64')
        self.assertIn(b'VESTA     PARLIAMENT', workspace)
        first_bytes = first.read_bytes()
        result = extract(first_bytes, {}, workspace)
        parliament = next(i for i in result['instances'] if i['id'] == 'vesta-surface-64')
        self.assertEqual(parliament['location']['body'], 'body-14')
        self.assertEqual(parliament['location']['place'], 'place-024101')
        parliament_model = next(m for m in result['models'] if m['id'] == parliament['model'])
        assembly = parliament_model['variants'][0]['mesh']
        self.assertEqual(len(assembly['faces']), 117)
        detail = next(m for m in result['models'] if m['id'] == 'interior-02e910')
        live = next(v for v in detail['variants'] if v['id'] == 'palette-30-live-vesta')
        self.assertEqual(len(live['mesh']['faces']), 54)
        self.assertEqual(
            {0x35700 + int.from_bytes(first_bytes[0x35700 + s * 4:0x35704 + s * 4], 'big') for s in range(378)},
            {0x35700 + int.from_bytes(workspace[0x35700 + s * 4:0x35704 + s * 4], 'big') for s in range(378)},
        )
        self.assertNotEqual(first_bytes[0xABDC:0xABDC + 1024], workspace[0xABDC:0xABDC + 1024])

    def test_pinned_gaea_memstate_places_ur_city_without_birmingham_ids(self):
        from damocleslab.catalogue import extract, hatari_memstate_ram
        root = Path(__file__).resolve().parents[1]
        first = root / 'work' / 'observe-first-world-20260818T101013Z-c5a32b7d' / 'observed.ram'
        sav = root / 'snapshots' / 'gaea-ur-city-4-2.sav'
        if not first.exists() or not sav.exists():
            self.skipTest('Working-Authority RAM captures are Restricted Material')
        workspace = hatari_memstate_ram(sav.read_bytes())
        self.assertEqual(workspace[0x7AA8:0x7AAA], b'\x00\x20')
        self.assertEqual(workspace[0x7B5C:0x7B5E], b'\x00\x24')
        self.assertIn(b'UR        CITY', workspace)
        first_bytes = first.read_bytes()
        result = extract(first_bytes, {}, workspace)
        current = next(i for i in result['instances'] if i['id'] == 'gaea-ur-city-surface-24')
        house = next(i for i in result['instances'] if i['id'] == 'gaea-ur-city-surface-17')
        self.assertEqual(current['location']['body'], 'body-8')
        self.assertIsNone(current['location']['place'])
        self.assertEqual(house['name'], 'HANTZENS NEW HOUSE')
        self.assertTrue(any(i['id'] == 'gaea-surface-40' for i in result['instances']))
        self.assertFalse(any(i['id'] == 'gaea-surface-24' for i in result['instances']))
        self.assertEqual(
            {0x35700 + int.from_bytes(first_bytes[0x35700 + s * 4:0x35704 + s * 4], 'big') for s in range(378)},
            {0x35700 + int.from_bytes(workspace[0x35700 + s * 4:0x35704 + s * 4], 'big') for s in range(378)},
        )

    def test_multiple_live_workspaces_keep_each_capture_text_tokens(self):
        from damocleslab.catalogue import extract, hatari_memstate_ram
        root = Path(__file__).resolve().parents[1]
        first = root / 'work' / 'observe-first-world-20260818T101013Z-c5a32b7d' / 'observed.ram'
        vesta = root / 'snapshots' / 'vesta-parliament-4-6.sav'
        gaea = root / 'snapshots' / 'gaea-ur-city-4-2.sav'
        dion = root / 'snapshots' / 'dion-2-3.sav'
        if not first.exists() or not vesta.exists() or not gaea.exists() or not dion.exists():
            self.skipTest('Working-Authority RAM captures are Restricted Material')
        result = extract(
            first.read_bytes(),
            {},
            [
                hatari_memstate_ram(vesta.read_bytes()),
                hatari_memstate_ram(gaea.read_bytes()),
                hatari_memstate_ram(dion.read_bytes()),
            ],
        )
        parliament = next(i for i in result['instances'] if i['id'] == 'vesta-surface-64')
        assembly = next(m for m in result['models'] if m['id'] == parliament['model'])['variants'][0]['mesh']
        self.assertEqual(len(assembly['faces']), 117)
        self.assertTrue(any(i['id'] == 'gaea-ur-city-surface-24' for i in result['instances']))
        self.assertTrue(any(i['id'] == 'dion-surface-32' for i in result['instances']))

    def test_pinned_dion_memstate_places_cell_2_3_without_gaea_names(self):
        from damocleslab.catalogue import extract, hatari_memstate_ram
        root = Path(__file__).resolve().parents[1]
        first = root / 'work' / 'observe-first-world-20260818T101013Z-c5a32b7d' / 'observed.ram'
        sav = root / 'snapshots' / 'dion-2-3.sav'
        if not first.exists() or not sav.exists():
            self.skipTest('Working-Authority RAM captures are Restricted Material')
        workspace = hatari_memstate_ram(sav.read_bytes())
        self.assertEqual(workspace[0x7AA8:0x7AAA], b'\x00\x10')
        self.assertEqual(workspace[0x7B5C:0x7B5E], b'\x00\x32')
        first_bytes = first.read_bytes()
        result = extract(first_bytes, {}, workspace)
        current = next(i for i in result['instances'] if i['id'] == 'dion-surface-32')
        self.assertEqual(current['location']['body'], 'body-4')
        self.assertIsNone(current['location']['place'])
        self.assertEqual(current['name'], 'DION surface cell 2,3')
        self.assertFalse(any(
            i['id'].startswith('dion-') and i['location']['place']
            for i in result['instances']
        ))
        self.assertEqual(
            {0x35700 + int.from_bytes(first_bytes[0x35700 + s * 4:0x35704 + s * 4], 'big') for s in range(378)},
            {0x35700 + int.from_bytes(workspace[0x35700 + s * 4:0x35704 + s * 4], 'big') for s in range(378)},
        )


class ConditionedObjectFormTests(unittest.TestCase):
    """Source-conditioned object forms decoded from the $0535A2 header and $0538F4 group chain."""

    @staticmethod
    def _body(*extra_faces: str) -> bytes:
        body = struct.pack('>10h', 0, 0, 0, 10, 0, 0, 0, 10, 0, -32768)
        return body

    def test_view_conditioned_groups_become_separate_forms(self):
        from damocleslab.catalogue import decode_mesh, decode_object_forms

        data = struct.pack('>10h', 0, 0, 0, 10, 0, 0, 0, 10, 0, -32768)
        # Group: skip past a one-face list (6 bytes) plus its terminator (2).
        group_faces = bytes.fromhex('0543 04 08 0c 00 0000')
        data += struct.pack('>H6i', len(group_faces), -50, 100, -0x7FFFFF, 0xFFFFFF, -60, 120)
        data += group_faces
        data += bytes.fromhex('0000 0777 0c 08 04 00 0000')
        default = decode_mesh(data, 0, 'object')
        self.assertEqual([face['sourceColour'] for face in default['faces']], [0x777])
        self.assertEqual(default['viewGroups'], [{
            'bounds': [[-50, 50], [-0x7FFFFF, 0x800000], [-60, 60]], 'faces': 1, 'lines': 0,
        }])
        inside = decode_mesh(data, 0, 'object', state={'viewGroup': 0})
        self.assertEqual([face['sourceColour'] for face in inside['faces']], [0x543])
        variants, conditions, gaps = decode_object_forms(data, 0, None, None)
        self.assertEqual([v['id'] for v in variants], ['record', 'view-0'])
        self.assertEqual(variants[1]['name'], 'Viewer within -50 ≤ X < 50, any Y, -60 ≤ Z < 60')
        self.assertEqual(conditions, ['viewerPosition'])
        self.assertEqual(gaps, [])

    def test_view_group_skip_must_land_on_the_next_group(self):
        from damocleslab.catalogue import decode_mesh

        data = struct.pack('>10h', 0, 0, 0, 10, 0, 0, 0, 10, 0, -32768)
        data += struct.pack('>H6i', 20, 0, 1, 0, 1, 0, 1)
        data += bytes.fromhex('0543 04 08 0c 00 0000' + '00' * 20)
        with self.assertRaisesRegex(ValueError, 'skip does not match'):
            decode_mesh(data, 0, 'object')

    def test_target_marker_word_terminates_a_face_list(self):
        from damocleslab.catalogue import decode_mesh

        data = struct.pack('>10h', 0, 0, 0, 10, 0, 0, 0, 10, 0, -32768)
        data += bytes.fromhex('0000 0777 04 08 0c 00 7000')
        mesh = decode_mesh(data, 0, 'object')
        self.assertEqual(len(mesh['faces']), 1)
        self.assertEqual(mesh['sourceEnd'], len(data))

    def test_beacon_header_patches_lit_and_dark_colours(self):
        from damocleslab.catalogue import decode_object_forms

        # $8003: unconditional $8000 patch at +$0E from the post-header
        # position, flash patch at +$16, list end, then a zero jump.
        # The unconditional patch is relative to the position after its own
        # offset word (+6); the flash patch to the position after its word (+8).
        header = bytes.fromhex('8003 8000 001c 0020 0000 0002')
        body = struct.pack('>10h', 0, 0, 0, 10, 0, 0, 0, 10, 0, -32768)
        faces = bytes.fromhex('0000 0111 04 08 0c 00 0222 0c 08 04 00 0000')
        data = header + body + faces
        variants, conditions, gaps = decode_object_forms(data, 0, None, [0x000] * 16)
        self.assertEqual([v['id'] for v in variants], ['record', 'flash-dark'])
        lit = [face['sourceColour'] for face in variants[0]['mesh']['faces']]
        dark = [face['sourceColour'] for face in variants[1]['mesh']['faces']]
        self.assertEqual(lit, [0x8000, 0x777])
        self.assertEqual(dark, [0x8000, 0x8000])
        self.assertEqual(conditions, ['flashTimer'])
        self.assertEqual(gaps, [])

    def test_beacon_gate_colour_names_its_state_word(self):
        from damocleslab.catalogue import decode_object_forms

        header = bytes.fromhex('8003 0246 001c 0000 0002')
        body = struct.pack('>10h', 0, 0, 0, 10, 0, 0, 0, 10, 0, -32768)
        data = header + body + bytes.fromhex('0000 0111 04 08 0c 00 0000')
        _, conditions, _ = decode_object_forms(data, 0, None, None)
        self.assertEqual(conditions, ['flashTimer gated by $707E'])

    def test_television_header_cycles_the_source_colour_table(self):
        from damocleslab.catalogue import decode_object_forms

        header = bytes.fromhex('8006 0018')
        body = struct.pack('>10h', 0, 0, 0, 10, 0, 0, 0, 10, 0, -32768)
        data = bytearray((header + body + bytes.fromhex('0000 0111 04 08 0c 00 0000')).ljust(0x53440, b'\0'))
        data[0x53432:0x5343e] = bytes.fromhex('8000 0321 0432 0543 0654 0777')
        variants, conditions, _ = decode_object_forms(bytes(data), 0, None, [0x000] * 16)
        self.assertEqual([v['id'] for v in variants], ['record'] + [f'frame-{n}' for n in range(1, 6)])
        self.assertEqual(
            [v['mesh']['faces'][0]['sourceColour'] for v in variants],
            [0x8000, 0x321, 0x432, 0x543, 0x654, 0x777],
        )
        self.assertEqual(conditions, ['colourCycle $53432'])

    def test_safe_header_offers_the_7a60_jump_as_a_second_form(self):
        from damocleslab.catalogue import decode_object_forms

        closed = struct.pack('>10h', 0, 0, 0, 10, 0, 0, 0, 10, 0, -32768) + bytes.fromhex('0000 0111 04 08 0c 00 0000')
        header = struct.pack('>Hh', 0x8009, 2 + len(closed))
        opened = struct.pack('>10h', 0, 0, 0, 20, 0, 0, 0, 20, 0, -32768) + bytes.fromhex('0000 0222 04 08 0c 00 0000')
        variants, conditions, _ = decode_object_forms(header + closed + opened, 0, None, None)
        self.assertEqual([v['id'] for v in variants], ['record', 'open'])
        self.assertEqual(variants[1]['mesh']['vertices'][1], [20, 0, 0])
        self.assertEqual(conditions, ['state $7A60'])

    def test_particle_header_is_a_procedural_record(self):
        from damocleslab.catalogue import decode_mesh

        with self.assertRaisesRegex(ValueError, r'^procedural: \$8004'):
            decode_mesh(bytes.fromhex('8004 0001 2500'), 0, 'object')

    def test_articulated_object_samples_its_rotation(self):
        from damocleslab.catalogue import decode_object_forms

        header = bytes.fromhex('8001 00ff') + struct.pack('>3h', 0, 25, 28)
        # A negative Y tags a rotating vertex; its complement is the rest height.
        body = struct.pack('>10h', 0, -30, 0, 10, 0, 0, 0, 10, 0, -32768)
        record = header + body + bytes.fromhex('0000 0111 04 08 0c 00 0000')
        data = bytearray(bytes(record).ljust(0x92_5a + 0x280, b'\0'))
        for index in range(320):
            struct.pack_into(
                '>h', data, 0x92_5a + index * 2,
                max(-32768, min(32767, round(32768 * math.sin(2 * math.pi * index / 256)))),
            )
        data = bytes(data)
        variants, conditions, gaps = decode_object_forms(data, 0, None, None)
        self.assertEqual(variants[0]['mesh']['vertices'][0], [0, 29, 0])
        self.assertEqual(variants[0]['mesh']['articulation'], {'axis': 0, 'pivot': [0, 25, 28], 'angle': '$7888', 'vertices': [0]})
        self.assertEqual(conditions, ['articulation angle ($7888)'])
        self.assertEqual(gaps, [])
        self.assertEqual(
            [form['id'] for form in variants],
            ['record', 'angle-20', 'angle-40', 'angle-60',
             'angle-80', 'angle-a0', 'angle-c0', 'angle-e0'],
        )
        # Axis byte 0 turns the tagged vertex in the X/Z plane about the pivot;
        # a quarter turn moves it from the pivot's Z line onto its X line.
        # $053806 reads Z as the first of the pair and X as the second, so the
        # vertex lands on -X rather than +X. The native routine keeps only each
        # product's high word, which floors rather than rounds: the same 28
        # comes back as 26 turning one way and as -28 turning the other.
        quarter = next(form for form in variants if form['id'] == 'angle-40')
        self.assertEqual(quarter['mesh']['vertices'][0], [-28, 29, 28])
        self.assertEqual(quarter['mesh']['vertices'][1:], variants[0]['mesh']['vertices'][1:])

    def test_articulated_detail_reads_its_pivot_record_before_the_faces(self):
        from damocleslab.catalogue import decode_mesh

        data = struct.pack('>9h', 0, 0, 0, 10, 0, 0, 0, -10, 0)
        data += struct.pack('>5h', -32767, 1, -350, 1100, 200)
        data += bytes.fromhex('0777 04 08 0c 00 0000')
        mesh = decode_mesh(data, 0, 'interior')
        self.assertEqual(mesh['vertices'][2], [0, 9, 0])
        self.assertEqual(mesh['articulation'], {'axis': 1, 'pivot': [-350, 1100, 200], 'angle': '$7888', 'vertices': [2]})
        self.assertEqual(len(mesh['faces']), 1)

    def _text_world(self, flags: int, text: bytes) -> bytes:
        body = struct.pack('>10h', 0, 0, 0, 10, 0, 0, 0, 10, 0, -32768)
        record = body + bytes.fromhex('0000 0777 04 08 0c 00 6000')
        record += struct.pack('>3hHhbbH', 6, 32, 4, flags, 16, 2, 2, 0x0777) + text
        record += bytes.fromhex('0543 0c 08 04 00 0000')
        data = bytearray(record.ljust(0x31910, b'\0'))
        struct.pack_into('>h', data, 0x31700 + (ord('A') - 32) * 2, 0x200)
        struct.pack_into('>h', data, 0x31700 + (ord('B') - 32) * 2, 0x200)
        data[0x31900:0x31908] = bytes.fromhex('0000 0202 81 0408 00')
        return bytes(data)

    def test_object_text_places_glyph_strokes_in_the_selected_plane(self):
        from damocleslab.catalogue import decode_mesh

        for flags, expected in (
            (0x8000, [[6, 32, 4], [10, 36, 4]]),
            (0x8080, [[6, 32, 4], [6, 36, 8]]),
            (0x8040, [[6, 32, 4], [10, 32, 8]]),
            (0x80C0, [[6, 32, 4], [10, 32, 8]]),
        ):
            mesh = decode_mesh(self._text_world(flags, b'A\0'), 0, 'object')
            self.assertEqual(mesh['vertices'][3:5], expected, hex(flags))
            self.assertEqual(len(mesh['faces']), 2)
            self.assertEqual([line['vertices'] for line in mesh['lines']], [[3, 4]])
            self.assertEqual(mesh['texts'][0]['text'], 'A')

    def test_object_text_with_two_characters_advances_by_the_record_advance(self):
        from damocleslab.catalogue import decode_mesh

        mesh = decode_mesh(self._text_world(0x8000, b'AB\0'), 0, 'object')
        self.assertEqual(mesh['vertices'][5], [22, 32, 4])

    def test_object_text_live_token_is_a_named_gap_not_capture_state(self):
        from damocleslab.catalogue import decode_mesh, decode_object_forms

        data = self._text_world(0x8001, bytes.fromhex('8700'))
        mesh = decode_mesh(data, 0, 'object')
        self.assertEqual(mesh['texts'][0], {'anchor': [6, 32, 4], 'text': '', 'font': 1, 'plane': 0, 'liveToken': 7})
        self.assertEqual(len(mesh['faces']), 2)
        self.assertEqual(mesh['lines'], [])
        _, _, gaps = decode_object_forms(data, 0, None, None)
        self.assertIn('Object text token $87 reads the live $CCA0 workspace', gaps[0])

    def test_object_text_indirect_pointer_and_state_font_fail_closed(self):
        from damocleslab.catalogue import decode_mesh

        with self.assertRaisesRegex(ValueError, 'indirect object vector text'):
            decode_mesh(self._text_world(0x0000, b'A\0'), 0, 'object')
        with self.assertRaisesRegex(ValueError, 'state-conditioned object text font'):
            decode_mesh(self._text_world(0x8004, b'A\0'), 0, 'object')

    def test_extract_classifies_procedural_and_conditioned_records(self):
        from damocleslab.catalogue import extract

        data = _empty_world()
        struct.pack_into('>I', data, 0x35700 + 4, 0x36000 - 0x35700)
        data[0x36000:0x36006] = bytes.fromhex('8004 0001 2500')
        struct.pack_into('>I', data, 0x35700 + 8, 0x36100 - 0x35700)
        closed = struct.pack('>10h', 0, 0, 0, 10, 0, 0, 0, 10, 0, -32768) + bytes.fromhex('0000 0111 04 08 0c 00 0000')
        opened = struct.pack('>10h', 0, 0, 0, 20, 0, 0, 0, 20, 0, -32768) + bytes.fromhex('0000 0222 04 08 0c 00 0000')
        header = struct.pack('>Hh', 0x8009, 2 + len(closed))
        record = header + closed + opened
        data[0x36100:0x36100 + len(record)] = record
        result = extract(bytes(data), {})
        by_id = {model['id']: model for model in result['models']}
        particle = by_id['object-036000']
        self.assertEqual((particle['status'], particle['recordClass'], particle['variants']), ('decoded', 'procedural', []))
        safe = by_id['object-036100']
        self.assertEqual(safe['status'], 'decoded')
        self.assertEqual(safe['conditions'], ['state $7A60'])
        self.assertEqual([v['id'] for v in safe['variants']], ['record', 'open'])
        classes = result['coverage']['classifications']
        self.assertEqual(classes['procedural'], 1)
        self.assertEqual(classes['conditionalForms'], 1)
        self.assertEqual(classes['stateForms'], 1)


class SurfacePrimitiveTests(unittest.TestCase):
    """Third wall height and post-plan record lengths established at $059D6C..$05A24E."""

    @staticmethod
    def _surface(plan: list[tuple[int, int]], walls: bytes, post: bytes = b'\0\0') -> bytearray:
        record = struct.pack('>2h', 250, 150) + bytes.fromhex('0777 0777')
        for x, z in plan:
            record += struct.pack('>2h', x, z)
        record += struct.pack('>h', 0) + walls + b'\0\0' + post
        data = bytearray(0x40000)
        data[0x1000:0x1000 + len(record)] = record
        data[0x1000 - 8:0x1000] = bytes.fromhex('0101 0000 0000 0000')
        struct.pack_into('>h', data, 0x7B2A, 48)
        return data

    def test_third_wall_height_comes_from_the_workspace_word(self):
        from damocleslab.catalogue import third_wall_height

        data = bytearray(0x10000)
        struct.pack_into('>h', data, 0x7B2A, 48)
        self.assertEqual(third_wall_height(bytes(data)), 48)

    def test_type_two_is_a_wall_from_the_ground_to_the_third_height(self):
        from damocleslab.catalogue import decode_structure

        data = self._surface([(5, 0), (15, 0)], bytes.fromhex('0102 2777'))
        mesh, gaps = decode_structure(bytes(data), 0x1000, None, None, (1, 1), 48)
        self.assertEqual(gaps, [])
        self.assertEqual(len(mesh['faces']), 1)
        # $05AD52 swaps the two plan references before building the quad.
        self.assertEqual(mesh['vertices'], [[5, 48, 0], [15, 48, 0], [15, 0, 0], [5, 0, 0]])

    def test_type_three_is_a_flat_quad_at_the_third_height(self):
        from damocleslab.catalogue import decode_structure

        data = self._surface(
            [(5, 5), (15, 5), (15, 15), (5, 15)], bytes.fromhex('0102 3777 0304')
        )
        mesh, gaps = decode_structure(bytes(data), 0x1000, None, None, (1, 1), 48)
        self.assertEqual(gaps, [])
        self.assertEqual([point[1] for point in mesh['vertices']], [48] * 4)

    def test_an_unbound_third_height_still_names_the_gap(self):
        from damocleslab.catalogue import decode_structure

        data = self._surface([(5, 0), (15, 0)], bytes.fromhex('0102 2777 0102 0777'))
        mesh, gaps = decode_structure(bytes(data), 0x1000, None, None, (1, 1), None)
        self.assertEqual(gaps, ['Surface primitive type 2 needs additional height/shape decoding.'])
        self.assertEqual(len(mesh['faces']), 1)

    def _selection_world(self, control: int, colours: str) -> bytearray:
        # One wall, one entrance attachment, one region naming its slot.
        post = struct.pack('>H', control)
        post += struct.pack('>4h', 10, 10, 40, 40) + bytes.fromhex(colours)
        post += struct.pack('>4h', 0, 100, 0, 100)
        post += struct.pack('>H', 0) + struct.pack('>H', 0x3FC)
        post += struct.pack('>4h', -100, 100, -100, 100)
        post += bytes.fromhex('01 FF 00 00')
        return self._surface(
            [(5, 5), (60, 5), (60, 60), (5, 60)], bytes.fromhex('0102 0777'), post
        )

    def test_one_leaf_entrance_record_is_twenty_four_bytes(self):
        from damocleslab.catalogue import decode_structure, decode_structure_selection

        data = self._selection_world(0x4000, '0777 0666 0555')
        mesh, _ = decode_structure(bytes(data), 0x1000, None, None, (1, 1), 48)
        selection = decode_structure_selection(bytes(data), mesh, (1, 1), [0] * 16, [0] * 16)
        self.assertEqual(len(selection['attachments']), 1)
        attachment = selection['attachments'][0]
        self.assertEqual(attachment['constructor']['leafCount'], 1)
        self.assertEqual(attachment['proximityBox'], {'x': [0, 100], 'z': [0, 100]})
        self.assertEqual(
            [entry['kind'] for entry in selection['regions'][0]['queue']],
            ['face', 'attachment'],
        )

    def test_two_leaf_entrance_record_reads_its_extra_slot_colour(self):
        from damocleslab.catalogue import decode_structure, decode_structure_selection

        data = self._selection_world(0x4200, '0777 0666 0555 0444')
        mesh, _ = decode_structure(bytes(data), 0x1000, None, None, (1, 1), 48)
        selection = decode_structure_selection(bytes(data), mesh, (1, 1), [0] * 16, [0] * 16)
        self.assertEqual(selection['attachments'][0]['constructor']['leafCount'], 2)
        self.assertEqual(selection['attachments'][0]['proximityBox'], {'x': [0, 100], 'z': [0, 100]})

    def test_region_reference_resolves_slots_below_the_last_byte(self):
        from damocleslab.catalogue import resolve_region_reference

        slots = {0x3FC: {}, 0x3F8: {}, 0x3F4: {}, 0x3F0: {}, 0x3EC: {}}
        self.assertEqual(
            resolve_region_reference(251, 63, slots, []),
            {'kind': 'attachment', 'slot': 0x3EC},
        )
        self.assertEqual(
            resolve_region_reference(10, 63, slots, []), {'kind': 'face', 'index': 9}
        )

    def test_region_reference_resolves_faces_an_attachment_appends(self):
        from damocleslab.catalogue import resolve_region_reference

        faces = [(0x3FC, 21, 6), (0x3F8, 27, 3)]
        self.assertEqual(
            resolve_region_reference(22, 21, {0x3FC: {}, 0x3F8: {}}, faces),
            {'kind': 'attachmentFace', 'slot': 0x3FC, 'index': 0},
        )
        self.assertEqual(
            resolve_region_reference(28, 21, {0x3FC: {}, 0x3F8: {}}, faces),
            {'kind': 'attachmentFace', 'slot': 0x3F8, 'index': 0},
        )
        with self.assertRaisesRegex(ValueError, 'selection reference outside geometry'):
            resolve_region_reference(31, 21, {0x3FC: {}, 0x3F8: {}}, faces)

    def test_every_pinned_capture_agrees_on_the_third_wall_height(self):
        from damocleslab.catalogue import hatari_memstate_ram, third_wall_height

        root = Path(__file__).resolve().parents[1]
        paths = sorted(root.glob('work/observe-first-world-*/observed.ram'))
        paths += sorted(root.glob('snapshots/*.sav'))
        seen = {}
        for path in paths:
            blob = path.read_bytes()
            ram = blob if len(blob) == 1048576 else hatari_memstate_ram(blob)
            seen[path.name] = third_wall_height(ram)
        if not seen:
            self.skipTest('no pinned captures in this checkout')
        self.assertEqual(set(seen.values()), {48}, seen)


class FloorLabelTests(unittest.TestCase):
    """Structure wall text ($059EB6) and the Floor Label it draws through $CD04 (#473)."""

    @staticmethod
    def _world(text: bytes, token_target: int = 0xCD04) -> bytearray:
        # One wall, one wall-text record on queue byte 1, one region queueing it.
        post = struct.pack('>H', 0x0006) + bytes([0x82, 1])
        post += struct.pack('>4h', 0, -610, 70, -60) + struct.pack('>bbH', -4, 4, 0x0777)
        post += text + b'\0' * (2 - len(text) % 2)
        post += b'\0\0'
        post += struct.pack('>H', 0x2001) + struct.pack('>4h', -100, 100, -100, 100)
        post += bytes.fromhex('01 00')
        data = SurfacePrimitiveTests._surface(
            [(5, 5), (60, 5), (60, 60), (5, 60)], bytes.fromhex('0102 0777'), post
        )
        struct.pack_into('>I', data, 0xCCA0, token_target)
        return data

    def _selection(self, data: bytearray) -> dict:
        from damocleslab.catalogue import decode_structure, decode_structure_selection

        mesh, _ = decode_structure(bytes(data), 0x1000, None, None, (1, 1), 48)
        return decode_structure_selection(bytes(data), mesh, (1, 1), [0] * 16, [0] * 16)

    def test_a_token_reaching_cd04_is_published_as_a_floor_label(self):
        selection = self._selection(self._world(b'\x80'))
        self.assertEqual(selection['floorLabels'], [{
            'face': {'kind': 'face', 'index': 0},
            'anchor': [-610, 70, -60],
            'plane': 0x80,
            'font': 2,
            'scale': [-4, 4],
            'colour': '#eeeeee',
            'sourceColour': 0x0777,
        }])
        self.assertEqual(selection['wallTextGaps'], [])
        self.assertEqual([entry['kind'] for entry in selection['regions'][0]['queue']], ['face'])

    def test_other_wall_text_is_named_rather_than_drawn(self):
        literal = self._selection(self._world(b'EXIT'))
        self.assertNotIn('floorLabels', literal)
        self.assertEqual(
            literal['wallTextGaps'], ['Wall text "EXIT" on queue byte 1 ($059EB6) is not drawn.']
        )
        elsewhere = self._selection(self._world(b'\x80', token_target=0xCD37))
        self.assertNotIn('floorLabels', elsewhere)
        self.assertIn('"<$80>"', elsewhere['wallTextGaps'][0])

    def test_the_placement_follows_the_builder_under_a_placement_scale(self):
        from damocleslab.catalogue import wall_text_placement

        # Both records reproduce the live $C8C0 table of their capture byte for
        # byte (floor-label-probe.py decode): Tolosa slot 136 at scale 3 x 3,
        # whose offset's low bit multiplies the rest by the scale along Z, and
        # Atropos slot 141 at -4 x -3, whose negative X scale mirrors the glyphs.
        tolosa = wall_text_placement({
            'command': 8, 'flags': 0x81, 'offset': -139, 'position': [-600, 90, 0],
            'scale': [-3, 4],
        }, (3, 3))
        self.assertEqual(tolosa, {'anchor': [-1800, 90, 210], 'plane': 0x80,
                                  'scale': [-3, 4], 'advance': -24})
        atropos = wall_text_placement({
            'command': 6, 'flags': 0x82, 'offset': 0, 'position': [110, 90, 165],
            'scale': [4, 4],
        }, (-4, -3))
        self.assertEqual(atropos, {'anchor': [-440, 90, -495], 'plane': 0x80,
                                   'scale': [-4, 4], 'advance': -24})

    def test_the_payload_publishes_the_state_office_lift_labels(self):
        root = Path(__file__).resolve().parents[3]
        document = read_catalogue(root / 'payload' / 'damocles' / 'catalogue.json')
        models = {model['id']: model for model in document['models']}
        glyphs = document['floorLabelGlyphs']
        self.assertEqual(sorted(glyphs), ['1', '2'])
        for font in glyphs.values():
            self.assertEqual(sorted(font), sorted('G123456789B'))
        # The State Office's Floors 0, 1/2 and 10 bind slots 76, 78 and 79; each
        # has the same two labels, one beside each lift car's doorway.
        for identity in ('structure-014aec', 'structure-014f52', 'structure-01532a'):
            labels = models[identity]['structureSelection']['floorLabels']
            self.assertEqual(
                [(label['anchor'], label['face']['index']) for label in labels
                 if label['anchor'][0] == -610],
                [([-610, 70, -260], 14), ([-610, 70, -60], 25)], identity,
            )
        labelled = [model for model in models.values()
                    if (model.get('structureSelection') or {}).get('floorLabels')]
        for model in labelled:
            for label in model['structureSelection']['floorLabels']:
                self.assertIn(str(label['font']), glyphs, model['id'])
                self.assertIn(label['plane'], (0, 0x80), model['id'])


class DetailSelectionTests(unittest.TestCase):
    """Detail selector bytes name source records, tabulated at $053BAE."""

    @staticmethod
    def _detail(records: bytes, groups: bytes) -> bytes:
        body = struct.pack('>10h', 0, 0, 0, 10, 0, 0, 0, 10, 0, -32768)
        return body + records + b'\0\0' + groups

    def test_records_are_numbered_across_faces_lines_and_text(self):
        from damocleslab.catalogue import decode_mesh

        # A face, a line, a filled-glyph text record, then another face.
        text = bytes.fromhex('6000 0000 0000 0000 0000 8000 0010 0202 0777') + b'A\0'
        records = bytes.fromhex('0777 04 08 0c 00') + bytes.fromhex('4543 04 08')
        records += text + bytes.fromhex('0111 0c 08 04 00')
        data = bytearray(self._detail(records, b'\0\0').ljust(0x31910, b'\0'))
        struct.pack_into('>h', data, 0x31700 + (ord('A') - 32) * 2, 0x200)
        data[0x31900:0x31909] = bytes.fromhex('0000 0202 80 040800 00')
        mesh = decode_mesh(bytes(data), 0, 'interior', hardware=[0] * 16)
        self.assertEqual(mesh['recordCount'], 4)
        self.assertEqual([face['sourceIndex'] for face in mesh['faces']], [0, 2, 3])
        self.assertEqual([line['sourceIndex'] for line in mesh['lines']], [1])

    def test_a_record_that_draws_nothing_still_occupies_a_slot(self):
        from damocleslab.catalogue import decode_mesh

        # A $60xx record whose text is empty contributes no primitive but is
        # still tabulated, so the records after it keep their own ordinals.
        text = bytes.fromhex('6000 0000 0000 0000 0000 8000 0010 0202 0777') + b'\0'
        records = bytes.fromhex('0777 04 08 0c 00') + text + bytes.fromhex('0111 0c 08 04 00')
        data = bytes(self._detail(records, b'\0\0').ljust(0x31910, b'\0'))
        mesh = decode_mesh(data, 0, 'interior', hardware=[0] * 16)
        self.assertEqual(mesh['recordCount'], 3)
        self.assertEqual([face['sourceIndex'] for face in mesh['faces']], [0, 2])

    def test_selection_groups_name_records_not_drawn_polygons(self):
        from damocleslab.catalogue import decode_detail_selection

        groups = bytes.fromhex('0000 0100 0000 0200')
        self.assertEqual(
            decode_detail_selection(b'\xff\x00' + groups, 1, 2),
            [{'boxes': [], 'default': [0]}, {'boxes': [], 'default': [1]}],
        )
        with self.assertRaisesRegex(ValueError, 'selection reference outside geometry'):
            decode_detail_selection(b'\xff\x00' + bytes.fromhex('0000 0300 0000 0000'), 1, 2)

    def test_every_building_detail_selector_decodes_in_the_pinned_capture(self):
        from damocleslab.catalogue import (
            check_unreferenced, decode_detail_selection, decode_mesh, palette_at, u32,
        )

        root = Path(__file__).resolve().parents[1]
        runs = sorted(root.glob('work/observe-first-world-*/observed.ram'))
        if not runs:
            self.skipTest('no pinned first-world capture in this checkout')
        data = runs[0].read_bytes()
        hardware = list(struct.unpack_from('>16H', data, 0x6fd00))
        decoded = 0
        seen = set()
        for slot in range(130):
            address = 0x26000 + u32(data, 0x26000 + slot * 4)
            if address in seen:
                continue
            seen.add(address)
            try:
                mesh = decode_mesh(data, address, 'interior', palette_at(data, 0), hardware)
            except ValueError:
                continue
            groups = decode_detail_selection(
                data, mesh['sourceEnd'], mesh['recordCount']
            )
            check_unreferenced(mesh, groups)
            decoded += 1
        self.assertEqual(decoded, 59)


class GroundLetteringTests(unittest.TestCase):
    """Ground $6000 records consumed at $053F76 share the object text tail."""

    def test_position_words_are_cell_local_and_glyphs_lie_flat(self):
        from damocleslab.catalogue import decode_ground

        # Header, one plan point, a $6000 record with plane bit 6 set, then the
        # stream terminator. Font 0 glyph 'A' is a stroke pair.
        record = bytes.fromhex('00ff 84b0 80c8 0000')
        record += bytes.fromhex('6000') + struct.pack(
            '>3hHhbbH', 0x7D44, 0, 0x8096 - 0x10000, 0x8040, 16, 2, 2, 0x0777
        ) + b'A\0'
        record += bytes.fromhex('0000')
        data = bytearray(bytes(record).ljust(0x31910, b'\0'))
        struct.pack_into('>h', data, 0x31700 + (ord('A') - 32) * 2, 0x200)
        data[0x31900:0x31908] = bytes.fromhex('0000 0202 81 0408 00')
        mesh, gaps, transform, _ = decode_ground(bytes(data), 0, 0, hardware=[0] * 16)
        self.assertEqual(gaps, [])
        self.assertEqual(transform, 0)
        self.assertEqual(mesh['texts'], [
            {'anchor': [-700, 0, 150], 'font': 0, 'plane': 0x40, 'text': 'A'},
        ])
        # Plane bit 6 lays the glyph flat: the vertical axis runs along Z. The
        # plan vertex is absent because no polygon in this record uses it.
        self.assertEqual(mesh['vertices'], [[-700, 0, 150], [-696, 0, 154]])
        self.assertEqual(len(mesh['lines']), 1)

    def test_a_rotated_cell_keeps_the_text_as_a_named_gap(self):
        from damocleslab.catalogue import decode_ground

        record = bytes.fromhex('00ff 84b0 80c8 0000')
        record += bytes.fromhex('6000') + struct.pack(
            '>3hHhbbH', 0, 0, 0, 0x8040, 16, 2, 2, 0x0777
        ) + b'A\0' + bytes.fromhex('0000')
        # Orientation 1 selects a transform that swaps or negates the plan, and
        # the text record is copied into the frame stream untransformed.
        _, gaps, transform, _ = decode_ground(bytes(record), 0, 1, hardware=[0] * 16)
        self.assertNotEqual(transform, 0)
        self.assertTrue(any('untransformed' in gap for gap in gaps))


class SlotLabelTests(unittest.TestCase):
    """$8007 and $8002 derive one label character from the object's slot."""

    def test_the_header_rules_give_letters_and_digits(self):
        from damocleslab.catalogue import slot_label

        self.assertEqual(slot_label(0x8007, 30), 'A')
        self.assertEqual(slot_label(0x8007, 39), 'J')
        self.assertEqual(slot_label(0x8002, 64), '0')
        self.assertEqual(slot_label(0x8002, 73), '9')
        self.assertIsNone(slot_label(0x8007, None))
        self.assertIsNone(slot_label(0x800B, 30))

    def test_a_slot_resolves_token_87_instead_of_failing_closed(self):
        from damocleslab.catalogue import decode_mesh

        # $8007 header, a body, then a $6000 record whose text is token $87.
        record = bytes.fromhex('8007')
        record += struct.pack('>10h', 0, 0, 0, 10, 0, 0, 0, 10, 0, -32768)
        record += bytes.fromhex('0000 0777 04 08 0c 00 6000')
        record += struct.pack('>3hHhbbH', 0, 0, 0, 0x8000, 16, 2, 2, 0x0777)
        record += bytes.fromhex('8700 0000')
        data = bytearray(bytes(record).ljust(0x31910, b'\0'))
        struct.pack_into('>I', data, 0xCCA0 + 7 * 4, 0xCD12)
        struct.pack_into('>h', data, 0x31700 + (ord('C') - 32) * 2, 0x200)
        data[0x31900:0x31908] = bytes.fromhex('0000 0202 81 0408 00')

        # Without a slot the token stays live and draws nothing.
        blind = decode_mesh(bytes(data), 0, 'object', hardware=[0] * 16)
        self.assertEqual(blind['texts'][0]['liveToken'], 7)
        self.assertEqual(blind['lines'], [])

        # With one, the header's own character is drawn.
        placed = decode_mesh(bytes(data), 0, 'object', hardware=[0] * 16, state={'slot': 32})
        self.assertEqual(placed['texts'][0]['text'], 'C')
        self.assertNotIn('liveToken', placed['texts'][0])
        self.assertEqual(len(placed['lines']), 1)
        self.assertEqual(placed['alternates']['slotLabel'], 'letter')

    def test_a_token_the_header_does_not_write_stays_live(self):
        from damocleslab.catalogue import decode_mesh

        record = bytes.fromhex('8007')
        record += struct.pack('>10h', 0, 0, 0, 10, 0, 0, 0, 10, 0, -32768)
        record += bytes.fromhex('0000 0777 04 08 0c 00 6000')
        record += struct.pack('>3hHhbbH', 0, 0, 0, 0x8000, 16, 2, 2, 0x0777)
        record += bytes.fromhex('8700 0000')
        data = bytearray(bytes(record).ljust(0x31910, b'\0'))
        # Token $87 points somewhere this header never writes, and which is
        # neither a frame animation nor the explosive readout.
        struct.pack_into('>I', data, 0xCCA0 + 7 * 4, 0xCE00)
        mesh = decode_mesh(bytes(data), 0, 'object', hardware=[0] * 16, state={'slot': 32})
        self.assertEqual(mesh['texts'][0]['liveToken'], 7)

    def test_every_key_and_transporter_slot_draws_its_own_label(self):
        from damocleslab.catalogue import decode_mesh, palette_at, u32

        root = Path(__file__).resolve().parents[1]
        runs = sorted(root.glob('work/observe-first-world-*/observed.ram'))
        if not runs:
            self.skipTest('no pinned first-world capture in this checkout')
        data = runs[0].read_bytes()
        hardware = list(struct.unpack_from('>16H', data, 0x6fd00))
        for base, slots, expected in (
            (0x36D64, range(30, 40), 'ABCDEFGHIJ'),
            (0x38820, range(64, 74), '0123456789'),
        ):
            labels = []
            for slot in slots:
                mesh = decode_mesh(data, base, 'object', None, hardware, state={'slot': slot})
                labels.append(mesh['texts'][0]['text'])
            self.assertEqual(''.join(labels), expected)
        _ = palette_at, u32


class SceneColourTemplateTests(unittest.TestCase):
    """Objects whose faces name the scene colour table carry no palette.

    They are `$7000` ground templates, so the placing cell's surface record is
    the only evidence their colours have. Showing every such record through
    palette 0 read as a decode, when it was an unbound default.
    """

    SCENE_COLOUR_OBJECTS = {
        'object-04190e': 333,
        'object-041992': 334,
        'object-041a16': 335,
        'object-041a9a': 336,
        'object-041b1e': 337,
        'object-041b8a': 338,
    }

    def payload(self):
        root = Path(__file__).resolve().parents[3]
        return read_catalogue((root / 'payload' / 'damocles' / 'catalogue.json'))

    def test_only_these_six_records_name_the_scene_colour_table(self):
        document = self.payload()
        carrying = {
            model['id']
            for model in document['models']
            for variant in model['variants']
            for face in variant['mesh']['faces'] + variant['mesh']['lines']
            if model['kind'] == 'object'
            and face['sourceColour'] & 0x8000
            and face['sourceColour'] & 0x80
        }
        self.assertEqual(carrying, set(self.SCENE_COLOUR_OBJECTS))

    def test_a_placed_template_carries_one_variant_per_evidenced_palette(self):
        document = self.payload()
        models = {model['id']: model for model in document['models']}
        expected = {
            'object-04190e': ['palette-1'],
            'object-041992': ['palette-1'],
            'object-041a16': ['palette-1'],
            'object-041a9a': ['palette-1'],
            # Image-derived road cells on BARE ISLAND and KEY WEST place it too (#460).
            'object-041b1e': ['palette-1', 'palette-2', 'palette-43', 'palette-51',
                              'palette-62', 'palette-94'],
        }
        for identity, variant_ids in expected.items():
            model = models[identity]
            self.assertEqual([v['id'] for v in model['variants']], variant_ids)
            self.assertEqual(model['status'], 'decoded')
            self.assertNotIn('paletteBinding', model['omissions'])
            # Every evidenced palette names the placements that bind it.
            self.assertEqual(
                len([e for e in model['evidence'] if 'ground placement' in e['claim']]),
                len(variant_ids),
            )
            for variant in model['variants']:
                for face in variant['mesh']['faces'] + variant['mesh']['lines']:
                    self.assertRegex(face['colour'], r'^#[0-9a-f]{6}$')

    def test_the_last_unplaced_template_is_placed_by_the_new_workspaces(self):
        # The gap this test used to pin named its own next probe -- "a surface
        # workspace capture on a further body". #172 ran it, and the template is
        # placed through six evidenced palettes. No template now names the gap.
        document = self.payload()
        model = next(m for m in document['models'] if m['id'] == 'object-041b8a')
        self.assertEqual(model['status'], 'decoded')
        self.assertEqual(model['omissions'], [])
        self.assertEqual(
            [variant['id'] for variant in model['variants']],
            ['palette-76', 'palette-107', 'palette-113',
             'palette-130', 'palette-131', 'palette-132'],
        )
        self.assertEqual(
            document['coverage']['classifications'].get('paletteBinding', 0), 0
        )

    def test_a_template_palette_is_recorded_per_placing_cell(self):
        from damocleslab.catalogue import record_template_palettes

        bindings: dict = {}
        record_template_palettes(bindings, ['object-041b1e'], 62, 'first-world', 0x33)
        record_template_palettes(bindings, ['object-041b1e'], 2, 'DION', 0x23)
        # A cell whose surface slot resolves to no model binds nothing, rather
        # than defaulting the template to palette 0.
        record_template_palettes(bindings, ['object-041b1e'], None, 'DION', 0x24)
        self.assertEqual(
            bindings,
            {'object-041b1e': {62: ['first-world cell $33'], 2: ['DION cell $23']}},
        )


class BankExtentTests(unittest.TestCase):
    """A bank extent is measured from the capture, not asserted."""

    def payload(self):
        root = Path(__file__).resolve().parents[3]
        return read_catalogue((root / 'payload' / 'damocles' / 'catalogue.json'))

    def test_each_pointer_bank_reports_measured_bounds(self):
        document = self.payload()
        extents = {
            table['kind']: table['extent']
            for table in document['tables'] if 'extent' in table
        }
        self.assertEqual(sorted(extents), ['interior', 'object', 'structure'])
        # The entry count is bounded above: one more entry would land on the
        # first record's own preamble, which each bank names.
        self.assertEqual(extents['object']['tableEnd'], 0x035CE8)
        self.assertEqual(extents['object']['firstRecord'], 0x035CFC)
        self.assertEqual(extents['object']['preambleBytes'], 20)
        self.assertEqual(extents['object']['bankEnd'], 0x042BBE)
        self.assertEqual(extents['object']['followedAt'], 0x042C00)
        self.assertEqual(extents['structure']['tableEnd'], 0x00ED60)
        self.assertEqual(extents['structure']['preambleBytes'], 8)
        self.assertEqual(extents['structure']['followedAt'], 0x01E000)
        self.assertEqual(extents['interior']['tableEnd'], 0x026208)
        self.assertEqual(extents['interior']['preambleBytes'], 6)
        self.assertEqual(extents['interior']['followedAt'], 0x031700)
        for kind, extent in extents.items():
            self.assertGreater(extent['zeroFillBytes'], 0, kind)
            evidence = next(
                table['extentEvidence'] for table in document['tables']
                if table['kind'] == kind
            )
            self.assertNotIn('provisional', evidence)
            self.assertIn('bounded above', evidence)

    def test_a_bank_that_reaches_its_follower_has_outgrown_the_bound(self):
        from damocleslab.catalogue import bank_extent

        data = bytearray(0x100000)
        data[0x035CFC:0x035D00] = b'\x01\x02\x03\x04'
        data[0x042BFF] = 0x01
        with self.assertRaisesRegex(ValueError, 'runs into'):
            bank_extent(bytes(data), 'object', 0x35700, 378, [0x035CFC], [0x035D00])


class WorldConditionedSlotTests(unittest.TestCase):
    """The top object slots are a world binding, not a resident fact."""

    def ram(self, name):
        from damocleslab.catalogue import hatari_memstate_ram

        root = Path(__file__).resolve().parents[1]
        return hatari_memstate_ram((root / 'snapshots' / f'{name}.sav').read_bytes())

    def first_world(self):
        root = Path(__file__).resolve().parents[1]
        run = root / 'work' / 'observe-first-world-20260818T101013Z-c5a32b7d'
        if not (run / 'observed.ram').is_file():
            self.skipTest('first-world capture lives in the ignored research workspace')
        return (run / 'observed.ram').read_bytes()

    def test_live_worlds_repoint_only_the_evidenced_slot_window(self):
        from damocleslab.catalogue import (
            WORLD_CONDITIONED_OBJECT_SLOTS, object_slot_bindings,
        )

        data = self.first_world()
        seen = set()
        for name in ('vesta-parliament-4-6', 'gaea-ur-city-4-2', 'dion-2-3'):
            for binding in object_slot_bindings(data, self.ram(name)):
                self.assertIn(binding['slot'], WORLD_CONDITIONED_OBJECT_SLOTS)
                seen.add(binding['slot'])
        # Dion happens to agree with the first world, so the union is 250-255.
        self.assertEqual(sorted(seen), [250, 251, 252, 253, 254, 255])

    def test_a_slot_outside_the_window_is_a_load_to_examine(self):
        from damocleslab.catalogue import object_slot_bindings

        data = self.first_world()
        workspace = bytearray(data)
        struct.pack_into('>I', workspace, 0x35700 + 12 * 4,
                         struct.unpack_from('>I', data, 0x35700 + 13 * 4)[0])
        with self.assertRaisesRegex(ValueError, 'outside the world-conditioned window'):
            object_slot_bindings(data, bytes(workspace))

    def test_a_slot_pointed_at_an_unnamed_address_is_rejected(self):
        from damocleslab.catalogue import object_slot_bindings

        data = self.first_world()
        workspace = bytearray(data)
        struct.pack_into('>I', workspace, 0x35700 + 250 * 4, 0x12345)
        with self.assertRaisesRegex(ValueError, 'resident table does not name'):
            object_slot_bindings(data, bytes(workspace))

    def test_the_payload_qualifies_every_model_the_window_reaches(self):
        root = Path(__file__).resolve().parents[3]
        document = read_catalogue((root / 'payload' / 'damocles' / 'catalogue.json'))
        qualified = {
            model['id']: model for model in document['models']
            if model.get('worldConditionedSlots')
        }
        self.assertEqual(
            sorted(qualified), ['object-041e7c', 'object-041edc', 'object-041f9c']
        )
        for model in qualified.values():
            self.assertIn('differ', model['reason'])
            self.assertIn('pinned first-world capture', model['reason'])
        self.assertIn('GAEA holds it as', qualified['object-041e7c']['reason'])

    def test_no_captured_world_introduces_an_object_record(self):
        from damocleslab.catalogue import decode_object_forms

        data = self.first_world()
        hardware = list(struct.unpack_from('>16H', data, 0x6fd00))

        def census(image):
            records = {}
            for slot in range(378):
                address = 0x35700 + struct.unpack_from('>I', image, 0x35700 + slot * 4)[0]
                if address in records:
                    continue
                for palette in (None, 0):
                    try:
                        variants, _conditions, _gaps = decode_object_forms(
                            image, address, None if palette is None else
                            [0] * 16, hardware,
                        )
                    except (ValueError, struct.error):
                        continue
                    records[address] = json.dumps(
                        [variant['mesh'] for variant in variants], sort_keys=True
                    )
                    break
                else:
                    records[address] = 'undecoded'
            return records

        resident = census(data)
        snapshots = sorted((Path(__file__).resolve().parents[1] / 'snapshots').glob('*.sav'))
        self.assertGreaterEqual(len(snapshots), 19)
        for path in snapshots:
            live = census(self.ram(path.stem))
            self.assertEqual(set(live), set(resident), path.stem)
            self.assertEqual(live, resident, path.stem)


class ResidentBankIdentityTests(unittest.TestCase):
    """Every captured world shares the surface, detail and ground banks."""

    RANGES = {
        'surface table': (0x00E900, 0x00ED60),
        'surface bank': (0x00ED60, 0x01DEFB),
        'detail table': (0x026000, 0x026208),
        'detail bank': (0x026208, 0x0315DA),
        'ground records': (0x01E790, 0x024000),
        'glyph table': (0x031700, 0x031C00),
    }

    def captures(self):
        from damocleslab.catalogue import hatari_memstate_ram

        root = Path(__file__).resolve().parents[1]
        run = root / 'work' / 'observe-first-world-20260818T101013Z-c5a32b7d'
        if not (run / 'observed.ram').is_file():
            self.skipTest('captures live in the ignored research workspace')
        images = {'first-world': (run / 'observed.ram').read_bytes()}
        for path in sorted((root / 'snapshots').glob('*.sav')):
            images[path.stem] = hatari_memstate_ram(path.read_bytes())
        return images

    def test_the_shared_banks_are_byte_identical(self):
        images = self.captures()
        self.assertGreaterEqual(len(images), 9)
        base = images['first-world']
        for name, (start, end) in self.RANGES.items():
            for label, image in images.items():
                self.assertEqual(image[start:end], base[start:end], f'{name} / {label}')

    def test_the_object_bank_differs_only_where_the_census_does_not_read(self):
        images = self.captures()
        base = images['first-world']
        differing = {
            offset for image in images.values()
            for offset in range(0x035CE8, 0x042BBE)
            if image[offset] != base[offset]
        }
        # $03E415, $03E41B, $03E422 and $03E429 are the four beacon patch slots of
        # one record, at a seven-byte stride. Each holds either the $8000
        # unconditional patch sentinel or a live value, and which one holds the
        # live value varies by world: the pinned first-world capture has $0411 in
        # the first and the sentinel in the other three, while ACHERON and MENTOR
        # have the sentinel in the first and $0777 in the other three. The decoder
        # writes its own patch at each, so no live value reaches a mesh --
        # test_no_captured_world_introduces_an_object_record checks exactly that
        # across every capture. $03AEED and $03B302 lie outside every decoded
        # record stream.
        #
        # $03865D and $040A4B are two more live colour slots of the same family,
        # visible only once a capture taken in flight is in the set: the pinned
        # first-world image holds $0654 -- the horizon colour the frame builder
        # writes at $05960C -- and the Key West flight capture holds $0411, which
        # is the same live value the first beacon slot carries. The sibling
        # census test passes on that capture, which is the gate that says no live
        # value reaches a mesh.
        #
        # The assertion is a subset rather than an equality because which
        # captures are present is a property of the checkout -- the memstates are
        # Restricted Material and only five are tracked. What matters is that no
        # capture differs anywhere else; requiring every slot to vary would fail
        # on a checkout that simply lacks the capture which varies it.
        self.assertLessEqual(
            set(differing),
            {
                0x03865D, 0x03865E,
                0x03AEED, 0x03AEEE, 0x03B302, 0x03B303,
                0x03E415, 0x03E416, 0x03E41B, 0x03E41C,
                0x03E422, 0x03E423, 0x03E429, 0x03E42A,
                0x040A4B, 0x040A4C,
            },
        )


class PastiInventoryTests(unittest.TestCase):
    """The disk image is inventoried by structure; its payload stays packed."""

    def inventory(self):
        import importlib.util

        root = Path(__file__).resolve().parents[1]
        stx = (
            root.parents[1]
            / 'roms/atarist/damocles_-_mercenary_ii_novagen_software_(uk).stx'
        )
        if not stx.exists():
            self.skipTest('Working-Authority STX is Restricted Material')
        spec = importlib.util.spec_from_file_location(
            'stx_inventory', root / 'scripts' / 'stx-inventory.py'
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module, module.parse(stx.read_bytes())

    def test_the_container_accounts_for_every_byte(self):
        module, image = self.inventory()
        self.assertEqual(image['version'], 3)
        self.assertEqual(image['trackCount'], 164)
        self.assertEqual(image['size'], 1031930)

    def test_only_two_tracks_are_readable_as_standard_sectors(self):
        module, image = self.inventory()
        report = module.report(image, [])
        self.assertEqual(
            report['geometry']['trackKinds'],
            {'sectored': 2, 'raw-image': 158, 'unformatted': 4},
        )
        self.assertEqual(report['geometry']['describedSectorBytes'], 10240)
        self.assertEqual(report['geometry']['trackImageBytes'], 1017812)
        self.assertEqual(report['geometry']['formattedCylinders'], [0, 79])
        self.assertTrue(report['bootSector']['executable'])

    def test_the_protection_track_is_not_a_second_model_bank(self):
        module, image = self.inventory()
        report = module.report(image, [])
        self.assertEqual(len(report['protection']), 1)
        entry = report['protection'][0]
        self.assertEqual((entry['cylinder'], entry['side']), (1, 0))
        self.assertIn('512 fuzzy-mask bytes', entry['notes'])

    def test_no_resident_bank_is_a_verbatim_copy_of_the_payload(self):
        module, image = self.inventory()
        root = Path(__file__).resolve().parents[1]
        run = root / 'work' / 'observe-first-world-20260818T101013Z-c5a32b7d'
        if not (run / 'observed.ram').is_file():
            self.skipTest('first-world capture lives in the ignored research workspace')
        report = module.report(image, [('observed.ram', (run / 'observed.ram').read_bytes())])
        for item in report['reconciliation'][0]['ranges']:
            self.assertEqual(item['verbatimTracks'], [], item['range'])


class StructureLevelBindingTests(unittest.TestCase):
    """The floor table an alias record publishes in $7C1E (#355)."""

    _structures = None

    def structures(self):
        if StructureLevelBindingTests._structures is None:
            root = Path(__file__).resolve().parents[3]
            document = read_catalogue((root / 'payload' / 'damocles' / 'catalogue.json'))
            by_slot = {}
            for model in document['models']:
                if model['kind'] != 'structure':
                    continue
                for slot in model['slots']:
                    by_slot[slot] = model
            StructureLevelBindingTests._structures = by_slot
        return StructureLevelBindingTests._structures

    def test_vesta_parliament_names_slot_91_at_level_ten(self):
        # The controlled case: same body, group and cell, two levels, two
        # structures. The live captures read $017834 and $017B4A for $7B0E.
        binding = self.structures()[70]['levelBinding']
        self.assertEqual(
            [(f['level'], f['structureSlot']) for f in binding['floors']],
            [(0, 90), (1, 92), (2, 92), (3, 93), (10, 91)],
        )
        self.assertEqual(binding['levelsAuthored'], 12)

    def test_the_level_zero_entry_is_the_base_structure_the_alias_already_names(self):
        # $054DC2 reads the table's first entry into $7AF0 and $054DC2's own
        # target is what the alias record's +6 byte names, so the table and the
        # alias link cannot be two disagreeing accounts of the ground bind.
        checked = 0
        for model in self.structures().values():
            binding = model.get('levelBinding')
            if binding is None or not binding['floors']:
                continue
            ground = binding['floors'][0]
            if ground['level'] != 0:
                continue
            self.assertIn(ground['structureId'], model['relatedModels'])
            checked += 1
        self.assertEqual(checked, 184)

    def test_no_entry_is_claimed_past_the_record_that_authored_it(self):
        for model in self.structures().values():
            binding = model.get('levelBinding')
            if binding is None:
                continue
            self.assertLessEqual(binding['levelsAuthored'], 12)
            for floor in binding['floors']:
                self.assertLess(floor['level'], binding['levelsAuthored'])
                self.assertNotEqual(floor['structureSlot'], 0)
                self.assertEqual(self.structures()[floor['structureSlot']]['id'],
                                 floor['structureId'])

    def test_a_record_has_a_floor_table_exactly_when_it_has_a_pitch(self):
        # Both come from bit 15 of the record's first word.
        for model in self.structures().values():
            self.assertEqual('levelBinding' in model, 'storeyHeight' in model)


class IslandTests(unittest.TestCase):
    """The per-body island records, their coastlines and the surfaces they sit on."""

    @staticmethod
    def payload():
        root = Path(__file__).resolve().parents[3]
        return read_catalogue((root / 'payload' / 'damocles' / 'catalogue.json'))

    @staticmethod
    def _box(x, z):
        """One classifier box, stored [zmax, zmin, xmax, xmin] as $05612A reads it."""
        return struct.pack('>4h', z[1], z[0], x[1], x[0])

    def _coastline(self, edges, vertices, boxes):
        """Author one coastline definition and return the capture and its vertex list."""
        stream = struct.pack('>H', 0)                       # the edge list's zero end
        stream += b''.join(struct.pack('>H', word) for word in reversed(edges))
        stream += struct.pack('>H', 0x8000)                 # the box-list sentinel
        stream += b''.join(self._box(*box) for box in reversed(boxes))
        body = stream + b''.join(struct.pack('>2h', *vertex) for vertex in vertices)
        return bytes(0x100) + body + b'\x80\x00', 0x100 + len(stream)

    def test_a_coastline_definition_decodes_its_boxes_edges_and_vertices(self):
        from damocleslab.catalogue import decode_island_coastline
        data, start = self._coastline(
            edges=[0x0108, 0x0204, 0xC30C],
            vertices=[(-12, 0), (0, 16), (12, -16)],
            boxes=[((-12, 12), (-16, 16)), ((-5, 5), (-5, 5)), ((10, 12), (4, 8))],
        )
        coastline = decode_island_coastline(data, start)
        self.assertEqual(coastline['vertices'], [[-12, 0], [0, 16], [12, -16]])
        self.assertEqual(coastline['edges'], [0x0108, 0x0204, 0xC30C])
        self.assertEqual(
            [(box['kind'], box['x'], box['z']) for box in coastline['boxes']],
            [('extent', [-12, 12], [-16, 16]),
             ('core', [-5, 5], [-5, 5]),
             ('exclusion', [10, 12], [4, 8])],
        )

    def test_a_record_with_no_coastline_still_has_its_extent_and_core(self):
        """The shared stub's box 0 and box 1 both begin $8000 and are read anyway."""
        from damocleslab.catalogue import decode_island_coastline
        plane = ((-32768, 32767), (-32768, 32767))
        data, start = self._coastline(edges=[], vertices=[], boxes=[plane, plane])
        coastline = decode_island_coastline(data, start)
        self.assertEqual(coastline['vertices'], [])
        self.assertEqual(coastline['edges'], [])
        self.assertEqual([box['kind'] for box in coastline['boxes']], ['extent', 'core'])
        self.assertEqual(coastline['boxes'][0]['x'], [-32768, 32767])

    def test_an_edge_list_shorter_than_its_polygon_is_refused(self):
        from damocleslab.catalogue import decode_island_coastline
        data, start = self._coastline(
            edges=[0x0108, 0x0204],
            vertices=[(-12, 0), (0, 16), (12, -16)],
            boxes=[((-12, 12), (-16, 16)), ((-5, 5), (-5, 5))],
        )
        with self.assertRaisesRegex(ValueError, 'closed cycle'):
            decode_island_coastline(data, start)

    def test_an_extent_below_its_lower_bound_is_a_wrapped_span(self):
        from damocleslab.catalogue import island_body_extent
        snow = island_body_extent([32, 1056], {'x': [-40, 24], 'z': [-16, 20]})
        self.assertEqual((snow['x'], snow['z']), ([4088, 56], [1040, 1076]))
        self.assertEqual((snow['wrapsX'], snow['wrapsZ']), (True, False))
        self.assertFalse(snow['coversSurface'])
        # The coastline-less stub's boxes are the whole coordinate plane, which
        # covers every cell rather than naming a span.
        stub = island_body_extent([1214, 683], {'x': [-32768, 32767], 'z': [-32768, 32767]})
        self.assertTrue(stub['coversSurface'])
        self.assertEqual((stub['x'], stub['z']), ([0, 4096], [0, 4096]))
        self.assertEqual((stub['wrapsX'], stub['wrapsZ']), (False, False))

    def test_the_payload_carries_every_record_of_every_body_surface(self):
        document = self.payload()
        islands = document['islands']
        self.assertEqual(len(islands), 62)
        self.assertEqual(len({island['id'] for island in islands}), 62)
        self.assertEqual(len({island['body'] for island in islands}), 30)
        self.assertEqual(sum(1 for i in islands if i['coastline']['vertices']), 41)
        self.assertEqual(sum(1 for i in islands if i['areaName']), 29)
        # The two properties are independent: an island needs no settlement and a
        # settlement needs no island.
        self.assertTrue(any(i['coastline']['vertices'] and not i['areaName'] for i in islands))
        self.assertTrue(any(i['areaName'] and not i['coastline']['vertices'] for i in islands))
        # Group $00 is the shared empty record, so it binds no workspace.
        for island in islands:
            self.assertEqual(island['structureGroup'] == 0, island['workspace'] is None)
        # Every body surface states its colour and its wrapping extent; VOID is
        # the space-as-place sentinel and has none.
        surfaces = [body for body in document['bodies'] if body['bodySurface']]
        self.assertEqual(len(surfaces), 30)
        self.assertIsNone(document['bodies'][30]['bodySurface'])
        eris = next(body for body in surfaces if body['name'] == 'ERIS')
        self.assertEqual(eris['bodySurface']['sourceColour'], 0x003)
        self.assertEqual(eris['bodySurface']['extentCells'], [4096, 4096])
        self.assertTrue(eris['bodySurface']['wrapsX'] and eris['bodySurface']['wrapsZ'])

    def test_the_payload_keeps_the_seam_crossing_extents_whole(self):
        islands = {island['id']: island for island in self.payload()['islands']}
        # Snow Island's west coast reaches body x = -8, which is 4088 on the
        # wrapping surface: a 64-cell span across cell 0, not an empty range.
        snow = islands['island-eris-06327c']['extent']
        self.assertEqual((snow['x'], snow['wrapsX']), ([4088, 56], True))
        self.assertEqual((snow['z'], snow['wrapsZ']), ([1040, 1076], False))
        # Lucan's ring is authored in signed coordinates, and four of its twelve
        # straddle the seam on one axis or the other.
        lucan = islands['island-lucan-0632ea']
        self.assertEqual(lucan['sourceOrigin'], [200, 0])
        self.assertEqual((lucan['extent']['z'], lucan['extent']['wrapsZ']), ([4082, 26], True))
        crossing = [
            island['id'] for island in self.payload()['islands']
            if not island['extent']['coversSurface']
            and (island['extent']['wrapsX'] or island['extent']['wrapsZ'])
        ]
        self.assertEqual(crossing, [
            'island-eris-06327c', 'island-lucan-0632ea', 'island-lucan-063308',
            'island-lucan-063326', 'island-lucan-063344',
        ])

    def test_one_coastline_definition_can_serve_islands_on_two_bodies(self):
        islands = {island['id']: island for island in self.payload()['islands']}
        capital = islands['island-eris-063272']
        birmingham = islands['island-dion-063174']
        self.assertEqual(capital['coastline']['sourceAddress'], 0x06344A)
        self.assertEqual(birmingham['coastline']['sourceAddress'], 0x06344A)
        self.assertEqual(capital['coastline'], birmingham['coastline'])
        self.assertEqual(capital['boxes'], birmingham['boxes'])
        # Shared shape, different bodies, origins, colours and areas.
        self.assertNotEqual(capital['body'], birmingham['body'])
        self.assertEqual((capital['areaName'], birmingham['areaName']),
                         ('CAPITAL CITY', 'BIRMINGHAM ISLAND'))
        self.assertNotEqual(capital['origin'], birmingham['origin'])

    def test_a_cell_label_identifies_a_location_only_with_its_island(self):
        """Capital City 09-08 and Key West 09-08 are different body positions."""
        islands = {island['id']: island for island in self.payload()['islands']}
        capital = islands['island-eris-063272']
        key_west = islands['island-eris-06329a']
        self.assertEqual(capital['origin'], [64, 128])
        self.assertEqual(key_west['origin'], [2560, 3584])
        cell = (9, 8)
        self.assertEqual([capital['origin'][0] + cell[0], capital['origin'][1] + cell[1]],
                         [73, 136])
        self.assertEqual([key_west['origin'][0] + cell[0], key_west['origin'][1] + cell[1]],
                         [2569, 3592])
        self.assertEqual(capital['body'], key_west['body'])
        self.assertNotEqual(capital['structureGroup'], key_west['structureGroup'])

    def test_a_workspace_placement_names_the_island_its_origin_came_from(self):
        document = self.payload()
        islands = {island['id']: island for island in document['islands']}
        placed = [item for item in document['instances']
                  if (item['location'] or {}).get('island')]
        self.assertGreater(len(placed), 1000)
        for instance in placed:
            island = islands[instance['location']['island']]
            self.assertEqual(island['body'], instance['location']['body'])
            # The position stays a Body Coordinate, inside the 16x16 Structure
            # Workspace the record's origin opens.
            for axis, origin in ((0, island['origin'][0]), (2, island['origin'][1])):
                self.assertTrue(0 <= instance['location']['position'][axis] - origin < 16)
        state_office = next(item for item in document['instances']
                            if item['id'] == 'eris-surface-89')
        self.assertEqual(state_office['location']['island'], 'island-eris-063272')
        self.assertEqual(state_office['location']['coordinateSystem'],
                         'Body Coordinates')
        self.assertEqual([int(state_office['location']['position'][axis]) for axis in (0, 2)],
                         [73, 136])
        # A resident's coordinates come from the resident arrays rather than a
        # workspace origin, so they name no record.
        limo = next(item for item in document['instances'] if item['id'] == 'object-slot-5')
        self.assertIsNone(limo['location']['island'])


class SettlementRoadNetworkTests(unittest.TestCase):
    """The $01E000 run grid, replayed against the classification the game made.

    $04EC30-$04EC92 writes two things from one pass: the $0083DC orientation byte
    the ground decoder already reads, and the $01E400 record selection. A replay
    that reproduces the live $0083DC table for all 256 cells of every captured
    workspace is reading the same grid the game read, so the runs it recovers are
    the game's roads and not an interpretation of them.
    """

    WORKSPACES = (
        'vesta-parliament-4-6', 'gaea-ur-city-4-2', 'dion-2-3',
        'damocles.icarus', 'damocles.acheron', 'damocles.atropos',
        'damocles.clotho', 'damocles.gaea.transporter', 'damocles.cronus',
        'damocles.cyclopes', 'damocles.solon', 'damocles.theon',
        'damocles.metis.transporter', 'damocles.lucan',
        'damocles.logos.transporter', 'damocles.pan', 'damocles.thalia',
        'damocles.bacchus.transporter', 'damocles.tolosa', 'damocles.perseus',
        'damocles.mentor.transporter',
    )

    def payload(self):
        root = Path(__file__).resolve().parents[3]
        return read_catalogue((root / 'payload' / 'damocles' / 'catalogue.json'))

    def captures(self):
        from damocleslab.catalogue import hatari_memstate_ram
        root = Path(__file__).resolve().parents[1]
        run = root / 'work' / 'observe-first-world-20260818T101013Z-c5a32b7d'
        if not (run / 'observed.ram').is_file():
            self.skipTest('Working-Authority RAM captures are Restricted Material')
        images = [('first-world', (run / 'observed.ram').read_bytes())]
        for name in self.WORKSPACES:
            images.append((name, hatari_memstate_ram(
                (root / 'snapshots' / f'{name}.sav').read_bytes())))
        return images

    def test_the_replay_reproduces_every_captures_live_orientation_table(self):
        from damocleslab.catalogue import ROAD_CLASS_TABLE, road_cell_class
        for name, ram in self.captures():
            replayed = bytes(
                ram[ROAD_CLASS_TABLE + road_cell_class(ram, cell)]
                for cell in range(256)
            )
            self.assertEqual(replayed, ram[0x83DC:0x84DC], name)

    def test_every_class_the_grid_reaches_names_the_piece_its_runs_imply(self):
        """What the 64-byte table means, read off the classes the data reaches.

        Each axis is absent, or the cell caps its run, or the cell lies inside
        it; no authored cell is its own run's start and end at once. The piece is
        then a function of the pair, and the low nybble is the quarter turn that
        orients it. The table is resident rather than per-group, so this is one
        vocabulary every Settlement draws from.
        """
        from damocleslab.catalogue import (
            ROAD_CLASS_TABLE, ROAD_PIECES, road_cell_class)
        absent, cap, through = 'absent', 'cap', 'through'
        piece_for = {
            (through, through): 'crossroads',
            (through, cap): 'tee', (cap, through): 'tee',
            (through, absent): 'straight', (absent, through): 'straight',
            (cap, cap): 'corner',
            (cap, absent): 'end', (absent, cap): 'end',
            (absent, absent): 'none',
        }

        def axis_state(class_bits, run_bit, endpoint_bits):
            if not class_bits & run_bit:
                return absent
            ends = sum(bool(class_bits & bit) for bit in endpoint_bits)
            self.assertNotEqual(ends, 0, class_bits)  # no run is one cell long
            return cap if ends == 1 else through

        table = None
        reached = set()
        for name, ram in self.captures():
            if table is None:
                table = ram[ROAD_CLASS_TABLE:ROAD_CLASS_TABLE + 64]
            self.assertEqual(ram[ROAD_CLASS_TABLE:ROAD_CLASS_TABLE + 64], table, name)
            reached.update(road_cell_class(ram, cell) for cell in range(256))
        for class_bits in reached:
            row = axis_state(class_bits, 1, (2, 4))
            column = axis_state(class_bits, 8, (0x10, 0x20))
            self.assertEqual(
                ROAD_PIECES[((table[class_bits] >> 3) & 0xE) // 2],
                piece_for[(row, column)],
                class_bits,
            )
            self.assertLess(table[class_bits] & 7, 4, class_bits)
        # Every entry the table carries is reached, so none of it is guesswork,
        # and every class it answers 'none' for is one no authored grid builds.
        self.assertEqual(sorted(reached), sorted({0} | {c for c in range(64) if table[c]}))

    def test_the_expansion_reproduces_every_captures_live_run_grid(self):
        """The grid the loader built, rebuilt from the group's authored stream.

        This is what lets a group nobody has stood in publish a network at all.
        $01E000 is not authored -- $04EB60 expands a run-length extent stream
        held in the group's own record -- so reconstructing it is only sound if
        the reconstruction matches what the machine actually built. Every
        capture on disk binds some group, and each is an independent check.
        """
        from damocleslab.catalogue import (
            ROAD_RUN_GRID, expand_run_grid, hatari_memstate_ram)
        root = Path(__file__).resolve().parents[1]
        run = root / 'work' / 'observe-first-world-20260818T101013Z-c5a32b7d'
        if not (run / 'observed.ram').is_file():
            self.skipTest('Working-Authority RAM captures are Restricted Material')
        image = (run / 'observed.ram').read_bytes()
        groups = set()
        for path in sorted(root.glob('snapshots/*.sav')):
            memory = hatari_memstate_ram(path.read_bytes())
            if len(memory) != 1048576:
                continue
            group = struct.unpack_from('>H', memory, 0x794e)[0]
            grid, selectors = expand_run_grid(image, group)
            self.assertEqual(
                grid, memory[ROAD_RUN_GRID:ROAD_RUN_GRID + 1024], path.name)
            self.assertEqual(
                selectors,
                [struct.unpack_from('>H', memory, 0x1E640 + index * 2)[0]
                 for index in range(6)],
                path.name)
            groups.add(group)
        # The captures are Restricted Material and only five are tracked, so
        # which are present is a property of the checkout; require the tracked
        # ones rather than a count a fuller checkout would exceed.
        self.assertLessEqual({0x12}, groups)

    def test_the_payload_carries_a_network_for_every_binding_island_record(self):
        payload = self.payload()
        networks = payload['roadNetworks']
        binding = [island for island in payload['islands']
                   if island['structureGroup']]
        self.assertEqual(len(networks), len(binding))
        self.assertEqual(
            {(n['body'], tuple(n['origin'])) for n in networks},
            {(i['body'], tuple(i['origin'])) for i in binding})
        # A capture attests the group it stood in; the rest are expanded from
        # the image, which is a different provenance and not a lesser network.
        attested = [n for n in networks if n['attestation'] == 'capture']
        self.assertEqual(len(attested), 1 + len(self.WORKSPACES))
        # An empty network is a reading: these three Settlements have no roads.
        self.assertEqual(
            sorted(n['id'] for n in networks if not n['cells']),
            ['roads-gaea-0e', 'roads-midas-the-midas-project', 'roads-solon'])
        # Twenty-one Bodies now carry roads: the twenty a capture reached,
        # plus LACHESIS, which no pose stands on and no craft route reaches.
        self.assertEqual(len({n['body'] for n in networks if n['cells']}), 21)

    def test_the_loader_replay_reproduces_every_captures_live_workspace(self):
        """The workspace a group's Drawn Records come from, rebuilt from the image.

        $04EB60-$04ED12 writes every table the ground decoder reads for a cell --
        the run grid that doubles as the scene seed, the $0083DC orientation, the
        $01E400 record after the placement replacement, and the $00ABDC slot the
        palette follows. The replay has to match the machine on all of them.
        """
        from damocleslab.catalogue import hatari_memstate_ram, load_structure_workspace
        root = Path(__file__).resolve().parents[1]
        run = root / 'work' / 'observe-first-world-20260818T101013Z-c5a32b7d'
        if not (run / 'observed.ram').is_file():
            self.skipTest('Working-Authority RAM captures are Restricted Material')
        image = (run / 'observed.ram').read_bytes()
        captures = [(path.name, hatari_memstate_ram(path.read_bytes()))
                    for path in sorted(root.glob('snapshots/*.sav'))]
        groups = set()
        for name, memory in [('first-world', image)] + captures:
            if len(memory) != 1048576:
                continue
            group = struct.unpack_from('>H', memory, 0x794e)[0]
            replayed = load_structure_workspace(image, group)
            # The record bank the $1E400 words index is resident, so the replay
            # reads it from the image: past the six selectors nothing differs.
            spans = [(0x1E000, 0x400), (0x1E400, 0x200), (0x1E640, 12), (0x83DC, 256),
                     (0x7AEE, 2), (0x1E64E, 0x30000 - 0x1E64E)]
            # $04ED2A-$04ED3C floods $ABDC with its first entry while $7A2A is
            # set, which is run state and not the group's stream.
            if not memory[0x7A2A]:
                spans.append((0xABDC, 1024))
            for start, length in spans:
                self.assertEqual(replayed[start:start + length],
                                 memory[start:start + length], f'{name} ${start:05X}')
            groups.add(group)
        # Only five captures are tracked; require the group they share.
        self.assertLessEqual({0x12}, groups)

    def test_every_image_road_cell_publishes_its_drawn_record(self):
        payload = self.payload()
        models = {model['id']: model for model in payload['models']}
        cells = [cell for network in payload['roadNetworks']
                 if network['attestation'] == 'image' for cell in network['cells']]
        self.assertEqual(len(cells), 478)
        for cell in cells:
            self.assertIn(cell['overridden'], (True, False))
            model = models[cell['model']]
            self.assertEqual(model['kind'], 'ground')
            self.assertTrue(model['variants'], cell)
        # A placement replaced the Selected Piece on some cells and not others,
        # which is the question an image network could not answer before.
        self.assertEqual(sum(cell['overridden'] for cell in cells), 114)

    def test_the_capital_city_network_is_the_one_the_aerial_view_draws(self):
        """The pinned capture's live ground-extent edge list, cell by cell.

        docs/research/damocles-eris-ground.md reads six nonzero edges out of
        $84DC in the first-world capture, whose 7x7 window covers x 4-10, z 5-11
        around cell $87. Every one of them is a run of this network, and no other
        run reaches that window, so the edges the game drew are exactly the roads
        recovered here.
        """
        capital = next(n for n in self.payload()['roadNetworks']
                       if n['id'] == 'roads-eris-capital-city')
        self.assertEqual(capital['origin'], [64, 128])
        self.assertEqual(len(capital['cells']), 88)
        live_edges = {
            ('x', (7, 8), (11, 8)),
            ('z', (4, 1), (4, 11)),
            ('z', (9, 8), (9, 13)),
            ('z', (10, 8), (10, 9)),
            ('x', (4, 9), (10, 9)),
            ('x', (3, 11), (5, 11)),
        }
        window = lambda x, z: 4 <= x <= 10 and 5 <= z <= 11
        reached = set()
        for run in capital['runs']:
            axis = 0 if run['axis'] == 'x' else 1
            cells = [
                (run['start'][0] + (step if axis == 0 else 0),
                 run['start'][1] + (step if axis == 1 else 0))
                for step in range(run['end'][axis] - run['start'][axis] + 1)
            ]
            if any(window(x, z) for x, z in cells):
                reached.add((run['axis'], tuple(run['start']), tuple(run['end'])))
        self.assertEqual(reached, live_edges)



class StoredLayoutTests(unittest.TestCase):
    """The Catalogue is stored as one shared document and one file per Model (ADR 0048)."""

    @staticmethod
    def result():
        def model(model_id, kind, **extra):
            return {'id': model_id, 'kind': kind, 'name': model_id.upper(), 'recordClass': 'geometry',
                    'slots': [1], 'status': 'decoded', 'variants': [], **extra}

        def instance(instance_id, model_id, body=None, parent=None):
            return {'id': instance_id, 'model': model_id,
                    'location': None if body is None else {'body': body},
                    'placement': None if parent is None else {'parent': parent}}

        return {
            'schemaVersion': SCHEMA_VERSION, 'title': 'Damocles',
            'source': {'programSha256': 'p' * 64, 'ramSha256': 'r' * 64, 'run': 'run-1',
                       'authority': 'a', 'evidence': 'e'},
            'bodies': [{'id': 'body-1'}, {'id': 'body-2'}, {'id': 'body-3'}],
            'models': [
                model('structure-b', 'structure', structureSelection={'detailModel': 'interior-c'}),
                model('interior-c', 'interior'),
                model('object-a', 'object', supportTop=48),
                model('ground-d', 'ground'),
                model('object-unplaced', 'object'),
            ],
            'instances': [
                instance('i-structure', 'structure-b', body='body-1'),
                instance('i-resident', 'object-a', parent='i-structure'),
                instance('i-nowhere', 'object-unplaced'),
            ],
            'roadNetworks': [{'body': 'body-2', 'cells': [{'model': 'ground-d'}, {'model': None}]}],
        }

    def test_a_body_draws_its_instances_residents_roads_and_selected_interiors(self):
        from damocleslab.catalogue import body_models
        self.assertEqual(body_models(self.result()), {
            'body-1': ['interior-c', 'object-a', 'structure-b'],
            'body-2': ['ground-d'],
            'body-3': [],
        })

    def test_the_shared_document_indexes_every_model_and_carries_none(self):
        from damocleslab.catalogue import split_catalogue
        document, files = split_catalogue(self.result())
        self.assertNotIn('models', document)
        self.assertEqual(document['schemaVersion'], SCHEMA_VERSION)
        self.assertEqual([entry['id'] for entry in document['modelIndex']],
                         ['structure-b', 'interior-c', 'object-a', 'ground-d', 'object-unplaced'])
        self.assertEqual(document['modelIndex'][3], {
            'id': 'ground-d', 'kind': 'ground', 'name': 'GROUND-D', 'recordClass': 'geometry',
            'slots': [1], 'status': 'decoded'})
        self.assertEqual(document['bodies'][1], {'id': 'body-2', 'models': ['ground-d']})
        self.assertEqual(document['modelIndex'][2]['supportTop'], 48)
        self.assertNotIn('storeyHeight', document['modelIndex'][2])
        self.assertEqual(set(files), {entry['id'] for entry in document['modelIndex']})
        self.assertEqual(files['object-a'], {
            'schemaVersion': SCHEMA_VERSION, 'source': {'programSha256': 'p' * 64, 'run': 'run-1'},
            'model': self.result()['models'][2]})

    def test_writing_removes_model_files_the_run_no_longer_produces(self):
        import tempfile
        from damocleslab.catalogue import write_catalogue
        with tempfile.TemporaryDirectory() as root:
            output = Path(root) / 'catalogue.json'
            (Path(root) / 'models').mkdir()
            (Path(root) / 'models' / 'object-retired.json').write_text('{}')
            write_catalogue(self.result(), output)
            written = sorted(path.name for path in (Path(root) / 'models').iterdir())
            self.assertEqual(written, ['ground-d.json', 'interior-c.json', 'object-a.json',
                                       'object-unplaced.json', 'structure-b.json'])
            self.assertTrue(output.read_text().endswith('}\n'))
            self.assertNotIn('models', json.loads(output.read_text()))


class BoardingAdmissionTests(unittest.TestCase):
    """The board gate's admission facts, published per resident instance (#408)."""

    # $0542E0-$05434F as the pinned image holds it: the refusal chooser, then the gate.
    GATE = bytes.fromhex(
        '3208 0c410004 6750 0c410038 6c4a 0c41001c 6706 7203 60000510 7216 6000050a 4e75'
        '0c7800097b42 6ef6 26387b46 67f0 0838000e7b34 67e8 2043 e44b 67e2 0c030017 64dc'
        '32387ab0 6ad6 0c7800787aa8 67ce 4a287272 6aa8 22790004bd10 d3f18000 0c518001 66b8'
        '0c2900400003 66b0'.replace(' ', ''))

    _instances = None

    @classmethod
    def image(cls, patch=None):
        data = bytearray(1048576)
        data[0x542E0:0x542E0 + len(cls.GATE)] = cls.GATE
        for address, value in (patch or {}).items():
            data[address] = value
        return bytes(data)

    def instances(self):
        if BoardingAdmissionTests._instances is None:
            root = Path(__file__).resolve().parents[3]
            document = json.loads((root / 'payload' / 'damocles' / 'catalogue.json').read_text())
            self.assertEqual(document['schemaVersion'], SCHEMA_VERSION)
            BoardingAdmissionTests._instances = {i['id']: i for i in document['instances']}
        return BoardingAdmissionTests._instances

    def boarding(self, slot):
        return self.instances()[f'object-slot-{slot}']['boarding']

    def test_the_gate_constants_are_read_from_the_image(self):
        from damocleslab.catalogue import decode_board_gate
        self.assertEqual(decode_board_gate(self.image()), {
            'boardableBound': 23, 'unkeyedSlot': 1, 'seatableFrom': 14, 'ownRefusalSlot': 7,
            'ownRefusal': 'system-string-22', 'keyRefusal': 'system-string-3',
            'pairOffset': 178, 'orientationMode': 0x40,
        })
        # An operand is read, not assumed: move the bound and the decode follows it.
        self.assertEqual(decode_board_gate(self.image({0x54321: 0x10}))['boardableBound'], 16)
        # An opcode is checked: a different instruction is not this gate.
        with self.assertRaises(ValueError):
            decode_board_gate(self.image({0x5431E: 0x0d}))

    def test_the_pinned_image_holds_the_recovered_gate(self):
        from damocleslab.catalogue import decode_board_gate
        root = Path(__file__).resolve().parents[1]
        first = root / 'work' / 'observe-first-world-20260818T101013Z-c5a32b7d' / 'observed.ram'
        if not first.exists():
            self.skipTest('Working-Authority RAM captures are Restricted Material')
        self.assertEqual(decode_board_gate(first.read_bytes()),
                         decode_board_gate(self.image()))

    def test_each_resident_takes_the_chooser_outcome_its_slot_selects(self):
        from damocleslab.catalogue import resident_boarding
        gate = {'boardableBound': 23, 'unkeyedSlot': 1, 'seatableFrom': 14, 'ownRefusalSlot': 7,
                'ownRefusal': 'system-string-22', 'keyRefusal': 'system-string-3',
                'pairOffset': 178, 'orientationMode': 0x40}
        yaw = {'angleBiasByte': 0, 'modeByte': 0x40, 'rotation': 'yaw'}
        present = {'object-slot-183', 'object-slot-185'}

        def board(slot, orientation=yaw):
            return resident_boarding(slot, orientation, gate, present, resident=True)

        self.assertEqual(
            {k: v for k, v in board(5).items() if k != 'reason'},
            {'boardable': True, 'boardableProvenance': 'derived',
             'admission': 'paired', 'admissionProvenance': 'derived',
             'pairedSlot': 183, 'pairedInstance': 'object-slot-183', 'pairedProvenance': 'derived',
             'refusal': 'system-string-3', 'refusalProvenance': 'recovered'})
        self.assertEqual((board(7)['pairedInstance'], board(7)['refusal']),
                         ('object-slot-185', 'system-string-22'))
        self.assertEqual((board(1)['admission'], board(1)['pairedSlot'], board(1)['refusal']),
                         ('unkeyed', None, None))
        self.assertEqual((board(14)['admission'], board(22)['admission']), ('seatable', 'seatable'))
        # A pair whose slot holds no instance is recorded as missing, not invented.
        self.assertEqual((board(11)['pairedSlot'], board(11)['pairedInstance']), (189, None))
        self.assertIn('slot 189', board(11)['reason'])
        # The model guard: without the single-Y-turn command the gate refuses silently.
        self.assertFalse(board(5, None)['boardable'])
        self.assertFalse(board(5, {**yaw, 'modeByte': 0x80})['boardable'])
        self.assertEqual(board(5, None)['refusal'], 'system-string-3')
        # At the bound and above, the gate refuses before the key test: no chooser outcome.
        self.assertEqual(
            {k: v for k, v in board(23).items() if k != 'reason'},
            {'boardable': False, 'boardableProvenance': 'derived',
             'admission': None, 'admissionProvenance': 'derived',
             'pairedSlot': None, 'pairedInstance': None, 'pairedProvenance': 'derived',
             'refusal': None, 'refusalProvenance': 'recovered'})

    def test_every_placed_craft_and_the_authors_chair_publish_the_recovered_gate(self):
        keyed = {2: 180, 3: 181, 4: 182, 5: 183, 6: 184, 10: 188, 12: 190, 13: 191}
        for slot, key in keyed.items():
            with self.subTest(slot=slot):
                self.assertIsNotNone(self.instances()[f'object-slot-{slot}']['location'])
                boarding = self.boarding(slot)
                self.assertTrue(boarding['boardable'])
                self.assertEqual((boarding['admission'], boarding['pairedInstance'],
                                  boarding['refusal']),
                                 ('paired', f'object-slot-{key}', 'system-string-3'))
        self.assertEqual((self.boarding(1)['boardable'], self.boarding(1)['admission'],
                          self.boarding(1)['pairedInstance']), (True, 'unkeyed', None))
        seven = self.boarding(7)
        self.assertEqual((seven['boardable'], seven['pairedInstance'], seven['refusal']),
                         (True, 'object-slot-185', 'system-string-22'))
        self.assertTrue(self.instances()['object-slot-185']['name'].startswith('SETTEE'))
        chair = self.boarding(14)
        self.assertTrue(self.instances()['object-slot-14']['name'].startswith("AUTHOR'S CHAIR"))
        self.assertEqual((chair['boardable'], chair['admission'], chair['pairedInstance'],
                          chair['refusal']), (True, 'seatable', None, None))

    def test_only_those_are_boardable(self):
        boardable = sorted(int(i['id'].rsplit('-', 1)[1]) for i in self.instances().values()
                           if i['boarding'] is not None and i['boarding']['boardable'])
        self.assertEqual(boardable, [1, 2, 3, 4, 5, 6, 7, 10, 12, 13, 14])

    def test_the_attack_ship_is_not_boardable_and_says_why(self):
        ship = self.boarding(11)
        self.assertFalse(ship['boardable'])
        self.assertEqual((ship['pairedSlot'], ship['pairedInstance']), (189, None))
        self.assertIn('model guard', ship['reason'])
        self.assertIn('No residence', ship['reason'])
        self.assertFalse(self.boarding(15)['boardable'])

    def test_no_settee_is_boardable(self):
        settees = [i for i in self.instances().values() if i['name'].startswith('SETTEE')]
        self.assertTrue(settees)
        for settee in settees:
            self.assertFalse(settee['boarding']['boardable'])
            self.assertIsNone(settee['boarding']['admission'])

    def test_only_resident_instances_carry_a_boarding_block_and_every_field_its_provenance(self):
        for instance in self.instances().values():
            boarding = instance['boarding']
            self.assertEqual(boarding is not None, instance['id'].startswith('object-slot-'),
                             instance['id'])
            if boarding is None:
                continue
            for field in ('boardable', 'admission', 'paired', 'refusal'):
                self.assertIn(boarding[f'{field}Provenance'], ('recovered', 'derived'))
            self.assertTrue(boarding['reason'])


if __name__ == '__main__':
    unittest.main()
