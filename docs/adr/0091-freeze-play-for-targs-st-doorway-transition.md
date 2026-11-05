# Freeze play for Targ's ST Doorway Transition

Accepted, 2026-11-05, for [#976](https://github.com/odogono/mercenary/issues/976). Narrowly amends [ADR 0072](0072-render-targs-panel-from-recovered-st-presentation.md), which admits ST presentation while the C64 Reference Build stays the authority for Targ Game Semantics.

The Atari ST wipes the 3D view with a palette raster split when the player takes a Doorway ([the recovered wipe](../research/targ-st-doorway-wipe.md)). It runs inside the frame flip, so the main loop stops for 54 VBLs (upward) or 58 (downward) while the VBL handler keeps the panel and sound going. Drawing the wipe without that stop would show a player walking through a frame that is not redrawn. The stop is a change of timing, so it is a Game Semantics question.

## Decision

- **The Doorway Transition is an ST presentation that freezes play.** Taking a Doorway into another Room starts it in the one Gameplay Session (ADR 0018), as a Lift Journey is. While it runs, the Mover, Doorways and Free Look do not run; Benson, the panel, sound and the clock do.
- **It is opt-in on the Session.** `GameplaySession.doorwayTransitions` is off by default, so Golden Traces, Replay Gates and every C64-graded test keep the Reference Build's timing. The Browser Shell turns it on under either Presentation Preset.
- **Authentic Targ draws the split.** The rows above the split show a Room's own backdrop with no lines; one Room's frame shows whole below. Enhanced Targ freezes for the same time and draws its view as usual.
- **It is never saved.** A Save taken during it restores with play running.
- **The direction is the confirmed physical rule.** Ten real ST crossings show the wipe goes up when the player walks forward through the Doorway's wall and down when they back through it, on every wall. `doorwayWipeDirection` reads that rule from the browser's own heading and the Doorway's wall, not the ST's position and heading words.
- **Keys wait for the freeze to end.** The ST queues keys pressed during it and reads one per pass afterwards. The Browser Shell holds discrete actions pressed during it and performs one per frame once it ends. Movement is a level, read afresh when play resumes.

## Consequences

- Play pauses for about a second at every Doorway in the browser, as on the ST and unlike the C64.
- Enhanced Targ's own wipe is a follow-up.
