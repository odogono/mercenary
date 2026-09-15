import json
import struct
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from damocleslab.catalogue import decode_mesh, st_rgb

class CatalogueTests(unittest.TestCase):
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
            1: {2: 16, 3: 16, 4: 16, 5: 16, 9: 2, 10: 5, 11: 5, 12: 8},
            12: {1: 24, 2: 16, 3: 16, 4: 16, 5: 16, 9: 2, 10: 5, 11: 5},
        })
        self.assertEqual(
            decode_structure_associations(bytes.fromhex('03 04 00 05 07 00 00'), 0),
            {3: {4: 0, 5: 7}},
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
        self.assertTrue(any('preprojected runtime horizon slot $F0/$F4' in gap for gap in gaps))
        model = {'reason': ' '.join(gaps)}
        classify_record(model, False)
        self.assertEqual(model['omissions'], ['viewConditioned'])

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


def _empty_world():
    data = bytearray(1048576)
    struct.pack_into('>I', data, 0x4bd10, 0x35700)
    struct.pack_into('>I', data, 0x4bd22, 0x26000)
    for base, count in [(0x35700, 378), (0xe900, 280), (0x26000, 130)]:
        for slot in range(count):
            struct.pack_into('>I', data, base + slot * 4, 0x1000)
        struct.pack_into('>H', data, base + 0x1000, 0x8000)
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
