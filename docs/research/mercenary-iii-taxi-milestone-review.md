# Mercenary III: accepted taxi milestone review (D1)

Accepted with research gates, 2026-09-30, for [#638](https://github.com/odogono/mercenary/issues/638). The user accepted these decisions after review of [R1 journeys](mercenary-iii-taxi-journeys.md), [R2 content/presentation](mercenary-iii-taxi-content-presentation.md), [R3 persistence](mercenary-iii-taxi-persistence.md) and [R4 shared mechanisms](mercenary-iii-shared-mechanisms.md). R4/#636 is complete. This review records decisions and commissions work; it contains no runtime implementation or claim that the remaining probes have passed. **Update, 2026-09-30:** [#642](mercenary-iii-taxi-cadence.md) closed the cadence gate at eleven ticks per frame (item 2).

The bounded slice starts at the recovered METIS prison opening and covers TAXICARD activation/call/admission, selection and Start for DOOBERRY'S SOLICITORS or METIS SPACEPORT, both journeys, dwell and on-foot exit. Save and Session Resume are required for completion. R2 bounds structures to nine records across eleven occupied cells. Campaign completion, buses, ordinary craft flight and subsequent spacecraft boarding are outside this milestone.

## Seven decisions

| Item | Accepted decision |
|---|---|
| 1. Frame rate | 50 game ticks per second. This makes the 50-VBL game second equal wall time; it is an explicit adaptation, not proof of this STX's original video standard. |
| 2. Frame cadence | Nine ticks per simulation frame was provisional, with eight walking substeps. The rule was to use eleven only if nine failed and exactly eleven passed both arrival outcomes, and otherwise to return to review. **Confirmed by [#642](mercenary-iii-taxi-cadence.md): eleven.** At exactly nine the solicitor arrival is refused; at exactly eleven the solicitor arrival is accepted and the spaceport arrival refused. [ADR 0058](../adr/0058-run-mercenary-iii-at-50-hz-with-a-confirmed-fixed-frame-cadence.md) records the trade-off and its duration costs. |
| 3. Shared boundaries | Under [ADR 0043](../adr/0043-admit-damocles-play-alongside-the-second-city.md), reuse existing pure seams plus R4-evidenced numeric/render-distance helpers only where needed. Keep MIII session state, passenger services/admission, script interpreter and content adapters title-specific. No broad sound/message/workspace extraction; boarding convergence stays with #419. Original-code similarity is evidence, not permission to copy code (ADR 0002). |
| 4. Browser accommodations | Preserve instant 90°/180° route turns and drop refused arrival ID messages. Preserve player-owned yaw aboard, route heading deltas added to it, and the offset after exit. No turn smoothing or forced arrival message. |
| 5. Probes | Commission exact cadence (#642), lettering (#643), projection/clipping/fill/face order (#644), prison latch and sound attribution (#645), and night-flip/sky recovery (#646). Require #637 before persistence implementation. Waive exact ST rasterisation and TOURCRAFT confirmation for this slice; do not claim the entire spaceport arrival view is complete. |
| 6. Out-of-view circulation | Empty-taxi batched circulation counts as route simulation. Do not draw unoccupied cells; validate later calls and admission against the resulting route state. |
| 7. Save/Session Resume | Include both in I2 and adopt all six refined R3 criteria. MIII identity includes its Title and pinned research baseline, with separate storage and bidirectional cross-title rejection. Damocles schema identity is not compatibility evidence; no original-save compatibility is claimed. |

## Commissioned work and gates

| Ticket | Completion gate / deliverable |
|---|---|
| [#642 — exact cadence](https://github.com/odogono/mercenary/issues/642) | **Done** ([report](mercenary-iii-taxi-cadence.md)). Nine failed and eleven passed both outcomes, so eleven is adopted. R4 and ADR 0058 are updated, and timed acceptance is unblocked. |
| [#643 — lettering](https://github.com/odogono/mercenary/issues/643) | Recover required token/font/placement facts, especially details 56 and 59; gates affected I1 content and I2 presentation. |
| [#644 — projection](https://github.com/odogono/mercenary/issues/644) | Recover projection, clip, fill and face ordering; gates affected I1 adapters and I2 comparison, without exact ST rasterisation. |
| [#645 — prison door](https://github.com/odogono/mercenary/issues/645) | Recover `$406C` initialization/transitions/access and confirm or reject sound attribution; gates I2 opening, sound and restoration. |
| [#646 — night](https://github.com/odogono/mercenary/issues/646) | **Recovered** ([report](mercenary-iii-taxi-night-sky.md)): runtime day rule, full fractional METIS phase, cached angular coordinates, MIII stars and the bounded plain METIS horizon. R2/R3/R4 are corrected. I2 must compare this presentation and prove Save/Session Resume preserves its future; TOURCRAFT and the complete arrival sky/body inventory remain waived. |
| [#637 — future-affecting bytes](https://github.com/odogono/mercenary/issues/637) | Decode or prove reconstruction of required state before persistence implementation. Independent live-play development may proceed. |
| [#647 — I1](https://github.com/odogono/mercenary/issues/647) | Admit `/dion`, title identity and bounded content/runtime adapters; complete required content gates. |
| [#648 — I2](https://github.com/odogono/mercenary/issues/648) | Complete both journeys and Save/Session Resume after I1 and all applicable research gates. |

Required recovery remains a gate on the affected work, not a reason to defer the accepted milestone. Draw nothing for unrecovered geometry and count gaps; required gaps prevent completion. No invented stand-in or Damocles placement/model is admitted by resemblance. The pinned STX SHA-256 remains `4e8b74122910bcaa109b944eebb6f0ec18fdeb1175c34eea3c932d0e1b18b62c`; reports carry the rest of the provenance and portable recipes. Original media and research captures remain Restricted Material in ignored paths.

## I1 acceptance: title and content boundary

- `/dion` uses title slug `dion`, a sibling MIII Gameplay Session/runtime, title-local content validation and Browser Shell boot/input/panel/render integration. Extend the existing title interfaces only as necessary; they do not currently supply a universal rendering/action API.
- Load only MIII content with pinned-baseline validation. Reserve independent Save/Session Resume identity and storage; I2 provides restore-complete behavior. Test mismatched/malformed content rejection and isolation from other Titles.
- Account for the nine required structure records across eleven occupied cells and required opening/cabin/card content. Tag recovered, derived and authored values with provenance under ADR 0043's discipline; independently implement from documented facts under ADR 0002.
- Share only the approved pure seams. Any numeric/distance helper extraction must retain relevant Targ and Damocles regressions and their existing arithmetic/timing behavior. Verify all three title boot boundaries.

## I2 acceptance: journeys and persistence

Live-play acceptance combines R1/R2 with R4's corrections:

1. Opening messages, prison doorway and logo panel match the recovered state. TAXICARD activation clicks, reveals for 64 ticks and refuses panel input during reveal; a later call may proceed while unrelated text occupies the message bar.
2. Admission follows the render-selected resident, ordered guards, proximity exponent ≤9 and ten-pass retry window. Test successful and failed approaches by position, not the baseline's 650-VBL walk.
3. Each destination remains stationary without Start. With Start, assert the exact 112/507-frame rides and the 22-frame descent at eleven ticks per frame: 1,232/5,577 ticks to destination, and dwell at 1,474/5,819. Assert R1's distinct endpoints. Service owns position; route heading deltas preserve the player's yaw offset. Walking aboard does not move the taxi.
4. Early L is discarded, never queued. A new L succeeds only at settled dwell and restores the call panel. Validate empty-taxi batched circulation through subsequent calls/admission.
5. Preserve the single message bar and busy gate, dropped refused ID messages, frame-paced scripts, tick-paced waits, cabin/height animation, grid/card readouts and the ten sound programmes with their evidenced triggers/channel assignments. No invented reveal, boarding, turn or footstep sounds. Require solicitor arrival acceptance and spaceport refusal at eleven ticks per frame. Do not assert unsupported cross-mechanism interleavings.
6. Preserve within-run cash and elapsed-clock rules; do not invent a universal zero fare or hard-code the historically discrepant opening balance. Assert [#646's night rule](mercenary-iii-taxi-night-sky.md), using full fractional METIS phase, cached angular coordinates and recovered frame sampling, not a universal flip VBL. Compare the MIII star pass and plain METIS horizon at both journeys' checkpoints; do not replace them with Damocles content. Draw occupied-cell content only.
7. Combine state assertions with deterministic screenshots at opening, reveal, boarding, selection, travel/turn, arrival and exit checkpoints. State what comparisons cannot establish. Retain relevant Targ/Damocles regressions whenever shared code changes.

Persistence adopts all six [R3 refined criteria](mercenary-iii-taxi-persistence.md#remaining-hypotheses-and-milestone-refinements), under the confirmed timing model:

1. Across all 33 control checkpoints on six trajectories, Save restoration and Session Resume with the same subsequent inputs preserve ordered call/admission/selection/Start/turn/destination-clear/arrival/dwell/exit/clock/narrative/cash transitions within one simulation frame; endpoints match exactly. Compare restored browser play against uninterrupted browser play. Original RAM controls alone do not prove a portable Save Snapshot complete.
2. Preserve unconsumed B and pending admission. Descending counter 35/34 still rejects L until settled dwell, with no queued leave.
3. Restore script waits, timed scripts, message text/scroll/hold and spaceport arrival refusal. Preserve or prove deterministic reconstruction of future-affecting animation, sound, night and simulation-phase state; #637 resolves the undecoded required bytes first. For night, retain full turn phase and cached angular context, rebuild derived sky values before the first restored view, and compare before/across/after the rule boundary. Recalculating those cached coordinates from taxi XYZ is not sufficient ([#646](mercenary-iii-taxi-night-sky.md)).
4. Rebuild the full panel, including card, destination, grid, cash, clock and message bar, from state rather than old incremental pixels.
5. Mid-reveal restoration preserves palette/phase and input refusal.
6. Enforce MIII Title plus pinned-baseline identity and bidirectional cross-title Save rejection; keep Session Resume isolated per Title. Do not reuse Damocles identity as proof of compatibility.
