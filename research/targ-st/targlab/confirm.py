"""Confirm in Hatari that ESCAPE.PRG shows E0 as its title screen.

The disk does not autoboot: EmuTOS reaches the GEM desktop. Hatari's `--auto`
starts `A:\\ESCAPE.PRG` instead. At VBL 750 the loader has drawn the title and
is reading the game files, and the screen at `$78000` must equal E0's pixels.
Later VBLs show the star field and the ST Benson panel.

Uses the Mercenary III laboratory's machine settings and pins (EmuTOS 2.06,
Hatari 2.6.1). RAM and screenshots are Restricted Material and stay under
`restricted/targ-st/`.
"""

from __future__ import annotations

import hashlib
import os
import subprocess
import tempfile
from pathlib import Path

from .disk import BASELINE, REPOSITORY, disk_path, pinned_floppy
from .title import HEADER, PICTURE

TITLE_VBL = 750
SCREEN = 0x78000


def pinned(entry: dict, path: Path) -> Path:
    if hashlib.sha256(path.read_bytes()).hexdigest() != entry['sha256']:
        raise SystemExit(f'{path} does not match its pinned SHA-256')
    return path


def machine_args(run: Path) -> list[str]:
    """Pinned machine for title and panel presentation comparisons."""
    pins = BASELINE['confirmation']
    disk = disk_path()
    tos = pinned(pins['tosImage'], disk.parents[1] / pins['tosImage']['relativePath'])
    hatari = pinned(pins['emulator'], Path(os.environ.get('TARG_HATARI', pins['emulator']['path'])))
    return [str(hatari), '--configfile', str(run / 'empty.cfg'), '--tos', str(tos),
            '--machine', 'st', '--memsize', '1', '--cpulevel', '0', '--cpuclock', '8',
            '--compatible', 'true', '--cpu-exact', 'true', '--addr24', 'true',
            '--fpu', 'none', '--blitter', 'false', '--monitor', 'rgb',
            '--video-timing', 'ws3', '--timer-d', 'false', '--fast-boot', 'false',
            '--fastfdc', 'false', '--disk-a', str(disk), '--disk-b', 'none',
            '--drive-b', 'false', '--protect-floppy', 'on', '--sound', 'off',
            '--statusbar', 'false', '--drive-led', 'false', '--crop', 'true',
            '--screenshot-format', 'png', '--fast-forward', 'true',
            '--confirm-quit', 'false', '--alert-level', 'fatal', '--log-level', 'warn',
            '--auto', 'A:\\ESCAPE.PRG', '--parse', str(run / 'boot.ini')]


def confirm() -> Path:
    base = REPOSITORY / 'restricted' / 'targ-st'
    base.mkdir(parents=True, exist_ok=True)
    run = Path(tempfile.mkdtemp(prefix='confirm-', dir=base))
    (run / 'title.ini').write_text(f'savebin {run}/title.ram 0 $100000\n'
                                   f'screenshot {run}/title.png\nquit\n')
    (run / 'boot.ini').write_text(
        f'b VBL = {TITLE_VBL} :trace :once :quiet :file {run}/title.ini\nc\n')
    (run / 'empty.cfg').write_text('')
    args = machine_args(run)
    with (run / 'hatari.log').open('w') as log:
        subprocess.run(args, stdout=log, stderr=log, check=True, timeout=300,
                       stdin=subprocess.DEVNULL,
                       env={**os.environ, 'SDL_VIDEODRIVER': 'dummy',
                            'SDL_AUDIODRIVER': 'dummy'})
    ram = (run / 'title.ram').read_bytes()
    pixels = pinned_floppy().read(PICTURE)[HEADER:]
    if ram[SCREEN:SCREEN + len(pixels)] != pixels:
        raise SystemExit(f'the screen at ${SCREEN:X} is not {PICTURE} at VBL {TITLE_VBL}: {run}')
    return run
