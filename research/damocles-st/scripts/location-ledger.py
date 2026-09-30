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
STRINGS = REPO / 'payload' / 'damocles' / 'strings.json'

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
# The live message pointer and its gate, established in
# docs/research/damocles-message-reveal.md. $7B98 is an absolute address that
# advances through a system-string record as the message reveals, so the record
# is the table entry with the greatest address at or below it.
MESSAGE_POINTER = 0x7B98
MESSAGE_GATE = 0x7BA0

# The two ten-second environmental warnings, system string slots 4 and 6. A pose
# presenting one is standing somewhere the player is already dying; see
# docs/research/damocles-non-eris-workspaces.md. The converse does not hold --
# the gate falls long before the ten seconds are up.
HAZARD_SLOTS = {4, 6}

# The engine's own current-surface-cell word, established in
# docs/research/damocles-resident-objects.md and used by the object-drop matcher
# in docs/research/damocles-object-drops.md. Low nibble is the body-local cell x,
# high nibble is z.
CELL_WORD = 0x7B5C

# The Body Coordinate Readout words the panel prints as `016-283`, and the closed form
# behind them, established in docs/research/damocles-gamma-system.md (#371). Each is the
# top ten bits of a body position longword, the z axis biased by a quarter turn, and each
# field prints rescaled from 1024 to 1000.
BODY_COORDINATE_X = 0x7A1E
BODY_COORDINATE_Z = 0x7A22
BODY_STEP_SHIFT = 18
BODY_STEPS = 0x400
BODY_Z_BIAS = 0x100

# The day/night terminator at $050562 (#494, #497). $0062EA + 4*body is the Body's
# rotation accumulator, which the VBL handler advances by the rate the catalogue
# publishes; the surface pass adds its high word to $7A1E, masked to ten bits, so one
# turn is $04000000. $79BE
# is the Body's sub-stellar longitude, written once on arrival at $04EA30 as a table
# atan2 of the Body's centre, and $7A4E is the terminator's own day flag.
BODY_TURN = 0x62EA
SUB_STELLAR_LONGITUDE = 0x79BE
DAYLIGHT = 0x7A4E

# The Floor the player stands on, established in docs/research/damocles-lift-control.md
# (#471). $7AC4 is the live Floor and $7AA4 its committed copy, which $058F78 refreshes
# every frame, so the two agree in a settled capture. Outside a structure both are 0.
# The eye stands at Floor x the bound structure's storey pitch $7B00 + 63, which the
# capture must reproduce: the Floor is read, never derived from the height (#474).
FLOOR = 0x7AA4
FLOOR_LIVE = 0x7AC4
STOREY = 0x7B00
FLOOR_EYE = 63

CELL_UNITS = 65536
CELLS_PER_AXIS = 16
YAW_UNITS_PER_TURN = 1024
YAW_NORTH = 512

# Body-local 16x16 workspace origins, in whole cells, as recovered by the
# per-body workspace notes. A body absent from this table has no recovered
# workspace origin and therefore no derivable arrival cell.
SWEEP = 'docs/research/damocles-non-eris-workspaces.md'

# A body carries several 16x16 windows, so each entry is a list. An origin is
# here only where a live workspace has been extracted at it and published in the
# catalogue payload; #172 recovered eighteen bodies' worth in one pass. MIDAS is
# a uniform field (FIELD_ORIGINS below), and DAMOCLES binds the empty group $00,
# so it has no workspace to stand in.
WORKSPACE_ORIGINS = {
    1: [((624, 688), SWEEP)],
    3: [((3419, 298), SWEEP)],
    4: [((3252, 1314), 'docs/research/damocles-dion-workspace.md')],
    5: [((42, 225), SWEEP)],
    6: [((2421, 300), SWEEP)],
    8: [((512, 1792), 'docs/research/damocles-gaea-ur-city-workspace.md'),
        ((256, 768), SWEEP)],
    9: [((2564, 873), SWEEP)],
    10: [((3487, 1445), SWEEP)],
    11: [((64, 128), 'docs/research/damocles-catalogue.md')],
    12: [((3974, 1396), SWEEP)],
    13: [((2546, 3334), SWEEP)],
    14: [((1083, 307), 'docs/research/damocles-vesta-workspace.md')],
    15: [((2527, 1066), SWEEP)],
    16: [((3896, 0), SWEEP)],
    17: [((1294, 2648), SWEEP)],
    20: [((421, 1799), SWEEP)],
    21: [((1999, 3256), SWEEP)],
    23: [((1661, 1586), SWEEP)],
    25: [((2737, 1571), SWEEP)],
    26: [((3834, 821), SWEEP)],
    27: [((2817, 268), SWEEP)],
}

# A uniform field has no one window: $054B76 masks the island-local cell to its
# low four bits on MIDAS, so the player always stands in the window whose origin
# is congruent to the island record's modulo 16. That window is the origin a
# pose there publishes (#172).
FIELD_ORIGINS = {
    2: ((1729, 938), 'docs/research/damocles-midas-field.md'),
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


def capture_message(ram: bytes) -> dict | None:
    """The system-string record the live message pointer is inside at capture.

    The pointer advances through the record as the message reveals, so the
    record is the tracked system string with the greatest address at or below
    it -- the rule ``arrival-route-probe.py`` already uses against the running
    machine, applied here to a memstate and the tracked strings payload, so the
    pose tool needs no extra input.
    """
    pointer = u32(ram, MESSAGE_POINTER)
    if not pointer:
        return None
    strings = json.loads(STRINGS.read_text())['systemStrings']['entries']
    records = [item for item in strings if int(item['address'], 16) <= pointer]
    if not records:
        return None
    record = max(records, key=lambda item: int(item['address'], 16))
    slot = record['slot']
    # The gate's three values are 0 lowered, $0001 just raised and $FFFF
    # presenting, so a message is on screen exactly when the gate is non-zero.
    # With the gate down the pointer is a residue of the last message, which is
    # why the record alone cannot be read as the capture's environment.
    gate = u16(ram, MESSAGE_GATE)
    return {
        'messageGate': gate,
        'presenting': bool(gate),
        'systemStringSlot': slot,
        'text': record['text'].strip(),
        'hazardWarning': bool(gate) and slot in HAZARD_SLOTS,
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
        'captureEnvironment': capture_message(ram),
    }
    # The cell is read from the engine rather than derived, because a body can
    # carry more than one 16x16 workspace and only a handful of origins are
    # recovered. Where an origin is recovered the derivation is kept as a
    # cross-check; where it disagrees, the pose stands in a second workspace.
    derived = body_coordinate(position[0], position[2])
    engine = (u16(ram, BODY_COORDINATE_X), u16(ram, BODY_COORDINATE_Z))
    if engine != (derived['stepX'], derived['stepZ']):
        raise ValueError(
            f'{label}: engine body coordinate {engine} disagrees with the camera longwords '
            f"({derived['stepX']}, {derived['stepZ']})"
        )
    pose['bodyCoordinate'] = derived
    # The terminator is derived from the turn and the sub-stellar longitude, and
    # refused where it disagrees with the engine's own day flag.
    pose['bodyTurn'] = u32(ram, BODY_TURN + selector)
    pose['subStellarLongitude'] = u16(ram, SUB_STELLAR_LONGITUDE)
    lit = daylight(pose['subStellarLongitude'], pose['bodyTurn'], derived['stepX'], derived['stepZ'])
    if lit != bool(u16(ram, DAYLIGHT)):
        raise ValueError(f'{label}: the terminator disagrees with the engine day flag ${u16(ram, DAYLIGHT):04X}')
    pose['daylight'] = lit

    floor = u16(ram, FLOOR)
    if floor != u16(ram, FLOOR_LIVE):
        raise ValueError(f'{label}: $7AA4 Floor {floor} disagrees with $7AC4 {u16(ram, FLOOR_LIVE)}')
    if floor > 10:
        raise ValueError(f'{label}: Floor {floor} is outside 0..10')
    if position[1] != floor * u16(ram, STOREY) + FLOOR_EYE:
        raise ValueError(
            f'{label}: eye Y {position[1]} is not Floor {floor} x storey {u16(ram, STOREY)} + {FLOOR_EYE}'
        )
    pose['floor'] = floor

    cell = u16(ram, CELL_WORD)
    if cell > 0xFF:
        raise ValueError(f'{label}: cell word ${cell:04X} is outside a 16x16 workspace')
    local_x, local_z = cell & 0x0F, cell >> 4
    implied_x = (position[0] // CELL_UNITS) - local_x
    implied_z = (position[2] // CELL_UNITS) - local_z
    pose['cell'] = cell
    pose['localCell'] = {'x': local_x, 'z': local_z}
    pose['impliedWorkspaceOrigin'] = {'x': implied_x, 'z': implied_z}
    field = FIELD_ORIGINS.get(index)
    if field is not None:
        (field_x, field_z), evidence = field
        if (implied_x - field_x) % CELLS_PER_AXIS or (implied_z - field_z) % CELLS_PER_AXIS:
            raise ValueError(
                f'{label}: implied origin {implied_x},{implied_z} is not congruent to the '
                f'field origin {field_x},{field_z} modulo {CELLS_PER_AXIS}'
            )
        pose['workspaceOrigin'] = {'x': implied_x, 'z': implied_z}
        pose['cellEvidence'] = (
            'Read from the engine cell word $7B5C. This body is a uniform field whose '
            'island-local cell wraps at 16 ($054B76), so the camera longwords imply the window '
            f'{implied_x},{implied_z}, congruent to the field origin {field_x},{field_z} '
            f'modulo 16 ({evidence}).'
        )
        return pose
    windows = WORKSPACE_ORIGINS.get(index, [])
    match = next((item for item in windows if item[0] == (implied_x, implied_z)), None)
    if match is not None:
        (origin_x, origin_z), evidence = match
        pose['workspaceOrigin'] = {'x': origin_x, 'z': origin_z}
        pose['cellEvidence'] = (
            'Read from the engine cell word $7B5C and independently confirmed by the camera '
            f'longwords against the workspace origin {origin_x},{origin_z} ({evidence}).'
        )
        return pose
    pose['workspaceOrigin'] = None
    if not windows:
        pose['cellEvidence'] = (
            'Read from the engine cell word $7B5C. The body has no recovered 16x16 workspace '
            'origin, so the cell is not yet anchored to the body surface; the camera longwords '
            f'imply an origin of {implied_x},{implied_z} for the workspace this pose stands in.'
        )
        return pose
    recovered = '; '.join(f'{x},{z}' for (x, z), _ in windows)
    pose['cellEvidence'] = (
        'Read from the engine cell word $7B5C. The camera longwords put this pose outside every '
        f'recovered workspace on the body ({recovered}); they imply a further workspace with '
        f'origin {implied_x},{implied_z}, which no workspace note has recovered, so the cell is '
        'not anchored to one.'
    )
    return pose


def daylight(sub_stellar_longitude: int, body_turn: int, step_x: int, step_z: int) -> bool:
    """$050562: day where the observer's System longitude is a quarter turn or more from
    the sub-stellar longitude, bit 9 of the biased latitude (``stepZ``) inverting the answer."""
    longitude = (step_x + (body_turn >> 16)) % BODY_STEPS
    return bool((((sub_stellar_longitude - longitude + 0x100) & 0x200) + step_z) & 0x200)


def body_coordinate(position_x: int, position_z: int) -> dict:
    """The Body Coordinate Readout pair derived from a body position.

    The engine keeps the same two words at $7A1E and $7A22, so ``read_pose``
    checks the derivation against them rather than trusting it.
    """
    step_x = (position_x >> BODY_STEP_SHIFT) % BODY_STEPS
    step_z = ((position_z >> BODY_STEP_SHIFT) + BODY_Z_BIAS) % BODY_STEPS
    return {
        'stepX': step_x,
        'stepZ': step_z,
        'readout': f'{step_x * 1000 // 1024:03d}-{step_z * 1000 // 1024:03d}',
    }


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
    lines = [
        f"{'id':<24}{'body':<9}{'cell':>6}{'floor':>6}{'yaw':>7}{'bearing':>10}{'nav':>9}{'sky':>7}  position"
    ]
    for pose in poses:
        cell = '—' if pose['cell'] is None else f"${pose['cell']:02X}"
        yaw = f"${pose['yaw']:04X}"
        position = pose['position']
        lines.append(
            f"{pose['id']:<24}{pose['body']:<9}{cell:>6}{pose['floor']:>6}{yaw:>7}"
            f"{bearing_degrees(pose['yaw']):>9.2f}°"
            f"{pose['bodyCoordinate']['readout']:>9}"
            f"{'day' if pose['daylight'] else 'night':>7}  "
            f"{position['x']}, {position['y']}, {position['z']}"
        )
    return '\n'.join(lines)


def published_pose(pose: dict, names: dict[str, str]) -> dict:
    """One pose as the payload document carries it.

    The cell always publishes, because the engine reports it directly. What can
    be missing is the anchor: a body whose 16x16 workspace origin is unrecovered
    publishes a null ``workspaceOrigin`` alongside the origin its own longwords
    imply, so the cell is usable now and anchorable later without a guess.

    ``captureEnvironment`` says what the machine was presenting when the capture
    was taken, because restoring a pose does not always leave a player standing:
    fourteen of them run out a ten-second environmental countdown and die. A
    validated arrival pose is not a survivable one, and the payload says so
    rather than leaving a reader to assume it.
    """
    return {
        'id': pose['id'],
        'body': pose['body'],
        'name': names.get(pose['body'], pose['body']),
        'bodySelector': pose['bodySelector'],
        'onFoot': pose['onFoot'],
        'position': pose['position'],
        'floor': pose['floor'],
        'yaw': pose['yaw'],
        'bodyTurn': pose['bodyTurn'],
        'subStellarLongitude': pose['subStellarLongitude'],
        'cell': pose['cell'],
        'localCell': pose.get('localCell'),
        'workspaceOrigin': pose.get('workspaceOrigin'),
        'impliedWorkspaceOrigin': pose.get('impliedWorkspaceOrigin'),
        'captureEnvironment': pose.get('captureEnvironment'),
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
                'bodyTurn is the Body\'s rotation accumulator at $0062EA + 4 x body, one turn '
                'every $04000000, and subStellarLongitude is $79BE, the Body\'s sub-stellar longitude in '
                'the same 1024-step angle as the yaw. Together with the position they decide the '
                'terminator at $050562; each pose\'s answer agrees with the engine day flag $7A4E. '
                'The sub-stellar longitude is a table atan2 of the Body\'s centre and is read, '
                'not recomputed; on DAMOCLES, whose centre moves, it is the value its arrival wrote.',
                'floor is $7AA4, the Floor the player stands on in the structure bound in the '
                'pose\'s cell, 0 outside one; it equals the live Floor $7AC4, and the position\'s y '
                'is that Floor times the structure\'s storey pitch $7B00 plus 63. The Floor is read '
                'from the capture, not derived from the height.',
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
                'Almost every memstate behind this document was captured by an IPF-capable '
                'Hatari 2.6.1 build and rehosted onto the pinned build by '
                'research/damocles-st/scripts/memstate-rehost.py (#331); '
                'eris-spaceport-onfoot was captured on the pinned build already and its '
                'container is passed through byte for byte. Only the snapshot container '
                'changes: each pose decodes to the same words and the same ramSha256 as before, '
                'and all of them restore and run in the pinned laboratory.',
                'memstateSha256 identifies the rehosted container and ramSha256 the machine '
                'inside it. ramSha256 is the stable identity: it is unchanged for every pose '
                'this document has ever carried. memstateSha256 moved once, when rehosting was '
                'made byte-reproducible - gzip had been stamping the wall clock into the '
                'container header, so one captured memstate produced a different hash on every '
                'rehost. The containers the earlier hashes named hold the same bytes apart from '
                'that timestamp.',
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
