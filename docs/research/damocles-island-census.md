# Damocles island census: every record on every body

Working-Authority Evidence for
[#391](https://github.com/odogono/mercenary/issues/391), extending
[the Eris island note](damocles-eris-islands.md) to the whole Gamma System. That
note recovered the mechanism — a per-body list of ten-byte island records at
`$7A16`, each naming an origin, a coastline, a structure group and a land colour
— and documented Eris's five. This one is the complete inventory: **62 records
across 30 bodies**, with every origin, coastline and colour.

Authoritative Evidence remains bound to the C64 Reference Build. Observations
here are Working-Authority Evidence only. Nothing here re-derives the record
format, the classifier or the coordinate system; read the Eris note first.

## Working Authority

| Item | Value |
| --- | --- |
| Program SHA-256 | `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef` |
| First-world RAM | `work/observe-first-world-20260818T101013Z-c5a32b7d/observed.ram` |
| RAM SHA-256 | `b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967` |
| Per-body list table | `$4BD1E` → `$063104` |
| Record lists | `$063144`..`$0633E0` |

All coordinates are Surface Cells on the body's 4096 × 4096 wrapping surface,
printed in the 0..4095 range the engine's own mask produces. Several records
store a negative word — Lucan's ring is authored in signed coordinates — so the
raw word and the printed cell differ there; both are the same position.

**An extent whose upper bound is below its lower bound crosses the seam.** Four
of Lucan's twelve read `[4082,26)` — `$0632EA` and `$063326` on z, `$063308` and
`$063344` on x — and Eris's Snow Island reaches `[4088,56)`:
those are 40-cell and 64-cell spans straddling cell 0, not empty ranges. Any
consumer that treats an extent as `lo <= v < hi` will drop them.

## What the coastline-less records actually are

Twenty-one of the 62 records have an empty vertex list. They are not 21 separate
authorings: **all twenty-one point at one shared stub at `$06340C`**, and the two
boxes in front of it are

```
$063404  7fff 8000 7fff 8000    ; box 0: x [-32768,32767) z [-32768,32767)
$0633FC  7fff 8000 7fff 8000    ; box 1: x [-32768,32767) z [-32768,32767)
$0633FA  8000                   ; terminator
```

Box 0 is the island's extent and box 1 is its core, and here both are the whole
coordinate plane. `$0560F2` therefore answers `0` — core — for **every** position
on such a body: no sea, no coast, no edge scan. A body with no island is land
everywhere, in its own base colour.

Twenty-one bodies carry exactly this record and nothing else. Fifteen of them
appear in the snapshot set, and all fifteen read `$78A6` = `0`; the recovered
classifier predicts `0` for each.

It also corrects a decoding trap. The boxes are read backwards and the walk is
terminated by `$8000` in the xmin field — but `$05612A`–`$056188` reads box 0 and
box 1 **unconditionally**, and only the walk of boxes 2…n at `$05618A` tests the
sentinel. Because the stub's box 0 and box 1 both have xmin `$8000`, applying the
sentinel from box 0 loses them both and makes the record look boxless.

## The shape library

62 records draw on **17 distinct coastline definitions holding 9 distinct
shapes**, plus the no-island stub. A record's `+4` offset can point at a
definition another record already uses, so one definition — vertices, boxes and
edge words together — may serve several islands at several origins.

| Shape | Vertices | Extent (cells) | Island-local vertex list | Stored at |
| --- | ---: | --- | --- | --- |
| `A` | 7 | 66 × 48 | (-24,0) (-26,8) (-8,24) (32,32) (40,16) (32,-8) (-8,-16) | `$06344A` `$063946` `$06388C` |
| `B` | 6 | 64 × 36 | (-40,8) (-32,16) (0,20) (20,16) (24,-8) (8,-16) | `$0638E6` `$0634A4` |
| `C` | 6 | 56 × 48 | (0,24) (24,32) (40,28) (16,-8) (-8,-16) (-16,0) | `$0634FA` `$0639A0` |
| `D` | 8 | 40 × 40 | (-14,6) (-8,20) (6,26) (20,20) (26,6) (20,-8) (6,-14) (-8,-8) | `$0637AE` `$063A8C` `$063822` `$0636C2` |
| `E` | 4 | 144 × 8 | (136,-4) (-4,0) (0,4) (140,0) | `$06374A` |
| `F` | 4 | 280 × 8 | (136,-4) (-140,0) (-136,4) (140,0) | `$06370E` |
| `G` | 9 | 96 × 56 | (-28,-8) (-36,12) (-24,28) (8,36) (24,32) (48,20) (60,0) (52,-12) (12,-20) | `$063A14` |
| `H` | 11 | 84 × 44 | (28,12) (12,-12) (-4,-16) (-20,0) (-14,12) (16,26) (32,28) (56,20) (64,4) (48,-4) (40,-6) | `$06357A` |
| `I` | 14 | 80 × 108 | (-12,4) (-28,16) (-32,32) (-24,44) (-8,48) (24,32) (48,0) (32,-16) (8,-8) (4,-32) (20,-48) (0,-60) (-24,-32) (-8,-24) | `$063626` |
Shapes `A`, `B`, `C` and `D` each exist at more than one address: the same
polygon authored twice rather than shared. `A` is Capital City's outline, and it
is also Birmingham Island on Dion, Politburo City on Vesta and Alkane Base on
Perseus — four of the System's named places are the same 66 × 48 heptagon. `D`
is the 40 × 40 octagon, and it is the most reused shape in the game: all twelve
of Lucan's, all five of Cyclopes's, Clotho New Town and Gaea's unnamed island,
19 records in all.

Two definitions are shared by pointer across bodies: `$06344A` by Eris's Capital
City and Dion's Birmingham Island, and `$0634FA` by Gaea's Ur City and Dion East.

## The census

One row a record, in list order.

| Body | Record | Origin | Group | Colour | Shape | Coastline extent | Area name | Places |
| --- | --- | --- | --- | --- | --- | --- | --- | ---: |
| DIALIS | `$063144` | 0,0 | `$00` | `$0777` | — | whole surface | — | 0 |
| ICARUS | `$063150` | 624,688 | `$33` | `$0222` | — | whole surface | TAKOUSHI BASE | 0 |
| MIDAS | `$06315C` | 1729,938 | `$38` | `$0540` | — | whole surface | THE MIDAS PROJECT | 0 |
| ACHERON | `$063168` | 3419,298 | `$06` | `$0444` | — | whole surface | ACHERON RETREAT | 8 |
| DION | `$063174` | 3252,1314 | `$02` | `$0030` | A | x [3226,3292) z [1298,1346) | BIRMINGHAM ISLAND | 7 |
|  | `$06317E` | 3316,1378 | `$1B` | `$0040` | B | x [3276,3340) z [1362,1398) | DION NORTH | 1 |
|  | `$063188` | 3316,1298 | `$1C` | `$0040` | C | x [3300,3356) z [1282,1330) | DION EAST | 1 |
| ATROPOS | `$063194` | 42,225 | `$37` | `$0444` | — | whole surface | ATROPOS WAYSTATION | 0 |
| CLOTHO | `$0631A0` | 2421,300 | `$32` | `$0555` | D | x [2407,2447) z [286,326) | CLOTHO NEW TOWN | 2 |
| LACHESIS | `$0631AC` | 2644,153 | `$34` | `$0211` | E | x [2640,2784) z [149,157) | PULVIN MINES | 0 |
|  | `$0631B6` | 2644,253 | `$00` | `$0211` | F | x [2504,2784) z [249,257) | — | 0 |
|  | `$0631C0` | 2644,353 | `$00` | `$0211` | F | x [2504,2784) z [349,357) | — | 0 |
|  | `$0631CA` | 2644,453 | `$00` | `$0211` | F | x [2504,2784) z [449,457) | — | 0 |
|  | `$0631D4` | 2644,553 | `$00` | `$0211` | F | x [2504,2784) z [549,557) | — | 0 |
|  | `$0631DE` | 2644,653 | `$00` | `$0211` | F | x [2504,2784) z [649,657) | — | 0 |
|  | `$0631E8` | 2644,753 | `$00` | `$0211` | F | x [2504,2784) z [749,757) | — | 0 |
|  | `$0631F2` | 2644,853 | `$00` | `$0211` | F | x [2504,2784) z [849,857) | — | 0 |
|  | `$0631FC` | 2644,953 | `$00` | `$0211` | F | x [2504,2784) z [949,957) | — | 0 |
|  | `$063206` | 2644,1053 | `$00` | `$0211` | F | x [2504,2784) z [1049,1057) | — | 0 |
| GAEA | `$063212` | 512,1792 | `$07` | `$0040` | C | x [496,552) z [1776,1824) | UR CITY | 4 |
|  | `$06321C` | 3072,256 | `$0E` | `$0322` | D | x [3058,3098) z [242,282) | — | 0 |
|  | `$063226` | 256,768 | `$0F` | `$0420` | G | x [220,316) z [748,804) | CHALDEA METROPOLIS | 5 |
| CRONUS | `$063232` | 2564,873 | `$36` | `$0322` | — | whole surface | CRONUS MUSEUM | 0 |
| CYCLOPES | `$06323E` | 3487,1445 | `$35` | `$0454` | D | x [3473,3513) z [1431,1471) | IDI CENTRE | 1 |
|  | `$063248` | 3287,1645 | `$00` | `$0454` | D | x [3273,3313) z [1631,1671) | — | 0 |
|  | `$063252` | 3287,1245 | `$00` | `$0454` | D | x [3273,3313) z [1231,1271) | — | 0 |
|  | `$06325C` | 3687,1245 | `$00` | `$0454` | D | x [3673,3713) z [1231,1271) | — | 0 |
|  | `$063266` | 3687,1645 | `$00` | `$0454` | D | x [3673,3713) z [1631,1671) | — | 0 |
| ERIS | `$063272` | 64,128 | `$12` | `$0030` | A | x [38,104) z [112,160) | CAPITAL CITY | 11 |
|  | `$06327C` | 32,1056 | `$10` | `$0777` | B | x [4088,56) z [1040,1076) | SNOW ISLAND | 4 |
|  | `$063286` | 1536,768 | `$11` | `$0420` | C | x [1520,1576) z [752,800) | VELOS CITY | 2 |
|  | `$063290` | 3072,512 | `$14` | `$0322` | H | x [3052,3136) z [496,540) | BARE ISLAND | 6 |
|  | `$06329A` | 2560,3584 | `$15` | `$0030` | I | x [2528,2608) z [3524,3632) | KEY WEST | 1 |
| SOLON | `$0632A6` | 3974,1396 | `$04` | `$0333` | — | whole surface | SOLON BASE | 1 |
| THEON | `$0632B2` | 2546,3334 | `$09` | `$0444` | — | whole surface | THEON BASE | 3 |
| VESTA | `$0632BE` | 1083,307 | `$05` | `$0426` | A | x [1057,1123) z [291,339) | POLITBURO CITY | 6 |
| METIS | `$0632CA` | 2527,1066 | `$03` | `$0411` | — | whole surface | METIS MOONBASE | 3 |
| LUCAN | `$0632D6` | 100,173 | `$1D` | `$0744` | D | x [86,126) z [159,199) | — | 0 |
|  | `$0632E0` | 173,100 | `$1E` | `$0744` | D | x [159,199) z [86,126) | — | 0 |
|  | `$0632EA` | 200,0 | `$1F` | `$0744` | D | x [186,226) z [4082,26) | — | 0 |
|  | `$0632F4` | 173,3996 | `$20` | `$0744` | D | x [159,199) z [3982,4022) | — | 0 |
|  | `$0632FE` | 100,3923 | `$21` | `$0744` | D | x [86,126) z [3909,3949) | — | 0 |
|  | `$063308` | 0,3896 | `$22` | `$0744` | D | x [4082,26) z [3882,3922) | — | 0 |
|  | `$063312` | 3996,3923 | `$23` | `$0744` | D | x [3982,4022) z [3909,3949) | — | 0 |
|  | `$06331C` | 3923,3996 | `$24` | `$0744` | D | x [3909,3949) z [3982,4022) | — | 0 |
|  | `$063326` | 3896,0 | `$25` | `$0744` | D | x [3882,3922) z [4082,26) | — | 0 |
|  | `$063330` | 3923,100 | `$26` | `$0744` | D | x [3909,3949) z [86,126) | — | 0 |
|  | `$06333A` | 3996,173 | `$27` | `$0744` | D | x [3982,4022) z [159,199) | — | 0 |
|  | `$063344` | 0,200 | `$28` | `$0744` | D | x [4082,26) z [186,226) | — | 0 |
| LOGOS | `$063350` | 1294,2648 | `$08` | `$0444` | — | whole surface | LOGOS CITY | 6 |
| AURORA | `$06335C` | 1214,683 | `$00` | `$0411` | — | whole surface | — | 0 |
| TRITON | `$063368` | 3337,3213 | `$00` | `$0214` | — | whole surface | — | 0 |
| PAN | `$063374` | 421,1799 | `$0C` | `$0222` | — | whole surface | PAN HADES LABOURCAMP | 1 |
| THALIA | `$063380` | 1999,3256 | `$0B` | `$0246` | — | whole surface | THALIA BASE CAMP | 0 |
| JUNO | `$06338C` | 3475,854 | `$00` | `$0246` | — | whole surface | — | 0 |
| BACCHUS | `$063398` | 1661,1586 | `$18` | `$0333` | — | whole surface | BACCHUS WAYSTATION | 4 |
| JASON | `$0633A4` | 366,2187 | `$00` | `$0444` | — | whole surface | — | 0 |
| TOLOSA | `$0633B0` | 2737,1571 | `$17` | `$0411` | — | whole surface | ERIS BANK REPOSITORY | 0 |
| PERSEUS | `$0633BC` | 3834,821 | `$16` | `$0000` | A | x [3808,3874) z [805,853) | ALKANE BASE | 3 |
| MENTOR | `$0633C8` | 2817,268 | `$1A` | `$0444` | — | whole surface | MENTOR WAYSTATION | 0 |
| SAPPHIRE | `$0633D4` | 3444,2273 | `$00` | `$0246` | — | whole surface | — | 0 |
| DAMOCLES | `$0633E0` | 3991,2101 | `$00` | `$0000` | — | whole surface | — | 0 |

## What the census shows

**41 records carry a coastline; 29 bind a named area; the two are independent.**
Every combination occurs, which is why island, settlement and workspace have to
be three separate concepts:

- **Settlement, no island** — 14 records on 14 bodies: Acheron, Atropos,
  Bacchus, Cronus, Icarus, Logos, Mentor, Metis, Midas, Pan, Solon, Thalia,
  Theon and Tolosa each carry one record with a named workspace and the
  no-island stub. Their whole surface is land in the body's base colour.
- **Island, no settlement** — 26 records on 4 bodies: Lucan's twelve, nine of
  Lachesis's ten, four of Cyclopes's five and one of Gaea's three carry a
  coastline and bind group `$00`, the empty workspace. They are landmasses with
  nothing on them, and they are the largest category by record count.
- **Both** — 15 records on 8 bodies: Eris's five, Dion's three, Gaea's other
  two, Lachesis's Pulvin Mines, Cyclopes's Idi Centre, Clotho, Vesta and
  Perseus.
- **Neither** — 7 records on 7 bodies: Aurora, Damocles, Dialis, Jason, Juno,
  Sapphire and Triton carry a record that is only an origin — the stub, group
  `$00`, no name.

**Three bodies are authored as geometric arrangements rather than as
geography.**

- **Lucan** is a ring: twelve copies of shape `D` at radius 200 from the body
  origin, every 30° — `(200,0)`, `(173,100)`, `(100,173)`, `(0,200)` and so on
  round, written as signed words and wrapping to the 3896–4095 range on two of
  the four quadrants. Each binds its own structure group `$1D`..`$28`, and none
  of those groups has a readable area name.
- **Lachesis** is a ladder: ten strips at x = 2644, spaced exactly 100 cells
  apart in z from 153 to 1053. The first is shape `E` (144 × 8) and binds
  `PULVIN MINES`; the other nine are shape `F` (280 × 8) and bind nothing.
- **Cyclopes** is a quincunx: `IDI CENTRE` at (3487,1445) with four unnamed
  copies of shape `D` at the corners of a 400-cell square, (3287,1245) to
  (3687,1645).

**A record has no name.** Every name in the census is the area name of the
*group* the record selects, so a record binding group `$00` is nameless by
construction. `ERIS BANK REPOSITORY` is on Tolosa; an area name never identifies
its body.

**Land colour is per record, not per body.** Clotho's island is `$0555` on a
`$322` surface; Gaea's three are `$0040`, `$0322` and `$0420` on a `$030`
surface; Dion's are `$0030`, `$0040`, `$0040` on `$055`.

**On an island-less body the two colours are the same,** which is what makes the
whole-plane core box invisible: 20 of the 21 stub records carry exactly their
body's base colour, so the surface reads uniform whichever of the two the frame
builder picks. **Triton is the single exception** — record colour `$0214` against
base colour `$740` — which predicts an orange surface seen from altitude and a
dark blue-green one underfoot. Triton has no capture, so that is a prediction
from the decode and not an observation.

### The base colour is #382's Body colour, and the engine masks it

The base colour is not a new table. `$0592AC`–`$0592B4` reads the **low word** of
the longword at `$0060C0 + 4·body` — the Body colour decoded in
[the Gamma System note](damocles-gamma-system.md) for
[#379](https://github.com/odogono/mercenary/issues/379) — and masks it to twelve
bits before publishing it to `$7C88` and `$7A1A`:

```
0592AC  move.w    $60c2(a0), d0     ; a0 = 4 x body index
0592B0  andi.w    #$fff, d0
0592B4  move.w    d0, $7c88.w       ; the surface base colour
0592B8  move.w    d0, $7a1a.w       ; ... and the land colour, until an island record overrides it
```

What this note adds is the **consumer**: that value is the fill for a body's
surface wherever no island covers it, and an island record's `+8` word overrides
it for land.

It also answers the open decision in
[#382](https://github.com/odogono/mercenary/issues/382) about slot 29. `DAMOCLES`
is the one slot with a nonzero high word, `$0030E000`; the engine never reads the
high word, takes the low word `$E000`, and masks it to **`$000`**. Slot 29 is
black by the engine's own arithmetic, not an anomaly needing a policy.

Eris's `$003` is the clearest sea, but it is not alone in reading as water:
Dion's `$055` and the `$246` shared by Vesta, Thalia, Juno and Sapphire do too.
The engine draws no distinction — the base colour is simply whatever is not
island.

## Validation

- **All 32 captures** in `research/damocles-st/snapshots/` published a workspace
  origin (`$789A`/`$789E`) equal to a record in their body's list, and a land
  colour (`$7A1A`) equal to that record's `+8` word. 32 of 32 on both.
- **Nearest-record selection holds on every multi-record body in the capture
  set.** Thirteen captures stand on a body with 3, 5 or 12 records, and in every
  one the record the engine put in `$7894` is the nearest by origin — including
  Lucan, where the runner-up is 96 cells away against the winner's 4, and Dion,
  where it is 61 against 4.
- **The classifier agrees with the engine on 30 of 32 captures**, including
  every no-island body at `0`. The two that differ are `eris-transporter-11-8`
  and `vesta-transporter`, and both are stale rather than contrary: `$059302`
  arms `$78A6` to `$FFFF` at arrival, and only the disembark path at `$057D1A`
  and the in-vehicle frame path recompute it, so a pose reached by transporter
  and never left carries the arrival value. Two pieces of evidence settle it —
  `vesta-parliament-4-6` stands **0.04 cells** from `vesta-transporter`, in the
  same cell `$64`, and reads `0`; and driving a classifying pose to
  `eris-transporter-11-8`'s exact position gives `0`, which is what the
  recovered classifier predicts for both.

## Gaps

- **No live classification sweep off Eris.** The 115-point sweep behind the Eris
  note needs a pose whose frame path recomputes `$78A6`, and the only vehicle and
  flight captures in the set are on Eris. Other bodies are validated at one point
  each, by their arrival pose. A vehicle capture on Dion, Gaea, Lucan or
  Lachesis would close it, and the probe would need no change.
- **Shapes `E` and `F` are unlike anything on Eris** — 144 × 8 and 280 × 8
  slivers — and no capture stands on one. They decode cleanly and their boxes
  match their vertex bounds, but nothing confirms how they present.
- **Why some shapes are shared by pointer and others duplicated** is not
  recovered, and nothing in the record distinguishes the two cases.
- **The nearest-record metric** remains the open item the Eris note records.
  Every one of the thirteen selection checks matches a plain nearest-origin
  reading, and Lucan's ring is the tightest case at 4 against 96, but the exact
  distance function at `$056490` is still undecoded.
