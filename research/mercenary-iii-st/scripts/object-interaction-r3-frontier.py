"""Read-only R3 native dependency frontier, not a gameplay promotion manifest.

No original text, geometry or instructions are exported. Static candidate
metadata never supplies an ordinary route or an admission decision.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from m3lab.census_locations import read_inventory
from m3lab.geometry import MODEL_TABLE_POINTER, model_record
from m3lab.ram import Ram

ROOT = Path(__file__).resolve().parents[3]
SOURCE = '71b957b3b7124959b01bd40b896c921d37902c18cfca042bef1906b155ef0170'
PROGRAM = '4e8b74122910bcaa109b944eebb6f0ec18fdeb1175c34eea3c932d0e1b18b62c'
WITNESSED_ITEMS = [103, 104, 124, 135, 165, 174, 181, 219, 220]
WITNESSED_BODIES = [60, 88, 100]
GATES = {
    'destination-routes': '26 initially eligible destinations lack ordinary arrival witnesses',
    'candidate-and-placement': 'resident/template selection, handling, support and placement coverage',
    'building-and-service': 'original doors, floors, lifts, transport and onward service access',
    'remote-predicates': '40/41/89/127/149/153/157/158/193/216/218 ordinary acquisition or original exclusion',
    'script-writers': 'complete admitted entry/resumed/timed graph and resident/model/held writers',
    'native-futures': 'landing/collision/key recovery/shield/disguise/failure/menu/restart futures',
    'exact-promotion': 'reviewed selected forms and complete model/text/script/sound/environment references',
    'persistence': 'versioned independent stack/held/residence/panel/VM/native owners and restored futures',
}


def digest(value: object) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'),
                                     ensure_ascii=True).encode()).hexdigest()


def source_pins(value: object):
    """Collect provenance from all forms without exporting recovered content."""
    if isinstance(value, dict):
        if isinstance(value.get('range'), list) and 'sha256' in value:
            yield value
        for child in value.values():
            yield from source_pins(child)
    elif isinstance(value, list):
        for child in value:
            yield from source_pins(child)


def geometry_reference(ram: Ram, path: Path, identity: str) -> dict:
    doc = json.loads(path.read_text())
    geometry = doc['geometry']
    if doc['source']['programSha256'] != PROGRAM or geometry['id'] != identity:
        raise ValueError(f'{identity}: foreign geometry identity')
    if digest({k: v for k, v in geometry.items() if k != 'sha256'}) != geometry['sha256']:
        raise ValueError(f'{identity}: corrupt geometry record')
    pins = {}
    for pin in source_pins(geometry):
        first, last = (int(a[1:], 16) for a in pin['range'])
        ram.slice(first, last)  # validate half-open address bounds before comparing
        checked = ram.require(first, last, pin['sha256'], identity)
        pins[(first, last)] = checked
    return {'id': identity, 'disposition': 'reference-candidate-only',
            'fileSha256': hashlib.sha256(path.read_bytes()).hexdigest(),
            'catalogueSource': doc['source'], 'recordSha256': geometry['sha256'],
            'candidateForms': sorted(geometry['variants']),
            'candidateFormsSha256': digest(geometry['variants']),
            'coherentSourceChecks': [pins[key] for key in sorted(pins)]}


def scan_rows(ram: Ram) -> list[dict]:
    endpoint = ram.long(0x72AA)
    if endpoint != 116:
        raise ValueError(f'foreign scan endpoint {endpoint}; expected long116')
    rows = []
    for offset in range(0, 124, 4):
        y = ram.slong(0x56DA + offset)
        scanned = offset <= endpoint
        rows.append({'bodyOffset': offset, 'scanned': scanned, 'storedY': y,
                     'initialEntryCandidate': scanned and offset != 0 and y >= 0,
                     'centreBits': [ram.long(base + offset) for base in (0x5350, 0x56DA, 0x53D0)],
                     'radiusBits': ram.long(0x5450 + offset),
                     'rotationBits': ram.long(0x575A + offset),
                     'sky': [ram.word(base + offset) for base in (0x7B6A, 0x7B6C)],
                     'environment': list(ram.bytes(0x7BEA + offset, 0x7BEE + offset)),
                     'colour': ram.word(0x54D2 + offset) & 0xFFF,
                     'entryParameterBits': ram.long(0x782A + offset)})
    return rows


def resident_record(ram: Ram, slot: int, stack: list[int]) -> dict:
    a = 4 * slot
    state = ram.byte(0x641E + a)
    residence = list(ram.bytes(0x681C + a, 0x6820 + a))
    role = ('template-workspace' if slot >= 247 else 'initial-carried' if slot in stack
            else 'absent' if residence[0] in (0, 120)
            else 'structure' if residence[1] else 'surface')
    return {'slot': slot, 'initialRole': role, 'state': state, 'held': bool(state & 128),
            'inStack': slot in stack, 'fixedBit4': bool(state & 16), 'heavyBit5': bool(state & 32),
            'supplyRank': state & 3, 'demandRank': (state >> 2) & 3,
            'group': ram.byte(0x641D + a), 'zone': ram.byte(0x641F + a),
            'residenceBytes': residence,
            'position': [ram.slong(base + a) for base in (0x581C, 0x5C1C, 0x601C)],
            'yaw': ram.byte(0x6C1C + a),
            'sourceRanges': [ram.slice(base + a, base + a + 4)
                             for base in (0x581C, 0x5C1C, 0x601C, 0x641C, 0x681C, 0x6C1C)]}


def build(ram: Ram, root: Path = ROOT) -> dict:
    if ram.sha256 != SOURCE:
        raise ValueError('not the coherent mutable first-top source')
    catalogue_path = root / 'payload/dion/catalogue/catalogue.json'
    catalogue = json.loads(catalogue_path.read_text())
    if catalogue['source']['programSha256'] != PROGRAM:
        raise ValueError('foreign Catalogue program')
    locations = read_inventory(ram)
    stack = list(ram.bytes(0x563E, 0x563E + ram.word(0x563C)))
    if stack != [104, 103, 135]:
        raise ValueError('foreign initial Carried Stack')
    residents = [resident_record(ram, slot, stack) for slot in range(1, 256)]
    model_table = ram.long(MODEL_TABLE_POINTER)
    model_ids = set()
    for row in residents:
        slot = row['slot']
        record = model_record(ram, slot)
        row['modelBinding'] = ram.slice(model_table + 2 * slot, model_table + 2 * slot + 2)
        row['labelPin'] = ram.slice(record - 16, record)
        row['geometry'] = (f'model-{record:06x}'
                           if ram.word(model_table + 2 * slot) != ram.word(model_table) else None)
        if row['geometry']:
            model_ids.add(row['geometry'])
        row['interactionAdmission'] = 'unreviewed'
        row['ordinaryAcquiredWitness'] = slot in WITNESSED_ITEMS
    bodies = scan_rows(ram)
    group_ids = set()
    for row, authored in zip(bodies, locations['bodies'], strict=True):
        offset = row['bodyOffset']
        row['authoredGroups'] = sorted({p['group'] for p in authored['records']})
        row['authoredSource'] = authored['provenance']
        row['ordinaryArrivalWitness'] = offset in WITNESSED_BODIES
        row['physicalResidents'] = [r['slot'] for r in residents
                                    if r['initialRole'] in ('structure', 'surface')
                                    and r['residenceBytes'][0] == offset]
        row['admission'] = 'unreviewed'
        if row['initialEntryCandidate']:
            group_ids.update(row['authoredGroups'])
        catalogued = catalogue['bodies'][offset // 4]
        if catalogued['offset'] != offset or catalogued['sha256'] != authored['provenance']['sha256']:
            raise ValueError(f'Body{offset}: Catalogue authored binding mismatch')
        row['catalogueRecordSha256'] = digest(catalogued)
    groups = []
    for group in sorted(group_ids):
        original = locations['groups'][group]
        recovered = catalogue['areas'][group]
        if recovered['group'] != group or recovered['sha256'] != original['provenance']['sha256']:
            raise ValueError(f'group{group}: Catalogue stream mismatch')
        groups.append({'group': group, 'sourceRange': original['provenance'],
                       'catalogueRecordSha256': digest(recovered),
                       'authoredCellCount': len(original['cells']),
                       'finalStructures': sorted({c['slot'] for c in original['cells'] if c['slot']}),
                       'namedPlaceCount': len(original['labels'])})
    candidate_body_ids = {f'body-{r["bodyOffset"] // 4:02d}' for r in bodies if r['initialEntryCandidate']}
    geometries = []
    unselected = []
    for indexed in catalogue['geometryIndex']:
        body_refs = sorted(candidate_body_ids.intersection(indexed.get('bodies', [])))
        if not body_refs and indexed['id'] not in model_ids:
            unselected.append({'id': indexed['id'], 'family': indexed['family'],
                               'bodyReferences': indexed.get('bodies', []),
                               'catalogueIndexRecordSha256': digest(indexed),
                               'disposition': 'unreviewed-reference-closure; not an exclusion'})
            continue
        path = catalogue_path.parent / 'geometry' / (indexed['id'] + '.json')
        reference = geometry_reference(ram, path, indexed['id'])
        if reference['recordSha256'] != indexed['sha256']:
            raise ValueError(f'{indexed["id"]}: Catalogue index mismatch')
        reference['bodyReferences'] = body_refs
        reference['initialModelBinding'] = indexed['id'] in model_ids
        geometries.append(reference)
    if model_ids - {g['id'] for g in geometries}:
        raise ValueError('unresolved initial model binding')
    evidence = []
    for name in ('object-interaction-r3-routes', 'object-interaction-r3-inventory',
                 'object-interaction-r3-followup', 'eagle-flight-routes', 'eagle-natural-encounters',
                 'object-interaction-r2-expanded-owners', 'object-interaction-r2-current-owners'):
        path = root / 'research/mercenary-iii-st' / (name + '.json')
        evidence.append({'file': str(path.relative_to(root)),
                         'fileSha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    cards = [{'slot': ram.byte(a), 'category': ram.byte(a + 1), 'band': ram.byte(a + 2),
              'sourceRange': ram.slice(a, a + 8)} for a in range(0x4D6EA, 0x4D80A, 8)]
    return {'schemaVersion': 1, 'issue': 772, 'kind': 'native-dependency-review-frontier',
            'generator': {'file': str(Path(__file__).relative_to(ROOT)),
                          'sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest()},
            'mutableSourceSha256': ram.sha256, 'programSha256': PROGRAM,
            'catalogueSource': catalogue['source'],
            'catalogueFileSha256': hashlib.sha256(catalogue_path.read_bytes()).hexdigest(),
            'runtimePromotion': None, 'I1Ready': False, 'requiredOpenGates': GATES,
            'ordinaryWitnessItems': WITNESSED_ITEMS, 'ordinaryNativeArrivalBodies': WITNESSED_BODIES,
            'scanEndpointSource': ram.slice(0x72AA, 0x72AE),
            'bodies': bodies, 'groups': groups, 'residents': residents, 'cards': cards,
            'geometryReferenceCandidates': geometries, 'unselectedGeometryReferences': unselected,
            'evidenceReferences': evidence,
            'locationSourceChecks': locations['sourceRanges'],
            'pickupResponses': [{'slot': ram.byte(a + 1), 'script': ram.byte(a),
                                 'sourceRange': ram.slice(a, a + 2)}
                                for a in (0x555EE, 0x555F0, 0x555F2)],
            'limits': ['static eligibility is not an ordinary route or acquisition',
                       'all geometry forms are candidates, not selected promotion variants',
                       'initial resident and model domain is not complete later script-writer closure',
                       'VOID49 working storage has no arrival witness; template identities are not persistent objects',
                       'referenced route ledgers retain separate ordinary and synthetic classes',
                       'no runtime, Data Payload, Save or Session Resume changes']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--opening', type=Path,
                        default=ROOT / 'restricted/mercenary-iii-708/presentation/exact2/start.ram')
    parser.add_argument('--out', type=Path,
                        default=ROOT / 'research/mercenary-iii-st/object-interaction-r3-frontier.json')
    args = parser.parse_args()
    result = build(Ram.load(args.opening))
    args.out.write_text(json.dumps(result, indent=2, sort_keys=True) + '\n')
    print(f'{sum(b["initialEntryCandidate"] for b in result["bodies"])} destination candidates; '
          f'{len(result["groups"])} groups; {len(result["residents"])} persistent/template records; '
          f'{len(result["geometryReferenceCandidates"])} geometry reference candidates; I1 blocked')
