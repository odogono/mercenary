# Switch Damocles Bodies within one Gameplay Session

Extended by [ADR 0050](0050-travel-from-a-sessionless-atlas.md), which admits authored Atlas Travel through the Gameplay Session.


Accepted for the [Gamma System pickup programme](https://github.com/odogono/mercenary/issues/313);
implementation follows its research and design gates. An authored Shell Console action may move
the player to another Body at a validated arrival Pose while preserving one Damocles Gameplay
Session. The Carried Stack, suspended Damocles Scripts, Damocles Display and changes to Object
Residence remain continuous; objects left on a Body remain there when it is revisited.

This extends [ADR 0028](0028-admit-one-development-console-that-writes-play.md)'s development
access to the wider System without requiring recovered vehicle travel first. The action goes
through the Gameplay Session and is explicitly authored, not evidence of the original game's
travel behavior. It does not add a player-facing body chooser or change the sessionless Flyover
of [ADR 0042](0042-fly-a-system-without-play.md). Missing geometry, playable locations or arrival
validation remains a research blocker rather than permission to invent a landing place.

Separate per-Body sessions or restarting on selection would simplify content loading but lose
cross-body inventory and world continuity. One session requires body-aware Object Residence,
current-Body state and content identity, shared by Saves and Session Resume. The follow-on design
must settle loading, switch failure atomicity and explicit schema/compatibility rules before
implementation. A Body change is not a new Title or Destination; the Title-scoped ownership and
isolation established by ADRs 0041 and 0044 remain in force.

The bounded [#300](https://github.com/odogono/mercenary/issues/300) limo-key delivery remains on
Eris. This decision does not admit vehicle travel, later mission progression, Targ changes or a
shared scripting framework.
