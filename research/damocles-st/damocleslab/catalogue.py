"""Independent decoder of documented Damocles geometric records (ADR 0039).

This is a data parser, not a port of the renderer. Unknown commands fail closed.
See docs/research/damocles-catalogue.md for the recovered record grammar.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import re
import struct
from collections import Counter
from pathlib import Path


def st_rgb(word: int) -> str:
    if word & ~0x777:
        raise ValueError(f'not an ST RGB colour: {word:04x}')
    return '#' + ''.join(f'{((word >> shift) & 7) * 34:02x}' for shift in (8, 4, 0))


class Reader:
    def __init__(self, data: bytes, position: int):
        self.data, self.p = data, position

    def take(self, size: int) -> bytes:
        if self.p < 0 or self.p + size > len(self.data):
            raise ValueError(f'truncated record at ${self.p:06x}')
        result = self.data[self.p:self.p + size]
        self.p += size
        return result

    def word(self) -> int:
        return int.from_bytes(self.take(2), 'big')

    def signed(self) -> int:
        return int.from_bytes(self.take(2), 'big', signed=True)


def colour_value(word: int, palette: list[int] | None, hardware: list[int] | None) -> str:
    if word & 0x8000:
        if word & 0x80:
            if palette is None:
                raise ValueError('scene colour table binding unresolved')
            index = (word & 0x7e) // 2
            if index >= len(palette):
                raise ValueError('scene colour reference outside palette')
            return colour_value(palette[index], None, hardware)
        index = word & 0xfff
        if hardware is None or index >= len(hardware):
            raise ValueError('hardware palette binding unresolved')
        return st_rgb(hardware[index])
    return st_rgb(word)


def decode_key_lettering(data: bytes, reader: Reader, code: str, vertices: list,
                         lines: list, hardware: list[int] | None) -> list[int]:
    """Decode the key's inline vector-text record and source stroke glyphs."""
    anchor = [reader.signed(), reader.signed(), reader.signed()]
    flags, advance = reader.word(), reader.signed()
    scale_x, scale_y = struct.unpack('>bb', reader.take(2))
    colour = reader.word()
    if flags != 0x8000 or reader.word() != 0x8b00:
        raise ValueError('key vector-text configuration unresolved')
    # $8B selects the display-code workspace populated by the $8008 header.
    # Glyph pointers are relative to $31700; font zero starts at ASCII space.
    rgb = colour_value(colour, None, hardware)
    for character_index, character in enumerate(code):
        index = ord(character) - 32
        if not 0 <= index < 96:
            raise ValueError('key glyph outside font zero')
        pointer = Reader(data, 0x31700 + index * 2).signed()
        glyph = Reader(data, 0x31700 + pointer)
        offset = len(vertices)
        for _ in range(63):
            x = int.from_bytes(glyph.take(1), 'big', signed=True)
            if x in (-128, -127):
                if x != -127:
                    raise ValueError('key filled glyph unresolved')
                break
            y = int.from_bytes(glyph.take(1), 'big', signed=True)
            vertices.append([anchor[0] + character_index * advance + x * scale_x,
                             anchor[1] + y * scale_y, anchor[2]])
        else:
            raise ValueError('key glyph vertex terminator missing')
        for _ in range(256):
            a = glyph.take(1)[0]
            if a == 0:
                break
            b = glyph.take(1)[0]
            if any(ref == 0 or ref % 4 or ref // 4 > len(vertices) - offset for ref in (a, b)):
                raise ValueError('invalid key glyph vertex reference')
            lines.append({'vertices': [offset + a // 4 - 1, offset + b // 4 - 1],
                          'colour': rgb, 'sourceColour': colour})
        else:
            raise ValueError('key glyph line terminator missing')
    return anchor


def expand_vector_text(data: bytes, reader: Reader, token_data: bytes | None = None,
                       seen: frozenset[int] = frozenset()) -> str:
    """Expand the native two-byte $80..$98 text tokens through the $CCA0 table."""
    if token_data is None:
        token_data = data
    result = []
    for _ in range(256):
        character = reader.take(1)[0]
        if character == 0:
            return ''.join(result)
        if character & 0x80:
            if reader.take(1)[0] != 0:
                raise ValueError('vector-text token is not terminal')
            index = character & 0x7f
            pointer_address = 0xCCA0 + index * 4
            if pointer_address + 4 > len(token_data):
                raise ValueError('vector-text token table is truncated')
            pointer = int.from_bytes(token_data[pointer_address:pointer_address + 4], 'big')
            if pointer in seen or pointer >= len(token_data):
                raise ValueError('invalid vector-text token reference')
            if pointer in TEXT_ANIMATION_TARGETS:
                # A frame animation reached from a building detail draws one
                # frame of its script. Only a script whose every frame is the
                # same character has a form independent of the free-running
                # index; anything else would need the detail offered per frame,
                # which no captured detail requires, so it fails closed.
                script = text_animation_script(token_data, pointer)
                if len(set(script)) != 1:
                    raise ValueError('building vector-text frame animation unresolved')
                result.append(chr(script[0]))
                return ''.join(result)
            result.append(expand_vector_text(
                token_data, Reader(token_data, pointer), token_data, seen | {pointer}
            ))
            return ''.join(result)
        elif 32 <= character < 127:
            result.append(chr(character))
        else:
            raise ValueError('unsupported vector-text character')
    raise ValueError('vector-text terminator missing')


def append_vector_text(data: bytes, text: str, font: int, anchor: list[int],
                       advance: int, scale_x: int, scale_y: int, plane: int,
                       colour: int, vertices: list, faces: list, lines: list,
                       palette: list[int] | None, hardware: list[int] | None) -> None:
    """Append source font fills or strokes in a building detail's text plane."""
    rgb = colour_value(colour, palette, hardware)
    for character_index, character in enumerate(text):
        glyph_index = ord(character) + font * 64 - 32
        pointer_address = 0x31700 + glyph_index * 2
        if glyph_index < 0 or pointer_address + 2 > len(data):
            raise ValueError('vector-text glyph outside source font')
        pointer = Reader(data, pointer_address).signed()
        glyph = Reader(data, 0x31700 + pointer)
        offset = len(vertices)
        for _ in range(63):
            x = int.from_bytes(glyph.take(1), 'big', signed=True)
            if x in (-128, -127):
                filled = x == -128
                break
            y = int.from_bytes(glyph.take(1), 'big', signed=True)
            horizontal = character_index * advance + x * scale_x
            vertices.append(
                [anchor[0] + horizontal, anchor[1] + y * scale_y, anchor[2]]
                if plane == 0
                else [anchor[0], anchor[1] + y * scale_y, anchor[2] + horizontal]
            )
        else:
            raise ValueError('vector-text glyph vertex terminator missing')
        if filled:
            for _ in range(256):
                first = glyph.take(1)[0]
                if first == 0:
                    break
                refs = [first]
                for _ in range(255):
                    ref = glyph.take(1)[0]
                    if ref == 0:
                        break
                    refs.append(ref)
                else:
                    raise ValueError('filled vector-text polygon terminator missing')
                if any(ref % 4 or ref // 4 > len(vertices) - offset for ref in refs):
                    raise ValueError('invalid filled vector-text glyph reference')
                faces.append({
                    'vertices': [offset + ref // 4 - 1 for ref in refs],
                    'colour': rgb,
                    'sourceColour': colour,
                })
            else:
                raise ValueError('filled vector-text glyph terminator missing')
            continue
        for _ in range(256):
            a = glyph.take(1)[0]
            if a == 0:
                break
            b = glyph.take(1)[0]
            if any(ref == 0 or ref % 4 or ref // 4 > len(vertices) - offset for ref in (a, b)):
                raise ValueError('invalid vector-text glyph reference')
            lines.append({
                'vertices': [offset + a // 4 - 1, offset + b // 4 - 1],
                'colour': rgb,
                'sourceColour': colour,
            })
        else:
            raise ValueError('vector-text glyph line terminator missing')


def decode_building_lettering(data: bytes, reader: Reader, vertices: list,
                               faces: list, lines: list,
                               palette: list[int] | None, hardware: list[int] | None,
                               text_workspace: bytes | None) -> None:
    """Decode the $60xx building-detail record consumed by the native text renderer."""
    reader.p &= ~1
    offset, x, y, z, flags, advance = struct.unpack('>4hHh', reader.take(12))
    scale_x, scale_y = struct.unpack('>bb', reader.take(2))
    colour = reader.word()
    if not flags & 0x8000:
        raise ValueError('indirect building vector text unresolved')
    plane = flags & 0xC0
    if plane not in (0, 0x80):
        raise ValueError('building vector-text plane unresolved')
    if text_workspace is None:
        text_workspace = data
    text = expand_vector_text(data, reader, text_workspace)
    anchor = [x + offset, y, z] if plane == 0 else [x, y, z + offset]
    append_vector_text(
        data, text, flags & 0xF, anchor, advance, scale_x, scale_y, plane,
        colour, vertices, faces, lines, palette, hardware,
    )


def object_text_anchor(anchor: list[int], plane: int, horizontal: int, vertical: int) -> list[int]:
    """Place a glyph coordinate in the plane selected by bits 6/7 of the text flags.

    The native renderer patches two exchange instructions ($C945 / $C745) into
    the glyph loop: bit 6 exchanges the glyph vertical axis with Z and bit 7
    exchanges the glyph horizontal axis with Z.
    """
    if plane == 0:
        return [anchor[0] + horizontal, anchor[1] + vertical, anchor[2]]
    if plane == 0x80:
        return [anchor[0], anchor[1] + vertical, anchor[2] + horizontal]
    if plane == 0x40:
        return [anchor[0] + horizontal, anchor[1], anchor[2] + vertical]
    return [anchor[0] + vertical, anchor[1], anchor[2] + horizontal]


TELEVISION_FRAME_TABLE = 0x53432
TELEVISION_FRAMES = 6
BEACON_LIT = 0x777
BEACON_DARK = 0x8000
BEACON_GATES = {0x246: '$707E', 0x411: '$7082'}


# $053512 ($8007) and $05358A ($8002) derive one character from the object's
# runtime slot and store it at $CD12, which vector-text token $87 points at.
SLOT_LABEL_TARGET = 0xCD12
SLOT_LABEL_RULES = {0x8007: ('letter', 0x41, 0x1E), 0x8002: ('digit', 0x30, 0)}


# Three $CCA0 targets are frame animations rather than live state. Each is a
# descriptor `[character][NUL][index word][NUL-terminated frame script]`, and in
# all ten pinned captures the character equals `script[index]` while the script
# itself is byte-identical. The script is therefore the complete set of forms
# the record can ever draw, and no single frame is canonical — the same standing
# as the free-running articulation angle at $7888. Recognition is an evidenced
# list rather than a shape match, so an unnamed target keeps failing closed.
TEXT_ANIMATION_TARGETS = (0xCD9C, 0xCDCE, 0xCE6A)
TEXT_FRAME_STEPS = 8

# $04DAFC formats the explosive readout as `M.SS`: $04DAD0 takes the armed
# deadline less the clock at $793E, floors it at zero into $786A, divides by 60
# for the minute digit and indexes the two-digit second pairs at $0526C2. Every
# pinned capture reads the floor, so the disarmed reading is evidenced and the
# running countdown is not.
EXPLOSIVE_COUNTDOWN_TARGET = 0xCD14
EXPLOSIVE_COUNTDOWN_DISARMED = '0.00'


def text_animation_script(data: bytes, pointer: int) -> bytes:
    """The frame script of a `$CCA0` animation descriptor, or fail closed.

    Validates the whole descriptor against the capture it came from: the
    character field is NUL-terminated, the index addresses the script, the
    script is printable, and the displayed character is the frame the index
    names. A capture that breaks any of those is not this grammar.
    """
    if pointer + 5 > len(data):
        raise ValueError('vector-text animation descriptor is truncated')
    if data[pointer + 1] != 0:
        raise ValueError('vector-text animation character is not NUL-terminated')
    index = int.from_bytes(data[pointer + 2:pointer + 4], 'big')
    start = pointer + 4
    end = data.find(b'\0', start)
    if end < 0:
        raise ValueError('vector-text animation script terminator missing')
    script = data[start:end]
    if not script:
        raise ValueError('vector-text animation script is empty')
    if not all(32 <= character < 127 for character in script):
        raise ValueError('unsupported vector-text animation character')
    if index >= len(script):
        raise ValueError('vector-text animation index outside its script')
    if data[pointer] != script[index]:
        raise ValueError('vector-text animation character is not its indexed frame')
    return script


def text_animation_frame(script: bytes, ordinal: int) -> str:
    """The character one sampled frame ordinal draws from a frame script."""
    return chr(script[ordinal * len(script) // TEXT_FRAME_STEPS])


def slot_label(command: int, slot: int | None) -> str | None:
    """The character a slot-labelled object's header writes for one slot."""
    rule = SLOT_LABEL_RULES.get(command)
    if rule is None or slot is None:
        return None
    kind, base, bias = rule
    value = (slot & 0xF) if kind == 'digit' else (slot - bias)
    if not 0 <= value < 64:
        return None
    return chr(base + value)


def decode_object_lettering(data: bytes, reader: Reader, vertices: list, faces: list,
                            lines: list, palette: list[int] | None,
                            hardware: list[int] | None, label: str | None = None,
                            frame: int = 0) -> dict:
    """Decode the object `$6000` vector-text record consumed at `$053F96`.

    Three signed word offsets are added to the object's position; the flags,
    advance, glyph scales and colour follow, then inline text. Indirect text
    (flags bit 15 clear) replaces the record pointer and fails closed here.
    """
    reader.p &= ~1
    dx, dy, dz = struct.unpack('>3h', reader.take(6))
    return decode_placed_lettering(
        data, reader, [dx, dy, dz], vertices, faces, lines, palette, hardware,
        'object', label, frame,
    )


def decode_ground_lettering(data: bytes, reader: Reader, vertices: list, faces: list,
                            lines: list, palette: list[int] | None,
                            hardware: list[int] | None) -> dict:
    """Decode the ground `$6000` vector-text record consumed at `$053F76`.

    The consumer subtracts the camera word from each position word, so X and Z
    use the same `$8000`-relative cell-local encoding as the record's own plan
    vertices while Y is already a world height. The record is copied into the
    reconstructed stream untransformed, so the cell orientation does not apply.
    """
    reader.p &= ~1
    x, y, z = struct.unpack('>3h', reader.take(6))
    anchor = [(x & 0xFFFF) - 0x8000, y, (z & 0xFFFF) - 0x8000]
    return decode_placed_lettering(
        data, reader, anchor, vertices, faces, lines, palette, hardware, 'ground'
    )


def decode_placed_lettering(data: bytes, reader: Reader, anchor: list[int],
                            vertices: list, faces: list, lines: list,
                            palette: list[int] | None, hardware: list[int] | None,
                            kind: str, label: str | None = None,
                            frame: int = 0) -> dict:
    """Flags, advance, glyph scales, colour and inline text, shared from $053FCA.

    `frame` is the sampled ordinal a `$CCA0` frame animation draws; every
    animated record in one model shares the ordinal because one per-frame tick
    drives them all.
    """
    flags, advance = struct.unpack('>Hh', reader.take(4))
    scale_x, scale_y = struct.unpack('>bb', reader.take(2))
    colour = reader.word()
    if not flags & 0x8000:
        raise ValueError(f'indirect {kind} vector text unresolved')
    font = flags & 0xF
    if font == 4:
        raise ValueError(f'state-conditioned {kind} text font unresolved')
    plane = flags & 0xC0
    # Inline literal characters are authored. A $80..$98 token names a $CCA0
    # workspace string: a slot-derived label, a frame animation whose script is
    # model data, or live state that stays a named omission.
    characters = []
    token = None
    animation = None
    countdown = False
    for _ in range(256):
        character = reader.take(1)[0]
        if character == 0:
            break
        if character & 0x80:
            if reader.take(1)[0] != 0:
                raise ValueError('vector-text token is not terminal')
            token = character & 0x7f
            pointer = int.from_bytes(data[0xCCA0 + token * 4:0xCCA4 + token * 4], 'big')
            if label is not None and pointer == SLOT_LABEL_TARGET:
                characters.append(label)
                token = None
            elif pointer in TEXT_ANIMATION_TARGETS:
                script = text_animation_script(data, pointer)
                characters.append(text_animation_frame(script, frame))
                animation = {'target': pointer, 'frames': len(script)}
                token = None
            elif pointer == EXPLOSIVE_COUNTDOWN_TARGET:
                characters.append(EXPLOSIVE_COUNTDOWN_DISARMED)
                countdown = True
                token = None
            break
        if not 32 <= character < 127:
            raise ValueError('unsupported vector-text character')
        characters.append(chr(character))
    else:
        raise ValueError('vector-text terminator missing')
    text = ''.join(characters)
    rgb = colour_value(colour, palette, hardware)
    for character_index, character in enumerate(text):
        glyph_index = ord(character) + font * 64 - 32
        pointer_address = 0x31700 + glyph_index * 2
        if glyph_index < 0 or pointer_address + 2 > len(data):
            raise ValueError('vector-text glyph outside source font')
        pointer = Reader(data, pointer_address).signed()
        glyph = Reader(data, 0x31700 + pointer)
        offset = len(vertices)
        for _ in range(63):
            x = int.from_bytes(glyph.take(1), 'big', signed=True)
            if x in (-128, -127):
                filled = x == -128
                break
            y = int.from_bytes(glyph.take(1), 'big', signed=True)
            vertices.append(object_text_anchor(
                anchor, plane, character_index * advance + x * scale_x, y * scale_y
            ))
        else:
            raise ValueError('vector-text glyph vertex terminator missing')
        if filled:
            for _ in range(256):
                first = glyph.take(1)[0]
                if first == 0:
                    break
                refs = [first]
                for _ in range(255):
                    ref = glyph.take(1)[0]
                    if ref == 0:
                        break
                    refs.append(ref)
                else:
                    raise ValueError('filled vector-text polygon terminator missing')
                if any(ref % 4 or ref // 4 > len(vertices) - offset for ref in refs):
                    raise ValueError('invalid filled vector-text glyph reference')
                faces.append({'vertices': [offset + ref // 4 - 1 for ref in refs],
                              'colour': rgb, 'sourceColour': colour})
            else:
                raise ValueError('filled vector-text glyph terminator missing')
            continue
        for _ in range(256):
            a = glyph.take(1)[0]
            if a == 0:
                break
            b = glyph.take(1)[0]
            if any(ref == 0 or ref % 4 or ref // 4 > len(vertices) - offset for ref in (a, b)):
                raise ValueError('invalid vector-text glyph reference')
            lines.append({'vertices': [offset + a // 4 - 1, offset + b // 4 - 1],
                          'colour': rgb, 'sourceColour': colour})
        else:
            raise ValueError('vector-text glyph line terminator missing')
    return {'anchor': anchor, 'text': text, 'font': font, 'plane': plane,
            **({'liveToken': token} if token is not None else {}),
            **({'animation': animation} if animation is not None else {}),
            **({'countdown': True} if countdown else {})}


# $0537B0 (objects) and $053D4A (building details) turn an articulated record's
# tagged vertices about its pivot by the free-running angle at $7888, indexing
# the 256-entry sine table at $925A. The angle advances every frame and differs
# even between two cold boots, so no single frame is canonical; the catalogue
# samples it instead.
TRIG_TABLE = 0x925A
ARTICULATION_STEPS = 8
# The axis value names the turning plane and, with it, which coordinate the
# routine treats as the first of the pair. $053806/$053DB2 read Z before X, so
# the zero axis turns the other way round from the naive X-then-Z reading.
ARTICULATION_PLANES = {'positive': (0, 1), 'zero': (2, 0), 'negative': (1, 2)}
# $054D98 copies the record's two scale bytes into $539CE and $539D2; nothing in
# resident RAM writes the Y factor at $539D0, which stays 1. A detail is
# therefore scaled on X and Z only.
DETAIL_Y_SCALE = 1


def _word(value: int) -> int:
    return ((value + 0x8000) & 0xFFFF) - 0x8000


def articulation_plane(axis: int) -> tuple[int, int]:
    """The two coordinate indices an articulation axis turns, in source order."""
    if axis < 0:
        return ARTICULATION_PLANES['negative']
    return ARTICULATION_PLANES['zero' if axis == 0 else 'positive']


def turn_articulated(data: bytes, vertices: list, tagged: list[int],
                     articulation: dict, angle: int,
                     scale: tuple[int, int] | None = None) -> list:
    """Apply one sampled articulation angle, in the native fixed point.

    `$053D84` multiplies each coordinate by a table word, keeps the product's
    high word and doubles it, so the result carries the game's own truncation
    rather than a cleaner float rotation.

    `scale` names the structure X/Z factors a building detail is turned in.
    `$053D52` multiplies every vertex by those factors *before* the pivot
    subtraction, and `$053B4A` scales the pivot the same way, so a nonuniform or
    mirrored structure changes the shape of the turn rather than only its size.
    The two coordinates in the turning plane are words there — `$053DAA`
    sign-extends them back to longs afterwards — so they carry the native wrap
    as well as the truncation, while the third keeps its full product.
    """
    factors = (1, 1, 1) if scale is None else (scale[0], DETAIL_Y_SCALE, scale[1])
    pivot = [_word(component * factor)
             for component, factor in zip(articulation['pivot'], factors)]
    first, second = articulation_plane(articulation['axis'])
    turning = angle % 256
    sine = cosine = 0
    if turning:
        index = turning * 2
        sine = struct.unpack_from('>h', data, TRIG_TABLE + index)[0]
        cosine = struct.unpack_from('>h', data, TRIG_TABLE + index + 0x80)[0]
    positions = set(tagged)
    result = []
    for position, point in enumerate(vertices):
        scaled = [value * factor for value, factor in zip(point, factors)]
        if position in positions:
            a = _word(_word(scaled[first]) - pivot[first])
            b = _word(_word(scaled[second]) - pivot[second])
            if turning:
                a, b = (_word((((a * cosine - b * sine) >> 16) & 0xFFFF) * 2),
                        _word((((a * sine + b * cosine) >> 16) & 0xFFFF) * 2))
            scaled[first] = _word(a + pivot[first])
            scaled[second] = _word(b + pivot[second])
        result.append(scaled)
    return result


# A record that parses cleanly to its own terminator and holds no geometry by
# construction is authored that way, not a decode failure. These three reasons
# name the whole of what such a record says; they are matched exactly, so
# rewording one retires the settlement rather than silently keeping it.
NULL_MODEL_REASON = 'null model: no geometry'
EMPTY_SURFACE_REASON = 'Empty surface record: no plan vertices or walls.'
EMPTY_DETAIL_REASON = (
    'Empty building-detail record: vertex list terminates immediately.'
)


def tag_record(kind: str, faces: list, lines: list, first_face: int,
               first_line: int, record: int) -> None:
    """Name the source record every primitive of a building detail came from."""
    if kind != 'interior':
        return
    for primitive in faces[first_face:] + lines[first_line:]:
        primitive['sourceIndex'] = record


def decode_mesh(data: bytes, start: int, kind: str, palette: list[int] | None = None,
                hardware: list[int] | None = None,
                text_workspace: bytes | None = None,
                state: dict | None = None) -> dict:
    """Decode one object or building-detail record.

    `state` selects among source-conditioned forms of the same record:
    `flash` (`lit`/`dark`) for `$8003` beacon patches, `frame` (0..5) for the
    `$8006` television colour cycle, `open` for the `$8009` jump taken when
    `$7A60` is set, `viewGroup` for a view-conditioned face group index, and
    `textFrame` for the sampled ordinal of a `$CCA0` vector-text frame
    animation. The returned mesh names the alternates in `alternates` so callers can
    enumerate every form without guessing.
    """
    state = state or {}
    label_command = None
    reader = Reader(data, start)
    patches: dict[int, int] = {}
    display_code = None
    label_anchor = None
    alternates: dict = {}
    articulation = None
    texts: list[dict] = []
    if kind == 'object':
        visited = set()
        for _ in range(32):
            if reader.p in visited:
                raise ValueError('cyclic model header')
            visited.add(reader.p)
            command = reader.word()
            if not 0x8000 <= command <= 0x800f:
                reader.p -= 2
                break
            if command == 0x8000:
                raise ValueError(NULL_MODEL_REASON)
            if command == 0x8001:
                axis, mode = reader.take(2)
                if mode & 0x80:
                    # $053572: pivot X word, then Y/Z words; negative-Y vertices
                    # rotate about it by the global angle at $7888.
                    pivot = [reader.signed(), reader.signed(), reader.signed()]
                    # $0537B8 tests the axis as a byte; $053D5E tests the
                    # detail's as a word. Both are kept signed here.
                    articulation = {'axis': axis - 0x100 if axis & 0x80 else axis,
                                    'pivot': pivot, 'angle': '$7888'}
                break  # orientation is an instance property, not baked into the model
            if command == 0x8004:
                raise ValueError(
                    'procedural: $8004 draws the $350E0 point field at $04CFA4; no authored polygon geometry'
                )
            if command == 0x8003:
                # $0534B0: one unconditional byte-pair patch, then offsets that
                # receive $777 while lit or $8000 while dark. $246/$411 records
                # also consult $707E/$7082 before flashing with $7AE8.
                hi, lo = reader.take(2)
                offset = reader.signed()
                patches[reader.p + offset] = hi
                patches[reader.p + offset + 1] = lo
                gate = BEACON_GATES.get((hi << 8) | lo)
                colour = BEACON_DARK if state.get('flash') == 'dark' else BEACON_LIT
                offsets = []
                for _ in range(64):
                    offset = reader.signed()
                    if offset == 0:
                        break
                    patches[reader.p + offset] = colour >> 8
                    patches[reader.p + offset + 1] = colour & 0xFF
                    offsets.append(offset)
                else:
                    raise ValueError('beacon patch list terminator missing')
                alternates['flash'] = {'offsets': len(offsets), 'gate': gate}
                offset = reader.signed()
                reader.p += offset - 2
                break
            if command == 0x8006:
                # $053440 cycles a six-entry colour table at $53432 while bit 0 of $7875 is set.
                frame = state.get('frame', 0)
                if not 0 <= frame < TELEVISION_FRAMES:
                    raise ValueError('television frame outside the colour cycle')
                offset = reader.signed()
                colour = data[TELEVISION_FRAME_TABLE + frame * 2:TELEVISION_FRAME_TABLE + frame * 2 + 2]
                patches[reader.p + offset - 2] = colour[0]
                patches[reader.p + offset - 1] = colour[1]
                alternates['frame'] = TELEVISION_FRAMES
                break
            if command == 0x8009:
                # $05355A jumps by the following word when $7A60 is nonzero.
                offset = reader.signed()
                if state.get('open'):
                    reader.p += offset - 2
                alternates['open'] = '$7A60'
                break
            if command in (0x8002, 0x8007):
                # A slot-derived label, not a name substitution: the character
                # reaches the geometry through vector-text token $87.
                label_command = command
                alternates['slotLabel'] = SLOT_LABEL_RULES[command][0]
                break
            if command == 0x800b:
                break  # far-distance marker, no local vertex change
            if command == 0x800c:
                reader.word()  # visibility distance only
                break
            if command == 0x8008:
                display_code = reader.take(2).decode('ascii')
                offset = reader.signed()
                reader.p += offset - 2
                break
            if command == 0x800a:
                replacement = reader.take(2)
                offset = reader.signed()
                patches[reader.p + offset] = replacement[0]
                patches[reader.p + offset + 1] = replacement[1]
                offset = reader.signed()
                reader.p += offset - 2
                break
            if command in (0x800d, 0x800e):
                offset = reader.signed()
                reader.p += offset - 2
                break
            raise ValueError(f'model command ${command:04x} unresolved')
        else:
            raise ValueError('model header limit exceeded')
    geometry_start = reader.p
    vertices: list = []
    tagged: list[int] = []
    for _ in range(256):
        x = reader.signed()
        if x == -32768:
            break
        if kind == 'interior' and x == -32767:
            # $053B4A: axis word, then a pivot scaled like the detail itself.
            articulation = {
                'axis': reader.signed(),
                'pivot': [reader.signed(), reader.signed(), reader.signed()],
                'angle': '$7888',
            }
            break
        y, z = reader.signed(), reader.signed()
        # Detail records and articulated objects tag rotating vertices with a
        # negative Y. The rest pose has zero angle; the height is complemented.
        rest = kind == 'interior' or articulation is not None
        if rest and y < 0:
            tagged.append(len(vertices))
        vertices.append([x, ~y if rest and y < 0 else y, z])
    else:
        raise ValueError('vertex terminator missing')
    if not vertices:
        raise ValueError(
            EMPTY_DETAIL_REASON
            if kind == 'interior'
            else 'model has no vertices'
        )
    body_vertex_count = len(vertices)
    faces, lines = [], []
    unreferenced: list[int] = []

    def read_primitives(vertices: list, faces: list, lines: list) -> None:
        nonlocal label_anchor, record_count
        # $053BAE tabulates one entry per primitive record, whatever its kind,
        # so a detail selector names records rather than drawn polygons.
        for record in range(2048):
            first_face, first_line = len(faces), len(lines)
            address = reader.p
            raw = reader.take(2)
            colour = (patches.get(address, raw[0]) << 8) | patches.get(address + 1, raw[1])
            if colour == 0:
                record_count = record
                return
            if colour & 0x7000 == 0x7000:
                # $05394E: a target marker (or any $F000 word) ends the list.
                record_count = record
                return
            if colour == 0x6000 and display_code is not None:
                # Special records align their parameters to an even RAM address.
                reader.p &= ~1
                label_anchor = decode_key_lettering(data, reader, display_code, vertices, lines, hardware)
                continue
            if kind == 'interior' and colour & 0xFF00 == 0x6000:
                decode_building_lettering(
                    data, reader, vertices, faces, lines, palette, hardware, text_workspace
                )
                tag_record(kind, faces, lines, first_face, first_line, record)
                continue
            if kind == 'object' and colour & 0x6000 == 0x6000:
                item = decode_object_lettering(
                    data, reader, vertices, faces, lines, palette, hardware,
                    slot_label(label_command, state.get('slot')),
                    state.get('textFrame', 0),
                )
                texts.append(item)
                if 'animation' in item:
                    alternates['textFrame'] = TEXT_FRAME_STEPS
                continue
            if colour & 0x4000:
                if colour & 0x2000:
                    raise ValueError('special polygon command unresolved')
                refs = list(reader.take(2))
                line = True
                colour &= ~0x4000
            else:
                refs = []
                for _ in range(256):
                    ref = reader.take(1)[0]
                    if ref == 0:
                        break
                    refs.append(ref)
                else:
                    raise ValueError('polygon terminator missing')
                line = False
            if any(ref == 0 or ref % 4 for ref in refs):
                raise ValueError(f'misaligned vertex reference at ${address:06x}')
            if any(ref // 4 > body_vertex_count for ref in refs):
                # $053A1E gives every record 63 shared vertex slots, and
                # $053D32 only fills the ones this record's own list supplies.
                # A record naming a higher slot would draw whatever the last
                # model left there. Only a building detail can prove such a
                # record is unreachable, because only its selector lists say
                # which records the game ever tabulates; check_unreferenced
                # raises this reason if one of them names it after all.
                if kind != 'interior':
                    raise ValueError(
                        f'invalid vertex reference at ${address:06x}: slot '
                        f'{max(refs) // 4} beyond {body_vertex_count} vertices'
                    )
                unreferenced.append(record)
                tag_record(kind, faces, lines, first_face, first_line, record)
                continue
            if len(refs) < (2 if line else 3):
                raise ValueError('degenerate polygon record')
            primitive = {'vertices': [ref // 4 - 1 for ref in refs],
                         'colour': colour_value(colour, palette, hardware), 'sourceColour': colour}
            (lines if line else faces).append(primitive)
            tag_record(kind, faces, lines, first_face, first_line, record)
        raise ValueError('face terminator missing')

    record_count = 0
    view_groups = []
    chosen = state.get('viewGroup')
    if kind == 'object':
        # $0538F4: a nonzero word is a skip length past a viewer-relative box
        # (six longwords: minimum and span on X, Y, Z) and the face list drawn
        # while the viewer stands inside it. A zero word introduces the list
        # drawn from everywhere else.
        for _ in range(64):
            skip = reader.word()
            if skip == 0:
                break
            box = struct.unpack('>6i', reader.take(24))
            next_group = reader.p + skip
            group_vertices = list(vertices)
            group_faces: list = []
            group_lines: list = []
            read_primitives(group_vertices, group_faces, group_lines)
            if not 0 <= next_group - reader.p <= 1:
                raise ValueError('view-conditioned group skip does not match its face list')
            if len(view_groups) == chosen:
                vertices, faces, lines = group_vertices, group_faces, group_lines
            view_groups.append({
                'bounds': [[box[axis * 2], box[axis * 2] + box[axis * 2 + 1]] for axis in range(3)],
                'faces': len(group_faces),
                'lines': len(group_lines),
            })
            reader.p = next_group
        else:
            raise ValueError('view-conditioned group limit exceeded')
        if chosen is not None and not 0 <= chosen < len(view_groups):
            raise ValueError('view-conditioned group outside the record')
        if view_groups:
            alternates['viewGroup'] = len(view_groups)
    if articulation is not None and state.get('angle'):
        vertices = turn_articulated(
            data, vertices, tagged, articulation, state['angle']
        )
    if chosen is None:
        read_primitives(vertices, faces, lines)
    else:
        read_primitives(list(vertices), [], [])  # the default list must still parse
    if not faces and not lines and not view_groups:
        raise ValueError('model has no drawable primitives')
    if display_code is not None and label_anchor is None:
        raise ValueError('key vector-text record missing')
    return {'vertices': vertices, 'faces': faces, 'lines': lines,
            'sourceStart': start, 'sourceEnd': reader.p, 'geometryStart': geometry_start,
            **({'recordCount': record_count} if kind == 'interior' else {}),
            **({'unreferencedRecords': unreferenced} if unreferenced else {}),
            **({'displayCode': display_code, 'labelAnchor': label_anchor}
               if label_anchor is not None else {}),
            **({'alternates': alternates} if alternates else {}),
            **({'articulation': {**articulation, 'vertices': tagged}}
               if articulation is not None else {}),
            **({'viewGroups': view_groups} if view_groups else {}),
            **({'texts': texts} if texts else {})}


def view_group_name(bounds: list[list[int]]) -> str:
    def span(axis: str, low: int, high: int) -> str:
        if low <= -0x7FFFFF and high >= 0x7FFFFF:
            return f'any {axis}'
        if low <= -0x7FFFFF:
            return f'{axis} < {high}'
        if high >= 0x7FFFFF:
            return f'{axis} ≥ {low}'
        return f'{low} ≤ {axis} < {high}'
    return 'Viewer within ' + ', '.join(span(axis, *bounds[index]) for index, axis in enumerate('XYZ'))


def decode_object_forms(data: bytes, address: int, palette: list[int] | None,
                        hardware: list[int] | None, slot: int | None = None
                        ) -> tuple[list[dict], list[str], list[str]]:
    """Decode every source-conditioned form of one object record.

    Returns the variants, the conditions that select among them in the game,
    and the gaps that keep the record partial.
    """
    base = decode_mesh(data, address, 'object', palette, hardware,
                       state={'slot': slot} if slot is not None else None)
    alternates = base.get('alternates', {})
    forms = [('record', 'Recovered form', {}, base)]
    conditions: list[str] = []
    if 'flash' in alternates:
        gate = alternates['flash']['gate']
        forms[0] = ('record', 'Beacon lit ($777 patches)', {}, base)
        forms.append(('flash-dark', 'Beacon dark ($8000 patches)', {'flash': 'dark'}, None))
        conditions.append('flashTimer' + (f' gated by {gate}' if gate else ''))
    if 'frame' in alternates:
        forms[0] = ('record', 'Screen frame 0', {}, base)
        for frame in range(1, alternates['frame']):
            forms.append((f'frame-{frame}', f'Screen frame {frame}', {'frame': frame}, None))
        conditions.append('colourCycle $53432')
    if 'open' in alternates:
        forms[0] = ('record', 'Recovered form ($7A60 clear)', {}, base)
        forms.append(('open', 'Alternate form ($7A60 set)', {'open': True}, None))
        conditions.append('state $7A60')
    if 'slotLabel' in alternates:
        conditions.append(f"resident slot ({alternates['slotLabel']} label)")
    if 'textFrame' in alternates:
        scripts = ', '.join(
            f"${text['animation']['target']:04X} ({text['animation']['frames']} frames)"
            for text in base.get('texts', []) if 'animation' in text
        )
        # $8006 already named form zero for its own cycle; keep the more
        # specific name and let the text frames say what they vary.
        if forms[0][1] == 'Recovered form':
            forms[0] = ('record', 'Vector-text frame 0', {}, base)
        for ordinal in range(1, alternates['textFrame']):
            forms.append((f'text-frame-{ordinal}', f'Vector-text frame {ordinal}',
                          {'textFrame': ordinal}, None))
        conditions.append(f'vector-text frame script {scripts}')
    if 'articulation' in base and base['articulation']['vertices']:
        step = 256 // ARTICULATION_STEPS
        forms[0] = ('record', 'Articulation angle $00', {}, base)
        for index in range(1, ARTICULATION_STEPS):
            angle = index * step
            forms.append((f'angle-{angle:02x}', f'Articulation angle ${angle:02X}',
                          {'angle': angle}, None))
        conditions.append('articulation angle ($7888)')
    if 'viewGroup' in alternates:
        forms[0] = ('record', 'Viewer elsewhere (default list)', {}, base)
        for index in range(alternates['viewGroup']):
            forms.append((f'view-{index}', None, {'viewGroup': index}, None))
        conditions.append('viewerPosition')
    variants = []
    for identity, name, state, mesh in forms:
        if mesh is None:
            mesh = decode_mesh(
                data, address, 'object', palette, hardware,
                state=state if slot is None else {**state, 'slot': slot},
            )
        if name is None:
            name = view_group_name(mesh['viewGroups'][state['viewGroup']]['bounds'])
        if not mesh['faces'] and not mesh['lines']:
            continue
        variants.append({'id': identity, 'name': name, 'mesh': mesh})
    if not variants:
        raise ValueError('model has no drawable primitives')
    gaps = []
    if 'articulation' in base and not base['articulation']['vertices']:
        gaps.append(
            'Articulated header names a pivot but tags no vertex, so nothing rotates.'
        )
    for text in base.get('texts', []):
        if text.get('countdown'):
            gaps.append(
                f'Object text draws the explosive readout at ${EXPLOSIVE_COUNTDOWN_TARGET:04X} as the '
                f'disarmed {EXPLOSIVE_COUNTDOWN_DISARMED!r} every pinned capture reads. $04DAFC formats '
                'that field as M.SS from the armed deadline less the clock at $793E, so the running '
                'countdown is live mission state and is not baked into the model.'
            )
        if 'liveToken' in text:
            token = text['liveToken']
            pointer = int.from_bytes(data[0xCCA0 + token * 4:0xCCA4 + token * 4], 'big')
            gaps.append(
                f'Object text token ${token | 0x80:02X} reads the live $CCA0 workspace at '
                f'${pointer:04X}, which this record\'s header does not write; capture-specific '
                'lettering is not baked into the model.'
            )
    return variants, conditions, list(dict.fromkeys(gaps))


# $059D9A loads the record's two heights into $7B26/$7B28. The third wall
# height at $7B2A is read at $05A762 but no instruction in RAM writes it; it
# holds 48 in every pinned capture, across five structures on four bodies.
THIRD_HEIGHT_WORD = 0x7B2A


def third_wall_height(data: bytes) -> int:
    return struct.unpack_from('>h', data, THIRD_HEIGHT_WORD)[0]


def _scene_colours(words: list[int], palette: list[int] | None,
                   hardware: list[int] | None) -> list[dict]:
    """The cell background colours a surface record carries after its heights."""
    resolved = []
    for word in words:
        try:
            resolved.append({'colour': colour_value(word, palette, hardware), 'sourceColour': word})
        except ValueError:
            resolved.append({'sourceColour': word})
    return resolved


def decode_structure(data: bytes, start: int, palette: list[int] | None = None,
                     hardware: list[int] | None = None, scale: tuple[int, int] | None = None,
                     third_height: int | None = None) -> tuple[dict, list[str]]:
    reader = Reader(data, start)
    height, lower = reader.signed(), reader.signed()
    if height < 0:
        raise ValueError('structure alias must be resolved before geometry')
    # $059DA2 resolves these two through the structure's scene palette into
    # $7C82/$7C84 and installs them in the frame colour table at $059600. They
    # are the cell's background colours, not wall colours.
    scene_colours = [reader.word(), reader.word()]
    if scale is None:
        scale = struct.unpack_from('>bb', data, start - 8)
    plan = []
    for _ in range(255):
        x = reader.signed()
        if x == 0:
            break
        plan.append([x * scale[0], reader.signed() * scale[1]])
    else:
        raise ValueError('surface vertex terminator missing')
    vertices, faces, gaps = [], [], []
    for source_index in range(1024):
        a = reader.take(1)[0]
        if a == 0:
            reader.take(1)
            if reader.word() != 0:
                gaps.append('Authored surface attachments/openings are not yet decoded.')
            break
        b = reader.take(1)[0]
        colour = reader.word()
        form = (colour >> 12) & 7
        refs = [a, b]
        if form in (3, 4, 5, 6):
            refs += list(reader.take(2))
        if any(index < 1 or index > len(plan) for index in refs):
            raise ValueError('invalid surface vertex reference')
        if form in (2, 3) and third_height is None:
            gaps.append(f'Surface primitive type {form} needs additional height/shape decoding.')
            continue
        rgb = colour_value(colour & 0x8fff, palette, hardware)
        points = [plan[index - 1] for index in refs]
        if form == 7:
            a, b = points
            polygon = [[a[0], height, a[1]], [b[0], height, b[1]], [b[0], lower, b[1]], [a[0], lower, a[1]]]
        elif form in (0, 1, 2):
            y = {0: height, 1: lower, 2: third_height}[form]
            a, b = points
            polygon = [[a[0], 0, a[1]], [b[0], 0, b[1]], [b[0], y, b[1]], [a[0], y, a[1]]]
        else:
            y = {3: third_height, 4: 0, 5: lower, 6: height}[form]
            polygon = [[point[0], y, point[1]] for point in points]
        if form == 2:
            # The explicit lower-wall polygon reverses its segment endpoints.
            polygon.reverse()
        offset = len(vertices)
        vertices.extend(polygon)
        faces.append({'vertices': list(range(offset, offset + len(polygon))), 'colour': rgb, 'sourceColour': colour,
                      'sourceIndex': source_index,
                      **({'doubleSided': True} if form in (0, 1) else {})})
    else:
        raise ValueError('surface primitive terminator missing')
    if not faces:
        if any('Surface primitive type' in gap for gap in gaps):
            raise ValueError('no supported surface faces')
        gaps.append(EMPTY_SURFACE_REASON)
        return (
            {'vertices': vertices, 'faces': faces, 'lines': [],
             'sourceStart': start, 'sourceEnd': reader.p,
             'sceneColours': _scene_colours(scene_colours, palette, hardware)},
            sorted(set(gaps)),
        )
    return {'vertices': vertices, 'faces': faces, 'lines': [],
            'sourceStart': start, 'sourceEnd': reader.p,
            'sceneColours': _scene_colours(scene_colours, palette, hardware)}, sorted(set(gaps))


# Cell-local ground records at $1E000: $54E8E transform nybbles, then $8000-relative X/Z.
GROUND_ORIENT = bytes.fromhex('0006030501040207')
GROUND_HORIZON_SLOTS = {0xF0, 0xF4}
# $05493E reads a longword of four packed bytes at $1E000 + cell x 4, rotates it
# by the cell's transform and seeds slots $F0..$FC with the four bytes. Those are
# the only slots a ground record references. Each byte holds one world cell index
# per nybble, and $054A8E seeds $80000000 so the swap at $054AA4 leaves $8000 in
# the low word, making every point a cell centre.
SCENE_SEED_TABLE = 0x1E000
SCENE_SEED_SLOTS = (0xFC, 0xF8, 0xF4, 0xF0)
CELL_UNITS = 0x10000


def scene_seeds(data: bytes, cell: int, transform: int) -> dict[int, tuple[int, int]]:
    """World cell indices for the scene points one cell's record can name."""
    packed = int.from_bytes(
        data[SCENE_SEED_TABLE + cell * 4:SCENE_SEED_TABLE + cell * 4 + 4], 'big'
    )

    def swap(value: int) -> int:
        return ((value << 16) | (value >> 16)) & 0xFFFFFFFF

    def roll_low(value: int) -> int:
        return (value & 0xFFFF0000) | ((value >> 8) & 0xFF) | ((value & 0xFF) << 8)

    if not transform & 4:
        packed = swap(packed)
    if transform & 2:
        packed = roll_low(packed)
    if transform & 1:
        packed = swap(roll_low(swap(packed)))
    points = {}
    for slot in SCENE_SEED_SLOTS:
        byte = (packed >> 24) & 0xFF
        if byte:
            points[slot] = (byte & 0xF, byte >> 4)
        packed = ((packed << 8) | (packed >> 24)) & 0xFFFFFFFF
    return points


def scene_point_offsets(data: bytes, cell: int, transform: int) -> dict[int, list[int]]:
    """Scene points expressed in one cell's local frame, in raw grid units."""
    return {
        slot: [(x - (cell & 15)) * CELL_UNITS, 0, (z - (cell >> 4)) * CELL_UNITS]
        for slot, (x, z) in scene_seeds(data, cell, transform).items()
    }
EMPTY_GROUND_REASON = (
    'Empty ground record: source plan and command streams terminate immediately; '
    'the native $056634 renderer returns at that zero terminator, so this record '
    'intentionally contributes no ground geometry.'
)


def uses_scene_points(mesh: dict) -> bool:
    """Whether a decoded ground mesh joins any scene point.

    Scene offsets are relative to the cell, so two cells sharing a record draw
    different geometry and cannot share one model identity.
    """
    return any('sceneSlots' in item for item in mesh['faces'] + mesh['lines'])


def _scene_tag(refs: list[int], plan: list) -> dict:
    """Name the scene slots a primitive joins, so a resolved corner stays auditable."""
    slots = [ref for ref in refs if not 0 <= ref // 4 - 1 < len(plan)]
    return {'sceneSlots': slots} if slots else {}


def decode_ground(data: bytes, start: int, orientation: int,
                  palette: list[int] | None = None,
                  hardware: list[int] | None = None,
                  cell: int | None = None,
                  scene: dict[int, list[int]] | None = None
                  ) -> tuple[dict, list[str], int, list[dict]]:
    """Decode one per-cell ground record.

    Given the cell, scene points come from the authored seed table and every
    reference resolves. `scene` overrides that for tests. Without either,
    references above the record's own plan stay unplaced and the remaining
    local shape is kept.
    """
    reader = Reader(data, start)
    first, second = reader.take(1)[0], reader.take(1)[0]
    extra, d5 = 0, orientation & 0xFF
    if second & 0x80:
        d5 = (d5 - first) & 0xFF
    else:
        extra = first
        if second:
            reader.take(second)
        first = reader.take(1)[0]
        reader.take(1)
        d5 = (d5 + extra - first) & 0xFF
    transform = GROUND_ORIENT[(d5 & 3) + (extra & 4)]
    if scene is None:
        scene = {} if cell is None else scene_point_offsets(data, cell, transform)
    plan = []
    for _ in range(256):
        x = reader.word()
        if x == 0:
            break
        z = reader.word()
        if transform & 4:
            x, z = z, x
        if transform & 1:
            x = (-x) & 0xFFFF
        if transform & 2:
            z = (-z) & 0xFFFF
        plan.append([x - 0x8000, 0, z - 0x8000])
    else:
        raise ValueError('ground vertex terminator missing')
    vertices, faces, lines, gaps, placements, texts = [], [], [], [], [], []
    for source_index in range(1024):
        colour = reader.word()
        if colour == 0:
            break
        if colour & 0x4000:
            if colour & 0x2000:
                if colour & 0x1000:
                    reader.p &= ~1
                    x, z, object_offset = struct.unpack('>HHH', reader.take(6))
                    if transform & 4:
                        x, z = z, x
                    if transform & 1:
                        x = (-x) & 0xFFFF
                    if transform & 2:
                        z = (-z) & 0xFFFF
                    if object_offset % 4:
                        raise ValueError('invalid ground object-template table offset')
                    placements.append({
                        'objectSlot': object_offset // 4,
                        'position': [x - 0x8000, 0, z - 0x8000],
                    })
                    continue
                if transform:
                    gaps.append(
                        'Ground $6000 vector text is copied into the frame stream '
                        'untransformed, and this cell has a nonzero orientation.'
                    )
                    break
                texts.append(decode_ground_lettering(
                    data, reader, vertices, faces, lines, palette, hardware
                ))
                continue
            edge_refs = list(reader.take(2))
            kept, unplaced = _ground_indices(edge_refs, plan, scene)
            if unplaced:
                gaps.append(
                    'Ground edge references scene point slot '
                    + '/'.join(f'${ref:02X}' for ref in sorted(set(unplaced)))
                    + ', which this capture does not place; the edge is omitted.'
                )
            elif len(kept) == 2:
                rgb = colour_value(colour & ~0x4000, palette, hardware)
                offset = len(vertices)
                vertices.extend(kept)
                lines.append({'vertices': [offset, offset + 1], 'colour': rgb,
                              'sourceColour': colour & ~0x4000, 'sourceIndex': source_index,
                              **_scene_tag(edge_refs, plan)})
            continue
        refs = []
        for _ in range(256):
            ref = reader.take(1)[0]
            if ref == 0:
                break
            refs.append(ref)
        else:
            raise ValueError('ground polygon terminator missing')
        kept, unplaced = _ground_indices(refs, plan, scene)
        if unplaced:
            gaps.append(
                'Ground polygon references scene point slot '
                + '/'.join(f'${ref:02X}' for ref in sorted(set(unplaced)))
                + ', which this capture does not place; the remaining local polygon is kept.'
            )
        if len(kept) >= 3:
            rgb = colour_value(colour, palette, hardware)
            offset = len(vertices)
            vertices.extend(kept)
            faces.append({'vertices': list(range(offset, offset + len(kept))), 'colour': rgb,
                          'sourceColour': colour, 'sourceIndex': source_index, 'doubleSided': True,
                          **_scene_tag(refs, plan)})
        elif refs:
            gaps.append(
                'Ground polygon had too few local vertices after omitting scene points '
                'this capture does not place.'
            )
    else:
        raise ValueError('ground primitive terminator missing')
    if not faces and not lines and not placements:
        gaps.append(EMPTY_GROUND_REASON)
    return ({'vertices': vertices, 'faces': faces, 'lines': lines, 'sourceStart': start,
             'sourceEnd': reader.p, **({'texts': texts} if texts else {})},
            sorted(set(gaps)), transform, placements)


def _ground_indices(refs: list[int], plan: list, scene: dict[int, list[int]]
                    ) -> tuple[list[list[int]], list[int]]:
    """Resolve ground references to points, naming the scene slots left over.

    A reference indexes the record's own plan or, above it, a scene point the
    workspace names. References the capture cannot place are reported so the
    caller can keep the remaining local shape and say what it dropped.
    """
    kept, unplaced = [], []
    for ref in refs:
        if ref == 0 or ref % 4:
            raise ValueError('invalid ground vertex reference')
        index = ref // 4 - 1
        if 0 <= index < len(plan):
            kept.append(list(plan[index]))
            continue
        point = scene.get(ref)
        if point is None:
            unplaced.append(ref)
            continue
        kept.append(list(point))
    return kept, unplaced


def decode_visibility_list(data: bytes, start: int, face_count: int) -> tuple[list[int], list[str]]:
    """Decode one terminated, one-based plan-face order; retain special commands as gaps."""
    reader = Reader(data, start)
    order, gaps = [], []
    for _ in range(1024):
        reference = reader.take(1)[0]
        if reference == 0:
            return order, sorted(set(gaps))
        if reference == 0xff:
            gaps.append('Region visibility special command $FF is unresolved.')
            continue
        if reference > face_count:
            raise ValueError(f'invalid visibility face reference {reference}')
        order.append(reference - 1)
    raise ValueError('region visibility list terminator missing')


def assemble_mesh(base: dict, detail: dict, scale: tuple[int, int]) -> dict:
    offset = len(base['vertices'])
    result = {**base, 'vertices': base['vertices'] + [[x * scale[0], y, z * scale[1]] for x, y, z in detail['vertices']]}
    for kind in ('faces', 'lines'):
        result[kind] = base[kind] + [{**face, 'vertices': [index + offset for index in face['vertices']]} for face in detail[kind]]
    if 'displayCode' in detail:
        result['displayCode'] = detail['displayCode']
        x, y, z = detail['labelAnchor']
        result['labelAnchor'] = [x * scale[0], y, z * scale[1]]
    return result


def turn_detail_mesh(data: bytes, mesh: dict, scale: tuple[int, int], angle: int) -> dict:
    """One articulated building detail, scaled into a structure frame and turned there.

    The result is already in the structure's frame, so `assemble_mesh` must not
    scale it a second time.
    """
    articulation = mesh['articulation']
    return {
        **mesh,
        'vertices': turn_articulated(
            data, mesh['vertices'], articulation['vertices'], articulation, angle, scale
        ),
        'articulation': {**articulation, 'scale': list(scale), 'sampledAngle': angle},
    }


def place_mesh(base: dict, placed: dict, position: list[int]) -> dict:
    """Append one addressed model at a cell-local ground-template position."""
    offset = len(base['vertices'])
    px, py, pz = position
    result = {
        **base,
        'vertices': base['vertices'] + [
            [x + px, y + py, z + pz] for x, y, z in placed['vertices']
        ],
    }
    for kind in ('faces', 'lines'):
        result[kind] = base[kind] + [
            {**primitive, 'vertices': [index + offset for index in primitive['vertices']]}
            for primitive in placed[kind]
        ]
    return result


def compose_ground_templates(mesh: dict, placements: list[dict], object_entries: list[str],
                             by_address: dict[str, dict], data: bytes,
                             palette: list[int] | None, hardware: list[int] | None
                             ) -> tuple[dict, list[str], list[str]]:
    """Resolve native $7000 ground placements through the addressed object table."""
    related, gaps = [], []
    for placement in placements:
        slot = placement['objectSlot']
        if not 0 <= slot < len(object_entries):
            gaps.append(f'Ground $7000 placement references object slot {slot} outside the resident table.')
            continue
        identity = object_entries[slot]
        if identity not in related:
            related.append(identity)
        target = by_address[identity]
        # Scene colours bind to the placing cell's palette, so the template is
        # decoded here rather than copied from the object's own default form.
        try:
            placed = decode_mesh(
                data, target['sourceAddress'], 'object', palette, hardware
            )
        except (ValueError, struct.error) as error:
            gaps.append(
                f'Ground $7000 placement references unresolved {identity}: {error}.'
            )
            continue
        mesh = place_mesh(mesh, placed, placement['position'])
    return mesh, related, gaps


# Post-plan Entrance Attachment constructors. Low byte is the live latch, so authored
# records store these with a zero low byte. Slot bytes $FC–$FF name slots as byte×4.
ENTRANCE_CONTROLS = {0x4000, 0x4100, 0x4200, 0x8000, 0x8100, 0x8200}
ATTACHMENT_SLOT_MASK = 0x3FC
PASSAGE_SLOT = 0x200


def resolve_region_reference(ref: int, wall_count: int, slots: dict,
                             attachment_faces: list) -> dict:
    """Resolve one region queue byte against the structure's drawable list.

    Plan walls occupy one-based indices. Each Entrance Attachment appends its
    own faces to the same list ($05A0D4 adds three for one leaf, $05A234 adds
    six for two) and owns a slot counted down from $3FC, which the queue names
    as byte x 4.
    """
    if ref * 4 in slots:
        return {'kind': 'attachment', 'slot': ref * 4}
    if 1 <= ref <= wall_count:
        return {'kind': 'face', 'index': ref - 1}
    for slot, first, added in attachment_faces:
        if first < ref <= first + added:
            return {'kind': 'attachmentFace', 'slot': slot, 'index': ref - first - 1}
    raise ValueError('selection reference outside geometry')


def selection_list(reader: Reader, count: int, attachment: bool = False,
                   slots: dict | None = None, attachment_faces: list | None = None) -> list:
    result = []
    for _ in range(1024):
        ref = reader.take(1)[0]
        if ref == 0:
            if reader.p & 1:
                if reader.take(1) != b'\0':
                    raise ValueError('selection list padding is not zero')
            return result
        if attachment:
            result.append(resolve_region_reference(
                ref, count, slots or {}, attachment_faces or []
            ))
        elif 1 <= ref <= count:
            result.append(ref - 1)
        else:
            raise ValueError('selection reference outside geometry')
    raise ValueError('selection list terminator missing')


KEY_LETTER_ORIGIN = 0x1E
KEY_LETTER_BIAS = 0x23
NO_KEY_LABEL = 0x20
CELL_WORKSPACE = 0xABDC


KEY_ATTACHMENT_NOTE = (
    'An $F0 entrance takes its key letter from the cell it stands in, not from this record: '
    '$054CBE turns the cell\'s $ABDC entry byte into the $7AFB base and $059FA0 forms the '
    'label as low nybble plus base plus $23. The constructor reads only bits 8, 9 and 15, '
    'so the geometry is the same whichever path runs.'
)


def cell_key_base(entry: int) -> int:
    """The `$7AFB` door-key base a cell's `$ABDC` entry byte installs.

    `$054CBE` masks the entry's first byte with `$FE` and keeps it in `$7AF8`.
    Values from 2 to `$1E` become `(value >> 1) + $1D` in the word at `$7AFA`,
    whose low byte is `$7AFB`; every other value clears the word. The three
    branches that clear it are the empty cell, the `$1E000` ground template
    lookup and the `$CD74` text pointer table, none of which reach `$7AFA`.
    """
    entry &= 0xFE
    if 0 < entry <= 0x1E:
        return (entry >> 1) + 0x1D
    return 0


def attachment_key_label(base: int, command: int) -> int:
    """The label byte `$059FC4` writes for an attachment's control word.

    `$059FAE` reaches the constructors with `$20`, a space, whenever the low
    byte is zero or the cell installed no key base. Otherwise `$059FA0` forms
    `(low nybble + base) + $23`, which is `A` at base `$1E`, and the shared
    `$CD35` label table takes it. The `$DF` alternative at `$059F96` needs a
    resident visual-change record at `$6364` naming this cell and slot, and no
    capture holds one.
    """
    if base == 0 or command & 0xFF == 0:
        return NO_KEY_LABEL
    return (command & 0x0F) + base + KEY_LETTER_BIAS


def authored_entrance_control(command: int) -> int | None:
    """Return the constructor word for an authored Entrance Attachment control.

    `$59EA2` takes a zero low byte straight to the constructors. A `$F0` low
    byte reaches the same constructors through `$59F50`, either directly when
    the cell installed no key base or after `$59FAA` clears the low byte. The
    constructor reads only bits 8, 9 and 15, so the key path never changes the
    geometry. Other low bytes are a different post-plan family.
    """
    high = command & 0xFF00
    low = command & 0xFF
    if high in ENTRANCE_CONTROLS and low in (0, 0xF0):
        return high
    return None


def scale_endpoint(value: int, factor: int) -> int:
    if value == -32768:
        return -32768 if factor > 0 else 32767
    if value == 32767:
        return 32767 if factor > 0 else -32768
    return value * factor


def entrance_constructor(control: int) -> dict:
    control = authored_entrance_control(control)
    if control is None:
        raise ValueError('unknown structure attachment form')
    constructor = {
        'leafCount': 2 if control & 0x200 else 1,
        'motionAxis': 'z' if control & 0x8000 else 'x',
    }
    if constructor['leafCount'] == 1:
        constructor['movingSide'] = 'low' if control & 0x100 else 'high'
    return constructor


def closed_attachment_mesh(x0: int, z0: int, x1: int, z1: int, colours: list[int],
                           height: int, constructor: dict, palette: list[int],
                           hardware: list[int]) -> dict:
    if constructor['leafCount'] == 2:
        if constructor['motionAxis'] == 'x':
            mid = (x0 + x1) // 2
            segments = [((x0, z0), (mid, z0)), ((mid, z0), (mid, z1)), ((mid, z1), (x0, z1)),
                        ((mid, z0), (x1, z0)), ((mid, z0), (mid, z1)), ((x1, z1), (mid, z1))]
        else:
            mid = (z0 + z1) // 2
            segments = [((x0, z0), (x0, mid)), ((x0, mid), (x1, mid)), ((x1, mid), (x1, z0)),
                        ((x0, mid), (x0, z1)), ((x0, mid), (x1, mid)), ((x1, z1), (x1, mid))]
        used = colours * 2
    else:
        if constructor['motionAxis'] == 'x':
            edge = x0 if constructor['movingSide'] == 'low' else x1
            segments = [((x0, z0), (x1, z0)), ((edge, z0), (edge, z1)), ((x1, z1), (x0, z1))]
        else:
            edge = z0 if constructor['movingSide'] == 'low' else z1
            segments = [((x0, z0), (x0, z1)), ((x0, edge), (x1, edge)), ((x1, z1), (x1, z0))]
        used = colours
    attachment = {'vertices': [], 'lines': [], 'faces': []}
    for (a, b), colour in zip(segments, used):
        offset = len(attachment['vertices'])
        attachment['vertices'].extend(
            [[a[0], 0, a[1]], [b[0], 0, b[1]], [b[0], height, b[1]], [a[0], height, a[1]]]
        )
        attachment['faces'].append({
            'vertices': list(range(offset, offset + 4)),
            'colour': colour_value(colour & 0x8fff, palette, hardware),
            'sourceColour': colour,
            'doubleSided': True,
        })
    return attachment


def attachment_leaf_height(mesh: dict, x: list[int], z: list[int], band: int) -> int:
    """Height of the opening a closed attachment fills.

    Both attachment constructors write only the X and Z vertex arrays, leaving the Y words
    of the plan's own doorway vertices in place, so leaves rise to the soffit above their
    closed rectangle. Openings without an authored soffit fall back to the lower wall band.
    """
    soffits = []
    for face in mesh['faces']:
        points = [mesh['vertices'][index] for index in face['vertices']]
        levels = {point[1] for point in points}
        if len(levels) != 1:
            continue
        level = levels.pop()
        if level <= 0:
            continue
        if (min(point[0] for point in points) <= x[0] and max(point[0] for point in points) >= x[1]
                and min(point[2] for point in points) <= z[0]
                and max(point[2] for point in points) >= z[1]):
            soffits.append(level)
    return min(soffits, default=band)


def skip_other_post_plan(reader: Reader) -> None:
    """Skip a non-entrance post-plan record whose control low byte is 1–15."""
    reader.take(2)
    reader.word()
    reader.word()
    reader.word()
    reader.word()
    reader.take(4)
    for _ in range(1024):
        if reader.take(1) == b'\0':
            if reader.p & 1:
                reader.take(1)
            return
    raise ValueError('other post-plan record terminator missing')


def check_unreferenced(mesh: dict, groups: list) -> None:
    """Reject a record that names a shared vertex slot its own list never fills.

    Such a record can only be kept as a selector ordinal, never drawn, so a
    visibility list that names one would put undefined geometry on screen.
    """
    unreferenced = set(mesh.get('unreferencedRecords') or ())
    if not unreferenced:
        return
    named = set()
    for group in groups:
        named.update(group['default'])
        for box in group['boxes']:
            named.update(box['records'])
    overlap = sorted(unreferenced & named)
    if overlap:
        raise ValueError(
            f'record {overlap[0]} names a vertex slot beyond this list and a '
            'visibility group selects it'
        )


def decode_detail_selection(data: bytes, start: int, count: int) -> list:
    # Record streams are byte-sized; the bound-group reader starts on the next word.
    reader = Reader(data, (start + 1) & ~1)
    groups = []
    for _ in range(2):
        boxes = []
        for _ in range(256):
            tag = reader.word()
            if tag == 0:
                break
            if tag != 0xffff:
                raise ValueError('unknown detail selection form')
            bounds = [[reader.signed(), reader.signed()] for _ in range(3)]
            if any(lo >= hi for lo, hi in bounds):
                raise ValueError('invalid detail selection bounds')
            boxes.append({'bounds': bounds, 'records': selection_list(reader, count)})
        else:
            raise ValueError('detail group terminator missing')
        groups.append({'boxes': boxes, 'default': selection_list(reader, count)})
    return groups


def selection_note(model: dict) -> str:
    """How a building detail's two view-conditioned visibility groups stand."""
    if 'detailSelection' not in model:
        return 'View-conditioned visibility is not simulated: the group lists did not decode.'
    return (
        'Both view-conditioned visibility groups are recovered, and every authored box list and '
        'group default is offered as its own inspection form because a free-orbit view has no '
        'player position to select one with.'
    )


def decode_structure_selection(data: bytes, mesh: dict, scale: tuple[int, int],
                               palette: list[int], hardware: list[int]) -> dict:
    if 0 in scale:
        raise ValueError('zero structure selection scale')
    reader = Reader(data, mesh['sourceEnd'] - 2)
    attachments = []
    slot = ATTACHMENT_SLOT_MASK
    band = Reader(data, mesh['sourceStart'] + 2).signed()
    for _ in range(64):
        command = reader.word()
        if command == 0:
            break
        low = command & 0xFF
        if authored_entrance_control(command) is not None:
            constructor = entrance_constructor(command)
            x0, z0, x1, z1 = [reader.signed() for _ in range(4)]
            # $05A08A stores three leaf colours. The two-leaf path at $05A202
            # reads a fourth word for its own record slot; the one-leaf path
            # does not, so those records are 24 bytes rather than 26.
            colours = [reader.word() for _ in range(3)]
            if constructor['leafCount'] == 2:
                colours.append(reader.word())
            box = [reader.signed() for _ in range(4)]
            if x0 >= x1 or z0 >= z1:
                raise ValueError('unknown closed attachment geometry')
            sx, sz = scale
            scaled_x = sorted((scale_endpoint(x0, sx), scale_endpoint(x1, sx)))
            scaled_z = sorted((scale_endpoint(z0, sz), scale_endpoint(z1, sz)))
            proximity_x = sorted((scale_endpoint(box[0], sx), scale_endpoint(box[1], sx)))
            proximity_z = sorted((scale_endpoint(box[2], sz), scale_endpoint(box[3], sz)))
            if proximity_x[0] >= proximity_x[1] or proximity_z[0] >= proximity_z[1]:
                raise ValueError('invalid attachment proximity box')
            attachments.append({
                'controlWord': command,
                'constructor': constructor,
                **({'keyIndex': command & 0x0F} if command & 0xFF else {}),
                'mesh': closed_attachment_mesh(
                    scaled_x[0], scaled_z[0], scaled_x[1], scaled_z[1],
                    colours[:3],
                    attachment_leaf_height(mesh, scaled_x, scaled_z, band),
                    constructor, palette, hardware,
                ),
                'proximityBox': {'x': proximity_x, 'z': proximity_z},
                'slot': slot,
            })
            slot -= 4
            continue
        if 1 <= low < 0x10:
            skip_other_post_plan(reader)
            continue
        raise ValueError('unknown structure attachment form')
    else:
        raise ValueError('attachment list terminator missing')
    by_slot = {item['slot']: item for item in attachments}
    # Attachment faces follow the plan walls in stream order.
    attachment_faces = []
    next_face = max((face['sourceIndex'] for face in mesh['faces']), default=-1) + 1
    for item in attachments:
        added = 3 * item['constructor']['leafCount']
        attachment_faces.append((item['slot'], next_face, added))
        next_face += added
    regions = []
    sources = {face['sourceIndex'] for face in mesh['faces']}
    for _ in range(256):
        flags = reader.word()
        if flags == 0:
            break
        raw = [[reader.signed(), reader.signed()] for _ in range(2)]
        if any(lo >= hi for lo, hi in raw):
            raise ValueError('invalid raw region bounds')
        bounds = [sorted([(-32768 if factor > 0 else 32767) if lo == -32768 else lo * factor,
                          (32767 if factor > 0 else -32768) if hi == 32767 else hi * factor])
                  for (lo, hi), factor in zip(raw, scale)]
        if any(lo >= hi or lo < -32768 or hi > 32767 for lo, hi in bounds):
            raise ValueError('invalid region bounds')
        queue = selection_list(
            reader, max(sources, default=-1) + 1, True, by_slot, attachment_faces
        )
        named = flags & ATTACHMENT_SLOT_MASK
        if named == 0:
            gate, inset_axis = 'none', None
        elif named == PASSAGE_SLOT:
            gate, inset_axis = 'passage', None
        else:
            bound = by_slot.get(named)
            if bound is None:
                raise ValueError('region names unrecovered attachment slot')
            gate = 'attachmentLatch'
            inset_axis = bound['constructor']['motionAxis']
        if any(entry['kind'] in ('attachment', 'attachmentFace') and entry['slot'] not in by_slot or
               entry['kind'] == 'face' and entry['index'] not in sources for entry in queue):
            raise ValueError('region references unrecovered geometry')
        regions.append({
            'flags': flags,
            'bounds': bounds,
            'queue': queue,
            'gate': gate,
            **({} if inset_axis is None else {'insetAxis': inset_axis}),
        })
    else:
        raise ValueError('region terminator missing')
    if not regions:
        raise ValueError('no recovered regions')
    return {
        'plan': mesh,
        'attachments': attachments,
        'regions': regions,
        'scale': list(scale),
        'liveSelector': any(item['controlWord'] & 0xFF == 0xF0 for item in attachments),
    }


def translate_mesh(mesh: dict, position: tuple[int, int, int]) -> dict:
    """Place reusable geometry without changing its source-local model."""
    result = {**mesh, 'vertices': [[x + position[0], y + position[1], z + position[2]]
                                  for x, y, z in mesh['vertices']]}
    if 'labelAnchor' in mesh:
        result['labelAnchor'] = [value + position[index]
                                 for index, value in enumerate(mesh['labelAnchor'])]
    return result


def u32(data: bytes, p: int) -> int:
    return int.from_bytes(data[p:p + 4], 'big')


def s32(data: bytes, p: int) -> int:
    return int.from_bytes(data[p:p + 4], 'big', signed=True)


def palette_at(data: bytes, index: int) -> list[int]:
    p = 0xd200 + int.from_bytes(data[0xd200 + index * 2:0xd202 + index * 2], 'big')
    return list(struct.unpack_from('>64H', data, p))


def surface_resident_body(association: bytes) -> int | None:
    """Return the body selected by a resident's native surface association."""
    if len(association) < 2:
        return None
    encoded_body, region = association[:2]
    if encoded_body == 0 or encoded_body % 4 or region != 0:
        return None
    body = encoded_body // 4
    return body if body < 30 else None


def interior_resident_association(association_a: bytes, association_b: bytes) -> dict | None:
    """Decode the selectors used by the native structure-resident builder."""
    if len(association_a) != 4 or len(association_b) != 4:
        return None
    encoded_body, insertion_group, level, cell = association_b
    if encoded_body == 0 or encoded_body % 4 or insertion_group == 0:
        return None
    body = encoded_body // 4
    if body >= 30:
        return None
    return {
        'body': body,
        'structureGroupSelector': association_a[1],
        'insertionGroupSelector': insertion_group,
        'levelSelector': level,
        'cell': cell,
    }


def resident_handling(association_a: bytes) -> dict | None:
    """Decode the interaction byte the take and drop handlers test.

    Association A byte 2 ($6FAA + 4*slot) is the only per-object input to the
    take handler's takeability decision at $05421E and $054238: bit 4 set
    refuses silently, bit 5 set diverts to the refusal message helper, and bit 7
    is the live carried flag the take path sets. The low nibble is the pair of
    ranks the drop handler compares at $0545B2..$0545D0: bits 0-1 are the rank
    this slot supplies when something is dropped onto it and bits 2-3 are the
    rank it requires of whatever it is dropped onto. See
    docs/research/damocles-object-selection.md.
    """
    if len(association_a) != 4:
        return None
    byte = association_a[2]
    return {
        'byte': byte,
        'takeable': not byte & 0x30,
        'refusal': 'silent' if byte & 0x10 else ('message' if byte & 0x20 else None),
        'suppliedSupportRank': byte & 0x03,
        'requiredSupportRank': (byte >> 2) & 0x03,
        'carried': bool(byte & 0x80),
    }


def decode_surface_placements(data: bytes, start: int) -> tuple[dict[int, dict], int]:
    """Decode a $FF-terminated authored surface-cell placement stream.

    Each record is selector, cell, structure-low. A zero low byte consumes the
    three-byte skip used as padding. Otherwise structure-high, dx and dz follow
    and the low nine bits of the structure word select the surface-assembly slot,
    matching the live $ABDC consumer at $4ECCA..$4ED12.
    """
    reader = Reader(data, start)
    cells: dict[int, dict] = {}
    for _ in range(256):
        if reader.p >= len(data):
            raise ValueError('surface placement stream terminator missing')
        record = reader.p
        selector = reader.take(1)[0]
        if selector == 0xff:
            return cells, reader.p
        if reader.p + 1 >= len(data):
            raise ValueError('surface placement stream terminator missing')
        cell = reader.take(1)[0]
        low = reader.take(1)[0]
        if low == 0:
            continue
        if reader.p + 2 >= len(data):
            raise ValueError('surface placement stream terminator missing')
        high, dx, dz = reader.take(1)[0], reader.take(1)[0], reader.take(1)[0]
        word = (high << 8) | low
        slot = word & 0x1ff
        if slot == 0:
            raise ValueError(f'surface placement cell ${cell:02X} has no structure slot')
        if cell in cells:
            raise ValueError(f'duplicate surface placement cell ${cell:02X}')
        cells[cell] = {
            'address': record,
            'slot': slot,
            'dx': int.from_bytes(bytes([dx]), 'big', signed=True),
            'dz': int.from_bytes(bytes([dz]), 'big', signed=True),
            'selector': selector,
            'word': word,
        }
    raise ValueError('surface placement stream limit exceeded')


def decode_named_area(data: bytes, start: int) -> dict:
    """Decode a 20-byte area header and its zero-cell-terminated place list."""
    if start + 20 > len(data):
        raise ValueError('named area header truncated')
    header = data[start:start + 20]
    if not all(32 <= byte < 127 for byte in header):
        raise ValueError('named area header is not source text')
    name = header[:10].decode('ascii').strip() + ' ' + header[10:].decode('ascii').strip()
    cursor = start + 20
    places = []
    for _ in range(256):
        if cursor >= len(data):
            raise ValueError('named area place list terminator missing')
        cell = data[cursor]
        if cell == 0:
            return {'name': name.strip(), 'headerAddress': start, 'places': places, 'end': cursor + 1}
        if cursor + 21 > len(data):
            raise ValueError('named area place record truncated')
        label = data[cursor + 1:cursor + 21]
        if not all(32 <= byte < 127 for byte in label):
            raise ValueError('named area place label is not source text')
        places.append({
            'cell': cell,
            'name': label[:10].decode('ascii').strip() + ' ' + label[10:].decode('ascii').strip(),
            'address': cursor,
        })
        cursor += 21
    raise ValueError('named area place list limit exceeded')


def find_area_placements(data: bytes, header_address: int) -> dict[int, dict]:
    """Return the shortest valid placement stream that covers this area's places."""
    if header_address < 1 or data[header_address - 1] != 0xff:
        raise ValueError('named area is not preceded by a placement terminator')
    area = decode_named_area(data, header_address)
    needed = {place['cell'] for place in area['places']}
    terminator = header_address - 1
    best: dict[int, dict] | None = None
    best_start = -1
    for start in range(max(0, header_address - 4096), terminator):
        try:
            cells, end = decode_surface_placements(data, start)
        except ValueError:
            continue
        if end - 1 != terminator:
            continue
        if needed and not needed <= set(cells):
            continue
        if best is None or len(cells) < len(best) or (len(cells) == len(best) and start > best_start):
            best = cells
            best_start = start
    if best is None:
        raise ValueError(f'no surface placement stream covers {area["name"]}')
    return best


def decode_structure_associations(data: bytes, start: int) -> dict[int, dict[int, int]]:
    """Decode a zero-terminated list of insertion-group records."""
    reader = Reader(data, start)
    groups: dict[int, dict[int, int]] = {}
    for _ in range(256):
        if reader.p >= len(data):
            raise ValueError('structure association list terminator missing')
        selector = reader.take(1)[0]
        if selector == 0:
            return groups
        if selector in groups:
            raise ValueError(f'duplicate insertion group ${selector:02X}')
        insertions = {}
        for _ in range(256):
            if reader.p >= len(data):
                raise ValueError('structure association group terminator missing')
            region = reader.take(1)[0]
            if region == 0:
                break
            if reader.p >= len(data):
                raise ValueError(f'structure association group ${selector:02X} insertion key missing')
            insertion = reader.take(1)[0]
            if region in insertions:
                raise ValueError(f'duplicate region ${region:02X} in insertion group ${selector:02X}')
            insertions[region] = insertion
        else:
            raise ValueError('structure association group terminator missing')
        groups[selector] = insertions
    raise ValueError('structure association list limit exceeded')


def resident_local_position(data: bytes, slot: int, structure_origin: tuple[int, int, int],
                            coordinate_arrays: tuple[int, int, int] = (0x63a8, 0x67a8, 0x6ba8)) -> list[int]:
    """Transform authored resident coordinates into a structure-local frame."""
    return [s32(data, base + slot * 4) - structure_origin[axis]
            for axis, base in enumerate(coordinate_arrays)]


def structure_origin(resident_position: tuple[int, int, int], dx: int, dz: int) -> tuple[int, int, int]:
    """Resolve a cell structure's raw origin using the native offset transform."""
    return (
        (resident_position[0] & ~0xffff) | (0x8000 + dx * 30),
        0,
        (resident_position[2] & ~0xffff) | (0x8000 + dz * 30),
    )


# Schema 7 names generic Entrance Attachments. Every selector the documented
# grammar accepts is retained; records that fail closed stay partial/unresolved.


RECORD_OMISSIONS = (
    ('viewConditioned', 'view-conditioned face groups unresolved'),
    ('articulated', 'articulated model transform unresolved'),
    ('articulated', 'articulated interior unresolved'),
    # A detail no captured structure places has no evidenced scale frame to be
    # turned in, so it keeps the omission; a placed one no longer does.
    ('articulated', 'no evidenced X/Z scale frame'),
    ('specialPolygon', 'special polygon command unresolved'),
    ('paletteBinding', 'scene colour table binding unresolved'),
    ('paletteBinding', 'Scene colour table binding unverified'),
    ('liveText', 'the live $CCA0 workspace'),
    ('liveText', 'the running countdown is live mission state'),
    ('attachments', 'Authored surface attachments/openings'),
    ('attachments', 'Structure selection unavailable'),
    ('attachments', 'Live $F0 attachment selector'),
    ('omittedSelector', 'Complete selector omitted'),
    ('scenePoint', 'scene point slot'),
    ('roadTemplate', '$7000 road templates'),
    ('headerCommand', 'model command $'),
    ('thirdHeight', 'additional height/shape decoding'),
)

# The object pointer table is not wholly resident. $055026 consumes the world's
# resident-object stream: for each entry it writes the signed 16.16 X/Y/Z arrays
# at $63A8/$67A8/$6BA8 and then, at $05503C, copies one table entry onto the
# entry's own slot (`move.l (a2,d0.w),(a2,d1.w)` with a2 from $04BD10), filling
# slots downwards from $3FC. So a world binds a model to a slot; it never writes
# a record. Across the ten pinned captures slots 248-255 are the block this
# stream rewrites, and only 250-255 land on a different model. A capture that
# repointed a slot below the block, or at an address the table does not already
# hold, would be a load this census has not examined, so it raises.
WORLD_CONDITIONED_OBJECT_SLOTS = tuple(range(248, 256))


def object_slot_bindings(data: bytes, workspace: bytes, count: int = 378) -> list[dict]:
    """Report the object slots a live world capture repoints, and check the window.

    Raises when a capture repoints a slot outside the evidenced window, or points
    one at an address the resident table does not already hold: either would be a
    model the first-world census has not examined.
    """
    resident = {base: u32(data, 0x35700 + base * 4) for base in range(count)}
    known = set(resident.values())
    bindings = []
    for slot in range(count):
        live = u32(workspace, 0x35700 + slot * 4)
        if live == resident[slot]:
            continue
        if slot not in WORLD_CONDITIONED_OBJECT_SLOTS:
            raise ValueError(
                f'live workspace repoints object slot {slot}, outside the '
                f'world-conditioned window {WORLD_CONDITIONED_OBJECT_SLOTS[0]}'
                f'-{WORLD_CONDITIONED_OBJECT_SLOTS[-1]}'
            )
        if live not in known:
            raise ValueError(
                f'live workspace points object slot {slot} at ${0x35700 + live:06X}, '
                'which the resident table does not name'
            )
        bindings.append({
            'slot': slot,
            'residentModel': f'object-{0x35700 + resident[slot]:06x}',
            'liveModel': f'object-{0x35700 + live:06x}',
        })
    return bindings


# A bank is bounded above by the next resident item the capture recognises
# independently of this decode. Everything between the bank's last record byte
# and that item must be zero, which the extractor checks rather than assumes.
BANK_FOLLOWERS = {
    'object': (0x042C00, 'the live projection workspace at $042C00'),
    'structure': (0x01E000, 'the $01E000 ground workspace seed table'),
    'interior': (0x031700, 'the $031700 glyph source table'),
}

# Bytes between the last table entry and the first record, and what they are.
BANK_PREAMBLE = {
    'object': "a zero longword and the first record's 16-byte name field",
    'structure': "the first record's eight metadata bytes",
    'interior': "the first record's $8000 vertex-terminator preamble",
}


def bank_extent(data: bytes, kind: str, base: int, count: int,
                addresses: list[int], ends: list[int]) -> dict:
    """Bound one resident bank from the capture, and prove the bound."""
    table_end = base + count * 4
    first, last = min(addresses), max(addresses)
    follows_at, follows = BANK_FOLLOWERS[kind]
    if not table_end <= first:
        raise ValueError(f'{kind} table overruns its first record')
    cursor = follows_at
    while cursor > last and data[cursor - 1] == 0:
        cursor -= 1
    bank_end = max(max(ends, default=last), cursor)
    # The upper bound only holds while the bank stops short of its follower. A
    # capture whose records reached it would have outgrown this evidence.
    if bank_end >= follows_at:
        raise ValueError(f'{kind} bank runs into {follows}')
    return {
        'tableStart': base,
        'tableEnd': table_end,
        'entryCount': count,
        'preambleBytes': first - table_end,
        'firstRecord': first,
        'lastRecord': last,
        'bankEnd': bank_end,
        'zeroFillBytes': follows_at - bank_end,
        'followedBy': follows,
        'followedAt': follows_at,
    }


def bank_extent_evidence(kind: str, extent: dict) -> str:
    """Prose for one bank extent, generated from the measured bounds."""
    return (
        f"Relative-pointer table ${extent['tableStart']:06X}-"
        f"${extent['tableEnd'] - 1:06X}, {extent['entryCount']} entries. "
        f"The {extent['preambleBytes']} bytes that follow are "
        f"{BANK_PREAMBLE[kind]}, so a further entry would overlap authored record "
        f"data: the entry count is bounded above, not assumed. Records run "
        f"${extent['firstRecord']:06X}-${extent['bankEnd'] - 1:06X} "
        f"(highest table target ${extent['lastRecord']:06X}), then "
        f"{extent['zeroFillBytes']} zero bytes up to {extent['followedBy']}. "
        "The bank is bounded in this capture; it is not a census of every packed "
        "disk file."
    )


def pasti_stx_header(data: bytes) -> dict:
    """File-level Pasti header only; track payload stays packed."""
    if len(data) < 6 or data[:4] != b'RSY\x00':
        raise ValueError('not a Pasti STX image')
    version = int.from_bytes(data[4:6], 'little')
    if version != 3:
        raise ValueError('unsupported Pasti STX version')
    labels = (b'DART II', b'      NULL      ', b'V.I.P. LIMO')
    return {
        'magic': 'RSY',
        'version': version,
        'size': len(data),
        'sha256': hashlib.sha256(data).hexdigest(),
        'containsResidentLabels': any(label in data for label in labels),
    }


DISK_LOAD_EXAMINED = [
    {
        'path': 'title-screen RAM',
        'finding': (
            'Table bases at $04BD10, $04BD0C and $04BD22 are zero. The object, '
            'surface-assembly and building-detail pointer banks are not resident.'
        ),
    },
    {
        'path': 'first-world RAM pair',
        'finding': (
            'Independent cold loads observe-first-world-20260818T101013Z-c5a32b7d and '
            'observe-first-world-20260818T101117Z-010b9ad3 pin bases $035700, $00E900 and '
            '$026000. Pointer tables and extracted models are identical; only provenance differs.'
        ),
    },
    {
        'path': 'interior-window RAM',
        'finding': (
            'interior-window-ram-20260818T172346Z-e3772e4d keeps the same three pointer '
            'tables, ground workspace index and object record heads as the first-world load. '
            'Entering Capital Spaceport does not disk-load a different model bank.'
        ),
    },
    {
        'path': 'Pasti STX',
        'finding': (
            'Working-Authority image is a Pasti RSY version-3 STX '
            '(SHA-256 8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef, '
            '1031930 bytes). Printable resident labels such as DART II are absent from the '
            'STX and from title-screen RAM; they appear only after the title-to-world unpack '
            'that fills the $04BD00 base block ($04BD0C=$00E900, $04BD10=$035700, '
            '$04BD22=$026000). Track payload remains packed.'
        ),
    },
    {
        'path': 'Pasti STX track inventory',
        'finding': (
            '164 track records: cylinders 0-79 formatted on both sides, cylinders 80-81 '
            'unformatted and empty. Only two tracks carry sector descriptors. Cylinder 0 '
            'side 0 holds ten standard 512-byte sectors and an executable boot sector '
            '(checksum $1234). Cylinder 1 side 0 is the copy-protection track: 512 '
            'fuzzy-mask bytes, sector 1 unstable and failing its data CRC, and a bogus id '
            'naming cylinder 6 head 48 with no data record. The other 158 formatted tracks '
            'carry raw track images and no sector descriptors, so the game reads them with '
            'its own loader: 1017812 bytes of track image against 10240 bytes of '
            'standard-format sector data. No resident pointer table, record bank, glyph '
            'table or body-label table appears verbatim anywhere in the payload, so the '
            'payload is packed and the protected sectors are not a second, directly '
            'readable model bank. Reproduced by '
            'research/damocles-st/scripts/stx-inventory.py.'
        ),
    },
    {
        'path': 'ten-capture bank comparison',
        'finding': (
            'Two independent first-world loads and eight live memstates (Eris on foot and '
            'boarded, the Spaceport interior, Vesta, Gaea UR City and Dion) agree byte for '
            'byte on the surface-assembly table and bank, the building-detail table and '
            'bank, the ground record bank $01E790-$023FFF and the $031700 glyph table. All '
            '212 unique object records decode identically in every captured world and no '
            'world introduces a record address the first-world table does not already name. '
            'Three byte pairs inside the object bank do differ: $03E415 is the $8003 '
            'unconditional patch site the three beacons share, and $03AEED and $03B302 lie '
            'outside every decoded record stream, so none of them reaches the census.'
        ),
    },
    {
        'path': 'world resident-object stream',
        'finding': (
            'The object pointer table is not wholly resident. $055026 consumes the world\'s '
            'resident-object stream, writing the signed 16.16 X/Y/Z arrays at '
            '$63A8/$67A8/$6BA8 and then copying one table entry onto the entry\'s own slot '
            'at $05503C, filling slots downwards from $3FC. Slots 248-255 are the block the '
            'stream rewrites across the pinned captures; slots 250-255 land on a different '
            'model between Eris, Vesta and Gaea. Every copied value is another entry of the '
            'same table, so a world binds an existing model to a slot and never introduces '
            'a record. Slot 247 and below are identical in all ten captures.'
        ),
    },
    {
        'path': '$6364 mission table and the $DF branch',
        'finding': (
            'Exactly three instructions in the 1 MiB image name $6364. $04CC48 appends a '
            'six-byte record to a nine-entry table starting at $636A. $04ED4A replays it '
            'after $04EC94 has rebuilt the $ABDC cell workspace from the authored map: for '
            'each record whose first byte matches the world index $794E it writes the '
            'record\'s non-negative word into $ABDC + cell*4, replacing or clearing the '
            'surface assembly that cell places. $059F64 reads the same table on the '
            'negative-word records and substitutes character $DF for the entrance label '
            'glyph the cell-derived $7AFB base would otherwise give; its cell comparison at '
            '$059F7A is dead, because the $059F7E tst.w overwrites the flags before any '
            'branch reads them. So the table changes '
            'which already-resident structure a cell places, or one door label character; '
            'neither path introduces a record or repoints a pointer bank. The table is all '
            'zero in every one of the ten pinned captures, so no capture exercises either '
            'branch.'
        ),
    },
    {
        'path': 'script bank',
        'finding': (
            'The decoded script ISA reaches 497 ops from all 64 entry slots with nothing '
            'undecodable and no reachable inline-native escape. Its only stores are to the '
            'interpreter\'s own state ($7482 records, the $7A42 word table, $6FAA bit '
            'records, flag word $7BD8, counter $7BD2, key $7B61, PC $7820) and, through '
            '$19, to the script bank at $070000 + operand. No opcode and none of the four '
            'native routines the handlers reach can write a pointer table, a record bank or '
            '$6364. See docs/research/damocles-script-isa.md.'
        ),
    },
]

UNEXPLORED_COVERAGE = [
    'The 158 custom-format Pasti STX tracks the game reads with its own loader stay packed: the '
    'inventory establishes what is on the disk and that no resident bank is a verbatim copy of it, '
    'not what each track decodes to. Only the loaded image is catalogued, so a bank reachable by a '
    'load no pinned capture performs would not appear here. Residual documented in closed investigation: '
    'https://github.com/odogono/mercenary/issues/280.',
    'Live $ABDC workspaces other than Eris first-world, Vesta Politburo City, Gaea UR City, and Dion; '
    'Gaea islands other than authored Birmingham and live UR City, with remaining places and residences. '
    'Follow-up: https://github.com/odogono/mercenary/issues/172.',
    'The $6364 mission table is all zero in every pinned capture, so neither the $ABDC cell '
    'replacement at $04ED4A nor the $DF entrance-label substitution at $059F64 is exercised by an '
    'observed state: both are read from the code and bounded by it, not watched running. A capture '
    'that populates the table would confirm the replacement and the $DF glyph directly. Residual documented in closed investigation: '
    'https://github.com/odogono/mercenary/issues/280.',
    'The running EXPLOSIVE-ARMED! countdown: its $CD14 readout is live mission state, so only the '
    'disarmed reading every pinned capture holds is drawn. The indirect text pointer and font 4 are '
    'unreached by every record in the census, so neither is a form left to find. Residual documented in closed investigation: '
    'https://github.com/odogono/mercenary/issues/279.',
    'The scene colour binding for object slot 338 remains unverified: the $7000 ground records that '
    'place it lie above the highest record any captured $1E400 cell table selects, so no capture '
    'names the palette its cell would bind. Residual documented in closed investigation: '
    'https://github.com/odogono/mercenary/issues/277.',
]

BUILDING_VECTOR_TEXT_MODELS = {
    'interior-027592',
    'interior-02a18c',
    'interior-02cab0',
    'interior-02d656',
    'interior-02db92',
    'interior-02e910',
    'interior-02fcb6',
}


def classify_record(model: dict, is_alias: bool) -> None:
    reason = model.get('reason') or ''
    if 'null model' in reason or model.get('name') == 'NULL':
        model['recordClass'] = 'null'
    elif reason.startswith('procedural:'):
        model['recordClass'] = 'procedural'
    elif any(
        token in reason
        for token in (
            'Empty surface record',
            'Empty building-detail record',
            'Empty ground record',
            'model has no vertices',
            'model has no drawable primitives',
        )
    ):
        # An alias of an empty record is an empty record; relatedModels still
        # carries the alias link, and only 'empty' says the record holds
        # nothing by construction.
        model['recordClass'] = 'empty'
    elif is_alias:
        model['recordClass'] = 'alias'
    else:
        model['recordClass'] = 'geometry'
    tags = []
    for tag, token in RECORD_OMISSIONS:
        if token in reason and tag not in tags:
            tags.append(tag)
    model['omissions'] = tags


def settle_intentional_empties(models: list) -> None:
    """Give an authored empty the same verdict whatever bank it came from.

    An empty ground record was already decoded; the equivalent surface,
    building-detail and NULL records were unresolved or partial, which read as
    three answers to one question. A record keeps the marker only while every
    clause of its reason stays a settled statement, so anything that appends a
    real gap drops out of this pass on its own.
    """
    for model in models:
        if not model.pop('intentionalEmpty', False):
            continue
        if model['variants'] or model['omissions']:
            continue
        if model['recordClass'] not in ('empty', 'null', 'alias'):
            continue
        model['status'] = 'decoded'


def coverage_ledger(models: list, tables: list, notes: list[str], disk_load: list | None = None) -> dict:
    status = Counter(model['status'] for model in models)
    classes = Counter(model['recordClass'] for model in models)
    omissions = Counter(tag for model in models for tag in model.get('omissions') or [])
    conditions = Counter(
        condition.split(' ', 1)[0] for model in models for condition in model.get('conditions') or []
    )
    by_id = {model['id']: model for model in models}
    rows = []
    for table in tables:
        unique_ids = list(dict.fromkeys(table['entries']))
        records = [by_id[identity] for identity in unique_ids]
        row_status = Counter(model['status'] for model in records)
        row_class = Counter(model['recordClass'] for model in records)
        rows.append({
            'kind': table['kind'],
            'address': table['address'],
            'slots': table['entryCount'],
            'unique': len(unique_ids),
            'decoded': row_status['decoded'],
            'partial': row_status['partial'],
            'unresolved': row_status['unresolved'],
            'aliases': row_class['alias'],
            'empty': row_class['empty'],
            'nullRecords': row_class['null'],
            'extentEvidence': table['extentEvidence'],
        })
    return {
        'complete': False,
        'notes': notes,
        'census': {
            'unique': len(models),
            'decoded': status['decoded'],
            'partial': status['partial'],
            'unresolved': status['unresolved'],
        },
        'classifications': {
            'geometry': classes['geometry'],
            'alias': classes['alias'],
            'empty': classes['empty'],
            'null': classes['null'],
            'procedural': classes['procedural'],
            'conditionalForms': sum(1 for model in models if model.get('conditions')),
            'viewerPositionForms': conditions['viewerPosition'],
            'stateForms': conditions['state'] + conditions['flashTimer'] + conditions['colourCycle'],
            'viewConditioned': omissions['viewConditioned'],
            'articulated': omissions['articulated'],
            'specialPolygon': omissions['specialPolygon'],
            'paletteBinding': omissions['paletteBinding'],
            'liveText': omissions['liveText'],
            'scenePoint': omissions['scenePoint'],
            'attachments': omissions['attachments'],
            'omittedSelector': omissions['omittedSelector'],
            'roadTemplate': omissions['roadTemplate'],
        },
        'tables': rows,
        'unexplored': list(UNEXPLORED_COVERAGE),
        'diskLoad': list(DISK_LOAD_EXAMINED if disk_load is None else disk_load),
    }


def hatari_memstate_ram(data: bytes) -> bytes:
    """Return the 1 MiB ST RAM window from a Hatari 2.6 memory snapshot."""
    if data[:2] == b'\x1f\x8b':
        data = gzip.decompress(data)
    mark = data.find(b'DIALIS  ')
    if mark < 0:
        raise ValueError('Hatari memstate has no DIALIS body label')
    base = mark - 0x81DC
    if base < 0:
        raise ValueError('Hatari memstate DIALIS is before $81DC')
    ram = data[base:base + 1048576]
    if len(ram) != 1048576 or ram[0x81DC:0x81E4] != b'DIALIS  ':
        raise ValueError('Hatari memstate ST RAM window is truncated')
    return ram


def live_overlay_prefix(slug: str, area_name: str | None, instances: list) -> str:
    """Keep body-local IDs unless that body already has an authored surface map."""
    if not any(item['id'].startswith(f'{slug}-surface-') for item in instances):
        return slug
    area = re.sub(r'[^a-z0-9]+', '-', (area_name or 'live').lower()).strip('-')
    return f'{slug}-{area}'


def record_template_palettes(template_palettes: dict, template_models: list[str],
                             palette_index: int | None, label: str, cell: int) -> None:
    """Record which scene palette a cell binds to each $7000 template it places.

    A template object's own record carries no palette: its scene colours resolve
    through the palette the placing cell's surface record selects. Collecting the
    placements is therefore the only evidence a template's colours have.
    """
    if palette_index is None:
        return
    for identity in template_models:
        cells = template_palettes.setdefault(identity, {}).setdefault(palette_index, [])
        cells.append(f'{label} cell ${cell:02X}')


def attach_live_workspace(workspace: bytes, data: bytes, models: list, tables: list,
                          instances: list, places: list, by_address: dict, bodies: list,
                          hardware: list[int], template_palettes: dict) -> str:
    """Place live $ABDC / ground records from a non-Eris loaded world capture."""
    if len(workspace) != 1048576 or u32(workspace, 0x4bd10) != 0x35700 or u32(workspace, 0x4bd22) != 0x26000:
        raise ValueError('live workspace is not a loaded Damocles world capture')
    if workspace[0xe900:0xe900 + 280 * 4] != data[0xe900:0xe900 + 280 * 4]:
        raise ValueError('live workspace replaced the surface-assembly pointer table')
    if workspace[0x26000:0x26000 + 130 * 4] != data[0x26000:0x26000 + 130 * 4]:
        raise ValueError('live workspace replaced the building-detail pointer table')
    selector = int.from_bytes(workspace[0x7aa8:0x7aaa], 'big')
    if selector == 0 or selector % 4:
        raise ValueError('live workspace body selector is invalid')
    body = selector // 4
    if body >= 30:
        raise ValueError('live workspace body selector is out of range')
    label = workspace[0x81dc + body * 8:0x81e4 + body * 8].decode('ascii').strip() or bodies[body]['name']
    slug = label.lower()
    origin_x = (u32(workspace, 0x7a92) - u32(workspace, 0x7a2c)) / 65536
    origin_z = (u32(workspace, 0x7a9a) - u32(workspace, 0x7a34)) / 65536
    names: dict[int, tuple[str, str]] = {}
    area_name = None
    place_pointer = u32(workspace, 0x7a6c)
    if place_pointer + 20 < len(workspace):
        try:
            area = decode_named_area(workspace, place_pointer)
        except ValueError:
            area = None
        if area:
            area_name = area['name']
            for place in area['places']:
                identity = f"place-{place['address']:06x}"
                existing = next((item for item in places if item['id'] == identity), None)
                if existing is None:
                    existing = {
                        'id': identity,
                        'name': place['name'],
                        'body': f'body-{body}',
                        'instances': [],
                    }
                    places.append(existing)
                if existing['body'] != f'body-{body}':
                    continue
                names[place['cell']] = (identity, place['name'])
    if not names:
        area_name = None
    prefix = live_overlay_prefix(slug, area_name, instances)
    occupied = 0
    for cell in range(256):
        address = 0xabdc + cell * 4
        record, dx, dz = struct.unpack_from('>Hbb', workspace, address)
        slot = record & 0x1ff
        if not slot or slot >= len(tables[1]['entries']):
            continue
        occupied += 1
        model_id = tables[1]['entries'][slot]
        identity = f'{prefix}-surface-{cell:02x}'
        place = names.get(cell)
        instances.append({
            'id': identity,
            'name': place[1] if place else f"{label} surface cell {cell & 15},{cell >> 4}",
            'model': model_id,
            'sourceAddress': address,
            'association': None,
            'handling': None,
            'placement': None,
            'location': {
                'body': f'body-{body}',
                'place': place[0] if place else None,
                'position': [
                    origin_x + (cell & 15) + 0.5 + dx * 30 / 65536,
                    0,
                    origin_z + (cell >> 4) + 0.5 + dz * 30 / 65536,
                ],
                'coordinateSystem': 'ST surface grid units (body-local origin unresolved)',
                'heading': None,
            },
            'reason': (
                f"Live {label} $ABDC workspace placement at cell ${cell:02X}; "
                'not a census of every island on this body.'
            ),
        })
        if place:
            next(item for item in places if item['id'] == place[0])['instances'].append(identity)
    ground_unique = 0
    for cell in range(256):
        offset = int.from_bytes(workspace[0x1e400 + cell * 2:0x1e402 + cell * 2], 'big')
        address = 0x1e000 + offset
        structure_slot = struct.unpack_from('>H', workspace, 0xabdc + cell * 4)[0] & 0x1FF
        palette, palette_index = None, None
        if structure_slot < len(tables[1]['entries']):
            structure_model = tables[1]['entries'][structure_slot]
            if structure_model in by_address:
                palette_index = by_address[structure_model].get('paletteIndex') or 0
                palette = palette_at(data, palette_index)
        try:
            mesh, gaps, transform, _placements = decode_ground(
                workspace, address, workspace[0x83dc + cell], palette, hardware,
                cell,
            )
        except (ValueError, struct.error) as error:
            mesh, gaps, transform, _placements = (
                {'vertices': [], 'faces': [], 'lines': [], 'sourceStart': address, 'sourceEnd': address},
                [str(error)],
                0xFF,
                [],
            )
        mesh, template_models, template_gaps = compose_ground_templates(
            mesh, _placements, tables[0]['entries'], by_address, workspace, palette, hardware
        )
        record_template_palettes(
            template_palettes, template_models, palette_index, label, cell
        )
        gaps = sorted(set(gaps + template_gaps))
        shared_id = f'ground-{address:06x}-{transform:02x}'
        if uses_scene_points(mesh):
            shared_id += f'-{cell:02x}'
        span = workspace[mesh['sourceStart']:mesh['sourceEnd']]
        reuse = (
            shared_id in by_address
            and data[mesh['sourceStart']:mesh['sourceEnd']] == span
        )
        model_id = shared_id if reuse else f'{slug}-{shared_id}'
        if model_id not in by_address:
            ground_unique += 1
            model = {
                'id': model_id,
                'kind': 'ground',
                'name': f"{label} ground {cell}",
                'nameStatus': 'unknown',
                'slots': [],
                'sourceAddress': address,
                'status': 'unresolved',
                'reason': '',
                'variants': [],
                'relatedModels': template_models,
                'linkedInstances': [],
                'evidence': [{
                    'claim': (
                        f"Live {label} per-cell ground/pad/road record at $1E000; "
                        'this workspace overwrites the Eris first-world index.'
                    ),
                    'confidence': 'verified',
                    'source': (
                        'docs/research/damocles-vesta-workspace.md'
                        if slug == 'vesta'
                        else 'docs/research/damocles-gaea-ur-city-workspace.md'
                        if slug == 'gaea'
                        else 'docs/research/damocles-dion-workspace.md'
                        if slug == 'dion'
                        else 'docs/research/damocles-catalogue.md'
                    ),
                }],
            }
            if mesh['faces'] or mesh['lines']:
                model['variants'] = [{
                    'id': 'record',
                    'name': f'Recovered cell fill · transform ${transform:02x}',
                    'mesh': mesh,
                }]
                model['status'] = 'partial' if gaps else 'decoded'
                model['reason'] = ' '.join(gaps)
            else:
                model['reason'] = ' '.join(gaps) or (
                    EMPTY_GROUND_REASON
                )
                if gaps == [EMPTY_GROUND_REASON]:
                    model['status'] = 'decoded'
            by_address[model_id] = model
            models.append(model)
        model = by_address[model_id]
        if not model['variants']:
            continue
        identity = f'{prefix}-ground-{cell:02x}'
        place = names.get(cell)
        instances.append({
            'id': identity,
            'name': place[1] + ' ground' if place else f"{label} ground cell {cell & 15},{cell >> 4}",
            'model': model_id,
            'sourceAddress': 0x1E400 + cell * 2,
            'association': None,
            'handling': None,
            'placement': None,
            'location': {
                'body': f'body-{body}',
                'place': place[0] if place else None,
                'position': [origin_x + (cell & 15) + 0.5, 0, origin_z + (cell >> 4) + 0.5],
                'coordinateSystem': 'ST surface grid units (body-local origin unresolved)',
                'heading': None,
            },
            'reason': (
                f"Live {label} cell ground/pad/road record; intentional empty records have no drawable instance."
            ),
        })
        model['linkedInstances'].append(identity)
        if place:
            next(item for item in places if item['id'] == place[0])['instances'].append(identity)
    ground_table = next(table for table in tables if table['kind'] == 'ground')
    extras = [
        model['id']
        for model in models
        if model['id'].startswith(f'{slug}-ground-') and model['id'] not in ground_table['entries']
    ]
    for identity in extras:
        ground_table['entries'].append(identity)
        by_address[identity]['slots'] = [len(ground_table['entries']) - 1]
    ground_table['entryCount'] = len(ground_table['entries'])
    ground_table['extentEvidence'] += (
        f' Entries after index 255 are live {label} workspace-local ground records, '
        'not first-world $1E400 slots.'
    )
    return (
        f"{label} live $ABDC" + (f" ({area_name})" if area_name else "") +
        f": body selector $7AA8=${selector:04X}, current cell "
        f"$7B5C=${int.from_bytes(workspace[0x7b5c:0x7b5e], 'big'):02X}; {occupied} surface assemblies "
        f'and {ground_unique} workspace-local ground records. Structure and building-detail pointer '
        'tables match first-world; object unique addresses are unchanged.'
    )


def extract(data: bytes, source: dict, workspace: bytes | list[bytes] | None = None) -> dict:
    """Catalogue all entries of the bounded resident tables, never a byte scan."""
    if len(data) != 1048576 or u32(data, 0x4bd10) != 0x35700 or u32(data, 0x4bd22) != 0x26000:
        raise ValueError('not a loaded pinned Damocles world capture')
    workspaces = workspace if isinstance(workspace, list) else ([] if workspace is None else [workspace])
    models, tables, instances = [], [], []
    hardware = list(struct.unpack_from('>16H', data, 0x6fd00))
    # Table extents established by their next independently decoded data records.
    specs = [('object', 0x35700, 378), ('structure', 0xe900, 280), ('interior', 0x26000, 130)]
    by_address = {}
    structure_bindings = {}
    structure_aliases = []
    # Object records whose faces name the scene colour table, and the palettes
    # the cells that place them as $7000 templates bind.
    scene_colour_objects: dict[str, list[str]] = {}
    template_palettes: dict[str, dict[int, list[str]]] = {}
    for kind, base, count in specs:
        entries = []
        for slot in range(count):
            address = base + u32(data, base + slot * 4)
            identity = f'{kind}-{address:06x}'
            entries.append(identity)
            if identity in by_address:
                by_address[identity]['slots'].append(slot)
                continue
            label = data[address - 16:address]
            name = label.decode('ascii').strip() if kind == 'object' and len(label) == 16 and all(32 <= c < 127 for c in label) else f"{'Building detail' if kind == 'interior' else kind.title()} {slot}"
            model = {'id': identity, 'kind': kind, 'name': name, 'nameStatus': 'verified' if kind == 'object' and name != f'Object {slot}' else 'unknown',
                     'slots': [slot], 'sourceAddress': address, 'status': 'unresolved', 'reason': '',
                     'variants': [], 'relatedModels': [], 'linkedInstances': [], 'evidence': []}
            by_address[identity] = model
            models.append(model)
            try:
                if kind == 'structure':
                    pointer = address
                    header = Reader(data, pointer).word()
                    if header & 0x8000:
                        target = data[pointer + 6]
                        if target >= count:
                            raise ValueError('invalid structure alias target')
                        target_address = base + u32(data, base + target * 4)
                        target_identity = f'structure-{target_address:06x}'
                        pointer = target_address
                        model['relatedModels'].append(target_identity)
                        structure_aliases.append((identity, target_identity))
                        scale = struct.unpack_from('>bb', data, address + 2)
                        palette_index = data[address + 4] or data[address + 18]
                        interior = data[address + 5]
                    else:
                        scale = struct.unpack_from('>bb', data, address - 8)
                        palette_index, interior = data[address - 6:address - 4]
                    model['interiorSlot'] = interior
                    model['paletteIndex'] = palette_index
                    structure_bindings[identity] = (interior, palette_index, scale)
                    # Bind the live third-height workspace only to the reviewed
                    # occupied spaceport record; other records remain unresolved.
                    mesh, gaps = decode_structure(
                        data, pointer, palette_at(data, palette_index), hardware, scale,
                        third_wall_height(data),
                    )
                    # The frame's background is a raster fill, so these belong to
                    # the record rather than to any mesh.
                    model['sceneColours'] = mesh.pop('sceneColours')
                    try:
                        selection = decode_structure_selection(data, mesh, scale, palette_at(data, palette_index), hardware)
                        model['structureSelection'] = selection
                        gaps = [
                            gap for gap in gaps
                            if gap != 'Authored surface attachments/openings are not yet decoded.'
                        ]
                    except (ValueError, struct.error) as error:
                        gaps.append(f'Structure selection unavailable: {error}.')
                    if mesh['faces']:
                        model['variants'] = [{'id': 'record', 'name': f'Recovered form · palette {palette_index}', 'mesh': mesh}]
                        model['status'] = 'partial' if gaps else 'decoded'
                        model['reason'] = ' '.join(gaps)
                    else:
                        model['reason'] = ' '.join(gaps)
                        if gaps == [EMPTY_SURFACE_REASON]:
                            model['intentionalEmpty'] = True
                    if model.get('structureSelection', {}).get('liveSelector'):
                        model['reason'] = (model['reason'] + ' ' + KEY_ATTACHMENT_NOTE).strip()
                    model['interiorSlot'] = interior
                    continue
                if kind == 'object':
                    try:
                        variants, conditions, gaps = decode_object_forms(data, address, None, hardware)
                    except ValueError as error:
                        if 'scene colour table binding' not in str(error):
                            raise
                        variants, conditions, gaps = decode_object_forms(data, address, palette_at(data, 0), hardware)
                        # A record with no own palette is a $7000 template. The
                        # placing cells are collected below; until then it keeps
                        # the unverified palette 0 form.
                        scene_colour_objects[identity] = list(gaps)
                        gaps.append('Scene colour table binding unverified; palette 0 is shown.')
                        for variant in variants:
                            variant['name'] += ' · palette 0 (binding unverified)'
                    if identity == 'object-036176':
                        variants[0]['inspectionAngle'] = [0.65, 0.3]
                    mesh = variants[0]['mesh']
                    model['variants'] = variants
                    model['conditions'] = conditions
                    model['status'] = 'partial' if gaps else 'decoded'
                    model['reason'] = ' '.join(gaps)
                    if 'displayCode' in mesh:
                        model['evidence'] = [{
                            'claim': f"Source $8008 header selects shared key geometry and display code {mesh['displayCode']} at local anchor {mesh['labelAnchor']}.",
                            'confidence': 'verified',
                            'source': 'docs/research/damocles-spaceport-interior.md',
                        }]
                    continue
                mesh = decode_mesh(data, address, kind, palette_at(data, 0), hardware)
                if kind == 'interior':
                    try:
                        groups = decode_detail_selection(
                            data, mesh['sourceEnd'], mesh['recordCount']
                        )
                        check_unreferenced(mesh, groups)
                        model['detailSelection'] = groups
                    except (ValueError, struct.error) as error:
                        model['selectionReason'] = str(error)
                model['variants'] = [{
                    'id': 'record',
                    'name': 'Palette 0 (binding unverified)',
                    'mesh': mesh,
                }]
                model['status'] = 'partial'
                model['reason'] = 'Building-detail shape decoded; place-specific palette and visibility groups are not bound.'
                if 'articulation' in mesh:
                    model['reason'] += (
                        ' Articulated part shown in model-local coordinates at its rest'
                        ' angle: no captured structure record binds this detail, so'
                        ' $053D74 has no evidenced X/Z scale frame to turn it in.'
                    )
            except (ValueError, struct.error) as error:
                model['reason'] = str(error)
                if model['reason'] in (EMPTY_DETAIL_REASON, NULL_MODEL_REASON):
                    model['intentionalEmpty'] = True
                if str(error).startswith('procedural:'):
                    model['status'] = 'decoded'
        bank_models = [by_address[identity] for identity in dict.fromkeys(entries)]
        extent = bank_extent(
            data, kind, base, count,
            [model['sourceAddress'] for model in bank_models],
            [variant['mesh']['sourceEnd'] for model in bank_models
             for variant in model['variants'] if 'sourceEnd' in variant.get('mesh', {})],
        )
        tables.append({'kind': kind, 'address': base, 'entryCount': count, 'entries': entries,
                       'extent': extent,
                       'extentEvidence': bank_extent_evidence(kind, extent)})
    for alias, target in structure_aliases:
        by_address[target]['relatedModels'].append(alias)
    ground_entries = []
    ground_cells: list[tuple[int, str]] = []
    for cell in range(256):
        offset = int.from_bytes(data[0x1e400 + cell * 2:0x1e402 + cell * 2], 'big')
        address = 0x1e000 + offset
        structure_slot = struct.unpack_from('>H', data, 0xabdc + cell * 4)[0] & 0x1FF
        palette, palette_index = None, None
        if structure_slot < len(tables[1]['entries']):
            palette_index = by_address[tables[1]['entries'][structure_slot]].get('paletteIndex') or 0
            palette = palette_at(data, palette_index)
        try:
            mesh, gaps, transform, _placements = decode_ground(
                data, address, data[0x83dc + cell], palette, hardware,
                cell,
            )
        except (ValueError, struct.error) as error:
            mesh, gaps, transform, _placements = (
                {'vertices': [], 'faces': [], 'lines': [], 'sourceStart': address, 'sourceEnd': address},
                [str(error)],
                0xFF,
                [],
            )
        mesh, template_models, template_gaps = compose_ground_templates(
            mesh, _placements, tables[0]['entries'], by_address, data, palette, hardware
        )
        record_template_palettes(
            template_palettes, template_models, palette_index, 'first-world', cell
        )
        gaps = sorted(set(gaps + template_gaps))
        identity = f'ground-{address:06x}-{transform:02x}'
        if uses_scene_points(mesh):
            identity += f'-{cell:02x}'
        ground_entries.append(identity)
        ground_cells.append((cell, identity))
        if identity in by_address:
            by_address[identity]['slots'].append(cell)
            continue
        scene_joined = uses_scene_points(mesh)
        model = {
            'id': identity,
            'kind': 'ground',
            'name': f'Ground {cell}',
            'nameStatus': 'unknown',
            'slots': [cell],
            'sourceAddress': address,
            'status': 'unresolved',
            'reason': '',
            'variants': [],
            'relatedModels': template_models,
            'linkedInstances': [],
            'evidence': [{
                'claim': (
                    'Per-cell ground/pad/road record at $1E000, selected by the $1E400 word '
                    'table and $83DC orientation byte ($054E40).'
                ),
                'confidence': 'verified',
                'source': 'docs/research/damocles-eris-ground.md',
            }],
        }
        if scene_joined:
            model['evidence'].append({
                'claim': (
                    f'Scene joins come from the authored seed longword at $1E000+${cell * 4:X} '
                    '($05493E), so cells sharing this source record draw different geometry '
                    'and each keeps its own identity.'
                ),
                'confidence': 'verified',
                'source': 'docs/research/damocles-eris-ground.md',
            })
        by_address[identity] = model
        models.append(model)
        if mesh['faces'] or mesh['lines']:
            model['variants'] = [{
                'id': 'record',
                'name': f'Recovered cell fill · transform ${transform:02x}',
                'mesh': mesh,
            }]
            model['status'] = 'partial' if gaps else 'decoded'
            model['reason'] = ' '.join(gaps)
        else:
            model['reason'] = ' '.join(gaps) or EMPTY_GROUND_REASON
            if gaps == [EMPTY_GROUND_REASON]:
                model['status'] = 'decoded'
    tables.append({
        'kind': 'ground',
        'address': 0x1E400,
        'entryCount': 256,
        'entries': ground_entries,
        'extentEvidence': (
            '256-cell word table at $01E400; each word is an offset from $01E000. '
            'Records are shared across cells. This is the first-world workspace, not a body census.'
        ),
    })
    bodies = [{'id': f'body-{i}', 'name': data[0x81dc + i * 8:0x81e4 + i * 8].decode('ascii').strip()} for i in range(31)]
    # The first 256 object slots have resident state arrays; extra model slots are templates.
    for slot in range(1, 256):
        model_id = tables[0]['entries'][slot]
        if by_address[model_id]['name'] == 'NULL':
            continue
        reason = ('Region 1 of Capital Spaceport inserts this resident object into its render queue; '
                  'the exact interior coordinate transform remains unresolved.' if slot == 183 else
                  'Resident object slot; body/residence and coordinate interpretation remain unresolved.')
        instances.append({'id': f'object-slot-{slot}', 'model': model_id, 'name': f"{by_address[model_id]['name']} · slot {slot}",
                          'association': None,
                          'handling': resident_handling(data[0x6fa8 + slot * 4:0x6fac + slot * 4]),
                          'location': None, 'placement': None, 'reason': reason,
                          'sourceAddress': 0x63a8 + slot * 4})
    instance_by_id = {instance['id']: instance for instance in instances}
    for slot in range(1, 256):
        instance = instance_by_id.get(f'object-slot-{slot}')
        if instance is None:
            continue
        selectors = interior_resident_association(
            data[0x6fa8 + slot * 4:0x6fac + slot * 4],
            data[0x73a8 + slot * 4:0x73ac + slot * 4],
        )
        if selectors is None:
            continue
        body = selectors.pop('body')
        instance['association'] = {
            'body': f'body-{body}',
            **selectors,
            'insertions': [],
        }
        body_name = bodies[body]['name']
        instance['reason'] = (
            f'Interior-associated resident on {body_name}: structure-group selector '
            f"${selectors['structureGroupSelector']:02X}, insertion-group selector "
            f"${selectors['insertionGroupSelector']:02X}, level selector "
            f"${selectors['levelSelector']:02X}, cell ${selectors['cell']:02X}. "
            'The source structure for this body/cell workspace has not been recovered, '
            'so no parent or local placement is claimed.'
        )
    # $52C9C compares $7AA8 << 8 with the first word of Association B while
    # assembling surface residents. This proves the body-times-four encoding
    # and the zero region byte without assigning meaning to the remaining bytes.
    for slot in range(1, 256):
        instance = instance_by_id.get(f'object-slot-{slot}')
        association = data[0x73a8 + slot * 4:0x73ac + slot * 4]
        body = surface_resident_body(association)
        if instance is None or body is None:
            continue
        instance['location'] = {
            'body': f'body-{body}',
            'place': None,
            'position': [s32(data, base + slot * 4) / 65536
                         for base in (0x63a8, 0x67a8, 0x6ba8)],
            'coordinateSystem': 'ST surface grid units (body-local origin unresolved)',
            'heading': data[0x79cd + slot],
        }
        instance['reason'] = (
            f'Association B matches the native surface-resident selector for '
            f"{bodies[body]['name']}; coordinates and raw heading are recovered "
            f"from the resident arrays at source cell ${association[3]:02X}. "
            'The named place is unresolved.'
        )
    # Current first-world surface workspace: low nibble X, high nibble Z.
    # Camera world/local coordinates bind this workspace to its system grid origin.
    eris_origin_x = (u32(data, 0x7a92) - u32(data, 0x7a2c)) / 65536
    eris_origin_z = (u32(data, 0x7a9a) - u32(data, 0x7a34)) / 65536
    origin_x, origin_z = eris_origin_x, eris_origin_z
    places = []
    names = {}
    place_pointer = u32(data, 0x7a6c)
    if 0x23e00 <= place_pointer < 0x25800:
        cursor = place_pointer + 20
        for _ in range(256):
            cell = data[cursor]
            if not cell:
                break
            label = data[cursor + 1:cursor + 21]
            if not all(32 <= char < 127 for char in label):
                break
            name = label[:10].decode().strip() + ' ' + label[10:].decode().strip()
            identity = f'place-{cursor:06x}'
            names[cell] = (identity, name)
            places.append({'id': identity, 'name': name, 'body': 'body-11', 'instances': []})
            cursor += 21
    for cell in range(1, 256):
        address = 0xabdc + cell * 4
        record, dx, dz = struct.unpack_from('>Hbb', data, address)
        slot = record & 0x1ff
        if not slot or slot >= len(tables[1]['entries']):
            continue
        model_id = tables[1]['entries'][slot]
        identity = f'eris-surface-{cell:02x}'
        place = names.get(cell)
        instances.append({'id': identity, 'name': place[1] if place else f'Eris surface cell {cell & 15},{cell >> 4}',
                          'model': model_id, 'sourceAddress': address,
                          'association': None,
                          'handling': None,
                          'placement': None,
                          'location': {'body': 'body-11', 'place': place[0] if place else None,
                            'position': [origin_x + (cell & 15) + 0.5 + dx * 30 / 65536, 0, origin_z + (cell >> 4) + 0.5 + dz * 30 / 65536],
                            'coordinateSystem': 'ST surface grid units (body-local origin unresolved)', 'heading': None},
                          'reason': 'Recovered first-world surface workspace placement; not a census of the whole body.'})
        if place:
            next(p for p in places if p['id'] == place[0])['instances'].append(identity)
    gaea_coverage = None
    gaea_header = data.find(b'BIRMINGHAMISLAND    ')
    if gaea_header > 0 and data[gaea_header - 1] == 0xff:
        gaea_area = decode_named_area(data, gaea_header)
        gaea_cells = find_area_placements(data, gaea_header)
        chevy_raw = [s32(data, base + 2 * 4) for base in (0x63a8, 0x67a8, 0x6ba8)]
        gaea_origin_x = (chevy_raw[0] >> 16) - (0x17 & 15)
        gaea_origin_z = (chevy_raw[2] >> 16) - (0x17 >> 4)
        gaea_names = {}
        for place in gaea_area['places']:
            identity = f'place-{place["address"]:06x}'
            gaea_names[place['cell']] = (identity, place['name'])
            places.append({'id': identity, 'name': place['name'], 'body': 'body-8', 'instances': []})
        for cell, placement in sorted(gaea_cells.items()):
            slot = placement['slot']
            if not slot or slot >= len(tables[1]['entries']):
                continue
            model_id = tables[1]['entries'][slot]
            identity = f'gaea-surface-{cell:02x}'
            place = gaea_names.get(cell)
            dx, dz = placement['dx'], placement['dz']
            instances.append({
                'id': identity,
                'name': place[1] if place else f'Gaea surface cell {cell & 15},{cell >> 4}',
                'model': model_id,
                'sourceAddress': placement['address'],
                'association': None,
                'handling': None,
                'placement': None,
                'location': {
                    'body': 'body-8',
                    'place': place[0] if place else None,
                    'position': [
                        gaea_origin_x + (cell & 15) + 0.5 + dx * 30 / 65536,
                        0,
                        gaea_origin_z + (cell >> 4) + 0.5 + dz * 30 / 65536,
                    ],
                    'coordinateSystem': 'ST surface grid units (body-local origin unresolved)',
                    'heading': None,
                },
                'reason': (
                    'Authored Birmingham Island surface-assembly map recovered from the pinned '
                    'first-world place pool; not a live Gaea $ABDC workspace. Origin follows '
                    'the 99 CHEVY resident phase so cell $17 shares this 16×16. A source place '
                    'name is attached only when this cell is in the area list.'
                ),
            })
            if place:
                next(p for p in places if p['id'] == place[0])['instances'].append(identity)
        empty_cells = 256 - len(gaea_cells)
        gaea_coverage = (
            f'Gaea Birmingham Island: examined the authored 16×16 placement stream ending at '
            f'${gaea_header:05X}, recovered {len(gaea_cells)} surface assemblies and '
            f'{len(gaea_area["places"])} named places; {empty_cells} cells have no structure '
            '(including 99 CHEVY cell $17). Ground/pad records and Gaea islands other than this '
            'authored Birmingham map and any attached live $ABDC overlays remain unresolved.'
        )
    for cell, model_id in ground_cells:
        model = by_address[model_id]
        if not model['variants']:
            continue
        identity = f'eris-ground-{cell:02x}'
        place = names.get(cell)
        instances.append({
            'id': identity,
            'name': place[1] + ' ground' if place else f'Eris ground cell {cell & 15},{cell >> 4}',
            'model': model_id,
            'sourceAddress': 0x1E400 + cell * 2,
            'association': None,
            'handling': None,
            'placement': None,
            'location': {
                'body': 'body-11',
                'place': place[0] if place else None,
                'position': [origin_x + (cell & 15) + 0.5, 0, origin_z + (cell >> 4) + 0.5],
                'coordinateSystem': 'ST surface grid units (body-local origin unresolved)',
                'heading': None,
            },
            'reason': 'Recovered first-world cell ground/pad/road record; intentional empty records have no drawable instance.',
        })
        model['linkedInstances'].append(identity)
        if place:
            next(p for p in places if p['id'] == place[0])['instances'].append(identity)
    workspace_notes = []
    slot_bindings: list[dict] = []
    if workspaces:
        for workspace in workspaces:
            note = attach_live_workspace(
                workspace, data, models, tables, instances, places, by_address, bodies,
                hardware, template_palettes,
            )
            workspace_notes.append(note)
            slot_bindings.append({
                'world': note.split(' live $ABDC', 1)[0],
                'bindings': object_slot_bindings(data, workspace),
            })
    chevy_key = instance_by_id.get('object-slot-180')
    chevy_parent_model = by_address.get('structure-01d188')
    chevy_map_record = data[0x251d7:0x251dd]
    if (chevy_key is not None and chevy_parent_model is not None and
            chevy_key['association'] == {
                'body': 'body-11', 'structureGroupSelector': 0x14,
                'insertionGroupSelector': 0x03, 'levelSelector': 0x01,
                'cell': 0x26, 'insertions': [],
            } and chevy_map_record == bytes.fromhex('60 26 91 00 df 83') and
            tables[1]['entries'][0x91] == chevy_parent_model['id']):
        dx, dz = struct.unpack('>bb', chevy_map_record[4:])
        resident_raw = [s32(data, base + 180 * 4) for base in (0x63a8, 0x67a8, 0x6ba8)]
        parent_raw = structure_origin(tuple(resident_raw), dx, dz)
        parent_id = 'eris-structure-0251d7'
        instances.append({
            'id': parent_id,
            'name': 'Eris structure group $14 cell $26',
            'model': chevy_parent_model['id'],
            'sourceAddress': 0x251d7,
            'association': None,
            'handling': None,
            'placement': None,
            'location': {
                'body': 'body-11', 'place': None,
                'position': [parent_raw[0] / 65536, 0, parent_raw[2] / 65536],
                'coordinateSystem': 'ST surface grid units (body-local origin unresolved)',
                'heading': None,
            },
            'reason': ('Authored structure-group $14 cell $26 instance; source name and named place '
                       'remain unresolved.'),
        })
        insertions = decode_structure_associations(data, 0x13218).get(0x03)
        if insertions is None:
            raise ValueError('99 Chevy key insertion group is missing')
        chevy_key['association']['insertions'] = [
            {'regionSelector': region, 'insertionKey': insertion}
            for region, insertion in insertions.items()
        ]
        chevy_key['placement'] = {
            'parent': parent_id,
            'position': resident_local_position(data, 180, tuple(parent_raw)),
            'heading': None,
            'coordinateSystem': 'Eris structure group $14 cell $26 local model units',
        }
        chevy_key['reason'] = (
            'Recovered resident placement in the source-unnamed Eris structure-group $14 cell '
            '$26 instance. Raw yaw is zero; the absolute angular convention remains unresolved.'
        )
        chevy_parent_model['linkedInstances'].append(chevy_key['id'])
        chevy_parent_model['evidence'].append({
            'claim': ('Authored group-$14 cell-$26 record places this slot-145 alias instance '
                      'and binds resident slot 180 at local (-394, 200, 1846).'),
            'confidence': 'verified',
            'source': 'docs/research/damocles-resident-objects.md',
        })
        by_address[chevy_key['model']]['evidence'].append({
            'claim': ('Structure association group $03 binds resident slot 180 to the Eris '
                      'group-$14 cell-$26 slot-145 instance at local (-394, 200, 1846).'),
            'confidence': 'verified',
            'source': 'docs/research/damocles-resident-objects.md',
        })
    for vehicle_slot, key_slot in ((2, 180), (3, 181), (4, 182), (5, 183),
                                   (6, 184), (10, 188), (12, 190), (13, 191)):
        vehicle = instance_by_id[f'object-slot-{vehicle_slot}']
        vehicle_key = instance_by_id[f'object-slot-{key_slot}']
        claim = (f'Resident vehicle slot {vehicle_slot} pairs with key slot {key_slot} by the '
                 'recovered +178 table relation and matching source names.')
        evidence = {
            'claim': claim,
            'confidence': 'verified',
            'source': 'docs/research/damocles-vip-limo.md',
        }
        vehicle_model = by_address[vehicle['model']]
        key_model = by_address[vehicle_key['model']]
        vehicle_model['linkedInstances'].append(vehicle_key['id'])
        key_model['linkedInstances'].append(vehicle['id'])
        vehicle_model['evidence'].append(evidence)
        key_model['evidence'].append(evidence.copy())
    key_position = None
    spaceport = next((instance for instance in instances if instance['id'] == 'eris-surface-87'), None)
    key = next((instance for instance in instances if instance['id'] == 'object-slot-183'), None)
    limo = next((instance for instance in instances if instance['id'] == 'object-slot-5'), None)
    capital_spaceport = next((place for place in places if place['name'] == 'CAPITAL SPACEPORT'), None)
    if (spaceport is not None and key is not None and limo is not None and capital_spaceport is not None and
            limo['model'] == 'object-036176' and u32(data, 0x73a8 + 5 * 4) & 0xff == 0x87):
        limo['location'] = {
            'body': 'body-11',
            'place': capital_spaceport['id'],
            'position': [s32(data, base + 5 * 4) / 65536 for base in (0x63a8, 0x67a8, 0x6ba8)],
            'coordinateSystem': 'ST surface grid units (body-local origin unresolved)',
            'heading': data[0x79cd + 5],
        }
        limo['reason'] = ('Resident slot 5 is associated with Eris surface cell $87. '
                          'Its world coordinates and zero yaw are recovered from the on-foot capture.')
        capital_spaceport['instances'].append(limo['id'])
        limo_model = by_address[limo['model']]
        key_model = by_address[key['model']]
        limo_model['evidence'].append({
            'claim': ('Resident slot 5 places the V.I.P. LIMO at CAPITAL SPACEPORT. It boards '
                      'with KEY- V.I.P. LIMO held and refuses an empty inventory with VEHICLE KEY REQUIRED.'),
            'confidence': 'verified',
            'source': 'docs/research/damocles-vip-limo.md',
        })
        key_model['evidence'].append({
            'claim': ('KEY- V.I.P. LIMO permits boarding resident V.I.P. LIMO slot 5; without it '
                      'the Working Authority refuses boarding with VEHICLE KEY REQUIRED.'),
            'confidence': 'verified',
            'source': 'docs/research/damocles-vip-limo.md',
        })
    if spaceport is not None and key is not None:
        association = key['association']
        if association is None or association['insertionGroupSelector'] != 12:
            raise ValueError('spaceport resident association selectors do not match the reviewed source')
        groups = decode_structure_associations(data, 0x14aac)
        insertions = groups.get(association['insertionGroupSelector'])
        if insertions is None:
            raise ValueError('spaceport resident insertion group is missing')
        association['insertions'] = [
            {'regionSelector': region, 'insertionKey': insertion}
            for region, insertion in insertions.items()
        ]
        spaceport_raw = [round(spaceport['location']['position'][axis] * 65536) for axis in (0, 1, 2)]
        key_position = resident_local_position(data, 183, tuple(spaceport_raw))
        key['placement'] = {'parent': spaceport['id'], 'position': key_position, 'heading': None,
                            'coordinateSystem': 'Capital Spaceport local model units'}
        key['reason'] = ('Recovered resident placement in Capital Spaceport region 1. Raw yaw is zero; '
                         'the absolute angular convention remains unresolved.')
    # Scene colour bindings for $7000 ground templates. A template object record
    # carries no palette of its own, so the only evidence its face colours have is
    # the palette each placing cell's surface record selects. Every evidenced
    # palette becomes its own variant instead of one unverified palette 0 form.
    for identity, base_gaps in scene_colour_objects.items():
        model = by_address[identity]
        bindings = template_palettes.get(identity) or {}
        if not bindings:
            model['reason'] = ' '.join(base_gaps + [
                'No captured surface workspace places this template, so its scene colour '
                'words have no evidenced palette. Scene colour table binding unverified; '
                'palette 0 is shown. Binding it needs a capture whose $1E400 cell table '
                'selects one of the ground records that place it.'
            ])
            continue
        variants = []
        for index in sorted(bindings):
            forms, conditions, gaps = decode_object_forms(
                data, model['sourceAddress'], palette_at(data, index), hardware
            )
            for form in forms:
                variants.append({
                    **form,
                    'id': f'palette-{index}' if form['id'] == 'record' else f"{form['id']}-palette-{index}",
                    'name': f"{form['name']} \u00b7 palette {index}",
                })
            cells = list(dict.fromkeys(bindings[index]))
            shown = ', '.join(cells[:6]) + (', and more' if len(cells) > 6 else '')
            model['evidence'].append({
                'claim': (
                    f'{len(cells)} authored $7000 ground placement'
                    f'{"" if len(cells) == 1 else "s"} bind this template to '
                    f'scene palette {index}: {shown}.'
                ),
                'confidence': 'verified',
                'source': 'docs/research/damocles-catalogue.md',
            })
        model['variants'] = variants
        indexes = ', '.join(str(index) for index in sorted(bindings))
        model['reason'] = ' '.join(base_gaps + [
            'Shape decoded; its scene colours resolve through the palette each placing '
            f'cell selects, evidenced here as palette {indexes}.'
        ])
        model['status'] = 'partial' if base_gaps else 'decoded'
    interior_palettes = {}
    # One detail is reused by structures of different scale, so an articulated
    # one needs every frame it is turned in, not only every palette it wears.
    interior_frames: dict[str, set[tuple[int, int, int]]] = {}
    for model in models:
        if 'interiorSlot' in model:
            slot = model.pop('interiorSlot')
            if slot < len(tables[2]['entries']):
                target = tables[2]['entries'][slot]
                model['relatedModels'].append(target)
                interior_palettes.setdefault(target, set()).add(model['paletteIndex'])
                scale = structure_bindings.get(model['id'], (None, None, None))[2]
                if scale is not None:
                    interior_frames.setdefault(target, set()).add(
                        (model['paletteIndex'], scale[0], scale[1])
                    )
        model.pop('paletteIndex', None)
    live_text_bindings = []
    for ram in workspaces:
        current_cell = int.from_bytes(ram[0x7B5C:0x7B5E], 'big')
        if current_cell >= 256:
            continue
        surface_slot = int.from_bytes(
            ram[0xABDC + current_cell * 4:0xABDE + current_cell * 4], 'big'
        ) & 0x1FF
        if surface_slot >= len(tables[1]['entries']):
            continue
        structure_id = tables[1]['entries'][surface_slot]
        binding = structure_bindings.get(structure_id)
        if binding is None or binding[0] >= len(tables[2]['entries']):
            continue
        body = int.from_bytes(ram[0x7AA8:0x7AAA], 'big') // 4
        body_name = bodies[body]['name']
        live_text_bindings.append((
            structure_id,
            tables[2]['entries'][binding[0]],
            binding[1],
            body_name.lower(),
            body_name,
            ram,
        ))
    # A cell with a nonzero $7AFB base names the key letter of every $F0
    # entrance the cell's structure carries, so a workspace pins letters for
    # structures the Eris extract can only show without one.
    for ram in workspaces + [data]:
        body_index = int.from_bytes(ram[0x7AA8:0x7AAA], 'big') // 4
        if body_index >= len(bodies):
            continue
        body_name = bodies[body_index]['name']
        current_cell = int.from_bytes(ram[0x7B5C:0x7B5E], 'big')
        for cell in range(256):
            entry = CELL_WORKSPACE + cell * 4
            base = cell_key_base(ram[entry])
            if base == 0:
                continue
            surface_slot = int.from_bytes(ram[entry:entry + 2], 'big') & 0x1FF
            if surface_slot >= len(tables[1]['entries']):
                continue
            model = by_address.get(tables[1]['entries'][surface_slot])
            selection = (model or {}).get('structureSelection')
            if model is None or selection is None or not selection.get('liveSelector'):
                continue
            for item in selection['attachments']:
                if 'keyIndex' not in item:
                    continue
                label = attachment_key_label(base, item['controlWord'])
                low = item['slot'] & 0xFF
                address = 0xCD35 - ((low - 0x100 if low >= 0x80 else low) >> 1)
                observed = cell == current_cell and ram[address] == label
                model['evidence'].append({
                    'claim': (
                        f"{body_name} cell {cell} installs $7AFB base ${base:02X}, so the $F0 "
                        f"entrance in slot ${item['slot']:03X} carries key letter "
                        f"{chr(label)} at ${address:04X}."
                    ),
                    'confidence': 'verified' if observed else 'observed',
                    'source': 'docs/research/damocles-generic-entrance-attachments.md',
                })
    live_detail_by_structure = {}
    for identity, palettes in interior_palettes.items():
        model = by_address[identity]
        variants = []
        for index in sorted(palettes):
            try:
                mesh = decode_mesh(data, model['sourceAddress'], 'interior', palette_at(data, index), hardware)
                variants.append({'id': f'palette-{index}', 'name': f'Structure-bound palette {index}', 'mesh': mesh})
            except ValueError:
                continue
        for structure_id, detail_id, palette_index, body_slug, body_name, ram in live_text_bindings:
            if identity != detail_id:
                continue
            try:
                mesh = decode_mesh(
                    data, model['sourceAddress'], 'interior',
                    palette_at(data, palette_index), hardware, ram,
                )
                variant_id = f'palette-{palette_index}-live-{body_slug}'
                variants.append({
                    'id': variant_id,
                    'name': f'Live {body_name} text · palette {palette_index}',
                    'mesh': mesh,
                })
                live_detail_by_structure[structure_id] = variant_id
                model['evidence'].append({
                    'claim': (
                        f'Live {body_name} Structure Workspace supplies dynamic vector-text '
                        'tokens for this captured detail variant.'
                    ),
                    'confidence': 'observed',
                    'source': 'docs/research/damocles-building-vector-text.md',
                })
            except ValueError:
                pass
        # $053D74 turns a detail only after $054D98 has installed the placing
        # structure's X/Z scale, so each frame the detail is reused in is its
        # own set of sampled angles under one reusable detail identity.
        articulated = any('articulation' in variant['mesh'] for variant in variants)
        frames = sorted(interior_frames.get(identity, ()))
        if articulated and frames:
            step = 256 // ARTICULATION_STEPS
            for index, scale_x, scale_z in frames:
                neutral = next(
                    (variant['mesh'] for variant in variants
                     if variant['id'] == f'palette-{index}'), None
                )
                if neutral is None or 'articulation' not in neutral:
                    continue
                for sample in range(ARTICULATION_STEPS):
                    angle = sample * step
                    variants.append({
                        'id': f'palette-{index}-scale-{scale_x}x{scale_z}-angle-{angle:02x}',
                        'name': (f'Scale {scale_x}×{scale_z} · articulation angle '
                                 f'${angle:02X} · palette {index}'),
                        'mesh': turn_detail_mesh(data, neutral, (scale_x, scale_z), angle),
                    })
        if variants:
            model['variants'] = variants
            model['status'] = 'partial'
            if identity in BUILDING_VECTOR_TEXT_MODELS:
                model['reason'] = (
                    'Shape, structure-bound colours and supported $60xx vector text decoded. '
                    + selection_note(model)
                    + ' Uncaptured dynamic token states are not simulated.'
                )
                model['evidence'].append({
                    'claim': (
                        'Native $60xx building-detail text retains preceding faces and uses '
                        '$80 filled or $81 stroke glyphs from the $31700 font table.'
                    ),
                    'confidence': 'verified',
                    'source': 'docs/research/damocles-building-vector-text.md',
                })
            else:
                model['reason'] = (
                    'Shape and structure-bound colours decoded. ' + selection_note(model)
                )
            unreferenced = variants[0]['mesh'].get('unreferencedRecords')
            if unreferenced:
                names = ', '.join(str(index) for index in unreferenced)
                model['reason'] += (
                    f' Records {names} name shared vertex slots above this list, which'
                    ' $053D32 never fills, so they could only draw whatever the previous'
                    ' model left behind. No box list or group default selects them, so'
                    ' they are kept as selector ordinals and drawn by nothing.'
                )
                model['evidence'].append({
                    'claim': (
                        f'Records {names} reference slots beyond the record\'s own vertex '
                        'list and no visibility list in either group names them.'
                    ),
                    'confidence': 'verified',
                    'source': 'docs/research/damocles-catalogue.md',
                })
            if articulated and frames:
                shown = ', '.join(
                    f'{scale_x}\u00d7{scale_z}'
                    for scale_x, scale_z in sorted({(x, z) for _p, x, z in frames})
                )
                model['reason'] += (
                    ' Articulated part. $054D98 installs the placing structure\'s X and Z'
                    ' scale bytes at $539CE/$539D2, $053B4A scales this record\'s pivot the'
                    ' same way, and $053D52 scales each vertex before $053D74 turns the'
                    ' tagged ones by $7888, so the turn belongs to the structure frame'
                    f' rather than to the model. Frames evidenced here: {shown}, each'
                    f' offered at {ARTICULATION_STEPS} sampled angles. $7888 free-runs, so'
                    ' no single frame of it is canonical.'
                )
                model['conditions'] = [
                    'articulation angle ($7888)',
                    'structure scale ($539CE/$539D2)',
                ]
                model['evidence'].append({
                    'claim': (
                        'Articulation axis and pivot follow the $8001 vertex terminator at '
                        '$053B4A and are scaled by the structure X/Z factors $054D98 copies '
                        'from the placing record\'s scale bytes.'
                    ),
                    'confidence': 'verified',
                    'source': 'docs/research/damocles-catalogue.md',
                })
            elif articulated:
                model['reason'] += (
                    ' Articulated part shown in model-local coordinates at its rest angle:'
                    ' no captured structure record binds this detail, so $053D74 has no'
                    ' evidenced X/Z scale frame to turn it in.'
                )
    for identity, (slot, palette_index, scale) in structure_bindings.items():
        if slot >= len(tables[2]['entries']):
            continue
        model = by_address[identity]
        detail = by_address[tables[2]['entries'][slot]]
        variant_id = live_detail_by_structure.get(identity, f'palette-{palette_index}')
        variant = next((v for v in detail['variants'] if v['id'] == variant_id), None)
        if variant is None:
            if model['status'] == 'decoded':
                model['status'] = 'partial'
            if detail.get('intentionalEmpty'):
                suffix = ('The linked building detail is itself an intentionally empty'
                          ' record, so there is no detail geometry to place.')
            else:
                suffix = 'Linked building detail geometry is unresolved.'
                model.pop('intentionalEmpty', None)
            model['reason'] = (model['reason'] + ' ' + suffix).strip()
            if identity == 'structure-01a618':
                model['evidence'] = [{
                    'claim': (
                        'Empty plan and wall list at $01A618; linked building detail 1 at '
                        '$02620E is an immediate $8000 vertex terminator. Nineteen Eris '
                        'cells share this placeholder; they have no recovered building mesh.'
                    ),
                    'confidence': 'verified',
                    'source': 'docs/research/damocles-eris-structure-01a618.md',
                }]
            continue
        base = model['variants'][0]['mesh'] if model['variants'] else {'vertices': [], 'faces': [], 'lines': []}
        # Representative split established from matching exterior/interior captures.
        # Region 1 belongs to the plan record; detail 88 is not a separate room.
        # Keep this scoped until other occupied-cell records are reviewed.
        if identity == 'structure-01484e' and slot == 88:
            if key_position is None:
                raise ValueError('spaceport key placement is unavailable')
            region_order, region_gaps = decode_visibility_list(data, 0x14970, 28)
            # The region renderer interprets $FF * 4 as runtime slot $3FC,
            # Structure 74's authored dynamic entrance-door attachment.
            region_gaps = [gap for gap in region_gaps if '$FF' not in gap]
            faces_by_source = {face['sourceIndex']: face for face in base['faces']}
            if set(region_order) != set(faces_by_source):
                raise ValueError('spaceport region 1 visibility list does not account for every decoded plan face')
            base = {**base, 'faces': [faces_by_source[index] for index in region_order]}
            key_model = by_address['object-03e494']
            key_mesh = translate_mesh(key_model['variants'][0]['mesh'], tuple(key_position))
            occupied_base = assemble_mesh(base, key_mesh, (1, 1))
            # Detail 88 contains mutually exclusive closed and open facades.
            # Keep the authored aperture surrounds (35–37, 39–42), excluding
            # full walls and flat opening fills (1, 2, 31, 32).
            open_detail = {**variant['mesh'], 'faces': [face for index, face in enumerate(variant['mesh']['faces']) if index not in (1, 2, 31, 32)]}
            exterior = assemble_mesh({'vertices': [], 'faces': [], 'lines': []}, open_detail, scale)
            # The authored grey entrance panel closes the aperture without
            # reintroducing the mutually exclusive solid facade.
            closed_detail = {**open_detail, 'faces': open_detail['faces'] + [{**variant['mesh']['faces'][32], 'doubleSided': True}]}
            closed_exterior = assemble_mesh({'vertices': [], 'faces': [], 'lines': []}, closed_detail, scale)
            model['variants'] = [
                {'id': 'exterior', 'name': 'Exterior', 'view': 'exterior', 'doorState': 'open', 'mesh': exterior},
                {'id': 'interior-layout', 'name': 'Interior with captured resident (partial)', 'mesh': occupied_base},
                {'id': 'combined', 'name': 'Combined interior and exterior', 'view': 'combined', 'doorState': 'open', 'mesh': assemble_mesh(occupied_base, open_detail, scale)},
            ]
            model['variants'].extend([
                {'id': 'exterior-closed', 'name': 'Exterior', 'view': 'exterior', 'doorState': 'closed', 'mesh': closed_exterior},
                {'id': 'combined-closed', 'name': 'Combined interior and exterior', 'view': 'combined', 'doorState': 'closed', 'mesh': assemble_mesh(occupied_base, closed_detail, scale)},
            ])
            for view in model['variants']:
                if view.get('view') == 'combined':
                    view['walkMesh'] = assemble_mesh(base, closed_detail if view['doorState'] == 'closed' else open_detail, scale)
            model['name'] = 'Capital Spaceport'
            model['nameStatus'] = 'candidate'
            model['linkedInstances'] = ['object-slot-183', 'object-slot-5']
            model['evidence'] = [
                {'claim': 'Placed at the source-named CAPITAL SPACEPORT cell $87.',
                 'confidence': 'verified', 'source': 'docs/research/damocles-spaceport-interior.md'},
                {'claim': 'Captured interior is one room in region 1 of Structure 74.',
                 'confidence': 'observed', 'source': 'docs/research/damocles-spaceport-interior.md'},
                {'claim': 'Region 1 orders all 28 decoded plan faces and inserts the authored dynamic entrance door at $FF.',
                 'confidence': 'verified', 'source': 'docs/research/damocles-spaceport-interior.md'},
                {'claim': 'Dynamic door proximity box: X 1200–1600, Z -1200–-200.',
                 'confidence': 'verified', 'source': 'docs/research/damocles-spaceport-interior.md'},
                {'claim': 'Region 1 places resident slot 183, KEY- V.I.P. LIMO, at local (1038, 0, 789).',
                 'confidence': 'verified', 'source': 'docs/research/damocles-spaceport-interior.md'},
                {'claim': 'Resident slot 5 places the V.I.P. LIMO outside at CAPITAL SPACEPORT cell $87.',
                 'confidence': 'verified', 'source': 'docs/research/damocles-vip-limo.md'},
            ]
            key_model['evidence'].extend([
                {'claim': 'Resident slot 183 is placed in Capital Spaceport region 1 at local (1038, 0, 789).',
                 'confidence': 'verified', 'source': 'docs/research/damocles-spaceport-interior.md'},
                {'claim': 'Observed pickup removes slot 183 from the room queue and retains the key in inventory.',
                 'confidence': 'observed', 'source': 'docs/research/damocles-spaceport-interior.md'},
            ])
            model['status'] = 'partial'
            model['reason'] = (model['reason'] + ' ' + ' '.join(region_gaps) + ' Capital Spaceport at Eris cell $87: the captured interior selects region 1 of this same structure, with local X 840–1560 and Z -760–760. Exterior, interior layout and combined views are available. The interior layout follows region 1 source face ordering. Its $FF entry identifies the authored dynamic entrance-door attachment. The exterior and combined views select the authored open-window and open-door surrounds rather than overlapping them with closed facades. Open and closed detail endpoints are available for inspection; the recovered dynamic door motion, timing and retreat behaviour are not simulated. The closed panel is visible from both sides for inspection. Original region-dependent detail visibility is not fully simulated. Ordinary walls are shown from both sides for inspection; their source records do not specify polygon winding. The blue floor and cyan lower window wall are consistent with the supplied original-game interior view. See docs/research/damocles-spaceport-interior.md.').strip()
            detail['relatedModels'].append(identity)
            continue
        if 'articulation' in variant['mesh']:
            # The detail is turned in this structure's own scaled frame, so it
            # arrives already scaled and must not be scaled again.
            step = 256 // ARTICULATION_STEPS
            model['variants'] = [{
                'id': 'assembly' if sample == 0 else f'assembly-angle-{sample * step:02x}',
                'name': (f'Structure and detail · palette {palette_index} · '
                         f'articulation angle ${sample * step:02X}'),
                'mesh': assemble_mesh(
                    base, turn_detail_mesh(data, variant['mesh'], scale, sample * step), (1, 1)
                ),
            } for sample in range(ARTICULATION_STEPS)]
            model['conditions'] = ['articulation angle ($7888)']
            detail_note = (
                ' Includes its linked articulated detail, turned in this record\'s own'
                f' {scale[0]}\u00d7{scale[1]} frame at {ARTICULATION_STEPS} sampled $7888'
                ' angles.'
            )
        else:
            combined = assemble_mesh(base, variant['mesh'], scale)
            model['variants'] = [{'id': 'assembly', 'name': f'Structure and detail · palette {palette_index}', 'mesh': combined}]
            detail_note = ' Includes linked exterior/interior detail in its neutral pose.'
        # Detail tables include view-conditioned external and internal geometry.
        model['status'] = 'partial'
        model['reason'] = (model['reason'] + detail_note).strip()
    # Model headers which jump to a shared vertex stream provide evidence for visual variants.
    for identity, (slot, palette_index, scale) in structure_bindings.items():
        model = by_address[identity]
        selection = model.get('structureSelection')
        if selection is None:
            continue
        detail = by_address[tables[2]['entries'][slot]] if slot < len(tables[2]['entries']) else None
        variant_id = f'palette-{palette_index}'
        if detail is None or 'detailSelection' not in detail or not any(v['id'] == variant_id for v in detail['variants']):
            del model['structureSelection']
            if detail is not None and detail.get('intentionalEmpty'):
                model['reason'] += (
                    ' That empty detail carries no visibility groups either, so this'
                    ' record keeps no structure selector and its region queues are'
                    ' not retained.'
                )
            else:
                model.pop('intentionalEmpty', None)
                model['status'] = 'partial' if model['variants'] else 'unresolved'
                model['reason'] += (
                    ' Linked detail selection unavailable, so view-conditioned'
                    ' visibility is not simulated for this record.'
                )
        else:
            selection['detailModel'] = detail['id']
            selection['detailVariant'] = variant_id
            model['reason'] += (
                ' Region queues and linked detail lists recovered for on-foot drawing;'
                ' each region is also offered as its own inspection form, using the'
                ' detail group default list because a free-orbit view has no player'
                ' position. Entrance Attachments carry constructor, slot and Proximity Box.'
            )
            if identity in ('structure-014ad2', 'structure-014aec'):
                model['evidence'].append({
                    'claim': (
                        'Structure 75 at STATE OFFICE aliases this plan and binds four generic '
                        'Entrance Attachments; slot $03FC is a two-leaf Z entrance.'
                    ),
                    'confidence': 'verified',
                    'source': 'docs/research/damocles-generic-entrance-attachments.md',
                })
    alias_ids = {identity for identity, _ in structure_aliases}
    for model in models:
        if 'selectionReason' in model:
            model['reason'] += ' Detail selection unavailable: ' + model.pop('selectionReason') + '.'
        classify_record(model, model['id'] in alias_ids)
    forms = {}
    for model in models:
        if model['kind'] == 'object' and model['variants']:
            key = model['variants'][0]['mesh']['geometryStart']
            forms.setdefault(key, []).append(model)
    for group in forms.values():
        if len(group) < 2:
            continue
        shared = [{'id': model['id'], 'name': model['name'] + ' · ' + model['id'], 'mesh': model['variants'][0]['mesh']} for model in group]
        for model in group:
            own = [variant for variant in model['variants'] if variant['id'] != 'record']
            model['variants'] = shared + own
            model['relatedModels'].extend(other['id'] for other in group if other is not model)
    # $8007 and $8002 derive a label character from the runtime slot, so a model
    # shared by ten slots really draws ten different labels.
    for model in models:
        if not any(c.startswith('resident slot') for c in model.get('conditions') or []):
            continue
        labelled, gaps = [], []
        for slot in model['slots']:
            try:
                forms, _conditions, slot_gaps = decode_object_forms(
                    data, model['sourceAddress'], None, hardware, slot,
                )
            except (ValueError, struct.error):
                labelled = []
                break
            text = next(
                (item['text'] for item in forms[0]['mesh'].get('texts', []) if item['text']),
                '',
            )
            if not text:
                labelled = []
                break
            gaps += slot_gaps
            for form in forms:
                labelled.append({
                    **form,
                    'id': f"slot-{slot}-{form['id']}",
                    'name': f"Slot {slot} · label {text} · {form['name']}",
                })
        if labelled:
            model['variants'] = labelled
            model['reason'] = ' '.join(dict.fromkeys(gaps))
            model['status'] = 'partial' if gaps else 'decoded'
            classify_record(model, False)
            model['evidence'].append({
                'claim': (
                    'Vector-text token $87 reads $CD12, which this record\'s header writes '
                    'from the runtime slot ($053512 for $8007, $05358A for $8002). Each slot '
                    'therefore draws its own label.'
                ),
                'confidence': 'verified',
                'source': 'docs/research/damocles-catalogue.md',
            })
    # The pinned first-world capture is one world's binding of the repointed
    # slots, not a resident fact, so every model the window reaches says so.
    rebound: dict[int, list[tuple[str, str]]] = {}
    for entry in slot_bindings:
        for binding in entry['bindings']:
            rebound.setdefault(binding['slot'], []).append(
                (entry['world'], binding['liveModel'])
            )
    for model in models:
        if model['kind'] != 'object':
            continue
        window = [slot for slot in model['slots'] if slot in WORLD_CONDITIONED_OBJECT_SLOTS]
        if not window or model.get('intentionalEmpty'):
            continue
        model['worldConditionedSlots'] = window
        elsewhere = sorted({
            f'{world} holds it as {identity}'
            for slot in window for world, identity in rebound.get(slot, [])
        })
        plural = 's' if len(window) > 1 else ''
        model['reason'] = (model['reason'] + ' ' + (
            f"Resident slot{plural} "
            + ', '.join(str(slot) for slot in window)
            + f" differ{'' if plural else 's'} between captured worlds, so this "
            'binding is the pinned first-world capture\'s rather than a resident '
            'fact'
            + ('; ' + '; '.join(elsewhere) + '.' if elsewhere
               else '; no other captured world binds it yet.')
        )).strip()
    settle_intentional_empties(models)
    coverage_notes = [
        'Resident first-world census after examining title-screen, first-world and interior-window RAM; not a claim that every packed disk file has been walked.',
        'Scene palette binding for unplaced objects 333-338, and named places outside the captured Eris workspace, authored Gaea Birmingham Island map, live Gaea UR City overlay, and live Dion overlay remain incomplete.',
        'View-conditioned face groups, $8003/$8006/$8009 header states and object $6000 vector text are decoded as separate forms; the in-game selector for each form is named in the model conditions, not simulated.',
        'Eris cell ground/pad/road records at $1E000 retain $7000 object placements through existing address-based model identities; surface slot zero supplies palette zero for structureless cells, empty records are intentional and add no geometry at $056634, and $F0/$F4 joins remain view-conditioned.',
        'The sky and the ground band below the horizon are excluded as rendering-only state, not omitted geometry: $059CE2 fills the whole viewport in colour index 8 and the MFP Timer B handler at $052280 rewrites $FF8250 at scanline $7BFC, taking the sky from $7C86 and the band from the body workspace word at $7A1A. The scene slots below $F0 that $05499E allocates are excluded on the same footing: they are a per-frame slot numbering over the $1E000 corner longwords already decoded here, drawn as two-point edges at $054AD2, and research/damocles-st/scripts/ground-extent-check.py reconstructs the live list, lowest slot and $5E40 bytes from captured RAM alone.',
        'The documented zero-latch and $F0 post-plan constructors are retained, including the cell-derived door-key label; no discovered record carries an attachment omission. The $DF visual-change branch is accounted for: $059F64 reads the nine-entry $6364 table and substitutes character $DF for the entrance label glyph, while $04ED4A replays the same table over the $ABDC cell workspace to replace or clear an already-resident surface assembly. Neither introduces a record, and the table is all zero in every pinned capture, so neither branch is exercised by an observed state.',
        'Seven building-detail $60xx vector-text records retain their polygon geometry; inline text and live $CCA0 tokens use source filled/stroke glyphs.',
        'Every $6000 vector-text record in the census was inventoried: all 41 set the inline flag and none selects font 4, so the indirect-pointer and font-4 paths are unreached rather than unresolved. $CCA0 tokens divide into slot-derived labels, frame animations whose script is model data, structure-workspace face markers, and one live countdown.',
        'Every resident slot carries the interaction byte the take handler tests, decoded as handling. Bit 4 refuses silently, bit 5 diverts to the refusal message, and the low nibble is the drop handler\'s rank pair: bits 0-1 are the support rank the slot supplies and bits 2-3 the support rank it requires; bits 6 and 7 are live state and are zero in the pinned capture. Nothing here selects a candidate: which object is selected is the per-frame nearest-drawn rule in docs/research/damocles-object-selection.md, not a catalogue field.',
    ]
    if gaea_coverage:
        coverage_notes.append(gaea_coverage)
    disk_load = list(DISK_LOAD_EXAMINED)
    for note in workspace_notes:
        coverage_notes.append(note)
        label = note.split(' live $ABDC', 1)[0]
        disk_load.append({
            'path': f'{label.title()} live workspace',
            'finding': note,
        })
    return {'schemaVersion': 13, 'title': 'Damocles', 'source': source, 'models': models, 'instances': instances,
            'bodies': bodies, 'places': places, 'tables': tables,
            'coverage': coverage_ledger(models, tables, coverage_notes, disk_load)}


def validate_source(manifest: dict, pin: dict) -> None:
    for key, item in [('programSha256', 'programImage'), ('tosSha256', 'tosImage')]:
        if manifest['authority'][key] != pin[item]['hashes']['sha256']:
            raise ValueError('capture authority does not match the laboratory pin')
    if manifest.get('scenario', {}).get('sha256') != 'e5383458e6db10cbf5d02f44ae26f8192daeb76559a947e564f9058f8582f96e':
        raise ValueError('catalogue extraction currently requires the pinned first-world scenario')


def main():
    parser = argparse.ArgumentParser(description='Extract the private Damocles Catalogue from an attested first-world run')
    parser.add_argument('--run', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--workspace', type=Path, action='append', default=[],
                        help='Hatari memstate or 1 MiB RAM of a live non-Eris $ABDC workspace (repeatable)')
    args = parser.parse_args()
    from .laboratory import verify
    verify(args.run)
    manifest = json.loads((args.run / 'manifest.json').read_text())
    pin = json.loads((Path(__file__).parents[1] / 'config/working-authority.json').read_text())
    validate_source(manifest, pin)
    artifact = next(a for a in manifest['artifacts'] if a['role'] == 'observed-ram')
    data = (args.run / artifact['path']).read_bytes()
    workspaces = []
    for path in args.workspace:
        blob = path.read_bytes()
        workspaces.append(blob if len(blob) == 1048576 else hatari_memstate_ram(blob))
    source = {'authority': 'Damocles Atari ST Working Authority', 'run': args.run.name,
              'ramSha256': hashlib.sha256(data).hexdigest(),
              'programSha256': manifest['authority']['programSha256'],
              'evidence': 'docs/research/damocles-catalogue.md'}
    result = extract(data, source, workspaces or None)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, sort_keys=True) + '\n')
    from collections import Counter
    print(json.dumps({'models': len(result['models']), 'status': dict(Counter(m['status'] for m in result['models']))}))


if __name__ == '__main__':
    main()
