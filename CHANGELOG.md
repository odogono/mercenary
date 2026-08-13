# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Fixed

- Stop treating a script's clear of the engine's running flag as the end of that
  script. The Reference Build's step loop never consulted that flag — only its
  start did — so clearing it means "I may be interrupted now", and several scripts
  keep running afterwards. The opening's ending was being swallowed as a result:
  boarding the Dart jumps into the craft's own description, which clears the flag
  as its third instruction and then says "THIS CRAFT BELONGED TO THE PALYAR
  COMMANDER'S BROTHER-IN-LAW / HE IS NOT TOO PLEASED" before the game proper
  begins with "PALYAR SHIP ATTACKING". A script now ends where it actually ends: a
  return with nothing to return to. Also correct the on-foot value of the
  boarded-craft byte, which is `$80` rather than zero, because slot zero is a real
  ship.

### Added

- Run the Reference Build's own game logic: decode all 51 Benson Scripts and add a
  Swift interpreter behind the Host Callout seam (issue #45, second step; ADR
  0015). The opening now plays in the app because script 00 is running — the crash
  sequence, a random landing verdict, the full status report, and the craft-sale
  argument, on a scrolling message line whose pace blocks the script as the
  original's did. Pressing Y buys the Dominion Dart and the balance falls from
  9000 to 4000 credits through the same ten's-complement BCD add the Reference
  Build used; pressing anything else takes the "IT WILL BE A LONG WALK" branch;
  either way the script parks on the craft test that a later step will satisfy.
  This answers the question the text-table step left open: the intro text has no
  table entry because it is inlined into the scripts themselves.
  Scripts are re-encoded rather than copied (ADR 0015), with every machine address
  and key code resolved to a named symbol at export, so the app never handles a
  C64 address and an unnamed one fails the export. Adds `c64lab/benson.py` with
  per-opcode width assertions and interpreter fingerprints checked in memory,
  `lab benson decode`, `benson.json` in the Data Payload, `BensonProgram`,
  `BensonHostState`, `BensonMachine`, `BensonSession`, and `MessageTicker` in
  MercenaryKit, and `--benson-trace` for checking a script without a window.
  Our own extraction found six scripts the Reference Disassembly had not resolved,
  cutting unreachable script bytes from 146 to 8, and established that `wfr` waits
  count seconds rather than video frames.
- Read the app's tuned values from `settings.json` at the repository root, so
  judging feel means playing and editing rather than editing and rebuilding: the
  message line's reading hold and reveal rate, and the script timing scale and
  instruction budget. Every field has a default, so the file may name only what it
  changes, and a missing file is simply the defaults; a malformed one is reported
  rather than silently ignored, which would otherwise leave a tuning session
  running the old values. `MERCENARY_SETTINGS` points at an alternative file, and
  `--benson-trace` honours the same settings so a trace matches what the app does.
- Resolve the text engine's digit glyphs: character codes `$00`-`$09` are `0`-`9`,
  which the numeric-field emitter settles by storing unpacked BCD nibbles straight
  into the character stream. Fixes the missing "5" in "PRICE 5OOO CREDITS" and
  leaves `$0E` and `$6D` as the only unresolved codes.
- Decode the Reference Build's current-cell surface-structure selection, while
  keeping the immediate one-cell ring visible in the Mac presentation to avoid
  whole buildings popping at cell boundaries. Add `--inspect-structures` with a
  deterministic contact sheet and report for all 98 unique structures, retain
  their stable Geometry Identities at runtime, and report edges whose endpoints
  belong to the shared road-point workspace rather than silently dropping them.
  Correct the surface edge decoder: a zero marker switches the remainder of the
  record from packed nibbles to full-width endpoint pairs, fixing buildings such
  as Novabill's house at 03:08, and require geometry decoder 3 so stale payloads
  are rejected.
- Render the complete opening scene at cell 8:8 (issue #51): start the app
  facing the airstrip, Dart, crashed spacecraft, and deterministically rotating
  inverted pyramid; preserve every surface vertex and edge in Data Payload
  schema 4; and add pinned-time headless captures for animation comparisons.
  Correct object-model coordinates to signed two's-complement values, fixing
  the severely stretched spacecraft produced by the previous offset-binary
  interpretation, and require geometry decoder 2 so stale datasets cannot
  silently restore the distortion.
- Decode the Reference Build's two road-table slots as full, zero-width runs,
  preserve all 256 lookup entries in Data Payload schema 3, reproduce the
  altitude/current-structure/fixed-map selection rules, and add a verified
  `geometry roads-svg` exporter. The current 271 table entries collapse to 32
  unique undirected lines; cell 8:8's parallel lines remain separate airstrip
  structure geometry. Use the supplied Atari ST reference's sampled `#60A0E0`
  sky and `#008000` ground, with true black ink and no synthetic horizon stroke.
- Add a geometry debug mode (`--inspect-objects`, `--inspect-object`,
  `--inspect-cell`) that renders a subject in isolation with its decoded numbers,
  plus a contact sheet of all 64 objects on one page. Canonical framing by
  default; `--in-situ` for the game-accurate view.

### Fixed

- Correct the rotating surface-structure transform used by the inverted pyramid
  at 8:8: its X/Z source bytes are exponent-scaled by 16 while Y remains scaled
  by 256. Advance its phase at the measured completed-geometry-frame cadence of
  about 5 Hz, rather than the 50 Hz PAL display rate that made it sixteen times
  too wide and spin ten times too fast.
- Replace the guessed 124-pixel camera focal length with the Reference Build's
  decoded projection: FOCUS `$18` yields `64 X/Z`, while the Y pipeline's extra
  exponent step yields `128 Y/Z`. Restore the VIC-II multicolour pixel aspect:
  the 160 logical X positions occupy a 320-pixel display, making the physical
  X and Y focal lengths equal instead of rendering models half-width and overly
  tall. This pins apparent size in projection tests and calibrates the cell 8:8
  opening to a neutral-horizon pose 12,000 world units from its scene focus at
  the decoded `$0080` eye height. Treat a zero road-altitude extent as the
  Reference Build's no-roads sentinel, hiding the road network below Y=2048;
  higher extents continue to select the complete clipped surrounding square.
- Carry the Reference Build's presentation rules through to the app, which the
  payload exporter had been discarding: the object detail cube and far-point
  representation, the road altitude table, structure rotation data, and the
  transform contract (introduced in payload schema 2 and retained by schema 3).
  Apply model-local orientation for the
  rotatable slots, derive the projection from the original's 160x136 frustum
  instead of an invented field of view, and stop drawing instances parked outside
  the world. Fix a grid-key aliasing bug where a negative column resolved to the
  previous row and duplicated that cell's geometry at the world edges.
  Road selection and scene colours were subsequently resolved by the schema-3
  work above.

- Decode the dictionary-compressed text tables and put a message line in the app
  (issue #45, first step): 64 messages and 159 distinct words recovered from our
  own Reference Build, composed by reproducing the emitter's spacing rule, and
  rendered on screen with `[` / `]` to page through the set. Adds `c64lab/text.py`
  with structural guards on the emitter, `text.json` to the Data Payload via
  `lab payload export --run`, `TextTable` in MercenaryKit, and
  `notes/decode/text-tables.md`. Three character codes are left unresolved rather
  than guessed, and the intro/comms text block is deferred because it is addressed
  by a mechanism this step did not identify.
- Release held keys when the app loses focus, so a key-up delivered while
  inactive cannot leave the player turning forever.
- Deliver M1, the surface walkabout (issue #44): a macOS app that loads the Data
  Payload and lets you walk around Targ in a wireframe presentation. Adds
  the `app/` Swift package — `MercenaryKit` (payload decoding, world building,
  projection, and a pure deterministic `GameCore`) and `Mercenary` (window,
  input, Canvas renderer) — plus `lab payload export`, which rewrites a verified
  World Geometry Dataset into the runtime payload shape without decoding anything
  new. Includes headless `--render-frame` capture for fidelity spot-checks from a
  machine that cannot open a window, and `notes/decode/surface-geometry.md`
  recording the world frame, the 410 deferred runtime-rotated edges, and the
  object-grounding judgement.
- Verify the enterable-object inventory and its Handler-Equivalence Class
  assignment for UNC-0002 (issue #28), unblocking UNC-0001's exhaustive Semantic
  Mode inventory. The inventory is closed by decoded dispatch reachability and
  corroborated by typed live-block observations from two reproduced cold runs of
  new proof trace TR-9028. The decoded partition is singleton and the dispatch
  handler count is published as the candidate coarsening, so UNC-0001 must prove
  its matrix once per member rather than the two classes previously assumed.
- Add `catalogue/object-semantics-coverage.json` with a closed eight-family
  Object-Conditioned Predicate ledger, its Draft 2020-12 schema, machine-checked
  UNC-0002 responsibility sets, and a resolution gate requiring every family and
  class to be verified. All eight families remain `open`; UNC-0002 stays open.
- Add the `lab object-semantics decode|verify|corroborate|attest` workflow, a
  verified BC-0041, ADR 0013 for the class-key projection, and Handler-Equivalence
  Class and Object-Conditioned Predicate to the shared language. Exact mappings,
  per-field ledgers, and corroboration reports remain Restricted Material cited by
  Evidence ID and artifact hash.
- Add `lab catalogue review-status`, which fails when a recorded maintainer
  approval is stale, unapproved, or missing. All 21 approvals recorded in #38 were
  already stale, because #39 moved the catalogue digest without any command
  reporting it.
- Record the maintainer's digest-bound approval of all four World Geometry
  Dataset comparisons and all 21 Behavior Catalogue review subjects; resolve
  the non-material geometry-review bookkeeping uncertainty while preserving
  the eight material evidence uncertainties as downstream work.
- Define the normative Product and Technical Implementation Specification for
  issue #13, including MCJ-1 package JSON, deterministic-CBOR runtime contracts,
  exact identities and signatures, bounded Lua/XPC execution, migration,
  diagnostics, author tooling, fuzz gates, and candidate-release evidence.
- Add 14 Draft 2020-12 schemas, six CDDL contract families, closed version
  registries, 25 positive/negative golden vectors, and `lab implementation
  validate`; add Execution Environment to the shared language and record ADR
  0012 for the production encoding boundary.
- Define the normative Verification System for issue #12 with scoped Behavior
  Cases, immutable results, public/restricted manifests, dependency-aware reuse,
  digest-bound approvals and departures, dual conformance/readiness verdicts,
  and derived Release Eligibility.
- Add schema-validated `lab verification validate`, `aggregate`, and `render`
  workflows; migrate BC-0001 through BC-0021 to canonical JSON; promote the
  MAS/CSM scenarios as BC-0022 through BC-0036; and add focused renderer,
  compatibility, fuzzing, and dependency-review cases through BC-0040.
- Define the normative Content and State Model for issue #11, including exact
  Content Set and linear Content Overlay resolution, typed ResourceGraph
  relationships, deterministic Lua 5.5.1 Mods in a sandboxed XPC simulation
  service, authoritative Transition Logs, exact-bound saves, audited migration,
  and ADRs 0008–0009.
- Add Content Set, Content Overlay, Mod, Session State, and Transition Log to the
  shared language, and extend the native, macOS, fidelity, and publication
  contracts with the resulting boundaries.
- Define the accepted macOS experience contract, Native Shell and Game Surface
  boundary, Mac Adaptation review scenarios, and a synthetic SwiftUI/Core
  Graphics prototype with tested display, input, accessibility, feedback, and
  save interactions for issue #9.
- Add the public-safe Behavior Catalogue model, neutral Catalogue Entries,
  evidence-linked Behavior Cases, closed coverage and uncertainty indexes, and
  ADR 0005 for issue #8.
- Add schema-validated `lab catalogue` run, build, verify, sample, review, and
  summarize workflows with branch traces, content-addressed restricted evidence,
  PAL timing, probe enforcement, WAV/SID capture, and writable D64 support.
- Add a reproducible, schema-validated World Geometry Dataset extractor with
  exact object, surface, road, underground, provenance, expansion, bounds,
  curation, comparison, review, and redacted-summary workflows for issue #7.
- Add Geometry Identity and Curated Name to the project language while keeping
  exact reconstructed payloads and comparison media in ignored restricted
  storage.
- Define a private-by-default publication policy for solo research and
  implementation, with a maintainer checklist and qualified-review gate for
  Reconstructed Payloads and other sensitive material.
- Define the versioned Fidelity Contract for observable equivalence, evidence-linked
  Behavior Cases, Acceptance Envelopes, Preserved Quirks, Mac Adaptations, and
  publicly governed Departure Records.
- Add normative Behavior Case and Departure Record templates, including
  crack-sensitive evidence handling, comparative wireframe review, semantic
  input/save rules, and nondeterministic verification requirements.
- Establish the provenance-safe C64 Reference Build laboratory for issue #2.
- Add repeatable VICE environment checks, checkpoint captures, binary-monitor
  observations, artifact verification, and two-run reproduction through the
  `research/c64-reference-build/lab` CLI.
- Record the qualified ABC/1001 crack identity, boot and unpacking path,
  normalized post-unpack and interactive evidence, schemas, scenarios, labels,
  segment metadata, and primary-source VICE research.
- Ignore supplied ROM inputs and generated research artifacts so no PRG, RAM
  dump, snapshot, screenshot, or reconstructed payload is published.

### Changed

- Pivot the project to a private-first playable artifact (ADR 0014). The
  verification-era apparatus — Behavior Cases, Acceptance Envelopes, Evidence
  records, Conformance Reports, and the uncertainty ledger — is frozen as
  history and extended by nothing; the maintainer playing the remake beside the
  Reference Build becomes the fidelity judge, with a modernised-feel bar. Game
  data moves to a single gitignored Data Payload re-extracted by this project's
  own tooling; the community Reference Disassembly is consumed as unlicensed
  reference documentation only. Game logic will run as original Benson Scripts
  under a native interpreter behind a host-callout seam sized for a later Lua
  rewrite. Add Data Payload, Benson Script, and Reference Disassembly to the
  shared language and mark the claim-era terms historical.
