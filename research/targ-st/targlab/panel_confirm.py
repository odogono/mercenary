"""Capture natural play and controlled writer samples; RAM stays Restricted.

Pokes exercise existing ST presentation writers in a live loop, not ST gameplay
parity. The probes independently attest the browser's bounded writer windows.
"""
from __future__ import annotations
import json
import os
import subprocess
from pathlib import Path
from .confirm import machine_args
from .disk import REPOSITORY, sha256


def confirm_panel() -> Path:
    out = REPOSITORY / 'restricted' / 'targ-st-panel-743'
    out.mkdir(parents=True, exist_ok=True)

    def run(directory: Path) -> None:
        (directory / 'empty.cfg').write_text('')
        args = machine_args(directory)
        (directory / 'command.json').write_text(json.dumps(args, indent=2) + '\n')
        with (directory / 'hatari.log').open('w') as log:
            subprocess.run(args, stdout=log, stderr=log, check=True, timeout=180,
                           stdin=subprocess.DEVNULL,
                           env={**os.environ, 'SDL_VIDEODRIVER': 'dummy', 'SDL_AUDIODRIVER': 'dummy'})

    def breakpoint(pc: int, path: Path) -> str:
        return f'b PC = ${pc:x} :trace :once :quiet :file {path}\n'

    def boot(directory: Path, arm: str) -> None:
        (directory / 'arm.ini').write_text(arm + 'c\n')
        (directory / 'boot.ini').write_text(
            f'b VBL = 6000 :trace :once :quiet :file {directory}/arm.ini\nc\n')

    (out / 'sample.ini').write_text(f'savebin {out}/in-play.ram 0 $100000\n'
                                  f'screenshot {out}/in-play.png\nquit\n')
    boot(out, breakpoint(0x43c12, out / 'sample.ini'))
    run(out)

    def write(address: int, value: int, size: int) -> str:
        return f'w ${address:x} ' + ' '.join(f'${b:02x}' for b in value.to_bytes(size, 'big')) + '\n'

    for name, altitude, speed, x, z, heading, pitch in [
        ('positive', 0x00123456, 0x00021234, 12, 34, 0, 427),
        ('reverse', 0x0000ffff, 0x0002edcc, 0xfff4, 0xffde, 768, 597),
    ]:
        directory = out / name
        directory.mkdir(exist_ok=True)
        def dump(stage: str, more: str = '') -> None:
            (directory / f'{stage}.ini').write_text(
                f'savebin {directory}/{stage}.ram 0 $100000\n' + more + 'c\n')
        dump('numbers', breakpoint(0x43a0e, directory / 'heading.ini'))
        (directory / 'numbers-start.ini').write_text(
            write(0x623aa, altitude, 4) + write(0x62344, speed, 4) +
            write(0x623a6, x, 2) + write(0x623ae, z, 2) +
            breakpoint(0x43812, directory / 'numbers.ini') + 'c\n')
        (directory / 'heading.ini').write_text(
            write(0x6234c, heading, 2) + breakpoint(0x43ad2, directory / 'compass.ini') + 'c\n')
        dump('compass', breakpoint(0x43b54, directory / 'pitch-start.ini'))
        (directory / 'pitch-start.ini').write_text(
            write(0x6234a, pitch, 2) + breakpoint(0x43c12, directory / 'pitch.ini') + 'c\n')
        (directory / 'pitch.ini').write_text(f'savebin {directory}/pitch.ram 0 $100000\nquit\n')
        boot(directory, breakpoint(0x4371a, directory / 'numbers-start.ini'))
        run(directory)
    (out / 'report.json').write_text(json.dumps({
        'captures': {str(path.relative_to(out)): sha256(path.read_bytes())
                     for path in sorted(out.rglob('*.ram'))},
        'qualification': 'Natural on-foot sample and controlled writer inputs, not C64/ST gameplay equivalence.'
    }, indent=2) + '\n')
    return out


def writer_proofs() -> dict:
    """Only hashes of decoded native output windows, never RAM or screen bytes."""
    import struct
    out = REPOSITORY / 'restricted' / 'targ-st-panel-743'
    number_boxes = [(72, 13, 112, 18, 5), (144, 13, 184, 18, 4), (216, 13, 256, 18, 4)]
    compass_boxes = [(272, 29, 304, 45, 8)]
    pitch_boxes = [(16, 13, 32, 45, 12)]
    view = {'altitude': '00000', 'headingWord': 256, 'pitchWord': 512,
            'location': '08-08', 'speed': '+0000', 'message': '    AIRCRAFT ON PAD     ',
            'lamps': {'location': 15, 'altitude': 15, 'speed': 15}}
    samples = []

    def sample(file: str, inputs: dict, boxes: list) -> None:
        ram = (out / file).read_bytes()
        base = struct.unpack_from('>I', ram, 0x62340)[0] ^ 0x10000
        regions = []
        for left, top, right, bottom, mask in boxes:
            pixels = bytearray()
            for y in range(top, bottom):
                for x in range(left, right):
                    words = struct.unpack_from('>4H', ram, base + (136 + y) * 160 + x // 16 * 8)
                    pixels.append(sum(((w >> (15 - x % 16)) & 1) << p for p, w in enumerate(words)) & mask)
            regions.append({'box': [left, top, right, bottom], 'mask': mask, 'sha256': sha256(pixels)})
        samples.append({'capture': file, 'captureSha256': sha256(ram), 'view': inputs, 'regions': regions})

    sample('in-play.ram', view, number_boxes + compass_boxes + pitch_boxes + [(64, 39, 248, 46, 1)])
    for name, altitude, speed, heading, pitch, negative in [
        ('positive', '18204', '+0001', 0, 427, False),
        ('reverse', '00999', '-0001', 768, 597, True),
    ]:
        inputs = {**view, 'altitude': altitude, 'speed': speed, 'headingWord': heading,
                  'pitchWord': pitch, 'location': '12-34', 'locationNegative': [negative, negative]}
        for stage, boxes in [('numbers', number_boxes), ('compass', compass_boxes), ('pitch', pitch_boxes)]:
            sample(f'{name}/{stage}.ram', inputs, boxes)
    return {'schemaVersion': 1, 'recipe': 'python3 -m targlab confirm-panel && python3 -m targlab export-panel-proofs',
            'qualification': 'Hashes of bounded native writer planes, not full-screen or Game Semantics parity.',
            'samples': samples}
