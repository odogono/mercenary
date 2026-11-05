"""Escape from Targ ST command line.

    python3 -m targlab files                 list the pinned disk's GEMDOS files
    python3 -m targlab export [--out DIR]    write payload/targ-st/title.json and title.png
    python3 -m targlab confirm               check in Hatari that the title shown is E0
    python3 -m targlab export-panel          recover the ST panel presentation
    python3 -m targlab confirm-panel         capture bounded native writer samples
    python3 -m targlab export-panel-proofs    pin native output-window hashes
    python3 -m targlab disasm LO:HI [--ram RAM]   68000 listing of E1 (or a RAM dump)
    python3 -m targlab door-facts            check the Doorway wipe's code bytes in E1
    python3 -m targlab confirm-door          drive the Doorway wipe in Hatari (#976)
    python3 -m targlab confirm-door-crossing cross real Doorways underground in Hatari

`export` reads only the pinned STX. It writes the mark as a PNG and its
provenance as JSON; the rest of the picture never leaves the disk image.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from . import door, m68k
from .confirm import TITLE_VBL, confirm
from .door_confirm import confirm_door
from .door_crossing import CASES as CROSSINGS, confirm_door_crossing
from .disk import REPOSITORY, pinned_floppy
from .panel import extract as extract_panel
from .panel_confirm import confirm_panel, writer_proofs
from .title import IMAGE, extract


def main() -> None:
    parser = argparse.ArgumentParser(prog='targlab')
    commands = parser.add_subparsers(dest='command', required=True)
    commands.add_parser('files')
    commands.add_parser('confirm')
    commands.add_parser('confirm-panel')
    commands.add_parser('export-panel-proofs')
    commands.add_parser('door-facts')
    commands.add_parser('confirm-door')
    crossing = commands.add_parser('confirm-door-crossing')
    crossing.add_argument('cases', nargs='*', help='default: all of ' + ' '.join(CROSSINGS))
    disasm = commands.add_parser('disasm')
    disasm.add_argument('windows', nargs='+', help='LO:HI in hex, HI exclusive')
    disasm.add_argument('--ram', type=Path, help='a RAM dump based at 0 instead of E1')
    panel_export = commands.add_parser('export-panel')
    panel_export.add_argument('--out', type=Path, default=REPOSITORY / 'payload' / 'targ-st')
    export = commands.add_parser('export')
    export.add_argument('--out', type=Path, default=REPOSITORY / 'payload' / 'targ-st')
    args = parser.parse_args()
    if args.command == 'export-panel-proofs':
        path = REPOSITORY / 'web/test/fixtures/targ-st-panel-writers.json'
        path.write_text(json.dumps(writer_proofs(), indent=2, sort_keys=True) + '\n')
        print(path)
        return
    if args.command == 'confirm-door-crossing':
        print(confirm_door_crossing(args.cases or None))
        return
    if args.command == 'confirm-door':
        print(confirm_door())
        return
    if args.command in ('disasm', 'door-facts'):
        if args.command == 'door-facts':
            print(json.dumps(door.check_code(pinned_floppy().read('E1')), indent=2))
            return
        data, base = ((args.ram.read_bytes(), 0) if args.ram
                      else (pinned_floppy().read('E1'), door.E1_BASE))
        for window in args.windows:
            lo, hi = (int(x, 16) for x in window.split(':'))
            print(m68k.listing(data, base, lo, hi))
        return
    if args.command == 'confirm-panel':
        print(confirm_panel())
        return
    if args.command == 'confirm':
        print(f'E0 is the screen at VBL {TITLE_VBL}: {confirm()}')
        return
    floppy = pinned_floppy()
    if args.command == 'files':
        for entry in floppy.entries():
            print(f'{entry.name:12} {entry.size:6} attributes ${entry.attributes:02X}')
        return
    args.out.mkdir(parents=True, exist_ok=True)
    if args.command == 'export-panel':
        (args.out / 'panel.json').write_text(json.dumps(extract_panel(floppy), indent=2, sort_keys=True) + '\n')
        print(args.out / 'panel.json')
        return
    document, image = extract(floppy)
    (args.out / 'title.json').write_text(json.dumps(document, indent=2) + '\n')
    (args.out / IMAGE).write_bytes(image)
    print(args.out / 'title.json')
    print(args.out / IMAGE)


if __name__ == '__main__':
    main()
