"""Read-only ordinary both-key HQ model-A evidence (#772)."""
from __future__ import annotations
import argparse
import importlib.util
import json
from pathlib import Path
from m3lab.ram import Ram

REPO = Path(__file__).resolve().parents[3]
RAW = REPO / 'restricted/mercenary-iii-772/hq-model-a'
OUT = REPO / 'research/mercenary-iii-st/hq-model-evidence.json'
spec = importlib.util.spec_from_file_location('hq_model_prior',Path(__file__).with_name('dion-key32-evidence.py'))
prior = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prior)


def observe(r: Ram) -> dict:
    row=prior.observe(r)
    row['modelTablePointer']=r.long(0x4BD10)
    row['table224ModelWord']=r.word(r.long(0x4BD10)+2*224)
    row['headLabelSource']=r.long(0x4E390)
    row['campaignFlags']['23']=bool(r.long(0x7270)&(1<<23))
    row['campaignFlags']['49']=bool(r.long(0x7274)&(1<<17))
    return row


def verify_model_a(before: dict, after: dict) -> None:
    if not (before['modelWords']=={'97':776,'218':34068}
            and after['modelWords']=={'97':15722,'218':33608}
            and before['modelSwapStateBits']==0 and after['modelSwapStateBits']==65535
            and [before['objects'][str(n)]['state'] for n in (97,218,224)]==[20,4,30]
            and [after['objects'][str(n)]['state'] for n in (97,218,224)]==[4,4,14]):
        raise ValueError('model-A binding and handling owners disagree')


def verify_resident_acquisition(before: dict, after: dict, slot: int) -> None:
    state={97:4,218:4,224:14}[slot]
    if not (slot not in before['held'] and slot in after['held']
            and before['objects'][str(slot)]['state']==state
            and after['objects'][str(slot)]['state']==(state | 128)
            and before['objects'][str(slot)]['residence']==[100,15,10,18]
            and after['objects'][str(slot)]['residence']==[120,1,0,16]
            and after['stack']==[slot,*before['stack']]):
        raise ValueError('resident acquisition owners disagree')


hq=prior.hq
prior.prior.LABELS=(*prior.prior.LABELS,'MODEL_REBIND','PANEL_KEY','OPEN','CARD_SET','SOUND','TIMED_ARM')
traces=prior.traces
trace_phases=prior.trace_phases
verify_future=prior.verify_future


def build(root: Path=RAW) -> dict:
    checks=[]
    def check(name: str,condition: bool):
        if not condition:raise AssertionError(name)
        checks.append(name)
    source=Ram.load(REPO/'restricted/mercenary-iii-708/presentation/exact2/start.ram')
    check('coherent source',source.sha256==hq.owners.native.owners.SOURCE_SHA)
    check('unchanged R1 harness',hq.sha(REPO/'restricted/mercenary-iii-770/harness.py')==hq.owners.native.owners.HARNESS_SHA)
    dion_path=REPO/'research/mercenary-iii-st/dion-key32-evidence.json'
    clotho_path=REPO/'research/mercenary-iii-st/clotho-key31-evidence.json'
    check('literal prior DION ledger',hq.sha(dion_path)=='f91570ebebd49ca0104b70cd510ef036daaebcc7f0691eb6aa3693bd68d8da3f')
    check('literal ordinary CLOTHO prefix',hq.sha(clotho_path)=='1adc3587461ae9256d8da8f14612d842f3c9ac8ff80eef87195a2e76ebdec557')
    history=json.loads(clotho_path.read_text())
    previous=json.loads(dion_path.read_text())
    check('unchanged prior DION generator',hq.sha(Path(prior.__file__))==previous['generatorSha256'])
    check('unchanged prior CLOTHO generator',hq.sha(Path(prior.prior.__file__))==history['generatorSha256'])
    parent_root=history['families']['exterior-departure']['captures']['f300']
    inherited=tuple((*[int(a[1:],16) for a in p['range']],p['role'],p['sha256']) for p in previous['sourcePins'])
    inventory_path=REPO/'restricted/mercenary-iii-772/hq-model-source/inventory.json'
    extractor=inventory_path.with_name('extract.py')
    check('literal model source packet',hq.sha(inventory_path)=='7a856c1fe1da0942c0684cc648301da8692b27efd79ebf9e9a4ecc12b3dae40c')
    check('literal model source extractor',hq.sha(extractor)=='b42ff8e6018c626466d95c78b8f53d3698c20c139413de7cc1868e99f437ce1b')
    inventory=json.loads(inventory_path.read_text())
    additional=tuple((*[int(a[1:],16) for a in p['range']],p['role'],p['sha256']) for p in inventory['sourcePins'])
    geometry=(
        (0x56454,0x564C4,'original Load restaging and native model-rebuild caller','3e678563f582fdbeecb5a6b145c6afae27f907801b824f79940a6ed016dd6994'),
        (0x56D98,0x56ED0,'separate native Floor arrival and bind chain','e85350cb3b50c95284040284e245d6da7d797c67ab2a85457f31f2c59413adc4'),
        (0x56B72,0x56BA2,'original Undo Save and Load menu guards','0adec7fc90a219dd0bd6349f961c28d67d87a8414547885bdb85a12b2c063355'),
        (0x32822,0x328D7,'chair316 complete drawable record','24710ba680237a36d14320e2a559ff2c66fa1324568e0d4159afaa9aba6190c8'),
        (0x36E00,0x36FB8,'standing PCB317 complete drawable record','d30d8c9a44442c6b5cac9ad14a50d0ca25b042d18cd47ba27deb15a0bf915b85'),
        (0x39256,0x39359,'table224 complete drawable record','24e4b5e46fa20445b5aee50f7cdfb6493dc62939d88fd834ec6694e0737f5b54'),
        (0x39246,0x39256,'table224 head label source','3eb46903abf8cd668a97a16d8720897c51ddfb941028b2281c83d66af3d36e1b'),
        (0x2EC78,0x2EC7A,'table224 stable finite-route model binding','26f3b811dde46128468859c792276487cd53fcddaf2c29b8cef46a895def6e7d'),
    )
    pins=tuple(dict.fromkeys((*inherited,*additional,*geometry)))
    for pin in inventory['initialDataPins']:
        lo,hi=(int(a[1:],16) for a in pin['range'])
        source.require(lo,hi,pin['sha256'],pin['role'])
    graph_pins=list(previous['instructionPins'])
    for pin in graph_pins:
        lo,hi=(int(a[1:],16) for a in pin['range'])
        source.require(lo,hi,pin['sha256'],'inherited DION/HQ graph instruction')
    for graph in inventory['graphs'].values():
        for instruction in graph['instructions']:
            pin=instruction['source'];lo,hi=(int(a[1:],16) for a in pin['range'])
            source.require(lo,hi,pin['sha256'],'HQ model graph instruction')
            graph_pins.append(pin)
    source_pins=[dict(role=role,**source.require(lo,hi,expected,role)) for lo,hi,role,expected in pins]
    responses={source.byte(a+1):source.byte(a) for a in range(0x555EE,0x555F4,2)}
    definitions={source.byte(a) for a in range(0x4D6EA,0x4D80A,8)}
    check('literal original pickup response table',responses=={216:28,218:115,127:24})
    check('chair and table have no Open or pickup response',all(n not in responses and n not in definitions for n in (97,224)))
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
        if name=='clotho-space-brake':
            check(name+' retained prior root',origin.resolve()==(REPO/'restricted/mercenary-iii-772/clotho-key31/exterior-departure/f300').resolve())
            prior.verify_parent(seed,hq.sha(origin.with_suffix('.sav')),parent_root)
        else:
            parent,cut=Path(plan['source']).parts
            check(name+' earlier ordinary parent',parent in families and cut in families[parent]['captures'])
            prior.verify_parent(seed,hq.sha(origin.with_suffix('.sav')),families[parent]['captures'][cut])
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
            check(name+'/'+path.stem+' stable model-table pointer',row['modelTablePointer']==0x2EAB8)
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
            doorPredicates=prior.prior.door_summary(rows))

    def cap(name: str,cut: str) -> dict:
        return families[name]['captures'][cut]
    def actions(name: str,label: str) -> list[dict]:
        return [r for r in families[name]['actionOrder'] if r['label']==label]
    check('native DION arrival arm and independent post-entry Body',
          [(r['frame'],r['ticks'],r['registers']['A0']) for r in actions('dion-near-leg','ARRIVAL_ARM')]==[(4830,53144,16)]
          and [(r['frame'],r['ticks']) for r in actions('dion-near-leg','BODY_ENTER')]==[(4830,53144)]
          and cap('dion-near-leg','f40')['body']==16 and cap('dion-near-leg','f40')['selector']==0)
    prior.verify_acquisition(cap('key32-acquire','f2'),cap('key32-acquire','f3'),32,[16,7,0,68])
    check('ordinary key32 acquired before first117',cap('key32-acquire','f3')['availability']['117']==160
          and cap('key32-acquire','f3')['keyHeld']['31'] and cap('key32-acquire','f3')['modelSwapStateBits']==0
          and cap('key32-acquire','f2')['selectedSlot']==32 and cap('key32-acquire','f2')['selectedKey']>>16==7
          and [(r['frame'],r['ticks']) for r in actions('key32-acquire','TAKE_ACCEPT')]==[(6660,73274)])
    check('native DION hostile caller and Space clear',
          [(r['frame'],r['ticks']) for r in actions('dion-departure','CELL_FF_REQUEST')]==[(7234,79588)]
          and any(prior.launches(r,143) for r in families['dion-departure']['actionOrder'])
          and sum(a['stateBits']!=0 for a in cap('dion-departure','f40')['actors'])==3
          and [(r['frame'],r['ticks']) for r in actions('dion-departure','HOSTILE_SHOT')]==[(7297,80281)]
          and [(r['frame'],r['ticks']) for r in actions('dion-departure','SPACE_ENTER')]==[(7301,80325)]
          and all(a['stateBits']==0 for a in cap('dion-departure','f90')['actors'])
          and not actions('dion-departure','INCOMING_HIT') and not actions('dion-departure','HIT_FAILURE'))

    check('native TOLOSA arm, entry-call phase and independent post-entry Body',
          [(r['frame'],r['ticks'],r['registers']['A0']) for r in actions('hq-close-intercept','ARRIVAL_ARM')]==[(8235,90599,100)]
          and [(r['frame'],r['ticks'],r['registers']['A0']) for r in actions('hq-close-intercept','BODY_ENTER')]==[(8235,90599,196)]
          and cap('hq-close-intercept','f140')['body']==100 and cap('hq-close-intercept','f140')['selector']==0)
    check('ordinary Ground entrance, reception5 and native B lift',
          any(prior.launches(r,5) for r in families['hq-ground-entry-lift']['actionOrder'])
          and cap('hq-ground-entry-lift','f350')['selector']==1
          and cap('hq-ground-entry-lift','f350')['boundFloor']==10
          and cap('hq-ground-entry-lift','f350')['region']==1)
    verify_model_a(cap('hq-first117-corridor','f92'),cap('hq-first117-corridor','f94'))
    check('first117 launches with both ordinary keys and exact VM Model-A opcode',
          cap('hq-first117-corridor','f90')['availability']['117']==160
          and cap('hq-first117-corridor','f92')['availability']['117']==32
          and all(cap('hq-first117-corridor','f92')['keyHeld'][str(n)] for n in (31,32))
          and [(r['frame'],r['ticks']) for r in actions('hq-first117-corridor','SCRIPT_LAUNCH') if prior.launches(r,117)]==[(9789,107693)]
          and [(r['frame'],r['ticks'],r['registers']['A0']) for r in actions('hq-first117-corridor','MODEL_SWAP_A')]==[(9791,107715,0x7464A)]
          and cap('hq-first117-corridor','f160')['vm']['returns']==[]
          and not cap('hq-first117-corridor','f160')['campaignFlags']['6'])
    check('Model-A preserves independent resident placement, held and Stack owners',
          all(cap('hq-first117-corridor','f92')['objects'][str(n)][field]==cap('hq-first117-corridor','f94')['objects'][str(n)][field]
              for n in (97,218,224) for field in ('group','zone','residence','xyz'))
          and cap('hq-first117-corridor','f92')['held']==cap('hq-first117-corridor','f94')['held']
          and cap('hq-first117-corridor','f92')['stack']==cap('hq-first117-corridor','f94')['stack'])

    verify_resident_acquisition(cap('standing-pcb-take','f2'),cap('standing-pcb-take','f3'),218)
    check('standing PCB native candidate, direct115 launch and independent head source',
          cap('standing-pcb-take','f2')['selectedSlot']==218
          and cap('standing-pcb-take','f2')['selectedKey']>>16==7
          and [(r['frame'],r['ticks']) for r in actions('standing-pcb-take','TAKE_ACCEPT')]==[(9980,109794)]
          and [(r['frame'],r['ticks']) for r in actions('standing-pcb-take','SCRIPT_LAUNCH') if prior.launches(r,115)]==[(9980,109794)]
          and cap('standing-pcb-take','f2')['availability']['115']==160
          and cap('standing-pcb-take','f3')['availability']['115']==32
          and cap('standing-pcb-take','f3')['vm']['queue']==0
          and cap('standing-pcb-take','f3')['headLabelSource']==0x36DF0
          and cap('standing-pcb-take','f3')['modelWords']=={'97':15722,'218':33608}
          and cap('standing-pcb-take','f3')['modelSwapStateBits']==65535)

    verify_resident_acquisition(cap('standing-pcb-queued','f2'),cap('standing-pcb-queued','f3'),218)
    check('standing PCB queues115 under active153 before launch consumes availability',
          cap('standing-pcb-queued','f2')['campaignFlags']['6']
          and cap('standing-pcb-queued','f3')['vm']['queue']==115
          and cap('standing-pcb-queued','f3')['availability']['115']==160
          and cap('standing-pcb-queued','f40')['vm']['queue']==0
          and cap('standing-pcb-queued','f40')['availability']['115']==32
          and [(r['frame'],r['ticks']) for r in actions('standing-pcb-queued','TAKE_ACCEPT')]==[(9900,108914)]
          and [(r['frame'],r['ticks']) for r in actions('standing-pcb-queued','SCRIPT_LAUNCH') if prior.launches(r,115)]==[(9930,109244)]
          and [(r['frame'],r['ticks'],r['registers']['A0']) for r in actions('standing-pcb-queued','TIMED_ARM')]==[(9950,109464,0x746A4)])
    check('standing held PCB retains ordered1500,1000,1500 and repeated3000 owners',
          [(cap(f,c)['vm']['timerBits'],cap(f,c)['vm']['timedTargetOffset']) for f,c in (
              ('standing-pcb-take','f100'),('standing-pcb-take','f200'),
              ('standing-pcb-held','f93'),('standing-pcb-held','f260'),('standing-pcb-held','f550'))]
          ==[(642,0x4967),(780,0x4991),(1489,0x49BD),(2890,0x49BD),(2934,0x49BD)]
          and not cap('standing-pcb-held','f570')['campaignFlags']['6']
          and cap('standing-pcb-held','f570')['vm']['returns']==[])
    check('ordinary standing PCB Drop exits held-gated timed repeat',
          [(r['frame'],r['ticks']) for r in actions('standing-pcb-drop','DROP_ACCEPT')]==[(10750,118264)]
          and cap('standing-pcb-drop','f2')['stack'][0]==218
          and cap('standing-pcb-drop','f3')['stack']==cap('standing-pcb-drop','f2')['stack'][1:]
          and cap('standing-pcb-drop','f3')['objects']['218']['state']==4
          and cap('standing-pcb-drop','f3')['objects']['218']['residence']==[100,15,10,18]
          and 218 not in cap('standing-pcb-drop','f3')['held']
          and cap('standing-pcb-drop','f240')['vm']['timedTargetOffset']==0x49BD
          and cap('standing-pcb-drop','f250')['vm']['timedTargetOffset']==0
          and not actions('standing-pcb-drop','TIMED_ARM')
          and all(cap('standing-pcb-drop',f'f{n}')['vm']['timedTargetOffset']==0
                  and not cap('standing-pcb-drop',f'f{n}')['campaignFlags']['6']
                  and cap('standing-pcb-drop',f'f{n}')['vm']['returns']==[] for n in (250,260,270,280,300,320,350)))
    for family,slot,label_source in (('chair97-actions',97,0x32812),('table224-actions',224,0x39246)):
        verify_resident_acquisition(cap(family,'f2'),cap(family,'f3'),slot)
        verify_resident_acquisition(cap(family,'f50'),cap(family,'f51'),slot)
        check(family+' native candidate and both accepted Takes/Drops',
              cap(family,'f2')['selectedSlot']==slot and cap(family,'f2')['selectedKey']>>16==7
              and len(actions(family,'TAKE_ACCEPT'))==2 and len(actions(family,'DROP_ACCEPT'))==2
              and [r['registers']['D0']&255 for r in actions(family,'PICKUP_RESPONSE')]==[slot,slot]
              and not actions(family,'SCRIPT_LAUNCH') and not actions(family,'CARD_SET')
              and len(actions(family,'OPEN'))==1)
        check(family+' independent head, unmatched Open and ground placement owners',
              cap(family,'f3')['headLabelSource']==label_source
              and cap(family,'f10')['card']==cap(family,'f11')['card']==[104,5,4,0]
              and cap(family,'f10')['stack']==cap(family,'f11')['stack']
              and cap(family,'f31')['objects'][str(slot)]['state']==(14 if slot==224 else 4)
              and cap(family,'f71')['objects'][str(slot)]['state']==(14 if slot==224 else 4)
              and cap(family,'f31')['objects'][str(slot)]['residence']==[100,15,10,18]
              and cap(family,'f71')['objects'][str(slot)]['residence']==[100,15,10,18]
              and cap(family,'f31')['objects'][str(slot)]['xyz']==[
                  cap(family,'f31')['eye'][0],1500,cap(family,'f31')['eye'][2]]
              and cap(family,'f71')['stack']==cap(family,'f2')['stack'])
        check(family+' unmatched Open preserves independent description and reveal owners',
              all(cap(family,'f10')['interactionOwners'][field]==cap(family,'f11')['interactionOwners'][field]==0
                  for field in ('reveal','selectedSection','sectionMax','selectedSectionPointer',
                                'descriptionObject','descriptionSection','packedCursor','continuation')))
        check(family+' ordered interaction sound callbacks retain native action phases',
              [(r['frame'],r['ticks']) for r in actions(family,'SOUND')]
              ==[(cap(family,f'f{cut}')['frame'],cap(family,f'f{cut}')['ticks'])
                  for cut in (2,2,30,30,50,50,70,70)])
    check('table acquisition preserves non-heavy handling bits and restages held PCB',
          cap('table224-actions','f3')['table224ModelWord']==42910
          and cap('table224-actions','f3')['objects']['218']['residence']==[120,1,1,16]
          and cap('table224-actions','f3')['objects']['218']['xyz'][1]==300
          and cap('table224-actions','f31')['objects']['218']['residence']==[120,1,0,16])
    for family in ('standing-pcb-take','standing-pcb-queued','standing-pcb-held','standing-pcb-drop','chair97-actions','table224-actions'):
        check(family+' retained A bindings, latch and unconsumed election context',
              all(r['modelWords']=={'97':15722,'218':33608} and r['modelSwapStateBits']==65535
                  and not r['campaignFlags']['23'] and not r['campaignFlags']['49']
                  and r['availability']['119']==160 for r in families[family]['captures'].values()))

    check('complete standing PCB futures retain exact ordered timed-arm callbacks',
          [(r['frame'],r['ticks'],r['registers']['A0']) for r in actions('standing-pcb-take-restore-2','TIMED_ARM')]
          ==[(10000,110014,0x746A4),(10158,111752,0x746CE)]
          and [(r['frame'],r['ticks'],r['registers']['A0']) for r in actions('standing-pcb-held-restore-80','TIMED_ARM')]
          ==[(10270,112984,0x746FA),(10428,114722,0x74720),(10722,117956,0x74720)])

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
    return dict(schemaVersion=1,issue=772,kind='ordinary-both-key-hq-model-evidence',sourceSha256=source.sha256,
        sourcePins=source_pins,instructionPins=graph_pins,sourceInventorySha256=hq.sha(inventory_path),
        sourceExtractorSha256=hq.sha(extractor),generatorSha256=hq.sha(Path(__file__)),probeSha256=hq.sha(root/'probe.py'),
        plansSha256=hq.sha(root/'plans.json'),priorDionLedgerSha256=hq.sha(dion_path),priorClothoLedgerSha256=hq.sha(clotho_path),
        families=families,restoreComparisons=restores,captureSourceComparisons=sum(len(f['captures']) for f in families.values())*len(pins),
        assertions=checks,limits=['Finite ordinary mailboxes/complete checkpoints, not physical IKBD or browser Save',
                                 'Model-A outcome does not close model-B callers or final content admission'])


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out',type=Path,default=OUT)
    args=parser.parse_args()
    result=build()
    if args.out==OUT and OUT.exists():
        if result!=json.loads(OUT.read_text()):raise SystemExit('committed HQ model ledger differs; inspect before updating')
    else:args.out.write_text(json.dumps(result,indent=2,sort_keys=True)+'\n')
    print(f'{len(result["families"])} families; {sum(len(f["captures"]) for f in result["families"].values())} cuts; {len(result["assertions"])} assertions')
