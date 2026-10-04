"""Read-only #771 item/panel/sound owner audit of the retained R4 EAGLE cuts."""
from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path

from m3lab.ram import Ram
from m3lab.scripts import AVAILABILITY, BASE, ENTRY_TABLE, decode_instruction
from m3lab.text import static_strings

REPO = Path(__file__).resolve().parents[3]
RAW = REPO / 'restricted/mercenary-iii-778'
OUT = REPO / 'research/mercenary-iii-st/object-interaction-r2-native-owners.json'


def module(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


eagle = module('eagle', 'eagle-flight-evidence.py')
owners = module('owners', 'object-interaction-r2-owners.py')
PINS = (*owners.PINS,
    (0x51134, 0x511D8, 'kill and script request', '5f765f9d25febf26ec8e6aea9e8cac868a33fb0d3421de38fd1cb8ab96b276e9'),
    (0x511D8, 0x51240, 'native fire sound request', '80ccddf2d3a62fce3ce3a7c872d66c3af5b37797c4954bdf515b08fee2b082d9'),
    (0x52964, 0x52978, 'programme count sum', '978d32630f60010a6e394d040b093e3963bf24dfd2200780c8ad0b0b00244c59'),
    (0x52EF2, 0x52F14, 'indirect object-bit writer', '5c94b152991064df9993b8159d6759d89f8423a52ea424f8c5ca58bb2cdd6b04'))


def observe(path: Path) -> dict:
    r = Ram.load(path)
    return dict(sha256=r.sha256, frame=r.word(0x7180), ticks=r.long(0x53094),
        held=[s for s in range(1, 247) if r.byte(0x641E+4*s) & 128],
        stack=list(r.bytes(0x563E, 0x563E+r.word(0x563C))),
        selector=r.word(0x7142), craftSlot=r.sword(0x7144),
        passenger=r.word(0x6EB2), playback=r.word(0x70A2),
        card=list(r.bytes(0x6F0E, 0x6F12)), reveal=r.word(0x53950),
        selectedSection=r.word(0x6F04), sectionMax=r.word(0x6F0C), selectedSectionPointer=r.long(0x6F08),
        descriptionObject=r.byte(0x6F06), descriptionSection=r.byte(0x6F07),
        packedCursor=r.long(0x722C), continuation=r.sword(0x7230), busy=r.sword(0x723A),
        acmeWord=r.word(0x663A), temperature=r.word(0x6F2E), pressure=r.word(0x6F30),
        warning=r.word(0x7114), pendingWarning=r.word(0x70F8),
        detectorState=r.byte(0x6672), detectorSwitch=r.word(0x6F24) & 2,
        randomSoundRate=r.word(0x710C), randomSoundCounter=r.word(0x710E),
        randomCursor=r.long(0x75A6), soundPriority=r.word(0x7110), bVector=r.long(0x4BF54))


def graph(source: Ram, script: int) -> dict:
    """Inspect both conditional successors and timed targets; publish no dialogue."""
    entry = BASE + source.word(ENTRY_TABLE + 2*script)
    pending, sites = [entry], {}
    strings = static_strings(source)
    while pending:
        address = pending.pop()
        if address in sites:
            continue
        instruction = decode_instruction(source, address, strings)
        assert not instruction.get('unknown'), f'unrecovered instruction at {address:x}'
        sites[address] = instruction
        edges = []
        if 'target' in instruction:
            edges.append(int(instruction['target'][1:], 16))
        name = instruction['name']
        if name == 'timed_script':
            edges.append(BASE + int(instruction['operands'][1][1:], 16))
        if name in ('jump', 'call'):
            edges.append(int(instruction['operands'][0]['address'][1:], 16))
        if name not in ('jump', 'return', 'end', 'halt'):
            edges.append(instruction['end'])
        pending.extend(edges)
    spans = []
    for address, instruction in sorted(sites.items()):
        if spans and spans[-1][1] == address:
            spans[-1][1] = instruction['end']
        else:
            spans.append([address, instruction['end']])
    return dict(script=script, entry=entry, openingAvailability=source.byte(AVAILABILITY+script),
        entryWord=source.slice(ENTRY_TABLE+2*script, ENTRY_TABLE+2*script+2),
        sites=len(sites), operations=sorted({i['name'] for i in sites.values()}),
        sourceRanges=[source.slice(lo, hi) for lo, hi in spans])


def audit() -> dict:
    assertions = []
    def check(name: str, condition: bool) -> None:
        if not condition:
            raise AssertionError(name)
        assertions.append(name)
    # Reuse R4's independent source/checkpoint/log/action/timing verifier.
    evidence = eagle.build(RAW.resolve())
    committed = REPO / 'research/mercenary-iii-st/eagle-flight-routes.json'
    check('R4 ledger regenerates exactly', evidence == json.loads(committed.read_text()))
    source = Ram.load(owners.SOURCE)
    check('coherent source', source.sha256 == owners.SOURCE_SHA)
    pins = [dict(role=role, **source.require(lo, hi, digest, role)) for lo, hi, role, digest in PINS]
    graphs = {str(script): graph(source, script) for script in (0x12, 0x81)}
    check('native firing script graphs finite and without object-bit writes',
        graphs['18']['sites'] == 15 and graphs['129']['sites'] == 66
        and all('object_bit' not in g['operations'] for g in graphs.values()))
    families, comparisons = {}, 0
    for name, retained in evidence['families'].items():
        captures = {}
        for cut, original in retained['captures'].items():
            path = RAW / name / f'{cut}.ram'
            r = Ram.load(path)
            state = observe(path)
            check(name + '/' + cut + ' capture pin', state['sha256'] == original['sha256'])
            for lo, hi, role, digest in PINS:
                r.require(lo, hi, digest, name + '/' + cut + ' ' + role)
                comparisons += 1
            check(name + '/' + cut + ' observed item/description owners',
                state['card'] == [104, 5, 4, 0] and state['reveal'] == 0
                and state['selectedSection'] == state['sectionMax'] == state['selectedSectionPointer'] == 0
                and state['descriptionObject'] == state['descriptionSection'] == state['packedCursor'] == state['continuation'] == 0
                and state['acmeWord'] == 0x8400 and state['warning'] == state['pendingWarning'] == 0)
            check(name + '/' + cut + ' observed detector gate',
                state['detectorState'] == 4 and state['detectorSwitch'] == 0
                and state['randomSoundRate'] == state['randomSoundCounter'] == 0)
            check(name + '/' + cut + ' distinct held/stack owners',
                state['held'] in ([38, 103, 104, 135, 181], [38, 103, 104, 135])
                and sorted(state['stack']) == [s for s in state['held'] if s != 38])
            captures[cut] = state
        families[name] = dict(manifestSha256=retained['manifestSha256'], logSha256=retained['logSha256'],
            sourceRamSha256=retained['sourceRamSha256'], sourceCheckpointSha256=retained['sourceCheckpointSha256'],
            topCount=retained['topCount'], tickGapCounts=retained['tickGapCounts'], captures=captures)
    cap = lambda name, cut: families[name]['captures'][cut]
    check('firing sound programme selected', cap('fire', 'f11')['soundPriority'] == 3
          and cap('fire', 'f11')['bVector'] == 0x4CA40)
    check('next firing cut is idle sound', cap('fire', 'f12')['soundPriority'] == 0
          and cap('fire', 'f12')['bVector'] == 0x5317C)
    check('space gauges reach zero with ACME held', cap('space', 'f100')['temperature'] == cap('space', 'f100')['pressure'] == 0)
    check('random cursor advances despite detector gate', cap('space', 'f10')['randomCursor'] == 0x3DD40
          and cap('space', 'f100')['randomCursor'] == 0x3DDF6 and cap('space', 'end')['randomCursor'] == 0x3DE98)
    check('dropped key preserves occupancy', cap('key-drop', 'f11')['held'] == [38, 103, 104, 135]
          and cap('key-drop', 'f11')['craftSlot'] == 3 and cap('key-drop', 'f11')['selector'] == 0)
    return dict(issue=771, evidenceClass='retained-original-input-native-flight',
        sourceSha256=source.sha256, r4LedgerSha256=eagle.sha(committed), sourcePins=pins, staticNativeScriptGraphs=graphs,
        captureCount=sum(len(f['captures']) for f in families.values()), sourceRangeComparisons=comparisons,
        assertionCount=len(assertions), assertions=assertions, families=families,
        limits=['Finite inherited-owner cuts, no ACME Drop or active letter stream in native contexts',
                'No final admitted-world/script-writer proof for detector149 or newly reachable objects',
                'No original audible output, browser reconstruction or browser Save equivalence'])


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
    print(f"R2 native owners: {result['captureCount']} cuts; {result['sourceRangeComparisons']} source comparisons; {result['assertionCount']} assertions")
