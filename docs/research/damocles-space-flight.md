# Damocles launch, space flight, arrival and landing

Working-Authority Evidence for [#558](https://github.com/odogono/mercenary/issues/558), the last
ticket of the driving and flying map [#548](https://github.com/odogono/mercenary/issues/548),
recovered 2026-09-28. Authoritative Evidence remains bound to the C64 Reference Build. This note
records decoded ST facts only and does not translate the program into a new model
([ADR 0002](../adr/0002-separate-rom-research-from-implementation.md)). RAM, memstates and traces
stay ignored Restricted Material under `research/damocles-st/work/`. Only addresses, decoded facts
and hashes are recorded here.

#558 asked for the space routine `$05872E` and the post-launch pitch swing `$057F18`/`$7B0C` to be
decoded before any port work. This note decodes the whole chain from the launch key to the
craft sitting over the destination Body. Every step was checked against the running program **pass
by pass, bit for bit**. That covers the launch handler, the swing, the space entry, the space
pass, the range and nearest-Body scan, the arrival test and the landing point.

## What was found

1. **Launch is Esc, and it is a reverse throttle.** Scancode `$01` runs `$055822`. It refuses
   silently when the player isn't aboard or the craft is in ground contact. It refuses with system
   string 21 when the slot's `+$1A` is below 100. Only slots 1, 3, 4, 7, 12 and 14 can launch.
   On acceptance it sets `$7B0C`, writes the throttle `$000EF000` (full reverse at exponent 14),
   and writes `$F000` into the speed's exponent word, which leaves the speed effectively zero.
2. **The swing points the nose down, then the ordinary pass climbs backwards.** While `$7B0C` is
   set, the craft pass goes to `$057F18`. That moves the pitch 16 a pass towards `$280`, and
   nothing else moves. Once `(pitch + $80) & $3FF` passes `$300`, the rest of the common craft
   pass runs with the stick read as zero. Reverse thrust along a nose-down attitude climbs. Any
   throttle key clears `$7B0C` and ends the swing.
3. **Space begins at the same altitude for every craft.** A pre-pass Y high word of `$1F0` or more
   runs `$055868`. It clears `$7B0C`, sets occupancy `$7AAE` = 2, starts the 50-pass arrival hold
   `$7B0A`, and sets the throttle's and speed's exponent words to `$000E` and `$0010`. It also
   levels the pitch to `$1FF`, and it returns without drawing, so the entry pass shares its frame.
   The space position `$799A`/`$799E`/`$79A2` is whatever the last landing left there: the Body's
   centre in the System, with Y = 64.
4. **The space pass is a third control law over slot 0's block.** Whatever craft is aboard,
   `$05872E` reads `$055C80`. It has a turn rate and a pitch rate, each damped and accelerated like
   the surface turn rate. The speed is `(V + throttle × gain) × lag`, then multiplied by
   `range / (range + 65,536)`, so a craft slows as it nears any Body. It moves by a word per axis
   per pass. **The pitch is not integrated**: it is `$200 + word(4 × pitch rate)`, so the nose
   deflects at most about `$40` either way and returns to level when the stick is released. Roll
   is zero, and contact is cleared.
5. **The range is exact but rotated.** `$052DB0` takes each Body's offset, rotates it by the view
   matrix at `$42C20` (`$05668A`, built from the camera roll, pitch and yaw), and takes the length
   in the program's floats. It keeps the smallest length in `$791C` and that Body in `$7924`. The
   matrix is itself built from the sine table (`$055F60`, `$045710`), so everything feeding the
   range can be derived.
6. **Arrival is the nearest Body, after the hold.** `$7B0A` counts down one a frame. Once it is
   zero, `$052FCA` copies `$7924` to `$7920`. `$052FDA` raises `$7A28` when the range's exponent
   word is more than 7 below the Body's `$6040` exponent word. The same frame, `$059920` runs the
   landing.
7. **Landing puts the craft over the sub-craft point, still aboard and still moving.** `$059268`
   sets occupancy 0 and Y = `$1800000`. It takes the longitude from `atan2` of the craft's X/Z
   offset from the Body, less the Body's rotation `$62EA(a0)`, and makes it X. It takes the
   latitude from the craft's Y over the Body's extent and makes it Z. It writes the terminator word
   `$79BE` from the Body's own position, moves the space position back to the Body's centre, and
   binds the Body (`$56488`). **The throttle, speed, pitch and yaw are kept**, so a craft that
   arrives under power climbs straight back to the space entry. Landing also queues Damocles
   Script trigger `body + $1F` where it is armed (`$054770`).

The probe reproduces **every one of 3,286 compared passes** in six cases with no mismatch. They
are 2,382 space passes, 276 swing and swung passes, 626 passes on a Body (after the landings
too), and the two arrivals with their landing points.
Every range, nearest Body, countdown and arrival prediction is exact too.

## Evidence identity

Static recovery reads the pinned first-world RAM
`observe-first-world-20260818T101013Z-c5a32b7d/observed.ram`, SHA-256
`b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967`. It was decoded with Capstone
M68K 68000 in the laboratory virtual environment. Readers and writers were found by disassembling
every even address in `$40000`–`$60000` and filtering the printed operand.

The probe is the tracked
[`scripts/space-flight-probe.py`](../../research/damocles-st/scripts/space-flight-probe.py),
SHA-256 `2079eb60c1528ec15f210ee1834c57df96ccdefe8061fa57ac5dfb90cc05d8f9`. It imports the #549
probe [`craft-control-probe.py`](damocles-craft-control.md) for the number system and the common
craft pass.

- `decode` hashes every range below and checks the instruction words the decode rests on. It
  checks that the code is identical in all 62 memstates (tracked, linked and rehosted). It also
  checks that every Body position and extent is the same in all of them, apart from the comet.
- `trace` boots a memstate on the pinned Hatari 2.6.1 at the ordinary frame rate and chains one PC
  breakpoint per craft pass on `$057CC2`, as #549 did. At every stop it saves low RAM, the tables,
  the panel and the clock. Keys go into the ACIA mailbox `$05558C` and the stick into `$79C2`,
  written from the stop scripts at fixed passes. No host timing reaches the machine, so a run
  repeats exactly.
- `analyse` replays every pass through the models and records every word that differs.

```sh
python3 research/damocles-st/scripts/space-flight-probe.py decode
python3 research/damocles-st/scripts/space-flight-probe.py trace --roms roms --case cross
python3 research/damocles-st/scripts/space-flight-probe.py analyse --run <run-directory>
```

The memstates are `snapshots/dion-north-airborne.sav`, where EAGLE NINE S E (slot 3) is airborne
over Dion (SHA-256 `71d0a1224672551e4a0ddcefa32903007b3a284a123012d6e83cd68261064c64`), and the
rehosted `snapshots/rehosted/dion-2-3.sav` (SHA-256
`361f5ca00cf2a0220489de25c81a7085e812cff019a1b2f44127f55db3ea2f80`), where `B` boards the same
craft on the ground.

## Traces

| Case | Route | Passes | Matched | What it shows |
| --- | --- | ---: | ---: | --- |
| `launch` | Esc, then nothing | 1,499 | 1,499 | the swing, the climb, space entry, 1,425 space passes with the range falling off |
| `steer` | Esc, then the stick in space: up, down, right, left, up+left, down+right | 399 | 399 | both rates, the bounded pitch |
| `return` | Esc, Space in the first space pass | 399 | 399 | the craft stays inside Dion's arrival range, and lands back on Dion when the hold runs out |
| `cross` | Esc, coast 15 passes, Space, turn onto LACHESIS, key 9, pitch onto its Y | 899 | 899 | a crossing, an arrival, the landing point, and the climb back into space under power |
| `refused-contact` | `B` on the ground at Dion, then Esc | 59 | 51 aboard | refused silently in contact |
| `refused-gate` | a control: the airborne Eagle relabelled slot 10 (CONCORD III, `+$1A` = 90), then Esc | 39 | 39 | refused, `$7B98` = `$730FE`, system string 21 |

On-foot passes and the boarding pass are not compared. The cross route was planned offline by
running the space model from the `launch` run's first space stop, and the machine then flew it
exactly. The run directories under `research/damocles-st/work/` are:

- `space-flight-launch-20260928T094428Z-b53db7cd`
- `space-flight-steer-20260928T094551Z-6a3cd78e`
- `space-flight-return-20260928T094617Z-e6b4b79c`
- `space-flight-cross-20260928T094644Z-a1cc495e`
- `space-flight-refused-contact-20260928T094732Z-bf0a4432`
- `space-flight-refused-gate-20260928T094741Z-7b9a29ae`

Every run records the probe SHA-256 above, program SHA-256 `8d512ac6…a2ef`, EmuTOS SHA-256
`154803e3…39d5`, Hatari 2.6.1 (binary SHA-256 `05723606…e11a`) and Python 3.13.15 in its
`meta.json`, and its replay in `trace.json`.

## The launch handler

`$055822`–`$055866`, reached from the key dispatcher at `$05565C` on scancode `$01`:

| Test | Refusal |
| --- | --- |
| `$7AAE` = 0, aboard | silent `rts` |
| `$7ACA` = 0, not in contact | silent `rts` |
| `+$1A` of slot `$7AB0` ≥ 100 | system string 21 through `$054808` |

On acceptance it writes `$7B0C = $FFFF`, `$7BAC = $000EF000` and the word `$797A = $F000`, clears
the trim `$7A1C`, and goes to the key effect `$054848`. The speed keeps its mantissa under an
exponent of −4,096.

## The swing, `$057F18`

The common craft pass opens with `tst.w $7B0C; bne $57F18`. There, with `d1 = (pitch + $80) & $3FF`:

- `d1` ≤ `$180`: pitch −= 16, and the pass ends.
- `$180` < `d1` ≤ `$300`: pitch += 16, and the pass ends.
- `d1` > `$300`: the pass continues at `$057F7C` with the stick byte zero. It skips the stick
  read and the replay path, and runs as #549 decoded it.

From Dion's airborne pose at pitch `$25F`, the swing took three passes to `$28F`. The reverse
throttle then climbed the craft from 68,042 to the space entry in 65 passes. Nothing in the swing
clears `$7B0C`. The space entry does, and so does any throttle key (`$055700`), which hands the
craft back to the stick in the air.

## The space entry, `$055868`

The aboard frame path tests the pose copy's Y high word at `$05976A` and calls `$055868` at `$1F0`
or above. It writes:

| Word | Value |
| --- | --- |
| `$7B0C` | 0 |
| `$7AAE` | 2 |
| `$7AC6` | `$FFFFFFFF` |
| `$794A` | 0 |
| `$7B0A` | `$32`, the 50-pass arrival hold |
| `$7BAC` high word | `$000E` |
| `$797A` high word | `$0010` |
| `$7AC0` | `$1FF` |
| `$7A1C` | 0 |

It then calls the pose copy `$058F64`, `$55F60`, `$50B68` and `$4E21E`, and returns to `$05948C`
without drawing. The space position is not written here. It still holds what `$059268` left at the
last landing: the Body's centre `$5F40(a0)`, `$5FC0(a0)`, with Y = 64.

## The space pass, `$05872E`

`$05872E` clears the run-time word `$057F42` and points `a0` at slot 0's block at `$055C80` for
every craft. While `$790E` is non-zero it runs a scripted flight instead (below). In free flight,
`$0587D8`–`$058CFE`:

1. **Roll** `$7ABE` = 0. The stick is `$79C2`, or the replay table while `$7A0C` is set.
2. **Turn rate** `$7970`. It is multiplied by `+4` unless `rate − $FF000000` is negative, then gets
   `+8` added for right or subtracted for left. Right is tested first.
3. **Pitch rate** `$7974` follows the same rule, with **up adding** and down subtracting.
4. **Speed** `$797A` = `(V + throttle × +$1C) × +$14 × range / (range + $00101000)`. `$00101000` is
   65,536. Quotients are log-table subtractions.
5. **γ and the panel** (#551): `s = V² + 1024`, `$7876` = word(√s), and one of three forms of
   `c·v/√s` into `$4DFEC`.
6. **Displacement.** The frame's sines give `Z += word(cos p · cos y · V)`,
   `X += word(cos p · sin y · V)` and `Y += word(sin p · V)`. Each word saturates at an exponent
   above 14 and rounds on the last bit shifted out, and is sign-extended into the long.
7. `$7ACA` = 0 and `$7BC8` = 0.
8. **Yaw** `$7AC2` += word(turn rate). There is no saturation test, so a rate at exponent 15 or
   more wraps.
9. **Pitch** `$7AC0` = `$200` + word(pitch rate × 2^`+$E`). Slot 0's `+$E` is 2, so this is four
   times the rate.
10. The pose `$7AB2`/`$7AB6`/`$7ABA` is the space position.

Slot 0's block is: damping `+4` = `$FFFF1E00` (0.9375), acceleration `+8` = `$00001000` (1.0),
`+$E` = 2, lag `+$14` = `$FFFF1000` (0.5), and gain `+$1C` = `$00001900` (1.5625). A rate held by
the stick settles at 16 a pass, so the nose settles at `$200` ± 64 and the craft turns 16 yaw units
a pass.

At level pitch, `cos p` is −1, so a positive (forward) throttle moves the craft **against** its
facing, and the launch's reverse throttle moves it along its facing. A craft stays at level pitch
unless the stick is held. So in space it flies level and turns, and it can't loop.

The pass never reads `$51D22`. Every rate is per pass, as on a Body (ADR 0051).

## Range, nearest Body and arrival, `$052DB0`

The frame loop calls `$052DB0` at `$059900`, after the pass and after the pose copy has put the new
attitude into the camera words `$7A9E`/`$7AA0`/`$7AA2`. For each Body offset `a0` = 4 × Body, from
`$7C0E` down to 0:

- A Body whose Y long `$626A(a0)` is negative is out of the scene and skipped.
- The offset `(Body − craft)` on each axis is converted by `$04BDD8`. It is rotated by `$05668A`
  through the nine floats at `$42C20`, and the rows are stored at `$840(a0)`, `$340(a0)` and
  `$5C0(a0)`. Its length `√($840² + $5C0² + $340²)` is stored at `$15C0(a0)`.
- The smallest length goes to `$791C` and its Body to `$7924`. The compare is `cmp.l`, keeping
  a length only when the subtraction is negative, from a start of `$00201000`.

The view matrix is the camera's (`$055F60` into `$42C08`–`$42C1C`, then `$045710`). With `r`, `p`
and `y` the camera words:

```text
row 0 = ( cos p · sin y,                     sin p,          cos p · cos y )
row 1 = ( sin r · sin p · sin y + cos r · cos y,   −sin r · cos p,   sin r · sin p · cos y − cos r · sin y )
row 2 = ( sin r · cos y − cos r · sin p · sin y,   cos r · cos p,   −(sin r · sin y + cos r · sin p · cos y) )
```

Every product and sum is the program's (`$04BD34`, and an inlined copy of it in `$05668A`). The sum
can leave an unnormalised mantissa of `$2000`, whose log is read from the word just past the log
table: `$066000` = `$FFF0` in every memstate. That is what the regenerated log-table rule in ADR
0051 gives for `$2000`.

After the scan, `$052FBC` decrements `$7B0A` and skips the arrival while it is non-zero. Once it is
zero, `$052FCA` copies `$7924` to `$7920`, and `$052FDA`–`$052FEA` raises `$7A28` when
`range.exponent − $6040(a0).exponent` is −8 or less. The two words compared are the exponent words.
The extent is 256 radii (#424), so the craft arrives within 1–2 radii, depending on the two
mantissas.

The hold is what keeps a launch from landing where it started. The `return` case shows it. Space
is pressed in the first space pass, the range to Dion stays at exponent 9 against Dion's 17, and
the arrival is raised on the pass the hold runs out.

## Landing, `$059268`

`$059920` takes `$7A28` and calls `$059268`, in the same frame as the pass and the scan:

1. `$7AAE` = 0 and `$7A28` = 0. `a0` = `$7920`, and Y `$7AB6` = `$1800000`.
2. `$04E936`, the landing point:
   - **longitude** = `atan2(float(craft X − Body X), float(craft Z − Body Z)) ^ $200` → `$7A1E`.
     X's high word is `((longitude − $62EA(a0).w) << 6) >> 4`, as a signed word, and the low word
     is 0.
   - **latitude**: `q = float(craft Y) / $6040(a0) × 256`. At exponent 0 or more it is the pole,
     0 or `$200` by the sign. Otherwise it is `atan2(√(1 − q²), q)` → `$7A22`. Z's high word is
     `((latitude − $100) << 7) >> 4`.
   - `$04EA02`: `$79BE` = `atan2(float(Body X), float(Body Z)) ^ $200`, the terminator word of the
     [day/night note](damocles-day-night-terminator.md).
3. `$54770` queues Damocles Script trigger `body + $1F` where `$7CB4 + body + $1F` is armed. This
   is skipped for the Bodies at offsets `$2C` (ERIS) and `$74` (DAMOCLES, the comet; VOID is
   `$78` and is not in the scan). See [the landing triggers](#the-landing-triggers-567).
4. It writes `$7AC6` = `a0` and `$7918`, and `$7C88`/`$7A1A` from `$60C2(a0)`. It writes
   `$7948`/`$7946`/`$794A` from the Body's records. The space position becomes
   `($5F40(a0), $40, $5FC0(a0))`.
5. It writes `$7A16`/`$7A2A`, sets `$78A6` = −1, runs the pose copy (which masks X's and Z's high
   words to twelve bits), sets `$794E` = −1, and binds the Body with `$56488`. Then come the pose
   copy again, `$54B2E` and `$50B68`.
6. The support search `$0583EA`. On a support it sets `$7BC8` = `$3F` and Y's low word to the
   support's top plus 63. Otherwise it clears `$7ACA`, `$7BC8` and `$7B02`. The search opens with
   `tst.w $7AB6; bne` and refuses any Y whose high word is not nought. Y's high word is `$0180`
   here, so from the landing it always refuses, and the support branch is never taken (#567).

`$04EA48` is an octant `atan2` of two floats, 1,024 a turn. It sets bit 4 of the octant for a
negative first operand, bit 8 for a negative second, and bit 2 when the first is not smaller. Its
ratio (the smaller over the larger, × 256, as a word) indexes the byte table at `$063002`. The
octant indexes the words at `$04EAF2`:

| Octant | 0 | 2 | 4 | 6 | 8 | 10 | 12 | 14 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Word | `$0000` | `$8100` | `$8400` | `$0300` | `$8200` | `$0100` | `$0200` | `$8300` |

A set bit 15 negates the table angle before the offset is added. `$04BDD8` is `$04BDD4` without its
28-bit mask: the exponent is the highest set bit and the mantissa the next eleven bits, truncated,
with the sign on the mantissa.

The craft stays **aboard**, 25,165,824 above the Body with its throttle, speed, pitch and yaw
unchanged. In `cross` it arrived at key 9 with the nose at `$1E7`. It climbed from Y `$1800000`
back past `$1F00000` in 242 passes and re-entered space. Getting down is ordinary flight: throttle
off, nose down, and the landing rules #549 decoded.

## The scripted flight, `$790E`

`$790E` is set only at `$0510D0`, which also points `$78F0` at the waypoint list `$05843C`. That is
on the path the crash tail reaches through `$051036`. While it is positive, `$058746`–`$0587D6`
shrinks the space position towards the Body by `$F100`/65,536 a pass, less `$100000` in Y, and
turns the yaw down by one a pass. Once the Z high word reaches `$20` it sets `$790E` = −1. While it
is negative, `$058450` follows the waypoint commands 1–3 at `$78F0` and `$78F4`. No free-flight
route reaches it. It's a presentation sequence, not flight, and it is outside #558.

## The Body turn clock (#567)

The landing reads the destination's rotation accumulator `$62EA(a0)`. `$051E4E` adds every Body's
rate `$835C(a0)` to its accumulator in one loop, once a VBL, 32 longs in eight groups of four. So
every capture's table is the first world's plus each Body's rate times one VBL count `V` that all
Bodies share. With `V` solved from ERIS, whose rate 321 is odd, all 62 memstates hold to it:
`eris-spaceport-onfoot`, the port's start, is at `V` = 18,111, and `dion-north-airborne` is at
93,613. In four of them (`damocles.clotho`, `damocles.cronus` and their rehosted copies) the
capture came partway through the loop, and Bodies 19 on (CLOTHO) or 17 on (CRONUS) are one VBL
behind. The two traced landings' stops before landing hold to it too, at 94,261 (`return`) and
94,606 (`cross`), for all thirty Bodies in the scan.

`V` can be solved from any Body with a non-zero rate. It is found modulo 2^(32 − k), where k is
the power of two in that Body's rate. No rate has k above 4, so the part left unknown never
reaches bits 16–25 of any accumulator, which are the angle the landing and the terminator read.

`$04EA02`'s terminator word, taken from each Body's first-world place with the table `atan2`,
equals the `subStellarLongitude` every arrival Pose captured. The one exception is the comet's,
which had moved.

## The landing triggers (#567)

In the first world the arming table `$7CB4` holds a one-shot `$80` at `$20`–`$3C`, one byte for
each Body from ICARUS to DAMOCLES. ERIS's `$2A` is `$80` too, but the landing never fires it.
TOLOSA's `$38` is `$C0`, so it is sticky. DAMOCLES's `$3C` is `$A0`, queueable, and is never
fired either. Each memstate has disarmed the triggers of the Bodies landed on in its
history. `dion-north-airborne` has DION's `$23` at `$00` and LACHESIS's `$26` at `$80`.

So the `cross` landing **did** fire a trigger. At the landing stop `$26` goes to `$00` and the
busy bit 6 of `$7BD9` is set. Thirty-eight passes later, at stop 253, a message is presented
(`$7BA0` set, `$7B98` = `$72336`, reading on to `$7235A` by stop 260). The
`return` landing on DION fires nothing, since `$23` was already disarmed. #572 decoded the
scripts: see [the landing messages](damocles-landing-messages.md).

## Bodies

The Body table is the same in all 62 memstates except the comet, DAMOCLES (Body 29), which moves
(#538). Eight later memstates (`perseus`, `thalia`, `tolosa`, `dion-2-3` and `dion-north-airborne`,
tracked and rehosted) flag ERIS and DAMOCLES out of the scene, with Y = `$80000000`. So in those
states neither can be the nearest Body or a destination. Why they are flagged was not traced.

## Corrections to earlier notes

- **[Arrival routes](damocles-arrival-routes.md#space-is-a-third-occupancy-and-the-destination-is-the-nearest-body).**
  "On acceptance it commands `$7BAC = $000E`": the launch writes `$000EF000`, a reverse throttle at
  exponent 14. The space entry then writes the high word `$000E` and keeps the mantissa's sign. The
  "fifty-frame hold" is `$7B0A`, set by the entry and counted per space frame. "The minimum
  distance minus the body's own extent word below −7" compares the two floats' **exponent words**.
  "Drops the craft in at `$7AB6 = $1800000`" is right, but the craft stays aboard and keeps its
  motion. Stepping out needs a flight down and a landing.
- **[Craft control](damocles-craft-control.md#unresolved).** "`$7B0C` and the space routine … are
  for the launch sub-issue": decoded above. "Space (occupancy 2, slot 0's parameters) is
  dispatched through the same table" holds. The space pass is a separate law over slot 0's
  words, not the common pass with slot 0.

## What this means for the port

1. **Space is a third Occupancy with its own pass.** It shares the number system, the tables and
   the per-pass clock with the surface Mover (ADR 0051). It needs slot 0's block and two new
   state words: the pitch rate `$7974` and the space position. The pitch is derived, not
   integrated.
2. **The range needs the view rotation to be exact.** Mathematically it is the length of the
   offset, and a real-valued length differs in the last bit often enough to move the speed. An
   exact port rotates by the camera matrix first, in the program's floats.
3. **The destination is not chosen.** It is the nearest Body in the scene when the hold has run
   out and the range is close enough. Crossing to a Body means flying at it.
4. **Arrival leaves the player aboard over the sub-craft point.** The Body switch runs at that
   point (ADR 0046), and the surface Mover takes over at Y `$1800000` with the motion kept. The
   landing point and `$79BE` come from the recovered formulas, not from an arrival Pose.
5. **What a Save carries in space**, beyond #557's words: the pitch rate `$7974`, the space
   position, the hold `$7B0A`, the nearest Body `$7924`/`$7920` and the range `$791C`. The range is
   recomputed after every pass, but the next pass reads the last frame's value. The swing flag
   `$7B0C` is also needed aboard.
6. **Constants to publish**, with their addresses: the launch gate 100, the launch throttle
   `$000EF000`, the speed exponent `$F000`, the swing step 16 and its bounds `$180`/`$300`, the
   space entry `$1F0`, the entry words `$000E`/`$0010`/`$1FF`, the hold 50, `$00101000`, the
   arrival gap −8, the landing Y `$1800000`, the octant words and the arctan byte table.

## Unresolved

- **What the Body switch `$56488` does in space-arrival terms**, beyond binding the Body. The port
  lands at the recovered point and binds the Body as its switch does
  ([ADR 0052](../adr/0052-land-a-damocles-craft-at-the-recovered-landing-point.md)).
- ~~**The landing message.**~~ Decoded by #572 in
  [the landing messages](damocles-landing-messages.md). Most are a gazetteer line that a random
  draw skips about two landings in three.
- **The out-of-scene flag** on ERIS and DAMOCLES in later memstates. It is probably tied to the
  impact, but that is not established.
- **The panel's first form** (`$7876` ≤ `$20`) was not reached in space. Every traced space pass had
  γ above 1.
- **The replay path** (`$7A0C`) in space, as on a Body, and the **scripted flight**.

## Source ranges

Half-open ranges in the pinned first-world RAM. Where #549 already cited a range, the digest is
the same.

| Range | SHA-256 |
| --- | --- |
| `$055822`–`$055868` launch handler | `d4dbfddb9a28b43d80e4c7cefdef3882351825fed0633c5ba501fb5ef074ccb5` |
| `$055868`–`$0558AE` space entry | `eb193170a09a39028b34473a21667a745447b4c7019bd2513dff3586793bcbc8` |
| `$057F18`–`$057F42` post-launch pitch swing | `d4aa7b1a05ec6f9f22460fa56a571b9845d4d8fe6ff3a761b61596e31bf6037c` |
| `$05843C`–`$05872E` scripted flight | `24cb8e9a26d8576be1fbd53ac1262a6fa0762f54ddc8cdafa95e93ef3cd349b3` |
| `$05872E`–`$058CFE` space routine | `cde96a44c774bc9095bda93f77e8b2f1c41cac9f4e718b8a28bb424fe0c6b405` |
| `$05976A`–`$05977A` space entry test | `19de5626a9d33d176410c75df2182972f10b20b4c43723748a95946aae116444` |
| `$0598A6`–`$059932` space frame path | `23484d3860aff08d2587c3eff6eae859368d604834f3b0b2eb213f7cda7bee40` |
| `$052DB0`–`$052FF0` range, nearest Body, hold and arrival | `e7fa3bd957c7b989f4bf8e36e067d42a8f8f00c3520234b64c76d17b74654ee9` |
| `$059268`–`$05935A` landing | `3e79910e52da4899906d22068f362038bc41003029143e565fa0093c98812062` |
| `$04E936`–`$04EA48` landing point and `$79BE` | `10ed4b23caad158c068223ff437686b94ccd583de338eed19e62692d363a9f05` |
| `$04EA48`–`$04EB02` `atan2` and its octant words | `7dbc2fa031436dd26ca4f5fb0582ebebdbe82ac8c86ba87d0744b36f505e198b` |
| `$063002`–`$063104` arctan byte table | `1531a917798ca02861f9c4dfce4b275ef48fbc173950ef99e8a2c7884a939e0c` |
| `$04BDD4`–`$04BF00` int to float | `e395cf16f22ed8b645f08db6a3d69badfaa967a9f23fa9a2e13c4689e0034af9` |
| `$055F60`–`$056072` view sines | `f500e242dab42f5d26c1b0fd585df9e0246012ec22595ff178f98b73469362f8` |
| `$045710`–`$045914` view matrix | `4d94ca9db5b466608139d470f99939e28b69b4f5f5b7d2e53e55edcbe0792204` |
| `$05668A`–`$0568E0` rotation by the view | `d15a150f1e80fb99ba3269806d8e48a3fd7fe09c0c8c52452adcaa3979b4dad4` |
