"""Drive the Doorway wipe (#976) in Hatari with controlled state; RAM stays Restricted.

The probe does not walk to a Doorway. At VBL 6000 (on foot, outdoors, as in
the #743 capture) it breaks on the frame flip `$48B10`, pokes the Doorway flag
`$62448` and a new Room palette into `$62438..$6243F`, and lets the native
flip run the wipe. Breakpoints after each `Vsync` inside the wipe loops log
`d0` and the split word `$624E4`, and screenshots sample the split. A traced
breakpoint on the main loop's return from the flip (`$48ABA`) shows whether
the loop runs while the wipe does: it first returns after the wipe and hold.

    python3 -m targlab confirm-door
"""
from __future__ import annotations

import json
import os
import re
import subprocess
from pathlib import Path

from .confirm import machine_args
from .disk import REPOSITORY, sha256

OUT = REPOSITORY / 'restricted' / 'targ-st-door-976'
FLIP, AFTER_FLIP = 0x48B10, 0x48ABA
NEW_PALETTE = (0x0777, 0x0357, 0x0077, 0x0000)  # entries 8..11; 10 is the Room's fill
PROBES = {
    # name: (flag byte, Vsync return in the loop, d0 values to sample, loop exit)
    'up': (0x7F, 0x41B9C, (0x84, 0x64, 0x44, 0x24, 0x04), 0x41BA6),
    'down': (0xFF, 0x41DA8, (0x02, 0x22, 0x42, 0x62, 0x82), 0x41DB2),
}


def words(address: int, values) -> str:
    data = b''.join(v.to_bytes(2, 'big') for v in values)
    return f'w ${address:x} ' + ' '.join(f'${b:02x}' for b in data) + '\n'


def scripts(directory: Path, flag: int, vsync: int, samples, exit_pc: int) -> None:
    def ini(name: str, text: str) -> Path:
        path = directory / name
        path.write_text(text)
        return path

    shots = ''.join(
        f'b pc = ${vsync:x} && d0 & $ffff = ${value:x} :once :quiet :file '
        f'{ini(f"shot-{value:02x}.ini", f"screenshot {directory}/split-{value:02x}.png\nm $624e4 2\nc\n")}\n'
        for value in samples)
    done = ini('done.ini', f'savebin {directory}/after.ram 0 $100000\n'
                           f'screenshot {directory}/after.png\nc\n')
    back = ini('back.ini', f'screenshot {directory}/back.png\nquit\n')
    poke = ini('poke.ini',
               f'savebin {directory}/before.ram 0 $100000\n'
               f'w $62448 ${flag:02x}\n' + words(0x62438, NEW_PALETTE) +
               f'b pc = ${vsync:x} :trace\n'
               + shots + f'b pc = ${exit_pc:x} :once :file {done}\n'
               f'b pc = ${AFTER_FLIP:x} :once :file {back}\nc\n')
    arm = ini('arm.ini', f'b pc = ${FLIP:x} :once :quiet :file {poke}\nc\n')
    ini('boot.ini', f'b VBL = 6000 :trace :once :quiet :file {arm}\nc\n')
    ini('empty.cfg', '')


def confirm_door() -> Path:
    OUT.mkdir(parents=True, exist_ok=True)
    report = {'emulatorSha256': sha256(Path(machine_args(OUT, rebuilt=True)[0]).read_bytes()),
              'qualification': 'Controlled flag and palette pokes into the native flip; '
                               'not a natural Doorway crossing.', 'probes': {}}
    for name, (flag, vsync, samples, exit_pc) in PROBES.items():
        directory = OUT / name
        directory.mkdir(exist_ok=True)
        scripts(directory, flag, vsync, samples, exit_pc)
        # Fast-forward skips rendered frames, so a screenshot can show a stale
        # split; render every frame instead.
        args = [a if a != 'true' or prev != '--fast-forward' else 'false'
                for prev, a in zip([''] + machine_args(directory, rebuilt=True),
                                   machine_args(directory, rebuilt=True))]
        args[1:1] = ['--frameskips', '0']
        (directory / 'command.json').write_text(json.dumps(args, indent=2) + '\n')
        with (directory / 'hatari.log').open('w') as log:
            subprocess.run(args, stdout=log, stderr=log, check=True, timeout=300,
                           stdin=subprocess.DEVNULL,
                           env={**os.environ, 'SDL_VIDEODRIVER': 'dummy', 'SDL_AUDIODRIVER': 'dummy'})
        log = (directory / 'hatari.log').read_text(errors='replace')
        stops = [(int(pc, 16), int(vbl)) for pc, vbl in re.findall(r'CPU=\$([0-9a-f]+), VBL=(\d+)', log)]
        report['probes'][name] = {
            'flag': flag,
            'vsyncReturns': max(int(n) for n in re.findall(r'matched (\d+) times', log)),
            'stops': [{'pc': f'${pc:X}', 'vbl': vbl} for pc, vbl in stops],
            'captures': {p.name: sha256(p.read_bytes()) for p in sorted(directory.glob('*.ram'))},
        }
    (OUT / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
    return OUT
