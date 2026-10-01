# Mercenary III: I2 taxi journeys and persistence

Implementation of [#648](https://github.com/odogono/mercenary/issues/648), 2026-10-01, under [D1](mercenary-iii-taxi-milestone-review.md) and [ADR 0058](../adr/0058-run-mercenary-iii-at-50-hz-with-a-confirmed-fixed-frame-cadence.md). `/dion` now plays the opening prison-to-solicitor and prison-to-spaceport journeys with title-local Save and Session Resume. The authority remains the pinned STX `4e8b7412…b62c`, EmuTOS `154803e3…d5` and Hatari 2.6.1 `05723606…11a`.

## Play and cadence

The session advances VBL rules at 50 ticks per second and one atomic simulation frame every eleven ticks. Input has one unconsumed action mailbox. ENTER activates the carried TAXICARD; its 64-tick reveal clears the old image over 32 ticks, swaps the card colours, then exposes the new image over 32 ticks. `*` calls or Starts, `+`/`−` select, B opens ten admission passes, and L leaves only at counter 2. ARROWS walk and turn. The System Menu pauses the session.

Opening script `$19` hands over DOOR KEY A. The prison attachment moves one unit per walking substep, clamped to 142, then takes an extra substep to latch open. A passenger bypasses walking/contact and door motion. Admission uses the previous frame's nearest drawn candidate, including hooked occupants with no model. It decrements the window before testing service counter, proximity exponent, bound-region flag, resident range and context. Tests cover a refused nearer mailbox, a pending successful B, exponent 10 refusal and exponent 9 acceptance. Approach stops by position instead of reproducing the historical walk duration.

The taxi's route cursor and progress drive its motion. The current or next occurrence of a route point supplies control after a cell crossing; a cell alone is insufficient because `(4,1)` appears twice with different controls. Empty circulation makes up to sixteen calls in a frame outside the player's cell. It never binds or draws those unoccupied cells. Selection alone stays at dwell. Start arms ascent before movement. A passenger follows taxi XYZ and receives heading deltas on top of player-owned yaw. Walking aboard changes no taxi coordinate.

| Journey               | Start-to-destination frames after the arming frame | Descent frames | Settled player XYZ             | Route heading |
| --------------------- | -------------------------------------------------: | -------------: | ------------------------------ | ------------: |
| DOOBERRY'S SOLICITORS |                                                112 |             22 | `09DF8080, 0000003F, 04308000` |             0 |
| METIS SPACEPORT       |                                                507 |             22 | `09E18000, 0000003F, 042A8080` |           768 |

Turns remain instant. Start and destination clear before requesting arrival ID `$25`. Early L is discarded at ascent, travel and counters 35/34; a fresh L at counter 2 restores the call panel. The player keeps the exit pose while the empty taxi departs. The two first-trip scripts never mutate cash: tests retain the within-run BCD balance without asserting a universal fare or extrapolating the historical opening-balance discrepancy.

## Narrative, animation, sound and night

The title-local VM consumes decoded instructions, executes at most one opcode per frame, and advances waits/timed-script countdowns per tick. Its availability, flags, continuation stack, queue, cabin selector and object-key state are explicit. One persistent 288×6 message bitmap shifts eight columns per scroll tick. Script text keeps its 201-tick busy interval; ID padding and scroll-out keep their own interval. A busy ID request is dropped. At eleven ticks per frame, solicitor arrival is accepted and spaceport arrival is refused. Timed and queued continuations are tested separately from the natural journeys; they are not claimed as natural trace observations.

Driver animation loads the first count with profile cleared, decrements on frames, toggles at subsequent counts, and consumes the cabin selector. Repeated writes of the same selector restart a sequence. Sign, height, clock, grid, card and message presentation rebuild from state.

Sound uses MIII's recovered setup registers and streams on a shared project-owned YM2149 chip model. B carries the key-click envelope, C the door, descent, lift-off/engine and leave programmes, and A the message tone. Cell crossings emit immediate B/C cuts without replacing their programmes. Door-stop continues to METIS's silent ambient case. The driver, stream age, registers, mixer and slew are saved. Audio unlock/Load/menu resume synchronizes full registers and reconstructs B's envelope age so an expired click does not replay. Analogue output and exact PCM phase are the shared chip model's approximation, not ST audio parity.

Damocles and Dion share `sound/stProgrammes.ts` for the identical reset registers, key-click envelope, door entry and playback, count/value stream evaluation, period writes and message-character selection. Dion still supplies its decoded setup registers and streams. A register-by-register cross-title test covers both door loops, interrupted stop bursts and the key click. The complete drivers cannot be substituted: Damocles scales engine volume with craft speed at a fixed period, while Dion slews taxi-engine pitch at level 10; message periods are character ×2 versus ×4, with different terminal timing; a stopped door returns to the craft engine versus METIS ambient. Dion's serializable driver state and both titles' scheduling remain local. The YM2149 model, worklet host, transport and audio lifecycle were already shared.

The remaining message-tone skip is resolved by the decoded scroll mechanism: eight pixel columns per tick consume four six-pixel glyphs over three ticks. Tone fetch precedes the extra glyph read on tick 1 modulo 3, so character indices are `0,2,3,4,6,7,…`, or `ceil(4*(age−1)/3)`. Tests assert those indices directly. This is a documented behavioral fact, independently implemented; no original code was copied or translated.

The sky uses #646's full fractional turn accumulator, rate `$3B0`, cached longitude/latitude and sun angle. Frames sample the rule; taxi XYZ does not refresh the caches. The exported 1,868 star records include the 268-record wrap, with the pinned colours and clip row 68. The bounded METIS horizon contains no vertices or primitives. Tests cover fractional carry, restoration immediately before sampling, and the 44/49 exposed exit-view stars.

## Save and Session Resume

Schema 1 contains simulation state and the fractional tick remainder, rather than original-engine RAM. Identity requires Title `dion`, Destination `metis`, the pinned program SHA-256 and the complete served-content SHA-256. Nested state is validated before constructing a replacement session. Slot Saves and automatic recovery share the codec but have separate title-local storage keys. Foreign titles, baselines, content, Destinations, schemas and malformed continuations are refused. Targ and Damocles refuse MIII records in return.

The snapshot preserves unconsumed input, admission window/candidate, reveal phase, taxi route/progress/heights/dwell/selection, player yaw and pose, clock, cash, message bitmap/timing, VM state, driver/sign animation, sound and sky phase. Held browser keys are transient and supplied again as later inputs. Bound doors clear on passenger cell changes; an every-frame restore comparison covers the entire 530-frame spaceport ride/descent.

All 33 R3 control names on six trajectories are expressed as semantic checkpoints at the accepted cadence. Controls replay the recorded actions from a fresh browser session without restoration; Save and Session Resume branches replay the identical later actions and 600 further frames. Every ordered state agrees exactly, which is stricter than the one-frame acceptance allowance. Full panel pixels agree immediately after Load. The same matrix runs both in Bun and in Chromium against the served payload. Floating-point sub-tick rounding is tolerated by the existing tick boundary epsilon; the compared browser futures are simulation state, not JSON property order or floating-point remainder spelling.

Web Locks isolate the advancing/persisting owner. Cooperative takeover flushes the previous owner's latest recovery record before yielding. The old tab exposes TAKE OVER again. Browser tests cover handoff in both directions, keyboard activation/call, slot Save/Load and page reload, while preserving other Titles' recovery sentinels.

## Provenance and reproduction

New sky and initial taxi-progress fields are decoded by `m3lab.sky` and `m3lab.service`; the portable exporter emits them. The added fields carry supplementary capture hashes because the original I1 documents remain from their recorded export run. A fresh pinned local replay supplied `start.ram` SHA-256 `5bd00eb63ba83b68ae32992fc201af11047c985948517a4e6f16c0422d8c3aa0`. It confirms initial progress 2048, cursor `$41F24`, full turn phase `$00009AE0` and the cached observer. Static sky ranges enforce #646's hashes. RAM, original screenshots and audio remain ignored Restricted Material; none is an application dependency or tracked artifact.

```sh
# From the repository root; media must be supplied locally as the lab README describes.
PYTHONPATH=research/mercenary-iii-st python3 -m m3lab capture --name i2-check
PYTHONPATH=research/mercenary-iii-st M3_RAM=<run>/v6000.ram M3_OPENING=<run>/start.ram \
  python3 -m unittest discover -s research/mercenary-iii-st/tests

cd web
bun run typecheck
bun run lint
bun run unused
bun test
PORT=5175 bun run test:e2e e2e/dion.e2e.ts e2e/dion-taxi.e2e.ts
```

The browser fixture is served only with `MERCENARY_E2E=1`. It writes deterministic opening, reveal, boarding, selection, travel, turn, arrival, exit and later night screenshots for each route to Playwright's ignored `test-results/`. A second fresh run must reproduce every screen byte. The fixture and production page use the same title, session, panel and frame modules.

## Validation

- Full browser unit/regression suite: 2,402 tests passed, including Targ and Damocles.
- MIII live-session, VM, service, sound, sky, panel and persistence controls passed.
- The sound-sharing refactor matched the preceding commit over 20,000 mixed Damocles ticks (ordered register writes) and 10,000 mixed Dion ticks (complete driver state). Independent review found no required changes.
- TypeScript, ESLint, Prettier and unused-file/dependency checks passed.
- All 44 decoder tests passed against the pinned local capture; no ignored material is required by application tests.
- All 10 browser tests passed, including both deterministic visual trajectories, all 33 persistence controls, production keyboard/slot/reload paths, content refusal and cooperative ownership.

## Boundaries

Exact ST rasterisation, TOURCRAFT confirmation and the complete sky Body/spaceport inventory retain D1's waivers. Adjacent unoccupied cells, campaign progression, buses, ordinary craft flight, subsequent spacecraft boarding and original Save compatibility remain outside this milestone. The existing float projection and rounded walking adaptation remain as documented in I1. This implementation does not claim a complete spaceport view or unsupported ordering between original-engine mechanisms.
