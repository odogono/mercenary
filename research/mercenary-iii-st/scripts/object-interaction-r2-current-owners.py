"""Verify new ordinary BLUE/landed-EAGLE ACME controls; export numeric evidence."""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re

from m3lab.ram import Ram

spec = importlib.util.spec_from_file_location('expanded_r2', Path(__file__).with_name('object-interaction-r2-expanded-owners.py'))
owners = importlib.util.module_from_spec(spec)
spec.loader.exec_module(owners)
REPO = owners.REPO
RAW = REPO / 'restricted/mercenary-iii-771/current-owners'
OUT = REPO / 'research/mercenary-iii-st/object-interaction-r2-current-owners.json'
FAMILIES = ('blue', 'blue-replay', 'acme-native', 'acme-replay', 'acme-recovery', 'acme-recovery-replay')
# Reuse the existing full-width trace reader with this probe's explicit markers.
trace_reader = owners.module('current_owner_trace', 'object-interaction-r3-followup.py')
trace_reader.LABELS = tuple(dict.fromkeys((*trace_reader.LABELS, *owners.native.owners.LABELS, 'LIFE_SUPPORT')))


def audit() -> dict:
    assertions = []
    def check(name: str, condition: bool) -> None:
        if not condition:
            raise AssertionError(name)
        assertions.append(name)
    source = Ram.load(owners.native.owners.SOURCE)
    check('coherent source', source.sha256 == owners.native.owners.SOURCE_SHA)
    pins = [dict(role=role, **source.require(lo, hi, digest, role)) for lo, hi, role, digest in owners.PINS]
    prior = {}
    for key, observer, root, filename in (
            ('r3', owners.r3, owners.r3.RAW, 'object-interaction-r3-followup.json'),
            ('r4', owners.native.eagle, owners.native.RAW, 'eagle-flight-routes.json')):
        prior[key] = observer.build(root.resolve())
        check(key + ' parent ledger regenerates exactly',
              prior[key] == json.loads((REPO/'research/mercenary-iii-st'/filename).read_text()))
    check('unchanged R1 harness', owners.r3.sha(REPO/'restricted/mercenary-iii-770/harness.py') == owners.native.owners.HARNESS_SHA)
    families, rows_by_family = {}, {}
    for name in FAMILIES:
        directory = RAW/name
        manifest = json.loads((directory/'manifest.json').read_text())
        origin = owners.r3.retained(manifest['source'])
        seed = Ram.load(origin.with_suffix('.ram'))
        run = owners.r3.retained(manifest['run'])
        check(name + ' source/checkpoint identity', seed.sha256 == manifest['sourceRamSha256']
              and owners.r3.sha(origin.with_suffix('.sav')) == manifest['sourceSavSha256'])
        check(name + ' accepted instrumentation', manifest['cpu'] == 32
              and manifest['waitSha256'] == owners.native.owners.WAIT_SHA
              and manifest['patchSha256'] == owners.native.owners.PATCH_SHA
              and (manifest['baseFrame'], manifest['baseTicks']) == (seed.word(0x7180), seed.word(0x53096)))
        check(name + ' only original event inputs', all(re.fullmatch(r'w \$(56726|7056) \$[\da-f]{2}', line)
              for _, commands in manifest['events'] for line in commands))
        check(name + ' generated event scripts', all(
              (RAW/'scripts'/f'{name}-input-{manifest["baseFrame"]+offset}.ini').read_text().splitlines() == commands
              for offset, commands in manifest['events']))
        files = [*run.glob('*.ini'), run/'ck.sav.debug',
                 *list((RAW/'scripts').glob(f'{name}-input-*.ini')),
                 *list((RAW/'scripts').glob(f'{name}-capture-*.ini')), RAW/'scripts'/f'{name}-end.ini']
        for path in files:
            for line in path.read_text().splitlines():
                if not line.startswith('w '):
                    continue
                match = re.fullmatch(r'w \$(\w+) ((?:\$[\da-fA-F]{2} ?)+)', line)
                check(name + ' recognized debugger write', match is not None)
                owners.verify_write(int(match[1], 16), bytes(int(b, 16) for b in match[2].replace('$', '').split()), seed.word(0x53096))
        debugger_pins = sorted([str(p.resolve().relative_to(RAW.resolve())), owners.r3.sha(p)] for p in files)
        rows = trace_reader.traces(run/'hatari.log')
        rows_by_family[name] = rows
        tops = [r for r in rows if r['label'] == 'TOP']
        check(name + ' original eleven-tick full-width cadence', len(tops) > 1 and all(
              (b['frame']-a['frame'], b['ticks']-a['ticks']) == (1, 11) for a, b in zip(tops, tops[1:])))
        ticks = {r['frame']: r['ticks'] for r in tops}
        check(name + ' within-frame tick agreement', all(r['ticks'] == ticks[r['frame']]
              for r in rows if r['frame'] in ticks))
        captures = {}
        for path in sorted(directory.glob('*.ram')):
            r = Ram.load(path)
            for lo, hi, role, digest in owners.PINS:
                r.require(lo, hi, digest, name+'/'+path.stem+' '+role)
            state = owners.observe(r)
            check(name+'/'+path.stem+' recorded top', state['ticks'] == ticks[state['frame']])
            if path.stem.startswith('f'):
                offset = int(path.stem[1:])
                check(name+'/'+path.stem+' scheduled frame/tick',
                      state['frame'] == seed.word(0x7180)+offset and state['ticks'] == seed.long(0x53094)+11*offset)
            check(name+'/'+path.stem+' inherited panel and held exception', state['card'] == [104,5,4,0]
                  and state['objectStates']['38'] & 128 != 0 and 38 not in state['stack'])
            captures[path.stem] = dict(**state, selectedSlot=r.long(0x71DE)//4, selectedKey=r.long(0x71DA),
                acmeResidence=list(r.bytes(0x6A38, 0x6A3C)), blueResidence=list(r.bytes(0x6AD4, 0x6AD8)))
        check(name+' all positive scheduled cuts', {int(c[1:]) for c in captures if c.startswith('f')}
              == {n for n in manifest['captures'] if n > 0})
        families[name] = dict(classification='ordinary original mailbox input',
            baseFrame=manifest['baseFrame'],
            source=str(origin.relative_to(REPO)), sourceRamSha256=seed.sha256,
            sourceCheckpointSha256=manifest['sourceSavSha256'], manifestSha256=owners.r3.sha(directory/'manifest.json'),
            logSha256=owners.r3.sha(run/'hatari.log'), generatedDebuggerFiles=debugger_pins,
            generatedDebuggerDigest=hashlib.sha256(json.dumps(debugger_pins, separators=(',', ':')).encode()).hexdigest(),
            events=manifest['events'], captures=captures, topCount=len(tops), elevenTickGaps=len(tops)-1,
            actionOrder=[dict(frame=r['frame'], ticks=r['ticks'], label=r['label'],
                             **({'requestD1': r['requestD1'] & 65535} if 'requestD1' in r else {})) for r in rows
                         if r['label'] not in ('TOP','LAMP','LAMP_RESULT','LIFE_SUPPORT','MODE_HELPER','PANEL_KEY')])
    cap = lambda name, cut: families[name]['captures'][cut]
    check('BLUE source is ordinary R3 re-pick', families['blue']['sourceRamSha256'] == prior['r3']['families']['blue-actions']['captures']['f121']['sha256'])
    check('ACME source is ordinary R4 landed/re-boarded EAGLE', families['acme-native']['sourceRamSha256'] == prior['r4']['families']['landing']['captures']['f300']['sha256'])
    for name in FAMILIES[1:]:
        if name == 'acme-native':
            continue
        check(name+' retained control source', any(families[name]['sourceRamSha256'] == c['sha256']
              for f in families.values() for c in f['captures'].values()))
    blue = families['blue']['captures']
    check('BLUE held/Drop/re-pick and partial scroll', blue['f21']['objectStates']['174'] == 4
          and blue['f61']['objectStates']['174'] == 132 and blue['f61']['stack'][0] == 174
          and [blue[c]['scroll'] for c in ('f21','f25','f61','f70')] == [5,0,-5,0])
    lamps = [r for r in rows_by_family['blue'] if r['label'] == 'LAMP_RESULT' and r['registers']['D0'] & 65535 == 4*174]
    check('placed BLUE executes locator-absent lamp branch', len(lamps) == 40
          and all(r['registers']['D1'] & 65535 == 1 for r in lamps)
          and all(blue[c]['objectStates']['40'] & 128 == 0 for c in blue))
    families['blue']['lampResults'] = [dict(frame=r['frame'], ticks=r['ticks'], value=r['registers']['D1'] & 65535) for r in lamps]
    check('ACME rotations select135 without rewriting held/card', cap('acme-native','f31')['stack'] == [135,181,104,103])
    check('native ACME Drop keeps occupancy and retained zone', cap('acme-native','f51')['acmeWord'] == 0x0408
          and cap('acme-native','f51')['stack'] == [181,104,103] and cap('acme-native','f51')['selector'] == 0
          and cap('acme-native','f51')['craftSlot'] == 3 and cap('acme-native','f51')['pendingAlarmOrFailure'] == 0)
    check('Leave without ACME enters foot warning and alarm', cap('acme-native','f71')['selector'] == 1
          and cap('acme-native','f71')['warning'] == 6 and cap('acme-native','f71')['pendingAlarmOrFailure'] == 0x8000)
    check('first re-Take selects craft and retains missing ACME', cap('acme-native','f91')['selectedSlot'] == 3
          and cap('acme-native','f91')['acmeWord'] == 0x0408)
    check('Board clears foot warning while ACME remains placed', cap('acme-recovery','f11')['selector'] == 0
          and cap('acme-recovery','f11')['acmeWord'] == 0x0408 and cap('acme-recovery','f11')['warning'] == 0
          and cap('acme-recovery','f11')['pendingAlarmOrFailure'] == 0)
    check('ordinary recovery selects135 then re-picks and clears alarm', cap('acme-recovery','f110')['selectedSlot'] == 135
          and cap('acme-recovery','f111')['acmeWord'] == 0x8408 and cap('acme-recovery','f111')['stack'] == [135,181,104,103]
          and cap('acme-recovery','f111')['warning'] == cap('acme-recovery','f111')['pendingAlarmOrFailure'] == 0)
    def action_labels(name: str, offset: int) -> list[str]:
        frame = families[name]['baseFrame']+offset
        return [r['label'] for r in families[name]['actionOrder'] if r['frame'] == frame]
    for name, offset in (('blue',20), ('acme-native',50)):
        check(name+' committed Drop before ordered sound requests',
              action_labels(name,offset) == ['DROP','DROP_ACCEPT','SOUND','SOUND'])
    for name, offset in (('blue',60), ('acme-recovery',110)):
        check(name+' committed Take before sound/table/sound requests',
              action_labels(name,offset) == ['TAKE','TAKE_ACCEPT','SOUND','RESPONSE_TABLE','SOUND'])
    check('initial ACME re-Take executes refusal2 without acceptance',
          action_labels('acme-native',90) == ['TAKE','REFUSAL_STRING']
          and any(r['label'] == 'REFUSAL_STRING' and r['requestD1'] == 2
                  for r in families['acme-native']['actionOrder']))
    restores = []
    for original, replay, pairs in (
            ('blue','blue-replay',((59,34),(60,35),(61,36),(70,45))),
            ('acme-native','acme-replay',((69,9),(70,10),(71,11),(80,20),(89,29),(90,30),(91,31),(100,40))),
            ('acme-recovery','acme-recovery-replay',((106,6),(110,10),(111,11),(120,20)))):
        for a,b in pairs:
            check(f'{original}/{a} full-RAM restore as {replay}/{b}', cap(original,f'f{a}')['sha256'] == cap(replay,f'f{b}')['sha256'])
            restores.append(dict(original=f'{original}/f{a}', restored=f'{replay}/f{b}', sha256=cap(original,f'f{a}')['sha256']))
    count = sum(len(f['captures']) for f in families.values())
    return dict(issue=771, kind='dion-r2-current-owner-controls', sourceSha256=source.sha256,
        sourcePins=pins, harnessSha256=owners.native.owners.HARNESS_SHA, currentRecipeSha256=owners.r3.sha(RAW/'probe.py'),
        captureCount=count, sourceRangeComparisons=count*len(owners.PINS), assertions=assertions,
        families=families, restoredFutures=restores,
        limits=['Landed EAGLE/METIS and locator-absent BLUE controls, not all placement/device contexts',
                'No native letter stream, held locator branch, space ACME Drop or completed alarm/failure/menu future',
                'Current recipe hash is not historical execution identity; generated scripts/log pins own each run',
                'Eleven-tick mailbox instrumentation, sound off; no physical IKBD, audible output or browser Save proof'])


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true', help='write numeric ledger after verification')
    args = parser.parse_args()
    result = audit()
    if args.write:
        OUT.write_text(json.dumps(result, indent=2)+'\n')
    else:
        assert result == json.loads(OUT.read_text()), 'numeric ledger differs; inspect evidence before --write'
    print(f"R2 current owners: {result['captureCount']} cuts; {result['sourceRangeComparisons']} source comparisons; {len(result['assertions'])} assertions; {len(result['restoredFutures'])} restored cuts")
