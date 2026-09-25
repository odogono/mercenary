# Moving during a Damocles Lift ride

Working-Authority Evidence for [#509](https://github.com/odogono/mercenary/issues/509),
part of the lift map [#470](https://github.com/odogono/mercenary/issues/470), recovered
2026-09-25. Authoritative Evidence remains bound to the C64 Reference Build. This note
records decoded ST facts only and does not translate the program into a new model
([ADR 0002](../adr/0002-separate-rom-research-from-implementation.md)). Captures, RAM,
traces and screenshots stay ignored Restricted Material under `research/damocles-st/work/`;
only addresses, decoded facts and hashes are recorded here.

It extends [the lift ride](damocles-lift-ride.md) (#472), whose runs held no input, and
builds on [how the player operates a Damocles Lift](damocles-lift-control.md) (#471).

## Decision

**The player walks and turns freely inside the car for the whole ride, and cannot leave it.**

- Nothing in the ride gates the Mover. It runs every substep, ride or not, and walks and
  turns the eye at its usual rate: 10 units a substep forward, yaw `$0003` a substep.
- The region is frozen from the admission to the arrival, as #471 decoded. So the clamp
  holds the eye inside the car's own box. Walking at the doorway stops the eye at the
  car's edge, **one unit inside it**, even while the door is still closing and even when
  the key lands in the frame that would otherwise carry the player out.
- Against a wall with no region beyond it, the eye stops at the usual inset, 11 units in.
- The arrival does not move the eye. The pose the player walked to and the yaw they turned
  to survive onto the new Floor; only Y and pitch are set, as #472 found. With the stick
  still held, the rest of the arrival frame's substeps walk on.
- After the arrival the region walk runs again. A player still walking at the doorway
  leaves the car once the new Floor's door has latched open.
- A key during a ride still replaces the destination while the player walks.

The port already does all of this, apart from where the clamp holds the eye at a door that
is not latched open: **11 units short** of the Working Authority. The difference is in the
clamp itself, so it shows at every such door, ride or not. The correction is
[#517](https://github.com/odogono/mercenary/issues/517).

## Working Authority and evidence

| Item | Value |
| --- | --- |
| Program SHA-256 | `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef` |
| TOS SHA-256 | `154803e3ff4851f3dc358b91b16d6b6110d187a81d8132ecb665af49878939d5` |
| Hatari | 2.6.1, binary `05723606c75a1f0642395974abdce2cbbe48b0a09a747f65cdfca7ef9201e11a` |
| Static source | `observe-first-world-20260818T101013Z-c5a32b7d/observed.ram`, `b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967` |
| State Office capture | `rehosted/eris-lift.sav`, `7ba0352ffc3b3b0d1195e9cbfaec09598d4edd49f3ae4dc1f9a516cacb3de5a9` |
| Vesta capture | `rehosted/vesta-transporter.sav`, `1590a28cf3d063e9bd5575ede79fc153d78c0f77a45d6a84cea9c2bb5fc1a280` |
| Probe | [`research/damocles-st/scripts/lift-ride-probe.py`](../../research/damocles-st/scripts/lift-ride-probe.py) `movement` |

| Window | SHA-256 |
| --- | --- |
| On-foot Mover `$058CFE`–`$058D7D` | `77edd98ade467122cd898df5988ff0ddd4ad5ed8b3ec38c38d383b13d476ca0f` |
| Region walk `$05A32C`–`$05A4CF` | `dbcadf8ecc3733f91b25a9cdbf2787e623f65e7113f5b4fa0560c23673d3891d` |
| Clamp edges `$05A4D0`–`$05A645` | `70ebc44a88f55393bca6fb955621430c32c1481603f45e84240454a3146df94f` |
| Clamp entry `$05A64A`–`$05A6EB` | `efafbf2b5992a2aa6079b325c2b5791070aa5ea51c784fd41b79f15da8118a6f` |

`lift-ride-probe.py decode` recomputes these with #472's windows and checks the ten
instruction sequences below byte for byte, with #472's, before anything here is trusted.

## What moves the eye in a ride

The substep loop ([#472](damocles-lift-ride.md#why-the-step-is-25-vbls-substeps)) calls the
Mover at `$05956C` unconditionally. Only the step routine before it tests `$788A`. The
on-foot Mover `$058CFE` reads the joystick-1 byte `$79C2` and has no ride test: up and down
walk, left and right turn by `$7B3A`. Of `$788A`'s four readers
([#471](damocles-lift-control.md#who-writes-788a-and-what-ffff-means)), only the region
walk bears on the eye.

The clamp `$05A64A` runs after the door pass in every substep (while `$7B02` is not
negative), and once more after the loop:

| Address | Effect |
| --- | --- |
| `$05A67C`–`$05A68C` | the current region's bounds (`$7B12`), inset by 11 unless `$7B35` is negative |
| `$05A68E`–`$05A69E` | inside the inset box: nothing to do |
| `$05A6A8`–`$05A6E4` | past an inset edge but inside the region's own box: the edge test for that side |
| `$05A504`–`$05A5EA` | the edge test: a region whose opposite edge is this edge, and whose inset span holds the other coordinate. **It tests no latch.** Found: the eye stands. Not found: clamp |
| `$05A6E8` | past the region's own box: walk the regions (`$05A32C`) |
| `$05A35C` | in the walk, a ride pending refuses every region |
| `$05A37E` | otherwise a region with an attachment slot is refused until its latch is negative, `$FF` |
| `$05A4CA` | no region selected: `d6` ← 0, the clamp with **no inset** |
| `$05A5F0`–`$05A63C` | the clamp: X to [x0 + d6, x1 − d6 − 1], Z likewise, into the local copy and the pose; `$5A646` ← 1 |

So during a ride, at an edge with a region beyond it, the eye walks on past the inset,
reaches the car's own edge, finds no region it may select, and is clamped back to the edge
less one. At an edge with nothing beyond, the inset clamp holds it 11 units in. With no ride
the walk selects the region beyond once its Region Gate is met. Until then the eye is held
at the same place, the edge less one.

The frame loop reads the key at `$0594DC`, before its substeps. So a key admitted in a
frame freezes the region for that frame's substeps too.

## Cases

Each case boots the rehosted memstate afresh and runs a chain that stops on every VBL,
as #472's `live` does. The inputs are written from the chain's own stop scripts, at fixed
stops: the lift key as the make code the ACIA handler would leave in its mailbox `$05558C`,
which the dispatcher reads and resets to `$FF`, and the stick as the byte the handler would
leave in `$79C2` (`$05556E`). Nothing else is written, apart from the Vesta teleport #471
used and the hall control's teleport. No host timing enters a case.

The State Office capture stands in car region 4 (X −890..−610, Z −95..100) at local
(−879, 0), against the back wall and facing the doorway. The doorway is region 2
(X −610..−600, Z −29..29, door `$3F4`, open).
Vesta stands in car region 0 (X −2070..−1530, Z −570..0) after the teleport, at
(−1800, −285), yaw `$E5B2`. VBL 0 below is the first stop showing the admission.

| Case | Input | Door shut | Arrival | Held at (settled) | Arrival pose |
| --- | --- | ---: | ---: | --- | --- |
| `eris-forward` | `1` and up together | 26 | 80 | X −611 from VBL 20 | (−611, 0), yaw `$02FE` |
| `eris-walk-in` | up; `1` in the frame that would leave | 26 | 80 | X −611 from VBL 0 | (−611, 0) |
| `eris-backward` | `1`, down | 28 | 77 | X −879 | (−879, 0) |
| `eris-turn` | `1`, right | 28 | 74 | (−879, 0); yaw `$02FE` → `$03EE` | (−879, 0), yaw `$03FA`, not reset |
| `eris-arc` | `1`, up and right | 25 | 74 | X −622, Z −84 | (−622, −84) |
| `eris-redirect` | `2`, up and left; `1` at +50 stops | 24 | 73 | X −622, Z 88 | (−622, 88), Floor 1 |
| `vesta-forward` | `2`, up | 12 | 89 | X −2059, Z −12 | (−2059, −12), Y 697 |
| `vesta-arc` | `2`, up and left | 15 | 72 | X −2059, walking along Z | moved 36 in Z across the arrival frame |

Runs `lift-move-<case>-20260925T103137Z` to `…T103308Z`, one per case, all passing. Every
arrival levels pitch to `$1FF`, sets Y to Floor × storey + 63, and republishes the car.

- **The doorway.** In `eris-forward` the eye walks 70 units a frame (7 substeps) and
  reaches X −611 at VBL 20. The door is still closing then; it shuts at 26. The eye stays at
  −611 for the rest of the ride. That is x1 − 1, not the inset x1 − 12, because region 2
  shares the edge and its inset Z span (−18..18) holds Z 0.
- **Walking in with the door open.** In `eris-walk-in` the player walks first, and the key
  goes in the frame after the eye reaches −669, with door `$3F4` latched open. The control
  `eris-walk-out`, the same walk with no key, leaves the car in that frame: at stop 35 the
  eye is at −599 in the hall (region 0). With the key, the frame's substeps run with the
  region already frozen, and the eye stops at −611. **The player cannot leave the car once
  the key is admitted, whatever the door is doing.**
- **Walls.** No region shares the car's side or back walls: region 3's Z edge is −105, not
  −95. So the inset holds: Z −84 and 88, X −879. `eris-arc` and `eris-redirect` walk into
  the corners by the doorway. X stops at −622 there, the inset, because Z ±84..88 lies
  outside region 2's span.
- **Turning** runs throughout: `$0003` a substep, `$02FE` to `$03EE` by the last settled stop
  of the ride, and on to `$03FA` in the arrival frame. Yaw is not reset at arrival.
- **A changed destination.** In `eris-redirect`, `1` goes in 50 stops after `2`, once the
  door is shut and while the label still shows G. `$788A` changes from 2 to 1 with the stick
  held, and the ride arrives at 1 on the next step.
- **After arrival.** In `eris-forward`, the eye leaves the car on Floor 1 at VBL 101 into
  the landing (flags `$0001`), once the new door has latched open.
- **Vesta.** The eye walks diagonally to the corner of the car nearest the doorway
  (region 1 at Z 0..60, X −1879..−1721). It stops at Z −12, the inset, because X −2059 lies
  outside the doorway's span. The car's walls hold it exactly as the State Office's do.

**Settled stops.** A VBL can land inside the substep loop, between the Mover and the clamp,
and the eye is then where the Mover's step put it, beyond the clamp. `eris-arc` saw Z −92 in
one such stop. The gates read only stops where the substep counter `$5948A` is zero,
outside the loop, and the table reports those.

**Frames faster than 4 VBLs.** While walking in the Vesta car, frames took 2 to 4 VBLs.
The loop still ran at least 4 substeps, so the ride ran ahead of the VBL clock: `vesta-forward`
arrived 89 VBLs after the key against 116 in #472's still ride, and `vesta-arc` 72. #472
saw no frame under 4. This is ST frame cost, which
[ADR 0049](../adr/0049-run-one-damocles-substep-per-tick-without-st-frame-cost.md) excludes
from comparison: in substeps the rides are unchanged.

### The hall door, with no ride

`eris-hall-door` puts the eye in the State Office hall (region 0, X −600..290), at local
(200, −100), facing door `$3FC` (region 5, X 290..300, Z −149..−51, shut), and walks at it.
Its Proximity Box opens the door as the eye approaches. The eye is held at **X 289**, the
hall's edge less one, for the 36 stops the latch reads `$01`. At stop 57, once the latch
reads `$FF`, it crosses into region 6. This is the same clamp at a Region Gate that is not
met, without a ride.

## The port against it

The port (`web/src/damocles/session.ts` `advance`, `web/src/damocles/selection.ts`
`clampStructureStep`) was run through the same walks. It already:

- runs the Mover during a ride and turns freely;
- keeps the car's region for the whole ride (`$05A35C`, `web/test/damocles-lift.test.ts`);
- keeps the walked X/Z and yaw across the arrival.

It differs in one place. `clampStructureStep`'s `admitsNeighbour` requires the neighbour's
Region Gate to be met (`regionIsAvailable`). The Working Authority's edge test at
`$05A504`–`$05A5EA` does not. So where the gate is not met, the port clamps at the inset
edge and the Working Authority at the region's own edge less one:

| Walk | Working Authority | Port |
| --- | ---: | ---: |
| State Office car at the doorway, during a ride | X −611 | X −622 |
| State Office hall at door `$3FC` while it opens, no ride | X 289 | X 278 |

The port does have the step past the region's own edge, when its neighbour is admitted.
But it lacks the Working Authority's fallback when no region can be selected there:
clamping to the current region with no inset (`$05A4CA`). A correction that drops the gate
from the edge test must add that fallback, or a ride would let the eye through the doorway.
[#517](https://github.com/odogono/mercenary/issues/517) specifies it.

[#517](https://github.com/odogono/mercenary/issues/517) made both changes together:
`clampStructureStep` no longer tests the gate at an inset edge, and past the region's own box
it clamps to that box with no inset when no region may be selected, with a pending ride
refusing every region. The port now holds the eye at X −611 and X 289
(`web/test/damocles-lift.test.ts`, "the eye at a region edge").

The port walks about 6.6 units a tick on foot, against 10 a substep here. The walk is outside
ADR 0049, advanced by session seconds from a derived average
([`walk` in eris.json](../../web/damocles/eris.json)), and this note does not revisit it.

## What this does not settle

- **The bump sound.** The clamp raises `$5A646`. The frame loop arms `$04C630` on the
  vector `$04BF54` when it rises (`$05958A`–`$0595B2`). The runs saw the flag. The sound was
  not recorded, and the port has no Sound Cue for it.
- **Running** (the R toggle) was not held. It changes the step, not the clamp.
- **A key during the arrival frame's own substeps**, and walking while the doors are still
  opening on the new Floor, beyond the one `eris-forward` shows, were not traced separately.

## Runs

```sh
python3 research/damocles-st/scripts/lift-ride-probe.py decode
python3 research/damocles-st/scripts/lift-ride-probe.py movement --roms roms
python3 research/damocles-st/scripts/lift-ride-probe.py movement --roms roms --case eris-walk-in
```

A case raises as *not reached* when its precondition fails: no admission in a lift, no
arrival, nothing moved although the stick was held, or, for `eris-walk-in`, a key that did
not land in the frame that would leave. A trace that contradicts the decode raises:
the region, its flags or the doorway slot changing mid-ride; a settled eye outside the car,
or past the predicted clamp at any edge; Y moving mid-ride; or the eye moving across the
arrival by more than a frame's walk. For the hall, the eye passing the hall's edge less one,
or leaving the hall, before the door latches open.
