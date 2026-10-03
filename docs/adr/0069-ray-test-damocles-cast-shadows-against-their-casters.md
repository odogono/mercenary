# Ray-test Damocles Cast Shadows against their casters

Accepted, 2026-10-03, for [#380](https://github.com/odogono/mercenary/issues/380). Amends the closing consequence of [ADR 0066](0066-light-damocles-enhanced-presentation-from-dialis-and-leave-enclosed-regions-unlit.md).

Enhanced presentation draws Cast Shadows from two 2048² shadow maps. Their edges stair-step far more coarsely than the polygon edges beside them (#376). Since Sunlight follows DIALIS (ADR 0066), they also shimmer at the frame rate while the player stands still. The texel snap is anchored at the world origin, millions of units from the eye, so the smallest turn of the light lands each frame's grid at a random sub-texel offset. `docs/research/damocles-cast-shadow-options.md` measures this and three remedies.

## Decision

- **A Cast Shadow is found by testing the fragment's ray toward DIALIS against the caster triangles, not by sampling a map.** Under an orthographic sun that ray is one point in the light's plane. The casters are projected into that plane once a frame and listed in a grid of 32-unit cells around the eye. Each fragment tests only its own cell.
- **The casters are the structures.** The Body's surface, the island fills and the ground records lie flat on the ground and cast nothing.
- **The edge is exact.** It is as crisp as the polygon edges beside it at any distance, and it slides with DIALIS instead of being resampled.
- **The ray test replaces the shadow maps outright.** The `SHADOWS` row becomes OFF / ON, and a stored `soft` or `hard` reads as ON. There is no softened edge; one could later be drawn as a narrow band around the exact edge, without a map.

## Considered Options

- **Keep the maps and hold the sun between 1/1024-turn steps.** This stops the shimmer between steps, but the stair-steps remain and every edge jumps once a step.
- **Stencil shadow volumes (#380 as filed).** They draw the same picture. They cost about twice the GPU time, and they need a stencil buffer, a second colour pass that repeats the layer draws under `EQUAL` depth, and a near-clip-only vertex shader.
- **Finer or more cascades.** These shrink the stair-steps but keep them, and do nothing for the shimmer.

## Consequences

- Shadow edges no longer crawl as DIALIS moves, so ADR 0066's advice to step the light does not apply.
- The lit rim where a roof meets its wall (left over from #231) is gone, because the roof shadows the wall right up to the junction.
- A receiver more than 8,192 units from the eye in the light's plane is lit. That is beyond any Floor or apron reach, but not beyond a long shadow seen from the air.
- A self-shadow epsilon, with a fixed part and a part that grows with distance, replaces the maps' normal-offset and depth biases.
- The shadow maps, their cascades, their compare samplers, the PCF blur and the bias tuning are gone, leaving one Cast Shadow path.
- A player who preferred the softened edge loses it.
- The player may set how much of the Sunlight a Cast Shadow takes away (`SHADOW DEPTH`) and scale the ambient pair (`AMBIENT LIGHT`). Both are preferences, at 100% by default, and neither affects a frame without Sunlight.
