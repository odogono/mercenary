"""Run MIII's own workspace builder for the complete original location census.

This research harness executes the pinned original under Hatari; it does not
translate that builder. Every output stays under the ignored restricted root.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import tempfile
from pathlib import Path

from .boot import REPOSITORY, pinned_inputs
from .census_locations import read_inventory, read_workspace
from .ram import Ram

GROUP_COUNT = 57
MIDAS_GROUP = 56


def debugger_scripts(run_dir: Path) -> dict[str, str]:
    """Capture at the ready-workspace boundary, before service setup mutates RAM."""
    scripts = {
        'boot.ini': f'b VBL = 4770 :trace :once :quiet :file {run_dir}/start.ini\nc\n',
        'start.ini': (f'b pc = $5a41a :trace :once :quiet '
                      f':file {run_dir}/opening.ini\n'),
        'opening.ini': (f'savebin {run_dir}/start.ram 0 $100000\n'
                        f'parse {run_dir}/all-groups/group-00.ini\n'),
    }
    for group in range(GROUP_COUNT):
        stem = f'{group:02d}'
        scripts[f'all-groups/group-{stem}.ini'] = (
            f'w $6fde $00 ${group:02x}\n'
            'w $70c0 $00 $00\n'
            'r pc=$4f0f2\n'
            f'b pc = $4f304 :trace :once :quiet '
            f':file {run_dir}/all-groups/save-{stem}.ini\n')
        following = (f'all-groups/group-{group + 1:02d}.ini'
                     if group + 1 < GROUP_COUNT else 'midas/group.ini')
        scripts[f'all-groups/save-{stem}.ini'] = (
            f'savebin {run_dir}/all-groups/group-{stem}.ram 0 $100000\n'
            f'parse {run_dir}/{following}\n')
    scripts['midas/group.ini'] = (
        f'w $6fde $00 ${MIDAS_GROUP:02x}\n'
        'w $70c0 $ff $ff\n'
        'r pc=$4f0f2\n'
        f'b pc = $4f304 :trace :once :quiet :file {run_dir}/midas/save.ini\n')
    scripts['midas/save.ini'] = (
        f'savebin {run_dir}/midas/group-56-uniform.ram 0 $100000\nquit\n')
    return scripts


def validate_capture(ram: Ram, group: int, *, uniform: bool) -> dict:
    """Refuse mislabeled evidence before publishing its decoded workspace."""
    if ram.word(0x6FDE) != group:
        raise ValueError(f'workspace is group {ram.word(0x6FDE)}, expected {group}')
    if bool(ram.word(0x70C0)) != uniform:
        raise ValueError(f'group {group}: unexpected uniform mode')
    # Also verifies the source pins and that $7100 matches this group's labels.
    workspace = read_workspace(ram, group)
    return {'group': group, 'uniform': uniform, 'occupiedCells': len(workspace['cells']),
            'ramSha256': ram.sha256, 'workspace': workspace['provenance']}


def hatari_arguments(pins: dict[str, Path], run_dir: Path) -> list[str]:
    """The existing cold-boot baseline, with only its debugger script changed."""
    return [str(pins['hatari']), '--configfile', str(run_dir / 'empty.cfg'),
            '--tos', str(pins['tos']), '--machine', 'st', '--memsize', '1',
            '--cpulevel', '0', '--cpuclock', '8', '--compatible', 'true',
            '--cpu-exact', 'true', '--addr24', 'true', '--fpu', 'none',
            '--blitter', 'false', '--monitor', 'rgb', '--video-timing', 'ws3',
            '--timer-d', 'false', '--fast-boot', 'false', '--fastfdc', 'false',
            '--disk-a', str(pins['disk']), '--disk-b', 'none', '--drive-b', 'false',
            '--protect-floppy', 'on', '--sound', 'off', '--statusbar', 'false',
            '--drive-led', 'false', '--crop', 'true', '--screenshot-format', 'png',
            '--fast-forward', 'true', '--confirm-quit', 'false', '--alert-level',
            'fatal', '--log-level', 'warn', '--parse', str(run_dir / 'boot.ini')]


def capture_census(root: Path | None = None, *, timeout: int = 120) -> Path:
    pins = pinned_inputs()
    restricted = (REPOSITORY / 'restricted').resolve()
    base = (root or restricted / 'mercenary-iii-647' / 'runs').resolve()
    if not base.is_relative_to(restricted):
        raise ValueError('census captures must stay under the ignored restricted root')
    base.mkdir(parents=True, exist_ok=True)
    run_dir = Path(tempfile.mkdtemp(prefix='full-location-census-', dir=base))
    (run_dir / 'all-groups').mkdir()
    (run_dir / 'midas').mkdir()
    for filename, contents in debugger_scripts(run_dir).items():
        (run_dir / filename).write_text(contents)
    (run_dir / 'empty.cfg').write_text('')
    args = hatari_arguments(pins, run_dir)
    (run_dir / 'command.json').write_text(json.dumps(args, indent=2) + '\n')
    with (run_dir / 'hatari.log').open('w') as log:
        subprocess.run(args, stdout=log, stderr=log, check=True, timeout=timeout,
                       stdin=subprocess.DEVNULL,
                       env={**os.environ, 'SDL_VIDEODRIVER': 'dummy',
                            'SDL_AUDIODRIVER': 'dummy'})
    opening = Ram.load(run_dir / 'start.ram')
    inventory = read_inventory(opening)
    groups = [validate_capture(Ram.load(run_dir / 'all-groups' / f'group-{g:02d}.ram'),
                               g, uniform=False) for g in range(GROUP_COUNT)]
    midas = validate_capture(Ram.load(run_dir / 'midas' / 'group-56-uniform.ram'),
                             MIDAS_GROUP, uniform=True)
    if sum(g['occupiedCells'] for g in groups) != 794 or midas['occupiedCells'] != 256:
        raise ValueError('full census occupied-cell counts disagree with recovered baseline')
    manifest = {'openingRamSha256': opening.sha256, 'sourceRanges': inventory['sourceRanges'],
                'groups': groups, 'midas': midas,
                'initialGroupCells': 794, 'initialCellsWithMidasReplication': 1049}
    (run_dir / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    return run_dir


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, help='Output parent under restricted/')
    parser.add_argument('--timeout', type=int, default=120)
    args = parser.parse_args()
    print(capture_census(args.root, timeout=args.timeout))


if __name__ == '__main__':
    main()
