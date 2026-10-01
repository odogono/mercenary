"""The #682 original-scene comparisons: representative surface scenes and coasts.

Each scene stands at a pose derived from the coverage ledger (`m3lab.scene`), and
`web/tools/dion-scene.ts` compares the original's frame with the browser planner
drawing the same captured state. Each Land/Sea probe walks the original through
points around an island and compares its answer `$6F56` with `land_sea` over the
island record the game selected (`$6F44`). Results stay under `restricted/`.

    python3 -m m3lab.surface_scenes scenes [name ...]
    python3 -m m3lab.surface_scenes coasts
"""

from __future__ import annotations

import argparse
import json
import subprocess

from .boot import REPOSITORY, Plan, run
from .catalogue_ledger import load_ledger
from .geometry import decode_island, land_sea
from .ram import Ram
from .scene import ENTER, LOOP_CALL, capture_scene, pose_pokes, scene_document

RESULTS = REPOSITORY / 'restricted' / 'mercenary-iii-682'

# (name, binding, options): stand `back` units south of the structure, facing -Z,
# unless a local cell or heading says otherwise. Chosen for #682's acceptance:
# aliases (plain and mirrored), empty structures, road joins and templates,
# placement-bound lettering, the two special layouts, and coasts.
SCENES = [
    ('companies-house', 'placement-02-03', {}),
    ('connection-mirrored', 'placement-02-23', {}),
    ('olearys-farm', 'placement-02-25', {}),
    ('empty-slot-100', 'placement-02-04', {}),
    ('connection-lettered', 'placement-02-29', {}),
    ('charlenes-disco', 'placement-08-36', {'back': 4000}),
    ('midas-field-far', 'placement-56-00', {'local': (393, 2694)}),
    ('logos-initial', 'placement-08-32', {}),
    ('logos-constructed', 'placement-08-32', {'before': ('w $57da $00',)}),
    ('vulcan-island', 'placement-14-88', {}),
    ('dion-coast', 'placement-02-03', {'local': (5, -22), 'back': 0, 'heading': 512}),
    ('lachesis-strip', 'placement-52-11', {'local': (-6, 0), 'back': 0, 'heading': 256}),
]

# (name, Body offset, island origin, points in cells from that origin).
COASTS = [
    ('birmingham-island', 16, (3252, 1314),
     [(0.5, 0.5), (8, 8), (-10, 0.5), (-20, 5), (-25, -10), (-27, 0), (10, -15), (10, -17),
      (30, -5), (39, 10), (41, 10), (20, 25), (5, 31), (5, 33), (-15, 20), (0, -30),
      (-26, 0), (-25.9, 0), (0, -16), (0, -15.9)]),
    ('key-west', 44, (2560, 3584),
     [(0.5, 0.5), (-31, 0), (-20, -50), (-10, -59), (10, -40), (30, -20), (47, 0), (40, 40),
      (20, 47), (0, 47), (-20, 30), (-30, 40), (30, 30), (25, -55), (-5, -30), (15, 10)]),
]


def scene_pose(ledger: dict, binding: str, back: int = 2500, heading: int = 0,
               local: tuple[int, int] | None = None) -> tuple[int, int, int, int]:
    b = next(item for item in ledger['bindings'] if item['id'] == binding)
    body, origin = next((body['offset'], island['origin']) for body in ledger['bodies']
                        for island in body['islands'] if island['group'] == b['group'])
    x, z = local if local else (b['cell'] & 15, b['cell'] >> 4)
    bx, bz = (origin[0] + x) % 4096, (origin[1] + z) % 4096
    return (body, bx * 65536 + 32768 + b['dx'] * 30,
            bz * 65536 + 32768 + b['dz'] * 30 + back, heading)


def run_scenes(names: set[str]) -> dict:
    ledger = load_ledger()
    results = {}
    for name, binding, options in SCENES:
        if names and name not in names:
            continue
        options = dict(options)
        before = options.pop('before', ())
        body, x, z, heading = scene_pose(ledger, binding, **options)
        run_dir = capture_scene(name, body, x, z, heading, before=before)
        document = scene_document(Ram.load(run_dir / 'v7000.ram'), run_dir / 'v7000.png')
        (run_dir / 'scene.json').write_text(json.dumps(document))
        compared = subprocess.run(['bun', 'tools/dion-scene.ts', str(run_dir / 'scene.json')],
                                  cwd=REPOSITORY / 'web', check=True, capture_output=True,
                                  text=True).stdout
        results[name] = {'binding': binding, 'run': run_dir.name, **json.loads(compared)}
        print(f"{name}: {results[name]['agreement']:.2%} ({binding}, {run_dir.name})")
    return results


def run_coast(name: str, body: int, origin: tuple[int, int], points: list) -> dict:
    commands, captures = [], []
    for index, (x, z) in enumerate(points):
        vbl = 6500 + 150 * index
        px = round((origin[0] + x) * 65536) % (4096 * 65536)
        pz = round((origin[1] + z) * 65536) % (4096 * 65536)
        commands.append((vbl, LOOP_CALL, pose_pokes(body, px, pz, 0)))
        captures.append(vbl + 100)
    plan = Plan(name=f'coast-{name}', inputs=[(6000, ('key', ENTER))], captures=captures,
                loop_top=True, screenshots=False, pc_commands=commands)
    run_dir = run(plan, RESULTS / 'runs')
    rows = []
    for (x, z), vbl in zip(points, captures):
        ram = Ram.load(run_dir / f'v{vbl}.ram')
        selected = ram.long(0x6F44)
        island = decode_island(ram, selected + ram.sword(selected + 4))
        relative = [ram.slong(0x70C2) / 65536, ram.slong(0x70CA) / 65536]
        rows.append({'point': [x, z], 'relative': relative, 'descriptor': f'${selected:05X}',
                     'original': ram.sword(0x6F56), 'decoded': land_sea(island, *relative)})
    agree = sum(r['original'] == r['decoded'] for r in rows)
    print(f'{name}: {agree}/{len(rows)} Land/Sea answers agree ({run_dir.name})')
    return {'run': run_dir.name, 'rows': rows, 'agree': agree}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('what', choices=('scenes', 'coasts'))
    parser.add_argument('names', nargs='*')
    args = parser.parse_args()
    RESULTS.mkdir(parents=True, exist_ok=True)
    if args.what == 'scenes':
        results = run_scenes(set(args.names))
    else:
        results = {name: run_coast(name, body, origin, points)
                   for name, body, origin, points in COASTS
                   if not args.names or name in args.names}
    out = RESULTS / f'{args.what}.json'
    previous = json.loads(out.read_text()) if out.exists() else {}
    out.write_text(json.dumps({**previous, **results}, indent=1) + '\n')


if __name__ == '__main__':
    main()
