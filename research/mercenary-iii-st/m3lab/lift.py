"""Ride a METIS lift in the original and trace the Floor request, steps and arrival (#835).

`decode` reads the pinned coherent opening and checks the lift's code and constants:
the key test `$5684C..$56884`, the step `$56CF4..$56D66`, the request
`$56D66..$56D98`, the arrival `$56D98..$56E14`, the rebind `$56E14..$56ECE`, the
substep loop's gate `$5A4E2..$5A4EC` and the region scan's freeze `$5B320..$5B328`.

`live` cold-boots the pinned baseline, stands the player in the hall of the METIS
building in cell 4 (structure slot 154, Floors 0 to 9) through the game's own
object-destination path (`scene.pose_pokes`), walks them into the lift car with
the stick and then presses Floor keys at the ACIA mailbox. Breakpoints log every
write to the destination `$6F3A`, the Floor `$7158`, the eye height `$714C` and
the car door's latch, and every pass of the request, arrival, cut and key-click
sites. Runs, logs and RAM are Restricted Material under
`restricted/mercenary-iii-835/runs/`.
"""

from __future__ import annotations

import argparse
import json
import os
import re
from pathlib import Path

from . import boot
from .boot import REPOSITORY, Plan, run
from .ram import Ram
from .scene import ENTER, LOOP_CALL, pose_pokes

OPENING_SHA256 = '71b957b3b7124959b01bd40b896c921d37902c18cfca042bef1906b155ef0170'
RUNS = REPOSITORY / 'restricted' / 'mercenary-iii-835' / 'runs'

# Half-open ranges of the coherent opening, and what each holds.
SLICES = (
    (0x5684C, 0x56884, 'lift key test: on foot, no digit mode, region bit 13'),
    (0x56CF4, 0x56D66, 'step: wait for the door, count 25, move the label'),
    (0x56D66, 0x56D98, 'request: refuse the label Floor or a zero entry, pin the door'),
    (0x56D98, 0x56E14, 'arrival: palette, label, eye height, rebind, key click'),
    (0x56E14, 0x56ECE, 'entry at a Floor, and the rebind with the B/C cut'),
    (0x5A4E2, 0x5A4EC, 'substep loop: step only while a ride is pending'),
    (0x5B320, 0x5B328, 'region scan: no region is accepted during a ride'),
    (0x560F4, 0x5614C, 'cell bind: pitch $7198 and the Floor Table $72BA'),
    (0x55B6A, 0x55B9E, 'key click $4C986 on channel B'),
)

METIS = 60
# Cell 4 of the METIS group (group origin 2527, 1066), structure origin (32918, 32018).
CELL = (2531, 1066)
ORIGIN = (32918, 32018)
# The hall in front of the car, facing -Z (heading 0) toward the doorway at Z -1150.
HALL = (-160, -700)

KEY = {'1': 0x02, '2': 0x03, '3': 0x04, '0': 0x0B, 'B': 0x30, 'G': 0x22}

TRACES = (
    ('($6f3a).w ! ($6f3a).w', 'destination'),
    ('($7158).w ! ($7158).w', 'floor'),
    ('($714c).w ! ($714c).w', 'eye'),
    ('($406c).w ! ($406c).w', 'latch'),
    ('pc = $56d7e', 'admit'),
    ('pc = $56d98', 'arrive'),
    ('pc = $56e86', 'cut'),
    ('pc = $55b6a', 'click'),
    ('pc = $5ba18', 'door-moving'),
    ('pc = $5b9ca', 'door-stop'),
)
DUMP = ('m $6f3a-$6f40', 'm $7158-$715a', 'm $714a-$714e', 'm $717e-$7180',
        'm $71cc-$71ce', 'm $7188-$718a', 'm $7194-$7196', 'm $406c-$4070',
        'm $b2d0-$b2d2', 'm $7038-$7042')


def world(local: tuple[int, int]) -> tuple[int, int]:
    return (CELL[0] * 65536 + ORIGIN[0] + local[0], CELL[1] * 65536 + ORIGIN[1] + local[1])


def decode(opening: Path) -> dict:
    ram = Ram.load(opening)
    if ram.sha256 != OPENING_SHA256:
        raise SystemExit(f'{opening} is not the pinned coherent opening')
    checks = {
        'period': ram.word(0x6F3C) == 25 and ram.word(0x6F3E) == 25,
        'idle': ram.word(0x6F3A) == 0xFFFF,
        'label': ram.byte(0xB2D0) == ord('G') and ram.word(0x7158) == 0,
        'keys': ram.bytes(0x56862, 0x56884).hex() ==
            '12000c01000c6b0004fc040100210c010001670004f059010c01000b670004e66008',
        'pin': ram.bytes(0x56D8A, 0x56D96).hex() == '117c00803e1a117c00013e19',
        'rebind': ram.bytes(0x56E2C, 0x56E4A).hex() ==
            '21fc0000003f703a31fc01ff715433fc00000006ff4421fc0001ffff7142',
    }
    if not all(checks.values()):
        raise SystemExit(f'decode failed: {checks}')
    return {'opening': ram.sha256, 'checks': checks,
            'slices': [{'range': [f'${lo:05X}', f'${hi:05X}'], 'meaning': meaning,
                        'sha256': ram.digest(lo, hi)} for lo, hi, meaning in SLICES]}


def live(name: str) -> Path:
    """Walk into the car, ride G to 3, press B and 3 (both refused), then ride back to G."""
    RUNS.mkdir(parents=True, exist_ok=True)
    # Breakpoint callbacks must exist before Hatari reads the command that arms them.
    callbacks = RUNS / f'{name}-callbacks'
    callbacks.mkdir(exist_ok=True)
    commands = []
    for index, (condition, _) in enumerate(TRACES):
        (callbacks / f'trace-{index}.ini').write_text(
            '\n'.join([f'e ${0xA000 + index:x}', 'e VBL', *DUMP]) + '\n')
        commands.append(f'b {condition} :trace :quiet :file {callbacks}/trace-{index}.ini')
    x, z = world(HALL)
    inputs = [(6000, ('key', ENTER)), (6600, ('stick', 0x01)), (7000, ('stick', 0x00))]
    inputs += [(vbl, ('key', KEY[key])) for vbl, key in ((7100, '3'), (7500, 'B'), (7600, '3'), (7700, 'G'))]
    plan = Plan(name=name, inputs=inputs, captures=[7050, 7200, 7450, 7650, 8100], loop_top=True,
                pc_commands=[(6500, LOOP_CALL, [*commands, *pose_pokes(METIS, x, z, 0)])])
    run_dir = run(plan, RUNS)
    (run_dir / 'callbacks').symlink_to(callbacks)
    emulator = {**boot.BASELINE['emulator'],
                'path': os.environ.get('M3_HATARI', boot.BASELINE['emulator']['path'])}
    (run_dir / 'emulator.json').write_text(json.dumps(emulator, indent=1) + '\n')
    return run_dir


def parse(log: Path) -> list[dict]:
    """The tagged hits of a run's `hatari.log`, in order: tag, VBL and the dumped words."""
    rows: list[dict] = []
    current: dict | None = None
    for line in log.read_text(errors='replace').splitlines():
        if m := re.match(r'^= .*\$([0-9a-f]+) \(hex\)', line):
            value = int(m.group(1), 16)
            if current is None or 'vbl' in current:
                if 0xA000 <= value < 0xA000 + len(TRACES):
                    current = {'tag': TRACES[value - 0xA000][1], 'memory': {}}
                    rows.append(current)
                continue
            current['vbl'] = value
            continue
        if current is not None and (m := re.match(r'^([0-9A-F]{8}): ((?:[0-9a-f]{2} )+)', line)):
            current['memory'][int(m.group(1), 16)] = bytes.fromhex(m.group(2).replace(' ', ''))
    return rows


def summary(row: dict) -> str:
    m = row['memory']
    w = lambda a, o=0: int.from_bytes(m[a][o:o + 2], 'big')
    return (f"{row.get('vbl', '?'):>5} {row['tag']:<12} dest {w(0x6F3A):04X} count {w(0x6F3A, 4):>2} "
            f"floor {w(0x7158)} label {chr(m[0xB2D0][0])} y {w(0x714A, 2):>4} region {w(0x71CC):04X} "
            f"#{w(0x7194)} structure {w(0x7188)} door {w(0x717E):03X} latch {w(0x406C):04X}/{w(0x406C, 2):04X} "
            f"local {int.from_bytes(m[0x7038][0:2], 'big', signed=True)},"
            f"{int.from_bytes(m[0x7038][8:10], 'big', signed=True)}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest='command', required=True)
    d = sub.add_parser('decode')
    d.add_argument('opening', type=Path)
    l = sub.add_parser('live')
    l.add_argument('--name', default='lift-ride')
    # The pinned Hatari 2.6.1 build is gone from the lab machine (#835). Another build may
    # stand in only by naming its hash, which the run records; `M3_HATARI` gives its path.
    l.add_argument('--hatari-sha256', help='accept this Hatari build in place of the pinned one')
    t = sub.add_parser('trace')
    t.add_argument('run', type=Path)
    args = parser.parse_args()
    if args.command == 'live' and args.hatari_sha256:
        boot.BASELINE['emulator'] = {**boot.BASELINE['emulator'], 'sha256': args.hatari_sha256}
    if args.command == 'decode':
        print(json.dumps(decode(args.opening), indent=1))
    elif args.command == 'trace':
        for row in parse(args.run / 'hatari.log'):
            print(summary(row))
    else:
        print(live(args.name))


if __name__ == '__main__':
    main()
