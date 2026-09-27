# How a Damocles craft answers a refused move

Working-Authority Evidence for [#550](https://github.com/odogono/mercenary/issues/550)
(part of [#548](https://github.com/odogono/mercenary/issues/548)), recovered 2026-09-27.
Authoritative Evidence remains bound to the C64 Reference Build. This note records decoded
ST facts only and does not translate the program into a new model
([ADR 0002](../adr/0002-separate-rom-research-from-implementation.md)). RAM, captures and
traces stay ignored Restricted Material under `research/damocles-st/work/`. Only addresses,
decoded facts and hashes are recorded here.

## Decision

**A boarded move is refused only when the craft's point position lands inside one of the
bound cell's Building detail boxes.** Residents, other craft, Region Gates, the cell edge
and turning are not tested. Above Y 65535, in space and on foot the test never runs.

**A refusal is a bounce, not a stop.** In the frame the move is refused, `$05972E`–`$05976A`:

1. restores X, Y and Z from the copy taken before the move (`$7A3C`/`$7A40`/`$7A44`);
2. negates the sign-carrying mantissa of the throttle (`$7BAE`) and of the current speed
   (`$797C`);
3. runs the craft's control routine a second time. That pass is **not** tested, so the craft
   ends one full step *behind* where the frame started;
4. reclassifies the zone (`$05906E`);
5. sets the throttle exponent `$7BAC` to `$FFF0`, which is effectively zero. The mantissa
   keeps its flipped sign, so after a forward crash the throttle long reads `$FFF0F000`;
6. clears the `T` trim toggle `$7A1C`;
7. starts the bump, `$04C470`, on sound channel B (`$7A78` ← 3, `$4BF54` ← `$04C470`).

After that the craft glides backwards with its speed halving every frame until it stops.
Its speed stays negative and close to zero, which matches the panel's `- 000 000 000`. Nothing
repeats: the throttle is written once. **It is not overwritten each frame**, which corrects
[the arrival-routes note](damocles-arrival-routes.md#the-throttle-is-7bac-from-a-scancode-indexed-table).
A crashed craft looks inert because its throttle is now close to zero and pointed backwards.
Any digit or function key moves it again.

The known reproduction, key 4 from `boarded-limo.sav`, is refused exactly once, at VBL 425
after the throttle is set. It ends 66 units back from its last accepted position. That is the same
end position the earlier run `panel-velocity-key4-500vbl-20260924T151509Z-2029b532`
recorded (X 4686308, Z 8946338).

## Working Authority and evidence

| Item | Value |
| --- | --- |
| Program SHA-256 | `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef` |
| Static source | `observe-first-world-20260818T101013Z-c5a32b7d/observed.ram`, `b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967` |
| Snapshot | `boarded-limo.sav`, `bbcc82de0d5da96ad6db4b8b67b9165122b65b8d7a54c7e7fb78fba02bfbbab4` (V.I.P. LIMO, slot 5, Capital Spaceport cell) |
| Probe | [`research/damocles-st/scripts/collision-response-probe.py`](../../research/damocles-st/scripts/collision-response-probe.py) |

Decoded ranges, inclusive, in the pinned RAM. Every range is byte-identical in `boarded-limo.sav`.

| Range | SHA-256 |
| --- | --- |
| `$0596F8`–`$059769` boarded move and refused-move response | `585e3cd4697b4029055f9ed9a6545d0aa42f180bde93f24bed58c5221e5f44b9` |
| `$0590AE`–`$059125` box containment test | `9ce4c0b15598fcbf72926f2c144b5c41636e6c27300b27c550db6d30de01f619` |
| `$053A8C`–`$053B38` box list builder (cell bind) | `f2efa4c961dee6e48079cc33df051b2f1bc49a39242eb0c9aed92baa4e9cdc70` |
| `$057CC2`–`$057CEF` Occupancy and slot dispatch | `b9d1265f3e9126857a496c74fbde981131993a9ae6425e44b6fa20a0a36fd228` |
| `$057FE8`–`$058079` current-speed update | `22be75abe61467403076211543c5309a1b5d36b92fc014064fff4b3e16c43cf1` |
| `$04BD34`–`$04BDBD` log-domain add | `f608e622840c587f07f0338e9c1e37255e17b86ca703373ba91d4fa1a571244f` |
| `$0556AA`–`$055709` speed key handler | `2e780286e2112c6909886c7ac68a9985006c41dc80efd28c4847fba87637207f` |
| `$0557D6`–`$05581A` speed key table | `2c8f2fc579612e5d45af70b5804f7b6a05645ae4d090c6877070acfe68ed3a92` |
| `$05570A`–`$05572B` `T` trim toggle | `ea0fe93872b05d97ef844393c6c2e0f419591a175b84c9a9bc68723a2b9528bc` |
| `$054744`–`$054763` full halt (for contrast) | `928c8cb8fcba5cbaa976dc4c0c851c4dc0cc346e0b716a07b5ec69dd11b21384` |
| `$05A5F0`–`$05A645` region clamp (for contrast) | `fbea42d4ff2f04adc9e9da11614fe30ab959ebaec1d010a5c14fd6abbbd324d8` |
| `$0583EA`–`$05843B` support search | `aed65361dbe13fb59d29acdd4c97737ad5634f0d2530a6c1b428a1daa803b82f` |

## The boarded move

The frame loop branches on the Occupancy snapshot `$7A8E` at `$059456`: on foot falls
through, in space goes to `$059890`, and boarded goes to `$0596F8`. The boarded branch:

```text
$05970E  copy X/Y/Z $7AB2/$7AB6/$7ABA -> $7A3C/$7A40/$7A44
$059720  bsr $057CC2        craft control routine (the move)
$059724  bsr $05906E        zone
$059728  bsr $0590AE        box test; Z set = inside a box
$05972C  bne $05976A        accepted
         ... refusal, $05972E-$059769 ...
$05976A  $7A30 >= $01F0 ?  -> $055868 (reach space)
```

`$057CC2` dispatches on `$7AAE`: 1 goes to the on-foot walk `$058CFE`, 2 or more to space
`$05872E`, and 0 jumps into the slot's entry in the craft routine table,
`$055C80 + 32 * $7AB0`. The routine applies the stick, updates the current speed and adds
the displacement to the position ([#549](https://github.com/odogono/mercenary/issues/549)
owns its detail). The on-foot branch (`$05956C`) and the space branch (`$0598A6`) also call
`$057CC2`, and neither calls `$0590AE`.

## What is tested

`$0590AE` answers "is the craft's point inside a box":

- If the high word of Y (`$7AB6`) is non-zero, it returns *not inside* straight away. So
  nothing above Y 65535 collides, and neither does anything with Y below 0. The tallest box
  in any Building detail tops out at Y 30000.
- Otherwise it compares the **low words** of X, Y and Z (`$7AB4`, `$7AB8`, `$7ABC`),
  which are the intra-cell coordinates, against two lists in the scratch buffer at `$CB88`.
  Y is compared signed, X and Z unsigned, and every bound is inclusive:
  - **List A**, 7 words per box, `ymin ymax xmin xmax zmin zmax tag`, up to a negative word.
    These are also the boxes whose tops the support search `$0583EA` stands a craft or
    walker on. The tag is `$8000` in every box of every detail.
  - **List B**, 6 words per box, starting one word after list A's terminator, up to a negative
    word. These boxes are walls only.
- Inside any box returns Z set, which means refused.

The lists are the bound structure's **Building detail boxes**. The cell bind builds them
with `$053A8C`–`$053B38`, the same walk that publishes the extent rectangle
([placement class](damocles-placement-class.md#where-the-rectangle-comes-from)). It reads
the detail record backwards from its entry, scales Y by `$539D0` (always 1), scales X and
Z by `$539CE`/`$539D2`, adds the structure's intra-cell origin `$7AF2`/`$7AF4`, and swaps
each pair under a negative scale. So only the structure bound to the craft's current cell
can refuse it, and the boxes change when the cell bind runs.

Across the 61 Building detail Models in the pinned image, the records hold 36 list-A boxes
and 230 list-B boxes. Only Building detail 1, the one bound where a cell has no structure,
holds none. Capital Spaceport (detail 88) holds two A boxes and one B box. In
`boarded-limo.sav`, at scale 2, 1, 2 and origin 31958, 34328, they are:

| List | Y | X | Z |
| --- | --- | --- | --- |
| A | 0–300 | 32758–33558 | 33528–35128 |
| A | 0–850 | 32758–33158 | 35128–35528 |
| B | 600–850 | 31208–33208 | 35078–35578 |

The limo drives +Z along X ≈ 33240 into the face at Z 33528 of the first A box.

**Not tested aboard:**

- **Residents and other craft.** `$0590AE` reads only the two box lists. Nothing in the
  boarded branch reads resident positions for refusal. `$052C9C`, called first in the
  branch, only lists the objects that share the player's cell.
- **Region Gates.** The region clamp `$05A5F0` writes the clamped position back only when
  `$7AAE` = 1 (`$05A624`). On foot it thuds, and aboard it never refuses.
- **The cell edge.** The test uses intra-cell low words, so crossing into another cell is
  never refused. The new cell's boxes apply once its bind runs.
- **Turning and pitching.** Only the position is restored. The attitude written by either
  pass is kept, so a craft can always turn away from a wall.
- **The ground.** Descending below the ground is handled inside the control routine
  (`$057CF2`), not by this test. That is #549's vertical update.

## What the response does

### The throttle and speed are log-domain floats

`$7BAC` (throttle) and `$797A` (current speed) are each a long whose **high word is a
base-2 exponent** and whose **low word is a signed mantissa** normalised to about `$1000`.
The craft code multiplies them by adding their logarithms through the tables at
`a5 = $64000` and `a6 = $60000`, and adds them with `$04BD34`. The speed key handler
`$0556AA` writes `entry << 15` from the table at `$0557D6`. An even entry leaves low word
`$1000`, which is forward. An odd entry leaves `$F000`, which is reverse. So:

| Keys | Table entries | Throttle written |
| --- | --- | --- |
| `1`–`0` | 8, 10, … 26 | `$0004 1000` … `$000D 1000`: forward, exponents 4–13 |
| `F1`–`F10` | 9, 11, … 27 | `$0004 F000` … `$000D F000`: **reverse**, the same exponents |
| Space (`$39`) | `$80` (negative) | `$FF00 1000`: stop |

`-` and `=` scale the current value instead (#548's notes). The handler writes only when the
value changes, and only on a key event. Holding a key down produces one write.

Per pass, the current speed follows the throttle as `speed' = (speed + throttle · k₁) · k₂`.
The factors come from the slot's parameter block, the altitude, and ground contact (÷4 in
contact). With the throttle near zero, `k₂` is ½ for the limo: the exponent drops by one
each frame and the mantissa stays put. `$4DFEC` holds the linear magnitude of the speed,
without its sign.

### The bounce

Negating `$7BAE` and `$797C` flips the sign of both floats and keeps their size. The
second pass through the control routine therefore computes
`speed₂ = (−speed₁ − throttle · k₁) · k₂ = −speed₂′`, which is the forward speed the first
pass would have kept, with its sign reversed. It then moves the restored position by that
speed. At a steady speed the craft ends exactly one step behind the frame's start.

Nothing tests the second pass. Reversing into a box behind the craft would leave it inside
that box, and no route here exercises that.

The response then sets **only the exponent word** of the throttle to `$FFF0`. Unlike the
full halt `$054744`, which stops a craft on boarding and on landing, it:

- leaves the current speed `$797A` alone, so the craft keeps moving backwards;
- leaves `$4DFEC` alone;
- leaves the mantissa flipped, which is negative after a forward crash.

After a forward crash the throttle is tiny and negative, so the speed decays towards a tiny negative
value and never settles on zero or positive. That fits the speed field's
`- 000 000 000`. How the panel formats that field belongs to
[#551](https://github.com/odogono/mercenary/issues/551).

`$7A1C` is the `T` key's toggle. `$05570A` acts only aboard slot 14, and each `T` press
alternates `$7BAC` + 3 and − 3 on the exponent (×8, then ÷8). Clearing it on a refusal (and
on every speed key and halt) makes the next `T` press multiply first.

## In the trace

`collision-response-poke-500vbl-20260927T102925Z-baf09896` pokes key 4's throttle
`$00071000` into `$7BAC` and samples every VBL. Frames take 8 VBLs, and each row below is
one frame. At VBL 424 the speed has settled at exponent 5, mantissa `$10CE`, 34 units per
frame, with (−6, +33) per frame in X and Z.

| VBL | `$7BAC` | `$797A` | `$4DFEC` | X | Z | Pre-move copy X, Z | Channel B |
| ---: | --- | --- | ---: | ---: | ---: | --- | --- |
| 424 | `00071000` | `000510CE` | 34 | 4686297 | 8946404 | 4686303, 8946371 | idle |
| 425 | `FFF0F000` | `0005EF30` | 34 | 4686303 | 8946371 | 4686297, 8946404 | `$04C470` (`$7A78` = 3) |
| 433 | `FFF0F000` | `0004EF30` | 17 | 4686306 | 8946354 | 4686303, 8946371 | `$04C4EA` |
| 441 | `FFF0F000` | `0003EF30` | 8 | 4686307 | 8946346 | | |
| 449 | `FFF0F000` | `0002EF30` | 4 | 4686308 | 8946342 | | |
| 457 | `FFF0F000` | `0001EF30` | 2 | 4686308 | 8946340 | | |
| 465 | `FFF0F000` | `0000EF30` | 1 | 4686308 | 8946339 | | |
| 473 | `FFF0F000` | `FFFFEF30` | 1 | 4686308 | 8946338 | | |
| 481+ | `FFF0F000` | `FFFEEF30`, falling | 0 | 4686308 | 8946338 | | |

Reading it against the decode:

- The refused move would have taken Z's low word from 33508 to 33541, past the box face at
  33528.
- The frame ends at the pre-move copy minus one step: (4686297 + 6, 8946404 − 33).
- `$797A`'s mantissa goes from `$10CE` to `$EF30`, which is `−$10D0`. `$04BD34` rounds the
  low bit, and the exponent is unchanged.
- The glide adds 17 + 8 + 4 + 2 + 1 + 1 = 33 units. In total the craft ends 66 units back
  from its last accepted position.
- The sound request `$7A78` reads 3, then 1, then 0, as channel B takes the bump and moves on
  to `$04C4EA`.

The `tap` run (real key 4, pressed and released) and the `hold` run (key 4 held for all
500 VBLs) produce the same positions, speeds and end position as the poke, with one refusal
each. It lands at VBL 410 because the key reached the game before sampling began. Holding
the key does not re-arm the throttle.

## After the crash

Two runs repeat the poke, and at VBL 480, after the glide has ended, write a second throttle.

**Forward again (key 4, `$00071000`).** The limo accelerates from rest: 17, 25, 29 units
per frame. At VBL 504 it is refused a second time, from 16 units short of the face, and the
response repeats exactly. The pre-move copy is (4686296, 8946408). The frame ends at
(4686301, 8946376), one step back. `$797A` becomes `$0005EFB8`, which is the exponent-5
speed the refused pass would have kept, negated. The throttle becomes `$FFF0F000`, the bump
plays, and the glide halves back to rest at Z 8946344. So a craft driven at a wall bumps
once for every speed key press that carries it into the wall. It does not bump once per
frame.

**Reverse (F4, `$0007F000`).** The limo accelerates away backwards (−17, −25, −29, −32,
then −33 and −34 units per frame in Z) and reaches the same steady magnitude as forward,
`$0005EF30`, 34 units per frame. It is not refused again.

The long tail of the first run shows where a crashed craft settles. With the throttle at
`$FFF0F000`, `$797A` keeps losing one exponent step per frame. It reaches `$FFF4EF70` by
VBL 640, and its mantissa starts to drift as it nears the tiny negative target. `$4DFEC`
has read 0 since VBL 481, so the craft does not move.

## For the port

- **Refusal is a containment test of one point** against the bound structure's Building
  detail boxes, with inclusive bounds in intra-cell coordinates, skipped when Y ≥ 65536 or
  Y < 0. The boxes are static model data. The Catalogue walks past both lists in
  `decode_detail_extent` and publishes only the extent, so it needs to publish them (raw,
  per Building detail Model, list A with its tag and list B) before a craft Mover can refuse
  anything. The scale and origin are applied at use, as for the extent.
- **In the refused tick** under ADR 0049, restore the position, negate the speed and throttle
  signs, run the craft step once more without testing it, and set the throttle exponent to
  `$FFF0`. Keep the attitude from both passes. That is two craft steps in one tick, one of
  them discarded.
- **Do not zero the speed.** The glide back and the negative near-zero speed are the
  original's behaviour.
- **The bump is an event.** The soundboard's bump already plays on a refused move.
- **Speed keys fire once per press.** A held key is one write.

## What this does not settle

- **Reversing into a second box.** The second pass is untested, so a craft can end inside a
  box behind it. The next move from inside a box is refused again, which would bounce it
  back out. No capture exercises this.
- **Flying craft.** No flying-craft refusal was traced. A flying craft at or above Y 65536
  cannot be refused at all, and below that it meets the same boxes. Landing on a box top is
  the support search's job (#549).
- **Other slots' `k₂`.** The ½-per-frame decay was measured for the limo, slot 5. The
  factor comes from the slot's parameter block, which #549 decodes.
- **The panel field.** Which word the speed field formats is left to #551.

## Runs

All under `research/damocles-st/work/`, from `boarded-limo.sav`, one sample per VBL.

| Run | Throttle | Result |
| --- | --- | --- |
| `collision-response-poke-500vbl-20260927T102925Z-baf09896` | key 4 poked | one refusal, VBL 425 |
| `collision-response-tap-500vbl-20260927T102940Z-b555fb34` | key 4 tapped | one refusal, VBL 410, same states |
| `collision-response-hold-500vbl-20260927T102955Z-318f5212` | key 4 held | one refusal, VBL 410, same states |
| `collision-response-poke-640vbl-then-00071000-at-480-20260927T102809Z-572849a9` | key 4, then key 4 again at VBL 480 | refusals at VBL 425 and 504 |
| `collision-response-poke-640vbl-then-0007f000-at-480-20260927T102826Z-12d6e000` | key 4, then F4 at VBL 480 | one refusal, VBL 425; drives off in reverse |

The probe arms one FIFO breakpoint whose script takes the baseline and starts a chain of
single-VBL breakpoints.
Earlier failed attempts in `work/` stalled in the debugger. Each one ran while an orphaned
Hatari, left behind when a killed probe skipped its cleanup, was still sitting in its
debugger. Every run listed here ran with no other probe Hatari alive.
Three earlier runs of the key-4 series (`…T100619Z-593c969b`, `…T100639Z-276d61c2`,
`…T100654Z-4545f496`) started the chain with a FIFO `hatari-stop` instead. The poke run's
500 samples are identical to the listed poke run's, and the tap and hold runs are identical
to each other.
