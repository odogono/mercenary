# Mercenary III TOURCRAFT: source eligibility and reference selection

> **Status** (2026-10-03): Research contract for [R8a/#735](https://github.com/odogono/mercenary/issues/735); no migration codec or runtime change.
> **Holds:** Decoder validity is weaker than natural-source reachability. The pinned writers determine clock/frame/phase invariants and exclude the inclusive remainder endpoint. A finite reachability relation and complete ordering below define eligibility and canonical reference selection for every supported history family, rather than a checkpoint allowlist.
> **Open:** Exhaustive execution of that relation; a practical complete solver; proof of source sufficiency for every retained early owner; and the owner construction in #737. Finite comparisons do not establish universal completeness.
> **Evidence:** Historical revision `e4cba434069ca1fbec6e72b3a99cbf775f1663c4`, archived and hash-checked by [taxi-source.ts](../../research/mercenary-iii-st/scripts/taxi-source.ts); the existing early/canonical ledgers; the additional R8a comparison results recorded below.

This note separates three questions: whether a source could have been written by the known I2 implementation, whether all such histories have the same expanded meaning, and which history an ambiguous late source selects. [ADR 0068](../adr/0068-reconcile-known-taxi-saves-with-expanded-campaign-history.md) already permits canonical expanded history for ambiguous late sources. It does not authorize discarding unrelated state, fixed cash/flags, campaign work deferred until Load, a boarding deadline, or blanket taxi-Save refusal. [D2's compatibility contract](mercenary-iii-tourcraft-milestone-review.md#r8-compatibility-failure-returned-for-review)

## Pinned source and admission layers

The allowlisted tuple is schema **1**, Title **`dion`**, opening Destination **`metis`**, program SHA-256 **`4e8b74122910bcaa109b944eebb6f0ec18fdeb1175c34eea3c932d0e1b18b62c`**, and complete served-content SHA-256 **`c50b402c04c70ab74f95a938c0f867e740ea843157e514764f2bceb84a2f44ed`**. Execute the archived historical reader with its historical content; current code retaining schema 1 does not identify this implementation. Expanded comparison content remains separately pinned to `d31490d7ba44a08949f71267884f1e290074acc5885fdfae747f7aeefcfdf611`. [Pinned loader](../../research/mercenary-iii-st/scripts/taxi-source.ts), [identity audit](mercenary-iii-tourcraft-taxi-migration.md#exact-allowlisted-source-identity)

For encoded input `R`, apply these gates in order:

1. Parse and check the Title before interpreting a schema. Require the complete allowlisted identity and historical envelope types. Preserve the original encoded bytes throughout the operation.
2. Apply the pinned `decodeDionRecord(..., historicalIdentity, historicalContent)` and its nested reader. This supplies its numeric/reference checks, not reachability. For multiple defects the archived decoder's first failure takes precedence.
3. Compare the complete raw JSON with the reader's projection after successful decoding. Every object must have exactly the fields its historical writer emits; tuple lengths must match. Reject extra fields at their actual raw path rather than silently discarding them. Object member order is irrelevant; array order and every serialized numeric value are significant. Save description and timestamps remain validated metadata and never select a history.
4. Apply the writer-derived checks below. They give useful early diagnostics but are necessary conditions, not a complete natural-source predicate.
5. Require a complete source witness under the reachability relation below. A plausible taxi pose, a matching unsigned wait, a familiar checkpoint name, or a successful decoder round trip does not replace this gate.

The historical decoder constructs new identity/state objects, so extras are lost after decoding. Its availability reader verifies numeric/reference validity without uniqueness. Its remainder check is inclusive. Therefore running only that decoder cannot establish the stronger gates. [Pinned save reader](https://github.com/odogono/mercenary/blob/e4cba434069ca1fbec6e72b3a99cbf775f1663c4/web/src/dion/save.ts), [pinned nested reader](https://github.com/odogono/mercenary/blob/e4cba434069ca1fbec6e72b3a99cbf775f1663c4/web/src/dion/restore.ts)

For an otherwise decoder-valid raw extra property, report its path and `extra property projected away by the archived reader`. For known fields failing independent relations, report the field and relation. A remaining complete-replay mismatch reports `snapshot: no supported historical execution produces the complete source`, optionally with the first field differing from a candidate. Refusal returns no replacement record and performs no storage/session mutation. This is an admission contract; the candidate construction and commit mechanics remain [I4's transaction requirement](mercenary-iii-tourcraft-persistence.md#source-admission-storage-and-replacement-transaction).

## Cross-field checks owned by historical writers

Let `T = snapshot.tick`, `F = floor(T / 11)`, and use exact integer arithmetic for products before taking a modulus. The coherent old opening has clock accumulator 672, seconds/day zero, step 32, refill 1600, frame counter 1, METIS phase 39648, and rate 944. [Pinned opening data](https://github.com/odogono/mercenary/blob/e4cba434069ca1fbec6e72b3a99cbf775f1663c4/payload/dion/world.json), [pinned constructor/tick/frame writers](https://github.com/odogono/mercenary/blob/e4cba434069ca1fbec6e72b3a99cbf775f1663c4/web/src/dion/session.ts)

```text
Q(T) = 0                                      when T < 21
       1 + floor((T - 21) / 50)                otherwise
clock.accumulator = 672 - 32*T + 1600*Q(T)
clock.seconds     = Q(T) mod 86400
clock.day         = floor(Q(T) / 86400) mod 65536
frame             = F
frameCounter      = (1 + F) mod 65536
phase             = (39648 + 944*T) mod 2^32
```

These equations follow from subtracting 32 each tick and refilling at accumulator **at or below zero**. They are not `floor(T / 50)`: the first second is tick 21. In particular, a forged late clock with an early tick is refused even if all individual numbers are decoder-valid. Clock seconds alone cannot identify elapsed history after day rollover. `snapshot.day`, the daylight flag, is recomputed only at atomic frames; compare it with the pinned sky function at phase `(39648 + 944*(11*F)) mod 2^32`, not the saved partial-frame phase. [Pinned sky function](https://github.com/odogono/mercenary/blob/e4cba434069ca1fbec6e72b3a99cbf775f1663c4/web/src/dion/sky.ts)

| Source field | Necessary writer-derived relation |
| --- | --- |
| `remainder` | It is zero or a positive finite binary64 value `r` satisfying the **actual binary64 comparison** `r + 1e-12 < 1/50`. A fresh ordinary `advance` cannot return with a remainder that would immediately execute another tick. |
| `narrative.available` | Unique IDs in their original subsequence order. New Game consumes `$19` immediately, leaving an ordered subset of `[$33,$34]`; accepted starts remove, rather than append or reorder, an ID. |
| `cash`, `gauges`, `location`, `pitch`, `position` | Equal their historical coherent opening values: ordinary I2 writers do not change them. The saved `position` is the panel's retained pair, not a redundant low-word encoding of `eye`. |
| `narrative.timed`, `narrative.queued`, `narrative.cabin` | Null, null and zero respectively for supported naturally captured I2 sessions. Its admitted script instructions do not arm a timed/queued script, and the cabin selector is consumed by the same atomic frame before capture. |
| `cell`, `region`, `doors`, taxi route/height/counter, driver programme, sign, candidate | Require full historical transition consistency, rather than equating each one to a freshly rescanned cache. Boarding changes pose after the prior candidate's admission read; the constructor rescans the candidate. |
| VM/flags/stack/message pixels/serial/age/busy/hold, sound | Require the complete historical writer history. A PC or saturated message age is not a creation timestamp or cumulative face-selection count. |

The remainder rule deliberately refuses `r == 1/50`, despite the old reader accepting it. The saved value is `max(0, privateRemainder)`: a tiny negative private remainder becomes **zero**, not one extra tick. Keep that distinction when replaying and when entering schema 2's half-open interval. Do not advance or normalize a source at Load to make an endpoint appear valid. `advance(0)` and sub-tick calls can alter the private remainder; finite binary64 arithmetic and call grouping remain part of a matching witness. [Pinned advance/capture writers](https://github.com/odogono/mercenary/blob/e4cba434069ca1fbec6e72b3a99cbf775f1663c4/web/src/dion/session.ts), [proposed schema-2 interval](mercenary-iii-tourcraft-persistence.md#proposed-expanded-save-snapshot-schema-2)

The availability and inactive narrative claims come from the opening array, `start`'s removal, the admitted opcode switch and frame's driver consumer. Do not replace this source proof with the mere fact that a particular control had an empty queue. [Pinned narrative](https://github.com/odogono/mercenary/blob/e4cba434069ca1fbec6e72b3a99cbf775f1663c4/web/src/dion/script.ts), [pinned admitted scripts](https://github.com/odogono/mercenary/blob/e4cba434069ca1fbec6e72b3a99cbf775f1663c4/payload/dion/scripts.json)

## Total source-only reachability relation

Define supported histories over the actual frozen I2 transition interface, with no injected snapshots, clock/pose/VM assignments, TOURCRAFT boarding, Body transfer or foreign content:

- `press(a)` for `a` in `activate, star, plus, minus, board, leave`;
- set a supported Movement Intent with fields `look,pitch,running,strafe,turn,walk`, finite binary64 axes in `[-1,1]`, and boolean `running`;
- `advance(d)` with finite nonnegative binary64 seconds, preserving each call and its arithmetic;
- capture the current old record and restore that **genuine capture** through the historical reader/constructor, as ordinary Save/Load or Session Resume can do.

This deliberately covers both production calls of `1/60` from the old fixed-step Browser Shell and the retained research API recipes using `1/50`, `11/50`, `64/50`, and other ordinary elapsed calls. It does not redefine all natural input as a fixed keyboard alphabet, integer frames, or one taxi journey. The six old actions include calls, retries, no-start waiting, rejected Leave, multiple trips, returning to a former cell and arbitrary free waiting. [Pinned interface](https://github.com/odogono/mercenary/blob/e4cba434069ca1fbec6e72b3a99cbf775f1663c4/web/src/dion/session.ts), [production fixed-step bridge](https://github.com/odogono/mercenary/blob/e4cba434069ca1fbec6e72b3a99cbf775f1663c4/web/src/shell/clock.ts), [production control adaptation](https://github.com/odogono/mercenary/blob/e4cba434069ca1fbec6e72b3a99cbf775f1663c4/web/src/dion/controls.ts), [retained recipes](https://github.com/odogono/mercenary/blob/e4cba434069ca1fbec6e72b3a99cbf775f1663c4/web/test/dion-controls.ts)

For source `S` with tick `T`, form the following finite graph:

1. Begin with the pinned fresh session, including its immediately started `$19` routine and freshly selected candidate.
2. A node contains the complete private historical simulation state, **unclamped** private remainder and current intent. Omit only the append-only host sound-write queue, which has no simulation reader; keep serialized sound state. Distinguish node state from `captureResume()`, which clamps negative remainders and omits live intent.
3. Add each supported action, intent and elapsed transition. Discard transitions that exceed tick `T`; an elapsed-call evaluator may stop when it would perform tick `T+1`. Compute the full zero-tick closure, deduplicating identical nodes rather than limiting the number of key presses or sub-tick calls.
4. Add a self-capture/restore transition only using the node's genuine `captureResume()` and pinned reader/constructor; retain its candidate rescan and remainder clamping. Restore starts with idle intent. No fabricated decoder-valid state is an edge.
5. Accept terminal nodes at tick `T` whose **entire captured record** equals `S`: all nested values, array order, pixels, candidate, phase and remainder. Metadata does not participate.

The effective selected history of a Load of an earlier genuine capture is its saved prefix followed by the later continuation; discarded play after making that Save does not contribute to its reference. This reduces ordinary branching/reloading to the genuine-capture edge without adding arbitrary restored states or requiring monotone wall time. New Game simply supplies another fresh root. [Pinned restore constructor](https://github.com/odogono/mercenary/blob/e4cba434069ca1fbec6e72b3a99cbf775f1663c4/web/src/dion/session.ts), [Save/Resume readers](https://github.com/odogono/mercenary/blob/e4cba434069ca1fbec6e72b3a99cbf775f1663c4/web/src/dion/resume.ts)

The graph is finite for each decoder-valid finite `T`: binary64 inputs/private numeric states have finite representations; at most `floor(T/11)` VM/frame calls bound script stack and message serial; immutable content bounds strings, pixel arrays, available IDs and doors. Zero-tick input loops can therefore be saturated rather than searched to an arbitrary depth. This is a termination argument for a **definition**, not a claim that enumerating every floating-point intent and elapsed value is practical. An efficient symbolic/constraint solver may implement the same relation, but a timeout is an unresolved eligibility result, not evidence of unreachability.

Let `H(S)` contain **all finite operation words** ending in a matching terminal node, including paths around historical zero-tick cycles. Historical-node deduplication is valid for deciding reachability, but does not identify histories for expanded comparison. No expanded-state equivalence is inferred from identical old nodes. The total source predicate is:

```text
eligibleSource(R) = exactRawSchemaAndIdentity(R)
                && historicalDecoderValid(R)
                && writerCrossFields(R)
                && H(decodedState(R)) is nonempty
```

Every supported naturally written record has its own path as a witness. A forged record that passes the cheap checks still needs a full path. This defines the full admission domain; **the finite test matrix and necessary cross-field checker are not its implementation or a replacement allowlist**.

## Exact early domain

The first elapsed second reaching 32,400 is tick **1,619,971**. Threshold-before-input runs only at atomic frame tops; the first possible election reader is frame **147,271**, tick **1,619,981**. Thus ten partial-frame ticks with `clock.seconds == 32400` still precede the first admitted campaign reader. A later day with seconds below 32,400 is not pre-election. Derive the boundary from the pinned clock and cadence plus R6's threshold ordering, not a decoder's seconds field alone. [Clock writer above](#cross-field-checks-owned-by-historical-writers), [R6 scheduler recovery](mercenary-iii-tourcraft-campaign.md), [independent threshold model](../../research/mercenary-iii-st/scripts/taxi-history-model.ts)

For each matching witness `h`, let `E(h)` be expanded execution from New Game under the accepted initial alignment and cadence, applying the same ordered ordinary inputs. A `captureRestore` edge takes a genuine **complete expanded** capture and restores that capture through the eventual #736/#737 restore contract, including remainder clamping, idle live intent, candidate reconstruction and output rebuilding before first draw. It does not migrate the intermediate old record again or install its old cash/VM over campaign state. This defines the required reference operation; that expanded restore contract is still a dependency, so its semantics are not claimed implemented here. Histories without restore edges use uninterrupted expanded execution. Define `P(E)` to retain every future-affecting serialized owner and all first-frame/panel/event observables, identifying only state that #736 actually proves is rebuilt before **every** reader. Live Movement Intent is supplied equally when continuing; held controls are not saved owners and do not participate in source equality. If that proof supplies face output rebuilding, output words are compared after that rebuild; both base and alternate cursors stay in `P`.

The exact early predicate is:

```text
early(S) = eligibleSource(S) && T < 1619981
exactEarly(S) = early(S) && | { P(E(h)) : h in H(S) } | == 1
```

This states precisely when the source fixes its expanded history. It does not require a unique input path, a unique taxi departure, or equality of an owner proved derived before read. Conversely, same current flags/PC/message serial and age do not automatically establish the cardinality test. The known `$A5` pair has equal cursors and lost last face selection; its output difference is excluded only after the #736 proof, not because the next frame happens to converge. [Early collision](mercenary-iii-tourcraft-early-initialization.md#the-early-collision), [owner audit](mercenary-iii-tourcraft-early-owner-audit.md#finite-early-message-arithmetic), [#736 decision and acceptance](https://github.com/odogono/mercenary/issues/736)

If two matching early witnesses differ in retained cursors or another observable owner, report the concrete pair to D2. ADR 0068's late canonical permission does not settle an observable early ambiguity. No such stronger witness is claimed here, and no universal early singleton proof is claimed. In particular, historical zero-tick cycles must stay distinct for this comparison until #736/#737 proves their effect on every retained expanded owner and observable; finiteness of the old graph alone does not prove finiteness or singleton cardinality of the expanded class. The 33 controls retain their full exact requirements; they do not determine which other natural sources are exact. The complete `P` and construction/advancement of the owners belong to #736/#737, so executing this singleton test for all early sources remains a research dependency rather than a decoder condition.

## Canonical late rule for all history families

For each matching late witness, record **successful old taxi Starts**, including the input frame before the service pass changes `taxi.start`. Rejected presses, card calls on foot and a pending Start not yet consumed are not departures. Each successful departure is labeled by its consuming global frame; its pre-Start frame is one less, matching the retained single-trip convention. There are at most `F` successful Starts because input is consumed once per frame. [Pinned handleInput/frame order](https://github.com/odogono/mercenary/blob/e4cba434069ca1fbec6e72b3a99cbf775f1663c4/web/src/dion/session.ts)

Choose a matching witness by the following total order:

1. Lexicographically smallest finite vector of successful pre-Start frame numbers, with a proper prefix sorting before its extension. This chooses the earliest first departure among nonempty schedules, then the earliest second, and so on; equal shared departures favor a shorter schedule. The empty no-departure schedule sorts before every nonempty one. This is the ordinary prefix-first lexicographic rule implemented by `compareTaxiDepartureSchedules` (which records equivalent consuming ticks).
2. Among equal departure vectors, shortest effective supported operation word, including genuine-capture restore edges. Zero-tick loops are therefore never needed as tie-breakers.
3. Among equally short words, lexicographically smallest operation word: opcode order `press < intent < advance < captureRestore`; press order `activate < star < plus < minus < board < leave`; intent fields ordered `look,pitch,running,strafe,turn,walk`, false before true; numeric values in increasing numerical order with `-0` before `+0` for an otherwise equal binary64 pair. Compare finite numerical operands by their exact binary64 values, not locale/string order.

The least departure vector exists because its entries range over a finite bounded set. For that vector a minimum finite word length exists, and for that length the finite alphabet has a least word. Every selected history must still reproduce the **complete old source**. Equal old source state therefore selects one reference independently of original departure, slot, descriptions, storage timestamps or current wall time. Earlier API-call chunking is retained by the final tie-breaker; an implementation cannot coalesce its calls before proving that rewrite preserves both source and reference.

This order applies to histories with no trip, multiple trips, repeat boarding, changing destinations, returning to prison, rejected requests, and genuine restores. It does not impose a latest boarding time. It generalizes the retained earliest-departure result: inside that fixed single-trip recipe, the departure vector has one entry and the known candidates are **16,156**, **81,692**, **147,228**, so **16,156** wins. The fixed-family wait congruence and calibrated `+484` reset offset may prune those candidates; neither is a general invariant for other routines, message timing or trip schedules. [Single-trip arithmetic and three complete matches](mercenary-iii-tourcraft-canonical-reference.md#candidate-derivation-and-exact-match-boundary)

This is a documented reference rule. Its selection order is new research specification under the existing accepted policy; universal search execution and the independent expanded reconstruction remain unproved. A source-only constructor must advance the selected expanded history from its pinned initial facts, applying campaign changes when its history requires them. Selecting a final wait residue, installing a fixed cash/flag tuple or postponing past campaign work until Load does not implement this rule. [ADR 0068](../adr/0068-reconcile-known-taxi-saves-with-expanded-campaign-history.md), [owner construction boundary](mercenary-iii-tourcraft-state-inventory.md#remaining-proof-boundaries)

## Executed evidence and completion boundary

The existing retained late experiment proves three complete old-source matches and the earliest fixed-family reference, with a separate scheduler replay through 6,600 later neutral ticks. The existing early experiment proves complete old source/Save equality for the `$A5` pair, equal four cursors, unequal output words, next-frame convergence and 600 further matching research frames; all 33 retained prefixes have historical codec round trips and finite face/phase comparisons. These are finite research results with the models' documented limits. [Late ledger](../../research/mercenary-iii-st/taxi-history-evidence.json), [early ledger](../../research/mercenary-iii-st/taxi-early-evidence.json)

The [necessary source checker](../../research/mercenary-iii-st/scripts/taxi-source-eligibility.ts) executes raw projection equality, availability uniqueness/order, static opening owners, inactive queue/timer/cabin, clock, frame counter, phase, last-frame daylight and remainder checks. All **33** archived controls pass. **15 synthetic, decoder-valid inconsistencies** are refused with paths and reasons; the tests retain exact input bytes. These fabricated records are boundary probes, not ordinary input. The checker returns a *candidate*, not a migration admission result: it does not implement `H(S)` or `exactEarly(S)`.

The [additional audit](../../research/mercenary-iii-st/scripts/taxi-eligibility-audit.ts) supplies **11 ordinary API-input histories**: fresh/pending B, 1/60-second partial ticks, analog walking/turning, a partial selected checkpoint, extended no-Start waiting, late no-departure waiting, seated pending Start, the second threshold, and two- and three-trip journeys. Each is generated twice from fresh archived sessions, passes the necessary checker, and has equal complete source captures and research VM/face state at the checkpoint and through **600 subsequent frames**, including ordered research text requests and old PSG register writes. The [ledger](../../research/mercenary-iii-st/taxi-eligibility-evidence.json) retains operation-run digests, full-source digests, departure schedules, face checkpoints and scheduler digests. Multi-trip recipes use actual call/wait/board/select/Start/Leave operations; they inject no time, pose or snapshot. Pending Start is excluded from the checkpoint departure vector even when consumed during the later comparison.

The routine regression test regenerates the six additional early sources; the standalone audit regenerates the complete eleven-source ledger, including the slower late histories. The full eleven-source replay was also executed during validation.

These are separate executions of the **same** independent-of-historical-source R6 VM/face models. They establish reproduction and deterministic research futures, not a second oracle for model correctness, a complete expanded Gameplay Session, or evidence that the supplied witness minimizes the entire inverse-history class. The R6 rule comparisons remain the fidelity evidence for that bounded scheduler. The audit neither restores a checkpoint into its comparator nor writes storage. The retained late audit now uses the necessary checker and general departure ordering on its three known complete matches, without widening its fixed-family search. The retained `$A5` audit is rerun separately; its pre-rebuild output difference remains until #736 supplies the proof.

Reproduce from the repository root:

```sh
bun research/mercenary-iii-st/scripts/taxi-eligibility-audit.ts
bun research/mercenary-iii-st/scripts/taxi-history-audit.ts
bun research/mercenary-iii-st/scripts/taxi-early-audit.ts
cd web
bun test test/dion-source-eligibility.test.ts test/dion-canonical-reference.test.ts test/dion-early-initialization.test.ts
```

**#735 remains open.** This contribution specifies the full source relation and general canonical ordering, implements necessary consistency checks, and expands finite reproducibility evidence. It does not execute the general graph, prove every early class exact, identify the globally selected reference for the new late sources, or independently compare all expanded owners. Those missing universal/reference proofs prevent claiming the issue's acceptance. Owner construction remains #737 and codec/runtime/browser checks remain #711.

Validation: `bun run check` passed web/research TypeScript, lint, formatting, documentation checks and **2,571 tests with 489,114 assertions**. The retained early and late ledgers reproduced semantically unchanged. Independent review approved this as a partial research contribution, with the universal/reference gaps above retained. `git diff --check` passed.
