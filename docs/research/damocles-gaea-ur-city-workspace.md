# Gaea live `$ABDC` workspace (UR City)

Working-Authority Evidence for the 16×16 surface map currently loaded while
the player is on Gaea. Research note for
[#173](https://github.com/odogono/mercenary/issues/173).

Authoritative Evidence remains bound to the C64 Reference Build. Observations
here are Working-Authority Evidence only. This note does not mint Damocles world
terms in `CONTEXT.md`.

## Scope and non-goals

**In scope:** carving ST RAM from a Hatari 2.6 GUI memory snapshot; placing the
live `$00ABDC` surface assemblies and `$01E000` ground records of UR City
without treating them as a new geometry bank and without replacing the authored
Birmingham Island `gaea-surface-{cell}` identities.

**Out of scope:** other Gaea islands; other bodies' live workspaces; unpacking
Pasti STX tracks; claiming `coverage.complete`.

## Working Authority and reproduce path

| Item                  | Value                                                              |
| --------------------- | ------------------------------------------------------------------ |
| Program               | `roms/atarist/damocles_-_mercenary_ii_novagen_software_(uk).stx`   |
| SHA-256               | `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef` |
| First-world RAM       | `observe-first-world-20260818T101013Z-c5a32b7d/observed.ram`       |
| Workspace             | Hatari GUI memstate `snapshots/gaea-ur-city-4-2.sav`               |
| Memstate SHA-256      | `de82797dbddb39bf4e6586298274b936208f9038882aec555930df5fb8b8f3b3` |
| Carved ST RAM SHA-256 | `12798fcb860c563b53d5ef0d6947f8f409cc9b7501d586ae535538c2a925fab7` |
| Player                | On foot in UR City, local cell 4,2                                 |

The memstate is Restricted Material (`*.sav`). Do not commit it. The extractor
aligns the uncompressed snapshot on the `DIALIS  ` body label at `$81DC` and
takes the following 1 MiB as ST RAM. Lab `--memstate` with pinned EmuTOS 2.06
does not restore this GUI save: Hatari.app wrote it against its bundled
`tos.img`.

```sh
PYTHONPATH=research/damocles-st python3 -m damocleslab.catalogue \
  --run research/damocles-st/work/observe-first-world-20260818T101013Z-c5a32b7d \
  --workspace research/damocles-st/snapshots/vesta-parliament-4-6.sav \
  --workspace research/damocles-st/snapshots/gaea-ur-city-4-2.sav \
  --workspace research/damocles-st/snapshots/dion-2-3.sav \
  --output payload/damocles/catalogue.json
```

`--workspace` is repeatable so this overlay does not replace Vesta Politburo
City.

## Findings

- `$7AA8=$0020` is body selector 8×4 (GAEA). `$7A8E=1` (on foot). `$7B5C=$24`
  is cell `(z<<4)|x` for local 4,2.
- `$7A6C` names UR CITY. The area list includes HANTZENS NEW HOUSE at cell `$17`
  (`place-024416`), INDUSTRIAL CO-OP HSE1, INDUSTRIAL CO-OP HSE2, and GUM STORE.
  The current cell `$24` is occupied but unnamed.
- Occupied `$ABDC` cells: **22**. The authored Birmingham Island map already
  uses `gaea-surface-{cell}` (82 assemblies). Live UR City therefore uses
  `gaea-ur-city-surface-{cell}` and `gaea-ur-city-ground-{cell}` so Birmingham
  identities never change. Cell `$17` is empty in the Birmingham stream (99
  CHEVY) and occupied here by HANTZENS NEW HOUSE.
- Surface-assembly and building-detail pointer tables are byte-identical to the
  first-world load. Unique object addresses are unchanged. This workspace is
  not a second model bank.
- `$01E000`/`$01E400`/`$83DC` are rewritten. Byte-identical records keep Eris
  `ground-{addr}-{transform}` identities. Workspace-local fills use
  `gaea-ground-{addr}-{transform}`. This extract adds **18** workspace-local
  ground models and **38** plotted UR City ground instances.
- The recovered Gaea 16×16 origin matches the Birmingham Chevy phase (world
  origin 512, 1792). The two maps share that body-local origin qualifier; they
  are not merged into one island.

The coverage ledger remains incomplete: other Gaea islands and other bodies'
live `$ABDC` workspaces are unexplored.
