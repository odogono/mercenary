# Verification System v1

Status: normative

Decision ticket: [#12 — Define the verification system](https://github.com/odogono/mercenary/issues/12)

Related decisions: [Fidelity Contract](fidelity-contract.md), [Native Simulation and Rendering Architecture](native-architecture.md), [macOS Experience Contract](macos-experience.md), [Content and State Model](content-state-model.md), [scoped Behavior Cases](adr/0010-unify-verification-under-scoped-behavior-cases.md), and [visual review authority](adr/0011-make-observables-and-human-review-authoritative.md).

## Purpose

This contract defines the evidence system used to evaluate an exact application
build and resolved Content Set. It keeps Fidelity Conformance separate from
Release Readiness, makes every result traceable to its dependencies, and lets a
public repository validate a protected comparison without publishing Restricted
Material.

The tracked implementation supplies schemas, validation, aggregation, and
deterministic Markdown rendering. It does not implement the production game,
Swift adapters, Reference Build automation, or final release pipeline.

## Claims

Every Behavior Case declares one or both claim scopes:

- `fidelity` says the case contributes to the Fidelity Contract verdict.
- `release-readiness` says the case contributes to the safety, compatibility,
  integrity, or operational readiness verdict.

A Conformance Report exposes both verdicts. `releaseEligible` is true only when
Fidelity Conformance is `conformant`, Release Readiness is `ready`, every
required human decision is already approved, and all evidence is current.
Generation is automatic; publication and release remain maintainer actions.

Departure Records govern fidelity mismatches only. A dual-scope case with a
valid departure may satisfy fidelity, but its `departed` result makes Release
Readiness `not-ready`. Security, compatibility, containment, and other
release-readiness failures cannot be departed.

## Canonical records

All canonical records are schema-validated JSON under `verification/`.
Generated Markdown is a disposable view and must not be committed.

### Behavior Case

A Behavior Case is a versioned executable scenario with a stable `BC-####`
identity, explicit claim scopes, execution tiers, applicability, dependencies,
initial state, actions, expected observables, Acceptance Envelopes, verification
method, and review requirement.

Fidelity-scoped cases additionally require classification, materiality, crack
sensitivity, fidelity dimensions, evidence links, Research Provenance, and
Departure Record links. Release-only cases must not carry those fields. Changing
expectations, dependencies, envelopes, scopes, applicability, or evidence
increments the case version; editorial changes do not.

Case definitions never contain execution outcomes. BC-0001 through BC-0021
retain their identities after migration from the C64 research catalogue.
BC-0022 through BC-0029 promote MAS-0001 through MAS-0008, and BC-0030 through
BC-0036 promote CSM-0001 through CSM-0007. The former identifiers remain
traceability aliases.

### Verification Plan

A Verification Plan names a public-CI or release-candidate tier and binds:

- exact application-build and Content Set digests;
- the official or modded candidate kind and advertised macOS majors;
- the complete Behavior Case graph digest;
- evidence, protocol, tool, and environment digests; and
- one named Reference Mac plus its per-run metadata digest.

The plan does not select an arbitrary case list. The aggregator derives every
applicable case from tier, candidate kind, scopes, catalogue coverage, and the
dependency graph. A stale graph digest or omitted applicable case is invalid.

### Verification Manifest and Result

A Verification Manifest identifies one public or restricted Verification Run,
its plan lineage, timestamps, environment metadata, tools, result identities,
and whether its underlying evidence remains available. A restricted manifest
contains only opaque evidence identities and allowlisted metadata; it must not
contain source paths, raw artifact hashes, payload excerpts, decoded values, or
Restricted Material.

An immutable Verification Result binds one case version to one dependency
fingerprint and has one outcome:

- `pass`: the expected observables and envelopes were satisfied;
- `fail`: an applicable obligation was violated;
- `departed`: the fidelity mismatch is covered by an exact accepted Departure
  Record; or
- `blocked`: the case executed or was considered, but a prerequisite, required
  diagnostic, or approval prevents a decision.

`not-run` is not stored. The report derives it when an applicable case has no
current reusable result.

The dependency fingerprint includes the exact case, app build, Content Set,
evidence, protocol, tool, and relevant environment digests. A prior result may
be reused only when that fingerprint and case version match exactly. The report
records the originating run. Changed fingerprints selectively invalidate their
transitive dependants rather than every unrelated result.

### Approval and Departure Record

A human Approval Record is immutable and binds maintainer identity, timestamp,
decision, target version, and canonical target digest. Git history supplies
accountability; no signing key is required. Tooling validates approvals but
never creates a subjective finding or accepts a departure by inference.

Departure Records retain the Fidelity Contract fields and lifecycle. An
accepted record must cover the exact case version and have at least one valid
digest-bound maintainer approval. New material evidence reopens the case and
departure through their changed dependency/version graph.

### Conformance Report

A Conformance Report is an immutable public-safe aggregation for one plan. It
contains the exact candidate and graph identities, result/reuse lineage,
diagnostics, reproducibility state, independent verdicts, and release
eligibility. A report whose protected evidence is later lost remains an
historical record but becomes `historical-only`; it cannot be reused or support
current release eligibility.

Verdict precedence is deterministic:

- Any uncovered fidelity `fail` yields `nonconformant`.
- Otherwise a fidelity `blocked`, derived `not-run`, non-official candidate, or
  passed material provisional case yields `blocked`.
- Otherwise fidelity is `conformant`; an exact accepted departure counts as
  conformant while remaining visibly `departed`.
- Any release-readiness `fail` or `departed` yields `not-ready`.
- Otherwise a release-readiness `blocked` or derived `not-run` yields `blocked`.
- Otherwise Release Readiness is `ready`.

## Evidence lanes and execution tiers

Public and restricted evidence use the same schemas and verdict rules.

Public CI runs schema validation, graph and provenance integrity, redaction,
deterministic synthetic integrations, supported-host compatibility, and
aggregator tests. Release candidates additionally run every applicable
restricted comparison, full journey, save continuation, security case, and
human review. A public-CI plan may report useful case and Release Readiness
results, but its Fidelity Conformance verdict remains `blocked` and it cannot
establish Release Eligibility.

The Reference Mac has a stable project name. Each run also captures its actual
hardware, OS build, display configuration, relevant settings, app build,
Content Set, and tool/protocol versions behind the environment digest. It is the
authoritative environment for protected visual and characteristic-feel
comparison. Public synthetic compatibility must exercise every advertised
macOS major on an available Apple-silicon runner; a missing advertised-major
result blocks Release Readiness. A GPU-generation matrix is not required.

Protected inputs and full outputs are retained on a best-effort basis in local
content-addressed storage. Their sanitized manifest is tracked. Loss does not
rewrite history, but it prevents reuse and current eligibility.

## Required proof

### Provenance and coverage

Validation must fail closed on malformed identities, broken evidence or case
references, graph cycles, stale digests, unsafe restricted fields, incomplete
catalogue dimensions, and omitted applicable cases. Catalogue completeness is
not conformance: provisional and unexecuted obligations remain visible.

### Game Semantics and nondeterminism

Equal resources, configuration, seeds, Semantic Actions, module order, and
budgets must produce exact committed transitions, canonical projections,
snapshots, events, and per-module random state. Failed ticks commit nothing.

Deterministic behavior uses repeat traces. Nondeterministic cases define legal
sets, invariants, frequencies, trial counts, confidence methods, and timing
envelopes from evidence. No global sample count or tolerance is inferred.

### Geometry and rendering

Objective checks gate scene membership, Geometry Identities, transforms,
placement, visibility, detail transitions, primitive order, and information
presence using exact or case-specific envelopes. Generic screenshot similarity
does not establish fidelity.

Relevant visual runs must capture CPU ProjectionOracle versus Metal output.
Missing capture blocks the case. Agreement or disagreement is disclosed, but
the comparison is diagnostic and does not change either verdict. One maintainer
performs the documented Reference Build/remake scenario and supplies the
digest-bound characteristic-feel decision.

### Journeys and saves

Every verified materially distinct terminal branch must run from the fresh
initial state to its terminal outcome. Mid-game checkpoints cannot replace this
proof. Decoding plus runtime evidence must establish that a candidate additional
branch is present or absent.

Save verification compares canonical restored state immediately and then runs
every case-named continuation to its next material outcome. It covers location,
progression, inventory, economy, vehicles, mutable world state, timers, held
actions, random streams, and module state. There is no arbitrary universal
post-load time horizon.

### Security and failure containment

Release Readiness includes fail-closed resource admission, digest-bound Mod
consent, deterministic transactional Lua, capability enforcement, decoder and
XPC fuzzing, malicious fixtures, dependency/Lua review, safe diagnostics,
renderer suspension, and XPC termination without hidden recovery. These cases
may support confidence in the implementation but do not prove Reference Build
fidelity.

## Tool interface

The existing laboratory exposes:

```sh
./research/c64-reference-build/lab verification validate --root verification
./research/c64-reference-build/lab verification aggregate \
  --root verification --plan <plan.json> --output <report.json>
./research/c64-reference-build/lab verification render \
  --report <report.json> --output <report.md>
```

`validate` checks schemas, cross-record references, graph cycles, departures,
approvals, and restricted-manifest safety. `aggregate` derives applicability,
rejects stale results, resolves dependency blocking, and emits the report.
`render` produces deterministic Markdown without making it canonical.

Production adapters must emit these neutral records without widening their
claim semantics. Issue #13's [Product and Technical Implementation
Specification](implementation-specification.md) and [machine
contracts](../implementation-contracts/) fix the concrete Swift boundary,
execution budgets, XPC messages, and candidate-evidence automation.

## Acceptance

The system is accepted when all 40 canonical cases validate; the original
catalogue resolves BC-0001 through BC-0021 from the root case store; schema,
graph, staleness, reuse, verdict, redaction, departure, approval, diagnostic,
and rendering tests pass; and the existing research and macOS prototype suites
remain green. This establishes the verification system, not current Fidelity
Conformance: the tracked provisional cases and open uncertainties continue to
block that claim.
