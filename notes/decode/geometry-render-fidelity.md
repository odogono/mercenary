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

## Fixed and verified

- **Object orientation.** Slots below `$10` apply three plane rotations about Z,
  X then Y before placement. Verified by evidence rather than assertion: slots 00
  and 01 share model `3b25`, and after the fix their world spans differ
  (2862×192×5046 against 4048×192×3088) because slot 00 carries `y = 32`.
  **Only slot 00 has a non-zero orientation in the initial state** — this matters
  for correctness, not for how a fresh load looks.
- **Object point-LOD.** Beyond the `$010000` cube per axis an object collapses to
  a projected point, which the doc calls part of the original's look.
- **Reference viewport.** Projection now derives from the original's 160×136
  frustum centred at (80, 68), so field of view no longer depends on window size.
  Runtime FOCUS `$18` adds six exponent steps, giving a recovered horizontal
  perspective scale of 64 reference pixels. The Y path adds one more exponent
  step before division, giving a vertical scale of 128. These are decoded
  Reference Build behaviour, not visual tuning.
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

The app's opening pose remains a Mac Adaptation presentation choice: X 559104,
Y 400, Z 547104, looking north with a neutral pitch. It is 12,000 world units
south of the scene focus, keeping the airstrip, inverted pyramid, Dart and wreck
inside cell 8:8 and visible under the decoded projection. The focal values and
axis ratio are Reference Build behaviour; this particular camera placement is
not claimed as decoded initial state.

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

## Still open

- **The streaks are not roads.** Long lines radiating across the view survived
  road culling entirely, and every cell's vertices were confirmed inside its own
  cell, so neither roads nor misplaced geometry explains them. The remaining candidate
  is pipeline step 6 — the original clips lines to the **viewport borders**, which
  this renderer does not do; it clips only to the near plane, so a segment passing
  close to the camera projects to enormous coordinates. Standing inside a
  structure, with no collision, also contributes.
- **The 410 deferred edges** were not attempted this pass. The four affected
  structures, their descriptors (`0x32`, `0x35`, `0x7f`, `0x73`), rotation centres
  and per-point rotation inputs are now all in the payload, so the bounded search
  can start from data rather than from a fresh decode.
