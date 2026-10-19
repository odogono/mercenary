# Targ Talk Scripts: a NorthTalk spike

Spike report, 2026-10-17. Tests whether [NorthTalk](https://github.com/odogono/odgn-talk) (then `@odgn/northtalk`, language 1.0-rc.3, TS Core; now [`@northtalk/ts`](https://www.npmjs.com/package/@northtalk/ts) 0.1.0) can replace Benson Scripts with **Talk Scripts**: maintained, editable source that drives Targ through the Host Callout. It is the evidence for challenging [ADR 0045](../adr/0045-author-scripts-as-named-typescript-steps.md)'s named TypeScript steps. Nothing here changes the Gameplay Session, the Data Payload, Saves or Session Resume.

The spike lives in [`web/spike/northtalk/`](../../web/spike/northtalk/README.md) and ran three times:

- **The first spike** rewrote Benson Script 0 (the opening) and Benson Script 7 (the Escape) as Talk Scripts and ran them through a stand-in host over `BensonHostState`. The sections from [Authoring](#authoring) to [Cost](#cost) record it; its code was replaced by the second spike's and is in the history of commit `d3f82630`.
- **The second spike** ran the opening, the Escape, the Mechanoid briefing (Benson Script 13) and the Faction Reactions (34 and 35) in a real Gameplay Session, driven by [World Events](#decisions-for-the-adr) with every Benson Script refused. [World Events in a Gameplay Session](#world-events-in-a-gameplay-session) records it.
- **The third spike** tested the concurrency rules and the migration seam: reports that hold the display, prompts that own Player Input, and Talk Scripts running beside the Benson Scripts they don't replace. [Concurrency and the migration seam](#concurrency-and-the-migration-seam) records it.

Both judge the Talk Scripts by player-visible outcome tests rather than Golden Traces.

## Recommendation

**Accepted as [ADR 0080](../adr/0080-run-targs-scripts-as-talk-scripts.md), which supersedes ADR 0045 for Targ.** The second spike ran Talk Scripts inside a real Gameplay Session on World Events, and they drove the engine's own Benson Display, Ending and hostile encounter. NorthTalk removes the reason ADR 0045 gave for named steps: a Talk Script's suspended state is a serializable continuation. Scripts read as linear dialogue, saves are taken mid-wait, and a save restored into a fresh Core finished exactly like an uninterrupted run. The costs are a ~144 KB (brotli) runtime and a pre-1.0 dependency.

## Decisions the spike worked under

| Decision     | Choice                                                                                                                 |
| ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Fidelity     | Free rewrite. Benson Scripts are the reference, not a specification.                                                   |
| Acceptance   | Outcome tests; Benson Golden Traces only as a diff baseline.                                                           |
| Concurrency  | Talk Scripts are concurrent actors, unlike Benson's one script at a time.                                              |
| Message line | First in, first out: each message plays in full; a script waiting on its message resumes when that message has played. |
| Host Callout | Four Capabilities granted per script: `world`, `display`, `keys`, `sound`.                                             |
| Core         | TS Core first; the WASM Core once odgn-talk wrapped it (it has, in 0.1.0).                                             |

## Authoring

Benson Script 7 is 50 instructions of polarity-inverted tests, register loads and non-yielding spin loops ([decoded semantics](#appendix-what-the-benson-originals-do)). The Talk Script reads as the behaviour:

```talk
show "PRESS Y TO LAUNCH" and wait
awaitLaunch and wait
if it is false then return
```

Compared with the alternatives:

- **Benson instructions** (ADR 0015): mechanically comparable with the original, but not editable source. Tick-counted waits hide real durations: the buy prompt's five ticks are about 0.8 s at the traces' `timeScale` 6.
- **Named TypeScript steps** (ADR 0045, [`firstOffer.ts`](../../web/src/damocles/firstOffer.ts)): reviewable and typed, but every wait point becomes a hand-written state transition, and the continuation is bookkeeping the author maintains.
- **Talk Scripts**: linear handlers with `and wait` at each suspension point, which the loader checks both ways. Waits are stated in seconds. Engine knowledge such as object slots, flag bits and the block-50 advert sits behind named host operations (`ask world to flag "shipHired"`, `ask world to advertIntact`), so the script names the rule rather than the bit.

What the rewrite surfaced:

- `tell` is legal only for fire-and-forget operations. Immediate operations need `ask`, which the loader reports as `wrong mode`.
- Functions may call immediate operations but never suspend, which suits predicates such as `aboard()` and `canLaunch()`.
- `say` is NorthTalk's console shorthand, so the display helper is named `show`.

## The Host Callout as Capabilities

[`host.ts`](../../web/spike/northtalk/host.ts) keeps a persistent `BensonHostState` (ADR 0023): every operation replaces the value, and `BensonEffect`s carry display and sound output as the Benson path does.

| Capability | Operations                                                                                                                                           | Mode                                             |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `world`    | `boarded`, `onSurface`, `carries`, `credits`, `flag`, `advertIntact`, `roll`; `arm`, `setFlag`, `clearFlag`, `spend`, `escape`, `setMessageInterval` | immediate                                        |
| `display`  | `show`                                                                                                                                               | suspending: answered when the message has played |
| `keys`     | `awaitKey`, `awaitAny` (time-limited); `heard`, `forget`                                                                                             | suspending / immediate                           |
| `sound`    | `silence`                                                                                                                                            | fire-and-forget                                  |

The host owns the clock (session seconds become epoch microseconds for `pump`), the display queue, key deadlines and randomness. Advancing time means pumping at each due deadline, the Group's `nextDeadline` or the host's own, until the target time. Grants make each script's reach explicit. A Talk Script can't write a symbol the host didn't name, which matches the closed symbol census ADR 0015 enforces at export.

## Outcomes

12 tests, all passing.

- **Opening**: the crash beats, the random verdict, the status report and four buy prompts in order. A silent player is called out to; a player heard during the pitch is told the walk will be long; Y buys the Dart for 5000 credits; a key during calling out welcomes the player back and restarts the pitch.
- **Escape**: no Novadrive refuses launch; Y with a Novadrive sets the Ending phase to 1, sets the message interval to 150 and repeats GAME OVER; the annoyed-commander lines appear when flag 32 is set; a destroyed advert keeps the player on Targ; leaving the ship abandons the launch.
- **Concurrency**: boarding the armed ship during the opening interleaves both scripts' messages first come, first served, without errors.
- **Saves**: see below.

## Trace diff

[`trace-diff.ts`](../../web/spike/northtalk/trace-diff.ts) replays the inputs of `script-0-parked` and `script-0-answered` against `opening.talk` and aligns the two message sequences. Over the traces' 120 s:

- Every Benson Message the Talk Script reaches matches in text and order, except `PRICE 5OOO CREDITS`. The original spells it with letter O's; the rewrite prints 5000.
- The Talk Script runs about 8–20 s behind. It deliberately keeps a 4 s opening pause, 2 s beats and five-second key windows where the original's tick-counted waits are a fraction of a second at `timeScale` 6. Display pacing itself matches: the host plays each message for 0.09 s per character plus a 3 s hold, which reproduces the traces' spacing within about 0.3 s.
- In `script-0-answered`, the Y at 20 s counts as input heard. It doesn't buy the Dart in either version, because both open their key window only after the prompt has played. The Benson original gets the same result by clearing the pending key (`clrk`) before the prompt.
- The original's blank padding messages (message 50) are not reproduced.

## Saves

- **Mid-wait restore works.** A save taken while the Escape waits on Y was restored into a fresh Core and host. After Y it produced the same messages and Ending phase as a run that never saved. Pending calls come back in `RestoreResult.pending`, and the host settles each with `reissue`.
- **The host owns part of the save.** NorthTalk saves only script state. The display queue, key deadlines, armed objects and host state must be saved beside it ([`TalkHostSave`](../../web/spike/northtalk/host.ts)). With `reissue`, a message caught mid-play replays from its start, and a key wait restarts its whole window. That is acceptable for Targ but a policy choice, not a NorthTalk guarantee.
- **`effects pending` didn't occur.** The spike uses no Capability Scopes or Segment participants, so `save()` was never refused.
- **Saves grow inside long-lived Runs.** A Run that loops on a suspending operation retains about 190 bytes per completed call until the Run ends. The opening's save grew from 16 KB to 644 KB over 12 game hours of calling out. A plain `wait` loop doesn't grow, and starting a fresh Run per call stays flat. This was a NorthTalk defect, filed as [odgn-talk#1119](https://github.com/odogono/odgn-talk/issues/1119) and fixed in `@northtalk/ts` 0.1.0: the opening's save now settles at 22 KB and stays there over 12 game hours, and the issue's reproduction stays flat (6818 → 6885 → 6885 bytes after 1, 240 and 480 calls).
- **Saves are tied to one Core family.** A TS Core save doesn't restore into the WASM Core (rechecked on 0.1.0: `invalid save`). Choosing a Core is therefore also a save-format decision.

## Cost

| Measure                                                                 | Value                                                                           |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| TS Core, browser build, minified                                        | 0.59 MB; 144 KB brotli (0.1.0)                                                  |
| WASM Core: `@northtalk/ts/wasm` wrapper plus `talk.wasm` reactor-v0.5.0 | 43 KB brotli JS plus 725 KB brotli WASM (3.1 MB raw)                            |
| Runtime dependencies                                                    | none                                                                            |
| 600 s of the opening, TS Core and WASM Core on Bun                      | 44 ms and 42 ms                                                                 |
| Fresh save of both scripts                                              | 16 KB (TS); the WASM Core's save of the same state is about half the TS Core's  |
| Distribution                                                            | `@northtalk/ts` on npm, MIT; `talk.wasm` from odgn-talk's `reactor-v*` releases |

`@northtalk/ts/wasm` exposes the TS Core's embedding API ([odgn-talk#1121](https://github.com/odogono/odgn-talk/issues/1121)). With the host taking its Core as an option, all 12 outcome, concurrency and save tests pass unchanged on both Cores (`NORTHTALK_WASM=… bun test`). That ran under Bun, not yet in a browser. The WASM path costs about five times the TS Core's download, so the TS Core stays the default unless speed or memory under real script load says otherwise.

## Decisions for the ADR

Decided after the spikes and recorded, with the save policy, in [ADR 0080](../adr/0080-run-targs-scripts-as-talk-scripts.md).

**Distribution.** `@northtalk/ts` is an exact-pinned devDependency of `web/` (`"0.1.0"`, upgraded deliberately in its own commit; `bun.lock` records the tarball hash). Only tests and spikes import it: nothing under `web/src` does until the ADR is accepted, when it becomes a runtime dependency. The spike's tests run in `bun run check`.

**World Events.** A [World Event](../../CONTEXT.md) is a change in play the Gameplay Session announces to every Talk Script:

- **Broadcast, narrowed by Guards.** Every Talk Script with a Handler for the event receives it (`on boarded craft c where c is "ship"`). There is no binding table, no Benson-style arming and no `watch` subscriptions to save.
- **Messages for change, queries for decisions.** The `world` Capability keeps immediate queries (`boarded`, `carries`, `onSurface`) for checks at the moment of deciding, plus commands. A Talk Script never loops on a query to wait for change.
- **The first set** grows only when a Talk Script needs more: `entered room`, `boarded craft` and `left craft` (crashes included), `took object` and `dropped object`, `site destroyed … by faction` and `site gratitude`, and `ship hit`.
- **Subjects by name.** Events and queries name Rooms, objects, craft and Sites (`"novadrive"`, `"ship"`), mapped to payload slots in one adapter table.
- **Delivered per frame.** A frame's World Events are delivered in order, as one batch after the frame and before the pump, so queries in a Handler see the world as the frame left it.
- **Plain messages stay data.** A room or object that only shows a message keeps it in the engine's data.
- **Talk Scripts live for the session.** Each is loaded at Gameplay Session start and saved with it; nothing starts or ends a Talk Script per trigger.
- **Derived until the ADR.** The next spike derives World Events by comparing session state across each frame; emitting them from the Gameplay Session is part of the ADR.

**Player Input.** A key press is [Player Input](../../CONTEXT.md), not a World Event: it isn't a change in play, and it is routed differently.

- **Messages, because `wait for` races only messages.** A key arrives as `pressed key`, so a prompt can wait for "Y, or the player leaves the ship" as one race. A `keys` Capability couldn't take part in that race.
- **Only keys no Binding takes, by name.** Player Input is the shell's fall-through, the keys `holdAndPress` sees now, named `"Y"`, `"Q"`, `"7"`. Controls never reach a Talk Script.
- **A prompt owns the input.** `prompt line` shows a line like `show` and makes its Run the [Input Owner](../../CONTEXT.md) from the moment the line shows until the Run ends, however it ends. Presses go to the Input Owner's script alone; with no owner, they go to every Talk Script. The most recent prompt wins, and when its Run ends, the input goes back to the prompt before it if that Run is still live.

**The display.**

- **A report is one block.** `report lines` plays its lines back to back, and no other Talk Script's line comes between them. Single `show` lines queue first in, first out between blocks. A reaction triggered during the briefing waits for it instead of being lost, which is a deliberate change from Benson's refusal of every start while a script runs.
- **The engine's messages cut in.** A Room or object message the engine shows replaces the current line at once, as it does for Benson Scripts, and the report carries on with its next line. A report is uninterruptible only by other Talk Scripts.

**The Gameplay Session seam.** Talk Scripts replace Benson Scripts one at a time, beside `BensonSession`. Benson refuses the Benson Scripts a Talk Script replaces and runs the rest, so the Golden Traces keep checking the unported ones and each port is its own PR. `BensonSession` goes when nothing is left for it to run. The World Event emitter goes into `GameplaySession` itself, not a subclass. While both run, no Talk Script line starts while a Benson Script is running. The third spike found that a spinning Benson Script holds the display for minutes (see its [findings](#findings-1)), so ports go in order of how long each script holds the display, Benson Script 0 first.

The second and third spikes tested these in a real Gameplay Session; see the next sections.

## World Events in a Gameplay Session

The second spike runs every Talk Script in one Group for a whole headless Gameplay Session.

- **Benson stays, quietly.** [`QuietBenson`](../../web/spike/northtalk/session.ts) refuses every Benson Script and records what it refused, so taking, boarding, leaving and the Benson Display keep working through the Host Callout.
- **World Events are derived.** [`TalkSession`](../../web/spike/northtalk/session.ts) compares occupancy, Location, the Carried Stack, destroyed cells and the faction counters before and after each frame, and broadcasts the differences. A Site counts only when a faction was credited, so neutral Sites and Sites destroyed away from the player raise nothing, as in the Site Ledger.
- **Talk Script messages use the session's Benson Display.** `show` queues for it and answers when the display releases the line (`BensonSession.showText`), so a Talk Script waits its turn behind the engine's own messages.
- **Subjects have names.** [`names.ts`](../../web/spike/northtalk/names.ts) maps Rooms, objects and Sites to the names Talk Scripts use.
- **Shared code is a Library.** `show` and `report` live once in [`benson.talk`](../../web/spike/northtalk/scripts/benson.talk), imported with `use show, report from benson`.

### Key presses are messages too

Beyond the agreed event set, the spike delivers key presses as a Broadcast, `pressed key`, and drops the `keys` Capability. NorthTalk's `wait for` block then states each prompt as the race it is (the third spike turns the `show` into a `prompt`):

```talk
show "PRESS Y TO LAUNCH" and wait
if not aboard() then return
wait for
  when pressed key where key = "Y" then
  when left craft where craft = "ship" then
    return
end wait
```

The opening's five-second offer becomes `when pressed key where key = "Y" then return true` with `after 5 s then return false`, and "heard anything" becomes a Script Variable set by an `on pressed key` Handler. This was later settled as [Player Input](#decisions-for-the-adr), routed to the Input Owner rather than broadcast.

### Outcomes

`bun test ./spike/northtalk/talk.test.ts` from `web/`, inside `bun run check`: 15 tests, all passing on the TS Core and, with `NORTHTALK_WASM`, on the WASM Core.

| Talk Script                                                        | Benson Script | Tested                                                                                                                                                                    |
| ------------------------------------------------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`opening.talk`](../../web/spike/northtalk/scripts/opening.talk)   | 0             | The crash and status report reach the Benson Display; Y at an offer buys the Dart; a key outside an offer means a long walk; silence brings calling out.                  |
| [`escape.talk`](../../web/spike/northtalk/scripts/escape.talk)     | 7             | Boarding is a World Event where Benson would have started script 7; surfacing aboard and Y starts the Ending; no Novadrive refuses; leaving the ship abandons the launch. |
| [`briefing.talk`](../../web/spike/northtalk/scripts/briefing.talk) | 13            | Entering Room 102 plays the briefing; leaving during the first part cuts the rest; re-entering while it plays doesn't restart it (the Run ends `dropped`).                |
| [`reaction.talk`](../../web/spike/northtalk/scripts/reaction.talk) | 34, 35        | Destroying a faction's installation sends its ship on a low roll and nothing on a high one.                                                                               |

Two more: the opening and the briefing playing together, and a save while the Escape waits on Y restored into a fresh Core that finishes the same.

### Findings

- **Talk Script writes reach the engine.** `escape` set the Ending phase to 1, and the session's own Ending field took over from there (it writes 255). `sendAttacker` set `attackingShip`, which gates the session's hostile encounter.
- **World Events aren't buffered.** A Run that is inside `show … and wait` when the player leaves the ship never sees `left craft`. Code between Suspension Points runs without interruption, so checking the world just before `wait for` is race-free: `if not aboard() then return`. That is the authoring rule: check, then wait for the change.
- **A Guard that fails still starts a Run.** Each World Event starts a Run in every Talk Script with a Handler for its Selector. A Run whose Guard doesn't match ends `unhandled`, at about 12 fuel. That is cheap, but it grows with the number of Talk Scripts listening to common events such as `entered room`.
- **Queueing Policies fit room scripts.** `, dropping` on the briefing's Handler is the whole of "don't start again while it plays". Benson got the same effect by refusing every start while any script ran.
- **First-in-first-out interleaves monologues.** Entering the briefing room during the opening alternates the two scripts a line at a time ("STATUS REPORT", "MECHANOID BRIEFING ROOM", "CRASH LANDED ON TARG", "WE WILL PAY", …), which nobody could read. A `report` needs to hold the display for all of its lines; the third spike does that.
- **Every listener hears every key.** The opening's offer and the Escape's prompt both wait for `pressed key "Y"`. If both were open at once, one press would buy the Dart and launch the ship. Input needs an owner; the third spike gives it one.
- **The real Benson Display moves the trace diff closer.** On the session's display the opening's lines land within about 9 s of the script-0 traces, some ahead and some behind, against 8–20 s behind on the first spike's stand-in. It now differs only where the Talk Script deliberately waits longer.
- **Subclassing `GameplaySession` is fragile.** Two of the adapter's private names (`sites`, `look`) collided with the session's own, and one shadowed a field at run time. Emitting World Events from the Gameplay Session itself, as the ADR would, avoids that.
- **Not covered.** `took object` and `dropped object` are derived but no Talk Script listens to them yet. Gratitude and `ship hit` aren't derived. A Site restored by the Anti Time Bomb and destroyed again raises the event again, whereas Benson had spent that Site's reaction, so a Talk Script that cares must remember.

| Measure                                                           | TS Core                      | WASM Core                     |
| ----------------------------------------------------------------- | ---------------------------- | ----------------------------- |
| Added to 600 s of play at 50 frames per second, four Talk Scripts | ~100 ms (about 3 µs a frame) | ~410 ms (about 14 µs a frame) |
| Save of the four Talk Scripts after 600 s                         | 28 KB                        | 14 KB                         |

## Concurrency and the migration seam

The third spike puts the [decisions](#decisions-for-the-adr) on concurrency and the seam into the same harness.

- **Display blocks.** `display` gains `report`, which takes the whole list, and `prompt`. The host plays a block's lines in turn on the Benson Display and answers after the last. `benson.talk`'s `report` and `prompt` wrap them.
- **Input Ownership.** The host keeps the open prompts' claims, each a script and a Run, and drops a claim when its Run's `run end` report arrives. `TalkHost.input` sends a press to the latest claim's script with `group.script(name).deliver`, or broadcasts it when there are no claims. The claims are saved beside the Group.
- **Key names.** `TalkSession.keyMake` records each key's code before any Binding sees it, and `press`, which the shell calls only for keys no Binding took, sends Player Input under that name. The tests drive Targ's `BrowserControlProfile`, so a bound key is turned away by the shell's own Bindings.
- **Benson beside Talk Scripts.** `QuietBenson` refuses only the Benson Scripts the loaded Talk Scripts replace (`PORTED` in [`session.ts`](../../web/spike/northtalk/session.ts)) and runs every other one. A Talk Script line starts only while no Benson Script runs.

### Outcomes

`bun test ./spike/northtalk/talk.test.ts` from `web/`: 22 tests, all passing on the TS Core and on the WASM Core. What the new ones show:

| Rule                        | Tested                                                                                                                                                      |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A report holds the display  | The briefing, entered during the status report, starts only after its last line, and both play unbroken.                                                    |
| Engine messages cut in      | TOO HEAVY, shown mid-briefing, replaces WE WILL PAY at once and plays out; the briefing then carries on with its next line.                                 |
| The latest prompt wins      | With the launch prompt and the offer both open, Y buys the Dart and doesn't launch; when the opening's Run ends, the next Y goes back to the launch prompt. |
| Ownership ends with the Run | Leaving the ship ends the Escape's Run, and the next key is broadcast. The same holds after a restore into a fresh Core: Run ids survive it on both Cores.  |
| A key latches               | Y pressed while the offer is still scrolling in still buys the Dart.                                                                                        |
| Only unbound keys, named    | Through Targ's Bindings on foot, E and D are taken as controls; Q, 7 and Y reach the Talk Scripts as `"Q"`, `"7"`, `"Y"`.                                   |
| Benson beside Talk Scripts  | Unported Benson Script 0 shows exactly the same lines with or without the briefing room entered; the briefing waits, and plays once script 0 ends.          |

The save test also checks that the Escape keeps the input across a restore.

### Findings

- **A running Benson Script holds the display for too long.** Benson Scripts spin while they wait. After the sale, script 0 falls through into Benson Script 1's code and waits for the player to board the Dart, so under the agreed rule no Talk Script line can play until then: 30 s in the test, and as long as the player likes in play. Benson would have refused the briefing outright in that state, so the player hears no less than before, but the rule is stronger than intended. Two ways out: hold the display only while a Benson Script's own message plays (Talk lines then interleave with a Benson Script's line by line, during migration only), or port script 0 first, since it is the long-running one. ADR 0080 keeps the rule and ports script 0 first.
- **Queued lines go stale.** The briefing, held back by script 0, played its first part after the player had long left the room; its own check cut the rest. A line can wait for the display much longer than its moment lasts. The authoring rule from the second spike extends to speaking: check the world before a report as well as before a `wait for`.
- **Prompts need a key latch.** A Run inside `prompt … and wait` isn't yet waiting for a key, so a Y pressed while the prompt scrolls in would be lost. Answering the prompt as soon as it shows fixes that but starts the five-second window early: the opening ran 6 s ahead of the script-0 traces by its fifth offer. Instead the host holds the Input Owner's key while its prompt plays and delivers it once the Run has reached its `wait for`, as Benson's key latch holds a key until a script tests it. The trace diff stays within about 9 s. The latch isn't saved; a save in that moment loses the key.
- **Input Ownership needs nothing from NorthTalk.** Call records carry `runId` and `scriptName`, `run end` reports carry the Run, and Run ids survive a restore, so the host keeps the claims itself.
- **Host-side lists count from 1.** `Value.index(0)` answers a value whose `asText()` is `undefined`, not an error, so an off-by-one dropped a report's first line silently.
- **The engine's cut is a lost line.** A Talk Script line the engine overwrites counts as played and isn't shown again, as with a Benson Script's. That suits Room messages but means an important line can be missed; nothing in the spike needs more.
- **The shell has to pass the key.** Targ's `press` takes a `BensonKey`, which knows only Y. The spike recovers the code with `keyMake`, which Damocles uses but Targ's shell doesn't; once Talk Scripts are accepted, `press` should take the code.

| Measure                                                            | TS Core            |
| ------------------------------------------------------------------ | ------------------ |
| Added to 600 s of play at 50 frames per second, four Talk Scripts  | under 1 µs a frame |
| One key press, to the Input Owner / broadcast to four Talk Scripts | ~9 µs / ~13 µs     |
| Save of the four Talk Scripts after 600 s                          | 29 KB              |

## Open items

1. ~~**Upstream**~~: settled. Save growth is fixed and the WASM Core runs the same tests (see [Saves](#saves) and [Cost](#cost)).
2. ~~**Distribution**~~: settled (see [Decisions for the ADR](#decisions-for-the-adr)).
3. ~~**Event model**~~: settled, and the second spike confirms it in a real Gameplay Session. Key presses are Player Input, not World Events.
4. ~~**Production save policy**~~: settled in [ADR 0080](../adr/0080-run-targs-scripts-as-talk-scripts.md): revision by `codeIdentity`, changed scripts reloaded with their variables, pending display calls reissued, schema-13 Saves migrated.
5. ~~**Concurrency rules**~~: settled, and the third spike confirms them: a report holds the display, a prompt owns the input.
6. ~~**Gameplay Session seam**~~: settled: one script at a time beside `BensonSession`, Benson Script 0 first.

## Appendix: what the Benson originals do

Decoded from `payload/benson.json` with [`machine.ts`](../../web/test/oracle/machine.ts) semantics:

- **Test ops jump when the negative answer matches `branchOn`.** `tstc N` answers "craft N not boarded"; `tstf` answers "flag clear".
- **Only `msg`, `msgi` and `msgr` suspend** until the Benson Display releases. `wfr` waits for a tick. Spin loops built from `tstc`/`jmp` spend the 512-instruction budget every frame.
- **Script 0** arms object bits 4 on slots 1, 7 and 12. It plays the crash beats, a random verdict (`msgr`), the status report and four Y prompts (sub 108: five one-tick checks). Silence leads to sub 56, which calls out until any input. Buying subtracts 5000 from decimal 8. The script never clears engine flag 64; it falls through into Benson Script 1's code while it waits for the Dart.
- **Script 7** spins while the player is aboard ship 7 until room 0. It refuses launch without a Novadrive (object 25) or the hired flag (4), then waits for Y while aboard. On Y it rechecks, refuses if block 50 is destroyed, otherwise writes `gameComplete` (the Ending phase) as 1 and the message interval as 150, plays the congratulations and loops GAME OVER every 15 ticks.
