# web/src

One directory per concern. Pages load a `boot.ts` (`web/*.html` names which). Each module opens with a `///` comment saying what it owns; read that before reading the body.

## Titles

- `shell/`: the Targ Browser Shell (`index.html`): boot, routing, menus, the Shell Console and its history, Saves, Session Resume, Arrival, input, gamepad, settings and controls views. `targPanelDocument.ts`, `targPanelWriter.ts` and `targPanelView.ts` recover the ST panel presentation over explicit C64 readout adapters (ADR 0072). `panelControls.ts` lays the pointer and keyboard controls every Title's panel shares over its pixels: the head, the centre box and the run lamp.
- `damocles/`: Damocles play (`damocles.html`). `session.ts` (about 5,000 lines) owns the Gameplay Session; separate files hold Save (`save.ts`), the sky (`sky.ts`), the comet (`comet.ts`), craft data binding (`craftProgram.ts`), landing policy (`spacePolicy.ts`), documents, the encounter, the detonator and sound.
  `panelDocument.ts` validates the recovered panel payload, `panelWriter.ts` owns Damocles's composer and raw-word adapters, and `panelView.ts`/`panelElement.ts` retain accessible readouts and controls. The authored Targ/Flyover rendition remains in `shell/` (ADR 0071).
- `dion/`: Mercenary III (`dion.html`). `boot.ts` runs `TourcraftSession` from `tourcraftSession.ts`, with expanded content, manual EAGLE flight, taxi/TOURCRAFT, interactions and Save/Resume. `TourcraftSession` extends the D1 `DionSession` in `session.ts`, which still supplies shared foot/taxi behavior and historical test/research fixtures. For feature owners, exporters and focused tests, use [the Dion map](../../docs/agents/dion.md).
- `session/`: the Targ Gameplay Session (ADR 0018), its Save and lift journeys.
- `benson/`: the Benson Display, Host Callout and shared random stream. `talk/` runs Targ’s maintained Talk Scripts (ADR 0080), which reach the world only through the World Port (`talk/worldPort.ts`, ADR 0083); the historical interpreter is a test oracle under `test/oracle/`.

## Engine shared by titles

- `gameCore/`: the pure simulation step (state, intent, elapsed time).
- `flight/`: Targ's craft Mover, the Reference Build's filters; Damocles and Mercenary III fly with `craft/pass.ts`. `onFoot/`: the on-foot Mover shared by Damocles and Mercenary III.
- `craft/`: the evidenced Damocles/Mercenary III numeric craft and space passes, arithmetic tables and structural inputs. Each Title owns orchestration and effects (ADR 0074).
- `navigation/`: Room walls and Doorways. `interaction/`: shared Carried Stack rules and Head Commands; each Title owns resident state, tables and effects (ADRs 0075/0076).
- `orientation/`, `projection/`, `math/` (the governed elementary functions, ADR 0022).
- `world/`: the render-ready world built from the payload. `coast/`: horizon fill, islands and roads.
- `sky/`: the Orrery and Body Time. `text/`: composing decoded messages.
- `sound/`: Targ’s bounded SID synth, worklet and presenter. Damocles and Dion use the YM2149 core in `damocles/psg.ts` with their own sound drivers. `soundboard/` owns the listening page and arrangements.
- `scene/`: frame colours. `rendering/`: the WebGL2 Filled Presentation renderer shared by Damocles and Dion.
- `enhanced/`: the one Enhanced planner Damocles and Dion share (ADR 0077): the scene a Title supplies, the frame, the sky triangles, Sunlight, and the interpolation that draws the view between simulation passes (ADR 0078). `structure/`: structure selection, regions, entrance attachments and their doors (`selection.ts`), and the Lift both Titles share (`lift.ts`, ADR 0079).
- `settings/`: tuned values kept as data.

## Data and tooling

- `payload/`: loading and validating the Data Payload. `server/`: what `serve.ts` serves.
- `trace/`: reading Golden Traces, used by Replay Gates and the trace tooling.
- `atlas/`, `catalogue/`, `dionCatalogue/`, `flyover/`, `soundboard/`, `targAssetBrowser/`: inspection pages (`atlas.html`, `catalogue.html`, `dion-catalogue.html`, `flyover.html`, `sounds.html`, `targ-assets.html`). The Targ Asset Browser lists every Targ model to find what to edit in Blender.
- `geometry/`: the shared Geometry Asset and Asset Sidecar contract, recovery and composition (ADR 0081). Targ loads its object models and Surface Cells as Recovered Baselines, lays the edited and Authored Assets in `assets/targ/` over them (`targAssets.ts`; `tools/targ-assets.ts` adopts, reviews and freshness-checks them), and the World composes them through the payload readers.
- `geometrySpike/`: the #671 Blender geometry round-trip spike.
- `hash/`: SHA-256 as hex, shared by every payload and asset identity check.

## Large files

To outline a large class such as `damocles/session.ts`, `dion/tourcraftSession.ts` or `dion/frame.ts`, list its members and read the `///` comment above the one you need:

```sh
rg -n '^  (static |get |set |private )*#?\w+\(' src/damocles/session.ts
```
