"""Recover every object Geometry Identity the Dion Catalogue needs (#681).

Input is a census run (census_capture.py), Restricted Material. Each persistent
object slot 1..246 draws the model-table entry of its own number through
`$545AE..$549BA` (`decode_model`). Records are read with this laboratory's own
readers, each following the MIII reader it cites:

* the header (`$545F6..$5464C`) picks the record's forms: `$8009` an intact and a
  blown form by `$70F6`, which a blast near slot 102 sets (`$4CE1C..$4CE2A`);
  `$800D` an exterior and a passenger form (`$54444`); `$8003` lit and dark lamps
  (`$543DE..$5442A`); `$800A` and `$8003` patch colour bytes in shared geometry;
* the face lists (`$54952..$549B8`): viewer-selected alternatives by box, then
  the default list; polygons, lines, inline text (`$55050`) and the drawn mark;
* the vertex loop (`$546F8..$5491C`): a turn mode from `$543AA`, where an
  articulated vertex is stored with its Y complemented (`$5480A`);
* per-slot lettering: `$8002` and `$8007` write the slot's digit or letter to
  token `$87`'s buffer `$B2DE`, `$8008` its key code to `$B300` (token `$8B`), and
  `$800D` the vehicle's route number from `$6DA0` to `$B346` (token `$9E`).

The model table is rewritten at run time, so a slot can draw more than its
opening entry. Every writer is read from its pinned code: the services that
rebind vehicles to TAXI or BUS and name a driver head (`$51B82..$51BEC`,
`$51C12..$51C9C`, with the tables at `$51A3E` and `$41800`), the EXPLOSIVE arming
swaps (`$4DB0C..$4DB78`, `$59BA2..$59BCC`), the OBSERVER reveal (`$52056..$5209C`)
and BIL's chair (`$52F6A..$52FDE`). Static forms are recovered; animation (lamp
blinking, articulated turns, debris) is described, not frozen into geometry.
Only decoded facts leave RAM. No original instructions are reproduced.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from .boot import REPOSITORY
from .catalogue_surface import digest, lettering
from .census_objects import OBJECT_SLOTS
from .geometry import (MODEL_COLOURS, MODEL_TABLE_POINTER, NO_RECORD_GEOMETRY, decode_model,
                       decode_model_at, model_name, model_record)
from .ram import Ram, hexaddr

NULL_ENTRY = 0
DEBRIS_SLOT = 74
SAFE_SLOT = 102

# Writer code the rebinding facts are read from, pinned to the census opening.
CODE = {
    'explosive': (0x4DB0C, 0x4DB78, 'c1a0e74b3c233328e097322fe4a1571b65aa54aae23919125ce9b4ff20b85a71'),
    'explosiveReset': (0x59BA2, 0x59BCC, '0e082dd41f45b52d8a77ef7b883f09e66ff5dd7726e688399d3ebfe66d44bfc6'),
    'observer': (0x52056, 0x5209C, 'a9875fd85eea6fffdd938eb8f780c1302135ee6663506d8c66e1226071f504df'),
    'bilsChair': (0x52F6A, 0x52FDE, '682cca99699b6ac7c499d5f784ef2eedf90d80e6fd69152eb68b856a90669b91'),
    'routes': (0x51C12, 0x51C9C, '368d6e6dd7d547470b22abb8c3512812a322e74f5274c92962cef9fe3f67c059'),
    'services': (0x51B82, 0x51BEE, '7da0f8004bae45f4570cae5d8207ba46caf227b7024fb471139fc67f86b5c5f8'),
    'serviceTable': (0x51A3E, 0x51B80, 'f69aa9478b795e0ed0ba26a4767cb6dcca6a074638fcd81b56ca16446b0ab922'),
    'headers': (0x543B4, 0x545AE, '170817f5075226009cad07138a09766652deec58a4f6a0a94d7361fd1afbef38'),
    'dispatch': (0x545AE, 0x546F8, '592ee4aba29f4285dc026793df0466992d57a7e72bd6290bc882ddeefb524e7e'),
    'vertices': (0x546F8, 0x549BA, '28d327e2d07e3f1680ddfc776f3452bd53c9d63874f35a2dd3f1ebe963081186'),
    'text': (0x55050, 0x551AA, '9652b0fb0d2e64c9abd7b11c409bf3b6a4872bbb2433ad41ebcae8b38b2f9a43'),
    'safe': (0x4CE1C, 0x4CE30, '845f4b3f2583c6436b7b580016f5cb11505953c595c16a62f738ea5a2b468c43'),
    'debrisStart': (0x4D2C8, 0x4D2D8, 'a1305c999af412c1c1d5f46eb9030bdd3a1c2c6318783a2e599c86d101161142'),
    'debrisColours': (0x4D2D8, 0x4D358, '4af820f832a45130c40a34481ebae17c7a03c33ad98fd30f3da68bc66f201135'),
}
SERVICE_TABLE = 0x51A3E
ROUTE_TABLE = 0x41800
ROUTE_BASE = 0x663B2
FIRST_ROUTE_SLOT = 16
LIVE_BUFFERS = (0xB2D0, 0xB3F6)


def entry_of(ram: Ram, offset_at: int, divisor: int = 2) -> int:
    """A model-table entry from a displacement operand: a byte offset into the table."""
    offset = ram.word(offset_at)
    if offset % divisor:
        raise ValueError(f'operand at ${offset_at:05X} is not a table entry offset')
    return offset // divisor


def code_provenance(ram: Ram) -> dict:
    return {name: ram.require(lo, hi, sha, name) for name, (lo, hi, sha) in CODE.items()}


def rebindings(ram: Ram) -> list[dict]:
    """Every model-table write outside the opening, with the slots and entries it names."""
    code_provenance(ram)
    first, last = ram.word(0x4DB14), ram.word(0x4DB1A)  # cmpi.w #$4B / #$51 on the carried top
    unarmed, armed = entry_of(ram, 0x4DB42), entry_of(ram, 0x4DB68)
    reset_from, reset_to = ram.word(0x59BA4) // 2, ram.word(0x59BB6) // 2
    if (entry_of(ram, 0x59BAE), entry_of(ram, 0x59BC8)) != (unarmed, unarmed + 1):
        raise ValueError('the EXPLOSIVE reset names other entries than the arming writer')
    explosives = list(range(first, last + 1))
    if explosives != list(range(reset_from, reset_to)):
        raise ValueError('the EXPLOSIVE reset covers other slots than the arming test')
    observer = [ram.word(a) // 2 for a in (0x52092, 0x52096, 0x5209A)]
    chair, pcb = ram.word(0x52F78) // 2, ram.word(0x52F7C + 2) // 2
    rows = [
        {'id': 'explosive-armed', 'slots': explosives, 'entry': armed,
         'writer': '$4DB66', 'when': 'the carried EXPLOSIVE on top of the stack is armed'},
        {'id': 'explosive-armed-next', 'slots': [s + 1 for s in explosives], 'entry': armed + 1,
         'writer': '$4DB66',
         'when': 'the slot below is armed: the long write also rebinds the next entry'},
        {'id': 'explosive-disarmed', 'slots': explosives, 'entry': unarmed,
         'writer': '$4DB40', 'when': 'the armed EXPLOSIVE is disarmed'},
        {'id': 'explosive-disarmed-next', 'slots': [s + 1 for s in explosives], 'entry': armed,
         'writer': '$4DB40',
         'when': 'the slot below is disarmed: the long write also rebinds the next entry'},
        {'id': 'observer-revealed', 'slots': observer, 'entry': entry_of(ram, 0x5207C),
         'writer': '$52090', 'when': 'the OBSERVER script reveals the attack ship'},
        {'id': 'observer-restored', 'slots': observer, 'entry': entry_of(ram, 0x5208E),
         'writer': '$52090', 'when': 'the OBSERVER script restores the observers'},
        {'id': 'bil-stands', 'slots': [chair], 'entry': entry_of(ram, 0x52F76),
         'writer': '$52F74', 'when': "BIL's script leaves the chair"},
        {'id': 'bil-stands', 'slots': [pcb], 'entry': entry_of(ram, 0x52F7C),
         'writer': '$52F7A', 'when': "BIL's script leaves the chair"},
        {'id': 'bil-seated', 'slots': [chair], 'entry': entry_of(ram, 0x52FAC),
         'writer': '$52FAA', 'when': "BIL's script seats him"},
        {'id': 'bil-seated', 'slots': [pcb], 'entry': entry_of(ram, 0x52FB2),
         'writer': '$52FB0', 'when': "BIL's script seats him"},
        {'id': 'bil-gone', 'slots': [chair], 'entry': entry_of(ram, 0x52FD4),
         'writer': '$52FD2', 'when': "BIL's script removes him"},
        {'id': 'bil-gone', 'slots': [pcb], 'entry': entry_of(ram, 0x52FDA),
         'writer': '$52FD8', 'when': "BIL's script removes him"},
    ]
    if (ram.word(0x52F7E) // 2, ram.word(0x52FB4) // 2) != (pcb, pcb):
        raise ValueError("BIL's writers name different slots")
    return rows


def services(ram: Ram) -> list[dict]:
    """`$51B82..$51BEC` and `$51C12..$51C9C`: who drives what, group by group.

    The craft table at `$51A3E` holds 16-byte records after a skipped first one:
    group, slot × 4, ..., `$6DA0` long and the driver head's table offset (`$6D62`).
    The route table at `$41800` lists, per group, the vehicles bound from slot 16:
    a negative word is a TAXI (entry from `$51C2E`) with a head long and a long
    `$6DA0`; any other a BUS (entry from `$51C3A`) with a two-character route number.
    """
    code_provenance(ram)
    taxi, bus = entry_of(ram, 0x51C30), entry_of(ram, 0x51C3C)
    rows = []
    a = SERVICE_TABLE
    while True:
        a += 16
        group = ram.word(a)
        if group == 0:
            break
        head = entry_of(ram, a + 14)
        rows.append({'group': group, 'slot': ram.word(a + 2) // 4, 'entry': ram.word(a + 2) // 4,
                     'head': head, 'route': hexaddr(ROUTE_BASE + ram.word(a + 6)),
                     'source': hexaddr(a)})
    for group in range(57):
        a = ROUTE_TABLE + ram.word(ROUTE_TABLE + 2 + 2 * group)
        slot = FIRST_ROUTE_SLOT
        while (word := ram.word(a)) != 0:
            start = a
            a += 2
            if word & 0x8000:
                head = ram.long(a) & 0xFFFF
                a += 8
                row = {'entry': taxi, 'head': head // 2 if head else None}
            else:
                number = ram.bytes(a, a + 2)
                a += 2
                row = {'entry': bus, 'head': None, 'registration': list(number)}
            a += 2  # the route's starting cell
            while not ram.word(a) & 0x8000:
                a += 2
            a += 2
            rows.append({'group': group, 'slot': slot, **row, 'source': hexaddr(start)})
            slot += 1
    return rows


def _turn(header: dict | None, slot: int | None = None) -> dict:
    """`$543AA` as the vertex loop reads it: 0 none, bit 7 articulated, bit 6 yaw,
    any other bits view-fixed; bit 5 ×16 for the yaw and view-fixed turns."""
    if header is None or header['op'] not in (0x1, 0xB, 0xD):
        return {'kind': 'fixed'}
    if header['op'] == 0xB:
        return {'kind': 'view'}  # $543C0 writes mode 3
    mode = header['mode']
    if header['op'] == 0x1 and slot == 10:
        mode = 1  # $5450A: slot 10 is drawn view-fixed
    if mode == 0:
        return {'kind': 'fixed'}
    if mode & 0x80:
        axis = header['yawOffset']
        return {'kind': 'articulated',
                'axis': 'x' if axis & 0x80 else 'y' if axis == 0 else 'z',
                'pivot': header['pivot'],
                'angle': '$6E96' if mode == 0xFE else '$6F38'}
    turn = {'kind': 'yaw' if mode & 0x40 else 'view', 'yawOffset': header['yawOffset']}
    if mode & 0x20:
        turn['scale'] = 16
    return turn


def _form(ram: Ram, form: dict, patches: dict[int, int], turn: dict, tokens: dict) -> dict:
    """One drawable face list over the form's vertices, colours resolved and patched."""
    colours = [ram.word(MODEL_COLOURS[0] + 2 * i)
               for i in range((MODEL_COLOURS[1] - MODEL_COLOURS[0]) // 2)]
    vertices = [list(v) for v in form['vertices']]
    tagged = []
    if turn['kind'] == 'articulated':
        for index, vertex in enumerate(vertices):
            if vertex[1] < 0:
                vertex[1] = ~vertex[1]  # $5480A: stored complemented; turned about the pivot
                tagged.append(index + 1)

    def refs(face: dict) -> list[int]:
        out = []
        for ref in face['refs']:
            if ref % 4 or not 1 <= ref // 4 <= len(vertices):
                raise ValueError(f'face at {face["at"]} names ${ref:02X}, not a vertex')
            out.append(ref // 4)
        return out

    def face_list(faces: list[dict]) -> list[dict]:
        out = []
        for face in faces:
            if face['kind'] in ('polygon', 'line'):
                at = int(face['at'][1:], 16)
                if face['kind'] == 'line' and at in patches:
                    raise ValueError(f'a header patches the line colour at {face["at"]}')
                colour = patches.get(at, face['colour'])
                out.append({'kind': face['kind'], 'colour': colour, 'stColour': colours[colour],
                            'refs': refs(face),
                            **({'patched': True} if colour != face['colour'] else {})})
            elif face['kind'] == 'text':
                if 'text' not in face:
                    raise ValueError(f'model text at {face["address"]} is read through a pointer')
                out.append({key: face[key] for key in
                            ('kind', 'offset', 'flags', 'advance', 'glyphScale', 'colour', 'text')}
                           | {'tokens': [{'token': f'${c:02X}', 'kind': tokens[f'${c:02X}']['kind']}
                                         for c in face['text'] if c >= 0x80]})
            else:
                out.append({'kind': 'drawn'})  # $549B2: the pointer's pick mark ends the list
        return out

    return {'vertices': vertices, 'turn': turn,
            **({'articulated': tagged} if tagged else {}),
            'faces': face_list(form['faces']),
            'views': [{'min': a['min'], 'size': a['size'], 'faces': face_list(a['faces'])}
                      for a in form['alternatives']]}


def _variants(base: dict, prefix: str = '') -> dict[str, dict]:
    """Split a form into its default list and each viewer-selected alternative."""
    out = {}
    views = base.pop('views')
    out[f'{prefix}form=default'] = base
    for n, view in enumerate(views, 1):
        out[f'{prefix}form=view-{n}'] = {**base, 'faces': view['faces'],
                                         'box': {'min': view['min'], 'size': view['size']}}
    return out


SKIPPING = (0x3, 0x8, 0xA, 0xE, 0xF)


def header_end(ram: Ram, record: int, op: int) -> int:
    """Where a skipping header's own bytes end: after the word its skip is read from."""
    if op == 0x3:
        p = record + 6  # op, value, first offset, then target offsets to a zero word
        while ram.word(p):
            p += 2
        return p + 4
    return record + {0x8: 6, 0xA: 8, 0xE: 4, 0xF: 4}[op]


def decode_identity(ram: Ram, entry: int, tokens: dict) -> dict:
    """One model record with all its header- and viewer-selected forms."""
    record = model_record(ram, entry)
    model = decode_model(ram, entry)
    header = model.get('header')
    op = header['op'] if header else None
    body: dict = {'id': f'model-{record:06x}', 'family': 'model', 'record': hexaddr(record),
                  'header': dict(header) if header else None}
    if op in SKIPPING:
        # The header jumps into geometry shared with other records: cite both ranges.
        shared = decode_model_at(ram, header['skip'], header_allowed=False)
        provenance = [ram.slice(record, header_end(ram, record, op)), shared['provenance']]
    else:
        provenance = [model['provenance']]
    if header and 'skip' in header:
        body['header']['skip'] = hexaddr(header['skip'])
    if op in NO_RECORD_GEOMETRY:
        body.update(variants={}, provenance=provenance,
                    drawsNothing={0x0: '$545AC returns', 0x6: '$543B2 returns',
                                  0x5: '$549BA draws one point at the origin',
                                  0x4: '$4D3B0 draws the debris list at $639C0'}[op])
        return body
    turn = _turn(header)
    variants: dict[str, dict] = {}
    if op == 0xA:
        patch = {int(header['target'][1:], 16): header['value']}
        variants = _variants(_form(ram, model, patch, turn, tokens))
    elif op == 0x3:
        first = int(header['firstTarget'][1:], 16)
        for state, lamp in (('lamp-lit', 3), ('lamp-dark', 1)):
            patches = {first: header['value'], **{int(t[1:], 16): lamp for t in header['targets']}}
            variants |= _variants(_form(ram, model, patches, turn, tokens), f'state={state};')
        # $543DE..$5442A: lamp index 3 (lit) or 1 (dark) by bit 2 of the frame counter
        # plus the slot's phase word; value 5 (4) holds dark unless bit 7 of $64BE
        # ($64C2) is set. Beyond its range a lit beacon is one point ($5468E..$546F2).
        body['lamp'] = {'value': header['value'], 'lit': 3, 'dark': 1,
                        'blink': '($7180 + word $54400 + 4 * slot) & 4',
                        **({'heldDarkUnless': {5: '$64BE', 4: '$64C2'}[header['value']]}
                           if header['value'] in (4, 5) else {}),
                        'distant': 'one point in the lamp colour while lit'}
    elif op == 0x9:
        # $5452E: $70F6 clear reads on past the offset word, set follows it.
        blown = decode_model_at(ram, header['skip'], header_allowed=False)
        provenance.append(blown['provenance'])
        variants |= _variants(_form(ram, model, {}, turn, tokens), 'state=intact;')
        variants |= _variants(_form(ram, blown, {}, turn, tokens), 'state=blown;')
    else:
        variants = _variants(_form(ram, model, {}, turn, tokens))
    if op == 0xD:
        passenger = model['passenger']
        provenance.append(passenger['provenance'])
        body['header']['passengerForm'] = hexaddr(header['passengerForm'])
        # $54444: ×16, at (0, −63, 0) from the eye, turned with the vehicle (view-fixed
        # for slots 12..15), then the driver head `$6ECE` names.
        form = _form(ram, passenger, {}, {**turn, 'scale': 16}, tokens)
        for name, item in _variants(form, 'state=passenger;').items():
            variants[name] = {**item, 'eye': [0, -63, 0]}
    body.update(variants=dict(sorted(variants.items())), provenance=provenance)
    if op == 0xC:
        body['range'] = header['range']  # $543D4: cells per axis for $5532E
    return body


def slot_lettering(ram: Ram, slot: int, header: dict | None) -> dict | None:
    """The token buffer a header writes for this slot, as `$54596`, `$5442E`, `$5453C`."""
    if header is None:
        return None
    if header['op'] == 0x2:
        return {'token': '$87', 'buffer': '$0B2DE', 'text': [0x30 + (slot & 15)], 'writer': '$54596'}
    if header['op'] == 0x7:
        return {'token': '$87', 'buffer': '$0B2DE', 'text': [slot - 0x1E + 0x41], 'writer': '$5442E'}
    if header['op'] == 0x8:
        return {'token': '$8B', 'buffer': '$0B300', 'text': [header['code'] >> 8, header['code'] & 0xFF],
                'writer': '$5453C'}
    return None


def extract_objects(census: Path) -> dict:
    opening = Ram.load(census / 'start.ram')
    table = opening.long(MODEL_TABLE_POINTER)
    null = opening.word(table)
    tokens = lettering(opening)['tokens']

    def geometry_id(entry: int) -> str | None:
        if opening.word(table + 2 * entry) == null:
            return None
        return f'model-{model_record(opening, entry):06x}'

    rows = services(opening)
    swaps = rebindings(opening)
    forms: dict[int, list[dict]] = {slot: [] for slot in OBJECT_SLOTS}

    def add(slot: int, entry: int, role: str, cause: dict) -> None:
        """One more model a slot can draw, with every writer that binds it."""
        if slot not in forms:
            return
        for existing in forms[slot]:
            if (existing['entry'], existing['role']) == (entry, role):
                if cause not in existing['causes']:
                    existing['causes'].append(cause)
                return
        forms[slot].append({'entry': entry, 'geometry': geometry_id(entry), 'role': role,
                            'causes': [cause]})

    for swap in swaps:
        for slot in swap['slots']:
            if geometry_id(slot) != geometry_id(swap['entry']):
                add(slot, swap['entry'], 'model', {'writer': swap['writer'], 'when': swap['when']})
    # `$6D62` names a head only for a vehicle, whose `$800D` header reads it (`$544B0`).
    vehicles = [slot for slot in OBJECT_SLOTS if geometry_id(slot)
                and opening.word(model_record(opening, slot)) == 0x800D]
    heads: list[tuple[int, int, dict]] = [
        (slot, opening.word(0x6D62 + 4 * slot) // 2, {'writer': 'opening', 'when': 'the opening'})
        for slot in vehicles if opening.word(0x6D62 + 4 * slot)]
    by_slot: dict[int, list[dict]] = {}
    for row in rows:
        slot = row['slot']
        by_slot.setdefault(slot, []).append(row)
        cause = {'writer': '$51BBC' if slot < FIRST_ROUTE_SLOT else '$51C4A',
                 'when': f'group {row["group"]} service ({row["source"]})'}
        if geometry_id(slot) != geometry_id(row['entry']):
            add(slot, row['entry'], 'model', cause)
        if row['head'] is not None:
            heads.append((slot, row['head'], cause))
    for slot, head, cause in heads:
        # `$544B0..$544DC`: drawn aboard after the passenger form; the next entry in profile.
        add(slot, head, 'driver-head', cause)
        add(slot, head + 1, 'driver-head-profile', cause)

    entries = {slot for slot in OBJECT_SLOTS if geometry_id(slot)}
    entries |= {f['entry'] for items in forms.values() for f in items if f['geometry']}
    geometry: dict[str, dict] = {}
    for entry in sorted(entries):
        key = geometry_id(entry)
        if key in geometry:
            geometry[key]['entries'].append(entry)
            continue
        body = decode_identity(opening, entry, tokens)
        body['entries'] = [entry]
        name = model_name(opening, entry)
        if name is not None:
            body['name'] = name
        geometry[key] = body
    debris = geometry[geometry_id(DEBRIS_SLOT)]
    debris['nonGeometric'] = {
        'kind': 'explosion-debris',
        'evidence': ('$4D2C8 starts 64 frames of the particle list at $639C0 ($6EEE particles, '
                     'random velocities); $4D3B0 draws them as points while $6EE4 > 0, fading '
                     'through the 64 colours at $4D2D8'),
        'colours': [opening.word(0x4D2D8 + 2 * i) for i in range(64)]}
    for entry in geometry.values():
        entry['entries'].sort()
        entry['sha256'] = digest({k: v for k, v in entry.items() if k != 'sha256'})

    objects = {}
    for slot in OBJECT_SLOTS:
        key = geometry_id(slot)
        header = geometry[key]['header'] if key else None
        row: dict = {'slot': slot, 'geometry': key}
        if key is None:
            row['disposition'] = 'null-model'  # the entry is entry 0's record: $8000 returns
        letters = slot_lettering(opening, slot, header)
        if letters:
            row['lettering'] = letters
        if forms[slot]:
            row['forms'] = sorted(forms[slot], key=lambda f: (f['role'], f['entry']))
        if slot in by_slot:
            # Per group: the vehicle model, its driver head and the route number `$800D`
            # writes to token `$9E` (`$54444`), as the service setup binds them.
            row['services'] = [{key: item[key] for key in ('group', 'entry', 'head', 'registration', 'source')
                                if key in item} for item in by_slot[slot]]
        objects[str(slot)] = row
    null_record = model_record(opening, NULL_ENTRY)
    return {
        'geometry': dict(sorted(geometry.items())),
        'objects': objects,
        'services': rows,
        'rebindings': swaps,
        'null': {'entry': NULL_ENTRY, 'record': hexaddr(null_record),
                 'header': opening.word(null_record),
                 'provenance': opening.slice(null_record, null_record + 2)},
        'lettering': {t: {'kind': v['kind'], 'pointer': v['pointer']} for t, v in tokens.items()},
        'code': code_provenance(opening),
        'modelTable': opening.slice(table, table + 2 * 388),
        'source': {'census': census.name, 'openingRamSha256': opening.sha256},
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--census', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    restricted = (REPOSITORY / 'restricted').resolve()
    if not args.out.resolve().is_relative_to(restricted):
        raise SystemExit('recovered records stay under restricted/ until #684 exports them')
    objects = extract_objects(args.census)
    args.out.write_text(json.dumps(objects, sort_keys=True, indent=1) + '\n')
    print(f"Wrote {len(objects['geometry'])} object Geometry Identities to {args.out}")


if __name__ == '__main__':
    main()
