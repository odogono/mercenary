"""Independent extractor of the Damocles Gamma System Body records (ADR 0029, ADR 0043).

Every Body is one selector, `4 * index`, into structure-of-arrays tables resident
in the first-world image: X at `$005F40`, Z at `$005FC0`, size at `$006040`,
appearance at `$0060C0`, Y at `$00626A`, and the name at `$0081DC + 8 * index`.
Slot 30 is VOID, the space-as-place sentinel, and is not published as a Body.

The per-Body draw lists are the other half of what a sky needs. `$00809C` holds
31 long pointers, one per slot, into `$00811C..$0081CC`, where each list is a run
of selector bytes ended by a negative byte. `$059268..$0592AC` stores the current
Body's pointer at `$7918`, and the two sky passes at `$0530C8` and `$05313A` walk it
until a byte tests negative, so a `$00` entry is DIALIS and not padding.

Sizes at `$006040` are packed binary floats (#424), and the sky pass draws a Body
with pixel radius `size / depth` against positions at `256 * u / depth` (#528), so a
Body's radius is `size / 256` System units. See docs/research/damocles-gamma-system.md
and docs/research/damocles-sky-bodies.md.

DAMOCLES is drawn through a comet path of its own (`$04FBF2`), and its centre is the
impact clock's (#440): `$051E88` interpolates the waypoint table at `$052022`. The
`comet` block publishes both, so a Session can place and draw the comet (#538).

The `starfield` block is the star list and colours the three starfields plot from (#578):
one pixel a star, scrolled by yaw and pitch in the ST's own word arithmetic. See
docs/research/damocles-starfield.md.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import struct
from pathlib import Path

from .catalogue import body_base_colour, st_rgb

BODY_X = 0x5F40
BODY_Z = 0x5FC0
BODY_SIZE = 0x6040
BODY_APPEARANCE = 0x60C0
BODY_Y = 0x626A
BODY_NAMES = 0x81DC
DRAW_LIST_POINTERS = 0x809C
DRAW_LIST_AREA = 0x811C
DRAW_LIST_AREA_END = 0x81CD
SLOTS = 31
# VOID, the space-as-place sentinel. It keeps a draw list but is not a Body.
VOID = 30
DAMOCLES = 29
# The sky pass forms positions as 256 * u / depth ($7964 = $00080000, a packed 2^8)
# and radii as size / depth, so a size is 256 radii in the positional unit.
PROJECTION_SCALE_ADDRESS = 0x7964
EYE_Y = 0x799E
# $045A0C loads $FFFF1B00, the packed float 0.84375, and divides each row's
# half-width by it to correct for the ST's non-square low-resolution pixels.
HALF_WIDTH_DIVISOR_ADDRESS = 0x045A0C
# $0530A6 and $0530B0 store the sky clip row: $44 on foot, $88 otherwise.
HORIZON_ROW_ON_FOOT_ADDRESS = 0x0530A6
HORIZON_ROW_OTHERWISE_ADDRESS = 0x0530B0

# The comet (#538). `$051088` installs the waypoint cursor beside the start deadline, and
# `$051E88` walks thirty-one ten-byte records of seconds to impact, X and Z. `$04FBF2`
# projects a tail tip at the centre plus the centre shifted right by `$04FC18`'s count,
# then the head points at `$04FD12`, and `$04F8FE` draws the four polygons at `$04FD2C`.
WAYPOINT_INSTALL = 0x051088
WAYPOINTS = 0x052022
WAYPOINT_RECORD = 10
WAYPOINT_COUNT = 31
TAIL_SHIFT = 0x04FC18
HEAD_POINTS_LOAD = 0x04FC48
HEAD_POINTS = 0x04FD12
POLYGONS_LOAD = 0x04FCA6
POLYGONS = 0x04FD2C
POLYGON_CALLS = 0x04FCBE
HEAD_DISC = 0x04FCE6
# `$04FBF6` projects the tail tip into slot `$80` and each head point into the next.
COMET_SLOT = 0x80

# The starfields (#578): `$0503FE` in flight, `$0505B8` on an island's core on foot and
# `$05067C` in space, each from the list at `$05D8C0` in the colours at `$050778`.
STAR_LIST = 0x05D8C0
STAR_STEPS = 1024
STAR_COLOURS = 0x050778
STAR_COLUMNS_PER_TURN = 1800
STAR_ROW_MASK = 0x03FF
STAR_COLOUR_MASK = 0x3C00
STAR_SCROLL_SCALE = 0xE10E
STAR_PITCH_SCALE = 0x6CCC
STAR_PITCH_OFFSET_FLIGHT = 0x128
STAR_PITCH_OFFSET_SPACE = 0x1C0
# The last x any yaw reads: 319 columns past the scroll at step 1,023.
STAR_LAST_COLUMN = 319 + ((1023 * 2 * STAR_SCROLL_SCALE) >> 16)
STARFIELD_CODE = (
    (0x050500, b'\xd2\xf1\x50\x00\xca\xfc\xe1\x0e', 'the flight scan: index by yaw, scroll by yaw * $E10E'),
    (0x0504FA, b'\x43\xf9\x00\x05\xd8\xc0', 'the lea that loads the star list'),
    (0x050516, b'\x04\x44\x01\x28\xd8\x44\xd8\x44\xc9\xfc\x6c\xcc', 'the flight pitch offset and scale'),
    (0x0506F6, b'\x04\x44\x01\xc0\xd8\x44\xd8\x44\xc9\xfc\x6c\xcc', 'the space pitch offset and scale'),
    (0x0504A8, b'\x30\x29\x00\x42', 'the colour loop reading the word $42 past each slot'),
)

EVIDENCE = 'docs/research/damocles-gamma-system.md'
STARFIELD_EVIDENCE = 'docs/research/damocles-starfield.md'
SKY_EVIDENCE = 'docs/research/damocles-sky-bodies.md'
MOTION_EVIDENCE = 'docs/research/damocles-script-motion-time.md'


def hex_address(address: int) -> str:
    return f'0x{address:06x}'


def packed_float(raw: int) -> float:
    """Decode the engine's packed binary float: a mantissa normalised into $1000..$1FFF
    in the low word, a signed binary exponent in the high word (#424)."""
    mantissa = raw & 0xFFFF
    if not 0x1000 <= mantissa <= 0x1FFF:
        raise ValueError(f'packed float {raw:08x} has an unnormalised mantissa')
    exponent = struct.unpack('>h', struct.pack('>H', raw >> 16))[0]
    return mantissa / 0x1000 * 2.0 ** exponent


def number(value: float) -> int | float:
    return int(value) if value == int(value) else value


def body_name(data: bytes, index: int) -> str:
    return data[BODY_NAMES + index * 8:BODY_NAMES + index * 8 + 8].decode('ascii').strip()


def draw_list(data: bytes, index: int) -> list[int]:
    """The selectors the sky passes walk for one slot, as body indices, in list order.

    The pointer must land inside the list area and the list must end there, so a
    list that does not is refused rather than read into the names that follow.
    """
    pointer = struct.unpack_from('>I', data, DRAW_LIST_POINTERS + index * 4)[0]
    if not DRAW_LIST_AREA <= pointer < DRAW_LIST_AREA_END:
        raise ValueError(f'slot {index} draw list pointer ${pointer:06x} is outside the list area')
    entries = []
    for address in range(pointer, DRAW_LIST_AREA_END):
        selector = data[address]
        if selector & 0x80:
            return entries
        if selector % 4 or selector // 4 >= SLOTS:
            raise ValueError(f'slot {index} draw list byte ${selector:02x} at ${address:06x} '
                             'is not a Body selector')
        entries.append(selector // 4)
    raise ValueError(f'slot {index} draw list is not terminated inside the list area')


def sky(data: bytes) -> dict:
    """The static facts the sky pass reads beyond the Body records (#528)."""
    if data[HALF_WIDTH_DIVISOR_ADDRESS:HALF_WIDTH_DIVISOR_ADDRESS + 2] != b'\x24\x3c':
        raise ValueError('$045A0C is not the move.l #imm,d2 that loads the half-width divisor')
    for address in (HORIZON_ROW_ON_FOOT_ADDRESS, HORIZON_ROW_OTHERWISE_ADDRESS):
        if data[address:address + 2] != b'\x33\xfc':
            raise ValueError(f'${address:06x} is not the move.w #imm,abs.l that sets the clip row')
    # $7964 is added in the log domain, so its high word is the scale's binary exponent.
    exponent, fraction = struct.unpack_from('>hH', data, PROJECTION_SCALE_ADDRESS)
    if fraction:
        raise ValueError('$7964 has a fractional log; the projection scale is not a power of two')
    return {
        'drawListArea': {
            'address': hex_address(DRAW_LIST_AREA),
            'end': hex_address(DRAW_LIST_AREA_END),
            'sha256': hashlib.sha256(data[DRAW_LIST_AREA:DRAW_LIST_AREA_END]).hexdigest(),
        },
        'drawListPointers': {
            'address': hex_address(DRAW_LIST_POINTERS),
            'end': hex_address(DRAW_LIST_POINTERS + SLOTS * 4),
            'sha256': hashlib.sha256(
                data[DRAW_LIST_POINTERS:DRAW_LIST_POINTERS + SLOTS * 4]).hexdigest(),
        },
        'evidence': SKY_EVIDENCE,
        'eyeHeight': struct.unpack_from('>i', data, EYE_Y)[0],
        'halfWidthDivisor': packed_float(
            struct.unpack_from('>I', data, HALF_WIDTH_DIVISOR_ADDRESS + 2)[0]),
        'horizonRows': {
            'onFoot': struct.unpack_from('>H', data, HORIZON_ROW_ON_FOOT_ADDRESS + 2)[0],
            'otherwise': struct.unpack_from('>H', data, HORIZON_ROW_OTHERWISE_ADDRESS + 2)[0],
        },
        'projectionScale': 2 ** exponent,
    }


def expect_code(data: bytes, address: int, code: bytes, what: str) -> None:
    if data[address:address + len(code)] != code:
        raise ValueError(f'${address:06x} is not {what}')


def comet(data: bytes) -> dict:
    """The comet's path and geometry (#538): the waypoint table and the tail and head."""
    expect_code(data, WAYPOINT_INSTALL, b'\x21\xfc' + WAYPOINTS.to_bytes(4, 'big') + b'\x78\x2c',
                'the move.l that installs the waypoint cursor at $782C')
    end = WAYPOINTS + WAYPOINT_COUNT * WAYPOINT_RECORD
    waypoints = []
    for address in range(WAYPOINTS, end, WAYPOINT_RECORD):
        seconds, x, z = struct.unpack_from('>hii', data, address)
        waypoints.append({'seconds': seconds, 'x': x, 'z': z})
    expect_code(data, TAIL_SHIFT, b'\x32\x3c', 'the move.w #imm,d1 that sets the tail shift')
    expect_code(data, HEAD_POINTS_LOAD, b'\x49\xf9' + HEAD_POINTS.to_bytes(4, 'big'),
                'the lea that loads the head points')
    expect_code(data, POLYGONS_LOAD, b'\x41\xf9' + POLYGONS.to_bytes(4, 'big'),
                'the lea that loads the comet polygons')
    expect_code(data, HEAD_DISC, b'\x20\x3c', 'the move.l #imm,d0 that picks the head disc slots')
    points = []
    address = HEAD_POINTS
    while struct.unpack_from('>H', data, address)[0] != 0x8000:
        x, y, z = struct.unpack_from('>hhh', data, address)
        points.append({'x': x, 'y': y, 'z': z})
        address += 6
    # One `bsr.w $04F8FE` a polygon, each a colour word then point slots ended by $00.
    calls = 0
    while data[POLYGON_CALLS + calls * 4:POLYGON_CALLS + calls * 4 + 2] == b'\x61\x00':
        calls += 1
    polygons = []
    address = POLYGONS
    for _ in range(calls):
        colour = struct.unpack_from('>H', data, address)[0]
        address += 2
        slots = []
        while data[address]:
            slot = data[address] - COMET_SLOT
            if slot % 4 or not 0 <= slot // 4 <= len(points):
                raise ValueError(f'comet polygon slot ${data[address]:02x} is not a projected point')
            slots.append(slot // 4)
            address += 1
        address += 1
        polygons.append({'colour': st_rgb(colour), 'sourceColour': colour, 'points': slots})
    head_slots = struct.unpack_from('>HH', data, HEAD_DISC + 2)
    return {
        'evidence': SKY_EVIDENCE,
        'motionEvidence': MOTION_EVIDENCE,
        'headDisc': {'address': hex_address(HEAD_DISC), 'slots': [head_slots[1] // 4, head_slots[0] // 4]},
        'headPoints': {'address': hex_address(HEAD_POINTS), 'offsets': points},
        'polygons': {'address': hex_address(POLYGONS), 'faces': polygons},
        'tailShift': struct.unpack_from('>H', data, TAIL_SHIFT + 2)[0],
        'waypoints': {
            'address': hex_address(WAYPOINTS),
            'end': hex_address(end),
            'sha256': hashlib.sha256(data[WAYPOINTS:end]).hexdigest(),
            'records': waypoints,
        },
    }


def starfield(data: bytes) -> dict:
    """The star list and colours the three starfields draw from (#578).

    The list at `$05D8C0` opens with 1,024 words, one per yaw step: the byte offset of that
    step's first star. The stars follow as word pairs sorted by x, 1,800 columns to a turn,
    and the 268 after the first turn repeat x 0..319 so a scan need not wrap. Each second word
    is a row in its low bits (0..431) and a colour index in bits 10-13. The index is published
    as the first star at or past each step's scroll, so it is not carried. Neither is the
    repeat: a consumer wraps x at `columnsPerTurn`.
    """
    for address, code, what in STARFIELD_CODE:
        expect_code(data, address, code, what)
    index = [struct.unpack_from('>H', data, STAR_LIST + 2 * step)[0] for step in range(STAR_STEPS)]
    stars = []
    address = STAR_LIST + 2 * STAR_STEPS
    while True:
        x, word = struct.unpack_from('>HH', data, address)
        if stars and x < stars[-1][0]:
            raise ValueError(f'star list ${address:06x} is not sorted by x')
        if x > STAR_LAST_COLUMN:
            break
        if word & ~(STAR_ROW_MASK | STAR_COLOUR_MASK):
            raise ValueError(f'star word {word:04x} at ${address:06x} has bits outside the row and colour')
        stars.append((x, word))
        address += 4
    end = address
    once = [star for star in stars if star[0] < STAR_COLUMNS_PER_TURN]
    if stars[len(once):] != [(x + STAR_COLUMNS_PER_TURN, word) for x, word in once[:len(stars) - len(once)]]:
        raise ValueError('the stars past one turn do not repeat the first ones')
    for step, offset in enumerate(index):
        scroll = (step * 2 * STAR_SCROLL_SCALE) >> 16
        first = next(k for k, star in enumerate(stars) if star[0] >= scroll)
        if offset != 2 * STAR_STEPS + 4 * first:
            raise ValueError(f'yaw step {step} does not index the first star past column {scroll}')
    colours = [struct.unpack_from('>H', data, STAR_COLOURS + 4 * slot + 2)[0] for slot in range(16)]
    return {
        'evidence': STARFIELD_EVIDENCE,
        'list': {
            'address': hex_address(STAR_LIST),
            'end': hex_address(end),
            'sha256': hashlib.sha256(data[STAR_LIST:end]).hexdigest(),
        },
        'colours': {
            'address': hex_address(STAR_COLOURS),
            'end': hex_address(STAR_COLOURS + 64),
            'sha256': hashlib.sha256(data[STAR_COLOURS:STAR_COLOURS + 64]).hexdigest(),
            'entries': [{'colour': st_rgb(colour), 'sourceColour': colour} for colour in colours],
        },
        'columnsPerTurn': STAR_COLUMNS_PER_TURN,
        'scrollScale': STAR_SCROLL_SCALE,
        'pitchScale': STAR_PITCH_SCALE,
        'pitchOffsets': {'flight': STAR_PITCH_OFFSET_FLIGHT, 'space': STAR_PITCH_OFFSET_SPACE},
        'stars': [[x, word & STAR_ROW_MASK, (word & STAR_COLOUR_MASK) >> 10] for x, word in once],
    }


def body(data: bytes, index: int, ids: list[str]) -> dict:
    x, y, z = (struct.unpack_from('>i', data, table + index * 4)[0]
               for table in (BODY_X, BODY_Y, BODY_Z))
    size = struct.unpack_from('>I', data, BODY_SIZE + index * 4)[0]
    decoded = packed_float(size)
    colour = body_base_colour(data, index)
    record = {
        'id': ids[index],
        'sourceIndex': index,
        'name': body_name(data, index),
        'baseColour': st_rgb(colour),
        'sourceColour': colour,
        'position': {'x': x, 'y': y, 'z': z},
        'radiusExtent': size,
        'size': number(decoded),
        'radius': number(decoded / 256),
        'drawList': [ids[entry] for entry in draw_list(data, index)],
    }
    if index == DAMOCLES:
        record['positionKind'] = 'capture-time-sample'
    return record


def extract(data: bytes, source: dict) -> dict:
    names = [body_name(data, index) for index in range(SLOTS)]
    if names[0] != 'DIALIS' or names[VOID] != 'VOID':
        raise ValueError('the Body name table does not hold DIALIS first and VOID last')
    ids = [name.lower() for name in names]
    bodies = [body(data, index, ids) for index in range(VOID)]
    for record in bodies:
        if 'void' in record['drawList']:
            raise ValueError(f'{record["name"]} lists VOID, which is not a published Body')
    return {
        'schemaVersion': 1,
        'title': 'Damocles',
        'source': source,
        'coverage': {
            'complete': False,
            'notes': [
                'Resident first-world records only; not a claim of complete disk coverage.',
                'Coordinates are raw signed engine integers and their physical scale is unresolved. '
                'radiusExtent is the raw longword of a packed binary float: its low word is a '
                'mantissa normalised into $1000..$1FFF, an implicit 1 at bit 12, and its high word '
                'is a binary exponent, so size is (raw & $FFFF) / $1000 * 2^(raw >> 16) (#424). '
                'radius is size / 256 in the coordinates\' own unit, recovered rather than derived '
                '(#528): the sky pass draws a Body with pixel radius size / depth while positions '
                'project as 256 * u / depth, and 24 pinned frames match that pixel for pixel.',
                'No explicit type or Primary field and no complete orbital elements were '
                'recovered, so those properties are absent rather than inferred.',
                'DAMOCLES position is a capture-time sample and is not an epoch or a static '
                'authored position; its X and Z differ in the second cold run. The position at any '
                'moment is the impact clock\'s, through comet.waypoints (#440).',
                'VOID is source slot 30 and a place/sentinel, not one of the 30 physical selectors '
                'scanned by the space renderer; it is intentionally absent from bodies.',
                'baseColour is recovered, not authored: sourceColour is the low word of the '
                'longword at $0060C0 + 4*sourceIndex masked to twelve bits, exactly as $0592AC '
                'masks it before publishing it to $7C88, and baseColour expands each nibble by '
                'n * 34 as catalogue.json does. DAMOCLES\'s slot is $0030E000, whose high word the '
                'engine never reads, so its masked colour is $000; the VOID sentinel\'s $777 is '
                'excluded along with the rest of that slot.',
                'baseColour is the colour a Body surface is drawn in wherever no island covers it. '
                'An island record carries its own land colour, which overrides it for that island, '
                'so a consumer drawing a surface needs both and only the base colour is published '
                'here; catalogue.json carries the record colours. Triton is the one Body whose '
                'record colour differs from its base colour.',
                'drawList is the list the sky passes at $0530C8 and $05313A walk while standing on '
                'that Body, read from the pointer at $00809C + 4*sourceIndex into $00811C..$0081CC '
                'and kept in the engine\'s order, which is the order Bodies are drawn in with no '
                'depth sort. A $00 byte is DIALIS: the walker stops only at a negative byte. '
                'DIALIS\'s own list holds only DIALIS, as VOID\'s does; no capture stands on either.',
                'sky carries the static facts the sky pass reads beyond the Body records: the '
                'projection scale at $7964, the eye height above the Body centre at $799E, the '
                'half-width divisor that $045A0C loads to correct for non-square pixels, and the '
                'clip rows $0530A6 and $0530B0 store. $7964 and $799E are RAM, not code, and hold '
                'the published values in every one of 61 captured memstates.',
                'comet carries what places and draws DAMOCLES beyond its Body record (#538). '
                'waypoints is the table $051E88 interpolates from the impact clock (#440): seconds '
                'to impact, X and Z, the path lying in Y = 0. $051088 installs its cursor beside '
                'the start deadline. The tail tip is the centre plus the centre shifted right by '
                'tailShift, Y 0; headPoints are offsets from the centre, projected into the slots '
                'after the tip; each polygon face names its points by index, 0 the tip and 1 on '
                'the head points, in the order $04F8FE draws them. headDisc gives the palette '
                'slots of the disc $04FCE6 draws last, first span then second; with the split at '
                'the rim only the first is painted.',
                'starfield carries the star list the three starfields draw from (#578): $0503FE '
                'in flight, $0505B8 on an island\'s core on foot and $05067C in space. Each star is '
                '[x, row, colour]: x in 1,800 columns to a turn, the row the band puts it on, and '
                'an index into colours, the words at $050778 + 4 * index + 2. A frame scrolls x by '
                '(yaw * 2 * scrollScale) >> 16 and the rows by ((pitch - offset) * 4 * pitchScale) '
                '>> 16, both word arithmetic, with the pitch offset for flight or space. The list '
                'at $05D8C0 also holds a per-yaw index and a repeat of the first 268 stars one '
                'turn on; both follow from the stars and are not published.',
            ],
        },
        'coordinateSystem': {
            'kind': 'resident-cartesian-centre',
            'units': 'native-engine-units',
            'axes': ['x', 'y', 'z'],
        },
        'sky': sky(data),
        'comet': comet(data),
        'starfield': starfield(data),
        'bodies': bodies,
    }


def document_source(data: bytes, run: str, program_sha256: str) -> dict:
    return {
        'authority': 'Damocles Atari ST Working Authority',
        'evidence': EVIDENCE,
        'programSha256': program_sha256,
        'colourTableSha256': hashlib.sha256(
            data[BODY_APPEARANCE:BODY_APPEARANCE + SLOTS * 4]).hexdigest(),
        'ramSha256': hashlib.sha256(data).hexdigest(),
        'run': run,
    }


def dumps(document: dict) -> str:
    """The document as the payload keeps it: two-space JSON, one star to a line."""
    text = json.dumps(document, indent=2) + '\n'
    start = text.index('"stars": [')
    end = text.index('\n    ]', start)
    stars = re.sub(r'\[\s+(\d+),\s+(\d+),\s+(\d+)\s+\]', r'[\1, \2, \3]', text[start:end])
    return text[:start] + stars + text[end:]


def main():
    parser = argparse.ArgumentParser(
        description='Extract the Damocles Gamma System Body records from an attested run')
    parser.add_argument('--run', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    from .catalogue import validate_source
    from .laboratory import verify
    verify(args.run)
    manifest = json.loads((args.run / 'manifest.json').read_text())
    pin = json.loads((Path(__file__).parents[1] / 'config/working-authority.json').read_text())
    validate_source(manifest, pin)
    artifact = next(a for a in manifest['artifacts'] if a['role'] == 'observed-ram')
    data = (args.run / artifact['path']).read_bytes()
    source = document_source(data, args.run.name, manifest['authority']['programSha256'])
    result = extract(data, source)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(dumps(result))
    print(json.dumps({'bodies': len(result['bodies']),
                      'drawListEntries': sum(len(b['drawList']) for b in result['bodies'])}))


if __name__ == '__main__':
    main()
