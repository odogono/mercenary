"""Recover Targ's ST panel presentation, never ST Game Semantics (ADR 0072).

Code bytes qualify the data addresses; only artwork, tables and fonts enter the
payload. All offsets below are file-relative after subtracting each load base.
"""
from __future__ import annotations

import struct

from .disk import BASELINE, Floppy, sha256

WIDTH, HEIGHT, M_BASE = 320, 64, 0x49580
FACTS = {
    'copy': (0xed4, '207c00049580227c0006d500247c0007d50022d024d8b5fc0008000066f44e75'),
    'palette': (0xcf4, '2c7c00040d46'),
    'messageFont': (0x3684, 'e74106810004faf0'),
    'numberFont': (0x3828, '227c0004fb80'),
    'compass': (0x3a38, '06800004c000'),
    'pitch': (0x3b7c, '06800004f200'),
}


def check_code(code: bytes) -> list[dict]:
    facts = []
    for name, (at, expected) in FACTS.items():
        if code[at:at + len(expected) // 2] != bytes.fromhex(expected):
            raise ValueError(f'E1 ${at:X}: changed {name} path')
        facts.append({'name': name, 'offset': at, 'bytes': expected})
    return facts


def indices(raw: bytes, height: int = HEIGHT) -> list[list[int]]:
    if len(raw) != height * 160:
        raise ValueError('visible panel must have exactly 160 bytes per row')
    return [[sum(((word >> (15 - x % 16)) & 1) << plane
                 for plane, word in enumerate(struct.unpack_from('>4H', raw, y * 160 + x // 16 * 8)))
             for x in range(WIDTH)] for y in range(height)]


def extract(floppy: Floppy) -> dict:
    code, data, loader = floppy.read('E1'), floppy.read('M'), floppy.read('ESCAPE.PRG')
    facts = check_code(code)
    art = data[:HEIGHT * 160]
    rows = indices(art)

    def provenance(start: int, length: int, file: str = 'M') -> dict:
        raw = data if file == 'M' else code
        return {'file': file, 'offset': start, 'length': length,
                'sha256': sha256(raw[start:start + length])}

    def font(address: int, characters: str, height: int) -> dict:
        at = address - M_BASE
        return {'width': 8, 'height': height,
                'glyphs': {c: [f'{b:08b}' for b in data[at + i * 8:at + i * 8 + height]]
                           for i, c in enumerate(characters)},
                'provenance': provenance(at, len(characters) * 8)}

    # Five words per slot; the second group is sixteen slots further along.
    compass_at = 0x4c000 - M_BASE
    compass = [[f'{struct.unpack_from(">H", data, compass_at + step * 10 + row * 2)[0]:016b}'
                + f'{struct.unpack_from(">H", data, compass_at + step * 10 + 160 + row * 2)[0]:016b}'
                for row in range(5)] for step in range(576)]
    ticks = [[f'{w:016b}' for w in struct.unpack_from('>4H', code, 0x3ad4 + step * 8)]
             for step in range(16)]
    pitch_at = 0x4f200 - M_BASE
    pitch = [[f'{w:016b}' for w in struct.unpack_from('>2H', data, pitch_at + row * 4)]
             for row in range(608)]
    return {
        'schemaVersion': 1, 'kind': 'targStPanel',
        'source': {'diskSha256': BASELINE['disk']['sha256'],
                   'recipe': 'research/targ-st/targlab/panel.py',
                   'qualification': 'Recovered ST presentation over C64-authoritative Targ state; ADR 0072.',
                   'files': {name: {'size': len(raw), 'sha256': sha256(raw)}
                             for name, raw in [('ESCAPE.PRG', loader), ('E1', code), ('M', data)]},
                   'facts': facts},
        'art': {'width': WIDTH, 'height': HEIGHT, 'screenY': 136,
                'length': len(art), 'planarSha256': sha256(art),
                'indicesSha256': sha256(bytes(p for row in rows for p in row)),
                'rows': [''.join(f'{p:x}' for p in row) for row in rows],
                'provenance': provenance(0, len(art)),
                'copyLength': 0x2b00, 'excludedTail': 768},
        'palette': {'colours': list(struct.unpack_from('>16H', code, 0xd46)),
                    'provenance': provenance(0xd46, 32, 'E1')},
        'fonts': {'number': font(0x4fb80, '0123456789*+-', 5),
                  'message': font(0x4fbf0, ''.join(chr(n) for n in range(32, 97)), 7)},
        'compass': {'frames': compass, 'ticks': ticks,
                    'provenance': provenance(compass_at, (576 + 16) * 10),
                    'ticksProvenance': provenance(0x3ad4, 128, 'E1')},
        'pitch': {'rows': pitch, 'provenance': provenance(pitch_at, 608 * 4)},
    }
