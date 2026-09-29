# Damocles Head Commands and the document display

Working-Authority Evidence for [#596](https://github.com/odogono/mercenary/issues/596), part of
the map [#595](https://github.com/odogono/mercenary/issues/595), recovered 2026-09-29. The
original binds Open, Read, Next and Previous to keypad Enter, `*`, `+` and `-`. The map had
only fragments of what they do. This note decodes the keypad dispatch from the scancode to each
object's handler, and the document display, and confirms the display against Hatari.
Authoritative Evidence remains bound to the C64 Reference Build. This note records decoded ST
facts only ([ADR 0002](../adr/0002-separate-rom-research-from-implementation.md)). RAM,
screenshots and traces stay ignored Restricted Material under `research/damocles-st/work/`.

## What was found

1. **Only Open acts on the Carried Stack head.** Keypad Enter looks the head (`$61CE`) up in a
   29-row table at `$04D2C4` and writes the row's object and panel mode to `$785E`–`$7861`.
   Read, Next and Previous act on the **panel mode** `$785F`, whatever object opened it. The
   head can rotate away and the open document still pages.
2. **Five panel modes share the keys.** Mode 2 is a document, which is 19 objects. Mode 3 is the
   TIMED DETONATOR, 4 the AUTHORS COMPUTER, 5 the A TO Z COMPUTER (display only) and 6 a switch
   (7 objects, among them the four disguised detonators).
3. **A document is shown on the Benson Panel's centre box, not the world view.** Open scrolls
   the centre box's DAMOCLES logo out and a per-object panel in, over 64 VBLs. The panel reads
   the object's name, `− ITEM +`, `INDEX` and `PRESS * TO VIEW`. Each document also sets its own
   two colours. The world view keeps drawing, and the Hatari captures show it.
4. **"Item" is literal.** A document is a list of *items*, each an 8-character name and a body.
   `+` and `-` step the item name shown in the box, and wrap at both ends. `*` sends the current
   item's **body to the message bar** as an ordinary message. There are no pages apart from
   the BOOK's items, which its text happens to call pages.
5. **Every document is resident, and none is in `strings.json`.** The 19 documents live in one
   bank at `$073500`–`$07612C`, byte-identical in the pinned first-world RAM and all 28
   rehosted memstates. They hold 93 items. `strings.json` carries none of their bodies.
6. **The world does not stop.** The VBL clock and the Impact Clock advance at their normal rate
   while a document is open. The Head Commands work the same on foot, aboard a craft and in
   space, because the keypad dispatch is reached before any occupancy test.
7. **Only a drop closes a document.** Dropping the open object clears `$785E` and scrolls the
   logo back. Enter on the object already open does nothing. Opening another table object
   replaces the panel. No key closes it.
8. **The original's Save carries the open panel.** `$785E`–`$7865`, the item pointer `$7858`
   and the item index `$7854` are all inside the Save's `$6140`–`$7E17`. The restore redraws the
   panel from them (`$0552FE` → `$058EC8`). Two of the player's own memstates were captured with
   the MUSEUM GUIDE open.

## Reproduce

| Item | Value |
| --- | --- |
| Pinned first-world RAM | `observe-first-world-20260818T101013Z-c5a32b7d/observed.ram`, SHA-256 `b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967` |
| Program SHA-256 | `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef` |
| Probe | `research/damocles-st/scripts/head-command-probe.py` |

```sh
python3 research/damocles-st/scripts/head-command-probe.py decode \
  --run research/damocles-st/work/observe-first-world-20260818T101013Z-c5a32b7d \
  --memstates research/damocles-st/snapshots/rehosted
python3 research/damocles-st/scripts/head-command-probe.py live --roms roms --case CASE
```

`decode` runs no emulator. It checks the 20 instruction sequences the findings rest on and
prints the Open table. It prints every document with every item's name and body, counts the
bodies `strings.json` does not carry, and hashes the routines. It also sweeps a memstate
directory for the panel state and the document bank.

`live` boots a memstate. Where a case names a head, it writes that object to the front of the
Carried Stack (`$61CC`/`$61CE`) at the first stop. The write moves nothing else, so the panel's
head name is not redrawn and the object is not marked carried. The probe then presses the case's
keys. After each key it saves the whole RAM and a screenshot. It raises unless the panel long,
the item, the index and the head are what the decode predicts.

| Case | Memstate | Keys | Result |
| --- | --- | --- | --- |
| `damocles-file` | rehosted `eris-lift`, file written at the head | Enter `+` `*` `-` `-` `+` Enter ← `+` | `head-command-damocles-file-20260929T064900Z-a6c9fd60`: every step as predicted. The second `-` wraps to item 10 with index 8. ← puts the V.I.P. LIMO key at the head, and the file still pages. |
| `damocles-file-drop` | rehosted `dion-2-3`, which carries the file at the head | Enter ↓ | `…-damocles-file-drop-20260929T065212Z-79166809`: the drop places it, the panel long clears and the logo returns |
| `aboard` | `dion-north-airborne`, EAGLE NINE in flight (`$7AAE` = 0) | Enter `+` | `…-aboard-20260929T065245Z-71496ed7`: opens and pages aboard |
| `book` | rehosted `eris-spaceport-onfoot`, BOOK written at the head | Enter `+` `*` | `…-book-20260929T065035Z-3fac3558`: `BOOK / PAGE 1`, and Read writes `$7856` = `$8301` |
| `safe-shut` | rehosted `eris-spaceport-onfoot`, NOVAGEN SAFE written at the head | Enter | `…-safe-shut-20260929T065114Z-46820cde`: the panel stays closed, as `$7A60` = 0 requires |

A `damocles-file-drop` attempt on `eris-spaceport-onfoot` with the file only written at the
head was refused. The stack count stayed at 1. The write does not set the object's carried
state, so that case uses a memstate where the file is genuinely carried.

## The dispatch

The main key dispatcher (`$0555B8`) stores the scancode in `$7B5E`. It sends every scancode from
`$4A` upward, apart from the arrows `$4B`/`$4D` and the keypad brackets `$63`/`$64`, to
**`$04D3D2`** (`$055690`). That comparison comes before the occupancy test at `$05569C`. Before
it, the dispatcher only diverts the demo replay (`$7A0C`, `$0555CC`), and some keys below `$0C`
and `$22`/`$26` on foot. So keypad keys reach the same handler on foot, aboard and in space.

`$04D3D2`:

```text
if $52938 != 0: ignore            ; the panel transition is running
if key == $72 (Enter): Open       ; $04D24C
switch $785F:                     ; panel mode
  2 -> $04D762  document
  3 -> $04D69C  timed detonator
  4 -> $04D4D0  author's computer
  6 -> $04D420  switch
  else ignore                     ; 0 closed, 5 A TO Z COMPUTER
```

The keypad digits `$67`–`$70` map to 7 8 9 4 5 6 1 2 3 0 through `$04D3AE`. Only modes 3 and 4
read them.

### Open, `$04D24C`

```text
d1 = $61CE                                ; Carried Stack head
if d1 == 102 (NOVAGEN SAFE) and $7A60 == 0: return
if d1 == 101 (AUTHORS COMPUTER):
    if $7A90 != 14: return                ; aboard slot 14, the AUTHOR'S CHAIR
    run script $2A                        ; the author's-computer warning
find the row of $04D2C4 whose object is d1, else return
if row.object == $785E: return            ; already open
$785E..$7861 = row[0..3]                  ; object, mode, index, 0
$7864, palette 15 = row[4..5]; $7862, palette 3 = row[6..7]  ; each EOR $7A52
$058EC8                                   ; select the mode's panel graphic, start the transition
$054848                                   ; key click
if mode == 2: $04DB9E                     ; select document `index`
```

`$058EC8` points `$5293A` at the mode's panel graphic, taken from the table at `$066100`. For
modes 2 and 6 it copies a title strip of 20 words, five rows of the 64-pixel window, into the
graphic from `$066100 + $400 + 20 × index`. It then sets `$52938` = `$40`. The VBL handler's `$05293E` (called from `$051E22`)
spends 32 steps scrolling the old centre box out, one row a VBL. Every step moves the window's
contents up a row, and for these 32 steps the row entering at the bottom is cleared to black. At
the midpoint it writes the two colours to the live palette (`$6FD08`, `$6FD20`). It then spends
32 steps scrolling the new graphic in, a row of it entering at the bottom each step. At zero it
draws the mode's content (`$0529D6`). For a document that content is the current item's name,
drawn by `$04DBBE` at screen offset `$6A84`, so a panel scrolls in with its name field empty. The
box is the window at columns 128–192 and rows 160–191 of the 320×200 screen, between the
navigation and inventory windows. In the `damocles-file` frames, colour 15 is the window's
ground and colour 3 the name field's. The title, `INDEX` and `PRESS * TO VIEW` are grey
(204, 204, 204) and the name is black. After the drop the logo returns on black, although `$7864`
still holds the file's colour 15, so the logo does not draw its ground in colour 15.

### The Open table, `$04D2C4`

Eight bytes a row: object, mode, index, 0, then colour 15 and colour 3 as ST `0RGB`.

| Object (slot) | Mode | Index | Head Commands | Gate |
| --- | --- | --- | --- | --- |
| NOVAGEN CABINET (111) | document | `$00` | `+` `-` `*` | — |
| RUBBISH BIN (109) | document | `$02` | `+` `-` `*` | — |
| BOOK (131) | document | `$04` | `+` `-` `*`; Read queues a page action | action only with the MAGIC CRYSTAL |
| FILOFAX (133) | document | `$06` | `+` `-` `*` | — |
| RECEIPT (125) | document | `$08` | `+` `-` `*` | — |
| NOVAGEN SAFE (102) | document | `$0A` | `+` `-` `*` | Open refused until `$7A60` is set |
| MUSEUM GUIDE (112) | document | `$0C` | `+` `-` `*` | — |
| DAMOCLES FILE (151) | document | `$0E` | `+` `-` `*` | — |
| MEMO PAD (146) | document | `$10` | `+` `-` `*` | — |
| TOP SECRET FILE (150) | document | `$12` | `+` `-` `*` | — |
| CLIPBOARD (143) | document | `$14` | `+` `-` `*` | — |
| SCROLL (153) | document | `$16` | `+` `-` `*` | — |
| NOTE PAD (154) | document | `$18` | `+` `-` `*` | — |
| PHONE MESSAGE (147) | document | `$1A` | `+` `-` `*` | — |
| ANSAFONE (148) | document | `$1C` | `+` `-` `*` | — |
| PHOTOCOPIER (142) | document | `$1E` | `+` `-` `*` | — |
| FAX (141) | document | `$20` | `+` `-` `*` | — |
| WALL PHONE (106) | document | `$22` | `+` `-` `*` | — |
| WALLCLOCK (103) | document | `$24` | `+` `-` `*` | — |
| TIMED DETONATOR (145) | detonator | — | digits set `$7866`, `+`/`-` the fuse, `*` arms | [sound programmes](damocles-sound-programmes.md#what-arms-each-programme) |
| AUTHORS COMPUTER (101) | author's computer | — | digits 0–4 pick an option, `+`/`-` change it, `*` acts on option 4 | Open only from the AUTHOR'S CHAIR, and fires script `$2A` |
| A TO Z COMPUTER (56) | A to Z computer | — | none; redrawn by `$04DA06` from two other paths | — |
| TV CONTROL (93) | switch | `$00` | `+` on, `-` off | — |
| GHETTOBLASTER (121) | switch | `$02` | `+` on, `-` off; drives `$7A62`, the music | — |
| SIDEBOARD (84) | switch | `$06` | `+` on, `-` off | detonator |
| CUPBOARD (85) | switch | `$08` | `+` on, `-` off | detonator |
| HI-FI (86) | switch | `$0A` | `+` on, `-` off | detonator |
| WASHBASIN (87) | switch | `$0C` | `+` on, `-` off | detonator |
| GEIGER COUNTER (149) | switch | `$0E` | `+` on, `-` off | [the Geiger tick](damocles-sound-programmes.md#what-arms-each-programme) |

A switch is bit `index / 2` of the long `$7872` (`$04D420`–`$04D4CE`). Switching one draws its
on/off indicator in the box (`$04D992`). When bits 3 to 6 are all set, which means the four
disguised detonators are on, and `$7634` is non-zero, `$04D458` clears `$7634` and detonates.
If `$7236` is not negative it destroys the Body in `$7634`'s first byte (`$04C8D2`). Otherwise
it runs `$04CAF4` on the NOVABOMB (163), destroys the Body in `$7AA6` unless that is none or
`$78`, and kills the player through `$04CBB0` with system string `$22`, OOPS! - YOU'VE BLOWN
YOURSELF UP. That is a system string, not a trigger. The TOP SECRET FILE's `DETONATE` and
`DISGUISE` items describe this. `$7634` is the NOVABOMB's Association B and `$7236` its
handling byte, bit 7 carried ([the endgame note](damocles-endgame.md), #622). Porting it
belongs to [the endgame map](https://github.com/odogono/mercenary/issues/580), not to #595.

The safe's gate `$7A60` has one writer. When an explosion reaches the NOVAGEN SAFE while the
detonator's digit `$7866` is 3 or less, `$04CA98` sets the gate instead of clearing the safe's
object entry. With a larger digit the safe is cleared like any other object in the blast. So
the safe is read after blowing it open with a small setting.

## The document

`$04DB9E` selects document `index` from the word-offset table at `$073500`. A document is:

```text
+0  word   length L
+2  3 bytes ($80 $20 $00 in every document)
+5  item 0: 8-character name, body, NUL
    item 1: ...
+L+4       $80, the terminator
```

`$7858` points at the current item and `$7854` holds its index. Open sets item 0 and index 0.

| Key | Routine | Effect |
| --- | --- | --- |
| `+` Next | `$04D7A0` | `$7854` += 1. Skip to the byte after the item's NUL. If that is the terminator, go back L bytes to item 0 and set the index to 0. Redraw the name. Click. |
| `-` Previous | `$04D7C6` | `$7854` −= 1. Scan back to the previous item. From item 0 wrap to the last item and **set the index to 8**. Redraw the name. Click. |
| `*` Read | `$04D776` | Only if `$7B96` = 0: `$7B92` ← `$7858` + 8, the body. `$7B96` ← 1. `$7856` ← object, `$7857` ← index. Click. |

Read hands the body to the [message reveal](damocles-message-reveal.md), which shows it in the
message bar much as it shows any other message. A Read while an earlier Read is still waiting in
`$7B96` is ignored. The long items, such as the NOVAGEN CABINET's CREDITS or the MEMO PAD's TUE
17TH, are just long messages. Their bodies pad words with spaces to line up in the original's
fixed-width text.

### How a Read is shown

This section was added for #598. It rests on the disassembly of `$0547C6`–`$054806` and
`$05193E`–`$05194C` in the pinned first-world RAM, and on the `damocles-file` case's frames.

- **In the row's second colour.** The deferred path at `$0547C6` sets `$7BA2` to 2 (`$0547CE`)
  before it raises the gate. So the body's glyphs go to bitplane 1, palette index 2, where every
  other message's go to bitplane 0, index 1. In the captures index 1 is `$0050`, the green, and
  index 2 is `$0567`, the panel's light blue. The `read` step's frame draws the body in
  (170, 204, 238) and the `open` step's frame draws the take's message in (0, 170, 0). The
  maintainer's own capture of the DAMOCLES FILE shows the same change. `$0523E2` clears `$7BA2`
  when the message finishes. The row keeps whatever planes its glyphs were drawn in, so an
  ordinary message scrolls green over a light-blue row. The document's own two colours are only
  the centre box's.
- **Ahead of everything else, once the gate is down.** The script dispatch head tests the gate
  `$7BA0` and then `$7B96` (`$051944`), before the pending trigger `$7A88` and before any script
  step. A Read pressed while a script's message presents waits for that message. It then
  presents before the script's next step, and the script resumes once the body is over.
- **In 48-character blocks, the last one shortened.** A body is longer than the row, so the
  reveal shows it a block at a time (`$0523BE`), each block holding the default 200 frames
  (`$0523BA`). The deferred path also sets the shorten flag `$0523BC` (`$0547E4`), so the block
  that reads the terminator holds only 50 frames (`$0523A2`). Many bodies end one space past a
  whole block, the DAMOCLES FILE's PROBLEM and HISTORY among them, so their last block is a
  single space, which clears the row. The `read` frame of the `damocles-file` case caught
  HISTORY's second block, `THE LAST THIRTY YEARS TO CONSIDER THE PROBLEM`.

The index is not the item's position after a wrap back. It is set to 8 whatever the document's
length, and the next `+` counts on from there. Only the BOOK reads the index. `$0547F2` queues a
page action (`$7B96` ← `$8000`) when `$7856` is the BOOK and the MAGIC CRYSTAL is carried. Then
`$04D7F0` dispatches on `$7857`, as [the sound programmes note](damocles-sound-programmes.md)
decodes. The BOOK has exactly nine items, TITLE and PAGE 1–8, so its wrap is right. Without the
crystal the BOOK reads like any other document. The player's memstates show the drift: they hold
`$7858` at the DAMOCLES FILE's item 9 with `$7854` = 7, which is two presses of `-` from item 0.

### The five candidate documents

All five are readable. The bodies below are the documents' own text, trimmed of the padding
spaces that centre them in the message bar. `decode` prints every document in full.

**DAMOCLES FILE** (11 items)

| Item | Body |
| --- | --- |
| PROBLEM | THE COMET DAMOCLES IS ON A COLLISION COURSE WITH ERIS - SEE CHART D.1745 FOR TRAJECTORY |
| HISTORY | A PARLIAMENTARY COMMITTEE HAS BEEN SITTING FOR THE LAST THIRTY YEARS TO CONSIDER THE PROBLEM AND HAS PUBLISHED MANY REPORTS - ALL TO NO AVAIL |
| SOLUTION | RUMOUR HAS IT THAT THERE CAN BE AS MANY AS FIVE WAYS TO SOLVE THE PROBLEM - THE ONLY PROGRESS SO FAR WAS REPORTED BY PROFESSOR RALPH HANTZEN IN THE DEVELOPMENT OF AN IMMENSELY POWERFUL BOMB |
| SETBACK | UNFORTUNATELY THE ERIS STATE PRESIDENT AND THE THE PROF HAD A FIERCE ARGUMENT FOLLOWING FROM AGAME OF CHESS - HANTZEN HAS NOT BEEN SEEN SINCE |
| HANTZEN | HEAD OF HANTZEN INDUSTRIES WHICH OPERATES AT THE FOREFRONT OF TECHNOLOGY WITH PRODUCTS RANGING FROM TIN OPENERS TO TIME MACHINES (CRYOGENIC) |
| OTHER | THE MYSTICAL ORDER OF CARPENTERS MAINTAIN THAT A DEVICE GIVING ACCESS TO A PROFITABLE SOLUTION IS IN EXISTANCE - AND THE AUTHOR DOES CONCEED THAT IF SO - SUCH A PROSPECT MAY NOT BE UNIQUE |
| POLITICS | THE DION VERDANT PARTY -DARK GREEN CHAPTER- HAVEMOVED TO PLACE A PRESERVATION ORDER ON DAMOCLES! |
| REWARD | LLOYDS GROUP 4 HAVE OFFERED AN ADDITIONAL REWARD OF 25,000,000 ICG'S FOR THE SALVATION OF ERIS IF ACHIEVED WITHOUT DESTRUCTION OF THE COMET |
| REASON | LLOYDS CONSIDER DAMOCLES WILL BE A VALUABLE TOURIST ATTRACTION ON PROJECTED FUTURE VISITS |
| TIME | YOUR PANEL DISPLAY IS TUNED TO ERIS TIME TO GO BEFORE DAMOCLES HITS - PLEASE NOTE THAT INTERGALACTIC TRAVEL TAKES YOU VERY LITTLE TIME BUT RAPIDLY DECAYS THE 'ERIS TIME' AVAILABLE |
| NEXT | AFTER FULLY READING THIS FILE - PLEASE TAKE THE ELEVATOR TO MY OFFICE IN THIS BUILDING LOCATED AT THE END OF THE CORRIDOR ON THE SECOND FLOOR |

**TOP SECRET FILE** (10 items)

| Item | Body |
| --- | --- |
| SECRET | THIS INFO CLASSIFIED UNDER OFFICIAL SECRETS ACT THIS FILE IS CLASSIFIED AS TOP SECRET AND SHOULD BE KEPT SECURE IN A LOCKED SAFE AT ALL TIMES |
| PENALTY | THE PENALTY FOR LEAKING ANY CONTENT OF THIS FILEIS 15 YEARS MINIMUM AT THE PAN HADES LABOUR CAMP |
| POWER | THE NOVABOMB OPERATES BEYOND PREVIOUS KNOWN LAWSOF PHYSICS - IS INSTANTANEOUS IN EFFECT - AND IS CAPABLE OF DESTROYING THE LARGEST OF PLANETS! |
| PURPOSE | THE DESTRUCTION OF THE COMET DAMOCLES |
| LOCATION | KNOWN ONLY TO THE PROF FOR DELIVERY ON THE DAY |
| METHOD | PLACE ON SURFACE OF COMET - REMOTE DETONATION! |
| SAFETY | THE BOMB REQUIRES NO SPECIAL CONDITIONS IN STOREOR TRANSIT - IT EMITS A DETECTABLE LOW LEVEL OF RADIATION AT LEVELS OK FOR 1 HOUR OF EXPOSURE! |
| DETONATE | FOUR INDIVIDUALLY CODED DETONATORS ARE NECESSARY EACH SWITCHED ON AND TRANSMITTING TO DETONATE |
| DISGUISE | FOR ADDITIONAL SECURITY THE DETONATORS ARE DISGUISED AS ORDINARY HOUSEHOLD ITEMS |
| SECURITY | THE INTEGRITY OF FOUR PROMINENT PEOPLE HOLDING DETONATORS AND A RELIABLE FIFTH HOLDING THE BOMB MEETS GOVERNMENT SAFETY REGULATIONS |

**BOOK** (9 items). TITLE: WISHFUL THINKING OF A MERCENARY. PAGE 1 to PAGE 8: I WISH I HAD A
CHEESE SANDWICH · I WISH THAT I COULD RECEIVE ONE MILLION CREDITS · I WISH THAT I COULD SAVE
ERIS FROM DAMOCLES · I WISH THAT I HAD MORE TIME · I WISH I COULD SAVE BOTH ERIS AND DAMOCLES ·
I WISH THAT THE UNIVERSE WAS MORE COLOURFUL · I WISH TO KNOW HOW TO USE THE AUTHOR'S COMPUTER ·
I WISH I HAD MERCENARY III NOW.

**MUSEUM GUIDE** (6 items, named by exhibit room)

| Item | Body |
| --- | --- |
| 01-01 | A MECHANOID - THIS MODEL NOW DISABLED CONSIDERABLY INCONVENIENCED THE PALYARS ON TARG |
| 01-03 | A CASPER HANLEY EAGLE 8 SE - 'CHEESE' |
| 03-01 | THE DART - FIRST MASS PRODUCED PERSONAL AIRCRAFT |
| 03-03 | LANDING OF FIRST GAEAN PERSONNED SPACE FLIGHT |
| 03-05 | A HEXAPOD - FORERUNNER OF BEST CUPAND SAUCER |
| 05-05 | A SPRINTCAR - HOLDS LAND SPEED RECORD OF 3775 |

**NOTE PAD** (1 item). ENCLOSED: PROF HANTZENS NEW ADDRESS IS UR CITY 07-01.

### The other fourteen

| Object | Items |
| --- | --- |
| NOVAGEN CABINET | ACTIVE, BENSON, BOSHER, CREDITS, DAMOCLES, HACKERS, JOKES, LEO, PLAYTEST, QUEST, TOP TEN, UNIVERSE |
| RUBBISH BIN | DATE 1 to DATE 5, ITEM |
| FILOFAX | ACTION, ANNIV, CLUES, INVEST, LUNCH, PHONE |
| RECEIPT | ACKNOL, RECEIPT |
| NOVAGEN SAFE | AC, TIMESAVE, YOU WISH, MILLIONS, LLOYDS |
| MEMO PAD | THU 12TH, FRI 13TH, TUE 17TH, WED 18TH, FRI 20TH, TUE 24TH, WED 25TH |
| CLIPBOARD | ADMIN HQ, REPLY, LOST 1 to LOST 4 |
| SCROLL | PROPOSAL, PAPER 1 to PAPER 3 |
| PHONE MESSAGE | MESSAGE |
| ANSAFONE | ANSWER |
| PHOTOCOPIER | COPY |
| FAX | SHIPPERS, LAB NOTE |
| WALL PHONE | MESSAGE, ALSO |
| WALLCLOCK | TIME |

Several are clues the game depends on. The CLIPBOARD's LOST 1–4 trace the four detonators. The
WALL PHONE points at the A-Z COMPUTER at 14-11 and the NOVAGEN OFFICE key. The WALLCLOCK gives
the 1 hr 30 min diversion window.

## World state while a document is open

Nothing waits on the panel. Across the ten presses of the `damocles-file` case, the program's
VBL clock `$051D98` advanced 1,874 VBLs and the Impact Clock `$793C` advanced 37 seconds. That
is the 50 VBLs a second of [the panel aboard note](damocles-panel-aboard.md#the-impact-clock).
The world view drew in every screenshot. None of the routines that read `$785F` gates the main
loop: they are the dispatch, Open, the transition, the restore, the drop and two A TO Z COMPUTER
redraws. So the main loop runs on while a document is open. Only the clocks were measured, not
walking.

The only thing held is the keypad itself. For the 64 VBLs of the panel transition, 1.28 s,
`$04D3D2` ignores every keypad key. The main dispatcher still handles every other key.

Aboard, the keypad reaches the handler before the occupancy test. The `aboard` case opened and
paged the DAMOCLES FILE in EAGLE NINE in flight. The AUTHORS COMPUTER can *only* be opened
aboard, since its gate is the AUTHOR'S CHAIR.

A document closes only when the open object is dropped. `$054686` compares the dropped object
with `$785E`, clears the long, and runs `$058EC8`, which scrolls the logo back. Nothing else in
`$040000`–`$060000` writes `$785E`. Enter on the open object returns at `$04D282`. Rotating the
stack or taking something leaves the panel open. `$7858` and `$7854` survive the close, and the
next Open resets them.

## What this means for the port

- **Open reads the head. Read, Next and Previous read the open panel.** The Head Command naming
  of #595 fits Open exactly. For the other three the faithful subject is "the open document",
  so pressing `.` after a rotation still pages the document already shown.
- **The display surface is the Benson Panel's centre box, with the body in the message bar.**
  This answers the map's expected "world view": it is not. The centre box shows the object's
  title, `− NAME +`, `INDEX` and `PRESS * TO VIEW` in the row's two colours. Read is an ordinary
  Benson Message and goes through the existing message reveal. A multi-line item is just a
  longer message.
- **The recovered data to extract** is the Open table (object, mode, index, two colours) and
  the 19 documents' items. It should go into `payload/damocles/` beside `strings.json` from
  `$04D2C4` and `$073500`. `strings.json` covers none of it. The centre-box title strips come
  from the graphic table at `$066100` and are not decoded here.
- **Closing has no original key.** The map's Escape and repeated Enter are Accommodations with
  no original behaviour to preserve. Aboard, the ST's Esc is also the launch (`$055822`), so an
  Escape that closes a document first changes what Escape does aboard.
- **The keypad lock during the 64-VBL transition is original.** The port can keep it or drop
  it. The index drift after a wrap back matters only to the BOOK, and the BOOK's nine items make
  it exact there.
- **A Save needs the open panel.** The original carries it. A port Save should record the open
  object (or none) and the current item. It should also record the index separately, because
  after a wrap back the index is not the item's position and the BOOK's action reads the index.
  The mode and the document follow from the object through the Open table. After a close
  nothing needs saving, because the next Open starts at item 0. That is a Save schema bump
  (currently 16). The switch bits `$7872`, the fuse `$786A`, the charge `$7866`, the author's
  computer options `$7C8C` and the safe gate `$7A60` are also inside the original Save, but
  they belong to the objects #595 does not port.

## The pointer Accommodation

The original has no pointer for the Carried Stack or its documents.
[#599](https://github.com/odogono/mercenary/issues/599) adds one to the Damocles Session, as the
#595 map decided. Each pointer action is a Semantic Action that a key already gives, so it adds
nothing the keyboard lacks:

| Pointer                                                      | Key         | Action                   |
| ------------------------------------------------------------ | ----------- | ------------------------ |
| The head's name on the inventory window                      | Enter       | Open                     |
| ‹ and › over the ends of that name                           | `[` and `]` | Rotate the Carried Stack |
| The item's name in the centre box's field                    | `P`         | Read                     |
| The rest of the centre box's left or right half             | `,` and `.` | Previous and Next        |
| A click on the world view while a document is open           | `.`         | Next                     |
| The wheel, down or up, over the world view or centre box     | `.` and `,` | Next and Previous        |
| ✕ in the centre box's corner                                 | Escape      | Close                    |

- **The hover cue.** The head's name is outlined under the pointer only while Open acts on it,
  which is when its object has a document and is not the NOVAGEN SAFE.
- **Clicks while a document is open.** They do not reach the pointer take on the world view.
  The keyboard take still works.
- **The controls stay out of the way.** ‹, › and ✕ show only while the pointer is over the name
  or the centre box, so the name and title read whole otherwise.
- **The controls never take the focus.** Enter and Space stay game keys.
- **The wheel.** It pages one item a notch. A trackpad's small deltas are gathered 50 pixels to
  a page.
- **Where the controls appear.** The panel draws them only with `data-head-controls`, which only
  `/damocles` sets. The renditions that dress Targ data have none.

## Unresolved

- **What closed the DAMOCLES FILE in the player's memstates.** 24 of the 28 hold the file
  carried with the panel closed. Two more carry it under an open MUSEUM GUIDE. The only close path is a drop, so the file was presumably
  dropped and taken again. The memstates cannot show when.
- **The A TO Z COMPUTER's display** (`$04DA06`, called from `$04E236` and `$054C82`) was not
  decoded. It takes no keypad input.
- **The author's computer options** beyond option 3, the clock rate
  ([panel aboard](damocles-panel-aboard.md#the-impact-clock)), and the `*` action on option 4
  (`$04C8D2` on the option's value) were not decoded.
- **The centre-box graphics** at `$066100` were identified but not extracted.
- **The Book read screenshot** was taken after the message had left the bar. Only the RAM
  (`$7856` = `$8301`, `$7B92` at PAGE 1's body) shows that Read ran. The DAMOCLES FILE's read
  was caught mid-scroll.

## Source ranges

Half-open ranges in the pinned first-world RAM, as `decode` hashes them.

| Range | SHA-256 |
| --- | --- |
| `$04D24C`–`$04D2C4` Open | `974ae115bbdbb2405faf49ed3e980ba301a5d8ca669c7c2ee59d405400923c25` |
| `$04D2C4`–`$04D3AC` the Open table | `fe06c7e43d7aaa7486282aaf304c860dfd107f33f46e18ac20fdc0ec82549ac4` |
| `$04D3AE`–`$04D4D0` keypad digits, the keypad dispatch and the switches | `7e18b05112cab751f3fb1bcbc774c5b053879f71ca75f420614e1dd367591f82` |
| `$04D4D0`–`$04D5DA` the author's computer | `2309f034a313504275e29c475c7cb75392c608436fd865828a82b57eed2dce8a` |
| `$04D69C`–`$04D762` the timed detonator | `b518ebba373bd6194b50c49b986f3d3e8f4a94e05075bda32d9100573a63562b` |
| `$04D762`–`$04D7F0` document Read, Next and Previous | `f9282dc44d7cff2dabf1fe47946578c9fc3d79a2aa0188727d7491d45c5e81e4` |
| `$04D7F0`–`$04D834` the BOOK page action dispatch | `9cb5bfd382a816df1fe57599408257e77fc8f1af3dda221c4357a6a2d801067b` |
| `$04DB9E`–`$04DBDA` document select and item draw | `71a72a934b78ae0e824525bf422589044b202b670d801f8de4775f2ef5270bf0` |
| `$052938`–`$052A0A` the panel transition | `53011ba7b040e64838b21df47ee4fd953240ba89e934ce9a807b128c89583ca9` |
| `$0555B8`–`$05569C` the main key dispatcher | `41eae0e0f79ca8051b86970780977581deadcba8e00127553eeaccee5ad42531` |
| `$058EC8`–`$058F2C` the panel graphic select | `d40a42a39b14976d9c44c1fd9ee7f21ba7638bf7bff4a1026830d8bec6c6f97e` |
| `$073500`–`$07612C` the document bank | `a83b5f2b1d392643861c6c3bb42a4898606ecc3b283733f43c28065cefef45da` |
