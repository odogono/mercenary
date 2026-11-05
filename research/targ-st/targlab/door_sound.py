"""Log the YM2149 writes across real Doorway crossings in Hatari (#978).

Reuses the `door_crossing` cases `fz-max` (up wipe) and `bz-max` (down wipe).
Hatari's `psg_write` trace is switched on where the wipe starts (`$41AEE` or
`$41C64`) and off where it ends (`$41C5A`, `$41E0C`), so the log holds every
YM register write made while play is frozen, from any code, VBL included.
Raw output stays Restricted.

    python3 -m targlab confirm-door-sound
"""
from __future__ import annotations

import json
import os
import re
import subprocess
from pathlib import Path

from . import door_crossing
from .disk import REPOSITORY

OUT = REPOSITORY / 'restricted' / 'targ-st-door-976' / 'sound'
CASES = {'up': 'fz-max', 'down': 'bz-max'}


def scripts(directory: Path, case: str) -> None:
    door_crossing.scripts(directory, *door_crossing.CASES[case])
    mark = directory / 'mark.ini'
    mark.write_text('trace psg_write\n' + mark.read_text())
    end = directory / 'end.ini'
    end.write_text('trace none\necho wipe-end\n' + end.read_text())


WRITE = re.compile(r'^ym write data reg=0x([0-9a-f]+) val=0x([0-9a-f]+) video_cyc=(\d+) .*?pc=([0-9a-f]+)', re.I | re.M)


def writes(log: str) -> list[dict]:
    """Every traced register write as {reg, value, frame, pc}, in order.

    Hatari's trace has no VBL count; `video_cyc` restarts each frame, so a
    drop in it starts the next frame (frame 0 is the wipe's first).
    """
    found, frame, last = [], 0, -1
    for reg, value, cycle, pc in WRITE.findall(log):
        if int(cycle) < last:
            frame += 1
        last = int(cycle)
        found.append({'reg': int(reg, 16), 'value': int(value, 16), 'frame': frame, 'pc': f'${pc.upper()}'})
    return found


def confirm_door_sound() -> Path:
    OUT.mkdir(parents=True, exist_ok=True)
    env = {**os.environ, 'SDL_VIDEODRIVER': 'dummy', 'SDL_AUDIODRIVER': 'dummy'}
    running = {}
    for name, case in CASES.items():
        directory = OUT / name
        directory.mkdir(exist_ok=True)
        for old in directory.iterdir():
            old.unlink()
        scripts(directory, case)
        args = door_crossing.command(directory, None)
        (directory / 'command.json').write_text(json.dumps(args, indent=2) + '\n')
        log = (directory / 'hatari.log').open('w')
        running[name] = (subprocess.Popen(args, stdout=log, stderr=log, stdin=subprocess.DEVNULL, env=env), log)
    for process, log in running.values():
        try:
            process.wait(timeout=420)
        finally:
            if process.poll() is None:
                process.kill()
            log.close()
    report = {}
    for name in CASES:
        found = writes((OUT / name / 'hatari.log').read_text(errors='replace'))
        report[name] = found
    (OUT / 'report.json').write_text(json.dumps(report, indent=1) + '\n')
    return OUT
