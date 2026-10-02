"""Independent extractor of the Damocles Title Logo from the Working-Authority STX (ADR 0063, #695).

The title screen is a NEOchrome picture the game keeps on its own disk as `ETITLE.NEO`.
Nothing here reads a screenshot or a capture: every byte comes from the STX, through the
same steps the game's own loader takes, and a title-screen capture only confirms the result.

1. The loader at `$68704` restores to track 0 and reads sectors 2 and 3 of side 0, then
   `$6891E` decrypts those 1,024 bytes with a word keystream into the directory at `$68AA4`:
   sixteen bytes an entry, an eleven-character name and five bytes that `$68300` unpacks into
   a start track, a byte offset into that track's data and a length.
2. A file track has no sectors. `$68364` reads the whole track, finds the `$A1` sync, checks
   `$0F`, the track number, `$0F` and the side identity `$44`, skips one byte, and walks 6,144
   data bytes: `$0F` escapes the next byte, which is stored inverted. The first track is
   entered at the entry's offset; the rest from their first data byte.
3. `$68432` decrypts the file with a long keystream, and a file tagged `OTNM` is then unpacked
   in place by `$68530`, a bit stream read backwards from its end.

BOOT (track 2) is itself such a file. It loads `ETITLE.NEO` to `$60000` (`$6801C`), points
the screen at `$78000` with the picture's palette from `$60004` (`$680AC`), and copies the
32,000 bytes of pixels from `$60080` to the screen (`$68042`). See
docs/research/damocles-title-logo.md.

The Title Logo is the DAMOCLES lettering: the 8-connected run of non-zero pixels within the
lettering's rows that the lettering reaches. That takes in the sword hilt and the glow behind
MOC, which touch the letters, and leaves out the stars, which are single pixels on their own.
The lettering ships as `title.png`, a 4-bit indexed PNG in the picture's palette; the
document carries its provenance and hashes of the PNG and of its indices.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from . import png

EVIDENCE = 'docs/research/damocles-title-logo.md'
IMAGE = 'title.png'

DIRECTORY_SECTORS = (2, 3)
DIRECTORY_AT = 0x068AA4
DIRECTORY_ENTRY = 16
TRACK_DATA = 6144
SIDE_IDENTITY = 0x44
ESCAPE = 0x0F
PACKED_TAG = b'OTNM'

TITLE_FILE = 'ETITLE  NEO'
TITLE_LOADED_AT = 0x060000
NEO_HEADER = 128
NEO_PALETTE = 4
SCREEN_BASE = 0x078000
WIDTH = 320
HEIGHT = 200
BYTES_PER_LINE = 160

# The rows the lettering occupies: row 43 down holds only the glow and the sword blade.
LOGO_ROWS = (0, 43)
# A pixel of the D's upright, from which the lettering is walked.
LOGO_SEED = (58, 20)

LONG = 0xFFFF_FFFF
WORD = 0xFFFF


def hex_address(address: int) -> str:
    return f'${address:05X}'


def stx_tracks(data: bytes) -> dict:
    """The Pasti record of every track by (cylinder, side): its raw image and sector data."""
    if data[:4] != b'RSY\x00' or int.from_bytes(data[4:6], 'little') != 3:
        raise ValueError('not a Pasti version-3 STX image')
    offset = 16
    tracks = {}
    for _ in range(data[10]):
        size = int.from_bytes(data[offset:offset + 4], 'little')
        fuzzy = int.from_bytes(data[offset + 4:offset + 8], 'little')
        count = int.from_bytes(data[offset + 8:offset + 10], 'little')
        flags = int.from_bytes(data[offset + 10:offset + 12], 'little')
        number = data[offset + 14]
        cursor = offset + 16
        descriptors = [data[cursor + 16 * slot:cursor + 16 * slot + 16] for slot in range(count)]
        area = cursor + 16 * count + fuzzy
        image = None
        if flags & 0x40:
            length = int.from_bytes(data[area:area + 2], 'little')
            image = data[area + 2:area + 2 + length]
        sectors = {}
        for descriptor in descriptors:
            if descriptor[14] & 0x10:
                continue
            start = int.from_bytes(descriptor[0:4], 'little')
            sectors[descriptor[10]] = data[area + start:area + start + (128 << descriptor[11])]
        tracks[(number & 0x7F, number >> 7)] = {'image': image, 'sectors': sectors}
        offset += size
    if offset != len(data):
        raise ValueError('bytes follow the last STX track record')
    return tracks


def rotate_word(value: int, count: int, left: bool) -> int:
    count %= 16
    if count == 0:
        return value
    if left:
        return ((value << count) | (value >> (16 - count))) & WORD
    return ((value >> count) | (value << (16 - count))) & WORD


def decrypt_directory(block: bytes) -> bytes:
    """`$6891E`: the word keystream over the 1,024 directory bytes."""
    out = bytearray(block)
    d1, d2 = 0x2367, 0xED5F
    for at in range(0, len(out), 2):
        word = int.from_bytes(out[at:at + 2], 'big') ^ d1
        d1 = rotate_word(d1, d1, left=True)
        d2 ^= d1
        d2 = (d2 + d1) & WORD
        d2 = rotate_word(d2, d2, left=False)
        out[at:at + 2] = (word ^ d2).to_bytes(2, 'big')
    return bytes(out)


def directory_entry(entry: bytes) -> dict:
    """`$68300`: five bytes rotated out a bit at a time into offset, track and length."""
    offset, value = entry[11], int.from_bytes(entry[12:16], 'big')
    track = length = extend = 0

    def take(register: int, width: int) -> int:
        nonlocal value, extend
        for _ in range(width):
            value, extend = (value >> 1) | (extend << 31), value & 1
            register = (register << 1) | extend
        return register

    offset = take(offset, 6) & WORD
    track = take(track, 7) & WORD
    length = (take(length, 19) - 4) & LONG
    return {
        'name': entry[:11].decode('ascii'),
        'track': track,
        'offset': offset,
        'length': length,
    }


def directory(tracks: dict) -> tuple[bytes, list[dict]]:
    sectors = tracks[(0, 0)]['sectors']
    block = decrypt_directory(b''.join(sectors[number] for number in DIRECTORY_SECTORS))
    entries = []
    for at in range(0, len(block), DIRECTORY_ENTRY):
        entry = block[at:at + DIRECTORY_ENTRY]
        if not any(entry):
            break
        entries.append(directory_entry(entry))
    return block, entries


def read_file(tracks: dict, entry: dict) -> tuple[bytes, list[int]]:
    """`$68364`: the file's bytes off its tracks, escapes undone."""
    out = bytearray()
    escaped = False
    track, skip = entry['track'], entry['offset']
    read = []
    while True:
        image = tracks[(track, 0)]['image']
        at = image.index(0xA1)
        while image[at] == 0xA1:
            at += 1
        if image[at:at + 4] != bytes([ESCAPE, track, ESCAPE, SIDE_IDENTITY]):
            raise ValueError(f'track {track} does not carry the loader header')
        read.append(track)
        for byte in image[at + 5 + skip:at + 5 + TRACK_DATA]:
            if escaped:
                escaped = False
                out.append(byte ^ 0xFF)
            elif byte == ESCAPE:
                escaped = True
                continue
            else:
                out.append(byte)
            if len(out) == entry['length']:
                return bytes(out), read
        track, skip = track + 1, 0


def decrypt_file(data: bytes) -> bytes:
    """`$68432`: the long keystream over the whole file."""
    out = bytearray(data)
    d0, d1 = 0xF4BD128C, 0x5716923A
    for at in range(len(out)):
        out[at] = (out[at] ^ d0 ^ d1) & 0xFF
        d0 = ((d0 >> 16) | (d0 << 16)) & LONG
        count = d0 % 32
        if count:
            d0 = ((d0 << count) | (d0 >> (32 - count))) & LONG
        d0 ^= d1
        d1 = (d1 + d0) & LONG
    return bytes(out)


def unpack(data: bytes) -> bytes:
    """`$68530`: an `OTNM` file unpacked backwards from the end of its bit stream."""
    if data[:4] != PACKED_TAG:
        raise ValueError('file is not OTNM-packed')
    size = int.from_bytes(data[4:8], 'big')
    cursor = 8 + int.from_bytes(data[8:12], 'big')
    out = bytearray(size)
    state = {'bits': 0, 'cursor': cursor}

    def longword() -> int:
        state['cursor'] -= 4
        return int.from_bytes(data[state['cursor']:state['cursor'] + 4], 'big')

    def bit() -> int:
        bits = state['bits']
        carry, bits = bits >> 31, (bits << 1) & LONG
        if bits == 0:
            bits = longword()
            carry, bits = bits >> 31, ((bits << 1) | 1) & LONG
        state['bits'] = bits
        return carry

    def field(width: int) -> int:
        value = 0
        for _ in range(width):
            value = (value << 1) | bit()
        return value

    state['bits'] = longword()
    end = size
    while end > 0:
        literals = 0
        if not bit():
            if bit():
                width, length = 8, 2
            else:
                literals = field(3) + 1
        else:
            kind = field(2)
            if kind == 3:
                literals = field(8) + 9
            elif kind == 2:
                length, width = field(8) + 1, 8
            else:
                width, length = 8 + kind, kind + 3
        if literals:
            for _ in range(literals):
                end -= 1
                out[end] = field(8)
            continue
        distance = field(width)
        for _ in range(length):
            end -= 1
            out[end] = out[end + distance]
    return bytes(out)


def picture_pixels(neo: bytes) -> list[list[int]]:
    """The NEOchrome picture's 320x200 colour indices, four interleaved planes a 16-pixel group."""
    rows = []
    for y in range(HEIGHT):
        line = neo[NEO_HEADER + y * BYTES_PER_LINE:NEO_HEADER + (y + 1) * BYTES_PER_LINE]
        row = []
        for group in range(WIDTH // 16):
            planes = [int.from_bytes(line[group * 8 + 2 * p:group * 8 + 2 * p + 2], 'big')
                      for p in range(4)]
            for shift in range(15, -1, -1):
                row.append(sum(((planes[p] >> shift) & 1) << p for p in range(4)))
        rows.append(row)
    return rows


def lettering(pixels: list[list[int]]) -> set[tuple[int, int]]:
    """The 8-connected non-zero pixels of the lettering's rows that the lettering reaches."""
    top, bottom = LOGO_ROWS
    if not pixels[LOGO_SEED[1]][LOGO_SEED[0]]:
        raise ValueError('the lettering seed is not on the lettering')
    found = {LOGO_SEED}
    pending = [LOGO_SEED]
    while pending:
        x, y = pending.pop()
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                nx, ny = x + dx, y + dy
                if (0 <= nx < WIDTH and top <= ny < bottom and (nx, ny) not in found
                        and pixels[ny][nx]):
                    found.add((nx, ny))
                    pending.append((nx, ny))
    return found


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def gun(word: int, shift: int) -> int:
    """An ST gun level (3 bits) as 8-bit, as the Browser Shell shows it."""
    return round(((word >> shift) & 7) * 255 / 7)


def extract(stx: bytes) -> tuple[dict, bytes]:
    """The title document and the lettering as a PNG."""
    tracks = stx_tracks(stx)
    block, entries = directory(tracks)
    entry = next((e for e in entries if e['name'] == TITLE_FILE), None)
    if entry is None:
        raise ValueError(f'the directory has no {TITLE_FILE!r}')
    stored, read = read_file(tracks, entry)
    packed = decrypt_file(stored)
    neo = unpack(packed)
    if len(neo) != NEO_HEADER + HEIGHT * BYTES_PER_LINE or neo[:4] != bytes(4):
        raise ValueError(f'{TITLE_FILE!r} is not a low-resolution NEOchrome picture')
    palette = [int.from_bytes(neo[NEO_PALETTE + 2 * i:NEO_PALETTE + 2 * i + 2], 'big')
               for i in range(16)]
    pixels = picture_pixels(neo)
    mark = lettering(pixels)
    left = min(x for x, _ in mark)
    right = max(x for x, _ in mark) + 1
    top = min(y for _, y in mark)
    bottom = max(y for _, y in mark) + 1
    rows = [[pixels[y][x] if (x, y) in mark else 0 for x in range(left, right)]
            for y in range(top, bottom)]
    image = png.write(rows, [(gun(c, 8), gun(c, 4), gun(c, 0)) for c in palette])
    pixel_start = TITLE_LOADED_AT + NEO_HEADER
    return {
        'schemaVersion': 1,
        'title': 'Damocles',
        'kind': 'title-logo',
        'source': {
            'authority': 'Damocles Atari ST Working Authority',
            'evidence': EVIDENCE,
            'programSha256': sha256(stx),
            'recipe': 'python3 -m damocleslab.title --stx <STX> --output payload/damocles/title.json'
                      ' (writes title.png beside it)',
        },
        'disk': {
            'directory': {
                'track': 0,
                'side': 0,
                'sectors': list(DIRECTORY_SECTORS),
                'decrypt': '$6891E',
                'loadedAt': hex_address(DIRECTORY_AT),
                'sha256': sha256(block),
            },
            'file': {
                'name': TITLE_FILE,
                'entry': {k: entry[k] for k in ('track', 'offset', 'length')},
                'tracks': read,
                'side': 0,
                'reader': '$68364',
                'storedSha256': sha256(stored),
                'decrypt': '$68432',
                'packing': {'tag': PACKED_TAG.decode('ascii'), 'unpacker': '$68530',
                            'packedSha256': sha256(packed)},
                'format': 'NEOchrome',
                'size': len(neo),
                'loadedAt': hex_address(TITLE_LOADED_AT),
                'loader': '$6801C',
                'provenance': {
                    'range': [hex_address(TITLE_LOADED_AT),
                              hex_address(TITLE_LOADED_AT + len(neo))],
                    'sha256': sha256(neo),
                },
            },
        },
        'screen': {
            'width': WIDTH,
            'height': HEIGHT,
            'planes': 4,
            'bytesPerLine': BYTES_PER_LINE,
            'base': hex_address(SCREEN_BASE),
            'setUp': '$680AC: low resolution, base $78000, palette $60004 -> $FF8240',
            'copy': '$68042: $60080..$67D80 -> $78000..$7FD00',
        },
        'palette': {
            'colours': palette,
            'provenance': {
                'range': [hex_address(TITLE_LOADED_AT + NEO_PALETTE),
                          hex_address(TITLE_LOADED_AT + NEO_PALETTE + 32)],
                'sha256': sha256(neo[NEO_PALETTE:NEO_PALETTE + 32]),
            },
        },
        'logo': {
            'x': left,
            'y': top,
            'width': right - left,
            'height': bottom - top,
            'rule': (
                f'the 8-connected non-zero pixels of rows {LOGO_ROWS[0]}..{LOGO_ROWS[1] - 1} '
                f'reached from ({LOGO_SEED[0]}, {LOGO_SEED[1]}) on the D; every other pixel, '
                'colour 0 and the single-pixel stars among them, is clear'
            ),
            'image': {
                'file': IMAGE,
                'sha256': sha256(image),
                'format': 'PNG, 4-bit indexed in the picture palette: 0 transparent, 1..15 opaque',
                'markSha256': sha256(png.mark_nibbles(rows)),
                'markEncoding': 'two palette indices a byte, left pixel high, rows padded to a byte',
            },
            'provenance': {
                'range': [hex_address(pixel_start + top * BYTES_PER_LINE),
                          hex_address(pixel_start + bottom * BYTES_PER_LINE)],
                'sha256': sha256(neo[NEO_HEADER + top * BYTES_PER_LINE:
                                     NEO_HEADER + bottom * BYTES_PER_LINE]),
            },
        },
    }, image


def confirm(document: dict, ram: bytes) -> None:
    """A title-screen capture holds the same picture at `$060000` and on the screen."""
    neo = ram[TITLE_LOADED_AT:TITLE_LOADED_AT + NEO_HEADER + HEIGHT * BYTES_PER_LINE]
    if sha256(neo) != document['disk']['file']['provenance']['sha256']:
        raise ValueError('the capture does not hold the extracted picture at $060000')
    if ram[SCREEN_BASE:SCREEN_BASE + HEIGHT * BYTES_PER_LINE] != neo[NEO_HEADER:]:
        raise ValueError('the capture does not show the extracted picture at $078000')


def main():
    parser = argparse.ArgumentParser(
        description='Extract the Damocles Title Logo from the Working-Authority STX')
    parser.add_argument('--stx', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--confirm-run', type=Path,
                        help='a title-screen capture to check the extraction against')
    args = parser.parse_args()
    stx = args.stx.read_bytes()
    pin = json.loads((Path(__file__).parents[1] / 'config/working-authority.json').read_text())
    if sha256(stx) != pin['programImage']['hashes']['sha256']:
        raise SystemExit('the STX is not the pinned Working Authority')
    document, image = extract(stx)
    if args.confirm_run is not None:
        confirm(document, (args.confirm_run / 'title-screen.ram').read_bytes())
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(document, indent=2) + '\n')
    (args.output.parent / IMAGE).write_bytes(image)
    logo = document['logo']
    print(json.dumps({'logo': [logo['x'], logo['y'], logo['width'], logo['height']],
                      'confirmed': args.confirm_run is not None}))


if __name__ == '__main__':
    main()
