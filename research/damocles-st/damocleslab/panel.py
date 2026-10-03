"""Independent extractor of Damocles panel artwork and writer data (#740, ADR 0043).

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

from .panel_writers import nibble_rows, writer_data

WRITER = 0x052B24
STRIP = 0x076600
PITCH_WORD = 0x7AC0
PLANES = (1, 3)
WINDOW_ROWS = 20
POSITIONS = 64
ROWS = POSITIONS + WINDOW_ROWS - 1
ROW_BYTES = 4
EVIDENCE = 'docs/research/damocles-pitch-strip.md'
PANEL_EVIDENCE = 'docs/research/damocles-panel-writer-data.md'
PINNED_RAM_SHA256 = 'b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967'
FILE_IDENTITIES = {
    'DAM0': (0x140, 425664, 'b25a0f53fe4b8a648e0f34f2ef9489ffc21e2af5f069cf73a2c1b625ee3781e7'),
    'DAM1': (0x6D500, 43776, '6b101bc97d14c695e51ffa36a35d5bf3ca1238c5102703dee6beccfdbdff1437'),
}

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


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def address(value: int) -> str:
    return f'${value:05X}'


class PanelSources:
    """Verified disk files and pinned RAM; every returned slice names its source."""

    def __init__(self, stx: bytes, ram: bytes):
        from .title import stx_tracks, directory, read_file, decrypt_file, unpack
        pin = json.loads((Path(__file__).parents[1] / 'config/working-authority.json').read_text())
        if sha256(stx) != pin['programImage']['hashes']['sha256']:
            raise ValueError('the STX is not the pinned Working Authority')
        if sha256(ram) != PINNED_RAM_SHA256:
            raise ValueError('the capture is not the pinned first-world RAM')
        self.ram = ram
        self.files = {}
        self.disk = {'directory': {}, 'files': {}}
        tracks = stx_tracks(stx)
        block, entries = directory(tracks)
        self.disk['directory'] = {
            'track': 0, 'side': 0, 'sectors': [2, 3], 'sha256': sha256(block),
            'reader': '$68704', 'decrypt': '$6891E',
        }
        for name, (base, size, digest) in FILE_IDENTITIES.items():
            entry = next(e for e in entries if e['name'].strip() == name)
            stored, read = read_file(tracks, entry)
            packed = decrypt_file(stored)
            data = unpack(packed)
            if len(data) != size or sha256(data) != digest:
                raise ValueError(f'{name} is not the recovered file')
            self.files[name] = data
            self.disk['files'][name] = {
                'entry': {k: entry[k] for k in ('track', 'offset', 'length')},
                'tracks': read, 'side': 0, 'reader': '$68364', 'decrypt': '$68432',
                'unpacker': '$68530', 'storedSha256': sha256(stored),
                'packedSha256': sha256(packed), 'size': size,
                'loadedAt': address(base), 'sha256': digest,
            }

    def disk_slice(self, name: str, start: int, end: int, *, confirm: bool = True) -> tuple[bytes, dict]:
        base, size, _ = FILE_IDENTITIES[name]
        lo, hi = start - base, end - base
        if not 0 <= lo < hi <= size:
            raise ValueError(f'{name} source range is outside the recovered file')
        data = self.files[name][lo:hi]
        if confirm and data != self.ram[start:end]:
            raise ValueError(f'{name} bytes at {address(start)} differ from pinned RAM')
        return data, {'file': name, 'offsetRange': [address(lo), address(hi)],
                      'loadedRange': [address(start), address(end)], 'sha256': sha256(data)}

    def ram_slice(self, start: int, end: int) -> dict:
        return {'range': [address(start), address(end)],
                'sha256': sha256(self.ram[start:end]), 'source': 'pinned first-world RAM'}

    def word(self, at: int) -> int:
        return int.from_bytes(self.ram[at:at + 2], 'big')


def extract_panel(stx: bytes, ram: bytes, source: dict) -> dict:
    """Complete static panel preparation; the legacy pitch member stays unchanged."""
    sources = PanelSources(stx, ram)
    result = extract(ram, source)
    result['source'] = {
        **result['source'], 'programSha256': sha256(stx), 'ramSha256': sha256(ram),
        'panelEvidence': PANEL_EVIDENCE,
        'recipe': 'python3 -m damocleslab.panel --stx <STX> --run <pinned-first-world-run> '
                  '--output payload/damocles/panel.json',
    }
    result['disk'] = sources.disk
    art, provenance = sources.disk_slice('DAM1', 0x6D500, 0x6FD00, confirm=False)
    result['screen'] = {
        'width': 320, 'height': 200, 'planes': 4, 'bytesPerLine': 160,
        'bases': ['$68000', '$78000'], 'panelRows': [136, 199],
        'provenance': sources.ram_slice(0x50936, 0x5094E),
    }
    result['panelArt'] = {
        'width': 320, 'height': 64, 'top': 136, 'pixels': nibble_rows(art, 20),
        'source': 'pristine DAM1 file head, before live readouts', 'provenance': provenance,
    }
    frames, provenance = sources.disk_slice('DAM0', 0x5CB00, 0x5D880)
    native_frames, visible_frames = [], []
    for offset in range(0, len(frames), 54):
        frame = frames[offset:offset + 54]
        words = [[int.from_bytes(frame[y * 6 + p * 2:y * 6 + p * 2 + 2], 'big')
                  for p in range(3)] for y in range(9)]
        native_frames.append(words)
        visible_frames.append([bits(row[2]) + bits(row[1]) + format(row[0] & 0xFF, '08b') for row in words])
    result['compass'] = {
        'writer': '$052A0E', 'word': '$7AC2', 'address': '$5CB00',
        'rule': 'frame (-heading & $3F0) >> 4', 'frameBytes': 54,
        'plane': 3, 'x': [80, 119], 'y': 182, 'windowRows': 9,
        'forcedSet': [[80, 85], [118, 119]],
        'destinations': ['$6F1EE', '$7F1EE'], 'rowStride': 160,
        'storage': 'nine rows of three words; third word, second word, low byte of first word',
        'frameWords': native_frames, 'frames': visible_frames,
        'provenance': provenance,
        'writerProvenance': sources.ram_slice(0x52A0E, 0x52B20),
    }
    _, pitch_provenance = sources.disk_slice('DAM1', STRIP, STRIP + ROWS * ROW_BYTES)
    result['pitchProvenance'] = {
        'strip': pitch_provenance, 'writer': sources.ram_slice(WRITER, 0x52C9C),
        'x': [16, 31], 'y': 171, 'destinations': ['$6EAEA', '$7EAEA'], 'rowStride': 160,
    }
    result.update(writer_data(sources))
    return result


def compare_attitude(document: dict, ram: bytes) -> dict:
    """Compare payload-rendered attitude words against both captured screens."""
    if len(ram) != 0x100000:
        raise ValueError('comparison needs 1 MiB ST RAM')
    heading = int.from_bytes(ram[0x7AC2:0x7AC4], 'big')
    pitch = int.from_bytes(ram[0x7AC0:0x7AC2], 'big')
    start, frame = (pitch & 0x3F0) >> 4, (-heading & 0x3F0) >> 4
    checks = []
    for base in (0x68000, 0x78000):
        pitch_matches = all(
            int.from_bytes(ram[base + 171 * 160 + 10 + y * 160 + p * 4:
                               base + 171 * 160 + 12 + y * 160 + p * 4], 'big')
            == int(document['pitch']['rows'][start + y][p], 2)
            for y in range(20) for p in range(2))
        compass_matches = all(
            format(int.from_bytes(ram[base + 182 * 160 + 46 + y * 160 + offset:
                                      base + 182 * 160 + 46 + y * 160 + offset + width], 'big'),
                   f'0{width * 8}b') == document['compass']['frames'][frame][y][lo:hi]
            for y in range(9) for offset, width, lo, hi in ((0, 2, 0, 16), (8, 2, 16, 32), (16, 1, 32, 40)))
        checks.append({'base': address(base), 'pitch': pitch_matches, 'compass': compass_matches})
    return {'ramSha256': sha256(ram), 'heading': heading, 'pitch': pitch,
            'pitchStart': start, 'compassFrame': frame, 'buffers': checks}


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
        description='Extract pristine Damocles panel artwork and writer data')
    parser.add_argument('--stx', type=Path, required=True)
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
    result = extract_panel(args.stx.read_bytes(), data, source)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(dumps(result))
    print(json.dumps({'panel': [320, 64], 'compassFrames': len(result['compass']['frames']),
                      'pitchRows': len(result['pitch']['rows']), 'gaps': result['gaps']}))


if __name__ == '__main__':
    main()
