# Damocles placement class, and the zone a Drop writes

Working-Authority Evidence for
[#345](https://github.com/odogono/mercenary/issues/345), recovered 2026-09-19.

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
SHA-256 `c4bd4a7b49e4980ac886de8cdb5c4b33d793249f173ee8fc70998d0a5e4226c3`, over the
pinned RAM and all 23 tracked memstates in `research/damocles-st/snapshots/`. Nothing
is injected: each memstate is read as saved. The probe's checks are gates rather than
prints — a state whose recomputed zone disagrees with its live `$7A39`, or whose
`$7A3A` is not nine times it, raises.

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

### All 24 states reproduce

Recomputing the zone from each state's `[$7910]` rectangle and its `$7AB4`/`$7ABC`
reproduces the live `$7A39` and `$7A3A` in the pinned RAM and in every tracked
memstate — 24 of 24, with no exception and no fitted constant:

| State | Zone | `$7A39` | `$7A3A` | Structure-local rectangle | Bound structure |
| --- | ---: | ---: | ---: | --- | --- |
| `observed.ram` | 0 | 0 | 0 | `800, 1600, -800, 1200` | `eris-surface-87` |
| `boarded-car` | 2 | 2 | 18 | `800, 1600, -800, 1200` | `eris-surface-87` |
| `boarded-limo` | 1 | 1 | 9 | `800, 1600, -800, 1200` | `eris-surface-87` |
| `damocles.acheron` | 0 | 0 | 0 | `-500, 500, -500, 500` | — |
| `damocles.bacchus.transporter` | 3 | 3 | 27 | `3000, 3800, 800, 1600` | — |
| `damocles.clotho` | 7 | 7 | 63 | `-500, 900, -1400, -600` | — |
| `damocles.damocles` | 0 | 0 | 0 | `320, -400, 280, 0` | — |
| `damocles.dion.transporter` | 4 | 4 | 36 | `-700, 400, 600, 1400` | `dion-surface-e3` |
| `damocles.eris.transporter.11-8` | 6 | 6 | 54 | `-240, 240, -300, 210` | `eris-surface-8b` |
| `damocles.gaea.transporter` | 4 | 4 | 36 | `-700, 400, 600, 1400` | — |
| `damocles.logos.transporter` | 4 | 4 | 36 | `-200, 600, -1200, 1200` | — |
| `damocles.lucan` | 0 | 0 | 0 | `320, -400, 280, 0` | — |
| `damocles.mentor.transporter` | 8 | 8 | 72 | `-1600, -800, -600, 400` | — |
| `damocles.metis.transporter` | 4 | 4 | 36 | `-700, 400, 600, 1400` | — |
| `damocles.midas` | 7 | 7 | 63 | `-500, 500, -500, 500` | — |
| `damocles.pan` | 4 | 4 | 36 | `-700, 400, 600, 1400` | — |
| `damocles.theon` | 7 | 7 | 63 | `-400, 400, -200, 200` | — |
| `damocles.vesta.transporter` | 4 | 4 | 36 | `-2100, 2100, -600, 1650` | `vesta-surface-64` |
| `dion-2-3` | 1 | 1 | 9 | `-1840, 0, 0, 1120` | `dion-surface-32` |
| `eris-spaceport-onfoot` | 0 | 0 | 0 | `800, 1600, -800, 1200` | `eris-surface-87` |
| `gaea-ur-city-4-2` | 1 | 1 | 9 | `-1500, 1500, -1500, 1500` | `gaea-ur-city-surface-24` |
| `interior-window` | 4 | 4 | 36 | `800, 1600, -800, 1200` | `eris-surface-87` |
| `left-limo` | 2 | 2 | 18 | `800, 1600, -800, 1200` | `eris-surface-87` |
| `vesta-parliament-4-6` | 1 | 1 | 9 | `-2100, 2100, -600, 1650` | `vesta-surface-64` |

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
the structure-local rectangle in the table, and for the eight states whose body has a
recovered surface map it equals the tracked catalogue instance's own position, to the
unit. The probe gates that match on the body selector at `$7AC9` and on the instance's
model being a structure, so a coincidence of grid phase on another body cannot claim a
binding.

## Where the rectangle comes from, and what is still missing

`[$7910]` does not point at authored data. It points into the scratch buffer at `$CB88`
that `$053A8C`–`$053B38` fills:

- `$053AA6` resolves a structure record through the table at `[$4BD22]` (`$26000` in
  the pinned capture), indexed by the slot word that `$053A98` reads from the
  self-modified `$53A84`.
- `$053ACA` points the destination at `$CB88`; `$053AD0`/`$053AD4` load the
  translation from `$7AF2`/`$7AF4`; `$539CE`/`$539D0`/`$539D2` supply the X, Y and Z
  scales, which for Capital Spaceport read `2, 1, 2` and match the tracked model's
  recovered scale.
- `$053AD8` then walks the record **backwards**, seven words at a time, transforming
  six and copying the seventh, until a negative word. `$053AE4` copies that word and
  `$053B2C` publishes the address just past it as `$7910`. `$053B30` transforms the
  five words that follow into the header and the two axis pairs the zone reads.

For Capital Spaceport the source record sits at `$0303A0`–`$0303AA` in the pinned RAM:
the words `600, 400, 800, 400, 850` below the `$8000` at `$0303AA`, which the scale
`2, 1, 2` and the origin `31958, 34328` carry to the observed
`32758, 33558, 33528, 35528`.

**What is not recovered** is the mapping from a catalogue structure instance to the
slot `$53A84` holds. Capital Spaceport's record is reached through slot 88 while the
catalogue records the model at object-table slot 74, and the two numbering spaces are
not yet related. Until that is decoded the extent rectangle cannot be published as
static model data, and a port cannot compute the zone for itself. The rectangles above
are live readings from captures, not an extraction.

This is the single blocker on a port writing the placement class on a Drop, tracked as
[#356](https://github.com/odogono/mercenary/issues/356). It does not affect the authored class,
which is published.

## The other two #345 gaps: neither is recoverable here

### Floor-aware binding

[Workspace selection](damocles-workspace-selection.md) states the position directly:
*"What is not recovered is the static rule mapping a level to its structure … Today the
interior structure is read from the live `$7B0E` and reported; predicting it statically
is open work."* The Vesta cell `$64` pair is the controlled case — same body, same
group, same cell, level 0 binds slot 70 and level 10 binds slot 91.

`$7AC5` and `$7AA5` hold the player's level and a drop copies it, so the value a port
would need to write is well defined. What a port cannot do is *bind* a non-zero level:
without the level-to-structure rule there is no geometry to draw a resident against or
to select it from, and deriving a floor number from pose height needs a storey pitch
that belongs to the structure the rule would have chosen. Every arrival pose in
`payload/damocles/arrival-poses.json` records position, cell and workspace origin, and
none records a level or a bound structure, so the payload cannot stand in for the rule
either.

**Disposition: a boundary, not a defect** — tracked as
[#355](https://github.com/odogono/mercenary/issues/355). A Drop may only write the level the
port can bind, and the port binds level 0.

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

## Deterministic expectations for the port

1. A Residence's placement class is the recovered Association A byte 3, published as
   `placementClass`. Deriving it from the handling byte is wrong for 176 of the 241
   residents, and a save that carries a derived value must be refused.
2. A slot with no resident state has no placement class, and none is invented for it.
3. Until the extent rectangle is statically decoded, a Drop keeps the class the object
   already carries rather than writing a zone. That is a recorded departure from
   `$0546FC`, not a claim about what the original writes.
4. A support placement inherits the support's class. The port already does this, and it
   needs no rectangle.
5. `$7A3A`, the draw-order priority index, is nine times the class and is therefore
   derived. It is never stored.
