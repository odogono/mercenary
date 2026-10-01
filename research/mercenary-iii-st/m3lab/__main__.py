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
# The game entry (`$6AC32`), where the panel artwork DAM6 has just been loaded and
# no readout has yet been drawn over it.
ENTRY = (3990, 0x6AC32, 'entry')
# A fresh game: the first main-loop top once the prison cell is bound and the
# opening script `$19` has started (`$59FBA`, about VBL 4734 at 60 Hz).
START = (4770, 0x5A41A, 'start')


def camel(value):
    """Document keys in the payload's camelCase; addresses and tokens are kept."""
    if isinstance(value, dict):
        out = {}
        for key, item in value.items():
            if isinstance(key, str) and '_' in key and key[:1].isalpha() and key == key.lower():
                head, *rest = key.split('_')
                key = head + ''.join(part[:1].upper() + part[1:] for part in rest)
            out[key] = camel(item)
        return out
    if isinstance(value, list):
        return [camel(item) for item in value]
    return value


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
            'opening': {'pc': f'${START[1]:05X}', 'armedAtVbl': START[0],
                        'ramSha256': opening.sha256},
        },
        'evidence': baseline['evidence'],
    }


def write(path: Path, document: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(document, indent=1, sort_keys=False) + '\n')


def export(run: Path, out: Path) -> None:
    from .panel import extract_panel
    from .scripts import extract_scripts
    from .service import extract_service
    from .sound import extract_sound
    from .sky import extract_sky
    from .text import extract_messages
    from .world import extract_world
    loaded = Ram.load(run / f'v{LOADED_VBL}.ram')
    opening = Ram.load(run / f'{START[2]}.ram')
    entry = Ram.load(run / f'{ENTRY[2]}.ram')
    header = {'schemaVersion': SCHEMA_VERSION, 'source': source(run, loaded, opening)}
    header['source']['capture']['entry'] = {'pc': f'${ENTRY[1]:05X}', 'ramSha256': entry.sha256}
    documents = {
        'world': {**extract_world(loaded, opening), 'sky': extract_sky(loaded, opening)},
        'panel': extract_panel(loaded, entry),
        'messages': extract_messages(loaded),
        'scripts': extract_scripts(loaded),
        'sound': extract_sound(loaded),
        'service': extract_service(opening),
    }
    for kind, body in documents.items():
        body = {key: item for key, item in body.items() if key not in ('title',)}
        write(out / f'{kind}.json', {**header, 'kind': kind, **camel(body)})


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
                         captures=[5800, LOADED_VBL, 9500, 10800, 12200, 12900,
                                   13600, 15000, 17000, 19000, 22600],
                         pc_captures=[ENTRY, START])
        print(boot.run(plan))
    else:
        export(args.run, args.out)


if __name__ == '__main__':
    main()
