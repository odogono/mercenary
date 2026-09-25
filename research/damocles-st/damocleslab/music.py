"""Independent extractor of the Damocles music player's tune (ADR 0029, ADR 0043).

The GHETTOBLASTER's music is a three-voice byte stream read by the player at
`$033F6A`, with volume and pitch tables it walks a VBL at a time. The streams and
tables are recovered material that belongs in the Data Payload rather than being
transcribed into the app, so this module decodes them from an attested run and
writes `payload/damocles/music.json`. The player's own behaviour (which voice
drives which channel, the order of its writes) is a code fact the port states
itself; see docs/research/damocles-sound-programmes.md#the-music-player.

A voice stream holds `0 n` (volume table *n*), `1 n` (pitch table *n*), `2` and a
24-bit address (jump), or a byte *d* ≥ 3 and a word: a note of *d* − 2 VBLs at
that base period (`$8000` and up is a rest). A table is (count, value) byte pairs
walked as `$04C73A` walks them: a count of zero ends it, and a count of `$80` or
more jumps to the aligned long that follows.

Table index 0 is a null pointer, so a voice that has not picked a table walks from
address 0. On an ST that reads the TOS ROM's first bytes, so the capture's own
eight bytes there are carried as `addressZero`; they are the TOS's, not the game's.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

PLAYER = 0x03_3F6A
VOICE_STARTS = (0x03_441E, 0x03_489C, 0x03_4D90)
VOLUME_TABLES = 0x03_4FB0
PITCH_TABLES = 0x03_501A
# How many longs each pointer table holds before the table data begins.
VOLUME_TABLE_COUNT = 6
PITCH_TABLE_COUNT = 7
REST = 0x80_00
STEP_LIMIT = 10_000


def hex_address(address: int) -> str:
    return f'0x{address:06x}'


def read_long(data: bytes, address: int) -> int:
    return int.from_bytes(data[address:address + 4], 'big')


def walk_table(data: bytes, start: int) -> dict:
    """Decode one (count, value) table from `start`, failing closed on a runaway walk.

    The value is signed, as `ext.w` makes it. A jump is recorded as the entry index it
    lands on; a jump to anywhere but an entry boundary already read is refused.
    """
    entries: list[list[int]] = []
    offsets: dict[int, int] = {}
    address = start
    for _ in range(STEP_LIMIT):
        count = data[address]
        if count == 0:
            return {'address': hex_address(start), 'entries': entries, 'loop': None}
        if count >= 0x80:
            target = read_long(data, (address + 2) & ~1)
            if target not in offsets:
                raise ValueError(f'table ${start:06x} jumps to ${target:06x}, not an entry it read')
            return {'address': hex_address(start), 'entries': entries, 'loop': offsets[target]}
        offsets[address] = len(entries)
        value = data[address + 1]
        entries.append([count, value - 0x100 if value >= 0x80 else value])
        address += 2
    raise ValueError(f'table ${start:06x} does not end')


def tables(data: bytes, base: int, count: int) -> list[dict]:
    """Every non-null entry of a pointer table, by index."""
    found = []
    for index in range(1, count):
        pointer = read_long(data, base + 4 * index)
        if pointer == 0:
            continue
        found.append({'index': index, **walk_table(data, pointer)})
    return found


def voice(data: bytes, start: int) -> dict:
    """Decode one voice stream up to the jump that closes its loop."""
    ops: list[dict] = []
    offsets: dict[int, int] = {}
    address = start
    for _ in range(STEP_LIMIT):
        offsets.setdefault(address, len(ops))
        command = data[address]
        if command in (0, 1):
            ops.append({'op': 'volume' if command == 0 else 'pitch', 'table': data[address + 1]})
            address += 2
        elif command == 2:
            target = int.from_bytes(data[address + 1:address + 4], 'big')
            if target not in offsets:
                raise ValueError(f'voice ${start:06x} jumps to ${target:06x}, not an op it read')
            end = address + 4
            notes = [op for op in ops if op['op'] == 'note']
            return {
                'address': hex_address(start),
                'loop': offsets[target],
                'loopVbls': sum(op['vbls'] for op in ops[offsets[target]:] if op['op'] == 'note'),
                'notes': len(notes),
                'ops': ops,
                'sha256': hashlib.sha256(data[start:end]).hexdigest(),
                'sourceEnd': hex_address(end),
            }
        else:
            period = int.from_bytes(data[address + 1:address + 3], 'big')
            ops.append({'op': 'note', 'period': period, 'vbls': command - 2})
            address += 3
    raise ValueError(f'voice ${start:06x} does not loop')


def extract(data: bytes, source: dict) -> dict:
    voices = [voice(data, start) for start in VOICE_STARTS]
    loops = {v['loopVbls'] for v in voices}
    if len(loops) != 1:
        raise ValueError(f'the voices loop at different lengths: {sorted(loops)}')
    volume = tables(data, VOLUME_TABLES, VOLUME_TABLE_COUNT)
    pitch = tables(data, PITCH_TABLES, PITCH_TABLE_COUNT)
    known = {'volume': {t['index'] for t in volume}, 'pitch': {t['index'] for t in pitch}}
    for number, v in enumerate(voices, 1):
        for op in v['ops']:
            if op['op'] in known and op['table'] not in known[op['op']] | {0}:
                raise ValueError(f'voice {number} picks {op["op"]} table {op["table"]}, which is not recovered')
    return {
        'addressZero': {
            'bytes': list(data[0:8]),
            'note': 'What a table index of 0 walks, and what the player writes as the noise period '
                    '(the byte at $000001). On an ST these are the TOS ROM header, so they belong '
                    'to the TOS the capture ran, not to the game.',
        },
        'coverage': {
            'complete': True,
            'notes': [
                'The three voices of the resident player at $033F6A, each to the jump that closes its loop.',
                'Every non-null volume and pitch table the pointer tables at $034FB0 and $03501A hold.',
            ],
        },
        'loopVbls': loops.pop(),
        'pitchTables': pitch,
        'player': hex_address(PLAYER),
        'schemaVersion': 1,
        'source': source,
        'title': 'Damocles',
        'voices': voices,
        'volumeTables': volume,
    }


def main():
    parser = argparse.ArgumentParser(
        description='Extract the Damocles music player tune from an attested run')
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
              'evidence': 'docs/research/damocles-sound-programmes.md'}
    result = extract(data, source)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, sort_keys=True) + '\n')
    print(json.dumps({'voices': [v['notes'] for v in result['voices']], 'loopVbls': result['loopVbls'],
                      'volumeTables': len(result['volumeTables']), 'pitchTables': len(result['pitchTables'])}))


if __name__ == '__main__':
    main()
