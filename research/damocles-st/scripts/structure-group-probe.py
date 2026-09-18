#!/usr/bin/env python3
"""Decode Damocles structure-group maps and the cell instances they author (#325).

#172 recovered one parent link by hand, for `KEY - 99 CHEVY` on Eris: the static
structure-group table at ``$1E64C`` to the group-offset root, the authored group
record, the map decoder's cell override, and the structure it selects. Dion and
Vesta have live surface workspaces and validated arrival poses but no such
traversal, so 29 Dion residents across 18 scenes and 10 Vesta residents across 6
carry scene selectors with no parent and no local placement.

This tool performs that traversal mechanically. The record format is read from
the map decoder at ``$4EB60``-``$4ED14`` and the instance consumer at
``$54CB0``-``$54E28``:

    +0   word   header (the decoder skips it)
    +2          run-length cell-extent stream, building the 16x16 grid at
                $1E000; each row/column run is three bytes; a zero byte ends it
                2 bytes -> $7AEE / $7AEF
                6 bytes -> indices into $1E64E, words copied to $1E640..
                cell-override list, until a source-reference byte of $FF:
                    [srcRef, cell, b1] and, when b1 is non-zero, [b0, dx, dz]
                place list -> $7A6C

The override's ``(b0 << 8) | b1`` word is **not** an instance transform. Its low
nine bits are the structure slot -- bit 8 is bit 0 of the high byte, which is why
``$54D44`` masks nine bits and not eight -- and bits 1-7 of the high byte are a
scene selector, dispatched in three disjoint ranges at ``$54CC8``-``$54D28``.
The instance's own scale, palette, Building detail and base structure come from
the alias record the slot selects, not from this word, and the scale pair is
signed, so it carries reflection.

Nothing here is injected or inferred: every field is read at an address the
listing names. The self-checks are gates, not prints. They reproduce #172's
published Eris values and, for each memstate supplied, require the static decode
to reproduce the ``$ABDC`` table and place-list pointer the running game built.

Usage (from the repository root):

  python3 research/damocles-st/scripts/structure-group-probe.py \\
      --run research/damocles-st/work/observe-first-world-<id> \\
      --memstate research/damocles-st/snapshots/dion-2-3.sav \\
      --memstate research/damocles-st/snapshots/vesta-parliament-4-6.sav

  ... --group 0x02 --group 0x05        # restrict the group report
  ... --json                           # machine-readable

See docs/research/damocles-dion-vesta-structure-groups.md for the findings.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
import sys
from pathlib import Path

LAB_ROOT = Path(__file__).resolve().parents[1]
REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(LAB_ROOT))

from damocleslab.catalogue import (  # noqa: E402
    decode_structure,
    decode_structure_associations,
    decode_structure_selection,
    hatari_memstate_ram,
    palette_at,
    third_wall_height,
    validate_source,
)
from damocleslab.core import LabError  # noqa: E402
from damocleslab.laboratory import verify  # noqa: E402

CATALOGUE = REPO / 'payload' / 'damocles' / 'catalogue.json'

# Addresses the listings name.
GROUP_TABLE_PTR = 0x1E64C       # word: group-offset root, relative to $1E000
DATA_BASE = 0x1E000
CELL_GRID = 0x1E000             # 256 entries x 4 bytes, built by the RLE stream
SELECTOR_TABLE = 0x1E64E        # source-reference words
LIVE_OVERRIDES = 0xABDC         # 256 entries x 4 bytes: [b0, b1, dx, dz]
PLACE_LIST_PTR = 0x7A6C
ASSOCIATION_ROOT = 0x7B0E       # the root $05A2FA publishes for the bound structure
STRUCTURE_PTR_BASE = 0x4BD0C    # long: base of the structure pointer table
INTERIOR_PTR_BASE = 0x4BD22     # long: base of the Building detail pointer table
CELL_OFFSET_SCALE = 0x4BD14     # word: 30
BOUND_GROUP = 0x794E
PLAYER_CELL = 0x7B5C
SCENE_SELECTOR = 0x7AF8
SCENE_INDEX = 0x7AFA
INSTANCE_SLOT = 0x7AF0          # the *base* slot, after alias resolution
CELL_ORIGIN_X = 0x7AF2
CELL_ORIGIN_Z = 0x7AF4

SLOT_MASK = 0x1FF
CELL_ORIGIN_BIAS = 0x8000

# #172's published values for the one parent recovered by hand, used as a gate.
ERIS_REFERENCE = {
    'group': 0x14, 'cell': 0x26, 'sourceRef': 0x60, 'word': 0x0091,
    'dx': -33, 'dz': -125, 'slot': 145,
    'overrideAt': 0x251D7, 'overrideBytes': '60269100df83',
    'alias': {'plan': 200, 'scale': '3/2', 'palette': 44, 'detail': 58, 'base': 60},
    'interior': 0x02CE86,
    # #172 walked this assembly's association list by hand and published both
    # the root and the mapping insertion group $03 selects.
    'associationRoot': 0x013218,
    'insertionGroup': 0x03,
    'insertions': {4: 0x00, 5: 0x07, 6: 0x07, 7: 0x07, 8: 0x17},
}

HARDWARE_PALETTE = 0x6FD00


def u16(ram: bytes, address: int) -> int:
    return struct.unpack_from('>H', ram, address)[0]


def u32(ram: bytes, address: int) -> int:
    return struct.unpack_from('>I', ram, address)[0]


def s8(ram: bytes, address: int) -> int:
    return struct.unpack_from('>b', ram, address)[0]


def group_root(ram: bytes) -> int:
    return DATA_BASE + u16(ram, GROUP_TABLE_PTR)


def group_record(ram: bytes, group: int) -> int:
    if not 0 <= group <= 0xFF:
        raise LabError(f'group selector ${group:02X} is out of range')
    root = group_root(ram)
    return root + u16(ram, root + group * 2)


def parse_group(ram: bytes, group: int) -> dict:
    """Walk one authored group record exactly as ``$4EB60``-``$4ED14`` does."""
    record = group_record(ram, group)
    cursor = record + 2
    runs = []
    while True:                                   # $4EBB0
        lead = ram[cursor]
        if lead == 0:
            cursor += 1
            break
        start, end = ram[cursor + 1], ram[cursor + 2]
        cursor += 3
        if lead & 0x80:                           # $4EBDE column run
            runs.append({'axis': 'column', 'index': (~lead) & 0xFF,
                         'from': start, 'to': end})
        else:                                     # $4EBB6 row run
            runs.append({'axis': 'row', 'index': lead - 1, 'from': start, 'to': end})
    pair = list(ram[cursor:cursor + 2])           # $4EC0E -> $7AEE / $7AEF
    cursor += 2
    selectors = list(ram[cursor:cursor + 6])      # $4EC24 -> $1E640..
    cursor += 6
    instances, empties = {}, {}
    while True:                                   # $4ECCA
        source_ref = ram[cursor]
        if source_ref == 0xFF:
            cursor += 1
            break
        cell, low = ram[cursor + 1], ram[cursor + 2]
        cursor += 3
        if low == 0:
            empties[cell] = {'sourceRef': source_ref}
            continue
        high, dx, dz = ram[cursor], s8(ram, cursor + 1), s8(ram, cursor + 2)
        cursor += 3
        instances[cell] = {
            'sourceRef': source_ref, 'cell': cell,
            'word': (high << 8) | low,
            'slot': ((high << 8) | low) & SLOT_MASK,
            'sceneSelector': high & 0xFE,
            'offsetX': dx, 'offsetZ': dz,
        }
    return {
        'group': group, 'record': record, 'extentRuns': runs,
        'pair': pair, 'selectors': selectors,
        'instances': instances, 'emptyCells': empties,
        'placeList': cursor,
    }


def scene_of(ram: bytes, selector: int) -> dict:
    """Dispatch the scene selector as ``$54CC8``-``$54D28`` does."""
    if selector == 0:
        return {'kind': 'none'}
    if selector <= 0x1E:                          # $54CD2
        return {'kind': 'sceneIndex', 'sceneIndex': selector // 2 + 0x1D}
    if selector < 0xA0:                           # $54CE4
        root = group_root(ram)
        table = root + u16(ram, root - 2)
        index = selector - 0x20
        return {'kind': 'sceneTable', 'table': table, 'index': index,
                'byte7963': ram[table + index], 'byte7961': ram[table + index + 1]}
    index = (selector - 0xA0) * 2                 # $54D06
    return {'kind': 'longTable', 'table': 0xCD74, 'index': index,
            'value': u32(ram, 0xCD74 + index)}


def structure(ram: bytes, slot: int) -> dict:
    """The structure record, and the alias fields at ``$54D84``-``$54DCC``."""
    base = u32(ram, STRUCTURE_PTR_BASE)
    record = base + u32(ram, base + slot * 4)
    lead = u16(ram, record)
    if not lead & 0x8000:
        return {'slot': slot, 'record': record, 'alias': False, 'plan': lead}
    return {
        'slot': slot, 'record': record, 'alias': True,
        'plan': lead & 0x7FFF,
        'scaleNumerator': s8(ram, record + 2),
        'scaleDenominator': s8(ram, record + 3),
        'palette': ram[record + 4],
        'detail': ram[record + 5],
        'baseSlot': ram[record + 6],
    }


def structure_geometry(ram: bytes, slot: int) -> dict:
    """Resolve a slot to its base structure and that structure's association list.

    The association-list root is not tabulated anywhere: the native walk at
    ``$05A266`` consumes the structure's region descriptors and ``$05A2FA``
    publishes whatever address it stopped at as ``$7B0E``. The catalogue
    extractor's region loop stops on the same zero selector, so its reader
    position is that root, derived rather than supplied.
    """
    record = structure(ram, slot)
    base = u32(ram, STRUCTURE_PTR_BASE)
    if record['alias']:
        base_slot = record['baseSlot']
        scale = (record['scaleNumerator'], record['scaleDenominator'])
        palette = record['palette'] or ram[record['record'] + 18]
        pointer = base + u32(ram, base + base_slot * 4)
    else:
        base_slot = slot
        scale = struct.unpack_from('>bb', ram, record['record'] - 8)
        palette = ram[record['record'] - 6]
        pointer = record['record']
    hardware = list(struct.unpack_from('>16H', ram, HARDWARE_PALETTE))
    colours = palette_at(ram, palette)
    mesh, _gaps = decode_structure(ram, pointer, colours, hardware, scale,
                                   third_wall_height(ram))
    selection = decode_structure_selection(ram, mesh, scale, colours, hardware)
    root = selection['associationRoot']
    return {
        'baseSlot': base_slot,
        'regions': len(selection['regions']),
        'associationRoot': root,
        'insertionGroups': decode_structure_associations(ram, root),
    }


def interior_address(ram: bytes, detail: int) -> int:
    base = u32(ram, INTERIOR_PTR_BASE)
    return base + u32(ram, base + detail * 4)


def cell_origin(ram: bytes, instance: dict) -> tuple[int, int]:
    """``$54D48``-``$54D6C``: sign-extend, scale by 30, bias into the cell."""
    scale = u16(ram, CELL_OFFSET_SCALE)
    return ((instance['offsetX'] * scale + CELL_ORIGIN_BIAS) & 0xFFFF,
            (instance['offsetZ'] * scale + CELL_ORIGIN_BIAS) & 0xFFFF)


def live_override_table(ram: bytes) -> bytes:
    return ram[LIVE_OVERRIDES:LIVE_OVERRIDES + 256 * 4]


def rebuild_override_table(ram: bytes, group: int) -> bytes:
    """The $ABDC image the decoder would leave for this group."""
    parsed = parse_group(ram, group)
    table = bytearray(256 * 4)
    for cell, item in parsed['instances'].items():
        table[cell * 4] = item['word'] >> 8
        table[cell * 4 + 1] = item['word'] & 0xFF
        table[cell * 4 + 2] = item['offsetX'] & 0xFF
        table[cell * 4 + 3] = item['offsetZ'] & 0xFF
    for cell in parsed['emptyCells']:
        table[cell * 4 + 1] = 0
    return bytes(table)


def check_eris_reference(ram: bytes) -> list[str]:
    """Gate: reproduce the parent #172 recovered by hand, field for field."""
    want = ERIS_REFERENCE
    checks = []
    parsed = parse_group(ram, want['group'])
    instance = parsed['instances'].get(want['cell'])
    if instance is None:
        raise LabError(f"Eris group ${want['group']:02X} has no instance in cell ${want['cell']:02X}")
    for key in ('sourceRef', 'word', 'slot'):
        if instance[key] != want[key]:
            raise LabError(f'Eris reference {key} is {instance[key]:#x}, expected {want[key]:#x}')
    if (instance['offsetX'], instance['offsetZ']) != (want['dx'], want['dz']):
        raise LabError('Eris reference offsets disagree with #172')
    checks.append(f"group ${want['group']:02X} cell ${want['cell']:02X} -> slot {want['slot']}, "
                  f"offsets {want['dx']},{want['dz']}")
    seen = ram[want['overrideAt']:want['overrideAt'] + 6].hex()
    if seen != want['overrideBytes']:
        raise LabError(f"override bytes at {want['overrideAt']:#x} are {seen}, expected {want['overrideBytes']}")
    checks.append(f"override stream at ${want['overrideAt']:06X} is {seen}")
    alias = structure(ram, want['slot'])
    expect = want['alias']
    got = (alias.get('plan'), f"{alias.get('scaleNumerator')}/{alias.get('scaleDenominator')}",
           alias.get('palette'), alias.get('detail'), alias.get('baseSlot'))
    if got != (expect['plan'], expect['scale'], expect['palette'], expect['detail'], expect['base']):
        raise LabError(f'Eris slot {want["slot"]} alias fields {got} disagree with #172 {expect}')
    checks.append(f"slot {want['slot']} alias plan {expect['plan']} scale {expect['scale']} "
                  f"palette {expect['palette']} detail {expect['detail']} base slot {expect['base']}")
    address = interior_address(ram, expect['detail'])
    if address != want['interior']:
        raise LabError(f"Building detail {expect['detail']} resolves to ${address:06X}, "
                       f"expected ${want['interior']:06X}")
    checks.append(f"Building detail {expect['detail']} -> ${address:06X}")
    geometry = structure_geometry(ram, want['slot'])
    if geometry['associationRoot'] != want['associationRoot']:
        raise LabError(f"association root ${geometry['associationRoot']:06X} disagrees with "
                       f"#172's ${want['associationRoot']:06X}")
    seen = geometry['insertionGroups'].get(want['insertionGroup'])
    if seen != want['insertions']:
        raise LabError(f"insertion group ${want['insertionGroup']:02X} maps {seen}, "
                       f"expected {want['insertions']}")
    checks.append(f"association root ${want['associationRoot']:06X}, insertion group "
                  f"${want['insertionGroup']:02X} -> " +
                  ' '.join(f'{r}->${v:02X}' for r, v in sorted(want['insertions'].items())))
    return checks


def check_memstate(ram: bytes, live: bytes, label: str) -> dict:
    """Gate: the static decode must reproduce what the running game built."""
    group = u16(live, BOUND_GROUP)
    rebuilt = rebuild_override_table(ram, group)
    actual = live_override_table(live)
    if rebuilt != actual:
        first = next(i for i in range(len(actual)) if actual[i] != rebuilt[i])
        raise LabError(f'{label}: $ABDC disagrees with the static decode of group '
                       f'${group:02X}, first at cell ${first // 4:02X}')
    parsed = parse_group(ram, group)
    place_list = u32(live, PLACE_LIST_PTR)
    if place_list != parsed['placeList']:
        raise LabError(f'{label}: $7A6C is ${place_list:06X}, decode gives '
                       f'${parsed["placeList"]:06X}')
    cell = u16(live, PLAYER_CELL)
    instance = parsed['instances'].get(cell)
    result = {'memstate': label, 'boundGroup': group, 'playerCell': cell,
              'overrideTable': 'identical', 'placeList': f'0x{place_list:06x}'}
    if instance is None:
        result['playerCellInstance'] = None
        return result
    scene = scene_of(ram, instance['sceneSelector'])
    expect = {
        SCENE_SELECTOR: instance['sceneSelector'],
        SCENE_INDEX: scene.get('sceneIndex', 0),
    }
    origin_x, origin_z = cell_origin(ram, instance)
    expect[CELL_ORIGIN_X] = origin_x
    expect[CELL_ORIGIN_Z] = origin_z
    record = structure(ram, instance['slot'])
    expect[INSTANCE_SLOT] = record['baseSlot'] if record['alias'] else instance['slot']
    for address, wanted in expect.items():
        seen = u16(live, address)
        if seen != wanted:
            raise LabError(f'{label}: ${address:04X} is ${seen:04X}, decode predicts ${wanted:04X}')
    # The derived association-list root must be the one the running game bound
    # for this cell. This is what separates "the derivation is wrong" from "the
    # resident's insertion group lives in another structure's list".
    geometry = structure_geometry(ram, instance['slot'])
    live_root = u32(live, ASSOCIATION_ROOT)
    if live_root != geometry['associationRoot']:
        raise LabError(f'{label}: $7B0E is ${live_root:06X}, the decode of the cell '
                       f'${cell:02X} instance gives ${geometry["associationRoot"]:06X}')
    result['playerCellInstance'] = {
        'slot': instance['slot'], 'scene': scene,
        'baseSlot': geometry['baseSlot'],
        'associationRoot': f'0x{geometry["associationRoot"]:06x}',
        'insertionGroups': [f'0x{g:02x}' for g in sorted(geometry['insertionGroups'])],
        'predicted': {f'0x{a:04x}': f'0x{v:04x}' for a, v in expect.items()},
    }
    return result


def resident_scenes(catalogue: dict) -> list[dict]:
    """Interior-associated residents on Dion and Vesta, grouped into scenes."""
    wanted = {'body-4': 'DION', 'body-14': 'VESTA'}
    scenes: dict[tuple, dict] = {}
    for item in catalogue['instances']:
        if not item['id'].startswith('object-slot-'):
            continue
        association = item.get('association')
        if not association or association.get('body') not in wanted:
            continue
        if not association.get('insertionGroupSelector'):
            continue
        key = (association['body'], association['structureGroupSelector'],
               association['cell'], association['levelSelector'])
        entry = scenes.setdefault(key, {
            'body': wanted[association['body']], 'group': key[1],
            'cell': key[2], 'level': key[3], 'slots': [], 'residents': [], 'placed': 0,
        })
        slot = int(item['id'].rsplit('-', 1)[1])
        entry['slots'].append(slot)
        entry['residents'].append({
            'slot': slot, 'name': item.get('name'),
            'insertionGroup': association['insertionGroupSelector'],
        })
        if item.get('location') or item.get('localPlacement'):
            entry['placed'] += 1
    return [scenes[k] for k in sorted(scenes)]


def build_report(ram: bytes, memstates: list[tuple[str, bytes]], groups: list[int] | None) -> dict:
    catalogue = json.loads(CATALOGUE.read_text()) if CATALOGUE.is_file() else {'instances': []}
    scenes = resident_scenes(catalogue)
    needed = sorted({s['group'] for s in scenes} | {ERIS_REFERENCE['group']})
    report = {
        'groupTablePointer': f'0x{u16(ram, GROUP_TABLE_PTR):04x}',
        'groupOffsetRoot': f'0x{group_root(ram):06x}',
        'cellOffsetScale': u16(ram, CELL_OFFSET_SCALE),
        'selfChecks': {'erisReference': check_eris_reference(ram), 'memstates': []},
        'groups': [],
        'scenes': [],
    }
    for label, live in memstates:
        report['selfChecks']['memstates'].append(check_memstate(ram, live, label))

    for group in (groups if groups else needed):
        parsed = parse_group(ram, group)
        report['groups'].append({
            'group': f'0x{group:02x}',
            'record': f'0x{parsed["record"]:06x}',
            'extentRuns': len(parsed['extentRuns']),
            'pair': [f'0x{b:02x}' for b in parsed['pair']],
            'selectors': [f'0x{b:02x}' for b in parsed['selectors']],
            'instances': len(parsed['instances']),
            'emptyCells': len(parsed['emptyCells']),
            'placeList': f'0x{parsed["placeList"]:06x}',
        })

    cache = {g: parse_group(ram, g) for g in needed}
    for scene in scenes:
        instance = cache[scene['group']]['instances'].get(scene['cell'])
        row = dict(scene)
        if instance is None:
            row['parent'] = None
            row['outcome'] = 'unresolved: no cell override authors this cell'
        else:
            record = structure(ram, instance['slot'])
            origin_x, origin_z = cell_origin(ram, instance)
            row['parent'] = {
                'instanceSlot': instance['slot'],
                'sourceRef': f'0x{instance["sourceRef"]:02x}',
                'word': f'0x{instance["word"]:04x}',
                'offsets': [instance['offsetX'], instance['offsetZ']],
                'cellOrigin': [f'0x{origin_x:04x}', f'0x{origin_z:04x}'],
                'scene': scene_of(ram, instance['sceneSelector']),
                'structure': record,
            }
            if record['alias']:
                row['parent']['interior'] = f'0x{interior_address(ram, record["detail"]):06x}'
            try:
                geometry = structure_geometry(ram, instance['slot'])
            except Exception as error:                     # noqa: BLE001 - reported, not raised
                row['outcome'] = f'parent decoded; association list unavailable: {error}'
                row['parent']['associationList'] = None
                for resident in row['residents']:
                    resident['outcome'] = 'unresolved: association list unavailable'
            else:
                row['parent']['baseSlot'] = geometry['baseSlot']
                row['parent']['regions'] = geometry['regions']
                row['parent']['associationRoot'] = f'0x{geometry["associationRoot"]:06x}'
                row['parent']['insertionGroups'] = sorted(geometry['insertionGroups'])
                resolved = 0
                for resident in row['residents']:
                    mapping = geometry['insertionGroups'].get(resident['insertionGroup'])
                    if mapping is None:
                        resident['outcome'] = (
                            f'unresolved: insertion group '
                            f'0x{resident["insertionGroup"]:02x} absent from the list')
                        resident['insertions'] = None
                    else:
                        resolved += 1
                        resident['outcome'] = 'insertions decoded'
                        resident['insertions'] = {str(r): f'0x{v:02x}'
                                                  for r, v in sorted(mapping.items())}
                row['outcome'] = ('parent and insertions decoded'
                                  if resolved == len(row['residents'])
                                  else f'parent decoded; {len(row["residents"]) - resolved} of '
                                       f'{len(row["residents"])} residents unresolved')
        report['scenes'].append(row)
    return report


def summarise(report: dict) -> None:
    print(f"group-offset root {report['groupOffsetRoot']} "
          f"(pointer {report['groupTablePointer']}), cell offset scale {report['cellOffsetScale']}")
    print('self-checks:')
    for line in report['selfChecks']['erisReference']:
        print(f'  #172 Eris reference: {line}')
    for item in report['selfChecks']['memstates']:
        print(f"  {item['memstate']}: bound group 0x{item['boundGroup']:02x}, "
              f"$ABDC {item['overrideTable']}, place list {item['placeList']}, "
              f"player cell 0x{item['playerCell']:02x} predicted words agree"
              + (f", $7B0E {item['playerCellInstance']['associationRoot']} agrees"
                 if item.get('playerCellInstance') else ''))
    print('\ngroup records:')
    for g in report['groups']:
        print(f"  group {g['group']} record {g['record']} runs {g['extentRuns']:3d} "
              f"instances {g['instances']:3d} empty {g['emptyCells']:2d} "
              f"place list {g['placeList']}")
    print(f"\nresident scenes ({len(report['scenes'])}):")
    for s in report['scenes']:
        head = (f"  {s['body']:5s} group 0x{s['group']:02x} cell 0x{s['cell']:02x} "
                f"level 0x{s['level']:02x} slots {str(s['slots']):24s}")
        if s['parent'] is None:
            print(head + ' ** ' + s['outcome'])
            continue
        p = s['parent']
        print(head + f" parent slot {p['instanceSlot']:3d} base {p.get('baseSlot', '?')} "
              f"scene {p['scene']['kind']:11s} root {p.get('associationRoot', '-')}")
        for resident in s['residents']:
            mapping = ('' if resident.get('insertions') is None
                       else ' '.join(f'{r}->{v}' for r, v in resident['insertions'].items()))
            print(f"      slot {resident['slot']:3d} ins 0x{resident['insertionGroup']:02x} "
                  f"{(resident.get('name') or '')[:26]:26s} "
                  f"{mapping if mapping else '** ' + resident['outcome']}")
    decoded = sum(1 for s in report['scenes'] if s['parent'])
    residents = [r for s in report['scenes'] for r in s['residents']]
    resolved = sum(1 for r in residents if r.get('insertions'))
    print(f"\n{decoded} of {len(report['scenes'])} scenes have a decoded parent; "
          f"{resolved} of {len(residents)} residents have decoded insertions")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--run', type=Path, required=True,
                        help='attested first-world observation run directory')
    parser.add_argument('--memstate', type=Path, action='append', default=[],
                        help='Hatari memstate or 1 MiB RAM to cross-check (repeatable)')
    parser.add_argument('--group', action='append', default=[],
                        help='restrict the group report (hex or decimal, repeatable)')
    parser.add_argument('--json', action='store_true')
    args = parser.parse_args()

    verify(args.run)
    manifest = json.loads((args.run / 'manifest.json').read_text())
    pin = json.loads((LAB_ROOT / 'config/working-authority.json').read_text())
    validate_source(manifest, pin)
    artifact = next(a for a in manifest['artifacts'] if a['role'] == 'observed-ram')
    ram = (args.run / artifact['path']).read_bytes()

    memstates = []
    for path in args.memstate:
        blob = path.read_bytes()
        memstates.append((path.stem, blob if len(blob) == 1048576 else hatari_memstate_ram(blob)))

    groups = [int(g, 0) for g in args.group] or None
    report = build_report(ram, memstates, groups)
    report['source'] = {
        'run': args.run.name,
        'ramSha256': hashlib.sha256(ram).hexdigest(),
        'programSha256': manifest['authority']['programSha256'],
        'evidence': 'docs/research/damocles-dion-vesta-structure-groups.md',
    }
    if args.json:
        print(json.dumps(report, indent=1, sort_keys=True))
    else:
        summarise(report)


if __name__ == '__main__':
    main()
