# Play with a gamepad, and offer Strafe and Free Look as Extensions

Proposed, 2026-09-30, for [#654](https://github.com/odogono/mercenary/issues/654) and [#655](https://github.com/odogono/mercenary/issues/655).

Players want the console layout: the left stick moves and the right stick looks. Neither
original supports it. Both read only a digital joystick: C64 port 2 at `$B2FE` for Targ, and the
`$79C2` stick byte for Damocles. There is no sidestep in either game. On foot the Pose's pitch
is always level (`$7AC0` in Damocles), and aboard the pitch is the craft's own attitude.

## Decision

1. **A gamepad is a second Control Profile.** It drives both Titles through the same Movement
   Intent and Semantic Actions as the keyboard. Its buttons are one more column in `BINDINGS`
   (ADR 0056), so the Controls Page lists them too. Keyboard and pad are live together: their
   Intents are merged each step and clamped, and suspension releases the pad as it releases
   the keyboard. The pad drives play only; the Browser Shell's menus stay keyboard-driven for
   now.
2. **Sticks are quantised.** Each axis gives -1, 0 or +1 past a deadzone. A pushed stick then
   acts exactly like the original joystick, so the pad is an Accommodation, and no speed or
   timing exists that the original lacked.
3. **Stick meanings depend on Occupancy.**
   - On foot: left Y walks, left X strafes, right X turns and right Y is Free Look.
   - Aboard: both sticks' X turn, right Y pitches the craft and left Y is unused.
   - Throttle stays on buttons as discrete steps.
   - With Extended Controls off, left X also turns and right Y does nothing on foot.
4. **Strafe and Free Look are Extensions, turned on together by Extended Controls.** The
   setting is a Browser Shell preference and is off by default. Both features also get
   keyboard Bindings.
   - **Strafe** belongs to the on-foot Mover; it is not a third Mover (ADR 0016). It is a
     sidestep at the walk step that meets every refusal, gate and trigger walking does.
     Running scales it, and walking and strafing together are clamped to walking speed.
   - **Free Look** writes the Pose's pitch within about ±60°, at a fixed rate. The view stays
     where it is left, and a button recentres it. Picking and drawing follow it. It returns to
     level on boarding, on leaving, on a Location change, at the Arrival, and when Extended
     Controls is turned off.
   - **Neither is saved.** Saves and Session Resume keep no look pitch, and a loaded Save
     starts level. No schema changes.
5. **Buttons follow the standard Gamepad API mapping.** Every connected pad is read and merged.
   An axis counts as pushed past 0.5.

   | Button | On foot | Aboard |
   |---|---|---|
   | RT | FIRE | FIRE |
   | LT | — | SHUT THROTTLE |
   | RB / LB | ROTATE STACK › / ‹, or PAGE with a document open | THROTTLE UP / DOWN |
   | A | BOARD | LEAVE CRAFT |
   | X | TAKE | TAKE |
   | B | DROP | DROP |
   | Y | RIDE LIFT | — |
   | D-pad ↑ ↓ ← → | OPEN, READ, PREVIOUS, NEXT | same |
   | L3 | RUN | — |
   | R3 | recentre Free Look | — |
   | Back | SKIP MESSAGE | LAUNCH |
   | Start | System Menu | System Menu |

   Throttle notches, reverse, Floor numbers and AUTHORS COMPUTER parameters stay on the
   keyboard, because each needs a digit.

## Considered

- **Proportional sticks.** They feel more console-like, but they invent part-speed walking,
  turning and pitching that the original never had.
- **Free Look as a camera-only view pitch.** It would keep the Pose untouched, but picking and
  drawing would then have two answers to where the player is looking.
- **A third Mover for Strafe.** It would duplicate the on-foot refusal and trigger path that
  Strafe must obey anyway.
- **Always-on Extensions.** They would get in the way of side-by-side fidelity play
  (ADR 0014), where the default must be the original.

## Consequences

- Faithful play, which is the default, is unchanged. The pad by itself is an Accommodation.
- With Extended Controls on, routes can be walked sideways and the player can look up and down
  on foot. Both are non-original, and that is the point of making them opt-in.
- A Save made with Extended Controls on is valid, and identical, with it off.
