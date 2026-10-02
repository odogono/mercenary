"""A sixteen-colour mark as a 4-bit indexed PNG, and back.

The PNG palette is the picture's own sixteen colours, so a pixel's PNG index is its
ST palette index. Index 0 is fully transparent and every other index opaque. Every
row uses filter 0, so a reader needs only to inflate the IDAT stream. The compressed
bytes depend on the zlib build, so provenance hashes the indices (`mark_nibbles`) as
well as the file.
"""

from __future__ import annotations

import struct
import zlib

SIGNATURE = b'\x89PNG\r\n\x1a\n'


def mark_nibbles(rows: list[list[int]]) -> bytes:
    """Two indices a byte, the left pixel in the high nibble, each row padded to a byte."""
    out = bytearray()
    for row in rows:
        for at in range(0, len(row), 2):
            pair = row[at:at + 2] + [0]
            out.append(pair[0] << 4 | pair[1])
    return bytes(out)


def chunk(kind: bytes, data: bytes) -> bytes:
    return (struct.pack('>I', len(data)) + kind + data
            + struct.pack('>I', zlib.crc32(kind + data) & 0xFFFFFFFF))


def write(rows: list[list[int]], palette: list[tuple[int, int, int]]) -> bytes:
    if len(palette) != 16:
        raise ValueError('a 4-bit mark needs sixteen colours')
    width, height = len(rows[0]), len(rows)
    span = (width + 1) // 2
    nibbles = mark_nibbles(rows)
    raw = b''.join(b'\0' + nibbles[y * span:(y + 1) * span] for y in range(height))
    return (SIGNATURE
            + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 4, 3, 0, 0, 0))
            + chunk(b'PLTE', bytes(level for rgb in palette for level in rgb))
            + chunk(b'tRNS', b'\0')
            + chunk(b'IDAT', zlib.compress(raw, 9))
            + chunk(b'IEND', b''))


def read(data: bytes) -> tuple[list[list[int]], list[tuple[int, int, int]]]:
    """The mark's indices and the palette from a PNG this module wrote."""
    if data[:8] != SIGNATURE:
        raise ValueError('not a PNG')
    at, chunks, idat = 8, {}, b''
    while at < len(data):
        (length,), kind = struct.unpack_from('>I', data, at), data[at + 4:at + 8]
        body = data[at + 8:at + 8 + length]
        idat += body if kind == b'IDAT' else b''
        chunks.setdefault(kind, body)
        at += 12 + length
    width, height, depth, colour, *_ = struct.unpack('>IIBBBBB', chunks[b'IHDR'])
    if (depth, colour, chunks[b'tRNS']) != (4, 3, b'\0'):
        raise ValueError('not a 4-bit indexed mark with index 0 transparent')
    span = (width + 1) // 2
    raw = zlib.decompress(idat)
    rows = []
    for y in range(height):
        line = raw[y * (span + 1):(y + 1) * (span + 1)]
        if line[0] != 0:
            raise ValueError(f'row {y} is filtered')
        rows.append([line[1 + x // 2] >> (4 if x % 2 == 0 else 0) & 15 for x in range(width)])
    plte = chunks[b'PLTE']
    return rows, [tuple(plte[i:i + 3]) for i in range(0, len(plte), 3)]
