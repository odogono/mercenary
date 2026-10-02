"""Independent extractor of the Damocles Benson Panel's pitch strip (ADR 0043).

`$052B24` draws the pitch gauge. It reads the camera pitch `$7AC0`, masks it with `$3F0`
and returns at once while the masked value stands where the last call left it (`$052B20`).
Otherwise it shifts the value right two, which gives a byte offset of four bytes a step, and
copies twenty rows of the strip at `$76600` from there into the panel at `$7EAEA` (and its
twin at `$6EAEA`). The rows lie 160 bytes apart, one screen line, and each row is two words.
`$7EAEA` is two bytes into the sixteen-pixel group at x 16, so they land on bit-planes 1 and 3:
colour 2 (the sky's `#aaccee`) where only the first is set, colour 8 (the ground's `#aaccaa`)
where only the second is, and colour 0 for the marks and figures. A capture's frame buffer
shows exactly those three colours in rows 171 to 190.

So the window shows strip rows `(pitch & $3F0) >> 4` to that plus 19. The pitch counts 1,024
units a turn and reads `$0200` level, so 64 positions a turn and 83 rows in all. A level
camera's window starts at row 32, whose `0` mark sits on the window's middle row, and the
nose going down raises the word, so the scale scrolls up to `90`.

The strip is the artwork Mercenary III's `$53AB2` draws from its own `$3B880`, row for row.
See docs/research/damocles-pitch-strip.md.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

WRITER = 0x052B24
STRIP = 0x076600
PITCH_WORD = 0x7AC0
PLANES = (1, 3)
WINDOW_ROWS = 20
POSITIONS = 64
ROWS = POSITIONS + WINDOW_ROWS - 1
ROW_BYTES = 4
EVIDENCE = 'docs/research/damocles-pitch-strip.md'

# `$052B24`..`$052B47`: move.w $7AC0.w,d0 / andi.w #$3F0,d0 / cmp.w $52B20(pc),d0 /
# beq.b / move.w d0,$52B20.l / lsr.w #2,d0 / movea.w d0,a0 / adda.l #$76600,a0 /
# lea.l $7EAEA.l,a1.
WRITER_CODE = bytes.fromhex(
    '30387ac0024003f0b07afff267f033c000052b20e4483040d1fc0007660043f90007eaea')


def bits(word: int) -> str:
    return format(word, '016b')


def extract(data: bytes, source: dict) -> dict:
    if data[WRITER:WRITER + len(WRITER_CODE)] != WRITER_CODE:
        raise ValueError('the pitch writer at $052B24 is not the recovered routine')
    strip = data[STRIP:STRIP + ROWS * ROW_BYTES]
    rows = [
        [bits(int.from_bytes(strip[i:i + 2], 'big')),
         bits(int.from_bytes(strip[i + 2:i + 4], 'big'))]
        for i in range(0, len(strip), ROW_BYTES)
    ]
    return {
        'schemaVersion': 1,
        'title': 'damocles',
        'source': {**source, 'stripSha256': hashlib.sha256(strip).hexdigest()},
        'pitch': {
            'writer': f'${WRITER:06X}',
            'word': f'${PITCH_WORD:04X}',
            'address': f'${STRIP:05X}',
            'rule': 'rows (pitch & $3F0) >> 4 to that plus 19; each row is planes 1 and 3',
            'planes': list(PLANES),
            'windowRows': WINDOW_ROWS,
            'rows': rows,
        },
    }


def document_source(data: bytes, run: str, program_sha256: str) -> dict:
    return {
        'authority': 'Damocles Atari ST Working Authority',
        'evidence': EVIDENCE,
        'programSha256': program_sha256,
        'ramSha256': hashlib.sha256(data).hexdigest(),
        'run': run,
    }


def dumps(document: dict) -> str:
    """Two-space JSON with each strip row on one line."""
    text = json.dumps(document, indent=2) + '\n'
    for plane0, plane2 in document['pitch']['rows']:
        text = text.replace(
            f'[\n        "{plane0}",\n        "{plane2}"\n      ]',
            f'["{plane0}", "{plane2}"]', 1)
    return text


def main():
    parser = argparse.ArgumentParser(
        description='Extract the Damocles pitch strip from an attested run')
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
    print(json.dumps({'rows': len(result['pitch']['rows'])}))


if __name__ == '__main__':
    main()
