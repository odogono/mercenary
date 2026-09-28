# Land a Damocles craft at the recovered landing point

Accepted, 2026-09-28, for [#567](https://github.com/odogono/mercenary/issues/567), part of
[#558](https://github.com/odogono/mercenary/issues/558) and the
[driving and flying map](https://github.com/odogono/mercenary/issues/548). Extends
[ADR 0046](0046-switch-damocles-bodies-within-one-gameplay-session.md).

An arrival in space runs the landing `$059268` in the same frame. The landing puts the craft,
still aboard, over the point `$04E936` computes under it, 25,165,824 above the Body. It then binds
that Body with `$56488`
([the space flight note](../research/damocles-space-flight.md#landing-059268)). ADR 0046's switch
lands at a captured arrival Pose. This one lands at a recovered point, on Bodies that may have no
admitted Pose at all. LACHESIS is one.

## Decision

1. **A landing is a Body switch at the landing point.** It is one commit, in the frame the
   arrival is raised. The session replaces the surface with the destination's, drops the bound
   structure, the region, the Floor and the attachments, and binds again from the new Pose, as
   walking does. That is ADR 0046's switch. The Carried Stack, Object Residence and the Damocles
   Script carry over unchanged, as they do there. The difference is the Pose. It comes from the
   recovered landing point and the craft words the space pass left, not from an arrival Pose.
   The player stays aboard. The occupied object's pre-boarding residence is dropped, as Atlas
   Travel drops it, so leaving never falls back to a place on the Body the craft left.
2. **The point is the Body Coordinate the ST writes.** X's and Z's high words are the landing's,
   masked to twelve bits by the pose copy, and the low words are nought. The port's surface
   already places every resident at its Body Coordinate times `$10000`, whatever the workspace
   origin, so the point needs no further mapping to find the structures and residents under it.
3. **The workspace origin anchors only the cell.** A Body with an admitted arrival Pose keeps
   that Pose's workspace origin. A Body a landing reaches without one is anchored at its own
   origin, `(0, 0)`, so its local cell is the Body Coordinate. That covers every Body in the
   range scan's table but DIALIS, which `$052FDA` never arrives at. Nothing recovered names a
   16-cell window there, and the island Cell Readout (`$7894`) is measured separately. This is
   authored. A Save may therefore name such a Body, and a resume anchors it the same way.
   Authored Body switches and Atlas Travel still require an admitted Pose.
4. **The destination's turn comes from a clock every Body shares.** The session keeps only the
   current Body's accumulator. `$051E4E` adds every Body's rate on the same VBL. So every
   capture's table is the first world's plus each Body's rate times one VBL count common to all
   of them. All 62 memstates and both traced landings hold to that. In four of them (CLOTHO and
   CRONUS, tracked and rehosted) the capture caught the loop partway, and the Bodies it had not
   reached are one VBL behind. The Catalogue publishes
   the first world's accumulators. At a landing the port solves the count from the Body the
   craft left and carries it to the destination. The power of two left unknown never reaches the
   angle bits.
5. **The terminator word is the landing's.** `$79BE` is `$04EA02`'s angle of the Body's place.
   The port computes it with the ST's table `atan2` and keeps it until the next switch. Every
   arrival Pose's captured word but the comet's agrees with it. Where no landing has written it,
   the terminator reads the captured word, and falls back to the computed one.
6. **The trigger is fired, and its text is Fog.** A landing fires Damocles Script trigger
   `body + $1F` through the one recovered trigger entry `$054770`, except on ERIS (`$2C`) and on
   the comet DAMOCLES (`$74`). In the first world the other 27 are armed. TOLOSA's is sticky and
   the rest are one-shot, so a Body's trigger is disarmed once it has been landed on. The `cross`
   trace fired LACHESIS's, which presented a message 38 passes later. The port carries no
   script for any of them. So the trigger changes nothing, and no message is presented.

## Consequences

- The support branch of the landing is decoded but never taken. The support search `$0583EA`
  opens with `tst.w $7AB6`, and Y's high word is `$0180` after the landing, so the search always
  refuses. The port still runs the search, over the destination's bound boxes.
- Arriving under power climbs straight back to the space entry, as on the ST. Getting down is
  ordinary flight.
- The landing message is Fog: which script and text each landing trigger presents is left to a
  later ticket. So is whether the port should arm the landing triggers and carry them in a Save.
- Save in space, time dilation and the scripted flight `$790E` stay out of scope.
