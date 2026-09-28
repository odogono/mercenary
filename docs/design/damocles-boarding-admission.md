# Damocles boarding admission contract

Design for [#407](https://github.com/odogono/mercenary/issues/407), part of the
[Damocles Occupancy map](https://github.com/odogono/mercenary/issues/403) and bounded by
[ADR 0047](../adr/0047-admit-occupancy-into-damocles-play.md). It bounds boarding, refusal
and leaving the way [the limo-key contract](damocles-limo-key-interaction.md) bounded the
limo-key pickup. The payload belongs to [#408](https://github.com/odogono/mercenary/issues/408),
the session to [#416](https://github.com/odogono/mercenary/issues/416), persistence to
[#417](https://github.com/odogono/mercenary/issues/417) and browser verification to
[#418](https://github.com/odogono/mercenary/issues/418). This document adds no application
implementation.

**Three premises of the map are corrected here, each by evidence rather than by preference.**
Writing this contract meant decoding what the board routine does after its last guard, which
no note had done. That decode is recorded in
[the board and leave paths note](../research/damocles-board-leave-paths.md), and it changes
three things #403 had assumed:

1. **The seated eye height is recovered, not derived.** Boarding sets the Pose position to the craft's
   resident position plus 63 in Y, the same 63 as on foot, with no per-model term. The
   boarded captures read 63 for `V.I.P. LIMO` and `EAGLE NINE S E`. No model's Y bounds take
   part, and #408 has no seated eye height to publish. ADR 0047 carries a dated
   amendment saying so.
2. **The gate has an eighth guard.** After the key test, a board is refused silently unless
   the object's model record opens with the single-Y-turn orientation command. `ATTACK SHIP`
   and `NEUTRON FUEL` fail it whatever else holds.
3. **A `SETTEE` is not boardable.** Every `SETTEE` sits at slot 27 or above, past the
   boardable bound at 23. The only object the "seatable" outcome can admit is
   `AUTHOR'S CHAIR`, slot 14, inside Authors House on Dion.

## Evidence and scope

Provenance is per value, under [ADR 0043](../adr/0043-admit-damocles-play-alongside-the-second-city.md)'s
fidelity rule: **recovered** from the Working Authority, **derived** mechanically from
recovered values, or **authored** by this project. Every row below cites a research note.
Secondary sources are leads, never citations: the fan guide #404 used to aim its replays
appears nowhere in this contract.

| Evidence                                                                        | What it establishes                                                               | Note                                                                                                                            |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Board gate `$054302`–`$054336` and refusal chooser `$0542E0`                    | the guards in order, and the four chooser outcomes                                | [arrival routes](../research/damocles-arrival-routes.md#the-board-gate)                                                         |
| Key test `$054332` as `$6FAA + (slot + 178) × 4`, bit 7                         | the Vehicle Key is a carried requirement; four drop/retake replays on two craft   | [vehicle-key gate](../research/damocles-vehicle-key-gate.md)                                                                    |
| Region guard `$054310`                                                          | exercised by pressing `B` indoors; refuses silently                               | [vehicle-key gate](../research/damocles-vehicle-key-gate.md#the-region-flag-at-054310--exercised-by-an-ordinary-route)          |
| VOID guard `$05432A`                                                            | reachable state, unexercisable guard                                              | [vehicle-key gate](../research/damocles-vehicle-key-gate.md#the-void-staging-body-at-05432a--reachable-state-unreachable-guard) |
| Model guard `$054338`–`$05434E`, board body `$054350`–`$0543BA`, tail `$0542B6` | the eighth guard; Pose position, heading, residence removal                       | [board and leave paths](../research/damocles-board-leave-paths.md#what-boarding-does)                                           |
| Leave path `$05449C`–`$05450E`, direct placement `$0546CC`                      | four leave guards; leveling; leaving as a direct-placement drop                   | [board and leave paths](../research/damocles-board-leave-paths.md#what-leaving-does)                                            |
| Occupancy captures on/boarded/driving/left                                      | residence removed while aboard, coordinates stale, restored at the leave position | [V.I.P. limo](../research/damocles-vip-limo.md#residence-while-boarding-driving-and-leaving)                                    |
| `key slot = vehicle slot + 178`                                                 | the pairing across the eight recovered pairs                                      | [V.I.P. limo](../research/damocles-vip-limo.md#relationship-to-key--vip-limo)                                                   |
| Instance angle `$77A8 + 4 × slot`, `$054390`, `$0544FA`                         | yaw published as byte × 4 on boarding; written back as yaw ÷ 4 on leaving         | [V.I.P. limo](../research/damocles-vip-limo.md#what-the-draw-path-reads)                                                        |
| Yaw word, 1024 per turn                                                         | the unit the camera takes                                                         | [walk / board / flight](../research/damocles-walk-board-flight.md#camera-yaw-and-world-axes--confirmed-working-authority)       |
| Selection `$7B46`/`$7B42`                                                       | nearest drawn object, and the distance its exponent encodes                       | [object selection](../research/damocles-object-selection.md)                                                                    |

### Included

In the order the Reference Build evaluates it:

- **The board gate**, all eight guards: reach, nothing selected or slot 0, region flag bit 14,
  the boardable bound at slot 23, already aboard, the VOID staging Body, the Vehicle Key test,
  and the model guard.
- **The refusal chooser** and all four of its outcomes: slot 1 boards unkeyed, slots 14 and
  above board as seatable objects, slot 7 takes `system-string-22`, every other slot takes
  `system-string-3`.
- **Boarding**: Object Residence removed, the object becomes the Occupancy, the Pose moves to
  it, and the Camera takes its heading.
- **Leaving**, with its four guards: roll and pitch leveled, the instance angle written back,
  and the object restored to Object Residence at the leave position.
- **The Object Residence round-trip**, including stale resident coordinates while occupied.

It covers every placed craft on the five Bodies that carry them, and the one placed seatable
object:

| Body    | Slot | Object             | Admission   | Vehicle Key                                | Key placement                                     |
| ------- | ---- | ------------------ | ----------- | ------------------------------------------ | ------------------------------------------------- |
| Eris    | 1    | `DART II`          | unkeyed     | —                                          | —                                                 |
| Eris    | 3    | `EAGLE NINE S E`   | keyed       | `object-slot-181`                          | unresolved                                        |
| Eris    | 4    | `BESTCUPAND CRAFT` | keyed       | `object-slot-182`                          | unresolved                                        |
| Eris    | 5    | `V.I.P. LIMO`      | keyed       | `object-slot-183`                          | recovered, Capital Spaceport region 1             |
| Eris    | 7    | `INTERSTELLARSHIP` | own refusal | paired object `object-slot-185` (`SETTEE`) | unresolved                                        |
| Gaea    | 2    | `99 CHEVY`         | keyed       | `object-slot-180`                          | recovered, Eris structure `eris-structure-0251d7` |
| Gaea    | 13   | `22 CV`            | keyed       | `object-slot-191`                          | unresolved                                        |
| Dion    | 6    | `TARG TOURER`      | keyed       | `object-slot-184`                          | recovered, Vesta `vesta-surface-64`               |
| Dion    | 14   | `AUTHOR'S CHAIR`   | seatable    | —                                          | —                                                 |
| Bacchus | 10   | `CONCORD III`      | keyed       | `object-slot-188`                          | unresolved                                        |
| Thalia  | 12   | `BULLET`           | keyed       | `object-slot-190`                          | unresolved                                        |

A keyed craft whose key has no recovered placement can only be refused in play. That is a
Catalogue gap, and the contract is written so that closing it needs no session change.

### Excluded, with the reason

| Excluded                                                                        | Why                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Driving: the speed keys `1`–`9`, joystick steering aboard, the throttle `$7BAC` | ADR 0047. Damocles has no Craft Parameter Block, and [#208](https://github.com/odogono/mercenary/issues/208) found no RAM word the speed keys write, so every rate would be authored. The recovered throttle preset `$054744` that boarding and leaving both call is excluded with it. |
| Space travel: `Esc`, the `$055C80` capability table, `system-string-21`         | A different gate, at `$055822`, after boarding. Out of the map.                                                                                                                                                                                                                        |
| `ATTACK SHIP`, slot 11                                                          | Its residence is unresolved, so it has nowhere to be boarded. If it were placed, its paired slot 189 is a `NULL` record that is never carried, so the key test would refuse it with `system-string-3`; and it would fail the model guard even past that.                               |
| `NEUTRON FUEL`, slots 8 and 15                                                  | Residence unresolved. Slot 15 would fail the model guard; slot 8 would take `system-string-3` first.                                                                                                                                                                                   |
| `SETTEE` and every other object at slot 23 and above                            | Not an exclusion from the gate but its answer: the bound refuses them silently. Named here because #403 expected otherwise.                                                                                                                                                            |
| The named places of craft other than slot 5                                     | Unresolved in the Catalogue and not needed: the placements are recovered.                                                                                                                                                                                                              |
| The seven unplaced Vehicle Keys' positions                                      | Owned by the Catalogue.                                                                                                                                                                                                                                                                |
| The hazard evaluator `$0543FA` leaving calls                                    | The session evaluates no environment hazard on a Drop either; it is carried-object gameplay owned elsewhere ([carry capacity](../research/damocles-carry-capacity.md#carried-object-consequences-that-no-handling-bit-predicts)).                                                      |
| The sounds boarding requests through `$054848` and `$4BF58`                     | The laboratory runs with sound off; no cue is identified.                                                                                                                                                                                                                              |
| `$042D14`, which boarding calls                                                 | Undecoded; it is also called from the flight path.                                                                                                                                                                                                                                     |
| Slot 9's branch at `$0544E0`                                                    | Unreachable by boarding: slot 9 is a `NULL` record and the model guard refuses it. It is the on-foot fall's Mover state, which the landing tail leaves through this path ([ground contact](../research/damocles-ground-contact.md#the-fall-is-craft-slot-9-not-057de6)); the session has no fall.                                     |
| Take, the Body switch and the cell `goto` while aboard                          | Not established by any capture. See [Aboard](#aboard). A Drop aboard is observed and included.                                                                                                                                                                                        |
| Any Targ change, and any mechanism shared with Targ                             | ADR 0047 and ADR 0043; alignment is [#419](https://github.com/odogono/mercenary/issues/419).                                                                                                                                                                                           |
| Payload, schema and session code                                                | #408, #416 and #417.                                                                                                                                                                                                                                                                   |

## The rule

Stated in the Gameplay Session's vocabulary. The addresses are provenance.

### Boarding

When the player presses `B`, the Gameplay Session takes the current Selection and applies
these tests in order. The first that fails decides the outcome.

| #   | Test                                                                                         | On failure                   | Provenance                                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | The nearest drawn object is less than **1024** source units from the Pose position           | nothing                      | derived: `$054302`'s exponent ≤ 9 under the selection note's float rule                                                                                                  |
| 2   | The Selection names an object at all                                                         | nothing                      | recovered: `$05430A`                                                                                                                                                     |
| 3   | The current structure region's flags have bit 14 set; with no current region the test passes | nothing                      | recovered: `$054310`, exercised by #404; the no-region pass is derived from the `$C000` fallback [`$5A64A`](../research/damocles-generic-entrance-attachments.md) writes |
| 4   | The object is boardable: its slot is between 1 and 22                                        | nothing                      | recovered: `$05431A`, `$05431E`                                                                                                                                          |
| 5   | The player's Occupancy is on foot                                                            | nothing                      | recovered: `$054324`                                                                                                                                                     |
| 6   | The player is not on the VOID staging Body                                                   | nothing                      | recovered: `$05432A`; **unexercised**                                                                                                                                    |
| 7   | The object's paired object is in the Carried Stack, or the object is admitted without one    | the object's refusal message | recovered: `$054332`, `$0542E0`                                                                                                                                          |
| 8   | The object's model carries the single-Y-turn orientation command                             | nothing                      | recovered: `$054338`–`$05434E`                                                                                                                                           |

"Nothing" means a silent refusal: no message, no sound request and no change to any Session
State.

Test 1 uses a wider reach than the Take. The Take admits under 512 units, and the session's
Selection currently marks `inRange` against 512 and ignores candidates beyond it. Boarding
needs the same nearest-drawn-object rule out to 1024, not the Take's `inRange`.

Test 7 is where the Vehicle Key lives. For slots 2 to 13 the paired object is the resident
object at slot + 178. The test asks the Carried Stack; it does not ask a stored "unlocked"
fact, because there is none. When the test fails, the chooser answers from the object's
identity alone:

| Object           | Outcome                                                                 | Provenance           |
| ---------------- | ----------------------------------------------------------------------- | -------------------- |
| Slot 1           | admitted, unkeyed                                                       | recovered: `$0542E2` |
| Slots 14 to 22   | admitted as a seatable object                                           | recovered: `$0542E8` |
| Slot 7           | refused with `system-string-22`, `SHIP NOT REFITTED FOR FURTHER FLIGHT` | recovered: `$0542EE` |
| Every other slot | refused with `system-string-3`, `VEHICLE KEY REQUIRED`                  | recovered: `$0542F4` |

The refusal message is presented on the Damocles Display exactly as the limo-key refusals are.

### The six admission outcomes

| #   | Outcome                             | Objects                                      |
| --- | ----------------------------------- | -------------------------------------------- |
| 1   | **Boards**, its Vehicle Key carried | the keyed craft of the table above           |
| 2   | **Boards** unkeyed                  | `DART II`                                    |
| 3   | **Boards** as a seatable object     | `AUTHOR'S CHAIR`                             |
| 4   | **Refused** with `system-string-3`  | a keyed craft without its Vehicle Key        |
| 5   | **Refused** with `system-string-22` | `INTERSTELLARSHIP` without its paired object |
| 6   | **Refused** silently                | tests 1–6 and 8                              |

Outcome 5 is refused "whatever key is held" for every real key: slot 7's paired object is a
`SETTEE` at slot 185, not a key. Carrying that settee would admit slot 7 past the chooser, but
it has no resolved placement, so no route can carry it. The contract pairs slot 7 like any
other craft rather than special-casing it, and records that path as unexercised.

### What boarding does

Once admitted, in one step:

- The object leaves Object Residence. It is neither placed nor carried. The Carried Stack is
  unchanged; boarding does not consume the Vehicle Key.
- The object becomes the Occupancy.
- The Pose position moves to the object's current resident position, raised by the same **63** units as
  the on-foot eye height. _Recovered_: `$054374`–`$054388`. The player's position before the
  press plays no part.
- The camera yaw becomes the object's instance angle byte × 4, which is the byte's 256 steps
  a turn expressed in the yaw word's 1024. It is the instance byte, **without** the model's
  orientation bias. _Recovered_: `$054390`.
- Pitch and roll are not written. On foot nothing pitches the view, so they are already level.

No Damocles Script fires. The take's trigger table is consulted, but none of the slots it
names can be boarded.

### Aboard

While the Occupancy is an object:

- **No Mover runs**, so the Pose holds. The original steers and drives a boarded craft;
  driving is excluded, and running the on-foot Mover aboard would be a departure. _Authored_,
  as the boundary of this map.
- **The occupied object is not drawn.** It has no Object Residence, and its catalogue
  coordinates must not stand in for one. _Recovered_: the boarded capture holds the
  object's resident coordinates unchanged while its association words say it is not resident.
- **`B` is refused silently**, by test 5.
- **A Drop completes.** _Recovered_: `$054520`, observed aboard `EAGLE NINE S E` on the ground
  ([ground contact](../research/damocles-ground-contact.md#observed-on-an-ordinary-route)).
  The Drop's own checks apply as on foot, except that the interior group search at `$05453A`
  runs only on foot. The contact gate `$05462A` refuses silently while the craft is off the
  ground. A direct placement puts the object one eye height below the eye, where the object
  the player occupies stands, and on the surface: aboard, `$7AAE` is not 1, so the insertion
  group is zero.
- **Take, the Body switch and the cell `goto` do nothing.** _Authored._ No capture shows a
  Take completing aboard; the selection note records that as untested. The Body switch and
  the `goto` are the project's own actions (ADR 0046) and would carry the player away from an
  object that is no longer resident anywhere.

### Leaving

When the player presses `L`, the Gameplay Session applies these tests in order. Each refuses
silently.

| #   | Test                                                          | Provenance                                                                                |
| --- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1   | The player's Occupancy is an object                           | recovered: `$0544A0`                                                                      |
| 2   | The occupied object is in ground contact                      | recovered: `$0544A8`; **unexercised**, since nothing aboard leaves the ground             |
| 3   | The Pose position is not at sea, by the island classification | recovered: `$0544B0`; **unexercised**, since an immobile object stays where it was placed |
| 4   | The player is not on the VOID staging Body                    | recovered: `$0544B8`; **unexercised**                                                     |

Then, in one step:

- Roll becomes 0 and pitch becomes level. _Recovered_: `$0544C6`, `$0544CC`.
- The Occupancy becomes on foot.
- The object's instance angle byte becomes the camera yaw ÷ 4. _Recovered_: `$0544FA`. With
  no Mover aboard, the yaw is still the one boarding set, so the byte is unchanged.
- The object returns to Object Residence **as a direct-placement Drop would place it** at the
  point 63 units below the Pose position: the surface where no structure region is current or the
  region's flags have bit 14 set, and otherwise the structure, in the current region's
  insertion group. _Recovered_: `$0546CC`. Leaving enters the drop after its checks, so it is
  never refused with `system-string-9`.
- The Pose position stays where it is. The player is standing on foot at the object's origin.

### The Object Residence round-trip

| Moment | Object Residence                                                          | Occupancy  | Pose position                  |
| ------ | ------------------------------------------------------------------------- | ---------- | ------------------------------ |
| Before | placed, at its resident position                                          | on foot    | wherever the player walked     |
| Aboard | none; its resident coordinates are stale and not drawn                    | the object | the object's position, plus 63 |
| After  | placed at the point below the Pose position, by the direct-placement rule | on foot    | unchanged from aboard          |

Because nothing moves aboard, **after equals before** for every surface object: same position,
same instance angle, same Body. That is a consequence of excluding driving, not a rule. The
original restores the object wherever the player left it — the `occ-left` capture shows slot 5
restored somewhere new after driving — and the rule above is written so that a driving map
inherits it unchanged.

For `AUTHOR'S CHAIR` the round-trip does not return what it started with. The chair is
structure-resident in insertion group `$20`. Boarding it needs bit 14 of the current region's
flags set, and if the region is unchanged at leaving, the same bit sends the direct-placement
rule to its surface branch, so the chair comes back in the surface form at its own position.
Boarding moves the Pose to the chair's origin, so the current region at leaving need not be the
one the board was pressed in; whether it changes there is not established. All of this is
derived from instructions and published region flags, not observed.

## The camera

| Value         | Aboard                                 | Provenance                                                                                                                                              |
| ------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pose position | the object's resident position, Y + 63 | recovered: `$05437A`–`$054384`; 63 read in the `occ-boarded`, `occ-driving`, `vehicle-key-carried-board` and `vehicle-key-eagle-carried-board` captures |
| Heading       | yaw word ← instance angle byte × 4     | recovered: `$054390`; `$7F` → `$01FC` in `occ-boarded`                                                                                                  |
| Pitch, roll   | unchanged: level                       | recovered: not written by `$054350`–`$0543BA`                                                                                                           |
| Eye height    | 63, the same value as on foot          | recovered: one instruction for every slot                                                                                                               |

The eye height is a single recovered value, not a per-craft one, and it is the eye height the
presentation document already carries. #403 and ADR 0047 expected a value derived from each
model's Y bounds. That expectation is withdrawn: using the bounds would contradict captures of
two craft. `payload/damocles/arrival-poses.json` still holds no boarded Pose, and this contract
does not need one.

## What the Data Payload must carry

For #408. The session reads these rather than compiling slot constants.

| Per resident instance | Values                                                                                       | Provenance                                                      |
| --------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Boardable             | whether the slot is below 23 **and** the model carries the single-Y-turn orientation command | derived from the recovered bound and the recovered model header |
| Admission             | unkeyed, seatable, or paired with one instance                                               | derived from the recovered chooser and the `+178` relation      |
| Paired instance       | the instance at slot + 178, for slots 2 to 13                                                | derived from the recovered relation                             |
| Refusal message       | `system-string-22` for slot 7, `system-string-3` for the others                              | recovered: `$0542E0`                                            |

Carry the paired instance by id even where it is not a Vehicle Key in name, as for slot 7. A
missing paired instance, as for slot 11's `NULL` slot 189, is recorded as missing, not
invented. No seated eye height is published.

## What the evidence does not establish

- **The reach boundary at runtime.** 1024 units follows from the float rule; #404's boards at
  194 units and the silent press 1.2 cells short bracket it only loosely.
- **The seated eye height for a craft whose resident Y is not 0.** Every capture boards a craft
  standing at Y 0. The rule says resident Y + 63; nothing observed tests the sum.
- **Boarding `DART II`.** It is 3455 cells from every tracked pose; its admission is read from
  instructions.
- **Boarding `AUTHOR'S CHAIR`.** No capture has entered Authors House, whose entrance is keyed
  to `DOOR KEY A`, which has no recovered placement. From published region flags, a board passes
  test 3 from Authors House regions 26–28, 33 and 34 and refuses from 11 and 12.
- **Slot 7 boarding past the chooser.** It would need `SETTEE` slot 185 carried; that settee has
  no resolved placement.
- **The ground-contact, sea and VOID guards**, on both paths. Recovered from instructions. Each
  is included as a guard and recorded as unexercised.
- **A Take or any other action aboard except a Drop.** Untested in the original; this contract
  makes them do nothing, and says it made that choice. The Drop is observed and included
  ([ground contact](../research/damocles-ground-contact.md)).
- **Resident slot 38.** #404's one counterexample to "bit 7 means carried" cannot reach the
  gate, since slot 38 is below 178, but it keeps the invariant short of a closed rule.
- **Sound.** Boarding and leaving both request sounds; none is identified.

## Worked traces

Each starts from ordinary play. Where it has been run in the Working Authority, the capture
is named.

| Trace                                                            | Expected                                                                 | Evidence                                   |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------ |
| Walk to `V.I.P. LIMO` with an empty Carried Stack, press `B`     | `VEHICLE KEY REQUIRED` on the Damocles Display; limo resident; on foot   | `limo-no-key-route.json`, two runs         |
| Take `KEY- V.I.P. LIMO`, walk to the limo, press `B`             | aboard slot 5; limo not drawn; Pose at the limo + 63; yaw `$01FC`        | `occ-boarded`, `vehicle-key-carried-board` |
| Aboard, press `L`                                                | on foot at the limo's origin; limo drawn where it was; key still carried | `occ-left` (after driving)                 |
| Take the key, drop it, press `B` beside the limo                 | `VEHICLE KEY REQUIRED`                                                   | `vehicle-key-drop-board`                   |
| Drop the key, take it back, press `B`                            | aboard                                                                   | `vehicle-key-drop-retake-board`            |
| Carry `KEY- V.I.P. LIMO` only, press `B` beside `EAGLE NINE S E` | `VEHICLE KEY REQUIRED`                                                   | `vehicle-key-eagle-drop-board`             |
| Press `B` beside `INTERSTELLARSHIP`                              | `SHIP NOT REFITTED FOR FURTHER FLIGHT`                                   | `arrival-route-slot7`                      |
| Press `B` inside Capital Spaceport region 1 beside a dropped key | nothing                                                                  | `vehicle-key-interior-board`               |
| Press `B` beside `DART II`                                       | aboard                                                                   | instructions only                          |
| Press `B` beside `AUTHOR'S CHAIR` from region 26                 | aboard                                                                   | instructions and published flags only      |
| Press `B` beside a `SETTEE`                                      | nothing                                                                  | instructions only                          |
| Aboard, press `B`                                                | nothing                                                                  | instructions only                          |
| Aboard `EAGLE NINE S E` on the ground, press the drop chord      | head of the Carried Stack placed at the craft, eye Y minus 63            | `ground-contact`, two runs                 |
| Aboard `EAGLE NINE S E` in the air, press the drop chord         | nothing; refused at `$05462A`                                            | `ground-contact`, two runs                 |

## Handoff

- **#408** publishes the table in [What the Data Payload must carry](#what-the-data-payload-must-carry),
  including the model-guard term in "boardable", and publishes no seated eye height. Its
  acceptance line about "the seated eye height derived from the model's recovered Y bounds"
  is superseded by this contract.
- **#416** implements the eight board tests, the four leave tests and the rules above. Its
  acceptance line "a seatable object at slot 14 or above boards" can only be met by
  `AUTHOR'S CHAIR`, which ordinary play cannot yet reach, so a test that places the player in
  Authors House is the honest form. "The camera on boarding takes the recovered yaw and the
  published seated eye height" becomes the recovered 63.
- **#417** persists the Occupancy as one instance id or on foot. It persists no Vehicle Key
  state, because there is none beyond the Carried Stack.
- **#418** verifies the traces above in the browser and records the unexercised guards as
  unexercised.

## Browser verification (#418)

Run on 2026-09-24 against `f131d6c` (`web` 0.20.0, Damocles Save schema 6, Catalogue schema 17), in
Playwright's Chromium at 1280 × 900, with `bun test` (1696 passing), `typecheck`, `lint` and `knip`
green on the same tree.

The pass lives in [`web/e2e/damocles-boarding.e2e.ts`](../../web/e2e/damocles-boarding.e2e.ts) and
shares [`web/e2e/damocles-play.ts`](../../web/e2e/damocles-play.ts) with the limo-key and
body-aware passes. Every test drives the session through the Control Profile's own keys (arrows,
`T`, `D`, `B`, `L`) and development-console lines, and asserts the page raised no errors. Two
places are reached by moving the start rather than walking, which is the idiom those passes
already use: `DART II`, 2500 cells from the spaceport, and Gaea's UR City arrival Pose, moved
beside `99 CHEVY` before the authored switch lands on it. Run it with
`bun run test:e2e damocles-boarding`.

### The traces, in the browser

| Trace                                                            | Browser route                                                                                      | Result                                                                                                                                                                                           |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Walk to `V.I.P. LIMO` with an empty Carried Stack, press `B`     | Start beside the limo in spaceport region 4                                                        | `VEHICLE KEY REQUIRED`; on foot; the limo drawn once                                                                                                                                             |
| Take `KEY- V.I.P. LIMO`, walk to the limo, press `B`             | From the doorway line, `T`, then walk north through the doorway until the limo is in reach         | Aboard slot 5; the eye at the limo's position with `y` 63, the on-foot height; the heading is the angle byte × 4 as yaw; the limo drawn nowhere; the key still carried; walking moves nothing    |
| Aboard, press `B`                                                | The same session                                                                                   | Still aboard, the Pose unchanged                                                                                                                                                                 |
| Aboard, press `L`                                                | The same session                                                                                   | On foot at the same Pose; the limo drawn exactly once, and still drawn once after backing away                                                                                                   |
| Take the key, drop it, press `B` beside the limo                 | `T` and `D` on the doorway line after the response parks, then walk north                          | `VEHICLE KEY REQUIRED`: the key is a carried requirement (#404)                                                                                                                                  |
| Drop the key, take it back, press `B`                            | Walk back to the dropped key, `T`, walk north again                                                | Aboard                                                                                                                                                                                           |
| Carry `KEY- V.I.P. LIMO` only, press `B` beside `EAGLE NINE S E` | `T` at the key, `goto 9 9`, turn with short taps and walk into reach                               | `VEHICLE KEY REQUIRED`; on foot                                                                                                                                                                  |
| Press `B` beside `INTERSTELLARSHIP`                              | Start beside it in spaceport region 10                                                             | `SHIP NOT REFITTED FOR FURTHER FLIGHT`; on foot                                                                                                                                                  |
| Press `B` inside Capital Spaceport region 1 beside a dropped key | Drop the key at the far edge of region 0 once the response parks, then step into region 1          | Nothing: no message, on foot, the Pose unchanged                                                                                                                                                 |
| Press `B` beside an object past the boardable bound              | Start at the limo key's approach in region 9, which carries bit 14                                 | Nothing: the key (slot 183) is refused by the bound at 23                                                                                                                                        |
| Press `B` beside `DART II`                                       | Start beside it                                                                                    | Aboard unkeyed; `L` leaves it drawn once                                                                                                                                                         |
| A craft on another Body                                          | `switch gaea-ur-city-4-2` beside `99 CHEVY`; press `B`; then the key written into a Save, `B`, `L` | `VEHICLE KEY REQUIRED` without the key; with it, aboard, drawn nowhere, then left and drawn once                                                                                                 |
| Saves: before boarding, aboard, after leaving                    | `save 1`/`2`/`3` at each, then `load` each                                                         | Each restores its own Occupancy and Pose; the aboard record says `aboard` with an `occupied` departure and restores the same seated view with the limo drawn nowhere; leaving it leaves one limo |
| Session Resume: before boarding, aboard, after leaving           | Reload the page in each state                                                                      | The same three states, identically                                                                                                                                                               |
| A schema 5 record                                                | The aboard Save rewritten to schema 5's shape, then `load`                                         | `load refused`; the live session on foot where it was; the stored record byte-identical                                                                                                          |

### What was added so the browser could answer

Two readouts were published from the Damocles boot, for the same reason `data-region` was:
`data-y`, the eye height, which boarding and leaving move; and `data-drawn`, every structure and
object placement the frame plan emitted, repeats kept. A triangle count also moves with the
view, so it could not say that an occupied craft is drawn nowhere or that a left one is drawn
once. `data-drawn` reads the plan's new `drawnPlacements`, and a unit test pins the same claim
against the planner. Neither readout changes behaviour.

### Unexercised, and why

- **Boarding a craft off Eris by an ordinary route.** Only two Vehicle Keys for craft off Eris
  have a recovered place: `KEY - 99 CHEVY` (slot 180, in `eris-structure-0251d7`) and
  `KEY- TARG TOURER` (slot 184, in `vesta-surface-64`). Both are level 1 structure residents, and
  floor-aware binding is unrecovered ([#355](https://github.com/odogono/mercenary/issues/355)),
  so neither is ever exposed. The refusal on Gaea is ordinary play. The board and leave that
  follow it start from a Save with the key written into the Carried Stack, and the test says so.
- **`AUTHOR'S CHAIR`.** Ordinary play cannot reach it behind Authors House's keyed door. It is
  covered only by the deterministic suite.
- **A `SETTEE`.** No `SETTEE` is placed anywhere in the Catalogue. The boardable bound's silent
  refusal is exercised on the limo key instead.
- **The region test on its own.** `B` in region 1, which lacks bit 14, is silent, but the only
  object in reach there is the limo key, which the slot bound refuses as well. The browser cannot
  tell the two refusals apart, so board test 3 stays **unexercised** as a distinct outcome.
- **The VOID staging Body.** Board test 6 and leave test 4: no route reaches Body `$78`.
- **Leave tests 2 and 3.** Nothing aboard moves, so the craft never leaves ground contact and
  never reaches the sea.
- **"Drawn where it was left rather than at its original coordinates."** Nothing moves aboard,
  so the leave position is the boarding position, and the browser cannot separate the two by
  where the craft stands. What it does show is that the left craft is drawn once, from its
  Object Residence departure, and never also from its Catalogue placement.

### Remaining limitations

- **This is confirmation, not proof.** The deterministic suites remain the authority.
- **Four browser tests outside this pass were failing on `main`, and are fixed alongside it.**
  Three in `damocles-body-aware.e2e.ts` still expected Gaea to have one admitted Pose. It has had
  two since [#390](https://github.com/odogono/mercenary/pull/390) recovered the transporter's
  workspace, so they now switch to `gaea-ur-city-4-2` by name and use `midas` for the Pose with
  no recovered origin. The NAV 09-09 door walk in `damocles.e2e.ts` timed the leaf against the
  wall clock, so it failed whenever a loaded browser advanced session time more slowly. Its
  waits now allow for that load.
