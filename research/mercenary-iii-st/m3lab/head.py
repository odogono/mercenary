"""Mercenary III's Open table, document bank and centre-box art (#756 Open).

Keypad Enter (`$4D63C`) looks the Carried Stack head up in the **Open table** at
`$4D6EA`: eight bytes a row, object slot, mode, index, 0, then the colour words
the centre box takes (the first to colour 1 from row 152, the second to colour
4), ended by a zero slot. It is the same table Damocles keeps at `$04D2C4`.

Mode 2 rows are documents. The index is a word offset into the **document
bank** at `$76C00` (`$4E102`). A document is a chain of items: each is an
eight-character name and packed message rows, and the byte before an item is
the distance to the next one, zero after the last. A Read (`$4DD50`) points
the message routine at the item's first row; `$52860` then shows rows one after
another until a zero byte follows a row, and only that last one scrolls out
(`$55A86..$55AD6`).

The centre art for each mode is at `$3BA00 + word[mode]` (`$59C2C`), 32 lines
of four bitplanes, 64 pixels wide. Modes 2, 5 and 6 stamp a five-line title
strip from `art + $400 + index * $14` into line 1, plane 0 set and planes 1 to
3 the strip; mode 5 also stamps the next 20 words into line 26. The item name
is drawn by `$4E17A` at `$7EA84` through layout `$4E0E8`.
"""

from __future__ import annotations

from .panel import _nibble_rows
from .ram import Ram, hexaddr
from .text import decode_packed, describe, static_strings

OPEN_TABLE = 0x4D6EA
OPEN_ROW = 8
DOCUMENT_BANK = 0x76C00
ART_TABLE = 0x3BA00
STRIPPED_MODES = (2, 5, 6)


def open_rows(ram: Ram) -> list[dict]:
    rows = []
    address = OPEN_TABLE
    while ram.byte(address):
        if ram.byte(address + 3):
            raise ValueError(f'Open row {hexaddr(address)} has a non-zero fourth byte')
        rows.append({'slot': ram.byte(address), 'mode': ram.byte(address + 1),
                     'index': ram.byte(address + 2), 'colour1From152': ram.word(address + 4),
                     'colour4': ram.word(address + 6)})
        address += OPEN_ROW
    return rows


def document(ram: Ram, index: int, statics: dict) -> dict:
    """`$4E102`: walk one document's item chain."""
    offset = ram.word(DOCUMENT_BANK + index)
    items = []
    while True:
        start = DOCUMENT_BANK + offset
        name = ram.bytes(start, start + 8)
        if not all(32 <= b < 127 for b in name):
            raise ValueError(f'document {index}: item at {hexaddr(start)} has no name')
        rows = []
        pointer = start + 8
        while True:
            rows.append(describe(ram, pointer, statics)['text'])
            pointer = decode_packed(ram, pointer)['end']
            if ram.byte(pointer) == 0:
                break
        items.append({'name': name.decode('ascii'), 'rows': rows,
                      'provenance': ram.slice(start, pointer + 1)})
        step = ram.byte(start - 1)
        if step == 0:
            return {'index': index, 'items': items}
        offset += step


def art(ram: Ram, mode: int) -> dict:
    base = ART_TABLE + ram.word(ART_TABLE + 2 * mode)
    return {'address': hexaddr(base), 'pixels': _nibble_rows(ram.bytes(base, base + 0x400), 4),
            'provenance': ram.slice(base, base + 0x400)}


def strip(ram: Ram, mode: int, index: int, line: int) -> dict:
    base = ART_TABLE + ram.word(ART_TABLE + 2 * mode) + 0x400 + index * 0x14 + (40 if line == 26 else 0)
    words = [ram.word(base + 2 * i) for i in range(20)]
    return {'line': line,
            'rows': [''.join(format(words[4 * r + g], '016b') for g in range(4)) for r in range(5)],
            'provenance': ram.slice(base, base + 40)}


def extract_head(ram: Ram) -> dict:
    rows = open_rows(ram)
    statics = static_strings(ram)
    documents = []
    for row in rows:
        if row['mode'] == 2 and row['index'] not in {d['index'] for d in documents}:
            documents.append(document(ram, row['index'], statics))
    strips = {}
    for row in rows:
        if row['mode'] in STRIPPED_MODES:
            lines = (1, 26) if row['mode'] == 5 else (1,)
            strips[f"{row['mode']}:{row['index']}"] = [strip(ram, row['mode'], row['index'], line) for line in lines]
    return {
        'openTable': {'rows': rows, 'provenance': ram.slice(OPEN_TABLE, OPEN_TABLE + OPEN_ROW * len(rows) + 1)},
        'documents': documents,
        'art': {str(mode): art(ram, mode) for mode in sorted({row['mode'] for row in rows})},
        'strips': strips,
        # Cells and box from `$4ED9A` over layout `$4E0E8` (m3lab emulation, checked
        # against the inventory and location fields' known cells).
        'itemField': {'writer': '$4E17A', 'layoutTable': '$4E0E8', 'y': 170, 'rows': 5, 'plane': 2,
                      'font': 'panel', 'cells': [136 + 6 * i for i in range(8)], 'box': [[136, 183]]},
    }
