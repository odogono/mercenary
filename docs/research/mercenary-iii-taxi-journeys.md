# Mercenary III: METIS taxi journeys and passenger state

Research for [#615](https://github.com/odogono/mercenary/issues/615), 2026-09-29; R1 of the [integration report](mercenary-iii-integration.md). This extends that report's pinned **Mercenary III research baseline**, not Damocles **Working Authority**. No application, public API, Data Payload, Save format, `/dion` admission, glossary or architecture changes are proposed here. Original media, RAM, images and disassembly remain ignored Restricted Material under `restricted/mercenary-iii-615/` and `restricted/mercenary-iii-609/`, following [ADR 0002](../adr/0002-separate-rom-research-from-implementation.md).

## Outcome and scope

Both opening journeys reproduce through arrival and on-foot exit. The first taxi milestone remains a credible bounded proposal, with these refinements:

- Selecting either destination **does not start travel**. Both selections remain stationary for the additional 12,800 VBLs tested, while elapsed time advances.
- B opens a window of ten passenger-admission passes. Admission uses the current nearest resident and ordered guards; successful walking duration is not a distance rule.
- On this taxi, L requires service dwell state 2. The tested in-transit L is discarded, not queued: execution reaches its rejecting branch, and a separate run remains aboard after arrival without another L.
- Passenger position follows resident `$40` and its turns, although ordinary Mover discriminator/slot stay `$0001/$FFFF`. Passenger state cannot be represented by those ordinary craft fields alone.
- TAXICARD panel reveal, message display, narrative scripts, service updates, rendered frames and elapsed time are separate mechanisms. A message can be busy without preventing a call; an opening-panel input can be consumed without calling.
- Cash is unchanged across all 155 branch-probe captures. The decoded first-trip scripts describe sponsored/prepaid travel and do not mutate cash. This supports unchanged balance for these opening journeys, not a universal zero-fare service.

R2 still has to recover required content/presentation; R3 still has to demonstrate restore completeness. Neither is discharged by reproducible RAM captures. No finding invalidates the proposed pair of journeys. Exact near-boundary arrival/input ordering and complete presentation/script restoration remain prerequisites before implementation, rather than assumed compatibility.

## Baseline identity and evidence method

| Input | Pin |
|---|---|
| STX | 512,160 bytes; SHA-256 `4e8b74122910bcaa109b944eebb6f0ec18fdeb1175c34eea3c932d0e1b18b62c` |
| EmuTOS `emutos206.img` | 1,048,576 bytes; SHA-256 `154803e3ff4851f3dc358b91b16d6b6110d187a81d8132ecb665af49878939d5` |
| Hatari 2.6.1 Mach-O | 15,881,424 bytes; SHA-256 `05723606c75a1f0642395974abdce2cbbe48b0a09a747f65cdfca7ef9201e11a` |
| Configuration | Integration recipe: ST, 1 MiB, 68000/8 MHz, compatible/cycle-exact/24-bit, RGB/ws3, no FPU/blitter, no fast boot/FDC/Timer-D patch, write-protected A, no B/hard disks/VDI, sound off, SDL dummy, empty config |
| Inspection | Python 3.13; Capstone 5.0.7, M68K/68000/big-endian; targeted readers and writers, never translated into application code |

The local media lead `/Users/alex/work/mercenary/roms` was available and all three hashes verified before replay. A checkout alone does not supply these inputs. The [integration report's reproduction recipe](mercenary-iii-integration.md#cold-boot-and-controlled-probes) is the complete executable launch/input foundation; the modifications below recreate this investigation without any ignored helper being required.

**Natural-input traces** below inject scancodes into the recovered mailbox `$56726` and held forward into joystick copy `$7056`, consumed by the original input code. They do not patch service, money, pose, admission or program code. They are not physical keyboard timing tests. **Synthetic probes** explicitly change one field at a named instruction to corroborate a guard; they neither establish natural reachability nor stand in for a journey. Addresses are hexadecimal, values big-endian, ranges half-open. VBL numbers are absolute since reset.

There are two baseline differences to preserve: fresh captures show cash **51,009,000.00**, whereas the integration report recorded 51,004,000; initial elapsed seconds vary between 24 and 25 across these boots. The cause of the cash discrepancy is unresolved; no old capture was silently replaced and no state was forced to match it. The within-run balance and transition results are the claims here. Whole-RAM hashes identify artifacts, not invariants of every cold boot.

## Reproduced transitions

Run the integration recipe with `M3_PROBE=taxi-solicitor` or `taxi-spaceport`. Add captures immediately before each input below, plus the intermediate observations. For the extended branch comparisons, use L at 22000 for both routes and capture through 25000; the original solicitor 16000/16600 exit also remains a separate reproduced economy-trace case.

| Absolute VBL | Controlled input or observation | Established transition |
|---:|---|---|
| 6000 | Capture, then keypad Enter `$72` | Carried TAXICARD becomes active use panel; reveal begins |
| 7300 | Capture, then `*` `$66` | Call flag becomes 1; empty service approaches/holds |
| 10000 | Capture, forward `$7056=1` | Begin approach; waiting taxi has dwell 2 |
| 10650 | `$7056=0` | Stop approach |
| 10700 | Capture, B `$30` | Ordinary B handler creates retry countdown; passenger path admits |
| 10800, 11600 | Capture | Cabin, driver, passenger `$40`; at 11600 inject `+` `$4E` |
| 11900 | Spaceport only: `+` `$4E` | Second destination selected |
| 12200 | Capture, then `*` `$66` | Nonzero selected destination commits Start |
| 14000, 16000, 16600, 19000 | Capture | Solicitor arrived by 14000; spaceport still travelling at 16000/16600, arrived by 19000 |
| 22000 | Capture, L `$26` | Dwell-state exit succeeds |
| 22600, 25000 | Capture | Passenger cleared; ordinary on-foot view/control, active card call panel |

At boarding, raw player XYZ is `($09E18000,$0000003F,$04307F80)`, heading `$0100`. Both routes begin here. In the solicitor baseline, Start at 12200 leads by 14000 to `($09DF8080,$0000003F,$04308000)`, heading `$0000`, panel grid `00-06`. The spaceport endpoint is `($09E18000,$0000003F,$042A8080)`, grid `02-00`. The endpoint position survives exit; subsequent empty-taxi motion does not carry the player away. These are sampled arrival bounds, not claims that arrival happens on exactly those VBLs.

Selected-state fields are passenger `$0040`, dwell 2, Start 0, destination `$60`/`$02`. Settled arrival has passenger `$0040`, dwell 2, Start 0 and destination 0. Exit clears passenger; the empty service subsequently leaves dwell 2. Ordinary discriminator/slot remain `$0001/$FFFF` during the taxi journey.

## Decoded state and consequential readers/writers

Names in this table are bounded analytical descriptions, not original symbols or new glossary terms. Resident arrays use a four-byte offset; resident index 16 is offset `$40`.

| Address / size | Recovered meaning and evidence |
|---|---|
| `$563C` word, `$563E` byte | Carried count and selected/head item; 3 and `$68` here. Activation `$4D63C` finds the item's eight-byte panel definition at `$4D6EA` |
| `$6F0E..$6F11` | Active panel descriptor; TAXICARD `$68050400`, written `$4D6AE`; same-ID activation returns early at `$4D6A8` |
| `$53950` word | Panel reveal countdown; set 64 at `$59C9E`, advanced by `$53956`; panel input `$4D848` refuses while nonzero |
| `$6EB0` long / `$6EB2` low word | Passenger resident offset, **overlapping storage**, not two pointers. Admission writes low word at `$51A00`; pose reader `$5191C` loads it; zero means absent in this path |
| `$6EB4` word | Boarding-attempt countdown; B fallback `$5546C` sets 10, `$519A8` decrements once per passenger-admission pass; occupied pose path clears it |
| `$6EB6` word | Shared service movement/dwell counter, **not** boarding request ID. Route advancement sets 35; height/dwell processing decrements it; stationary unstarted taxi holds at 2 |
| `$6EB8` long, `$6EBC` byte | Destination-list cursor and selected code: solicitor `$7523/$60`, spaceport `$7524/$02`; selection `$4DCD6/$4DD08` |
| `$6EBE`, `$6EC0` words | Start and call flags. `$4DBE2` writes Start=1; `$4DBCA` writes call=1; passenger admission clears call |
| `$7522` onward, `$7104` long | Unique destination list (`$62,$60,$02,0`) and display-label pointer; builder `$4DC9C` uses route and current label table `$7100` → `$214D6` |
| `$6CBC/$6CBE` words | Resident `$40` signed motion rate / segment progress accumulator; rate `$FC00` distinguishes the taxi branch in this run, motion negates it to `$0400` |
| `$6C8C`, `$6D60` longs | Taxi current route cursor / route origin `$41F22`; resident-relative bases `$6C4C/$6D20`; next-point reader `$51F40` |
| `$6CF0/$6CF2` words | Taxi signed X/Z increments, applied at `$51F22/$51F26` |
| `$585C/$5C5C/$605C` longs | Taxi resident X/Y/Z. Player reader copies X/Z and adds `$3F` to Y's low word, `$51934..$51960` |
| `$6D20/$6D22` words | Taxi current/previous heading, resident-relative `$6CE0/$6CE2`; delta added to player heading `$7156` at `$5198A..$51996` |
| `$6EAE` word, `$6E10` byte | Service loop control / resident route control byte copied via `$55F30`; low three bits choose batching at `$518F0`. Do not treat the entire word as a speed |
| `$51CDA` long | Mutable pointer into service height/dwell sequences; segment transition sets `$51CA2`; sequence readers `$51E24/$51E58` |
| `$6ECE` word, `$6DA0..3` | Passenger descriptor `$020E`; taxi metadata `$2528020E` contains arrival/boarding message IDs `$25/$28` and descriptor |
| `$717C` word | Leave-request field used by the **other**, nonnegative-rate passenger branch. The tested taxi L rejection does not set it |
| `$723A` word | Message-display busy gate; `$55B00` rejects message attempts while nonzero, independently of state changes before it |
| `$6EDA` long, `$56D6/$56D8`, `$7352` table, `$711C` | Script execution/stack, per-ID availability and queued-script candidates; readers `$55A1A` onward. Not a complete script persistence schema |
| `$6FCE` long, `$6FD2` word | Elapsed seconds/day, increment and rollover `$5319C..$531C0` |
| `$6F26/$6F28/$6F2A` words | Clock decrement/refill/accumulator, read `$53164` onward; observed 32/1600 gives 50 unpaused VBL per second |
| `$72DE..$72E3` | Six packed-BCD cash bytes; reader `$4E778/$4E77C`, add/subtract helpers `$4E700/$4E71C`, script account handler `$52C80` |

### Card, calling and admission order

With active TAXICARD, `$4DB7C` dispatches by passenger presence. Without a passenger it accepts only `*`, requires signed `$6CBC<0` and frame selector `$7122=1`, then sets call=1. This leaf does not test possession again: the carried-item activation path selected the handler. Card availability and active controls are distinct states.

Ordinary B at `$55474` excludes service residents from ordinary craft admission and falls back to `$5546C`. When no passenger is present, `$519A2` processes the retry window in this order:

1. Require countdown nonzero, then decrement it.
2. Require signed `(service counter − 2)` in 0..28, corresponding to counter 2..30 for the observed values.
3. Require signed high word of packed proximity `$71DA` ≤9.
4. Require nonzero resident-offset long `$71DE`, and bit 6 of **byte** `$71CC` set. The instruction's immediate bit index is 14; byte-memory bit numbering reduces it modulo 8.
5. Shift the resident offset's low word right two; require the compared low-byte index in 16..27. With negative `$6CBC`, additionally require index below 20.
6. Require signed ordinary slot `$7144<0` and context word `$713C != $78`.
7. Write passenger offset, descriptor and heading, clear `$717C` and call, then perform passenger panel/message setup.

`$545AE..$545EC` selects the lesser/equal packed proximity from a rendered resident list, excluding resident offset `$128`, and stores `$71DA/$71DE`. The list builder `$541B2..$542AC` derives it from relative resident coordinates and lookup/add arithmetic. **Nine is a packed high-word threshold, not nine world units.** A VBL checkpoint before B can name a different candidate from the actual handler entry after intervening rendering.

Natural handler observations: the 650-VBL approach gives proximity `$0009125C`, resident `$40`, flags `$D000`, rate `$FC00`, slot `$FFFF`, context `$003C`. Countdown goes 10→9 before success. A 300-VBL approach gives proximity `$0009101E` but resident `$1F0` (index 124); no walking gives `$00051F7E` but resident `$28` (index 10). Both fail despite a passing proximity high word, exhaust ten retries, and remain on foot. This directly rules out a distance-only admission account.

### Selection, route, Start and pose ownership

Selection walks a unique list built from route points having labels, wraps, and skips current location byte `$71F5`. Opening location `$62` is TIMEWARP PRISON; choices are DOOBERRY'S SOLICITORS `$60` and METIS SPACEPORT `$02`. Selection changes cursor, code and displayed label, but does not set Start. Once Start is nonzero, `+`/`−` and repeated Start return without changing the selection/Start state in this handler. Start with no destination returns too.

Taxi definition `$41F18..$41F58` contains signed rate, message/descriptor metadata and route origin. Route `$41F22..$41F56` is 26 pairs followed by a negative terminator at `$41F56`; its low nibbles encode local cell X/Z. Next-point processing consumes the current point, wraps at the terminator, chooses cardinal heading/increments and resets segment progress and position fractions. The second byte's upper nibble feeds service-loop control; this is route data, not a journey-duration table.

The ordered cell path is:

`(2,6) → (1,6) → (0,6) → (0,5) → (0,4) → (0,3) → (0,2) → (0,1) → (1,1) → (2,1) → (3,1) → (4,1) → (4,0) → (3,0) → (2,0) → (3,0) → (4,0) → (4,1) → (4,2) → (4,3) → (3,3) → (2,3) → (1,3) → (1,4) → (1,5) → (1,6)`, then wrap.

The solicitor opening trip stops at `(0,6)`; spaceport continues to `(2,0)`. Empty circulation and calling need more of this loop than either occupied prefix alone. R2 must account for the called taxi's approach, not just draw two endpoint locations.

`$51EAC` keeps an unstarted boarded taxi at dwell 2. Start releases it into height/movement progression. `$51FAA` compares current location with the selected code on route advancement; a match clears Start and selected destination before attempting arrival message `$25`. Settled arrival is the subsequent return to dwell 2, not merely the instant the destination clears.

After the service loop, `$5191C` follows the resident and adds its heading change to the player's existing heading. It does not overwrite heading absolutely on every update. Boarding initially aligns heading. `$5BA24` bypasses ordinary contact while the passenger reference is nonzero. These readers and the observed cabin/XYZ changes support separate passenger pose ownership without claiming all look/steering controls have been exhausted.

### Leave and message gates

L dispatches at `$568DA` to `$5569E`. With negative ordinary slot, `$5573C` checks passenger presence, then rate sign. For this negative-rate taxi, `$5574A` requires service counter **exactly 2**. Otherwise `$5577A` returns without recording a pending request. Success clears passenger, Start and `$6EC6` auxiliary long, refreshes panel/presentation, and retains the arrival pose. The nonnegative-rate branch instead sets `$717C=1`; that is not a licence to queue taxi exits.

A traced spaceport L at 16000 reaches entry, gate and rejecting return with passenger `$40`, counter 0, Start 1, message gate 0 and `$717C=0`. At 22000 the same handler sees counter 2/Start 0, reaches the clearing branch, and passenger is already zero at `$55760`. The independent early-L/no-second-L run stays aboard through 25000 after arriving by 19000. This resolves the earlier report's uncertainty without attributing it to a busy message.

Message helper `$55B00` can refuse a message when `$723A` is busy, but admission/arrival state writes precede that attempt. In natural call checkpoints `$723A=$FFFF` while call still succeeds. Conversely, a `*` at 6010 is consumed during active-panel reveal (`$53950=$003C`, then `$0032` at 6020) without setting call; a later 7300 call succeeds. This is a distinct, demonstrated input gate.

Start can dispatch contextual narrative through `$4DBF4/$55A1A`, using descriptor and origin/destination, per-script availability and active/queued-script state. Opening prison→spaceport invokes script `$33` at `$701E0`; prison→solicitor invokes `$34` at `$703B5`. The decoded paths describe prepaid/sponsored journeys and contain text, waits, message/cabin parameters, flags and returns, with no cash mutation. Shared routines `$766DF..$76710` wait in unpaused VBL units via `$7236`; examples are 50/100/150/200/250/500/750 VBL. Their message/cabin animation can continue independently of route progress. Later-availability fallback scripts are not covered by the first-trip economic claim.

## Probe results and timing bounds

| Matched input history, then branch | Observation / bound |
|---|---|
| Omit Enter; keep call and approach/B inputs | Card remains carried but active descriptor stays zero; no taxi cabin admission in the call/boarding window |
| Call during reveal at 6010; later call at 7300 | First input consumed without call; second accepted after reveal |
| 650 vs 300 vs 0 walking VBLs, same B time | Only 650 admits; actual resident selection explains the shorter failures |
| Select either destination, omit Start and all L | Same boarding XYZ and passenger/dwell `$40/2` through 25000; selection retained; elapsed time advances |
| Start each destination | Distinct arrival coordinates and passenger exits reproduced |
| Spaceport L at 16000, never again | Still passenger at 16600, arrived by 19000, remains passenger through 25000 |
| L at settled arrival | Clears passenger; on-foot endpoint and card call panel by next capture |
| Extra call at 8500, or 10100 while waiting at dwell 2 | Subsequent boarding/solicitor endpoint succeeds. No proof that every internal field or timing is unchanged |
| Extra Start at 12400 while travelling | Same spaceport endpoint and exit; handler's Start flag check rejects restarting. Cold-boot intermediate XYZ differences are not attributed to this input |
| Extra B at 11600 while aboard, no selection/Start | Passenger `$40`, counter 2, ordinary slot `$FFFF`, cabin selection UI persist through 12200; no journey starts |

Synthetic first-admission-pass comparisons stop at success **before** its write (`$51A00`) or rejection (`$519A0`). From the natural successful gate state, changing only proximity high word to 10, countdown to 0, service counter to 1/31, resident to 0/index15/index20/index28, eligibility bit off, slot to 0, or context to `$78` rejects. Control and service counter 30 reach success. These corroborate guard boundaries, not reachable gameplay states or successful downstream operation with altered identities. The exact change list and reproduction hook are below.

Elapsed seconds are independent of rendered frames: both no-Start runs advance 149→405 between VBL 12200 and 25000, exactly 256 seconds, while stationary. The solicitor baseline has 148→404 due to boot phase. Day remains zero. All 155 branch captures have packed cash `005100900000`; active card remains `$68050400` after activation, including after leaving. No fare is inferred outside these routes, first-trip script availability and tested balance.

Separate cold-boot replays of both original journey recipes installed persistent PC traces at the decoded script-account writer `$52C80` and add/subtract helpers `$4E700/$4E71C`, from reset through on-foot exit. None of those three entry points was hit. Together with the decoded first-trip scripts and checkpoint balances, this strengthens the unchanged-cash finding; it does not explain direct initialization or prove the absence of every possible cash writer.

A separate 33-frame spaceport sample, beginning at the first `$518F0` after VBL 16000, observes consecutive frame counter `$7180` values 991..1023. Previous-frame VBL deltas at `$5301E` are 10 (11 samples), 11 (20), and 12 (2). There is one `$51DA8` service entry per sampled frame, with `$71F6=$FFFF` and service control `$6EAE=$0010`. Structurally `$518F0` can run `(low3bits + 1)` service calls when low3bits are nonzero, or up to 16 with early termination on `$71F6` otherwise. `$59E90` derives `$71F6` from resident/player cell proximity; it is not the message gate. This sample therefore must not be generalized to one update per VBL, 50 rendered frames per second, or a constant service rate throughout every route segment.

## Handoffs and observable milestone criteria

**R2 — content/presentation.** Now reported in [taxi journey content and presentation](mercenary-iii-taxi-content-presentation.md) ([#618](https://github.com/odogono/mercenary/issues/618)). The original handoff was: recover the opening room/exit, exterior approach and called resident, the occupied route prefixes and visible surroundings, both arrival street locations, taxi model/cabin/driver, turn/height presentation, TAXICARD reveal/call/selection panels, destination names, cash/clock/navigation cells, and the opening/boarding/driver/arrival/exit message paths. Source leads are the METIS label table `$214D6`, route/metadata `$41F18`, panel definitions `$4D6EA`, message IDs `$25/$28`, scripts `$33/$34` and cabin animation readers `$518AC`. Sound was disabled: audio is still an explicit R2 gap. This is a coverage inventory, not extracted geometry; no Damocles placement/model substitution is authorized. Arrival guidance about later spacecraft boarding is presentation needed here, not permission to expand the playable route.

**R3 — future-affecting state.** Now reported in [taxi persistence and future-affecting state](mercenary-iii-taxi-persistence.md) ([#619](https://github.com/odogono/mercenary/issues/619)). The original handoff was: Candidate groups are carried/active card and reveal countdown; passenger/ordinary slot/pose and previous service heading; countdown and current candidate selection; route cursor/progress/increments and resident arrays; destination list/cursor/code; call/Start/dwell/height-sequence state; clock accumulator/rates/day and paused state; cash/transaction accounts; narrative availability/current pointer/stack/queued script; message timing and cabin animation. Compare restore futures at inactive/partly revealed card, called/waiting taxi, an unconsumed B/countdown, both selected-without-Start cases, departure, mid-turn/mid-travel, rejected L, destination-clear before settled dwell, arrival with narrative active, and after exit. For this tested taxi there is **no pending early-L field** to preserve; do not import the other service's `$717C` semantics. A list of addresses is not a restore-complete Save Snapshot, and emulator RAM restore was not tested here.

**R4 / [#419](https://github.com/odogono/mercenary/issues/419).** Add deferred passenger admission, render-selected candidate/proximity, resident-index/rate gates, call/active-panel state, service-owned position/heading delta and dwell-only exit to the comparison. Ordinary craft slot remains negative and power/movement cannot stand in for the service. TAXICARD is not shown to be a Vehicle Key. This is a new comparison case, not boarding convergence or a shared interface decision.

Refined acceptance cases for a later approved implementation:

1. Activate the carried card and reproduce reveal-time input refusal; accept the later call even while the unrelated message display is busy.
2. Reproduce the successful approach and both evidenced shorter failures through the actual selected-resident/guard chain, including a bounded retry window rather than a fitted walking timer.
3. Keep either selected destination stationary without Start as elapsed time advances; Start drives the independently recovered route to its distinct endpoint.
4. Follow passenger pose/heading changes while retaining the ordinary-foot discriminator/slot semantics. Do not enable self-piloted taxi travel.
5. Discard the demonstrated in-transit L; preserve passenger state after arrival until a new permitted L. Clear it at settled dwell and retain the on-foot endpoint/card state.
6. Preserve unchanged balance for these sponsored opening cases, elapsed-clock progression, narrative availability and message/reveal gates. Do not hard-code the unexplained earlier report's opening balance.
7. Require R2 coverage and R3 future-equivalence tests before accepting the complete milestone. Retain independent title identity and review any shared mechanism separately.

## Reproduction details and evidence ledger

Use the integration recipe unchanged for pins, launch flags, `script`, `bp`, `capture`, cold reset and `:trace :once :quiet :file` callbacks. Replace its taxi `steps` with the VBL/input table above; captures always precede same-VBL writes. Add captures at 14000/16000/16600/19000/22000/22600/25000. The branch table specifies every input difference. For short approaches clear `$7056` at 10300, or omit both stick writes for zero movement, retaining B at 10700. For reveal add capture+`w $56726 $66` at 6010 and captures at 6020/6500. Do not inject at 6001: a failed trial overwrote the still-unconsumed Enter mailbox and did **not** test reveal gating.

For state-level instrumentation, add one-shot PC callbacks before the relevant input and chain them with `bp`; each callback uses `capture(name)` plus `e VBL`:

- Admission: `$55474` → `$5546C` → `$519A2` → `$51A00`. For failed cases, capture `$519A0` and rearm `$519A2` for ten passes. Observe eligibility at handler/pass entry, not only the earlier VBL snapshot.
- Synthetic guards: at the first `$519A2`, capture before; write exactly one patch below; capture injected state; arm both `$519A0` and `$51A00` and quit in the first endpoint callback. Control writes nothing. Preserve program code and stop before success commits.
- L: `$5569E` → `$5574A` → `$5577A` for early rejection; `$5569E` → `$5574A` → `$55760` for arrival success. One run may press L at both 16000 and 22000 for these instruction observations; **the separate no-second-L branch is required** to test queueing.
- Cadence: at VBL 16000 arm `$518F0`; capture `$6C00` length `$800` and `$5301C` length `$80`, `e VBL`, then arm `$5191C` to capture service-loop end and rearm `$518F0`. Repeat 33 frames. A persistent `b pc = $51da8 :trace :quiet :file <service.ini>` with `e VBL` and `savebin <service.bin> $6eae $350` records each entry in the log (file overwrites; count log entries). Read frame word at capture offset `$580`, previous VBL delta at clock offset 2. This measures service before the passenger pose-following reader, not after it.

Synthetic writes are big-endian bytes: `$71DA=000A`; `$6EB4=0000`; `$6EB6=0001/001E/001F`; `$71DE=00000000/0000003C/00000050/00000070`; `$71CC=9000`; `$7144=0000`; `$713C=0078`. Each is a separate run. Do not combine patches and then infer individual guards.

To inspect cash/time at a checkpoint, read six BCD bytes `$72DE`, unsigned long `$6FCE`, word `$6FD2`, and rate words `$6F26/$6F28/$6F2A`. Cross-check panel screenshots. Hash inspected code/data slices before decoding their readers. First-trip script paths must be checked along with the leaf Start handler; cash can also be written indirectly through script accounts, so absence of a direct `$72DE` reference is insufficient.

To repeat the additional economic trace, add persistent `b pc = $52c80 :trace :quiet :file <money.ini>` and equivalent breakpoints for `$4E700/$4E71C` to the boot script before `c`. The callback contains `e VBL`, `r` and `savebin <money-last.bin> a0 $10`; callback records identify hits even though its binary file would overwrite. Run each unmodified integration taxi recipe through exit. In these two logs no callback record or 16-byte save occurred.

The following hashes identify consequential captured artifacts. All paths in the first table are relative to ignored `restricted/mercenary-iii-615/`; reproduction depends on pinned media and procedures above, not these directories.

| Artifact | SHA-256 |
|---|---|
| `probes/taxi-solicitor-baseline-hd04nf24/selected.ram` | `f34503e8790046633ea1f0cc238c67657bc68a19bd9766f63d27b72bca3eae48` |
| `probes/taxi-solicitor-baseline-hd04nf24/v14000.ram` | `365e7b4d9ee56c0fc0b9896bb7e7726216f35255f6fa1648fa1ca02d6b9a0f76` |
| `probes/taxi-solicitor-baseline-hd04nf24/v22600.ram` | `1b35d874c5d0cd14c90bbf7c8c9216a584ed35afb6f04b72ba05abec5f31b33f` |
| `probes/taxi-spaceport-sv8c4ygy/selected.ram` | `0c443306fbc92b633b3a24fd1926bab2afced6d0c52c60882d5096cbe74deffa` |
| `probes/taxi-spaceport-sv8c4ygy/arrived.ram` | `f17987903d1cd84cecfd97c3c00c933318d70414419a05227280928e6e60cee5` |
| `probes/taxi-spaceport-sv8c4ygy/left.ram` | `29fe4e0dc24d8cae1945f5583754334b58a4ad6a45a4c88a11e9bbe26a42f2dd` |
| `probes/taxi-solicitor-no-start-tubfu_mw/v25000.ram` | `16d717c7dc9ae90bfe98d6777795df1e6f4aaea6a2da1e2e11bf047fc7f96899` |
| `probes/taxi-spaceport-no-start-4f9cdnvd/v25000.ram` | `96fdd595b2d5eca3c2939b5084a1751d2ca2a7b426e949c0de31fc26a6100335` |
| `probes/taxi-spaceport-early-leave-qvhe362a/v25000.ram` | `1e23641f95e96118baf4137ea085babf5f9338bc53843ed651ce0c79d90ea7bb` |
| `probes/taxi-solicitor-reveal-e__v5hw2/reveal-before.ram` | `e4d97b2c927ac8332c0300253cd354af4188f474c98eaa2686e97471ca2dbc17` |
| `probes/taxi-solicitor-inactive-2y0w1i2a/boarded.ram` | `69e9bf792c66c699b15dd47fc22a966fdb66a1b11f7379845bc2e9ba8cace585` |
| `admission/approach-650-dnypw054/admit.ram` | `a405b360530edfc51bd1ce87c0792266051f98e075517a40111aced2dd26e95c` |
| `admission/approach-300-uklyq1y6/after.ram` | `f9689e64315e4b09678d5e1366d8068a5f33b47cce9f293ad6fa81361c365190` |
| `admission/synthetic-distance10-jgrefvw5/reject.ram` | `957634c5d76d44ed6415ca2b97eb7cea9fe9eeb25ffdda666a51daafe9048491` |
| `leave/boot-4j715pax/early-result.ram` | `4fb1a57fc0f6b698181ed746d38facd01fbadcfc5d4634eeeb5852b0de4539f9` |
| `leave/boot-4j715pax/late-result.ram` | `b3eeb1c0e82ad38b3e65ef58089c9c13d13fd21835619eb1abcba9311120da80` |
| `cadence/boot-iq76ms_v/hatari.log` | `40d8002c05785b41bb2982a9cb8cc1926446caaa4b6beb25f8f3613ced9bbc8f` |
| `economy/taxi-spaceport-4p8isahj/hatari.log` | `e1472c5237db0fe03169e7fdda44ecb28d18b346fd761e59c436a9ca88651d54` |
| `economy/taxi-solicitor-j04gp0la/hatari.log` | `8becefe13e89f4781cec9306762c0db311d9cbac00e03582edbce599069f09c2` |

Stable inspected code/data slices, from loaded RAM SHA-256 `94a107412037ce7972a605bfa1355e9fc9751373922df7fbd987d9ff94f1a8ec`:

| Half-open range | Meaning | SHA-256 |
|---|---|---|
| `$518F0..$51A4E` | Passenger loop/admission | `04e26ee68941fb23279297cf0e5697671c69989069991ef42c061a20b88bb45d` |
| `$5569E..$55788` | Leave handler | `9e52e0d0c38a28ec13488c5f65dcf3abaf594ee024187cf5c31f3841b461e17f` |
| `$4DB7C..$4DD3A` | Service input/list readers | `5ac18a5abd34156ed99cc95bc114abbcb18fb4c4cdd7942fbb1bc36ecda9aa70` |
| `$51BEE..$51CA2` | Service initialization | `6a0d07f0c41995a572eb5b7962fcf14086bb5a97e79193ecaab36246527bd26a` |
| `$51DA8..$52024` | Motion/arrival readers | `d82d74b6edd945250544d089b87852e720dc415a93ac620921a62a1be07df93d` |
| `$41F18..$41F58` | METIS taxi definition | `44c095d23f33c8bcaae37bf233dcccfc9a8b655579d4a8c25e55838cfdf10c5a` |
| `$701E0..$7040D` | First spaceport/solicitor scripts | `a69dd0c3c32ea2803214fe15e4b8d8b6c5fe164fbee0c19e67614eb2707b51f5` |
| `$766BF..$76721` | Shared waits/epilogues | `f8f3910c3f570f74030c6da3cf6fd44ab472139e41535c89b4601e7e457a0086` |

## Explicit gaps and stopping decision

- The earlier 51,004,000 versus fresh 51,009,000 opening balance discrepancy remains unexplained. Probe initialization/account writes from reset against a retained prior capture before choosing a fixed opening-cash acceptance value. This does not erase unchanged within-run cash evidence.
- Counter 2 is the taxi's decoded leave condition; tests cover travel and settled arrival, not every instant of deceleration/height animation. Before exact input-order implementation, trace L at each service-counter boundary around destination-clear and dwell. Do not equate an arrival message with admission to exit.
- Proximity and resident selection are recovered to the actual packed predicate and writer; a complete independently specified coordinate-to-proximity calculation remains R4 work if required for implementation. Do not substitute a Euclidean radius. `$713C` and unexercised high-bit/index values have deliberately not acquired guessed domain names.
- A later trip may select fallback scripts or different economic rules. Other services, all call-invalid states, original saves, host input latency, release/real-TOS equivalence and every script interleaving are outside this investigation.
- R2 geometry/presentation/audio coverage and R3 restoration remain slice blockers. Probe failures there should revise or defer the milestone; successful journeys alone do not authorize `/dion` or architecture convergence.

Research verification consists of both full journeys, the controlled branches, instruction-level admission/leave checks, bounded synthetic guards, timing samples, visual checkpoint inspection and artifact/source hashing. Application tests are not relevant to this documentation-only change. No original program code, RAM or image is included in tracked files.
