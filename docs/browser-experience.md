# Spec: Browser experience — Benson Panel, System Menu, settings, save chooser, Shell Console

**Status: accepted for implementation — mockup signed off on issue #120. ADR 0027 and the
CONTEXT.md terms (Benson Panel, Panel Rendition, System Menu, Shell Console) land with this
acceptance; Phase B proceeds in the ordered slices below.**

## Objective

Make the Browser Shell look like Mercenary. The Game Surface gains a **Benson Panel** — an
authored instrument-panel Display Composition hand-recreated by eye from the Atari ST
_Escape from Targ_ panel — switchable to a **Panel Rendition** wearing the ST _Damocles_
dressing over the same Targ gameplay data. The Browser Shell gains a **System Menu** (Esc)
owning a settings page and the three-slot save chooser, and a **Shell Console** (backtick)
for debug commands. One graphical style, defined as a CSS token layer, covers all of it.

Success means the panel is the default composition, driven solely by the Session Snapshot,
never changing play; the old debug strip survives behind a settings toggle; saves keep ADR
0026's discipline with reject reasons surfaced in shell chrome; and every console mutation
routes through the Gameplay Session's semantic actions. HTML mockups are tuned and signed
off (issue #120) before any production code.

The feature covers presentation and shell chrome only. It does not add gameplay information
the session does not already expose, reproduce original bitmaps or logos, extract the
Damocles condensed panel-label face (CSS approximation in v1), or advance Damocles gameplay
(ADR 0021 presentation-only exception).

## Technology and commands

- Mockup: `bun run prototypes/browser-experience/serve.ts` → `http://localhost:4180/`
  (server exists only because `file://` blocks `@font-face`; fonts are served from
  `payload/fonts/`, nothing copied into the prototype).
- Production shell: plain TypeScript ES modules under `web/src/shell/`, no framework.
- Browser verification, from `web/`:
  `bun test && bun run typecheck && bun run lint && bun run format:check && bun run unused && bun run test:e2e`.
- Local page: `cd web && bun run dev`.

## Project structure

- `prototypes/browser-experience/` — throwaway mockup page (issue #120); token layer at the
  top of its `<style>` block is the tuning surface and is ported verbatim at implementation.
- `web/index.html` — panel markup inside `#game-surface` under the canvas; composition/rendition via
  `data-composition` / `data-rendition`. Overlay CSS for the System Menu, save chooser and Shell
  Console lives in `web/src/shell/chrome.css`; overlay DOM is mounted by `installShellChrome` so
  `/targ` and `/damocles` share one host (ADR 0044). Panel, Departure and Arrival CSS stay inline
  on Targ's document.
- `web/src/shell/router.ts` — key routing: pure `routeKey(state, key)` decision function
  replacing the hardcoded focus checks in `boot.ts`.
- `web/src/shell/preferences.ts` — versioned localStorage client preferences
  (`mercenary.browser-shell.preferences.v1`), overlaying only the `presentation` block of
  the tracked `settings.json`.
- `web/src/shell/panel.ts` — pure `panelViewModel(snapshot, context)` + thin diff-updating
  `installPanel`.
- `web/src/shell/menu.ts`, `settingsView.ts`, `controlsView.ts`, `saveChooser.ts` — System Menu
  layers. The Controls Page is drawn from the Control Profile's Binding table each time it opens
  (ADR 0056).
- `web/src/shell/keyNames.ts` — names a Binding's keys as the player's layout prints them where
  `navigator.keyboard.getLayoutMap()` answers (Chromium), for the Controls Page and the Head
  Command notice; US names elsewhere, for digits, and for any key the panel typefaces cannot
  draw (#606).
- `web/src/shell/saves.ts` — gains a headless `createSavePersistence` core; the chooser and
  the console both drive it.
- `web/src/shell/console.ts` — `parseConsoleCommand` + `executeConsoleCommand(cmd, deps)`;
  `web/src/shell/consoleView.ts` — the overlay, transcript and history.
- `web/src/shell/input.ts` — `RESERVED_CODES` names the codes the shell keeps, so the Control
  Profile cannot claim the console's key and the router builds its test from the same constant.
- Tests in `web/test/shell-*.test.ts`; e2e in `web/e2e/`.

## Code style

Follow the existing shell conventions: `install<Feature>(elements, deps)` functions with
injected elements and storage; pure decision logic split from DOM glue; closed vocabularies
narrowed before use; strict command parsing that throws specific messages (the
`decodeSessionTraceCommand` style in `web/src/trace/session.ts`).

```ts
export type PanelRendition = "targ" | "damocles";
export type Composition = "panel" | "strip";
```

## Data and rendering contract

- Instruments with ticks, tapes, or needles (Targ elevation gauge and compass; Damocles
  mini elevation gauge and compass tape) are drawn on small **2D canvases** inside the DOM
  panel, redrawn from the view model, with colours read from the CSS token layer so
  rendition switches restyle them. The extracted typefaces are usable there: registered
  `FontFace`s work on 2D canvas — the typography spec's DOM-only scope excludes only the
  WebGL Game Surface. Everything else stays DOM text with diff updates.
- The panel consumes the **Session Snapshot only** (CONTEXT.md rule). Static context —
  `cellSize`, an object-id→name map built from `World.objects` and the text table — is
  supplied alongside at install time and rebuilt in the load-restore callback; it is not a
  Snapshot extension.
- Targ rendition mapping: elevation←pitch, LOCATION←position/cellSize grid (ROOM nn
  underground), ALTITUDE←the middle/high bytes of position.y, SPEED signed, the shared
  23-cell Benson Display + `BENSON G9-ST` caption, COMPASS←heading; the red altitude lamp is
  lit while aboard a craft, and the lamp beside SPEED reports the run toggle, there being no
  attack warning in Targ for it to report instead.
- Damocles rendition: same data in Damocles dressing — inventory window←carried residence
  entries (names via the context map), cash←credits, clock←Targ time-of-day from elapsed;
  T/P gauges and impact-clock semantics are static dressing; ground-proximity and run lamps
  map, the attack lamp is dressing. The run lamp reports the run toggle rather than movement,
  which is the only feedback a latched key has, and stays dark aboard a craft, where running
  moves nothing.
- All-cell Structure Reach keeps Road Workspace links exclusive to the occupied Surface Cell.
  Bright Distant Structure Ink fades continuously from occupied-cell white toward `#a0a0a0`
  over horizontal camera distance; dim Ink remains black, and Map Lines remain selected only by
  Horizon Distance.
- Preferences: `{ panelRendition, composition, presentationPreset?, structureReach? }` under
  `mercenary.browser-shell.preferences.v1`; invalid or inaccessible storage is ignored.
  Typeface keeps its existing key. Authentic presentation forces occupied-cell Structure Reach;
  Enhanced presentation takes the player's choice or the tracked tuning document. Preferences
  never touch `flight`/`message`/`scripts` and provably leave the SaveEnvironment byte-identical.
- Saves: three slots, ADR 0026 unchanged; `describe(slot)` surfaces the codec's actual
  reject reason; two-press confirm for overwrite and delete, in the chooser and as
  `save <n> confirm` in the console.
- Console commands: `help`, `where`, `inventory`, `get <object-slot>`,
  `drop <object-id|name>`,
  `goto <x> <z> [height]`, `goto room <n>`, `goto object <slot>`,
  `set <setting> <value>`, `save <slot> [confirm]`, `load <slot>`, `panel <rendition>` (an alias
  of `set rendition`). The console reaches **three** sinks, and the distinction is worth stating:
  the Gameplay Session's own actions (`place`, `placeInAir`, `teleport`, `takeObject`) for
  `goto` and `get`; the preference stores for
  `set` — where `typeface` keeps its own key rather than living in preferences, and
  `sky document` and `structures document` hand each choice back to the tuning document; and the
  Save core for `save`/`load`. `load` is a **whole-session replacement** rather than a mutation:
  it is neither a semantic action nor a preference. The console is a development tool that
  writes play (ADR 0028): never part of the Game Surface, never in traces.
- The session validates neither `place` nor `teleport` — `place` accepts any vector and bypasses
  `Containment`; `teleport` accepts an unknown Room in silence — so refusing unusable input is
  the console's own work. `goto <x> <z> [height]` takes a grid reference across the full unsigned
  24-bit surface (cells 0 through 255), lands at the cell's middle, and teleports to the surface
  first (placing alone would move the player inside whatever Room they occupy). Without a height
  it keeps the altitude it found. With a height it puts a flyable craft into flight; on foot or
  aboard a non-flyable craft, the existing crash-tumble Mover makes the player fall. `goto room
<n>` refuses Room zero,
  which names the surface, and any Room the payload lacks; it teleports and does **not** place,
  so the session's own containment decides where the player lands.
  `goto object <slot>` follows the object's current Residence. Surface objects use their exact
  position, with signed parked coordinates normalised into the unsigned 24-bit world; Room
  objects teleport into their owning Room and use room-local coordinates. Carried and removed
  objects have no independent destination and are reported rather than guessed.
- `where` prints the player's Location and surface grid reference, X/Y/Z position,
  heading/pitch/roll orientation in radians, and Occupancy. Position and orientation values are
  rounded to three decimal places.
- `get <object-slot>` remotely takes one object without changing the player's Location or pose.
  It bypasses distance and Room only: fixed/heavy rules and the Carried Stack limit still apply,
  and carried or out-of-world objects are reported without changing state.
- `inventory` prints the Carried Stack in acquisition order, one Benson object id and name per
  line. `drop` selects within that stack: a carried numeric id wins, otherwise exact names and
  whole words/phrases rank ahead of substring matches. Ambiguous or absent matches are reported
  without changing play. The selected object is passed to the Session's ordinary Drop action, so
  airborne restrictions remain authoritative. An empty stack is reported explicitly. Console
  input is always presented in uppercase so the
  extracted display face never has to render its poor lowercase forms.
- `save <n> confirm` presses the Save core twice in one command and leaves nothing armed, so a
  press in the chooser cannot finish what was typed in the console. If a third surface ever needs
  confirmation, the shape to adopt is a non-mutating `plan(action, slot) -> {needsConfirmation}`
  with the expression of it left to each surface.
- The console does **not** pause the session, so a command's effect is visible in the panel as it
  is typed. This departs from the mockup, which pauses; the mockup is otherwise authoritative.
  The console keeps its own transcript, capped so a long session cannot grow it without bound,
  while the Save core's notice still reaches the message line as it does for the chooser.
- Key routing order: browser-reserved Alt/Ctrl/Meta chords pass through untouched;
  Backquote toggles the console before the Control Profile sees it; Escape drives the
  layer stack; any open layer or focused form control swallows keys (arrows never become
  Movement Intent); otherwise keys reach the Control Profile. Keyup always forwards.
  Opening any layer — the console included, though it never pauses — releases held
  keys; the menu pauses stepping (draw continues,
  `clock.reset()` on resume).
- Running is `R`, as it is on the Working Authority, and it latches rather than following the
  key: releasing held keys leaves it on, because a mode the player chose is not a key they are
  holding. The latch belongs to the Control Profile, so no Save, Session Resume or trace
  carries it, and R does not also answer a Benson poll — for the reason firing does not.

## Testing strategy

- Unit: router decision table (layer × key class × repeat); preferences validation and
  hostile storage; SaveEnvironment invariance under preferences; save-core arming,
  describe states, reject reasons, cross-tab reset; panel view-model boundary values
  (headings, pitches, room vs surface, empty inventory); console parser exhaustive over
  hostile input, executor against stub deps.
- E2E: panel composition default and fields tracking the snapshot; classic-strip toggle
  restores the old `#status-row` assertions; live and persisted Structure Reach; save round-trip
  through the chooser; Esc pause freezes `data-x`/`data-z`; console `goto` moves the player;
  focused chrome never leaks arrows into movement; Alt/Ctrl/Meta pass-through; no overflow at
  320/768/1024/1440 CSS px. Canvas dataset attributes and `#game-surface[data-state]` survive
  unchanged.
- Eye review (ADR 0011): live panel beside the untracked reference screenshot per
  rendition, verdict on issue #120; tracked stills in `docs/frames/` with regeneration
  recipes.

## Boundaries

- Always recreate panel artwork by hand in HTML/CSS; reference screenshots and any
  original bitmaps are Restricted Material and stay outside Git.
- Always route console mutation through the Gameplay Session; never poke Session State,
  and never let console commands into trace recordings.
- Always keep player-editable settings inside the `presentation` block and client
  preferences; never expose `flight`/`message`/`scripts` (baked into the SaveEnvironment —
  editing them makes saves unloadable).
- Ask before changing the three-slot save vocabulary (ADR 0026), adding gameplay data the
  Snapshot does not carry, or extracting the Damocles condensed label face.
- Never advance Damocles gameplay under cover of the rendition; it is chrome and
  typography over Targ data (ADR 0021 exception, recorded in ADR 0027).

## Success criteria

1. The Benson Panel is the default composition, both renditions pass the maintainer's
   side-by-side eye review, and the classic strip remains available behind a setting.
2. Settings, chooser, and console share the panel's token-defined style; preferences
   persist across reloads and provably never affect the SaveEnvironment.
3. Saves keep ADR 0026 behaviour to the byte (same keys, codec, slots), with reject
   reasons visible in the chooser.
4. Console commands work end-to-end through session semantic actions; chrome focus can
   never produce Movement Intent; browser chords pass through.
5. All web checks and the migrated e2e suite pass; no Restricted Material is committed.

## Decisions from mockup sign-off (issue #120)

- **Frame scaling**: one fixed-logical-size frame (640×400 in the mockup; the production
  frame keeps the existing 1280×800 Reference Viewport proportions plus the panel band),
  uniformly scaled and letterboxed. Small-but-legible at 320 px was reviewed and accepted.
- **Rendition structure**: two rendition subtrees (`.targ-only` / `.dmc-only`) sharing the
  token layer — the ST layouts differ structurally, so one semantic DOM was rejected.
- **Canvas instruments**: Targ elevation gauge and compass, Damocles mini elevation gauge
  and compass tape are 2D-canvas drawn (ticks on both edges, numbers in the compass centre
  row, pale centre marker — no black needle; Damocles separators and gauge ticks are square
  dot pairs; the Damocles elevation gauge keeps the sky/ground split in muted tints). The
  Damocles nav cluster's rows flex to fill its height.
- **Console confirm wording**: `save <n> confirm` for occupied slots.
- **Pause scope**: the System Menu pauses presentation ticking (Benson Display cadence, orrery
  clock) as well as simulation stepping — the whole frame freezes, as mocked.
- **Widget copy**: `BENSON G9-ST` caption; Damocles nav order name/speed then
  coords/altitude/heading; clock format `HH-MM-SS`.
