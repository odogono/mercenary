#!/usr/bin/env python3
"""Check Adrian Hurt's Damocles item list against the tracked catalogue payload (#362).

The list at http://mercenarysite.free.fr/damolist.txt is a **secondary source**: a
player-compiled inventory of Damocles items by building, floor and local cell. It is a
source of leads, not Working-Authority Evidence, and nothing here admits a placement, a
level rule or an access rule. What it can do is corroborate, contradict or name things the
payload cannot express, and this tool says which.

Three checks, all against `payload/damocles/catalogue.json`:

1. **Floor notation.** The list marks a floor as ``(G)``, ``(B)`` or a digit, sometimes
   with a wing letter (``4S``). Read as ``G -> 0``, ``B -> 10``, ``n -> n``, every level
   the list gives should appear among the levels the catalogue holds for that body and
   cell. Reported per cell, with any surplus on either side named rather than hidden.

2. **Door-key identity.** All ten door-key instances share one model record and so share
   the name ``DOOR KEY A``; the payload cannot tell key A from key I. The list names them
   by location, which is checkable against each instance's body, cell and level.

3. **Keyed access.** The list annotates some buildings "Needs key X". Compared against the
   cells whose residents the port cannot reach, this says whether keyed access explains
   them.

This reads no Restricted Material. The list is not vendored -- fetch it yourself and pass
the path, so the copy under test is one you obtained:

    curl -sLO http://mercenarysite.free.fr/damolist.txt
    python3 research/damocles-st/scripts/guide-resident-list-check.py damolist.txt

The copy this note was written against hashes to
``66c3b1103f8f8e8ff0bb65d78190264b3df2445e91e51aa5dcadc1da1e51cb10``; a different hash
means the source moved and the counts below should be re-read, not assumed.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from damocleslab.catalogue import read_catalogue  # noqa: E402

#: The list's floor tags, as read. A wing suffix (``4S``) is a wing, not a floor.
FLOOR = {'G': 0, 'B': 10}

#: Cells whose residents the port cannot reach, from the region-connectivity analysis in
#: docs/research/damocles-gamma-system-location-ledger.md. Body name to local cell.
UNREACHABLE = {('DION', 222), ('DION', 178), ('VESTA', 100)}


def floor_of(tag: str) -> int | None:
    tag = tag.strip().rstrip('NS')
    if tag in FLOOR:
        return FLOOR[tag]
    return int(tag) if tag.isdigit() else None


def local(cell: int) -> str:
    return f'{cell % 16:02d}-{cell // 16:02d}'


def parse_list(text: str) -> tuple[list[tuple[str, int, str, int | None]], dict[tuple[str, int], str]]:
    """Rows of (body, cell, item, floor), and any "Needs key X" note per (body, cell)."""
    rows: list[tuple[str, int, str, int | None]] = []
    notes: dict[tuple[str, int], str] = {}
    body: str | None = None
    cell: int | None = None
    for line in text.splitlines():
        if not line.strip():
            continue
        # A section header names a body, optionally with a ": workspace" qualifier.
        header = re.match(r"^([A-Z][A-Za-z' ]+)(?::\s*(.+))?\s*$", line.rstrip())
        if header and not line[:1].isdigit() and '  ' not in line.strip():
            body, cell = header.group(1).strip().upper(), None
            continue
        if body is None:
            continue
        row = re.match(r'^(\d\d)-(\d\d)\s+(.*)$', line.rstrip())
        indented = re.match(r'^\s{6,}(\S.*)$', line.rstrip())
        if row:
            cell = int(row.group(1)) + int(row.group(2)) * 16
            rest = row.group(3)
        elif indented and cell is not None:
            rest = indented.group(1)
        else:
            continue
        key = re.search(r'[Nn]eeds key (\w)', rest)
        if key:
            notes[(body, cell)] = key.group(1)
        for item in re.split(r',\s*', rest):
            tag = re.search(r'\(([0-9GB][NS]?)\)', item)
            rows.append((body, cell, item.strip(), floor_of(tag.group(1)) if tag else None))
    return rows, notes


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('list', type=Path, help='a local copy of damolist.txt')
    parser.add_argument('--catalogue', type=Path,
                        default=Path('payload/damocles/catalogue.json'))
    args = parser.parse_args()

    text = args.list.read_text(encoding='utf-8', errors='replace')
    print(f'list sha256 {hashlib.sha256(text.encode()).hexdigest()}')

    catalogue = read_catalogue(args.catalogue)
    bodies = {b['name'].upper(): b['id'] for b in catalogue['bodies']}
    models = {m['id']: m for m in catalogue['models']}
    rows, notes = parse_list(text)

    print('\n== 1. floor notation: G -> 0, B -> 10, n -> n ==')
    listed: dict[tuple[str, int], list[int]] = {}
    for body, cell, _item, floor in rows:
        if floor is not None:
            listed.setdefault((body, cell), []).append(floor)
    agreed = surplus = 0
    for (body, cell), floors in sorted(listed.items()):
        body_id = bodies.get(body)
        if body_id is None:
            continue
        ours = Counter(
            instance['association']['levelSelector']
            for instance in catalogue['instances']
            if (instance.get('association') or {}).get('body') == body_id
            and instance['association'].get('cell') == cell
        )
        if not ours:
            continue
        extra = Counter(floors) - ours
        agreed += not extra
        surplus += bool(extra)
        print(f'  {body:<8} {local(cell):<6} list {sorted(floors)!s:<24} '
              f'ours {sorted(ours.elements())!s:<30} '
              f'{"ok" if not extra else "list has " + str(sorted(extra.elements()))}')
    print(f'  -> {agreed} cells agree; {surplus} carry a floor the catalogue has no '
          f'interior resident for')

    print('\n== 2. door-key identity the payload cannot express ==')
    keys = [
        instance for instance in catalogue['instances']
        if models.get(instance['model'], {}).get('name', '').upper().startswith('DOOR KEY')
    ]
    names = {models[instance['model']]['name'] for instance in keys}
    print(f'  {len(keys)} instances share {len(names)} model name(s): {sorted(names)}')
    for instance in sorted(keys, key=lambda i: i['id']):
        association = instance.get('association') or {}
        cell = association.get('cell')
        body = next((name for name, bid in bodies.items()
                     if bid == association.get('body')), '?')
        named = [item for b, c, item, _f in rows
                 if b.startswith(body) and c == cell and 'Key' in item]
        print(f'  {instance["id"]:<18} {body:<8} {local(cell) if cell is not None else "-":<6} '
              f'level {association.get("levelSelector")!s:<4} list says {named}')

    print('\n== 3. keyed access against the cells the port cannot reach ==')
    for (body, cell), key in sorted(notes.items()):
        mark = 'UNREACHABLE' if (body, cell) in UNREACHABLE else ''
        print(f'  {body:<8} {local(cell):<6} needs key {key}  {mark}')
    covered = {(b, c) for (b, c) in notes}
    missing = UNREACHABLE - covered
    print(f'  -> {len(UNREACHABLE & covered)}/{len(UNREACHABLE)} unreachable cells carry a '
          f'"needs key" note' + (f'; unexplained: {sorted(missing)}' if missing else ''))
    return 0


if __name__ == '__main__':
    sys.exit(main())
