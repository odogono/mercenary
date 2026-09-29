# Damocles location triggers: the table at `[$7A68]`

Working-Authority Evidence for [#610](https://github.com/odogono/mercenary/issues/610), recovered
2026-09-29. On the ST the State President's messages appear on the Benson panel the first time you
enter the Eris STATE OFFICE, and the first work offer appears in a room on Floor 2. The port shows
neither, because it fires Damocles Script triggers from the pickup (`$0543E4`) and the landing
(`$059296`) only. This note recovers the third source: a table of locations that each Structure
Workspace carries. Authoritative Evidence remains bound to the C64 Reference Build. This note
records decoded ST facts only
([ADR 0002](../adr/0002-separate-rom-research-from-implementation.md)). RAM, traces and game text
stay ignored Restricted Material. Messages are named by their `payload/damocles/strings.json` ids,
and their text is described, not quoted.

## What was found

1. **The table belongs to the structure group, not the Body.** The workspace loader publishes it.
   `$04ED14` stores the group record's place list at `$7A6C` and steps over it. `$04ED26` then
   stores the byte after it at `$7A68`. So the table is the group record's last part, loaded from
   the program image whenever the group is. Decoding every group's record from the pinned
   first-world RAM gives the live `[$7A68]` of all 62 memstates. That includes the ones that looked
   empty. Those memstates are in a different group of the same Body: `dion-north-airborne` is in
   DION NORTH (`$1B`), not BIRMINGHAM ISLAND (`$02`), and `gaea-ur-city-4-2` is in UR CITY (`$07`),
   not CHALDEA METROPOLIS (`$0F`).
2. **An entry fires when the eye changes region.** The region test `$05A64A` runs in every on-foot
   substep and once after them (`$05957A`, `$059586`). When the eye passes the current region's own
   bounds, `$05A6E8` reselects the region (`$05A32C`) and then walks the table (`$05A6EC`). It does
   not run on every pass, and a Floor change alone does not run it. The lift arrival calls
   `$05A64A` with the eye inside the car, and the runtime ride fired nothing until the eye walked
   out.
3. **The four bytes are cell, region, Floor and trigger.** The cell is compared with `$7B5C`'s low
   byte. The region is compared with `$7AFD`, the low byte of the 1-based region index `$7AFC`. The
   Floor is compared with `$7AA5`, the low byte of the Floor `$7AA4`. A region byte of 0 matches any
   region whose flags have bit 14 clear: `$05A722` tests `btst #$e` on the byte `$7B34`, which is
   bit 6 of that byte. In every captured region table, the regions with bit 14 set are flagged
   `$C000` or `$D000`. In the State Office they are exactly its outdoor regions. `$05A6A0` also
   writes `$C000` when the eye is outside the central half of the cell. So region 0 means any
   indoor region, door strips included. A negative Floor byte matches any Floor, but no table uses one. **Floor byte 0 means
   Floor 0 only.** The first match launches through `$054770` and ends the walk.
4. **`$054C94` is the cell-entry half, and nothing uses it.** `$054B3E` runs in the main loop
   (`$0596D6`, `$0597CE`). When the position's cell words change, it writes the new cell to
   `$7B5C` and calls `$054BF8`, which shows the place name and then, if the high word of Y `$7AB6`
   is zero, walks the same table for entries whose region byte is `$FF`, matching the cell in `d3`.
   No group's table has such an entry.
5. **Both State Office entries fire at runtime, and trigger 4 queues behind trigger 3.** Trigger 3
   fires on the pass the eye first enters an indoor region of cell `$89` on Floor 0: out of the lift
   car, or through the front door from outside. Walking about outside never fires it. Trigger 4
   fires on the pass the eye enters region 7 on Floor 2, the east room behind door 6. If trigger 3
   is still presenting then, trigger 4 waits in `$7A88`, still armed. It launches three VBLs after
   trigger 3 clears busy.
6. **Seven Bodies have entries, 14 in all.** The scripts are the President's welcome (`$03`), the
   first offer (`$04`), a department-store gift (`$07`), a bank alarm (`$08`), two home arrivals and
   an answering machine (`$09`, `$0C`), a security warning (`$0A`), the state lottery (`$0D`), a
   moved post office (`$1C`), three demands that empty the balance (`$1D`, `$1E`, `$1F`), a prison
   sentence (`$3D`) and a double-or-quits casino bet (`$3F`). Seven of them need script operations
   the port lacks, mostly a balance and a key poll.
7. **The first offer's acceptance sets `$7BD8` bit 0.** `$0709AA` is `flags.set $0001`. It is the
   only writer of that bit among the ops reachable from all 64 script entries, and the only native
   writes to `$7BD8` touch bit 6. Four `if.flags $0001` tests read it. One is in the deflection
   ending `$3C`, before the President's congratulations, which the [landing note](damocles-landing-messages.md#unresolved)
   left unresolved. So bit 0 means the assignment was accepted. Of the 62 memstates, 54 have it
   set, and those are the 54 in which trigger 4 is spent.
8. **VULCAN ISLAND's place list is unterminated.** Group `$0E` (Gaea) names one place and never
   writes the zero byte after it. So the loader reads on into group `$0F`'s record and publishes its
   run-length stream as the location table: 24 entries of junk. None names cell `$88`, the one cell
   where group `$0E` places a structure. So the region walk, which runs only inside a structure,
   can never match one.

## Reproduce

| Item | Value |
| --- | --- |
| Pinned first-world RAM | `observe-first-world-20260818T101013Z-c5a32b7d/observed.ram`, SHA-256 `b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967` |
| Live snapshot | `snapshots/rehosted/eris-lift.sav`, SHA-256 `7ba0352ffc3b3b0d1195e9cbfaec09598d4edd49f3ae4dc1f9a516cacb3de5a9` |
| Probe | `research/damocles-st/scripts/location-trigger-probe.py` |

```sh
research/damocles-st/.venv/bin/python research/damocles-st/scripts/location-trigger-probe.py decode
research/damocles-st/.venv/bin/python research/damocles-st/scripts/location-trigger-probe.py live --roms roms
```

`decode` runs no emulator. It checks 35 instruction facts and the 19 other launcher loads, hashes
the ranges below, and decodes the table of every group an island record binds. It checks each
memstate's live `[$7A68]` against the decode of its own group, and decodes each named script to
op names and `strings.json` ids. It prints JSON with no game text. On 2026-09-29 it passed on all
62 memstates, 34 in `snapshots/` and 28 in `snapshots/rehosted/`.

`live` runs four cases from `eris-lift`, with a chain that stops every VBL. It writes the stick
`$79C2`, the lift key into the mailbox `$5558C`, and, in three cases, the pose, all from the chain's
stop scripts. The capture has already spent trigger 3. So `walk-out`, `front-door` and `queue`
re-arm it by writing `$80` to `$7CB7`. That is the only write that is not an input. Each case
raises unless the trace shows what the note claims.

| Case | Run under `research/damocles-st/work/` | `result.json` SHA-256 |
| --- | --- | --- |
| `walk-out` | `location-trigger-walk-out-20260929T110832Z-3e2bf7d9` | `28d0673704d1a531347a89ff360ba7438f78c67f3667bff880a659b310e80577` |
| `front-door` | `location-trigger-front-door-20260929T111000Z-fb2a985c` | `d8883db09b2e911ef35cc74b7460a599195230e718e0f6309864c79d577fa1e3` |
| `offer` | `location-trigger-offer-20260929T110832Z-503d3805` | `e051686e1bad1b4dd9bce6e28097b8fccf5cd51b849717e1c3f6323473e7b5f2` |
| `queue` | `location-trigger-queue-20260929T110832Z-ff5f4c8d` | `324d424e032c2a9a81d91feacb5902f8b89583255e9945773caa31f1ceb3382e` |

The catalogue now publishes each island's table as `locationTable` (below). The lab test
`LocationTableTests` checks the same decode against the pinned RAM and every memstate.

## The walks

`$05A6E8`–`$05A72C`, reached when the eye is past its region's own bounds:

```
bsr     $5a32c              ; reselect the region: $7AFC, $7B34, $7B12
movea.l $7a68.w, a0         ; the table
move.w  $7b5c.w, d2         ; the cell
next:   byte 0 = 0 -> rts; byte 0 != cell -> next
        byte 1 = 0 -> any: bit 6 of byte $7B34 set -> next, else test the Floor
        byte 1 != $7AFD -> next
        byte 2 >= 0 and byte 2 != $7AA5 -> next
        d1 = byte 3; bra $54770
```

The walk runs after every reselection, including one that finds no region (`$05A4CA`, which
clamps the eye to the current region). So pushing against the edge of a region with no neighbour,
such as a lift car during a ride, walks the table again with the region unchanged. A spent trigger
makes that harmless.

`$054C88`–`$054CAC`, reached from `$054BF8` on every cell change:

```
tst.w   $7ab6.w             ; Y's high word; nonzero -> skip
movea.l $7a68.w, a1
next:   byte 0 = 0 -> done; byte 0 != d3 (the new cell) -> next
        byte 1 != $FF -> next
        d1 = byte 3; bsr $54770
```

`$054B3E` compares the cell coordinates `$7A2C`/`$7A34` with the last ones `$79C6`/`$79CA` and
does nothing when they match. So "every cell change" is exact. `$054B2E`, a second entry that six
other sites call, skips that comparison. Those callers were not traced.

## The tables

All entries are 4 bytes. The cell is written low nybble first, as in the lift and place notes, so
`$89` is 09-08. Regions are the 1-based index `$7AFC`. The table of every other group an island
record binds is empty, and so is group `$00`, the empty workspace.

| Body | Group | Table | Cell | Region | Floor | Trigger | Arming | What the script does |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ERIS | `$12` CAPITAL CITY | `$025115` | `$89` 09-08 STATE OFFICE | any indoor | 0 | `$03` | `$80` | the President's welcome: why you were sent for, that Eris has hours left, where the Damocles file is |
| | | | `$89` 09-08 STATE OFFICE | 7 | 2 | `$04` | `$A0` | the first offer, below |
| | | | `$CF` 15-12 | 6 | 10 | `$08` | `$80` | a bank-robbery rebuke: you have set off the alarm |
| | | | `$EC` 12-14 | 3 | 1 | `$1C` | `$80` | the post office has moved to Birmingham Island, Dion |
| | | | `$11` 01-01 | 3 | 1 | `$1D` | `$80` | the tax collector takes the back taxes: the balance is set to zero |
| DION | `$02` BIRMINGHAM ISLAND | `$023EFF` | `$DE` 14-13 | any indoor | 0 | `$0A` | `$80` | a security system warns you off |
| | | | `$B2` 02-11 | any indoor | 0 | `$09` | `$80` | an arrival home |
| | | | `$B2` 02-11 | 4 | 1 | `$0C` | `$80` | nobody in, only the answering machine |
| VESTA | `$05` POLITBURO CITY | `$024180` | `$73` 03-07 | any indoor | 0 | `$07` | `$80` | a department store's gift: 10,000 is added to the balance |
| GAEA | `$0F` CHALDEA METROPOLIS | `$024B32` | `$86` 06-08 | 3 | 1 | `$1F` | `$80` | an estate agent completes a sale you did not ask for: the balance is set to zero |
| METIS | `$03` METIS MOONBASE | `$02401A` | `$60` 00-06 | 3 | 8 | `$1E` | `$80` | a court's reparations: the balance is set to zero |
| | | | `$62` 02-06 | any indoor | 0 | `$3D` | `$80` | a prison sentence |
| CYCLOPES | `$35` IDI CENTRE | `$025DB3` | `$22` 02-02 | any indoor | 0 | `$0D` | `$80` | the state lottery, below |
| BACCHUS | `$18` BACCHUS WAYSTATION | `$025632` | `$31` 01-03 | any indoor | 0 | `$3F` | `$80` | a casino's double-or-quits bet, below |
| GAEA | `$0E` (VULCAN ISLAND) | `$0247B5` | — | — | — | — | — | 24 junk entries from group `$0F`'s record, none at cell `$88` |

Table addresses are in the pinned first-world RAM. The `$3D` entry is the METIS location trigger
the [landing note](damocles-landing-messages.md) found outside the landing range.

Record `$00F8` is the balance at `$7C42` (`$7482` + 8 × `$F8`), the same record the price check
subtracts from ([object selection](damocles-object-selection.md)). `record.write $00F8 0 0 0`
sets it to zero. `record.bcd.add $00F8 …` adds to it, and `record.bcd.three $00F8 $00F8 $00F8`
doubles it. Record `$00F9` at `$7C4A` is the offer's proposed reward
([first offer](damocles-first-offer.md)).

### The scripts

Each script is decoded from its entry word at `$070080 + 2 × index`. "Ends" names the shared
epilogue `$072CAE` (a 50-frame clearing line, then busy cleared), or the script's own
`flags.clear $0040; return`. `$072D1C` is the call-shaped clearing line with busy kept, and
`$072CE0` the 100-frame delay ([landing note](damocles-landing-messages.md#the-gazetteer-shape)).
"Unported" lists the ops that `web/src/damocles/scripts.ts` has no step for.

| Trigger | Entry | Messages | Other ops | Ends | Unported |
| ---: | --- | --- | --- | --- | --- |
| `$03` | `$0704C8` | `script3-inline-1..6` | `call $072D1C` after the fourth line | own | — |
| `$04` | `$070650` | `script4-inline-1..20` | below | own, or `$072CAE` on the refusal | `if.key`, `set.7B60`, `record.write`, `word.write`, `record.bits` |
| `$07` | `$070E82` | `script7-inline-1..3` | `record.bcd.add $00F8` 10,000 | `$072CAE` | `record.bcd.add` |
| `$08` | `$070F24` | `script8-inline-1..2` | — | `$072CAE` | — |
| `$09` | `$070E22` | `script9-inline-1` | — | `$072CAE` | — |
| `$0A` | `$070B80` | `script10-inline-1..2` | — | `$072CAE` | — |
| `$0C` | `$070E4E` | `script12-inline-1` | — | `$072CAE` | — |
| `$0D` | `$070F88` | `script13-inline-1..5` | below | `$072CAE` | `word.write`, `if.record.bits`, `record.bcd.add` |
| `$1C` | `$071ACE` | `script28-inline-1..3` | — | `$072CAE` | — |
| `$1D` | `$071B64` | `script29-inline-1..4` | `record.write $00F8` zero | `$072CAE` | `record.write` |
| `$1E` | `$071C2A` | `script30-inline-1..4` | `record.write $00F8` zero | `$072CAE` | `record.write` |
| `$1F` | `$071CFC` | `script31-inline-1..4` | `record.write $00F8` zero | `$072CAE` | `record.write` |
| `$3D` | `$071DCE` | `script61-inline-1..4` | — | `$072CAE` | — |
| `$3F` | `$071F20` | `script63-inline-1..5` | below | `$072CAE` | `set.7B60`, `if.key`, `record.write`, `record.bcd.three` |

Every message id is already in `strings.json`. No string needs adding. Seven scripts use only
messages and the shared epilogue, which the port already has. The balance ops need a balance,
which the port's panel does not have yet (`web/src/damocles/panel.ts` shows a fixed credit
readout).

**`$04`, the first offer.** Eight lines of briefing, in three runs separated by `$072D1C`. Then it
writes 10 million to the proposed reward `$00F9`, clears the key (`set.7B60`), asks, and polls
Y/O/N against a 500-tick wait
([first offer](damocles-first-offer.md#segment-boundary-and-control-flow)). N or the timeout raises
the offer to 15, then 20. N or the timeout at 20 raises the offer again to 25, but only if
`if.random $4000` draws a word of `$4000` or more; otherwise it goes straight to the refusal. The
refusal zeroes `$00F9`, shows one line and ends on `$072CAE`. Y or O at any offer accepts, at
`$0709AA`:

```
flags.set   $0001           ; $7BD8 bit 0: the assignment accepted
word.write  $00FE $0026     ; $7C3E = 38, slot 38 DOOR KEY A
record.bits $0080           ; set bit 7 of $6FAA + 4 * $7C3E: DOOR KEY A's carried flag
message     script4-inline-15..16
call        $072D1C
message     script4-inline-17..18   ; where to start
call        $072CE0
message     script4-inline-19
call        $072D1C
message     script4-inline-20       ; where the spacecraft key is
flags.clear $0040
return
```

Handling bit 7 is the carried flag the take and drop handlers read
([carry capacity](damocles-carry-capacity.md)). The acceptance sets it without putting DOOR KEY A
on the Carried Stack. What that grants in play was not traced. The acceptance does not credit the
reward to the balance.

**`$0D`, the lottery.** It shows the draw line and sets `$7C3E` = `$DA`, slot 218 LOTTERY TICKET.
Then `if.record.bits $0080` tests that slot's carried flag. Without the ticket it shows one line
and ends. With it, `if.random $C000` twice picks the prize. A first word of `$C000` or more wins
the first prize, 1,000,000 added to the balance. Otherwise a second word of `$C000` or more wins
the second prize, 1,000. Otherwise it shows the winning number and pays nothing. Each branch ends on `$072CAE`.

**`$3F`, the casino.** It shows a welcome, clears the key, asks, and polls Y/O/N against 500 ticks
in the first offer's shape. Y or O takes `if.random $8000`, and so does the timeout, which falls
through into the bet. A word below `$8000` doubles the balance. Otherwise the player loses, and
the balance is set to zero. Only N declines: it shows one line and pays nothing. Its arming is `$80`, so every outcome spends it.

## Runtime

VBLs are the program's own clock `$051D96`. Stops land on VBLs, so an event is placed between two
consecutive stops.

| Case | What happened |
| --- | --- |
| `walk-out` | Trigger 3 re-armed. From the car (region 5, `$2001`) the eye walks east. After six VBLs at X −669, the next frame carries it across door region 3 into the hall, region 1. At VBL 16909 `$7CB7` goes `$80` → `$00`, busy is set, and the script PC is `$0704C8`. |
| `front-door` | Trigger 3 re-armed, and the eye placed outdoors at (0, 350), facing −Z. It walks through outdoor regions 10 and 9 (`$C000`) with nothing fired. The shut front door holds it at Z 200 for about 70 VBLs. Door region 8 (`$83F0`) is selected, and the trigger fires in the same pass (VBL 16966). The stop before lands in that pass, between the selection and the walk. |
| `offer` | Key 2 in the car. The ride arrives at Floor 2 at VBL 16990, with trigger 4 still `$A0`. The eye is placed in region 1 before door 6 and walks east. At VBL 17101 it enters region 7, `$7CB8` goes `$A0` → `$20`, and the script PC is `$070650`. |
| `queue` | Trigger 3 fires at VBL 16909. The eye walks back into the car, rides to Floor 2 (VBL 17029) and walks into region 7 at VBL 17161, while trigger 3 is still presenting. `$7A88` becomes 4, and `$7CB8` stays `$A0` throughout. Trigger 3 clears busy at VBL 18196, 1,287 VBLs after it fired. Trigger 4 launches at VBL 18199, and `$7CB8` goes to `$20`. |

`$20` is the value in every memstate captured after the offer. `$A0` → `$20` is the launcher
clearing bit 7 and leaving the queue bit.

## The memstates

| Trigger 3 | Trigger 4 | Memstates | Reading |
| --- | --- | ---: | --- |
| `$80` | `$A0` | 6 | the first-world Eris captures (`eris-spaceport-onfoot`, `boarded-car`, `boarded-limo`, `left-limo`, `interior-window`, and the rehosted `eris-spaceport-onfoot`) |
| `$00` | `$A0` | 2 | `eris-lift` in both directories: the President has spoken, and the offer is not yet made |
| `$00` | `$20` | 54 | every later capture, each with `$7BD8` bit 0 set |

## The other launcher callers

Out of scope here, listed for the follow-up tickets. Each writes its index into `d1` before the
call. The issue's list omits `$17`.

| Call | Index |
| --- | --- |
| `$04BEF8` | `$01` |
| `$04C96C` | `$0E` |
| `$051F66` | `$0F` |
| `$04C90C` | `$10` |
| `$04C918` | `$11` |
| `$04C93A` | `$12` |
| `$04C95C` | `$13` |
| `$04D85C` | `$15` |
| `$04D8F0` | `$15` (from `$04D894` and `$04D8C8`), `$16` (`$04D860`), `$17` (`$04D888`), `$18` (`$04D8CC`), `$3C` (`$04D8BE`) |
| `$04D8D2` | `$19` |
| `$04BEE6`, `$04C9CE` | `$1A` |
| `$04C984` | `$1B` |
| `$04D272` | `$2A` |

## The catalogue

The table belongs in the Damocles Catalogue for the same reason the place list and road networks
do. It is authored per structure group in the program image, a consumer needs it without a
capture, and a Save does not depend on it. So it needs no `schemaVersion` bump (ADR 0048, as
amended for #408). Each island now carries `locationTable`, with its `sourceAddress` and its
`entries` as `{cell, region, floor, trigger}` raw bytes (`floor` signed), decoded by
`damocleslab.catalogue.decode_location_table`. Islands that share a group carry the same table.
VULCAN ISLAND's junk is published as the loader reads it, so a consumer that walks the table
behaves as the ST does. Regenerating with the tracked command changes nothing but the 62 new
fields. The web catalogue parser does not read the field yet. That is for the port.

## What this means for the port

These are recommendations for #611 and #612, not decisions this note makes.

1. **Walk the table on a region reselection, and only then.** The port's region selection
   ([#509](damocles-lift-ride-movement.md)) is the one place to hook. Match cell, region (0 = any
   region without bit 14), Floor, and stop at the first match. A lift arrival is not a
   reselection. The `$FF` cell-entry half can be left out while no table uses it, but it costs
   little to carry.
2. **Arm triggers 3 and 4 and carry them in the Save**, with their `$80` and `$A0` bytes. With
   them the Save's trigger table grows past the pickup and landing triggers, so that is a schema
   bump. A migrated earlier Save can arm both exactly: the port has never fired either.
3. **Slot 3 needs nothing new.** It is six messages, `$072D1C` after the fourth, and its own busy
   clear. It can ship before slot 4.
4. **Slot 4 needs `if.key` with the pre-prompt key clear, the reward record, `$7BD8` bit 0, and
   DOOR KEY A's carried flag.** The key poll's checkpoint semantics are in the
   [first-offer note](damocles-first-offer.md). `if.random $4000` reads the same noise walk as the
   landings ([ADR 0053](../adr/0053-present-damocles-landing-messages-from-the-recovered-draw.md)).
   `$7BD8` bit 0 should be Save state, because the ending reads it.
5. **The other twelve** split into seven message-only scripts, ready once the table walk exists,
   and five that need a balance (`$07`, `$0D`, `$1D`–`$1F`, `$3F`). The balance is a separate
   economy decision. It should not be invented for them.

"Location Trigger" is now defined in `CONTEXT.md`.

[#611](https://github.com/odogono/mercenary/issues/611) ports the region walk
(`web/src/damocles/locationTriggers.ts`) and script slot 3. It arms trigger 3 alone, and Save
schema 19 carries it. Trigger 4 and the other twelve have no script in the port, so the launcher
refuses their entries.

## Unresolved

- **What DOOR KEY A's carried flag grants** when the acceptance sets it without a Carried Stack
  entry, and whether the key object is ever shown as carried.
- **The eye's route to trigger 4.** The `offer` and `queue` cases place the eye in Floor 2's
  region 1 by pose. The walk from the car to region 7 through regions 9 and 1 was not driven.
- **`$CF` region 6 on Floor 10, `$EC`, `$11`, the Dion, Vesta, Gaea, Metis, Cyclopes and Bacchus
  entries.** They are decoded from the table and the bank. They were not fired at runtime.
- **The `$FF` cell-entry walk** was not exercised, because no table has an entry for it.
- **Trigger 3's length.** The `queue` case clears busy 1,287 VBLs after trigger 3 fires. Six
  200-frame lines and one 50-frame clearing line make 1,250, which is what the port presents. The
  other 37 VBLs were not accounted for.
- **Group `$0E`'s junk place entry.** Its one misread place (cell `$0F`) would name cell `$0F` on
  VULCAN ISLAND with 20 bytes of group `$0F`'s record. That was not checked in play.

## Source ranges

Half-open ranges in the pinned first-world RAM, as `decode` hashes them. The trigger dispatch
digest is the one in [the limo-key note](damocles-limo-key-pickup.md).

| Range | SHA-256 |
| --- | --- |
| `$04ED14`–`$04ED2A` loader publish | `7a28ac04de84d7026c1129b9f4e74dbba6c6dcfffaaf80168b7d901abf5876e9` |
| `$05A6E8`–`$05A72E` region walk | `7ea860b6121cbed2995f9c0c18c8dd91553f427b9f96a4494ee8adb766276050` |
| `$054C88`–`$054CB0` cell walk | `7955eadfa11911d0404f3bf3a8fba57a0dd983672871c2a4766a386c4390b98f` |
| `$054B3E`–`$054BF8` cell change | `b98895a4448b0deb9321c1de9ebdda621e1d84430eff6268254a9f7900c7c882` |
| `$054764`–`$0547C6` trigger dispatch | `eccc7df9c8c734f5c3758b50c43c56f6a05404dda1bc34e668fad5956f514a61` |
