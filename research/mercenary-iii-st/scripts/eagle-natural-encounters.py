"""Read-only native EAGLE navigation/encounter evidence; no original data export."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

from m3lab.ram import Ram

REPO = Path(__file__).resolve().parents[3]
RAW = REPO / 'restricted/mercenary-iii-778/natural-encounters'
SOURCE = '71b957b3b7124959b01bd40b896c921d37902c18cfca042bef1906b155ef0170'
FAMILIES = ('orient', 'orient-short', 'orient-fine', 'cruise', 'cruise2',
            'dogleg-orient', 'east-leg', 'east-lift', 'north-orient', 'north-leg',
            'arrival-orient', 'arrival', 'arrival2-orient', 'arrival2', 'fire',
            'fire-turn2', 'fire-aim', 'fire-repeat2', 'arrival-repeat', 'aim-repeat', 'hit-repeat')
LABELS = ('TOP', 'ARRIVAL_ARM', 'BODY_ENTER', 'BODY_ROTATION', 'PROGRAMME_BIND',
          'FIRE_ACCEPT', 'KILL_ACCOUNT', 'PROGRAMME_NEXT', 'HOSTILE_SHOT', 'INCOMING_HIT',
          'BODY_X_STORE', 'HIT_FAILURE')
PINS = (
    (0x59502, 0x59A36, 'native space pass', '14e7248a3abd257425e1d6ab769f688a9ac2c44433e44fcc795a9a99f203a474'),
    (0x53D32, 0x53F70, 'nearest Body and arrival', '03f3a88a82ccb68a1859c5716973f9a0235979b1ef348eacd2320913dbc66a7d'),
    (0x5A15E, 0x5A27C, 'Body entry', '47b7defe0811a15336c0ba84a60e6ac36c97348eec11f5462bf5d482502154c1'),
    (0x511D8, 0x513EC, 'player fire', '33a413a9981d146fd1d969355ef4b161697f4d6141b12547f2645f74dddc88d3'),
    (0x51062, 0x511A8, 'shot and kill', '98cdf32fd661a07d440c1952820bc9b43ec7c5df8c30ed1ec9d3c4857212870e'),
    (0x52056, 0x520CC, 'actor model and path selection', '63599d19b0d725a7a2298f3575a392b8a9f2c708e3f65a9387ac6446e7c05c75'),
    (0x520CC, 0x522BC, 'actor admission and movement', 'e054f347131d990494220a5e0a63b3e10242b59a513dc5a4aa4d2bf241296838'),
    (0x52448, 0x525BC, 'hostile launch and damage', '696ff81067716369aaab9a356e6f33cb9d49c146198095e76db9c00eab01577e'),
    (0x522BC, 0x522E2, 'passive path56', '87f7c551e5fa90fd876b57dfa5cea6cfbb8c30e0cb6bb5be43d42896d404ad28'),
    (0x522E2, 0x52308, 'passive path57', '03f2fa4fcdc2f3d575c287e79e20d28ca9b03b00dcaea854d7026887088c9fc8'),
    (0x52308, 0x5232E, 'passive path58', '5efd88780f1f50dc04cee01c58b5fa71a651ba1082a9d7a9a4f843db7e84f8ee'),
    (0x5232E, 0x52354, 'hostile path56', '42b0d89df54214b9b2073f03e07707fb034ad665e7e4654cf997522f7762ba32'),
    (0x52354, 0x5237A, 'hostile path57', 'e4a9d5e58455eec53b85ad885a6ee98552bb663e69431e045fae8eb76874d96e'),
    (0x5237A, 0x523A0, 'hostile path58', '8cb3ebb93e8e26a76cca79c279e94f5aafe37929298de64648afa63c9eff938b'),
    (0x7C42, 0x7C46, 'JUNO surface tuple', '6b5b5ba586c33e01f2c9d872efde8adbe919f564bf5554e7a342f7fbaa19f520'),
    (0x7BC2, 0x7BC6, 'JUNO sky words', '8a12133ee3586861d9ff17884217fd833c632dfdf970de5bcf94716ed6f9df29'),
    (0x6330A, 0x63314, 'JUNO detail marker', '3c94ec498e2087f4e0cfdbc2e82f15112aa80438bb15360baaaa55799c53e3d2'),
    (0x6328A, 0x63296, 'JUNO region binding', '58370f8d54efe313d431ab4bd1141b1c7c8bd1512e83cc80f56da1cf7a6c9d6d'),
)


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def retained(path: str) -> Path:
    return REPO / 'restricted' / path.split('/restricted/', 1)[1]


def observe(path: Path) -> dict:
    r = Ram.load(path)
    return dict(sha256=r.sha256, frame=r.word(0x7180), ticks=r.long(0x53094),
        selector=r.word(0x7142), craft=r.sword(0x7144), body=r.word(0x713C),
        floor=r.word(0x7138), group=r.word(0x6FDE), cell=r.word(0x71F4),
        eye=[r.slong(a) for a in (0x7146, 0x714A, 0x714E)],
        system=[r.slong(a) for a in (0x702A, 0x702E, 0x7032)],
        yaw=r.word(0x7156), pitch=r.word(0x7154), speed=r.long(0x700A),
        arrivalHold=r.word(0x71A2), nearest=r.long(0x6FB6), range=r.long(0x6FAE),
        playback=r.word(0x70A2), pendingFailure=r.word(0x70F8),
        stack=list(r.bytes(0x563E, 0x563E+r.word(0x563C))),
        selectedKey=r.long(0x71DA), selectedSlot=r.long(0x71DE)//4,
        programmeRequest=r.word(0x6FF48), programmeCursor=r.long(0x6E88),
        programmeTimer=r.word(0x6E86), spawnBudget=r.word(0x6E8C),
        pairCounts=[r.byte(a) for a in range(0x6E50, 0x6E84, 2)],
        shieldState=r.byte(0x6722), shieldCount=r.word(0x6ECA),
        shotStates=[r.word(0x5492+4*s) for s in range(50, 60)],
        actors=[dict(slot=s, xyz=[r.slong(a+4*s) for a in (0x581C, 0x5C1C, 0x601C)],
                     residence=list(r.bytes(0x681C+4*s, 0x6820+4*s)),
                     model=r.word(r.long(0x4BD10)+2*s)) for s in range(56, 60)],
        soundPriority=r.word(0x7110), bVector=r.long(0x4BF54), cVector=r.long(0x4BF58),
        clockSeconds=r.long(0x6FCE), clockDay=r.word(0x6FD2),
        scriptPc=r.long(0x6EDA), scriptQueue=r.word(0x711C),
        flags=list(r.bytes(0x7270, 0x7278)), rngCursor=r.long(0x75A6))


def traces(path: Path) -> list[dict]:
    rows, current = [], None
    for line in path.read_text(errors='replace').splitlines():
        label = re.match(r'^(\w+)= .*#(\d+) \(dec\)', line)
        if label:
            current = dict(label=label[1], vbl=int(label[2]), memory={}) if label[1] in LABELS else None
            if current is not None:
                rows.append(current)
        if current is None:
            continue
        memory = re.match(r'^([\da-fA-F]{8}): ((?:[\da-fA-F]{2} ){1,16})', line)
        if memory:
            current['memory'].update({int(memory[1], 16)+i: int(b, 16) for i, b in enumerate(memory[2].split())})
    for row in rows:
        memory = row.pop('memory')
        def v(a: int, n: int = 2) -> int:
            return int.from_bytes(bytes(memory[a+i] for i in range(n)), 'big')
        row.update(frame=v(0x7180), ticks=v(0x53094, 4), selector=v(0x7142), body=v(0x713C),
                   programmeRequest=v(0x6FF48), programmeCursor=v(0x6E88, 4),
                   pairCounts=[v(a, 1) for a in range(0x6E50, 0x6E84, 2)])
    return rows


def build(root: Path) -> dict:
    assertions = []
    def check(role: str, condition: bool) -> None:
        if not condition:
            raise AssertionError(role)
        assertions.append(role)
    source = Ram.load(REPO/'restricted/mercenary-iii-708/presentation/exact2/start.ram')
    check('coherent pinned mutable seed', source.sha256 == SOURCE)
    pins = [dict(role=role, **source.require(lo, hi, digest, role)) for lo, hi, role, digest in PINS]
    check('current Body scan endpoint is116', source.long(0x72AA) == 116)
    check('JUNO and TOLOSA encoded arrival extents', [source.long(0x5450+b) for b in (88, 100)] == [0x141F40, 0x101680])
    families = {}
    for name in FAMILIES:
        family = root/name
        manifest_path = family/'manifest.json'
        manifest = json.loads(manifest_path.read_text())
        initial = retained(manifest['source'])
        run = retained(manifest['run'])
        seed = Ram.load(initial.with_suffix('.ram'))
        check(f'{name}: complete source checkpoint', seed.sha256 == manifest['sourceRamSha256']
              and sha(initial.with_suffix('.sav')) == manifest['sourceSavSha256'])
        check(f'{name}: checkpoint phase', seed.word(0x7180) == manifest['baseFrame']
              and seed.word(0x53096) == manifest['baseTicks'])
        check(f'{name}: only original mailbox inputs', all(re.fullmatch(r'w \$(56726|7056) \$[\da-f]{2}', write)
              for _, writes in manifest['events'] for write in writes))
        check(f'{name}: actual generated input scripts', all((root/'scripts'/f'{name}-input-{manifest["baseFrame"]+offset}.ini').read_text().splitlines() == writes
              for offset, writes in manifest['events']))
        check(f'{name}: accepted atomic wait pins', manifest['waitSha256'] == '9f0f02ea22a98b4fe4556da86129ad571daa1805ae73e98cdf397b9e55d670eb'
              and manifest['patchSha256'] == '1ccd3989761d9bf69ad107d8f5a981714719fc232526c7b5246a0737cbfe705f')
        log = run/'hatari.log'
        rows = traces(log)
        tops = [r for r in rows if r['label'] == 'TOP']
        gaps = [b['ticks']-a['ticks'] for a, b in zip(tops, tops[1:])]
        check(f'{name}: original atomic cadence', bool(tops) and set(gaps) <= {0, 11}
              and all(b['frame']-a['frame'] == (0 if gap == 0 else 1) for a, b, gap in zip(tops, tops[1:], gaps)))
        cuts = {p.stem: observe(p) for p in sorted(family.glob('*.ram'))}
        for cut, observation in cuts.items():
            if re.fullmatch(r'f\d+', cut):
                check(f'{name}/{cut}: scheduled top', observation['frame'] == manifest['baseFrame']+int(cut[1:]))
            if (family/f'{cut}.sav').exists():
                observation['checkpointSha256'] = sha(family/f'{cut}.sav')
        debugger_files = [*run.glob('*.ini'), run/'ck.sav.debug',
                          *list((root/'scripts').glob(f'{name}-input-*.ini')),
                          *list((root/'scripts').glob(f'{name}-capture-*.ini')), root/'scripts'/f'{name}-end.ini']
        debugger_pins = sorted((str(p.resolve().relative_to(root.resolve())), sha(p)) for p in debugger_files)
        writes = []
        for path in debugger_files:
            for line in path.read_text().splitlines():
                if line.startswith('w '):
                    match = re.fullmatch(r'w \$(\w+) ((?:\$[\da-fA-F]{2} ?)+)', line)
                    if match is None:
                        raise AssertionError(f'{name}: unrecognized debugger write {line}')
                    writes.append((int(match[1], 16), bytes(int(b, 16) for b in match[2].replace('$', '').split())))
        check(f'{name}: no hidden state writes in generated debugger scripts', all(
            (address in (0x56726, 0x7056) and len(value) == 1)
            or (address == 0xF0000 and hashlib.sha256(value).hexdigest() == manifest['waitSha256'])
            or (address == 0x5A952 and hashlib.sha256(value).hexdigest() == manifest['patchSha256'])
            or (address == 0xF0100 and value == seed.word(0x53096).to_bytes(2, 'big'))
            or (address == 0x5301E and value == bytes([0, 11])) for address, value in writes))
        boundaries = [r for r in rows if r['label'] != 'TOP']
        families[name] = dict(classification='ordinary original mailbox input',
            source=str(initial.relative_to(REPO)), sourceRamSha256=seed.sha256,
            sourceCheckpointSha256=manifest['sourceSavSha256'], manifestSha256=sha(manifest_path),
            logSha256=sha(log), runDeadlineVbl=json.loads((run/'steps.json').read_text())[-1][0],
            generatedDebuggerDigest=hashlib.sha256(json.dumps(debugger_pins, separators=(',', ':')).encode()).hexdigest(),
            scheduledInputs=manifest['events'], captures=cuts,
            missingScheduledCaptures=[f'f{n}' for n in manifest['captures'] if f'f{n}' not in cuts],
            topCount=len(tops), tickGapCounts={str(g): gaps.count(g) for g in sorted(set(gaps))},
            boundaryCounts={label: sum(r['label'] == label for r in boundaries) for label in LABELS[1:]},
            boundaries=[r for r in boundaries if r['label'] not in ('FIRE_ACCEPT', 'HOSTILE_SHOT')],
            arrivalSurfaceTops=[top for top in tops if top['selector'] == 0 and any(r['label'] == 'BODY_ENTER' and r['frame'] == top['frame'] and r['ticks'] == top['ticks'] for r in boundaries)],
            firstFire=next((r for r in boundaries if r['label'] == 'FIRE_ACCEPT'), None),
            firstHostileShot=next((r for r in boundaries if r['label'] == 'HOSTILE_SHOT'), None))
    def cap(name: str, cut: str) -> dict:
        return families[name]['captures'][cut]
    prior = json.loads((REPO/'research/mercenary-iii-st/object-interaction-r3-followup.json').read_text())
    check('route continues ordinary R3 space checkpoint', families['orient-fine']['sourceRamSha256'] == prior['families']['native-return']['captures']['f230']['sha256'])
    check('ordinary straight approach reaches JUNO', cap('cruise2', 'f180')['body'] == 88
          and cap('cruise2', 'f180')['selector'] == 0 and cap('cruise2', 'f180')['programmeRequest'] == 0)
    check('no initial persistent JUNO residents', all(source.byte(0x681C+4*slot) != 88 for slot in range(1, 247)))
    check('first TOLOSA approach remains unarrived', cap('arrival', 'f90')['selector'] == 2)
    check('ordinary manual TOLOSA arrival and passive setup', cap('arrival2', 'f30')['body'] == 100
          and cap('arrival2', 'f30')['selector'] == 0 and cap('arrival2', 'f30')['craft'] == 3
          and cap('arrival2', 'f30')['playback'] == 0 and cap('arrival2', 'f30')['programmeRequest'] == 1
          and cap('arrival2', 'f30')['pairCounts'][:2] == [3, 7])
    check('level firing naturally kills two passives', cap('fire', 'f80')['pairCounts'][0] == 3
          and cap('fire', 'f100')['pairCounts'][0] == 2 and cap('fire', 'f200')['pairCounts'][0] == 1
          and families['fire']['boundaryCounts']['KILL_ACCOUNT'] == 2)
    check('ordinary aiming kills final passive and advances programme', cap('fire-aim', 'f20')['pairCounts'][0] == 1
          and cap('fire-aim', 'f30')['pairCounts'][:2] == [0, 7]
          and cap('fire-aim', 'f30')['programmeRequest'] == 255
          and cap('fire-aim', 'f30')['programmeCursor'] == 0x6E52
          and families['fire-aim']['boundaryCounts']['PROGRAMME_NEXT'] == 1)
    check('natural hostile launch and incoming hit reach unshielded failure',
          families['fire-aim']['boundaryCounts']['HOSTILE_SHOT'] > 0
          and families['fire-aim']['boundaryCounts']['INCOMING_HIT'] == 1
          and cap('fire-aim', 'failure')['pendingFailure'] == 1
          and cap('fire-aim', 'failure')['shieldState'] & 128 == 0
          and cap('fire-aim', 'failure')['programmeRequest'] == 0)
    check('three natural kills leave87 global programme units', sum(cap('fire-aim', 'failure')['pairCounts']) == 87)
    replays = []
    for original, repeat, pairs in (
            ('fire', 'fire-repeat2', [(100,20),(150,70),(200,120),(250,170),(300,220),(350,270),(400,320),(450,370),(500,420),(550,470),(600,520),(601,521),(620,540)]),
            ('arrival2', 'arrival-repeat', [(30,5),(40,15),(50,25),(60,35)]),
            ('fire-aim', 'aim-repeat', [(30,10),(50,30),(60,40),(72,52),(80,60),(100,80)])):
        for a, b in pairs:
            check(f'{original}/{a} restored as {repeat}/{b}', cap(original, f'f{a}')['sha256'] == cap(repeat, f'f{b}')['sha256'])
        replays.append(dict(original=original, repeat=repeat, matchingRamCuts=len(pairs)))
    for name in ('aim-repeat', 'hit-repeat'):
        check(f'{name}: full failure RAM matches original', cap(name, 'failure')['sha256'] == cap('fire-aim', 'failure')['sha256'])
        replays.append(dict(original='fire-aim/failure', repeat=name+'/failure', matchingRamCuts=1))
    for key in ('model-03108a', 'model-031140'):
        model = prior['immutableModels'][key]
        record = model['sourceRecord']
        lo, hi = (int(a[1:], 16) for a in record['range'])
        pin = source.require(lo, hi, record['sha256'], key)
        path = REPO/model['recoveryFile']
        check(f'{key}: exact inherited immutable recovery', sha(path) == model['recoveryFileSha256']
              and pin in json.loads(path.read_text())['geometry']['provenance'])
    known = {observation['sha256'] for family in families.values() for observation in family['captures'].values()}
    root_hash = prior['families']['native-return']['captures']['f230']['sha256']
    check('all continuations use retained route cuts', all(family['sourceRamSha256'] in known | {root_hash} for family in families.values()))
    return dict(issue=778, kind='native-eagle-natural-encounters', sourceSha256=SOURCE, sourcePins=pins,
                harnessSha256=sha(REPO/'restricted/mercenary-iii-770/harness.py'), currentRecipeSha256=sha(root/'probe.py'),
                immutableModels={key: prior['immutableModels'][key] for key in ('model-03108a', 'model-031140')},
                families=families, restoredFutures=replays, assertions=assertions,
                limits=['No runtime, content admission or browser Save proof',
                        'Current recipe hash is not a historical execution claim; generated debugger/log pins own each run',
                        'Mailbox writes use retained eleven-tick wait instrumentation, not physical IKBD input'])


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--evidence', type=Path, default=RAW)
    parser.add_argument('--out', type=Path, default=REPO/'research/mercenary-iii-st/eagle-natural-encounters.json')
    args = parser.parse_args()
    ledger = build(args.evidence.resolve())
    args.out.write_text(json.dumps(ledger, indent=2)+'\n')
    print(f'{len(ledger["assertions"])} assertions across {len(ledger["families"])} ordinary families')
