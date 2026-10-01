"""Recover every surface Geometry Identity the Dion Catalogue needs (#682).

Inputs are a census run (census_capture.py) and a construction run (this module's
`capture_construction`), both Restricted Material. Records are decoded with this
laboratory's own readers, each following the MIII reader it cites:

* structures bound at Floor 0, once per alias scale (`decode_structure`);
* building details, unscaled, with the scales their binds apply (`decode_detail`);
* ground records, keyed by the record the cell's ground word names, with the
  transforms the cells turn them by (`ground_transform`, `decode_ground`);
* island records (`decode_island`) and the street-furniture models that ground
  templates rebind into working slots 247..255 (`decode_model`);
* lettering: every text record's token, classed as literal, placement-bound
  (`$89`/`$9D`, chosen by the cell key at `$56062..$560AE`) or live (a buffer the
  game rewrites, with the instructions that reference it).

Per cell, the Selected Piece is recomputed from the builder's class table
(`$4F1C2..$4F224`) and compared with the Drawn Record the ready workspace holds;
an authored override (`$4F25A..$4F2A6`) accounts for every difference. Only
decoded facts leave RAM. No original instructions are reproduced.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import tempfile
from pathlib import Path

from .boot import REPOSITORY, pinned_inputs
from .census_capture import hatari_arguments
from .census_locations import read_inventory, read_workspace
from .geometry import (GROUND_WORDS, RUN_GRID, decode_detail, decode_ground, decode_island,
                       decode_model, decode_structure, detail_record, ground_transform,
                       model_record, resolve_structure)
from .ram import Ram, hexaddr
from .world import road_points

CLASS_TABLE = 0x1B0C0
SELECTORS = 0x1B100
TOKEN_TABLE = 0xB230
TOKEN_COUNT = 0x28
PLACEMENT_TOKENS = {0x89: 0x7542, 0x9D: 0x756E}
LIVE_BUFFERS = (0xB2D0, 0xB3F6)
LOGOS_GROUP, LOGOS_CELL = 8, 0x32
MIDAS_GROUP = 56


def digest(value) -> str:
    """SHA-256 of a record's canonical JSON: what #684 must export unchanged."""
    text = json.dumps(value, sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(text.encode()).hexdigest()


def cell_class(ram: Ram, cell: int) -> int:
    """`$4F1DC..$4F212`: the six class bits from the cell's row and column runs."""
    row_start, row_end, col_start, col_end = ram.bytes(RUN_GRID + 4 * cell, RUN_GRID + 4 * cell + 4)
    bits = 0
    if row_end:
        bits |= 1
        if row_end != cell:
            bits |= 2
        if row_start != cell:
            bits |= 4
    if col_end:
        bits |= 8
        if col_start != cell:
            bits |= 16
        if col_end != cell:
            bits |= 32
    return bits


def selected_piece(ram: Ram, cell: int) -> int:
    """The ground word the cell's class chose before any authored override."""
    entry = ram.byte(CLASS_TABLE + cell_class(ram, cell))
    return ram.word(SELECTORS + ((entry >> 3) & 0xE))


def ground_cells(ram: Ram, overrides: dict[int, dict]) -> list[dict]:
    cells = []
    for cell in range(256):
        start, transform, index = ground_transform(ram, cell)
        drawn = ram.word(GROUND_WORDS + 2 * cell)
        selected = selected_piece(ram, cell)
        override = overrides.get(cell)
        if drawn != selected and override is None:
            raise ValueError(f'cell ${cell:02X} draws ${drawn:04X} without an override')
        record = RUN_GRID + drawn
        model = decode_ground(ram, start)
        cells.append({
            'cell': cell, 'class': cell_class(ram, cell), 'orientation': ram.byte(0x4170 + cell),
            'ground': ground_id(record), 'selected': ground_id(RUN_GRID + selected),
            'transform': index, 'roadPoints': road_points(ram, cell, transform)['slots'],
            'templates': [p['model'] for p in model['primitives'] if p['kind'] == 'template'],
            **({'override': override['address']} if drawn != selected else {}),
        })
    return cells


def ground_id(record: int) -> str:
    return f'ground-{record:06x}'


def text_token(text: list[int]) -> int | None:
    return text[0] if text and text[0] >= 0x80 else None


def lettering(ram: Ram) -> dict:
    """Every token's binding class at the opening, and the code that references it."""
    code = ram.bytes(0x40000, 0x64000)
    tokens = {}
    for t in range(TOKEN_COUNT):
        token = 0x80 | t
        pointer = ram.long(TOKEN_TABLE + 4 * t)
        entry: dict = {'pointer': hexaddr(pointer)}
        if token in PLACEMENT_TOKENS:
            table = PLACEMENT_TOKENS[token]
            entry.update(kind='placement', bindings=[hexaddr(ram.long(table + 4 * j)) for j in range(11)],
                         default=hexaddr(pointer))
        elif LIVE_BUFFERS[0] <= pointer < LIVE_BUFFERS[1]:
            # A buffer the game writes. Writers often address it from a nearby base
            # (`$563D2` fills `$B2D2..$B2DC` downwards from `$B2DD`), so every long
            # operand within 16 bytes of the pointer is listed, by operand address.
            refs = []
            for at in range(0, len(code) - 3, 2):
                value = int.from_bytes(code[at:at + 4], 'big')
                if pointer - 16 <= value < pointer + 16:
                    refs.append(f'{hexaddr(0x40000 + at)}->{hexaddr(value)}')
            entry.update(kind='live', opening=list(ram.bytes(pointer, pointer + 4)), operands=refs)
        else:
            end = pointer
            while ram.byte(end):
                end += 1
            entry.update(kind='static', text=list(ram.bytes(pointer, end)))
        tokens[f'${token:02X}'] = entry
    return {'tokens': tokens, 'provenance': ram.slice(TOKEN_TABLE, TOKEN_TABLE + 4 * TOKEN_COUNT)}


def extract_surface(census: Path, construction: Path) -> dict:
    opening = Ram.load(census / 'start.ram')
    inventory = read_inventory(opening)
    groups = inventory['groups']
    geometry: dict[str, dict] = {}

    def add(key: str, family: str, record: int, body: dict, variant: str | None = None):
        entry = geometry.setdefault(key, {'id': key, 'family': family, 'record': hexaddr(record),
                                          'variants': {}})
        entry['variants'][variant or 'base'] = body

    # Structure geometry at Floor 0, once per alias scale its binds apply.
    slots = {}
    for group in groups:
        for c in group['cells']:
            if c['slot']:
                slots.setdefault(c['slot'], []).append((group['id'], c['cell']))
    details: dict[int, set] = {}
    for slot in sorted(slots):
        resolved = resolve_structure(opening, slot)
        scale = resolved['scale']
        details.setdefault(resolved['detail'], set()).add(tuple(scale))
        add(f'structure-{resolved["record"]:06x}', 'structure', resolved['record'],
            decode_structure(opening, resolved['record'], scale), f'scale={scale[0]},{scale[1]}')
    for index, scales in sorted(details.items()):
        record = detail_record(opening, index)
        add(f'detail-{record:06x}', 'detail', record, decode_detail(opening, index))
        geometry[f'detail-{record:06x}']['scales'] = [list(s) for s in sorted(scales)]

    # Ground per cell of every placed group, from the original builder's results.
    cells = {}
    for group in groups:
        if not group['placements']:
            continue
        ram = Ram.load(census / 'all-groups' / f'group-{group["id"]:02d}.ram')
        overrides = {o['cell']: o for o in group['overrides']}
        rows = ground_cells(ram, overrides)
        cells[group['id']] = rows
        for row in rows:
            start, transform, index = ground_transform(ram, row['cell'])
            record = RUN_GRID + ram.word(GROUND_WORDS + 2 * row['cell'])
            if ram.bytes(record, start) != opening.bytes(record, start):
                raise ValueError(f'ground record ${record:05X} differs from the opening image')
            add(row['ground'], 'ground', record, decode_ground(opening, start),
                f'transform={index}')
    for row in (r for rows in cells.values() for r in rows):
        for entry in row['templates']:
            record = model_record(opening, entry)
            add(f'model-{record:06x}', 'model', record, decode_model(opening, entry))
            geometry[f'model-{record:06x}'].setdefault('entries', set()).add(entry)

    for body in inventory['bodies']:
        for island in body['records']:
            pointer = int(island['geometry'][1:], 16)
            add(f'island-{pointer:06x}', 'island', pointer, decode_island(opening, pointer))

    # MIDAS's field and LOGOS's two states, as the original builder leaves them.
    midas = Ram.load(census / 'midas' / 'group-56-uniform.ram')
    field = read_workspace(midas, MIDAS_GROUP)['cells']
    initial = Ram.load(census / 'all-groups' / f'group-{LOGOS_GROUP:02d}.ram')
    built = Ram.load(construction / 'logos' / 'group-08-constructed.ram')
    states = {}
    for name, ram in (('initial', initial), ('constructed', built)):
        workspace = {c['cell']: c for c in read_workspace(ram, LOGOS_GROUP)['cells']}
        site = workspace.get(LOGOS_CELL)
        states[name] = {'slot': site['slot'] if site else None, 'cells': len(workspace),
                        'ramSha256': ram.sha256}
    others_initial = {c['cell']: c['slot'] for c in read_workspace(initial, LOGOS_GROUP)['cells']}
    others_built = {c['cell']: c['slot'] for c in read_workspace(built, LOGOS_GROUP)['cells']
                    if c['cell'] != LOGOS_CELL}
    if others_initial != others_built:
        raise ValueError('construction changed LOGOS cells other than the site')

    for entry in geometry.values():
        entry['variants'] = dict(sorted(entry['variants'].items()))
        if 'entries' in entry:
            entry['entries'] = sorted(entry['entries'])
        entry['sha256'] = digest({k: v for k, v in entry.items() if k != 'sha256'})
    return {
        'geometry': dict(sorted(geometry.items())),
        'cells': cells,
        'lettering': lettering(opening),
        'midas': {'cells': [{'cell': c['cell'], 'slot': c['slot'], 'dx': c['dx'], 'dz': c['dz']}
                            for c in field],
                  'ground': ground_cells(midas, {o['cell']: o for o in groups[MIDAS_GROUP]['overrides']}),
                  'ramSha256': midas.sha256},
        'logos': states,
        'source': {'census': census.name, 'construction': construction.name,
                   'openingRamSha256': opening.sha256},
    }


def capture_construction(root: Path | None = None, *, timeout: int = 120) -> Path:
    """Run the builder for LOGOS with the initial overlay list emptied.

    `$51664..$51678` removes the overlay's first record and `$51690` rebuilds; the
    fresh list holds only the LOGOS record, so an empty list at `$57DA` is the
    state that path leaves. This runs no campaign progression.
    """
    pins = pinned_inputs()
    restricted = (REPOSITORY / 'restricted').resolve()
    base = (root or restricted / 'mercenary-iii-682' / 'runs').resolve()
    if not base.is_relative_to(restricted):
        raise ValueError('construction captures must stay under the ignored restricted root')
    base.mkdir(parents=True, exist_ok=True)
    run_dir = Path(tempfile.mkdtemp(prefix='logos-construction-', dir=base))
    (run_dir / 'logos').mkdir()
    scripts = {
        'boot.ini': f'b VBL = 4770 :trace :once :quiet :file {run_dir}/start.ini\nc\n',
        'start.ini': f'b pc = $5a41a :trace :once :quiet :file {run_dir}/build.ini\n',
        'build.ini': ('w $57da $00\nw $6fde $00 $08\nw $70c0 $00 $00\nr pc=$4f0f2\n'
                      f'b pc = $4f304 :trace :once :quiet :file {run_dir}/save.ini\n'),
        'save.ini': f'savebin {run_dir}/logos/group-08-constructed.ram 0 $100000\nquit\n',
    }
    for name, text in scripts.items():
        (run_dir / name).write_text(text)
    (run_dir / 'empty.cfg').write_text('')
    args = hatari_arguments(pins, run_dir)
    with (run_dir / 'hatari.log').open('w') as log:
        subprocess.run(args, stdout=log, stderr=log, check=True, timeout=timeout,
                       stdin=subprocess.DEVNULL,
                       env={**os.environ, 'SDL_VIDEODRIVER': 'dummy',
                            'SDL_AUDIODRIVER': 'dummy'})
    built = Ram.load(run_dir / 'logos' / 'group-08-constructed.ram')
    if not any(c['cell'] == LOGOS_CELL for c in read_workspace(built, LOGOS_GROUP)['cells']):
        raise ValueError('constructed LOGOS workspace does not bind the site')
    return run_dir


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('capture', help='capture the LOGOS constructed workspace')
    out = sub.add_parser('extract', help='write the recovered surface records')
    out.add_argument('--census', type=Path, required=True)
    out.add_argument('--construction', type=Path, required=True)
    out.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    if args.command == 'capture':
        print(capture_construction())
        return
    restricted = (REPOSITORY / 'restricted').resolve()
    if not args.out.resolve().is_relative_to(restricted):
        raise SystemExit('recovered records stay under restricted/ until #684 exports them')
    surface = extract_surface(args.census, args.construction)
    args.out.write_text(json.dumps(surface, sort_keys=True, indent=1) + '\n')
    print(f"Wrote {len(surface['geometry'])} surface Geometry Identities to {args.out}")


if __name__ == '__main__':
    main()
