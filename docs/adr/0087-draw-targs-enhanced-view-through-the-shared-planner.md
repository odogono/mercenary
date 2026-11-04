# Draw Targ's Enhanced view through the shared planner

Accepted, 2026-11-04, for [#883](https://github.com/odogono/mercenary/issues/883). This amends [ADR 0077](0077-share-one-enhanced-planner-across-damocles-and-mercenary-iii.md), which shared the Enhanced planner between Damocles and Mercenary III only, and carries out the convergence [ADR 0082](0082-make-enhanced-the-primary-target-for-new-work.md) names.

Targ was the last Title drawing Enhanced on its own. `web/src/shell/frame.ts` drew pre-projected Screen Lines in Ink pass order with no depth test, with only the Geometry Asset faces from #863 depth-tested. Targ joins `planEnhancedFrame` and `FrameRenderer.render`, but its records don't fit the planner's Damocles-shaped selection: Targ has no regions or Enclosed Regions, and it chooses what it draws by Structure Reach, Far Point eligibility and Map Lines.

## Decision

- **Targ's adapter chooses which structures and objects are drawn. The planner draws them.** Targ's recovered selection rules stay in its adapter, which hands the planner placements that are already selected. The planner owns the drawing: layer order, depth, strokes and colour at the renderer boundary. This is the one place Targ departs from ADR 0077's "adapt the data, not the rules".
- **Roads are the exception: the planner selects them for every Title** by one rule. Each Title supplies its Horizon Distance table, indexed by raw Y in 2048-unit steps, and its road runs for each cell. Damocles's `$915A` curve, which Mercenary III shares (#724), is its Horizon Distance. Targ's Map Lines and the black Ink lying on the ground go in the road layer.
- **Far Forms follow one shared reach rule.** An object outside its detailed reach draws its Far Form: a Far Point, or nothing. Targ's extra rule, that a below-eye Far Point shows only within Horizon Distance, is data on the point that only Targ fills in.
- **Screen Lines leave Enhanced.** Enhanced Targ gives the planner view-space geometry, and the GPU projects it. Screen Lines stay Authentic's input and the Trace Oracle's, so no Golden Trace changes. The two presets may differ by sub-pixel projection on the same frame.
- **Enhanced wireframes are depth-tested.** Depth decides what is in front. Ink becomes a resolved colour plus an emission order, black Ink before white, so exact ties fall to draw order as in ADR 0077. Where Targ relied on overdraw, the difference is named on the ticket, not patched.
- **Ink weight and glow become shared Enhanced stroke settings for all three Titles.** Their defaults leave Damocles's and Mercenary III's output unchanged.
- **Authentic Targ stays on `shell/frame.ts`.**

## Considered Options

- **Make Targ's selection a planner rule, or fake Damocles regions in the adapter.** Rejected: one would bend the planner around a single Title, and the other would invent data.
- **Keep Targ's Enhanced view in screen space and add depth to it.** Rejected: Targ would stay a second Enhanced renderer, which ADR 0082 set out to end.
- **Draw Far Points as a Targ overlay with no depth test.** Rejected: a near building has to hide a distant point.

## Consequences

- The move lands as five issues under #883. In order: Room Line Colour (#874), shared stroke settings, shared reach and roads, Haze (ADR 0088), and finally Targ's adapter for the surface and Rooms. After that, the road split, the glow pipeline and the Distant Structure fade are deleted from `shell/frame.ts`.
- These stay outside the planner for now, each with its own follow-up issue: Targ's sky (drawn as a pass before the plan), the dark Room (an empty frame), the Lift Journey's bar, the Arrival, and Sunlight on Targ.
