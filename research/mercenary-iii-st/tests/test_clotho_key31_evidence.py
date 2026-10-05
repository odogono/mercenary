"""Synthetic controls for the observer; no ordinary route is supplied here."""
import importlib.util
from pathlib import Path
import unittest

from m3lab.ram import Ram

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/clotho-key31-evidence.py'
spec = importlib.util.spec_from_file_location('clotho_evidence', SCRIPT)
clotho = importlib.util.module_from_spec(spec)
spec.loader.exec_module(clotho)


class ClothoEvidenceTests(unittest.TestCase):
    def ram(self, fields):
        raw = bytearray(0x100000)
        raw[0x56D6:0x56DA] = (0x56D6).to_bytes(4, 'big')
        for address, width, value in fields:
            raw[address:address+width] = value.to_bytes(width, 'big')
        return Ram(bytes(raw), 'synthetic-clotho-control')

    def test_key_held_stack_and_world_residence_remain_independent(self):
        row = clotho.observe(self.ram([(0x649A,1,133),(0x6898,4,0x18040001),
                                      (0x563C,2,1),(0x563E,1,181),(0x66F2,1,132)]))
        self.assertTrue(row['keyHeld']['31'])
        self.assertEqual(row['stack'], [181])
        self.assertEqual(row['objects']['31']['residence'], [24,4,0,1])
        self.assertEqual(row['objects']['181']['state'],132)

    def test_signed_programme_request_does_not_replace_budget_or_pool(self):
        row = clotho.observe(self.ram([(0x6FF48,2,0xFFE3),(0x6E8C,2,4),
                                      (0x6E86,2,0xFFFF),(0x6E6C,2,0x0001),
                                      (0x6E6E,2,0x04FE),(0x5492+4*56,2,0x1234)]))
        self.assertEqual(row['programme']['requestBits'],0xFFE3)
        self.assertEqual(row['programme']['budget'],4)
        self.assertEqual(row['programme']['pairs'][14:16],[[0,1],[4,254]])
        self.assertEqual(row['actors'][0]['stateBits'],0x1234)

    def test_native_reentry_requires_transition_marker_and_selector_change(self):
        rows = [dict(label='TOP',frame=11,ticks=65540,selector=2),
                dict(label='BODY_ENTER',frame=11,ticks=65540,selector=2),
                dict(label='TOP',frame=11,ticks=65540,selector=0),
                dict(label='TOP',frame=12,ticks=65551,selector=0)]
        self.assertEqual(clotho.trace_phases(rows,10,65529)['zeroTickReentries'],1)
        for bad in ([rows[0],rows[2],rows[1],rows[3]], [rows[0],*rows[2:]], [rows[0],rows[1],dict(rows[2],selector=2),rows[3]],
                    [rows[0],rows[1],dict(rows[2],ticks=65541),rows[3]]):
            with self.subTest(rows=bad), self.assertRaises(ValueError):
                clotho.trace_phases(bad,10,65529)

    def test_restored_source_traces_and_full_tick_phase_are_checked(self):
        rows = [dict(label='DOOR_KEY',frame=10,ticks=65529,selector=1),
                dict(label='TOP',frame=11,ticks=65540,selector=1)]
        self.assertEqual(clotho.trace_phases(rows,10,65529)['restoredSourceTraceCount'],1)
        for bad in ([dict(rows[0],ticks=9),rows[1]], [rows[1],rows[0]],
                    [dict(rows[1],frame=12)]):
            with self.subTest(rows=bad), self.assertRaises(ValueError):
                clotho.trace_phases(bad,10,65529)

    def test_restored_future_compares_every_ram_byte(self):
        original = self.ram([(0x7180,2,42),(0x53094,4,65540)])
        self.assertEqual(clotho.verify_future(original, original)['bytesCompared'],0x100000)
        for address in (0x7146,0xFFFFF):
            changed = bytearray(original.data)
            changed[address] ^= 1
            with self.subTest(address=address), self.assertRaises(ValueError):
                clotho.verify_future(original,Ram(bytes(changed),'changed'))

    def test_door_summary_keeps_each_attachment_key_and_branch_paired(self):
        rows = [dict(label='DOOR_KEY',frame=10,ticks=100,registers=dict(A0=592,D6=0x1234007c)),
                dict(label='DOOR_LOCKED',frame=10,ticks=100,registers=dict(A0=588,D6=128)),
                dict(label='DOOR_KEY',frame=11,ticks=111,registers=dict(A0=588,D6=128)),
                dict(label='DOOR_KEY',frame=12,ticks=122,registers=dict(A0=592,D6=124))]
        summary = clotho.door_summary(rows)
        self.assertEqual(summary['DOOR_LOCKED']['pairs'],[
            dict(attachmentOffset=588,heldOffset=128,count=1,firstPhase=[10,100],lastPhase=[10,100])])
        self.assertEqual(summary['DOOR_KEY']['pairs'][1],
            dict(attachmentOffset=592,heldOffset=124,count=2,firstPhase=[10,100],lastPhase=[12,122]))

    def test_input_provenance_refuses_supplied_target_pose_and_held(self):
        clotho.hq.verify_commands(['r sr=$2700','w $56726 $0b','w $7056 $04'],3)
        for line in ('w $6fb2 $00 $00 $00 $18','w $7146 $00', 'w $649a $85', 'r pc=$5a15e'):
            with self.subTest(line=line), self.assertRaises(ValueError):
                clotho.hq.verify_commands([line],3)


if __name__ == '__main__':
    unittest.main()
