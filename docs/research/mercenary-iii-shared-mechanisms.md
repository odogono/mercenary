# Mercenary III: shared mechanisms, frame rate and boarding matrix

Research for [#636](https://github.com/odogono/mercenary/issues/636), 2026-09-29. This is R4 of the [integration report](mercenary-iii-integration.md) (row 2c). It follows R1 ([taxi journeys](mercenary-iii-taxi-journeys.md), #615), R2 ([content and presentation](mercenary-iii-taxi-content-presentation.md), #618) and R3 ([persistence](mercenary-iii-taxi-persistence.md), #619). It extends the pinned **Mercenary III research baseline**, not Damocles **Working Authority**.

It proposes no application, public API, Data Payload, Save format, `/dion` admission, shared architecture or boarding convergence. [ADR 0043](../adr/0043-admit-damocles-play-alongside-the-second-city.md) still governs shared seams. [ADR 0051](../adr/0051-run-the-damocles-craft-pass-exactly-once-every-four-ticks.md)'s four-tick policy is not carried into Mercenary III. Original media, RAM, emulator snapshots and disassembly stay ignored under `restricted/mercenary-iii-636/`, following [ADR 0002](../adr/0002-separate-rom-research-from-implementation.md).

## Outcome

1. **At 50 Hz both journeys reproduce, with the same endpoints and the same order within each mechanism.** Rules fall into two exact clocks:
   - **VBL-counted rules** give identical VBL intervals at 50 and 60 Hz. These are the elapsed clock, the reveal, message holds, script waits and the night flip.
   - **Frame-counted rules** give identical frame counts at both rates. The solicitor ride is 112 main-loop frames and the spaceport ride 507. The descent to dwell is 22 frames, and the admission pass is one frame.

   Only the number of VBLs per frame changes. It is about 1.2× fewer at 50 Hz, because a frame's CPU cost is the same at both rates.
2. **The two clocks race.** Because frame length depends on what the ST draws, the order *between* narrative messages and route events differs between the rates. The arrival message outcome is therefore a race between them. An instrumented sweep ran the original engine at fixed cadences. Only 9 and 11 VBL per frame reproduce both baseline outcomes (solicitor WE'VE ARRIVED shown, spaceport refused). Cadences of 8, 10, 12 and 14 flip at least one.
3. **Walking is per frame.** On foot, the game runs `clamp(last frame's VBLs, 4, 8)` substeps per frame. The ST frames here take 5–16 VBL, so walking distance per VBL depends on cadence. At 50 Hz, R1's 650-VBL approach takes the player 1,154 units past the taxi, and admission fails. Admission acceptance must be stated by position or proximity, not by walking time.
4. **No part of the craft Mover is on the taxi path.** The foot Mover runs its substeps (up to eight per frame) throughout the journey, with the selector and slot left at `$0001`/`$FFFF`. The aboard dispatch never runs. The service writes the passenger's position, but the player keeps the yaw: a stick turn aboard turns the view, and the offset survives the exit.
5. **The float library and the render-list distance are shared.** The Damocles port's `craftFloat`/`craftSquare`/`craftAdd`/`craftSqrt` reproduce every stored render-list key in three MIII images and the Damocles image. They also reproduce the four natural admission proximities observed here. The taxi route, heights and pose follower use only integer arithmetic.
6. **Most R2/R3 sibling similarities hold up as shared code modulo relocation.** These are the frame pacing and substep clamp, sound driver walkers, day/night test, workspace builder and cell-stream templates, message display machine and clock digit repaint. Two are sibling but distinct: the model table (word offsets, plus a title-specific `$800D` passenger-form op) and the script VM (byte opcodes; several opcodes differ). Every row is classified [below](#4-classification-of-compared-mechanisms).
7. **The admission matrix separates three kinds of admission:** self-piloted craft, seatable objects and passenger services. MIII's ordinary B handler is Damocles's boarding handler relocated, plus inserts. The taxi's service residents are excluded at step 8, which arms the ten-pass passenger window. The matrix is posted on [#419](https://github.com/odogono/mercenary/issues/419).

**Recommendation for D1** (the decision is D1's): run game time at **50 Hz**, and use a **fixed main-loop cadence of 9 ticks per frame**, with the recovered eight substeps per frame. **Superseded by [#642](mercenary-iii-taxi-cadence.md):** at exactly 9 the solicitor arrival is refused, and [ADR 0058](../adr/0058-run-mercenary-iii-at-50-hz-with-a-confirmed-fixed-frame-cadence.md) adopts **11**. The [evidence and alternatives](#cadence-options-for-d1) are below. Nothing found blocks D1. Three findings change the milestone's acceptance wording ([list](#milestone-changes-and-d1-blockers)).

## Baseline and method

The pins are R1–R3's:
- STX SHA-256 `4e8b74122910bcaa109b944eebb6f0ec18fdeb1175c34eea3c932d0e1b18b62c`
- EmuTOS `emutos206.img` `154803e3ff4851f3dc358b91b16d6b6110d187a81d8132ecb665af49878939d5`
- Hatari 2.6.1 Mach-O `05723606c75a1f0642395974abdce2cbbe48b0a09a747f65cdfca7ef9201e11a`

The machine uses the [integration recipe](mercenary-iii-integration.md#cold-boot-and-controlled-probes) configuration. All three pins were verified before every run.

Damocles facts come from the pinned first-world RAM (`observed.ram`, `b019301e…c9a967`), the Damocles research notes cited by name, and current `web/src/damocles/`. MIII code slices were hashed from R3's `B0.ram` (`3927dccd…3745c`). Each slice was checked equal to R1/R2's `loaded.ram` (`94a10741…a8ec`).

**Rate control.**
- **50 Hz**: a debugger write `$FFFF820A` ← `$02` at VBL 10, before the loader runs. This is the Damocles lab's PAL poke.
- **60 Hz**: the lab's EmuTOS default, `$FFFF820A = $00`.
- **Control**: an EmuTOS `--country uk` cold boot. It sets `$02` itself and starts the game at the same point as the poke: VBL 3947 against 3949, within one field of CPU time.

Measured cycles per VBL across whole trajectories are 160,256–160,261 at 50 Hz and 133,600 at 60 Hz. So the poke holds, and the program never resets the rate. Static scans agree: the resident image holds no reference to `$FF820A` or `$FF8260`, while finding the positive controls `$FF8240` (palette, `$5309C`) and `$FF8201` (screen base, `$5A942`). Mercenary III, like [Damocles](damocles-display-rate.md), inherits the machine's field rate.

**Aligned checkpoints.** Loading is CPU-bound, so the game starts at the same cycle but a different VBL: `T0`, the opening script start `$59FBA`, falls at VBL 4734 at 60 Hz and 3949 at 50 Hz. Each rate's `B0` is the first main-loop top `$5A41A` at or after `T0 + 1255`. That is VBL 5994 at 60 Hz and 5204 at 50 Hz, with elapsed clock 25 s in both.

Every trajectory restores its rate's `B0` with R3's sidecar method. It applies inputs at the same **VBL offsets after `B0`**, which is the same game time. The offsets are Enter +0, `*` +1296, forward +3996, release +4646, B +4696, `+` +5596, second `+` +5896 (spaceport only), Start +6196, L +15996, end +18996. These are R3's schedule shifted to `B0`.

**Observation.**
- Per-VBL write watches cover the reveal `$53950`, message busy `$723A`, clock `$6FCE`, passenger `$6EB2`, service counter `$6EB6`, taxi heading `$6D20`, destination `$6EBC`, Start `$6EBE`, admission countdown `$6EB4`, queued timed script `$7280` and script PC `$6EDA`.
- PC traps sit at script start `$55A1A`, the ID-message helper `$55B00` and the frame-end wait `$5A952`/`$5A960`.
- R3's per-frame field trace runs at `$5A420`, with the CPU cycle counter added.

Watches cost no emulated cycles. The 60 Hz runs reproduce R3's transitions within one frame: call +1310, destination cleared +7484 against R3's 13497 − 6004 = 7493, and dwell +7709 against 7719. They also reproduce R1's endpoints exactly.

## 1. Frame rate and frame cadence

### How the main loop keeps time

This is a static decode, confirmed by the runs below.

| Unit | What runs on it | Evidence |
|---|---|---|
| **VBL** (interrupt `$53098`) | Palette upload; sound vectors B `$4BF54` then C `$4BF58`; message machine `$53420`; reveal `$53956`; VBL counter `$53094`; script wait `$7236` +1; timed-script countdown `$727E` −1; 32 Body turn accumulators `$575A` += `$7AEA`; clock accumulator `$6F2A` −= `$6F26` (50 VBL per second) | `$53098..$5317C` `46bcad15…c13b` |
| **Main-loop frame** (top `$5A41A`) | Timed-script dispatch `$5A3FC`; script interpreter `$52860` (one opcode per frame); service loop `$518F0` (taxi motion, heights, pose follower, admission pass); day/night test `$50B10`; render | `$5A41A..$5A5A4` `dca0fa6c…cf18` |
| **Substep** (foot path only) | `$5A4C2`: count = `clamp($5301E, 4, 8)`, where `$5301E` is the VBLs the last frame took. Each substep runs `$56CF4`, the Mover dispatch `$58D86`, contact `$5BA24` and `$5B61C` | `$5A4C2..$5A4DC` `9355ebe3…49fb` |
| **Aboard path** (`$7122 = 0`) | One Mover dispatch `$5A6B4` and one service call `$5A6B8` per frame, plus the refusal retry `$5A6E2` | `$5A68C..$5A6F0` `bc4cee78…1c11` |
| **Frame end** | Screen flip (write `$FF8201`), then a busy wait for the **next** VBL; frame counter `$7180` +1; `$5301E` = VBLs since the previous frame end | `$5A8F2..$5A996` `0a3bcf5d…11bf` |

The substep clamp and the frame-end wait are identical modulo relocation to Damocles's:

| Piece | Damocles | MIII | SHA-256 (Damocles, MIII) |
|---|---|---|---|
| Substep clamp | `$59542` (reads `$51D22`) | `$5A4C2` | `6be1f2d5…ded0`, `9355ebe3…49fb` |
| Frame-end wait | `$59992..$599B8` (VBL `$51D98`, frame `$7AE8`) | `$5A952..$5A978` | `115447f0…3fbb`, `811e3914…69df` |

This is the structure [ADR 0049](../adr/0049-run-one-damocles-substep-per-tick-without-st-frame-cost.md) records for Damocles. The fall handler alone scales motion by `$5301E` (`$58E70..$58EAA`); it is not on these journeys.

### 50 Hz against 60 Hz

Offsets are VBLs after the rate's `B0`, from one run per rate and route. A 50 Hz column marked † uses a walk released at +4531 rather than +4646 ([why](#milestone-changes-and-d1-blockers)).

| Interval | 60 Hz | 50 Hz † | Scales per | Note |
|---|---:|---:|---|---|
| Reveal: count 64 → palette swap (32) → text | 32 / 64 VBL | 32 / 64 VBL | VBL | Enter consumed at `B0` |
| Elapsed-clock second | 50 VBL (all 380 ticks) | 50 VBL (all 380 ticks) | VBL | 405 s at +18996 in both. First tick at +28 or +33 is the accumulator phase at `B0` |
| Message bar, request → idle | ID message 251; script text 201; blank 51 | the same | VBL | The 37-VBL scroll-in is the shared machine's constant (static) |
| Night flip, `$70E4` → 0 | +11858 (sol), +11853 (sp) | +11862, +11859 | VBL (tested per frame) | Same game time within one frame |
| Timed script `$727E`/`$7280` | not armed | not armed | VBL (static) | The `$7280` watch never fired on either route |
| Opening-script text-to-text gaps, sum of 16 | 3,909 VBL | 3,737 VBL | Mixed | Per gap 1.00–1.13. Waits count VBLs; the interpreter takes one opcode per frame |
| Trip script: Start → first text | 157 (sol), 96 (sp) | 141, 80 | Mixed | Last spaceport text at 5,414 against 5,228 (1.036) |
| Call input → call flag | +14 | +16 | Frame | Next frame |
| Called taxi: set-down → dwell 2 | 267 VBL, 22 frames | 225 VBL, 22 frames | Frame | Call → set-down (1,253 against 599 VBL) depends on where the circulating taxi is, which is frame-driven since game start. It is not an interval |
| Admission pass spacing | 12 VBL | 10 VBL | Frame | First pass admitted at both rates |
| Start → lift-off | 10 | 9 | Frame | Next frame |
| Start → destination cleared, solicitor | 1,278 VBL, **112 frames** | 1,057 VBL, **112 frames** | Frame | ×1.209 |
| Start → destination cleared, spaceport | 5,475 VBL, **507 frames** | 4,604 VBL, **507 frames** | Frame | ×1.189 |
| Spaceport turns, in frames after Start | 112, 218, 370, 419, 507 | 112, 218, 370, 419, 507 | Frame | 60 Hz VBL: 1271, 2460, 3936, 4471, 5475. 50 Hz VBL: 1061, 2058, 3298, 3760, 4604 |
| Destination cleared → dwell 2 | 225 (sol), 198 (sp); 22 frames | 180, 160; 22 frames | Frame | Descent table |
| L input → passenger cleared | +1 / +5 | +3 / +6 | Frame | Handled in the next frame |
| Walking, 650 VBL | 2,880 units | 3,498 units | Frame | 48 units per 8-substep frame |
| Endpoints and cash | R1's XYZ, `005100900000` | identical | — | All four runs |

The **event order within each mechanism is unchanged**:
- the same messages in the same order;
- the same turns and the same route;
- WE'VE ARRIVED `$25` attempted when the destination clears;
- accepted at the solicitor and refused at the spaceport, at both rates;
- exit only at dwell 2.

The **order between mechanisms changes**:
- **Solicitor.** At 60 Hz the trip script's closing blank (+1,131) precedes arrival (+1,278). At 50 Hz arrival (+1,057) precedes the blank (+1,314).
- **Spaceport.** At 60 Hz all 24 trip-script messages (texts and blanks) have been requested before arrival. At 50 Hz four are requested after it: +4,681, +4,756, +4,978 and +5,228, including PRESS 'B' TO BOARD THE SPACECRAFT. By then the taxi has settled, at +4,764.

**Wall time.** A frame costs the same CPU cycles at both rates, so the frame-counted journey takes the same real time at both rates. The solicitor's Start → dwell is 1,503 VBL = 25.0 s at 60.04 Hz, and 1,237 VBL = 24.7 s at 50.05 Hz. The spaceport's is 94.5 s against 95.2 s. What differs is everything counted in VBLs. At 60 Hz the game clock reads 30.1 and 113.5 game seconds for those rides; at 50 Hz it reads 24.7 and 95.3. Only at 50 Hz do the game's own seconds, motion and wall time agree.

### Frame distribution at 50 Hz and what drives it

Mean VBL per frame and range, by phase. **Busy** is frame work in VBL units: loop top to the frame-end wait, plus flip to the next loop top. Busy was measured on the solicitor route at 50 Hz and on both routes at 60 Hz; — marks the unmeasured spaceport column.

| Phase (offsets) | 60 Hz frame | 60 Hz busy | 50 Hz frame | 50 Hz busy |
|---|---|---:|---|---:|
| Room, before call (0–1296) | 11.8 (10–14) | 11.4 | 9.65 (9–11) | 9.3 |
| Called, waiting (1296–3996) | 12.0 (10–14) | 11.5 | 10.0 (9–12) | 9.8 |
| Walking out (3996–4650) | 10.6 (8–13) | 10.1 | 8.5 (7–11) | 8.0 |
| Aboard, before Start | 12.0 (12–13) | 11.5 | 10.0 (10–11) | 9.6 |
| Ride, solicitor / spaceport | 11.4 / 10.8 (8–16) | 10.8 / 10.3 | 9.4 / 9.1 (7–13) | 9.0 / — |
| Dwell at arrival | 9.45 / 9.0 | 8.75 / 8.6 | 7.5 / 7.8 | 7.2 / — |
| On foot after exit | 6.6 / 6.8 (6–9) | 6.1 / 6.4 | 5.5 / 5.9 (5–8) | 5.1 / — |
| All frames, solicitor / spaceport | 9.54 / 9.72 | | 7.74 / 8.21 | |

What drives it:

- **Scene cost.** A frame is its CPU work rounded up to the next VBL boundary. The wait averages 0.2–0.7 VBL. The work is the same in cycles at both rates: in the room, 11.39 × 133,604 = 1.52 M cycles against 9.27 × 160,256 = 1.49 M cycles. It varies about 2× with the scene, from the room to the street after exit. It also varies with the **view**. A stick turn aboard makes later frames cheaper: at the same VBL the taxi is about 10 service calls further along its route than in the unturned run. Cadence is therefore a function of where the player looks, not only of place.
- **The VBL handler.** It costs 2,550–4,700 cycles per VBL, 1.6–2.9% of a 50 Hz field (2.2–3.5% at 60 Hz). The sound programmes inside it take 104–936 cycles. They are small, but frames end within a VBL of a boundary. That is why R3 saw resetting the sound vector move transitions by up to ±18 VBL.
- **Raster phase.** As R3 found, where the loop top falls in the field decides which side of a boundary a frame ends on. It shifts frames by one VBL. It is emulator state and not portable.

### Fixed-cadence sweep

This is a **synthetic probe**, not natural play. The 50 Hz `B0` is restored, and the frame-end wait `$5A952` is redirected to a research routine at `$F0000`, which is zero in all captures. The routine waits until N VBLs have passed since the previous frame end, then rejoins at `$5A960`. The program's own code is otherwise unchanged. Walking is released after 61·N VBL, so each run stops about the same distance from the taxi, and B follows 50 VBL later if that is later than +4696. Frames are N wherever the work fits: at N ≥ 10 the mean is within 0.05 of N. At 8 and 9 the work sometimes exceeds N, giving means of 8.5 and 9.2–9.3.

| N (VBL per frame) | Solicitor ride | Spaceport ride | WE'VE ARRIVED, solicitor | WE'VE ARRIVED, spaceport |
|---:|---:|---:|---|---|
| Natural 60 Hz | 1,278 | 5,475 | shown | refused |
| Natural 50 Hz | 1,057 | 4,604 | shown | refused |
| 8 | 1,013 | 4,500 | **refused** | refused |
| 9 | 1,059 | 4,759 | shown | refused |
| 10 | 1,136 | 5,131 | **refused** | **shown** |
| 11 | 1,231 | 5,590 | shown | refused |
| 12 | 1,343 | 6,086 | shown | **shown** |
| 14 | 1,567 | 7,100 | shown | **shown** |

**Exactly fixed cadence ([#642](mercenary-iii-taxi-cadence.md)).** These patched runs are not exact at 8 and 9, and not strictly exact above. #642 re-ran the probe with the wait routine plus a faster emulated CPU, so every frame is exactly N (checked at `$5301E`). It also derived the outcomes from a rule-level calculation. Both give:

| N | 8 | 9 | 10 | 11 | 12 | 14 |
|---|---|---|---|---|---|---|
| Solicitor, spaceport | refused, refused | **refused**, refused | refused, **refused** | shown, refused | shown, shown | shown, shown |

The bold cells are where this sweep differed: its solicitor arrival at 9 (ride 1,059 VBL) came after the text hold that an exact 9 (ride 1,008) hits, and its spaceport arrival at 10 was shown where an exact 10 refuses it. Only **11** reproduces both baseline outcomes.

Rides are 112 and 507 frames at every N. Endpoints are identical and exit succeeds in every run. The arrival outcome is not monotonic in N. It depends on whether the frame-timed arrival lands inside a VBL-timed text hold (201 VBL) or in one of the short gaps between holds. The baseline outcomes are therefore an artefact of ST scene cost, not a rule the program applies.

### Cadence options for D1

All three options keep game time as 50 VBL per second. The case for **50 Hz over 60 Hz** is:
- the game's clock constants count 50 VBL per second;
- the program never programs the sync mode;
- the Damocles lab measured the UK release's PAL machine at 50.05 Hz;
- at 50 Hz game seconds equal wall seconds, while motion (CPU-bound) is unchanged.

The PAL lineage of this particular STX is not independently established ([integration report](mercenary-iii-integration.md#pinned-baseline-and-source-inventory)), so 50 Hz is derived, not recovered.

1. **Fixed-cadence emulation.** Each frame is a constant N ticks. Frame-counted rules run exactly in frames, VBL-counted rules exactly in ticks, and walking runs `clamp(N, 4, 8)` substeps per frame.
   - For: it is deterministic, it restores exactly (R3's raster phase is not portable anyway), and it matches the shape of Damocles's accepted fixed policies (ADR 0049, ADR 0051).
   - The sweep shows N matters. N = 9 and N = 11 reproduce both baseline arrival outcomes. At N = 9 the rides come within 0.2% (solicitor) and 3.4% (spaceport) of the natural 50 Hz durations. N = 11 is 16–21% slower.
   - Risk: the race is narrow. The patched N = 9 runs are not strictly fixed (mean 9.2–9.3), so an exact-9 port could still land differently.
2. **Measured cadence.** Replay the ST's per-scene frame lengths, for example the 50 Hz phase means above.
   - For: it would reproduce natural durations on the recorded paths.
   - Against: it is an authored per-scene rate that nothing recovered supplies, which is the reason ADR 0049 rejected it for Damocles. It changes with view as well as place, and it has no values for unrecorded scenes.
3. **Game-time authority with scaling.** Convert per-frame rules to per-tick rates, for example 1,024 units per service call ÷ mean frame.
   - For: journey durations follow a single measured mean.
   - Against: it breaks every exact integer rule found here: the 112/507-frame rides, the 22-frame descent, the ten-pass admission window, eight substeps per frame and one script opcode per frame. No evidence supports a fractional rule.

**Recommendation: option 1 at 50 Hz with N = 9**, subject to one confirmation: compute both journeys' arrival outcomes for an exactly fixed 9 before writing timed acceptance tests. If that fails, N = 11 is the evidenced fallback. **Result ([#642](mercenary-iii-taxi-cadence.md)):** exactly 9 fails and exactly 11 passes; ADR 0058 adopts 11. Acceptance should then assert:
- frame counts exactly;
- VBL counts exactly;
- endpoints and within-mechanism order;
- the arrival outcomes the chosen N produces.

It should not assert the cross-mechanism interleavings that differ between the natural 50 and 60 Hz runs.

## 2. Arithmetic, tables and movement

**Float library: shared.**
- Float add `$4BD34..$4BDBE` (`f608e622…`) and the int-to-float normaliser `$4BDC6..$4BEE2` (`a4245d1d…`) are byte-identical at the same address in both titles. The log, exp and sine tables are too (integration report).
- Neither title has a multiply subroutine. Multiplication is an inline log/exp idiom (`#$64000`/`#$60000`), with 38 sites in MIII.

**Taxi route arithmetic: title-specific, integer only.**
- `$51DA8..$52030` and the pose follower `$5191C..$519A2` contain no table-indexed log/exp, no float call and no multiply or divide.
- Route motion adds signed word increments to the resident X/Z longs.
- The segment change `$51F40` sets one increment to ±speed and the other to 0, and sets the heading outright.
- The height tables are bytes written as longs to the 12 service residents' Y.

Floats appear only downstream, in the generic pose publisher `$59CE4`. There are no float cases on the route to extend the integration report's eight addition cases.

**Projection input: shared, runtime-matched.**
- The drawn-list builder `$54182..$5430E` (`2f123f16…`) is Damocles's `$53202..$5338E`, identical modulo relocation. The resident arrays are shifted by a uniform `$B8C`, and the draw-priority table `$542BC..$5430E` is byte-identical.
- Each key is `float(sqrt(dx² + dy² + dz²))` plus a priority byte: int-to-float, log square, two float adds and a log-halving square root.
- The Damocles port's `craftFloat`, `craftSquare`, `craftAdd` and `craftSqrt` reproduce **7 of 7** non-zero stored keys in MIII `B0` (60 Hz), `loaded.ram` and the 50 Hz `B0`, and 7 of 7 in Damocles `observed.ram`. The port uses the Catalogue exp table, which has the same `f21d7cf0…` hash as the MIII table. Entry 0 cannot be checked, because unused output rows also carry resident 0.
- The port also reproduces the **natural** admission proximities observed here:

  | Case | `$71DA:$71DC` |
  |---|---|
  | 60 Hz walk stop | `$000910DE` |
  | 50 Hz, 650-VBL walk | `$000A120E` |
  | 50 Hz, 535-VBL walk | `$00081BC8` |
  | Boarded | `$00051F7E` |

  The inputs are the traced player and taxi positions, with Δy = −63.

R1's "high word ≤ 9" is therefore the binary exponent of the distance: **under 1,024 units**. Damocles's ordinary boarding test is the same instruction ([matrix](#3-admission-and-boarding-matrix)), and the port boards within Euclidean 1,024.

**Motion against Damocles.**

| | MIII taxi passenger | Damocles lift ride | Damocles craft |
|---|---|---|---|
| Owner of position | The service. The follower `$5191C` copies taxi X/Z and Y + `$3F` once per frame, after the substeps | The player: the Mover runs through the ride, and a frozen region keeps the eye in the car ([lift ride movement](damocles-lift-ride-movement.md)) | The craft Mover, one pass per frame (ST) or per four ticks (port, ADR 0051) |
| Owner of heading | The player. The follower **adds** the route's heading delta, and turns are instant cardinal snaps | The player | The Mover |
| Clock | Service calls per frame, (`$6EAE` & 7) + 1, 1,024 units each | Substeps (ADR 0049) | Frame (ST) |
| Mover on the path | Foot Mover `$58D86`, `clamp(delta, 4, 8)` calls per frame throughout the journey (8.00 at 60 Hz; 7.5–8.0 at 50 Hz, where some frames take 7 VBL), selector/slot `$0001`/`$FFFF`. Aboard dispatch `$5A6B4` **never** (0 hits) | Foot Mover | Craft Mover |

A stick probe while boarded, before Start, tested this directly:
- Forward for 300 VBL left XYZ unchanged.
- Left for 100 VBL turned the heading from `$0100` to `$0060`.
- The offset stayed through the ride, the route's turns were added to it, and it survived the exit (heading `$FF60` on foot).

The endpoint was unchanged. **The Mover is on the taxi path only as the foot Mover whose translation the follower overwrites.** No craft Mover field, handler or pass is involved.

## 3. Admission and boarding matrix

Provenance key:
- **T**: Targ in `web/src`.
- **D**: `web/src/damocles/session.ts`.
- **R1**/**R3**: the reports.
- **S**: this report's static decode, from `B0.ram` and `observed.ram`.
- **N**: this report's natural runs.

| | Targ craft | Damocles craft | Damocles seatable | MIII ordinary craft (`$55474`) | MIII taxi passenger |
|---|---|---|---|---|---|
| Trigger | B, `reach('board')` (`shell/input.ts:434`) | B, `session.board()` (`damocles/boot.ts:366`) | Same B | B, mailbox `$30` | The same B handler's fallback `$5546C` |
| Candidate | Nearest drawable in a reach cube (`interaction/index.ts:78-104`) | Port: Euclidean < 1024, not slot 74 (D:1397-1435). ST: render-list minimum, not offset `$128` (S `$535C6`) | As craft | Render-list minimum `$71DA`/`$71DE`, not `$128` (S `$545D6`, identical modulo relocation) | The same words, read on each passenger pass (R1) |
| Distance gate | Reach cube | Exponent ≤ 9 on ST (S); < 1024 in port | As craft | Exponent ≤ 9, i.e. < 1,024 units (S, N) | Exponent ≤ 9 (R1; N: 1,154 units fails) |
| Deferral | Immediate | Immediate, silent `rts` | Immediate | Immediate on success; every silent failure arms `$6EB4` = 10 (S) | Ten per-frame passes: 12 VBL apart at 60 Hz, 10 at 50 Hz (R1, N) |
| Index / class gates | Slot < 8 (`interaction/index.ts:87`) | Index 1–22, region bit 14, model guard (D:2996-3031) | Chooser admits slots 14–22; only 14, AUTHOR'S CHAIR, is boardable (`catalogue/data.ts:595`) | Index 1–27 **excluding 16–27**; model word `$8001`/`$800D` with byte 3 = `$40` (S) | Index 16–27, below 20 when rate `$6CBC` < 0; flag bit 6 of `$71CC`; service counter 2–30 (R1) |
| Keys and access | None; `boardKey` is a scancode | Paired object at slot + 178 carried (`data.ts:620-628`, D:3013-3027); not consumed | Keyless | `$66E6(a0)` bit 7. `$66E6` − `$641E` = 178 × 4, so it is plausibly the same carried-pair test (S, lead); indices 1 and 12–15 keyless | Active TAXICARD panel plus call `$6EC0` = 1. TAXICARD `$68` is not shown to be a Vehicle Key (R1, S) |
| Call / panel | — | — | — | Success clears call `$6EC0` (S `$55572`) | Call needs an active card, `*`, rate < 0, `$7122` = 1 and reveal 0 (R1) |
| Refusal order | Aboard; nothing in reach; not a craft (`interaction/index.ts:159-168`) | Death, then 8 checks (D:2985-3031): reach, instance/slot 0, region bit 14, slots 1–22, on foot, not VOID, key, model | Same path; key passes | Proximity, candidate, bit 14, index ≠ 0, index < 28, slot < 0, context ≠ `$78`, **not 16–27**, key, model, then hire/cash branches (S) | Countdown, counter, proximity, candidate and flag, index and rate, slot < 0 and context ≠ `$78` (R1) |
| Refusal messages | Silent | Key failure only: VEHICLE KEY REQUIRED, or string 22 for slot 7 (D:345-348) | None | Message 3 on key failure; `$0C` when cash is 0 for indices 2, 6, 12–15 (S; texts unresolved) | None; the window expires (R1) |
| Pose aboard | Targ Mover over the slot's Craft Parameter Block | Craft Mover per pass (D:2592) | Mover runs for the chair's `flying` slot; seated flight untested on ST | Selector `$7142` = 0, slot `$7144` = index; aboard dispatch `$5A6B4` (S) | Service owns position; player owns yaw (N); `$7142`/`$7144` = `$0001`/`$FFFF` (N) |
| Leave | L when grounded (`session/index.ts:1281-1327`) | L: aboard, contact, not sea, not VOID, all silent (D:3068-3082); also on touchdown | Same | `$5569E`: slot ≥ 0, contact `$715E`, `$6F56` ≥ 0, context ≠ `$78` (S) | Negative slot → `$5573C`: passenger, rate < 0, counter **exactly 2**, else `rts` with nothing queued (R1, R3) |
| Save | `boardedCraft` byte (`session/save.ts:705,730`) | Occupancy plus craft words, schema 23 (`damocles/save.ts:185`) | Same | No code | No code; R3 inventory |

**MIII `$55474` against Damocles `$54302`.** They are neither byte-identical nor identical modulo relocation.

What they share:
- Checks 1–7 are the same instruction sequence with relocated RAM, as are the key test, the chooser skeleton, the model byte-3 test, the seat body and the stop preset.
- The candidate writers match instruction for instruction: MIII `$545D6..$545F0` `8651504d…` against Damocles `$535C6..$535E0` `b6b5fa23…`.
- So do the ordinary leave handlers.

Constants differ: the slot bound is 28 against 23, and the keyless threshold `$30` against `$38`.

MIII inserts:
- the 16–27 service exclusion, which hands service residents to the passenger window;
- word-offset model indexing and `$800D`;
- hire and cash branches;
- an immediate service seat for indices 12–15;
- the call-flag clear;
- a negative-slot passenger branch in L, where Damocles has `rts`.

Every silent MIII failure arms the passenger countdown, where Damocles returns. Damocles alone has the slot-7/message-22 arm.

Slices:

| Title | Range | SHA-256 |
|---|---|---|
| MIII | `$55458..$555C0` | `7b26d1ed…e806` |
| MIII | `$5569E..$5573C` | `b7cd0bfc…c429` |
| MIII | `$5573C..$55788` | `618507ec…952d` |
| Damocles | `$542E0..$543BE` | `9f44e304…1c26` |
| Damocles | `$5449C..$54514` | `4233e4fc…1892` |

This is static evidence. No natural ordinary-craft boarding was traced in MIII.

## 4. Classification of compared mechanisms

Methods:
- **Same address**: byte-identical at the same address.
- **Relocated**: byte-identical at a shifted address.
- **Mod reloc**: instructions align one for one, and differ only in absolute RAM or code addresses.
- **Aligned + inserts**: most instructions align, and one title has extra ones.

Damocles addresses are from `observed.ram`. MIII hashes are from `B0.ram` = `loaded.ram`.

| Mechanism | Verdict | Evidence and provenance |
|---|---|---|
| Log, exp and sine tables; float add; int-to-float | **Shared** | Same address (integration report; `$4BDC6..$4BEE2` `a4245d1d…`). Runtime: 8 add cases (integration), render keys and natural proximities through the port's functions (§2) |
| Render-list distance and priority key | **Shared** | Mod reloc: MIII `$541B6..$542BC` `4d87a514…`, Damocles `$53236..$5333C` `067d6fef…`. Priority table relocated `e8961847…`. Runtime-matched (§2) |
| Frame pacing: flip, wait for next VBL, frame delta | **Shared** | Mod reloc (§1). Behaviour: frames = work rounded up to a VBL, at both rates |
| Substep count `clamp(delta, 4, 8)` | **Shared** | Mod reloc (§1). MIII: 8.00 Mover calls per frame at 60 Hz, 7.5–8.0 at 50 Hz (N) |
| Taxi route, heights, pose follower | **Title-specific** | Integer only; no Damocles counterpart (§2) |
| Passenger admission window `$519A2` | **Title-specific** | R1 order. Fed by the shared candidate words and armed by the sibling B handler |
| Ordinary B / L handlers | **Sibling but distinct** | Aligned + inserts (§3). No MIII runtime |
| Craft Parameter Blocks | **Shared values, distinct tables** | Integration report: 28-byte matches, 10 against 16 entries. Not on the taxi path (§2) |
| Model table and draw dispatch | **Sibling but distinct** | MIII word offsets from base (`$545BC`), Damocles longs (`$535B0`). Same 16-slot header-op dispatch. `$800D` passenger form is title-specific: 18 MIII records use it, and it goes to the skip handler in Damocles. Slices MIII `$545AE..$5464C` `f8e56f9c…`, Damocles `$535A2..$5363A` `c861ea34…` |
| Sound: VBL vector call, walkers | **Shared** | Call MIII `$530FC..$5310E` = Damocles `$51E0E..$51E20` relocated (`15ee434b…`). Walkers MIII `$4CB54..$4CC48` = Damocles `$4C722..$4C816` relocated (`7b708a3f…`). Vectors at the same `$4BF54`/`$4BF58` |
| Sound programmes | **Mostly shared; taxi set title-specific** | Nine Damocles programmes recur mod reloc with equal periods, levels and counts: splash, transporter, alarm, C off, bump, blast, zap, Geiger, blown up. Taxi programmes `$4C25A..$4C630` `48551599…` have no counterpart. Damocles's spell and idle engine are absent. Heard equality unsupported (sound off) |
| Day/night terminator | **Shared arithmetic; MIII update path and content evidenced separately** | Mod reloc: MIII `$50B10..$50B64` `42c3dd43…`, Damocles `$50562..$505B6` `f773b25a…`. Angle pair `$5A27C..$5A2B6` against `$5935A..$59394`. [#646](mercenary-iii-taxi-night-sky.md) checks the MIII runtime rule: full long phase +rate per VBL, sampled longitude from cached `$70B4`, and cached latitude `$42C70`; taxi movement does not recompute them from current XYZ. Day is sampled after the frame wait. Do not generalise the observed 50/60 Hz flip VBL equality or borrow Damocles stars/islands by relocation |
| Workspace builder, cell bind, cell-stream templates | **Shared, with MIII width and service adaptations** | Builder mod reloc, 181 of 182 instructions (MIII `$4F0F2..$4F30A`, Damocles `$4EB60..$4ED74` `048e3f04…`); MIII ends `jmp $51B82` (service installer). Ground reader and template op aligned 142 of 149 (`$56204..$563C4` against `$54E96..$55052`); the model copy is words, not longs. Slot binding not compared at runtime |
| Script VM dispatcher and branches | **Sibling but distinct** | Same gate order and branch encoding (MIII `$52B96..$52BB0`, Damocles `$51A28..$51A42`, mod reloc). MIII fetches bytes; 44 opcodes with a bound check against Damocles's 37. One opcode per frame in both (`$5A474` / `$594FA`); waits count VBLs in both (`$5312C` / `$51E3A`) |
| Script opcodes | **Overlap, not shared as a set** | Same: `$01`–`$07`, `$0A`–`$0F`, `$13`–`$15`, `$18`–`$1C`, `$20`–`$23`. Different: `$00`/`$1A` end, `$08`/`$09` disabled in MIII, `$10`–`$12` bit numbers against masks, `$16`/`$17` BCD against binary, `$1D`. Title-specific: `$25`–`$2B` (packed text, timed script, model swaps, taxi predicate). `$24` unsupported |
| VBL-timed waits and messages against frame-driven motion | **Shared structure** | Static as above. Runtime: VBL-exact at both rates, frame-exact motion (§1). Damocles side is static only |
| Message display machine | **Shared, title-specific tone and text** | MIII `$533A0..$53956` `fbd4277a…`, Damocles `$52380..$5293E` `141018fe…`: 401 of ~420 instructions align. Same 37-VBL scroll, 50/200 holds, and refusal when busy. Tone rule, screen base and packed text differ. A separate deferred path exists in both, so "not queued" holds for ID messages only |
| Incremental panel repaint, clock | **Shared** | Digit renderer MIII `$531D2..$53244` `18009926…`, Damocles `$521B8..$5222A` `4a41391d…` (29 identical, 7 address-only). Glyphs relocated `3d2a95fc…`. Count-up and day rollover title-specific |
| Incremental repaint, cash and other fields | **Unsupported** | Damocles has no cash field; the MIII `$4E778` path not compared |
| Elapsed clock against impact clock | **Title-specific meaning, shared renderer** | Integration report; R1 |

## Milestone changes and D1 blockers

**Blocks D1:** nothing. **D1 must decide:** frame rate and cadence ([options](#cadence-options-for-d1)). The confirming probe is to run both journeys' recovered route and script rules at an exactly fixed N and check the two arrival outcomes. If the result is ambiguous, repeat this report's patched-wait sweep at that N. D1 chose 50 Hz with a provisional 9; [#642](mercenary-iii-taxi-cadence.md) ran the probe, and 11 is the confirmed cadence.

**Changes to the milestone's acceptance wording:**

1. **Admission by position, not time** (R1 criterion 2). The 650-VBL walk is a 60 Hz recipe. At 50 Hz it overshoots the taxi by 1,154 units, the proximity exponent becomes `$0A`, and all ten passes fail. A 535-VBL walk (stop 440 units short) admits on the first pass. State approaches as positions, and test the recovered exponent-≤ 9 gate.
2. **Cross-mechanism order is cadence-dependent** (R2 criterion 5). Keep "a refused ID message is dropped, not queued" as a rule test. Assert the spaceport refusal and the solicitor acceptance only for the chosen cadence, after the confirmation above. Do not assert:
   - the solicitor's closing blank relative to WE'VE ARRIVED;
   - how many spaceport texts precede arrival.
3. **The passenger owns yaw** (R1 criterion 4). Turning aboard is original behaviour. The route's heading deltas add to the player's heading, and the offset survives exit. Walking aboard does nothing.

**Not blocking; open probes:**
- A natural MIII ordinary-craft B through `$55474`, to confirm the static order.
- Identities of indices 2 and 6 (hire `$6EC6` = `$1111`) and 12–15 (immediate service seat).
- The texts of messages 3 and `$0C`.
- The `$66E6`+178 key pairing with a carried key.
- PSG capture at 50 Hz for the shared and taxi programmes.
- The runtime day flag against the closed form.
- Slot binding after a cell bind.
- The remaining header-op handlers.
- Whether an ordinary B during a pending call clears the call.

## Reproduction

A checkout does not contain the harness. It can be rebuilt from these steps with the pinned media.

1. **Aligned `B0`.** Cold boot with the integration configuration.
   - At VBL 10, run `w $ff820a $02` for 50 Hz, or nothing for 60 Hz.
   - Arm `b pc = $59fba :trace :once :quiet :file t0.ini`.
   - `t0.ini` arms `b VBL > "VBL+1254" :trace :once … vbl.ini`.
   - `vbl.ini` arms `b pc = $5a41a … ck.ini`.
   - `ck.ini` runs `savebin`, then `statesave B0.sav`, then `quit`.
   - As a control, boot with `--country uk` instead of the poke.
2. **Trajectories.** Restore each `B0` with R3's sidecar recipe. For 50 Hz, the sidecar's first lines are `w $ff820a $02` and then Enter (`w $56726 $72`). Apply the offset schedule [above](#baseline-and-method) at loop tops. For 50 Hz journeys, release the stick at +4531.
3. **Watches.** Arm each as `b ($ADDR).w ! ($ADDR).w :trace :quiet :file cb.ini` (`.l` for `$6FCE`/`$6EDA`, `.b` for `$6EBC`).
   - Give each callback a distinct tag (`e $A0nn`), then `e VBL` and an `m` dump.
   - PC traps: `$55A1A` and `$55B00` with `r`; `$5A952`, `$5A960` and the trace at `$5A420` with `e CycleCounter`.
   - Hatari prints counters above 2³¹ as `#u/-s (dec)`. Parse both forms, or later frames drop silently.
4. **Frame counts.** Read `$7180` in the per-frame trace. Count frames between the first loop tops at or after two event VBLs.
5. **Mover path.** Add traps at `$58D86` (dump `$7142..$7146`), `$5191C` and `$5A6B4`, and count per frame. For the stick probe, write `$7056` = 1 at +5000..+5300, `$04` at +5350..+5450, 1 at +7000..+7100 and `$04` at +16500..+16600.
6. **VBL cost.** Add traps at `$53098`, `$530FC`, `$5310C` and `$5317A` with `e CycleCounter`.
7. **Cadence sweep (synthetic).** In the 50 Hz sidecar, before Enter, write the routine below at `$F0000`, then write `4ef9000f0000 4e71 4e71 4e71 4e71` at `$5A952`. Release walking at +3996 + 61·N, and press B at max(+4696, release + 50).

   | Bytes | Instruction |
   |---|---|
   | `303900053096` | `move.w $53096,d0` |
   | `3200` | `move.w d0,d1` |
   | `92790005301c` | `sub.w $5301c,d1` |
   | `0c41 NNNN` | `cmpi.w #N,d1` |
   | `6dec` | `blt $F0000` |
   | `4ef90005a960` | `jmp $5a960` |
8. **Proximity.** Recompute keys with `craftFloat`, `craftSquare`, `craftAdd` and `craftSqrt` from `web/src/damocles/craft.ts`, using the Catalogue's exp table. The inputs are resident-array minus eye deltas, for list `$7422` (MIII) or `$7D18` (Damocles). Compare against the stored 6-byte records at `$4AF0` or `$8F5A`. Recompute the natural stops from the traced player and taxi XYZ, with Δy = −63.

Research used Python 3.13, Capstone 5.0.7 (M68K 68000, big-endian) and Bun for the port functions. A 19,000-VBL trajectory with watches takes about 50–60 s.

### Artifact identities

Paths are under ignored `restricted/mercenary-iii-636/`. Reproduction depends on the pins and procedures above, not on these files.

| Artifact | SHA-256 |
|---|---|
| `boots/ntsc-lpg96psr/B0.sav` (60 Hz, VBL 5994) | `dfe11736b08e21d278cb77436960ce9c64b8da11dfff4bd0947dbdea7a0f3dee` |
| `boots/ntsc-lpg96psr/B0.ram` | `1b0774d57c38cfb3606ebc97370588cdb25612392dc2177ede399f9ec4157d7e` |
| `boots/pal-fmctgqvg/B0.sav` (50 Hz, VBL 5204) | `72bbf60bdd341dffd0d05c3d7c46f631b56fd89dc16fe0b52751c46fffb423e8` |
| `boots/pal-fmctgqvg/B0.ram` | `5d2e4911ace4e86794f15a44ef2c1e781dcbe5e17d2e45a124d7e5bf0cfed7a8` |
| `boots/uk-4x47tewb/hatari.log` (`--country uk` control) | `dd513c9140dfff0400bda57f885b8c7d990f56cc36d6ee1e8a080d24968208c6` |
| `runs/ntsc-sol-g3u5zc9e/hatari.log` | `10a8b0343c0d85599872e8c18381178b0a19d5b3215b9f7fdab654bb291e1f02` |
| `runs/ntsc-sp-g_g8riw9/hatari.log` | `4c0f40cdb058de659e4adbf5a762fd848431b4f4c8619ac6c3c835fb032e3301` |
| `runs/pal-sol-w4531-w2u7qwrr/hatari.log` | `cf87480c76314eb3c540c9606c3902a1e5606f1be4c25366a8e26fd98f8466e3` |
| `runs/pal-sp-w4531-uzrnshh2/hatari.log` | `415b56f0f461eea648aff83c91c6080eb7c370a5a56841d576cf284fb99a2cd8` |
| `runs/pal-sol-lf9_hiwc/hatari.log` (50 Hz, 650-VBL walk, not admitted) | `6f9cda4b6d9d7b32090f6c8c89cb55ee576c3fdf4299efe18492220a07f17612` |
| `runs/ntsc-sol-x-fs4m4ggw/hatari.log` (Mover path) | `98c2ff1c56dff361ca78872cedae0d40aebf7d4c618de92cbb86273919d20674` |
| `runs/pal-sol-x-6ltemcrn/hatari.log` (Mover path, 50 Hz) | `bcb99131f9e434067f6873d71149db2dcddc8d216c0445ba8e58a31fbb330ec7` |
| `runs/ntsc-sol-xs-bzhfj38w/hatari.log` (stick aboard) | `f0b9d877f71ceab408d598e5f09dddbc348e6c52091478310bee2b86cd0659ac` |
| `runs/ntsc-sol-vblcost-rj0p0odk/hatari.log` | `b38afd4bb9f9d086718bb2d1af592dcd29cad18be666217a4ba9f0ed592876cb` |
| `runs/pal-sol-vblcost-ull5zz2u/hatari.log` | `0a2aead0a28c34b660cc47a8be66bad5e6a3d7008959dcda5bf1a69f0939c16b` |
| `runs/ntsc-sol-night-y25juxtg/hatari.log` | `5147d38355304c3cd8b73df330af2cf3dcb98031043a007c8592f1217a039ecc` |
| `runs/pal-sol-night-tpt8xnm7/hatari.log` | `ab0b828b4ef8e79df4cc747840155738bd1c4a1f9982fe5f440f8ec75107de4b` |
| `runs/cad9-sol-mklxpx0q/hatari.log` | `52a55f96c70916fd504468b69c6c762b7afc8d30deb193282a0e666e293489a0` |
| `runs/cad9-sp-j5v6t0n6/hatari.log` | `31a51926a14d3d808fb8c9730a53a976638a59f649be180839ed91c4bf253a2a` |
| `runs/cad10-sol-0iqaew2b/hatari.log` | `97b5536140fb8b88d386e499545bb4c6855951353ec32aef8bfe4d7a934e36f4` |
| `runs/cad10-sp-0t8u0zeo/hatari.log` | `7a8c8f057ffcfa97807107779d26aada095ca60035c046aee0f33ec8c0c0ce56` |
| `runs/cad11-sol-28tou7d8/hatari.log` | `afda608baaf47b652fbaf48d8e2eb4fa6898003d3e453bbb44a036eb29a1a104` |
| `runs/cad11-sp-l_uxde3s/hatari.log` | `2658d773f78659003adbfa607fb329629e0df4c82c06f620194e58dd3628863e` |
| `runs/cad8-sol-zv0o5qno/hatari.log` | `1b64a1bd0e86dc3458e8d2ebddc4be370ebd3f219c28afe1451c019e0b123bc8` |
| `runs/cad8-sp-z9km_qlt/hatari.log` | `c59e30bd413118b7fabeaad99d12cd148ef357ffea1e7bf3e928a5f0b038b173` |
| `runs/cad12-sol-z0xvu093/hatari.log` | `bc0a6ddedbbafef84225a7a654c3fe3feac3696df2608eb1708bc97b393c2bbf` |
| `runs/cad12-sp-jrcb6mq3/hatari.log` | `63c3c15b8ecf5f60cc5a828dfae1f591e9998b66df35681b245bb966c334e084` |
| `runs/cad14-sol-2r06ijyr/hatari.log` | `8d47f240599b673f8d940aa4f5d235bd3ad486538538c13a8e9bbadd0d804fcb` |
| `runs/cad14-sp-4jkdmwoi/hatari.log` | `bd7e84f197160a675ef2350a38e0861bce8d0925a1f24180e679501287eefc6a` |
| `static/prox-cases.json` (render-list inputs, four images) | `2edfa63fa529da58099b8d0e9d973c9d06d20c1251fa5e30e64dce17032224dc` |

Research verification comprised:
- both journeys at 50 and 60 Hz from aligned checkpoints, plus a `--country uk` control boot;
- the rejected 650-VBL approach at 50 Hz;
- Mover-path, stick, VBL-cost and night-flip instrumented runs;
- a twelve-run fixed-cadence sweep;
- the port-function recomputation over four RAM images and four natural stops;
- static comparisons of every classified row.

No original program code, RAM, snapshot or image is included in tracked files. Application tests are not relevant to this documentation-only change.
