"""#681's object decoder paths: header forms, patches, articulation, lettering, extraction.

The first tests build model records in a blank image, so they need no captures.
The rest read the census run (M3_CENSUS_RUN) and the object extraction and
comparison results (M3_OBJECTS, the directory holding objects.json and
objects.scenes.json), and skip without them.
"""

import json
import os
import struct
from pathlib import Path
import unittest

from m3lab.catalogue_ledger import load_ledger
from m3lab.catalogue_objects import decode_identity, extract_objects, slot_lettering
from m3lab.geometry import MODEL_TABLE_POINTER, decode_model
from m3lab.ram import RAM_SIZE, Ram

TABLE = 0x2000


def words(*values: int) -> bytes:
    return b''.join(struct.pack('>h' if v < 0 else '>H', v) for v in values)


def image(records: dict[int, bytes], extra: dict[int, bytes] | None = None) -> Ram:
    """Model-table entries 1.. naming the records, as `$4BD10` and its word offsets do."""
    data = bytearray(RAM_SIZE)
    data[MODEL_TABLE_POINTER:MODEL_TABLE_POINTER + 4] = struct.pack('>I', TABLE)
    for entry, (address, record) in enumerate(sorted(records.items()), 1):
        data[TABLE + 2 * entry:TABLE + 2 * entry + 2] = struct.pack('>H', address - TABLE)
        data[address:address + len(record)] = record
    for address, value in (extra or {}).items():
        data[address:address + len(value)] = value
    return Ram(bytes(data))


def geometry(at: int, vertices: list[tuple[int, int, int]], faces: bytes,
             alternatives: bytes = b'') -> bytes:
    """Byte vertices, `$80` and the `$8000` word on the next even address (`$54724`),
    the alternatives (a zero length word ends them), then the default face list."""
    out = bytearray()
    for vertex in vertices:
        out += bytes(v & 0xFF for v in vertex)
    out.append(0x80)
    if (at + len(out)) & 1:
        out.append(0)
    return bytes(out) + words(-0x8000) + alternatives + words(0) + faces


TRIANGLE_VERTICES = [(0, 10, 0), (10, 0, 0), (0, 0, 10)]
# One polygon (colour 5) and one line (byte $F0: colour $0C), then the end byte.
TRIANGLE_FACES = bytes([5, 4, 8, 12, 0, 0xF0, 4, 8, 0xFF])


class SyntheticRecordTests(unittest.TestCase):
    def test_plain_record_numbers_vertices_from_one(self):
        ram = image({0x3000: geometry(0x3000, TRIANGLE_VERTICES, TRIANGLE_FACES)})
        form = decode_identity(ram, 1, {})['variants']['form=default']
        self.assertEqual(form['vertices'], [[0, 10, 0], [10, 0, 0], [0, 0, 10]])
        self.assertEqual([(f['kind'], f['colour'], f['refs']) for f in form['faces']],
                         [('polygon', 5, [1, 2, 3]), ('line', 0x0C, [1, 2])])
        self.assertEqual(form['turn'], {'kind': 'fixed'})

    def test_patch_header_colours_shared_geometry_per_record(self):
        # Two $800A records share the triangle; each patches its polygon colour byte.
        shared = 0x3100
        body = geometry(shared, TRIANGLE_VERTICES, TRIANGLE_FACES)
        colour_byte = shared + len(body) - len(TRIANGLE_FACES)
        records = {shared: body}
        for address, value in ((0x3000, 7), (0x3010, 9)):
            # value, offset from after the offset word, skip from the skip word itself
            records[address] = words(0x800A, value, colour_byte - (address + 6),
                                     shared - (address + 6))
        ram = image(records)
        colours = [decode_identity(ram, e, {})['variants']['form=default']['faces'][0]['colour']
                   for e in (1, 2)]
        self.assertEqual(colours, [7, 9])
        self.assertEqual(ram.byte(colour_byte), 5)  # the reader patches; the image keeps 5

    def test_safe_header_has_an_intact_and_a_blown_form(self):
        # $8009: the intact form reads on past the offset word; the blown one follows it.
        intact = geometry(0x3004, TRIANGLE_VERTICES, TRIANGLE_FACES)
        blown_at = 0x3004 + len(intact) + (len(intact) & 1)
        blown = geometry(blown_at, [(0, 20, 0), (20, 0, 0), (0, 0, 20)],
                         bytes([3, 4, 8, 12, 0, 0xFF]))
        record = words(0x8009, blown_at - 0x3002) + intact + b'\0' * (len(intact) & 1) + blown
        body = decode_identity(image({0x3000: record}), 1, {})
        self.assertEqual(sorted(body['variants']), ['state=blown;form=default',
                                                    'state=intact;form=default'])
        self.assertEqual(body['variants']['state=blown;form=default']['faces'][0]['colour'], 3)
        self.assertEqual(body['variants']['state=intact;form=default']['faces'][0]['colour'], 5)

    def test_articulated_vertices_are_stored_complemented(self):
        # $8001 with mode $FF: a vertex with negative Y holds ~Y and turns about the pivot.
        head = words(0x8001) + bytes([0, 0xFF, 1, 2, 3])
        record = head + geometry(0x3000 + len(head), [(0, 5, 0), (1, ~7, 1), (2, 0, 2)],
                                 bytes([1, 4, 8, 12, 0, 0xFF]))
        form = decode_identity(image({0x3000: record}), 1, {})['variants']['form=default']
        self.assertEqual(form['vertices'], [[0, 5, 0], [1, 7, 1], [2, 0, 2]])
        self.assertEqual(form['articulated'], [2])
        self.assertEqual(form['turn'], {'kind': 'articulated', 'axis': 'y',
                                        'pivot': [1, 2, 3], 'angle': '$6F38'})

    def test_viewer_selected_list_is_a_form_with_its_box(self):
        # A length word (the list's bytes after the box), six longs (min and size per
        # axis), then the alternative list.
        faces = bytes([2, 4, 8, 12, 0, 0xFF])
        alternative = words(len(faces)) + struct.pack('>6i', -5, 10, -5, 10, -5, 10) + faces
        record = geometry(0x3000, TRIANGLE_VERTICES, TRIANGLE_FACES, alternative)
        model = decode_identity(image({0x3000: record}), 1, {})
        self.assertEqual(sorted(model['variants']), ['form=default', 'form=view-1'])
        self.assertEqual(model['variants']['form=view-1']['box'],
                         {'min': [-5, -5, -5], 'size': [10, 10, 10]})
        self.assertEqual(model['variants']['form=view-1']['faces'][0]['colour'], 2)
        self.assertEqual(model['variants']['form=default']['faces'][0]['colour'], 5)

    def test_debris_header_reads_no_geometry(self):
        ram = image({0x3000: words(0x8004, 0x0002, 0x2500)})
        self.assertEqual(decode_model(ram, 1)['vertices'], [])
        body = decode_identity(ram, 1, {})
        self.assertEqual(body['variants'], {})
        self.assertIn('$639C0', body['drawsNothing'])

    def test_header_lettering_is_per_slot(self):
        self.assertEqual(slot_lettering(None, 66, {'op': 0x2})['text'], [ord('2')])
        self.assertEqual(slot_lettering(None, 31, {'op': 0x7})['text'], [ord('B')])
        self.assertEqual(slot_lettering(None, 180, {'op': 0x8, 'code': 0x4447})['text'],
                         [ord('D'), ord('G')])
        self.assertIsNone(slot_lettering(None, 44, None))


class ObjectExtractionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        run, objects = os.environ.get('M3_CENSUS_RUN'), os.environ.get('M3_OBJECTS')
        if not run or not objects:
            raise unittest.SkipTest('set M3_CENSUS_RUN and M3_OBJECTS')
        cls.extraction = extract_objects(Path(run))
        cls.scenes = json.loads((Path(objects) / 'objects.scenes.json').read_text())
        cls.ledger = load_ledger()

    def test_extraction_equals_the_ledger(self):
        recorded = {g['id']: g['sha256'] for g in self.ledger['geometry']
                    if g['family'] == 'model' and g['owner'] == 681}
        self.assertEqual({k: v['sha256'] for k, v in self.extraction['geometry'].items()}, recorded)
        self.assertEqual(len(recorded), 190)

    def test_run_time_writers_reach_further_records(self):
        names = {v['entries'][0]: v.get('name') for v in self.extraction['geometry'].values()}
        self.assertEqual((names[257], names[316], names[317]),
                         ('EXPLOSIVE-ARMED!', "BIL'S CHAIR", 'P C BIL'))
        heads = [e for e in range(259, 291)
                 if any(e in v['entries'] for v in self.extraction['geometry'].values())]
        self.assertEqual(heads, list(range(259, 291)))
        explosive = self.extraction['objects']['82']['forms']
        self.assertEqual({(f['entry'], f['geometry']) for f in explosive},
                         {(257, 'model-031864'), (258, None)})

    def test_services_bind_taxis_buses_and_heads(self):
        rows = self.extraction['services']
        self.assertEqual(sum(r['entry'] == 319 for r in rows), 32)  # BUS
        self.assertEqual(sum(r['entry'] == 318 for r in rows), 17)  # TAXI
        self.assertEqual(sum(r['slot'] < 16 for r in rows), 19)     # INTERCITY, TOURCRAFT
        bus = next(r for r in rows if r['group'] == 2 and r['slot'] == 16)
        self.assertEqual(bytes(bus['registration']), b'11')

    def test_null_and_debris_dispositions(self):
        null = [int(s) for s, o in self.extraction['objects'].items()
                if o.get('disposition') == 'null-model']
        self.assertEqual(null, [9, 10, 11, 97, 114, 214, 230])
        debris = self.extraction['geometry']['model-0317f6']
        self.assertEqual((debris['variants'], debris['nonGeometric']['kind']),
                         ({}, 'explosion-debris'))

    def test_original_scenes_cover_each_decoder_path(self):
        geometry = self.extraction['geometry']
        ops = {geometry[r['geometry']]['header']['op'] if geometry[r['geometry']]['header'] else None
               for r in self.scenes.values()}
        self.assertTrue({None, 0x1, 0x3, 0x7, 0x8, 0x9, 0xA, 0xD} <= ops, ops)
        axes = {r['variant'].split(';')[0].split('=')[0] for r in self.scenes.values()}
        self.assertEqual(axes, {'form', 'state'})
        # Every record the original drew is the opening's bytes, except the colour byte a
        # $800A header patches in shared geometry: the EXECUTIVE DESK left its 3 there.
        opening = Ram.load(Path(os.environ['M3_CENSUS_RUN']) / 'start.ram')
        for name, r in self.scenes.items():
            lo, hi = (int(a[1:], 16) for a in r['record']['range'])
            if name != 'executive-desk':
                self.assertEqual(opening.digest(lo, hi), r['record']['sha256'], name)
        self.assertEqual(opening.byte(0x30884), 10)
        self.assertGreater(min(r['objectAgreement'] for r in self.scenes.values()), 0.45)


if __name__ == '__main__':
    unittest.main()
