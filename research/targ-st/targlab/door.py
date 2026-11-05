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
    # In a Room the player is held $20 inside each wall; a clamp marks a wall touch.
    'wallClamp': (0x4f38, '70004a790006244c66000078720074003239000623a83439000623b0'
                          '0c4100206e06323c002070010c4200206e06343c00207001'
                          '36390006141004430020b2436f04320370013639000616100443'
                          '0020b4436f0434037001'),
    # The Doorway test: the record walk, the span, wall and heading checks, the lock.
    'doorTest': (0x4fc2, '4a790006248e66f4207900062326700072003439000623a83639000623b0'
                         '38390006234c06440280e04c5c48524810181e000207007f67c41218'
                         '3e0002470080de42e04fbe1866e43e0304470040b1076ada1e000247'
                         '00800a470080de43e04fbe1866ca3e0204470028b1076bc03e04e21f'
                         'b1076bb84a39000631e46b181e000247000f08070003670c227c0006'
                         '31bc4a3170006a32'),
    # Arrival: the destination Doorway's cell, mid-cell along its wall.
    'doorArrival': (0x4c5e, '024100ff33c00006245213f01009000623a813f0100a000623b0'
                            '143010070202008013c2000623b10a02008013c2000623a9'),
    # Destination Room 0 is the surface: a flip with the flag saved, no wipe.
    'exitToSurface': (0x4b5a, '024000ff665423fc00000009000623fc33fc000000062452610034b8'
                              '23fc000867c0000623a623fc0040f480000623aa23fc00087000000623ae'
                              '3f390006244861003fd633df00062448'),
    # A record list ended by $80 is a dark Room: entries 8, 10, 11 go to $000.
    'darkRoom': (0x4d64, '1419672c6a740c02008066764a39000631c46b1cb03900063144671433c7'
                         '0006243833c70006243c33c70006243e7e01'),
    # The lift's descent enters Room $62452 through its Doorway 0, then centres the player.
    'liftEntersRoom': (0x8140, '33fc0001000623fc303900062452720013fc0020000624926100ca00'
                               '33fc0800000623a833fc0800000623b0'),
    # One key per main-loop pass through GEMDOS Cconis/Crawcin: the BIOS buffer queues the rest.
    'keyPoll': (0x5306, '33fc00ff000624223f3c000b4e41544f4a406700ffea08f90007000624b5'
                        '3f3c00074e41544f'),
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


CELL = 0x100   # one Room grid cell in the position words
WALL = 0x20    # how far inside a wall the clamp at $44F38 holds the player
QUARTER = 0x100  # heading units per quarter turn; $0000 faces -z, $0100 -x, $0200 +z, $0300 +x


def doorways(record: bytes) -> list[dict]:
    """The Doorway records of a Room record, as `$44FC2` and `$44D64` walk them.

    A Room record is width and depth in cells (bytes 0 and 2, low 7 bits), the
    fill and line colours (bytes 3..6, palette entries 10 and 11), then 4-byte
    Doorways ended by a byte whose low 7 bits are 0; `$80` there marks a dark Room.
    """
    found, at = [], 7
    while record[at] & 0x7f:
        flag, dest, a, b = record[at:at + 4]
        found.append({'flag': flag, 'wall': 'x' if flag & 0x80 else 'z', 'room': dest,
                      'arrivalDoorway': (flag >> 4) & 7, 'lock': flag & 0x0f if flag & 8 else None,
                      'cell': (a, b)})
        at += 4
    return found


def is_dark(record: bytes) -> bool:
    at = 7 + 4 * len(doorways(record))
    return record[at] == 0x80


def doorway_at(record: bytes, x: int, z: int, heading: int) -> dict | None:
    """The Doorway `$44FC2` matches for a clamped position and heading, if any (locks aside).

    An x-wall Doorway (flag bit 7) sits in the west (x = 0) or east (x = width)
    wall: `(x + $80) >> 8` names the wall, `z >> 8` the cell, and the low byte of
    z must lie in `$40..$BF`. A z-wall Doorway sits in the north (z = 0) or south
    wall the same way, with the low byte of x in `$28..$A7`. The heading must lie
    within 45 degrees of the wall's normal, facing either way.
    """
    quarter = ((heading + 0x280) & 0xffff) >> 8
    for door in doorways(record):
        a, b = door['cell']
        if door['wall'] == 'x':
            ok = ((x + 0x80) >> 8 == a and z >> 8 == b and not (z - 0x40) & 0x80
                  and (x - 0x28) & 0x80 and quarter & 1)
        else:
            ok = (x >> 8 == a and (z + 0x80) >> 8 == b and (z - 0x40) & 0x80
                  and not (x - 0x28) & 0x80 and not quarter & 1)
        if ok:
            return door
    return None


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


def wipe(flag: int) -> str:
    """'up' (`$41AEE`) when bit 7 is clear, 'down' (`$41C64`) when set.

    On a real crossing the flag is clear when the player faces the Doorway's
    wall (walking forward through it) and set when they face away (backing
    through it), whichever wall the Doorway is in.
    """
    return 'down' if flag & 0x80 else 'up'
