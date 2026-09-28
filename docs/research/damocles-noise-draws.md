# Damocles noise-table draws and the pass clock

Working-Authority Evidence for [#582](https://github.com/odogono/mercenary/issues/582), recovered
2026-09-28. It follows [the landing messages note](damocles-landing-messages.md). That note found
that the pointer `$7E18` walks the 2,048-word noise table at `$77000`, and that the main loop's
join `$05948C` steps it a word a pass. It left the native draw sites undecoded.
[ADR 0053](../adr/0053-present-damocles-landing-messages-from-the-recovered-draw.md) then held
the pointer on foot, because the port has no on-foot pass. Authoritative Evidence remains bound
to the C64 Reference Build. This note records decoded ST facts only
([ADR 0002](../adr/0002-separate-rom-research-from-implementation.md)). RAM and traces stay
ignored Restricted Material under `research/damocles-st/work/`.

## What was found

1. **Twelve instructions read the pointer, and each belongs to one of six effects.** Every
   `movea.l $7E18.w, a0` in the program is at one of these sites. The main loop's step is a
   thirteenth site. It adds 2 to the low word `$7E1A` and never reads a word.

   | Sites | Effect | Words | When |
   | --- | --- | ---: | --- |
   | `$051A60` | Script `if.random` | 1 per test | 30 tests in 29 scripts |
   | `$051C2C` | Script `message.random` | 1 | reached by no script |
   | `$04CCF2`, `$04CD28`, `$04CD66` | explosion debris | 192 per explosion | an object destroyed, or the explosive's blast |
   | `$05160C`–`$05169E` (5 sites) | the New Game descent's streaks | 5 per streak respawned | the descent only, before the main loop |
   | `$051D38` | Geiger tick | 1 per tick, 2 ticks a VBL | GEIGER COUNTER on, near the NOVABOMB |
   | `$050ED2` | zap flash | 0 | rotates one table word in place per zap |

2. **The main loop passes once per rendered frame, on foot as well as aboard.** In six on-foot
   scenes the pointer moved exactly one word per step of the frame counter `$7AE8`, and by
   nothing else. Idle frames took 7 to 13 VBLs, with a mean of 8.87 VBLs a pass over 270 passes.
   Aboard, the traces put it at 2 to 8 ([ADR 0051](../adr/0051-run-the-damocles-craft-pass-exactly-once-every-four-ticks.md)).
   An on-foot pass is also one burst of `clamp($51D22, 4, 8)` substeps
   ([ADR 0049](../adr/0049-run-one-damocles-substep-per-tick-without-st-frame-cost.md)). Every
   traced pass ran 7 or 8 of them, with a mean of 7.58.
3. **New Game does not hand the player the seed.** `$051090` seeds the pointer at word 0. The
   descent then draws 10,085 words, which is 2,017 streak respawns, before the main loop's first
   pass. The scripted arrival then runs 1,196 passes over 6,626 VBLs and draws nothing more. It
   lands the ship on the Eris Capital Spaceport runway, on exactly the port's start pose, with
   the player still aboard (`$7A8E` = 0). At that moment the pointer is `$077822`, **word 1,041**.
   Two runs with the Space press at different VBLs agree on the pointer at every one of their
   1,807 shared frames. No player input enters the sequence before rest.
4. **A zap changes the table, not the pointer.** `$050ECC` walks 65,535 longs from the pointer
   and rotates each word it visits right by one bit. 1,023 of the 1,024 words it visits turn 64
   times and come back unchanged. The word two before the pointer turns 63 times, which is a
   rotate left by one. So each zap permanently changes one table word, the one the pointer will
   next read 2,046 words later. The original's Save covers `$6140`–`$7E17` and carries neither
   the pointer nor the table.
5. **Nothing but the main loop moves the pointer in any captured pose.** All 28 rehosted
   memstates hold 64 debris particles, an empty debris clock, Geiger rate 0, and a destruction
   queue closed by slot 101's body word `$1020`. The table is byte-identical in all of them.

## Reproduce

| Item | Value |
| --- | --- |
| Pinned first-world RAM | `observe-first-world-20260818T101013Z-c5a32b7d/observed.ram`, SHA-256 `b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967` |
| Program SHA-256 | `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef` |
| Probe | `research/damocles-st/scripts/noise-draw-probe.py` |

```sh
python3 research/damocles-st/scripts/noise-draw-probe.py decode \
  --run research/damocles-st/work/observe-first-world-20260818T101013Z-c5a32b7d \
  --memstates research/damocles-st/snapshots/rehosted
python3 research/damocles-st/scripts/noise-draw-probe.py live --roms roms --case CASE
```

`decode` runs no emulator. It checks the instruction words every claim below rests on and
confirms that the twelve sites are the only pointer reads in `$40000`–`$60000`. It hashes the
routines and sweeps a memstate directory. `live` stops on every VBL and saves `$7800`–`$7F00` and
`$51D20`–`$51DA0`. Each stop is checked against the program's VBL clock `$051D98`. It then
raises unless the pointer's movement is what the case predicts. The cases are:

| Case | Start | VBLs | Passes | Words | Result |
| --- | --- | ---: | ---: | ---: | --- |
| `eris-spaceport-onfoot` | rehosted memstate, idle on foot | 399 | 36 | 36 | 11 VBLs a pass |
| `dion-2-3` | idle on foot | 399 | 50 | 50 | 8 |
| `vesta-parliament` | idle on foot | 399 | 39 | 40 | 10, one 11 |
| `gaea-ur-city` | idle on foot | 399 | 57 | 57 | 7 |
| `eris-lift` | idle in the State Office lift | 399 | 57 | 57 | 7 |
| `icarus` | idle on foot | 399 | 31 | 32 | 12 and 13 |
| `geiger` | `eris-spaceport-onfoot`, GEIGER COUNTER carried and on, NOVABOMB 64 units away | 199 | 16 | 401 | 385 ticks in 193 VBLs at rate 3 |
| `explosive` | `eris-spaceport-onfoot`, EXPLOSIVE slot 75 armed, due in 2 s, not carried | 299 | 25 | 217 | one 192-word spray |
| `new-game` | cold boot to the title checkpoint, Space pressed | 9,000 stops | 1,807 | 11,290 | the descent and arrival above |

The two interventions write the same words as
[`sound-programme-probe.py`](../../research/damocles-st/scripts/sound-programme-probe.py)'s
`geiger` and `explosive` cases. A pass count and a word count differ by at most one within a
case. That is phase, not a draw: the frame counter (`$0599A0`) and the step (`$05948C`) sit at
different points of the pass, so a VBL stop can fall between them.

## The sites

### Explosion debris, `$04CCD2`–`$04CEBC`

The spray builds `$783E` = 64 particles at `$350E0`. Each particle is six longs: position and
velocity on each axis. It draws three words per particle. The first is the heading, the second is
the elevation, masked by `$7832`. Both go through the sine table in the first 4 KiB of
`$64000`. The third, masked to `$1FFE`, indexes the log table as the speed. So one explosion draws 192 words in the pass that makes it. The debris
then lasts `$7834` = 64 passes (`$04CEBC`). `$04CF4E` steps it once a pass from the main loop
(`$05950C`) and draws nothing more.

It has two entries:

- **An object destroyed**, `$04C98E`, with elevation mask `$3FF` and no fall. `$04C8D2` reaches
  it after the per-object trigger cases for slots 1, 29, 11, 8 and 4. The callers include the
  blast's own target (`$04CAEC`) and a path on the NOVABOMB, slot 163 (`$04D440`–`$04D498`).
  The destruction queue `$04BEEE` also reaches it, and so does `$051F58`, which destroys slots
  29 and 11 together.
  The player's own craft makes no debris: `$04C9F2` sends it to `$04CBAE`, which kills the
  player instead.
- **The explosive's blast**, `$04CCA0`, with mask `$FF` and the fall `$7836` = `$FFFFD8F0`. The
  deadline writes `$7834` = `$FFFF` (`$04DAEE`), and the next pass's `$04CF4E` sees it negative
  and runs `$04CB60`. The `explosive` case caught this entry, with `$7832` = `$00FF` and `$7836`
  = `$FFFFD8F0` at the spray's stop.

The destruction queue `$04BEEE` runs every pass from `$05949E`, straight after the step. It
returns at once unless slot 101's body word `$753C` is zero. In the first world and in every
memstate it is `$1020`. So it belongs to the endgame
([#580](https://github.com/odogono/mercenary/issues/580)).

### The descent's streaks, `$051476`–`$0516CA`

The descent is the loop `$0511B2`–`$05121C`, which runs before the main loop is entered
(`$051220 jmp $5942E`). It moves 80 streaks at `$3640` toward the eye each frame. It respawns any
streak that falls behind the eye or projects off the screen, at X + 160 of `$13F` or more or Y + 68 of `$87` or more (`$0515AA`,
`$0515F6`). A respawn
draws five words: the colour (`& $3C`), X, Y, a depth exponent (`& 3`) and a depth mantissa. It
projects the new streak again (`$0516C6`), so a streak can take several respawns in one frame.
The first frames respawn all 80 at once. The loop ends when the frame counter reaches `$259`
(`$051206`). The traced frames each took one VBL.

Nothing in the descent reads input, and both traces drew the same 10,085 words. This is a
constant of the program.

### The Geiger tick, `$051D26`–`$051D74`

The Geiger tick was already decoded as a sound
([#514](damocles-sound-programmes.md#the-drivers-rules-completed)). For the table, it draws one
word each time it runs while the rate `$7A74` is non-zero and `$7A78` is zero. It runs from the
VBL handler (`$051DAC`, skipped while a palette flash runs) and from the Timer B handler
(`$05231E`). That is two draws a VBL, per VBL and not per pass. The `geiger` case confirmed 2.0
a VBL. The rate is 0 unless the GEIGER COUNTER is carried and switched on, on the NOVABOMB's
Body.

### The zap flash, `$050ECC`–`$050F0C`

The zap (`$050DFA`, which arms the zapped sound `$04C652`) calls `$050ECC`. It copies the long at
each step into the palette shadow `$8242`–`$825E` as a flash. It keeps its walk in `a0` and never
writes `$7E18`. `decode` doesn't check the net effect, but a simulation over the pinned table
does. From word *p* it changes only word (*p* − 2) mod 2048, rotated left by one bit. That holds
at every *p* tried, including 0, 1 and 2,047. The zapper is the attack ship
([#581](https://github.com/odogono/mercenary/issues/581)).

### The Script draws

The lab's Script decoder, run from all 64 trigger entries, reaches 30 `if.random` and no
`message.random`. There are 26 in the gazetteers, one in trigger `$04`, two in `$0D` and one in
`$3F`. `$04`, `$0D` and `$3F` are location triggers, and none of them is ported. `message.random`
(`$051C2C`) draws one word, masks it and adds an offset to index a bank table of messages.

## The pass rate

The frame counter `$7AE8` steps once a rendered frame (`$0599A0`), and `$05948C` steps the pointer
once in the same pass. In every case without an intervention, the two moved together to within
the one-word phase. There is no second on-foot step, and no on-foot draw in the idle scenes.

| Where | VBLs a pass | Substeps a pass | Source |
| --- | --- | --- | --- |
| On foot, six idle scenes | 7 to 13, mean 8.87 | 7 or 8, mean 7.58 | this note |
| Aboard, four traced flights | 2 to 8, mean 4.12 | none | ADR 0051 |
| The arrival, aboard under the script | mean 5.54 | none | the `new-game` case |
| The descent | 1 | none | the `new-game` case |

A frame's cost is the ST drawing a scene, so these rates belong to the scene and not to any rule.
The on-foot idle frames are constant within a scene because nothing moves. Walking changes them.

## What this means for the port

These are recommendations for a port ticket, not decisions this note makes. Two of them change
ADR 0053.

1. **Step the pointer on foot, once a pass, on the session's pass clock.** The ST steps it every
   pass in every mode, and on foot nothing else moves it unless the Geiger ticks. Holding it on foot
   (ADR 0053, decision 4) means a walk leaves the next landing's draw untouched. On the ST a
   walk moves it about 5.6 words a second. The session already counts craft passes and carries
   the count in a Save. Running that counter in every mode keeps one clock. On foot a pass is one
   burst of 4 to 8 substeps, and the port runs a substep per tick. So the on-foot period is best
   stated in ticks as substeps, and the traced scenes give **8**: 7.58 rounded, by the rule ADR
   0051 used for its 4. Scenes whose frames took under 8 VBLs ran 7, and that is a retained
   difference. Aboard it stays 4.
2. **Seed New Game at word 1,041, not 0.** That is where the ST's pointer stands when the arrival
   comes to rest on the port's start pose. The port has no descent and no arrival, and its New
   Game starts on foot at that pose. On the ST the player then waits aboard for some passes of
   their own choosing before leaving. That wait is the same kind of variation as any walk.
   `$051090` still seeds `$77000`. It is the value the descent starts from, not the value the
   player first sees. This corrects ADR 0053's decision 3 for new sessions. Saves already made
   carry their own pointer and need no migration.
3. **Reproduce each draw when its effect is ported, and not before.** None of the native effects
   is ported yet, so today only `if.random` and the pass step move the port's pointer.
   - **Explosion debris: 192 words** in the pass an object is destroyed or the blast goes off.
     This is due with the attack ship's destruction and the explosives.
   - **Geiger tick: 2 words a tick** while the rate is set and `$7A78` is zero. It counts ticks
     and not passes, so it runs on the tick clock, and `$7A78` counts down in the same ticks.
   - **Zap: rotate word (*p* − 2) left by one bit.** From then on, the table is session state. A
     Save that carries the pointer for exactness should also carry the words that differ from the
     Catalogue's table. Otherwise a restore after a zap draws the unzapped word 2,046 words
     later.
   - **The location triggers `$04`, `$0D` and `$3F`**: one `if.random` each time one is tested.
4. **The descent needs no model in the port.** Its draws are a constant that the seed in point 2
   absorbs. The streaks' 10,085 words are fully determined by the program.

With these, a mixed walk-and-fly session stays exact in passes. The draw at a landing is then as
exact as the port's pass count. What no one figure can make exact is the ST's frame cost per
scene, which ADR 0049 already excludes.

## Unresolved

- **Whether the player can leave the ship before it comes to rest.** The `new-game` case pressed
  nothing after Space. If `L` is accepted during the arrival, a player can reach the start pose
  on foot with the pointer short of word 1,041.
- **Walking frame costs.** The six on-foot scenes were idle. A walk that turns the view changes
  the frame's VBLs, and so the pass rate, but not the step per pass.
- **A shot-down object's debris** was not traced. It is decoded from the shared spray, with the
  object entry's mask `$3FF`. The `explosive` case traced only the blast entry.
- **A zap was not traced.** Its effect is decoded and simulated from the pinned table only.

## Source ranges

Half-open ranges in the pinned first-world RAM, as `decode` hashes them. The Geiger tick and
the main-loop advance match the [sound programmes](damocles-sound-programmes.md) and
[landing messages](damocles-landing-messages.md) notes.

| Range | SHA-256 |
| --- | --- |
| `$04CCD2`–`$04CEBC` debris spray | `84e69dcdc6597dcad826b32fc9e186918e20a7b3cef5a679d58d07b4197b29ed` |
| `$04CF4E`–`$04CFA4` debris step | `bd40b69c73e7ca15b5b8f07ed49a48f25298a7b52eec03887e722d009cf53bdc` |
| `$051064`–`$05122E` New Game and the descent | `3d456cad2bd7b4a5bb81c3a1b7445dd7d6deb659a38375b7ba8bcd7a343c7024` |
| `$051476`–`$0516CA` descent streaks | `4958414eb5c9242013dfba4d037c0195bc33038853b8fbe4fadecbd2efb5fe5a` |
| `$051C2C`–`$051C74` `message.random` | `60dcd08edd5062b85b853d6472e247f36bd52e04b8956967cf85e10f0bd86ea3` |
| `$051D26`–`$051D74` Geiger tick | `14a39ee31750f1c5a88fd4882955be2e04cb58aadbfa56a046bd7a2ecc20b38a` |
| `$050ECC`–`$050F0C` zap flash | `2f542b4b6b1d0c54cfa790a2c28cc6d93cea8991e1ce43e2ab410f36bb396728` |
| `$04BEEE`–`$04BF18` destruction queue | `6e26ef1869bda091850095744dfe1fcae423efc553212759c80bf37e90215d14` |
| `$05948C`–`$05949E` main-loop advance | `874dfa0dfc6ffee35ae4cbfffb5cfe391797223f9c83ac40663b4d1584801ef0` |
