# Share one Enhanced planner across Damocles and Mercenary III

Accepted, 2026-10-06, for [#803](https://github.com/odogono/mercenary/issues/803). This supersedes the Enhanced clauses of [ADR 0060](0060-share-one-renderer-across-the-titles-with-an-authentic-indexed-mode.md) and [ADR 0062](0062-retain-camera-geometry-and-accepted-projection-in-frame-descriptions.md), ADR 0060's rule that Mercenary III defaults to Authentic, and [ADR 0067](0067-share-numeric-sky-helpers-with-dion-owned-presentation-data.md)'s rule that presentation stays local to each Title, as far as it concerns Enhanced.

Under ADR 0060 the Titles shared a renderer but not a planner. Mercenary III's Enhanced view drew its own Frame Description in painter order, without depth, lighting or Damocles's smooth sky, so the two Titles looked different on the same engine. Its sky Bodies, built from ST rows, were jagged.

## Decision

- Damocles and Mercenary III share **one Enhanced planner**, `planEnhancedFrame` in `web/src/enhanced/`, and one renderer entry, `FrameRenderer.render`. The planner's rules for what is drawn are the ones the Damocles port recovered: the draw bound, structure selection by region (`web/src/structure/selection.ts`), Enclosed Regions, island and base-plane fill, roads, the sky pass and Sunlight with Cast Shadows (ADR 0066).
- Each Title supplies an Enhanced scene: a surface of placements in raw engine units, the Pose, the bound structure, the sky pass and the presentation camera (`web/src/enhanced/scene.ts`). The Title's adapter fills these from its own recovered records. Where Mercenary III's data differs from what the planner reads, the adapter adapts the data, not the planner's rules.
- Per-frame model forms are chosen by the shared planner for both Titles: beacon blink, viewer-box face lists, articulation, and live text and TV frames. View-fixed models (Mercenary III's passenger and pilot heads) are a planner input that Damocles leaves empty.
- Authentic is unchanged: each Title keeps its own Authentic path. Mercenary III's Authentic still paints its Frame Description into an indexed screen in the original's painter order.
- Mercenary III starts in Enhanced, as Damocles does, and uses the same viewer layout and Enhanced settings.

## Consequences

- The work lands as #804 (the extraction, with no change to Damocles's output, pinned by `web/test/enhanced-frame-snapshot.test.ts`) and then #805 to #808.
- View-fixed models, such as Mercenary III's cab and driver's head, are a layer of their own. They are painted after the world over a cleared depth buffer and in their recovered colours, as the ST paints them last. They would otherwise sink into the ground they stand on, and no Sunlight reaches inside a cab.
- The shared planner draws a mesh's line records as strokes one output pixel wide, after the mesh's faces, in the plane of the face they lie on. Damocles's Enhanced view had left them out.
- Mercenary III's region-queue occupant hooks and its painter-order sort have no Enhanced counterpart: depth decides what is in front, and exact coplanar ties fall to draw order as in #545. Where the original relied on overdraw to hide geometry, the difference is named on the ticket, not patched in Enhanced.
- Once Mercenary III no longer draws Enhanced through it, the Frame Description's GPU path (`FrameRenderer.renderDescription`) is removed. The Frame Description itself remains Authentic's input.
