# Mercenary III TOURCRAFT: used playback and cadence gate (R6)

Research for [#707](https://github.com/odogono/mercenary/issues/707), 2026-10-02, under [D2](mercenary-iii-tourcraft-milestone-review.md). The complete early METIS resident-13 → TOLOSA flight is reproduced at natural 50 Hz and at instrumented eleven-tick frame ends. **The fixed atomic-frame confirmation remains open: the original re-enters its loop during space/Body transfer, and the rule-level fixed-phase calculation disagrees with the instrumented engine by one dialogue frame. Unrestricted late entry/waiting also exposes a campaign scope conflict. Return these two findings to D2 before I4; neither cadence nor message rules are changed here.**

The [reuse assessment](mercenary-iii-tourcraft-reuse.md) supplies exact current Damocles functions, numeric-core comparisons, differences, extraction proposals, regression checks and the #419 admission handoff. The [clock/script report](mercenary-iii-tourcraft-clock.md) supplies accelerated-rate arithmetic, fractions, the complete used script reduction, cash and connected campaign queues. Together these are R6's research handoff, not runtime implementation, content promotion, R7 presentation certification or R8 restore certification.

## Evidence and boundaries

Use the unchanged [baseline manifest](../../research/mercenary-iii-st/config/baseline.json): STX `4e8b74122910bcaa109b944eebb6f0ec18fdeb1175c34eea3c932d0e1b18b62c`, EmuTOS `154803e3ff4851f3dc358b91b16d6b6110d187a81d8132ecb665af49878939d5`, Hatari 2.6.1 `05723606c75a1f0642395974abdce2cbbe48b0a09a747f65cdfca7ef9201e11a`. All three were checked before the experiments. The compared repository is `cd3e8db9bf319d0142d827072ab7fb41954f5c71`. ST/68000/1 MiB, 8 MHz, cycle exact, RGB/WS3, sound off and remaining [integration flags](mercenary-iii-integration.md#cold-boot-and-controlled-probes) are retained except the explicitly identified synthetic timing probe.

- **N60:** a new cold boot repeats R5's fourteen mailbox/stick writes, with no program, pose, cash, script or service edits. It reaches the same endpoint as both R5 runs.
- **N50:** a new cold boot selects 50 Hz with `$FF820A=$02` at VBL 10, then uses fourteen mailbox/stick writes. No CPU acceleration, cadence/code patch, relocation, account or playback write occurs. The hardware-frequency selection is recorded configuration instrumentation; this is natural game control at that frequency, not proof that this STX originally shipped as PAL.
- **P11:** the N60 approach is retained until VBL 23460. Then the debugger selects 50 Hz, raises the CPU to 32 MHz and applies [#642's frame-end wait instrumentation](mercenary-iii-taxi-cadence.md#baseline-and-method). B is still an original input. This is a synthetic timing probe with a naturally reached boarding precondition, not a natural eleven-tick engine.
- **P controls:** whole-machine restores of the near checkpoint perturb cash/message/candidate fields or supply live cabin inputs. They establish those mechanisms, not a new natural route.
- **S:** targeted original reader/script/table decoding, Capstone 5.0.7 in M68K/68000/big-endian mode. Original code, RAM, screenshots, machine states and decoded dialogue/control records remain ignored under `restricted/mercenary-iii-707/`, following [ADR 0002](../adr/0002-separate-rom-research-from-implementation.md). No Damocles datum establishes a Dion record.

## Admission, start and ownership

The used service is the group-3 resident-13 record `$51ADE`: control origin `$66D2A`, script `$29`, pilot head 279, passenger descriptor and zero price. Its binding is already recovered by [R5](mercenary-iii-services-progression.md#leaving-metis-observed-tourcraft-journey). The resident offset `$34` is distinct from the craft Mover's slot 1.

`$55474..$5554E` checks, in order: selected proximity exponent at most 9; nonzero selected resident reference; the eligibility bit tested at `$55482`; resident index nonzero and below 28; negative current occupied slot; non-VOID context; excludes indices 16–27 from this immediate craft path; ordinary admission-bit exceptions; model header `$8001` or `$800D`; header byte `+3 = $40`; then special index branches, including the **nonzero cash longword** for service indices 12–15. Silent failures arm the ten-pass passenger fallback at `$5546C`; the cash failure requests message `$0C` through the busy-gated ID helper. Model eligibility and proximity precede the cash test. This is not a taxi call/card check or a paired Vehicle Key requirement.

On success, `$55522` arms start at `$5A8F0`, `$55528` stores passenger offset, `$5552C` control origin, `$55532` descriptor and `$55538` price; it attempts script `$29`. At the next loop's start check `$5A458`, `$52742` starts playback independently of the pilot dialogue: `$70A2=1`, frame counter `$7180=0`, view offset `$717A=0`, header pose/System coordinates, stream cursor, craft selector/slot `0/1`, stopped control/speed values and geometry/context caches. No additional user Start, Esc or Leave is required. Script `$29` is repeatable but not queueable; an active script can refuse it even though admission arms playback, which matters for late entry.

P11 controls preserve the naturally reached near Pose and all prior play. All of these remain on foot:

| Control before B | Original result |
|---|---|
| Six cash bytes zero, bar idle | `$0C` requested at VBL 23501; accepted; no admission/start |
| Cash `000000000001`, bar idle | Same refusal: the two trailing bytes do not satisfy the longword guard |
| Zero cash, already busy bar | `$0C` attempted with `$723A=$FFFF`; dropped, with no queue or admission |
| Clear candidate eligibility field before B | No cash message or admission; earlier guard prevents reaching cash |

The same cash/message controls at N60 frame timing agree. These cover the used guard and busy refusal, not universal boarding or every hypothetical craft/model.

**The craft and the cabin view have different input owners.** The foot, surface craft and space entries use the playback control latch for movement. Ordinary live keys reaching `$56838` are redirected to the playback-key reader while playback is active, so a user's early L does not replace the recorded L. However, `$5183E` reads the live stick: right/left bits change cabin view offset `$717A` by ±16 per invocation. `$59D34..$59DD0` applies that offset to the copied presentation Pose; `$55718` preserves its yaw on exit. Menu/pause/save controls have their own dispatch; this is not a claim that every keyboard command is disabled.

P11 live-control verification holds right from VBL 25000 to 26000, then backward to 27000, with an early L at 26000. Playback still enters TOLOSA at frame 462 and leaves at 927 with the same XYZ/cash. The accumulated view offset is `$05B0`; exit yaw is `$0329`, versus `$FD79` in the neutral control (16-bit sum). Backward does not change the prerecorded craft trajectory. The integer exit clock differs by one second because original instruction/raster phase still changes; it is not a restored-future equality proof.

## Complete used playback format and phase writers

The 22-byte header has surface X/Z longs, yaw word and three System-coordinate longs. Here those are X `$09E17964`, Z `$042A78B2`, yaw `$01FC`, System XYZ `[$0003A980,$00000040,$000B18A0]`. Start sets surface eye Y to 63. The first action is at `$66D40`.

An action is two bytes: low frame number, then command. A command with bit 7 set updates held controls `$7057` from its low seven bits; otherwise it supplies a scancode. `$565E2..$56610` consumes at most one due keyboard record during input. Surface `$59014`, space `$59516` and foot `$59A3E` consume a due held-control record before their pass; otherwise they retain the latch. Both compare the first byte with `$7181`, not the full frame word. Cursor `$709A` advances only when the matching type is consumed. Type order, sparse records, same-frame key-then-stick pairs and 256-frame wrapping are future-affecting rules. No timestamp is a VBL deadline and there is no implicit termination byte.

The used prefix contains **134 actions: 28 keyboard and 106 held-control changes**, through recorded L at frame 927. The next record, Enter at frame 934, is outside this flight: playback has already been cleared, so it is not consumed. The recorded keyboard commands comprise throttle scancodes `$03..$0B`, repeated `$14` adjustments, spacebar `$39` at 911 and L `$26` at 927. Held controls are sparse intervals of 0, 1, 2, 4, 8 and 9, including wrap boundaries at 256/512/768. Recover every interval from the pinned local stream using the recipe below; do not substitute destination steering or an authored route.

| Phase/writer | Recovered operation and used state |
|---|---|
| Start `$52742` | Header and cursor initialization; playback on; slot 1; neutral view; restarts the main loop |
| Surface pass `$5900A` | Slot-1 common craft arithmetic; stopped/on-foot setup first, then recorded throttle/turn/pitch controls; ordinary clock rate 32 |
| Space threshold `$5A704/$56B28` | At relative Y high word ≥ `$1F0`, selector becomes 2, Body becomes `$FFFFFFFF`, arrival hold 50, flight/contact/exponents are reset; service/presentation published; loop reentry |
| Space pass `$59502` | Slot-0 numeric pass, speed/range drag, System XYZ and speed-derived clock rate; nearest Body scan `$53D32` uses **unrotated** ranges |
| Body entry `$5A8E0/$5A15E` | Arrival request is consumed; selector 0; eye altitude `$01800000`; original placement conversion and Body/group/workspace setup; TOLOSA Body `$64`, group 23; `$6FF48=$FFFF`; publishes staffed resident and resumes surface loop |
| Descent/normal contact | Slot-1 pass continues recorded inputs. After frame 883 eye Y/contact become 63. Contact alone does not exit this observed flight |
| Recorded Leave `$565FC/$5569E` | At frame 927, L passes the ordinary contact/land/context guards; clears fare/speed; clears playback/passenger; ordinary on-foot selector/slot `1/$FFFF`; preserves cabin-view yaw and writes the resident's new residence through `$55970` |

The used slot-1 and slot-0 parameters, packed arithmetic, launch/space/landing helpers and specific differences from Damocles are enumerated in the [reuse matrix](mercenary-iii-tourcraft-reuse.md#reuse-matrix-and-implementation-handoff). The hard-touchdown/fall alternative `$58DB6` is a static comparison, not the observed normal-contact/recorded-L exit. Collision retry can invoke the Mover twice in a frame and must retain the original service-before-refusal order; a second pass is not a new playback frame.

Neutral-input arrival is exactly XYZ `[$0AB293C2,$0000003F,$06238BEF]`, raw yaw `$FD79`, Body `$64`, group 23, cell `01-00`, passenger 0, playback 0 and on-foot selector/slot `1/$FFFF`. Cash remains `005100900000`. The original writes the service resident on the destination; leaving it permanently at its METIS starting residence would change the next world. R7 must retain both the header's initial placement and these mutable placement/Body transitions.

**TOLOSA also starts an OBSERVER programme on this early path.** The `$6FF48=$FFFF` write is not decorative. `$523E0` initializes the first programme at `$6E50`, with count 3, active request 1 and a 1,000-**frame** timer. Request 1 selects resident slots 56–58 and their four-record looping trajectories. The twelve used shift/control bytes are nonnegative, so the sign-gated hostile-launch call at `$522AA` cannot run; incoming-shot slots 53–55 are empty in all retained early-path captures. Player shooting is refused aboard the staffed service and on foot, so the used programme cannot advance through player kills to its later hostile pair. This bounds early damage/cash/control effects through those readers; it does not make the moving/drawn objects or their future state optional. N50/P11 arrival samples retain request 1, live trajectory state and a partly spent timer. The [reuse report](mercenary-iii-tourcraft-reuse.md) pins the programme, firing guards and title-specific pool; R7/R8 must include this encountered programme and its retained futures rather than disabling the request. Later campaign overrides remain part of the separate scope conflict.

## Cadence: supported counts and failed confirmation boundary

Playback frame 927 is a recovered command count, not a flight duration. Observed counts/endpoints agree, but clocks and original scene-dependent VBL costs differ:

| Run | Launch VBL / seconds | TOLOSA-entry VBL / playback frame | Recorded L VBL / frame / seconds | Launch → L ticks / integer clock increase |
|---|---|---|---|---|
| N60 | 23506 / 375 | 28728 / 462 | 33735 / 927 / 14871 | 10229 / 14496 s |
| N50 | 22552 / 372 | 26875 / 462 | 31160 / 927 / 12185 | 8608 / 11813 s |
| P11 | 23501 / 375 | 28583 / 462 | 33698 / 927 / 14209 | 10197 (= 927×11) / 13834 s |

In P11, surface→space completes during frame 139 (first space top VBL 25029); normal contact completes in frame 883 (first contacted top 884, VBL 33226); Leave runs at 927 and the next on-foot top is frame 928, VBL 33709. TOLOSA entry is airborne, not the endpoint. These are sampled/reader-boundary facts, not permission to infer a universal frame cost or the advertised 3 h 10 min. Natural 50 Hz launch→L is 172.16 wall seconds at that frequency; P11 is 203.94 tick seconds. The [clock report](mercenary-iii-tourcraft-clock.md#clock-ownership-and-arithmetic) preserves the independent accelerated game-clock meaning and fractions.

**Why the existing wait-patch confirmation is insufficient.** The unpaused VBL advances message/wait/clock state; input and script processing then run before the Mover/service. In P11 the steady frame-end delta `$5301E` is 11. Nevertheless `$5A372` initializes a new boundary on launch, the loop is re-entered on space/Body transfer, and main-loop tops include intervals of 10/12 ticks and duplicate frame numbers. At frame 139, two tops at VBL 25029 execute `$70616` (call W100) and `$766E6` (reset wait). The next top is VBL 25041, twelve ticks later. The wait consequently reaches 100 at frame 148 instead of frame 149 under a strict eleven-tick top phase. TOLOSA setup runs before the single interpreter-bearing top of frame 462; its next top arrives ten ticks later. This transfer resumes the loop but does not add a second script invocation at 462.

An independent model evaluates the decoded script, holds and waits with tick rules **before** each atomic eleven-tick frame, including the observed repeated script invocation at frame 139. With first fetch at frame 2, it predicts first text at 16, the post-space text `$7061E` at 152, final text `$70897` at 715, closing blank at 737 and script return at 745. The instrumented engine has first text 16, then 151/714/736 and return 744. Of the 39 used text/blank requests, the 32 after the space-entry wait carry the stated one-frame discrepancy; successful arrival does not erase it. Used messages fit a single 48-cell row, so this is not a long-text/chunk explanation.

The ordinary pilot script is idle before recorded Leave in both models/runs, and the targeted busy cash-refusal outcomes agree. That narrower agreement does not prove all fixed-phase message/queue interleavings. **R6 therefore does not close ADR 0058's flight gate.** D2 must resolve whether/how the evidenced reentries fit the accepted atomic-frame contract and require a matching rule-level/original-engine probe. No extra opcode is silently invented or removed, no busy message is forced, and the cadence stays 50 Hz/eleven pending review. Raw VBL observations must not be published as exact atomic-browser counts.

## R7/R8 handoff and implementation blockers

The phase-boundary checkpoints needed for R8 are: near B with the input mailbox pending; accepted admission before start; start after header initialization and before the first script fetch; surface→space immediately before/after loop reentry; clock acceleration and each frame-byte wrap; arrival hold and selected TOLOSA before Body setup; first airborne TOLOSA frame; pre/post normal contact; record 911; pre/post recorded Leave 927; and the first on-foot frame, with both neutral and turned cabin views. Preserve enough state to distinguish every side of these boundaries.

Beyond R3's taxi state, carry playback origin/cursor, held-control latch, full/low playback frame relation and phase/reentry status; launch pending flag; ordinary selector/slot and occupied resident versus passenger service identity; raw Craft Parameter Blocks, throttle/speed/yaw/pitch/filter/contact/swing state, System and surface XYZ, current/previous trig/pose used for collision retry; nearest range/Body, arrival hold/request; Body/group/workspace/region and mutable resident placements; cabin view/vertical offset, pilot sequence/cursor/count/profile; clock rate/period/fraction/seconds/day and pause; input mailbox/live controls; actual script PC/stack, availability/flags, busy/hold/continuation/wait, queued and timed scripts; OBSERVER request/programme cursor/count/frame timer, per-resident state/position/increments and mutable trajectory pointers; Body rotations/cached coordinates, sound and presentation phase. Reconstructibility and browser schema/migration are R8's proof obligations, not established by restoring Hatari RAM.

R7 needs METIS resident 13/head 279/cabin and immediate approach, the used surface/space sky and Body scan records, destination conversion and TOLOSA `$64`/group 23 workspace at `01-00`, normal contact support/boxes, OBSERVER model 320/slots 56–58/used trajectory bindings, and the original service resident's mutable transfer. Encountered drawable sky Bodies are not newly playable destinations. The [reuse assessment](mercenary-iii-tourcraft-reuse.md#differences-that-affect-the-selected-flight) identifies the Body/range/rotation differences that presentation and placement must not inherit from Damocles by assumption.

Two findings block implementation: the atomic timing discrepancy above, and [late-entry/waiting campaign scope](mercenary-iii-tourcraft-clock.md#campaigntime-effects-and-late-waiting). The early recipes stay below the election threshold and show empty campaign queues. At later elapsed seconds, election/mining can occupy the script queue, suppress the pilot script, schedule encounters and clear cash, affecting the admitted flight. Returning these connected effects to D2 satisfies the required scope-conflict report; broadly disabling them would not. Full later campaign branches, arbitrary boarding, return flight and self-piloting remain outside this research. Full pass-by-pass runtime regression, R7 content/presentation closure and R8 restore/migration proof remain downstream gates.

## Portable natural-input and decoding recipes

Run from the repo with `PYTHONPATH=research/mercenary-iii-st`. `m3lab.boot.run` checks all baseline pins and writes Restricted Material under the specified ignored root. Captures precede same-VBL inputs. For N60, use [R5's fourteen-write recipe](mercenary-iii-services-progression.md#natural-metis-spaceport--tolosa), unchanged. The newly completed N50 cold-boot recipe is:

```python
from pathlib import Path
from m3lab.boot import Plan, run

inputs = [
    (5204, ('key', 0x72)), (6500, ('key', 0x66)),
    (9200, ('stick', 1)), (9735, ('stick', 0)),
    (9900, ('key', 0x30)), (10800, ('key', 0x4e)),
    (11100, ('key', 0x4e)), (11400, ('key', 0x66)),
    (21200, ('key', 0x26)),
    (21800, ('stick', 4)), (22154, ('stick', 0)),
    (22200, ('stick', 1)), (22492, ('stick', 0)),
    (22550, ('key', 0x30)),
]
print(run(Plan('r6-natural50', inputs=inputs, pal=True,
    captures=[21500, 22154, 22492, 22600, 25000, 28000, 30000, 34000],
    pc_captures=[(22400, 0x55522, 'admit'),
                 (22400, 0x52742, 'launch'),
                 (22550, 0x5a178, 'body-entry'),
                 (22550, 0x5569e, 'automatic-leave')]),
    root=Path('restricted/mercenary-iii-707/runs').resolve()))
```

The successful N50 near checkpoint has XYZ `[$09E17AB0,$3F,$042A7C40]`, yaw `$008C`, candidate reference `$34` and proximity exponent 9. The N60/P11 near checkpoint is `[$09E17B80,$3F,$042A7AE0]`, yaw `$0074`, with the same candidate/exponent. These are **position-based preconditions**; the timestamps are portable reproduction leads, not browser admission rules. If a different render/capture schedule changes the walk, stop by the actual resident/candidate/proximity condition instead of relocating or extending a timed B assertion.

To independently recover every used action, load a locally obtained pinned RAM capture with `m3lab.ram.Ram`, require `$66D2A..$66E4E` hash `aba500dfa1b666e57421b4714ccd897bc780a1604c9bf33e22038c9de1f48a89`, then read pairs from `$66D40` to `$66E4C` exclusive. Add 256 to an epoch when the first byte decreases; retain equal-frame pairs in source order. Emit `{frame: epoch+first, kind: 'stick' if second&128 else 'key', value: second&127}` to an ignored JSON file. Decode script `$29` at `$70579` through its final jump `$708BC`, following the call/return targets in [the clock report](mercenary-iii-tourcraft-clock.md#outward-script-waits-and-queue-ownership). The input reader/type and latch rules above, rather than the export loop, govern execution. Re-extraction must reject altered source ranges and must not include the unused frame-934 Enter or another service's script.

## Artifact and source pins; validation

Paths below are relative to ignored `restricted/mercenary-iii-707/`. Whole-RAM hashes identify these observations, not universal replay checksums. The saved whole-machine `natural-near.sav`/`exact-near.sav` and their sidecars preserve emulator phase for perturbation controls; transplanting RAM alone is not equivalent.

| Artifact | SHA-256 |
|---|---|
| `runs/natural-11-4jueev7s/near.ram` | `323fefc576142a0fd8b312075b792b7e068ee6fc93e81bd6c739f6263032bd95` |
| `runs/natural-11-4jueev7s/v35000.ram` | `011f4165e93329353bb77a45af6ff2b03565674653b1dd4e97a0ffa02ce8775e` |
| `runs/natural50-flight-f95mbv94/v22492.ram` | `33853a7db01a918cf9da3ea63b952f06244dc6c10a69294d1af89983728a01ee` |
| `runs/natural50-flight-f95mbv94/v34000.ram` | `4a807197b68c789056541cc95428c0a82e0e0f47e49dbbe7fb45a2c20538a8bc` |
| `runs/exact-11-14c2p26m/near.ram` | `0b404a1dd813fc79dc95fbe2b280ec4be6a79060dd3a7bad6844e447ecc04f39` |
| `runs/exact-11-14c2p26m/v35000.ram` | `91c9dcd9065e7628cc0ddb832d379c4511b8eb649025e20f26774b6f225bd41d` |
| `runs/exact-live-input-07yl7ey3/end.ram` | `2fbd98c2ea6ce5ef59ac44dda04cb1f2edf6628ad41efd713b4eb84635ca62af` |
| `runs/exact-cash-fraction-only-jgjiebat/end.ram` | `502f95eff80357af2058dbbb58dde8a6c16ccb4c279651626dcf94ea6d752a33` |
| `runs/exact-busy-cash-zero-8s1cef_z/end.ram` | `78102d0e6d1a417d1527fd2f08a162ddd7b6f9c21d3c9dcc4bb76b467e8c12ab` |

The phase/cadence claims are pinned additionally to the retained logs: N60 `runs/natural-11-4jueev7s/hatari.log` = `0fd95e4fa3c553147e00c26fc6e8e22e077418730338da2db46e639685bb48dd`; N50 `runs/natural50-flight-f95mbv94/hatari.log` = `76dcd7c4e234f6ada52f8a786a686af8ce6b425f57d3a7a0223960720cc81aef`; P11 `runs/exact-11-14c2p26m/hatari.log` = `d950cf2315595475de71307b0cbfcfd9ef77cb1a4c184b10fe1751ef3224462e`. For P11's flight tops 2–928, all 928 sampled frame-end deltas are 11, but consecutive top intervals are 884×11, 21×10, 21×12 and one duplicate at the same VBL. This is the measured reason frame-end equality does not establish the required fixed atomic phase.

Half-open source ranges below are from P11 `v35000.ram`; companion ledgers separately pin the R5 source and Damocles comparison. Some engine instructions/inline state self-modify: a capture-specific hash must retain its source identity rather than be silently treated as immutable program bytes.

| Range | Role | SHA-256 |
|---|---|---|
| `$565E2..$56654` | Playback keyboard/mailbox readers | `8b18b63f78fccc09d8101d7d55dc4eefc2d2c78f36cb55a6086757d80bdee422` |
| `$55474..$5554E` | Immediate/service admission | `332a809ec04d4cbe7325958e9d0fdcc5e7f162bcd14df8abf65b0388b2f6dbca` |
| `$5569E..$5573C` | Leave/playback cleanup | `b7cd0bfc2a997c1bffcb6c2809fd4b88f580f040be27ca145357a8424fc2c429` |
| `$52742..$5281C` | Header/start initialization | `ac48f875bd019f93c31faec901e6fd57ee5865666c8883bee2a2d97a0724e210` |
| `$59502..$59544` | Space playback entry | `19359ab5e4a425389d629f645fd60d6d6ce3de094f7aa73bcb69562d0de43322` |
| `$59A36..$59A6C` | Foot playback entry | `4a4597d0cebb1a5826ec877871fd8a380d764f62e52aa9524044156e818ff242` |
| `$5A372..$5A3CE` | Main-loop restart/boundary | `47f6c7c9bcd2c8d1a6e69b8bfdc48d6789eb4007eea58cb0622a457d23daf537` |
| `$5A41A..$5A47A` | Input/start/interpreter order | `bbc899c7c330d0b521c43c44d4186069e7f7ece6bedddbe0105fd427d143e69e` |

Validation: three completed cold-boot/timing flights, matching neutral endpoint/cash and recorded Leave frame; restored cash/busy/eligibility and live-view controls; original phase traces against an independently decoded tick/frame script model; source/capture pins, independently calculated space-clock sample rates, reuse comparison and documentation links/whitespace. The model discrepancy and late scope conflict are retained as failures of completion gates. No application, payload or Save schema changed; application tests were not rerun for documentation-only research. Issue #707 remains open pending D2 resolution and the unconfirmed cadence gate.
