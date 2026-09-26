#!/usr/bin/env python3
"""Recover the Damocles placement class: Association A byte 3 and the $7A39 it copies (#345).

Association A byte 3 (``$6FAB + 4*slot``) is the per-resident **placement class**. The
drop handler's direct path copies ``$7A39`` over it at ``$0546FC``; the support path
inherits the support's byte instead. Two notes recorded its derivation as unresolved:
`damocles-limo-key-drops.md` ("A complete derivation of this class from residence is not
recovered") and `damocles-object-selection.md` ("the `$6FAB` class value 4 that reaches
[the $053310 bump]").

This tool resolves it. ``$7A39`` is the low byte of the word at ``$7A38``, and the only
writer in the image is ``$0590A0``, at the tail of the routine at ``$059076``::

    $059076  moveq  #$0,d0
    $059078  movea.l $7910.w,a0     ; the bound structure's transformed extent record
    $05907C  tst.w  (a0)            ; negative header -> zone 0
    $059080  cmp.w  $2(a0),d1       ; d1 = $7AB4, the low word of the player's X
    $059086  addq.w #$1,d0          ;   past the rectangle's low X edge
    $059088  cmp.w  $4(a0),d1
    $05908E  addq.w #$1,d0          ;   past its high X edge
    $059090  cmp.w  $6(a0),d3       ; d3 = $7ABC, the low word of the player's Z
    $059096  addq.w #$3,d0
    $059098  cmp.w  $8(a0),d3
    $05909E  addq.w #$3,d0
    $0590A0  move.w d0,$7a38.w      ; $7A39 is this byte
    $0590A4  mulu.w #$9,d0
    $0590A8  move.w d0,$7a3a.w      ; the $05333C draw-priority index, nine per zone

So the class is a **3x3 zone**: which of nine cells of a 3x3 grid the intra-cell position
falls in, against the rectangle the bound structure publishes. The loop at ``$059040``
runs the same routine per resident slot, which is how residents acquire a class of their
own.

The record at ``[$7910]`` is built at ``$053AD8``-``$053B38``, which walks a structure
record backwards, scaling X by ``$539CE``, the header by ``$539D0`` and Z by ``$539D2``
and translating X/Z by ``$7AF2``/``$7AF4``. ``$7AF2``/``$7AF4`` is the bound structure's
intra-cell origin, which this tool checks against the tracked catalogue.

The record is the Building detail whose ``$26000`` slot the cell bind copies into
``$53A85`` from the structure record (#356). The Catalogue publishes each detail's
``extent`` and names a structure's detail as its selection's ``detailModel``, so this tool
also gates that the published extent of the live slot reproduces ``[$7910]``, and that the
instance bound in the player's cell names the live detail and scale.

Checks are gates, not prints: a memstate whose computed zone disagrees with its live
``$7A39`` raises.

Usage (from the repository root):

  python3 research/damocles-st/scripts/placement-class-probe.py \\
      --run research/damocles-st/work/observe-first-world-<id>

  ... --memstate research/damocles-st/snapshots/vesta-parliament-4-6.sav   # repeatable
  ... --all-memstates                                                      # every tracked .sav
  ... --json

See docs/research/damocles-placement-class.md for the findings.
"""

from __future__ import annotations

import argparse
import json
import struct
import sys
from pathlib import Path

LAB_ROOT = Path(__file__).resolve().parents[1]
REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(LAB_ROOT))

from damocleslab.catalogue import hatari_memstate_ram, read_catalogue  # noqa: E402

CATALOGUE = REPO / 'payload' / 'damocles' / 'catalogue.json'
SNAPSHOTS = LAB_ROOT / 'snapshots'

# Addresses the listings name.
ASSOCIATION_A = 0x6FA8          # 256 slots x 4 bytes; byte 3 is the placement class
EXTENT_RECORD = 0x7910          # long: the bound structure's transformed extent record
PLAYER_X_LOW = 0x7AB4           # low word of the player X long at $7AB2
PLAYER_Z_LOW = 0x7ABC           # low word of the player Z long at $7ABA
ZONE_WORD = 0x7A38              # $7A39 is its low byte
PRIORITY_INDEX = 0x7A3A         # nine per zone, indexing $05333C
WORKSPACE_X = 0x7AF2            # the bound structure's intra-cell origin
WORKSPACE_Z = 0x7AF4
SCALE_X, SCALE_Y, SCALE_Z = 0x539CE, 0x539D0, 0x539D2
DETAIL_SLOT = 0x53A84           # self-modified word; its low byte $53A85 is the Building detail
RESIDENT_SLOTS = 256


def u16(data: bytes, address: int) -> int:
    return struct.unpack_from('>H', data, address)[0]


def s16(data: bytes, address: int) -> int:
    return struct.unpack_from('>h', data, address)[0]


def u32(data: bytes, address: int) -> int:
    return struct.unpack_from('>I', data, address)[0]


def zone_of(x: int, z: int, rectangle: tuple[int, int, int, int]) -> int:
    """$059076, as written: two unsigned comparisons per axis, +1 for X and +3 for Z."""
    x_low, x_high, z_low, z_high = rectangle
    value = 0
    if not x < x_low:
        value += 1
        if not x <= x_high:
            value += 1
    if not z < z_low:
        value += 3
        if not z <= z_high:
            value += 3
    return value


def static_rectangle(extent: dict | None, scale: tuple[int, int], origin: tuple[int, int]) -> list[int]:
    """$053B30-$053B38 over a published extent: the five words [$7910] points at.

    Each axis word is scaled with `muls.w` and translated, keeping the low word, and a
    negative scale swaps the pair. A record with no extent publishes the lone $8000.
    """
    if extent is None:
        return [0x8000]
    def axis(pair: list[int], factor: int, offset: int) -> list[int]:
        low, high = ((value * factor + offset) & 0xFFFF for value in pair)
        return [high, low] if factor < 0 else [low, high]
    return [extent['header'] & 0xFFFF, *axis(extent['x'], scale[0], origin[0]),
            *axis(extent['z'], scale[1], origin[1])]


def observe(ram: bytes) -> dict:
    """Read one state's live zone inputs and outputs, and recompute the zone."""
    pointer = u32(ram, EXTENT_RECORD)
    header = s16(ram, pointer)
    rectangle = tuple(u16(ram, pointer + offset) for offset in (2, 4, 6, 8))
    x, z = u16(ram, PLAYER_X_LOW), u16(ram, PLAYER_Z_LOW)
    cell = (u16(ram, PLAYER_X_LOW - 2), u16(ram, PLAYER_Z_LOW - 2))
    computed = 0 if header < 0 else zone_of(x, z, rectangle)
    origin = (u16(ram, WORKSPACE_X), u16(ram, WORKSPACE_Z))
    live = [u16(ram, pointer)] + (list(rectangle) if header >= 0 else [])
    return {
        'detailSlot': u16(ram, DETAIL_SLOT),
        'liveExtent': live,
        'cell': {'x': cell[0], 'z': cell[1]},
        'computedZone': computed,
        'liveClassByte': ram[ZONE_WORD + 1],
        'livePriorityIndex': u16(ram, PRIORITY_INDEX),
        'position': {'x': x, 'z': z},
        'rectangle': list(rectangle),
        'rectangleHeader': header,
        'scale': [s16(ram, SCALE_X), s16(ram, SCALE_Y), s16(ram, SCALE_Z)],
        'structureLocalRectangle': [
            rectangle[0] - origin[0], rectangle[1] - origin[0],
            rectangle[2] - origin[1], rectangle[3] - origin[1],
        ],
        'workspaceOrigin': {'x': origin[0], 'z': origin[1]},
    }


def gate(label: str, reading: dict) -> None:
    if reading['computedZone'] != reading['liveClassByte']:
        raise SystemExit(
            f"{label}: $059076 recomputes zone {reading['computedZone']} but $7A39 reads "
            f"{reading['liveClassByte']}"
        )
    if reading['livePriorityIndex'] != 9 * reading['liveClassByte']:
        raise SystemExit(
            f"{label}: $7A3A reads {reading['livePriorityIndex']}, not nine times $7A39"
        )


def gate_extent(label: str, reading: dict, catalogue: dict) -> None:
    """The Catalogue's extent for the live Building detail slot reproduces [$7910] (#356)."""
    if reading['scale'][1] != 1:
        raise SystemExit(f"{label}: $539D0 reads {reading['scale'][1]}, not the unwritten 1")
    detail = catalogue['tables'][2]['entries'][reading['detailSlot']]
    model = next(model for model in catalogue['models'] if model['id'] == detail)
    origin = (reading['workspaceOrigin']['x'], reading['workspaceOrigin']['z'])
    scale = (reading['scale'][0], reading['scale'][2])
    static = static_rectangle(model['extent'], scale, origin)
    if static != reading['liveExtent']:
        raise SystemExit(
            f"{label}: {detail}'s extent gives {static}, but [$7910] reads {reading['liveExtent']}"
        )
    reading['detailModel'] = detail


def gate_binding(label: str, reading: dict, catalogue: dict) -> None:
    """The bound instance's structure selection names the live detail slot and scale.

    This is the mapping from a Catalogue structure instance to the `$26000` slot: the cell
    bind copies the structure record's Building detail byte into `$53A85`, and the
    Catalogue publishes that detail as the selection's `detailModel`.
    """
    if reading['structureInstance'] is None:
        return
    instance = next(item for item in catalogue['instances'] if item['id'] == reading['structureInstance'])
    model = next(model for model in catalogue['models'] if model['id'] == instance['model'])
    selection = model.get('structureSelection') or {}
    scale = [reading['scale'][0], reading['scale'][2]]
    if selection.get('detailModel') != reading['detailModel'] or selection.get('scale') != scale:
        raise SystemExit(
            f"{label}: {instance['id']} names {selection.get('detailModel')} at "
            f"{selection.get('scale')}, but the bind holds {reading['detailModel']} at {scale}"
        )


def census(ram: bytes, catalogue: dict) -> dict:
    """Compare the authored class against the handling byte for every resident slot."""
    by_id = {instance['id']: instance for instance in catalogue['instances']}
    classes: dict[int, int] = {}
    disagreeing = []
    published = 0
    for slot in range(RESIDENT_SLOTS):
        association = ram[ASSOCIATION_A + slot * 4:ASSOCIATION_A + slot * 4 + 4]
        classes[association[3]] = classes.get(association[3], 0) + 1
        instance = by_id.get(f'object-slot-{slot}')
        if instance is None or instance.get('handling') is None:
            continue
        published += 1
        if instance['handling']['byte'] != association[2]:
            raise SystemExit(f'slot {slot}: catalogue handling byte is not $6FAA')
        if instance.get('placementClass') != association[3]:
            raise SystemExit(f'slot {slot}: catalogue placementClass is not $6FAB')
        if association[3] != association[2] & 0x0F:
            disagreeing.append(slot)
    return {
        'classHistogram': dict(sorted(classes.items())),
        'disagreeingSlots': len(disagreeing),
        'publishedResidents': published,
    }


def bound_structure(reading: dict, body: str, catalogue: dict) -> str | None:
    """$7AF2/$7AF4 is the bound structure's intra-cell origin, so a tracked instance matches.

    The match is gated on the body selector at $7AC9, on the player's cell (the high words
    of $7AB2/$7ABA) and on the instance's model being a structure. Without all three, an
    unrelated instance coincides on the grid phase alone and the reading would claim a
    binding the capture does not show: Acheron's player stands in an empty cell, and a
    structure elsewhere on the body sits at the same centred phase.
    """
    origin = (reading['workspaceOrigin']['x'], reading['workspaceOrigin']['z'])
    cell = (reading['cell']['x'], reading['cell']['z'])
    structures = {model['id'] for model in catalogue['models'] if model['kind'] == 'structure'}
    for instance in catalogue['instances']:
        location = instance.get('location')
        if location is None or location.get('body') != body:
            continue
        if instance.get('model') not in structures:
            continue
        x, z = (round(value * 65536) for value in (location['position'][0], location['position'][2]))
        if (x >> 16, z >> 16) == cell and (x & 0xFFFF, z & 0xFFFF) == origin:
            return instance['id']
    return None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--run', type=Path, required=True,
                        help='an attested observation run directory holding observed.ram')
    parser.add_argument('--memstate', action='append', dest='memstates', type=Path,
                        default=[], help='a tracked Hatari memstate (repeatable)')
    parser.add_argument('--all-memstates', action='store_true',
                        help='use every tracked snapshots/*.sav')
    parser.add_argument('--json', action='store_true')
    args = parser.parse_args(argv)

    ram = (args.run / 'observed.ram').read_bytes()
    catalogue = read_catalogue(CATALOGUE)
    report = {'census': census(ram, catalogue), 'states': []}

    memstates = list(args.memstates)
    if args.all_memstates:
        memstates = sorted(SNAPSHOTS.glob('*.sav'))
    states = [('observed.ram', ram)] + [
        (path.name, hatari_memstate_ram(path.read_bytes())) for path in memstates
    ]
    for label, state in states:
        reading = observe(state)
        gate(label, reading)
        gate_extent(label, reading, catalogue)
        reading['label'] = label
        reading['body'] = f'body-{state[0x7AC9] // 4}'
        reading['structureInstance'] = bound_structure(reading, reading['body'], catalogue)
        gate_binding(label, reading, catalogue)
        report['states'].append(reading)

    if args.json:
        print(json.dumps(report, indent=2, sort_keys=True))
        return 0
    print(f"{report['census']['publishedResidents']} published residents; "
          f"{report['census']['disagreeingSlots']} disagree with the handling nibble")
    print(f"class histogram over {RESIDENT_SLOTS} slots: {report['census']['classHistogram']}")
    print()
    print(f"{'state':38s} {'zone':>5} {'$7A39':>6} {'$7A3A':>6} {'local rectangle':>28} "
          f"{'detail':>16} {'structure instance':s}")
    for state in report['states']:
        local = state['structureLocalRectangle'] if state['rectangleHeader'] >= 0 else '-'
        print(f"{state['label']:38s} {state['computedZone']:5d} {state['liveClassByte']:6d} "
              f"{state['livePriorityIndex']:6d} {str(local):>28} "
              f"{state['detailModel']:>16} {state['structureInstance'] or '-'}")
    print()
    print(f'{len(report["states"])} states reproduce $7A39 and $7A3A from $059076, and [$7910] '
          'from the Catalogue extent of the live Building detail slot.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
