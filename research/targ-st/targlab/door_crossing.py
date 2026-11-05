"""Cross real Doorways underground in Hatari (#976); RAM and screenshots stay Restricted.

Each case boots to VBL 6000 (on foot, outdoors), then sends the player down a
lift by jumping to `$47F92` with `d0` = the Room (the lift test `$47F30` is
skipped, so no key or pad position is needed). The native descent enters the
Room through `$48140` and `$44B5A`. After 200 main-loop passes the probe
places the player near a Doorway, sets a heading and holds the stick byte
`$623B4` (bit 0 forward, bit 1 back: the probe writes the byte the IKBD
joystick vector `$40F2E` would). From there the game walks, clamps at the wall,
runs the Doorway test and changes Room by itself.

Breakpoints log the trigger `$45078` (with `d7`, the flag), the Room change
`$44B5A`, which wipe runs (`$41AEE` up, `$41C64` down), its end (`$41C5A`,
`$41E0C`), `$44B94` and the dark-Room branch `$44D80`. The `keys-*` cases also
send 'A' keypresses through Hatari's command FIFO once the wipe has started,
and log every key the game reads at `$45344`.

Hatari 2.6.1 keeps at most 16 breakpoints; more corrupt the table, so each
case stays under that.

    python3 -m targlab confirm-door-crossing
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import threading
import time
from pathlib import Path

from .confirm import machine_args
from .disk import REPOSITORY, sha256

OUT = REPOSITORY / 'restricted' / 'targ-st-door-976' / 'crossing'
KBD_IOREC = 0x30D4  # EmuTOS's keyboard iorec in this machine: buffer $2F54, 256 bytes
# name: (Room, x, z, heading, stick byte, keypresses during the wipe)
CASES = {
    'fz-max': (1, 0x0B60, 0x0F00, 0x200, 0x01, 0),  # forward through the south wall
    'bz-max': (1, 0x0B60, 0x0F00, 0x000, 0x02, 0),  # backing through it
    'fx-max': (1, 0x0F00, 0x0C80, 0x300, 0x01, 0),  # forward through the east wall
    'bx-max': (1, 0x0F00, 0x0C80, 0x100, 0x02, 0),
    'fz-min': (1, 0x0560, 0x0100, 0x000, 0x01, 0),  # forward through the north wall
    'bz-min': (1, 0x0560, 0x0100, 0x200, 0x02, 0),
    'dark': (5, 0x0F00, 0x0C80, 0x300, 0x01, 0),    # a dark Room into a dark Room
    'exit': (0xAB, 0x0100, 0x0680, 0x100, 0x01, 0),  # a Doorway to Room 0, the surface
    'keys-up': (1, 0x0B60, 0x0F00, 0x200, 0x01, 4),
    'keys-down': (1, 0x0B60, 0x0F00, 0x000, 0x02, 6),
}
STATE = ['m $62452 2', 'm $623a8 2', 'm $623b0 2', 'm $6234c 2', 'm $623b4 1']


def chain(directory: Path, always: str, steps: list[tuple[str, list[str]]]) -> None:
    """boot.ini sets `always` and arms step 0; each step's file arms the next."""
    names = [directory / f's{i:02d}.ini' for i in range(len(steps))]
    (directory / 'boot.ini').write_text(always + f'b {steps[0][0]} :file {names[0]}\nc\n')
    for i, (_, commands) in enumerate(steps):
        text = ''.join(c + '\n' for c in commands)
        if i + 1 < len(steps):
            text += f'b {steps[i + 1][0]} :file {names[i + 1]}\n'
        names[i].write_text(text + ('' if commands[-1:] == ['quit'] else 'c\n'))


def scripts(directory: Path, room: int, x: int, z: int, heading: int, stick: int, keys: int) -> None:
    def word(v: int) -> str:
        return f'${v >> 8:02x} ${v & 0xff:02x}'

    (directory / 'mid.ini').write_text(f'screenshot {directory}/mid.png\nm $624e4 2\nc\n')
    (directory / 'mark.ini').write_text(f'savebin {directory}/mark.bin 0 16\nc\n')
    (directory / 'end.ini').write_text(f'savebin {directory}/end.ram 0 $100000\nc\n')
    (directory / 'key.ini').write_text('e d0\nc\n')
    (directory / 'quit.ini').write_text(f'savebin {directory}/surface.ram 0 $100000\n'
                                        f'screenshot {directory}/surface.png\nquit\n')
    always = ''.join(f'b pc = ${pc:x} :trace\n' for pc in (0x45078, 0x44B5A, 0x44D80)) + (
        f'b pc = $41aee :once :file {directory}/mark.ini\n'
        f'b pc = $41c64 :once :file {directory}/mark.ini\n'
        f'b pc = $41c5a :once :file {directory}/end.ini\n'
        f'b pc = $41e0c :once :file {directory}/end.ini\n'
        f'b pc = $41b9c && d0 & $ffff = $44 :once :quiet :file {directory}/mid.ini\n'
        f'b pc = $41da8 && d0 & $ffff = $42 :once :quiet :file {directory}/mid.ini\n')
    if room == 0xAB:
        always += 'b pc = $44b94 :trace\nb pc = $44b9e :trace\n'
    place = ['savebin $D/room.ram 0 $100000', 'screenshot $D/room.png', 'setopt --fast-forward false',
             f'w $623a8 {word(x)}', f'w $623b0 {word(z)}', f'w $6234c {word(heading)}',
             f'w $623b4 ${stick:02x}', 'echo placed', 'b pc = $48ab6 :80 :once :file $D/quit.ini']
    if keys:
        place.append('b pc = $45344 :file $D/key.ini')
    steps = [
        ('VBL = 6000 :trace :once :quiet', []),
        ('pc = $45304 :once :quiet', [f'r d0=${room:x}', 'r pc=$47f92']),
        ('pc = $48148 :once :quiet', []),
        ('pc = $48948 :200 :once :quiet', place + STATE),
        ('pc = $45078 :once', ['r'] + STATE + ['screenshot $D/trigger.png']),
        ('pc = $48972 :once', ['w $623b4 $00', 'screenshot $D/after.png'] + STATE),
        ('pc = $48948 :60 :once', STATE + ['savebin $D/after.ram 0 $100000',
                                           'screenshot $D/settled.png', 'quit']),
    ]
    chain(directory, always, [(b, [c.replace('$D', str(directory)) for c in cs]) for b, cs in steps])
    (directory / 'empty.cfg').write_text('')


def command(directory: Path, fifo: Path | None) -> list[str]:
    args = machine_args(directory, rebuilt=True)
    # Fast-forward until the player is placed ('setopt' turns it off there);
    # render every frame so screenshots are current.
    args[1:1] = ['--frameskips', '0'] + (['--cmd-fifo', str(fifo)] if fifo else [])
    return args


def summary(directory: Path) -> dict:
    log = (directory / 'hatari.log').read_text(errors='replace')
    log = log[log.find('placed'):]
    stops = [{'pc': f'${pc.upper()}', 'vbl': int(vbl)}
             for pc, vbl in re.findall(r'CPU=\$([0-9a-f]+), VBL=(\d+)', log)]
    traced = re.findall(r'^\tpc = \$([0-9a-f]+) :trace$', log, re.M)
    d7 = re.search(r'D7 ([0-9A-F]{8})', log)
    keys = [int(v, 16) for v in re.findall(r'^= .*\$([0-9a-f]+) \(hex\)$', log, re.M)]
    result = {'stops': stops, 'traced': [f'${pc.upper()}' for pc in traced],
              'flag': f'${int(d7.group(1), 16) & 0xff:02X}' if d7 else None,
              'keysRead': [f'${k & 0xff:02X}' for k in keys]}  # scancodes; d0 = ASCII << 16 | scancode
    marks = [s for s in stops if s['pc'] in ('$41C5A', '$41E0C')]
    result['wipe'] = {'$41C5A': 'up', '$41E0C': 'down'}.get(marks[0]['pc']) if marks else None
    if (directory / 'end.ram').exists():
        ram = (directory / 'end.ram').read_bytes()
        head, tail = (int.from_bytes(ram[KBD_IOREC + o:KBD_IOREC + o + 2], 'big') for o in (6, 8))
        result['keysBufferedAtWipeEnd'] = ((tail - head) % 256) // 4
    for name in ('room.ram', 'after.ram'):
        if (directory / name).exists():
            ram = (directory / name).read_bytes()
            result[name.split('.')[0]] = {
                'room': int.from_bytes(ram[0x62452:0x62454], 'big'),
                'shownPalette8to11': ram[0x623F2:0x623FA].hex()}
    return result


def confirm_door_crossing(names=None) -> Path:
    OUT.mkdir(parents=True, exist_ok=True)
    env = {**os.environ, 'SDL_VIDEODRIVER': 'dummy', 'SDL_AUDIODRIVER': 'dummy'}
    running = {}
    for name in names or CASES:
        directory = OUT / name
        directory.mkdir(exist_ok=True)
        for old in directory.iterdir():
            old.unlink()
        scripts(directory, *CASES[name])
        fifo = directory / 'cmd.fifo' if CASES[name][5] else None
        args = command(directory, fifo)
        (directory / 'command.json').write_text(json.dumps(args, indent=2) + '\n')
        log = (directory / 'hatari.log').open('w')
        running[name] = (subprocess.Popen(args, stdout=log, stderr=log, stdin=subprocess.DEVNULL, env=env),
                         log, fifo)
    senders = [threading.Thread(target=send_keys, args=(OUT / name, process, fifo, CASES[name][5]))
               for name, (process, _, fifo) in running.items() if fifo]
    for sender in senders:
        sender.start()
    for sender in senders:
        sender.join()
    for name, (process, log, _) in running.items():
        try:
            process.wait(timeout=420)
        finally:
            if process.poll() is None:
                process.kill()
            log.close()
    return write_report([n for n in CASES if (OUT / n / 'hatari.log').exists()])


def write_report(names) -> Path:
    report = {'emulatorSha256': sha256(Path(command(OUT, None)[0]).read_bytes()),
              'qualification': 'Native Doorway crossings: the player is placed near a Doorway and '
                               'the stick byte is held; the game walks, triggers and wipes.',
              'cases': {}}
    for name in names:
        report['cases'][name] = {'setup': dict(zip(('room', 'x', 'z', 'heading', 'stick', 'keys'),
                                                   CASES[name])), **summary(OUT / name)}
        if (OUT / name / 'sent.json').exists():
            report['cases'][name]['sent'] = json.loads((OUT / name / 'sent.json').read_text())
    (OUT / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
    return OUT


def send_keys(directory: Path, process: subprocess.Popen, fifo: Path, count: int) -> None:
    """Press 'A' (scancode $1E) `count` times, 80 ms apart, once the wipe has begun."""
    while not fifo.exists():
        time.sleep(0.05)
    sent = []
    with fifo.open('w') as handle:
        while not (directory / 'mark.bin').exists():
            if process.poll() is not None:
                raise SystemExit(f'{directory.name}: Hatari exited before the wipe')
            time.sleep(0.005)
        start = time.monotonic()
        time.sleep(0.05)
        for _ in range(count):
            handle.write('hatari-event keypress 30\n')
            handle.flush()
            sent.append(round(time.monotonic() - start, 3))
            time.sleep(0.08)
    (directory / 'sent.json').write_text(json.dumps({'scancode': '$1E', 'secondsAfterWipeStart': sent}) + '\n')
