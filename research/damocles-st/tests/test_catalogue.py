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


class GroundTests(unittest.TestCase):
    def test_pad_strip_keeps_local_vertices_and_omits_join_sentinels(self):
        from damocleslab.catalogue import decode_ground
        # Short header $00FF, three plan points around cell centre, white quad
        # that also names the $F0 neighbor-join slot, then terminator.
        data = bytes.fromhex(
            '00ff'
            '84b080c8 800080c8 7b5080c8 0000'
            '0777 04 08 0c f0 00'
            '0000'
        )
        mesh, gaps, transform = decode_ground(data, 0, 0, hardware=[0] * 16)
        self.assertEqual(transform, 0)
        self.assertEqual(mesh['vertices'][:3], [[1200, 0, 200], [0, 0, 200], [-1200, 0, 200]])
        self.assertEqual(mesh['faces'][0]['sourceColour'], 0x777)
        self.assertEqual(mesh['faces'][0]['vertices'], [0, 1, 2])
        self.assertTrue(any('F0' in gap or 'F4' in gap for gap in gaps))

    def test_empty_record_is_a_gap_not_a_fabricated_quad(self):
        from damocleslab.catalogue import decode_ground
        mesh, gaps, transform = decode_ground(bytes.fromhex('00ff 0000 0000'), 0, 0)
        self.assertEqual(transform, 0)
        self.assertEqual(mesh['faces'], [])
        self.assertEqual(mesh['lines'], [])
        self.assertTrue(any('Empty ground record' in gap for gap in gaps))

    def test_bit13_command_stops_without_inventing_faces(self):
        from damocleslab.catalogue import decode_ground
        mesh, gaps, _ = decode_ground(bytes.fromhex('00ff 0000 7000 0000'), 0, 0)
        self.assertEqual(mesh['faces'], [])
        self.assertTrue(any('7000' in gap or '53F76' in gap for gap in gaps))

    def test_palette_edge_becomes_a_line(self):
        from damocleslab.catalogue import decode_ground
        data = bytes.fromhex('00ff 84b08000 7b508000 0000 c00e 04 08 0000')
        mesh, gaps, _ = decode_ground(data, 0, 0, hardware=[0x444] * 16)
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
