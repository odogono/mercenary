"""Read-only #772 source/reference inventory; exports no original text or geometry.

Mutable records come only from D2's coherent first top. Catalogue record/form
pins stay independent. Numeric availability is not gameplay admission.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

from m3lab.geometry import MODEL_TABLE_POINTER, model_name, model_record
from m3lab.ram import Ram
from m3lab.text import STATIC_STRINGS, decode_packed, parts_of, static_strings

ROOT = Path(__file__).resolve().parents[3]
SOURCE = '71b957b3b7124959b01bd40b896c921d37902c18cfca042bef1906b155ef0170'
PROGRAM = '4e8b74122910bcaa109b944eebb6f0ec18fdeb1175c34eea3c932d0e1b18b62c'
CANDIDATES = [124, 165, 174, 181, 219, 220]
CARRIED = [104, 103, 135]
PREDICATES = [0, 38, 39, 149, 157, 158]


def digest(value: object) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'),
                                     ensure_ascii=True).encode()).hexdigest()


def read(path: Path) -> dict:
    return json.loads(path.read_text())


def build(opening: Path) -> dict:
    ram = Ram.load(opening)
    if ram.sha256 != SOURCE:
        raise ValueError('not the coherent gameplay-opening source')
    promoted = read(ROOT / 'research/mercenary-iii-st/tourcraft-promotion-manifest.json')
    catalogue = read(ROOT / 'payload/dion/catalogue/catalogue.json')
    if promoted['programSha256'] != PROGRAM or catalogue['source']['programSha256'] != PROGRAM:
        raise ValueError('foreign program identity')
    initial = read(ROOT / 'payload/dion/tourcraft/presentation/gameplay.json')['initial']
    if initial['carriedStack'] != CARRIED:
        raise ValueError('production carried seed differs')
    model_table = ram.long(MODEL_TABLE_POINTER)
    residents = []
    identities = {}
    slots = sorted({r['slot'] for r in promoted['residents']} | set(CARRIED) | set(PREDICATES))
    for slot in slots:
        a = 4 * slot
        record = model_record(ram, slot)
        state = ram.byte(0x641E + a)
        row = {
            'slot': slot, 'name': model_name(ram, slot),
            'role': ('initial-carried' if slot in CARRIED else 'candidate' if slot in CANDIDATES
                     else 'predicate-only' if slot in PREDICATES else 'retained-D2-resident'),
            'newInteractionAdmission': 'pending-reviewed-scope',
            'initial': {
                'state': state, 'handling': state & 0x7F,
                'fixedBit4': bool(state & 16), 'heavyBit5': bool(state & 32),
                'supplyRank': state & 3, 'demandRank': (state >> 2) & 3,
                'group': ram.byte(0x641D + a), 'zone': ram.byte(0x641F + a),
                'residenceBytes': list(ram.bytes(0x681C + a, 0x6820 + a)),
                'position': [ram.slong(base + a) for base in (0x581C, 0x5C1C, 0x601C)],
                'yaw': ram.byte(0x6C1C + a),
                'sourceRanges': [ram.slice(base + a, base + a + 4)
                                 for base in (0x581C, 0x5C1C, 0x601C, 0x641C, 0x681C, 0x6C1C)],
            },
            'modelBinding': {'record': f'${record:05X}',
                             **ram.slice(model_table + 2 * slot, model_table + 2 * slot + 2)},
            'label': ram.slice(record - 16, record),
        }
        if slot not in PREDICATES and ram.word(model_table + 2 * slot) != ram.word(model_table):
            key = f'model-{record:06x}'
            path = ROOT / 'payload/dion/catalogue/geometry' / f'{key}.json'
            source_doc = read(path)
            geometry = source_doc['geometry']
            if (source_doc['source']['programSha256'] != PROGRAM or geometry['id'] != key
                    or int(geometry['record'][1:], 16) != record or slot not in geometry['entries']):
                raise ValueError(f'{key}: foreign or unresolved model binding')
            if digest({k: v for k, v in geometry.items() if k != 'sha256'}) != geometry['sha256']:
                raise ValueError(f'{key}: corrupt Catalogue record')
            occurrences = []
            for source_range in geometry['provenance']:
                first, last = (int(x[1:], 16) for x in source_range['range'])
                actual = ram.slice(first, last)
                if actual['sha256'] != source_range['sha256']:
                    raise ValueError(f'{key}: immutable raw source mismatch')
                occurrences.append(actual)
            current = next((g for g in promoted['geometry'] if g['id'] == key), None)
            variants = list(geometry['variants']) if current is None else current['variants']
            # Manifest variants are explicit names; verify rather than infer from IDs.
            if not all(v in geometry['variants'] for v in variants):
                raise ValueError(f'{key}: unresolved selected variant')
            row['geometry'] = key
            identities[key] = {
                'id': key, 'disposition': 'retained-D2' if current else 'proposed-addition',
                'file': str(path.relative_to(ROOT)),
                'fileSha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                'catalogueSource': source_doc['source'],
                'recordSha256': geometry['sha256'],
                'selectedVariants': variants,
                'selectedVariantsSha256': digest({v: geometry['variants'][v] for v in variants}),
                'sourceRanges': geometry['provenance'],
                'coherentOpeningRangeChecks': occurrences,
            }
        else:
            row['geometry'] = None
        residents.append(row)
    cards = []
    for i in range(36):
        address = 0x4D6EA + 8 * i
        slot = ram.byte(address)
        if slot in CARRIED + CANDIDATES:
            cards.append({'slot': slot, 'category': ram.byte(address + 1),
                          'band': ram.byte(address + 2), 'reserved': ram.byte(address + 3),
                          'colours': [ram.word(address + 4), ram.word(address + 6)],
                          'sourceRange': ram.slice(address, address + 8)})
    letter = []
    tokens = set()
    letter_codepoints = set()
    statics = static_strings(ram)
    address = 0x76C00 + ram.word(0x76C00 + 42)
    while True:
        cursor = address + 8
        cursors = []
        while True:
            decoded = decode_packed(ram, cursor)
            # Only token identifiers and cursor/range pins leave the packed source.
            tokens.update(re.findall(r'\^[0-9]|[\\\[\]]', decoded['raw']))
            for part in parts_of(decoded['raw'], statics):
                letter_codepoints.update(map(ord, part.get('text', part.get('expansion', ''))))
            cursors.append({'start': cursor, 'end': decoded['end'],
                            'sourceRange': ram.slice(cursor, decoded['end'])})
            cursor = decoded['end']
            if ram.byte(cursor) == 0:
                break
        next_offset = ram.byte(address - 1)
        letter_codepoints.update(ram.bytes(address, address + 8))
        letter.append({'address': address, 'nextOffset': next_offset,
                       'header': ram.slice(address - 1, address + 8),
                       'rowCount': len(cursors), 'rows': cursors,
                       'terminator': ram.slice(cursor, cursor + 1)})
        if not next_offset:
            break
        address += next_offset
    expansions = []
    for token in sorted(tokens):
        if token not in STATIC_STRINGS:
            raise ValueError(f'unreviewed letter token {token}')
        start = STATIC_STRINGS[token]
        end = ram.data.index(0, start) + 1
        expansions.append({'token': token, 'sourceRange': ram.slice(start, end)})
    panel_art = []
    for card in cards:
        category, band = card['category'], card['band']
        base = 0x3BA00 + ram.word(0x3BA00 + 2 * category)
        strips = base + 0x400 + band * 0x14
        panel_art.append({
            'slot': card['slot'], 'category': category, 'band': band,
            'artTableEntry': ram.slice(0x3BA00 + 2 * category, 0x3BA02 + 2 * category),
            'initialArtBuffer': ram.slice(base, base + 0x400),
            'artBufferDisposition': 'source-image; title/footer rows are rewritten on Open',
            'titleStrip': ram.slice(strips, strips + 40),
            'footerStrip': ram.slice(strips + 40, strips + 80) if category == 5 else None,
            'stampReader': '$59C2C..$59CAC',
        })
    sound = read(ROOT / 'payload/dion/tourcraft/sound.json')
    key_click = next(p for p in sound['programmes'] if p['name'] == 'key_click')
    messages = read(ROOT / 'payload/dion/tourcraft/messages.json')['messages']
    refusal_messages = []
    for ident in (2, 3, 9):
        message = next(m for m in messages if m['id'] == ident)
        pins = [message[k] for k in ('source', 'tableEntry', 'headerSource')]
        for pin in pins:
            first, last = (int(x[1:], 16) for x in pin['range'])
            if ram.digest(first, last) != pin['sha256']:
                raise ValueError(f'message {ident}: coherent source mismatch')
        refusal_messages.append({'id': ident, 'existingRecordSha256': digest(message),
                                 'sourceRanges': pins})
    region_start = ram.long(0x71A6)
    cursor = region_start
    region_associations = []
    # Same data grammar as geometry.decode_structure's association list.
    while ram.byte(cursor):
        ident = ram.byte(cursor)
        cursor += 1
        hooks = []
        while ram.byte(cursor):
            hooks.append([ram.byte(cursor), ram.byte(cursor + 1)])
            cursor += 2
        cursor += 1
        region_associations.append({'id': ident, 'hooks': hooks})
    panel = read(ROOT / 'payload/dion/tourcraft/panel.json')
    fonts = []
    for name in ('panel', 'message'):
        font = panel['fonts'][name]
        if any(chr(code) not in font['glyphs'] for code in letter_codepoints):
            raise ValueError(f'{name}: missing letter/title glyph')
        pin = font['provenance']
        first, last = (int(x[1:], 16) for x in pin['range'])
        if ram.digest(first, last) != pin['sha256']:
            raise ValueError(f'{name}: font source mismatch')
        fonts.append({'name': name, 'existingRecordSha256': digest(font), 'sourceRange': pin})
    return {
        'schemaVersion': 1, 'kind': 'dion-object-interaction-r3-inventory', 'issue': 772,
        'status': 'research-inventory-pending-scope-and-route-review',
        'programSha256': PROGRAM,
        'mutableSource': {'id': 'gameplay-opening',
                          'path': 'restricted/mercenary-iii-708/presentation/exact2/start.ram',
                          'ramSha256': ram.sha256},
        'tool': {'path': str(Path(__file__).relative_to(ROOT)),
                 'sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest()},
        'immutablePinsAreIndependent': True,
        'catalogueCoverageDoesNotAdmitAccess': True,
        'retainedD2ResidentSlots': [r['slot'] for r in promoted['residents']],
        'candidateSlots': CANDIDATES, 'initialCarriedSlots': CARRIED,
        'predicateOnlySlots': PREDICATES,
        'residents': residents, 'geometry': [identities[k] for k in sorted(identities)],
        'additionalGeometry': [k for k in sorted(identities)
                               if identities[k]['disposition'] == 'proposed-addition'],
        'stack': {'count': ram.word(0x563C), 'ids': CARRIED,
                  'capacity': ram.word(0x7098), 'storeCount': ram.word(0x563A),
                  'sourceRanges': [ram.slice(0x563A, 0x5641), ram.slice(0x7098, 0x709A)]},
        'cards': cards, 'panelArt': panel_art,
        'emptyStackLabel': ram.slice(0x4E396, 0x4E3A6),
        'retainedRefusalMessages': refusal_messages,
        'openingRegionDropList': {
            'sourceRange': ram.slice(region_start, cursor + 1),
            'associations': region_associations, 'pointerSource': ram.slice(0x71A6, 0x71AA),
            'dropReader': ram.slice(0x557AE, 0x557D6),
            'laterBoundListsRequireTheirOwnSelection': True,
        },
        'letter': {'slot': 220, 'offsetTableEntry': ram.slice(0x76C2A, 0x76C2C),
                   'sections': letter, 'tokens': expansions, 'liveTokens': [],
                   'requiredCodepoints': sorted(letter_codepoints), 'retainedFonts': fonts},
        'pickupResponses': [{'slot': ram.byte(a + 1), 'script': ram.byte(a),
                             'sourceRange': ram.slice(a, a + 2)}
                            for a in (0x555EE, 0x555F0, 0x555F2)],
        'newResponseEntriesForCandidateOrCarriedSlots': [],
        'serviceKey': {'craftSlot': 3, 'pairedHeldSlot': 181,
                       'reader': '$554B0', 'heldAddress': '$66F2',
                       'scopeConsequence': 'natural-KEY181-acquisition-and-EAGLE3-boarding-confirmed-in-R3-route-ledger; resulting-progression-needs-scope-review',
                       'sourceRange': ram.slice(0x55458, 0x555BC)},
        'interactionSound': {'existingContentPath': 'payload/dion/tourcraft/sound.json',
                             'existingRecordSha256': digest(key_click),
                             'entry': key_click['entry'],
                             'helper': ram.slice(0x55B6A, 0x55B9E),
                             'newContentProgrammeRequired': False,
                             'newOrderedRequestSitesRequired': True},
        'pendingDependencies': ['letter-section-title-and-description-semantic-admission',
                                'support-height-readers-for-naturally-reached-supports',
                                'resulting-EAGLE-access-and-held-cross-readers',
                                'R1-general-restore-operand-policy', 'R2-finite-effect-acceptance'],
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--opening', type=Path,
                        default=ROOT / 'restricted/mercenary-iii-708/presentation/exact2/start.ram')
    parser.add_argument('--out', type=Path,
                        default=ROOT / 'research/mercenary-iii-st/object-interaction-r3-inventory.json')
    args = parser.parse_args()
    result = build(args.opening)
    args.out.write_text(json.dumps(result, indent=2, sort_keys=True) + '\n')
    print(f'{len(result["residents"])} records; {len(result["geometry"])} geometry identities; '
          f'{len(result["additionalGeometry"])} proposed additions; '
          f'{sum(s["rowCount"] for s in result["letter"]["sections"])} letter rows')
