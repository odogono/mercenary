# Targ Benson Scripts: a survey for the Talk Script ports

Survey, 2026-10-19. [ADR 0080](../adr/0080-run-targs-scripts-as-talk-scripts.md) ports Targ's Benson Scripts to Talk Scripts one at a time, in order of how long each holds the Benson Display. Benson Script 0, the opening, is done ([#844](https://github.com/odogono/mercenary/issues/844)). This survey covers the other 50: what starts each one, how long it holds the display, what it changes in the world, which other scripts it is coupled to, and what the Talk Script host still lacks to port it. It ends with a port order in batches, one PR each.

Porting script 0 showed why this is needed. Its spike draft read as the behaviour but missed two things only the code showed: it arms objects that start other Benson Scripts, and it sets an engine flag that a later script reads ([the opening's appendix entry](targ-talk-scripts.md#appendix-what-the-benson-originals-do)). Everything below is read from the decoded program, not from the drafts.

## Method

- **Code.** Each script's reachable instructions were walked from its entry in [`payload/benson.json`](../../web/test/oracle/benson.json), following jumps, branches and calls, and read with [`machine.ts`](../../web/test/oracle/machine.ts) semantics. Instruction numbers below are indices into that document's `instructions`. As the [Talk Script spike](targ-talk-scripts.md#appendix-what-the-benson-originals-do) found, a test op answers its negative ("flag clear", "not carried", "not in this Room") and branches when that answer equals `branchOn`.
- **Triggers.** Every way the Gameplay Session starts a Benson Script: a Room's `entry.script` in [`payload/rooms.json`](../../payload/rooms.json); boarding or taking an object whose description selector is a script (bit 4 of its flags, [`interaction/index.ts`](../../web/src/interaction/index.ts) `description`), which starts the script with the object's slot as its id; and the combat rules in [`payload/endgame.json`](../../payload/endgame.json): `siteDestruction.reactions` (Faction Reactions), `siteDestruction.factionObjective` (the Gratitude Threshold) and `objectHits.secondTargetScript`. No Benson Script starts another.
- **Display hold.** Each script was run alone in a `BensonSession` at the default settings (`scripts.timeScale` 6, a 3 s message hold), timing until engine flag 64 (script running) clears. One line, the blank line included, takes about 3.9 s. A tick is 1 s of the Reference Build's clock and 1/6 s at the default time scale. The probe that did this was throwaway and isn't kept; the facts it read are all in the payload.

Benson ends a script's hold by clearing engine flag 64 (`clrf 64`), not by `ret`. While flag 64 is set, Benson refuses to start any other Benson Script and no Talk Script line starts (`TalkHost.settleDisplay`). A script that clears it and keeps running holds nothing, but any Benson Script that starts afterwards replaces it.

## The script table

51 ids share 46 entries. Ids 8 and 29 share entry 132. Ids 21, 30, 31, 32 and 33 share entry 0: `msg "CRASH"`, `clrf 64`, `ret`, apparently the table's filler. Nothing in the payload starts them. No Room names them, and no object in slot 21 or 30–33 has bit 4, nor does any script set it. They need no port.

| Id | Entry | What it is | Started by | Display hold at default settings |
| --: | --: | --- | --- | --- |
| 1 | 77 | The Dart's own script | Boarding the Dart (slot 1) | None: clears flag 64 at once, then spins for good |
| 2 | 261 | Ship hire, in the communication room | Entering Room 16 | 11.6 s without the Antenna; with it, six to eight lines around a 5-tick prompt |
| 3–6, 9, 14–19 | 352… | Palyar colony craft deliveries | Entering their Rooms | 7.7 s; **until the object is dropped or the player leaves**, while carrying it |
| 7 | 411 | The Escape | Boarding the Interstellar Ship (slot 7) | **While aboard off the surface, then until Y or leaving the ship**; for good after the Escape |
| 8, 29 | 132 | Bank | Entering Room 42, 79 or 159 | 11.8 s |
| 10 | 480 | Palyar gratitude | The Gratitude Threshold, Palyar thanking | 27.2 s |
| 11 | 377 | Prison | Entering Room 81 | 4.0 s |
| 12 | 125 | The captured Mechanoid objects | Taking the Mechanoid (slot 12) | 15.6 s |
| 13 | 243 | Mechanoid briefing | Entering Room 102 | 50.2 s if the player stays |
| 20, 22–25 | 327… | Mechanoid complex deliveries | Entering their Rooms | 15.5 s while the Mechanoid is away; otherwise as the Palyar deliveries |
| 26 | 472 | Mechanoid gratitude | The Gratitude Threshold, Mechanoids thanking | 23.3 s |
| 27 | 186 | The brother-in-law's new ship shot down | The second `objectHits` target (slot 0) | 23.2 s |
| 28 | 218 | Palyar briefing | Entering Room 41 | 69.5 s if the player stays |
| 34, 35 | 212, 215 | Generic Faction Reactions | Destroying a Palyar or Mechanoid installation (Site low id 2 or 3) | 7.7 s with the ship (81 in 256), otherwise none |
| 36–48 | 138… | Named Sites' Faction Reactions | Destroying that Site (low ids 4–16) | 11.6–23.2 s |
| 49, 50 | 192, 197 | `TRAITOR,` / `GOOD SHOW,` | Destroying a Site with low id 17 or 18 | 7.9 s |

The payload's initial `stateFlags` already set bit 4 on slots 1, 7 and 12 ([`objects.json`](../../payload/objects.json): 36, 36 and 4). Script 0 sets it again (instructions 4–8), and the ported opening keeps doing so.

## Engine flags

Bits 0x40 (script running) and 0x80 (input detected) belong to the engine. The scripts use the rest:

| Bit | Talk name | Set by | Cleared by | Read by |
| --: | --- | --- | --- | --- |
| 1 | `dartBought` | 0 (Y to the Dart), **2 (Y to the hire)** | **2 (no answer to the hire)** | 1, 2 |
| 2 | `gratitudeGiven` | 10, 26 | — | 10, 26 |
| 4 | `shipHired` | 2 | — | 7 |
| 8 | — | 37 (the author's advert destroyed) | — | Nothing: no script, and no native code (`BENSON_FLAGS` in the Reference Disassembly) |
| 32 | `commanderAnnoyed` | 1, 27, 46 | — | 7 |

Bit 1 is the coupling that matters. Script 2's yes/no subroutine (110–116) stores the answer in bit 1, the same bit script 0 uses for "bought the Dart". Answering the hire prompt overwrites it both ways. A player who bought the Dart, then let the hire prompt time out before first boarding the Dart, is scolded as if they had taken it unpaid (script 1, 80). One who never bought it but said Y to the hire is greeted with the job offer. Script 1 runs only at the first boarding (see below), so the quirk needs that order. While script 2 is unported, the ported opening's `dartBought` is still bit 1, so the quirk is still in the game.

## The scripts

### Script 1: the Dart's own script

77–94, subroutines 105 (wait 15 ticks), 117 (the job offer), 461 (Palyar ship attacking).

- Disarms the Dart at once: `modf and 243` on slot 1 clears bits 4 and 8, so it never runs again and the Dart has no description. Then clears flag 64, holding nothing.
- Without bit 1, plays `THIS CRAFT BELONGED TO / THE PALYAR COMMANDER'S / BROTHER-IN-LAW / HE IS NOT TOO PLEASED`, sets bit 32, plays `PALYAR SHIP ATTACKING` and sets the Attack State, then a blank line.
- With bit 1, waits 15 ticks, then shows the job offer (`MESSAGE FROM PALYARS / - - - JOB OFFER - - - / FOR MORE INFORMATION / GO TO THE BRIEFING ROOM / IN COMPLEX AT LOC O9-O6 / MESSAGE ENDS` and a blank) when a `rand 80` passes (81 in 256) or the player is off the surface. Otherwise it waits another 15 ticks.
- Both paths end in `jmp 94`, spinning for good. Because flag 64 is clear, the next Benson Script to start replaces it. Entering any Room with an entry script before the roll passes loses the job offer.
- **Port needs:** a `world` command to disarm an object (clear bits 4 and 8), or the Talk Script simply not answering a second `boarded`. A port can't lose the job offer to an unrelated Room, so it is a deliberate departure, like ADR 0080's queued Faction Reactions.

### Script 2: ship hire

261–296, subroutine 110 (yes/no: Y within 5 ticks sets bit 1, else clears it).

- The Antenna (slot 30) must be carried or lying in Room 16; otherwise `COMMUNICATION ROOM / NOT WORKING` and a blank.
- Otherwise `MESSAGE FROM / HERTZ SPACESHIP RENTAL / SHIP FOR HIRE 999999 CR`, clears the key latch, then prompts `DO YOU WANT TO HIRE?`.
- No: `OK PLEASE CALL AGAIN / MESSAGE ENDS` and a blank. Y with under 1,000,000 credits (the top byte pair of decimal 8 is 0): `INSUFFICIENT FUNDS / YOU HAVE n CREDITS / MESSAGE ENDS`. Y with enough: adds 99,000,001 (that is, subtracts 999,999 modulo 10⁸), `SHIP DESPATCHED / IT WILL LAND / AT LOC 8-8 IN 2 MINS`, writes `shipInbound` 255 (the Ship Delivery starts) and sets bit 4.
- The hire needs a million credits for a 999,999 price. The success path ends without the blank line the others play.
- **Port needs:** an object-in-Room query (`inrm`), a command that starts the Ship Delivery, a credits change that adds, and the room name. The prompt and `shipHired` exist. Bit 1 is the coupling above; the port should decide whether to keep it.

### Deliveries: scripts 3–6, 9, 14–19 and 20, 22–25

Each loads an object slot into register 14, a Room into 15 and a reward into decimal 9, plays the Room's name, then runs the shared body at 381–397. The Mechanoid complex's five go through 398–410 first.

| Script | Room | Object | Reward |
| --: | --- | --- | --: |
| 3 | 136 `ENGINE ROOM` | 29 Neutron Fuel | 200,000 |
| 4 | 155 `CONFERENCE ROOM` | 42 Essential 12939 Supply | 50,000 |
| 5 | 162 `EXCHEQUER` | 38 Gold | 100,000 |
| 6 | 163 `KITCHEN` | 44 Catering Provisions | 60,000 |
| 9 | 165 `INFIRMARY` | 41 Medical Supplies | 40,000 |
| 14 | 173 `POWER ROOM` | 31 Energy Crystal | 100,000 |
| 15 | 147 `STORES` | 34 Large Box | 35,000 |
| 16 | 146 `ARMOURY` | 35 Useful Armament | 65,000 |
| 17 | 144 `LABORATORY` | 43 Winchester | 100,000 |
| 18 | 170 `CONTROL ROOM` | 45 Databank | 100,000 |
| 19 | 154 `INTERVIEW ROOM` | 12 the captured Mechanoid | 250,000 |
| 20 | 70 `MECHANOID FUEL STORES` | 29 Neutron Fuel | 250,000 |
| 22 | 50 `MECHANOID POWER ROOM` | 31 Energy Crystal | 100,000 |
| 23 | 48 `MECHANOID STORES` | 34 Large Box | 80,000 |
| 24 | 34 `MECHANOID ARMOURY` | 35 Useful Armament | 120,000 |
| 25 | 18 `MECHANOID LABORATORY` | 43 Winchester | 250,000 |

- An object already delivered (bit 1) gets nothing. One that is carried, or already lying in the Room, gets `PLEASE LEAVE / <object> / HERE FOR n REWARD`. The object's name is message `r14`, the slot's own text.
- Then the script **spins with flag 64 set** until the object lies in the Room (paid) or the player leaves (a blank, nothing paid). This is the longest bounded-by-the-player hold after the Escape: it lasts as long as the player stands there holding it.
- Paying sets bits 1 and 16 (delivered, fixed in place), adds decimal 9 to the credits, then plays `n CREDITS PAID / YOU HAVE n CREDITS` and a blank.
- The Mechanoid complex's Rooms first check the captured Mechanoid (slot 12) is in Room 102. If not, they play `THE MECHANOIDS SAY / PUT BACK OUR LEADER` and a blank instead.
- **Couplings:**
  - The Palyar and Mechanoid Rooms want four of the same objects, and bit 1 is shared, so each object pays once, to whichever side gets it first.
  - Delivering the Mechanoid to the Interview Room (19) fixes it there and closes the Mechanoid complex's deliveries for the rest of the game.
- **Port needs:** an object-in-Room query, a command marking an object delivered (bits 1 and 16) and a query for it, a credits change that adds, and names for 16 Rooms and 11 objects. All 16 fit one Talk Script with a table.

### Script 7: the Escape

411–460, recorded in the [spike appendix](targ-talk-scripts.md#appendix-what-the-benson-originals-do).

- Plays `INTERSTELLAR SHIP`, then spins while the player is aboard and off the surface. The ship starts in the hangar, Room 5, so this holds the display for the whole drive out.
- On the surface, after a 1-tick pause:
  - Without the hire (bit 4) or the Novadrive (slot 25): `NOVADRIVE REQUIRED` and a blank.
  - Otherwise clears the key latch and prompts `PRESS Y TO LAUNCH`, spinning until Y or until the player leaves the ship (a blank).
- After Y it checks the surface and the Novadrive again. If either is missing, it goes back to the top and waits again, without replaying the first line.
- With block 50 destroyed: `THE AUTHOR WON'T LET / YOU LEAVE UNTIL YOU / FIX HIS ADVERT` and a blank.
- Otherwise:
  1. Writes the Ending Phase as 1, waits 2 ticks and sets the message interval to 150.
  2. Plays the congratulations and a blank.
  3. With bit 32, plays `THE PALYAR COMMANDER'S / BROTHER-IN-LAW / IS PLEASED YOU,VE GONE` and a blank. The comma is the original's.
  4. Plays the sign-off, then `GAME OVER` every 15 ticks for good, silencing voices 1 and 2 each time.
- It never clears flag 64 after the Escape.
- **Port needs:** nothing new. `escape`, `advertIntact`, `setMessageInterval`, `carries`, `flag`, `boarded`, `here` and `sound silence` all exist.

### Scripts 8 and 29: bank

A 1-tick pause, then `BANK / YOU HAVE n CREDITS` and a blank. Rooms 42 and 79 start 8; Room 159 starts 29. **Port needs:** Room names only.

### Scripts 10 and 26: gratitude

Started in place of a Faction Reaction when a faction's lead reaches the Gratitude Threshold ([`sites.ts`](../../web/src/session/sites.ts)). Both do nothing if bit 2 is set; otherwise both play `MESSAGE FROM PALYARS` (10) or `MESSAGE FROM MECHANOIDS` (26), then `WE ARE MOST PLEASED / YOU HAVE DESTROYED ALL / KEY OPPOSITION SITES`, and set bit 2.

- **26** then plays `MESSAGE ENDS` and a blank. It gives no reward.
- **10** pays 500,000:
  - If the Pass (slot 46) is still in Room 80, plays `YOU WILL FIND A REWARD / INSIDE THE RED HANGER` (sic), moves the Pass to Room 1 and plays `MESSAGE ENDS`.
  - Otherwise pays the credits at once through the delivery tail (392–397): `500000 CREDITS PAID / YOU HAVE n CREDITS`.
  - The hint path ends without a blank line.
- **Port needs:** the `gratitude` World Event and `gratitudeGiven` exist. 10 also needs an object-in-Room query, a command moving an object to a Room, and a credits change that adds.

### Script 11: prison

A 1-tick pause, then `PRISON`, with no blank line. It only shows a line. ADR 0080 keeps message-only Rooms in the engine's data, so this could become Room 81's entry message instead of a Talk Script, but that changes the payload, which ADR 0015 re-extracts.

### Script 12: the captured Mechanoid

A 1-tick pause, then `MECHANOID / THE MECHANOID DEMANDS / THAT YOU PUT HIM DOWN` and a blank. It runs at every take, since nothing clears bit 4 on slot 12. Once delivered to the Interview Room, the Mechanoid is fixed and can't be taken.

**Port needs:** the `took` World Event exists. [`names.ts`](../../web/src/talk/names.ts) calls slot 12 `colony craft`, but slot 12 is the captured Mechanoid ([object census](../object-locations.md)) and the Colony Craft is slot 63. The ported opening arms the right slot under the wrong name, so the port should rename it.

### Scripts 13 and 28: the briefings

Each has a 1-tick pause, then the briefing in paragraphs, each followed by a blank line. Before each later paragraph the script checks the player is still in the Room (102 or 41) and stops if not. 13 checks once; 28 checks three times. **Port needs:** nothing new. The spike drafted 13 (below).

### Script 27: the brother-in-law's new ship

Started when the Player Projectile hits `objectHits.targetSlots[1]`, slot 0. Hitting the first target, the hostile craft in slot 15, shows message 49 instead and starts no script. It plays `YOU HAVE JUST DESTROYED / THE PALYAR COMMANDER'S / BROTHER-IN-LAWS / NEW SHIP`, sets bit 32, then plays `PALYAR SHIP ATTACKING`, sets the Attack State and plays a blank.

**Port needs:** a World Event for the hit. No current event covers a Player Projectile striking an object (`hit` is the Hostile Projectile reaching the player). ADR 0080 lets the set grow when a Talk Script needs it.

### Scripts 34–50: Faction Reactions

- **34 and 35**, the generic reactions for a Palyar (low id 2) or Mechanoid (low id 3) installation, roll `rand 80`. With 81 in 256 they play `PALYAR SHIP ATTACKING` or `MECHANOID SHIP ATTACK`, set the Attack State and play a blank; otherwise they end silently.
- **36–48** each play `YOU HAVE JUST DESTROYED` and the Site's name, then one of three endings, each followed by a blank:

  | Ending | Scripts |
  | --- | --- |
  | `PALYAR SHIP ATTACKING` | 37, 39, 40, 43, 44, 46, 48 |
  | `MECHANOID SHIP ATTACK` | 38, 41, 42, 45, 47 |
  | Neither | 36, `NOVABILL - WELL DONE,` |

  - 37 (the author's advert) adds `THINGS ARE GOING TO BE / TOUGH FROM NOW ON` and sets bit 8.
  - 46 (the brother-in-law's house) sets bit 32.
  - 48 (the Coach and Horses) adds `YOU WILL NOT BE POPULAR`.
  - The named Sites are single cells, except 49 and 50.
- **49 and 50** (five cells each) play `TRAITOR,` or `GOOD SHOW,` and a blank after a 1-tick pause.
- A destroyed Site spends its reaction even when Benson refuses to start it because another script runs. The port departs from this on purpose: ADR 0080 queues the reaction.
- **Port needs:**
  - Site names in `names.ts` for low ids 4–18. Today only 2 and 3 are named, both `installation`.
  - `sendAttacker` and `commanderAnnoyed` exist.
  - Bit 8 has no reader, so a port can drop it or name it.

## The spike's drafts

The [spike](https://github.com/odogono/mercenary/blob/187a09345fe535d9a9e7377d94150f20c4b6af9e/web/spike/northtalk/scripts/) drafted three of these. Each reads as its script but differs from the code. Like the opening's draft, none of them plays Benson's blank lines (message 50), which the ported opening restored as `clear`.

- **[`escape.talk`](https://github.com/odogono/mercenary/blob/187a09345fe535d9a9e7377d94150f20c4b6af9e/web/spike/northtalk/scripts/escape.talk)** (script 7):
  - Misses the five blank lines.
  - Misses the 1-tick pause before the checks.
  - Doesn't recheck the surface and the Novadrive after Y. Benson loops back and waits again; the draft escapes.
  - Corrects `YOU,VE` to `YOU'VE`. The opening port kept the original's `5OOO`.
  - Waits 15 s and 2 s, the Reference Build's clock. Today the player gets 2.5 s and 1/3 s at `scripts.timeScale` 6.
- **[`briefing.talk`](https://github.com/odogono/mercenary/blob/187a09345fe535d9a9e7377d94150f20c4b6af9e/web/spike/northtalk/scripts/briefing.talk)** (script 13):
  - Misses four blank lines and the 1-tick pause.
  - Otherwise matches, including the single Room check.
- **[`reaction.talk`](https://github.com/odogono/mercenary/blob/187a09345fe535d9a9e7377d94150f20c4b6af9e/web/spike/northtalk/scripts/reaction.talk)** (34 and 35):
  - Misses the blank line after the attack line.
  - Covers only low ids 2 and 3. The named Sites' reactions 36–50 aren't drafted.
  - The odds match.

Pacing is an open choice for every port. The opening was re-paced to the Arrival. The other scripts have no Arrival to follow, so a port can either keep today's pacing (ticks ÷ `scripts.timeScale`) or the Reference Build's (1 tick = 1 s). The first port should settle it for the rest.

## What the host lacks

Grouped by the batch that first needs it:

- **Deliveries:**
  - an object-in-Room query;
  - a delivered query and a command that marks an object delivered;
  - a credits change that adds (`spend` only subtracts);
  - names for 16 Rooms and 11 objects.
- **Commerce:**
  - a command that starts the Ship Delivery;
  - a command that disarms an object;
  - renaming slot 12.
- **Reactions:**
  - a World Event for the Player Projectile striking an object;
  - a command moving an object to a Room;
  - Site names for low ids 4–18.

The Escape, the briefings, the bank and the prison need nothing new beyond Room names.

## Port order

ADR 0080 ports by display hold. The Escape and the deliveries hold the display for as long as the player likes, so they go first. The rest are bounded, and are grouped by the capabilities they share and by the flags that couple them:

1. **The Escape** (7). It has the longest hold and needs no new capability. Fix the spike draft's misses and settle the pacing rule.
2. **Deliveries** (3–6, 9, 14–19, 20, 22–25). This is one Talk Script with a table. It holds the display until the drop and plays at every entry to 16 Rooms. It brings the object-in-Room query, the delivered mark and paying.
3. **Briefings and Room lines** (13, 28, 8/29, 11). They hold 50–70 s and need nothing new. The spike drafted 13.
4. **Commerce** (2, 1, 12). These go together because of bit 1: once the opening and the hire are both Talk Scripts, `dartBought` and the hire's answer can be separated, or the quirk kept on purpose. This batch brings the Ship Delivery command, disarming and the slot 12 rename.
5. **Faction Reactions and gratitude** (34–50, 10, 26, 27). They are short but frequent. This batch brings Site names, the new World Event and moving an object. It reuses paying from batch 2.

Then `BensonSession` and ADR 0015's program representation for Targ can go. Scripts 21 and 30–33 go with them, unported.
