# Structure 74 Entrance Attachment motion, re-close, and eye clamp

[#238](https://github.com/odogono/mercenary/issues/238) asked how the Working
Authority opens Capital Spaceport's Entrance Attachment, whether it re-closes,
and how the eye is kept inside solid plan. This note closes those questions
against the pinned Atari ST RAM and the Working Disassembly. It is
Working-Authority Evidence, not Authoritative Evidence. Play stand-ins from
[#237](https://github.com/odogono/mercenary/issues/237) (Entrance Latch, omit-leaves,
Plan Refusal) are not translations of these routines.

The constructed two-leaf slab, Proximity Box, and runtime slot `$03FC` are
those already named in
[the spaceport interior note](damocles-spaceport-interior.md) and
[the draw-selection note](damocles-structure-draw-selection.md).

## Sources and limits

All addresses are ST physical RAM addresses. Captures, RAM images and the
Working Disassembly listing remain ignored Restricted Material under
`research/damocles-st/work/`
([ADR 0002](../adr/0002-separate-rom-research-from-implementation.md),
[ADR 0039](../adr/0039-admit-the-damocles-catalogue-before-playable-integration.md),
[research boundary](damocles-gap.md)).

| Artifact | SHA-256 |
| -------- | -------- |
| Working Authority STX | `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef` |
| `observe-first-world-20260818T101013Z-c5a32b7d/observed.ram` | `b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967` |
| `interior-window-ram-20260818T172346Z-e3772e4d/interior.ram` | `c9cbbacb6d5ac9266b350bb9b47cdc0d0b0167c6a4ebb0d03d163f0ada292eaa` |
| `research/damocles-st/work/geometry-code.txt` | `7bdfd0b9125f92ecc22282c2b3056e126ca0e3c6b93f0ab0981b2683dffaf340` |

The two RAM images are byte-identical for every code and structure-record
range cited below. Direct reads of slot `$03FC` and the region workspace are
from both images; they differ only in Pose / selected region, not in the
closed-slab vertices.

Timed leaf motion used ignored Hatari probes from
`snapshots/eris-spaceport-onfoot.sav` (SHA-256 `6cee57c4…3d6398c6`). Immediately
before each `$5AA3C` the probe wrote structure-local `$79A8/$79B0` = (1400, −782),
inside the Proximity Box, then captured `$16B4..$1BD3` and `$5E3C` on 180 VBLs
(`issue-238-timing-20260914T121722Z-f5e02769`). A second probe opened the leaves
the same way, then restored the snapshot’s outside locals and captured retreat
(`issue-238-retreat-20260914T122103Z-a70c1e63`). These isolate the handler; they
are not a reproduced walking route.

## Attachment vertices after `$5AA3C` — Confirmed

Control word `$4200` at `$1494A` is copied to `$5A40 + $03FC` = `$5E3C`. Bit 9
selects the two-leaf constructor `$5A140..$5A186`. That constructor splits the
scaled slab X 1300–1500 at its midpoint 1400 and stores eight X words and eight
Z words relative to the vertex base held as a long at `$2640 + $03FC` (`$2A3C`,
value `$00000074` in both captures):

| Offset from vertex base | Closed value (both RAMs) | Role |
| ----------------------- | -----------------------: | ---- |
| `$1642`, `$1646` | 1300 | left-leaf outer X |
| `$164A`, `$164E` | 1400 | left-leaf inner X |
| `$1652`, `$1656` | 1400 | right-leaf inner X |
| `$165A`, `$165E` | 1500 | right-leaf outer X |
| `$1A42`, `$1A4E`, `$1A52`, `$1A5E` | −790 | slab Z (outer pair) |
| `$1A46`, `$1A4A`, `$1A56`, `$1A5A` | −770 | slab Z (inner pair) |

The Proximity Box lives on the slot itself (`$1640/$1642/$1A40/$1A42 + $03FC`):
**X 1200–1600, Z −1200–−200**, lower-inclusive, upper-exclusive, matching the
authored second box at `$1495A..$14963`.

On-foot substeps at `$59562..$59584` run, in order: the Mover `$57CC2`
(`$58CFE` when `$7AAE = 1`, which adds to `$79A8`/`$79B0` and `$7AB2`/`$7ABA`),
then the attachment handler `$5AA3C`, then the region clamp `$5A64A`. The
substep count is `$51D22` clamped into 4–8 at `$59542..$5955C` (11 in the
first-world RAM, 8 in the interior RAM, both therefore 8 after the clamp).

Inside the Proximity Box, `$5AA82` tests the low byte of `$5A42 + slot`. For
this record that word stays `$0000`, so the handler always takes the open path
`$5ABF6` while the eye is in the box. Bit 9 then dispatches `$5ACCE`:

- left inner X (`$164A`/`$164E`) decreases by 1;
- right inner X (`$1652`/`$1656`) increases by 1;
- outer X words are not rewritten;
- `$5A41 + slot` (`$5E3D`) is set to `$01` on every open tick;
- when `right_outer − 8 < right_inner + 1`, both inners are clamped to
  **1308 and 1492** (`outer ± 8`) and `$5E3D` becomes `$FF`.

Z is never moved. Fully open, the leaves occupy X 1300–1308 and 1492–1500 at
the original Z −790–−770. The on-foot snapshot used eight substeps per frame.
The timing run’s first moved sample is VBL 9 (inners 1394/1406, latch `$01`);
later complete passes advance eight units; VBL 141 is the open endpoint
(1308/1492, latch `$FF`). Samples 9 and 141 are 132 VBLs apart, **2.64 s at
50 Hz**. Arming through VBL 141 includes the probe’s initial main-loop phase.
`$51D22` is a live speed word, not a door timer; `$59542..$5955C` also permits
4–7 substeps, so this duration is for the pinned snapshot’s observed cadence.
[#498](damocles-door-speed.md) confirms the step is one unit per substep in all twelve
motion paths, so every door's time is its travel in substeps.

The closed VBL-1 slice `$16B4..$1BD3` has SHA-256
`7969999baf67c150440db4152506d2892c489ba224390b7240e34ba2d255178e`.
The open VBL-141 slice has SHA-256
`75cb35abb17a9a31817f070c884b0da7acd657924202d660ce64fa2df8436d16`.

The bytes `$5AA3C..$5AD51` have SHA-256
`cd936e76d64a368856ff04e411221d249cfa4beeafc82b38e6b47533ec508cdb`.
The two-leaf constructor `$5A140..$5A189` has SHA-256
`34d4ae966958d0f796bc22d98869166b5c6d9a5d9b33e5a773e94eeee89d2e00`.
The closed X words `$16B6..$16D3` have SHA-256
`ee3eeb24cea0b67530333869d45cf0efe3c0455e6e4e91bd99ae6277b228395b`.
The attachment record `$1494A..$14965` is unchanged from the interior note,
SHA-256 `8902f5715d01e2d56a502a915a083d9d095a8f6eb975af20940b573f85224bee`.

## Re-close — Confirmed for this `$4200` record

`$5AAA0` `tst.b d7` / `beq` next-slot skips the close interpolator only while
the **low byte of the live control word** is zero. That byte is `$5E3D`. The
source word `$4200` starts there as `$00`, so a still-closed door does nothing
outside the box.

Every open tick overwrites `$5E3D` with `$01`, and the fully-open clamp writes
`$FF`. After that, `tst.b d7` is non-zero, so leaving the Proximity Box takes
`$5AB6A`: inner X values step **toward the midpoint by 1 per substep** until
they meet at 1400, then `$5E3D` is cleared back to `$00`. Retreat therefore
re-closes; the zero low byte of the **source** `$4200` does not permanently
disable the outside-box path.

The retreat probe captured fully open `$42FF`, inners 1308/1492, full RAM
SHA-256 `fc33c7452b579fdbec234d088feb6f94d2bedd53eb5481f35b69d928ddd07d6a`;
after 24 outside VBLs `$4201`, 1335/1465, SHA-256
`d88f4eeb11466f2e7986b8d6664b08b842b14d71b812c3f27605c98e3b1356d5`;
after 180 outside VBLs the closed 1400/1400 and `$4200`, SHA-256
`3bc8a022df6806d4c1ce72adab368495bc5faedbd8a0881caeee1b2331e541dd`.

Both first-world and interior RAMs also hold `$5E3C = $4200` / `$5E3D = $00`
and closed inners. The first-world Pose is far outside the box (local
`$79A8/$79B0` = −3109, −6635). The interior Pose is region 1 at local
(1011, 173), outside the box (Z upper bound −200), consistent with re-close
after walking through.

`$5A9D8` is set on each open or close tick; `$595A4` may then call `$54808`.
That is a motion flag, not a decoded Sound Cue.

The live control long at `$5E3C..$5E3F` is `$42000000` in both RAMs, SHA-256
`46f83e3a0dcc4f04f3eecc056ca777afc551ff50c61ae15f1486e3497cd51bfb`.

## Eye clamp, not a wall clipper — Confirmed

There is no per-polygon step-reject against the plan walls or the door slab.
After each Mover substep, `$5A64A..$5A69E` tests the structure-local eye
`$79A8`/`$79B0` against the **selected region’s** bounds from `$7B12`, inset
by 11 when `$7B35` is non-negative (region 1’s `$8000` uses the inset). If the
eye has crossed an edge, `$5A504` / `$5A540` / `$5A57E` / `$5A5B8` look for a
neighbouring region that shares that face; success `rts` without writing Pose.
Failure falls into `$5A5F0`, which **clamps** each axis onto the current
region’s inset interval (upper exclusive, so `max − 1`) and writes `$79A6` /
`$79AE`. On foot (`$7AAE = 1`) it also writes world `$7AB4`/`$7ABC` from that
clamped local plus `$7AF2`/`$7AF4`, and sets `$5A646`. After the substep loop,
`$5958A` compares that word to `$0100` and may call `$54808`.

Y is not consulted. Floors and roofs are not refusing in this path, matching
the authored Plan Refusal scope in #237.

Region 2 (the doorway strip) is not selectable until `$5E3D` is negative
(`$5A37E..$5A382`). While the door is closed or still opening (`$00` / `$01`),
the scanner skips it, so the eye cannot occupy Z −800–−760 until the leaves
have reached the fully-open `$FF` latch. Walking back toward the slab from
inside region 1 re-enters the Proximity Box at Z < −200 and opens the leaves
again before the slab at Z −790.

The clamp `$5A4D0..$5A645` has SHA-256
`70ebc44a88f55393bca6fb955621430c32c1481603f45e84240454a3146df94f`.
The post-Mover wrapper `$5A64A..$5A72D` has SHA-256
`97ca607e5c9907a5401a4ccdd768daf19fdac1161a252de7e992d472c4ad156e`.
The substep loop `$59512..$595BB` has SHA-256
`a8dccc673223bbf59ae5ae0be8377c618eae6844d93f7f336bf500a91b24ce8d`.

## Region 2 X 1311–1489 — Confirmed

The region binder `$5A2C0..$5A2DD` takes the low ten bits of the region flags
as an attachment slot. For region 2 those bits are `$3FC`. It then `tst.w` the
**word** at `$5A40 + slot` (`$5E3C`). `$4200` is non-negative, so it insets
**X** by +11 / −11 rather than Z. Raw 650–750 scaled by 2 is 1300–1500;
1300+11 and 1500−11 are **1311–1489**. The same word stays positive even while
`$5E3D` is `$01` or `$FF` (`$4201` / `$42FF`), so this inset is a bind-time
constant for this record, not a function of the latch.

The workspace copy at `$B24A..$B257` is `83 FC 05 1F 05 D1 FC E0 FD 08 00 01 49 98`
in both RAMs (flags `$83FC`, X 1311–1489, Z −800–−760, queue `$14998`), SHA-256
`e56681d6a2c0eb1d48a50dffca42cbe05db0dd2003d5f11cbc93e09ea5113dc7`.
The inset instructions `$5A2C0..$5A2DD` have SHA-256
`53f21745f60933a04233fcd12b65f940d9d87dbd53dc8600f72a885e741a28bb`.

## Consequence for play stand-ins

| #237 stand-in | Working Authority |
| ------------- | ----------------- |
| Entrance Latch (set once, never cleared, omitted from Save Snapshot v1) | Live latch is `$5E3D`: `$00` closed, `$01` opening, `$FF` fully open; it returns to `$00` on re-close. It is RAM, not a Gameplay Session flag. |
| Omit the two-leaf slab after latch | Leaves stay in the plan queue; their inner X interpolates. Omitting them is still an authored stand-in. |
| Plan Refusal on vertical plan bounds and the closed slab | Recovered rule is region-AABB clamp of `$79A8`/`$79B0` after the Mover, with region 2 gated on `$5E3D < 0`. |

## Status

| Claim | Status | Evidence |
| ----- | ------ | -------- |
| Two-leaf inner X steps by 1 per substep toward outer±8 while in the Proximity Box | Confirmed | `$5ACCE..$5AD0E`, timing run VBL 9→141 |
| `$5E3D` is `$01` while opening and `$FF` when fully open | Confirmed | `$5AC08`, `$5ACF8`, state bins |
| Leaving the box re-closes once `$5E3D` is non-zero | Confirmed | `$5AB6A..$5ABAA`, retreat RAM hashes |
| Zero source low byte of `$4200` permanently disables re-close | Disproved | that byte is the latch; opening mutates it |
| Eye is clamped to the selected region’s inset XZ, not ray-tested against walls | Confirmed | `$5A5F0..$5A63C`, `$5A64A..$5A69E` |
| Region 2 X 1311–1489 is bind-time ±11 because `$4200` is non-negative | Confirmed | `$5A2C6..$5A2DA`, `$B24A` |
| Natural stick-walk through the doorway | Unresolved | probes poke local X/Z rather than walking |
| Named Sound Cue for the motion flag `$5A9D8` | Unresolved | `$54808` not named here |
