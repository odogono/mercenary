# Reference frames

Rasters written by `swift run mercenary --render-frame`, kept so a browser frame can be held
beside one and judged by eye. ADR 0011 makes a maintainer's review the authority on visual
fidelity, and a review needs something to review against.

These are the one payload-derived artifact this repository tracks. The Data Payload itself, the
Golden Traces and any built web bundle are all gitignored (ADR 0014, ADR 0019) because they are
game data or a distribution of it. A single still is neither: it is a picture of one pose, it
cannot be decoded back into geometry, and the alternative — a comparison that exists only on
one machine — is not a comparison anyone else can repeat. The repository is private (ADR 0017),
and publishing any of these remains gated on written clearance under ADR 0004, which names
comparison media explicitly.

Each frame records the pose it was rendered at, so it can be regenerated exactly.

| Frame | Pose | Command |
| --- | --- | --- |
| `m4.2-opening-view.png` | The crash site the game opens on, looking north — the `opening-view` Golden Trace's pose, at its 1280×800 viewport | `swift run mercenary --render-frame --output ../docs/frames/m4.2-opening-view.png --x 559104 --z 559104 --eye 128 --heading 0` |
