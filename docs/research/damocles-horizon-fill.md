# Damocles ground to the horizon aboard a craft

Working-Authority Evidence for [#573](https://github.com/odogono/mercenary/issues/573), recovered
2026-09-28. Authoritative Evidence remains bound to the C64 Reference Build. This note records
decoded ST facts only and does not translate the program into a new model
([ADR 0002](../adr/0002-separate-rom-research-from-implementation.md)). RAM, memstates, traces and
screenshots stay ignored Restricted Material under `research/damocles-st/work/`. Only addresses,
decoded facts and hashes are recorded here.

#573 found that `/damocles` draws only sky below the horizon once the eye is more than the far
plane (3,000,000) above the Body. It asked what the ST draws there.

## What was found

1. **Aboard, the ST fills the ground to the horizon at any height.** The frame loop's flight
   branch (`$059822`) draws the pitch-dependent stars (`$0503FE`) and the sky pass (`$05309A`).
   Then it calls `$0599D6`, and only then the ground records (`$0560F2`). `$0599D6` fills the
   136-row viewport below a horizon line in colour 15. The line is computed from the roll
   `$7A9E`, the pitch `$7AA0`, the view terms `$7982`/`$7986` and the projection scale `$7964`.
   No height word enters it.
2. **Colour 15 is the Body's base colour `$7C88` above Y's high word 0.** `$05982E`–`$05983C`
   take the land colour `$7A1A` only while `$78A6 = 0` and `$7A30`, the high word of Y, is 0.
   Otherwise they take `$7C88`. Colour 8 is the sky `$7C86` either way.
3. **Hatari frames agree.** Over LACHESIS at Y 25,595,040, 26,514,720 and 27,740,960 (pitch word
   487), the frames are identical. Rows 106–135 of 136 are the base colour `$411`, not the land
   colour `$211`. Above them is the night sky `$001` with stars. Climbing over DION nose down
   (pitch word 655), the viewport is the base colour `$055` with the green islands over it. That
   holds from Y 5,745,950 to 30,986,014.

The on-foot branch (`$0597F8`) gets the same result from a raster split rather than a fill
([damocles-eris-ground.md](damocles-eris-ground.md#sky-and-ground-band-are-one-fill-and-one-raster-split)).

## Evidence identity

The frames come from `research/damocles-st/scripts/high-altitude-ground-probe.py`. It replays the
#558 `cross` case of `space-flight-probe.py`, whose passes are deterministic, to stop 300. It
takes a Hatari screenshot at stops 22, 24, 26, 30, 36, 50, 70, 216, 230, 260 and 300. `check`
counts each viewport row's pixels in the sky colour and in the base colour.

```sh
python3 research/damocles-st/scripts/high-altitude-ground-probe.py capture --roms roms
python3 research/damocles-st/scripts/high-altitude-ground-probe.py check --run <run-directory>
```

| Field | Value |
| --- | --- |
| Run | `space-flight-high-altitude-20260928T161031Z-34ab1e7a` |
| Memstate | `dion-north-airborne.sav`, `71d0a1224672551e4a0ddcefa32903007b3a284a123012d6e83cd68261064c64` |
| Program | `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef` |
| TOS | `154803e3ff4851f3dc358b91b16d6b6110d187a81d8132ecb665af49878939d5` |

The run's `meta.json` `probeSha256` is the chain script's, `space-flight-probe.py`.

| Stop | Y | Pitch | Sky | Base | Ground rows from the bottom |
| --- | --- | --- | --- | --- | --- |
| 30 | 5,745,950 | 655 | `$110` | `$055` | 136 |
| 70 | 30,986,014 | 655 | `$110` | `$055` | 136 |
| 230 | 25,595,040 | 487 | `$001` | `$411` | 30 |
| 260 | 26,514,720 | 487 | `$001` | `$411` | 30 |
| 300 | 27,740,960 | 487 | `$001` | `$411` | 30 |

Stop 216's frame is still the last space frame, and stops 22–26 are low enough for DION's
islands to cover most of the view.

## What this means for the port

The base plane stays an authored stand-in that ends at the far plane (#221). The ground to the
horizon is a separate fill below the horizon line, painted after the sky Bodies and before
everything else, in the base plane's colour. That colour is the Body's base colour once Y's high
word is non-zero, even over an island core. With the pose above, the port's fill edge is at ST
row 107.6, against the ST's 106. The port's Camera levels at pitch word 512 where the ST puts the
horizon on the centre row at 511. That is the Camera-wide half-step, not the fill.

## Unresolved

- **Islands and stars from altitude.** The ST draws DION's islands over the base colour from
  millions of units up, and stars over the sky aboard. The port's island fills end at the far
  plane like the base plane, and the port draws no stars.
- **The exact horizon line.** `$0599D6`'s arithmetic was read for its inputs, not modelled to the
  pixel.

## Source ranges

Hashes are SHA-256 over the pinned first-world RAM, identical in `dion-north-airborne.sav`.

| Range | Content | SHA-256 |
| --- | --- | --- |
| `$0597EC`–`$059822` | on-foot colours and stars | `389ccef7e1c08e97fdd98a1f5d26df27b4e999f9818fbb49f7c562166154b63b` |
| `$059822`–`$05985C` | flight colours, stars, sky pass, horizon fill call | `3af4ef56715a1a748950c792b79e0fd0aae0ec7902f05e65117a41cb20cb1eff` |
| `$0599D6`–`$059CE2` | the horizon fill | `93e7f86a0264f3698a6957f1bb1599424e9b1803ee128344339ec78c9242b6fc` |
