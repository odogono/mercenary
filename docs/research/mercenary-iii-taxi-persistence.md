# Mercenary III: taxi persistence and future-affecting state

Research for [#619](https://github.com/odogono/mercenary/issues/619), 2026-09-29, with the undecoded bytes decoded for [#637](https://github.com/odogono/mercenary/issues/637) (R3b), 2026-09-30. This is R3 of the [integration report](mercenary-iii-integration.md). It follows the [taxi-journey report](mercenary-iii-taxi-journeys.md) (R1, #615) and the [taxi content and presentation report](mercenary-iii-taxi-content-presentation.md) (R2, #618). It extends the pinned **Mercenary III research baseline**, not Damocles **Working Authority**. It proposes no application, public API, Data Payload, Save format, schema, `/dion` admission, glossary or architecture change. Original media, RAM, emulator snapshots, screenshots and disassembly remain ignored Restricted Material under `restricted/mercenary-iii-619/`, following [ADR 0002](../adr/0002-separate-rom-research-from-implementation.md).

## Outcome

Persistence for the two opening METIS journeys is **bounded and tested**, not blocked:

- **The restore harness is trustworthy.** Hatari's `statesave`/`stateload` restore the pinned machine exactly. Across 33 checkpoints on six trajectories, every restored continuation matches its uninterrupted twin: an identical per-frame state trace to VBL 25000, and byte-identical 1 MiB RAM at every later capture. The trajectories cover both routes, both no-Start branches, the rejected in-transit L and a pending admission countdown.
- **Only RAM carries the future.** Loading a checkpoint's RAM into a freshly loaded machine, screens included or not, reproduces the future exactly at four tested checkpoints. CPU registers at the loop top, chip state and the emulator VBL counter carry nothing more. One emulator-only effect remains: the raster position of the loop top. A mismatched phase shifts frame boundaries by one VBL, and some transitions by one frame.
- **The inventory was demonstrated jointly, not listed.** A checkpoint machine was given back only the proposed inventory, with every other changed byte reset to its fresh-load value. At all 17 consequential checkpoints this gives a future identical frame for frame to the uninterrupted one. The inventory is 6,229 bytes, and 1,374 changed bytes are reset. Resetting the sound driver's programme vector as well leaves 16 identical and one timing-only difference (≤2 frames).
- **Most of that inventory is not gameplay state.** For the original engine it includes location workspace, render/scene work areas and message machinery. The gameplay fields are a few hundred bytes. Location workspace is a function of place: identical at every checkpoint in the same location, across trajectories. Render/scene work areas are engine-internal and cannot all be reset: resetting one crashes the game.
- **The screen is not reconstructed by the game.** It redraws the 3D view within a frame or two, but the control panel is drawn incrementally. With fresh screen buffers it keeps stale pixels for at least 3,000 VBL: the message bar, destination panel, grid readout and clock digits. A restore must repaint the whole panel from state.
- **The undecoded bytes are decoded (R3b, #637).** Only the script flag register `$7270..$7277` needs carrying. Region flags `$71CC`, the taxi facing byte, the card artwork and the location bindings can be rebuilt; the rest is emulator or presentation state. Most of their apparent divergence was CPU cost moving frame boundaries.

This is **not a Save Snapshot schema**. It is a tested account of which state affects these two journeys' futures and how, for the original engine under controlled inputs. A later Save/Session Resume design should carry the gameplay rows below and rebuild the rest. The acceptance tests in the last section check that choice.

Consequential findings for the milestone:

1. **Timed and queued narrative is separate state.** Besides the script PC (`$6EDA`), there is:
   - per-ID script availability (`$56CF..$56D9`);
   - a VBL countdown with a queued script ID (`$727E`/`$7280`, dispatched from the main loop);
   - a message-bar machine: busy `$723A`, wait counter `$7236`, text buffer `$5292C`, scroll state `$533D2..`.

   Omitting any of them changes later narrative or message timing.
2. **Pending input is state.** An unconsumed scancode in mailbox `$56726`, the admission countdown `$6EB4` and the render-derived admission candidate (`$71D8..$71E1`, render list `$54141..`) all change the future while pending. Resetting the countdown at a natural mid-window checkpoint leaves the player on foot for good. The call stays pending and the taxi waits.
3. **Leave has no pending state.** L is accepted only at service counter 2. It is rejected at 35 (destination cleared, descending) and 34, on both routes. A rejected L leaves nothing queued, and exit later needs a new L. The only trace of a rejected in-transit L is the last-key latch `$71FA/$71FB`, which one script opcode reads. No observed effect follows before the next L overwrites it.
4. **Arrival is three ordered events.** Destination match clears Start and destination and sets counter 35. Arrival message `$25` is then attempted: accepted at the solicitor, refused at the spaceport because the driver script holds the bar. Descent follows, and only the return to counter 2 permits exit.
5. **The opening-balance discrepancy is resolved.** The integration report's own retained capture shows `051,009,000.00` on screen and BCD `005100900000` at `$72DE`. So "51,004,000" was a transcription error; there is no second opening balance. Cash is unchanged in every capture of these journeys.

## Baseline and harness

The pins are those of R1 and R2: STX SHA-256 `4e8b74122910bcaa109b944eebb6f0ec18fdeb1175c34eea3c932d0e1b18b62c`, EmuTOS 2.0.6 `154803e3…39d5`, Hatari 2.6.1 `05723606…1e11a`, launched with the [integration recipe's](mercenary-iii-integration.md#cold-boot-and-controlled-probes) configuration (ST, 1 MiB, 68000 cycle-exact, sound off, 60 Hz field rate as noted in R2). Loaded RAM for code slices is the R1/R2 `loaded.ram` (`94a10741…a8ec`). Inputs are original scancodes written to mailbox `$56726`, and forward walking is `$7056=1`. Addresses are hexadecimal, values big-endian, ranges half-open.

**Natural-input traces** use only those inputs. **Whole-machine controls** save and restore the complete emulator state. **Transplant and omission probes** are synthetic. They restore a whole machine, then overwrite chosen RAM ranges with bytes from another state, so they establish dependence, not natural reachability.

### Restore mechanics

Two facts explain the earlier report's stalled `--memstate`/FIFO restores:

- `stateload` is **deferred**. It completes after the current debugger script returns, then **clears every breakpoint** and replays the snapshot's `<file>.sav.debug` sidecar. Pokes placed after `stateload` in the same script are lost. So are breakpoints armed there.
- `statesave` writes the sidecar with the breakpoint that was live at save time, without `:trace`. Replayed as is, it drops into the interactive debugger on the restored VBL.

The working recipe replaces the sidecar of each restored copy. It holds any inputs due at the checkpoint, the persistent trace breakpoint and the first `:once` step breakpoint. The one-shot boot breakpoint, `b VBL = 50 … :file restore.ini`, contains only `stateload <copy>`. Relative `loadbin` paths resolve against the sidecar's directory, so all transplant files use absolute paths. Hatari conditions accept `>`, not `>=`. The chain keeps exactly one `:once` breakpoint live at a time.

### Loop-top checkpoints and determinism

The main loop starts at `$5A41A` (`jsr $5A3D0`). Every loop end branches back there, and the supervisor stack is empty (`A7=$80000`). A **checkpoint at VBL N** is the first arrival at `$5A41A` at or after VBL N. A persistent breakpoint at `$5A420` prints a 26-field trace once per main-loop frame. The fields are the card, service, route, script, message, clock, player, proximity and cash words listed in the evidence ledger.

Cold boots are **not** reproducible byte for byte. Two cold boots differ in 5,445 bytes at VBL 6000, including resident, clock-accumulator and message words. Restores are reproducible. So every trajectory here branches from one saved fresh state, **`B0`**: loaded play at the loop top after VBL 6000 (actual VBL 6004), before any input. Enter is applied immediately after restoring `B0`. A statesave does not perturb a run: traces and final RAM match runs without statesaves.

### Trajectories and event timing

All VBLs are absolute. Inputs apply at the first loop top at or after the listed VBL. Trace VBLs label the frame whose loop top shows the change.

| Trajectory | Inputs after `B0` | Key transitions |
|---|---|---|
| `sol` | Enter 6004; `*` 7300; forward 10000–10650; B 10700; `+` 11600; `*` 12200; L 22000 | Call 7314; passenger `$40` 10717; destination `$60` 11621; Start 12221; destination cleared/counter 35 13497; counter 34 13712; counter 2 13723; exit 22007 |
| `sp` | As `sol`, plus `+` 11900 | Destination `$02` 11921; Start 12221; turns at segment changes 13490, 14678, 16156, 16690; destination cleared 17693 (arrival script already holding the bar since 17638); bar free 17828; script idle 17846; counter 2 17891; exit 22012 |
| `sp-early` | As `sp`, L at 16000, no L at 22000 | Identical per-frame trace to `sp` from 16013 through 22000; stays aboard to 25000 |
| `sol-nostart`, `sp-nostart` | Omit Start and L | Stationary at boarding pose to 25000; clock 149 → 405 s |
| `solwb` | As `sol`, but B at 10500 while still walking | Countdown 9 at 10513 with no passenger and nearest resident `$370`; 8 at 10523 with resident `$40`; admitted 10536; solicitor arrival and dwell as `sol` |

Two branches from `B0` with a common prefix give byte-identical checkpoints: `sol` and `sol-nostart` at 12200, likewise `sp` and `sp-nostart`. So "continue with and without Start" is a true branch comparison.

## Restore comparisons

### Whole-machine controls

For each checkpoint, a restored continuation with the remaining input schedule was compared with the uninterrupted run. Checkpoints taken after a same-VBL input are marked *post*.

| Case (issue list) | Checkpoints |
|---|---|
| 1. Card carried, mid-reveal, called/approaching, waiting | `sol` 6010 (reveal 53), 7320 (called), 9000 (waiting, counter 2), 10300 (mid-walk) |
| 2. Unconsumed B / active countdown | `sol` 10700 pre and *post* (mailbox `$30`); `solwb` 10510 (countdown 9), 10520 (countdown 8) |
| 3. Selected without Start, then with and without Start | `sol`/`sp` 12200 continued with Start and as `*-nostart`; both `*-nostart` 12200 and 16000 |
| 4. Departure, turn, narrative/message animation | `sol` 12230 (lift-off), 12620 (message scrolling, script waiting); `sp` 12320 (driver narrative), 14670/14680 (either side of a turn), 16000 |
| 5. After rejected L, through arrival | `sp-early` 16010 and 19000 |
| 6. Cleared before dwell, arrival with narrative, exit | `sol` 13490, 13600 (counter 35), 13730 (dwell, arrival message showing), 22000, 22010 (after exit); `sp` 17700 (cleared while script holds bar), 17895 (dwell), 22020 |

**All 33 pass**. Traces are identical from the checkpoint to 25000, with no missing frames, and full RAM is identical at every later capture: 12200, 14000, 16000, 19000, 22000, 22600 and 25000, as applicable. This is the control. It shows restore mechanics, not a portable inventory.

### RAM-only transplant

`B0` was restored and then overwritten with a checkpoint's full RAM, all of it or all but the two screen buffers `$68000..$6FD00` and `$78000..$7FD00`. The remaining inputs were replayed shifted by (checkpoint VBL − 6004). At `sol` 12200, `sp` 16000, `sol` 10700-post and `sp` 17700, this was frame-aligned and identical to 25000 in both variants.

At `sol` 6010 it was not. That checkpoint's loop top falls on raster line 219, against line 38 for `B0`. The transplanted run's frames therefore fall one VBL early, and message and script transitions move by one frame for a while. The wait counter `$7236` runs 11 behind (the shift) during one scripted wait, then converges to ±1. 16 frames differ from 7215, and the end state (passenger, counter, destination, pose, cash, clock, panel, script) matches. Raster phase is emulator-only state. It cannot be carried in RAM, and a port need not reproduce it. **Acceptance comparisons should allow one main-loop frame of timing tolerance** and compare transitions and outcomes, not VBL-exact traces.

The omission and inventory tests below avoid phase effects. They keep the checkpoint's own machine and reset chosen bytes to `B0` values, so no time shift is needed and the control is exact.

### Screen buffers

The same checkpoint was restored twice, once as is and once with both screen buffers set to `B0` contents. Screenshots were compared at +1, +12, +40, +100, +300, +1000 and +3000 VBL, at `sol` 6010, 12620, 13730 and 22010 and at `sp` 17700.

The 3D view is repainted by +12–40 VBL. The panel band (screen y 348–444) is not. At `sol` 13730 +3000 the fresh-screen run still shows:

- the opening "CONGRATULATIONS ON YOUR PATIENCE" bar
- the title logo where the TAXI CARD/DOOBERRYS SOLICITORS/DESTINATION panel should be
- grid `02-06` instead of `00-06`
- clock `00-00-59` instead of `00-03-59`, with only changed digits redrawn

About 10,400 pixels stay different. At `sol` 6010, the only case still in the room with the same panel, the difference clears by +40. **Panel pixels are persistent presentation state in the original.** A restore must draw every panel element and the message bar from state.

### Night context follow-up (#646)

[The night/sky report](mercenary-iii-taxi-night-sky.md) extends restoration at `sol` 13730 and `sp` 17700 through night. Twelve synthetic continuations separate full METIS phase, cached angular coordinates and derived sky values. Resetting only `$70E4`, `$7324`, `$70A6` and `$42C6C` gives byte-identical RAM and screenshots to the untouched control by checkpoint +50 VBL and at 18000/19000 on both routes. Both untouched controls' full RAM at 19000 also matches the uninterrupted R3 trajectory. These values can be rebuilt before presentation from preserved context.

In contrast, resetting only cached latitude `$42C70` to zero reverses the day/night result and remains wrong at 19000. Resetting the METIS accumulator to `B0` postpones night beyond 19000. Deriving coordinates from current taxi XYZ changes the solicitor longitude step from `$278` to `$277`, and the spaceport latitude from `$20C` to `$20A`. The port must preserve the actual cached-coordinate update rule, not substitute current service position. These original-engine controls establish dependencies; I2 still has to prove its portable Save/Session Resume reconstruction under the accepted eleven-tick cadence.

## Omission method

Only 7,603 non-screen bytes ever differ from `B0` across all checkpoints. Walk-B adds ten more, including the countdown. They were covered by 48 address groups.

For each of 17 checkpoint cases, a checkpoint machine had one group reset to its `B0` bytes. That is 833 runs, including one unmodified control per case. Each result was then classified:

- **identical**: same trace and final RAM
- **persisting**: same trace, but final non-screen RAM differs
- **timing-only**: same semantic transition sequence and end state, shifted
- **divergent**: a different outcome
- **crash**

Inside groups that were ever divergent or timing-only, a further 386 runs reset single fields at 8 checkpoints (`sol` 6010, 10700-post, 12200, 12620, 13600; `solwb` 10510, 10520; `sp` 17700; `sp-early` 16010). A reset only tests a field whose value differs from `B0` at that checkpoint. An identical result for a field still holding its fresh value is uninformative, and none is claimed.

The **joint inventory test** then kept every field or group that was divergent, timing-only or crashing anywhere, plus bytes of such groups not covered by a tested field. It reset everything else at once, at all 17 checkpoints.

The first pass failed at `sol` 11600. With the destination list `$7522` and label pointer `$7104..$710B` reset, `+` selected nothing and the taxi never left. Adding them failed at `sp` 12320: 7-way bisection over the 571 reset ranges isolated `$4BF59..$4BF5C`, the sound driver's second programme vector (called through `$4BF58` by the VBL handler). With it reset, the transitions are the same in the same order, shifted −13…+18 VBL, and the endpoint, pose, cash, clock, panel and script match. Its CPU cost changes frame cadence. With it kept, all 17 checkpoints are frame-for-frame identical. The only final-RAM differences are in reset presentation and work bytes, 20–1,106 bytes per checkpoint.

## State inventory

Classes:

- **R**: required mutable gameplay/narrative state; omission diverged.
- **P**: pending-input state; required only while an input is unconsumed.
- **L**: location workspace; identical at every checkpoint in one location, across trajectories and time.
- **W**: engine work area; time-varying scene/render data.
- **V**: presentation; persisting or timing-only effects.
- **E**: emulator-only.
- **I**: immutable in these journeys.
- **U**: unresolved.

"Div at" lists checkpoints where a field-level reset diverged. Group-level results are in the ledger. Widths are bytes.

### Service, passenger and route

| Address / width | Meaning (R1 names) | Class | Evidence / readers |
|---|---|---|---|
| `$6EB0` 4 | Passenger reference (low word resident offset `$40`) | R | Div at 12200, 12620, 13600, 17700, 16010. Pose follower `$5191C`, contact bypass `$5BA24` |
| `$6EB4` 2 | Admission countdown | R/P | Div at walk-B 10510/10520: never admitted, stays on foot to 25000. Writers `$5546C`/`$519A8` |
| `$6EB6` 2 | Service movement/dwell counter | R | Div at 10700-post, 10510, 12200, 13600, 17700. Leave gate `$5574A` |
| `$6EB8` 6 | Destination-list cursor and selected code | R | Div at 12200, 12620, 16010; timing at 13600/17700 |
| `$6EBE` 2, `$6EC0` 2 | Start; call | R | Start div at 12620, 16010; call div at 10700-post, 10510 |
| `$6ECE` 2 | Passenger descriptor | R | Div at 12200, 12620, 17700, 16010 |
| `$6E10` 1 | Route control byte copied from route data | R | Div at 10700-post, 10510, 12200, 12620 |
| `$6EAE` 2 | Service loop control (calls per frame) | V/R | Timing-only at 13600, 17700, 16010; recomputed from `$6E10`/route. Written from resident route data at `$55F44`. Treat as R until a rebuild is tested |
| `$6EA0..$6EAD` | Cabin/driver animation state | V | Persisting only |
| `$7522..$7524`, `$7104..$710B` | Destination list and label pointer (built at boarding by `$4DC9C`) | R | Joint test: resetting both stops the taxi leaving at 11600. The game does not rebuild them before selection |
| `$6C8C` 4, `$6CBC` 4, `$6CF0` 4, `$6D20` 4 | Taxi route cursor; rate/progress; X/Z increments; heading/previous heading | R | Div across 6010–17700. Increments from 13600 on, heading from 12200 on |
| `$581D..`, `$5BF9..`, `$601D..` (low bytes) | Resident X/Y/Z of moving residents (taxi `$40` and others) | R | Div at every tested checkpoint except Y at 12620 |
| `$6C5C` 1 | Taxi facing byte: slot 16 of the per-resident yaw array `$6C1C`+4·slot. Written from the placement heading, by route turns as heading word `$6D20` >> 2, and by leave from the player heading. Read by the model draw and by boarding | Derived (R3b) | Equals `($6D20 >> 2) & $FF` at all 31 checkpoints. Under exact cadence a reset is identical at all 8 checkpoints where it differs, and a wrong value before boarding is timing-only. Carry `$6D20` and rebuild it |
| `$6BFB..$6C1B` | Resident-array bytes | V/U | Persisting only (13600+) |
| `$51CDA` 4 | Height/dwell sequence pointer | R | Div at 10700-post, 10510, 12200, 13600; timing at 12620, 17700 |
| `$575A..$57D9` | 32 **long** Body turn accumulators, +long `$7AEA[i]` each VBL at `$53144`; METIS is `$5796`, rate `$000003B0` at `$7B26` | R | Div at 10700-post onwards. Persisting only at 6010, but night timing is presentation that a trace does not capture. [#646](mercenary-iii-taxi-night-sky.md) confirms resetting METIS phase restores day where the control is night. Preserve the fractional low word, or prove reconstruction from the same phase origin and tick count |
| `$70B4`, `$70B8`, `$42C70` words | Cached longitude and latitude steps; taxi passengers use the foot path, which refreshes sampled longitude `$42C6C` but does not refresh latitude from service XYZ | Required for sky, preserved or reconstructed | [#646](mercenary-iii-taxi-night-sky.md): resetting `$42C70` reverses the day/night result on both routes; recalculating from current taxi XYZ is not the recovered update rule. Preserve the cached coordinate context or rebuild it from its actual update history |

### Player and input

| Address / width | Meaning | Class | Evidence |
|---|---|---|---|
| `$7146..$7155`, `$7156` 2 | Player XYZ; heading | R | XYZ div while on foot (10700-post, 10510); heading div aboard (12200+). Boarding XYZ is written by the pose follower each frame |
| `$7038..$7053` | Player-pose block read by `$51940`/`$527AA` | R | Div at 10700-post, 10510 |
| `$7056..$705F` | Stick copy and neighbours | R | Div at 10510, 13600, 17700 |
| `$7024` 2 (`$7025` low byte) | Byte length (4 × count) of the location's ground point list at `$144`/`$244`. Written by the location loader `$56244`, read by the projection loop `$576A2` through long `$7022` | L (R3b) | One value per location (`$54`, `$70`, `$58`, `$B0`). Under exact cadence a reset only persists. Rebuilt with the location |
| `$71A6..$71CB` | Cell loader header: end of region list `$71A6`, current region `$71AA`, camera-relative level heights `$71AE..$71BD`, level heights `$71BE..$71C3`, vertex/edge/list/region counts `$71C4..$71CB` | L, with `$71AA` region-derived and `$71AE..` W (R3b) | Under exact cadence resets are identical or persist; the heights are recomputed every frame. Rebuilt with the location, `$71AA` by region selection |
| `$71CC` 2 | Current region flags word; `$C000` latch while `$718E` < 0 | R, derived from region (R3b) | Bit 14 gates admission: a reset during a pending admission leaves the player on foot, in both cadences. Forced reselection from position rebuilds it: identical at 5 of 6 checkpoints, timing-only at `sp-early` 16010 |
| `$71EF..$71F7` | Eligibility/flags, current location byte `$71F5`, proximity flag `$71F6` | R | Div at every tested checkpoint from 10700 |
| `$56726` 1 | Scancode mailbox | P | Div at 10700-post (B unconsumed) |
| `$71D8..$71E1` | Packed proximity and nearest resident | P | Div at 10700-post only |
| `$54141`, `$54175`, `$543A0..$543AA`, `$54A30..` | Render-derived resident list / candidate selection | P/W | Div at 10700-post, 13600, 16010. The admission candidate is taken from the previous frame's render list |
| `$71F8..$71FB` | Last key word; script-readable latch (`$52C0E`) | V/U | Persisting after the rejected L only; no observed effect |

### Card and panel

| Address / width | Meaning | Class | Evidence |
|---|---|---|---|
| `$563C` 2, `$563E` 1 | Carried count / selected item (3, `$68`) | I here | Never changes in these journeys; must be carried in general |
| `$6F0E` 4 | Active panel descriptor (`$68050400`) | R | Div at every checkpoint |
| `$53950` 2 | Panel reveal countdown | R | Div at 6010 (reveal 53) |
| `$6F12..$6F15`, `$6FD08..$6FD43` | Panel palette words and uploaded colours | V | Persisting only |
| `$B300..$B6C0` | Panel text cache: cash digits, location label `$B318`, readouts | V | Persisting everywhere except timing effects (7320, 10700-post, 12320). Resetting it perturbed one later frame boundary |
| `$3CE68..$3D228` | Card artwork, masked planar, written by card activation `$59C2C` from panel descriptor `$6F0E` | V (R3b) | One content at all 31 checkpoints. Resets only persist, in both cadences. Rebuilt from `$6F0E` |
| `$2ECA6..$2ECB8` | Model-table entries of resident slots 247–255, bound by the location loader `$563B2` | L (R3b) | Natural-cadence divergence is CPU cost; under exact cadence resets persist (one timing-only). Rebuilt with the location |
| `$354E7`, `$354ED`, `$354F3` | RED BEACON (model 176) face colours, patched while drawing from frame counter `$7180` bit 2 | V (R3b) | Identical in both cadences. Not saved |
| Screen buffers | Incrementally drawn panel and message bar | V | Panel not redrawn from state |

### Narrative, messages and time

R5 independently checked the main-loop reader: bit 1 of **byte** `$7272` is script flag **9**, not flag 1 of the big-endian long. The [progression survey](mercenary-iii-services-progression.md#coarse-campaign-state) records the reader and election-script writer that agree on that meaning. Taxi restore conclusions are unchanged.

| Address / width | Meaning | Class | Evidence |
|---|---|---|---|
| `$6ED8..$6EDF` | Script PC `$6EDA` and neighbours | R | Div at every checkpoint from 7320 |
| `$56CF..$56D9` | Script return stack (longs pushed down from `$56D6`) and its pointer word `$56D8` (R3b; R3 misnamed it "per-ID script availability") | R | Div at 12620, 17700, 16010 |
| `$50F0`, `$52F0..` | Script queue candidates | V/U | Persisting only |
| `$727C..$7287` | Timed script: `$727E` decremented per VBL at `$53130`, `$7280` queued ID; written by script op `$52F54`, dispatched from `$5A3FC` | R | Div at 6010, 12620, 13600 |
| `$7270..$7277` (`$7272..$7273` = flags 8–15, 0–7) | The 64 script flags. Opcodes `$52CCA` set and `$52D18` clear flag n. Flag 6 = script running (set at start `$55A5C`, cleared at end `$528FE`), flag 13 is toggled by the narrative, flag 9 selects the main-loop time trigger (R5 corrects the byte/bit interpretation), flag 15 the R2 driver branch | R (R3b) | A flag-6 reset diverges in both cadences: the next script never starts. Flag 6 equals "stack pointer `$56D8` ≠ `$56D6`" at all 31 checkpoints. A flag-13 reset only persists. Carry all 8 bytes |
| `$7292..$72A3` | Message-bar buffer pointer `$7292` (`$7293` = screen half), MFP mask `$7296`, raster split `$7298`, Timer B phase `$729A`, PSG mixer shadow `$72A0`, PSG select shadow `$72A2` | E/V (R3b) | Under exact cadence every reset is identical or persists. The one natural-cadence divergence (`$729A` at 10700-post) is CPU cost. Not saved |
| `$723A` 2, `$7236` 2, `$7232` 2 | Message busy; VBL wait counter (+1 per VBL at `$5312C`); centred start pointer | R | Busy div at 10700-post, 10510, 12200, 16010; wait div at 6010, 10700-post, 12200, 16010; pointer at 13600 |
| `$5292C..$5295B`, `$533D2..$533DB` | Message text buffer (decoded by `$52AC4`); scroll/hold state | R | Div at 12620, 13600, 17700 |
| `$7180` 2 | Main-loop frame counter | R | Div at 6010, 10700-post, 10510, 12200, 13600 |
| `$6FCE` 4, `$6FD2` 2 | Elapsed seconds, day | R | Seconds div at 10700 onwards; day stays 0 |
| `$6F2A` 2 | Clock accumulator (`-$6F26` per VBL, refill `$6F28`, 50 VBL/s) | R | Div at most checkpoints |
| `$6F26`, `$6F28` | Clock rates | I here | Unchanged |
| `$6F36` 2 | Accumulator `+$6FD4` per VBL | V/U | Persisting only |
| `$72DE..$72E3` | Cash BCD | I here | Unchanged (`005100900000`) in every capture |
| `$4BF54..$4BF5B`, `$4C480` | Sound programme vectors; engine slew word | V | Timing-only (≤2 frames). Audio content untested (sound off) |

### Location workspace and engine work areas

- **L: `$3E00..$4200`** (includes door latch `$406C`), **`$4200..$4800`**, **`$8000..$A000`** (`$97CC..`), **`$6400..$6600`** and **`$680F..$6820`** (including location code copy `$681F`). Byte-identical at every solicitor checkpoint (13600, 13730, 22010) and every spaceport checkpoint (17700, 17895, 22020, `sp-early` 19000). Different between locations. Resetting them to the prison values diverges at the solicitor checkpoints and persists unrepaired at the spaceport checkpoints. The game rebuilds them only on region/cell change. Treat them as rebuilt from location and region by the location loader, not saved. R2's loader decode names the source; running the original loader on restore was not tested. **Correction ([#645](mercenary-iii-prison-door.md#restore-evidence)):** the prison door's latch byte (`$406D`) and leaf edges (`$167E..$168B`) are R state, not L, from the key handover (about 4976) until the closing swing completes (about 10520), covering R3's 6010–10300 checkpoints. Restoring them as bound (shut) at 6010 or 10300 produces a door swing and sound the natural run lacks. After 10520, and at every solicitor and spaceport checkpoint, the bound doors equal their rebuild values.
- **W: `$0000..$1240`, `$1240..$1D38`, `$4800..$5000`, `$A000..$B200`**. Scene and render work data that varies within one location. Resetting `$1240..$1D38` crashes the game at 10 of the 13 checkpoints from boarding on: an endless address-error loop at `$5A2B8`. The exceptions are the no-Start continuation (persisting only) and `sp-early` 16010 (identical); at 10700-post it diverges. The others diverge at later checkpoints or only persist. For the original engine these must be carried or regenerated by a full scene rebuild before the next frame. For a port that owns its renderer they are not gameplay state. That claim is bounded: no scene rebuild was invoked.
- **E**: CPU/chip state and raster phase at the loop top; the stack below SP (`$7FF80..$7FFF9`, identical when reset); emulator VBL counter. The screen buffers are E as memory, but their panel content is V state that must be regenerated.
- **I**: all bytes that never differ from `B0` in these journeys. This includes program code, the taxi definition and route `$41F18..`, the label table `$214D6`, scripts `$701E0..`, message table `$6FD44`, body turn rates `$7AEA`, carried item and cash.

### Initialization and ordering dependencies

- **Destination list and label pointer** are built at boarding from the route and current location (`$4DC9C`). A restore inside the cabin must restore them or rebuild them before the next `+`/`−`.
- **Location workspace** must exist for the restored cell and region before the first frame. Resident bindings follow from it. The bound door's latch and leaf edges follow from it only once the door is at rest at its bind value. Otherwise restore them over the rebuilt workspace before the first door pass ([#645](mercenary-iii-prison-door.md#restore-evidence)).
- **The pending admission window** depends on the previous frame's render-derived candidate, not the saved player position alone. A restore with a pending B or countdown must produce the same candidate before the next admission pass. Otherwise the window can expire unused.
- **The timed-script countdown `$727E`** and the message wait counter `$7236` count VBLs, not frames. They must advance with the restored elapsed-time model, not the render rate.
- **The panel** must be fully repainted after restore. The original draws only changes.
- **The night context** must retain the full METIS turn phase and cached angular coordinates, with the fixed simulation phase from ADR 0058. Rebuild sampled longitude, day flag, sky colour and selected palette half before presenting the restored scene, using the recovered frame order. Fresh taxi XYZ does not reconstruct the cached coordinates. [#646](mercenary-iii-taxi-night-sky.md) records the bounded restore controls; the remaining sky/body inventory is not thereby complete.

## Decoded future-affecting bytes (R3b)

[#637](https://github.com/odogono/mercenary/issues/637) decoded the ranges that R3 left undecoded. They are `$6C5C`, `$7025`, `$7272`, `$7293..$72A3`, `$71A8..$71CC` and the non-image bytes near `$3CE68`/`$2ECA6`. The run used the same pins, trajectories and checkpoints as above.

### Method

- **Readers and writers.** Absolute and displacement cross-references were taken in `loaded.ram`. Change-watch breakpoints (`b (<addr>).<w> ! (<addr>).<w>`) were set on every range along `sol`, `sp`, `sp-early` and `solwb`. Each hit records its VBL and the PC after the writing instruction.
- **Values at all 31 checkpoints.** Each field was compared with `B0` and with the rule proposed for rebuilding it.
- **Omissions in two cadences.** Each sub-field was reset to its `B0` bytes, alone, at every one of the 17 R3 omission checkpoints where it differs from `B0`. That is 167 cases, and each ran twice:
  - **Natural:** 8 MHz, as in R3, compared with the uninterrupted reference.
  - **Exact:** the frame-end wait at `$5A952` is redirected to wait for exactly 11 VBL, and the CPU clock is raised to 32 MHz in the sidecar, so every frame is exactly 11 VBL. This is #642's instrument ([cadence report](mercenary-iii-taxi-cadence.md)). Each case is compared with an unmodified exact-cadence control from the same checkpoint. A repeated control was identical.

  Under exact cadence a byte's CPU cost cannot move a frame boundary. A difference that survives is logic.
- **Classes.** Results use R3's classes: identical, persisting, timing-only, divergent. Timing-only is stricter here. It requires the same semantic transitions and the same script-PC sequence, and equal gameplay rows in the final RAM (service, route, taxi and player pose, script stack, flags, timed script, message busy, clock, cash, panel, destination list).

### Results

| Range | Decoded meaning | Natural reset | Exact-cadence reset | Save for this slice |
|---|---|---|---|---|
| `$6C5C` | Taxi (slot 16) facing byte in yaw array `$6C1C`+4·slot. Route turns write `$6D20` >> 2 (`$51FFC`, `$5202A`). Leave writes it from the player heading (`$55724`). Model draw (`$54468`, `$5451C`) and boarding (`$55592`) read it | 6 of 8 divergent | 8 of 8 identical | **Rebuild** as `($6D20 >> 2) & $FF`. The rule holds at all 31 checkpoints. `$6D20` is already carried. A wrong value on the waiting taxi (10300, walk-B 10510) is timing-only under exact cadence |
| `$7024..$7025` | Byte length of the ground point list at `$144`/`$244`, built by the location loader (`$561AE..$56248`) and walked by `$576A2` | 5 of 7 divergent | 5 persisting, 2 identical | **Rebuild** with the location (L). One value per location |
| `$7272..$7273` | Flags 0–15 of the 64-bit script flag register `$7270..$7277`, set/cleared by script opcodes `$52CCA`/`$52D18` | Flag 6: 5 divergent, 5 persisting. Flag 13: persisting | Same | **Carry** `$7270..$7277` (8 bytes). Flag 6 (script running) can also be rebuilt as "`$56D8` ≠ `$56D6`", which holds at all 31 checkpoints. With it wrongly set, the driver narrative at 12221 never starts and later message timing changes |
| `$7292..$7295` | Message-bar source address; `$7293` selects the screen half (`$5349A`) | 5 identical, 1 persisting | Same | **Ignore**. Screen presentation, repainted from state |
| `$729A` | Timer B raster phase, rewritten from `$7298` every VBL (`$530E8`, handler `$53294`) | 13 identical, 1 divergent | 14 identical | **Ignore** (E). The divergence is CPU cost |
| `$72A0`, `$72A2` | PSG mixer and register-select shadows, used by the sound driver and restored on interrupt exit (`$53174`) | Identical or persisting | Same | **Ignore** (E); the port owns audio |
| `$71A6..$71A9` | End of the current cell's region list (`$5B2C2`) | Persisting or identical | Same | **Rebuild** with the location |
| `$71AA..$71AD` | Current region record pointer into `$97CC` (14-byte records: flags, x0, x1, z0, z1, text pointer); index `$7196` | 13 identical, 1 persisting | 14 identical | **Rebuild** by region selection from position. At all 31 checkpoints the current region is the unique region that strictly contains the player, at least 11 units inside |
| `$71AE..$71BD` | Camera-relative level heights, recomputed from `$703C` each frame (`$5B73E..$5B78A`) | 9 identical | 9 identical | **Ignore** (W) |
| `$71BE..$71C3`, `$71C4..$71CB` | Cell header heights; vertex, edge, list and region counts (`$5AD5A..$5B2BE`) | Persisting or identical | Same | **Rebuild** with the location |
| `$71CC` | Current region flags. `$C000` while `$719A` or `$718E` is negative (`$5B672`). Bit 14 gates admission, bits 14/12 gate the level path (`$54364`), bit 13 gates key handling (`$5685A`) | Divergent at pending admission (walk-B 10510/10520, 10700-post); elsewhere only `$71CC` itself differs, or timing-only | Same | **Rebuild** from the current region, with the `$C000` latch rule. Test: `$71AA := $97CE` and `$71CC := $8000` force a reselection from position. Result identical at walk-B 10510/10520, 10700-post, 13600 and 17700 under exact cadence, timing-only at `sp-early` 16010 (already in region 0, so nothing reselects) |
| `$2ECA6..$2ECB8` | Model-table entries for resident slots 247–255, copied from the cell record by the loader (`$563B2`) | 5 divergent, 2 persisting | 5 persisting, 1 identical, 1 timing-only | **Rebuild** with the location |
| `$354E7`, `$354ED`, `$354F3` | RED BEACON (model 176) face colours, patched while drawing from `$7180` bit 2 (`$54424`) | 10 identical | 10 identical | **Ignore** |
| `$3CE68..$3D228` | Card artwork written by card activation `$59C2C` from `$6F0F`/`$6F10` | 17 persisting | 17 persisting | **Rebuild** from panel descriptor `$6F0E` (one content at all checkpoints) |

"Rebuild" means the byte is a function of carried state: location and region, heading, script stack or panel descriptor. The continuation evidence is:

- **Region:** the forced-reselection runs above.
- **Other rebuild rules:** the rule reproduces the saved byte at all 31 checkpoints, so a rebuilt continuation equals the unmodified control.
- **Location-derived (L) bytes:** the exact-cadence resets show that nothing but the byte itself changes until the game reloads the location. Running the original loader on restore was still not tested.

### What this changes

- **Most of R3's divergence for these ranges was CPU cost, not logic.** The facing byte, ground point count, location model bindings and Timer B phase change how long frames take. At natural cadence the moved frame boundaries shift the taxi's later roaming route (`$6CBC`, `$6C8C` differ at 25000), so those runs end differently. Under exact cadence they only persist. This is the same mechanism as the sound-vector case in the joint test. A port at ADR 0058's fixed cadence is not exposed to it.
- **Two ranges carry logic.** Script flag 6 (and the rest of the flag register) and region flags `$71CC` change outcomes in both cadences. Bit 6 of `$7273` blocks every script start. `$71CC` bit 14 decides a pending admission.
- **R3's `img-3ce68` field mixed three things.** Its divergence came from the model-table entries, not the card artwork.

## Leave, input and arrival boundaries

L was injected at each loop top around the solicitor (from 13490) and spaceport (from 17700, and from 16000 for 17693/17702) arrivals. PC traps were placed at handler entry `$5569E`, gate `$5574A`, reject `$5577A` and clear `$55760`.

| Route | L handled at VBL (counter) | Result |
|---|---|---|
| Solicitor | 13508, 13600, 13690, 13701 (35); 13712 (34) | Rejected; still aboard at 14300 |
| Solicitor | 13723, 13733, 13743 (2) | Cleared; passenger 0 on the next frame (13732, 13742, 13752) |
| Spaceport | 17693, 17702, 17801, 17873 (35); 17882 (34) | Rejected; still aboard at 18500 |
| Spaceport | 17891, 17900 (2) | Cleared by 17899, 17908 |

Input written at a loop top is handled in that frame or the next, depending on where in the loop the key is polled. Acceptance should be defined by the counter at handler time, not the input VBL.

Arrival helper `$55B00` returns without displaying when `$723A` is nonzero. The solicitor calls it at VBL 13487 with message `$25`, bar free: accepted. The spaceport calls it at 17684 with `$25` while `$723A=$FFFF`: refused. In both, counter 35 and the cleared destination are already written at entry. So destination match, message attempt and exit eligibility are distinct and ordered.

## Opening balance

Every RAM capture retained from the integration investigation holds `005100900000` at `$72DE` (49 files under `restricted/mercenary-iii-609/`). So do all R1, R2 and R3 captures. This includes the report's own `loaded-01` state: RAM SHA-256 `775a8efd…d131`, screenshot `d758b638…aea4`, whose panel reads `051,009,000.00` and clock `00-00-24`. The integration report's "51,004,000" was a misreading of the panel. There is no second opening-balance state. Initial elapsed seconds still vary by one between cold boots, which is boot phase.

## Remaining hypotheses and milestone refinements

Nothing found invalidates the two-journey milestone. Restore-complete persistence for it is bounded. What remains is the gap between this original-engine inventory and a port's Save design.

**Slice-blocking before Save/Resume implementation:**

1. *Gameplay-row sufficiency in a port.* The joint test proves sufficiency with W and L areas carried. The port must instead rebuild L from location and own W. Probe: run the acceptance tests below in the port against these traces, rather than further emulator work.
2. *Unknown required bytes*: **resolved by R3b** ([Decoded future-affecting bytes](#decoded-future-affecting-bytes-r3b)).
   - **Carry:** the script flag register `$7270..$7277`.
   - **Rebuild:** the taxi facing byte (from `$6D20`), the region pointer and flags `$71AA`/`$71CC` (by region selection from position), the cell header `$71A6..$71CB`, `$7024`, the model bindings `$2ECA6..` (with the location), and the card artwork (from `$6F0E`).
   - **Ignore:** `$7292..$72A3`, `$71AE..$71BD` and the beacon colours.

   Nothing in these ranges needs its own Save field beyond the flags. Their natural-cadence divergence is CPU cost.
3. *Frame-rate model.* Wait, timed-script, Body turn and clock counters are per VBL; route motion and admission passes are per frame. [ADR 0058](../adr/0058-run-mercenary-iii-at-50-hz-with-a-confirmed-fixed-frame-cadence.md) settles this at 50 Hz with eleven ticks per frame. [#646](mercenary-iii-taxi-night-sky.md) adds the night context: full fractional phase, cached coordinates and sampled-frame order must be preserved or demonstrably reconstructed.

**Not blocking, but recorded:**

- Raster phase and sound-driver CPU cost shift transitions by one to two frames. Neither can be carried portably.
- A rejected L's last-key latch had no observed effect. A key-waiting script could read it; none runs in these journeys.
- The original save slots were not inspected. No consequential question required them, and file compatibility is not assumed.

**Refined Save/Session Resume acceptance criteria** (replacing integration criterion 5 for this slice):

1. From each case in the whole-machine-controls table, a Save followed by Resume and the same later inputs gives the same ordered transitions as uninterrupted play. That means call, admission, selection, Start, turns, destination clear, arrival message shown or refused, dwell, exit, clock seconds, narrative messages and cash. Tolerance is one main-loop frame. Endpoints must match exactly.
2. A Save with an unconsumed B, or mid-admission window, preserves admission. A Save while descending (counter 35/34) preserves the rejection of L until settled dwell, and nothing is queued.
3. A Save during a script wait, a timed script or a busy message bar resumes the same text and timing. On the spaceport this includes suppressing "WE'VE ARRIVED". Before, across and after the night boundary, restoration preserves the decoded day rule, sky/windows/stars and their subsequent timing using full turn phase and cached angular coordinates ([#646](mercenary-iii-taxi-night-sky.md)); assert the rule, not a universal flip VBL.
4. After Resume, the panel is fully drawn from state: card text, destination, grid, cash and clock. The message bar is not left to incremental repaint.
5. A Save taken mid-reveal resumes the reveal and its input refusal.
6. **Title identity.** A Mercenary III Save names its title and pinned research baseline. It is refused by other titles and refuses their Saves. Damocles schema 18 identity is not evidence of compatibility. No schema or version is proposed here; the recorded fields above are the minimum a Mercenary III Save must reconstruct for this slice.

**R4 / [#419](https://github.com/odogono/mercenary/issues/419).** Add for comparison, not reuse:

- deferred admission with a render-derived candidate
- VBL-driven timed scripts and message waits separate from frame-driven motion
- the incremental panel repaint

## Reproduction

A checkout does not contain the harness. It can be rebuilt from this section with the pinned media.

1. **Cold boot and `B0`.** Launch the integration configuration with `--parse boot.ini`, where `boot.ini` arms `b VBL > 5999 :trace :once :quiet :file vbl.ini` and `c`. `vbl.ini` arms `b pc = $5a41a :trace :once :quiet :file ck.ini`. `ck.ini` runs `savebin B0.ram 0 $100000` and `statesave B0.sav`, then `quit`.
2. **Trajectory from a state.** Copy the `.sav` into the run directory. Write its `.sav.debug` with:
   - pending inputs (`w $56726 $72` after `B0`);
   - `b pc = $5a420 :trace :quiet :file trace.ini`, whose script is `e VBL` plus `m` dumps of the traced ranges (ledger);
   - the first step `b VBL > <N-1> :trace :once :quiet :file vbl-0.ini`.

   Boot with `b VBL = 50 :trace :once :quiet :file restore.ini`, containing only `stateload <copy>`. Each `vbl-i.ini` arms `b pc = $5a41a … step-i.ini`. Each `step-i.ini` performs its captures (`savebin`, `statesave`, `screenshot`), then its inputs, then arms `vbl-(i+1)`. The last runs `quit`. Launch with `stdin` at `/dev/null`.
3. **Controls.** Restore each checkpoint with its remaining schedule. Compare trace frames after the checkpoint VBL and full-RAM captures.
4. **Omissions.** Restore the checkpoint and add `loadbin <abs path> $<start>` lines to the sidecar, before inputs, with slices of `B0.ram`. Treat a run that times out with repeated `Address Error … PC=$5a2b8` as a crash.
5. **Leave boundaries.** Add persistent `b pc = $5569e`, `$5574a`, `$5577a` and `$55760` breakpoints with `e VBL` and `m $6eb0-$6ec0`.

6. **R3b change watches.** Add persistent `b (<addr>).<w> ! (<addr>).<w> :trace :quiet :file w.ini` breakpoints, where `w.ini` is `e VBL`, `e pc` and an `m` dump. The PC printed is the instruction after the write.
7. **R3b exact cadence.** Add these lines to the sidecar before the inputs:
   - `setopt --cpuclock 32`
   - `w $F0000` with the wait routine: `move.w $53096,d0; move.w d0,d1; sub.w $5301C,d1; cmpi.w #11,d1; blt` (back to the first instruction); `jmp $5A960`
   - `w $5A952` with `jmp $F0000.l` and four `nop`s.

   `$F0000..` is zero at every checkpoint. Compare each reset with an exact-cadence control from the same checkpoint, not with the natural reference.
8. **R3b rebuild tests.** Region: `w $71AA $00 $00 $97 $CE` and `w $71CC $80 $00`. Facing: `w $6C5C $80` at `sol` 10300 and walk-B 10510.

A run of 13,000 VBL takes about 20 s unloaded; an exact-cadence run to 25000 takes about 30 s.

### Artifact identities

Paths are under ignored `restricted/mercenary-iii-619/`.

| Artifact | SHA-256 |
|---|---|
| `ck/B0.sav` | `2957a938b943c13865640927ed2615eed62c7114e27dc8cf0da16a405fcf62dd` |
| `ck/B0.ram` | `3927dccd30e46d05e02f67a4dcf3b02a644868f5b6eb274bf91de3be6343745c` |
| `runs/U-sol-u_ch2dqa/ck12200.ram` | `16c96d06c667c30d1d46f052e4aef7d5ea26ad69b3bef3611f01f55a8405d1b6` |
| `runs/U-sol-u_ch2dqa/ck13600.ram` | `e19aaf10e85610313291f8e5c413eaea06c66486275b40bf0d3edca263afbf77` |
| `runs/U-sol-u_ch2dqa/ck10700b.ram` | `d98234e35aa679d729f66660f649aa1cd114c809bcf0fd77945646e0c2e89df6` |
| `runs/U-sp-q7aish0m/ck16000.ram` | `540dbab3b40bb945171b35aab2e2321bddbca4755e83f45435e29592edae5afe` |
| `runs/U-sp-q7aish0m/ck17700.ram` | `82f5b8f013379880c24c65bd99d691c406578fd4d04bdad4b8dfe84d4128fbe0` |
| `runs/U-sp-early-saz4sk2i/ck16010.ram` | `b4fa314f11104a06e2c94abbea861eedd1fdca58ee4013874ea9d79cb1710734` |
| `runs/U-solwb-xtz0kurv/ck10510.ram` | `ce6d58b6ec568bd6dff74d0dbe94418edb1e9d5e2d1a5a34c29647c3cd619901` |
| `runs/U-sol-u_ch2dqa/v25000.ram` | `7c962e7900dfc6e4257c37c4de98d881f7b2937fde70b13ae22eacaa00a7aadc` |
| `runs/U-sp-q7aish0m/v25000.ram` | `331e5494f2739f3f8882363ba5841667c2f64ead8b0c1c0249aa9803a5b93c84` |
| `omit.jsonl` (833 group omissions) | `92f1a632f395c842fb304e54fb9ca097aa2c26c93755df0cd601a96cb368c5a4` |
| `phase2.jsonl` (386 field omissions) | `6b5fc56333ff992059dc73e83c9c2d57499be6b2cca75f925f6ecc7ee771b3c2` |
| `inventory.json` (keep/reset ranges) | `13882beffad156e2118788501757d2eabdec6b8579f26c231430c1dc7ae144f7` |
| `R.json` (33 controls) | `d6defbe9547c7a533525c003a9ec61c01a96dbe692dcd33d61887be388031a5e` |
| `runs/hyb/H-noscreen-sol-ck6010-l9btf3fw/hatari.log` (raster-phase drift) | `930d2b66dd5cc84bc2187209a1474fb4aa8d3803525762c8168fce08e712aba4` |
| `leaveb.jsonl` (leave boundaries) | `4dabd0faa4f8110c9208bb9e934dc3a42eb60672546aecfa7842d020e4d1f31e` |

R3b artifacts are under ignored `restricted/mercenary-iii-637/`. They restore R3's checkpoints above.

| Artifact | SHA-256 |
|---|---|
| `exp.jsonl` (334 omissions in two cadences, 16 continuation tests) | `7e5b19ab4f46d00f6da1d476805c1e1fc111998a74dd6a447c0b8c531eb94004` |
| `controls.json` (exact-cadence controls) | `c53f34dbcb176ec85deac5c12123c3eba18d9c7a47c2f1847d1ae503274d6845` |
| `runs/W-sol-…-7eu072sp/hatari.log` (change watches, `sol`) | `40c44602583feebfca57b3d268d53d90b32c576f14966f4b79825562412edf25` |
| `runs/W-sp-…-25rlhyn2/hatari.log` (`sp`) | `071b99081215e17d060c15e88d576a8ef5651cfd8f0b02b23a4062022472bfb8` |
| `runs/W-sp-early-…-5ruhh0rp/hatari.log` (`sp-early`) | `4dfa54946a37c13e92972421ccf188f05478dc7cbeeb9baa6f23e861e47c89ae` |
| `runs/W-solwb-…-2xm52fqd/hatari.log` (walk-B) | `65796a7fbafdb0700fb361e2c11d8cbf88eded5be31247b58b964f67328b4f58` |

### Inspected slices

From `loaded.ram` (`94a10741…a8ec`):

| Half-open range | Meaning | SHA-256 |
|---|---|---|
| `$5A36C..$5A41A` | Loop entry and top | `572964dea7d52488ae264a417336958e47620a8e05eb3612bbbdd34db1be9bc5` |
| `$5A3D0..$5A5A4` | Timed-script dispatch and main-loop body | `48b3c8f7ff4da6753114f7edc2f0bb7c7a611ee53c1e4c1a358ee3a2766642da` |
| `$530FC..$5317C` | VBL handler: sound vectors, waits, turn accumulators, clock | `a64a69a9c69802868a0e059a0eb1b918d339c75ab40c81fd332badf8b6f0aef0` |
| `$5319C..$531D2` | Seconds/day rollover | `618b2f4410813d53252924c0230b80874c5033e6d1f64f4973c048796cf2b4e8` |
| `$52F54..$52F6A` | Timed-script opcode | `497d9016489d52a444b10428436b12743427e41e71e26e90662f18935f61d9ee` |
| `$52C0E..$52C20` | Script key-compare opcode | `bc66f73999bc17f99973b346b720d113d966e794b64252daba568aca34424fcb` |
| `$52EB4..$52EC0` | Script key-wait opcode | `3850b01403db23a08655268cc47eae168825b624f0a60dc39180bd02951cca35` |
| `$56828..$56850` | Last-key latch write | `196f3f3e26bd8397d2eed4bbe5197029bd1c28477b02156a10ccb6ec5b0a0701` |
| `$55B00..$55B6A` | Message helper and busy gate | `ec4a3adad4de654661c94a704925d482a923ab96840eee6529947289376cfcb0` |
| `$5569E..$55788` | Leave handler (as R1) | `9e52e0d0c38a28ec13488c5f65dcf3abaf594ee024187cf5c31f3841b461e17f` |
| `$4E680..$4E6A0` | Cash text cache writer | `77401a980aa72c9871ba54656252b01b6b2d1f3ead40767ed29c799b0533e874` |
| `$55F40..$55F70` | Location label cache writer | `6ff48689b0640072c854328bfe1e056c10b95957a6c56bcf0c7d1a0f834346ab` |
| `$51B98..$51BEE` | Resident placement: facing byte from placement heading | `4544e6b6f5a967b55fdd1373f20ec87a5d28c5e80eeb0755a87a45dc88cb5f1b` |
| `$51FD6..$52030` | Route turn: heading word, facing byte | `1bc13b45df8a116ff1004699a3199ca295337e6a00ce3af5673e35e00d4bcd5c` |
| `$54440..$54470` | Model draw: facing byte read (exterior) | `ce867ba4d74d68ba3240fe6483c1d8b300acc3efbd413f5443359d1e4a39d361` |
| `$544FC..$5452A` | Model draw: facing byte read (other forms) | `574af2d387197260d87fd059a6fa0b7e1d023d750f82c8fba10846700aa9f111` |
| `$543F0..$5442A` | Model colour patch (RED BEACON blink) | `e0f64346227e3456768b7dfb69995099c1727691f52811ce9a185d2eaef0f898` |
| `$55566..$5559C` | Board: player pose and heading from the taxi | `f793eac8dfbf1db6ffbf35573f27c06362a40156e465aff905c5a5bd03de50b9` |
| `$556F0..$55738` | Leave: taxi facing from player heading | `e65901febb72e1bd3b7785d41747ed8479995d3ba159e3d789d30ea3eff15f9e` |
| `$561AE..$56248` | Location loader: ground point list and $7024 | `55e162d12476868504eb2900a90ff0e8ea90272aad64839ff0c58a6f26edf704` |
| `$576A2..$576F2` | Ground point projection loop (reads $7022) | `53e3ea8f20c45c138d3046826b270575b540f99d0bc0ddbfba4cef7d80177866` |
| `$52CCA..$52D32` | Script opcodes: set/clear flag n in $7270..$7277 | `d691f780cf9572b1df65241917ce5ac7f9653d0059d82f85c7a54f5901d9741b` |
| `$528FE..$52910` | Script end: clear flag 6, empty stack | `24797b90784cf83ee9b8d747b6e1f12f4f6b829cd22c8cd75d0ecdc9156546f8` |
| `$5A3D0..$5A41A` | Main loop: flag 9 time triggers (R5 correction), timed-script dispatch gate | `1dc78a8beaddb5fd75590489db14e619cece3db6e45b27df84af3348a3927db2` |
| `$53098..$530FC` | VBL head: palette, Timer B arm, $729A | `3ed5a752ea467b1e208248d703ce34ba0e6805338496eb8aee89d38160e68f5b` |
| `$53294..$53366` | Timer B handler: raster splits, $729A/$7296 | `86f177eb828e9aa9e5062df60c07c5c643c2cd9979324ed5439d637476a88bcb` |
| `$53420..$534A0` | Message scroll: PSG blip, $7292 buffer pointer | `da33f2e6a6248648f70bc1e0833984b0d0f4b30a6c905ce64767988ed9ef3d6d` |
| `$53650..$53660` | Message bar copy between buffers | `7d99c0c210e0fc2933f68f966161887c6a90ce8e9fdef400ef65524c1fe1b93d` |
| `$5AD2C..$5AE52` | Cell loader: header heights, vertex/edge counts | `56944aa6494124bff112ac4c3210bebd777ddce0c359240f4367faab30ae6b7e` |
| `$5B212..$5B2DE` | Cell loader: region list at $97CC, $71C8/$71CA/$71A6/$71AA | `a02581a4f178aa55d34abb890a615ec3861e7eb057ce5d95714546fe15879a5c` |
| `$5B2DE..$5B39E` | Region selection: $7196, $71CC, $71AA | `001f6da786db9f27c37add5006fe02bb7279c69a830b47371b0a4cfddded8290` |
| `$5B61C..$5B6BA` | Region hysteresis and $C000 latch | `2f4c3662cae5715b890f6ad1130ead7c000af99fe2fb566dda87633ecd057b93` |
| `$5B73E..$5B78E` | Camera-relative level heights $71AE..$71BD | `9eecfbfd2ecd79bf568f0f4eac8831fb726790946a8a073afb79a50088d60593` |
| `$59C2C..$59C9E` | Card activation: artwork into $3CE68 block | `66c27c4ba849394287e26909917f3dee572d59c18cfb068a837fb7d54eeba1cb` |
| `$5625E..$563C4` | Location loader: cell residents and model-table binding | `06d31bb50495892e76dc39d5d59e3df6df0e6eef7d6b695724b869a776914dd7` |

The trace ranges are:

- card and panel: `$563C+4`, `$56726+2`, `$53950+2`, `$6F0E+4`
- service and route: `$51CDA+4`, `$6CBC+4`, `$6C8C+4`, `$6CF0+4`, `$6D20+4`, `$6EAE+$1A`
- taxi position: `$589C/$5C9C/$609C+4`
- script and frame: `$6EDA+4`, `$7180+2`
- clock: `$6F26+6`, `$6FCE+6`
- player and context: `$713C+2`, `$7144+2`, `$7146+$12`, `$717C+2`
- proximity and eligibility: `$71DA+8`, `$71CC+2`
- messages: `$7236+2`, `$723A+2`
- cash: `$72DE+6`

Research verification comprised:

- 33 whole-machine controls, 9 RAM-only transplant runs and 5 screen comparisons
- 833 group omissions and 386 field omissions
- the joint inventory test at 17 checkpoints, plus bisection and an isolated rerun
- 18 leave-boundary runs and 2 arrival-message traces
- R3b: 9 change-watch runs, 167 sub-field omissions in each of two cadences, 18 exact-cadence controls plus one repeat, and 16 continuation tests

No original program code, RAM, snapshot or image is included in tracked files. Application tests are not relevant to this documentation-only change.
