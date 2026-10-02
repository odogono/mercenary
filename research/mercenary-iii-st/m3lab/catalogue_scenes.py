"""Prepare #686 exact-camera checks of exported Catalogue previews.

Reuses the recovery children's ignored original captures. Reads camera and
presentation state only; the browser loads geometry from the Catalogue export.
Original screen/RAM inputs and generated comparison sheets stay restricted.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from .boot import REPOSITORY
from .geometry import PALETTE_TABLE_POINTER
from .ram import Ram

ROOT = REPOSITORY / 'restricted'


def captured_pose(ram: Ram) -> dict:
    return {
        'eye': [ram.slong(a) for a in (0x7146, 0x714A, 0x714E)],
        'heading': ram.word(0x7136),
        'pitch': ram.word(0x7154),
        'roll': ram.word(0x7152),
        'region': ram.word(0x7194),
        'frameCounter': (ram.word(0x7180) - 1) & 0xFFFF,
        'signCode': ram.byte(0xB3F2),
        'day': ram.long(0x70A4) == ram.word(0x70AA),
    }


def object_context(ram: Ram) -> dict:
    table = ram.long(PALETTE_TABLE_POINTER)
    palette = next(i for i in range(256)
                   if table + ram.word(table + 2 * i) == ram.word(0x70A8))
    return {'body': f'body-{ram.long(0x715A) // 4:02d}',
            'group': ram.word(0x6FDE), 'palette': palette}


def captured_doors(ram: Ram, geometry: dict) -> list:
    doors = []
    for door in geometry['attachments']:
        if not door['twoLeaves']:
            x0, z0, x1, z1 = door['leaves']
            expected = ([[x0, z0], [x0, z1], [x1, z1], [x1, z0]]
                        if door['motionAxis'] == 'x'
                        else [[x0, z0], [x1, z0], [x1, z1], [x0, z1]])
            original = [[(ram.long(base + 4 * i) + 32768) % 65536 - 32768
                         for base in (0x1640, 0x1898)]
                        for i in range(door['firstVertex'], door['firstVertex'] + 4)]
            if original != expected:
                raise ValueError('one-leaf capture differs from its static attachment')
            doors.append([door['slot'], {'openUnits': 0}])
            continue
        axis = door['motionAxis']
        low, high = ((door['leaves'][0], door['leaves'][2]) if axis == 'x'
                     else (door['leaves'][1], door['leaves'][3]))
        address = (0x1640 if axis == 'x' else 0x1898) + 4 * (door['firstVertex'] + 2)
        edge = (ram.long(address) + 32768) % 65536 - 32768
        doors.append([door['slot'], {'openUnits': ((low + high) // 2) - edge}])
    return doors


def prepare_cases() -> dict:
    catalogue = json.loads((REPOSITORY / 'payload/dion/catalogue/catalogue.json').read_text())
    objects = {o['slot']: o for o in catalogue['objects']}
    placements = {p['id']: p for p in catalogue['placements']}
    structures = {s['id']: s for s in catalogue['structures']}
    cases = []
    for ticket, filename in ((681, 'objects.scenes'), (682, 'scenes'), (683, 'scenes')):
        directory = ROOT / f'mercenary-iii-{ticket}'
        results = json.loads((directory / f'{filename}.json').read_text())
        for name, result in results.items():
            run = directory / 'runs' / result['run']
            ram = Ram.load(run / 'v7000.ram')
            selection = {'floor': 0, 'region': 0, 'state': 'initial',
                         'variant': '', 'fieldX': 0, 'fieldZ': 0}
            pose = captured_pose(ram)
            if ticket == 681:
                slot = result['object']
                obj = objects[slot]
                selection.update(
                    id=obj['id'] if obj['geometry'] == result['geometry'] else result['geometry'],
                    variant=result['variant'])
                # The old scene request names a lamp state without freezing its
                # blink. Admit the actual colour bytes the original frame drew.
                model_path = REPOSITORY / 'payload/dion/catalogue/geometry' / f"{result['geometry']}.json"
                header = json.loads(model_path.read_text())['geometry'].get('header') or {}
                if header.get('op') == 3:
                    lamps = {ram.byte(int(at[1:], 16)) for at in header['targets']}
                    if lamps not in ({1}, {3}):
                        raise ValueError('captured beacon has inconsistent lamp colours')
                    state = 'lamp-dark' if lamps == {1} else 'lamp-lit'
                    selection['variant'] = f'state={state};form=default'
                # Isolated definitions stand at (32768,0,32768), in working slot 1.
                position = [ram.slong(a + 4 * slot) for a in (0x581C, 0x5C1C, 0x601C)]
                pose['eye'] = [pose['eye'][a] - position[a] + [32768, 0, 32768][a]
                               for a in range(3)]
                pose['region'] = 1
                drawn_slot = slot if selection['id'].startswith('object-') else 1
                pose['residents'] = [[drawn_slot, {'position': [32768, 0, 32768],
                                                  'yaw': ram.byte(0x6C1C + 4 * slot)}]]
            else:
                if ticket == 682:
                    selection['id'] = result['binding']
                    if name == 'logos-constructed':
                        selection['state'] = 'constructed'
                    if name == 'midas-field-far':
                        selection.update(fieldX=393, fieldZ=2694)
                else:
                    obj = objects[result['resident']]
                    selection.update(id=obj['host'].get('placement', catalogue['field']['seed']),
                                     floor=obj['floor'])
                    if obj['host'].get('field'):
                        delta = result['displacementCells']
                        selection.update(
                            fieldX=obj['bodyCell'][0] - catalogue['field']['origin'][0] + delta[0],
                            fieldZ=obj['bodyCell'][1] - catalogue['field']['origin'][1] + delta[1])
                placement = placements[selection['id']]
                floor = next(f for f in structures[placement['structure']]['floorBindings']
                             if f['floor'] == selection['floor'])
                # $5A102 keeps resident Y + 63; $56E2C writes local $703C = 63.
                pose['structureEyeY'] = ram.sword(0x703C)
                pose['floorLabel'] = ram.byte(0xB2D0)
                path = REPOSITORY / 'payload/dion/catalogue/geometry' / f"{floor['geometry']}.json"
                geometry = json.loads(path.read_text())['geometry']['variants'][floor['variant']]
                pose['doors'] = captured_doors(ram, geometry)
                bodycell = placement['bodyCell']
                if selection['id'] == catalogue['field']['seed']:
                    bodycell = [(catalogue['field']['origin'][a] + selection[k]) % 4096
                                for a, k in enumerate(('fieldX', 'fieldZ'))]
                for axis, cell in ((0, bodycell[0]), (2, bodycell[1])):
                    pose['eye'][axis] = ((pose['eye'][axis] - cell * 65536 + 134217728)
                                         % 268435456 - 134217728)
            cases.append({
                'id': name, 'owner': ticket, 'run': result['run'], 'ramSha256': ram.sha256,
                'ram': str(run / 'v7000.ram'),
                'screenshot': str(run / 'v7000.png'), 'selection': selection, 'pose': pose,
                'context': object_context(ram) if ticket == 681 else None,
            })
    return {'kind': 'dion-catalogue-scenes', 'schemaVersion': 1,
            'source': catalogue['source'], 'cases': cases}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, default=ROOT / 'mercenary-iii-686/scenes.json')
    args = parser.parse_args()
    if not args.out.resolve().is_relative_to(ROOT.resolve()):
        raise SystemExit('scene inputs stay under restricted/')
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(prepare_cases(), indent=2, sort_keys=True) + '\n')
    print(args.out)


if __name__ == '__main__':
    main()
