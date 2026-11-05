"""A small 68000 disassembler for reading E1 code windows (standard library only).

It covers the user-mode 68000 instruction set plus the SR/CCR and USP forms the
game uses. Anything else prints as `dc.w`, and decoding resumes after it. It
is a reading aid: research notes still cite the raw bytes it prints.

    python3 -m targlab disasm 41AEE:41C64        # E1 from the pinned disk
    python3 -m targlab disasm --ram RAM 432F8:4338E
"""
from __future__ import annotations

import struct

SIZES = {0: 'b', 1: 'w', 2: 'l'}
CONDITIONS = ['t', 'f', 'hi', 'ls', 'cc', 'cs', 'ne', 'eq',
              'vc', 'vs', 'pl', 'mi', 'ge', 'lt', 'gt', 'le']


class Invalid(Exception):
    pass


class Reader:
    def __init__(self, data: bytes, base: int, at: int):
        self.data, self.base, self.at = data, base, at

    def word(self) -> int:
        offset = self.at - self.base
        if offset < 0 or offset + 2 > len(self.data):
            raise Invalid
        self.at += 2
        return struct.unpack_from('>H', self.data, offset)[0]

    def signed(self) -> int:
        w = self.word()
        return w - 0x10000 if w & 0x8000 else w

    def long(self) -> int:
        return self.word() << 16 | self.word()


def hexs(value: int) -> str:
    return f'-${-value:x}' if value < 0 else f'${value:x}'


def immediate(r: Reader, size: str) -> str:
    if size == 'b':
        return f'#${r.word() & 0xff:x}'
    return f'#${r.word():x}' if size == 'w' else f'#${r.long():x}'


def extension(r: Reader, base: str) -> str:
    ext = r.word()
    index = ('a' if ext & 0x8000 else 'd') + str(ext >> 12 & 7) + ('.l' if ext & 0x800 else '.w')
    d = ext & 0xff
    d = d - 0x100 if d & 0x80 else d
    # The 68000 ignores bits 8-10 (the 68020's scale and full-format bits).
    return f'{hexs(d)}({base},{index})'


def ea(r: Reader, mode: int, reg: int, size: str = 'w') -> str:
    if mode == 0:
        return f'd{reg}'
    if mode == 1:
        return f'a{reg}'
    if mode == 2:
        return f'(a{reg})'
    if mode == 3:
        return f'(a{reg})+'
    if mode == 4:
        return f'-(a{reg})'
    if mode == 5:
        return f'{hexs(r.signed())}(a{reg})'
    if mode == 6:
        return extension(r, f'a{reg}')
    if reg == 0:
        return f'${r.word():x}.w'
    if reg == 1:
        return f'${r.long():x}.l'
    if reg == 2:
        at = r.at
        return f'${at + r.signed():x}(pc)'
    if reg == 3:
        return extension(r, 'pc')
    if reg == 4:
        return immediate(r, size)
    raise Invalid


def register_list(mask: int, reverse: bool) -> str:
    if reverse:
        mask = int(f'{mask:016b}'[::-1], 2)
    names = [f'd{n}' for n in range(8)] + [f'a{n}' for n in range(8)]
    parts, n = [], 0
    while n < 16:
        if mask >> n & 1:
            end = n
            while end + 1 < 16 and end + 1 != 8 and mask >> (end + 1) & 1:
                end += 1
            parts.append(names[n] if end == n else f'{names[n]}-{names[end]}')
            n = end + 1
        else:
            n += 1
    return '/'.join(parts)


def decode(r: Reader) -> str:
    op = r.word()
    top = op >> 12
    mode, reg = op >> 3 & 7, op & 7
    dreg = op >> 9 & 7
    size2 = op >> 6 & 3

    if top == 0:
        special = {0x003c: 'ori.b {},ccr', 0x007c: 'ori.w {},sr', 0x023c: 'andi.b {},ccr',
                   0x027c: 'andi.w {},sr', 0x0a3c: 'eori.b {},ccr', 0x0a7c: 'eori.w {},sr'}
        if op in special:
            return special[op].format(immediate(r, special[op][5]))
        if op & 0x0100 or (op & 0x0f00) == 0x0800:
            if mode == 1:
                size = 'l' if op & 0x40 else 'w'
                memory = f'{hexs(r.signed())}(a{reg})'
                if op & 0x80:
                    return f'movep.{size} d{dreg},{memory}'
                return f'movep.{size} {memory},d{dreg}'
            name = ['btst', 'bchg', 'bclr', 'bset'][size2]
            source = f'd{dreg}' if op & 0x0100 else f'#${r.word() & 0xff:x}'
            return f'{name} {source},{ea(r, mode, reg, "b")}'
        names = {0: 'ori', 1: 'andi', 2: 'subi', 3: 'addi', 5: 'eori', 6: 'cmpi'}
        if dreg in names and size2 != 3:
            size = SIZES[size2]
            source = immediate(r, size)
            return f'{names[dreg]}.{size} {source},{ea(r, mode, reg, size)}'
        raise Invalid

    if top in (1, 2, 3):
        size = {1: 'b', 3: 'w', 2: 'l'}[top]
        source = ea(r, mode, reg, size)
        dmode = op >> 6 & 7
        if dmode == 1:
            if size == 'b':
                raise Invalid
            return f'movea.{size} {source},a{dreg}'
        return f'move.{size} {source},{ea(r, dmode, dreg, size)}'

    if top == 4:
        if op == 0x4e71:
            return 'nop'
        if op == 0x4e75:
            return 'rts'
        if op == 0x4e73:
            return 'rte'
        if op == 0x4e77:
            return 'rtr'
        if op == 0x4e76:
            return 'trapv'
        if op == 0x4afc:
            return 'illegal'
        if op == 0x4e70:
            return 'reset'
        if op == 0x4e72:
            return f'stop #${r.word():x}'
        if op & 0xfff0 == 0x4e40:
            return f'trap #{op & 15}'
        if op & 0xfff8 == 0x4e50:
            return f'link a{reg},#{hexs(r.signed())}'
        if op & 0xfff8 == 0x4e58:
            return f'unlk a{reg}'
        if op & 0xfff8 == 0x4e60:
            return f'move.l a{reg},usp'
        if op & 0xfff8 == 0x4e68:
            return f'move.l usp,a{reg}'
        if op & 0xfff8 == 0x4840:
            return f'swap d{reg}'
        if op & 0xfff8 == 0x4880:
            return f'ext.w d{reg}'
        if op & 0xfff8 == 0x48c0:
            return f'ext.l d{reg}'
        if op & 0xffc0 == 0x4e80:
            return f'jsr {ea(r, mode, reg)}'
        if op & 0xffc0 == 0x4ec0:
            return f'jmp {ea(r, mode, reg)}'
        if op & 0xffc0 == 0x4840:
            return f'pea {ea(r, mode, reg)}'
        if op & 0xfb80 == 0x4880:
            size = 'l' if op & 0x40 else 'w'
            mask = r.word()
            if op & 0x0400:
                return f'movem.{size} {ea(r, mode, reg, size)},{register_list(mask, False)}'
            return f'movem.{size} {register_list(mask, mode == 4)},{ea(r, mode, reg, size)}'
        if op & 0xf1c0 == 0x41c0:
            return f'lea {ea(r, mode, reg)},a{dreg}'
        if op & 0xf1c0 == 0x4180:
            return f'chk.w {ea(r, mode, reg)},d{dreg}'
        if op & 0xffc0 == 0x40c0:
            return f'move.w sr,{ea(r, mode, reg)}'
        if op & 0xffc0 == 0x44c0:
            return f'move.w {ea(r, mode, reg)},ccr'
        if op & 0xffc0 == 0x46c0:
            return f'move.w {ea(r, mode, reg)},sr'
        if op & 0xffc0 == 0x4800:
            return f'nbcd {ea(r, mode, reg, "b")}'
        if op & 0xffc0 == 0x4ac0:
            return f'tas {ea(r, mode, reg, "b")}'
        names = {0x40: 'negx', 0x42: 'clr', 0x44: 'neg', 0x46: 'not', 0x4a: 'tst'}
        if op >> 8 in names and size2 != 3:
            size = SIZES[size2]
            return f'{names[op >> 8]}.{size} {ea(r, mode, reg, size)}'
        raise Invalid

    if top == 5:
        if size2 == 3:
            condition = CONDITIONS[op >> 8 & 15]
            if mode == 1:
                target = r.at + r.signed()
                return f'db{"ra" if condition == "f" else condition} d{reg},${target:x}'
            return f's{condition} {ea(r, mode, reg, "b")}'
        size = SIZES[size2]
        quick = dreg or 8
        return f'{"subq" if op & 0x100 else "addq"}.{size} #{quick},{ea(r, mode, reg, size)}'

    if top == 6:
        condition = op >> 8 & 15
        at = r.at
        displacement = op & 0xff
        if displacement == 0:
            displacement, suffix = r.signed(), 'w'
        else:
            displacement, suffix = (displacement - 0x100 if displacement & 0x80 else displacement), 's'
        name = {0: 'bra', 1: 'bsr'}.get(condition, 'b' + CONDITIONS[condition])
        return f'{name}.{suffix} ${at + displacement:x}'

    if top == 7:
        if op & 0x100:
            raise Invalid
        value = op & 0xff
        return f'moveq #{hexs(value - 0x100 if value & 0x80 else value)},d{dreg}'

    if top in (8, 12):
        opmode = op >> 6 & 7
        if opmode in (3, 7):
            name = {8: 'div', 12: 'mul'}[top] + ('s' if opmode == 7 else 'u')
            return f'{name}.w {ea(r, mode, reg)},d{dreg}'
        if op & 0x1f0 == 0x100:
            name = 'sbcd' if top == 8 else 'abcd'
            return f'{name} ' + (f'-(a{reg}),-(a{dreg})' if op & 8 else f'd{reg},d{dreg}')
        if top == 12 and op & 0x1f8 in (0x140, 0x148, 0x188):
            kind = op & 0x1f8
            if kind == 0x140:
                return f'exg d{dreg},d{reg}'
            if kind == 0x148:
                return f'exg a{dreg},a{reg}'
            return f'exg d{dreg},a{reg}'
        name = 'or' if top == 8 else 'and'
        size = SIZES[opmode & 3]
        if opmode & 4:
            return f'{name}.{size} d{dreg},{ea(r, mode, reg, size)}'
        return f'{name}.{size} {ea(r, mode, reg, size)},d{dreg}'

    if top in (9, 13):
        name = 'sub' if top == 9 else 'add'
        opmode = op >> 6 & 7
        if opmode in (3, 7):
            size = 'l' if opmode == 7 else 'w'
            return f'{name}a.{size} {ea(r, mode, reg, size)},a{dreg}'
        size = SIZES[opmode & 3]
        if opmode & 4 and mode in (0, 1):
            return f'{name}x.{size} ' + (f'-(a{reg}),-(a{dreg})' if mode else f'd{reg},d{dreg}')
        if opmode & 4:
            return f'{name}.{size} d{dreg},{ea(r, mode, reg, size)}'
        return f'{name}.{size} {ea(r, mode, reg, size)},d{dreg}'

    if top == 11:
        opmode = op >> 6 & 7
        if opmode in (3, 7):
            size = 'l' if opmode == 7 else 'w'
            return f'cmpa.{size} {ea(r, mode, reg, size)},a{dreg}'
        size = SIZES[opmode & 3]
        if opmode & 4:
            if mode == 1:
                return f'cmpm.{size} (a{reg})+,(a{dreg})+'
            return f'eor.{size} d{dreg},{ea(r, mode, reg, size)}'
        return f'cmp.{size} {ea(r, mode, reg, size)},d{dreg}'

    if top == 14:
        kinds = ['as', 'ls', 'rox', 'ro']
        direction = 'l' if op & 0x100 else 'r'
        if size2 == 3:
            if op & 0x800:
                raise Invalid
            return f'{kinds[op >> 9 & 3]}{direction}.w {ea(r, mode, reg)}'
        size = SIZES[size2]
        count = f'd{dreg}' if op & 0x20 else f'#{dreg or 8}'
        return f'{kinds[op >> 3 & 3]}{direction}.{size} {count},d{reg}'

    raise Invalid


def disassemble(data: bytes, base: int, lo: int, hi: int):
    """Yield (address, raw bytes, text) for each instruction in [lo, hi)."""
    at = lo
    while at < hi:
        r = Reader(data, base, at)
        try:
            text = decode(r)
        except Invalid:
            r = Reader(data, base, at)
            text = f'dc.w ${r.word():04x}'
        raw = data[at - base:r.at - base]
        yield at, raw, text
        at = r.at


def listing(data: bytes, base: int, lo: int, hi: int) -> str:
    return '\n'.join(f'{at:06X}  {raw.hex():<20} {text}'
                     for at, raw, text in disassemble(data, base, lo, hi))
