# Situate Targ in an authored System under Gamma's rules

Accepted, 2026-10-31, for [#942](https://github.com/odogono/mercenary/issues/942) and [#943](https://github.com/odogono/mercenary/issues/943). This supersedes the Targ Orrery's orbital model (ADR 0025, and the Targ half of ADR 0042) and amends ADR 0032's descent.

Targ gets a **Targ System**: an authored document in the same shape as the recovered Gamma System, holding TARG, its sun and its two moons, under the Gamma System's rules. Bodies do not move. Body Rotation is the only motion. Primary groups Bodies and asserts no revolution. The Targ Orrery stops being a Kepler simulation of its own and becomes a view of Targ's sky read from the System. One model for every System is the point: the Flyover, the sky and the Arrival read Targ and Gamma the same way, and nothing about Targ needs rules Damocles does not have.

The cost is visible and accepted. With static Bodies, the sun–moon–Targ angle never changes, so each moon keeps one phase; only its place in the sky moves as Targ turns. Targ's Body Day keeps the Orrery's current day length, so time of day over the city does not move with the change. Nothing in the System is recovered and every value is marked authored. It is presentation only: no Game Semantics, no Save schema change.

As in Gamma (ADR 0014), System units and Surface Cells stay separate with no physical scale joining them. The one place they must meet is the Arrival, and it owns that join as an authored switch height.

**The Arrival is the System's first consumer, and its descent changes.** The original's crash is ordinary craft flight at very high speed: straight down from space, Targ growing from a dot to fill the frame, the city road plan appearing, then impact. ADR 0032's 35° dive and its roll were authored around a ground-fill limit that the projection has since lifted, and the roll had no evidence behind it. The descent is now one straight-line fall from a position in the Targ System above the 8:8 pad, flown by the craft flight model on a throwaway state while the Gameplay Session stays idle, exactly as ADR 0032 requires. Targ's disc is sized from its System radius and the distance, the view switches to the surface renderer when the disc fills the frame, the space segment's stars are the System's Star Sphere, and the impact is the flight model's own crash verdict. This applies under both Presentation Presets, for ADR 0032's reason: there is no recovered opening for Authentic to keep.

## Considered Options

- **Keep the Orrery's orbits beside a static System.** Rejected: two motion models for one sky, and Targ would follow rules Gamma does not.
- **One physical scale for the Targ System.** Rejected: Gamma has none, and the join is tuned against the original recording, not derived.
- **Put the descent in the Gameplay Session.** Rejected: it would change the Save schema and undo ADR 0032's held opening script for the sake of resuming a cinematic.
