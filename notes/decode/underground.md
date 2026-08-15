# Underground: rooms, corridors, and the lift

Decode notes for the underground half of the world. The rooms were decoded during
the geometry work and carried into the Data Payload later; the lift was read while
scoping the building-entry step and is not implemented yet.

## Rooms

192 rooms, each a closed point space of its own. The Reference Build expands a
room's drawing commands into points before it draws anything, so a room's edge
indices mean nothing outside that room, and there is no cell ring and no distance
culling of the kind the surface needs — one room is drawn at a time.

Room records live behind a pointer table and are **shared**: several rooms name the
same record, so a room refers to its record by identity rather than carrying it.
Each command in a record names a primitive from a table of sixteen templates, a
plane (`xy` or `zy`, selected by the opcode's top bit), a middle-byte position, and
one further byte.

**That further byte is a room link.** It was carried as possibly-a-behaviour until
the map made it checkable: all 481 of them land on real room ids, none is a
self-link, and 398 reciprocate. A behaviour byte would not hit a valid room id every
single time. Both readings still travel in the payload, since a given command could
in principle mean the other thing, but the weight of evidence is settled.

The 83 that do not reciprocate are the interesting ones — one-way doors, or the lift,
or that other reading in those particular commands. `lab geometry rooms-svg` draws
them in a different colour so they can be found by eye.

**Most rooms are uniform 4096 × 1024 × 4096 chambers; the ones that decode to a
sliver are corridors connecting them.** Confirmed by eye against the rendered
contact sheet, and it explains the two shapes without any of it being a decode
error: a corridor is a chamber with one axis collapsed.

## The lift is the way in and out

`PLANET_UNDERGROUND` at `$A8` is the flag, and `MOVE` (`$A165`) consults it before
anything else: set, and the player moves by the on-foot routine rather than the
control loop, whatever they are standing in (see `flight.md`).

Only the lift writes that flag, at `$A298` — inside to outside — and `$A2F3` — outside
to inside.

`$A24A` derives the camera's altitude from the lift's own position, held at
`$CB/$CC`. It reads that position, computes, then re-reads and starts over if it
changed, which is a guard against the position being updated underneath it. The
altitude wraps at a middle byte of 6 by subtracting 7.

On arrival the transition zeroes the X and Z low bytes, sets both middles to `$71`,
and takes the destination cell from **two** tables indexed by the same site: X from
`$B4B6 + site` and Z from `$B4BE + site`, so the site counts from one.

Arriving inside hands the site to `SETUP_ROOM` (`$90BE`) as `$08`, and that routine
keys the room pointer tables at `$2300`/`$23C0` with it. So the site *is* the room
id: site one arrives in room one.

### Ruling: five lift entrances, and the sixth documented one is not a lift

Read out of our own image, the tables give `9:6`, `9:5`, `3:0`, `11:13`, `3:15` for
sites one to five. Site six lands on `81:35` and site seven on `136:136`, both off a
sixteen-by-sixteen grid, and site eight reads the first byte of the Z table — so the
X table is five long and that is what bounds the count. Nothing in the ROM states it.

That matches five of the six coordinates the community list carries (`9:6, 9:5, 3:0,
3:4, 3:15, 11:13`). The missing one is `3:4`, and it is absent from the lift table
altogether rather than misread. The documented list is of elevators *and hangars*,
and a hangar is entered by a different mechanism — the box test below — so `3:4` is
most likely a hangar. Not proven, but the tables are unambiguous about what they
hold.

## Laying the rooms out

Rooms carry no coordinates, but a layout can be walked out of the doorways, because
**every one of the 481 sits on a wall** rather than inside the room. A door on the
east wall can only lead to the room to the east. Forty-three sit on a corner and are
on two walls at once; the room on the other side settles those, since its own door
back has to be on the facing wall.

Only a doorway the other room answers places anything. Laying out on one-way links
as well is measurably worse — 62 collisions against 52, and a largest joined group of
19 against 25 — which is itself evidence that a one-way link is not a shared wall.
The lift is one such link.

Each room is placed at its own width and depth, and the two halves of a shared
doorway are butted together — which fixes both axes at once, since the far room's
wall meets the near room's and then slides along until the doors line up.

Doing that rather than giving every room one square is what makes the layout hold
together, and by a wide margin: **42 groups against 57, a largest joined group of 38
against 25, and 5 overlaps against 52.** The residue was almost entirely corridors
folded back on themselves for want of their real length.

Five rooms still want ground already taken. That is the honest remainder, and small
enough to be worth chasing one at a time rather than explaining away.

`lab geometry rooms-plan-svg` draws it.

## Still unread

* **What starts the lift.** The ride and its arrival are decoded; the trigger is not.
  Until it is read the app stands in for it with a key, which still refuses anywhere
  the tables say there is no lift.
* **The indoor screen.** The surface setup calls `DRAW_SCREEN_OUTDOOR` (`$AF6E`), so
  there is an indoor counterpart and a room is plainly not drawn against sky and
  ground. That routine has not been read, so the app encloses the view in a
  placeholder rather than claiming a colour.

## Not the way in

`$A13D` looks like a building test and is not one. It is a box: cell 8:8, a
sixteen-middle-byte square within it, and an altitude high enough that it can only
be reached by climbing. That is the orbital transition, not a building — an earlier
pass in `flight.md` had it the other way round.
