# Damocles placement class, and the zone a Drop writes

Working-Authority Evidence for
[#345](https://github.com/odogono/mercenary/issues/345), recovered 2026-09-19. The extent
rectangle's static decode, recorded here as the one blocker on a port writing the class, was
recovered for [#356](https://github.com/odogono/mercenary/issues/356) on 2026-09-26.

It closes a derivation two earlier notes recorded as unresolved: the
[key drops note](damocles-limo-key-drops.md) ("A complete derivation of this class
from residence is not recovered") and the
[object selection note](damocles-object-selection.md) ("the `$6FAB` class value 4
that reaches [the `$053310` bump]"). It also states, with the evidence for each,
which of the remaining [#345](https://github.com/odogono/mercenary/issues/345) gaps
recovery can and cannot close.

[ADR 0002](../adr/0002-separate-rom-research-from-implementation.md) permits factual
recovery, not translation of machine code into application code. Raw RAM, native
listings and probe output stay ignored under `research/damocles-st/work/`.
Authoritative Evidence remains bound to the C64 Reference Build; everything here is
Working-Authority Evidence.

## Evidence identity and probe

Static recovery reads the pinned first-world RAM
`observe-first-world-20260818T101013Z-c5a32b7d/observed.ram`, SHA-256
`b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967`, decoded with
Capstone M68K 68000 in the laboratory virtual environment.

Every reading is produced by the tracked
[`scripts/placement-class-probe.py`](../../research/damocles-st/scripts/placement-class-probe.py),
SHA-256 `9100a425acfc387d8297779e6760222649f34fd32111c7dd3a9a1e7cd6810b91`, over the
pinned RAM and all 34 memstates in `research/damocles-st/snapshots/` (five are tracked in
git; the rest live in the main checkout). Nothing is injected: each memstate is read as
saved. The probe's checks are gates rather than prints. A state raises if its recomputed zone
disagrees with its live `$7A39`, if its `$7A3A` is not nine times that zone, if the
Catalogue extent of its live Building detail slot does not reproduce `[$7910]`, or if the
Catalogue instance bound in its cell names a different detail or scale.

```sh
python3 research/damocles-st/scripts/placement-class-probe.py \
  --run research/damocles-st/work/observe-first-world-20260818T101013Z-c5a32b7d \
  --all-memstates
```

## The placement class is Association A byte 3

Association A byte 3 (`$6FAB + 4*slot`) is the resident's **placement class**. It is
mutable placement state, not identity:

| Path | What it writes | Where |
| --- | --- | --- |
| Direct placement | copies `$7A39` | `$0546FC` |
| Support placement | inherits the support's byte 3 | `$0546A4`–`$0546CA` |
| Bulk reclassification | recomputes it per slot from the slot's own X/Z | `$059040`–`$05906A` |

It is **not** the handling byte's low nibble. `$6FAA` is the interaction byte the take
handler tests and the drop handler's rank pair; `$6FAB` is a different byte of the same
longword. Over the 241 published resident slots the two disagree **176 times**. The
class census over all 256 slots in the pinned capture:

| Class | 0 | 1 | 2 | 3 | 4 | 6 | 7 | 8 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Slots | 42 | 4 | 5 | 8 | 185 | 8 | 2 | 2 |

Class 5 is absent, and no slot carries a class above 8. That is the shape of the
derivation below, not a coincidence.

The tracked `payload/damocles/catalogue.json` now publishes the byte per resident
instance as `placementClass`.

## `$7A39` is a 3×3 zone against the bound structure's extent rectangle

`$7A39` is the low byte of the word at `$7A38`. The only writer of either `$7A38` or
`$7A3A` in the whole image is `$0590A0`/`$0590A8`, at the tail of the routine at
`$059076`:

```
$059076  moveq    #$0,d0
$059078  movea.l  $7910.w,a0     ; the bound structure's transformed extent record
$05907C  tst.w    (a0)
$05907E  bmi.b    $590a0         ; negative header: zone 0
$059080  cmp.w    $2(a0),d1      ; d1 = $7AB4, low word of the player's X
$059084  bcs.b    $59090
$059086  addq.w   #$1,d0
$059088  cmp.w    $4(a0),d1
$05908C  bls.b    $59090
$05908E  addq.w   #$1,d0
$059090  cmp.w    $6(a0),d3      ; d3 = $7ABC, low word of the player's Z
$059094  bcs.b    $590a0
$059096  addq.w   #$3,d0
$059098  cmp.w    $8(a0),d3
$05909C  bls.b    $590a0
$05909E  addq.w   #$3,d0
$0590A0  move.w   d0,$7a38.w
$0590A4  mulu.w   #$9,d0
$0590A8  move.w   d0,$7a3a.w
$0590AC  rts
```

So the class is **which of nine cells of a 3×3 grid the position falls in**, against a
rectangle: 0/1/2 across X, plus 0/3/6 across Z, with a negative record header forcing
zone 0. Because a Damocles cell is 65 536 units, the low word of a position long is its
position *within the current cell*, so the zone is an intra-cell classification.

`$7A3A` is nine times the zone. `$05331E` adds it to the draw key, indexing the
82-byte draw-order priority table at `$05333C`–`$05338D` in nine-entry groups. That
settles the second half of the object-selection note's unresolved entry: the table is
indexed by zone, and the class value 4 that reaches the `$053310` bump is the centre
zone — inside the rectangle on both axes.

The loop at `$059040`–`$05906A` calls the same routine with each resident's own X and Z
(`$63A8`/`$6BA8`) and writes the result to that slot's `$6FAB`, alongside the cell byte
from `$7B5D`. That is how residents acquire a class of their own; the value the drop
handler copies is the one left over from the player's evaluation at `$05906E`.

### All 35 states reproduce

Recomputing the zone from each state's `[$7910]` rectangle and its `$7AB4`/`$7ABC`
reproduces the live `$7A39` and `$7A3A` in the pinned RAM and in every memstate, 35 of 35,
with no exception and no fitted constant. The detail column is the live `$53A84` slot and
the Catalogue Model at that `$26000` entry; the scale is `$539CE`×`$539D2`. A state whose
detail carries no extent has no rectangle. Its `[$7910]` is the lone `$8000` that forces
zone 0, and the words past it are stale. The first pass of this table printed those stale
words as rectangles.

| State | Zone | `$7A39` | `$7A3A` | Detail | Scale | Structure-local rectangle | Bound structure |
| --- | ---: | ---: | ---: | --- | --- | --- | --- |
| `observed.ram` | 0 | 0 | 0 | 88 `interior-0303d6` | 2×2 | `800, 1600, -800, 1200` | `eris-surface-87` |
| `boarded-car` | 2 | 2 | 18 | 88 `interior-0303d6` | 2×2 | `800, 1600, -800, 1200` | `eris-surface-87` |
| `boarded-limo` | 1 | 1 | 9 | 88 `interior-0303d6` | 2×2 | `800, 1600, -800, 1200` | `eris-surface-87` |
| `damocles.acheron` | 0 | 0 | 0 | 1 `interior-02620e` | 1×1 | — | — |
| `damocles.atropos` | 7 | 7 | 63 | 30 `interior-027dfe` | -4×-3 | `-1280, 1280, -960, 960` | `atropos-surface-11` |
| `damocles.bacchus.transporter` | 3 | 3 | 27 | 36 `interior-029392` | 4×4 | `3000, 3800, 800, 1600` | `bacchus-surface-82` |
| `damocles.clotho` | 7 | 7 | 63 | 51 `interior-02bc56` | -2×-2 | `-500, 900, -1400, -600` | `clotho-surface-01` |
| `damocles.cronus` | 0 | 0 | 0 | 1 `interior-02620e` | 1×1 | — | — |
| `damocles.cyclopes` | 1 | 1 | 9 | 28 `interior-027592` | 16×16 | `-2464, 2464, -2592, 2592` | `cyclopes-surface-22` |
| `damocles.damocles` | 0 | 0 | 0 | 1 `interior-02620e` | 1×1 | — | — |
| `damocles.dion.transporter` | 4 | 4 | 36 | 56 `interior-02cab0` | 2×2 | `-700, 400, 600, 1400` | `dion-surface-e3` |
| `damocles.eris.lift` | 4 | 4 | 36 | 43 `interior-02a9a4` | 1×1 | `-900, 900, -400, 400` | `eris-surface-89` |
| `damocles.eris.transporter.11-8` | 6 | 6 | 54 | 41 `interior-02a67c` | 3×3 | `-240, 240, -300, 210` | `eris-surface-8b` |
| `damocles.gaea.transporter` | 4 | 4 | 36 | 56 `interior-02cab0` | 2×2 | `-700, 400, 600, 1400` | `gaea-chaldea-metropolis-surface-88` |
| `damocles.icarus` | 1 | 1 | 9 | 28 `interior-027592` | 8×8 | `-1232, 1232, -1296, 1296` | `icarus-surface-12` |
| `damocles.key-west` | 0 | 0 | 0 | 1 `interior-02620e` | 1×1 | — | — |
| `damocles.logos.transporter` | 4 | 4 | 36 | 59 `interior-02cfdc` | 1×1 | `-200, 600, -1200, 1200` | `logos-surface-24` |
| `damocles.lucan` | 0 | 0 | 0 | 1 `interior-02620e` | 1×1 | — | — |
| `damocles.mentor.transporter` | 8 | 8 | 72 | 88 `interior-0303d6` | -2×-1 | `-1600, -800, -600, 400` | `mentor-surface-79` |
| `damocles.metis.transporter` | 4 | 4 | 36 | 56 `interior-02cab0` | 2×2 | `-700, 400, 600, 1400` | `metis-surface-60` |
| `damocles.midas` | 7 | 7 | 63 | 42 `interior-02a87e` | 1×1 | `-500, 500, -500, 500` | — |
| `damocles.pan` | 4 | 4 | 36 | 53 `interior-02c020` | 2×2 | `-700, 400, 600, 1400` | `pan-surface-14` |
| `damocles.perseus` | 6 | 6 | 54 | 23 `interior-027134` | -3×-3 | `-600, 600, -600, 600` | `perseus-surface-25` |
| `damocles.solon` | 6 | 6 | 54 | 38 `interior-029c66` | -3×-3 | `-600, 0, -2700, -2100` | `solon-surface-11` |
| `damocles.thalia` | 0 | 0 | 0 | 1 `interior-02620e` | 1×1 | — | — |
| `damocles.theon` | 7 | 7 | 63 | 7 `interior-026556` | 4×2 | `-400, 400, -200, 200` | `theon-surface-11` |
| `damocles.tolosa` | 5 | 5 | 45 | 39 `interior-02a18c` | 3×3 | `-1800, 1800, -1200, 1200` | `tolosa-surface-12` |
| `damocles.vesta.transporter` | 4 | 4 | 36 | 70 `interior-02e910` | 3×3 | `-2100, 2100, -600, 1650` | `vesta-surface-64` |
| `dion-2-3` | 1 | 1 | 9 | 34 `interior-028e74` | -4×4 | `-1840, 0, 0, 1120` | `dion-surface-32` |
| `dion-north-airborne` | 0 | 0 | 0 | 1 `interior-02620e` | 1×1 | — | — |
| `eris-spaceport-onfoot` | 0 | 0 | 0 | 88 `interior-0303d6` | 2×2 | `800, 1600, -800, 1200` | `eris-surface-87` |
| `gaea-ur-city-4-2` | 1 | 1 | 9 | 20 `interior-026b08` | -3×-3 | `-1500, 1500, -1500, 1500` | `gaea-ur-city-surface-24` |
| `interior-window` | 4 | 4 | 36 | 88 `interior-0303d6` | 2×2 | `800, 1600, -800, 1200` | `eris-surface-87` |
| `left-limo` | 2 | 2 | 18 | 88 `interior-0303d6` | 2×2 | `800, 1600, -800, 1200` | `eris-surface-87` |
| `vesta-parliament-4-6` | 1 | 1 | 9 | 70 `interior-02e910` | 3×3 | `-2100, 2100, -600, 1650` | `vesta-surface-64` |

Three readings in that table are worth naming.

**The zone is what separated the Eris captures.** `eris-spaceport-onfoot` and
`interior-window` stand in the same cell `$87` with the same rectangle and differ only
in position: outdoors gives zone 0, inside Capital Spaceport gives zone 4. This is the
direct evidence behind the limo-key note's observed surface drop writing class 0 over
an authored 4. That observation is now a derivation, not a special case.

**The record does not change with the floor.** `vesta-parliament-4-6` (level 0) and
`damocles.vesta.transporter` (level 10) share the same rectangle even though
[workspace selection](damocles-workspace-selection.md) shows they bind different
structures through `$7B0E`. The extent record follows the cell, not the storey.

**`$7AF2`/`$7AF4` is the bound structure's intra-cell origin.** Subtracting it gives
the structure-local rectangle in the table, and for the 29 states whose cell holds a
catalogued structure instance it equals that instance's own position, to the unit. The
probe gates that match on the body selector at `$7AC9`, on the player's cell and on the
instance's model being a structure, so a coincidence of grid phase cannot claim a binding.
Without the cell gate, Acheron's player, who stands in an empty cell, was matched to a
structure elsewhere on the body at the same centred phase. The Midas uniform field repeats
one structure over every cell, so no single catalogued instance stands in the player's cell.

## Where the rectangle comes from

`[$7910]` does not point at authored data. It points into the scratch buffer at `$CB88`
that `$053A8C`–`$053B38` fills:

- `$053AA6` resolves a Building detail record through the table at `[$4BD22]` (`$26000` in
  the pinned capture), indexed by the slot word that `$053A98` reads from the
  self-modified `$53A84`.
- `$053ACA` points the destination at `$CB88`; `$053AD0`/`$053AD4` load the
  translation from `$7AF2`/`$7AF4`; `$539CE`/`$539D0`/`$539D2` supply the X, Y and Z
  scales, which for Capital Spaceport read `2, 1, 2` and match the tracked model's
  recovered scale.
- `$053AD8` then walks the record **backwards** from its entry, seven words at a time,
  transforming six and copying the seventh, until a negative word. `$053AE4` copies that
  word, and six-word groups follow up to the next negative word. `$053B2C` publishes the
  address just past it as `$7910`, and `$053B30` transforms the five words that follow
  into the header and the two axis pairs the zone reads. Where a negative word stands in
  the header's place, `$053B38` writes `$8000` there and the zone is 0.

For Capital Spaceport the source record sits at `$0303A0`–`$0303AA` in the pinned RAM. In
address order the words are `600, -400, 800, 400, 850` below the `$8000` at `$0303AA`: header
850, X pair `400, 800` and Z pair `-400, 600` as the backward walk meets them. The scale `2, 1, 2`
and the origin `31958, 34328` carry them to the observed `32758, 33558, 33528, 35528`.

### The slot is the structure's Building detail byte

`$53A84` is a word, and its only writers are the two `move.b` instructions of the cell bind
into its low byte `$53A85`. `$054DB6` copies an alias record's byte at +5, and `$054E08`
copies a plain record's byte at −5. That byte is the record's **Building detail**. The
Catalogue already decoded it as each structure Model's interior slot and publishes the Model
it names as the structure selection's `detailModel`. Capital Spaceport is structure slot 74,
and its record's Building detail byte is 88. The two numbers index different tables, so
they were never meant to agree.

Nothing else writes `$53A84`, and `$053A8C` has one caller, `$054F10` in the cell bind. The
lift writes neither the scale nor the detail byte and does not call it, so every Floor of a
cell keeps the cell's rectangle. The Floor forms the Catalogue publishes for upper Floors
are already bound to the instance's detail and scale
([interior resident placement](damocles-interior-resident-placement.md)). `$539D0` has no
writer in the image, so the header's scale is always 1.

The `$26000` bank is byte-identical in the pinned RAM and in all 34 memstates, so the extent
is static model data. The Catalogue now publishes it on every Building detail Model as
`extent: {header, x, z}` in raw units, pairs in the order the walk meets them, or `null`
where the record carries none. Of the 61 Building detail Models only Building detail 1 carries
none, and it is the detail structure 0 binds, which is what a cell with no structure binds. The
instance scale and origin are applied at use.

The probe gates both halves. For all 35 states, the Catalogue extent of the live slot,
scaled and translated as `$053AFC`–`$053B26` does (the low word of each product, and the pair
swapped under a negative scale), reproduces all five words at `[$7910]`, or the lone `$8000`.
For the 29 states whose cell holds a catalogued instance, that instance's structure selection
names the live detail Model and the live `$539CE`/`$539D2` scale.

### When the zone is taken

`$05906E` classifies the player's position. It is called by the Drop handler's first
instruction (`$054520`), by the leave path's first instruction (`$05449C`) and by four
movement sites. A direct Drop and a leave therefore both copy the zone of the Pose they
place at. A port computes it from the Pose and the bound structure, and needs no zone state
of its own.

One Catalogue structure publishes a detail with an extent but no structure selection:
Structure 46 (`structure-0122fa`), an empty surface record at Gaea `gaea-0e-surface-88`,
binds Building detail 2, whose record has no geometry but carries the rectangle
`30000; ±25000; ±20000`. The port reads the detail through the selection, so a Drop in that
one cell writes 0 where the original would compare against that rectangle.

## The other two #345 gaps

### Floor-aware binding — since recovered

This was recorded here as a boundary, on the reading that *"what is not recovered is
the static rule mapping a level to its structure"*. [#355](https://github.com/odogono/mercenary/issues/355)
recovered it: the level indexes the cell instance's alias record at `+6`, a
twelve-byte floor table that `$054DBC` publishes in `$7C1E` and the lift reads before
assembling that structure. All seven #326 captures have their live `$7B0E` reproduced
by the static decode, and the Catalogue publishes the table as each alias structure
model's `levelBinding`. See
[the level-to-structure binding](damocles-level-structure-binding.md).

`$7AC5` and `$7AA5` hold the player's level and a drop copies it, so the value a port
would need to write was already well defined; what a port could not do was *bind* a
non-zero level. It now can, and the storey pitch the height derivation needs belongs
to the same alias record as the table. Admitting a non-zero level into
`worldPosition()` and into an interior Drop is separate delivery work and is not done
here; `payload/damocles/arrival-poses.json` still records no level and no bound
structure.

### Direct-drop ground contact

`$7ACA` is live movement state. The [key drops note](damocles-limo-key-drops.md)
identifies it from static movement recovery — ground-clamped eye Y 63 and an accepted
support both set it to 63, a failed support clears it, and on-foot movement applies
falling — and names the three source ranges: `$0582AA`–`$05832B` vertical contact
update, `$0583EA`–`$05843B` support rectangle search, `$057DE6`–`$057DFD` on-foot
unsupported fall.

It reads **63 in all 23 tracked memstates**, so the refusal is unobserved, and the port
has no state that could produce any other value: its on-foot Mover has no vertical term,
no gravity and no collision (ADR 0016; `web/src/damocles/mover.ts`). Modelling contact
is movement work, not drop work.

The slot-0 bypass at `$054622` is separately unexplained — the
[object drops note](damocles-object-drops.md) records that slot 0 is not a takeable
resident and that the queue assembler writes `$FF` through pointers into the same array,
so its handling byte is plausibly scratch. Nothing here changes that.

**Disposition: blocked on vertical movement, and on an observation of contact clearing** —
tracked as [#357](https://github.com/odogono/mercenary/issues/357).

## Source ranges

Half-open ranges in the pinned first-world RAM.

| Range | SHA-256 |
| --- | --- |
| `$059076`–`$0590AE` zone computation | `cec4f823e9c717ee1cfed4542539556df798e7fff80d5258526486d9f8f36da7` |
| `$053A8C`–`$053B3C` extent transform and `$7910` publication | `a5a944016609f2cb6526d8482370cb3bca15da288632d1e8570732f340167d3a` |
| `$05A946`–`$05A98C` the second `[$7910]` consumer | `061f54e50a4c05575ca2925a6a0609d60b07721f2374bc54fe032efe665249a8` |
| `$053310`–`$053330` draw-priority bump and `$7A3A` index | `3e3fba65cf09a4de8edd155f8a6572ec42da7795af5516bd8a5bff33edaee100` |
| `$054D82`–`$054E10` cell bind: scale and Building detail byte into `$539CE`/`$539D2`/`$53A85` | `7d57175ecedb8dbfbb0b46d9cf5af0d887abd8927611a267ef155081a1fb8eeb` |
| `$0546A4`–`$0546CC` support placement, copying the support's class at `$0546C4` | `d5f3f52318eb4c87f213c8da26099da9b803cc56fbc5ad44a9c2f82e4b37b5d9` |

## Deterministic expectations for the port

1. A Residence's placement class is the recovered Association A byte 3, published as
   `placementClass`. Deriving it from the handling byte is wrong for 176 of the 241
   residents. A Save may carry a zone 0–8 or the authored class. Every authored class is
   also 0–8, so only a handling-nibble value of 9–15 can still be told apart and refused.
2. A slot with no resident state has no placement class, and none is invented for it.
3. A direct Drop and a leave write the zone of the Pose they place at against the bound
   structure's extent: the Building detail Model's `extent` at the structure selection's
   `scale`, about the placement's intra-cell origin. A cell with no bound structure gives 0.
4. A support placement copies the support's class (`$0546C4`), not the dropped object's own
   class, and it needs no rectangle.
5. `$7A3A`, the draw-order priority index, is nine times the class and is therefore
   derived. It is never stored.
