# Mercenary III: R1 selection and boundary follow-up

The #756 research ledgers, scripts and tests this report cites were removed when the programme was rescoped ([#756](https://github.com/odogono/mercenary/issues/756)). They remain in git history at `ab0d6ddf`.

Executed follow-up for [R1/#770](https://github.com/odogono/mercenary/issues/770), 2026-10-04, extending the [first handoff](mercenary-iii-object-interaction-r1.md). **R1 remains open.** These controls add original execution for stale selection, clipping, native distance rounding, competing handling/capacity gates and BRIEFCASE boundary continuations. They accept no bounded exclusion and change no runtime, playable scope, Data Payload or Golden Trace.

The [acceptance audit](mercenary-iii-object-interaction-r1-audit.md) records what the preceding handoff established and compares current Damocles functions. The [numeric follow-up ledger](../../research/mercenary-iii-st/object-interaction-r1-followup.json) pins this run's source, selected family manifests, logs and capture hashes. Original RAM, snapshots, debugger scripts and projection buffers remain in the main checkout's ignored `restricted/mercenary-iii-770/followup/`, under [ADR 0002](../adr/0002-separate-rom-research-from-implementation.md).

## Method and executed assertions

All new controls restore the accepted route32 `f140` cut: frame 141, following the ordinary New Game prefix documented in the [opening route](mercenary-iii-object-interaction-r1.md#opening-route-and-cpu-control). This is a retained natural-route seed; **every follow-up scene/action setup is synthetic**. They reuse the pinned original STX, TOS, Hatari 2.6.1 and masked-frame/eleven-original-tick instrumentation. They run at 32 MHz; the prior route's 16/32 MHz comparison does not imply a CPU comparison of these new fixtures. Key inputs write original latch `$56726`, not physical keyboard/IKBD.

`followup_probe.py` injects scene lists/positions at original queue-builder entry `$54178` for frame 142. It traces the original distance builder, candidate writer `$545D6`, and model vertex-loop end `$54952`; it sends Take at top143. It does not inject the selected key in these candidate controls, except the initial stale-key seed for the empty controls. Other fixtures inject declared handler owners and then use ordinary key dispatch. `support-repick` explicitly injects the re-take selection/key at frame 162; the three BRIEFCASE re-takes do not.

`followup_verify.py` reads original RAM and logs without simulating the handlers. **31 retained families pass 260 explicit pin/outcome assertions**, with **247 eleven-tick gaps, 1,011 sampled in-frame tick checks and 764 masked-register checks**. One family, `empty-stale-controlled`, remains inconclusive for its intended empty-scene premise; its pin/cadence checks are included, not an assertion of emptiness. The accepted empty witness is `empty-queue-controlled`. Counts include both isolated BRIEFCASE Drops and longer continuations, not 31 independent natural routes.

The complete 31-family reproduction command was also rerun. All 113 new 1 MiB RAM captures matched the preceding capture hashes; the re-read pin/outcome and cadence assertions still passed. Manifest/log hashes change with fresh ignored run paths. The comparison summary is retained as ignored `followup/reproduction-verification.json`; this is finite reproduction evidence, not universal machine or browser equivalence.

The new verifier also checks all twenty prior `staging-twenty/f5` entries' full Residence and held bits, beyond the prior XYZ/group checks. The first ten have Residence `[120,1,index,16]`; the next ten have `[120,1,index-10,32]`. KEY A38 retains its held bit and original `[32,1,0,49]` Residence outside the stack. Zone preservation, arbitrary stack sizes and every presentation effect are not exhaustively asserted.

## Selection, clipping and native keys

| Synthetic control | Original selection/action observation | Interpretation and limit |
| --- | --- | --- |
| Empty queue after stale181 | Original reset leaves `$71DA=$7FFF1777`, `$71DE=4*181`; no candidate writer occurs in frames 142/143. Next Take consumes that key and refuses; stack remains `[104,103,135]`. | The reset changes the high word, not the stale offset or mantissa. A stale offset alone cannot authorize Take. This is an injected empty draw queue, not proof of a naturally empty location. |
| KEY181 behind eye | Selected key `$0812BE`; all 18 projected vertices have original flag `$80`; Take acquires181. | The candidate writer runs before model projection/clipping. Fully behind-eye geometry does not cancel this semantic selection. No pointer policy or foreground-occlusion rule follows. |
| Same KEY181 in front | Same key `$0812BE`; all 18 projected flags are zero; Take acquires181. | Original projection provides the visible control for the behind-eye premise. This is numeric/clip evidence, not a raster comparison. |
| KEY181 to the side | Same key `$0812BE`; all 18 flags are `$80`; Take acquires181. | Fully rejected model vertices still leave the selected candidate. This does not establish every partial-clipping configuration. |
| Slot74 alone / closer than181 | Original writer visits74 but never retains it at the action. With closer74 plus181, Take acquires181. | Executes the slot74 exclusion with a competing eligible candidate. “Alone” means the injected surface list; other scene candidates remain accounted for in the trace. |
| Horizontal/diagonal offsets361,361, equal eye Y | Key `$081FE8`; Take accepts181. | Native builder result; no floating-point distance substitution. |
| Offsets362,362 | Key `$081FFE`; Take accepts181. | Its Euclidean length is approximately511.945, below512. The exploratory family name `take-diagonal-outside` is a mistaken setup expectation, not a refused outcome; this case alone does not distinguish a raw cutoff. |
| Offsets363,363 | Key `$09100C`; Take refuses181. | Executes the other side of this particular native rounding transition. No universal rounding sweep is claimed. |
| Offsets511,32 | Key `$081FFE`; Take accepts181. | Squared Euclidean distance is262,145: just above512². This executes a disagreement with a raw distance-below512 gate. |
| Offsets511,33 | Key `$091000`; Take refuses181. | Squared Euclidean distance is262,210. This is the refused side of the new near-boundary control. |

The original projection buffer is read at the end of the 18-vertex loop, before another model overwrites it. The behind/front/side flags are asserted at both traced ends. The vertex count comes from the actual loop pointer, rather than from a guessed object footprint. Raw buffers remain ignored; the ledger publishes only interpreted flag counts and hashes.

The first empty-list attempt still reached NULL10 and COBWEB124. Clearing the surface candidate list did not remove every selection source. The corrected control instead sets the draw-queue terminator at `$4AF0` and count `$71E8` immediately before original sort/traversal `$5430E` in frames 142/143. The original reset and refused next Take still execute, but this extra injection bounds the claim to **empty-queue consumption**, not natural candidate membership. On the following uninjected frame, ordinary scene work selects COBWEB124 again.

Sources: the named family manifests/captures and original `hatari.log` files, selected by the follow-up ledger; original reset/builder/writer `$54178..$54352`, `$545D6..$545F0`, vertex reader `$54710..$54952` and projection flag writer `$57CAE..$57CBA`. The [earlier selection evidence](mercenary-iii-object-interaction-evidence.md#selection-and-reach-direct-dion-evidence) supplies the static interpretation, separately from these executed observations.

## Handling, capacity and continuation

| Synthetic fixture | Executed result |
| --- | --- |
| Both handling bits4/5 on181 | Refuses silently with unchanged stack; holding POWERGLOVE157 still refuses silently. |
| Heavy67 plus count10/capacity10 | Refuses with exactly one traced string request2. Holding157 bypasses the heavy refusal, then full capacity refuses without a string request. |
| Fixed13 plus count10/capacity10 | Refuses without a string request. Together with the double-bit control, this supports bit4 preceding bit5 and heavy refusal preceding full capacity. |
| Injected count21/capacity20 | Takes181 to count22; capacity remains20 and gauge target becomes22. Like prior count11/capacity10, this exercises equality rather than `>=`; it proves no natural over-capacity route. |
| VOID Take/Drop and negative-scroll Drop | Preserve the injected ordered stack and issue no traced refusal string. These are handler-state controls, not ordinary VOID travel. |
| Empty reverse rotation; one-entry rotations with positive/negative scroll | Preserve ordered identities. Existing scroll progression continues; these observations alone do not prove that the whole action is inert or certify panel/sound effects. |
| Supported TAXICARD Drop then re-take | Drop yields state `$08`, topY38, Residence `[60,3,1,96]`, group3, zone4; these owners remain unchanged through frame 161. Injected selection at frame 162 permits re-take; it returns to head/staging Residence `[120,1,0,16]`. This is no natural support/re-pick route. |

Refusal assertions compare the specified stack, requested string and selected handling state, not every future-affecting owner or all frame writes. Normal staging and scroll progression can continue after a refused input; full transactional/refusal and ordered presentation closure remain separate gates.

### BRIEFCASE signed count and boundary re-takes

The injected head is108 with capacity20. Direct Drops run through original contact placement, leaving the briefcase with Residence `[60,0,0,98]`, held bit cleared. At a later settled top, the original builder selects the dropped108 with key `$051F7E`; the follow-up sends Take without injecting selection, store state, Residence or pose again.

| Initial stack count | After Drop: carried / signed store count / capacity / gauge | After original re-take |
| ---: | --- | --- |
| 1 | `0 / -9 / 10 / 0` | Original one-entry order restored, capacity20, gauge1; store count remains−9. |
| 10 | `9 / 0 / 10 / 18` | Original ten-entry order restored, capacity20, gauge10; store count remains0. |
| 11 | `9 / 1 / 10 / 18` | Original eleven-entry order restored, capacity20, gauge11; store count remains1. |

The count1 Drop produces raw word `$FFF7` at `$563A`, interpreted as signed−9. The original Take's positive-count gate ignores it. Treating that word as65,527 valid stored entries would misread the source. The initial observer's unsigned `storeCount` display is insufficient for these low-count states; the new ledger deliberately records `storedCountSigned`. Array tails are not evidence of live stored entries when the signed count is nonpositive.

At count11, Drop requests string1 and commits in the same action; the count10 control has no such warning. The count1 control additionally reaches string request6, whose full presentation/context future is not closed here. The previously executed fifteen-entry cycle remains the larger overflow witness. These continuations prove the stated mechanical boundaries, not ordinary BRIEFCASE availability or all competing-script futures.

Sources: ignored `followup_probe.py`, `followup_verify.py`, named family manifests/logs/captures and the follow-up ledger. Original store/count writers/readers are `$553D8..$55402`, `$555C0..$555D4`, `$558CA..$5591E`; the original geometry reader yields the support top, as established in the [prior desk controls](mercenary-iii-object-interaction-r1.md#synthetic-rule-controls).

## Reuse and gates still open

The [current-function matrix](mercenary-iii-object-interaction-r1-audit.md#current-damocles-functions-and-consequential-reuse-boundary) keeps Title identities, policy, acquisition/placement order and effects local. The new `(511,32)` control provides a concrete failure of a raw `Math.hypot(...) < 512` replacement. BRIEFCASE's signed store owner, retained counts and immediate overflow Drop further prevent importing Damocles's derived-capacity/deferred-Drop protocol. Existing structural arithmetic reuse under [ADR 0074](../adr/0074-share-evidenced-craft-passes-with-title-owned-orchestration.md) is unchanged; no new consequential shared boundary is proposed.

The earlier read-only verifier still passes 55 families/265 assertions. A fresh numeric replay loads this checkout’s shared arithmetic with Dion tables and reproduces **22/22 selected keys**: 13 older variable-cadence observations plus nine new synthetic accepted-cadence captures, including the diagonal rounding controls. The ignored `followup_distance.ts` pins each RAM input and records the computed/stored key; it does not select candidates or execute actions. The new controls do not silently upgrade those older variable-cadence captures into accepted-cadence routes.

The subsequent [placement-owner follow-up](mercenary-iii-object-interaction-r1-placement.md) executes synthetic support re-pick without another selection injection and retains placement zone through direct re-pick. Those observations qualify the support/metadata gaps below; ordinary support access and full effect transactions remain open. The [original Save/Load operand report](mercenary-iii-object-interaction-r1-operand.md) adds a finite restored reader witness and identifies the imported executable-prefix boundary; it does not establish a general writer exclusion.

R1 still needs the exact first-delivery set and reviewed exclusions from [R3/#772](https://github.com/odogono/mercenary/issues/772), and coordination with [R2/#771](https://github.com/odogono/mercenary/issues/771). Specifically unresolved:

- Natural empty-list membership, foreground occlusion, partial clipping and additional needed priority/order/rounding cases.
- The possible original-game restore-time writer and meaning of Take's long-form operand at `$553A4`. A literal search for `$553A4/$553A6/$553A8` addresses in the retained 1 MiB image found no occurrences; this does not exclude indirect writers or prove original Save/Load behavior. Emulator snapshot restoration is a different operation.
- Ordinary supported/interior/other-Body placement and EAGLE-key routes; complete placement/refusal transactions and all relevant geometry-reader forms.
- Relevant aboard/offer/trading, further BRIEFCASE/context futures, and R2 head/card/description/message/sound/script closure. A traced string index is not a complete presentation witness.

No bounded exclusion has been accepted. These unresolved gates keep #770 open; this research is not browser or Save equivalence and commissions no implementation child.

## Reproduction and pins

From the repository root, with the main checkout's retained evidence and pinned media linked by worktree setup:

```sh
# Read-only checks of the old and new selected original outputs.
PYTHONPATH=research/mercenary-iii-st python3 restricted/mercenary-iii-770/reuse/verify-handoff.py
bun restricted/mercenary-iii-770/followup_distance.ts
PYTHONPATH=research/mercenary-iii-st python3 restricted/mercenary-iii-770/followup_verify.py

# Execute new synthetic controls; this replaces the selected follow-up manifests.
PYTHONPATH=research/mercenary-iii-st python3 restricted/mercenary-iii-770/followup_probe.py
bun restricted/mercenary-iii-770/followup_distance.ts
PYTHONPATH=research/mercenary-iii-st python3 restricted/mercenary-iii-770/followup_verify.py research/mercenary-iii-st/object-interaction-r1-followup.json
```

The last command exports independently interpreted numeric observations and hashes, not original programme bytes or raw projection/RAM buffers. A fresh run creates new ignored run paths and manifest/log hashes; compare asserted outcomes rather than expecting those path-bearing artifacts to have the old hashes. The pinned environment and scheduling identities are in the [prior pins](mercenary-iii-object-interaction-r1.md#pins-and-reproduction) and [baseline](../../research/mercenary-iii-st/config/baseline.json).

| Follow-up source/tool | SHA-256 |
| --- | --- |
| Route32 `f140.ram` | `332934dbcd0f667d66d8959d3496859e9171757dc6228e4bf5b23b44bc6d64a5` |
| Route32 `f140.sav` | `97e1360769a96ef15aa3fbc4ee8774252acc04141569b3a9c45ecade5a4d5d76` |
| `followup_probe.py` | `7708d29fecd05e355229304b94a5e3295a8014ca520ec692ab90f37392faaa85` |
| `followup_verify.py` | `e2b0bec594f04ada08c52554a3fc1535ec35c5a0489bb2b57bb4446907106c75` |
| `followup_distance.ts` | `62d975165b72983d5e356f5f63852981e8025a08761169431921f7ead66869cd` |
| Take range `$55354..$55458` | `fd9e62379d54931ed6bc5b4078031fa497b128fc177c781dc69d35a3464db061` |

Repository validation: `cd web && bun run check` passed, including 2,690 application tests/2,603,871 assertions and 14 tooling tests/52 assertions. Final documentation links, tool pins, Restricted Material citations and `git diff --check` also passed.
