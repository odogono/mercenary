"""Decode the occupied-cell world geometry of the two opening METIS taxi journeys.

Formats are read from Mercenary III's own readers in a loaded-play image:

* cell workspace `$4CF0`, bound by `$5600C..$56204`: key byte, nine-bit structure
  slot, dx, dz; structure origin = (dx, dz) × [`$4BD14`] + `$8000` within the cell;
* structure table `$4BD0C` (long self-relative offsets). A negative first word is
  an alias (`$56100`): scale bytes at +2/+3, scene palette at +4, detail at +5, the
  target slot at +6. A direct record carries scale, palette and detail in the
  eight bytes before it (`$5614E`);
* structure assembler `$5AD2C..$5AE62`: heights, two scene colours, scaled plan
  vertices, then wall records whose forms 3..6 carry two further references;
* attachments and regions `$5AE62..$5B2D2`: wall texts (low byte 1..`$0F`), keyed
  doors, then regions with bound sentinels, the 11-unit door inset and a byte
  queue each; then the association list (`$71A6`) the occupant table reads;
* region queue build `$5B3E8..$5B48E` and plan walk `$5B7BE`: queue bytes below
  `$96` name walls, bytes from `$96` name attachments (`$FF` is slot `$254`);
* detail table (`$4BD12` → `$54AEA`) and selection groups `$54BD0..$54D20`;
* ground reader `$56204..$563C4`: transformed vertices, primitives and `$7xxx`
  street-furniture templates;
* scene palettes `$4BD16` (`$5617E`).

Geometry is kept in each record's own local frame, with the structure scale
applied exactly as the readers apply it. Placement in the world is the cell's.
This module reads only Mercenary III.
"""

from __future__ import annotations

from .ram import Ram, hexaddr

CELL_WORKSPACE = 0x4CF0
CELL_ORIENTATION = 0x4170
GROUND_WORDS = 0x1AEC0
RUN_GRID = 0x1AAC0
STRUCTURE_TABLE_POINTER = 0x4BD0C
MODEL_TABLE_POINTER = 0x4BD10
DETAIL_TABLE_POINTER = 0x4BD12
CELL_SPACING_POINTER = 0x4BD14
PALETTE_TABLE_POINTER = 0x4BD16
# $561FC: the ground transform selected by (orientation + run phase) & 3, plus 4
# when the run's mirror bit is set.
GROUND_TRANSFORMS = (0x00, 0x06, 0x03, 0x05, 0x01, 0x04, 0x02, 0x07)
FIRST_ATTACHMENT_SLOT = 0x254


def structure_record(ram: Ram, slot: int) -> int:
    table = ram.long(STRUCTURE_TABLE_POINTER)
    return table + ram.long(table + 4 * slot)


def cell_entry(ram: Ram, cell: int) -> dict:
    """`$5600C`: one 4-byte cell workspace record and what the bind derives from it."""
    base = CELL_WORKSPACE + 4 * cell
    key = ram.byte(base) & 0xFE
    slot = ram.word(base) & 0x1FF
    # `muls.w $4BD14.l`: the spacing is the word at that address, not a pointer.
    spacing = ram.sword(CELL_SPACING_POINTER)
    origin = [(ram.sbyte(base + 2) * spacing + 0x8000) & 0xFFFF,
              (ram.sbyte(base + 3) * spacing + 0x8000) & 0xFFFF]
    return {'cell': cell, 'x': cell & 15, 'z': cell >> 4, 'key': key, 'slot': slot,
            'dx': ram.sbyte(base + 2), 'dz': ram.sbyte(base + 3), 'origin': origin,
            'provenance': ram.slice(base, base + 4)}


def resolve_structure(ram: Ram, slot: int) -> dict:
    """`$560E2..$5617E`: follow an alias to geometry and collect scale/palette/detail."""
    record = structure_record(ram, slot)
    first = ram.word(record)
    if first & 0x8000:
        target = ram.byte(record + 6)
        palette = ram.byte(record + 4)
        if palette == 0:
            palette = ram.byte(record + 6 + 12)
        resolved = {
            'alias': slot, 'aliasRecord': hexaddr(record),
            'scale': [ram.sbyte(record + 2), ram.sbyte(record + 3)],
            'palette': palette, 'detail': ram.byte(record + 5),
            'geometrySlot': target, 'aliasProvenance': ram.slice(record, record + 7),
        }
        record = structure_record(ram, target)
        resolved['record'] = record
        return resolved
    return {
        'alias': None, 'geometrySlot': slot, 'record': record,
        'scale': [ram.sbyte(record - 8), ram.sbyte(record - 7)],
        'palette': ram.byte(record - 6), 'detail': ram.byte(record - 5),
    }


class Cursor:
    def __init__(self, ram: Ram, address: int) -> None:
        self.ram, self.p = ram, address

    def byte(self) -> int:
        value = self.ram.byte(self.p)
        self.p += 1
        return value

    def sbyte(self) -> int:
        value = self.ram.sbyte(self.p)
        self.p += 1
        return value

    def word(self) -> int:
        value = self.ram.word(self.p)
        self.p += 2
        return value

    def sword(self) -> int:
        value = self.ram.sword(self.p)
        self.p += 2
        return value

    def align(self) -> None:
        self.p += self.p & 1

    def text(self) -> bytes:
        start = self.p
        while self.ram.byte(self.p):
            self.p += 1
        self.p += 1
        return self.ram.bytes(start, self.p - 1)


def signed16(value: int) -> int:
    value &= 0xFFFF
    return value - 0x10000 if value & 0x8000 else value


def scaled_bound(value: int, factor: int, sentinel: int) -> int:
    """`$5B238..$5B276`: a ±$8000/$7FFF bound is complemented on a negative scale.

    Products are stored as words, so they are kept to sixteen signed bits.
    """
    if value == sentinel:
        return value if factor > 0 else signed16(~value)
    return signed16(value * factor)


def decode_structure(ram: Ram, record: int, scale: list[int]) -> dict:
    sx, sz = scale
    c = Cursor(ram, record)
    entry = [ram.sword(record - 4) * sx, ram.sword(record - 2) * sz]
    heights = [c.sword(), c.sword()]
    scene_colours = [c.word(), c.word()]
    plan: list[list[int]] = []
    while True:
        x = c.sword()
        if x == 0:
            break
        plan.append([x * sx, c.sword() * sz])
    mirrored = (sx ^ sz) < 0
    walls = []
    while True:
        a = c.byte()
        if a == 0:
            break
        b = c.byte()
        colour = c.word()
        refs = [a, b]
        if ((colour + 0x1000) & 0xFFFF) & 0x4000:
            refs += [c.byte(), c.byte()]
        if mirrored:
            # $5AE08: a mirrored structure reads each pair the other way round.
            refs = [refs[1], refs[0]] + ([refs[3], refs[2]] if len(refs) == 4 else [])
        walls.append({'refs': refs, 'colour': colour, 'form': (colour >> 12) & 7})
    c.p += 1  # $5AE52
    vertex_count = len(plan)
    wall_count = len(walls)
    attachments, wall_texts = [], []
    slot = FIRST_ATTACHMENT_SLOT
    while True:
        command = c.word()
        if command == 0:
            break
        low = command & 0xFF
        if 0 < low < 0x10:
            # $5AE76: a wall text queued after the wall its face byte names.
            plane, face = c.byte(), c.byte()
            offset = c.sword()
            x, y, z = c.sword(), c.sword(), c.sword()
            glyph = [c.sbyte(), c.sbyte()]
            colour = c.word()
            text = c.text()
            c.align()
            wall_texts.append({'command': command, 'font': low, 'plane': plane, 'face': face,
                               'offset': offset, 'anchor': [x, y, z], 'glyphScale': glyph,
                               'colour': colour, 'text': list(text)})
            continue
        # $5AF10..$5AF6E: a keyed or keyless door.
        x0, z0, x1, z1 = c.sword() * sx, c.sword() * sz, c.sword() * sx, c.sword() * sz
        if sx < 0:
            x0, x1 = x1, x0
        if sz < 0:
            z0, z1 = z1, z0
        two = bool(command & 0x0200)
        colours = [c.word(), c.word(), c.word()]
        if (command & 0x8000 and sx < 0) or (not command & 0x8000 and sz < 0):
            colours.reverse()
        extra = c.word() if two else None
        b0, b1, b2, b3 = c.sword() * sx, c.sword() * sx, c.sword() * sz, c.sword() * sz
        if sx < 0:
            b0, b1 = b1, b0
        if sz < 0:
            b2, b3 = b3, b2
        first_vertex = vertex_count + 1
        vertex_count += 8 if two else 4
        first_wall = wall_count + 1
        wall_count += 6 if two else 3
        attachments.append({
            'slot': slot, 'control': command, 'twoLeaves': two,
            'motionAxis': 'z' if command & 0x8000 else 'x',
            'key': low if low >= 0x10 else None,
            'leaves': [x0, z0, x1, z1], 'colours': colours,
            **({'controlColour': extra} if extra is not None else {}),
            'box': {'x': [b0, b1], 'z': [b2, b3]},
            'firstVertex': first_vertex, 'firstWall': first_wall,
        })
        slot -= 4
    regions = []
    while True:
        flags = c.word()
        if flags == 0:
            break
        x0 = scaled_bound(c.sword(), sx, -0x8000)
        x1 = scaled_bound(c.sword(), sx, 0x7FFF)
        z0 = scaled_bound(c.sword(), sz, -0x8000)
        z1 = scaled_bound(c.sword(), sz, 0x7FFF)
        if sx < 0:
            x0, x1 = x1, x0
        if sz < 0:
            z0, z1 = z1, z0
        named = flags & 0x3FC
        if named and named != 0x200:
            # $5B284: a door region is inset 11 units on the door's motion axis.
            door = next((item for item in attachments if item['slot'] + 0x1A8 == named), None)
            if door is None:
                raise ValueError(f'region names unknown attachment ${named:03X}')
            if door['motionAxis'] == 'z':
                z0, z1 = z0 + 11, z1 - 11
            else:
                x0, x1 = x0 + 11, x1 - 11
        queue_start = c.p
        queue = list(c.text())
        c.align()
        regions.append({'flags': flags, 'bounds': {'x': [x0, x1], 'z': [z0, z1]},
                        'queue': queue, 'queueAddress': hexaddr(queue_start)})
    associations = []
    a = c.p
    while True:
        ident = ram.byte(a)
        a += 1
        if ident == 0:
            break
        pairs = []
        while ram.byte(a):
            pairs.append([ram.byte(a), ram.byte(a + 1)])
            a += 2
        a += 1
        associations.append({'id': ident, 'hooks': pairs})
    end = a
    return {
        'entry': entry, 'heights': heights, 'sceneColours': scene_colours,
        'plan': plan, 'walls': walls, 'attachments': attachments, 'wallTexts': wall_texts,
        'regions': regions, 'associations': associations,
        'provenance': ram.slice(record - 8, end),
    }


DETAIL_TABLE = 0x4BD22


def detail_record(ram: Ram, index: int) -> int:
    table = ram.long(DETAIL_TABLE)
    return table + ram.long(table + 4 * index)


def _detail_boxes(ram: Ram, record: int) -> tuple[list, list, dict | None, int]:
    """`$54B1C..$54B9A`: below the entry, read backwards: seven-word support boxes,
    six-word wall boxes, each list ending on a negative word, then the extent the
    zone test (`$59F08`) reads through `$6FA2`, or none."""
    p = record
    supports, walls = [], []
    while ram.sword(p - 2) >= 0:
        words = [ram.sword(p - 2 * (i + 1)) for i in range(7)]
        supports.append({'y': words[0:2], 'x': words[2:4], 'z': words[4:6], 'tag': words[6] & 0xFFFF})
        p -= 14
    p -= 2
    while ram.sword(p - 2) >= 0:
        words = [ram.sword(p - 2 * (i + 1)) for i in range(6)]
        walls.append({'y': words[0:2], 'x': words[2:4], 'z': words[4:6]})
        p -= 12
    p -= 2
    extent = None
    if ram.sword(p - 2) >= 0:
        words = [ram.sword(p - 2 * (i + 1)) for i in range(5)]
        extent = {'y': words[0], 'x': words[1:3], 'z': words[3:5]}
        p -= 10
    return supports, walls, extent, p


def decode_detail(ram: Ram, index: int) -> dict:
    """`$54AEE..$54D20`: one Building detail, unscaled; the bind scales and mirrors it."""
    record = detail_record(ram, index)
    supports, walls, extent, low = _detail_boxes(ram, record)
    c = Cursor(ram, record)
    vertices, tagged = [], []
    articulation = None
    while True:
        x = c.sword()
        if x == -0x8000:
            break
        if x == -0x7FFF:
            # $54BAA: axis word, then the pivot.
            articulation = {'axis': c.sword(), 'pivot': [c.sword(), c.sword(), c.sword()]}
            break
        y, z = c.sword(), c.sword()
        if y < 0:
            tagged.append(len(vertices))
        vertices.append([x, y, z])
    primitives = []
    while True:
        first = ram.byte(c.p)
        if not first & 0x40:
            if first == 0 and ram.byte(c.p + 1) == 0:
                c.p += 2
                break
            colour = c.word()
            refs = []
            while True:
                r = c.byte()
                if r == 0:
                    break
                refs.append(r)
            primitives.append({'kind': 'polygon', 'colour': colour, 'refs': refs})
        elif first & 0x20:
            # A $6000 lettering record: 16-byte header, then inline text or a token.
            start = c.p
            command = c.word()
            offset = c.sword()
            x, y, z = c.sword(), c.sword(), c.sword()
            flags = c.word()
            advance = c.sword()
            glyph = [c.sbyte(), c.sbyte()]
            colour = c.word()
            text = c.text()
            primitives.append({'kind': 'text', 'command': command, 'offset': offset,
                               'anchor': [x, y, z], 'flags': flags, 'advance': advance,
                               'glyphScale': glyph, 'colour': colour, 'text': list(text),
                               'address': hexaddr(start)})
        else:
            colour = c.word()
            primitives.append({'kind': 'line', 'colour': colour, 'refs': [c.byte(), c.byte()]})
    groups = []
    for _ in range(2):
        boxes = []
        while True:
            # $54C68: every box starts on a word; the default list follows the zero tag.
            c.align()
            tag = c.word()
            if tag == 0:
                break
            x0, x1, y0, y1, z0, z1 = (c.sword() for _ in range(6))
            boxes.append({'tag': tag, 'x': [x0, x1], 'y': [y0, y1], 'z': [z0, z1],
                          'records': list(c.text())})
        groups.append({'boxes': boxes, 'default': list(c.text())})
    return {'index': index, 'vertices': vertices, 'tagged': tagged,
            **({'articulation': articulation} if articulation else {}),
            'primitives': primitives, 'groups': groups,
            'supports': supports, 'walls': walls, 'extent': extent,
            'provenance': ram.slice(low, c.p)}


def ground_transform(ram: Ram, cell: int) -> tuple[int, int, int]:
    """`$561AE..$561FA`: the cell's ground record, transform and transform index.

    The run record is a phase byte and a signed skip. A non-negative skip leads to
    a second phase byte, and the first then also carries the mirror bit (4).
    """
    orientation = ram.byte(CELL_ORIENTATION + cell)
    run = RUN_GRID + ram.word(GROUND_WORDS + 2 * cell)
    phase, skip = ram.byte(run), ram.sbyte(run + 1)
    start, extra = run + 2, 0
    if skip >= 0:
        extra = phase
        start += skip
        phase = ram.byte(start)
        start += 2
    index = ((orientation + extra - phase) & 3) + (extra & 4)
    return start, GROUND_TRANSFORMS[index], index


def decode_ground(ram: Ram, start: int) -> dict:
    """`$56204..$563C4`: raw ground vertices and primitives, before the transform."""
    c = Cursor(ram, start)
    vertices = []
    while True:
        x = c.sword()
        if x == 0:
            break
        vertices.append([x, c.sword()])
    primitives = []
    while True:
        word = c.word()
        if word == 0:
            break
        if not word & 0x4000:
            refs = list(c.text())
            primitives.append({'kind': 'polygon', 'colour': word, 'refs': refs})
        elif not word & 0x2000:
            primitives.append({'kind': 'line', 'colour': word, 'refs': [c.byte(), c.byte()]})
        elif not word & 0x1000:
            begin = c.p
            body = ram.bytes(c.p, c.p + 14)
            c.p += 14
            text = c.text()
            primitives.append({'kind': 'text', 'colour': word, 'header': list(body),
                               'text': list(text), 'address': hexaddr(begin)})
        else:
            # $56342: the pointer after the word is rounded down to even.
            c.p &= ~1
            x, z, model = c.sword(), c.sword(), c.word()
            # $563AC: the word >> 1 is a byte offset into the model table, so the
            # template rebinds its resident slot's entry to entry word / 4.
            primitives.append({'kind': 'template', 'word': word, 'x': x, 'z': z,
                               'model': model // 4})
    return {'vertices': vertices, 'primitives': primitives,
            'provenance': ram.slice(start, c.p)}


def decode_island(ram: Ram, pointer: int) -> dict:
    """One island record around the pointer an island descriptor names (`+4`).

    `$5761A..$5769E` draws it: X/Z vertex words in Body cells from the pointer to a
    `$8000` word, then primitive words to a zero word. Bit 14 marks a line, two
    vertex bytes (`$5873C`); otherwise a polygon, refs to a zero byte (`$4FEA0`).
    Both name a vertex by its offset in the projected buffer, four bytes apiece.
    `$571A8..$5727E` reads backwards from the pointer for the Land/Sea answer: the
    outer box, the core box, sea boxes to a `$8000` word, then edge words to zero.
    An edge's low byte is four times its start vertex; its high byte is the end
    vertex, with bit 15 swapping the two and bit 14 selecting the falling test.
    """
    def box(at: int) -> dict:
        # Read as the tests do: X lower, X upper, Z lower, Z upper, downwards.
        return {'x': [ram.sword(at - 2), ram.sword(at - 4)],
                'z': [ram.sword(at - 6), ram.sword(at - 8)]}

    def vertex(at: int) -> int:
        offset = ram.byte(at)
        if offset % 4:
            raise ValueError(f'island vertex offset ${offset:02X} at ${at:05X} is not a vertex')
        return offset // 4

    vertices = []
    p = pointer
    while ram.word(p) != 0x8000:
        vertices.append([ram.sword(p), ram.sword(p + 2)])
        p += 4
    p += 2
    primitives = []
    while (word := ram.word(p)) != 0:
        if word & 0x4000:
            primitives.append({'kind': 'line', 'colour': word & ~0x4000,
                               'refs': [vertex(p + 2), vertex(p + 3)]})
            p += 4
            continue
        p += 2
        refs = []
        while ram.byte(p):
            refs.append(vertex(p))
            p += 1
        p += 1
        primitives.append({'kind': 'polygon', 'colour': word, 'refs': refs})
    end = p + 2
    outer, core = box(pointer), box(pointer - 8)
    q = pointer - 16
    sea = []
    while ram.word(q - 2) != 0x8000:
        sea.append(box(q))
        q -= 8
    q -= 2
    edges = []
    while (word := ram.word(q - 2)) != 0:
        if (word & 0xFF) % 4:
            raise ValueError(f'island edge ${word:04X} at ${q - 2:05X} is not a vertex offset')
        # $57284..$572A8: the low byte names the edge's start, the high byte its end.
        edges.append({'from': (word & 0xFF) // 4, 'to': (word >> 8) & 0x3F,
                      'swap': bool(word & 0x8000), 'steep': bool(word & 0x4000)})
        q -= 2
    start = q - 2
    count = len(vertices)
    for item in primitives:
        if not all(1 <= r <= count for r in item['refs']):
            raise ValueError(f'island ${pointer:05X} primitive names a missing vertex')
    for edge in edges:
        if not (1 <= edge['from'] <= count and 1 <= edge['to'] <= count):
            raise ValueError(f'island ${pointer:05X} edge names a missing vertex')
    return {'vertices': vertices, 'primitives': primitives, 'outer': outer, 'core': core,
            'sea': sea, 'edges': edges, 'provenance': ram.slice(start, end)}


def land_sea(island: dict, x: float, z: float) -> int:
    """`$571E0..$574A8` over a decoded island: 0 core, 1 land, -1 sea.

    `x`, `z` are in Body cells from the island's origin. Outside the outer box is
    sea; inside the core box is core; a sea box is sea. Otherwise the one edge
    whose bounds hold the point decides by which side of it the point lies, and
    a swapped edge reverses that; a point no edge bounds is land. This is the
    test that checks a decoded island against the original's `$6F56`.
    """
    def inside(box: dict) -> bool:
        return box['x'][0] <= x < box['x'][1] and box['z'][0] <= z < box['z'][1]

    if not inside(island['outer']):
        return -1
    if inside(island['core']):
        return 0
    if any(inside(box) for box in island['sea']):
        return -1
    vertices = island['vertices']
    for edge in island['edges']:
        (x2, z2), (x4, z4) = vertices[edge['from'] - 1], vertices[edge['to'] - 1]
        if edge['swap']:
            (x2, z2), (x4, z4) = (x4, z4), (x2, z2)
        dx = x4 - x2
        if not edge['steep']:
            # $572B2: X in [x2, x4), Z in [z2, z4); the line rises with X.
            if not (x2 <= x < x4 and z2 <= z < z4):
                continue
            dz = z4 - z2
            if dx >= dz:
                above = z2 + (x - x2) * dz / dx >= z  # $57316: line Z less point Z
            else:
                above = x2 + (z - z2) * dx / dz < x   # $57370
        else:
            # $57390: X in [x2, x4), Z in [z4, z2); the line falls with X.
            if not (x2 <= x < x4 and z4 <= z < z2):
                continue
            dz = z2 - z4
            if dx >= dz:
                above = z2 - (x - x2) * dz / dx >= z  # $57402
            else:
                above = x2 + (z2 - z) * dx / dz > x   # $57488
        side = 1 if above else -1
        return -side if edge['swap'] else side
    return 1


def model_record(ram: Ram, entry: int) -> int:
    table = ram.long(MODEL_TABLE_POINTER)
    return table + ram.word(table + 2 * entry)


def model_name(ram: Ram, entry: int) -> str | None:
    record = model_record(ram, entry)
    name = ram.bytes(record - 16, record)
    if all(32 <= byte < 127 for byte in name):
        return name.decode('ascii').strip()
    return None


NO_RECORD_GEOMETRY = (0x0, 0x4, 0x5, 0x6)


def _pivot(c: Cursor) -> list[int]:
    # $54546: three signed bytes, or $80, an alignment byte and three words.
    first = c.sbyte()
    if first == -0x80:
        c.p += 1
        return [c.sword(), c.sword(), c.sword()]
    return [first, c.sbyte(), c.sbyte()]


def _model_header(ram: Ram, c: Cursor) -> dict | None:
    """`$545F6..$5464C`: at most one header operation, then the geometry."""
    word = ram.word(c.p)
    if not 0x8000 <= word <= 0x800F:
        return None
    c.p += 2
    op = word & 0xF
    header: dict = {'op': op}
    if op == 0x1:
        header['yawOffset'], header['mode'] = c.byte(), c.byte()
        if header['mode'] & 0x80:
            header['pivot'] = _pivot(c)
    elif op == 0xD:
        header['yawOffset'], header['mode'] = c.byte(), c.byte()
        header['passengerForm'] = c.p + ram.sword(c.p)
        c.p += 2
    elif op in (0x3,):
        header['value'] = c.word()
        header['firstOffset'] = c.sword()
        header['firstTarget'] = hexaddr(c.p + header['firstOffset'])
        targets = []
        while True:
            offset = c.sword()
            if offset == 0:
                break
            targets.append(hexaddr(c.p + offset))
        header['targets'] = targets
        header['skip'] = c.p + ram.sword(c.p)
        c.p = header['skip']
    elif op == 0xA:
        header['value'] = c.word()
        offset = c.sword()
        header['target'] = hexaddr(c.p + offset)
        header['skip'] = c.p + ram.sword(c.p)
        c.p = header['skip']
    elif op == 0x8:
        header['code'] = c.word()
        header['skip'] = c.p + ram.sword(c.p)
        c.p = header['skip']
    elif op == 0x9:
        header['skip'] = c.p + ram.sword(c.p)
        c.p += 2
    elif op == 0xC:
        header['range'] = c.word()
    elif op in (0xE, 0xF):
        header['skip'] = c.p + ram.sword(c.p)
        c.p = header['skip']
    elif op in (0x0, 0x2, 0x4, 0x5, 0x6, 0x7, 0xB):
        pass
    else:
        raise ValueError(f'model header op ${word:04X} unsupported')
    return header


def _model_faces(ram: Ram, c: Cursor) -> list[dict]:
    """`$54978..$549B8`: one face list in stream order."""
    faces = []
    while True:
        # `at` is the colour byte's address, which `$8003`/`$800A` patch.
        at = c.p
        b = c.byte()
        if b < 0x80:
            refs = []
            while True:
                r = c.byte()
                if r == 0:
                    break
                refs.append(r)
            faces.append({'kind': 'polygon', 'colour': b, 'refs': refs, 'at': hexaddr(at)})
            continue
        if b == 0xFF:
            return faces
        if b == 0xFD:
            faces.append({'kind': 'drawn'})
            return faces
        if b == 0xFE:
            # $55050: an inline text record, word aligned.
            c.align()
            start = c.p
            offset = [c.sword(), c.sword(), c.sword()]
            flags, advance = c.word(), c.sword()
            glyph = [c.sbyte(), c.sbyte()]
            colour = c.word()
            if flags & 0x8000:
                text = list(c.text())
                pointer = None
            else:
                pointer = ram.long(c.p)
                c.p += 4
                text = None
            faces.append({'kind': 'text', 'offset': offset, 'flags': flags, 'advance': advance,
                          'glyphScale': glyph, 'colour': colour,
                          **({'text': text} if text is not None else {'pointer': pointer}),
                          'address': hexaddr(start)})
            continue
        faces.append({'kind': 'line', 'colour': (0xFF - b) - 3, 'refs': [c.byte(), c.byte()],
                      'at': hexaddr(at)})


def decode_model_at(ram: Ram, record: int, header_allowed: bool = True) -> dict:
    c = Cursor(ram, record)
    header = _model_header(ram, c) if header_allowed else None
    # `$545AC`/`$543B2` return, `$4D3B0` draws the debris list at `$639C0` and `$549BA`
    # one point: none of the four reads geometry from the record.
    if header and header['op'] in NO_RECORD_GEOMETRY:
        return {'header': header, 'vertices': [], 'alternatives': [], 'faces': [],
                'provenance': ram.slice(record, c.p)}
    vertices = []
    while True:
        first = ram.byte(c.p)
        if first == 0x80:
            c.p += 1
            c.align()
            x = c.sword()
            if x == -0x8000:
                break
            vertices.append([x, c.sword(), c.sword()])
        else:
            vertices.append([c.sbyte(), c.sbyte(), c.sbyte()])
    alternatives = []
    while True:
        length = c.word()
        if length == 0:
            break
        box = [ram.slong(c.p + 4 * i) for i in range(6)]
        c.p += 24
        end = c.p + length
        faces = _model_faces(ram, c)
        alternatives.append({'min': box[0::2], 'size': box[1::2], 'faces': faces})
        c.p = end
    faces = _model_faces(ram, c)
    return {**({'header': header} if header else {}), 'vertices': vertices,
            'alternatives': alternatives, 'faces': faces,
            'provenance': ram.slice(record, c.p)}


def decode_model(ram: Ram, entry: int) -> dict:
    record = model_record(ram, entry)
    model = decode_model_at(ram, record)
    model['entry'] = entry
    name = model_name(ram, entry)
    if name is not None:
        model['name'] = name
    header = model.get('header')
    if header and 'passengerForm' in header:
        form = decode_model_at(ram, header['passengerForm'], header_allowed=False)
        model['passenger'] = form
    return model


MODEL_COLOURS = (0x2EA40, 0x2EAB8)
DRAW_PRIORITY = (0x542BC, 0x5430E)
