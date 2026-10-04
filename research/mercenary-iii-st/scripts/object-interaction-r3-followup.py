"""Read-only #772 ordinary routes and separately classified native controls."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

from m3lab.ram import Ram

REPO = Path(__file__).resolve().parents[3]
SOURCE = '71b957b3b7124959b01bd40b896c921d37902c18cfca042bef1906b155ef0170'
RAW = REPO / 'restricted/mercenary-iii-772/followup'
OUT = REPO / 'research/mercenary-iii-st/object-interaction-r3-followup.json'
ORDINARY = ('blue-leg1', 'blue-leg2', 'blue-leg3', 'blue-actions', 'blue-repeat', 'native-return',
            'native-return-fast', 'native-return-repeat')
CONTROLS = ('hit-absent', 'hit-held-empty', 'hit-held-two', 'kill-passive',
            'kill-fleet-zero', 'fire-candidacy')
PINS = (
    (0x53D32, 0x53F70, 'nearest Body and arrival', '03f3a88a82ccb68a1859c5716973f9a0235979b1ef348eacd2320913dbc66a7d'),
    (0x5A15E, 0x5A27C, 'Body entry', '47b7defe0811a15336c0ba84a60e6ac36c97348eec11f5462bf5d482502154c1'),
    (0x4EF02, 0x4F01C, 'manual coordinate conversion', '7a236fa825eea0995697ec022aa24f746011f4b0d3710f812c6890242a014561'),
    (0x510EC, 0x511A8, 'kill accounting', '2e4e32bf3bb7541413b9b08812c3ac3e48a77ad9554e9d44e51f8a740316357c'),
    (0x523E0, 0x52448, 'encounter request', '9fd5691782815bcea3c23c6530dad09f584571007ec3d9d63ccd137286fc9e6c'),
    (0x52056, 0x520CC, 'model and trajectory selection', '63599d19b0d725a7a2298f3575a392b8a9f2c708e3f65a9387ac6446e7c05c75'),
    (0x520CC, 0x522BA, 'actor spawn', '006bed7f09b2577fdc7cdfc758af5f52813ba709b4a16abec9255e1608572525'),
    (0x52448, 0x52546, 'hostile launch and hit', 'd955286f3ea2e74a3527cc09189b42f02637f3bc2818b61bc4b327010b1fc55d'),
    (0x52964, 0x52978, 'global count sum', '978d32630f60010a6e394d040b093e3963bf24dfd2200780c8ad0b0b00244c59'),
    (0x567AE, 0x567DE, 'candidacy Enter', 'e007c69138749659a2caf2d18545a110e03d8b1e1b8a184615270e24af8b42ea'),
    (0x52FC8, 0x52FE0, 'model swap B', '30d377706eef4f45825fc91e1b4b1a133fbc9fb0118c7f701e9b054abacfbdff'),
    (0x5532E, 0x55354, 'axis box', '074be82f6b42b019ffbcedba7daae670384559339e6d2e4ef692179c6e3d372b'),
)
LABELS = ('TOP', 'TAKE', 'TAKE_ACCEPT', 'DROP', 'DROP_ACCEPT', 'REFUSAL_STRING',
          'ARRIVAL_ARM', 'BODY_ENTER', 'BODY_ROTATION', 'BODY_X_STORE',
          'KILL_ACCOUNT', 'PROGRAMME_NEXT', 'FLEET_SCRIPT', 'FIRE_ACCEPT',
          'INCOMING_HIT', 'HIT_FAILURE', 'HIT_SHIELD', 'SCRIPT_REQUEST', 'MODEL_SWAP_B')


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def retained(path: str) -> Path:
    """Resolve retained main-checkout paths through this checkout's links."""
    return REPO / 'restricted' / path.split('/restricted/', 1)[1]


def observe(path: Path) -> dict:
    r = Ram.load(path)
    return dict(sha256=r.sha256, frame=r.word(0x7180), ticks=r.long(0x53094),
        selector=r.word(0x7142), craft=r.sword(0x7144), body=r.word(0x713C),
        floor=r.word(0x7138), group=r.word(0x6FDE), cell=r.word(0x71F4),
        eye=[r.slong(a) for a in (0x7146, 0x714A, 0x714E)], yaw=r.word(0x7156),
        selectedKey=r.long(0x71DA), selectedSlot=r.long(0x71DE)//4,
        stack=list(r.bytes(0x563E, 0x563E+r.word(0x563C))),
        system=[r.slong(a) for a in (0x702A, 0x702E, 0x7032)],
        arrivalHold=r.word(0x71A2), nearest=r.long(0x6FB6), range=r.long(0x6FAE),
        playback=r.word(0x70A2), pendingFailure=r.word(0x70F8),
        shieldState=r.byte(0x6722), shieldCount=r.word(0x6ECA),
        shotStates={str(s): r.word(0x5492+4*s) for s in (50, 53, 56)},
        soundPriority=r.word(0x7110), bVector=r.long(0x4BF54),
        card=list(r.bytes(0x6F0E, 0x6F12)), reveal=r.word(0x53950),
        selectedSection=r.word(0x6F04), activeDescription=r.word(0x6F06),
        blueLocators={str(s): r.byte(0x641E+4*s) for s in (40, 41)},
        pairCounts=[r.byte(a) for a in range(0x6E50, 0x6E84, 2)],
        programmeRequest=r.word(0x6FF48), programmeCursor=r.long(0x6E88),
        flags=list(r.bytes(0x7270, 0x7278)), scriptQueue=r.word(0x711C),
        scriptPc=r.long(0x6EDA), availability={str(s): r.byte(0x7352+s) for s in (18, 129)},
        modelWords={str(s): r.word(r.long(0x4BD10)+2*s) for s in (97, 218)},
        blue=dict(state=r.byte(0x66D6), group=r.byte(0x66D5), zone=r.byte(0x66D7), residence=list(r.bytes(0x6AD4, 0x6AD8)),
                  xyz=[r.slong(a+4*174) for a in (0x581C, 0x5C1C, 0x601C)]))


def traces(path: Path) -> list[dict]:
    rows, current = [], None
    for line in path.read_text(errors='replace').splitlines():
        label = re.match(r'^(\w+)= .*#(\d+) \(dec\)', line)
        if label:
            current = {'label': label[1], 'vbl': int(label[2]), 'memory': {}, 'registers': {}} if label[1] in LABELS else None
            if current is not None:
                rows.append(current)
        if current is None:
            continue
        for register, value in re.findall(r'\b([DA][0-7]) ([0-9A-F]{8})\b', line):
            current['registers'][register] = int(value, 16)
        memory = re.match(r'^([\da-fA-F]{8}): ((?:[\da-fA-F]{2} ){1,16})', line)
        if memory:
            for offset, byte in enumerate(memory[2].split()):
                current['memory'][int(memory[1], 16)+offset] = int(byte, 16)
    for row in rows:
        mem = row.pop('memory')
        def v(a: int, n: int = 2) -> int:
            return int.from_bytes(bytes(mem[a+i] for i in range(n)), 'big')
        row.update(frame=v(0x7180), ticks=v(0x53094, 4))
        if row['label'] == 'TOP':
            row.update(selector=v(0x7142), selectedKey=v(0x71DA, 4),
                       selectedSlot=v(0x71DE, 4)//4,
                       eye=[v(a, 4) for a in (0x7146, 0x714A, 0x714E)])
        if row['label'] in ('ARRIVAL_ARM', 'BODY_ENTER', 'BODY_ROTATION', 'BODY_X_STORE'):
            row.update(selector=v(0x7142), range=v(0x6FAE, 4), request=v(0x6FB2, 4),
                       playback=v(0x70A2), system=[v(a, 4) for a in (0x702A, 0x702E, 0x7032)])
            if row['label'] in ('BODY_ROTATION', 'BODY_X_STORE') and 0x5796 in mem:
                row['bodyRotation'] = v(0x5796)
        if row['label'] in ('TAKE', 'DROP', 'REFUSAL_STRING', 'SCRIPT_REQUEST'):
            row['requestD1'] = row['registers']['D1']
        if row['label'] in ('TAKE', 'DROP', 'TAKE_ACCEPT', 'DROP_ACCEPT', 'REFUSAL_STRING'):
            row.update(selectedKey=v(0x71DA, 4), selectedSlot=v(0x71DE, 4)//4,
                       eye=[v(a, 4) for a in (0x7146, 0x714A, 0x714E)])
    return rows


def build(root: Path) -> dict:
    assertions = []
    def check(name: str, condition: bool) -> None:
        if not condition:
            raise AssertionError(name)
        assertions.append(name)
    source = Ram.load(REPO / 'restricted/mercenary-iii-708/presentation/exact2/start.ram')
    check('coherent mutable seed', source.sha256 == SOURCE)
    pins = [dict(role=role, **source.require(lo, hi, digest, role)) for lo, hi, role, digest in PINS]
    check('exact hexadecimal thresholds', [source.long(a) for a in (0x51104, 0x5245E, 0x524CC)] == [384, 12288, 64])
    counts = [source.byte(a) for a in range(0x6E50, 0x6E84, 2)]
    check('initial fleet and TOLOSA programme', sum(counts) == 90 and list(source.bytes(0x6E50, 0x6E54)) == [3, 1, 7, 255])
    models = {}
    for key, lo, hi, digest in (
            ('model-03108a', 0x3108A, 0x3112B, '8d3ce818979654bedf0444fed47b811ca533aa042d6ef0e962036e3fe911a8fe'),
            ('model-031140', 0x31140, 0x313DD, 'a201422804b50526076e22e4981c3b96c123753f0bc13ce40e895c2d35c86f62'),
            ('model-032822', 0x32822, 0x328D7, '24710ba680237a36d14320e2a559ff2c66fa1324568e0d4159afaa9aba6190c8')):
        path = REPO / f'payload/dion/catalogue/geometry/{key}.json'
        record = json.loads(path.read_text())
        pin = source.require(lo, hi, digest, key)
        check(f'{key}: immutable recovery record', pin in record['geometry']['provenance'])
        models[key] = dict(sourceRecord=pin, recoveryFile=str(path.relative_to(REPO)), recoveryFileSha256=sha(path))
    families = {}
    for name in (*ORDINARY, *CONTROLS):
        family = root / name
        manifest_path = family / 'manifest.json'
        manifest = json.loads(manifest_path.read_text())
        initial = retained(manifest['source'])
        log = retained(manifest['run']) / 'hatari.log'
        check(f'{name}: complete checkpoint source', sha(initial.with_suffix('.ram')) == manifest['sourceRamSha256']
              and sha(initial.with_suffix('.sav')) == manifest['sourceSavSha256'])
        seed = Ram.load(initial.with_suffix('.ram'))
        check(f'{name}: checkpoint frame/tick identity', seed.word(0x7180) == manifest['baseFrame']
              and seed.word(0x53096) == manifest['baseTicks'])
        check(f'{name}: generated input scripts match declared writes', all(
            (root/'scripts'/f'{name}-input-{manifest["baseFrame"]+offset}.ini').read_text().splitlines() == writes
            for offset, writes in manifest['events']))
        run = log.parent
        debugger_files = [*run.glob('*.ini'), run/'ck.sav.debug',
                          *list((root/'scripts').glob(f'{name}-input-*.ini')),
                          *list((root/'scripts').glob(f'{name}-capture-*.ini')), root/'scripts'/f'{name}-end.ini']
        debugger_pins = sorted((str(p.resolve().relative_to(root.resolve())), sha(p)) for p in debugger_files)
        check(f'{name}: accepted wait/patch', manifest['waitSha256'] == '9f0f02ea22a98b4fe4556da86129ad571daa1805ae73e98cdf397b9e55d670eb'
              and manifest['patchSha256'] == '1ccd3989761d9bf69ad107d8f5a981714719fc232526c7b5246a0737cbfe705f')
        if name in ORDINARY:
            check(f'{name}: only original input writes', all(re.fullmatch(r'w \$(56726|7056) \$[\da-f]{2}', w)
                  for _, writes in manifest['events'] for w in writes))
        else:
            check(f'{name}: explicitly synthetic', manifest['classification'] == 'synthetic conditional native boundary')
        rows = traces(log)
        tops = [r for r in rows if r['label'] == 'TOP']
        gaps = [b['ticks']-a['ticks'] for a, b in zip(tops, tops[1:])]
        check(f'{name}: atomic cadence and same-frame reentries', bool(tops) and set(gaps) <= {0, 11}
              and all(b['frame']-a['frame'] == (0 if gap == 0 else 1) for a, b, gap in zip(tops, tops[1:], gaps)))
        caps = {p.stem: observe(p) for p in sorted(family.glob('*.ram'))}
        for cut, observation in caps.items():
            if cut != 'end':
                check(f'{name}/{cut}: scheduled original top', observation['frame'] == (manifest['baseFrame']+int(cut[1:])) % 65536)
            checkpoint = family / f'{cut}.sav'
            if checkpoint.exists():
                observation['checkpointSha256'] = sha(checkpoint)
        families[name] = dict(classification='ordinary original input' if name in ORDINARY else manifest['classification'],
            source=str(initial.relative_to(REPO)), sourceRamSha256=manifest['sourceRamSha256'],
            sourceCheckpointSha256=manifest['sourceSavSha256'], manifestSha256=sha(manifest_path), logSha256=sha(log),
            runDeadlineVbl=json.loads((run/'steps.json').read_text())[-1][0],
            generatedDebuggerFiles=len(debugger_pins),
            generatedDebuggerDigest=hashlib.sha256(json.dumps(debugger_pins, separators=(',', ':')).encode()).hexdigest(),
            scheduledInputs=manifest['events'], captures=caps,
            missingScheduledCaptures=[f'f{n}' for n in manifest['captures'] if f'f{n}' not in caps],
            topCount=len(tops), tickGapCounts={str(g): gaps.count(g) for g in sorted(set(gaps))},
            sameFrameReentries=[dict(before=a, after=b) for a, b in zip(tops, tops[1:]) if a['ticks'] == b['ticks']],
            arrivalSurfaceTops=[top for top in tops if top['selector'] == 0 and any(r['label'] == 'BODY_ENTER' and r['frame'] == top['frame'] and r['ticks'] == top['ticks'] for r in rows)],
            selectedSlots=sorted({r['selectedSlot'] for r in tops}),
            actionBoundaries=[r for r in rows if r['label'] != 'TOP'])
    def cap(name: str, cut: str) -> dict:
        return families[name]['captures'][cut]
    check('BLUE acquired by original Take', cap('blue-leg3', 'f3441')['stack'] == [174, 104, 103, 135]
          and cap('blue-leg3', 'f3440')['selectedSlot'] == 174 and cap('blue-leg3', 'f3441')['blue']['state'] & 128 != 0)
    check('BLUE continuation has coherent outward transport prefix', families['blue-leg1']['sourceRamSha256'] == 'b5dbaaf62840925bfa6b94393334157e50baa80dc932f6419d7eb482f8388db6')
    r4 = json.loads((REPO/'research/mercenary-iii-st/eagle-flight-routes.json').read_text())
    check('manual return starts at retained ordinary R4 space cut', families['native-return']['sourceRamSha256'] == r4['families']['space']['captures']['f100']['sha256'])
    for a, b in ((100, 3415), (101, 3416), (125, 3440), (126, 3441), (145, 3460)):
        check(f'BLUE final approach replay {a}/{b}', cap('blue-repeat', f'f{a}')['sha256'] == cap('blue-leg3', f'f{b}')['sha256'])
    check('manual METIS return retains craft identity', cap('native-return-repeat', 'f18')['selector'] == 2
          and cap('native-return-repeat', 'f19')['selector'] == 0 and cap('native-return-repeat', 'f20')['body'] == 60
          and cap('native-return-repeat', 'f20')['craft'] == 3 and cap('native-return-repeat', 'f20')['playback'] == 0)
    check('BLUE natural direct Drop/re-pick', cap('blue-actions', 'f91')['stack'] == [104, 103, 135]
          and cap('blue-actions', 'f91')['blue']['residence'] == [100, 0, 0, 65]
          and cap('blue-actions', 'f91')['blue']['xyz'] == [179479186, 0, 103251839]
          and cap('blue-actions', 'f121')['stack'] == [174, 104, 103, 135])
    check('BLUE head commands preserve unrelated TAXICARD descriptor and locator states',
          all(cap('blue-actions', c)['card'] == [104, 5, 4, 0] and cap('blue-actions', c)['blueLocators'] == cap('blue-actions', 'f20')['blueLocators']
              for c in ('f51', 'f61', 'f91', 'f121', 'f140')))
    repeat = families['native-return-repeat']
    common = ('f1', 'f2', 'f10', 'f20', 'f30')
    check('manual return independent replay matches all five common RAM cuts', all(cap('native-return-fast', c)['sha256'] == cap('native-return-repeat', c)['sha256'] for c in common))
    rotation = next(r for r in repeat['actionBoundaries'] if r['label'] == 'BODY_ROTATION')
    store = next(r for r in repeat['actionBoundaries'] if r['label'] == 'BODY_X_STORE')
    x = (rotation['registers']['D0']-rotation['bodyRotation'])*4*65536
    first = repeat['arrivalSurfaceTops'][0]
    check('manual arrival subtracts live Body phase before same-frame surface top',
          rotation['bodyRotation'] == 160 and x == store['registers']['D0'] == first['eye'][0] == 7077888
          and first['frame'] == rotation['frame'] == 1012 and first['selector'] == 0)
    for name in ('hit-absent', 'hit-held-empty'):
        check(f'{name}: actual incoming hit and failure', cap(name, 'f11')['pendingFailure'] == 1
              and cap(name, 'f11')['shotStates']['53'] == 0
              and any(r['label'] == 'HIT_FAILURE' for r in families[name]['actionBoundaries']))
    check('held shield decrements and preserves retained f40 future', cap('hit-held-two', 'f11')['shieldCount'] == 1
          and cap('hit-held-two', 'f40')['shieldCount'] == 1 and cap('hit-held-two', 'f40')['pendingFailure'] == 0)
    check('synthetic final passive kill advances to hostile next pair', cap('kill-passive', 'f11')['pairCounts'][:2] == [0, 7]
          and cap('kill-passive', 'f11')['programmeRequest'] == 255
          and cap('kill-passive', 'f11')['programmeCursor'] == 0x6E52)
    for name, script, entry in (('kill-fleet-zero', 129, 0x761EC), ('fire-candidacy', 18, 0x757A5)):
        check(f'{name}: original request and scheduler entry', any(r['label'] == 'SCRIPT_REQUEST' and r['requestD1'] & 65535 == script for r in families[name]['actionBoundaries'])
              and cap(name, 'f11')['availability'][str(script)] == 32 and cap(name, 'f11')['scriptPc'] == entry)
    return dict(issue=772, kind='dion-r3-research-followup', sourceSha256=SOURCE, sourcePins=pins,
        harnessSha256=sha(REPO/'restricted/mercenary-iii-770/harness.py'),
        probeSha256=sha(root/'probe.py'), syntheticControlsSha256=sha(root/'combat.py'),
        initialFleetCount=sum(counts), immutableModels=models, families=families, assertions=assertions,
        limits=['No content promotion or reviewed delivery whitelist',
                'Synthetic native fixtures do not establish ordinary encounter/candidacy/fleet access',
                'Missing scheduled captures are explicit; failure loops and the early walk limit are not complete futures',
                'Original mailbox input with accepted wait instrumentation, not physical IKBD or browser Save'])


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--evidence', type=Path, default=RAW)
    parser.add_argument('--out', type=Path, default=OUT)
    args = parser.parse_args()
    args.out.write_text(json.dumps(build(args.evidence.resolve()), indent=2)+'\n')
