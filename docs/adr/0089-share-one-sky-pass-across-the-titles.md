# Share one Sky Pass across the Titles

Accepted, 2026-11-05, for [#969](https://github.com/odogono/mercenary/issues/969). This finishes the sky that [ADR 0087](0087-draw-targs-enhanced-view-through-the-shared-planner.md) left outside the planner.

#956 put Enhanced Targ's sky into the shared renderer's sky pass, but as finished triangles built in `sky/view.ts`, beside the `SkyPass` Damocles and Mercenary III fill. That `SkyPass` was laid out in Damocles's screen-pixel rows and could not say Targ's twilight gradient or the moons' phases.

## Decision

- **One `SkyPass` (`web/src/enhanced/sky.ts`) is the Enhanced sky for every Title**, and `skyPassTriangles` is the one place it becomes triangles. Targ's adapter (`sky/view.ts`) fills it from its orrery; the planner draws Damocles's and Mercenary III's through the same function.
- **The pass is drawn in layers, back to front**: an optional gradient dome, the stars, then the Bodies in list order. A one-colour dome is the sky fill and draws nothing.
- **The pass keeps two kinds of disc.** A Damocles disc stays in the ST's screen rows, with its pixel tests, horizon cut and comet, as `$045916` draws it. Targ's sun and moons are **Orbs**: a fixed angular size facing the eye, lit toward the sun with a phase cosine, the rim and terminator feathered over an output pixel. Both lay a disc out as rows split at a terminator; they differ in the plane the rows lie in and in how size is measured, and folding one into the other would move one Title's pixels.
- **Stars come in two kinds as well**: the ST's star pixels, and stars by direction with an alpha over the sky behind.
- **A feathered edge blends into the layers already drawn**, not into the dome alone. A moon's rim over the sun blends into the sun, which removes the fringe #970 left.
- The view supplies what the pass cannot know: how it turns a direction or an offset into view space, the sky's depth, one output pixel, and the horizon row.

## Considered Options

- **Keep Targ's triangles beside the planner.** Rejected: two sky descriptions and two triangulators, which #969 set out to end.
- **One disc kind for every Title.** Rejected: Damocles's discs lie in the screen plane and Targ's face the eye on the sky's sphere; either rule moves the other Title's discs.
- **Blend Orb edges with GPU alpha.** Rejected: the sky pass writes opaque colour, and sampling the layers behind needs no renderer change.

## Consequences

- Targ's sky is unchanged to the bit except where a moon's soft rim crosses the sun. Damocles's and Mercenary III's are unchanged, and no Golden Trace changes.
- Targ still draws its sky in its own view, not the planner's camera, since its plan is mirrored after planning.
