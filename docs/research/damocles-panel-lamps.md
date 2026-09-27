# What the Damocles panel lamps show

Working-Authority Evidence, recovered 2026-09-27. Authoritative Evidence remains bound to the
C64 Reference Build. This note records decoded ST facts only
([ADR 0002](../adr/0002-separate-rom-research-from-implementation.md)); RAM and captures stay
ignored Restricted Material, and only addresses, decoded facts and hashes are recorded here.

## Decision

The three lamps left of the impact clock are, left to right:

| Lamp   | Routine               | Lit when                                             | Lit colour                                 |
| ------ | --------------------- | ---------------------------------------------------- | ------------------------------------------ |
| First  | `$0509F6`             | aboard (`$7A8E` = 0) **and** eye Y `$7AB6` < `$28FA` | colour 2, the inventory window's `#aaccee` |
| Second | `$050A5A`             | not decoded                                          | not decoded                                |
| Third  | `$05097C` / `$05099A` | the run toggle is on (`$7B3A` = 3)                   | colour 8, green                            |

On foot the first lamp is never lit. Aboard a craft on the ground it always is.

## Evidence

The panel sits in the screen buffer named by the long at `$042C00` (`$068000` or `$078000`).
The lamps are five pixels wide on rows 186–192, at x 198, 212 and 226. Unlit, each lamp is
colour `$A` (planes 1 and 3).

**First lamp.** `$0509F6` sets `d0` to 0 when `$7A8E` is non-zero. Otherwise it sets `d0` to
`slt` of `$7AB6` against `$28FA`. It redraws only when `d0` differs from its cache at
`$0509F0`. `d0` = 0 ORs `$01F0` into plane 3 at `$F4A6` in both buffers, which is unlit. Any
other `d0` clears those bits, leaving colour 2, which is lit.

**Third lamp.** `$05097C` switches running on: `$7B36` ← `$31400`, `$7B3A` ← 3. `$05099A`
switches it off: `$7B36` ← `$21800`, `$7B3A` ← 2. The ratio is close to the recovered 3/2 run
multiplier (`damocles-walk-board-flight.md`). With `$7B3A` = 2 the routine ORs `$1F00` into
plane 1 at `$F4B2`, which is unlit. Otherwise it clears those bits, leaving colour 8.

A sweep of the tracked and rehosted memstates agrees with both rules:

| Memstate                              | `$7A8E` | `$7AB6` | `$7B3A` | First | Third |
| ------------------------------------- | ------- | ------- | ------- | ----- | ----- |
| `eris-spaceport-onfoot` (`6cee57c4…`) | 1       | 63      | 2       | off   | off   |
| `boarded-limo` (`bbcc82de…`)          | 0       | 63      | 3       | on    | on    |
| `boarded-car`                         | 0       | 63      | 3       | on    | on    |
| `left-limo`                           | 1       | 63      | 3       | off   | on    |
| `dion-north-airborne` (`71d0a122…`)   | 0       | 70084   | 3       | off   | on    |

Every other on-foot capture reads `$7A8E` = 1.

| Range               | SHA-256                                                            |
| ------------------- | ------------------------------------------------------------------ |
| `$05097C`–`$0509EF` | `a90789f5994db4fbcb62274b99d6d674cfcfc862cb6fc1353ed449f61e8b3e8b` |
| `$0509F2`–`$050A59` | `5428c63844871ea0d7fd5cffd4e2108dbf7d3c93cd030c91b3dee44659b499de` |

## Fog

- The second lamp's routine at `$050A5A` is not decoded. The port keeps it unlit.
- The exact colour-8 value is taken from the panel rendition, not from a palette capture.
