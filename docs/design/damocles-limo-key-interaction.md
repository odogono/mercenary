# Damocles limo-key interaction: Host Callout and persistence contract

Design for [#299](https://github.com/odogono/mercenary/issues/299), bounding the interaction
recovered by [#298](https://github.com/odogono/mercenary/issues/298). Implementation belongs to
[#300](https://github.com/odogono/mercenary/issues/300) and browser verification to
[#301](https://github.com/odogono/mercenary/issues/301). This document adds no application
implementation.

**Status after the #300 implementation interview.** #300 remains a separate Eris /
`object-slot-183` delivery. [#319](https://github.com/odogono/mercenary/issues/319) extends this
Host Callout; it does not absorb the ticket. The include-list below is the implementation
boundary: ordinary Eris traces only. Remaining drop classes stay named out to the
[Gamma System programme](https://github.com/odogono/mercenary/issues/313) rather than reopening
[#312](https://github.com/odogono/mercenary/issues/312) or inventing a Spaceport-only drop rule.

Application code is no longer blocked on [#344](https://github.com/odogono/mercenary/issues/344):
that ticket shipped on `main` as 0.20.0 ([PR 348](https://github.com/odogono/mercenary/pull/348)).
#344 already owns the 3→4 bump (`Pose.body`, `presentationSha256`). #300 **joins schema 4 with
no further bump**. The 0.20.0 schema-4 snapshot (`elapsed`, `pose`, `structure` only) is not
restore-complete for this slice: a record that lacks the fields below is refused whole. There is
no migration and no defaulting.

It follows [ADR 0045](../adr/0045-author-scripts-as-named-typescript-steps.md): named TypeScript
steps, explicit serializable state, a Damocles-only Host Callout. Nothing here migrates Targ,
generalises the two Titles into one scripting framework, or touches
[`web/src/damocles/firstOffer.ts`](../../web/src/damocles/firstOffer.ts), which stays the isolated
prototype [#286](https://github.com/odogono/mercenary/issues/286) proved. It is also the production
decision ADR 0045's migration boundary deferred — script identity, revision and rejection policy —
made for Damocles alone.

## Evidence and scope

The [limo-key pickup research](../research/damocles-limo-key-pickup.md), together with the
selection and message-reveal research linked below, establishes the recovered transitions. The
key's identity, placement and world-to-local transform come from
[the Spaceport interior note](../research/damocles-spaceport-interior.md#resident-object-evidenced-inside-the-room).
Provenance is per value: **recovered** from the Working Authority, **derived** mechanically from
recovered values, or **authored** by this project (ADR 0043).

**Included.** The ordinary take of resident instance `object-slot-183` (`KEY- V.I.P. LIMO`) inside
Capital Spaceport region 1; its Object Residence, Carried Stack and panel effects; the one-shot
trigger that launches Damocles Script slot 2; that script's three inline messages, 200-frame wait,
clearing message and return to the idle jump; the drop and re-pick classes listed here; stored
`scrollCounter`; missing-group refusal presenting `system-string-9` after the response has parked;
and Damocles Save Snapshot and Session Resume across every one of those states.

Ordinary Eris traces in this delivery:

- Capital Spaceport region 1 take, drop and re-pick, during the response and after it parks
- Bound Spaceport exterior surface drop and re-pick (insertion group 0, `drawClass` 4→0)
- Surface leave-cell / return / re-pick with residence unchanged
- Interior drop, then the player exits the room: residence retained. A Save whose parent is
  **unbound** is valid. Interior return and re-pick is a **port** continuation of that persisted
  residence, not a claimed native return trace (the native interior-return route drifted)
- Spaceport native region 2 missing-group drop refusal after the response has parked
- Inventory-label `scrollCounter` in −16..16 gating take and drop (stored). Reachability is from
  [#315](https://github.com/odogono/mercenary/issues/315); limo-key spaced samples never caught
  the window

Other objects remain visible as before but gain no pickup interaction in this slice; that is an
explicit delivery boundary, not a recovered claim that they cannot be taken.

**Excluded, with the reason.**

| Excluded | Why |
| --- | --- |
| The object-selection rule behind `$7B46`/`$7B42` | **Recovered** by [#303](https://github.com/odogono/mercenary/issues/303) and no longer excluded: `Selection` is the nearest drawn instance, in range below 1/128 of a surface-grid unit. See [the selection note](../research/damocles-object-selection.md). |
| The busy-path trigger arbitration (queue on bit 5, discard otherwise) and the sticky bit 6 variant | Derived from instructions, never reproduced, and unreachable here: trigger 2 disarms on its first fire, so no second dispatch can find the host busy. |
| The refusal message at system-string index `$02`, and Trading Post `$04E158` sale/buyback | `$02` remains excluded by the key's handling bits. `$04E158` is a purchase/balance check selected by the offered object. Dropping the key in structure slot 82 native region 9 can enter sale/buyback; native sale remains unobserved. That path, its messages and persistence belong to #313/#319, not this slice. |
| System strings 11 and 12, and interruption of a live slot-2 response by a drop refusal | Unobserved on the include-list routes. The doorway refusal presenting `system-string-9` was after the response had parked; this slice does not define interruption of slot 2. |
| The full-Carried-Stack path at capacity 10 | The capacity is recovered and enforced; what the original does when it is reached is not, and this slice has one takeable object, so it cannot be reached. |
| `$7AA8` = `$78` | VOID (body-table index 30), outside Eris-only play. |
| No-structure cells and intentional-empty unbound structures as drop destinations | Native path recovered; no ordinary Eris drop trace in this slice. |
| Other interiors, levels, unmatched regions, and passages | Source census only, or unobserved on ordinary Eris routes. |
| Support placement and unsupported/falling refusal | Recovered later on Vesta / general objects (#315/#331), not as Eris limo-key traces. Owned by #313/#319. |
| Full Eris association-group extraction | #300 extracts **Capital Spaceport** groups only, including implicit `(group,0)` and duplicate pairs. |
| The other five entries of the `$0543EC` trigger table (slots 181, 151, 95, 101, 94) | Source facts only; their scripts are untested and their objects unreachable in this slice. The table carries one bound entry and the rest take the no-match path. |
| The reveal model — how a message's text arrives on the row, and how `$0523B8` divides between arrival and reading hold | **Recovered** by [#307](https://github.com/odogono/mercenary/issues/307) and no longer excluded: `$052402` scrolls a 48-cell row left by eight pixels a frame for 36 frames, then holds it for the remaining 164. See [the reveal note](../research/damocles-message-reveal.md). |
| Early completion of a presenting message by a key | **Answered** by [#307](https://github.com/odogono/mercenary/issues/307): there is none. Nothing outside the display routine's own completion ever lowers `$7BA0`, so no input shortens, skips or cancels a message. Targ's `SKIP_MESSAGE_CODE` has no Damocles equivalent. |
| The mission the messages describe, boarding, driving, the other objects' responses | Past the stopping boundary. |

**Stopping boundary.** The interaction ends when the script's final step pops the idle jump
`$0703FC` back off the return stack and execution parks. That is the recovered stable completion
point and the state every pre-take and post-response sample held.

**What the evidence does not establish.** Frame-exact input timing; the interpreter's instruction
dispatch rate between gates;
audible output, since the laboratory ran with sound off. [The drop research](../research/damocles-limo-key-drops.md)
now explains insertion group 12 → 1, including the implicit own-region insertion and the
additional regions each group exposes. The later selection research explains the handling bits
and the fixed carried-object coordinate column; neither requires retaining native array encoding
in the port. Where a rule is needed anyway it is marked authored below
and is stated as a convention, never as a recovered fact.

## Prerequisites

The original pickup, selection, string, timing, reveal and #312 drop-research prerequisites that
this include-list consumes are resolved. #312 stays closed; uncovered ledger rows are exclusions
owned by #313/#319, not permission to invent placement or to pretend every Eris cell is in
scope.

Carried here: Object Residence for resident instances; the Damocles Carried Stack and its panel
label; `scrollCounter`; frame-counted message presentation and the panel message line; the
Damocles Script Host with named steps, a return stack, a one-shot trigger table and a frame wait;
and the schema-4 fields those additions require, joined onto #344's identity and Pose.

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
  [publication policy](../publication-policy.md). The `MessageId` values below are the ids
  that payload names — slot 2's three inlines, system-string 50, and system-string 9.
  Records are stored with their padding intact, and
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

The following TypeScript shapes specify the script and display contract. `Residence` records
the surface/structure distinction and insertion-group semantics recovered by #312. Execution is
a persistent value (ADR 0023): every transition returns a new state and leaves its input
unchanged. No generator, promise, timer or closure carries execution state.

```ts
type InstanceId = string; // a Damocles Catalogue Instance id, e.g. 'object-slot-183'

/// Positions use the session's source-coordinate units, not Catalogue surface-grid fractions.
type Position = { readonly x: number; readonly y: number; readonly z: number };
type Residence =
  | { readonly kind: 'carried'; readonly drawClass: number }
  | {
      readonly kind: 'surface';
      readonly body: string; // Catalogue Body id; body-11 in this delivery
      readonly drawClass: number; // recovered placement class, not inferred from kind
      readonly position: Position; // body/world frame
    }
  | {
      readonly kind: 'structure';
      readonly body: string;
      readonly drawClass: number;
      readonly parent: InstanceId; // stable structure instance, even while unbound
      readonly level: number; // recovered association selector; not an invented floor
      readonly insertionGroup: number; // expands to ordered region/insertion pairs
      readonly position: Position; // parent's local frame
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
  | 'system-string-50' // $0704BE, operand $0032
  | 'system-string-9'; // missing-group drop refusal, payload id already extracted

/// The message row as the recovered display routine keeps it (#307): a 288-pixel window, 48
/// six-pixel cells wide, that a record's characters enter from the right at eight pixels a frame
/// for 36 frames and that is then held untouched for the rest of the duration.
type Reveal = {
  /// Pixels of this block's character stream already inside the row. Advances by 8 a frame and
  /// becomes a held row on reaching 288. Stored scrolling values are multiples of 8 below 288.
  readonly pixels: number;
  /// Offset into the effective message stream: 0 for every message in this slice.
  /// Inline streams start at record byte 0; system-string-50 starts at record byte 1.
  /// Multi-block messages belong to the follow-on contract, not this slice.
  readonly offset: number;
  /// The 48 characters the row showed when this block began, which the message scrolls over.
  /// Spaces for a row that was blank.
  readonly beneath: string;
};

/// The message gate $7BA0 as state: non-null is raised, null is lowered.
type Presenting = {
  readonly id: MessageId;
  readonly remainingFrames: number;
} | null;

/// The persistent Damocles Display, independent of whether a message blocks execution.
type DamoclesDisplay =
  | { readonly kind: 'held'; readonly cells: string } // exactly 48 printable-ASCII cells
  | { readonly kind: 'scrolling'; readonly id: MessageId; readonly reveal: Reveal };

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
  readonly display: DamoclesDisplay;
  readonly triggers: readonly Trigger[];
};

type Effect = { readonly type: 'sound-request'; readonly cue: 'take' | 'drop' };
type ScriptTransition = { readonly state: ScriptState; readonly effects: readonly Effect[] };

declare function initialScriptState(): ScriptState;
/// One display frame: advance the counter, age a presenting message, then run to the next block.
declare function runFrame(state: ScriptState): ScriptTransition;
/// The object-to-script dispatch at $054770, entered from the take path.
declare function fireTrigger(state: ScriptState, index: number): ScriptTransition;
```

`Selection` chooses the nearest drawn candidate under the recovered rule, including candidates
that cannot be taken. Do not filter to takeable objects before choosing the nearest: that would
allow reaching past a nearer non-takeable object. Apply the recovered handling check and this
slice's explicit slot-183 interaction boundary after selection. Selecting any other object causes
no pickup in #300; the broader programme owns its refusal or successful interaction.

The Damocles Host Callout is exactly `ScriptState` plus `Effect`. A Damocles Script may read and
write the counter, the message gate, the Damocles Display, the busy flag, the trigger table and its
own execution position, and may ask the host for a sound request. It reaches nothing else: pose, residence, the
Carried Stack and the world are the session's, and the script in this slice never touches them.
Native addresses stay in provenance, not in the interface. This is not Targ's Host Callout and
Targ's key consumption, message scheduling and Benson Display semantics are not Damocles semantics.

### Session State additions

`DamoclesSnapshot` gains `carried: readonly InstanceId[]` (replacing today's always-empty string
list), `message: Presenting`, `display: DamoclesDisplay`, `residence` for every tracked resident
instance, `scrollCounter`, and `selection`. The full `ScriptState` is not exposed: the snapshot
projects only presentation-facing values from it. The panel reads the Carried Stack **head's**
**model** source label — `KEY- V.I.P. LIMO`, not the instance name — and its message line
reads `display` through the extracted payload strings, never inferring a blank row from a null
message gate. `message` reports the active gate; it does not own the visible row. With one
object, head and sole entry coincide; later rotation in #319 is head-significant.

The initial display is 48 held spaces. Starting a message captures the held cells as
`reveal.beneath`, sets `pixels` and effective-stream `offset` to zero, and starts a scrolling display.
Each frame advances eight pixels. At 288 pixels (36 frames), replace the scrolling display with
the message's effective 48-cell row, padding shorter records on the right with spaces. The gate
continues counting down independently. Lowering it leaves the held row untouched. Thus message 3
remains visible throughout the wait; the clearing message scrolls over it and leaves 48 spaces.
There is no duplicate full row stored beside the scroll representation. Slot 2 alone does not
interrupt a scroll. A parked missing-group refusal presents `system-string-9` through the same
workspace. Interruption of a live slot-2 response is out of this slice.

Drawing and selection follow residence rather than ownership by the current Structure Workspace.
A `carried` key is absent from world candidates. The placement `drawClass` survives pickup: the
observed surface drop changes it from 4 to 0, and re-pick retains 0. Direct placement copies the
current placement class. Support placement is out of this slice. Do not reset `drawClass` from
the authored Catalogue record or derive it solely from the Residence discriminant.

A `surface` key enters the recovered surface resident list for its Body; its recorded cell is derived from position and is not an extra
visibility filter. A `structure` key is considered only when its parent and level match the
bound workspace. Source region selectors and `insertionGroup` are **one-based**; the existing
`BoundStructureSnapshot.regionIndex` is zero-based. Compare against `regionIndex + 1`; a null
index has no selected region and must never become source region zero. Expand its insertion group into the **implicit `(group, 0)` pair followed by
the source table's explicit pairs**, select pairs naming the viewer's current region, and insert
at their recovered queue keys. Zero is the plan-queue terminator insertion point. A group can
expose the key in multiple regions and can contain multiple insertions for one region; preserve
that order for drawing and selection without creating duplicate residence or inventory entries.

The Catalogue currently carries associations for existing residents; #300 needs the complete
association groups for **Capital Spaceport**, including group 1 (no initial resident uses it) and
the implicit own-region pair. Do not infer a missing group's contents from region geometry, and
do not extract every Eris parent's groups in this slice. The [drop research](../research/damocles-limo-key-drops.md)
records why the initial Spaceport group 12 and dropped group 1 both expose the key in region 1
but at different queue positions.

Leaving a cell, changing the bound structure or moving between visible regions never reparents,
deletes or resets a residence. The renderer reconstructs candidate queues from the current view
and persistent residence without replaying effects. A Save can validly name a parent different
from the player's bound structure.

## Actions, scheduling and ordering

The session is the scheduler. There is no browser timer inside the script, and no action runs a
step implicitly.

**Frames.** The session keeps a fractional frame accumulator. Each `advance` sub-step adds
`seconds * vblHertz` to it and calls `runFrame` once per whole frame it yields, keeping the
remainder. The accumulator is saved, so an interrupted run and an uninterrupted one that receive
the same time steps produce the same frames at the same points.

**Per-frame order inside `runFrame`.**

1. `counter = (counter + 1) % 65536`.
2. If a message is presenting, advance a scrolling `display` by one frame and decrement
   `remainingFrames`; at zero, clear `message` — the gate falls, but the held display remains.
3. Execute steps until the script blocks or parks. Only two things block: a raised gate, and
   `poll-wait` below its threshold. The step table is acyclic apart from `poll-wait`, so this
   terminates without a step budget.

Steps 2 and 3 in the same frame means a message that ends this frame lets the next step run this
frame. The later [reveal research](../research/damocles-message-reveal.md) observes this same-frame
resumption when the gate falls. The run-to-block instruction dispatch policy remains an authored
execution convention; the interpreter's instruction rate between gates is not established.

**Semantic Actions.** `take()` and `drop()` are one-shot Semantic Actions, each applied whole
between frames, never inside one. The browser Control Profile binds them to `KeyT` and `KeyD`, the
codes it already routes. The original chord is Right Shift with the Up arrow, which the browser
holds for walking; the mapping is a Control Profile decision and no part of Game Semantics.

### The take

Refused, silently and with no state change or effect, when the selection is absent, when
`inRange` is false, while the inventory-label scroll is busy, or when the Carried Stack is at
its recovered capacity of 10. The handler at
`$0541F0` refuses in exactly that silence — no message, no sound — and the probe reproduced it from
ordinary walk routes that stopped slightly short. The capacity path is unreachable here.

On success, one atomic commit performs, in the recovered order:

| # | Effect | Provenance |
| --- | --- | --- |
| 1 | Push the instance onto the Carried Stack as its new head; the count becomes its length | carried list `$61CE`, count `$61CC` |
| 2 | Start the inventory-label scroll toward the model's source label | panel writer `$04DCE4` |
| 3 | Residence becomes `carried` | association byte `$6FAA` + slot x 4 bit 7 set, association long `$73A8` + slot x 4 rewritten |
| 4 | Trigger dispatch for the instance's entry in the table, if it has one | `$0543BE` → `$0543D2` → `$054770` |
| 5 | One `sound-request` effect when its guard permits | guarded request at `$054848` |

All five lie in the recovered success path `$054264`–`$0542D0` and are listed in its order. The
drawn set follows from step 3 — the render-queue rebuild at `$05A30E` — and is not a separate
write. The native association encoding is not mutable port state: the payload carries recovered
handling facts, and the Gameplay Session owns Object Residence and the Carried Stack.

**Trigger dispatch.** A disarmed entry returns having done nothing. An armed entry with the host
already busy is excluded above. Otherwise: set `busy`, disarm the entry, push the current step
(`idle`) onto the return stack, set the step to the bound script's first step, and — as the
original's dispatch commits the new PC to a running interpreter — run to the next block exactly as
`runFrame` does. The take therefore commits with the first message already presenting, which is
what the probe sampled 1.4 s after the take. The entry does not re-arm — not on drop, not on
re-pick, not ever within a Gameplay Session.

### The drop

The [drop research](../research/damocles-limo-key-drops.md) supersedes the earlier claim that a
drop has no sound effect. Direct placement calls the same guarded sound helper as take. When its
guard permits, emit a `sound-request` for `drop`; this is a request, not a claim about audible
output. It does not dispatch the object's pickup trigger.

Direct placement uses player X/Z and player Y minus 63 source units. An ordinary interior
chooses the insertion group numbered by the current source region (`regionIndex + 1`), refusing if
that group is absent from the parent's source association table. An exterior placement uses group
zero and surface residence. An ordinary Spaceport doorway-region-2 trace observes this refusal
**after** the response has parked: carried count stays one and `system-string-9` presents.
Execution stays null; `busy` stays false. Exterior flag bit 14 bypasses this lookup even for an
attachment region; an attachment gate alone does not decide drop refusal. Other missing-group
locations, passages, and unmatched interiors are out of this slice.

The observed Spaceport region-1 drop has group 1 and Y=0; the observed exterior drop has surface
association on Eris and Y=0. Coordinates must be converted into the Residence variant's declared
frame exactly once.

A nearby selected object would enter support placement. That branch, its rank/height refusals,
and unsupported/falling contact refusal are out of this slice. On the observed level walking
routes, ground contact is present; do not invent a falling-drop outcome.

Take and drop both refuse silently while `scrollCounter` is nonzero. Take writes −16; a
sole-object drop writes +16; the VBL steps the counter toward zero by one character per display
frame. Store the counter; a restore that lands at zero would permit a drop the live session
refuses.

Trading Post sale bookkeeping and system strings 11 and 12 are out of this slice. A refused
missing-group drop on the include-list does **not** mutate balance. Do not implement every
refused drop as an unchanged display: region 2 presents `system-string-9` through the ordinary
reveal. Do not present that refusal while slot 2 is still executing; that interruption is
unobserved.

For the observed ordinary successful cases, pop the Carried Stack **head**, start the panel-label
update, clear carried status, run the recovered carry-state updates, request the guarded sound,
write residence, then rebuild applicable drawing/candidate queues. Preserve this ordering as one
port commit; native intermediate writes are not separate port commits. The pending pickup
response continues and trigger 2 stays disarmed.

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

Because both `runFrame` and `fireTrigger` run to the next block, slot-2 execution is only ever
observed at a commit boundary in one of six states: parked, or blocked at `announce-2`,
`announce-3`, `call-delay`, `poll-wait` or `clear-busy`. A seventh commit-boundary is parked
execution with `system-string-9` presenting after a missing-group refusal. That invariant is
what makes the save table below closed.

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

[#344](https://github.com/odogono/mercenary/issues/344) takes the Damocles Save Snapshot 3 → 4
bump: the Pose names its Body, and identity pins every presentation document as
`presentationSha256`. ADR 0044 requires a deliberate bump when new Session State is admitted;
#300 **joins schema 4 without a further bump** by adding the fields below. There is no
migration: a schema-3 record, a Targ envelope, a Catalogue or presentation identity mismatch, or
a schema-4 record that lacks these fields — including a 0.20.0 / #344 record of only `elapsed`,
`pose` and `structure` — is refused and the live session is untouched. Session Resume that
cannot restore is removed and reported; player Saves are left as unreadable records.

[#344](https://github.com/odogono/mercenary/issues/344) already reached the default branch. The
interview's "ship as one stacked shape" gate is therefore closed as Q4-A: those in-the-wild
schema-4 records are disposable. [#319](https://github.com/odogono/mercenary/issues/319)
adds briefcase store, pending, extra trigger bits and `displayDuration` as **schema 5** once this
slice has shipped; those fields are not optional on schema 4.

```ts
interface DamoclesSaveSnapshot {
  readonly carried: readonly InstanceId[];
  readonly elapsed: number;
  readonly frameAccumulator: number; // [0, 1)
  readonly pose: Pose; // #344: names its Body
  /// Only instances whose residence differs from the Catalogue's placement.
  readonly residence: readonly { readonly instance: InstanceId; readonly residence: Residence }[];
  /// $04DDD0. Gates take and drop while nonzero. Integer in -16..16.
  readonly scrollCounter: number;
  readonly script: {
    readonly counter: number;
    readonly execution: Execution | null;
    readonly message: Presenting;
    readonly display: DamoclesDisplay;
    readonly triggers: readonly { readonly index: number; readonly armed: boolean }[];
  };
  readonly structure: BoundStructureSnapshot | null;
}
```

The save omits `busy`: in this bounded script it is reconstructed as `execution !== null`.
The validation table describes the reconstructed runtime flag, not an additional serialized field.
Parked `system-string-9` is `execution === null` and `busy` false. The codec used by explicit
Saves is also the Session Resume codec; neither stores transient effects. Identity remains
#344's `DamoclesSaveIdentity`; this slice does not restore `erisSchemaVersion`.

### Location-transition trace requirements

These are **authored port persistence requirements**, not observations of an original-game
Save facility. The existing emulator state-save observation establishes continuation of the
pickup response only; a Hatari whole-machine restore does not validate either browser codec.
Native coverage beyond this include-list remains in
[the drop research](../research/damocles-limo-key-drops.md); that note is not the implementation
boundary.

For every **included** allowed placement class, run the following trace twice: once while the
initial response is pending (including a scrolling message and the wait), and once after it has
parked. Capture **immediately before and after every row's transition**, round-trip each capture
through an explicit Save and independently through Session Resume, then feed the restored and
uninterrupted sessions the same remaining actions and elapsed-time increments.

Do not run this table against Trading Post, support placement, passages, no-structure cells, or
other interiors.

| Transition | Required comparison after restore and continued play |
| --- | --- |
| Drop the carried key | Identical allowed/refused decision, complete residence, Carried Stack and panel; identical ordered effects; trigger remains disarmed. A region-2 missing-group refusal after park presents `system-string-9` and leaves the stack unchanged. Elapsed frames advance only when supplied. |
| Cross a visibility/region boundary | Residence remains at the drop location; the recovered insertion/visibility rule determines drawing and selection from the new viewer location. Crossing a boundary never reparents the key. |
| Leave the structure and then its cell | The residence departure remains saved even when its parent is no longer bound. Binding another structure must not reset or delete it. |
| Return to the cell and structure | Binding reconstructs the view from the persisted residence plus Catalogue facts. The original Catalogue placement must not appear as a duplicate. Interior return/re-pick is this port continuation, not a native-trace claim. |
| Approach the dropped key | Compare candidate membership, selected instance and the strict range gate, including an out-of-range refusal and a nearer competing candidate. Being near the coordinates alone does not establish visibility. |
| Re-pick | The same selection and recovered take gates give the same result. On success the key is carried once, one take sound request is emitted when its guard permits, and the one-shot response is not restarted. |

At each comparison include pose, bound Structure Workspace and attachments, all tracked
residences, Carried Stack order, `scrollCounter`, panel label, drawn candidate identities/order,
selection, trigger state, execution and return stack, counter, message gate, display and
fractional frame accumulator. Compare each subsequent ordered effect array; restoring itself
emits none. Pending execution continues independently of leaving, returning, dropping and
re-picking.

The unbound-parent case must use a Save whose player is in a **different cell** from the dropped
key. Validate the saved parent against the immutable Catalogue, not the current
`BoundStructureSnapshot`; only the player's workspace is required to match the player's cell.
Repeat with a surface residence from the include-list. Do not invent drop rules for empty or
unresolved structure cells in this slice.

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

- Every `instance` names a Catalogue instance the session tracks, with no duplicate residence
  departures. `drawClass` is an integer byte whose supported values and ordering come from
  recovered placement data, including the observed 4 → 0 → carried-0 transition. Coordinates are
  finite in the stated coordinate frame. `surface` names Eris's
  Catalogue Body and has no fabricated parent, region or insertion group. `structure` names an
  existing structure instance on that Body and a level and nonzero insertion group admitted by
  that parent's recovered association data. Validate against the Catalogue independently of the
  current workspace; an unbound parent is valid. No rule equates insertion group to the viewer's
  region, and no validation requires the dropped key to be currently drawn. Association-group
  admission in this slice is Capital Spaceport's recovered groups only. Support-placement
  validators belong to #319.
- `carried` has no duplicates, has at most 10 entries, and contains exactly the instances whose
  residence is `carried`.
- `scrollCounter` is an integer in −16..16.
- `counter` is an integer in 0–65535. `frameAccumulator` is a number in [0, 1).
- `message`, when present, names a known `MessageId` with an integer `remainingFrames` in
  1–`messageFrames`. `display` is validated independently and against the gate and execution.
  Before frame 36 it must be `scrolling` with the same message id and the matching pixel count;
  from frame 36 onward it must be `held` with that message's effective 48-cell row.
- `triggers` lists each modelled entry once. An armed entry requires its object to be at its
  Catalogue placement and absent from the Carried Stack. A non-null `execution` requires the
  launching entry to be disarmed.
- `execution`, when present, is one of the five reachable slot-2 commit-boundary states:

| `step` | `busy` | `message` | `returnStack` | `counter` |
| --- | --- | --- | --- | --- |
| `announce-2` | true | `script2-inline-1` | `['idle']` | any |
| `announce-3` | true | `script2-inline-2` | `['idle']` | any |
| `call-delay` | true | `script2-inline-3` | `['idle']` | any |
| `poll-wait` | true | null | `['idle', 'return-from-delay']` | < `waitFrames` |
| `clear-busy` | true | `system-string-50` | `['idle']` | any |

  A `Reveal` is refused unless `pixels` is a multiple of 8 in `0..280` and equal to
  `8 * (messageFrames - remainingFrames)` while scrolling (strictly below 288), `offset` is zero,
  and `beneath` is the expected predecessor's 48 printable-ASCII cells: spaces before message 1,
  message 1 before message 2, message 2 before message 3, and message 3 before the clear.
  A held display always contains exactly 48 printable-ASCII cells. `poll-wait` requires the held
  message-3 row even though `message` is null. A null `execution` with `message` null requires
  `busy` false and a held blank row, both before pickup and after a completed slot-2 response.
  A null `execution` with `message` `system-string-9` requires `busy` false, a held or scrolling
  display consistent with that gate, and trigger 2 disarmed (the refusal is only in this slice
  after the response has parked). `beneath` for string 9 is the parked blank row. Any other step —
  `announce-1`,
  `reset-wait`, `return-from-delay`, `clear-line`, `return` — cannot survive a commit boundary and
  is refused.

## Worked traces

Sound-count examples below use a permitting sound guard. Also test the same transitions with
the guard refusing: state outcomes are unchanged and no sound request is emitted.

**First pickup.** Standing in region 1 with the key selected and in range, `take()`: the Carried
Stack becomes `['object-slot-183']`, the panel reads `KEY- V.I.P. LIMO`, residence becomes
`carried`, the key leaves the drawn set, trigger 2 disarms, `busy` rises, the return stack holds
`['idle']`, `announce-1` runs and leaves message 1 presenting with 200 frames to go and the step
blocked at `announce-2`, one sound request is emitted, and the Session Resume checkpoints. Frames
200, 400 and 600 hand over to messages 2, 3 and then the wait, whose counter resets at frame 600.
Frame 800 releases `poll-wait` and `clear-line` presents the clearing message; frame 1000 clears
`busy`, pops `idle` and parks. Total 1000 frames after the take.

**Repeat.** `take()` again without a drop — mid-response or after it — cannot select the carried
key. Any other selected object is outside this delivery's interaction boundary. A disarmed trigger
also returns without dispatching another response. The Carried Stack stays at one entry, nothing
re-presents, and no second response runs.

**Drop and re-pick after completion, in the evidenced region.** `drop()` returns the key to
`structure` residence with Spaceport insertion group 1, player X/Z and ground Y=0, empties the
Carried Stack, starts scrolling the inventory label to blank, and requests guarded drop sound.
After the inventory scroll finishes, `take()` picks it up again: stack, panel, residence and
candidate queues change, and guarded take sound is requested. Trigger 2 remains disarmed and
execution stays parked. Repeat during the initial response: that execution continues without
restarting, as the new mid-response trace observes.

**Save before pickup.** The record has an empty Carried Stack, no residence departures, trigger 2
armed, null execution, null message and a held blank display. Restoring it and then taking the key produces the same
ordered frames and effects as an uninterrupted run from the same point.

**Save during a message, after it has arrived.** Saved at frame 300, the record holds step
`announce-3`, message `script2-inline-2` with 100 remaining frames, `busy` true, return stack
`['idle']`, the key carried, trigger 2 disarmed. Its `display` is `held` with message 2's effective
48-cell row: arrival finished at frame 236. Restoring re-presents message 2 on the same row with
100 frames left and emits no
message request. Frame 100 after the restore hands over to message 3 exactly as the uninterrupted
run does at frame 400.

**Save during a message, while it is still arriving.** Saved at frame 210, ten frames into message
2, the gate has 190 remaining frames and `display` is `scrolling`, naming message 2 with
`pixels` 80, `offset` 0 and `beneath` equal to message 1's effective 48-cell row. Restoring puts the row
back 80 pixels into the scroll — thirteen and a third characters in, not thirteen — and the
remaining 26 arrival frames run as they would have. A record whose `pixels` disagrees with
`8 × (messageFrames − remainingFrames)` is refused.

**Save mid-wait.** Saved with step `poll-wait` and `counter` at 137, the restored session blocks
for 63 more frames while its saved held display continues to show message 3, and then starts
the clearing scroll over those same cells. A record with `poll-wait` and `counter` at 240 is refused:
it could not have survived a commit boundary.

**Save after completion.** Null execution, null message, `busy` false, trigger 2 disarmed, the key
carried, display held at 48 spaces. The restored session parks, takes nothing further, and
starts no new message. The same record restores under a later script revision, because it names
no execution.

**Missing-group refusal after park.** Standing in Spaceport native region 2 with the key carried
and slot 2 parked, `drop()` leaves the Carried Stack at one entry, emits no drop sound (the
placement did not commit), presents `system-string-9` for `messageFrames`, and leaves execution
null. Save during that presentation round-trips the gate and display independently of slot 2.
A drop that would refuse while slot 2 is still presenting is out of this slice.

**Refused restores.** A schema-3 record, a Targ record, a Catalogue or presentation identity
mismatch, a schema-4 record missing `scrollCounter` or `script`, an armed trigger 2 alongside a
carried key, a `carried` entry with surface/structure residence, a `remainingFrames` of 0 or 201,
an unknown script id, and a stale revision beside a live execution
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
- **Repeat, drop and re-pick.** Repeat take without a drop emits nothing. Every successful re-pick
  emits one take sound request when the sound guard permits; successful drops also request sound. No second
  response or duplicated message runs, and the trigger stays disarmed. Test both pending and
  completed responses; dropping must not cancel or restart execution. Include the region-2
  missing-group refusal after park (`system-string-9`) and silent refusal while `scrollCounter`
  is nonzero.
- **Location continuity.** Cover the include-list surface/interior cases only. Leave the drop
  cell/structure, save/restore, return and re-pick. Assert the same residence, selection,
  visibility and effects, including when the saved parent is unbound. Interior return is the
  port continuation.
- **Persistent display.** Check scroll frames 0, 1, 35 and 36, all message handovers, the whole wait,
  the clearing scroll, the parked blank row, and parked `system-string-9`. Round-trip each
  representation through both Save and Session Resume. Refuse a blank mid-wait row, wrong
  predecessor, nonzero effective offset or a scrolling/held representation inconsistent with the
  active gate.
- **Save round-trip.** Round-trip each of the five reachable slot-2 commit-boundary states plus
  parked, pre-pickup, and parked-plus-string-9 through JSON, taking presenting messages both at a
  scrolling row — inside the 36 arrival frames — and a held row after it has arrived. Include the
  clearing message too. Apply the same remaining frame and action sequence to the restored and
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

Do not reopen [#312](https://github.com/odogono/mercenary/issues/312). `take` / `drop` in
[`web/src/damocles/boot.ts`](../../web/src/damocles/boot.ts) stay no-ops until this
implementation. #344 has shipped; start from its identity and Pose.

1. ~~Object selection and takeability recovered~~ — [#303](https://github.com/odogono/mercenary/issues/303), delivered as
   [the selection note](../research/damocles-object-selection.md) and the `handling` record in
   `payload/damocles/catalogue.json`.
2. ~~The message reveal model recovered~~ — [#307](https://github.com/odogono/mercenary/issues/307),
   delivered: the row is 48 cells, the reveal is 8 pixels a frame for 36 frames, the remaining 164
   frames are reading hold, and no input ends a message early. `Reveal` above is the recovered shape.
3. ~~The message strings extracted into `payload/damocles/`~~ — [#304](https://github.com/odogono/mercenary/issues/304), delivered as
   `payload/damocles/strings.json` (including `system-string-9`).
4. `web/damocles/eris.json` schema 6 with its `time` block.
5. Capital Spaceport association groups in the payload, including group 1, implicit `(group,0)`
   and duplicate pairs. Do not extract every Eris parent in this slice.
6. Resident instances placed in the world: `erisSurfaceFrom` currently skips every instance whose
   `location` is null, which is every structure-anchored resident including slot 183. Placement
   comes from `placement.parent`, `placement.position` and the recovered world-to-local transform;
   residence becomes mutable session state.
7. The Damocles Script Host: `ScriptState`, `runFrame`, `fireTrigger`, the trigger table and the
   named steps of slot 2, as new modules beside — not inside — `firstOffer.ts`.
8. Carried Stack (head-significant), `scrollCounter`, persistent Damocles Display, message gate
   and the panel's inventory/message lines.
9. `take()` and `drop()` on `DamoclesSession`, wired from `boot.ts`'s currently no-op `reach` and
   `drop` Control Profile actions, limited to the include-list.
10. Schema-4 fields in `web/src/damocles/save.ts` with the validation table above, on top of
    #344's identity and Pose, with no second bump.
