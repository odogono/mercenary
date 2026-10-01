"""Cold-boot the pinned Mercenary III baseline and capture RAM at chosen VBLs.

This is the integration report's standalone recipe as a reusable tool
(docs/research/mercenary-iii-integration.md#cold-boot-and-controlled-probes).
It checks all three pins, starts Hatari headless with an empty configuration,
injects inputs at the game's recovered key mailbox `$56726` and joystick soft
copy `$7056`, and saves the whole 1 MiB of ST RAM. A capture precedes any
input on the same VBL.

Every output is Restricted Material and is written under the ignored
`restricted/` root. Nothing here reads or writes the Data Payload.
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

LAB = Path(__file__).resolve().parents[1]
REPOSITORY = LAB.parents[1]
BASELINE = json.loads((LAB / 'config' / 'baseline.json').read_text())

KEY_MAILBOX = 0x56726
STICK_COPY = 0x7056

# R1's journey schedule. Keys are ST scancodes, `stick` is the soft-copy byte.
ENTER, STAR, PLUS, BOARD, LEAVE = 0x72, 0x66, 0x4E, 0x30, 0x26
TAXI_SOLICITOR = [
    (6000, ('key', ENTER)), (7300, ('key', STAR)),
    (10000, ('stick', 0x01)), (10650, ('stick', 0x00)),
    (10700, ('key', BOARD)), (11600, ('key', PLUS)),
    (12200, ('key', STAR)), (22000, ('key', LEAVE)),
]
TAXI_SPACEPORT = sorted(TAXI_SOLICITOR + [(11900, ('key', PLUS))])


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def rom_root() -> Path:
    configured = os.environ.get('M3_ROM_ROOT')
    if configured:
        return Path(configured).resolve()
    for candidate in (REPOSITORY / 'roms', Path('/Users/alex/work/mercenary/roms')):
        if (candidate / BASELINE['programImage']['relativePath']).exists():
            return candidate
    raise SystemExit('Set M3_ROM_ROOT to a directory holding atarist/Mercenary III.STX')


def pinned_inputs() -> dict[str, Path]:
    roms = rom_root()
    disk = roms / BASELINE['programImage']['relativePath']
    tos = roms / BASELINE['tosImage']['relativePath']
    hatari = Path(os.environ.get('M3_HATARI', BASELINE['emulator']['path']))
    for path, digest in ((disk, BASELINE['programImage']['sha256']),
                         (tos, BASELINE['tosImage']['sha256']),
                         (hatari, BASELINE['emulator']['sha256'])):
        if sha256(path) != digest:
            raise SystemExit(f'{path} does not match its pinned SHA-256')
    return {'disk': disk, 'tos': tos, 'hatari': hatari}


@dataclass
class Plan:
    """What one cold boot does: inputs by VBL, RAM captures by VBL, then quit."""
    name: str
    inputs: list[tuple[int, tuple[str, int]]] = field(default_factory=list)
    captures: list[int] = field(default_factory=list)
    screenshots: bool = True
    pal: bool = False
    # Capture at the first main-loop top (`$5A41A`) at or after each capture VBL,
    # where the displayed screen is the frame drawn from the pose RAM then holds.
    loop_top: bool = False

    def end(self) -> int:
        return max([v for v, _ in self.inputs] + self.captures) + 1


def run(plan: Plan, root: Path | None = None, timeout: int = 900) -> Path:
    pins = pinned_inputs()
    base = root or (REPOSITORY / 'restricted' / 'mercenary-iii-647' / 'runs')
    base.mkdir(parents=True, exist_ok=True)
    run_dir = Path(tempfile.mkdtemp(prefix=f'{plan.name}-', dir=base))

    steps: dict[int, list[str]] = {}
    for vbl in plan.captures:
        lines = steps.setdefault(vbl, [])
        if plan.loop_top:
            lines.append(f'b pc = $5a41a :trace :once :quiet :file {run_dir}/top-{vbl}.ini')
            (run_dir / f'top-{vbl}.ini').write_text(
                f'savebin {run_dir}/v{vbl}.ram 0 $100000\n'
                + (f'screenshot {run_dir}/v{vbl}.png\n' if plan.screenshots else ''))
            continue
        lines.append(f'savebin {run_dir}/v{vbl}.ram 0 $100000')
        if plan.screenshots:
            lines.append(f'screenshot {run_dir}/v{vbl}.png')
    for vbl, (kind, value) in plan.inputs:
        address = KEY_MAILBOX if kind == 'key' else STICK_COPY
        steps.setdefault(vbl, []).append(f'w ${address:x} ${value:02x}')
    if plan.pal:
        steps.setdefault(10, []).insert(0, 'w $ff820a $02')
    ordered = sorted(steps)

    def script(name: str, lines: list[str]) -> Path:
        path = run_dir / f'{name}.ini'
        path.write_text('\n'.join(lines) + '\n')
        return path

    def bp(vbl: int, name: str) -> str:
        return f'b VBL = {vbl} :trace :once :quiet :file {run_dir}/{name}.ini'

    for index, vbl in enumerate(ordered):
        tail = ([bp(ordered[index + 1], f'step-{index + 1}')]
                if index + 1 < len(ordered) else ['quit'])
        script(f'step-{index}', steps[vbl] + tail)
    boot = script('boot', [bp(ordered[0], 'step-0'), 'c'])
    config = run_dir / 'empty.cfg'
    config.write_text('')
    args = [str(pins['hatari']), '--configfile', str(config), '--tos', str(pins['tos']),
            '--machine', 'st', '--memsize', '1', '--cpulevel', '0', '--cpuclock', '8',
            '--compatible', 'true', '--cpu-exact', 'true', '--addr24', 'true',
            '--fpu', 'none', '--blitter', 'false', '--monitor', 'rgb',
            '--video-timing', 'ws3', '--timer-d', 'false', '--fast-boot', 'false',
            '--fastfdc', 'false', '--disk-a', str(pins['disk']), '--disk-b', 'none',
            '--drive-b', 'false', '--protect-floppy', 'on', '--sound', 'off',
            '--statusbar', 'false', '--drive-led', 'false', '--crop', 'true',
            '--screenshot-format', 'png', '--fast-forward', 'true',
            '--confirm-quit', 'false', '--alert-level', 'fatal', '--log-level', 'warn',
            '--parse', str(boot)]
    (run_dir / 'command.json').write_text(json.dumps(args, indent=2) + '\n')
    (run_dir / 'plan.json').write_text(json.dumps({
        'name': plan.name, 'inputs': plan.inputs, 'captures': plan.captures,
        'pal': plan.pal}, indent=2) + '\n')
    with (run_dir / 'hatari.log').open('w') as log:
        subprocess.run(args, stdout=log, stderr=log, check=True, timeout=timeout,
                       stdin=subprocess.DEVNULL,
                       env={**os.environ, 'SDL_VIDEODRIVER': 'dummy',
                            'SDL_AUDIODRIVER': 'dummy'})
    return run_dir
