# Damocles first-offer TypeScript contract

Design for [#288](https://github.com/odogono/mercenary/issues/288), implementing the authoring decision in [ADR 0045](../adr/0045-author-scripts-as-named-typescript-steps.md). Implementation and developer presentation belong to [#289](https://github.com/odogono/mercenary/issues/289) and [#290](https://github.com/odogono/mercenary/issues/290). This document adds no application implementation.

Live play does not use this contract. [#612](https://github.com/odogono/mercenary/issues/612) runs the whole of slot `$04` as `damocles.script.slot-4` in `web/src/damocles/scripts.ts`, on the interpreter every other Damocles Script uses. The step order, the persistent latch, the pre-prompt clear and the 500-tick fall-through below carry over unchanged. The isolated harness `web/src/damocles/firstOffer.ts` stays for the developer page.

## Evidence and scope

The [first-offer research](../research/damocles-first-offer.md) supplies recovered-address provenance, capture hashes, repeatable probes and their limits. The segment starts at reward setup `$0707DC`, not slot `$04`'s entry `$070650`, and ends **before** executing acceptance `$0709AA` or next-offer `$070830`. Prior briefing, later bargaining, payment, mission consequences and random branches are excluded.

The prototype reproduces controlled instruction-checkpoint observations. It does not establish frame-exact timing, seconds per counter tick, physical-key make/break/repeat, natural message completion, message-resume/pending-script arbitration, audible output or whole-game equivalence. The probe holds the latter arbitration states clear; the prototype excludes them. Counter wrapping follows the recovered word counter; the runtime probe did not measure a naturally occurring wrap.

## Values and interface

The following TypeScript shapes are the implementation contract. Use ordinary named step functions, with a dispatcher selecting one function from `state.step`. No generator, asynchronous continuation, generated instruction program or mutable closure carries execution state. All updates return new values; previous values remain unchanged, as in [ADR 0023](../adr/0023-make-the-host-callout-a-persistent-value.md).

```ts
type Step =
  | "set-reward" | "clear-key" | "request-prompt" | "reset-counter"
  | "check-y" | "check-o" | "check-n" | "check-timeout"
  | "accepted" | "next-offer";
type Key = "none" | "y" | "o" | "n" | "other";
type PromptId = "first-offer";
type Reward = readonly [number, number, number];
type Message =
  | { readonly status: "absent" }
  | { readonly status: "pending" | "completed"; readonly id: PromptId };
type Wait =
  | { readonly kind: "none" }
  | { readonly kind: "message"; readonly id: PromptId }
  | { readonly kind: "counter"; readonly threshold: 500 };
type State = {
  readonly step: Step;
  readonly locals: { readonly proposedReward: Reward | null };
  readonly message: Message;
  readonly wait: Wait;
  readonly host: { readonly key: Key; readonly counter: number };
};
type Action =
  | { readonly type: "set-key"; readonly key: Key }
  | { readonly type: "advance-ticks"; readonly ticks: number }
  | { readonly type: "complete-message"; readonly id: PromptId }
  | { readonly type: "execute-step" };
type Effect =
  | { readonly type: "request-message"; readonly id: PromptId }
  | { readonly type: "request-acknowledgement"; readonly key: "y" | "o" | "n" }
  | { readonly type: "handoff"; readonly branch: "accepted" | "next-offer" };
type Transition = { readonly state: State; readonly effects: readonly Effect[] };
type PrototypeSnapshot = {
  readonly formatVersion: 1;
  readonly scriptId: "damocles-first-offer";
  readonly scriptRevision: 1;
  readonly state: State;
};

declare function initialState(): State;
declare function transition(state: State, action: Action): Transition;
declare function snapshot(state: State): PrototypeSnapshot;
declare function restore(value: unknown):
  | { readonly ok: true; readonly state: State }
  | { readonly ok: false; readonly error: string };
```

Initial state is `set-reward`, null reward, absent message, no wait, key `none`, counter zero. Reset constructs this initial state and clears the demo's effect history; it does not run any steps. No original slot-launch semantics are inferred from this manual start.

`host` is the bounded, named Damocles Host Callout view. The harness supplies key changes, ticks and completion; the script determines reward assignment, pre-prompt clear, reset, branching and requests. Native addresses and key codes belong in provenance, not the interface. Do not reuse Targ's key-consumption or display scheduling implementation as Damocles semantics.

The proposed reward is an explicit local value exposed to the harness, not a payment effect. Once established it is exactly `[0x0010, 0, 0]`; its economic encoding and scale remain unresolved. `other` groups keys irrelevant to this segment without claiming their wider meanings.

## Actions and scheduling

Each action is synchronous and ordered by its caller. There is no automatic scheduler or combined input-and-execution action. `execute-step` runs at most one row of the table below. Host actions never run a step implicitly.

- `set-key` replaces the latch, which persists until another supplied change or the pre-prompt clear. A matching predicate never consumes it.
- `advance-ticks` accepts nonnegative safe integers. Compute `(counter + (ticks % 65536)) % 65536`; counter remains an integer in 0–65535. Advancing time never branches by itself. Ticks may advance during a pending message; completion does not reset them until `reset-counter` executes.
- `complete-message` changes the matching pending prompt to completed and clears its message wait. It does not execute `reset-counter`. Completion when no matching prompt is pending is an unchanged-state, no-effect action.
- With a pending message, `execute-step` is an unchanged-state, no-effect action. Input and ticks remain independently supplied.
- Terminal states make all valid actions no-ops. Repeated execution cannot reissue a handoff. This terminal freeze is a harness boundary, not a claim that the original host stops.
- Invalid action values are rejected before mutation or effects. The caller reports the error and retains current state.

`wait.kind = "counter"` identifies the polling phase; it does not block Y/O/N checks or schedule a wake-up. Only `check-timeout` compares the counter. Message completion leaves a completed prompt and no wait at `reset-counter`; the next execution enters the counter phase.

| Step | Behaviour and next step | Provenance |
| --- | --- | --- |
| `set-reward` | Assign proposed reward; next `clear-key`. No effect. | `$0707DC` |
| `clear-key` | Set latch to `none`; next `request-prompt`. | `$0707E6` |
| `request-prompt` | Set pending `first-offer` message and message wait; commit next step `reset-counter`; emit one message request. | `$0707E8`, successor `$070816` |
| `reset-counter` | After message completion, set counter zero and counter wait threshold 500; preserve key; next `check-y`. | `$070816` |
| `check-y` | If Y, enter `accepted`; otherwise next `check-o`. | `$070818` |
| `check-o` | If O, enter `accepted`; otherwise next `check-n`. | `$07081E` |
| `check-n` | If N, enter `next-offer`; otherwise next `check-timeout`. | `$070824` |
| `check-timeout` | If counter < 500, next `check-y`; otherwise enter `next-offer`. | `$07082A` |
| `accepted` / `next-offer` | Terminal; execute no downstream instructions. | Boundaries `$0709AA` / `$070830` |

Entering a terminal state clears the wait and emits one handoff. A matching key emits `request-acknowledgement` **before** that handoff in the returned effects array. Timeout emits only the handoff. Preserve the counter, key, reward and completed message at termination.

Acknowledgement denotes the recovered call to the native sound-request routine, not key consumption, effect arming or audible sound. The original can suppress arming while still accepting. The harness records the request; it does not emulate unresolved sound guards or produce an equivalence claim about audio.

## Suspension, save and restore

The harness applies each transition's state and effects synchronously as one action, exposing save controls only between completed actions. Effects are transient outputs, not a pending delivery queue. No crash-safe or asynchronous exactly-once delivery protocol is promised. An asynchronous future host would need a separate design.

The committed state already identifies the continuation when a message request is emitted. Save a detached JSON-compatible snapshot of that state. On restore, reconstruct the pending prompt from `message`; do not invoke the message-request effect again. A completed prompt remains completed. Reward, latch, counter, wait and next step are restored directly, not rebuilt by replaying earlier functions. Effect history is diagnostic, outside the snapshot, and is cleared on restore; comparison tests compare future effect sequences.

The demo displays a labelled paraphrase, such as “Demonstration prompt: accept the proposed offer? Y/O accepts; N declines.” No original text is embedded here. Pending/completed status is sufficient; there is no simulated scrolling, character progress or original display timing.

`restore` validates the entire input before returning success. Require the exact format, script ID and revision above; finite integer counter range; recognized step/key/message/wait variants; and exactly the established reward tuple when present. Reject unknown fields and structurally inconsistent states. Reachable combinations are:

| Step | Reward | Message | Wait |
| --- | --- | --- | --- |
| `set-reward` | null | absent | none |
| `clear-key`, `request-prompt` | established | absent | none |
| `reset-counter` | established | pending | matching message |
| `reset-counter` | established | completed | none |
| Any `check-*` | established | completed | counter, threshold 500 |
| Either terminal | established | completed | none |

The `locals` and `host` objects have exactly their declared fields; message IDs are always `first-offer`. Counter/key values may vary at nonterminal checkpoints through host actions. Validation need not reconstruct historical inputs to prove a terminal branch. Return a detached state on success; return a readable error on failure without replacing the harness's current state. No coercion, partial restore or migration.

These are prototype snapshots, not production Saves or Save Snapshots. Keep them in the isolated harness's memory/download controls, with no access to game Save or Session Resume storage. Increment the prototype revision when the continuation meaning or script behaviour changes and reject old revisions. This local policy does not settle production identity or future Targ compatibility.

## Worked traces

### Message suspension and acceptance

1. From initial state, execute reward setup, key clear and prompt request as three actions. The last returns one message request and leaves `step = reset-counter`, with a pending message.
2. Supply 499 ticks and key Y. Executing while pending changes nothing and emits nothing.
3. Save and restore. The harness displays the pending prompt from state, with no new request.
4. Complete the prompt. Counter remains 499 and key remains Y. Execute `reset-counter`: counter becomes zero, key remains Y, next step is `check-y`.
5. Execute `check-y`: enter `accepted`, return acknowledgement(Y), then accepted handoff. No acceptance-path flag/table writes occur. Further actions emit nothing.

### Input after its checkpoint

Start at `check-y`, counter 499, key `none`, with the completed prompt and counter wait. Execute once: next step is `check-o`. Supply Y, then one tick. Execute O, N and timeout checks separately: neither key predicate matches, and timeout at 500 enters `next-offer` without acknowledgement. If the tick action is omitted, timeout at 499 returns to `check-y`, where Y accepts. Y present before `check-y` at 500 instead accepts immediately.

### Counter wrapping

At `check-timeout`, counter 65535, supply one tick: counter becomes zero without execution. Executing now loops to `check-y`. Executing before supplying that tick would instead hand off to next-offer. Large supplied increments can cross 500 without an intervening comparison; the harness must not invent a scheduled timeout at the crossed threshold.

## Acceptance for implementation and demo

- At `check-y`, hold each of none/other/Y/O/N stable through polling at both 499 and 500. Y/O accept, N advances, none/other loop at 499 and advance at 500. Only matched keys request acknowledgement; no match consumes the latch.
- At `check-timeout` with 500, all keys advance without acknowledgement. Cover the late-Y trace at 499 and 500 and save/restore between each predicate.
- Cover the pre-prompt key clear, blocked execution, ticks and keys supplied during presentation, explicit completion and subsequent counter reset that preserves the key. Duplicate completion is harmless.
- Cover zero ticks, wraparound, large safe increments and invalid increments. Threshold crossing alone never executes a branch.
- Round-trip initial, pending-message, completed-before-reset, mid-poll and terminal states through JSON. Apply the same remaining action sequence to restored and uninterrupted runs; compare every resulting state and ordered effect array. No repeated reward setup, message, acknowledgement or handoff.
- Reject malformed shapes, inconsistent phase state and identity/version mismatches without changing current state. Verify that previous state values and snapshot inputs are never mutated.
- The developer-only page exposes single-step execution and separate key, tick, completion, reset, save and restore controls. Show step, reward, latch, counter, message/wait and effect history; label its evidence limits and paraphrase. No browser timer, main-game navigation entry or production storage access.
- Follow #290's desktop/narrow-screen, keyboard accessibility, console-error and invalid-restore checks. No live Gameplay Session integration or shared Targ framework is part of these tests.

## Running the developer demo

Run `cd web && bun run dev`, then open
`http://127.0.0.1:5173/damocles/first-offer`. The page is available only through
the existing localhost development server and has no main-game navigation entry.
Execute three steps to reach the pending prompt, complete the message, then
execute the counter reset to reach `check-y`. Set a response and supply ticks
independently, or use the combined control (set latch, add ticks, execute one
step, in that order). No time advances automatically.

Save writes prototype JSON to the editable text area. Copy it elsewhere to keep
it across page closure; restore validates the entire record before replacing
state and clears diagnostic effect history without replay. Reset preserves the
text area so a saved checkpoint can be revisited. Neither operation accesses
game Saves or Session Resume.

`cd web && bunx playwright test e2e/first-offer.e2e.ts` checks boundary input
precedence, pending-message and mid-wait restoration, invalid restore/input
recovery, keyboard operation, browser errors, storage isolation and layouts at
320, 768, 1024 and 1440 pixels. Harness unit tests remain the deterministic
future-state/effect comparison authority; the page makes no stronger original
runtime claim.
