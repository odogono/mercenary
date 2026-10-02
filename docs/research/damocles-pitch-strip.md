# The Damocles pitch strip

Working-Authority Evidence, recovered 2026-10-02 (#716, PR #717). Authoritative Evidence
remains bound to the C64 Reference Build. This note records decoded ST facts only
([ADR 0002](../adr/0002-separate-rom-research-from-implementation.md)). RAM and captures stay
ignored Restricted Material; only addresses, decoded facts and hashes are recorded here.

## Decision

The Damocles pitch gauge is a recovered strip, not a drawn tape. `$052B24` copies twenty rows
of the strip at `$76600` into the panel, from row `($7AC0 & $3F0) >> 4`. The camera pitch
`$7AC0` counts 1,024 units a turn, reads `$0200` level and rises as the nose goes down. That
gives 64 window positions a turn and 83 rows in all. The strip is byte for byte the one
Mercenary III's `$53AB2` draws from its `$3B880` (`payload/dion/panel.json`).

`damocleslab.panel` extracts it to `payload/damocles/panel.json`, and the Damocles Session's
panel draws the window from it (`web/src/damocles/pitchStrip.ts`). The authored tape remains
for renditions with no Damocles payload behind them: the Damocles rendition dressing Targ, and
the Flyover.

## Evidence

`$052B24`..`$052B47` reads, in order:

1. `move.w $7AC0.w,d0` and `andi.w #$3F0,d0`.
2. `cmp.w $52B20(pc),d0` / `beq.b`, which returns while the masked pitch stands where the last
   call left it. Otherwise `move.w d0,$52B20.l` keeps it.
3. `lsr.w #2,d0` / `movea.w d0,a0` / `adda.l #$76600,a0`, which gives four bytes a row.
4. `lea.l $7EAEA.l,a1` and `lea.l $6EAEA.l,a2`, the two screen buffers. Pairs of `movem.w`
   loads write each row's two words at `+0` and `+4`, 160 bytes (one line) apart.

`$7EAEA` is `$78000` plus line 171 and byte 10: two bytes into the 16-pixel group at x 16, so
the words land on bit-planes 1 and 3. The frame buffer of `eris-spaceport-onfoot` (pitch
`$01FF`) shows rows 171–190 of that group, columns 0–10, holding only three colours:

- colour 2 (`#aaccee`) above the `0` mark, the sky;
- colour 8 (`#aaccaa`) below it, the ground;
- colour 0 for the marks and figures.

Columns 11–15 are the panel's own frame.

The strip is the same in every capture searched:

| Source                                                   | Strip at | SHA-256 of 332 bytes |
| -------------------------------------------------------- | -------- | -------------------- |
| `observe-first-world-20260818T101013Z-c5a32b7d` (pinned) | `$76600` | `74288f8b…2fa2fab`   |
| `boarded-limo`                                           | `$76600` | `74288f8b…2fa2fab`   |
| `eris-spaceport-onfoot`                                  | `$76600` | `74288f8b…2fa2fab`   |
| `damocles.tolosa`                                        | `$76600` | `74288f8b…2fa2fab`   |

The full hash is `74288f8b474fba63e0acdd01417322b808b2cde3d5098aa1870ecccda2fa2fab`. The only
long reference to `$76600` in the image is the `adda.l` at `$052B3E`.

## What the window shows

Sixteen rows make a quarter turn. The `-0-` marks are at rows 8–12, 40–44 and 72–76 and
the `90` marks at rows 24–28 and 56–60, with a tick gap at each edge every fourth row. So:

- level (`$0200`), the window starts at row 32 and `-0-` crosses its middle, sky above and
  ground below;
- 45° nose down (`$0280`), it starts at row 40: `0` at the top under a line of sky, and `-90-`
  at the bottom, which is what the ST shows pitched down;
- the figure never carries a sign. The colour above and below the `0` says which way is up.

## Still open

The other panel strips (the compass `$53A2E` in Mercenary III) are not yet compared with
Damocles's. #716 keeps the rest of the recovered-panel question.
