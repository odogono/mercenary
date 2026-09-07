import struct
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from damocleslab.catalogue import decode_mesh, st_rgb

class CatalogueTests(unittest.TestCase):
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
