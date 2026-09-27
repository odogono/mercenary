"""Independent decoder of documented Damocles geometric records (ADR 0039).

This is a data parser, not a port of the renderer. Unknown commands fail closed.
See docs/research/damocles-catalogue.md for the recovered record grammar.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import math
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


def day_colour(word: int, palette: list[int] | None, hardware: list[int] | None) -> dict:
    """``dayColour`` for a ``$80xx`` word whose palette's day half gives another colour.

    ``$054E12``-``$054E28`` binds a scene palette's base in ``$7A12`` and the base plus
    the signed word stored just before it in ``$7A14``. Each frame the terminator at
    ``$050562`` copies ``$7A14`` into ``$7A10``, the low word of the ``$7A0E`` binding
    every ``$80xx`` read goes through, while the Body is in daylight, and ``$7A12``
    while it is dark. ``colour`` stays the dark half, as it always was. A palette whose
    offset is zero has one half, and a word both halves agree on needs no second colour.
    """
    day = getattr(palette, 'day', None)
    if day is None or word & 0x8080 != 0x8080:
        return {}
    try:
        night, lit = colour_value(word, palette, hardware), colour_value(word, day, hardware)
    except ValueError:
        return {}
    return {} if lit == night else {'dayColour': lit}


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


def read_glyph(data: bytes, font: int, character: str) -> dict:
    """One source glyph from the `$31700` font table, in unscaled glyph units.

    The result has `points`, then `faces` for a `$80` filled glyph or `lines`
    for an `$81` stroke glyph, each naming zero-based point indices.
    """
    glyph_index = ord(character) + font * 64 - 32
    pointer_address = 0x31700 + glyph_index * 2
    if glyph_index < 0 or pointer_address + 2 > len(data):
        raise ValueError('vector-text glyph outside source font')
    pointer = Reader(data, pointer_address).signed()
    glyph = Reader(data, 0x31700 + pointer)
    points = []
    for _ in range(63):
        x = int.from_bytes(glyph.take(1), 'big', signed=True)
        if x in (-128, -127):
            filled = x == -128
            break
        y = int.from_bytes(glyph.take(1), 'big', signed=True)
        points.append([x, y])
    else:
        raise ValueError('vector-text glyph vertex terminator missing')
    if filled:
        faces = []
        for _ in range(256):
            first = glyph.take(1)[0]
            if first == 0:
                return {'points': points, 'faces': faces}
            refs = [first]
            for _ in range(255):
                ref = glyph.take(1)[0]
                if ref == 0:
                    break
                refs.append(ref)
            else:
                raise ValueError('filled vector-text polygon terminator missing')
            if any(ref % 4 or ref // 4 > len(points) for ref in refs):
                raise ValueError('invalid filled vector-text glyph reference')
            faces.append([ref // 4 - 1 for ref in refs])
        raise ValueError('filled vector-text glyph terminator missing')
    lines = []
    for _ in range(256):
        a = glyph.take(1)[0]
        if a == 0:
            return {'points': points, 'lines': lines}
        b = glyph.take(1)[0]
        if any(ref == 0 or ref % 4 or ref // 4 > len(points) for ref in (a, b)):
            raise ValueError('invalid vector-text glyph reference')
        lines.append([a // 4 - 1, b // 4 - 1])
    raise ValueError('vector-text glyph line terminator missing')


def append_vector_text(data: bytes, text: str, font: int, anchor: list[int],
                       advance: int, scale_x: int, scale_y: int, plane: int,
                       colour: int, vertices: list, faces: list, lines: list,
                       palette: list[int] | None, hardware: list[int] | None) -> None:
    """Append source font fills or strokes in a building detail's text plane."""
    rgb = colour_value(colour, palette, hardware)
    day = day_colour(colour, palette, hardware)
    for character_index, character in enumerate(text):
        glyph = read_glyph(data, font, character)
        offset = len(vertices)
        for x, y in glyph['points']:
            horizontal = character_index * advance + x * scale_x
            vertices.append(
                [anchor[0] + horizontal, anchor[1] + y * scale_y, anchor[2]]
                if plane == 0
                else [anchor[0], anchor[1] + y * scale_y, anchor[2] + horizontal]
            )
        for refs in glyph.get('faces', []):
            faces.append({
                'vertices': [offset + ref for ref in refs],
                'colour': rgb,
                **day,
                'sourceColour': colour,
            })
        for a, b in glyph.get('lines', []):
            lines.append({
                'vertices': [offset + a, offset + b],
                'colour': rgb,
                **day,
                'sourceColour': colour,
            })


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
    day = day_colour(colour, palette, hardware)
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
                              'colour': rgb, **day, 'sourceColour': colour})
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
                          'colour': rgb, **day, 'sourceColour': colour})
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
                         'colour': colour_value(colour, palette, hardware),
                         **day_colour(colour, palette, hardware), 'sourceColour': colour}
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
            resolved.append({'colour': colour_value(word, palette, hardware),
                             **day_colour(word, palette, hardware), 'sourceColour': word})
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
        faces.append({'vertices': list(range(offset, offset + len(polygon))), 'colour': rgb,
                      **day_colour(colour & 0x8fff, palette, hardware), 'sourceColour': colour,
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
                              **day_colour(colour & ~0x4000, palette, hardware),
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
                          **day_colour(colour, palette, hardware),
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
            **day_colour(colour & 0x8fff, palette, hardware),
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


def read_wall_text(reader: Reader, command: int) -> dict:
    """A post-plan wall-text record: a control whose low byte is 1–15 ($059EB6).

    After the control come a flags byte and the region-queue byte of the face
    it rides on, an offset word, X/Y/Z, the two glyph scales, a colour and a
    NUL-terminated text, padded to an even address. The builder stores a
    pointer to the text rather than the text, so the draw pass reaches it
    through the indirect path at $054080 whatever the flags' bit 15 says.
    """
    flags, face = reader.take(2)
    offset, x, y, z = (reader.signed() for _ in range(4))
    scale_x, scale_y = struct.unpack('>bb', reader.take(2))
    colour = reader.word()
    text = bytearray()
    for _ in range(1024):
        character = reader.take(1)[0]
        if character == 0:
            if reader.p & 1:
                reader.take(1)
            return {'command': command, 'flags': flags, 'face': face, 'offset': offset,
                    'position': [x, y, z], 'scale': [scale_x, scale_y],
                    'colour': colour, 'text': bytes(text)}
        text.append(character)
    raise ValueError('other post-plan record terminator missing')


def wall_text_placement(text: dict, scale: tuple[int, int]) -> dict:
    """$059EB6–$059F3C: where a wall-text record draws under a placement scale.

    X and Z take the placement scale and Y does not. Flags bit 7 turns the
    glyphs into the ZY plane. The offset's low bit asks for the rest of it to
    be multiplied by the placement scale along the text, and the offset is
    subtracted along the text. A negative scale across the text mirrors the
    glyphs, the advance and the offset.
    """
    scale_x, scale_z = scale
    x, y, z = text['position']
    x, z = x * scale_x, z * scale_z
    zy = bool(text['flags'] & 0x80)
    along, across = (scale_z, scale_x) if zy else (scale_x, scale_z)
    offset = text['offset'] >> 1
    if text['offset'] & 1:
        offset *= abs(along)
    glyph_x, glyph_y = text['scale']
    advance = text['command'] * glyph_x
    if across < 0:
        glyph_x, advance, offset = -glyph_x, -advance, -offset
    if zy:
        z -= offset
    else:
        x -= offset
    return {'anchor': [x, y, z], 'plane': text['flags'] & 0xC0,
            'scale': [glyph_x, glyph_y], 'advance': advance}


# $055AB8-$055AD8 and $055B72 write the Floor Label into $CD04, and the
# $CCA0 entries for tokens $80 and $81 both point there in every capture.
FLOOR_LABEL_TARGET = 0xCD04
# G at Floor 0, the digit at 1 to 9, B at 10.
FLOOR_LABEL_CHARACTERS = 'G123456789B'


def floor_label_token(data: bytes, text: dict) -> int | None:
    """The token byte when a wall text is exactly one token that reaches $CD04."""
    if len(text['text']) != 1 or not text['text'][0] & 0x80:
        return None
    index = text['text'][0] & 0x7F
    pointer = u32(data, 0xCCA0 + index * 4)
    return text['text'][0] if pointer == FLOOR_LABEL_TARGET else None


def wall_text_label(text: dict) -> str:
    """The record's text for a reason string, a token shown as its byte."""
    return ''.join(
        f'<${character:02X}>' if character & 0x80 else chr(character)
        for character in text['text']
    )


# $054010-$054022: font 4 draws as font 3 while the word at $706E or $7116 is
# negative. Both are handling bytes $6FAA + 4 * slot, whose bit 7 the Take sets
# and the Drop clears: slot 49, READING GLASSES, and slot 91, RED HERRING.
FALLBACK_FONT = 4
FONT_FALLBACK_GATES = (0x706E, 0x7116)
HANDLING_BYTES = 0x6FAA
FONT_FALLBACK = {
    'font': 3,
    'whileCarried': [(gate - HANDLING_BYTES) // 4 for gate in FONT_FALLBACK_GATES],
}

# $059FC4 writes each Entrance Attachment's door key letter at $CD35 - slot/2,
# and tokens $8D-$96 point into that table.
KEY_LETTER_TABLE = 0xCD35
KEY_LETTER_TOKENS = range(0xCD37, 0xCD4A)
# $04E05A runs only in structure $52, room 9 ($7AF0, $7AFC), the Trading Post.
# $04E0BC-$04E130 then formats six BCD bytes as `000,000,000-00` at $CD19,
# blanking leading zeros.
TRADING_READOUT_TARGET = 0xCD19


def wall_text_mesh(data: bytes, text: dict, font: int, scale: tuple[int, int],
                   palette: list[int], hardware: list[int]) -> dict:
    """A literal wall text's glyphs in `font`, placed as $059EB6 places the record."""
    placement = wall_text_placement(text, scale)
    vertices, faces, lines = [], [], []
    append_vector_text(
        data, text['text'].decode('ascii'), font, placement['anchor'],
        placement['advance'], *placement['scale'], placement['plane'], text['colour'],
        vertices, faces, lines, palette, hardware,
    )
    return {'vertices': vertices, 'faces': faces, 'lines': lines}


def wall_text_token_gap(data: bytes, text: dict) -> str:
    """Why a wall text that reaches a token other than the Floor Label is not drawn."""
    index = next(character for character in text['text'] if character & 0x80) & 0x7F
    pointer = u32(data, 0xCCA0 + index * 4)
    if pointer in KEY_LETTER_TOKENS:
        slot = 0x300 | (-2 * (pointer - KEY_LETTER_TABLE)) & 0xFF
        return (
            f'it prints the door key letter $059FC4 writes at ${pointer:04X} for the '
            f'Entrance Attachment in slot ${slot:03X}, which the key base $7AFB of the '
            "Instance's cell decides"
        )
    if pointer == TRADING_READOUT_TARGET:
        return (
            f'it prints the BCD readout $04E05A formats at ${pointer:04X} in the Trading '
            'Post, structure $52 room 9, which differs between captures'
        )
    return f'it prints the live text at ${pointer:04X}, which differs between captures'


def floor_label_glyphs(data: bytes, fonts: set[int]) -> dict:
    """Every Floor Label character in each font a published Floor Label uses."""
    return {
        str(font): {character: read_glyph(data, font, character)
                    for character in FLOOR_LABEL_CHARACTERS}
        for font in sorted(fonts)
    }


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


def decode_detail_extent(data: bytes, start: int) -> dict | None:
    """The extent rectangle a Building detail record carries below its entry (#356).

    `$053A8C`-`$053B38` reads the cell's Building detail byte (`$53A85`, which the
    cell bind copies from the structure record) as a `$26000` slot, then walks the
    record backwards from its entry: seven-word groups up to a negative word, six-word
    groups up to the next, then the five words the zone at `$059076` reads -- a header
    and the X and Z pairs, in the order the walk meets them. A negative word where the
    header would be means the record has none, and the bind publishes `$8000`, zone 0.
    Raw units: the bind scales X by `$539CE`, the header by `$539D0` (never written, so
    1) and Z by `$539D2`, and translates X/Z by the instance's intra-cell origin.
    """
    word = lambda address: struct.unpack_from('>h', data, address)[0]
    cursor = start
    for group in (14, 12):
        for _ in range(4096):
            if cursor < 2:
                raise ValueError('detail extent terminator missing')
            if word(cursor - 2) < 0:
                break
            cursor -= group
        else:
            raise ValueError('detail extent terminator missing')
        cursor -= 2
    if word(cursor - 2) < 0:
        return None
    header, x_first, x_second, z_first, z_second = (word(cursor - 2 * (index + 1)) for index in range(5))
    return {'header': header, 'x': [x_first, x_second], 'z': [z_first, z_second]}


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
    wall_texts = []
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
            wall_texts.append(read_wall_text(reader, command))
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
    # $05A41A appends a wall text to the draw list straight after the queue
    # entry whose byte x 4 equals the record's own face byte x 4, so the face
    # resolves exactly as a region queue byte does.
    floor_labels, drawn_texts, wall_text_gaps = [], [], []
    for text in wall_texts:
        token = floor_label_token(data, text)
        font = text['flags'] & 0xF
        face = resolve_region_reference(
            text['face'], max(sources, default=-1) + 1, by_slot, attachment_faces
        )
        literal = not any(character & 0x80 for character in text['text'])
        if text['flags'] & 0x40:
            wall_text_gaps.append(
                f'Wall text "{wall_text_label(text)}" on queue byte {text["face"]} uses glyph '
                f'plane ${text["flags"] & 0xC0:02X}, which no wall text was seen to use; it is '
                'withheld.'
            )
        elif token is not None:
            placement = wall_text_placement(text, scale)
            floor_labels.append({
                'face': face,
                'anchor': placement['anchor'],
                'plane': placement['plane'],
                'font': font,
                'scale': placement['scale'],
                'colour': colour_value(text['colour'], palette, hardware),
                **day_colour(text['colour'], palette, hardware),
                'sourceColour': text['colour'],
                **({'fallback': dict(FONT_FALLBACK)} if font == FALLBACK_FONT else {}),
            })
        elif literal:
            characters = text['text'].decode('ascii')
            drawn_texts.append({
                'face': face,
                'text': characters,
                'font': font,
                'plane': text['flags'] & 0xC0,
                'mesh': wall_text_mesh(data, text, font, scale, palette, hardware),
                **({'fallback': {
                    **FONT_FALLBACK,
                    'mesh': wall_text_mesh(
                        data, text, FONT_FALLBACK['font'], scale, palette, hardware
                    ),
                }} if font == FALLBACK_FONT else {}),
            })
        else:
            wall_text_gaps.append(
                f'Wall text "{wall_text_label(text)}" on queue byte {text["face"]} '
                f'($059EB6) is not drawn: {wall_text_token_gap(data, text)}.'
            )
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
        # The Floor Label is one token reaching $CD04, so each record is placed
        # here and its glyph comes from the document's floorLabelGlyphs.
        **({'floorLabels': floor_labels} if floor_labels else {}),
        # Literal wall text needs no live state, so its glyphs are baked here in
        # the structure's scaled local frame.
        **({'wallTexts': drawn_texts} if drawn_texts else {}),
        # Stated in the model reason by the caller, not published here.
        'wallTextGaps': wall_text_gaps,
        # The region loop stops on the same zero selector the native walk stops
        # on at $05A26A, and $05A2FA publishes the address just past it as the
        # structure's association-list root in $7B0E. So this offset is that
        # root, derived rather than supplied.
        'associationRoot': reader.p,
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


SCENE_PALETTES = 0xD200


class ScenePalette(list):
    """A scene palette's 64 words from its base, with its day half beside them.

    ``day`` is the 64 words from the base plus ``offset``, the signed word stored at
    ``base - 2`` (``$054E24``), or None where that word is zero and the palette has one half.
    """

    def __init__(self, words: list[int], index: int, offset: int, day: list[int] | None):
        super().__init__(words)
        self.index, self.offset, self.day = index, offset, day


def scene_palette_count(data: bytes) -> int:
    """How many palettes ``$D200`` indexes: its first entry's offset is the table's own length."""
    return struct.unpack_from('>H', data, SCENE_PALETTES)[0] // 2


def palette_at(data: bytes, index: int) -> ScenePalette:
    table = SCENE_PALETTES + index * 2
    p = SCENE_PALETTES + int.from_bytes(data[table:table + 2], 'big')
    offset = struct.unpack_from('>h', data, p - 2)[0]
    day = list(struct.unpack_from('>64H', data, p + offset)) if offset else None
    return ScenePalette(list(struct.unpack_from('>64H', data, p)), index, offset, day)


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


# The refusal chooser $0542E0 and the board gate $054302-$05434F, with each operand
# the admission facts depend on masked out of the instruction check and read instead.
BOARD_GATE_START = 0x542E0
BOARD_GATE = bytes.fromhex(
    '3208 0c410004 6750 0c410038 6c4a 0c41001c 6706 7203 60000510 7216 6000050a 4e75'
    '0c7800097b42 6ef6 26387b46 67f0 0838000e7b34 67e8 2043 e44b 67e2 0c030017 64dc'
    '32387ab0 6ad6 0c7800787aa8 67ce 4a287272 6aa8 22790004bd10 d3f18000 0c518001 66b8'
    '0c2900400003 66b0'.replace(' ', ''))
BOARD_GATE_OPERANDS = {
    'unkeyed': (0x542E4, 2), 'seatable': (0x542EA, 2), 'own': (0x542F0, 2),
    'keyString': (0x542F5, 1), 'ownString': (0x542FB, 1), 'bound': (0x54321, 1),
    'keyByte': (0x54334, 2), 'mode': (0x5434A, 2),
}
# $6FAA + 4*slot is the handling byte resident_handling decodes; the key test reads the
# same array at an offset.
HANDLING_BYTES = 0x6FAA


def decode_board_gate(data: bytes) -> dict:
    """Read the board gate's admission constants from the image (#407, #408).

    `$05431E` bounds boardable slots; the chooser at `$0542E0` compares four times
    the slot (the selection longword) and loads the system string `$054808`
    presents; `$054332` tests bit 7 of `$7272 + 4*slot`, which is the handling
    byte of slot + (`$7272` - `$6FAA`) / 4; `$054348` requires the model record's
    `$8001` mode byte. See docs/research/damocles-arrival-routes.md#the-board-gate
    and docs/research/damocles-board-leave-paths.md.
    """
    window = bytearray(data[BOARD_GATE_START:BOARD_GATE_START + len(BOARD_GATE)])
    expected = bytearray(BOARD_GATE)
    for address, size in BOARD_GATE_OPERANDS.values():
        offset = address - BOARD_GATE_START
        window[offset:offset + size] = expected[offset:offset + size] = bytes(size)
    if window != expected:
        raise ValueError('not the recovered board gate at $0542E0')

    def operand(name: str) -> int:
        address, size = BOARD_GATE_OPERANDS[name]
        return int.from_bytes(data[address:address + size], 'big')

    return {
        'boardableBound': operand('bound'),
        'unkeyedSlot': operand('unkeyed') // 4,
        'seatableFrom': operand('seatable') // 4,
        'ownRefusalSlot': operand('own') // 4,
        'ownRefusal': f"system-string-{operand('ownString')}",
        'keyRefusal': f"system-string-{operand('keyString')}",
        'pairOffset': (operand('keyByte') - HANDLING_BYTES) // 4,
        'orientationMode': operand('mode'),
    }


def resident_boarding(slot: int, orientation: dict | None, gate: dict,
                      instance_ids: set[str], resident: bool) -> dict:
    """What the board gate answers for one resident slot, as a Catalogue block.

    Boardable is the gate's own two table facts, the bound and the model guard;
    the reach, region, Occupancy and VOID guards are live state, and whether the
    paired object is carried is the Carried Stack's. The chooser outcome and the
    refusal it presents are published for every slot under the bound, including
    one the model guard refuses, because the key test runs first.
    """
    bound = gate['boardableBound']
    model_guard = orientation is not None and orientation['modeByte'] == gate['orientationMode']
    block = {
        'boardable': 0 < slot < bound and model_guard, 'boardableProvenance': 'derived',
        'admission': None, 'admissionProvenance': 'derived',
        'pairedSlot': None, 'pairedInstance': None, 'pairedProvenance': 'derived',
        'refusal': None, 'refusalProvenance': 'recovered',
    }
    if slot >= bound:
        block['reason'] = (f'Slot {slot} is at or above the boardable bound {bound} ($05431E), '
                           'so the gate refuses it silently before the key test.')
        return block
    reasons = []
    if slot == gate['unkeyedSlot']:
        block['admission'] = 'unkeyed'
        reasons.append(f'The refusal chooser admits slot {slot} without a paired object ($0542E2).')
    elif slot >= gate['seatableFrom']:
        block['admission'] = 'seatable'
        reasons.append(f"The refusal chooser admits slots {gate['seatableFrom']} and above as "
                       'seatable objects without a paired object ($0542E8).')
    else:
        paired = slot + gate['pairOffset']
        instance = f'object-slot-{paired}'
        refusal = gate['ownRefusal'] if slot == gate['ownRefusalSlot'] else gate['keyRefusal']
        block.update(admission='paired', pairedSlot=paired, refusal=refusal,
                     pairedInstance=instance if instance in instance_ids else None)
        reasons.append(f'The key test admits it only while slot {paired} is carried ($054332); '
                       f'otherwise the chooser refuses with {refusal} ($0542E0).')
        if block['pairedInstance'] is None:
            reasons.append(f'Slot {paired} holds no resident instance, so the paired object is '
                           'missing and the key test cannot pass.')
    if model_guard:
        reasons.append('Its model opens with the single-Y-turn orientation command, so the '
                       'model guard admits it ($054338).')
    else:
        reasons.append('Its model does not open with the single-Y-turn orientation command, so '
                       'the model guard refuses it silently whatever else holds ($054338).')
    if not resident:
        reasons.append('No residence is resolved for it, so play cannot reach it.')
    block['reason'] = ' '.join(reasons)
    return block


# The Craft Parameter Block table and the craft pass's constants (#549, #550, #555). Each
# constant is an instruction's operand: the instruction is checked with its operand masked,
# and the operand is read, as the board gate's are. Addresses are the instruction's own.
CRAFT_TABLE = 0x55C80
CRAFT_SLOTS = 16
CRAFT_ENTRY = 32
CRAFT_ROUTINES = {0x5872E: 'space', 0x57F46: 'flying', 0x57DE6: 'wheeled', 0x57D64: 'fall'}
CRAFT_INSTRUCTIONS = {
    # name: (address, instruction, operand offset, operand size, signed)
    'table': (0x57CE8, 'd1fc00055c80', 2, 4, False),
    'zero': (0x54744, '21fcff0010007bac', 2, 4, False),
    'throttleDouble': (0x57FEC, '068100010000', 2, 4, False),
    'altitudeScale': (0x57FF8, '048300100000', 2, 4, False),
    'altitudeCap': (0x58000, '0c8300051000', 2, 4, False),
    'altitudeCapStore': (0x58008, '263c00051000', 2, 4, False),
    'contactQuarter': (0x58032, '048100020000', 2, 4, False),
    'pitchMask': (0x57FD2, '027803ff7ac0', 2, 2, False),
    'groundY': (0x582AE, '0cb8000000407ab6', 2, 4, True),
    'supported': (0x582C0, '31fc003f7bc8', 2, 2, False),
    'supportEye': (0x582CC, '0678003f7ab8', 2, 2, False),
    'landingStep': (0x582D8, '0c83ffffff9c', 2, 4, True),
    'landingPitch': (0x582E8, '0c0300a0', 3, 1, False),
    'groundEye': (0x582F0, '21fc0000003f7ab6', 2, 4, True),
    'contact': (0x582F8, '31fc003f7aca', 2, 2, False),
    'levelPitch': (0x58304, '0c7801ff7ac0', 2, 2, False),
    'levelPitchStore': (0x58318, '31fc01ff7ac0', 2, 2, False),
    'takeOff': (0x58310, '0c810004ffff', 2, 4, False),
    'verticalLow': (0x58336, '0c400080', 2, 2, False),
    'verticalHigh': (0x5833C, '0c400180', 2, 2, False),
    'wheeledDrop': (0x57DF0, '04b8000000407a30', 2, 4, False),
    'spaceEntry': (0x5976A, '0c7801f07a30', 2, 2, False),
    'collisionExponent': (0x59750, '31fcfff07bac', 2, 2, False),
    'throttleTable': (0x556BA, '207c000557d6', 2, 4, False),
    'throttleKeyBound': (0x556C4, '0c400044', 2, 2, False),
    'throttleDown': (0x5576E, '223cffff1f80', 2, 4, False),
    'throttleUp': (0x557A8, '223c00001080', 2, 4, False),
    'throttleCap': (0x557C2, '0c80000e0000', 2, 4, False),
}
# Two instructions the pass runs twice, once to compare and once to store: they must agree.
CRAFT_PAIRED = {'altitudeCapStore': 'altitudeCap', 'levelPitchStore': 'levelPitch'}
# The pass's two tables, indexed through a6 and a5 (#549). The exponent table is 2,048 words a
# sign; the sine table is 1,024 floats. Neither is regenerated bit for bit by a formula (the
# ST's own rounding differs at four exponent entries and eleven sines), so both are carried.
CRAFT_EXP_TABLE = (0x60000, 0x62000)
CRAFT_SINE_TABLE = (0x64000, 0x65000)
# The log table is read at $64000 plus the signed mantissa, so a normalised mantissa reads
# $62000-$63000 (negative) or $65000-$65FFE (positive). It is regenerated by craft_log_table.
CRAFT_LOG_RANGES = ((0x62000, 0x63002), (0x65000, 0x66000))


def craft_log_table() -> dict[int, int]:
    """The log table by address: log2 of the mantissa as a 12-bit fraction in the top twelve
    bits, capped below 1.0, with bit 0 the mantissa's sign. The port generates it from this rule,
    and extraction checks the image against it."""
    table = {}
    for mantissa in range(0x1000, 0x2002, 2):
        fraction = min(math.floor(math.log2(mantissa / 4096) * 4096 + 0.5), 4095) << 4
        if mantissa < 0x2000:
            table[0x64000 + mantissa] = fraction
        table[0x64000 - mantissa] = fraction | 1
    return table


def _craft_operand(data: bytes, name: str) -> int:
    address, instruction, offset, size, signed = CRAFT_INSTRUCTIONS[name]
    expected = bytearray.fromhex(instruction)
    window = bytearray(data[address:address + len(expected)])
    window[offset:offset + size] = expected[offset:offset + size] = bytes(size)
    if window != expected:
        raise ValueError(f'not the recovered craft instruction {name} at ${address:06X}')
    return int.from_bytes(data[address + offset:address + offset + size], 'big', signed=signed)


def decode_craft(data: bytes) -> dict:
    """Every slot's Craft Parameter Block, the craft pass's constants and its tables (#555).

    `$057CE8` jumps into the slot's 32-byte entry at `$055C80`, which opens with a `bra.w` to
    the slot's routine and carries the parameters the routine reads through `a0`. The flying,
    wheeled and space routines read the same seven words; the slot-9 fall reads four of its
    own. See docs/research/damocles-craft-control.md and ADR 0051.
    """
    constants = {name: {'address': spec[0], 'operand': _craft_operand(data, name)}
                 for name, spec in CRAFT_INSTRUCTIONS.items() if name not in CRAFT_PAIRED}
    for name, pair in CRAFT_PAIRED.items():
        if _craft_operand(data, name) != constants[pair]['operand']:
            raise ValueError(f'craft instructions {pair} and {name} disagree')
    table = constants.pop('table')['operand']
    throttle_table = constants.pop('throttleTable')['operand']

    def u16(address: int) -> int:
        return int.from_bytes(data[address:address + 2], 'big')

    def s16(address: int) -> int:
        return int.from_bytes(data[address:address + 2], 'big', signed=True)

    def u32(address: int) -> int:
        return int.from_bytes(data[address:address + 4], 'big')

    slots = []
    for slot in range(CRAFT_SLOTS):
        base = table + slot * CRAFT_ENTRY
        if u16(base) != 0x6000:
            raise ValueError(f'craft slot {slot} does not open with bra.w')
        routine = base + 2 + s16(base + 2)
        if routine not in CRAFT_ROUTINES:
            raise ValueError(f'craft slot {slot} branches to an unrecovered routine ${routine:06X}')
        kind = CRAFT_ROUTINES[routine]
        entry = {'slot': slot, 'routine': routine, 'class': kind}
        if kind == 'fall':
            entry['fall'] = {'yStep': u32(base + 4), 'tumbleStep': s16(base + 8),
                             'pitchStep': s16(base + 0xA), 'yawStep': s16(base + 0xC)}
        else:
            entry['parameters'] = {
                'turnDamping': u32(base + 4), 'turnAcceleration': u32(base + 8),
                'pitchStep': s16(base + 0xC), 'rollExponent': s16(base + 0xE),
                'speedLag': u32(base + 0x14), 'ceiling': s16(base + 0x1A),
                'thrustGain': u32(base + 0x1C),
            }
        slots.append(entry)
    bound = constants['throttleKeyBound']['operand']
    keys = [{'scancode': code, 'entry': data[throttle_table + code]}
            for code in range(bound + 1) if data[throttle_table + code]]
    for address, value in craft_log_table().items():
        if u16(address) != value:
            raise ValueError(f'the log table at ${address:06X} is not the recovered rule')
    log = b''.join(data[start:end] for start, end in CRAFT_LOG_RANGES)

    def carried(bounds: tuple[int, int]) -> dict:
        start, end = bounds
        return {'address': start, 'hex': data[start:end].hex(),
                'sha256': hashlib.sha256(data[start:end]).hexdigest()}

    return {
        'evidence': 'docs/research/damocles-craft-control.md',
        'table': {'address': table, 'sha256': hashlib.sha256(
            data[table:table + CRAFT_SLOTS * CRAFT_ENTRY]).hexdigest()},
        'slots': slots,
        'constants': constants,
        'throttleKeys': {'address': throttle_table, 'keys': keys},
        'arithmetic': {
            'exp': carried(CRAFT_EXP_TABLE),
            'sine': carried(CRAFT_SINE_TABLE),
            'log': {'generated': True, 'ranges': [list(r) for r in CRAFT_LOG_RANGES],
                    'sha256': hashlib.sha256(log).hexdigest()},
        },
    }


def resident_placement_class(association_a: bytes) -> int | None:
    """Decode the placement class the drop handler writes and the draw pass reads.

    Association A byte 3 ($6FAB + 4*slot) is mutable placement state, not an
    identity: direct placement copies $7A39 over it at $0546FC, support
    placement inherits the support's, and the bulk reclassifier at $059040
    recomputes it for a run of slots. $7A39 is itself derived -- see
    docs/research/damocles-placement-class.md -- so this is the authored value
    the pinned capture holds, which a session departs from as objects move. It
    is *not* the handling byte's low nibble: the two disagree for 176 of the
    241 resident slots.
    """
    if len(association_a) != 4:
        return None
    return association_a[3]


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


def decode_structure_associations(data: bytes, start: int) -> dict[int, list[dict]]:
    """Decode a zero-terminated list of insertion-group records.

    A group may name one region twice: $52D24 copies the pairs verbatim and the
    queue assembler at $5A3DE inserts once for every pair whose region matches,
    so both are kept in order. Eris slot 209's structure (root $18824) authors
    region $0E twice in group $13.
    """
    reader = Reader(data, start)
    groups: dict[int, list[dict]] = {}
    for _ in range(256):
        if reader.p >= len(data):
            raise ValueError('structure association list terminator missing')
        selector = reader.take(1)[0]
        if selector == 0:
            return groups
        if selector in groups:
            raise ValueError(f'duplicate insertion group ${selector:02X}')
        insertions = []
        for _ in range(256):
            if reader.p >= len(data):
                raise ValueError('structure association group terminator missing')
            region = reader.take(1)[0]
            if region == 0:
                break
            if reader.p >= len(data):
                raise ValueError(f'structure association group ${selector:02X} insertion key missing')
            insertion = reader.take(1)[0]
            insertions.append({
                'regionSelector': region,
                'insertionKey': insertion,
            })
        else:
            raise ValueError('structure association group terminator missing')
        groups[selector] = insertions
    raise ValueError('structure association list limit exceeded')


def resident_local_position(data: bytes, slot: int, structure_origin: tuple[int, int, int],
                            coordinate_arrays: tuple[int, int, int] = (0x63a8, 0x67a8, 0x6ba8)) -> list[int]:
    """Transform authored resident coordinates into a structure-local frame."""
    return [s32(data, base + slot * 4) - structure_origin[axis]
            for axis, base in enumerate(coordinate_arrays)]


def walk_group_record(data: bytes, group: int) -> tuple[int, dict[int, dict], int]:
    """Walk one authored structure-group map, as $04EB60 builds it.

    The record is a run-length cell-extent stream, two workspace bytes, six
    source-reference selectors, then the cell-override list the consumer at
    $054CB0 reads. An override's word has the structure slot in its low nine
    bits -- bit 8 is bit 0 of the high byte, which is why $054D44 masks nine --
    and bits 1-7 of the high byte are a scene selector. Offsets are signed and
    scale by the word at $04BD14. The place list the workspace loader publishes
    at $7A6C follows the override terminator.

    Returns the record address, its cell overrides, and that place-list address.
    """
    root = 0x1e000 + struct.unpack_from('>H', data, 0x1e64c)[0]
    if root + group * 2 + 2 > len(data):
        raise ValueError('structure-group table is outside this capture')
    group_record = root + struct.unpack_from('>H', data, root + group * 2)[0]
    cursor = group_record + 2
    limit = min(len(data), cursor + (1 << 16))
    for _ in range(256):
        if cursor >= limit:
            raise ValueError('structure-group extent stream is unterminated')
        if not data[cursor]:
            break
        cursor += 3
    else:
        raise ValueError('structure-group extent stream terminator missing')
    cursor += 1 + 2 + 6
    overrides: dict[int, dict] = {}
    while True:
        if cursor + 3 > limit:
            raise ValueError('structure-group override list is unterminated')
        if data[cursor] == 0xff:
            cursor += 1
            break
        source_ref, cell, low = data[cursor], data[cursor + 1], data[cursor + 2]
        record = cursor
        cursor += 3
        if len(overrides) > 256:
            raise ValueError('structure-group override list limit exceeded')
        if low == 0:
            overrides[cell] = {'cell': cell, 'sourceRef': source_ref, 'slot': None,
                               'address': record}
            continue
        if cursor + 3 > limit:
            raise ValueError('structure-group override record truncated')
        high = data[cursor]
        dx, dz = struct.unpack_from('>bb', data, cursor + 1)
        cursor += 3
        overrides[cell] = {
            'cell': cell, 'sourceRef': source_ref, 'address': record,
            'word': (high << 8) | low, 'slot': ((high << 8) | low) & 0x1ff,
            'sceneSelector': high & 0xfe, 'dx': dx, 'dz': dz,
        }
    return group_record, overrides, cursor


def decode_group_overrides(data: bytes, group: int) -> dict[int, dict]:
    """The authored cell instances of one structure-group map."""
    return walk_group_record(data, group)[1]


# The per-body island-record list. $0592E8 indexes the table the longword at
# $04BD1E points at by half the body selector and publishes the list in $7A16;
# $056464 and $04EB46 then read one record's origin, coastline, group and
# colour. See docs/research/damocles-eris-islands.md.
ISLAND_TABLE_POINTER = 0x4BD1E
ISLAND_TERMINATOR = 0x8000
ISLAND_RECORD_BYTES = 10
# Body slots $00-$1D. Slot 30 is the VOID sentinel, which is space rather than a
# surface; its table entry is excluded from the census for that reason.
SURFACE_BODIES = 30
# $058F64 masks the body position to twelve bits on both axes, so a body surface
# is a 4096 x 4096 Surface Cell torus rather than a bounded plane.
SURFACE_CELLS = 0x1000
BODY_COLOUR_TABLE = 0x60C0
# Every surface position the catalogue publishes is a Body Coordinate: Surface
# Cells from the body's own origin, on a surface that wraps. The island record a
# Structure Workspace origin came from is named alongside it; the position is a
# Body Coordinate either way, never an Island-Local Cell.
BODY_COORDINATES = 'Body Coordinates'
ISLAND_EVIDENCE = 'docs/research/damocles-eris-islands.md'
ISLAND_CENSUS_EVIDENCE = 'docs/research/damocles-island-census.md'


BODY_SKY_TABLE = 0x85DC
BODY_ROTATION_RATES = 0x835C


def body_sky(data: bytes, body: int) -> dict:
    """The body's two authored sky colours, night then day, at $85DC + 4*body.

    $0592BC/$0592C2 copy them into $7948 and $7946 when the body is entered, and
    the terminator at $050562 puts one of them in $7C86 each frame, which
    $059638 writes into colour 8 of the viewport fill outside an enclosed region.
    """
    night, day = struct.unpack_from('>HH', data, BODY_SKY_TABLE + body * 4)
    return {'day': {'colour': st_rgb(day & 0xFFF), 'sourceColour': day},
            'night': {'colour': st_rgb(night & 0xFFF), 'sourceColour': night}}


def body_rotation_rate(data: bytes, body: int) -> int:
    """What the VBL handler adds to the body's rotation accumulator at $62EA + 4*body.

    The table at $835C is the authored rate at $82DC shifted right six bits. The
    accumulator's high word's low ten bits are the angle the surface passes add to
    the observer's longitude, so one turn is $04000000
    (docs/research/damocles-gamma-system.md).
    """
    return struct.unpack_from('>I', data, BODY_ROTATION_RATES + body * 4)[0]


def body_base_colour(data: bytes, body: int) -> int:
    """The body's own base colour: the low word of $0060C0 + 4*body.

    $0592AC-$0592B4 masks it to twelve bits into $7C88, which is the colour the
    surface is drawn in wherever no island is painted over it -- the sea on a
    body that has coastlines, and the whole surface on a body that has none.
    """
    return struct.unpack_from('>H', data, BODY_COLOUR_TABLE + body * 4 + 2)[0] & 0xFFF


def decode_island_coastline(data: bytes, start: int) -> dict:
    """One coastline definition: its vertices, its boxes and its edge words.

    The vertex list runs forward from `start` as signed island-local word pairs
    to an $8000 terminator. Everything the classifier at $0560F2 tests is stored
    immediately before it and read backwards, four words to a box, in the order
    [zmax, zmin, xmax, xmin]: box 0 is the island's extent, box 1 its core, and
    boxes 2..n are exclusions. $05612A reads box 0 and box 1 unconditionally and
    only the walk at $05618A tests the $8000 sentinel in the next slot's xmin
    field, so the shared coastline-less stub -- whose first two boxes are both
    the whole coordinate plane -- still has both. The edge words $0561CE scans
    sit below that sentinel, one per coastline edge, read backwards to a zero.
    """
    vertices = []
    cursor = start
    for _ in range(257):
        if cursor + 2 > len(data):
            raise ValueError('island coastline vertex list is unterminated')
        if struct.unpack_from('>H', data, cursor)[0] == ISLAND_TERMINATOR:
            break
        vertices.append(list(struct.unpack_from('>hh', data, cursor)))
        cursor += 4
    else:
        raise ValueError('island coastline vertex list limit exceeded')
    boxes = []
    for index in range(66):
        base = start - 8 * (index + 1)
        if base < 0:
            raise ValueError('island box list runs off the capture')
        zmax, zmin, xmax, xmin = struct.unpack_from('>hhhh', data, base)
        if index >= 2 and (xmin & 0xFFFF) == ISLAND_TERMINATOR:
            terminator = base + 6
            break
        boxes.append({
            'kind': ('extent', 'core')[index] if index < 2 else 'exclusion',
            'sourceAddress': base,
            'x': [xmin, xmax],
            'z': [zmin, zmax],
        })
    else:
        raise ValueError('island box list limit exceeded')
    edges = []
    cursor = terminator - 2
    for _ in range(257):
        if cursor < 0:
            raise ValueError('island edge list runs off the capture')
        word = struct.unpack_from('>H', data, cursor)[0]
        if not word:
            break
        edges.append(word)
        cursor -= 2
    else:
        raise ValueError('island edge list limit exceeded')
    if len(edges) != len(vertices):
        raise ValueError('island edge list is not the closed cycle of its vertices')
    return {'sourceAddress': start, 'vertices': vertices, 'edges': edges, 'boxes': boxes}


def decode_island_records(data: bytes, body: int) -> list[dict]:
    """The ten-byte island records of one body, in list order.

    Each is an origin in whole Surface Cells at +0/+2, a signed offset to its
    coastline definition at +4, the structure group it binds at +6 and its land
    colour at +8. The list ends at an $8000 origin x.
    """
    root = u32(data, ISLAND_TABLE_POINTER)
    if root + body * 2 + 2 > len(data):
        raise ValueError('island-record table is outside this capture')
    cursor = root + struct.unpack_from('>h', data, root + body * 2)[0]
    records = []
    for _ in range(65):
        if cursor < 0 or cursor + ISLAND_RECORD_BYTES > len(data):
            raise ValueError('island-record list runs off the capture')
        if struct.unpack_from('>H', data, cursor)[0] == ISLAND_TERMINATOR:
            return records
        x, z, offset, group, colour = struct.unpack_from('>hhhHH', data, cursor)
        records.append({
            'sourceAddress': cursor,
            'sourceOrigin': [x, z],
            'origin': [x % SURFACE_CELLS, z % SURFACE_CELLS],
            'coastline': decode_island_coastline(data, cursor + offset),
            'structureGroup': group,
            'sourceLandColour': colour,
        })
        cursor += ISLAND_RECORD_BYTES
    raise ValueError('island-record list limit exceeded')


def island_body_extent(origin: list[int], box: dict) -> dict:
    """One island's extent in body cells, wrapped onto the 4096-cell torus.

    An upper bound below its lower bound is a wrapped span, not an empty one:
    Eris's Snow Island and four of Lucan's twelve cross the seam. A box wider
    than the surface is the coastline-less stub's whole coordinate plane, which
    covers every cell on that axis and so has no meaningful wrap.
    """
    bounds = {}
    for index, axis in enumerate(('x', 'z')):
        low, high = box[axis]
        if high - low >= SURFACE_CELLS:
            bounds[axis] = ([0, SURFACE_CELLS], False)
            continue
        span = [(origin[index] + bound) % SURFACE_CELLS for bound in (low, high)]
        bounds[axis] = (span, span[1] <= span[0])
    return {
        'x': bounds['x'][0],
        'z': bounds['z'][0],
        'wrapsX': bounds['x'][1],
        'wrapsZ': bounds['z'][1],
        'coversSurface': bounds['x'][0] == bounds['z'][0] == [0, SURFACE_CELLS],
    }


def decode_islands(data: bytes, bodies: list) -> list[dict]:
    """Every island record on every body surface, one catalogue entry each."""
    islands = []
    for body in range(SURFACE_BODIES):
        slug = re.sub(r'[^a-z0-9]+', '-', bodies[body]['name'].lower()).strip('-')
        for record in decode_island_records(data, body):
            group = record['structureGroup']
            workspace, area_name = None, None
            if group:
                try:
                    workspace, _overrides, place_list = walk_group_record(data, group)
                    area_name = decode_named_area(data, place_list)['name'] or None
                except (ValueError, struct.error):
                    # A group whose place list carries no source text names no
                    # area; Lucan's twelve are the attested case.
                    area_name = None
            coastline = record['coastline']
            boxes = coastline.pop('boxes')
            islands.append({
                'id': f"island-{slug}-{record['sourceAddress']:06x}",
                'body': f'body-{body}',
                'sourceAddress': record['sourceAddress'],
                'origin': record['origin'],
                'sourceOrigin': record['sourceOrigin'],
                'coastline': coastline,
                'boxes': boxes,
                'extent': island_body_extent(record['origin'], boxes[0]),
                'landColour': st_rgb(record['sourceLandColour']),
                'sourceLandColour': record['sourceLandColour'],
                'structureGroup': group,
                'workspace': workspace,
                'areaName': area_name,
                'reason': (
                    'Coastline-less record: it shares the stub whose extent and core boxes '
                    'are the whole coordinate plane, so $0560F2 answers core everywhere on '
                    'this body -- land, no sea, no coast.'
                    if not coastline['vertices'] else
                    'Island record: origin, coastline polygon, structure group and land '
                    'colour as $04EB46 publishes them. The record carries no name of its '
                    "own; areaName is the bound group's area name."
                ),
            })
    return islands


def island_by_origin(islands: list[dict], body: int, x: int, z: int) -> dict | None:
    """The island record a body-local workspace origin came from, if one has it."""
    return next(
        (island for island in islands
         if island['body'] == f'body-{body}'
         and island['origin'] == [x % SURFACE_CELLS, z % SURFACE_CELLS]),
        None,
    )


# Settlement road networks. $04EC30-$04EC92 turns the structure group's
# run-length extent grid at $01E000 into the per-cell ground selection: for each
# of the 256 cells it reads the cell's row-run start/end and column-run
# start/end, builds a six-bit class from them, looks that class up in the
# 64-byte table at $01E600, stores the answer in $0083DC + cell, and uses
# (class >> 3) & $E to pick one of the group's six road-piece selectors at
# $01E640. The runs are one-cell-wide road lines; the coastline is the island
# record's polygon and nothing else (docs/research/damocles-eris-islands.md).
ROAD_RUN_GRID = 0x1E000
ROAD_CLASS_TABLE = 0x1E600
ROAD_PIECE_SELECTORS = 0x1E640
# The six selectors in the order $04EC22 copies them out of the group's stream.
# Which piece each index is follows from the classes that reach it: piece 0 is
# the cells with no run at all, 1 the classes where the cell caps one run, 2 the
# classes where it caps both, 3 the classes where it lies inside one run, 4 the
# classes where it lies inside one and caps the other, and 5 the single class
# where it lies inside both.
ROAD_PIECES = ('none', 'end', 'corner', 'straight', 'tee', 'crossroads')


# The group-offset root, and the master selector table the six per-group
# indices index. $04EB6A reaches the root through the word at $1E64C; the
# selector words at $1E640..$1E64A are copied from $1E64E by $04EC22.
ROAD_GROUP_ROOT = 0x1E64C
ROAD_SELECTOR_TABLE = 0x1E64E


def expand_run_grid(data: bytes, group: int) -> tuple[bytes, list[int]]:
    """Replay $04EB60-$04EC2C: one group's authored stream into its run grid.

    The run grid at $01E000 is *built*, not authored: the workspace loader
    expands a run-length extent stream held in the group's own record. That
    record is in the program image for every group, so the grid a capture would
    have shown can be reconstructed without one -- which is the only reason a
    group nobody has stood in can publish a road network at all.

    Each run is three bytes. A zero first byte ends the stream; bit 7 set means
    the column form at $04EBDE, where the byte is the one's complement of the
    column, and otherwise the row form at $04EBB6, where it is the 1-based row.
    The remaining two bytes are the run's first and last cell along that axis,
    and every cell the run covers stores the pair -- rows in bytes 0-1 and
    columns in bytes 2-3, which is what `road_cell_class` reads back.

    Returns the 1 KiB grid and the six road-piece selector words.
    """
    grid, selectors, _cursor = _expand_group_stream(data, group)
    return grid, selectors


def _expand_group_stream(data: bytes, group: int) -> tuple[bytes, list[int], int]:
    """`expand_run_grid`, and where the group's placement stream starts after it."""
    root = ROAD_RUN_GRID + struct.unpack_from('>H', data, ROAD_GROUP_ROOT)[0]
    cursor = root + struct.unpack_from('>H', data, root + group * 2)[0] + 2
    grid = bytearray(1024)
    while True:
        first = data[cursor]
        cursor += 1
        if first == 0:
            break
        start, end = data[cursor], data[cursor + 1]
        cursor += 2
        if first & 0x80:
            column = (~first) & 0xFF
            # $04EBE8 shifts and adds as *bytes*, so both wrap at 256.
            run_start = (((start << 4) & 0xFF) + column) & 0xFF
            run_end = (((end << 4) & 0xFF) + column) & 0xFF
            for step in range(end - start + 1):
                cell = (run_start + step * 16) & 0xFF
                grid[cell * 4 + 2] = run_start
                grid[cell * 4 + 3] = run_end
        else:
            base = ((first - 1) << 4) & 0xFF
            run_start, run_end = (base + start) & 0xFF, (base + end) & 0xFF
            for cell in range(run_start, run_end + 1):
                grid[cell * 4 + 0] = run_start
                grid[cell * 4 + 1] = run_end
    # $04EC0E takes the $7AEE/$7AEF pair, then six selector indices.
    cursor += 2
    selectors = [
        struct.unpack_from('>H', data, ROAD_SELECTOR_TABLE + data[cursor + index] * 2)[0]
        for index in range(6)
    ]
    return bytes(grid), selectors, cursor + 6


def load_structure_workspace(data: bytes, group: int) -> bytes:
    """Replay $04EB60-$04ED12: the workspace the loader builds for one group.

    Everything a cell's Drawn Record depends on is written by this one pass over
    the group's authored stream, so a group nobody has stood in can be loaded
    from the program image the way the game loads it:

    - the run grid at $01E000, which is also the scene-seed table $05493E reads;
    - the six selectors at $01E640 and, through the classifier at $04EC30, the
      $0083DC orientation byte and the $01E400 Selected Piece of every cell;
    - the placement loop at $04ECAA, which continues the same stream. Each entry
      is a master-table index and a cell, then the $ABDC structure slot and, when
      that is nonzero, its key byte and dx/dz. $04ECEE-$04ED0E then replaces the
      cell's $01E400 word with the placement's own record when the two records'
      first bytes share a high nybble; when they do not, `bne.w $05097A` lands on
      an `rts` and the loader gives up, so that is an error and not a rule.

    The record bank the words index is resident: past the six selector words, a
    capture's $01E64E onwards is the program image's. The pass after $04ED14
    (the named-area pointer and the $6364 state overlay on $ABDC) is left out:
    neither writes anything the ground decoder reads.

    Returns a copy of `data` with those tables written.
    """
    grid, selectors, cursor = _expand_group_stream(data, group)
    workspace = bytearray(data)
    struct.pack_into('>H', workspace, 0x794E, group)
    workspace[ROAD_RUN_GRID:ROAD_RUN_GRID + 1024] = grid
    workspace[0x7AEE:0x7AF0] = data[cursor - 8:cursor - 6]
    struct.pack_into('>6H', workspace, ROAD_PIECE_SELECTORS, *selectors)
    for cell in range(256):
        orientation = data[ROAD_CLASS_TABLE + grid_cell_class(grid[cell * 4:cell * 4 + 4], cell)]
        workspace[0x83DC + cell] = orientation
        struct.pack_into('>H', workspace, 0x1E400 + cell * 2,
                         selectors[((orientation >> 3) & 0xE) // 2])
    workspace[0xABDC:0xABDC + 1024] = bytes(1024)
    for _ in range(1024):
        index = data[cursor]
        if index == 0xFF:
            break
        cell, slot = data[cursor + 1], data[cursor + 2]
        cursor += 3
        workspace[0xABDC + cell * 4 + 1] = slot
        if slot:
            workspace[0xABDC + cell * 4] = data[cursor]
            workspace[0xABDC + cell * 4 + 2:0xABDC + cell * 4 + 4] = data[cursor + 1:cursor + 3]
            cursor += 3
        selected = struct.unpack_from('>H', workspace, 0x1E400 + cell * 2)[0]
        placed = struct.unpack_from('>H', data, ROAD_SELECTOR_TABLE + index * 2)[0]
        if (data[ROAD_RUN_GRID + selected] ^ data[ROAD_RUN_GRID + placed]) & 0xF0:
            raise ValueError(
                f'group ${group:02X} cell ${cell:02X} places record ${placed:04X} over '
                f'${selected:04X} of another record class; the loader returns there'
            )
        struct.pack_into('>H', workspace, 0x1E400 + cell * 2, placed)
    else:
        raise ValueError(f'group ${group:02X} placement stream terminator missing')
    return bytes(workspace)


def road_cell_class(data: bytes, cell: int) -> int:
    """The six-bit class $04EC4C-$04EC7C builds from one cell's run longword."""
    return grid_cell_class(
        data[ROAD_RUN_GRID + cell * 4:ROAD_RUN_GRID + cell * 4 + 4], cell)


def grid_cell_class(entry: bytes, cell: int) -> int:
    """The same class, from one cell's four grid bytes on their own.

    The run endpoints the entry carries are absolute cell indices, so the class
    needs the cell they belong to: the bits say whether this cell is the run's
    start, its end, or inside it.
    """
    row_start, row_end, column_start, column_end = entry
    value = 0
    if row_end:
        value |= 1
        if row_end != cell:
            value |= 2
        if row_start != cell:
            value |= 4
    if column_end:
        value |= 8
        if column_start != cell:
            value |= 0x10
        if column_end != cell:
            value |= 0x20
    return value


def decode_road_network(data: bytes, ground_models: dict[int, str], identity: str,
                        body: int, origin: tuple[int, int], island: dict | None,
                        label: str, source: str, *,
                        grid: bytes, selectors: list[int],
                        cell_index: bytes | None,
                        live_orientations: bytes | None) -> dict:
    """Recover one structure group's road network from its run grid.

    The grid is supplied rather than read from `data`, because it has two
    sources. A capture standing in the workspace carries the live one the
    loader built at $01E000; every other group's is reconstructed from its
    authored stream by `expand_run_grid`. The classification is identical
    either way -- $01E600 is resident, not per-group -- and only the
    provenance differs.

    Where the grid is live, replaying $04EC30 is self-checking: the same pass
    writes the orientation byte the ground decoder reads from $0083DC, so a
    decode that disagrees with the live table is wrong about the grid, and the
    reconstruction raises rather than publishing it. Where the grid is
    reconstructed there is no live table to check against; what stands behind
    it is that the same expansion reproduces $01E000 byte for byte on every
    capture that does bind a group.
    """
    orientations = bytearray(256)
    selections = []
    cells = []
    for cell in range(256):
        class_bits = grid_cell_class(grid[cell * 4:cell * 4 + 4], cell)
        orientation = data[ROAD_CLASS_TABLE + class_bits]
        orientations[cell] = orientation
        offset = (orientation >> 3) & 0xE
        selections.append(selectors[offset // 2])
        if not class_bits:
            continue
        piece = offset // 2
        # $054E40 reads the same byte as a transform, so the low nybble is the
        # piece's rotation in quarter turns.
        cells.append({
            'cell': cell,
            'model': ground_models.get(cell),
            # $04ECEE-$04ED0E lets a placement in the group's stream replace the
            # classifier's choice with its own record when the two share a
            # record class, so the drawn record is not always the road piece.
            # The replacement is in a live $1E400 or `load_structure_workspace`'s
            # replay of one; given neither, the question is unanswered.
            'overridden': None if cell_index is None else (
                struct.unpack_from('>H', cell_index, cell * 2)[0] != selections[cell]
            ),
            'piece': piece,
            'pieceName': ROAD_PIECES[piece],
            'recordAddress': ROAD_RUN_GRID + selections[cell],
            'rotation': orientation & 7,
            'sourceClass': class_bits,
            'x': cell & 15,
            'z': cell >> 4,
        })
    if live_orientations is not None and bytes(orientations) != live_orientations:
        raise ValueError(
            f'{label} road classification disagrees with the live $83DC orientation table'
        )
    # The runs are the network's lines: $05493E hands the same four bytes to the
    # ground-extent slots, and $054AD2 draws each surviving pair as one
    # two-point edge, which is the network the aerial view shows.
    runs = set()
    for cell in range(256):
        row_start, row_end, column_start, column_end = grid[cell * 4:cell * 4 + 4]
        if row_end:
            runs.add(('x', row_start, row_end))
        if column_end:
            runs.add(('z', column_start, column_end))
    return {
        'id': identity,
        'body': f'body-{body}',
        'cells': cells,
        'classTableAddress': ROAD_CLASS_TABLE,
        'attestation': 'capture' if live_orientations is not None else 'image',
        'evidence': [{
            'claim': (
                "Structure group run-length extent grid at $01E000 classified by "
                "$04EC30-$04EC92 into the $01E600 table's orientation byte and one of "
                "the six road-piece selectors at $01E640. The replay reproduces this "
                "capture's live $0083DC orientation table for all 256 cells."
            ) if live_orientations is not None else (
                "Structure group run-length extent stream expanded by $04EB60-$04EC2C "
                "into the $01E000 run grid, then classified by $04EC30-$04EC92 into the "
                "$01E600 table's orientation byte and one of the six road-piece "
                "selectors at $01E640, and the placement loop at $04ECAA-$04ED12 "
                "replayed over it for each cell's Drawn Record. No capture stands in "
                "this workspace, so there is no live $0083DC to check against; the "
                "replay reproduces $01E000, $0083DC and $01E400 on every capture that "
                "does bind a group."
            ),
            # Verified either way: what differs is whether this group was seen
            # live, which `attestation` carries, not whether the decode holds.
            'confidence': 'verified',
            'source': source,
        }],
        'island': island['id'] if island else None,
        'origin': [origin[0], origin[1]],
        'pieces': [{
            'index': index,
            'name': ROAD_PIECES[index],
            # The group's own six, not whichever group `data` happens to have
            # loaded: one Settlement's straight is a runway and another's a lane.
            'recordAddress': ROAD_RUN_GRID + selectors[index],
        } for index in range(6)],
        'reason': (
            f'{label} road network: {len(cells)} of 256 cells carry a run and '
            f'{len(runs)} runs make up the network. Cell positions are '
            'workspace-local; origin places the 16x16 on the body surface.'
        ),
        'runs': [{
            'axis': axis,
            'end': [end & 15, end >> 4],
            'start': [start & 15, start >> 4],
        } for axis, start, end in sorted(runs)],
        'sourceAddress': ROAD_RUN_GRID,
    }


def decode_support_top(data: bytes, start: int) -> int | None:
    """The drop handler's $0545DE-$054610 form gate and raw-Y maximum.

    This is not the renderer's decoded mesh: labels, articulated vertices and
    conditional forms must not change the support height the native handler sees.
    None denotes its model-form refusal, not a missing mesh.
    """
    reader = Reader(data, start)
    opening = reader.signed()
    if opening <= -32753:  # signed comparison with $800F
        command = opening & 0xff
        if command not in (6, 9, 10):
            return None
        if command == 10:
            reader.p += 4
            offset = reader.signed()
            reader.p += offset - 4
        reader.p += 4
    maximum = 0
    for _ in range(65_536):
        maximum = max(maximum, reader.signed())
        reader.p += 2  # Z
        if reader.word() == 0x8000:  # next X, or vertex terminator
            return maximum
    raise ValueError('drop support vertex terminator missing')


def decode_instance_orientation(data: bytes, start: int) -> dict | None:
    """The `$8001` orientation command the draw path applies to every instance.

    `$053528` stores the command's first byte in `$53422` and its second in
    `$5342A`; `$0535A2` clears `$5342A` before each record, so a model without
    `$8001` never turns. The vertex loop at `$0536F6` reads the second byte:
    zero draws the record unturned, bit 7 takes the articulation path at
    `$0537B0`, bit 6 takes the single Y turn at `$05388E`, and any other value
    turns by the live camera angles at `$7ABE`/`$7AC0`/`$7AC2`.

    Under the Y turn the angle is a byte, 256 steps per turn, summed at
    `$053548` from the instance's own byte and this record's first byte. The
    first byte is therefore a per-model bias, and it is what distinguishes two
    records of the same shape modelled facing opposite ways.
    """
    if int.from_bytes(data[start:start + 2], 'big') != 0x8001:
        return None
    bias, mode = data[start + 2], data[start + 3]
    rotation = ('none' if mode == 0 else 'articulated' if mode & 0x80
                else 'yaw' if mode & 0x40 else 'camera')
    return {'angleBiasByte': bias, 'modeByte': mode, 'rotation': rotation}


def structure_storey_height(data: bytes, slot: int) -> int | None:
    """An alias instance's first word, which $054D86 publishes in $7B00.

    Every Dion and Vesta resident satisfies
    ``0 <= Y - level * storeyHeight < storeyHeight``, so the level selector is a
    floor index and this word is the structure's floor pitch.
    """
    base = u32(data, 0x4bd0c)
    lead = struct.unpack_from('>H', data, base + u32(data, base + slot * 4))[0]
    return (lead & 0x7fff) if lead & 0x8000 else None


# $054DC8 reads the level-0 palette at +$C past the floor table and $055B36
# reads the destination level's at $C(a0,d1), so the two tables are parallel
# with a stride of twelve: levels 0..11.
STRUCTURE_LEVELS = 12


def structure_level_binding(data: bytes, slot: int, count: int = 280) -> dict | None:
    """The floor table an alias record publishes in ``$7C1E`` at ``$054DBC``.

    ``$054DAE``--``$054DBC`` steps a2 past the pitch word, the scale pair, the
    palette byte and the Building detail byte, then publishes a2 -- the record
    plus six -- as the floor table. ``$054DC2`` reads its first entry into
    ``$7AF0``, which is why a live capture inside a building still reports the
    ground-level structure there. The lift at ``$055B24``--``$055B28`` indexes
    the same table by the destination level and refuses the move on a zero
    byte; the entry it read stays in d0 through ``$055B84`` into ``$055BD8``,
    which masks it to a byte and assembles that structure at ``$059D70``. The
    region walk's stopping address is then published as ``$7B0E``.

    So a level selects a structure slot by lookup, not by arithmetic: Vesta
    Parliament's table reads 90, 92, 92, 93 and then 91 at level 10.

    Each floor also names the scene palette its Floor is drawn in, which is the
    alias record's rather than the bound structure's own. ``$054DB4`` binds the
    palette byte at record+4 into ``$7A0E``; where that byte is zero,
    ``$054DC8`` binds level 0's entry of the parallel table at record+18 and
    ``$055B2E``--``$055B52`` rebinds the destination level's on arrival. A
    per-level entry past the record's own extent is not claimed.

    A plain structure record has no alias header and therefore no table, so it
    offers level 0 alone and this returns ``None``. The table is twelve bytes,
    but two authored records are shorter than the format and run into the
    record that follows; entries past a record's own extent are not published.
    """
    base = u32(data, 0x4bd0c)
    address = base + u32(data, base + slot * 4)
    if not struct.unpack_from('>H', data, address)[0] & 0x8000:
        return None
    table = address + 6
    # An alias record carries no eight-byte prologue; a plain structure's scale
    # and palette bytes at -8..-1 belong to it, so they end the record before.
    following = sorted(
        a if struct.unpack_from('>H', data, a)[0] & 0x8000 else a - 8
        for a in {base + u32(data, base + s * 4) for s in range(count)}
        if a > address
    )
    extent = STRUCTURE_LEVELS if not following else max(0, min(STRUCTURE_LEVELS, following[0] - table))
    palettes = table + STRUCTURE_LEVELS
    floors = []
    for level in range(extent):
        target = data[table + level]
        if not target:
            continue
        target_address = base + u32(data, base + target * 4)
        floor = {'level': level, 'structureId': f'structure-{target_address:06x}',
                 'structureSlot': target}
        if data[address + 4]:
            floor['paletteIndex'] = data[address + 4]
        elif not following or palettes + level < following[0]:
            floor['paletteIndex'] = data[palettes + level]
        floors.append(floor)
    return {'floors': floors, 'levelsAuthored': extent, 'tableAddress': table}


def palette_entries(value) -> set[int]:
    """The scene palette entries a published fragment's ``$80xx`` words name.

    A word with bits 15 and 7 set resolves through the bound palette at entry
    ``(word & $7E) / 2`` (``colour_value``); the other bits are face flags.
    """
    if isinstance(value, dict):
        found = set()
        word = value.get('sourceColour')
        if isinstance(word, int) and word & 0x8080 == 0x8080:
            found.add((word & 0x7e) // 2)
        for item in value.values():
            found |= palette_entries(item)
        return found
    if isinstance(value, list):
        return set().union(*map(palette_entries, value)) if value else set()
    return set()


def bind_floor_structures(models: list[dict], by_address: dict, tables: list,
                          structure_bindings: dict, data: bytes, hardware: list[int]) -> None:
    """Publish each upper Floor as the lift draws it: in the instance's frame.

    Only the cell bind writes the structure scale ($054D98/$054DA8 from an alias
    record, $054DEA/$054DFA from a plain one) and the Building detail byte
    ($054DB6/$054E08). The lift's move ($055B12 -> $055BA6 -> $059D70) assembles
    the Floor's slot without touching either, so a Floor draws its slot's plan
    and the instance's detail at the instance's scale; eris-transporter-11-8
    holds slot 17's 3x3 on Floor 10, whose slot 16 authors 1x1. Where a Floor's
    slot differs from its instance in either, the slot's record is decoded again
    in the instance's frame, bound to the instance's detail, and the Floor names
    that Model in ``drawnStructureId``. ``structureId`` stays the authored slot.
    One Model serves every Floor with the same slot, scale and detail.
    """
    base = u32(data, 0x4bd0c)
    third = third_wall_height(data)
    signed = lambda value: f'm{-value}' if value < 0 else str(value)
    for model in list(models):
        binding = model.get('levelBinding')
        instance = model.get('structureSelection')
        if binding is None or model['id'] not in structure_bindings or instance is None:
            continue
        detail_slot, _, scale = structure_bindings[model['id']]
        scale = tuple(scale)
        for floor in binding['floors']:
            floor_id = floor['structureId']
            if floor['level'] == 0 or floor_id not in structure_bindings:
                continue
            own_detail, own_palette, own_scale = structure_bindings[floor_id]
            if tuple(own_scale) == scale and own_detail == detail_slot:
                continue
            identity = (f'{floor_id}-at-{signed(scale[0])}x{signed(scale[1])}'
                        f'-detail-{detail_slot}')
            if identity not in by_address:
                address = base + u32(data, base + floor['structureSlot'] * 4)
                pointer = address
                if struct.unpack_from('>H', data, address)[0] & 0x8000:
                    pointer = base + u32(data, base + data[address + 6] * 4)
                palette = palette_at(data, own_palette)
                try:
                    mesh, gaps = decode_structure(data, pointer, palette, hardware, scale, third)
                    scene_colours = mesh.pop('sceneColours')
                    selection = decode_structure_selection(data, mesh, scale, palette, hardware)
                except (ValueError, struct.error):
                    continue
                selection.pop('associationRoot')
                gaps = [gap for gap in gaps
                        if gap != 'Authored surface attachments/openings are not yet decoded.'
                        ] + selection.pop('wallTextGaps')
                selection['detailModel'] = instance['detailModel']
                selection['detailVariant'] = instance['detailVariant']
                detail = next(variant['mesh'] for variant in by_address[instance['detailModel']]['variants']
                              if variant['id'] == instance['detailVariant'])
                drawn = (assemble_mesh(mesh, turn_detail_mesh(data, detail, scale, 0), (1, 1))
                         if 'articulation' in detail else assemble_mesh(mesh, detail, scale))
                source = by_address[floor_id]
                derived = {
                    'id': identity, 'kind': 'structure',
                    'name': f"{source['name']} · Floor frame {scale[0]}\u00d7{scale[1]}",
                    'nameStatus': 'unknown', 'slots': [], 'sourceAddress': source['sourceAddress'],
                    'status': 'partial' if gaps else 'decoded',
                    'reason': ' '.join(gaps + [
                        f"The Floor form of {floor_id}: its record decoded at the "
                        f"{scale[0]}\u00d7{scale[1]} scale of the instance that binds it, with "
                        f"that instance's Building detail {instance['detailModel']}, as the "
                        'lift draws it.'
                    ]),
                    'variants': [{'id': 'assembly',
                                  'name': f'Floor as drawn · palette {own_palette}',
                                  'mesh': drawn}],
                    'relatedModels': [floor_id, instance['detailModel']],
                    'linkedInstances': [],
                    'evidence': [{
                        'claim': ('Only the cell bind writes the structure scale ($054D98/$054DA8, '
                                  '$054DEA/$054DFA) and the Building detail byte ($054DB6/$054E08); '
                                  "the lift's move reaches neither, and eris-transporter-11-8 holds "
                                  "the instance's 3x3 on a Floor whose slot authors 1x1."),
                        'confidence': 'verified',
                        'source': 'docs/research/damocles-interior-resident-placement.md',
                    }],
                    'sceneColours': scene_colours,
                    'structureSelection': selection,
                }
                classify_record(derived, False)
                by_address[identity] = derived
                models.append(derived)
                # The census: a Floor form no authored slot names takes the next
                # entry after the table's own, as image ground records do.
                structure_table = next(table for table in tables if table['kind'] == 'structure')
                if 'Floor forms' not in structure_table['extentEvidence']:
                    structure_table['extentEvidence'] += (
                        ' Entries after index 279 are Floor forms: an upper Floor\'s record '
                        'decoded in the frame of the instance that binds it, not table slots.'
                    )
                structure_table['entries'].append(identity)
                structure_table['entryCount'] = len(structure_table['entries'])
                derived['slots'] = [len(structure_table['entries']) - 1]
            floor['drawnStructureId'] = identity


def bind_floor_palettes(models: list[dict], data: bytes, hardware: list[int]) -> None:
    """Publish the colours each Floor's bound palette gives its structure.

    A Floor above 0 draws the structure its floor table binds, but its
    ``$80xx`` colour words resolve through the palette the alias record binds
    in ``$7A0E``, not the one that structure's own record names; Metis
    DOOBERRYS SOLICITORS draws slot 58's floor ``$C086`` in palette 66 as
    ``#444444``, not in slot 58's palette 28 as ``#882222``. So every palette
    a floor names is published beside the table, resolved for exactly the
    entries its structure's selector, scene colours and detail name. An entry
    no bound structure names is ``None``. Where the palette's day half
    (``day_colour``) changes any of those entries, ``dayColours`` carries that
    half for the same entries.
    """
    by_id = {model['id']: model for model in models}
    for model in models:
        binding = model.get('levelBinding')
        if binding is None:
            continue
        entries: dict[int, set[int]] = {}
        for floor in binding['floors']:
            target = by_id.get(floor.get('drawnStructureId', floor['structureId']))
            if 'paletteIndex' not in floor or target is None:
                continue
            selection = target.get('structureSelection')
            detail = [] if selection is None else [
                variant['mesh'] for variant in by_id.get(selection['detailModel'], {}).get('variants', [])
                if variant['id'] == selection['detailVariant']
            ]
            entries.setdefault(floor['paletteIndex'], set()).update(
                palette_entries([selection, target.get('sceneColours'), detail])
            )
        palettes = []
        for index, referenced in sorted(entries.items()):
            palette = palette_at(data, index)
            halves = [palette] if palette.day is None else [palette, palette.day]
            resolved = []
            for half in halves:
                colours = [None] * (max(referenced) + 1 if referenced else 0)
                for entry in referenced:
                    try:
                        colours[entry] = colour_value(half[entry], None, hardware)
                    except ValueError:
                        pass
                resolved.append(colours)
            day = resolved[1:] and resolved[1] != resolved[0]
            palettes.append({'colours': resolved[0], **({'dayColours': resolved[1]} if day else {}),
                             'paletteIndex': index})
        if palettes:
            binding['palettes'] = palettes


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


def coverage_ledger(models: list, tables: list, notes: list[str], disk_load: list | None = None,
                    road_networks: list | None = None) -> dict:
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
            # This counts models still carrying the $7000 road-template omission, not
            # whether road networks are recovered: the networks are their own
            # collection, one a structure group, and a Body with no entry there is a
            # Body whose group was never captured.
            'roadTemplate': omissions['roadTemplate'],
        },
        'roads': {
            'networks': len(road_networks or []),
            'settlementsWithRoads': sum(
                1 for network in road_networks or [] if network['cells']
            ),
            'bodies': sorted({network['body'] for network in road_networks or []}),
            'attested': sum(
                1 for network in road_networks or []
                if network['attestation'] == 'capture'
            ),
            'evidence': (
                'One entry an island record that binds a structure group, captured or '
                'not: $04EB60 builds the run grid from the group\'s own authored stream, '
                'so every group decodes. `attested` counts those a capture also stood in '
                'and checked against its live $0083DC. A Settlement with no run holds no '
                'road, which is a reading rather than a gap.'
            ),
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


# The per-body note a live workspace's evidence cites. A body absent from this
# table is covered by the sweep note rather than by a note of its own; the
# decoder itself carries no body identity, so adding a workspace needs no code.
WORKSPACE_EVIDENCE = {
    'vesta': 'docs/research/damocles-vesta-workspace.md',
    'gaea': 'docs/research/damocles-gaea-ur-city-workspace.md',
    'dion': 'docs/research/damocles-dion-workspace.md',
}
WORKSPACE_SWEEP_EVIDENCE = 'docs/research/damocles-non-eris-workspaces.md'


def workspace_evidence(slug: str) -> str:
    return WORKSPACE_EVIDENCE.get(slug, WORKSPACE_SWEEP_EVIDENCE)


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


def decode_cell_ground(workspace: bytes, data: bytes, cell: int, tables: list,
                       by_address: dict, hardware: list[int]
                       ) -> tuple[int, dict, list[str], int, list[str], int | None]:
    """Decode the ground record one cell of a loaded workspace draws.

    The record is the cell's $1E400 word, oriented by its $83DC byte and joined
    to the scene through the seed longword at $1E000; its scene colours bind to
    the palette of the structure $ABDC places on the cell. `workspace` is either
    a capture or `load_structure_workspace`'s replay, and the two decode alike.

    Returns the record address, the mesh with any $7000 templates placed, its
    gaps, the transform, the template Models and the palette index.
    """
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
        mesh, gaps, transform, placements = decode_ground(
            workspace, address, workspace[0x83dc + cell], palette, hardware,
            cell,
        )
    except (ValueError, struct.error) as error:
        mesh, gaps, transform, placements = (
            {'vertices': [], 'faces': [], 'lines': [], 'sourceStart': address, 'sourceEnd': address},
            [str(error)],
            0xFF,
            [],
        )
    mesh, template_models, template_gaps = compose_ground_templates(
        mesh, placements, tables[0]['entries'], by_address, workspace, palette, hardware
    )
    return address, mesh, sorted(set(gaps + template_gaps)), transform, template_models, palette_index


def attach_image_ground(workspace: bytes, data: bytes, prefix: str, label: str, grid: bytes,
                        models: list, tables: list, by_address: dict, hardware: list[int],
                        template_palettes: dict, every_cell: bool = False) -> dict[int, str]:
    """The Drawn Record of every road cell in a workspace replayed from the image.

    `workspace` is `load_structure_workspace`'s, so the record, its orientation,
    its scene joins and any placement replacement are the ones the loader would
    have built. Only road cells are decoded: the network is what asked.

    A Model is shared only where it is the same geometry. The shared identity a
    captured record gets names its address and transform, but a scene-joined
    record draws differently under another group's seeds, and a record's scene
    colours follow the palette of the structure on its cell; so an existing
    Model is reused only when its mesh is the mesh decoded here, and otherwise
    the cell gets one qualified by its group, and by the cell if even that is
    taken.

    With `every_cell`, every cell is decoded rather than the road cells alone,
    for an island whose whole workspace is published from the image.
    """
    by_cell = {}
    ground_table = next(table for table in tables if table['kind'] == 'ground')
    for cell in range(256):
        if not every_cell and not grid_cell_class(grid[cell * 4:cell * 4 + 4], cell):
            continue
        address, mesh, gaps, transform, template_models, palette_index = decode_cell_ground(
            workspace, data, cell, tables, by_address, hardware
        )
        record_template_palettes(
            template_palettes, template_models, palette_index, label, cell
        )
        drawn = bool(mesh['faces'] or mesh['lines'])
        shared = f'ground-{address:06x}-{transform:02x}'
        if uses_scene_points(mesh):
            shared += f'-{cell:02x}'
        candidates = (shared, f'{prefix}-{shared}', f'{prefix}-{shared}-{cell:02x}')
        model_id = next((
            identity for identity in candidates
            if identity in by_address and (
                by_address[identity]['variants'][0]['mesh'] == mesh
                if by_address[identity]['variants'] else not drawn
            )
        ), None)
        if model_id is None:
            model_id = next(identity for identity in candidates[1:] if identity not in by_address)
            model = {
                'id': model_id,
                'kind': 'ground',
                'name': f'{label} ground {cell}',
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
                        f'{label} cell ${cell:02X}: the per-cell ground/pad/road record at '
                        '$1E000 the workspace loader would draw there, replayed from the '
                        "group's authored stream by $04EB60-$04ED12 -- its $1E400 record "
                        'after any placement replacement, its $83DC orientation and its '
                        '$1E000 scene seed. No capture stands in this workspace; the same '
                        'replay reproduces those tables on every capture that does.'
                    ),
                    'confidence': 'verified',
                    'source': 'docs/research/damocles-eris-ground.md',
                }],
            }
            if drawn:
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
            by_address[model_id] = model
            models.append(model)
            # The census: a Model no capture's $1E400 slot names takes the next
            # entry after the live workspaces' own, as theirs do after index 255.
            ground_table['entries'].append(model_id)
            ground_table['entryCount'] = len(ground_table['entries'])
            model['slots'] = [len(ground_table['entries']) - 1]
        by_cell[cell] = model_id
    if by_cell and 'image-derived' not in ground_table['extentEvidence']:
        ground_table['extentEvidence'] += (
            ' The last entries are image-derived road cells: the ground record the loader '
            'would draw there, replayed from the group\'s authored stream.'
        )
    return by_cell


# The Body whose workspace repeats one structure over every cell ($0592FA).
UNIFORM_FIELD_BODY = 2


def image_workspace(data: bytes, island: dict) -> bytes:
    """The workspace the loader would build for an island nobody has stood in.

    `load_structure_workspace` replays the group's authored stream. The fields a
    capture would also carry are written as the workspace loader and the
    island search leave them: the body selector, a camera pair whose origin is
    the island record's (standing in cell 0), and the group's place list.
    """
    group = island['structureGroup']
    body = int(island['body'].split('-')[1])
    workspace = bytearray(load_structure_workspace(data, group))
    origin_x, origin_z = island['origin']
    struct.pack_into('>H', workspace, 0x7AA8, body * 4)
    struct.pack_into('>I', workspace, 0x7A92, origin_x << 16)
    struct.pack_into('>I', workspace, 0x7A2C, 0)
    struct.pack_into('>I', workspace, 0x7A9A, origin_z << 16)
    struct.pack_into('>I', workspace, 0x7A34, 0)
    struct.pack_into('>H', workspace, 0x7B5C, 0)
    struct.pack_into('>I', workspace, 0x7A6C, walk_group_record(data, group)[2])
    return bytes(workspace)


def image_workspace_prefix(slug: str, island: dict) -> str:
    """The identity an image-replayed island publishes under, as its roads always have."""
    suffix = (re.sub(r'[^a-z0-9]+', '-', island['areaName'].lower()).strip('-')
              if island['areaName'] else f"{island['structureGroup']:02x}")
    return f'{slug}-{suffix}'


def attach_live_workspace(workspace: bytes, data: bytes, models: list, tables: list,
                          instances: list, places: list, by_address: dict, bodies: list,
                          islands: list, hardware: list[int], template_palettes: dict,
                          road_networks: list, image_island: dict | None = None
                          ) -> tuple[str, dict]:
    """Place live $ABDC / ground records from a non-Eris loaded world capture.

    With `image_island`, `workspace` is `image_workspace`'s for that island
    instead: nothing stood in it, and everything published says so.

    Returns the workspace note and the structure-group binding the workspace
    establishes: its body, its $794E group, the prefix its cell instances were
    published under, and whether a capture or the image attests it.
    """
    source = 'Image-replayed' if image_island else 'Live'

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
    # The world/local camera pair is only an origin while the workspace is
    # actually built for the cell the player stands in. The engine's own cell
    # word implies the same origin independently, so disagreement means the
    # capture is not standing in a built workspace and its placements would be
    # published against a fabricated origin. Refuse rather than place them.
    cell_word = struct.unpack_from('>H', workspace, 0x7b5c)[0]
    implied_x = u32(workspace, 0x7a92) // 65536 - (cell_word & 0x0F)
    implied_z = u32(workspace, 0x7a9a) // 65536 - (cell_word >> 4)
    if (int(origin_x), int(origin_z)) != (implied_x, implied_z):
        raise ValueError(
            f'live {label} workspace origin {origin_x:.0f},{origin_z:.0f} disagrees with the '
            f'origin {implied_x},{implied_z} implied by cell ${cell_word:02X}; this capture is '
            'not standing in a built workspace'
        )
    # The origin the capture stands on is one of this body's island records:
    # $056464 publishes the nearest record's own origin into $789A/$789E before
    # the workspace loader runs, so naming it qualifies every cell placed here.
    island = island_by_origin(islands, body, int(origin_x), int(origin_z))
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
    prefix = (image_workspace_prefix(slug, image_island) if image_island
              else live_overlay_prefix(slug, area_name, instances))
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
        key_base = cell_key_base(record >> 8)
        instances.append({
            'id': identity,
            'name': place[1] if place else f"{label} surface cell {cell & 15},{cell >> 4}",
            'model': model_id,
            'sourceAddress': address,
            'association': None,
            'handling': None,
            'keyBase': key_base or None,
            'placementClass': None,
            'placement': None,
            'location': {
                'body': f'body-{body}',
                'place': place[0] if place else None,
                'position': [
                    origin_x + (cell & 15) + 0.5 + dx * 30 / 65536,
                    0,
                    origin_z + (cell >> 4) + 0.5 + dz * 30 / 65536,
                ],
                'coordinateSystem': BODY_COORDINATES,
                'island': island['id'] if island else None,
                'heading': None,
            },
            'reason': (
                f"{source} {label} $ABDC workspace placement at cell ${cell:02X}; "
                'not a census of every island on this body.'
            ),
        })
        if place:
            next(item for item in places if item['id'] == place[0])['instances'].append(identity)
    def add_ground_instance(cell: int, model_id: str) -> None:
        model = by_address[model_id]
        if not model['variants']:
            return
        identity = f'{prefix}-ground-{cell:02x}'
        place = names.get(cell)
        instances.append({
            'id': identity,
            'name': place[1] + ' ground' if place else f"{label} ground cell {cell & 15},{cell >> 4}",
            'model': model_id,
            'sourceAddress': 0x1E400 + cell * 2,
            'association': None,
            'handling': None,
            'placementClass': None,
            'placement': None,
            'location': {
                'body': f'body-{body}',
                'place': place[0] if place else None,
                'position': [origin_x + (cell & 15) + 0.5, 0, origin_z + (cell >> 4) + 0.5],
                'coordinateSystem': BODY_COORDINATES,
                'island': island['id'] if island else None,
                'heading': None,
            },
            'reason': (
                f"{source} {label} cell ground/pad/road record; intentional empty records have no drawable instance."
            ),
        })
        model['linkedInstances'].append(identity)
        if place:
            next(item for item in places if item['id'] == place[0])['instances'].append(identity)

    ground_unique = 0
    ground_model_by_cell: dict[int, str] = {}
    ground_mesh_by_cell: dict[int, dict] = {}
    if image_island:
        # Named, and shared, only where the geometry is the same: a scene-joined
        # record draws differently under another group's seeds.
        ground_model_by_cell = attach_image_ground(
            workspace, data, prefix,
            image_island['areaName'] or f"{label} group ${image_island['structureGroup']:02X}",
            workspace[ROAD_RUN_GRID:ROAD_RUN_GRID + 1024],
            models, tables, by_address, hardware, template_palettes, every_cell=True,
        )
        for cell in range(256):
            add_ground_instance(cell, ground_model_by_cell[cell])
    for cell in range(256 if not image_island else 0):
        address, mesh, gaps, transform, template_models, palette_index = decode_cell_ground(
            workspace, data, cell, tables, by_address, hardware
        )
        ground_mesh_by_cell[cell] = mesh
        record_template_palettes(
            template_palettes, template_models, palette_index, label, cell
        )
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
                        f"{source} {label} per-cell ground/pad/road record at $1E000; "
                        'this workspace overwrites the Eris first-world index.'
                    ),
                    'confidence': 'verified',
                    'source': workspace_evidence(slug),
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
        ground_model_by_cell[cell] = model_id
        add_ground_instance(cell, model_id)
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
    group = struct.unpack_from('>H', workspace, 0x794e)[0]
    network = decode_road_network(
        workspace, ground_model_by_cell, f'roads-{prefix}', body,
        (int(origin_x), int(origin_z)), island, label, workspace_evidence(slug),
        grid=workspace[ROAD_RUN_GRID:ROAD_RUN_GRID + 1024],
        selectors=[struct.unpack_from('>H', workspace, ROAD_PIECE_SELECTORS + i * 2)[0]
                   for i in range(6)],
        cell_index=workspace[0x1E400:0x1E600],
        live_orientations=None if image_island else workspace[0x83DC:0x84DC],
    )
    network['structureGroup'] = group
    # What lets an image-derived cell publish its Drawn Record: the workspace
    # the loader would build, replayed from the program image, draws every road
    # cell exactly as this capture's live workspace does.
    replayed = load_structure_workspace(data, group) if network['cells'] else data
    for item in network['cells'] if not image_island else []:
        cell = item['cell']
        if decode_cell_ground(replayed, data, cell, tables, by_address, hardware)[1] != \
                ground_mesh_by_cell[cell]:
            raise ValueError(
                f'{label} road cell ${cell:02X}: the replayed workspace draws a different '
                'record from the live one'
            )
    if not any(item['id'] == network['id'] for item in road_networks):
        road_networks.append(network)
    note = (
        f"{label} {source.lower()} $ABDC" + (f" ({area_name})" if area_name else "") +
        f": body selector $7AA8=${selector:04X}, current cell "
        f"$7B5C=${int.from_bytes(workspace[0x7b5c:0x7b5e], 'big'):02X}; {occupied} surface assemblies "
        f'and {ground_unique} workspace-local ground records. Structure and building-detail pointer '
        'tables match first-world; object unique addresses are unchanged.'
    )
    binding = {'body': body, 'group': group, 'prefix': prefix, 'workspace': workspace,
               'attestation': 'image' if image_island else 'capture'}
    return note, binding


def extract(data: bytes, source: dict, workspace: bytes | list[bytes] | None = None) -> dict:
    """Catalogue all entries of the bounded resident tables, never a byte scan."""
    if len(data) != 1048576 or u32(data, 0x4bd10) != 0x35700 or u32(data, 0x4bd22) != 0x26000:
        raise ValueError('not a loaded pinned Damocles world capture')
    workspaces = workspace if isinstance(workspace, list) else ([] if workspace is None else [workspace])
    models, tables, instances = [], [], []
    hardware = list(struct.unpack_from('>16H', data, 0x6fd00))
    structure_association_roots: dict[str, int] = {}
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
            if kind == 'object':
                model['supportTop'] = decode_support_top(data, address)
                orientation = decode_instance_orientation(data, address)
                if orientation is not None:
                    model['instanceOrientation'] = orientation
            elif kind == 'structure':
                storey_height = structure_storey_height(data, slot)
                if storey_height is not None:
                    model['storeyHeight'] = storey_height
                level_binding = structure_level_binding(data, slot, count)
                if level_binding is not None:
                    model['levelBinding'] = level_binding
            elif kind == 'interior':
                # A synthetic image carries no groups below its records; the pinned image
                # decodes every slot, and the port's payload test holds it to that.
                try:
                    model['extent'] = decode_detail_extent(data, address)
                except (ValueError, struct.error):
                    pass
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
                        # The association-list root is a stream offset the
                        # structure-group probe derives from; it is not a
                        # published catalogue fact, so it stays out of the payload.
                        structure_association_roots[identity] = selection.pop('associationRoot')
                        wall_text_gaps = selection.pop('wallTextGaps')
                        model['structureSelection'] = selection
                        gaps = [
                            gap for gap in gaps
                            if gap != 'Authored surface attachments/openings are not yet decoded.'
                        ] + wall_text_gaps
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
    for index, body in enumerate(bodies):
        # VOID is the space-as-place sentinel rather than a body surface, so it
        # carries no surface and none of its table entry is published.
        body['bodySurface'] = None if index >= SURFACE_BODIES else {
            'baseColour': st_rgb(body_base_colour(data, index)),
            'sourceColour': body_base_colour(data, index),
            'extentCells': [SURFACE_CELLS, SURFACE_CELLS],
            'rotationRate': body_rotation_rate(data, index),
            'sky': body_sky(data, index),
            'wrapsX': True,
            'wrapsZ': True,
        }
    islands = decode_islands(data, bodies)
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
                          'placementClass': resident_placement_class(data[0x6fa8 + slot * 4:0x6fac + slot * 4]),
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
            'coordinateSystem': BODY_COORDINATES,
            'island': None,
            'heading': data[0x77a8 + slot * 4],
        }
        instance['reason'] = (
            f'Association B matches the native surface-resident selector for '
            f"{bodies[body]['name']}; coordinates and the drawn instance angle "
            f'($77A8 + 4*slot, the byte $053548 sums with the model’s $8001 bias) '
            f"are recovered from the resident arrays at source cell ${association[3]:02X}. "
            'The named place is unresolved.'
        )
    # Current first-world surface workspace: low nibble X, high nibble Z.
    # Camera world/local coordinates bind this workspace to its system grid origin.
    eris_origin_x = (u32(data, 0x7a92) - u32(data, 0x7a2c)) / 65536
    eris_origin_z = (u32(data, 0x7a9a) - u32(data, 0x7a34)) / 65536
    origin_x, origin_z = eris_origin_x, eris_origin_z
    eris_island = island_by_origin(islands, 11, int(origin_x), int(origin_z))
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
                          'keyBase': cell_key_base(record >> 8) or None,
                          'placementClass': None,
                          'placement': None,
                          'location': {'body': 'body-11', 'place': place[0] if place else None,
                            'position': [origin_x + (cell & 15) + 0.5 + dx * 30 / 65536, 0, origin_z + (cell >> 4) + 0.5 + dz * 30 / 65536],
                            'coordinateSystem': BODY_COORDINATES,
                            'island': eris_island['id'] if eris_island else None, 'heading': None},
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
        gaea_island = island_by_origin(islands, 8, gaea_origin_x, gaea_origin_z)
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
                'keyBase': cell_key_base(placement['word'] >> 8) or None,
                'placementClass': None,
                'placement': None,
                'location': {
                    'body': 'body-8',
                    'place': place[0] if place else None,
                    'position': [
                        gaea_origin_x + (cell & 15) + 0.5 + dx * 30 / 65536,
                        0,
                        gaea_origin_z + (cell >> 4) + 0.5 + dz * 30 / 65536,
                    ],
                    'coordinateSystem': BODY_COORDINATES,
                    'island': gaea_island['id'] if gaea_island else None,
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
            'placementClass': None,
            'placement': None,
            'location': {
                'body': 'body-11',
                'place': place[0] if place else None,
                'position': [origin_x + (cell & 15) + 0.5, 0, origin_z + (cell >> 4) + 0.5],
                'coordinateSystem': BODY_COORDINATES,
                'island': eris_island['id'] if eris_island else None,
                'heading': None,
            },
            'reason': 'Recovered first-world cell ground/pad/road record; intentional empty records have no drawable instance.',
        })
        model['linkedInstances'].append(identity)
        if place:
            next(p for p in places if p['id'] == place[0])['instances'].append(identity)
    capital_group = struct.unpack_from('>H', data, 0x794e)[0]
    capital = decode_road_network(
        data, dict(ground_cells), 'roads-eris-capital-city', 11,
        (int(origin_x), int(origin_z)), eris_island, 'Capital City',
        'docs/research/damocles-eris-ground.md',
        grid=data[ROAD_RUN_GRID:ROAD_RUN_GRID + 1024],
        selectors=[struct.unpack_from('>H', data, ROAD_PIECE_SELECTORS + i * 2)[0]
                   for i in range(6)],
        cell_index=data[0x1E400:0x1E600],
        live_orientations=data[0x83DC:0x84DC],
    )
    capital['structureGroup'] = capital_group
    road_networks = [capital]
    workspace_notes = []
    slot_bindings: list[dict] = []
    # The structure-group workspaces a capture has stood in. First-world is Eris's.
    group_bindings = [{'body': 11, 'group': capital_group, 'prefix': 'eris', 'workspace': data,
                       'attestation': 'capture'}]
    if workspaces:
        for workspace in workspaces:
            note, group_binding = attach_live_workspace(
                workspace, data, models, tables, instances, places, by_address, bodies,
                islands, hardware, template_palettes, road_networks,
            )
            workspace_notes.append(note)
            group_bindings.append(group_binding)
            slot_bindings.append({
                'world': note.split(' live $ABDC', 1)[0],
                'bindings': object_slot_bindings(data, workspace),
            })
    # Every island whose group no capture stands in publishes the workspace the
    # loader would build for it: its structures, ground, places and residents.
    # The leave-one-out check in the lab tests replays each captured island the
    # same way and requires the capture's own publication back.
    #
    # Midas is not a 16x16 workspace. $0592FA sets $7A2A for body 2 alone, and
    # $04ED2A then copies cell 0's structure word over every cell, so the one
    # structure repeats across the whole Body; the Midas capture's $ABDC holds
    # structure 68 in all 256 cells. Its residents sit at their own cells'
    # centres far outside any island window, so none is placed here.
    bound_groups = {(binding['body'], binding['group']) for binding in group_bindings}
    for island in sorted(islands, key=lambda item: (item['body'], item['structureGroup'] or 0)):
        group = island['structureGroup']
        body = int(island['body'].split('-')[1])
        if not group or (body, group) in bound_groups:
            continue
        if body == UNIFORM_FIELD_BODY:
            for item in instances:
                if (item['id'].startswith('object-slot-') and item['placement'] is None
                        and (item.get('association') or {}).get('body') == island['body']
                        and item['association'].get('structureGroupSelector') == group
                        and item['association'].get('insertionGroupSelector')):
                    item['reason'] = (
                        f'Interior-associated resident on {bodies[body]["name"]}, group '
                        f'${group:02X}, cell ${item["association"]["cell"]:02X}. Midas draws one '
                        'structure in every cell ($0592FA sets $7A2A for this Body; $04ED2A '
                        'copies cell 0\'s structure word over all 256), so the resident stands in '
                        'the copy at its own cell\'s centre. No 16x16 workspace represents that '
                        'field, so no parent is published.'
                    )
            continue
        bound_groups.add((body, group))
        note, group_binding = attach_live_workspace(
            image_workspace(data, island), data, models, tables, instances, places,
            by_address, bodies, islands, hardware, template_palettes, road_networks,
            image_island=island,
        )
        workspace_notes.append(note)
        group_bindings.append(group_binding)
    # Every island record that binds a group, whether or not a capture has ever
    # loaded it. The grid the loader would build is in the group's own authored
    # stream, so a Settlement nobody has stood in still publishes its roads;
    # what it does not get is a live $0083DC to check against, which is what
    # `attestation` distinguishes. Sorted by body and group so the payload does
    # not depend on the order the island table happens to be walked in.
    attested = {(network['body'], tuple(network['origin'])) for network in road_networks}
    for island in sorted(islands, key=lambda item: (item['body'], item['structureGroup'] or 0)):
        group = island['structureGroup']
        if not group or (island['body'], tuple(island['origin'])) in attested:
            continue
        body = int(island['body'].split('-')[1])
        slug = re.sub(r'[^a-z0-9]+', '-', bodies[body]['name'].lower()).strip('-')
        suffix = (re.sub(r'[^a-z0-9]+', '-', island['areaName'].lower()).strip('-')
                  if island['areaName'] else f'{group:02x}')
        label = island['areaName'] or f'{bodies[body]["name"]} group ${group:02X}'
        workspace = load_structure_workspace(data, group)
        grid = workspace[ROAD_RUN_GRID:ROAD_RUN_GRID + 1024]
        network = decode_road_network(
            data, attach_image_ground(
                workspace, data, f'{slug}-{suffix}', label, grid, models, tables,
                by_address, hardware, template_palettes,
            ),
            f'roads-{slug}-{suffix}', body,
            (island['origin'][0], island['origin'][1]), island, label,
            WORKSPACE_SWEEP_EVIDENCE,
            grid=grid,
            selectors=[struct.unpack_from('>H', workspace, ROAD_PIECE_SELECTORS + i * 2)[0]
                       for i in range(6)],
            cell_index=workspace[0x1E400:0x1E600], live_orientations=None,
        )
        network['structureGroup'] = group
        road_networks.append(network)
    # A hand-recovered instance an image-replayed workspace also places keeps its
    # identity; the workspace's twin is folded into it.
    merged_parents: dict[str, str] = {}
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
        parent_position = [parent_raw[0] / 65536, 0, parent_raw[2] / 65536]
        # Bare Island's image-replayed workspace places the same instance at cell
        # $26, to the bit. The hand-recovered identity is the one Saves and links
        # already name, so it stays, and takes the island and Place the workspace
        # supplies; the twin goes.
        twin = next((item for item in instances
                     if item['id'].endswith('-surface-26') and item['model'] == chevy_parent_model['id']
                     and (item['location'] or {}).get('body') == 'body-11'
                     and item['location']['position'] == parent_position), None)
        parent_place = twin['location']['place'] if twin else None
        instances.append({
            'id': parent_id,
            'name': twin['name'] if twin else 'Eris structure group $14 cell $26',
            'model': chevy_parent_model['id'],
            'sourceAddress': 0x251d7,
            'association': None,
            'handling': None,
            'placementClass': None,
            'placement': None,
            'keyBase': twin.get('keyBase') if twin else None,
            'location': {
                'body': 'body-11', 'place': parent_place,
                'position': parent_position,
                'coordinateSystem': BODY_COORDINATES,
                'island': twin['location']['island'] if twin else None,
                'heading': None,
            },
            'reason': ('Authored structure-group $14 cell $26 instance'
                       + ('; the image-replayed Bare Island workspace places it and names its '
                          'Place.' if twin else '; source name and named place remain unresolved.')),
        })
        if twin:
            instances.remove(twin)
            merged_parents[twin['id']] = parent_id
            if twin['id'] in chevy_parent_model['linkedInstances']:
                chevy_parent_model['linkedInstances'].remove(twin['id'])
            for place in places:
                place['instances'] = [parent_id if identity == twin['id'] else identity
                                      for identity in place['instances']]
        insertions = decode_structure_associations(data, 0x13218).get(0x03)
        if insertions is None:
            raise ValueError('99 Chevy key insertion group is missing')
        chevy_key['association']['insertions'] = insertions
        chevy_key['placement'] = {
            'parent': parent_id,
            'position': resident_local_position(data, 180, tuple(parent_raw)),
            'heading': data[0x77a8 + 180 * 4],
            'coordinateSystem': 'Eris structure group $14 cell $26 local model units',
        }
        chevy_key['reason'] = (
            'Recovered resident placement in the source-unnamed Eris structure-group $14 cell '
            f'$26 instance. Its instance angle byte is ${data[0x77a8 + 180 * 4]:02X} (#361).'
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
    # Interior residents whose workspace is determined (#325). #324 settled the
    # selector: the scene key is (body, structure-group, cell, level,
    # insertion-group), the group record and the rebuilt $ABDC are the runtime
    # workspace, and the $7A6C place label is corroboration rather than a body
    # binding -- the Dion capture reads $794E=$02 with a stale BIRMINGHAM ISLAND
    # label. So a resident's own body byte gives the body and its group byte
    # gives the workspace, for every group a capture binds.
    #
    # A capture binds its group when its live $ABDC is byte-identical to the
    # workspace the loader replays from the group's authored stream; every
    # capture that attached a workspace does, and one that did not would raise
    # here. Groups no capture has stood in keep #324's disposition: bound to a
    # static group record, named workspace identity unresolved, and no
    # placement emitted.
    #
    # A resident on level n belongs to the structure the cell instance's floor
    # table binds at n ($055B24), which is what the lift assembles there: that
    # structure's plan bounds the placement and its association list names the
    # regions that insert the resident. Level 0 is the cell instance itself.
    # The live workspaces attach after instance_by_id is built, so index again.
    instance_by_id = {instance['id']: instance for instance in instances}
    for group_binding in group_bindings:
      body = group_binding['body']
      bound_group = group_binding['group']
      slug = group_binding['prefix']
      body_id = f'body-{body}'
      body_name = bodies[body]['name'].title()
      candidates = [
          item for item in instances
          if item['id'].startswith('object-slot-') and item['placement'] is None
          and (item.get('association') or {}).get('body') == body_id
          and (item.get('association') or {}).get('structureGroupSelector') == bound_group
          and (item.get('association') or {}).get('insertionGroupSelector')
      ]
      if not candidates:
          continue
      try:
          replayed = load_structure_workspace(data, bound_group)
          overrides = decode_group_overrides(data, bound_group)
      except (ValueError, struct.error) as error:
          for item in candidates:
              item['reason'] = (f'{body_name} structure group ${bound_group:02X} map did not '
                                f'decode in this capture: {error}.')
          continue
      live = group_binding['workspace']
      if replayed[0xABDC:0xABDC + 1024] != live[0xABDC:0xABDC + 1024]:
          raise ValueError(f'{body_name} group ${bound_group:02X}: the live $ABDC disagrees '
                           'with the workspace its authored stream replays')
      for resident in candidates:
          association = resident['association']
          cell = association['cell']
          level = association['levelSelector']
          override = overrides.get(cell)
          if override is None or override['slot'] is None:
              resident['reason'] = (
                  f'{body_name} structure group ${bound_group:02X} places no structure in cell '
                  f'${cell:02X}, so this interior-associated resident has no parent.'
              )
              continue
          surface_id = f'{slug}-surface-{cell:02x}'
          parent = instance_by_id.get(merged_parents.get(surface_id, surface_id))
          if parent is None or parent['model'] != tables[1]['entries'][override['slot']]:
              raise ValueError(f'{body_name} cell ${cell:02X} parent model disagrees with its override')
          slot = int(resident['id'].rsplit('-', 1)[1])
          raw = tuple(s32(data, base + slot * 4) for base in (0x63a8, 0x67a8, 0x6ba8))
          origin = structure_origin(raw, override['dx'], override['dz'])
          local = resident_local_position(data, slot, origin)
          if level == 0:
              floor_structure = parent['model']
          else:
              floors = (by_address[parent['model']].get('levelBinding') or {}).get('floors') or []
              floor_structure = next(
                  (entry['structureId'] for entry in floors if entry['level'] == level), None)
          if floor_structure is None:
              resident['reason'] = (
                  f'Authored {body_name} group ${bound_group:02X} cell ${cell:02X} parent decoded, '
                  f'but its floor table binds no structure at level {level}, so the resident '
                  'is not placed.'
              )
              continue
          storey = structure_storey_height(data, override['slot'])
          if storey is None:
              if level != 0:
                  raise ValueError(f'{body_name} resident slot {slot} is on level {level} of a '
                                   'structure with no floor pitch')
              floor_note = ('The structure publishes no storey pitch, so level 0 is its only '
                            'floor.')
          elif not 0 <= local[1] - storey * level < storey:
              raise ValueError(f'{body_name} resident slot {slot} is not on floor {level}')
          else:
              floor_note = (f'Level {level} is floor {level} at the structure\'s {storey}-unit '
                            f'storey pitch, so the record sits {local[1] - storey * level} units '
                            'above it.')
          if level:
              floor_note += (f' The floor table binds {floor_structure} at that level, and the '
                             'placement is read against its plan and association list.')
          # The structure as drawn: the level's plan and the cell instance's
          # Building detail, both in the instance's scale. Only the cell bind
          # writes the scale ($054D98/$054DA8, $054DEA/$054DFA) and the detail
          # ($054DB6/$054E08); the lift assembles a Floor's slot without either,
          # and eris-transporter-11-8 holds slot 17's 3x3 on Floor 10, whose
          # slot 16 authors 1x1. A Floor's own plan is decoded in its own scale,
          # so it is rescaled into the instance's.
          model = by_address.get(floor_structure)
          interior_slot, _, scale = structure_bindings.get(parent['model'], (None, None, (1, 1)))
          own_scale = structure_bindings.get(floor_structure, (None, None, scale))[2]
          extent = None
          if model and model.get('variants') and all(own_scale):
              vertices = [[x * scale[0] // own_scale[0], y, z * scale[1] // own_scale[1]]
                          for x, y, z in model['variants'][0]['mesh']['vertices']]
              if interior_slot is not None and interior_slot < len(tables[2]['entries']):
                  detail = by_address[tables[2]['entries'][interior_slot]]
                  if detail.get('variants'):
                      vertices += [[x * scale[0], y, z * scale[1]]
                                   for x, y, z in detail['variants'][0]['mesh']['vertices']]
              extent = [[min(v[axis] for v in vertices), max(v[axis] for v in vertices)]
                        for axis in range(3)]
          # Without a pitch nothing else bounds the height, so the drawn
          # structure has to contain it too.
          axes = (0, 2) if storey is not None else (0, 1, 2)
          if extent and not all(extent[axis][0] <= local[axis] <= extent[axis][1]
                                for axis in axes):
              resident['reason'] = (
                  f'Authored {body_name} group ${bound_group:02X} cell ${cell:02X} parent '
                  f'decoded, but the '
                  f'derived local placement {tuple(local)} lies outside the plan of '
                  f'{floor_structure}, so it is not published.'
              )
              continue
          root = structure_association_roots.get(floor_structure)
          insertions = None
          if root is not None:
              insertions = decode_structure_associations(data, root).get(
                  association['insertionGroupSelector'])
          if insertions is not None:
              association['insertions'] = insertions
          heading = data[0x77a8 + slot * 4]
          resident['placement'] = {
              'parent': parent['id'],
              'position': local,
              'heading': heading,
              'coordinateSystem': f'{body_name} group ${bound_group:02X} cell ${cell:02X} local model units',
          }
          resident['reason'] = (
              f'Recovered resident placement in the authored {body_name} structure-group '
              f'${bound_group:02X} cell ${cell:02X} instance. {floor_note}'
              + ('' if insertions is not None else
                 f' Its insertion group is absent from {floor_structure}\'s association list, '
                 'so only the region its own group numbers inserts it.')
              + f' Its instance angle byte is ${heading:02X} (#361).'
              + ('' if group_binding['attestation'] == 'capture' else
                 ' No capture stands in this group; the workspace is the one its authored '
                 'stream replays.')
          )
          model = by_address.get(parent['model'])
          if model is not None and resident['id'] not in model['linkedInstances']:
              model['linkedInstances'].append(resident['id'])
              model['evidence'].append({
                  'claim': (f'Authored {body_name} group ${bound_group:02X} cell ${cell:02X} record places this '
                            f'instance and binds resident slot {slot} at local '
                            f'{tuple(local)} on floor {level}.'),
                  'confidence': 'verified',
                  'source': ('docs/research/damocles-dion-vesta-structure-groups.md'
                             if body_id in ('body-4', 'body-14') else
                             'docs/research/damocles-interior-resident-placement.md'),
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
            'coordinateSystem': BODY_COORDINATES,
            'island': None,
            'heading': data[0x77a8 + 5 * 4],
        }
        limo['reason'] = ('Resident slot 5 is associated with Eris surface cell $87. '
                          'Its world coordinates and drawn instance angle are recovered from the '
                          'on-foot capture.')
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
        association['insertions'] = insertions
        spaceport['associationGroups'] = [
            {'group': group, 'pairs': pairs}
            for group, pairs in groups.items()
        ]
        spaceport_raw = [round(spaceport['location']['position'][axis] * 65536) for axis in (0, 1, 2)]
        key_position = resident_local_position(data, 183, tuple(spaceport_raw))
        key['placement'] = {'parent': spaceport['id'], 'position': key_position,
                            'heading': data[0x77a8 + 183 * 4],
                            'coordinateSystem': 'Capital Spaceport local model units'}
        key['reason'] = ('Recovered resident placement in Capital Spaceport region 1. Its instance '
                         f'angle byte is ${data[0x77a8 + 183 * 4]:02X} (#361).')
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
            if selection.get('floorLabels'):
                model['reason'] += (
                    f" Its {len(selection['floorLabels'])} Floor Label record(s) ride on"
                    ' region queues that are not retained, so none is published.'
                )
            if selection.get('wallTexts'):
                named = ', '.join(f'"{text["text"]}"' for text in selection['wallTexts'])
                model['reason'] += (
                    f' Its literal wall text {named} rides on region queues that are not'
                    ' retained, so none is published.'
                )
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
        'Interior residents carry a parent and a parent-local placement where their structure '
        'group is one a pinned capture binds and the live $ABDC matches the static decode: '
        'Vesta group $05 cells $64 (VESTA PARLIAMENT) and $73 (GUM STORE), and Dion group $02. '
        'Three Dion records decode a parent but are not placed, because the derived local '
        'position falls outside the parent extent: slots 102, 66 and 34. Seven Vesta residents '
        'above level 0 are placed without insertions, because the insertion group they name is '
        'absent from the parent structure\'s association list, which is the list bound at '
        'level 0; the interior list is unreached '
        '(https://github.com/odogono/mercenary/issues/331). The ten Dion residents in groups '
        '$1B and $1C are not placed: no pinned capture binds either group, so they keep the '
        'disposition #324 records for Gaea group $0F -- bound to a static group record, named '
        'workspace identity unresolved.',
        'View-conditioned face groups, $8003/$8006/$8009 header states and object $6000 vector text are decoded as separate forms; the in-game selector for each form is named in the model conditions, not simulated.',
        'Eris cell ground/pad/road records at $1E000 retain $7000 object placements through existing address-based model identities; surface slot zero supplies palette zero for structureless cells, empty records are intentional and add no geometry at $056634, and $F0/$F4 joins remain view-conditioned.',
        'The sky and the ground band below the horizon are rendering-only state, not omitted geometry: $059CE2 fills the whole viewport in colour index 8 and the MFP Timer B handler at $052280 rewrites $FF8250 at scanline $7BFC, taking the sky from $7C86 and the band from the body workspace word at $7A1A. Each body surface publishes the two sky words the terminator at $050562 chooses between for $7C86 ($85DC + 4*body, night then day) and the rotation rate at $835C its accumulator advances by each VBL; the terminator itself is the reader\'s to run, from the position and the accumulator. The same terminator copies $7A14, the bound palette\'s base plus the signed word at base - 2, into $7A10 by day and $7A12, the base, by night, so every $80xx colour here is the night half and a dayColour beside it is the day half where the two differ. The scene slots below $F0 that $05499E allocates are excluded on the same footing: they are a per-frame slot numbering over the $1E000 corner longwords already decoded here, drawn as two-point edges at $054AD2, and research/damocles-st/scripts/ground-extent-check.py reconstructs the live list, lowest slot and $5E40 bytes from captured RAM alone.',
        'The documented zero-latch and $F0 post-plan constructors are retained, including the cell-derived door-key label; no discovered record carries an attachment omission. The $DF visual-change branch is accounted for: $059F64 reads the nine-entry $6364 table and substitutes character $DF for the entrance label glyph, while $04ED4A replays the same table over the $ABDC cell workspace to replace or clear an already-resident surface assembly. Neither introduces a record, and the table is all zero in every pinned capture, so neither branch is exercised by an observed state.',
        'Seven building-detail $60xx vector-text records retain their polygon geometry; inline text and live $CCA0 tokens use source filled/stroke glyphs.',
        'Every $6000 vector-text record in the census was inventoried: all 41 set the inline flag and none selects font 4, so the indirect-pointer and font-4 paths are unreached rather than unresolved. $CCA0 tokens divide into slot-derived labels, frame animations whose script is model data, structure-workspace face markers, and one live countdown.',
        'Every resident slot also carries Association A byte 3, decoded as placementClass. It is mutable placement state rather than identity: direct placement copies $7A39 over it at $0546FC and support placement inherits the support\'s, so a session departs from the authored value as objects move. $7A39 is the 3x3 zone of the intra-cell position against the bound structure\'s extent rectangle (docs/research/damocles-placement-class.md). The class is not the handling byte\'s low nibble; they disagree for 176 of the 241 resident slots.',
        'Every body surface carries its base colour and the 4096 x 4096 Surface Cell extent $058F64 masks positions onto; both axes wrap, so an extent whose upper bound is below its lower bound is a wrapped span rather than an empty one. The islands collection holds all 62 records of the per-body lists at $04BD1E, one entry a record: origin, coastline vertices and edge words, the backwards extent/core/exclusion boxes, land colour, structure group, the group record it binds and that group\'s area name. A record has no name of its own. 21 records share the coastline-less stub whose extent and core boxes are the whole coordinate plane, so $0560F2 answers core everywhere on those bodies -- land, no sea, no coast. The VOID slot\'s table entry is excluded because VOID is the space-as-place sentinel rather than a body surface. The classifier itself is not replayed here and the nearest-record metric at $056490 is not decoded. A surface placement names the Damocles Island whose origin equals the Structure Workspace origin it was placed against; resident coordinates come from the resident arrays, are already Body Coordinates, and name no record (docs/research/damocles-eris-islands.md, docs/research/damocles-island-census.md).',
        'Every resident slot carries the interaction byte the take handler tests, decoded as handling. Bit 4 refuses silently, bit 5 diverts to the refusal message, and the low nibble is the drop handler\'s rank pair: bits 0-1 are the support rank the slot supplies and bits 2-3 the support rank it requires; bits 6 and 7 are live state and are zero in the pinned capture. Nothing here selects a candidate: which object is selected is the per-frame nearest-drawn rule in docs/research/damocles-object-selection.md, not a catalogue field.',
        'Every resident slot carries boarding, what the board gate answers for it, with the gate\'s constants read from the refusal chooser and gate at $0542E0-$05434F rather than assumed. Boardable is the gate\'s two table facts, the bound at slot 23 and the model guard\'s single-Y-turn orientation command; the reach, region, Occupancy and VOID guards are live state and the key test asks the Carried Stack. Under the bound the chooser outcome, the paired slot at slot + 178 and the refusal string are published even where the model guard refuses, because the key test runs first; a paired slot with no instance is published as missing. No seated eye height is published: boarding puts the eye at the resident position plus 63 for every slot (docs/design/damocles-boarding-admission.md).',
        'The document carries craft, the craft pass as ADR 0051 runs it: all sixteen Craft Parameter Block entries at $055C80 with the routine class each entry\'s bra.w reaches, the pass\'s constants read as instruction operands with each opcode checked, the throttle key table at $0557D6, and the exponent and sine tables. The log table is checked against the rule the port regenerates it from and published only as a digest. The entries\' unread words +10 and +18 are left out (docs/research/damocles-craft-control.md).',
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
    board_gate = decode_board_gate(data)
    resident_ids = {f'object-slot-{slot}' for slot in range(1, 256)}
    instance_ids = {instance['id'] for instance in instances}
    for instance in instances:
        instance.setdefault('associationGroups', None)
        instance['boarding'] = None
        if instance['id'] in resident_ids:
            instance['boarding'] = resident_boarding(
                int(instance['id'].rsplit('-', 1)[1]),
                by_address[instance['model']].get('instanceOrientation'), board_gate,
                instance_ids,
                resident=instance['location'] is not None or instance['placement'] is not None)
    bind_floor_structures(models, by_address, tables, structure_bindings, data, hardware)
    bind_floor_palettes(models, data, hardware)
    label_fonts = {
        font for model in models
        for label in (model.get('structureSelection') or {}).get('floorLabels', [])
        for font in (label['font'], *([label['fallback']['font']] if 'fallback' in label else []))
    }
    return {'schemaVersion': SCHEMA_VERSION, 'title': 'Damocles', 'source': source, 'models': models, 'instances': instances,
            'bodies': bodies, 'islands': islands, 'places': places, 'tables': tables,
            'roadNetworks': road_networks,
            'floorLabelGlyphs': floor_label_glyphs(data, label_fonts),
            'craft': decode_craft(data),
            'coverage': coverage_ledger(models, tables, coverage_notes, disk_load, road_networks)}


SCHEMA_VERSION = 17
MODEL_INDEX_FIELDS = ('id', 'kind', 'name', 'recordClass', 'slots', 'status')
# The facts a game rule reads without drawing: a structure's storey pitch admits a structure
# residence, and a support's top decides a Drop. Indexed where the Model records them, so a
# Save can be validated before any Model file is read.
MODEL_INDEX_RULE_FIELDS = ('storeyHeight', 'supportTop')


def body_models(result: dict) -> dict[str, list[str]]:
    """Every Model id a Body can draw, keyed by body id: the Models of the Instances on it
    (a placed resident reaches its Body through its parent), the ground Models its road
    networks lay, and the interior each of those structures selects its detail from.
    A Body with nothing on it maps to an empty list."""
    instances = {instance['id']: instance for instance in result['instances']}
    models = {model['id']: model for model in result['models']}

    def body_of(instance: dict, seen: frozenset = frozenset()):
        if instance['location'] is not None:
            return instance['location']['body']
        placement = instance['placement']
        if placement is None or placement['parent'] in seen:
            return None
        return body_of(instances[placement['parent']], seen | {instance['id']})

    closure: dict[str, set] = {body['id']: set() for body in result['bodies']}
    for instance in result['instances']:
        body = body_of(instance)
        if body is not None:
            closure[body].add(instance['model'])
    for network in result['roadNetworks']:
        closure[network['body']].update(cell['model'] for cell in network['cells'] if cell['model'] is not None)
    for ids in closure.values():
        for model_id in list(ids):
            selection = models[model_id].get('structureSelection')
            if selection is not None:
                ids.add(selection['detailModel'])
    return {body: sorted(ids) for body, ids in closure.items()}


def split_catalogue(result: dict) -> tuple[dict, dict[str, dict]]:
    """The Catalogue as it is stored (ADR 0048): one shared document carrying everything
    but the Models, with a model index in extraction order and each Body's Model list, and
    one file per Model.
    Each Model file carries the run's source identity so a file from another run is
    refused on arrival rather than drawn."""
    closure = body_models(result)
    document = {key: value for key, value in result.items() if key != 'models'}
    document['schemaVersion'] = SCHEMA_VERSION
    document['bodies'] = [{**body, 'models': closure[body['id']]} for body in result['bodies']]
    document['modelIndex'] = [
        {**{field: model[field] for field in MODEL_INDEX_FIELDS},
         **{field: model[field] for field in MODEL_INDEX_RULE_FIELDS if field in model}}
        for model in result['models']]
    source = {'programSha256': result['source']['programSha256'], 'run': result['source']['run']}
    files = {model['id']: {'schemaVersion': SCHEMA_VERSION, 'source': source, 'model': model}
             for model in result['models']}
    return document, files


def write_catalogue(result: dict, output: Path) -> None:
    """Writes the shared document to `output` and each Model to `models/<id>.json` beside
    it, removing Model files this run no longer produces so the directory is exactly the
    index. Both are indented and key-sorted so a regenerated Model reads as its own diff."""
    document, files = split_catalogue(result)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(document, indent=2, sort_keys=True) + '\n')
    directory = output.parent / 'models'
    directory.mkdir(exist_ok=True)
    for stale in directory.glob('*.json'):
        if stale.stem not in files:
            stale.unlink()
    for model_id, file in files.items():
        (directory / f'{model_id}.json').write_text(json.dumps(file, indent=2, sort_keys=True) + '\n')


def read_catalogue(output: Path) -> dict:
    """The stored Catalogue read back whole, in the shape `extract` returns: the shared document
    at `output` with each Model reinserted from `models/` in index order, and without the index
    and Body lists the split derives. Reassembly is lossless (ADR 0048)."""
    document = json.loads(output.read_text())
    directory = output.parent / 'models'
    result = {key: value for key, value in document.items() if key != 'modelIndex'}
    result['bodies'] = [{key: value for key, value in body.items() if key != 'models'}
                        for body in document['bodies']]
    result['models'] = [json.loads((directory / f"{entry['id']}.json").read_text())['model']
                        for entry in document['modelIndex']]
    return result


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
    write_catalogue(result, args.output)
    from collections import Counter
    print(json.dumps({'models': len(result['models']), 'status': dict(Counter(m['status'] for m in result['models']))}))


if __name__ == '__main__':
    main()
