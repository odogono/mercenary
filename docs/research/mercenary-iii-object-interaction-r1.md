# Mercenary III: R1 object interaction execution and reuse

Research handoff for [R1/#770](https://github.com/odogono/mercenary/issues/770), part of [#756](https://github.com/odogono/mercenary/issues/756), 2026-10-04. The [initial evidence](mercenary-iii-object-interaction-evidence.md) and [programme plan](mercenary-iii-object-interaction-plan.md) merged in [#769](https://github.com/odogono/mercenary/pull/769). This report adds original execution at the accepted eleven-tick cadence and a current Damocles reuse decision. **R1 remains open.** The remaining gates below prevent treating this handoff as complete mechanism or playable-scope admission.

The cold-opening route drops/re-picks TAXICARD104 and BUS PASS103, rotates both ways, and then acquires the originally resident MARGARETS LETTER220. The route agrees at 16 and 32 MHz. Separate synthetic controls execute capacity, handling, staging, rotation, contact, support, distance and visit-order rules. They establish mechanism behavior, not ordinary access to the injected objects or placements. No runtime, Data Payload or Golden Trace change is made.

## Method and authority

The original engine is the primary source. [ADR 0002](../adr/0002-separate-rom-research-from-implementation.md) separates this research from an independent implementation. The existing [strict atomic follow-up](mercenary-iii-tourcraft-followup.md) establishes the accepted timing adaptation; this probe retains its masked-frame/eleven-original-tick wait, recovered from the retained R8 instrumentation. It does not claim that natural ST rendering takes eleven VBLs.

Ignored evidence is under `restricted/mercenary-iii-770/` in the main checkout. `harness.py` uses the pinned R6 `lab.py` runner, captures a cold opening at loop top `$5A41A`, restores that complete machine state, installs the accepted wait instrumentation and applies inputs at loop tops. Interrupts are unmasked only in the wait; the original tick handler advances eleven times against a private boundary, then interrupts are masked during the simulation/render frame. CPU clock is changed to 16 or 32 MHz after restoring the same seed. The private boundary is instrumentation, not a recovered game-state owner.

The route uses debugger-fed original key latch `$56726` and joystick copy `$7056`. It does not test physical keyboard/IKBD input or browser controls. Its position, Residence, stack, held bits and selection are not injected. The separate `fixtures.py` cases explicitly inject handling/held state, stack/count/capacity/store, selected slot/key, contact or resident height to isolate handler rules. `distance_controls.py` instead injects candidate-list/position fixtures and lets the original list builder, arithmetic, selection writer and action handler run. These are synthetic scenes, not natural reachability witnesses.

`read_results.py` reads RAM and original debugger logs. It checks consecutive frame/tick deltas, matching tick phase at traced in-frame readers, and masked SR at register samples. `reuse/verify-handoff.py` separately checks source RAM/snapshot hashes and selected recorded outcomes without simulating the game. Across **55 retained runs**, these checks pass for **1,013 consecutive eleven-tick gaps, 2,610 in-frame phase samples, 1,597 masked-register samples and 265 explicit pin/outcome assertions**. The runs comprise two CPU route controls, 45 handler/stack fixtures and eight candidate fixtures; two of the candidate fixtures are exploratory and inconclusive for their intended visibility/empty-list questions. Counts describe sampled observations, not an exhaustive proof of every instruction or reader.

## Opening route and CPU control

`route.py` starts from the common cold-opening seed (frame1, tick25). At relative top20 it writes opening command `$72`; it holds forward input at relative80 and releases it at124, for 44 simulation frames. This reaches the letter/mailbox area without a pose or candidate injection. Actions are separated by 30 frames so stack scrolling can settle. The table gives actual original handler-entry frames and the following retained top capture; frame labels are not physical VBL numbers.

| Action                | Handler top frame | Retained capture | Resulting stack     |
| --------------------- | ----------------: | ---------------- | ------------------- |
| Before object actions |                 — | `f140`, frame141 | `[104,103,135]`     |
| Drop TAXICARD         |               161 | `f161`, frame162 | `[103,135]`         |
| Re-pick TAXICARD      |               191 | `f191`, frame192 | `[104,103,135]`     |
| Forward rotation      |               221 | `f221`, frame222 | `[103,135,104]`     |
| Drop BUS PASS         |               251 | `f251`, frame252 | `[135,104]`         |
| Re-pick BUS PASS      |               281 | `f281`, frame282 | `[103,135,104]`     |
| Reverse rotation      |               311 | `f311`, frame312 | `[104,103,135]`     |
| Take MARGARETS LETTER |               341 | `f341`, frame342 | `[220,104,103,135]` |
| Settled continuation  |                 — | `f360`, frame361 | `[220,104,103,135]` |

At each card re-pick the handler consumes that dropped card's selected key `$051F7E`. The letter's handler consumes slot220/key `$071402`; after acquisition the selected resident becomes MAILBOX219. These values differ from the older variable-cadence stop's letter key `$081118`, so those older images are not silently relabelled as the accepted route.

Each CPU control retains 361 traced tops with all 360 adjacent gaps equal to eleven ticks, 735 in-frame tick checks and 375 masked-register checks. The gameplay range `$04BBC..$7FEDA` is byte-identical between CPUs at **all nine actual retained cuts** above. The requested offset0 capture was not produced; the common opening seed is pinned separately. The complete RAM images are not generally identical outside the compared range. No full-machine identity claim is made.

At the settled end, KEY A38 remains held but absent from `[220,104,103,135]`, and keeps Residence `[32,1,0,49]`. The key is not inserted or staged with the stack. Thus an ordered stack, held flags and Residence remain distinct mutable owners. This confirms the opening exception identified in the initial report.

Sources: `route-16/manifest.json`, `route-32/manifest.json`, their nine RAM/snapshot captures, associated `runs/*/hatari.log`, `results.json` and `reuse/handoff-verification.json`.

## Synthetic rule controls

The handler fixtures restore accepted route32 capture `f140`, then declare their injected owners in each manifest. Unless stated otherwise they use the original key latch and ordinary frame dispatch rather than calling a handler directly. These controls cannot establish access to POWERGLOVE, ANTIGRAV, BRIEFCASE, an upstairs desk or a synthetic support arrangement.

| Concern                  | Original execution result                                                                                                                                                                                                                                                                                | Scope/fixture family                                                                                                                                                                                           |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Capacity equality        | Count9/capacity10 acquires to10; count10 refuses. Injected count11/capacity10 acquires to12. Count19/capacity20 acquires to20; count20 refuses.                                                                                                                                                          | `capacity-*`; the above-capacity state is injected, not naturally reached. Do not change the recovered comparison to `>=` merely from a conventional inventory policy.                                         |
| Fixed handling           | TOURCRAFT13 bit4 refuses; holding POWERGLOVE157 or ANTIGRAV158 does not bypass it. A synthetic held slot0 does bypass it.                                                                                                                                                                                | `bit4-refusal`, `powerglove-bit4`, `antigrav-bit4`, `slot-zero-bit4`.                                                                                                                                          |
| Heavy handling           | TRANSPORTERa67 bit5 refuses and enters the original message helper with D1=2. Held157 or158 permits acquisition.                                                                                                                                                                                         | `bit5-refusal`, `powerglove-bit5`, `antigrav-bit5`; no natural transporter acquisition route is proved.                                                                                                        |
| Selected key/scroll      | No selection refuses; injected exponent8 accepts and9 refuses. Both positive and negative nonzero scroll block Take.                                                                                                                                                                                     | `no-selection`, `take-exponent-*`, `take-scroll-*`; genuine builder boundary controls are separate below.                                                                                                      |
| Rotation                 | `[103,104,135]` becomes `[104,135,103]` forward and `[135,103,104]` backward. Empty/one-item controls preserve order; positive/negative scrolling blocks the tested rotations.                                                                                                                           | `rotate-*`; intermediate panel pixels and ordered sound writes are not established.                                                                                                                            |
| Staging                  | Twenty actual stack entries use X `$81D5`, Y `300*(index mod10)`, Z `$1831C` for the first ten and `$2831C` for the second ten, group49. KEY A38 is not staged.                                                                                                                                          | `staging-twenty`; the checker asserts every entry's XYZ/group. These are absent-world storage placements.                                                                                                      |
| Ground/contact           | No-contact direct Drop refuses; contact permits it. Synthetic held slot0 permits direct Drop without contact. Empty stack and nonzero scroll refuse.                                                                                                                                                     | `drop-no-contact`, `drop-contact`, `drop-slot0-no-contact`, `drop-empty`, `drop-scroll-positive`.                                                                                                              |
| Support rank             | Zero supply, zero demand and insufficient rank refuse. KEY A38 does not bypass rank; held KEY A39 permits a rank-zero desk fixture.                                                                                                                                                                      | `drop-zero-*`, `drop-insufficient-rank`, corrected `drop-key38-no-bypass`/`drop-key39-bypass`. The successful desk control is distinct from an earlier failed KEY181 geometry fixture retained in `runs/`.     |
| Native support geometry  | DESK240's original model reader produces top38. With injected resident Y0 it places TAXICARD at Y38 and copies support Residence `[60,3,1,96]`. Y25 produces top63 and succeeds at eye-height equality; Y26 produces top64 and refuses through message D1=9.                                             | `drop-supported-desk`, `drop-support-equal-eye`, `drop-support-too-high`. Support top is reader-derived, not guessed from a rendered box.                                                                      |
| BRIEFCASE acquisition    | At count9, taking108 raises capacity10→20. At count10, the capacity refusal occurs before that increase.                                                                                                                                                                                                 | `briefcase-take-nine`, `briefcase-take-full`.                                                                                                                                                                  |
| BRIEFCASE overflow cycle | Injected fifteen-entry stack with head108 drops to nine carried plus five stored, capacity10, and requests string1. Drop commits in that same action. A later original Take, with no store-state reinjection, restores the fifteen-entry order/capacity20. The store-count owner remains5 after re-take. | `briefcase-cycle`, captures `f1/f2/f20/f22/f25`; isolated `briefcase-drop-fifteen` and `briefcase-retake-stored` also retained. This is continuation from a synthetic setup, not ordinary access to BRIEFCASE. |

The original Drop calls `$59EF0`, which classifies placement zone from the player's X/Z against structure extent and writes `$70CE/$70D0`. It is also called in ordinary frames. It is not an occupancy/mode dispatcher. The traces include that reader when checking in-frame tick phase. Generic campaign code or a successful mechanical Take does not prove the pickup-response closure; [R2/#771](https://github.com/odogono/mercenary/issues/771) owns those futures and presentation effects.

## Original candidate arithmetic and visit order

The six successful boundary/order fixtures do not directly inject the handler's selected key. They set a synthetic candidate list and positions at one top, allow the original builder/writer frame to finish, and send Take or Drop at the next top. Their scenes remain synthetic even though the numeric/selection/action path is original.

| Fixture                                              | Captured original selected key | Original result                                   |
| ---------------------------------------------------- | ------------------------------ | ------------------------------------------------- |
| Take, horizontal delta511, same eye Y                | `$081FEC`, slot181             | Acquires181 at head.                              |
| Take, horizontal delta512, same eye Y                | `$091000`, slot181             | Refuses; stack stays `[104,103,135]`.             |
| Visit `[181,220]`, equal positions                   | `$0812BE`, slot220             | Later visited220 is acquired.                     |
| Visit `[220,181]`, same equal positions              | `$0812BE`, slot181             | Reversing visits makes181 the acquired head.      |
| Desk support, horizontal delta111, resident Y0/eye63 | `$061FE8`, slot240             | Supported Drop at Y38.                            |
| Desk support, horizontal delta112, resident Y0/eye63 | `$071010`, slot240             | Exponent7 selects the direct path, placing at Y0. |

These prove the stated integer distances, list order and support threshold examples. They do not cover every mantissa/exponent rounding boundary, draw priority, slot74 exclusion, occlusion, clipped model or pointer target. The two additional `distance_controls.py` probes are inconclusive for their intended questions: `empty-native-stale` permits subsequent scene work to select COBWEB124 rather than producing a controlled empty final scene, and `behind-eye-native` acquires181 but does not establish that its geometry was hidden at the selection writer. Neither is accepted as an empty-list or occlusion witness. The earlier injected stale-key refusal is a handler control, not proof of natural stale selection cleanup.

Sources: `distance_controls.py`, the eight matching family manifests, RAM images, original logs and `results.json`. Previous failed/replaced fixture runs remain under `runs/`; the current family manifest selects the cited run.

## Remaining R1 gates

- Complete controlled draw/selection cases for hidden, clipped, occluded and empty scenes, native exclusions and additional rounding/order cases needed by the reviewed first delivery. The six successful numeric fixtures are useful boundaries, not an exhaustive scene contract.
- Identify the possible restore-time writer/meaning of the absolute operand at Take `$553A4`. The inspected initial operand names slot0; no special-item identity is inferred from Damocles's unresolved restore identifiers.
- Prove ordinary support/interior/other-Body placement routes and transactional Residence behavior for the exact object set R3 admits. Synthetic desk placement does not admit Floor1 or a new access route. The letter route does not prove an ordinary EAGLE-key route.
- Complete any missing refusal permutations, VOID/aboard/offer contexts, BRIEFCASE futures and staging metadata required by that set; explicitly review bounded exclusions instead of treating an untested case as closed.
- Coordinate mechanical owners with R2's head labels/descriptions, open-card ownership, pickup scripts and ordered message/sound effects. This report observes selected message-helper indices but supplies no original raster/audio or all competing-script futures.

[R3/#772](https://github.com/odogono/mercenary/issues/772) depends on R1/R2 for its final scope review. No implementation child is commissioned by these results. The next handoff should resolve the remaining R1 selection/placement questions alongside R2, then freeze the R3 object/effect/content set.

## Pins and reproduction

The pinned environment is Hatari2.6.1, ST/68000, 1MiB, RGB/`ws3`, exact CPU compatibility, blitter off and timer-D off. The cold runner writes PAL50 Hz before the captured opening. Sound output is disabled in this harness; sound fidelity is not claimed. `lab.py` asserts the disk, TOS and emulator hashes before each process. Native code/range identities and the older coherent seed remain in the initial report; this run has a separately pinned cold seed and explicit timing patches.

| Artifact                          | SHA-256                                                            |
| --------------------------------- | ------------------------------------------------------------------ |
| `Mercenary III.STX`               | `4e8b74122910bcaa109b944eebb6f0ec18fdeb1175c34eea3c932d0e1b18b62c` |
| `emutos206.img`                   | `154803e3ff4851f3dc358b91b16d6b6110d187a81d8132ecb665af49878939d5` |
| Hatari executable                 | `05723606c75a1f0642395974abdce2cbbe48b0a09a747f65cdfca7ef9201e11a` |
| `opening.ram`                     | `c768983f4e82635fd7242717a4896cf0ac425ded48a08ce4d65536ac0ad7790a` |
| `opening.sav`                     | `e887b5ccb4fe66f74e7131459d6247f3207dff5acc2f58c8414d3e946f42df00` |
| Eleven-tick wait instrumentation  | `9f0f02ea22a98b4fe4556da86129ad571daa1805ae73e98cdf397b9e55d670eb` |
| Frame-wait branch patch           | `1ccd3989761d9bf69ad107d8f5a981714719fc232526c7b5246a0737cbfe705f` |
| `route-16/f360.ram`               | `c537937d98367133bec3b756836346223d18a78a33245b9e29288499b813d330` |
| `route-32/f360.ram`               | `31fa6d5bcfc49d5ec501ab3870d4a28c74f5be9ccc2465f5f519fb1bfb2ec523` |
| `harness.py`                      | `2d4597d6572d84c0e3f26236f131fecb866c64ef31c8d4d71038190be7cf4069` |
| `route.py`                        | `8e6d0d530c44a99e09635f0706fc96472a298e4f870000062af24a861ec5c643` |
| `fixtures.py`                     | `8e6ff650b80dc4fe048145e7128bbb340c846882311f133fb39de3b5848423bd` |
| `distance_controls.py`            | `82b5571dcfc248c6bdcacd4eba2d9eb3f01dfc71776eb9baf2680dee266c7e10` |
| `read_results.py`                 | `e9d66162dd50eeebe888cad8c31f7a1d73c17470afc76358a8c71a1508e0ac47` |
| `reuse/verify-handoff.py`         | `28f5fcb0c9f0a6a12e96f605dd1185f6ec743f904c4e2928b22565d7c23e1557` |
| `reuse/handoff-verification.json` | `e78c027863f80ea35d2ead3a2d5f43e6e8e8cec9d792dfae111e1bc8c8805f73` |

From the repository root, replay read-only verification against retained evidence:

```sh
PYTHONPATH=research/mercenary-iii-st python restricted/mercenary-iii-770/read_results.py
PYTHONPATH=research/mercenary-iii-st python restricted/mercenary-iii-770/reuse/verify-handoff.py
bun restricted/mercenary-iii-770/reuse/distance-audit.ts
```

To regenerate original runs, the ignored Restricted Material, pinned ROMs/emulator and retained R6 runner must be available. Each command records exact debugger edits and source snapshot hashes in its manifests; rebuilding the cold seed replaces local evidence, so retain the cited families first.

```sh
PYTHONPATH=research/mercenary-iii-st python restricted/mercenary-iii-770/harness.py
PYTHONPATH=research/mercenary-iii-st python restricted/mercenary-iii-770/route.py 32
PYTHONPATH=research/mercenary-iii-st python restricted/mercenary-iii-770/route.py 16
PYTHONPATH=research/mercenary-iii-st python restricted/mercenary-iii-770/fixtures.py
PYTHONPATH=research/mercenary-iii-st python restricted/mercenary-iii-770/distance_controls.py
```

The repository's `bun run check` passed after these probes: 2,690 tests/2,603,871 assertions and 14 tooling tests/52 assertions, plus type, research type, lint, formatting and documentation checks. These are regression checks of existing application behavior; they do not implement or verify browser Take/Drop. Final documentation citation/format checks are rerun after composing this handoff.

## Damocles reuse decision

The existing Damocles session is a useful comparison, but its complete Take/Drop orchestration is not a Dion interface. The shared numeric core is already a suitable seam; the mutable stack, held flags, Residence, placement metadata and object effects remain Dion-owned. This follows [ADR 0074](../adr/0074-share-evidenced-craft-passes-with-title-owned-orchestration.md)'s rule that a shared arithmetic core does not imply shared Title orchestration. The initial implementation should use the existing numeric helpers and keep the small stack operations local until a second caller establishes a useful shared contract.

| Mechanism                          | Existing implementation                                                                                               | Decision for Dion and evidence                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native distance key                | `web/src/craft/pass.ts`: `craftFloat`, `craftSquare`, `craftAdd`, `craftSqrt`; Dion tables from `tourcraftContent.ts` | **Reuse the numeric core.** R4 proved the original builders and candidate writers correspond modulo relocation. The additional read-only replay below matches all 13 retained selected keys with the current helpers and Dion tables. Preserve the original normalized key, selection order and exclusions; do not replace the key with a JavaScript distance threshold.                                                           |
| Current candidate selection        | Damocles `nearestCandidate`/`selection` in `session.ts`; Dion `selectCandidate`/`drawKey` in `frame.ts`               | **Audit and adapt the Dion candidate owner.** These currently calculate `Math.hypot` and raw distances. The original handler consumes the selected render-list key and slot, including its exponent gate; a pointer target must ultimately resolve through the same title-owned rules. This replay proves the numeric core, not every candidate, priority or tie in the current frame adapter.                                     |
| Take refusal predicates            | Damocles `takeInstance` in `session.ts`                                                                               | **Use the source comparison as a specification, not a transplanted session method.** The two titles have related bit-4, bit-5, slot-0, glove/antigravity, scroll and equality-capacity checks. Dion must retain its own live owners and the exact exceptions exercised above. Damocles additionally owns catalogue identities, trading state, triggers, sound and its own lifecycle guards.                                        |
| Ordered stack and rotation         | Damocles `carried`, `rotateForward`, `rotateBackward`                                                                 | **Keep a Dion ordered list.** Head-to-tail and tail-to-head array operations are transferable, but their scroll gates, reveal progression, sound and held-bit interpretation belong to Dion. A `Set` cannot represent head order. KEY A38 proves that stack membership cannot replace the held-bit owner.                                                                                                                          |
| Capacity and BRIEFCASE             | Damocles `capacity`, `takeInstance`, `finishDrop`                                                                     | **Dion state and effects.** Damocles derives capacity from carried slot108; the original Dion has a mutable capacity owner and an overflow store. The executed Dion fixture commits overflow Drop in the same action after requesting string1, while Damocles `drop` defers through `pendingBriefcaseDrop`. Dion also retains store count5 after re-taking its overflow; Damocles clears its store. Do not import either protocol. |
| Carried staging                    | Damocles session and script-held flag settlement (`settleCarried`)                                                    | **Dion-owned staging with an explicit contract.** Damocles `settleCarried` clears a script-held override when a handler takes ownership; it does not implement Dion staging. Dion stages the actual stack entries into the original storage group/coordinates and does not stage every held bit. The script-held KEY A38 must remain outside that loop.                                                                            |
| Supported Drop                     | Damocles `dropResidence`/`supportResidence`                                                                           | **Recover Dion model height and placement metadata.** Rank comparison and highest-vertex placement are useful shared concepts; Damocles's catalogue `supportTop`, structure transforms, Residence types and content validation are title-specific. A rendered bounding box is insufficient evidence for Dion support height.                                                                                                       |
| Ground Drop and Residence          | Damocles `directResidence`/`finishDrop`                                                                               | **Dion owns the placement transaction.** The original writes Body, association, Floor, cell, placement group and XYZ together. Its placement-zone classifier and direct/contact path must be represented explicitly; adapting only object XYZ would leave inconsistent residents.                                                                                                                                                  |
| Effects, head commands and scripts | Damocles pickup triggers and open-object handling                                                                     | **Do not reuse title tables.** Dion's three pickup-response entries, KEY A exceptions, card behavior and Instant Prison need R2 evidence and R3 admission. R1's mechanical acquisition does not admit those futures.                                                                                                                                                                                                               |
| Generic Interaction                | `web/src/interaction/index.ts`: cube reach, `Set` inventory, `>=` capacity                                            | **Do not use as the Dion mechanism.** Its reach geometry, unordered inventory and capacity relation differ from the recovered original. It can inform an external action boundary only after the Dion contract exists.                                                                                                                                                                                                             |

### Read-only numeric replay

This check reuses the 13 original RAM images retained for the initial [object evidence](mercenary-iii-object-interaction-evidence.md), not a new emulator run. Those images have variable frame cost, so this check supplies numeric evidence only. At base revision `834daba3523a1d31ae47678f970f558d5acc4905`, the current shared helpers with Dion's pinned arithmetic tables reproduce **13/13** selected keys: `$051F7E` for the indoor NULL and dropped cards, and `$081118` for MARGARETS LETTER220. The queue builder's cached origin is `$7126/$70C6/$712E`; the replay subtracts it from the resident positions, squares the converted deltas, adds Y² to X² and Z² to that sum, takes the square root, and applies the candidate writer's `$7FFFFF` mask. The source comparison in [R4](mercenary-iii-shared-mechanisms.md#2-arithmetic-tables-and-movement) establishes the mathematical contract; the replay checks today's helper implementation against captured owners.

Ignored evidence lives under `restricted/mercenary-iii-770/reuse/`: `distance-audit.ts`, `distance-audit.json` and `queue-builder.txt`. The JSON pins every input image by SHA-256 and records the cached origin, selected slot, position, calculated key and stored key. Run from the repository root:

```sh
bun restricted/mercenary-iii-770/reuse/distance-audit.ts
```

The script loads current Dion content through `loadTourcraftContent`, exits unsuccessfully on a key mismatch, and does not modify game state. It establishes reuse of this numeric composition on these observations. It does not establish general draw ordering, every boundary, placement, browser pointer semantics or full campaign behavior.
