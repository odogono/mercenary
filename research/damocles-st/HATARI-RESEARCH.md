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

- `hatari-event keypress <ascii-or-scancode>`
- `hatari-stop` / `hatari-debug <debugger command>`
- `hatari-debug quit`

Do not backslash-escape debugger arguments. Keep a FIFO writer open only while
sending a batch, then close it so Hatari can exit.

## What this lab does not do

No Damocles Data Payload, extractor, or schema. No second Independent
Implementation. Mapping tickets (#79–#81) may add reproducible checkpoints and
observation scenarios so Working-Authority Evidence for filled polygons, the
Gamma System layout, and script/motion/time can be cited from `docs/research/`
notes. Those decode findings stay in the notes; this tree keeps hashes,
configs, schemas, and lab prose only.
