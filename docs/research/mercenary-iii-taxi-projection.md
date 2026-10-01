# Mercenary III: projection, clipping, fill and face order in the taxi slice

Research for [#644](https://github.com/odogono/mercenary/issues/644), 2026-10-01, commissioned by [D1](mercenary-iii-taxi-milestone-review.md) (#638, item 5). It replaces the approximate focal overlays of [R2](mercenary-iii-taxi-content-presentation.md) with recovered rules. The authority is the pinned **Mercenary III research baseline** of R1–R4, not Damocles **Working Authority**. Original media, RAM, disassembly, screenshots and comparison images stay ignored Restricted Material under `restricted/mercenary-iii-644/`, following [ADR 0002](../adr/0002-separate-rom-research-from-implementation.md). No application, runtime, Data Payload, payload schema or Save format change is made.

## Outcome

1. **Projection is recovered, and a plain floating-point model reproduces it.** Every vertex goes through `$57730`. It forms camera-relative depth `d` and lateral terms `u`, `v`, then:

   ```text
   sx = 160 − 256·u/d        sy = 68 + 256·v/d
   ```

   The viewport is 320×136, centred at (160, 68). The focal factor is exactly 2^8, from the exponent of `$6FF4`. R2's "about 256–281" is now **256**. Throughout the slice the camera is level, so `d = −(s·x + c·z)`, `u = c·x − s·z`, `v = −y`. Here (x,y,z) is the world point minus the eye (`$7126`/`$70C6`/`$712E`), and s, c are the sine and cosine of the view yaw taken at a **half step**. A double-precision model of this matches 7,172 projected coordinates from 13 checkpoints. On-screen points are within 0.71 px, and most round to the same pixel. The exceptions are off-screen points beyond ±32,767, which the game saturates, and one depth-cancellation case far off screen.
2. **Clipping is recovered and independently reproduced.** The game uses no near plane at a positive distance. An edge that crosses behind the eye is handled as its projected ray to infinity, which is the limit of clipping at depth 0⁺. The screen rectangle is clipped at half-pixel boundaries (−0.5, 319.5, −0.5, 135.5). Screen corners are inserted where the outline wraps a corner. A homogeneous clip at a tiny positive depth, followed by an ordinary rectangle clip, reproduces the game's clipped outline within 0.87 px on all 715 filled polygons compared. 99 of those polygons cross behind the eye.
3. **Fill is solid and convex, and faces are culled by winding.** Every polygon fills with one flat palette index. There is no dithering, stipple or shading. Model, detail, glyph and plan faces are culled unless they are **clockwise on screen** (y down); only the horizon and ground fill skip the test. The decision used **integer** screen coordinates on every one of 909 compared culled polygons of nonzero area. 736 of them have every vertex in front and 173 cross behind the eye. Polygons of zero integer area are decided by a log-slope tolerance that this report does not recover (a float-winding rule agrees on 80%).
4. **Face order is authored order, with no depth sort inside a model.** A model draws exactly one face list, chosen by where the viewer is relative to the model's origin. It draws that list in stream order. The taxi has a single 30-face list. Models are painted far-to-near by a sorted key. The occupied structure takes its place in that order. Residents bound to the structure's regions are drawn **inside** the plan/detail pass, at hook points in its queue. In the prison, therefore, the cobweb and item 10 are drawn after the room.
5. **Comparison with screenshots.** The logged clipped polygons were filled with the recovered rule. This colour-consistently covers 99.6–99.97% of pixels at eleven of thirteen checkpoints. The prison room scores 94.8–94.9%: its floor and ceiling rows next to horizontal edges differ, and the black horizon line is drawn separately. These residues are **raster** differences, not geometry, and D1 waives exact ST rasterisation.

This closes the projection gate for the bounded slice. It does not implement or demonstrate a browser comparison. Lettering ([#643](mercenary-iii-taxi-lettering.md)) and the prison door ([#645](mercenary-iii-prison-door.md)) have their own reports; the sky, stars and horizon (#646) remain separate. Sky Bodies use the general matrix path and belong to #646.

## Baseline and method

The pins are R1–R4's:
- STX SHA-256 `4e8b74122910bcaa109b944eebb6f0ec18fdeb1175c34eea3c932d0e1b18b62c`
- EmuTOS `emutos206.img` `154803e3ff4851f3dc358b91b16d6b6110d187a81d8132ecb665af49878939d5`
- Hatari 2.6.1 Mach-O `05723606c75a1f0642395974abdce2cbbe48b0a09a747f65cdfca7ef9201e11a`

All three were verified before every run. Static slices are hashed from R1's loaded-play RAM, SHA-256 `94a107412037ce7972a605bfa1355e9fc9751373922df7fbd987d9ff94f1a8ec`. Runtime evidence comes from **unpatched cold boots** with the [integration machine configuration](mercenary-iii-integration.md#cold-boot-and-controlled-probes) and R2's journey input schedule. That boot runs at 60 Hz. Projection, clipping, fill and order are per-frame geometry, so they are independent of the frame rate and cadence that ADR 0058 settles.

**Method.** First, the readers were decoded statically from the loaded RAM. Then, for each checkpoint, a fresh cold boot installed persistent `:trace :quiet` PC breakpoints for a 30-VBL window (two or three main-loop frames) and logged the following:

| Breakpoint | Logged |
|---|---|
| `$57730` entry | VBL, D3/D4/D5 (camera-relative X/Y/Z as log-floats), A0 (vertex slot), `$42C18..$42C1F`, `$7122`, `$6FF4` |
| `$57BC6`, `$57CBA`, `$57F1C`, `$5800E` (the four returns) | A0 and the slot's `$340`/`$5C0`/`$840`/`$AC0`/`$D40`/`$FC0`/`$1240` entries |
| `$4FEC2` (polygon entry) | A0 (selector stream), D0 (vertex bank), colour `$719E`, cull switch `$4FE1E` |
| `$4FF10` (fill start) | count `$4FE10` and the clipped point list at `$AF18` |
| `$5873C`, `$545AE`, `$54D24`, `$5B72C` | line primitives, model draws, detail and plan entry, with return addresses |
| `$5A41A` (loop top) | VBL, the eye, view yaw `$7136`, `$6FF4`, matrices, cell, region and flags |

Screenshots were taken at +10, +20 and +30 VBL. The 3D view is the 320×136 area at (+96, +58), doubled.

Each callback starts with a unique marker value, so the log parses unambiguously. A double-precision model, written from the rules below and not from the code, was compared with every logged vertex. A Sutherland–Hodgman clip, with a homogeneous near clip, was compared with every logged clipped polygon. The logged polygons were then filled in order and compared with the screenshot whose frame matched best.

| Checkpoint | Route, VBL | Cell, region | View |
|---|---|---|---|
| Opening | solicitor, 5900 | `$62`, 1 (room) | prison interior, doorway, waiting street |
| Exterior | solicitor, 9500 | `$62`, 1 | waiting taxi, mailbox and letter through the doorway |
| Approach | solicitor, 10300 | `$62`, 3 | walking through the door region |
| Cabin | solicitor, 10800 | `$62`, 3 | passenger form and driver, stationary |
| Departure | solicitor, 12300 | `$62`, 3 | lift-off |
| Travel | solicitor, 12900 | `$61`, 1 | road cell with nine street-furniture slots |
| Arrival | solicitor, 13600 | `$60`, 12 | solicitor arrival |
| Exit | solicitor, 22600 | `$60`, 12 | on foot after L |
| Turn 1 | spaceport, 14800 | `$10`, 12 | first frames after the `$0000` → `$0300` turn |
| Cell (1,1) | spaceport, 15000 | `$11`, 18 | alias 149 (detail 59) |
| Turn 2 | spaceport, 16800 | `$04`, 12 | after the turn to `$0100` |
| Cell (3,0) | spaceport, 17000 | `$03`, 20 | detail 59 with the animated sign |
| Arrival | spaceport, 19000 | `$02`, 6 | spaceport arrival |

## Recovered rules

Addresses are hexadecimal; ranges are half-open, and words are big-endian. Labels are analytical descriptions, not original symbols. **Demonstrated** means the structure was decoded and the runtime corroborates it. **Plausible** means decoded but not exercised by a capture.

### Numbers

Coordinates enter the transform as **log-floats**, the format the Damocles notes describe. MIII's readers and tables are its own:
- **Format.** A long: the high word is a signed exponent, the low word a signed mantissa in units of `$1000`. The value is `m/4096 · 2^e`.
- **Products.** These are table additions: log table at `a5 = $64000`, exponent table at `a6 = $60000`.
- **Conversion.** `$4BDD4` converts integers (sign-extended from 28 bits); `$4BDC6` converts words. The precision is a 12-bit mantissa, with a relative error of about 2·10⁻⁴.

A reimplementation should use ordinary floating point. The log arithmetic is the only source of the sub-pixel deviations measured below.

### View basis (demonstrated)

`$57016` takes sine and cosine from a 1,024-entry log-float table at `$64000 + 4·a`.

- **Half step.** Entry `a` is `sin(2π(a + ½)/1024)` (max relative error 2.2·10⁻⁴), and the cosine is entry `a + $100`. The table never returns zero.
- **Angles.** Angle words are 1,024 per turn; `$100` is a quarter turn.
- **Matrices.** Pitch `$7132` and roll `$7134` feed the general 3×3 matrix at `$42C20`. View yaw `$7136` gives s → `$42C18` and c → `$42C1C`.

**Level path.** `$57730` uses the level path when `$7122` = 1 or `$7124` < 0. In every captured frame `$7122` = 1, `$7124` = `$FFFF`, `$7132` = 0, `$7136` = player heading `$7156` and `$6FF4` = `$00080000`. The level path computes:

```text
d = −(s·x + c·z)      u = c·x − s·z      v = −y
```

**Orientation.** At heading 0 the view faces −Z, and +X is screen left. At `$0100` the view faces −X, the solicitor route's direction of travel.

**Half-step consequence.** At heading 0 a point straight ahead projects to sx ≈ 159.2, not 160. That is a deliberate fixed yaw offset of 1/2048 turn, and a faithful port reproduces it by taking the half step.

**Eye.** The eye is the player position itself, `$7126`/`$70C6`/`$712E` = `$7146`/`$714A`/`$714E` in every capture. Y is up. The eye stands at Y 63 on foot and in the waiting or descending cabin, and at Y 88 at cruise. The ground is at Y 0.

**General matrix (plausible for this slice).** Otherwise the general path applies `$42C20` row by row: depth, u, v. The sky-Body pass enters at `$57748` with its own matrix pointer. That is about 36 calls per frame on foot, and #646 owns it.

### Projection and outcode (demonstrated)

If `d`'s mantissa is negative (behind), the slot's outcode byte `$1240` is `$80` and no screen point is formed. Otherwise:
- **Screen point.** `sx = 160 − 2^E·u/d` and `sy = 68 + 2^E·v/d`, with E = 8. The 160 and 68 are the log-float constants `$71400` and `$61100`. Each is converted to an integer rounding half up, and saturates to `$7FFF`/`$8000` when the exponent exceeds 14.
- **Slot layout.** Per vertex slot A0 (stride 4, a low-RAM workspace): `$840` d, `$340` u, `$5C0` v, `$AC0`/`$D40` float sx/sy, `$FC0` integer (sx, sy).
- **Outcode.** The index is +1 if sx ≥ 320 unsigned (+4 more if negative) and +2 if sy ≥ 136 unsigned (+8 more if negative). The byte is `$77DA[index]` = `00 08 11 1D 20 2A 30 3E 40 48 53 5C 60 68 70 7F`. Its low three bits are a region number: 0 right, 1 bottom, 2 left, 3 top, 4–7 the corners TR, BR, BL, TL. Bits 3–6 are x-out, y-out, x < 0 and y < 0.

**Runtime check.** Over 13 checkpoints:
- 7,172 logged coordinates from 3,523 paired calls agree with the double-precision model. 3,089 on-screen or near-screen points (within one screen width or height of the viewport) are within **0.71 px**. 3,021 of those (97.8%) round to exactly the logged pixel.
- 124 coordinates are saturated values.
- One coordinate is off by 0.4% at depth 19 with |z| = 327,552. Log-float cancellation causes it, far off screen.
- Every outcode matches the rule.
- Every `$80` outcode corresponds to a non-positive model depth.

### Vertex sources for models (demonstrated)

A model's vertex stream follows its header operations. Each vertex is three signed bytes, or a `$80` byte, word alignment and three signed words; the stream ends with a `$8000` word. Vertex k (from 1) occupies slot 4k. Slot 0 is the model origin.

The camera-relative input is `rotated(local) + (resident position − eye)`. The resident position is `$581C`/`$5C1C`/`$601C` + 4·slot. The rotation mode byte `$543AA` comes from the header:

| Mode | Rotation |
|---|---|
| 0 | none |
| bit 7 | articulated: vertices with negative Y rotate about the pivot `$543A4..$543A9`, around the axis `$543A2` selects, by angle `$6F38` or `$6E96` |
| bit 6 | yaw by `$543A0` = resident yaw byte `$6C1C` + 4·slot plus the header's offset, 256 steps per turn |
| others | full pitch/yaw/roll by `$7152`, `$7154`+`$200`, `$7156`+`$200`, i.e. view-fixed |

Bit 5 scales local coordinates by 16.

**Rotation arithmetic.** Rotation uses the Q15 sine table at `$7E4A` (cosine at +`$80`). For yaw it is `x' = x·cos + z·sin` and `z' = z·cos − x·sin`. The multiply keeps the high word of the product, doubled, so results are even and truncated. This is exact integer arithmetic, separate from the log-float projection.

### Clipping (demonstrated)

The polygon entry `$4FEC2` reads vertex selector bytes, ending with 0. Each byte is a slot address within bank D0 (`$000`, `$100` for detail, `$200` for glyphs). For each edge, the clipper `$4F36A` emits screen points into `$AF18`. The close step `$4F840` finishes the outline.

- **Inside edges.** Visible vertices are emitted as their integer projections.
- **Screen edges.** An edge leaving or entering the rectangle is intersected at the half-pixel lines x = −0.5 or 319.5 and y = −0.5 or 135.5. The point is rounded half up and emitted on the boundary pixel: 0, 319, 0 or 135. Values −1, 320 and 136 never appear.
- **Corners.** Where the outline passes around a screen corner, that corner is inserted as (319,0), (319,135), (0,135) or (0,0). An edge whose line leaves the whole screen on the outside drops the polygon. The corner logic assumes clockwise, convex polygons.
- **Behind the eye.** No intersection with a plane at positive depth is computed. For an edge from a visible P1 (d1 > 0) to a behind P2 (d2 < 0), `$4F986` takes the screen direction of the edge as it approaches depth 0:

  ```text
  dx = (d2/d1)·u1 − u2        dy = v2 − (d2/d1)·v1
  ```

  The outline follows that ray from P1 to the screen boundary. Between an exit ray and the next entry ray it adds the corners the rays enclose. Edges with both ends behind emit nothing. This is projectively the same as clipping at depth ε → 0⁺.

**Runtime check.**
- The independent model clips each polygon in homogeneous (u, v, d) at d = 10⁻³, projects, and clips to [−0.5, 319.5] × [−0.5, 135.5] with Sutherland–Hodgman. Over 715 filled polygons it matches the logged outline within a Hausdorff distance of **0.87 px**. 616 of them have every vertex in front and 99 cross behind the eye.
- Polygons with every vertex behind are never filled (1,702).
- The clipping depth is not critical: any ε that is small compared with the geometry gives the same screen outline. A port may use a conventional near plane at a small distance (for example 1 unit) only if it accepts differences for geometry within that distance of the eye.

### Back-face cull (demonstrated)

`$4F30A` classifies each emitted edge's screen direction by quadrant and turn. A left turn (counter-clockwise with y down) drops the polygon. A right turn accepts it, and testing stops. Edges within a log-slope tolerance count as straight, and a polygon with only straight turns is drawn. Rays to behind vertices use their ray direction.

The test is on unless the entry sets `$4FE1E` = `$FFFF`:

| Entry | Cull | Bank | Callers |
|---|---|---|---|
| `$4FE68` | on | `$000`, colour from `$2EA40` | model faces |
| `$4FE7C` | on | `$200` | glyph strokes |
| `$4FE90` | on | `$100` | detail polygons |
| `$4FEAC` | on | `$000` | plan quads (`$5BE74`, `$5C094`) and `$5026C..$50278` |
| `$4FEA0` | **off** | `$000` | `$57696`, `$5771E` (horizon and ground fill, #646) |

**Runtime check.**
- With the cull on, the prediction "drawn iff the integer screen polygon's shoelace area is ≥ 0 (clockwise, y down)" matched every polygon of nonzero integer area: 736 with every vertex in front, and 173 crossing behind.
- 313 polygons have zero integer area: far slivers one pixel wide. The game draws 170 of them, and the float-winding sign predicts 250 of 313 (80%). The exact tolerance (log slope differences within `>>6`) is not recovered, so this case is **unsupported** as a pixel-exact rule (see [gaps](#unsupported-cases-and-remaining-gaps)).
- With the cull off, every polygon whose clipped outline was non-empty was drawn (134), and none of the 40 with an empty outline.

### Fill (demonstrated, rasterisation approximate)

`$4FF10` requires at least three points. It fills a **convex** scanline polygon in one palette index, using 16.16 edge stepping from the topmost vertex, with left and right chains. Drawing is limited to the 136 view rows; the stop address is row 136, or row 68 when `$42C74` ≠ `$88`, which is `$44` in the slice. The 16 span routines at `$45B2C..$469A8` are solid fills. Plane p is set when bit p of the index is set, so there is no dithering or stipple.

**Colour.** The word is `$719E`:
- **Bit 15 clear:** a literal ST `$0RGB` colour, allocated in the 16-entry frame palette shadow at `[$72B4]`. The shadow is searched from slot 15 down: a match is reused, a free slot (`$8000`) is claimed, and a full palette falls back to index 0.
- **`$80nn`, nn < `$80`:** direct palette index nn.
- **`$80nn`, nn ≥ `$80`:** indirection through the table at `[$70A4]` + (nn & `$7E`), resolved again. This is the scene palette.

Model colours come from `$2EA40` + 2·index.

**Rows (static reading).**
- **Top vertex.** The fill starts at the minimum-y vertex. On a tie, the later vertex in the list wins.
- **Chains.** The right chain walks the list forward and the left chain walks it backward.
- **Sloped edges.** These step x in 16.16 fixed point with +`$7FFF` rounding. Each row takes the left chain's minimum x and the right chain's maximum x over the band [y − ½, y + ½]. Each edge covers rows y_top … y_bottom − 1, and after the chains meet one final row is drawn at y_max.
- **Horizontal edges.** These use up no rows; they move the chain's x to the new vertex.
- **Skipped and abandoned rows.** A row with R − L of −1 or −2 is skipped, and one below −2 abandons the polygon.

**Unresolved residue.** A register-level simulation of `$4FF10..$50156` fills row 18 of the prison ceiling and row 85 of the prison floor. The framebuffer itself, dumped at the next loop top (not only the screenshot), holds index 0 there. The doorway sill's horizontal top row is filled, as simulated. The cause lies outside the fill arithmetic as read, and is unresolved. Candidates are a rewrite of the `$AF18` list after the logged copy, a frame-local patch of the row limit, or a later index-0 write. This is the main pixel-raster residue below. A reimplementation that fills pixel centres inside the clipped outline differs only at such edge rows and columns.

### Model face lists and in-model order (demonstrated)

After the vertex terminator, a model holds one or more **alternatives**:
- **Selection.** Each alternative is a word length plus six longs (X, Y, Z minimum and size), then a face list. Alternative i is drawn if `(resident − eye) − min < size` unsigned on all three axes. That is, the model's origin, seen from the eye, lies inside the box. Otherwise the reader skips the length.
- **Default.** A zero length marks the last alternative, which is always drawn. Exactly one face list is drawn per model, so the viewer position selects visibility.

| Byte | Meaning |
|---|---|
| `$00..$7F` | colour index, then vertex selectors, ending with 0; a polygon via `$4FE68` |
| `$FC..$80` | colour index (`$FF` − byte − 3), then two selectors; a line via `$5873C` |
| `$FE` | inline text record via `$55050` (lettering, #643) |
| `$FD` | records the model as drawn (`$6F32` ← `$71D8`) and ends the list |
| `$FF` | ends the list |

**Order.** Within a list, primitives are drawn **in stream order**, and later primitives overwrite earlier ones. There is no depth sort or z-test. The back-face cull is the only per-face visibility test.

**Runtime check.** All 2,572 successive model polygons logged under a model draw had increasing stream addresses. The nine exceptions were plan quads interleaved through an occupant hook in the prison (next section).

**The taxi** (model 318, `$2FA60`) has 32 vertices (x ±75, y 0..62, z ±150) and a single default list of 30 faces, so its visibility is by cull and authored order alone.

**Model range.** `$5532E` skips a model whose camera-relative offset exceeds `$543AC`·65,536 on any axis. The header operation `$800C` sets that limit; the default is 1. The header operation `$800B` instead draws it as a single dot in colour `$2EA40[7]`.

### Header operations needed by the slice (demonstrated where named)

The first word of a record that is ≤ `$800F` is a header operation; its low nibble is the operation number.

| Operation | Effect |
|---|---|
| `$8001` | rotation mode and axis/offset bytes; yaw = resident yaw + offset (slot 10 forced to mode 1); with bit 7, pivot and articulation |
| `$8002`, `$8007` | set the lettering character `$B2DE` from the slot |
| `$8003`, `$800A` | self-modify one model byte. `$8003` chooses a variant from `$64BE`, `$64C2` and `$7180` (blinking beacons) |
| `$8008` | `$B300` ← word |
| `$8009` | skip the following block while `$70F6` ≠ 0 |
| `$800B`, `$800C` | dot mode; range limit |
| `$800D` | **passenger form**: when 4·slot = `$6EB2`, set `$B346` from `$6DA0`, draw the alternate record at the word offset camera-relative at (0, −63, 0) with ×16 view-fixed rotation, then draw the driver head from `$6ECE` (+2 for the profile while `$7272`/`$6EA4` or the message state say so). Otherwise skip the offset and draw the exterior |
| `$800E` | skip by a relative word |

**Cabin is view-fixed (runtime check).** The taxi's filled polygons are byte-identical across the cabin, departure, travel and cell (3,0) checkpoints: 13 polygons. They differ only where the driver head variant changes (turn 1, turn 2, spaceport arrival).

### Painter's order between objects (demonstrated)

**Drawn list.** `$54182` builds one entry per drawn slot: the cell-bound slots, then the fixed list `$7422` (`0, 220, 219, 181, 165, 16, 13, 3`).
- **Key.** The key is the log-float distance `sqrt(dx² + dy² + dz²)` from the eye. The priority byte from the table `$542BC` is added to its top byte.
- **Priority.** The priority index is the resident's type byte (`$641F`) if its location byte (`$681F`) is the current cell, else `$51`. Type 4 adds `$80` to the exponent (strongly far) unless it is above the eye.
- **Sort.** The list is bubble-sorted descending and drawn **far to near**.

**Runtime check.** Every logged frame drew its models in non-increasing key order.

**The structure.** Slot 0 is the occupied structure, placed in the order at its own key. Its drawing order depends on the camera mode and the region flags `$71CC` (byte bits 6 and 4). In the slice:

| Region flags | Observed order | Code path |
|---|---|---|
| `$8000`: prison room (region 1) | detail, then plan; the plan's queue hook draws its occupants (cobweb 124, item 10) **after** the room | `$54390` → `$54D24`, then `$5B72C`, and `$5B7EE` → `$54142` |
| `$D000`: prison street, door region 3 | detail, then plan | `$54382` |
| `$C000`: every street cell | plan, then detail | `$54374` |

The plan queue at `$4370` holds long entries. Positive entries are primitives. Negative entries with bit 30 set are **occupant hooks**: the following bytes are resident slots, which are sorted by the same key and drawn at that point in the queue. The detail pass has the same hook (`$54F18`). Residents bound to a region are therefore painted interleaved with the building, not by distance alone. For a camera that is not level, or with `$718E` < 0, only the detail is drawn (plausible; not exercised).

The frame order is `$55E58`/`$50B10` (night and stars, when `$718E` < 0), then `$55D7E`, `$576A2` (sky, ground and horizon, #646), then the drawn list (`$5A652..$5A684`).

## Comparison with R2's overlays

R2 projected decoded vertices with a pinhole of focal "about 256–281", screen right = −X, heading 0 facing −Z, and judged by eye. The decode confirms the orientation and fixes the remaining parameters:
- **Focal.** It is exactly 256 (`$6FF4` exponent 8). The higher end of R2's range was tolerance, not a second constant.
- **Centre.** It is (160, 68) in a **136-row** viewport, not the 200-row screen centre.
- **Eye.** The eye is the player position with no added eye height. Eye Y is 63 on foot and 88 at cruise. The cabin is offset by −63 in Y.
- **Yaw.** It carries a half-step offset of 1/2048 turn (about 0.8 px at the centre).

**What the comparison distinguishes.** Geometry and projection are correct to sub-pixel level (the vertex and clip checks above). Pixel differences that remain after filling the game's own clipped outlines are raster differences:

| Checkpoint | Polygons in frame | Covered px | Colour-consistent |
|---|---:|---:|---:|
| Opening 5910 | 52 | 27,511 | 94.78% |
| Exterior 9510 | 66 | 27,662 | 94.89% |
| Approach 10306 | 90 | 9,388 | 99.97% |
| Cabin 10805 | 83 | 25,462 | 99.83% |
| Departure 12307 | 83 | 24,291 | 99.88% |
| Travel 12906 | 112 | 24,376 | 99.86% |
| Solicitor arrival 13608 | 63 | 25,051 | 99.85% |
| Turn 1 14816 | 68 | 23,958 | 99.87% |
| Cell (1,1) 15011 | 51 | 26,034 | 99.77% |
| Turn 2 16810 | 75 | 23,944 | 99.64% |
| Cell (3,0) 17007 | 54 | 25,623 | 99.72% |
| Spaceport arrival 19004 | 102 | 25,049 | 99.84% |
| Exit 22600 | 50 | 11,184 | 99.96% |

How the metric works:
- **Colour-consistent** means that a screenshot pixel equals the majority colour of the topmost logged polygon covering it, with polygons rasterised by the reading above.
- **Prison room.** Its loss is the horizontal-edge rows of floor and ceiling, plus the black horizon line (a line primitive drawn before the room), which a polygon-only map cannot explain.
- **What it excludes.** Lines, the cobweb's strokes, the sky Body arc in cabin frames, and pixels outside every polygon are excluded. They need separate treatment (#646 for sky and horizon).
- **What it cannot establish.** Screenshots alone cannot establish draw order within a single colour. The order claims rest on the logged call sequence.

## Unsupported cases and remaining gaps

These are not invented rules. Each is a named gap with its consequence.

- **Zero-area slivers.** Polygons with zero integer area are kept or culled by a log-slope tolerance that is not recovered. They are one pixel wide, far away and short-lived (313 of 3,383 logged polygon calls). A port may draw or omit them; it cannot claim pixel parity there.
- **Rows at horizontal edges.** The static row rule does not explain the unfilled prison ceiling row 18 and floor row 85 seen in the framebuffer ([fill](#fill-demonstrated-rasterisation-approximate)). The cause is unresolved. A probe would break at `$500C0`/`$50110` and log A3, D1, D2, `$4FE10` and `$AF18` for those two polygons. This is waived by D1 as exact ST rasterisation.
- **Lines.** Line primitives (`$5873C`: cobweb, horizon line, street furniture strokes) project their endpoints through `$57730`, so the projection facts apply. Their own clip and raster were not decoded or compared.
- **The general matrix path.** Pitch and roll never occur in the slice. The 3×3 path and its builder are identified but not verified here. Sky Bodies, which use it, are #646's.
- **Several behind excursions in one polygon.** `$4FE18` holds only the last exit ray. No captured polygon had two separate behind runs, so behaviour there is unknown.
- **Double-sided polygons seen from behind** (cull off) are plausibly mis-clipped, because the corner logic assumes clockwise winding. In the slice only the horizon and ground use this path.
- **Unexercised orders.** Detail-only drawing (non-level camera or `$718E` < 0) and type-4 priority are read from code, not observed.

## Portable reproduction

The procedure depends only on the pins, the integration recipe and the steps below.

1. **Cold boot** with the integration configuration and R2's input schedule for the route. Do not use a memory state.
2. **Arm the breakpoints.** At checkpoint VBL V, install `b pc = <addr> && VBL < <V+30> :trace :quiet :file <cb.ini>` for each breakpoint in the [method table](#baseline-and-method). Start each callback with `e $C0DExx`, a unique marker, so the log can be split. Hatari's `m "a0+$fc0" 4` accepts register expressions. Take screenshots at V+10, V+20 and V+30, and quit at V+32. A run to VBL 22,600 takes under a minute with fast-forward.
3. **Projection check.** Pair each entry with the immediately following return; calls entered at `$57748` have no entry record. Convert D3–D5 from log-floats, take s and c from `$42C18`/`$42C1C`, and apply the level-path formulas. Compare integer (sx, sy) and the outcode.
4. **Clip check.** For each polygon, resolve selectors to the latest returned slot (bank from D0). Clip homogeneously at a small positive depth, project, and clip to the half-pixel rectangle. Compare with the next `$4FF10` list by Hausdorff distance. Predict the cull from the integer shoelace sign.
5. **Screenshot check.** Split frames at loop-top hits. Fill each frame's logged lists in order with a convex scanline fill. Sample the screenshot at (96 + 2x, 58 + 2y), and pick the frame that maximises colour consistency.

### Stable source slices

Hash these from the loaded RAM before relying on the decode. Do not hash the fill slice: it self-modifies its span call targets at `$500D0` and `$50118` for each colour.

| Range | Role | SHA-256 |
|---|---|---|
| `$57730..$58010` | vertex transform and projection | `0bdd661d60f4f5bf51856ad6e88f8b2346973eeaea15738b1b93cdbac028a910` |
| `$57016..$57100` | camera sine/cosine setup | `3366cef1d5d79e4365ca3caa4d0a8eec4d70fe1c913c32b1751d1de1cbf8c990` |
| `$64000..$65000` | log-float half-step sine table | `79831644423f32a0412588a994c5249b12abd39ceb23dc3130de7440e97495a6` |
| `$77DA..$77EA` | outcode table | `9c561433f10e8a231b6f7ec1e35ec22c7379c5773550e966263f9aa09540549e` |
| `$7E4A..$7FCA` | Q15 sine table for model rotation | `85d7c648b0d75fcb23ebe88ce759d7221614848f3058a3edd308552fbbaf4bda` |
| `$4BDD4..$4BF00` | integer to log-float | `7a3045478a8e8b23c0c5247c62e0c88902bdc4962d0fad9a4b1203746ebba50b` |
| `$4BD34..$4BDB6` | log-float add | `cfe19ddfd1826aa9228a6a17af7ac6c0f2310becddfd1b844667441934ea1d76` |
| `$4F30A..$4F36A` | back-face test | `94b89cb7b9897e5b985426951b7f0b0631f8420655eadd6c3b4da30445d6bd6f` |
| `$4F36A..$4F840` | edge clipper | `e741435ec85fadb32152bade7f25b367651dab3f635409dffd9bf62e0d0263b1` |
| `$4F840..$4F86E` | close step | `8a051cac92008172f40ed23ff57b1f2169a0c6d1dcd92d83dc64f296d00f8d9b` |
| `$4F86E..$4F986` | screen slope | `ddd4669f994220718128a427dbe867d9034162239d9121bc4ab2ad34e0446a2d` |
| `$4F986..$4FAE4` | behind-ray direction | `7fc7c7df56644b83ce6bf35edbe38a85510403efced969ea77dd328ea616374c` |
| `$4FAE4..$4FBFC` | turn, side and corner tables | `60a35f224d6b276092b9db762d8d36e49e0a4e69ddcd0048bc28477bf5f48a5b` |
| `$4FBFC..$4FE10` | boundary intersection | `44bc5f2264ff9f3e2f06330f4e72e75e9ee8d1f3be041d303b0fffbfe0defdfd` |
| `$4FE32..$4FF10` | polygon entries | `b1e49abd4a2a49cec2849261477d8a16c6b3b33a257807a7f27acd0644069626` |
| `$45AC6..$45B06` | span routine table | `bace38df1b8dc639d9b610b610bf5bdd581608c2540a1bcb48137390b4899e94` |
| `$45B2C..$469A8` | 16 solid span routines | `5e3bedbf06bc3dfef7056828b3b6d8ea23213912d3bf9d9e3ff16d250a3a5358` |
| `$543B2..$545AE` | model header operations | `1ca6036841c57fa3a5b668ef05d8dadf1ebdf8c3264cac5fbfa13fefaf6bb5de` |
| `$545AE..$546F8` | model draw entry and header dispatch (= R2) | `592ee4aba29f4285dc026793df0466992d57a7e72bd6290bc882ddeefb524e7e` |
| `$546F8..$549BA` | vertex, alternative and primitive loop (= R2) | `28d327e2d07e3f1680ddfc776f3452bd53c9d63874f35a2dd3f1ebe963081186` |
| `$5532E..$55354` | model range test | `074be82f6b42b019ffbcedba7daae670384559339e6d2e4ef692179c6e3d372b` |
| `$54182..$5430E` | drawn-list builder (= R2) | `2f123f168720ded8e38eb47dd524c8bd257508c8574ded28293dfa21da473c46` |
| `$54340..$5439E` | list walk and structure order (= R2) | `7604de54e586ab8dfbe2044197bb54e033d184a8cb224769bed8b93fc4d0f243` |
| `$54142..$54178` | occupant hook | `c18d95a9ea4b094987ddad23bcb3d1783a28b4714c01b2122769a50863747bc6` |
| `$5B7BE..$5B7F6` | plan queue walk | `944958e365fca16d28e8612fd163eb8c34484e8286942188b94a42f54c28467d` |
| `$5A652..$5A684` | frame draw sequence | `3864fe1d1011b5fdd5616a5484e8db1d2b0861f182849e1648233581543da270` |
| `$2FA60..$2FC2C` | TAXI record and passenger form (= R2) | `352f6299ad7bbb990a8e3c82454a1884ce4e429a1ab393be04a3c8afb225efe1` |

### Artifact identities

Paths are relative to ignored `restricted/mercenary-iii-644/runs/`. Reproduction depends on the pins and the procedure, not on these files.

| Artifact | SHA-256 |
|---|---|
| `approach-solicitor-10300-vf_ppjt7/hatari.log` | `e8e9266c0b85733aee46c48e339f6978f6b1f33a33ccb57a041f1ad54f621a14` |
| `arrive-solicitor-13600-u0yrb0l7/hatari.log` | `15c5e0ec84da425b64c3457db30c65e8dc240c6fda322b31c05bcfb9809ad27d` |
| `arrive-spaceport-19000-5wn_p3wc/hatari.log` | `6f67857ac118dd5fd7a3da4c540a0b9f88ab96294ca800746b11426e707d253e` |
| `cabin-solicitor-10800-tkdqqr30/hatari.log` | `a3e2d9c40e0beaafd132f894ccac2ed1aae49c2dbb88432cd88c9d441dd8c016` |
| `cell11-spaceport-15000-zelk77vb/hatari.log` | `ff6402da82791766430aa6f32affe8afeb6804ac5b1b5f65bb8bc5647cc7d0c1` |
| `cell3-spaceport-17000-iuio674r/hatari.log` | `864a1eabe26c2b139cedb8d51ccc198c8ad0bc9e3090ab33fb2dac79ce0e4260` |
| `depart-solicitor-12300-izy040v0/hatari.log` | `c55effff79b5ff7ffd23ab66554b11b6c7680f1742c508e8d204c1f1510f556b` |
| `exit-solicitor-22600-v0020l_2/hatari.log` | `88c608a19c67d9048f0077fab43e808d0817ae5121debe3063905c14872205ad` |
| `exterior-solicitor-9500-x555u88i/hatari.log` | `606219a14d75388ec7a92db881b77730c9ef63a328163d9bff6f3ee312da4f24` |
| `opening-solicitor-5900-c3xtc5bj/hatari.log` | `5749b1105839acfe12006a0354078fafc8dff9cb969ee37210056c1e011a5d92` |
| `travel-solicitor-12900-6drqmxse/hatari.log` | `d950a749ccc885a8baca16de84b0f59155f3bea003307ae7ea106c5d8b4833d4` |
| `turn1-spaceport-14800-nvsyz6bm/hatari.log` | `f71b65d7d8195fa5f4cca56a875ac759bb4f5d5e97de214736169f05ba79a29c` |
| `turn2-spaceport-16800-5yx2a2ia/hatari.log` | `edb15d73af219d55b77c24324bb0d8b52ec8e12641ba5852f62abbfd16180c03` |
| `exterior-solicitor-9500-x555u88i/v9500.ram` | `982ee0257cc9340c11bb97157ba5bcacf2b4fa5bffdb8278cfe96dec1d5abb2a` |
| `fb-04uvv48w` framebuffer RAM (`../fbram.bin`, VBL 9502 loop top) | `2ce0634e9b889556d1139d6770936f5a415436c56b2c7b4f27b15b1b22860767` |

## Handoffs

- **I1 (#647) content and render adapters.** Adopt the level-path projection with F = 256, centre (160, 68), the 136-row viewport, the half-step yaw and eye = player position. Clip at depth 0⁺ (homogeneous) and to the half-pixel rectangle. Cull clockwise-only on the polygon entries marked "on". Draw a model's one viewer-selected face list in authored order. Paint objects far to near by key, with the structure's plan/detail order from the region flags and occupants at the queue hooks. Implement the passenger form as a view-fixed model at (0, −63, 0). These are facts to implement independently, not code to translate.
- **I2 (#648) visual acceptance.** Compare against these checkpoints with the stated metrics. Geometry should agree within one pixel of the game's clipped outlines. Raster residues at horizontal-edge rows, zero-area slivers and lines are expected and must not be claimed as parity. Exact ST rasterisation stays waived.
- **#646.** It owns the sky/ground/horizon fill (`$576A2`, uncull entry `$4FEA0`), the horizon line and the sky Bodies' general-matrix path.

## Verification performed

- All three pins were verified before every run: 14 cold boots, including one order-only rerun of the opening.
- The static decodes were checked against runtime logs at every checkpoint above.
- All the counts in this report come from the restricted harness (`cap.py`, `parse.py`, `verify.py`, `analyse.py`, `overlay.py`, `model.py`).
- The comparison images were inspected for the exterior and cabin checkpoints.
