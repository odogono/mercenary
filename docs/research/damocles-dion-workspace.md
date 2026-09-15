# Dion live `$ABDC` workspace

Working-Authority Evidence for the 16×16 surface map currently loaded while
the player is on Dion. Research note for
[#173](https://github.com/odogono/mercenary/issues/173).

Authoritative Evidence remains bound to the C64 Reference Build. Observations
here are Working-Authority Evidence only. This note does not mint Damocles world
terms in `CONTEXT.md`.

## Scope and non-goals

**In scope:** carving ST RAM from a Hatari 2.6 GUI memory snapshot; placing the
live `$00ABDC` surface assemblies and `$01E000` ground records of the selected
Dion workspace without treating them as a new geometry bank.

**Out of scope:** other Dion islands; inventing Dion place names from another
body's `$7A6C` pointer; unpacking Pasti STX tracks; claiming
`coverage.complete`.

## Working Authority and reproduce path

| Item                  | Value                                                              |
| --------------------- | ------------------------------------------------------------------ |
| Program               | `roms/atarist/damocles_-_mercenary_ii_novagen_software_(uk).stx`   |
| SHA-256               | `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef` |
| First-world RAM       | `observe-first-world-20260818T101013Z-c5a32b7d/observed.ram`       |
| Workspace             | Hatari GUI memstate `snapshots/dion-2-3.sav`                       |
| Memstate SHA-256      | `38bb08355024fc75cf6678b4b495a0485bbd71f6d2a0f8665ea811616b142872` |
| Carved ST RAM SHA-256 | `cefccd95454cf07d834578133012cdffb6469445ac79b1bbe02a746eabcf3734` |
| Player                | On foot on Dion, local cell 2,3                                    |

The memstate is Restricted Material (`*.sav`). Do not commit it. The extractor
aligns the uncompressed snapshot on the `DIALIS  ` body label at `$81DC` and
takes the following 1 MiB as ST RAM. Lab `--memstate` with pinned EmuTOS 2.06
does not restore this GUI save.

```sh
PYTHONPATH=research/damocles-st python3 -m damocleslab.catalogue \
  --run research/damocles-st/work/observe-first-world-20260818T101013Z-c5a32b7d \
  --workspace research/damocles-st/snapshots/vesta-parliament-4-6.sav \
  --workspace research/damocles-st/snapshots/gaea-ur-city-4-2.sav \
  --workspace research/damocles-st/snapshots/dion-2-3.sav \
  --output payload/damocles/catalogue.json
```

## Findings

- `$7AA8=$0010` is body selector 4×4 (DION). `$7A8E=1` (on foot). `$7B5C=$32`
  is cell `(z<<4)|x` for local 2,3. World origin is 3252, 1314 in the recovered
  body-local grid.
- Occupied `$ABDC` cells: **140**. Instance IDs are `dion-surface-{cell}` and
  `dion-ground-{cell}`. The current cell is unnamed `dion-surface-32` /
  `structure-01d7a0`.
- `$7A6C` still names first-world **BIRMINGHAM ISLAND** (`$23E57`). Those place
  records already belong to Gaea. The catalogue does not retarget them onto
  Dion or label Dion cells ELMDON SPACEPORT / LAWSON BANK / etc. Dion's own
  named-area list is unresolved.
- Surface-assembly and building-detail pointer tables are byte-identical to the
  first-world load. Unique object addresses are unchanged. This workspace is
  not a second model bank.
- `$01E000`/`$01E400`/`$83DC` are rewritten. This extract adds **31**
  workspace-local ground models and **249** plotted Dion ground instances.
  Byte-identical records keep Eris `ground-{addr}-{transform}` identities.

The coverage ledger remains incomplete: Dion place names, other Dion islands,
and other bodies' live `$ABDC` workspaces are unexplored.
