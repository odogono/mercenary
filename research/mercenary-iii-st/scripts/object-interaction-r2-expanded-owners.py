"""Read-only #771 owner audit of BLUE and later native encounter evidence.

Regenerates R3/R4 route ledgers before reading their cuts. No original text,
instructions, gameplay implementation or portable Save codec is emitted.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
from pathlib import Path

from m3lab.ram import Ram

REPO = Path(__file__).resolve().parents[3]
OUT = REPO / 'research/mercenary-iii-st/object-interaction-r2-expanded-owners.json'


def module(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


native = module('r2_native', 'object-interaction-r2-native-owners.py')
r3 = module('r3_followup', 'object-interaction-r3-followup.py')
r4 = module('r4_encounters', 'eagle-natural-encounters.py')
PINS = (*native.PINS,
    (0x4D848, 0x4D888, 'panel dispatch', 'fd5da2f9a1ab20aa44ceab6929c416b1d3b54445d12d50fb441cea58069acd30'),
    (0x4DD3A, 0x4DDCA, 'document commands', '91741c469e9cb6f595f4d344a743cf41d63e7083d4c5446211e1534c8e201151'),
    (0x4E102, 0x4E13A, 'section decode', '6fb14224936a98300d351b90b2debf3a103dc95e17e3995ee2b237e68deec80d'),
    (0x4E1FC, 0x4E354, 'stack label selectors', 'eec22584c28df3d6ae21d60ed8a8b623b0ab73c03dbdd581d4199122d09716c1'),
    (0x4E3A6, 0x4E492, 'label tick and draw', 'c7b556f8c2f0b64d1c2073ade613941804eb6fb8b269f0beaa357a91772df882'),
    (0x55A7E, 0x55B9E, 'description and interaction sound', '7ff9e698cf0c73a74bb42e89691fae783469222ec62d9382900995765346433c'),
    (0x555F6, 0x5569E, 'life support', '9811a2036dbf16afb40e58811d13f2fcf46ead0346a1cf4c2d3555860c68e025'),
    (0x59CAC, 0x59CE4, 'gauge computation', '90d13e87518aa8ed251848564a39ee58b28fcd232eaef32a366acb791b0dc32b'),
    (0x52630, 0x52726, 'warning and pending failure', '8b3b2399e63603d4a7d525235a4d7087cd7f42a538b4117254f53ee382922cd7'))


def verify_write(address: int, value: bytes, seed_ticks: int) -> None:
    allowed = ((address in (0x56726, 0x7056) and len(value) == 1)
        or (address == 0xF0000 and hashlib.sha256(value).hexdigest() == native.owners.WAIT_SHA)
        or (address == 0x5A952 and hashlib.sha256(value).hexdigest() == native.owners.PATCH_SHA)
        or (address == 0xF0100 and value == seed_ticks.to_bytes(2, 'big'))
        or (address == 0x5301E and value == bytes([0, 11])))
    assert allowed, f'unapproved debugger write at ${address:x}'


def observe(r: Ram) -> dict:
    pointer = r.long(0x56D6)
    if not 0x56B6 <= pointer <= 0x56D6 or (0x56D6-pointer) % 4:
        raise ValueError('invalid original return stack pointer')
    count = r.word(0x563C)
    if count > 246:
        raise ValueError('invalid original Carried Stack length')
    return dict(sha256=r.sha256, frame=r.word(0x7180), ticks=r.long(0x53094),
        body=r.word(0x713C), selector=r.word(0x7142), craftSlot=r.sword(0x7144),
        passenger=r.word(0x6EB2), playback=r.word(0x70A2),
        stack=list(r.bytes(0x563E, 0x563E+count)),
        held=[s for s in range(1, 247) if r.byte(0x641E+4*s) & 128],
        objectStates={str(s): r.byte(0x641E+4*s) for s in (38, 39, 40, 41, 135, 149, 174, 193)},
        card=list(r.bytes(0x6F0E, 0x6F12)), reveal=r.word(0x53950),
        selectedSection=r.word(0x6F04), sectionMax=r.word(0x6F0C), selectedSectionPointer=r.long(0x6F08),
        descriptionObject=r.byte(0x6F06), descriptionSection=r.byte(0x6F07),
        packedCursor=r.long(0x722C), continuation=r.sword(0x7230), busy=r.sword(0x723A),
        scroll=r.sword(0x4E394), labelSha256=r.digest(0x4E380, 0x4E390),
        acmeWord=r.word(0x663A), temperature=r.word(0x6F2E), pressure=r.word(0x6F30),
        warning=r.word(0x7114), pendingAlarmOrFailure=r.word(0x70F8),
        detectorSwitch=r.word(0x6F24) & 2, randomSoundRate=r.word(0x710C),
        randomSoundCounter=r.word(0x710E), randomCursor=r.long(0x75A6),
        soundPriority=r.word(0x7110), bVector=r.long(0x4BF54),
        shieldCount=r.word(0x6ECA),
        vm=dict(pc=r.long(0x6EDA), queue=r.word(0x711C),
                timerBits=r.word(0x727E), timedTargetOffset=r.word(0x7280),
                returnPointer=pointer, returns=[r.long(a) for a in range(pointer, 0x56D6, 4)],
                availability={str(s): r.byte(0x7352+s) for s in (18, 24, 28, 115, 129)},
                flags=list(r.bytes(0x7270, 0x7278))))


def verify_capture(r: Ram, expected: dict, pins: tuple) -> None:
    assert r.sha256 == expected['sha256'], 'capture SHA-256 differs from regenerated route'
    assert (r.word(0x7180), r.long(0x53094)) == (expected['frame'], expected['ticks']), 'capture phase differs'
    for lo, hi, role, digest in pins:
        r.require(lo, hi, digest, role)


def audit() -> dict:
    assertions = []
    def check(name: str, condition: bool) -> None:
        if not condition:
            raise AssertionError(name)
        assertions.append(name)
    source = Ram.load(native.owners.SOURCE)
    check('coherent source', source.sha256 == native.owners.SOURCE_SHA)
    pins = [dict(role=role, **source.require(lo, hi, digest, role)) for lo, hi, role, digest in PINS]
    # The owning observers verify checkpoint/input/debugger/log/cadence provenance.
    # Classification and incomplete schedules are retained, never homogenized.
    groups = {}
    for name, observer, filename in (
            ('r3', r3, 'object-interaction-r3-followup.json'),
            ('r4', r4, 'eagle-natural-encounters.json')):
        evidence = observer.build(observer.RAW.resolve())
        ledger = REPO / 'research/mercenary-iii-st' / filename
        check(name + ' ledger regenerates exactly', evidence == json.loads(ledger.read_text()))
        families = {}
        for family, retained in evidence['families'].items():
            captures = {}
            for cut, expected in retained['captures'].items():
                r = Ram.load(observer.RAW / family / (cut+'.ram'))
                verify_capture(r, expected, PINS)
                state = observe(r)
                check(f'{name}/{family}/{cut}: independent panel/document owners',
                      state['card'] == [104, 5, 4, 0] and state['reveal'] == 0
                      and all(state[k] == 0 for k in ('selectedSection', 'sectionMax',
                          'selectedSectionPointer', 'descriptionObject', 'descriptionSection',
                          'packedCursor', 'continuation')))
                check(f'{name}/{family}/{cut}: live ACME predicate',
                      state['acmeWord'] == 0x8400 and state['warning'] == 0)
                check(f'{name}/{family}/{cut}: finite detector gate',
                      state['objectStates']['149'] == 4 and state['detectorSwitch'] == 0
                      and state['randomSoundRate'] == state['randomSoundCounter'] == 0)
                check(f'{name}/{family}/{cut}: key38 held outside stack and distinct key39',
                      state['objectStates']['38'] & 128 != 0 and 38 not in state['stack']
                      and state['objectStates']['39'] & 128 == 0)
                captures[cut] = state
            families[family] = dict(classification=retained['classification'],
                source=retained['source'], sourceRamSha256=retained['sourceRamSha256'],
                sourceCheckpointSha256=retained['sourceCheckpointSha256'],
                manifestSha256=retained['manifestSha256'], logSha256=retained['logSha256'],
                generatedDebuggerDigest=retained['generatedDebuggerDigest'],
                missingScheduledCaptures=retained['missingScheduledCaptures'],
                topCount=retained['topCount'], tickGapCounts=retained['tickGapCounts'], captures=captures)
        groups[name] = dict(routeLedger=str(ledger.relative_to(REPO)), routeLedgerSha256=r3.sha(ledger),
                            routeAssertionCount=len(evidence['assertions']), families=families)
    cap = lambda group, family, cut: groups[group]['families'][family]['captures'][cut]
    blue = groups['r3']['families']['blue-actions']['captures']
    check('ordinary BLUE held state does not hold locator40/41', all(
        c['objectStates']['40'] & 128 == c['objectStates']['41'] & 128 == 0 for c in blue.values()))
    check('ordinary BLUE Drop/re-pick retains unrelated descriptor',
          blue['f91']['stack'] == [104, 103, 135] and blue['f91']['objectStates']['174'] == 4
          and blue['f121']['stack'] == [174, 104, 103, 135] and blue['f121']['objectStates']['174'] == 132
          and blue['f91']['card'] == blue['f121']['card'] == [104, 5, 4, 0])
    check('ordinary failure preserves ACME while pending failure becomes1', all(
        cap('r4', family, 'failure')['pendingAlarmOrFailure'] == 1
        and cap('r4', family, 'failure')['acmeWord'] == 0x8400
        and cap('r4', family, 'failure')['bVector'] == 0x4CA84
        and cap('r4', family, 'failure')['soundPriority'] == 3
        for family in ('fire-aim', 'aim-repeat', 'hit-repeat')))
    check('synthetic shield remains separate from ordinary acquired set',
          cap('r3', 'hit-held-two', 'f11')['objectStates']['193'] & 128 != 0
          and 193 not in cap('r3', 'hit-held-two', 'f11')['stack']
          and cap('r3', 'hit-held-two', 'f11')['shieldCount'] == 1)
    for family, script, entry in (('fire-candidacy', 18, 0x757A5), ('kill-fleet-zero', 129, 0x761EC)):
        state = cap('r3', family, 'f11')
        check(f'{family}: supplied conditional launch owners',
              state['vm']['pc'] == entry and state['vm']['availability'][str(script)] == 32)
    count = sum(len(f['captures']) for g in groups.values() for f in g['families'].values())
    return dict(issue=771, kind='dion-r2-expanded-owner-evidence', sourceSha256=source.sha256,
        sourcePins=pins, actualAcquiredSet=[103, 104, 124, 135, 165, 174, 181, 219, 220],
        captureCount=count, sourceRangeComparisons=count*len(PINS), assertions=assertions, groups=groups,
        limits=['Finite owner observations; no final admitted world/script-writer closure',
                'Synthetic shield/candidacy/fleet controls remain distinct from ordinary routes',
                'No ACME Drop/re-pick or active letter stream in native contexts',
                'Pending alarm/failure is one retained word, interpreted by its actual context',
                'No original audible output, independently rebuilt raster or browser Save proof'])


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true', help='write numeric ledger after verification')
    args = parser.parse_args()
    result = audit()
    if args.write:
        OUT.write_text(json.dumps(result, indent=2)+'\n')
    else:
        assert result == json.loads(OUT.read_text()), 'numeric ledger differs; inspect evidence before --write'
    print(f"R2 expanded owners: {result['captureCount']} cuts; {result['sourceRangeComparisons']} source comparisons; {len(result['assertions'])} assertions")
