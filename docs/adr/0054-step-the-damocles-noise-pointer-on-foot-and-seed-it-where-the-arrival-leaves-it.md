# Step the Damocles noise pointer on foot, and seed it where the arrival leaves it

Accepted, 2026-09-28, for [#582](https://github.com/odogono/mercenary/issues/582). It replaces
decision 4 of [ADR 0053](0053-present-damocles-landing-messages-from-the-recovered-draw.md) ("on
foot the pointer holds") and the seed in its decision 3 ("it starts at 0"). The on-foot pass
period below is an approved, retained difference from the Working Authority.

[The noise draws note](../research/damocles-noise-draws.md) accounts for every read of the pointer
`$7E18`. On foot the main loop's join `$05948C` steps it once a rendered frame, exactly as it does
aboard, and nothing else moves it in the idle scenes traced. A frame on foot runs
`clamp($51D22, 4, 8)` substeps. The six traced scenes ran 7 or 8 substeps a pass, a mean of 7.58
over 270 passes. New Game seeds word 0 (`$051090`). Before the player reaches the start pose, the
descent's streaks then draw 10,085 words and the scripted arrival steps 1,196 passes. The arrival
comes to rest on the start pose at word 1,041. Two runs agree on the pointer at every frame, so
this is a constant of the program.

## Decision

1. **On foot, the pointer steps once a pass.** The session counts on-foot ticks, and on every
   `time.ticksPerPassOnFoot`-th it steps the pointer, as `$05948C` does. Nothing else runs on this
   clock. The on-foot rules keep running a substep per tick
   ([ADR 0049](0049-run-one-damocles-substep-per-tick-without-st-frame-cost.md)). Aboard, the
   craft pass steps it, unchanged
   ([ADR 0051](0051-run-the-damocles-craft-pass-exactly-once-every-four-ticks.md)). The on-foot
   count holds while aboard, and the craft count holds on foot.
2. **Eight ticks a pass on foot.** A tick is a substep on foot, so the period is stated in
   substeps: the traced mean of 7.58, rounded to whole ticks as ADR 0051 rounded its 4.12. It is
   published in the Presentation document's `time` block as `ticksPerPassOnFoot: 8`, provenance
   `derived`. Scenes whose frames took under 8 VBLs ran 7, and are not claimed to match.
3. **A New Game starts at word 1,041** (`NEW_GAME_NOISE`). The port has neither the descent nor
   the arrival, and its New Game starts on foot at the pose where the arrival leaves the player.
   So it starts the pointer where they leave it. On the ST the player then waits aboard for as
   many passes as they choose before leaving. That wait is not modelled, as no other pass count
   the player chooses is.
4. **Save schema 15** carries the on-foot phase as `footTicks`. A restore refuses a phase at or
   above the period. A schema-14 record migrates at phase 0 with its own pointer: it was saved by
   a port that held the pointer on foot, so every phase is one it could have reached. Schemas 11 to
   13 now migrate with the pointer at `NEW_GAME_NOISE`, the pointer a New Game starts at.

## Consequences

- A walk now moves the next landing's draw, about 6 words a second at 50 Hz, where the ST moves
  it about 5.6. Which landings present still depends on how long each mode lasts, and the ST's
  rate on foot is its frame cost, which ADR 0049 excludes.
- A Save made before this ADR, on schema 14, keeps its pointer. Only new games start at 1,041.
- The native draws stay unported until their effects are ported, and each then draws as the note
  records. The explosion debris draws 192 words in its pass. The Geiger tick draws 2 words a VBL on
  the tick clock. A zap rotates the word two before the pointer, and from then on the Save has to
  carry the changed table words. The attack ship (#581) brings the zap and the debris.
- Unresolved: whether the ST accepts `L` before the arrival comes to rest. If it does, a player
  can stand on the start pose with the pointer short of 1,041.
