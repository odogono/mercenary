# Geometry render fidelity

What the object inspector established, and what it left open. The documented
pipeline is `docs/research/c64-geometry-encoding.md:190-204`.

## The root cause was the exporter, not the renderer

The World Geometry Dataset preserves the Reference Build's presentation rules and
the payload exporter was discarding them: `roadAltitudeLookup`, per-instance
`visibility` (the detail cube and far representation), the structure
`rotatedPointDescriptor` and `rotationCenter`, and the `transformContract`.
`orientationBytes` was carried but the renderer ignored it. Payload schema 3
carries all of them, plus table-faithful road runs and the fixed high-altitude
map. Schema-2 payloads must be re-exported.

## A `$FF` structure Ink split means all black

`DRAW_STRUCTURE_L96E7` walks a Surface Structure's lines from its highest index down to zero,
starting with black Ink and switching to white only when the countdown equals the structure's
white/black split index. A split beyond the highest line is never reached, so `$FF` means every
line stays black; the exporter instead treated every index as less than `$FF` and made all of
those lines white.

Geometry decoder 8 corrects the rule. Eight shared Surface Structures are affected: 86 lines
placed in 26 Surface Cells, producing 282 corrected cell-edge instances in the Data Payload.
In-range splits are unchanged, including the airstrip in Surface Cell 8:8, whose split at 5 of
14 lines still makes lines 0 through 5 white and lines 6 through 13 black.

## Fixed and verified

- **Object orientation.** Slots below `$10` apply three plane rotations about Z,
  X then Y before placement. The angle is a six-bit turn: `L8445` masks it with
  `$3F`, so `$20` is 180 degrees rather than 45. Slot 00 therefore points its
  model-local negative-Z nose along its positive-Z flyby velocity. Slots 00 and
  01 share model `3b25`, while only slot 00 has a non-zero orientation in the
  initial state.
- **Object point-LOD.** Beyond the `$010000` cube per axis an object collapses to
  a projected point, which the doc calls part of the original's look.
- **Reference viewport.** Projection now derives from the original's 160×136
  frustum centred at (80, 68), so field of view no longer depends on window size.
  Runtime FOCUS `$18` adds six exponent steps, giving a recovered horizontal
  perspective scale of 64 reference pixels. The Y path adds one more exponent
  step before division, giving a vertical scale of 128. These are decoded
  Reference Build behaviour, not visual tuning.
- **Reference Viewport clipping.** A deterministic parametric clip now trims
  ordinary and Distant Structure lines to the centred, scaled physical playfield
  before their one binary32 narrowing. Wholly outside lines disappear; Far Points
  keep their independent handling. The Projection Replay Gate explicitly selects
  the old unclipped oracle mode so its accepted arithmetic and ordering remain useful.
- **Parked instances.** Instances outside the world grid are no longer drawn. All
  64 remain inspectable.
- **Grid aliasing.** `World.cell(column:row:)` packed its key without range
  checks, so a negative column aliased onto the previous row and duplicated that
  cell's geometry at the world edges. Caught by a test, not by eye.

## Settled: the object models really are flat

The contact sheet shows roughly 50 of 64 objects as flat plates, with a Y span of
160–350 against X and Z spans near 4,000. That looked so implausible for
spacecraft that a decode error seemed likelier than the truth, and the ratio is
suspiciously close to one nibble — the difference between `<< 4` and `<< 8`.

**Both the ROM and the original's own display say the model decode is correct.**

The scaling code at `$A6F1-$A725` is three identical blocks, one per component:
`EOR #$80`, then four `ASL`/`ROL` pairs shifting a 16-bit pair left by four. X, Y
and Z are treated the same way. There is no separate vertical scale in model or
world coordinates.

There is, however, a separate scale in the final screen projection. At `$A8E9`
the transformed Y exponent is incremented by four—one power-of-two step in this
floating format—before the perspective divide. Consequently screen X uses
`64 X/Z`, while screen Y uses `128 Y/Z`. The old 124-pixel guess happened to be
close to the correct vertical value but incorrectly widened X by almost 2×,
which made otherwise-correct models look flat and over-wide.

The captured C64 interactive display confirms it visually: at grid 8:8 the game
draws a small flat plate with a delta marking sitting on the ground — exactly a
contact-sheet tile. A screenshot of the **Atari ST** version shows recognisable
three-dimensional craft, but that is a different edition with different models and
is not evidence about ours.

Lesson recorded: a plausibility argument produced a confident wrong answer here,
and thirty lines of disassembly settled it. Go to the ROM first.

## Opening presentation at 8:8

The app now starts at the Reference Build's captured crash position: X/Z 559104,
Y 128, looking north with a neutral pitch. The previous staged overview was a Mac
Adaptation 12,000 world units south of that point; it made the whole airstrip easy
to inspect, but incorrectly moved the player away from the centre of the wreck.

## Surface Structure reach now follows the Reference Build

The Visibility Selector expands only the occupied Surface Cell's structure. A
structure therefore appears at its cell boundary, matching `_OUTSIDE_L85A1`, and
a neighbouring Site is no longer visible or targetable before the player enters
its cell. The former three-by-three ring remains only as an explicit Trace Oracle
rule so its six projection Golden Traces continue to grade arithmetic and order;
it is no longer production behaviour.

The related surface presentation follow-ups are complete rather than remaining
work for #111: #149 corrected `$FF` structure Ink, #150 recovered surface
selection, #151 restored the slot-0 patrol's Far Point, and #152 made building
reach a presentation setting while retaining the Reference Build default.

## Roads and the cell 8:8 airstrip

A capture of the original at the interactive checkpoint reads `LOCA 08-08` with
`ALT 00000`, and its camera position decodes to X/Z = 559104 — cell 8:8, which
confirms the cell mapping. The two parallel lines there are not a road. Cell
`8:8` has no entries in any of the four road tables; the lines belong to its
decoded airstrip model, `surface-structure:cef6`. They therefore remain visible
when map lines are disabled and disappear with structures.

Each nonempty road-table slot is one full, zero-width run between nibble-packed
grid centres. The 271 stored entries collapse to 32 unique undirected black
lines. Runtime selection indexes the altitude table with
`clamp(floor(Y / 2048), 0...255)`, clips its selected cell square to the map,
deduplicates points and lines, applies current-structure suppression and the
raised current-cell pass, then switches to the fixed `$902A` map at Y-high `$20`.
The occupied cell's two runs seed the Road Workspace even when they are not drawn
as Map Lines. Its four endpoints fill workspace indices 60–63, resolving 478
placed point references and the 956 structure-edge instances that use them, so
road structures now continue to their junctions.

## Intentional Atari ST scene palette

The supplied overhead airstrip image is the colour authority for this
presentation choice. Sampling its largest uniform playfield regions gives sRGB
sky `#60A0E0` and ground `#008000`; the same indexed colours appear in the
[matching Atari ST screenshots](https://www.atarimania.com/game-atari-st-mercenary-escape-from-targ_9949.html).
The interactive renderer, headless renderer, and road-network SVG all use these
recorded values. Road and airstrip ink is true black `#000000`, and there is no
separate horizon stroke: the boundary is formed by adjacent sky and ground fills.
This is explicitly Atari ST-inspired presentation, not a decoded C64 colour
claim.

## Resolved: the streaks were unclipped projected lines

Long lines radiating across the view survived road culling because a segment near
the camera projected far beyond the playfield and the browser submitted it without
the Reference Build's border clip. Reference Viewport clipping removes those
streaks without changing the source geometry, Ink, traversal order, or Far Points.

## Corrected: rotated structure displacements are ×64, not ×16

The surface work recorded the rotated-structure displacement as "a signed ×16
displacement" after `SETUP_STRUCTURE_POINTERS` subtracts `$28` from the exponent.
It is ×64, and the flight step's reading of the float format is what settled it.

`$9600` passes the source byte to `BIT24_TO_FP` (`$8510`) with the mid and low
bytes zeroed, and that routine treats its argument as the *high* byte of a
twenty-four bit value — its normalisation counter starts at `$18`, which is bit 24.
So the float coming back is the byte shifted left sixteen. Subtracting `$28` from
the exponent byte is ten powers of two, because one power of two is `$04`. The
result is `byte << 16 >> 10`, that is `byte * 64`.

That makes the displacement a quarter of the middle-byte unit the surface's own
world points are placed in, which is a sensible sub-cell offset. At ×16 it was
sixteen times finer, and the visible consequence was the rotating inverted pyramid
at cell 8:8: four times too narrow in X and Z while its independently stored Y byte
kept its correct ×256 units, so it drew as a tall spike rather than a squat
pyramid. Y was never wrong; the axes either side of it were.
