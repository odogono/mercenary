# Share one renderer across the Titles, with an Authentic indexed mode

Superseded in part by [ADR 0077](0077-share-one-enhanced-planner-across-damocles-and-mercenary-iii.md): Enhanced shares one planner across Damocles and Mercenary III, which starts in Enhanced.

Accepted, 2026-10-01. The direction is that Targ, Damocles and Mercenary III draw through **one shared renderer**. Each Title keeps its own **frame planner**: its own rules for what a frame contains and the order it is painted in. Planners hand the renderer a title-neutral frame description, and the renderer has two modes.

- **Authentic** paints that description into an indexed screen, in the order given, with the Title's palette rules: allocation, raster splits, panel palettes. It shows the result at whole-pixel scale. There is no depth buffer. Each Title's original paints far to near in an order its engine decides, and fidelity comparisons against the original's own frame buffers are made in this mode.
- **Enhanced** draws the same description on the GPU at display resolution, with the presentation choices the Damocles renderer already offers: depth, resolution scaling, lighting and shadows. It may settle ties with depth where the original relied on order. Under ADR 0011's discipline, it makes no parity claim.

Today the Titles draw three ways. Targ draws through the Browser Shell's frame renderer (`web/src/shell/frame.ts`). Damocles draws filled faces through a WebGL renderer with a log-depth buffer, from Damocles's own `ErisFramePlan`. Mercenary III ([#647](https://github.com/odogono/mercenary/issues/647)) draws through a software rasteriser into an indexed 320×200 screen, from its own planner. The MIII rasteriser was built that way because its slice is accepted by comparing against the game's frames pixel for pixel (96.9% mean agreement across eleven checkpoints), and that comparison needs index-level output and the original's painter's order.

## Decision

- The renderer is shared and the planners are not. A planner encodes a Title's recovered visibility and ordering rules: Damocles's plan and detail selection, MIII's region queues, occupant hooks and zone priorities, Targ's draw list. Those differ by Title and stay with the Title's session (ADR 0043).
- The shared frame description is ordered screen-space or camera-space polygons and lines. Each carries a colour as a palette index or a resolved colour, its source and its draw order. Mercenary III's `planDionFrame` output and indexed raster are the first Authentic implementation. Damocles's WebGL renderer is the first Enhanced one.
- Convergence is incremental. Each Title is moved behind the description when it next needs renderer work, and its existing Golden Traces and screenshot baselines stay green. No Title's planner is rewritten to fit another's.
- Mercenary III defaults to Authentic and remembers its own presentation choice when its Enhanced path exists. Damocles keeps its current presentation and preset choices until its planner emits the shared description.

## Considered Options

- **Keep one renderer per Title.** This is simplest now, but it triples presentation work and keeps the Titles' Enhanced features apart. The project's direction is one implementation.
- **Port MIII onto the Damocles WebGL renderer now.** This loses the painter's order and index-level output the MIII slice is accepted on, and the depth buffer would hide ordering mistakes the comparisons are meant to catch.
- **One renderer with Authentic and Enhanced modes over per-Title planners.** Taken. Fidelity checks keep the original's order and palette, and the presentation work is shared.

## Consequences

- [#672](https://github.com/odogono/mercenary/issues/672) follows this ADR: the shared frame description and an Enhanced path for Mercenary III.
- `web/src/dion/raster.ts` is the seed of the Authentic mode and should stay title-neutral. Its MIII facts (focal 256, centre (160, 68), 136 view rows) are passed in by the planner as it moves behind the description.
- ADR 0062 retains camera geometry and the accepted projection together in the shared description. Mercenary III’s first Enhanced slice uses flat colours and painter order at display resolution through the same renderer as Damocles; depth, lighting, shadows and resolution controls for Mercenary III are follow-ups.
- Panels stay with their Titles. They are drawn from each original's artwork or rendition, outside the 3D renderer.
- ADR 0043's rule of sharing only pure seams is kept: the renderer is a pure seam over a description, not a shared session.
