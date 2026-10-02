"""Read files from the pinned Escape from Targ STX without an emulator.

The disk is a Pasti (STX) image of a single-sided, 80-track, 9-sector GEMDOS
floppy. Track 79 holds only sectors 1..6 and three copy-protection sectors
(IDs 245..247); the protection sectors are outside the GEMDOS geometry and are
ignored, and a file that reached a missing sector would be refused. Files are read through
the boot sector's BPB and the FAT12 chain, exactly as GEMDOS reads them.

Pasti layout (little-endian): a 16-byte file header (`RSY\\0`, track count at
byte 10), then per track a 16-byte descriptor (record size, fuzzy byte count,
sector count, flags, track length, track number, track type). With flag bit 0
the descriptor is followed by 16-byte sector descriptors (data offset, bit
position, read time, ID track/head/sector/size, CRC, FDC flags, reserved),
then the fuzzy mask, then the data the offsets index. Without it the sectors
follow as consecutive 512-byte blocks.
"""

from __future__ import annotations

import hashlib
import json
import os
import struct
from dataclasses import dataclass
from pathlib import Path

LAB = Path(__file__).resolve().parents[1]
REPOSITORY = LAB.parents[1]
BASELINE = json.loads((LAB / 'config' / 'baseline.json').read_text())


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def disk_path() -> Path:
    """The pinned STX, from `TARG_ROM_ROOT` or the usual ROM roots, hash-checked."""
    relative = BASELINE['disk']['relativePath']
    configured = os.environ.get('TARG_ROM_ROOT')
    roots = ([Path(configured)] if configured
             else [REPOSITORY / 'roms', Path('/Users/alex/work/mercenary/roms')])
    for root in roots:
        path = root / relative
        if path.exists():
            if sha256(path.read_bytes()) != BASELINE['disk']['sha256']:
                raise SystemExit(f'{path} does not match its pinned SHA-256')
            return path
    raise SystemExit(f'Set TARG_ROM_ROOT to a directory holding {relative}')


def stx_sectors(image: bytes) -> dict[tuple[int, int, int], bytes]:
    """Every sector in a Pasti image, keyed by (track, side, sector ID)."""
    if image[:4] != b'RSY\0':
        raise ValueError('not a Pasti (STX) image')
    sectors: dict[tuple[int, int, int], bytes] = {}
    offset = 16
    for _ in range(image[10]):
        record, fuzzy, count, flags, _length, number, _kind = struct.unpack_from(
            '<IIHHHBB', image, offset)
        track, side = number & 0x7F, number >> 7
        at = offset + 16
        if flags & 1:
            descriptors = [struct.unpack_from('<IHHBBBBHBB', image, at + 16 * i)
                           for i in range(count)]
            data = at + 16 * count + fuzzy
            for start, _bit, _time, _t, _s, sector, size, *_ in descriptors:
                sectors[(track, side, sector)] = image[data + start:data + start + (128 << size)]
        else:
            for i in range(count):
                sectors[(track, side, i + 1)] = image[at + 512 * i:at + 512 * (i + 1)]
        offset += record
    return sectors


@dataclass(frozen=True)
class Entry:
    name: str
    attributes: int
    cluster: int
    size: int


class Floppy:
    """A GEMDOS floppy assembled from its sectors in logical order."""

    def __init__(self, sectors: dict[tuple[int, int, int], bytes]):
        boot = sectors[(0, 0, 1)]
        (self.bytes_per_sector, self.sectors_per_cluster, reserved, fats, root_entries,
         total, _media, fat_sectors, per_track, sides) = struct.unpack_from(
            '<HBHBHHBHHH', boot, 11)
        size = self.bytes_per_sector
        logical = [(track, side, sector)
                   for track in range(total // (per_track * sides)) for side in range(sides)
                   for sector in range(1, per_track + 1)]
        self.missing = {n for n, key in enumerate(logical) if key not in sectors}
        self.image = b''.join(sectors.get(key, bytes(size))[:size] for key in logical)
        self.fat = self.image[reserved * size:(reserved + fat_sectors) * size]
        root = (reserved + fats * fat_sectors) * size
        self.root = self.image[root:root + root_entries * 32]
        self.data = root + root_entries * 32

    def entries(self) -> list[Entry]:
        found = []
        for at in range(0, len(self.root), 32):
            raw = self.root[at:at + 32]
            if raw[0] in (0, 0xE5):
                continue
            stem, extension = raw[:8].decode('latin-1').strip(), raw[8:11].decode('latin-1').strip()
            found.append(Entry(stem + ('.' + extension if extension else ''), raw[11],
                               *struct.unpack_from('<HI', raw, 26)))
        return found

    def entry(self, name: str) -> Entry:
        return next(e for e in self.entries() if e.name == name)

    def next_cluster(self, cluster: int) -> int:
        at = cluster * 3 // 2
        pair = self.fat[at] | self.fat[at + 1] << 8
        return pair >> 4 if cluster & 1 else pair & 0xFFF

    def read(self, name: str) -> bytes:
        entry = self.entry(name)
        span = self.bytes_per_sector * self.sectors_per_cluster
        out = bytearray()
        cluster = entry.cluster
        while 2 <= cluster < 0xFF0:
            start = self.data + (cluster - 2) * span
            if any(n in self.missing for n in range(start // self.bytes_per_sector,
                                                    (start + span) // self.bytes_per_sector)):
                raise ValueError(f'{name} reaches a sector the disk does not hold')
            out += self.image[start:start + span]
            cluster = self.next_cluster(cluster)
        return bytes(out[:entry.size])


def pinned_floppy() -> Floppy:
    return Floppy(stx_sectors(disk_path().read_bytes()))
