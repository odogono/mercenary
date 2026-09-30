# Damocles endgame: the impact, the ways to stop it, and what follows

Working-Authority Evidence for [#622](https://github.com/odogono/mercenary/issues/622), recovered
2026-09-29, under [the endgame map #580](https://github.com/odogono/mercenary/issues/580). Earlier
notes recovered the comet's path ([#440, #538](damocles-script-motion-time.md)), named the
drift `$7A7E` and the destruction marker `$04C98E` ([the Gamma System note](damocles-gamma-system.md)),
and decoded the BOOK's page actions as sounds ([#514](damocles-sound-programmes.md)). None of them
said what ends a game. This note decodes the body-destruction dispatcher, the BOOK's wishes, the
NOVABOMB and the AUTHORS COMPUTER, and the scripts they fire. It then drives the impact and the
two BOOK endings on a real machine. [#626](https://github.com/odogono/mercenary/issues/626)
then ran the switches, the NOVABOMB, the AUTHORS COMPUTER, the stacked EXPLOSIVEs and the
unravelling live, recovered 2026-09-29 ([Live runs for #626](#live-runs-for-626)). Authoritative Evidence remains bound to the C64 Reference
Build. This note records decoded ST facts only
([ADR 0002](../adr/0002-separate-rom-research-from-implementation.md)). RAM, screenshots and
script listings stay ignored Restricted Material under `research/damocles-st/work/`.

## What was found

1. **There is no game-over screen.** No ending stops the game, returns to the title or waits for
   a key. Every ending is a Script: message lines in the message bar, sometimes a reward, and
   then the game carries on. After zero the impact clock just counts up, rolling whole days into
   `$7940` (`$0521B0`). Five of the 62 memstates (`dion-2-3`, `dion-north-airborne`, `thalia`,
   `tolosa`, `perseus`) were captured by play after the impact. They hold ERIS and DAMOCLES
   destroyed, `$7BEA` = 2 and `$7A82` = `$FFFF`. The only stop is death, the existing
   `YOU'RE A BIT DEAD - TO QUIT OR LOAD PRESS HELP` loop ([#581](damocles-tolosa-encounter.md)).
2. **`$7856` is not an ending selector. It is the BOOK read.** A Read writes the object to
   `$7856` and the page index to `$7857` ([#596](damocles-head-commands.md)). When the object is
   the BOOK (slot `$83`) and the MAGIC CRYSTAL is carried (`$7126` bit 7), `$0547F2` queues the
   page's action. `$04D7F0` then dispatches on `$7857`. Every page takes the crystal (`$04CAF4`,
   slot `$5F`), so one crystal buys one wish. The pages are the BOOK's own text, WISHFUL THINKING
   OF A MERCENARY:

   | Page | Wish | Action | Trigger |
   | --- | --- | --- | --- |
   | 1 | CHEESE SANDWICH | the scripted gift of slot `$DB` (`$0541E0`) | `$15` |
   | 2 | ONE MILLION CREDITS | none natively | `$16`, which adds 1,000,000 to the balance |
   | 3 | SAVE ERIS FROM DAMOCLES | destroys DAMOCLES through `$04C98E`, skipping the dispatcher | `$17` |
   | 4 | MORE TIME | `$04D616` with level 8: the clock runs 4 times slower | `$15` |
   | 5 | SAVE BOTH ERIS AND DAMOCLES | arms the drift, `$7A7E` ← `$FFFFEDCC` | `$3C` |
   | 6 | THE UNIVERSE MORE COLOURFUL | palette XOR mask `$7A50` ← `$213` | `$15` |
   | 7 | HOW TO USE THE AUTHOR'S COMPUTER | none | `$18`, a hint |
   | 8 | MERCENARY III NOW | the bump sound instead of the spell | `$19`, a refusal |

   Pages 3 and 5 return before taking the crystal if ERIS (`$6296`) or DAMOCLES (`$62DE`) is
   already destroyed or the drift is already armed. Index 0, the TITLE, has no action.
3. **The body-destruction dispatcher `$04C8D2` decides the other endings.** It takes a Body
   selector (index × 4) in a0 and returns if the Body is already destroyed. Otherwise it may fire
   a trigger for that Body, then falls into the marker `$04C98E`:

   | Body destroyed | Condition | Trigger |
   | --- | --- | --- |
   | ICARUS (`$04`) | DAMOCLES alive, no drift, and at least 5,990 s left (`$793C` ≤ −5,990) | arms the drift `$7A7E` ← `$793C`, then `$10` if ERIS is alive |
   | ICARUS | as above, but with less than 5,990 s left | `$11` |
   | DAMOCLES (`$74`) | ERIS alive, no drift, clock still negative | `$12` |
   | ERIS (`$2C`) | DAMOCLES alive, no drift | `$13` |
   | GAEA (`$20`) | none | `$0E` |
   | DION (`$10`) | the AUTHORS COMPUTER not on DION (`$753C` ≠ `$10`) | `$1B` |
   | any | the 30th Body destroyed (`$7BEA` = 30) | `$1A` |

   The marker records the Body's centre as the blast centre (slot 74), sets the Body's word at
   `$626A` to `$8000`, counts it in `$7BEA`, and removes every object whose Association B names
   that Body. If the Body is the player's (`$7AA8`), `$04CBAE` kills the player: system string
   `$23`, YOU WERE TOO CLOSE - YOU'VE BEEN BLOWN UP, the death sound `$04C700`, `$7A64` ← 1 and
   the `$AAAA` flash. Otherwise it starts the explosion debris (`$04CCD2`).
4. **Zero on the clock.** When the waypoint table runs out, `$051F42` destroys DAMOCLES and ERIS
   through the marker and fires `$0F`, but only if the drift is not armed and both are alive.
   Then `$051FB8` raises `$7A82` and the comet carries straight on (#538). A player on ERIS dies.
   With the drift armed, nothing is destroyed and nothing fires: the comet simply passes.
   With DAMOCLES already destroyed, the mover skips it (`$051EAC`) and `$7A82` is never raised.
5. **Four things reach the dispatcher.**
   - **The NOVABOMB** (slot 163). Four disguised switches are its detonators: SIDEBOARD,
     CUPBOARD, HI-FI and WASHBASIN, bits 3 to 6 of `$7872`. Their panels read NOVA TRIGGER 1 to
     4. A switch is used like a document: Open (keypad Enter) with it carried at the head, then
     `+` sets its bit and `-` clears it (`$04D420`). When all four are set and the bomb's
     Association B `$7634` is non-zero, `$04D458` clears the association and detonates. There is
     no distance test. A placed bomb destroys the Body in `$7634`'s first byte (`$04D492`). A
     carried bomb (`$7236` bit 7) destroys the player's Body (`$7AA6`). The player then reads
     system string `$23`, YOU WERE TOO CLOSE - YOU'VE BEEN BLOWN UP, because the marker asks for
     it first. In space no Body is destroyed and the player reads `$22`, OOPS! - YOU'VE BLOWN
     YOURSELF UP. The bomb starts on GAEA (`$7634` = `$20090A29`), so switching all four on
     before moving it destroys GAEA (`$0E`). A bomb on DIALIS reads as no bomb and never goes
     off.
   - **The AUTHORS COMPUTER**, option 4. Open needs the player seated on the AUTHOR'S CHAIR
     (slot 14). Digits 0 to 4 select an option (`$786C`), `+`/`-` move its value (`$786E`,
     records at `$7C8C`), and `*` with option 4 destroys Body number `$786E` (0 to 29) through
     the dispatcher (`$04D4EC`). Options 0 and 3 are the same palette mask and clock rate as BOOK
     pages 6 and 4.
   - **Stacked EXPLOSIVEs.** An armed EXPLOSIVE going off at size digit 9 destroys the blast's
     Body (`$04CAD2`) when the blast also clears at least seven other EXPLOSIVEs (slots
     `$4B`–`$53`), eight in all.
   - **The unravelling**, below.
6. **The unravelling destroys everything.** The main loop calls `$04BEEE` every pass. It acts
   once the AUTHORS COMPUTER's Association B `$753C` is 0, which happens when the computer is
   destroyed with DION or caught in an EXPLOSIVE blast. Taking it is not enough. It fires `$01`,
   THE AUTHORS COMPUTER HAS JUST BEEN DESTROYED / THIS WAS HOLDING THE UNIVERSE TOGETHER. Then,
   whenever the debris counter `$7834` is idle, it destroys Body `$7A8C` through the marker,
   skipping the dispatcher's triggers, and steps `$7A8C` down by 4. `$7A8C` starts at `$74`,
   so the Bodies go from DAMOCLES down to DIALIS. Past zero it fires `$1A`. The player dies
   when their own Body comes up. A player in space survives to `$1A`. Each destruction starts
   64 passes of debris, so the Bodies go about 800 VBLs apart on foot and 250–500 in space.
7. **`$7BD8` bit 0 has one writer, the first offer's acceptance `$0709AA`.** Natively only the
   Script flag handlers `$051B2A`, `$051B38` and `$051B44` touch `$7BD8`. Among all 497 reachable
   Script ops the only `flags.set $0001` is at `$0709AA`, and every `flags.clear` is `$0040`, so
   nothing clears bit 0. The endings read it to decide whether the State President pays.

## The endings

Every one of these scripts has arming byte `$A0`, so it queues behind a running script and fires
once. Each ends on the shared epilogue `$072CAE`. Record `$F8` is the balance and `$F9` the
promised reward ([#610](damocles-location-triggers.md)). "Accepted" means `$7BD8` bit 0, the first
offer taken.

| Trigger | Entry | Outcome | What the player reads and gets |
| --- | --- | --- | --- |
| `$3C` | `$071254` | both saved (BOOK page 5) | GRANT YOUR WISH, then MESSAGE FROM CHAIRMAN - LLOYDS GROUP 4 / WE HAVE REPORTS OF DAMOCLES CHANGING COURSE / CALCULATIONS SHOW ERIS AND DAMOCLES ARE SAVED / IN THE BELIEF THAT YOU MAY BE RESPONSIBLE / WE HAVE CREDITED YOU WITH OUR SPECIAL REWARD. Adds 25,000,000 to `$F8`, then runs `$12`'s body. |
| `$10` | `$0713F8` | both saved (ICARUS destroyed in time) | MESSAGE FROM CHAIRMAN - LLOYDS GROUP 4 / CONGRATULATIONS ON A REALLY INSPIRED PERFORMANCE / CALCULATIONS SHOW YOU'VE SAVED ERIS AND DAMOCLES / OUR SPECIAL REWARD IS CREDITED TO YOU. Adds 25,000,000, then `$12`'s body. |
| `$12` | `$0714D2` | ERIS saved (DAMOCLES destroyed) | MESSAGE FROM THE STATE PRESIDENT / CONGRATULATIONS ON SAVING ERIS. Accepted: THE REWARD I PROMISED IS CREDITED TO YOU, and `$F8` += `$F9`. Not accepted: I CANNOT UNDERSTAND YOUR NOT WANTING THE REWARD / IT'S JUST NOT THE WAY TO GET ON - EXTRAORDINARY. |
| `$17` | `$0711BA` | ERIS saved (BOOK page 3) | GRANT YOUR WISH, then the State President: CONGRATULATIONS ON SAVING ERIS / WE DON'T KNOW HOW YOU'VE DONE IT - BUT, and the same reward tail as `$12`. |
| `$0F` | `$07169E` | too late (clock zero) | Accepted: MESSAGE FROM EX STATE PRESIDENT / YOU HAVE FAILED - ERIS HAS BEEN DESTROYED / MY THANKS FOR TRYING - PITY YOU WERE TOO LATE / I NEED YOUR SERVICES AGAIN / I STILL HAVE THE REWARD MONEY AVAILABLE. Not accepted: … NO GOOD CALLING FOR YOU / YOU'RE NOTHING BUT A SELFISH OPPORTUNIST / … A QUALITY I USUALY ADMIRE. No state change. |
| `$11` | `$07162E` | too late (ICARUS destroyed late) | Accepted: MESSAGE FROM STATE PRESIDENT / GOOD IDEA BUT IT APPEARS TO BE RATHER TOO LATE. Not accepted: nothing. |
| `$13` | `$071946` | ERIS destroyed instead | MESSAGE FROM EX STATE PRESIDENT / ARE YOU SURE YOU UNDERSTOOD THE MISSION / YOU WERE MEANT TO BLOW UP THE COMET TO SAVE ERIS / NOT TO BLOW UP ERIS TO SAVE THE COMET. |
| `$1A` | `$070CD6` | everything destroyed | CONGRATULATIONS - YOU ARE RESPONSIBLE FOR / THE DEMISE OF A COMPLETE SOLAR SYSTEM / TIME FOR A SHARP EXIT!, then after 4,500 frames ARE YOU STILL HERE! / … IT'S ALL OVER - YOU'VE DESTROYED IT ALL. |
| `$01` | — | the unravelling starts | THE AUTHORS COMPUTER HAS JUST BEEN DESTROYED / THIS WAS HOLDING THE UNIVERSE TOGETHER / THE FABRIC OF WHICH IS NOW SLOWLY UNRAVELLING. |
| `$0E`, `$1B` | `$071880`, `$071A08` | GAEA or DION destroyed | REPORTS ARE COMING IN OF A MAJOR DISASTER, and the police looking for a mercenary seen at HANTZEN HOUSE or AUTHORS HOUSE. |
| `$15`, `$16`, `$18`, `$19` | `$0710EE`, `$0710F6`, `$071108`, `$07114C` | the other wishes | THE MYSTICAL ORDER OF CARPENTERS GRANT YOUR WISH; `$16` pays 1,000,000; `$18` adds TO ACTIVATE - BOARD THE AUTHOR'S CHAIR; `$19` is WE SAID WE'D GRANT YOU A WISH - NOT A MIRACLE, with no grant line. |

The DAMOCLES FILE's SOLUTION item says there can be as many as five ways to solve the problem.
The code has these routes to a saved ERIS. Reading them as the file's five is inference.

| Route | How | Ending |
| --- | --- | --- |
| BOOK page 5 | read with the MAGIC CRYSTAL carried | `$3C`, both saved |
| BOOK page 3 | as above | `$17`, ERIS saved |
| NOVABOMB on DAMOCLES | place the bomb on DAMOCLES, then switch on the four detonators | `$12` |
| ICARUS destroyed in time | NOVABOMB, AUTHORS COMPUTER value 1, or stacked EXPLOSIVEs, with 5,990 s left | `$10`, both saved |
| AUTHORS COMPUTER | option 4, value 29 (DAMOCLES) or 1 (ICARUS), then `*` | `$12` or `$10` |

Stacked EXPLOSIVEs on DAMOCLES are one more way into `$12`. Because both-saved routes run `$12`'s
body after their own, an accepted offer pays 25,000,000 plus the promised reward.

## Live runs

`research/damocles-st/scripts/endgame-probe.py` boots a rehosted memstate, pokes, and takes a
stopped 1 MiB `savebin` plus a screenshot at host-timed intervals. Its runs used no fast-forward,
so a sample is about one game second. Every run's code windows hash to the pinned first-world
RAM's (the source ranges below).

| Case | Start | Poked | Result |
| --- | --- | --- | --- |
| `impact` | `gaea-ur-city-4-2`, on GAEA, offer accepted | clock −2 | At zero ERIS and DAMOCLES read `$8000`, `$7BEA` = 2, `$7A82` = `$FFFF`. `$0F` runs about 22 s of MESSAGE FROM EX STATE PRESIDENT … PITY YOU WERE TOO LATE … I NEED YOUR SERVICES AGAIN, then the Script idles. The clock counts on past zero. |
| `impact` | `eris-spaceport-onfoot`, on ERIS | clock −2 | At zero both destroyed and the player dead (`$7A64` = 1). YOU WERE TOO CLOSE - YOU'VE BEEN BLOWN UP, then the Body becomes VOID and YOU'RE A BIT DEAD - TO QUIT OR LOAD PRESS HELP. The clock and the Script stop there. |
| `wish --page 5 --then-impact` | `gaea-ur-city-4-2` | `$7856` = `$8305`, `$7126` bit 7, `$7B96` = `$8000`; later the clock −2 | `$7A7E` = −4,660 at once. GRANT YOUR WISH, the Lloyds lines, then the State President's CONGRATULATIONS ON SAVING ERIS and THE REWARD I PROMISED. At zero nothing is destroyed, `$7A82` rises and no trigger fires. |
| `wish --page 3 --then-impact` | `gaea-ur-city-4-2` | as above, page 3 | DAMOCLES reads `$8000` at once, `$7BEA` = 1. GRANT YOUR WISH, then the State President's WE DON'T KNOW HOW YOU'VE DONE IT - BUT and the reward. At zero ERIS survives, `$7A82` stays 0, and nothing fires. |

The wishes are injected at the dispatch head's inputs, which is exactly what `$0547F2` leaves
after a Read of the BOOK with the crystal carried. Nothing downstream is poked.

```sh
research/damocles-st/.venv/bin/python research/damocles-st/scripts/endgame-probe.py \
  --case impact --snapshot research/damocles-st/snapshots/rehosted/gaea-ur-city-4-2.sav \
  --samples 30 --interval 1 --seconds 2 --no-fast-forward
research/damocles-st/.venv/bin/python research/damocles-st/scripts/endgame-probe.py \
  --case wish --page 5 --then-impact \
  --snapshot research/damocles-st/snapshots/rehosted/gaea-ur-city-4-2.sav \
  --samples 22 --interval 1 --seconds 2 --no-fast-forward
```

## Live runs for #626

The same probe gained five cases for #626: `switches` (with `--bomb-carried` and `--space`),
`computer`, `unravel` and `explosives`. All used no fast-forward. `--space` starts from
`dion-north-airborne` and presses Esc, which climbs into space ([#551](damocles-panel-aboard.md)),
then key 1 to cut the throttle. Each sample also records the VBL clock `$051D96`, so the paces
below are in emulator time. Every run's 24 code windows hash to the pinned first-world RAM's.

Carrying is injected: the probe writes the object to the front of the Carried Stack (`$61CC`/
`$61CE`). It gives it the shape every captured carried object has: handling bit 7, Association B
`$7801ii10` with `ii` the stack position, structure byte `$31`, and the stack's position
(`$81D5`, `ii` × `$12C`, `$1831C`). The objects already carried follow, renumbered. Keys go in
through `hatari-event`. Enter is followed by a 2 s wait, because Open starts the 64-VBL panel
transition and `$04D3D2` drops every keypad key while `$52938` is set. The first attempt lost the
first `+` after each Enter to it.

| Case | Start | Injected | Result |
| --- | --- | --- | --- |
| `switches` | `eris-spaceport-onfoot` | the four detonators carried | `+` with no panel open does nothing. Enter on the SIDEBOARD opens NOVA TRIGGER 1 (`$785E` = `$54060600`), and `+` sets bit 3. A second `+` does nothing. With the head rotated to the WASHBASIN, `-` still clears bit 3 and `+` sets it again. CUPBOARD, HI-FI, then WASHBASIN each open and set their bit. The fourth `+` destroys GAEA (`$7BEA` = 1) and starts 64 debris passes. REPORTS ARE COMING IN OF A MAJOR DISASTER (`$0E`) follows 4 s later. |
| `switches` | rehosted `dion-2-3` | as above | The same. ↓ on the open CUPBOARD drops it: the panel closes (`$785E` = 0), the stack loses it, and bit 4 stays set. The last switch still detonates with the CUPBOARD lying on the floor. A drop in `eris-spaceport-onfoot` was refused (see Unresolved). |
| `switches --space` | `dion-north-airborne`, Esc | as above | In space `$7AA6` = `$FFFFFFFF` and `$7AAE` = 2. Every switch opens and sets its bit, and the fourth destroys GAEA. ↓ drops nothing in space. |
| `switches --bomb-carried` | `eris-spaceport-onfoot` | the NOVABOMB and the four detonators carried | The bomb's Association B becomes `$7801ii10` while carried. The fourth `+` takes the bomb out of the stack, destroys ERIS, and launches `$13` (Script PC `$071946`). The player is dead (`$7A64` = 1) and the message bar reads YOU WERE TOO CLOSE - YOU'VE BEEN BLOWN UP (`$23`), then the death loop's `$21`. `$22` never shows. The VBL clock stops 29 VBLs later, and `$13` never gets past its first op. |
| `switches --bomb-carried --space` | `dion-north-airborne`, Esc | as above | No Body is destroyed, because `$7AA6` is negative. The player dies with OOPS! - YOU'VE BLOWN YOURSELF UP (`$22`). The navigation window still names DION, and `$7AA6` then reads `$FFFF0078`. |
| `computer` | rehosted `dion-transporter`, on DION | the AUTHORS COMPUTER carried; `$7AB0` = 14 for one Enter | Enter off the chair does nothing. With `$7AB0` = 14, Enter opens the panel (`$785E` = `$65040000`) and launches `$2A`: WARNING - UNINFORMED USE OF AUTHORS COMPUTERS / CAN SERIOUSLY DAMAGE YOUR UNIVERSE. With `$7AB0` restored, every key still works. See the options below. Option 4 value 1 then `*` destroys ICARUS. The drift is armed (`$7A7E` = the clock −7,732), so `$10` then `$12`'s body follow: CONGRATULATIONS ON A REALLY INSPIRED PERFORMANCE … SAVED ERIS AND DAMOCLES, then MESSAGE FROM THE STATE PRESIDENT. |
| `explosives --count 7` | `gaea-ur-city-4-2`, on GAEA | EXPLOSIVEs 76–81 copied onto 75's spot on ERIS (Association B `$2C040356`); 75 armed with digit 9, 3 s ahead | 75 goes off 2 s later and the six other EXPLOSIVEs lose their Association B. ERIS survives, and 64 debris passes run. |
| `explosives --count 8` | as above | EXPLOSIVEs 76–82 as well | Seven others are cleared, so ERIS is destroyed (`$7BEA` = 1) and `$13` runs: ARE YOU SURE YOU UNDERSTOOD THE MISSION … BLOW UP THE COMET TO SAVE ERIS. The player on GAEA lives. |
| `unravel` | `eris-spaceport-onfoot` | the AUTHORS COMPUTER's Association B `$753C` ← 0 | The first samples show THE AUTHORS COMPUTER HAS JUST BEEN DESTROYED … UNRAVELLING (`$01`), and `$01`'s arming byte is already `$20`. DAMOCLES goes at once, then one Body at a time down the list towards DIALIS: 741–869 VBLs apart (the samples are about 125 VBLs apart), at 11.3–13.2 VBLs a debris pass. When the cursor reaches ERIS (`$2C`), ERIS is destroyed with the player on it: `$7A64` = 1 and YOU WERE TOO CLOSE, with the cursor left at `$28`. The VBL clock stops at 95,298, and 20 samples later Hatari stopped answering the FIFO, so this run has no `result.json`. Its kept samples were decoded directly. |
| `unravel --space` | `dion-north-airborne`, Esc | as above | Post-impact, ERIS and DAMOCLES are already gone. The cursor passes DAMOCLES in one pass, because the marker returns on a destroyed Body, and destroys the rest down to DIALIS: 370–495 VBLs apart, and 247 for the last five, at a median 6.9 VBLs a pass. The 30th destruction fires `$1A` (CONGRATULATIONS - YOU ARE RESPONSIBLE FOR … TIME FOR A SHARP EXIT!), while the player is alive in space (`$7A64` = 0). ARE YOU STILL HERE! … IT'S ALL OVER - YOU'VE DESTROYED IT ALL follows after the 4,500-frame wait. At the first sample showing its third line, the wait counter `$7B9C` read 4,920. The game then runs on with nothing left. |
| `wish --page 5 --then-impact` | `gaea-ur-city-4-2` | as in #622, with the clock later poked to −5 | `$7A84` reads 2,319 at once, which is `$7A7E` − `$793C` = −4,660 + 6,979. It falls by one a second. At −1 it reads −4,659. At zero `$7A82` rises and `$7A84` stays at −4,659 = `$7A7E` + 1 on every later sample, while DAMOCLES's X (`$5F40` + `$74`) carries on. That is the latch ADR 0057 records from #625. |

```sh
P=research/damocles-st/.venv/bin/python; E=research/damocles-st/scripts/endgame-probe.py
S=research/damocles-st/snapshots
$P $E --case switches --snapshot $S/rehosted/dion-2-3.sav --samples 3 --interval 1 --no-fast-forward
$P $E --case switches --space --snapshot $S/dion-north-airborne.sav --samples 3 --interval 1 --no-fast-forward
$P $E --case switches --bomb-carried --snapshot $S/rehosted/eris-spaceport-onfoot.sav \
  --samples 30 --interval 1 --no-fast-forward
$P $E --case computer --keys "+,-x2,k1,+x8,k2,+,-x2,k3,+,-,k0,+x4,k4,+,*" \
  --snapshot $S/rehosted/dion-transporter.sav --samples 25 --interval 1 --no-fast-forward
$P $E --case explosives --count 8 --seconds 3 --snapshot $S/rehosted/gaea-ur-city-4-2.sav \
  --samples 16 --interval 1 --no-fast-forward
$P $E --case unravel --space --snapshot $S/dion-north-airborne.sav --samples 280 --interval 2 \
  --no-fast-forward
```

### Answers

1. **The switches.** A switch has to be carried and at the head of the Carried Stack to be
   **opened**, because Open reads only `$61CE`. `+` and `-` then act on the open panel
   (`$785F` = 6, `$7860` = the bit × 2), whatever the head is. A placed switch cannot be opened,
   so it cannot be switched. Its bit survives the drop, though, so a player can switch each
   detonator on and put it down again. The keypad dispatch comes before the occupancy test, so
   switching works on foot, aboard and in space. The panel also has to have finished scrolling
   in. `+` on a bit already set does nothing, including the detonation test.
   The TV CONTROL (bit 0), GHETTOBLASTER (bit 1, the music `$7A62`) and GEIGER COUNTER (bit 7)
   share the handler. From the code (not run), switching one of those on or off with all four
   detonators on also runs the test at `$04D44E`. So a bomb moved since then goes off at that
   point, provided its Association B is non-zero.
2. **A carried NOVABOMB** on a Body shows `$23`. `$04D486` runs the dispatcher on the player's
   Body. The marker finds it is the player's (`$04C9F2`) and requests `$23` through `$04CBAE`,
   which sets `$7BA0`. `$04D48C`'s request for `$22` then finds `$7BA0` busy and is ignored. In
   space `$04D47C` skips the dispatcher, and `$22` is the only request.
3. **The AUTHORS COMPUTER's display** (`$04DA5A`) is its centre-box panel: AUTHORS COMPUTER /
   PARAMETER No *n* / `-` VALUE *nnn* `+`. The value has three digits, divided at `$04DA64`.
   Opening needs the player seated on the AUTHOR'S CHAIR, slot 14. `$04D268` tests `$7A90`,
   which `$058F78` copies from the pose record's `$7AB0` every pass. After that the panel works
   anywhere until the computer is dropped. A digit only selects the option: it saves the old
   value to its record and loads the new one. It applies nothing. `+` and `-` step the value by 1,
   clamp it to 0 and the option's maximum, and then apply it. `*` acts only in option 4.

   | Option | Start, maximum | Applies | Effect seen |
   | --- | --- | --- | --- |
   | 0 | 327, 511 | `$7A50` = spread(v ⊕ `$147`) | the world palette mask, as BOOK page 6. The sky and ground change colour. |
   | 1 | 139, 511 | `$7A52` = spread(v ⊕ `$8B`); the 16 words at `$6FD02` = `$6FD24` ⊕ `$7A52` | the Benson panel's palette. Its frame and windows change colour. |
   | 2 | 8, 10 | `$7964` = v, as the high word of a long | the projection's scale exponent, added to every projected log value. 9 doubles the picture, 7 halves it. |
   | 3 | 6, 10 | `$04D612`, the clock rate level `$7C1C` | the same routine as BOOK page 4 (MORE TIME). 7 is slower, and back to 6 restores it. |
   | 4 | 0, 29 | nothing | `*` destroys Body *v* through the dispatcher |

   spread(x) moves a 9-bit value's three 3-bit fields into ST `0RGB` nibbles: `x` + (`x` &
   `$1F8`), then + (that & `$380`). For example 328 gives mask `$0017` and 144 in option 1 gives
   `$0033`, as sampled. At the starting values both masks are 0.
4. **The unravelling's pace.** `$04BEEE` runs once a main-loop pass and destroys the next Body
   whenever `$7834` is 0. The marker's debris start sets `$7834` = 64 (`$04CEBC`), and
   `$04CF52` takes one off each pass, so live Bodies go 64 passes apart. A Body already
   destroyed costs one pass. The player's own Body costs none, because `$04CBD4` clears `$7834`.
   A pass took about 12 VBLs on foot in the spaceport and about 7 in space, so in space 27 Bodies went in
   10,762 VBLs, about 3½ minutes. `$01` fires once. Its arming byte goes from `$A0`
   to `$20` on the first pass and is never re-armed. While another Script runs, each pass
   re-queues it into `$7A88`. A player in space survives, because `$7AA8` then matches no Body.
   `$1A` fires at the 30th destruction (`$04C9C2`), and again from `$04BEE2` once the cursor is
   negative, where it is already spent. After its three lines, `$1A` calls the 150-frame wait
   `$072CEA` and the indexed message `$072D1C`, resets the wait counter and loops on
   `if.wait $1194` at `$070D64`. So its second part starts 4,500 frames after that reset. On
   foot the unravelling ends at the player's Body: the death stops the VBL clock, and the
   Script and the unravelling stop with it.
5. **The stacked-EXPLOSIVE planet kill** needs eight EXPLOSIVEs at the blast: the armed one,
   which `$04CC16` clears before the count, and seven more that `$04CA20` clears and counts in
   `d6`. The blast radius is `$40` << digit, `$8000` at 9. Inside a structure with `$7A5A` set,
   the test is the region byte instead of the distance. The kill destroys the blast's Body
   through the dispatcher with `$7A7A` = `$FFFF`. From the code, that skips the explosion's own
   death test at `$04CBA8`, and a player on that Body dies through the marker instead. #649 ran
   it (below).
6. **The drifted comet's path** is the page 5 row above. It confirms, at the Hatari's own
   `$7A84`, the latch #625 fitted `cometCentre` to.

## What this means for the port

- **An ending is a Script, so the port needs no ending screen.** The port already runs Scripts
  from triggers. The endings need the triggers above, `record.bcd.add` on the balance, and the
  flag test on `$7BD8` bit 0 that #612 already sets.
- **The world has to hold destroyed Bodies.** The sky, the Atlas, landing and arrival all read
  `$626A`'s bit 15 in the original. A destroyed Body's objects leave the world, and a player on
  it dies. The port today only drops the comet from the sky once the clock reaches zero.
- **The drift has to move the comet.** With `$7A7E` armed, `$7A84` = `$7A7E` − `$793C` is added
  to DAMOCLES's X each frame until `$7A82` is set. `comet.ts` computes the centre from the clock
  alone, so it needs the drift as a second input.
- **The Save has to carry the endgame.** The ST's in-game Save covers `$6140`–`$7E17`, which
  holds all of it. A port Save needs at least: the destroyed Bodies (and so `$7BEA`), the drift
  `$7A7E`, `$7A82`, the clock rate level `$7C1C` (MORE TIME), the palette mask `$7A50`, the
  unravelling's cursor `$7A8C` and the AUTHORS COMPUTER's association, the NOVABOMB's association
  and the switch bits `$7872`, and the triggers already spent. The AUTHORS COMPUTER adds its
  option records `$7C8C`, the panel mask `$7A52` and the view exponent `$7964`. An armed
  EXPLOSIVE adds `$7A54`, `$7A5C`, `$7866` and `$7868`. A blast's structure damage adds the
  table `$636A`–`$639F`, as #649 found. The open panel `$785E`–`$7865` is
  already in the Save ([#596](damocles-head-commands.md)).
- **Switch bits outlive the switch.** A port must keep `$7872` per bit, not per carried
  object, because a detonator can be switched on and put down. Whether the MAGIC CRYSTAL is held
  is ordinary carried state.

## The TIMED DETONATOR decoded

Read from the pinned first-world RAM for [#635](https://github.com/odogono/mercenary/issues/635),
2026-09-30. Nothing here was run live. The ranges are hashed below.

- **The panel** (`$04D69C`). While `$7A54` is clear, a digit sets the charge `$7866`. `+` adds 5
  to `$786A` and clamps it at 595, and `-` takes 5 off and clamps at 0. While `$7A54` is set,
  every key but `*` is ignored.
- **`*`** (`$04D6F4`) presents string 13, SELECT EXPLOSIVE IN INVENTORY WINDOW TO ARM, in three
  cases: while the inventory-label scroll `$04DDD0` runs, when the Carried Stack's head `$61CE` is
  not an EXPLOSIVE, and when the head is not the armed EXPLOSIVE `$7A5E` while one is armed. On
  the armed EXPLOSIVE, `*` disarms it: `$7A54` is cleared and its descriptor is restored from
  `$4BD10` + `$400`. Otherwise it arms the head: `$7A5E` = the slot × 4 (the low word of the long
  `$7A5C`), `$7A54` = 1, the descriptor comes from + `$404`, and `$7868` = `$793E` + `$786A` as
  a word.
- **The countdown** (`$05221A`, only while `$7A54` is set, → `$04DACC`). `$7868` − `$793E` is a
  signed word. Above 0 it is stored in `$786A`, so the panel counts down. At 0 or less, `$7A54`
  and `$786A` are cleared, the blast sound programme is queued (`$7A78` = 3, `$4BF54` =
  `$4C5A8`), and `$7834` = −1.
- **The next main-loop pass** (`$04CF4E`) finds `$7834` negative and jumps to `$04CB60`
  instead of stepping the debris.
- **`$04CB60`** first rebuilds object slot 29 as the player proxy (`$058FB0`). It takes the
  pose's X and Z, its Y − `$3F`, the Body byte `$7AC9`, and `$7AFD` as the region byte, which is
  0 unless the player is on foot (`$7AAE` = 1) with bit 14 of the region flags `$7B34` clear. Its
  last instruction, `$059000`, writes the current cell `$7B5D` to the proxy's cell byte `$73AB`.
  #635's hashed range stopped one instruction short of it, and read the byte as never written.
  - *Carried* (bit 7 of `$6FAA`): the EXPLOSIVE leaves the Carried Stack (`$04CAF0`). `$05A928`
    computes `$7A5A`, string 34 is asked for, and the blast goes off at the proxy.
  - *Placed*: it goes off where it lies.
  - The blast then runs `$04CBDA`. If `$7A7A` is 0 afterwards, string 35 follows with the death
    `$7A64` = 1, the `$AAAA` flash, and `$7834` cleared.
- **`$04CBDA`** copies the source's place and Association B into slot 74, the blast centre. On
  the player's Body it also writes a flash word by charge to `$51D24`. It clears the source's
  Association B, then runs the test `$04CA20`.
  - If the test returns the planet kill, `$04CAD2` clears the proxy, sets `$7A7A` = `$FFFF` and
    jumps to the dispatcher. The rest of the routine is skipped.
  - Otherwise `$7A7A` takes the proxy's Body byte, which the test has cleared if the proxy was
    in reach, and the proxy is cleared.
  - At charge 3 or more, a source with non-zero `$6FA9` and cell bytes adds a six-byte entry
    to the table at `$636A` and reloads the workspace (`$04EB60`). That looks like structure
    damage. The entry depends on `$7A5A`, `$7A56` and `$7A59`.
  - The spray `$04CCA0` follows, with elevation mask `$FF` and the fall `$FFFFD8F0`. Then
    `$04CCD2` seeds 64 particles from 192 noise words and `$7834` = 64. A carried EXPLOSIVE
    leaves the proxy cleared, so `$7A7A` is 0 and the player always dies.
  - #649 decodes the entry, the flash word and what follows the reload (below).
- **The test `$04CA20`** walks slots `$FF` down to 0, skipping slot 74 and any slot whose Body
  byte differs from the centre's. The reach is `$40` << the charge.
  - With `$7A5A` set, a slot whose region byte `$73A9` is not 0 is in reach when its cell byte
    `$73AB` equals the centre's. That byte is the island-local cell, X + 16 × Z. For every
    structure resident on ERIS, the catalogue's `association.cell` equals its structure's cell
    by this formula.
  - Every other slot is in reach when `$0541BA` passes: each of the three 32-bit differences,
    shifted up 4 bits and made positive, is at most the reach shifted up 4 bits. So the reach is
    a box, not a sphere.
  - In reach: the NOVAGEN SAFE (`$66`) at charge ≤ 3 sets `$7A60` = `$FFFF` and stays. Anything
    else has its Association B and `$6FA9` cleared, and EXPLOSIVEs `$4B`–`$53` count in `d6`.
  - At charge 9 with `d6` ≥ 7, the routine returns with Z set, which is the planet kill.
- **`$7A5A`** is written only by `$05A928`, which runs when the armed EXPLOSIVE is dropped
  (`$05472E`) and when it goes off carried. A placed EXPLOSIVE keeps the value from its drop.
  - It is clear below charge 4.
  - From charge 4 it is set if the region byte just written is not 0.
  - Otherwise it is set if the player stands within `$10` << the charge of the bound Building
    detail's extent rectangle `[$7910]`, measured as the larger of the X and Z word gaps. A cell
    without an extent counts as gap 0.
- **The player in a structure** carries region byte `$7AFD` and the current cell `$7B5D` in the
  proxy. So a blast with `$7A5A` set reaches that player whenever the player stands in the
  centre's cell, at any distance. #635 read the cell byte as 0, and #649's run corrects it.

## Live runs for #649

[#649](https://github.com/odogono/mercenary/issues/649) ran #635's decode against Hatari on
2026-09-30. `endgame-probe.py` gained a `detonator` case, which arms an EXPLOSIVE through the
TIMED DETONATOR's own keys instead of poking `$7A54`. It carries the TIMED DETONATOR (slot 145)
and EXPLOSIVE 75 by #626's injection, and then presses:

- Enter, which opens the panel (`$785E` = `$91030000`, mode 3);
- a keypad digit, the charge;
- `+` once per 5 s of fuse;
- → until the EXPLOSIVE is at the head;
- `*`, which arms it;
- ↓, which drops it (with `--drop`).

The options are these:

- `--disarm` presses `*` twice more (disarm, re-arm).
- `--diagonal` moves EXPLOSIVEs 76–79 to offsets around the dropped one.
- `--move-player` pokes the pose's X high word off after the drop, so the player outlives the blast
  and Hatari keeps running. `--return-player` pokes it back after the debris.
- `--teleport` pokes the pose's X and Z high words before anything else.
- With 3 s left, three `:trace` breakpoints go in: the deadline's `$7834` = −1 (`$04DAEE`), the
  main loop's once-a-pass `$7834` test (`$059506`) and the blast (`$04CB60`).
- `--capture` replaces the traces with a one-shot savebin at the blast test's entry (`$04CA20`),
  and another after it (`$04CC26`).

An object's position long is in the pose high word's units, which are also the reach's units:
EXPLOSIVE 75 dropped at pose X `$8793` reads `$0CB68793`. The ERIS arrival spot refuses a Drop,
so the drops are in:

- `dion-2-3`, outdoors, post-impact;
- `gaea-ur-city-4-2`, outdoors;
- `dion-transporter`, inside a structure, region 4, cell `$E3`;
- `vesta-parliament-4-6`, poked into the Parliament door's Proximity Box.

Every run used no fast-forward and samples about a second apart. Each run's 35 code windows hash
to the pinned first-world RAM's.

| Case | Start | Keys, pokes | Result |
| --- | --- | --- | --- |
| `explosives --count 8` | `eris-spaceport-onfoot`, on ERIS | as #626 | ERIS is destroyed (`$7BEA` = 1) with `$7A7A` = `$FFFF`, and the player dies (`$7A64` = 1) with YOU WERE TOO CLOSE - YOU'VE BEEN BLOWN UP (`$23`). The flash word reads `$AA00`, which is `$AAAA` eight VBLs on (`$04CBCC`). The Script PC stays at `$071946`, `$13`'s first op, as with #626's carried NOVABOMB. `$7AA6` then reads `$78`, VOID. |
| `detonator --charge 6 --fuse 15 --disarm --drop --diagonal --move-player 0x2000` | `dion-2-3` | EXPLOSIVEs 76–79 at (0.9, 0, 0.9), (−0.9, 0, 0.9), (0.9, 0.9, −0.9) and (1.1, 0, 0) × the reach `$1000` | `+` × 3 gives `$786A` = 5, 10, 15. `*` arms it: `$7868` = 6,170, the label reads EXPLOSIVE-ARMED! and the model word is `$32CA`. The second `*` disarms it: `$7A54` = 0, EXPLOSIVE, `$3256`, and `$786A` keeps the 14 s left. The third re-arms it with `$7868` = 6,171 = the clock's 6,157 + 14. The drop leaves `$7A5A` = 0. The panel counts down a second at a time. The trace reads 14 passes, the deadline, **one pass**, the blast. EXPLOSIVEs 75–78 are cleared, and 79 is kept. |
| `detonator --charge 7 --drop --move-player 0x4000` | `dion-2-3` | | `$7A5A` = `$FF00`. The blast adds `02 32 0000 00 00` at `$636A`. |
| `detonator --charge 7 --drop --move-player 0x4000` | `gaea-ur-city-4-2` | | `$7A5A` = 0. No entry. |
| `detonator --charge 8 --drop --move-player 0x6000 --return-player` | `gaea-ur-city-4-2` | | `$7A5A` = `$FF00`. The entry `07 24 0000 00 00` is added. Cell `$24`'s workspace long `$AC6C` goes from `$00AEF552` to `$0000F552`, keeping its dx/dz bytes. Back at the drop spot (`016-drop` against `037-fuse-019`) the building is gone and the ground is left. |
| `detonator --charge 4 --drop --capture` | `dion-transporter` | | `$7A5A` = `$FF00`. Slot 34 (region 3, cell `$E3`) is cleared, though it is `$4B0` off on one axis against a reach of `$400`. Slot 66 (region 4, cell `$E3`) is cleared too. Slot 6 (region 0, cell `$E3`, `$5FC` off) is kept. At `$04CA20` the proxy `$741C` reads `$100401E3`, so its cell byte is `$7B5D` = `$E3`. After the test it is 0. `$7A7A` = 0, and the player dies with `$23`. The flash word at `$04CA20` is `$FFFA`. The entry is `02 E3 0000 00 00`. |
| `detonator --charge 3 --drop --teleport 0x8000,0x87c3 --move-player 0x300 --return-player` | `vesta-parliament-4-6` | inside door `$3EC`'s Proximity Box (key slot 34) | The drop gives `$7A56` = `$03EC0022`, and `$7A5A` = 0 at charge 3. The blast adds `05 64 8022 00 EC`. The door's key byte `$5E2F` goes from 34 to 0, and its label byte `$CD3F` from `$45` to `$DF`. Cell `$64`'s word does not change. |
| `detonator --charge 4` | `dion-transporter` | not dropped | The EXPLOSIVE leaves the Carried Stack. `$7A5A` = `$FF00`, from the proxy's region 4. The blast adds `02 E3 0000 00 00`, and the player dies. |

```sh
P=research/damocles-st/.venv/bin/python; E=research/damocles-st/scripts/endgame-probe.py
S=research/damocles-st/snapshots/rehosted; C="--no-fast-forward --interval 1"
$P $E --case explosives --count 8 --seconds 3 --snapshot $S/eris-spaceport-onfoot.sav --samples 8 $C
$P $E --case detonator --charge 6 --fuse 15 --drop --disarm --diagonal --move-player 0x2000 \
  --snapshot $S/dion-2-3.sav --samples 22 $C
$P $E --case detonator --charge 7 --fuse 10 --drop --move-player 0x4000 \
  --snapshot $S/dion-2-3.sav --samples 16 $C
$P $E --case detonator --charge 7 --fuse 10 --drop --move-player 0x4000 \
  --snapshot $S/gaea-ur-city-4-2.sav --samples 16 $C
$P $E --case detonator --charge 8 --fuse 10 --drop --move-player 0x6000 --return-player \
  --snapshot $S/gaea-ur-city-4-2.sav --samples 20 $C
$P $E --case detonator --charge 4 --fuse 10 --drop --capture \
  --snapshot $S/dion-transporter.sav --samples 12 $C
$P $E --case detonator --charge 3 --fuse 10 --drop --teleport 0x8000,0x87c3 --move-player 0x300 \
  --return-player --snapshot $S/vesta-parliament-4-6.sav --samples 20 $C
$P $E --case detonator --charge 4 --fuse 10 --snapshot $S/dion-transporter.sav --samples 16 $C
```

Two Hatari runs at once sometimes miss the probe's 6 s wait for a savebin
(`sample … read 0 bytes`). Run them one at a time if that happens.

### Answers for #649

1. **The planet kill with the player on the Body** shows `$23`, YOU WERE TOO CLOSE - YOU'VE BEEN
   BLOWN UP. `$7A7A` = `$FFFF` skips the blast's own death test. The marker at `$04C9F2` then
   finds the player on the destroyed Body and takes the shared death `$04CBAE`, with `$23` and
   the `$AAAA` flash. `$13` is launched, and the death loop holds it at its first op.
2. **The cell test `$7A5A`** is set exactly where #635's decode says. The measurements are:
   - Inside `dion-transporter`, at charge 4: set.
   - Outdoors on `dion-2-3`, 1,172 from the extent: clear at charge 6 (`$10` << 6 = 1,024) and
     set at 7 (2,048).
   - Outdoors on `gaea-ur-city-4-2`, 2,767 away: clear at 7 and set at 8.

   `$7A5A` is a byte, so a set test reads `$FF00` as a word. A structure resident in the centre's
   cell is cleared at any distance. Slot 34 lay outside the box and went. A slot whose region
   byte is 0 keeps the box test even in that cell, as slot 6 did.
3. **The player inside a structure in a cell-test blast dies whenever the player stands in the
   centre's cell.** The proxy's cell byte is written after all: `$059000` copies `$7B5D`, the last
   instruction of `$058FB0`. #635 read the byte as never written because its hashed range ends at
   `$059000`. From the code, a player in another cell survives at any distance. That was not
   run.
4. **The reach is a box.** Objects at 0.9 × the reach on two axes and on all three were cleared,
   at 1.27 and 1.56 × the reach in distance. The control at 1.1 × on one axis was kept.
5. **The countdown and the pending blast.**
   - `$786A` counts down once a second while armed, and the panel shows it (`0:01`, then `0:00`).
   - `$7834` = −1 lasts exactly one main-loop pass. In each of the six traced runs, one hit of
     `$059506` falls between `$04DAEE` and `$04CB60`.
   - `*` on the armed EXPLOSIVE disarms it. `$786A` keeps the seconds left, so a re-arm uses
     those, not the fuse that was keyed.
6. **What the port still skips** is below.

### The structure damage, the flash, the name and the sound

- **The damage table** is at `$636A`: nine entries of six bytes. `$04CC48` stops at the first
  free entry, and with all nine used it overwrites the ninth. An entry is written only at charge 3
  or more, with the centre's structure byte (`$6FA9`, a Drop's `$794F`) and cell byte both
  non-zero. Its kind depends on `$7A5A`:
  - **`$7A5A` set:** `[group, cell, $0000, 0, 0]`, and the centre's region byte `$74D1` is
    cleared. Each workspace load (`$04EB60`) zeroes the 256 cell longs at `$ABDC`, replays the
    authored overrides, and then writes each matching entry's word to its cell (`$04ED4A`). So the
    structure in that cell is removed, and the ground stays. The gaea-8 run shows it.
  - **`$7A5A` clear, with the player in a door's Proximity Box at the drop:**
    `[group, cell, $8000 | key slot, level, door slot × 4]`. `$05A928`'s tail finds the door: the
    first attachment from `$3FC` down with a key byte `$5A43` whose box holds the player, into
    `$7A56` (slot × 4) and `$7A58` (its key). The loader skips an entry with a negative word. The
    door builder `$059E9E` matches it on group, level and door slot (its cell compare at
    `$059F7A` is dead, because `$059F7E` retests the flags). It then leaves the key byte 0 and
    writes the label glyph `$DF` into `$CD35` − the slot sign-extended ÷ 2. A key byte of 0 opens
    the door without its key (`$05AA82` → `$05ABF6`).
  - Otherwise, including `$7A5A` clear with no door, nothing is added and nothing is reloaded.

  After an entry, `$054B2E` rebinds the current cell, so the change shows at once. The Save
  (`$055422`) and the Load (`$0552CE`) copy `$6140`–`$7E17`, which covers the table. Nothing else
  writes it or clears it, and a Load replays it through `$058E34` → `$04EB60`. **So a port Save
  has to carry the table.** A carried blast makes entries too, because its centre is the proxy
  and carries `$7B5D`.
- **The flash by charge reads code.** `$04CBEC` is `move.w $4CC4C(pc,d0.w)`, and its 8-bit
  displacement `$5E` is the truncated −`$A2`. The table the code means, `$8000 $A000 … $EEEE`,
  is at `$04CB4C`–`$04CB60`, and nothing reads it. Instead the ST reads the code words at
  `$04CC4C`. At charge 4 the run above caught `$FFFA`, not `$CCAA`.

  | Charge | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
  | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
  | Word read | `$7008` | `$5C48` | `$4A10` | `$57C8` | `$FFFA` | `$4A78` | `$7A5A` | `$6B1A` | `$3038` | `$7A56` |

  The VBL (`$051D74`) shifts the word left once a VBL. On a carry out it sets colour 0 to black
  and colours 1–15 to `$777` for that VBL, and it skips the tick `$51D26` while the word is
  non-zero. Timer B still gives the panel its own palette, so only the view flashes. The word is
  written only when the centre is on the player's Body, at any distance. A caught player's
  `$AAAA` overwrites it in the same pass. The marker writes `$CA00` for every Body it destroys
  (`$04C9A0`).
- **The armed name.** `$4BD10` points at the object model table `$035700`. `*` copies model
  257 (`+$404`, offset `$32CA`) into the EXPLOSIVE's entry to arm it, and model 256 (`+$400`,
  `$3256`) to disarm it. The name is the 16 bytes before a model: `   EXPLOSIVE    ` at
  `$038946`, `EXPLOSIVE-ARMED!` at `$0389BA`. `$04DE9A` then copies the head's name into the
  inventory label, so the carried EXPLOSIVE reads EXPLOSIVE-ARMED! while armed (seen in the
  box run). The two models share their vertices, and their faces differ. The model table is
  outside the Save. After a Load, `$058E60` resets slots 75–82 to model 256, but not slot 83
  (the loop ends at `$14C`). It re-arms `$7A5E` if `$7A54` is set.
- **After the blast**, `$052C9C` rebuilds the surface resident list `$7D19` from the slots whose
  Body is the player's and whose region byte is 0. That drops the cleared objects, and takes in
  slot 74 if `$74D1` was cleared. On foot, `$05A30E` re-resolves the player's region and clears
  every resident's draw membership, so that the queue `$05A3DE` rebuilds without the cleared
  residents.
- **The sound.** The deadline queues `$04C5A8`: `$7A78` = `$1F`, envelope `$3FFF`, then the noise
  tail `$04C5C6`. The next pass's carried path replaces it with `$04C700`: `$7A78` = `$47`,
  envelope `$8F00`, the same tail. A caught player gets `$04C700` again (`$04CBB6`).

### Mismatches with the port, for #650

[#650](https://github.com/odogono/mercenary/issues/650) ports these. ADR 0057's #650 amendment
lists what stays unported and why.

- **The player proxy's cell** (`session.ts`, `playerProxy`) is 0, and should be the current cell
  `$7B5D`. With the port's 0, a player in the centre's cell survives a cell-test blast. And a
  carried blast's centre, which is the proxy, tests residents against cell 0.
- **The damage table is not ported.** That covers both kinds of entry, the replay on every
  workspace load, and its place in the Save. The ninth entry is overwritten when the table is full.
- **The door entry is not ported**: the key byte cleared and the `$DF` label.
- **The flash by charge is not ported.** The port flashes only `$AAAA`, the TOLOSA kill and the
  zap. It needs the code words above, on the player's Body only. The marker's `$CA00` is
  missing as well.
- **The armed name and model are not ported.** The label should read EXPLOSIVE-ARMED! and the
  armed model should be drawn while `$7A54` is set. A Load resets slots 75–82 only.
- These match the port already:
  - the box reach;
  - the cell test and the box test for a region-0 slot in the same cell;
  - the `$7A5A` thresholds;
  - the one pending pass;
  - a re-arm using the seconds left;
  - the `blast` and `blown-up` cues and their order;
  - the planet kill's `$23` through the marker.

## Unresolved

- **The refused drop in `eris-spaceport-onfoot`.** ↓ on the open CUPBOARD dropped nothing there,
  though the same injected carry dropped on `dion-2-3`. It may be the spaceport's drop rules, or a
  field of a real take the injection does not write. It does not change the switch answers.
- **The AUTHOR'S CHAIR was not boarded in play.** The computer run stands in `$7AB0` = 14 for the
  one Enter. What else boarding the chair writes, and whether a seated player can walk, was not
  run.
- **A blown door was not walked through.** #649's door run shows the entry, the key byte
  cleared and the label changed. That the door then opens without its key (`$05ABF6`) is read
  from the code. What glyph `$DF` looks like was not decoded.
- **The door run's view is not evidence.** Its player was poked into the door's Proximity Box,
  and a poked pose leaves the view stale until the blast's reload rebinds the cell. With the
  player poked `$1000` away, the building left the view even though its cell word did not
  change. With the player `$300` away it stayed. A charge 2 control, with no entry and no
  reload, kept it too.
- **System string `$10`, GAME SAVE NOT A WINNING SUITUATION**, is a Load refusal at `$05517E`
  when a field of the loaded file is not 7. It is not an ending. The field was not decoded.

## Source ranges

Half-open ranges in the pinned first-world RAM
(`observe-first-world-20260818T101013Z-c5a32b7d/observed.ram`, SHA-256
`b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967`).

| Range | SHA-256 |
| --- | --- |
| `$04C8D2`–`$04CA20` destruction dispatcher and marker | `c59b411bba02da6568b72e29a075b84a1c358def54ea2becba0e7e432e2dfb79` |
| `$04CAD2`–`$04CAF0` stacked-explosive planet kill | `519d56f1ae3a1498a947381df177151b2bc4b817da3f0240c4e8c9310a8bacf3` |
| `$04CBAE`–`$04CBDA` death on a destroyed Body | `31115adc7ac40a0c1a7530ec62c6de8d0c2556af3c7405a6d5ef992af58df083` |
| `$04D420`–`$04D4D0` switches and the NOVABOMB | `bf7ffce3067f363b32abe0dafcee52e42dbe75e0e193b9c95276069714d88714` |
| `$04D4D0`–`$04D5DA` AUTHORS COMPUTER keys | `2309f034a313504275e29c475c7cb75392c608436fd865828a82b57eed2dce8a` |
| `$04D7F0`–`$04D8F0` BOOK page actions | `701ebb518bfdeae465ced6f4eadce0df0abdfeb825b7613a1a99512496fc7a66` |
| `$04BEEE`–`$04BF18` the unravelling | `6e26ef1869bda091850095744dfe1fcae423efc553212759c80bf37e90215d14` |
| `$051EFA`–`$051F3E` drift | `b3ee3a89ac0ad8a546b25ddb90e99c56b67969cdd11b81de662088853d553e07` |
| `$051F42`–`$051FD0` zero on the clock | `f05d008d28a9bea66f0656d4f335026879dff899fe666e1546ccf7aaad57244b` |
| `$0547C6`–`$054808` deferred Read | `444e3c095876d8c19a9d599943be62b8f50647ad84847ed80ae152c3bd1c0460` |
| `$04CA20`–`$04CAD2` the blast test and EXPLOSIVE count | `efa43d529e2fcf7677f06d000a4c01e3b37c8d1711fb9e3d91ef41ac5f64b0f4` |
| `$04CAF0`–`$04CB4C` taking an object out of the stack | `c65a7d18e9e2a4d1ac03421729805f18b63b7bf86d827f3db5044d8c20a4e694` |
| `$04CB60`–`$04CBDA` an armed EXPLOSIVE going off | `84359f09f46a16f9f4618f4ed6c6ec4e661094277ecc9586e97d74bbeed47af0` |
| `$04CBDA`–`$04CCD2` the blast | `c416851b3842507f51e166125e4b7339b9ca3dd5ced1c0be530802e49799898c` |
| `$04CF4E`–`$04CFA4` the debris pass | `bd40b69c73e7ca15b5b8f07ed49a48f25298a7b52eec03887e722d009cf53bdc` |
| `$04D24C`–`$04D2C4` Open | `974ae115bbdbb2405faf49ed3e980ba301a5d8ca669c7c2ee59d405400923c25` |
| `$04D2C4`–`$04D3B4` the Open table | `b22cd7553708149209f273fa2803b3f164872009d196f7879550ecb6b6f2beed` |
| `$04D3D2`–`$04D420` the keypad dispatch | `c0ee52cb6098ed726288290d744d9379092b78510a0498a26bf4564c16df7b16` |
| `$04D5DA`–`$04D69C` AUTHORS COMPUTER options | `986af43a9db2b2f0d91245d94d59097a89e0f64128970a53252669edc735a7e7` |
| `$04D69C`–`$04D762` TIMED DETONATOR keys | `b518ebba373bd6194b50c49b986f3d3e8f4a94e05075bda32d9100573a63562b` |
| `$04D992`–`$04D9D4` the switch lamp | `a5695ecdaf5b613397af5a553d87d654cae2ba952f281f9e49b32d1032d53299` |
| `$04DA5A`–`$04DAB6` AUTHORS COMPUTER display | `fb34145507269249030c215b2f04f18ac8f8c5f6e234a7957f90c45020132a23` |
| `$04DACC`–`$04DAF8` the detonation countdown | `abddeefb68358f8cd3f05a4fa48825ae37f464d7525c1de72daacd6dda2d7476` |
| `$054770`–`$0547C6` trigger launch | `0e5267c71f7f6d5985f4971cca82a53268e86ad3909048cefa3b9e87142027f0` |
| `$05481A`–`$054848` system message request | `f3f4699d27dc7ba206c0435d4ef24080af3985985f14167fc5a8617308c7a874` |
| `$058F78`–`$058F88` the pose record copy to `$7A8E` | `42672a59a4fba45ad2de3422c5d2eb5ad386dfe09c9ff114b02f37a043e75fdd` |
| `$0541BA`–`$0541E0` the blast's box test | `074be82f6b42b019ffbcedba7daae670384559339e6d2e4ef692179c6e3d372b` |
| `$0546F0`–`$054740` a Drop's Association B and `$7A5A` | `3584c37f41ecac6d6f9dd47d217ee73c7b931fc4ed09592396980fc59f2fa957` |
| `$058FB0`–`$059000` the player proxy, slot 29, less its last instruction | `be05fc1d7db869999ba60de4f917d03e31ff1be5992b10422e3497094528e4ef` |
| `$05A928`–`$05A9D8` `$7A5A` and the blast's region | `fac8f1e0f40972710b5316440e57295be4705ee3a1a6ad4a6a7c0e7a79367cd8` |
| `$070C3C`–`$070E22` scripts `$01` and `$1A` | `c2d07e3d27b4752522961ae37d23522df4b2ef187566530141efb3608d4a625d` |
| `$058FB0`–`$059006` the player proxy, with its cell byte | `7aa873373a481ddd6c3352c3f78f5d131a208199841393cb2cc9e42d75b4ba3d` |
| `$0546CC`–`$054744` a Drop's bytes, `$05A928`, `$05A30E` and `$052C9C` | `6e17bc5b69f448eb8c50759b606641b088975e241af5102d08be1ec9562c1b85` |
| `$04CBDA`–`$04CCA0` the blast centre, flash, damage entry and after-blast calls | `855c0e804a03fddafdb429722fcb8f3b4811c4b0c5855d32f805ccc73c941d4c` |
| `$04CB4C`–`$04CB60` the flash table no code reads | `9ec35e9543cea166871db9cec4d8e3fa089446d60168cb5aed23b2c893318a5f` |
| `$04CC4C`–`$04CC60` the code words the flash read lands on | `59175b7fb52750b98a8372b250458b8183859146ed8d82beb63638b5895a6f12` |
| `$051D74`–`$051D96` the VBL flash | `5ed11f8e01b8a1b6f60b717e714a99f262213527b0223257c4bd72d321d05dba` |
| `$051D9A`–`$051DD6` the VBL's flash test | `9240ff72597c6b0546bdecb5d5c55faac7e7106e49ce3fec0f2fef1dc98b646f` |
| `$04C98E`–`$04C9A8` the marker's `$CA00` flash | `57212a6dbf1f1dd53f9896c778667bfb396572ce5df24daf1738af3ce339de8c` |
| `$04EC94`–`$04ED74` cell overrides and the damage replay | `cb17aab3a566b29143e08f6b81f8c4590cb41f539a0010eca5a7d7c509324ebd` |
| `$059E9E`–`$059FCA` door attachments and the `$DF` label | `2a2deb92d1edb35750a3f09aab31d3ea9502d32915848ee7ee04f3c05c07e1ff` |
| `$05A0A8`–`$05A0D0` a door's Proximity Box | `f5afcbeb221845d1864375df1d44a499ac84ae7efd6ae2e0fefc53a4e99f495c` |
| `$05AA3C`–`$05AAA0` the door key test | `579160e2fc8163519b6848db928e1a666c1841d2f248a4ac4b6994f1fa89e1a4` |
| `$054B2E`–`$054BF8` the cell rebind after the reload | `22f3caeac48327f762de1fecd2503163123afd9483270fb63c18c0715473fcc1` |
| `$052C9C`–`$052CDC` the surface resident list | `1668c22282110f270f27986e8deba9d90aa85783b905bd9d584f23c034e006ec` |
| `$05A30E`–`$05A3DE` the region resolve | `a66ed42e20865d824b72b4b8057529aded4ed7b8d751801a5c1add4d931a77f9` |
| `$04DE9A`–`$04DECE` the inventory label | `9d5e3819bbecd9c912bad328d4f67f5cddb5d7f2f884de1bbe722bd85b2ac8bd` |
| `$058E34`–`$058E90` the reload and model reset after a Load | `bf6f52ac2818a9de72345fcb21d5328f54176b64a0c840a47e75e665f305940e` |
| `$0552A4`–`$0552DA` the Load's copy to `$6140` | `a6537986c3cf6128e95d3efe049172491473a3b6cd73fa2443231d82ab63a5ad` |
| `$055422`–`$05543A` the Save's range | `c6a36f5087ad92df22f0e56b0b91bd97d3e59ce5a4bde1fb03532ed345f77e13` |
| `$035B00`–`$035B08` EXPLOSIVE models 256 and 257 | `16c8de321e79a6a55da9f271461ee5b9f0e6461ecb48d81711a4bb8f322e5b3a` |
| `$038946`–`$038956` the name `   EXPLOSIVE    ` | `c7c56e9dc666019f6ff05d6b5e9f1a323dd732e4ee3ee187ea63812f2c59e372` |
| `$0389BA`–`$0389CA` the name `EXPLOSIVE-ARMED!` | `32169afd4e0d4be4d5b3bcc29359361e8b1352616a82d29bd0d7719b7bded17b` |
| `$04C5A8`–`$04C610` the blast sound programme | `320471f4c28b9b7e64e17d978deb1405c6b77cc8e2ea350a0fc0033829474fbd` |
| `$04C700`–`$04C722` the blown-up sound programme | `aa94578e6b00daf3400adc70e35a2456b704c1e90af468baef93e3fc6db90841` |
| `$0594F0`–`$059512` the main loop's `$7834` test | `ee735964e6162ee644215680ea032bcf88de512a9c8d2cc0ee7fdac986cc1c4e` |
| `$05220E`–`$052228` the countdown call | `bcf9e9c5b871fef1aa9427f31806c44cbddf39b85a0b517de4654280609f0583` |

## Research Provenance

- Public-safe: this note, and `research/damocles-st/scripts/endgame-probe.py`.
- Restricted: the pinned first-world RAM, the rehosted memstates, and the probe's run
  directories `work/endgame-impact-*` and `work/endgame-wish{3,5}-*` (RAM, screenshots and
  `result.json`), all ignored.
- #626's runs (2026-09-29), in the same ignored `work/`: `endgame-switches-20260929T163238Z-f0699c5b`,
  `endgame-switches-20260929T163402Z-b3971e5e`, `endgame-switches-space-20260929T163446Z-13778eaa`,
  `endgame-switches-bomb-20260929T163539Z-077dd012`,
  `endgame-switches-bomb-space-20260929T163712Z-89e6208d`,
  `endgame-computer-20260929T164029Z-49484d24`, `endgame-explosives-20260929T164251Z-591655c2`
  (7), `endgame-explosives-20260929T164312Z-fadfa2f7` (8),
  `endgame-unravel-20260929T164220Z-cd1d2d16`, `endgame-unravel-space-20260929T164220Z-a19b1955`
  and `endgame-wish5-20260929T164432Z-bf874629`. Three earlier attempts are superseded:
  `endgame-switches-20260929T163129Z-2ee374c6` lost keys to the panel transition, and
  `endgame-computer-20260929T163831Z-3135ff1c` and `…163956Z-b6e07f57` poked `$7A90`, which the
  pose copy overwrites. The unravelling runs keep every tenth sample and every change.
- #649's runs (2026-09-30, probe SHA-256
  `61b216e8c9c8051a2a4970deb395d7d2a32b51c8c9ad4b0ef38182920a689311`), in the same ignored `work/`,
  in the table's order:
  - `endgame-explosives-20260930T094853Z-6637c4e3`
  - `endgame-detonator-20260930T094857Z-9149407e` (box)
  - `…094938Z-b48f558e` (dion-2-3, 7)
  - `…095011Z-77f4da59` (gaea, 7)
  - `…095015Z-a7d6b295` (gaea, 8)
  - `…095052Z-a2518057` (inside, with `bp-04ca20.bin` and `bp-04cc26.bin`)
  - `…095149Z-068c5fb5` (door)
  - `…095120Z-e79962fe` (carried)

  Earlier runs from the same session are superseded, because they came from earlier revisions of
  the probe. Two of them are the door controls the Unresolved list cites:
  `endgame-detonator-20260930T093824Z-0ce5589f` (player `$1000` away) and
  `…093957Z-01cfe41a` (charge 2).
