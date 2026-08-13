# Mercenary — macOS app

The playable artifact (ADR 0014). Four pieces: a SwiftUI shell, a wireframe
renderer, a pure deterministic `GameCore`, and a Data Payload loaded at runtime.

## Layout

| Target | Contents |
|---|---|
| `MercenaryKit` | Payload decoding, world building, projection, and the simulation. No UI, no AppKit — all unit-testable. |
| `Mercenary` | The app: window, input, Canvas renderer, palette, headless frame capture. |

## Run it

The app needs a Data Payload, which is game data re-extracted from the Reference
Build and deliberately never committed. Export one first:

```sh
research/c64-reference-build/lab payload export \
  --dataset research/c64-reference-build/work/<geometry-dataset> \
  --output payload \
  --run research/c64-reference-build/work/<interactive-run>
```

Use a dataset that passes `lab geometry verify`. `--run` is optional and names an
interactive capture to decode the text tables from; without it the app runs but
has no message line. Then, from the repository root:

```sh
swift run --package-path app mercenary
```

Discovery walks up from the working directory looking for `payload/manifest.json`.
`MERCENARY_PAYLOAD=/path/to/payload` overrides it.

## Controls

| Key | Action |
|---|---|
| `W` / `S` | Walk forward and back |
| `A` / `D`, `←` / `→` | Turn |
| `Q` / `E` | Sidestep |
| `↑` / `↓` | Look up and down |
| `Shift` | Run |
| `[` / `]` | Page through the decoded messages |

Speeds are tuned for how the walkabout plays, not copied from the Reference
Build — the fidelity bar is modernised feel.

## Headless frame capture

Renders one frame to a PNG with no window. Useful for side-by-side fidelity
spot-checks, and for looking at a scene from a machine that cannot open a window.

```sh
app/.build/debug/mercenary --render-frame /tmp/frame.png \
  --x 557056 --z 745000 --eye 400 --heading 0 --pitch 12 --cell-radius 3
```

`--heading` and `--pitch` are degrees; `--x`, `--z`, `--eye` are world units.
The command prints the candidate segment count, the number of lines actually
drawn, and how many edges the payload deferred.

## Tests

```sh
swift test --package-path app
```

Covers `GameCore` determinism and bounds, payload decoding and its failure
messages, payload discovery, world building including object grounding, and the
projection's near-plane clipping.
