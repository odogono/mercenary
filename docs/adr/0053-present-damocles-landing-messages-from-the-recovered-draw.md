# Present the Damocles landing messages from the recovered draw

Accepted, 2026-09-28, for [#576](https://github.com/odogono/mercenary/issues/576), the port of
[#572](https://github.com/odogono/mercenary/issues/572)'s findings. It replaces decision 6 of
[ADR 0052](0052-land-a-damocles-craft-at-the-recovered-landing-point.md) ("the trigger is fired,
and its text is Fog"). It extends [ADR 0045](0045-author-scripts-as-named-typescript-steps.md)
and [ADR 0051](0051-run-the-damocles-craft-pass-exactly-once-every-four-ticks.md).

A landing fires Damocles Script trigger `body + $1F`. The
[landing messages note](../research/damocles-landing-messages.md) decodes all 27 scripts it can
reach. 26 are gazetteers: an `if.random $A000` skip, a 100-frame wait, one to three lines and the
shared epilogue. The launch spends the trigger whether or not the draw skips. TOLOSA's is sticky:
it attacks on every landing and arms the encounter gate `$070104`. The draw reads a fixed
2,048-word noise table through the pointer `$7E18`, which the main loop steps a word a pass.

## Decision

1. **The port runs all 27 landing scripts.** Their triggers join the pickup triggers in the
   trigger table, armed as the first world arms them: `$80`, and `$C0` for TOLOSA. ERIS's `$2A`
   and DAMOCLES's `$3C` are not landing messages. The landing already skips both, and neither is
   ported.
2. **The scripts are named step lists.** One `gazetteer(entry, lines)` builder writes the 26 that
   share a shape, and TOLOSA's is written out. Four step kinds are added: `random-skip`
   (`if.random`), `if-flag` and `set-flag` (`$7BD8`), and `set-encounter` (`bank.write $0104`).
   Every line the scripts present is already in `strings.json`.
3. **The draw is the recovered walk, not an invented generator.** The Catalogue's craft block
   publishes the noise table as `craft.noise`, with its address and digest. The session keeps
   the pointer as a word index. It starts at 0, as New Game seeds it (`$051090`). It steps once
   at the start of every craft pass, surface or space, before the pass runs. That is where the
   traced landing drew its word. A random skip reads a word and steps once more. So any traced
   flight draws exactly what the ST drew.
4. **On foot the pointer holds.** The ST steps it once per main-loop pass on foot too, but the
   port has no on-foot pass ([ADR 0049](0049-run-one-damocles-substep-per-tick-without-st-frame-cost.md)).
   The native draw sites that could also step it are undecoded, and none ran in a traced flight.
   This is a retained difference. It changes which landings present, not how often: across the
   table, 754 words in 2,048 present.
5. **TOLOSA arms the gate, and the gate lights the second lamp.** Bit 1 of `$7BD8` skips the
   introduction after the first landing. The gate `$070104` becomes `1` on every landing, and the
   panel's second lamp `$050A5C` reads it. The attack ship the gate also arms is out of scope.
6. **Save schema 14.** The trigger table grows from 6 entries to 33. The Save also carries the
   `$7BD8` flag, the gate and the noise pointer. The original's own save omits the pointer, and a
   loaded game draws from wherever the running session had reached. Carrying it here makes a
   restore draw what an uninterrupted run draws. That is a deliberate divergence. Schemas 11 to
   13 are migrated with every landing trigger armed, no flag, a shut gate and pointer 0. This is
   exact: the port before this ADR carried none of these scripts, so no earlier landing spent a
   trigger. A restore refuses a flag bit no ported script writes, a gate without the TOLOSA flag,
   and the flag without the gate unless TOLOSA's script is running. It also refuses a one-shot
   trigger armed while its own script runs.

## Consequences

- About one first landing in three presents its Body's history, 100 frames after touching down.
  The rest present nothing and spend the trigger for good, as on the ST.
- A landing while another script runs is discarded, and its trigger stays armed. No landing
  trigger queues.
- The pointer steps on every craft pass. Steps are cheap, and the pointer is Save state rather
  than derived, so a craft pass test that compares whole Saves also compares it.
- Still open: the attack ship and its resolution, the endgame's `$3C` and the author's-computer
  `$2A` (#110), and the undecoded native draws. The Geiger click is not yet ported, so nothing
  else reads the pointer.
