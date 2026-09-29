# Damocles endgame: the impact, the ways to stop it, and what follows

Working-Authority Evidence for [#622](https://github.com/odogono/mercenary/issues/622), recovered
2026-09-29, under [the endgame map #580](https://github.com/odogono/mercenary/issues/580). Earlier
notes recovered the comet's path ([#440, #538](damocles-script-motion-time.md)), named the
drift `$7A7E` and the destruction marker `$04C98E` ([the Gamma System note](damocles-gamma-system.md)),
and decoded the BOOK's page actions as sounds ([#514](damocles-sound-programmes.md)). None of them
said what ends a game. This note decodes the body-destruction dispatcher, the BOOK's wishes, the
NOVABOMB and the AUTHORS COMPUTER, and the scripts they fire. It then drives the impact and the
two BOOK endings on a real machine. Authoritative Evidence remains bound to the C64 Reference
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
     CUPBOARD, HI-FI and WASHBASIN, bits 3 to 6 of `$7872`. Keypad `+` on a switch at the head
     sets its bit. When all four are set and the bomb's Association B `$7634` is non-zero,
     `$04D458` clears the association and detonates. There is no distance test. A placed bomb
     destroys the Body in `$7634`'s first byte (`$04D492`). A carried bomb (`$7236` bit 7)
     destroys the player's Body (`$7AA6`) and kills the player with system string `$22`, OOPS! -
     YOU'VE BLOWN YOURSELF UP. The bomb starts on GAEA (`$7634` = `$20090A29`), so switching all
     four on before moving it destroys GAEA (`$0E`). A bomb on DIALIS reads as no bomb and never
     goes off.
   - **The AUTHORS COMPUTER**, option 4. Digits 0 to 4 select an option (`$786C`), `+`/`-` move
     its value (`$786E`, records at `$7C8C`), and `*` with option 4 destroys Body number
     `$786E` (0 to 29) through the dispatcher (`$04D4EC`). Options 0 and 3 are the same palette
     mask and clock rate as BOOK pages 6 and 4.
   - **Stacked EXPLOSIVEs.** A TIMED DETONATOR blast at digit 9 that clears at least seven
     EXPLOSIVEs (slots `$4B`–`$53`) destroys the blast's Body (`$04CAD2`).
   - **The unravelling**, below.
6. **The unravelling destroys everything.** The main loop calls `$04BEEE` every pass. It acts
   once the AUTHORS COMPUTER's Association B `$753C` is 0, which happens when the computer is
   destroyed with DION or caught in an EXPLOSIVE blast. Taking it is not enough. It fires `$01`,
   THE AUTHORS COMPUTER HAS JUST BEEN DESTROYED / THIS WAS HOLDING THE UNIVERSE TOGETHER. Then,
   whenever the debris counter `$7834` is idle, it destroys Body `$7A8C` through the marker,
   skipping the dispatcher's triggers, and steps `$7A8C` down by 4. `$7A8C` starts at `$74`,
   so the Bodies go from DAMOCLES down to DIALIS. Past zero it fires `$1A`. The player dies
   when their own Body comes up.
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

The NOVABOMB, the AUTHORS COMPUTER, the stacked EXPLOSIVEs and the unravelling are read from the
code only.

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
  and the switch bits `$7872`, and the triggers already spent. Whether the MAGIC CRYSTAL is held
  is ordinary carried state.

## Unresolved

- **A carried NOVABOMB on a Body: `$23` or `$22`?** `$04CBAE` requests `$23` first, and
  `$05481A` ignores a request while `$7BA0` is busy, so the player probably reads `$23`. Not run.
- **The unravelling's pace.** How many passes lie between destructions, given each Body's
  debris, whether `$01` relaunches every pass after its first run, and whether a player in space
  survives it.
- **The switches in play.** Whether each detonator must be at the head of the Carried Stack when
  switched, and whether it works in space.
- **The AUTHORS COMPUTER's display** (`$04DA5A`) and options 1 and 2 (`$7A52`, the `$6FD02` XOR,
  `$7964`).
- **The stacked-EXPLOSIVE planet kill** live, with its blast radius `$40 << 9`.
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
| `$04D4D0`–`$04D5DA` AUTHORS COMPUTER options | `2309f034a313504275e29c475c7cb75392c608436fd865828a82b57eed2dce8a` |
| `$04D7F0`–`$04D8F0` BOOK page actions | `701ebb518bfdeae465ced6f4eadce0df0abdfeb825b7613a1a99512496fc7a66` |
| `$04BEEE`–`$04BF18` the unravelling | `6e26ef1869bda091850095744dfe1fcae423efc553212759c80bf37e90215d14` |
| `$051EFA`–`$051F3E` drift | `b3ee3a89ac0ad8a546b25ddb90e99c56b67969cdd11b81de662088853d553e07` |
| `$051F42`–`$051FD0` zero on the clock | `f05d008d28a9bea66f0656d4f335026879dff899fe666e1546ccf7aaad57244b` |
| `$0547C6`–`$054808` deferred Read | `444e3c095876d8c19a9d599943be62b8f50647ad84847ed80ae152c3bd1c0460` |

## Research Provenance

- Public-safe: this note, and `research/damocles-st/scripts/endgame-probe.py`.
- Restricted: the pinned first-world RAM, the rehosted memstates, and the probe's run
  directories `work/endgame-impact-*` and `work/endgame-wish{3,5}-*` (RAM, screenshots and
  `result.json`), all ignored.
