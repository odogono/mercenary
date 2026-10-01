# Mercenary III: taxi journey content and presentation

Research for [#618](https://github.com/odogono/mercenary/issues/618), 2026-09-29. This is R2 of the [integration report](mercenary-iii-integration.md), following the [taxi-journey report](mercenary-iii-taxi-journeys.md) (R1, #615). It extends the pinned **Mercenary III research baseline**, not Damocles **Working Authority**. It proposes no application, public API, Data Payload, Save format, `/dion` admission, glossary or architecture change. Original media, RAM, screenshots, audio and disassembly remain ignored Restricted Material under `restricted/mercenary-iii-618/`, following [ADR 0002](../adr/0002-separate-rom-research-from-implementation.md).

## Outcome

The two opening journeys need a **small, bounded body of content**. Every piece was found in the original program, and a reader for it was traced:

- **World.** Five underlying geometry records and four nonempty details across fifteen occupied cells (the original nine-record/eleven-cell shorthand is corrected by [#643](mercenary-iii-taxi-lettering.md#coverage-inventory-corrected-accounting)), with their ground records, scene palettes and building details. Only the cell the camera occupies draws structures; neighbouring cells contribute nothing. Everything beyond is sky/land fill, plus stars at night.
- **Residents.** The taxi model and its separate passenger form, two driver heads, the mailbox and letter outside the prison, the cobweb, and street furniture that each cell bind instantiates.
- **Panels.** TAXICARD panel artwork, its title and footer bands and its reveal. Four card strings and three destination labels. Two bitmap fonts and the cash, clock and navigation readouts.
- **Messages.** Sixty-four ID messages, the opening prison script `$19` and the trip scripts `$33`/`$34`. They share one message bar driven by a VBL display machine and a script interpreter that runs one opcode per main-loop frame.
- **Animation.** Height tables for set-down and lift-off, instant cardinal turns, and a driver head-turn animation that the scripts select.
- **Sound.** Ten PSG programmes and their triggers: key click, cell door, taxi set-down, lift-off, engine, leave, message tone, cell-crossing cut and reset. Nothing else sounds during the journeys.

Four findings change what implementation must reproduce, rather than merely filling in the inventory:

1. **The emulated field rate is 60 Hz, not 50.** Game time advances one second per 50 VBL, so in this baseline the elapsed clock, script waits and sound envelopes all run 1.2× faster than their constants suggest. Which rate the original intended is a **presentation-policy decision** that is still open.
2. **On the spaceport journey, the arrival message is refused.** The narrative is still on the bar when the taxi arrives, so "WE'VE ARRIVED" is suppressed and "PRESS 'B' TO BOARD THE SPACECRAFT" stays through exit. This is original behaviour, and a faithful message model must reproduce it.
3. **Night falls during the journeys.** It falls between VBL 17850 and 17900 in both runs, at a time that follows from the boot VBL and the player's X, not from the journey. Sky colour, window colour and stars all change.
4. **Only the occupied cell's structure is drawn.** This bounds world coverage to the cells the camera passes through. The empty taxi's circulation cells need no geometry, because the taxi is a resident, not structure.

The content and presentation gate is **evidenced**, with the explicit gaps listed [below](#defects-uncertainties-and-blockers). None of those gaps invalidates the milestone. The original follow-ups were the frame rate, building lettering, and exact rasterisation and projection. [ADR 0058](../adr/0058-run-mercenary-iii-at-50-hz-with-a-confirmed-fixed-frame-cadence.md) now settles timing, and [#643](mercenary-iii-taxi-lettering.md) recovers the bounded lettering, and [#644](mercenary-iii-taxi-projection.md) recovers projection, clipping, fill and face order.

## Baseline and capture conditions

The pins are R1's: STX SHA-256 `4e8b74122910bcaa109b944eebb6f0ec18fdeb1175c34eea3c932d0e1b18b62c`, EmuTOS `emutos206.img` `154803e3ff4851f3dc358b91b16d6b6110d187a81d8132ecb665af49878939d5`, and Hatari 2.6.1 Mach-O `05723606c75a1f0642395974abdce2cbbe48b0a09a747f65cdfca7ef9201e11a`. The [integration recipe](mercenary-iii-integration.md#cold-boot-and-controlled-probes) machine configuration is unchanged, and so is R1's journey input schedule:

| VBL | Input |
|---:|---|
| 6000 | Enter `$72` |
| 7300 | `*` `$66` |
| 10000 | Stick forward |
| 10650 | Stick released |
| 10700 | B `$30` |
| 11600 | `+` `$4E` (spaceport again at 11900) |
| 12200 | `*` Start |
| 22000 | L `$26` |

All three pins were verified before every run. Static slices are hashed from R1's loaded-play RAM, SHA-256 `94a107412037ce7972a605bfa1355e9fc9751373922df7fbd987d9ff94f1a8ec`.

This investigation adds three things to the recipe. Only the third changes emulator configuration.

- **Dense captures.** A screenshot every 50 VBL and a full RAM image every 200 VBL (and at every input VBL), from 5800 to 25000, for both routes. A capture precedes any input on the same VBL.
- **Tracing.** The debugger command `trace psg_write,video_vbl`, with `--trace-file`, is issued before the first breakpoint. Persistent `:trace :quiet` PC breakpoints log `e VBL` plus registers or small `savebin` windows.
- **Audio corroboration.** One solicitor run with `--sound 48000` in place of `--sound off`, a `--configfile` containing `[Sound]` `szYMCaptureFileName = <run>/capture.wav`, and `--cmd-fifo`. `hatari-shortcut recsound` is written to the FIFO as soon as it appears, and quitting finalises the file. Behaviour was checked unchanged: the solicitor endpoint `($09DF8080,$3F,$04308000)` with passenger `$0040` at 14000.

Endpoints in these runs reproduce R1 exactly:

| Journey | VBL | XYZ | Heading | Other |
|---|---:|---|---|---|
| Solicitor | 14000 | `($09DF8080,$3F,$04308000)` | `$0000` | cell `$60` |
| Spaceport | 19000 | `($09E18000,$3F,$042A8080)` | `$0300` | cell `$02` |

In both runs the passenger is cleared by 22600, cash stays `005100900000` throughout, and the card stays `$68050400`. Between otherwise identical cold boots, event VBLs shift by up to one main-loop frame (about 10 VBL). Treat the absolute VBLs below as ±12, and compare durations only within one run. The source of this jitter is unresolved.

**Field rate (demonstrated).** One frame is 133,604 CPU cycles, and `$FFFF820A` reads `$00` at 5900, 6000, 14000 and 19000. So this EmuTOS boot runs at 60 Hz, which is also what the Damocles lab found. The 383 s WAV covers about 23,000 VBL, which agrees. The game's clock constants (32/1600, giving 50 VBL per game second) therefore make the elapsed clock run 1.2× faster than wall time here. Durations below are given in VBL, never in seconds.

## Coverage inventory

**Required** means drawn, heard or read on a checkpointed view or transition. **Incidental** means present but not needed to explain the journeys. **Out of scope** is listed so that it is not mistaken for missing work. Addresses are hexadecimal, and ranges are half-open.

### World structure (static)

The workspace builder `$4F0F2` expands METIS (group 3, `$6FDE`) from its authored stream `$21410..$214D6` into five tables:

- the run grid `$1AAC0`
- selectors `$1B100`
- orientations `$4170`
- ground words `$1AEC0`
- the 256×4 cell workspace `$4CF0`: key byte, structure slot, dx, dz.

A static replay of the stream reproduces the live tables byte for byte. The stream ends exactly at the label table `$214D6`.

| Cell (X,Z) / code | Role | Structure slot → geometry | Scale | Scene palette | Building detail | Ground record | Street-furniture templates |
|---|---|---|---|---|---|---|---|
| (2,6) `$62` TIMEWARP PRISON | Opening room, doorway, taxi wait, boarding | 132 (`$18DDA`) | −3,−3 | 58 | 49 | `$1BFF0` | — |
| (1,6) `$61` | Both journeys | 146 (empty road cell) | 1,1 | 94 | 1 | `$200CA` | 373, 372, 370, 337 ×6 |
| (0,6) `$60` DOOBERRY'S SOLICITORS | Solicitor arrival and exit | alias 155 → 57 (`$11504`) | 2,2 | 66 | 56 | `$1FC42` | 331 ×2 |
| (0,5)–(0,2) | Spaceport route | alias 155 → 57 | 2,2 | 66 | 56 | `$1FEF4` | 333, 334 |
| (0,1), (4,0) | Spaceport route | alias 154 → 57 | 2,−2 | 66 | 56 | `$1FC42` | 331 ×2 |
| (1,1)–(3,1), (3,0) | Spaceport route | alias 149 → 65 (`$11F60`) | −2,2 | 46 | 59 | `$1FFAC` | 329, 330 |
| (4,1) | Spaceport route | 146 | 1,1 | 94 | 1 | `$201BA` | 9 entries |
| (2,0) `$02` METIS SPACEPORT | Spaceport arrival and exit | alias 62 → 150 (`$19D6A`) | 3,−3 | 155 | 36 | `$1B660` | — |

- The solicitor journey needs only the first three rows. The spaceport journey needs every row.
- The live cell word `$71F4` follows these cells in the dense captures. Cell (0,3) falls between 200-VBL samples and is implied by the route.
- The prison structure has nine regions:

  | Regions | Kind | Flags |
  |---|---|---|
  | 1 | Room | `$8000` |
  | 2 | Doorway | `$83FC` |
  | 3–5 | Street | `$D000` |
  | 6–9 | Street | `$C000` |

- The prison door is attachment `$42F0`. Its latch `$406C` reads `$42FF` (open) from 5800 to 10200, `$4201` at 10400, and `$4200` (closed) by 12400. [#645](mercenary-iii-prison-door.md) recovers the rule. The door is bound shut and opens when the opening script hands the player DOOR KEY A (object `$26`) inside its proximity box. It closes when the player walks out.

**Out of scope:** the cells the camera never occupies on these journeys: (4,2), (4,3), (3,3), (2,3), (1,3), (1,4), (1,5), (5,6), and every other group. The empty taxi's approach through them is a resident moving along its route (R1). It needs route data, not their structures. Label `$65` SITE OF OLD NIC is present in the table but unused.

### Residents and models

Models are read from a table at `$2EAB8` (pointed to by `$4BD10`): 388 self-relative **word** offsets. Most records are preceded by a 16-byte name. Per-resident arrays use a four-byte stride:

- position at `$581C`/`$5C1C`/`$601C` + 4·slot (so R1's `$585C` is slot 16)
- yaw byte at `$6C1C` + 4·slot, 256 steps per turn
- body and location bytes at `$681C` + 4·slot.

| Slot / model entry | Content | Class | Evidence |
|---|---|---|---|
| 16 / 318 TAXI `$2FA60` | Exterior: 32 vertices, x ±75, y 0..62, z ±150 | Required | Bound by initializer `$51BEE` because the METIS service definition `$41F18` has a negative rate (a non-negative rate would bind 319 BUS). Overlays match the approach frames |
| 16, passenger form `$2FBBC` | Cabin: roof, two pillars, dashboard, bonnet, drawn camera-relative at (0,−63,0) | Required | Model header op `$800D` switches to it when `4·slot == $6EB2`, then draws the driver, and skips the exterior. Drawn every frame from 10709 to 22001 (solicitor) / 22005 (spaceport) |
| 263 `$3772A`, 264 `$377CC` | Driver head, front and profile | Required | Chosen at `$544B0` from descriptor `$6ECE`/2 and the animation toggle `$6EA4` |
| 219 MAILBOX `$37304`, 220 MARGARET'S LETTER `$373D8` | The "post" seen through the doorway in front of the waiting taxi | Required | Nearest drawn candidate from 6800 to 10400 |
| 124 COBWEB (offset `$1F0`), 10 (offset `$28`, no model) | Prison interior. These are the failed-admission candidates R1 observed | Required for admission parity | Candidate recording `$545D2..$545EC` runs before the model test |
| 255 down to 247 | Street furniture: poles, lamp posts, panels (entries 329–373) | Required per occupied cell | Instantiated at each cell bind by ground op `$7xxx` (`$56340..$563C4`), Y = 0. For example, 9 slots at cell `$61` (13000) and 2 at `$60` (13600) |
| 13 TOURCRAFT | The craft named at the spaceport | Incidental: guidance only; boarding it is out of scope | In the fixed drawn list. Not confirmed on screen |
| 165 BLACK BEACON, 3 EAGLE NINE S E, 181 KEY | In the fixed drawn list `$7422` | Incidental | — |
| 17–27 | Buses | Out of scope | Service type byte 0 on METIS |

The drawn list is built at `$54182..$5430E`. It holds the cell-bound slots, then the fixed byte list at `$7422` (`0,220,219,181,165,16,13,3`, identical in every capture). Entries are sorted by a packed key: a priority byte from `$542BC` plus a log-domain distance.

**The plain sky/ground view at 10600–10700 is the player inside the taxi's volume.** At 10600 the taxi is 248 units behind the camera, so no exterior face is drawn. The taxi stays listed, which is why it remains the admission candidate.

### Panels, readouts and text

| Item | Source | Reader / trigger | Checkpoint |
|---|---|---|---|
| Inactive centre panel (Mercenary III logo) | Artwork table `$3BA00`, category 0/1 → `$3BA10` | Default before activation | 5800–6000 |
| TAXICARD definition | Record `68 05 04 00 0640 0760` in `$4D6EA..$4D80A` (36 × 8 bytes: item, category, band, 0, two colour words) | `$4D63C` copies the descriptor to `$6F0E`, colours to `$6F12`/`$6F14`, draws artwork via `$59C2C`, clicks via `$55B6A` | Enter consumed at 6008 |
| Card artwork, "TAXI CARD" title band, "- DESTINATION +" footer | Category 5 → `$3CE48`: 32 lines × 64 px, 4 planes, plus 1-bit strips at `base+$400+band·$14` | `$59C2C` sets reveal count `$53950` = 64 | 6050 shows the band |
| Reveal | VBL routine `$53956` | Scrolls the 64×31 centre up one line per VBL. First 32 VBL: old content out, black in. At count 32: palette swap. Last 32 VBL: new art in. At 0, category 5 dispatches text drawing (`$4DF34`) | Ends at 6072. A `*` during it is refused (`$4D848`, R1) |
| Card strings (2 × 10 characters, panel font) | `$4DEB4` OUT OF RANGE, `$4DEC8` PRESS * TO CALL, `$4DEDC` + SELECT - * TO START, then BUS PASS | Through pointer `$7104`; a zero byte shows OUT OF RANGE | Call 6072; passenger text 10706 (with admission `$51A3E`); call panel restored 22001/22005 (`$55770`) |
| Destination labels | `$214D6`: header "METIS     MOONBASE  ", then `[code][20 characters]`: `$65` SITE OF OLD NIC, `$62` TIMEWARP PRISON, `$60` DOOBERRYS SOLICITORS (`$21515`), `$02` METIS SPACEPORT (`$2152A`) | Lookup `$4DD24`; selection writes `$7104` | 11610 / 11910. Current-location updates in transit rewrite `$7104` but redraw only the bus pass, so the card keeps the chosen destination |
| Fonts | Panel `$3B381`+8·ASCII (inverted, drawn as AND masks by `$4ED8E`); message `$3B580`+8·ASCII; 5-row glyphs in 6-px cells | — | All panel frames |
| Cash `051,009,000.00` | BCD `$72DE`, 11 of 12 digits shown | `$4E778`, redrawn by `$4DDD0` only on change | Unchanged throughout |
| Elapsed clock HH-MM-SS | `$6FCE` | VBL handler `$531D2`; only changed digits redrawn | 25 → 00-00-25; 149 → 00-02-29; 405 → 00-06-45 |
| Location name "METIS" | `$796A`+2·`$713C` | `$4E1AE` | All frames |
| Grid readout X-Z | `$70C2`/`$70CA` | `$4E806` | 02-06 → 01-06 → 00-06; 02-00 |
| Height readout | Player Y `$714A` | `$4E4B2` | 000000 on the ground, 000001 in flight (formula plausible) |
| Compass strip / pitch meter | Heading `$7156` → bitmap `$66104` (64 steps); `$7154` → strip `$3B880` | `$53A2E`/`$53AB2` | Changes at each turn |
| "617-511", "+XXX XXX XXX" | `$70B4`/`$70B8` (×`$FA00`≫16); `$4E5B0` | — | Meaning unknown; static on these journeys |
| Inventory name "TAXICARD" | Item record, e.g. `$3AD60` | Head item `$563E` | Name scroll `$4E394` untested |

### Messages and scripts

**Text encoding.**

- Six-bit codes packed four per three bytes; character = code + 31; code 0 ends the text.
- Decoder `$52AC4` writes into buffer `$5292C`.
- `[` inserts a BCD number (`$6EAA`), `\` inserts " THE", and `]` inserts the player name (`$759A`).
- Tokens `^4`–`^9` expand to NEWSFLASH -, P C BIL, MERCENARY, MILLION, PRESIDENT and ELECTION; `^0`–`^3` are live numbers.
- Text shorter than 48 characters is centred.

**ID messages.** Table `$6FD44` holds 64 offsets. Each record is a header byte plus text; a nonzero header pads the text so it scrolls itself out. `$28` is WELCOME - PLEASE SELECT YOUR DESTINATION, `$25` is WE'VE ARRIVED, and `$32` is a blank.

**Display machine.** `$53420` runs every VBL.

- `$723A` is 1 when a message is requested, `$FFFF` while it runs, and 0 when idle.
- A message scrolls in 8 px per VBL for 37 VBL, then holds.
- Script text holds for `$6FF46` (usually 200 VBL; blanks 50) and stays until the next message.
- ID messages hold 200 VBL, then 50 more once the text runs out.
- While busy, the interpreter suspends, and `$55B00` **refuses** an ID message rather than queueing it.

**Script machine.**

- Program counter `$6EDA`, stack `$56D6`, wait counter `$7236` (unpaused VBL).
- Flags `$7270` (bit 6 = a script is active); availability bytes `$7352`; entry table `$6FDC4`.
- The low six bits of each byte are the opcode. The interpreter runs **one opcode per main-loop frame (about 8–12 VBL)**, which lengthens every scripted wait.
- Opcodes used by the bounded scripts:

  | Op | Meaning |
  |---|---|
  | `$02` / `$07` | Reset wait / wait until N |
  | `$03` / `$04` / `$05` | Jump / call / return |
  | `$10` / `$11` | Set / clear flag. Flag 13 marks blanks and stops the driver's "talking" (`$54F20`); clearing flag 6 ends the script |
  | `$14` | Message by ID |
  | `$19` | Two-byte store into the script bank: `0202` → hold `$6FF46`, `0206` → cabin animation `$6FF4A` |
  | `$20` | Record bit set (effect unknown) |
  | `$25` | Packed text |
  | `$00` | End |

- Opcode numbers overlap Damocles's for message, wait, flow, flags, random, key test and BCD add. MIII uses byte-wide opcodes and adds packed text.

**Opening script `$19`** (`$6FF57`, started at `$59FBA` around VBL 4745). Commit VBLs from the solicitor trace run:

| VBL | Message |
|---:|---|
| 5180 | MESSAGE FROM THE CHIEF PRISON OFFICER: |
| 5506 | YOUR SENTENCE WAS TO WAIT HERE FOR MERCENARY III |
| 5830 | CONGRATULATIONS ON YOUR PATIENCE - IT'S ARRIVED! |
| 6247 | YOU WILL NOW FIND THINGS SOMEWHAT DIFFERENT SO |
| 6453 | I HAVE ADDED TWO ITEMS TO YOUR POSSESSIONS |
| 6785 | QUITE ESSENTIAL - A BUS PASS AND A TAXICARD |
| 7253 | THERE HAS BEEN A CALL FOR YOU TODAY |
| 7462 | A MR P C BIL INVITES YOU TO CALL ON HIM . . |
| 7671 | HIS PERSONAL CRAFT AWAITS YOU AT THE SPACEPORT |
| 8089 | OH YES - THE LETTER OUTSIDE ARRIVED THIS MORNING |
| 8423 | GOOD LUCK - CALL A TAXI WHEN YOU'RE READY TO GO |
| 8824 | PRESS 'ENTER' KEY TO ACTIVATE YOUR TAXICARD |
| 9230 | PRESS * TO CALL TAXI - ON ARRIVAL 'B' TO BOARD |

Blanks separate some lines. The bar is idle from about 10178. The script runs on a fixed schedule regardless of player input: "PRESS 'ENTER' …" appears even though the card was activated at 6000.

**Journey messages.**

- WELCOME (`$28`) is accepted at 10706 in both runs.
- Trip scripts start at 12210.
  - `$34` (solicitor) shows 2 texts: 12367 DOOBERRY'S IT IS - AND THE GUVENOR IS PAYING, and 13095 HERE'S WISHING YOU THE VERY BEST OF LUCK.
  - `$33` (spaceport) shows 22 texts between 12306 and 17624. It includes WELL HERE WE ARE at 16219, about 1,470 VBL before arrival, and ends with PRESS 'B' TO BOARD THE SPACECRAFT.
- WE'VE ARRIVED (`$25`) is accepted at 13488 on the solicitor journey. On the spaceport journey it is **attempted at 17685 while the bar is busy, and refused**.
- L produces no message.

### Animation

- **Height** (`$51E24..$51F02`). Each service call writes the next byte of the current table into Y of all service residents 16–27, at `$51E9E`. The passenger's eye height is taxi Y + `$3F`: 63 on the ground, 88 in cruise and 108 at the peak.

  | Table | Heights | When |
  |---|---|---|
  | Descent `$51CA2` | 25, 20, 16, 13, 10, 7, 5, 3, 2, 1, then ten 0s, end | A segment change after a destination match (or after a call) sets counter `$6EB6` = 35 and selects it. It ends in dwell 2 |
  | Lift-off `$51CB7` | 5, 10, 20, 35, 45, 45, 40, 30, 20, 20, 22, 26, 25, end | Start sets the counter to 1, which selects it. Cruise then holds 25 while Start is set |

  | Event | Solicitor VBL | Spaceport VBL |
  |---|---:|---|
  | Set-down of the called empty taxi | 8562 (Y 20 at 8600, 0 at 8800) | 8562 |
  | Lift-off | 12216 | 12216 |
  | Arrival set-down | 13492 | 17688 |

- **Turns are instant.** Segment change `$51F40` sets heading `$6D20` outright: `$000` for −Z, `$100` for −X, `$200` for +Z, `$300` for +X. The passenger's heading `$7156` receives the same delta on the next frame (R1's `$5198A`). The solicitor journey turns once (13482). The spaceport journey turns at 13475, 14663, 16139, 16674, and 180° at 17677. At arrival, the view snaps to the next segment's direction before descending. Boarding snaps `$7156` from `$0400` to the taxi's `$0100`.
- **Speed.** Each service call moves 1024 units, so a cell (`$10000`) takes 64 calls. Calls per frame are (`$6EAE` & 7) + 1, from the route's upper nibble. When that is 0, the loop instead runs until `$71F6` is set. This is why the empty taxi covers several cells in 600 VBL out of view after the exit.
- **Driver head.** `$518AC` runs once per frame. It reads a count/toggle sequence selected by `$6FF4A`; a nonzero byte toggles `$6EA4` (profile) and a zero byte clears it.

  | Value | Address | Sequence (frames of about 12 VBL) | Used by |
  |---|---|---|---|
  | `$0407` | `$7014B` | `[1,8]` | `$33`, `$34` |
  | `$040A` | `$7014E` | `[3,5]` | `$33` |
  | `$0410` | `$70154` | `[1,7,5,7]` | `$33`, `$34` |
  | `$041A` | `$7015E` | `[3,5,5,5]` | Later scripts only |

  On the solicitor journey, `$0410` at 12348 gives profile over 12348–12434 and 12484–12561, and `$0407` at 13079 gives profile until 13167. These match the dense frames at 12400, 13000 and 13100. On the spaceport journey, seven loads between 12637 and 16748 are exactly script `$33`'s seven op-`$19` writes, in order.
- **Exit.** Clearing `$6EB2` restores the exterior path in the next frame, while the player's position and heading are retained. The empty taxi's Y jumps to 25 without the lift-off table, and it leaves along its route.

### Colour, sky and night

- The VBL routine `$53098` uploads a frame colour table at `$72B4`.
  - Outdoors, entry 8 is the sky (`$7324`), 16 the land (`$70B0`, `$411`) and 14 the road (`$222`).
  - In an enclosed region (flag bit 15 clear, as in prison region 1), entries 8 and 16 come from the structure's two scene colours, and only the plan is drawn.
  - `$8000|n` selects frame entry n; `$80xx` with bit 7 set reads the live scene palette at `$70A4..$70AA`.
- The day/night test `$50B10` has the same structure as Damocles's. It tests `$42C6C` = ((X high word ≫ 2) + METIS turn) & `$3FF`, where the turn advances by `$3B0` every VBL (`$53144`).
  - Day: sky `$355` and the palette's day half `$70AA`.
  - Night: sky `$011` and `$70A8`, with stars; building windows turn from black to white.
- **In both runs the sky darkens between 17850 and 17900.** That is on the spaceport journey near arrival, and during the solicitor dwell. The time is not a journey constant.

### Sound

The per-VBL handler `$530FC` calls the channel-B programme vector `$4BF54`, then the channel-C vector `$4BF58`, then the message tone `$53420` on channel A. Programmes are (count, value) byte or word pairs walked by `$4CB6C`/`$4CB54`: 0 ends a programme, and a negative count loops. This is the same two-vector arrangement as Damocles at the same bank base, but the shadows and programmes differ. Tone frequency is 125,000/P Hz.

| Sound | Channel | Content | Trigger / timing |
|---|---|---|---|
| Key click `$4C986` | B | 1302 Hz tone, envelope `$1F00` shape 9, decays in about 1 s | `$55B6A` from 31 callers. Enter 6000, `*` 7300, `+` 11600 (11900), Start 12200, L 22000 |
| Door moving `$4C7AA` | C | Tone alternating 125/119 Hz each VBL, plus noise; level programme 10…13…5, looping | Rising edge of door flag `$5B9C0`. Both intervals are the prison door (slot `$3FC`, [#645](mercenary-iii-prison-door.md)): 4986–5207 is its opening swing once the script gives the key, and 10317–10517 its closing swing as the player leaves the box |
| Door stop `$4C6E8` | C | Noise burst, 4 VBL | Falling edge of the same flag |
| Taxi set-down `$4C5A8` | C | Noise (period 7), swelling then fluttering to 0 over 55 VBL | First descent step, armed at `$51E84`: 8585 pick-up, 13499 solicitor, 17694 spaceport |
| Lift-off `$4C516` | C | Tone plus noise, level 2→13→9 over 41 VBL, then the engine | Armed at `$51E3E`, 12 VBL after the Start click |
| Engine `$4C682` | C | Level 10. Tone and noise track a slewed target ((`$6EAE`&7 ^ 7) + 4) ≪ 8, moving 8 per VBL | Whole ride. Solicitor: 75 Hz steady. Spaceport: 75/81/98/163 Hz as the speed class changes |
| Leave `$4C484` | C | Engine rule, level 7→12, then a 101-VBL fade, then off | Armed at `$55766` on a successful L |
| Message tone `$53420` | A | For VBLs 1–36 of each scroll-in, period = character × 4 at level 12 (0 on a space); silent hold after | Every message. About one character in four is skipped (observed; rule not decoded) |
| Cut `$56E86` | B, C | Levels zeroed for under a VBL | Each cell crossing aboard (`$56E14` from `$55EC4`) |
| Reset `$50E6A` | All | Registers 0–12 from `$50E9E` | Game start (about 4740) |

There is no sound for the TAXICARD reveal, the call itself (beyond the click), boarding, turns, footsteps or ambience. The WAV capture (60 Hz, 48 kHz) corroborates this. Audible energy appears at every event above. The dwell from 14500 to 21900 and the time after exit from 22300 to 22900 are digitally silent, and the waiting period from 9300 to 10200 is near-silent.

## Checkpoint comparison

"Dense" means the dense runs for both journeys; "trace" means the PC-breakpoint runs. Each check pairs a screenshot with a RAM state and a traced reader. What a check cannot establish is stated so that it is not over-read.

| Checkpoint (VBL) | Establishes | Cannot establish |
|---|---|---|
| Opening, 5800–6000 | Prison structure 132 in enclosed region 1 (scene colours, plan only); doorway view through region 2; logo panel; opening-script messages at traced commits; cell-door sound before input (the door opening once the key is given, [#645](mercenary-iii-prison-door.md)) | Why the opening script starts at about 4745 |
| Activation / reveal, 6000–6072 | Enter consumed at 6008; `$53950` 64→0; band visible at 6050; card text at 6072; click on channel B | Exact per-pixel reveal frame (the back buffer flips on main-loop frames) |
| Call and waiting taxi, 7300–10000 | Call flag; taxi arrives at (2,6); descent table from 8562 with its set-down sound; mailbox and letter in front of the taxi through the doorway | Exact rasterisation, and the approach order of other circulation |
| Approach, 10000–10650 | Player walks through the doorway and door region (door sound at 10317: the prison door closing, [#645](mercenary-iii-prison-door.md)) into the taxi volume, leaving a plain view; taxi remains the candidate | — |
| Cabin entry, 10700–10800 | Passenger form plus driver 263; WELCOME at 10706; card text switches on the same VBL; heading snaps to `$0100` | Admission geometry beyond R1 |
| Each selected destination, 11600 / 11900 | Label pointers `$21515` / `$2152A` drawn; click | — |
| Departure, 12200–12300 | Lift-off 12216 plus its sound, engine starting; trip script from 12210; height readout 000001 | Height readout formula (plausible only) |
| Turns and travel | Instant cardinal turns at traced VBLs; grid readout steps; per-cell street furniture; engine pitch follows the speed class; driver head sequences match the script's op-`$19` writes | Exact ST rasterisation (waived). Projection, clipping, cull and draw order are recovered by [#644](mercenary-iii-taxi-projection.md): F = 256, centre (160, 68), authored face order, far-to-near objects |
| Arrival with narrative active, 13488 / 17685 | Solicitor: WE'VE ARRIVED accepted. Spaceport: refused while `$33` holds the bar | Other message/arrival interleavings |
| Night, 17850–17900 | Sky, window colours and stars flip together | A fixed flip time (it depends on boot VBL and X) |
| On-foot exit, 22000–22600 | Passenger form stops after 22001/22005; call panel restored; leave sound; taxi departs at Y 25; endpoint retained | Sound in a PAL-rate run |

## Reproduction

These recipes extend the integration recipe. They do not depend on ignored helpers.

1. **Dense captures.** Use the taxi steps with L at 22000 for both routes. At every VBL from 5800 to 25000 in steps of 50, insert `screenshot <run>/vN.png`. On multiples of 200, and on every input VBL, also insert `savebin <run>/vN.ram 0 $100000`, placed before any same-VBL input. Allow up to 30 minutes.
2. **PSG timeline.** Add `trace psg_write,video_vbl` to the boot script before the first breakpoint, and `--trace-file <run>/trace.log` to the command line. `VBL N` lines in the trace match the debugger's VBL within a run. Group `ym write data reg=R val=V … pc=P` lines by VBL to reconstruct register state per VBL.
3. **Readers.** For persistent PC callbacks, add `b pc = $X :trace :quiet :file <cb.ini>` before `c`, with `e VBL` plus `r`, or a small `savebin`, in the callback. Useful entries:

   | Purpose | Entries |
   |---|---|
   | Message start and finish | `$55B00`, `$53420` |
   | Script start | `$55A1A` |
   | Card text | `$4DF04` |
   | Reveal | `$59C2C` |
   | Height write | `$51E9E` |
   | Turns | `$51F40` |
   | Heading follow | `$5198A` |
   | Cabin animation load | `$518B2` |
   | Sound arming | `$55B78`, `$51E3E`, `$51E84`, `$55766` |

4. **Audio.** Replace `--sound off` with `--sound 48000`. Put `[Sound]` and `szYMCaptureFileName = <abs>/capture.wav` in the config file. Add `--cmd-fifo <run>/cmd.fifo`, launch with `stdin` at `/dev/null`, and write `hatari-shortcut recsound` once the FIFO exists. Recording then covers VBL 0 to quit. Fold to mono and take RMS over 800-sample (one-VBL) windows. Recheck the solicitor endpoint at 14000.
5. **Static decodes.** Hash the slices below from the loaded RAM before decoding. Replay the METIS stream `$21410..$214D6` through the builder's grammar and compare it with the live `$1AAC0`, `$1B100`, `$4170`, `$1AEC0` and `$4CF0` tables in any dense capture.
6. **Visual checks.** Use the recovered projection in [#644](mercenary-iii-taxi-projection.md). That is a pinhole with focal 256, centre (160, 68), a 136-row viewport, screen right = −X, heading 0 facing −Z, yaw at a half step, and the eye at the player position. Compare with the screenshot at (+96, +58), doubled. This supersedes the earlier "focal about 256–281" overlays.

Keep images, audio and projected overlays restricted.

### Artifact identities

Paths are relative to ignored `restricted/mercenary-iii-618/runs/`. Reproduction depends on the pins and procedures above, not on these files.

| Artifact | SHA-256 |
|---|---|
| `dense-solicitor-qzs8e4mm/v6000.ram` | `2ee10f7e182745e29c7251ecdfce4087592bea7979942d50244f5235202f8e50` |
| `dense-solicitor-qzs8e4mm/v10800.ram` (cabin) | `a79e4e61990da8a439d1e2889c52b5c073d44ae39b4bac2d2e70c0cd4b9ed36c` |
| `dense-solicitor-qzs8e4mm/v12200.ram` | `f8666a32940a0ee2042b739f52990cb97ae85fc88deb953e7f365ad4646e427f` |
| `dense-solicitor-qzs8e4mm/v14000.ram` | `1ed34abc8dcd8fadf6fb17f0cdbee8479ad61bd241454942a3e10282fe7652aa` |
| `dense-solicitor-qzs8e4mm/v22000.ram` | `78947c5c481c3059881256d72e41a693cceef8229d16456500a6b03404ffe090` |
| `dense-solicitor-qzs8e4mm/v22600.ram` | `276c4ffc1d9ece2f17d700565a31e42f3be1e43e6e9f58da4704eadab71beb22` |
| `dense-spaceport-t68y49fv/v12200.ram` | `7e16e0cc9bdb52a858d95ce6032c77b422792be75e20d02c98e9d28fb7b8ad46` |
| `dense-spaceport-t68y49fv/v19000.ram` | `1a9828084602387f745f8ffcc14c2e682df613c2a5444a49842b221e52d13f60` |
| `dense-spaceport-t68y49fv/v22000.ram` | `ec71fc4e504bfb24b5f3203d58b78510b4bea1fc5d10e01e28ed2b7a31e3cc9c` |
| `dense-spaceport-t68y49fv/v22600.ram` | `c0fb0a6d6c9105cbb4010eff198495ac2a5af2bdd468bbdcb7e006d7cbda49a8` |
| `psg-solicitor-grzst7m4/trace.log` | `3c1c78de3ca8368709c3dec34e6770b9bbe35d53a8ffda68ee04f470285dafa0` |
| `psg-spaceport-4ccw5izi/trace.log` | `7bb7b1937391f94e6f538efed1950982baf38c0d39e2c8efdbacc42727c98f1d` |
| `wav-solicitor-qezw07yj/capture.wav` | `ce473cae1d83a3d2cfc1185978653900873fde946e4768b231181bf8a452c7cd` |
| `wav-solicitor-qezw07yj/v14000.ram` (sound-on endpoint) | `908bc49edd5b42b1877da1492f0e4fb64874e2cc6a378bf9fb7d397022ca42a4` |

### Inspected slices

From loaded RAM `94a10741…a8ec`. R1's slice hashes still apply to the ranges they name.

| Half-open range | Meaning | SHA-256 |
|---|---|---|
| `$4BD0C..$4BD2A` | Bank pointer table | `e677fd75aae7d1422bff58ac46abcd35dbd5f6764e2088f186e6c147bfa90667` |
| `$4F0F2..$4F30A` | Workspace builder | `f2a9092a6a6e35cdd32e4492f10e903ab0891035099e784d0eecde6e62298d1d` |
| `$21410..$214D6` | METIS authored stream | `f1e3a2561a55f1f42b2ecb1f48b33500d1e7f65b4655d547dddd3a72a03dbe64` |
| `$214D6..$2153F` | METIS label table | `885c4a0455d7dd087c87c56c98accbc85ff214594ecd64e5bd333f1a26d5fe59` |
| `$5600C..$56204` | Cell bind | `794d34a699c7eaab974a71c897233d53e4408d814c5a4d62eb27f0b01bec2f50` |
| `$56204..$563C4` | Ground record reader and templates | `a25c05fcee9344a96659c07b69e89f563bd7bf4b9996d4e00cbc4d0d7bbd0d85` |
| `$5AD2C..$5AE62` | Structure assembler | `dcc49ce5c59bf0b71f3c6929b780cd6d8d689e037a0d0a06024d438c1e1457e9` |
| `$5AE62..$5B2D2` | Attachments and region binder | `8d77b9000d308896337db12f20092cc58c4d9fd50b63d08109048c778b8049c2` |
| `$5B2D2..$5B4A2` | Region scanner | `67b02ebe608ad6cd5fe6846e20241aaac1b7a4a68cedc2a1ff27b11125097bf8` |
| `$54340..$5439E` | Plan/detail dispatch (occupied cell only) | `7604de54e586ab8dfbe2044197bb54e033d184a8cb224769bed8b93fc4d0f243` |
| `$5A578..$5A60E` | Frame colour setup | `29520258939134fb9145273c79b4281a6c9878c84662bcf04d6bc3fb28fe6dad` |
| `$50B10..$50B64` | Day/night test | `42c3dd432135c7891fa9067e78f95222b8ee686313b97a10f7026ab3e6f040aa` |
| `$53098..$53164` | VBL turn integration and palette upload | `d1a1b9060075bf1c012dac568ffd3c9197dea8d0dc244e2ec1b2b5ed522b2a93` |
| `$18DD2..$18F40` | Structure 132, prison | `ccdfbdeebc1f5cc89e370a585333cbfc59b9f7cc56aed1c98d7bc31b298d6cc5` |
| `$19D06..$19D2C` | Structure 146, road cell | `d7508d5188d5dba8576830313c3d995d76b777cfbb34774ace1de5a9e358b15e` |
| `$114FC..$116B0` | Structure 57 (via aliases 155/154) | `1b0f7ebfb444ce1d03eb00f7561ebc5e41edc87f29b32970f83c20a8b96d7d36` |
| `$11F58..$12462` | Structure 65 (via alias 149) | `b099cb3fbf07029281aa1c330e045059c541b5c5dcbad2de76dbc010e97e33c8` |
| `$19D62..$19E82` | Structure 150, spaceport | `328917df0b03a881a53282b1a9a5ac056970a52dc72fb882b2190d6687066cc0` |
| `$28924..$28C80` | Building detail 49, prison | `861a613756314a76e19411f8fc25fcc6dde931b006a3d9784c8a327814cb70d7` |
| `$29E60..$2A24C` | Building detail 56 | `7607e48515b416b021d5a1864a18538eaf8e5d0292352a9c0cbe5b23cf0b350d` |
| `$2A3D0..$2A808` | Building detail 59 | `c03df1bbeb159ff585148896936b7b728672787bf3a541990169a89237981f9b` |
| `$272C0..$275FE` | Building detail 36, spaceport | `939886897a9342e47355de0ef2c6baa3c7fea362e52cf6842c2daa07c9d36bfa` |
| `$2EAB8..$2EDC0` | Model table | `8aa06a4e99c7cfff54bf43ea7796ed0d98415adbc52a3c01867f308d41e2de4e` |
| `$2EA40..$2EAB8` | Model colour table | `b54024d3f8279bc648db0a540befed85cb1abed8c0eaa1895c13296e85679c4f` |
| `$2FA60..$2FC2C` | TAXI record and passenger form | `352f6299ad7bbb990a8e3c82454a1884ce4e429a1ab393be04a3c8afb225efe1` |
| `$3772A..$378A4` | Driver heads 263/264 | `cce90002cdc0b4b9a127c86d231cf21917566c0aa1f768e16077bc7910a2c050` |
| `$37304..$37412` | Mailbox and letter | `b5b69a8ae3a63dbea5612a2e7b93f31f17ac20a454aa72e7bb5265ec733fcf15` |
| `$54444..$544FC` | Passenger form and driver select | `95b99478356cc7a941a791b84d72cc5994a5a068d467870f281786ad6ae34a51` |
| `$545AE..$546F8` | Draw entry and header dispatch | `592ee4aba29f4285dc026793df0466992d57a7e72bd6290bc882ddeefb524e7e` |
| `$546F8..$549BA` | Vertex and primitive loop | `28d327e2d07e3f1680ddfc776f3452bd53c9d63874f35a2dd3f1ebe963081186` |
| `$54182..$5430E` | Drawn-list builder | `2f123f168720ded8e38eb47dd524c8bd257508c8574ded28293dfa21da473c46` |
| `$518AC..$518F0` | Cabin animation reader | `1680cadbcf9dd50af0b9a2165fde2a1542944da0bf1edb4c6f4ef923552caa34` |
| `$70148..$70164` | Head-turn sequences | `178bdb298988374d42c6a83f093e3e2d9508e847b777263ac99d042e86e2b815` |
| `$51CA2..$51CDA` | Height tables | `43c569b9d7c990bb58f7765aa315f488e7a5119960597f0b16b8624c774e5f52` |
| `$51E24..$51F02` | Height and dwell | `9e645445261a19b119ade3841621778e5198c94037c0a7c439759a966600b24c` |
| `$51F40..$52030` | Segment change and heading | `cd79fbdcb798d1f51c5b395d89a8b91dac7d7ddf28e99fa6c61dae8c59a9b419` |
| `$4D6EA..$4D80A` | Panel definitions | `9ce30410810ee51f44eb36be6d515ab26f0c7da066248c73041824d4bde6c70c` |
| `$59C2C..$59CAC` | Artwork select and bands | `c77da75667de7f0dca2ad8b183eb3a8a3eea5b6e1c1f16a9a93af193ceef96ee` |
| `$53956..$53A22` | Reveal | `33dd8687943136d4df46438dc40e2f8a1022e12d94db03fe063245bf962e3591` |
| `$3CE48..$3D338` | Category 5 artwork | `8efc78cfe042286f5b9bf1c92a671c6d94c56cf3ebdbc1ba31e196876c16b8fd` |
| `$3BA10..$3BE10` | Logo artwork | `74b7d1e3dc90fde817b537a4fd437c3cb3edbf120df4ef22453858f869efb02e` |
| `$4DEB4..$4DF04` | Card strings | `ac153bb9a11b6b3c4f3d1221c3b51d44f8643f8e1f577c6bd62c6d1999bb2d2d` |
| `$3B381..$3B880` | Panel and message fonts | `cd788e137e5306cd6599627adfb3a4b70a9edd2f857bd702e50c079d4eba0dac` |
| `$5319C..$53294` | Clock and digit renderer | `eb4cb41e4de74140c03e70f6d51b6db1e1c062bd546e1350743af437e1e303a8` |
| `$52860..$528F6` | Script fetch and dispatch | `6da13a9efa19ed8b3d1ed9dfe7f153c8657de7949e2961b212d3de32747137e5` |
| `$528F6..$53002` | Opcode handlers and text decoder | `7dde6a1ea9932b1b605080933098d5bdc9c7f9ebe936465e5ed137f5f734ea74` |
| `$533DE..$536DA` | Message display machine | `c2cf590d1240f62da220341cc75df4ae1be461065b8472253be8266a285b066e` |
| `$55A0E..$55B9E` | Script start and ID-message helpers | `1e2943d03ce0c8a95b15fe97aa8f7b46ee3b72d1995f18184c809004b1de584a` |
| `$6FD44..$6FF54` | Message and script tables | `5e2060c31662ac252075a59cf31ba2106ce1aab7948f85c8769ff946a1f7d43b` |
| `$6FF57..$7014B` | Opening script `$19` | `932993c9afa69800f23f001efbb7a76c70f4e361b65c0d7b599129e720250165` |
| `$76721..$76BCA` | ID message texts | `8d16c237144f8f98cef86f4cc5a0df5d0aa40724c5e9a9c3ba371ad7dc4cda32` |
| `$4BF5C..$4C480`, `$4C482..$4CB8E` | Sound bank (slew word `$4C480` excluded) | `e1c3ddeab11322708bfc79338536acc157a504b607a923948ad7c2421ec31217`, `8937613ec1cc53f6952d83bd0bf23bba29b83436bcedcd3fe4f25a1966ca4d8f` |
| `$530FC..$5310C` | Sound dispatch in VBL | `42b0b5b4daa26e2739cc52c76d34ced33c2a5cb3c626544e743b818721f7da32` |
| `$55B6A..$55B9E` | Key click | `7488585d7be37c014a195105e073ab3cc36d25ccd0fafc857dbde7ea89e2ee37` |
| `$5B9C4..$5BA24` | Door edge detector | `e86d13b42525cec09e0177968172695e6504c6a50b5f9262796ede3b5208a857` |
| `$56E14..$56ED0` | Cell-crossing cut | `34ba4985025e46d428c895e0be009ca55b31cb3e0b2974b1caa0f9df72f02de6` |

## Defects, uncertainties and blockers

Items marked **decision** need a presentation-policy choice before implementation. The others name the probe that would close them.

- **Frame rate: decision.** This baseline runs at 60 Hz while the game counts 50 VBL per second. Options are:
  - reproduce baseline VBL timing, with a 1.2× fast clock at 60 Hz
  - rerun the evidence at PAL 50 Hz, by poking `$FFFF820A` ← `$02` over the FIFO as the Damocles lab does, and adopt that
  - treat game time as authoritative and scale.

  Recommended probe: repeat both journeys with the PAL poke and compare every event interval listed here. The event *order* is unaffected; the durations are what change. Also needed: a decision on whether the browser main-loop frame (which paces scripts, the cabin animation and service calls) is emulated.
- **Frame cadence.** Main-loop frames of 10–12 VBL pace the script interpreter, the cabin animation and the service updates. The distribution depends on scene cost (R1 cadence note). A browser without an ST rasteriser cost needs an explicit **decision**: a fixed frame cadence or a measured one.
- **Building lettering — recovered by [#643](mercenary-iii-taxi-lettering.md).** MIII token table `$B230` and vector font table `$3E000` resolve the six records in details 56/59. `$9D` is blank throughout the occupied slice; `$89` is blank except at `(3,0)`, where detail 59 draws two synchronized font-5 FLY/aircraft/KAOS signs from a 19-frame animation. The report records source hashes, signed placement rules, live pointer captures, cell mapping, a portable bounded extractor and deterministic comparison requirements. Browser implementation/comparison remains I1/I2 work; no Damocles lettering or font is borrowed.
- **Projection and rasteriser — recovered by [#644](mercenary-iii-taxi-projection.md).** The projection is `sx = 160 − 256·u/d`, `sy = 68 + 256·v/d` on the level camera, and a float model matches 7,172 logged coordinates within 0.71 px. Clipping is homogeneous at depth 0⁺ plus a half-pixel screen rectangle, within 0.87 px on 715 polygons. Model faces are culled clockwise-only on integer coordinates. Each model draws one viewer-selected face list in authored order. Objects are painted far to near, and region occupants are drawn at plan/detail queue hooks. Remaining raster residues are horizontal-edge rows, zero-area slivers and lines. Exact ST rasterisation is not required for the milestone.
- **Prison door — recovered by [#645](mercenary-iii-prison-door.md).** The door is bound shut at game start. It opens over 143 substeps once script op `$20` sets DOOR KEY A's held bit while the player stands in the proximity box, and it closes over 143 substeps when they leave the box. Both door-moving sounds are this door. Without the key, the doorway region is never selectable and contact shows LOCKED.
- **Night flip.** The formula is decoded, but the flip VBL depends on boot phase and X. Probe: capture every VBL from 17850 to 17900 against `$42C6C`. The star pass `$50B66` and the horizon/island pass `$571A8` are Damocles analogues; decode them for MIII before drawing night skies.
- **Unknown fields.** Also unknown:
  - the meaning of `$7272` (driver-selection branch; always negative here)
  - handler side effects `$6DA0(a0)`→`$B346` and `$543B0`=2
  - the "617-511" and "+XXX" readouts (writers `$4EF38`/`$4EFC2`)
  - script op `$20`: decoded by [#645](mercenary-iii-prison-door.md#binding-and-the-key). It sets or clears a bit of an object's state byte; `$641E+$98` is DOOR KEY A's
  - the message-tone character-skip rule
  - the source of cold-boot jitter.

  None changes what is drawn on these journeys.
- **Unconfirmed content.** It is unconfirmed whether TOURCRAFT (slot 13) appears on screen at the spaceport. The small blue crescent in cabin frames is not a resident model; it is probably a sky body. Neither is required for the milestone; confirm both before claiming the spaceport arrival view complete.
- **Extraction defects.** The world renders close the prison door where captures show it open: the latch state was not applied. Resolved by [#645](mercenary-iii-prison-door.md): drawing the leaves from the live edges (±142 at latch `$FF`) matches the capture. Region index `$7194` is sometimes stale in captures taken aboard. Probe: log the region commit `$5B388` from 12200 to 18000.
- **Browser accommodations: decisions, not findings.** No accommodation is proposed here. Two candidates need an explicit choice: showing the refused spaceport arrival message anyway, and softening the instant 90°/180° turns. The original does neither.

**No blocker requires deferring the milestone.** The frame-rate decision should be made before any timed acceptance test is written.

## Refined acceptance criteria and handoffs

Observable content and presentation criteria for a later approved implementation:

1. **Opening.** Draw the prison as an enclosed region using its scene colours, with the doorway view showing the street and mailbox. Show the opening-script messages in order at their relative timings, and show the logo panel until activation.
2. **Card.** Activation clicks, runs the 64-VBL two-phase reveal, and refuses panel input throughout it. The card then shows PRESS * TO CALL. Passenger admission switches the card to + SELECT - * TO START on the same update as WELCOME. Selection shows the chosen label, and that label persists through travel. Exit restores the call text.
3. **Taxi.** After a call, the taxi descends by the descent table with the set-down sound and waits at dwell. The exterior is drawn from outside; the plain view appears when inside its volume. Once aboard, the passenger form and driver replace the exterior.
4. **Ride.** Eye height follows the lift-off table and then cruise. Turns are instant cardinal snaps. The grid readout steps. Each occupied cell's structure, ground and street furniture are drawn, and nothing from neighbouring cells. Engine pitch follows the route speed class. The driver head follows the script-selected sequences.
5. **Messages.** Use one message bar with the busy gate. A refused ID message is dropped, not queued, and this is tested by the spaceport arrival. Scripts suspend while the bar is busy.
6. **Night.** Sky, windows and stars change together at the decoded turn test. Tests assert the rule, not a fixed VBL.
7. **Sound.** The ten programmes, their triggers and their channel assignment, as listed above. No reveal, boarding, turn or footstep sounds.
8. **Evidence.** A browser comparison must use the same checkpoints and state what each cannot establish. Screenshots alone are insufficient.
9. **Projection and order ([#644](mercenary-iii-taxi-projection.md)).** Project with focal 256 at (160, 68) in the 136-row view, clip at depth 0⁺ and the half-pixel rectangle, and cull model faces clockwise-only. Draw each model's viewer-selected face list in authored order, and paint objects far to near with the structure's region-flag order and its occupant hooks. Geometry must agree within one pixel of the game's clipped outlines. Horizontal-edge rows, zero-area slivers and lines are raster residues, not parity claims.

**R3, persistence ([#619](https://github.com/odogono/mercenary/issues/619)).** Add these presentation states to the restore-future comparison:

- reveal count and palette phase
- message machine state: `$723A`, scroll/hold counters, current text pointer
- script PC, stack and wait
- cabin animation pointer/count/toggle (`$6EA2`/`$6EA4`/`$6EA6`) and the pending `$6FF4A`
- height-table pointer `$51CDA`
- the sound programme walkers and engine slew value `$4C480`
- the METIS turn accumulator (for night)
- the door latch `$406C`, with the leaf edges and the key bit `$64B6`. These are saved state in the prison cell until the close completes ([#645](mercenary-iii-prison-door.md)).

Restore cases should include mid-reveal, mid-message-scroll, a script waiting while the bar is busy, mid-lift-off, and arrival while the spaceport narrative holds the bar. Whether sound state needs restoring or can restart is an R3 decision.

**R4 / [#419](https://github.com/odogono/mercenary/issues/419).** Record these sibling-engine similarities for comparison, not reuse:

- the word-offset model table (Damocles uses longs)
- the two-vector sound driver at the same bank base
- the matching day/night test
- the matching cell-stream template operation
- overlapping script opcode numbers.

Each still needs a bounded comparison before any shared mechanism. None establishes shared content. The passenger form is a distinct model-header path, so it is not a craft "aboard" view.

**Milestone review.** R2 content is bounded, with a source for every required item. The review should settle the frame-rate and frame-cadence decisions, and accept or commission the building-lettering and projection probes. The [lettering follow-up](mercenary-iii-taxi-lettering.md) closes the token/font research gap and corrects the occupied-cell count to fifteen. It should also confirm that the empty taxi's out-of-view batched circulation is acceptable as route simulation without drawing unoccupied cells.
