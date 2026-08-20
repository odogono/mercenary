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
Doorway out of the underground, for which reciprocity is undefined, and counts room
`$9B` and room `$9D`'s two mutual Doorways twice. Either number is defensible; they are
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
that negates camera-space X at eight sites in the transform and remaps the input byte
through a table swapping its two turn bits, and installs a longer transition. But
arriving from room `$56` does not flip anything.

**Correction to an earlier version of this record.** It said the flip "complements bit
6 of every live entity's state byte". That was wrong on both counts, and it was mine.
The loop walks the **carried-inventory list** at `$BEB1`, whose length is `$EB`, not
the object table; and it indexes that list with one register while reading the state
byte with another, so which bytes it touches does not correspond to what it is
counting. Nothing in the image reads bit 6 of a state byte at all. So the complement
is unobservable, and it is deliberately **not implemented** — reproducing a write that
nothing can see would be reproducing our reading of a bug rather than the bug.

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

**Both ways in, from the payload.** Room `$7F` is reachable from exactly two rooms:
`$56` and `$90`. So the quirk is not a theoretical branch — it is half of the
observable behaviour of that room, and both halves are golden traces
(`room-flip`, `room-flip-bypassed`):

    from room 144 →  through a doorway into room(127), mirrored · the world is mirrored
    from room  86 →  through a doorway into room(127)

## PQ-0004 — A dark room shows nothing at all, including the way out

**What.** A room whose record ends in `$80` is dark unless the photon emitter is
carried or lying in that room. Dark does not mean dim: `$91FE-$9204` zeroes all three
colours the draw code uses, so the room draws as a cleared backdrop with no walls, no
furniture, and no Doorways — not even the one the player just came through. The
message *"ITS VERY DARK IN HERE"* is the only thing the game offers.

**Why it reads as a bug.** A renderer that produces an empty frame looks broken, and
the obvious repair — outline the walls faintly, or keep the Doorways visible — is
exactly the change that would make the emitter optional. Twenty rooms are dark, and
several of them are on the way to somewhere.

**What our image says.** The line colour is not a per-room value: every room setup
stores the same immediate at `$9399`, and that store happens at `$9162`, *before*
darkness zeroes it at `$9200`. So darkness has the last word on all three colours, and
a dark room is black rather than black-with-lines. The gate is exactly `$80` — a `$00`
terminator is never dark — and the emitter is looked for in two places: the carried
list (`$941A`) and the objects present in the room (`$9425`).

**Why it is not repaired.** The emitter is a real object in a real room and finding it
is a puzzle. An **Accommodation** is available later if playtesting says the darkness
is unfair rather than tense — showing the Doorways only, say — but it would be a
settings-gated change with the maintainer's approval, not a quiet improvement.

## PQ-0005 — A player against a far Room wall reports contact on every frame

**What.** `Containment` bounds a player on foot inside a Room, and its two compares are
not symmetric. The near bound passes when the position *equals* the margin; the far
bound fails when the position equals it. So a player walking into a near wall reports
contact once and then stands quietly against it, while a player pinned against a far
wall reports contact on every frame for as long as they lean on it.

**Why it reads as a bug.** The asymmetry looks like an off-by-one, and the obvious
repair — make both compares `>` — is a one-character change that a reader would make
with confidence. Two axes make it worse: a corner reports two contacts, so a player in
a far corner reports two every frame.

**What our image says.** The two compares are the literal readings of the Reference
Build's own tests. The near test is "in bounds if the position is at or past the near
margin"; the far test is "in bounds if the low byte is *below* the far margin", which a
position sitting exactly on the margin fails. They are different instructions, not one
instruction applied twice, and the far bound is built from the last whole cell plus the
margin rather than from the extent directly.

**Why it is not repaired.** Wall contact is what a Doorway is opened by, and the count
is what the traversal path reads before it will look for one at all. Making the far
wall report once would change which frames can take a Doorway, which is a change to
navigation rather than to a bound — and the repeating count is already load-bearing in
the other direction, because `wallContactLatch` holds the previous frame's count
precisely so the wall sounds once rather than every frame while the player leans on it.
Asserted by name in `web/test/containment.test.ts`.

## PQ-0006 — A craft landing nose-up never crashes, however steep

**What.** A touchdown is judged on descent rate first and pitch second. The pitch test
is written in the Reference Build's ten-bit angle units, where level is half a turn and
larger values are nose down, and it compares against a nose-down threshold only. A
craft touching down nose-*up* has to wrap past a half turn before the comparison can
fire, so a steep nose-up attitude lands where the mirror-image nose-down attitude
crashes.

**Why it reads as a bug.** "Crashes if the nose is too far from level" is the rule a
reader expects, and taking the absolute distance from level would be the natural
repair. It also looks like an asymmetry introduced by the port's radian representation
rather than one the original had.

**What our image says.** The engine tests one side directly. `rawPitch` reconstructs
the ten-bit value the tests were written around, and the threshold is a single
comparison against the nose-down side; nothing reads the nose-up side at all. The
descent-rate test is unconditional and comes first, so a craft falling fast enough
still crashes whichever way its nose points.

**Why it is not repaired.** Symmetrising the test would make some landings that
currently succeed into crashes, which is a change to how the game plays rather than to
how it is decoded — and the nose-up escape is reachable deliberately, because pitch
wraps over the top rather than clamping, so a craft can be flown right over and back.
Asserted in `web/test/mover.test.ts` as "the pitch tests are written around level being
half a turn".

## PQ-0007 — A Doorway opens whether the player faces it or walks backwards into it

**What.** Walking into a Room's wall is the first half of taking a Doorway, and the second half
asks whether the player is square-on to that wall. The Reference Build answers by rounding the
heading to the nearest quarter turn and comparing a *single bit* of the result against the
Doorway's plane bit. One bit distinguishes the two axes and nothing else, so it accepts the
player facing the wall and the player facing directly away from it equally. A player reversing
into a Doorway goes through it.

**Why it reads as a bug.** "Face the door to go through it" is the rule a reader expects, and the
repair looks like a one-line strengthening of the comparison to test the direction as well as the
axis. Nothing in the surrounding code hints that the loose test is intentional.

**What our image says.** It is intentional, and the reason is upstream: which way the player is
pushing has already been settled by *which wall they hit*. Containment reports contact only on the
axis the player actually crossed, so by the time a Doorway is looked for, the direction of travel
is established and the plane bit only has to confirm the axis. Testing the direction again would
be testing the same fact twice.

The rounding bias the routine adds is two whole quarter-turns, which cannot change the bit being
tested; it exists for a presentation value computed further down from the same byte. That is why
the decoded `headingRounding` is not consulted by this test, which is deliberate rather than an
oversight — the field is decoded because the document carries it, not because this predicate wants
it.

**Why it is not repaired.** Requiring the player to face the Doorway would make some crossings that
currently work impossible, which is a change to how the game plays rather than to how it is
decoded — and it would double up a test Containment has already performed. Asserted in
`web/test/doorway.test.ts`, where a heading of a quarter turn and one of three quarter turns —
opposite directions along one axis — are both accepted.
