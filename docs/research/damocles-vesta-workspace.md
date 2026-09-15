# Vesta live `$ABDC` workspace

Working-Authority Evidence for the 16×16 surface map currently loaded while
the player is on Vesta. Research note for
[#173](https://github.com/odogono/mercenary/issues/173).

Authoritative Evidence remains bound to the C64 Reference Build. Observations
here are Working-Authority Evidence only. This note does not mint Damocles world
terms in `CONTEXT.md`.

## Scope and non-goals

**In scope:** carving ST RAM from a Hatari 2.6 GUI memory snapshot; placing the
live `$00ABDC` surface assemblies and `$01E000` ground records of the selected
body without treating them as a new geometry bank.

**Out of scope:** other bodies' live workspaces; other Vesta islands; live Gaea
`$ABDC`; unpacking Pasti STX tracks; claiming `coverage.complete`.

## Working Authority and reproduce path

| Item     | Value |
| -------- | ----- |
| Program  | `roms/atarist/damocles_-_mercenary_ii_novagen_software_(uk).stx` |
| SHA-256  | `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef` |
| First-world RAM | `observe-first-world-20260818T101013Z-c5a32b7d/observed.ram` |
| Workspace | Hatari GUI memstate `snapshots/vesta-parliament-4-6.sav` |
| Memstate SHA-256 | `47d817a931e54eeb1999cc5ca62c7ee3891e44464191741e3bcfffca94f362c1` |
| Carved ST RAM SHA-256 | `7dca6fcbb9f4194c9c8f4bc23c95e2344bd40b686761efccf0ab2299e539721e` |
| Player | On foot outside Vesta Parliament, local cell 4,6 |

The memstate is Restricted Material (`*.sav`). Do not commit it. The extractor
aligns the uncompressed snapshot on the `DIALIS  ` body label at `$81DC` (file
offset 27881) and takes the following 1 MiB as ST RAM. Lab `--memstate` with
pinned EmuTOS 2.06 does not restore this GUI save: Hatari.app wrote it against
its bundled `tos.img`.

```sh
PYTHONPATH=research/damocles-st python3 -m damocleslab.catalogue \
  --run research/damocles-st/work/observe-first-world-20260818T101013Z-c5a32b7d \
  --workspace research/damocles-st/snapshots/vesta-parliament-4-6.sav \
  --output payload/damocles/catalogue.json
```

## Findings

- `$7AA8=$0038` is body selector 14×4 (VESTA). `$7A8E=1` (on foot). `$7B5C=$64`
  is cell `(z<<4)|x` for local 4,6. World cell 1087,313 with origin 1083,307.
- `$7A6C` names POLITBURO CITY. The area list includes VESTA PARLIAMENT at
  `$24101` (cell `$64`), plus LLOYDS GROUP 4, LAWSON BANK, GAEA BANK,
  GLENN SPACEPORT and GUM STORE. Those place bytes also exist in the first-world
  pool; the missing map is the live `$ABDC` overlay.
- Occupied `$ABDC` cells: **19** (Eris first-world has 76). Cell `$64` word
  `$0A46` is structure slot 70 → `structure-01454e`, the same record as on Eris.
- Surface-assembly and building-detail pointer tables are byte-identical to the
  first-world load. Unique object addresses and object heads are unchanged.
  `$0535A2` is unchanged. This workspace is not a second model bank.
- `$01E000`/`$01E400`/`$83DC` are rewritten. Eleven unique ground offsets appear;
  four offset numbers are shared with Eris. Byte-identical records keep Eris
  `ground-{addr}-{transform}` identities. Workspace-local fills use
  `vesta-ground-{addr}-{transform}` so Eris IDs never change. This extract adds
  **12** workspace-local ground models (**24** plotted Vesta ground instances,
  two of which reuse Eris records).
- Instance IDs are `vesta-surface-{cell}` and `vesta-ground-{cell}`. Parliament
  is `vesta-surface-64` / `place-024101`.

The coverage ledger remains incomplete: other bodies, other Vesta islands, and
live Gaea `$ABDC` are unexplored.
