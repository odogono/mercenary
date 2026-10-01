"""Recover title-local Dion Floors and initial resident association bindings (#683).

$560F4..$5614C binds the host alias's scale, detail and Floor Table; $56DAA..
$56E5A selects a Floor's geometry directly and its parallel palette if the host
palette is zero. $53C7C..$53CB6 selects residents by group/cell/Floor/association;
$5B3A6..$5B3F8 inserts them in a region queue. Hooks affect drawing order, never
coordinates. Records and captures stay restricted until #684 exports them.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from .boot import REPOSITORY, BASELINE
from .catalogue_surface import digest, lettering
from .census_locations import read_inventory, structure_floors
from .census_objects import extract_objects
from .geometry import (cell_entry, decode_detail, decode_structure,
                       detail_record, resolve_structure, structure_record, signed16)
from .ram import Ram, hexaddr


def floor_binding(ram: Ram, slot: int, floor: int) -> dict:
    """One direct geometry lookup, with the selected host's metadata preserved."""
    if not 0 <= floor <= 10:
        raise ValueError(f'Floor {floor} is outside 0..10')
    host = structure_record(ram, slot)
    if slot == 46 and floor and structure_record(ram, 47) == host + 8:
        raise ValueError(f'slot 46 Floor {floor} exceeds its compact alias record')
    resolved = resolve_structure(ram, slot)
    if resolved['alias'] is None:
        if floor != 0:
            raise ValueError(f'slot {slot} Floor {floor} is unbound')
        geometry, palette, pitch = slot, resolved['palette'], None
    else:
        geometry = ram.byte(host + 6 + floor)
        if not geometry:
            raise ValueError(f'slot {slot} Floor {floor} is unbound')
        palette = ram.byte(host + 4) or ram.byte(host + 18 + floor)
        pitch = ram.word(host) & 0x7FFF
    record = structure_record(ram, geometry)
    if ram.word(record) & 0x8000:
        raise ValueError(f'slot {slot} Floor {floor} selects alias {geometry}; original does not recurse')
    return {'floor': floor, 'label': 'G' if floor == 0 else 'B' if floor == 10 else str(floor),
            'geometrySlot': geometry, 'record': record, 'geometry': f'structure-{record:06x}',
            'scale': resolved['scale'], 'detail': resolved['detail'], 'palette': palette,
            'pitch': pitch, 'baseY': floor * (pitch or 0),
            'provenance': ([ram.slice(host, host + 7 + floor)] +
                           ([ram.slice(host + 18 + floor, host + 19 + floor)]
                            if ram.byte(host + 4) == 0 else [])) if resolved['alias'] is not None
                          else [ram.slice(record - 8, record)]}


def association_hooks(structure: dict, association: int) -> list[list[int]]:
    """The default own-region tail and explicit (region, queue-token) hooks."""
    entry = next((a for a in structure['associations'] if a['id'] == association), None)
    if entry is None:
        raise ValueError(f'missing association {association}')
    hooks = [[association, 0], *entry['hooks']]
    for region, token in hooks:
        if not 1 <= region <= len(structure['regions']):
            raise ValueError(f'association {association} names missing region {region}')
    return hooks


def local_position(position: list[int], origin: list[int], base_y: int) -> list[int]:
    """World X/Z low words relative to the cell's structure origin; Y in units."""
    return [signed16(position[0] - origin[0]), position[1] - base_y,
            signed16(position[2] - origin[1])]


def extract_interiors(census: Path) -> dict:
    opening = Ram.load(census / 'start.ram')
    inventory = read_inventory(opening)
    objects = extract_objects(opening)['objects']
    selected = {c['slot'] for g in inventory['groups'] for c in g['cells'] if c['slot']}
    geometry, structures = {}, {}
    raw_slots, authored_slots = set(), set()
    for slot in sorted(selected):
        raw = structure_floors(opening, slot)
        raw_slots.update(f['geometrySlot'] for f in raw['floors'])
        resolved = resolve_structure(opening, slot)
        rows = raw['floors']
        non_floors = None
        # The census faithfully reports the reader's eleven bytes, including
        # slot46's overread into slot47. Its compact alias is only eight bytes.
        # It has no indoor or lift region, so the extra bytes are not selectable.
        host_record = structure_record(opening, slot)
        if slot == 46:
            if structure_record(opening, 47) != host_record + 8 or opening.byte(host_record + 7):
                raise ValueError('compact alias 46 disagrees with the pinned record boundary')
            ground = decode_structure(opening, resolved['record'], resolved['scale'])
            if any(r['flags'] & 0x2000 for r in ground['regions']) or ground['associations']:
                raise ValueError('compact alias 46 unexpectedly has a lift or residents')
            non_floors = {**opening.slice(host_record + 8, host_record + 17),
                          'entries': [r for r in rows if r['floor']],
                          'disposition': 'next-alias-record', 'nextSlot': 47}
            rows = [r for r in rows if r['floor'] == 0]
        floors = []
        for row in rows:
            f = floor_binding(opening, slot, row['floor'])
            authored_slots.add(f['geometrySlot'])
            variant = f"scale={f['scale'][0]},{f['scale'][1]}"
            entry = geometry.setdefault(f['geometry'], {
                'id': f['geometry'], 'family': 'structure', 'record': hexaddr(f['record']), 'variants': {}})
            entry['variants'][variant] = decode_structure(opening, f['record'], f['scale'])
            # Export every Floor's resolved metadata, not a second set of model placements.
            floors.append({**f, 'record': hexaddr(f['record']), 'variant': variant})
        detail = detail_record(opening, resolved['detail'])
        detail_id = f'detail-{detail:06x}'
        entry = geometry.setdefault(detail_id, {'id': detail_id, 'family': 'detail',
                                                'record': hexaddr(detail), 'variants': {
                                                    'base': decode_detail(opening, resolved['detail'])}})
        scales = entry.setdefault('scales', [])
        if resolved['scale'] not in scales:
            scales.append(resolved['scale'])
        structures[str(slot)] = {'slot': slot, 'alias': resolved['alias'], 'pitch': raw['pitch'],
                                 'detail': detail_id, 'floors': floors,
                                 **({'nonFloorBytes': non_floors} if non_floors else {})}

    residents = []
    workspaces = {}
    for o in objects:
        if o['residence'] != 'structure':
            continue
        group = o['group']
        if group not in workspaces:
            relative = ('midas/group-56-uniform.ram' if group == 56
                        else f'all-groups/group-{group:02d}.ram')
            ram = Ram.load(census / relative)
            if ram.word(0x6FDE) != group or (group == 56 and not ram.word(0x70C0)):
                raise ValueError(f'resident workspace {group} has wrong group or field mode')
            workspaces[group] = ram
        ram = workspaces[group]
        cell = cell_entry(ram, o['cell'])
        floors = structures[str(cell['slot'])]['floors']
        floor = next((f for f in floors if f['floor'] == o['floor']), None)
        if floor is None:
            raise ValueError(f"resident {o['slot']} has missing Floor {o['floor']}")
        structure = geometry[floor['geometry']]['variants'][floor['variant']]
        hooks = association_hooks(structure, o['association'])
        x, _, z = o['position']
        body_cell = [(x // 65536) % 4096, (z // 65536) % 4096]
        matching = [p for p in inventory['groups'][group]['placements'] if p['body'] == o['bodyOffset']]
        if len(matching) != 1:
            raise ValueError(f"resident {o['slot']} does not identify one Body island")
        island = matching[0]
        local_cell = [(body_cell[i] - island['origin'][i]) % 4096 for i in (0, 1)]
        period_cell = (local_cell[0] % 16) + 16 * (local_cell[1] % 16)
        if period_cell != o['cell'] or (group != 56 and any(c >= 16 for c in local_cell)):
            raise ValueError(f"resident {o['slot']} Body cell and group workspace disagree")
        residents.append({
            'slot': o['slot'], 'body': f"body-{o['bodyOffset'] // 4:02d}", 'bodyCell': body_cell,
            'group': group, 'cell': o['cell'], 'structureSlot': cell['slot'], 'floor': o['floor'],
            'geometry': floor['geometry'], 'variant': floor['variant'],
            'association': o['association'], 'hooks': hooks,
            'dormantHooks': [h for h in hooks if h[1] and h[1] not in structure['regions'][h[0] - 1]['queue']],
            'host': {'field': 'midas', 'cell': o['cell']} if group == 56 else
                    {'binding': f"placement-{group:02d}-{o['cell']:02x}"},
            'position': o['position'], 'localPosition': local_position(o['position'], cell['origin'], floor['baseY']),
            'origin': cell['origin'], 'baseY': floor['baseY'], 'yaw': o['yaw'],
            'provenance': o['provenance'] + [cell['provenance']],
            'workspaceRamSha256': ram.sha256,
            'reachability': 'unverified',
        })
    for entry in geometry.values():
        entry['variants'] = dict(sorted(entry['variants'].items()))
        if 'scales' in entry:
            entry['scales'].sort()
        entry['sha256'] = digest(entry)
    return {'geometry': dict(sorted(geometry.items())), 'structures': structures, 'residents': residents,
            'floorInventory': {'rawSlots': len(raw_slots), 'authoredSlots': len(authored_slots),
                               'rawSlotIds': sorted(raw_slots), 'authoredSlotIds': sorted(authored_slots)},
            'lettering': lettering(opening),
            'source': {'title': 'dion', 'programSha256': BASELINE['programImage']['sha256'],
                       'census': census.name, 'openingRamSha256': opening.sha256,
                       'readers': [opening.slice(lo, hi) for lo, hi in (
                           (0x560E2, 0x5617E), (0x56D66, 0x56E5E), (0x53C5E, 0x53CC4),
                           (0x5AD30, 0x5B2D0), (0x5B3A6, 0x5B48E))]}}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--census', required=True, type=Path)
    parser.add_argument('--out', required=True, type=Path)
    args = parser.parse_args()
    if not args.out.resolve().is_relative_to((REPOSITORY / 'restricted').resolve()):
        raise SystemExit('recovered records stay under restricted/ until #684 exports them')
    extraction = extract_interiors(args.census)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(extraction, sort_keys=True, indent=1) + '\n')
    print(f"Wrote {len(extraction['geometry'])} geometry records and {len(extraction['residents'])} residents to {args.out}")


if __name__ == '__main__':
    main()
