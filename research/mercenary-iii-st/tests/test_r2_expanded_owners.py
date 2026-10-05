"""Synthetic controls for provenance and independent R2 owner observations."""
import importlib.util
from pathlib import Path
import unittest

from m3lab.ram import Ram


SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/object-interaction-r2-expanded-owners.py'
spec = importlib.util.spec_from_file_location('expanded_r2', SCRIPT)
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class ExpandedOwnerTests(unittest.TestCase):
    def ram(self, values, stack=()):
        raw = bytearray(0x100000)
        raw[0x56D6:0x56DA] = (0x56D6).to_bytes(4, 'big')
        raw[0x563C:0x563E] = len(stack).to_bytes(2, 'big')
        raw[0x563E:0x563E+len(stack)] = bytes(stack)
        for address, width, value in values:
            raw[address:address+width] = value.to_bytes(width, 'big')
        return Ram(bytes(raw), 'synthetic-r2-control')

    def test_stack_order_card_and_script_only_held_bits_are_independent(self):
        r = self.ram([(0x64B6, 1, 128), (0x66D6, 1, 132),
                      (0x6F0E, 4, 0x68050400)], stack=(174, 104, 103, 135))
        state = audit.observe(r)
        self.assertEqual(state['stack'], [174, 104, 103, 135])
        self.assertEqual(state['held'], [38, 174])
        self.assertEqual(state['card'], [104, 5, 4, 0])
        self.assertEqual(state['objectStates']['39'], 0)

    def test_acme_retains_full_word_and_failure_is_not_normalized_to_warning(self):
        state = audit.observe(self.ram([(0x663A, 2, 0x84FF), (0x70F8, 2, 1),
                                       (0x7114, 2, 0), (0x7110, 2, 3)]))
        self.assertEqual(state['acmeWord'], 0x84FF)
        self.assertEqual((state['warning'], state['pendingAlarmOrFailure']), (0, 1))
        self.assertEqual(state['soundPriority'], 3)

    def test_signed_cleanup_keeps_queue_availability_and_nested_return_order(self):
        r = self.ram([(0x7230, 2, 0xFFFF), (0x711C, 2, 115),
                      (0x73C5, 1, 0xA0), (0x56D6, 4, 0x56CE),
                      (0x56CE, 4, 0x766D1), (0x56D2, 4, 0x75A16)])
        state = audit.observe(r)
        self.assertEqual(state['continuation'], -1)
        self.assertEqual(state['vm']['queue'], 115)
        self.assertEqual(state['vm']['availability']['115'], 0xA0)
        self.assertEqual(state['vm']['returns'], [0x766D1, 0x75A16])

    def test_foreign_capture_and_wrong_phase_are_rejected(self):
        r = self.ram([(0x7180, 2, 7), (0x53094, 4, 65540)])
        expected = dict(sha256=r.sha256, frame=7, ticks=65540)
        audit.verify_capture(r, expected, ())
        for field, replacement in (('sha256', '0'*64), ('frame', 8), ('ticks', 4)):
            with self.subTest(field=field), self.assertRaisesRegex(AssertionError, 'capture'):
                audit.verify_capture(r, {**expected, field: replacement}, ())

    def test_changed_source_reader_is_rejected_even_with_matching_capture_hash(self):
        r = self.ram([(0x100, 1, 1)])
        expected = dict(sha256=r.sha256, frame=0, ticks=0)
        original = self.ram([])
        with self.assertRaisesRegex(ValueError, 'documented'):
            audit.verify_capture(r, expected, ((0x100, 0x101, 'reader', original.digest(0x100, 0x101)),))

    def test_invalid_return_owner_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'return stack'):
            audit.observe(self.ram([(0x56D6, 4, 0x56D1)]))

    def test_original_input_audit_refuses_hidden_state_and_foreign_wait_patch(self):
        for address, value in ((0x56726, bytes([0x48])), (0x7056, bytes([2])),
                               (0xF0100, bytes([0x12, 0x34]))):
            audit.verify_write(address, value, 0x1234)
        for address, value in ((0x663A, bytes([128])), (0x56726, bytes([0, 0x48])),
                               (0xF0000, bytes([0])), (0xF0100, bytes([0x12, 0x35]))):
            with self.subTest(address=address), self.assertRaisesRegex(AssertionError, 'debugger write'):
                audit.verify_write(address, value, 0x1234)


if __name__ == '__main__':
    unittest.main()
