#!/usr/bin/env python3
"""Leave-one-out check for image-replayed Damocles workspaces.

A capture's island is published from its live $ABDC. Leaving that capture out
makes the extractor publish the same island from the image instead, through
`image_workspace`. For every capture this compares the two publications cell by
cell -- surface structures, ground geometry, place names and every resident the
group places -- and exits non-zero on any difference.

    research/damocles-st/.venv/bin/python research/damocles-st/scripts/image-workspace-check.py \\
        --run research/damocles-st/work/observe-first-world-20260818T101013Z-c5a32b7d \\
        --workspace research/damocles-st/snapshots/vesta-parliament-4-6.sav ...
"""

from __future__ import annotations

import argparse
import re
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from damocleslab.catalogue import extract, hatari_memstate_ram  # noqa: E402

SOURCE = {'authority': 'Damocles Atari ST Working Authority', 'run': 'leave-one-out'}


def publication(result: dict, body: int, group: int, prefix: str) -> dict:
    """One island's publication, keyed by cell and slot rather than by identity."""
    models = {model['id']: model for model in result['models']}
    pattern = re.compile(rf'^{re.escape(prefix)}-(surface|ground)-([0-9a-f]{{2}})$')
    places = {place['id']: place['name'] for place in result['places']}
    cells: dict[tuple[str, int], dict] = {}
    for instance in result['instances']:
        match = pattern.match(instance['id'])
        if not match:
            continue
        model = models[instance['model']]
        cells[(match.group(1), int(match.group(2), 16))] = {
            # Sign text a capture's RAM supplies belongs to the Model (a
            # `-live-` variant), not to the workspace that places it.
            'liveText': any('-live-' in variant['id']
                            for related in [model, *(models[identity] for identity in
                                                     model.get('relatedModels', [])
                                                     if identity in models)]
                            for variant in related['variants']),
            # Ground identities follow the naming the attestation chooses; the
            # geometry is what has to agree.
            'model': instance['model'] if match.group(1) == 'surface' else None,
            'mesh': model['variants'][0]['mesh'] if model['variants'] else None,
            'position': instance['location']['position'],
            'place': places.get(instance['location']['place']),
            'keyBase': instance.get('keyBase'),
        }
    residents = {}
    for instance in result['instances']:
        association = instance.get('association') or {}
        if (instance['id'].startswith('object-slot-') and association.get('body') == f'body-{body}'
                and association.get('structureGroupSelector') == group):
            placement = instance['placement']
            residents[instance['id']] = None if placement is None else {
                'cell': placement['parent'].rsplit('-', 1)[1],
                'position': placement['position'],
                'heading': placement['heading'],
                'insertions': association['insertions'],
            }
    return {'cells': cells, 'residents': residents}


def prefix_of(result: dict, body: int, origin: tuple[int, int]) -> str:
    """The prefix a published workspace's cell instances carry, found from their positions.

    Only workspace publications count -- their reasons open "Live" or "Image-replayed" --
    so an authored map sharing the origin, as Gaea's Birmingham Island does, is not taken.
    """
    for instance in result['instances']:
        match = re.match(r'^(.*)-(?:surface|ground)-([0-9a-f]{2})$', instance['id'])
        location = instance.get('location') or {}
        if (not match or location.get('body') != f'body-{body}'
                or not instance['reason'].startswith(('Live ', 'Image-replayed '))):
            continue
        cell = int(match.group(2), 16)
        x, _, z = location['position']
        if (int(x) - (cell & 15), int(z) - (cell >> 4)) == origin:
            return match.group(1)
    raise ValueError(f'no published workspace at body {body} origin {origin}')


def described(value: dict | None) -> str:
    """A difference, readable: the mesh is summarised by its size."""
    if value is None:
        return 'absent'
    shown = {key: item for key, item in value.items() if key != 'mesh'}
    if value.get('mesh') is not None:
        shown['mesh'] = f"{len(value['mesh']['faces'])} faces"
    return repr(shown)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--run', type=Path, required=True)
    parser.add_argument('--workspace', type=Path, action='append', default=[])
    args = parser.parse_args(argv)
    data = (args.run / 'observed.ram').read_bytes()
    captures = []
    for path in args.workspace:
        blob = path.read_bytes()
        captures.append((path.stem, blob if len(blob) == 1048576 else hatari_memstate_ram(blob)))
    full = extract(data, SOURCE, [ram for _, ram in captures])
    failures = 0
    for index, (name, ram) in enumerate(captures):
        body = struct.unpack_from('>H', ram, 0x7AA8)[0] // 4
        group = struct.unpack_from('>H', ram, 0x794E)[0]
        cell = struct.unpack_from('>H', ram, 0x7B5C)[0]
        origin = ((struct.unpack_from('>I', ram, 0x7A92)[0] >> 16) - (cell & 15),
                  (struct.unpack_from('>I', ram, 0x7A9A)[0] >> 16) - (cell >> 4))
        others = [other for position, (_, other) in enumerate(captures) if position != index]
        without = extract(data, SOURCE, others)
        live = publication(full, body, group, prefix_of(full, body, origin))
        try:
            image = publication(without, body, group, prefix_of(without, body, origin))
        except ValueError as error:
            print(f'{name}: FAIL {error}')
            failures += 1
            continue
        differences = []
        live_text = []
        for key in sorted(set(live['cells']) | set(image['cells'])):
            captured, replayed = live['cells'].get(key), image['cells'].get(key)
            if (captured and replayed and captured['liveText']
                    and {**captured, 'mesh': None, 'liveText': None}
                    == {**replayed, 'mesh': None, 'liveText': None}):
                if captured['mesh'] != replayed['mesh']:
                    live_text.append(f'${key[1]:02X}')
                continue
            if captured != replayed:
                differences.append(f'{key[0]} cell ${key[1]:02X}: capture '
                                   f'{described(live["cells"].get(key))}, image '
                                   f'{described(image["cells"].get(key))}')
        for identity in sorted(set(live['residents']) | set(image['residents'])):
            if live['residents'].get(identity) != image['residents'].get(identity):
                differences.append(f'{identity}: capture {live["residents"].get(identity)}, '
                                   f'image {image["residents"].get(identity)}')
        placed = sum(value is not None for value in live['residents'].values())
        surfaces = sum(kind == 'surface' for kind, _ in live['cells'])
        grounds = len(live['cells']) - surfaces
        if differences:
            failures += 1
            print(f'{name}: FAIL {len(differences)} differ')
            for difference in differences[:8]:
                print(f'    {difference}')
        else:
            print(f'{name}: body {body} group ${group:02X}: {surfaces} structures, {grounds} ground '
                  f'cells, {placed} placed residents identical'
                  + (f'; live sign text only at cell {", ".join(live_text)}' if live_text else ''))
    return 1 if failures else 0


if __name__ == '__main__':
    sys.exit(main())
