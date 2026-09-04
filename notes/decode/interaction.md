# Reaching for the world: take and board

Taking an object and boarding a craft are one routine in the Reference Build,
`$97FA`. Decoded by `c64lab/interaction.py` into `interaction.json`, and applied
by `Interaction` in the app.

The routine is called from **inside the draw loop**, once per object, straight
after the camera-relative difference has been computed. That is not an
implementation detail: it means the player can only reach what is currently being
drawn, and it costs the check nothing because the difference is already to hand.
The app keeps the same rule by drawing its candidates from the scene.

## The rules, and where each was read

| Rule | Value | Site |
| --- | --- | --- |
| Take key | `$16` | `$97FC` |
| Board key | `$1C` | `$984F` |
| Take reach | 1 | `$9800` |
| Board reach | 2 | `$985D` |
| Reach unit | 256 world units | the distance check discards each axis's low byte |
| Craft slots | below 8 | `$9859` |
| Inventory limit | 10 | `$9827`, which compares against 11 |
| Fixed in place | `$10` | `$9813` |
| Too heavy | `$20` | `$981F` |
| Carried | `$80` | `$9834` |
| Description select | `$0C` | `$98B1` |
| Too-heavy message | 2 | `$9848` |
| Removed from world | `$FF` in the object's room | `$983C` |

Reach is a **cube, not a radius**: `CALC_ABS_DIST` (`$999A`) takes each axis in
turn and fails on the first that exceeds the threshold, so a corner is as
reachable as a face. It also compares only the upper two bytes of each 24-bit
difference, which is why the threshold counts whole steps of 256 rather than
plain distance. Board reaches further than take.

Two global overrides sit beside the object tables: `$29EF` lifts both the fixed
and heavy restrictions, while `$29DB` lifts the heavy restriction. The carried
object checks resolve them to Sink slot 47 and Antigrav slot 27 respectively.
Both overrides are implemented in `Interaction` and covered by take tests.

## What each action does

**Take** checks reach, then the object's own flag byte — fixed objects refuse
silently, heavy ones play message 2 — then appends to an inventory of ten, sets
the carried bit, and moves the object out of the world.

**Board** additionally requires that the player is on foot and that the slot is
one of the eight reserved for craft. It then plays the craft's description, snaps
the player to the craft's position, adopts the craft's heading from an orientation
table, copies that craft's sixteen-byte parameter block into the live block at
`$BEA0`, and marks the object as out of the world like a taken one.

The parameter block is the craft's flight behaviour. Boarding selects its decoded
block and heading, and the flight model applies both; this formerly deferred work
is implemented and covered by the boarding and Craft Parameter Block tests.

## What an object says when you reach it

`DOMSG_OBJECT_DESC` (`$98B1`) masks the object's flags with `$0C`. Nothing set
means the object says nothing, which is true of most of them. The low bit alone
**starts the Benson Script whose number is the object's own slot**; the higher bit
plays the message with that number instead.

This is the Reference Build's second script trigger, and it is how the opening
ends. Script 00 marks objects 1, 7, and 12 with the low bit as its first act, so
the Dart on the pad at 8:8 carries a script. Boarding it plays script 01: "THIS
CRAFT BELONGED TO THE PALYAR COMMANDER'S BROTHER-IN-LAW / HE IS NOT TOO PLEASED",
and script 01 clears those bits again so it only happens once.

Craft ids are object slots, which is what ties this together: the opening's
`tstc craft 1` is asking whether the player has boarded object 1.

## Reaching the Dart

From the opening pose the Dart is about 13,400 units away and off to one side —
roughly five seconds of walking. Boarding it needs the player within 767 units on
every axis, which is a box about a fifth of a cell wide. Standing on it, in other
words, which is what the original asked for too.

The opening does not accept boarding as an answer on its own: the script asks
whether the player wants to buy the craft and waits for a reply. Buying it leads
to the Palyar job offer; declining leads to "IT WILL BE A LONG WALK" and then to
the craft test, which boarding satisfies. Saying nothing at all leaves the script
in its "IS ANYBODY THERE / AM I TALKING TO MYSELF" loop, waiting, which is
faithful and worth knowing before wondering why boarding did nothing.

The formerly open parameter-block and heading work is recorded in the decoded
Craft Parameter Blocks and boarding implementation; the Sink and Antigrav
override question is resolved above.
