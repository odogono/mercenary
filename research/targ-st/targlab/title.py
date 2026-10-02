"""Decode the Escape from Targ ST title picture and its Title Logo (ADR 0063).

The ST release boots to the GEM desktop; `ESCAPE.PRG` (652 bytes) is a loader.
It reads the hidden file `E0` to `$60000`, sets low resolution
(`$FF8260`) and screen high byte `$07` (`$FF8201`; the mid byte stays at
EmuTOS's `$80`, so the screen is `$78000`), copies `$60080..$67FFF` there and
loads sixteen colours from its own table. That table is word-for-word the
palette in `E0`'s header. The title stays up while the loader reads E1..E4
and M, then jumps to `$40000`. `E0` is therefore a NEOchrome picture: a
128-byte header (palette at bytes 4..35) and 32,000 bytes of interleaved
four-plane low-resolution screen. No emulator is needed to read it. The
Hatari confirmation is in docs/research/targ-st-title-logo.md.

The Title Logo is every pixel of palette index 3: the MERCENARY lettering and
the globe it overlaps, which are drawn as one connected mark in one colour.
No other element of the picture uses index 3. It is exported as a 1-bit PNG,
transparent outside the mark.
"""

from __future__ import annotations

import struct

from . import png
from .disk import BASELINE, Floppy, sha256

PICTURE, LOADER = 'E0', 'ESCAPE.PRG'
IMAGE = 'title.png'
WIDTH, HEIGHT, PLANES = 320, 200, 4
HEADER = 128
LOGO_INDEX = 3

# Loader facts, by file offset in ESCAPE.PRG (header included).
LOADER_FACTS = {
    'name': (0xA8, bytes.fromhex('45300000'), 'filename "E0"'),
    'read': (0x7C, bytes.fromhex('2f3c000600002f3c00007fff'),
             'Fread up to $7FFF bytes to $60000'),
    'copy': (0xB0, bytes.fromhex('207c00060080227c00078000'),
             'copy $60080.. (the pixels after the 128-byte header) to $78000'),
    'resolution': (0x22E, bytes.fromhex('13fc00fc00ff8260'), 'low resolution ($FC & 3 = 0)'),
    'screen': (0x236, bytes.fromhex('13fc000700ff8201'), 'screen high byte $07'),
    'palette': (0x23E, bytes.fromhex('4dfa0026227c00ff8240'),
                'sixteen colours from the table at $266 to $FF8240'),
}
PALETTE_TABLE = 0x266


def check_loader(loader: bytes, picture: bytes) -> list[dict]:
    """Every loader fact holds, and its palette table is the picture's."""
    facts = []
    for key, (at, expected, what) in LOADER_FACTS.items():
        if loader[at:at + len(expected)] != expected:
            raise ValueError(f'{LOADER} at ${at:X} is not the {key} step ({what})')
        facts.append({'offset': f'${at:X}', 'bytes': expected.hex(), 'what': what})
    if loader[PALETTE_TABLE:PALETTE_TABLE + 32] != picture[4:36]:
        raise ValueError(f'{LOADER} palette table differs from the {PICTURE} header')
    return facts


def indices(picture: bytes) -> list[list[int]]:
    """Palette index per pixel, row by row, from the interleaved bitplanes."""
    if len(picture) != HEADER + WIDTH * HEIGHT // 2:
        raise ValueError(f'{PICTURE} is {len(picture)} bytes, not a NEOchrome picture')
    pixels = picture[HEADER:]
    rows = []
    for y in range(HEIGHT):
        row = []
        for x in range(WIDTH):
            group = y * 160 + (x // 16) * 8
            words = struct.unpack_from('>4H', pixels, group)
            bit = 15 - x % 16
            row.append(sum(((word >> bit) & 1) << plane for plane, word in enumerate(words)))
        rows.append(row)
    return rows


def bounds(rows: list[list[int]], index: int) -> tuple[int, int, int, int]:
    xs = [x for row in rows for x, value in enumerate(row) if value == index]
    ys = [y for y, row in enumerate(rows) if index in row]
    return min(xs), min(ys), max(xs) + 1, max(ys) + 1


def gun(word: int, shift: int) -> int:
    """An ST gun level (3 bits) as 8-bit, as the Browser Shell shows it."""
    return round(((word >> shift) & 7) * 255 / 7)


def extract(floppy: Floppy) -> tuple[dict, bytes]:
    """The title document and the mark as a PNG."""
    picture, loader = floppy.read(PICTURE), floppy.read(LOADER)
    facts = check_loader(loader, picture)
    rows = indices(picture)
    left, top, right, bottom = bounds(rows, LOGO_INDEX)
    span = (HEADER + top * 160, HEADER + bottom * 160)
    mark = [[value == LOGO_INDEX for value in row[left:right]] for row in rows[top:bottom]]
    colours = list(struct.unpack_from('>16H', picture, 4))
    colour = colours[LOGO_INDEX]
    image = png.write(mark, (gun(colour, 8), gun(colour, 4), gun(colour, 0)))
    return {
        'schemaVersion': 1,
        'kind': 'titleLogo',
        'source': {
            'title': BASELINE['title'],
            'release': BASELINE['logicalName'],
            'diskSha256': BASELINE['disk']['sha256'],
            'diskSize': BASELINE['disk']['size'],
            'recipe': 'research/targ-st/targlab/title.py',
            'qualification': BASELINE['qualification'],
        },
        'picture': {
            'file': PICTURE, 'size': len(picture), 'sha256': sha256(picture),
            'format': 'NEOchrome: 128-byte header, palette at bytes 4..35, then 4 interleaved planes',
            'width': WIDTH, 'height': HEIGHT, 'planes': PLANES, 'screen': '$78000',
            'loader': {'file': LOADER, 'size': len(loader), 'sha256': sha256(loader),
                       'facts': facts},
        },
        'palette': {
            'colours': colours,
            'provenance': {'file': PICTURE, 'range': [4, 36], 'sha256': sha256(picture[4:36])},
        },
        'logo': {
            'index': LOGO_INDEX,
            'what': 'the MERCENARY lettering and the globe, one connected mark in one colour',
            'x': left, 'y': top, 'width': right - left, 'height': bottom - top,
            'image': {
                'file': IMAGE,
                'sha256': sha256(image),
                'format': 'PNG, 1-bit indexed: 0 transparent, 1 the mark in palette colour 3',
                'markSha256': sha256(png.mark_bits(mark)),
                'markEncoding': 'one bit per pixel, most significant first, rows padded to a byte',
            },
            'provenance': {'file': PICTURE, 'range': list(span),
                           'sha256': sha256(picture[span[0]:span[1]])},
        },
    }, image
