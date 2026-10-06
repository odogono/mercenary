"""The pawn's immutable BCD price headers and coherent opening owners (#796)."""
import unittest

from m3lab.head import pawn_prices
from m3lab.ram import Ram, RAM_SIZE


class PawnPriceTests(unittest.TestCase):
    def test_price_aliases_and_multipliers_come_from_the_model_header(self):
        data = bytearray(RAM_SIZE)
        data[0x4BD10:0x4BD14] = (0x20000).to_bytes(4, 'big')
        for entry in (103, 104):
            data[0x20000 + 2 * entry:0x20002 + 2 * entry] = (0x1000).to_bytes(2, 'big')
        data[0x20FEC:0x20FF0] = bytes.fromhex('12345678')
        data[0x20FF0:0x21000] = b'    TAXICARD    '
        data[0x6FF0:0x6FF4] = bytes.fromhex('000f0005')
        result = pawn_prices(Ram(bytes(data)))
        self.assertEqual(result['buyMultiplier'], 15)
        self.assertEqual(result['sellMultiplier'], 5)
        self.assertEqual(result['initial'], {'previous': 0, 'price': '000000000000', 'slot': 0})
        self.assertEqual(len(result['prices']), 1)
        self.assertEqual(result['prices'][0]['entries'], [103, 104])
        self.assertEqual(result['prices'][0]['digits'], '12345678')
        self.assertEqual(result['prices'][0]['provenance']['range'], ['$20FEC', '$20FF0'])
        data[0x20FEC] = 0xFA
        with self.assertRaisesRegex(ValueError, 'invalid pawn price BCD'):
            pawn_prices(Ram(bytes(data)))
