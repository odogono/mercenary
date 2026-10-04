"""Read-only #771 per-response scheduler audit; exports numeric owners and pins.

Original fixtures and expression-bearing artifacts stay in Restricted Material.
This observer starts no emulator and implements no gameplay behavior.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import itertools
import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
RAW = REPO / 'restricted/mercenary-iii-771/effects-matrix'
OUT = REPO / 'research/mercenary-iii-st/object-interaction-r2-scheduler.json'
SPEC = importlib.util.spec_from_file_location('effect_audit', Path(__file__).with_name('object-interaction-r2-effects-audit.py'))
prior = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(prior)
prior.LABELS += ['CLEANUP', 'DESCRIPTION']
SLOTS = {'child': (216, 28, 0x75467), 'pcb': (218, 115, 0x7468B), 'ore': (127, 24, 0x76243)}
VARIANTS = ('active', 'unavailable', 'unavailable-active', 'queue-busy',
            'queue-continuation', 'queue-negative', 'queue-stale', 'busy')
COMPETING = ('threshold-first', 'threshold-and-timer', 'timer-first')
PINS = (
    (0x52860, 0x5289E, 'scheduler dispatch', 'a6e2be367325c4e6b820fd9041bdce5467b15f0b5cf06fdf7a4e46d0c8126733'),
    (0x55A0E, 0x55AC4, 'launch and continuation', 'cc819d4f497c50b0a830e5a2f1440a6ae27d792572768ad8815ab40d820e10a8'),
    (0x4DDCA, 0x4DDD0, 'negative continuation cleanup', '2bbe1bf5f83e1e3333477f25eed3669d0823bd3c689d238cf43531156331cd1b'),
    (0x555D4, 0x555F6, 'Dion pickup helper/table', '2c988d652654cbc0289fe4c6422471c6700876aed3f5a9bee279a90a95905ff8'),
)
HELPERS = {
    'mercenary-iii-771/effects-matrix/controls.py': '5294e938ae6fbb62fcdf3e04a9be7e11e52c930af0a61701f9dee653c1d3b406',
    'mercenary-iii-771/effects/controls.py': prior.HELPER_HASHES['controls.py'],
    'mercenary-iii-770/harness.py': '2d4597d6572d84c0e3f26236f131fecb866c64ef31c8d4d71038190be7cf4069',
}


def audit() -> dict:
    assertions = []
    def check(name: str, condition: bool) -> None:
        if not condition:
            raise AssertionError(name)
        assertions.append(name)
    for path, expected in HELPERS.items():
        check('helper ' + path, prior.digest(REPO / 'restricted' / path) == expected)
    source_path = REPO / 'restricted/mercenary-iii-708/presentation/exact2/start.ram'
    source = source_path.read_bytes()
    check('coherent primary source', prior.digest(source_path) == prior.SOURCE_HASH)
    pins = [dict(start=lo, end=hi, role=role, sha256=expected) for lo, hi, role, expected in PINS]
    for lo, hi, role, expected in PINS:
        check('source ' + role, hashlib.sha256(source[lo:hi]).hexdigest() == expected)
    families = [f'{name}-{variant}' for name in SLOTS for variant in VARIANTS]
    families += [f'{first}-then-{last}' for first, last in itertools.permutations(SLOTS, 2)]
    families += [f'{obj}-{variant}' for obj in ('pcb', 'ore') for variant in COMPETING]
    runs, traces = {}, {}
    for name in families:
        family = RAW / name
        manifest_path = family / 'manifest.json'
        manifest = json.loads(manifest_path.read_text())
        origin = prior.local(manifest['source'])
        raw = origin.with_suffix('.ram').read_bytes()
        check(name + ' source RAM', prior.digest(origin.with_suffix('.ram')) == manifest['sourceRamSha256'])
        check(name + ' source machine checkpoint', prior.digest(origin.with_suffix('.sav')) == manifest['sourceSavSha256'])
        check(name + ' wait instrumentation', manifest['waitSha256'] == '9f0f02ea22a98b4fe4556da86129ad571daa1805ae73e98cdf397b9e55d670eb'
              and manifest['patchSha256'] == '1ccd3989761d9bf69ad107d8f5a981714719fc232526c7b5246a0737cbfe705f'
              and manifest['cpu'] == 32)
        for lo, hi, role, expected in PINS:
            check(name + ' checkpoint ' + role, hashlib.sha256(raw[lo:hi]).hexdigest() == expected)
        check(name + ' frame/tick seed', prior.number(raw, 0x7180, 2) == manifest['baseFrame']
              and prior.number(raw, 0x53096, 2) == manifest['baseTicks'])
        log = prior.local(manifest['run']) / 'hatari.log'
        rows = prior.parse(log)
        traces[name] = rows
        tops = [r for r in rows if r['label'] == 'TOP']
        check(name + ' eleven-tick gaps', len(tops) > 1 and all(
            ((b['frame']-a['frame']) % 65536, (b['ticks']-a['ticks']) % 65536) == (1, 11)
            for a, b in zip(tops, tops[1:])))
        ticks = {r['frame']: r['ticks'] for r in tops}
        check(name + ' in-frame tick agreement', all(r['ticks'] == ticks[r['frame']] for r in rows if r['frame'] in ticks))
        captures = {p.stem: prior.capture(p) for p in sorted(family.glob('f*.ram'), key=lambda p: int(p.stem[1:]))}
        check(name + ' requested captures', {int(c[1:]) for c in captures} == set(manifest['captures']))
        check(name + ' capture boundaries', all(c['frame'] == (manifest['baseFrame'] + int(cut[1:])) % 65536
              and c['ticks'] == (manifest['baseTicks'] + 11*int(cut[1:])) % 65536
              and c['ticks'] == ticks[c['frame']] for cut, c in captures.items()))
        check(name + ' script-only KEY A38', all(c['objectBits']['38'] == 0x85 and 38 not in c['stack'] for c in captures.values()))
        operations = [dict(frame=r['frame'], site=r['site']) for r in rows if r['label'] == 'OP']
        priority = [dict(label=r['label'], frame=r['frame'], continuationBits=prior.number(r['memory'], 0x7230, 2),
                         queue=prior.number(r['memory'], 0x711C, 2)) for r in rows if r['label'] in ('CLEANUP', 'DESCRIPTION')]
        runs[name] = dict(manifestSha256=prior.digest(manifest_path), sourceRamSha256=manifest['sourceRamSha256'],
            sourceSavSha256=manifest['sourceSavSha256'], logSha256=prior.digest(log),
            events=manifest['events'], baseFrame=manifest['baseFrame'], tops=len(tops), elevenTickGaps=len(tops)-1,
            captures=captures, operations=operations, priorityReaders=priority,
            starts=[{k: r[k] for k in ('frame', 'pc', 'queue', 'stackPointer', 'returnStack', 'availability')}
                    for r in rows if r['label'] == 'START'])
    for obj, (slot, script, entry) in SLOTS.items():
        for variant in VARIANTS:
            name = f'{obj}-{variant}'
            run = runs[name]
            cap = run['captures']
            executed = [op for op in run['operations'] if op['site'] != 0x6FF54]
            check(name + ' acquisition retained', all(slot in c['stack'] and c['objectBits'][str(slot)] & 128
                  for cut, c in cap.items() if int(cut[1:]) >= 2))
            check(name + ' acquired head', cap['f2']['stack'][0] == slot)
            if variant in ('active', 'queue-busy', 'queue-continuation'):
                check(name + ' queue unconsumed', cap['f8']['queue'] == script
                      and cap['f8']['availability'][str(script)] == 160 and not executed)
            if variant in ('unavailable', 'unavailable-active', 'queue-stale'):
                check(name + ' availability refusal', cap['f8']['queue'] == 0
                      and cap['f8']['availability'][str(script)] == 32 and not executed)
            if variant == 'queue-negative':
                check(name + ' cleanup retains queue for one frame', cap['f4']['continuationBits'] == 0
                      and cap['f4']['queue'] == script and cap['f4']['availability'][str(script)] == 160)
                check(name + ' cleanup handler reached', run['priorityReaders'] == [dict(label='CLEANUP',
                      frame=run['baseFrame']+3, continuationBits=65535, queue=script)])
                check(name + ' next frame launches', executed[0] == dict(frame=run['baseFrame']+4, site=entry)
                      and cap['f5']['queue'] == 0 and cap['f5']['availability'][str(script)] == 32)
            if variant == 'queue-continuation':
                check(name + ' positive continuation precedes queue', run['priorityReaders'][0] == dict(label='DESCRIPTION',
                      frame=run['baseFrame']+3, continuationBits=1, queue=script))
            if variant == 'busy':
                check(name + ' busy consumes availability before interpretation', all(cap[f'f{cut}']['pc'] == entry
                      and cap[f'f{cut}']['busy'] and cap[f'f{cut}']['availability'][str(script)] == 32 for cut in (2, 8, 30)))
                check(name + ' busy entry deferred', executed[0] == dict(frame=run['baseFrame']+47, site=entry))
        for last, (last_slot, last_script, last_entry) in SLOTS.items():
            if last == obj:
                continue
            name = f'{obj}-then-{last}'
            run = runs[name]
            cap = run['captures']
            executed = [op for op in run['operations'] if op['site'] != 0x6FF54]
            check(name + ' queue replaced', cap['f2']['queue'] == script and cap['f4']['queue'] == last_script)
            check(name + ' both acquisitions retained', cap['f4']['stack'][:2] == [last_slot, slot]
                  and all(c['objectBits'][str(s)] & 128 for c in (cap['f4'], cap['f8']) for s in (slot, last_slot)))
            check(name + ' queue delays consumption', all(cap['f4']['availability'][str(s)] == 160 for s in (script, last_script)))
            check(name + ' only replacement launches', executed[0] == dict(frame=run['baseFrame']+5, site=last_entry)
                  and not any(op['site'] == entry for op in run['operations']) and cap['f6']['queue'] == 0
                  and cap['f8']['availability'][str(script)] == 160 and cap['f8']['availability'][str(last_script)] == 32)
    for obj in ('pcb', 'ore'):
        slot, script, entry = SLOTS[obj]
        for variant in COMPETING:
            name = f'{obj}-{variant}'
            run, rows = runs[name], traces[name]
            cap = run['captures']
            check(name + ' competing acquisition retained', all(slot in c['stack'] and c['objectBits'][str(slot)] & 128
                  for cut, c in cap.items() if int(cut[1:]) >= 3))
            check(name + ' active competitor queues response', cap['f3']['queue'] == script
                  and cap['f3']['availability'][str(script)] == 160)
            if variant.startswith('threshold'):
                check(name + ' threshold first', any(r['label'] == 'START' and r['frame'] == run['baseFrame']+1
                      and r['registers']['D1'] & 65535 == 119 for r in rows))
            else:
                check(name + ' timed first', any(r['label'] == 'DIRECT' and r['frame'] == run['baseFrame']+1
                      and r['registers']['D1'] == 0x575A for r in rows))
            first = next(r for r in rows if r['label'] == 'OP' and r['site'] == entry)
            before = next(r for r in rows if r['label'] == 'START' and r['frame'] == first['frame']
                          and r['registers']['D1'] & 65535 == script)
            check(name + ' queued entry nests into retained caller', before['pc'] == 0x766D1
                  and first['returnStack'] == [before['pc'], *before['returnStack']]
                  and first['stackPointer'] == before['stackPointer']-4)
            check(name + ' queued launch consumes only at start', before['availability'][str(script)] == 160
                  and first['availability'][str(script)] == 32 and first['queue'] == 0)
            if variant == 'threshold-and-timer':
                check(name + ' due target remains behind threshold', cap['f3']['target'] == 0x5785
                      and cap['f80']['target'] == 0x5CD2
                      and not any(r['label'] == 'DIRECT' and r['registers']['D1'] == 0x5785 for r in rows))
    return dict(issue=771, evidenceClass='synthetic-original-program', sourceSha256=prior.SOURCE_HASH,
        helperSha256=HELPERS, sourcePins=pins, families=len(runs),
        tops=sum(r['tops'] for r in runs.values()), elevenTickGaps=sum(r['elevenTickGaps'] for r in runs.values()),
        assertionCount=len(assertions), assertions=assertions, runs=runs)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true', help='update numeric ledger after assertions pass')
    args = parser.parse_args()
    result = audit()
    encoded = json.dumps(result, indent=2) + '\n'
    if args.write:
        OUT.write_text(encoded)
    else:
        assert OUT.read_text() == encoded, 'numeric ledger differs; inspect evidence before --write'
    print(f"R2 scheduler: {result['families']} families; {result['assertionCount']} assertions; {result['elevenTickGaps']} eleven-tick gaps")
