# Admit Occupancy into Damocles play as Damocles-native code

Accepted, 2026-09-20, for the [Damocles Occupancy map](https://github.com/odogono/mercenary/issues/403).

_(Amended 2026-09-23, issue #407: the seated eye height is **recovered**, not derived. Boarding sets the eye to the craft's resident position plus 63 in Y at `$05437A`–`$054384`, the same 63 as on foot, for every slot, and the boarded captures of `V.I.P. LIMO` and `EAGLE NINE S E` both read 63. No model's Y bounds take part, so the consequence below that derives it from them is withdrawn. The gate also has an eighth guard, not seven: after the key test, `$054338`–`$05434E` refuses silently unless the object's model record carries the single-Y-turn orientation command. See [the board and leave paths note](../research/damocles-board-leave-paths.md). The decision itself, and the rejected alternative's reasoning, stand.)_

A Damocles Gameplay Session may put the player aboard a resident object that admits them. The
recovered board gate is delivered whole: admission, refusal with the recovered message the original
chooses, and leaving again, with the object's Object Residence removed on admission and restored at
the leave position, and with the resulting Occupancy surviving a Damocles Save and a Session Resume.
It is written as Damocles-native code, not as a mechanism shared with Targ.

What this decision does **not** admit is as firm as what it does. It does not admit driving: a
boarded Damocles craft is sittable and immobile. It does not admit space travel or the
space-capability table, later mission progression or the bargaining ladder, and it makes no change
to Targ. Boarding is the whole of it.

## This admits boarding a craft, not travelling in one

[ADR 0046](0046-switch-damocles-bodies-within-one-gameplay-session.md) closes with "This decision
does not admit vehicle travel, later mission progression, Targ changes or a shared scripting
framework." That sentence stands, unamended. It governs travel — moving between places by vehicle —
and 0046 admitted an authored Shell Console action precisely so that the wider System could be
reached _without_ recovered vehicle travel. Occupancy does not reach for it either. The player who
boards the `V.I.P. LIMO` at Capital Spaceport is sitting in a parked craft on Eris; no control moves
it, and the Body-switch action remains the only way to another Body. Nothing here is a shared
scripting framework, and no Targ code changes.

The distinction is worth stating because the two look alike from outside and are not alike in
evidence. The board gate at `$054310`-`$054338`, its refusal chooser at `$0542E0` and the leave path
at `$05449C` are recovered in full ([`damocles-arrival-routes.md`](../research/damocles-arrival-routes.md),
[`damocles-vip-limo.md`](../research/damocles-vip-limo.md)), and [#404](https://github.com/odogono/mercenary/issues/404)
settled the last behavioural unknown by establishing the Vehicle Key as a carried requirement rather
than a permanent unlock. Driving is not recovered: Damocles has no Craft Parameter Block, and
[#208](https://github.com/odogono/mercenary/issues/208) searched RAM without finding the word the
boarded speed keys write. Admitting boarding costs nothing in authored numbers. Admitting travel
would mean inventing rates, which is the failure the fidelity rule of
[ADR 0043](0043-admit-damocles-play-alongside-the-second-city.md) exists to prevent.

## The sibling rule is followed, not broken

ADR 0043 decided that the Damocles Gameplay Session is "a sibling of Targ's, not a generalisation of
it", and named the shared pure seams as exactly four: the movement Intent, the panel view model, the
view-space Camera transform, the polygon triangulator. **This decision does not extend that list.**
Boarding does not join it. Damocles gets its own board gate, its own refusal chooser and its own
leave path, in Damocles code, reading Damocles data; Targ keeps the ones it has, and its Golden
Traces do not move.

## The rejected alternative

The alternative considered was one boarding mechanism shared by both Titles now — a single admission
routine, or a generalised Object Residence and Occupancy, that Targ and Damocles both call.

It is rejected. The two implementations do not have the same shape, and only one of them exists.
Targ's boarding has three guards (in reach, already aboard, is a craft), no Vehicle Key concept at
all, numeric slot identity, and a `gone` arm in its Object Residence. Damocles has seven guards
(eight, per the 2026-09-23 amendment) (reach, region flag bit 14, slot 0, the boardable bound at slot 23, already aboard, the VOID staging
Body `$78`, and bit 7 of the per-craft key byte at `$7272 + slot * 4`), a per-craft key byte, string
instance identity, and no `gone` arm. Generalising from the one working implementation would put
Targ's shape on Damocles by default, because Targ's is the one with code behind it and every
disagreement would resolve its way. That is the precise failure ADR 0043 was written to prevent when
it rejected "Generalise Targ's `GameplaySession` and `World` into interfaces both Titles implement",
and it is no less true for one mechanism than for the whole Session.

Alignment across Targ, Damocles and Mercenary 3 is wanted, not abandoned. It is deferred so that it
is done with two working implementations in hand rather than one, and it is tracked by
[#419](https://github.com/odogono/mercenary/issues/419), which owns it. That issue does not block
this map from closing.

## Consequences

- ADR 0046's travel sentence and ADR 0043's four-seam list both stand as written. Neither is amended
  by this ADR; both are read as governing what they say.
- Duplication between the two Titles' boarding is accepted deliberately and for a bounded time. It
  is a cost recorded here, not an oversight, and #419 is where it is paid off.
- The Damocles Save Snapshot gains Occupancy, which bumps its schema deliberately in the manner
  [ADR 0044](0044-admit-damocles-saves-as-a-title-scoped-snapshot.md) requires — that ADR already
  names "Occupancy aboard a craft" as a thing waiting on evidence. The evidence has arrived.
- The gate's constants — the boardable bound, the no-key exemptions, slot 7's own refusal and the
  `+178` key pairing — are facts about the original's tables and are published per instance in the
  Damocles Catalogue under ADR 0043's provenance rule, not compiled into session code.
- Seated eye height is `derived` from each model's recovered Y bounds. _(Withdrawn by the
  2026-09-23 amendment: it is recovered, and is 63.)_ No boarded Pose is recovered for any craft.
- This ADR changes no application code, no `CONTEXT.md` entry, no payload and no schema. The
  contract and the implementation follow as the other children of #403.
