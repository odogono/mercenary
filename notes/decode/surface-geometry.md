# Surface geometry and object placement

Established while building M1 (the surface walkabout), from the World Geometry
Dataset the extractor already produces. No new ROM decoding was needed.

## World frame

- The surface is a **16 × 16 grid** of cells, each **0x10000 (65,536) units** per
  axis. Total extent 0…1,048,320 in X and Z.
- **Y is the vertical axis and ground level is exactly 0.** Two thirds of surface
  vertices sit at y = 0; structures rise from it in quantised steps (256, 512,
  768, 1024, 1536, 2048, 3072 …) to a world maximum of 5,888.
- Structure heights are therefore small relative to a cell: the tallest thing on
  the planet is about 9% of one cell's width. Standing on the ground, distant
  cells read as a thin band at the horizon; this is correct, not a bug.

## Surface cells

- Cell expansion yields vertices of two kinds. **`world-point`** carries an
  absolute position and accounts for 6,826 of 6,987 vertices. **`rotated-input`**
  carries a rotation input instead, because the Reference Build rotates those
  points at runtime.
- 13 of 255 structured cells contain rotated vertices, which are resolved from
  their decoded descriptor, centre and per-point input at presentation time.
- 83 shared structures also address the occupied cell's four Road Workspace
  points. Across their placements these are 478 point references used by 956
  structure-edge instances; the renderer resolves them from that cell's two road
  runs rather than treating them as malformed local indices.
- Edges carry one of two ink operations, `white` and `black`. Rendering the second
  dimmer preserves the structure the split encodes.

## Roads

- 32 undirected road segments after deduplication. Each is listed from **both**
  ends in the dataset (cell A names the segment to B, and B names it back to A),
  so an exporter that does not deduplicate produces 64.
- Endpoints are grid coordinates, not world coordinates: a road joins cell
  centres.

## Object models and instances

- 55 models, 64 instances. Model vertices are **centred on the model's own
  bounding cube**, spanning roughly -2048…+2032 per axis. They decode as
  `(rawByte - 0x80) << 4`.
- **48 of 55 models are thinnest in Y** (y-spans of 48–256 against x and z spans
  near 4,000) — they are wide, flat, horizontal shapes. This is what settles Y as
  the models' vertical axis too.
- An instance position alone does not say where a model's base belongs, because
  the model is centred rather than resting on its origin. The app **grounds**
  models: the lowest vertex lands on the instance's height. That is a
  modernised-feel placement judgement, not a decoded fact — flagged here so it is
  not mistaken for one.
- `roomMembership == 0` means the instance is on the surface and its position is
  in world coordinates. A non-zero room means the position is **room-local**, so
  those instances must not be drawn on the surface. Instances in rooms cluster in
  small coordinate ranges (hundreds to low thousands), which is the tell.
- A handful of instances sit far outside the world bounds (x down to -7,835,136).
  Treat them as parked or unused slots rather than placeable geometry.

## Datasets

Several geometry datasets exist under ignored `work/`. Only
`world-geometry-965cf8fe0d122d28` passes `lab geometry verify` and matches the
recorded maintainer approval; the others fail on duplicate Geometry Identities.
Export the payload from that one — for example
`work/geometry-issue-7-final-965cf8fe/`.
