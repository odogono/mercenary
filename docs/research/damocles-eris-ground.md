# Eris ground, landing-pad and road geometry

Working-Authority Evidence for where Damocles stores the grey pad, roads and
ground colouring around Capital Spaceport, and what the catalogue's unread
surface-attachment records are. Research note for
[#206](https://github.com/odogono/mercenary/issues/206), extended by
[#173](https://github.com/odogono/mercenary/issues/173) and
[#281](https://github.com/odogono/mercenary/issues/281).

Authoritative Evidence remains bound to the C64 Reference Build. Observations
here are Working-Authority Evidence only. This note does not mint Damocles world
terms in `CONTEXT.md`.

**Road-line correction (#724):** the [cross-title road-line research](damocles-miii-road-lines.md)
establishes that `$054AFA` skips the own-cell pair while camera Y's high word
is zero, even at radius zero. The first-world list below contains six words
but the road pass draws only its five neighbouring runs at Y = 63. `$79BA`
is minus camera Y in log-float form; the endpoints lie at world Y = 0. The
new note also recovers index-14 Settlement ink and the outdoor draw order.

## Land and sea are elsewhere

[#391](https://github.com/odogono/mercenary/issues/391) recovered what paints
the surface outside the occupied cell: a per-body base colour and, over it, a
coastline polygon and land colour for each island on the body. The extent runs
this note decodes are the **road** network, not a landmass. See
[the island note](damocles-eris-islands.md); nothing here changes.

## Research update — #370

[#370](https://github.com/odogono/mercenary/issues/370) asked what bounds the
Damocles draw. For the ground family the answer was already most of the way
into this note, but its reading of the latch was wrong in a way that inverts the
conclusion.

**On foot the ground window is the occupied cell alone.** The table at `$00915A`
is now read rather than inferred, and the routine that consumes it disassembled
in full:

```
054B6A  cmp.w   $79c6.w, d0     ; camera cell x against the last cell drawn
054B70  cmp.w   $79ca.w, d1     ; and cell z
054B74  beq.b   $54bb6          ; unchanged: skip the rebind
054B84  move.b  #$ff, $7b62.w   ; changed: invalidate the cached radius
054BA2  move.w  d3, $7b5c.w     ; publish the new current cell
054BB6  move.l  $7a30.w, d4     ; camera Y, longword
054BBA  lsr.l   #$8, d4
054BBC  lsr.l   #$3, d4         ; index = Y >> 11
054BBE  cmpi.l  #$ff, d4
054BC6  move.w  #$ff, d4        ; clamped to the table's last entry
054BCA  movea.l #$915a, a0
054BD0  adda.w  d4, a0
054BD4  move.b  (a0), d7        ; r = table[index]
054BD6  cmp.b   $7b62.w, d7
054BDA  beq.b   $54be4
054BDC  move.b  d7, $7b62.w
054BE0  bsr.w   $54888          ; rebuild the window
```

The correction is at `$054B84`. **A cell change stores `$FF` into `$7B62`**,
and `$FF` appears nowhere in the table, so the compare at `$054BD6` can never
match and `$054888` always rebuilds. This note previously reasoned that because
the altitude byte does not change on foot, `$054BD6` never calls `$054888` and
the arrival window simply stands. That holds only while the player stays inside
one cell. Crossing a cell boundary forces the rebuild, and on foot the fresh
byte is `table[0]`, which is `0`.

The `$5F28` watch did not fail to fire because nothing was rebuilt. It did not
fire because at radius zero `$05497E` skips the route list entirely, so slot
`$E8` is never allocated and nothing writes that byte.

### The recovered curve

`$00915A` holds, read identically from 621 of 622 game-loaded captures in the
work tree (sha256 `2920b857a78057ea34075578ab19acf78a8691ca8865dd4aff1cdabf0cf6ec43`):

| altitude index | radius | window |
| --- | --- | --- |
| 0 | 0 | the occupied cell |
| 1 | 1 | 3 × 3 |
| 2 | 2 | 5 × 5 |
| 3–4 | 3 | 7 × 7 |
| 5–9 | 4 | 9 × 9 |
| 10–15 | 5 | 11 × 11 |
| 16–23 | 6 | 13 × 13 |
| 24–31 | 7 | 15 × 15 |
| 32–255 | 8 … 63 | one step every four indices |

The index is the camera Y longword at `$7A30` shifted right 11 and clamped to
255. On foot `$7A30` is 63, so the index is 0 and the radius is 0.

### Which Y the index reads

The lab tree used two different addresses for "camera Y": `location-ledger.py`
reads `$7A96`, while `arrival-route-probe.py` and `object-selection-probe.py`
read `$7A30`. Both are right, because they are **two different triples**, not
two readings of one.

- `$7A2C` / `$7A30` / `$7A34` is the scene camera. `$054BE4`–`$054BF0` copy each
  one's high word to `$79C6` / `$79C8` / `$79CA`, which at 65,536 units per cell
  is the cell index — the value `$054B6A` compares to detect a cell change.
- `$7A92` / `$7A96` / `$7A9A` is the player's body position, the triple the Body
  Coordinate Readout is decoded from
  ([#371](https://github.com/odogono/mercenary/issues/371)).

The radius index is `$7A30`, read as a longword at `$054BB6` and shifted right
11. Nothing here depends on `$7A96`.

### The evidence that the rebuild happens in ordinary play

Three capture pairs taken within a single run, with nothing written into the
guest:

| run | before | after |
| --- | --- | --- |
| `observe-walk-toward-building-20260818T143508Z-c60e2391` | cell `$87` (7,8), `$7B62` = 3 | cell `$B7` (7,11), `$7B62` = **0** |
| `enter-building-probe-20260818T145843Z-47bd7745` | cell `$87`, `$7B62` = 3 | cell `$77` (7,7), `$7B62` = **0** |
| `observe-walk-toward-building-20260818T113001Z`, `…T141006Z` | cell `$87`, `$7B62` = 3 | cell `$87` unchanged, `$7B62` = 3 |

The two runs whose walk never left cell (7,8) keep the latched radius; the two
that crossed a boundary drop to zero. That is the `$054B84` path, observed.

### The pinned arrival capture is the outlier

Across all 23 memstates, `$7B62` equals `table[$7A30 >> 11]` in 21:

| route | memstates | `$7B62` |
| --- | ---: | --- |
| flight landing | 7 | 0 |
| transporter hop | 8 | 0, except `damocles.vesta.transporter` at camera Y 3233 → index 1 → 1 |
| GUI walk capture | 3 | 0 |
| vehicle / interior derived | 3 of 5 | 0 |

The two that disagree are `eris-spaceport-onfoot` (`$7B62` = 3 at index 0) and
`interior-window`, which was walked indoors from it without an intervening cell
change. The pinned capture this note's original reading rested on is the one
anomalous pose in the tree.

`scripts/draw-reach-check.py` reports this per capture and gates it. Its
`radius-table` check refuses a capture whose `$00915A` is not the canonical
curve; `radius-reachable` refuses a `$7B62` the table cannot produce; and where
a route list is built it delegates the window to `ground-extent-check.py`. It
passes on all 23 memstates and on 621 of 706 work-tree RAM images, the 85
refusals all being title-screen or TOS-only captures taken before the game
loaded.

### Evidence identities

| Input | Hash |
| --- | --- |
| Working Authority STX | `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef` |
| Pinned TOS (EmuTOS 2.06) | `154803e3ff4851f3dc358b91b16d6b6110d187a81d8132ecb665af49878939d5` |
| `scripts/draw-reach-check.py` | tracked in this repository |
| `tests/test_draw_reach.py` | tracked in this repository |

| Range | Hash |
| --- | --- |
| Altitude radius table `$00915A`–`$009259` | `2920b857a78057ea34075578ab19acf78a8691ca8865dd4aff1cdabf0cf6ec43` |
| Cell change and radius recompute `$054B60`–`$054BF7` | `c9872b183b45fc8ed1e1cf482ce2c5e58df3333f6e47fbad82e862575067abd4` |
| Object stream walk and structure dispatch `$0533B8`–`$05341B` | `fb0aa3546084474a4326dffd0f8b1334795d08110692b48c898aed3322482ea5` |
| Place-name binder `$054BF8`–`$054C8F` — read and excluded | `73476b17e5c4a74854f59e20e0a5ecc22b9037550995e20943cb5bf9dcdadce5` |

| Capture | RAM sha256 |
| --- | --- |
| `adhoc-enter-20260818T100805Z-797d27bb/observed.ram` | `7dc5fe25d5c66a9a23a8d0ec50a8a9c71e87c8889be30f65282469eb51150d1c` |
| `observe-walk-toward-building-20260818T143508Z-c60e2391/observed-t0.ram` | `91272db70dea8abfeeffc46039767574ae97eede05792b213c62fb9f9b4ef4e9` |
| `observe-walk-toward-building-20260818T143508Z-c60e2391/observed-t1.ram` | `2c1c7baee04eed60c1ebec8daeed6700bf6ea678a0cbe443d88d3be6cc223cd8` |
| `enter-building-probe-20260818T145843Z-47bd7745/frame-00-spawn.ram` | `6bc0040c013d634b2d0f10d56374b2bbfe26d10e88a46274577052ea39c4ed73` |
| `enter-building-probe-20260818T145843Z-47bd7745/frame-02-up-12000.ram` | `260a6b8d347e7169c70256716a9430592bd8c8ebc5b5bf3624e6c2a7b1ff8a36` |
| `eris-spaceport-onfoot.sav`, carved | `1366881c62ab9e80a5fe8b1dcbb5dfa2ccc0142e4a921cd029f9dfc8f6b16465` |
| `left-limo.sav`, carved | `029129ef1efc183d49c15ad160d063b4efcf86f5d00cd7358c4b9d1f722d2d4c` |
| `damocles.vesta.transporter.sav`, carved | `fe94a6f027dc210e301f16fbe699801043c5d1216f4e81c4ea3e3c5917bfd7e0` |

**Kept and not used.** `stick-replay-20260818T164031Z-3b262579/observed.ram`
(sha256 `762a855b176e15f4b35a27ea2c274e28b9f24ae6727771ce2cdd5e71399af127`) is the
one game-loaded capture in the work tree whose `$00915A` is not the canonical
curve: its first three entries read `03 03 03` where every other capture reads
`00 01 02`. Nothing here rests on it, and `draw-reach-check.py`'s `radius-table`
gate refuses it. Whether a run can genuinely write those bytes is not resolved,
and is not needed for this finding; a single unreproduced capture is not
evidence either way.

The 85 further RAM images the gate refuses are title-screen or TOS-only captures
taken before the game loaded. They are not failures of the reading.

### Claim boundary

Every reading above is taken from pinned RAM with the emulator stopped, or from
a memstate carved off disk. **Nothing was written into the guest**, so no result
here is an instruction checkpoint and none needed to be labelled as one.

What is established: the contents of `$00915A`, the arithmetic at
`$054BB6`–`$054BE0` that consumes it, the `$FF` invalidation at `$054B84`, and
that in captures taken after a cell change on foot the cached radius is zero.

What is not established: that no other code path writes `$7B62`. The gate checks
that the cached value is one the table can produce, which a second writer could
satisfy. The rebuild was observed across cell boundaries in four runs, not
proved exhaustive. This is a reading of the Damocles Working Authority and is
**Working-Authority Evidence, never Authoritative Evidence** — it says nothing
about the C64 Reference Build.

### Consequence for /damocles

`planErisFrame` draws all 123 Eris ground-record placements from every cell. The
recovered bound for ordinary on-foot play is the occupied cell alone, so the
ground family is over-drawn by 122 placements. Adopting it is
[#373](https://github.com/odogono/mercenary/issues/373); this note establishes
only what the bound is.

`camera.farPlane` in `web/damocles/eris.json` is unchanged and stays `authored`.
The Working Authority has no far plane in the projection sense — it has this
cell window and the separate horizon slots — so there is no recovered value to
replace it with. It remains a parameter of the browser's own log-depth buffer.

## Scope and non-goals

**In scope:** locating the RAM records that produce the outdoor pad, road and
ground fill seen from the spaceport; saying what follows a structure wall-list
terminator; extending the catalogue decoder when a record family is proven.

**Out of scope:** withdrawing the authored `/damocles` ground plane
([#195](https://github.com/odogono/mercenary/issues/195) follow-on);
other-body workspaces;
[#207](https://github.com/odogono/mercenary/issues/207) (`structure-01a618`).

Under #281 the native sky/ground fill moved *into* scope, and is answered below
as rendering-only state rather than geometry.

## Working Authority and reproduce path

| Item                   | Value                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Program                | `roms/atarist/damocles_-_mercenary_ii_novagen_software_(uk).stx`                                                    |
| SHA-256                | `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef`                                                  |
| TOS pin                | EmuTOS 2.06 (`154803e3…8939d5`)                                                                                     |
| Lab                    | `research/damocles-st/` (`damocleslab`)                                                                             |
| Scenario               | `research/damocles-st/scenarios/first-world.json` (SHA-256 `e5383458…8582f96e`)                                     |
| Placement disassembly  | `scenarios/ground-road-template.json`; run `observe-ground-road-template-20260915T112757Z-af886487`                 |
| Empty-record renderer  | `scenarios/default-ground-fill.json`; run `observe-default-ground-fill-20260915T125812Z-6b1062b5`                   |
| Polygon consumer       | `scenarios/ground-neighbor-joins.json`; run `observe-ground-neighbor-joins-20260915T132137Z-e51c9ceb`               |
| Projection workspace   | `scenarios/ground-neighbor-workspace.json`; run `observe-ground-neighbor-workspace-20260915T132312Z-b5965f5b`       |
| Object colour consumer | `scenarios/ground-object-palette.json`; run `observe-ground-object-palette-20260915T135717Z-0f83cadd`               |
| Zero-slot palette      | `scenarios/ground-structureless-palette.json`; run `observe-ground-structureless-palette-20260915T140156Z-c3c1db95` |
| Ground-band fill       | `scenarios/ground-band-fill.json`; run `observe-ground-band-fill-20260916T121334Z-97e979b5`                          |
| Split-colour latch     | `scenarios/ground-band-split-colour.json`; run `observe-ground-band-split-colour-20260916T121718Z-ea775864`          |
| Split-colour install   | `scenarios/ground-band-split-install.json`; run `observe-ground-band-split-install-20260916T121824Z-77e0f448`        |
| Split scanline         | `scenarios/ground-band-split-line.json`; run `observe-ground-band-split-line-20260916T122557Z-10da2173` (no write)   |
| Route-list slots       | `scenarios/ground-route-slots.json`; run `observe-ground-route-slots-20260916T121931Z-d4780775`                      |
| Route-list allocator   | `scenarios/ground-route-allocator.json`; run `observe-ground-route-allocator-20260916T122219Z-faeaf379` (no write)   |
| Reconstruction check   | `scripts/ground-extent-check.py`                                                                                    |
| Pad view               | `scenarios/approach-spaceport-pad.json`                                                                             |
| Open ground            | `scenarios/walk-toward-building.json` (NAV `07-08` → `07-11`)                                                       |

Cited RAM:

- `observe-first-world-20260818T101013Z-c5a32b7d/observed.ram` SHA-256
  `b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967`
- `observe-approach-spaceport-pad-20260818T152751Z-9ebdb1a1` t0/t1
- `observe-walk-toward-building-20260818T143508Z-c60e2391` t1 (cell `$B7`)

Reproduce:

```sh
research/damocles-st/lab doctor
# Eris ground records alone. The committed payload also needs the three
# --workspace snapshots; see docs/research/damocles-catalogue.md.
PYTHONPATH=research/damocles-st python3 -m damocleslab.catalogue \
  --run research/damocles-st/work/observe-first-world-20260818T101013Z-c5a32b7d \
  --output /tmp/eris-ground-catalogue.json
python3 research/damocles-st/scripts/ground-extent-check.py \
  --run research/damocles-st/work/observe-first-world-20260818T101013Z-c5a32b7d
```

Working Disassembly listings stay ignored under `research/damocles-st/work/`.
Facts below are from `lab xref` plus the existing geometry listing window that
already covers `$054B98`–`$054F7C`.

## Answer

The grey apron, white landing strip and most authored ground polygons around
Capital Spaceport are **not** Targ-style road-grid cells and **not** the
structure wall list. They are a **per-cell ground record family** at `$01E000`,
indexed by a 256-word table at `$01E400` and oriented by a 256-byte table at
`$0083DC`. `$054E40` consumes those tables after `$054CBC` has selected the
structure from `$00ABDC`.

Empty cells (133 of 256 in this workspace, including the walk's open ground at
`$B7`) share one intentional empty record with **no vertices or commands**.
There is no default cell rectangle in this record path: `$056634` reads the
reconstructed `$8C32` command stream and returns immediately on its initial
zero word. The visible green is not a record at all: it is the viewport block
fill recoloured below the horizon by a raster split
([below](#sky-and-ground-band-are-one-fill-and-one-raster-split)), and
`/damocles` still authors a presentation fill to stand in for it. Direct `$777`
faces in the cell-`$88` record are the white pad; `$800e` faces are the grey
apron.

Surface attachments after a structure wall terminator share the ground stream's
bit-classed command envelope (`$C00E` edges, `$7000` object placements,
Structure 74's `$4200` door). They are not where the pad lives.

The old “`$7000` road template / `$53F76`” label conflated two paths. In the
source loader, `$7000` is a compact placement command consumed at `$054FCE`:
cell-local X and Z followed by a byte offset into the address-based object
pointer table at `$04BD10`. `$053F76` belongs to the separate runtime
vector-text renderer and is not this source command's consumer.

Structure slot zero is a valid palette source, not an absent structure.
`$054D42` masks the low nine bits of the `$ABDC` record and indexes the surface
table without rejecting zero. Entry zero's preceding metadata binds palette
zero through `$054E10`–`$054E1C`. The object colour consumer at
`$04F992`–`$04F9AA` dereferences `$808x` words through that live `$7A0E`
binding. This supplies the scene colour for all five `object-041b1e`
placements in each of transforms `$04` and `$07`.

`$F0` and `$F4` are not neighboring-cell model vertices. `$04F8F2` passes
every polygon reference to `$04EDD4`; that consumer reads each reference's
already projected coordinates and visibility class from runtime workspaces at
offsets `$0840`, `$0FC0`, and `$1240`. In the pinned frame, `$F0` and `$F4`
have valid visibility class `$08` and resolve to opposite projected points on
the same row (`$2DC4,$0047` and `$0165,$0047`).

### The producer, and the world coordinates behind it

A `watch` run breaks on the next write to the projected X word of slot `$F0`
(`$10B0`) after a sentinel poke, and walks the player forward so the view is
rebuilt. It stops at `$056E40` with `A0 = $F0`, and the supervisor stack names
its caller: `$054AC6`, inside the loop at `$054A64`.

That loop is the answer. It walks slots from `$7B54` up to `$100`, so it fills
the top of the object/ground slot region where `$F0`–`$FC` live, and for each
slot it reads a **packed byte at `$5E40 + slot`**. The low nybble is a world X
and the high nybble a world Z, each swapped into the high word of a longword,
so the nybbles are **cell indices on the same 65,536-units-per-cell world grid
the catalogue already reports**. The camera position at `$7A2C`/`$7A34` is
subtracted, the fixed height at `$79BA` (385,152 in every capture) supplies Y,
and `$056672` projects the result into the slot.

The table is per-scene. In each capture the pair brackets the player's own cell
on one axis:

| Capture | Player cell | `$F0` | `$F4` | `$F8` | `$FC` |
| --- | --- | --- | --- | --- | --- |
| Eris first-world | `$87` = (7,8) | (11,8) | (7,8) | unused | unused |
| Vesta Parliament | `$64` = (4,6) | (4,0) | (4,6) | unused | unused |
| Gaea UR City | `$24` = (4,2) | (8,2) | (3,2) | (4,2) | (4,0) |
| Dion | `$32` = (2,3) | (3,3) | (1,3) | (2,12) | (2,2) |

So a horizon reference is **not** a screen-space invention and it is not
unrepresentable. It is the current scene's ground extent, expressed as a world
grid corner at a fixed height. The extractor resolves one to
`(nybble − cell) × 65,536` in the record's own local frame.

### The seeds are authored per cell

`$05493E` reads a **longword of four packed bytes at `$1E000 + cell × 4`**,
rotates it by the cell's transform at `$054950`, and stores the four bytes into
slots `$FC`, `$F8`, `$F4` and `$F0`. Those four are the only slots any ground
record references: across all four pinned workspaces the out-of-plan references
are `$F0` (241), `$F4` (148), `$FC` (118) and `$F8` (28), and nothing below.
The computed seeds match the live `$5E40` bytes exactly in every capture.

So `$1E000` holds a 1 KiB seed table, then the `$1E400` word index, then the
records. Every scene reference in the bank resolves from authored data, with no
capture of the player standing in that cell. The slots below `$F0` are
allocated at `$05499E`; no record names them, and the next section says what
they are.

Capital Spaceport cell `$87` is the worked example: `$F0` is the centre of the
cell four grid steps ahead, so the grey apron and the white centre line close
into a runway and the centre-line edge from `x = 1200` to four cells out comes
back.

Because the offsets are cell-relative, two cells sharing one source record draw
different geometry. A scene-joined ground model therefore carries its cell in
its identity and names the shared record and its seed address in its evidence,
rather than one cell's geometry standing in for all of them. A ground record that names `$F0` means "join to
this scene's +X ground extent", which a capture resolves the same way a live
`$ABDC` workspace resolves a cell's structures. `$054B02` then pairs `$F0` with
`$F4`, and `$F8` with `$FC`, into edges drawn only when the packed byte is
nonzero, which is why an unused pair reads zero.

### The slots below `$F0` are the visible cells' ground extents

The list at `$05499E` allocates the scene slots below `$F0`. It is not a route
in the road sense: it is the **deduplicated set of ground-extent corners for
every cell in view**, and the slots below `$F0` are those corners' projections.

`$054888` chooses the window. It takes a radius `r`, forms the side `2r + 1`,
and clamps a square of cells centred on the camera cell (`$7A2C`, `$7A34`)
against the grid dimensions at `$7BB2`/`$7BB4`, aborting to an unbuilt list when
the square misses the grid entirely. `r` is read at `$054BD4` from a 256-byte
table at `$00915A` indexed by the camera altitude `$7A30 >> 11`, so **the ground
extent reaches further the higher you are**; `$054BD6` calls the rebuild only
when that byte differs from the cached `$7B62`. In the pinned on-foot capture
`$7B62` is `3`, giving a 7 × 7 window over cells x 4–10, z 5–11 around cell
`$87` at (7, 8). It was latched from a higher altitude: the table's entry for
the on-foot altitude index 0 is `0`, and the cache is what keeps the wider
window standing.

> Corrected by the #370 update above: the latch survives only until the player
> crosses a cell boundary, because `$054B84` stores `$FF` into `$7B62` on a cell
> change and forces the rebuild. The on-foot window in ordinary play is the
> occupied cell alone.

`$05499E` then walks that window row by row, reading each cell's authored
longword from `$1E000` and passing both of its words to `$054A52`, which appends
a word to a list based at `$84DC` only if it is nonzero and not already there.
The own cell's unrotated longword is written to `$84DC` first, so its two words
are already in the dedup search and are never re-appended.

`$0549D2` turns that list of corner words into slots. It clears a 256-byte map
at `$8B32`, pre-binds the own cell's four rotated corner bytes to `$F0`–`$FC`,
then walks the list: each byte that has no slot yet takes the next slot counting
down in fours from `$F0`, is written to `$5E40 + slot` — the same table the
`$054A64` projector reads — and the list word is rewritten in place as a **pair
of slot numbers**. `$7B56` keeps the lowest slot issued and `$7B58` the end of
the list.

`$054AD2` consumes it. It walks the rewritten list backwards from `$7B58` down
to `$84E0`, unpacks each word into two slot numbers and calls the two-point edge
routine `$576C4` on them. The first longword, the own cell's, is skipped there
and drawn separately by `$054B02`/`$054B18` with the nonzero guards already
documented. So **every word in the list is one ground-extent edge**, and the
slots below `$F0` exist only as those edges' endpoints.

A `watch` run confirms the slots are produced by the already-recovered
projector, not by a second path. Poking a sentinel into the projected X word of
slot `$E8` (`$10A8`) and walking forward breaks at `$056E40` with **`A0 = $E8`**
and `A2 = $5E080`, the fixed height from `$79BA`; the supervisor stack names the
caller `$054AC6`, inside the `$054A64` loop. That is the same instruction, the
same caller and the same height the `$F0` probe reported — one loop fills the
whole slot range from `$7B54` up to `$100`.

The pinned capture reads out cleanly. Thirteen slot entries are bound —
`$F0`–`$FC` plus nine below — `$7B56` is `$CC`, and the seven list words are:

| Word address | Slots | Corner bytes | Grid corners |
| --- | --- | --- | --- |
| `$84DC` | `$F0`, `$F4` | `8B`, `87` | (11,8) – (7,8) — own cell, drawn at `$054B02` |
| `$84DE` | – | `00` | unused own-cell pair |
| `$84E0` | `$EC`, `$E8` | `14`, `B4` | (4,1) – (4,11) |
| `$84E2` | `$E4`, `$E0` | `89`, `D9` | (9,8) – (9,13) |
| `$84E4` | `$DC`, `$D8` | `8A`, `9A` | (10,8) – (10,9) |
| `$84E6` | `$D4`, `$D8` | `94`, `9A` | (4,9) – (10,9) |
| `$84E8` | `$D0`, `$CC` | `B3`, `B5` | (3,11) – (5,11) |

Every corner is a cell index pair on the same 65,536-units-per-cell grid the
catalogue already reports, at the fixed height `$79BA`, so these are
axis-aligned world-space segments lying in the ground plane.

`$7B62` also explains a pair of negative probes. Watching the allocator's own
output byte (`$5F28`, slot `$E8`) across 40,000 VBLs of walking never breaks.
The reading here was that on foot the altitude byte never changes, `$054BD6`
never calls `$054888`, and the list built on arrival simply stands while
`$054A64` re-projects it every frame. The #370 update above corrects it: the
walk does rebuild, at every cell boundary, and the watch is silent because a
radius-zero rebuild allocates no slot `$E8` to write. Captures taken at radius zero show the other end of the same rule —
`$7B56` is `$F0`, `$7B58` is `$84E0`, and `$84DC` still holds raw corner bytes
because `$05497E` skipped the list entirely.

### Disposition: already-extracted data, no new geometry

The route list creates **no authored data the catalogue does not already hold**.
Its whole input is the per-cell `$1E000` corner longwords the extractor already
decodes, and its whole output is a per-frame, camera-dependent slot numbering
over them. Which corners get slots, and which numbers, changes with the camera
cell and the altitude radius; the corners themselves do not. It is therefore
**rendering-only state**, and the catalogue records it as an exclusion rather
than a new record family, on the same footing as the `$F0`/`$F4` joins it
extends.

`scripts/ground-extent-check.py` makes that claim checkable. From a capture's
RAM alone it re-derives the window from `$7A2C`/`$7A34`/`$7BB2`/`$7BB4`/`$7B62`,
replays `$05493E`'s rotation, `$05499E`'s dedup walk and `$0549D2`'s slot
assignment, and compares the result against the live `$84DC` list, `$7B56` and
the `$5E40` bytes, with invalid-reference checks that every slot named is
four-byte aligned, within `[$7B56, $FC]`, and carries an on-grid corner. All
five checks pass on **82 of 82** captured RAM images in the work tree, covering
first-world, pad, walk, boarded, replay and the new probe runs, and covering the
built, radius-zero and off-grid states.

## Hypothesis ledger

| Hypothesis                                                                                | Status                                    | Evidence                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The 7 × 7 window seen on foot is the rule (#370)                                          | **Refuted**                               | `$00915A` entry 0 is `0`. `$054B84` stores `$FF` into `$7B62` on every cell change, forcing the rebuild at `$054BE0`; four capture pairs show `$7B62` drop from 3 to 0 on the first boundary crossed.        |
| On foot the ground window is the occupied cell alone (#370)                              | **Confirmed**                             | `$054BB6`–`$054BE0` with the recovered table; 21 of 23 memstates hold `$7B62` = `table[$7A30 >> 11]`, the two exceptions both descending from one un-crossed arrival capture.                              |
| Structure geometry obeys the same window as the ground records (#370)                    | **Refuted — it is narrower and unrelated** | `$05A744` and `$053CC2` have five call sites, all inside `$0533D4..$053418`, reached by a zero-word sentinel in the object stream. One bound workspace, no window arithmetic at all.                        |
| Pad/road are already structure form-4/6 polygons at `y = 0`, hidden by the authored plane | **Refuted as the store**                  | Structure 74's recovered faces are walls and building planes. The white/grey strips decode from `$020F8E` / `$021AFE`, not from `$01484E`.                                                                |
| The two skipped structure-header colour words are the cell fill                           | **Refuted for the pad**                   | Structure 74's words are `$809A` / `$808E` (scene-palette greys/blues), not `$777` / `$444`. The pad colours are in the ground stream.                                                                    |
| Unused bits of `$00ABDC` select pad vs grass vs road                                      | **Refuted for ground**                    | `$054CBE` masks the first byte with `$FE` into `$7AF8` for a different selector (objects / `$1E000` side table when `$20..$9F`). Ground uses `$1E400` + `$83DC`. Low nine bits remain the structure slot. |
| A separate fill path draws cell rectangles / road strips                                  | **Refuted for empty cells**               | `$054E50` / `$054E40` reconstruct the selected record into `$8C32`; `$056634` returns immediately when that stream starts with zero.                                                                      |
| The visible green comes from a surface/background path outside the cell record            | **Confirmed as a separate path**          | Open cell `$B7` is visibly green while its `$01E790` source and reconstructed `$8C32` streams are empty; the exact producer remains unresolved.                                                           |
| Structure slot zero means no scene palette is available                                   | **Refuted**                               | `$054D42` indexes surface entry zero and `$054E10` binds its metadata's palette zero to `$7A0E`; `$04F99E` uses that binding for `$808x` object faces.                                                    |
| `$F0`/`$F4` name neighboring-cell model vertices                                          | **Refuted**                               | `$04F8F2`/`$04EDD4` consume their valid preprojected coordinates and visibility state; source model-space slots are zero and outside the local projection range.                                          |
| `$F0`/`$F4` have no representable model-space coordinate                                  | **Refuted**                               | The `$054A64` loop projects them from packed cell indices at `$5E40 + slot`, camera-relative, with Y from `$79BA`. A watch breakpoint at `$056E40` with `A0 = $F0` named the writer and the stack named the caller. |
| The band below the horizon is drawn by a producer the sky fill does not reach              | **Refuted**                               | A sentinel in the band (`$06A140`) breaks at `$059D34`, inside the same `$059CE2` block fill, returning to `$0595F0`. Sky and band are one colour index; the Timer B handler at `$052280` recolours `$FF8250` at scanline `$7BFC`.                       |
| The surface record's `sceneColours` are the sky and ground of the outdoor view             | **Refuted for this view**                 | `$7C82`/`$7C84` are installed only at `$059600`, on the `$7B34`-clear branch. The pinned frame has `$7B34 = $C000` and uses `$7C86` (`$001`) and `$7A1A` (`$030`) instead.                                                                              |
| The `$05499E` route list allocates slots for a road or path network                        | **Amended by #441 — it is a road network**  | `$054888` clamps a `2r+1` cell square around the camera; `$05499E` dedups those cells' `$1E000` corner words; `$0549D2` assigns slots down from `$F0`; `$054AD2` draws each word as one two-point edge through `$576C4`. The slot numbering is per-frame, but those corners are the endpoints of the `$04EC30` road runs, so each edge drawn is one road line. |
| The slots below `$F0` need a projector the `$F0`/`$F4` joins do not use                    | **Refuted**                               | A sentinel in slot `$E8`'s projected X (`$10A8`) breaks at `$056E40` with `A0 = $E8`, `A2 = $5E080`, caller `$054AC6` — the same instruction, loop and height the `$F0` probe named.                                                                    |
| The route list introduces authored data the catalogue has not read                         | **Refuted**                               | Its only input is the per-cell `$1E000` corner longwords the extractor already decodes. `scripts/ground-extent-check.py` reconstructs the live list, lowest slot and `$5E40` bytes from RAM alone on 82 of 82 captures.                                 |
| Post-terminator attachments also carry pad polygons                                       | **Partially confirmed (family, not pad)** | Ground records continue with `$C00E` / `$7000` after faces. Structure 74's `$4200` door is the documented wall-list attachment. The pad polygons themselves are ordinary colour+ref faces.                |

## Sky and ground band are one fill and one raster split

A `watch` run breaks on the next write to a screen word inside the uniform sky
band (`$078BA0`, line 10 of the framebuffer at `$42C00`) while the player walks.
It stops inside `$059CE2`, reached from the frame loop at `$0595EC`.

That routine is a block fill, not a draw: it loads a constant four-plane pattern
into thirteen registers and unrolls `movem.l d0-d7/a0-a5, -(a6)` thirty-eight
times over ten copies plus eight more, filling bytes 32 to 21,760 of the
framebuffer. At 160 bytes a line that is the 136-line viewport, in one colour
index. The constant pattern is planes `0/0/0/$FFFF`, so that index is **8**.

**The band below the horizon is the same fill.** A second `watch` run pokes a
sentinel into a screen word in the green band left of the runway (line 85 of the
`$068000` framebuffer, `$06A140`) and breaks on the next write. It stops at
`$059D34` — one of that routine's own `movem.l` instructions, with `A6` at
`$06A128` and the constant pattern still in all fourteen registers — and the
supervisor stack names the return address `$0595F0`, the instruction after the
`bsr.w $59CE2` at `$0595EC`. Nothing draws the ground band; the viewport is one
colour index from top to bottom.

Decoding the pinned framebuffer agrees. Lines 0–67 hold index **8** everywhere
the stars and the distant tower (indices 9–12) are not drawn, and lines 69–88
hold index **8** everywhere the pad (index 7) and the index-14 lines are not.
Sky and ground are the same index and cannot differ by palette alone. Line 68
is index 14 across all 320 pixels — a full-width line where the one changes to
the other.

They differ because the palette changes part-way down the frame. The VBL handler
at `$051D9A` copies sixteen words from the colour record at `$7C14` to
`$FF8240`, then reads a **seventeenth word**: `$051DC8` latches it into `$7C8A`
and `$051DCC` loads the scanline at `$7BFC` into MFP Timer B's data register
`$FFFA21`, enabling the Timer B interrupt at `$FFFA15`/`$FFFA1B`. The Timer B
handler at `$052280` then does one thing before re-arming for the panel split:

```
052280 move.w $7c8a.w, $ff8250.l
```

`$FF8250` is hardware colour **8**. A `watch` on `$7C8A` breaks at `$051DCC`
with `A0 = $8EF4` (the seventeenth word of the record at `$8ED4`), `A1 =
$FF8260` (just past the sixteen words it has copied) and `D0` low word `$0030`;
the disassembly prints the scanline it is about to read inline as `[0044]`.

The pinned capture makes the pair concrete: colour 8 is `$001`, the night sky;
the seventeenth word is `$030`, the green; `$7C8A` is `$030`; and `$7BFC` is
`$0044` — **line 68**, exactly the full-width line the framebuffer decode found
between the two bands. The ground band below the horizon is therefore
**rendering-only state**: one block fill, recoloured mid-frame by a raster
split.

### Where the two colours come from

A third `watch` run pokes the seventeenth word of the build record (`$8F16`) and
breaks at `$0599D4`, the `rts` of a routine reached from `$0595E8`. The writer
is `$0599D2`, the last of a run of `move.l`/`move.w` at `$0599B8`–`$0599D2` that
copies **seventeen words** — sixteen colours plus the split colour — from a
template at `$8EB2` into the record `$7C18` points at. The frame loop refreshes
the whole record from that template every frame, then overwrites two words:

- `$059638` writes `$7C86` into `$10(a0)`, colour 8 — the sky. `$050562`
  selects it per frame from `$7946` or `$7948`, the world record's two authored
  sky colours (`$357` day and `$001` night here), by testing the camera's
  position against the terminator words at `$42C6C`/`$42C70`.
- `$05963E` writes `$7A1A` into `$20(a0)`, the seventeenth word — the ground
  band. Besides the world-record load at `$0592B8`, `$04EB50` is the only writer
  of `$7A1A` in the bank, and it takes it from `$8(a0)` of a record whose first
  two words it puts in `$789A` and `$789E`. In the pinned RAM exactly one
  address carries that triple — `$063272`, holding `$0040`, `$0080`, … ,
  `$0030` — so the band colour is an authored per-workspace word, not a
  computed one. Which record family `$063272` belongs to is not established
  here and is not needed for the disposition.

This refines, and in one respect corrects, the earlier reading of the surface
record's `sceneColours`. `$7C82`/`$7C84` — the record's two words after its two
heights, resolved through the scene palette at `$059DA2` — are real authored
data and the extractor still decodes them. But they are installed only by
`$059600`, on the branch the frame loop takes when `$7B34` is **clear**. The
pinned outdoor on-foot frame has `$7B34 = $C000` and takes the `$059622` branch
instead, so Capital Spaceport's `$809A` → `#AAAAAA` and `$808E` → `#4488CC` are
*not* the sky and ground of that display; `$001` and `$030` are. The earlier
note that the second of the pair "is the sky blue behind it in the captured
display" is withdrawn.

### Inside an enclosed region

[#491](https://github.com/odogono/mercenary/issues/491) reads the other branch.
`$7B34` is the flags word of the bound structure's current region. `$0595F6`
tests its bit 15:

- **Bit 15 set** takes `$059622`, the branch above: sky, the Body's ground word,
  the object stream with the bound structure inside it, the ground records and
  the road edges (`$0596D0`–`$0596EC`). The Capital Spaceport's regions (`$8000`,
  `$C000`) and the State Office lobby (Floor 0 region 0, `$8000`) are drawn this way.
- **Bit 15 clear** is an enclosed region. `$059600` writes `$7C82` to colour 8
  and `$059606` writes `$7C84` to the split word, so the fill reads as the
  structure's first scene colour above the horizon and its second below. These
  are the two words after the record's heights, resolved through the scene palette
  at `$059DA2`–`$059DC6`, and published as `sceneColours`. `$05961E` then jumps to
  `$0596F0`, which runs `$05A730` only: the interior scene reset falls into the
  plan renderer `$05A744`. That renderer walks the region queue at `$05A7DC`, and
  within it the wall texts (`$053FAC`) and object insertions (`$0531C2` →
  `$053232`). No detail, object stream, ground record, island fill or road edge
  is drawn.

So an enclosed room's floor and ceiling are these two fills, not faces. Every
region on the State Office's Floors 1, 2 and 10 is enclosed. Floor 10's colours
are `#eeeeee` for the ceiling and `#006666` for the floor. The port clears to the
first and draws its eye-relative base plane in the second, whose horizon is at
eye level as the split is for a level on-foot view.

Either way the conclusion about geometry is unchanged and now covers both bands:
the background has **no model-space geometry to recover** above or below the
horizon.

## RAM diff (pad vs open ground)

`$00ABDC`, `$0083DC`, `$01E400` and `$01E000` are **byte-identical** across
first-world, pad t1 and walk t1. The geometry is static workspace data.

What changes is the live cell: first-world and pad stay in `$87` (structure 74);
walk t1 is `$B7`, structure slot 0, orientation 0, ground pointer to the shared
empty record at `$01E790`. Playfields and HUD were ignored.

| Window          | SHA-256 (first-world)                                              |
| --------------- | ------------------------------------------------------------------ |
| `$00ABDC` 1 KiB | `394611d7d237bb89439e890a1467704a0aa038acce341eb6df9c57e67ecd79ab` |
| `$0083DC` 256 B | `bc7659f92622d421d350e98dd9f1835c6e4da24c70c2e96df3e61b5daf1a03cc` |
| `$01E400` 512 B | `c1d4ba5ed133c4596b3bae2ad0d13c743b66b4e8b55a9d882afb5ce91ae95a91` |

`lab xref` (absolute long/short) names `$054CB0` for `$00ABDC` and `$054E40`
for `$83DC`; `$1E400` is also named from `$04EB84` / `$04EC3C` / `$04ECB6`.

## Record grammar

Header: two bytes. If the second has bit 7 set (every first-world record here:
`xx FF`), orientation minus the first byte feeds a nybble into the eight-byte
table at `$54E8E` (`00 06 03 05 01 04 02 07`). Bits of that nybble swap X/Z and
optionally negate them.

Plan: unsigned X/Z words relative to `$8000` (cell centre), terminated by X `0`.
`±32767` is a cell-edge continuation.

Faces: colour word, then byte references that are one-based multiples of four,
zero-terminated — the same rule as object polygons at `$04F8F2`. Ordinary
references index local model-space vertices. `$F0` and `$F4` instead index
preprojected, view-conditioned horizon slots. The extractor omits those
camera-dependent points and keeps the remaining local polygon.

`$C00E` (bit 14 set, bit 13 clear) is a two-point edge. A command with bits
14–12 set (`$7000` in the even-aligned records) is a compact object placement:
the loader aligns the following source address down to an even boundary, reads
X, Z and an object-table byte offset, applies the same `$54E8E` orientation,
and copies the addressed object pointer into a runtime slot. When the command
starts at an odd address, its low byte is also the high byte of X; the catalogue
preserves that overlap rather than treating it as padding.

Ten unique source records contain **56** `$7000` command sites. Orientation
expands those to **74** placements across **13** address-and-transform catalogue
models, referencing **six** existing object models; 57 table cells instantiate
those records. The catalogue composes models whose literal, hardware or
contextual scene palette is available and keeps every referenced object
identity in `relatedModels`. Structure slot zero resolves through surface
entry zero's palette metadata, so transforms `$04` and `$07` include all five
`object-041b1e` placements apiece instead of treating zero as no context.

First-world census: **50** unique records, **90** cells with local faces or
lines, **74** catalogue models after grouping by address and transform, **133**
intentional empty cells, and **74** transformed `$7000` placements in the unique
catalogue models.

Representative:

|  Cell | Record    | Faces | Notes                                                       |
| ----: | --------- | ----: | ----------------------------------------------------------- |
| `$87` | `$020F8E` |    12 | Spaceport cell: `$800E` grey, `$777` white, `$333` / `$411` |
| `$88` | `$021AFE` |     2 | No structure; grey apron `$800E` plus white pad `$777`      |
| `$B7` | `$01E790` |     0 | Open ground after the walk; intentional empty record        |

## Catalogue

Kind `ground`, schema version 5, table `$01E400`. Instances
`eris-ground-{cell}` are plotted on the catalogue map. `/damocles` composes
those instances into the Eris surface and draws them over an authored fill one
unit below `y = 0`, which stands in for the native sky/ground fill
([#221](https://github.com/odogono/mercenary/issues/221)). That fill is now
accounted for rather than unresolved: it has no model-space geometry, being one
block fill at `$059CE2` in colour index 8 with a Timer B raster split at
`$052280` recolouring it below the horizon, so the catalogue records it as a
**rendering-only exclusion** and `/damocles` keeps its presentation stand-in.
A recovered record covers its local polygons plus resolved `$7000` object
placements: `eris-ground-87` is still bounded by the stored geometry rather than
a fabricated cell rectangle. The shared `$01E790` record is classified as a
fully decoded intentional empty, not unresolved geometry. `$F0`/`$F4` joins are
classified as view-conditioned omissions rather than neighboring-cell geometry,
and the scene slots below `$F0` are the same joins for the other cells in view:
a per-frame slot numbering over the `$1E000` corner longwords the extractor
already reads, excluded for the same reason and checked by
`scripts/ground-extent-check.py`.

## Research update — #441: the run grid is the Settlement road network

[#441](https://github.com/odogono/mercenary/issues/441) asked for the `$01E000`
run grid as Catalogue records. Decoding it also settles what the ground-extent
edge list is: **the corners it joins are road-run endpoints, so the edges the
aerial view draws are the roads themselves.** The ledger row below is amended
accordingly; nothing about the record family, the `$01E400` index or the
altitude radius curve changes.

### The classifier, read in full

`$04EC30`–`$04EC92` walks all 256 cells once, `a0` sweeping the grid four bytes
at a time and `d0` counting the cell:

```
04EC30  lea.l   $1e000.l, a0    ; the run grid
04EC36  lea.l   $1e600.l, a1    ; the 64-byte class table
04EC3C  lea.l   $1e400.l, a2    ; the per-cell record index it fills
04EC42  lea.l   $83dc.l, a3     ; the per-cell orientation byte it fills
04EC4C  move.b  (a0)+, d1       ; row-run start cell
04EC4E  move.b  (a0)+, d2       ; row-run end cell
04EC50  beq.b   $4ec66          ; no row run: bits 0-2 stay clear
04EC52  bset.b  #$0, d7
04EC56  cmp.b   d0, d2
04EC5A  bset.b  #$1, d7         ; this cell is not the run's end
04EC5E  cmp.b   d0, d1
04EC62  bset.b  #$2, d7         ; nor its start
04EC66  move.b  (a0)+, d1       ; column-run start, then end, into bits 3-5
...
04EC80  move.b  (a1, d7.w), d7  ; class -> orientation byte
04EC84  move.b  d7, (a3)+       ; $83DC + cell
04EC86  lsr.w   #$3, d7
04EC88  andi.w  #$e, d7
04EC8C  move.w  $40(a1, d7.w), (a2)+   ; one of the six selectors at $1E640
```

The six selectors are not authored inline: `$04EC1C`–`$04EC2C` copies them into
`$1E640` from six **indices** the group's stream names, read out of a master
word table at `$1E64E`. Capital City's indices are `[0, 71, 87, 81, 26, 75]`
against the generic `[0, 71, 72, 73, 74, 75]`, which is why one Settlement's
straight is a runway and another's is a lane.

### The replay is self-checking

The same pass writes two tables. `$83DC` is the orientation byte the ground
decoder already reads, so a replay of `$04EC30` that disagrees with the live
`$83DC` is wrong about the grid. Replayed against the pinned first-world capture
and all 21 workspace memstates the extractor consumes, it reproduces `$83DC`
**byte for byte on all 256 cells of all 22 groups**. The extractor refuses to
publish a network it cannot reproduce that way.

`$1E400` is not reproduced by the classifier alone, and should not be: the
placement loop at `$04ECAA` walks the group's own stream afterwards and, at
`$04ECEE`–`$04ED0E`, replaces a cell's classifier record with the placement's own
where the two records' first bytes share a high nybble. So the classifier's
choice is the **base layer** and a Settlement's aprons and plazas sit over it.
77 of Capital City's 88 road cells are overridden this way; several smaller
groups have none. The payload carries both: `recordAddress` is the road piece
the class selected, `model` is the record the cell actually draws, and
`overridden` distinguishes them.

### What the six pieces are

The class table at `$1E600` is **resident, not per-group** — one identical
64-byte table in every capture, sha256
`483fae1b8b35e9e7af68bec3460587c9be82ffec983c6ac75e9581ee50ae9dd1` — so every
Settlement draws from one vocabulary and only the six selectors differ. Sixteen
of its 64 classes are ever reached, and they are exactly class 0 plus the
fifteen entries the table answers nonzero for: no authored cell is both the
start and the end of one run, so the degenerate classes never occur. Each axis
is therefore absent, capped by this cell, or passed through by it, and the piece
follows:

| Row | Column | Class | Orientation byte | Piece |
| --- | --- | --- | --- | --- |
| absent | absent | 0 | `$00` | 0 none |
| cap | absent | 3, 5 | `$10`, `$12` | 1 end |
| absent | cap | 24, 40 | `$11`, `$13` | 1 end |
| cap | cap | 27, 29, 43, 45 | `$20`–`$23` | 2 corner |
| through | absent | 7 | `$30` | 3 straight |
| absent | through | 56 | `$31` | 3 straight |
| through | cap / cap | through | 31, 47, 59, 61 | `$40`–`$43` | 4 tee |
| through | through | 63 | `$50` | 5 crossroads |

The high nybble is the selector index the `lsr`/`andi` pair extracts; the low
nybble is the quarter turn `$054E40` reads back as the record's transform.

### The ground-extent edges are the road lines

`$05493E` hands the same four bytes to the ground-extent slots `$FC`, `$F8`,
`$F4`, `$F0`, and `$054AD2` draws each surviving pair as one two-point edge.
The pinned first-world capture stands in cell `$87` with the window latched at
radius 3, covering x 4–10, z 5–11, and holds six nonzero edges at `$84DC`:

| Live edge | Recovered run |
| --- | --- |
| (11,8) – (7,8) | row run (7,8)–(11,8), own cell |
| (4,1) – (4,11) | column run (4,1)–(4,11) |
| (9,8) – (9,13) | column run (9,8)–(9,13) |
| (10,8) – (10,9) | column run (10,8)–(10,9) |
| (4,9) – (10,9) | row run (4,9)–(10,9) |
| (3,11) – (5,11) | row run (3,11)–(5,11) |

Those are all six, and the 37 runs of this network reach that window in exactly
those six — no run the game drew is missing and none it did not draw is
present. Since `$054888` widens the window with altitude along `$00915A`, the
aerial view collects every cell's runs, which is the whole network the overhead
capture of Capital City shows
([the islands note](damocles-eris-islands.md)).

### The record family is not Eris-only

Twenty-two captured Settlement groups across twenty-one Bodies, of which
**twenty-one carry a network**. Solon Base is the exception: one structure and
no run at all, the same way fourteen Bodies carry a settlement with no island.
A Body absent from the table below is a workspace no capture has loaded, not a
Body without roads.

| Capture | `$01E000` grid sha256 (first 16) | Six selectors | Runs | Road cells |
| --- | --- | --- | ---: | ---: |
| first-world (Capital City) | `17e92c34e5ff3b6f` | `$0790 $0796 $3304 $3B8E $4426 $1A6E` | 37 | 88 |
| vesta-parliament-4-6 | `93361a95c8f1f877` | `$0790 $2D06 $3210 $3A36 $1538 $489A` | 4 | 24 |
| gaea-ur-city-4-2 | `30507a96abda9302` | `$0790 $0796 $0E54 $11B4 $1538 $1A6E` | 15 | 31 |
| dion-2-3 | `32d699ce76928b20` | `$266C $0796 $0E54 $11B4 $1538 $1AC6` | 31 | 144 |
| icarus | `19d15de1fc275290` | generic | 3 | 7 |
| acheron | `21f8a3e5869514f4` | `$0790 $1BFE $1C24 $1ECA $1F00 $1F4A` | 10 | 25 |
| atropos | `45e26352c6d71673` | generic | 3 | 5 |
| clotho | `bbb8c80f08a7f239` | `$0790 $545C $5654 $57F6 $58F4 $54F8` | 8 | 21 |
| gaea (Chaldea Metropolis) | `ae90408632f01992` | generic | 34 | 125 |
| cronus | `71a8fc8c8dc9c8bc` | `$0790 $1BFE $1C24 $1ECA $1F00 $1FBA` | 6 | 15 |
| cyclopes | `0646ba034dfa7fe9` | `$0790 $0A04 $0E54 $11B4 $1538 $1A6E` | 6 | 21 |
| solon | `5f70bf18a0860070` | generic | **0** | **0** |
| theon | `7427ee8bd42ed387` | generic | 5 | 8 |
| metis | `39fb35d46e323090` | generic | 11 | 30 |
| lucan | `fd85303e27fe0755` | generic | 5 | 14 |
| logos | `318e9dfc7ca1f2c1` | generic | 10 | 24 |
| pan | `7a0888f45188a4d1` | generic | 10 | 17 |
| thalia | `37da8fcfa88356fe` | generic | 10 | 19 |
| bacchus | `3b991a14fb026009` | `$0790 $545C $5654 $57F6 $58F4 $1A6E` | 5 | 19 |
| tolosa | `0d0fa6d8ddf27949` | generic | 6 | 14 |
| perseus | `e599f747768e04ba` | generic | 8 | 19 |
| mentor | `e229ea64eaa0ebb3` | generic | 14 | 23 |

"generic" is `$0790 $0796 $0E54 $11B4 $1538 $1A6E`, the family thirteen of the
twenty-two groups share.

### Evidence identities

| Range | What | sha256 |
| --- | --- | --- |
| `$04EC30`–`$04EC94` | the classifier | `39a7f76a330314e57de48a1d006cb7f4fe6d7a3db27b6814c1f72be2291bfa7b` |
| `$01E600`–`$01E640` | the class table, resident | `483fae1b8b35e9e7af68bec3460587c9be82ffec983c6ac75e9581ee50ae9dd1` |
| `$01E000`–`$01E400` | the run grid, per group | per capture in the table above |
| `$04EB60`–`$04EC2E` | the run-grid expander (#447) | `5706423089cf79c33e03f6b38b2075ed80266ef5809850107216cbcd3d203545` |

### Catalogue disposition

A `roadNetworks` collection, one entry an island record that binds a structure
group: the group's origin and island, its six piece selectors, every classified
cell with its piece, rotation, source class, selected record and drawn model,
and the runs deduplicated as the network's lines. `coverage.roads` counts them.

## Research update — #447: the run grid is authored, so every group decodes

#441 published a network for each of the 22 groups a capture had loaded and
left the other 20 as gaps, on the reading that `$01E000` is capture state. It
is, but it is *built* capture state: `$04EB60`–`$04EC2C` expands a run-length
extent stream held in the group's own authored record, and that record is in
the program image for all 42 groups. So the grid a capture would have shown is
reconstructible without one, and **no flight, pose or new memstate is needed to
recover a Settlement's roads**.

### The expansion, read in full

`$04EB64` reaches the run grid, `$04EB6A` adds the word at `$1E64C` to get the
group-offset root, and `$04EB72` indexes that root by the group to reach the
authored record. `$04EB9C`–`$04EBAC` then clears `$1E000`–`$1E400` — eight
passes of four `movem.l` of eight registers, 1 KiB — leaving `a1` at `$1E000`,
and the stream is walked three bytes at a time from `$04EBB0`:

| First byte | Form | Meaning |
| --- | --- | --- |
| `$00` | terminator | `$04EBB2` ends the stream |
| bit 7 clear | row, `$04EBB6` | the 1-based row; `subq #1` then `asl #4` makes the row base |
| bit 7 set | column, `$04EBDE` | `not.b` gives the column directly |

The other two bytes are the run's first and last cell along that axis. The row
form writes the pair into bytes 0–1 of every cell from start to end; the column
form writes it into bytes 2–3, stepping `$3E` extra bytes a time so it advances
one row (64 bytes) per cell. Both forms compute the cell index with **byte**
arithmetic (`add.b`, `asl.b`), so a run wraps at 256 rather than running off the
grid. `$04EC0E` then takes the `$7AEE`/`$7AEF` pair and six selector *indices*,
which `$04EC22` turns into the six words at `$1E640` through the master table at
`$1E64E` — which is why one Settlement's straight is a runway and another's a
lane, and why the six selectors must come from the group and never from
whichever group the surrounding image happens to have loaded.

### What stands behind a group nobody has stood in

The expansion is checked the only way it can be: against the machine. For every
memstate on disk, expanding that capture's own group from the **program image**
reproduces the capture's live `$01E000` **byte for byte**, and its six live
selectors at `$1E640` word for word — 32 captures over 25 distinct groups, no
differences. Feeding those grids through `$04EC30` then reproduces the live
`$0083DC` orientation table on all 31 comparisons, which is #441's existing
gate. `tests/test_catalogue.py` pins both.

So a captured group keeps its live self-check and an uncaptured one is an
expansion of the same kind, validated 25 ways. The payload marks which is which
in `attestation`, `capture` or `image`. As #447 left it, `overridden` was
**null** on an image-derived cell, on the reading that the placement replacement
at `$04ECEE` is only in a live `$1E400`; #460 below shows the replacement is
replayable too, and answers it.

### The twenty groups this recovers

| Body | Groups | Notes |
| --- | --- | --- |
| LUCAN | `$1D`–`$24`, `$26`–`$28` | 18–36 road cells each; eleven of the twenty |
| ERIS | `$10`, `$11`, `$14`, `$15` | KEY WEST `$15` is the largest at 48 cells |
| DION | `$1B`, `$1C` | 26 cells each, and different layouts |
| LACHESIS | `$34` | PULVIN MINES, 10 cells — **no pose stands on this Body at all** |
| GAEA | `$0E` | **no run**: a recovered "no roads", like SOLON BASE |
| MIDAS | `$38` | **no run**, the same reading |

Two of these were sitting in existing captures. `damocles.key-west.sav` binds
group `$15` and `damocles.midas.sav` binds `$38`, and both agree with the static
decode; the extractor refuses them as *placement* sources because their camera
pair disagrees with their cell origin, which is a gate about placing cells
against a fabricated origin and says nothing about the run grid.

GAEA `$0E` and MIDAS `$38` are worth stating plainly: they hold no road at all,
so a capture standing in either would have returned the same empty answer.

`coverage.classifications.roadTemplate` is **not** the flag for this and stays
at 0. It counts models still carrying the `$7000` road-template omission, which
is a different thing that was already discharged; a scalar could not answer a
per-Body question in any case. A consumer asking whether a Body's roads were
recovered asks `roadNetworks` for an entry naming that Body.

## Research update — #460: the Drawn Record is authored too

#447 gave every image-derived road cell its **Selected Piece** and left its
**Drawn Record** — the record the cell actually draws — as `model: null`,
`overridden: null`. The reading was that three things stand between the two and
only a live workspace carries them: the `$83DC` orientation, the scene joins
from the seed longword at `$1E000 + cell × 4` (`$05493E`), and the placement
replacement at `$04ECEE`–`$04ED0E`. None of the three needs a capture.

- The **orientation** is the classifier's own output, which #441 already
  reproduces.
- The **seed table is the run grid**. `SCENE_SEED_TABLE` and `ROAD_RUN_GRID` are
  the same `$1E000`: the four bytes `$05493E` rotates into slots `$F0`–`$FC` are
  the cell's row and column run endpoints, which `expand_run_grid` already
  rebuilds.
- The **placement replacement** is the same authored stream, read on. After the
  six selector indices, `$04ECAA` walks `(index, cell, slot[, key, dx, dz])`
  entries to an `$FF`. Each writes the cell's `$ABDC` structure slot, then
  replaces its `$1E400` word with the master-table record `index` names —
  provided the two records' first bytes share a high nybble. If they do not,
  `bne.w $05097A` lands on a bare `rts` and the loader simply stops, so the
  nybble test is a guard, not a second rule. No authored stream trips it.

The records those words index are resident. Past the six selector words at
`$1E640`–`$1E64C`, every capture's `$1E64E` onwards is the program image's, so
the record bank does not depend on which group is loaded.

`load_structure_workspace` replays `$04EB60`–`$04ED12` over the program image.
Against every memstate on disk — 33 captures over 25 distinct groups — it
reproduces the live `$1E000`, `$1E400`, `$1E640`, `$0083DC` and `$7AEE` byte
for byte, and `$ABDC` too, except on the one capture with `$7A2A` set
(`damocles.midas`), where `$04ED2A`–`$04ED3C` floods `$ABDC` with its first
entry. That flag is run state, not the group's stream, and MIDAS has no road
cell. The pass after `$04ED14` is not replayed, because nothing in it is read
by the ground decoder.

The extractor holds this to the machine: for every captured workspace it
decodes each road cell a second time from the replay and raises unless the
mesh is identical. On all 693 captured road cells, it is.

So each of the 478 image-derived cells now publishes the Drawn Record the loader
would have left it: 114 of them a placement's record rather than the Selected
Piece, and 364 the piece itself. All 478 decode completely and every one is
scene-joined, which is why they cannot borrow another cell's Model. They add
**475 ground Models**; the other three are identical to first-world Models and
share them. A Model is shared only where its mesh is identical, because a
record's scene colours follow the palette of the structure `$ABDC` puts on its
cell. BARE ISLAND and KEY WEST cells bind `object-041b1e` through two palettes
no capture had evidenced, 43 and 94.

| Range | What | sha256 |
| --- | --- | --- |
| `$04ECAA`–`$04ED14` | the placement loop and replacement (#460) | `de1569a225de408317e11c6ac805bb995816bd6e37da3902579d89487d04378f` |
| `$01E64E`–`$01E84E` | the master record table, resident | `d0df36edbe8dbb98903b89e016b357c1b8a1f1b87093c84f21facb58782657f6` |

## Unresolved

- The producer of `$7BFC`, the scanline the sky/ground raster split fires on.
  `lab xref` finds only the read at `$051DCC`, so it is written through a
  register-indexed address, and it is not rewritten while the player walks: a
  `watch` over 40,000 VBLs never breaks. Next probe: arm the same watch and
  provoke a **view change** rather than locomotion — board or leave a vehicle —
  since on foot the camera pitch, and so the horizon line, never moves.
- The `$6000` ground vector-text command, which leaves three records partial.
- Whether `$00ABDC` high-byte paths `$20..$9F` overlay extra `$1E000` data on
  some cells.
- Ground records on bodies other than the captured Eris workspace.
