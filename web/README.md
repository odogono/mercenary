# The browser implementation

The canonical codebase for the Faithful Remake (ADR 0019). The macOS application in
`../app/` remains the Trace Oracle while this browser implementation owns the live opening
loop.

```sh
bun install
bunx playwright install chromium # once, for the browser gate
bun test                       # every ported module's Replay Gate and shell unit tests
bun run test:e2e               # live localhost walkabout in Chromium
bun run typecheck              # strict checks for source, Bun tests and Playwright
bun run dev                    # http://localhost:5173
```

The dev server serves the page and strips the types from each `.ts` module as it hands it
over, so the browser runs the same files the tests import. That is not a build step and it is
not bundling: import specifiers keep their `.ts` extensions and each module is fetched from
disk in turn, so there is still nothing here that produces a deployable bundle — the thing
ADR 0019 gitignores and ADR 0004 gates.

The tests and page both read the gitignored `/payload/` from the repository root. Replay Gates
also read the gitignored `/traces/`, while the live page reads the tracked `/settings.json` and
advances its own Gameplay Session. The payload and traces are derived from the Reference Build
and never tracked. If they are missing, emit them first:

```sh
cd ../app && swift run mercenary --emit-traces
```

A Replay Gate whose Golden Trace or payload file is absent **fails**. It does not skip: a
module without a passing replay is not ported, and a gate that quietly passes when its
evidence is missing is worse than no gate. The page also fails visibly rather than presenting
a partial walkabout when its required flight, text, Benson, interaction, or settings document
is absent.

## What is here

- `src/math/` — the named seam for `sin`, `cos`, `tan`, `atan` and `pow` (ADR 0022). **Engine
  code imports these rather than calling `Math.sin` and its neighbours.** IEEE 754 pins no
  transcendental function to a last bit, and a Replay Gate is only as sound as the arithmetic
  beneath it, so the `math` gate measures the platform against the libm the traces were
  recorded from. It matches on all 2,147 samples today; if an update ever moves a bit, that
  gate goes red first and this module is where the answer goes.
- `src/payload/` — the Data Payload: types, validators, and the async loader.
- `src/text/`, `src/orientation/`, `src/world/`, `src/projection/`, `src/scene/` — the ported
  kit modules. `src/projection/` is where world space becomes screen lines; its pixel space is
  **Y-down**, as the Reference Build computes it and as a Golden Trace records it, and the one
  place Y is flipped is the vertex shader that maps pixels to clip space. `src/scene/` holds
  the Indoor Scene resolver and the Indoor Backdrop column lookup consumed by the WebGL2
  renderer.
- `src/settings/` — the tuning, read through an injectable seam that mirrors
  `Settings.load(at:read:)`. A trace header carries only its own emitter's settings, so the
  `flight` and `game-core` replays assert the flight block, the `benson` replay asserts the
  `message` and `scripts` blocks, and the `session` replay asserts all three: each replay
  checks the port resolved the same numbers the recording was made with rather than defaults
  that happen to be close.
- `src/flight/` — the craft Mover's control loop: `settle` and the two fixed points it settles
  towards, the Craft Parameter Block a craft's handling is selected from, the flight modes and
  the touchdown verdict. `settle` is the port's heaviest consumer of `pow`, which is where
  `src/math/` stops being theoretical.
- `src/gameCore/` — the step both Movers run under: the intent, the player and game state, the
  control limits and flight model resolved for the craft in hand, the angle wrapping, and the
  subdivision that takes a long frame as several short steps rather than one long one. The
  on-foot Mover lives here, and it is a fixed step rather than a Craft Parameter Block (ADR
  0016).
- `src/navigation/` — `Containment` (the Room bounds a player on foot is pushed back inside of,
  which `src/gameCore/` needs) and `DoorwayPredicate` (`$9437` byte arithmetic, first matching
  Doorway in record order, and `opens`). The six underground navigation traces are not this
  gate.
- `src/interaction/` — document-backed reach, candidates, outcomes, and object-conditioned
  predicates. `attempt` / `leave` return `{ host, outcome }` rather than mutating a shared
  Host Callout.
- `src/benson/` — the Benson interpreter: the program, the machine, the Host Callout, the
  session that clocks it, and the message line. `BensonHostState` and `BensonState` are
  persistent (each write a new value; ADR 0023). `BensonSession` is still a mutable owner that
  replaces those values. The `benson` Replay Gate grades it against nine traces, including two
  that end because the instruction limit tripped rather than because the script did. No world.
- `src/session/` — the Gameplay Session: occupancy, the Host Callout projection, Semantic
  Actions, `advance`, and PresentationEvents. A mutable class, like `BensonSession`. With
  scripts, `nextRandom` comes off persistent `BensonState`; without, a session-owned stream
  with the same seeds as Swift. The `session` Replay Gate grades the opening loop
  (`session/opening` and `session/opening-walk-to-craft`); walk-to boarding is a note on the
  trace, not a command the replay injects.
- `src/shell/` — the live Browser Shell: required payload/settings composition, the browser
  Control Profile, a bounded 60 Hz fixed-step clock, and the owned WebGL2 renderer. It starts
  the opening Benson Script on the captured surface Pose, consumes only Session Snapshots for
  presentation, keeps the Reference Viewport at 1280×800, and draws surface or Indoor Scene
  batches without a general-purpose engine (ADR 0024). Modifier chords and browser-reserved
  keys pass through untouched; blur and hidden-page transitions release held Movement Intent
  and reset the fixed-step clock.
- `src/trace/` — reading a Golden Trace and folding its recorded deltas forward for the Replay
  Gates. It remains in `src/` because the trace schema and state fold are implementation code,
  even though the live page no longer plays a recording.
- `test/replay/` — the Replay Gate harness: locate artifacts, run the gate protocol both Movers
  are graded by (`moverGate.ts`, shared by the `flight` and `game-core` gates), run the benson
  gate (`bensonGate.ts`) and the session gate (`sessionGate.ts`), compare values bit-for-bit,
  and check that the payload on disk is the one a trace was recorded from. `MoverReplay`
  remains the driver for the flight and game-core gates; those traces are not folded onto
  `GameplaySession`.
- `e2e/` — the Chromium walkabout gate. Playwright starts the real localhost server, checks the
  WebGL framebuffer palette, walks from the Opening Scene, verifies focus loss releases held
  input and browser chords pass through, and attaches an untracked opening screenshot for
  maintainer review rather than treating cross-platform pixels as authoritative (ADR 0011).

Nothing here is a mechanical translation of the Swift implementation or of the Reference
Build. Both are read for understanding; neither is copied (ADR 0002, ADR 0014, ADR 0019).
