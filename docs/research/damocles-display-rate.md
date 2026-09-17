# Damocles display mode and frame rate

Working-Authority Evidence for [#305](https://github.com/odogono/mercenary/issues/305), recovered 2026-09-17. Damocles runs in **ST low resolution** and **never programs the Shifter's sync mode**: the field rate is the machine's, inherited from whatever the ROM set at power-on, and the program has no branch that reads it. On the PAL machine the Novagen UK release was sold for, that is **50 Hz** — measured at **50.05 Hz**, 160256 CPU cycles per field — so one display frame is **20.0 ms** and the recovered 200-frame durations are **4.00 s** each.

[ADR 0002](../adr/0002-separate-rom-research-from-implementation.md) permits factual recovery, not translation of the Working Authority into application code. Captures, RAM and native listings remain ignored Restricted Material under `research/damocles-st/work/`, consistent with the [research boundary](damocles-gap.md); only decoded facts and hashes are recorded here.

## What was asked

[The limo-key pickup research](damocles-limo-key-pickup.md#what-the-ordinary-pickup-does-observed) established that the script wait counter `$7B9C` advances exactly once per VBL and that the recovered wait and message durations are **200 display frames** each. It could not state them in seconds: the laboratory's Hatari configuration ran at about 61 VBL/s, which is the laboratory's rate and not the Working Authority's. [The interaction contract](../design/damocles-limo-key-interaction.md) therefore authored `vblHertz` at 50 and left this note to confirm or correct it.

## Evidence and method

Runtime evidence comes from the tracked [display-mode probe](../../research/damocles-st/scripts/display-mode-probe.py). Its instrument is a pair of Hatari *change* watchpoints on the two Shifter registers that select the display mode:

| Register | Meaning |
| --- | --- |
| `$FFFF8260` | resolution — 0 low (320x200, 16 colours), 1 medium, 2 high |
| `$FFFF820A` | sync mode — bit 1 set selects 50 Hz, clear selects 60 Hz |

`b (addr).b ! (addr).b :trace :lock` reports every change of that byte, with the program counter that made it, without stopping the machine. Armed in the `--parse` script, the pair covers a session from its first instruction, so a cold boot that reaches the first world under one armed pair answers "who sets the mode, and when" for the whole of that session — including the disk loader, whose code does not survive in the resident image.

The frame period is measured in **emulated cycles**, never host seconds: the host rate is a property of this laboratory's scheduling and says nothing about the original. `CycleCounter`, `FrameCycles` and `VBL` are read at two stops, and subtracting `FrameCycles` at each stop leaves a span of whole fields, so the mean is exact. An ST Shifter runs 512 cycles x 313 lines = **160256** cycles per field at 50 Hz and 508 x 263 = **133604** at 60 Hz, which identifies the mode without ambiguity.

Real hertz come from `_hz_200`, the TOS counter at `$4BA` that the MFP's Timer C advances at exactly 200 Hz from the MFP's own clock, which the Shifter's sync mode does not touch. Damocles takes the machine over and stops that counter — it advances **0** ticks across every gameplay measurement below, which is itself evidence that the program owns its interrupts — so the `tos` case measures it on the same machine with no floppy, at the desktop, where it still runs. That transfers to gameplay precisely because the program never changes the sync mode.

A static pass over the resident 1 MiB image reports every 68000 instruction that names those registers, in all three encodings that reach one: absolute short in a source effective address, absolute short in a MOVE destination, and a 32-bit absolute long constant. The video base and palette registers are scanned as **positive controls** — the program demonstrably writes both, so a scan that finds them and not the mode registers is a scan that would have found the mode registers.

```sh
python3 research/damocles-st/scripts/display-mode-probe.py --roms /path/to/roms --case boot
python3 research/damocles-st/scripts/display-mode-probe.py --roms /path/to/roms --case boot --country uk
python3 research/damocles-st/scripts/display-mode-probe.py --roms /path/to/roms --case tos --country uk
python3 research/damocles-st/scripts/display-mode-probe.py --roms /path/to/roms \
    --case scene --snapshot interior-window
python3 research/damocles-st/scripts/display-mode-probe.py --roms /path/to/roms --case sync-poke
python3 research/damocles-st/scripts/display-mode-probe.py \
    --scan-ram research/damocles-st/work/<run>/observed.ram
```

## The display mode

Every sample in every run below reads the same two registers:

| Register | Value read | Decoded |
| --- | --- | --- |
| `$FFFF8260` | `$FC` | low resolution — 320x200, 16 colours. The byte is `$FC` rather than `$00` because only bits 0-1 are implemented and the rest read as ones. |
| `$FFFF820A` | `$00` or `$02` | 60 Hz or 50 Hz, **depending on the machine and not on the program** |

The video base at `$FFFF8201`/`$FFFF8203` alternates between `$068000` and `$078000` during play, which is the double buffer, and is the only video register the program is seen to touch.

No mode change of any kind occurs during play. The resolution is set once, at boot, and the Filled Presentation is a low-resolution 16-colour screen throughout.

## The program does not set the sync mode

**Nothing in the resident image names either register.** The static scan finds zero references to `$FF820A` and zero to `$FF8260` in the pinned first-world capture and in all seven captures taken from the running program below, while finding the positive controls in every one of them: the video base high byte written at `$059984`, and the palette base read at `$05090C` and `$051DA0`. The one apparent `resolution` hit — at `$07FF40` in the pinned first-world capture — is the four bytes `FF FF 82 60` lying among EmuTOS ROM addresses such as `$00E0095C`, not preceded by an opcode word that would make it an effective address. The same residue, at `$000D6C` and again beside EmuTOS ROM addresses, appears in a no-floppy TOS capture where Damocles has never run, which is what it is: TOS's own workspace, not program code.

**Nothing writes either register after the ROM does.** Armed from power-on, the watchpoints report exactly two changes in a cold boot that runs through the loader, the title screen and the load of the first world, and both are in the EmuTOS ROM during its own start-up:

| Register | Value | Program counter | When |
| --- | --- | --- | --- |
| `$FFFF820A` | `$02` (under `--country uk`) | `$E10348` | ROM start-up, VBL 130 |
| `$FFFF8260` | `$FC` | `$E104F6` | ROM start-up, VBL 130 |

Under the laboratory's default country EmuTOS leaves `$FFFF820A` at its reset `$00` and only the resolution write is reported. Either way, once the Damocles loader takes the machine neither register is touched again — not by the loader, not by the title screen, not by the world load, and not by any scene reached below.

So the sync mode is an **inherited** property of the machine. The program has no PAL/NTSC branch, because it never reads the register either; it simply runs one field per VBL at whatever rate the Shifter is already producing.

## The rate that follows

Measured on the same machine and TOS pin, at the desktop where `_hz_200` still runs:

| Sync mode | `$FFFF820A` | Cycles per field | Fields / `_hz_200` ticks | Field rate | Frame period |
| --- | --- | ---: | ---: | ---: | ---: |
| 50 Hz (`--country uk`) | `$02` | **160256** | 13394 / 53518 | **50.05 Hz** | **19.98 ms** |
| 60 Hz (laboratory default) | `$00` | **133604** | 16230 / 54064 | 60.04 Hz | 16.66 ms |

Both cycle figures are exact: 160256 = 512 x 313 and 133604 = 508 x 263. The measured 50.05 Hz is the PAL Atari ST's true field rate, and it is what the laboratory's earlier "about 61 VBL/s" was standing in for — that figure was host wall-clock over a 60 Hz configuration, and neither half of it belongs to the original.

**Which of the two is the original's** is not a fact the image carries, because the image does not choose. It follows from the machine: the Working Authority is the Novagen **UK** release (`damocles_-_mercenary_ii_novagen_software_(uk).stx`), and a UK Atari ST boots its ROM into 50 Hz PAL. The corroborating Amiga edition recorded in [the gap note](damocles-gap.md#working-authority) is the same European market. So the original display rate is **50 Hz**, and that is a value **derived** from a recovered fact plus the release territory, not one recovered from the program.

### Controls

The **`sync-poke`** case writes `$02` into `$FFFF820A` from the debugger part-way through a gameplay run and measures again. The field period changes from 133604 to 160256 cycles on the spot, the program carries on rendering and running its clock undisturbed, and it never writes the register back — the only watchpoint hit in the whole run is the poke itself, at the PC the debugger interrupted. That confirms the register is the quantity that sets the rate, that the program neither notices nor resists a change to it, and that the 50 Hz figure is not an artefact of how the machine was booted.

The **`--country uk` cold boot** is the same experiment from the other end: the game loads, the title screen appears, Space starts the first world and the panel reads `ERIS` exactly as in the 60 Hz run, all 18567 measured fields at 160256 cycles, with no sync-mode write of the program's own.

## Is the rate constant through play?

**Yes, and for a stronger reason than a scene census.** The program never writes the sync-mode register at all, so no scene can change the rate; the question reduces to whether the rate is ever changed, and it is not. Four pinned scenes were sampled directly as a check — on foot outside the Capital Spaceport, inside the spaceport room at a window, aboard the V.I.P. limo, and back on foot after leaving it — and all four read `$FFFF8260` = `$FC` and `$FFFF820A` = `$00` at 133604 cycles per field, with no watchpoint hit in any of them.

**Unreached:** atmospheric flight and VOID / deep space, which no snapshot in this laboratory restores to and which no automated route has reached (still open under [#86](https://github.com/odogono/mercenary/issues/86)). They are covered by the program-wide argument rather than by observation: a mode change there would need a write to one of two registers that the whole resident image never names.

## Consequences for values already derived

**The walk rate does not move.** `web/damocles/eris.json` derives `walk.unitsPerSecond` at 327.68 from three surface cells over 30,000 VBL "at 50 Hz". The measurement it rests on is a VBL count, so only the conversion depended on the rate, and the rate it assumed is the one recovered here. 3 x 65536 units / 30000 frames = 6.5536 units per frame, x 50.05 Hz = 328.03 units per second — within 0.1% of the recorded value, which is the figure at exactly 50 Hz. No correction is needed and none is made; the note reference is added to `walk.evidence` so the 50 is no longer an unsourced number.

**The impact clock.** [The motion-and-time note](damocles-script-motion-time.md#time--comet-deadline--confirmed-panel-advances-ram-encoding-confirmed-208) records 20 VBL per displayed second at `$793C`, already stated "at PAL 50 Hz". Confirmed: 2.5 displayed seconds per real second while idle on foot.

**The limo-key response in seconds.** The recovered frame counts convert at 20.0 ms per frame:

| Recovered duration | Frames | Seconds at 50 Hz |
| --- | ---: | ---: |
| `$072CF4` wait, threshold `$00C8` on `$7B9C` | 200 | **4.00** |
| Each message's display timer `$0523B8`, loaded `$00C8` from `$070102` | 200 | **4.00** |
| Script slot 2 end to end (three messages, the wait, the clearing message) | 1000 | **20.0** |

The pickup note's "about 3.3 s" for the wait was the laboratory's 60 Hz figure and is superseded by 4.00 s.

## Recommendation for `time.vblHertz`

| Value | Provenance | Why |
| --- | --- | --- |
| `vblHertz: 50` | **derived** | Recovered: the program never programs the Shifter's sync mode or resolution, and runs one field per VBL at the machine's rate. Derived: a UK ST is a 50 Hz PAL machine, so the original's rate is 50 Hz, measured at 50.05 Hz on the pinned machine in that mode. |

`recovered` would overstate it — nothing in the image names 50 — and `authored` now understates it, since the value is no longer a project convention. `waitFrames` and `messageFrames` stay `recovered` at 200; they were always the recovered quantity and this note does not touch them.

The exact 50.05 Hz is **not** recommended for the payload. The difference from 50 is one frame in a thousand, the session's frame accumulator would carry the fraction for no fidelity gain, and 50 is both the mode's name and the number every other derived value already uses.

## Confirmed, derived and unresolved

**Confirmed** (static recovery plus reproduced runtime observation): ST low resolution throughout, set once by the ROM and never changed; the resident image contains no reference to either Shifter mode register, with the video base and palette found as positive controls in the same pass; no write to either register after ROM start-up across two cold boots through the first world and four pinned gameplay scenes; the field periods of 160256 and 133604 cycles and the 50.05 Hz and 60.04 Hz rates they correspond to; that a debugger write to `$FFFF820A` changes the rate and the program neither notices nor reverses it; that Damocles stops TOS's `_hz_200`.

**Derived**: that the original's rate is 50 Hz, from the recovered inheritance plus the UK PAL release territory; the 20.0 ms frame period and the 4.00 s durations that follow.

**Unresolved / unreached**: the rate in atmospheric flight and in VOID, not visited, and covered only by the program-wide argument above; whether the display timer `$0523B8` counts in frames, which is [#307](https://github.com/odogono/mercenary/issues/307)'s question and is unaffected by this note.

## Claim boundary

These are observations of the original program running in Hatari with a pinned EmuTOS, not on original hardware. The 50 Hz conclusion is about the machine the program was sold to run on, not about anything the program itself decides; a Damocles disk booted on a 60 Hz ST runs 20% faster, and this note records that as the program's actual behaviour rather than as a defect. Hatari models one CPU clock for both sync modes, so the 60.04 Hz figure is this emulator's and the true NTSC ST field rate is slightly lower; the 50.05 Hz PAL figure matches the hardware and is the one this note relies on. Nothing here is a whole-game equivalence claim.

## Evidence identities

All hashes are SHA-256. Laboratory machine: ST, 1 MiB; program and TOS images are checked against [`working-authority.json`](../../research/damocles-st/config/working-authority.json).

| Input | Hash |
| --- | --- |
| Working Authority STX | `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef` |
| TOS (EmuTOS 2.06) | `154803e3ff4851f3dc358b91b16d6b6110d187a81d8132ecb665af49878939d5` |
| Tracked probe | `b7839680e56c96909d27cea4d15b44f722c8d25a0190c3daae9e9afb9c5bb85e` |
| Pinned first-world capture scanned statically | `b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967` |

Runs under `research/damocles-st/work/`. Hatari 2.6.1 (binary `05723606c75a1f0642395974abdce2cbbe48b0a09a747f65cdfca7ef9201e11a`), Python 3.13.15. Each run's `result.json` records the case, the sampled registers, the counter stops, every watchpoint hit with its program counter, the static scan and the toolchain; all nine were produced by the probe revision hashed above.

| Run | `result.json` hash |
| --- | --- |
| `display-mode-tos-uk-20260917T085939Z-d6ce665a` | `5cc23efff0de28de733119da125a467286f74c35e2921cbb3b92f1a6c5c1c6fb` |
| `display-mode-tos-20260917T085853Z-e739e863` | `fc49081d4c3f194b7cd95424524bd22c101ded4c4b002224cd14998101a1b779` |
| `display-mode-boot-uk-20260917T090553Z-5ea01d22` | `c78715200a7ee3700b1b78722068ed17eeedb6ae08cb5ff91d6985523ae3ae3e` |
| `display-mode-boot-20260917T090331Z-4e08577d` | `92d90a66b67d838b835c77d2a1660805245d4a1c7bf1251f9a768cb91d9f9a1e` |
| `display-mode-sync-poke-eris-spaceport-onfoot-20260917T090236Z-30d8cec9` | `049328b65c40e9fca5cd990e84c1280d947d5f3576e757cdecc048ec013bd860` |
| `display-mode-scene-eris-spaceport-onfoot-20260917T090026Z-0793ebc6` | `49ceea621739c9380b94aae52192a22afe6bea17fcb0c37a8d0c81520b5e4eac` |
| `display-mode-scene-interior-window-20260917T090059Z-5cb26e9f` | `ed41949b9eb19843986d1d1204704635a739cb74ccc047b8f26b721760423f0b` |
| `display-mode-scene-boarded-limo-20260917T090131Z-a232a692` | `3a911cbe49d20456c22bebcb3324c987e6536e16a302741052f4a21eaf3c0fed` |
| `display-mode-scene-left-limo-20260917T090204Z-147012c6` | `715ba06be1f638ba2df9f1680301eff4e34bed21cf2429113934d2e78db894de` |
