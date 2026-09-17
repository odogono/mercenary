"""Independent extractor of the Damocles Script bank's message text (ADR 0029, ADR 0043).

The script bank holds every string the Damocles Script VM can present, in two
forms: the 64-slot **system string table** at `$070000`, whose word pointers
reach a NUL-terminated pool at the tail of the bank, and the **inline messages**
carried in the bytecode itself by opcode `$01`. Both are recovered material that
belongs in the Data Payload rather than being paraphrased into the app.

This is a payload writer, and deliberately separate from `damocleslab.script`,
which stays the human-readable research listing it has always been. It reuses
that module's pure decode functions so the instruction grammar has one home;
nothing here changes what `lab script` prints.

Records are emitted **verbatim**, padding included. The pool's space padding
carries the original's alignment of each line within its field, which the
message reveal model (#307) still depends on, so stripping it here would discard
a presentation fact. Consumers trim; the payload does not.

See docs/research/damocles-script-strings.md for the recovered grammar.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path

from .script import (
    BANK_BASE,
    DEFAULT_END,
    DEFAULT_ENTRIES,
    DEFAULT_START,
    SCRIPT_TABLE_BASE,
    STRING_TABLE_BASE,
    TABLE_COUNT,
    decode_scripts,
    read_script_table,
)

# The entry points the research reached that the entry table does not name: the
# arrival briefing the intro script runs, and the idle loop the resident PC
# parks in. Their records would otherwise be absent with no record of the gap.
UNSLOTTED_ENTRIES = DEFAULT_ENTRIES

MESSAGE_OPCODE = 0x01
INDEXED_OPCODE = 0x14
# $14 doubles its operand; below $01E0 the doubled value indexes the system
# string table at $070000 directly, and only at or above it is a slot fetched
# from $7A42 first. See docs/research/damocles-script-isa.md.
INDEXED_DIRECT_LIMIT = 0x01_E0


def digest(text: str) -> str:
    return hashlib.sha256(text.encode('ascii')).hexdigest()


def hex_address(address: int) -> str:
    return f'0x{address:06x}'


def read_record(data: bytes, address: int, limit: int) -> str:
    """Read one NUL-terminated pool record, failing closed on a missing terminator."""
    stop = data.find(b'\x00', address, limit)
    if stop == -1:
        raise ValueError(f'unterminated string record at ${address:06x}')
    raw = data[address:stop]
    if any(byte < 0x20 or byte > 0x7E for byte in raw):
        raise ValueError(f'string record at ${address:06x} is not printable ASCII')
    return raw.decode('ascii')


def system_strings(data: bytes, pool_end: int) -> list[dict]:
    """Resolve all 64 system string slots to records, in slot order."""
    entries = []
    for slot in range(TABLE_COUNT):
        pointer = STRING_TABLE_BASE + slot * 2
        address = BANK_BASE + int.from_bytes(data[pointer:pointer + 2], 'big')
        text = read_record(data, address, pool_end)
        entries.append({
            'address': hex_address(address),
            'id': f'system-string-{slot}',
            'sha256': digest(text),
            'slot': slot,
            'text': text,
        })
    return entries


def scope_id(slot: int | None, address: int) -> str:
    """Name the script an inline message belongs to.

    A table slot is its decimal index, so the contract's `script2-inline-1`
    keeps its name; an entry the table does not reach is its six-digit source
    address, which cannot be mistaken for a slot in 0-63.
    """
    return f'script{slot}' if slot is not None else f'script{address:06x}'


def inline_messages(data: bytes, start: int, end: int) -> tuple[list[dict], list[dict], int]:
    """Walk every script and collect its inline messages and indexed references.

    A record reached from more than one entry belongs to the lowest reaching
    table slot: the bank shares code between scripts, so reachability alone does
    not partition the records and the tie-break has to be stated rather than
    assumed. Ordinals then count that scope's own records in address order.
    """
    table = read_script_table(data)
    scopes: list[tuple[int | None, int]] = [
        (slot, address) for slot, address in enumerate(table) if start <= address < end
    ]
    scopes += [(None, address) for address in UNSLOTTED_ENTRIES]

    owners: dict[int, tuple[int | None, int]] = {}
    references: list[dict] = []
    for slot, address in scopes:
        decode = decode_scripts(data, start=start, end=end, entries=(address,))
        for op in decode.ops.values():
            if op.opcode == MESSAGE_OPCODE:
                owners.setdefault(op.address, (slot, address))
            elif op.opcode == INDEXED_OPCODE:
                references.append({'address': op.address, 'operand': int.from_bytes(op.operands, 'big')})

    messages: list[dict] = []
    ordinals: Counter[str] = Counter()
    for message_address in sorted(owners):
        slot, entry = owners[message_address]
        scope = scope_id(slot, entry)
        ordinals[scope] += 1
        text = read_record(data, message_address + 2, end)
        messages.append({
            'address': hex_address(message_address),
            'id': f'{scope}-inline-{ordinals[scope]}',
            'ordinal': ordinals[scope],
            'script': scope,
            'scriptAddress': hex_address(entry),
            'sha256': digest(text),
            'text': text,
        })

    seen = {reference['address'] for reference in references}
    unique = [next(r for r in references if r['address'] == a) for a in sorted(seen)]
    unslotted = sum(1 for slot, _ in owners.values() if slot is None)
    return messages, [resolve_reference(reference) for reference in unique], unslotted


def resolve_reference(reference: dict) -> dict:
    """Resolve one `$14` operand to a system string slot, or record that it is not direct."""
    operand = reference['operand']
    direct = operand * 2 < INDEXED_DIRECT_LIMIT
    within_table = operand < TABLE_COUNT
    return {
        'address': hex_address(reference['address']),
        'operand': operand,
        'target': f'system-string-{operand}' if direct and within_table else None,
    }


def extract(data: bytes, source: dict, *, pool_end: int) -> dict:
    entries = system_strings(data, pool_end)
    messages, references, unslotted = inline_messages(data, DEFAULT_START, DEFAULT_END)
    lengths = [len(message['text']) for message in messages]
    pool = sorted({int(entry['address'], 16) for entry in entries})
    unresolved = [reference for reference in references if reference['target'] is None]
    return {
        'coverage': {
            'complete': False,
            'notes': [
                'Resident script bank only. The Working Authority loads further banks from disk '
                'and their text is not covered.',
                f'{len(set(entry["text"] for entry in entries))} distinct records back the 64 '
                'system string slots; repeated pointers are unused slots sharing a target, not '
                'separate messages.',
                f'{len(messages) - unslotted} inline messages belong to the 64 entry-table '
                f'scripts and {unslotted} to entries outside that table.',
                'Records are stored verbatim, padding included: the pool centres each line within '
                'its field and that alignment is a presentation fact (#307), not decoration.',
                f'{len(unresolved)} of {len(references)} indexed message references resolve '
                'through the $7A42 table rather than straight into the slot table, and carry no '
                'target rather than a guessed one.',
                f'{sum(1 for entry in entries if entry["text"] == "")} slots point at the pool '
                'terminator and resolve to an empty record; that is what the table holds, not a '
                'failed read.',
            ],
        },
        'encoding': {
            'alignment': 'word',
            'characterSet': 'ascii-printable',
            'formattingCodes': 0,
            'note': 'Records are NUL-terminated printable ASCII; the decode fails closed outside '
                    '$20-$7E. Every byte of every record in this bank falls in $20-$5A: no '
                    'lowercase, no control code, no escape and no formatting marker appears in '
                    'either form.',
            'terminator': 0,
            'unsupportedRecords': 0,
        },
        'inlineMessages': messages,
        'indexedReferences': references,
        'schemaVersion': 1,
        'source': source,
        'statistics': {
            'inlineLengthMaximum': max(lengths),
            'inlineLengthMinimum': min(lengths),
            'systemStringLengthMaximum': max(len(entry['text']) for entry in entries),
            'systemStringLengthMinimum': min(len(entry['text']) for entry in entries),
        },
        'systemStrings': {
            'entries': entries,
            'poolEndAddress': hex_address(pool_end),
            'poolStartAddress': hex_address(pool[0]),
            'scriptTableAddress': hex_address(SCRIPT_TABLE_BASE),
            'slotCount': TABLE_COUNT,
            'tableAddress': hex_address(STRING_TABLE_BASE),
        },
        'title': 'Damocles',
    }


def main():
    parser = argparse.ArgumentParser(
        description='Extract the Damocles Script bank message strings from an attested run')
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
              'evidence': 'docs/research/damocles-script-strings.md'}
    result = extract(data, source, pool_end=pool_end(data))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, sort_keys=True) + '\n')
    print(json.dumps({'systemStrings': len(result['systemStrings']['entries']),
                      'inlineMessages': len(result['inlineMessages']),
                      'indexedReferences': len(result['indexedReferences'])}))


def pool_end(data: bytes) -> int:
    """Find the end of the string pool: the terminator of its last record.

    The pool runs to the end of the bank's first region. Measuring it from the
    records themselves rather than pinning a constant keeps the bound honest if
    a different capture lays the pool out differently.
    """
    limit = DEFAULT_END + 0x1000
    end = max(BANK_BASE + int.from_bytes(data[STRING_TABLE_BASE + slot * 2:
                                              STRING_TABLE_BASE + slot * 2 + 2], 'big')
              for slot in range(TABLE_COUNT))
    stop = data.find(b'\x00', end, limit)
    if stop == -1:
        raise ValueError('string pool has no terminated final record')
    return stop + 1


if __name__ == '__main__':
    main()
