"""Synthetic HQ observer controls, not natural access fixtures."""
import importlib.util
from pathlib import Path
import unittest

from m3lab.ram import Ram

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/tolosa-hq-evidence.py'
spec = importlib.util.spec_from_file_location('hq_evidence', SCRIPT)
hq = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hq)


class HQEvidenceTests(unittest.TestCase):
    def ram(self, values):
        raw = bytearray(0x100000)
        raw[0x56D6:0x56DA] = (0x56D6).to_bytes(4, 'big')
        for address, width, value in values:
            raw[address:address+width] = value.to_bytes(width, 'big')
        return Ram(bytes(raw), 'synthetic-hq-control')

    def test_active_region_is_independent_of_inventory_and_candidate_proximity(self):
        r = self.ram([(0x7194, 2, 12), (0x71CC, 2, 0x4000),
                      (0x6F2C, 2, 6), (0x71F6, 2, 255)])
        row = hq.observe(r)
        self.assertEqual((row['region'], row['regionFlags']), (12, 0x4000))
        self.assertEqual(row['candidateProximity'], 255)

    def test_lift_target_travel_and_bound_floor_are_independent(self):
        row = hq.observe(self.ram([(0x7138, 2, 0), (0x7158, 2, 4),
                                  (0x6F3A, 2, 10), (0x6F3C, 2, 3), (0x6F3E, 2, 1)]))
        self.assertEqual((row['boundFloor'], row['travelFloor'], row['liftTarget']), (0, 4, 10))
        self.assertEqual(row['liftPeriodCountdown'], [3, 1])
        self.assertEqual(hq.observe(self.ram([(0x6F3A, 2, 0xFFFF)]))['liftTarget'], -1)

    def test_resolved_door_keys_and_script_held_bits_do_not_create_stack_membership(self):
        row = hq.observe(self.ram([(0x4068, 4, 0x4000001F), (0x4064, 4, 0x40000020),
                                  (0x649A, 1, 133), (0x64B6, 1, 133)]))
        self.assertEqual([d['key'] for d in row['keyDoors']], [31, 32])
        self.assertTrue(row['keyHeld']['31'])
        self.assertFalse(row['keyHeld']['32'])
        self.assertEqual(row['stack'], [])
        self.assertIn(38, row['held'])

    def test_input_audit_rejects_pose_register_and_foreign_wait_writes(self):
        hq.verify_commands(['r sr=$2700', 'r', 'w $7056 $01', 'w $56726 $30'], 7)
        for line in ('r pc=$5A006', 'r d0=$368', 'w $7146 $00',
                     'w $649a $85', 'w $f0100 $00 $08', 'loadbin foreign.ram 0'):
            with self.subTest(line=line), self.assertRaises(ValueError):
                hq.verify_commands([line], 7)

    def test_trace_phase_allows_only_restored_source_before_first_top(self):
        rows = [dict(label='DOOR_KEY', frame=23, ticks=65540),
                dict(label='TOP', frame=24, ticks=65551),
                dict(label='DOOR_LOCKED', frame=24, ticks=65551)]
        ticks, initial = hq.trace_phases(rows, 23, 65540)
        self.assertEqual(ticks, {24: 65551})
        self.assertEqual(initial, 1)
        self.assertEqual(hq.trace_phases([dict(label='FLOOR_BOUND', frame=24, ticks=65551), *rows[1:]], 23, 65540), ({24: 65551}, 0))
        for bad in ([dict(label='DOOR_KEY', frame=22, ticks=65540), *rows[1:]],
                    [dict(label='DOOR_KEY', frame=23, ticks=4), *rows[1:]],
                    [*rows, rows[0]], [rows[0], dict(label='TOP', frame=25, ticks=65562)]):
            with self.subTest(rows=bad), self.assertRaises(ValueError):
                hq.trace_phases(bad, 23, 65540)

    def test_capture_requires_full_identity_and_original_frame_tick_phase(self):
        r = self.ram([(0x7180, 2, 23), (0x53094, 4, 65540)])
        hq.verify_capture(r, r.sha256, 23, 65540)
        for sha, frame, ticks in [('0'*64, 23, 65540), (r.sha256, 24, 65540), (r.sha256, 23, 4)]:
            with self.subTest(frame=frame, ticks=ticks), self.assertRaises(ValueError):
                hq.verify_capture(r, sha, frame, ticks)


if __name__ == '__main__':
    unittest.main()
