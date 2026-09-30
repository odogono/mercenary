# Mercenary III: exact fixed taxi cadence for both arrival outcomes

Research for [#642](https://github.com/odogono/mercenary/issues/642), 2026-09-30. This is the confirmation gate that [D1](mercenary-iii-taxi-milestone-review.md) (#638) and [ADR 0058](../adr/0058-run-mercenary-iii-at-50-hz-with-a-confirmed-fixed-frame-cadence.md) set before timed implementation acceptance. It extends the pinned **Mercenary III research baseline** of R1–R4 ([journeys](mercenary-iii-taxi-journeys.md), [content](mercenary-iii-taxi-content-presentation.md), [persistence](mercenary-iii-taxi-persistence.md), [shared mechanisms](mercenary-iii-shared-mechanisms.md)), not Damocles **Working Authority**.

It proposes no application or runtime code, Data Payload, payload schema or Save format. Original media, RAM, snapshots and disassembly stay ignored under `restricted/mercenary-iii-642/`, following [ADR 0002](../adr/0002-separate-rom-research-from-implementation.md). The tracked calculation [`mercenary-iii-taxi-cadence.py`](../../research/damocles-st/scripts/mercenary-iii-taxi-cadence.py) is research-only. It is authored from the documented rules below and carries no original bytes, text or RAM.

## Outcome

1. **Exactly nine fails.** At nine ticks per frame the solicitor's WE'VE ARRIVED is **refused**. The trip script's second text is still held: the arrival falls at tick 1,008 after Start and the bar is busy until tick 1,029. The spaceport arrival is refused, as required. R4's patched nine-VBL runs showed the solicitor message only because their frames averaged 9.2–9.3 VBL. Their ride took 1,059 VBL and arrived after the hold ended.
2. **Exactly eleven passes both outcomes.** At eleven the solicitor's arrival at tick 1,232 finds the bar idle, 70 ticks after the closing blank (accepted). The spaceport arrival at tick 5,577 is refused, 113 ticks inside the last text's hold.
3. **Two independent methods agree at every tested cadence.** They are the rule-level calculation and an exact-cadence run of the original engine, compared at N = 8, 9, 10, 11, 12 and 14. In every exact run the game's own frame delta `$5301E` equals N on every frame. The calculation also derives the 112- and 507-frame rides and the 22-frame descent from the route table, and R1's exact endpoints. It does not take any of them from a trace.
4. **The result is not a near-boundary race at nine or eleven.** The margins are 21, 111, 70 and 113 ticks, two or more frames each. The two engine clocks put each frame's logic 1–2 ticks (32 MHz) or 2–5 ticks (16 MHz) after its boundary, and give the same outcomes.

   In the calculation, random per-frame phase jitter of 0–2 ticks never changed an outcome in 2,000 trials per case. At 0–3 to 0–5, eleven still never flips, while nine's solicitor refusal flips in 0.1–0.9% of trials. The port must therefore run each frame's logic at a fixed phase relative to its ticks; the result is then exact.
5. **Eleven is adopted.** Following ADR 0058's rule, nine failed and eleven passed both outcomes. The calculation was unambiguous, so no further natural sweep is required. The exact-cadence engine runs already confirm it. No message gate was altered. The consequences are that rides are about 17% (solicitor) and 21% (spaceport) slower than natural 50 Hz, and on-foot walking runs at 48 units per 11 ticks ([durations](#duration-implications-of-eleven)).

## Baseline and method

The pins are R1–R4's:
- STX SHA-256 `4e8b74122910bcaa109b944eebb6f0ec18fdeb1175c34eea3c932d0e1b18b62c`
- EmuTOS `emutos206.img` `154803e3ff4851f3dc358b91b16d6b6110d187a81d8132ecb665af49878939d5`
- Hatari 2.6.1 Mach-O `05723606c75a1f0642395974abdce2cbbe48b0a09a747f65cdfca7ef9201e11a`

All three were verified before every run. The configuration is the [integration recipe](mercenary-iii-integration.md#cold-boot-and-controlled-probes). Every trajectory restores R4's 50 Hz `B0` (VBL 5204, `72bbf60b…23e8`, RAM `5d2e4911…d7a8`), with R3's sidecar method and R4's 50 Hz poke. Code and data slices were hashed from that `B0.ram` ([identities](#artifact-identities)). The frame-end slice equals R4's `0a3bcf5d…11bf`, and the shared wait routines equal R1's `f8f3910c…0086`.

**Method 1: rule-level calculation.** The recovered rules below were decoded statically from `B0.ram`, then reduced to a tick/frame model. The model counts ticks and frames from the Start frame. Its only inputs are recovered facts:
- the route cells with their call nibbles;
- the ascent and descent lengths;
- each trip script as opcode kinds, wait lengths and hold values;
- the message machine's timing.

It computes the ride, descent, endpoint, every message request and the arrival outcome at any N.

**Method 2: exact-cadence original engine.** This is a **synthetic probe**, not natural play. It uses R4's patch: the frame-end wait `$5A952` jumps to a routine at `$F0000` that waits until N VBLs have passed since the previous frame end, then rejoins at `$5A960`. R4's 8 MHz runs overran N on heavy frames. Here the sidecar's first line is `setopt --cpuclock 32` (16 as a control), so no frame's work reaches N. A snapshot restore brings back the snapshot's CPU clock, so the option on the command line alone had no effect; the first attempt was rejected for that reason. In all 16 runs `$5301E` is N on every one of 1,356–2,374 frames. The program's code is otherwise unchanged, and the faster CPU does not alter any VBL rule.

## Recovered rules

Addresses are hexadecimal; slices are listed under [artifact identities](#artifact-identities).

### Order within a tick and a frame

| Unit | Rule | Evidence |
|---|---|---|
| Tick (VBL `$53098`) | The message machine advances. If unpaused (`$70BC` = 0), the script wait counter `$7236` +1 | `$53110..$53134`, `$533DE..$53420` |
| Frame | Loop top: input handlers (Start sets `$6EBE` and starts the trip script), then the script interpreter `$52860` (one opcode), then the aboard path with the service loop `$518F0` | `$5A41A..$5A474`, `$5A6A2..$5A6B8` |
| Frame end | The flip, then the wait; frame end ticks are `$5301C`, their difference `$5301E`. The day/night test and other work follow the wait, **before** the next loop top | `$5A56A..$5A572`, `$5A8F2..$5A996` |

In the exact engine runs, the loop top fell 1–2 ticks after the frame-end tick, varying with the work that follows the wait.

### Service route (frames)

- **Batching.** Each frame makes `($6EAE & 7) + 1` calls of `$51DA8`. When that nibble is 0, it keeps calling while the taxi is outside the passenger's cell (`$71F6` = 0, set by `$59E90`), up to 16 calls. `$6EAE`'s low bits come from the upper nibble of each route point's second byte when the taxi crosses into that point's cell.
- **Motion.** A moving call adds the increments and `$400` to segment progress. A segment is 64 calls. The 32nd call crosses the cell edge, and the carry out of the 64th reaches the next point (`$51F40`). The point handler snaps the low position words, sets the cardinal heading and increments, and compares the point's location with the selected destination. A match clears Start and the destination, then attempts the arrival message `$25` through `$55B00`.
- **Heights.** Start arms the ascent (counter 1). Each call then reads one ascent height (13 heights and a terminator). At an intermediate point the counter is reset and the taxi keeps moving in the same call. At the destination, one height is read per call (20 heights and a terminator), then the counter goes 34 → 2, which is dwell.

| Route index | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Cell | (2,6) | (1,6) | **(0,6)** | (0,5) | (0,4) | (0,3) | (0,2) | (0,1) | (1,1) | (2,1) | (3,1) | (4,1) | (4,0) | (3,0) | **(2,0)** | (3,0) |
| Call nibble | 0 | 0 | 0 | 3 | 7 | 7 | 3 | 0 | 1 | 1 | 1 | 0 | 0 | 1 | 0 | 1 |

Solicitor stops at index 2 and spaceport at 14. Index 15 only decides the endpoint's snapped low words and route heading. In a nibble-0 cell a segment takes 31 single calls, one 16-call crossing frame, then 17 single calls: 49 frames. The calculation gives:
- **Solicitor:** 1 Start frame + 14 ascent frames + 2 × 49 = **112 frames**.
- **Spaceport:** **507 frames**.
- **Descent:** **22 frames** to dwell.

These match R4 at every cadence and every exact run.

Endpoints are computed from the cells, with cell (0,0) at X `$09DF`, Z `$042A` (the boarding pose). Both equal R1:

| Route | Endpoint | Route heading |
|---|---|---|
| Solicitor | `($09DF8080, $3F, $04308000)` | `$0000` |
| Spaceport | `($09E18000, $3F, $042A8080)` | `$0300` |

### Trip scripts and messages

The interpreter skips its opcode on any frame where the message bar `$723A` is nonzero. Every opcode takes one frame; the table gives the parameterised ones.

| Opcode | Effect |
|---|---|
| `$01` / `$25` / `$14` | Request a text (inline, packed, or from the table). The hold `$533D6` comes from the word at `$6FF46`, and `$723A` becomes 1 |
| `$02` | `$7236` = 0 |
| `$07` | Repeats every frame until `$7236` ≥ n |
| `$03` / `$04` / `$05` | Jump, call, return |
| `$19` | Store a word; here it sets the hold to 50 or 200, or a cabin parameter at `$6FF4A` |

The message machine takes the request on the next tick (`$723A` → `$FFFF`, count 0). It returns to idle on the tick whose count equals the hold, so request → idle is hold + 1 ticks. That is 201 for a text and 51 for a blank. An accepted ID message ran 251 in every exact run. `$55B00` returns without effect if `$723A` is nonzero: the refused arrival is dropped, not queued.

Both trip scripts are straight-line: calls, waits, holds and texts, with no data-dependent branch. Here W(n) is call, reset, wait n, return, and B is the shared blank (call, clear flag, hold 50, blank, hold 200, set flag, return).

- **Solicitor `$34` (`$703B5`):** W(100), cabin, text, B, W(150), W(150), cabin, text, then the closing blank routine and idle.
- **Spaceport `$33` (`$701E0`):** W(50), text, W(100), then 15 more texts and 8 blanks, with W(150) or W(100) between groups. The full reduction is in the calculation's `SCRIPT` table.

## Starting state, inputs and assumptions

**Inputs** (VBL offsets after `B0`, applied at the first loop top at or after each offset):
1. Enter at +0 and `*` (call) at +1296.
2. Hold forward from +3996 for **61 frames** (released at +3996 + 61·N), then B at max(+4696, release + 50).
3. `+` at +5596, plus a second `+` at +5896 for the spaceport.
4. Start at +6196, L at +15996.

**Approach by position.** At N ≥ 8, each frame runs `clamp(N, 4, 8)` = 8 substeps of 6 units. The player walks from Z `$043088D8` in 48-unit frames, with X `$09E18009` throughout. The run stops at Z `$04307D38`, 584 units short of the taxi at `($09E18000, $04307F80)`. At N = 11 and 14, a 62nd frame begins before the release, stopping at `$04307D08`.

Proximity is `$0009125C` (`$000913D8` for the 62-frame stop). Its exponent is 9, so the taxi is admitted on the **first** passenger pass at every cadence. This is the stop R1 recorded at 60 Hz. The 60 Hz 650-VBL recipe is not used.

**State at Start**, verified in all exact runs:
- The passenger is aboard at dwell 2 at the boarding point, with heading `$0100`.
- The destination is selected and the message bar is idle.
- The hold word is 200 (the first trip text runs 201 ticks).
- Only the idle script loop is active and the clock is unpaused.

The calculation starts here, with tick 0 = the Start frame.

**Assumptions** (the port must reproduce these):
- Each frame is atomic and runs after its tick's VBL rules, at a fixed phase.
- Within a frame, Start and script start come first, then one opcode, then service calls.
- The trip script's first opcode runs in the Start frame.
- A request made in a frame is visible to the arrival check in the same frame.
- Waits count ticks from the reset frame's tick.

## Results

| N | Calc: solicitor | Calc: spaceport | Exact engine (32 MHz) | Exact engine (16 MHz) | R4 patched sweep (8 MHz) |
|---:|---|---|---|---|---|
| 8 | refused | refused | refused / refused | — | refused / refused (mean 8.5) |
| **9** | **refused** (−21) | refused (−111) | **refused** / refused | **refused** / refused | shown / refused (mean 9.2–9.3) |
| 10 | refused (−11) | refused (−41) | refused / refused | — | refused / **shown** |
| **11** | **shown** (+70) | refused (−113) | **shown** / refused | **shown** / refused | shown / refused |
| 12 | shown (+165) | shown (+339) | shown / shown | — | shown / shown |
| 14 | shown (+341) | shown (+1143) | shown / shown | — | shown / shown |

A signed margin is the number of ticks between the arrival and the bar becoming idle: + means idle, − means still busy. Rides are 112 N and 507 N ticks, and dwell follows 22 frames later, in every calculation and every exact run. The exceptions are the 16 MHz spaceport runs, whose rides sampled as 4,564 and 5,578: one tick of phase. Endpoints equal R1 in all 16 exact runs.

**Event tables at the two candidate cadences**, from the calculation. Ticks and frames count from Start, and idle is the first tick the bar is free.

| N = 9 solicitor | Frame | Tick | Idle |
|---|---:|---:|---:|
| Text 1 | 16 | 144 | 345 |
| Blank | 42 | 378 | 429 |
| Text 2 | 92 | 828 | 1,029 |
| **WE'VE ARRIVED refused** | **112** | **1,008** | — |
| Closing blank | 118 | 1,062 | 1,113 |
| Dwell 2 | 134 | 1,206 | — |

| N = 11 solicitor | Frame | Tick | Idle |
|---|---:|---:|---:|
| Text 1 | 14 | 154 | 355 |
| Blank | 36 | 396 | 447 |
| Text 2 | 79 | 869 | 1,070 |
| Closing blank | 101 | 1,111 | 1,162 |
| **WE'VE ARRIVED accepted** | **112** | **1,232** | 1,483 |
| Dwell 2 | 134 | 1,474 | — |

**Spaceport.** At N = 11 all 24 trip messages are requested before the arrival. The last text is requested at frame 499 (tick 5,489, idle 5,690), and the arrival at frame 507 (tick 5,577) is refused. At N = 9 the last pre-arrival text is at frame 497 (tick 4,473, idle 4,674) and the arrival at frame 507 (tick 4,563) is refused. Four messages follow it, at ticks 4,707, 4,788, 5,022 and 5,283. Print every row with `--events`.

**Tick-for-tick comparison.** Each exact run's measured per-frame tick sequence was fed to the calculation. It reproduced every message request tick and the arrival tick in 13 of the 16 runs. The other three differ in one wait each, which ends one frame earlier or later because a tick fell between the sampled loop top and the interpreter. The run then resynchronises and its outcome is unchanged.

The interleavings between mechanisms differ with cadence, as R4 found: the solicitor's closing blank falls after the arrival at 9 and before it at 11, and the count of spaceport texts after the arrival is 4 at 9 and 0 at 11. Acceptance must not assert them.

## Duration implications of eleven

| Measure | Natural 50 Hz (R4) | Exact 9 | Exact 11 |
|---|---:|---:|---:|
| Solicitor Start → destination | 1,057 | 1,008 | 1,232 (+16.6%) |
| Spaceport Start → destination | 4,604 | 4,563 | 5,577 (+21.1%) |
| Solicitor Start → dwell | 1,237 (24.7 s) | 1,206 | 1,474 (29.5 s) |
| Spaceport Start → dwell | 4,764 (95.3 s) | 4,761 | 5,819 (116.4 s) |
| Admission window (10 passes) | 100 | 90 | 110 |
| Walking, units per second | about 300 in the street, 250 in the room | 267 | 218 |

Tick-counted rules are unchanged at any N: the elapsed clock, reveal, message holds, script waits and night flip. Frame-counted rules keep their exact counts but last N ticks per frame. Natural on-foot frames of 5–8 VBL give one substep per VBL. The fixed eleven-tick frame gives 8 substeps per 11 ticks, so walking is about 27% slower than natural street walking. This is a presentation consequence to accept or revisit, not a gate: acceptance states approaches by position.

## Changes recorded elsewhere

- **ADR 0058** now fixes eleven ticks per frame, confirmed by this report.
- **The milestone review** records the result against items 2 and 5 and the #642 gate.
- **R4's cadence section** marks its patched-sweep outcomes at 9 and 10 as superseded by the exact results.

I2 acceptance should assert, at N = 11:
- 112/507-frame rides and the 22-frame descent, i.e. 1,232/5,577 ticks to destination and 1,474/5,819 to dwell;
- R1's endpoints;
- the tick rules;
- solicitor WE'VE ARRIVED accepted and spaceport WE'VE ARRIVED refused and dropped;
- the within-script message order.

It must not assert the interleavings above.

## Reproduction

A checkout does not contain the harness or media. Rebuild it from R4's [reproduction](mercenary-iii-shared-mechanisms.md#reproduction) with the pinned media:

1. **Calculation.** Run `python3 research/damocles-st/scripts/mercenary-iii-taxi-cadence.py --cadence 9 11 --events`. Add `--jitter 2` for the phase check, `--json` for tables, and any `--cadence` list. No media is needed.
2. **Exact engine runs.** Restore R4's 50 Hz `B0`.
   - The sidecar's first line is `setopt --cpuclock 32`, then `w $ff820a $02`.
   - Write R4's wait routine with `cmpi.w #N` at `$F0000` and patch `$5A952`, then send Enter.
   - Apply the inputs [above](#starting-state-inputs-and-assumptions), with R4's watches.
   - Add `$5301C..$53020` and `$53094..$53098` to the per-frame trace. Check that `$5301E` = N on every frame before trusting a run.
3. **Outcome.** A `$55B00` trap with `D1 & $FF` = `$25` is the attempt. It is accepted if a `$723A` session starts on the same frame and runs 251 ticks.
4. **Replay comparison.** Measure ticks as `$53094` at each loop top, relative to the Start frame. Hatari's own VBL counter advances with it on every frame of all 16 runs.

Research used Python 3.13 and Capstone 5.0.7 (M68K 68000, big-endian). A 19,000-VBL exact run takes about 55 s.

### Artifact identities

Runs are under ignored `restricted/mercenary-iii-642/runs/`. Reproduction depends on the pins and procedures above, not on these files.

| Run (`hatari.log`) | SHA-256 |
|---|---|
| `x8-c32-sol-42abcoay` | `1957a924caf10c6e560d17e1e89165645dd02f989867036cccc5c70a5d5bc60e` |
| `x8-c32-sp-cehdnxtf` | `ccc01ce00e2c3a17130f629142573bcc5460cf9047a9ea6ad51b278bff08090e` |
| `x9-c32-sol-hu2z9rs1` | `ccb6723561e7f0879f65277e4d917c9edfa639d7969ba7ed14257110e1f07256` |
| `x9-c32-sp-379wdovc` | `dd03dfd627c99824a6f5f4fce94bd0d4e5db2a9e2cd734286574e6ae6a56786f` |
| `x9-c16-sol-5_07o0mj` | `5caf98659f210ed3e0e0b5c3f2c4d15e0893bb7fa7aec134ad38006b88f23c17` |
| `x9-c16-sp-by7pr8n8` | `d5d90018ed4300a5fe07ded178bfc942fd9377d93a8133a4aeff20cbd3f3318f` |
| `x10-c32-sol-zvmaxkkj` | `07fb5728125da098ca99bee5f0f2ab8d7d2dafe11f1794dcfa739dc2f5751f84` |
| `x10-c32-sp-gal9zpbd` | `634591e88c51883d458c72eda5d681e165eb47c2ce08130a8f900e095af47861` |
| `x11-c32-sol-v1nksbwb` | `20f154b87511c5d0b8e47712452fd234a41b6ed6f73fc37cf3ec070692796426` |
| `x11-c32-sp-hixesere` | `3c2237f2ff555872d8a92435635e8bcfeb60cb38f8bf9572962235a225bffc7c` |
| `x11-c16-sol-xtazbmb0` | `248e8c3d336c4f68dd9a016331c3d541eea36865cbe761b81f32eba5dccbbee8` |
| `x11-c16-sp-rzkcalz2` | `29b6d5ba59171013571d42d1be49481b871587f7f57d4830ba68c072b1a473c2` |
| `x12-c32-sol-lm3z3zcn` | `f79a041e75afaa393feab209605623337cf032b1dffc3583cc009c2ca827bd71` |
| `x12-c32-sp-ftnswxf8` | `08898de3f16f11f3c24836a27ceaf3174849c32401e334fb8a5b80009c97ea46` |
| `x14-c32-sol-r31klnuj` | `960a2c6c49c58d8efd14d15126dc026e210c07958bb9439e8e69e780f90efdd8` |
| `x14-c32-sp-htmc1r23` | `5cbc99ad0195221ddae57303e1f091963a474d1355061b777c3e06223d7fdab2` |

| Slice of `B0.ram` | Range | SHA-256 |
|---|---|---|
| Service loop, follower, admission | `$518F0..$51A10` | `db124f4d193b277ca1ea4c8ebc184bda37624358e75833eea20186e56722069e` |
| Route motion, heights, next point | `$51DA8..$52030` | `d06c6b4767533499cb328f688579e5c744d849e558f4b22872e3dd99f5564449` |
| Height sequences | `$51CA2..$51CDA` | `43c569b9d7c990bb58f7765aa315f488e7a5119960597f0b16b8624c774e5f52` |
| Taxi definition and route | `$41F18..$41F58` | `44c095d23f33c8bcaae37bf233dcccfc9a8b655579d4a8c25e55838cfdf10c5a` |
| Interpreter dispatch, ops `$01`–`$07` | `$52860..$52C20` | `ff5e7b93dc206f240471ef76fa09811bf111def190ab16fbf8d5722653a0eb41` |
| Packed and table text ops | `$52AC0..$52B22` | `d44abad712da15961a98d7b3c15abfd93633221c9aeb14901cd0b683720dd7eb` |
| Message machine start/idle | `$533DE..$53420` | `ba3acef545cfd5e71f032c29b36b350d8067c8316c4a5971449ffba6c245c9d2` |
| ID-message helper | `$55B00..$55B6A` | `ec4a3adad4de654661c94a704925d482a923ab96840eee6529947289376cfcb0` |
| Script start | `$55A1A..$55A7E` | `abb58e4793a6d638b13b4e4b6cd9a8ea3c5c19b3112a0a4ad671cdbb75801432` |
| VBL counters | `$53110..$53134` | `1c0e87a33c2890134a5d9c2a15faef7a9bfa6409d909e06f65f092117de418af` |
| Frame end | `$5A8F2..$5A996` | `0a3bcf5df87527bd86a2f814dd3d7de3ac018555f9a69f97f26ca9e4750c11bf` |
| Solicitor trip script `$34` | `$703B5..$7040D` | `c62e4ce8766f70846ac60f1a3ac57f4002c336ed829197f6bbeccdd750c41a2a` |
| Spaceport trip script `$33` | `$701E0..$703B5` | `bcf4a43bd1a8de627a7036ea7843a09eb6ea07b5df62ecbd7daf3aa23dcdc67c` |
| Shared waits and blanks | `$766BF..$76721` | `f8f3910c3f570f74030c6da3cf6fd44ab472139e41535c89b4601e7e457a0086` |

Verification comprised:
- the calculation at six cadences;
- 16 exact-cadence engine runs, with the frame delta checked on every frame;
- a tick-for-tick replay of each run through the calculation;
- a 2,000-trial phase-jitter check per case, at spreads of 0–2 to 0–5 ticks.

No original program code, RAM, snapshot, image or text is included in tracked files. Application tests are not relevant to this documentation and research-script change.
