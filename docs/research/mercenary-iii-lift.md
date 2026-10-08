# Mercenary III: the lift, its Floors and what a Save needs

Research for [#835](https://github.com/odogono/mercenary/issues/835), 2026-10-08. It extends the pinned **Mercenary III research baseline** in the manner of the [prison door](mercenary-iii-prison-door.md). It compares the Mercenary III lift with the Damocles Lift ([control](damocles-lift-control.md), [ride](damocles-lift-ride.md), [movement](damocles-lift-ride-movement.md), [Floor binding](damocles-level-structure-binding.md), [Floor Label](damocles-floor-label.md)). Following [ADR 0002](../adr/0002-separate-rom-research-from-implementation.md), RAM, logs, disassembly and screenshots remain ignored Restricted Material under `restricted/mercenary-iii-835/`.

## Outcome

**Mercenary III's lift is the Damocles Lift.** The key test, request, step, arrival and rebind are the same instructions at other addresses, and they read the same Floor Table layout. A ride in a METIS building, traced live, shows the Damocles sequence step for step:

1. **Where.** A lift car is a structure region whose flags have bit 13 (`$2000`). On foot (`$7142` = 1), with `$6F32` zero, the dispatcher `$5685A` turns eleven ST keys into a Floor request: `1`–`9` for Floors 1–9, `0` and `B` for 10, and `G` and `Esc` for 0.
2. **Request** (`$56D66`). The Floor the label shows (`$7158`) is refused, and so is a Floor whose Floor Table entry is zero. An admitted Floor goes to the destination `$6F3A`. The request writes `$80` into the high byte of the doorway door's key word `$3E1A(a0)`, which forces the door shut, and sets that door's latch to `$01` (moving). The doorway is the slot the region scan last named, `$717E`. Refusals are a bare `rts`.
3. **Step** (`$56CF4`). It runs once a substep while `$6F3A` is non-negative (`$5A4E2`), before the walk, the door mover and the region scan. It waits while the pinned door's latch is non-zero. Then it counts `$6F3E` down from 25 (`$6F3C`, a constant) and moves the label along B, G, 1 … 9. Each step writes `$7158` and the label byte `$B2D0`.
4. **Arrival** (`$56D98`). One period after the label shows the destination, `$6F3A` becomes `$FFFF` and `$719A` and `$7260` are cleared. If the alias record's palette byte is zero, the Floor's own palette is bound. The label is rewritten and Y becomes Floor × pitch (`$7198`) + 63 (`$714C`). The rebind `$56E2C` levels the pitch (`$7154` ← `$1FF`), binds the Floor's structure with its doors shut (`$5AD30`), scans the region afresh and cuts channels B and C. The arrival ends in the key click `$55B6A`. X, Z and the heading are unchanged.
5. **Freeze.** While a ride is pending, the region scan accepts no region (`$5B320`), so the clamp holds the player in the car.

The live trace (cell 4, slot 154) shows each of these: `3` is admitted and the door closes before the label moves; the label steps G, 1, 2, 3; on arrival Y is 513 and the Floor 3 structure is bound; the cut and the key click sound and the door reopens. `B` (Floor 10, zero in the table) and `3` (the label's Floor) are refused. `G` rides 3, 2, 1, G back to Y 63.

## Baseline and method

| Item | Value |
| --- | --- |
| Program | STX `4e8b74122910bcaa109b944eebb6f0ec18fdeb1175c34eea3c932d0e1b18b62c` |
| TOS | EmuTOS `154803e3ff4851f3dc358b91b16d6b6110d187a81d8132ecb665af49878939d5` |
| Static source | coherent first-top `restricted/mercenary-iii-708/presentation/exact2/start.ram`, `71b957b3b7124959b01bd40b896c921d37902c18cfca042bef1906b155ef0170` |
| Damocles comparison | first-world RAM `b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967`, the windows #471 and #472 pinned |
| Emulator | Hatari 2.6.1, **build `47de9d76c6d40520d0cbe26e31d14809a8768875c18632410e4c503532e52331`** |
| Probe | [`m3lab/lift.py`](../../research/mercenary-iii-st/m3lab/lift.py) |

**Emulator deviation.** The pinned Hatari 2.6.1 binary (`05723606…`) is no longer on the lab machine; Homebrew reinstalled 2.6.1 as a different build on 2026-10-07. The live runs used that build through the probe's explicit `--hatari-sha256`, and each run records the hash in `emulator.json`. The lab's pin is unchanged. The static findings, and the agreement of the live trace with them, do not depend on the build.

`decode` reads the coherent opening and checks the constants and the key, pin and rebind bytes. Each slice below was disassembled from that RAM and from the Damocles first-world RAM and compared instruction by instruction. `live` cold-boots the baseline, enters play at VBL 6000 and stands the player in the hall of the cell-4 building at local (−160, −700), facing −Z. It uses the game's own object-destination path (`scene.pose_pokes`, VBL 6500). Then:

- the stick is held forward from 6600 to 7000, walking through the doorway into the car;
- `3` is pressed at 7100, `B` at 7500, `3` at 7600 and `G` at 7700.

Persistent breakpoints log each write to `$6F3A`, `$7158`, `$714C` and the car door's word `$406C`, and each pass of the request (`$56D7E`), arrival (`$56D98`), cut (`$56E86`), key click (`$55B6A`) and the door-moving and door-stop arms (`$5BA18`, `$5B9CA`).

## Shared with Damocles

| Mechanism | Damocles | Mercenary III | Difference |
| --- | --- | --- | --- |
| Key test | `$0555DC` | `$5684C` | On-foot word `$7AAE`/`$7142`; digit mode `$7882`/`$6F32`; region flags `$7B34`/`$71CC` |
| Request | `$055AE0` | `$56D66` | None; Floor Table pointer `$7C1E`/`$72BA`, doorway `$7AE6`/`$717E` |
| Pin | `$5A42`/`$5A41 + slot` ← `$80`/`$01` | `$3E1A`/`$3E19(a0)` ← `$80`/`$01` | The attachment workspace's base only |
| Step | `$055A6E`, period `$788C` = 25 | `$56CF4`, period `$6F3C` = 25 | Label buffer `$CD04`/`$B2D0` |
| Frame gate | `$059562` | `$5A4E2`, inside the substep loop | Same placement: before the walk, the doors and the region scan |
| Arrival | `$055B12`–`$055B88` | `$56D98`–`$56E0E` | Clears `$719A`, `$7260` where Damocles clears `$7B02`, `$7BC8` |
| Rebind | `$055BA6`–`$055C78` | `$56E2C`–`$56ECE` | Mercenary III writes the four YM registers unconditionally; Damocles skips each while `$033F68` is set. It clears `$6FF44` where Damocles clears `$070108`/`$070100` |
| Sound request | `$054848` (effect `$04C556`) | `$55B6A` (key click `$4C986`) | The same 1302 Hz tone under envelope shape 9 on channel B. Guarded by `$70A2`/`$72A8` rather than `$7A0C`/`$7C0C` |
| Entry at a Floor | `$055B8E`, `$7B02` | `$56E14`, `$719A` | The object-destination path sets `$719A` from the committed Floor `$7138` (`$5A140`) before it enters |
| Region freeze | `$05A35C` | `$5B320` | None |
| Committed Floor | `$7AA4`, copied from `$7AC4` each frame | `$7138`, copied from `$7158` each frame | The resident Floor match `$53C66` reads `$7138` |
| Floor Table | alias record + 6, palettes + 18 | alias record + 6, palettes + 18 (`$560F4..$5614C`) | None; pitch is the record word's low 15 bits |
| Floor Label | wall text `$80`/`$81` → `$CD04` | wall text `$80`/`$81` → `$B2D0` | None |

**Not recovered here.** What `$6F32` holds when it is non-zero (digit keys then go to `$5A078`). Damocles's `$7882` is unrecovered as well. Every capture here reads it as zero.

## Observed ride

From the first run, `ride1-47ttyfvc`. A second run, `ride2-7wg1cnhq`, gives the same sequence of 50 tagged hits with identical values; its VBLs differ by up to 7, the session jitter #645 recorded.

| VBL | Event |
| ---: | --- |
| 6623 | Walking into the door's box: door-moving (latch `$4201`) |
| 6706 | Latch `$42FF`, door-stop; the player crosses the doorway region `$83FC` and `$717E` becomes `$254` |
| 7106 | `3` admitted: `$6F3A` = 3, key word `$8000`, latch `$4201`, door-moving |
| 7166 | Door shut (latch `$4200`), door-stop; the countdown starts |
| 7189, 7220, 7241 | `$7158` becomes 1, 2 and 3 |
| 7269 | Arrival: `$6F3A` = `$FFFF`, Y 513; the bind clears the key word |
| 7270 | Cut, key click; door-moving as the new Floor's door opens around the player |
| 7330 | Door-stop, latch `$42FF` |
| 7500, 7600 | `B` and `3`: no request pass |
| 7705 → 7868 | `G`: door closes by 7765, `$7158` 2, 1, 0 at 7789, 7818, 7839, arrival at 7868 with Y 63 |

The door's travel is 64 units (its leaves span X −232..−88, halved, less the 8-unit inset), so it swings in 65 substeps. Each label step is 25 substeps. The intervals in VBLs vary, 21 to 31, because a frame runs 4 to 8 substeps (`$5A4C2`). From the admission to the arrival took 163 VBL: 65 substeps of door and 100 of countdown.

The Floor 3 capture (`v7450`) holds the region table of `structure-0116b8` exactly: the car `$A000`, the doorway `$83FC` and three `$8000` rooms. Floor 0's own table has fourteen regions, with outdoor `$C000` regions and indoor-with-exit `$D000` regions. Floors above 0 have no region with bit 14, so, as in Damocles, the player leaves a building only from Floor 0.

## METIS Floor Tables

The promoted structures that bind more than Floor 0. The cells are given as the panel shows them (x-z). `$60` (00-06) is the issue's building. The last column counts the lift regions on each Floor.

| Group | Slot | Cells | Floors | Pitch | Upper Floor structures | Palettes | Lift regions |
| --- | ---: | --- | --- | ---: | --- | --- | --- |
| METIS | 149 | `$03` (03-00), `$11` (01-01), `$12` (02-01), `$13` (03-01) | 0–4 | 160 | `structure-01246a` (1–3), `structure-0127b8` (4) | 46 | 2 |
| METIS | 154 | `$04` (04-00), `$10` (00-01) | 0–9 | 150 | `structure-0116b8` | 66 | 1 |
| METIS | 155 | `$20`, `$30`, `$40`, `$50`, `$60` (00-02 … 00-06) | 0–9 | 150 | `structure-0116b8` | 66 | 1 |
| METIS | 246 | `$31` (01-03) | 0–2 | 150 | `structure-00eb3a` | 136 on 0, 137 above | 1 |
| METIS | 247 | `$22` (02-02), `$23` (03-02), `$42` (02-04) | 0–2 | 180 | `structure-017b32` | 138 | 1 |
| METIS | 248 | `$43` (03-04) | 0–2 | 180 | `structure-017b32` | 138 | 1 |
| METIS | 249 | `$34` (04-03), `$44` (04-04) | 0–2 | 180 | `structure-017b32` | 138 | 1 |
| TOLOSA | 49 | `$12` (02-01) | 0–8, 10 | 150 | `structure-010fb0` (1–8), `structure-0106b0` (10) | 50 | 1 |

The Catalogue already decoded these tables (#683, `catalogue_interiors.floor_binding`). Only slot 246 leaves its record's palette byte zero, so only its Floors take their own palette. Every table is contiguous in step order. TOLOSA HQ's gap at 9 lies beyond 8, and B sits next to G, so no ride passes an unbound Floor. That is the property Damocles's tables have.

**Payload.** The TOURCRAFT export now publishes each promoted structure's Floor Table as `floors` in `promotion.json`. It also selects the seven upper-Floor structures in the scales their placements bind them, and palette 137. They come from the Catalogue's immutable records, with their source ranges, as resident models do (#756).

## Sound

There is no lift programme. A ride plays:

- **Doors.** Door-moving `$4C7AA` arms on channel C when the pinned door starts closing (at the admission, the pass that sets latch `$01`), and door-stop `$4C6E8` when it shuts. These are the prison door's programmes ([#645](mercenary-iii-prison-door.md#one-pass)). The pair plays again when the new Floor's door opens.
- **Silence** while the label steps. The step writes no PSG register.
- **Arrival.** The rebind cuts channel B and C levels to 0, writes the mixer from `$72A0` and the noise period `$1F` (`$56E86`, the Leave cut). The arrival then requests the key click `$4C986` on channel B through `$55B6A`.

The port's cues for these already exist: `door_moving`, `door_stop`, `cut` and `key_click`.

## What a Save needs

At rest, the Floor alone: the bound structure, its doors and the region are all rebuilt from it, and `$7158` = `$7138` = the Floor. During a ride:

- the Floor still bound, which is the departure Floor until arrival;
- `$6F3A`, the destination;
- `$6F3E`, the countdown, 1 to 25;
- `$7158`, the Floor the label shows;
- `$717E`, the doorway whose door is pinned;
- the pinned door's latch and leaf position, which the door state already carries ([#645](mercenary-iii-prison-door.md#restore-evidence)).

The region is frozen, so a ride can be restored only in a lift region. `$717E` outlives the cell it was set in. Nothing clears it, and a stale slot names no door of a later structure, so a ride there waits on no door. The port keeps it as saved state for that reason.

## Reproduction

From `research/mercenary-iii-st`:

```sh
python3 -m m3lab.lift decode ../../restricted/mercenary-iii-708/presentation/exact2/start.ram
M3_HATARI=<hatari> python3 -m m3lab.lift live --name ride --hatari-sha256 <its SHA-256>
python3 -m m3lab.lift trace ../../restricted/mercenary-iii-835/runs/ride-<suffix>
```

Omit `--hatari-sha256` when the pinned build is available. `trace` prints one line per tagged hit: destination, countdown, `$7158`, label, Y, region flags and index, structure, doorway, the door's latch and key words, and local X/Z. To compare the static code with Damocles, disassemble each pair of windows below from the two RAM images.

### Inspected slices

From the coherent opening `71b957b3…0170`. The key click's hash is the one [R2](mercenary-iii-taxi-content-presentation.md) pinned.

| Half-open range | Meaning | SHA-256 |
| --- | --- | --- |
| `$5684C..$56884` | Lift key test: on foot, no digit mode, region bit 13 | `60a135b88e8ffd70dd2ad5dbdc956a0a0f38b9d001fa7066b76982c08c442621` |
| `$56CF4..$56D66` | Step: wait for the door, count 25, move the label | `3dfffc85c78fa73b09ffe7e6c270d32c338c3b0a8b01b7ddb4fc0d41db6518ba` |
| `$56D66..$56D98` | Request: refuse the label Floor or a zero entry, pin the door | `a292716d2fee7cecdb7afe81898f6a004102a7d9909c420e6e4fc9fb3401b02a` |
| `$56D98..$56E14` | Arrival: palette, label, eye height, rebind, key click | `fcd8cb15547e84a82bf60105c82326657cbfb3e1165eaef377fcb873a8ebfd7d` |
| `$56E14..$56ECE` | Entry at a Floor, and the rebind with the B/C cut | `c5eb9415dedfba70525bb23bf1d49fe89c17f5d7e03c4899045b7b0db864e427` |
| `$5A4E2..$5A4EC` | Substep loop: step only while a ride is pending | `3f4cceac59fbaa08929d06643398aa559c477917cf400c16d9e74c3796b74ce4` |
| `$5B320..$5B328` | Region scan: no region is accepted during a ride | `0bfec9cf1fccff854046a7a45e41766cc9a9edd5a8dc7798e1a31757db6ab331` |
| `$560F4..$5614C` | Cell bind: pitch `$7198` and the Floor Table `$72BA` | `724a98bc00155eb8c729d93e6c80f22159d93cf6f6e3595a8754e6bf79847e60` |
| `$55B6A..$55B9E` | Key click `$4C986` on channel B | `7488585d7be37c014a195105e073ab3cc36d25ccd0fafc857dbde7ea89e2ee37` |

### Artifact identities

Paths are relative to ignored `restricted/mercenary-iii-835/runs/`.

| Artifact | SHA-256 |
| --- | --- |
| `ride1-47ttyfvc/v7050.ram` (in the car, Floor 0) | `6efacfba2d7679aee605cc457cc6b51972256f95dd5d036451d57f4e0cf2836e` |
| `ride1-47ttyfvc/v7200.ram` (label stepping) | `1be6e651e05d6e97f6904478975eaa04d039c238659416093863a91611140c05` |
| `ride1-47ttyfvc/v7450.ram` (Floor 3) | `6536f291705dc2994e9f8b516a981ef5d67c3c76b9cf55831821fe83d2d30674` |
| `ride1-47ttyfvc/v7650.ram` (after the refusals) | `9ee6db68b434c81cfbce3c67dc55a6ee6988f71cc515a34d3aa0ac211ce6ea05` |
| `ride1-47ttyfvc/v8100.ram` (back on Floor 0) | `bb5190a250f23e922816c19e4f5867d3cb3f72761474203e385096d6ccb8782c` |
| `ride1-47ttyfvc/hatari.log` | `9b65f10f2e8f1635ce8c1b3ae7452b0c7c190001df99e1c179d63164b6dfb819` |

## The port

The rules both titles run are shared in [`web/src/structure/lift.ts`](../../web/src/structure/lift.ts) ([ADR 0079](../adr/0079-share-the-lift-across-damocles-and-mercenary-iii.md)), which Damocles now uses too: the request, the 25-tick step, the B/G walk, the arrival pitch and the label characters. Each title binds its own Floor's structure, doors and sounds on arrival. In Mercenary III, `TourcraftSession` steps the ride first in each substep. It pins the doorway door and freezes the region, and on arrival it binds the Floor, levels the view and cues the cut and the key click. The frame binds the Floor's structure at the Floor's height, with tokens `$80` and `$81` showing the live label. `owners.location.floor` follows `$7138`. The Save carries `tourcraft.lift`: the Floor, the ride and the doorway (schema 8). The console's `floor N` binds a Floor at once, as Damocles's does.

The port arms door-moving at the admission rather than on the next pass. Both happen in the same VBL in the trace.
