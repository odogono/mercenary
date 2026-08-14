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
| `←` / `→` | Turn |
| `↑` / `↓` | Walk forward and back on foot; aboard, nose down and up |
| `Shift` | Run |
| `B` / `T` | Board what you are standing next to, or take it |
| `L` | Leave the craft, once it is on the ground |
| `1`…`9`, `0` | Throttle, in a craft: ten keys onto the decoded notch ladder |
| `-` / `=` | Halve and double the throttle |
| `Space` | Shut the throttle aboard; on foot, skip the message |
| `G` | Ride the lift, where there is one — stands in for an undecoded trigger |
| `[` / `]` | Page through the decoded messages |

The cursor keys are the whole movement surface, as the original's stick was. Aboard
a craft they read as a stick rather than a camera, so pushing up puts the nose
down.

The throttle ladder is ten notches each twice the last, so it spans 512 to 1 and
its lowest rungs are imperceptible. `flight.throttleFloorNotch` is the notch the
`1` key selects, so the ten keys cover a useful window of the ladder rather than
all of it; the lowest two are below take-off speed and taxi.

Walking and flying are the same control loop over different Craft Parameter
Blocks, as they were in the Reference Build (ADR 0016), so the rates come from
the decoded parameters rather than from tuned constants. What is tuned is the
frame rate those parameters are paced at, and per-axis scales, both in
`settings.json` — the fidelity bar is modernised feel.

There is no take-off or landing key, because the Reference Build had none: build
up speed on the ground until the craft will leave it, then pitch up. Crossing back
down through the altitude band lands you, or crashes you if you arrive too fast or
too nose-down.

## Geometry debug mode

Renders a subject in isolation with its decoded numbers, so "some geometry looks
wrong" becomes a named defect. Contact sheets cover all 64 object slots and one
representative cell for each of the 98 unique surface structures.

```sh
app/.build/debug/mercenary --inspect-objects /tmp/sheet.png   # 64 tiles + table
app/.build/debug/mercenary --inspect-structures /tmp/structures.png # 98 tiles + table
app/.build/debug/mercenary --inspect-object 3 --out /tmp/o.png [--in-situ]
app/.build/debug/mercenary --inspect-cell 72 --out /tmp/c.png
app/.build/debug/mercenary --inspect-rooms /tmp/rooms.png      # all 192 underground rooms
app/.build/debug/mercenary --inspect-room 2 --out /tmp/r.png
```

An underground room's coordinates are its own — the Reference Build draws one room
at a time and expands its commands into points first — so a room's camera is framed
to its own bounds and its spans say how big it is, not where it sits.

The default view is canonical: a camera framed to the subject's own bounds, with
no level of detail and no orientation, because a malformed model has to be visible
as one. `--in-situ` draws the object as the game would instead.

## Headless flight trace

Flies a craft with no window, so the control loop can be read against the decoded
parameters instead of judged by eye. Prints every Craft Parameter Block as real
numbers and the control-loop rules, then flies a circuit: take-off run, climb,
level off, turn, descent, touchdown.

```sh
app/.build/debug/mercenary --flight-trace                  # the Dominion Dart at full throttle
app/.build/debug/mercenary --flight-trace --craft 3 --notch 7 --seconds 90
app/.build/debug/mercenary --flight-trace --poweramp       # the Dart's raised ceiling
```

## Headless frame capture

Renders one frame to a PNG with no window. Useful for side-by-side fidelity
spot-checks, and for looking at a scene from a machine that cannot open a window.

```sh
app/.build/debug/mercenary --render-frame /tmp/frame.png \
  --x 559104 --z 547104 --eye 128 --heading 0 --pitch 0
```

`--heading`, `--pitch` and `--roll` are degrees; `--x`, `--z`, `--eye` are world
units. `--roll` and a pitch past 90 degrees are what flight added: the horizon
leans with the bank and changes sides when the view goes over the top.
The command prints the candidate segment count, the number of lines actually
drawn, and how many edges the payload deferred. The example is the calibrated
cell 8:8 opening pose.

## Tests

```sh
swift test --package-path app
```

Covers `GameCore` determinism and bounds, payload decoding and its failure
messages, payload discovery, world building including object grounding, and the
projection's near-plane clipping.
