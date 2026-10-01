"""Build and check the Dion Catalogue coverage ledger from the full location census.

The ledger is the machine-readable half of docs/dion-catalogue-contract.md. It
accounts for every persistent object slot, authored group, cell binding, selected
structure slot and floor geometry slot that the #678 census found, names the
Geometry Identities those references need, and records which recovery ticket
owns each one. It decodes no geometry: recovery work (#681-#683) moves an
identity from `pending` to a recovered state, and #684 exports from it.

`build_ledger` reads an ignored census run (Restricted Material) and the tracked
playable payload. `validate_ledger` needs only the ledger, so the committed file
is checked without original captures. Only identities, references, counts and
source hashes leave RAM; no geometry and no original instructions are written.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib
import json
from collections import Counter
from pathlib import Path

from .census_locations import describe_cell, read_inventory, read_workspace, structure_floors
from .census_objects import extract_objects
from .catalogue_surface import digest
from .geometry import detail_record, resolve_structure, structure_record
from .ram import Ram, hexaddr
from .interior_capture import READER_CHECKS

SCHEMA_VERSION = 1
LABORATORY = Path(__file__).resolve().parents[1]
REPOSITORY = LABORATORY.parents[1]
LEDGER_PATH = LABORATORY / 'catalogue-ledger.json'
CONTRACT = 'docs/dion-catalogue-contract.md'

VOID_GROUP = 49
MIDAS_GROUP = 56
MIDAS_PERIOD = 16
LOGOS_GROUP, LOGOS_CELL = 8, 0x32
EMPTY_ROAD_GEOMETRY_SLOT = 146

# Recovery tickets under #679. A Geometry Identity has exactly one owner.
OBJECTS_TICKET, SURFACE_TICKET, INTERIOR_TICKET = 681, 682, 683

STATES = ('pending', 'recovered', 'empty', 'verified')
DONE_STATES = ('recovered', 'empty', 'verified')
RESIDENCES = ('structure', 'surface', 'out-of-world', 'carried')
GROUP_DISPOSITIONS = ('settlement', 'bare-islands', 'outline-only', 'label-only',
                      'unused', 'void-storage', 'repeating-field')
BINDING_STATES = ('present', 'initially-absent', 'storage', 'field-seed')

# Each family names the laboratory reader recovery must use and the original
# reader it follows. A null module is a decoder path that does not exist yet.
DECODERS = {
    'model': {'module': 'm3lab.geometry', 'function': 'decode_model',
              'reader': '$545AE..$549BA', 'owner': OBJECTS_TICKET},
    'structure': {'module': 'm3lab.geometry', 'function': 'decode_structure',
                  'reader': '$5AD2C..$5B2D2', 'owner': SURFACE_TICKET},
    'floor': {'module': 'm3lab.census_locations', 'function': 'structure_floors',
              'reader': '$560F4..$5612A, $56D1E..$56E5C', 'owner': INTERIOR_TICKET},
    'detail': {'module': 'm3lab.geometry', 'function': 'decode_detail',
               'reader': '$54AEE..$54D20', 'owner': SURFACE_TICKET},
    'ground': {'module': 'm3lab.geometry', 'function': 'decode_ground',
               'reader': '$561AE..$563C4', 'owner': SURFACE_TICKET},
    'island': {'module': 'm3lab.geometry', 'function': 'decode_island',
               'reader': '$5761A..$5769E, $571A8..$5727E', 'owner': SURFACE_TICKET},
}

# What a Geometry Identity must show before the milestone can close (#685, #686).
PREVIEW_EVIDENCE = {
    'catalogue': 'The exported identity draws in the sessionless Dion Catalogue with no '
                 'drawing gap reported (#685).',
    'original': 'At least one identity of each family and variant axis is compared with '
                'an original-game scene in the #686 matrix.',
}


def ident(family: str, address: int) -> str:
    """A Geometry Identity: record family plus the record's pinned source address."""
    return f'{family}-{address:06x}'


def binding_id(group: int, cell: int) -> str:
    return f'placement-{group:02d}-{cell:02x}'


def place_id(group: int, cell: int) -> str:
    return f'place-{group:02d}-{cell:02x}'


def body_id(offset: int) -> str:
    return f'body-{offset // 4:02d}'


def address(text: str) -> int:
    return int(text[1:], 16)


def _playable(repository: Path, opening: Ram) -> dict[str, set[str]]:
    """Geometry the bounded Metis payload already exports, by Geometry Identity."""
    world = json.loads((repository / 'payload' / 'dion' / 'world.json').read_text())
    found = {
        'model': {ident('model', address(m['provenance']['range'][0]))
                  for m in world['models'].values()},
        'structure': {ident('structure', address(s['record']))
                      for s in world['structures'].values()},
        'detail': {ident('detail', detail_record(opening, int(index)))
                   for index in world['details']},
        # Ground is keyed by where its geometry starts, past the record's phase header.
        'groundStarts': set(world['grounds']),
    }
    return found


def _group_disposition(group: dict, bindings: int) -> str:
    if group['id'] == VOID_GROUP:
        return 'void-storage'
    if group['id'] == MIDAS_GROUP:
        return 'repeating-field'
    if not group['placements']:
        return 'unused'
    if bindings:
        return 'settlement'
    if group['id'] == 0:
        return 'bare-islands'
    return 'label-only' if group['area'] else 'outline-only'


def build_ledger(run: Path, repository: Path = REPOSITORY, surface: dict | None = None,
                 comparisons: dict | None = None, models: dict | None = None,
                 interiors: dict | None = None) -> dict:
    """The census ledger; with the #682 surface and #681 object extractions, their
    recovery states too, and with their original-scene comparisons, the results for
    #686 to build on."""
    opening = Ram.load(run / 'start.ram')
    inventory = read_inventory(opening)
    census = extract_objects(opening)
    groups = inventory['groups']
    playable = _playable(repository, opening)

    # Bindings: every authored nonzero cell, resolved by the original builder's result.
    bindings = []
    workspaces = []
    for group in groups:
        number = group['id']
        ram = Ram.load(run / 'all-groups' / f'group-{number:02d}.ram')
        workspace = read_workspace(ram, number)
        workspaces.append({'group': number, 'cells': len(workspace['cells']),
                           'ramSha256': ram.sha256, **workspace['provenance']})
        built = {c['cell']: c for c in workspace['cells']}
        for source in group['cells']:
            if not source['slot']:
                continue
            n = source['cell']
            cell = built.get(n)
            if cell is None:
                cell = describe_cell(ram, {**source, 'x': n & 15, 'z': n >> 4})
            elif (cell['slot'], cell['key'], cell['dx'], cell['dz']) != (
                    source['slot'], source['key'], source['dx'], source['dz']):
                raise ValueError(f'{number}:{n:02X}: builder result disagrees with the stream')
            state = ('storage' if number == VOID_GROUP else
                     'field-seed' if number == MIDAS_GROUP else
                     'present' if n in built else 'initially-absent')
            bindings.append({'id': binding_id(number, n), 'group': number, 'cell': n,
                             'slot': source['slot'], 'key': source['key'],
                             'dx': source['dx'], 'dz': source['dz'],
                             'source': source['address'], 'state': state})
    midas = Ram.load(run / 'midas' / 'group-56-uniform.ram')
    midas_cells = read_workspace(midas, MIDAS_GROUP)['cells']

    # Selected structure slots and the geometry slots their Floor Tables bind.
    slot_records = {}
    for slot in sorted({b['slot'] for b in bindings}):
        resolved = resolve_structure(opening, slot)
        floors = structure_floors(opening, slot)['floors']
        slot_records[slot] = {
            'slot': slot, 'record': hexaddr(structure_record(opening, slot)),
            'alias': resolved['alias'] is not None, 'scale': resolved['scale'],
            'palette': resolved['palette'], 'detail': resolved['detail'],
            'pitch': structure_floors(opening, slot)['pitch'],
            'floors': [[f['floor'], f['geometrySlot']] for f in floors]}

    raw_floor_slots = {g for s in slot_records.values() for _, g in s['floors']}
    if interiors is not None:
        for slot, record in slot_records.items():
            extracted = interiors['structures'][str(slot)]
            if 'nonFloorBytes' in extracted:
                record['censusFloors'] = record['floors']
                record['nonFloorBytes'] = extracted['nonFloorBytes']
                record['floors'] = [[f['floor'], f['geometrySlot']] for f in extracted['floors']]

    geometry: dict[str, dict] = {}

    def need(family: str, record: int, owner: int, count: int = 1, **extra) -> str:
        key = ident(family, record)
        entry = geometry.setdefault(key, {
            'id': key, 'family': family, 'record': hexaddr(record), 'owner': owner,
            'required': True, 'state': 'pending', 'variants': None,
            'playable': key in playable.get(family, set()), 'preview': None,
            'references': 0})
        entry['references'] += count
        for name, value in extra.items():
            values = entry.setdefault(name, [])
            if value not in values:
                values.append(value)
        if owner < entry['owner']:
            entry['owner'] = owner  # bound at floor 0 anywhere: a surface structure
        return key

    # Shared geometry belongs to the selected slot; a binding names only its slot.
    uses = Counter(b['slot'] for b in bindings)
    unresolved: dict[int, dict[int, int]] = {}
    for slot, record in slot_records.items():
        floors = []
        for floor, geometry_slot in record['floors']:
            target = resolve_structure(opening, geometry_slot)
            if target['alias'] is not None:
                # A Floor Table byte naming another alias is not geometry the lift path is
                # known to bind; it stays unresolved under a blocking gap (#683).
                floors.append([floor, geometry_slot, None])
                unresolved.setdefault(slot, {})[floor] = geometry_slot
                continue
            owner = SURFACE_TICKET if floor == 0 else INTERIOR_TICKET
            key = need('structure', target['record'], owner, uses[slot],
                       slots=geometry_slot, scales=record['scale'])
            floors.append([floor, geometry_slot, key])
        record['floors'] = floors
        record['detailIndex'] = record['detail']
        record['detail'] = need('detail', detail_record(opening, record['detailIndex']),
                                SURFACE_TICKET, uses[slot], details=record['detailIndex'])
    for entry in geometry.values():
        if entry['family'] == 'structure':
            entry['slots'].sort()
            entry['variants'] = [f'scale={x},{z}' for x, z in sorted(map(tuple, entry.pop('scales')))]
        elif entry['family'] == 'detail':
            entry['details'].sort()
    empty_road = geometry[ident('structure', structure_record(opening, EMPTY_ROAD_GEOMETRY_SLOT))]

    # Bodies, island placements and named places.
    bodies = []
    island_ids = {}
    for body in inventory['bodies']:
        islands = []
        for index, record in enumerate(body['records']):
            identifier = f'island-{body["offset"] // 4:02d}-{index:02d}'
            island_ids.setdefault(record['group'], []).append(identifier)
            islands.append({'id': identifier, 'group': record['group'],
                            'origin': record['origin'], 'source': record['address'],
                            'landColour': record['landColour'],
                            'geometry': need('island', address(record['geometry']),
                                             SURFACE_TICKET)})
        bodies.append({'id': body_id(body['offset']), 'offset': body['offset'],
                       'name': body['name'], 'islands': islands, **body['provenance']})

    by_cell = {(b['group'], b['cell']): b for b in bindings}
    group_rows = []
    places = []
    for group in groups:
        count = sum(1 for b in bindings if b['group'] == group['id'])
        initial = sum(1 for b in bindings if b['group'] == group['id']
                      and b['state'] != 'initially-absent')
        group_rows.append({'group': group['id'], 'stream': group['stream'],
                           'area': group['area'] or None,
                           'disposition': _group_disposition(group, count),
                           'islands': island_ids.get(group['id'], []),
                           'authoredBindings': count, 'initialBindings': initial,
                           **group['provenance']})
        for label in group['labels']:
            binding = by_cell.get((group['id'], label['cell']))
            places.append({'id': place_id(group['id'], label['cell']), 'group': group['id'],
                           'cell': label['cell'], 'name': label['name'],
                           'binding': binding['id'] if binding else None,
                           'source': label['address']})

    # Objects: every persistent slot, with its host and its model's identity.
    midas_body = next(i for b in bodies for i in b['islands'] if i['group'] == MIDAS_GROUP)
    objects = []
    for o in census['objects']:
        host = None
        if o['residence'] == 'structure':
            host = by_cell.get((o['group'], o['cell']))
            if o['group'] == MIDAS_GROUP:
                host = {'field': 'midas', 'cell': o['cell']}
            elif host is None or host['state'] == 'storage':
                raise ValueError(f'object {o["slot"]} has no indoor host')
            else:
                host = {'binding': host['id']}
        placed = o['residence'] in ('structure', 'surface')
        x, _, z = o['position']
        objects.append({
            'id': f'object-{o["slot"]:03d}', 'slot': o['slot'], 'name': o['name'],
            'residence': o['residence'],
            'body': body_id(o['bodyOffset']) if placed else None,
            'bodyCell': [(x // 65536) % 4096, (z // 65536) % 4096] if placed else None,
            'position': o['position'] if placed else None,
            'floor': o['floor'] if o['residence'] == 'structure' else None,
            'host': host,
            'geometry': need('model', address(o['modelRecord']), OBJECTS_TICKET)
            if o['hasModel'] else None})
    door_key = next(o for o in objects if o['slot'] == 38)
    door_key['initialChange'] = 'held by the opening prison script ($6FF5F)'
    for entry in geometry.values():
        if entry['family'] == 'model':
            entry['slots'] = sorted(o['slot'] for o in objects if o['geometry'] == entry['id'])

    seed = by_cell[(MIDAS_GROUP, 0)]
    logos = by_cell[(LOGOS_GROUP, LOGOS_CELL)]
    residence = Counter(o['residence'] for o in objects)
    ledger = {
        'schemaVersion': SCHEMA_VERSION,
        'kind': 'dion-catalogue-ledger',
        'title': 'dion',
        'contract': CONTRACT,
        'source': {
            'baseline': 'Mercenary III research baseline (pinned ST STX)',
            'programSha256': json.loads((LABORATORY / 'config' / 'baseline.json')
                                        .read_text())['programImage']['sha256'],
            'census': {'run': run.name, 'recipe': 'research/mercenary-iii-st/m3lab/census_capture.py',
                       'evidence': 'docs/research/dion-full-location-recovery.md',
                       'openingRamSha256': opening.sha256, 'midasRamSha256': midas.sha256},
            'ranges': inventory['sourceRanges'],
            'workspaces': workspaces,
        },
        'totals': {
            'bodies': len(bodies), 'islandPlacements': sum(len(b['islands']) for b in bodies),
            'groups': len(groups), 'authoredBindings': len(bindings),
            'initialBindings': sum(b['state'] != 'initially-absent' for b in bindings),
            'selectedStructureSlots': len(slot_records),
            'floorGeometrySlots': len(raw_floor_slots),
            'objectSlots': len(objects),
            'residence': {name: residence[name] for name in RESIDENCES},
            'places': len(places),
        },
        'decoders': DECODERS,
        'previewEvidence': PREVIEW_EVIDENCE,
        'bodies': bodies,
        'groups': group_rows,
        'places': places,
        'bindings': bindings,
        'structureSlots': list(slot_records.values()),
        'objects': objects,
        'workingSlots': {
            'current': 0, 'templates': census['templateWorkingSlots'],
            'disposition': 'Rebound per cell from ground templates; identified by Body, '
                           'cell, template ordinal and model entry (#682), not as objects.'},
        'carriedStack': census['carriedStack'],
        'midas': {
            'group': MIDAS_GROUP, 'island': midas_body['id'], 'origin': midas_body['origin'],
            'seed': seed['id'], 'period': MIDAS_PERIOD,
            'workspaceBindings': len(midas_cells),
            'workspaceSlots': sorted({c['slot'] for c in midas_cells}),
            'physicalCount': None,
            'reference': '56:HH, HH = (x mod 16) + 16 * (z mod 16) for local cell (x, z)',
            'bodyCell': '((1729 + x) mod 4096, (938 + z) mod 4096)',
            'residents': sorted(o['slot'] for o in objects
                                if o['host'] and o['host'].get('field') == 'midas'),
            'source': '$4F2BC..$4F2D2, $55E90..$55EBC'},
        'logos': {
            'binding': logos['id'], 'slot': logos['slot'],
            'states': [
                {'id': 'initial', 'slot': None,
                 'evidence': 'Initial overlay $057DA: group 8, cell $32, replacement 0'},
                {'id': 'constructed', 'slot': logos['slot'],
                 'evidence': 'Construction path $515FC..$51694 removes the overlay and rebinds the cell'}],
            'campaign': 'Inspection shows both states; it runs no campaign progression.'},
        'geometry': sorted(geometry.values(), key=lambda g: g['id']),
        'gaps': [
            {'id': 'island-decoder', 'owner': SURFACE_TICKET, 'blocking': True,
             'subject': 'family:island',
             'note': 'No laboratory decoder reads the island descriptor geometry yet.'},
            {'id': 'ground-inventory', 'owner': SURFACE_TICKET, 'blocking': True,
             'subject': 'family:ground',
             'note': 'Ground records and street-furniture templates are selected per cell from '
                     'each group run grid and six selectors; their identities are not yet '
                     'enumerated for all 57 workspaces.'},
            {'id': 'model-variants', 'owner': OBJECTS_TICKET, 'blocking': True,
             'subject': 'family:model',
             'note': 'Header-selected and viewer-selected object forms are not yet inventoried.'},
            {'id': 'detail-lettering', 'owner': SURFACE_TICKET, 'blocking': True,
             'subject': 'family:detail',
             'note': 'Only details 56 and 59 have recovered lettering tokens (#643).'},
            {'id': 'association-hooks', 'owner': INTERIOR_TICKET, 'blocking': True,
             'subject': 'family:structure',
             'note': 'Each indoor host must export the association list its residents match.'},
            {'id': 'interior-details', 'owner': INTERIOR_TICKET, 'blocking': True,
             'subject': 'family:detail',
             'note': 'Which building detail an upper Floor draws (the alias detail or its '
                     "floor geometry's own) is not yet established."},
            {'id': 'empty-road-geometry', 'owner': SURFACE_TICKET, 'blocking': False,
             'subject': empty_road['id'],
             'note': 'Structure slot 146 is empty road geometry with no indoor Floor; '
                     'recovery records it as empty, not missing.'},
            {'id': 'tourcraft-appearance', 'owner': OBJECTS_TICKET, 'blocking': False,
             'subject': 'object:13',
             'note': "TOURCRAFT's screen appearance at the opening spaceport is unconfirmed."},
        ] + [
            {'id': f'floor-table-slot-{slot}', 'owner': INTERIOR_TICKET, 'blocking': True,
             'subject': f'structureSlot:{slot}',
             'note': 'Floor Table bytes name further alias slots ('
                     + ', '.join(f'Floor {f} -> {g}' for f, g in sorted(floors.items()))
                     + ') at ' + ', '.join(b['id'] for b in bindings if b['slot'] == slot)
                     + '; confirm what the original lift path binds there.'}
            for slot, floors in sorted(unresolved.items())],
    }
    if surface is not None:
        apply_surface(ledger, surface, playable)
    if models is not None:
        apply_objects(ledger, models, playable)
    if interiors is not None:
        apply_interiors(ledger, interiors)
    if comparisons is not None:
        ledger['comparisons'] = [
            {'id': name, 'kind': 'scene', 'binding': r['binding'], 'run': r['run'],
             'agreement': round(r['agreement'], 4), 'plannerGaps': r['gaps'][1:]}
            for name, r in sorted(comparisons.get('scenes', {}).items())] + [
            {'id': name, 'kind': 'land-sea', 'run': r['run'], 'points': len(r['rows']),
             'agree': r['agree']}
            for name, r in sorted(comparisons.get('coasts', {}).items())] + [
            {'id': name, 'kind': 'object-scene', 'object': r['object'], 'geometry': r['geometry'],
             'variant': r['variant'], 'run': r['run'], 'agreement': round(r['agreement'], 4),
             'objectAgreement': round(r['objectAgreement'], 4), 'plannerGaps': r['gaps'][1:]}
            for name, r in sorted(comparisons.get('objects', {}).items())]
        spaceport = comparisons.get('objects', {}).get('tourcraft-spaceport')
        gap = next((g for g in ledger['gaps'] if g['id'] == 'tourcraft-appearance'), None)
        if spaceport and gap:
            ledger['gaps'].remove(gap)
            ledger.setdefault('resolvedGaps', []).append({
                'id': gap['id'], 'owner': gap['owner'],
                'resolution': 'The original draws slot 13 at the opening spaceport with its '
                              'decoded ground form (form=view-1); the planner draws the same '
                              f'record there (object scene {spaceport["run"]}, '
                              'docs/research/dion-object-geometry.md).'})
    if comparisons is not None and 'interiors' in comparisons:
        evidence = comparisons['interiors']
        if interiors is None:
            raise ValueError('interior comparisons require an interior extraction')
        for field in ('title', 'programSha256', 'openingRamSha256'):
            if evidence.get('source', {}).get(field) != interiors['source'].get(field):
                raise ValueError(f'interior comparison source disagrees: {field}')
        ledger['interiorComparisons'] = {
            'source': evidence['source'],
            'run': evidence['run'], 'total': evidence['total'], 'passed': evidence['passed'],
            'cases': [{k: r[k] for k in ('id', 'kind', 'group', 'cell', 'slot', 'floor', 'geometry', 'variant', 'checks',
                                         'residents', 'binding', 'ramSha256', 'occupantRamSha256', 'passed')}
                      for r in evidence['cases']]}
    if comparisons is not None and 'interiorScenes' in comparisons:
        ledger['interiorScenes'] = {}
        for name, scene in sorted(comparisons['interiorScenes'].items()):
            for field in ('title', 'programSha256', 'openingRamSha256'):
                if interiors is None or scene.get('source', {}).get(field) != interiors['source'].get(field):
                    raise ValueError(f'{name}: interior scene source disagrees: {field}')
            ledger['interiorScenes'][name] = {**scene, 'originalScreenshot':
                f'restricted/mercenary-iii-683/runs/{scene["run"]}/v7000.png'}
    ledger['completion'] = completion(ledger)
    problems = validate_ledger(ledger)
    if problems:
        raise ValueError('generated ledger is invalid:\n' + '\n'.join(problems))
    return ledger


def _drawable(family: str, body: dict) -> bool:
    if family == 'structure':
        return bool(body['plan'] or body['walls'])
    if family == 'model':
        return bool(body['vertices'] and (body['faces'] or body['alternatives']))
    return bool(body['vertices'] and body['primitives'])


SURFACE_RESOLUTIONS = {
    'island-decoder': 'm3lab.geometry.decode_island reads all island records '
                      '(docs/research/dion-surface-recovery.md#islands).',
    'ground-inventory': 'Every placed group cell names its Drawn Record; overrides account '
                        'for every Selected Piece it replaces (m3lab.catalogue_surface).',
    'detail-lettering': 'Every surface text record is literal, placement-bound ($89, $9D) or '
                        'a live token with its buffer (docs/research/dion-surface-recovery.md#lettering).',
    'empty-road-geometry': 'Recovered as empty: the record has no plan and no walls.',
}


def apply_surface(ledger: dict, surface: dict, playable: dict[str, set[str]]) -> None:
    """Fold a #682 extraction in: states, variants, hashes, and ground identities."""
    geometry = {g['id']: g for g in ledger['geometry']}
    references = Counter()
    for rows in surface['cells'].values():
        for row in rows:
            references[row['ground']] += 1
            for entry in row['templates']:
                references[('entry', entry)] += 1
    for key, record in surface['geometry'].items():
        family = record['family']
        entry = geometry.get(key)
        if entry is None:
            if family not in ('ground', 'model'):
                raise ValueError(f'{key} is outside the census inventory')
            count = (references[key] if family == 'ground'
                     else sum(references[('entry', e)] for e in record['entries']))
            starts = {v['provenance']['range'][0] for v in record['variants'].values()}
            entry = geometry[key] = {
                'id': key, 'family': family, 'record': record['record'], 'owner': SURFACE_TICKET,
                'required': True, 'preview': None, 'references': count,
                'playable': key in playable.get(family, set()) or bool(starts & playable.get('groundStarts', set()))}
            if family == 'model':
                entry['entries'] = record['entries']
        if entry['owner'] != SURFACE_TICKET:
            raise ValueError(f'{key} belongs to #{entry["owner"]}, not the surface recovery')
        drawable = any(_drawable(family, v) for v in record['variants'].values())
        entry['state'] = 'recovered' if drawable else 'empty'
        names = [v for v in record['variants'] if v != 'base']
        if family == 'detail':
            names = [f'scale={x},{z}' for x, z in record['scales']]
        entry['variants'] = names
        entry['sha256'] = record['sha256']
    ledger['geometry'] = sorted(geometry.values(), key=lambda g: g['id'])
    ledger['totals']['surfaceCells'] = 256 * len(surface['cells'])
    ledger['lettering'] = {token: item['kind'] for token, item in surface['lettering']['tokens'].items()}
    ledger['source']['surface'] = {
        'construction': surface['source']['construction'],
        'recipe': 'research/mercenary-iii-st/m3lab/catalogue_surface.py',
        'evidence': 'docs/research/dion-surface-recovery.md',
        'sha256': hashlib.sha256(json.dumps(surface, sort_keys=True).encode()).hexdigest()}
    logos = surface['logos']
    if (logos['initial']['slot'], logos['constructed']['slot']) != (None, ledger['logos']['slot']):
        raise ValueError('the construction capture disagrees with the LOGOS states')
    for state in ledger['logos']['states']:
        state['ramSha256'] = logos[state['id']]['ramSha256']
    resolved = []
    for gap in list(ledger['gaps']):
        if gap['id'] in SURFACE_RESOLUTIONS:
            ledger['gaps'].remove(gap)
            resolved.append({'id': gap['id'], 'owner': gap['owner'],
                             'resolution': SURFACE_RESOLUTIONS[gap['id']]})
    ledger['resolvedGaps'] = resolved


OBJECT_RESOLUTIONS = {
    'model-variants': 'Every object model record is decoded with its header-selected states, '
                      'viewer-selected forms, passenger form and per-slot lettering, and every '
                      'run-time model-table writer is inventoried (m3lab.catalogue_objects, '
                      'docs/research/dion-object-geometry.md).',
}


def apply_objects(ledger: dict, objects: dict, playable: dict[str, set[str]]) -> None:
    """Fold a #681 extraction in: model states, variants and hashes, and every further
    model a slot can draw (run-time model-table writers, services and driver heads)."""
    geometry = {g['id']: g for g in ledger['geometry']}
    rows = {o['slot']: o for o in ledger['objects']}
    reached: dict[str, set[int]] = {}
    for slot, extracted in objects['objects'].items():
        row = rows[int(slot)]
        if extracted['geometry'] != row['geometry']:
            raise ValueError(f'object {slot}: the extraction names {extracted["geometry"]}')
        if 'disposition' in extracted:
            row['disposition'] = extracted['disposition']
        if 'lettering' in extracted:
            row['lettering'] = {'token': extracted['lettering']['token'],
                                'text': extracted['lettering']['text']}
        if 'forms' in extracted:
            row['forms'] = [{'entry': f['entry'], 'geometry': f['geometry'], 'role': f['role'],
                             'writers': sorted({c['writer'] for c in f['causes']})}
                            for f in extracted['forms']]
            for f in extracted['forms']:
                if f['geometry']:
                    reached.setdefault(f['geometry'], set()).add(int(slot))
    for key, record in objects['geometry'].items():
        entry = geometry.get(key)
        if entry is None:
            entry = geometry[key] = {
                'id': key, 'family': 'model', 'record': record['record'], 'owner': OBJECTS_TICKET,
                'required': True, 'preview': None, 'references': 0, 'slots': [],
                'playable': key in playable.get('model', set())}
        if entry['owner'] != OBJECTS_TICKET:
            raise ValueError(f'{key} belongs to #{entry["owner"]}, not the object recovery')
        entry['state'] = 'recovered' if any(_drawable('model', {**v, 'alternatives': []})
                                            for v in record['variants'].values()) else 'empty'
        entry['variants'] = list(record['variants'])
        entry['sha256'] = record['sha256']
        entry['modelEntries'] = record['entries']
        entry['formSlots'] = sorted(reached.get(key, set()) - set(entry['slots']))
        entry['references'] = len(entry['slots']) + len(entry['formSlots'])
        if 'drawsNothing' in record:
            entry['drawsNothing'] = record['drawsNothing']
    ledger['geometry'] = sorted(geometry.values(), key=lambda g: g['id'])
    ledger['source']['objects'] = {
        'recipe': 'research/mercenary-iii-st/m3lab/catalogue_objects.py',
        'evidence': 'docs/research/dion-object-geometry.md',
        'sha256': hashlib.sha256(json.dumps(objects, sort_keys=True).encode()).hexdigest()}
    resolved = ledger.setdefault('resolvedGaps', [])
    for gap in list(ledger['gaps']):
        if gap['id'] in OBJECT_RESOLUTIONS:
            ledger['gaps'].remove(gap)
            resolved.append({'id': gap['id'], 'owner': gap['owner'],
                             'resolution': OBJECT_RESOLUTIONS[gap['id']]})


def apply_interiors(ledger: dict, interiors: dict) -> None:
    """Fold #683's complete Floor bindings and residents in, preserving surface hashes."""
    if (interiors['source']['title'] != 'dion' or
            interiors['source']['programSha256'] != ledger['source']['programSha256'] or
            interiors['source']['openingRamSha256'] != ledger['source']['census']['openingRamSha256']):
        raise ValueError('interior extraction source disagrees with the census')
    geometry = {g['id']: g for g in ledger['geometry']}
    required = {g['id'] for g in ledger['geometry'] if g['owner'] == INTERIOR_TICKET}
    missing = required - set(interiors['geometry'])
    if missing:
        raise ValueError(f'interior extraction is missing required geometry: {sorted(missing)}')
    for key, record in interiors['geometry'].items():
        if key not in geometry or digest({k: v for k, v in record.items() if k != 'sha256'}) != record['sha256']:
            raise ValueError(f'{key}: unknown or corrupt interior geometry')
        entry = geometry[key]
        if entry['owner'] != INTERIOR_TICKET:
            if entry.get('sha256') is not None and entry['sha256'] != record['sha256']:
                raise ValueError(f'{key}: interior and surface geometry disagree')
            continue
        entry['state'] = 'recovered' if any(_drawable(record['family'], v)
                                          for v in record['variants'].values()) else 'empty'
        entry['variants'] = list(record['variants'])
        entry['sha256'] = record['sha256']
    for row in ledger['structureSlots']:
        extracted = interiors['structures'][str(row['slot'])]
        if row['floors'] != [[f['floor'], f['geometrySlot'], f['geometry']] for f in extracted['floors']]:
            raise ValueError(f'slot {row["slot"]}: interior Floor inventory disagrees')
        row['floorBindings'] = [{k: f[k] for k in ('floor', 'label', 'geometry', 'variant', 'palette',
                                                   'baseY', 'provenance')} for f in extracted['floors']]
    residents = {r['slot']: r for r in interiors['residents']}
    indoor = [o for o in ledger['objects'] if o['residence'] == 'structure']
    if set(residents) != {o['slot'] for o in indoor}:
        raise ValueError('interior extraction must bind every indoor resident exactly once')
    for o in indoor:
        recovered = residents[o['slot']]
        if any(o[k] != recovered[k] for k in ('host', 'body', 'bodyCell', 'floor', 'position')):
            raise ValueError(f'object {o["slot"]}: interior placement disagrees with the census')
        o['indoor'] = {k: recovered[k] for k in (
            'group', 'cell', 'structureSlot', 'geometry', 'variant', 'association', 'hooks',
            'dormantHooks', 'localPosition', 'origin', 'baseY', 'yaw', 'reachability', 'provenance')}
    ledger['totals']['authoredFloorGeometrySlots'] = interiors['floorInventory']['authoredSlots']
    ledger['totals']['floorBindings'] = sum(len(s['floors']) for s in ledger['structureSlots'])
    ledger['totals']['indoorResidents'] = len(residents)
    ledger['source']['interiors'] = {
        'recipe': 'research/mercenary-iii-st/m3lab/catalogue_interiors.py',
        'evidence': 'docs/research/dion-interior-recovery.md',
        'sha256': hashlib.sha256(json.dumps(interiors, sort_keys=True).encode()).hexdigest()}
    resolutions = {
        'association-hooks': 'All 180 initial indoor residents have their own-region tail and '
                             'explicit region/queue insertions; original $53C5E comparisons '
                             'are in interiorComparisons. Offsets are independent of hooks.',
        'interior-details': 'Each Floor inherits its host scale and building detail, including '
                            'the second indoor selection group; a zero alias palette selects '
                            'the parallel per-Floor palette ($56DAA..$56E5A).',
        'floor-table-slot-46': 'The eight-byte compact alias ends at $10696, where slot47 begins. '
                              'Only G=99 is authored. Other raw census bytes are retained in '
                              'censusFloors/nonFloorBytes; original floor-key refusal and '
                              'the $C000 non-lift region are documented in the report.'}
    for gap in list(ledger['gaps']):
        if gap['id'] in resolutions:
            ledger['gaps'].remove(gap)
            ledger.setdefault('resolvedGaps', []).append({
                'id': gap['id'], 'owner': gap['owner'], 'resolution': resolutions[gap['id']]})

    if any('nonFloorBytes' in s for s in interiors['structures'].values()) and not any(
            g['id'] == 'floor-table-slot-46' for g in ledger.get('resolvedGaps', [])):
        ledger.setdefault('resolvedGaps', []).append({
            'id': 'floor-table-slot-46', 'owner': INTERIOR_TICKET,
            'resolution': resolutions['floor-table-slot-46']})


def completion(ledger: dict) -> dict:
    """The milestone rule: every required identity recovered and previewed, no blocking gap."""
    required = [g for g in ledger['geometry'] if g['required']]
    outstanding = [g for g in required
                   if g['state'] not in DONE_STATES or g['preview'] is None]
    blocking = [gap['id'] for gap in ledger['gaps'] if gap['blocking']]
    by_owner = Counter(g['owner'] for g in outstanding)
    return {'complete': not outstanding and not blocking,
            'required': len(required), 'outstanding': len(outstanding),
            'outstandingByOwner': {str(k): by_owner[k] for k in sorted(by_owner)},
            'blockingGaps': blocking}


def validate_ledger(ledger: dict, *, check_decoders: bool = True) -> list[str]:
    """Every reason the ledger cannot be trusted, or an empty list."""
    problems: list[str] = []

    def check(condition: bool, message: str) -> None:
        if not condition:
            problems.append(message)

    check(ledger.get('schemaVersion') == SCHEMA_VERSION,
          f'schemaVersion is {ledger.get("schemaVersion")!r}, not {SCHEMA_VERSION}')
    check(ledger.get('kind') == 'dion-catalogue-ledger', f'kind is {ledger.get("kind")!r}')
    check(ledger.get('title') == 'dion',
          f'ledger belongs to Title {ledger.get("title")!r}, not dion')
    if problems:
        return problems  # a foreign document's other fields mean nothing here

    totals = ledger['totals']
    objects, bindings = ledger['objects'], ledger['bindings']
    groups, slots = ledger['groups'], ledger['structureSlots']
    geometry = {g['id']: g for g in ledger['geometry']}
    binding_ids = {b['id'] for b in bindings}

    # Counts are recomputed from the records, never trusted as written.
    residence = Counter(o['residence'] for o in objects)
    check([o['slot'] for o in objects] == list(range(1, 247)),
          'objects must be persistent slots 1..246, once each, in order')
    check(totals['objectSlots'] == len(objects), 'objectSlots disagrees with objects')
    check(totals['residence'] == {r: residence[r] for r in RESIDENCES},
          'residence totals disagree with objects')
    check(len(groups) == totals['groups'] == 57 and
          [g['group'] for g in groups] == list(range(57)), 'groups must be 0..56')
    check(len(bindings) == totals['authoredBindings'], 'authoredBindings disagrees with bindings')
    check(len(binding_ids) == len(bindings), 'binding identities repeat')
    check(len({(b['group'], b['cell']) for b in bindings}) == len(bindings),
          'a group cell is bound twice: count cells, not writes')
    check(sum(b['state'] != 'initially-absent' for b in bindings) == totals['initialBindings'],
          'initialBindings disagrees with binding states')
    check(len(slots) == totals['selectedStructureSlots'] and
          {s['slot'] for s in slots} == {b['slot'] for b in bindings},
          'structureSlots must be exactly the slots the bindings select')
    floor_slots = {f[1] for s in slots for f in s.get('censusFloors', s['floors'])}
    check(len(floor_slots) == totals['floorGeometrySlots'],
          'floorGeometrySlots disagrees with the Floor Tables')
    check(sum(1 for b in ledger['bodies'] for _ in b['islands']) == totals['islandPlacements'],
          'islandPlacements disagrees with bodies')
    check(len(ledger['places']) == totals['places'], 'places disagrees with place labels')

    for g in groups:
        check(g['disposition'] in GROUP_DISPOSITIONS,
              f'group {g["group"]} has unknown disposition {g["disposition"]!r}')
        own = [b for b in bindings if b['group'] == g['group']]
        check(g['authoredBindings'] == len(own), f'group {g["group"]} binding count disagrees')
        check((g['disposition'] == 'unused') == (not g['islands']),
              f'group {g["group"]}: only an unused group has no island placement')
        if g['disposition'] in ('bare-islands', 'outline-only', 'label-only', 'unused'):
            check(not own, f'group {g["group"]} is {g["disposition"]} but binds cells')

    slot_map = {s['slot']: s for s in slots}
    for s in slots:
        label = f'structure slot {s["slot"]}'
        floors = [f for f, _, _ in s['floors']]
        check(floors == sorted(set(floors)) and all(0 <= f <= 10 for f in floors),
              f'{label} Floors must be distinct indices 0..10')
        check(bool(floors) and floors[0] == 0 and s['floors'][0][2] is not None,
              f'{label} has no Floor 0 geometry')
        for floor, _, key in s['floors']:
            if key is None:
                check(any(gap['subject'] == f'structureSlot:{s["slot"]}' and gap['blocking']
                          for gap in ledger['gaps']),
                      f'{label} Floor {floor} is unresolved without a blocking gap')
            else:
                check(key in geometry, f'{label} names unknown geometry {key}')
        check(s['detail'] in geometry, f'{label} names unknown detail {s["detail"]}')
    for b in bindings:
        label = f'binding {b["id"]}'
        check(b['state'] in BINDING_STATES, f'{label} has unknown state {b["state"]!r}')
        check(b['slot'] in slot_map, f'{label} selects unlisted structure slot {b["slot"]}')
    for state, group in (('storage', VOID_GROUP), ('field-seed', MIDAS_GROUP)):
        check({b['group'] for b in bindings if b['state'] == state} <= {group},
              f'only group {group} bindings may be {state}')

    for o in objects:
        label = f'object {o["slot"]}'
        check(o['residence'] in RESIDENCES, f'{label} has unknown residence')
        placed = o['residence'] in ('structure', 'surface')
        check((o['body'] is not None) == placed and (o['position'] is not None) == placed,
              f'{label}: only a placed object has a Body and position')
        check((o['host'] is not None) == (o['residence'] == 'structure'),
              f'{label}: only an indoor resident has a host')
        host = o['host'] or {}
        if 'binding' in host:
            check(host['binding'] in binding_ids, f'{label} names unknown host {host["binding"]}')
        elif host:
            check(host.get('field') == 'midas' and 0 <= host.get('cell', -1) < 256,
                  f'{label} host is neither a binding nor the MIDAS field')
        if o['geometry'] is not None:
            check(o['geometry'] in geometry, f'{label} names unknown geometry {o["geometry"]}')
    carried = [o['slot'] for o in objects if o['residence'] == 'carried']
    check(sorted(ledger['carriedStack']) == carried, 'Carried Stack disagrees with held objects')

    midas = ledger['midas']
    check(midas['physicalCount'] is None,
          'MIDAS is a repeating field: a workspace count is not a physical-location count')
    check(midas['workspaceBindings'] == midas['period'] ** 2 == 256,
          'MIDAS workspace must be one 16 x 16 period')
    check(midas['seed'] in binding_ids, 'MIDAS seed is not a binding')
    check([b['id'] for b in bindings if b['group'] == MIDAS_GROUP] == [midas['seed']],
          'MIDAS repetition must not enter the bindings: only its seed is authored')
    logos = ledger['logos']
    check(logos['binding'] in binding_ids and
          [s['id'] for s in logos['states']] == ['initial', 'constructed'],
          'LOGOS must carry its initial and constructed states')
    check(next((b['state'] for b in bindings if b['id'] == logos['binding']), None)
          == 'initially-absent', 'the LOGOS construction must start absent')

    referenced = Counter()
    for b in bindings:
        if b['slot'] in slot_map:
            referenced.update(key for _, _, key in slot_map[b['slot']]['floors'] if key)
            referenced[slot_map[b['slot']]['detail']] += 1
    referenced.update(o['geometry'] for o in objects if o['geometry'])
    for o in objects:
        # A further model the slot can draw counts once per slot, beside its opening one.
        referenced.update({f['geometry'] for f in o.get('forms', [])
                           if f['geometry'] and f['geometry'] != o['geometry']})
        if o['geometry'] is None:
            check(o.get('disposition', 'null-model') == 'null-model',
                  f'object {o["slot"]} has no model and no null-model disposition')
    referenced.update(i['geometry'] for body in ledger['bodies'] for i in body['islands'])
    for key, g in geometry.items():
        check(g['family'] in ledger['decoders'], f'{key} has unknown family {g["family"]}')
        check(key.startswith(g['family'] + '-') and key == ident(g['family'], address(g['record'])),
              f'{key} is not its family and record address')
        check(g['state'] in STATES, f'{key} has unknown state {g["state"]!r}')
        check(g['owner'] in (OBJECTS_TICKET, SURFACE_TICKET, INTERIOR_TICKET),
              f'{key} has no recovery owner')
        if g['family'] == 'ground' or (g['family'] == 'model' and g['owner'] == SURFACE_TICKET):
            # Reached per cell from a ground record: counted by the surface extraction.
            check(g['references'] > 0, f'{key} is not referenced by any cell')
        else:
            check(referenced[key] == g['references'] > 0,
                  f'{key} reference count disagrees with the census ({referenced[key]})')
        check(g['state'] == 'pending' or ledger['decoders'][g['family']]['module'] is not None,
              f'{key} cannot be recovered without a decoder path')
    for gap in ledger['gaps']:
        check(gap['owner'] in (OBJECTS_TICKET, SURFACE_TICKET, INTERIOR_TICKET),
              f'gap {gap["id"]} has no recovery owner')
    open_gaps = {gap['id'] for gap in ledger['gaps']}
    for gap in ledger.get('resolvedGaps', []):
        check(gap['id'] not in open_gaps, f'gap {gap["id"]} is both open and resolved')
        check(bool(gap.get('resolution')), f'gap {gap["id"]} is resolved without evidence')
    for item in ledger.get('comparisons', []):
        if item['kind'] == 'scene':
            check(item['binding'] in binding_ids, f'comparison {item["id"]} names unknown binding')
        elif item['kind'] == 'object-scene':
            check(item['geometry'] in geometry and
                  item['variant'] in (geometry[item['geometry']]['variants'] or []),
                  f'comparison {item["id"]} names unknown geometry or variant')
        else:
            check(item['agree'] <= item['points'], f'comparison {item["id"]} agrees beyond its points')
    if 'surfaceCells' in totals:
        grounds = sum(g['references'] for g in ledger['geometry'] if g['family'] == 'ground')
        check(grounds == totals['surfaceCells'],
              f'ground references cover {grounds} cells, not {totals["surfaceCells"]}')
    if 'interiors' in ledger['source']:
        check(totals.get('authoredFloorGeometrySlots') == len({f[1] for s in slots for f in s['floors']}),
              'authoredFloorGeometrySlots disagrees with authored Floors')
        check(totals.get('floorBindings') == sum(len(s['floors']) for s in slots),
              'floorBindings disagrees with authored Floors')
        indoor = [o for o in objects if o['residence'] == 'structure']
        check(totals.get('indoorResidents') == len(indoor), 'indoorResidents disagrees with objects')
        for s in slots:
            floors = s.get('floorBindings', [])
            check([(f['floor'], f['geometry']) for f in floors] == [(f, g) for f, _, g in s['floors']],
                  f'slot {s["slot"]}: resolved Floor bindings disagree')
            for f in floors:
                g = geometry.get(f['geometry'], {})
                check(f['variant'] in (g.get('variants') or []),
                      f'slot {s["slot"]}: Floor {f["floor"]} has unknown variant')
                check(f['baseY'] == f['floor'] * (s['pitch'] or 0),
                      f'slot {s["slot"]}: Floor height disagrees with pitch')
            if 'censusFloors' in s:
                check(s['slot'] == 46 and s['floors'] == [[0, 99, 'structure-01844a']] and
                      s['nonFloorBytes']['disposition'] == 'next-alias-record' and
                      s['nonFloorBytes']['range'] == ['$10696', '$1069F'] and
                      s['nonFloorBytes']['nextSlot'] == 47,
                      f'slot {s["slot"]}: compact alias census disposition disagrees')
        evidence = ledger.get('interiorComparisons', {})
        cases = evidence.get('cases', [])
        source = evidence.get('source', {})
        check(source.get('title') == 'dion' and source.get('programSha256') == ledger['source']['programSha256']
              and source.get('openingRamSha256') == ledger['source']['census']['openingRamSha256'],
              'interior comparison source disagrees with the census')
        for c in cases:
            s = slot_map.get(c['slot'], {})
            floor = next((f for f in s.get('floorBindings', []) if f['floor'] == c['floor']), {})
            check(c['geometry'] == floor.get('geometry') and c['variant'] == floor.get('variant'),
                  f'{c["id"]}: comparison identity disagrees with host Floor')
            check(c['kind'] in ('floor-assembly', 'resident-host') and
                  (c['residents'] is not None) == (c['kind'] == 'resident-host'),
                  f'{c["id"]}: comparison kind disagrees with residents')
            expected_checks = READER_CHECKS | ({'residents'} if c['kind'] == 'resident-host' else set())
            check(set(c['checks']) == expected_checks, f'{c["id"]}: comparison checks are incomplete')
            check(c.get('binding') == {'scale': s.get('scale'), 'detail': s.get('detailIndex'),
                                      'palette': floor.get('palette'), 'baseY': floor.get('baseY')},
                  f'{c["id"]}: comparison binding disagrees with resolved Floor')
        check(evidence.get('total') == len(cases) and
              evidence.get('passed') == sum(c['passed'] is True for c in cases),
              'interior reader comparison totals disagree')
        check(bool(cases) and all(c['passed'] is True and c['checks'] and all(v is True for v in c['checks'].values())
                                for c in cases),
              'interior reader comparisons are missing or failed')
        expected = {(s['slot'], f[0]) for s in slots for f in s['floors']}
        check(len({c['id'] for c in cases}) == len(cases), 'interior comparison identities repeat')
        assembled = {(c['slot'], c['floor']) for c in cases if c['kind'] == 'floor-assembly'}
        contexts = {(o['indoor']['group'], o['indoor']['cell'], o['floor'])
                    for o in indoor if o.get('indoor')}
        actual_contexts = {(c['group'], c['cell'], c['floor']) for c in cases if c['kind'] == 'resident-host'}
        check(actual_contexts == contexts and len(cases) == len(expected) + len(contexts),
              'interior reader contexts disagree with authored Floors and residents')
        check(assembled == expected, 'interior readers must compare every authored Floor')
        observed = {}
        for c in cases:
            for r in c['residents'] or []:
                row = next((o for o in indoor if o['slot'] == r['slot']), {})
                binding = row.get('indoor', {})
                check((binding.get('group'), binding.get('cell'), row.get('floor'), binding.get('structureSlot')) ==
                      (c['group'], c['cell'], c['floor'], c['slot']),
                      f'{c["id"]}: resident reader host disagrees')
                check(r['slot'] not in observed, f'resident {r["slot"]} comparison repeats')
                observed[r['slot']] = r['hooks']
        check(set(observed) == {o['slot'] for o in indoor},
              'interior readers must compare every initial indoor resident')
        for o in indoor:
            label, binding = f'object {o["slot"]}', o.get('indoor', {})
            check(bool(binding), f'{label}: missing indoor binding')
            if not binding:
                continue
            s = slot_map.get(binding['structureSlot'], {})
            floor = next((f for f in s.get('floorBindings', []) if f['floor'] == o['floor']), {})
            check(binding['geometry'] == floor.get('geometry') and binding['variant'] == floor.get('variant'),
                  f'{label}: indoor binding disagrees with host Floor')
            check(binding['hooks'] == observed.get(o['slot']), f'{label}: hooks disagree with original reader')
            check(binding['hooks'] and binding['hooks'][0] == [binding['association'], 0],
                  f'{label}: missing own-region association tail')
            host = o['host']
            if 'binding' in host:
                b = next(b for b in bindings if b['id'] == host['binding'])
                check((b['slot'], b['group'], b['cell']) ==
                      (binding['structureSlot'], binding['group'], binding['cell']),
                      f'{label}: indoor binding disagrees with host cell')
            else:
                check(binding['group'] == MIDAS_GROUP and binding['cell'] == host['cell'] and
                      binding['structureSlot'] in ledger['midas']['workspaceSlots'],
                      f'{label}: MIDAS indoor binding disagrees with workspace')
            local = [((o['position'][0] - binding['origin'][0] + 32768) % 65536) - 32768,
                     o['position'][1] - binding['baseY'],
                     ((o['position'][2] - binding['origin'][1] + 32768) % 65536) - 32768]
            check(binding['localPosition'] == local and binding['baseY'] == floor.get('baseY'),
                  f'{label}: local placement disagrees with world position or Floor')
    check(ledger['completion'] == completion(ledger), 'completion disagrees with the ledger')

    if check_decoders:
        for family, decoder in ledger['decoders'].items():
            if decoder['module'] is None:
                check(any(gap['subject'] == f'family:{family}' and gap['blocking']
                          for gap in ledger['gaps']),
                      f'family {family} has no decoder and no blocking gap')
                continue
            module = importlib.import_module(decoder['module'])
            check(callable(getattr(module, decoder['function'], None)),
                  f'decoder {decoder["module"]}.{decoder["function"]} does not exist')
    return problems


def dumps(ledger: dict) -> str:
    """Key-sorted JSON with one record per line, so a regenerated ledger diffs by record."""
    def compact(value) -> str:
        return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(', ', ': '))

    lines = ['{']
    keys = sorted(ledger)
    for index, key in enumerate(keys):
        value = ledger[key]
        tail = ',' if index < len(keys) - 1 else ''
        if isinstance(value, list) and value and isinstance(value[0], dict):
            lines.append(f'  {json.dumps(key)}: [')
            lines.extend(f'    {compact(item)}{"," if i < len(value) - 1 else ""}'
                         for i, item in enumerate(value))
            lines.append(f'  ]{tail}')
        elif isinstance(value, dict):
            lines.append(f'  {json.dumps(key)}: {{')
            inner = sorted(value)
            for i, k in enumerate(inner):
                comma = ',' if i < len(inner) - 1 else ''
                if key == 'interiorComparisons' and k == 'cases':
                    lines.append('    "cases": [')
                    lines.extend(f'      {compact(c)}{"," if j < len(value[k]) - 1 else ""}'
                                 for j, c in enumerate(value[k]))
                    lines.append(f'    ]{comma}')
                else:
                    lines.append(f'    {json.dumps(k)}: {compact(value[k])}{comma}')
            lines.append(f'  }}{tail}')
        else:
            lines.append(f'  {json.dumps(key)}: {compact(value)}{tail}')
    lines.append('}')
    return '\n'.join(lines) + '\n'


def load_ledger(path: Path = LEDGER_PATH) -> dict:
    return json.loads(Path(path).read_text())


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--run', type=Path, required=True, help='a census_capture run directory')
    parser.add_argument('--surface', type=Path, help='a catalogue_surface extraction (#682)')
    parser.add_argument('--interiors', type=Path, help='a catalogue_interiors extraction (#683)')
    parser.add_argument('--interior-comparisons', type=Path, help='original interior reader comparisons')
    parser.add_argument('--interior-scenes', type=Path, help='representative original indoor scenes')
    parser.add_argument('--objects', type=Path, help='a catalogue_objects extraction (#681)')
    parser.add_argument('--object-comparisons', type=Path,
                        help='the object_scenes results, objects.json (#681)')
    parser.add_argument('--comparisons', type=Path,
                        help='the directory holding surface_scenes scenes.json and coasts.json')
    parser.add_argument('--out', type=Path, default=LEDGER_PATH)
    args = parser.parse_args()
    surface = json.loads(args.surface.read_text()) if args.surface else None
    objects = json.loads(args.objects.read_text()) if args.objects else None
    comparisons = ({kind: json.loads((args.comparisons / f'{kind}.json').read_text())
                    for kind in ('scenes', 'coasts')} if args.comparisons else None)
    if comparisons is not None and args.object_comparisons:
        comparisons['objects'] = json.loads(args.object_comparisons.read_text())
    if args.interior_comparisons or args.interior_scenes:
        comparisons = comparisons or {}
    if args.interior_comparisons:
        comparisons['interiors'] = json.loads(args.interior_comparisons.read_text())
    if args.interior_scenes:
        comparisons['interiorScenes'] = json.loads(args.interior_scenes.read_text())
    interiors = json.loads(args.interiors.read_text()) if args.interiors else None
    ledger = build_ledger(args.run, surface=surface, comparisons=comparisons, models=objects,
                          interiors=interiors)
    args.out.write_text(dumps(ledger))
    c = ledger['completion']
    print(f"Wrote {args.out}: {len(ledger['geometry'])} Geometry Identities, "
          f"{c['outstanding']} of {c['required']} required outstanding")


if __name__ == '__main__':
    main()
