"""Read a loaded Mercenary III RAM image, and say where every value came from.

Every extractor in this laboratory reads through `Ram`. A read is plain
big-endian access to the 1 MiB ST address space; `slice` records the half-open
range a value was taken from, with its SHA-256, so the Data Payload can carry
Research Provenance for each recovered item rather than for the image as a
whole. `require` refuses to decode a range whose bytes differ from a
documented hash, which is how the reports' stable-slice ledgers are enforced.

This module reads only Mercenary III. It knows nothing of Damocles or Targ.
"""

from __future__ import annotations

import hashlib
import struct
from pathlib import Path

RAM_SIZE = 0x100000


class Ram:
    def __init__(self, data: bytes, label: str = 'ram') -> None:
        if len(data) != RAM_SIZE:
            raise ValueError(f'{label}: expected {RAM_SIZE} bytes, found {len(data)}')
        self.data = data
        self.label = label
        self.sha256 = hashlib.sha256(data).hexdigest()

    @classmethod
    def load(cls, path: Path) -> 'Ram':
        return cls(Path(path).read_bytes(), str(path))

    def byte(self, address: int) -> int:
        return self.data[address]

    def sbyte(self, address: int) -> int:
        return struct.unpack_from('>b', self.data, address)[0]

    def word(self, address: int) -> int:
        return struct.unpack_from('>H', self.data, address)[0]

    def sword(self, address: int) -> int:
        return struct.unpack_from('>h', self.data, address)[0]

    def long(self, address: int) -> int:
        return struct.unpack_from('>I', self.data, address)[0]

    def slong(self, address: int) -> int:
        return struct.unpack_from('>i', self.data, address)[0]

    def bytes(self, lo: int, hi: int) -> bytes:
        return self.data[lo:hi]

    def digest(self, lo: int, hi: int) -> str:
        return hashlib.sha256(self.data[lo:hi]).hexdigest()

    def slice(self, lo: int, hi: int) -> dict:
        """Research Provenance for one half-open source range."""
        if not 0 <= lo < hi <= RAM_SIZE:
            raise ValueError(f'bad source range ${lo:X}..${hi:X}')
        return {'range': [f'${lo:05X}', f'${hi:05X}'], 'sha256': self.digest(lo, hi)}

    def require(self, lo: int, hi: int, sha256: str, role: str = '') -> dict:
        found = self.digest(lo, hi)
        if found != sha256:
            raise ValueError(
                f'{self.label}: ${lo:05X}..${hi:05X} {role} is {found}, '
                f'not the documented {sha256}')
        return self.slice(lo, hi)


def hexaddr(address: int, digits: int = 5) -> str:
    return f'${address:0{digits}X}'
