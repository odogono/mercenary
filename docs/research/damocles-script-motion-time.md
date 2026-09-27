# Damocles script VM, occupancy, flight, and time

Working-Authority Evidence for how Damocles drives game logic, walk-or-boarded
state, craft/space motion, and the comet deadline clock in the Atari ST Working
Authority. Inventory-level research note for
[#81](https://github.com/odogono/mercenary/issues/81), not a Data Payload
schema and not an extension of Targ **Benson Script**, **Occupancy**, **Craft
Parameter Block**, or **Host Callout** types (ADR 0020).

Authoritative Evidence remains bound to the C64 Reference Build. Observations
here are Working-Authority Evidence only.

## Scope and non-goals

**In scope:** whether a Benson-or-successor script VM still exists; how
walk-versus-boarded and craft control appear; what orbital/flight/space motion
and time/comet-deadline look like in the ST working authority; what a Host
Callout census against this remake’s named seam would look like.

**Out of scope:** filled-polygon drawing ([#79](https://github.com/odogono/mercenary/issues/79));
Gamma System place topology ([#80](https://github.com/odogono/mercenary/issues/80),
note: `docs/research/damocles-gamma-system.md`); any change to `MercenaryKit` or
the Targ Data Payload; a Damocles extractor or payload; starting a second
Independent Implementation ([#82](https://github.com/odogono/mercenary/issues/82)).

**Language:** research wording (message bank, walk-or-boarded, craft catalogue,
impact clock). This note does not redefine glossary **Benson Script** /
**Occupancy** / **Craft Parameter Block** / **Location**, and it does not mint
Damocles terms in `CONTEXT.md`.

## Working Authority and reproduce path

| Item | Value |
|---|---|
| Program | `roms/atarist/damocles_-_mercenary_ii_novagen_software_(uk).stx` |
| SHA-256 | `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef` |
| TOS pin | EmuTOS 2.06 (`154803e3…8939d5`) |
| Lab | `research/damocles-st/` (`damocleslab`) |
| World load | `scenarios/first-world.json` (SHA-256 `e5383458…8582f96e`) |
| Clock probe | `scenarios/deadline-clock.json` (SHA-256 `32d8a4d3…a5abcc4c`) |
| Comet-motion probe | `scenarios/comet-motion.json` (SHA-256 `5f76cc7f…a8472efd`) |

Reproduce:

```sh
research/damocles-st/lab doctor
research/damocles-st/lab observe --scenario research/damocles-st/scenarios/first-world.json
research/damocles-st/lab observe --scenario research/damocles-st/scenarios/deadline-clock.json
research/damocles-st/lab observe --scenario research/damocles-st/scenarios/comet-motion.json
```

`deadline-clock` boots like `first-world`, captures RAM/registers/display as
`observed-t0.*`, waits while the player stands still, then captures again as
`observed-t1.*` (lab supports one or two `capture` actions with distinct
`prefix` values; mid-capture uses Hatari `hatari-cont`).

Cited runs:

- `first-world`: `observe-first-world-20260818T101013Z-c5a32b7d`,
  `observe-first-world-20260818T101117Z-010b9ad3`
- `deadline-clock`: `observe-deadline-clock-20260818T103425Z-e36297b7`
- `comet-motion`: `observe-comet-motion-20260922T103939Z-5bb10b42`

## Secondary-hypothesis ledger

Secondary claims from `docs/research/damocles-gap.md` and the Lemon Amiga
manual transcription. Search hypotheses only.

| Hypothesis | Status | Working-Authority Evidence |
|---|---|---|
| 1987 ST demo still carried Mercenary Benson programs; final ST may keep a successor VM | **Unresolved (VM)** | No `SCRIPT` / `INTERPRETER` strings; sole `BENSON` hit is a character name in an easter-egg file (`$073595`), not an interpreter label. Message bank + `(OK?)` prompts exist (see Script VM). |
| Walk with joystick; board with `B` near craft while holding matching key; leave with `L` | **Superseded — Confirmed in #86** | See [`damocles-walk-board-flight.md`](damocles-walk-board-flight.md): `$79C2` locomotion, Shift+Up take, `B`/`L` board/leave, walk flag `$7A8E`. |
| Panel clock counts down to Damocles impact; near-c flight accelerates Eris time | **Partially confirmed** | Standing-still dual capture shows the panel clock counting down (see Time). Near-c dilation not tested (no spaceflight reach in this pass). |
| DAMOCLES's system-space position is a function of the Impact Clock | **Confirmed (#440)** | `$051E88` interpolates a 31-record waypoint table at `$052022` between the clock's two neighbouring authored times and writes the result at `$051F36`/`$051F3A`. Recomputing the centre from the clock alone reproduces the machine's own longwords bit-exactly at every sample of three poses, and poking the clock onto a waypoint puts the comet on it. See [Comet motion](#comet-motion-440--confirmed-damocless-centre-is-a-function-of-the-impact-clock). |
| DAMOCLES has a Primary | **Disproved as a field (#440)** | The mover reads no orbit centre, no radius and no elements — only absolute X and Z waypoints — so there is nothing for a Primary to be read from. The path's *shape* is one perihelion pass about DIALIS at the System origin, which corroborates the structural reading without decoding a field. |
| Orbital mechanics beyond Craft Parameter Blocks | **Unresolved** | Craft names/keys present; no control-rate block decoded; VOID dynamics not entered. |

## Bucket findings

### Script VM — Unresolved (no bytecode census); message system Partially confirmed

**Superseded for existence:** [#85](https://github.com/odogono/mercenary/issues/85) /
[`damocles-script-isa.md`](damocles-script-isa.md) confirms a **successor
bytecode VM** (16-bit opcodes in `$070000+`, live PC at `$00781E`). The
paragraphs below remain the #81 inventory snapshot.

**What was sought:** a table-driven or bytecode interpreter comparable to the
C64 **Benson Script** machine (`notes/decode/benson-scripts.md`).

**Working-Authority Evidence:**

- Dense in-game copy bank roughly `$070000`–`$076000`, absent at title screen,
  including briefing lines, `(OK?)` prompts, `F1=SAVE  F2=LOAD  F10=QUIT`, and
  many `MESSAGE FROM …` strings.
- Big-endian pointers in low RAM (e.g. around `$000AFC`–`$000B50`) into that
  bank — a message/dialogue index, not proof of a bytecode ISA.
- The string `BENSON` at `$073595` sits in Novagen office easter-egg text
  (“BRUCE BENSON … CONFIDENTIAL FILE”), not beside an interpreter.

**Classification (#81):** Damocles clearly has a **scripted message / prompt surface**
(Benson-as-persona in fiction and UI). Whether logic is still a **bytecode VM**,
a native 68k state machine, or a hybrid is **Unresolved** in this pass. Do not
call these **Benson Scripts** until an opcode or dispatch table is shown.

### Occupancy / craft control — Partially confirmed (catalogue); transition Unresolved

Builds on [#80](https://github.com/odogono/mercenary/issues/80): vehicle-key
labels near `$03E430` (`KEY - 99 CHEVY`, `KEY- V.I.P. LIMO`, …) and craft name
strings (`BESTCUPAND CRAFT`, `EAGLE`, …).

**Working-Authority Evidence at first-world / deadline-clock start:**

- Outdoor ERIS view; inventory panel shows `EMPTY` (same address in t0/t1).
- Player is on foot in the starting spaceport approach — no boarded craft name
  in the inventory slot.

**Not shown:** a walk-versus-boarded state word, craft control-rate tables, or a
successful board/leave transition. Stretch attempt: Hatari FIFO has no joystick
event (`control.c` accepts key/mouse events only), and secondary sources require
walk-near + matching key before `B` boards. No adventure harness (enter
building, pick up key, walk to car) was built inside #81.

### Flight / space motion — Unresolved (dynamics); place class already #80

Narrative copy confirms atmosphere entry, spaceflight, and “not equipped for
space travel” vehicle lines. Body slot `VOID` is a place class (#80). This pass did not reach VOID. Navigation panel `07-08` is the Eris cell from
`$7A92`/`$7A9A` (16.16); `016-283` is a separate pair at `$7A1C`/`$7A20` (#208).
It did not move with an on-foot walk that raised `$7A9A`, but that walk covered
0.16 of a cell; the pair does track the player over longer moves (#367). Orbital mechanics and
time-dilation-in-flight remain **Unresolved**.

### Time / comet deadline — Confirmed (panel advances); RAM encoding Confirmed (#208)

**Working-Authority Evidence** from `deadline-clock` run
`observe-deadline-clock-20260818T103425Z-e36297b7`:

| Capture | Panel clock (bottom-right) | Notes |
|---|---|---|
| `observed-t0` | `02-29-13` | After world load, player idle |
| `observed-t1` | `02-24-26` | After further host wait; still idle |

Pixel diff between the two PNGs is concentrated on that clock field; location
label `ERIS` and `EMPTY` inventory stay put. So the impact-deadline clock
**runs while the player stands still** — Working-Authority Evidence for a
session time base independent of player motion.

Cold `first-world` runs already showed different clock readings (`02-29-05` vs
`02-29-17`) at capture time, consistent with a live countdown.

**RAM encoding (#208).** The panel field is **not** packed BCD and is **not** a
`$7482` script record. It is a signed big-endian 32-bit at **`$793C`** whose
value is **minus remaining seconds**. `abs(value)` formatted as `HH-MM-SS` is
the readout: idle on-foot snapshot `$FFFFDE7D` = `-8579` displays as
`02-22-59` (`2×3600 + 22×60 + 59`). The word increases toward zero. Exact-VBL
idle pairs from `eris-spaceport-onfoot.sav` (`panel-readout-probe.py clock`):

| VBLs | `$793C` | `abs` | Panel (PNG; may lag the RAM dump by one displayed second) |
| ---: | ------- | ----: | --------------------------------------------------------- |
|  250 | `-8579` → `-8567` | 12 s | `02-22-59` → `02-22-47` |
|  500 | `-8579` → `-8554` | 25 s | `02-22-59` → `02-22-33` |

**Tick.** 500 VBLs / 25 displayed seconds = **20 VBLs per displayed second** at
PAL 50 Hz (2.5 displayed seconds per host second while idle on foot).

**Correction (#551, 2026-09-27).** The tick above does not reproduce. The VBL handler at
`$051E6E` subtracts `$7876` (32 on foot and on a Body) from `$787A` every VBL, and each time it
passes zero adds one to `$793C` and reloads `$7878` (1 600). So the clock gains one second every
**50 VBLs**, which is real time at 50 Hz, and γ seconds per 50 VBLs in space. An exact-VBL chain
from the same memstate ticks at stops 24, 74, 124, 174 and 224. See
[the panel aboard note](damocles-panel-aboard.md#the-impact-clock). Packed
BCD and ASCII `HH-MM-SS` searches of the same dumps are empty; the digits are
drawn, not stored as text.

**Poke.** Writing `$FFFFF1F0` (`-3600`) at `$793C` and waiting 400 VBLs leaves
`$FFFFF204` (`-3580`) and redraws the panel as `00-59-39` (magnitude
`00-59-40` on the RAM capture). A short 80-VBL poke updated `$793C` but not
yet the bitmap; the renderer needs more than one displayed-second of running
time. `$7942` is a finer companion word, not the `HH-MM-SS` source. Script
`$7482` records did not change while the clock ticked.

**Start value (#368) — Confirmed: `-15560`, `04-19-20`.** What #208 left open
was the deadline a fresh game begins with. It is installed on the **title
screen**, before the player presses anything: every one of the 78 title-screen
RAM dumps in the laboratory holds the same uninitialised `$025E8120` at
`$793C`, and a cold boot writes `$FFFFC338` = **`-15560`** = **`04-19-20`**
some 2,200 VBLs after the first title-loop hit, then holds it static for
several hundred more VBLs before the title's own slow tick begins.

`deadline-start-probe.py` catches the write by cold-booting to the pinned
title-screen checkpoint and then sampling `$7900`–`$7B00` on a self-chaining
run of exact-VBL debugger breakpoints, so the cadence is emulator time rather
than host sleeps. Bracketed to 0.2 displayed seconds:

| VBLs after the title checkpoint | `$793C` | Readout |
| ---: | --- | --- |
| 1400 (the checkpoint itself) | `$025E8120` | — uninitialised |
| 1400 + 775 | `$025E8120` | — uninitialised |
| 1400 + 780 | `$FFFFC338` | `04-19-20` |

**The player never sees `04-19-20` on foot.** Pressing Space starts a scripted
arrival that spends the deadline in one decelerating sweep — `-15543` to
`-10244` inside 200 VBLs — after which the word resumes its ordinary rate
while the ship flies in and lands itself. The walk flag `$7A8E` turns to `1`
between 3,500 and 3,600 VBLs after the checkpoint, with the clock reading
about `02-47-25`: that is where the original hands over control, on foot at
Eris Capital Spaceport, and it is why every on-foot capture in the laboratory
reads somewhere in the twos. How much is left at hand-over therefore depends
on how long the title screen sat; `15560` is the only figure that is a
property of the game rather than of one playthrough.

The same landed frame independently pins two panel widths the port had
guessed at: the altitude window prints **six** digits (`000000` on foot), and
the cell beside it reads `07-08` with body coordinates `016-283` — the port's
own start pose.

Reproduce:

```sh
python3 research/damocles-st/scripts/panel-readout-probe.py \
  --roms /path/to/roms --snapshots /path/to/snapshots clock --vbls 250
python3 research/damocles-st/scripts/panel-readout-probe.py \
  --roms /path/to/roms --snapshots /path/to/snapshots poke \
  --address 0x793c --bytes fffff1f0 --vbls 400
python3 research/damocles-st/scripts/deadline-start-probe.py \
  --roms /path/to/roms --start-vbls 0 --interval 5 --count 200 --no-space
python3 research/damocles-st/scripts/deadline-start-probe.py \
  --roms /path/to/roms --start-vbls 0 --interval 100 --count 1200
```

Residual Fog: whether flight / near-c time changes this word's rate (still
#86); what governs the arrival sweep's shape, and so the exact cost of the
scripted arrival.

### Comet motion (#440) — Confirmed: DAMOCLES's centre is a function of the Impact Clock

The clock does not only count down. It also **places the comet**. DAMOCLES's
system-space centre is the one Body centre the resident image ever writes
([orbit stasis](damocles-gamma-system.md#orbit-stasis--confirmed)), and the
mover that writes it reads no velocity, no orbit and no previous position: it
reads the clock, finds the pair of authored waypoints the clock falls between,
and interpolates. The comet's position is therefore a **recomputation from
time**, not an integration, and it is a pure function of `$00793C` alone.

#### The mover

`$051E88` runs once a drawn frame, from all three of the frame paths that draw
the sky (`$0595BC`, `$05977A`, `$0598AA`), and ends at the one centre write:

```text
$051E88  movea.l $782c.w, a0     ; the waypoint record the comet is leaving
$051E96  move.w  $793e.w, d0     ; the Impact Clock's low word: -seconds left
$051EA8  move.w  d5, $7942.w     ; publish clock * 32 + the fraction of a second
$051EAC  tst.w   $62de.w         ; $626A + $74: skip a destroyed DAMOCLES
$051EB2  cmp.w   $a(a0), d0      ; reached the next waypoint's time?
$051EB6  bpl.w   $51f6c          ;   yes: advance the cursor and re-derive rates
$051EBA  sub.w   (a0), d0        ; elapsed seconds inside this segment
$051EC6  mulu.w  $7822.w, d0     ; x 16.16 rate, four mulu for two axes
$051EF2  add.l   $2(a0), d0      ; + the segment's own start X
$051EF6  add.l   $6(a0), d1      ; + the segment's own start Z
$051F36  move.l  d0, $5fb4.w     ; $5F40 + $74 = DAMOCLES X
$051F3A  move.l  d1, $6034.w     ; $5FC0 + $74 = DAMOCLES Z
```

`lab xref --address 0x782c` finds exactly one reference in the observed image,
the `movea.l` above. It reports reads of this shape only: a hit is an
absolute-short *source* operand in the word after the opcode, so neither
`move.l #imm, $782c.w` nor `move.l d0, $5fb4.w` can appear in it, and the
writers come from the listing instead. The cursor's only two installers are
`move.l #$52022, $782c.w` at `$051088` — the instruction directly after the
`move.l #$ffffc338, $793c.w` that installs the `-15560` start deadline (#368) —
and the same instruction at `$05939E`, beside the `clr.l $7a7e.w` and
`clr.w $7a82.w` that reset the drift term. Clock and path are installed
together, by the same routine, in adjacent instructions.

#### The record: a waypoint table at `$052022`

Thirty-one ten-byte records run from `$052022` to `$052157`, immediately before
the panel's own digit divisors at `$052158`. Each record is a signed word of
**seconds to impact** and two longwords of **X and Z** — the same absolute
System coordinates the body-centre arrays hold, with no Y, so the whole path
lies in the Y = 0 plane every Body sits in.

A segment is a record and its successor. On crossing one, `$051FD6..$05201E`
re-derives the segment's own rates: `$007822`/`$007824` are the integer and
fractional halves of `|dX|` per 1/32 second as an unsigned 16.16 quantity,
`$007826`/`$007828` the same for `|dZ|`, and `$00782A`/`$00782B` carry the two
signs, because the divide is done on magnitudes.

| # | Address | Seconds to impact | X | Z | Segment | Speed a second |
|--:|---|--:|--:|--:|--:|--:|
| 0 | `$052022` | -15500 | -369066 | 1119852 | 0 s | — |
| 1 | `$05202c` | -15500 | -369066 | 1119852 | 2500 s | 0.0 |
| 2 | `$052036` | -13000 | -369066 | 1119852 | 500 s | 284.6 |
| 3 | `$052040` | -12500 | -303213 | 993726 | 500 s | 267.1 |
| 4 | `$05204a` | -12000 | -242943 | 874560 | 500 s | 249.3 |
| 5 | `$052054` | -11500 | -188310 | 762528 | 500 s | 231.3 |
| 6 | `$05205e` | -11000 | -139362 | 657771 | 500 s | 213.1 |
| 7 | `$052068` | -10500 | -96111 | 560421 | 500 s | 194.8 |
| 8 | `$052072` | -10000 | -58557 | 470574 | 500 s | 176.4 |
| 9 | `$05207c` | -9500 | -26679 | 388311 | 500 s | 158.2 |
| 10 | `$052086` | -9000 | -417 | 313677 | 500 s | 140.3 |
| 11 | `$052090` | -8500 | 20304 | 246675 | 500 s | 122.7 |
| 12 | `$05209a` | -8000 | 35610 | 187272 | 500 s | 105.7 |
| 13 | `$0520a4` | -7500 | 45651 | 135378 | 500 s | 89.6 |
| 14 | `$0520ae` | -7000 | 50628 | 90831 | 500 s | 74.9 |
| 15 | `$0520b8` | -6500 | 50751 | 53370 | 500 s | 62.2 |
| 16 | `$0520c2` | -6000 | 46203 | 22608 | 500 s | 52.6 |
| 17 | `$0520cc` | -5500 | 36906 | -1992 | 500 s | 48.3 |
| 18 | `$0520d6` | -5000 | 21942 | -20946 | 500 s | 54.0 |
| 19 | `$0520e0` | -4500 | -1839 | -33750 | 500 s | 75.6 |
| 20 | `$0520ea` | -4000 | -39576 | -36267 | 500 s | 105.2 |
| 21 | `$0520f4` | -3500 | -90594 | -23526 | 500 s | 131.6 |
| 22 | `$0520fe` | -3000 | -150405 | 3852 | 500 s | 156.0 |
| 23 | `$052108` | -2500 | -217317 | 43965 | 500 s | 179.8 |
| 24 | `$052112` | -2000 | -290853 | 95643 | 500 s | 202.9 |
| 25 | `$05211c` | -1500 | -370770 | 158160 | 500 s | 225.6 |
| 26 | `$052126` | -1000 | -456867 | 231009 | 500 s | 247.6 |
| 27 | `$052130` | -500 | -548943 | 313785 | 500 s | 222.5 |
| 28 | `$05213a` | **0** | **-630000** | **390000** | 500 s | 254.6 |
| 29 | `$052144` | 500 | -720000 | 480000 | 500 s | 254.6 |
| 30 | `$05214e` | 1000 | -810000 | 570000 | — | — |

**The path ends on ERIS.** Record 28's X and Z at zero on the clock are
`-630000, 390000` — byte for byte the centre ERIS holds in the body arrays
([the Gamma System note](damocles-gamma-system.md)). The countdown and the
geometry are the same statement: when the clock reaches zero the comet is
exactly where the player's home world is.

**The path swings past DIALIS.** Distance from the System origin, where the
star sits, falls from 1,179,101 at the first waypoint to 30,335 at `-5000`
and rises again — one perihelion pass. The authored speeds are *lowest* at
that closest approach (48.3 a second against 284.6 at the start), which is
the opposite of what gravity would give, so the path is drawn to read as a
comet rather than computed as one.

**The first three records are a stationary guard.** Records 0, 1 and 2 hold
the same position, so the authored path does not move for the first 2,560
seconds of the countdown, from the `-15560` start to `-13000`. That also
absorbs two arithmetic edges, both harmless because those three points
coincide. Rates are derived only on an advance, at `$051FD6`, so between
`-15560` and `-15500` the cursor still rests on record 0 and the mover
multiplies by whatever `$007822..$00782B` last held; and segment 1 is 2,500
seconds long, past the 2,048 seconds `asl.w #$5` can hold before it wraps —
its `|delta|` divides to a zero rate either way. What the comet's centre reads
during those first 60 seconds is not observed here; the scripted arrival
spends the deadline down to about `-10244` inside 200 VBLs (#368), so a player
on foot is never in them.

#### The formula

For an Impact Clock of `c` seconds (negative) carrying a sub-second fraction
`f` in thirty-seconds of a second, on the segment `[t0, t1]` running from
`(x0, z0)` to `(x1, z1)`:

```text
len   = (t1 - t0) * 32                            ; 1/32 s, a 16-bit quantity
rate  = (|x1 - x0| / len,  ((|x1 - x0| % len) << 16) / len)   ; 16.16, sign kept aside
ticks = ((c - t0) * 32 + f) & $FFFF
X     = x0 + sign * (ticks * rate.integer + ((ticks * rate.fraction) >> 16)) + drift
Z     = z0 + sign * (…)                            ; the same, with no drift term
```

`f` is readable directly: `$051EA8` publishes `c * 32 + f` at **`$007942`**,
which is what #208 saw as "a finer companion word". It is the clock at 1/32-second
resolution, and it is the mover's own time base. The second's fraction itself
comes from the tick counter `$00787A` against its reload `$007878`, which the
interrupt at `$051E6E` steps down by `$007876` and `$0521A6` reloads as it adds
one to `$00793C`.

`drift` is an X-only term, normally zero. `$051EFA` adds `$007A84` to X, and
`$007A84` is `$007A7E - $00793C` recomputed each frame until `$007A82` is set.
`$007A7E` is armed in exactly two places, `$04C8FC` and `$04D8B0`, both inside
the body-destruction dispatcher at `$04C8D2`. What arms it and what it means
for play belongs to the endgame (#110); it is named here because the formula is
incomplete without it. In every run cited below `$007A7E` is zero.

`payload/damocles/system.json` publishes the table as `comet.waypoints`, and the port
places the comet from the Session's impact clock with this formula
([#538](https://github.com/odogono/mercenary/issues/538), `web/src/damocles/comet.ts`).
Before `-15500` the port holds record 0. It leaves the drift out, and it takes the comet as
gone once the clock reaches zero.

#### Past zero on the clock

Advancing onto record 28 finds a **zero time word**, which `$051FAA` reads as
the end of the table. `$051FB2` calls the routine at `$051F42`, which destroys
slot `$74` (DAMOCLES) and slot `$2C` (index 11, ERIS) through `$04C98E`. The
mover then raises `$007A82`, and copies records 28 and
29 — twenty bytes — into a scratch pair at `$007CF4`, where the cursor lives
from then on. `$051F6C` thereafter extends that pair 500 seconds at a time by
reflecting the endpoint, so the comet continues in a straight line at its final
180-a-second-per-axis velocity forever. Record 30 is never reached. How the
collision is presented remains #110; this note records only that the table ends
by destroying two Bodies and that motion continues.

#### The second effect: carrying the player

`$051F22..$051F32` adds the frame's own centre delta to the camera origin
longwords `$00799A` and `$0079A2`, so the comet carries the player rather than
sliding out from under them. `$051F12` puts two conditions on that: `$007AAE`
must read 2, which `body-phase-probe.py` already names as **in space**, and
`$001634` must read 11 or less. `$001634` is Unresolved: the only write to it in the resident image is
`move.w #$c` at `$058E46`, yet it reads 19 from the Eris spaceport pose, 18
from the Gaea Ur City pose and 7 from the DAMOCLES pose, so something writes it
through a form the byte-pattern xref does not see. The first two equal
`floor(log2)` of the distance from the pose's own body centre to the comet,
which would make the second condition a proximity test, but two poses is not a
decode. No pose sampled here reads `$007AAE` as 2 — the laboratory has no
committed in-space capture — so the carry is read in the listing and not
observed running.

#### Working-Authority Evidence

`comet-motion-probe.py` reimplements the arithmetic above from the table in the
machine's own RAM and compares it with the centre the machine holds. `--case
path` samples a live run; for each sample it also searches back two game-seconds
for the single 1/32-second tick that reproduces **both** axes bit-exactly, which
separates a wrong formula from a stale frame.

| Run | Pose | Samples | Segments crossed | Residual | Exact tick |
|---|---|--:|---|---|---|
| `comet-motion-path-20260922T104949Z-7d2b3317` | `eris-spaceport-onfoot` | 24 | 11 → 12 → 13 | 0 on both axes at every sample | every sample, lag 0 |
| `comet-motion-path-20260922T105221Z-a029ba12` | `rehosted/gaea-ur-city-4-2` | 10 | 14 → 15 | 0 on both axes at every sample | every sample, lag 0 |
| `comet-motion-pose-20260922T105311Z-7b344426` | `rehosted/damocles` | 3 | 13 | 0 on both axes | every sample, lag 0 |

The cursor `$00782C` agreed with the segment the clock alone selects at every
sample of all three, so nothing about the comet's position depends on how the
session reached that clock reading.

`--case waypoint` is the one case that injects: it pokes `$00793C` forward onto
an authored waypoint's own time and reads back where the comet went. Run
`comet-motion-waypoint-20260922T105114Z-3dade137`, from the Eris spaceport pose
at `-8578`:

| Poked clock | Waypoint X, Z | Observed X, Z | Off by | Seconds past the waypoint |
|--:|---|---|---|--:|
| -8500 | 20304, 246675 | 20331, 246568 | 27, -107 | 1 |
| -7500 | 45651, 135378 | 45656, 135328 | 5, -50 | 0 |
| -6500 | 50751, 53370 | 50742, 53309 | -9, -61 | 1 |
| -5500 | 36906, -1992 | 36887, -2016 | -19, -24 | 0 |
| -4500 | -1839, -33750 | -1862, -33751 | -23, -1 | 0 |
| -3500 | -90594, -23526 | -90683, -23485 | -89, 41 | 0 |

Every residual is the fraction of a second that runs between the poke and the
sample, and the exact-tick reconciliation is bit-exact at all six — including
the first poke, which jumps the clock 78 seconds, and the last, which jumps it
5,000 seconds across ten segments in one step. A clock set to a time is a comet
put at a place.

**The #181 cold-run difference is entirely the clock.** DAMOCLES was the one
Body whose centre differed between the two cold `first-world` runs
(X `1879 -> 1406`, Z `306253 -> 307781`). Inverting those two positions through
the table gives clocks of `-8944.59` and `-8956.00`, that is `02-29-04.6` and
`02-29-16.0`, against the `02-29-05` and `02-29-17` those two runs' panels read
— inside the one displayed second the renderer is already known to lag by. The
positions were never nondeterministic; they are two readings of one function at
two times, and normalising them out of the published hashes remains right.

#### Reproduce

```sh
research/damocles-st/lab observe \
  --scenario research/damocles-st/scenarios/comet-motion.json
research/damocles-st/lab verify --run research/damocles-st/work/<run-id>
python3 research/damocles-st/scripts/comet-motion-probe.py --case path \
  --samples 24 --interval 2.0
python3 research/damocles-st/scripts/comet-motion-probe.py --case path \
  --samples 10 --interval 1.5 \
  --snapshot research/damocles-st/snapshots/rehosted/gaea-ur-city-4-2.sav
python3 research/damocles-st/scripts/comet-motion-probe.py --case waypoint \
  --targets 6 --ordinary-rate --interval 0.05
python3 research/damocles-st/scripts/comet-motion-probe.py --case pose \
  --samples 3 --interval 0.5
```

| Step | Command | Expected |
|---|---|---|
| Pin the scenario | `lab observe --scenario research/damocles-st/scenarios/comet-motion.json` | Two RAM captures about 35,000 interrupts apart, each carrying the clock, `$007942`, the cursor, the rates, DAMOCLES's centre and the whole table; scenario SHA-256 `5f76cc7f…a8472efd`. The gap is not fixed — `wait_vbls` is a host sleep — so read it from `$051D96`. |
| Verify it | `lab verify --run research/damocles-st/work/observe-comet-motion-20260922T103939Z-5bb10b42` | Manifest and all 22 artifacts verify. |
| Read the table out of that capture | `$052022..$052157` of `observed.ram`, ten bytes a record | The 31 rows above; record 28's X and Z equal ERIS's centre. |
| Check the formula live | `comet-motion-probe.py --case path --samples 24 --interval 2.0` | `an exact tick reproduces both axes everywhere: yes (worst lag 0)`; run `comet-motion-path-20260922T104949Z-7d2b3317`. Probe SHA-256 `334803ce…5b4eebfb`, and every run below uses it. |
| Check it away from Eris | `--samples 10 --interval 1.5 --snapshot …/rehosted/gaea-ur-city-4-2.sav` | The same, crossing segments 14 and 15; run `comet-motion-path-20260922T105221Z-a029ba12`. |
| Move the comet by moving the clock | `--case waypoint --targets 6 --ordinary-rate --interval 0.05` | Six pokes, each landing within a fraction of a second of the authored waypoint; run `comet-motion-waypoint-20260922T105114Z-3dade137`. |
| Reconcile a stored pose | `--case pose --samples 3 --interval 0.5` | Residual 0 against a memstate captured by other work; `occupancy [1]`, `carry gate $1634 [7]`; run `comet-motion-pose-20260922T105311Z-7b344426`. |

Residual Fog: what `$001634` is and what arms `$007A7E` (both endgame-adjacent,
#110); whether flight / near-c time changes the clock's own rate, which is
still #86 and which — now that position follows the clock exactly — would move
the comet as well as the countdown.

## Host Callout census (category rows)

Comparison is against this remake’s `BensonHostState` / `BensonEffect` surface
in `app/Sources/MercenaryKit/BensonHost.swift`. Rows describe what a future
Damocles seam *would* need to census — not types to add to `MercenaryKit`.

| Category | Targ Host Callout (reminder) | Damocles Working-Authority Evidence | would-map / would-not-map / unknown |
|---|---|---|---|
| Location / room | `currentRoom` (surface sentinel vs Room) | Multi-body roster + place labels (#80); panel `ERIS` | **would-not-map** as Targ room index; needs own place/body identity |
| Boarded craft | `boardedCraft` / on-foot sentinel | Craft + key catalogues; start on foot (`EMPTY`) | **unknown** until board transition observed |
| Objects / inventory | `objectRooms`, `objectFlags`, `inventory` | Dense object/key label pools; panel inventory slot | **would-map (shape)** at census level; encodings Unresolved |
| Messages / keys / ticks | `messagePlaying`, `pendingKey`, `tickCounter`, `messageInterval` | Message bank, `(OK?)` prompts, save/load HELP text | **would-map (concerns)**; not proven as same bytecode ops |
| Flags / capabilities | `engineFlags`, lift/take overrides, combat/complete | Not decoded | **unknown** |
| Effects | `playMessage`, `keyAcknowledged`, `sound`, `cityLocationChanged`, `scriptFinished` | Messages and prompts exist; script-finished / sound ops Unresolved | **unknown** (message play likely; others unproven) |
| Time / deadline | (no comet deadline on Targ Host Callout) | Impact clock on panel, advances while idle | **would-not-map** onto existing fields; new Damocles-only concern |
| Flight / space | (Craft Parameter Blocks + walking mover) | Space as place (VOID); dynamics Unresolved | **would-not-map** as CPB-only; needs own motion/time model |

## Implications for #82 (shape signals only)

- A Damocles remake cannot reuse Targ **Location** / room Host Callout fields or
  treat Craft Parameter Blocks as the whole physics story — multi-body place
  identity and a live impact clock are first-class.
- Method can still transfer: Host Callout seam, Gameplay Session authority,
  own extractors, Independent Implementation (ADR 0002). Live Targ types cannot.
- Script VM uncertainty is a sizing risk: either port a successor bytecode
  interpreter after a future ISA census, or treat logic as native/table-driven
  and rebuild behind a new seam. This ticket does **not** choose.
- Occupancy/craft transitions and orbital flight remain fog for effort
  estimates; catalogue evidence is enough to reject “Damocles is a Content
  Overlay on Targ.”

## What was tried and left Unresolved

- Full script ISA / dispatch-table decode — follow-on [#85](https://github.com/odogono/mercenary/issues/85); **existence answered** in `damocles-script-isa.md` (successor VM); full semantics still open
- Walk-versus-boarded RAM word and board/leave observe — **answered** in [#86](https://github.com/odogono/mercenary/issues/86) / `damocles-walk-board-flight.md` (walk flag `$7A8E`; VOID / velocity binary / clock-under-flight still Fog there)
- VOID / deep-space flight and near-c time dilation — still open under #86 residual Fog
- Impact-clock RAM cell — **answered** in #208 (`$793C` signed remaining seconds)
- Impact deadline a fresh game starts from — **answered** in #368 (`-15560`, `04-19-20`, installed on the title screen)
- What moves DAMOCLES and along what path — **answered** in #440 (the waypoint table at `$052022`, interpolated from the clock by `$051E88`)
- Craft control-rate / orbital-parameter blocks — partial (number-key panel speed in #86 / #208); integer velocity cell still Fog; tables Unresolved

## Provenance summary

| Fact | Evidence |
|---|---|
| Message bank + `(OK?)` after world load | `first-world` RAM vs title-screen RAM |
| `BENSON` string is easter-egg name, not VM label | `$073595` context in `first-world` RAM |
| Craft/key catalogues | `#80` / `$03E430` band; present after load |
| Start on foot | Panel `EMPTY` on `first-world` and `deadline-clock` PNGs |
| Impact clock advances while idle | `deadline-clock` `observed-t0` → `observed-t1` panel `02-29-13` → `02-24-26` |
| Impact clock is signed seconds at `$793C` | #208 exact-VBL idle pairs; poke `$FFFFF1F0` → panel `00-59-39` |
| Fresh-game deadline is `-15560` (`04-19-20`) | #368 cold-boot exact-VBL chain; uninitialised at 1400+775 VBLs, written by 1400+780 |
| Altitude window prints six digits | #368 landed arrival frame reads `000000` on foot |
| DAMOCLES's centre is interpolated from the clock | #440 `--case path`: residual 0 on both axes at every sample of 24, 10 and 3, across five segments and three poses |
| The comet's path ends on ERIS's centre | Table record 28 at clock 0 is `-630000, 390000`, ERIS's own body-array centre |
| A poked clock relocates the comet | #440 `--case waypoint`: six pokes, each landing on the authored waypoint within the fraction of a second that elapses |
| The #181 cold-run centre difference is two clock readings | Inverting `1879, 306253` and `1406, 307781` gives `02-29-04.6` and `02-29-16.0` against panels reading `02-29-05` and `02-29-17` |
| Scenario pins | `first-world.json`, `deadline-clock.json`, `comet-motion.json` |
