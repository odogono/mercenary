# Mercenary III: R2 response scheduling and native item owners

The #756 research ledgers, scripts and tests this report cites were removed when the programme was rescoped ([#756](https://github.com/odogono/mercenary/issues/756)). They remain in git history at `ab0d6ddf`.

Research for [#771](https://github.com/odogono/mercenary/issues/771), part of [#756](https://github.com/odogono/mercenary/issues/756), 2026-10-04. This extends the merged [effect audit](mercenary-iii-object-interaction-r2-audit.md) and [acquired-owner handoff](mercenary-iii-object-interaction-r2-owners.md) with object-specific scheduler controls and an independent item/panel/sound audit of [R4's native EAGLE evidence](mercenary-iii-eagle-flight.md). It changes no gameplay, playable admission, Data Payload or Save schema.

The primary source remains coherent first-top `restricted/mercenary-iii-708/presentation/exact2/start.ram`, SHA-256 `71b957b3b7124959b01bd40b896c921d37902c18cfca042bef1906b155ef0170`. New original execution and generated debugger scripts are retained in the main checkout's ignored `restricted/mercenary-iii-771/effects-matrix/`. The two tracked read-only observers publish numerical owners, source spans and hashes, excluding dialogue and original instructions. These are Mercenary III research-baseline facts under [ADR 0002](../adr/0002-separate-rom-research-from-implementation.md), with [ADR 0065](../adr/0065-promote-bounded-dion-catalogue-content-through-an-explicit-export.md)'s separate promotion gate.

## Object-specific response starts

The earlier eighteen families executed all three idle graphs but concentrated active, busy and unavailable fixtures on CHILD. This pass executes each named condition for **CHILD216/script28, PCB218/script115 and ORE127/script24**, rather than treating one response's scheduler control as execution of another object-specific response.

All new acquisitions are **synthetic original-program controls**, starting from R1's ordinary outdoor `restricted/mercenary-iii-770/route-32/f140` checkpoint. The fixtures provide selection/distance, VM/scheduler state and, for heavy PCB, POWERGLOVE157's handling bypass. Take itself performs acquisition, stack insertion, held-bit mutation and the response-table lookup. R1's pinned wait/interrupt adaptation supplies eleven original ticks per complete frame. Input is the original debugger-fed mailbox; sound is disabled. These controls prove no ordinary route to the three remote objects or physical keyboard/audio fidelity.

| Control, applied separately to all three responses | Original execution result |
| --- | --- |
| Active VM | Take commits the object at the head, sets its held bit and replaces the single queue with its script ID. Availability remains `$A0`; the active idle VM continues. |
| Unavailable, both idle and active | Acquisition still commits. `$20` availability refuses launch before queueing; no response entry executes. |
| Idle start while message busy | Launch consumes availability `$A0→$20` and installs the response PC before the busy guard permits interpretation. Cuts2/8/30 retain that entry. The first response opcode executes at relative frame47 for each object with the same injected hold500. |
| Queued response with busy message or positive description continuation | The queue and `$A0` availability survive through cut8. A positive continuation reaches the original packed decoder at frame3 ahead of queued launch. The packed cursor is a valid synthetic source request, not the ordinary letter stream. |
| Queued response with negative continuation | Frame3 reaches cleanup `$4DDCA`, clearing the signed continuation. Cut4 still has the queue and `$A0`. Frame4 launches the response and consumes availability; cut5 has queue0/availability`$20`. Cleanup therefore defers launch for one frame rather than executing the queued response in the cleanup frame. |
| Stale/unavailable queued response | On release, the original queue consumer clears the queued ID before availability refusal. The acquired object remains held and at the head. |

All **six ordered pairs of distinct response objects** are executed. Acquisition1 at frame1 queues the first ID; acquisition2 at frame3 replaces it. Cut4 retains both acquired objects in order `[second,first,…]` and both availability bytes `$A0`. Releasing the active VM at frame5 starts only the second response, consumes only its availability and clears the queue. The displaced response does not execute within these controls. This is an overwriteable single queue, not FIFO and not acquisition rollback.

The previous CHILD threshold/timer controls remain independently verified by the earlier observer. New PCB and ORE families each execute threshold-first, simultaneous threshold/due-timer, and timer-first starts. The default election or direct timed competitor precedes acquisition, so the new response queues. Its later original launch pushes the still-live Close PC `$766D1` ahead of every retained Return, subtracts four from the stack pointer, and only then consumes response availability. The simultaneous fixture retains the due CHILD target `$5785` behind election before election replaces it with `$5CD2`; the displaced target does not directly start. These are supplied scheduler boundaries, not naturally reached threshold/remote-acquisition routes.

The [scheduler observer](../../research/mercenary-iii-st/scripts/object-interaction-r2-scheduler.py) verifies each family's complete top trace, within-frame tick agreement, interrupt masks on logged non-top records, requested captures, source/checkpoint/log pins, acquisition/availability/queue outcomes and Return preservation. Its [numeric ledger](../../research/mercenary-iii-st/object-interaction-r2-scheduler.json) retains the fixture events and exact global operation frames. The three finite pickup graphs and earlier idle/timed request sequences keep their separate [effect report](mercenary-iii-object-interaction-r2-effects.md); short pair/priority controls certify starts and acquisition retention, not completion of every subsequent response branch.

All 36 new families pass **616 explicit assertions, 4,032 tops and 3,996 consecutive eleven-tick gaps**. The native-owner audit separately passes 580 assertions. These counts describe accepted finite controls; they do not count ordinary remote acquisitions or independent browser comparisons.

## Actual native EAGLE cuts

The [native owner observer](../../research/mercenary-iii-st/scripts/object-interaction-r2-native-owners.py) first regenerates R4's committed route ledger exactly, reusing its source RAM/whole-machine checkpoint, original-input, log, action and phase verifier. It then reads **143 captured cuts in eleven families**, including 132 requested `fN` cuts and 11 `end` cuts. The original traces contain 1,532 tops, 1,520 eleven-tick gaps and one same-frame/zero-tick space reentry. No new native route or patched item fixture is introduced by this read-only audit.

Each capture matches all thirteen previously pinned R2 owner-reader ranges, plus the native kill/script-request, programme-count sum, fire/sound-request and indirect object-bit writer ranges: **2,431 source-range comparisons**. The [numeric ledger](../../research/mercenary-iii-st/object-interaction-r2-native-owners.json) retains every capture hash, manifest/log/source checkpoint hash and observed owner.

| Owner | Observation across the retained native cuts | Qualification |
| --- | --- | --- |
| Held identities and Carried Stack | Held `[38,103,104,135,181]`; after KEY Drop, `[38,103,104,135]`. Stack contains the ordinary items only. KEY A38 remains held outside the stack. | No new object acquisition or detector149 held writer is observed in these cuts. This finite agreement does not authorize a universal held↔stack invariant. KEY A39 remains a distinct support predicate. |
| Open panel versus occupancy/key | Descriptor `[104,5,4,0]` remains TAXICARD through key Drop, keyless Board refusal, safe landing/Leave/re-board and space departure; reveal stays0. Dropping KEY aboard leaves selector0/slot3 at `key-drop/f11`. | The inherited card does not follow the stack head or occupancy. There is no new taxi journey, BUS PASS service or card command in these native families. |
| Document owners | Selected section/max/pointer and active description object/section/cursor/continuation are0 in every cut. | These families contain no letter stream. They neither invalidate nor extend the earlier executed letter-stream independence/continuation contract. |
| ACME life support | Signed word `$663A=$8400`; warning `$7114=0` and pending warning `$70F8=0` throughout. Space gauges move25/3→25/2 (`f30`)→23/0 (`f80`)→0/0 (`f100`). | The held device's existing predicate survives native contexts; ACME Drop/re-pick aboard or in space is unexecuted. Zero warnings with ACME held do not prove what happens without it. |
| Detector149/random sound | State `$6672=$04`, detector switch bit1 clear, rate `$710C=0` and counter `$710E=0` in all 143 cuts. | This preserves the finite detector gate. It is not the final admitted-world/script-writer proof needed to retain I4's omission. |
| Interaction and native sound | `fire/f11`/global674 selects B-programme `$4CA40` with priority3; `f12` has B idle `$5317C`/priority0. | Firing has a sound-programme future even while detector sound is gated. A priority write alone does not prove that the priority countdown has a downstream reader under a closed detector gate; reassess that omission against the final graph separately. Original audio output remains disabled/unverified. |
| Random cursor | Long `$75A6` changes: space`f10=$3DD40`, `f100=$3DDF6`, `end=$3DE98`. | Zero detector rate does not make the shared random cursor immutable. Retain its actual owner and ordered consumers. |

## Native script exposure returned to R3

Two static readers expand the relevant script set beyond the three pickup responses. Firing `$511F6..$51204`, when campaign flag10 is set, requests **script `$12`** before shot allocation. Kill accounting's later `$51162..$51168` requests **script `$81`** when helper `$52964..$52978` returns zero. That helper sums the 26 programme count bytes at `$6E50,$6E52,…,$6E82` into the low byte; it is not a random predicate. These are static source facts; the retained `fire` allocation is not an execution witness for either conditional script or a natural hit/kill.

The observer closes both entry graphs, including calls, both conditional successors and direct timed targets, directly from the pinned source. Script `$12`, entry`$757A5`, has 15 sites including its timed continuation, poll adjustment and shared Close. Script `$81`, entry`$761EC`, has 66 sites including campaign flags, availability5/6 changes and **model-swap-B**. Neither graph contains an object-bit operation. Raw decoded records remain ignored; the tracked ledger publishes operation classes, entry-word/source-span hashes and counts, without dialogue or instruction listings.

Script `$81` reaches the same `$75F0A` departure/campaign family already identified by ORE's response. Thus excluding ordinary ORE127 acquisition would **not alone** exclude those political/model futures after native EAGLE hit/kill exposure. Return this concrete dependency to R3's reviewed world/effect set. Native firing also exposes script `$12` during candidacy; default on-foot/passenger proofs cannot silently cover it. The static graph's absence of object-bit writes narrows those two scripts, but resumed callers, additional admitted scripts and newly reachable detector149 acquisition still require their own closure.

## Field-level reconstruction and remaining scope

Retain R2's independent [field-level future/first-reader contract](mercenary-iii-object-interaction-r2.md#future-snapshot-and-first-reader-contract). The scheduler controls add an executed negative-continuation cut: restoration must preserve its signed state, queue, availability and VM/Return owners so the first scheduler reader performs cleanup and the next frame launches. Reconstructing a panel must not collapse that state into an immediate queued launch or re-acquire the object.

For native contexts, retain raw object predicates independently of card/head/occupancy, the current craft/service owners, actual gauges and warning state, B-programme/driver phase and relevant random cursor. Original addresses identify evidence widths; a future implementation needs admitted Title-local content references, not machine pointers. Repaint the retained outputs without calling Take, Drop, Open, Read, the launcher or any sound trigger. [ADR 0073](../adr/0073-drop-pre-release-prototype-save-migration.md) governs transactional browser Save/Resume admission; these observers select no codec or schema.

This closes the stated object-specific scheduler controls and the inherited R2 owners at the retained native cuts. **Final #771 admission closure still waits for R3's reviewed writer/reader and world set.** BLUE174/locator40, ordinary remote pickups, newly reached objects after manual Body arrival, actual hit/kill/hostile/script futures, and required native ACME/letter interaction contexts remain explicitly unexecuted or scope gates. CHILD BCD clamps, ORE alternate branches, availability/queue permutations beyond these fixtures, physical IKBD, audible output, independently reconstructed raster and browser Save/Resume equivalence retain their earlier boundaries. No static graph or finite capture set substitutes for a reviewed exclusion.

## Reproduction

From the repository root after worktree setup links Restricted Material:

```sh
python3 research/mercenary-iii-st/scripts/object-interaction-r2-scheduler.py
PYTHONPATH=research/mercenary-iii-st python3 research/mercenary-iii-st/scripts/object-interaction-r2-native-owners.py
python3 research/mercenary-iii-st/scripts/object-interaction-r2-effects-audit.py
PYTHONPATH=research/mercenary-iii-st python3 research/mercenary-iii-st/scripts/object-interaction-r2-owners.py
```

Defaults assert regenerated numeric output against the committed ledgers without writing evidence. `--write` updates only the corresponding numeric ledger after assertions pass. The native audit resolves the main-checkout evidence root before using R4's manifest paths, so its exact-ledger comparison works from a linked worktree.

To regenerate the new synthetic original-engine families, preserve the cited artifacts first, then run:

```sh
PYTHONPATH=research/mercenary-iii-st python3 restricted/mercenary-iii-771/effects-matrix/controls.py
```

This runs 36 families with their retained event/capture lists and the unchanged R1 harness. The helper SHA-256 is `5294e938ae6fbb62fcdf3e04a9be7e11e52c930af0a61701f9dee653c1d3b406`; R1 harness SHA-256 is `2d4597d6572d84c0e3f26236f131fecb866c64ef31c8d4d71038190be7cf4069`. The harness rechecks the baseline STX, EmuTOS and Hatari hashes and retains generated debugger scripts, commands and elapsed times. Sound is off; wait instrumentation and every seed/capture/log pin are explicit in the ledgers. The earlier eighteen-family helper and accepted runs are preserved unchanged.

Validation: both new ledgers regenerate exactly, the earlier effect/acquired-owner audits pass, and independent source/code review found no remaining blockers. `cd web && bun run check` passes type, research-type, lint, formatting and documentation checks, **2,690 application tests / 2,603,871 assertions** and **14 tooling tests / 52 assertions**, with zero failures. The Conventional Commit/changelog check passes with a research-only title. Application regressions validate the unchanged browser; they do not certify research fixtures as browser interactions or Save comparisons.
