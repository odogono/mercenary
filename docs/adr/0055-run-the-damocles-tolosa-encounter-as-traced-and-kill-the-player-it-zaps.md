# Run the Damocles TOLOSA encounter as traced, and kill the player it zaps

Accepted, 2026-09-28, for [#581](https://github.com/odogono/mercenary/issues/581). It extends
[ADR 0051](0051-run-the-damocles-craft-pass-exactly-once-every-four-ticks.md) with a pass that
follows the craft Mover's. It carries out the noise table part of
[ADR 0054](0054-step-the-damocles-noise-pointer-on-foot-and-seed-it-where-the-arrival-leaves-it.md)'s
consequences. The noise-flash look below is an authored presentation. Its length is a measured
value, not a derived one.

[The TOLOSA encounter note](../research/damocles-tolosa-encounter.md) models the moving-object
pool as three routines: the fire launcher `$050B96`, the stepper `$050ABC` and the attack routine
`$050D80`. The model reproduces every one of 2,176 traced passes. Only the aboard frame path calls
all three, at `$05987A`. The space path calls the first two, and the on-foot path calls none. A
zap sets `$7A64` to 1, and the death loop then waits for Load or Quit. The pool, the gate and
`$7A64` are all inside the original's saved range.

## Decision

1. **The pool is three Effect Slots, run exactly.** Slots 8 (the player's shot), 11 (the ATTACK
   SHIP) and 15 (its shot) hold a counter, a position, a velocity and a body byte, as the resident
   arrays hold them. `encounterPass` is the three routines in the original's order, and the
   traces in `traces/damocles/encounter/` are its test. The Catalogue's `craft.encounter` block
   publishes the routines' operands, each checked against its instruction. It also publishes the
   first world's records, which a New Game starts from. A New Game's ship starts from its stale
   first-world position.
2. **It runs once a craft pass, after the Mover.** On a Body all three routines run. In space
   only the launcher and the stepper run, and the body byte and selector are `$FF`. On foot
   nothing runs. A craft that enters space that pass skips the pool, as `$05976A` jumps to the
   join. A hard touchdown on land runs it with the launcher refused, because the landing handler
   has already left the craft.
3. **The pass reads the craft words as `$05987A` sees them.** The camera is the craft's position,
   with X and Z masked to the surface's 28 bits on a Body, and the space words in space. The
   frame sines are the attitude this pass left. The selector is 4 × the Body.
4. **Fire is a level.** `F` is held in the Control Profile, and the session reads it as the
   joystick's fire bit. A held `F` fires again on the pass after each shot runs out, which is one
   shot every 32 passes.
5. **Moving objects are drawn but never selected.** A record stamped with the current Body is
   drawn at its position, except from an enclosed region. It is excluded from the Selection. This
   exclusion is authored: on foot the pool is frozen, and whether a shot left in the air can be
   taken is unrecovered.
6. **A kill** asks for the shot cue and presents `$31`. It sets the flash word `$AA00`, which the
   session shifts a tick at a time as the VBL handler does, painting the view white on each set
   bit. The gate clears.
7. **A zap kills the player.** It asks for the zap cue, turns the noise word two before the
   pointer, and starts the Death State:
   - For `time.zapNoiseTicks` (98, `observed`) the main loop is blocked. Nothing moves, and noise
     bands of the table's colours are painted over the view.
   - Then `$30` is presented and the flash word is `$AAAA`. The view fades one palette level a
     component every 8 ticks for 8 steps (`$050FAC`).
   - The Body then reads VOID (selector `$78`), and `$21` is presented once the row is free.
   - Every action is refused. Only a restore leaves the Death State: the System Menu's Load or
     New Game stands in for the original's HELP menu.

   The fade and the flash are exact in palette space. The noise's look is authored.

8. **Save schema 16** carries `encounter` (the three records and `dead`) and `script.zaps`, the
   turned table words. A Save made while dead restores dead, as the original's F1 does. A null
   `encounter` is the first world's pool, alive. Schemas 11 to 15 migrate that way, with no turned
   word. The rule that the TOLOSA flag needs the gate is dropped, because a kill or a zap clears
   the gate and leaves the flag. An armed gate still needs the flag.

## Consequences

- After a TOLOSA landing aboard, the ship arrives from the first world's stale position. From the
  parked limo that took about 1,100 passes: 12 steer cycles, each leaving −27/64 of the
  separation. The traced runs took 3 minutes of ST time, and the port's 4 ticks a pass make that
  about 90 seconds. Leaving the craft freezes the encounter, and it resumes on boarding. It follows
  the player to any Body.
- The only way out of death is a restore. The ST keeps a zapped word across a load in the same
  session, because the table lies outside the saved range. The port restores the Save's own turned
  words, so a restore made before a zap reads the table unturned.
- `$30` and `$21` are presented only when no script holds the row, which is the port's existing
  rule for native strings.
- `$7A64` is also the hazard alarm: the ten-second warning and then FROZEN, FRIED or SUFFOCATED.
  That alarm reaches the same death loop and is not ported. The Death State is what it will
  reach.
- Unresolved: an ordinary landing on TOLOSA aboard was not traced, and neither was taking a frozen
  shot on foot.
