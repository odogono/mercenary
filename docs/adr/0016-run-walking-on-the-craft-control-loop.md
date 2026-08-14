# Run walking on the craft control loop

Walking is a Craft Parameter Block like any other, run by the same control loop
that flies the eight craft. The app has one mover: every step the player takes and
every mile a craft covers comes out of the same two first-order filters, reading
the same eleven-block table the Reference Build read. The `WalkLimits` values that
drove walking until now — a walk speed, a run multiplier, a turn rate, a pitch
rate and clamp — are gone rather than kept alongside, and the walk that replaces
them is slower to turn and carries a little momentum where the old one started and
stopped dead.

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

Two smaller consequences follow from having one loop. On foot the loop would
qualify to leave the ground on speed alone, because the take-off gate is a speed
and nothing else, so being in a craft is a condition of flight in its own right;
that condition is ours, not the Reference Build's, which never had a walker fast
enough to need it. And a craft's throttle persists as the original's did, while on
foot the throttle follows the key, because a keyboard has no way to say "stop
walking" if letting go does not.
