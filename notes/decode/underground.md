# Underground: rooms, corridors, and the lift

Decode notes for the underground half of the world. The rooms were decoded during
the geometry work and carried into the Data Payload later; the lift and the indoor
presentation were read while closing the opening play loop.

## Rooms

192 rooms, each a closed point space of its own. The Reference Build expands a
room's drawing commands into points before it draws anything, so a room's edge
indices mean nothing outside that room, and there is no cell ring and no distance
culling of the kind the surface needs — one room is drawn at a time.

Room records live behind a pointer table and are **shared**: several rooms name the
same record, so a room refers to its record by identity rather than carrying it. One
record (`$3000`) is shared by nineteen room ids — `$00`, `$01`, and `$AF..$BF` — and
every other record belongs to one room, which is where both command totals come
from: `192 = 173 + 19`, and `427 + 3×18 = 481`.

Each command in a record is one **Doorway**. Its opcode packs three fields and the
whole byte is now accounted for:

| bits | field |
| --- | --- |
| 7 | plane, `xy` when clear and `zy` when set |
| 4-6 | the **arrival command index** in the destination room |
| 0-3 | the door's shape, which is also its lock class |

**Bits 4-6 were the last unexplained field and they are not a coordinate.** They name
which of the *destination* room's own commands the player arrives in: `$94C8` folds
them into the record offset `4n + 7`, and `$9148` reads the x byte, the z byte, and
that command's own plane bit from there. So arrival is `x = destX*256 + (plane ? $00 :
$80)` and `z = destZ*256 + (plane ? $80 : $00)`, and **no y is written at all** —
altitude survives a room transition untouched. Three things settle the reading: 426 of
427 commands hold an index the destination actually has, the maximum commands per
record is eight and three bits address exactly eight, and the runtime patch at `$9133`
does `AND #$8F / ORA` — splicing into precisely this mask and nothing else. There is
no `AND #$70` anywhere else in the image.

**The linked byte is a room link, and `$00` means the surface.** All 481 land on real
room ids, none is a self-link, and the decoder now records the destination as a room
or the surface rather than leaving both readings to travel.

Two counts of one-way links circulate and both are right, so it is worth being
explicit about which is which:

- **83 unanswered Doorways.** Per command, out of 481. This is what `lab geometry
  rooms-svg` reports and draws in a different colour, because a Doorway is what the
  map draws. It includes the single Doorway onto the surface.
- **82 one-way Room Links.** Per distinct room-to-room pair, out of 478. This is what
  the payload manifest reports. It excludes the surface Doorway, because reciprocity
  is a relation between two rooms and the surface is not a room. Room `$9B` and room
  `$9D` each have two Doorways onto the other, which is two Doorways and one link —
  the other place the two totals part company.

Fifty-seven of the 82 come from the one record nineteen rooms share, which is the
reason this looks like a decode fault on first reading and is not one. See
`docs/preserved-quirks.md`.

**Most rooms are uniform 4096 × 1024 × 4096 chambers; the ones that decode to a
sliver are corridors connecting them.** Confirmed by eye against the rendered
contact sheet, and it explains the two shapes without any of it being a decode
error: a corridor is a chamber with one axis collapsed.

### The terminator is also the darkness flag

A record ends on `$00` or `$80`, and `$80` means one more thing. `$91EA` tests the
same byte three ways: zero ends the record, positive is a command, and `$80` exactly
clears all three room colours — gated on the photon emitter — and *then* ends it. So
darkness is not a field anywhere in the Reference Build's data; it is which terminator
a record carries. **Twenty records are dark.** The gate is object slot `$10`, and
either holding it (`$941A`, the carried list at `$BEB1`) or it lying in the room
(`$9425`, the room list at `$2981`) is enough.

Darkness clears `$C2`, `$C4`, and `$C5`. Only two of those come from a room: header
byte 3 is the background (`$C4`) and byte 4 the foreground (`$C5`). **`$C2` has no
per-room source at all** — `$9399` stores the immediate `1` on every room setup — so it
travels in the payload as one global `lineColour` rather than as a third palette entry.
The draw code reads the three as a triple into `($A3, $A5, $A6)` for three raster
bands, and only `$C4` is the restore source when the transition timer expires, which is
the other reason to believe `$C4`/`$C5` are the room-varying pair.

### Entry reactions, and the two header bits that were masked away

`header[1] >> 3` is an index, nonzero on 32 records with 23 distinct values in 2..29,
and `header[2]`'s top bit chooses what it means: set, and the index starts a Benson
script; clear, and it is stored to `$F7`. **`$F7` is not opaque state** — `$AEE8` does
`LDX $F7 / BEQ / JSR $8DAA`, the message routine, and darkness stores `1` there, which
is the index of *"ITS VERY DARK IN HERE"*. So the second arm is an entry message.

The two are alternatives in the Reference Build's own control flow, so the payload
carries them as a tagged union rather than as two fields that could both be set.
Twenty-three records run a script, nine queue a message.

### Locks and keys

`$9437` masks the shape nibble and compares it against `$08`: below that a Doorway
always opens, and at or above it the nibble indexes `$29C8`. That table is indexed by
the **raw** nibble, so the object a lock wants is the nibble plus eight — the seven
lock classes `9..F` want object slots `$11..$17`. Bit 7 of `$29C0 + slot` means the
player is holding it, the same idiom `interaction.py` already reads for the antigrav
and the kitchen sink. `$29F0` — slot `$30` — is the skeleton key and overrides every
lock. A refusal plays message `0`, `"LOCKED"`.

**53 of the 481 Doorways are locked.** Nibbles `0` and `8` never occur, so the `$08`
boundary is one class wider than the world uses and slot `$10` is never a door key.

Worth knowing before the lock work: slot `$30` has the fixed flag, and the take
routine at `$980B` only clears that while the kitchen sink (slot `$2F`) is held — the
skeleton key is behind another puzzle rather than lying around.

### The two special-setup families

Twenty-two records have `header[0]`'s top bit set, and they are exactly rooms
`$72..$87`. The Reference Build rewrites their single command before use, and the
values it rewrites it to sit past the terminator in a table of `(room, arrival index)`
pairs. The table comes in two sizes and the difference is arithmetic, not convention:

| | records | trailing bytes | pairs | record size |
| --- | --- | --- | --- | --- |
| room `$72` | 1 | 16 | 8 | 26 |
| rooms `$73..$87` | 21 | 4 | 2 | 14 |

Room `$72` selects at random with `AND #$0E`, which keeps three bits and therefore
reaches eight offsets from `10` to `24`, the last pair's second byte landing on `25`.
The other twenty-one select on the room the player came from, and the selection is
**three-way** rather than a match: if `$CD` differs from the byte at offset 10, pair 0
is used; if it matches that but not offset 12, pair 1 is used; and if it matches
**both**, no patch happens at all and the record's stored default stands. All 100
trailing bytes decode, every pair byte is a bare `$70` value, and none overlaps the
next record's header — the record region tiles exactly, so getting this wrong would
read a neighbour rather than fail.

Room `$72`'s own baked-in default is a ninth combination absent from its table.

### The world flip, and how to miss it

`$9141` compares the target room against `$7F` and calls `$9353`, which is the only
`E0 7F` in the image that is code. The flip toggles `$F1`, a one-bit world parity flag
written nowhere else and folded into the coordinate and facing transform as `EOR $F1`
at eight sites, with a bit-2/bit-3 nibble-swap remap through the table at `$A17B`. It
also complements bit 6 of every live entity's `$29C0` byte and installs a longer
transition, `$F0 = $1F` instead of `$0A`. It is **not** an in-place table negation:
there is no `EOR #$FF` and no `SEC/SBC` sweep over coordinate tables.

The compare sits *after* the pair-patch block and is only reached when a pair was
actually applied. Room `$7F`'s two pairs are identical — both name room `$56` — so
arriving from room `$56` matches both, takes the "no patch" branch, and **skips the
flip entirely**. See `docs/preserved-quirks.md`.

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

All five cells share surface structure `$E9A7`. Its three raised lift levels use
extended height bytes and decode to Y 96, 192, and 288. Geometry decoder 3 missed
the routine's initial discard shift and produced 1072, 1120, and 1168 instead,
turning the low lift into a tall box; decoder 4 fixes that extraction error.

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

## Lift dispatch and indoor presentation

* **The lift is invoked by E.** `$B3F6` compares the keyboard result with `$0E`, the
  Reference Build's `E` key, before entering the handler containing `$B404`. Its
  remaining conditions are unchanged: the player must
  be on foot, and standing on the lift's pad — the position's middle byte shifted down
  two and compared against `$1C`, so middle bytes `$70` to `$73` on both axes, a small
  square near the middle of the cell. Surfacing puts the player at `$71`, the pad's own
  middle, so arriving leaves them able to go straight back. A search then walks the
  same destination tables backwards to find which site they are standing in, and the
  lift starts with `$CA` set to `$80` going down or `$01` going up.
* **The indoor screen is a decoded `$AA` bitmap fill.** `$AFC3` branches on the
  underground flag to `CLEAR_SCREEN_INDOOR` at `$B197`, which fills the bitmap with
  `$AA`. Bit 7 is drawn first, so the 320 bitmap columns alternate foreground then
  background across the full Game Surface. Room setup loads background and
  foreground from bytes 3 and 4 of the room-record header, storing them through the
  palette sites at `$91DB` and `$91E5`. Shared room records consequently share the
  same palette.

## Not the way in

`$A13D` looks like a building test and is not one. It is a box: cell 8:8, a
sixteen-middle-byte square within it, and an altitude high enough that it can only
be reached by climbing. That is the orbital transition, not a building — an earlier
pass in `flight.md` had it the other way round.
