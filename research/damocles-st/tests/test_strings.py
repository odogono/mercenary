import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from damocleslab.script import BANK_BASE, DEFAULT_END, DEFAULT_START, SCRIPT_TABLE_BASE, STRING_TABLE_BASE
from damocleslab.strings import extract, inline_messages, pool_end, read_record, system_strings

POOL = 0x07_2D2E


def bank() -> bytearray:
    """A synthetic script bank with the two tables, a code region and a string pool."""
    data = bytearray(0x07_4000)
    # Every unused slot shares one target, as the Working Authority's tables do.
    for slot in range(64):
        write_word(data, STRING_TABLE_BASE + slot * 2, POOL - BANK_BASE)
        write_word(data, SCRIPT_TABLE_BASE + slot * 2, 0x03_FC)
    data[POOL:POOL + 6] = b'SPARE\x00'
    return data


def write_word(data: bytearray, address: int, value: int) -> None:
    data[address:address + 2] = value.to_bytes(2, 'big')


def put_string(data: bytearray, slot: int, address: int, text: str) -> None:
    write_word(data, STRING_TABLE_BASE + slot * 2, address - BANK_BASE)
    data[address:address + len(text) + 1] = text.encode('ascii') + b'\x00'


def put_script(data: bytearray, slot: int, address: int, body: bytes) -> None:
    write_word(data, SCRIPT_TABLE_BASE + slot * 2, address - BANK_BASE)
    data[address:address + len(body)] = body


def message(text: str) -> bytes:
    """One `$01` inline message: the opcode word, the text, its terminator and word padding."""
    body = b'\x00\x01' + text.encode('ascii') + b'\x00'
    return body + b'\x00' * (len(body) % 2)


RETURN = b'\x00\x05'


class SystemStringTests(unittest.TestCase):
    def test_every_slot_resolves_and_repeated_pointers_share_one_record(self):
        data = bank()
        put_string(data, 0, POOL + 0x10, '  LOCKED  ')
        entries = system_strings(data, pool_end(data))
        self.assertEqual(len(entries), 64)
        self.assertEqual(entries[0]['id'], 'system-string-0')
        self.assertEqual(entries[0]['text'], '  LOCKED  ')
        self.assertEqual(entries[0]['address'], f'0x{POOL + 0x10:06x}')
        shared = {entry['sha256'] for entry in entries[1:]}
        self.assertEqual(len(shared), 1)

    def test_padding_is_stored_rather_than_stripped(self):
        data = bank()
        put_string(data, 3, POOL + 0x10, '   ' + ' ' * 46)
        entries = system_strings(data, pool_end(data))
        self.assertEqual(entries[3]['text'], ' ' * 49)

    def test_an_unterminated_record_fails_closed(self):
        data = bytearray(b'A' * 0x100)
        with self.assertRaisesRegex(ValueError, 'unterminated string record'):
            read_record(data, 0, len(data))

    def test_a_record_outside_printable_ascii_fails_closed(self):
        data = bytearray(b'AB\x1bC\x00')
        with self.assertRaisesRegex(ValueError, 'not printable ASCII'):
            read_record(data, 0, len(data))


class InlineMessageTests(unittest.TestCase):
    def test_messages_are_named_by_their_script_slot_and_ordinal(self):
        data = bank()
        put_script(data, 2, 0x07_0200, message('FIRST') + message('SECOND') + RETURN)
        messages, references, unslotted = inline_messages(data, DEFAULT_START, DEFAULT_END)
        self.assertEqual([entry['id'] for entry in messages],
                         ['script2-inline-1', 'script2-inline-2'])
        self.assertEqual([entry['text'] for entry in messages], ['FIRST', 'SECOND'])
        self.assertEqual([entry['scriptAddress'] for entry in messages], ['0x070200'] * 2)
        self.assertEqual((references, unslotted), ([], 0))

    def test_a_shared_record_belongs_to_the_lowest_reaching_slot(self):
        data = bank()
        shared = 0x07_0400
        # Two scripts jump into one message, which is how the bank shares text.
        put_script(data, 7, 0x07_0200, b'\x00\x03' + (shared - BANK_BASE).to_bytes(2, 'big'))
        put_script(data, 4, 0x07_0300, b'\x00\x03' + (shared - BANK_BASE).to_bytes(2, 'big'))
        put_script(data, 9, shared, message('SHARED') + RETURN)
        messages, _, _ = inline_messages(data, DEFAULT_START, DEFAULT_END)
        self.assertEqual([entry['id'] for entry in messages], ['script4-inline-1'])

    def test_an_entry_outside_the_table_is_named_by_its_address(self):
        data = bank()
        put_script(data, 0, 0x07_0110, message('BRIEFING') + RETURN)
        # Unbind the slot again: the entry is now reachable only as a lab default entry.
        write_word(data, SCRIPT_TABLE_BASE, 0x03_FC)
        messages, _, unslotted = inline_messages(data, DEFAULT_START, DEFAULT_END)
        self.assertEqual([entry['id'] for entry in messages], ['script070110-inline-1'])
        self.assertEqual(unslotted, 1)

    def test_an_indexed_reference_resolves_to_a_system_string_slot(self):
        data = bank()
        put_script(data, 2, 0x07_0200, b'\x00\x14\x00\x32' + RETURN)
        _, references, _ = inline_messages(data, DEFAULT_START, DEFAULT_END)
        self.assertEqual(references,
                         [{'address': '0x070200', 'operand': 50, 'target': 'system-string-50'}])

    def test_an_indirect_reference_is_recorded_without_a_target(self):
        data = bank()
        # $14 doubles its operand; at or above $01E0 the slot comes from $7A42 first.
        put_script(data, 2, 0x07_0200, b'\x00\x14\x01\x00' + RETURN)
        _, references, _ = inline_messages(data, DEFAULT_START, DEFAULT_END)
        self.assertIsNone(references[0]['target'])


class DocumentTests(unittest.TestCase):
    def test_the_document_counts_its_own_coverage(self):
        data = bank()
        put_string(data, 50, POOL + 0x10, ' ' * 49)
        put_script(data, 2, 0x07_0200, message('FIRST') + b'\x00\x14\x00\x32' + RETURN)
        document = extract(data, {'run': 'synthetic'}, pool_end=pool_end(data))
        self.assertEqual(document['schemaVersion'], 1)
        self.assertEqual(document['encoding']['terminator'], 0)
        self.assertEqual(document['encoding']['unsupportedRecords'], 0)
        self.assertFalse(document['coverage']['complete'])
        self.assertEqual(len(document['systemStrings']['entries']), 64)
        self.assertEqual([entry['id'] for entry in document['inlineMessages']],
                         ['script2-inline-1'])
        self.assertEqual(document['indexedReferences'][0]['target'], 'system-string-50')
        self.assertEqual(document['statistics']['inlineLengthMinimum'], 5)


if __name__ == '__main__':
    unittest.main()
