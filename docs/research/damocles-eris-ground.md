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
output byte (`$5F28`, slot `$E8`) across 40,000 VBLs of walking never breaks:
on foot the altitude byte never changes, `$054BD6` never calls `$054888`, and
the list built on arrival simply stands while `$054A64` re-projects it every
frame. Captures taken at radius zero show the other end of the same rule —
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
| The `$05499E` route list allocates slots for a road or path network                        | **Refuted**                               | `$054888` clamps a `2r+1` cell square around the camera; `$05499E` dedups those cells' `$1E000` corner words; `$0549D2` assigns slots down from `$F0`; `$054AD2` draws each word as one two-point edge through `$576C4`.                                |
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
