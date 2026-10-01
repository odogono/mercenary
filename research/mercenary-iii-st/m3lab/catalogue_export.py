"""Export #684's title-local Catalogue without touching playable Metis documents.

Recovery records are preserved verbatim under each geometry file's `geometry`;
the ledger's content digest covers that record without its own sha256 field.
No original media or instructions are exported.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
from pathlib import Path

from .boot import REPOSITORY
from .catalogue_ledger import validate_ledger
from .catalogue_surface import digest


def build_export(ledger_path: Path, objects: dict, surface: dict, interiors: dict) -> tuple[dict, dict]:
    ledger = json.loads(ledger_path.read_text())
    problems = validate_ledger(ledger)
    if problems:
        raise ValueError('; '.join(problems))
    census = ledger['source']['census']
    for name, recovery in [('objects', objects), ('surface', surface), ('interiors', interiors)]:
        if recovery['source']['census'] != census['run']:
            raise ValueError(f'{name}.source.census disagrees with the ledger')
    source = {'title': 'dion', 'programSha256': ledger['source']['programSha256'],
              'run': census['run'], 'openingRamSha256': census['openingRamSha256'],
              'ledgerSha256': hashlib.sha256(ledger_path.read_bytes()).hexdigest()}
    records = {}
    for recovery in (objects, surface, interiors):
        for key, row in recovery['geometry'].items():
            if key in records and records[key] != row:
                raise ValueError(f'{key}: recovery children disagree')
            records[key] = row
    required = {g['id']: g for g in ledger['geometry']}
    if set(records) != set(required):
        raise ValueError(f'geometry inventory differs: {sorted(set(records) ^ set(required))}')
    geometry = {}
    for key, entry in required.items():
        row = records[key]
        content_hash = digest({k: v for k, v in row.items() if k != 'sha256'})
        if entry['state'] == 'pending' or content_hash != entry.get('sha256') or row['sha256'] != content_hash:
            raise ValueError(f'{key}: missing or corrupt recovered geometry')
        if any(row[k] != entry[k] for k in ('id', 'family', 'record')):
            raise ValueError(f'{key}: identity disagrees with the ledger')
        geometry[key] = {'kind': 'dion-catalogue-geometry', 'schemaVersion': 1,
                         'source': source, 'geometry': copy.deepcopy(row)}
    for name, recovery in [('objects', objects), ('surface', surface), ('interiors', interiors)]:
        if hashlib.sha256(json.dumps(recovery, sort_keys=True).encode()).hexdigest() != ledger['source'][name]['sha256']:
            raise ValueError(f'{name}.source/content disagrees with the ledger')
    # Recover the cell-spacing word through the already-evidenced indoor origins.
    bindings = {b['id']: b for b in ledger['bindings']}
    spacings = { (resident['origin'][axis] - 32768) // bindings[resident['host']['binding']][delta]
                 for resident in interiors['residents'] if 'binding' in resident['host']
                 for axis, delta in enumerate(('dx', 'dz'))
                 if bindings[resident['host']['binding']][delta] }
    if len(spacings) != 1:
        raise ValueError('interior origins disagree about cell spacing')
    spacing = spacings.pop()
    bodies = copy.deepcopy(ledger['bodies'])
    islands = {i['group']: (b['id'], i) for b in bodies for i in b['islands'] if i['group'] != 0}
    placements = []
    for binding in ledger['bindings']:
        body, island = islands[binding['group']]
        cell = [(island['origin'][0] + (binding['cell'] & 15)) % 4096,
                (island['origin'][1] + (binding['cell'] >> 4)) % 4096]
        placements.append({**binding, 'body': body, 'bodyCell': cell,
                           'origin': [(32768 + binding['dx'] * spacing) % 65536, (32768 + binding['dz'] * spacing) % 65536],
                           'structure': f'slot-{binding["slot"]:03d}'})
    structures = []
    for row in ledger['structureSlots']:
        floors = [{'floor': f, 'geometrySlot': s, 'geometry': g,
                   'label': 'G' if f == 0 else 'B' if f == 10 else str(f)} for f, s, g in row['floors']]
        structures.append({**copy.deepcopy(row), 'id': f'slot-{row["slot"]:03d}', 'floors': floors})
    exported_objects = copy.deepcopy(ledger['objects'])
    for row in exported_objects:
        if row['host'] and 'binding' in row['host']:
            row['host'] = {'placement': row['host']['binding']}
        if row['geometry'] is None:
            row['disposition'] = 'null-model'
    document = {'kind': 'dion-catalogue', 'schemaVersion': 1, 'source': source,
                'bodies': bodies, 'areas': [{**g, 'id': f'area-{g["group"]:02d}'} for g in ledger['groups']],
                'placements': placements, 'structures': structures, 'objects': exported_objects,
                'places': [{**{k: v for k, v in p.items() if k != 'binding'},
                            'area': f'area-{p["group"]:02d}', 'placement': p['binding']} for p in ledger['places']],
                'field': copy.deepcopy(ledger['midas']), 'constructions': copy.deepcopy(ledger['logos']),
                'geometryIndex': copy.deepcopy(ledger['geometry']), 'coverage': copy.deepcopy(ledger['totals']),
                'gaps': copy.deepcopy(ledger['gaps']), 'resolvedGaps': copy.deepcopy(ledger['resolvedGaps']),
                'completion': copy.deepcopy(ledger['completion']), 'carriedStack': ledger['carriedStack'],
                'workingSlots': ledger['workingSlots'], 'surfaceCells': surface['cells'],
                'placementRule': {'spacing': spacing, 'reader': '$5600C..$56204',
                                  'derivedFrom': 'interior resident origins and authored dx/dz'},
                'lettering': surface['lettering'], 'rebindings': objects['rebindings'], 'services': objects['services']}
    # Body lists cover every direct and transitive draw dependency, including upper Floors,
    # alternate object forms and ground-template furniture. No geometry is fetched to build them.
    by_slot = {s['slot']: s for s in structures}
    template_models = {entry: g['id'] for g in surface['geometry'].values() if g['family'] == 'model'
                       for entry in g['entries']}
    for body in bodies:
        needed = {i['geometry'] for i in body['islands']}
        for p in placements:
            if p['body'] == body['id']:
                s = by_slot[p['slot']]
                needed.add(s['detail'])
                needed.update(f['geometry'] for f in s['floors'])
        for row in exported_objects:
            if row['body'] == body['id']:
                if row['geometry']:
                    needed.add(row['geometry'])
                needed.update(f['geometry'] for f in row.get('forms', []) if f['geometry'] is not None)
        for island in body['islands']:
            for cell in surface['cells'].get(str(island['group']), []):
                needed.update((cell['ground'], cell['selected']))
                needed.update(template_models[e] for e in cell['templates'])
        body['geometry'] = sorted(needed)
    for entry in document['geometryIndex']:
        entry['bodies'] = [b['id'] for b in bodies if entry['id'] in b['geometry']]
        # Binding variants (detail scales) and stored variants (unscaled detail) are distinct.
        entry['dataVariants'] = list(records[entry['id']]['variants'])
    return document, geometry


def write_export(output: Path, document: dict, geometry: dict) -> None:
    if output.resolve() == (REPOSITORY / 'payload/dion').resolve():
        raise ValueError('Catalogue output must not be the playable payload directory')
    output.mkdir(parents=True, exist_ok=True)
    directory = output / 'geometry'
    directory.mkdir(exist_ok=True)
    for name, value in [('catalogue.json', document), *[(f'geometry/{key}.json', row) for key, row in sorted(geometry.items())]]:
        (output / name).write_text(json.dumps(value, sort_keys=True, indent=2) + '\n')
    for path in directory.glob('*.json'):
        if path.stem not in geometry:
            path.unlink()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ledger', type=Path, default=REPOSITORY / 'research/mercenary-iii-st/catalogue-ledger.json')
    for name in ('objects', 'surface', 'interiors'):
        parser.add_argument(f'--{name}', type=Path, required=True)
    parser.add_argument('--out', type=Path, default=REPOSITORY / 'payload/dion/catalogue')
    args = parser.parse_args()
    write_export(args.out, *build_export(args.ledger, *[json.loads(getattr(args, name).read_text())
                                                      for name in ('objects', 'surface', 'interiors')]))


if __name__ == '__main__':
    main()
