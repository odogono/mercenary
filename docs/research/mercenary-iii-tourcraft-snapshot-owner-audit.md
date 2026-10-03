# Mercenary III TOURCRAFT: snapshot owner audit

Research for [#737](https://github.com/odogono/mercenary/issues/737), 2026-10-03. This independent audit checks claims against their primary owners. Its scope is the coherent New Game seed, pool/trajectory representation, Body phases, pilot/sign/articulation, logical sound and the phase/view/VM adapters. The [expanded persistence contract](mercenary-iii-tourcraft-persistence.md), [state inventory](mercenary-iii-tourcraft-state-inventory.md) and [accepted face reconstruction](mercenary-iii-tourcraft-face-rebuild.md) own the surrounding requirements. Original code, RAM, machine states and trace logs remain Restricted Material under [ADR 0002](../adr/0002-separate-rom-research-from-implementation.md).

The audit does not construct a Gameplay Session or implement a Save codec. Exact source observations establish initial values and writer dependencies. Original-machine checkpoint restoration is a separate continuity control; preserving a whole machine does not prove a portable snapshot complete or a retained owner safe to omit.

## Capture and executed checks

Every seed below comes from the same R7 first-loop-top gameplay capture, `restricted/mercenary-iii-708/presentation/exact2/start.ram`, SHA-256 `71b957b3b7124959b01bd40b896c921d37902c18cfca042bef1906b155ef0170`. The [baseline](../../research/mercenary-iii-st/config/baseline.json) pins the programme, EmuTOS and Hatari. The [own-title observer](../../research/mercenary-iii-st/m3lab/snapshot_owners.py) records raw numeric owners, with source range hashes in the [seed ledger](../../research/mercenary-iii-st/tourcraft-snapshot-owner-seeds.json). It refuses another capture when requested to produce New Game evidence. Reading progressed captures does not invoke any original writer.

Executed here: the opening digest, primary Capstone 5.0.7 M68K/68000/big-endian inspection of pool integration `$51062..$510EA`, clearing `$511A8..$511CE`, passive programme/trajectory `$52030..$52446`, increments `$52554..$5258E`, pilot `$518AC..$518F0`, sound dispatch/walkers and VM call/return; numeric extraction of all fourteen pool slots; all 32 initial phases; 480 phase comparisons across the fifteen natural R7 `v*.ram` observations; twelve synthetic observer/trajectory-adapter tests; and two original cold boots with PSG write tracing. The disassembly and boot recipes remain under `restricted/mercenary-iii-737/`.

Eleven passing synthetic controls check retained inactive coordinates, raw byte/word/long widths, the final pool and Body entries, wrong seed refusal, next-unread trajectory positions, invalid cross-path/misaligned pointers, modular core words, sampled-pose separation and ordered return-stack admission. They establish the research reader's boundaries, not an expanded codec.

Reproduction from the repository root:

```sh
PYTHONPATH=research/mercenary-iii-st python3 -m m3lab.snapshot_owners \
  restricted/mercenary-iii-708/presentation/exact2/start.ram --opening \
  --out research/mercenary-iii-st/tourcraft-snapshot-owner-seeds.json
PYTHONPATH=research/mercenary-iii-st:research/mercenary-iii-st/tests \
  python3 -m unittest test_snapshot_owners
```

## Pool fields and coherent seeds

For each slot `s` in **50–63**, original array indexing uses `o = 4*s`. Preserve the following owners as raw unsigned integers with their stated widths; signed comparison is applied by the original reader. [Independent field map](../../research/mercenary-iii-st/m3lab/snapshot_owners.py), [numeric provenance](../../research/mercenary-iii-st/tourcraft-snapshot-owner-seeds.json), [original resident decoder](../../research/mercenary-iii-st/m3lab/world.py)

| Owner | Original location | JSON representation and meaning |
| --- | --- | --- |
| Pool state | `$5492+o` | u16 `0..65535`; zero inactive, `$7FFF` stable, negative trajectory countdown, positive departure/lifetime countdown. The integrator decrements the entire word, not its low byte. |
| X/Y/Z increments | `$54CA+o`, `$5502+o`, `$553A+o` | Three u32 `0..4294967295`, interpreted as signed longs for movement; retain exact carry/wrap bits. |
| X/Y/Z positions | `$581C+o`, `$5C1C+o`, `$601C+o` | Three u32; these are resident positions shared with world ownership, not a second independently mutable copy. |
| Residence | `$681C+o..$681F+o` | Four u8: Body offset, association, Floor, cell. Body offset uses the original multiples-of-four identity and VOID/unplaced conventions. |
| Object metadata | `$641C+o..$641F+o` | Four u8: flags, group, object state and zone. Pool clearing touches selected fields; it does not reset this entire record. |
| Yaw | `$6C1C+o` | u8; resident orientation. |
| Model binding | model table selected by `$4BD10`, entry `2*s` | A validated admitted Geometry Identity in a portable snapshot. Original u16 table words are research provenance, not portable addresses. Passive selection replaces entries 56–58 together with model 320. |

The opening has **all fourteen state words and all 42 increments zero**. Positions and metadata are not all zero. The exact following values are u32 source bits; original signed interpretations are preserved rather than converted to panel coordinates. [Executed seeds](../../research/mercenary-iii-st/tourcraft-snapshot-owner-seeds.json)

| Slot | X | Y | Z | Body/association/Floor/cell |
| --- | --- | --- | --- | --- |
| 50 | 131408878 | 6810 | 213606786 | 0/0/0/0 |
| 51 | 251627159 | 2588 | 54096086 | 0/0/0/0 |
| 52 | 0 | 0 | 0 | 0/0/0/0 |
| 53 | 251685130 | 1506759 | 53005079 | 0/0/0/0 |
| 54 | 251635263 | 4289 | 54239615 | 0/0/0/0 |
| 55 | 251632353 | 6022 | 54236700 | 0/0/0/0 |
| 56 | 55983510 | 33377200 | 262694723 | 0/0/0/0 |
| 57 | 55999473 | 33349192 | 262717331 | 0/0/0/0 |
| 58 | 56346539 | 32594871 | 355584519 | 0/0/0/0 |
| 59 | 0 | 0 | 0 | 0/0/0/0 |
| 60 | 17335188 | 150 | 50890193 | 32/5/1/136 |
| 61 | 213484306 | 0 | 86279694 | 16/1/0/37 |
| 62 | 71205263 | 0 | 20612642 | 56/1/0/115 |
| 63 | 201753088 | 0 | 33982322 | 44/1/0/102 |

The integrator starts at slot 63 and descends through 50. State zero and stable `$7FFF` skip integration. Other states decrement before integration; when the result is zero it clears residence and state, then refreshes the resident list. The Y boundary may invert the Y increment and set Y to 201 in the relevant nonspace mode. Passive spawn sets a negative state with its byte count; decrementing `$8000` yields stable `$7FFF`. Expiry changes a stable actor to 200 and writes X increment `$800`, preserving its other progressed increments. No request-only constructor retains that future. [Independent primary inspection; campaign ownership](mercenary-iii-tourcraft-campaign.md#passive-encounter-programme-and-phase-ownership)

The Body-entry clearing routine clears state and residence for **56–59**, plus their group byte, without clearing all positions/increments. It is distinct from the general 50–63 integration loop. Treating the complete pool as four zeroed OBSERVER records loses both shared world fields and stale fields that remain conservative serialized owners until an omission control proves them irrelevant. Admitted nonfiring inputs keep shot states 50–55 inactive; this restricts reachability, not the numeric seed values. Slots 60–63 have ordinary resident placements even when their pool states are inactive. [Pool/clear primary ranges above; admitted closure](mercenary-iii-tourcraft-campaign.md#passive-encounter-programme-and-phase-ownership)

## Trajectory and programme adapters

The three mutable next-record pointers are the longs `$523A2/$523A8/$523AE`; their containing six-byte list records at `$523A0/$523A6/$523AC` begin with resident offsets `$E0/$E4/$E8`. Opening pointers are `$522BC/$522E2/$52308`. Immutable paths each have four eight-byte records, followed by a zero-X loop marker and immutable long target. Each selected pass reads the next record, advances the pointer, derives increments, and stores the pointer back into the list. [Original `$520A2..$520B4` and `$5227C..$522B8`; own trajectory definitions](../../research/mercenary-iii-st/m3lab/tourcraft_export.py)

A portable reference can therefore retain `{slot:56|57|58, path:0|1|2, nextRecord:0..4}`. Each slot admits only its corresponding path. Values 0–3 name its next record; value 4 names the loop marker. Restore translates that identity into an immutable reader position without reading/advancing it. The [independent adapter](../../research/mercenary-iii-st/m3lab/snapshot_owners.py) refuses other slots, pointers on the wrong path and nonrecord offsets. The saved state word retains the independently progressing count; the cursor alone does not determine whether an actor is inactive, stable, in motion or departing.

Programme request is a u16 with signed interpretation; its opening is zero. The timer is u16 zero, cursor `$6E50`, and budget u16 **5**. Preserve the mutable paired-byte region `$6E50..$6E86`, with opening count/request 3/1 in the first pair and 4/1 at `$6E74`. Negative initialization selects a pair and writes only the budget word's low byte. It does not unconditionally clear its high byte or live paths. This supports a validated programme identity plus paired index/offset, mutable count bytes and independent budget/timer; it does not support reconstructing them from current request. [Executed ledger](../../research/mercenary-iii-st/tourcraft-snapshot-owner-seeds.json), [initializer and campaign](mercenary-iii-tourcraft-campaign.md#passive-encounter-programme-and-phase-ownership)

## Body phases, pilot and animation

All **32** phase longs are u32. Their only admitted rate configuration is the own-title immutable 32-long rate array; the final unnamed rate is zero. New Game reads the exact ledger values, including METIS index 15 = **27376**. All phases equal `29*rate mod 2^32` at this source boundary. The independently rerun 480 comparisons also match `capturedLogicalTick*rate mod 2^32` across fifteen R7 natural observations. This bounded relationship checks those observations; direct expanded restoration still saves every progressed phase and pause/rate owner. The earlier prototype's METIS phase39648 is a different capture and is not this New Game. [Own phase writer and earlier audit](mercenary-iii-tourcraft-early-owner-audit.md#clock-and-all-32-body-phases), [seed values](../../research/mercenary-iii-st/tourcraft-snapshot-owner-seeds.json)

Pilot pending selector `$6FF4A` is u16, countdown **word** `$6EA2` is u16 whose high byte at the base address is decremented by the writer, profile `$6EA4` is a word toggle, and cursor `$6EA6` is a next-unread-duration reference. The opening is zero for all four. Preserve the complete countdown word because loading and decrementing use byte operations, while the initial active guard reads the word. An active normalized cursor must identify an admitted immutable head sequence and the next byte position; it cannot name the just-consumed duration. Termination clears profile and count but may leave the prior cursor. Restore must retain that inactive/stale distinction conservatively or provide a reader/omission proof. [Primary `$518AC..$518F0`; sequence extraction](../../research/mercenary-iii-st/m3lab/service.py), [flight sequences/head choice](mercenary-iii-tourcraft-presentation.md#cabin-pilot-lettering-and-panel)

The inherited sign has opening output word8192 (space+NUL) and cursor0. Serialize its glyph code32 and index0 separately: a wrapped cursor0 produces script glyph64. Restore its cell-bound identity from the saved world binding without advancing it. The faces also begin blank with four zero cursors, but use the accepted independent `faceSelection:'initial'` tag; they derive output words under the [#736 atomic writer contract](mercenary-iii-tourcraft-face-rebuild.md#accepted-serialized-field-and-writer-contract).

The articulation tick angle `$6F36` is u16 **7424**, sampled frame angle `$6F38` is u16 **0**, and rate `$6FD4` is u16 **256**. `$53122` advances the former; `$5A466` copies it to the latter. Their opening inequality is a direct counterexample to using current tick angle for saved sampled presentation. Preserve both under phase ownership. The separate wheel angle `$6E96` is zero, but an excluded wheel model does not become admitted because a numeric zero validates. Per-slot blink offsets are immutable reader content; frame word controls the phase. [Original articulation ownership](dion-object-geometry.md#turns-and-articulation), [executed seeds](../../research/mercenary-iii-st/tourcraft-snapshot-owner-seeds.json)

## Logical sound seed and progression

The same coherent RAM has B/C vectors both idle `$5317C`, priority `$7110` zero, mixer `$72A0` **254**, C level latch `$72A8` zero, slew `$4C480` **3840**, and raw speed `$700A` **4278194176** (`$FF001000`). These differ from the old browser's fresh sound values mixer218/slew3584; those old defaults are not evidence for this opening. Word tone count/pointer `$4BF1E/$4BF20`, byte door-level count/pointer `$4BF25/$4BF26`, byte C-level count/pointer `$4BF2B/$4BF2C` and collision-tone cursor `$7C8C` are all zero. [Seed ledger](../../research/mercenary-iii-st/tourcraft-snapshot-owner-seeds.json), [own sound decoder](../../research/mercenary-iii-st/m3lab/sound.py), [existing browser sound](../../web/src/dion/sound.ts)

RAM does not contain the complete PSG register image. An executed cold-boot `psg_write` trace caught the **first** `$5A41A` at physical VBL4764, logical tick29/frame1. Its whole-RAM digest is `2ad532c4304f02b780a23ff1dab711279b9245c71468557f2c0b252668ff90fe`; the entire `$04BBC..$7FEDA` gameplay range is byte-identical to the pinned R7 opening, digest `e5bd1352404f48b8d353aafb0f2b3b3f4e054e5dffbe3c23eebf7776bbd509c5`. All observed owner groups match. The 155 differing bytes are outside that stated range, in OS and machine workspace; no total-RAM identity is claimed. [Sound seed evidence](../../research/mercenary-iii-st/tourcraft-snapshot-sound-seed.json)

The trace contains one cold PSG reset,152 data writes and no shape-register write before that boundary. Last writes yield registers0..12 `[1,0,1,0,1,0,31,254,0,0,0,0,0]`. Register13 is zero from the observed cold reset: Hatari 2.6.1's `PSG_Reset` clears its registers and initializes the sound module to zero. Thus the coherent logical sound seed is fourteen bytes `[1,0,1,0,1,0,31,254,0,0,0,0,0,0]`. This use of pinned emulator reset semantics supplies the otherwise unwritten register; it does not derive a sound register from unrelated RAM. [Hatari 2.6.1 primary reset/write implementation](https://raw.githubusercontent.com/hatari/hatari/v2.6.1/src/psg.c), [executed trace digest and numeric seed](../../research/mercenary-iii-st/tourcraft-snapshot-sound-seed.json)

Raw traces and the first-top machine checkpoint remain `restricted/mercenary-iii-737/first-sound-runs/coherent-first-sound-le98_l9w/trace.log` and `first-sound.sav`. The trace SHA-256 is `b431e7f5c6dfc0e85439a1c7074c97b47d8fa951c314cfc3aefd96b18e324675`. The earlier arm-at4770 experiment caught a later top at tick55/frame3; it is not substituted for the coherent opening.

A portable sound owner needs validated B/C logical routine identity, including pending entry versus running walker; count/cursor per stream with correct byte/word widths; priority, mixer, registers, slew, C latch and relevant speed input. B key click becomes idle on its trigger tick but writes register13; those same-value writes remain ordered events. C cuts write silence without necessarily clearing a running vector. Dispatch order is B, C, then message A. A continuation comes from the retained message machine, rather than an independently reset sound age. [Original dispatch/walkers](../../research/mercenary-iii-st/m3lab/sound.py), [sound trigger closure](mercenary-iii-tourcraft-presentation.md#sound-programmes-and-triggers)

Idle does not imply every retained stream count/pointer is zero after play. Restore progressed owners directly; logical references must preserve next-unread pairs and loop/end boundaries. Current programme plus elapsed time is a possible alternate representation only after an independent ordered-event reconstruction control proves it sufficient. This audit supplies no such omission proof. Audio nodes are rebuildable resources; pending logical events need a specified delivery-boundary policy. The declared register-stream observable excludes synthesis waveform phase; a waveform-continuity promise would require additional oscillator/noise/envelope owners. [Sound/presentation inventory](mercenary-iii-tourcraft-state-inventory.md#mutable-owners-to-serialize)

## Phase, view and VM boundaries

Opening phase evidence is original logical tick29/frameword1, mailbox byte255 (empty sentinel), live stick0, four script-readable key bytes0 and admission countdown0. This opening is **before the first face writer**, despite a nonzero original frame word. Whole-session face-initial validation must count completed face-writer invocations or encode its equivalent accepted scheduler phase; requiring frameword0 would reject the coherent seed, while cursor0 alone admits wraps. Saved prior candidate, consumed/unconsumed mailbox ownership and frame/subpass must survive restore independently of current Pose. [Executed phase seeds](../../research/mercenary-iii-st/tourcraft-snapshot-owner-seeds.json), [face contract](mercenary-iii-tourcraft-face-rebuild.md#accepted-serialized-field-and-writer-contract), [accepted scheduling](mercenary-iii-tourcraft-followup.md#accepted-timing-clarification-and-confirmation-probe)

Opening copied view has u32 eye `[165773321,63,70289576]`, u16 roll/pitch/yaw `[0,511,1024]`, longitude/latitude `[632,524]`, and cabin offset0. Numeric coordinates, cached coordinates and sampled view have distinct writers; geometry identity or panel position does not reconstruct all three. Retain these owners until a first-frame/future reconstruction control covers surface, space, Body entry, cabin turn and Leave. [Own view seed/extraction](../../research/mercenary-iii-st/m3lab/tourcraft_export.py), [sample/exit ownership](mercenary-iii-tourcraft-reuse.md#differences-that-affect-the-selected-flight)

The original VM return pointer is long `$56D6`, with its low word `$56D8` written after push/pop. Opening pointer is `$56D2`, whose retained return long is **`$000766D5`**; `$56CE` holds `$FFFFFFFF`. Opening PC is `$6FF57`; flag longs are `$8040/0`. Preserve the ordered live stack as validated programme references, not CPU stack data. Calls/launches push the current PC; returns pop it. Before mapping a boot continuation to a semantic null, check its actual reader and future overwrite/return closure. These directly inspected values must not be replaced with guessed idle `$6FF54`. [Primary `$52B54..$52B72` and `$55A62..$55A74`; VM extraction](../../research/mercenary-iii-st/m3lab/scripts.py), [coherent seed ledger](../../research/mercenary-iii-st/tourcraft-snapshot-owner-seeds.json)

## Restore controls and limits

The surviving original-machine harness is `restricted/mercenary-iii-707/lab.py`. The old R8 `restricted/mercenary-iii-709/restore_probe.py` imports a lost follow-up copy, but its checkpoint states, logs and `results.json` remain. It controls pre-B, pending Start, launch, space, Body entry, descent, exit and on-foot futures through frame1528, with first full-RAM and later suffix equality. Its original trace ranges did **not** include the full actor/phase/face arrays; that successful whole-machine control cannot be relabelled a field-complete portable comparison. [R8 control classification](mercenary-iii-tourcraft-persistence.md)

The new observer exports `TRACE_RANGES` for the entire pool state/increment arrays, all14 position/residence/metadata/yaw records, mutable passive pointers, all32 phases, pilot/sign/faces and logical sound. First and later owner comparisons must pair these with ordered PSG writes, sampled frame/panel, message occurrences, input/admission and VM effects. The main #737 work extends the original controls using those ranges. Its own executed evidence states which restored futures were compared; this audit does not claim to have run those controls.

Remaining portable acceptance is explicit: all33 taxi checkpoints plus later admission/refusal and every TOURCRAFT boundary require the same complete expanded-session observer, an isolated direct restoration, nonadvancing face/workspace reconstruction before the first reader, then complete first-frame/owner/ordered-future comparison against uninterrupted expanded play. Original checkpoint continuity, independently checked seeds and decoder tests do not close that separate implementation proof. Uncertain mutable owners stay serialized. [Expanded persistence acceptance](mercenary-iii-tourcraft-persistence.md), [inventory comparison requirements](mercenary-iii-tourcraft-state-inventory.md#remaining-proof-boundaries)

The final independent review also found a separate first-sky-reader owner: clip rows at `$42C74`, read by stars `$50AD2/$50BF8/$50CB2` and comet `$5025A`. It is not sky-height word `$7298`. Surface writers `$54026/$54030` select68/136 from occupancy `$713E` and signed land `$6F56`; space `$53D32` writes136. The observer and field contract conservatively retain all three as raw words, with coherent opening clip136/occupancy63/land0, rather than assuming the current pose can reproduce them. Their additional regression preserves clipped136 and land `$FFFF` independently.
