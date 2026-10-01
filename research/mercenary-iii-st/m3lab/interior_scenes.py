"""Capture representative original Dion interior frames and validate reader state.

Existing indoor residents are destinations without rewriting their association
or Floor. A displaced MIDAS NULL-model probe copies one resident's residence
and moves sixteen physical cells, preserving the periodic workspace selector.
These are original-reader comparisons, not browser raster parity checks.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from .boot import REPOSITORY, Plan, run
from .catalogue_interiors import extract_interiors, local_position
from .geometry import decode_structure, structure_record
from .ram import Ram, hexaddr
from .scene import DESTINATION, ENTER, LOOP_CALL, POSE_SLOT, poke

RESULTS = REPOSITORY / 'restricted' / 'mercenary-iii-683'
SCENES = (
    ('prison-attachments', 10, 0, (0, 0)),
    ('prison-lettering', 10, 512, (0, 0)),
    ('companies-floor-4', 30, 0, (0, 0)),
    ('enterprise-basement', 224, 256, (0, 0)),
    ('velos-floor-9', 44, 512, (0, 0)),
    ('mirrored-floor-9', 226, 0, (0, 0)),
    ('midas-resident', 101, 0, (0, 0)),
    ('midas-displaced-period', 101, 0, (16, 0)),
)


def destination_commands(slot: int, heading: int, *, opening: Ram | None = None,
                         cells: tuple[int, int] = (0, 0)) -> list[str]:
    if not 1 <= slot <= 246:
        raise ValueError('destination must be a persistent resident slot')
    commands = [poke(0x7156, heading, 2)]
    if cells != (0, 0):
        if opening is None:
            raise ValueError('a displaced destination needs source residence')
        source, target = 4 * slot, 4 * POSE_SLOT
        if opening.byte(0x681C + source) != 8 or opening.byte(0x641D + source) != 56:
            raise ValueError('only a MIDAS resident may be displaced')
        if any(c % 16 for c in cells):
            raise ValueError('displacement must preserve the MIDAS workspace period')
        for base, delta in ((0x581C, cells[0] * 65536), (0x5C1C, 0),
                            (0x601C, cells[1] * 65536)):
            commands.append(poke(base + target, opening.long(base + source) + delta, 4))
        commands.extend([poke(0x681C + target, opening.long(0x681C + source), 4),
                         poke(0x641D + target, 56, 1)])
        slot = POSE_SLOT
    commands.extend([f'r d0=${4 * slot:x}', f'r pc=${DESTINATION:x}'])
    return commands


def bound_hooks(ram: Ram) -> dict[int, list[list[int]]]:
    p, result = 0x50F0, {}
    for _ in range(256):
        slot = ram.byte(p)
        p += 1
        if not slot:
            return result
        pairs = []
        while ram.byte(p):
            pairs.append([ram.byte(p), ram.byte(p + 1)])
            p += 2
        p += 1
        result[slot] = pairs
    raise ValueError('original resident-hook list is unterminated')


def validate_scene(ram: Ram, resident: dict, floor: dict, position: list[int]) -> dict:
    expected = {'group': resident['group'], 'cell': resident['cell'], 'Floor': resident['floor']}
    original = {'group': ram.word(0x6FDE), 'cell': ram.word(0x71F4), 'Floor': ram.word(0x7158)}
    for key, value in expected.items():
        if original[key] != value:
            raise ValueError(f"resident {resident['slot']} {key}: original {original[key]}, decoded {value}")
    checks = {
        'scale': ([ram.sword(0x7046), ram.sword(0x7048)], floor['scale']),
        'detail': (ram.byte(0x54AE7), floor['detail']),
        'origin': ([ram.word(0x718A), ram.word(0x718C)], resident['origin']),
        'eyeXZ': ([ram.long(0x7146), ram.long(0x714E)], [position[0], position[2]]),
        'eyeY': (ram.long(0x714A), position[1] + 63),
    }
    record = int(floor['record'][1:], 16)
    if floor['pitch'] is not None:
        table = ram.long(0x72BA)
        geometry = ram.byte(table + resident['floor'])
        checks['geometryRecord'] = (structure_record(ram, geometry), record)
        checks['pitch'] = (ram.word(0x7198), floor['pitch'])
    else:
        checks['geometryRecord'] = (structure_record(ram, ram.word(0x7188)), record)
    palette_table = ram.long(0x4BD16)
    expected_palette = palette_table + ram.sword(palette_table + 2 * floor['palette'])
    checks['palettePointer'] = (ram.word(0x70A8), expected_palette)
    night_palette = expected_palette + ram.sword(expected_palette - 2)
    checks['nightPalettePointer'] = (ram.word(0x70AA), night_palette)
    checks['activePalette'] = (ram.long(0x70A4) in (expected_palette, night_palette), True)
    plan = decode_structure(ram, record, floor['scale'])
    original_plan = [[ram.slong(0x1640 + 4 * (i + 1)), ram.slong(0x1898 + 4 * (i + 1))]
                     for i in range(len(plan['plan']))]
    checks['plan'] = (original_plan, plan['plan'])
    checks['heights'] = ([ram.sword(0x71BE), ram.sword(0x71C0)], plan['heights'])
    original_texts = []
    for index, text in enumerate(plan['wallTexts']):
        base = 0xAE50 + 20 * index
        pointer = ram.long(base + 16)
        original_texts.append([ram.word(base) // 4,
                               list(ram.bytes(pointer, pointer + len(text['text'])))])
    checks['wallTexts'] = (original_texts, [[t['face'], t['text']] for t in plan['wallTexts']])
    hooks = bound_hooks(ram)
    checks['associationHooks'] = (hooks.get(resident['slot']), resident['hooks'])
    local = local_position([ram.long(0x7146), ram.long(0x714A) - 63, ram.long(0x714E)],
                           resident['origin'], floor['baseY'])
    checks['localPosition'] = (local, local_position(position, resident['origin'], floor['baseY']))
    checks['residentPosition'] = ([ram.long(base + 4 * resident['slot'])
                                   for base in (0x581C, 0x5C1C, 0x601C)], resident['position'])
    mismatches = {key: {'original': a, 'decoded': b} for key, (a, b) in checks.items() if a != b}
    if mismatches:
        raise ValueError(f"resident {resident['slot']} reader mismatch: {json.dumps(mismatches)}")
    return {'state': 'matched', 'checks': list(checks), 'group': original['group'],
            'workspaceCell': original['cell'], 'physicalCell': [position[0] // 65536 % 4096,
                                                              position[2] // 65536 % 4096],
            'floor': original['Floor'], 'geometry': floor['geometry'], 'geometrySlot': floor['geometrySlot'],
            'record': hexaddr(record), 'scale': floor['scale'], 'detail': floor['detail'],
            'palette': floor['palette'], 'association': resident['association'],
            'hooks': hooks[resident['slot']], 'localPosition': local,
            'region': ram.word(0x7194), 'regionFlags': ram.word(0x71CC),
            'uniformWorkspace': bool(ram.word(0x70C0)), 'ramSha256': ram.sha256}


def run_scenes(census: Path, names: set[str]) -> dict:
    extraction = extract_interiors(census)
    opening = Ram.load(census / 'start.ram')
    results = {}
    for name, slot, heading, cells in SCENES:
        if names and name not in names:
            continue
        resident = next(r for r in extraction['residents'] if r['slot'] == slot)
        floor = next(f for f in extraction['structures'][str(resident['structureSlot'])]['floors']
                     if f['floor'] == resident['floor'])
        commands = destination_commands(slot, heading, opening=opening, cells=cells)
        pc_commands = [(6500, LOOP_CALL, commands)]
        camera_offset = [0, 0, 0]
        if name == 'prison-lettering':
            camera_offset[2] = -2116
            target = resident['position'][2] + camera_offset[2]
            pc_commands.append((6600, LOOP_CALL, [poke(0x714E, target, 4),
                                                poke(0x7040, -2000, 2)]))
        plan = Plan(name=name, inputs=[(6000, ('key', ENTER))], captures=[7000], loop_top=True,
                    pc_commands=pc_commands)
        directory = run(plan, RESULTS / 'runs')
        ram = Ram.load(directory / 'v7000.ram')
        position = list(resident['position'])
        position[0] += cells[0] * 65536
        position[2] += cells[1] * 65536
        position = [a + b for a, b in zip(position, camera_offset)]
        comparison = validate_scene(ram, resident, floor, position)
        result = {'resident': slot, 'run': directory.name, 'originalScreenshot': str(directory / 'v7000.png'),
                  'comparison': comparison, 'comparisonKind': 'original-reader-state',
                  'rasterComparison': {'state': 'not-performed',
                      'reason': 'The existing browser scene planner has no selected-Floor input.'},
                  'reachability': 'debugger-destination; campaign access unverified',
                  'displacementCells': list(cells), 'cameraOffset': camera_offset, 'source': extraction['source']}
        (directory / 'comparison.json').write_text(json.dumps(result, sort_keys=True, indent=1) + '\n')
        results[name] = result
        print(f"{name}: original reader state matched ({directory.name})", flush=True)
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--census', type=Path, required=True)
    parser.add_argument('names', nargs='*')
    args = parser.parse_args()
    if set(args.names) - {s[0] for s in SCENES}:
        raise SystemExit('unknown interior scene name')
    RESULTS.mkdir(parents=True, exist_ok=True)
    results = run_scenes(args.census, set(args.names))
    out = RESULTS / 'scenes.json'
    previous = json.loads(out.read_text()) if out.exists() else {}
    out.write_text(json.dumps({**previous, **results}, sort_keys=True, indent=1) + '\n')


if __name__ == '__main__':
    main()
