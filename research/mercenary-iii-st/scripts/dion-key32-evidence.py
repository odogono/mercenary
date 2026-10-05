"""Read-only ordinary DION key32 and returned HQ evidence (#772)."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
from m3lab.ram import Ram
import importlib.util

REPO = Path(__file__).resolve().parents[3]
RAW = REPO / 'restricted/mercenary-iii-772/dion-key32'
OUT = REPO / 'research/mercenary-iii-st/dion-key32-evidence.json'
spec = importlib.util.spec_from_file_location('dion_key32_prior',Path(__file__).with_name('clotho-key31-evidence.py'))
prior = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prior)


def observe(r: Ram) -> dict:
    row = prior.observe(r)
    row['capacity'] = r.word(0x7098)
    row['campaignFlags'] = {str(n):bool(r.long(0x7270)&(1<<n)) for n in (6,9,13,22)}
    row['floorDoorAttachments'] = [dict(offset=a-0x3E18,bytes=list(r.bytes(a,a+4)),latch=r.sbyte(a+1)) for a in (0x4064,0x4068,0x406C)]
    row['rotations']['16'] = r.word(0x575A+16)
    row['availability'].update({str(n):r.byte(0x7352+n) for n in (19,116,118,143,153)})
    row['cashF8'] = list(r.bytes(0x72DE,0x72E4))
    row['pathCursors'] = [dict(address=a,pointer=r.long(a),slotOffset=r.word(a-2)) for a in (0x523A2,0x523A8,0x523AE,0x523B6,0x523BE,0x523C4,0x523CC,0x523D2,0x523D8)]
    return row


def verify_parent(ram: Ram, checkpoint_sha: str, parent: dict) -> None:
    if (ram.sha256,checkpoint_sha,ram.word(0x7180),ram.long(0x53094)) != (
            parent['sha256'],parent['checkpointSha256'],parent['frame'],parent['ticks']):
        raise ValueError('foreign ordinary parent RAM/checkpoint/phase')


def verify_acquisition(before: dict, after: dict, slot: int, residence: list[int]) -> None:
    key = str(slot)
    if not (not before['keyHeld'][key] and after['keyHeld'][key]
            and before['objects'][key]['state'] == 5
            and after['objects'][key]['state'] == 133
            and before['objects'][key]['residence'] == residence
            and after['objects'][key]['residence'] == [120,1,0,16]
            and after['stack'] == [slot,*before['stack']]):
        raise ValueError('acquisition owners disagree')


def verify_pcb_acquisition(before: dict, after: dict) -> None:
    if not (218 not in before['held'] and 218 in after['held']
            and before['objects']['218']['state'] == 4
            and after['objects']['218']['state'] == 132
            and before['objects']['218']['residence'] == [100,15,10,18]
            and after['objects']['218']['residence'] == [120,1,0,16]
            and after['stack'] == [218,*before['stack']]):
        raise ValueError('PCB acquisition owners disagree')


def launches(row: dict, number: int) -> bool:
    # ADD.W and MOVEA.W retain the high half of D1 on queued launch paths.
    return row['label'] == 'SCRIPT_LAUNCH' and row['registers']['D1'] & 0xFFFF == 2*number


hq = prior.hq
prior.LABELS = (*prior.LABELS,'SCRIPT_LAUNCH','CASH_REPLACE','CELL_FF_REQUEST')
traces = prior.traces
trace_phases = prior.trace_phases
verify_future = prior.verify_future


def build(root: Path=RAW) -> dict:
    checks=[]
    def check(name: str,condition: bool):
        if not condition:raise AssertionError(name)
        checks.append(name)
    source=Ram.load(REPO/'restricted/mercenary-iii-708/presentation/exact2/start.ram')
    check('coherent mutable source',source.sha256==hq.owners.native.owners.SOURCE_SHA)
    check('unchanged R1 harness',hq.sha(REPO/'restricted/mercenary-iii-770/harness.py')==hq.owners.native.owners.HARNESS_SHA)
    prior_path=REPO/'research/mercenary-iii-st/clotho-key31-evidence.json'
    check('literal prior ordinary ledger',hq.sha(prior_path)=='1adc3587461ae9256d8da8f14612d842f3c9ac8ff80eef87195a2e76ebdec557')
    history=json.loads(prior_path.read_text())
    check('unchanged imported prior generator',hq.sha(Path(prior.__file__))==history['generatorSha256'])
    parent_root=history['families']['hq-key32-pcb-probe']['captures']['f130']
    inventory_path=REPO/'restricted/mercenary-iii-772/dion-key32-source/inventory.json'
    check('literal source inventory',hq.sha(inventory_path)=='7cc8b6275daae2677c3c77be802a5b37a99444fa948a34e45801ce8cd450c45d')
    extractor=inventory_path.with_name('extract.py')
    check('literal source extractor',hq.sha(extractor)=='9f1d3f73c40e688d99875634290719dca1d95a59efee4662111cbb816c38c937')
    inventory=json.loads(inventory_path.read_text())
    check('numbered progression metadata',hq.sha(REPO/'restricted/mercenary-iii-703/progression/scripts.json')
          =='fdfa162d12c54b8b20b7c2a5537bce5f57c3b2e4f1ce47681df3f24785de2072')
    check('timed effects metadata',hq.sha(REPO/'restricted/mercenary-iii-771/effects/static.json')
          =='ed5aa5ebfab747659c4c31ae33643698e2b67fde92637a29cd93ca8340e5ff39')
    additional=tuple((*[int(a[1:],16) for a in p['range']],p['role'],p['sha256']) for p in inventory['sourcePins'])
    data=tuple((*[int(a[1:],16) for a in p['range']],role,p['sha256']) for role,p in [('DION Body descriptors',inventory['body']['provenance']),('DION group28 placements and labels',inventory['group']['provenance']),('BIL MOTHERS geometry81',inventory['groundFloor']['geometry']['provenance'])])
    extra=((0x55794,0x558F6,'native Drop admission, support and ground fallback','6003065e6fc36cf325ce310b066589f951f56d8b1dff808feb27db0a4c25d90b'),
           (0x55E48,0x55ED0,'surface cell/cache binding','32c244111f1c05225a33cae0102d0bcb010ab4e94fc5cac05e79e60c50014323'),
           (0x55FE4,0x5600C,'low-altitude cell FF script caller','fbcda9d5459a79491abfea8fa37d059c31b8f562a6f2d90d885aee335a455997'),
           (0x56AE2,0x56B72,'complete Escape and Space clear wrapper','95f6fb603d3a319fe4e3acb531f6ad0b35b3bea7d2a115e154d398f31908548b'))
    supplement=REPO/'restricted/mercenary-iii-772/dion-key32-source/departure-ff.json'
    check('literal executed FF supplement',hq.sha(supplement)=='09ad3f055a3dda4126ce62bae32415784759e9fcdf908317c3084a08435c0c7d')
    supplement_extractor=supplement.with_name('departure-ff-extract.py')
    check('literal FF supplement extractor',hq.sha(supplement_extractor)=='a1e693acb1e47645f1d63bc032b18a50a7509e940e6556220f8dac300ead35be')
    pins=tuple(dict.fromkeys((*extra,*data,*prior.PINS,*hq.PINS,*hq.owners.PINS,*prior.native.PINS,*additional)))
    source_pins=[dict(role=role,**source.require(lo,hi,expected,role)) for lo,hi,role,expected in pins]
    for pin in inventory['initialDataPins']:
        lo,hi=(int(a[1:],16) for a in pin['range'])
        source.require(lo,hi,pin['sha256'],pin['role'])
    graph_pins=[]
    for graph in [*inventory['graphs'].values(),inventory['miningContinuation'],inventory['miningWait150'],inventory['pcb115']]:
        for instruction in graph['instructions']:
            pin=instruction['source']
            lo,hi=(int(a[1:],16) for a in pin['range'])
            source.require(lo,hi,pin['sha256'],'DION/HQ graph instruction')
            graph_pins.append(pin)
    plans=json.loads((root/'plans.json').read_text())
    families={}
    for name,plan in plans.items():
        directory=root/name
        manifest=json.loads((directory/'manifest.json').read_text())
        origin=hq.reader.retained(manifest['source'])
        seed=Ram.load(origin.with_suffix('.ram'))
        run=hq.reader.retained(manifest['run'])
        declared=root/plan['source']
        check(name+' planned original source',origin.resolve()==declared.resolve())
        if name=='hq-exit-to-lift':
            check(name+' retained prior root',origin.resolve()==(REPO/'restricted/mercenary-iii-772/clotho-key31/hq-key32-pcb-probe/f130').resolve())
            verify_parent(seed,hq.sha(origin.with_suffix('.sav')),parent_root)
        else:
            parent,cut=Path(plan['source']).parts
            check(name+' earlier ordinary parent',parent in families and cut in families[parent]['captures'])
            verify_parent(seed,hq.sha(origin.with_suffix('.sav')),families[parent]['captures'][cut])
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
            doorPredicates=prior.door_summary(rows))

    acquisition=families['key32-acquire']
    verify_acquisition(acquisition['captures']['f1'],acquisition['captures']['f3'],32,[16,7,0,68])
    check('key32 native acceptance',any(r['label']=='TAKE_ACCEPT' and
          (r['frame'],r['ticks'],r['registers']['D3'],r['registers']['A0'])==(11520,126734,32,128)
          for r in acquisition['actionOrder']))
    check('key32 near original candidate',acquisition['captures']['f1']['selectedSlot']==32
          and acquisition['captures']['f1']['selectedKey']==397564)
    check('key32 no matched pickup script',all(r['registers']['D1']==19
          for r in acquisition['actionOrder'] if r['label']=='SCRIPT_REQUEST'))
    house_names=[n for n in families if n.startswith('mothers-') or n.startswith('key32-')]
    check('finite DION house route no143 request',not any(r['label']=='SCRIPT_REQUEST' and r['registers']['D1']==143
          for name in house_names for r in families[name]['actionOrder']))
    check('DION house preserves original conditional programme',all(r['programme']['requestBits']==0
          and all(a['stateBits']==0 for a in r['actors']) and r['availability']['143']==224
          and not r['campaignFlags']['22'] for name in house_names for r in families[name]['captures'].values()))
    check('ordinary DION arm and entry',any(r['label']=='ARRIVAL_ARM' and
          (r['frame'],r['ticks'],r['registers']['A0'])==(9959,109563,16)
          for r in families['dion-intercept']['actionOrder'])
          and families['dion-intercept']['captures']['f60']['body']==16)
    check('ordinary house landing and foot exterior',families['mothers-land']['captures']['f110']['selector']==1
          and families['mothers-land']['captures']['f110']['region']==8
          and families['mothers-land']['captures']['f110']['localXZ']==[-2546,-336]
          and any(r['label']=='HARD_TOUCHDOWN' for r in families['mothers-land']['actionOrder']))
    check('three original house throats reach key room',families['mothers-entry']['captures']['f100']['region']==2
          and families['mothers-key-room']['captures']['f80']['region']==4
          and families['mothers-key-room']['captures']['f130']['region']==5
          and families['mothers-key-room']['captures']['f185']['region']==7)
    check('mining native launch consumes availability',any(launches(r,19)
          for r in families['dion-long-cruise']['actionOrder'])
          and families['dion-long-cruise']['captures']['f150']['availability']['19']==160
          and families['dion-long-cruise']['captures']['f200']['availability']['19']==32)
    check('mining native timed cash consequence',families['dion-long-cruise']['captures']['f150']['cashF8']==[0,81,0,144,0,0]
          and families['mothers-fine-orient']['captures']['f120']['cashF8']==[0]*6
          and any(r['label']=='CASH_REPLACE' and (r['frame'],r['ticks'],r['registers']['A0'])==(9795,107759,0x75B35)
                  for r in families['dion-near-cruise']['actionOrder']))
    departure=families['dion-departure']
    check('independent takeoff caller launches143',any(r['label']=='SCRIPT_REQUEST' and
          (r['frame'],r['ticks'],r['registers']['D1'])==(11940,131354,143) for r in departure['actionOrder'])
          and any(launches(r,143) for r in departure['actionOrder']))
    check('DION takeoff admits original three hostile actors',departure['captures']['f50']['programme']['cursor']==0x6E66
          and departure['captures']['f50']['programme']['requestBits']==253
          and departure['captures']['f50']['programme']['budget']==0
          and all(a['stateBits']!=0 and a['residence']==[16,0,0,0] for a in departure['captures']['f50']['actors'][:3])
          and departure['captures']['f50']['actors'][3]['stateBits']==0)
    check('DION hostile shot before native Space clear',any(r['label']=='HOSTILE_SHOT' and
          (r['frame'],r['ticks'])==(12003,132047) for r in departure['actionOrder'])
          and any(r['label']=='SPACE_ENTER' and (r['frame'],r['ticks'])==(12006,132080) for r in departure['actionOrder'])
          and departure['captures']['f90']['programme']['requestBits']==0
          and all(a['stateBits']==0 for a in departure['captures']['f90']['actors'])
          and departure['captures']['f160']['keyHeld']['32'])
    check('restored takeoff directly witnesses independent FF caller',any(r['label']=='CELL_FF_REQUEST' and
          (r['frame'],r['ticks'],r['registers']['D1'],r['registers']['D3'],r['registers']['A1'])
          ==(11940,131354,143,68,0x234DB) and r['eye']==[217612787,42151,85340514]
          for r in families['dion-departure-restore']['actionOrder']))
    hq_return=families['hq-second-native-entry']
    check('retained key32 native TOLOSA return',any(r['label']=='ARRIVAL_ARM' and
          (r['frame'],r['ticks'],r['registers']['A0'])==(13239,145643,100) for r in hq_return['actionOrder'])
          and any(r['label']=='BODY_ENTER' and (r['frame'],r['ticks'])==(13239,145643)
                  for r in hq_return['actionOrder'])
          and hq_return['captures']['f14']['body']==100 and hq_return['captures']['f14']['selector']==0)
    check('native HQ landing and Floor10 lift',families['hq-second-land']['captures']['f70']['localXZ']==[-2468,5466]
          and families['hq-second-land']['captures']['f70']['selector']==1
          and families['hq-second-entry-lift']['captures']['f380']['boundFloor']==10)
    door=families['hq-held-key32-door']
    check('held32 opens original second throat',door['captures']['f20']['region']==11
          and door['captures']['f28']['region']==14 and door['captures']['f36']['region']==15)
    check('door32 native held predicate without locked branch',door['doorPredicates']['DOOR_KEY']['pairs']==[
          dict(attachmentOffset=588,heldOffset=128,count=209,firstPhase=[14448,158942],lastPhase=[14474,159228])]
          and door['doorPredicates']['DOOR_LOCKED']['count']==0)
    check('consumed117 still receives original corridor request',any(r['label']=='SCRIPT_REQUEST' and
          (r['frame'],r['ticks'],r['registers']['D1'])==(14379,158183,117)
          for r in families['hq-second-key31-corridor']['actionOrder']))
    check('room14 independently launches153',any(launches(r,153) and
          (r['frame'],r['ticks'])==(14470,159184) for r in door['actionOrder']))
    hq_names=[n for n in families if n.startswith('hq-second-') or n in ('hq-held-key32-door','pcb218-take','pcb115-held','pcb115-drop')]
    check('retained return independently preserves both keys and consumed117',all(
          r['keyHeld']['31'] and r['keyHeld']['32'] and r['availability']['117']==32
          and r['cashF8']==[0]*6 for name in hq_names for r in families[name]['captures'].values()))
    check('finite return no model-swap or116/118 launch',not any(r['label'] in ('MODEL_SWAP_A','MODEL_SWAP_B')
          or launches(r,116) or launches(r,118) or launches(r,117)
          for name in hq_names for r in families[name]['actionOrder']))
    check('finite HQ return keeps original model bindings',all(r['modelWords']=={'97':776,'218':34068}
          and r['modelSwapStateBits']==0 and r['objects']['97']['state']==20
          for name in hq_names for r in families[name]['captures'].values()))
    pcb=families['pcb218-take']
    verify_pcb_acquisition(pcb['captures']['f1'],pcb['captures']['f3'])
    check('PCB selected within original Take boundary',pcb['captures']['f1']['selectedSlot']==218
          and pcb['captures']['f1']['selectedKey']==465522 and pcb['captures']['f1']['region']==14)
    check('PCB native Take accepted',any(r['label']=='TAKE_ACCEPT' and
          (r['frame'],r['ticks'],r['registers']['D3'],r['registers']['A0'])==(14478,159272,218,872)
          for r in pcb['actionOrder']))
    check('115 queues before actual numbered launch',pcb['captures']['f3']['vm']['queue']==115
          and pcb['captures']['f3']['availability']['115']==160
          and pcb['captures']['f60']['vm']['queue']==0 and pcb['captures']['f60']['availability']['115']==32
          and any(launches(r,115) and (r['frame'],r['ticks'])==(14520,159734) for r in pcb['actionOrder']))
    check('115 first held continuation independently armed',pcb['captures']['f120']['vm']['timedTargetOffset']==0x4967
          and pcb['captures']['f120']['campaignFlags']['13'] and not pcb['captures']['f120']['campaignFlags']['6'])
    timed=families['pcb115-held']['captures']
    check('115 original held timed phases and repeat',
          (timed['f20']['vm']['timedTargetOffset'],timed['f20']['vm']['timerBits'])==(0x4991,802)
          and (timed['f140']['vm']['timedTargetOffset'],timed['f140']['vm']['timerBits'])==(0x49BD,1214)
          and (timed['f250']['vm']['timedTargetOffset'],timed['f250']['vm']['timerBits'])==(0x49BD,4)
          and (timed['f280']['vm']['timedTargetOffset'],timed['f280']['vm']['timerBits'])==(0x49BD,2912)
          and (timed['f600']['vm']['timedTargetOffset'],timed['f600']['vm']['timerBits'])==(0x49BD,2626))
    check('115 retained held phase closes and preserves PCB',all(218 in timed[cut]['held']
          and timed[cut]['vm']['pc']==0x766DC and timed[cut]['vm']['queue']==0
          and timed[cut]['campaignFlags']['13'] and not timed[cut]['campaignFlags']['6']
          and timed[cut]['messageBusy']==0 and not timed[cut]['vm']['returns']
          for cut in ('f20','f140','f250','f300','f600','f1000')))
    check('timed115 adds no fresh numbered115 launch',not any(launches(r,115)
          for name in ('pcb115-held','pcb115-drop') for r in families[name]['actionOrder']))
    dropped=families['pcb115-drop']['captures']
    check('ordinary PCB Drop accepted before placement publication',any(r['label']=='DROP_ACCEPT' and
          (r['frame'],r['ticks'])==(14999,165003) for r in families['pcb115-drop']['actionOrder']))
    check('ordinary PCB Drop independently clears carried owners',dropped['f3']['objects']['218']['state']==132
          and 218 in dropped['f3']['held'] and dropped['f3']['stack'][0]==218
          and dropped['f4']['objects']['218']==dict(state=4,group=23,zone=1,
              residence=[100,15,10,18],xyz=[179539252,1500,103051717])
          and 218 not in dropped['f4']['held'] and dropped['f4']['stack']==dropped['f3']['stack'][1:])
    check('115 held-false timer exits without rearm',dropped['f240']['vm']['timedTargetOffset']==0x49BD
          and dropped['f240']['vm']['timerBits']==52
          and all(dropped[cut]['vm']['timedTargetOffset']==0 and dropped[cut]['vm']['pc']==0x766DC
                  and dropped[cut]['vm']['queue']==0 and not dropped[cut]['vm']['returns']
                  and not dropped[cut]['campaignFlags']['6'] and dropped[cut]['campaignFlags']['13']
                  and dropped[cut]['messageBusy']==0 and 218 not in dropped[cut]['held']
                  for cut in ('f250','f260','f280','f300','f350')))
    restores=[]
    for name,plan in plans.items():
        if 'restoreOf' not in plan:continue
        parent,shift=plan['restoreOf']
        check(name+' declared restore boundary',plan['source']==f'{parent}/f{shift}')
        for cut in plan['captures']:
            original=Ram.load(root/parent/f'f{cut+shift}.ram')
            restored=Ram.load(root/name/f'f{cut}.ram')
            restores.append(dict(original=f'{parent}/f{cut+shift}',restored=f'{name}/f{cut}',**verify_future(original,restored)))
            check(name+f'/f{cut} complete future',original.data==restored.data)
    return dict(schemaVersion=1,issue=772,kind='ordinary-dion-key32-route-evidence',sourceSha256=source.sha256,
        sourcePins=source_pins,instructionPins=graph_pins,generatorSha256=hq.sha(Path(__file__)),
        probeSha256=hq.sha(root/'probe.py'),plansSha256=hq.sha(root/'plans.json'),priorLedgerSha256=hq.sha(prior_path),
        sourceInventorySha256=hq.sha(inventory_path),sourceExtractorSha256=hq.sha(extractor),
        departureFFSourceSha256=hq.sha(supplement),departureFFExtractorSha256=hq.sha(supplement_extractor),families=families,restoreComparisons=restores,
        captureSourceComparisons=sum(len(f['captures']) for f in families.values())*len(pins),assertions=checks,
        limits=['Ordinary mailboxes and full-machine checkpoints, not physical IKBD or browser Save',
                'Finite route outcomes do not establish all-path exclusions or final content admission'])


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out',type=Path,default=OUT)
    args=parser.parse_args()
    result=build()
    if args.out==OUT and OUT.exists():
        if result!=json.loads(OUT.read_text()):raise SystemExit('committed DION ledger differs; inspect before updating')
    else:args.out.write_text(json.dumps(result,indent=2,sort_keys=True)+'\n')
    print(f'{len(result["families"])} families; {sum(len(f["captures"]) for f in result["families"].values())} cuts; {len(result["assertions"])} assertions')
