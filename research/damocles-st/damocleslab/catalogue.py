"""Independent decoder of documented Damocles geometric records (ADR 0039).

This is a data parser, not a port of the renderer. Unknown commands fail closed.
See docs/research/damocles-catalogue.md for the recovered record grammar.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import struct
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


def decode_mesh(data: bytes, start: int, kind: str, palette: list[int] | None = None,
                hardware: list[int] | None = None) -> dict:
    reader = Reader(data, start)
    patches: dict[int, int] = {}
    display_code = None
    label_anchor = None
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
                raise ValueError('null model: no geometry')
            if command == 0x8001:
                mode = reader.word()
                if mode & 0x80:
                    raise ValueError('articulated model transform unresolved')
                break  # orientation is an instance property, not baked into the model
            if command in (0x8002, 0x8007, 0x800b):
                break  # name substitution / far-distance marker, no local vertex change
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
    vertices = []
    for _ in range(256):
        x = reader.signed()
        if x == -32768 or (kind == 'interior' and x == -32767):
            if x == -32767:
                raise ValueError('articulated interior unresolved')
            break
        y, z = reader.signed(), reader.signed()
        # Detail/interior records use a negative Y as an articulation tag.
        # A neutral inspection pose has zero articulation; the height is complemented.
        vertices.append([x, ~y if kind == 'interior' and y < 0 else y, z])
    else:
        raise ValueError('vertex terminator missing')
    if not vertices:
        raise ValueError('model has no vertices')
    body_vertex_count = len(vertices)
    if kind == 'object':
        if reader.word() != 0:
            raise ValueError('view-conditioned face groups unresolved')
    faces, lines = [], []
    for _ in range(2048):
        address = reader.p
        raw = reader.take(2)
        colour = (patches.get(address, raw[0]) << 8) | patches.get(address + 1, raw[1])
        if colour == 0:
            if not faces and not lines:
                raise ValueError('model has no drawable primitives')
            if display_code is not None and label_anchor is None:
                raise ValueError('key vector-text record missing')
            return {'vertices': vertices, 'faces': faces, 'lines': lines,
                    'sourceStart': start, 'sourceEnd': reader.p, 'geometryStart': geometry_start,
                    **({'displayCode': display_code, 'labelAnchor': label_anchor}
                       if label_anchor is not None else {})}
        if colour == 0x6000 and display_code is not None:
            # Special records align their parameters to an even RAM address.
            reader.p &= ~1
            label_anchor = decode_key_lettering(data, reader, display_code, vertices, lines, hardware)
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
        if any(ref == 0 or ref % 4 or ref // 4 > body_vertex_count for ref in refs):
            raise ValueError(f'invalid vertex reference at ${address:06x}')
        if len(refs) < (2 if line else 3):
            raise ValueError('degenerate polygon record')
        primitive = {'vertices': [ref // 4 - 1 for ref in refs],
                     'colour': colour_value(colour, palette, hardware), 'sourceColour': colour}
        (lines if line else faces).append(primitive)
    raise ValueError('face terminator missing')


def decode_structure(data: bytes, start: int, palette: list[int] | None = None,
                     hardware: list[int] | None = None, scale: tuple[int, int] | None = None,
                     third_height: int | None = None) -> tuple[dict, list[str]]:
    reader = Reader(data, start)
    height, lower = reader.signed(), reader.signed()
    if height < 0:
        raise ValueError('structure alias must be resolved before geometry')
    reader.take(4)  # two ground/scene colours, not wall colours
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
        raise ValueError('no supported surface faces')
    return {'vertices': vertices, 'faces': faces, 'lines': [], 'sourceStart': start, 'sourceEnd': reader.p}, sorted(set(gaps))


# Cell-local ground records at $1E000: $54E8E transform nybbles, then $8000-relative X/Z.
GROUND_ORIENT = bytes.fromhex('0006030501040207')
GROUND_JOIN = {0xF0, 0xF4}


def decode_ground(data: bytes, start: int, orientation: int,
                  palette: list[int] | None = None,
                  hardware: list[int] | None = None) -> tuple[dict, list[str], int]:
    """Decode one per-cell ground/pad/road record. Neighbor-join sentinels are omitted."""
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
    vertices, faces, lines, gaps = [], [], [], []
    for source_index in range(1024):
        colour = reader.word()
        if colour == 0:
            break
        if colour & 0x4000:
            if colour & 0x2000:
                gaps.append(
                    'Ground command with bit 13 set ($53F76 family, including $7000 road templates) is not yet decoded.'
                )
                break
            kept, dropped = _ground_indices(list(reader.take(2)), len(plan))
            if dropped:
                gaps.append(
                    'Ground edge references neighboring-cell workspace slots that this cell record does not contain.'
                )
            elif len(kept) == 2:
                rgb = colour_value(colour & ~0x4000, palette, hardware)
                offset = len(vertices)
                vertices.extend(plan[index] for index in kept)
                lines.append({'vertices': [offset, offset + 1], 'colour': rgb,
                              'sourceColour': colour & ~0x4000, 'sourceIndex': source_index})
            continue
        refs = []
        for _ in range(256):
            ref = reader.take(1)[0]
            if ref == 0:
                break
            refs.append(ref)
        else:
            raise ValueError('ground polygon terminator missing')
        kept, dropped = _ground_indices(refs, len(plan))
        if dropped:
            gaps.append(
                'Neighbor-join sentinels $F0/$F4 were omitted; the remaining local polygon is kept.'
            )
        if len(kept) >= 3:
            rgb = colour_value(colour, palette, hardware)
            offset = len(vertices)
            vertices.extend(plan[index] for index in kept)
            faces.append({'vertices': list(range(offset, offset + len(kept))), 'colour': rgb,
                          'sourceColour': colour, 'sourceIndex': source_index, 'doubleSided': True})
        elif refs:
            gaps.append('Ground polygon had too few local vertices after omitting neighbor-join sentinels.')
    else:
        raise ValueError('ground primitive terminator missing')
    if not faces and not lines:
        gaps.append('Empty ground record: default cell fill is not stored as a vertex list.')
    return ({'vertices': vertices, 'faces': faces, 'lines': lines, 'sourceStart': start,
             'sourceEnd': reader.p}, sorted(set(gaps)), transform)


def _ground_indices(refs: list[int], count: int) -> tuple[list[int], bool]:
    kept, dropped = [], False
    for ref in refs:
        if ref in GROUND_JOIN:
            dropped = True
            continue
        if ref == 0 or ref % 4:
            raise ValueError('invalid ground vertex reference')
        index = ref // 4 - 1
        if not 0 <= index < count:
            dropped = True
            continue
        kept.append(index)
    return kept, dropped


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


def extract(data: bytes, source: dict) -> dict:
    """Catalogue all entries of the bounded resident tables, never a byte scan."""
    if len(data) != 1048576 or u32(data, 0x4bd10) != 0x35700 or u32(data, 0x4bd22) != 0x26000:
        raise ValueError('not a loaded pinned Damocles world capture')
    models, tables, instances = [], [], []
    hardware = list(struct.unpack_from('>16H', data, 0x6fd00))
    # Table extents established by their next independently decoded data records.
    specs = [('object', 0x35700, 378), ('structure', 0xe900, 280), ('interior', 0x26000, 130)]
    by_address = {}
    structure_bindings = {}
    structure_aliases = []
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
                    third_height = None
                    if identity == 'structure-01484e' and int.from_bytes(data[0x7af0:0x7af2], 'big') == 74:
                        third_height = struct.unpack_from('>h', data, 0x7b2a)[0]
                    mesh, gaps = decode_structure(data, pointer, palette_at(data, palette_index), hardware, scale, third_height)
                    model['variants'] = [{'id': 'record', 'name': f'Recovered form · palette {palette_index}', 'mesh': mesh}]
                    model['status'] = 'partial' if gaps else 'decoded'
                    model['reason'] = ' '.join(gaps)
                    model['interiorSlot'] = interior
                    continue
                mesh = decode_mesh(data, address, kind, palette_at(data, 0) if kind == 'interior' else None, hardware)
                model['variants'] = [{
                    'id': 'record',
                    'name': 'Recovered form' if kind == 'object' else 'Palette 0 (binding unverified)',
                    'mesh': mesh,
                    **({'inspectionAngle': [0.65, 0.3]} if identity == 'object-036176' else {}),
                }]
                model['status'] = 'decoded' if kind == 'object' else 'partial'
                model['reason'] = '' if kind == 'object' else 'Building-detail shape decoded; place-specific palette and visibility groups are not bound.'
                if kind == 'object' and 'displayCode' in mesh:
                    model['evidence'] = [{
                        'claim': f"Source $8008 header selects shared key geometry and display code {mesh['displayCode']} at local anchor {mesh['labelAnchor']}.",
                        'confidence': 'verified',
                        'source': 'docs/research/damocles-spaceport-interior.md',
                    }]
            except (ValueError, struct.error) as error:
                model['reason'] = str(error)
        tables.append({'kind': kind, 'address': base, 'entryCount': count, 'entries': entries,
                       'extentEvidence': 'Contiguous relative-pointer table up to the following data record; extent is provisional.'})
    for alias, target in structure_aliases:
        by_address[target]['relatedModels'].append(alias)
    ground_entries = []
    ground_cells: list[tuple[int, str]] = []
    for cell in range(256):
        offset = int.from_bytes(data[0x1e400 + cell * 2:0x1e402 + cell * 2], 'big')
        address = 0x1e000 + offset
        structure_slot = struct.unpack_from('>H', data, 0xabdc + cell * 4)[0] & 0x1FF
        palette = None
        if structure_slot and structure_slot < len(tables[1]['entries']):
            palette = palette_at(
                data, by_address[tables[1]['entries'][structure_slot]].get('paletteIndex') or 0
            )
        try:
            mesh, gaps, transform = decode_ground(
                data, address, data[0x83dc + cell], palette, hardware
            )
        except (ValueError, struct.error) as error:
            mesh, gaps, transform = (
                {'vertices': [], 'faces': [], 'lines': [], 'sourceStart': address, 'sourceEnd': address},
                [str(error)],
                0xFF,
            )
        identity = f'ground-{address:06x}-{transform:02x}'
        ground_entries.append(identity)
        ground_cells.append((cell, identity))
        if identity in by_address:
            by_address[identity]['slots'].append(cell)
            continue
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
            'relatedModels': [],
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
            model['reason'] = ' '.join(gaps) or 'Empty ground record: default cell fill is not stored as a vertex list.'
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
    origin_x = (u32(data, 0x7a92) - u32(data, 0x7a2c)) / 65536
    origin_z = (u32(data, 0x7a9a) - u32(data, 0x7a34)) / 65536
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
                          'placement': None,
                          'location': {'body': 'body-11', 'place': place[0] if place else None,
                            'position': [origin_x + (cell & 15) + 0.5 + dx * 30 / 65536, 0, origin_z + (cell >> 4) + 0.5 + dz * 30 / 65536],
                            'coordinateSystem': 'ST surface grid units (body-local origin unresolved)', 'heading': None},
                          'reason': 'Recovered first-world surface workspace placement; not a census of the whole body.'})
        if place:
            next(p for p in places if p['id'] == place[0])['instances'].append(identity)
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
            'placement': None,
            'location': {
                'body': 'body-11',
                'place': place[0] if place else None,
                'position': [origin_x + (cell & 15) + 0.5, 0, origin_z + (cell >> 4) + 0.5],
                'coordinateSystem': 'ST surface grid units (body-local origin unresolved)',
                'heading': None,
            },
            'reason': 'Recovered first-world cell ground/pad/road record; default empty cells are omitted.',
        })
        model['linkedInstances'].append(identity)
        if place:
            next(p for p in places if p['id'] == place[0])['instances'].append(identity)
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
    interior_palettes = {}
    for model in models:
        if 'interiorSlot' in model:
            slot = model.pop('interiorSlot')
            if slot < len(tables[2]['entries']):
                target = tables[2]['entries'][slot]
                model['relatedModels'].append(target)
                interior_palettes.setdefault(target, set()).add(model['paletteIndex'])
        model.pop('paletteIndex', None)
    for identity, palettes in interior_palettes.items():
        model = by_address[identity]
        variants = []
        for index in sorted(palettes):
            try:
                mesh = decode_mesh(data, model['sourceAddress'], 'interior', palette_at(data, index), hardware)
                variants.append({'id': f'palette-{index}', 'name': f'Structure-bound palette {index}', 'mesh': mesh})
            except ValueError:
                continue
        if variants:
            model['variants'] = variants
            model['status'] = 'partial'
            model['reason'] = 'Shape and structure-bound colours decoded. View-conditioned visibility, articulated parts, and external view are not simulated.'
    for identity, (slot, palette_index, scale) in structure_bindings.items():
        if slot >= len(tables[2]['entries']):
            continue
        model = by_address[identity]
        detail = by_address[tables[2]['entries'][slot]]
        variant = next((v for v in detail['variants'] if v['id'] == f'palette-{palette_index}'), None)
        if variant is None:
            if model['status'] == 'decoded':
                model['status'] = 'partial'
            model['reason'] = (model['reason'] + ' Linked building detail geometry is unresolved.').strip()
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
        combined = assemble_mesh(base, variant['mesh'], scale)
        model['variants'] = [{'id': 'assembly', 'name': f'Structure and detail · palette {palette_index}', 'mesh': combined}]
        # Detail tables include view-conditioned external and internal geometry.
        model['status'] = 'partial'
        model['reason'] = (model['reason'] + ' Includes linked exterior/interior detail in its neutral pose; view-conditioned visibility is not simulated.').strip()
    # Model headers which jump to a shared vertex stream provide evidence for visual variants.
    forms = {}
    for model in models:
        if model['kind'] == 'object' and model['variants']:
            key = model['variants'][0]['mesh']['geometryStart']
            forms.setdefault(key, []).append(model)
    for group in forms.values():
        if len(group) < 2:
            continue
        variants = [{'id': model['id'], 'name': model['name'] + ' · ' + model['id'], 'mesh': model['variants'][0]['mesh']} for model in group]
        for model in group:
            model['variants'] = variants
            model['relatedModels'].extend(other['id'] for other in group if other is not model)
    return {'schemaVersion': 5, 'title': 'Damocles', 'source': source, 'models': models, 'instances': instances,
            'bodies': bodies, 'places': places, 'tables': tables,
            'coverage': {'complete': False, 'notes': ['Resident first-world census; not a claim of complete disk coverage.',
                'Conditional geometry, surface attachments, scene palette binding, other-body structures and named places remain incomplete.',
                'Eris cell ground/pad/road records at $1E000 are decoded locally; $7000 road templates, $53F76 attachments and default empty-cell fill remain incomplete.',
                'Unexamined disk-loaded content and script-created visual changes are not included.']}}


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
    args = parser.parse_args()
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
              'evidence': 'docs/research/damocles-catalogue.md'}
    result = extract(data, source)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, sort_keys=True) + '\n')
    from collections import Counter
    print(json.dumps({'models': len(result['models']), 'status': dict(Counter(m['status'] for m in result['models']))}))


if __name__ == '__main__':
    main()
