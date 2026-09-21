# Atlas System Range camera prototype findings

**Question:** the Atlas System Range landed in #410 as a flat static fit-to-frame projection of all thirty recovered Bodies. It does not pan, does not zoom, draws whole satellite groups as a one-or-two-pixel pile, and can place only nine of the thirty names. Should it get a Google-Maps-style camera with grouped markers, should that camera come from a third-party map component or from this project's own `mapView.ts`, and can a Body's disc stand for its actual size?

**Verdict:** pending owner review in the browser. The evidence below recommends **keeping the project-owned kernel and graduating the camera**, recommends **against any third-party map library**, and reports that a Body **can** be drawn at a derived true radius once the camera is close enough.

Built in one time-boxed session on 2026-09-21 on branch `prototype/atlas-system-camera`, behind `?camera=1` so `/damocles/atlas` is byte-for-byte what #410 landed and the two are comparable side by side. Prototype material, not production code.

## Should it be a third-party map component? No

1. **Wrong shape of problem.** Leaflet, MapLibre and OpenLayers are geographic tile engines: Web Mercator over lat/lon, raster or vector tiles, latitude clamped near the poles. The Atlas has no tiles and no geodesy. The System Range is a flat Cartesian plane in raw engine units, and the Body Range (#411) is a 4096-cell surface that wraps on *both* axes. Mercator wraps in longitude only, so the torus would have to be fought rather than expressed.
2. **The kernel already exists and is tested.** `web/src/catalogue/mapView.ts` already provides `fitView`, `clampView`, `zoomView` (anchored), `panView`, `project`/`unproject`, `gridStep` and the flood-fill clustering; `web/src/catalogue/map.ts` already implements wheel, drag with a click threshold, arrow-key pan and `+`/`-`/`0`. The whole prototype cost **357 lines of new source** and two additive changes to the kernel. A library would have replaced none of that and added a projection to work around.
3. **Policy.** `web/package.json` has zero runtime dependencies with `knip` enforced. ADR 0019 chose a project-owned renderer over a general engine, and #209 re-declined Three.js on measured evidence. #405 had already settled Canvas 2D plus a DOM overlay for the Atlas.

## Grouping without claiming a Primary

The reader's instinct — "show only the primary planets, then reveal moons on zoom" — cannot be implemented as stated. The planet/moon/`Primary` table is not a recovered field: it is structural inference in `docs/research/damocles-gamma-system.md`, and ADR 0014 keeps it out of `payload/damocles/system.json`.

It does not need to be. **Grouping Bodies that fall within a fixed number of screen pixels of each other reproduces the same structure from the coordinates alone**, and says nothing about any Primary. At the fit camera it yields ten markers:

`DIALIS +1` `MIDAS +1` `DION +3` `GAEA +2` `ERIS +5` `LOGOS +1` `TRITON +2` `JUNO +4` `MENTOR +1` `DAMOCLES`

— the star, the nine planets and the comet, purely geometrically. The marker wears the name of the widest recovered extent among its members, which is the rule `layOutLabels` already used to break label collisions, and a count of the rest. Deliberately a count and not "ERIS system" or "ERIS and its moons".

## Why the threshold is in pixels, not engine units

There is no clean threshold in engine units. Single-linkage merge distances over the thirty recovered X/Z positions:

- widest gap *within* a satellite group: 30,735 (TRITON/THALIA)
- nearest gap *between* two groups: **16,000 (PERSEUS/JASON)**

The between-group gap is *smaller* than the widest within-group gap, so no distance in units both groups the satellites and keeps the groups apart.

In pixels of the current camera there is a wide plateau. At a 900x600 frame the whole System fits a span of 8,883,000 units, or 9,870 units per pixel:

| gap | units | markers |
| --: | ----: | ------: |
| 4–5.9 px | 39,480–58,233 | 11 (DIALIS separates from ICARUS at 58,807 units) |
| **6–19 px** | **59,220–187,530** | **10, one identical partition throughout** |
| 20–21 px | 197,400–207,270 | 9 (DAMOCLES chains into the GAEA group at 193,250 units) |
| 22 px | 217,140 | 8 |

`MARKER_GAP = 14` px sits in the middle of a 3.2x plateau. A pixel threshold is also the honest one: "these two markers would land within fourteen pixels of each other at this Range" is a fact about the drawing, not a claim about the System. And it needs no thresholds per Range and no state per marker — a marker dissolves exactly when its members are far enough apart to be told apart. Measured splitting from the fit: 10, 10, 16, 25, 30 markers at 1x, 2x, 8x, 32x, 64x.

## Two real bugs found on the way

- **`fitView` was not aspect-aware** (`mapView.ts` measured span across the width only). The Catalogue never noticed because `#map` is `aspect-ratio: 1`. On the Atlas's 900x600 stage it clipped MENTOR and JUNO off the map. Fixed additively: `fitView(points, aspect = 1)`, so the Catalogue's behaviour and tests are unchanged.
- **`CLUSTER_GAP = 0.02`** is tuned for surface placements and would merge DIALIS with ICARUS. The Atlas needs its own threshold, so the flood fill was generalised to `clusterAll(points, gap)` and `clusterOf` re-expressed through it.

## Can a disc stand for a Body's actual size? Yes, and it should

**This section corrects an earlier reading in this document.** The first pass concluded that true scale was undrawable, on the grounds that the recovered extent is around 10^6 while satellite groups are separated by around 10^4, so every satellite would sit inside its Primary. That treated the extent as a radius in raw position units. It is not.

The engine's own size formula, recovered at `$052EB4..$052ECC`:

```
move.l  $6040(a0), d1      ; the extent field
move.w  (a5, d3.w), d3     ; a5 = $64000, log table, indexed by range
move.w  (a5, d1.w), d1     ; log of the extent
sub.l   d3, d1             ; a subtraction in log space is a division
move.w  (a6, d1.w), d1     ; a6 = $60000, antilog table
move.l  d1, $1540(a0)      ; apparent size
```

`$60000` is confirmed as an antilog table: its entry at index `$800` is 5792, which is exactly `4096 * sqrt 2`, so the table holds `4096 * 2^(i/4096)` over one octave. The subtraction between two logarithms is therefore a division, and **apparent size is `extent / range`**. The extent is a radius in *some* unit, and two independent bounds bracket that unit:

| bound | value | basis |
| --- | --: | --- |
| No two of the thirty Bodies may overlap | divisor >= **932.8** | tightest pair ERIS/VESTA, 2,400 units apart |
| A captured screen of the ERIS group: ERIS 398 px, VESTA 123 px | divisor >= **~928** | size is `extent / range`, so the range ratio is 2.88; with the pair 2,400 units apart the viewer is at most 1,276 units from ERIS, bounding ERIS's radius |

**1024** is the power of two between them, and a shift on a 68000. At that divisor no pair overlaps, the tightest clearance is 211 units (ERIS and SOLON), and the screenshot's viewer sits about 120 units above ERIS's surface. Both bounds are lower bounds, so a Body may be **smaller** than drawn and never larger; the map says so in the panel and the readout.

That replaces the authored growth curve the first pass used. A disc is now `max(marker, derivedRadius / unitsPerPixel)`: a marker while a Body is genuinely under a marker's width, the Body itself once it is not. There is no compression constant, no square root and no cap, because the growth is the derived radius arriving. The crossover is around 68x; the whole ERIS group is to scale by 512x.

It also removed a design problem rather than creating one. The first pass had to push the marker merge threshold out with the growth, because an invented curve made members collide as a group separated. The derived radius cannot: non-overlap is the bound the divisor was chosen to satisfy. `MARKER_GAP` is therefore back to a flat 14 px and the fit picture is unchanged. Two discs both drawn to scale never intersect at any camera, which is pinned by a test; markers can still touch, because at 11 css pixels a marker is wider than half the gap -- a judgement about symbols, not a claim about Bodies.

### What this does *not* fix

The recovered extents span only **1.69x** across all thirty Bodies, from 857,088 to 1,446,792, and no divisor changes a ratio. So ERIS really is only 1.12x VESTA, and on a top-down map they correctly look similar.

The 3.24x difference in the game screenshot is **range, not size**, which the engine's formula settles: `extent / range` with equal extents and a 2.88x range ratio. The perspective view is dominated by how near the viewer is; a map has no viewer. The two pictures do not disagree.

## Double-press to zoom

`dblclick` on the map zooms 2x anchored under the pointer, which `touch-action: none` also delivers as a double-tap. It needs no guard against hitting a marker: a single press on a marker has already been handled as a pick, so in practice this is the empty-space gesture it was asked for. Measured exact: three double-presses take the camera from 1x to 8x.

## What the prototype showed

**The picture is much better.** Thirty overlapping discs with eight visible names become ten separated markers with nine names, a grid for spatial reference, and a ring marking every marker that stands for more than one Body. Clicking a group flies to it and always splits it: clicking `ERIS +5` opens at 512x with all six members named. At DPR 2 everything stays crisp.

**Clustering alone did not fix the labels.** With the existing right-or-left label rule only **six** of the ten markers could be named: the inner System is a knot where DIALIS, DION, MIDAS, ERIS, GAEA and DAMOCLES are all within a label's width of each other. Adding above/below/other-side as fallback placements took it to **nine of ten**, with DAMOCLES the only name withheld. That fallback is behind an opt-in flag on `layOutLabels`, so the static Range's layout is exactly what #410 landed. Worth carrying into production.

**Zooming into the middle shows nothing, and that is true.** The recovered Bodies sit in scattered groups and the System's centroid is empty space, so a wheel zoom anchored at the centre of the frame lands on a blank grid. Google Maps has the same property over ocean. Mitigated here by naming it in the status line — "No recovered Body is in view. The Gamma System is mostly empty space" — plus a Fit System button and the roster. Worth reviewing whether that is enough or whether the camera should prefer the nearest marker.

**The status line had to move, and the toolbar had to be pinned.** Writing a scale readout into `#status` from inside the `ResizeObserver` risks the sentence wrapping, shrinking the frame that was just measured. The readout moved to the toolbar, on the Catalogue's `#map-scale` pattern — and then the toolbar wrapped instead, which was the same bug one row up. Two fixes: the toolbar never wraps and its readout truncates, and it carries `min-width: 0`, because a grid item defaults to `min-width: auto` and an unwrappable toolbar was otherwise setting the stage column's minimum width and pushing the map out under the sidebar. Until both were fixed the camera was not even deterministic: the same gesture landed on 527x or 542x depending on when the observer fired. Afterwards every reading is exact.

**A camera sitting at the fit must be refitted on resize, not re-clamped.** The fit span depends on the frame's aspect, so adding the toolbar row left the untouched map reading 1.1x. Re-clamping is right for a camera the reader has moved and wrong for one they have not, so `atFit` is compared against the fit rather than flagged on every gesture, which also makes Fit System and the `0` key restore a refittable camera.

**Markers still overlap at the split moment.** `LARGEST_DISC = 11` means a 22 px disc while the gap is 14 px. Distinguishable in practice, but whether `LARGEST_DISC` should come down is a presentation judgement about the unresolved radius/extent encoding, and belongs in its own issue.

## What it cost

| | |
| --- | --- |
| New source | `src/atlas/systemCamera.ts` + `src/atlas/camera.ts` |
| Kernel change | `mapView.ts`: `fitView` aspect parameter, `clusterAll`; `clusterOf` re-expressed through it |
| Changed in place | `boot.ts` (camera ownership, gestures, three-way press), `draw.ts` (grid, rings), `system.ts` (`layOutLabels` over label targets, `offscreen`, fallback sides) |
| New tests | `test/atlas-camera.test.ts`, 16 cases |
| Runtime dependency | none |
| Landed behaviour | unchanged: all 6 Atlas e2e specs and every #410 unit assertion pass untouched |

`bun test` 1540 pass, `tsc --noEmit`, `eslint`, `knip`, `prettier --check` all clean. The three `catalogue.e2e.ts` failures observed in this session reproduce identically on `main` at `054473e` and are unrelated.

## Evidence

Static Range as #410 landed it — thirty discs, eight visible names, twenty-two withheld:

![The landed static System Range](../frames/atlas-system-camera-static.png)

The camera prototype at the same viewport — ten markers, nine names, grid, group rings:

![The camera prototype at the fit](../frames/atlas-system-camera-fit.png)

Clicking `ERIS +5` opens its six members at 512x, each drawn at its derived radius against the distance scale -- ERIS widest, THEON narrowest, and the pair ERIS/SOLON nearly touching at 2,332 units:

![The ERIS group opened at derived radii](../frames/atlas-system-camera-eris-open.png)

The same camera with `Sizes: markers`, which is what the extent ratio alone gives:

![The ERIS group opened with marker sizes](../frames/atlas-system-camera-eris-open-fixed.png)

Wheel zoom anchored on the empty centre of the System, with the status line naming it:

![Zoomed into empty space](../frames/atlas-system-camera-empty-centre.png)

At DPR 2:

![The prototype at device pixel ratio 2](../frames/atlas-system-camera-dpr2.png)

## If it graduates

1. File a child of #405, "Atlas: System Range camera and Body markers", and comment on #405 that its "System view: a flat static orthographic projection" decision is superseded. **The discrete hop into a Body stands** — only an unambiguous single-Body marker enters a Body; a marker standing for several opens to its members instead, because there is no one Body it could mean.
2. Land it **before #411**, so both Ranges are built on one camera kernel.
3. Production work this prototype deliberately skipped: the `?x=&z=&span=` URL round-trip with a debounced `replaceState`; `panel.ts` copy stating what a marker is and that disc growth is authored; e2e coverage of drag, wheel, double-press, buttons and keys; pinch-to-zoom.
6. Decide whether `Sizes: to scale` is the only behaviour or stays a control. The toggle exists here to make the comparison, not because the Atlas needs a setting.
7. The derived divisor deserves its own issue and a section in `docs/research/damocles-gamma-system.md`, which currently records `$006040`'s encoding as undecoded. The division at `$052EB4` and the antilog table at `$60000` are decoded; the divisor is bounded, not decoded, and should be published as derived or not at all (ADR 0014). The Atlas is the only consumer today.
4. Note on #411: the clamping seam. The System Range wants today's `clampView` exactly, and the Body Range must not be clamped to a bounded square. When the second behaviour exists, replace the `fit: MapView` first argument of `clampView`/`zoomView`/`panView` with `MapBounds { fit, centre: 'clamp' | 'wrap' }`; the span bound is unconditional either way.
5. Note on #415: it deletes `catalogue/map.ts`, which is why the gesture layer was written fresh rather than retrofitted. Add "delete the duplicated gesture handling" to its checklist.
