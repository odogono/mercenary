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
The four issue-116 frames are regenerated together from `web/` with
`UPDATE_REFERENCE_FRAMES=1 bunx playwright test e2e/sky-gradient.e2e.ts`.
The three `departure-*` frames are regenerated together from `web/` with
`UPDATE_REFERENCE_FRAMES=1 bunx playwright test e2e/departure.e2e.ts`; the three `issue-160-*`
frames beside them are the prototype study's evidence (`docs/research/departure-opening-prototype.md`)
and are kept as captured.

| Frame                             | Pose                                                                                                               | Capture recipe                                                                                                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `m4.2-opening-view.png`           | The crash site the game opens on, looking north — the `opening-view` Golden Trace's pose, at its 1280×800 viewport | `swift run mercenary --render-frame --output ../docs/frames/m4.2-opening-view.png --x 559104 --z 559104 --eye 128 --heading 0`                                                        |
| `issue-99-targ-sky-dusk.png`      | The opening airstrip, looking west at elapsed 540 seconds (local 18:00), 1280×800                                  | Chromium screenshot of the Browser Renderer with the tracked Enhanced Presentation Preset and the opening Session Snapshot, replacing only elapsed with `540` and heading with `−π/2` |
| `issue-99-targ-sky-night.png`     | The opening airstrip, looking west at elapsed 720 seconds (local 21:00), 1280×800                                  | Chromium screenshot of the Browser Renderer with the tracked Enhanced Presentation Preset and the opening Session Snapshot, replacing only elapsed with `720` and heading with `−π/2` |
| `issue-116-twilight-level.png`    | The opening airstrip at elapsed 540 seconds, level and looking north, 1280×800                                     | Chromium screenshot of the Browser Renderer with the Enhanced Presentation Preset and the opening Session Snapshot, replacing elapsed with `540`                                      |
| `issue-116-twilight-banked.png`   | The same twilight view banked 45° right                                                                            | The issue-116 level recipe with roll `π/4`                                                                                                                                            |
| `issue-116-twilight-inverted.png` | The same twilight view inverted                                                                                    | The issue-116 level recipe with pitch `π`                                                                                                                                             |
| `issue-116-twilight-upward.png`   | The same twilight view pitched upward                                                                              | The issue-116 level recipe with pitch `0.7` radians                                                                                                                                   |
| `departure-carousel.png`          | Deep space at boot: the one-entry carousel over the Arrival Field, Benson Panel unmeasured, 1280×1000 viewport     | Chromium screenshot of the Game Surface at `data-departure="carousel"` (`e2e/departure.e2e.ts`, frames test)                                                                          |
| `departure-flyby.png`             | Midway through the flyby: Targ's sun and two moons sweeping past, journey slowed to 40 seconds                     | The departure recipe, 8 seconds after `data-departure="flyby"`                                                                                                                        |
| `departure-join.png`              | The join: the planet-free Arrival Field with `M E R C E N A R Y` in the panel, the Departure done                  | The departure recipe at `data-departure="done"` and `data-arrival="titleCard"`                                                                                                        |
