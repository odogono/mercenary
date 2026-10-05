"""Read-only ordinary CLOTHO key31 and HQ-return evidence (#772)."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re

from m3lab.ram import Ram

import importlib.util

REPO = Path(__file__).resolve().parents[3]
RAW = REPO / 'restricted/mercenary-iii-772/clotho-key31'
OUT = REPO / 'research/mercenary-iii-st/clotho-key31-evidence.json'
PINS = (
    (0x52860,0x52910,'VM dispatch and opcode table','27c9ec0a2fc86eaf6334a182c17ad05af99ec30139bc2394495c8f8f4dff9539'),
    (0x52b40,0x52f6a,'VM branch Return held flag and timer owners','866487842aa6e2b5795ff7e938b5213eba77db5d6f37da380e6dcc6e525f2ae6'),
    (0x55a0e,0x55a7e,'script launch availability and queue gates','c1e2c33931582856e1598012f8253d0564a079df6fb60e1ddb34a926c4539754'),
    (0x52ff2,0x53002,'signed programme request writer','941695aa41afbe7d48e48a0e9ec35d6523aadc01733601725c4ab2f4f8aa5d3c'),
    (0x22f0c,0x22f20,'HQ location records including key corridor','252220c0c9e47511ac9a9ba4f7d3be78a8cad8305a29dd41bdc850088fc301c5'),
    (0x74645,0x7464d,'key corridor script117','de9733fca05830d2bf88a117f9414e832163c3d67972277b722922b4ce611fdd'),
    (0x5900a,0x59042,'surface motion selection','4907605fd3e56f0120770a57d062638b0b184150c77a5fe87826cd5b3fc4389b'),
    (0x59042,0x593be,'surface motion and contact','9e1c00414a33d44a5a98218870ded09f93f1a55b8680cd19834829c73b6624ae'),
    (0x593c8,0x5946c,'surface swing and altitude','9a44f032115e062fd1bc2c6f50438b20a05dbffb863d4efb6f41668e685b853c'),
    (0x58db6,0x58e24,'hard touchdown and native Leave','9955af89fcec811615fc07f325ac386c50d3b802158d2e86e14bb4760548ed27'),
    (0x10c3e,0x10fa7,'shared ground floor record','a5a4e739aeb0d7b0cb201d6e498d0b208c13a3fc95d61a59fc63d1b066f635ce'),
    (0x106a8,0x10c19,'HQ basement record','dc811cdd5896e9d33da12356dff278eee60084aa3ddf31b582c90fc71ef37f65'),
    (0x511a8,0x511d8,'native actor and request clear','9f4364e7663c7e3285f5c487725beb650c956282bb07095c43a50aee7cf5251b'),
    (0x759d2,0x75d25,'election entry and bank continuations','7db5c9f0c425672a960ac1d5bb37156ac37a8a447aa41bdb472addacd4b081c3'),
    (0x53d6a,0x53e5e,'native nearest-body scan','05ec5143627a58e7404cfe8881a131823229e316011e5cff228ffaa11f1a2bfd'),
    (0x53f3c,0x53f70,'arrival guard','a6970036e2adfd3e501c75c087db30e2731c294635052c5feca49664aaaf24fe'),
    (0x59502,0x59a36,'native space motion','14e7248a3abd257425e1d6ab769f688a9ac2c44433e44fcc795a9a99f203a474'),
    (0x4ef02,0x4f0d6,'arrival coordinates and atan','30760ce57aa315a6ca7d7ba634064a88763cd0fa4bed1cebeda8d5edfcf96873'),
    (0x5a15e,0x5a27c,'native body entry','47b7defe0811a15336c0ba84a60e6ac36c97348eec11f5462bf5d482502154c1'),
    (0x5600c,0x560e2,'building binding and origin','9fe59aabfc246d737e2e0b5ca98430ca25381d70b682f659669ebf9acc11886a'),
    (0x53c7c,0x53cbe,'indoor resident binding','d3923b4d48781634c37531174e03cfcacfd4879cb99b42c10b5821153b877467'),
    (0x55364,0x55448,'ordinary Take','097dd1d06089a1d0a3491c6c68a7f576af2eb8c8b2d6599e0255643ba4333aa3'),
    (0x555d4,0x555f6,'pickup responses','2c988d652654cbc0289fe4c6422471c6700876aed3f5a9bee279a90a95905ff8'),
    (0x4f2a6,0x4f2bc,'label tail to trigger pointer','564c8fd44681bba6b45ac5217bb06ae1eb0955b2afa4b874a18c12120d6f739a'),
    (0x5b6be,0x5b714,'location trigger','b7e5864b60b1b6090a69e79bf682068433fc3c608a84b17f59d7aa041575a748'),
    (0x761c8,0x761d1,'BIL ground script','868970409cd7aa163275970e7b6c44311b069a83c71c00a521f7d4feff63cffd'),
    (0x523e0,0x52448,'programme request consumer','9fd5691782815bcea3c23c6530dad09f584571007ec3d9d63ccd137286fc9e6c'),
    (0x52056,0x520a6,'actor path/model selection','d0e273e4d1dc08b867158427bf2248f55a7d2972423d286fdcf92fa804b67eea'),
    (0x5a3d0,0x5a41a,'campaign and timer dispatch','1dc78a8beaddb5fd75590489db14e619cece3db6e45b27df84af3348a3927db2'),
    (0x1a858,0x1a875,'BIL alias/floors','3350c521f5656fcd11b8eb1a7617b212e2c01b60632d884174851d6e267baef2'),
)


def module(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


hq = module('clotho_hq', 'tolosa-hq-evidence.py')
native = module('clotho_native', 'eagle-natural-encounters.py')
LABELS = tuple(dict.fromkeys((*hq.reader.LABELS, *native.LABELS, 'SPACE_ENTER',
                            'LEAVE', 'BOARD_ACCEPT', 'HARD_TOUCHDOWN')))


def observe(r: Ram) -> dict:
    row = hq.observe(r)
    row['interactionOwners'] = hq.owners.observe(r)
    row['availability'].update({str(n):r.byte(0x7352+n) for n in (117,119)})
    for slot in (3,34,40,71,97,181):
        row['objects'][str(slot)] = dict(state=r.byte(0x641E+4*slot), group=r.byte(0x641D+4*slot),
            zone=r.byte(0x641F+4*slot), residence=list(r.bytes(0x681C+4*slot,0x6820+4*slot)),
            xyz=[r.slong(a+4*slot) for a in (0x581C,0x5C1C,0x601C)])
    row['modelSwapStateBits'] = r.word(0x6e84)
    row.update(craft=r.sword(0x7144),pitch=r.word(0x7154),speed=r.long(0x700A),
        throttle=r.long(0x7248),contact=r.word(0x715E),landBits=r.word(0x6F56),
        passenger=r.word(0x6EB2),playback=r.word(0x70A2),
        system=[r.slong(a) for a in (0x702A,0x702E,0x7032)],arrivalHold=r.word(0x71A2),
        nearest=r.long(0x6FB6),range=r.long(0x6FAE),rotations={str(b):r.word(0x575A+b) for b in (24,48,100)},
        programme=dict(requestBits=r.word(0x6FF48),cursor=r.long(0x6E88),timerBits=r.word(0x6E86),
            budget=r.word(0x6E8C),pairs=[list(r.bytes(a,a+2)) for a in range(0x6E50,0x6E84,2)]),
        actors=[dict(slot=s,stateBits=r.word(0x5492+4*s),
            xyz=[r.slong(a+4*s) for a in (0x581C,0x5C1C,0x601C)],
            residence=list(r.bytes(0x681C+4*s,0x6820+4*s)),
            model=r.word(r.long(0x4BD10)+2*s)) for s in range(56,60)],
        shotStates=[r.word(0x5492+4*s) for s in range(50,60)],
        soundPriority=r.word(0x7110),bVector=r.long(0x4BF54),cVector=r.long(0x4BF58),
        rngCursor=r.long(0x75A6),script140Availability=r.byte(0x7352+140))
    return row


def traces(path: Path) -> list[dict]:
    rows, current = [], None
    for line in path.read_text(errors='replace').splitlines():
        label = re.match(r'^(\w+)= .*#(\d+) \(dec\)',line)
        if label:
            current = dict(label=label[1],vbl=int(label[2]),memory={},registers={}) if label[1] in LABELS else None
            if current is not None:rows.append(current)
        if current is None:continue
        for register,value in re.findall(r'\b([DA][0-7]) ([0-9A-F]{8})\b',line):
            current['registers'][register] = int(value,16)
        memory = re.match(r'^([\da-fA-F]{8}): ((?:[\da-fA-F]{2} ){1,16})',line)
        if memory:
            current['memory'].update({int(memory[1],16)+i:int(b,16) for i,b in enumerate(memory[2].split())})
    for row in rows:
        memory = row.pop('memory')
        def v(a: int,n: int=2) -> int:
            return int.from_bytes(bytes(memory[a+i] for i in range(n)),'big')
        row.update(frame=v(0x7180),ticks=v(0x53094,4),selector=v(0x7142),body=v(0x713C),
            eye=[v(a,4) for a in (0x7146,0x714A,0x714E)],
            selectedKey=v(0x71DA,4),selectedSlot=v(0x71DE,4)//4)
    return rows


def trace_phases(rows: list[dict],seed_frame: int,seed_ticks: int) -> dict:
    indexed = [(i,r) for i,r in enumerate(rows) if r['label']=='TOP']
    tops = [r for _,r in indexed]
    if not tops or (tops[0]['frame'],tops[0]['ticks']) != (seed_frame+1,seed_ticks+11):
        raise ValueError('foreign first TOP phase')
    zero = 0
    for (before,a),(after,b) in zip(indexed,indexed[1:]):
        gap = (b['frame']-a['frame'],b['ticks']-a['ticks'])
        if gap==(1,11):continue
        transition = {(2,0):'BODY_ENTER',(0,2):'SPACE_ENTER'}.get((a['selector'],b['selector']))
        if gap!=(0,0) or transition is None or not any(r['label']==transition and
                (r['frame'],r['ticks'])==(b['frame'],b['ticks']) for r in rows[before+1:after]):
            raise ValueError('unwitnessed native reentry or foreign tick phase')
        zero += 1
    ticks = {r['frame']:r['ticks'] for r in tops}
    initial,seen_top = 0,False
    for row in rows:
        seen_top |= row['label']=='TOP'
        if row['frame']==seed_frame and not seen_top:
            if row['ticks']!=seed_ticks:raise ValueError('foreign source trace phase')
            initial += 1
        elif ticks.get(row['frame'])!=row['ticks']:
            raise ValueError('foreign in-frame trace phase')
    return dict(topCount=len(tops),elevenTickGaps=len(tops)-1-zero,
                zeroTickReentries=zero,restoredSourceTraceCount=initial,ticks=ticks)


def verify_future(original: Ram, restored: Ram) -> dict:
    if original.data!=restored.data:
        raise ValueError('restored future differs from complete original RAM')
    return dict(sha256=original.sha256,frame=original.word(0x7180),ticks=original.long(0x53094),bytesCompared=0x100000)


def door_summary(rows: list[dict]) -> dict:
    summary = {}
    for label in ('DOOR_KEY','DOOR_LOCKED'):
        selected = [r for r in rows if r['label']==label]
        pairs = {}
        for row in selected:
            key = (row['registers']['A0'],row['registers']['D6'] & 65535)
            phase = [row['frame'],row['ticks']]
            if key not in pairs:
                pairs[key] = dict(attachmentOffset=key[0],heldOffset=key[1],count=0,firstPhase=phase)
            pairs[key]['count'] += 1
            pairs[key]['lastPhase'] = phase
        summary[label] = dict(count=len(selected),pairs=[pairs[key] for key in sorted(pairs)])
    return summary


def build(root: Path=RAW) -> dict:
    checks=[]
    def check(name: str,condition: bool):
        if not condition:raise AssertionError(name)
        checks.append(name)
    source=Ram.load(REPO/'restricted/mercenary-iii-708/presentation/exact2/start.ram')
    check('coherent mutable source',source.sha256==hq.owners.native.owners.SOURCE_SHA)
    check('unchanged R1 harness',hq.sha(REPO/'restricted/mercenary-iii-770/harness.py')==hq.owners.native.owners.HARNESS_SHA)
    pins=tuple(dict.fromkeys((*PINS,*hq.PINS,*hq.owners.PINS,*native.PINS)))
    source_pins=[dict(role=role,**source.require(lo,hi,expected,role)) for lo,hi,role,expected in pins]
    graph_path=REPO/'restricted/mercenary-iii-703/progression/scripts.json'
    check('script140 graph metadata pin',hq.sha(graph_path)=='fdfa162d12c54b8b20b7c2a5537bce5f57c3b2e4f1ce47681df3f24785de2072')
    graph=next(g for g in json.loads(graph_path.read_text()) if g['n']==140)
    check('script140 complete retained extent',len(graph['instructions'])==12)
    for instruction in graph['instructions']:
        lo,hi=(int(a[1:],16) for a in instruction['source']['range'])
        source.require(lo,hi,instruction['source']['sha256'],'script140 instruction')
    election=next(g for g in json.loads(graph_path.read_text()) if g['n']==119)
    check('election119 retained graph extent',len(election['instructions'])==70)
    for instruction in election['instructions']:
        lo,hi=(int(a[1:],16) for a in instruction['source']['range'])
        source.require(lo,hi,instruction['source']['sha256'],'election119 instruction')
    corridor=next(g for g in json.loads(graph_path.read_text()) if g['n']==117)
    check('HQ corridor117 retained graph extent',len(corridor['instructions'])==6)
    for instruction in corridor['instructions']:
        lo,hi=(int(a[1:],16) for a in instruction['source']['range'])
        source.require(lo,hi,instruction['source']['sha256'],'HQ corridor117 instruction')
    plans=json.loads((root/'plans.json').read_text())
    prior_path=REPO/'research/mercenary-iii-st/object-interaction-r3-followup.json'
    check('pinned ordinary native prefix ledger',hq.sha(prior_path)=='7e3a5bcdb99b06912b56787fd731edeefb97bfaf6de81c50c844c2f2e16e6a4d')
    prior=json.loads(prior_path.read_text())['families']['native-return']['captures']['f230']
    families={}
    for name,plan in plans.items():
        directory=root/name
        manifest=json.loads((directory/'manifest.json').read_text())
        origin=hq.reader.retained(manifest['source'])
        seed=Ram.load(origin.with_suffix('.ram'))
        run=hq.reader.retained(manifest['run'])
        declared=root/plan['source']
        check(name+' planned original source',origin.resolve()==declared.resolve())
        if name=='orient-clotho':
            check(name+' retained ordinary native prefix',origin.resolve()==(REPO/'restricted/mercenary-iii-772/followup/native-return/f230').resolve()
                  and seed.sha256==prior['sha256'] and hq.sha(origin.with_suffix('.sav'))==prior['checkpointSha256']
                  and (seed.word(0x7180),seed.long(0x53094))==(prior['frame'],prior['ticks']))
        else:
            parent,cut=Path(plan['source']).parts
            check(name+' exact earlier ordinary parent',parent in families and cut in families[parent]['captures']
                  and seed.sha256==families[parent]['captures'][cut]['sha256']
                  and hq.sha(origin.with_suffix('.sav'))==families[parent]['captures'][cut]['checkpointSha256'])
        check(name+' complete source machine pin',seed.sha256==manifest['sourceRamSha256']
              and hq.sha(origin.with_suffix('.sav'))==manifest['sourceSavSha256']
              and hq.sha(run/'ck.sav')==manifest['sourceSavSha256'])
        check(name+' pinned eleven-tick instrumentation',manifest['cpu']==32
              and manifest['waitSha256']==hq.owners.native.owners.WAIT_SHA
              and manifest['patchSha256']==hq.owners.native.owners.PATCH_SHA
              and (manifest['baseFrame'],manifest['baseTicks'])==(seed.word(0x7180),seed.word(0x53096)))
        expected_events=[[offset,[f'w ${"7056" if kind=="stick" else "56726"} ${value:02x}']] for offset,kind,value in plan['inputs']]
        check(name+' declared mailbox input agreement',manifest['events']==expected_events)
        check(name+' generated input agreement',all((root/'scripts'/f'{name}-input-{manifest["baseFrame"]+offset}.ini').read_text().splitlines()==lines
              for offset,lines in manifest['events']))
        files=[*run.glob('*.ini'),run/'ck.sav.debug',*list((root/'scripts').glob(f'{name}-input-*.ini')),
               *list((root/'scripts').glob(f'{name}-capture-*.ini')),root/'scripts'/f'{name}-end.ini']
        audited={p.resolve() for p in files}
        for path in files:
            lines=path.read_text().splitlines()
            hq.verify_commands(lines,seed.word(0x53096))
            for line in lines:
                if ':file ' in line:check(name+' audited callback',Path(line.split(':file ',1)[1]).resolve() in audited)
                if line.startswith('stateload '):check(name+' only retained restore',Path(line.split(' ',1)[1]).resolve()==(run/'ck.sav').resolve())
        rows=traces(run/'hatari.log')
        phase=trace_phases(rows,seed.word(0x7180),seed.long(0x53094))
        ticks=phase.pop('ticks')
        captures={}
        for path in sorted(directory.glob('*.ram')):
            r=Ram.load(path)
            check(name+'/'+path.stem+' observed original top',r.word(0x7180) in ticks)
            hq.verify_capture(r,r.sha256,r.word(0x7180),ticks[r.word(0x7180)])
            for lo,hi,role,expected in pins:r.require(lo,hi,expected,name+'/'+path.stem+' '+role)
            row=observe(r)
            if path.stem.startswith('f'):
                offset=int(path.stem[1:])
                check(name+'/'+path.stem+' scheduled phase',(row['frame'],row['ticks'])==(seed.word(0x7180)+offset,seed.long(0x53094)+11*offset))
            if path.with_suffix('.sav').exists():row['checkpointSha256']=hq.sha(path.with_suffix('.sav'))
            check(name+'/'+path.stem+' independent retained native key and craft',row['objects']['181']['state'] & 128 !=0
                  and row['keyHeld']['38'] and row['playback']==0)
            captures[path.stem]=row
        check(name+' scheduled terminal phase',
              (captures['end']['frame'],captures['end']['ticks'])==(seed.word(0x7180)+plan.get('endFrame',max(plan['captures'])+1),
                                                                               seed.long(0x53094)+11*plan.get('endFrame',max(plan['captures'])+1)))
        check(name+' all scheduled cuts retained',{int(k[1:]) for k in captures if k.startswith('f')}==set(manifest['captures'])==set(plan['captures']))
        families[name]=dict(source=str(origin.relative_to(REPO)),sourceRamSha256=seed.sha256,
            sourceCheckpointSha256=manifest['sourceSavSha256'],manifestSha256=hq.sha(directory/'manifest.json'),
            logSha256=hq.sha(run/'hatari.log'),generatedDebuggerFiles=sorted([str(p.resolve().relative_to(root.resolve())),hq.sha(p)] for p in files),
            inputs=manifest['events'],captures=captures,phase=phase,
            actionOrder=[r for r in rows if r['label'] not in ('TOP','DOOR_KEY','DOOR_LOCKED')],
            doorPredicates=door_summary(rows))
    restores = []
    for replay,parent,shift in (('arrival-replay','clotho-entry2',10),('landing-replay','bil-descent',90),
                                ('gentle-replay','bil-gentle',20),('take-replay','key31-take',79),
                                ('exterior-take-replay','key31-exterior-take',1),
                                ('tolosa-arrival-replay','tolosa-return-entry',24),
                                ('hq-landing-replay','hq-return-land',65),
                                ('hq-held-door-replay','hq-held-key31-door',70),
                                ('hq-return-lift-replay','hq-return-entry-lift',420),
                                ('hq-key32-pcb-replay','hq-key32-pcb-probe',26)):
        check(replay+' expected restore boundary',plans[replay]['source']==f'{parent}/f{shift}')
        for cut in plans[replay]['captures']:
            original = Ram.load(root/parent/f'f{cut+shift}.ram')
            restored = Ram.load(root/replay/f'f{cut}.ram')
            restores.append(dict(original=f'{parent}/f{cut+shift}',restored=f'{replay}/f{cut}',
                                 **verify_future(original,restored)))
            check(replay+f'/f{cut} exact complete RAM future',original.data==restored.data)
    original = Ram.load(root/'clotho-launch-failure/end.ram')
    restored = Ram.load(root/'slow-failure-replay/f1.ram')
    restores.append(dict(original='clotho-launch-failure/end',restored='slow-failure-replay/f1',
                         **verify_future(original,restored)))
    check('slow failure exact complete RAM future',original.data==restored.data)
    for family,before_cut,after_cut,frame,ticks in (
            ('key31-take','f79','f81',4293,47237),
            ('key31-exterior-take','f1','f3',4190,46104)):
        before=families[family]['captures'][before_cut]
        after=families[family]['captures'][after_cut]
        check(family+' independent original acquisition',not before['keyHeld']['31'] and after['keyHeld']['31']
              and before['stack']==[181,104,103,135] and after['stack']==[31,181,104,103,135]
              and before['objects']['31']['residence']==[24,4,0,1]
              and after['objects']['31']['residence']==[120,1,0,16])
        check(family+' actual native Take acceptance',any(r['label']=='TAKE_ACCEPT'
              and (r['frame'],r['ticks'],r['registers']['D3'],r['registers']['A0'])==(frame,ticks,31,124)
              for r in families[family]['actionOrder']))
        check(family+' no matched pickup response request',not any(r['label']=='SCRIPT_REQUEST'
              for r in families[family]['actionOrder']))
    check('indoor programme consumes original budget',families['bil-entry-walk']['captures']['f100']['programme']['budget']==2
          and any(r['label']=='SCRIPT_REQUEST' and r['registers']['D1']==140
                  for r in families['bil-entry-walk']['actionOrder']))
    check('exterior route avoids BIL trigger without supplied state',all(r['programme']['requestBits']==0
          and all(a['stateBits']==0 for a in r['actors'])
          for r in families['key31-exterior-take']['captures'].values()))
    check('bounded original hostile failure',families['clotho-launch-failure']['captures']['end']['pendingAlarmOrFailure']==1
          and any(r['label']=='HIT_FAILURE' for r in families['clotho-launch-failure']['actionOrder']))
    check('held key ordinary native departure',any(r['label']=='SPACE_ENTER' and r['frame']==4511
          for r in families['exterior-departure']['actionOrder'])
          and families['exterior-departure']['captures']['f420']['keyHeld']['31'])
    arrival=families['tolosa-return-entry']
    check('ordinary held-key TOLOSA arrival',any(r['label']=='ARRIVAL_ARM' and
          (r['frame'],r['ticks'],r['registers']['A0'])==(5953,65497,100) for r in arrival['actionOrder'])
          and arrival['captures']['f25']['body']==100 and arrival['captures']['f25']['keyHeld']['31'])
    check('original arrival clears election request and starts destination programme',
          arrival['captures']['f24']['programme']['requestBits']==0xffdb
          and arrival['captures']['f25']['programme']['requestBits']==0xffff
          and arrival['captures']['f30']['programme']['requestBits']==1
          and arrival['captures']['f30']['programme']['budget']==0)
    check('ordinary election requests remain consequential',sum(r['label']=='SCRIPT_REQUEST'
          and r['registers']['D1']==119 for r in families['tolosa-east-cruise']['actionOrder'])==3
          and arrival['captures']['f24']['availability']=={'5':0,'6':0,'115':160,'117':160,'119':32}
          and arrival['captures']['f24']['flags']==[0,128,162,0,0,0,0,0]
          and arrival['captures']['f24']['objects']['34']['state']==5)
    landed=families['hq-return-land']['captures']['f67']
    check('native HQ landing publishes original craft residence',landed['selector']==1 and landed['contact']==63
          and landed['objects']['3']['residence']==[100,0,0,18]
          and landed['objects']['3']['xyz']==[179535605,0,103048593]
          and any(r['label']=='HARD_TOUCHDOWN' and (r['frame'],r['ticks'])==(7074,77828)
                  for r in families['hq-return-land']['actionOrder']))
    lift=families['hq-return-entry-lift']['captures']['f450']
    check('ordinary held-key HQ B lift',lift['boundFloor']==10 and lift['eye'][1]==1563
          and lift['localXZ']==[141,-2089] and lift['keyHeld']['31'])
    door=families['hq-held-key31-door']
    check('held-key31 native predicate avoids absent branch',door['doorPredicates']['DOOR_KEY']['pairs']==[
          dict(attachmentOffset=592,heldOffset=124,count=126,firstPhase=[7642,84076],lastPhase=[7658,84252])]
          and door['doorPredicates']['DOOR_LOCKED']['count']==0)
    check('key31 door opens and permits actual corridor crossing',
          door['captures']['f70']['keyDoors'][0]['latch']==0
          and door['captures']['f75']['keyDoors'][0]['latch']==1
          and door['captures']['f84']['region']==10 and door['captures']['f84']['keyDoors'][0]['latch']==-1
          and door['captures']['f86']['region']==11)
    check('opened corridor requests and consumes script117',any(r['label']=='SCRIPT_REQUEST'
          and (r['frame'],r['ticks'],r['registers']['D1'])==(7652,84186,117) for r in door['actionOrder'])
          and door['captures']['f84']['availability']['117']==160
          and door['captures']['f86']['availability']['117']==32
          and door['captures']['f86']['vm']['pc']==0x701dd
          and door['captures']['f86']['vm']['returns']==[0x766dc])
    check('absent key32 skips corridor model swap and restores caller',
          not any(r['label'] in ('MODEL_SWAP_A','MODEL_SWAP_B') for r in door['actionOrder'])
          and door['captures']['f90']['vm']['pc']==0x766dc and door['captures']['f90']['vm']['returns']==[]
          and all(r['modelWords']=={'97':776,'218':34068} and r['objects']['97']['state']==20
                  and r['modelSwapStateBits']==0 for r in door['captures'].values()))
    pcb=families['hq-key32-pcb-probe']
    locked=pcb['doorPredicates']['DOOR_LOCKED']['pairs']
    check('independent key32 absent original door branch',any(p['attachmentOffset']==588 and p['heldOffset']==128
          and p['count']>0 for p in locked)
          and all(not r['keyHeld']['32'] and r['keyDoors'][1]['latch']==0 for r in pcb['captures'].values()))
    for cut,position,key in (('f59',[-32,-2418],594386),('f109',[-32,-2466],594372)):
        r=pcb['captures'][cut]
        check(cut+' eligible native PCB selection remains beyond Take range',r['selectedSlot']==218
              and r['selectedKey']==key and key>>16==9 and r['localXZ']==position)
    check('both selected PCB Take attempts do not accept or launch response',
          sum(r['label']=='TAKE' for r in pcb['actionOrder'])==2
          and not any(r['label'] in ('TAKE_ACCEPT','PICKUP_RESPONSE','SCRIPT_REQUEST') for r in pcb['actionOrder'])
          and all(r['objects']['218']['state']==4 and r['objects']['218']['residence']==[100,15,10,18]
                  and r['availability']['115']==160 for r in pcb['captures'].values()))
    return_names=list(families)[list(families).index('tolosa-orient'):]
    check('return cuts preserve independent acquired key and ordered inventory',all(
          r['keyHeld']['31'] and r['objects']['31']['state']==133
          and r['objects']['31']['residence']==[120,1,0,16] and r['stack']==[31,181,104,103,135]
          for name in return_names for r in families[name]['captures'].values()))
    return dict(schemaVersion=1,issue=772,kind='ordinary-clotho-key31-route-evidence',sourceSha256=source.sha256,
        sourcePins=source_pins,script140Graph=dict(entry=graph['entry'],sites=len(graph['instructions']),metadataSha256=hq.sha(graph_path),
        instructionPins=[i['source'] for i in graph['instructions']]),generatorSha256=hq.sha(Path(__file__)),
        election119Graph=dict(entry=election['entry'],sites=len(election['instructions']),instructionPins=[i['source'] for i in election['instructions']]),
        hq117Graph=dict(entry=corridor['entry'],sites=len(corridor['instructions']),instructionPins=[i['source'] for i in corridor['instructions']]),
        probeSha256=hq.sha(root/'probe.py'),plansSha256=hq.sha(root/'plans.json'),priorLedgerSha256=hq.sha(prior_path),
        families=families,restoreComparisons=restores,captureSourceComparisons=sum(len(f['captures']) for f in families.values())*len(pins),assertions=checks,
        limits=['Mailbox inputs and original whole-machine evidence, not physical IKBD or browser Save',
                'Finite route outcomes do not establish all-path exclusions or final content admission'])


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out',type=Path,default=OUT)
    args=parser.parse_args()
    result=build()
    if args.out==OUT and OUT.exists():
        if result!=json.loads(OUT.read_text()):raise SystemExit('committed CLOTHO ledger differs; inspect before updating')
    else:args.out.write_text(json.dumps(result,indent=2,sort_keys=True)+'\n')
    print(f'{len(result["families"])} families; {sum(len(f["captures"]) for f in result["families"].values())} cuts; {len(result["assertions"])} assertions')
