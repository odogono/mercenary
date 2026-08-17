# Make one Gameplay Session the authority

One `GameplaySession` owns every mutable value a play session has: the player's
pose, which room they are in and what they are aboard, where each object is, the
running Benson Script and its host state, and the message line. This supersedes ADR
0008, which decided that Session State would be *derived* from an authoritative
Transition Log of committed outcomes. That decision belonged to the verification era
and served the apparatus ADR 0014 froze — a log bought replay, audit, and bounded
saves, which mattered while Conformance Reports were the deliverable. Nothing ever
implemented it, `CONTEXT.md` already marks the Transition Log historical, and the
deliverable is now a playthrough. Leaving 0008 nominally live while building its
opposite would make the decision record fiction, so it is retired here rather than
quietly worked around.

The trade-off worth recording is not whether state should have one owner. It is
direct mutable ownership with transactional projection at the Host Callout, against
derivation from a log. The Host Callout is what decides it. A Benson Script sees
byte-wide engine variables — a current room, a boarded craft, a room-membership
table, a carried bit — and those are a *different shape* from the typed values the
rest of the game reasons about. Something has to translate between the two on every
crossing, and the translation has to be atomic, because a script observing a room
the player is not in produces wrong answers rather than late ones. Under a log the
translation would sit between a projection and a replayable transition, which adds a
stage to the very step that most needs to be indivisible. Under direct ownership it
is one function in and one function out.

What made the choice concrete is that the alternative had already failed in this
codebase, quietly. `GameState.room` and `BensonHostState.currentRoom` both held the
player's room, with different sentinels for the surface, and nothing outside a script
ever wrote the second one. Boarding a craft kept its equivalent pair in step only
because `Interaction` happened to write both halves; riding the lift wrote the typed
room and nothing else. So from the moment a player went underground, the `inrm`
instruction — used five times across the payload's fifty-one scripts — compared a
script's room register against a stale zero and answered as though they were still on
the surface. It had not bitten because the opening loop ends at the Dart and nothing
underground runs yet, which is precisely what the navigation work changes: entry
scripts are scripts that fire on room entry. Two owners kept in step by whoever
remembers is not a discipline problem to be solved with a convention; it is a defect
generator, and the same shape had produced four representations of where an object is,
two of which said the same thing and could disagree.

So the byte-wide variables are not stored. They are projected from the typed state on
the way into the interpreter and read back on the way out, which makes divergence
impossible by construction rather than by care. A script that writes one of them moves
the thing it names, because the Reference Build has one variable per fact and its
engine reads whatever the script wrote; honouring that is more faithful than dropping
the write and safer than trapping on it, and no script in the payload writes either of
the two that describe the player, so nothing observable changes today. The Semantic
Actions — reaching, boarding, leaving, riding the lift — are methods on the session
that move everything or nothing, and there is no setter for host state at all, because
a setter is what let boarding become three statements that could half-happen.

The second thing this buys is that the Trace Oracle stops being a second
implementation. ADR 0019 makes the macOS application the equivalence authority the
browser must reproduce, which is only meaningful if the traces come from the code a
human actually plays. They did not: the interactive shell and `--benson-trace` each
carried their own copy of the reach-attempt-describe sequence, `--benson-trace` called
a boarding method the live app never called, and the crash path that puts a pilot out
of a wrecked craft existed only in the shell, so a trace of a crash showed the player
still flying. Both now drive the same session, and the diagnostics that touch no
gameplay state — the frame capture and the inspector — are left alone because there
was nothing there to unify.

The accepted costs are real. There is no replay and no audit trail, so a wrong outcome
has to be reproduced from inputs rather than read out of a history, and saves will need
a serialisation format designed later rather than inherited from a log that already
had one. Determinism therefore has to be held as a property and asserted, not derived
from a recording. Randomness is one session-owned stream shared between scripts and
the world, matching the single random routine the Reference Build calls from both,
which means entering a random room perturbs the next script draw and a golden trace is
sensitive to how many such rooms were visited along the way; the sharing is observable
in the original and cheap to keep now, whereas retrofitting it later would invalidate
every trace taken before. And the session is a value type holding a `World`'s worth of
content by reference rather than owning it, so it can be built in a test without a
payload on disk — at the price of a `Content` struct that has to be assembled by
whoever constructs a session.

The alternatives were keeping the two owners and adding a reconcile step the session
always runs, which leaves the defect one forgotten call away and was what the previous
arrangement amounted to in spirit; making the typed values the derived side and the
host bytes authoritative, which would push the Reference Build's sentinels and
byte widths into every call site that asks where the player is; and absorbing
`BensonSession` entirely so one type owns both sides of the Host Callout, which would
dissolve the seam ADR 0019 expects to survive the move to another language untouched.
