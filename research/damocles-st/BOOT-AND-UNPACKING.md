# Damocles ST boot path

Working-Authority Evidence from the Novagen UK STX
`roms/atarist/damocles_-_mercenary_ii_novagen_software_(uk).stx`
(SHA-256 `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef`)
booted in stock Hatari 2.6.1 as `--machine st --memsize 1`.

## TOS pin

Hatari's bundled EmuTOS 2.06 (`roms/atarist/tos/emutos206.img`, SHA-256
`154803e3ff4851f3dc358b91b16d6b6110d187a81d8132ecb665af49878939d5`) is the
pinned TOS. It reaches the Damocles title screen and matches across cold starts.
Real TOS 1.04 is not required unless a later mapping ticket shows an
EmuTOS-specific mismatch.

## Observed path

1. Hatari inserts the STX as drive A. EmuTOS 2.06 starts at `$e00000`.
2. The first execution of `$68582` (`addx.l d2,d2`) is the checkpoint's anchor.
   At that first hit (around VBL 1160) the video output is still blank. `$68582`
   is inside BOOT's `OTNM` unpacker, not a title loop: the first hit is the
   unpacking of `ETITLE.NEO`, the title picture
   (`docs/research/damocles-title-logo.md`).
3. After 1400 further VBLs the title screen is painted: DAMOCLES / MERCENARY II
   / PAUL WOAKES / NOVAGEN SOFTWARE LTD / PAL VERSION.
4. The CPU remains in the `$68400`–`$68700` loader, unpacking `DAM0` (D7 holds
   its length, 244,632) behind the painted title. A3/A4 and the exact PC walk;
   A5–A7 and D5–D7 stay put.
5. Stable RAM windows `$3b000`–`$3c000` and `$60000`–`$6aa00` match across cold
   starts. Low TOS pages and the supervisor stack page do not.

The laboratory checkpoint `title-screen` is that chain: break at `$68582`, wait
`VBL+1400`, then dump RAM, registers, and a cropped PNG.

Space (ST scancode 57) is a valid bounded input at this checkpoint. After Space
and a long wait (scenario `first-world.json`), the Working Authority leaves the
title loop, unpacks world tables into RAM, and reaches a starting outdoor view
whose panel names a celestial body (observed: ERIS). That post-title state is
the reproducible entry for Gamma System layout hunts; see
`docs/research/damocles-gamma-system.md`.
