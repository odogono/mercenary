# Flying: craft parameters and the control loop

Research notes for the flight step. Nothing here is implemented yet; this is the
ground established while scoping it, so the build does not have to start from
scratch.

## The flag we have been asserting all along

`$7F` is `FLYING_FLAG`: `$00` flying, `$3F` walking, driving, or taxiing. Our
capture loader has been requiring `ram[0x7F] == 0x3F` since the geometry work as
its "initialized runtime state" marker — it has always meant "the player is on
foot".

## Craft parameter blocks

Eight blocks of sixteen bytes at `$9DAD`, one per craft slot, copied verbatim into
the live block at `$BEA0` when the player boards (`$9D99`, indexing by
`slot * 16`). The live block in a conditioned capture holds a ninth variant that
is not in the table — the walking parameters, which is how walking and flying
share one control loop.

Bytes are read in pairs and fed to `FP_MUL` / `FP_ADD`, so each pair is one value
in the engine's own sixteen-bit float format. That format is the first thing the
build needs and is not yet decoded.

Our own frozen UNC-0002 ledger already assigned every offset a role; reading the
control loop gives those roles their meaning:

| Offset | Frozen role | What the control loop does with it |
| --- | --- | --- |
| 0-1 | handler pointer | Which control routine the craft dispatches through |
| 2-3 | primary-axis rate | Multiplies yaw velocity every frame — the damping |
| 4-5 | secondary-axis rate | Added to yaw velocity per input — the authority |
| 10-11 | auxiliary-axis rate | Multiplies speed every frame — the damping |
| 14-15 | trim rate | Multiplies the throttle before it joins speed — the gain |
| 6-9, 12-13 | rotation rate, translation bias, capability gate, sustain limit | Not yet pinned |

Three handlers serve the eight craft: `$9F17` (slots 0, 1, 3, 4, 6), `$9EFD`
(slots 2, 5), and `$9E5D` (slot 7). The walking block dispatches to `$9E60`.

## The control loop, as disassembled

`CONTROL_L9F17` runs once per frame and is a pair of first-order filters:

* **Yaw** — velocity is multiplied by the damping pair, then the authority pair is
  added or subtracted for left and right. Turning is therefore a rate that builds
  and decays rather than a fixed step.
* **Pitch** — input adds or subtracts a pitch velocity directly, wrapped to ten
  bits.
* **Speed** — `velocity = (velocity + throttle × gain) × damping`, using the same
  filter shape. The throttle lives at `$EC/$ED`.
* **Translation** — speed is multiplied by the heading's components and added to
  the world position, one axis at a time.

`CONTROL_L9EFD` wraps that for its two craft: it zeroes the pitch velocity, pins
the altitude's low byte, and while flying decrements the altitude's high byte —
which looks like the descent that makes a craft fall without lift.

`CONTROL_9EBE` subtracts the block's first pair from altitude and adds the next
three pairs to roll, pitch, and yaw. It reads like a crash or an autoland.

## A detail worth keeping

The speed step checks for a poweramp and, **only when the boarded craft is the
Dominion Dart**, adds four to the throttle. The player's first craft is the one
the engine special-cases.

## What the build still needs

1. **The sixteen-bit float format** behind `FP_MUL` / `FP_ADD`. Everything else
   depends on reading the parameter pairs as numbers.
2. **Throttle controls** — what sets `$EC/$ED`, and over what range.
3. **Lift and take-off** — `FLAG_LIFT` and `CONTROL_LIFT` are the branch taken
   before the joystick is even read, so lift is a mode rather than an input.
4. **Landing** — `LEAVE_CRAFT` (`$98C6`) checks the flying flag, zeroes pitch and
   roll, and forces a pitch value; what it requires of altitude and speed before
   allowing it is not yet read.
5. **The remaining six offsets**, which the frozen ledger names but does not
   interpret.
