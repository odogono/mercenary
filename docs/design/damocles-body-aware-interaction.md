# Damocles body-aware interaction: pickup, display and persistence contract

Design for [#318](https://github.com/odogono/mercenary/issues/318), bounding the findings
recovered by [#314](https://github.com/odogono/mercenary/issues/314)–[#317](https://github.com/odogono/mercenary/issues/317),
[#324](https://github.com/odogono/mercenary/issues/324)–[#327](https://github.com/odogono/mercenary/issues/327)
and [#331](https://github.com/odogono/mercenary/issues/331). Implementation belongs to
[#319](https://github.com/odogono/mercenary/issues/319) and its four child deliveries; browser
verification to [#320](https://github.com/odogono/mercenary/issues/320). This document adds no
application implementation.

It extends [the limo-key interaction contract](damocles-limo-key-interaction.md) rather than
replacing it. That contract's Host Callout, script identity and revision policy, commit
boundaries and validation discipline are carried forward unchanged; what changes here is that
Object Residence becomes body-aware, one Gameplay Session spans Bodies, and the Damocles Display
and Damocles Script state grow to hold the five further pickup responses.

It follows [ADR 0046](../adr/0046-switch-damocles-bodies-within-one-gameplay-session.md) for the
authored body switch, [ADR 0028](../adr/0028-admit-one-development-console-that-writes-play.md)
for the console that carries it, [ADR 0045](../adr/0045-author-scripts-as-named-typescript-steps.md)
for script authoring, and [ADR 0026](../adr/0026-store-explicit-save-snapshots-as-bounded-json.md)
and [ADR 0044](../adr/0044-admit-damocles-saves-as-a-title-scoped-snapshot.md) for persistence.
Nothing here admits vehicle travel, a player-facing body chooser, later mission progression, Targ
changes or a shared scripting framework, and nothing here changes the sessionless Flyover of
[ADR 0042](../adr/0042-fly-a-system-without-play.md) or the isolated first-offer prototype.

## Evidence and scope

Provenance is per value, as in the limo-key contract: **recovered** from the Working Authority,
**derived** mechanically from recovered values, or **authored** by this project (ADR 0043).

**Included.** Ordinary take and drop of any resident instance with a recovered placement on a Body
with an admitted arrival Pose; capacity, the refusal taxonomy and the special carried items; the
five further pickup-triggered responses and their busy arbitration; the Damocles Display state
those responses require; body-aware Object Residence and one continuous Gameplay Session across
Bodies; an authored development-console body switch at admitted arrival Poses; and the Damocles
Save Snapshot, Session Resume codec, content identity and rejection policy that carry all of it.

**Excluded, with the reason.**

| Excluded | Why |
| --- | --- |
| Vehicle travel, boarding and flight | Out of scope for [#313](https://github.com/odogono/mercenary/issues/313). The launch, throttle and arrival gates are recovered by #326 and belong to that ticket's successor, not to this contract. |
| A player-facing Body chooser | ADR 0046 admits an authored development action only. |
| Bodies with no admitted arrival Pose | Not excluded by decision but by coverage: see [Admitted Bodies and Poses](#admitted-bodies-and-poses). They become admitted when a Pose gains a recovered workspace origin, with no change to this document. |
| Later mission progression beyond each response's parked stopping point | #313's boundary. Each response ends at the idle jump `$0703FC`; what a mission does afterwards is separate work. |
| Trading Post sale and buy-back | Reachable and partly recovered, but its state, messages and persistence remain an evidence prerequisite carried from the limo-key contract. A drop that would enter it is out of this contract's admitted behaviour. |
| Whether a carried craft can be dropped, boarded or flown | An ANTIGRAV makes every craft takeable, and what happens next is unrecovered. This contract admits the take and refuses to describe the sequel. |
| The `$055190` restore path | The original's own persistence format for the Carried Stack. Unrecovered, and deliberately not a blocker here: see [Our codec is authored](#our-codec-is-authored). |

## Evidence coverage

Every rule this contract admits is implemented. Each is tagged by how it was established, and the
tag decides who asserts it. **Observed** rules are asserted by #320's browser verification against
a reproduced trace. **Derived** rules are recovered instruction-by-instruction, have no reachable
route on which they have ever fired, and are asserted by deterministic unit tests against the
recovered branch only.

This table is the contract's, not the payload's. A research delivery that reaches one of these
rules amends this table in the same change set; it does not flip a flag in game data.

| Rule | Tag | Evidence |
| --- | --- | --- |
| Take refusal order and which refusals are silent | observed | [capacity](../research/damocles-carry-capacity.md#the-take-handlers-refusal-order) |
| Capacity is one equality against 10, or 20 with the BRIEFCASE carried | observed | [capacity](../research/damocles-carry-capacity.md#capacity-has-one-comparison-and-it-is-an-equality) |
| Acceptance of a take above capacity | observed, unreachable | as above; reproduced by driving the count directly |
| BRIEFCASE expansion, overflow store, contraction and round trip | observed | [capacity](../research/damocles-carry-capacity.md) |
| Either ANTIGRAV overrides the bit-5 refusal; neither overrides bit 4 | observed | [capacity](../research/damocles-carry-capacity.md#what-the-two-antigravs-do-and-what-they-do-not) |
| Carried Stack order, head-first storage, both rotations | observed | [drops](../research/damocles-object-drops.md#the-carried-stack-rotates-and-rotation-re-indexes-the-carried-staging) |
| The inventory-label scroll counter gates both handlers | observed | [drops](../research/damocles-object-drops.md#the-inventory-label-scroll-window-refuses-a-drop-and-it-is-reachable) |
| Support placement and its full field inheritance | observed | [drops](../research/damocles-object-drops.md#an-accepted-support-placement-with-the-field-inheritance-and-its-control) |
| Direct placement at player X/Z and Y − 63 | observed | [drops](../research/damocles-object-drops.md#direct-placement-and-the-gate-before-it) |
| The support-rank refusal | observed | [drops](../research/damocles-object-drops.md#the-support-rank-refusal) |
| The support range is a three-dimensional exponent | observed | [drops](../research/damocles-object-drops.md#the-exponent-the-support-gate-reads-is-three-dimensional) |
| Carried staging is the stack index and `300 × index` | observed | [drops](../research/damocles-object-drops.md#the-carried-stack-rotates-and-rotation-re-indexes-the-carried-staging) |
| Residence is body-scoped; carrying parks an object in VOID | observed | [drops](../research/damocles-object-drops.md#residence-is-body-scoped-and-carrying-parks-an-object-in-void) |
| `$7AC5` and `$7AA5` are one quantity at non-zero levels | observed | [drops](../research/damocles-object-drops.md#7ac5-against-7aa5-is-decided-one-quantity) |
| The level selector is a floor index; the alias record's first word is the storey pitch | observed | [structure groups](../research/damocles-dion-vesta-structure-groups.md) |
| All five further trigger mappings and each response's steps | observed | [pickup responses](../research/damocles-pickup-responses.md#the-five-mappings-exercised) |
| Busy arbitration: queue on bit 5, discard otherwise, replace unconditionally | observed | [pickup responses](../research/damocles-pickup-responses.md#busy-arbitration) |
| A queued response nests one level inside the script it interrupted | observed | [pickup responses](../research/damocles-pickup-responses.md#busy-arbitration) |
| The display duration excursion to `$0032` and back | observed | [pickup responses](../research/damocles-pickup-responses.md#where-each-response-stops) |
| A response that parks without clearing the row | observed | trigger 6, as above |
| Message reveal: 288-pixel window, 8 pixels a frame for 36 frames, then held | observed | [message reveal](../research/damocles-message-reveal.md#the-reveal) |
| **The model-form refusal** | derived | Every reached support is `DAMOCLES FILE`, whose model the handler accepts. |
| **The height refusal** | derived | The only supports above the player's eye — `PROCESSORS DESK` at Y 317, `TABLE` at Y 634 against a player Y of 63 — are inside Vesta Parliament, which no route enters. |
| **The requirement-zero refusal** | derived | Only four takeable residents require rank 0 and none can be dropped from any replayable Pose. |
| **The `$7046` support-rank bypass** | derived | Needs `DOOR KEY` slot 39 carried. `$7046` read `$05` in every run, so the bypass never fired. |
| **The slot-0 ground-contact bypass** | derived | Recorded instruction with no recovered purpose. |
| **What the fullness gauge draws above twenty segments** | derived | The over-capacity take is reproduced; the drawing that follows is not. |

Two consequences of implementing the derived rules anyway, both deliberate.

The height and model-form gates sit **after** the rank comparison, and omitting them would not
leave a hole — it would silently **admit drops the original refuses**. That is the same failure
shape #331 recorded for measuring the support range in the plan alone, where an object at the
player's feet reads exponent 5 rather than 0. A contract that declines to implement an unobserved
refusal is not being conservative; it is choosing the more permissive of two behaviours without
evidence for either.

The two bypasses are implemented as recovered and are unreachable in admitted play, because both
require an object no route reaches. They exist in the port so that the day a route reaches them
the behaviour is already the original's, and they carry a test that pins the branch rather than a
claim about what it is for.

## Admitted Bodies and Poses

A **Pose** is admitted if and only if `payload/damocles/arrival-poses.json` publishes it with a
non-null `workspaceOrigin`. A **Body** is switchable if and only if it has at least one admitted
Pose.

The discriminator is the workspace origin, not the cell. Every published Pose carries a cell,
because the cell is read from the engine word `$7B5C` and always exists; what varies is whether
that cell is anchored to the Body surface. A Pose whose `workspaceOrigin` is null says so in
`evidence.cell` — "the body has no recovered 16x16 workspace origin, so the cell is not yet
anchored to the body surface" — and without that anchor the Pose's cell cannot be related to any
resident placement on the Body, which is precisely what a take requires.

**`impliedWorkspaceOrigin` does not qualify a Pose.** Eleven Bodies carry one, derived from the
camera longwords of a single standing position. It is a navigation lead, not a recovered anchor:
#325's group-offset traversal exists because the anchor has to come from the workspace tables.
Admitting an implied origin would place objects against a guess and record the result as Object
Residence. Converting implied to recovered is [#172](https://github.com/odogono/mercenary/issues/172)'s
work, per Body.

This is a payload fact, not a document fact. Recounted at the time of writing:

| | Poses | Bodies |
| --- | ---: | ---: |
| `workspaceOrigin` recovered — admitted | 7 | 4 |
| `workspaceOrigin` null, `impliedWorkspaceOrigin` present | 12 | 11 |
| No Pose at all | — | 15 |

The four admitted Bodies are ERIS (`eris-spaceport-onfoot`, `eris-transporter-11-8`), DION
(`dion-2-3`, `dion-transporter`), GAEA (`gaea-ur-city-4-2`; `gaea-transporter` is unanchored) and
VESTA (`vesta-parliament-4-6`, `vesta-transporter`). Coverage beyond them is owned by
[#326](https://github.com/odogono/mercenary/issues/326), whose remaining work is an approach
controller that converges on a chosen Body, and by #172 for the workspace origins. The
[guide-backed location checklist](../research/damocles-guide-location-checklist.md) prioritises the
eight unposed Bodies that carry residents; its settlement names and coordinates are secondary-source
leads to verify, not recovered data.

When a Pose gains a recovered origin, or a new anchored Pose is published, this contract admits it
with no amendment and the acceptance matrix regenerates. As the
[coverage ledger](../research/damocles-gamma-system-location-ledger.md#delivery-slices) puts it,
arrival coverage gates each delivery's admitted Bodies rather than this design as a whole:
evidence-complete deliveries proceed while #326 remains open for other Bodies.

No Body is ever recorded here as unlandable. Absence of a Pose, or of an anchor, is an unresolved
gap.

### Addressing a Pose

The console switch names a **Pose id**. A bare Body name is accepted as shorthand only when that
Body has exactly one admitted Pose.

Three of the four admitted Bodies carry two anchored Poses, so a Body alone is ambiguous today and
would become silently ambiguous tomorrow for any Body that gains a second. A default would make
`switch vesta` mean a different standing position the day a third Pose lands, without any change
the reader could see. GAEA is the case that settles it: `switch gaea` resolves to
`gaea-ur-city-4-2` because it is that Body's only admitted Pose, while `switch gaea-transporter`
is declined with the unanchored reason — which is only expressible if Poses are addressable
individually.

## Values and interface

`Residence` keeps the shape the limo-key contract established. Two things change: `body` is now
load-bearing on every arm rather than always Eris, and a `structure` residence is validated
against its parent's storey pitch.

```ts
type InstanceId = string; // a Damocles Catalogue Instance id, e.g. 'object-slot-183'
type BodyId = string;     // a Damocles Catalogue Body id, e.g. 'body-11'

type Position = { readonly x: number; readonly y: number; readonly z: number };

type Residence =
  | { readonly kind: 'carried'; readonly drawClass: number }
  | {
      readonly kind: 'surface';
      readonly body: BodyId;
      readonly drawClass: number;
      readonly position: Position; // body/world frame
    }
  | {
      readonly kind: 'structure';
      readonly body: BodyId;
      readonly drawClass: number;
      readonly parent: InstanceId;    // stable structure instance, even while unbound
      readonly level: number;         // floor index; written from $7AC5 by a drop
      readonly insertionGroup: number;
      readonly position: Position;    // parent's local frame
    };

/// Body-agnostic. Replaces ErisPose, which named one Body for no reason beyond delivery order.
type Pose = {
  readonly body: BodyId;
  readonly heading: number;
  readonly position: Vector3;
};
```

### Why the structure arm carries no group or cell

#325 established that a scene is keyed by `(body, structure-group, cell, level, insertion-group)`,
and that the override word's low nine bits are a structure slot while its high-byte bits are a
scene selector — so two cells can select one base structure as two distinct scenes, which Dion
cells `$E9` and `$41` both do against base structure 182.

The group and the cell are therefore properties of the **parent**, and the Catalogue already
publishes each scene as its own instance identity: `vesta-surface-64`, `dion-surface-de`. Naming
them again on the residence would be a denormalisation that can disagree with the Catalogue after
any research delivery, and the residence has no way to win that disagreement.

`level` stays inline because it is not derivable from the parent: a drop writes it from `$7AC5`,
which #326's captures settled as the same quantity the association builder matches on at `$7AA5`.

### The storey-pitch invariant

#325 found that the level selector is a floor index and the alias record's first word is the
structure's storey pitch, and that

```
0 <= position.y - level * storeyHeight < storeyHeight
```

holds for all 39 Dion and Vesta interior residents with no exceptions — 317 for Vesta Parliament,
200/150/160 for the Dion structures. Residual elevations are object-shaped: 48 for `SCROLL` resting
on `TABLE`, 38 for `AUTHORS COMPUTER` on `AUTHORS DESK`.

This contract makes it a **restore-time validation rule**, not merely a recorded finding. A
`structure` residence whose Y fails the inequality against its parent's alias record is refused,
which catches a save that reproduces a level and a position that cannot both be true.

### Damocles Script state

The limo-key contract's `ScriptState` grows by the six additions
[#317 measured](../research/damocles-pickup-responses.md#minimum-host-callout-requirements). Five
are additive fields; the sixth changes the shape of `Execution`, and this contract takes that
change now rather than shipping a save format that provably cannot represent an observed state.

```ts
type ScriptId =
  | 'damocles.script.slot-2'   // KEY- V.I.P. LIMO, trigger 2
  | 'damocles.script.slot-181'
  | 'damocles.script.slot-151'
  | 'damocles.script.slot-95'
  | 'damocles.script.slot-101'
  | 'damocles.script.slot-94';

/// The observed nesting needs (script, step) pairs: a queued response resumes an outer script
/// that had not returned. A stack of one script's own steps cannot represent it.
type Frame = { readonly script: ScriptId; readonly step: Step };

type Execution = {
  readonly script: ScriptId;
  readonly revision: number;
  readonly step: Step;
  readonly returnStack: readonly Frame[];
};

type Trigger = {
  readonly index: number;
  readonly script: ScriptId | null;
  readonly armed: boolean;    // bit 7
  readonly queueable: boolean; // bit 5
  readonly sticky: boolean;    // bit 6
};

type ScriptState = {
  readonly busy: boolean;
  readonly counter: number;
  readonly execution: Execution | null;
  readonly message: Presenting;
  readonly display: DamoclesDisplay;
  /// $7A88. One word: a second queueable trigger replaces the first rather than joining a queue.
  readonly pending: number | null;
  /// $070102. Not a per-message constant: one indexed record presents for 50 frames in one
  /// response and 200 in another.
  readonly displayDuration: number;
  readonly triggers: readonly Trigger[];
};
```

The Host Callout boundary is unchanged. `Effect` remains exactly the sound request: #317 confirmed
that none of the five further responses reaches pose, residence, the Carried Stack, the world or
any record, so no new effect kind is admitted.

### Arbitration rules, stated

Entered at `$054770`, past the busy test and the `$7A88` clear:

- An already-fired trigger is **refused before the busy test**. Its arming byte is `$00`, so the
  `bpl` at `$054776` returns before anything else is read.
- While busy, a trigger with bit 5 set is **queued**: `pending` is written unconditionally, and the
  trigger is **not** disarmed. A second queueable trigger **replaces** the first.
- While busy, a trigger with bit 5 clear is **discarded** and **stays armed** for a later pickup.
- A queued response is taken up **as soon as the busy flag clears**, which is before the running
  script returns. It nests one frame inside the interrupted script, whose own return then runs.

Among the six pickup triggers only slot 181's is queueable, so two pickups can never contend
through the table alone; one queueable pickup and any other queueable trigger can.

Nothing in the recovered program **re-arms** a trigger. `$7CB4` is referenced by exactly one
instruction in the whole native program area. Armed values are what the loaded image supplies, so
a port that re-arms on any event is inventing behaviour.

## Take, drop and the special items

The recovered rules are carried from the research unchanged. What this contract adds is the
statement of what is stored and what is recomputed, and the eligibility rule.

**Take** follows the refusal order at `$0541F0`: selection distance exponent ≤ 8; a selection
exists and is not slot 0; body selector ≠ `$78`; scroll counter zero; the slot-0 bypass; handling
bit 4 clear; the ANTIGRAV bypass; handling bit 5 clear, refusing with system string `$02`; count ≠
capacity; and the Trading Post check, which this contract excludes. A take shifts the stack up and
stores the new slot at **index 0**.

**Drop** removes index 0 — the object the panel is currently naming — and the player chooses it by
rotating. It refuses silently on an empty stack and while the scroll counter is nonzero. The
support branch is **forced, not opt-in**: the rank comparison demands bits 2–3 of the dropped
object against bits 0–1 of the selection, scaled by four, refusing with system string `$09`. An
accepted support placement inherits the support's X and Z, its Association B in full, and
Association A bytes 1 and 3, and leaves the dropped object's handling byte alone. With no eligible
selection inside the support range the drop writes the player's X and Z and Y minus 63.

**Capacity** is 20 if and only if the BRIEFCASE is on the Carried Stack and 10 otherwise, and the
comparison is an equality rather than a bound, so a count above capacity accepts another take.
That state is unreachable in admitted play and is implemented as the original has it, because a
port writing `count >= capacity` and a port writing `count != capacity` differ only there.

**The ANTIGRAV override** follows the live handling bit, not stack membership: either one is
sufficient, both together add nothing, and removing both restores the refusal at once.

### Eligibility

An object is takeable if and only if it has a recovered parent and local placement on a Body with
an admitted Pose, and its handling byte admits a take.

This needs no new gate. An object with no recovered placement is never drawn; the recovered
selection rule returns the nearest **drawn** instance; so the take handler never sees it.
Eligibility falls out of the existing chain. The contract states it so that a reader does not add
a redundant check whose failure mode would be to diverge from selection.

The consequence today: of 241 resident instances, 28 have a recovered placement. Thirteen Dion and
Vesta residents do not — ten in groups `$1B`/`$1C`, which no pinned capture binds, and three whose
derived local position falls outside the parent extent. None of the thirteen is takeable, and each
becomes takeable when its placement is published, with no change to this document.

## The body switch

An authored Shell Console action, per ADR 0046 and ADR 0028. It is a development tool, not play:
it reaches what no player action can, and it is never part of a trace.

**It names a Pose**, with a bare Body name accepted only where that Body has exactly one admitted
Pose. See [Addressing a Pose](#addressing-a-pose).

**One commit.** The switch is a one-shot Semantic Action. Before it nothing happened; after it the
current Body, the Pose, the bound Structure Workspace and elapsed time have all moved together.
There is no transit, no duration and no animation, because none is recovered and none is play.

**Validate, then commit.** The console validates its own input and declines with the reason,
leaving the live Gameplay Session exactly as it was — the same discipline ADR 0028 already
establishes for a cell off the world or a Room the payload lacks, and the same shape as a refused
save restore. Declined: an unknown Body or Pose id, a bare Body name with more than one admitted
Pose, a Pose whose `workspaceOrigin` is null, and content the payload cannot produce. A half-switched session is not a state the contract admits.

**Lazy residence.** The session materialises Object Residence for a Body when it first binds it,
and stores only **departures** from the Catalogue's placement. A Body never visited therefore has
no session state to load, correct or corrupt, and the question of what a switch to an unloaded Body
does to residence does not arise: the Catalogue is the authority for every object nobody has moved.

**Checkpointing** needs no new rule. [The Session Resume spec](../session-resume.md) already
checkpoints immediately after every successful one-shot Semantic Action, so classifying the switch
as one is the whole decision.

**What the switch does not touch.** It does not store a workspace binding — it sets Body and Pose,
and binding is recomputed from the Pose exactly as walking does. It does not touch the Carried
Stack, and does not need to: carried objects hold body byte `$78` (VOID) in the recovered model, so
they are body-independent by the original's own rule rather than by our convention. It does not
cancel, restart or advance a suspended Damocles Script, and it does not clear the Damocles Display.

**A Body change is not a new Title or Destination.** The Title-scoped ownership and isolation of
ADRs 0041 and 0044 remain in force across a switch.

## The Session Snapshot

The Session Snapshot carries residence for the **current Body only**, together with the Carried
Stack, the panel label, the Damocles Display, the selection and the current Body id.

Every renderer draws the bound Body, so residence elsewhere is unreachable from the view by
construction. Handing renderers thirty Bodies' residence would invite exactly what the Session
Snapshot exists to prevent — a renderer reading the session's parts and deciding for itself what is
visible. Within a Body, the limo-key contract's rule already gives the right answer: drawing and
selection follow residence, not ownership by the bound Structure Workspace.

The current Body id is presentation-facing in its own right: the panel names the Body, as #326's
flights observed reading `VESTA`.

## Persistence

### Schema 4

The Damocles Save Snapshot goes 3 → 4 **once**. Schema 4 is the union of the limo-key contract's
additions and this contract's. Two bumps were rejected: neither contract had shipped, so a schema
4 that existed only between two pull requests would be a version no save was ever written against.
ADR 0044 asks for a deliberate bump, not a bump per contributing ticket.

**#344 takes the bump, not #300.** This originally read that #300 delivers its subset first. That
follows from the delivery order, and the order changed: #344 precedes #300 so that schema 4 is not
first written with one Body's name in its identity. Since #344 changes the record's shape — the
Pose names its Body, and `erisSchemaVersion` becomes `presentationSha256` — leaving the number at
3 would have given two different shapes one version. #300 joins schema 4 without a further bump.

The Body is **not** a peer field of the Pose in the snapshot. The Pose names its own Body, so a
separate `body` would be a second copy that validation would have to keep in agreement for no
gain.

```ts
interface DamoclesSaveSnapshot {
  readonly carried: readonly InstanceId[];
  /// $61CA and the entries at stack indices 10 upward. A peer of the stack, not a function of it.
  readonly briefcaseStore: readonly InstanceId[];
  readonly elapsed: number;
  readonly frameAccumulator: number; // [0, 1)
  readonly pose: Pose;
  /// Only instances whose residence differs from the Catalogue's placement, on any Body.
  readonly residence: readonly { readonly instance: InstanceId; readonly residence: Residence }[];
  /// $04DDD0. Gates both handlers while nonzero.
  readonly scrollCounter: number;
  readonly script: {
    readonly counter: number;
    readonly display: DamoclesDisplay;
    readonly displayDuration: number;
    readonly execution: Execution | null;
    readonly message: Presenting;
    readonly pending: number | null;
    readonly triggers: readonly {
      readonly index: number;
      readonly armed: boolean;
      readonly queueable: boolean;
      readonly sticky: boolean;
    }[];
  };
  readonly structure: BoundStructureSnapshot | null;
}
```

### Stored, and recomputed

The evidence is unusually firm, and it mostly says recompute.

| Quantity | Disposition | Why |
| --- | --- | --- |
| Capacity | recomputed | 20 iff the BRIEFCASE is carried. The original's own restore path writes neither `$7A04` nor `$61CA`; a stored capacity can disagree with the stored stack, a recomputed one cannot. |
| Carried staging — Association B level byte and Y | recomputed | The level byte **is** the stack index and Y **is** `300 × index`. Both are rewritten by every rotation and every drop, so a save that persists them independently disagrees with the stack after the first rotation. |
| Draw membership and the draw queue | recomputed | Rebuilt from residence at every region change. A restore that reproduces residence reproduces the queue without storing it. |
| ANTIGRAV override, DOOR KEY A bypass, hazard warning, gauge target | recomputed | Each is a function of what is carried at the moment it is read. Save the residence; derive the consequence. |
| `busy` | recomputed | `execution !== null`, as the limo-key contract already has it. |
| Carried Stack order | **stored** | Ordered, head-significant, and rotation is a player action that changes it. Save the order, not a set. |
| Briefcase overflow store | **stored** | It is not a function of the stack; it is a peer of it, living beyond the count at indices 10 upward. A restore must not compact it into the stack. |
| Inventory-label scroll counter | **stored** | See below. |
| Handling bit 7 per object | **stored** | Every override in both handlers reads the live bit, never the array. |

**The scroll counter is stored rather than landed at zero.** The research offered either. Zero is
wrong: a restore that lands at zero permits a drop that the live session refuses at that instant,
which makes a save round trip observably change behaviour — the one thing this contract exists to
prevent. It is stored, and validation bounds it to the recovered ±16 range so it can never restore
into a permanently-refusing session.

**Handling bit 7 is stored rather than derived from `carried`.** Deriving it would be right in
every reachable state and wrong in the one the original can express: the probe's
`antigrav-listed-not-carried` case shows the handlers following the flag while the array disagrees.
Validation still requires the two to agree, so the stored pair is checked rather than trusted.

### Content identity

`DamoclesSaveIdentity` replaces `erisSchemaVersion` with one payload-wide Damocles presentation
identity.

```ts
interface DamoclesSaveIdentity {
  readonly catalogueProgramSha256: string;
  readonly destination: 'damocles';
  readonly presentationSha256: string; // every Damocles presentation document, together
  readonly title: 'damocles';
}
```

A set of per-Body schema versions was rejected: it would make identity vary by which Bodies the
player has visited, so two saves of the same game would refuse each other's compatibility rule.
Accreting a field per Body up to thirty was rejected as the same problem spread thinner. One value
that changes whenever any Damocles presentation document changes is exactly ADR 0026's promise:
exact restoration or refusal, never a partial match.

### Rejection policy

Unchanged in discipline from ADR 0026 and the limo-key contract, and restated because this
contract widens what can be wrong.

Validation is atomic: the whole record is checked before anything is replaced, and a refusal
returns a readable reason and leaves the live Gameplay Session exactly as it was. No coercion, no
partial restore, no best-effort migration. A schema-3 record, a Targ envelope, or a Catalogue or
presentation identity mismatch is refused whole.

Saves and Session Resume use **one codec**. An incompatible Session Resume is removed and reported
as `COULD NOT RESUME — <reason>`; player Saves and preferences are untouched.

Additional rules this contract adds:

- `body` names a Body the Catalogue knows and for which an admitted Pose exists.
- Every residence names a Catalogue instance the session tracks, with no duplicate entries, on a
  Body the Catalogue knows.
- A `structure` residence names an existing structure instance on its own Body, a level and a
  nonzero insertion group admitted by that parent's recovered association data, and a Y satisfying
  the storey-pitch inequality against the parent's alias record. Validate against the Catalogue
  independently of the current workspace: an unbound parent, and a parent on another Body, are both
  valid.
- `carried` has no duplicates, contains exactly the instances whose residence is `carried`, and
  agrees with the stored handling bit 7 of every instance.
- `briefcaseStore` is empty unless the BRIEFCASE's residence is not `carried`, has no duplicates,
  and shares no instance with `carried`.
- `scrollCounter` is an integer in `-16..16`.
- `pending`, when non-null, is a trigger index the table models.
- `execution`, when present, names a known `ScriptId` at the current revision and a `returnStack`
  of frames whose scripts are all known. A suspended execution is revision-bound; a parked session
  is not. Trigger armed state survives revisions.
- An armed trigger requires its object to be at its Catalogue placement and absent from the
  Carried Stack.

### Our codec is authored

The original's own persistence format for the Carried Stack is **unrecovered**. The restore path at
`$055190` rebuilds a stack from a 64-entry identifier namespace, assigns fresh resident slots from
`$10` upward, restores a six-byte BCD balance, and self-modifies two handling-byte operands; its
caller was never found and identifiers 27 and 40 are unresolved.

That is a blocker on any claim of fidelity to the original's save facility, and it is **not** a
blocker on this contract. ADR 0026 already makes our Save Snapshot an authored bounded-JSON record
of our Gameplay Session, not a reproduction of a native format. This is stated so that a later
reader does not mistake `$055190` for an open gate on this work — and equally, so that nobody
claims the port reproduces the original's saves.

## Acceptance matrix

The per-Body/object acceptance matrix is **generated from the payload**, not enumerated here. A row
exists for each pair of a resident instance with a recovered placement and a Body with an admitted
Pose, and carries the take outcome, the drop outcomes for each reachable support class, and the
trigger response if any.

It is a test fixture produced from `payload/damocles/catalogue.json` and
`payload/damocles/arrival-poses.json`. Generating it means a research delivery that publishes a
placement or a Pose grows the matrix without anyone editing this document, and that a placement
that is later withdrawn shrinks it rather than leaving a stale row asserting behaviour for an
object nothing can reach.

Hand-enumerating 241 rows was rejected: it goes stale on the next research pull request.

## Delivery

Four bounded deliveries under [#319](https://github.com/odogono/mercenary/issues/319), in order.
The seam is by subsystem, because each delivery is independently testable and each unblocks the
next. Splitting by Body would repeat the same code four times and gate delivery on #326; splitting
by acceptance point would cut across files so that every delivery touched `save.ts`.

| # | Delivery | Prerequisites | Tests |
| ---: | --- | --- | --- |
| 1 | **Body-agnostic Pose and identity.** `ErisPose` → `Pose` with `body`; `erisSchemaVersion` → `presentationSha256`; the schema 3 → 4 bump. Touches `world.ts`, `mover.ts`, `selection.ts`, `frame.ts`, `session.ts`, `save.ts`, `title.ts`, `boot.ts` and the shared `TitleRuntime` loader, which now yields each document's text so identity can pin the bytes served. | none | Existing save and resume suites pass unchanged; a schema-3 record and a Pose naming no Body are each refused with their reason; an edit to a presentation document that bumps no declared version still changes `presentationSha256`. |
| 2 | **Body-aware residence, take and drop.** Residence on every Body, lazy materialisation, departures-only storage, the refusal taxonomy, capacity, the special items, the acceptance matrix generator. | 1 | The generated matrix; the storey-pitch invariant; each refusal in the taxonomy, tagged observed or derived per the coverage table. |
| 3 | **Display and the five further responses.** `pending`, the two trigger bits, `(script, step)` frames, `displayDuration`, the held row that outlives its script, and the five scripts' steps and messages. | 2 | Busy arbitration's four outcomes as consecutive atomic actions; the nesting trace; the duration excursion; a response parking without clearing the row. |
| 4 | **Persistence and the body switch.** Schema 4 complete, the rejection rules, the console action and its atomicity. | 3 | The trace table below; every rejection rule refusing atomically; a declined switch leaving the session byte-identical. |

[#320](https://github.com/odogono/mercenary/issues/320) remains the single browser-verification
ticket and asserts only the **observed** rows of the coverage table.

## Test plan

The limo-key contract's location-transition trace table is carried forward **body-parameterised**
and run over **Eris and Vesta**. Vesta is the only Body with observed live drops at non-zero levels
— #326's captures stand inside structures at levels 1, 4, 9 and 10 — so it is the only one that
exercises the storey-pitch validation and the `$7AC5` level byte at all. Dion and Gaea would re-run
identical code paths at level 0 and are covered by the generated matrix rather than by traces.

One trace the limo-key table does not have, and the reason this contract exists:

> Drop an object on Vesta; switch to Eris; take an object there; explicit Save; restore; switch
> back to Vesta. The Vesta object is where it was left, with its full residence, `drawClass` and
> level; the Eris object is still carried; the Carried Stack order and head are unchanged; and no
> Damocles Script was restarted or cancelled by either switch.

At each comparison include Pose, current Body, bound Structure Workspace and attachments, all
tracked residences on every Body, Carried Stack order, briefcase store, panel label, drawn candidate
identities and order, selection, trigger state including both new bits, pending index, execution and
return stack, counter, message gate, display, display duration, scroll counter and fractional frame
accumulator.

Each capture is round-tripped through an explicit Save **and** independently through Session
Resume, and the restored and uninterrupted sessions are then fed the same remaining actions and
elapsed-time increments.

## Open gaps

Named so that they are not mistaken for decisions this contract made.

- **Fifteen Bodies have no arrival Pose at all, and eleven more have Poses that are not anchored**
  to a recovered workspace origin (#326 for the captures, #172 for the origins). Departure and
  flight are recovered and a craft has flown Vesta → Eris and back; the remaining capture work is
  an approach controller that converges on a chosen Body.
- **No reached support has ever refused.** The model-form and height gates are implemented as
  recovered and asserted by unit tests only.
- **Thirteen Dion and Vesta residents have no published placement**, and ten of them have no named
  workspace identity because no pinned capture binds Dion groups `$1B`/`$1C` — the same disposition
  #324 records for Gaea group `$0F`.
- **The `$055190` restore path**, and with it the original's own Carried Stack persistence format.
- **What the fullness gauge draws above twenty segments.**
- **Whether a carried craft can be dropped, boarded or flown**, and what becomes of its paired
  vehicle key while it is carried.
- **Trading Post sale and buy-back** state, messages and persistence.
- **Bit 6 of the handling byte**, which nothing in the census sets and nothing in the handlers
  reads, and **the sticky trigger at index `$38`**, whose purpose is unrecovered.

None of these is resolved by an implementation default. Each blocks the behaviour that would need
it, and no authored placeholder is proposed for any of them.
