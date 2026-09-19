#!/usr/bin/env python3
"""Rehost a Hatari memstate captured by an IPF-capable build onto the pinned build (#331).

The DION, GAEA and VESTA on-foot memstates behind
``payload/damocles/arrival-poses.json`` were captured with a different Hatari
2.6.1 binary from the one ``research/damocles-st/lab doctor`` pins: a build with
CAPS/IPF floppy support. Such a build writes an IPF section of
``4 + sizeof(IPF_STRUCT) + 1344`` bytes into the snapshot stream, where the
pinned build writes ``4 + 8 + 1344``. On restore the pinned build reports

    Memory snapshot IPF floppy data incompatible with this Hatari version -> skip

and ``IPF_MemorySnapShot_Capture`` skips only ``StructSize`` bytes before
returning, so the 1344-byte raw-stream trailer is never consumed and every
later section reads from the wrong offset. The restore then fails outright.

That is a container defect, not a defect in the captured machine. The Working
Authority disk and the TOS image are byte-identical between the two builds (the
app bundle's ``tos.img`` has the same SHA-256 as the pinned ``emutos206.img``),
and the IPF state itself is inert here: drive A holds an STX, which Hatari
handles through ``floppy_stx.c``, never through the IPF module.

This tool rewrites only that section, from the IPF-capable form to the pinned
form, preserving ``IPF_STRUCT.FdcClock`` — the one member both builds share.
Every other byte of the snapshot, including the whole 1 MiB ST RAM window, is
copied through unchanged, and the tool verifies that before it writes.

It is a container conversion, not a recapture. An observation taken from a
rehosted memstate is still Working-Authority Evidence from the original
capture; what changes is that the pinned toolchain can now run it.

Usage (from the repository root):

  python3 research/damocles-st/scripts/memstate-rehost.py \
      --input /path/to/dion-2-3.sav \
      --output research/damocles-st/snapshots/dion-2-3.sav

  python3 research/damocles-st/scripts/memstate-rehost.py --input ... --inspect
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import struct
import sys
from pathlib import Path

LAB_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB_ROOT))

from damocleslab.catalogue import hatari_memstate_ram  # noqa: E402
from damocleslab.core import LabError, validate_image  # noqa: E402
from damocleslab.laboratory import (  # noqa: E402
    load_configuration,
    resolve_images,
    resolve_roms_root,
)

# floppy_ipf.c: IPF_RawStreamImage[MAX_FLOPPYDRIVES][84][2], one int32 TrackSize
# per entry, written after IPF_STRUCT whenever StructSize > 0.
MAX_FLOPPYDRIVES = 2
IPF_MAX_TRACK_RAW_STREAM_IMAGE = 84
IPF_MAX_SIDE_RAW_STREAM_IMAGE = 2
RAW_STREAM_ENTRIES = MAX_FLOPPYDRIVES * IPF_MAX_TRACK_RAW_STREAM_IMAGE * IPF_MAX_SIDE_RAW_STREAM_IMAGE
RAW_STREAM_BYTES = RAW_STREAM_ENTRIES * 4

# IPF_STRUCT without HAVE_CAPSIMAGE is a single int64_t FdcClock. The pinned
# build writes exactly this, as the tracked eris-spaceport-onfoot memstate shows.
PINNED_STRUCT_SIZE = 8

# A capsimage IPF_STRUCT is bounded well below this; the locator rejects
# anything larger rather than matching arbitrary snapshot bytes.
MAX_STRUCT_SIZE = 1 << 12

# The memstate the pinned build already restores. Its IPF section fixes the
# one build-dependent constant this tool needs.
REFERENCE = LAB_ROOT / 'snapshots' / 'eris-spaceport-onfoot.sav'


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def pack_snapshot(stream: bytes) -> bytes:
    """Compress a snapshot stream the way Hatari writes one, reproducibly.

    ``mtime=0`` is the whole point: gzip otherwise stamps the wall clock into
    its header, so two rehosts of one captured memstate produce two different
    file hashes for the same machine. The published ``memstateSha256`` would
    then be unreproducible, and the RAM window would be the only thing tying a
    pose to its capture.
    """
    return gzip.compress(stream, 9, mtime=0)


def read_snapshot(path: Path) -> bytes:
    data = path.read_bytes()
    if data[:2] == b'\x1f\x8b':
        return gzip.decompress(data)
    return data


def disk_buffer_end(stream: bytes, image: bytes) -> int:
    """Offset just past ``EmulationDrives[0].pBuffer`` in the Floppy section.

    ``Floppy_MemorySnapShot_Capture`` stores the inserted image byte for byte,
    so the Working Authority STX locates itself. Everything Hatari writes
    between that buffer and the IPF section is fixed-size, which makes this a
    deterministic anchor rather than a scan.
    """
    first = stream.find(image)
    if first < 0:
        raise LabError(
            'Snapshot does not contain the Working Authority disk image; it was '
            'not captured with the pinned STX in drive A'
        )
    if stream.find(image, first + 1) >= 0:
        raise LabError('Working Authority disk image appears more than once in the snapshot')
    return first + len(image)


def ipf_section_delta(image: bytes) -> tuple[int, int]:
    """(delta from the disk buffer end to the IPF section, reference size).

    Read from the tracked reference memstate so the constant is evidence from a
    snapshot the pinned build demonstrably restores, not a number in this file.
    """
    reference = read_snapshot(REFERENCE)
    end = disk_buffer_end(reference, image)
    for offset in range(end, end + MAX_STRUCT_SIZE):
        size = struct.unpack_from('<i', reference, offset)[0]
        if size != PINNED_STRUCT_SIZE:
            continue
        start = offset + 4 + size
        if reference[start:start + RAW_STREAM_BYTES] == b'\x00' * RAW_STREAM_BYTES:
            return offset - end, size
    raise LabError(f'Reference memstate {REFERENCE} has no pinned-form IPF section')


def find_ipf_section(stream: bytes, image: bytes) -> tuple[int, int]:
    """Return (offset of the IPF StructSize word, StructSize) for this snapshot."""
    delta, _ = ipf_section_delta(image)
    offset = disk_buffer_end(stream, image) + delta
    size = struct.unpack_from('<i', stream, offset)[0]
    if not 0 < size <= MAX_STRUCT_SIZE:
        raise LabError(f'IPF StructSize at {offset:#x} is {size}, outside the plausible range')
    start = offset + 4 + size
    if stream[start:start + RAW_STREAM_BYTES] != b'\x00' * RAW_STREAM_BYTES:
        raise LabError(
            f'IPF section at {offset:#x} is not followed by the {RAW_STREAM_BYTES}-byte '
            'all-zero raw-stream trailer; this snapshot carries raw stream track data '
            'and this tool will not rewrite it'
        )
    return offset, size


def rehost(stream: bytes, image: bytes) -> tuple[bytes, dict]:
    offset, size = find_ipf_section(stream, image)
    report = {
        'ipfSectionOffset': f'0x{offset:x}',
        'structSizeBefore': size,
        'structSizeAfter': PINNED_STRUCT_SIZE,
        'rawStreamTrailerBytes': RAW_STREAM_BYTES,
    }
    if size == PINNED_STRUCT_SIZE:
        report['action'] = 'none'
        report['fdcClock'] = struct.unpack_from('<q', stream, offset + 4)[0]
        return stream, report
    if size < PINNED_STRUCT_SIZE:
        raise LabError(f'IPF section is {size} bytes, smaller than the pinned {PINNED_STRUCT_SIZE}')
    # FdcClock is the last member of IPF_STRUCT in both builds.
    fdc_clock = stream[offset + 4 + size - PINNED_STRUCT_SIZE:offset + 4 + size]
    report['action'] = 'rewritten'
    report['fdcClock'] = struct.unpack('<q', fdc_clock)[0]
    rehosted = (
        stream[:offset]
        + struct.pack('<i', PINNED_STRUCT_SIZE)
        + fdc_clock
        + stream[offset + 4 + size:]
    )
    return rehosted, report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--input', type=Path, required=True, help='memstate to rehost')
    parser.add_argument('--output', type=Path, help='where to write the rehosted memstate')
    parser.add_argument('--inspect', action='store_true', help='report only, write nothing')
    parser.add_argument('--roms', type=Path, default=None, help='Restricted Material root')
    parser.add_argument('--json', action='store_true', help='emit the report as JSON')
    args = parser.parse_args()

    if not args.inspect and args.output is None:
        parser.error('--output is required unless --inspect is given')

    authority, _config = load_configuration()
    program_path, _tos_path = resolve_images(authority, resolve_roms_root(args.roms))
    validate_image(program_path, authority['programImage'], label='Working Authority STX')

    original = read_snapshot(args.input)
    rehosted, report = rehost(original, program_path.read_bytes())

    before_ram = hatari_memstate_ram(original)
    after_ram = hatari_memstate_ram(rehosted)
    if before_ram != after_ram:
        raise LabError('Rehosting changed the ST RAM window; refusing to write')

    report['input'] = {
        'path': str(args.input),
        'fileSha256': sha256(args.input.read_bytes()),
        'streamBytes': len(original),
    }
    report['ramSha256'] = sha256(before_ram)
    report['ramUnchanged'] = True

    if not args.inspect:
        if report['action'] == 'none':
            # Already in the pinned form: copy the container through byte for
            # byte rather than recompressing it, so a memstate other notes cite
            # by SHA-256 keeps the hash they cite.
            packed = args.input.read_bytes()
        else:
            packed = pack_snapshot(rehosted)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_bytes(packed)
        report['output'] = {
            'path': str(args.output),
            'fileSha256': sha256(packed),
            'streamBytes': len(rehosted),
        }

    if args.json:
        print(json.dumps(report, indent=1, sort_keys=True))
    else:
        for key in ('action', 'ipfSectionOffset', 'structSizeBefore', 'structSizeAfter',
                    'fdcClock', 'ramSha256'):
            print(f'{key}: {report[key]}')
        if 'output' in report:
            print(f"output: {report['output']['path']}")
            print(f"outputSha256: {report['output']['fileSha256']}")


if __name__ == '__main__':
    main()
