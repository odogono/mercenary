# Carry a deterministic math layer in the port

**Reversed in part by measurement; see "What measuring it showed" at the end. The port
does not carry its own elementary functions — it delegates to the platform's, because
Apple's libm is not correctly rounded and so cannot be reproduced by a principled
implementation. What survives, and what turned out to be the valuable half of this
decision, is the `math` emitter and the named seam: the arithmetic under every Replay
Gate is now measured rather than assumed, and there is one place to change it.**

The TypeScript implementation carries its own `sin`, `cos`, `tan`, `atan` and `pow`
rather than calling `Math.sin` and its neighbours, and the Trace Oracle grows a `math`
emitter that records what Apple's libm returned for them. Engine code under `web/src/`
does not reach for the platform's elementary functions at all.

The reason is that ADR 0019 made a replay the instrument that decides whether a ported
module is believed, and `docs/trace-oracle.md` settles what a replay asserts: a
TypeScript replay parses a Golden Trace and compares numbers bit-for-bit against the
recorded ones. That gate is only as sound as the arithmetic underneath it. IEEE 754
pins `+`, `-`, `*`, `/` and `sqrt` to a correctly rounded result, and says nothing
whatever about the transcendental functions; neither libm nor any JavaScript engine
promises a particular last bit, and two that agree today are not thereby obliged to
agree after an OS update. The kit reaches for exactly five of them — the sines and
cosines in `Projection`, `Orientation`, `World` and both movers, `atan` for the
reference frustum's field of view, `tan` for the horizon, and `pow` in
`ControlLoop.settle` and the decimal registers — so the exposure is small, bounded, and
sitting directly under the two heaviest Replay Gates.

Left alone, that exposure fails in the worst available way. A one-bit disagreement in
`pow` does not present as a message about `pow`: `ControlLoop.settle` raises a damping
factor to a fractional number of frames on every step of every craft, so the
disagreement presents as a flight trace that matched for four hundred steps and then
drifted, which is indistinguishable at first sight from a misported control loop. The
same bit in `sin` presents as a screen line a hundredth of a pixel out. Debugging
either means bisecting a simulation to find a library, and the answer — "the platform
rounds differently" — is not one a replay can tell you.

So the port owns the arithmetic, and the platform's own answers become another thing
the Oracle records. `math` sits beneath `decode` in the emitter ladder because it
observes no kit module at all, and its gate is the first one that has to go green: an
implementation that cannot reproduce `sin` has no business being asked to reproduce a
projection. Error locality is the whole point. A disagreement now reports as `pow`
disagreeing at a named base and exponent, before any simulation is standing.

Two things about that emitter are worth writing down, because both are places where
the obvious choice is wrong.

**Its domain is bounded, deliberately.** Every angle that reaches these functions in
play has been through `GameCore.wrap` into one turn, `GameCore.wrapPitch` into a signed
half turn, or `Orientation.radians`, which divides a payload byte into a turn. The
samples therefore sweep two turns either side of zero, add the 256 discrete angles a
payload byte can produce, the quadrant boundaries, `tan`'s pole and the floats either
side of it, the signed zero and the denormal floor — and stop. Pinning `sin(1e300)`
would oblige the port to reproduce a full Payne–Hanek argument reduction, which is a
large amount of delicate work bought for an angle no wrapper in the kit can return. The
excursions go as far as a thousand radians, which is far enough to prove an
implementation reduces its argument at all. If a caller ever hands these functions
something outside that domain, the bug is in the caller.

**Its header carries no payload identity.** Every other trace records which extraction
it came from, and this one must not, for the same reason a header carries only its own
emitter's settings: this emitter reads no payload, so recording the digest would make a
payload re-export report the math trace as differing, which is exactly the false signal
that narrowing settings per emitter was introduced to remove. The payload's identity is
in `traces/manifest.json` either way.

The alternatives were to start strict and see whether it ever bit, which is cheap right
up to the afternoon it costs a day of bisection and leaves the same decision to be made
with less information; and to pre-approve a ULP tolerance on transcendental-derived
values, which weakens the one instrument the port is believed on, and weakens it in the
place hardest to reason about, since a tolerance that absorbs a rounding difference also
absorbs a genuine misport of the same size. A tolerance can still be the answer for a
specific function if a specific function proves it needs one — but that is a decision to
take against evidence from this emitter, recorded as an amendment here, rather than a
blanket allowance granted in advance.

The accepted costs are real. Hand-rolled elementary functions are delicate code that
must be written from published algorithms and understood rather than copied, and they
are now on the critical path of the first stage of the port. They may not match Apple's
libm on the first attempt, and where they cannot be made to match, this decision
converts a silent risk into visible work. The port also gains arithmetic the Swift
implementation never had, which is a genuine divergence between the two codebases — the
Swift side keeps calling libm, because it is the thing being reproduced rather than the
thing reproducing. And a `math` gate that is green proves agreement on the samples
recorded and nothing else, which is why the samples are chosen from what the kit's own
wrappers can produce rather than from what looked thorough.

## What measuring it showed

Recorded when the emitter first ran, because it bears directly on the decision above and
on where the domain is drawn.

Comparing JavaScriptCore's own `Math` against the recorded libm values, the two agree
**bit-for-bit on every one of the 548 angles for `sin`, `cos` and `tan`, and on all 276
arguments to `atan`**. They disagreed on 11 of the original 167 `pow` samples, by as much
as **twelve units in the last place** — `pow(0.8125, 600)` differing in the fourteenth
significant digit, and `pow(10, 308)` coming back as `1.0000000000000006e+308` where libm
returns exactly `1e+308`.

Every one of those disagreements was at an exponent of 60, 600 or 308, and none of them is
reachable. `ControlLoop.settle` is solved for an arbitrary timestep precisely so that it is
never iterated, and `GameCore.step` subdivides any `dt` into slices of at most a thirtieth
before multiplying by the reference frame rate — so with the rate at its tuned 20 the
exponent `settle` can be handed cannot exceed two thirds. The exponent 600 sample was an
invention of the first emitter, described as "ten seconds of the original's own rate", and
ten seconds is not a step. The sweep now reaches ten, which is margin for retuning that rate
as high as three hundred, and inside that bound the two implementations agree exactly on all
2,147 samples.

The distinction being drawn is worth stating, because the two moves look identical from a
distance and only one of them is honest. Narrowing a domain because a value cannot occur is
what the angle samples already do, and it is a statement about the code: `frames` is bounded
by the subdivision, so an unreachable exponent pins nothing. Narrowing a domain because the
implementation cannot match there would be the opposite — the gate rewritten to suit what it
grades. What makes this the first and not the second is that the bound follows from
`maximumStep` rather than from the failures, and that the failures sit far outside it rather
than just beyond it: the largest reachable exponent is two thirds, the nearest disagreement
is at sixty.

### The part that reversed the decision

A hand-rolled implementation was then written and measured: double-double arithmetic
throughout, three-part Cody–Waite argument reduction, series carried to about 1e-32 and
rounded exactly once. It reproduced `pow` on all 227 samples and **disagreed with libm on 279
of the remaining 1,920** — 23 of the sines, 29 of the cosines, 203 of the tangents, which
compound a quotient of the two, and 24 of the arctangents — by one or two units in the last
place.

Checking those 279 against exact arithmetic settled which was right, and the answer was not
the one this decision assumed. **On every one of them the hand-rolled value was the correctly
rounded one and libm's was not.** The implementation was more accurate than the oracle it was
built to reproduce, which makes it useless for the purpose: Apple's libm carries rounding
errors of its own, and no principled implementation reproduces a proprietary rounding error.
Matching it bit-for-bit would mean reconstructing an algorithm that is not published — the
large, delicate, unbounded work this ADR was careful to refuse in the paragraph about
Payne–Hanek reduction, arrived at from the other direction.

Meanwhile the platform matches libm on **all 2,147 samples**, `pow` included. So the port
delegates to `Math.sin` and its neighbours through the named seam in `web/src/math/`, and the
decision inverts: the arithmetic is the platform's, and this ADR's contribution is that it is
now *measured*.

The `math` gate keeps all of its value under the inversion, and arguably gains some. It no
longer grades an implementation of ours against libm; it grades the platform against libm,
which makes it a canary. If a macOS or JavaScript engine update ever moves a last bit, that
gate goes red before any simulation is standing, and the diagnosis is one line rather than a
bisection through a craft's descent. The seam is where the answer would then go, and the
measurement above records what the first answer attempted, so a future reader does not have
to rediscover that correctness and reproduction are different targets.

What would have happened without the emitter is worth stating, because it is the case for
having built it. The hand-rolled layer would have been written — it was the decision, taken
deliberately — and its 1-ULP disagreements would have surfaced first in the `flight` gate,
where a craft matched for hundreds of steps and then drifted. Every instinct there points at
the control loop. The emitter turned a week of that into an afternoon of arithmetic.

Two smaller consequences. The bounded `pow` exponent above still stands and still matters:
that measurement is what proves the platform *can* disagree with libm, so the delegation is
sound today rather than sound in principle. And the domain bounds throughout remain
statements about what the kit's wrappers can produce, so they continue to describe what the
canary covers.
