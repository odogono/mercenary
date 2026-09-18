#!/usr/bin/env python3
"""Build the Gamma System location coverage ledger for #314.

Two independent jobs, deliberately kept in one tool because they answer one
question — where can an ordinary takeable object be reached, and can the player
stand there:

1. ``ledger`` reads the tracked ``payload/damocles/catalogue.json`` and reports,
   per celestial body, how many resident object slots exist, how many are
   takeable, which have a recovered surface location, which are only
   interior-associated, and which scene selectors an interior-associated
   resident needs before it can be placed. Nothing here reads Restricted
   Material: the catalogue payload is the tracked, published evidence.

2. ``poses`` reads on-foot Hatari memstates and reports the camera words that
   establish a validated on-foot arrival pose for that body. The memstates are
   Restricted Material and stay ignored under ``research/damocles-st/snapshots``;
   only the decoded pose words and the derived workspace cell leave this tool.
   The derived cell is a cross-check, not an assumption: it must agree with the
   cell each workspace note already records.

A body-local workspace origin is required to derive the cell, and the tool
refuses to guess one. Origins come from the per-body workspace notes under
``docs/research/``.

Usage:
    python3 scripts/location-ledger.py ledger [--catalogue PATH] [--json]
    python3 scripts/location-ledger.py poses --memstate NAME=PATH ... [--json]
    python3 scripts/location-ledger.py poses --memstate ... --payload PATH
"""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from damocleslab.catalogue import hatari_memstate_ram  # noqa: E402

REPO = Path(__file__).resolve().parents[3]
CATALOGUE = REPO / 'payload' / 'damocles' / 'catalogue.json'
ARRIVAL_POSES = REPO / 'payload' / 'damocles' / 'arrival-poses.json'

# Camera and occupancy words, established in docs/research/damocles-walk-board-flight.md
# and docs/research/damocles-gamma-system.md.
ON_FOOT = 0x7A8E
CAMERA_X = 0x7A92
CAMERA_Y = 0x7A96
CAMERA_Z = 0x7A9A
CAMERA_YAW = 0x7AA2
CAMERA_YAW_TWIN = 0x7AC2
BODY_SELECTOR = 0x7AA8
PLACE_LIST = 0x7A6C
# The engine's own current-surface-cell word, established in
# docs/research/damocles-resident-objects.md and used by the object-drop matcher
# in docs/research/damocles-object-drops.md. Low nibble is the body-local cell x,
# high nibble is z.
CELL_WORD = 0x7B5C

CELL_UNITS = 65536
CELLS_PER_AXIS = 16
YAW_UNITS_PER_TURN = 1024
YAW_NORTH = 512

# Body-local 16x16 workspace origins, in whole cells, as recovered by the
# per-body workspace notes. A body absent from this table has no recovered
# workspace origin and therefore no derivable arrival cell.
WORKSPACE_ORIGINS = {
    4: ((3252, 1314), 'docs/research/damocles-dion-workspace.md'),
    8: ((512, 1792), 'docs/research/damocles-gaea-ur-city-workspace.md'),
    11: ((64, 128), 'docs/research/damocles-catalogue.md'),
    14: ((1083, 307), 'docs/research/damocles-vesta-workspace.md'),
}


def s32(data: bytes, address: int) -> int:
    return struct.unpack_from('>i', data, address)[0]


def u16(data: bytes, address: int) -> int:
    return struct.unpack_from('>H', data, address)[0]


def u32(data: bytes, address: int) -> int:
    return struct.unpack_from('>I', data, address)[0]


def resident_slots(catalogue: dict) -> dict[int, dict]:
    return {
        int(instance['id'].rsplit('-', 1)[1]): instance
        for instance in catalogue['instances']
        if instance['id'].startswith('object-slot-')
    }


def resident_body(instance: dict) -> str | None:
    if instance['location']:
        return instance['location']['body']
    if instance['association']:
        return instance['association']['body']
    return None


def build_ledger(catalogue: dict) -> dict:
    """Per-body resident coverage, plus the residents no body claims."""
    names = {body['id']: body['name'] for body in catalogue['bodies']}
    slots = resident_slots(catalogue)
    rows: dict[str, dict] = {}
    for body_id, name in names.items():
        rows[body_id] = {
            'body': body_id,
            'name': name,
            'residents': 0,
            'takeable': 0,
            'surface': 0,
            'surfaceTakeable': 0,
            'interior': 0,
            'interiorTakeable': 0,
            'placements': 0,
            'scenes': [],
        }
    unclaimed = []
    for slot in sorted(slots):
        instance = slots[slot]
        body_id = resident_body(instance)
        if body_id is None:
            unclaimed.append({
                'slot': slot,
                'name': instance['name'],
                'takeable': instance['handling']['takeable'],
                'handlingByte': instance['handling']['byte'],
            })
            continue
        row = rows[body_id]
        row['residents'] += 1
        takeable = instance['handling']['takeable']
        row['takeable'] += takeable
        if instance['location']:
            row['surface'] += 1
            row['surfaceTakeable'] += takeable
        elif instance['association']:
            row['interior'] += 1
            row['interiorTakeable'] += takeable
            association = instance['association']
            scene = [
                association['structureGroupSelector'],
                association['cell'],
                association['levelSelector'],
            ]
            if scene not in row['scenes']:
                row['scenes'].append(scene)
        if instance['placement']:
            row['placements'] += 1
    for row in rows.values():
        row['scenes'].sort()
    missing = [
        slot for slot in range(1, 256)
        if slot not in slots
    ]
    return {
        'bodies': [rows[body_id] for body_id in names],
        'unclaimed': unclaimed,
        'nullModelSlots': missing,
        'totals': {
            'residents': len(slots),
            'takeable': sum(1 for i in slots.values() if i['handling']['takeable']),
            'surface': sum(1 for i in slots.values() if i['location']),
            'interior': sum(1 for i in slots.values() if not i['location'] and i['association']),
            'placements': sum(1 for i in slots.values() if i['placement']),
            'scenes': len({
                (
                    i['association']['body'],
                    i['association']['structureGroupSelector'],
                    i['association']['cell'],
                    i['association']['levelSelector'],
                )
                for i in slots.values()
                if not i['location'] and i['association']
            }),
        },
    }


def read_pose(label: str, path: Path) -> dict:
    """Decode one on-foot arrival pose from a Hatari memstate."""
    blob = path.read_bytes()
    ram = blob if len(blob) == 1048576 else hatari_memstate_ram(blob)
    selector = u16(ram, BODY_SELECTOR)
    if selector % 4:
        raise ValueError(f'{label}: body selector ${selector:04X} is not four times an index')
    index = selector // 4
    on_foot = u16(ram, ON_FOOT)
    yaw = u16(ram, CAMERA_YAW)
    twin = u16(ram, CAMERA_YAW_TWIN)
    if yaw != twin:
        raise ValueError(f'{label}: camera yaw ${yaw:04X} and twin ${twin:04X} disagree')
    position = [s32(ram, CAMERA_X), s32(ram, CAMERA_Y), s32(ram, CAMERA_Z)]
    pose = {
        'id': label,
        'body': f'body-{index}',
        'bodySelector': selector,
        'onFoot': bool(on_foot),
        'position': {'x': position[0], 'y': position[1], 'z': position[2]},
        'yaw': yaw,
        'placeListPointer': u32(ram, PLACE_LIST),
        'memstateSha256': hashlib.sha256(blob).hexdigest(),
        'ramSha256': hashlib.sha256(ram).hexdigest(),
    }
    # The cell is read from the engine rather than derived, because a body can
    # carry more than one 16x16 workspace and only a handful of origins are
    # recovered. Where an origin is recovered the derivation is kept as a
    # cross-check; where it disagrees, the pose stands in a second workspace.
    cell = u16(ram, CELL_WORD)
    if cell > 0xFF:
        raise ValueError(f'{label}: cell word ${cell:04X} is outside a 16x16 workspace')
    local_x, local_z = cell & 0x0F, cell >> 4
    implied_x = (position[0] // CELL_UNITS) - local_x
    implied_z = (position[2] // CELL_UNITS) - local_z
    pose['cell'] = cell
    pose['localCell'] = {'x': local_x, 'z': local_z}
    pose['impliedWorkspaceOrigin'] = {'x': implied_x, 'z': implied_z}
    origin = WORKSPACE_ORIGINS.get(index)
    if origin is None:
        pose['workspaceOrigin'] = None
        pose['cellEvidence'] = (
            'Read from the engine cell word $7B5C. The body has no recovered 16x16 workspace '
            'origin, so the cell is not yet anchored to the body surface; the camera longwords '
            f'imply an origin of {implied_x},{implied_z} for the workspace this pose stands in.'
        )
        return pose
    (origin_x, origin_z), evidence = origin
    if (implied_x, implied_z) == (origin_x, origin_z):
        pose['workspaceOrigin'] = {'x': origin_x, 'z': origin_z}
        pose['cellEvidence'] = (
            'Read from the engine cell word $7B5C and independently confirmed by the camera '
            f'longwords against the workspace origin {origin_x},{origin_z} ({evidence}).'
        )
        return pose
    pose['workspaceOrigin'] = None
    pose['cellEvidence'] = (
        'Read from the engine cell word $7B5C. The camera longwords put this pose outside the '
        f'one recovered workspace on the body (origin {origin_x},{origin_z}, {evidence}); they '
        f'imply a second workspace with origin {implied_x},{implied_z}, which no workspace note '
        'has recovered, so the cell is not anchored to that note.'
    )
    return pose


def bearing_degrees(yaw: int) -> float:
    return ((yaw - YAW_NORTH) % YAW_UNITS_PER_TURN) / YAW_UNITS_PER_TURN * 360


def render_ledger(ledger: dict) -> str:
    lines = [
        f"{'idx':>3}  {'body':<9}{'res':>4}{'take':>5}{'surf':>5}{'sTk':>4}"
        f"{'int':>5}{'iTk':>4}{'plc':>4}{'scenes':>7}"
    ]
    for index, row in enumerate(ledger['bodies']):
        lines.append(
            f"{index:>3}  {row['name']:<9}{row['residents']:>4}{row['takeable']:>5}"
            f"{row['surface']:>5}{row['surfaceTakeable']:>4}{row['interior']:>5}"
            f"{row['interiorTakeable']:>4}{row['placements']:>4}{len(row['scenes']):>7}"
        )
    totals = ledger['totals']
    lines.append('')
    lines.append(
        f"totals: {totals['residents']} residents, {totals['takeable']} takeable, "
        f"{totals['surface']} surface-located, {totals['interior']} interior-associated, "
        f"{totals['placements']} recovered placements, {totals['scenes']} distinct scene selectors"
    )
    lines.append(
        'unclaimed residents: '
        + ', '.join(f"{item['slot']} {item['name']}" for item in ledger['unclaimed'])
    )
    lines.append(
        'NULL-model slots (no instance emitted): '
        + ', '.join(str(slot) for slot in ledger['nullModelSlots'])
    )
    return '\n'.join(lines)


def render_poses(poses: list[dict]) -> str:
    lines = [f"{'id':<24}{'body':<9}{'cell':>6}{'yaw':>7}{'bearing':>10}  position"]
    for pose in poses:
        cell = '—' if pose['cell'] is None else f"${pose['cell']:02X}"
        yaw = f"${pose['yaw']:04X}"
        position = pose['position']
        lines.append(
            f"{pose['id']:<24}{pose['body']:<9}{cell:>6}{yaw:>7}"
            f"{bearing_degrees(pose['yaw']):>9.2f}°  "
            f"{position['x']}, {position['y']}, {position['z']}"
        )
    return '\n'.join(lines)


def published_pose(pose: dict, names: dict[str, str]) -> dict:
    """One pose as the payload document carries it.

    The cell always publishes, because the engine reports it directly. What can
    be missing is the anchor: a body whose 16x16 workspace origin is unrecovered
    publishes a null ``workspaceOrigin`` alongside the origin its own longwords
    imply, so the cell is usable now and anchorable later without a guess.
    """
    return {
        'id': pose['id'],
        'body': pose['body'],
        'name': names.get(pose['body'], pose['body']),
        'bodySelector': pose['bodySelector'],
        'onFoot': pose['onFoot'],
        'position': pose['position'],
        'yaw': pose['yaw'],
        'cell': pose['cell'],
        'localCell': pose.get('localCell'),
        'workspaceOrigin': pose.get('workspaceOrigin'),
        'impliedWorkspaceOrigin': pose.get('impliedWorkspaceOrigin'),
        'evidence': {
            'memstateSha256': pose['memstateSha256'],
            'ramSha256': pose['ramSha256'],
            'cell': pose['cellEvidence'],
        },
    }


def payload_document(poses: list[dict], catalogue: dict) -> dict:
    names = {body['id']: body['name'] for body in catalogue['bodies']}
    return {
        'schemaVersion': 1,
        'title': 'Damocles',
        'source': {
            'authority': 'Damocles Atari ST Working Authority',
            'evidence': 'docs/research/damocles-gamma-system-location-ledger.md',
            'programSha256': catalogue['source']['programSha256'],
        },
        'coverage': {
            'complete': False,
            'notes': [
                'One or more validated on-foot poses per body, each taken from a live capture of '
                'the player standing on that body. Each is a reachable standing position, not an '
                'authored landing site and not a claim about the rest of the body. Where a body '
                'carries two poses they stand in different places, and often in different '
                'workspaces; the ids say which.',
                'Bodies absent from this document have no capture of the player standing on them. '
                'Absence is an unresolved gap, not evidence that the body is unlandable.',
                'Positions are raw signed engine longwords in the body-local surface grid at '
                '65,536 units per cell. The yaw word wraps every 1024 units with north at $0200 '
                'modulo $0400, rising clockwise.',
                'The yaw word is published raw and carries bits above $03FF; only its low ten '
                'bits are the bearing, as the existing Eris presentation document already assumes.',
                'The cell is read from the engine cell word $7B5C, the same word the resident '
                'object and object-drop matchers compare against. Where the body has a recovered '
                '16x16 workspace origin, the camera longwords reproduce that cell independently '
                'and workspaceOrigin carries the origin.',
                'A 16x16 workspace is a window onto a body surface that spans thousands of '
                'cells, so one body can carry several. Where the longwords put a pose outside the '
                'one recovered workspace on its body, workspaceOrigin is null and the evidence '
                'field says so; impliedWorkspaceOrigin always carries the origin that pose\'s own '
                'longwords and cell imply, so an unanchored cell can be anchored later without '
                'guessing. Two poses that agree on an implied origin stand in the same window.',
                'Source memstates are Restricted Material and are not published; their SHA-256 '
                'values identify them.',
                'Every memstate behind this document was captured by an IPF-capable Hatari 2.6.1 '
                'build and rehosted onto the pinned build by '
                'research/damocles-st/scripts/memstate-rehost.py (#331). Only the snapshot '
                'container changed: each pose decodes to the same words and the same ramSha256 '
                'as before, and all of them restore and run in the pinned laboratory.',
            ],
        },
        'orientation': {
            'north': '+z',
            'east': '+x',
            'yawUnitsPerTurn': YAW_UNITS_PER_TURN,
            'yawNorth': YAW_NORTH,
            'yawPositive': 'clockwise',
        },
        'coordinateSystem': {
            'kind': 'body-local-surface-grid',
            'units': 'native-engine-units',
            'cellUnits': CELL_UNITS,
            'cellsPerAxis': CELLS_PER_AXIS,
        },
        'poses': [published_pose(pose, names) for pose in poses],
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest='command', required=True)

    ledger_parser = sub.add_parser('ledger', help='per-body resident coverage from the tracked payload')
    ledger_parser.add_argument('--catalogue', type=Path, default=CATALOGUE)
    ledger_parser.add_argument('--json', action='store_true')

    poses_parser = sub.add_parser('poses', help='on-foot arrival poses from Hatari memstates')
    poses_parser.add_argument('--memstate', action='append', default=[], metavar='ID=PATH',
                              help='identified on-foot memstate, repeatable')
    poses_parser.add_argument('--catalogue', type=Path, default=CATALOGUE)
    poses_parser.add_argument('--payload', type=Path, nargs='?', const=ARRIVAL_POSES,
                              help='write the arrival-pose payload document')
    poses_parser.add_argument('--json', action='store_true')

    args = parser.parse_args(argv)

    if args.command == 'ledger':
        catalogue = json.loads(args.catalogue.read_text())
        ledger = build_ledger(catalogue)
        print(json.dumps(ledger, indent=1) if args.json else render_ledger(ledger))
        return 0

    if not args.memstate:
        parser.error('poses needs at least one --memstate ID=PATH')
    poses = []
    for item in args.memstate:
        label, _, raw = item.partition('=')
        if not raw:
            parser.error(f'--memstate {item} is not ID=PATH')
        pose = read_pose(label, Path(raw))
        if not pose['onFoot']:
            raise SystemExit(f'{label}: the capture is not on foot, so it is not an arrival pose')
        poses.append(pose)
    poses.sort(key=lambda pose: int(pose['body'].split('-')[1]))
    print(json.dumps(poses, indent=1) if args.json else render_poses(poses))
    if args.payload:
        catalogue = json.loads(args.catalogue.read_text())
        args.payload.write_text(json.dumps(payload_document(poses, catalogue), indent=1) + '\n')
        print(f'wrote {args.payload}', file=sys.stderr)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
