# Run one Damocles substep per tick, without the ST's frame cost

Accepted, 2026-09-26, for [#498](https://github.com/odogono/mercenary/issues/498). Proposed
2026-09-25. The frame-cost difference below is an approved, retained difference from the Working
Authority.

The ST's frame loop does not run its game rules once per VBL. Each rendered frame runs
`clamp($51D22, 4, 8)` **substeps**, where `$51D22` is the VBLs the last frame took, and every
substep steps the lift ride (`$055A6E`) and then the Entrance Attachments (`$05AA3C`)
([the lift ride note](../research/damocles-lift-ride.md#why-the-step-is-25-vbls-substeps)). The
recovered rules are therefore counts of substeps: a door's edge travels a unit per substep, its
latch settles on a known substep, and a lift steps its label every 25.

How many VBLs a substep costs depends on how long the ST took to draw the scene. It averages one
while frames take 4 to 8 VBLs. It is more than one where frames take longer: at the Capital Spaceport
frames took 11 VBLs and still ran only 8 substeps, so the door's 93 substeps took 132 VBLs, 2.64 s.
And within a frame the substeps run in one burst, ahead of the VBLs they stand for. This is why #472
stamped a State Office arrival at VBL 80–81 that is 83 substeps from the key.

## Decision

The Damocles Gameplay Session runs **one substep per tick**, and a tick is one VBL of session time
at the Presentation document's `vblHertz`. Everything the session runs per substep uses this clock:
the lift ride step and the door pass. The port matches the recovered sequence exactly, **in
substeps**, and does not model the ST's frame cost.

This is a retained difference from the Working Authority. It is not recovered behaviour. The ST's
frame cost is a property of the ST drawing a given scene, not of any rule the program applies, and
the port draws on a host that shares none of it. Modelling it would take a frame-cost figure per
scene that nothing recovered supplies, which is an authored rate and the failure
[ADR 0043](0043-admit-damocles-play-alongside-the-second-city.md)'s fidelity rule exists to prevent.

## Acceptance envelope

A timing claim for this clock names its basis, and is one of these:

- **Substeps, exact.** Door travel, latch settlement, the ride's wait, label steps and the arrival
  match the recovered counts: the State Office lift door `$3F4` latches shut on substep 33 and G → 1
  arrives on substep 83; the Vesta lift door `$3FC` settles on substep 83; the Capital Spaceport
  door `$3FC` on substep 93. The port reproduces each count as the same number of ticks.
- **Elapsed VBLs, within one frame's burst**, only where the ST's frames took 4 to 8 VBLs. There
  the ST averaged one substep per VBL, so the port's elapsed ticks agree with an ST VBL measurement
  to within the 8 substeps a frame can run ahead of its VBLs. The State Office and Vesta traces of
  #472 are in this range.
- **Elapsed VBLs where the ST's frames took more than 8** are **excluded**. The Structure 74
  measurement of 132 VBLs for 93 substeps is one: the port takes 93 ticks, 1.86 s, not 2.64 s. It is
  not claimed as matched.

## Rejected alternatives

- **A door rate fitted to the Structure 74 wall clock.** The port did this before #498: 92 units
  in 2.64 s for every door. It contradicts the decoded step (`move.l #1,d4` on all twelve motion
  paths). It also missed the State Office and Vesta timings, whose frames were cheaper.
- **A frame-cost model**, running fewer substeps per VBL in scenes the ST found expensive. No
  recovered value says what a scene cost the ST, so every figure would be authored. It would also
  make the lift and doors slower on the same host for reasons the player cannot see.
- **Bursting substeps per rendered frame**, as the ST does. It would make timing depend on the
  host's frame rate and move each event by up to a frame, and would add nothing that the substep
  counts do not already fix.

## Consequences

- Research comparing ST timings with the port converts VBLs to substeps first, through the
  frame's clamp, as `door-speed-probe.py trace` does. It does not compare a VBL count with a tick
  count directly.
- A later decision may admit frame cost if its evidence is recovered. That needs a new ADR, not a
  change to a door or ride constant.
- The on-foot walk is outside this decision. It advances by session seconds, not by substeps.
