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
        self.assertEqual(selection_list(Reader(bytes([255, 0]), 0), 3, True), [{'kind': 'attachment'}])

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
        self.assertIsNone(result['attachment'])
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
        attachment = result['attachment']
        self.assertEqual([face['colour'] for face in attachment['faces']], ['#666666','#888888','#664444'] * 2)
        self.assertEqual(sorted(set(p[0] for p in attachment['vertices'])), [1300,1400,1500])
        self.assertEqual(sorted(set(p[1] for p in attachment['vertices'])), [0,150])
        self.assertEqual(sorted(set(p[2] for p in attachment['vertices'])), [-790,-770])
