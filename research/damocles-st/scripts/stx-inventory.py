#!/usr/bin/env python3
"""Inventory a Pasti (RSY) STX floppy image and reconcile it against captured RAM.

Independently authored from the published Pasti container layout. The tool
reports structure only: track and sector descriptors, protection indicators,
and whether any captured RAM range appears verbatim in the disk payload. It
never writes disk content anywhere, so its output can be read beside Restricted
Material without becoming Restricted Material itself.

The reconciliation answers one question for the Damocles catalogue: are the
resident model banks readable from the disk image, or does a title-to-world
unpack produce them? A run that finds no verbatim resident bytes establishes
the payload is packed, and equally establishes that the protected sectors are
not a second, directly readable model bank.

Usage:
    python3 scripts/stx-inventory.py --stx PATH [--ram PATH ...] [--json]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
import sys
from pathlib import Path

FILE_HEADER = 16
TRACK_HEADER = 16
SECTOR_DESCRIPTOR = 16

# Track record flags. Only the two the container actually varies are named;
# an unexpected bit is reported rather than silently folded into a known one.
TRK_SECTORS = 0x0001
TRK_IMAGE = 0x0040

# FDC status bits a sector descriptor can carry. A Pasti writer sets bit 7 for
# a sector whose data is not stable between reads.
FDC_CRC_ERROR = 0x08
FDC_RECORD_NOT_FOUND = 0x10
FDC_DELETED_MARK = 0x20
FDC_FUZZY = 0x80


class StxError(ValueError):
    """The image is not a container this tool can account for in full."""


def parse(data: bytes) -> dict:
    if len(data) < FILE_HEADER or data[:4] != b'RSY\x00':
        raise StxError('not a Pasti RSY image')
    version, tool, reserved = struct.unpack_from('<HHH', data, 4)
    if version != 3:
        raise StxError(f'unsupported Pasti version {version}')
    track_count = data[10]
    revision = data[11]
    offset = FILE_HEADER
    tracks = []
    for index in range(track_count):
        if offset + TRACK_HEADER > len(data):
            raise StxError(f'track record {index} runs past the end of the image')
        size, fuzzy, sector_count, flags, length, number, kind = struct.unpack_from(
            '<IIHHHBB', data, offset
        )
        if size < TRACK_HEADER or offset + size > len(data):
            raise StxError(f'track record {index} has an impossible size {size}')
        cursor = offset + TRACK_HEADER
        sectors = []
        if sector_count:
            for slot in range(sector_count):
                base = cursor + slot * SECTOR_DESCRIPTOR
                data_offset, bit_position, read_time = struct.unpack_from('<IHH', data, base)
                sectors.append({
                    'index': slot,
                    'dataOffset': data_offset,
                    'bitPosition': bit_position,
                    'readTime': read_time,
                    'idTrack': data[base + 8],
                    'idHead': data[base + 9],
                    'idNumber': data[base + 10],
                    'idSize': data[base + 11],
                    'idCrc': int.from_bytes(data[base + 12:base + 14], 'big'),
                    'fdcStatus': data[base + 14],
                })
            cursor += sector_count * SECTOR_DESCRIPTOR
        fuzzy_at = cursor
        cursor += fuzzy
        # Sector data offsets are relative to the start of the data area, which
        # follows the descriptors and the fuzzy mask rather than the header.
        data_area = cursor
        image = None
        if flags & TRK_IMAGE:
            if cursor + 2 > offset + size:
                raise StxError(f'track record {index} claims an image it has no room for')
            image_size = struct.unpack_from('<H', data, cursor)[0]
            image = data[cursor + 2:cursor + 2 + image_size]
            if len(image) != image_size:
                raise StxError(f'track record {index} image is truncated')
        tracks.append({
            'index': index,
            'cylinder': number & 0x7F,
            'side': number >> 7,
            'flags': flags,
            'recordType': kind,
            'recordSize': size,
            'declaredLength': length,
            'fuzzyBytes': fuzzy,
            'fuzzyAt': fuzzy_at,
            'sectors': sectors,
            'image': image,
            'payload': data[data_area:offset + size],
        })
        offset += size
    if offset != len(data):
        raise StxError(f'{len(data) - offset} bytes follow the last track record')
    return {
        'version': version,
        'tool': tool,
        'reserved': reserved,
        'revision': revision,
        'trackCount': track_count,
        'tracks': tracks,
        'size': len(data),
        'sha256': hashlib.sha256(data).hexdigest(),
    }


def sector_payload(image: dict, track: dict, sector: dict) -> bytes:
    """The stored data for one described sector, or empty when it has none."""
    if sector['fdcStatus'] & FDC_RECORD_NOT_FOUND:
        return b''
    size = 128 << sector['idSize']
    start = sector['dataOffset']
    return track['payload'][start:start + size]


def boot_sector_checksum(block: bytes) -> int:
    return sum(
        int.from_bytes(block[i:i + 2], 'big') for i in range(0, len(block), 2)
    ) & 0xFFFF


def classify(track: dict) -> str:
    if not (track['flags'] & TRK_IMAGE):
        return 'unformatted'
    if not track['sectors']:
        return 'raw-image'
    return 'sectored'


def protection_notes(track: dict) -> list[str]:
    notes = []
    if track['fuzzyBytes']:
        notes.append(f"{track['fuzzyBytes']} fuzzy-mask bytes")
    seen = {}
    for sector in track['sectors']:
        status = sector['fdcStatus']
        key = (sector['idTrack'], sector['idHead'], sector['idNumber'])
        if key in seen:
            notes.append(f"duplicate sector id {key}")
        seen[key] = True
        if status & FDC_FUZZY:
            notes.append(f"sector {sector['idNumber']} carries unstable data")
        if status & FDC_RECORD_NOT_FOUND:
            notes.append(f"sector id {key} has no readable data record")
        if status & FDC_CRC_ERROR:
            notes.append(f"sector {sector['idNumber']} fails its data CRC")
        if status & FDC_DELETED_MARK:
            notes.append(f"sector {sector['idNumber']} uses a deleted data mark")
        if sector['idTrack'] != track['cylinder'] or sector['idHead'] != track['side']:
            notes.append(
                f"sector id names cylinder {sector['idTrack']} side {sector['idHead']}"
            )
    return notes


def reconcile(image: dict, ram: bytes, ranges: list[tuple[str, int, int]],
              probe: int = 32) -> list[dict]:
    """Report which named RAM ranges appear verbatim anywhere in the payload.

    A resident bank that the loader copies straight off the disk would show up;
    one the title-to-world unpack produces would not.
    """
    payloads = [track['payload'] for track in image['tracks'] if track['payload']]
    results = []
    for name, start, end in ranges:
        sample = ram[start:min(start + probe, end)]
        hits = []
        for track, blob in zip(
            [t for t in image['tracks'] if t['payload']], payloads
        ):
            if sample and sample in blob:
                hits.append(f"{track['cylinder']}/{track['side']}")
        results.append({
            'range': name,
            'start': start,
            'end': end,
            'probeBytes': len(sample),
            'verbatimTracks': hits,
        })
    return results


DEFAULT_RANGES = [
    ('object pointer table $035700', 0x035700, 0x035CE8),
    ('object record bank $035CE8', 0x035CE8, 0x042C00),
    ('surface pointer table $00E900', 0x00E900, 0x00ED60),
    ('surface record bank $00ED60', 0x00ED60, 0x01E000),
    ('building-detail pointer table $026000', 0x026000, 0x026208),
    ('building-detail record bank $026208', 0x026208, 0x031700),
    ('ground record bank $01E790', 0x01E790, 0x024000),
    ('glyph source table $031700', 0x031700, 0x031C00),
    ('body label table $0081DC', 0x0081DC, 0x0082D4),
]


def report(image: dict, rams: list[tuple[str, bytes]]) -> dict:
    kinds = {}
    protection = []
    sectored = []
    image_bytes = 0
    sector_bytes = 0
    for track in image['tracks']:
        kind = classify(track)
        kinds[kind] = kinds.get(kind, 0) + 1
        if track['image'] is not None:
            image_bytes += len(track['image'])
        notes = protection_notes(track)
        if notes:
            protection.append({
                'cylinder': track['cylinder'], 'side': track['side'], 'notes': notes,
            })
        if track['sectors']:
            described = []
            for sector in track['sectors']:
                blob = sector_payload(image, track, sector)
                sector_bytes += len(blob)
                described.append({
                    'id': [sector['idTrack'], sector['idHead'],
                           sector['idNumber'], sector['idSize']],
                    'bytes': len(blob),
                    'fdcStatus': sector['fdcStatus'],
                })
            sectored.append({
                'cylinder': track['cylinder'], 'side': track['side'],
                'sectors': described,
            })
    cylinders = sorted({t['cylinder'] for t in image['tracks']})
    formatted = sorted({t['cylinder'] for t in image['tracks'] if t['image'] is not None})
    out = {
        'image': {
            'sha256': image['sha256'], 'size': image['size'],
            'pastiVersion': image['version'], 'revision': image['revision'],
            'trackRecords': image['trackCount'],
        },
        'geometry': {
            'cylinders': [min(cylinders), max(cylinders)],
            'formattedCylinders': [min(formatted), max(formatted)] if formatted else None,
            'trackKinds': kinds,
            'trackImageBytes': image_bytes,
            'describedSectorBytes': sector_bytes,
        },
        'sectoredTracks': sectored,
        'protection': protection,
        'reconciliation': [],
    }
    boot = None
    for track in image['tracks']:
        if track['cylinder'] == 0 and track['side'] == 0 and track['sectors']:
            first = track['sectors'][0]
            block = sector_payload(image, track, first)
            if len(block) == 512:
                boot = {
                    'bytes': len(block),
                    'checksum': boot_sector_checksum(block),
                    'executable': boot_sector_checksum(block) == 0x1234,
                }
    out['bootSector'] = boot
    for name, ram in rams:
        out['reconciliation'].append({
            'ram': name,
            'ranges': reconcile(image, ram, DEFAULT_RANGES),
        })
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--stx', required=True, type=Path)
    parser.add_argument('--ram', action='append', default=[], type=Path,
                        help='a captured 1 MiB ST RAM image to reconcile against')
    parser.add_argument('--json', action='store_true')
    args = parser.parse_args(argv)
    image = parse(args.stx.read_bytes())
    rams = []
    for path in args.ram:
        blob = path.read_bytes()
        if len(blob) != 0x100000:
            raise SystemExit(f'{path} is not a 1 MiB ST RAM image')
        rams.append((path.name, blob))
    result = report(image, rams)
    if args.json:
        json.dump(result, sys.stdout, indent=2, sort_keys=True)
        sys.stdout.write('\n')
        return 0
    meta = result['image']
    print(f"Pasti RSY v{meta['pastiVersion']} revision {meta['revision']}, "
          f"{meta['size']} bytes, {meta['trackRecords']} track records")
    print(f"  sha256 {meta['sha256']}")
    geo = result['geometry']
    print(f"  cylinders {geo['cylinders'][0]}..{geo['cylinders'][1]}, "
          f"formatted {geo['formattedCylinders'][0]}..{geo['formattedCylinders'][1]}")
    print(f"  track kinds {geo['trackKinds']}")
    print(f"  track-image bytes {geo['trackImageBytes']}, "
          f"described sector bytes {geo['describedSectorBytes']}")
    if result['bootSector']:
        boot = result['bootSector']
        print(f"  boot sector checksum ${boot['checksum']:04X} "
              f"({'executable' if boot['executable'] else 'not executable'})")
    print('  tracks carrying sector descriptors:')
    for track in result['sectoredTracks']:
        ids = ', '.join(
            f"{s['id'][2]}({s['bytes']}B"
            + (f", fdc ${s['fdcStatus']:02X}" if s['fdcStatus'] else '')
            + ')'
            for s in track['sectors']
        )
        print(f"    cylinder {track['cylinder']} side {track['side']}: {ids}")
    print('  protection indicators:')
    for entry in result['protection']:
        print(f"    cylinder {entry['cylinder']} side {entry['side']}: "
              + '; '.join(entry['notes']))
    for entry in result['reconciliation']:
        print(f"  verbatim resident ranges in the payload ({entry['ram']}):")
        for item in entry['ranges']:
            where = ', '.join(item['verbatimTracks']) or 'none'
            print(f"    {item['range']}: {where}")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
