"""ADR 0065's bounded export. Catalogue audit pins never become play identity.

The six D1 documents remain explicitly historical immutable dependencies. Their
incidental opening state is not the expanded initial state. Production activation
and the Save migration belong to I4; this export has its own strict loader.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import struct
from pathlib import Path

from .boot import BASELINE, REPOSITORY
from .ram import Ram, hexaddr
from .geometry import model_record, resolve_structure
from .world import extract_world, log_float
from .census_objects import extract_objects
from .scripts import decode_range, BASE, ENTRY_TABLE, _summarise
from .text import static_strings
from .snapshot_owners import observe, FIELDS
from .__main__ import camel

KINDS = ('world', 'panel', 'messages', 'scripts', 'sound', 'service')
PROGRAM = BASELINE['programImage']['sha256']
DOMAIN = b'dion-play-content-v1\x00'


def digest(value) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode()).hexdigest()


def content_identity(documents: list[tuple[str, bytes]]) -> str:
    h = hashlib.sha256(DOMAIN)
    for path, data in documents:
        name = path.encode('utf-8')
        h.update(struct.pack('>I', len(name)))
        h.update(name)
        h.update(struct.pack('>Q', len(data)))
        h.update(data)
    return h.hexdigest()


def encoded(value) -> bytes:
    return (json.dumps(value, sort_keys=True, indent=2, ensure_ascii=True) + '\n').encode('utf-8')


def require_equal(actual, expected, path):
    if actual != expected:
        raise ValueError(f'{path}: disagrees with reviewed binding')


def checked_record(value, expected, path):
    require_equal(digest(value), expected, f'{path}.sourceRecordSha256')
    return copy.deepcopy(value)


def source_pin(source: dict) -> dict:
    # Whole-export hashes/timestamps/path names are audit inputs, not selected content.
    return {'title': 'dion', **{k: copy.deepcopy(source[k]) for k in
            ('title', 'programSha256', 'run', 'openingRamSha256', 'ramSha256',
             'tosSha256', 'emulatorSha256', 'emulatorVersion', 'capturePc', 'armedAtVbl', 'recipe')
            if k in source}}


def select_catalogue(spec: dict, catalogue: dict, geometry: dict, support: dict) -> tuple[dict, dict, dict]:
    require_equal(spec['kind'], 'dion-tourcraft-promotion-specification', 'specification.kind')
    require_equal(spec['schemaVersion'], 1, 'specification.schemaVersion')
    require_equal(spec['blockingResearchGaps'], [], 'specification.blockingResearchGaps')
    require_equal(catalogue['kind'], 'dion-catalogue', 'catalogue.kind')
    require_equal(catalogue['schemaVersion'], 1, 'catalogue.schemaVersion')
    for label, source in [('catalogue', catalogue['source']), ('support', support['source']),
                          *[(g, d['source']) for g, d in geometry.items()]]:
        require_equal(source['title'], 'dion', f'{label}.source.title')
        require_equal(source['programSha256'], PROGRAM, f'{label}.source.programSha256')
        require_equal(source_pin(source), source_pin(spec['sources']['catalogue-immutable']), f'{label}.source')
    require_equal(support['kind'], 'dion-catalogue-render-support', 'support.kind')
    require_equal(support['schemaVersion'], 1, 'support.schemaVersion')
    exported = {}
    for selected in spec['geometry']:
        key = selected['id']
        if key not in geometry:
            raise ValueError(f'{key}: missing required geometry')
        document = geometry[key]
        require_equal(document['kind'], 'dion-catalogue-geometry', f'{key}.kind')
        require_equal(document['schemaVersion'], 1, f'{key}.schemaVersion')
        row = document['geometry']
        require_equal(digest({k: v for k, v in row.items() if k != 'sha256'}),
                      selected['catalogueRecordSha256'], f'{key}.sha256')
        for field in ('id', 'family', 'record'):
            require_equal(row[field], selected[field], f'{key}.{field}')
        require_equal(row['sha256'], selected['catalogueRecordSha256'], f'{key}.sha256')
        variants = {v: copy.deepcopy(row['variants'][v]) for v in selected['variants']}
        require_equal(digest(variants), selected['selectedVariantsSha256'], f'{key}.selectedVariantsSha256')
        # Retain the whole source-record hash, plus the independently hashed actual subset.
        exported[key] = {'kind': 'dion-play-geometry', 'schemaVersion': 1, 'source': selected['source'],
                         'geometry': {**copy.deepcopy(row), 'variants': variants}}
    placements = {p['id']: p for p in catalogue['placements']}
    for p in spec['placements']:
        checked_record(placements[p['id']], p['sourceRecordSha256'], p['id'])
    cells = {(int(group), row['cell']): row for group, rows in catalogue['surfaceCells'].items() for row in rows}
    for cell in spec['surfaceCells']:
        checked_record(cells[cell['group'], cell['cell']], cell['sourceRecordSha256'],
                       f"surfaceCells.{cell['group']}.{cell['cell']}")
    structures = {s['slot']: s for s in catalogue['structures']}
    for s in spec['structures']:
        for k, v in s.items():
            require_equal(structures[s['slot']][k], v, f"structures.{s['slot']}.{k}")
    for p in spec['placements']:
        s = structures[p['slot']]
        floor = next(f for f in s['floorBindings'] if f['floor'] == 0)
        for k in ('geometry', 'variant', 'palette'):
            require_equal(p[k], floor[k], f"{p['id']}.{k}")
        require_equal(p['detail'], s['detail'], f"{p['id']}.detail")
        if p['variant'] not in exported[p['geometry']]['geometry']['variants']:
            raise ValueError(f"{p['id']}.variant: missing required form")
    selection = spec['renderSupportSelection']
    selected_support = {'kind': 'dion-play-support', 'schemaVersion': 1, 'source': 'catalogue-immutable'}
    for field, rows, id_key, record_key in [
        ('glyphs', selection['glyphs'], 'id', 'id'),
        ('palettes', selection['palettes'], 'index', 'index'),
        ('bodies', selection['bodySupportRecords'], 'body', 'body'),
        ('groups', selection['groupSupportRecords'], 'group', 'group')]:
        # The additive road grid was recovered after R7. It is outside this
        # reviewed selection; retain and check R7's original group record.
        selected_support[field] = {str(r[id_key]): checked_record(
                                  {k: v for k, v in support[field][str(r[record_key])].items() if k != 'roads'}
                                  if field == 'groups' else support[field][str(r[record_key])],
                                  r['sourceRecordSha256'], str(r[id_key])) for r in rows}
    for r in selection['sharedTableRecords']:
        selected_support[r['name']] = checked_record(support[r['name']], r['sourceRecordSha256'], r['name'])
    tokens = {}
    for token in selection['tokens']:
        key = token['token']
        checked_record(catalogue['lettering']['tokens'][key], token['sourceRecordSha256'], key)
        if token['kind'] == 'placement':
            strings = {r['range'][0]: r for r in token['stringSourceRanges']}
            decoded = support['tokens'][key]
            values = [('default', token['default'], decoded['default'])]
            require_equal(len(decoded['bindings']), len(token['bindings']), f'{key}.bindings.length')
            values.extend((f'bindings.{i}', pointer, value)
                          for i, (pointer, value) in enumerate(zip(token['bindings'], decoded['bindings'])))
            for name, pointer, value in values:
                pin = strings[pointer]
                encoded_string = bytes(value) + b'\0'
                lo, hi = (int(a[1:], 16) for a in pin['range'])
                require_equal(len(encoded_string), hi-lo, f'{key}.{name}.string.length')
                require_equal(hashlib.sha256(encoded_string).hexdigest(), pin['sha256'], f'{key}.{name}.string.sha256')
        # Frozen inspection text is deliberately excluded for live/animated buffers.
        tokens[key] = {**copy.deepcopy(token), **(copy.deepcopy(support['tokens'][key])
                      if token['kind'] in ('static', 'placement') else {})}
    selected_support['tokens'] = tokens
    keys = ('scope', 'groups', 'bodyPlacements', 'placements', 'structures', 'surfaceCells',
            'legacyModels', 'residents', 'services', 'postArrivalServiceBinding', 'workspaceSourcePins',
            'reachableScriptEntries', 'nonGeometryClosure', 'presentationGeometry', 'presentationSources',
            'skyBodies', 'skyDrawLists', 'spaceScan', 'renderSupportSelection', 'fieldDispositions', 'dispositionRules')
    metadata = {'kind': 'dion-play-promotion', 'schemaVersion': 1,
                **{k: copy.deepcopy(spec[k]) for k in keys},
                'sources': {k: source_pin(v) for k, v in spec['sources'].items() if k != 'presentationInventory'},
                'geometry': [{k: copy.deepcopy(v) for k, v in g.items() if k != 'catalogueFileSha256'} for g in spec['geometry']]}
    for slot in metadata['structures']:
        original = structures[slot['slot']]
        binding = next(b for b in original['floorBindings'] if b['floor'] == 0)
        slot.update({'geometry': binding['geometry'], 'variant': binding['variant'],
                     'resolvedRecord': exported[binding['geometry']]['geometry']['record'],
                     'sourceRecordSha256': digest(original)})
    return metadata, exported, selected_support


def require_range(ram: Ram, row: dict, label: str):
    lo, hi = (int(v[1:], 16) for v in row['range'])
    ram.require(lo, hi, row['sha256'], label)


def gameplay_records(spec: dict, ram: Ram, selected: dict) -> dict:
    require_equal(ram.sha256, spec['sources']['gameplay-opening']['ramSha256'], 'gameplay-opening.ramSha256')
    for g in spec['geometry']:
        for r in g['sourceRanges']:
            require_range(ram, r, f"{g['id']}.sourceRanges")
    for row in spec['nonGeometryClosure']:
        if 'sourceRange' in row:
            require_range(ram, row['sourceRange'], row['id'])
    for rows in spec['presentationSources'].values():
        for row in rows:
            require_range(ram, row['sourceRange'], row['role'])
    for r in spec['initialStateRequirements']['ranges']:
        require_range(ram, r, 'initialStateRequirements')
    for s in spec['structures']:
        actual = resolve_structure(ram, s['slot'])
        for k in ('scale', 'palette', 'detail'):
            require_equal(actual[k], s['detailIndex'] if k == 'detail' else s[k], f"structures.{s['slot']}.{k}")
        for p in spec['placements']:
            if p['slot'] == s['slot']:
                require_equal(hexaddr(actual['record']), selected[p['geometry']]['geometry']['record'],
                              f"structures.{s['slot']}.record")
    census = extract_objects(ram)
    by_slot = {r['slot']: r for r in census['objects']}
    residents = []
    for r in spec['residents']:
        actual = by_slot[r['slot']]
        checked_record(actual, r['initialRecordSha256'], f"residents.{r['slot']}.initial")
        require_equal(actual['modelRecord'], r['initialModelRecord'], f"residents.{r['slot']}.modelRecord")
        residents.append(actual)
    bindings = {r['entry']: r['geometry'] for r in spec['legacyModels']}
    bindings.update({r['slot']: r['geometry'] for r in spec['residents'] if r['geometry'] is not None})
    for cell in spec['surfaceCells']:
        for entry in cell['templates']:
            matching = [g['geometry']['id'] for g in selected.values()
                        if g['geometry']['family'] == 'model' and entry in g['geometry'].get('entries', [])]
            if len(matching) != 1:
                raise ValueError(f'template entry {entry}: missing or ambiguous Geometry Identity')
            bindings[entry] = matching[0]
    bindings.update({279: 'model-0381de', 280: 'model-038282', 320: 'model-03108a'})
    for entry, geometry in bindings.items():
        selection_row = next(g for g in spec['geometry'] if g['id'] == geometry)
        require_equal(hexaddr(model_record(ram, entry)), selection_row['record'], f'modelBindings.{entry}.record')
    # Geometry is served only once, through the admitted selected forms. Model
    # selections are gameplay bindings, not a second copy of decoded geometry.
    # All mutable fields below read this RAM, never the inspection capture.
    initial_world = extract_world(ram, ram, pinned=False)
    initial = {'source': 'gameplay-opening', 'opening': initial_world['opening'], 'residents': residents,
               'carriedStack': census['carriedStack'],
               'bodyPhases': [ram.long(0x575A + 4*i) for i in range(32)],
               'flags': [ram.long(0x7270), ram.long(0x7274)],
               'availability': {str(i): ram.byte(0x7352+i) for i in spec['reachableScriptEntries']['ordinary']},
               'vm': {'pc': hexaddr(ram.long(0x6EDA)), 'queue': ram.word(0x711C), 'wait': ram.word(0x7236),
                      'timer': ram.word(0x727E), 'timedTarget': ram.word(0x7280),
                      'busy': ram.word(0x723A), 'continuation': ram.word(0x7230), 'hold': ram.word(0x6FF46)},
               'view': {'eye': [ram.slong(a) for a in (0x7126, 0x712A, 0x712E)],
                        'roll': ram.word(0x7132), 'pitch': ram.word(0x7134), 'yaw': ram.word(0x7136),
                        'longitude': ram.word(0x70B4), 'latitude': ram.word(0x70B8),
                        'headSelector': ram.word(0x6FF4A), 'headCount': ram.word(0x6EA2),
                        'headProfile': ram.word(0x6EA4), 'headCursor': hexaddr(ram.long(0x6EA6))},
               'faceTokens': {key: {'output': ram.word(a), 'baseCursor': ram.word(a+2), 'alternateCursor': ram.word(b)}
                              for key, a, b in [('$A1', 0xB4FA, 0xB51E), ('$A5', 0xB602, 0xB61C)]},
               'liveTokens': {t['token']: cstring(ram, int(t['pointer'][1:], 16))
                              for t in spec['renderSupportSelection']['tokens'] if t['kind'] == 'live'}}
    # R8b supplies the coherent mutable-owner seed, including inactive carries.
    # It is exported from this already pinned RAM, not copied from a later flight.
    initial['playerZone'] = ram.word(0x70CE)
    initial['owners'] = observe(ram)
    initial['ownerWidths'] = {group: {name: width for name, (_, width) in fields.items()}
                              for group, fields in FIELDS.items()}
    initial['soundRegisters'] = [1, 0, 1, 0, 1, 0, 31, 254, 0, 0, 0, 0, 0, 0]
    initial['beaconGates'] = {str(value): bool(ram.byte(at) & 128) for value, at in [(5, 0x64BE), (4, 0x64C2)]}
    return {'initial': initial, 'modelBindings': bindings,
            'modelBindingSources': {str(e): ram.slice(ram.long(0x4BD10)+2*e, ram.long(0x4BD10)+2*e+2) for e in sorted(bindings)},
            'blinkPhase': {entry: ram.word(0x54400 + 4*int(entry)) for entry, key in bindings.items()
                           if (selected[key]['geometry'].get('header') or {}).get('op') == 3}}


def cstring(ram: Ram, at: int) -> list[int]:
    end = ram.data.index(0, at)
    if end - at > 256:
        raise ValueError(f'{hexaddr(at)}: invalid selected token length')
    return list(ram.bytes(at, end))


def programme_records(spec: dict, ram: Ram) -> dict:
    statics = static_strings(ram)
    scripts = []
    for row in spec['nonGeometryClosure']:
        if row['id'] in ('outward-script-29', 'election-77', 'first-election-continuation', 'mining-13',
                         'mining-continuation', 'final-election-continuation'):
            lo, hi = (int(v[1:], 16) for v in row['sourceRange']['range'])
            routine = decode_range(ram, lo, hi, statics)
            if not routine['aligned'] or routine['unknown_opcodes']:
                raise ValueError(f"{row['id']}: malformed script region")
            scripts.append({'id': row['id'], **routine, 'summary': _summarise(routine)})
    actions, epoch, previous = [], 0, 0
    for at in range(0x66D40, 0x66E4C, 2):
        low, control = ram.byte(at), ram.byte(at+1)
        if low < previous:
            epoch += 256
        actions.append({'frame': epoch+low, 'kind': 'stick' if control & 128 else 'key',
                        'value': control & 127, 'source': ram.slice(at, at+2)})
        previous = low
    require_equal(len(actions), 134, 'playback.actions.length')
    return {'arrivalResidence': {'source': ram.slice(0x66E4E, 0x66E58),
                                 'heading': ram.word(0x66E56)},
            'ambientTaxi': {'source': ram.slice(0x42AC8, 0x42AF2), 'group': 23,
                            'rate': ram.sword(0x42AC8), 'metadata': ram.long(0x42ACA),
                            'price': ram.long(0x42ACE),
                            'route': [{'x': ram.byte(a)&15, 'z': ram.byte(a+1)&15,
                                       'control': ram.byte(a+1)>>4} for a in range(0x42AD2, 0x42AEE, 2)]},
            'scripts': scripts,
            'entries': {str(i): hexaddr(BASE + ram.word(ENTRY_TABLE+2*i)) for i in (41, 119, 19)},
            'playback': {'source': ram.slice(0x66D2A, 0x66E4E),
                         'header': {'x': ram.slong(0x66D2A), 'z': ram.slong(0x66D2E), 'yaw': ram.word(0x66D32),
                                    'systemEye': [ram.slong(a) for a in (0x66D34, 0x66D38, 0x66D3C)], 'eyeY': 63},
                         'actions': actions, 'lastConsumedFrame': 927},
            'headSequences': {hexaddr(a): list(ram.bytes(a, ram.data.index(0, a)+1))
                              for a in sorted({BASE+int(i['value'][1:], 16) for r in scripts for i in r['instructions']
                                               if i.get('name') == 'store2' and i['operands'][0]['address'] == '$6FF4A'})},
            'sharedReturn': decode_range(ram, 0x701DD, 0x701E0, statics),
            'faceSequences': {key: {'selector': ram.word(a), 'base': list(ram.bytes(lo, hi)),
                                    'alternate': list(ram.bytes(alo, ahi))}
                              for key, a, lo, hi, alo, ahi in [
                                  ('$A1', 0xB4F8, 0xB4FE, 0xB51E, 0xB520, 0xB54E),
                                  ('$A5', 0xB600, 0xB606, 0xB61C, 0xB61E, 0xB63E)]},
            'collisionTone': {'entry': '$4C8A0', 'channel': 'B', 'registers': [[9, 31], [11, 0x21], [12, 0x30], [13, 9]],
                              'periods': [ram.word(a) for a in range(0x7C90, 0x7CA2, 2)]},
            'encounter': {'pairs': [{'address': hexaddr(a), 'count': ram.byte(a), 'request': ram.byte(a+1)}
                                    for a in (0x6E50, 0x6E74)],
                          'trajectories': [{'address': hexaddr(a), 'records': [
                              {'x': ram.sword(a+8*j), 'y': ram.sword(a+8*j+2), 'z': ram.sword(a+8*j+4),
                               'shift': ram.byte(a+8*j+6), 'count': ram.byte(a+8*j+7)}
                              for j in range(4)]} for a in (0x522BC, 0x522E2, 0x52308)]}}


def system_records(spec: dict, ram: Ram) -> dict:
    bodies = []
    for b in spec['skyBodies']:
        offset = b['offset']
        bodies.append({'id': b['body'], 'name': b['name'], 'offset': offset,
                       'centre': [ram.slong(0x5350+offset), ram.slong(0x56DA+offset), ram.slong(0x53D0+offset)],
                       'size': log_float(ram.long(0x5450+offset)), 'encodedSize': ram.long(0x5450+offset),
                       'colour': ram.long(0x54D0+offset), 'rate': ram.long(0x7AEA+offset),
                       'skyNight': ram.word(0x7B6A+offset), 'skyDay': ram.word(0x7B6C+offset),
                       'flags': list(ram.bytes(0x7BEA+offset, 0x7BEE+offset))})
    return {'kind': 'dion-play-system', 'schemaVersion': 1, 'source': 'gameplay-opening', 'bodies': bodies,
            'drawLists': spec['skyDrawLists'], 'spaceScan': spec['spaceScan'],
            'spacePalette': {'background': 1, 'fixed': {'13': 0x333, '14': 0x411, '15': 0x777},
                             'provenance': ram.slice(0x5A8A2, 0x5A8BA)},
            'sine': [log_float(ram.long(0x64000+4*i)) for i in range(1024)]}


def craft_records(ram: Ram) -> dict:
    # R6's independently checked data windows, not Damocles records or code.
    pins = [('exp', 0x60000, 0x62000, 'f21d7cf049056a87abcb33d18af13b544a50daecb9087cd690f3c63f3698fb6d'),
            ('sine', 0x64000, 0x65000, '79831644423f32a0412588a994c5249b12abd39ceb23dc3130de7440e97495a6'),
            ('negativeLog', 0x62000, 0x63002, '79d066dd0f847caa73516119b3b3faaa189e01c18f42f9a23656a50bbaca9ab3'),
            ('positiveLog', 0x65000, 0x66000, '2e0d2944a6ed62a211dac1ce8d3acfcb907be0af51cf8f9bfd7527a47cc2ef63'),
            ('positiveLogEndpoint', 0x66000, 0x66002, 'cb48cb917df319f0bbbd3fc3f004ef8428f954bbcaf7f734d32357dd53875507'),
            ('arctan', 0x66002, 0x66103, '03ab75ced39a3c62580ab3e24c4e54867b63bbdd1135da55cdf6bd678f74f221'),
            ('octants', 0x4F0C6, 0x4F0D6, 'cc474c2af1aa232c500b06210171228cf07f9befa973e945d3c4b3b27c805149')]
    tables = {}
    for key, lo, hi, sha in pins:
        pin = ram.require(lo, hi, sha, key)
        step = 4 if key == 'sine' else 1 if key == 'arctan' else 2
        values = [ram.long(a) if step == 4 else ram.byte(a) if step == 1 else ram.word(a) for a in range(lo, hi, step)]
        tables[key] = {'values': values, 'provenance': pin}
    parameters = []
    for slot, at, routine, sha in [
        (0, 0x56ED6, 'space', '332c2a5bc5e3e436c4c4ef732923c4dda5f547cd0e3204f5e9bd895b716904d6'),
        (1, 0x56EF6, 'surface-common', '56415c9b810d61e817737ed7162384e17975408f0b1b3809134cca5028eb0588')]:
        parameters.append({'slot': slot, 'routine': routine, 'provenance': ram.require(at+4, at+32, sha, f'craft slot {slot}'),
                           'damping': ram.long(at+4), 'acceleration': ram.long(at+8),
                           'pitch': ram.word(at+12), 'rollPitchExponent': ram.word(at+14),
                           'retained10': ram.long(at+16), 'lag': ram.long(at+20),
                           'retained18': ram.word(at+24), 'ceiling': ram.word(at+26), 'gain': ram.long(at+28)})
    return {'kind': 'dion-play-craft', 'schemaVersion': 1, 'source': 'gameplay-opening', 'tables': tables, 'parameters': parameters}


def legacy_document(root: Path, row: dict) -> bytes:
    # D1 may advance independently. Keep the exact reviewed dependency rather
    # than substituting the new export or changing the TOURCRAFT identity.
    for path in (root / row['path'], root / 'payload/dion/tourcraft' / f"{row['kind']}.json"):
        if path.is_file():
            data = path.read_bytes()
            if hashlib.sha256(data).hexdigest() == row['sha256']:
                return data
    raise ValueError(f"{row['path']}.sha256: missing or altered historical dependency")


def build_export(root: Path, opening: Path) -> dict[str, bytes]:
    spec = json.loads((root / 'research/mercenary-iii-st/tourcraft-promotion-manifest.json').read_text())
    read = lambda p: json.loads((root / p).read_text())
    geometry = {g['id']: read(f"payload/dion/catalogue/geometry/{g['id']}.json") for g in spec['geometry']}
    metadata, selected, support = select_catalogue(spec, read('payload/dion/catalogue/catalogue.json'),
                                                  geometry, read(spec['renderSupport']['path']))
    ram = Ram.load(opening)
    gameplay = gameplay_records(spec, ram, selected)
    programmes = programme_records(spec, ram)
    prefix = '/payload/dion/tourcraft'
    output = {}
    for row in spec['legacyDocuments']:
        data = legacy_document(root, row)
        # Immutable historical dependency; retaining bytes also preserves the old Save audit.
        output[f"{prefix}/{row['kind']}.json"] = data
    output[f'{prefix}/promotion.json'] = encoded(metadata)
    for key, document in sorted(selected.items()):
        output[f'{prefix}/geometry/{key}.json'] = encoded(document)
    tail = spec['presentationGeometry'][0]
    require_range(ram, tail['sourceRange'], tail['id'])
    output[f"{prefix}/geometry/{tail['id']}.json"] = encoded({
        'kind': 'dion-play-geometry', 'schemaVersion': 1, 'source': 'gameplay-opening',
        'geometry': {'id': tail['id'], 'family': 'sky-tail', 'record': tail['record'],
                     'provenance': [tail['sourceRange']], 'variants': {'base': {
                         'vertices': [[0, 0, 0], [0, -250, 0], [0, 250, 0], [-250, 0, 0], [250, 0, 0]],
                         'faces': [[0, 1, 2], [0, 2, 1], [0, 3, 4], [0, 4, 3]], 'colour': 0x777}}}})
    extras = {'craft': craft_records(ram),
              'gameplay': {'kind': 'dion-play-gameplay', 'schemaVersion': 1, 'source': 'gameplay-opening', **camel(gameplay)},
              'programmes': {'kind': 'dion-play-programmes', 'schemaVersion': 1, 'source': 'gameplay-opening', **camel(programmes)},
              'support': support, 'system': system_records(spec, ram)}
    for key in sorted(extras):
        output[f'{prefix}/presentation/{key}.json'] = encoded(extras[key])
    output[f'{prefix}/presentation/taxi.json'] = (root / 'web/dion/metis.json').read_bytes()
    ordered = [*[f'{prefix}/{kind}.json' for kind in KINDS], f'{prefix}/promotion.json',
               *sorted(p for p in output if p.startswith(f'{prefix}/geometry/')),
               *sorted(p for p in output if p.startswith(f'{prefix}/presentation/'))]
    output = {p: output[p] for p in ordered}
    manifest = {'kind': 'dion-play-manifest', 'schemaVersion': 1, 'title': 'dion', 'destination': 'metis',
                'programSha256': PROGRAM, 'mutableSource': 'gameplay-opening', 'sources': metadata['sources'],
                'playableDocuments': [{'path': p, 'sha256': hashlib.sha256(output[p]).hexdigest()} for p in ordered]}
    # The manifest is last in the digest and contains no derived self-referential hash.
    output[f'{prefix}/manifest.json'] = encoded(manifest)
    return output


def write_export(output: Path, documents: dict[str, bytes]):
    if output.resolve() == (REPOSITORY / 'payload/dion').resolve() or 'catalogue' in output.resolve().parts:
        raise ValueError('export output must be independent of Catalogue and legacy playable documents')
    output.mkdir(parents=True, exist_ok=True)
    for path, data in documents.items():
        relative = path.removeprefix('/payload/dion/tourcraft/')
        target = output / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    return content_identity(list(documents.items()))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--opening', type=Path, required=True)
    parser.add_argument('--root', type=Path, default=REPOSITORY)
    parser.add_argument('--out', type=Path, default=REPOSITORY / 'payload/dion/tourcraft')
    args = parser.parse_args()
    print(write_export(args.out, build_export(args.root, args.opening)))


if __name__ == '__main__':
    main()
