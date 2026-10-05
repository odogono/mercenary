# Mercenary III R3: ordinary CLOTHO key31 acquisition and HQ return

Research continuation for [#772](https://github.com/odogono/mercenary/issues/772), 2026-10-05, after the [ordinary TOLOSA HQ key31 barrier](mercenary-iii-tolosa-hq-route.md). **The retained EAGLE3 route reaches CLOTHO, accepts key31 through original Take and returns to HQ, where the acquired key opens the first basement throat.** Both indoor and exterior BIL acquisitions succeed; the indoor branch launches a hostile programme, while the exterior branch avoids its entrance trigger and supplies the successful return. The second key32 throat stays locked, and two naturally selected PCB218 Take attempts remain beyond native range. These finite outcomes leave wider PCB access, #772's frontier and final #771/I1 admission open.

The companion [source report](mercenary-iii-clotho-key31-source.md) supplies the pinned static Body, placement, geometry, key and script readers. Ordinary claims below come from the [raw route packet](../../restricted/mercenary-iii-772/clotho-key31/), its `plans.json`, per-family `manifest.json`, generated debugger files, complete `.sav` checkpoints, 1 MiB `.ram` cuts and `runs/*/hatari.log`. The [read-only observer](../../research/mercenary-iii-st/scripts/clotho-key31-evidence.py) parses their state and action order. The [numeric ledger](../../research/mercenary-iii-st/clotho-key31-evidence.json) has67 families,720 cuts,6,137 assertions and87 reader/data pin tuples, checked62,640 times against retained cuts. Whole-machine restored futures match70 complete RAM pairs. Repository checks and their execution limits are recorded below.

## Complete ordinary prefix and observation phase

The source is `restricted/mercenary-iii-772/followup/native-return/f230`, original frame993/ticks10937, native space selector2, occupied EAGLE3, stopped System `[239336,64,726907]`, yaw700. RAM SHA-256 is `9634cfa5ffa2b171183a836bf2ee83552d4a1c156490ddb7d379ba266160282e`; whole-machine checkpoint SHA-256 is `41d5786fd2aa611c4fb29948f216f0aec2bb04816dc04952147f1872a5118998`. The [prior follow-up ledger](../../research/mercenary-iii-st/object-interaction-r3-followup.json) retains its ordinary KEY181 acquisition, Board and native flight prefix. This route restores that complete checkpoint; it does not supply an EAGLE pose or held inventory.

Inputs write only the original stick `$7056` and keyboard `$56726` mailbox bytes. They supply no destination, position, Floor, region, resident, selected key, held bit, script request, programme or actor state. The unchanged R1 harness and accepted CPU32 eleven-tick wait adaptation remain the instrumentation contract. Generated commands and whole-machine provenance require the observer's audits, including each family's exact earlier parent RAM and `.sav` hashes. This is original mailbox execution, not physical IKBD or browser Save equivalence.

A retained TOP cut precedes that frame's consumed input. Arrival can re-enter TOP in the same frame/ticks after changing selector2→0; native departure can similarly change0→2. The observer requires the corresponding `BODY_ENTER` or `SPACE_ENTER` marker strictly between those TOPs. An action callback and its later mutation cut must therefore be distinguished. Historical manifests, debugger files and logs own the actual executed recipe; the current probe digest alone does not assert identical instrumentation across all exploratory runs.

## Incidental arrival and the accepted CLOTHO branch

The first `clotho-cruise` attempt does not reach CLOTHO. Its native scanner arms Body48/LACHESIS at frame1306/ticks14380, System `[238654,54,722195]`, and executes `BODY_ENTER`. This is an ordinary unintended arrival, retained as an explored branch. The onward CLOTHO route starts again from the earlier complete `orient-north/f120` checkpoint through `east-orient`; it does not turn a LACHESIS pose into a supplied CLOTHO arrival.

The accepted flight uses the retained east-clear and north-cruise families, then original turn, pitch, throttle and braking inputs in the final approach/intercept/entry families. `plans.json` and each manifest retain their complete schedules and parent cuts. Intermediate misses remain observations, not proof of an inaccessible Body. The nearest-Body scanner and packed arrival guard at `$53D6A..$53F70` choose the actual destination; no input names CLOTHO24.

In `clotho-entry2`, `ARRIVAL_ARM` and `BODY_ENTER` execute at **frame2385/ticks26249**, with scanner offset `A0=24` and incoming System `[65784,464,-288739]`. The packed range is `$00081F6C`, satisfying this Body's exponent16 guard. The same frame's re-entered surface TOP has selector0, Body24, eye `[142344192,25165824,134217728]`. Subsequent retained cuts continue original surface flight, rather than equating arrival with landing or building entry.

The live coordinate conversion is explicit in this family's log. At `BODY_ROTATION` (`$4EF3C`), original longitude `D0=716` is about to use playback0 and CLOTHO's current rotation long `$08AD53FA`: **integer phase2221**, from the high word at `$575A+24`, rather than its fractional low word. Subtraction gives `(716−2221) mod1024=543`; the X-store intermediate `D0=$F87C0000` becomes masked surface X `$087C0000` (cell2172). The first surface TOP's Z is cell2048. This is far from BIL's authored cell `[2422,300]`, so arrival alone supplies no doorstep witness. Reader `$4EF02..$4F0D6` and the first surface TOP jointly own the conversion claim.

## Surface descent, landing and ground approach

The surface route retains `bil-orient`, cruise/correction, dive/level/fine/descent, ground rides and the south approach. Surface controls differ from foot and space turning: stick1 increases raw pitch by8, stick2 decreases it by8; neutral pitch512 is not an exact zero vertical sine. Throttle, altitude multiplier, yaw damping, residual speed and the original contact reader own motion. The full original inputs remain in the raw plans, rather than a reconstructed teleport or nominal straight-line recipe.

`bil-descent` reaches **HARD_TOUCHDOWN and LEAVE at frame3427/ticks37711**. The hard callback has eye `[158746434,-7039,19681616]` and vertical `D3=-13568`; Leave follows after the original clamp to Y63. The next retained `f95` is frame3428/ticks37722, foot selector1/contact63, with EAGLE3 published on CLOTHO. The source guard `$59370..$593BE` (SHA-256 `ce82915b9f5a74c52a722a9c4f24753bcf2bc4afbc82c2846129f640bf40a88f`) branches to `$58DB6` when the below64 crossing has vertical step below−100, or the subsequent shifted pitch test reaches `$A0`. This witnessed landing used the hard branch; it is not described as a gentle touchdown or a universal damage outcome.

The route then re-boards and moves the craft through original ground/surface controls. `bil-gentle/f25` is frame4058/ticks44652, pitch559, eye `[158762116,120,19691327]`, contact0. Later cuts reach Y63/contact63 without a `HARD_TOUCHDOWN` callback in this family's trace. Original Leave, requested by L/scancode38, executes at **frame4093/ticks45037**, eye `[158761858,63,19691091]`. `bil-gentle/f80` is the later settled foot checkpoint at **frame4113/ticks45257**, not the Leave callback itself. EAGLE3 is resident `[24,0,0,1]`, group50/zone8, world `[158761858,0,19691091]`.

The ground walk resolves BIL INDUSTRIES group50/cell1, Floor0, low-word building origin `[32618,30308]`. At `bil-entry-walk/f80`, local `[184,-560]` is still exterior region7. By `f84`, local `[184,-572]` lies in entrance region6, foot selector1/Floor0. The source geometry has a keyless throat, so this entrance does not require the acquired key. The later Take approach reaches eastern room4 at local `[376,-716]`, near key31's initial local `[375,-652]`. The actual resident/selection readers, not the Catalogue label alone, bind the object.

## BIL location script and hostile exposure

The walk records `LOCATION_MATCH` and `SCRIPT_REQUEST` at **frame4195/ticks46159**, with `D1=140`, trigger address `A0=145591` (`$238B7`) and eye `[158760994,63,19690542]`. This is the original any-indoor Floor0/cell1 location hook. It is a script request, not a displayed-message claim. Script140's pinned twelve-site graph tests flag22 and otherwise requests `$FFE3` through opcode `$2A`; no key/account/model grant belongs to that graph.

`PROGRAMME_BIND` at **frame4198/ticks46192** records `D0=4`, cursor `A0=28270` (`$6E6E`). The subsequent `bil-entry-walk/f100` captures request byte254, cursor28270, timer `$FFFF`, **remaining budget2** and two admitted actors56/57 with state `$8000`;58/59 are inactive. The entry budget4 and later budget2 are separate phases. They do not establish four kills or a completed programme. The live pair records and actor states are retained alongside VM flags, queue, return stack, timer and script140 availability, rather than frozen to coherent opening values.

Actors continue through Take and departure. Their held-independent state, XYZ, residence and model words remain live owners; original hostile shots occur in `bil-departure`. The programme request consumer `$523E0..$52448`, actor selector `$52056..$520A6`, movement/path and hostile damage readers own these consequences. Sound priority/vector observations are numeric owners; the mailbox trace does not certify displayed dialogue, audible output or raster timing.

## Accepted key31 Take and its response boundary

At `key31-take/f79` (frame4292/ticks47226), key31 is selected under native key398964 (`$61674`), in room4/Floor0. Eye is `[158761186,63,19690392]`; its world residence remains `[24,4,0,1]`, state5, group50/zone4, XYZ `[158761185,0,19690456]`. Carried Stack is `[181,104,103,135]`; independent script-held38 is outside it. Neither key31 nor key32 is held.

Scancode72 at offset80 executes **TAKE, TAKE_ACCEPT and PICKUP_RESPONSE at frame4293/ticks47237**. `TAKE_ACCEPT` observes slot31 through `D3=31`, object offset `A0=124`. The TOP cut `f80` still precedes those writes. In `f81` (frame4294/ticks47248), the accepted mutation is explicit:

| Independent owner | Before / after original Take |
| --- | --- |
| Key31 state / held |5, clear →133 (`$85`), held |
| Ordered Carried Stack | `[181,104,103,135]` → `[31,181,104,103,135]` |
| Residence / group / zone | `[24,4,0,1]` /50/4 → `[120,1,0,16]` /49/4 |
| World/VOID XYZ | `[158761185,0,19690456]` → `[33237,0,99100]` |
| Selection on next TOP |31/key398964 → craft3/key597598 |

The `PICKUP_RESPONSE` marker is the common table-reader entry `$555D4`, not a matched response launch. The original table `$555EE` matches only216→28,218→115 and127→24, then terminates. Slot31 matches none; no corresponding script-request callback follows in this Take family. Response115/24/28 availability remains `$A0`, and the VM continues its independently live timer. This proves no matched launch from this key Take; it does not exclude unrelated future script callers or equate response-table entry with script execution.

`key31-take/f110` (frame4323/ticks47567) retains the acquired key and ordered stack. Key32 remains unheld in its DION residence; PCB218 remains unheld at TOLOSA HQ/Floor10/association15. Locator40 and Transporter71 remain in their distinct BIL floors. Acquiring key31 does not acquire those items, open the key32 throat or select PCB.

## Exterior alternative avoids the entrance programme

`key31-exterior-take` restores the earlier complete `bil-entry-walk/f75` checkpoint and stops walking before crossing the entrance. Its `f1` (frame4189/ticks46093) is exterior region7, local `[184,-545]`, eye `[158760994,63,19690563]`, selected31/key466042, state5/non-held. The original drawing hook exposes this indoor resident for native selection from that exterior position; neither the resident's initial association4 nor the visible selection itself requires the player's indoor association.

Take at offset2 executes `TAKE`, `TAKE_ACCEPT` and the common `PICKUP_RESPONSE` entry at **frame4190/ticks46104**, with actual slot31/object offset124. `f2` is the pre-action TOP; `f3` (frame4191/ticks46115) retains state133/held, stack `[31,181,104,103,135]` and VOID residence `[120,1,0,16]`. The player remains exterior region7 at the same local position. The retained cuts through `f30` have no location140/script request or admitted actors56–59: request0, cursor28240, timer0 and inherited budget5 remain separate live programme fields. This is an ordinary alternate acquisition and trigger avoidance, not frozen programme state or a global claim that BIL has no hostile programme.

## Complete-machine restored futures

Each replay restores an original whole-machine `.sav`, repeats the matching ordinary inputs and compares the later **complete 1 MiB RAM**, including live programme/actors/VM and inventory. Independent read-only comparisons of the retained files pass all70 pairs below; they are not a browser Save test.

| Restore source → replay | Later cuts / original offset | Result |
| --- | --- | --- |
| `clotho-entry2/f10` → `arrival-replay` |8 cuts, replay offset+10 | Exact RAM through arrival and later surface motion |
| `bil-descent/f90` → `landing-replay` |5 cuts, offset+90 | Exact RAM through hard touchdown/Leave and later foot state |
| `bil-gentle/f20` → `gentle-replay` |8 cuts, offset+20 | Exact RAM through contact, braking, Leave and later foot state |
| `key31-take/f79` → `take-replay` |4 cuts, offset+79 | Exact RAM at pre-action TOP, accepted held/stack/residence writes and later state |
| `key31-exterior-take/f1` → `exterior-take-replay` |4 cuts, offset+1 | Exact RAM at pre-action TOP, exterior acceptance and later untriggered state |
| `clotho-launch-failure/f140` → `slow-failure-replay` |1 cut: replay/f1 vs original/end | Exact RAM through hit/failure and pendingFailure1 |
| `tolosa-return-entry/f24` → `tolosa-arrival-replay` |3 cuts, offset+24 | Exact RAM at native entry, destination programme and later surface state, crossing full ticks65536 |
| `hq-return-land/f65` → `hq-landing-replay` |7 cuts, offset+65 | Exact RAM through hard touchdown/Leave, craft publication and later foot state |
| `hq-held-key31-door/f70` → `hq-held-door-replay` |11 cuts, offset+70 | Exact RAM through acquired-key31 door opening, corridor entry, script117 and later state |
| `hq-return-entry-lift/f420` → `hq-return-lift-replay` |3 cuts, offset+420 | Exact RAM through B selection, Floor10 binding and later lift state |
| `hq-key32-pcb-probe/f26` → `hq-key32-pcb-replay` |16 cuts, offset+26 | Exact RAM through key32 refusal, both selected-PCB Take attempts and their later states |

## Departure and hostile failure boundary

`bil-departure` walks out and records `BOARD_ACCEPT` at frame4463/ticks49107 against EAGLE3. Its `f141` is original surface selector0/craft3/contact63, with key31 still held. The initial northward departure stays near the building and returns to contact63; the Escape input is at offset180, not140, and this family has no native `SPACE_ENTER` witness. Board acceptance alone therefore does not close escape or return.

The accepted bounded `clotho-launch-failure` turns southeast and attempts launch with digit7/up/Escape. It records `INCOMING_HIT` and `HIT_FAILURE` at **frame4605/ticks50669**, eye `[158771936,1228,19699520]`. Its `end` RAM retains pendingFailure1, selector0/Body24 and the acquired key, with live actor56/57 states. It supplies a finite hostile failure, not a claim that every departure fails. Interrupted longer duplicate runs do not own this outcome. Both faster exploratory runs remain ignored and excluded from accepted plans; a shorter pre-failure TOP is not a completed failure witness.

The exterior branch instead walks back to the retained craft and records `BOARD_ACCEPT` at **frame4298/ticks47292**. Its southeast launch executes native `SPACE_ENTER` at **frame4511/ticks49635** (offset293), before `exterior-departure/f300` captures selector2/Body−1 at4518/49712. After original braking, `f420` is frame4638/ticks51032, stopped System `[−963705,8268,−1149670]`, with key31 state133/held and the acquired ordered stack unchanged. Selected cuts retain request0, cursor28240, timer0, inherited budget5 and inactive actor pool; no BIL140 trigger/spawn occurs in this retained branch. Programme budget5 is not rewritten or described as zero.

## Election exposure and native TOLOSA return

The exterior return continues through original orientation/cruise and the JUNO-clearing dogleg. Accelerated space flight crosses the default election threshold: `tolosa-east-cruise` records actual `SCRIPT_REQUEST` callbacks with `D1=119` at frames5124/56378,5125/56389 and5126/56400. These requests are distinguished from displayed news text. Later `tolosa-final-orient/f90` (frame5628/ticks61922) has elapsed45183, flags `[0,128,162,0,0,0,0,0]`, reception5/meeting6 availability0 and election119 availability `$20`; newly set flags9/23 coexist with clear10/22. Original clock, VM, queue, timer and continuation writes remain live.

The pinned progression metadata SHA-256 is `fdfa162d12c54b8b20b7c2a5537bce5f57c3b2e4f1ce47681df3f24785de2072`. All70 instruction-source spans of election119's broad graph are verified. That graph includes alternate flag10/22 branches, polling adjustments and an object-bit operation at `$75C28` setting held34; it must not be described as globally free of object mutations. The observed default branch leaves object34 state5. Its bounded entry `$759D2..$75A16` has12 sites, followed by direct bank-offset continuations `$75A16..$75A75` (9 sites) and `$75B5C..$75BA6` (7 sites), ending with operand `$DB` at `$75BA1` writing signed request `$FFDB`. These timed offsets are not numbered script120, whose entry is `$75FA1`. Default branch range hashes are respectively `bc9d151684623633ec7067f591fe21b8c1a2ad6f93d59e9a8fca08ec132e8910`, `60e26c2af10fd9c44743227e8c1ed26f134c46b0f3d6292364305a95c40353fe` and `89e61d47b503a2b373736c885370983acc9deae95c69d5642fadd5094c7d2ce5`; the shared closing/gap/wait helpers retain their separate pins. ([Campaign reader/closure](mercenary-iii-tourcraft-campaign.md).)

`tolosa-return-entry` records `ARRIVAL_ARM` and `BODY_ENTER` at **frame5953/ticks65497**, incoming System `[1665640,314,1817514]`, native target offset100. The `f24` pre-entry TOP retains pending `$FFDB`. Live longitude218 minus TOLOSA integer rotation3694 gives angle620 modulo1024, hence first surface X cell2480; the re-entered TOP is `[162529280,25165824,177733632]` (surface cellZ2712). Native entry calls `$511A8` to clear request and actor state/residence/group, then `$5A214` writes TOLOSA's `$FFFF` destination request: `f25` retains that new word. The pinned entry routine has no election-flag conditional. Space suspends programme spawn/timer/hit processing, so the pending election request is replaced through original entry ordering rather than executed immediately or artificially erased.

Original `PROGRAMME_BIND` at frame5954/ticks65508 selects cursor `$6E50` (28240), first pair count3/request1. By `f30`, request1 has admitted passive actors56–58 and budget0;59 remains inactive. `f40` (frame5968/ticks65662) is stopped surface EAGLE3, eye `[162529329,25165824,177733622]`, yaw802/pitch512, programme timer986, with key31 state133/held and the acquired stack unchanged. The two cuts `f25→f30` cross ticks65536; full-width tick comparisons and same-frame native re-entry are retained. All three arrival replay comparisons (`f25/f30/f40` against replay`f1/f6/f16`) match complete RAM. This is a native Body return, not a landing or HQ entrance witness; the live rotation conversion places the craft far from the building.

## Surface return and landing near HQ

The retained `hq-return-*` surface families orient, cruise, correct the approach, dive and fine-position through original inputs. The initial heading estimate to HQ's south park is987.5, but subsequent original corrections and altitude-dependent speed, rather than that estimate, own the reached landing. Digit1 and digit0 have different native speed presets; published schedules in `plans.json` remain the reproduction source. The four stable surface control/contact/hard-touchdown spans are now checked against every selected RAM cut alongside the existing Space, Body and interaction readers.

`hq-return-land` restores complete `hq-return-low-fine/f180`. Its `f65` is frame7073/ticks77817, still surface EAGLE3 with eye `[179535652,22605,103048668]`, contact0. At **frame7074/ticks77828**, the original `HARD_TOUCHDOWN` callback records eye `[179535605,-6367,103048593]`, vertical `D3=-13924`; `LEAVE` follows in that frame after the original Y63 clamp. The `f66` TOP at the same frame/ticks precedes those callbacks and still has eyeY7557/contact0, so it is not the settled foot mutation cut.

By `f67` (frame7075/ticks77839), the player is foot selector1/craft−1, contact63/landBits0, TOLOSA100/group23/cell18/Floor0, eye `[179535605,63,103048593]`, signed local `[-3267,-5567]` in exterior region22. EAGLE3 is published as state32, group23/zone0, residence `[100,0,0,18]`, world `[179535605,0,103048593]`. Key31 remains state133/held in VOID `[120,1,0,16]`, with stack `[31,181,104,103,135]`; key32 remains unheld and script-held38 stays independent. `f70` and later retained cuts settle at that same foot position. This landing is near the HQ cell, not inside the building or precisely at the proposed south park.

The closing VM remains at `$766DC`, queue0/timed target0, original return stack retained and timer continuing; flags remain `[0,128,162,0,0,0,0,0]`, availability5/6=0,119=`$20`,115=`$A0`. Destination programme request1/cursor`$6E50`/timer0/budget0 and the independently captured actor owners remain live. The landing does not reset election or replace the held inventory. All seven later whole-machine landing replay cuts match complete RAM.

## HQ entrance, B lift and acquired-key31 throat

`hq-return-entry-lift` walks around the exterior to the south entrance axis, then north into the keyless entrance and lift. The ordinary location hook requests reception5 at **frame7482/ticks82316**, but availability5 is already0 after election119; this request does not prove a new5 launch or displayed reception. B/scancode48 executes `FLOOR_KEY` and `FLOOR_SELECT` at7538/82932. The later `FLOOR_BOUND` callback at7552/83086 binds Floor10 at eyeY1563. By `f450` (7568/83262), local `[141,-2089]` and boundFloor10 are retained with key31 held. Election's disabled5/6 therefore does not silently erase the remaining building hooks.

`hq-held-key31-door` approaches the western first throat. At `f70` (7638/84032), local `[-99,-1417]` is region5 and key31's latch is0. By `f75` the latch is1; `f81/f82` reach region9's clamp at Z−1920, `f84` reaches throat10 at `[-99,-1938]` with latch−1, and `f86` reaches corridor11 at `[-99,-2034]`. The original key predicate has126 samples, all attachment `A0=592` and low-word `D6=124` (slot31×4), from7642/84076 through7658/84252. No `DOOR_LOCKED` branch occurs in this family. The actual latch and corridor transition, together with the independently acquired held bit, prove this finite first-door opening.

Entry into region11 also records `LOCATION_MATCH` and **SCRIPT_REQUEST117 at7652/84186**, trigger pointer `A0=$22F18`. The `f84` TOP at that same phase still precedes the movement and request; it must not be described as the script's mutation cut. The pinned HQ table `$22F0C..$22F20` includes this region11 record and the terminator (SHA-256 `252220c0c9e47511ac9a9ba4f7d3be78a8cad8305a29dd41bdc850088fc301c5`). Script117's entry `$74645..$7464D` is pinned by `de9733fca05830d2bf88a117f9414e832163c3d67972277b722922b4ce611fdd`; all six graph sites, including the shared `$701DD` clear-flag6 and return, match the independently pinned progression metadata.

The `$8C` predicate at `$74645` tests held32 with an inverted branch to `$701DD`. Its owning reader `$52C20..$52C3A` tests bit7 of the independent object-state byte (coherent-source SHA-256 `73c5bf64d5894501dfdee7bd8474781781f6ee4f4c90b07bd7120708abbf83d1`); absence of32 skips model-swap-A. At `f86`,117 availability has changed `$A0→$20`, PC is `$701DD`, caller return is `[$766DC]` and active flag6 is transiently set. At `f90`, the caller is restored at `$766DC`, the return stack is empty and6 is clear. Chair97/PCB218 model words remain776/34068 across the door cuts, with no model-swap callback; independently captured chair97 state20 and `$6E84=0` also remain unchanged across the door and PCB-probe cuts. The unexecuted held32 path's helper `$52F6A..$52F9A` would bind chair97 to model316 and PCB218 to317, clear their fixed bits and set `$6E84=$FFFF`; these are static conditional effects, not witnessed mutations or a closed ordinary branch.

## Key32 door and selected-PCB Take boundary

By `hq-held-key31-door/f130` (7698/84692), local `[-99,-2322]` in corridor11 naturally selects218. The onward `hq-key32-pcb-probe` retains key31 held and the ordered stack `[31,181,104,103,135]`; key32 stays state5/unheld. Its key32 predicate records1,040 matching `DOOR_KEY`/`DOOR_LOCKED` pairs, all attachment `A0=588` and low-word `D6=128` (slot32×4), from7699/84703 through7828/86122. The key32 door's latch remains0. A `REFUSAL_STRING` request occurs at7729/85033; the log does not independently certify its displayed text.

The two ordinary Take inputs execute at **7758/85352 and7808/85902**, with selected slot218 at corridor positions `[-32,-2418]` and `[-32,-2466]`. Their native selected keys are594386 (`$0911D2`) and594372 (`$0911C4`): both have exponent9. The original Take reader `$55364..$55448` first rejects a key whose high word exceeds8, before the later object checks. Neither input reaches `TAKE_ACCEPT` or the common `PICKUP_RESPONSE` entry, and this probe family requests no script. PCB218 remains state4, residence `[100,15,10,18]`, with its original coordinates/model and response115 availability `$A0`. These are selected-PCB range refusals; they do not repeat the earlier fixed-table224 Take.

The final retained corridor cut stays in region11 with key32's door closed. Eleven held-door/117, three lift and sixteen PCB-probe replay cuts match complete RAM, in addition to the landing replay. This establishes the acquired-key31 return and its resulting finite frontier. It proves neither that key32 is required by every PCB path nor that PCB218 is globally unreachable. Ordinary DION key32 acquisition/return, other PCB approaches and the resulting model/response115 effects remain the next focused research gates.

## Verification and remaining admission

The independent read-only observer rebuild reproduces67 families,720 cuts,6,137 assertions,87 source tuples and62,640 capture-source comparisons. Trace phases retain8,453 TOPs,8,385 eleven-tick gaps and one native zero-tick re-entry; restored-source callbacks have their separate phase checks. All70 restored comparisons match every byte of the1MiB RAM. Seven synthetic tests verify owner independence, provenance refusal, callback placement, full-width phases, complete-RAM equality and paired door summaries; they supply no ordinary route themselves.

From the repository root:

```sh
PYTHONPATH=research/mercenary-iii-st python3 research/mercenary-iii-st/scripts/clotho-key31-evidence.py
PYTHONPATH=research/mercenary-iii-st python3 -m unittest discover -s research/mercenary-iii-st/tests -p test_clotho_key31_evidence.py
```

The stable VM dispatcher `$52860..$52910`, common consumers `$52B40..$52F6A`, launch/availability reader `$55A0E..$55A7E` and signed programme writer `$52FF2..$53002` are pinned against the coherent source and all selected cuts. They own decoded graph execution, including held32 inversion/return, flags/timers/availability and scripts140/119’s signed requests; decoded opcode names alone are not the execution provenance.

Default observer mode compares the parsed retained ledger before accepting regeneration; `--out /tmp/clotho-key31-review.json` writes a separately reviewable candidate. The earlier `cd web && bun run check` passes2,690 application tests and14 tooling tests, including type, lint, formatting and documentation checks. Final documentation and local-link checks pass after this report’s completion. Independent review has no remaining required findings across correctness, readability, architecture, security, performance or the stated ordinary research scope.

The coherent source remains SHA-256 `71b957b3b7124959b01bd40b896c921d37902c18cfca042bef1906b155ef0170`. Source pins for arrival/conversion/Take/scripts140/119/117/programme and existing R2/R4 owners are retained by the observer and source packet; the original graph metadata is pinned independently. The source-only companion is not changed into an execution claim. This report adds an ordinary key acquisition, consequential BIL programme and election/HQ script exposure and first-door return; it leaves the wider route/item/service inventory, conditional model branches, response115 launch/effects and final promotion decision open.
