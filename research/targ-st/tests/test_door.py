"""Doorway wipe facts (#976) and the 68000 disassembler."""
import unittest

from targlab import disk, door, m68k
from test_title import PRESENT


def lines(hex_bytes: str, base: int = 0x1000) -> list[str]:
    data = bytes.fromhex(hex_bytes)
    return [text for _, _, text in m68k.disassemble(data, base, base, base + len(data))]


class Disassembler(unittest.TestCase):
    def test_wipe_loop_reads_as_written(self):
        # $41B8E..$41BA6: the upward wipe's loop.
        self.assertEqual(lines('303c008433c0000624e46100f26204400004670000046aec', 0x41b8e), [
            'move.w #$84,d0', 'move.w d0,$624e4.l', 'bsr.w $40dfc',
            'subi.w #$4,d0', 'beq.w $41ba6', 'bpl.s $41b92'])

    def test_timer_b_handler(self):
        self.assertEqual(lines('23f90006244000ff825013fc000000fffa1b4e73'), [
            'move.l $62440.l,$ff8250.l', 'move.b #$0,$fffa1b.l', 'rte'])

    def test_common_forms(self):
        self.assertEqual(lines('48e7fffe4cdf7fff51c8fffa70ff4e4e3f3c0025'), [
            'movem.l d0-d7/a0-a6,-(a7)', 'movem.l (a7)+,d0-d7/a0-a6',
            'dbra d0,$1004', 'moveq #-$1,d0', 'trap #14', 'move.w #$25,-(a7)'])
        self.assertEqual(lines('e41cb9070007007f4a317000c141'), [
            'ror.b #2,d4', 'eor.b d4,d7', 'ori.b #$7f,d7', 'tst.b $0(a1,d7.w)', 'exg d0,d1'])

    def test_unknown_word_is_data_and_decoding_resumes(self):
        self.assertEqual(lines('ffff4e75'), ['dc.w $ffff', 'rts'])

    def test_truncated_instruction_is_data(self):
        self.assertEqual(lines('303c'), ['dc.w $303c'])


class Direction(unittest.TestCase):
    def test_bit_seven_follows_side_and_heading(self):
        self.assertEqual(door.direction_flag(0x00, 0, 0x0040, 0x0000), 0x7f)
        self.assertEqual(door.direction_flag(0x00, 0, 0x00c0, 0x0000), 0xff)
        self.assertEqual(door.direction_flag(0x80, 0x0040, 0, 0x0200), 0xff)
        self.assertEqual(door.direction_flag(0x00, 0, 0x0400, 0x0000), 0xff)

    def test_split_rows(self):
        self.assertEqual((door.UP_ROWS[0], door.UP_ROWS[-1], len(door.UP_ROWS)), (132, 4, 33))
        self.assertEqual((door.DOWN_ROWS[0], door.DOWN_ROWS[-1], len(door.DOWN_ROWS)), (2, 130, 33))


@unittest.skipUnless(PRESENT, 'pinned STX absent')
class PinnedDoor(unittest.TestCase):
    def test_code_facts_hold_on_the_pinned_disk(self):
        facts = door.check_code(disk.pinned_floppy().read('E1'))
        self.assertEqual(len(facts), len(door.FACTS))

    def test_changed_bytes_are_refused(self):
        code = bytearray(disk.pinned_floppy().read('E1'))
        code[0x1b8f] ^= 1
        with self.assertRaises(ValueError):
            door.check_code(bytes(code))


if __name__ == '__main__':
    unittest.main()
