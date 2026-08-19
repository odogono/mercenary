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

Both read the gitignored `/payload/` from the repository root, and `bun test` reads the
gitignored `/traces/` beside it — the dev server has no use for a Golden Trace and does not
serve one. Neither directory is in Git; both are derived from the Reference Build. If they
are missing, emit them first:

```sh
cd ../app && swift run mercenary --emit-traces
```

A Replay Gate whose Golden Trace or payload file is absent **fails**. It does not skip: a
module without a passing replay is not ported, and a gate that quietly passes when its
evidence is missing is worse than no gate.

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
- `src/shell/` — the page. Throwaway until #95: it loads the payload, projects one fixed pose
  and draws it once, so a browser frame can be held beside a raster in `../docs/frames/` and
  judged by eye (ADR 0011).
- `test/replay/` — the Replay Gate harness: locate artifacts, parse JSON Lines, fold the
  recorded deltas forward, compare values bit-for-bit, and check that the payload on disk is
  the one a trace was recorded from.

Nothing here is a mechanical translation of the Swift implementation or of the Reference
Build. Both are read for understanding; neither is copied (ADR 0002, ADR 0014, ADR 0019).
