# Damocles TOLOSA encounter: the attack ship, the shots, the zap and the death state

Working-Authority Evidence for [#581](https://github.com/odogono/mercenary/issues/581), recovered
2026-09-28. It follows [the moving-objects note](damocles-moving-objects.md). That note (#327) found
that resident slots 8 to 15 are a moving-object pool. It named slot 8 as the player's shot, slot
11 as the `ATTACK SHIP` and slot 15 as the ship's shot. It saw one encounter, against a parked
player with the gate injected, sampled on host time. [PR #579](https://github.com/odogono/mercenary/pull/579)
then ported TOLOSA's landing script, which arms the gate `$070104`. This note traces the encounter
pass by pass and checks every pass against an exact model. It also decodes what the hit leaves
behind. Authoritative Evidence remains bound to the C64 Reference Build. This note records decoded
ST facts only ([ADR 0002](../adr/0002-separate-rom-research-from-implementation.md)). RAM, stops and
screenshots stay ignored Restricted Material under `research/damocles-st/work/`.

## What was found

1. **The encounter runs only aboard a surface craft.** The frame loop's on-foot path,
   `$059520`–`$0596F4`, calls none of the pool routines. The aboard path calls the fire launcher
   `$050B96`, the stepper `$050ABC` and the attack routine `$050D80` in turn, at `$05987A`. The
   space path (`$059906`, the second main-loop path the issue asked about) calls the launcher and
   the stepper but not the attack routine. On foot the whole pool is frozen, so the ship neither
   moves nor fires. A control run from `damocles.tolosa`, whose ship is coasting at `$802E`,
   counted 27 frame joins and no call to any of the three routines. #327's `fire-onfoot` control
   shows this path, not the `$7AB0` gate.
2. **A three-routine model reproduces every traced pass.** Three armed runs, over 2,176 passes in
   all, match the model at both stops of every pass. Those stops are the pool before the calls
   and the pool between the stepper and the attack routine. The model covers the parked limo
   (zapped after 1,107 passes), a flying Eagle over DION (zapped after 869) and a shoot-down (the
   ship destroyed on pass 4). The camera the attack routine measures from (`$7A92`, `$7A30`,
   `$7A9A`) equalled the pose (`$7AB2`, `$7AB6`, `$7ABA`) at every stop. The frame sines the shot
   is launched through are the sines of the attitude this pass left.
3. **The ship homes in over 91-step cycles.** While its counter is negative the ship coasts and
   the attack routine returns. When the counter reaches `$7FFF` and the ship is still outside the
   `$3000` window, the ship re-steers at the separation / 64 and coasts for 91 steps (`$805A` down
   to `$7FFF`). So each cycle overshoots and leaves −27/64 of the separation. From the first
   world's stale slot-11 position the limo run needed 12 cycles, or 1,092 passes and 9,232 VBLs.
4. **Inside the window the ship stops and fires.** Its counter stays `$7FFF`, which the stepper
   skips. Slot 15 is launched from the ship at the separation / 16 for 32 steps, so it passes
   through the player's position at step 16. It hits if it comes within the `$400` box of the
   camera at some step. If it misses and expires, the ship fires again on the next pass. The flying
   run's first shot missed and its second hit.
5. **A hit kills the player.** The zap arms the zapped sound. It runs the palette-noise loop
   `$050ECC` and shows `$30` YOU'VE BEEN ZAPPED. It clears the gate and slots 11 and 15, sets the
   flash word to `$AAAA`, and sets `$7A64` to 1. The next pass's `$050F0E` sees `$7A64` = 1 and
   runs the death sequence: the view is cleared, the palette fades out and the Body readout shows
   VOID. `$21` YOU'RE A BIT DEAD - TO QUIT OR LOAD PRESS HELP is shown, and the game waits for
   HELP. Only Load, or Quit (which clears `$7A64`), leaves that loop.
6. **`$7A64` is the hazard and death state, shared with suffocation and the explosive.** 0 is
   clear and 2 is a warning held. `$8000` is the ten-second alarm, which is armed outdoors and
   timed from `$7A66`. 1 is dead. The zap, the explosive's blast (`$04CBC6`) and a hazard alarm
   that runs 500 VBLs (`$050F8C`) all set 1. `damocles.tolosa` and 15 other rehosted on-foot
   memstates hold `$8000`. Boarding a craft clears the alarm's bit (`$054368`).
7. **The player's shot is the craft speed's exponent along the view.** `$050B96` adds `$000A1F00`
   to the speed `$797A` with the float add `$04BD34`. It then keeps only the sum's exponent
   (`clr.w d5`). The three velocities are `cos pitch · sin yaw`, `sin pitch` and
   `cos pitch · cos yaw`, from the frame sines `$7AD6`–`$7AE2` through the log tables. Each is
   scaled by 2 to that exponent and converted with the Mover's float-to-long rule. A parked
   craft's shot moves 1,024 units a step for 32 steps.
8. **The kill needs the ship on the current Body.** `$050B28` runs only when slot 8 has just
   stepped. It compares slot 11's body byte with the selector's low byte `$7AA9` and tests the
   `$400` box on a separation whose X and Z high words are cut to a byte. A kill shows `$31`
   ENEMY SHIP DESTROYED through the shortened helper `$054808`. It flashes `$AA00`, clears the
   gate and clears both slots' counters and records. In space the selector is `$FFFF`, so no kill
   is possible.
9. **The encounter is not tied to TOLOSA.** Nothing reads which Body the player is on except to
   stamp the objects it places. After a landing elsewhere the ship's stale position is measured
   against the new Body's coordinates, and it re-steers and restamps its body byte there.

## Reproduce

| Item | Value |
| --- | --- |
| Pinned first-world RAM | `observe-first-world-20260818T101013Z-c5a32b7d/observed.ram`, SHA-256 `b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967` |
| Program SHA-256 | `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef` |
| Probe | `research/damocles-st/scripts/encounter-probe.py` |
| Golden Traces | `traces/damocles/encounter/{limo-armed,airborne-armed,limo-ahead}.json` |

```sh
python3 research/damocles-st/scripts/encounter-probe.py decode \
  --run research/damocles-st/work/observe-first-world-20260818T101013Z-c5a32b7d \
  --memstates research/damocles-st/snapshots/rehosted
python3 research/damocles-st/scripts/encounter-probe.py control --roms roms
python3 research/damocles-st/scripts/encounter-probe.py live --roms roms --case CASE
python3 research/damocles-st/scripts/encounter-probe.py death --roms roms
python3 research/damocles-st/scripts/encounter-probe.py export --trace WORK_RUN --out traces/damocles/encounter/CASE.json
```

`decode` runs no emulator. It checks the 31 instruction words the claims rest on, hashes the
routines and reports the pool in the first world and in every memstate. `live` boots a memstate
and chains two PC breakpoints a pass, at `$05987A` and `$059886`. Each stop arms the other,
because a PC breakpoint re-armed on its own instruction fires again at once. Both stops save
`$6100`–`$7400`, `$7800`–`$7F00`, the bank longs, the VBL block, the sound vectors and the noise
table. `analyse` then runs the model from each pass's first stop and compares slots 8, 11 and 15
and the gate at both later stops. It raises on any difference. `control` counts PC hits with
`:trace` breakpoints, which do not stop the machine. `death` forces a zap on the next pass and
then stops on every VBL, with a screenshot each time.

| Run | Start | Writes | Passes | VBLs | Events | Mismatches |
| --- | --- | --- | ---: | ---: | --- | ---: |
| `encounter-limo-armed-20260928T190738Z-8d3c0702` | `boarded-limo`, parked | gate = 1 | 1,107 | 9,386 | 12 steers, 1 ship shot, zap | 0 |
| `encounter-airborne-armed-20260928T190931Z-53a74d3c` | `dion-north-airborne`, flying | gate = 1 | 869 | 7,246 | 9 steers, 2 ship shots (one expired), zap | 0 |
| `encounter-limo-ahead-20260928T191240Z-2b035ea5` | `boarded-limo`, fire held | gate = 1, ship parked six shot steps ahead, coasting `$8050` | 200 | 1,793 | 8 shots, kill on pass 4 | 0 |
| `encounter-control-tolosa-20260928T190724Z-061502cb` | `rehosted/tolosa`, on foot | none | 27 frame joins | ~4 s | no pool call | — |
| `encounter-death-boarded-limo-20260928T191136Z-fd1d6406` | `boarded-limo` | gate = 1, ship inside the window at `$7FFF`, slot 15 on the camera | — | 400 | zap, death loop | — |

All three armed runs are **instruction-level checkpoints, not ordinary routes**. They write the
one word TOLOSA's landing script writes, and `limo-ahead` and `death` also place pool records. An
ordinary route reaches the same state only by landing on TOLOSA aboard. The traced memstates were
captured on foot there, where the pool does not run.

## The pool

The records are the resident arrays, indexed by `slot × 4`, as #327 decoded them: the lifetime
counter at `$612A`, the velocities at `$614A`/`$616A`/`$618A`, the position at
`$63A8`/`$67A8`/`$6BA8` and Association B at `$73A8`, whose byte 0 is the body byte. Only slots
8, 11 and 15 are ever written. The in-game save covers `$6140`–`$7E17`, which holds all of them,
and it mirrors `$070104` into `$7808`. So a save carries the encounter mid-flight.

### The stepper, `$050ABC`

For each slot from 15 down to 8, it does nothing if the counter is 0 or `$7FFF`. Otherwise it
decrements the counter. A counter that reaches 0 clears the record's Association B, and the slot
does not move that step. Otherwise it adds the three velocities. If the new Y is negative and
`$7AAE` is not 2 (space), Y is set to −1. After slot 8 steps, the stepper runs the kill test and
returns, so it can end the loop only on its last slot.

### The attack routine, `$050D80`

```
gate $070104 clear                  → return
slot 11's counter negative          → return            (coasting)
ship − camera outside the $3000 box → steer: velocity = −((ship − camera) >> 6) per axis,
                                      counter $805A, body byte $7AC9, return
slot 15's counter zero              → fire: counter $20, body byte $7AC9, position = ship's,
                                      velocity = −((ship − camera) >> 4), thud $04C630, return
shot − camera outside the $400 box  → return
                                    → zap
```

The shifts are `asr.l`, so a separation of −1 steers at −1, not 0. The box test `$0541BA` shifts
the radius and each component left by four as longs, and it negates each negative component.
Then it compares them unsigned. A component of 2²⁷ or more therefore wraps, but no traced
separation came near that. The separation `$05416E` is a plain long subtraction with no wrap.

The zap does not clear the counters. Slot 11 stays at `$7FFF`, and slot 15 runs out its steps
with no record. A later arming therefore finds the ship parked where it fired from, and measures
from there at once.

### The player's shot, `$050B96`

The launcher refuses unless the fire bit (bit 7 of `$79C2`) is set, `$7AB0` is non-negative,
`$7BBE` is zero and slot 8's counter is zero. Aboard, `$7AB0` is the occupied slot and is never
negative, so a held fire button fires again on the pass after each shot expires. That is one shot
every 32 passes. The launch arms the shot programme `$04C610`, stamps `$7AC9` and sets the counter
to 32. It sets the position to the pose and computes the velocity as in finding 7. The stepper
then moves the new shot in the same pass.

### The kill, `$050B28`

The kill test runs when slot 11's body byte equals `$7AA9`. Its separation is slot 8 minus slot 11,
with X and Z computed by `swap`, `ext.w`, `swap`. That sign-extends the low byte of the high word,
which makes the surface's 256-cell wrap. It hits inside the `$400` box. The kill arms `$04C610`,
flashes `$AA00` and shows `$31` through `$054808`, whose shorten flag ends the message at 50 frames
([message reveal](damocles-message-reveal.md)). It clears the gate, slot 11's counter, record and
Association A byte 1, and slot 8's too.

## The zap, the flash and the death

The `death` run pokes a zap into the next pass and stops on every VBL:

| VBL | What happens |
| ---: | --- |
| 0–97 | The zap pass is inside `$050ECC`: 65,535 steps, each writing one noise-table long to palette registers 1–15. The whole screen, panel included, shows shifting bands of noise colours. The main loop is blocked, and the VBL handler still runs. |
| 98 | `$7A64` = 1 and the flash word `$51D24` = `$AAAA` |
| 98–113 | The VBL handler shifts the flash word left once a VBL. Each set bit it shifts out paints the view's palette white with colour 0 black, and skips that VBL's Geiger tick. That makes 8 white VBLs out of 16. |
| 106–154 | The death sequence: `$059CE2` clears the view, then 8 fade steps 8 VBLs apart each take one level off every palette component (`$050FAC`). YOU'VE BEEN ZAPPED scrolls in during the fade. |
| 162 | `$7AA8` = `$78`, and the readout shows VOID. The pressure and temperature words are cleared. |
| then | `$21` is shown, and the loop at `$051016` reads keys until HELP (`$62`) opens the menu `$0A`: F1 save, F2 load, F10 quit. |

The zap changed exactly one table word, word 12 (`$4016` → `$802C`), two before the pointer. That
is the rotation [the noise-draws note](damocles-noise-draws.md) predicted. The table lies outside
the saved range. So a load in the same session keeps the zapped word, and a fresh boot does not.

The death loop is the same one suffocation reaches. The first `live` attempt from
`damocles.tolosa` shows it: the pool never ran on foot, the alarm reached 500 VBLs, and the screen
went to VOID with `$21`.

## What this means for the port

- Port the three routines as one pass over a pool of slots 8, 11 and 15, run after the craft
  Mover's pass aboard. In space, run only the launcher and the stepper. On foot, run nothing. The
  Golden Traces give each pass's inputs and pool, so a test can step them exactly.
- The shot needs a fire control, held rather than pressed.
- The ship and both shots are drawn as surface residents while their body byte is the current
  Body's.
- A hit needs a death state the port does not have. That state has the noise flash, the white
  flash, the fade, VOID and `$21`, and only a restore leaves it. A Save made while dead should
  restore dead, as the original's F1 does.
- The Save must carry the pool, the death state and the zapped table words. The table is now
  state, not content.
- The hazard alarm (`$8000`, ten seconds, then FROZEN, FRIED or SUFFOCATED) uses the same death
  state and is not ported. It is a separate ticket.

## Unresolved

- Whether an ordinary route reaches the encounter from a real TOLOSA landing aboard. The landing
  script runs on arrival, and the player is still aboard then, so it should. But no run landed
  there.
- The zap's noise-flash length in VBLs is measured, not derived. It depends on the loop's cycle
  count against the interrupt load.
- Whether a frozen shot left in the air by leaving the craft can be taken on foot. Slots 8 and 15
  are takeable by their handling bytes.

## Source ranges

| Range | SHA-256 |
| --- | --- |
| attack `$050D80`–`$050ECC` | `d110bbdd55f0eaa65625b5de6ff1c22494f011d76f579e731581be0ca61af7f1` |
| stepper and kill `$050ABC`–`$050B94` | `3790b28083bd00b3b00b412c04c67e5b1214660b08291e44d34cbf9f12e47ab8` |
| player's shot `$050B96`–`$050D80` | `b87e8fd1f4e837abd1f646e26f08dad7e481ea4c1ffed125b288607044a120f1` |
| zap flash `$050ECC`–`$050F0C` | `2f542b4b6b1d0c54cfa790a2c28cc6d93cea8991e1ce43e2ab410f36bb396728` |
| hazard and death `$050F0E`–`$051036` | `91d69500da7a5070a43d1bf20698df8d302e17e18c95360f405a9ac0715bdc37` |
| box test `$0541BA`–`$0541E0` | `074be82f6b42b019ffbcedba7daae670384559339e6d2e4ef692179c6e3d372b` |
| separation `$05416E`–`$05418E` | `7bb847a6cd15022c31faf49173e05b8496ea1c241c0f38b7ee03bee4d1a4dacb` |
