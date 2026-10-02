# Which structure components Damocles draws from outside

## Research update — #370

[#370](https://github.com/odogono/mercenary/issues/370) asked how many
structures the Working Authority draws, not which components of one. This note
answered the second question — "on foot the original draws both a structure's
plan walls and its building detail, for every structure" means every *component*
of the **bound** structure — so the first was still open. It is now settled.

**Structure geometry never leaves the occupied cell.** The plan renderer
`$05A744` and the detail renderer `$053CC2` have exactly five call sites between
them, and all five lie inside the dispatch this note already documents:

| target | call sites |
| --- | --- |
| `$05A744` plan renderer | `$0533F4`, `$053406` |
| `$053CC2` detail renderer | `$0533FA`, `$053402`, `$053410` |

`$0533D4..$053418` is the whole of it. There is no second path by which a
neighbouring cell's structure could be drawn.

The dispatch is not called; it is **fallen into**. `$0533C0` walks the object
draw stream, reading a longword and a word per entry and calling `$0535A2` for
each:

```
0533C0  move.l      (a2)+, d1
0533C2  beq.b       $533d2      ; end of stream
0533C4  move.w      (a2)+, d0
0533C6  beq.b       $533d4      ; zero word: draw the bound structure here
0533C8  move.l      a2, -(a7)
0533CA  bsr.w       $535a2
0533D0  bra.b       $533c0
```

A zero word is a sentinel meaning *draw the bound Structure Workspace at this
point in the queue*, after which `$053400`/`$05340E`/`$053416` resume the
stream. The structure is therefore drawn once per scene pass, for the one
workspace `$7B5C` names, in paint order among the objects.

That is the same shape as Targ's `Structure Reach` at `'cell'`
([ADR 0034](../adr/0034-select-surface-geometry-by-the-reference-builds-own-rules.md)):
one occupied cell contributes structure geometry, and no ring or distance term
appears anywhere in the selection. Whether the browser should express it with
the same type, and whether Damocles grows a Presentation Preset to carry an
Enhanced departure, are adoption questions for
[#373](https://github.com/odogono/mercenary/issues/373), not evidence.

Recorded for contrast, both already recovered elsewhere and not re-derived here:
the **ground records** follow an altitude-indexed cell window that is the
occupied cell alone on foot (`docs/research/damocles-eris-ground.md`, #370
update), and **objects** follow no distance test at all — `$052C9C` keeps every
resident of the current body (`docs/research/damocles-object-selection.md`).
Three families, three different bounds.

## Implementation update — #373

The port adopts the bound above. `planErisFrame` filters `surface.placements`
through `withinDrawBound` (`web/src/damocles/world.ts`) before planning: ground
records and Surface Structures from the occupied Surface Cell alone, objects
from anywhere on the Body. At the Eris arrival Pose that draws 9 of the
workspace's 207 placements — the cell's 4 plus the Body's 7 objects, which
overlap by 2.

Measured on the arrival Pose through a `DamoclesSession` snapshot, the same way
before and after:

| draw | triangles | of which ground records | planner |
| --- | ---: | ---: | ---: |
| every placement | 18,008 | 7,791 | 2.2 ms |
| recovered bound | 681 | 56 | 0.09 ms |

What stops being drawn is every neighbouring cell's ground record and Surface
Structure — the spaceport apron and buildings visible across the workspace from
the arrival Pose. What keeps being drawn is the authored ground fill, which is
eye-relative rather than placement-based and stands in for the native horizon
slots, and every object on the Body however far off it stands.

Three adoption decisions, none of which reopen the evidence:

- **Damocles does not reuse Targ's `StructureReach` setting.** That type is a
  Targ Session presentation preference (`web/src/settings/index.ts`); the
  Damocles bound is recovered behaviour with no preference behind it, and
  Damocles owns its Session State under ADR 0043. The vocabulary is shared, the
  type is not.
- **No Presentation Preset carries an every-cell draw.** ADR 0034 admits one as
  Enhanced presentation, so this stays open, but nothing asks for it today and
  an unused preset would be a second draw path to keep honest.
- **Enhanced presentation draws every part of a structure aboard.** The ST draws
  only the `$C13C` group aboard and skips the plan queue, which saves time. Under
  ADR 0034 Enhanced draws the `whole` structure instead, at any height: every
  plan face, door, wall text and Floor Label, every detail record any `$C2FE`
  list names, and the `$C13C` records whose faces are all horizontal (the
  roofs). The rest of `$C13C` is left out. Those records are solid stand-ins
  for walls `$C2FE` draws open: the spaceport's side wall is record 1 with cyan
  glass (record 2) over it aboard, and records 39–42 around a real window on
  foot. The depth test and back-face culling settle what shows, where the ST
  picks faces by viewer position. Authentic keeps the `$C13C` draw. Nothing is
  enclosed aboard under either preset (`StructureDraw` and
  `wholeDetailRecords` in `web/src/damocles/selection.ts`).
- **`camera.farPlane` stays `authored`.** The Working Authority has no far
  plane in the projection sense; the browser's is a parameter of its own
  log-depth buffer (`web/src/damocles/renderer.ts`), so there is no recovered
  value to replace it with.

## Implementation update — #225

The walk now consumes Catalogue schema 6 selectors. At arrival it selects region 11's
18 plan primitives and the closed door attachment before group 2's 29-face default.
The authored assembly remains only as `structureFallback` in Eris document schema 2;
the walk fallback excludes the baked resident key. Catalogue inspection meshes stay intact.
The implementation uses the recovered region and detail boundary conventions. It does
not yet apply structure-active gates, resident insertion, runtime door-region gating or
animation; raw region-2 bounds therefore remain uninset in this slice.

Additional functional findings from the same ignored `geometry-code.txt` listing:
the region binder at `$5A270..$5A2BE` preserves signed-word endpoint sentinels while
scaling ordinary bounds and swapping negative-scale endpoints. The detail binder at
`$53BDE..$53CAE` expands X/Z endpoint sentinels to ±2147483647, and expands the Y upper
sentinel likewise. Its negative X/Z scales exchange bound order. The closed `$4200`
attachment constructor at `$5A140..$5A202` splits X at its midpoint into two leaves,
each with three wall surfaces coloured by the first three colour words; the fourth
colour belongs to attachment control. The form-1 surfaces reach the structure's lower
height, 150 for the spaceport. The static decoder retains these six walls as double-sided
geometry; the original attachment's own per-view dispatch and motion remain unmodelled.

The findings below describe the research and previous authored implementation at #223.

[#223](https://github.com/odogono/mercenary/issues/223) asked which variant of
the Capital Spaceport (`structure-01484e`) an exterior walk should draw at
`/damocles`, and whether the Working Authority shows interior geometry through
exterior windows at all. This note answers it from the pinned Atari ST captures
and the Working Disassembly: on foot the original draws **both** a structure's
plan walls and its building detail, for every structure, and chooses which
faces of each to draw by where the viewer stands. This is Working-Authority
Evidence, not Authoritative Evidence, and it mints no world terms in
`CONTEXT.md`.

## Scope and non-goals

**In scope:** the draw dispatch that orders the plan and detail renderers; the
spaceport's region table and per-region surface queues; building detail 88's
position-conditioned face lists and how one is selected; what the start pose
therefore shows; the consequence for the variant `/damocles` draws.

**Out of scope:** door animation and timing, interior lighting, the meaning of
every region flag bit, the polygon fill path, and any change to the catalogue
decoder or its five spaceport variants.

## Sources and limits

All addresses are ST physical RAM addresses. Captures, RAM images and the
Working Disassembly listing remain ignored Restricted Material under
`research/damocles-st/work/` ([ADR 0039](../adr/0039-admit-the-damocles-catalogue-before-playable-integration.md),
[research boundary](damocles-gap.md)). The two RAM images are those hashed in
[the spaceport interior note](damocles-spaceport-interior.md): the first-world
run `observe-first-world-20260818T101013Z-c5a32b7d` (`observed.ram`,
`observed.png`) and the interior run `interior-window-ram-20260818T172346Z-e3772e4d`
(`interior.ram`). The byte ranges below are identical in both:

| Range                                        | Content                                  | SHA-256                                                            |
| -------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------ |
| `$533D4..$53419`                             | Plan/detail draw dispatch                | `1bc89637e2e20f0fda59f407c77c0bd42f8563778f5cee5d87d91da787fca6f2` |
| `$14966..$14AAB`                             | Structure 74 region table and queues     | `ba0eac2767a750b21f210cf523102df1973edb03583b173e77d80159c6f84574` |
| `$30648..$3074D`                             | Building detail 88 conditioned face lists | `12101bdb3600346a7a9b9cda162b84414a58eb247b0b92c77eb1da837d8c5dd1` |

Face numbers for detail 88 are **one-based** as the source lists write them.
The interior note numbers the same faces zero-based; its window facade and
cyan patch 1/2 are 2/3 here, its doorway facade and grey patch 31/32 are
32/33, its doorway surrounds 35–37 are 36–38, and its window surrounds 39–42
are 40–43.

## Both components are always dispatched on foot — Confirmed

> Read with the #370 update above: "both components, for every structure" is
> about the components of the one **bound** structure. The dispatch is reached
> once per scene pass and draws only the occupied cell's workspace.

The dispatch at `$533D4..$53418` is generic; it is not specific to the
spaceport.

- `$533D6`: if the walk flag `$7A8E` is not 1 (boarded), only the detail
  renderer `$53CC2` is called.
- `$533DE`: if `$7AF6` is negative, only the detail renderer is called.
- Otherwise the plan renderer `$5A744` and the detail renderer are both
  called, in an order set by the selected region's flag word `$7B34`: bit 14
  clear draws detail, then the surrounding object stream (`$533C0`), then the
  plan queue; bit 14 set with bit 12 clear draws plan then detail; bits 14 and
  12 set draw detail then plan.

`$7AF6` is written at `$5A64A..$5A666` as the sign of
`($7A2E − $4000) | ($7A36 − $4000)`, where `$7A2E` and `$7A36` are the low
words of the player's world X (`$7A92`) and Z (`$7A9A`). Both captures hold
positive values (`$3CBD` outside, `$46CD` inside). The region scanner `$5A30E`
and the plan renderer `$5A744` also return early when `$7B02` or `$7AF6` is
negative; `$7B02` is 0 in both captures. What positions make `$7AF6` negative
is not resolved here.

The detail renderer `$53CC2..$53CF6` chooses a face-list group before drawing.
On foot with `$7AF6` and `$7B02` non-negative it requires bit 15 of `$7B34` to
be set, else it returns without drawing, and it uses the bound group at
`$C2FE`. With `$7AF6` or `$7B02` negative, or boarded with `$7A30` zero, it uses
the bound group at `$C13C`. Boarded with `$7A30` non-zero it draws nothing.
Both observed regions carry bit 15 (`$8000`, `$C000`), so on foot at the
spaceport the detail is drawn from the `$C2FE` group.

There is therefore no per-structure flag that turns interior drawing on. The
plan component, which the catalogue calls the interior layout, is drawn from
outside whenever a structure is active on foot.

## Structure 74 has twelve regions — Confirmed

The region table follows the door attachment in the structure record, from
`$14966` to the three zero bytes ending at `$14AAB`. Each entry is a flags
word, X min, X max, Z min, Z max (raw, before the model's X/Z scale 2), then
an inline one-based surface queue ending in a zero byte, padded to a word.
`$5A2FA` writes `$7B32 = 11` and the scanner `$5A332..$5A4C6` runs `dbra` on
it, so it visits twelve descriptors; `$7AFE` counts them from 1, so the
selected index in `$7AFC` is one-based. The workspace copy at `$B23C..$B2E3`
holds the scaled bounds, 14 bytes per region. The interior note's "region
count 11" is this word, not the number of regions.

| Region | Flags   | Raw X          | Raw Z          | Queue (one-based plan primitives)                                                                |
| -----: | ------- | -------------- | -------------- | ------------------------------------------------------------------------------------------------ |
|      1 | `$8000` | 420–780        | −380–380       | all 28, then `$FF`                                                                               |
|      2 | `$83FC` | 650–750        | −400–−380      | 26 22 23 9 27 25 8 10 24 7 12 13 2 5 17 3 4 18 1 6 16 15 20 `$FF` 21                            |
|      3 | `$C000` | 400–800        | −2000–−400     | 26 22 23 9 27 25 8 10 24 7 12 13 2 5 17 3 4 18 1 6 16 15 20 `$FF`                               |
|      4 | `$C000` | 400–800        | −32768–−2000   | 16 15 20 `$FF`                                                                                   |
|      5 | `$C000` | 800–32767      | −32768–−400    | 26 22 23 9 27 8 25 10 24 7 12 13 2 5 17 3 4 18 1 6 16 20 `$FF`                                  |
|      6 | `$C000` | 800–32767      | −400–400       | empty                                                                                            |
|      7 | `$C000` | 600–32767      | 400–32767      | empty                                                                                            |
|      8 | `$C000` | 400–600        | 600–32767      | empty                                                                                            |
|      9 | `$C000` | −32768–400     | 400–32767      | 22 23 13 15 20 `$FF` 21 14 19 2 3 17                                                             |
|     10 | `$C000` | −32768–400     | −400–400       | 26 22 23 13 9 28 11 25 10 24 12 7 15 20 `$FF` 21 14 19 5 2 17 3                                 |
|     11 | `$C000` | −32768–400     | −32768–−400    | 26 22 23 13 9 28 11 25 10 24 12 7 5 2 17 3 15 20 `$FF`                                          |
|     12 | `$8000` | 440–580        | 380–580        | 26 22 23 26 16 15 20 `$FF` 21 14 19 13 2 17 3 4 18 1 6 8 11 27 28 10 9 25                       |

Region 1 is the room and region 12 the annex north of it; both carry `$8000`.
Region 2 is the doorway strip, and its flag bits `$3FC` name the door
attachment's runtime slot `$03FC`: `$5A366..$5A382` only selects such a region
when the byte at `$5A41 + slot` is negative. The workspace copy of region 2's
X bounds is 1311–1489 rather than the scaled 1300–1500 because the binder
insets X by 11 when the control word `$4200` is non-negative; see
[the entrance-motion note](damocles-spaceport-entrance-motion.md). The `$FF`
entry in every non-empty queue is the door
attachment, as the interior note establishes for region 1.

The start pose (`x 71.44020`, `z 136.42256` cells) is at spaceport-local
about (−3109, −6634) in scaled units, in region 11, matching `$7AFC = 11` in
the first-world capture. From there the plan renderer draws **18** of the 28
static primitives plus the closed door attachment, plan first (bit 14 set).

## Building detail 88 selects its faces by viewer position — Confirmed

After the 45-face stream ends at `$30648`, the record holds two list groups.
Each group is a run of bounded records (`$FFFF`, six raw bound words X min,
X max, Y min, Y max, Z min, Z max, then a one-based face list ending in zero,
padded to a word), a zero word, and finally the group's **default** list.
`$53C06..$53CBE` binds each record's bounds to the model's scales, storing
`(−max, max − min)` per axis and the list pointer, and stores the default
list's pointer after the zero word. `$539DE..$53A00` walks the bound records
and takes the **first** whose box contains the viewer's model-local position
(the test at `$539E4..$539FA` is the unsigned form of `min < p ≤ max` on each
axis); if none contains it, the default list is used. A matched list replaces
the default rather than adding to it.

Group 1, bound at `$C13C`, is the group used when boarded or when no structure
is active:

| Record   | Raw X          | Raw Y    | Raw Z          | Faces                                                     |
| -------- | -------------- | -------- | -------------- | --------------------------------------------------------- |
| `$3064A` | 200–1000       | 600–1200 | 200–800        | 31, 1–29                                                  |
| `$30678` | −32768–32767   | 0–32767  | −32768–400     | 12–28, 4, 30, 2, 3, 31, 32, 33, 34, 8, 29                 |
| default `$306A4` | | | | 1, 2, 3, 31, 8, 12–28, 4, 35, 30, 34, 29 |

Group 2, bound at `$C2FE`, is the group used on foot at an active structure:

| Record   | Raw X   | Raw Y | Raw Z      | Faces                                                              |
| -------- | ------- | ----- | ---------- | ------------------------------------------------------------------ |
| `$306C0` | 400–800 | 0–200 | −400–400   | none (inside the footprint)                                        |
| `$306D0` | 440–580 | 0–200 | 400–580    | none (inside the annex)                                            |
| `$306E0` | 400–900 | 0–200 | −730–−400  | 36, 37, 38, 31                                                     |
| `$306F4` | 250–400 | 0–200 | −600–300   | 34, 39, 40, 41, 42, 43, 36, 37, 38                                 |
| `$30708` | 400–900 | 0–200 | −1000–300  | 21, 22, 24, 44, 26, 27, 28, 13, 14, 16, 17, 18, 19, 20, 31, 36, 37, 38 |
| default `$30730` | | | | 21–28, 13–20, 1, 4, 35, 30, 45, 40, 41, 42, 43, 31, 36, 37, 38 |

Every group-1 list that can apply from outside includes the solid window
facade and cyan patch (2, 3); the `$30678` half-space also includes the solid
doorway facade (32, 33). Group 2 never includes 2, 3, 32 or 33: from inside
either room it draws no detail at all, near the doorway or window it draws
the surrounds for that opening, and everywhere else on foot it draws the
default list with **both openings open**. On foot the doorway is closed by the
plan queue's door attachment, not by a detail face.

## What the start pose shows — Confirmed

At the start pose no group-2 box contains the viewer (X is below 500 scaled
and Z below −2000), so the detail is drawn from the default list `$30730`:
window surrounds open, doorway surrounds open, 29 faces. Beneath it, drawn
first, are region 11's 18 plan primitives and the closed door slab. The
interior is therefore visible through the window from the arrival ship, and
the first-world `observed.png` shows a cyan band across the facade at the
window's height, consistent with the room's cyan surfaces seen through the
aperture; the screenshot alone does not distinguish which interior faces they
are. The solid facade appears only from a
vehicle, or when no structure is active.

## Visibility is by list, not by facing — Observed

No facing or winding test was found in the dispatch, the region scan, the
plan queue dispatch `$5A7D6..$5A80E`, or the detail list selection. The
original hides faces by leaving them out of the position-selected lists and
by paint order; the interior note already records that wall forms 0/1 take a
segment path that may exchange endpoints. The polygon fill routines themselves
were not examined, so this is an observation about the paths read, not a
proof that no facing test exists anywhere. `rendering.cullBackFaces` in
`web/damocles/eris.json` stays an authored rendering choice.

## Consequence for /damocles

Every Eris structure other than the spaceport already draws as the union of
plan and detail, because the catalogue's generic `assembly` variant is that
union. Only the spaceport is split into variants, and `/damocles` drew its
detail alone with the door closed, leaving sky behind the open window.

`/damocles` now draws the spaceport's `combined-closed` variant. That both
components are drawn from outside is recovered above. The particular faces in
`combined-closed` are the catalogue's inspection assembly, not the original's
position-selected lists: it draws all 28 plan primitives where region 11 draws
18, adds the resident V.I.P. limo key, and draws detail faces the default list
omits (5–12, 29, 33, 34, 39, 44), closing the doorway with detail face 33
rather than the door attachment slab. The choice is therefore carried in
`web/damocles/eris.json` under `structures` with provenance `authored`
([ADR 0043](../adr/0043-admit-damocles-play-alongside-the-second-city.md)),
and modelling the region queues and conditioned lists in the walk is
follow-up work.

| Claim                                                              | Status    | Evidence                                          |
| ------------------------------------------------------------------ | --------- | ------------------------------------------------- |
| Plan and detail both drawn on foot for any active structure         | Confirmed | `$533D4..$53418`                                  |
| Region flags order the components; bit 15 gates the detail          | Confirmed | `$533E4..$533F2`, `$53CD6..$53CDA`                |
| Structure 74 has twelve regions with per-region plan queues         | Confirmed | `$14966..$14AAB`, `$5A332..$5A4C6`                |
| Region 11 (start pose) queues 18 primitives plus the door           | Confirmed | `$14A66..$14A82`, `$7AFC = 11`                    |
| Detail faces come from the first matching box, else a default list  | Confirmed | `$53C06..$53CBE`, `$539DE..$53A14`                |
| On foot the window aperture is open unless inside the building      | Confirmed | group 2 lists `$306C0..$3074D`                    |
| Solid window facade drawn only from group 1 (boarded or no structure) | Confirmed | `$3064A..$306A4`, `$53CC2..$53CF6`              |
| Start pose draws region 11's plan queue under detail default list `$30730` | Confirmed | `$14A66..$14A82`, `$306C0..$30708` bounds     |
| Visibility is by list membership and paint order, not a facing test  | Observed  | `$5A7D6..$5A80E`, dispatch and list paths read   |
| Region 2 X 1311–1489 is bind-time ±11 on non-negative `$4200`       | Confirmed | `$5A2C6..$5A2DA`; [entrance motion](damocles-spaceport-entrance-motion.md) |
| Meaning of `$7AF6` sign, other flag bits                            | Unresolved | —                                                |
| No facing test anywhere in the renderer                             | Unresolved | fill routines not examined                       |
