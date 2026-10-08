# Run Mercenary III at 50 Hz with a confirmed fixed frame cadence

Accepted, 2026-09-30, for [D1 / #638](https://github.com/odogono/mercenary/issues/638); cadence confirmed the same day by [#642](https://github.com/odogono/mercenary/issues/642). The two opening METIS taxi journeys use 50 game ticks per second and a fixed simulation-frame cadence of **eleven ticks per frame**. This is an explicit MIII timing adaptation, not a recovered original cadence or an extension of Damocles's four-tick policy.

**Accepted amendment, 2026-10-02:** the user accepted [D2’s transition clarification](../research/mercenary-iii-tourcraft-milestone-review.md#accepted-r6-follow-up). [R6’s strict atomic probes](../research/mercenary-iii-tourcraft-followup.md#new-probe-results) confirm the early TOURCRAFT flight at eleven logical ticks per frame, including playback, dialogue, accelerated clock and automatic exit. Original zero-tick reentries and post-wait ownership are admitted as specified below. The subsequent [campaign recovery](../research/mercenary-iii-tourcraft-campaign.md), [independent timing comparison](../research/mercenary-iii-tourcraft-timing-controls.md) and [boundary controls](../research/mercenary-iii-tourcraft-boundary-controls.md) complete connected R6 research. This amendment does not certify runtime or restored futures.

**Accepted amendment, 2026-10-08, for [#837](https://github.com/odogono/mercenary/issues/837): the EAGLE runs at four ticks per frame.**

- **Which frames.** While the player pilots the EAGLE, on the surface or in space, an atomic frame is four ticks. Eleven still governs everything else: on foot, as a taxi passenger, and in TOURCRAFT playback, including its launch, space entry and Body entry.
- **What it covers.** Every frame-counted rule runs at the EAGLE's rate during EAGLE flight: the craft pass, the interpreter's one opcode, the narrative frame, the taxi service and the encounter. Tick rules stay per tick.
- **Switching cadence.** The cadence in effect when a frame starts governs that frame. Boarding and leaving change the cadence from the next frame.
- **The phase.** The phase becomes the ticks since the last frame, not `tick % 11`. Save and Session Resume must preserve it or reconstruct it.
- **Evidence.** Four comes from Mercenary III's own evidence. The [#609 airborne slot-1 probe](../research/mercenary-iii-integration.md#4-aboard-cadence-runtime-evidence-not-a-fixed-rate-contract) recorded one pass per frame at four VBLs, in all 64 frames. It is not carried over from ADR 0051, although it matches it.
- **Why.** The EAGLE's Craft Parameter Block equals the Damocles Eagle's. At eleven ticks per frame it turned, pitched and flew about 2.75× slower than both the probe and Damocles. Its stick was also read only every 220 ms.
- **Limits.** The probe covers one scene, and scene cost varies frame length in the original. Four is therefore a fixed cadence evidenced for open flight, not a recovered constant. No recorded playback runs in EAGLE frames. A message race during EAGLE flight would be decided at four, as the probe's scene was.
- **Where the four lives.** It is a code constant beside the EAGLE's other immediate operands in `TourcraftSession`, not a payload value. Adding a payload value would change `contentSha256`, which is part of a Save's identity, and every existing Save would be refused.
- **What stays.** The eleven-tick rules, assertions and consequences below stand for every frame outside EAGLE flight. Walking substeps stay `clamp(11, 4, 8)`.

[R4](../research/mercenary-iii-shared-mechanisms.md#cadence-options-for-d1) establishes two clocks: waits, messages and elapsed time count VBLs, while routes, admission and script execution count main-loop frames. Original frame cost varies with the scene and sound-driver work. The 60 Hz baseline runs its 50-VBL game seconds fast; 50 Hz makes game seconds equal wall seconds, although this STX's PAL lineage is not independently established. Fixed cadence preserves integer rules and deterministic restoration without reproducing ST CPU/raster cost.

## Decision and confirmation gate

- A tick represents one game VBL at 50 Hz. Run one complete simulation frame every eleven ticks, with the recovered eight walking substeps per frame. Each frame runs atomically after its tick's VBL rules, at a fixed phase. Within the ordinary loop pass, input and script start come first, then one script opcode, then the service. The evidenced TOURCRAFT transition exception below preserves additional original same-frame invocations. Keep tick-counted rules and frame-counted rules separate; browser rendering frequency does not drive either clock.
- **The gate is closed** ([exact cadence report](../research/mercenary-iii-taxi-cadence.md)). Nine was the provisional choice, and it failed. At exactly nine, the solicitor's WE'VE ARRIVED is refused, because the trip script's second text holds the bar until 21 ticks after the arrival. R4's patched runs showed it only because their frames averaged 9.2–9.3.
- Exactly eleven passes both outcomes: the solicitor arrival is accepted with 70 ticks' margin, and the spaceport arrival is refused 113 ticks inside a hold. A rule-level calculation and exact-cadence original-engine runs agree at 8, 9, 10, 11, 12 and 14. The calculation was unambiguous, and no message gate was altered.
- Under eleven, assert exact frame counts: the 112/507-frame rides (1,232/5,577 ticks) and the 22-frame descent (dwell at 1,474/5,819 ticks). Also assert exact tick rules, R1's endpoints and within-mechanism order. Do not assert cross-mechanism interleavings, which vary with cadence. Admission uses position/proximity rather than a timed walking recipe.
- Save and Session Resume must preserve or deterministically reconstruct the simulation phase as well as the future-affecting state established by R3/#637. No Save schema is decided here.

## Accepted TOURCRAFT transition interpretation

Retain one global 50 Hz/eleven-tick phase across launch, space entry and Body entry. Recovered loop reentries execute as ordered subpasses within the same atomic frame: no tick, playback-frame increment or new external-input delivery occurs between them. Each original reader can still consume eligible pending input or playback records in its recovered order. Surface-to-space entry at playback frame 139 therefore invokes the interpreter twice. This exception is bounded to evidenced control flow; it does not authorize an extra opcode on ordinary frames or an added wait at each loop top.

Work after the original frame-end wait belongs to the next atomic frame, whose playback counter has just incremented. This includes the space scan and Body setup before frame 462’s single interpreter-bearing top. Launch does not reseed the global phase; first script fetch remains frame 2. Tick rules execute before each atomic frame and never between its subpasses. R8 must preserve or prove reconstruction of this phase and any pending subpass state.

Two CPU-controlled original-engine probes agree with the independent model on all 39 requests, script return at 745, contact during 883, recorded L at 927 (10,197 ticks from launch) and first on-foot top at 928. The first-foot RAM is identical at 32 and 16 MHz. Their masked-interrupt instrumentation confirms logical game-tick scheduling, not physical raster/wall-time equivalence. Message busy/refusal rules are unchanged. The early-flight cadence gate is closed under this accepted interpretation; the subsequent campaign/model/boundary reports also close D2’s bounded campaign timing/queue/encounter research gate. R7/R8 and implementation proof remain required.

## Considered alternatives

- **60 Hz baseline:** reproduces its fast clock but does not resolve scene-dependent frame cost; rejected in favour of game seconds matching wall seconds.
- **Measured scene cadence:** fits captured paths but requires authored costs for other scenes and view directions; rejected as an unbounded frame-cost model.
- **Pace every loop top or retain frame-end-only flight timing:** rejected for TOURCRAFT. The former adds time/frame progression to an original zero-tick reentry; the latter produced a one-frame dialogue discrepancy. The accepted global atomic phase preserves the recovered invocations without reproducing raster cost.
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
