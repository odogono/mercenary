# Eris islands: records, coastlines, local cells and land/sea

Working-Authority Evidence for
[#391](https://github.com/odogono/mercenary/issues/391). Until this note the
Damocles Catalogue carried Eris's *workspaces* — 16×16 windows of recovered
surface assemblies and ground records — and no landmass at all. The renderer
drew one green fill for land and sea alike
(`web/src/damocles/frame.ts:220`).

Eris's five islands are now recovered: their placement in body coordinates,
their coastline polygons, the rule that classifies any position as land or sea,
and the colours the engine paints each with. The same structure decodes on every
body, so the note also settles what an island, a settlement and a workspace each
are, and that none of the three implies another.

Authoritative Evidence remains bound to the C64 Reference Build. Observations
here are Working-Authority Evidence only.

## Working Authority and reproduce path

| Item | Value |
| --- | --- |
| Program | `roms/atarist/damocles_-_mercenary_ii_novagen_software_(uk).stx` |
| Program SHA-256 | `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef` |
| First-world RAM | `work/observe-first-world-20260818T101013Z-c5a32b7d/observed.ram` |
| RAM SHA-256 | `b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967` |
| Probe | `research/damocles-st/scripts/island-classification-probe.py` |
| Probe points | `research/damocles-st/scenarios/eris-island-points.json` |
| Memstates | the 32 captures in `research/damocles-st/snapshots/` |

The memstates and the observed RAM are Restricted Material and stay in the
ignored `research/damocles-st/work/` and `snapshots/` directories. Every address
below is named by a listing; nothing is inferred from a screenshot.

```sh
# static decode, no emulator
research/damocles-st/.venv/bin/python research/damocles-st/scripts/structure-group-probe.py \
    --run research/damocles-st/work/observe-first-world-20260818T101013Z-c5a32b7d

# live classification sweep (one Hatari restore per point)
research/damocles-st/.venv/bin/python research/damocles-st/scripts/island-classification-probe.py \
    --roms roms --points research/damocles-st/scenarios/eris-island-points.json --json

# deterministic overhead validation views: one point an island, placed north of
# it at three quarters of its span with pitch $268, tolerance loose because a
# camera left at altitude drifts while the frame settles
research/damocles-st/.venv/bin/python research/damocles-st/scripts/island-classification-probe.py \
    --roms roms --points overhead-points.json --screenshot --tolerance 12
```

## Decision

**An island is a ten-byte record in a per-body list, and it is not the
workspace it selects.** Every body carries a list of such records at the
longword `$7A16`, terminated by the word `$8000`:

| Offset | Width | Meaning |
| --- | --- | --- |
| `+0` | word | origin x, in whole Surface Cells of the body |
| `+2` | word | origin z, in whole Surface Cells of the body |
| `+4` | word | offset from the record to its coastline vertex list |
| `+6` | word | structure group — the 16×16 workspace bound at that origin |
| `+8` | word | the island's land colour, published to `$7A1A` |

The per-body root comes from the table the longword `$4BD1E` points at, indexed
by half the body selector (`$0592E8`–`$0592F6`):

```
0592E8  move.w    a0, d0            ; a0 = body selector, four times the body index
0592EA  lsr.w     #$1, d0
0592EC  movea.l   $4bd1e.l, a1
0592F2  adda.w    (a1, d0.w), a1
0592F6  move.l    a1, $7a16.w       ; this body's island-record list
```

`$056490` walks that list every time the classifier runs and keeps the record
nearest the player's **body** position `$7A92`/`$7A9A` in `$7894`. `$056464`
then publishes the winner's origin and falls into `$04EB46`, which installs its
group and rebuilds the 16×16 workspace:

```
056464  movea.l   $7894.w, a0       ; the nearest island record
056468  move.w    $6(a0), d0        ; its structure group
05646C  movea.l   a0, a1
05646E  adda.w    $4(a1), a1        ; its coastline vertex list
056472  move.l    a1, $78a2.w
056476  move.w    #$8000, d1
05647A  cmp.w     (a1)+, d1         ; scan to the terminator
05647C  bne.b     $5647a
05647E  move.l    a1, $78aa.w       ; the draw stream that follows it
056482  jmp       $4eb46.l
...
04EB46  move.w    (a0), $789a.w     ; workspace origin x
04EB4A  move.w    $2(a0), $789e.w   ; workspace origin z
04EB50  move.w    $8(a0), $7a1a.w   ; land colour
04EB5C  move.w    d0, $794e.w       ; ... and fall into the workspace loader
```

That closes a question the [non-Eris workspace
sweep](damocles-non-eris-workspaces.md) left open. Every origin that sweep read
out of a live capture's camera pair is authored in this table, so a workspace
origin is not a property of the capture at all: it is the island record the
player was nearest to.

## Eris

Five records, at `$063272`, each with a coastline and each binding a distinct
structure group.

| Island (area name) | Group | Origin | Coastline extent (body cells) | Span | Colour |
| --- | --- | --- | --- | --- | --- |
| `CAPITAL CITY` | `$12` | 64,128 | x [38,104) z [112,160) | 66 × 48 | `$0030` green |
| `SNOW ISLAND` | `$10` | 32,1056 | x [−8,56) z [1040,1076) | 64 × 36 | `$0777` white |
| `VELOS CITY` | `$11` | 1536,768 | x [1520,1576) z [752,800) | 56 × 48 | `$0420` orange |
| `BARE ISLAND` | `$14` | 3072,512 | x [3052,3136) z [496,540) | 84 × 44 | `$0322` brown |
| `KEY WEST` | `$15` | 2560,3584 | x [2528,2608) z [3524,3632) | 80 × 108 | `$0030` green |

The issue named the third island *VELOS*. The recovered area name is
`VELOS CITY`; nothing in the machine carries the shorter form.

Snow Island's west coast reaches body x = −8, which is 4088 on the wrapping
surface below. It is the one Eris island that crosses the coordinate seam, and
any renderer that treats body coordinates as a bounded rectangle will tear it.

### Coastline polygons

Each vertex is a signed word pair, island-local, in whole cells. The list ends
at `$8000`.

| Island | Vertices (island-local) |
| --- | --- |
| `CAPITAL CITY` | (−24,0) (−26,8) (−8,24) (32,32) (40,16) (32,−8) (−8,−16) |
| `SNOW ISLAND` | (−40,8) (−32,16) (0,20) (20,16) (24,−8) (8,−16) |
| `VELOS CITY` | (0,24) (24,32) (40,28) (16,−8) (−8,−16) (−16,0) |
| `BARE ISLAND` | (28,12) (12,−12) (−4,−16) (−20,0) (−14,12) (16,26) (32,28) (56,20) (64,4) (48,−4) (40,−6) |
| `KEY WEST` | (−12,4) (−28,16) (−32,32) (−24,44) (−8,48) (24,32) (48,0) (32,−16) (8,−8) (4,−32) (20,−48) (0,−60) (−24,−32) (−8,−24) |

**Three of the five are concave.** Bare Island carries a deep V between
(−4,−16) and (−14,12); Key West carries a bay at (8,−8) and a second at
(−8,−24). No island may be treated as a convex hull, and the native
classifier below does not assume one either.

### Places, and the cell-label collision

A place record names a cell **within the island's 16×16 workspace**, so it is an
island-local address and never a body-wide one.

| Island | Local cell | Body cell | Place |
| --- | --- | --- | --- |
| `CAPITAL CITY` | 09-08 | 73,136 | `STATE OFFICE` |
| `CAPITAL CITY` | 07-08 | 71,136 | `CAPITAL SPACEPORT` |
| `CAPITAL CITY` | 09-09 | 73,137 | `MOORBY SCH OF FLYING` |
| `CAPITAL CITY` | 08-14 | 72,142 | `TRADING POST` |
| `CAPITAL CITY` | 15-12 | 79,140 | `LAWSON BANK HQ` |
| `CAPITAL CITY` | 14-05 | 78,133 | `ERIS POWER GENERATION` |
| `CAPITAL CITY` | 04-11 | 68,139 | `GUM STORE` |
| `CAPITAL CITY` | 01-01 | 65,129 | `EXCHEQUER DISTRICT A` |
| `CAPITAL CITY` | 09-02 | 73,130 | `PLAYTESTER STORES` |
| `CAPITAL CITY` | 01-14 | 65,142 | `PLAYTESTER STORES` |
| `CAPITAL CITY` | 12-14 | 76,142 | `ERIS POST OFFICE HQ` |
| `SNOW ISLAND` | 07-04 | 39,1060 | `SCOTT AIRPORT` |
| `SNOW ISLAND` | 03-00 | 35,1056 | `POSTOFFICE SORTING` |
| `SNOW ISLAND` | 06-04 | 38,1060 | `HATHAWAYS WINE BAR` |
| `SNOW ISLAND` | 03-04 | 35,1060 | `TRADING POST` |
| `VELOS CITY` | 04-01 | 1540,769 | `ERIS TV STUDIOS` |
| `VELOS CITY` | 04-05 | 1540,773 | `EKMPV & S AD AGENCY` |
| `BARE ISLAND` | 06-02 | 3078,514 | `HANTZEN SALES` |
| `BARE ISLAND` | 07-04 | 3079,516 | `HANTZEN ADMIN` |
| `BARE ISLAND` | 06-05 | 3078,517 | `HANTZEN LABORATORY` |
| `BARE ISLAND` | 02-04 | 3074,516 | `HANTZEN AIRPORT` |
| `BARE ISLAND` | 05-02 | 3077,514 | `HANTZEN HELIPORT` |
| `BARE ISLAND` | 06-01 | 3078,513 | `GUM STORE DRAPERY` |
| `KEY WEST` | 07-07 | 2567,3591 | `NEWTON LTD RESEARCH` |

`PLAYTESTER STORES` appears twice on Capital City, at 09-02 and 01-14. Those are
two records, not one place seen twice — the same reading the non-Eris sweep
recorded for `KING BURDOCK` and `FRANKS BARGAIN TP`.

**Capital City 09-08 and Key West 09-08 are different locations, and each holds
its own authored structure.** Both groups carry a cell instance at `$89`, and
they are not the same one:

| | Capital City group `$12` | Key West group `$15` |
| --- | --- | --- |
| structure slot | 75 | 251 |
| instance offset | 0, −50 | −19, −44 |
| body cell | 73,136 | 2569,3592 |
| recovered name | `STATE OFFICE` | none — no place record names it |


Capital City's origin is 64,128 and Key West's is 2560,3584, so local 09-08 is
body (73,136) on one and body (2569,3592) on the other — 2496 cells apart on x
and 3456 on z. The [resident list](damocles-guide-resident-list.md) merged nine
residents across the two because it had a cell label and no island to qualify
it. A cell label alone never identified a location; it identifies one only once
its island record is named with it.

The guide lead that put `Lawson Bank` at Key West 09-08 is **not** verified by
this recovery and is mildly contradicted by it: the only recovered
`LAWSON BANK HQ` place record is on Capital City at 15-12. Key West's 09-08
instance is real and authored, but nothing in the machine names it. It stays a
secondary-source lead.

## Body coordinates wrap, and they are not the local cells

`$058F64` derives the scene camera from the body position by subtracting the
workspace origin and sign-extending to 28 bits:

```
058F64  andi.w    #$fff, $7ab2.w    ; body x, high word masked to twelve bits
058F6A  andi.w    #$fff, $7aba.w    ; body z
058F78  lea.l     $7aae.w, a0
058F7C  lea.l     -$20(a0), a1
058F80  movem.l   (a0), d0-d7       ; the staged triple
058F84  movem.l   d0-d7, (a1)       ; published to $7A92/$7A96/$7A9A
058F88  sub.l     $789a.w, d1       ; minus the island origin
058F8C  sub.l     $789e.w, d3
058F90  asl.l     #$4, d1           ; wrapped into 28 bits, signed
058F92  asr.l     #$4, d1
058F94  asl.l     #$4, d3
058F96  asr.l     #$4, d3
058F98  movem.l   d1-d3, $7a2c.w    ; the scene camera
```

At 65,536 units a cell that makes a body's surface a **4096 × 4096 cell torus**,
which is the same 1024 Body Coordinate Steps an axis that
[#371](damocles-gamma-system.md) recovered from the other readout. Nothing here
is a bounded plane: an island near x = 0 is adjacent to one near x = 4095.

**The Cell Readout is island-local, signed, and unbounded.** It is the high word
of `$7A2C`/`$7A34` — body position minus the *selected island's* origin — so it
agrees with the 16×16 workspace cell only while the player stands in that
window, and outside it runs negative or past 15. Two Working-Authority captures
pin the rule:

| Capture | Readouts | Island | Decoded body cell |
| --- | --- | --- | --- |
| oblique, Capital City west coast | `008-283`, `26-08` (26 red) | `CAPITAL CITY` at 64,128 | (64−26, 128+8) = (38,136) — the coastline vertex |
| overhead, north of Snow Island | `007-500`, `03-28` (28 red) | `SNOW ISLAND` at 32,1056 | (32+3, 1056−28) = (35,1028) |
| overhead, Key West | `639-137`, `60-55` | `KEY WEST` at 2560,3584 | (2560+60, 3584+55) = (2620,3639) |

In each the Body Coordinate Readout independently brackets the same body
position to within its four-cell step. A field prints red when the local cell is
negative and `**` once its magnitude passes 99; the probe's own Key West
overhead reads `08-**` at local z = −103.

`web/src/damocles/panel.ts` currently prints `**` for **any** negative cell. That
is wrong against this rule, and it is wrong in a way the Capital City capture
shows directly: the original prints `26` in red where the port prints `**`.

## Land and sea

### The colours

Two words decide the surface fill, and both are recovered:

- `$7C88` is the body's own base colour: the low word of the longword at
  `$0060C0 + 4·body` — the Body colour recovered in
  [the Gamma System note](damocles-gamma-system.md) — masked to twelve bits at
  `$0592AC`–`$0592B4`. For Eris it is `$0003`, deep blue — **the sea**.
- `$7A1A` is the selected island's colour, from its record's `+8`. For Capital
  City and Key West `$0030` green, Snow Island `$0777` white, Velos City `$0420`
  orange, Bare Island `$0322` brown.

The frame builder picks between them by where the camera is
(`$0597EC`–`$05983C`): standing inside the island's core box with the camera on
the ground, the ground plane is drawn in `$7A1A`; anywhere else the base plane is
`$7C88` and each island is painted over it by its own draw stream, whose first
command word is that island's colour.

**All 32 tracked, arrival-pose and maintainer memstates read `$7A1A` equal to the
static record's `+8` word, `$789A`/`$789E` equal to that record's origin, and
`$7C88` equal to `$60C2 + 4·body`.** Thirty-two of thirty-two on all three, with
no exception.

### The classifier

`$0560F2` publishes a three-way answer in `$78A6`: `0` inside the island's core
box, `1` on the island, `$FFFF` at sea. The test is staged, and every stage is
authored data stored immediately **before** the coastline vertex list, read
backwards:

1. A backwards list of four-word boxes, terminated by `$8000`. Box 0 is the
   island's overall extent — it matches the polygon's bounding box exactly on
   all five Eris islands. Outside it, the answer is `$FFFF` and the engine
   re-runs the nearest-record search at `$056488` before answering.
2. Box 1 is the core box: an authored inner rectangle, `x [−5,21) z [−5,21)` on
   Capital City and Key West and `x [−5,13) z [−5,13)` on the other three.
   Inside it the answer is `0` and no further test runs. It is *not* the 16-cell
   workspace window — on three of five islands it is smaller — so it cannot be
   derived and has to be carried.
3. Boxes 2…n are exclusion boxes — corners of box 0 that are certainly sea.
   Inside one, the answer is `$FFFF`.
4. Otherwise `$0561CE` scans a backwards list of edge words, one per coastline
   edge, terminated by `0`. Each word names its two vertices — `(word >> 6) &
   $FC` and `word & $FF`, both four times the vertex index plus four — with bit
   15 swapping them and bit 14 selecting the axis-reversed form. The first edge
   whose axis-aligned box contains the point decides which side of that edge the
   point lies on, and so whether it is land or sea.
5. If no edge's box contains the point, the scan falls off the end at `$0561D0`
   and the answer is `1`. **Interior points are land by exhaustion, not by a
   fill test** — which is why a concave island needs no special case.

The edge lists are exactly the closed edge cycle of each polygon: seven edges
for Capital City's seven vertices, fourteen for Key West's fourteen.

### What the classification is used for

- **Walking.** The user-visible rule is that the coast cannot be crossed on
  foot. `$059690` reads `$78A6`, masks it with the per-body word `$794A`, and on
  a sea answer restores the player from the last-known-good position kept in
  `$7A3C`/`$7A44` (`$0596AC`). The restore is why a probe that moves the player
  must move those two words with it.
- **Leaving a craft.** `$057D16` sets the on-foot height, calls `$058F64` and
  `$0560F2`, and refuses the disembark on a sea answer:

  ```
  057CFC  move.l    #$3f, $7ab6.w     ; the on-foot height
  057D16  bsr.w     $58f64
  057D1A  bsr.w     $560f2            ; classify where the craft stands
  057D2E  move.b    $794a.w, d0
  057D32  and.b     d0, $78a6.w
  057D36  bmi.b     $57d50            ; sea: the refusal path
  057D38  bsr.w     $5449c            ; land: disembark
  ```

  That is the recovered mechanism behind landing on water and being unable to
  get out.
- **Which ground plane colour to draw**, as above.

### Roads are a different table, and are not the coastline

The structure group's run-length extent stream builds a 256-entry grid at
`$1E000`, four bytes a cell: the start and end cell of the row run the cell
belongs to, then of its column run. `$04EC30`–`$04EC92` turns each cell's four
bytes into a six-bit class — has a row run, is or is not at its ends, likewise
for the column — looks that class up in the 64-byte table at `$1E600`, stores
the result in `$83DC + cell`, and uses `(class >> 3) & $E` to pick one of the
group's six ground-record selectors at `$1E640`.

Those runs are the **road network**, not a landmass: they are one-cell-wide
lines, and their six selectors are the road pieces (Capital City's are
`[0, 71, 87, 81, 26, 75]` against the generic `[0, 71, 72, 73, 74, 75]`). The
coastline is the island record's polygon and nothing else. This note does not
change what [the Eris ground note](damocles-eris-ground.md) records about ground
records or the altitude radius curve at `$00915A`.

## Islands, settlements and workspaces are three things

Decoding every body's list gives 62 island records across 30 bodies. 41 carry a
coastline polygon; 29 bind a group whose place list has a readable area name.
The two properties are independent. The complete inventory — every record's
origin, coastline, colour and area — is
[the island census](damocles-island-census.md); the summary here is enough to
settle the domain question.

| Body | Records | With coastline | With named area | Body colour |
| --- | ---: | ---: | ---: | --- |
| DIALIS | 1 | 0 | 0 | `$777` |
| ICARUS | 1 | 0 | 1 | `$222` |
| MIDAS | 1 | 0 | 1 | `$540` |
| ACHERON | 1 | 0 | 1 | `$444` |
| DION | 3 | 3 | 3 | `$055` |
| ATROPOS | 1 | 0 | 1 | `$444` |
| CLOTHO | 1 | 1 | 1 | `$322` |
| LACHESIS | 10 | 10 | 1 | `$411` |
| GAEA | 3 | 3 | 2 | `$030` |
| CRONUS | 1 | 0 | 1 | `$322` |
| CYCLOPES | 5 | 5 | 1 | `$333` |
| ERIS | 5 | 5 | 5 | `$003` |
| SOLON | 1 | 0 | 1 | `$333` |
| THEON | 1 | 0 | 1 | `$444` |
| VESTA | 1 | 1 | 1 | `$246` |
| METIS | 1 | 0 | 1 | `$411` |
| LUCAN | 12 | 12 | 0 | `$322` |
| LOGOS | 1 | 0 | 1 | `$444` |
| AURORA | 1 | 0 | 0 | `$411` |
| TRITON | 1 | 0 | 0 | `$740` |
| PAN | 1 | 0 | 1 | `$222` |
| THALIA | 1 | 0 | 1 | `$246` |
| JUNO | 1 | 0 | 0 | `$246` |
| BACCHUS | 1 | 0 | 1 | `$333` |
| JASON | 1 | 0 | 0 | `$444` |
| TOLOSA | 1 | 0 | 1 | `$411` |
| PERSEUS | 1 | 1 | 1 | `$322` |
| MENTOR | 1 | 0 | 1 | `$444` |
| SAPPHIRE | 1 | 0 | 0 | `$246` |
| DAMOCLES | 1 | 0 | 0 | `$000` |
| **total** | **62** | **41** | **29** | |

Four dispositions appear, and all four are attested:

- **A settlement with no island.** Fourteen bodies — Icarus, Midas, Acheron,
  Atropos, Cronus, Solon, Theon, Metis, Logos, Pan, Thalia, Bacchus, Tolosa,
  Mentor — carry one record with a named area, a bound workspace and **no
  coastline at all**. `TAKOUSHI BASE` sits on Icarus at 624,688 with no
  landmass under it, and the whole surface is Icarus's own `$222`. A settlement
  must not require an island. All twenty-one coastline-less records share one
  stub whose extent and core boxes are the whole coordinate plane, so the
  classifier answers `0` everywhere on such a body — land, no sea, no coast.
  See [the census](damocles-island-census.md).
- **An island with no settlement.** Lucan's twelve records all carry coastlines
  and none binds a named workspace; nine of Lachesis's ten and four of
  Cyclopes's five are the same. An island must not require a settlement.
- **Both.** All five Eris records, all three Dion records, Clotho, Vesta and
  Perseus.
- **Neither.** Dialis, Aurora, Triton, Juno, Jason, Sapphire and Damocles carry
  a record that is only an origin: no geometry, no name, group `$00`.

**A record has no name of its own.** Every island name in this note is the area
name of the *group* that record selects, read from the place-list header the
workspace loader publishes at `$7A6C`. `BARE ISLAND` and `SNOW ISLAND` read like
landmass names and `CAPITAL CITY` and `VELOS CITY` like settlement names, but
the machine draws no such distinction: they are one field. Which of the
twenty-nine named areas are settlements as opposed to islands named after their
one town is **not recovered**, and this note does not guess. It is a naming
question about the area record, not a structural one — structurally each is one
named area bound to one workspace bound to one island record.

Two further cautions the data enforces:

- `ERIS BANK REPOSITORY` is the area name on **Tolosa**, not on Eris. An area
  name never identifies the body it is on.
- Group `$00` is the shared empty record. Several bodies point at it, so two
  records having the same group does not make them the same place.

## Validation

### Static decode against live captures

All 32 memstates — the tracked set, the arrival poses and
`damocles.key-west.sav` — agree with the static decode:

- `$789A`/`$789E` equals the origin of a record in that body's list — including
  Lucan's, whose authored word 65336 is 3896 on the wrapping surface, and
  including the two poses (`midas`, `damocles`) whose *position* the non-Eris
  sweep already refused; their workspace origin still matches a record.
- `$7A1A` equals that record's `+8` colour word. 32 of 32.
- `$7C88` equals `$60C2 + 4·body`. 32 of 32.

`damocles.key-west.sav` is the strongest single capture, because it is the only
one taken over water: origin 2560,3584, group `$15`, `$7A1A` = `$0030`,
`$7C88` = `$0003`, position (2620.26, 3639.49), `$78A6` = `$FFFF`. The recovered
classifier predicts `$FFFF` for that position.

### Live classification sweep

`island-classification-probe.py` restores one memstate per point, writes the
point into the staged body position `$7AB2`/`$7ABA` and the last-known-good
`$7A3C`/`$7A44`, lets the machine settle, and reads back the engine's own
`$7894`, `$789A`/`$789E` and `$78A6`. Nothing is decoded from the capture; the
probe compares the engine's published answer against a Python transcription of
`$0560F2`–`$0563F2`.

The point set covers, for every island: its core, four offshore points beyond
box 0 on each axis, and a pair three cells either side of the midpoint of
**every** coastline edge — the test that exercises shape, scale and orientation
rather than extent. It also includes Capital City 09-08 and Key West 09-08.

Runs `island-classification-20260919T221312Z-6b3c2631` and
`…-20260919T222154Z-69ab2647` between them cover all 115 points. The engine's
answer and the transcription's agree on **every one**.

| Island | Points | `0` core | `1` land | `$FFFF` sea | of which coast-edge pairs | Disagreements |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `CAPITAL CITY` | 20 | 2 | 7 | 11 | 14 | 0 |
| `SNOW ISLAND` | 17 | 1 | 6 | 10 | 12 | 0 |
| `VELOS CITY` | 17 | 2 | 5 | 10 | 12 | 0 |
| `BARE ISLAND` | 27 | 1 | 11 | 15 | 22 | 0 |
| `KEY WEST` | 34 | 2 | 16 | 16 | 28 | 0 |
| **total** | **115** | **8** | **45** | **62** | **88** | **0** |

Every island's selection matched too: the record the engine put in `$7894`, and
the origin it published in `$789A`/`$789E`, is the record this note's table names
at every one of the 115 points.

Snow Island's three westernmost points are the seam in action. Asked for body x
= −13.5, −0.55 and −6.45, the engine republished 4082.5, 4095.45 and 4089.55 —
the same positions, 4096 cells along — and classified them sea, land and sea, as
the transcription predicts. The probe's own confirmation had to be taught to
compare on the torus before it would accept them, which is the clearest
demonstration available that the wrap is real and not a decoding artefact.


A point is only recorded when the engine republishes the position that was asked
for; anything else is a lost poke and the probe retries it.

### Deterministic overhead views

Run `island-classification-20260919T221218Z-1181d94a` places the camera north of
each island at three quarters of its span, pitch `$268`, and captures the
framebuffer. Each island is drawn whole, in its recovered colour, on Eris's
`$0003` sea:

| View | Readouts | Shows |
| --- | --- | --- |
| `overhead-capital-city.png` | `016-268`, `07-52` (52 red) | a seven-sided green island, Capital City's road network drawn across its middle |
| `overhead-snow-island.png` | `005-494`, `08-56` (both red) | a six-sided white island, the west point at local (−40,8) foremost |
| `overhead-velos-city.png` | `377-426`, `12-43` (43 red) | a six-sided orange island, Velos City's roads at its centre |
| `overhead-bare-island.png` | `754-357`, `22-70` (70 red) | an eleven-sided brown island with the deep central V between (−4,−16) and (−14,12) |
| `overhead-key-west.png` | `626-099`, `08-**` | a fourteen-sided green island, both bays visible, the local z field past 99 and printing `**` |

Two Working-Authority captures supplied by the maintainer corroborate
independently: an oblique view standing on Capital City's west coast, showing a
straight coast segment and the hard walk-block, and an overhead of Snow Island
from the craft. Neither was used to derive geometry.

## What the Catalogue needs

The catalogue's schema is model/instance/place/table. An island is none of
those: it is a body-level region with its own coordinate origin. The additions
below are what the recovered data supports, and no more.

1. **An `islands` collection**, one entry a record, keyed by body and record
   address so that unnamed records stay distinct:
   - `id` — `island-<body-slug>-<recordAddress>`; there is no authored name.
   - `body` — `body-<n>`.
   - `origin` — `[x, z]` in whole Surface Cells, the record's `+0`/`+2`.
   - `coastline` — the signed island-local vertex pairs, verbatim, plus the edge
     words. Both are needed: the edge words carry the swap and axis bits the
     classifier reads, and they are not derivable from the vertex order alone.
   - `boxes` — the backwards box list, in order, tagged `extent`, `core` and
     `exclusion`. These are authored fast paths, not an optimisation to
     re-derive.
   - `landColour` — the `+8` word as an ST colour.
   - `structureGroup` — the `+6` byte, and `workspace` — the existing workspace
     record it binds, **nullable**: group `$00` records bind nothing.
   - `areaName` — nullable, and explicitly the *group's* area name rather than
     the island's own.
2. **A `bodySurface` field a body**, carrying `baseColour` from
   `$60C2 + 4·body` and the surface extent 4096 × 4096 cells with wrapping
   stated, so a consumer cannot treat it as a bounded plane.
3. **Qualify every existing local placement by its island record.** Live
   workspace instances today carry `coordinateSystem: 'ST surface grid units
   (body-local origin unresolved)'`. The origin is now resolved, so the field
   should name the island record the origin came from and the position should
   stay body-absolute. The Capital City / Key West residents in the resident
   list are then separable without inventing anything: their island record is
   the discriminator.
4. **Do not add an `island` field to `Damocles Place`.** A place is a cell in a
   workspace; the workspace is bound by an island record; deriving the island
   from the place would bake in a one-to-one relationship that Lucan and
   Lachesis disprove.
5. **`schemaVersion` does not move.** This follows the `keyBase` precedent: new
   payload fields, extractor, `web/src/catalogue/data.ts` parser and tests.

## Renderer integration plan

`web/src/damocles/frame.ts:220` draws one fill for everything. The recovered
presentation replaces it in four pieces, in this order.

1. **Base plane in the body colour.** Replace the single green with
   `bodySurface.baseColour`. On Eris that alone turns the world into sea, which
   is a visible regression until step 2 lands — the two must ship together.
2. **Island fills over the base plane.** For each island record on the body,
   project its coastline polygon in body coordinates and fill it with
   `landColour`. Depth: these sit **below** the ground records and structures
   that the coplanar depth work (#545) already
   orders, and they replace the role the workspace fill ring currently plays for
   sea. The existing Capital Spaceport structures, roads and ground polygons are
   placed in body coordinates at origin 64,128 and are unaffected — the island
   fill is a new layer beneath them, not a change to their transform.
3. **The ground-plane substitution when standing on an island.** While the
   classifier answers `0`, the engine draws the ground plane directly in
   `landColour` (`$0597F8`) rather than painting the base plane and filling the
   polygon over it. It also swaps the island's draw stream for a filtered copy
   built at `$05642C` whenever the player is on the selected record
   (`$0565B0`–`$0565BC`); what that filter removes is **not decoded**, so the
   port should start by simply not filling the island underfoot and treat the
   substitution as an open question rather than reproducing a stream it cannot
   read.
4. **Land/sea classification as a session query.** A `classifyPosition(body,
   x, z)` returning `core | land | sea` plus the selected island record. It is
   wanted by more than the renderer: the walk-block and the disembark refusal
   are the same query.

**Interfaces required.** A body's island list on the session's world view; the
classifier above; and a body-coordinate wrap helper, because the 4096-cell torus
is not currently represented anywhere in the port.

**Validation.** An overhead deterministic view per island compared against the
captures above; a unit test that the classifier reproduces the probe sweep table
point for point; and a regression that Capital Spaceport's existing placements
are unmoved.

**The one decision this research does not make.** Step 2 fills a polygon; step 4
replays an edge-bbox scan that is *not* a polygon fill — it answers `land` for
interior points by exhausting the edge list, and its wedge behaviour near a
concave coast is not guaranteed to agree with a fill. Whether the port replays
the native scan as a Preserved Quirk or fills the polygon and accepts divergence
is a genuine tradeoff, and it is unresolved: the sweep exercised 115 points and
found no disagreement, but it did not prove the two agree everywhere. No ADR is
minted here, because no alternative has been chosen. The implementing issue
should decide it, and a disagreement sweep dense enough to answer it is cheap —
it is the same probe.

### Settled by [#394](https://github.com/odogono/mercenary/issues/394): the port replays the scan, and the two agree

The dense sweep is run, and it is not a live probe: the scan and the fill are
both decided by data already in the Catalogue, so both can be evaluated
statically over every record without the emulator. Each of the **41 records that
carry a coastline**, on all 30 bodies, was sampled at an eighth of a cell across
its extent box plus a four-cell margin, offset off the authored lattice so that
no sample lies exactly on an edge line:

| Scope | Points | Disagreements |
| --- | ---: | ---: |
| Eris's five islands | 1,656,832 | 0 |
| All 41 coastline records | 9,151,488 | 0 |

The staged scan — extent box, core box, exclusion boxes, first edge whose own box
holds the point, land by exhaustion — and an even-odd fill of the same polygon
answer alike at every one, including both of Eris's concave islands, Bare
Island's central V and both of Key West's bays. The only points at which they
can differ are those lying *exactly* on a coastline edge, where the answer is
whichever side the tie is broken toward; that set has measure zero and the
on-lattice sampling that first exposed it is an artefact of sampling, not a
disagreement about shape.

So the question dissolves rather than being traded off, and **no ADR is minted,
because nothing diverges**. The port replays the scan in `classifyPosition`
(`web/src/damocles/islands.ts`) and fills the polygon in the renderer, and the
sweep above is why those two may be different code without being two different
answers. Replaying is not merely defensible but necessary: the core box is
authored and smaller than the 16-cell workspace on three of Eris's five islands,
so no fill derives it, and `core` is the answer the ground-plane substitution
turns on.

The test that pins this is `web/test/damocles-islands.test.ts`, which reproduces
the 115-point table above island by island.

## Per-island readiness ledger

Readiness is against the renderer integration plan above: what a consumer could
draw and place today from pinned evidence, not what is understood.

| | `CAPITAL CITY` | `SNOW ISLAND` | `VELOS CITY` | `BARE ISLAND` | `KEY WEST` |
| --- | --- | --- | --- | --- | --- |
| Identity | record `$063272`, group `$12` | `$06327C`, `$10` | `$063286`, `$11` | `$063290`, `$14` | `$06329A`, `$15` |
| Name | area name only; no island name in the machine | same | same | same | same |
| Origin | 64,128 | 32,1056 | 1536,768 | 3072,512 | 2560,3584 |
| Coastline | 7 vertices, 7 edge words, convex | 6, 6, convex | 6, 6, convex | 11, 11, **concave** | 14, 14, **concave** |
| Boxes | 5 (extent, core, 3 exclusion) | 4 | 4 | 8 | 9 |
| Land colour | `$0030` | `$0777` | `$0420` | `$0322` | `$0030` |
| Transforms | origin + 28-bit wrap; exact | exact; **crosses the x seam** | exact | exact | exact |
| Workspace binding | group `$12`, 76 assemblies live | `$10`, static | `$11`, static | `$14`, static | `$15`, static |
| Road network (#447) | 88 cells, capture-attested | 25 cells, image | 24 cells, image | 28 cells, image | 48 cells, image |
| Places | 11 | 4 | 2 | 6 | 1 |
| Capture provenance | `eris-spaceport-onfoot` + 5 more; oblique coast capture | maintainer overhead capture | none standing on it | none standing on it | `damocles.key-west.sav`, over water |
| Classifier validation | full edge sweep, agrees | full edge sweep, agrees | full edge sweep, agrees | full edge sweep, agrees | full edge sweep, agrees |
| Overhead view | yes | yes | yes | yes | yes |
| Blockers | none for geometry; cell-label qualification is a catalogue change | the seam crossing must be handled before it can be drawn | no capture standing on it | none | no capture standing on it |

**Amended by [#447](https://github.com/odogono/mercenary/issues/447).** "No
capture standing on it" is still true of `VELOS CITY` and `KEY WEST`, and still
blocks their `$ABDC` surface assemblies. It no longer blocks their **roads**: the
run grid is expanded from the group's own authored stream, so all five islands
now publish a road network and the four beyond `CAPITAL CITY` are marked
`attestation: image`. `KEY WEST`'s is the largest on the body at 48 cells.

No island's geometry, placement, transform or colour is a gap. What is uneven
is **capture provenance**: three of the five have no memstate taken standing on
them, so their workspaces are decoded statically rather than attested live, the
same standard the [non-Eris sweep](damocles-non-eris-workspaces.md) applies.
That is a gap in coverage, not in the recovery: the static decode reproduced the
live `$ABDC` table, place-list pointer and origin on every capture that does
exist.

## Named gaps

- **Which named areas are settlements.** Structurally all twenty-nine are one
  named area bound to one workspace. Nothing in the machine separates
  `BARE ISLAND` the landmass name from `VELOS CITY` the town name.
- **The nearest-record metric.** `$056490` computes a distance through the
  tables at `$60000`/`$64000` and `$4BD34`, which this note did not decode. Eris's
  five islands are far enough apart that no probe point was ambiguous, and every
  observed selection matched a plain nearest-origin reading, but the exact metric
  is unrecovered and will matter where records are close — Lachesis's ten are
  100 cells apart on one axis.
- **`$7A1A` versus the draw stream's own colour word.** Both hold each island's
  colour and this note did not establish whether either can differ from the
  other.
- **The per-body word `$794A`.** It gates whether a sea answer blocks walking
  and disembarking. It is read from `$271C(a1)` at arrival and its high byte is
  `$FF` on Eris; what it is on a body with no sea is unrecovered.
- **Sub-cell coastline position.** `$05636A` and `$0563F2` carry the distance to
  the deciding edge into `$4BDD4`/`$56672` after classifying. What consumes it —
  a shoreline blend, a pushback distance — is unrecovered.
- **The substituted draw stream at `$78AE`.** `$05642C`–`$056462` copies the
  selected island's draw stream into low memory, replacing some entries with
  `$FC` according to what `$056672` returned. Which entries, and why, is
  unrecovered.
- **Interior residents.** Unchanged by this note; still
  [#325](https://github.com/odogono/mercenary/issues/325).

## One incidental finding about `damocles.key-west.sav`

Adding that capture to the snapshot set changes the object-bank census:
`$03865D` and `$040A4B` differ from the pinned first-world image, holding `$0411`
where first-world holds `$0654` — the horizon colour the frame builder writes at
`$05960C`, and the same live value the first beacon patch slot at `$03E415`
already carries. They are two more live colour slots of the family
`test_the_object_bank_differs_only_where_the_census_does_not_read` already
documents, and `test_no_captured_world_introduces_an_object_record` passes on the
capture, which is the gate that says no live value reaches a mesh.

That test asserted an exact set of varying offsets, so it failed as soon as the
capture was present. It now asserts a subset: the memstates are Restricted
Material and only five are tracked, so which capture is present is a property of
the checkout, and requiring every documented slot to vary fails on a checkout
that lacks the capture which varies it. What the test still catches — a capture
differing anywhere the census does read — is unchanged.
