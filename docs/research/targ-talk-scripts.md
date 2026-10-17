# Targ Talk Scripts: a NorthTalk spike

Spike report, 2026-10-17. Tests whether [NorthTalk](https://github.com/odogono/odgn-talk) (then `@odgn/northtalk`, language 1.0-rc.3, TS Core; now [`@northtalk/ts`](https://www.npmjs.com/package/@northtalk/ts) 0.1.0) can replace Benson Scripts with **Talk Scripts**: maintained, editable source that drives Targ through the Host Callout. It is the evidence for challenging [ADR 0045](../adr/0045-author-scripts-as-named-typescript-steps.md)'s named TypeScript steps. Nothing here changes the Gameplay Session, the Data Payload, Saves or Session Resume.

The spike lives in [`web/spike/northtalk/`](../../web/spike/northtalk/README.md) and ran twice:

- **The first spike** rewrote Benson Script 0 (the opening) and Benson Script 7 (the Escape) as Talk Scripts and ran them through a stand-in host over `BensonHostState`. The sections from [Authoring](#authoring) to [Cost](#cost) record it; its code was replaced by the second spike's and is in the history of commit `d3f82630`.
- **The second spike** ran the opening, the Escape, the Mechanoid briefing (Benson Script 13) and the Faction Reactions (34 and 35) in a real Gameplay Session, driven by [World Events](#distribution-and-world-events) with every Benson Script refused. [World Events in a Gameplay Session](#world-events-in-a-gameplay-session) records it.

Both judge the Talk Scripts by player-visible outcome tests rather than Golden Traces.

## Recommendation

**Continue, and draft an ADR superseding ADR 0045 for Targ once the open items below are settled.** The second spike ran Talk Scripts inside a real Gameplay Session on World Events, and they drove the engine's own Benson Display, Ending and hostile encounter. NorthTalk removes the reason ADR 0045 gave for named steps: a Talk Script's suspended state is a serializable continuation. Scripts read as linear dialogue, saves are taken mid-wait, and a save restored into a fresh Core finished exactly like an uninterrupted run. The costs are a ~144 KB (brotli) runtime and a pre-1.0 dependency. The save-growth defect the spike found is fixed in `@northtalk/ts` 0.1.0, and the same tests pass on the WASM Core.

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

## Distribution and World Events

Decided after the spike, for the ADR that would supersede ADR 0045. Routing only matters if Talk Scripts are accepted, so these aren't an ADR of their own.

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

The second spike tested this in a real Gameplay Session; see the next section.

## World Events in a Gameplay Session

The second spike runs every Talk Script in one Group for a whole headless Gameplay Session.

- **Benson stays, quietly.** [`QuietBenson`](../../web/spike/northtalk/session.ts) refuses every Benson Script and records what it refused, so taking, boarding, leaving and the Benson Display keep working through the Host Callout.
- **World Events are derived.** [`TalkSession`](../../web/spike/northtalk/session.ts) compares occupancy, Location, the Carried Stack, destroyed cells and the faction counters before and after each frame, and broadcasts the differences. A Site counts only when a faction was credited, so neutral Sites and Sites destroyed away from the player raise nothing, as in the Site Ledger.
- **Talk Script messages use the session's Benson Display.** `show` queues for it and answers when the display releases the line (`BensonSession.showText`), so a Talk Script waits its turn behind the engine's own messages.
- **Subjects have names.** [`names.ts`](../../web/spike/northtalk/names.ts) maps Rooms, objects and Sites to the names Talk Scripts use.
- **Shared code is a Library.** `show` and `report` live once in [`benson.talk`](../../web/spike/northtalk/scripts/benson.talk), imported with `use show, report from benson`.

### Key presses are messages too

Beyond the agreed event set, the spike delivers key presses as a Broadcast, `pressed key`, and drops the `keys` Capability. NorthTalk's `wait for` block then states each prompt as the race it is:

```talk
show "PRESS Y TO LAUNCH" and wait
if not aboard() then return
wait for
  when pressed key where key = "Y" then
  when left craft where craft = "ship" then
    return
end wait
```

The opening's five-second offer becomes `when pressed key where key = "Y" then return true` with `after 5 s then return false`, and "heard anything" becomes a Script Variable set by an `on pressed key` Handler. This needs confirming as a decision: input isn't a change in play, so it stretches the definition of a World Event.

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
- **First-in-first-out interleaves monologues.** Entering the briefing room during the opening alternates the two scripts a line at a time ("STATUS REPORT", "MECHANOID BRIEFING ROOM", "CRASH LANDED ON TARG", "WE WILL PAY", …), which nobody could read. A `report` needs to hold the display for all of its lines. This is open item 5's question, now answered: plain first-in-first-out isn't enough.
- **Every listener hears every key.** The opening's offer and the Escape's prompt both wait for `pressed key "Y"`. If both were open at once, one press would buy the Dart and launch the ship. Input needs an owner, which also belongs to open item 5.
- **The real Benson Display moves the trace diff closer.** On the session's display the opening's lines land within about 9 s of the script-0 traces, some ahead and some behind, against 8–20 s behind on the first spike's stand-in. It now differs only where the Talk Script deliberately waits longer.
- **Subclassing `GameplaySession` is fragile.** Two of the adapter's private names (`sites`, `look`) collided with the session's own, and one shadowed a field at run time. Emitting World Events from the Gameplay Session itself, as the ADR would, avoids that.
- **Not covered.** `took object` and `dropped object` are derived but no Talk Script listens to them yet. Gratitude and `ship hit` aren't derived. A Site restored by the Anti Time Bomb and destroyed again raises the event again, whereas Benson had spent that Site's reaction, so a Talk Script that cares must remember.

| Measure                                                           | TS Core                      | WASM Core                     |
| ----------------------------------------------------------------- | ---------------------------- | ----------------------------- |
| Added to 600 s of play at 50 frames per second, four Talk Scripts | ~100 ms (about 3 µs a frame) | ~410 ms (about 14 µs a frame) |
| Save of the four Talk Scripts after 600 s                         | 28 KB                        | 14 KB                         |

## Open items before an ADR

1. ~~**Upstream**~~: settled. Save growth is fixed and the WASM Core runs the same tests (see [Saves](#saves) and [Cost](#cost)).
2. ~~**Distribution**~~: settled (see [Distribution and World Events](#distribution-and-world-events)).
3. ~~**Event model**~~: settled, and the second spike confirms it in a real Gameplay Session. Whether key presses are World Events still needs confirming ([Key presses are messages too](#key-presses-are-messages-too)).
4. **Production save policy**: Talk Script revision identity, compatibility checks, and migration or rejection. ADR 0045 left these open for Targ, and reissue semantics now join them.
5. **Concurrency rules**: which Talk Scripts may overlap. The second spike showed that a first-in-first-out queue interleaves monologues line by line, and that every Talk Script waiting for a key hears it. A report must hold the display, and input needs an owner.
6. **Gameplay Session seam**: whether Talk Scripts replace `BensonSession` wholesale or run beside it per script during migration.

## Appendix: what the Benson originals do

Decoded from `payload/benson.json` with [`machine.ts`](../../web/src/benson/machine.ts) semantics:

- **Test ops jump when the negative answer matches `branchOn`.** `tstc N` answers "craft N not boarded"; `tstf` answers "flag clear".
- **Only `msg`, `msgi` and `msgr` suspend** until the Benson Display releases. `wfr` waits for a tick. Spin loops built from `tstc`/`jmp` spend the 512-instruction budget every frame.
- **Script 0** arms object bits 4 on slots 1, 7 and 12. It plays the crash beats, a random verdict (`msgr`), the status report and four Y prompts (sub 108: five one-tick checks). Silence leads to sub 56, which calls out until any input. Buying subtracts 5000 from decimal 8. The script never clears engine flag 64; it falls through into Benson Script 1's code while it waits for the Dart.
- **Script 7** spins while the player is aboard ship 7 until room 0. It refuses launch without a Novadrive (object 25) or the hired flag (4), then waits for Y while aboard. On Y it rechecks, refuses if block 50 is destroyed, otherwise writes `gameComplete` (the Ending phase) as 1 and the message interval as 150, plays the congratulations and loops GAME OVER every 15 ticks.
