# The browser implementation

The canonical codebase for the Faithful Remake (ADR 0019). The macOS application in
`../app/` is the Trace Oracle until this reaches the opening loop.

```sh
bun install
bun test          # every ported module's Replay Gate
bun run typecheck # tsc --noEmit
bun run dev       # http://localhost:5173
```

The dev server serves the page and strips the types from each `.ts` module as it hands it
over, so the browser runs the same files the tests import. That is not a build step and it is
not bundling: import specifiers keep their `.ts` extensions and each module is fetched from
disk in turn, so there is still nothing here that produces a deployable bundle — the thing
ADR 0019 gitignores and ADR 0004 gates.

Both read the gitignored `/payload/` from the repository root, and both read the gitignored
`/traces/` beside it: `bun test` grades every ported module against the Golden Traces, and
the dev server hands the page the flight traces it flies — by scenario id, against the list in
`trace-scenarios.json`, and nothing else under that directory. Neither directory is in Git;
both are derived from the Reference Build. If they are missing, emit them first:

```sh
cd ../app && swift run mercenary --emit-traces
```

A Replay Gate whose Golden Trace or payload file is absent **fails**. It does not skip: a
module without a passing replay is not ported, and a gate that quietly passes when its
evidence is missing is worse than no gate. The page is the one exception, because it grades
nothing: with no trace to fly it holds its fixed pose and names the command that emits one.

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
  place Y is flipped is the vertex shader that maps pixels to clip space.
- `src/settings/` — the tuning, read through an injectable seam that mirrors
  `Settings.load(at:read:)`. A trace header carries only its own emitter's settings, so the
  `flight` and `game-core` replays assert the port resolved the same numbers the recording was
  made with rather than defaults that happen to be close.
- `src/flight/` — the craft Mover's control loop: `settle` and the two fixed points it settles
  towards, the Craft Parameter Block a craft's handling is selected from, the flight modes and
  the touchdown verdict. `settle` is the port's heaviest consumer of `pow`, which is where
  `src/math/` stops being theoretical.
- `src/gameCore/` — the step both Movers run under: the intent, the player and game state, the
  control limits and flight model resolved for the craft in hand, the angle wrapping, and the
  subdivision that takes a long frame as several short steps rather than one long one. The
  on-foot Mover lives here, and it is a fixed step rather than a Craft Parameter Block (ADR
  0016).
- `src/navigation/` — `Containment`, and only that: the Room bounds a player on foot is pushed
  back inside of, which `src/gameCore/` needs. The navigation emitter itself is underground and
  beyond M4.
- `src/shell/` — the page. Throwaway until #95: it loads the payload, draws one fixed pose so a
  browser frame can be held beside a raster in `../docs/frames/` and judged by eye (ADR 0011),
  then plays the poses recorded in the `flight/craft-1-standard` Golden Trace on
  `requestAnimationFrame`, paced by the step the trace was recorded at. Nothing is simulated
  and nothing is steered: every pose on screen is one a Replay Gate has already compared
  bit-for-bit against the Trace Oracle.
- `test/replay/` — the Replay Gate harness: locate artifacts, parse JSON Lines, fold the
  recorded deltas forward, compare values bit-for-bit, and check that the payload on disk is
  the one a trace was recorded from.

Nothing here is a mechanical translation of the Swift implementation or of the Reference
Build. Both are read for understanding; neither is copied (ADR 0002, ADR 0014, ADR 0019).
