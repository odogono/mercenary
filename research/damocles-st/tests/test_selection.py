import struct
import unittest

from damocleslab.catalogue import Reader, selection_list, decode_detail_selection, decode_structure_selection


class SelectionTests(unittest.TestCase):
    def test_detail_groups_align_after_an_odd_face_stream_end(self):
        groups = bytes.fromhex('0000 0100 0000 0200')
        self.assertEqual(decode_detail_selection(b'\xff\x00' + groups, 1, 2),
                         [{'boxes': [], 'default': [0]}, {'boxes': [], 'default': [1]}])

    def test_lists_preserve_order_repeats_empty_and_attachment(self):
        self.assertEqual(selection_list(Reader(bytes([3, 1, 3, 0]), 0), 3), [2, 0, 2])
        self.assertEqual(selection_list(Reader(bytes([0, 0]), 0), 3), [])
        self.assertEqual(
            selection_list(Reader(bytes([255, 0]), 0), 3, True),
            [{'kind': 'attachment', 'slot': 0x3FC}],
        )
        self.assertEqual(
            selection_list(Reader(bytes([252, 254, 0, 0]), 0), 3, True),
            [{'kind': 'attachment', 'slot': 0x3F0}, {'kind': 'attachment', 'slot': 0x3F8}],
        )

    def test_lists_refuse_truncation_bad_padding_and_invalid_references(self):
        for data in (b'\x01', b'\x04\x00', b'\x00\x01', b'\xff\x00'):
            with self.assertRaises(ValueError):
                selection_list(Reader(data, 0), 3)

    def test_detail_groups_preserve_empty_boxes_and_defaults(self):
        box = struct.pack('>H6h', 0xffff, -10, 10, 0, 100, -20, 20)
        data = box + bytes.fromhex('0000 0000 02010000 0000 0300')
        groups = decode_detail_selection(data, 0, 3)
        self.assertEqual(groups[0]['boxes'][0], {'bounds': [[-10,10],[0,100],[-20,20]], 'faces': []})
        self.assertEqual(groups[0]['default'], [1,0])
        self.assertEqual(groups[1], {'boxes': [], 'default': [2]})
        for bad in (b'\x00\x01', data[:-1], struct.pack('>H6h', 0xffff, 10, -10, 0, 100, -20, 20)):
            with self.assertRaises(ValueError):
                decode_detail_selection(bad, 0, 3)

    def test_regions_scale_bounds_keep_sentinels_and_preserve_empty_queues(self):
        mesh = {'sourceEnd': 2, 'sourceStart': 0, 'faces': [{'sourceIndex': 0}]}
        data = bytes.fromhex('0000') + struct.pack('>H4h', 0xc000, -32768, 10, -20, 32767) + bytes.fromhex('0100 8000 0000000a0000000a 0000 0000')
        result = decode_structure_selection(data, mesh, (2, 3), [], [])
        self.assertEqual(result['regions'][0]['bounds'], [[-32768,20],[-60,32767]])
        self.assertEqual(result['regions'][0]['queue'], [{'kind': 'face', 'index': 0}])
        self.assertEqual(result['regions'][1]['queue'], [])
        self.assertEqual(result['attachments'], [])
        with self.assertRaises(ValueError):
            decode_structure_selection(bytes.fromhex('4201'), mesh, (2,3), [], [])
        with self.assertRaises(ValueError):
            decode_structure_selection(data[:-1], mesh, (2,3), [], [])

    def test_region_cannot_name_missing_attachment_or_omitted_primitive(self):
        mesh = {'sourceEnd': 2, 'sourceStart': 0, 'faces': [{'sourceIndex': 2}]}
        header = bytes.fromhex('0000 c000 0000000a0000000a')
        for queue in (bytes.fromhex('ff00'), bytes.fromhex('0200')):
            with self.assertRaises(ValueError):
                decode_structure_selection(header + queue + b'\0\0', mesh, (1,1), [], [])

    def test_reviewed_closed_attachment_has_two_three_wall_leaves(self):
        start = 0x1484e
        data = bytearray(start + 4)
        struct.pack_into('>hh', data, start, 250, 150)
        data += struct.pack('>H4h4H4hH', 0x4200, 650, -395, 750, -385,
                            0x908a, 0x908c, 0x9090, 0x908a, 600, 800, -600, -100, 0)
        data += bytes.fromhex('c000 80007fff80007fff ff00 0000')
        mesh = {'sourceStart': start, 'sourceEnd': start + 6, 'faces': []}
        palette = [0] * 16
        palette[5], palette[6], palette[8] = 0x333, 0x444, 0x322
        result = decode_structure_selection(bytes(data), mesh, (2,2), palette, [])
        attachment = result['attachments'][0]
        self.assertEqual(attachment['controlWord'], 0x4200)
        self.assertEqual(attachment['slot'], 0x3FC)
        self.assertEqual(attachment['constructor'], {'leafCount': 2, 'motionAxis': 'x'})
        self.assertEqual(attachment['proximityBox'], {'x': [1200, 1600], 'z': [-1200, -200]})
        self.assertEqual(result['regions'][0]['gate'], 'none')
        self.assertEqual(result['regions'][0]['queue'], [{'kind': 'attachment', 'slot': 0x3FC}])
        self.assertEqual([face['colour'] for face in attachment['mesh']['faces']], ['#666666','#888888','#664444'] * 2)
        self.assertEqual(sorted(set(p[0] for p in attachment['mesh']['vertices'])), [1300,1400,1500])
        self.assertEqual(sorted(set(p[1] for p in attachment['mesh']['vertices'])), [0,150])
        self.assertEqual(sorted(set(p[2] for p in attachment['mesh']['vertices'])), [-790,-770])

    def test_two_leaf_z_attachment_splits_the_closed_z_span(self):
        start = 0x14aec
        data = bytearray(start + 4)
        struct.pack_into('>hh', data, start, 150, 110)
        data += struct.pack(
            '>H4h4H4h',
            0x8200, 293, -160, 297, -40,
            0x9090, 0x9088, 0x9082, 0x9084,
            100, 500, -200, 0,
        )
        data += bytes.fromhex('0000 03fd 0122 012c ff60 ffd8 ff00 0000')
        mesh = {'sourceStart': start, 'sourceEnd': start + 6, 'faces': []}
        palette = [0] * 16
        palette[1], palette[4], palette[8] = 0x411, 0x444, 0x322
        result = decode_structure_selection(bytes(data), mesh, (1, 1), palette, [])
        attachment = result['attachments'][0]
        self.assertEqual(attachment['constructor'], {'leafCount': 2, 'motionAxis': 'z'})
        self.assertEqual(attachment['proximityBox'], {'x': [100, 500], 'z': [-200, 0]})
        self.assertEqual(sorted({p[2] for p in attachment['mesh']['vertices']}), [-160, -100, -40])
        self.assertEqual(result['regions'][0]['gate'], 'attachmentLatch')
        self.assertEqual(result['regions'][0]['insetAxis'], 'z')

    def test_leaves_rise_to_the_soffit_over_their_closed_rectangle(self):
        start = 0x14aec
        data = bytearray(start + 4)
        struct.pack_into('>hh', data, start, 150, 110)
        record = struct.pack('>H4h4H4h', 0x4200, -100, 185, 100, 200,
                             0x9090, 0x9088, 0x9082, 0x9084, -300, 300, 100, 400)
        tail = bytes.fromhex('0000 c000 80007fff80007fff ff00 0000')
        soffit = {'sourceIndex': 0, 'vertices': [0, 1, 2, 3]}
        mesh = {'sourceStart': start, 'sourceEnd': start + 6, 'faces': [soffit],
                'vertices': [[-100, 150, 180], [100, 150, 180], [100, 150, 200], [-100, 150, 200]]}
        result = decode_structure_selection(bytes(data) + record + tail, mesh, (1, 1), [0] * 16, [])
        leaves = result['attachments'][0]['mesh']['vertices']
        self.assertEqual(sorted({point[1] for point in leaves}), [0, 150])
        mesh['vertices'] = [[point[0], 150, point[2] - 40] for point in mesh['vertices']]
        aside = decode_structure_selection(bytes(data) + record + tail, mesh, (1, 1), [0] * 16, [])
        self.assertEqual(sorted({point[1] for point in aside['attachments'][0]['mesh']['vertices']}),
                         [0, 110])

    def test_passage_sentinel_is_not_an_attachment_mesh(self):
        mesh = {'sourceEnd': 2, 'sourceStart': 0, 'faces': [{'sourceIndex': 0}]}
        data = bytes.fromhex('0000 8200 0000000a 0000000a 0100 0000')
        result = decode_structure_selection(data, mesh, (1, 1), [], [])
        self.assertEqual(result['attachments'], [])
        self.assertEqual(result['regions'][0]['gate'], 'passage')
        self.assertNotIn('insetAxis', result['regions'][0])

    def test_f0_selector_variant_uses_the_same_constructor_as_the_zero_latch(self):
        start = 0x10ec2
        data = bytearray(start + 4)
        struct.pack_into('>hh', data, start, 250, 150)
        data += struct.pack(
            '>H4h4H4hH',
            0x40F0, 75, -198, 125, -192,
            0x1246, 0x1432, 0x1444, 0x001E,
            170, -450, -100, -32768, 0,
        )
        data += bytes.fromhex('c000 80007fff80007fff 0000 0000')
        mesh = {'sourceStart': start, 'sourceEnd': start + 6, 'faces': []}
        result = decode_structure_selection(bytes(data), mesh, (2, 2), [0] * 16, [])
        attachment = result['attachments'][0]
        self.assertEqual(attachment['controlWord'], 0x40F0)
        self.assertEqual(attachment['constructor'], {
            'leafCount': 1, 'motionAxis': 'x', 'movingSide': 'high',
        })
        self.assertEqual(attachment['proximityBox'], {'x': [-900, 340], 'z': [-32768, -200]})
        self.assertTrue(result['liveSelector'])

    def test_z_f0_variant_is_two_leaf_z(self):
        start = 0x1532a
        data = bytearray(start + 4)
        struct.pack_into('>hh', data, start, 150, 110)
        data += struct.pack(
            '>H4h4H4hH',
            0x82F0, -407, -200, -403, 0,
            0x9086, 0x9082, 0x9086, 0x9084,
            -600, -200, -200, 0, 0,
        )
        data += bytes.fromhex('c000 80007fff80007fff ff00 0000')
        mesh = {'sourceStart': start, 'sourceEnd': start + 6, 'faces': []}
        result = decode_structure_selection(bytes(data), mesh, (1, 1), [0] * 16, [])
        self.assertEqual(result['attachments'][0]['constructor'], {
            'leafCount': 2, 'motionAxis': 'z',
        })

    def test_non_f0_low_byte_is_still_not_an_entrance_record(self):
        mesh = {'sourceEnd': 2, 'sourceStart': 0, 'faces': [{'sourceIndex': 0}]}
        with self.assertRaisesRegex(ValueError, 'unknown structure attachment form'):
            decode_structure_selection(bytes.fromhex('40ff') + b'\0' * 32, mesh, (1, 1), [], [])
