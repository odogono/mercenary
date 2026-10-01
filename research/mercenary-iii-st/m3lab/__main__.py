"""Mercenary III laboratory command line.

    python -m m3lab capture [--name NAME]          cold boot the journey schedule
    python -m m3lab export --run DIR [--out DIR]   write payload/dion/ from a capture run

`export` reads the run's loaded-play image (`v6000.ram`) and its opening image
(`v5800.ram`). It writes only decoded facts and their provenance; no RAM, image
or code leaves the restricted run directory.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from . import boot
from .ram import Ram

SCHEMA_VERSION = 1
LOADED_VBL = 6000
OPENING_VBL = 5800


def source(run: Path, loaded: Ram, opening: Ram) -> dict:
    baseline = boot.BASELINE
    plan = json.loads((run / 'plan.json').read_text())
    return {
        'title': baseline['title'],
        'baseline': baseline['logicalName'],
        'programSha256': baseline['programImage']['sha256'],
        'programSize': baseline['programImage']['size'],
        'tosSha256': baseline['tosImage']['sha256'],
        'emulator': {'version': baseline['emulator']['version'],
                     'sha256': baseline['emulator']['sha256']},
        'capture': {
            'recipe': 'research/mercenary-iii-st/m3lab/boot.py',
            'schedule': plan['name'],
            'inputs': plan['inputs'],
            'loaded': {'vbl': LOADED_VBL, 'ramSha256': loaded.sha256},
            'opening': {'vbl': OPENING_VBL, 'ramSha256': opening.sha256},
        },
        'evidence': baseline['evidence'],
    }


def write(path: Path, document: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(document, indent=1, sort_keys=False) + '\n')


def export(run: Path, out: Path) -> None:
    from .world import extract_world
    loaded = Ram.load(run / f'v{LOADED_VBL}.ram')
    opening = Ram.load(run / f'v{OPENING_VBL}.ram')
    header = {'schemaVersion': SCHEMA_VERSION, 'source': source(run, loaded, opening)}
    write(out / 'world.json', {**header, 'kind': 'world', **extract_world(loaded, opening)})
    extras = [('panel', 'extract_panel', 'panel'), ('text', 'extract_messages', 'messages'),
              ('scripts', 'extract_scripts', 'scripts'), ('sound', 'extract_sound', 'sound'),
              ('service', 'extract_service', 'service')]
    for module, function, kind in extras:
        try:
            extractor = getattr(__import__(f'm3lab.{module}', fromlist=[function]), function)
        except (ImportError, AttributeError):
            continue
        write(out / f'{kind}.json', {**header, 'kind': kind, **extractor(loaded)})


def main() -> None:
    parser = argparse.ArgumentParser(prog='m3lab')
    sub = parser.add_subparsers(dest='command', required=True)
    cap = sub.add_parser('capture')
    cap.add_argument('--name', default='spaceport')
    exp = sub.add_parser('export')
    exp.add_argument('--run', type=Path, required=True)
    exp.add_argument('--out', type=Path, default=boot.REPOSITORY / 'payload' / 'dion')
    args = parser.parse_args()
    if args.command == 'capture':
        plan = boot.Plan(args.name, inputs=boot.TAXI_SPACEPORT,
                         captures=[OPENING_VBL, LOADED_VBL, 9500, 10800, 12200, 12900,
                                   13600, 15000, 17000, 19000, 22600])
        print(boot.run(plan))
    else:
        export(args.run, args.out)


if __name__ == '__main__':
    main()
