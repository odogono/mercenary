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
- **Road extent by altitude.** Roads are now split into one piece per cell at
  export (32 runs became 239 pieces) and culled by the altitude-derived radius.
  The lookup is the Reference Build's; reading its index as the altitude's high
  byte is an interpretation, and gives radius zero — the camera's own cell — at
  ground level.
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

## The open question: are the object models flat?

The contact sheet shows **roughly 50 of 64 objects as flat plates** — a quad or
triangle with a Y span of 160–350 against X and Z spans near 4,000. Only slots
08, 0E, 32, 38 and 3F read as volumes.

Two readings, and the evidence does not settle it:

- **The decode is right and the objects are flat.** The encoding doc states all
  three components use `(raw - $80) << 4`, derived from four shifts at
  `$A6F1-$A725`, and the record arithmetic checks out exactly: model `$1700` is
  1 + 18×3 + 1 + 13×2 = 82 bytes, its recorded span.
- **The vertical component uses a different shift.** The Y span is consistently
  about one sixteenth of the horizontal spans, which is exactly the difference
  between `<< 4` and `<< 8`. Scaling model Y by 16 turns almost every object into
  a plausible volume — boxes, hoppers, a crystal, delta craft. Surface structures
  use a *different* height encoding ("four high bits with `$0F` extension"), so
  per-family encodings would not be unprecedented.

`MERCENARY_MODEL_Y_SCALE=16` renders the second reading for comparison. It is an
experiment, not a fix: "looks more plausible" is not evidence, and the honest
resolution is a side-by-side against the running Reference Build.

## Still open

- **The streaks are not roads.** Long lines radiating across the view survive
  `roadRadius: 0`, and every cell's vertices were confirmed inside its own cell,
  so neither roads nor misplaced geometry explains them. The remaining candidate
  is pipeline step 6 — the original clips lines to the **viewport borders**, which
  this renderer does not do; it clips only to the near plane, so a segment passing
  close to the camera projects to enormous coordinates. Standing inside a
  structure, with no collision, also contributes.
- **The 410 deferred edges** were not attempted this pass. The four affected
  structures, their descriptors (`0x32`, `0x35`, `0x7f`, `0x73`), rotation centres
  and per-point rotation inputs are now all in the payload, so the bounded search
  can start from data rather than from a fresh decode.
