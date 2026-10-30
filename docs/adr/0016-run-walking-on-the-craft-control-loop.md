# Run walking on the craft control loop

**Corrected after a later read; see "The mechanism was misread" at the end. On foot
the Reference Build does not use the control loop at all. The decision below — that
movement runs on decoded parameters rather than tuned constants, and that there is
one mover per mode rather than an invented one — stands; the claim that walking is
a Craft Parameter Block does not.**

Movement runs on the Reference Build's own decoded parameters rather than on
constants tuned by hand. The `WalkLimits` values that drove walking until now — a
walk speed, a run multiplier, a turn rate, a pitch rate and clamp — are gone rather
than kept alongside.

The reason is that this is what the Reference Build does, and finding that out was
what the flight step's decode was for. The parameter table at `$9DAD` is eleven
sixteen-byte blocks, not the eight the craft need: after the craft come walking, a
crash tumble, and the parachute descent, and the run ends exactly where the first
control routine's code begins, which is what pins the count. Walking's block
dispatches through `$9F17`, the same routine slots 0, 1, 3, 4 and 6 use, and the
touchdown path proves the engine treats it as one of the set — it installs
walking's offsets over the live block byte for byte when a craft lands. Keeping a
separate walking integrator would have meant writing a second mover to imitate
what one of the table's own rows already describes, and then maintaining the
imitation.

It also buys the step that comes next. Take-off in the Reference Build is not an
input: the vertical translation step is skipped until speed reaches a threshold,
and the flying flag flips when altitude leaves a band. Landing is the same
mechanism seen from the other side, and both live inside the shared loop rather
than beside it. A build with two movers would have had to decide which of them
owned that transition, and the honest answer is that the original has nowhere to
put such a decision, because it has one loop.

The cost is a feel regression that we accepted deliberately. Walking's yaw damping
decodes to about `2^-16`, so its turn still starts and stops within one of the
original's frames, but its authority is 16 angle units per frame against a turn of
1024, which at the rate the parameters were written for is roughly a quarter of the
old tuned turn rate. Its speed damping of 0.25 gives a short run-up and run-down
where there was none. Both are now consequences of decoded numbers rather than
choices, so the tuning knobs are the frame rate the parameters are paced at and
per-axis scales in `settings.json`, and the walk is judged by playing it (ADR
0014). Fixture tests are recorded from the walk that gets signed off, not from the
walk that was replaced — pinning the old traces would have frozen the behaviour
this decision sets out to change.

A craft's throttle persists as the original's did.

## The mechanism was misread

The reading above was wrong about how the Reference Build moves a player on foot,
and the underground step is what caught it. `MOVE` at `$A165` dispatches: if the
underground flag is set, or if the craft byte has its top bit set — which is what
being on foot means — control goes to a separate routine at `$A18B`, and only
otherwise does it `jmp ($BEA0)` into the block. That routine walks by a fixed step
held at `$AA/$AB` and turns by a fixed number of angle units held at `$AC`. There is
no velocity, no damping, no throttle, and no vertical term at all.

So the block after the eight craft is not the on-foot walk. It is the block
touchdown installs so that a _landed craft taxis_ differently from one in the air,
which is a real and useful thing, and it is why the touchdown copy exists. It is
named `grounded` now rather than `walking`.

What survives unchanged: the table really is eleven blocks and not eight, pinned by
the run ending exactly where the first control routine's code begins; touchdown
really does copy ten of that block's bytes over the live one; the two filters really
are different shapes; and movement really does run on decoded numbers rather than
tuned ones. What changes is that there are two movers, because the Reference Build
has two, and the app now has the same two: a filter loop for a craft and a fixed
step for a player on foot.

Three things fall away with the correction, which is the sign it was worth making.
The on-foot walk no longer borrows a throttle notch it never had, so `walkNotch` and
`runNotch` are gone and running is an explicit `runMultiplier` on a decoded step —
honest about being a Mac Adaptation, since the Reference Build had no run. The
"a walker could take off" guard is gone, because the real reason a walker cannot
leave the ground is that the routine has no vertical term. And the keyboard
adaptation that made the on-foot throttle follow the key is gone, because there is
no on-foot throttle to follow it.

The numbers were nearly right by accident, which is why playing it did not catch
this: the block's yaw authority is 16 angle units and the on-foot turn step is also
16, so the turn was exact, and the block's settled speed at the notch we had chosen
was 85.3 units per frame against a real step of 80 — under seven per cent out.
