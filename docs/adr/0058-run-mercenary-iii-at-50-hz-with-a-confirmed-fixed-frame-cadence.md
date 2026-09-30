# Run Mercenary III at 50 Hz with a confirmed fixed frame cadence

Accepted, 2026-09-30, for [D1 / #638](https://github.com/odogono/mercenary/issues/638). The two opening METIS taxi journeys use 50 game ticks per second and a fixed simulation-frame cadence, provisionally nine ticks per frame. This is an explicit MIII timing adaptation, not a recovered original cadence or an extension of Damocles's four-tick policy.

[R4](../research/mercenary-iii-shared-mechanisms.md#cadence-options-for-d1) establishes two clocks: waits, messages and elapsed time count VBLs, while routes, admission and script execution count main-loop frames. Original frame cost varies with the scene and sound-driver work. The 60 Hz baseline runs its 50-VBL game seconds fast; 50 Hz makes game seconds equal wall seconds, although this STX's PAL lineage is not independently established. Fixed cadence preserves integer rules and deterministic restoration without reproducing ST CPU/raster cost.

## Decision and confirmation gate

- A tick represents one game VBL at 50 Hz. Run one complete simulation frame every nine ticks, with the recovered eight walking substeps per frame. Keep tick-counted rules and frame-counted rules separate; browser rendering frequency does not drive either clock.
- Nine is conditional on [#642](https://github.com/odogono/mercenary/issues/642). R4's patched nine-VBL runs averaged 9.2–9.3, so their arrival outcomes are not proof for exactly nine. Before locking timed acceptance, independently calculate both recovered journeys at exactly nine and require solicitor WE'VE ARRIVED accepted and spaceport WE'VE ARRIVED refused.
- If nine fails, validate exactly eleven under the same criteria and adopt it only if both outcomes pass. Record the result here and in the review; eleven is roughly 16–21% slower than natural 50 Hz rides in R4. If neither passes, return to D1 timing review. Do not alter message gates to force an outcome. Ambiguous calculations require the confirming original-engine probe described in R4.
- Under the confirmed cadence, assert exact frame counts (112/507-frame rides, 22-frame descent), exact tick rules, exact endpoints and within-mechanism order. Do not assert natural-trace cross-mechanism interleavings that R4 shows vary with cadence. Admission uses position/proximity rather than a timed walking recipe.
- Save and Session Resume must preserve or deterministically reconstruct the simulation phase as well as the future-affecting state established by R3/#637. No Save schema is decided here.

## Considered alternatives

- **60 Hz baseline:** reproduces its fast clock but does not resolve scene-dependent frame cost; rejected in favour of game seconds matching wall seconds.
- **Measured scene cadence:** fits captured paths but requires authored costs for other scenes and view directions; rejected as an unbounded frame-cost model.
- **Scale frame rules into per-tick rates:** breaks exact integer route counts, admission passes, substeps and one-opcode-per-frame execution; rejected.
- **Fixed eleven first:** supported as a candidate by the sweep, but slower than nine and still requires exact-cadence confirmation; retained only as the conditional fallback.

## Consequences

The [milestone review](../research/mercenary-iii-taxi-milestone-review.md) accepts the slice with this gate, not a claim that confirmation has passed. Independent shell/content work can proceed; timing acceptance waits for #642. Targ and Damocles timing remain unchanged. ADR 0002 governs implementation from documented facts, and ADR 0043 governs the sibling runtime and narrow pure sharing; this ADR authorizes no boarding convergence.
