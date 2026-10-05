"""Read-only ordinary TOLOSA HQ route and native boundary evidence (#772)."""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re

from m3lab.ram import Ram
from m3lab.catalogue_interiors import floor_binding
from m3lab.geometry import decode_structure

REPO = Path(__file__).resolve().parents[3]
RAW = REPO / 'restricted/mercenary-iii-772/tolosa-hq'
OUT = REPO / 'research/mercenary-iii-st/tolosa-hq-evidence.json'
PINS = (
    (0x5600c, 0x560e2, 'cell key and origin', '9fe59aabfc246d737e2e0b5ca98430ca25381d70b682f659669ebf9acc11886a'),
    (0x5684c, 0x5688c, 'floor keyboard gate', 'c6a88df44a8b9a79d7606fd8156a5668e1e5b049bfb8a349dc4a2a8ae683f88f'),
    (0x56d66, 0x56e5e, 'lift target and arrival', '67686497e8faaf54226b95a9d75e8682b61e5e0039e66bf1af7bc75cc1b93efc'),
    (0x5af10, 0x5af70, 'placeholder door key binding', 'd9cff9e1a9779f39b73f1a800b2f3db32828008f82e841d88462da043053c966'),
    (0x5b2f0, 0x5b394, 'region binding', '4522a7e71b8a833caad397cccaf28b8d423399579a19fcb1d802845b02e4b126'),
    (0x5b4a2, 0x5b616, 'movement clamp and adjacency', '2280dd23d791f9d4debd4249594243f0039acbd7c0808c9122af1329cb528539'),
    (0x5ba24, 0x5ba8e, 'door opening held predicate', '92ba85b58acba475c2bc3884778ef899b02292342362b0d971a627aece4e0d7a'),
    (0x5b6be, 0x5b714, 'location trigger', 'b7e5864b60b1b6090a69e79bf682068433fc3c608a84b17f59d7aa041575a748'),
    (0x22e8a, 0x22e90, 'HQ placement', '00dac47f69d379b3d58c0e183c13b138939bc8adad0ef93f1ba627b908c27dc4'),
    (0x22f0c, 0x22f18, 'HQ triggers', '2e473698079c8bf95ab36f479e1e43a3fe0652f399d2ebd1d81dbe8f6d7e0936'),
    (0x10c1a, 0x10c37, 'HQ floor alias', 'e45df152563d59c937c56addf3d3a9ad8035852652c3e5bffe64bd32401cffd2'),
    (0x555d4, 0x555f6, 'pickup response', '2c988d652654cbc0289fe4c6422471c6700876aed3f5a9bee279a90a95905ff8'),
    (0x7468b, 0x74727, 'PCB effect graph', '493a9f09011c8c7a4b25038f970201a00dbb3a31da59b1b1af3a2434d6dd4598'),
    (0x52f6a, 0x52fe0, 'model swap helpers', 'ba04d8d392b876c2afb9b3b0151ff0ae863910e6056f43d16a6f591ceb73a8d3'),
)
FAMILIES = ('approach-b', 'approach-c', 'entry-lift', 'basement-hall', 'key31-door',
            'key31-centre', 'lift-replay', 'hall-replay', 'door-replay', 'centre-replay')


def module(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


owners = module('hq_owners', 'object-interaction-r2-expanded-owners.py')
reader = module('hq_trace', 'object-interaction-r3-followup.py')
reader.LABELS = tuple(dict.fromkeys((*reader.LABELS, 'FLOOR_KEY', 'FLOOR_SELECT',
    'FLOOR_BOUND', 'LOCATION_MATCH', 'PICKUP_RESPONSE', 'MODEL_SWAP_A',
    'DOOR_KEY', 'DOOR_LOCKED', 'CLAMP', 'FLOOR_STEP')))


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def observe(r: Ram) -> dict:
    count = r.word(0x563C)
    if count > 246:
        raise ValueError('invalid stack count')
    return dict(sha256=r.sha256, frame=r.word(0x7180), ticks=r.long(0x53094),
        selector=r.word(0x7142), body=r.word(0x713C), group=r.word(0x6FDE), cell=r.word(0x71F4),
        eye=[r.slong(a) for a in (0x7146, 0x714A, 0x714E)], yaw=r.word(0x7156),
        structure=r.word(0x7188), origin=[r.word(0x718A), r.word(0x718C)], buildingKey=r.word(0x7192),
        region=r.word(0x7194), regionFlags=r.word(0x71CC), regionRecord=r.long(0x71AA),
        localXZ=[r.sword(0x7038), r.sword(0x7040)],
        boundFloor=r.word(0x7138), travelFloor=r.word(0x7158), liftTarget=r.sword(0x6F3A),
        liftPeriodCountdown=[r.word(0x6F3C), r.word(0x6F3E)], liftAttachment=r.word(0x717E),
        candidateProximity=r.word(0x71F6), selectedSlot=r.long(0x71DE)//4, selectedKey=r.long(0x71DA),
        stack=list(r.bytes(0x563E, 0x563E+count)),
        held=[s for s in range(1, 247) if r.byte(0x641E+4*s) & 128],
        keyHeld={str(s): bool(r.byte(0x641E+4*s) & 128) for s in (31,32,38)},
        keyDoors=[dict(offset=a-0x3E18, control=r.byte(a), latch=r.sbyte(a+1),
                       key=r.byte(a+3)) for a in (0x4068,0x4064)],
        objects={str(s): dict(state=r.byte(0x641E+4*s), group=r.byte(0x641D+4*s),
            zone=r.byte(0x641F+4*s), residence=list(r.bytes(0x681C+4*s, 0x6820+4*s)),
            xyz=[r.slong(a+4*s) for a in (0x581C,0x5C1C,0x601C)]) for s in (31,32,99,218,224)},
        vm=owners.observe(r)['vm'], availability={str(s): r.byte(0x7352+s) for s in (5,6,115)},
        flags=list(r.bytes(0x7270,0x7278)), messageBusy=r.word(0x723A), messageContinuation=r.sword(0x7230),
        card=list(r.bytes(0x6F0E,0x6F12)), elapsedSeconds=r.long(0x6FCE),
        pendingAlarmOrFailure=r.word(0x70F8),
        modelWords={str(s): r.word(r.long(0x4BD10)+2*s) for s in (97,218)})


def verify_capture(r: Ram, expected_sha: str, frame: int, ticks: int) -> None:
    if (r.sha256, r.word(0x7180), r.long(0x53094)) != (expected_sha, frame, ticks):
        raise ValueError('capture identity/frame/tick mismatch')


def verify_commands(lines: list[str], seed_ticks: int) -> None:
    for line in lines:
        if line.startswith('w '):
            match = re.fullmatch(r'w \$([\da-fA-F]+) ((?:\$[\da-fA-F]{2} ?)+)', line)
            if not match:
                raise ValueError('unrecognized debugger write')
            try:
                owners.verify_write(int(match[1],16), bytes(int(v,16) for v in match[2].replace('$','').split()), seed_ticks)
            except AssertionError as error:
                raise ValueError('foreign debugger write') from error
        elif line.startswith('r ') and line != 'r sr=$2700':
            raise ValueError('supplied semantic register')
        elif not (line in ('r','r sr=$2700','c','quit','setopt --cpuclock 32') or line.startswith(('b ', 'm ', 'echo ', 'e VBL',
                  'savebin ', 'screenshot ', 'statesave ', 'stateload '))):
            raise ValueError('unrecognized debugger command')


def trace_phases(rows: list[dict], seed_frame: int, seed_ticks: int) -> tuple[dict, int]:
    """A restored top finishes its current frame before the next TOP callback."""
    tops = [row for row in rows if row['label'] == 'TOP']
    if not tops or any((row['frame'], row['ticks']) !=
                      (seed_frame+i+1, seed_ticks+11*(i+1)) for i,row in enumerate(tops)):
        raise ValueError('nonconsecutive original TOP phase')
    ticks = {row['frame']:row['ticks'] for row in tops}
    initial, seen_top = 0, False
    for row in rows:
        seen_top |= row['label'] == 'TOP'
        if row['frame'] == seed_frame and not seen_top:
            if row['ticks'] != seed_ticks:
                raise ValueError('foreign restored-source trace phase')
            initial += 1
        elif ticks.get(row['frame']) != row['ticks']:
            raise ValueError('foreign in-frame trace phase')
    return ticks, initial


def build(root: Path = RAW) -> dict:
    checks = []
    def check(name: str, condition: bool) -> None:
        if not condition:
            raise AssertionError(name)
        checks.append(name)
    source = Ram.load(REPO/'restricted/mercenary-iii-708/presentation/exact2/start.ram')
    check('coherent mutable source', source.sha256 == owners.native.owners.SOURCE_SHA)
    pins = [dict(role=role, **source.require(lo, hi, expected, role)) for lo,hi,role,expected in PINS]
    check('unchanged R1 harness', sha(REPO/'restricted/mercenary-iii-770/harness.py') == owners.native.owners.HARNESS_SHA)
    floors = []
    for floor,lo,hi,expected in ((0,0x10c3e,0x10fa7,'a5a4e739aeb0d7b0cb201d6e498d0b208c13a3fc95d61a59fc63d1b066f635ce'),
                                 (10,0x106a8,0x10c19,'dc811cdd5896e9d33da12356dff278eee60084aa3ddf31b582c90fc71ef37f65')):
        binding = floor_binding(source,49,floor)
        geometry = decode_structure(source,binding['record'],binding['scale'])
        source.require(lo,hi,expected,'HQ floor geometry')
        floors.append(dict(binding=binding,geometryProvenance=geometry['provenance'],
            regions=geometry['regions'],attachments=geometry['attachments'],associations=geometry['associations']))
    graphs = []
    graph_files = {'progression':('restricted/mercenary-iii-703/progression/scripts.json',
        'fdfa162d12c54b8b20b7c2a5537bce5f57c3b2e4f1ce47681df3f24785de2072'),
        'effects':('restricted/mercenary-iii-771/effects/static.json',
        'ed5aa5ebfab747659c4c31ae33643698e2b67fde92637a29cd93ca8340e5ff39')}
    for name,(path,expected) in graph_files.items():
        check(name+' VM graph metadata pin',sha(REPO/path)==expected)
    progression = json.loads((REPO/graph_files['progression'][0]).read_text())
    effects = json.loads((REPO/graph_files['effects'][0]).read_text())
    for number,graph in [(5,next(g for g in progression if g['n']==5)),
                         (6,next(g for g in progression if g['n']==6)),(115,effects['closures']['73'])]:
        check('script'+str(number)+' complete retained graph extent',len(graph['instructions'])=={5:34,6:46,115:28}[number])
        for instruction in graph['instructions']:
            lo,hi = (int(a[1:],16) for a in instruction['source']['range'])
            source.require(lo,hi,instruction['source']['sha256'],'HQ VM instruction')
        check('script'+str(number)+' graph has no direct object-bit or model-swap operation',all(
            i['name'] not in ('object_bit','model_swap_a','model_swap_b') for i in graph['instructions']))
        graphs.append(dict(script=number,entry=graph['entry'],sites=len(graph['instructions']),
            instructionPins=[i['source'] for i in graph['instructions']]))
    families, traces = {}, {}
    for name in FAMILIES:
        directory = root/name
        manifest = json.loads((directory/'manifest.json').read_text())
        origin = reader.retained(manifest['source'])
        seed = Ram.load(origin.with_suffix('.ram'))
        run = reader.retained(manifest['run'])
        check(name+' source and whole-machine checkpoint', seed.sha256 == manifest['sourceRamSha256']
              and sha(origin.with_suffix('.sav')) == manifest['sourceSavSha256']
              and sha(run/'ck.sav') == manifest['sourceSavSha256'])
        check(name+' declared original instrumentation', manifest['cpu'] == 32
              and manifest['waitSha256'] == owners.native.owners.WAIT_SHA
              and manifest['patchSha256'] == owners.native.owners.PATCH_SHA
              and (manifest['baseFrame'],manifest['baseTicks']) == (seed.word(0x7180),seed.word(0x53096)))
        check(name+' only mailbox inputs', all(re.fullmatch(r'w \$(56726|7056) \$[\da-f]{2}', line)
              for _, lines in manifest['events'] for line in lines))
        check(name+' declared/generated input agreement', all(
              (root/'scripts'/f'{name}-input-{manifest["baseFrame"]+offset}.ini').read_text().splitlines() == lines
              for offset,lines in manifest['events']))
        files = [*run.glob('*.ini'),run/'ck.sav.debug',
                 *list((root/'scripts').glob(f'{name}-input-*.ini')),
                 *list((root/'scripts').glob(f'{name}-capture-*.ini')),root/'scripts'/f'{name}-end.ini']
        audited = {p.resolve() for p in files}
        for path in files:
            lines = path.read_text().splitlines()
            verify_commands(lines,seed.word(0x53096))
            for line in lines:
                if ':file ' in line:
                    check(name+' audited breakpoint callback',Path(line.split(':file ',1)[1]).resolve() in audited)
                if line.startswith('stateload '):
                    check(name+' only retained machine restore',Path(line.split(' ',1)[1]).resolve() == (run/'ck.sav').resolve())
        generated = sorted([str(p.resolve().relative_to(root.resolve())),sha(p)] for p in files)
        rows = reader.traces(run/'hatari.log')
        traces[name] = rows
        tops = [r for r in rows if r['label']=='TOP']
        check(name+' complete eleven-tick frames',len(tops)>1 and all(
              (b['frame']-a['frame'],b['ticks']-a['ticks']) == (1,11) for a,b in zip(tops,tops[1:])))
        ticks, initial_traces = trace_phases(rows,seed.word(0x7180),seed.long(0x53094))
        check(name+' restored-source and in-frame trace phases',True)
        captures = {}
        for path in sorted(directory.glob('*.ram')):
            r = Ram.load(path)
            check(name+'/'+path.stem+' original observed top',r.word(0x7180) in ticks)
            verify_capture(r,r.sha256,r.word(0x7180),ticks[r.word(0x7180)])
            for lo,hi,role,expected in (*PINS,*owners.PINS):
                r.require(lo,hi,expected,name+'/'+path.stem+' '+role)
            row = observe(r)
            if path.stem.startswith('f'):
                offset = int(path.stem[1:])
                check(name+'/'+path.stem+' scheduled phase',row['frame'] == seed.word(0x7180)+offset
                      and row['ticks'] == seed.long(0x53094)+11*offset)
            check(name+'/'+path.stem+' independent carried, held and PCB owners',row['stack']==[104,103,135]
                  and row['keyHeld']=={'31':False,'32':False,'38':True}
                  and row['objects']['218']['state']==4
                  and row['objects']['218']['residence']==[100,15,10,18]
                  and row['availability']['115']==160 and row['card']==[104,5,4,0])
            captures[path.stem] = row
        check(name+' all selected captures retained',{int(k[1:]) for k in captures if k.startswith('f')}
              == set(manifest['captures']))
        families[name] = dict(classification='ordinary original mailbox input',
            source=str(origin.relative_to(REPO)),sourceRamSha256=seed.sha256,
            sourceCheckpointSha256=manifest['sourceSavSha256'],manifestSha256=sha(directory/'manifest.json'),
            logSha256=sha(run/'hatari.log'),generatedDebuggerFiles=generated,inputs=manifest['events'],
            topCount=len(tops),elevenTickGaps=len(tops)-1,restoredSourceTraceCount=initial_traces,captures=captures,
            doorPredicates={label:dict(count=len(selected),
                heldOffsets=sorted({r['registers']['D6'] & 65535 for r in selected}),
                attachmentOffsets=sorted({r['registers']['A0'] for r in selected}),
                firstPhase=[selected[0]['frame'],selected[0]['ticks']] if selected else None,
                lastPhase=[selected[-1]['frame'],selected[-1]['ticks']] if selected else None)
                for label in ('DOOR_KEY','DOOR_LOCKED')
                for selected in ([r for r in rows if r['label']==label],)},
            actionOrder=[dict(label=r['label'],frame=r['frame'],ticks=r['ticks'],
                registers=r['registers'],**({'selectedSlot':r['selectedSlot'],'selectedKey':r['selectedKey']}
                    if 'selectedSlot' in r and r['label']!='TOP' else {})) for r in rows if r['label'] not in ('TOP','DOOR_KEY','DOOR_LOCKED')])
    cap = lambda family,cut:families[family]['captures'][cut]
    check('retained original TOURCRAFT foot checkpoint',families['approach-b']['sourceRamSha256'] ==
          'b5dbaaf62840925bfa6b94393334157e50baa80dc932f6419d7eb482f8388db6')
    routes = json.loads((REPO/'research/mercenary-iii-st/object-interaction-r3-routes.json').read_text())
    check('retained transport checkpoint is pinned by prior route ledger',
          families['approach-b']['sourceRamSha256'] == routes['transportPrefixCheckpoint']['tolosaTop']['sha256']
          and families['approach-b']['sourceCheckpointSha256'] == routes['families']['tolosa-taxicard']['sourceCheckpointSha256'])
    predecessors = {'approach-c':('approach-b','f1860'), 'entry-lift':('approach-c','f350'),
        'basement-hall':('entry-lift','f200'), 'key31-door':('basement-hall','f200'),
        'key31-centre':('key31-door','f200'), 'lift-replay':('entry-lift','f129'),
        'hall-replay':('basement-hall','f107'), 'door-replay':('key31-door','f107'),
        'centre-replay':('key31-centre','f23')}
    for name,(parent,cut) in predecessors.items():
        expected_origin = root/parent/cut
        check(name+' retained ordinary predecessor',families[name]['sourceRamSha256']==cap(parent,cut)['sha256']
              and (REPO/families[name]['source']).resolve()==expected_origin.resolve()
              and families[name]['sourceCheckpointSha256']==sha(expected_origin.with_suffix('.sav')))
    check('ordinary HQ entrance and lift region',cap('entry-lift','f111')['region']==1
          and cap('entry-lift','f111')['regionFlags'] & 8192 != 0
          and cap('entry-lift','f111')['localXZ']==[122,-2089])
    check('B requests10 before original lift binds10',cap('entry-lift','f130')['boundFloor']==0
          and cap('entry-lift','f131')['liftTarget']==10 and cap('entry-lift','f150')['boundFloor']==10
          and cap('entry-lift','f150')['travelFloor']==10 and cap('entry-lift','f150')['eye'][1]==1563)
    for name,script in [('entry-lift',5),('basement-hall',6)]:
        requests = [r for r in traces[name] if r['label']=='SCRIPT_REQUEST']
        check(name+' original location script request',len(requests)==1 and requests[0]['registers']['D1'] & 65535 == script)
    check('east hallway clamps and retains fixed table224 as target',cap('basement-hall','f136')['localXZ']==[506,-1909]
          and cap('basement-hall','f151')['region']==12 and cap('basement-hall','f151')['selectedSlot']==224)
    check('hall Take has no acquisition or response', [r['label'] for r in traces['basement-hall']
          if r['label'] in ('TAKE','TAKE_ACCEPT','PICKUP_RESPONSE')] == ['TAKE'])
    check('centre keyed throat stays region9 with closed key31 door',all(
          cap('key31-centre',cut)['localXZ']==[-94,-1920]
          and cap('key31-centre',cut)['region']==9
          and cap('key31-centre',cut)['keyDoors'][0]['key']==31
          and cap('key31-centre',cut)['keyDoors'][0]['latch']==0 for cut in ('f14','f31','f40','f61','f80')))
    door_reads = [r for r in traces['key31-door'] if r['label']=='DOOR_KEY']
    denied = [r for r in traces['key31-door'] if r['label']=='DOOR_LOCKED']
    check('native door predicate reads resolved31 and takes absent-key branch',bool(door_reads)
          and len(door_reads)==len(denied) and all(r['registers']['D6'] & 65535 ==124
          and r['registers']['A0']==592 for r in door_reads))
    check('movement requests original locked message0',any(r['label']=='REFUSAL_STRING'
          and r['registers']['D1'] & 65535 ==0 for r in traces['key31-door']))
    check('original reception and meeting availability consumed',cap('entry-lift','f111')['availability']['5']==32
          and cap('basement-hall','f79')['availability']['6']==32)
    check('PCB pickup response never launched',all(not any(r['label'] in ('TAKE_ACCEPT','PICKUP_RESPONSE')
          for r in rows) for rows in traces.values()))
    restores = []
    for replay,original,delta in [('lift-replay','entry-lift',129),('hall-replay','basement-hall',107),
                                ('door-replay','key31-door',107),('centre-replay','key31-centre',23)]:
        for cut,row in families[replay]['captures'].items():
            if not cut.startswith('f'):continue
            reference = 'f'+str(int(cut[1:])+delta)
            check(replay+'/'+cut+' full-RAM original future',row['sha256']==cap(original,reference)['sha256'])
            restores.append(dict(replay=replay,cut=cut,original=original,originalCut=reference,sha256=row['sha256']))
    return dict(schemaVersion=1,issue=772,kind='ordinary-tolosa-hq-native-boundary-evidence',
        sourceSha256=source.sha256,sourcePins=pins,floors=floors,scriptGraphs=graphs,
        graphFiles={name:dict(path=path,sha256=expected) for name,(path,expected) in graph_files.items()},
        captureSourceComparisons=sum(len(f['captures']) for f in families.values())*(len(PINS)+len(owners.PINS)),
        generatorSha256=sha(Path(__file__)),probeSha256=sha(root/'probe.py'),
        plansSha256=sha(root/'plans.json'),priorRouteLedgerSha256=sha(REPO/'research/mercenary-iii-st/object-interaction-r3-routes.json'),
        families=families,restoredFutures=restores,assertions=checks,
        limits=['ordinary PCB acquisition remains unproved; no response115 launch',
                'key31 door was tested absent; key32 throat and remote key acquisitions remain static-only',
                'candidate64 under sentinel key is not an eligible PCB refusal',
                'original locked request is distinct from busy-gated display; sound output was disabled',
                'whole-machine comparisons do not certify a browser Save codec or final admission'])


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out',type=Path,default=OUT)
    args = parser.parse_args()
    result = build()
    if args.out == OUT and OUT.exists():
        if result != json.loads(OUT.read_text()):
            raise SystemExit('committed HQ ledger differs; inspect before updating')
    else:
        args.out.write_text(json.dumps(result,indent=2,sort_keys=True)+'\n')
    print(f'{len(result["families"])} ordinary families; '
          f'{sum(len(f["captures"]) for f in result["families"].values())} cuts; '
          f'{len(result["assertions"])} assertions; {len(result["restoredFutures"])} full-RAM restored cuts')
