# web/src

One directory per concern. Pages load a `boot.ts` (`web/*.html` names which). Each module opens with a `///` comment saying what it owns; read that before reading the body.

## Titles

- `shell/`: the Targ Browser Shell (`index.html`): boot, routing, menus, the Shell Console and its history, Saves, Session Resume, Arrival, input, gamepad, settings and controls views.
- `damocles/`: Damocles play (`damocles.html`). `session.ts` (about 5,000 lines) owns the Gameplay Session; separate files hold Save (`save.ts`), the sky (`sky.ts`), the comet (`comet.ts`), craft and space (`craft.ts`, `space.ts`), documents, the encounter, the detonator and sound.
  `panelDocument.ts` validates the recovered panel payload, `panelWriter.ts` owns Damocles's composer and raw-word adapters, and `panelView.ts`/`panelElement.ts` retain accessible readouts and controls. The authored Targ/Flyover rendition remains in `shell/` (ADR 0071).
- `dion/`: Mercenary III on Dion (`dion.html`): session, frame, panel, taxi and TOURCRAFT (`tourcraft*.ts`), Save and Resume.
- `session/`: the Targ Gameplay Session (ADR 0018), its Save and lift journeys.
- `benson/`: the Benson Script interpreter and the Benson Display.

## Engine shared by titles

- `gameCore/`: the pure simulation step (state, intent, elapsed time).
- `flight/`: the craft Mover. `onFoot/`: the on-foot Mover shared by Damocles and Mercenary III.
- `navigation/`: Room walls and Doorways. `interaction/`: take, board and the Damocles head commands.
- `orientation/`, `projection/`, `math/` (the governed elementary functions, ADR 0022).
- `world/`: the render-ready world built from the payload. `coast/`: horizon fill, islands and roads.
- `sky/`: the Orrery and Body Time. `text/`: composing decoded messages.
- `sound/`: the YM2149 synth, worklet and presenter.
- `scene/`: frame colours. `rendering/`: the WebGL2 Filled Presentation renderer shared by Damocles and Dion.
- `settings/`: tuned values kept as data.

## Data and tooling

- `payload/`: loading and validating the Data Payload. `server/`: what `serve.ts` serves.
- `trace/`: reading Golden Traces, used by Replay Gates and the trace tooling.
- `atlas/`, `catalogue/`, `dionCatalogue/`, `flyover/`, `soundboard/`: inspection pages (`atlas.html`, `catalogue.html`, `dion-catalogue.html`, `flyover.html`, `sounds.html`).
- `geometrySpike/`: the #671 Blender geometry round-trip spike.

## Large files

To outline a large class such as `damocles/session.ts`, `dion/session.ts` or `dion/frame.ts`, list its members and read the `///` comment above the one you need:

```sh
rg -n '^  (static |get |set |private )*#?\w+\(' src/damocles/session.ts
```
