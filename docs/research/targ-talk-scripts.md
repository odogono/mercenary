# Targ Talk Scripts: a NorthTalk spike

Spike report, 2026-10-17. Tests whether [NorthTalk](https://github.com/odogono/odgn-talk) (`@odgn/northtalk`, language 1.0-rc.3, TS Core) can replace Benson Scripts with **Talk Scripts**: maintained, editable source that drives Targ through the Host Callout. It is the evidence for challenging [ADR 0045](../adr/0045-author-scripts-as-named-typescript-steps.md)'s named TypeScript steps. Nothing here changes the Gameplay Session, the Data Payload, Saves or Session Resume.

The spike lives in [`web/spike/northtalk/`](../../web/spike/northtalk/README.md). It rewrites Benson Script 0 (the opening) and Benson Script 7 (the Escape) as [`opening.talk`](../../web/spike/northtalk/scripts/opening.talk) and [`escape.talk`](../../web/spike/northtalk/scripts/escape.talk), runs them through a host adapter over `BensonHostState`, and judges them by player-visible outcome tests rather than Golden Traces.

## Recommendation

**Continue, and draft an ADR superseding ADR 0045 for Targ once the open items below are settled.** NorthTalk removes the reason ADR 0045 gave for named steps: a Talk Script's suspended state is a serializable continuation. Scripts read as linear dialogue, saves are taken mid-wait, and a save restored into a fresh Core finished exactly like an uninterrupted run. The costs are a ~143 KB (brotli) runtime, a private unpublished dependency, and one NorthTalk defect that makes long-lived Runs grow their saves.

## Decisions the spike worked under

| Decision | Choice |
|---|---|
| Fidelity | Free rewrite. Benson Scripts are the reference, not a specification. |
| Acceptance | Outcome tests; Benson Golden Traces only as a diff baseline. |
| Concurrency | Talk Scripts are concurrent actors, unlike Benson's one script at a time. |
| Message line | First in, first out: each message plays in full; a script waiting on its message resumes when that message has played. |
| Host Callout | Four Capabilities granted per script: `world`, `display`, `keys`, `sound`. |
| Core | TS Core first; the WASM Core waits for a browser wrapper in odgn-talk. |

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

| Capability | Operations | Mode |
|---|---|---|
| `world` | `boarded`, `onSurface`, `carries`, `credits`, `flag`, `advertIntact`, `roll`; `arm`, `setFlag`, `clearFlag`, `spend`, `escape`, `setMessageInterval` | immediate |
| `display` | `show` | suspending: answered when the message has played |
| `keys` | `awaitKey`, `awaitAny` (time-limited); `heard`, `forget` | suspending / immediate |
| `sound` | `silence` | fire-and-forget |

The host owns the clock (session seconds become epoch microseconds for `pump`), the display queue, key deadlines and randomness. Advancing time means pumping at each due deadline, the Group's `nextDeadline` or the host's own, until the target time. Grants make each script's reach explicit. A Talk Script can't write a symbol the host didn't name, which matches the closed symbol census ADR 0015 enforces at export.

## Outcomes

`bun test ./talk.spike.ts` in the spike directory: 12 tests, all passing.

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
- **Saves grow inside long-lived Runs.** A Run that loops on a suspending operation retains about 190 bytes per completed call until the Run ends. The opening's save grew from 16 KB to 644 KB over 12 game hours of calling out. A plain `wait` loop doesn't grow, and starting a fresh Run per call stays flat. This is a NorthTalk defect, filed as [odgn-talk#1119](https://github.com/odogono/odgn-talk/issues/1119). Until it is fixed, Talk Scripts that wait indefinitely should be message-driven, the host delivering events to a fresh Run, rather than polling forever inside one. ADR 0026 bounds Session Snapshots, so this blocks production use.
- **Saves are tied to one Core family.** A TS Core save doesn't restore into the WASM Core. Choosing a Core is therefore also a save-format decision.

## Cost

| Measure | Value |
|---|---|
| TS Core, browser build, minified | 0.58 MB; 167 KB gzip; 143 KB brotli |
| Runtime dependencies | none |
| 600 s of both scripts, TS Core on Bun | 19 ms |
| Fresh save of both scripts | 16 KB |
| Distribution | `private: true`; linked from a local checkout with `bun link` |

The WASM Core reports about 0.40 MiB brotli and 2 MiB of memory per instance, but it has no browser wrapper yet ([odgn-talk#1121](https://github.com/odogono/odgn-talk/issues/1121)).

## Open items before an ADR

1. **Upstream**: the per-call save growth in long-lived Runs ([odgn-talk#1119](https://github.com/odogono/odgn-talk/issues/1119)); a browser WASM wrapper exposing the TS host API, so the comparison can run the same tests with the Core swapped ([odgn-talk#1121](https://github.com/odogono/odgn-talk/issues/1121); odgn-talk's ADR 0089 currently keeps the browser on TS).
2. **Distribution**: how Mercenary pins NorthTalk so CI and worktrees can build it, either by publishing, vendoring or a git dependency.
3. **Event model**: room entry, boarding, pickups and Site destruction as messages delivered to Talk Scripts, replacing Benson's polling (`tsto`, `tstc`). The spike polls `boarded` once a second while it waits on Y.
4. **Production save policy**: Talk Script revision identity, compatibility checks, and migration or rejection. ADR 0045 left these open for Targ, and reissue semantics now join them.
5. **Concurrency rules**: which Talk Scripts may overlap, and whether a first-in-first-out display queue stays readable once room-entry and Faction Reaction scripts can stack.
6. **Gameplay Session seam**: whether Talk Scripts replace `BensonSession` wholesale or run beside it per script during migration.

## Appendix: what the Benson originals do

Decoded from `payload/benson.json` with [`machine.ts`](../../web/src/benson/machine.ts) semantics:

- **Test ops jump when the negative answer matches `branchOn`.** `tstc N` answers "craft N not boarded"; `tstf` answers "flag clear".
- **Only `msg`, `msgi` and `msgr` suspend** until the Benson Display releases. `wfr` waits for a tick. Spin loops built from `tstc`/`jmp` spend the 512-instruction budget every frame.
- **Script 0** arms object bits 4 on slots 1, 7 and 12. It plays the crash beats, a random verdict (`msgr`), the status report and four Y prompts (sub 108: five one-tick checks). Silence leads to sub 56, which calls out until any input. Buying subtracts 5000 from decimal 8. The script never clears engine flag 64; it falls through into Benson Script 1's code while it waits for the Dart.
- **Script 7** spins while the player is aboard ship 7 until room 0. It refuses launch without a Novadrive (object 25) or the hired flag (4), then waits for Y while aboard. On Y it rechecks, refuses if block 50 is destroyed, otherwise writes `gameComplete` (the Ending phase) as 1 and the message interval as 150, plays the congratulations and loops GAME OVER every 15 ticks.
