"""A one-colour mark as a 1-bit indexed PNG, and back.

Index 0 is fully transparent and index 1 is the mark's colour. Every row
uses filter 0, so a reader needs only to inflate the IDAT stream. The
compressed bytes depend on the zlib build, so provenance hashes the mark
(`mark_bits`) rather than the file.
"""

from __future__ import annotations

import struct
import zlib

SIGNATURE = b'\x89PNG\r\n\x1a\n'


def mark_bits(rows: list[list[bool]]) -> bytes:
    """One bit per pixel, most significant first, each row padded to a byte."""
    out = bytearray()
    for row in rows:
        for at in range(0, len(row), 8):
            chunk = row[at:at + 8]
            out.append(sum(1 << (7 - i) for i, drawn in enumerate(chunk) if drawn))
    return bytes(out)


def chunk(kind: bytes, data: bytes) -> bytes:
    return (struct.pack('>I', len(data)) + kind + data
            + struct.pack('>I', zlib.crc32(kind + data) & 0xFFFFFFFF))


def write(rows: list[list[bool]], rgb: tuple[int, int, int]) -> bytes:
    width, height = len(rows[0]), len(rows)
    span = (width + 7) // 8
    bits = mark_bits(rows)
    raw = b''.join(b'\0' + bits[y * span:(y + 1) * span] for y in range(height))
    return (SIGNATURE
            + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 1, 3, 0, 0, 0))
            + chunk(b'PLTE', bytes([0, 0, 0, *rgb]))
            + chunk(b'tRNS', b'\0')
            + chunk(b'IDAT', zlib.compress(raw, 9))
            + chunk(b'IEND', b''))


def read(data: bytes) -> tuple[list[list[bool]], tuple[int, int, int]]:
    """The mark and its colour from a PNG this module wrote."""
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
    if (depth, colour, chunks[b'tRNS']) != (1, 3, b'\0'):
        raise ValueError('not a 1-bit indexed mark with index 0 transparent')
    span = (width + 7) // 8
    raw = zlib.decompress(idat)
    rows = []
    for y in range(height):
        line = raw[y * (span + 1):(y + 1) * (span + 1)]
        if line[0] != 0:
            raise ValueError(f'row {y} is filtered')
        rows.append([bool(line[1 + x // 8] >> (7 - x % 8) & 1) for x in range(width)])
    plte = chunks[b'PLTE']
    return rows, (plte[3], plte[4], plte[5])
