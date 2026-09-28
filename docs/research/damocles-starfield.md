# Damocles starfield, and the islands from altitude

Working-Authority Evidence for [#578](https://github.com/odogono/mercenary/issues/578), recovered
2026-09-28. Authoritative Evidence remains bound to the C64 Reference Build. This note records
decoded ST facts only and does not translate the program into a new model
([ADR 0002](../adr/0002-separate-rom-research-from-implementation.md)). RAM, memstates, traces and
screenshots stay ignored Restricted Material under `research/damocles-st/work/`. Only addresses,
decoded facts and hashes are recorded here.

[#573](damocles-horizon-fill.md) found that from millions of units above a Body the ST still
draws the Body's islands on the ground, and stars in the sky. `/damocles` drew neither. This
note records how the ST draws both.

## Decision

- **Every island of the Body is drawn every frame, at any range.** `$056516` walks the Body's
  whole island list (`$7A16`) in record order. It projects each coastline through the ordinary
  transform `$05668A` and fills it flat with `$04F8F2`, after the horizon fill `$0599D6`. No
  range test is made. The one exception is `$0560F2`'s early return: it draws no island at all
  while Y's high word `$7A30` is 0 and the eye is inside the selected island's core box.
- **The stars are one list of 1,600 screen-space stars.** Three routines plot one pixel per
  star from it. Yaw scrolls the columns, 1,800 to a turn, and pitch scrolls the rows. In
  flight the roll shears them. No star is a direction in the world.
- **Three routines, chosen by the frame loop:**

  | Routine | Taken | Rows wrap at | Pitch offset | Roll shear | Clip row | By day |
  | --- | --- | --- | --- | --- | --- | --- |
  | `$0505B8` | on foot on an island's core (`$78A6 = 0`, `$7AAA ≠ 0`) | 512 | `$128` | no | `$042C74` (68) | skipped where `$794D ≠ 0` |
  | `$0503FE` | every other surface frame, aboard or on foot | 1,024 | `$128` | yes | `$042C74`; the zenith pass 136 | skipped where `$794D ≠ 0` |
  | `$05067C` | in space | 512 | `$1C0` | no | `$042C74` (136) | always drawn |

- **The stars are drawn before the sky pass**, so every Body covers them. The horizon fill
  and the ground cover whatever falls below the horizon.
- **In space the view is filled in `$001`, not black.** `$0598CC` loads palette slot 8 with
  `$001`, and `$059CE2` fills the view in slot 8 before the stars.
- **A transcription of the three routines matches the ST pixel for pixel.** Across 54 Hatari
  frames it accounts for all 1,839 star pixels that stand alone in the sky. Every one is
  predicted, in its colour, and no predicted star ever shows sky.

## The star list

`$05D8C0` opens with 1,024 words, one per yaw step. Each is the byte offset, from `$05D8C0`, of
the first star at or past that step's scroll. The stars follow as word pairs sorted by x:

| Word | Bits | Meaning |
| --- | --- | --- |
| first | 0–15 | x, 0 to 1,799 in one turn |
| second | 0–8 | the row in the band, 0 to 431 |
| second | 10–13 | the colour index |

Bits 9, 14 and 15 are clear in every star. After the 1,600 stars of one turn, the first 268
repeat with x raised by 1,800, so a scan never wraps. The list ends at `$05FDF0`, at the first x
past 2,117, the last column any yaw reads. The index and the repeat both follow from the
1,600 stars, and `damocleslab.system` checks that they do.

The colour index selects the low word of the long at `$050778 + 4·index`:

| Index | Colour |
| --- | --- |
| 0, 7, 8 | `$777` |
| 1, 9 | `$411` |
| 2, 10 | `$246` |
| 3–6, 11–15 | `$322` |

Each routine first finds a palette slot for each colour: an equal word already in the
palette, else the first free slot (`$8000`), else slot 0. The slot lookup is the same one
`$04F8F2` makes for a polygon.

## The scroll

For the yaw word `$7AA2` and the pitch word `$7AA0`, each routine computes:

```
scroll = ((yaw & $3FF) · 2 · $E10E) >> 16          ; mulu.w, 0 to 1,798
drop   = (((pitch & $3FF) − offset) · 4 · $6CCC) >> 16  ; the product a signed word, muls.w
c      = 319 − x + scroll                          ; the routine's own column
row    = ((shear(c) + second word) & mask) − drop
```

The scan starts at the index's star and stops once `c` goes negative. It keeps a star while
`row`, read as an unsigned word, is below the clip row. `$4FF98` plots column `d0` by clearing
bit `d0 & 7`, counted from the right, so a star lands on screen column `319 − c = x − scroll`.

Aboard, the shear is `(slope · (c − 160)) >> 16`, the high word of `muls.w`. `slope` is the low
word of tan roll times 65,536. `$055F72`–`$055FCC` form tan roll, `$797E`, as the sine table
entry at the roll over the entry a quarter turn on, divided in the log floats. `$050434`–`$05049C`
turn it into a long with the same rounding as `$05807A`. Roll 0 is not 0: the sine table's
half-step makes tan roll `$FFF71922` there, a slope of 201, so the stars left of centre sit one
row higher.

`$0503FE` has two passes, chosen on the pitch word:

| Pitch & `$3FF` | Passes |
| --- | --- |
| below `$C0` | the zenith pass alone |
| `$C0` to below `$140` | the zenith pass, then the main pass |
| `$140` to below `$244` | the main pass alone |
| `$244` to below `$3BC` | none: the nose is down |
| from `$3BC` | the zenith pass alone |

The zenith pass `$0502BE` is the band seen over the top. It scrolls from the yaw plus `$200`
and drops by the pitch `$200 − pitch`. It clips at 136 whatever `$042C74` holds, and plots
the pixel mirrored, at column `c` and row `135 − row`.

## Pinned frames

The frames come from `research/damocles-st/scripts/starfield-probe.py`. `capture` replays the
#558 `cross` case of `space-flight-probe.py` to stop 336, over LACHESIS at night. From stop 302
it pokes the craft's pitch `$7AC0` to 400, 260, 150, 1,000 and 600, then back to 487. From
stop 322 it patches the view's roll load: `$055F72` `move.w $7A9E,d1` becomes `move.w #roll,d1`,
the same four bytes, for rolls 24, −32 and 64. This craft's own pass holds `$7ABE` at 0, so a
roll poke there does not take. `check` also reads the #573 frames and the on-foot frames of
#528's `sky-body-probe.py`.

A chain stop saves RAM at the craft dispatch, and the screen it shows was drawn in the pass
before it. So each frame's words are the previous stop's. The last space frame is the
exception. The landing `$059268` runs at the end of the space frame, after the stars, so its
stop already reads "aboard".

| Run | Frames | Routine | Pitch | Roll | Lone star pixels | Missed |
| --- | ---: | --- | --- | --- | ---: | ---: |
| `space-flight-starfield-20260928T164926Z-8cd0bd2d` | 3 | `$0503FE` main | 487 | 0 | 213 | 0 |
| | 2 | main | 400 | 0 | 198 | 0 |
| | 2 | zenith and main | 260 | 0 | 178 | 0 |
| | 2 | zenith | 150 | 0 | 154 | 0 |
| | 2 | zenith | 1,000 | 0 | 22 | 0 |
| | 2 | none | 600 | 0 | 0 | 0 |
| | 2 | main | 487 | 24 (patched) | 146 | 0 |
| | 2 | main | 487 | −32 (patched) | 0¹ | 0 |
| | 2 | main | 487 | 64 (patched) | 144 | 0 |
| `space-flight-high-altitude-20260928T161031Z-34ab1e7a` | 7 | none, DION nose down | 655 | 0 | 0 | 0 |
| | 1 | `$05067C`, space | 487 | 0 | 13 | 0 |
| | 3 | main, LACHESIS | 487 | 0 | 213 | 0 |
| #528 `sky-body-*`, seven runs | 21 | `$0505B8`, on foot | 511 | — | 558 | 0 |
| | 3 | none, TOLOSA by day | 511 | — | 0 | 0 |

The stop 300 frame of the high-altitude run and that of the starfield run are the same image,
`bf169b059dc3…`, and both are counted. A lone star pixel is one whose four neighbours are the sky colour. *Missed*
counts three things: lone pixels not predicted, lone pixels predicted in another colour, and
predicted stars that show sky.

¹ The patch leaves `$7A9E` at 0. The horizon fill takes its side from `$7A9E`'s high byte and
its slope from the patched `$7982`, so at −32 it fills the wrong side of its line and covers most
of the sky. Only three stars stay visible, all on the fill's edge, and all three are predicted.
The rolls the game produces do not split `$7A9E` from `$7982` like this.

## The islands from altitude

Climbing over DION nose down, the #573 frames show DION NORTH (`$040`) and BIRMINGHAM ISLAND
(`$030`) on the base colour `$055`. That holds at every captured height, Y 1.1 to 30.4 million.
`$056516` draws each island through the same `$05668A` and `$04F8F2` as any object, so the
only limit is the view. At the stop 30 frame, drawn from Y 5,117,470 at pitch 655 and yaw 664,
DION NORTH's first and last pixels on rows 50 to 135 are:

| Row | 50 | 60 | 70 | 80 | 90 | 100 | 110 | 120 | 130 | 135 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Columns | 147–188 | 131–215 | 119–215 | 111–214 | 103–214 | 94–208 | 86–186 | 78–164 | 69–142 | 68–131 |

## What this means for the port

- **Islands.** The island fills stay depth-tested and end at the far plane, as the base plane
  does (#221). A second copy of every island is painted flat after the ground to the horizon,
  in record order, with the depth test off. Inside the far plane the base plane and the
  depth-tested fill cover it in the same pixels. From the stop 30 pose the flat copy's edges
  are within three pixels of the frame's on every row above. That gap is the Camera-wide
  half-step, 1.6 rows at this pitch. The port also applies `$0560F2`'s early return: on the
  ground on an island's core no island is filled.
- **Stars.** `system.json` publishes the list as `starfield`. The port runs the three routines
  in the ST's own word arithmetic, `$797E` included, and paints each star as one ST pixel,
  1/256 of a unit tangent, before the sky Bodies. Inside the ST's 320 × 136 view it plots the
  ST's pixels exactly. The port's view is taller and wider, so the same rule runs 512 columns
  and 128 rows past the ST view's edges. The port takes its pitch word from its own Camera,
  which levels at 512 where the ST's on-foot pitch is 511. So on foot its stars sit two rows
  off the ST's, with its horizon.
- **Space** is filled in `$001`.

## Unresolved

- **Palette slots.** A star colour with no free palette slot falls back to slot 0. The port
  has no palette, so it always draws the colour itself. No frame showed the fallback.
- **The ground records from altitude.** The flight branch calls `$0565E4`, the ground records,
  only while Y's high word is 0 (`$05986C`). The port draws them at any height. They are
  small and near, so from that height they are under a pixel or past the far plane. The
  difference was read, not observed.

## Reproduce

```sh
research/damocles-st/.venv/bin/python research/damocles-st/scripts/starfield-probe.py decode
research/damocles-st/.venv/bin/python research/damocles-st/scripts/starfield-probe.py capture --roms roms
research/damocles-st/.venv/bin/python research/damocles-st/scripts/starfield-probe.py check \
  --run research/damocles-st/work/space-flight-starfield-<id> \
  --run research/damocles-st/work/space-flight-high-altitude-<id> \
  --run research/damocles-st/work/sky-body-<id>
```

| Field | Value |
| --- | --- |
| Memstate | `dion-north-airborne.sav`, `71d0a1224672551e4a0ddcefa32903007b3a284a123012d6e83cd68261064c64` |
| Program | `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef` |
| TOS | `154803e3ff4851f3dc358b91b16d6b6110d187a81d8132ecb665af49878939d5` |

## Source ranges

Hashes are SHA-256 over the pinned first-world RAM.

| Range | Content | SHA-256 |
| --- | --- | --- |
| `$0502BE`–`$0503FE` | the zenith pass | `368efacb5963538b74e8850170e891e1fb9bcaafb2e6348b295bbad822095676` |
| `$0503FE`–`$050562` | the flight starfield | `467f6853158e6b7ecfbed0da14e149a9995b299fde8e3c946f2ea42a8e66c8a5` |
| `$0505B8`–`$05067C` | the on-foot starfield | `49243f5e1c53e77989b3e3c5284ae7f840d8dd62867644a973fdc9fb42688595` |
| `$050778`–`$0507B8` | the star colours | `627e3d0951c7494791038ded098c5ad3150d0c3e6a08fc0038253331b26f42ad` |
| `$055F60`–`$055FD4` | tan roll `$797E` and its companions | `3d2a9d0214922a9cb2e0f9bdc1fb8914e657d00ef604354303594207c6803eb2` |
| `$056516`–`$0565E4` | the island draw | `1a904bcc03e0bf9b8f8c44a5b39b9c8e7087ae8900a07030a308de58b09e73ac` |
| `$05D8C0`–`$05FDF0` | the star list | `e4b802d6035968f5665010fecf40b1c1a3a55a60fcee3d18e39eee5af6da5377` |
