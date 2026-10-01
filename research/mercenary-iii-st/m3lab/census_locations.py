"""Read the full MIII location inventory and original-builder workspace captures.

This module decodes records, not original instructions. Group workspaces must
come from executing MIII's own $4F0F2 builder, stopped at $4F304. Its source
formats and the independently checked ranges are documented in
 docs/research/dion-full-location-recovery.md.
"""

from .census_objects import BODY_NAMES, body_name
from .geometry import cell_entry, resolve_structure, structure_record
from .ram import Ram, hexaddr

GROUP_ROOT_WORD = 0x1B10C
ISLAND_TABLE_POINTER = 0x4BD1E
SOURCE_RANGES = [
    (0x20CBC, 0x23ABD, '741c610872e50272367a8bf7ddcc898e50953fe75f5ebc57d425403060fe0aca'),
    (0x63002, 0x632F4, 'af1fafd38a0b628fd4bf0313b4f452d569a959db2e7b9b62768b7dea9e5212b4'),
    (0x796A, 0x7A6A, '4017d74af6074c66905919b453695ab0d893d67f83ec487670d8e48e063c9be6'),
]


def label(ram: Ram, address: int) -> str:
    """The original displays its twenty characters as two ten-character lines."""
    raw = ram.bytes(address, address + 20).decode('ascii')
    return ' '.join(' '.join(raw[i:i + 10].split()) for i in (0, 10)).strip()


def read_inventory(ram: Ram) -> dict:
    sources = [ram.require(lo, hi, digest, 'full location census')
               for lo, hi, digest in SOURCE_RANGES]
    table = ram.long(ISLAND_TABLE_POINTER)
    bodies = []
    placements = []
    for offset in range(0, 124, 4):
        start = table + ram.sword(table + offset // 2)
        cursor = start
        records = []
        for _ in range(256):
            if ram.word(cursor) == 0x8000:
                break
            record = {'body': offset, 'bodyName': body_name(ram, offset),
                      'address': hexaddr(cursor),
                      'origin': [ram.sword(cursor), ram.sword(cursor + 2)],
                      'geometry': hexaddr(cursor + ram.sword(cursor + 4)),
                      'group': ram.word(cursor + 6),
                      'landColour': ram.word(cursor + 8)}
            records.append(record)
            placements.append(record)
            cursor += 10
        else:
            raise ValueError('island descriptor list has no terminator')
        bodies.append({'offset': offset, 'name': body_name(ram, offset),
                       'records': records, 'provenance': ram.slice(start, cursor + 2)})
    root = 0x1AAC0 + ram.sword(GROUP_ROOT_WORD)
    count = ram.sword(root) // 2 - 1
    if count != 57 or ram.word(root + 2 * count) != 0:
        raise ValueError('group inventory extent or sentinel disagrees')
    groups = []
    for group in range(count):
        start = root + ram.sword(root + group * 2)
        cursor = start + 2
        for _ in range(256):
            if ram.byte(cursor) == 0:
                break
            cursor += 3
        else:
            raise ValueError('extent stream has no terminator')
        cursor += 9  # zero, two colour bytes, six ground selectors
        cells = {}
        overrides = []
        for _ in range(1024):
            if ram.byte(cursor) == 0xFF:
                break
            address = cursor
            reference, cell, low = ram.bytes(cursor, cursor + 3)
            cursor += 3
            high = dx = dz = 0
            if low:
                high, dx, dz = (ram.byte(cursor), ram.sbyte(cursor + 1),
                                ram.sbyte(cursor + 2))
                cursor += 3
            record = {'cell': cell, 'slot': ((high << 8) | low) & 0x1FF,
                      'key': high & 0xFE, 'dx': dx, 'dz': dz,
                      'groundReference': reference, 'address': hexaddr(address)}
            overrides.append(record)
            cells[cell] = record  # a later authored write replaces the same cell
        else:
            raise ValueError('cell override list has no terminator')
        cursor += 1
        label_address = cursor
        area = ''
        labels = []
        if ram.byte(cursor):
            area = label(ram, cursor)
            cursor += 20
            for _ in range(256):
                cell = ram.byte(cursor)
                if cell == 0:
                    break
                labels.append({'cell': cell, 'name': label(ram, cursor + 1),
                               'address': hexaddr(cursor)})
                cursor += 21
            else:
                raise ValueError('place label list has no terminator')
        cursor += 1
        groups.append({'id': group, 'stream': hexaddr(start), 'area': area,
                       'labelAddress': hexaddr(label_address), 'labels': labels,
                       'cells': sorted(cells.values(), key=lambda c: c['cell']),
                       'overrides': overrides,
                       'placements': [p for p in placements if p['group'] == group],
                       'provenance': ram.slice(start, cursor)})
    if any(p['group'] >= count for p in placements):
        raise ValueError('island names a group outside the inventory')
    return {'ramSha256': ram.sha256, 'bodies': bodies, 'groups': groups,
            'sourceRanges': sources}


def structure_floors(ram: Ram, slot: int) -> dict:
    """$5612A/$56D66: eleven floor entries, not the twelfth padding byte."""
    record = structure_record(ram, slot)
    first = ram.word(record)
    if not first & 0x8000:
        return {'pitch': None, 'floors': [{'floor': 0, 'geometrySlot': slot}]}
    return {'pitch': first & 0x7FFF,
            'floors': [{'floor': floor, 'geometrySlot': ram.byte(record + 6 + floor)}
                       for floor in range(11) if ram.byte(record + 6 + floor)]}


def describe_cell(ram: Ram, entry: dict) -> dict:
    resolved = resolve_structure(ram, entry['slot'])
    return {**entry, **{k: resolved[k] for k in ('alias', 'geometrySlot', 'scale',
                                               'palette', 'detail')},
            'record': hexaddr(resolved['record']),
            'slotRecord': hexaddr(structure_record(ram, entry['slot'])),
            **structure_floors(ram, entry['slot'])}


def read_workspace(ram: Ram, group: int) -> dict:
    """Read all occupied cells of a captured original-builder result."""
    if ram.word(0x6FDE) != group:
        raise ValueError(f'workspace is group {ram.word(0x6FDE)}, expected {group}')
    inventory = read_inventory(ram)
    if ram.long(0x7100) != int(inventory['groups'][group]['labelAddress'][1:], 16):
        raise ValueError('workspace labels disagree with the authored group')
    cells = []
    for number in range(256):
        entry = cell_entry(ram, number)
        if entry['slot']:
            cells.append(describe_cell(ram, entry))
    return {'group': group, 'uniform': bool(ram.word(0x70C0)), 'cells': cells,
            'provenance': ram.slice(0x4CF0, 0x50F0)}
