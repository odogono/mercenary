"""Doorway wipe facts (#976) and the 68000 disassembler."""
import tempfile
import unittest
from pathlib import Path

from targlab import disk, door, door_crossing, m68k
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


# Room records read from RAM in the crossing probe (restricted/targ-st-door-976/crossing/).
ROOM_1 = bytes.fromhex('104c1003000744' '8258100c' '02090b10' '02590500' '00')
ROOM_5 = bytes.fromhex('104c1007220300' '82501004' '8249100c' '026f0310' '80')
ROOM_171 = bytes.fromhex('04031004440000' 'a2aa0405' '82ac040e' '62a90100' '82000006' '00')

# name: (record, x, z, heading at the $45078 break, destination Room, d7 there, wipe that ran)
CROSSINGS = {
    'fz-max': (ROOM_1, 0x0b54, 0x0fe0, 0x0200, 0x09, 0x7f, 'up'),
    'bz-max': (ROOM_1, 0x0b6c, 0x0fe0, 0x0000, 0x09, 0xff, 'down'),
    'fx-max': (ROOM_1, 0x0fe0, 0x0c80, 0x0300, 0x58, 0x7f, 'up'),
    'bx-max': (ROOM_1, 0x0fe0, 0x0c80, 0x0100, 0x58, 0xff, 'down'),
    'fz-min': (ROOM_1, 0x0554, 0x0020, 0x0000, 0x59, 0x7f, 'up'),
    'bz-min': (ROOM_1, 0x056c, 0x0020, 0x0200, 0x59, 0xff, 'down'),
    'dark': (ROOM_5, 0x0fe0, 0x0c80, 0x0300, 0x49, 0x7f, 'up'),
    'exit': (ROOM_171, 0x0020, 0x0680, 0x0100, 0x00, 0x7f, 'up'),
}


class Crossing(unittest.TestCase):
    def test_observed_crossings_match_the_ported_test_and_formula(self):
        for name, (record, x, z, heading, room, flag, wipe) in CROSSINGS.items():
            with self.subTest(name):
                found = door.doorway_at(record, x, z, heading)
                self.assertEqual(found['room'], room)
                self.assertEqual(door.direction_flag(found['flag'], x, z, heading), flag)
                self.assertEqual(door.wipe(flag), wipe)

    def test_forward_is_up_and_backward_is_down_on_every_wall(self):
        # Facing into the wall the Doorway is in wipes up; facing away wipes down.
        for wall_flag, x, z, into, away in ((0x02, 0x0b80, 0x0020, 0x000, 0x200),
                                            (0x02, 0x0b80, 0x0fe0, 0x200, 0x000),
                                            (0x82, 0x0020, 0x0c80, 0x100, 0x300),
                                            (0x82, 0x0fe0, 0x0c80, 0x300, 0x100)):
            for skew in (-0x7f, 0, 0x7f):
                self.assertEqual(door.wipe(door.direction_flag(wall_flag, x, z, (into + skew) & 0x3ff)), 'up')
                self.assertEqual(door.wipe(door.direction_flag(wall_flag, x, z, (away + skew) & 0x3ff)), 'down')

    def test_off_span_or_side_on_does_not_match(self):
        self.assertIsNone(door.doorway_at(ROOM_1, 0x0b54, 0x0fe0, 0x0300))  # side-on
        self.assertIsNone(door.doorway_at(ROOM_1, 0x0bc0, 0x0fe0, 0x0200))  # past the span
        self.assertIsNone(door.doorway_at(ROOM_1, 0x0b54, 0x0f00, 0x0200))  # not at the wall

    def test_records(self):
        self.assertEqual([d['room'] for d in door.doorways(ROOM_1)], [0x58, 0x09, 0x59])
        self.assertEqual([door.is_dark(r) for r in (ROOM_1, ROOM_5, ROOM_171)], [False, True, False])


class CrossingScripts(unittest.TestCase):
    def test_every_case_stays_within_hatari_breakpoint_table(self):
        # Hatari 2.6.1 keeps 16 breakpoints; the boot steps are spent before placement.
        for name, case in door_crossing.CASES.items():
            with self.subTest(name), tempfile.TemporaryDirectory() as work:
                directory = Path(work)
                door_crossing.scripts(directory, *case)
                count = lambda f: sum(l.startswith('b ') for l in (directory / f).read_text().splitlines())
                live = count('boot.ini') - 1 + sum(count(f's{i:02d}.ini') for i in range(2, 7))
                self.assertLessEqual(live, 16)
                self.assertIn('r pc=$47f92', (directory / 's01.ini').read_text())


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
