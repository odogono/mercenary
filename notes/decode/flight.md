# Flying: craft parameters and the control loop

Research notes for the flight step. The first half was written while scoping the
step; the second half records the full read that the build needed, and corrects
three things the scoping pass had guessed at.

## The flag we have been asserting all along

`$7F` is `FLYING_FLAG`: `$00` flying, `$3F` walking, driving, or taxiing. Our
capture loader has been requiring `ram[0x7F] == 0x3F` since the geometry work as
its "initialized runtime state" marker — it has always meant "the player is on
foot".

## Craft parameter blocks

Sixteen-byte blocks at `$9DAD`, copied verbatim into the live block at `$BEA0`
when the player boards (`$9D99`, indexing by `slot * 16`). Bytes are read in
pairs and fed to `FP_MUL` / `FP_ADD`, so most pairs are one value in the engine's
own sixteen-bit float format.

**The table is eleven blocks, not eight.** `$9DAD + 11 * 16 = $9E5D`, which is
exactly where `CONTROL_9E5D` begins, so the run of blocks ends where code
resumes. The eight craft occupy slots 0-7; the three that follow are mode blocks
the engine installs itself rather than by boarding:

| Block | Address | Handler | Role |
| --- | --- | --- | --- |
| 8 | `$9E2D` | `$9F17` | A landed craft taxiing — the same handler the craft use |
| 9 | `$9E3D` | `$9EBE` | Crash tumble / autoland |
| 10 | `$9E4D` | `$9E66` | Descent under the parachute |

The scoping pass said these parameters existed only in a live capture and that they
dispatched to `$9E60`. Both were wrong: they are in the ROM at `$9E2D` like any
other block, and they dispatch to `$9F17`. `LEAVE_CRAFT`'s touchdown path is what
installs them — it copies ten bytes from `$9E2F` into `$BEA2`, that is offsets 2-11
of block 8 into the live block, leaving the handler pointer alone because it is
already `$9F17`.

**Block 8 is not the on-foot walk.** A first reading took it for that, and the
underground step caught the mistake. It is the block a *landed craft* runs on, which
is why touchdown installs it: a craft on the ground handles differently from one in
the air. The on-foot walk never reaches the control loop at all — see below.

### The sixteen-bit float format

A value is a mantissa byte and an exponent-and-sign byte, in that order (the
control loop's `ldx $bea2 / ldy $bea3` pins the order: low byte is the mantissa).
In registers the mantissa is `X` / `$08` and the exponent `Y` / `$09`.

* **Mantissa** carries an implicit leading one, like IEEE: significand =
  `1 + m/256`, so it lies in `[1, 2)`. `FP_ADD`'s normalisation shifts left until
  the leading one falls out of the byte, which is what makes it implicit.
* **Exponent byte**: bit 0 is the sign of the value, bit 1 is scratch and always
  stored as zero, and the exponent is the byte read as a signed integer and
  shifted right by two. One power of two is therefore `$04` in this byte — the
  same step the geometry work already found at `$A8E9` and in `FOCUS`.

So `value = (-1)^sign * (1 + m/256) * 2^(int8(e) >> 2)`.

`FP_MUL` (`$82FA`) adds the two exponent bytes as plain bytes, which is the whole
trick: the exponents add, the sign bits in bit 0 exclusive-or, and the carry out
of bit 0 lands in the scratch bit 1, which `AND #$FD` then clears. The mantissas
multiply through a log table at `$5800` and an exp table at `$5900`. Signed
overflow of the exponent add saturates to `$78` or `$84` with the mantissa
zeroed, so there is no zero and no infinity — the smallest magnitude is about
`2^-31`, which the engine treats as zero.

Negation is `INY` on the exponent byte, because bit 0 is the sign. The control
loop turns right by doing exactly that to the yaw authority before adding it.

A first check that the reading is right: block 0's damping pair decodes to
`0.9375`, and every craft's speed damping lands in `(0, 1)`, which is what a
per-frame damping factor has to be.

### What each offset does

The frozen UNC-0002 ledger assigned every offset a role; the control loop gives
those roles their meaning. All six of the offsets the scoping pass left open are
now pinned.

| Offset | Kind | What the control loop does with it |
| --- | --- | --- |
| 0-1 | pointer | Which control routine the craft dispatches through |
| 2-3 | float | Yaw damping — multiplies yaw velocity every frame |
| 4-5 | float | Yaw authority — added to yaw velocity per input, negated for right |
| 6 | byte | Pitch step — added to or subtracted from pitch per input |
| 7 | byte | Roll coupling — an exponent offset applied to yaw velocity to get roll |
| 8-9 | float | Lift factor — scales the vertical component of translation |
| 10-11 | float | Speed damping — multiplies speed every frame |
| 12 | byte | Inert. Every block holds the same value and nothing reads it |
| 13 | byte | Altitude ceiling, in high-byte units |
| 14-15 | float | Throttle gain — multiplies throttle before it joins speed |

Offsets 2-5 are read as floats by `$9F17` but as plain bytes by `$9EBE`, which
adds offsets 3, 4 and 5 to roll, pitch and yaw and subtracts offset 2 from
altitude. Single bytes, not pairs — the scoping pass had this as pairs.

## The control loop, as disassembled

`CONTROL_L9F17` runs once per frame. It is two first-order filters, but **not the
same filter twice** — the scoping pass wrote both as `(v + input) * damping`, and
only speed is that shape:

* **Yaw** — `velocity = velocity * damping + authority`. Damping first, then the
  input, so the fixed point is `authority / (1 - damping)`.
* **Speed** — `velocity = (velocity + throttle * gain) * damping`. Input first,
  so the fixed point is `throttle * gain * damping / (1 - damping)`.
* **Pitch** — the pitch step is added to or subtracted from a ten-bit pitch
  value directly. There is no pitch velocity and no damping.
* **Roll** — while flying only, roll is yaw velocity re-exponented by offset 7,
  so a craft banks into its turn. Walking skips the roll step entirely.
* **Translation** — `$38/$39` and `$36/$37` are the pitch cosine and sine and
  `$3C/$3D`, `$3E/$3F` the yaw sine and cosine. `X += cosPitch * sinYaw * speed`,
  `Z += cosPitch * cosYaw * speed`, and `Y += sinPitch * speed * liftFactor`, each
  converted to a signed integer by `BIT16_TO_FP` (`$84A7`) and added to a
  twenty-four bit world coordinate.

Pitch `$0200` is level: it is the value the loop pins pitch to while on the
ground below the take-off speed, and the value touchdown forces pitch back to.
One turn is `$0400`, so level sits at half a turn and increasing pitch is nose
down.

`CONTROL_L9EFD` wraps that for its two craft: it zeroes the pitch step so they
cannot be pitched, pins the altitude's low byte, and while flying decrements the
altitude's high byte, dropping into the crash path when it runs out. They sink.

`CONTROL_9E5D` (slot 7) hands off to `$AA62`. `CONTROL_9E66` is the parachute
descent: it subtracts from altitude by an amount looked up from tables at `$9E9E`
and `$9EAE` by the current altitude, so the fall slows as it nears the ground.

## Take-off, ceiling, landing

**Take-off is a mode change, not an input.** The vertical translation step is
skipped while on the ground unless the speed magnitude has reached `2^7`, so a
craft must build up a take-off run before pitching up will lift it. Once altitude
passes `$3F` the engine sets `$7F` to `$00` and re-copies the boarded craft's own
block, and the player is flying. `FLAG_LIFT` and `CONTROL_LIFT` are the same
mechanism seen from the other side; there is no lift key.

**Ceiling.** Climb is allowed while altitude is below offset 13. Above it the
climb's exponent is replaced with `$88`, which is small enough to stop the ascent
without stopping the craft. The Dart's ceiling byte is raised to `$5A` when a
poweramp is fitted — the original's "you cannot leave the atmosphere until you
have the poweramp".

**The Dart's poweramp bonus doubles the throttle.** The scoping pass read the
`ADC #$04` as adding four to the throttle; it adds four to the throttle's
*exponent* byte, which is one power of two. The check is against craft id 1, so
the special case really is the player's first craft.

**Landing.** Below altitude `$40` the loop takes the touchdown path: altitude is
zeroed to the ground value, roll is zeroed, `$7F` becomes `$3F`, pitch is forced
back to `$0200` if it is past level, and offsets 2-11 of the walking block are
copied into the live block. Whether it was a landing or a crash is decided by two
tests before that, both against `$A0`, which is a magnitude of `2^8`: the
vertical rate at touchdown, and then the pitch. Fail either and the touchdown
still happens but the player is ejected from the craft and `$F9` is set to 2.
There is no separate landing key either.

## On foot the control loop does not run

`MOVE` (`$A165`) decides which mover to use before any of the above happens. If the
underground flag at `$A8` is set, or if the craft byte at `$A9` has its top bit set —
which is what being on foot means — it goes to `$A18B`; only otherwise does it
`jmp ($BEA0)` into the live block. So a player on foot, and a player underground,
never touch a Craft Parameter Block.

`$A18B` is a much smaller routine:

* **Turn** — the heading takes a fixed number of angle units, held at `$AC`, added or
  subtracted and wrapped to ten bits. The Reference Build sets it once, at `$8108`.
* **Step** — a fixed float held at `$AA/$AB`, multiplied by the yaw sine and cosine
  and added to X and Z. Walking backwards flips the sign bit of that one value rather
  than keeping a second, which is the same `EOR` trick the control loop's turn uses.
* **Nothing else.** No velocity, no damping, no throttle, and no vertical term at
  all — which is the real reason a walker can never leave the ground, whatever their
  speed or pitch.

`$AA/$AB` is initialised data rather than a stored constant: nothing in the ROM
writes it, so it is read from a conditioned capture's zero page like any other live
value. In ours it decodes to 80 units per frame, against a turn step of 16.

## Throttle

Throttle lives at `$EC/$ED` as a float like everything else, and is written two
ways.

* **Absolute** — a digit key indexes a table at `$BC50` and the result is shuffled
  into the exponent byte with the mantissa set to zero. A zero mantissa means
  every notch is an exact power of two, which is what our own frozen trace
  TR-9024 recorded as `$1400` through `$3800`: ten notches one exponent step
  apart, `2^5` to `2^14`.
* **Relative** — `FP_MUL` against the current value, so the `+` and `-` keys
  double and halve rather than step linearly. Saturates when the exponent
  reaches `$3C`, that is at `2^15`.

## Still not read

* `$AA62`, slot 7's handler, is read only as far as knowing it exists.
* `$A13D` is not the way underground, as this note first assumed. It is a box test:
  cell 8:8, a sixteen-middle-byte square, and an altitude high enough that it can
  only be reached by climbing — the orbital transition, not a building. The way
  underground is the lift at `$A24A`, which flips the `$A8` flag; that belongs to the
  next step.
