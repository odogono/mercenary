"""Synthetic model-owner/replay controls, not ordinary route evidence."""
import importlib.util
from pathlib import Path
import unittest
from copy import deepcopy
from m3lab.ram import Ram

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/hq-model-evidence.py'
spec = importlib.util.spec_from_file_location('hq_model', SCRIPT)
model = importlib.util.module_from_spec(spec)
spec.loader.exec_module(model)


class HQModelTests(unittest.TestCase):
    def owners(self, changed=False):
        return dict(modelWords={'97':15722 if changed else 776,'218':33608 if changed else 34068},
                    objects={'97':dict(state=4 if changed else 20),
                             '218':dict(state=4),'224':dict(state=14 if changed else 30)},
                    modelSwapStateBits=65535 if changed else 0)

    def test_model_a_separates_model_bindings_and_actual_handling_targets(self):
        before,after=self.owners(),self.owners(True)
        model.verify_model_a(before,after)
        for field,value in [('modelWords',before['modelWords']),
                            ('modelSwapStateBits',0),
                            ('objects',{'97':dict(state=20),'218':dict(state=4),'224':dict(state=14)}),
                            ('objects',{'97':dict(state=4),'218':dict(state=4),'224':dict(state=30)}),
                            ('objects',{'97':dict(state=4),'218':dict(state=132),'224':dict(state=14)})]:
            corrupted=deepcopy(after);corrupted[field]=value
            with self.subTest(field=field),self.assertRaises(ValueError):
                model.verify_model_a(before,corrupted)

    def test_live_binding_reads_current_table_separately_from_object_state(self):
        raw=bytearray(0x100000);raw[0x56D6:0x56DA]=(0x56D6).to_bytes(4,'big')
        raw[0x4BD10:0x4BD14]=(0x2EAB8).to_bytes(4,'big')
        for slot,word in [(97,15722),(218,33608)]:
            address=0x2EAB8+2*slot;raw[address:address+2]=word.to_bytes(2,'big')
        for slot,state in [(97,4),(218,4),(224,14)]:raw[0x641E+4*slot]=state
        raw[0x6E84:0x6E86]=(65535).to_bytes(2,'big')
        row=model.observe(Ram(bytes(raw),'synthetic-model-a'))
        self.assertEqual(row['modelWords'],{'97':15722,'218':33608})
        self.assertEqual(row['objects']['218']['state'],4)
        self.assertEqual(row['objects']['224']['state'],14)
        self.assertEqual(row['modelTablePointer'],0x2EAB8)

    def test_campaign49_has_independent_second_long_owner(self):
        raw=bytearray(0x100000);raw[0x56D6:0x56DA]=(0x56D6).to_bytes(4,'big')
        raw[0x7274:0x7278]=(1<<17).to_bytes(4,'big')
        row=model.observe(Ram(bytes(raw),'synthetic-flag49'))
        self.assertTrue(row['campaignFlags']['49'])
        self.assertFalse(row['campaignFlags']['22'])

    def test_resident_acquisition_preserves_unrelated_bits_and_independent_stack(self):
        for slot,state in [(97,4),(218,4),(224,14)]:
            before=dict(held=[38],stack=[32,31],objects={str(slot):dict(state=state,residence=[100,15,10,18])})
            after=dict(held=[38,slot],stack=[slot,32,31],objects={str(slot):dict(state=state|128,residence=[120,1,0,16])})
            model.verify_resident_acquisition(before,after,slot)
            for corrupted in [dict(after,stack=[32,31]),dict(after,held=[38]),
                              dict(after,objects={str(slot):dict(state=128,residence=[120,1,0,16])})]:
                with self.subTest(slot=slot),self.assertRaises(ValueError):
                    model.verify_resident_acquisition(before,corrupted,slot)

    def test_future_rejects_unobserved_binding_or_ram_changes(self):
        original=Ram(bytes(0x100000),'synthetic-original')
        model.verify_future(original,original)
        for address in [0x2EB7A,0x90000]:
            changed=bytearray(original.data);changed[address]=1
            with self.subTest(address=address),self.assertRaises(ValueError):
                model.verify_future(original,Ram(bytes(changed),'foreign-future'))


if __name__ == '__main__':
    unittest.main()
