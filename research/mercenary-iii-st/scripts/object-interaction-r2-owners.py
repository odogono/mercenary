"""Read-only R2 acquired-owner audit; emits numeric provenance, never ROM text.

Run with PYTHONPATH=research/mercenary-iii-st from the repository root.
Original execution recipes and logs remain in restricted/mercenary-iii-771/owners.
This observes the source/captures; it supplies no gameplay implementation.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

from m3lab.ram import Ram

REPO = Path(__file__).resolve().parents[3]
RAW = REPO / 'restricted/mercenary-iii-771/owners'
SOURCE = REPO / 'restricted/mercenary-iii-708/presentation/exact2/start.ram'
SOURCE_SHA = '71b957b3b7124959b01bd40b896c921d37902c18cfca042bef1906b155ef0170'
OUT = REPO / 'research/mercenary-iii-st/object-interaction-r2-owners.json'
WAIT_SHA = '9f0f02ea22a98b4fe4556da86129ad571daa1805ae73e98cdf397b9e55d670eb'
PATCH_SHA = '1ccd3989761d9bf69ad107d8f5a981714719fc232526c7b5246a0737cbfe705f'
HARNESS_SHA = '2d4597d6572d84c0e3f26236f131fecb866c64ef31c8d4d71038190be7cf4069'
ACQUIRED = (103, 104, 124, 135, 165, 181, 219, 220)
PINS = (
    (0x543DE, 0x5442A, 'lamp', 'c89fe178c2877bc189d7a5fa9f10ff67241d11a58e2abd8bd2143054dae40b68'),
    (0x555D4, 0x555F6, 'response lookup', '2c988d652654cbc0289fe4c6422471c6700876aed3f5a9bee279a90a95905ff8'),
    (0x4D63C, 0x4D6EA, 'Open', 'ffd9c9d2603fca36771ff5545732fab032ec2f667b1660c235f57d8217212462'),
    (0x4D6EA, 0x4D80A, 'definitions', '9ce30410810ee51f44eb36be6d515ab26f0c7da066248c73041824d4bde6c70c'),
    (0x55402, 0x5544C, 'Take', 'e9ff402eed442fbea772549cb94ad7eaaeca12db51680deaf131b3cc3167cf34'),
    (0x558F6, 0x559E8, 'Drop', '4000c08c9fff60ec32d9b17b68a58ad882eff5d5cabca138acfc2d1572a013e2'),
    (0x4DB7C, 0x4DBF4, 'taxi commands', '4cd12899e8ecc708ccf00f2a7a06831def57a6af031d6b2e3a4ff19b2dba9a93'),
    (0x4DC3E, 0x4DC9C, 'bus label reader', '2fa348dd9b728bccda45442f4564c5a81410bfc1b6debdf43f8f83b030911c16'),
    (0x4DF04, 0x4DF46, 'service card label dispatch', '06fbf7ff447bc9cc61afcf146f31f127c873029b90407430236deecf0bb4d7a6'),
    (0x51EAC, 0x51F02, 'taxi call future', '2491d41ff16a36694783ec133db1b51936ccef4663dcb1d4cb6ae102d299147e'),
    (0x4CC46, 0x4CD10, 'detector random sound gate', 'ece9b5804950ebe41e11fadade6f52f7a49bce4d3078dc7e20cfadeedcf35e1a'),
    (0x54694, 0x54696, 'black lamp phase word', '49b66198c61930b96ddd6163a87885af9013ae44e3414b8f2c4cdc0abb752c7c'),
    (0x546B8, 0x546BA, 'blue lamp phase word', '76a957b0dbd26a7a283c6af7d57f9ab0ccf066decb624191d86205569e024b39'),
)
LABELS = ('TOP', 'TAKE', 'DROP', 'LEFT', 'RIGHT', 'SUPPORT_TOP', 'DROP_ACCEPT',
          'TAKE_ACCEPT', 'REFUSAL_STRING', 'MODE_HELPER', 'PANEL_KEY', 'OPEN',
          'CARD_SET', 'SOUND', 'RESPONSE_TABLE', 'LAMP', 'LAMP_RESULT')


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def local(path: str) -> Path:
    return REPO / 'restricted' / path.split('/restricted/', 1)[1]


def observe(path: Path) -> dict:
    r = Ram.load(path)
    return {
        'sha256': r.sha256, 'frame': r.word(0x7180), 'ticks': r.word(0x53096),
        'stack': list(r.bytes(0x563E, 0x563E + r.word(0x563C))),
        'held': [s for s in range(1, 247) if r.byte(0x641E + 4*s) & 128],
        'card': list(r.bytes(0x6F0E, 0x6F12)), 'reveal': r.word(0x53950),
        'descriptionObject': r.byte(0x6F06), 'continuation': r.sword(0x7230),
        'taxiCall': r.word(0x6EC0), 'scroll': r.sword(0x4E394),
        'labelSha256': r.digest(0x4E380, 0x4E390),
        'eye': [r.slong(a) for a in (0x7146, 0x714A, 0x714E)],
        'body': r.word(0x713C), 'cell': r.word(0x71F4),
        'detectorSignedState': r.sbyte(0x6672),
        'randomSoundRate': r.word(0x710C),
        'resident165': {
            'state': r.byte(0x66B2), 'group': r.byte(0x66B1), 'zone': r.byte(0x66B3),
            'xyz': [r.slong(a + 4*165) for a in (0x581C, 0x5C1C, 0x601C)],
            'residence': list(r.bytes(0x6AB0, 0x6AB4))
        }
    }


def trace(path: Path) -> list[dict]:
    rows = []
    current = None
    for line in path.read_text(errors='replace').splitlines():
        marker = re.match(r'^(' + '|'.join(LABELS) + r')(?:=|\s)', line)
        if marker:
            current = {'label': marker[1], 'mem': {}, 'registers': {}}
            rows.append(current)
        if current is None:
            continue
        memory = re.match(r'^([\da-fA-F]{8}): ((?:[\da-fA-F]{2} ){1,16})', line)
        if memory:
            for i, b in enumerate(memory[2].split()):
                current['mem'][int(memory[1], 16) + i] = int(b, 16)
        for key, value in re.findall(r'\b([DA][0-7]) ([0-9A-F]{8})', line):
            current['registers'].setdefault(key, int(value, 16))
        sr = re.match(r'^SR=([0-9A-F]+)', line)
        if sr:
            current['sr'] = int(sr[1], 16)
    for row in rows:
        mem = row.pop('mem')
        def value(a: int, n: int = 2) -> int:
            return int.from_bytes(bytes(mem[a+i] for i in range(n)), 'big')
        row.update(frame=value(0x7180), ticks=value(0x53096),
                   stack=[mem[0x563E+i] for i in range(value(0x563C))],
                   card=value(0x6F0E, 4))
    return rows


def audit() -> dict:
    assertions = []
    def check(name: str, condition: bool) -> None:
        if not condition:
            raise AssertionError(name)
        assertions.append(name)
    source = Ram.load(SOURCE)
    check('coherent source', source.sha256 == SOURCE_SHA)
    check('pinned R1 harness', sha(REPO / 'restricted/mercenary-iii-770/harness.py') == HARNESS_SHA)
    pins = [dict(role=role, **source.require(lo, hi, digest, role))
            for lo, hi, role, digest in PINS]
    response = {source.byte(a+1): source.byte(a) for a in range(0x555EE, 0x555F4, 2)}
    check('Dion response entries', response == {216: 28, 218: 115, 127: 24})
    definitions = {source.byte(a): list(source.bytes(a, a+4))
                   for a in range(0x4D6EA, 0x4D80A, 8)}
    items = {}
    table = source.long(0x4BD10)
    for slot in (*ACQUIRED, 174):
        pointer = table + source.word(table + 2*slot)
        items[str(slot)] = {
            'response': response.get(slot), 'card': definitions.get(slot),
            'label': {'address': pointer-16, 'length': 16,
                      'sha256': source.digest(pointer-16, pointer)},
            'modelRecordAddress': pointer, 'header': source.word(pointer)
        }
        check(f'no response for candidate {slot}', slot not in response)
        if slot in (165, 174):
            phase = 0x54400 + 4*slot
            items[str(slot)]['lampPhaseWord'] = source.word(phase)
            items[str(slot)]['lampPhaseSource'] = source.slice(phase, phase+2)
    check('only selected cards/document have definitions',
          {s for s in ACQUIRED if s in definitions} == {103, 104, 220})
    check('black and blue lamp colours', source.word(0x353F0) == source.word(0x35414) == 0x8003
          and source.word(0x353F2) == 2 and source.word(0x35416) == 5)
    check('blue lamp gate is slot40', source.word(0x543F2) == 0x64BE
          and 0x64BE == 0x641E + 4*40)
    check('colour4 lamp gate is slot41', source.word(0x54400) == 0x64C2
          and 0x64C2 == 0x641E + 4*41)
    families = {}
    all_rows = {}
    for name, slot in (('black', 165), ('mailbox', 219), ('cobweb', 124), ('key', 181),
                       ('black-replay', 165)):
        family = RAW / name
        manifest = json.loads((family / 'manifest.json').read_text())
        origin = local(manifest['source'])
        check(name + ' source RAM', sha(origin.with_suffix('.ram')) == manifest['sourceRamSha256'])
        check(name + ' source checkpoint', sha(origin.with_suffix('.sav')) == manifest['sourceSavSha256'])
        first = Ram.load(origin.with_suffix('.ram'))
        check(name + ' accepted wait instrumentation', manifest['waitSha256'] == WAIT_SHA
              and manifest['patchSha256'] == PATCH_SHA and manifest['cpu'] == 32)
        check(name + ' source frame and ticks', first.word(0x7180) == manifest['baseFrame']
              and first.word(0x53096) == manifest['baseTicks'])
        for lo, hi, role, digest in PINS:
            first.require(lo, hi, digest, name + ' ' + role)
        # The recipe only supplies semantic input; no resident/panel/lamp edits.
        check(name + ' input-only prefix', all(commands == [f'w $56726 ${code:02x}']
              for (_, commands), code in zip(manifest['events'],
                  [0x48] if name == 'black-replay' else
                  [0x72, 0x66, 0x4E, 0x4A] + ([0x50, 0x48] if name == 'black' else [])))
              and len(manifest['events']) == (1 if name == 'black-replay' else 6 if name == 'black' else 4))
        log = local(manifest['run']) / 'hatari.log'
        rows = trace(log)
        all_rows[name] = rows
        tops = [r for r in rows if r['label'] == 'TOP']
        check(name + ' eleven-tick top gaps', len(tops) > 1 and all(
            ((b['frame'] - a['frame']) % 65536, (b['ticks'] - a['ticks']) % 65536) == (1, 11)
            for a, b in zip(tops, tops[1:])))
        by_frame = {r['frame']: r['ticks'] for r in tops}
        check(name + ' within-frame ticks', all(r['ticks'] == by_frame[r['frame']]
              for r in rows if r['frame'] in by_frame))
        check(name + ' masked frame', all(r['sr'] & 0x700 == 0x700 for r in rows if 'sr' in r))
        captures = {p.stem: observe(p) for p in sorted(family.glob('f*.ram'))}
        check(name + ' requested positive captures complete',
              {int(cut[1:]) for cut in captures} == {cut for cut in manifest['captures'] if cut > 0})
        check(name + ' capture frame and tick boundaries', all(
              c['frame'] == (manifest['baseFrame'] + int(cut[1:])) % 65536
              and c['ticks'] == (manifest['baseTicks'] + 11*int(cut[1:])) % 65536
              and c['ticks'] == by_frame[c['frame']] for cut, c in captures.items()))
        check(name + ' key38 independent of stack', all(38 in c['held'] and 38 not in c['stack']
              for c in captures.values()))
        check(name + ' detector not held', all(c['detectorSignedState'] >= 0 for c in captures.values()))
        check(name + ' random-sound gate remains clear', all(c['randomSoundRate'] == 0 for c in captures.values()))
        check(name + ' retained taxi card', all(c['card'] == [104, 5, 4, 0] for c in captures.values()))
        if name != 'black-replay':
            check(name + ' acquired head', observe(origin.with_suffix('.ram'))['stack'][0] == slot)
            base = manifest['baseFrame']
            check(name + ' unmatched Open has no card/sound event',
                  [r['label'] for r in rows if r['frame'] == base+20
                   and r['label'] in ('OPEN', 'CARD_SET', 'SOUND')] == ['OPEN'])
            check(name + ' Read reaches retained taxi card', captures['f41']['taxiCall'] == 1
                  and len([r for r in rows if r['frame'] == base+40 and r['label'] == 'SOUND']) == 1)
        families[name] = {
            'sourcePath': str(origin.relative_to(REPO)),
            'sourceRamSha256': manifest['sourceRamSha256'],
            'sourceSavSha256': manifest['sourceSavSha256'],
            'manifestSha256': sha(family / 'manifest.json'), 'logSha256': sha(log),
            'events': manifest['events'], 'baseFrame': manifest['baseFrame'],
            'topCount': len(tops), 'elevenTickGaps': len(tops)-1,
            'inFrameTickSamples': sum(r['frame'] in by_frame for r in rows),
            'maskedSamples': sum('sr' in r for r in rows), 'captures': captures,
            'actionOrder': [{'frame': r['frame'], 'label': r['label'], 'stack': r['stack']}
                            for r in rows if r['label'] not in ('TOP', 'MODE_HELPER', 'LAMP', 'LAMP_RESULT')]
        }
    black = families['black']['captures']
    check('black Drop clears held and places actual Body/cell',
          black['f101']['stack'] == [104, 103, 135] and black['f101']['resident165']['state'] == 4
          and black['f101']['resident165']['residence'] == [60, 0, 0, 2]
          and black['f101']['resident165']['xyz'] == [black['f101']['eye'][0], 0, black['f101']['eye'][2]])
    check('black re-pick restores stack and independent held state',
          black['f141']['stack'] == [165, 104, 103, 135]
          and black['f141']['resident165']['state'] == 132
          and black['f141']['resident165']['residence'] == [120, 1, 0, 16])
    check('black partial forward/reverse label scroll',
          [black[cut]['scroll'] for cut in ('f101', 'f105', 'f141', 'f150')] == [5, 0, -5, 0])
    base = families['black']['baseFrame']
    check('Drop sound requests follow committed stack removal',
          [r['label'] for r in all_rows['black'] if r['frame'] == base+100
           and r['label'] in ('DROP_ACCEPT', 'SOUND', 'RESPONSE_TABLE')] == ['DROP_ACCEPT', 'SOUND', 'SOUND'])
    check('Take sound/table/sound ordering',
          [r['label'] for r in all_rows['black'] if r['frame'] == base+140
           and r['label'] in ('TAKE_ACCEPT', 'SOUND', 'RESPONSE_TABLE')]
          == ['TAKE_ACCEPT', 'SOUND', 'RESPONSE_TABLE', 'SOUND'])
    lamps = [r for r in all_rows['black'] if r['label'] == 'LAMP_RESULT'
             and r['registers']['D0'] & 0xFFFF == 4*165]
    check('placed black executes both lamp outcomes', {r['registers']['D1'] & 0xFFFF for r in lamps} == {1, 3})
    check('black lamp outcomes match source slot phase and retained frame',
          all(r['registers']['D1'] & 0xFFFF ==
              (1 if (r['frame'] + items['165']['lampPhaseWord']) & 4 else 3) for r in lamps))
    check('lamp reader sees placed black before re-pick action',
          all(base+100 < r['frame'] <= base+140 and 165 not in r['stack'] for r in lamps))
    families['black']['lampOutcomes'] = [{'frame': r['frame'], 'value': r['registers']['D1'] & 0xFFFF}
                                        for r in lamps]
    replay = []
    for original, restored in ((139, 34), (140, 35), (141, 36), (150, 45)):
        a, b = RAW / f'black/f{original}.ram', RAW / f'black-replay/f{restored}.ram'
        check(f'black restored full RAM f{original}', a.read_bytes() == b.read_bytes())
        replay.append({'original': original, 'restored': restored, 'sha256': sha(a), 'fullRamEqual': True})
    return {'issue': 771, 'kind': 'dion-r2-acquired-owner-evidence', 'sourceSha256': SOURCE_SHA,
            'instrumentation': {'harnessSha256': HARNESS_SHA, 'waitSha256': WAIT_SHA, 'patchSha256': PATCH_SHA},
            'scope': 'source and original-input owner controls; no playable admission or browser codec',
            'pins': pins, 'probeSha256': sha(RAW / 'probe.py'),
            'actualAcquiredSet': list(ACQUIRED), 'staticCandidateOnly': [174],
            'items': items, 'assertions': assertions, 'families': families, 'restore': replay}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, default=OUT)
    parser.add_argument('--write', action='store_true', help='write the numeric ledger after all assertions pass')
    args = parser.parse_args()
    result = audit()
    if not args.write:
        if json.loads(args.out.read_text()) != result:
            raise AssertionError('numeric ledger differs from retained evidence')
    else:
        args.out.write_text(json.dumps(result, indent=2) + '\n')
    print(f"R2 owners: {len(result['assertions'])} assertions; "
          f"{sum(f['elevenTickGaps'] for f in result['families'].values())} eleven-tick gaps; "
          f"{len(result['restore'])} full-RAM restored cuts")
