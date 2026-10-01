"""Decode the METIS taxi service data used by the two opening journeys.

Facts from Mercenary III's own readers (issue #647):

* Service definitions (`$51BEE`) are found through word `$41800+2+2*[$6FDE]`,
  relative to `$41800`. A definition opens with a signed rate word, which is
  stored at `$6C7C+4r`; a zero word ends the list. A negative rate is followed
  by a metadata long (to `$6D60+4r`) and a second long (to `$6DA0+4r`). A
  positive rate is followed by one word. Then come route pairs, up to a
  negative word.
* The taxi is resident r = 16, so its fields sit at `$6CBC`, `$6DA0`, `$6DE0`
  and its route cursor at `$6C8C`/`$6D60`.
* Route pair (`$51F76`, `$51F90`): the first byte's low nibble is the local
  cell X. The second byte's low nibble is Z, and its upper nibble is the
  control value, stored at `$6DD0+4r` when the taxi starts the segment toward
  that point. A negative first byte is the terminator, and the cursor wraps
  to the origin.
* Destination code (`$4DC9C`) = Z << 4 | X. Labels (`$4DD24`) follow a
  20-character header at `[$7100]`. Each record is a code byte and 20
  characters, and a 0 code ends the table. The unique destination list
  (`$7522`) takes the coded route points that have labels, in route order,
  each code once.
* Metadata bytes: byte 0 is the arrival message (`$51FCA`), byte 1 the
  boarding message (`$51A32`). Word 2..3 goes to `$6ECE` at admission
  (`$51A04`), and its low byte selects narrative records (`$4DBFE`).
* Narrative records (`$4DBF4`) are found through word `$41800`, relative to
  `$41800`. Each has four bytes: descriptor, origin, destination, script. The
  origin and destination are stored nibble-swapped, and 0 matches anything.
  The first matching record whose script will start (`$55A1A`) is used.
* Height tables (`$51E24..$51F02`): bytes are written to Y of residents
  16..27 (`$5C5C`), and a negative byte ends a table.
* Head turns (`$518AC`): word `$6FF4A` (an offset from `$6FD44`) selects a
  byte sequence. Loading it sets the count `$6EA2` to the first byte and
  clears `$6FF4A`. Each frame decrements the count. At 0 the next byte is
  read: nonzero toggles the profile flag `$6EA4` and becomes the new count; 0
  clears `$6EA4` and ends the sequence.
"""

from __future__ import annotations

import re

from .ram import Ram, hexaddr
from .scripts import decode_range
from .text import TABLES, static_strings

PINS = [
    (0x41F18, 0x41F58, '44c095d23f33c8bcaae37bf233dcccfc9a8b655579d4a8c25e55838cfdf10c5a', 'METIS taxi definition'),
    (0x214D6, 0x2153F, '885c4a0455d7dd087c87c56c98accbc85ff214594ecd64e5bd333f1a26d5fe59', 'METIS label table'),
    (0x51CA2, 0x51CDA, '43c569b9d7c990bb58f7765aa315f488e7a5119960597f0b16b8624c774e5f52', 'height tables'),
    (0x51E24, 0x51F02, '9e645445261a19b119ade3841621778e5198c94037c0a7c439759a966600b24c', 'height and dwell'),
    (0x70148, 0x70164, '178bdb298988374d42c6a83f093e3e2d9508e847b777263ac99d042e86e2b815', 'head-turn sequences'),
    (0x518AC, 0x518F0, '1680cadbcf9dd50af0b9a2165fde2a1542944da0bf1edb4c6f4ef923552caa34', 'cabin animation reader'),
    (0x51F40, 0x52030, 'cd79fbdcb798d1f51c5b395d89a8b91dac7d7ddf28e99fa6c61dae8c59a9b419', 'segment change and heading'),
    (0x51BEE, 0x51CA2, '6a0d07f0c41995a572eb5b7962fcf14086bb5a97e79193ecaab36246527bd26a', 'service initialization'),
    (0x4DB7C, 0x4DD3A, '5ac18a5abd34156ed99cc95bc114abbcb18fb4c4cdd7942fbb1bc36ecda9aa70', 'service input/list readers'),
    (0x518F0, 0x51A4E, '04e26ee68941fb23279297cf0e5697671c69989069991ef42c061a20b88bb45d', 'passenger loop/admission'),
]
# The narrative table is not in the reports' ledger. Its hash was taken from the
# loaded-play captures, where it never changes.
NARRATIVE_PIN = (0x4187C, 0x41AA5, '907badef150741661fb5b35c3f5b8f9840cf71964df31612d9c06eee6520d049')

DEFINITION = 0x41F18
LABELS = 0x214D6
DESCENT, LIFT_OFF = 0x51CA2, 0x51CB7
HEAD_TURNS = (0x7014B, 0x70163)
TRIP_SCRIPTS = (0x701E0, 0x7040D)   # for "used by" cross-reference
BASE = 0x6FD44


def heights(ram: Ram, start: int) -> dict:
    values, a = [], start
    while ram.sbyte(a) >= 0:                       # $51E4C / $51E9A: bmi ends
        values.append(ram.byte(a))
        a += 1
    return {'address': hexaddr(start), 'heights': values,
            'terminator': hexaddr(a), 'terminator_byte': f'${ram.byte(a):02X}',
            'source': ram.slice(start, a + 1)}


def labels(ram: Ram) -> dict:
    header = ram.bytes(LABELS, LABELS + 20).decode('ascii')
    records, a = [], LABELS + 20
    while ram.byte(a):
        text = ram.bytes(a + 1, a + 21).decode('ascii')
        records.append({'code': f'${ram.byte(a):02X}', 'cell': [ram.byte(a) & 15, ram.byte(a) >> 4],
                        'text': text, 'lines': [text[:10].rstrip(), text[10:].rstrip()],
                        'source': ram.slice(a, a + 21)})
        a += 21
    return {'header': header, 'header_lines': [header[:10].rstrip(), header[10:].rstrip()],
            'records': records, 'terminator': hexaddr(a), 'source': ram.slice(LABELS, a + 1)}


def definition(ram: Ram) -> dict:
    # $51C12..$51C1E: definitions start at $41800 + word $41802+2*[$6FDE].
    location = ram.word(0x6FDE)
    found = 0x41800 + ram.word(0x41802 + 2 * location)
    rate = ram.sword(DEFINITION)
    meta = ram.long(DEFINITION + 2)
    origin = DEFINITION + 10
    points, a = [], origin
    while ram.sbyte(a) >= 0:
        first, second = ram.byte(a), ram.byte(a + 1)
        points.append({'index': len(points), 'address': hexaddr(a),
                       'cell': [first & 15, second & 15], 'control': second >> 4,
                       'first_high_nibble': first >> 4,
                       'code': f'${((second & 15) << 4) | (first & 15):02X}'})
        a += 2
    return {
        'lookup': {'location_6FDE': location, 'definitions': hexaddr(found), 'matches': found == DEFINITION,
                   'source': ram.slice(0x41802 + 2 * location, 0x41804 + 2 * location)},
        'rate': rate, 'units_per_call': -rate if rate < 0 else rate,
        'metadata': f'${meta:08X}',
        'arrival_message': f'${meta >> 24:02X}', 'boarding_message': f'${(meta >> 16) & 0xFF:02X}',
        'descriptor': f'${meta & 0xFFFF:04X}', 'narrative_key': f'${meta & 0xFF:02X}',
        'second_long': f'${ram.long(DEFINITION + 6):08X}',
        'route_origin': hexaddr(origin), 'terminator': hexaddr(a),
        'terminator_word': f'${ram.word(a):04X}',
        'points': points,
        'source': ram.slice(DEFINITION, a + 2),
    }


def destinations(points: list[dict], label_records: list[dict]) -> list[dict]:
    """The unique destination list rule of `$4DC9C`, applied to the route."""
    known = {r['code']: r for r in label_records}
    out = []
    for p in points:
        if p['code'] in known and p['code'] not in [d['code'] for d in out]:
            out.append({'code': p['code'], 'route_index': p['index'], 'cell': p['cell'],
                        'label': known[p['code']]['text']})
    return out


def narrative(ram: Ram, key: int) -> list[dict]:
    table = 0x41800 + ram.word(0x41800)            # $4DBF4..$4DBFA
    out, a = [], table
    while ram.byte(a):
        if ram.byte(a) == key:
            o, d = ram.byte(a + 1), ram.byte(a + 2)
            swap = lambda v: ((v & 15) << 4) | (v >> 4)
            out.append({'address': hexaddr(a), 'origin': f'${swap(o):02X}' if o else 'any',
                        'destination': f'${swap(d):02X}' if d else 'any',
                        'script': f'${ram.byte(a + 3):02X}', 'source': ram.slice(a, a + 4)})
        a += 4
    return out


def head_turns(ram: Ram) -> list[dict]:
    lo, hi = HEAD_TURNS
    # Values the trip scripts store into $6FF4A (op $19, offset $0206).
    used = {}
    trip = decode_range(ram, *TRIP_SCRIPTS, static_strings(ram))['instructions']
    for ins in trip:
        if ins.get('name') == 'store2' and ins['operands'][0]['address'] == '$6FF4A':
            script = '$34' if int(ins['address'][1:], 16) >= 0x703B5 else '$33'
            used.setdefault(int(ins['value'][1:], 16), set()).add(script)
    out, a = [], lo
    while a < hi:
        start = a
        seq = []
        while ram.byte(a):
            seq.append(ram.byte(a))
            a += 1
        a += 1
        value = start - BASE
        out.append({'value': f'${value:04X}', 'address': hexaddr(start), 'counts': seq,
                    'used_by': sorted(used.get(value, ())), 'source': ram.slice(start, a)})
    return out


def _vbl(ram: Ram, vbl: int | None) -> int | None:
    if vbl is not None:
        return vbl
    m = re.search(r'v(\d+)\.ram$', ram.label)
    return int(m.group(1)) if m else None


def opening_state(ram: Ram, vbl: int | None) -> dict:
    count = ram.word(0x563C)
    items = list(ram.bytes(0x563E, 0x563E + count))      # $4CEA0: list of count bytes
    return {
        'captured_at_vbl': _vbl(ram, vbl),
        'note': 'runtime state from this capture, not a recovered constant',
        'pose': {
            'x': f'${ram.long(0x7146):08X}', 'y': f'${ram.long(0x714A):08X}',
            'z': f'${ram.long(0x714E):08X}', 'heading': f'${ram.word(0x7156):04X}',
            'source': [ram.slice(0x7146, 0x7152), ram.slice(0x7156, 0x7158)],
        },
        'cell': {'x': ram.byte(0x70C3), 'z': ram.byte(0x70CB),
                 'source': [ram.slice(0x70C2, 0x70C4), ram.slice(0x70CA, 0x70CC)]},
        'carried': {
            'count': count, 'head_item': f'${ram.byte(0x563E):02X}',
            'items': [{'object': f'${o:02X}', 'held_bit': bool(ram.byte(0x641E + 4 * o) & 0x80)} for o in items],
            'source': ram.slice(0x563C, 0x563E + max(count, 1)),
        },
        'cash_bcd': {'digits': ram.bytes(0x72DE, 0x72E4).hex(), 'source': ram.slice(0x72DE, 0x72E4)},
        'elapsed_seconds': {'value': ram.long(0x6FCE), 'source': ram.slice(0x6FCE, 0x6FD2)},
    }


def extract_service(ram: Ram, vbl: int | None = None) -> dict:
    sources = [ram.require(lo, hi, sha, role) for lo, hi, sha, role in PINS]
    sources.append(ram.require(*NARRATIVE_PIN, 'narrative records'))
    sources.append(ram.require(*TABLES, 'message and script offset tables'))
    taxi = definition(ram)
    table = labels(ram)
    return {
        'title': 'Mercenary III',
        'ram_sha256': ram.sha256,
        'sources': sources,
        'taxi': taxi,
        'labels': table,
        'destinations': destinations(taxi['points'], table['records']),
        'narrative': narrative(ram, int(taxi['narrative_key'][1:], 16)),
        'heights': {'descent': heights(ram, DESCENT), 'lift_off': heights(ram, LIFT_OFF),
                    'resident_y': '$5C5C (12 longs, residents 16..27)'},
        'head_turns': {'reader': '$518AC', 'selector': '$6FF4A', 'count': '$6EA2', 'profile': '$6EA4',
                       'sequences': head_turns(ram)},
        'opening_state': opening_state(ram, vbl),
    }
