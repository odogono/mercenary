# Run Mercenary III at 50 Hz with a confirmed fixed frame cadence

Accepted, 2026-09-30, for [D1 / #638](https://github.com/odogono/mercenary/issues/638); cadence confirmed the same day by [#642](https://github.com/odogono/mercenary/issues/642). The two opening METIS taxi journeys use 50 game ticks per second and a fixed simulation-frame cadence of **eleven ticks per frame**. This is an explicit MIII timing adaptation, not a recovered original cadence or an extension of Damocles's four-tick policy.

[R4](../research/mercenary-iii-shared-mechanisms.md#cadence-options-for-d1) establishes two clocks: waits, messages and elapsed time count VBLs, while routes, admission and script execution count main-loop frames. Original frame cost varies with the scene and sound-driver work. The 60 Hz baseline runs its 50-VBL game seconds fast; 50 Hz makes game seconds equal wall seconds, although this STX's PAL lineage is not independently established. Fixed cadence preserves integer rules and deterministic restoration without reproducing ST CPU/raster cost.

## Decision and confirmation gate

- A tick represents one game VBL at 50 Hz. Run one complete simulation frame every eleven ticks, with the recovered eight walking substeps per frame. Each frame runs atomically after its tick's VBL rules, at a fixed phase. Within it, input and script start come first, then one script opcode, then the service. Keep tick-counted rules and frame-counted rules separate; browser rendering frequency does not drive either clock.
- **The gate is closed** ([exact cadence report](../research/mercenary-iii-taxi-cadence.md)). Nine was the provisional choice, and it failed. At exactly nine, the solicitor's WE'VE ARRIVED is refused, because the trip script's second text holds the bar until 21 ticks after the arrival. R4's patched runs showed it only because their frames averaged 9.2–9.3.
- Exactly eleven passes both outcomes: the solicitor arrival is accepted with 70 ticks' margin, and the spaceport arrival is refused 113 ticks inside a hold. A rule-level calculation and exact-cadence original-engine runs agree at 8, 9, 10, 11, 12 and 14. The calculation was unambiguous, and no message gate was altered.
- Under eleven, assert exact frame counts: the 112/507-frame rides (1,232/5,577 ticks) and the 22-frame descent (dwell at 1,474/5,819 ticks). Also assert exact tick rules, R1's endpoints and within-mechanism order. Do not assert cross-mechanism interleavings, which vary with cadence. Admission uses position/proximity rather than a timed walking recipe.
- Save and Session Resume must preserve or deterministically reconstruct the simulation phase as well as the future-affecting state established by R3/#637. No Save schema is decided here.

## Considered alternatives

- **60 Hz baseline:** reproduces its fast clock but does not resolve scene-dependent frame cost; rejected in favour of game seconds matching wall seconds.
- **Measured scene cadence:** fits captured paths but requires authored costs for other scenes and view directions; rejected as an unbounded frame-cost model.
- **Scale frame rules into per-tick rates:** breaks exact integer route counts, admission passes, substeps and one-opcode-per-frame execution; rejected.
- **Fixed nine:** closest to natural 50 Hz ride durations (within 0.2–3.4% in R4), and the provisional choice. Rejected by #642: at exactly nine the solicitor arrival is refused.
- **Fixed ten or twelve and above:** rejected. Ten refuses both arrivals; twelve and fourteen show both.

## Consequences

The [milestone review](../research/mercenary-iii-taxi-milestone-review.md) accepted the slice with this gate, and #642 has now closed it at eleven. Timed acceptance can be written against eleven.

Eleven is slower than natural 50 Hz play:
- rides are 16.6% (solicitor) and 21.1% (spaceport) longer;
- Start → dwell takes 29.5 s and 116.4 s, against 24.7 s and 95.3 s;
- the ten-pass admission window lasts 110 ticks;
- walking moves 48 units per frame, 218 units/s, against about 300 in the natural street.

These are accepted consequences of an exact cadence, not gates. Revisiting them would reopen this ADR. Targ and Damocles timing remain unchanged. ADR 0002 governs implementation from documented facts, and ADR 0043 governs the sibling runtime and narrow pure sharing; this ADR authorizes no boarding convergence.
