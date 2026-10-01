"""The #681 original-scene comparisons: object models drawn by the original game.

Each scene stands at the #682 empty-structure pose (`placement-02-04`, slot 100,
road join only) and moves one object slot in front of the eye before the jump to
`$5A006`, so the original's own reader draws it there. The slot is made a surface
resident of that Body (association and Floor 0), which puts it on the drawn list
the path rebuilds. A form other than the opening one is selected the way the game
selects it: a model-table word copied from the entry a writer names, the safe's
`$70F6`, or the viewer's position against a form's box. Articulated models are
held at rest by stopping their angle (`$6FD4` and `$6F36` zero).

`web/tools/dion-scene.ts` then draws the captured state with the browser planner
and reports agreement over the whole frame and over the object's footprint.
Results stay under `restricted/`.

    python3 -m m3lab.object_scenes [name ...]
"""

from __future__ import annotations

import argparse
import json
import subprocess

from .boot import REPOSITORY
from .catalogue_ledger import load_ledger
from .geometry import MODEL_TABLE_POINTER, decode_model, model_record
from .ram import Ram
from .scene import capture_scene, poke, scene_document
from .surface_scenes import scene_pose

RESULTS = REPOSITORY / 'restricted' / 'mercenary-iii-681'
STAGE = 'placement-02-04'

# (name, slot, variant, options): `distance` ahead of the eye, `lateral` to its right,
# `entry` to rebind the slot's model-table word, `pokes` for further state.
SCENES = [
    ('armchair', 44, 'form=default', {'distance': 240}),
    ('sights-lines', 47, 'form=default', {'distance': 360}),
    ('news-stand-literal', 134, 'form=default', {'distance': 200}),
    ('dodge-yaw', 2, 'form=default', {'distance': 900, 'yaw': 32}),
    ('canine-articulated', 45, 'form=default', {'distance': 220, 'rest': True}),
    ('processors-desk', 42, 'form=default', {'distance': 300}),
    ('executive-desk', 196, 'form=default', {'distance': 300}),
    ('black-beacon', 164, 'state=lamp-lit;form=default', {'distance': 260}),
    ('door-key-b', 31, 'form=default', {'distance': 160}),
    ('key-dodge', 180, 'form=default', {'distance': 150}),
    ('safe-intact', 102, 'state=intact;form=default', {'distance': 300}),
    ('safe-blown', 102, 'state=blown;form=default', {'distance': 300,
                                                     'pokes': ('w $70f6 $ff $ff',)}),
    ('transporter-outside', 64, 'form=default', {'distance': 300}),
    ('tourcraft-ground', 13, 'form=view-1', {'distance': 3000}),
    ('tourcraft-spaceport', 13, 'form=view-1', {'distance': 3000, 'inPlace': True}),
    ('explosive-armed', 75, 'form=default', {'distance': 200, 'entry': 257}),
    ('bils-chair', 97, 'form=default', {'distance': 220, 'entry': 316}),
    # A head is drawn below the passenger's eye (Y −50..3); lift it into view.
    ('driver-head', 44, 'form=default', {'distance': 260, 'entry': 263, 'height': 50}),
]


def object_pokes(slot: int, body: int, position: tuple[int, int, int], yaw: int) -> list[str]:
    """Make the slot a surface resident of the Body at the position (`$581C..$6C1C`)."""
    a = 4 * slot
    x, y, z = position
    return [poke(0x581C + a, x, 4), poke(0x5C1C + a, y, 4), poke(0x601C + a, z, 4),
            poke(0x681C + a, body, 1), poke(0x681D + a, 0, 1), poke(0x681E + a, 0, 1),
            poke(0x6C1C + a, yaw, 1)]


def run_scenes(names: set[str]) -> dict:
    ledger = load_ledger()
    opening = Ram.load(REPOSITORY / 'restricted' / 'mercenary-iii-647' / 'runs'
                       / 'location-census-334983y7' / 'start.ram')
    table = opening.long(MODEL_TABLE_POINTER)
    objects = {o['slot']: o for o in ledger['objects']}
    results = {}
    for name, slot, variant, options in SCENES:
        if names and name not in names:
            continue
        if objects[slot]['residence'] == 'carried':
            raise ValueError(f'{name}: slot {slot} is carried; its storage position is not a pose')
        before = list(options.get('pokes', ()))
        if options.get('inPlace'):
            # Stand south of the object where the opening leaves it; move nothing.
            o = objects[slot]
            body = int(o['body'].split('-')[1]) * 4
            x, _, z = o['position']
            z += options['distance']
            heading = 0
        else:
            body, x, z, heading = scene_pose(ledger, STAGE)
            ahead = (x + options.get('lateral', 0), options.get('height', 0),
                     z - options['distance'])
        if 'entry' in options:
            # A model-table word copied from another entry, as the run-time writers do.
            before.append(poke(table + 2 * slot, opening.word(table + 2 * options['entry']), 2))
        if options.get('rest'):
            before += ['w $6fd4 $00 $00', 'w $6f36 $00 $00']
        if not options.get('inPlace'):
            before += object_pokes(slot, body, ahead, options.get('yaw', 0))
        run_dir = capture_scene(f'object-{name}', body, x, z, heading, before=tuple(before),
                                root=RESULTS / 'runs')
        ram = Ram.load(run_dir / 'v7000.ram')
        document = scene_document(ram, run_dir / 'v7000.png')
        document['scene']['object'] = slot
        # The screenshot is the frame before the loop top (#647): lamps blink by `$7180`.
        document['scene']['frameCounter'] = (document['scene']['frameCounter'] - 1) & 0xFFFF
        (run_dir / 'scene.json').write_text(json.dumps(document))
        compared = subprocess.run(['bun', 'tools/dion-scene.ts', str(run_dir / 'scene.json')],
                                  cwd=REPOSITORY / 'web', check=True, capture_output=True,
                                  text=True).stdout
        geometry = f'model-{model_record(ram, slot):06x}'
        drawn = decode_model(ram, slot)
        results[name] = {'object': slot, 'geometry': geometry, 'variant': variant,
                         'run': run_dir.name, 'record': drawn['provenance'],
                         **json.loads(compared)}
        print(f"{name}: {results[name]['objectAgreement']:.2%} of {results[name]['objectPixels']} "
              f"object pixels, {results[name]['agreement']:.2%} of the frame ({run_dir.name})")
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('names', nargs='*')
    args = parser.parse_args()
    RESULTS.mkdir(parents=True, exist_ok=True)
    results = run_scenes(set(args.names))
    out = RESULTS / 'objects.scenes.json'
    previous = json.loads(out.read_text()) if out.exists() else {}
    out.write_text(json.dumps({**previous, **results}, indent=1, sort_keys=True) + '\n')


if __name__ == '__main__':
    main()
