# Damocles filled-polygon pipeline

Working-Authority Evidence for how Damocles encodes, transforms, and draws
filled polygons — including day/night shading and interiors that look out of
windows — in the Atari ST Working Authority. Inventory-level research note for
[#79](https://github.com/odogono/mercenary/issues/79), not a Data Payload
schema and not a Game Surface filled renderer (ADR 0019, ADR 0020).

Authoritative Evidence remains bound to the C64 Reference Build. Observations
here are Working-Authority Evidence only.

## Scope and non-goals

**In scope:** how presentation is filled rather than wireframe; where soft
colour / shade tables and playfields live after world load; what transform and
geometry evidence is visible at inventory depth; whether idle time or a bounded
walk changes shading or reaches an outward-window interior.

**Out of scope:** adding a filled renderer to this remake’s Game Surface;
Gamma System place topology
([#80](https://github.com/odogono/mercenary/issues/80),
`damocles-gamma-system.md`); script VM / occupancy / flight / time
([#81](https://github.com/odogono/mercenary/issues/81),
`damocles-script-motion-time.md`); any change to `MercenaryKit` or the Targ
Data Payload; a Damocles extractor or payload; full rasteriser ISA decode.

**Language:** research wording (playfield, soft colour table, shade bank, face
fill). This note does not redefine glossary **Game Surface**, and it does not
mint Damocles renderer terms in `CONTEXT.md`. Contrast with the C64 wireframe
path in `c64-geometry-encoding.md` is analogy only.

## Working Authority and reproduce path

| Item | Value |
|---|---|
| Program | `roms/atarist/damocles_-_mercenary_ii_novagen_software_(uk).stx` |
| SHA-256 | `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef` |
| TOS pin | EmuTOS 2.06 (`154803e3…8939d5`) |
| Lab | `research/damocles-st/` (`damocleslab`) |
| Outdoor load | `scenarios/first-world.json` (SHA-256 `e5383458…8582f96e`) |
| Palette idle | `scenarios/outdoor-palette.json` (SHA-256 `75ab8868…06e3ee3`) |
| Stick walk | `scenarios/walk-toward-building.json` (SHA-256 `6a104700…814a7c34`) |
| Spaceport pad | `scenarios/approach-spaceport-pad.json` (SHA-256 `7c43e84d…091cd3f6`) |
| On-foot snapshot | `snapshots/eris-spaceport-onfoot.sav` (SHA-256 `6cee57c4…3d6398c6`) |
| Interior snapshot | `snapshots/interior-window.sav` (SHA-256 `a11254db…7ba54dd6`) |

Reproduce:

```sh
research/damocles-st/lab doctor
research/damocles-st/lab observe --scenario research/damocles-st/scenarios/first-world.json
research/damocles-st/lab observe --scenario research/damocles-st/scenarios/outdoor-palette.json
research/damocles-st/lab observe --scenario research/damocles-st/scenarios/walk-toward-building.json
research/damocles-st/lab observe --scenario research/damocles-st/scenarios/approach-spaceport-pad.json
```

Cited runs:

- `first-world`: `observe-first-world-20260818T101013Z-c5a32b7d`,
  `observe-first-world-20260818T101117Z-010b9ad3`
- `outdoor-palette`: `observe-outdoor-palette-20260818T112827Z-14ce3e63`
- `walk-toward-building`: `observe-walk-toward-building-20260818T143508Z-c60e2391`
  (controlled forward walk; supersedes the earlier ineffective FIFO run
  `…141006Z-f1b459cc`)
- `approach-spaceport-pad`: `observe-approach-spaceport-pad-20260818T152751Z-9ebdb1a1`
  (backs onto the white pad facing the pyramid + cyan-window building)
- interior window pose: `interior-window-observe-20260818T171923Z-2da8247f` (PNG),
  `interior-window-ram-20260818T172346Z-e3772e4d` (PNG + 1 MiB RAM)
- palette register dumps: `palette-outdoor-20260818T172101Z-a4a7ff2f`,
  `palette-interior2-20260818T172153Z-8ab3571f`

Interior reproduce path (save-state, not input replay): the doorway approach is
too timing-sensitive for automated input reproduction, so the interior pose is
pinned as a Hatari save-state instead. `interior-window.sav` was captured by a
human walk from the on-foot snapshot using
`scripts/record-play.py record --memstate … --snapshot-out …`; boot it with
`hatari --memstate research/damocles-st/snapshots/interior-window.sav` and the
emulator resumes standing at the window. Input trace of that walk:
`work/stick-record-20260818T171813Z-e4161eb4/stick-sequence.json`.

**Title screen alone is insufficient.** Soft colour tables and dual playfields
for the outdoor view appear after Space + world load.

## Secondary-hypothesis ledger

Secondary claims from `docs/research/damocles-gap.md` (Wikipedia, Lemon Amiga
manual transcription, Mercenary Site). Search hypotheses only.

| Hypothesis | Status | Working-Authority Evidence |
|---|---|---|
| Damocles draws filled polygons (not C64-style wireframe) | **Confirmed** | Outdoor PNGs show large flat-shaded ground/road/building faces; top-half viewport uses ~14 unique RGB colours (no line-list silhouette). Dual ST low-res playfields at `$068000` / `$078000`. |
| 16-bit rasteriser with palette management | **Partially confirmed** | Soft ST `0RGB` colour longwords at `$0060C0+` after load (absent/different at title); hardware-style 12-bit colours match observed face colours (grey road, green ground, brown/cyan building). Full draw routine not disassembled. |
| Day / night shading | **Partially confirmed (mode, not solar)** | Scene-mode palette swap is real: the interior pose rewrites the entire 16-entry hardware palette (`$FF8240+`) versus outdoors, while the `$0060C0` soft table stays byte-identical. Sun-angle / long-duration outdoor shading still not observed (idle probe negative). |
| Interiors with outward windows | **Confirmed** | `interior-window.sav` resumes inside a spaceport building looking out: interior cyan floor in the foreground, and through the window opening the exterior grey pad, green terrain, and starfield are genuinely rendered in the same frame (not a painted backdrop). Captured by human walk + `statesave`; see interior runs below. |

## Bucket findings

### Presentation is filled — Confirmed

**Working-Authority Evidence:**

- `first-world` / `outdoor-palette` / `walk-toward-building` cropped PNGs: first-person outdoor view with solid ground, road, and building faces against a starfield — not wireframe edges.
- Viewport colour census (~top half of PNG): on the order of **14 unique colours**, dominated by large flat regions (black/navy sky, grey road, green ground, building greys/browns/cyan). That is flat-shaded face fill, not a line list.

### Soft colour / shade tables — Confirmed (pointer + shape)

**Pointer:** `$0060C0`, present after world load, different at title-screen.

Shape: packed as big-endian longwords `00000xxx` where `xxx` is an ST `0RGB`
colour. First eight after load (from
`observe-first-world-20260818T101013Z-c5a32b7d`):

| Index | Word | Role (observed match) |
|---:|---|---|
| 0 | `$000` | black / sky |
| 1 | `$777` | white / bright |
| 2 | `$222` | dark grey |
| 3 | `$540` | brown building face |
| 4 | `$444` | grey road / structure |
| 5 | `$055` | cyan tower cap |
| 6 | `$322` | reddish brown |
| 7 | `$411` | dark red |

Immediately below (`$0060E0+`) further `0RGB` longwords include `$030`
(green) and repeated greys/browns — a **shade / alternate face-colour bank**,
not proven as animated day/night in this pass.

SHA-256 of the 32-byte primary table (`$0060C0`–`$0060DF`):
`d56683f6e9507fa29f482a5b9b70898a0ada80738bd08da0ac041d9050cc4029`
(stable across the cited `first-world` outdoor captures used for this note).

### Playfields / fill targets — Confirmed (double buffer)

**Pointers:** `$068000` and `$078000`, each **32000** bytes (ST low-resolution
bitplane playfield size: 200 lines × 160 bytes/line).

- The two banks are nearly identical at a frozen outdoor frame (~31623/32000
  equal bytes) — classic double buffering.
- Idle clock updates from `deadline-clock` / `outdoor-palette` write into lower
  scanlines of these banks (panel digit area), proving they are the live
  display targets the filler and HUD share.
- Cold `first-world` loads do **not** hash-equal the playfields (different
  frame phase / HUD clock), so do not pin a playfield SHA as a reproduce key.

Fill **algorithm** (scanline vs span list vs painter) stays **Unresolved**;
the write target and ST bitplane layout are Confirmed.

### Geometry encoding — Unresolved (inventory)

World-only dense banks exist after load (e.g. `$010000`–`$038000`, `$058000+`)
that are absent or different at title and identical across two cold
`first-world` loads in 32 KiB windows — candidate mesh / instance storage.
No vertex/face record stride, colour-index binding, or mesh bank pointer table
was proven in this pass. Do not treat Targ object/surface/underground formats
from `c64-geometry-encoding.md` as Damocles layouts.

### Transform / projection — Partially confirmed (work area + controlled motion)

- Observed outdoor registers often keep **A6 near `$60000`**, adjacent to the
  soft colour bank — a transform / draw work region, not decoded further.
- Navigation panel digits (`016-283`, `07-08`) appear on PNGs; RAM encoding of
  eye position / orientation was not bound.
- Controlled forward motion now **does** change the 3D viewport:
  `walk-toward-building` (hold up 30k VBLs via the `$79C2` poke) walks off the
  road onto open ground (**63,516 viewport pixel diffs**) and advances NAV
  `07-08` → `07-11`. Camera / eye-position buffers can now be isolated by
  controlled locomotion in a follow-up; the specific soft state was not bound
  this pass.

### Day / night shading — Partially confirmed (scene-mode palette swap)

`outdoor-palette` t0 → t1 (idle ~40k VBL host wait after world load):

- Panel clock advances (same behaviour as `#81` `deadline-clock`).
- PNG pixel diffs confined to the dashboard clock band (approx. PNG y
  430–443); **no** world-face colour shift.
- Soft table at `$0060C0` unchanged between t0 and t1.

So session-clock idle is **not** sufficient to observe day/night, and solar /
long-duration outdoor shading remains Fog. However, the interior capture shows
palette management **is** scene-driven: entering a building swaps the entire
16-entry hardware palette (see the outward-windows section below), so shading
by scene mode is Confirmed even though shading by time of day is not.

### Outward windows — Confirmed (interior capture with exterior in frame)

`#80` confirmed enterable buildings and `WINDOW` in message copy. This ticket
needed an interior view with exterior visible through openings — now captured.

**How the pose was reached.** Automated locomotion via the `$79C2` joystick-1
soft-copy poke is solved (see `HATARI-RESEARCH.md`), but doorway alignment is
too timing-sensitive to reproduce from a recorded input trace: replays with the
recorded stick + key timeline (including the `R` run toggle, injected via
`hatari-event keydown/keyup` and verified effective) consistently drifted off
the doorway over a ~14 s run segment. The working method is **capture the
destination, not the path**: a human walked from the on-foot save-state
(`snapshots/eris-spaceport-onfoot.sav`, which skips the ~3-minute intro) to a
window inside the spaceport building, and `record-play.py record
--snapshot-out` saved the exact end state as
`snapshots/interior-window.sav` via the debugger `statesave`.

**What the interior frame shows**
(`interior-window-observe-20260818T171923Z-2da8247f/interior.png`):

- Foreground: a large flat cyan interior floor face.
- Through the window opening: the exterior grey spaceport pad, the green
  terrain strip, and the night starfield — real exterior geometry rendered in
  the same frame, not a painted backdrop. NAV panel still reads `016-283`
  `07-08` (inside the spaceport square).

**Palette behaviour inside vs outside** (hardware registers `$FF8240`–`$FF825E`,
masked to ST `0RGB`):

| Scene | Palette (indices 0–15) |
|---|---|
| Outdoor on-foot (`palette-outdoor-…a4a7ff2f`) | `000 000 000 543 044 444 066 333 030 322 246 411 777 432 555 654` |
| Interior at window (`palette-interior2-…8ab3571f`) | `000 050 567 754 000 333 555 345 565 700 222 232 444 007 666 777` |

The two share almost nothing: entering a building **rewrites the whole
16-colour palette**. The exterior visible through the window is drawn with the
interior's palette slots (the interior set still carries a green `050` and
dark/sky entries, which is why the outside keeps sensible colours).

**Where the interior palette lives** (from
`interior-window-ram-20260818T172346Z-e3772e4d/interior.ram`):

- The soft face-colour table at `$0060C0` is **byte-identical** to the outdoor
  one (same pinned SHA-256 `d56683f6…50cc4029`) — it is *not* the live palette
  source for the scene swap.
- The live 16-word palette copy sits at **`$06FD00`** (matches the hardware
  registers exactly), immediately followed at `$06FD22` by a 17-word template
  variant with one extra entry (`$707`). The outdoor palette appears nowhere in
  interior RAM, so `$06FD00` is a per-scene scratch/current-palette buffer that
  the game rewrites on scene change, not a resident bank of all palettes.

Residual Fog: which routine writes `$06FD00` and where interior palettes are
sourced from on disk; whether outdoor palettes are also staged through
`$06FD00` on world load.

Earlier automated outdoor approaches (kept for provenance): `walk-toward-building`
(`…143508Z-c60e2391`, NAV `07-08` → `07-11`), the white-pad pose from
`approach-spaceport-pad` (`…152751Z-9ebdb1a1`), and the negative doorway
probes in `scripts/enter-building-probe.py` runs, where turn-then-walk
combinations wall-slid onto open ground and never changed `$0060C0`.

## Implications for #82 (shape signals only)

- Damocles presentation is a **filled, palette-driven ST bitplane pipeline**
  with soft face colours and double-buffered playfields — not this remake’s
  wireframe Game Surface. Stretching the live Game Surface to “also do
  Damocles fill” remains the wrong shape (ADR 0019 / 0020).
- A future Independent Implementation would need its **own** geometry, colour,
  and raster path extractors; method (lab → note → payload) can transfer.
- The captured interior confirms **scene-scoped palette swaps** plus exterior
  geometry rendered through window openings in a single frame — a renderer
  capability the Targ wireframe Game Surface does not have, further rejecting
  “Damocles is a Content Overlay on the Targ wireframe surface.” Only solar /
  time-of-day shading remains Unresolved, and it sizes risk without blocking.

## What was tried and left Unresolved

- Face/vertex record format and mesh bank pointers
- Scanline vs span fill routine identity
- Solar / time-of-day shade animation (idle probe negative; scene-mode palette
  swap Confirmed instead)
- The routine that writes the `$06FD00` palette buffer and the on-disk source
  of interior palettes
- Faithful input-trace replay to a doorway (recorded stick + key timeline
  drifts over long run segments; destination save-states supersede it)
- Camera / projection eye-position soft state under controlled motion (motion
  now reproducible via the `$79C2` poke; buffer not yet bound)

## Provenance summary

| Fact | Evidence |
|---|---|
| Outdoor view is flat-filled faces | `first-world` / palette / walk PNGs; ~14 viewport colours |
| Soft `0RGB` face colours at `$0060C0` | World RAM vs title; matches building/road/cyan |
| Dual 32 KiB playfields at `$068000` / `$078000` | Size, near-equality, clock digit writes |
| Idle time ≠ day/night | `outdoor-palette` t0/t1 world colours stable |
| Automated walk works via `$79C2` joystick-1 soft-copy poke | `walk-toward-building` viewport +63,516 px, NAV `07-08`→`07-11` |
| Near-building outdoor pose at spaceport pad | `approach-spaceport-pad` white pad + pyramid + cyan-window building |
| Interior with outward window captured | `interior-window.sav` boot → cyan floor + exterior pad/terrain/sky through opening (`interior-window-observe-…2da8247f`) |
| Scene swap rewrites the whole hardware palette | `palette-outdoor-…a4a7ff2f` vs `palette-interior2-…8ab3571f` register dumps |
| `$0060C0` soft table identical inside and outside | interior RAM table SHA `d56683f6…50cc4029` equals outdoor pin |
| Live palette copy at `$06FD00` (+ template at `$06FD22`) | 16-word match against interior hardware registers in `interior-window-ram-…e3772e4d` |
| Automated doorway entry not achieved (superseded by save-state) | soft `$0060C0` unchanged across approach probes; input-trace replays drift |
| FIFO scancode / `$61CC` queue poke do **not** move camera | `…141006Z-f1b459cc`, `joy-debugger-poke-…124048Z-bb02de4a` (0 viewport diffs) |
| Scenario pins | `first-world.json`, `outdoor-palette.json`, `walk-toward-building.json`, `approach-spaceport-pad.json` |
