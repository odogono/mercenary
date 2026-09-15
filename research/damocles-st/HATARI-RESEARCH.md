# Hatari research notes

This laboratory uses **stock Homebrew Hatari**. There are no emulator patches
in this tree. The C64 VICE keyboard-matrix patches are the wrong instrument
for Damocles.

## Why stock Hatari is enough for #78

Hatari 2.6 ships STX floppy support, a debugger with `savebin` / `screenshot` /
register dumps, `--parse` for boot-time debugger scripts, and `--cmd-fifo` for
host-side `hatari-event keypress` plus `hatari-debug` commands. That is enough
to identify the program image, document the boot path, capture analyzable
runtime state, and replay one bounded input scenario.

## Launch contract

- Binary: the Mach-O inside `Hatari.app` (Homebrew's `hatari` wrapper is a
  shell script).
- Headless capture uses `SDL_VIDEODRIVER=dummy` and `SDL_AUDIODRIVER=dummy`.
- Machine: `--machine st --memsize 1 --sound off --fast-forward true`.
- Display: `--statusbar false --crop true --screenshot-format png`.
- Debugger scripts must use absolute paths; Hatari changes directory while
  parsing `--parse` files.

## FIFO control

`--cmd-fifo` accepts newline-separated host commands. Useful ones:

- `hatari-event keypress <ascii-or-scancode>` (also `keydown` / `keyup`)
- `hatari-stop` / `hatari-cont` / `hatari-debug <debugger command>`
- `hatari-debug quit`

### Driving Damocles locomotion headlessly (solved)

**Locomotion works by memwriting Damocles's joystick-1 direction soft-copy at
`$79C2`.** No host keyboard-to-joystick mapping and no `hatari-event joy…`
(Hatari has none) are needed.

`stick_hold` under `observe` now freezes with `hatari-stop`, writes the
direction bitmask with `hatari-debug w $79c2 <bits>`, `hatari-cont`, and refills
in ~2000-VBL bursts for the hold duration (a fresh IKBD packet could otherwise
clear it), then writes `$00` to release. Bitmask is active-high IKBD joystick
bits: up `$01`, down `$02`, left `$04`, right `$08`, fire `$80`.

Cited run `work/observe-walk-toward-building-20260818T143508Z-c60e2391`
(`walk-toward-building.json`, hold up 30,000 VBLs): the camera walks forward off
the road onto open ground and the NAV coordinate advances `07-08` → `07-11`.

Near-building outdoor pose (still exterior): scenario
`approach-spaceport-pad.json` (`down` 1500 then `up` 800) reaches the white
pad facing the pyramid and cyan-windowed spaceport building — cited
`work/observe-approach-spaceport-pad-20260818T152751Z-9ebdb1a1`. Multi-step
recon uses `scripts/enter-building-probe.py`.

### Save-states: pin destinations, not input traces (solved)

Doorway entry via automated or replayed input never aligned — recorded stick +
key timelines (`scripts/record-play.py`) drift over long run segments even with
the `R` run toggle faithfully injected (`hatari-event keydown/keyup 19` is
confirmed effective). The reliable pattern is **`hatari-debug statesave` at the
destination** and `--memstate <file>` to boot straight back into it:

- `snapshots/eris-spaceport-onfoot.sav` — on-foot at the Eris spaceport,
  skipping the ~3-minute intro (made by `record-play.py snapshot`).
- `snapshots/vesta-parliament-4-6.sav` — on-foot outside Vesta Parliament,
  local cell 4,6 (`$7B5C=$64`). Hatari GUI memstate; carve ST RAM on `DIALIS  `
  at `$81DC`. Lab `--memstate` with pinned EmuTOS will not restore it.
- `snapshots/gaea-ur-city-4-2.sav` — on-foot in Gaea UR City, local cell 4,2
  (`$7B5C=$24`). Hatari GUI memstate; carve ST RAM on `DIALIS  ` at `$81DC`.
  Lab `--memstate` with pinned EmuTOS will not restore it.
- `snapshots/dion-2-3.sav` — on-foot on Dion, local cell 2,3 (`$7B5C=$32`).
  Hatari GUI memstate; carve ST RAM on `DIALIS  ` at `$81DC`. Lab `--memstate`
  with pinned EmuTOS will not restore it.
- `snapshots/interior-window.sav` — standing inside the spaceport building at a
  window (human walk from the on-foot snapshot via `record-play.py record
  --memstate … --snapshot-out …`, which `statesave`s on Ctrl-C).

`--memstate` restores in a few seconds under the normal launch contract; give
it ~5 s settle before the first capture. Interior evidence lives in
`work/interior-window-observe-20260818T171923Z-2da8247f` and
`work/interior-window-ram-20260818T172346Z-e3772e4d`.

Occupancy / craft poses for #86 (same pattern):

- `snapshots/boarded-car.sav` — aboard the V.I.P. limo (key held)
- `snapshots/boarded-limo.sav` — limo after number-key speed changes
- `snapshots/left-limo.sav` — on foot again after Space then `L`, key still held

Take is **Right Shift + Up** (not `T`). Board `B`, leave `L`. Number keys set
the panel speed field beside `ERIS`. Walk-versus-boarded soft word: `$7A8E`
(`1` on foot, `0` boarded) — see `docs/research/damocles-walk-board-flight.md`.

The tracked empty-inventory route reaches the V.I.P. limo without entering the
Spaceport Room or taking its key, then exercises the refusal directly:

```sh
python3 research/damocles-st/scripts/record-play.py replay \
  --sequence research/damocles-st/scenarios/limo-no-key-route.json
```

It remains on foot and displays `VEHICLE KEY REQUIRED`; addressed evidence and
the paired keyed capture are recorded in `docs/research/damocles-vip-limo.md`.

#### How the address was found

Damocles's IKBD ACIA handler (`$05555C`–`$055574`) decodes joystick packets:
header `$FE` → joystick-0/mouse data to `$79C0`; header `$FF` → joystick-1 data
to `$79C2`; other bytes → keyboard scancode to `$5558C`. The movement code at
`$01Exxx`/`$02xxxx` reads the joystick soft-copy. Isolation runs:

| Poke | Viewport pixel diffs | Verdict |
|---|---|---|
| `$79C2` = `$01` (`joy-softcopy-poke-20260818T143019Z-3016de12`) | **63516** | walks forward |
| `$79C0` = `$01` (`joy-softcopy-poke-20260818T142615Z-8d1804dc`) | 0 | no movement |
| both (`joy-softcopy-poke-20260818T142425Z-19851185`) | 63516 | walks forward |

So Damocles reads its game controller on **joystick port 1** (`$79C2`), matching
ST convention; port 0 (`$79C0`) is the mouse/shared copy the engine ignores for
walking. Script: `research/damocles-st/scripts/joy-softcopy-poke.py`.

#### What did not work (kept for the record)

- FIFO `hatari-event keydown/keyup/keypress` injects ST IKBD **scancodes**
  (`IKBD_PressSTKey`); it never calls `Joy_KeyDown`, so `Joy_GetStickData()`
  stays idle. `--joy1 keys` only remaps **host** SDL keys, which the FIFO does
  not emit. Confirmed negative at port 1 in
  `work/observe-walk-toward-building-20260818T141006Z-f1b459cc` (0 viewport
  diffs). `joyKeysPort` is therefore no longer required by `stick_hold`.
- Poking the IKBD **scancode queue** at `$61CC` (word count) / `$61CE` (bytes)
  sticks (`joy-debugger-poke.py`, verified `poke-verify.bin`) but does **not**
  move the outdoor camera (`work/joy-debugger-poke-20260818T124048Z-bb02de4a`,
  0 viewport diffs) — walking is joystick-driven, not keyboard-driven.

Scenario helper action:

- `{"type": "stick_hold", "direction": "up"|"down"|"left"|"right"|"fire", "vbls": N}`

Mid-scenario captures use `hatari-stop`, debugger dumps, then `hatari-cont`; the
final capture ends with `hatari-debug quit`. Scenario JSON may declare one or
two `capture` actions with distinct `prefix` values (see `deadline-clock.json`,
`outdoor-palette.json`, `walk-toward-building.json`).

Do not backslash-escape debugger arguments. Keep a FIFO writer open for the
whole observe session (closing it early can abort in-debugger parse chains).
Avoid interactive `m` memdumps over FIFO — they can page and stall automation;
use `savebin` of a small window instead.

### Disassembly over FIFO: one listing, and it must go last (solved)

`d <start>-<end>` is Hatari's own 68000 disassembler, which is why a Working
Disassembly needs no external tool and no second address space — it reads the
live machine at the state a scenario reached.

Two constraints, both found the hard way:

- **Output lands on stdout, not in `logfile`.** A FIFO-driven `hatari-debug`
  echoes to Hatari's stdout — `hatari-observe.log` — even with a debug log
  open, which leaves the `logfile` target zero-length. `observe` therefore cuts
  the listing out of the run log afterwards (`extract_disassembly`).
- **Hatari stops consuming FIFO commands after a listing.** A second `d`, and
  any `capture` queued behind the first one, are silently lost: no prompt echo,
  no artifacts. So a scenario carries **at most one** `disassemble` action and
  places it **last**, after every capture; `validate_scenario` enforces the
  count and the final capture resumes instead of quitting so the cleanup path
  stops the emulator. Widen the single range rather than adding a second action
  (the whole script dispatch loop, table, and handler block fit one `d`).

## What this lab does not do

No Damocles Data Payload, extractor, or schema. No second Independent
Implementation. Mapping tickets (#79–#81) may add reproducible checkpoints and
observation scenarios so Working-Authority Evidence for filled polygons, the
Gamma System layout, and script/motion/time can be cited from `docs/research/`
notes. Those decode findings stay in the notes; this tree keeps hashes,
configs, schemas, and lab prose only.
