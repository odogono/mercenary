# Capital Spaceport: occupied interior within Structure 74

The saved interior-window pose belongs to **Structure 74** (`structure-01484e`),
with **Building detail 88** (`interior-0303d6`) still selected. Its more precise
interior identity is **region 1 of Structure 74**, rather than a newly selected
building-detail model. This is Working-Authority Evidence from the pinned Atari
ST build, not a classification of every entry in either source bank.

## Sources and limits

All addresses below are ST physical RAM addresses. Original captures, RAM and
Working Disassembly remain ignored Restricted Material under
`research/damocles-st/work/`. Only decoded findings are recorded here, consistent
with [ADR 0039](../adr/0039-admit-the-damocles-catalogue-before-playable-integration.md)
and the [research boundary](damocles-gap.md).

| Artifact                                                     | SHA-256                                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------------ |
| Working Authority STX                                        | `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef` |
| `observe-first-world-20260818T101013Z-c5a32b7d/observed.ram` | `b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967` |
| `interior-window-ram-20260818T172346Z-e3772e4d/interior.ram` | `c9cbbacb6d5ac9266b350bb9b47cdc0d0b0167c6a4ebb0d03d163f0ada292eaa` |
| Same interior run, `interior.png`                            | `11ceae7789681980e1ab5957be5db521752cc8eeb8c43309678bbe0e7dc654b4` |
| `research/damocles-st/snapshots/interior-window.sav`         | `a11254db81c2552be6b73c6d4e8f654e740a1c46553193a2aa28e78f7ba54dd6` |
| `stick-record-20260818T174759Z-1b7b3fee/stick-sequence.json` | `7c6d3db6ac0a5a244f0c6184ae815004b60bc9130823c4d55f169ecb35ecf540` |
| `stick-replay-20260907T202708Z-7cc03bca/observed.ram`        | `aa50cc457c970d6e55b13803cbc9bfb6a30a2164491f023a7c0adabcb2f3394a` |
| Same isolated post-pickup replay, `observed.png`             | `d3dc8e1408ab52dba093377f0b88ede5b574f07ce24febc22ca5fb99b8017e72` |

The interior snapshot was captured after a human walked into the spaceport;
its approach was not reproduced by deterministic input replay. The existing
[filled-polygon notes](damocles-filled-polygons.md)
describe that limitation and the PNG, whose cyan foreground and outward view
of the pad, terrain and stars are visible again in the RAM-capture run. Its NAV
panel reads Eris, `016-283`, `07-08`. The first-world run has the laboratory
manifest; the interior RAM is a debugger export from the saved state, not an
independently attested cold-start run. Hashing it does not upgrade that lineage.

## Same model pair, different occupied region

Direct reads from the two RAM files give:

| Address / interpretation           | First world | Captured interior |
| ---------------------------------- | ----------: | ----------------: |
| `$7AF0`: structure slot            |          74 |                74 |
| `$53A84`: building-detail slot     |          88 |                88 |
| `$53A88`: selected detail geometry |   `$0303D6` |         `$0303D6` |
| `$7A0E`: palette binding           |   `$00D54C` |         `$00D54C` |
| `$79B6`, `$79B8`: X/Z scale        |        2, 2 |              2, 2 |
| `$7B2C`: plan vertex count         |          36 |                36 |
| `$7B32`: region count              |          11 |                11 |
| `$7AFC`: selected region           |          11 |             **1** |
| `$7B12`: current region descriptor |   `$00B2CA` |     **`$00B23E`** |
| `$7B34`: selected region flags     |     `$C000` |           `$8000` |

The current surface cell is `$87` in both captures (`$7B5C`). The catalogue's
recovered named-place record associates that cell with CAPITAL SPACEPORT and
model `structure-01484e`; see [catalogue extraction findings](damocles-catalogue.md).
The entire examined geometry ranges `$E900..$1DFFF` and `$26000..$356FF` are
byte-identical between these two RAM images. An interior transition here does
not replace the geometry banks.

The table at `$E900`, slot 74, resolves to `$1484E`. Its preceding metadata
contains X/Z scales 2/2, palette selector 21, and detail selector 88. The detail
table at `$26000`, slot 88, resolves to `$303D6`. The selection consumer at
`$54D78..$54E1C` connects these metadata fields to the runtime selectors and
palette pointer; `$53A98..$53AB4` resolves the selected detail pointer. These
relationships establish that the catalogue link to detail 88 is a component
association, not evidence that detail 88 alone is the interior.

## Interior region and visibility

The region scanner at `$5A32C` examines records in the `$B23C` workspace, tests
local X/Z bounds, and at `$5A3BA..$5A3C4` records the selected index, flags and
descriptor. In the interior RAM, region 1 has flags `$8000`, bounds
**X 840–1560, Z −760–760**, and an associated source-list pointer **`$14970`**
(at descriptor offset 8). Bounds are local, scaled geometry coordinates, not
surface-map coordinates. The scan's comparisons make the lower bounds inclusive
and upper bounds exclusive. The pointer is not a standalone room-model pointer.
Its list format and complete region-1 contents are decoded below; the exact
meaning of the region flags remains unresolved.

The source renderer does not simply concatenate all polygons from the two
models. The dispatch at `$533D4..$53418` orders the plan-derived renderer
`$5A744` and detail renderer `$53CC2` according to state including `$7B34`.
Detail drawing also selects conditioned lists, including `$C2FE`, through
`$53CC2..$53CF6`. The plan renderer is therefore **not proven to be indoors
only**: the first-world state can dispatch it too. A static union loses the
region selection and drawing-order information; this is a plausible cause of
coincident facade/window surfaces, but this note alone does not prove a complete
rendering fix.

The region-1 flag `$8000` has bit 14 clear, so `$533D4..$53418` renders detail,
then the surrounding object stream, then the plan queue. Outdoor region 11 uses
`$C000`; bit 14 is set and the plan is rendered before the detail. This proves
component ordering for the two observed regions without assigning meanings to
the remaining flag bits.

### Region 1's exact surface queue

The region-1 pointer `$14970` names an ordered Structure 74 surface queue, not
a Building detail 88 face list. Its complete byte sequence through the zero
terminator is:

```text
1A 16 17 09 1B 1C 19 08 0B 0A 18 07 0C 0D 02 05
11 03 04 12 01 06 10 0F 14 FF 15 0E 13 00
```

The bytes at `$14970..$1498D` have SHA-256
`948c2aba26fdc07425bbd52585c0170014ddb07c94790415c685f78e47fe1af9`
in both the pinned first-world RAM and the captured interior RAM. The consumer
at `$5A3C8..$5A4BC` reads each byte, multiplies it by four and appends the
resolved entry to the plan renderer queue at `$8732`; `$5A7D6..$5A80E` later
dispatches that queue. The captured `$8732` queue has the same order after the
four-byte conversion.

Values 1–28 occur exactly once each, in a deliberate draw order. They refer to
all 28 plan/surface primitives at `$148C8..$14947`; region 1 does not hide any
of those static primitives. `$FF` becomes workspace offset `$03FC`, equal to
the boundary held at `$7B30`, and therefore takes the allocated surface-record
branch at `$5A80E`. That record is constructed from the authored post-plan
record beginning at `$1494A`: it is the animated exterior-door attachment
decoded below. `$FF` must not be treated as a terminator, ignored command,
object slot, or detail-face number.

This closes the region-1 list format for the observed spaceport record. It does
not close Building detail 88 visibility: the open and closed facade selections
come from the detail model's separate conditioned lists described below.

### Resident object evidenced inside the room

The region painter itself supplies the strongest residence evidence. With
`$7B0E=$14AAC`, the association builder at `$52CDC..$52D40` resolves resident
slot `$B7` (183) for the current body and cell. Its source association group
maps selected region 1 to insertion key `$18`. The region assembler at
`$5A3DE..$5A432` consequently inserts tagged queue value `$FFFF00B7`
immediately before plan entry `$18`; that exact value is present in the
captured queue at `$875A`. No other resident-object tag occurs in region 1's
queue.

Slot 183 selects source model `KEY- V.I.P. LIMO` (`object-03e494`). The name is
the 16-byte source label directly preceding its model at `$03E494`, not an
inferred catalogue label. Its resident coordinates are X `$004780E4` at
`$6684`, Y `$00000000` at `$6A84`, and Z `$0088892D` at `$6E84`.

The world-to-room transform is now closed for this instance. Cell `$87`'s
record at `$ADF8` is `$004A E5 34`: Structure 74, signed X offset −27 and Z
offset 52. `$54D48..$54D6C` sign-extends those offsets, multiplies them by the
source constant 30 at `$4BD14`, and measures them from the centre of the
65,536-unit surface cell. The captured world/local pairs at `$7A92`/`$7A2C`
and `$7A9A`/`$7A34` establish the loaded grid origin as X `$00400000`, Z
`$00800000`. Consequently the Spaceport's world origin is X `$00477CD6`, Z
`$00888618`, and direct subtraction gives the key's Structure-74-local
placement **(X 1038, Y 0, Z 789)**. This is the extracted coordinate frame;
the inspector's established Z reflection is a presentation transform and must
not be baked into the stored placement. The slot yaw byte used by the object
renderer is `$00` at `$7A84`; its absolute angular convention remains only
partially decoded.

The key record's `$8008` source command at `$03E494` supplies display code
`VL` and a relative offset `$006A` to the shared key geometry at `$03E502`.
The renderer dispatch at `$535E4..$53638` copies `VL` into its display-code
workspace and follows that authored offset. The shared geometry's `$6000`
record at `$03E580` supplies the local label anchor **(−8, 24, 0)**.

**Correction, 2026-09-08:** the first key extraction incorrectly treated the
following `$8000` as a terminator, discarded the remaining body faces, and
substituted an HTML font overlay. The user’s front and side captures exposed
both errors. `$8000` is the vector-text configuration word: the rest of this
record is character advance 9, signed X/Y scales 3 and 5, hardware colour
`$8000` (black), and text reference `$8B00`. Body polygons resume at `$03E590`;
the actual polygon-stream zero terminator is at `$03E5E6`. All **14 faces**
use the original **18 body vertices**, including the back, thickness, shaft,
and tooth. The letters are source stroke geometry, not a billboard or the
interface bitmap font.

Targeted examination of `$53F96..$5416A` establishes the text-record layout,
local 3D placement, and relative glyph table at `$31700`. `$8B` selects the
pointer at `$CCCC` to the `$CD34` display-code workspace populated by `$8008`.
Font zero indexes characters relative to ASCII space. `V` resolves to `$31C64`
and `L` to `$31BA0`; signed byte coordinate pairs end at `$81`, followed by
pairs of one-based vertex offsets in units of four, ending at a zero byte.
The result is four V strokes and two L strokes. Applying the source scales
and advance puts their bounds at X −8..7, Y 24..34, Z 0, on the white plate.
The extractor emits these as ordinary model-space vertices and lines, keeping
the display code and anchor as metadata. The viewer depth-tests the strokes,
so the body hides them from behind. Stroke width is one CSS pixel; exact ST
rasterisation and perspective are not claimed.

Regression checks now require every source body vertex to participate in
drawable triangles and lettering to occupy the plate in model space. Browser
checks exercise the oblique, side and rear views, including rear occlusion;
the original two-face decode and HTML overlay fail these checks.

The complete resident X/Y/Z array range `$63A8..$6FA7` has SHA-256
`d3d7004108aa22dd128268295cd33620ce90f481c7ded5d0d43560192de0a284`
and is byte-identical in the first-world and interior captures. This is evidence
for the V.I.P. limo key's initial residence in the one-room spaceport. It is not
a whole-game object-residence census: the key is the sole matching resident in
these captures. Carried or removed objects, script-created placements and
content not loaded in these captures remain unresolved.

### Pickup removes the resident placement

The original recorded route first tries `T`, then acquires the key with Right
Shift + Up. A shortened deterministic replay of that same route stops
immediately after the take input, before the player walks to or boards the
limo. Its panel contains `KEY- V.I.P. LIMO` and pointer `$03E484` at `$4DDBC`.
In the same post-pickup RAM, slot 183's association words change from
`$00120404` / `$2C0C0087` at `$7284` / `$7684` to `$00318404` /
`$78010010`, its X/Z values change to `$000081D5` / `$0001831C`, and tagged
queue value `$FFFF00B7` is absent. The initial, interior-window and supplied
at-key states all retain the original coordinates and queue tag.

The boarded and subsequently left-limo captures retain exactly those
post-pickup slot values, the inventory entry, and the absent room-queue tag.
This establishes a persistent transition from placed resident to held key,
independent of boarding. The meanings of every replacement association bit and
the low X/Z values while held remain unresolved; they must not be presented as
a second world placement.

## Consequence for the catalogue

Inspect the enclosure/layout contribution of Structure 74 separately from its
linked detail 88, and identify the captured room as **Capital Spaceport,
Structure 74, region 1** with this evidence. Retain the original stable model
IDs. Do not rename detail 88 to “Capital Spaceport interior” or infer that all
11 regions are distinct rooms: the observed outdoor region 11 already disproves
that shortcut. Complete openings, region-conditioned face selection, and the
transition between the room and exterior remain follow-up extraction work. The
region-1 plan queue is now accounted for above, while Building detail 88's
conditioned selection is still only partial.

### Lower window wall and sill recovered

The source record at `$148D6` is type 2, colour `$A094`, with plan endpoints
X840, Z−600/+600 after the evidenced scale. It supplies the lower window wall.
The preceding type-3 record at `$148D0`, colour `$B08C`, supplies the sill spanning
X800–840 at the same Z endpoints. Both were previously skipped because the
third height was not bound.

Both examined RAM captures hold **48** at `$7B2A`, alongside heights 250 and150
at `$7B26`/`$7B28`. The renderer projects that third height at `$5A762..$5A7A2`;
type 2 uses ground-to-third-height corners at `$5AD52..$5ADBA` (with reversed
segment endpoints), and type 3 uses the third-height plane at `$5AEA8..$5AEF4`.
The extractor now accepts an explicit third-height binding, supplied only for
the reviewed Structure 74 while the captured current selector is74. It does
not apply this live workspace value to unrelated models.

The lower wall resolves to cyan `#00cccc`; the sill resolves to grey `#888888`.
The opening remains between heights48 and150. The user-supplied original-game
interior screenshot shows a blue floor and cyan wall below the window, resolving
the earlier apparent floor-colour discrepancy: the earlier cyan foreground was
misidentified as floor. The blue `$808E` floor interpretation is consistent with
this clearer view. These supplied screenshots are visual review evidence, not
new attested laboratory captures; a complete fidelity review is still pending.

### Wall orientation is not uniform polygon winding

Ordinary wall forms 0/1 use a dedicated segment-based rasterisation path:
`$5B0DE` loads the two endpoints, `$5B0FA..$5B132` may exchange them according
to projected clipping/order information, and the uncomplicated path dispatches
`$57582`. Their stored endpoint order therefore does not by itself establish
an outward-facing polygon normal. In contrast, the form-7 upper band path at
`$5ADBC..$5AE1E` explicitly constructs top-A, top-B, lower-B, lower-A corners.
Treating both forms as one-sided faces with independently invented ordering can
make ordinary room walls disappear when seen from the room. Recovering the
region visibility lists remains necessary to reproduce the original selection;
a catalogue inspection choice such as showing both wall sides must be identified
as such rather than claimed as recovered source winding.

### Combined inspection view

The Form selector also offers a combined interior/exterior view, alongside the
separate views. It places both recovered components in their shared local frame
using the same evidenced scales. The interior and combined forms also place the
captured resident V.I.P. limo key at its recovered local coordinates. This is an inspection assembly; it does not
reproduce the original region-dependent visibility. It selects the authored
open-facade alternatives described below. Direct link: `/catalogue?instance=eris-surface-87&variant=combined`.

### Open facade selection for combined inspection

Detail 88 contains mutually exclusive facade representations in one polygon
stream. Drawing all of them is incorrect: it overlays a solid facade, a flat
opening-colour patch, and the surrounding polygons for a real aperture.

In the scaled local frame, the window is on X800, spans Z−600..600 and heights
48..150. The doorway is on Z−800, spans X1300..1500 and heights0..150.
The exterior and combined spaceport views now omit zero-based faces1/2
(records `$30511`/`$30518`: solid window facade and cyan patch) and31/32
(`$305E7`/`$305EE`: solid doorway facade and grey patch). They retain the
already-authored aperture surrounds: faces35–37 (`$30603..$30611`) and39–42
(`$3061E..$30633`). No vertices are moved and no artificial depth offset is used.

This is a scoped choice of existing open geometry for inspection, not a decoded
runtime selection algorithm. The separate raw detail model retains all source
faces. Regression checks ensure neither opening is covered by the discarded
facades in either the exterior or combined spaceport view. Browser inspection
confirms the interior is visible through the window and doorway without the
previous stripes. The roof remains opaque; use the separate interior view for
an unobstructed overview.

### Inspector handedness correction

The supplied original-game views put the entrance on the right when viewing the
entrance facade, with the window and tower providing asymmetric cross-checks.
The prior inspector mirrored that arrangement. Source positions agree between
room and exterior: the doorway occupies X1300–1500 on Z−800, in a facade spanning
X800–1600. The correction is a viewer-coordinate convention, `(x,y,z)` →
`(x,y,−z)`, before orbit rotation; extracted coordinates and placements stay intact.
The reflection requires clockwise front-face selection in WebGL. Depth direction
is unchanged. A rendered asymmetric-facade regression checks left/right ordering,
and existing pixel tests check depth, opposite-sided colours and two-sided walls.
Visual review now places the entrance on the right as in the reference views.

### Exterior door: proximity-controlled attachment

The user's review identifies one interior room and an exterior door that opens
on approach. This corrects the earlier inference that a visible doorway must
lead to another room. Region counts remain visibility/spatial records, not a
room census. The proximity observation is supplied gameplay evidence; a timed
approach-and-retreat laboratory trace has not yet been captured.

The primary moving door is an authored Structure 74 attachment, rather than a
Building detail 88 polygon. The static-wall terminator at `$14948` is followed
by control word `$4200` at `$1494A`; bit 9 selects the multi-panel path. Its
geometry words at `$1494C..$14953`, after the evidenced X/Z scales 2/2, define
a thin closed slab at **X1300–1500, Z−790–−770**. Palette-21 references `$908A`,
`$908C` and `$9090` resolve to `#666666`, `#888888` and `#664444`. The second
box at `$1495A..$14963` resolves to **X1200–1600, Z−1200–−200**.

The generic attachment handler at `$5AA3C..$5AD4A` tests the player's local
X/Z position against that second box using lower-inclusive, upper-exclusive
comparisons, then modifies the constructed multi-panel geometry. Together with
the observed approach behaviour, this establishes a proximity-controlled
animated door. The `$FF` entry in region 1's queue resolves to this attachment's
runtime slot `$03FC`, so the door is part of the room's authored render order.
The bytes `$1494A..$14965` have SHA-256
`8902f5715d01e2d56a502a915a083d9d095a8f6eb975af20940b573f85224bee`
in both examined RAM captures.

For this exact record, the outside-box update path is gated by the zero low byte
of `$4200`. Automatic re-closing on retreat is therefore not proven. Exact
timing, sound, the state which may enable re-closing, and a deterministic
approach/retreat capture remain unresolved.

Detail 88 independently provides an authored closed-door facade face: zero-based
face32, record `$305EE`, uses source vertices40–43 at `$304C6..$304D8`. With the established
X/Z scales2/2, its corners occupy **X1300–1500, Y0–150, Z−800**. Its palette
word `$808A` resolves to grey `#666666`. Open-door surround faces35–37 at
`$30603..$30611` cover the rest of that facade without filling this rectangle.
A static catalogue inspection state can therefore retain the surrounds and add
face32; the open state omits face32. These facade alternatives corroborate the
door presentation but are not the moving attachment itself.

The source's conditioned face lists corroborate these alternatives. After the
45-face stream ends at `$30648`, the distant-list record `$30678` includes
one-based faces32/33 (whole doorway facade and grey patch). In the second list
group, record `$306E0` has raw bounds X400–900, Y0–200, Z−730–−400 and selects
one-based faces36/37/38/31: the open doorway surrounds and roof. After the
captured scales, this is the approach-side volume **X800–1800, Y0–200,
Z−1460–−800**, adjacent to the doorway. These are model-local bounds, not a
radial activation distance. The consumer `$53C06..$53CB2` binds list boxes to
model scale; `$539DE..$53A7C` selects their face lists using the local view
position. Dispatch `$53CC2..$53CF6` additionally gates which list group is used
on current scene/region state. Consequently the box alone is not yet a complete
proximity-trigger contract or a recovered opening/closing hysteresis rule.
The bytes `$306E0..$306FA`, covering that bounded record and its list
terminator, have SHA-256
`47068cb48fbdb90de355fc54a89ed93d880fefca0984ce1e1af4a4d5644e69e0`
in both examined RAM captures.

Detail 88 itself has no articulated vertex header: all 51 vertex Y values are
nonnegative and its terminator at `$30508` is `$8000`. That fact applies only to
the detail model and does not negate the separately encoded Structure 74 door
attachment. All record addresses above were read from the pinned first-world
RAM identified in the source table above.

### Catalogue door-state control

The exterior and combined views expose a Door selector with Open and Closed
endpoints. Closed adds the authored grey panel at the entrance aperture, drawn
from both sides as an inspection convention; window geometry is unchanged.
The selector preserves orbit and zoom. Existing open-view URLs remain valid;
`variant=exterior-closed` and `variant=combined-closed` select closed endpoints.
The interior-only layout has no door-state control because it excludes the
exterior component. This is manual inspection, not a proximity or timing simulation.
