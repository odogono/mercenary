"""Independent extractor of the Damocles documents the Head Commands read (ADR 0029, ADR 0043).

Keypad Enter looks the Carried Stack head up in the **Open table** at `$04D2C4`:
eight bytes a row, object slot, panel mode, index, 0, then colour 15 and colour 3
as ST `0RGB` words, ended by a zero slot. Mode 2 is a document, and its index
selects one of the documents in the **document bank** at `$073500` through the
bank's own word-offset table. A document is a length word L, three header bytes
(`$80 $20 $00` in every document), then its items, each an 8-character name and a
NUL-terminated body, and a negative terminator at L + 4. Both are recovered
material that belongs in the Data Payload, so this module decodes them from an
attested run and writes `payload/damocles/documents.json`.

Only the document rows are published. The other modes (the TIMED DETONATOR, the
two computers and the switches) are outside #598. Bodies are emitted verbatim,
padding included, as `strings.json` emits its records: the padding lines words up
in the original's fixed-width message row. See docs/research/damocles-head-commands.md.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import struct
from pathlib import Path

OPEN_TABLE = 0x04_D2C4
# The table's last row ends at $04D3AC, where the zero slot stands.
OPEN_TABLE_END = 0x04_D3AC
OPEN_ROW = 8
DOCUMENT_MODE = 2
DOCUMENT_BANK = 0x07_3500
DOCUMENT_BANK_END = 0x07_612C
HEADER = b'\x80\x20\x00'
NAME_LENGTH = 8
# The message row's glyphs run from $20 to $5A. A byte of $61 or more would be a
# numeric field (docs/research/damocles-message-reveal.md), which no body uses.
PRINTABLE = range(0x20, 0x5B)

EVIDENCE = 'docs/research/damocles-head-commands.md'


def hex_address(address: int) -> str:
    return f'0x{address:06x}'


def open_rows(data: bytes) -> list[dict]:
    """Every row of the Open table, in table order, up to the zero slot."""
    rows = []
    for address in range(OPEN_TABLE, OPEN_TABLE_END + OPEN_ROW, OPEN_ROW):
        slot = data[address]
        if slot == 0:
            if address != OPEN_TABLE_END:
                raise ValueError(f'the Open table ends at ${address:06x}, not ${OPEN_TABLE_END:06x}')
            return rows
        if data[address + 3] != 0:
            raise ValueError(f'Open row ${address:06x} has a non-zero fourth byte')
        colour15, colour3 = struct.unpack_from('>HH', data, address + 4)
        if (colour15 | colour3) & ~0x0777:
            raise ValueError(f'Open row ${address:06x} has a colour outside the ST 0RGB')
        rows.append({'address': address, 'colour15': colour15, 'colour3': colour3,
                     'index': data[address + 2], 'mode': data[address + 1], 'slot': slot})
    raise ValueError('the Open table has no zero slot')


def document(data: bytes, index: int) -> dict:
    """Walk one document from its bank offset, checking the header and the terminator."""
    if index % 2:
        raise ValueError(f'document index ${index:02x} is not a word offset')
    offset = struct.unpack_from('>h', data, DOCUMENT_BANK + index)[0]
    start = DOCUMENT_BANK + offset
    if not DOCUMENT_BANK <= start < DOCUMENT_BANK_END:
        raise ValueError(f'document ${index:02x} starts outside the bank at ${start:06x}')
    length = struct.unpack_from('>H', data, start)[0]
    if data[start + 2:start + 5] != HEADER:
        raise ValueError(f'document ${index:02x} header is {data[start + 2:start + 5].hex()}')
    items = []
    pointer = start + 5
    end = start + length + 4
    while data[pointer] < 0x80:
        if pointer >= end:
            raise ValueError(f'document ${index:02x} runs past its length')
        nul = data.index(0, pointer)
        text = data[pointer:nul]
        if len(text) <= NAME_LENGTH:
            raise ValueError(f'document ${index:02x} item at ${pointer:06x} has no body')
        if any(byte not in PRINTABLE for byte in text):
            raise ValueError(f'document ${index:02x} item at ${pointer:06x} is not message text')
        items.append({'address': hex_address(pointer),
                      'body': text[NAME_LENGTH:].decode('ascii'),
                      'name': text[:NAME_LENGTH].decode('ascii')})
        pointer = nul + 1
    if pointer != end:
        raise ValueError(f'document ${index:02x} terminator at ${pointer:06x} is not start + L + 4')
    if not items:
        raise ValueError(f'document ${index:02x} has no items')
    return {'address': hex_address(start), 'items': items, 'length': length,
            'sha256': hashlib.sha256(data[start:end + 1]).hexdigest()}


def extract(data: bytes, source: dict) -> dict:
    rows = open_rows(data)
    documents = []
    for row in rows:
        if row['mode'] != DOCUMENT_MODE:
            continue
        documents.append({
            'colour15': row['colour15'],
            'colour3': row['colour3'],
            'index': row['index'],
            'openRow': hex_address(row['address']),
            'slot': row['slot'],
            **document(data, row['index']),
        })
    if len({d['slot'] for d in documents}) != len(documents):
        raise ValueError('two document rows name the same object')
    if len({d['index'] for d in documents}) != len(documents):
        raise ValueError('two document rows name the same document')
    return {
        'bank': {'end': hex_address(DOCUMENT_BANK_END), 'start': hex_address(DOCUMENT_BANK),
                 'sha256': hashlib.sha256(data[DOCUMENT_BANK:DOCUMENT_BANK_END]).hexdigest()},
        'coverage': {
            'complete': True,
            'notes': [
                'Every mode-2 row of the Open table at $04D2C4, in table order.',
                'Every item of each row\'s document in the bank at $073500, name and body verbatim.',
                'The other modes (3 to 6) are not published: their objects are outside #598.',
            ],
        },
        'documents': documents,
        'openTable': {'end': hex_address(OPEN_TABLE_END), 'rows': len(rows),
                      'sha256': hashlib.sha256(data[OPEN_TABLE:OPEN_TABLE_END]).hexdigest(),
                      'start': hex_address(OPEN_TABLE)},
        'schemaVersion': 1,
        'source': source,
        'title': 'Damocles',
    }


def main():
    parser = argparse.ArgumentParser(
        description='Extract the Damocles Open table documents from an attested run')
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
    source = {'authority': 'Damocles Atari ST Working Authority', 'run': args.run.name,
              'ramSha256': hashlib.sha256(data).hexdigest(),
              'programSha256': manifest['authority']['programSha256'],
              'tosSha256': manifest['authority']['tosSha256'],
              'evidence': EVIDENCE}
    result = extract(data, source)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, sort_keys=True) + '\n')
    print(json.dumps({'documents': len(result['documents']),
                      'items': sum(len(d['items']) for d in result['documents'])}))


if __name__ == '__main__':
    main()
