"""Read-only #778 original-input EAGLE observations; no gameplay export."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

from m3lab.ram import Ram

REPO = Path(__file__).resolve().parents[3]
FAMILIES = (
    'throttle', 'pitch', 'takeoff', 'flight', 'landing', 'space',
    'flight-repeat', 'key-drop', 'yaw', 'fire', 'flight-resume',
)
LABELS = (
    'TOP|THROTTLE_SET|LEAVE|HARD_TOUCHDOWN|SPACE_ENTER|BODY_ENTER|FIRE_ACCEPT|'
    'TAKE|DROP|TAKE_ACCEPT|DROP_ACCEPT|REFUSAL_STRING'
)


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def observe(path: Path) -> dict:
    r = Ram.load(path)
    n = r.word(0x563C)
    return {
        'sha256': r.sha256, 'frame': r.word(0x7180), 'ticks': r.long(0x53094),
        'selector': r.word(0x7142), 'parameter': r.sword(0x7144),
        'eye': [r.slong(a) for a in (0x7146, 0x714A, 0x714E)],
        'roll': r.word(0x7152), 'pitch': r.word(0x7154), 'yaw': r.word(0x7156),
        'contact': r.word(0x715E), 'body': r.word(0x713C),
        'floor': r.word(0x7138), 'group': r.word(0x6FDE), 'cell': r.word(0x71F4),
        'landing': r.sword(0x6F56), 'throttle': r.long(0x7248),
        'swing': r.word(0x71A4), 'landingLatch': r.word(0x70B2),
        'speedBits': r.long(0x700A), 'yawRateBits': r.long(0x7000),
        'passenger': r.word(0x6EB2), 'playback': r.word(0x70A2),
        'fireGuard': r.word(0x725A), 'fireCooldown': r.word(0x6ECC),
        'shotStates': {str(s): r.word(0x5492 + 4*s) for s in range(50, 56)},
        'cashBytes': list(r.bytes(0x72DE, 0x72E4)),
        'stack': list(r.bytes(0x563E, 0x563E + n)),
        'residents': {str(s): {
            'state': r.byte(0x641E + 4*s), 'group': r.byte(0x641D + 4*s),
            'zone': r.byte(0x641F + 4*s),
            'residence': list(r.bytes(0x681C + 4*s, 0x6820 + 4*s)),
            'xyz': [r.slong(a + 4*s) for a in (0x581C, 0x5C1C, 0x601C)],
            'yawByte': r.byte(0x6C1C + 4*s),
        } for s in (3, 38, 181)},
    }


def traces(path: Path) -> list[dict]:
    rows, current = [], None
    for line in path.read_text(errors='replace').splitlines():
        match = re.match(rf'^({LABELS})= .*#(\d+) \(dec\)', line)
        if match:
            current = {'label': match[1], 'vbl': int(match[2]), 'memory': {}}
            rows.append(current)
        elif re.match(r'^\w+= .*#\d+ \(dec\)', line):
            current = None
        if current is None:
            continue
        match = re.match(r'^([\da-fA-F]{8}): ((?:[\da-fA-F]{2} ){1,16})', line)
        if row_match := re.search(r'\bD1 ([0-9A-F]{8})', line):
            if current['label'] == 'REFUSAL_STRING':
                current['stringRequest'] = int(row_match[1], 16)
        if match:
            for i, byte in enumerate(match[2].split()):
                current['memory'][int(match[1], 16) + i] = int(byte, 16)
    for row in rows:
        mem = row.pop('memory')
        def v(a: int, n: int = 2) -> int:
            return int.from_bytes(bytes(mem[a+i] for i in range(n)), 'big')
        row.update(frame=v(0x7180), ticks=v(0x53094, 4),
                   selector=v(0x7142), parameterBits=v(0x7144),
                   eyeBits=[v(a, 4) for a in (0x7146, 0x714A, 0x714E)],
                   pitch=v(0x7154), yaw=v(0x7156), contact=v(0x715E))
    return rows


def build(root: Path) -> dict:
    output = {
        'issue': 778, 'kind': 'dion-native-eagle-research',
        'limits': ['Debugger-fed original mailboxes, not physical IKBD',
                   'Synthetic eleven-tick wait; same-frame transition tops retain zero tick gaps',
                   'Finite continuations do not certify full world/effect/Save closure'],
        'prefixLedger': 'research/mercenary-iii-st/object-interaction-r3-routes.json',
        'prefixLedgerSha256': sha(REPO / 'research/mercenary-iii-st/object-interaction-r3-routes.json'),
        'probeSha256': sha(root / 'probe.py'), 'families': {},
    }
    for name in FAMILIES:
        family = root / name
        manifest_path = family / 'manifest.json'
        manifest = json.loads(manifest_path.read_text())
        source = Path(manifest['source'])
        assert sha(source.with_suffix('.ram')) == manifest['sourceRamSha256']
        assert sha(source.with_suffix('.sav')) == manifest['sourceSavSha256']
        log = Path(manifest['run']) / 'hatari.log'
        rows = traces(log)
        tops = [r for r in rows if r['label'] == 'TOP']
        gaps = [(b['ticks']-a['ticks']) % 65536 for a, b in zip(tops, tops[1:])]
        assert tops and set(gaps) <= {0, 11}
        frame_gaps = [(b['frame']-a['frame']) % 65536 for a, b in zip(tops, tops[1:])]
        assert all(frame_gap == (0 if tick_gap == 0 else 1)
                   for frame_gap, tick_gap in zip(frame_gaps, gaps))
        assert gaps.count(0) == (1 if name == 'space' else 0)
        inputs = []
        for offset, writes in manifest['events']:
            decoded = []
            for write in writes:
                match = re.fullmatch(r'w \$(56726|7056) \$([\da-f]{2})', write)
                assert match, 'not an original key/stick input'
                decoded.append({'owner': 'key' if match[1] == '56726' else 'stick',
                                'value': int(match[2], 16)})
            inputs.append({'offset': offset, 'inputs': decoded})
        caps = {p.stem: observe(p) for p in sorted(family.glob('*.ram'))}
        output['families'][name] = {
            'source': str(source.relative_to(root.parent.parent)),
            'sourceRamSha256': manifest['sourceRamSha256'],
            'sourceCheckpointSha256': manifest['sourceSavSha256'],
            'sourceObservation': observe(source.with_suffix('.ram')),
            'manifestSha256': sha(manifest_path), 'logSha256': sha(log),
            'waitSha256': manifest['waitSha256'], 'patchSha256': manifest['patchSha256'],
            'inputs': inputs, 'captures': caps, 'topCount': len(tops),
            'tickGapCounts': {str(gap): gaps.count(gap) for gap in sorted(set(gaps))},
            'zeroTickReentries': [{'before': a, 'after': b}
                                  for a, b in zip(tops, tops[1:])
                                  if (b['ticks']-a['ticks']) % 65536 == 0],
            'actionBoundaries': [r for r in rows if r['label'] != 'TOP'],
        }
    families = output['families']
    def cap(f: str, c: str) -> dict:
        return families[f]['captures'][c]
    assert cap('throttle', 'f81')['parameter'] == -1
    assert cap('flight', 'f22')['contact'] == 0 and cap('flight', 'f22')['eye'][1] > 63
    assert cap('flight', 'f121')['parameter'] == 3  # Refused airborne Leave.
    assert cap('takeoff', 'f23')['parameter'] == -1
    assert any(r['label'] == 'HARD_TOUCHDOWN' for r in families['takeoff']['actionBoundaries'])
    assert not any(r['label'] == 'HARD_TOUCHDOWN' for r in families['landing']['actionBoundaries'])
    assert cap('landing', 'f200')['contact'] == 63 and cap('landing', 'f200')['parameter'] == 3
    assert cap('landing', 'f271')['parameter'] == -1
    assert cap('landing', 'f271')['residents']['3']['residence'] == [60, 0, 0, 98]
    assert cap('landing', 'f291')['parameter'] == 3
    assert cap('landing', 'f291')['residents']['3']['residence'] == [120, 0, 0, 0]
    assert cap('space', 'f100')['selector'] == 2 and cap('space', 'f100')['body'] == 65535
    assert any(r['label'] == 'SPACE_ENTER' for r in families['space']['actionBoundaries'])
    assert families['space']['zeroTickReentries']
    assert cap('key-drop', 'f11')['stack'] == [104, 103, 135]
    assert cap('key-drop', 'f11')['parameter'] == 3
    assert not cap('key-drop', 'f11')['residents']['181']['state'] & 128
    assert cap('key-drop', 'f51')['parameter'] == -1
    assert any(r.get('stringRequest') == 3 for r in families['key-drop']['actionBoundaries'])
    assert cap('yaw', 'f20')['yaw'] != cap('yaw', 'f10')['yaw']
    assert any(r['label'] == 'FIRE_ACCEPT' for r in families['fire']['actionBoundaries'])
    assert cap('fire', 'f11')['shotStates']['50'] != 0
    first, repeat = families['flight']['captures'], families['flight-repeat']['captures']
    assert first.keys() == repeat.keys()
    assert all(first[key]['sha256'] == repeat[key]['sha256'] for key in first)
    output['independentFlightRepeatMatchedCaptures'] = len(first)
    resumed = families['flight-resume']['captures']
    for key, value in resumed.items():
        original = 'end' if key == 'end' else f'f{int(key[1:]) + 40}'
        assert value['sha256'] == first[original]['sha256']
    output['midflightCheckpointMatchedFutureCaptures'] = len(resumed)
    return output


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--evidence', type=Path, default=REPO / 'restricted/mercenary-iii-778')
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    args.out.write_text(json.dumps(build(args.evidence.resolve()), indent=2) + '\n')
