"""Stand at an exact surface pose anywhere on Dion and capture the original's frame.

A scene comparison (#682, #686) needs the original drawing a chosen place. This
uses the game's own object-destination path, `$5A006..$5A15A`, which copies a
resident's position and Floor to the player, runs Body setup and rebuilds the
workspace. Resident slot 9 is NULL-model and out of world in a fresh game, so it
is rewritten to the pose and reached; nothing else in the session is altered.
The jump is made at the main loop's call of `$5A01A`, so the routine's final
return lands back in the loop. Captures are Restricted Material.

`scene_document` then writes the occupied cell as a world document the browser
planner reads (`web/tools/dion-scene.ts`), with the captured frame state.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from .boot import REPOSITORY, Plan, run
from .ram import Ram
from .world import extract_world

POSE_SLOT = 9
LOOP_CALL = 0x5A01A
DESTINATION = 0x5A006
ENTER = 0x72


def poke(address: int, value: int, size: int) -> str:
    data = (value & ((1 << (8 * size)) - 1)).to_bytes(size, 'big')
    return f'w ${address:x} ' + ' '.join(f'${b:02x}' for b in data)


def pose_pokes(body: int, x: int, z: int, heading: int, y: int = 0) -> list[str]:
    a = 4 * POSE_SLOT
    return [poke(0x581C + a, x, 4), poke(0x5C1C + a, y, 4), poke(0x601C + a, z, 4),
            poke(0x681C + a, body, 1), poke(0x681D + a, 0, 1), poke(0x681E + a, 0, 1),
            poke(0x7156, heading, 2), f'r d0=${a:x}', f'r pc=${DESTINATION:x}']


def capture_scene(name: str, body: int, x: int, z: int, heading: int, *,
                  before: tuple[str, ...] = (), root: Path | None = None) -> Path:
    """Cold boot, enter play, stand at the pose at VBL 6500, capture at VBL 7000.

    `before` holds debugger writes made just before the jump, such as emptying the
    initial overlay list at `$57DA` to stand in the constructed LOGOS state.
    """
    plan = Plan(name=name, inputs=[(6000, ('key', ENTER))], captures=[7000], loop_top=True,
                pc_commands=[(6500, LOOP_CALL, [*before, *pose_pokes(body, x, z, heading)])])
    return run(plan, root or REPOSITORY / 'restricted' / 'mercenary-iii-682' / 'runs')


def scene_document(ram: Ram, png: Path) -> dict:
    """The occupied cell as a planner world document, plus the frame state it holds."""
    cell = ram.word(0x71F4)
    document = extract_world(ram, ram, route=[(cell & 15, cell >> 4)], pinned=False)
    document['scene'] = {
        'cell': cell, 'group': ram.word(0x6FDE), 'body': ram.long(0x715A),
        'eye': [ram.slong(0x7146), ram.slong(0x714A), ram.slong(0x714E)],
        'heading': ram.word(0x7136), 'pitch': ram.word(0x7154), 'roll': ram.word(0x7152),
        'region': ram.word(0x7194), 'frameCounter': ram.word(0x7180),
        'signCode': ram.byte(0xB3F2), 'skyDay': ram.word(0x6FD6), 'skyNight': ram.word(0x6FD8),
        'screenshot': str(png),
    }
    return document


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('name')
    parser.add_argument('body', type=int, help='Body offset, 0..120')
    parser.add_argument('x', type=int)
    parser.add_argument('z', type=int)
    parser.add_argument('heading', type=int, help='1024ths of a turn; 0 faces -Z')
    parser.add_argument('--before', action='append', default=[])
    args = parser.parse_args()
    run_dir = capture_scene(args.name, args.body, args.x, args.z, args.heading,
                            before=tuple(args.before))
    document = scene_document(Ram.load(run_dir / 'v7000.ram'), run_dir / 'v7000.png')
    (run_dir / 'scene.json').write_text(json.dumps(document))
    print(run_dir / 'scene.json')


if __name__ == '__main__':
    main()
