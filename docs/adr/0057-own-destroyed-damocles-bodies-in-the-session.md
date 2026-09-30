# Own destroyed Damocles Bodies in the Gameplay Session

Proposed, 2026-09-29, for [#624](https://github.com/odogono/mercenary/issues/624), under the [endgame map](https://github.com/odogono/mercenary/issues/580).

The Working Authority marks a destroyed Body in its Body table and removes every resident whose Association B names it. The port previously inferred DAMOCLES's disappearance from the Impact Clock alone; that cannot represent BOOK, NOVABOMB, AUTHORS COMPUTER or unravelling endings, and cannot survive a Save. The Gameplay Session now owns the destruction and publishes it to every reader.

## Decision

1. **Keep destruction by Body identity.** `destroyedBodies` is an ordered set of Catalogue Body ids in Session State and the Save Snapshot. Its length is `$7BEA`; no separately mutable count can disagree with it. `destroyBody` is the single marker for impact and the later dispatchers. A repeated request for the same Body is inert. The marker records the Body's System centre as the blast centre (slot 74), removes placed Object Residences whose current Association B names it, and starts the `$04CCD2` debris lifetime away from the player. The 64-pass lifetime and 192 noise draws are recorded; the particle rendering awaits a traced visual port. A player on the Body enters the existing Damocles Death State after system string `$23` (35), with Body name VOID and the death loop's later `$21` (33).
2. **Readers use this state.** The surface and space sky passes omit a destroyed Body. The range and landing scan marks it unavailable, and arrivals, development Pose switches and Atlas Travel refuse it. The sessionless Atlas receives the destroyed ids in the paused player's handoff and omits their discs and travel pins. A resident removed by the marker is neither drawn nor selectable. The already occupied craft is not a placed Residence; destruction of the Body under a player aboard it kills the player as it does on foot.
3. **Keep the drift independent of the clock.** `cometCentre` takes Impact Time and endgame state. While `$7A82` is clear, it adds `$7A84 = $7A7E − $793C` to X when `$7A7E` is armed; after the waypoint table ends, it extends the last segment at 180 System units per second on each axis. An unarmed clock-zero impact destroys DAMOCLES and ERIS and triggers `$0F` exactly once, while the clock continues into positive seconds and rolls days. The BOOK and ICARUS tickets may arm the drift without changing this interface. Before they do, an ST trace of the drifted centre around zero should pin the `$7A84` phase and the transition onto the extended segment; the current closed form is based on the decoded instruction path in `docs/research/damocles-script-motion-time.md`.
4. **One Save bump per ticket.** Schema 21 adds destroyed Body ids, removed resident ids, blast centre, debris passes, `$7A7E` and `$7A82` to the Save Snapshot. Schema 20 and older migrate with live Bodies, no drift or blast, and an armed `$0F` trigger. The Script trigger table records whether `$0F` was spent, so a restored post-impact Session neither repeats the message nor destroys the Bodies again. Later tickets each add their own fields when they gain a writer: BOOK adds the clock rate level `$7C1C` and palette mask `$7A50`; NOVABOMB adds its Association B and switch bits `$7872`; AUTHORS COMPUTER and unravelling add its Association B and cursor `$7A8C`. Trigger state already belongs to the Script Save and grows with each ported trigger.

## Consequences

The Atlas is sessionless and sees destruction only when opened from a paused Gameplay Session; a standalone Atlas still shows its recovered catalogue. This is the same handoff boundary used for the player's Atlas Pin. The debris particle geometry remains a separate presentation task, while its Session and Save timing are part of the marker now.

## Amendment for the BOOK's wishes

Recorded 2026-09-29, for [#625](https://github.com/odogono/mercenary/issues/625).

- **The drift freezes at the latch.** `$051F00` stops recomputing `$7A84` once `$7A82` is set, so after zero the X offset keeps the value the last pass before the latch left, `$7A7E + 1`. After the latch the ST steps the two scratch records on by 500 seconds at a time and interpolates between them with its own 16.16 arithmetic. It does not extend the path as a continuous line. `cometCentre` now does both. The page 5 run reproduces DAMOCLES's centre exactly on every sample either side of zero. That is the trace point 3 asked for.
- **The clock rate level is state, and `elapsed` stays Session time.** MORE TIME moves `$7C1C` from 6 to 8. The Session keeps the level, plus an anchor: the impact clock, in level-6 seconds, at the Session time it last changed. The clock then runs at `2^(6 − level)` of Session time from that point. `$04D616` shifts the current second's remainder one bit whatever the size of the step, and the anchor reproduces that quirk. Body rotation shifts right by the same step. The articulation angle `$7886` is not modelled by the port, so it is not slowed either. Space's `$7876` dilation of the clock stays unported, as before.
- **The palette mask is applied to colours, not palette indices.** `$059948` XORs colours 1 to 15 with `$7A50`, with a special case for colour 8. The frame plan carries colours rather than palette indices, so the port XORs every colour it draws, the clear included.
- **Schema 22** adds the balance (record `$00F8` as twelve BCD digits), the queued page action in `$7B96`, the clock level and its anchor, the palette mask, and the ending triggers `$12`, `$15`–`$19` and `$3C`, all `$A0`. `$12` is authored because `$3C` runs its body. Nothing fires `$12` itself until the dispatcher is ported. `$0F` gained the 150-frame wait it opens on, and a schema-21 execution inside it is moved past that wait.

## Amendment for the NOVABOMB and the dispatcher

Recorded 2026-09-29, for [#627](https://github.com/odogono/mercenary/issues/627).

- **The dispatcher sits in front of the marker.** `dispatchDestruction` is `$04C8D2`: it returns on a destroyed Body, fires the Body's ending (`$0E`, `$10`–`$13`, `$1B`) under the guards the endgame note decodes, arms the drift from the clock when ICARUS goes with at least 5,990 s left, and then calls `destroyBody`. The marker now fires `$1A` at the 30th destruction. The BOOK's page 3 and the clock-zero impact still call the marker directly, as the original does.
- **A lethal destruction launches no ending.** The original launches the Body's ending before the marker kills a player standing on it, but the death loop holds the Script before its first wait ends (#626, the carried bomb on ERIS). The port leaves that ending armed rather than let its lines play over the death loop.
- **The NOVABOMB's Association B is its Object Residence.** No separate `$7634` field is kept. A placed bomb names its Body, a carried one is carried, and a detonated one is a removed resident. A bomb on DIALIS reads as no bomb. A bomb packed in the briefcase has no Residence, so the port treats it as no bomb; the original's behaviour there is not recorded.
- **Zero on the clock with ERIS already destroyed latches `$7A82`.** `$051F42` only skips the destruction and `$0F` then. Before #627 nothing could destroy ERIS first, and the port skipped the latch as well. Only a destroyed DAMOCLES, which the mover no longer moves, leaves `$7A82` clear.
- **Schema 23** adds the switch bits `$7872` (only the four Detonators' bits 3–6 are ported) and the dispatcher's six endings, all `$A0`. A schema-22 record or older migrates with every switch off and those endings armed. The TV CONTROL, GHETTOBLASTER and GEIGER COUNTER switches share the panel mode but stay unported, as does the TIMED DETONATOR whose blast would reach the stacked-EXPLOSIVE entry `$04CAD2`.

## Amendment for the AUTHORS COMPUTER and the unravelling

Recorded 2026-09-29, for [#628](https://github.com/odogono/mercenary/issues/628).

- **The computer's options are Session State.** The option `$786C` and the five records at `$7C8C` are kept as they are, and the value in hand is always its option's record, because every step saves it. Options 0 and 3 write the palette mask and the clock rate level that BOOK pages 6 and 4 write, so both widen to anything the options can reach: any ST `0RGB` mask, and levels 0 to 10. The clock anchor is now written on the level's first change and kept if the level returns to 6.
- **Option 1, the panel mask `$7A52`,** XORs every Benson Panel colour but black, the centre box included. The message bar keeps its colours, as the #626 captures show. The port applies the mask to the panel's ST colours, not to palette indices.
- **Option 2, the scale exponent `$7964`,** narrows the port's field of view so that each step above 8 halves the half-angle's tangent. The sky discs keep their tangent size, and their pixel tests use the scaled pixel count. The starfield routines do not read `$7964`, so the stars keep their place on the screen.
- **Seated means aboard the AUTHOR'S CHAIR.** The chair (slot 14) already boards as a seatable object, and Open on the computer tests that occupancy (`$7A90` = 14). Boarding the chair was not run in play (#626). Once open, the computer works anywhere until it is dropped.
- **The unravelling reads the computer's Residence.** `$753C` becomes 0 only when the marker removes the computer, so the port starts the unravelling when the computer is a removed resident. It runs once a main-loop pass: eight ticks on foot and four aboard, as ADRs 0051 and 0054 pace those passes. The ST's passes are longer, at about 12 and 7 VBLs, so the port's Bodies go faster in time but after the same 64 passes. The cursor `$7A8C` is kept as a Body index.
- **A system message waits only for the display gate.** `$05481A` drops a request only while `$7BA0` is up, which is while a message presents. The port had also dropped it while a script was waiting between lines, which would have lost the death message whenever an ending was running.
- **Schema 24** adds the computer's option and records, the panel mask, the scale exponent, the cursor, and triggers `$01` (`$A0`) and `$2A` (`$80`). A schema-23 record or older migrates with the reset's records, no panel mask, exponent 8, the cursor on DAMOCLES, and both triggers armed.

## Amendment for the TIMED DETONATOR

Recorded 2026-09-30, for [#635](https://github.com/odogono/mercenary/issues/635). The decode is
in `docs/research/damocles-endgame.md`, "The TIMED DETONATOR decoded".

- **The panel is Session State.** Open table mode 3 (`$04D69C`) keeps the charge `$7866`, the
  fuse `$786A`, the armed flag `$7A54`, the deadline `$7868` and the EXPLOSIVE last armed
  (`$7A5C`). Until one is armed, digits set the charge and `+`/`-` step the fuse. After that only
  `*` acts: it disarms the armed EXPLOSIVE, or presents string 13. The countdown writes the
  seconds left back into `$786A`, as `$04DACC` does, and the deadline is a word on the clock's
  whole second.
- **The blast runs on the next main-loop pass.** At the deadline the port sets the debris
  counter to −1, as `$7834` is. The following pass runs the blast in place of the debris step.
  The Save can hold that pending state.
- **The blast is the ST's test.** The reach is a box on every axis, with the ST's four-bit
  shift. The player is object slot 29's proxy, tested with the objects.
  - A carried EXPLOSIVE goes off at the player: string 34, then death.
  - A placed one kills a player it reaches with string 35.
  - With `$7A5A` set, a structure resident is reached by cell byte. `$7A5A` is computed when
    the armed EXPLOSIVE is dropped or goes off carried.
  - A small blast opens the NOVAGEN SAFE rather than clearing it. Every other caught object
    becomes a removed resident, so the AUTHORS COMPUTER caught in a blast starts the
    unravelling.
  - The blast centre takes the EXPLOSIVE's place, so the Save's blast centre may now name a
    live Body.
- **The planet kill skips the spray.** At charge 9 with seven more EXPLOSIVEs cleared, the
  dispatcher destroys the Body, and the blast neither sprays nor tests for death. A player on
  that Body dies through the marker, with `$23`. #649 ran it.
- **Not ported:** see the #650 amendment below, which ports what #635 left out, and says why
  two items stay.
- **Schema 25** adds the TIMED DETONATOR's state and the safe gate, and lets the debris counter
  hold −1. A schema-24 record or older migrates with the reset's state: nothing armed and the
  safe shut.

## Amendment for the rest of the blast

Recorded 2026-09-30, for [#650](https://github.com/odogono/mercenary/issues/650). The decode and
the live runs are in `docs/research/damocles-endgame.md`, "Live runs for #649".

- **The player proxy carries the current cell.** `$059000` copies `$7B5D` into the proxy's cell
  byte, so a player indoors in a cell-test blast's cell dies at any distance. #635 had it as 0.
- **The blast walks object slots only.** `$04CA20` walks slots `$FF` down to 0. The port had
  walked every Catalogue Instance, so structures and ground within reach became removed
  residents: no longer drawn, but still bound.
- **The damage table is Session State and a Save field.** At charge 3 or more, a blast adds a
  six-byte `$636A` entry, and a full table overwrites the ninth. With `$7A5A` set, the entry
  removes the structure in the centre's cell. With it clear and a door found at the Drop, it
  takes that door's key.
  - The centre's structure byte `$6FA9` is the port's island group at the centre. Its cell byte
    is the one the cell test already uses.
  - The ST zeroes and rebuilds the cell longs on every workspace load. The port has no cell
    table, so every surface it builds leaves out the structures the table removes, on every
    island of the entry's group. The ground stays. After an entry the port rebuilds the current
    surface and rebinds, as `$054B2E` does.
  - `$05A928`'s tail is ported: at the Drop, and when the EXPLOSIVE goes off carried, the first
    keyed door from `$3FC` down whose Proximity Box holds the player is kept as `$7A56`/`$7A58`.
    The entry's Floor is taken there as well. That is authored, because #649 did not decode
    which Floor the entry reads.
  - A door entry matches group, Floor and door slot, not the cell, since `$059F7A` is dead. The
    matching door opens without its key.
- **The flash follows the ST.**
  - A blast on the player's Body writes the code word its charge reads at `$04CC4C`.
  - The marker writes `$CA00` for every Body it destroys.
  - A caught player's `$AAAA` still overwrites both.
  - A flashed VBL now paints colour 0, the clear, black, and every other colour `$777`. The port
    had painted the clear white too.
- **EXPLOSIVE-ARMED! is the armed model.** `*` swaps model 257 into the EXPLOSIVE's entry and
  disarms back to 256. So the label, the console's name and the drawn model all follow it, from
  arming until the blast takes the EXPLOSIVE away. The model table is outside the Save. A
  restore starts from the reset's table and re-arms only an armed EXPLOSIVE, as `$058E60` does.
  Slot 83, which that loop misses, cannot keep model 257 across a port restore.
- **Still not ported, and why:**
  - The door's `$DF` label glyph. The port draws no key letters: the extractor withholds them,
    since they belong to the cell rather than the model. So there is nothing for `$DF` to
    replace. The payload has no `$DF` glyph either.
  - The centre's region byte `$74D1`, which a cell-test entry clears. It only lets `$052C9C`
    take slot 74 into the surface resident list, and the port draws no blast centre.
  - `$052C9C` and `$05A30E` need no port. The port recomputes the drawn residents on every
    snapshot and the region on every step, so a cleared resident is gone at once.
- **Schema 26** adds the damage table and the door. A schema-25 record migrates with an empty
  table and no door.
