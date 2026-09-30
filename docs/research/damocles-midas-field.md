# The Midas uniform field, and why DAMOCLES has nothing to capture

Working-Authority Evidence for [#172](https://github.com/odogono/mercenary/issues/172), recovered
2026-09-30. It closes the item [live surface workspaces beyond Eris](damocles-non-eris-workspaces.md)
left open, where MIDAS and DAMOCLES were the two poses whose captures did not stand in a built
workspace, and it replaces "both need a fresh capture". Neither needs one. Authoritative Evidence
remains bound to the C64 Reference Build. This note records decoded ST facts only
([ADR 0002](../adr/0002-separate-rom-research-from-implementation.md)). RAM stays ignored
Restricted Material under `research/damocles-st/`.

## What was found

1. **MIDAS is one structure repeated over every Surface Cell of the Body.** Four branches test
   the flag `$7A2A`. `$0592FA` raises it (`seq.b`) when the Body being loaded is index 2, and for
   no other Body. The four branches are:

   | Site | What it does on Midas |
   | --- | --- |
   | `$04ED2A` | After the placement loop, the workspace loader copies cell 0's `$ABDC` word (key byte and structure slot) over all 256 cells. Each cell keeps its own dx/dz. |
   | `$054B76` | The cell selector masks the camera's island-local cell to its low four bits before it builds `$7B5C`. The 16×16 window wraps, so the player always stands in a copy. |
   | `$054F04` → `$05504E` | Every cell bind writes that cell's number (item 3). |
   | `$055004` | Each `$7000` ground template is spawned at twice its authored offset from the cell centre: `$8000 + 2 × (word − $8000)`, carried into the cell word. |

   `$059044` also skips the per-slot region walk for the spawned template slots on Midas. In its
   place `$059008` writes fixed bytes `0, 3, 6, 1, 7, 2, 5, 8` to `$6FAB` for slots 248–255.
   `$05321A` puts the spawned slots in the object draw list on Midas whatever `$78A6` holds.
   What either byte means is not recovered here.

2. **The field draws three by three.** Group `$38` (THE MIDAS PROJECT) authors structure 68
   (`structure-01430c`) in cell 0 and nothing else, over the ground record `$020540` in every
   cell at orientation 0. That record has no geometry of its own. It carries eight `$7000`
   templates of object 332 (`object-0418ce`), a five-vertex, four-face pyramid, authored at
   ±32767 on each axis: half a cell out. Doubled by `$055004`, they stand at ±65534, the centres
   of the eight neighbouring cells. So wherever the player is, the bound cell draws structure 68,
   which has an interior, and the eight cells around it draw a pyramid each. Nothing further
   away is drawn. A live frame from the `midas` pose shows the orange pyramid of a neighbouring
   cell at the right of the view.

3. **Each cell's ground is painted with its own number.** `$05504E` takes the high word of the
   player's X (`$7AB2`), shifts it up twelve bits, ORs in the high word of Z (`$7ABA`), and
   writes eight decimal digits back from `$CD10`, skipping a byte after every pair. The four
   pairs are the NUL-terminated strings `$CD06`, `$CD09`, `$CD0C` and `$CD0F`. Those are the
   targets of `$CCA0` tokens `$83`–`$86`, which no earlier census had seen used. The ground
   record's four `$6000` text records print exactly those tokens, flat on the ground (plane
   `$40`) in font 3. The `midas` capture stands at Body Coordinate 358,3493, and its `$CD06`
   reads `01 46 98 61`, which is 358 × 4096 + 3493 = 1,469,861.

4. **The capture was never displaced.** The camera pair's origin `−63807,−60502` is the island
   record's origin 1729,938, taken modulo 65536 and 4096. The cell word `$B5` is the pose's Body
   Coordinate less that origin, modulo 16. The refusal in the sweep note compared the camera
   origin with the *unmasked* cell arithmetic, which cannot agree on a Body whose cell wraps.
   The replayed workspace (`image_workspace`, now modelling `$04ED2A` and `$7A2A`) holds every
   table the capture's loader wrote. So does every other capture's.

5. **DAMOCLES has no workspace to recover.** Its one island record, `$0633E0` at 3991,2101,
   binds the empty group `$00`. The `damocles` capture's camera pair is exactly that origin
   (`−105` ≡ 3991). The pose stands 356,1174 cells from it, outside the window, so `$054B8C`
   clears the cell word to 0. Nothing is drawn there, because nothing is authored there.

## The residents

Midas's five residents are interior-associated with group `$38`. Each association cell is its
own Body Coordinate less 1729,938, modulo 16. So each stands in the copy of structure 68 in its
own cell, at level 0, near the cell's centre.

| Slot | Resident | Body Coordinate | Cell number | Local position |
| ---: | --- | --- | --- | --- |
| 36 | DOOR KEY A | 899,396 | 03682700 | 70, 0, −8 |
| 37 | DOOR KEY A | 904,393 | 03703177 | 28, 0, 82 |
| 39 | DOOR KEY A | 916,396 | 03752332 | 47, 0, 40 |
| 95 | MAGIC CRYSTAL | 2364,376 | 09683320 | −8, 0, −103 |
| 219 | CHEESE SANDWICH | 430,3706 | 01764986 | 137, 0, 52 |

## What the Catalogue publishes

- **`field` on the Midas island record.** It names the structure, the ground Model, the key
  base and the prefix a copy's identity takes. Every Surface Cell of the Body holds that
  structure over that ground. No other island carries a `field`.
- **`midas-the-midas-project-ground-020540-00`.** This is the ground Model with its eight
  templates a whole cell out. Its `cellNumber` gives the digit rule, and the glyphs of all ten
  digits at each of the eight places, decoded by the same lettering path as every other text
  record. A consumer composes a cell's number from eight small meshes. The record form carries
  the four texts without glyphs, as before.
- **A copy where each resident stands.** A copy is named by its Body Coordinate:
  `midas-the-midas-project-surface-2364-376` and `…-ground-2364-376`. That identity is unique
  where a window cell is not. Each resident's `placement.parent` is its cell's copy. The
  resident binder resolves it by Body Coordinate for a field, and by window cell elsewhere.
- **The `midas` arrival pose is anchored.** Its `workspaceOrigin` is the window 353,3482 it
  stands in, which is congruent to 1729,938 modulo 16 (`FIELD_ORIGINS` in
  `scripts/location-ledger.py`). DAMOCLES stays unanchored, correctly.

The catalogue grows by one Model and ten Instances. Structure 68 gains the copies as linked
Instances. No other identity or census slot moves, and the catalogue regenerates byte for
byte. The schema stays at 17, because no Save depends on the new fields. A Save taken on Midas
names the copy it stands in by the same identity, which the Save format already carries.

## How the port draws it

- `instanceById` falls back to `fieldCopy`, which builds a copy the Catalogue does not store
  from the island's `field`: the same Instance the extractor would have published. A Save, a
  Residence and the Atlas resolve an unstored copy like any other.
- The surface keeps the field (`ErisSurface.field`). `structureInCell` and `placementById`
  consult it, and the frame's surface gains the copies of the cell the player stands in
  (`withFieldAt`). A stored copy is never built again. The frame therefore draws, as the ST
  does, the bound structure 68 over a ground whose eight pyramids stand a cell out.
- A field ground placement paints its own number. `fieldCellNumber` takes the Body Coordinate
  of the placement, and each of the eight places takes its digit's glyphs from `cellNumber`.
- `switch midas` is admitted, and binds `midas-the-midas-project-surface-358-3493`. In the
  authentic preset the arrival frame matches the ST capture's: the orange face of the bound
  pyramid on the right, a neighbour's peak on the horizon, and ground `rgb(170,136,0)`.
- MAGIC CRYSTAL is drawn from its own copy at 2364,376, and not from the copy one cell over.
  Reaching it on foot means crossing about 2,200 cells of the wrapping surface (2,006 on x,
  979 on z), and no route has been played.

## Checks

- `UniformFieldTests` in `tests/test_catalogue.py`:
  - the capture's cell word is its Body Coordinate less the island origin, modulo 16, from far
    outside any window;
  - the eight template slots 248–255 in the capture stand exactly at the doubled offsets around
    the player's cell;
  - the capture's `$CD06`–`$CD10` pairs are `field_cell_number` of its Body Coordinate.
- `ImageWorkspaceTests` now compares Midas's tables like any other capture's, including `$ABDC`
  and `$7A2A`.
- `tests/test_arrival_poses.py` anchors a field pose and refuses one whose implied origin is
  not congruent.
- `web/test/damocles-midas-field.test.ts` covers five things:
  - the island's field and copy identities;
  - the number rule;
  - the arrival Pose binding its own cell;
  - copies built for the stood-in cell only, with a stored copy not doubled;
  - MAGIC CRYSTAL drawn in its own copy.
- `web/e2e/damocles-body-aware.e2e.ts` switches to MIDAS in a browser and reads the bound copy.

## Not recovered

- What the fixed `$6FAB` bytes and `$78A6` mean.
- The number at the Body's seam. `$05504E` reads the raw high words, and a pose within a cell of
  the seam has not been captured. The rule above takes the Body Coordinate 0–4095.
- Structure 68's interior beyond level 0. It publishes no storey pitch, so none is claimed.
- A Drop inside a copy. Structure 68 publishes no association table, so only a recovered
  placement is a valid Residence in it, as for every structure but Capital Spaceport.
- Structure damage on the field. `$04ED40` overlays the damage table after `$04ED2A` tiles, so a
  cleared window cell would clear every copy congruent to it. The port does not model that.
- Slot 39, a Midas resident, is the DOOR KEY A whose carried bit `$0545AC` tests to skip the
  Drop's rank comparison ([object drops](damocles-object-drops.md)). It now has a placement,
  so the acceptance matrix predicts that bypass as derived. It has not been observed.
