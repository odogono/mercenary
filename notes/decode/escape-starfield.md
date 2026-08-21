# Interstellar Ship Field

This note closes the static decode of the 21-point visual field owned by craft
slot 7's handler during the successful Escape Ending. The canonical term is
**Interstellar Ship Field**. It is not present during ordinary flight and is not
ADR 0025's authored Targ Star Sphere.

The findings come from this repository's configured Reference Build, SHA-256
`ff725f37a7dc131396272d75625f7397aafecc15b158626c0a9165f2607808f3`.
`c64lab/endgame.py` re-extracts them from a verified interactive capture and
rejects a different build digest, changed instruction identities, changed
bounds, or changed branch shapes. The Reference Disassembly was used only to
locate and explain the routine. No instruction stream, raw table, RAM, snapshot,
or generated decode is tracked here.

## Closed point and storage bounds

The inclusive descending index at `$AC4A` is 20, so every initialization,
erase, draw, update, and respawn pass covers exactly 21 stable slots, 20 through
0. A respawn replaces the coordinates in one slot; it does not create a new
identity or reorder the field.

Each slot has engine-float X, Y, and Z components. Their mantissa/exponent arrays
begin at `$0100/$0140`, `$0180/$02C0`, and `$0340/$0380`. Current projected X/Y
positions begin at `$0680/$06C0`; the prior positions used by the erase pass
begin at `$0400/$0480`. The decoder guards every operand that establishes those
identities and reports the arrays as continuation state rather than copying
their checkpoint contents.

## Initialization and the first visible field

Entry at `$AA73` applies the first colour pair, primes every Z exponent and both
current screen coordinates to 1, and clears the screen once. It then jumps
straight to the update pass, before Benson stepping, input sampling, erasing, or
drawing.

The primed Z value is negative. Consequently all 21 slots fail the depth test on
that first update and take the respawn path. Stale X/Y workspace is read into
scratch but never reaches projection. Respawn replaces X, Y, and Z, and the same
slot is immediately updated and projected. The first visible loop therefore
draws 21 newly respawned, projected slots; it never exposes the partially primed
workspace.

## Motion, projection, and respawn

Phase behavior is selected by the sign of the terminal phase, while the guarded
Ending states separately preserve the proven values 0 (inactive), 1 (scripted),
and 255 (completed).

- In phase 1 the per-loop Z delta is -32.
- In negative phase 255 the first acceleration multiplies the delta by
  4.046875. The multiplier's exponent byte is then cleared, so later accelerated
  loops use 1.01171875 until the delta exponent reaches `$25`.
- `$AC52` is decremented and loaded on each accelerated loop, but the loaded
  value drives no branch or coordinate calculation. The decoder records this
  self-modified side byte while marking it unnecessary for semantic
  continuation.

Projection divides X and Y by the updated Z. Horizontal output is centred at 80
and valid in `[0, 160)`; vertical output is centred at 68 and valid in
`[0, 136)`. Negative depth, either float-to-screen overflow, or either failed
screen bound respawns the slot. There is no age or lifetime counter.

One respawn consumes seven consecutive outputs from the shared generator:

1. X uses draws 1-3 as a signed 24-bit source spanning
   `[-2,097,152, 2,097,151]`.
2. Y calls the generator for draws 4-6 and spans the same range, but draw 4 is
   stored in scratch `$06` and then overwritten. Conversion reuses the `$07`
   residue left by X conversion, which derives from draw 1, as Y's low byte and
   therefore couples the two coordinates.
3. Z uses draw 7 as the engine-float mantissa with exponent `$38`, producing
   16,384 through 32,704 in steps of 64.

Every invalidity branch enters respawn with carry set. The generator at `$ADEF`
is carry-sensitive and evolves the shared two-byte state at `$E8/$F3`; the
terminal handler neither seeds nor resets it. There is therefore no universal
first-frame seed. Exact continuation depends on the Gameplay Session's prior
random history and must preserve this shared state.

## Ordered terminal loop

After entry initialization, each native loop performs these actions in order:

1. step the Benson interpreter;
2. sample input;
3. advance the colour sequence when its delay expires;
4. wait for raster line `$E0`;
5. erase the 21 prior point pixels;
6. draw the 21 current point pixels;
7. update, project, or respawn every point.

The loop does not clear the full screen again. “Clears and redraws” therefore
means one entry clear followed by per-point erase and redraw, not a full clear
on every iteration.

## Colour sequence and terminal phase

The first colour pair is applied on entry. The next pair arrives after 96 loops;
the remaining pairs advance every three loops. Expressed as C64 colour names
rather than a copied raw table, the sequence is:

| Loop | Point/line colour | Screen colour | Phase write |
| ---: | --- | --- | ---: |
| 0 | blue | blue | — |
| 96 | blue | dark grey | — |
| 99 | blue | dark grey | — |
| 102 | black | dark grey | — |
| 105 | black | dark grey | — |
| 108 | black | medium grey | — |
| 111 | black | medium grey | — |
| 114 | black | medium grey | 255 |

At the last pair the routine writes terminal phase 255. The colour index remains
on that pair, so every later three-loop expiry reapplies it and rewrites 255.
This is a stepped sequence with deliberate repeats, not a smooth fade.

There is also a register/storage quirk. The first byte of each pair is stored as
both the line colour and the nominal sky byte. The second byte is loaded into Y
and is the value applied to the screen matrix by the indoor-colour routine.

## Benson and SID requests

The native loop calls one Benson step before each input sample. The guarded
Benson census proves that script 7 alone writes terminal phase 1. Its terminal
tail waits two ticks, changes the message interval to 150, retains one optional
flag-`$20` presentation arm, waits 15 ticks before the repeating label, and then
repeats:

1. wait 15 ticks;
2. request one terminal-label message;
3. write zero to SID voice 1 control;
4. write zero to SID voice 2 control.

Those SID writes are presentation requests. Issue #134 may preserve them as
PresentationEvents without adding audio playback.

## Continuation boundary and remaining live work

Exact continuation of the Reference presentation depends on terminal phase, all
six point component arrays, current and prior projected positions, colour
delay/index, depth delta, acceleration multiplier, and the shared PRNG state.
The decoder also records the inert `$AC52` side byte separately. The version-2
endgame decode reports this boundary explicitly for #134; it does not export a
Data Payload or change browser Save state in this research issue.

This static decode closes point bounds, first-frame state, motion, respawn,
random inputs, colour timing, phase branching, Benson stepping, input sampling,
erase/draw behavior, and SID requests. Live effects of Leave, Drop, Save/load,
Ctrl-Q, and leaving between script recheck and the phase-1 write remain #134
acceptance scenarios and are not inferred here.
