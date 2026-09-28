# What the Damocles panel reads aboard a craft

Working-Authority Evidence, recovered 2026-09-27 for
[#551](https://github.com/odogono/mercenary/issues/551), part of the driving and flying map
[#548](https://github.com/odogono/mercenary/issues/548). Authoritative Evidence remains bound to the
C64 Reference Build. This note records decoded ST facts only
([ADR 0002](../adr/0002-separate-rom-research-from-implementation.md)). RAM, memstates and
captures stay ignored Restricted Material. Only addresses, decoded facts and hashes are recorded
here.

## Decision

| Readout         | Routine                       | What it prints                                                                                                                                 |
| --------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Speed field     | `$04DFF4`                     | a sign from the speed's mantissa word `$797C`, then nine digits of the long `$04DFEC` read as a 4.28 fraction: `$04DFEC` × 10⁸ / 2²⁸ |
| `$04DFEC` aboard on a Body | `$05807A`          | \|speed `$797A`\| as a rounded integer                                                                                                         |
| `$04DFEC` in space | `$05892C`                  | the relativistic speed c·v/√(v² + 32²), with c the integer `$2FF77FC6`, which prints as `299 792 458`                                          |
| Altitude window, on a Body | `$04DF42`          | eye Y `$7AB6` / 16, rounded, printed as 16.16: two whole digits, four decimal digits. `**` past 99 whole, and always on Floor 10              |
| Altitude window, in space | `$04DEEE`           | the nearest range `$791C` × 4, printed the same way                                                                                            |
| Second lamp     | `$050A5C`                     | lit red (colour 9, `#ee0000` in the frame) while the encounter gate `$070104` is non-zero, which only Tolosa's briefing script sets            |
| Impact clock    | VBL handler `$051E6E`         | runs at one displayed second per real second at 50 Hz on foot and on a Body, and γ times faster in space                                        |

Two older claims no longer stand:

- **The impact clock does not run at 20 VBLs a displayed second** (#208). It runs at 50, so it keeps
  real time at PAL 50 Hz. The trace and the memstate pairs are below. `web/damocles/eris.json`
  published `impactVblsPerSecond: 20` until #556 set it to 50.
- **The speed field's sign is not a direction of travel.** It is the sign of the speed float's
  mantissa. The launch writes a negative throttle (`$7BAC` = `$000EF000`), and the collision
  response negates the mantissa (`$059744`). That is why the panel reads `-` in space and after a
  crash.

## The program's floats

The craft routines keep speed, throttle and range as a long: a signed exponent word, then a
signed 1.12 mantissa word. The value is m / 4096 × 2^e, so `$00001000` is 1 and `$FF001000` is
effectively zero. Products go through two tables. The log table at `$064000`, indexed by the
signed mantissa word, replaces the mantissa with a log₂ fraction whose bit 0 carries the sign. The
two longs are added, and the exp table at `$060000`, indexed by `ror.w #4` of the fraction masked
to `$1FFE`, turns the fraction back into a mantissa. Quotients subtract instead. A square root
halves the log long. `$04BD34` is the addition. The probe emulates all of these on the tables in
the pinned RAM, and every value below comes out exactly.

A float becomes an integer as m × 2^(e−12), by `asr` of the mantissa placed in the high word.
`$05807A` rounds on the last bit shifted out, and the space paths truncate. A negative exponent
gives 0; the rounded path gives 1 when the exponent is exactly −1. An exponent of 31 or more
saturates at `$7FFFFFFF`.

## The speed field

`$04DFF4` redraws only when `$04DFEC` differs from its cache `$04DFF0`. The first glyph is `+`
(`$0B`), or `-` (`$0C`) when `$797C` is negative. Nine digits follow. The first digit is the top
nibble of the long. Each later digit is the top nibble after the long has been masked to 28 bits
and multiplied by ten. No path stores more than `$7FFFFFFF`, so the first digit is at
most 7. `$04DFEC` is cleared on boarding (`$054758`) and at `$051150`. On
foot nothing writes it, so it stays `+ 000 000 000`.

**On a Body** (`$05807A`–`$0580E6`, the routine that also stores the new speed at `$058076`), the
field is the magnitude of `$797A` as a rounded integer. The same pass writes `$7876` = `$20`. At
the pace the digits print, one printed unit is 2²⁸/10⁸ ≈ 2.68 internal units. Examples from
the traces:

| `$797A`     | v     | `$04DFEC` | Printed         | Where                                    |
| ----------- | ----- | --------- | --------------- | ---------------------------------------- |
| `$000510CE` | 33.6  | 34        | `+ 000 000 012` | limo, key 4, on the ground               |
| `$00091156` | 555   | 555       | `+ 000 000 206` | limo, key 9, one frame before it crashed |
| `$00061AC2` | 107.0 | 107       | `+ 000 000 039` | `dion-north-airborne` as captured        |
| `$000C18FC` | 6 396 | 6 396     | `+ 000 002 382` | EAGLE NINE in the air, key 9             |

The limo readings reproduce the 2026-09-24 probe readings recorded in
[walk, board and flight](damocles-walk-board-flight.md): key 4 settles at `012`.

**In space** (`$05892C`–`$058B22`) the routine forms `s` = v² + 1024 and stores `$7876` =
round(√s). That is 32γ for γ = √(1 + v²/32²). It then picks one of three forms of the same
quantity by `$7876`:

| `$7876`       | Form               | Constants                                                          |
| ------------- | ------------------ | ------------------------------------------------------------------ |
| up to `$20`   | v × c/32           | `$001817FC`, c/32 as a float                                       |
| `$21`–`$BC`   | √(c² − 1024c²/s)   | `$003B11FA` = c², `$004511FA` = 1024c² (the same mantissa, exponent +10) |
| above `$BC`   | c − 512c/s         | `$002617FC` = 512c, `$2FF77FC6` = c                                |

All three are c·v/√(v² + 1024): the exact form, then its low-speed and high-speed expansions. c
is `$2FF77FC6` = 804 749 254, which the field prints as `299 792 458`, the speed of light in
metres per second. The emulated curve matches the closed form to within a few parts in 10⁴ at
every exponent a throttle reaches:

| v      | `$7876` | γ     | Printed         | c·v/√(v²+1024) |
| ------ | ------- | ----- | --------------- | -------------- |
| 1      | 32      | 1.000 | `+ 009 368 896` | 9 363 943      |
| 32     | 45      | 1.406 | `+ 212 011 718` | 211 985 280    |
| 256    | 258     | 8.06  | `+ 297 486 855` | 297 477 424    |
| 4 096  | 4 096   | 128   | `+ 299 783 309` | 299 783 309    |
| 32 768 | `$7FFF` | 1 024 | `+ 299 792 316` | 299 792 315    |

`$7876` saturates at `$7FFF`, so γ never exceeds 1 024. The launch trace below reads
`- 299 631 955` at `$797A` = `$0009E176`.

The same space pass scales the speed by d/(d + 65 536), with d the nearest range `$791C`
(`$0588E6`–`$058928`). That belongs to the control routine (#549) and is only named here.

## The altitude window

On a Body, `$04DF42` loads `$7FFFFFFF` when the Floor `$7AC4` is 10. Otherwise it loads eye Y
`$7AB6`, shifts it right by four and rounds on the bit shifted out. The shared printer at
`$04DF5C` reads the result as 16.16. An integer part of 100 or more prints six `**` glyphs (`$0A`).
Otherwise it prints the integer part as two digits from the pair table `$526C2`. It then
multiplies the fraction by 100 twice (`mulu.w #100`), taking the high word as two more digits each
time. So the window reads Y / 2²⁰ as `II FFFF`, which is close to Y × 10⁴ / 2²⁰ as a six-digit
integer. It cannot show more than 99.9999, which is Y ≈ 104.9 million.

| Capture or trace                | `$7AB6`    | Window   |
| ------------------------------- | ---------- | -------- |
| any capture on foot             | 63         | `000000` |
| `damocles.logos.transporter`    | `$2BF`     | `000006` |
| `dion-north-airborne`           | 70 084     | `000668` |
| `damocles.key-west`             | 3 043 327  | `029023` |
| launch trace, stop 250          | 29 031 839 | `276869` |
| `damocles.eris.transporter.11-8`, `damocles.vesta.transporter` (Floor 10) | — | `******` |

In space, `$04D912` calls `$04DEEE` instead. It adds `$20000` to the range float `$791C` (×4),
fixes it to an integer without rounding, and prints through the same code. So the window reads
range / 16 384 in System units. At stop 600 of the launch trace, `$791C` = `$000B1290` (2 376)
and the frame shows `001450`. `$791C` is rewritten during the frame, so a stop taken mid-frame
can read a transient range. The drawn window only uses the completed one.

## The second lamp

`$050A5A` is the lamp's cache word, stored in the instruction stream. The routine starts at
`$050A5C`:

```text
$050A5C  move.w  $70104.l, d2
$050A62  cmp.w   $50a5a.l, d2       ; redraw only on a change
$050A6A  lea     $7f4a8.l, a0       ; both buffers, row 186, x 208-223
$050A76  move.w  #$07c0, d0         ; x 213-217
$050A86  bne.b   $50aa2             ; non-zero: plane 0 set, plane 1 clear -> colour 9
                                    ; zero: plane 0 clear, plane 1 set -> colour 10, unlit
```

It runs from both the surface panel list (`$04D93A`) and the space one (`$04D960`), and from
`$058EA0`. `$070104` is the persistent encounter gate
[the moving-object note](damocles-moving-objects.md#what-arms-the-encounter) decodes. Tolosa's
body briefing (`$072B16`, `bank.write $0104 $0001`) arms it on every arrival. The attack ship
clears it when it hits the player (`$050E1A`), and so does shooting the ship down (`$050B68`).
The save and load routines carry it. **The second lamp is the "under attack" lamp.**

Every capture was swept. `damocles.tolosa` is the only one with `$070104` = 1, and it is the
only one whose lamp pixels are colour 9. The other 33 are all colour 10, and every capture's
cache word equals its gate. In the `tolosa` live case's frames the second lamp is `#ee0000`
(ST `$700`), the unlit lamps `#444444`, and the third lamp, lit because the capture is running,
`#aaccaa`. The limo's first frame shows the first lamp lit `#aaccee`, the value the
[panel-lamps note](damocles-panel-lamps.md) gives.

## The impact clock

The VBL handler `$051D9A` runs, while `$7A26` is clear:

```text
$051E6E  move.w  $7876.w, d0
$051E72  sub.w   d0, $787a.w
$051E76  ble.w   $521a2
...
$0521A2  move.w  $7878.w, d0
$0521A6  addq.l  #1, $793c.w       ; one displayed second
$0521AA  add.w   d0, $787a.w
$0521AE  ble.b   $52198            ; and again, until the accumulator is positive
```

`$7878` is `$19 << n` (`$04D612`). n is the value of panel option 3, stored at `$7C98` in the
option table at `$7C8C`, and keypad `+`/`-` change it (`$04D4D0`). Every capture has n = 6, so
`$7878` = 1 600. On foot and aboard on a Body, `$7876` is 32 (the surface craft pass rewrites it at
`$0580E6`), so the clock gains one second every 1 600 / 32 = **50 VBLs**. That is real time at PAL
50 Hz. In space, `$7876` is 32γ, so the clock gains γ seconds per 50 VBLs, up to about 20 a VBL
at the `$7FFF` cap. The deadline burns while the craft moves near light speed. That is the
decelerating sweep #368 saw during the scripted arrival.

Flight on a Body does not change the rate. `dion-north-airborne` (EAGLE NINE airborne, key 9)
ticks every 50 VBLs, exactly as on foot. The throttle only matters in space.

When `$793C` is positive it counts up and wraps a day at a time (`$052176`). The two Dion
captures (`dion-2-3`, `dion-north-airborne`) and three of the 2026-09-19 captures (Perseus,
Thalia, Tolosa) hold positive values and draw them as elapsed time. What a positive clock means
for the ending is the endgame map's question (#580), not this note's.

**Correction to #208.** #208 recorded 12 and 25 displayed seconds over 250 and 500 VBLs, and
that figure spread into [the display-rate note](damocles-display-rate.md), the motion-and-time
note and `eris.json`. The handler above gives 50 VBLs a second. The exact-VBL chains agree, and
so does the program's own VBL counter `$051D96` between captures of one session:

| From → to                                | `$051D96` VBLs | `$793C` seconds | VBLs a second |
| ---------------------------------------- | -------------- | --------------- | ------------- |
| `boarded-car` → `boarded-limo`           | 1 143          | 23              | 49.7          |
| `eris-spaceport-onfoot` → `interior-window` | 2 024       | 41              | 49.4          |
| `dion-2-3` → `dion-north-airborne`       | 42 758         | 855             | 50.0          |

## Live evidence

`research/damocles-st/scripts/panel-aboard-probe.py live` boots one memstate and stops on every
VBL. It checks that `$051D96` advances by one at each stop and saves `$7800`–`$7CFF`,
`$04DFE8`–`$04DFF3`, `$070100`–`$07010F` and the lamp cache. Keys go in as the make code the ACIA
handler leaves in its mailbox `$05558C`, written by a stop script. No host timing is involved.
At every stop the probe replays the clock handler from the previous stop's `$787A`, `$7876` and
`$7878`, and raises unless it predicts `$793C` and `$787A` exactly. At every stop where the field
was rewritten, it raises unless the field matches the decode for the scene.

| Case       | Memstate (SHA-256)                                         | Input                        | Result                                                                                                                                                                                                 |
| ---------- | ---------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `onfoot`   | `rehosted/eris-spaceport-onfoot`                           | none                         | ticks at stops 24, 74, 124, 174, 224                                                                                                                                                                    |
| `limo`     | `boarded-limo` (`bbcc82de…`)                               | key 4 at 10, key 9 at 200    | field 34 → `012`; key 9 → 555 → `206`, then the limo hits the building at stop 209 and the player is out of it (`$7AB0` = `$FFFF`, a collision matter for #550); ticks every 50 throughout                       |
| `airborne` | `dion-north-airborne` (`71d0a122…`)                        | key 9 at 150                 | field 102 → 6 396, altitude falling `000635` → `000248`; `$7876` 32 and ticks every 50 throughout                                                                                                          |
| `launch`   | `dion-north-airborne`                                      | Esc at 10, key 1 at 300, key 5 at 600 | climbs as occupancy 0 until stop 268 with `$7BAC` = `$000EF000`, then space: `$7876` 978, 198, 229, 272, 323, 383 and 7 seconds in the 32 VBLs to stop 300; key 1 → `$7876` 32, ticks every 50; key 5 → 33, ticks every 48–49 |
| `tolosa`   | `rehosted/tolosa`                                          | none                         | `$070104` = 1 and lamp cache 1 throughout; the frame draws the second lamp `#ee0000`                                                                                                                  |

Runs, 2026-09-27, ignored under `research/damocles-st/work/`:
`panel-aboard-onfoot-20260927T101337Z-5b8d2239`, `panel-aboard-limo-20260927T101410Z-88470d14`,
`panel-aboard-airborne-20260927T101410Z-8919ba43`,
`panel-aboard-launch-20260927T101559Z-ef34a7be` (an earlier launch run,
`…101410Z-ed2b6949`, gave the same ticks) and `panel-aboard-tolosa-20260927T101410Z-772604d0`.

The screenshots agree with the decode, allowing for the one frame the panel lags RAM: the
limo's `+ 000 000 012` and `+ 000 000 206`, the space field `- 298 316 933`, the space altitude
`001450`, and the clock `01-56-46` → `01-57-07` across the launch.

Reproduce:

```sh
python3 research/damocles-st/scripts/panel-aboard-probe.py decode
python3 research/damocles-st/scripts/panel-aboard-probe.py live --roms roms --case launch
```

`decode` also sweeps every memstate. For each it checks `$7878` = `$19 << n`, `$7876` = 32 (no
capture is in space), the field against the speed whenever the craft is boarded, the lamp cache
against the gate, and the lamp's pixels.

## Hashes

From the pinned first-world RAM (`b019301e…`):

| Range               | Contents                             | SHA-256                                                            |
| ------------------- | ------------------------------------ | ------------------------------------------------------------------ |
| `$04DFF4`–`$04E057` | speed field                          | `7bfc3ed46ebdfb63ec0c4e5d0341b60c627232887ed5f51a0b5dfe036a4a361f` |
| `$04DF42`–`$04DFC3` | altitude window on a Body            | `7d7a1104203c0a43cfbe286bfd739291abe48bcbc902615a64fca8bcecf9ba0f` |
| `$04DEEE`–`$04DF41` | altitude window in space             | `c46c16e8d5cbb5e24e08d005995ce441035e408d1a2f58eb77fd4a544199b9b4` |
| `$050A5C`–`$050ABB` | second lamp                          | `6df5f7a645ad8608fc3600a3af2374e524f4357e8a52e117238194d8a488cc4f` |
| `$051E6E`–`$051E85` | VBL clock step                       | `47143e38d73a1ad6d1cccfe20e84e26ca399630617dff7f73d4425767cb743de` |
| `$0521A2`–`$0521B7` | clock tick                           | `14bf579e1df2332370b094082824001095ab2347c484784aa6412b334ee17a44` |
| `$04D612`–`$04D661` | time option → `$7878`                | `9380bf0a7a0649a469ef3bb5d59147600b181962a6ee449c03eb1d34cb054e1e` |
| `$05807A`–`$0580EB` | surface speed → field                | `68fb8350f41c946ab8c764fe3650cb8ea06c696a48b20ee5928c89df2b0851fb` |
| `$05892C`–`$058B27` | space speed → `$7876` and field      | `37a33a6b4ba0197e074ec543826d8cdc0f0e15e2038afff7ba7333bdde71973d` |
| `$04BD34`–`$04BDBD` | float addition                       | `f608e622840c587f07f0338e9c1e37255e17b86ca703373ba91d4fa1a571244f` |
| `$05C000`–`$06BFFF` window | log table, `$064000` ± `$8000` | `98d8afddf00bb1db2189808295112ca92042b388944a5fe14a4299f0c8c4bf11` |
| `$060000`–`$061FFF` | exp table                            | `f21d7cf049056a87abcb33d18af13b544a50daecb9087cd690f3c63f3698fb6d` |

## For the port

- The speed field aboard on a Body is `round(|v|)` × 10⁸ / 2²⁸, truncated per digit, with v in
  the craft routine's units and the sign from the speed float. In space it is c·v/√(v²+1024).
- The altitude window is eye Y / 2²⁰ on a Body and range / 16 384 in space, as `II FFFF`, with
  `**` past 99 and on Floor 10.
- The second lamp is `$070104 ≠ 0`, lit `#ee0000`. The port has no Tolosa encounter, so it stays unlit until
  one exists.
- `impactVblsPerSecond` is 50, not 20 (set in #556). In space the clock advances γ = min(√(1 + v²/1024),
  `$7FFF`/32) times faster. `$7878` also depends on the time option (n = 6 is the only value seen).

## Fog

- **The time option.** Option 3 sets `$7878` = `$19 << n` (0–10). It also sets `$7944` from the
  table at `$04D662` and shifts 32 longs from `$82DC` into `$835C`. What the player sees it as,
  and whether the port should offer it, is not decoded.
- **The crash that unseats the player** at stop 209 of the `limo` case is left to #550.
- **`$051150`**, the second site that clears the field, is named only.
