# Dion implementation and payload changes

Start production Mercenary III work in [`web/src/dion/boot.ts`](../../web/src/dion/boot.ts). It loads expanded content and runs `TourcraftSession`. `TourcraftSession` extends `DionSession` in `session.ts`; the base keeps the D1 foot/taxi step and doors, while input, Free Look and anything TOURCRAFT changes land in `tourcraftSession.ts`. The older `payload/dion/*.json` remain D1 research/test fixtures and immutable export dependencies; the playable export is `payload/dion/tourcraft/`. The [source map](../../web/src/README.md) covers the shared engine.

## Find the owner

Runtime paths are relative to `web/src/`; lab modules to `research/mercenary-iii-st/`; `presentation/*.json` to `payload/dion/tourcraft/`; tests to `web/test/`. Run focused Bun tests from `web/`.

| Change | Runtime | Export/data owner | Focused tests |
| --- | --- | --- | --- |
| Take, Drop, rotation, pointer Take | `dion/carry.ts`, `interaction/carriedStack.ts`, `dion/pointer.ts` | `m3lab/tourcraft_export.py`, `presentation/gameplay.json` | `dion-carry.test.ts`, `dion-carry-session.test.ts` |
| Open, Read, reveal, paging | `interaction/headCommands.ts`, `dion/head.ts`, `dion/tourcraftSession.ts` | `m3lab/head.py`, `presentation/head.json` | `dion-carry-session.test.ts`, `dion-tourcraft-session.test.ts` |
| Panel pointer controls, run mode | `shell/panelControls.ts`, `dion/boot.ts`, `dion/session.ts` (`$50F22`) | `m3lab/panel.py`, `panel.json` `fields.lamps` | `panel-controls.test.ts`, `dion-run.test.ts`, `dion-panel-controls.e2e.ts` |
| Pickup scripts and model replacement | `dion/tourcraftNarrative.ts`, `dion/script.ts`, `dion/tourcraftSession.ts` | `m3lab/tourcraft_export.py`, `m3lab/scripts.py`, `presentation/programmes.json` | `dion-carry-session.test.ts`, `dion-tourcraft-narrative.test.ts` |
| Cards, detector, fruit machine | `dion/devices.ts`, `dion/tourcraftSession.ts` | `m3lab/head.py`, `presentation/head.json` | `dion-devices.test.ts` |
| Pawn transactions | `dion/pawn.ts`, `dion/carry.ts` | `m3lab/head.py`, `presentation/head.json` | `dion-pawn.test.ts` |
| Lifts and Floors | `structure/lift.ts` (shared, ADR 0079), `dion/tourcraftSession.ts`, `dion/frame.ts` (`bind`) | `m3lab/tourcraft_export.py` (`floor_tables`), `promotion.json` `structures[].floors`; probe `m3lab/lift.py` | `dion-lift.test.ts`, `structure-lift.test.ts`, `damocles-lift.test.ts` |
| EAGLE and TOURCRAFT flight | `dion/tourcraftFlight.ts`, `dion/tourcraftSession.ts`, `craft/` | `m3lab/tourcraft_export.py`, `presentation/craft.json` | `dion-eagle.test.ts`, `dion-tourcraft-flight.test.ts` |
| Enhanced scene and viewer | `dion/enhancedScene.ts`, `dion/tourcraftPresentation.ts`, `enhanced/`, `rendering/` | playable geometry and presentation documents | `dion-enhanced-scene.test.ts`, `dion-authentic-preservation.test.ts` |
| Authentic frame and panel | `dion/frame.ts`, `dion/tourcraftFrame.ts`, `dion/panel.ts` | `m3lab/tourcraft_export.py`, `m3lab/head.py` | `dion-tourcraft-frame.test.ts`, `dion-carry-session.test.ts` |
| Save/Resume or new mutable state | `dion/tourcraftState.ts`, `dion/tourcraftSave.ts`, `dion/tourcraftRestore.ts` | opening owner export in `m3lab/tourcraft_export.py` | `dion-tourcraft-save.test.ts` and the feature’s continuation tests |

## Match Damocles

Most Dion bugs are "Damocles does this and Dion does not". Read the Damocles owner first; shared modules are usually right, and the gap is the Title's wiring.

| Concern | Damocles | Dion | Tests |
| --- | --- | --- | --- |
| Pass cadence | `damocles/session.ts` `tickCraft`/`tickFoot`, four ticks a craft pass (ADR 0051, `damocles/documents.ts` `time.ticksPerPass`) | `dion/session.ts` `advance`/`passPhase`, `ticksPerFrame` from `presentation/taxi.json` (ADR 0058) | `dion-tourcraft-flight.test.ts` |
| Stick and gamepad | `damocles/session.ts` `stick`, `damocles/boot.ts` `pollPads` | `dion/tourcraftSession.ts`, `dion/boot.ts` `pollPads`, `dion/controls.ts`; shared `shell/input.ts` (ADRs 0059, 0064) | `dion-controls.test.ts`, `shell-gamepad.test.ts`, `dion-gamepad.e2e.ts` |
| Free Look | `damocles/session.ts` `tickFoot` | `dion/tourcraftSession.ts` `freeLook`, `recentreLook` | `dion-free-look.test.ts` |
| Doors | `structure/selection.ts` `stepAttachment` (shared) | `dion/session.ts` `moveDoor`/`holdsKey`, key in `dion/script.ts` `keyA`, drawn by `dion/frame.ts` `doorGeometry` | `dion-doors.test.ts`, `damocles-door-speed.test.ts` |
| Smooth motion between passes | `enhanced/interpolation.ts` (shared, ADR 0078); sky through `damocles/terminator.ts` `continuousSkyAngles` | `dion/enhancedScene.ts` `dionPose`, `dionDoorsBetween`; sky in `dion/tourcraftSky.ts` | `dion-view-interpolation.test.ts`, `dion-sky.test.ts` |
| Model turning, view-fixed models | the Enhanced scene | `dion/frame.ts` `ModelTurn` (`$543AA`) | `dion-enhanced-scene.test.ts` |
| Console | `damocles/console.ts` over `shell/console.ts` | `dion/console.ts` | `dion-console.test.ts`, `damocles-console.test.ts` |

When an interpolation, cadence or input change touches one Title, check every row above for the other.

`tourcraftSession.ts` orchestrates actions and atomic frames. New mutable owners must survive the Save codec and restore validation before the first frame is published. Browser Save/Resume checks live in `web/e2e/dion-tourcraft.e2e.ts`.

## Current decisions and historical evidence

- [ADR 0073](../adr/0073-drop-pre-release-prototype-save-migration.md): incompatible prototype Saves receive New Game guidance; same-schema Save/Resume must preserve futures.
- [ADR 0075](../adr/0075-port-dion-object-interaction-by-rule-not-by-admitted-object.md): apply Take/Drop rules to all resident records; per-object route proof is retired.
- [ADR 0076](../adr/0076-share-head-commands-through-title-open-tables.md): shared Head Commands with Title-owned tables and effects.
- [ADR 0077](../adr/0077-share-one-enhanced-planner-across-damocles-and-mercenary-iii.md): shared Enhanced planner and viewer; Authentic keeps its own planner.
- [ADR 0078](../adr/0078-interpolate-the-enhanced-view-between-simulation-passes.md): the Enhanced view interpolates between simulation passes; everything a pass steps (pose, Bodies, doors) must interpolate too.
- [ADR 0079](../adr/0079-share-the-lift-across-damocles-and-mercenary-iii.md): one Lift in `structure/lift.ts`; each Title binds its own Floors, door and sounds.

For recovered facts, search `docs/research/` by mechanic or original address, then read the report’s date/status. The [D2 index](../research/mercenary-iii-tourcraft-milestone-review.md) locates TOURCRAFT research. Closed #756 R1–R4 ledgers and scripts are retained in git history, with archive links in their reports. They are not active admission gates.

## Update playable content

1. Change the decoder/exporter and its tests in the [lab](../../research/mercenary-iii-st/README.md). The [content contract](../dion-tourcraft-content-contract.md) defines served-byte identity. The manifest, loader and Save codec are the authoritative inventories and schemas.
2. From the repository root, export using the pinned coherent opening:

   ```sh
   PYTHONPATH=research/mercenary-iii-st python3 -m m3lab.tourcraft_export --opening restricted/mercenary-iii-708/presentation/exact2/start.ram
   ```

   Inspect the payload diff; rerun into a temporary `--out` directory and compare the bytes. Use the relevant lab test module, for example `PYTHONPATH=.:tests python3 -m unittest tests.test_tourcraft_export` from the lab directory.
3. From `web/`, run `bun run dion:identity --ref HEAD` before committing. It prints current and baseline identity and the tracked files containing either pin. It reports dependencies without rewriting them. A changed manifest hash must agree with its document’s exact bytes. Adding or removing geometry also changes the closure count pinned in `tourcraftContent.ts` (`geometry.closure`) and `dion-tourcraft-content.test.ts`.
4. Expanded taxi audits still consume current opening/programme fields: `research/mercenary-iii-st/scripts/taxi-early-audit.ts`, `taxi-early-cursor-audit.ts`, `taxi-eligibility-audit.ts`, `taxi-request-count-audit.ts` and `taxi-timed-face-audit.ts`. Their committed ledgers and `dion-request-counts.test.ts` may pin the expanded identity. Regenerate/compare affected audits and review their observed outcomes; a changed hash alone does not justify changing those outcomes. `taxi-source.ts` separately archives historical D1 code/content; its pins remain fixed.
5. Run the feature tests and affected audit tests before the full `bun run check`. For mutable fields, inspect `TOURCRAFT_SAVE_SCHEMA_VERSION` in `tourcraftSave.ts` and the browser Save expectations. Run browser checks on a free port as described in `AGENTS.md`.

## Documentation checks

`bun run check:docs` validates local Markdown file links and explicit ADR supersession notices as well as the ADR index and Restricted Material citations. Link removed tracked evidence to its exact GitHub commit; name deleted Restricted Material as historical text, since it was never in git. Restricted Material availability is checked separately in a local checkout and is not required by the portable CI checks.
