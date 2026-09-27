# Damocles per-slot craft control routines

Working-Authority Evidence for [#549](https://github.com/odogono/mercenary/issues/549), the
first research ticket of [#548](https://github.com/odogono/mercenary/issues/548), recovered
2026-09-27. Authoritative Evidence remains bound to the C64 Reference Build. This note records
decoded ST facts only and does not translate the program into a new model
([ADR 0002](../adr/0002-separate-rom-research-from-implementation.md)). RAM, captures and traces
stay ignored Restricted Material under `research/damocles-st/work/`. Only addresses, decoded
facts and hashes are recorded here.

The question was what each per-slot craft control routine does between the throttle `$7BAC`,
the stick and the pose. Every rule below was decoded from the image and then checked against
the running program **pass by pass, bit for bit**. Collisions, launch, space and implementation
are out of scope.

## What was found

1. **Aboard, the craft pass runs once per rendered frame, not once per substep.** The frame
   loop sends a boarded player to a single call of the craft dispatch `$057CC2`. The on-foot
   substep loop is never entered. Nothing in the pass reads the frame's VBL count, so every
   rate here is **per pass**, and a pass took 2 to 8 VBLs in the traces depending on the
   scene.
2. **There are two control routines for surface craft, and they differ only in a tail.** Every
   flying craft branches to the common craft pass `$057F46`. The wheeled craft (slots 2, 5, 6
   and 13) branch to `$057DE6`, which runs the same pass and then makes one extra test. What
   separates a car from an aircraft is the parameters, not the code. A pitch step of zero
   makes a craft a ground vehicle.
3. **The 32-byte entry is the Craft Parameter Block**: a `bra.w`, then seven parameters. They
   are turn damping, turn acceleration, pitch step, roll exponent, speed lag, a word that is
   both the altitude ceiling and the launch gate, and thrust gain. Two further words are read
   by no craft routine.
4. **Speed is a first-order lag towards a target**, `V' = (V + T) × lag`, where the target is
   the throttle times 2 times the craft's gain. The target is quartered while in ground contact
   and multiplied by the altitude above 65,536 (at most ×32). The displacement is `V` along the
   attitude the pass starts with. **A flying craft has no vertical speed of its own.** It climbs
   only by pitching.
5. **A wheeled craft cannot pitch and cannot leave the ground by itself.** Its vertical step is
   the negated pitch term, which is never upwards. The "wheeled-craft gravity" that
   [#357](https://github.com/odogono/mercenary/issues/357) read at `$057DF0` lowers a per-frame
   copy of Y, not Y. It is a one-pass landing test, and a wheeled craft lifted clear of the
   ground **holds its height** at low speed.
6. **Take-off, landing, the ceiling and the entry into space are thresholds inside the pass and
   the frame loop.** A nose-up pitch survives in contact only at a speed of 32 or more. A touchdown is
   soft unless the step is below −100 or the nose is 45° down. Above `+$1A` × 65,536 the climb
   halves for each further 65,536. A pre-pass Y at or above `$1F00000` sends any craft into
   space.

The model in the probe reproduces **every one of the 2,659 modelled passes** (of 2,661 passes
aboard) in nine traced cases, with every compared word equal bit for bit. The words are X, Y,
Z, pitch, yaw, roll, contact, the support words, the turn rate and speed floats, and the panel
speed.

## Evidence identity

Static recovery reads the pinned first-world RAM
`observe-first-world-20260818T101013Z-c5a32b7d/observed.ram`, SHA-256
`b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967`. It was decoded with
Capstone M68K 68000 in the laboratory virtual environment. Readers and writers were found by
disassembling every even address in `$40000`–`$60000` and filtering the printed operand.

The probe is the tracked
[`scripts/craft-control-probe.py`](../../research/damocles-st/scripts/craft-control-probe.py),
SHA-256 `206b88d9ec5299bd813e62c8ee4bf03b6c7d531338cb84732af1ac86b2a77563`.

- `decode` hashes every range below and checks the instruction words the decode rests on. It
  checks the sine table against `sin(2π(i + ½)/1024)`, and checks that the routines, the craft
  table and the log, exponent and sine tables are **identical in all 62 memstates** (tracked,
  linked and rehosted). Only the three run-time data slots inside the routines, `$057DFE`,
  `$057E8E` and `$057F42`, are excluded.
- `trace` boots a memstate on the pinned Hatari 2.6.1 at the ordinary frame rate. It chains
  one PC breakpoint per craft pass on `$057CC2`, so the machine stops at the start of every
  pass and saves the craft state. Inputs are written from the stop scripts at fixed passes:
  the stick into its joystick-1 byte `$79C2`, and keys into the ACIA mailbox `$05558C`, which
  is what the keyboard handler itself writes. No host timing reaches the machine. Each pass is
  then replayed through `model_pass`, a Python transcription of the pass. It uses the
  program's own tables read from the stop, and the run records any word that differs.

```sh
python3 research/damocles-st/scripts/craft-control-probe.py decode
python3 research/damocles-st/scripts/craft-control-probe.py trace --roms roms --case limo
```

The cases are `limo`, `limo-lifted`, `limo-lifted-fast`, `eagle`, `eagle-slow`, `eagle-land`,
`eagle-crash`, `eagle-high` and `concord-ceiling`. The memstates are
`snapshots/boarded-limo.sav` (V.I.P. LIMO, slot 5, SHA-256
`bbcc82de0d5da96ad6db4b8b67b9165122b65b8d7a54c7e7fb78fba02bfbbab4`) and the rehosted Dion
pose `snapshots/rehosted/dion-2-3.sav`, where `B` boards EAGLE NINE S E, slot 3 (SHA-256
`361f5ca00cf2a0220489de25c81a7085e812cff019a1b2f44127f55db3ea2f80`). This is the Dion route of
[#357](https://github.com/odogono/mercenary/issues/357), and it boards the same craft as the
Vesta `EAGLE NINE S E` departure in the
[arrival routes note](damocles-arrival-routes.md#the-departure-chain).

## Where the pass runs

The frame loop tests the camera copy of the occupancy, `$7A8E`, at `$059512`:

| `$7A8E` | Path | Craft dispatch calls per frame |
| --- | --- | --- |
| 1, on foot | the substep loop `$059542`–`$059584`, `clamp($51D22, 4, 8)` times | one per substep (the on-foot Mover) |
| 0, aboard | `$05970E` | **one**; a second only when the collision test refuses the move |
| 2, in space | `$0598A6` | one |

The dispatch `$057CC2` loads `a5 = $64000` and `a6 = $60000`, the two tables below. On foot
it goes to the on-foot Mover `$058CFE`. With occupancy above 1 it goes to the space routine
`$05872E`. Aboard it jumps to `$055C80 + slot × 32`, the slot's table entry. The slot is the
word `$7AB0`.

The aboard path saves X, Y and Z, runs the pass, and runs the region box test at `$0590AE`.
When that test finds the pose inside a collision box, the path restores the pose, negates the
mantissas of the throttle `$7BAE` and the speed `$797C`, runs the pass again, and writes
`$FFF0` to the throttle's exponent at `$059750`. That is the collision response, recovered for
[#550](https://github.com/odogono/mercenary/issues/550) in
[PR #553](https://github.com/odogono/mercenary/pull/553). No pass traced here was refused.

The frame's VBL count is `$51D22`, written at `$0599B2` after the frame waits for the next VBL.
There is no minimum. **The craft pass never reads `$51D22`**, so a craft covers the same
distance per pass however long the frame took. Aboard, the traces measured these VBLs per
pass:

| Case | Scene | VBLs per pass, count |
| --- | --- | --- |
| `limo` | parked limo by the airport, looking at buildings | 6: 1, 7: 7, 8: 251 |
| `eagle` | EAGLE NINE S E climbing over Dion | 3: 563, 4: 270, 5: 54, 6: 4 |
| `eagle-land` | climb, turn, descent, landing | 3: 273, 4: 77, 5: 105, 6: 53, 7: 3 |
| `limo-lifted-fast` | limo 2000 above open ground at key 9 | 2: 169, 4: 7, 5: 13, 6: 16, 7: 13, 8: 1 |

So in ST time a craft's speed depends on what is on screen, from 2 to 8 VBLs a pass. ADR 0049
does not cover this: it decides substeps, and aboard there are none. What a pass is in port
ticks is a decision for the craft Mover ADR, the first of #548's planned sub-issues. This note
supplies the distributions, not a rate.

## The number system

The pass does all its arithmetic in a floating-point format of its own:

- A float is a long. The **high word is a signed binary exponent** and the **low word a signed
  mantissa** in units of `$1000`, normalised to 1.0–2.0 with its low bit clear. The value is
  `mantissa / 4096 × 2^exponent`. `$00061000` is 64, `$FFFF1E00` is 0.9375, and `$0005F000` is
  −32. `$FF001000` (2^−256) is the program's zero, which the stop preset `$054744` writes.
- **A product is a table add.** Each mantissa is replaced by its entry in the table at `a5`
  (`$64000`, indexed by the signed mantissa word), which holds `log2(mantissa)` as a 16-bit
  fraction with the sign in bit 0. The two longs are added, exponent into exponent with the
  carry. The sum's low word, after `ror.w #4` and `andi.w #$1FFE`, indexes the exponent table
  at `a6` (`$60000`). Products agree with real multiplication to within 0.06% over the
  mantissa range the decode sampled.
- **A sum** is `$04BD34`: it aligns the smaller operand by shifting its mantissa, adds, and
  renormalises. A result of exactly zero becomes the exponent less 16 with mantissa `$1000`.
- **To an integer**, the pass takes `mantissa × 2^(exponent − 12)`, rounding the last bit
  shifted out upward (`$05807A`–`$0580E0`, repeated for each axis). For words it uses
  `$05837A`–`$0583A6`.
- **The sine table** occupies the first 4 KiB at `$64000`, 1,024 floats with entry *i* =
  `sin(2π(i + ½)/1024)`. The half step means pitch `$1FF` and `$200` straddle level: `$1FF`
  has a sine of +0.00307 and `$200` of −0.00307. `$056072`–`$0560F0` writes cos and sin of
  roll, pitch and yaw to `$7ACE`–`$7AE5`, with cos taken as the entry 256 on. At every stop
  aboard except the first after boarding, the values at the start of the pass are those of the
  attitude the pass starts with (2,662 of 2,668 stops). On the six boarding stops the words
  still hold the on-foot attitude, and the model used them as stored.

A port that uses real arithmetic will not match the traces bit for bit. Whether to publish the
tables or accept real arithmetic belongs to the ADR as well.

## The Craft Parameter Block, `$055C80`

One 32-byte entry per slot. The offsets are from the start of the entry:

| Offset | Size | Read at | Meaning |
| --- | --- | --- | --- |
| `+0` | word | dispatch | `$6000`, `bra.w` |
| `+2` | word | dispatch | displacement to the slot's routine |
| `+4` | float | `$057F80` | **turn damping**: the turn rate is multiplied by it every pass |
| `+8` | float | `$057FA0` | **turn acceleration**: added, or subtracted, while the stick is held right or left |
| `+C` | word | `$057FC4`, `$0582A2` | **pitch step** per pass while the stick is held up or down; zero marks a ground vehicle |
| `+E` | word | `$0583B2` | **roll exponent**: roll is the turn rate × 2^(+E) while airborne |
| `+10` | float | none | not read by the craft pass, the space routine or any indexed read found |
| `+14` | float | `$05805E` | **speed lag**: `V' = (V + T) × lag` |
| `+18` | word | none | not read, as `+10` |
| `+1A` | word | `$058232`, `$05583C` | **ceiling** in units of 65,536 of Y, and the **launch gate** (at least 100 launches) |
| `+1C` | float | `$058028` | **thrust gain**, multiplying the target speed |

Every placed craft slot, with the table's own values:

| Slot | Craft | Routine | `+4` damping | `+8` accel | `+C` pitch | `+E` | `+14` lag | `+1A` | `+1C` gain |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | DART II | `$057F46` flying | 0.9375 | 1.0 | 8 | 2 | 0.5 | 900 | 0.78125 |
| 2 | 99 CHEVY | `$057DE6` wheeled | 0.9375 | 1.0 | 0 | −32 | 0.5 | 90 | 2.40234375 |
| 3 | EAGLE NINE S E | `$057F46` flying | 0.9375 | 1.0 | 8 | 2 | 0.5 | 900 | 0.78125 |
| 4 | BESTCUPAND CRAFT | `$057F46` flying | 0.9375 | 1.0 | 6 | 2 | 0.5 | 900 | 0.390625 |
| 5 | V.I.P. LIMO | `$057DE6` wheeled | 2^−16 | 6.0 | 0 | −32 | 0.5 | 90 | 0.525390625 |
| 6 | TARG TOURER | `$057DE6` wheeled | 2^−16 | 4.0 | 0 | −32 | 0.5 | 90 | 0.525390625 |
| 10 | CONCORD III | `$057F46` flying | 0.9375 | 1.0 | 12 | 2 | 0.5 | 90 | 3.125 |
| 12 | BULLET | `$057F46` flying | 0.890625 | 2.0 | 12 | 2 | 0.75 | 900 | 1.5625 |
| 13 | 22 CV | `$057DE6` wheeled | 2^−16 | 4.0 | 0 | −32 | 0.5 | 90 | 0.2626953125 |

The other slots, for completeness. None of them is among the placed craft this ticket lists:

| Slot | Name in the Catalogue | Routine | Notes |
| ---: | --- | --- | --- |
| 0 | (none) | `$05872E` space | the space routine; `lea $55C80,a0` at `$058734` means **space reads slot 0's parameters whatever craft is aboard** |
| 7 | INTERSTELLARSHIP | `$057F46` | pitch 2, `+1A` 900; the board gate refuses it |
| 8 | NEUTRON FUEL | `$057F46` | damping 2^−16, accel 16, pitch 1, lag 0.25, `+10` = 1.0, `+1A` 90 |
| 9 | (none) | `$057D64` fall | the slot-9 fall of #357: Y −37 a pass, `$78EE` +13, pitch +25, yaw +19 |
| 11 | ATTACK SHIP | `$057F46` | as slot 3 but `+1A` 90; the Catalogue marks it not boardable |
| 14 | AUTHOR'S CHAIR | `$057F46` | as slot 3, `+1A` 900, gain 3.125; the Catalogue marks it seatable |
| 15 | NEUTRON FUEL | `$057F46` | as slot 11 |

The launch table in the [arrival routes note](damocles-arrival-routes.md#launch-is-gated-on-ground-contact-and-on-the-crafts-own-parameters)
agrees with the `+1A` column. The full 512-byte table is `$055C80`–`$055E80`, SHA-256
`463e1cb0…6b01de` (below). The pass reads no Craft Parameter Block word other than these.

## The pass, `$057F46`–`$0583E8`

`a0` is the slot's entry. In the order the code runs:

1. **Gates.** While `$7B0C` is set, the pass goes to `$057F18`, which only swings the pitch 16 a
   pass. The launch handler sets `$7B0C`, which makes this the launch ticket's concern. While
   `$7A0C` is set, the stick is replaced by bytes replayed from a table at `$7A08` (see
   [unresolved](#unresolved)). Neither was set on any traced pass.
2. **Turn rate** `$7970`, a float. If it is above the zero (exponent at least −256), it is
   multiplied by `+4`. Then `+8` is added while the stick's right bit (3) is set, or
   subtracted while its left bit (2) is set, with right tested first. The steady turn rate is
   `+8 / (1 − +4)`. For the flying craft that is 16 yaw units a pass (18.3 for BULLET). The
   wheeled 2^−16 damping leaves the rate at exactly `+8` while the stick is held, 6 for the
   limo and 4 for TARG TOURER and 22 CV. Releasing the stick lets the rate fall almost to
   nothing in a single pass.
3. **Pitch** `$7AC0`. `+C` is added unless the down bit (1) is set, and subtracted unless the
   up bit (0) is set. So the up bit alone raises the pitch word (nose down) and the down bit
   alone lowers it (nose up), with the result masked to ten bits. **Nothing limits it**: the
   `eagle` trace held nose-up through the vertical to `$0BF`, and the craft looped.
4. **Target speed.** `T = $7BAC × 2`, the exponent plus one. If the float of −Y at `$79BA`
   (written by `$058FAA` in the pose copy) gives Y at or above 65,536, `T` is multiplied by
   `min(Y / 65536, 32)`, and the factor is stored at `$057F42`. If `$7ACA` shows contact, `T`
   is quartered (`$05802C`). Then `T` is multiplied by `+1C`.
5. **Speed** `$797A`: `V' = (V + T) × +14`. At a lag of 0.5 the steady speed is `T`. BULLET's
   0.75 makes it `3T`, and slot 8's 0.25 makes it `T/3`. Each pass closes half the remaining
   gap at 0.5. A cut throttle halves `V` every pass.
6. **Panel speed.** `|V'|` as an integer goes to `$4DFEC`, and `$7876` is set to `$20`.
   Whether the panel field draws this word is for
   [#551](https://github.com/odogono/mercenary/issues/551). It is the only integer copy of
   the speed.
7. **Displacement**, along the attitude sines read at the start of the pass:

   ```text
   ΔZ = int(cos pitch × cos yaw × V')      added to $7ABA
   ΔX = int(cos pitch × sin yaw × V')      added to $7AB2
   ΔY = int(sin pitch × V')                added to $7AB6
   ```

   With the half-step table, level pitch has a cosine of −1, so yaw `$200` (north) gives
   +ΔZ and `$300` (east) +ΔX, as the [yaw note](damocles-walk-board-flight.md#camera-yaw-and-world-axes--confirmed-working-authority)
   found on foot. **The ceiling:** when the vertical product is upwards and the high word of Y
   exceeds `+1A`, the product's exponent is lowered by the excess (`$058232`–`$058240`). The
   climb halves for every 65,536 above `+1A` × 65,536. **A craft whose `+C` is zero has ΔY
   negated** (`$0582A2`). The new X and Z high words are masked to twelve bits by the pose copy
   `$058F64` after the pass.
8. **Contact.** With Y below 64 the pass tests the landing gate. A step below −100, or a pitch
   at or above `$280` (a nose 45° or more down), goes to the landing handler `$057CF2` and the
   pass ends there. Otherwise Y becomes 63. With Y at 64 or above, the support search
   `$0583EA` ([#357](https://github.com/odogono/mercenary/issues/357)) either stands the craft
   on a support (the low word of Y becomes the top plus 63) or clears `$7ACA`, `$7BC8` and
   `$7B02`. On the ground or on a support, contact becomes 63 and roll 0. The pitch is then
   levelled to `$1FF` if it is nose-down, if `V'` is negative, or if `V'` is not above
   `$0004FFFF`. That last condition means **a nose-up pitch survives in contact only at a speed
   of 32 or more**. That is take-off.
9. **Yaw** `$7AC2` gains `int(turn rate)` (`$0583A6`). While the new pitch is in
   `$080`–`$17F`, within 45° of straight up, the rate is first multiplied by cos⁴ of the pitch
   read at the start of the pass. Near the vertical the heading barely turns. The yaw word is
   not masked here.
10. **Roll** `$7ABE`, only without contact: `int(turn rate × 2^(+E))`. A flying craft banks at
    four times its turn rate, about 64 (22.5°) at full turn. A wheeled `+E` of −32 gives 0.

The wheeled tail `$057DE6`–`$057DFD` then runs. When the pass has left contact clear, it
subtracts `$40` from `$7A30` and enters the landing handler if the result is negative. `$7A30`
is the pose copy's Y, rewritten from the pose by every call of `$058F64`: before the pass at
`$0594F6` and again after it at `$0597B8`. So the subtraction never accumulates, and it never
reaches Y or the drawn eye. The test amounts to this: **a wheeled craft whose Y before the pass
was 63 and which lost contact in the pass lands at once.** Starting from the ground, the pass
never produces that state (see below).

## By class

### Wheeled craft: slots 2, 5, 6, 13

- **No pitch.** `+C` is 0, so the stick's up and down bits change nothing. The `limo` trace held
  each for 20 passes and the pitch stayed `$1FF`. Boarding, the landing tail and the ground
  levelling all write `$1FF`, so aboard a wheeled craft the pitch is always `$1FF`.
- **Never upwards.** At `$1FF` the vertical product is +0.00307 V. The ceiling does not bind
  below Y 5,963,776, and the product is negated, so ΔY is −0.00307 V truncated. That rounds to 0
  below a speed of about 163. On the ground the pass clamps Y to 63 every pass, so a wheeled
  craft on the ground stays there.
- **Lifted clear of the ground it hovers or sinks slowly.** The `limo-lifted` control poked Y
  and `$7A30` to 2000. Contact cleared on the first pass, the craft held Y 2000 for 119 passes,
  and at key 4 it drove at **134 a pass**, four times its ground speed of 33.6, because the
  contact quartering no longer applies. At key 9 (`limo-lifted-fast`) it ran at 4,302 a pass
  and sank 13 a pass. It touched down softly after 150 passes, and its speed eased back to
  1,076 as the quartering returned. On an ordinary route the same state would follow **driving
  a wheeled craft off a support**: the support search fails, contact clears, and the Y before
  the pass is at least 64, so the wheeled tail does not fire. That route was not driven.
- **Turning.** The limo turns 6 yaw units a pass while the stick is held, and stops turning on
  release. TARG TOURER and 22 CV turn 4. 99 CHEVY is the exception: its damping is the flying
  0.9375 with acceleration 1.0, so it builds up to 16 a pass and coasts down.
- **Speed.** The limo at key 2 reached 8.41 a pass, the float `$000310CE` = 32 × 2 × 0.52539
  ÷ 4, within fifteen passes. At key 4 it reached 33.6. Reverse on `F2` (the table's odd entry
  `$0B`, mantissa −1) reached −8.41 at the same magnitude, and `Space` halved the speed every
  pass.

### Flying craft: slots 1, 3, 4, 10, 12

- **Climb and descent are pitch alone.** There is no vertical speed word. ΔY is `sin pitch ×
  V'` every pass, so a flying craft keeps no vertical momentum when the nose comes level.
- **Take-off** needs a ground speed of 32 or more, with the nose up. EAGLE NINE S E at key 4
  taxis at 50 = 128 × 2 × 0.78125 ÷ 4. With the stick down it left contact on the second pass
  (`eagle`, `eagle-land`, `eagle-crash`). At key 3 it taxis at 25, and the pitch was levelled
  back to `$1FF` on every pass for 30 passes of held stick (`eagle-slow`). The lowest key that
  lifts each craft from its own parameters: DART II and EAGLE NINE S E key 4, BESTCUPAND CRAFT
  key 5, CONCORD III key 2, BULLET key 1.
- **Airborne speed** is four times the ground speed below Y 65,536: 200 for the Eagle at key 4.
  Above that, speed grows with altitude. In `eagle`, speed rose from 202 to 615 as Y went from
  66,460 to 202,481 at pitch `$15F`, and it is capped at ×32 from Y 2,097,152.
- **Turning** banks the craft (roll 4 × rate). In level-ish flight the heading follows the rate.
  In `eagle-land`, yaw went `$1A0` → `$298` in 28 passes while roll rose to 53. In the `eagle`
  loop, at pitch `$0BF`, the same stick banked the craft to 63 and left the heading unchanged,
  which is the cos⁴ term.
- **Landing.** In `eagle-land` the craft came down at pitch `$22F` (ΔY −57). On the pass that
  crossed 64 it was set to Y 63, contact 63 and pitch `$1FF`. Its speed then eased 200 → 125 →
  87 → … → 50, and the throttle was untouched. In `eagle-crash` it came down at pitch `$27F`
  (ΔY −141). The pass that crossed 64 entered the landing handler, and the next frame, 55 VBLs
  later, had the player on foot with the throttle cut. What the landing handler does to the
  craft is the collision and crash work of #550.
- **The ceiling and space.** A craft with `+1A` of 900 has its ceiling at Y 58,982,400. It never
  gets there, because the frame loop sends any craft whose pre-pass Y is at or above
  `$1F00000` (32,505,856) into space at `$05976A` → `$055868`, without the launch handler's
  `+1A` test. `eagle-high` poked a climbing Eagle to Y 32,440,320. It crossed that height after
  37 passes and entered space as occupancy 2. `concord-ceiling` poked a climbing Eagle's slot
  word to 10 (CONCORD III, `+1A` 90) at Y 5,767,168. Its climb held at 7,502 a pass until Y
  reached 91 × 65,536, then halved to 3,751 and to 1,876 at 92 × 65,536. A craft with `+1A`
  of 90 levels off near six million and can never reach the height at which the game enters
  space.

## The throttle, for completeness

`$0556AA`–`$0556F8` reads the byte table at `$0557D6` indexed by scancode, for scancodes below
`$45`:

| Keys | Entry | `$7BAC` written |
| --- | --- | --- |
| `1`–`9`, `0` | 8, 10 … 26 | exponent 4 … 13, mantissa `$1000`: forward 16 … 8,192 |
| `F1`–`F10` | 9, 11 … 27 | the same exponents, mantissa `$F000`: **reverse** −16 … −8,192 |
| `Space` | `$80` | `$FF001000`, zero |
| `-`, `=` | — | × 0.984375 (`$FFFF1F80`), stopping below 1.0; × 1.03125 (`$1080`), capped at exponent 14 |

An odd entry sets the low word's sign, and the code turns that into mantissa `$F000`. So `$7BAE`
is simply the throttle's mantissa, and its sign is the gear. Each digit doubles the throttle,
so on the ground each digit doubles the craft's speed:

```text
V_ground(key n) = 2^(n+2) × +1C × lag / (1 − lag)          key 0 is n = 10
V_air           = 4 × V_ground × min(max(Y / 65536, 1), 32)
```

## Traces

| Case | Memstate, route | Passes aboard | Modelled and matched | What it shows |
| --- | --- | ---: | ---: | --- |
| `limo` | boarded limo: key 2, right, left, up, down, `F2`, `Space`, key 4, `Space` | 259 | 259 | throttle, lag, both turns, no pitch, reverse, stop |
| `limo-lifted` | limo, Y and `$7A30` poked to 2000, key 4 | 119 | 119 | a wheeled craft without contact holds its height at 4× speed |
| `limo-lifted-fast` | the same at key 9 | 219 | 219 | it sinks at 13 a pass and lands softly |
| `eagle` | Dion: `B`, key 4, nose up 40 passes, right, left, nose down | 891 | 891 | take-off, a loop, cos⁴ yaw, bank, altitude speed |
| `eagle-slow` | Dion: `B`, key 3, nose up 30 passes | 151 | 151 | no take-off below 32 |
| `eagle-land` | Dion: climb at `$1CF`, level turn, descend at `$22F` | 511 | 511 | turn and bank, soft landing |
| `eagle-crash` | Dion: climb, dive at `$27F` | 190 | 189 | the landing handler on the predicted pass |
| `eagle-high` | Dion: climb, Y poked to 32,440,320 | 130 | 129 | entry into space by altitude |
| `concord-ceiling` | Dion: climb, slot poked to 10, Y to 5,767,168 | 191 | 191 | the `+1A` ceiling |

In each run "modelled" is every pass aboard whose next stop is also aboard and in a new frame.
The two passes left out are the landing handler's (the model stops at the handler, as the pass
does) and the pass after which the frame loop entered space. No pass was refused by the
collision test. The run directories are under `research/damocles-st/work/`:

- `craft-control-limo-20260927T101951Z-eff77b09`
- `craft-control-limo-lifted-20260927T101954Z-eb81eff9`
- `craft-control-limo-lifted-fast-20260927T101957Z-f96ebe2e`
- `craft-control-eagle-20260927T103120Z-91691a9d`
- `craft-control-eagle-slow-20260927T102003Z-60b4ade0`
- `craft-control-eagle-land-20260927T102006Z-1d662161`
- `craft-control-eagle-crash-20260927T102009Z-394138ce`
- `craft-control-eagle-high-20260927T102012Z-535b3c45`
- `craft-control-concord-ceiling-20260927T102015Z-a9f973f6`

Every run records the probe SHA-256 above, program SHA-256 `8d512ac6…a2ef`, EmuTOS SHA-256
`154803e3…39d5`, Hatari 2.6.1 (binary SHA-256 `05723606…e11a`) and Python 3.13.15 in its
`trace.json`.

## Corrections to earlier notes

- **[#357](https://github.com/odogono/mercenary/issues/357) ground contact** (branch
  `t3code/issue-357`). "A wheeled craft that leaves the ground sinks back at 64 units a pass" is
  wrong. `$057DF0` lowers the pose copy `$7A30`, which the frame rewrites before and after the
  pass, so the step is the one-pass landing test above. Its reader table's "`$05802C` offsets a
  term by `$20000`" is the contact quartering of the target speed, and "`$0583AA` skips a
  `$7ABE` update" is the roll, which is written only without contact.
- **[Arrival routes](damocles-arrival-routes.md#the-throttle-is-7bac-from-a-scancode-indexed-table).**
  "`$7BAE` its sign-ish companion": `$7BAE` is the throttle's mantissa, and the function keys
  set it negative, as reverse gears. "Turn rate is about 250 yaw units per second" is 16 a pass
  at 3–4 VBLs a pass. It depends on the scene, not on a rate.
- **[Walk, board and flight](damocles-walk-board-flight.md#ground-craft-speed--confirmed-panel-ram-encoding-still-fog-208).**
  "Integer RAM cell for `+ 000 000 NNN`: Fog". `$4DFEC` receives `|V|` as an integer on every
  pass, and in the airborne Dion capture it reads 107 against a speed float of 107.03.
  Whether and how the panel draws it is left to #551.

## What this means for the port

1. **A single craft Mover is enough.** Wheeled and flying craft share one pass, and the wheeled
   tail adds a single test. The fall (slot 9) and space (occupancy 2, slot 0's parameters) are
   dispatched through the same table. That agrees with ADR 0016's two movers: the craft loop and
   the on-foot step.
2. **Publish seven numbers per slot**: `+4`, `+8`, `+C`, `+E`, `+14`, `+1A` and `+1C` as values,
   plus the routine class. `+10` and `+18` are unread and need not be published. The program
   constants belong in the same place with their addresses: throttle × 2, ¼ in contact, the
   altitude factor from 65,536 capped at 32, take-off speed 32, landing gates −100 and `$280`,
   the ceiling rule, the space entry at `$1F00000`, the cos⁴ window `$080`–`$17F`, level pitch
   `$1FF`, and eye height 63.
3. **Rates are per pass**, and a pass is one rendered frame. The ST's 2–8 VBLs a frame is the
   same kind of frame cost ADR 0049 kept out of the substep clock. The craft Mover ADR has to
   choose how many ticks a pass takes, and name the choice as a retained difference.
4. **Exact reproduction needs the tables.** Real arithmetic differs by up to about 0.06% a
   product, which compounds over a flight. The ADR decides whether that is accepted.
5. **What Save must carry aboard** (#548 item 6): the turn rate `$7970`, the speed `$797A` and
   the throttle `$7BAC` floats, pitch, roll and contact, beside the pose and yaw already saved.
   There is no vertical velocity to save.

## Unresolved

- **The landing handler's outcome.** `$057CF2` returns at once when the region box test
  `$0590AE` puts the pose inside a collision box, and again after setting Y to 63. Otherwise it
  sets contact and level pitch, calls the stop preset `$054744`,
  and branches on `$78A6 & $794A`. One side calls the leave path, and both jump to `$051036`
  with different sound vectors. `eagle-crash` ended on foot. Whether the craft survives, and
  what `$051036` does, is for #550.
- **The collision response** at `$05970E`–`$059760` is recovered for #550 in PR #553. No route
  here reached it.
- **`$7B0C` and the space routine.** The post-launch pitch swing `$057F18` and the space routine
  `$05872E`, which always uses slot 0's parameters, are for the launch sub-issue.
- **The replay path.** While `$7A0C` is set, the pass takes its stick from a table at `$7A08`,
  one entry per matching frame count `$7AE8`. `$051058` sets it with the table at `$06FD80`,
  on a path reached from `$051036`, which the landing tail jumps to. No traced pass had it
  set. It may be what the game plays after a crash.
- **Camera sway aboard.** After the pass the frame calls `$057EC8`. While the camera copy of
  contact `$7AAA` is set and `$78A6` is negative, it steps the camera pitch `$7AA0`, roll
  `$7A9E` and eye height `$7A32` through tables at `$057E02` and `$057E92`. `$78A6` is written
  by `$0560F2` from X/Z rectangles at `$78A2`. What it classifies, perhaps land against sea,
  is not recovered.
- **Driving a wheeled craft off a support** is predicted to leave it hovering at the support's
  height, from the decode and the `limo-lifted` control. No route drove it.
- **Slots 10, 11 and 14 in play.** CONCORD III's parameters were exercised only by relabelling
  an Eagle's slot word. ATTACK SHIP has a flying entry but the Catalogue marks it not
  boardable. AUTHOR'S CHAIR has a flying, space-capable entry, and whether a seated player can
  fly it was not tested.
- **The pass rate in seconds.** The ST's rate is a property of each scene. Nothing in the
  program fixes it.

## Source ranges

Half-open ranges in the pinned first-world RAM. Where #357 already cited a range, the digest is
the same.

| Range | SHA-256 |
| --- | --- |
| `$055C80`–`$055E80` craft table, slots 0–15 | `463e1cb0c1e349a112f920e3e61a639b4cb685ee784fbc57f43ed5e6ab6b01de` |
| `$057CC2`–`$057CF2` craft dispatch | `1182d9a00b52e2ec9f5a1ba17a67a670a9983c30f965b0d3a8806316508f7a63` |
| `$057CF2`–`$057D64` landing handler and tail | `dfb9b335c3e0c6d51c8b85a76ca865c5f5c05598814d1c00657490f5ddd1dcff` |
| `$057D64`–`$057DE6` slot-9 fall | `8341ba2fd7f065953a9eeac8f6661ac49431c8020c04681ea3e9a37bc554b703` |
| `$057DE6`–`$057DFE` wheeled tail | `9fa1f3e044d1e09e2af92fbc7d979d199e3c0340a37b971001ceed22db6cf45c` |
| `$057F18`–`$057F42` post-launch pitch swing | `d4aa7b1a05ec6f9f22460fa56a571b9845d4d8fe6ff3a761b61596e31bf6037c` |
| `$057F46`–`$0583EA` common craft pass | `3cc20597cbdfa4d4a8269b836f61aafd41294a3f0d34ca47f200217a567ee7dd` |
| `$0583EA`–`$05843C` support search | `aed65361dbe13fb59d29acdd4c97737ad5634f0d2530a6c1b428a1daa803b82f` |
| `$04BD34`–`$04BDBE` float add | `f608e622840c587f07f0338e9c1e37255e17b86ca703373ba91d4fa1a571244f` |
| `$056072`–`$0560F2` attitude sines | `84082e7d4931e5188cdefe2b855a7c55417ffd050dd990b2f36f187121537448` |
| `$058F64`–`$058FB0` pose copy and `$79BA` | `81392eb9764cb9c17a22fecc4bfd4aa95c1146af6c67375f463abb40dd64f405` |
| `$0556AA`–`$055708` throttle keys | `a8a643d5c8d8e85c3df35123651a7549fc94c8fa7cf9e9a8e51ab2b5e0bad866` |
| `$05575E`–`$0557D6` throttle scaling, `-` and `=` | `1846084583c590ac5fe7c4946c2a0e1d1ebd97d1fb0c53c55f9df5c4098f3f31` |
| `$0557D6`–`$05581B` throttle table | `2c8f2fc579612e5d45af70b5804f7b6a05645ae4d090c6877070acfe68ed3a92` |
| `$054744`–`$054764` stop preset | `928c8cb8fcba5cbaa976dc4c0c851c4dc0cc346e0b716a07b5ec69dd11b21384` |
| `$05970E`–`$05977A` aboard frame path, collision re-run, space entry | `156ab40d5308dce57786291b713d075a1714822d6f487cf7521309ab3412014c` |
| `$059542`–`$059586` on-foot substep loop | `b0f11f0bef584d4464d95ddc21bf996240e93766ae26a5b6296ef2c12b42c415` |
| `$060000`–`$066000` exponent, sine and log tables | `e565eb77e3af42dfd661ff6880cda43e2b16b3a874e244ebe1be0d5c74865673` |
