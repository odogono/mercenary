# The craft Mover across Targ, Damocles and Mercenary 3

Research note, 2026-09-28, written after [#556](https://github.com/odogono/mercenary/issues/556)
shipped the Damocles craft Mover. It feeds
[#419](https://github.com/odogono/mercenary/issues/419), which defers converging the Titles' craft
and boarding code until there are real data points. It compares the two craft Movers the port now
has and says what a Mover for all three Titles could share. It decides nothing. A decision that
changes the shared seams of [ADR 0043](../adr/0043-admit-damocles-play-alongside-the-second-city.md)
needs an ADR of its own.

Sources:

- **Targ.** The C64 Reference Build's decode, as the port holds it: `payload/flight.json`,
  `web/src/gameCore/index.ts` (`integrate`, `walk`, `tumble`, `transition`),
  `web/src/flight/index.ts` and [ADR 0016](../adr/0016-run-walking-on-the-craft-control-loop.md).
- **Damocles.** The ST Working Authority: [the craft control note](damocles-craft-control.md),
  [the collision response note](damocles-collision-response.md),
  [ADR 0051](../adr/0051-run-the-damocles-craft-pass-exactly-once-every-four-ticks.md),
  `web/src/damocles/craft.ts`, and the Catalogue's `craft` block.
- **Mercenary 3.** Initially unexamined when this note was written. The subsequent
  [integration research for #609](mercenary-iii-integration.md) pins an ST baseline and
  demonstrates matching math tables, bounded addition behaviour and recurring craft
  parameters. It also observes scene-dependent craft cadence and a passenger path separate
  from the ordinary Mover selector. Whole-Mover and boarding convergence remain unproved.

Only decoded values and the port's own code are compared. No program code is copied
([ADR 0002](../adr/0002-separate-rom-research-from-implementation.md)).

## Summary

1. **It is the same control loop.** Both Titles keep a table of Craft Parameter Blocks, pick a
   block by the occupied slot, and run one loop over it. They share the filter shapes, the
   pitch rule, the roll rule, the take-off gate and the touchdown verdict. Walking is a separate
   fixed-step Mover in both.
2. **Many of the numbers are the same numbers.** Five of Targ's eleven blocks reappear in the
   Damocles table with the same filter values: turn damping, turn authority, roll and speed lag,
   and in most cases the pitch step. The gains and ceilings are the parameters that were
   retuned. Several of the loop's
   constants match exactly: the crash pitch, the ground band, the eye height, the level pitch and
   the throttle ladder. Damocles was built from Targ's tables, not merely in the same style.
3. **What differs is the machine.** Targ's arithmetic is the 6502's. Damocles's is the 68000
   program's log-domain floats. More importantly, the port runs the two on opposite time models.
   Targ's filters are solved in closed form for any timestep, with tuning scales. Damocles runs
   whole passes on a tick clock, exactly, with no scales. One implementation cannot do both
   without changing one Title's behaviour.
4. **A shared Mover is plausible, with three layers:** a shared vocabulary and block schema, a
   shared pass skeleton over a per-Title number system, and per-Title handlers and ground models.
   The first layer costs nothing. The second needs Targ moved onto whole frames, and Targ's
   Golden Traces must then be re-proven, which #419 requires. The third stays per-Title.
5. **Mercenary 3 now has bounded evidence.** The subsequent [#609 report](mercenary-iii-integration.md)
   supports selected arithmetic and parameter reuse from Damocles, while leaving whole-Mover
   equivalence, passenger integration and a shared architecture undecided. `craft.ts` remains
   a candidate foundation, not an admitted cross-title implementation.

## The loop, rule by rule

| Rule | Targ | Damocles |
| --- | --- | --- |
| Block choice | the craft slot indexes eleven blocks; an installed mover overrides it | `$7AB0` indexes sixteen 32-byte entries at `$055C80`; the entry's `bra.w` picks the routine |
| Turn | yaw velocity damps, then takes the stick: `v·yawDamping + yawAuthority` | turn rate damps above the zero, then takes the stick: `r·(+4) ± (+8)` |
| Speed | takes the throttle, then damps: `(v + throttle·gain)·speedDamping` | the same shape: `(V + T)·(+14)`, with `T = throttle·2·(+1C)` |
| Pitch | a direct step of `pitchStep` a frame, no velocity; zero on the sinking craft | a direct step of `+C` a pass, no velocity; zero makes a ground vehicle |
| Roll | set, not accumulated, from yaw velocity × `rollCoupling`, in flight only | set from the turn rate × 2^(`+E`), without contact only |
| Climb | `sin(pitch)·advance·liftFactor`, once the craft may leave the ground | `sin(pitch)·V`; negated for a ground vehicle; no lift factor |
| Ceiling | climb × `ceilingClimbScale` (2⁻³⁰, effectively nil) above `ceiling`·65,536 | climb halved for every 65,536 above `+1A`·65,536 |
| Take-off | the vertical step is skipped until speed reaches `takeoffSpeed` (128) | a nose-up pitch is levelled in contact unless speed is above `$4FFFF` (32) |
| Ground state | a `flying`/`grounded` mode, flipped by crossing `groundBand` (64) | the contact word `$7ACA`, set below Y 64 or on a support top |
| Touchdown | eye to `groundAltitude` (63); crash on descent ≥ 256, else on raw pitch ≥ 640 | Y to 63; the landing handler on a step below −100 or pitch ≥ `$280` (640) |
| Level pitch | 512 | `$1FF`, one unit off, where the half-step sine table puts level |
| Throttle | ten notches, 32 … 16,384, each double the last | ten keys, 16 … 8,192 at exponents 4–13, doubled by the pass: 32 … 16,384 |
| Crash | block 9, the tumble: fixed angle steps and a fixed fall, no input | slot 9, the fall `$057D64`: fixed steps, no input |
| On foot | a fixed step and turn (80, 16) outside the loop (ADR 0016) | a separate on-foot Mover `$058CFE`, one call a substep |

The crash tumble has the same slot number in both. In Targ, block 8 is the taxi block that
touchdown installs, and block 10 is the parachute descent.

### Shared parameters

Targ's floats are decoded values. Damocles's are the program's floats decoded by `m/4096 × 2^e`.
The roll exponent `+E` = 2 is Targ's coupling of 4.

| Targ block | Damocles slot | Turn damping | Turn authority | Pitch | Roll | Speed lag | Ceiling | Gain |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 10 CONCORD III | 0.9375 | 1.0 | 8 / 12 | 4 | 0.5 | 90 | 0.90625 / 3.125 |
| 1 | 4 BESTCUPAND CRAFT | 0.9375 | 1.0 | 8 / 6 | 4 | 0.5 | 10 / 900 | 0.390625 |
| 3 | 12 BULLET | 0.890625 | 2.0 | 12 | 4 | 0.75 | 90 / 900 | 0.1953125 / 1.5625 |
| 6 | 1 DART II, 3 EAGLE NINE S E | 0.9375 | 1.0 | 8 | 4 | 0.5 | 90 / 900 | 0.78125 |
| 8 (taxi) | 8 NEUTRON FUEL | 2⁻¹⁶ | 16.0 | 1 | 4 | 0.25 | 0 / 90 | 1.0 / 2.0 |

A pair of values is Targ / Damocles. The pairing is by shape and is not established per craft.
The strongest matches are these:

- Targ's block 3 is Damocles's BULLET in every filter value.
- Targ's block 6 is the Eagle's, down to the gain.
- Damocles's slot 8 is Targ's taxi block, in a slot the board gate never reaches.

The ground vehicles differ in the same way in both Titles. Targ's sinking craft (blocks 2 and 5)
and Damocles's wheeled craft (slots 2, 5, 6 and 13) have a pitch step of zero. Several of them
have a turn damping of 2⁻¹⁶, so the turn stops the moment the stick is released. The authority
is 16 for Targ's block 2 and 4 or 6 for the Damocles cars.

What moved between the Titles is mostly the gains and ceilings. Damocles's ceiling of 900 puts
the flying craft above the space-entry height. Its larger gains are then multiplied by the
altitude factor, which Targ does not have.

## What differs

### Arithmetic and time

This is the difference that decides the design.

- **Targ in the port.** `settle` solves each first-order filter in closed form for a fractional
  number of frames: `target + (value − target)·damping^frames`. `referenceFrameRate` (20)
  converts seconds to frames. `speedScale`, `turnScale` and `pitchScale` are tuning knobs, and
  the math layer of [ADR 0022](../adr/0022-carry-a-deterministic-math-layer-in-the-port.md)
  makes `pow` deterministic. The Golden Traces are recorded from this port against the Trace
  Oracle.
- **Damocles in the port.** Whole passes, one every `ticksPerPass` (4) VBL ticks, in the
  program's log floats, word for word. There are no scales. ADR 0051 rejected fractional passes
  and real arithmetic: the pass compares against hard thresholds such as Y 64, a step of −100,
  speed `$4FFFF` and the collision boxes, and a drift of one unit crosses them.

Targ's 6502 loop is also a per-frame recurrence. The closed form is the port's own choice,
made so that motion stays smooth at any host rate. So the two Movers differ in time model
because of two port decisions, not because the originals differ.

### Ground, contact and collision

- Targ has a mode byte flipped by an altitude band, a take-off gate on speed, and no refusal of a
  craft's move against geometry in the loop. Its extra cases are the Colony Craft deck,
  sinking, slot 7's pinned pitch and the parachute descent.
- Damocles has a contact word, a support search over Building detail tops, two landing gates, a
  wheeled tail, and a box test that bounces the craft one pass back. Speed is quartered in
  contact and multiplied by altitude. Any craft whose pre-pass Y reaches `$1F0`·65,536 enters
  space, where slot 0's parameters are used whatever is aboard.

### Coordinates and angles

Both use 1,024 angle units a turn and a 65,536-unit cell. Targ's positions are byte-structured
and its surface is bounded. Damocles's are 32-bit longs on a 28-bit surface that wraps, and its
sine table is offset by half a step, which is why its level pitch is `$1FF`.

## What a Mover for all three could share

Three layers, cheapest first.

### 1. Vocabulary and block schema

This layer has one set of named fields: turn damping, turn authority, pitch step, roll
coupling, speed lag, thrust gain, ceiling, and a handler class. Each Title's payload keeps its
own raw encoding. Damocles's `craft` block stays raw longs, as ADR 0051 requires. Each Title also
offers a decoded view under the shared names. `CONTEXT.md` already uses Craft Parameter Block and
Mover for both Titles.

This layer moves no trace and changes no behaviour. It could happen now.

### 2. A pass skeleton over a per-Title number system

The loop's order is common to both Titles: turn filter, pitch step, speed filter, displacement,
vertical step and ceiling, contact and touchdown verdict, then roll. That order could be one
function, parameterised by:

- a **number system**: multiply, add, to-integer and sine. Damocles supplies its log floats.
  Targ would supply its own arithmetic, ideally the 6502's.
- a **pass clock**: whole passes every n ticks, as ADR 0051 runs Damocles.
- **hooks** for the steps that differ: the altitude factor and contact quartering, the take-off
  rule, the ground test, the collision test.

The cost falls on Targ. Sharing the skeleton means leaving the closed-form `settle` for whole
frames on a pass clock, at 20 frames a second, or whatever the Reference Build's rate was
measured to be. Targ's Golden Traces would have to be re-recorded or re-proven. #419 requires
them not to move, so this step needs an ADR that either amends that constraint or shows the
traces survive. Targ's feel would also change: motion would step at the pass rate between
host frames, which is what the closed form was chosen to avoid.

The alternative is to share the skeleton's shape but not its clock. Each Title keeps its own
time model and the skeleton becomes documentation. That is layer 1 with more detail, and it
removes no code.

### 3. Handlers, ground and collision models

These stay per Title: Targ's sinking, slot 7, tumble, parachute and Colony Craft deck, and
Damocles's wheeled tail, fall, space routine, supports, landing handler and box refusal. They
share a result type: a new state plus events such as refused, landed, crashed and space. The
session maps those events to its own sound and Occupancy.

## Mercenary 3

The original five-question hypothesis is now investigated in the
[#609 integration report](mercenary-iii-integration.md):

- A ten-entry table of branches and parameters is recovered, versus Damocles's sixteen.
- The actual log, exponent and sine lookup entries are byte-identical.
- The complete float-add routine is identical, and eight original-runtime operand cases
  match the existing independent `craftAdd` implementation.
- Bounded runtime probes observe an ordinary pass per original frame and a collision-retry
  second pass; frame durations vary, so this is not a universal four-VBL rate.
- Multiple Damocles parameter blocks recur, but craft identities and whole-Mover equivalence
  remain unresolved.

These results support investigating selected reuse. They do not mean the Titles already share
`craft.ts`, or that a new Catalogue block would suffice. Natural taxi travel also uses a passenger
reference separate from the ordinary Mover selector. The report proposes a bounded passenger
milestone and retains explicit recovery and architecture decisions before convergence.

## Recommendation

1. Take layer 1 now, as documentation and naming. It is free and keeps #557 and #558 from
   inventing Damocles-only names for shared ideas.
2. Hold #557 and #558 to the current `craft.ts` seams. `craftFrame` returns a state and an
   outcome and already reads everything from the payload, which is the shape layer 3 wants.
3. Review the [Mercenary 3 findings](mercenary-iii-integration.md) and resolve the bounded
   mechanism and passenger-state gaps before any convergence work. Arithmetic identity alone
   does not choose layer 2's architecture.
4. Treat layer 2 for Targ as an ADR-level decision. The question is whether Targ gives up
   closed-form time for whole passes, which would be closer to its Reference Build and would
   re-prove its traces.

## Fog

- Whether Targ's Reference Build ran its loop once per rendered frame, as Damocles does, or on a
  fixed rate. `referenceFrameRate: 20` is a port knob, not a recovered rate.
- The per-craft pairing in the shared-parameters table. It matches by values, and no
  documentation ties a Targ block to a Damocles craft.
- Why Targ's ceiling scale is effectively nil while Damocles's halves per 65,536.
- Whether Targ's descent-rate crash threshold (256 a frame) and Damocles's step of −100 a pass
  are the same rule at different scales.
- Mercenary 3's full per-pass equivalence, craft/model identities, passenger-service state,
  timing policy and appropriate shared seams; see the #609 report's ordered follow-ups.
