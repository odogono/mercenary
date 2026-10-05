"""Synthetic observer controls, not ordinary DION route evidence."""
import importlib.util
from pathlib import Path
import unittest
from m3lab.ram import Ram

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/dion-key32-evidence.py'
spec = importlib.util.spec_from_file_location('dion_key32', SCRIPT)
dion = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dion)


class DionKey32Tests(unittest.TestCase):
    def ram(self, fields):
        raw = bytearray(0x100000)
        raw[0x56D6:0x56DA] = (0x56D6).to_bytes(4, 'big')
        for address,width,value in fields:
            raw[address:address+width] = value.to_bytes(width, 'big')
        return Ram(bytes(raw), 'synthetic-dion-key32')

    def test_held_key32_does_not_restore_consumed117_or_change_models(self):
        row = dion.observe(self.ram([(0x649E,1,133),(0x689C,4,0x10070044),
            (0x7352+117,1,32),(0x641E+4*97,1,20),(0x7098,2,10),
            (0x563C,2,1),(0x563E,1,31)]))
        self.assertTrue(row['keyHeld']['32'])
        self.assertEqual(row['stack'],[31])
        self.assertEqual(row['objects']['32']['residence'],[16,7,0,68])
        self.assertEqual(row['availability']['117'],32)
        self.assertEqual(row['objects']['97']['state'],20)
        self.assertEqual(row['modelSwapStateBits'],0)
        self.assertEqual(row['capacity'],10)

    def test_acquisition_requires_independent_residence_state_held_and_stack(self):
        before = dict(keyHeld={'32':False},stack=[31,181,104,103,135],
                      objects={'32':dict(state=5,residence=[16,7,0,68])})
        after = dict(keyHeld={'32':True},stack=[32,31,181,104,103,135],
                     objects={'32':dict(state=133,residence=[120,1,0,16])})
        dion.verify_acquisition(before,after,32,[16,7,0,68])
        from copy import deepcopy
        for field,value in [('keyHeld',{'32':False}),('stack',before['stack']),
                            ('objects',{'32':dict(state=5,residence=[120,1,0,16])}),
                            ('objects',{'32':dict(state=133,residence=[16,7,0,68])})]:
            corrupted=deepcopy(after);corrupted[field]=value
            with self.subTest(field=field),self.assertRaises(ValueError):
                dion.verify_acquisition(before,corrupted,32,[16,7,0,68])

    def test_pcb_acquisition_requires_independent_carried_owners(self):
        before = dict(held=[31,32,181],stack=[32,31,181],
                      objects={'218':dict(state=4,residence=[100,15,10,18])})
        after = dict(held=[31,32,181,218],stack=[218,32,31,181],
                     objects={'218':dict(state=132,residence=[120,1,0,16])})
        dion.verify_pcb_acquisition(before,after)
        from copy import deepcopy
        for field,value in [('held',before['held']),('stack',before['stack']),
                            ('objects',{'218':dict(state=133,residence=[120,1,0,16])}),
                            ('objects',{'218':dict(state=132,residence=[100,15,10,18])})]:
            corrupted=deepcopy(after);corrupted[field]=value
            with self.subTest(field=field),self.assertRaises(ValueError):
                dion.verify_pcb_acquisition(before,corrupted)

    def test_numbered_launcher_consumes_low_word_with_retained_high_bits(self):
        row = dict(label='SCRIPT_LAUNCH',registers={'D1':0x200E6})
        self.assertTrue(dion.launches(row,115))
        self.assertFalse(dion.launches(row,116))
        self.assertFalse(dion.launches(dict(row,label='SCRIPT_REQUEST'),115))

    def test_restored_future_compares_unobserved_bytes_too(self):
        original=self.ram([])
        dion.verify_future(original,original)
        changed=bytearray(original.data);changed[0x90000]=1
        with self.assertRaises(ValueError):
            dion.verify_future(original,Ram(bytes(changed),'changed-unobserved-byte'))

    def test_each_path_cursor_keeps_its_own_slot_word(self):
        row=dion.observe(self.ram([(0x523A0,2,224),(0x523A2,4,0x22D4),
            (0x523A6,2,228),(0x523A8,4,0x22EA),(0x523AC,2,232),
            (0x523AE,4,0x2318),(0x523B2,2,0)]))
        self.assertEqual([(p['slotOffset'],p['pointer']) for p in row['pathCursors'][:3]],
                         [(224,0x22D4),(228,0x22EA),(232,0x2318)])

    def test_flag22_uses_big_endian_long_bit_numbering(self):
        row=dion.observe(self.ram([(0x7270,4,(1<<22)|(1<<9))]))
        self.assertTrue(row['campaignFlags']['22'])
        self.assertTrue(row['campaignFlags']['9'])
        other=dion.observe(self.ram([(0x7272,1,64)]))
        self.assertFalse(other['campaignFlags']['22'])

    def test_parent_checkpoint_and_ram_pins_are_independent(self):
        ram = self.ram([])
        parent = dict(sha256=ram.sha256,checkpointSha256='whole-machine',frame=0,ticks=0)
        dion.verify_parent(ram,'whole-machine',parent)
        for changed in (dict(parent,sha256='foreign'),dict(parent,checkpointSha256='foreign'),
                        dict(parent,frame=1),dict(parent,ticks=1)):
            with self.subTest(parent=changed), self.assertRaises(ValueError):
                dion.verify_parent(ram,'whole-machine',changed)


if __name__ == '__main__':
    unittest.main()
