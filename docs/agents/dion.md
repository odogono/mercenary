# Dion implementation and payload changes

Start production Mercenary III work in [`web/src/dion/boot.ts`](../../web/src/dion/boot.ts). It loads expanded content and runs `TourcraftSession`. `TourcraftSession` extends `DionSession` in `session.ts`; the base still owns foot/taxi behavior. The older `payload/dion/*.json` remain D1 research/test fixtures and immutable export dependencies; the playable export is `payload/dion/tourcraft/`. The [source map](../../web/src/README.md) covers the shared engine.

## Find the owner

Runtime paths are relative to `web/src/`; lab modules to `research/mercenary-iii-st/`; `presentation/*.json` to `payload/dion/tourcraft/`; tests to `web/test/`. Run focused Bun tests from `web/`.

| Change | Runtime | Export/data owner | Focused tests |
| --- | --- | --- | --- |
| Take, Drop, rotation, pointer Take | `dion/carry.ts`, `interaction/carriedStack.ts`, `dion/pointer.ts` | `m3lab/tourcraft_export.py`, `presentation/gameplay.json` | `dion-carry.test.ts`, `dion-carry-session.test.ts` |
| Open, Read, reveal, paging | `interaction/headCommands.ts`, `dion/head.ts`, `dion/tourcraftSession.ts` | `m3lab/head.py`, `presentation/head.json` | `dion-carry-session.test.ts`, `dion-tourcraft-session.test.ts` |
| Pickup scripts and model replacement | `dion/tourcraftNarrative.ts`, `dion/script.ts`, `dion/tourcraftSession.ts` | `m3lab/tourcraft_export.py`, `m3lab/scripts.py`, `presentation/programmes.json` | `dion-carry-session.test.ts`, `dion-tourcraft-narrative.test.ts` |
| Cards, detector, fruit machine | `dion/devices.ts`, `dion/tourcraftSession.ts` | `m3lab/head.py`, `presentation/head.json` | `dion-devices.test.ts` |
| Pawn transactions | `dion/pawn.ts`, `dion/carry.ts` | `m3lab/head.py`, `presentation/head.json` | `dion-pawn.test.ts` |
| EAGLE and TOURCRAFT flight | `dion/tourcraftFlight.ts`, `dion/tourcraftSession.ts`, `craft/` | `m3lab/tourcraft_export.py`, `presentation/craft.json` | `dion-eagle.test.ts`, `dion-tourcraft-flight.test.ts` |
| Enhanced scene and viewer | `dion/enhancedScene.ts`, `dion/tourcraftPresentation.ts`, `enhanced/`, `rendering/` | playable geometry and presentation documents | `dion-enhanced-scene.test.ts`, `dion-authentic-preservation.test.ts` |
| Authentic frame and panel | `dion/frame.ts`, `dion/tourcraftFrame.ts`, `dion/panel.ts` | `m3lab/tourcraft_export.py`, `m3lab/head.py` | `dion-tourcraft-frame.test.ts`, `dion-carry-session.test.ts` |
| Save/Resume or new mutable state | `dion/tourcraftState.ts`, `dion/tourcraftSave.ts`, `dion/tourcraftRestore.ts` | opening owner export in `m3lab/tourcraft_export.py` | `dion-tourcraft-save.test.ts` and the feature’s continuation tests |

`tourcraftSession.ts` orchestrates actions and atomic frames. New mutable owners must survive the Save codec and restore validation before the first frame is published. Browser Save/Resume checks live in `web/e2e/dion-tourcraft.e2e.ts`.

## Current decisions and historical evidence

- [ADR 0073](../adr/0073-drop-pre-release-prototype-save-migration.md): incompatible prototype Saves receive New Game guidance; same-schema Save/Resume must preserve futures.
- [ADR 0075](../adr/0075-port-dion-object-interaction-by-rule-not-by-admitted-object.md): apply Take/Drop rules to all resident records; per-object route proof is retired.
- [ADR 0076](../adr/0076-share-head-commands-through-title-open-tables.md): shared Head Commands with Title-owned tables and effects.
- [ADR 0077](../adr/0077-share-one-enhanced-planner-across-damocles-and-mercenary-iii.md): shared Enhanced planner and viewer; Authentic keeps its own planner.

For recovered facts, search `docs/research/` by mechanic or original address, then read the report’s date/status. The [D2 index](../research/mercenary-iii-tourcraft-milestone-review.md) locates TOURCRAFT research. Closed #756 R1–R4 ledgers and scripts are retained in git history, with archive links in their reports. They are not active admission gates.

## Update playable content

1. Change the decoder/exporter and its tests in the [lab](../../research/mercenary-iii-st/README.md). The [content contract](../dion-tourcraft-content-contract.md) defines served-byte identity. The manifest, loader and Save codec are the authoritative inventories and schemas.
2. From the repository root, export using the pinned coherent opening:

   ```sh
   PYTHONPATH=research/mercenary-iii-st python3 -m m3lab.tourcraft_export --opening restricted/mercenary-iii-708/presentation/exact2/start.ram
   ```

   Inspect the payload diff; rerun into a temporary `--out` directory and compare the bytes. Use the relevant lab test module, for example `PYTHONPATH=.:tests python3 -m unittest tests.test_tourcraft_export` from the lab directory.
3. From `web/`, run `bun run dion:identity --ref HEAD` before committing. It prints current and baseline identity and the tracked files containing either pin. It reports dependencies without rewriting them. A changed manifest hash must agree with its document’s exact bytes.
4. Expanded taxi audits still consume current opening/programme fields: `research/mercenary-iii-st/scripts/taxi-early-audit.ts`, `taxi-early-cursor-audit.ts`, `taxi-eligibility-audit.ts`, `taxi-request-count-audit.ts` and `taxi-timed-face-audit.ts`. Their committed ledgers and `dion-request-counts.test.ts` may pin the expanded identity. Regenerate/compare affected audits and review their observed outcomes; a changed hash alone does not justify changing those outcomes. `taxi-source.ts` separately archives historical D1 code/content; its pins remain fixed.
5. Run the feature tests and affected audit tests before the full `bun run check`. For mutable fields, inspect `TOURCRAFT_SAVE_SCHEMA_VERSION` in `tourcraftSave.ts` and the browser Save expectations. Run browser checks on a free port as described in `AGENTS.md`.

## Documentation checks

`bun run check:docs` validates local Markdown file links and explicit ADR supersession notices as well as the ADR index and Restricted Material citations. Link removed tracked evidence to its exact GitHub commit; name deleted Restricted Material as historical text, since it was never in git. Restricted Material availability is checked separately in a local checkout and is not required by the portable CI checks.
