# Endgame: economy, missions, combat, escape, and terminal play

This is the closed-world M7 dossier for the configured C64 Reference Build. It
records what can participate in an Ending, what merely changes progression, and
what looks terminal to a player but returns to active play. Benson Scripts remain
the progression authority; native engine code supplies input, object mutation,
weapons, hostile craft, world transitions, and the terminal renderer.

The headline result is deliberately narrow:

- there is **one Ending identity**, the successful Escape run by Benson script 7;
- there are **two acquisition/authorization routes** to that same Escape, both
  using craft slot 7;
- there is **no decoded terminal Defeat** in this build;
- `GAME OVER` belongs to the successful Escape epilogue, not to a loss;
- the Colony Craft and `$A13D` are a high-altitude world transition, not an
  Escape dispatcher.

This is a static, structurally guarded census. It closes the branch inventory,
but it is not a substitute for M7's legal-play comparisons: the repository does
not yet contain a tracked uninterrupted endgame run. The scenarios at the end of
this note are therefore requirements, not claims that acceptance has already
passed.

## Evidence and provenance

The primary binary evidence is the project's own Reference Build, conditioned in
the verified local run
`research/c64-reference-build/work/interactive-20260813T062240Z-f8abab9f/`.
Its `manifest.json` identifies build SHA-256
`ff725f37a7dc131396272d75625f7397aafecc15b158626c0a9165f2607808f3`,
RAM SHA-256
`04076f2abf5d043990cb26c3392ef548bca204df5dfc897a8180d0061f24ca6d`,
and VICE 3.10. `lab verify` accepts the run.

The following project-owned decoders were run against that RAM:

- `research/c64-reference-build/c64lab/benson.py` establishes the complete
  script graph: 51 entries, 494 reachable instructions, 2,523 covered code
  bytes, 138 inline messages, 29 used opcodes, three sound stores, and eight
  unreachable bytes. The local decoded document is
  `research/c64-reference-build/work/m7-endgame-benson.json`; it remains
  ignored.
- `research/c64-reference-build/c64lab/endgame.py` guards the native drop,
  weapon, hostile-craft, orbital-predicate, and terminal-phase instruction
  shapes before exporting their semantic values.
- `research/c64-reference-build/c64lab/interaction.py`,
  `research/c64-reference-build/c64lab/geometry.py`, and the room/object
  decoders establish the object slots, residences, room-entry triggers, and
  identities used below.

The tracked frozen disassembly at
`research/reference-disassembly/snapshot/Mercenary notzed/mercenary_v260410.lst`
and its symbol file `mercenary_v260411.tas` were used only to locate and
corroborate routines, under ADR 0014. All conclusions and values were checked
against the project's own RAM. No original instruction stream, text table, RAM,
snapshot, or capture is copied here, and none is added to version control.

The current evidence status is also visible in
`research/c64-reference-build/catalogue/uncertainties.json`: UNC-0007 remains
open, and `verification/cases/BC-0016.json`, `BC-0019.json`, `BC-0020.json`, and
`BC-0021.json` remain provisional. That is why structural reachability and
runtime observation are kept distinct below.

## Closed-world bounds

The census is closed by five independent bounds:

1. The Benson entry table ends exactly where the lowest script body starts:
   `$0800-$0865` is 51 entries and bodies occupy `$0866-$1249`.
   `c64lab/benson.py` rejects an entry outside that region, an unknown opcode,
   an unnamed engine address, an invalid target, or a changed interpreter
   fingerprint.
2. All reachable Benson instructions were walked from all 51 entries. Exactly
   one instruction writes `gameComplete`: script 7 at `$1123`.
3. The native engine has only the terminal-phase reads at `$AA69` and `$AB97`
   and the phase-advance write at `$AC46`. No native active-play path writes the
   value that begins an Ending.
4. There are exactly four native `BENSON_START` trigger sites in active play:
   projectile collision with object 0 at `$8795`, structure-destruction dispatch
   at `$8813`, room entry at `$921E`, and object description at `$98C0`.
   Opening script 0 is the seeded initial program. None provides another
   terminal entry.
5. The only craft control block that dispatches to the terminal renderer is
   slot 7: its block at `$9E1D` points through `$9E5D` to `$AA62`.

The eight unwalked bytes are an uncalled wait helper at `$0A96` and a stray
`ret` at `$0B15`; neither contains or reaches a terminal write. Scripts 45-50
are not dead code: the 51-entry bound exposes them as valid structure reactions.

## Controls and Semantic Actions

The C64 input reader at `$B2FE` separates keyboard matrix input from joystick
port 2. The matrix constants are corroborated in
`research/reference-disassembly/snapshot/Mercenary notzed/mercenary_v260411.tas`.

| Semantic Action     | Reference physical input | Code/site                                | Endgame role                                  |
| ------------------- | ------------------------ | ---------------------------------------- | --------------------------------------------- |
| take                | T                        | `$16`, interaction `$97FA`               | acquire Mission and Escape objects            |
| board               | B                        | `$1C`, interaction `$984F`               | occupy craft slots 0-7                        |
| drop                | D                        | `$12`, dispatch `$B33F`, routine `$98FE` | deliver an Objective object                   |
| leave craft         | L                        | `$2A`, dispatch `$B349`                  | return to on-foot Occupancy                   |
| ride lift           | E                        | `$0E`, dispatch `$B3F6`                  | surface/room and recovered-craft transition   |
| answer yes / launch | Y                        | `$19`, Benson `tstk`                     | accept purchase/hire and confirm launch       |
| fire                | joystick port-2 fire     | active-low `$81`, routine `$886A`        | projectile, destruction, hostile-craft combat |

The browser Control Profile projects B, T, L, E, Y, D and F in
`web/src/shell/input.ts`. D is the decoded drop binding. Joystick fire is the
decoded C64 binding, and F is the Control Profile's choice for it — a Control
Profile decision, not Benson state and not a raw key to leak into Game
Semantics. F therefore does not also mark input as detected, which would let
firing answer a question a script had asked. Space keeps throttle shutoff and
message skip and acquires no third meaning.

### Drop

`$98FE-$994D` is one atomic LIFO inventory mutation:

- empty inventory is a no-op;
- the last inventory entry is selected and the count is decremented;
- carried bit `$80` is cleared in the mutable object flags;
- Object Residence becomes the current room/surface and current X/Z; Y low is
  zeroed while the current middle/high altitude bytes are retained;
- visible objects are refreshed and a sound request is made.

Ordinarily the action is rejected while `FLYING_FLAG == $00`, which means the
player is airborne. It is allowed while grounded (`$3F`). Carrying object slot
56, the Pyramid, is the sole exemption and allows an airborne drop. This native
mutation is why Gameplay Session must own mutable object flags: projecting the
immutable payload flags back over the Benson Host Callout would erase claimed,
fixed, description, and carried changes before a script could observe them.

Related take overrides are at `$980B-$9823`: carrying slot 47, the Sink, jumps
past both the fixed and heavy tests, while carrying slot 27, the Antigrav,
bypasses only the heavy test. They do not bypass the ten-object inventory limit.
Evidence for all three rules is the
own-RAM instruction shape guarded by `c64lab/interaction.py` and
`c64lab/endgame.py`; the frozen locator sites are `$29EF`, `$29DB`, and `$29F8`.

## Endgame-relevant Object identities

Object id, Benson script id, inventory id, and Geometry Identity slot are the
same zero-based slot unless a row explicitly says it is a runtime effect.

| Slot | Identity or runtime role         | Proven participation                                                                                |
| ---: | -------------------------------- | --------------------------------------------------------------------------------------------------- |
|    0 | Palyar commander's related craft | player shot starts script 27 at `$8795`; its destruction sets flag `$20` and starts a Palyar attack |
|    1 | Dominion Dart                    | optional 5,000-credit opening purchase; unpaid boarding sets flag `$20` and starts an attack        |
|    7 | Interstellar Ship                | sole Escape craft; initially in room 5; may instead be delivered to surface cell 8:8                |
|    8 | player projectile                | one active shot, 16-frame lifetime                                                                  |
|   12 | captured Mechanoid               | Palyar delivery Objective; its presence in Mechanoid control blocks Mechanoid deliveries            |
|   14 | hostile projectile               | spawned by hostile craft; 32-frame lifecycle                                                        |
|   15 | hostile attacking craft          | the player's projectile target before slot 0                                                        |
|   24 | Anti Time Bomb                   | when carried, a struck site's destroyed bit is restored instead of committed                        |
|   25 | Novadrive                        | alternative authorization for a recovered Interstellar Ship                                         |
|   27 | Antigrav                         | bypasses the heavy-object take restriction                                                          |
|   28 | Poweramp                         | doubles the Dart throttle contribution and raises its ceiling to `$5A` while carried                |
|   29 | Neutron Fuel                     | mutually exclusive Palyar/Mechanoid delivery Objective                                              |
|   30 | Antenna                          | activates the rental terminal in room 16 when carried or left there                                 |
|   31 | Energy Crystal                   | mutually exclusive delivery Objective                                                               |
|   34 | Large Box                        | mutually exclusive delivery Objective                                                               |
|   35 | Useful Armament                  | mutually exclusive delivery Objective                                                               |
|   38 | Gold                             | Palyar delivery Objective                                                                           |
|   41 | Medical Supplies                 | Palyar delivery Objective                                                                           |
|   42 | Essential 12939 Supply           | Palyar delivery Objective                                                                           |
|   43 | Winchester                       | mutually exclusive delivery Objective                                                               |
|   44 | Catering Provisions              | Palyar delivery Objective                                                                           |
|   45 | Databank                         | Palyar delivery Objective                                                                           |
|   46 | Pass                             | conditional Palyar faction-threshold reward, initially in room 80                                   |
|   47 | Sink                             | bypasses both fixed and heavy take restrictions                                                     |
|   56 | Pyramid                          | permits drop while airborne                                                                         |
|   63 | Colony Craft                     | high-altitude object at X/Z `$087000`, Y `$40FCC0`; not an Ending craft                             |

The player-facing names are decoded through the project's own text and script
decoders; the object residences and coordinates come from the guarded object
tables in the same verified capture. Slot 7's initial residence is the byte at
`$2947`; slot 63 is `object-instance:3f` in the geometry vocabulary.

### Palyar commander's surface craft flyby

Slot 0 is not a static surface placement. On every outdoor main-loop frame,
`$85C5-$85D4` increments its Z middle byte at `$2500`, carries into the high
byte at `$25C0`, and masks that high byte with `$0F`. This is a constant
`$0100` world-unit step per 20 Hz reference frame, wrapping at `$100000`.
The update precedes outdoor object drawing and is skipped by the underground
branch. `c64lab/endgame.py` guards the full instruction shape and exports this
as `surfaceFlyby`; the Gameplay Session consumes those decoded values rather
than assigning the craft an authored speed.

## Complete economy and transaction census

Credits are packed decimal register 8. A conditioned game starts with 9,000;
script arithmetic is modulo 100,000,000 and subtraction uses ten's-complement
addition. There is no general shop, sale price table, craft resale, loan,
interest, or bank transfer. Scripts 8 and 29 share the bank entry at `$0B16` and
only display the balance.

| Family                      | Trigger and prerequisites                                                                                  |                                                          Debit/credit | Completion and repeatability                                                                                                                                     | Script evidence                                                                 |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Dart purchase               | opening prompt; Y within a five-second poll                                                                |                                                                -5,000 | opening-only; a non-Y input leaves balance unchanged and advances to stolen boarding; silence cycles prompts and eventually waits rather than accepting boarding | script 0, debit `$0A29`                                                         |
| Interstellar Ship hire      | room 16; Antenna slot 30 carried or in room; Y; balance at least 1,000,000                                 |                                                              -999,999 | script has no explicit already-hired guard, but the closed legal economy cannot fund a second hire                                                               | script 2 `$0E04`; boundary `$0E6F`; debit `$0E90`; delivery state `$0EBA-$0EBE` |
| delivery reward             | correct object carried or already in the trigger room, then legally dropped while the player remains there |                                                           table below | one-shot per object; completion ORs object flags with `$11`, making it claimed and fixed                                                                         | shared `$1010-$104B`                                                            |
| Palyar faction gratitude    | net faction-destruction lead reaches 105 and shared gratitude flag `$02` is clear                          | Pass moved to room 1, or +500,000 if slot 46 has already left room 80 | one global occurrence across the two factions                                                                                                                    | script 10 `$120B-$1248`                                                         |
| Mechanoid faction gratitude | opposite net lead reaches 105 and shared gratitude flag `$02` is clear                                     |                                                     no credits/object | one global occurrence                                                                                                                                            | script 26 `$11F8-$120A`                                                         |

The rental affordability test is intentionally asymmetric: `$0E6F` compares
only the millions byte, so 999,999 is refused and 1,000,000 is accepted; the
latter leaves one credit after the debit. A timed-out or rejected hire says to
call again and changes no progression state. An accepted hire writes
`shipInbound=$FF` and engine flag `$04`. Native `$8634-$868F` then moves slot 7
out of room 5 and flies it down to surface cell 8:8; it is decoded in full below.

### Ship delivery: the native descent `$8634-$868F`

The main loop calls the descent unconditionally, once per frame: `$855C` steps
Benson, `$855F` is `jsr $8634`, and only then does `$8562` branch on the
underground flag. So the ship keeps descending while the player is indoors, in
another Room, or watching a message.

`shipInbound` at `$BEFF` is three-valued rather than a Boolean:

| Value                           | Meaning                   | Native path                                                |
| ------------------------------- | ------------------------- | ---------------------------------------------------------- |
| `$00`                           | no delivery in progress   | `$8634` `lda`/`beq` returns at `$8663`                     |
| bit 7 set (script writes `$FF`) | accepted, not yet started | `$8639` `bmi` takes the one-shot initialisation at `$8664` |
| positive, nonzero (`$7F`)       | descending                | falls through to the step at `$863B`                       |

Initialisation (`$8664-$868F`) performs eleven stores through the object
component tables at the slot-7 offset — X `$2880/$2480/$2540`, Y
`$28C0/$24C0/$2580`, Z `$2900/$2500/$25C0`, room `$2940`, all owned by
`c64lab/geometry.py`:

- room `$2947` <- `$00`, so slot 7 leaves Room 5 for the surface;
- X <- `$089900` and Z <- `$088B00`, snapping it to surface cell 8:8 in one
  store rather than flying it across the map;
- Y <- `$7F0000`;
- `shipInbound` <- `$7F`.

The descent step (`$863B-$8663`) treats Y high `$2587` and Y mid `$24C7` as one
16-bit altitude `v`; Y low `$28C7` is written once at initialisation and never
touched again, so the altitude is always an exact multiple of `$100`. Each frame
it computes `v >> 7` with a seven-iteration `lsr`/`ror` pair, then subtracts with
the carry deliberately clear (`$864F` `clc`, `$8650` `sbc`), giving

    v <- v - (v >> 7) - 1

The `-1` is what guarantees progress once `v >> 7` reaches zero. From `$7F00`
the ship lands after **779 frames**; the first altitudes are `$7F00`, `$7E01`,
`$7D04`, `$7C09`, `$7B10`, `$7A19`. Landing is a 16-bit zero test: `$865B` ORs
the two result bytes and, when they are both zero, `$8660` stores that zero into
`shipInbound`, ending the delivery. Nothing else clears it.

### Prison script 11

Room 81's entry script is the shortest economy script in the graph. It calls the
one-tick wait helper (`cfr`, a self-branching `wfr 1`, `ret`), plays a single
message built from word 232, the literal `PRISON` and word 230, clears engine
flag `$40`, and returns. It moves no object, changes no balance, and sets no
progression flag; capture and release are handled elsewhere.

### Two shared script latches

Both are load-bearing for the economy scripts and neither is delivery-specific:

- Engine flag `$40` is the script-running latch the interpreter sets on entry.
  Every economy script clears it on each of its exit paths — the hire clears it
  at four separate returns — so it marks "a script is running", never progression.
- Engine flag `$01` is the answered-Y latch the Y-poll helper sets. The hire
  reads it with `tstf mask 1` immediately after calling the poll, and routes to
  the affordability test only when it is set; otherwise it says to call again.

### `tsti` tests absence, not presence

The interpreter's test opcodes uniformly answer with the _negative_ condition,
and `tsti` `$0C` is no exception: its handler at `$8B37` loads the object
register, calls the inventory search at `$941A`, and branches to the
answer-true target `$8B87` on `bne` -- that is, when the search did **not**
find the slot. The search leaves Z set only on a match (`cmp $BEB1,x` falling
through to `rts`), and leaves Z clear when it exhausts the list through `bmi`.
The same answer-true target is reached by `inrm` when the object is _not_ in
the room (`$8B20`/`$8B22`) and by `tstf` when the flag is _clear_ (`$8B33`),
which pins the polarity of all three against each other.

So `tsti` answers "the object is not carried". The delivery protocol depends on
it: `382` branches to the hand-in prompt when the answer is false, which is
exactly the carried case, and `383` then catches the already-in-the-room case.
Read the other way, no delivery could ever be completed by carrying its object,
and the Antenna could not activate the rental terminal by being carried into
Room 16.

### The semantic observation vocabulary

Lab and browser compare through one flat map of scalars, decoded on the lab
side by `c64lab/semantics.py` and answered on the browser side by
`GameplaySession.observations()`. Both carry `schemaVersion` 2. The
observation map itself is untracked, so the tracked contract is this id list:

| Id                   | Type    | Meaning                                                                 |
| -------------------- | ------- | ----------------------------------------------------------------------- |
| `room`               | integer | current Room, `0` on the surface                                        |
| `occupancy`          | integer | boarded craft slot, or `$80` on foot                                    |
| `credits`            | integer | packed decimal register 8                                               |
| `engineFlags`        | integer | the engine flag byte                                                    |
| `shipInbound`        | integer | the three-valued ship delivery byte                                     |
| `attackingShip`      | boolean | hostile craft state                                                     |
| `endingPhase`        | integer | the Ending phase byte: 0 active, 1 Escape accepted, 255 mature terminal |
| `scriptPc`           | integer | interpreter program counter, `-1` when no script runs                   |
| `scriptStack`        | string  | call stack, outermost first, comma separated                            |
| `messagePlaying`     | boolean | whether the message line is busy                                        |
| `messageText`        | string  | the revealed message text                                               |
| `carriedStack`       | string  | carried slots, earliest first, comma separated                          |
| `objectRoom.<slot>`  | integer | Room membership in the Host Callout's encoding                          |
| `objectFlags.<slot>` | integer | the object's mutable flag byte                                          |
| `destroyedCells`     | string  | destroyed cells, ascending, two hex digits each, comma separated        |
| `palyarDestroyed`    | integer | the Palyar site counter                                                 |
| `mechanoidDestroyed` | integer | the Mechanoid site counter                                              |
| `mover`              | integer | the mover installed over the craft's own, `-1` when none                |
| `effectLifecycle8`   | integer | frames left on the player's shot, `0` when idle                         |
| `effectLifecycle14`  | integer | frames left on the hostile shot, `0` when idle                          |
| `colonyCraftFlag`    | integer | the special transition flag: `$FF` on the Colony Craft, `0` otherwise   |
| `playerX`            | integer | the player's full X coordinate, three bytes little-endian               |
| `playerY`            | integer | the player's full altitude, three bytes little-endian                   |
| `playerZ`            | integer | the player's full Z coordinate, three bytes little-endian               |

Every payload slot contributes an `objectRoom` and an `objectFlags` entry, in
ascending slot order, so the same moment always serialises the same way.

Schema 2 added the six combat ids and the `maskedCells` observation type they
needed: the destroyed bits are a table of 256 per-cell flags rather than a
scalar, and comparing them one cell at a time would have made 256 observations
out of one fact. The restricted map gains these entries, which cannot be
tracked with the rest of the contract:

| Id                   | Bank | Address | Shape                                |
| -------------------- | ---- | ------- | ------------------------------------ |
| `destroyedCells`     | ram  | `$2B00` | `maskedCells`, count 256, mask `$80` |
| `palyarDestroyed`    | ram  | `$BEBB` | integer, width 1                     |
| `mechanoidDestroyed` | ram  | `$BEBC` | integer, width 1                     |
| `mover`              | ram  | `$00A9` | integer, width 1                     |
| `effectLifecycle8`   | ram  | `$BDAB` | integer, width 1                     |
| `effectLifecycle14`  | ram  | `$BDB1` | integer, width 1                     |
| `colonyCraftFlag`    | ram  | `$00FA` | integer, width 1                     |
| `playerX`            | ram  | `$0072` | integer, width 3, little-endian      |
| `playerY`            | ram  | `$0075` | integer, width 3, little-endian      |
| `playerZ`            | ram  | `$0078` | integer, width 3, little-endian      |

The two lifecycle addresses are the player-shot and hostile-shot entries of the
effect table based at `$BDA3`. The four M7.4 rows are the Colony Craft additions the
required-scenarios table asks for: `$FA` plus the full player coordinates. The
browser answers the coordinates truncated to integers, which is the spelling
the emulator's three-byte fields hold. Adding rows changes the map's data, not
its shape, so the schema stays at 2.

### Delivery Objective table

All sixteen entries use the same guarded hand-in protocol. The room is both the
room-entry script trigger and the required final Object Residence.

| Faction   | Script / entry | Room | Object slot | Object                 | Credits |
| --------- | -------------- | ---: | ----------: | ---------------------- | ------: |
| Palyar    | 3 / `$0F9E`    |  136 |          29 | Neutron Fuel           | 200,000 |
| Palyar    | 4 / `$0FB2`    |  155 |          42 | Essential 12939 Supply |  50,000 |
| Palyar    | 5 / `$0FC6`    |  162 |          38 | Gold                   | 100,000 |
| Palyar    | 6 / `$0FD9`    |  163 |          44 | Catering Provisions    |  60,000 |
| Palyar    | 9 / `$0FEC`    |  165 |          41 | Medical Supplies       |  40,000 |
| Palyar    | 14 / `$0EC3`   |  173 |          31 | Energy Crystal         | 100,000 |
| Palyar    | 15 / `$0ED7`   |  147 |          34 | Large Box              |  35,000 |
| Palyar    | 16 / `$0EEA`   |  146 |          35 | Useful Armament        |  65,000 |
| Palyar    | 17 / `$0EFD`   |  144 |          43 | Winchester             | 100,000 |
| Palyar    | 18 / `$0F10`   |  170 |          45 | Databank               | 100,000 |
| Palyar    | 19 / `$0F24`   |  154 |          12 | captured Mechanoid     | 250,000 |
| Mechanoid | 20 / `$0F38`   |   70 |          29 | Neutron Fuel           | 250,000 |
| Mechanoid | 22 / `$0F4D`   |   50 |          31 | Energy Crystal         | 100,000 |
| Mechanoid | 23 / `$0F62`   |   48 |          34 | Large Box              |  80,000 |
| Mechanoid | 24 / `$0F76`   |   34 |          35 | Useful Armament        | 120,000 |
| Mechanoid | 25 / `$0F8A`   |   18 |          43 | Winchester             | 250,000 |

Slots 29, 31, 34, 35, and 43 therefore have mutually exclusive buyers. The
first completed hand-in sets their claimed bit and makes the alternative script
return without payment.

A Mechanoid hand-in first checks where captured Mechanoid slot 12 is, and the
test runs the way round the messages describe: it proceeds only while slot 12
**is** in room 102, and otherwise answers "THE MECHANOIDS SAY / PUT BACK OUR
LEADER" and returns without payment (`$104C-$107E`). Slot 12 starts in room 102,
so all five Mechanoid rows are open from the beginning and close the moment the
leader is carried off. That is the trade the pair of rows describes: the Palyar
pay 250,000 for the leader delivered to room 154, and taking them there costs
every remaining Mechanoid sale until the leader is put back.

The maximum delivery income is 1,400,000: 600,000 from Palyar-only goods plus
the higher-paying choice for each shared good. Moving the Pass before the
Palyar threshold can add 500,000, for at most 1,909,000 including starting
credits. Thus the syntactically repeatable rental cannot be afforded twice in a
closed legal game, even when the Dart is not purchased.

## Missions and Objectives

The scripts do not create a separate accepted-Mission record. Their persistent
facts are Object Residence/flags, credits, engine flags, destroyed blocks,
attack state, and ship delivery state.

### Offers and faction briefings

- Buying the Dart reaches a Palyar job-offer presentation and directs the player
  to briefing room 41; declining the purchase does not disable any Objective.
  Stealing/boarding the unpaid Dart instead sets flag `$20` and starts a Palyar
  hostile-craft attack (script 1 `$0A3C-$0AE7`, attack helper `$11B7`).
- Palyar briefing script 28 at `$0CE2` describes the delivery rows, the captured
  Mechanoid fee, and destruction of Mechanoid-occupied sites. It tests room 41
  while presenting sections but has no accept/reject input and sets no Mission
  flag.
- Mechanoid briefing script 13 at `$0D9D` describes delivery of selected Palyar
  requirements and possible payment for selected installations. It tests room
  102 while presenting sections but likewise has no accept/reject state.
- The two factions are not globally exclusive. Delivery exclusivity is per
  shared object, and the faction-threshold gratitude flag `$02` is shared.

No individual destruction reaction adds credits. The Mechanoid briefing's
conditional language about selected installations resolves to reaction and
faction-threshold behavior; it is not evidence for an omitted per-site payment
table.

Consequently a Mission is the durable relationship between one offer/briefing,
its decoded Objective predicates, and Benson-authored consequences; it is not a
new Boolean that the browser should invent.

### Engine trigger census

| Trigger                         | Native site        | Script selection                                               |
| ------------------------------- | ------------------ | -------------------------------------------------------------- |
| initial progression             | seeded on new game | script 0                                                       |
| object take/board description   | `$98B1-$98C0`      | object slot when description low bit selects script            |
| room entry                      | `$921E`            | decoded room header entry id                                   |
| structure destruction           | `$8813`            | faction threshold script 10/26, otherwise `32 + (flags & $1F)` |
| player projectile hits object 0 | `$8795`            | script 27                                                      |

The room-entry table relevant to transactions is exactly the sixteen rows above,
plus room 16 -> script 2, room 41 -> script 28, room 102 -> script 13, rooms 42,
79, and 159 -> bank scripts 8/29, and room 81 -> prison script 11. The full room
decode and its structural guards are documented in
`notes/decode/underground.md` and owned by `c64lab/geometry.py`.

## Combat, destruction, and hostile craft

Native combat runs only on the outdoor main-loop path: `$85E1` checks fire,
`$85E6` advances the destruction effect, `$85E9` advances projectiles, and
`$85EC` advances hostile craft.

### Player fire and hits

`$886A-$891E` accepts active-low joystick fire only when:

- the player is aboard a craft, not on foot;
- no structure impact effect is active;
- player projectile slot 8 is inactive.

It creates slot 8 at the player pose, derives its vector from orientation with
direction offset `$30`, gives it a 16-frame lifecycle, requests sound 8, and
updates visible objects. There is no ammunition count, weapon inventory gate,
target selection UI, health pool, or accumulated damage.

Reading `$886A-$891E` through for M7.3 shows how that vector is built, and what
remains unread about it. The routine copies the player's nine position bytes at
`$72-$7A` into the projectile's own position tables, so a shot begins exactly
where the player is. It then runs the same five instructions three times, once
per axis, over the component pairs at `$4C/$4D`, `$36/$37` and `$50/$51`: it
adds the direction offset to the second byte of the pair, calls `$84A7`, and
stores a three-byte signed result — low, high, and a sign extension of `$00` or
`$FF` — into `$BDAB`, `$BDB3` and `$BDBB` for the first axis, `$BDC3`, `$BDCB`
and `$BDD3` for the second, and `$BDDB`, `$BDE3` and `$BDEB` for the third.

`$84A7` is a variable right shift, and it is self-modifying: it takes the second
byte of the pair, shifts it right twice, requires the result below `$0F`, and
multiplies it by three to write the branch displacement at `$84C2`, which
selects how far into a chain of fifteen `LSR`/`ROR` pairs the shift begins.
`SEC` before the first `ROR` inserts an implicit leading one. The pairs are
therefore a mantissa and an exponent, four exponent units to a power of two, and
the direction offset `$30` adds twelve to the shift selector rather than to any
angle — it scales the player's direction components rather than turning them.

That is enough to give the speed, once the number format is read. The mantissa
holds `1 + m/256`; the exponent counts four units to a power of two, keeps its
sign in bit 0, and is negated by one's complement. Both halves are confirmed
against data rather than argued: the multiply at `$82FA` is logarithmic, and its
tables at `$5800` and `$5900` are `round(256 * log2(1 + i/256))` and
`round(256 * (2^(j/256) - 1))` to within one unit across all 256 entries, while
the angle tables at `$5A00` and `$5B00` decode under this format to a sine
accurate to 0.0035 — one step of an eight-bit mantissa — saturating to exactly
one at the quarter turn.

Converting shifts a normalised sixteen-bit value right by the distance left in a
chain of fifteen identical shift pairs, so an exponent offset multiplies the
result by two per octave it is worth. The offset `$30` is twelve octaves, and a
direction component of magnitude one therefore converts to `4096`. Position and
velocity are both 24-bit and the browser's world units are the same units — the
payload's object positions are bit-identical to the engine's own position tables
— so a shot travels **4096 world units per frame per axis** at full magnitude,
needing no conversion at all.

Two things corroborate that number. A shot's whole reach is `16 * 4096 = 65536`,
exactly one high-byte unit, and the high bytes are what the destruction path
forms its cell index from — a shot reaches precisely one cell. And Poweramp,
which the browser already implements and holds to a Golden Trace, adds four to
the throttle exponent at `$9F95`: one octave under this format, which is the
`throttleScale` of two already exported.

The player's own integrator at `$9FCF` converts without an offset, using the
speed's own exponent, which is why a shot's speed is absolute rather than
relative to the craft carrying it.

The three fire scenarios remain worth running, but as corroboration of a decoded
number rather than as the thing that supplies it.

`$8690-$879A` advances effect slots 8-15, and does so by plain 24-bit addition:
each axis adds the velocity triple to the position triple, low byte first. There
is no separate descent step and no per-frame reshaping of the vector, so a shot
travels in a straight line at constant velocity. The one exception is vertical:
`$86D8` clamps all three bytes of the second axis to `$FF` when its high byte
goes negative. A slot whose lifecycle reaches zero is removed by putting its
object out of the world and refreshing; a lifecycle of `$7F` is a sentinel the
advance skips.

A player shot can do exactly three material things:

1. enter the central city window and descend to a structure, setting destroyed
   bit `$80` on its cell and starting a 16-frame impact;
2. collide within the engine's four-unit cube with hostile craft slot 15,
   removing the attacker and requesting the enemy-destroyed message;
3. collide with object slot 0, starting script 27.

The structure window uses middle bytes in `[$70,$90)` on both horizontal axes;
the cell is formed from the low nibbles of the high X/Z bytes. Shots outside the
window, below the world, or beyond their lifecycle are removed without a world
mutation.

Reading `$871B-$87A8` for M7.3 settles the parts of that the census left open.
The depth axis supplies the **high** nibble of the cell and the across axis the
low one, by the same four shifts and mask the player's own cell is formed with
at `$951D`. A shot must also be low enough: `$871D` requires either a negative
altitude high byte, or a zero one with a middle byte below `$08`, so a shot
passing over the city at height strikes nothing. Both cell axes are bounded to
the city by requiring the upper nibble of each high byte to be clear. A hit sets
the destroyed bit, starts the 16-frame impact, requests sound 4, and spends the
shot.

And then `$87A4` compares the struck cell against `$B7`, the cell the player is
themselves over, and returns when they differ. A Site bombed from over its
neighbour is destroyed and reported to nobody: no counter moves, no reaction
dispatches, and because the comparison precedes the restoration test at `$87AF`,
carrying the Anti Time Bomb does not save it either. The Site's reaction is left
unspent, so being over it next time still works.

On the Reference Build that branch is not somewhere a player can get to. Its
structures are drawn only for the cell the player occupies, so the building in
the next cell cannot be seen and therefore cannot be aimed at; the comparison
reads less like a rule about bombing and more like the engine declining to act
on a cell it is not currently thinking about. It is implemented because it is
what the engine does, not because play depends on it.

It _is_ reachable in this implementation, and that is a divergence in
visibility rather than in destruction. `visible()` selects a three-by-three
block of cells around the player, so a neighbour's structures are both drawn and
targetable. The frozen Trace Oracle selected the same neighbourhood and a
projection Golden Trace grades the traversal, so narrowing it to the Reference
Build's single cell is a change to accepted behaviour and belongs with the
rest of the visibility work rather than here.

The two object families share the collision helper at `$8833`. It requires the
target on the surface, tests a cube at `$999A`, and on a hit requests sound
`$10`, clears `attackingShip` whichever object was struck, puts the target out
of the world, and spends the shot. The cube's size is compared at `$99D5`
against the two bytes above the least significant one, so the `4` it is given
counts in units of `$100` — a reach of 1024 world units, the same span the
payload already carries as an object's own detail cube.

### Site state, reactions, and faction Objectives

The 256-byte city table is at `$2B00-$2BFF`. Its initial closed-world partition
is 115 Mechanoid-occupied cells (bit `$40`), 114 Palyar cells (bit clear), and 27
neutral cells (bit `$20`). Neutral cells do not affect faction counts or start a
reaction. A committed destroyed transition changes the appropriate faction
counter; the signed difference reaching magnitude 105 dispatches script 10 or
26 instead of the individual site reaction.

Most faction sites use one of two generic reaction ids:

- low id 2 -> script 34 at `$0CD4`, 100 cells, probabilistic Palyar attack;
- low id 3 -> script 35 at `$0CDB`, 106 cells, probabilistic Mechanoid attack.

Every exceptional reaction identity is below. This is a semantic census rather
than a copy of the original 256-byte table.

| Cell(s)               | Low id / script | Decoded identity or reaction | Consequence                    |
| --------------------- | --------------- | ---------------------------- | ------------------------------ |
| `$83`                 | 4 / 36 `$0B28`  | Novabill                     | acknowledgement, no attack     |
| `$32`                 | 5 / 37 `$0B41`  | author's advert              | sets flag `$08`; Palyar attack |
| `$3C`                 | 6 / 38 `$0B70`  | Sabins Cube                  | Mechanoid attack               |
| `$06`                 | 7 / 39 `$0B85`  | Walton Monument              | Palyar attack                  |
| `$36`                 | 8 / 40 `$0BB4`  | St Stallards                 | Palyar attack                  |
| `$1A`                 | 9 / 41 `$0BCB`  | Moorby Arch                  | Mechanoid attack               |
| `$07`                 | 10 / 42 `$0BE1` | Tyler Point                  | Mechanoid attack               |
| `$78`                 | 11 / 43 `$0BF6` | Bosher Stadium               | Palyar attack                  |
| `$DC`                 | 12 / 44 `$0C0E` | Jordan Airport               | Palyar attack                  |
| `$42`                 | 13 / 45 `$0C1F` | Vector Henge                 | Mechanoid attack               |
| `$97`                 | 14 / 46 `$0C35` | commander's related house    | sets flag `$20`; Palyar attack |
| `$41`                 | 15 / 47 `$0C46` | Mechanoid Fort               | Mechanoid attack               |
| `$2F`                 | 16 / 48 `$0C56` | Coach and Horses             | Palyar attack                  |
| `$4D,$D3,$D9,$F4,$F9` | 17 / 49 `$0C97` | traitor reaction             | no attack                      |
| `$5E,$8E,$BC,$F6,$FB` | 18 / 50 `$0CAB` | approval reaction            | no attack                      |

The 27 neutral cells all have low id 0 and do not dispatch script 32. No cell has
low id 1. Already-destroyed cells do not double-count. Carrying Anti Time Bomb
slot 24 takes the restoration path at `$8816`: the destroyed bit is cleared and
the normal count/reaction dispatch is skipped. `destroyedBlocks` must therefore
be mutable and saveable, not recomputed from immutable geometry.

The commit path `$87A0-$8832` was read instruction by instruction for M7.3, and
adds five facts this census did not previously record.

`$87C1-$87C9` reloads the pre-impact byte held in `$FB` and exclusive-ors it with
the table's current byte, returning when the destroyed bit did not change. That
is the mechanism behind "do not double-count": a shot at an already-destroyed
cell still shows its impact but reaches neither counter nor reaction.

`$87D2` shifts the table byte left and branches on the resulting sign, so the
faction test reads the bit immediately below the destroyed bit. Each faction arm
carries both an increment and a decrement, selected by the carry the shift left
behind — the prior destroyed bit. On the commit path that bit is always set by
the time the arm runs, so the decrement arms describe the inverse transition and
are not reached by ordinary destruction. Palyar's counter is `$BEBB`; the
Mechanoid counter is `$BEBC`.

`$87EE-$87FF` computes `$BEBC - $BEBB` — Mechanoid destroyed minus Palyar
destroyed — and keeps script 10 when that difference is non-negative, otherwise
complements it and takes script 26. The complement makes the two thresholds
asymmetric: the Palyar side dispatches once the difference reaches `105`, the
Mechanoid side once it reaches `-106`.

Both have since been reached by flying the route rather than by setting the
counters, which also settles that the route exists. A craft can only strike a
Site from below a decoded altitude, and a craft that never raises its nose never
leaves the ground, so the whole city is bombed from a taxiing craft at full
throttle. Reaching the Palyar side took 105 destructions and the Mechanoid side
107, one apart as the complement predicts.

Script 10's reward is the Pass rather than the cash while slot 46 is still in
room 80: it moves to room 1, credits do not change, and the shared flag is left
set. Both scripts test that flag one instruction past their entry and both reach
the same body behind it, so the thanks is a single event however far past either
threshold a lead goes.

`$880A-$8811` masks the dispatched cell's low id away and writes the byte back,
so a reaction fires at most once per cell for the life of a session. A cell that
is destroyed, restored by the Anti Time Bomb, and destroyed again dispatches
nothing the second time. The threshold branch at `$87FE` jumps past this wipe,
so reaching a Gratitude Threshold leaves the struck cell's own reaction intact.

`$8816` saves the pre-impact byte's sign before clearing the destroyed bit, and
resumes at `$87B9` only when the cell was intact. Restoration therefore never
touches a counter in either direction, including when it restores a cell that a
previous shot had genuinely destroyed.

### Hostile craft

Benson scripts set `attackingShip=1`; native `$8921-$89AF` supplies the encounter.
It runs only on the surface, moves attacker slot 15 toward the player, and when
within a 48-unit cube creates hostile projectile slot 14 if that slot is free.
The hostile projectile has a 32-frame lifecycle.

Reading it through for M7.3 fills in how it closes. Aim comes from `$89AF`: it
signed-shifts each axis of the distance between the object and the player right
by a given count and then complements it, so the result points back along the
gap. The attacker uses a shift of five, its projectile a shift of four, and both
are stored as ordinary effect velocities by `$8A12` — the same three tables a
player shot uses. A new projectile also has the attacker's own nine position
bytes copied into it by `$89DB`, so it leaves from where the attacker is.

An attacker closes in bursts. `$8998` aims it, marks it on the surface — which
is what brings it into the world at all, since it waits out of the world until
it is sent for — and gives it a lifecycle of `$AD`. `$892B` then returns every
frame while that lifecycle is negative, so the attacker flies blind until the
effect advance has counted it down to the `$7F` it parks slots at: 46 frames.
The shift of five over 46 frames carries it well past the player, so an attacker
swoops rather than homing, and re-aims on the far side.

The 48-unit cube and the four-unit hit cube are both compared by `$999A` above
the low byte, so they reach 12288 and 1024 world units. A hit requests sound
`$0C`, and takes the player's craft only when they have one: `$8973` tests the
mover for the walking one and skips the ship-destroyed message when it is set.
Either way the encounter is cleared, both hostile slots are put out of the
world, and mover 9 is installed by copying block 9's bytes over the live block —
which is all `$9D99` does, and what the browser's own installed-mover field
stands for.

Mover 9 itself is `$9EBE`: it subtracts its drop from the altitude's middle
byte, advances three angles by their own steps, and reads no input at all.
Reaching the ground jumps to `$A0AF`, inside the ordinary crash path, so a
tumble ends in the same recoverable place an ordinary crash does.

A collision within the four-unit cube is one hit. If the player is aboard, the
engine requests the ship-destroyed message, clears `attackingShip`, installs
crash/autoland mover 9, removes hostile slots 14 and 15, refreshes objects, and
returns. If the player is on foot, there is no ship message, but the encounter is
still cleared. The player projectile removes slot 15 in one hit and likewise
clears the attack.

This is a recoverable combat failure, not a Defeat Ending. The ordinary crash
path at `$A09A-$A0E1` also ejects the player and returns to play. Neither path
writes `gameComplete` or leaves the main loop.

That path was read again for M7.3, and it does not request a message. It zeroes
the altitude bytes, puts the craft back on the ground, copies the grounded
block's parameters over the live ones, ejects the player through `$98C8` — which
is what installs the walking mover — and sets `$F9` to two. `$F9` is a countdown
the frame loop decrements at `$AFCA`, and reaching zero calls `$B242`: a sound
of `$18` and a raster-timed screen effect, not text. The four message requests
in the whole build are at `$8789`, `$8977`, `$9430` and `$9848`, and none of
them is the crash. Whatever shows `YOU CRASHED` is not this routine, so an
implementation that made it print one would be inventing the behaviour.

### Other object-conditioned combat state

Poweramp slot 28 is read at `$9F8A` and `$A050`. While carried in the Dart only,
it raises the throttle exponent by four (doubling the contribution) and replaces
the Dart's normal ceiling with `$5A`; it is not a generic damage amplifier.

Both sites were read again for M7.3 and name the same object's flags, which is
now asserted rather than assumed. Neither is in the combat path: the first is
the throttle and the second the ceiling comparison, so nothing about firing or
being fired at consults slot 28 at all.

The flag is read every frame at both sites rather than latched when the object is
picked up, so the rates follow what the player is carrying now. Putting the
Poweramp down mid-flight takes them back.

What it is for is legible from the ceilings either side of it. The blocks carry
`[90, 10, 1, 90, 1, 1, 90, 1, ...]`, so only three craft can climb, and the Dart
— the one the opening sells — is not among them. Carrying the Poweramp gives the
Dart the same ceiling those three have, which is why the Colony Craft's
ceiling-eligible craft are slots 0, 3 and 6 _plus_ the Dart with this aboard. The
Sink, Antigrav, Pyramid, and Anti Time Bomb overrides described above depend on
their mutable carried flags and must survive Save/restore.

## Escape routes and terminal dispatch

### The single terminal predicate

Benson script 7 enters at `$107F`. A successful dispatch requires all of:

1. aboard craft slot 7;
2. current room 0, the surface;
3. **either** hired flag `$04` **or** Novadrive slot 25 carried;
4. Y at the launch prompt;
5. the same occupancy, surface, and authorization still true on the recheck;
6. city cell `$32` **not destroyed**.

The two authorization terms are alternatives, not cumulative prerequisites.
At `$10A0-$10A4` and `$10DF-$10E3`, a set hire flag bypasses the inventory test;
without it, the Novadrive is required. `$10E6` selects map cell 50 and `$10E9`
branches to success when the Host Callout says that cell is intact. If the
author's advert has been destroyed, `$10EC-$1122` presents a refusal and returns
to active play. Anti Time Bomb restoration can make it intact again, but an
untouched advert already satisfies the predicate.

The success branch at `$1123` writes `gameComplete=1`. No other script reaches
that instruction.

### Route A: hired Interstellar Ship

The player activates the room-16 rental terminal with Antenna slot 30, reaches
at least 1,000,000 credits, accepts the 999,999-credit hire, and waits for native
delivery of slot 7 to surface cell 8:8. Hired flag `$04` authorizes launch; the
Novadrive is not required.

The economy graph admits many ways to reach the balance, but they are acquisition
variants of one route family, not different Endings. All-Palyar deliveries alone
can fund it; a Mechanoid-oriented game needs additional Palyar-only income or the
conditional 500,000 faction reward because the five Mechanoid hand-ins total
800,000.

### Route B: recovered Interstellar Ship

Slot 7 initially resides in room 5. The player may reach it, carry Novadrive slot
25, board it, and use E in indoor hangar rooms 1-8. The indoor lift arm at
`$B455-$B476` tests room and lift state but does **not** test Occupancy. The
surface transition at `$A28E-$A2BA` clears the underground/current-room state and
sets the hangar surface pose without overwriting boarded craft `$A9`, so craft-7
Occupancy survives and script 7 can launch. No hire or million-credit balance is
required.

This corrects the ground-only assumption in `notes/decode/underground.md`:
confirmed Reference Build play permits occupied craft through a lift in both
directions. The unique room-171 Doorway to the Colony Craft is different: it
explicitly installs mover/occupancy 9 at `$90C9`, so it cannot carry recovered
craft 7 out.

Read again for M7.4, the indoor arm holds one more fact. `$B455-$B462` loads
X with zero, compares the room id against an immediate `$08` — rooms above 8
are rejected, rooms below leave X at zero, and room 8 exactly decrements X to
`$FF` — and stores X into `$FA` at `$B460`. So every indoor lift ride writes
the special transition flag: rooms 1-7 clear it, and room 8 sets it. The
surfacing destination tables at `$B4B6`/`$B4BE` are five entries long, but the
arm's bound is 8, and site 8's out-of-table reads land on `$B4BE` and `$B4C6`,
which both hold `$08`: room 8's lift surfaces at cell 8:8, the Colony Craft's
own cell, with `$FA` set. The outside-to-inside ride retains an occupied craft
while clearing `$FA`. Room 8 is reachable — rooms 145, 148 and 149 each
carry a Doorway into it — so the underground connects to the Colony Craft by
lift as well as by the room-171 Doorway. Sites 6 and 7 still read `$51:$23`
and `$88:$88`, off the sixteen-cell grid. The outside-to-inside lift ride
clears `$FA`, at `$A2F7`.

The browser models the arm as the arm is written, keyed on the room that rode
up rather than on a value the caller chose, so the room-8 case is right whether
or not a room-8 entrance is reified in the payload today.

One quirk of the occupancy-preserving arm is recorded but not yet modelled:
`MOVE`'s on-foot path at `$A192` skips the turn keys whenever `$A9` is
positive, so a boarded craft underground can walk forward and back but cannot
turn. The indoor lift needs no walking — E works from anywhere in the room —
so neither recovery route depends on it.

### Reachable and unreachable terminal branches

| Branch                                                                          | Classification                                            | Reason                                                                                           |
| ------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| hired craft 7, surface, Y, cell `$32` intact                                    | reachable Escape candidate                                | script and native delivery form a closed legal path                                              |
| recovered craft 7 + Novadrive, lift to surface, Y, cell `$32` intact            | reachable Escape candidate                                | script OR predicate plus occupancy-preserving lift form a closed legal path                      |
| both hire flag and Novadrive                                                    | reachable but not distinct                                | converges before `$10E6`; same Ending identity                                                   |
| optional flag `$20` epilogue                                                    | reachable presentation variant                            | set by stealing the Dart, destroying object 0, or destroying cell `$97`; does not change outcome |
| cell `$32` destroyed                                                            | reachable refusal, not an Ending                          | script returns at `$1122`                                                                        |
| not aboard slot 7, underground, no authorization, no Y, or leave before recheck | reachable refusal/wait                                    | no terminal write                                                                                |
| other craft reaches orbital box                                                 | reachable world transition for eligible craft, not Escape | `$A13D` has no Benson/game-complete edge                                                         |
| hostile craft destroys player's ship                                            | reachable recoverable failure, not Defeat                 | returns to main loop                                                                             |
| ordinary crash                                                                  | reachable recoverable failure, not Defeat                 | returns to main loop                                                                             |
| any other Escape or terminal Defeat                                             | structurally unreachable                                  | no script/native terminal dispatcher exists                                                      |

Structural reachability of the two Escape candidates still needs the legal-play
traces below. Until those pass, the word “reachable” means the decoded state graph
has a legal producer for every predicate, not that M7 acceptance has been observed.

## Colony Craft and `$A13D`

`$A13D-$A164` is a pure box predicate. It succeeds with carry clear only when:

- high X and Z bytes are both `$08`;
- middle X and Z bytes are each in `[$68,$78)`;
- the middle altitude byte is at least `$FC`.

The three guarded callers are `$A01F`, `$A0E6`, and `$A1DA`. M7.4 re-read all
three from the configured image, and each is now byte-precise:

- **Entry, from flight.** The flying altitude path branches on the altitude
  high byte. Zero with a low byte under `$40` is the ordinary landing; `$40`
  runs the box predicate at `$A0E6`. Inside the box, `$A0EB-$A0F1` stores
  `$FF` into both the altitude middle byte `$76` and the flag `$FA`, forces a
  landed verdict with `CLC`/`PHP`, and joins the grounding tail at `$A0B6` —
  which is the ordinary touchdown grounding except that it is entered past the
  middle/high-byte writes, so the altitude keeps `$40` high and `$FF` middle
  and only the low byte is set to `$3F`. The craft comes to rest on the deck
  at exactly `$40FF3F`. Every other flying frame through this path — higher,
  lower, or outside the box — takes `$A0F7`, which sets `$7F` flying, clears
  `$FA`, and re-copies the boarded block. `$FA` therefore cannot survive
  ordinary flight.
- **The deck pin.** The grounded pitch path at `$A01B` reads `$FA`; when it is
  set, the level pin at `$A02C` (`$2A/$2B := $0200`) applies only while the
  box predicate still holds. Pitch is pinned level on the deck whatever the
  speed, so a craft cannot climb off the Colony Craft; it can only taxi past
  the box edge, where the pin releases and an ordinary take-off works.
- **Exit, on foot.** Every on-foot frame with `$FA` set runs the predicate at
  `$A1DA`; stepping outside the box installs mover 9 (`$A1DF: LDA #$09, STA
$A9, JSR $9D99`) and clears the underground flag. `MOVE` at `$A174-$A178`
  dispatches any positive `$A9` through the live block's control vector, so
  occupancy 9 runs block 9 — the crash tumble, the same block hostile capture
  installs at `$8986` and the room-171 Doorway installs at `$90C9`. Walking
  off the deck edge is a fall to the surface.
- **What ends the fall.** The tumbling altitude subtraction at `$9EBE`
  underflows the high byte at ground level; that path clears `$FA` at `$9ED0`
  and enters the grounding tail with the carry set, the ordinary crash
  resolution. `$FA` is gone by the time the walker stands up, which is what
  keeps the walking caller from reinstalling mover 9 on the ground.

This is the native behavior paired with Colony Craft slot 63 at X/Z `$087000`,
Y `$40FCC0` and with the room-171 Doorway arrival documented in
`notes/decode/underground.md`.

The standard-handler craft with structural ceiling eligibility are slots 0, 3,
and 6, plus the Dart only while Poweramp is carried. Slot 7 uses the special
`$AA62` handler instead. M7.4 closes the acquisition question from the decoded
placements and lift bound alone, without new captures:

- **Slot 0** rests on the surface and is boarded by walking to it: legally
  acquirable.
- **The Dart (slot 1)** is purchased in the opening and the Poweramp is a
  carryable object: legally acquirable.
- **Slot 3** rests in room 7. The indoor arm accepts room 7, but site 7's
  surfacing destination reads `$88:$88`, off the sixteen-cell grid, so the
  decoded evidence shows no legal path that leaves it at a playable surface
  cell: **legally unreachable for the box on current evidence**.
- **Slot 6** rests in room 54, above the indoor arm's room bound of 8, and no
  decoded mechanism carries an occupied craft out of room 54: **legally
  unreachable for the box on current evidence**.

None of the predicate, its callers, or the Colony Craft Doorway
writes `gameComplete` or starts script 7. Escape does not load Damocles; ADRs
0020 and 0021 make the same title-continuity boundary explicit.

## Ending phases and post-Ending behavior

The Reference Build has three presentation-relevant values, not a Boolean:

| Value | Meaning                                            | Evidence                                                           |
| ----: | -------------------------------------------------- | ------------------------------------------------------------------ |
|     0 | active play                                        | `$AA69` pins slot-7 pitch and returns                              |
|     1 | Escape script accepted; terminal animation running | script 7 `$1123`; `$AA73` initializes the renderer                 |
|   255 | mature terminal animation phase                    | `$AC44-$AC49`; `$AB97` changes point motion for the negative value |

M7.4 re-read `$AA62` for the exact shape of the phase-0 arm. While the lift is
riding (`$CA` nonzero) the handler defers to the lift altitude routine at
`$A24A`. Otherwise, at `gameComplete` 0, `$AA6E-$AA72` writes `$01` into the
pitch high byte `$2B` and returns: the Interstellar Ship sits pinned a quarter
turn nose-up — pitch `$0100`, straight at the sky — and no yaw, throttle,
translation, or altitude step runs at all. Slot 7 cannot be flown. The frozen
Trace Oracle recorded `craft-7-slot7` flying block 7 through the standard
loop — 47 frames of pitch input integrated, a climb to altitude 8330, a
touchdown — which is behavior the Reference Build does not have, so that
scenario is retired in `trace-scenarios.json` rather than re-recorded:
Authoritative Evidence outranks the oracle where the two disagree.

After writing 1, script 7 waits two ticks, retimes the message interval from the
captured 125 to 150, presents the congratulations/Escape sequence, optionally
presents the flag-`$20` variation, presents a save-status/sequel message, waits
twice for 15 ticks, and enters a repeating terminal-label loop. Each repetition
waits 15 ticks and requests that SID voice 1 and voice 2 control be cleared. The
browser should preserve those as PresentationEvents but need not add audible
playback.

Craft slot 7's handler `$AA62` enters the non-returning visual loop at `$AA95`
when `gameComplete` is nonzero. Its 21-point **Interstellar Ship Field** is
decoded in [escape-starfield.md](escape-starfield.md): the handler clears the
screen once on entry, then erases prior point pixels and redraws current ones on
each loop. Respawn is driven by failed depth/projection bounds rather than a
lifetime. The loop advances a repeated colour sequence, steps Benson, and calls
`READ_INPUT`; phase 255 is written on loop 114 and the final colour/phase write
continues every three loops. There is no transition to Damocles, no credits or
new-game screen, and no Defeat presentation.

Input is therefore sampled rather than globally frozen, but the exact effects of
leave, drop, Save/load, and Ctrl-Q during terminal presentation require live
observation. One timing quirk is structurally plausible: after the final script
recheck but before `$1123`, leaving craft 7 may allow the success script to run
while delaying entry into the occupancy-dispatched `$AA62` renderer. It must be
tested, not baked into the model from static conjecture.

M7.4 widened this. `BensonHostState.endingPhase` in `web/src/benson/host.ts`
and its Save representation in `web/src/session/save.ts` carry the byte, so 0,
1 and 255 read apart; the Host Callout symbol a script writes it through is
still the Data Payload's `gameComplete`, and re-spelling that name needs a
Benson payload re-export. M7 still needs explicit active/Escape/Defeat Session
State where required; it must not invent a reachable Defeat producer.

## Dependency graph

The minimal mechanics/programme dependency is:

```text
authoritative mutable Object Residence + object flags
  -> take/drop + decoded overrides
  -> delivery Objectives -> credits -> hire -> shipInbound delivery --+
  -> recover slot 7 + Novadrive -> occupancy-preserving lift ---------+-> craft 7 on surface

fire -> destroyedBlocks + site reactions -> faction Objectives/rewards
  -> hostile attack state -> recoverable combat outcomes
  -> cell $32 destroyed -------------------------------> launch refusal

craft 7 on surface
  + (hire flag OR carried Novadrive)
  + Y
  + cell $32 intact
  -> gameComplete 1 -> Escape messages + terminal renderer -> phase 255
```

This ordering justifies the M7 ticket sequence:

1. persistent flags and drop make delivery observable;
2. economy makes the hired route legal;
3. Mission/Objective triggers connect scripts to world state;
4. combat makes destruction, reactions, hostile failures, and faction Objectives
   real;
5. orbital/lift/craft behavior makes both Escape routes real;
6. explicit Ending state and terminal presentation expose the sole Escape and
   preserve the absence of Defeat.

`shipInbound`, `destroyedBlocks`, `attackingShip`, Poweramp and the four carried
overrides are all live dependencies, not optional polish. They and every mutable
object flag/residence must be included atomically in Save identity and restore.

## Required legal-play scenarios

Every scenario must begin at a fresh game or a deterministic checkpoint reached
by ordinary play. A monitor may capture semantic observations but must not mutate
acceptance state. Scenario definitions and observations may be tracked; RAM,
snapshots, screenshots, video, and exact captures remain ignored/restricted.

| Scenario             | Start and action                                                                                    | Required semantic before/after observations                                                                                                                |
| -------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| drop hand-in         | acquire one delivery object, enter its buyer room, Save/restore, press D                            | inventory, object flags/residence, credits, claimed/fixed repeat refusal                                                                                   |
| drop boundaries      | empty; airborne without/with Pyramid                                                                | no-op, rejection, and exemption without unrelated mutation                                                                                                 |
| economy boundary     | nearest legally reachable balances below and at/above 1,000,000; accept/timeout                     | exact debit, no-state-change rejection, shipInbound/flag `$04`; synthetic unit tests separately pin 999,999 refused and 1,000,000 accepted/one credit left |
| every delivery row   | legally obtain and deliver all sixteen rows across separate checkpoints where shared goods conflict | correct buyer, reward, persistence, alternative-buyer refusal                                                                                              |
| faction briefings    | enter rooms 41 and 102; leave during presentation                                                   | no invented acceptance flag; decoded presentation and resumption                                                                                           |
| site families        | generic ids 2/3 and each exceptional id 4-18                                                        | destroyed bit, reaction script, faction counter, attack state                                                                                              |
| restoration          | strike an intact site with Anti Time Bomb carried                                                   | impact presentation but no committed destroyed/count/reaction state                                                                                        |
| faction threshold    | reach both signed 105 thresholds in separate legal runs                                             | scripts 10/26, shared flag `$02`, Pass/cash alternative for script 10                                                                                      |
| hostile win/loss     | destroy attacker; allow hostile projectile to hit aboard/on foot                                    | one-hit outcome, cleared attack, removed effects, continued active play                                                                                    |
| hired Escape         | uninterrupted fresh game through deliveries, Antenna, hire, delivery, board, Y                      | every predicate, `gameComplete` 0->1->255, messages/timing/visual loop                                                                                     |
| recovered Escape     | uninterrupted fresh game through room 5, Novadrive, board, indoor lift, Y                           | craft-7 Occupancy preserved across lift; same Ending identity                                                                                              |
| launch refusals      | no authorization; destroyed cell `$32`; leave before recheck                                        | no terminal state and exact script resumption                                                                                                              |
| epilogue arms        | Escape once with flag `$20` clear and once set                                                      | one Ending, two presentation variants                                                                                                                      |
| Colony Craft         | enter and leave the `$A13D` box with each legally eligible craft                                    | real altitude/mover/`$FA` transition; no Ending                                                                                                            |
| terminal interaction | Save/restore in pre-launch, phase 1, and phase 255; exercise leave/drop/load/Ctrl-Q                 | atomic state, exact post-Ending behavior, no accidental return or invented lockout                                                                         |

For script-facing cases observe at least current room, Occupancy, inventory,
mutable object flags/residences, decimal balance, engine flags, script PC/stack,
message state, `attackingShip`, `shipInbound`, and `gameComplete`. Combat adds
destroyed cell state, active effect slots/lifecycles, mover, and faction counters;
orbital cases add `$FA` and full X/Y/Z. Compare the same semantic observation
shape in the Reference Build and browser.

## Terminal-interaction observation protocol

This expands the `terminal interaction` row above into a procedure, because it is
the one row nothing can be inferred for: the browser's Ending state, its terminal
presentation, and its Save are implemented, and what leave, Drop, Save/load, and
Ctrl-Q do during phases 1 and 255 is the only part of #134 still owed to live
observation. Until these captures exist, none of those behaviors is implemented
in the browser — an unobserved behavior stays unimplemented rather than guessed.

### Why this is not an `observe` scenario

`lab observe` drives the monitor's PETSCII buffer and joystick port 2, and the
scenario schema expresses nothing else. The Reference Build scans the keyboard
matrix, so a scenario cannot press the keys a route to the Ending needs, and no
tracked checkpoint reaches the Ending. Writing scenario JSON for this would be
fiction. The route is therefore captured with the foreground event-history tools
and replayed, and the monitor is used only for the semantic captures either side
of each probe.

### Reaching the Ending

1. `lab doctor`, then capture one uninterrupted legal route to the dispatch with
   `tools/capture-keyboard-history.swift`. The recovered route is the shorter of
   the two: room 5, carry the Novadrive, board craft 7, ride the indoor lift,
   answer `Y`. Stop the capture with the launch prompt answered and the epilogue
   beginning.
2. Verify with `lab catalogue verify-history`, which requires two independent
   cold replays. A route that does not replay twice is not a checkpoint, and
   nothing below may be captured from it.
3. Establish two replay stops: **phase 1**, immediately after the dispatch and
   before loop 96, and **phase 255**, at least 114 loops after it. Both are
   inside the non-returning terminal loop, so neither can be reached by waiting
   on a PC that the loop has already left — stop on instruction counts measured
   from the dispatch and confirm the phase byte through the observation map.

### The probes

Each probe is one cold replay to a stop, one semantic capture, the probe input,
and a second semantic capture. Nothing is captured from a replay that has already
been probed once: an input that changes state invalidates every later probe in
the same run.

| Probe  | At        | The question it answers                                                                                        |
| ------ | --------- | -------------------------------------------------------------------------------------------------------------- |
| leave  | 1 and 255 | Does the player leave craft 7? Does the loop continue, change, or end? Is Occupancy still the ship afterwards? |
| Drop   | 1 and 255 | Does the Carried Stack change? Does the dropped object take an Object Residence, and where?                    |
| Save   | 1 and 255 | Does the native save path run at all during the loop, and what does it write for the phase?                    |
| load   | 1 and 255 | Does a load during the loop restore into active play, into the loop, or refuse?                                |
| Ctrl-Q | 1 and 255 | Does the loop respond to the shell key at all, and what state is left behind?                                  |

Observe, either side of every probe: Occupancy, current room, inventory, mutable
object flags and residences, decimal balance, engine flags, script PC and stack,
message state, and the Ending Phase byte. The presentation questions — whether
the field keeps moving, whether the colour sequence keeps advancing — are read
from the phase byte and the colour state addresses in the continuation boundary
rather than from a screenshot.

### The recheck/write timing edge

One structurally plausible case cannot be reached by any of the stops above:
leaving craft 7 after script 7's final recheck passes but before it executes the
phase-1 write. The window is a handful of instructions wide. Reach it by binary
search on instruction counts between the recheck and the write, with the leave
input queued, and confirm from the phase byte and Occupancy which side of the
window the replay landed on. This is expected to take several attempts; each one
needs its own cold replay. If the window cannot be hit, say so in the ticket and
leave the case unimplemented — it must not be settled by inference from the
structure, which is what the static decode already declined to do.

### What the captures are for

Each answered probe becomes one test in `web/test/escape.test.ts`, and only then
the behavior behind it. If a capture needs an observation the browser does not
publish, `SEMANTIC_OBSERVATION_SCHEMA_VERSION` in `web/src/session/observations.ts`
and `c64lab/semantics.py` are bumped in the same change or the comparison breaks.

## Consequences for implementation documents

- Economy tables belong with Benson-owned progression, not duplicated in engine
  conditionals. Native delivery/destruction/orbital constants belong in the
  narrow runtime-owned payload document guarded by `c64lab/endgame.py`.
- Save schema v2 must include the new endgame payload identity independently of
  the Benson, flight, interaction, text, and underground schema versions and
  reject schema-v1/pre-M7 Saves atomically under ADR 0026.
- `web/src/session/index.ts` currently reconstructs `objectFlags` from immutable
  `baseFlags` during Host Callout projection. M7.1 must preserve script/native
  mutations rather than restoring the payload flags over them.
- `attackingShip`, `destroyedBlocks`, `objectFlags`, `objectRooms`, and
  `shipInbound` already exist in `web/src/benson/host.ts` and Save v1, but most
  native producers/consumers above do not yet exist. Existing fields are not
  evidence that the mechanics are implemented.
- Ending state must distinguish active play and Escape and may retain Defeat as a
  domain alternative, but this Reference Build supplies no reachable Defeat.
- Existing Browser Shell, System Menu, Benson Panel, Shell Console, and soundless
  presentation remain orthogonal. The decoded ending sound writes are requests,
  not authority to introduce audio playback.

## Remaining evidence limits

- Retail-media corroboration remains UNC-0008; this dossier is authoritative only
  for the configured provisional crack.
- The two Escape routes and all post-Ending input behaviors are structurally
  decoded. M7.4 (#133) proves both routes and every refusal by legal play in the
  browser. The Colony Craft box is proved for slot 0 and the Poweramp Dart from
  a _constructed_ checkpoint — the craft is placed climbing inside the box's own
  cell rather than flown there from the crash site — so the box's behavior is
  demonstrated while the approach to it is not. What is still missing is that
  approach, and the Reference Build side: no tracked
  uninterrupted emulator scenario reaches the Ending, and the post-Ending input
  behaviors still need live observation rather than modelling.
- The browser's recovered Escape is walked from the crash site in one run, but
  neither Escape is yet earned end to end. The hired route's balance and the
  recovered route's Novadrive are handed over at a deterministic checkpoint,
  because both sit behind the full delivery economy: the underground's seven
  locked classes chain into each other, the skeleton key in room 88 is _fixed_
  until the Sink is carried in from room 163 on the far side of the Palyar
  cluster, several Room Links are one-way, and room 114 draws its exit at
  random and must be re-entered until it points the wanted way. Earning
  1,000,000 credits legally therefore means an automated full-game route
  across two lift clusters, which belongs with the economy rather than with
  this predicate. Recorded here so the remaining distance is legible.
- Legal acquisition for the Colony Craft box is settled from the decoded
  placements and the indoor arm's room bound: slot 0 and the Poweramp Dart are
  acquirable, and slots 3 and 6 are legally unreachable on current evidence
  because room 7's lift site surfaces off the grid and room 54 is above the
  arm's bound. Neither is a proof that no other mechanism exists, so both stay
  recorded rather than closed.
- The Ending phase is named `endingPhase` in the engine, the Save and the
  semantic observation contract, but the Host Callout symbol a Benson Script
  writes it through is still the Data Payload's `gameComplete`. Re-spelling
  that name means editing the label table in
  `research/c64-reference-build/c64lab/benson.py`, re-exporting
  `payload/benson.json` (the symbol appears twice: script 7's `stor` and the
  `symbols.writes` list), rehashing `payload/manifest.json`, and bumping the
  Benson payload schema, since a renamed symbol is a breaking vocabulary
  change rather than added data. That needs the configured Reference Build
  image, which is not in this repository, so it is recorded rather than done.
- The terminal message scroll's exact visual granularity remains the open
  side-by-side question already recorded in `notes/decode/benson-scripts.md`.

These limits do not reopen the terminal census. A future live observation may
add a quirk or reject a structural route candidate, but an additional Escape or
Defeat requires a newly demonstrated dispatcher, not an interpretation of a
crash message or the successful script's terminal label.
