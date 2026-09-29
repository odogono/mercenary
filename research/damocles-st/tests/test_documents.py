import hashlib
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from damocleslab.documents import (  # noqa: E402
    DOCUMENT_BANK,
    OPEN_TABLE,
    OPEN_TABLE_END,
    document,
    extract,
    open_rows,
)

REPOSITORY = Path(__file__).resolve().parents[3]
PINNED = (Path(__file__).resolve().parents[1] / 'work'
          / 'observe-first-world-20260818T101013Z-c5a32b7d' / 'observed.ram')
PINNED_SHA256 = 'b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967'


def put_document(data: bytearray, index: int, start: int, items: list[bytes]) -> None:
    body = b''.join(item + b'\x00' for item in items)
    data[DOCUMENT_BANK + index:DOCUMENT_BANK + index + 2] = (start - DOCUMENT_BANK).to_bytes(2, 'big')
    length = 1 + len(body)
    data[start:start + 2] = length.to_bytes(2, 'big')
    data[start + 2:start + 5] = b'\x80\x20\x00'
    data[start + 5:start + 5 + len(body)] = body
    data[start + length + 4] = 0x80


def image() -> bytearray:
    """A synthetic table of a document row, a switch row and 27 filler rows, and one document."""
    data = bytearray(0x08_0000)
    rows = [bytes([0x97, 2, 0x02, 0, 0x00, 0x36, 0x02, 0x57]),
            bytes([0x5D, 6, 0x00, 0, 0x00, 0x00, 0x00, 0x00])]
    rows += [bytes([0x10 + n, 3, 0, 0, 0, 0, 0, 0]) for n in range(27)]
    data[OPEN_TABLE:OPEN_TABLE_END] = b''.join(rows)
    put_document(data, 0x02, DOCUMENT_BANK + 0x40, [b'PROBLEM THE COMET', b'HISTORY  A COMMITTEE'])
    return data


class OpenTableTests(unittest.TestCase):
    def test_rows_run_to_the_zero_slot(self):
        rows = open_rows(image())
        self.assertEqual(len(rows), 29)
        self.assertEqual((rows[0]['slot'], rows[0]['mode'], rows[0]['index']), (0x97, 2, 2))
        self.assertEqual((rows[0]['colour15'], rows[0]['colour3']), (0x036, 0x257))

    def test_a_table_that_ends_early_is_refused(self):
        data = image()
        data[OPEN_TABLE + 8 * 5] = 0
        with self.assertRaises(ValueError):
            open_rows(data)


class DocumentTests(unittest.TestCase):
    def test_items_split_an_eight_character_name_from_the_body(self):
        entry = document(image(), 0x02)
        self.assertEqual([(item['name'], item['body']) for item in entry['items']],
                         [('PROBLEM ', 'THE COMET'), ('HISTORY ', ' A COMMITTEE')])

    def test_a_terminator_off_the_length_is_refused(self):
        data = image()
        start = DOCUMENT_BANK + 0x40
        data[start + 1] -= 1
        with self.assertRaises(ValueError):
            document(data, 0x02)

    def test_a_byte_outside_the_message_glyphs_is_refused(self):
        data = image()
        data[DOCUMENT_BANK + 0x40 + 5 + 9] = 0x61
        with self.assertRaises(ValueError):
            document(data, 0x02)

    def test_only_document_rows_are_published(self):
        documents = extract(image(), {})['documents']
        self.assertEqual([(d['slot'], d['index']) for d in documents], [(0x97, 2)])


@unittest.skipUnless(PINNED.is_file(), 'pinned first-world RAM not present')
class PinnedTests(unittest.TestCase):
    def test_the_payload_reproduces_from_the_pinned_capture(self):
        data = PINNED.read_bytes()
        self.assertEqual(hashlib.sha256(data).hexdigest(), PINNED_SHA256)
        payload = json.loads((REPOSITORY / 'payload/damocles/documents.json').read_text())
        self.assertEqual(extract(data, payload['source']), payload)

    def test_the_bank_holds_nineteen_documents_of_ninety_three_items(self):
        payload = extract(PINNED.read_bytes(), {})
        self.assertEqual(len(payload['documents']), 19)
        self.assertEqual(sum(len(d['items']) for d in payload['documents']), 93)
        self.assertEqual(payload['bank']['sha256'],
                         'a83b5f2b1d392643861c6c3bb42a4898606ecc3b283733f43c28065cefef45da')


if __name__ == '__main__':
    unittest.main()
