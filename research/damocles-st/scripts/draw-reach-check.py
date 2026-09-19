#!/usr/bin/env python3
"""What bounds the Damocles draw, per family, from pinned RAM alone (#370).

Three families of geometry reach different distances, and only one of them is
bounded by a cell window. This reads the live words each family's selection
depends on out of a capture -- a run's `.ram` or a Hatari memstate -- and
reports the bound each one carries at that pose.

  ground records  `$054BB6` indexes a 256-byte table at `$00915A` by the camera
                  altitude `$7A30 >> 11` (clamped to 255) and caches the byte in
                  `$7B62`. `$054BE0` rebuilds the (2r+1) cell window at `$054888`
                  whenever the fresh byte differs from the cache. A cell change
                  stores `$FF` into `$7B62` first (`$054B84`), which can never
                  equal a table entry, so crossing a cell boundary always
                  rebuilds. On foot `$7A30` is 63, the index is 0, and the table
                  reads 0 -- the window is the occupied cell alone.
  structures      the plan renderer `$05A744` and the detail renderer `$053CC2`
                  are reachable only from the dispatch at `$0533D4..$053418`,
                  which the object stream walk `$0533C0` falls into on a zero
                  word. The dispatch draws the bound workspace once, so
                  structure geometry never leaves the occupied cell.
  objects         `$052C9C` keeps every resident slot whose Association B high
                  word matches the current body. No distance test, recovered in
                  `docs/research/damocles-object-selection.md`; reported here for
                  contrast, not re-derived.

It reads nothing but the pinned capture and writes nothing into a guest, so
every reading is an ordinary-route observation. Findings are Working-Authority
Evidence.

Self-gating checks (a failure raises, it is not reported):

  radius-table    `$00915A` must hold the canonical curve; a capture taken
                  before the game is loaded does not carry it.
  radius-reachable  `$7B62` must be a byte the table can produce, or the `$FF`
                  invalidation sentinel. A latched cache is always a previously
                  valid entry, so a value absent from the table is corruption.
  window-agrees   where a route list is built, `$054888` recomputed from the
                  capture's own camera cell, grid and radius must reproduce the
                  window the capture holds.

Run from the repo root:
  python3 research/damocles-st/scripts/draw-reach-check.py \
    --memstate research/damocles-st/snapshots/eris-spaceport-onfoot.sav
  python3 research/damocles-st/scripts/draw-reach-check.py \
    --run research/damocles-st/work/<run-id> --prefix observed

Output is a JSON report on stdout; the exit status is nonzero if any check
fails.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import struct
import sys
from pathlib import Path

LAB_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB_ROOT))

_spec = importlib.util.spec_from_file_location(
    'ground_extent_check', LAB_ROOT / 'scripts' / 'ground-extent-check.py')
_ground = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_ground)

# The ground family's altitude-indexed radius.
RADIUS_TABLE = 0x00915A  # 256 bytes, indexed by the camera altitude >> 11
RADIUS_CACHE = 0x7B62  # the byte $054BD6 compares against; $FF while invalid
CAMERA_X = 0x7A2C  # camera world X; its high word is the cell column
CAMERA_Y = 0x7A30  # camera world Y, read as a longword at $054BB6
CAMERA_Z = 0x7A34  # camera world Z; its high word is the cell row
GRID_X = 0x7BB2
GRID_Z = 0x7BB4
CELL = 0x7B5C  # current cell index, (z << 4) | x

# The structure family's dispatch gates at $0533D4.
WALK_FLAG = 0x7A8E  # $0533D6 draws the plan only when this is 1
PLAN_GATE = 0x7AF6  # $0533DE drops the plan renderer when this is negative
REGION_FLAGS = 0x7B34  # bits 14 and 12 order plan against detail

# The object family's candidate list.
BODY_SELECTOR = 0x7AA8  # $052C9C keeps residents whose Association B matches
RESIDENT_COUNT = 0x7B4E

# The canonical curve, as read from 621 of 622 game-loaded captures in the work
# tree. Entry 0 is 0: at the on-foot altitude the window is the occupied cell.
CANONICAL_TABLE_SHA256 = (
    '2920b857a78057ea34075578ab19acf78a8691ca8865dd4aff1cdabf0cf6ec43')

INVALID_RADIUS = 0xFF  # $054B84 stores this on a cell change to force a rebuild


class CheckError(Exception):
    pass


def _u16(data: bytes, address: int) -> int:
    return struct.unpack_from('>H', data, address)[0]


def _s16(data: bytes, address: int) -> int:
    return struct.unpack_from('>h', data, address)[0]


def _s32(data: bytes, address: int) -> int:
    return struct.unpack_from('>i', data, address)[0]


def load_ram(*, run: Path | None, prefix: str, memstate: Path | None) -> tuple[bytes, str]:
    """Return the 1 MiB ST RAM window and the path it came from."""
    if memstate is not None:
        from damocleslab.catalogue import hatari_memstate_ram
        return hatari_memstate_ram(memstate.read_bytes()), str(memstate)
    assert run is not None
    path = run / f'{prefix}.ram'
    if not path.is_file():
        raise CheckError(f'no captured RAM at {path}')
    data = path.read_bytes()
    if len(data) < 0x100000:
        raise CheckError(f'{path} is {len(data)} bytes; a full ST RAM capture is expected')
    return data, str(path)


def ground_family(ram: bytes, *, reconstruct: bool = True) -> tuple[dict, list[dict]]:
    """Reproduce $054BB6's index and $054888's window from the capture."""
    table = ram[RADIUS_TABLE:RADIUS_TABLE + 256]
    checks = []

    table_sha = hashlib.sha256(table).hexdigest()
    canonical = table_sha == CANONICAL_TABLE_SHA256
    checks.append({
        'check': 'radius-table',
        'pass': canonical,
        'detail': ('the canonical altitude curve' if canonical else
                   f'$00915A holds an unrecognised table (sha256 {table_sha[:16]}); '
                   'the capture may predate the game load'),
    })
    if not canonical:
        return {'status': 'table not recognised', 'tableSha256': table_sha}, checks

    altitude = _s32(ram, CAMERA_Y)
    # $054BBE clamps the index to $FF; a negative altitude cannot index the table.
    index = 0 if altitude < 0 else min(altitude >> 11, 0xFF)
    fresh = table[index]
    cached = ram[RADIUS_CACHE]

    reachable = cached == INVALID_RADIUS or cached in set(table)
    checks.append({
        'check': 'radius-reachable',
        'pass': reachable,
        'detail': (f'$7B62 is {cached}, a byte the table can produce' if reachable else
                   f'$7B62 is {cached}, which appears nowhere in the table'),
    })

    # A cache that already equals the fresh byte has settled; anything else is
    # standing from an altitude the camera has since left.
    settled = cached == fresh
    camera = (_s16(ram, CAMERA_X), _s16(ram, CAMERA_Z))
    grid = (_u16(ram, GRID_X), _u16(ram, GRID_Z))
    # $05497E skips the route list entirely at radius zero, and $5488DA aborts
    # when the window misses the grid; either way only the own cell is drawn.
    # $FF is not a radius: $054B84 stores it to force the rebuild at $054BE0.
    valid = cached not in (0, INVALID_RADIUS)
    columns = _ground.window(camera[0], grid[0], cached) if valid else None
    rows = _ground.window(camera[1], grid[1], cached) if valid else None
    built = columns is not None and rows is not None

    expected = None
    if built:
        expected = {'x': [columns[0], columns[0] + columns[1] - 1],
                    'z': [rows[0], rows[0] + rows[1] - 1]}
    if built and reconstruct:
        try:
            live = _ground.check(_ground.Ram(ram))
        except _ground.CheckError as error:
            agrees, detail = False, f'the route list did not reconstruct: {error}'
        else:
            agrees = live['scene']['window'] == expected and live['pass']
            detail = (f'the route list reconstructs over {expected}' if agrees else
                      f"recomputed {expected} against the capture's "
                      f"{live['scene']['window']}")
        checks.append({'check': 'window-agrees', 'pass': agrees, 'detail': detail})

    family = {
        'altitude': altitude,
        'altitudeIndex': index,
        'tableRadius': fresh,
        'cachedRadius': cached,
        'state': 'settled' if settled else 'latched from a higher altitude',
        'cell': f'0x{_u16(ram, CELL):02x}',
        'cameraCell': {'x': camera[0], 'z': camera[1]},
        'routeList': ('built' if built else
                      'unbuilt: awaiting rebuild' if cached == INVALID_RADIUS else
                      'unbuilt: radius zero' if not cached else
                      'unbuilt: camera window misses the grid'),
        'window': expected,
        'reach': ('the occupied cell alone' if cached == 0 else
                  'invalidated; $054BE0 rebuilds on the next pass'
                  if cached == INVALID_RADIUS else
                  f'a {2 * cached + 1} x {2 * cached + 1} cell square'),
    }
    return family, checks


def structure_family(ram: bytes) -> dict:
    """Report the $0533D4 dispatch gates. The reach itself is structural: the
    plan and detail renderers have no caller outside $0533D4..$053418."""
    walk = _u16(ram, WALK_FLAG)
    gate = _s16(ram, PLAN_GATE)
    flags = _u16(ram, REGION_FLAGS)
    if walk != 1:
        drawn = 'detail only (not on foot)'
    elif gate < 0:
        drawn = 'detail only ($7AF6 negative)'
    elif not flags & (1 << 14):
        drawn = 'detail, surrounding objects, then plan'
    elif flags & (1 << 12):
        drawn = 'detail then plan'
    else:
        drawn = 'plan then detail'
    return {
        'boundCell': f'0x{_u16(ram, CELL):02x}',
        'walkFlag': walk,
        'planGate': gate,
        'regionFlags': f'0x{flags:04x}',
        'components': drawn,
        'reach': 'the occupied cell alone; the bound Structure Workspace is the only source',
    }


def object_family(ram: bytes) -> dict:
    """Report the candidate list's scope. Recovered in #326, not re-derived."""
    return {
        'bodySelector': f'0x{_u16(ram, BODY_SELECTOR):04x}',
        'residentCount': _u16(ram, RESIDENT_COUNT),
        'reach': 'the whole body; $052C9C applies no distance test',
        'source': 'docs/research/damocles-object-selection.md',
    }


def check(ram: bytes, *, reconstruct: bool = True) -> dict:
    ground, checks = ground_family(ram, reconstruct=reconstruct)
    return {
        'schemaVersion': 1,
        'evidenceClass': 'working-authority-evidence',
        'families': {
            'ground': ground,
            'structures': structure_family(ram),
            'objects': object_family(ram),
        },
        'checks': checks,
        'pass': all(entry['pass'] for entry in checks),
    }


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--run', type=Path, help='observation run directory holding captured RAM')
    source.add_argument('--memstate', type=Path, help='Hatari memstate to carve ST RAM from')
    parser.add_argument('--prefix', default='observed',
                        help='capture prefix inside the run (default: observed)')
    arguments = parser.parse_args(argv)

    try:
        ram, origin = load_ram(run=arguments.run, prefix=arguments.prefix,
                               memstate=arguments.memstate)
        report = check(ram)
    except (CheckError, ValueError) as error:
        print(json.dumps({'schemaVersion': 1, 'pass': False, 'error': str(error)},
                         indent=2, sort_keys=True))
        return 1

    report['source'] = {'path': origin, 'sha256': hashlib.sha256(ram).hexdigest()}
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report['pass'] else 1


if __name__ == '__main__':
    raise SystemExit(main(sys.argv[1:]))
