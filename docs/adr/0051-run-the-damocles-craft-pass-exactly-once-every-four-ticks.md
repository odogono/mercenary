# Run the Damocles craft pass exactly, once every four ticks

Accepted, 2026-09-27, for [#555](https://github.com/odogono/mercenary/issues/555), part of the
[driving and flying map](https://github.com/odogono/mercenary/issues/548). The pass rate below is
an approved, retained difference from the Working Authority.

Aboard, the ST does not run substeps. The frame loop sends a boarded player to one call of the
craft dispatch `$057CC2` per rendered frame, and the pass never reads the frame's VBL count
`$51D22` ([the craft control note](../research/damocles-craft-control.md#where-the-pass-runs)).
Every recovered rate aboard is therefore a count **per pass**: turn acceleration per pass, pitch
step per pass, a speed lag applied once a pass, a displacement of `V` a pass. How long a pass
takes on the ST depends on what is on screen. In the traces it ranged from 2 to 8 VBLs, about 8
by the airport's buildings and 3 to 4 over open ground.

[ADR 0049](0049-run-one-damocles-substep-per-tick-without-st-frame-cost.md) settled substeps and
said nothing about passes, because aboard there are none. This ADR settles the craft.

## Decision

1. **One craft Mover, Damocles-native.** Aboard, `DamoclesSession.advance()` runs a craft Mover
   where it runs `walk()` on foot. The Mover is the pass `$057F46`–`$0583E8`, with the wheeled
   tail `$057DE6` for the craft whose entry branches there. It runs over the occupied slot's
   Craft Parameter Block, which it reads from the Data Payload. This is ADR 0016's craft
   control loop. The on-foot step stays the other Mover. ADR 0043's sibling rule holds:
   nothing here is shared with Targ, and convergence stays with
   [#419](https://github.com/odogono/mercenary/issues/419).
2. **One pass every four ticks.** A tick is one VBL of session time at `time.vblHertz`, as in
   ADR 0049. The Mover runs one pass on every fourth tick, counted by the session and
   carried in a Save. The figure is published in the Presentation document's `time` block as
   `ticksPerPass: 4` with provenance `derived`. The basis is the four traced distributions: 1,880 passes over 7,743
   VBLs, a mean of 4.12, rounded to the nearest whole tick. The pass itself is not scaled. A
   pass is always a whole pass.
3. **The program's own arithmetic.** The pass runs in the program's log-domain floats: a long
   whose high word is a signed binary exponent and whose low word is a signed mantissa. A
   product is a log-table add through the tables at `$64000` and `$60000`, a sum is `$04BD34`,
   and integers round as `$05807A` rounds. The sine table is the one the pass reads. The lab
   ships the three tables to the port in one of two ways. If a formula regenerates a table bit
   for bit, the port generates it and the payload carries that table's hash. Otherwise the table
   is extracted into the payload with its address and hash. In the event, the log table is
   regenerated (`round(log2(|m| / $1000) × 4096)`, capped at `$FFF`, shifted left four, with
   bit 0 the sign). The exponent and sine tables are carried, because the ST's own rounding
   differs from the formula at four exponent entries and eleven sines.
4. **Craft state in the program's words.** While aboard, the session holds X, Y and Z as the
   program's integers. It holds pitch, yaw and roll as its ten-bit words, and contact `$7ACA`
   and the support words as the program does. It holds the turn rate `$7970`, speed `$797A`
   and throttle `$7BAC` as floats. The Pose that draws is derived from these and is never
   the source of truth aboard. Leaving converts back to the on-foot Pose, as the leave path
   already places it.
5. **Published, not written.** The payload carries, per slot, the seven words the pass reads
   (`+4`, `+8`, `+C`, `+E`, `+14`, `+1A` and `+1C`) as the raw longs and words the table
   holds, together with the routine class. Decoded values are given in the research note, not
   the payload. It carries the program constants the pass
   compares against, each with its address, and the collision response's constants from
   [#550](https://github.com/odogono/mercenary/issues/550). `+10` and `+18` are read by no
   routine and are not published.

## Acceptance envelope

- **Passes, exact.** For a given starting state and stick and key inputs per pass, the port's
  pass sequence equals the traced one word for word. The words are X, Y, Z, pitch, yaw, roll,
  contact, the support words, the turn rate, speed and throttle floats, and the panel speed.
  The nine traced cases of #549 and the refused moves of #550 become replay tests at this
  standard. The Python transcription `model_pass` already meets it on all 2,659 passes it models.
- **Elapsed seconds** are `4 × passes / vblHertz`. They are **not claimed** as matched to any
  ST wall-clock measurement. On the ST the same passes took between half and twice that time,
  depending on the scene.

## Why exact arithmetic

Real arithmetic differs from the table product by up to about 0.06% a product. The pass
multiplies several times a pass and feeds each result into the next pass. The drift is not
the worry on its own. The worry is that the pass compares its results against hard
thresholds: Y below 64, a step below −100, speed above `$0004FFFF` for take-off, the ceiling
`+1A` × 65,536, space at `$1F00000`, and the collision boxes of `$0590AE`. A drift of one unit
across any of them changes what happens next. The trace would then diverge in a way that
looks like a misported rule, which is the failure
[ADR 0022](0022-carry-a-deterministic-math-layer-in-the-port.md) described for Targ. The tables
are small, the probe already transcribes them, and exactness turns the research traces
directly into tests.

## Why four ticks

The recovered rules fix what a pass does and not how long it lasts. Some figure has to turn
passes into session time, and any figure is a choice. This one is taken from the traces, as
the on-foot walk's `unitsPerSecond` is a derived average of an ST measurement. Four ticks keep
the craft's speeds, turn rates and climb rates within the range a player of the ST saw. They
also keep a whole number of ticks per pass, so the pass sequence stays exact and a Save
resumes on a pass boundary without a fractional carry.

## Rejected alternatives

- **One pass per tick.** This is the literal reading of ADR 0049's rule. It would run the craft
  2 to 8 times faster than the ST ever did: the limo at key 4 would cover about 1,680 units a
  second against the walk's 328. Journeys would also shrink against the impact clock, which
  keeps real time (#551). Unlike the substep case, there is no range of scenes in which the ST
  ran one pass a VBL.
- **One pass per rendered host frame**, as the ST does. Speed would then depend on the host's
  display rate. That is the rejection ADR 0049 made for bursting substeps.
- **A frame-cost model**, varying ticks per pass by scene. No recovered value says what a scene
  cost the ST, so every figure would be authored. ADR 0049 rejected the same thing.
- **Fractional passes**, scaling each pass's rates by elapsed time. The rates are per pass, and
  the lag, the thresholds and the integer truncation do not scale. The result would match
  nothing that was traced.
- **Real arithmetic**, accepting the 0.06%. See above.

## Consequences

- `ticksPerPass` joins the Presentation document's timing, beside `vblHertz`, with its
  provenance and basis, and a later ADR may replace it only with recovered evidence.
- A Save aboard carries the pass phase along with the craft words
  ([#557](https://github.com/odogono/mercenary/issues/557)). There is no vertical velocity to
  save, because the pass has none.
- The landing handler `$057CF2`, the refusal and bounce of `$05970E`–`$059760`, and the
  slot-9 fall `$057D64` run inside the same Mover, on the same pass clock.
- The slot-9 fall is the one craft routine that reads the frame's VBL count: its X and Z drift
  is `$79B2` and `$79B4` times `$51D22` (`$057DC4`, `$057DD6`). The port gives it
  `ticksPerPass` there, which is the same choice this decision makes for every other pass.
- Not admitted until recovered: the launch swing `$057F18` (`$7B0C`), the stick replay `$7A0C`
  from `$7A08`, the space routine `$05872E`, and the camera sway `$057EC8`. If the port meets
  one of these gates set, it has no rule to run and says so. It does not invent one. The
  space routine and the launch swing belong to
  [#558](https://github.com/odogono/mercenary/issues/558).
- The on-foot substep loop does not run aboard on the ST, and the port currently ticks doors
  and the ride every VBL, aboard or not. Whether `$05970E` moves Entrance Attachments at all is
  unrecovered. Until it is, the port keeps its current behaviour and names it as unverified.
