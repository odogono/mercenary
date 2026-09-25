# Damocles sky Bodies: how a listed Body becomes pixels

Working-Authority Evidence for [#528](https://github.com/odogono/mercenary/issues/528),
recovered 2026-09-25. Authoritative Evidence remains bound to the C64 Reference Build.
This note records decoded ST facts only
([ADR 0002](../adr/0002-separate-rom-research-from-implementation.md)). The captures and
pinned frames stay ignored Restricted Material under `research/damocles-st/`.

[The Gamma System research](damocles-gamma-system.md#issue-181-range-draw-lists--confirmed-reader-primary-still-unresolved)
found the per-Body draw lists at `$00809C` and the two passes at `$0530C8..$0531BC` that
walk them. [#439](damocles-gamma-system.md#issue-439-body-rotation-and-orbit-stasis--confirmed)
found the sky angle pair `$042C6C`/`$042C70`, and
[the terminator note](damocles-day-night-terminator.md) found the day flag. This note
follows a listed Body from its centre to the pixels on screen. It gives a closed form, and
checks that closed form against 24 pinned Hatari frames from six poses in four clusters.

## Decision

- **A listed Body is a flat, horizontally stretched disc split by one vertical terminator
  ellipse.** Each row of the disc is split at `x_t = cx + w·cos φ`, where `w` is the row's
  half-width and `φ` is the phase angle at the Body between the eye and DIALIS. One side is
  filled in the Body's colour and the other in a shadow colour. That is exact orthographic
  phase rendering, except that the terminator's axis is always vertical on screen.
- **The shadow colour is the sky colour by day on a Body with an atmosphere, and black
  otherwise.** By day on METIS the unlit part vanishes into the sky, so ERIS reads as a
  crescent. At night, or on an airless Body, it is painted `$000` and shows as a black
  sliver against the night sky.
- **The eye is the Body's own centre, 64 units up.** The surface position enters only
  through the sky angles: longitude `$042C6C` (which carries the Body's turn) and latitude
  `$042C70`. Both rotate the sky, so **latitude does change a Body's elevation**.
- **Apparent radius is `size / depth` pixels, and positions are `256 · u / depth`.** So a
  Body is a sphere of radius `size / 256` System units. That closes #424's unit question:
  `$006040` holds 256 times the radius in the positional unit.
- **On foot, sky Bodies are cut at the horizon row, 68.** They are drawn after the stars,
  before the ground and the structures, and in draw-list order with no depth sort. DIALIS
  is a plain full disc. DAMOCLES is two white triangles: a tail from the head to a point
  at 1.25 times its distance from DIALIS.
- **The closed form matches the pinned frames to within a pixel.** Where the sky is not
  covered by a structure, 92,531 of 92,795 predicted Body pixels (99.7%) match the
  screenshot exactly. The misses are one-pixel rim and terminator steps, one `CRONUS`
  frame whose centre is a pixel off, and one METIS frame where black structure is
  indistinguishable from black shadow.

## Status

| Question | Status | Where |
| --- | --- | --- |
| `$04529C`: what the matrix is | **Confirmed** | [The transform](#the-transform) |
| `$042C2C..$042C38`: what they hold | **Confirmed**: rows 1 and 2 of the eye's view matrix `V` (`$042C20..$042C40`) | [The transform](#the-transform) |
| Does `$042C70` change a Body's elevation? | **Confirmed**, yes | [The transform](#the-transform) |
| `$0530C8..$0531BC`: transform and projection | **Confirmed** | [Projection](#projection) |
| Apparent-size rule, and #424's unit | **Confirmed**: `r = size / depth`, so radius = `size / 256` System units | [Apparent size and the #424 unit](#apparent-size-and-the-424-unit) |
| Lit fraction and its orientation | **Confirmed** | [The crescent](#the-crescent) |
| How the shape is rasterised | **Confirmed** | [The crescent](#the-crescent) |
| Lit and unlit colours | **Confirmed** | [Colours](#colours) |
| Order against stars, ground and structures | **Confirmed** on foot; the sky fill itself was not located | [Draw order and clipping](#draw-order-and-clipping) |
| How a Body meets the horizon | **Confirmed** on foot (hard cut at row 68); in flight, **Partially confirmed** (static only) | [Draw order and clipping](#draw-order-and-clipping) |
| Is DIALIS drawn as a disc? | **Confirmed**: a full disc, never phased | [DIALIS](#dialis) |
| Is DAMOCLES drawn through the same path? | **Partially confirmed**: the tail matches frames; the head disc colour is decoded statically and was never large enough to see | [DAMOCLES](#damocles) |
| Pinned oracle frames | **Confirmed**: 24 frames, 6 poses, 4 clusters | [Pinned frames](#pinned-frames) |

## Working Authority and evidence

| Item | Value |
| --- | --- |
| Program SHA-256 | `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef` |
| Static source | `observe-first-world-20260818T101013Z-c5a32b7d/observed.ram`, `b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967` |
| Probe | [`research/damocles-st/scripts/sky-body-probe.py`](../../research/damocles-st/scripts/sky-body-probe.py) (`capture`, `check`, `predict`) |
| Emulator | Hatari 2.6.1, `05723606c75a1f0642395974abdce2cbbe48b0a09a747f65cdfca7ef9201e11a` |

| Window | Role | SHA-256 |
| --- | --- | --- |
| `$05309A`–`$0530C7` | clip rows (`$042C74`) | `1cf3367aa47585fd0d4c228cdb40638bae9a8272351b45249bfb640b1353e139` |
| `$0530C8`–`$0531BD` | the two listed-Body passes | `29e44b20e006eceeb541be8a0c0683d6c8ba9543d5197a033544fab370eaa912` |
| `$05668A`–`$056BFD` | point transform and projection | `e18f9715781d38474d29d360f40344908633c7c0ba864049cf9ad3950af2e46f` |
| `$04529C`–`$04570F` | celestial matrix `M = V·R` | `92990b6876792b5e76b0a1551b0449d0dad6367d747efe34e21b05a4f4c6a554` |
| `$045710`–`$045915` | view matrix `V` | `831fa3c27fbdc6bdd9cf6b75d461ddbe8b12f94500c4db62786e34f8d65e3271` |
| `$055F60`–`$056047` | eye angle pairs | `c992c9a9cd82853c9df1ea6b94498406f417a2f358c717d99a04a8c82d5e78fb` |
| `$045916`–`$045A81` | disc rasteriser | `8cfd213af897114ae1e594f9943c5a55a3ca7c595a048ca4facf57795d0a141a` |
| `$045A82`–`$045B09` | span routine table (one per palette slot) | `2b6f17537682c31afefdd78634528f5f30ecdb190da95bf73d2530b4ac1deafd` |
| `$04FBAE`–`$04FD43` | disc and comet dispatch, comet geometry | `43fb7eda9e90110528cdb6e3975ecdf80c99b3a17356131d147928d3dc599022` |
| `$04FD44`–`$04FF55` | phase | `d6775319535d8ab1fcbdd422f3978c2b946b25f33f6f17bb945b1552a92cef73` |
| `$050562`–`$0505B5` | terminator and shadow slot | `f773b25a1d516aa25e4e3a27fcd1a4305720ef5df746c6ff51e6a7e48d373a26` |
| `$0597E2`–`$05985B` | surface pass order | `4e5b67d5fa487d13e16231cbaebc9b9f3ca5b606555adac355cf90fb89a4ec1b` |
| `$064000`–`$064FFF` | sine table | `79831644423f32a0412588a994c5249b12abd39ceb23dc3130de7440e97495a6` |
| `$044000`–`$0445FF` | row table (`−dy²` about `$04429C`) | `291632f66a2c2b48f2a8af8e4b15f87146050d101e44dcc088d90abf1e86d804` |

## The engine's arithmetic

Every quantity in this path is a **packed log-float**: a longword whose high word is a
signed binary exponent, and whose low word is a two's-complement mantissa with 1.0 at
`$1000`. It is the same form #424 decoded for `$006040`. A product is two log-table
lookups at `$64000 + mantissa` (the table spans `$62000..$65FFF`), a longword add that
carries into the exponent, and an antilog lookup at `$60000`. A sum is `$04BD34`, and an
integer becomes a float at `$04BDD8`. The float becomes a screen integer by an arithmetic
shift that adds the last bit shifted out, which is round-half-up. The log tables limit
precision to about three parts in 10⁴, which is why a few rows land a pixel away from a
float model.

The table at `$064000..$064FFF` sits in the hole the log table leaves around index 0. It
holds 1024 packed sines, `S(a) = sin((a + ½)·2π/1024)`. Cosine is `S(a + 256)`.

## The transform

Pass 1 at `$0530C8` loads the eye's System position from `$799A`/`$799E`/`$79A2`. For each
selector on the list at `$7918` it takes the Body centre minus the eye, converts each axis
with `$04BDD8`, and calls `$05668A` with `a4 = $042C44`. On a surface **the eye is the
current Body's centre with Y = 64**. That holds in every one of the 28 rehosted memstates.
A Body's sky position therefore has no parallax from where the player stands.

`$05668A` multiplies the offset by the 3×3 matrix at `a4` (row-major, packed floats). Row 0
is depth, row 1 is screen x and row 2 is screen y.

`$042C44..$042C64` is `M = V·R`, built by `$04529C` through the vector `$042D18`:

```text
lon = $042C6C = (stepX + (accumulator >> 16)) & $3FF      (#439)
lat = $042C70 = stepZ
        |  c(lon)          0        −s(lon)         |
R  =    | −s(lon)·s(lat)   c(lat)   −c(lon)·s(lat)  |
        |  s(lon)·c(lat)   s(lat)    c(lon)·c(lat)  |
```

`V` at `$042C20..$042C40` is the eye's view matrix. `$045710` builds it through `$042D14`
from the sine/cosine pairs that `$055F60` stores at `$042C08..$042C1C`: roll `$7A9E`,
pitch `$7AA0` and yaw `$7AA2`. So `$042C2C..$042C38`, which the issue asked about, are
`V`'s middle row and the first element of its last row.

```text
         | cp·sy             sp       cp·cy             |
V  =     | sr·sp·sy + cr·cy  −sr·cp   sr·sp·cy − cr·sy  |
         | sr·cy − cr·sp·sy   cr·cp   −(cr·sp·cy + sr·sy)|
(s·, c· = S(angle), S(angle + 256); r roll, p pitch, y yaw)
```

The same `V` draws the ground and the structures. Only the sky passes use `M`. The
latitude enters `R` directly, so **`$042C70` changes a Body's elevation**. The pinned frames
span latitudes 65 to 649 and agree with that.

Both matrices were checked against the stored words. The Python model matches `$042C20`
and `$042C44` to within 5·10⁻⁴ in 25 of the 28 rehosted memstates. The other three
(`eris-lift`, `eris-transporter-11-8`, `vesta-transporter`) were saved between the
latch update and the rebuild, so their stored matrix belongs to the previous angle.

### Projection

`$05668A` stores depth at `$840 + sel`, and camera x and y at `$340`/`$5C0 + sel`. If depth
is positive, it forms:

```text
sx = 160 − F·u/d        ($0568EE..$0569C4, F = 2^8 from $7964 = $00080000, into $0FC0 + sel)
sy =  68 + F·v/d        ($056B0A..$056BDE, into $0FC2 + sel)
```

The result is rounded half-up and saturated to a signed word. `$7964` is `$00080000` in all
28 memstates, so F = 256. An outcode against `0..$13F` and `0..$87` goes to `$1240 + sel`.
Pass 2 (`$05313A`) skips any Body whose depth is negative, except DAMOCLES (`sel = $74`).
`$04FBAE` then skips any Body with `sx` outside −16384..16383 (`cmpi.w #$4000` then
`bpl`, so the signed overflow skips large negative values too).

## Apparent size and the #424 unit

Pass 2 forms the radius in the log domain as `$006040(sel)` minus the depth:

```text
r = size / d            ($053162..$053176; size = mantissa/$1000 · 2^exponent, #424)
```

There is no focal term, and the rasteriser clamps `r` below 1024 (`$045928`). The position
of a point at distance ρ from the centre, seen side-on, is `256·ρ/d`. So the disc is the
projection of a sphere of radius **`size / 256` System units**. ERIS is 1,200 units and
VESTA 360, which sit 2,400 apart, so the #424 non-overlap bound (divisor > 166.4) holds.
DIALIS is 20,000 units, and THEON and AURORA are 40.

The pixel match of every pinned disc confirms `r = size / d`. The arrival test agrees with
the same unit. `$052FDA` does not subtract values: it subtracts the **exponent word** of
`$006040` from the exponent word of the nearest range `$791C`. It sets `$7A28` when the
difference is below −7, i.e. when range < size/128 = two radii, to a power of two. Earlier
text in the Gamma System note said this test "subtracts `$006040` from range". It
subtracts exponents.

## The crescent

`$04FBAE` receives the colour slot, `r`, and the rounded `sx`/`sy`. For every Body but
DIALIS it calls `$04FD44`, which works in the System XZ plane at the Body `B`, with
`E` the eye:

```text
v̂ = unit(E − B),  û = unit(DIALIS − B) = unit(−B)          (XZ components only)
cos φ = v̂·û            → $042C68, and C = round(cos φ · 2^15), saturated, → $042C04
cross = v̂x·ûz − v̂z·ûx  → $042C06 = NOT mantissa(cross)
```

When `cross ≥ 0`, `$042C06` is negative, and `$04FF4A` complements `C` (NOT, i.e.
`−C − 1`).

The rasteriser `$045916` (vector `$042D00`) then draws one row per scan line:

```text
R    = trunc(r)                         rows cy−R .. cy+R, clipped to [0, $042C74)
w(y) = trunc( sqrt(r² − (y−cy)²) / 0.84375 )     ($04429C table holds −dy²; $045A0C divides by $1B00)
x_t  = cx + floor(w·C / 2^15) + 1                ($045A52..$045A60)
fill [cx − w, x_t) with colour A, then [x_t, cx + w) with colour B
A, B = (lit, shadow) if cross < 0, else (shadow, lit)   ($0459CE swaps the slot words)
```

The half-width divisor 0.84375 widens every disc by 1/0.84375 ≈ 1.185 horizontally,
which corrects for the ST's non-square low-resolution pixels. The screen positions are
not corrected the same way. The fill runs through one of seventeen span routines at
`$045A82`, one per palette slot, patched into the `jsr` operands at `$045A68`/`$045A74`.

In words: **the disc is split by the vertical ellipse `x = cx + w(y)·cos φ`.** On the
side the cross product picks it is lit, and on the other it is in shadow. The lit
fraction is `(1 + cos φ)/2` of the disc's width on every row. The terminator's axis is
always vertical on screen, whatever the eye's roll or the direction to DIALIS on
screen, and φ ignores the small Y offsets because only XZ is used. A reimplementation
needs nothing beyond the four lines above.

### Colours

- **Lit**: the low word of `$0060C0 + sel` (#379). Pass 2 takes a slot for it in the
  16-entry palette list at `$7C18`: an equal entry if one exists, else the first free entry
  (`$8000`). If there is neither it uses slot 0. A negative colour word means the comet.
- **Shadow**: the palette slot in the high word of `$7AEA`. `$050562` writes `$0020` (slot
  8) by day when `$794D` is non-zero, and `$0000` (slot 0) otherwise. The surface pass
  loads slot 8 with the sky colour `$7C86` and slot 0 is `$000`. `$794D` is non-zero exactly
  on the Bodies whose sky pair (`$85DC + 4·body`) differs by day and night, in 28 of 28
  rehosted memstates: METIS 3, SOLON 3, THALIA 3, VESTA
  12, ERIS 36, TOLOSA 5, PERSEUS 7, and so on. It is zero on ACHERON, CRONUS, THEON, MIDAS
  and the other airless Bodies. So:

| Where | Unlit part drawn in | Looks like |
| --- | --- | --- |
| Day, atmosphere (`$794D ≠ 0`) | sky colour (slot 8) | a crescent or gibbous shape; the unlit part is invisible (issue frame 1, METIS) |
| Night, or any airless Body | `$000` (slot 0) | a full disc with a black part, visible against a dark but non-black sky (issue frame 2, THEON) |

## Draw order and clipping

The on-foot surface pass (`$0597E2`, taken when `$78A6 = 0` and `$7AAA ≠ 0`) runs:

1. Palette slots: 8 := sky `$7C86`, 13 := `$0432`, 14 := `$7AEE`, 15 := `$0654`, and the
   word after the list (`+$20`) := land `$7A1A`.
2. Stars at `$0505B8`. These are skipped by day when `$794D ≠ 0`, and drawn otherwise.
3. `$05309A`: the clip row limit `$042C74` is `$44` (row 68) when `$7AAA ≠ 0` and
   `$78A6 ≥ 0`, else `$88` (136). Then an optional `$04CFA4` when `$7834 ≠ 0` and
   `$7830 ≥ 0`, pass 1 (transform every listed Body), and pass 2 (draw them **in list
   order**).
4. Ground and islands (`$0560F2`), then structures and objects.

The other branch (`$78A6 ≠ 0`) uses the pitch-dependent starfield at `$0503FE`, the same
`$05309A`, then `$0599D6`.

Consequences, each seen in the pinned frames:

- **Bodies cover stars.** Stars are drawn first.
- **Structures and the ground cover Bodies.** In every frame where a predicted Body pixel
  shows something other than its own colour or the sky, the pixel belongs to a building.
  The overlays show this for SOLON, TOLOSA and THEON.
- **On foot the horizon is a hard cut at row 68.** The eye's pitch is 511 in every
  on-foot capture, which puts the horizon on the centre row, and pass 2 never draws below
  it. ERIS is cut flat at row 68 in the THEON frames, as it is at the horizon in issue
  frame 1.
- **List order, not depth.** For the ERIS cluster the list is DIALIS, DAMOCLES, then the
  moons in slot order, and a later entry overwrites an earlier one. On THEON, METIS (8 px)
  is drawn on top of ERIS.
- In flight (`$042C74 = $88`) Bodies may draw to row 136 and the ground covers them later.
  That is static reading only.

The sky background fill was not located in this work. The surface under the Bodies and
stars always shows palette slot 8.

## DIALIS

`$04FBAE` tests `a0 = 0` (DIALIS) and skips `$04FD44`. It stores `$7FFF0000` in `$042C04`,
so `C = $7FFF` and `$042C06 = 0`. The colours are not swapped, and the split lands at
`cx + w`, so the second span is empty. The result is a **full disc in its own colour
`$777`**. The MIDAS frames match it pixel for pixel (1,948, 2,206 and 2,098 of
the same number of pixels), including the horizon cut.

## DAMOCLES

The comet's colour word is `$E000`, which is negative. Pass 2 skips the palette lookup, and
`$04FBAE` takes the comet branch at `$04FBF2`:

- Five points are projected through `$05668A` into slots `$80..$90`. The first is the
  **tail tip**, at `X_d + X_d/4`, `Y = 0`, `Z_d + Z_d/4`. That is 1.25 times the comet's
  centre, directly away from DIALIS. When `$7A82 ≠ 0` the quarter is taken from ERIS's
  X/Z instead (`$5F6C`/`$5FEC`); `$7A82` is 0 in every capture. The other four are
  **head points** at the comet centre ±250 in Y and ±250 in X (the table at `$04FD12`).
  In space (`$7A8E = 2`) they go through `V` alone, not `M`.
- `$04F8FE` draws four polygons from `$04FD2C`. Each has colour `$0777`, and they form two
  double-sided triangles: tip, head+Y, head−Y, and tip, head−X, head+X. On foot the
  polygon fill limit `$04FB1C` is patched from `$D500` (row 136) to `$AA80` (row 68), so
  the tail is cut at the horizon too.
- Finally, if the head's depth is positive, it draws a disc through `$042D00` with slot
  word `$00300000`. Outside space it also sets `$042C04 = $7FFF0000`. As for DIALIS, the
  split then lands at `cx + w`: the slot-12 span is empty, and the whole head is slot 0,
  i.e. **black**. The head radius `size/d` is below one pixel at every range reached, so
  this is **not verified**.

At the ranges seen from a surface (250,000 units and more), the head points collapse to
under a pixel, and the comet is a thin white streak from the head towards the tail tip.
Three MIDAS frames match the predicted ends to within a pixel:

| Frame | Predicted head | Predicted tip | Streak on screen |
| --- | --- | --- | --- |
| lon 696 | (199.6, 24.0) | (211.5, 14.9) | (199, 24) … (212, 15) |
| lon 704 | (189.2, 31.9) | (200.8, 23.0) | (190, 31) … (201, 23) |

## The closed form

Given the pose (eye angles `$7A9E`/`$7AA0`/`$7AA2`, Body Coordinate steps, and the Body turn)
and the recovered centres, sizes and colours:

```text
E        = own centre + (0, 64, 0)
lon, lat = (stepX + (turn >> 16)) & $3FF, stepZ
(d, u, v) = V(roll, pitch, yaw) · R(lon, lat) · (P − E)        (draw iff d > 0)
cx = ⌊160 − 256·u/d + ½⌋,   cy = ⌊68 + 256·v/d + ½⌋,   r = size/d
rows cy − ⌊r⌋ … cy + ⌊r⌋ within [0, 68) on foot (else [0, 136))
w(y) = ⌊√(r² − (y−cy)²) / 0.84375⌋
cos φ, cross from the XZ unit vectors B→E and B→DIALIS;  C = round(2^15 cos φ)
cross < 0: [cx−w, cx + ⌊wC/2^15⌋ + 1) lit, rest shadow
cross ≥ 0: C' = −C − 1; [cx−w, cx + ⌊wC'/2^15⌋ + 1) shadow, rest lit
lit = colour(Body), shadow = sky colour if (day and $794D ≠ 0) else $000
draw the list in order, then the ground and structures over it
```

`predict()` and `raster()` in the probe implement exactly this, from the RAM alone.

## Pinned frames

Each frame comes from a fresh boot of the rehosted memstate. The probe zeroes the current
Body's rate `$00835C + sel`, pokes its accumulator so that `$042C6C` lands on the requested
value, lets the game draw for a second, and then saves the whole 1 MiB of RAM and a
screenshot. A fresh boot per frame matters: on airless Bodies the player suffocates a few
seconds after the restore, and the death fade ruins every later frame. `check` rejects a
frame whose latch is stale, whose pause gate is set, or whose sky colour is missing from
the screen.

**Visible** means predicted pixels not covered by a structure, and **off** means visible
pixels whose colour differs.

| Run | Pose | `$042C6C` | Day | Body (r px, cos φ) | Predicted | Visible | Off |
| --- | --- | ---: | --- | --- | ---: | ---: | ---: |
| `sky-body-20260925T130845Z-2434a6d2` | METIS | 768 | night | ERIS (44.0, −0.85) | 1,610 | 1,573 | 106¹ |
| | | 832 | night | ERIS (43.3, −0.85) | 1,724 | 1,686 | 0 |
| | | 896 | night | ERIS (50.2, −0.85) | 1,547 | 1,547 | 0 |
| | | 960 | night | none on screen | — | — | — |
| `sky-body-20260925T130958Z-eadd9472` | THEON | 448 | night | ERIS (55.0, 0.91) / SOLON (7.3) / METIS (1.8) | 7,842 | 3,219 | 5 |
| | | 464 | night | ERIS / SOLON / METIS | 7,900 | 4,314 | 1 |
| | | 480 | night | ERIS (51.8) / METIS; VESTA hidden | 7,960 | 5,221 | 4 |
| | | 496 | night | ERIS (51.0) / METIS; VESTA hidden | 7,664 | 5,883 | 0 |
| `sky-body-20260925T131108Z-1814f2ca` | CRONUS | 496 | night | GAEA (57.8, 0.78) / CYCLOPES (9.0) | 8,480 | 8,480 | 124² |
| | | 512 | night | GAEA (58.7) / CYCLOPES (9.2) | 8,794 | 8,794 | 7 |
| | | 528 | night | GAEA (60.3) / CYCLOPES (9.5) | 9,096 | 9,096 | 10 |
| | | 544 | night | GAEA (62.5) / CYCLOPES (9.9) | 8,489 | 8,487 | 6 |
| `sky-body-20260925T131257Z-b184b70b` | TOLOSA | 608 | day | JUNO (92.1, 0.95) | 12,290 | 2,045 | 0 |
| | | 624 | day | JUNO (89.4) | 13,422 | 2,044 | 0 |
| | | 640 | day | JUNO (87.6) | 12,960 | 1,212 | 1 |
| `sky-body-20260925T131419Z-2ce2f131` | MIDAS | 640 | day | DIALIS (25.2) | 1,948 | 1,948 | 0 |
| | | 656 | day | DIALIS (24.6) | 2,206 | 2,206 | 0 |
| | | 672 | day | DIALIS (24.3) | 2,098 | 2,098 | 0 |
| `sky-body-20260925T131540Z-de02deb1` | SOLON | 784 | night | ERIS (148.1, 0.89); VESTA hidden | 15,528 | 6,511 | 0 |
| | | 800 | night | ERIS (146.7) | 16,662 | 7,645 | 0 |
| | | 816 | night | ERIS (146.7) | 17,568 | 8,786 | 0 |
| `sky-body-20260925T131744Z-913722ee` | MIDAS | 688, 696, 704 | day | DAMOCLES tail | — | — | ends within 1 px |

¹ ERIS's lit sliver lies behind a black structure panel. The check cannot tell black
structure from black sky, so it counts those pixels as off.
² A one-pixel horizontal shift of GAEA's centre: the rounding of a log-domain `sx` near
`.5`.

Frame SHA-256s are in each run's `result.json`.

## Reproduce

From the repository root, with the lab symlinks in place (`roms`, the venv, and the rehosted
memstates):

```sh
P=research/damocles-st/scripts/sky-body-probe.py
PY=research/damocles-st/.venv/bin/python
$PY $P capture --snapshot research/damocles-st/snapshots/rehosted/metis-transporter.sav --longitudes 768,832,896
$PY $P capture --snapshot research/damocles-st/snapshots/rehosted/theon.sav  --longitudes 448,464,480,496
$PY $P capture --snapshot research/damocles-st/snapshots/rehosted/cronus.sav --longitudes 496,512,528,544
$PY $P capture --snapshot research/damocles-st/snapshots/rehosted/tolosa.sav --longitudes 608,624,640
$PY $P capture --snapshot research/damocles-st/snapshots/rehosted/midas.sav  --longitudes 640,656,672
$PY $P capture --snapshot research/damocles-st/snapshots/rehosted/solon.sav  --longitudes 784,800,816
$PY $P check --run research/damocles-st/work/sky-body-<id>
$PY $P predict --ram research/damocles-st/work/sky-body-<id>/lon0696.ram   # comet head and tail
```

Read the code windows above from `observed.ram` with Capstone (the lab venv has it).

## Not settled

- **The sky background fill** was not found. The frames only show that the area under
  the Bodies is palette slot 8.
- **The comet head disc** colour (black, slot 0, with an empty slot-12 span) is a literal
  reading of `$04FCE6`. The disc was never a pixel wide in any frame.
- **In-flight and space views** (`$042C74 = $88`, and `$7A8E = 2` using `V` alone) are
  static reading only. The all-body scan `$052DB0` that the space branch uses was not
  re-checked here.
- **`$04CFA4`**, called from `$05309A` when `$7834 ≠ 0` and `$7830 ≥ 0`, was not read.
  `$7830` is `$002C` (ERIS) in four captures, all with `$7834 = 0`.
- **The port does not draw sky Bodies yet.** Implementing them, and publishing
  `radius = size / 256` in `payload/damocles/system.json`'s coverage text, are follow-ups.
