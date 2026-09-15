# Eris ground, landing-pad and road geometry

Working-Authority Evidence for where Damocles stores the grey pad, roads and
ground colouring around Capital Spaceport, and what the catalogue's unread
surface-attachment records are. Research note for
[#206](https://github.com/odogono/mercenary/issues/206).

Authoritative Evidence remains bound to the C64 Reference Build. Observations
here are Working-Authority Evidence only. This note does not mint Damocles world
terms in `CONTEXT.md`.

## Scope and non-goals

**In scope:** locating the RAM records that produce the outdoor pad, road and
ground fill seen from the spaceport; saying what follows a structure wall-list
terminator; extending the catalogue decoder when a record family is proven.

**Out of scope:** withdrawing the authored `/damocles` ground plane
([#195](https://github.com/odogono/mercenary/issues/195) follow-on);
sky/horizon; other-body workspaces;
[#207](https://github.com/odogono/mercenary/issues/207) (`structure-01a618`).

## Working Authority and reproduce path

| Item                  | Value                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------- |
| Program               | `roms/atarist/damocles_-_mercenary_ii_novagen_software_(uk).stx`                                    |
| SHA-256               | `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef`                                  |
| TOS pin               | EmuTOS 2.06 (`154803e3…8939d5`)                                                                     |
| Lab                   | `research/damocles-st/` (`damocleslab`)                                                             |
| Scenario              | `research/damocles-st/scenarios/first-world.json` (SHA-256 `e5383458…8582f96e`)                     |
| Placement disassembly | `scenarios/ground-road-template.json`; run `observe-ground-road-template-20260915T112757Z-af886487` |
| Pad view              | `scenarios/approach-spaceport-pad.json`                                                             |
| Open ground           | `scenarios/walk-toward-building.json` (NAV `07-08` → `07-11`)                                       |

Cited RAM:

- `observe-first-world-20260818T101013Z-c5a32b7d/observed.ram` SHA-256
  `b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967`
- `observe-approach-spaceport-pad-20260818T152751Z-9ebdb1a1` t0/t1
- `observe-walk-toward-building-20260818T143508Z-c60e2391` t1 (cell `$B7`)

Reproduce:

```sh
research/damocles-st/lab doctor
PYTHONPATH=research/damocles-st python3 -m damocleslab.catalogue \
  --run research/damocles-st/work/observe-first-world-20260818T101013Z-c5a32b7d \
  --output payload/damocles/catalogue.json
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
`$B7`) share one record with **no vertices**. Their green fill is a default
cell rectangle, not a stored mesh; `/damocles` still authors that fill. Direct
`$777` faces in the cell-`$88` record are the white pad; `$800e` faces are the
grey apron.

Surface attachments after a structure wall terminator share the ground stream's
bit-classed command envelope (`$C00E` edges, `$7000` object placements,
Structure 74's `$4200` door). They are not where the pad lives.

The old “`$7000` road template / `$53F76`” label conflated two paths. In the
source loader, `$7000` is a compact placement command consumed at `$054FCE`:
cell-local X and Z followed by a byte offset into the address-based object
pointer table at `$04BD10`. `$053F76` belongs to the separate runtime
vector-text renderer and is not this source command's consumer.

## Hypothesis ledger

| Hypothesis                                                                                | Status                                    | Evidence                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pad/road are already structure form-4/6 polygons at `y = 0`, hidden by the authored plane | **Refuted as the store**                  | Structure 74's recovered faces are walls and building planes. The white/grey strips decode from `$020F8E` / `$021AFE`, not from `$01484E`.                                                                |
| The two skipped structure-header colour words are the cell fill                           | **Refuted for the pad**                   | Structure 74's words are `$809A` / `$808E` (scene-palette greys/blues), not `$777` / `$444`. The pad colours are in the ground stream.                                                                    |
| Unused bits of `$00ABDC` select pad vs grass vs road                                      | **Refuted for ground**                    | `$054CBE` masks the first byte with `$FE` into `$7AF8` for a different selector (objects / `$1E000` side table when `$20..$9F`). Ground uses `$1E400` + `$83DC`. Low nine bits remain the structure slot. |
| A separate fill path draws cell rectangles / road strips                                  | **Confirmed**                             | `$054E50` `$1E400`; `$054E40` `$83DC`; vertex/face stream then `$8C32` / `$056634`.                                                                                                                       |
| Post-terminator attachments also carry pad polygons                                       | **Partially confirmed (family, not pad)** | Ground records continue with `$C00E` / `$7000` after faces. Structure 74's `$4200` door is the documented wall-list attachment. The pad polygons themselves are ordinary colour+ref faces.                |

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
zero-terminated — the same rule as object polygons at `$04F8F2`. `$F0` and `$F4`
index a combined neighborhood workspace, not this cell's vertex list; the
extractor omits them and keeps the remaining local polygon.

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
identity in `relatedModels`. Two transformed records still reference
`object-041b1e` without a structure palette context, so those particular copies
remain a named palette-binding gap rather than receiving an invented colour.

First-world census: **50** unique records, **90** cells with local faces or
lines, **74** catalogue models after grouping by address and transform, **133**
empty default cells, and **74** transformed `$7000` placements in the unique
catalogue models.

Representative:

|  Cell | Record    | Faces | Notes                                                       |
| ----: | --------- | ----: | ----------------------------------------------------------- |
| `$87` | `$020F8E` |    12 | Spaceport cell: `$800E` grey, `$777` white, `$333` / `$411` |
| `$88` | `$021AFE` |     2 | No structure; grey apron `$800E` plus white pad `$777`      |
| `$B7` | `$01E790` |     0 | Open ground after the walk; default fill                    |

## Catalogue

Kind `ground`, schema version 5, table `$01E400`. Instances
`eris-ground-{cell}` are plotted on the catalogue map. `/damocles` composes
those instances into the Eris surface and draws them over an authored fill one
unit below `y = 0`, which stands in for the ground a record does not cover
([#221](https://github.com/odogono/mercenary/issues/221)). A recovered record
covers its local polygons plus resolved `$7000` object placements:
`eris-ground-87` is still bounded by the stored geometry rather than a
fabricated cell rectangle. `$F0`/`$F4` joins and default fill remain unresolved.

## Unresolved

- Colour and exact rectangle of the **default empty-cell fill** (the recovered
  outdoor green).
- Scene-palette context for two transformed `$7000` copies of
  `object-041b1e`.
- Neighbor-join slots `$F0`/`$F4` as reconstructed vertices.
- Whether `$00ABDC` high-byte paths `$20..$9F` overlay extra `$1E000` data on
  some cells.
- Ground records on bodies other than the captured Eris workspace.
