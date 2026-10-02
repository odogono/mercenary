"""Escape from Targ ST command line.

    python3 -m targlab files                 list the pinned disk's GEMDOS files
    python3 -m targlab export [--out DIR]    write payload/targ-st/title.json
    python3 -m targlab confirm               check in Hatari that the title shown is E0

`export` reads only the pinned STX. It writes decoded facts and their
provenance; the picture itself never leaves the disk image.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from .confirm import TITLE_VBL, confirm
from .disk import REPOSITORY, pinned_floppy
from .title import extract


def main() -> None:
    parser = argparse.ArgumentParser(prog='targlab')
    commands = parser.add_subparsers(dest='command', required=True)
    commands.add_parser('files')
    commands.add_parser('confirm')
    export = commands.add_parser('export')
    export.add_argument('--out', type=Path, default=REPOSITORY / 'payload' / 'targ-st')
    args = parser.parse_args()
    if args.command == 'confirm':
        print(f'E0 is the screen at VBL {TITLE_VBL}: {confirm()}')
        return
    floppy = pinned_floppy()
    if args.command == 'files':
        for entry in floppy.entries():
            print(f'{entry.name:12} {entry.size:6} attributes ${entry.attributes:02X}')
        return
    args.out.mkdir(parents=True, exist_ok=True)
    path = args.out / 'title.json'
    path.write_text(json.dumps(extract(floppy), indent=2) + '\n')
    print(path)


if __name__ == '__main__':
    main()
