# Fidelity Contract v1

Status: normative

Decision ticket: [#3 — Define the fidelity contract and departure policy](https://github.com/odogono/mercenary/issues/3)

## Purpose

This contract defines how the Faithful Remake demonstrates observable
equivalence to the Reference Build. It governs what must be preserved, how an
observation becomes testable, how uncertainty is represented, and how an
intentional difference can be accepted without erasing the C64-derived
baseline.

The words **must**, **must not**, **required**, **should**, and **may** are
normative. This document defines records and decisions in Markdown; executable
schemas and verification tooling belong to issue #12.

## Evidence and baseline

Authoritative Evidence observed in a running C64 build or decoded directly from
C64 data defines the baseline. Manuals and other editions may corroborate an
interpretation or expose a research question, but their number does not
outvote direct C64 evidence.

The current laboratory subject is a qualified crack. Evidence from it remains
valid for that exact artifact, subject to these rules:

- Retail C64 runtime or decoded evidence resolves a crack-sensitive conflict.
- A proven crack addition, removal, or alteration is retained in Research
  Provenance but excluded from the game baseline.
- An unresolved crack-sensitive case is `provisional`.
- A provisional case with material player impact blocks full conformance unless
  an accepted Departure Record covers it.

Restricted ROMs, dumps, screenshots, decoded payloads, and other source evidence
remain on the publication side of [ADR 0002](adr/0002-separate-rom-research-from-implementation.md).
Public Behavior Cases and Departure Records identify that evidence through safe
Research Provenance rather than publishing it. Publication clearance is a
separate decision governed by the
[publication-constraints research](research/publication-constraints.md).

## Conformance rule

Every applicable Behavior Case must either pass its expected observables and
Acceptance Envelopes or link to an `accepted` Departure Record. Draft cases do
not establish evidence, and unresolved material provisional cases prevent full
conformance unless covered by an accepted departure.

An accepted departure may cover material behavior or a fidelity-critical
content substitute and still count as full Fidelity Contract conformance. To do
so, it must demonstrate a real constraint, choose the least-divergent feasible
alternative, measure player impact, define tests, remain public, and receive
explicit approval from one maintainer. Approval never rewrites the Behavior
Case: reports must continue to distinguish `pass` from `departed`.

New Authoritative Evidence that materially changes a Behavior Case sets the
case to `provisional` and every dependent departure to `reopened`. Neither
regains its prior status until the evidence, expectations, tests, and approval
have been reviewed again.

## Fidelity dimensions

Behavior Cases declare each dimension they exercise. A missing dimension is not
implicitly waived; the catalogue must cover the complete player-observable
Initial Release before final conformance can be claimed.

### Semantic state and outcomes

Progression, viable solutions, meaningful choices, economy, inventory, world
state, encounters, failure and completion conditions must match exactly for the
same meaningful initial state and action sequence. Internal algorithms, memory
layout, and native types are not fidelity dimensions.

### Timing

Player-relevant cadence, ordering, latency, duration, and rate limits must use
case-specific Acceptance Envelopes derived from evidence. There is no global
timing tolerance. Until an envelope is measured, a timing-sensitive case
remains provisional.

### Controls

Native keyboard, controller, and future accessibility devices map to semantic
player actions rather than C64 scan codes. The mapping must preserve action
availability, conflicts, ordering, rate limits, and resulting state within the
case's timing envelope. Device discovery, remapping UI, and host event plumbing
are Mac Adaptations.

### Visuals and characteristic feel

Objective visual checks cover scene membership, geometry, placement,
visibility, detail transitions, and other scene content named by the Behavior
Case. They do not require pixel, palette, raster, or physical-display identity.

The Reference Build's wireframe visual language is nevertheless mandatory. One
maintainer must perform the same documented scenarios in the Reference Build
and Faithful Remake, record comparative findings, and approve characteristic
feel. Host scaling and windowing are tested separately as Mac Adaptations.

### Authored content and audio

Authoritative wording, names, messages, event associations, musical structure,
and sound-cue identity belong to the baseline. Encoding, synthesis, mixing, and
playback plumbing may be independent. An unavailable publication clearance does
not silently alter the Behavior Case; a substitute requires an accepted
Departure Record.

### Saves

A native save must restore the same meaningful game state and future behavior,
including location, progression, inventory, economy, vehicles, and mutable
world state exercised by its cases. Original disk or tape representation and
media compatibility are not required unless separately adopted later.

### Nondeterministic behavior

Tests use deterministic seeded traces when the observable behavior permits
them. Otherwise cases specify legal outcomes, invariants, bounds, frequencies,
and player-relevant timing envelopes. Reproducing the original PRNG or exact
cycle-dependent sequence is not required unless that sequence is itself
player-observable and material.

## Classification rules

Each Behavior Case has one classification:

- `required-behavior`: ordinary player-observable content or behavior.
- `preserved-quirk`: reproducible behavior whose removal changes progression,
  viable solutions, meaningful choices, learned timing, world behavior, or
  characteristic identity. A harmless oddity may also receive this
  classification through explicit curation.
- `repairable-artifact`: reproducible C64 hardware or software behavior proven
  to have no material player impact. Implementing a repair requires a Departure
  Record; apparent obviousness is not evidence.
- `mac-adaptation`: separable host interaction or presentation behavior that
  leaves the semantic baseline intact and remains within applicable envelopes.
  An adaptation outside them requires a Departure Record.
- `excluded-crack-artifact`: behavior proven to be introduced by, removed by,
  or specific to the crack. It retains Research Provenance but is not applicable
  to conformance.

Unclassified observed behavior is preserved pending evidence and classification.
Materiality means that a difference can affect progression, a viable solution,
meaningful choice, learned timing, persistent state, world behavior, or
characteristic feel.

## Behavior Case template

Behavior Cases are versioned Markdown records. Changes to evidence,
expectations, envelopes, classification, or applicability increment `Version`;
editorial changes do not. Status is `draft`, `provisional`, or `verified`.
Implementation result is independently recorded as `not-run`, `pass`, `fail`,
or `departed`.

```md
# BC-<stable-id>: <title>

- Version: <positive integer>
- Status: draft | provisional | verified
- Classification: required-behavior | preserved-quirk |
  repairable-artifact | mac-adaptation | excluded-crack-artifact
- Materiality: material | non-material
- Crack sensitivity: retail-corroborated | crack-sensitive | not-applicable
- Fidelity dimensions: <state, outcome, timing, controls, visuals, content,
  audio, saves, nondeterminism>
- Evidence version: <stable evidence identifier and version>
- Research Provenance: <public-safe references; restricted pointer if needed>

## Initial state
<Meaningful state and setup required before input.>

## Semantic actions
<Ordered player actions and any timing or concurrency constraints.>

## Expected observables
<Exact state/outcome expectations and observable presentation.>

## Acceptance Envelopes
<Evidence-backed bounds per non-exact dimension; no guessed defaults.>

## Verification
- Method: <automated comparison, manual observation, statistical check>
- Result: not-run | pass | fail | departed
- Evidence: <run/report identifiers>

## Characteristic-feel review
- Scenario: <shared comparative scenario or not-applicable>
- Reviewer/date: <maintainer and date or pending>
- Findings: <recorded comparison>
- Decision: pending | approved | rejected | not-applicable

## Departures
<Departure Record identifiers or none.>
```

## Departure Record template

Departure Records are versioned Markdown records in a public ledger. Status is
`proposed`, `accepted`, `reopened`, or `superseded`. A status change, affected
case change, new evidence, or substantive decision change increments `Version`.
Restricted evidence is referenced, not copied into the public record.

```md
# DR-<stable-id>: <title>

- Version: <positive integer>
- Status: proposed | accepted | reopened | superseded
- Affected Behavior Cases: <stable IDs and versions>
- Evidence version: <baseline evidence identifiers and versions>
- Constraint: <why matching the baseline is not feasible>
- Observed mismatch: <what differs from each case>
- Materiality: material | non-material
- Research Provenance: <public-safe and restricted pointers>

## Alternatives considered
<Feasible options, including retaining the baseline.>

## Least-divergent choice
<Selected alternative and why every rejected option diverges more or is not
feasible.>

## Player impact
<Measured semantic, timing, presentation, content, and future-state effects.>

## Verification
<Tests and expected results for both the retained baseline and the exception.>

## Public rationale
<Concise explanation suitable for the repository and release evidence.>

## Approval
- Maintainer: <identity>
- Date: <date>
- Decision: pending | accepted | rejected

## Revalidation
<Evidence changes that reopen this record, or superseding record ID.>
```

## Decision examples

These examples test the policy; they do not create actual catalogue entries.

| Scenario | Required decision |
|---|---|
| A collision exploit enables an established solution | Classify it as a material `preserved-quirk`; removing it fails unless an accepted material departure covers the case. |
| A reproducible one-frame flicker has no material impact | It may become a `repairable-artifact` only after evidence establishes non-materiality; a repair still needs a departure. |
| A crack intro is proven absent from retail C64 media | Classify it as an `excluded-crack-artifact` and retain its provenance outside conformance. |
| A controller replaces joystick-port input | Treat device mapping as a `mac-adaptation`; semantic actions, conflicts, rate limits, timing, and outcomes still pass their cases. |
| A native save uses a new file format | It passes when restored meaningful state and future behavior match; C64 media compatibility is unnecessary. |
| Random encounters produce different sequences | Verify seeded traces where possible and otherwise compare legal outcomes, invariants, frequencies, and timing envelopes. |
| Fidelity-critical content cannot receive publication clearance | Retain the content-identity case and require a necessary least-divergent public departure for any substitute. |
| Retail C64 evidence contradicts a case derived from the crack | Set the case to `provisional`, dependent departures to `reopened`, and require fresh verification and approval. |

## Deferred decisions

This contract deliberately does not choose executable schemas, verification
tools, concrete thresholds, native UI, input layouts, rendering architecture,
or actual catalogue cases. The behavior catalogue belongs to issue #8, the
macOS experience to issue #9, and executable verification to issue #12.
