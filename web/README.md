# The browser implementation

The canonical codebase for the Faithful Remake (ADR 0019). The live macOS implementation has
been retired; its final accepted state is frozen at the annotated
`trace-oracle-last-good` tag for regenerating Golden Traces.

Use Bun for the app and tests, and Node 24.10 or later for Node-based tools such as Prettier.

The NorthTalk runtime uses `^0.3.0`, with the resolved version recorded in `bun.lock`.
Targ Saves are schema 20; an older Save is refused.

```sh
bun install
bunx playwright install chromium # once, for the browser gate
bun run test                   # every ported module's Replay Gate and shell unit tests, in parallel
bun run test:timings           # refresh test-timings.json, which balances CI's unit-test shards
bun run test:e2e               # live localhost walkabout in Chromium
bun run typecheck              # strict checks for source, Bun tests and Playwright
bun run dev                    # http://localhost:5173
```

The dev server serves the page and strips the types from each `.ts` module as it hands it
over, so the browser runs the same files the tests import. That is not a build step and it is
not bundling: import specifiers keep their `.ts` extensions and each module is fetched from
disk in turn, so there is still nothing here that produces a deployable bundle — the thing
ADR 0019 gitignores and ADR 0004 gates.

The tests and page both read `/payload/` from the repository root; Replay Gates also read
`/traces/`, while the live page reads `/settings.json` and advances its own Gameplay Session. All
three are tracked (ADR 0029), so a fresh checkout or worktree runs the gates as it stands — there
is nothing to populate first.

Enhanced line styling has independent structure/object and road controls. `presentation.wireframe`
and `presentation.roads` in `settings.json` each accept `thickness` (1–4 pixels) and `glow` (0–1),
with omitted fields defaulting to one pixel and no glow. Roads include runways; Road Workspace
lines belonging to a Surface Structure retain structure styling. The settings page and console
(`set weight`, `set glow`, `set road-weight`, `set road-glow`) override these values; `document`
hands a console choice back to tuning. Selected glow is the nearby maximum: the shared
`presentation.glowDistance` block defaults to `fadeStart: 4096` and `fadeEnd: 16384` world units.
Both halo strength and spread fade smoothly with camera distance along each line; line weight
stays independent. The same fade applies to structures, objects, indoor wireframes and roads,
including Arrival's moving Camera. Authentic always uses the original hairline without glow.

Targ Geometry Assets may also carry polygon faces. Authentic and Enhanced use the same
flat colours and depth-tested fills, with explicit wireframe lines drawn over them. Faces keep
concave outlines and single/double-sided winding, follow object placement and live structure
rotation, and disappear with their object's detail representation. Additional display parts
can carry coloured faces without the recovered wireframe's Road Workspace index limits (ADR 0081).

Mercenary III’s `/dion` defaults to Authentic. Its settings page offers Enhanced flat-colour
rendering at display resolution through the common renderer in `src/rendering/`, also used
by Damocles. The panel stays pixel-scaled; the choice is stored for Dion alone. Unavailable
or lost WebGL returns the current session to Authentic without overwriting that choice;
select Enhanced again to retry, or reload to retry the stored choice.

The eighteen fixed pre-extraction checkpoints in `test/fixtures/dion-authentic-672.json`
preserve indexed pixels, palette metadata, composed RGBA output and planner results. The
original eleven RAM-buffer comparisons can also be reproduced using the #647 loop-top
captures and their saved `states.json` (all inputs and generated outputs stay restricted):

```sh
bun tools/dion-ram-compare.ts /path/to/loop-top-captures /path/to/states.json \
  ../restricted/renderer-672/before
# After the renderer change, require identical output and individual agreement counts:
bun tools/dion-ram-compare.ts /path/to/loop-top-captures /path/to/states.json \
  ../restricted/renderer-672/after ../restricted/renderer-672/before/comparison.json
```

The adapter reads missing pitch and roll directly from each capture and compares the buffer
selected by `$42C01`, with the palette and horizon split, in ST-colour space. All eleven
checkpoints were unchanged by #672 (96.87% mean agreement, the earlier report’s rounded
96.9%). Enhanced makes no pixel-parity claim. ADRs 0060 and 0062 describe the shared contract.

Re-recording a Golden Trace is the exception, and it still needs the frozen Trace Oracle out of a
temporary worktree. `MERCENARY_PAYLOAD` points the Oracle at this checkout's canonical payload,
so the traces are rewritten in this checkout's `/traces/` directory beside that payload, where
the diff is reviewed as a deliberate re-recording:

```sh
repository_root="$(git rev-parse --show-toplevel)"
oracle_worktree="$(mktemp -d "${TMPDIR:-/tmp}/mercenary-trace-oracle.XXXXXX")"
git worktree add --detach "$oracle_worktree" trace-oracle-last-good
(
  cd "$oracle_worktree"
  MERCENARY_PAYLOAD="$repository_root/payload" \
    swift run --package-path app mercenary --emit-traces
  MERCENARY_PAYLOAD="$repository_root/payload" \
    swift run --package-path app mercenary --emit-traces --verify
)
git worktree remove "$oracle_worktree"
```

`lab payload export` writes only the documents it decodes, so it does not replace
`payload/typography.json`, `payload/fonts/` or the review sheets beside them — those come from
the separate exporter in `docs/typography.md`. Export **into** the payload directory rather than
replacing it; a payload missing `typography.json` still passes every Bun test and fails every
browser gate, because only the page loads it.

A Replay Gate whose Golden Trace or payload file is absent **fails**. It does not skip: a
module without a passing replay is not ported, and a gate that quietly passes when its
evidence is missing is worse than no gate. The page also fails visibly rather than presenting
a partial walkabout when its required flight, text, interaction, or settings document
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
- `src/sky/` — the pure Targ Orrery, its seeded Star Sphere and the projection of one Sky State
  into immutable direction-space batches. Enhanced presentation advances it from elapsed
  Gameplay Session time; Authentic presentation and every Indoor Scene omit it entirely (ADR
  0025).
- `src/settings/` — the tuning, read through an injectable seam that mirrors
  `Settings.load(at:read:)`. A trace header carries only its own emitter's settings, so the
  `flight` and `game-core` replays assert the flight block, the `benson` replay asserts the
  `message` and `scripts` blocks, and the `session` and `navigation` replays assert all three:
  each replay checks the port resolved the same numbers the recording was made with rather
  than defaults that happen to be close.
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
  Doorway in record order, and `opens`). The `navigation` Replay Gate drives the Gameplay
  Session through all six underground traces, covering dark Rooms, locked Doorways, deterministic
  rewiring, and both observable entries into Room 127 that govern the Flipped World.
- `src/interaction/` — document-backed reach, candidates, outcomes, and object-conditioned
  predicates. `attempt` / `leave` return `{ host, outcome }` rather than mutating a shared
  Host Callout.
- `src/benson/` — the live Benson Display and persistent Host Callout.
  `src/talk/` runs Targ's maintained Talk Scripts (ADR 0080). The historical instruction
  document and interpreter are kept under `test/oracle/` for Golden Trace and parity
  comparisons; ordinary play neither loads nor serves them.
- `src/session/` — the Gameplay Session: occupancy, the Host Callout projection, Semantic
  Actions, `advance`, World Events and PresentationEvents. Talk Scripts read and write through
  the World Port (ADR 0083), and draw from the session's own random stream. The historical
  `session` and `navigation` Replay Gates inject the test oracle; their recorded outcomes
  remain comparison baselines, while Talk Scripts have player-visible outcome tests.
- `src/shell/` — the live Browser Shell: required payload/settings composition, the browser
  Control Profile, a bounded 60 Hz fixed-step clock, and the owned WebGL2 renderer. It starts
  the opening Benson Script on the captured surface Pose, consumes only Session Snapshots for
  presentation, keeps the Reference Viewport at 1280×800, and draws surface or Indoor Scene
  batches without a general-purpose engine (ADR 0024). In the Enhanced Presentation Preset it
  also owns the optional sky shader and draws its blended batches before the unchanged scene
  passes; Authentic keeps the original renderer path. Modifier chords and browser-reserved keys
  pass through untouched; blur and hidden-page transitions release held Movement Intent and
  reset the fixed-step clock.
- `src/trace/` — reading a Golden Trace and folding its recorded deltas forward for the Replay
  Gates. It remains in `src/` because the trace schema and state fold are implementation code,
  even though the live page no longer plays a recording.
- `test/replay/` — the Replay Gate harness: locate artifacts, run the gate protocol both Movers
  are graded by (`moverGate.ts`, shared by the `flight` and `game-core` gates), run the Benson
  gate, and run the shared Gameplay Session protocol through focused `session` and `navigation`
  adapters. Every gate compares values bit-for-bit and checks that the payload on disk is the
  one its traces were recorded from. `MoverReplay` remains the driver for the flight and
  game-core gates; those traces are not folded onto `GameplaySession`.
- `e2e/` — the Chromium gates. Playwright starts the real localhost server, checks the WebGL
  framebuffer palette, walks from the Opening Scene, verifies focus loss releases held input
  and browser chords pass through, and attaches an untracked opening screenshot for maintainer
  review rather than treating cross-platform pixels as authoritative (ADR 0011). An endpoint
  enabled only by the Playwright server also replays `session/opening-loop` through
  `createWalkabout`, the real Gameplay Session and WebGL renderer, comparing all 6,291 records
  bit-for-bit and rendering its surface, airborne, touchdown and Room-1 milestones.

Nothing here is a mechanical translation of the Swift implementation or of the Reference
Build. Both are read for understanding; neither is copied (ADR 0002, ADR 0014, ADR 0019).

## Damocles Catalogue

Open `/catalogue` directly or use the game menu's **Damocles catalogue** link.
This desktop inspection page loads only the Damocles Catalogue, `payload/damocles/catalogue.json`
and its Model files under `payload/damocles/models/`, with
orbit/zoom, original flat colours, wireframe, visual forms, evidence, instance
links and a per-body list of recovered placements, each handing over to the Gamma
Atlas at its own position; the Atlas is where placements are drawn (#415). Recovery
gaps are visible, and an empty list does not imply an empty game world. See [extraction and coverage](../docs/research/damocles-catalogue.md)
for regeneration, source grammar and remaining research.
