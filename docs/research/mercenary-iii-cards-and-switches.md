# Mercenary III cards and switches (#795)

The implementation follows the original dispatcher rather than adding keypad
commands to every panel. The source is the pinned gameplay-opening RAM, retained
at [opening.ram](../../restricted/mercenary-iii-795/opening.ram); the relevant
instructions are retained in
[device-disassembly.txt](../../restricted/mercenary-iii-795/device-disassembly.txt).
This is a static port with synthetic session controls, not a new original-game
journey or a claim of full bus/casino access.

`$4D830` checks TAXICARD104 before dispatching modes 2, 3, 4 and 6. It has no
mode-5 or mode-7 key branch. BUS PASS103 and A TO Z COMPUTER46 therefore ignore
`+`, `-` and `*` without an unported-effect note. BUS PASS displays its recovered
two-line default from `$4DEF0`. Its next-stop reader `$4DC3E` requires a matching
bus passenger, a completed reveal and no pause; the port still has no bus
passenger/service machine, so this change does not implement bus travel or
next-stop updates.

A TO Z displays the current cell's twenty-character label. `$55F52` keeps the
location pointer independently of the taxi's destination pointer; unmatched
cells use the group's header. Empty tables, including space, display OUT OF
RANGE (`$4DF46`). `m3lab.head` exports all 57 groups' raw labels, preserving both
ten-character lines. The current METIS/TOLOSA gameplay supplies the group and
cell; no new Body travel is introduced.

`$4DE54` copies one of two five-row bitmaps into plane 2 at x144..175,
y175..179. Both switches draw that exact field once the 64-VBL reveal ends. The bit operation and
unchanged-value test are shared with Damocles; a repeated setting makes no click.

ELECTROMAGNET131 `+` branches to `$517CE` before the bit operation. Stages 1..3
of an active FRUIT MACHINE advance one stage and reseed the stopping count from
the rotating random table; idle and payout stages ignore the key. Bit0 is never
set by `+`, and `-` retains the ordinary clear-bit handler. The fruit-machine
continuation `$516AE..$51774` advances the live `$99` reel token, stops naturally,
tests pair/triple prizes and pays until the signed credit limit. Space on foot
with selected146 and distance exponent below9 starts a paid game (`$56894`).
Bankruptcy script `$76` remains inert and is noted in the Shell Console.

PULVIN DETECTOR149 requires its held bit and switch bit1. `$4CC46` chooses
ORE127 on the current Body, otherwise ORE114, and derives the rate from the
exponent of the squared distance using the recovered arithmetic tables. The
sum is `(x² + y²) + z²`, preserving the original rounding order. `$53028`
rotates a random word each eligible VBL, increments the counter and emits
`$4CAE4`'s B-channel envelope when the random threshold is met. Key clicks and
the existing collision sound take priority. The main frame also advances the
shared random cursor once (`$5A426`). Switching off or dropping149
stops future detector requests; it does not erase the random/counter owners.

Save schema6 retains the rotating table and cursor, detector counter/priority,
and fruit-machine stages, reels, stopping cadence, payout and credit. Admission
checks exact field sets, table extent and numeric bounds. Older schemas and
the prior content identity are refused under ADR 0073.

`web/test/dion-devices.test.ts` checks card keys and text, both lamp states,
repeated keys, detector gates/priority/envelope, random wrap, paid machine
start, reel stopping/prizes and uninterrupted versus restored futures. The
browser panel composer was also inspected with BUS PASS, A TO Z,
ELECTROMAGNET and both detector lamp states. CANDIDATE'S LOG, TIMED DETONATOR
and AUTHORS COMPUTER keep their existing unported-key notes/gates.
