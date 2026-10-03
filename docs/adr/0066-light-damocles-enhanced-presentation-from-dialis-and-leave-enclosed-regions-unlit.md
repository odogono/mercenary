# Light Damocles Enhanced presentation from DIALIS, and leave Enclosed Regions unlit

Accepted, 2026-10-02. Enhanced presentation's Cast Shadows used to fall from an authored sun fixed in `web/damocles/eris.json`. They never moved through a Body Day, they fell by night, and they lit Enclosed Regions that have no window. Now that the sky draws DIALIS where the Working Authority does ([#530](https://github.com/odogono/mercenary/issues/530)), the light should come from there.

## Decision

- **Sunlight comes from DIALIS where the sky pass draws it this frame**, in Enhanced's smooth motion. The authored `sunDirection` is gone, and no other Body gives light.
- **Sunlight's strength is the terminator's `daylight` times a fade over DIALIS's first two degrees of elevation.** The terminator switches 8–12 s after DIALIS crosses the horizon on ERIS, so both are needed: the sun never lights a night palette half, and never lights from below the ground. It is zero while DIALIS is a Destroyed Body.
- **An Enclosed Region (`$7B34` bit 15 clear) receives no Sunlight.** A region not enclosed, such as the Capital Spaceport, is lit through its own openings by the shadow map. Nothing is enclosed aboard, where the `whole` draw's roofs cast the shadow instead (#717, #718).
- **A face Sunlight does not reach shows its recovered colour unchanged.** The ambient pair is neutral, and `sunColour` is what full Sunlight adds on top, so Sunlight only brightens. A frame without Sunlight draws through the flat path, as it already does when the Cast Shadow edge is off.

## Considered Options

- **Keep the authored sun and only hide shadows by night.** This is the smallest change, but the light would still disagree with the disc the player can see.
- **Darken Enclosed Regions through the geometry alone.** 126 of 598 enclosed regions have no ceiling face over their whole floor, because the ST draws the ceiling as a clear colour. Closing them would mean inventing geometry the game does not have.
- **Classify interiors as windowed or windowless by hand.** The engine already makes this distinction with the enclosed flag, so an authored list would duplicate a recovered fact.
- **Keep a dim ambient and tune night and interiors separately.** The ST's night palette half and Floor scene colours already set the mood. Darkening them again would make windowless rooms and nights dimmer than the original, and would need tuning for each.

## Consequences

- Sunlight is derived each frame from state the Save already holds: the Body turn, the Pose and the destroyed Bodies. No Save schema changes.
- By day, sunlit faces are brighter than the ST's palette. This is a Departure that only Enhanced presentation makes. Authentic is unchanged.
- The spaceport window e2e and the #376 capture matrix pin a Body turn with DIALIS in the west, because a fresh game's turn has DIALIS setting in the east.
- The light basis turns every frame, so shadow edges can crawl slowly. If that ever shows, step the light in the engine's 1/1024-turn increments. (It showed as frame-rate shimmer, not a crawl. [ADR 0069](0069-ray-test-damocles-cast-shadows-against-their-casters.md) replaced the maps with exact edges.)
