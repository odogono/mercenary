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

**That further byte is both a room link and a behaviour**, and which of the two it
is in any given command is not settled. Both readings are carried into the payload
rather than one being chosen.

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
and takes the destination cell from a table at `$B4B7` indexed by `$CD`, which is
the site the player is entering. That table is the elevator and hangar coordinate
list; cross-checking it against the community list of `9:6, 9:5, 3:0, 3:4, 3:15,
11:13` is still open, and the Z table's load site is still unread.

## Not the way in

`$A13D` looks like a building test and is not one. It is a box: cell 8:8, a
sixteen-middle-byte square within it, and an altitude high enough that it can only
be reached by climbing. That is the orbital transition, not a building — an earlier
pass in `flight.md` had it the other way round.
