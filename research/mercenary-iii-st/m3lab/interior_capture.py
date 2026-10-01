"""Compare every Dion Floor assembly and initial resident hook with original readers.

Cold boot once, run $5600C for each host, $56D98 for its upper Floor, $5AD30 for
geometry and $53C5E for residents. Break before returning to gameplay. This is
reader instrumentation, not evidence of gameplay reachability or raster parity.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import tempfile
from pathlib import Path

from .boot import REPOSITORY, pinned_inputs
from .catalogue_interiors import extract_interiors
from .census_capture import hatari_arguments
from .census_locations import read_inventory
from .geometry import CELL_WORKSPACE, PALETTE_TABLE_POINTER
from .ram import Ram
from .scene import poke

ROOT = REPOSITORY / 'restricted' / 'mercenary-iii-683'
READER_CHECKS = frozenset(('scale', 'detail', 'pitch', 'palette', 'floorEye', 'plan',
                           'vertexCount', 'wallCount', 'wallRefs', 'regionCount', 'regions',
                           'wallTexts', 'associationPointer'))


def cases(extraction: dict, inventory: dict) -> list[dict]:
    bindings = {slot: next((g['id'], c) for g in inventory['groups'] for c in g['cells']
                          if c['slot'] == slot)
                for slot in map(int, extraction['structures'])}
    rows = []
    for s in extraction['structures'].values():
        group, cell = bindings[s['slot']]
        for f in s['floors']:
            rows.append({'id': f"slot-{s['slot']:03d}-floor-{f['floor']:02d}",
                         'group': group, 'cell': cell['cell'], 'binding': cell, 'floor': f,
                         'residents': None})
    hosts = {}
    for o in extraction['residents']:
        hosts.setdefault((o['group'], o['cell'], o['floor']), []).append(o['slot'])
    for (group, cell, floor), slots in sorted(hosts.items()):
        first = next(o for o in extraction['residents'] if o['slot'] == slots[0])
        s = extraction['structures'][str(first['structureSlot'])]
        b = next(c for c in inventory['groups'][group]['cells'] if c['cell'] == (0 if group == 56 else cell))
        rows.append({'id': f'host-{group:02d}-{cell:02x}-floor-{floor:02d}', 'group': group,
                     'cell': cell, 'binding': b, 'floor': next(f for f in s['floors'] if f['floor'] == floor),
                     'residents': sorted(slots, reverse=True)})
    return rows


def scripts(directory: Path, rows: list[dict]) -> dict[str, str]:
    result = {'boot.ini': f'b VBL = 4770 :trace :once :quiet :file {directory}/start.ini\nc\n',
              'start.ini': f'b pc = $5a41a :trace :once :quiet :file {directory}/case-0.ini\n'}
    for index, case in enumerate(rows):
        b, floor = case['binding'], case['floor']['floor']
        workspace = CELL_WORKSPACE + 4 * case['cell']
        result[f'case-{index}.ini'] = '\n'.join([
            poke(0x6FDE, case['group'], 2), poke(0x71F4, case['cell'], 2),
            poke(0x7138, floor, 2), poke(0x719A, 0, 2),
            poke(workspace, (b['key'] << 8) | b['slot'], 2),
            poke(workspace + 2, b['dx'], 1), poke(workspace + 3, b['dz'], 1),
            f"r d3=${case['cell']:x}", 'r pc=$5600c',
            f'b pc = $5619a :trace :once :quiet :file {directory}/select-{index}.ini', ''])
        result[f'select-{index}.ini'] = (f'savebin {directory}/{case["id"]}-bound.ram 0 $100000\n'
            + (f'w $6f3a $00 ${floor:02x}\nr pc=$56d98\n'
               f'b pc = $56e0a :trace :once :quiet :file {directory}/assemble-{index}.ini\n'
               if floor else f'parse {directory}/assemble-{index}.ini\n'))
        result[f'assemble-{index}.ini'] = (f'savebin {directory}/{case["id"]}-selected.ram 0 $100000\n'
            f'r pc=${"56e56" if floor else "5ad2c"}\n'
            f'b pc = $5b2de :trace :once :quiet :file {directory}/occupants-{index}.ini\n')
        result[f'occupants-{index}.ini'] = (f'savebin {directory}/{case["id"]}-assembled.ram 0 $100000\n'
            'r pc=$53c5e\n' f'b pc = $53cc2 :trace :once :quiet :file {directory}/save-{index}.ini\n')
        next_case = f'parse {directory}/case-{index + 1}.ini' if index + 1 < len(rows) else 'quit'
        result[f'save-{index}.ini'] = (f'savebin {directory}/{case["id"]}-occupants.ram 0 $100000\n'
                                      f'{next_case}\n')
    return result


def compare_case(directory: Path, case: dict, extraction: dict) -> dict:
    name, floor = case['id'], case['floor']
    bound = Ram.load(directory / f'{name}-bound.ram')
    selected = Ram.load(directory / f'{name}-selected.ram')
    assembled = Ram.load(directory / f'{name}-assembled.ram')
    occupants = Ram.load(directory / f'{name}-occupants.ram')
    d = extraction['geometry'][floor['geometry']]['variants'][floor['variant']]
    checks = {}
    checks['scale'] = [bound.sword(0x7046), bound.sword(0x7048)] == floor['scale']
    checks['detail'] = bound.byte(0x54AE7) == floor['detail']
    checks['pitch'] = floor['pitch'] is None or bound.word(0x7198) == floor['pitch']
    table = selected.long(PALETTE_TABLE_POINTER)
    checks['palette'] = selected.long(0x70A4) == table + selected.sword(table + 2 * floor['palette'])
    checks['floorEye'] = not floor['floor'] or selected.word(0x714C) == floor['baseY'] + 63
    plan = [[assembled.slong(0x1640 + 4 * i), assembled.slong(0x1898 + 4 * i)]
            for i in range(1, len(d['plan']) + 1)]
    checks['plan'] = plan == d['plan']
    checks['vertexCount'] = assembled.word(0x71C4) == len(d['plan']) + sum(8 if a['twoLeaves'] else 4 for a in d['attachments'])
    checks['wallCount'] = assembled.word(0x71C6) == len(d['walls']) + sum(6 if a['twoLeaves'] else 3 for a in d['attachments'])
    checks['wallRefs'] = all(
        [assembled.long(base + 4 * i) // 4 for base in (0x1D48, 0x1FA0, 0x21F8, 0x2450)[:len(w['refs'])]] == w['refs']
        and assembled.word(0x26A8 + 4 * i) == w['colour'] for i, w in enumerate(d['walls'], 1))
    checks['regionCount'] = assembled.sword(0x71CA) + 1 == len(d['regions'])
    checks['regions'] = all(
        assembled.word(0x97CC + 14 * i) == r['flags'] and
        [assembled.sword(0x97CE + 14 * i + 2 * j) for j in range(4)] == r['bounds']['x'] + r['bounds']['z']
        and assembled.long(0x97D6 + 14 * i) == int(r['queueAddress'][1:], 16)
        for i, r in enumerate(d['regions']))
    text_records = []
    at = 0xAE50
    while assembled.word(at) != 0xFFFF:
        pointer = assembled.long(at + 16)
        end = pointer
        while assembled.byte(end):
            end += 1
        text_records.append({'face': assembled.word(at) // 4,
                             'text': list(assembled.bytes(pointer, end))})
        at += 20
    checks['wallTexts'] = text_records == [{'face': t['face'], 'text': t['text']} for t in d['wallTexts']]
    association_bytes = 1 + sum(2 + 2 * len(a['hooks']) for a in d['associations'])
    checks['associationPointer'] = assembled.long(0x71A6) == int(d['provenance']['range'][1][1:], 16) - association_bytes
    hooks = []
    cursor = 0x50F0
    while occupants.byte(cursor):
        slot = occupants.byte(cursor); cursor += 1
        pairs = []
        while occupants.byte(cursor):
            pairs.append([occupants.byte(cursor), occupants.byte(cursor + 1)]); cursor += 2
        cursor += 1
        hooks.append({'slot': slot, 'hooks': pairs})
    if case['residents'] is not None:
        expected = [{'slot': slot, 'hooks': next(o['hooks'] for o in extraction['residents'] if o['slot'] == slot)}
                    for slot in case['residents']]
        checks['residents'] = hooks == expected
    return {'id': name, 'kind': 'floor-assembly' if case['residents'] is None else 'resident-host',
            'group': occupants.word(0x6FDE), 'cell': occupants.word(0x71F4),
            'slot': case['binding']['slot'], 'floor': floor['floor'],
            'geometry': floor['geometry'], 'variant': floor['variant'], 'checks': checks,
            'binding': {'scale': [bound.sword(0x7046), bound.sword(0x7048)],
                        'detail': bound.byte(0x54AE7), 'palette': floor['palette'],
                        'baseY': selected.word(0x714C) - 63 if floor['floor'] else 0},
            'residents': hooks if case['residents'] is not None else None,
            'ramSha256': assembled.sha256, 'occupantRamSha256': occupants.sha256,
            'passed': all(checks.values())}


def capture(census: Path, root: Path = ROOT / 'runs') -> dict:
    if not root.resolve().is_relative_to((REPOSITORY / 'restricted').resolve()):
        raise ValueError('original captures must stay under restricted/')
    pins = pinned_inputs()
    extraction = extract_interiors(census)
    inventory = read_inventory(Ram.load(census / 'start.ram'))
    rows = cases(extraction, inventory)
    root.mkdir(parents=True, exist_ok=True)
    directory = Path(tempfile.mkdtemp(prefix='interior-readers-', dir=root))
    for name, contents in scripts(directory, rows).items():
        (directory / name).write_text(contents)
    (directory / 'empty.cfg').write_text('')
    args = hatari_arguments(pins, directory)
    (directory / 'command.json').write_text(json.dumps(args, indent=2) + '\n')
    with (directory / 'hatari.log').open('w') as log:
        subprocess.run(args, stdout=log, stderr=log, check=True, timeout=180, stdin=subprocess.DEVNULL,
                       env={**os.environ, 'SDL_VIDEODRIVER': 'dummy', 'SDL_AUDIODRIVER': 'dummy'})
    results = [compare_case(directory, row, extraction) for row in rows]
    document = {'run': directory.name, 'source': extraction['source'], 'cases': results,
                'passed': sum(r['passed'] for r in results), 'total': len(results)}
    (directory / 'comparison.json').write_text(json.dumps(document, indent=1) + '\n')
    return document


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--census', type=Path, required=True)
    args = parser.parse_args()
    results = capture(args.census)
    (ROOT / 'readers.json').write_text(json.dumps(results, indent=1) + '\n')
    print(f"{results['passed']}/{results['total']} original reader cases agree ({results['run']})")
    failed = [r for r in results['cases'] if not r['passed']]
    if failed:
        print(json.dumps(failed[:8], indent=1))
        raise SystemExit(1)


if __name__ == '__main__':
    main()
