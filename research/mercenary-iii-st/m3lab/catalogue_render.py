"""Export Catalogue-only inputs for the existing Dion Frame Planner (#685).

Read the pinned census RAM, never a playable payload. Geometry stays in its
validated files. These are shared title-local palette/font tables, not scripts.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
from .ram import Ram, hexaddr
from .world import glyph, road_lines, scene_palette
from .geometry import MODEL_COLOURS, DRAW_PRIORITY

def render_support(catalogue: dict, census: Path) -> dict:
    ram = Ram.load(census / 'start.ram')
    if ram.sha256 != catalogue['source']['openingRamSha256']:
        raise ValueError('render support census differs from Catalogue source')
    # The font selector's low nibble names eight original fonts. Font 4 can fall
    # back to font 3; export both, independent of today's chosen records.
    glyphs = {f'{font}:{code:02X}': glyph(ram, font, code)
              for font in range(8) for code in range(0x20, 0x60)}
    # AUTHORS COMPUTER's opening $8C buffer contains $01. $551C0 indexes
    # that byte without a printable-range check (font 2, hence font 1's A).
    glyphs['2:01'] = glyph(ram, 2, 1)
    palettes = {f['palette'] for s in catalogue['structures'] for f in s['floorBindings']}
    bodies = {}
    for body in catalogue['bodies']:
        offset = body['offset']
        bodies[body['id']] = {'skyDay': ram.word(0x7B6C+offset), 'skyNight': ram.word(0x7B6A+offset),
                             'road': ram.word(0x7186), 'land': ram.word(0x54D2+offset) & 0xFFF,
                             'provenance': [ram.slice(0x7B6A+offset,0x7B6E+offset), ram.slice(0x54D2+offset,0x54D4+offset), ram.slice(0x5A178,0x5A1A6)]}
    groups = {group: next((bodies[b['id']] for b in catalogue['bodies'] if any(i['group']==int(group) for i in b['islands'])), bodies['body-15'])
              for group in catalogue['surfaceCells']}
    for group, environment in list(groups.items()):
        workspace = Ram.load(census / 'all-groups' / f'group-{int(group):02d}.ram')
        island = next(i for b in catalogue['bodies'] for i in b['islands'] if i['group'] == int(group))
        # $4F19E reads a road colour from each group's own stream. $70B0
        # starts as the Body's sea colour; the selected core uses island land.
        groups[group] = {**environment, 'road': workspace.word(0x7186),
                         'roads': road_lines(workspace),
                         'land': island['landColour'],
                         'provenance': [*environment['provenance'], workspace.slice(0x7186,0x7188)]}
    tokens = {}
    for key, item in catalogue['lettering']['tokens'].items():
        if item['kind'] == 'placement':
            def string(at: str) -> list[int]:
                p = int(at[1:], 16)
                end = p
                while ram.byte(end): end += 1
                return list(ram.bytes(p, end))
            tokens[key] = {'bindings': [string(at) for at in item['bindings']], 'default': string(item['default'])}
        elif item['kind'] == 'static': tokens[key] = {'default': item['text']}
        else:
            opening = item['opening']
            end = opening.index(0) if 0 in opening else len(opening)
            tokens[key] = {'default': opening[:end]}
    return {'kind': 'dion-catalogue-render-support', 'schemaVersion': 1, 'source': catalogue['source'],
            'framePalette': {'template': [ram.word(0x7CA2+2*i) for i in range(17)],
                             'fixed': {'13': 0x445, '15': 0x655}, 'horizonRow': 68,
                             'provenance': [ram.slice(0x7CA2, 0x7CC4), ram.slice(0x5A578, 0x5A60E)]},
            'rotationTable': {'words': [ram.sword(0x7E4A+2*i) for i in range(320)], 'provenance': ram.slice(0x7E4A, 0x7E4A+640)},
            'modelColours': {'words': [ram.word(a) for a in range(*MODEL_COLOURS, 2)], 'provenance': ram.slice(*MODEL_COLOURS)},
            'drawPriority': {'bytes': list(ram.bytes(*DRAW_PRIORITY)), 'provenance': ram.slice(*DRAW_PRIORITY)},
            'surfaceYaw': {'slots': {str(o['slot']): ram.byte(0x6C1C + 4 * o['slot'])
                                     for o in catalogue['objects'] if o['residence'] == 'surface'},
                           'provenance': ram.slice(0x6C20, 0x6FF5)},
            # $55144 masks the colour byte with $7E: all 64 word offsets are
            # readable, including detail 39's $80B0 (entry 24).
            'glyphs': glyphs, 'palettes': {str(i): scene_palette(ram, i, 64) for i in sorted(palettes)},
            'groups': groups, 'bodies': bodies, 'tokens': tokens}

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--catalogue', type=Path, default=Path('payload/dion/catalogue/catalogue.json'))
    parser.add_argument('--census', type=Path, required=True)
    args = parser.parse_args()
    data = render_support(json.loads(args.catalogue.read_text()), args.census)
    (args.catalogue.parent / 'render-support.json').write_text(json.dumps(data, sort_keys=True, indent=2)+'\n')

if __name__ == '__main__': main()
