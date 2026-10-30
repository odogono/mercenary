# Run Targ's scripts as Talk Scripts

Accepted, 2026-10-18. Targ's game logic moves from Benson Scripts to **Talk Scripts**: maintained NorthTalk source, run on [`@northtalk/ts`](https://www.npmjs.com/package/@northtalk/ts)'s TS Core inside the Gameplay Session. This supersedes [ADR 0045](0045-author-scripts-as-named-typescript-steps.md) for Targ. ADR 0045 rejected linear scripts because a suspended JavaScript stack can't be saved; a NorthTalk Run's suspended state is a serializable continuation, so Talk Scripts read as linear dialogue and still save mid-wait. ADR 0045 continues to govern Damocles. Three spikes are the evidence ([the report](../research/targ-talk-scripts.md)).

## Decision

**Runtime.** `@northtalk/ts` is a runtime dependency of `web/`. As of 2026-10-28 it uses the requested `^0.3.0` range, superseding the original exact-pin policy; `bun.lock` records the tested resolution, and upgrades remain deliberate. Targ uses the TS Core. A save restores only into the Core family that made it, so this is also a save-format choice: moving to the WASM Core would need a save migration.

**World Events.** The Gameplay Session emits World Events itself: `entered room`, `boarded craft`, `left craft`, `took object`, `dropped object`, `destroyed site by faction`, `site gratitude` and `ship hit`. The set grows only when a Talk Script needs more. Each event is broadcast to every Talk Script and narrowed by Guards. Subjects are named, not numbered, through one adapter table. A frame's events are delivered in order, after the frame and before the pump. The `world` Capability offers immediate queries and commands, and no Talk Script waits by polling. A Room or object that only shows a message keeps it in the engine's data. Every Talk Script is loaded at Gameplay Session start and lives as long as the session.

**Player Input.** Keys no Binding takes reach Talk Scripts by name as `pressed key` messages, which `wait for` can race against World Events. The shell passes the key's code. A `prompt` makes its Run the Input Owner once its line shows and until the Run ends. The Input Owner alone receives Player Input; with no owner, every Talk Script does. The latest prompt wins, and when its Run ends the input returns to the prompt before it. A key pressed while the owner's prompt is still playing is latched until the Run reaches what follows the prompt, as Benson's key latch holds a key.

**The Benson Display.** A `report` plays its lines back to back, and no other Talk Script's line comes between them. `show` and `prompt` lines queue first in, first out between reports. The engine's own messages still cut in at once, and the interrupted report carries on with its next line.

**Migration.** Talk Scripts replace Benson Scripts one at a time, beside `BensonSession`. Benson refuses the Benson Scripts that a Talk Script replaces and runs the rest, so the Golden Traces keep checking the unported ones under [ADR 0015](0015-re-encode-benson-scripts-at-export.md). No Talk Script line starts while a Benson Script runs. Benson Scripts spin while they wait, so ports go in order of how long each script holds the display: Benson Script 0, the opening, first. `BensonSession` and ADR 0015's program representation for Targ go when no Benson Script is left to run.

The migration completed on 2026-10-19. The live `BensonChannel` owns the Benson Display, Host Callout and shared random stream, with no program loader or instruction execution. The interpreter and its program document live under `web/test/oracle/`, used by the Golden Traces and parity tests through an optional comparison adapter. They are not served during ordinary play. Scripts 21 and 30–33 were unreachable and were not ported. The payload exporter no longer emits `benson.json`.

Since schema 17 a Save holds no Benson interpreter continuation and no `bensonSchemaVersion` identity: only the shared random stream remains of Benson's state. The test oracle loses a running Benson Script at a Save. Talk continuations and code identities keep the policy below.

**Saves.** [ADR 0026](0026-store-explicit-save-snapshots-as-bounded-json.md) and [ADR 0030](0030-keep-one-browser-session-resumable.md) stay in force; the Save Snapshot gains a part for Talk Scripts.

- `SaveSnapshot.talk` holds the NorthTalk save as base64, each Talk Script's and the Library's `codeIdentity`, the Input Owner claims and the host clock, at schema 14. The base64 string has its own bound of 256K characters, exempt from the general string limit, and a test holds a save with every Talk Script loaded under it.
- A Talk Script's revision is its `codeIdentity`, a Library's change counting against every script that uses it. Identities stay out of `SavePayloadIdentity`, whose exact match would refuse every save after any script edit.
- On restore, a Talk Script whose identity differs is reloaded from the current source with its Script Variables carried over (`reload … 'carry variables'`). Its in-flight Runs end; unchanged scripts keep theirs. A script no longer in the build is dropped, and a new one loads fresh.
- Display calls left pending are reissued: a line, report or prompt plays again from its start, and a prompt takes the input again. The key latch is not saved.
- Schema 17, which dropped the Benson continuation, is the only one that loads. Schema 16 was the first to refuse older Saves (#897). Before it, a Save could still hold story state in engine and object flags that the Talk Scripts once took over, and dropping that hand-over meant refusing those Saves rather than migrating them, as ADR 0026 allows. Schemas 11 to 15 were migrated until then.
- The story bits the Talk Scripts keep as Script Variables, engine flags 1, 2, 4, 8 and 32 and object flag 1, never change in live play. The Semantic Observations still report them as they stand, and a comparison with the original or the Benson oracle clears them on both sides with `comparableObservations` (`web/src/session/observations.ts`), comparing the story through what it shows instead (#898).

**Authoring rules.**

- A Talk Script doesn't see World Events that arrive while it is inside another call. It checks the world, then waits for the change.
- Lines can wait a long time for the display, so a Talk Script checks the world before speaking too.
- Script Variables are part of the save. A renamed or retyped variable takes a new name and a default.

## Consequences

- The browser build grows by about 144 KB (brotli), and a pre-1.0 dependency comes with it.
- A Faction Reaction triggered while another Talk Script holds the display waits instead of being lost, as Benson's one-script-at-a-time rule lost it. This is a deliberate departure from Benson.
- Talk Scripts are judged by player-visible outcome tests. Benson Golden Traces are a diff baseline for ported scripts, not their acceptance test.
- Implementation follows in separate PRs: the World Event emitter in `GameplaySession`; the Talk Script host, Capabilities and Player Input in `web/src`; the save at schema 14; then porting Benson Script 0.
