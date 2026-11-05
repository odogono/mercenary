# Edge Targ's Enhanced Doorway Transition with a flat cover

Accepted, 2026-11-05, for [#979](https://github.com/odogono/mercenary/issues/979). Amends [ADR 0091](0091-freeze-play-for-targs-st-doorway-transition.md), which froze Enhanced Targ for the Doorway Transition but drew no wipe.

Authentic Targ draws the ST's palette raster split ([the recovered wipe](../research/targ-st-doorway-wipe.md)) as its Room's two-colour backdrop strips. Those strips clash with Enhanced Targ's shaded Room. The options were a horizontal edge in a Room's colour at the ST's rate, a short fade, or a freeze with no wipe. A fade loses the wipe's direction, which the ST ties to the way the player crosses. A freeze with no wipe shows a still frame for about a second with no sign of what is happening.

## Decision

- **Enhanced Targ draws the wipe as a flat cover with a clean edge.** Its timeline is the ST's: the same direction, 4 rows a VBL, and the same holds. The cover runs from the top of the view to the split.
- **The cover is the covering Room's Enhanced backdrop colour.** This is the colour that Room clears to in Enhanced Targ: the departed Room's going up, the arrived Room's going down. It has no lines, shading or Haze, as the ST's fill has none.
- **The Room on show is drawn shaded, as in play.** Below the split, the shared planner (ADR 0087) draws the Room the Authentic wipe shows whole: the arrived Room going up, the departed Room going down. Nothing is redrawn from a new viewpoint while the freeze runs.
- **The cover is the plan's view-fixed layer,** the same layer the Lift Journey's bar uses (#957).

## Consequences

- Both presets show the wipe's direction and timing. They differ only in how the cover and the Room under it are drawn.
