"""The Doorway wipe's code facts in E1 (#976), checked against the pinned disk.

E1 loads at `$40000`; offsets are file-relative. The facts pin the bytes the
research note cites, so a changed disk fails loudly instead of being misread.
See docs/research/targ-st-doorway-wipe.md.
"""
from __future__ import annotations

E1_BASE = 0x40000
FACTS = {
    # Installs the Timer B handler and the VBL handler.
    'timerBVectors': (0xca8, '23fc00042f760000012023fc000432f200000060'),
    # VBL: palette entries 8..11 for the top of the screen.
    'vblPalette': (0x3302, '23f9000623f200ff825023f9000623f600ff8254'),
    # VBL: underground ($6244C = 0) arms the split at $432CA.
    'vblArmsSplit': (0x331c, '4a790006244c67066100fd0e60146100ff9e'),
    'armSplit': (0x32ca, '3039000624e4671e13c000fffa21b03900fffa2166f2'
                         '13fc004000fffa1513fc000800fffa1b4e75'),
    # Timer B: entries 8..11 for the rows below the split, then stop the timer.
    'splitHandler': (0x2f76, '23f90006244000ff825023f90006244400ff825413fc000000fffa1b'
                             '5279000624e008b9000000fffa0f13f9000624e200fffa154e73'),
    'upWipe': (0x1b7a, '23f9000624380006244023f90006243c00062444303c008433c0000624e4'
                       '6100f26204400004670000046aec33fc0000000624e4'
                       '23f900062440000623f223f900062444000623f6'),
    'upHold': (0x1c12, '70146100f1e651c8fffa'),
    'upClear': (0x1c5a, '33fc0000000624484e75'),
    'downHold': (0x1d04, '70186100f0f451c8fffa'),
    'downWipe': (0x1d5e, '23f9000623f20006244023f9000623f60006244433f90006243c000623f2'
                         '33f90006243c000623f433f90006243c000623f633f90006243c000623f8'
                         '303c000233c0000624e46100f056064000040c4000866dec'
                         '33fc0000000624e423f900062438000623f223f90006243c000623f6'),
    'downClear': (0x1e0c, '33fc0000000624484e75'),
    'flipDispatch': (0x8b10, '4a390006244867266a0661009148601e33f9000623f6000623f2'
                             '33f9000623f6000623f433f9000623f6000623f84e71'),
    'flipThenUp': (0x8b40, '10390006234113c000ff82010a00000113c000062341303900000468'
                           'b0790000046867f84e714a3900062448670461008f7e'),
    'doorFlag': (0x5058, '4a006b043e0360023e020c47010064060a07008060027e00'
                         'e41cb9070007007f13c700062448'),
    'roomPalette': (0x4d44, '13d90006243c13d90006243d13d90006243e13d90006243f33fc077700062438'),
    'mainLoopFlip': (0x8ab6, '61000058'),
    'doorCheck': (0x8998, '241266206100c624'),
}

# The split row sequences the two loops write to $624E4, one per Vsync.
UP_ROWS = tuple(range(0x84, 0, -4))      # 132, 128, ..., 4
DOWN_ROWS = tuple(range(0x02, 0x86, 4))  # 2, 6, ..., 130


def check_code(code: bytes) -> list[dict]:
    facts = []
    for name, (at, expected) in FACTS.items():
        if code[at:at + len(expected) // 2] != bytes.fromhex(expected):
            raise ValueError(f'E1 ${at:X}: changed {name} path')
        facts.append({'name': name, 'address': f'${E1_BASE + at:X}', 'bytes': expected})
    return facts


def direction_flag(door: int, x: int, z: int, heading: int) -> int:
    """The byte `$45058..$45078` stores in `$62448`; bit 7 set wipes downward.

    `door` is the Doorway record's flag byte (bit 7 picks the x axis), `x` and
    `z` the words at `$623A8` and `$623B0`, `heading` the word at `$6234C`.
    """
    d7 = x if door & 0x80 else z
    d7 = ((d7 & 0xff) ^ 0x80) if d7 < 0x100 else 0
    d4 = ((heading + 0x280) & 0xffff) >> 8
    d4 = ((d4 >> 2) | (d4 << 6)) & 0xff  # ror.b #2
    return ((d7 ^ d4) | 0x7f) & 0xff
