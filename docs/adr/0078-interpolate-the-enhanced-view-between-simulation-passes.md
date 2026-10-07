# Interpolate the Enhanced view between simulation passes

Accepted, 2026-10-07, for [#825](https://github.com/odogono/mercenary/issues/825). This sits beside [ADR 0049](0049-run-one-damocles-substep-per-tick-without-st-frame-cost.md), [ADR 0051](0051-run-the-damocles-craft-pass-exactly-once-every-four-ticks.md) and [ADR 0058](0058-run-mercenary-iii-at-50-hz-with-a-confirmed-fixed-frame-cadence.md) and reopens none of their timing.

Both Titles draw the latest Session Snapshot on each `requestAnimationFrame`. Mercenary III moves the eye once a frame, every eleven ticks (about 4.5 Hz), with its eight walking substeps run as a burst, and it samples its sky phases once a frame. Damocles aboard moves the craft once a pass, every four ticks (12.5 Hz). Drawn as they stand, both step: Mercenary III's walking, turning, taxi, flight and Bodies visibly, Damocles's craft less so. The cadences are right for the simulation. What was missing is a presentation layer between passes.

## Decision

- **Fixed timestep with render interpolation.** The Enhanced view draws one pass behind: the previous pass's view blended toward the current one by `alpha = (ticks since the last pass + the clock's unspent time) / ticks per pass`. One mechanism serves both Titles: `ViewInterpolator` in `web/src/enhanced/interpolation.ts`.
- **What is blended.** The Pose: position along the line, heading, pitch and roll the short way round. Residents present in both passes, by id: position and heading. Sky items present in both passes, by id: offset, and a disc's terminator split. The stars keep their place in the sky, shifted by the bearing and pitch between the pass's eye and the drawn eye, and filled at the view's edge from the previous pass. Models fixed to the view turn and move with the drawn eye. Everything else, such as the bound structure, region, doors, forms and colours, is drawn from one pass: the one whose cell the drawn eye stands in, since Mercenary III binds only the eye's cell.
- **Pass phase from the session, read only.** Each session reports its pass and the fraction of the next one run: `DionSession.passPhase()` from its tick and remainder, and `DamoclesSession.passPhase()` aboard from its pass ticks and frame accumulator. Damocles counts its passes for this, outside its Snapshot and Save. The Browser Shell's `FixedStepClock.leftover` adds the display time it has not yet stepped, so a display frame with no step still moves the view.
- **Cuts snap.** A Title says whether one pass follows on from the last. Mercenary III cuts on a Body change, boarding or leaving the cab, and entering or leaving space; Damocles on a Body change and on entering or leaving space. A skipped pass, a restored Save, New Game, a session takeover and a Shell Console command also snap.
- **Presentation only.** Only the Enhanced view reads the blend. Nothing reaches the session, so Save/Resume, Golden Traces and the exact frame and substep counts are unchanged. The `data-*` readouts still report the session's own Pose.
- **Enhanced only.** The Authentic presentation draws each pass as it stands, as the ST did. Damocles on foot draws as now: its Pose moves on every 1/60 s step (ADR 0049), and it reports no pass phase.
- **No extrapolation.** The view lags the simulation by up to one pass: about 220 ms in Mercenary III and 80 ms in Damocles aboard. Extrapolating the turn from its rate would cut the perceived lag but overshoot when a turn stops. That is left for play to judge.

## Considered alternatives

- **Separate simulation and view timers** (`setInterval` or a Worker): the view already runs on `requestAnimationFrame`, apart from the fixed-step simulation. A faster view timer has no new poses to draw, and `setInterval` jitters and is throttled.
- **Spreading Mercenary III's substeps one per tick**, as ADR 0049 does for Damocles: smooths walking only, not turning, taxi, flight or the Bodies, and risks the cross-mechanism order ADR 0058 pins.
- **Simulating at display rate with rules scaled per tick:** ADR 0058 rejected this because it breaks exact integer counts.
- **A presentation pose published by each session:** the Enhanced scene each Title already builds carries the Pose, the residents and the sky, so the interpolator blends those and the sessions add only a read-only phase.

## Consequences

- Movement the view draws can trail input by up to one pass.
- Between two passes on either side of a cell boundary, Mercenary III's view switches structure halfway along, when the drawn eye crosses into the new cell.
- Models fixed to the view follow the drawn eye's bearing, not its pitch or roll; their small mismatch while a craft pitches is accepted.
- Damocles on foot keeps its continuous-time walk. Making it discrete and drawing it through the same interpolator would amend ADR 0049, and is a possible follow-up.
