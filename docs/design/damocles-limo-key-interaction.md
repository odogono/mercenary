# Damocles limo-key interaction: Host Callout and persistence contract

Design for [#299](https://github.com/odogono/mercenary/issues/299), bounding the interaction
recovered by [#298](https://github.com/odogono/mercenary/issues/298). Implementation belongs to
[#300](https://github.com/odogono/mercenary/issues/300) and browser verification to
[#301](https://github.com/odogono/mercenary/issues/301). This document adds no application
implementation.

It follows [ADR 0045](../adr/0045-author-scripts-as-named-typescript-steps.md): named TypeScript
steps, explicit serializable state, a Damocles-only Host Callout. Nothing here migrates Targ,
generalises the two Titles into one scripting framework, or touches
[`web/src/damocles/firstOffer.ts`](../../web/src/damocles/firstOffer.ts), which stays the isolated
prototype [#286](https://github.com/odogono/mercenary/issues/286) proved. It is also the production
decision ADR 0045's migration boundary deferred — script identity, revision and rejection policy —
made for Damocles alone.

## Evidence and scope

The [limo-key pickup research](../research/damocles-limo-key-pickup.md) is the sole authority for
every transition below, with the key's identity, placement and world-to-local transform from
[the Spaceport interior note](../research/damocles-spaceport-interior.md#resident-object-evidenced-inside-the-room).
Provenance is per value: **recovered** from the Working Authority, **derived** mechanically from
recovered values, or **authored** by this project (ADR 0043).

**Included.** The ordinary take of resident instance `object-slot-183` (`KEY- V.I.P. LIMO`) inside
Capital Spaceport region 1; its Object Residence, Carried Stack and panel effects; the one-shot
trigger that launches Damocles Script slot 2; that script's three inline messages, 200-frame wait,
clearing message and return to the idle jump; the drop and re-pick that prove the trigger does not
re-arm; and Damocles Save Snapshot and Session Resume across every one of those states.

**Excluded, with the reason.**

| Excluded | Why |
| --- | --- |
| The object-selection rule behind `$7B46`/`$7B42` | **Recovered** by [#303](https://github.com/odogono/mercenary/issues/303) and no longer excluded: `Selection` is the nearest drawn instance, in range below 1/128 of a surface-grid unit. See [the selection note](../research/damocles-object-selection.md). |
| The busy-path trigger arbitration (queue on bit 5, discard otherwise) and the sticky bit 6 variant | Derived from instructions, never reproduced, and unreachable here: trigger 2 disarms on its first fire, so no second dispatch can find the host busy. |
| The refusal messages at system-string indices `$02` and `$0C`, and the `$04E158` check behind the second | Unreachable for this object: the key's association byte is `$04`, so neither refusal applies. |
| The full-Carried-Stack path at capacity 10 | The capacity is recovered and enforced; what the original does when it is reached is not, and this slice has one takeable object, so it cannot be reached. |
| `$7AA8` = `$78` and `$04DDD0` ≠ 0 | Both refuse the take; both are unresolved words that held their permitting values throughout every observed run. Not modelled, not invented. |
| The other five entries of the `$0543EC` trigger table (slots 181, 151, 95, 101, 94) | Source facts only; their scripts are untested and their objects unreachable in this slice. The table carries one bound entry and the rest take the no-match path. |
| The reveal model — how a message's text arrives on the row, and how `$0523B8` divides between arrival and reading hold | **Recovered** by [#307](https://github.com/odogono/mercenary/issues/307) and no longer excluded: `$052402` scrolls a 48-cell row left by eight pixels a frame for 36 frames, then holds it for the remaining 164. See [the reveal note](../research/damocles-message-reveal.md). |
| Early completion of a presenting message by a key | **Answered** by [#307](https://github.com/odogono/mercenary/issues/307): there is none. Nothing outside the display routine's own completion ever lowers `$7BA0`, so no input shortens, skips or cancels a message. Targ's `SKIP_MESSAGE_CODE` has no Damocles equivalent. |
| The mission the messages describe, boarding, driving, the other objects' responses | Past the stopping boundary. |

**Stopping boundary.** The interaction ends when the script's final step pops the idle jump
`$0703FC` back off the return stack and execution parks. That is the recovered stable completion
point and the state every pre-take and post-response sample held.

**What the evidence does not establish.** Frame-exact input timing; the interpreter's instruction
dispatch rate between gates;
audible output, since the laboratory ran with sound off; the meaning of the association bits or of
the low X/Z values written while an object is held; why the drop path writes insertion-group
selector 1 rather than the authored 12. Where a rule is needed anyway it is marked authored below
and is stated as a convention, never as a recovered fact.

## Prerequisites

The research listed six minimum prerequisites. This contract carries five of them, pushes the sixth
out as separately bounded work, and adds two the six did not name. All three of those block #300.

Carried here: Object Residence for resident instances; the Damocles Carried Stack and its panel
label; frame-counted message presentation and the panel message line; the Damocles Script Host with
named steps, a return stack, a one-shot trigger table and a frame wait; and the Save Snapshot bump
those additions require.

Separately bounded, because each needed evidence this contract must not invent:

- **Object selection and the take range gate** ([#303](https://github.com/odogono/mercenary/issues/303)). *Settled.* Both words are written by the
  scene pass that draws objects, as a running minimum over the objects it draws: `$7B46` is the
  nearest one's slot and `$7B42` is the binary exponent of its distance from the eye, so `≤ 8`
  admits a distance under 512 source units — 1/128 of the surface-grid unit the payload's
  positions already use. Takeability is Association A byte 2, which
  `payload/damocles/catalogue.json` schema 12 now carries per resident instance as `handling`.
  [The selection note](../research/damocles-object-selection.md) records the evidence and the
  session-side rule; the `Selection` seam below is unchanged in shape and is now filled.
- **The message reveal model** ([#307](https://github.com/odogono/mercenary/issues/307)). *Settled.* The routine is `$052402`, called once per display frame
  from the frame interrupt. The panel row is **48 six-pixel character cells wide**, and a record
  enters it **from the right at eight pixels per frame for 36 frames** — 4/3 characters a frame —
  after which the finished row is copied into the other screen buffer and held, untouched, until
  the duration expires. So the 200 frames are **36 of arrival and 164 of reading hold**, with no
  departure: the row keeps its last message until the next one scrolls over it, which is why the
  response ends by presenting a line of spaces. Character *k* of a record lands in cell *k*; there
  is no centring, and a record's leading spaces are the original's own hand-centring. The
  expectation recorded here — that `Reveal` would be a revealed-character count — is **corrected**:
  eight pixels a frame through a six-pixel pitch means the row's left edge falls inside a character
  for two frames in every three, so the reveal is measured in pixels.
  [The reveal note](../research/damocles-message-reveal.md) records the evidence and the
  recommended shape, which the `Reveal` seam below now takes.
- **The message text** ([#304](https://github.com/odogono/mercenary/issues/304)). *Settled.* Script slot 2's three inline strings and
  system-string slot 50 are extracted into `payload/damocles/strings.json` along with the whole
  64-slot system string table and all 206 inline messages, under ADR 0029 and the
  [publication policy](../publication-policy.md). The four `MessageId` values below are the ids
  that payload names, records are stored with their padding intact, and
  [the strings note](../research/damocles-script-strings.md) records the encoding. A paraphrase
  authored into the app is still not a substitute and must never become claimed faithful content.

The display frame rate ([#305](https://github.com/odogono/mercenary/issues/305)). *Settled, and no longer authored.* The wait and message
durations remain recovered as **frames**; the conversion to seconds is now sourced.
[The display-rate note](../research/damocles-display-rate.md) recovers that the program runs in ST
low resolution and never programs the Shifter's sync mode, so the field rate is the machine's and
cannot vary by scene; a UK PAL machine gives **50 Hz**, measured at 50.053 Hz. The Eris presentation
document gains a `time` block carrying `vblHertz` at 50 with provenance **`derived`** rather than
`authored`, and `waitFrames` and `messageFrames` at 200 as `recovered`. Its schema goes 5 → 6. Each
200-frame duration is therefore 4.00 s and the whole response is 20.0 s.

## Values and interface

The following TypeScript shapes are the implementation contract. Execution is a persistent value
(ADR 0023): every transition returns a new state and leaves its input unchanged. No generator,
promise, timer or closure carries execution state.

```ts
type InstanceId = string; // a Damocles Catalogue Instance id, e.g. 'object-slot-183'

type Residence =
  | { readonly kind: 'carried' }
  | {
      readonly kind: 'placed';
      readonly parent: InstanceId; // the structure instance the position is local to
      readonly region: number;
      readonly position: { readonly x: number; readonly y: number; readonly z: number };
    };

/// Supplied by the recovered selection rule (#303): the nearest drawn instance by straight-line
/// distance from the eye, with `inRange` below 1/128 of a surface-grid unit. This contract
/// consumes it and does not define it.
type Selection =
  | { readonly kind: 'none' }
  | { readonly kind: 'object'; readonly instance: InstanceId; readonly inRange: boolean };

/// The ids `payload/damocles/strings.json` names these records with (#304).
type MessageId =
  | 'script2-inline-1' // $07042A
  | 'script2-inline-2' // $07045A
  | 'script2-inline-3' // $070488
  | 'system-string-50'; // $0704BE, operand $0032

/// The message row as the recovered display routine keeps it (#307): a 288-pixel window, 48
/// six-pixel cells wide, that a record's characters enter from the right at eight pixels a frame
/// for 36 frames and that is then held untouched for the rest of the duration.
type Reveal = {
  /// Pixels of this block's character stream already inside the row. Advances by 8 a frame and
  /// stops at 288, the whole row. Always a multiple of 8.
  readonly pixels: number;
  /// The character offset into the record this block started from. 0 for all four messages here;
  /// non-zero only for a record longer than 48 characters, which the routine shows in blocks.
  readonly offset: number;
  /// The 48 characters the row showed when this block began, which the message scrolls over.
  /// Spaces for a row that was blank.
  readonly beneath: string;
};

/// The message gate $7BA0 as state: non-null is raised, null is lowered.
type Presenting = {
  readonly id: MessageId;
  readonly remainingFrames: number;
  readonly reveal: Reveal;
} | null;

type ScriptId = 'damocles.script.slot-2';

type Step =
  | 'idle' // $0703FC, the parked jump-to-self
  | 'announce-1' | 'announce-2' | 'announce-3'
  | 'call-delay' | 'reset-wait' | 'poll-wait' | 'return-from-delay'
  | 'clear-line' | 'clear-busy' | 'return';

type Execution = {
  readonly script: ScriptId;
  readonly revision: number;
  readonly step: Step;
  readonly returnStack: readonly Step[];
};

type Trigger = {
  readonly index: number;
  readonly script: ScriptId | null; // null for the five recorded but unbound entries
  readonly armed: boolean;
};

type ScriptState = {
  readonly busy: boolean; // bit 6 of $7BD9
  readonly counter: number; // $7B9C, one per display frame, 0..65535
  readonly execution: Execution | null;
  readonly message: Presenting;
  readonly triggers: readonly Trigger[];
};

type Effect = { readonly type: 'sound-request'; readonly cue: 'take' };
type ScriptTransition = { readonly state: ScriptState; readonly effects: readonly Effect[] };

declare function initialScriptState(): ScriptState;
/// One display frame: advance the counter, age a presenting message, then run to the next block.
declare function runFrame(state: ScriptState): ScriptTransition;
/// The object-to-script dispatch at $054770, entered from the take path.
declare function fireTrigger(state: ScriptState, index: number): ScriptTransition;
```

`Selection` is the seam the recovered rule fills. It offers only instances whose takeability is
recovered — now every resident instance, through the payload's `handling` record — so the take
action never has to answer a question the evidence has not answered; a non-takeable object is
outside this contract rather than silently takeable.

The Damocles Host Callout is exactly `ScriptState` plus `Effect`. A Damocles Script may read and
write the counter, the message gate, the busy flag, the trigger table and its own execution
position, and may ask the host for a sound request. It reaches nothing else: pose, residence, the
Carried Stack and the world are the session's, and the script in this slice never touches them.
Native addresses stay in provenance, not in the interface. This is not Targ's Host Callout and
Targ's key consumption, message scheduling and Benson Display semantics are not Damocles semantics.

### Session State additions

`DamoclesSnapshot` gains `carried: readonly InstanceId[]` (replacing today's always-empty string
list), `message: Presenting`, `residence` for every tracked resident instance, and `selection`.
`ScriptState` is not in the Session Snapshot: nothing draws from it. The panel reads the carried
tail's **model** source label — `KEY- V.I.P. LIMO`, not the instance name — and its message line
reads `message` through the payload string the extraction issue delivers.

The renderer draws a resident instance when its residence is `placed` in the bound structure's
selected region, and stops drawing it the moment it becomes `carried`. That is the render-queue
rebuild at `$05A30E` expressed as a consequence of state rather than as an effect, so a restore
redraws correctly without replaying anything.

## Actions, scheduling and ordering

The session is the scheduler. There is no browser timer inside the script, and no action runs a
step implicitly.

**Frames.** The session keeps a fractional frame accumulator. Each `advance` sub-step adds
`seconds * vblHertz` to it and calls `runFrame` once per whole frame it yields, keeping the
remainder. The accumulator is saved, so an interrupted run and an uninterrupted one that receive
the same time steps produce the same frames at the same points.

**Per-frame order inside `runFrame`.**

1. `counter = (counter + 1) % 65536`.
2. If a message is presenting, advance its `Reveal` by one frame and decrement `remainingFrames`;
   at zero, clear it — the gate falls.
3. Execute steps until the script blocks or parks. Only two things block: a raised gate, and
   `poll-wait` below its threshold. The step table is acyclic apart from `poll-wait`, so this
   terminates without a step budget.

Steps 2 and 3 in the same frame means a message that ends this frame lets the next step run this
frame. Frame-exact ordering is not established by the evidence; this is a stated convention, not a
recovered fact. It is unobservable at the granularity the research sampled.

**Semantic Actions.** `take()` and `drop()` are one-shot Semantic Actions, each applied whole
between frames, never inside one. The browser Control Profile binds them to `KeyT` and `KeyD`, the
codes it already routes. The original chord is Right Shift with the Up arrow, which the browser
holds for walking; the mapping is a Control Profile decision and no part of Game Semantics.

### The take

Refused, silently and with no state change or effect, when the selection is absent, when
`inRange` is false, or when the Carried Stack is at its recovered capacity of 10. The handler at
`$0541F0` refuses in exactly that silence — no message, no sound — and the probe reproduced it from
ordinary walk routes that stopped slightly short. The capacity path is unreachable here.

On success, one atomic commit performs, in the recovered order:

| # | Effect | Provenance |
| --- | --- | --- |
| 1 | Push the instance onto the Carried Stack tail; the count becomes its length | carried list `$61CE`, count `$61CC` |
| 2 | The panel inventory label becomes the model's source label | panel writer `$04DCE4` |
| 3 | Residence becomes `carried` | association byte `$6FAA` + slot x 4 bit 7 set, association long `$73A8` + slot x 4 rewritten |
| 4 | Trigger dispatch for the instance's entry in the table, if it has one | `$0543BE` → `$0543D2` → `$054770` |
| 5 | One `sound-request` effect | guarded request at `$054848` |

All five lie in the recovered success path `$054264`–`$0542D0` and are listed in its order. The
drawn set follows from step 3 — the render-queue rebuild at `$05A30E` — and is not a separate
write. The association bits themselves are not modelled: residence is the session's own state, and
which bit means what is unresolved.

**Trigger dispatch.** A disarmed entry returns having done nothing. An armed entry with the host
already busy is excluded above. Otherwise: set `busy`, disarm the entry, push the current step
(`idle`) onto the return stack, set the step to the bound script's first step, and — as the
original's dispatch commits the new PC to a running interpreter — run to the next block exactly as
`runFrame` does. The take therefore commits with the first message already presenting, which is
what the probe sampled 1.4 s after the take. The entry does not re-arm — not on drop, not on
re-pick, not ever within a Gameplay Session.

### The drop

Returns the Carried Stack tail to `placed` residence at the player's position in the bound
structure's selected region, and clears the panel label when the stack empties. It fires no
trigger, emits no effect and runs no script. The insertion-group selector the original rewrites on
drop is unresolved and is not modelled; nothing in this contract reads it.

### The script

Damocles Script slot 2, reached through entry-table word `$070084` = `$042A`.

| Step | Behaviour and next step | Provenance |
| --- | --- | --- |
| `announce-1` | Present `script2-inline-1` for `messageFrames`; raise the gate; next `announce-2` | `$07042A` |
| `announce-2` | Present `script2-inline-2`; next `announce-3` | `$07045A` |
| `announce-3` | Present `script2-inline-3`; next `call-delay` | `$070488` |
| `call-delay` | Push `return-from-delay`; next `reset-wait` | `$0704BA` call to `$072CF4` |
| `reset-wait` | `counter = 0`; next `poll-wait` | `$072CF4` |
| `poll-wait` | Block while `counter < waitFrames`; at or above it, next `return-from-delay` | `$072CF6` |
| `return-from-delay` | Pop; next `clear-line` | `$072CFC` |
| `clear-line` | Present `system-string-50`; next `clear-busy` | `$0704BE` |
| `clear-busy` | `busy = false`; next `return` | `$0704C2` |
| `return` | Pop `idle`; execution becomes null | `$0704C6` |

`clear-line` gates like the inline messages and uses the ordinary duration. Its record is not
merely blank-padded: all 49 characters of system string slot 50 are spaces, so it is a full-width
line clear rather than a fourth statement. #307 observed it and adds two things. The indexed form
publishes the record's pointer **plus one**, so 48 of the 49 spaces are shown — exactly the row —
and the step is not an instantaneous clear: it is 48 blank cells scrolling the previous message off
over 36 frames, then 164 frames of a blank row. Four messages at 200 frames and one 200-frame wait make the whole response **1000
display frames**, consistent within sampling granularity with the ~20 s the probe measured.

Because both `runFrame` and `fireTrigger` run to the next block, execution is only ever observed at
a commit boundary in one of six states: parked, or blocked at `announce-2`, `announce-3`,
`call-delay`, `poll-wait` or `clear-busy`. That invariant is what makes the save table below
closed.

## Commit boundaries and atomicity

- A Semantic Action and a frame are each one commit. The session never exposes a half-applied
  take: before it, nothing happened; after it, the Carried Stack, residence, panel, trigger and
  execution position all moved together.
- Effects are transient outputs of a commit, delivered synchronously within it. They are not a
  queue, are never saved, and are never replayed on restore. No exactly-once delivery across a
  crash is promised, and none is needed: the only effect is a sound request.
- Message presentation is state, not an effect, so a restore re-presents the same message with the
  same remaining frames and does not re-request it.
- Session Resume checkpoints only between commits, and its existing contract applies unchanged:
  at most once a second for continuously changing state, immediately after a successful one-shot
  Semantic Action, and at the lifecycle boundaries [the Session Resume spec](../session-resume.md)
  already names. The take and the drop are one-shot Semantic Actions, so each checkpoints at once.

## Persistence

### Schema 4

The Damocles Save Snapshot goes 3 → 4. ADR 0044 reserved exactly this bump for the Carried Stack
and Damocles Script state; this is that bump, not a silent widening. There is no migration: a
schema-3 record, a Targ envelope, or a Catalogue or Eris identity mismatch is refused and the live
session is untouched. The Eris schema move 5 → 6 independently refuses older records through
`erisSchemaVersion`.

```ts
interface DamoclesSaveSnapshot {
  readonly carried: readonly InstanceId[];
  readonly elapsed: number;
  readonly frameAccumulator: number; // [0, 1)
  readonly pose: ErisPose;
  /// Only instances whose residence differs from the Catalogue's placement.
  readonly residence: readonly { readonly instance: InstanceId; readonly residence: Residence }[];
  readonly script: {
    readonly counter: number;
    readonly execution: Execution | null;
    readonly message: Presenting;
    readonly triggers: readonly { readonly index: number; readonly armed: boolean }[];
  };
  readonly structure: BoundStructureSnapshot | null;
}
```

### Script identity and revision

`script: 'damocles.script.slot-2'` is the production script identity: stable, named for the
recovered slot, and not the prototype's `damocles-first-offer`. `revision` is an integer bumped
whenever a step name, the step graph, or the meaning of a continuation changes — a cosmetic edit
that leaves every step name and edge alone does not bump it.

The compatibility rule is deliberately narrow: **a suspended execution is revision-bound; a parked
session is not.** A record whose `execution` is null carries no script identity to check and
restores across revisions. A record whose `execution` names an unknown script id, or a revision
other than the current one, is refused whole. Trigger armed state survives revisions, because
whether the key has already been taken is Session State rather than an execution position.

### Validation

Validation is atomic. The whole record is checked before anything is replaced; a refusal returns a
readable reason and leaves the current Gameplay Session exactly as it was. No coercion, no partial
restore, no best-effort migration. The rules:

- Every `instance` names a Catalogue instance the session tracks. `placed` residence names the
  bound structure as `parent`, an integer region within that structure's region count, and finite
  coordinates.
- `carried` has no duplicates, has at most 10 entries, and contains exactly the instances whose
  residence is `carried`.
- `counter` is an integer in 0–65535. `frameAccumulator` is a number in [0, 1).
- `message`, when present, names a known `MessageId` with an integer `remainingFrames` in
  1–`messageFrames`, and a `Reveal` its own validator accepts and finds consistent with that
  remaining count.
- `triggers` lists each modelled entry once. An armed entry requires its object to be at its
  Catalogue placement and absent from the Carried Stack. A non-null `execution` requires the
  launching entry to be disarmed.
- `execution`, when present, is one of the five reachable commit-boundary states:

| `step` | `busy` | `message` | `returnStack` | `counter` |
| --- | --- | --- | --- | --- |
| `announce-2` | true | `script2-inline-1` | `['idle']` | any |
| `announce-3` | true | `script2-inline-2` | `['idle']` | any |
| `call-delay` | true | `script2-inline-3` | `['idle']` | any |
| `poll-wait` | true | null | `['idle', 'return-from-delay']` | < `waitFrames` |
| `clear-busy` | true | `system-string-50` | `['idle']` | any |

  A `Reveal` is refused unless `pixels` is a multiple of 8 in `0..288` and equal to
  `Math.min(288, 8 * (messageFrames - remainingFrames))`, `offset` indexes the record, and
  `beneath` is exactly 48 printable-ASCII characters. A null `execution` requires `busy` false and
  `message` null. Any other step — `announce-1`,
  `reset-wait`, `return-from-delay`, `clear-line`, `return` — cannot survive a commit boundary and
  is refused.

## Worked traces

**First pickup.** Standing in region 1 with the key selected and in range, `take()`: the Carried
Stack becomes `['object-slot-183']`, the panel reads `KEY- V.I.P. LIMO`, residence becomes
`carried`, the key leaves the drawn set, trigger 2 disarms, `busy` rises, the return stack holds
`['idle']`, `announce-1` runs and leaves message 1 presenting with 200 frames to go and the step
blocked at `announce-2`, one sound request is emitted, and the Session Resume checkpoints. Frames
200, 400 and 600 hand over to messages 2, 3 and then the wait, whose counter resets at frame 600.
Frame 800 releases `poll-wait` and `clear-line` presents the clearing message; frame 1000 clears
`busy`, pops `idle` and parks. Total 1000 frames after the take.

**Repeat.** `take()` again at any point — mid-response or after it — finds no selection, because
the key is no longer resident. Were it selected, the trigger is disarmed and dispatch would return
having done nothing. The Carried Stack stays at one entry, nothing re-presents, and no second
response runs.

**Drop and re-pick.** `drop()` returns the key to `placed` residence at the player's position in
region 1, empties the Carried Stack, blanks the panel label and redraws the key. `take()` picks it
up again: stack, panel, residence and drawn set all move as before, one sound request is emitted —
and no script runs, because trigger 2 is still disarmed. Execution never leaves parked.

**Save before pickup.** The record has an empty Carried Stack, no residence departures, trigger 2
armed, null execution, null message. Restoring it and then taking the key produces the same
ordered frames and effects as an uninterrupted run from the same point.

**Save during a message, after it has arrived.** Saved at frame 300, the record holds step
`announce-3`, message `script2-inline-2` with 100 remaining frames, `busy` true, return stack
`['idle']`, the key carried, trigger 2 disarmed. Its `Reveal` is `pixels` 288 — message 2 finished
arriving at frame 236 and the row has been held since — with `offset` 0 and `beneath` the 48 cells
message 1 left. Restoring re-presents message 2 on the same row with 100 frames left and emits no
message request. Frame 100 after the restore hands over to message 3 exactly as the uninterrupted
run does at frame 400.

**Save during a message, while it is still arriving.** Saved at frame 210, ten frames into message
2, the record is the same except for 190 remaining frames and `pixels` 80. Restoring puts the row
back 80 pixels into the scroll — thirteen and a third characters in, not thirteen — and the
remaining 26 arrival frames run as they would have. A record whose `pixels` disagrees with
`8 × (messageFrames − remainingFrames)` is refused.

**Save mid-wait.** Saved with step `poll-wait` and `counter` at 137, the restored session blocks
for 63 more frames and then proceeds. A record with `poll-wait` and `counter` at 240 is refused:
it could not have survived a commit boundary.

**Save after completion.** Null execution, null message, `busy` false, trigger 2 disarmed, the key
carried. The restored session parks, takes nothing further, and presents nothing. The same record
restores under a later script revision, because it names no execution.

**Refused restores.** A schema-3 record, a Targ record, a Catalogue or Eris identity mismatch, an
armed trigger 2 alongside a carried key, a `carried` entry with `placed` residence, a
`remainingFrames` of 0 or 201, an unknown script id, and a stale revision beside a live execution
are each refused whole, with the live session untouched.

## Test plan

Deterministic unit tests are the authority; #301's browser pass is confirmation, not proof.

- **Take preconditions.** Absent selection, out of range, and in range each from the same pose.
  Refusals change nothing and emit nothing. Assert the input state object is not mutated.
- **Ordered commit.** One take produces the five ordered outcomes above in one transition, and the
  key leaves the drawn set in the same snapshot that shows it carried.
- **Script frames.** Assert the state immediately after the take and at frames 199, 200, 399, 400,
  599, 600, 799, 800, 999 and 1000 of the response, including the exact step, message id, remaining
  frames, counter, busy flag and return stack. Assert exactly one sound request over the whole
  response.
- **Frame accumulation.** Drive the same 1000 frames with one long step, with many short steps, and
  with steps that straddle frame boundaries; the resulting step and message sequence is identical.
- **Repeat, drop and re-pick.** No second response, no duplicated message, no second sound request,
  and the trigger stays disarmed across an arbitrary number of drop/take cycles.
- **Save round-trip.** Round-trip each of the five reachable commit-boundary states plus parked and
  pre-pickup through JSON, taking the three message states both at a partly revealed row — inside
  the 36 arrival frames, where `pixels` is not yet 288 — and after it has arrived. Apply the same remaining frame and action sequence to the restored and
  uninterrupted runs, and compare every state and every ordered effect array.
- **Refusal.** Each row of the refused-restore list, asserting both the reason and that the live
  session is byte-identical afterwards.
- **Revision.** A parked record restores under a bumped revision; a suspended one is refused.
- **Isolation.** A Targ Save and a Targ Session Resume are untouched by every Damocles operation,
  and `firstOffer.ts` and its demo route are unchanged.
- **Browser (#301).** Walk the supported route, take the key, watch the four messages and the wait,
  and confirm the parked end; save and restore at each of the boundaries above through both a Save
  slot and Session Resume; check `KeyT`/`KeyD` operation, desktop and narrow layouts, and the
  absence of console errors.

## Implementation prerequisites for #300

In dependency order, with the three blocking issues first:

1. ~~Object selection and takeability recovered~~ — [#303](https://github.com/odogono/mercenary/issues/303), delivered as
   [the selection note](../research/damocles-object-selection.md) and the `handling` record in
   `payload/damocles/catalogue.json`.
2. ~~The message reveal model recovered~~ — [#307](https://github.com/odogono/mercenary/issues/307),
   delivered: the row is 48 cells, the reveal is 8 pixels a frame for 36 frames, the remaining 164
   frames are reading hold, and no input ends a message early. `Reveal` above is the recovered shape.
3. ~~The message strings extracted into `payload/damocles/`~~ — [#304](https://github.com/odogono/mercenary/issues/304), delivered as
   `payload/damocles/strings.json`.
4. `web/damocles/eris.json` schema 6 with its `time` block.
5. Resident instances placed in the world: `erisSurfaceFrom` currently skips every instance whose
   `location` is null, which is every structure-anchored resident including slot 183. Placement
   comes from `placement.parent`, `placement.position` and the recovered world-to-local transform;
   residence becomes mutable session state.
6. The Damocles Script Host: `ScriptState`, `runFrame`, `fireTrigger`, the trigger table and the
   named steps of slot 2, as new modules beside — not inside — `firstOffer.ts`.
7. Carried Stack, message presentation and the panel's inventory and message lines.
8. `take()` and `drop()` on `DamoclesSession`, wired from `boot.ts`'s currently no-op `reach` and
   `drop` Control Profile actions.
9. Save schema 4 in `web/src/damocles/save.ts` with the validation table above.
