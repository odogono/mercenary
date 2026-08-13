# Geometry render fidelity

What the object inspector established, and what it left open. The documented
pipeline is `docs/research/c64-geometry-encoding.md:190-204`.

## The root cause was the exporter, not the renderer

The World Geometry Dataset preserves the Reference Build's presentation rules and
the payload exporter was discarding them: `roadAltitudeLookup`, per-instance
`visibility` (the detail cube and far representation), the structure
`rotatedPointDescriptor` and `rotationCenter`, and the `transformContract`.
`orientationBytes` was carried but the renderer ignored it. Payload schema 2
carries all of them.

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
  The focal length is **not** recovered from the original; it remains one constant
  a future decode can replace.
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

**Both the ROM and the original's own display say the decode is correct.**

The scaling code at `$A6F1-$A725` is three identical blocks, one per component:
`EOR #$80`, then four `ASL`/`ROL` pairs shifting a 16-bit pair left by four. X, Y
and Z are treated the same way. There is no separate vertical scale.

The captured C64 interactive display confirms it visually: at grid 8:8 the game
draws a small flat plate with a delta marking sitting on the ground — exactly a
contact-sheet tile. A screenshot of the **Atari ST** version shows recognisable
three-dimensional craft, but that is a different edition with different models and
is not evidence about ours.

Lesson recorded: a plausibility argument produced a confident wrong answer here,
and thirty lines of disassembly settled it. Go to the ROM first.

## Roads are wrongly modelled, and the rule is unknown

A capture of the original at the interactive checkpoint reads `LOCA 08-08` with
`ALT 00000`, and its camera position decodes to X/Z = 559104 — cell 8:8, which
confirms the cell mapping. It draws **a road running to the horizon**, as two
parallel lines, at altitude zero.

Two conclusions follow, and both contradict work done in this pass:

- **The altitude lookup is not a cell radius.** Reading its index as the
  altitude's high byte gives radius zero at ground level, which hid roads exactly
  where the original shows them prominently. That interpretation has been removed;
  every road is drawn again until the real rule is known. The table is still
  carried in the payload.
- **Roads are not cell-owned centre-to-centre links.** The dataset records *no*
  road for cell 8:8, yet the original draws one there. So the four road tables the
  encoding doc describes — "as many as two road/map segments per cell using
  nibble-packed grid points" — are being modelled wrongly, and roads evidently
  have width rather than being single lines.

## The palette is invented

The renderer's black sky and blue-purple ground are guesses. The original's ground
is green. The captured VIC-II registers show border black and background white,
so the sky and ground are drawn as filled geometry rather than as the background
colour, and their colours have not yet been decoded.

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
