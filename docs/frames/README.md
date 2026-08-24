# Reference frames

Rasters written by `swift run mercenary --render-frame`, kept so a browser frame can be held
beside one and judged by eye. ADR 0011 makes a maintainer's review the authority on visual
fidelity, and a review needs something to review against.

These are tracked for the same reason the Data Payload and the Golden Traces are (ADR 0029):
a comparison that exists only on one machine is not a comparison anyone else can repeat. Only a
built web bundle stays gitignored, because it is a distribution rather than working material
(ADR 0019). The repository is private (ADR 0017), and publishing any of these remains gated on
written clearance under ADR 0004, which names comparison media explicitly.

Each frame records the pose it was rendered at, so it can be regenerated exactly.

| Frame | Pose | Capture recipe |
| --- | --- | --- |
| `m4.2-opening-view.png` | The crash site the game opens on, looking north — the `opening-view` Golden Trace's pose, at its 1280×800 viewport | `swift run mercenary --render-frame --output ../docs/frames/m4.2-opening-view.png --x 559104 --z 559104 --eye 128 --heading 0` |
| `issue-99-targ-sky-dusk.png` | The opening airstrip, looking west at elapsed 540 seconds (local 18:00), 1280×800 | Chromium screenshot of the Browser Renderer with the tracked Enhanced Presentation Preset and the opening Session Snapshot, replacing only elapsed with `540` and heading with `−π/2` |
| `issue-99-targ-sky-night.png` | The opening airstrip, looking west at elapsed 720 seconds (local 21:00), 1280×800 | Chromium screenshot of the Browser Renderer with the tracked Enhanced Presentation Preset and the opening Session Snapshot, replacing only elapsed with `720` and heading with `−π/2` |
