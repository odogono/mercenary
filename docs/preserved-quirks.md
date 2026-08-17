# Preserved Quirks

Reference Build behaviour retained because it materially affects play or has been
explicitly curated as part of the game's characteristic identity (see `CONTEXT.md`).

A quirk earns a record here when a future reader would otherwise reasonably conclude
the decode is broken, or when the obvious repair would be a silent change to the
preserved game. Each record says what the behaviour is, what our own image says, and
what would be lost by fixing it.

## PQ-0001 — Room Links are directed, and 82 of them are one-way

**What.** Every Room Link is directed. 478 distinct room-to-room links exist across
the underground; 396 reciprocate and **82 do not**, so a player can walk through a
Doorway and find no Doorway back. There are no self-links.

**Why it reads as a bug.** Fifty-seven of the 82 come from a single record. Room
record `$3000` is shared by **nineteen** room ids — `$00`, `$01`, and `$AF..$BF` — and
each of those rooms independently offers the same three Doorways, onto rooms `$09`,
`$58`, and `$59`, none of which offers a Doorway back to nineteen different rooms. A
reader who has not noticed the sharing sees one malformed cluster rather than
nineteen rooms behaving identically and correctly. Most of the remainder are the
special-setup rooms `$72..$87`, which are link *targets* only because their own
Doorway is rewritten on arrival.

**Why it is not repaired.** The Reference Build never represents a shared opening: a
Doorway belongs to one room and that room's record names its own destination, which
is precisely why one-way links are expressible at all. Synthesising the reverse link
would invent geometry, and would also invent an arrival position, because the reverse
Doorway would have no arrival command index to resolve. `oneWayRoomLinks` is asserted
at 82 on every payload export.

**Two numbers, both correct.** The checking map reports **83 unanswered Doorways**
out of 481, counted per command; the payload manifest reports **82 one-way Room
Links** out of 478, counted per distinct room pair. The map's total includes the one
Doorway onto the surface, for which reciprocity is undefined, and counts room `$9B`
and room `$9D`'s two mutual Doorways twice. Either number is defensible; they are
kept apart so neither has to be qualified.

## PQ-0002 — One Doorway lands the player outside the room it leads to

**What.** Room `$45`'s only Doorway leads to room `$96` with arrival command index
**6**. Room `$96` has four commands. The Reference Build resolves arrival as a byte
offset into the destination's record — `4n + 7` — so index 6 reads offset 31, past
room `$96`'s terminator and into room `$97`'s record, and places the player at
roughly x `$2380`, z `$9600`: outside room `$96` entirely.

**What our image says.** This is the only one of 427 commands where the arrival index
exceeds the destination's command count. Room `$96`'s command 3 is the matching
reciprocal Doorway back to room `$45`, so the index was very likely meant to be 3.
The bytes it reads are static — room `$97` is not one of the runtime-patched records —
so the landing position is deterministic rather than garbage that varies.

**Why it is not repaired.** Correcting the index to 3 would be a silent change to
where the original puts the player. The decoder instead resolves the arrival from the
bytes the engine actually reads, exports the resulting out-of-room position, and marks
the Doorway `arrivalWithinDestination: false` with an
`arrival-index-past-destination` uncertainty. `unresolvedArrivals` is asserted at 1 on
every export, so a second one appearing would be caught rather than absorbed.

Note for anyone writing tests against this: `arrivalCommandIndex` must **not** be
asserted to be less than the destination's command count. That invariant holds 426
times out of 427 and the exception is the point.

## PQ-0003 — Arriving at the world-flip room from one particular room does not flip the world

**What.** Entering room `$7F` flips the world: `$9353` toggles a one-bit parity flag
folded into the coordinate and facing transform, complements bit 6 of every live
entity's state byte, and installs a longer transition. But arriving from room `$56`
does not flip anything.

**Why.** The flip's compare sits after the special-setup pair patch and is only
reached when a pair was actually applied. Selection is three-way: matching the first
pair's room but not the second uses the second pair, matching neither uses the first,
and matching **both** takes a branch that skips the patch — and therefore the flip —
altogether. Room `$7F`'s two pairs are identical, both naming room `$56`. So the one
room that can match both is `$56`, and arriving from it is the case that reaches the
skip.

**Why it is not repaired.** It follows from data (two identical pairs) meeting control
flow (an equality test on both), and either would have to be altered to remove it.
The pairs are exported as they are, and the three-way selection is implemented as
three-way rather than as a match, so the behaviour follows without being special-cased.
