# Mercenary Product and Technical Implementation Specification v1

Status: normative and implementation-ready; executable game implementation and comparative evidence pending

Decision ticket: [#13 — Assemble the implementation-ready product and technical specification](https://github.com/odogono/mercenary/issues/13)

Machine contracts: [`implementation-contracts`](../implementation-contracts/)

Governing decisions: [Fidelity Contract](fidelity-contract.md), [Publication Policy](publication-policy.md), [macOS Experience Contract](macos-experience.md), [Native Simulation and Rendering Architecture](native-architecture.md), [Content and State Model](content-state-model.md), [Verification System](verification-system.md), and [ADR 0012](adr/0012-use-bounded-json-and-deterministic-cbor-contracts.md)

## Purpose, authority, and limits

This specification turns the accepted product and architecture contracts into
concrete formats, APIs, budgets, workflows, dependencies, and verification
gates. An implementation may choose internal algorithms that do not cross a
contracted boundary, but it must not reinterpret a settled product decision or
change an externally observable outcome described here.

Authority is split deliberately:

1. The governing Markdown contracts define product semantics, ownership,
   security policy, and failure behavior.
2. This document fixes the implementation choices needed to realize them.
3. Draft 2020-12 JSON Schemas and CDDL under `implementation-contracts/`
   define exact record and wire shapes.
4. Golden vectors define canonical bytes and rejection behavior.
5. Swift declarations must conform to these artifacts; generated Swift is not
   a source of contract truth.

If those layers disagree, the implementation fails its contract gate and the
disagreement must be resolved in the owning layer. It must never be papered
over with a permissive decoder.

This specification does not choose unresolved Reference Build facts. Exact
simulation rates, action cadence, save gates, audio/text content, reconstructed
payloads, Acceptance Envelopes, and Accommodation values remain versioned
evidence inputs. A required missing or provisional input prevents the affected
session, claim, or release gate from passing; the implementation must not use a
plausible default as production behavior.

## Build and deployment baseline

- Build with Xcode 26.3, Swift 6.2.4, and Swift language mode 6.
- Deploy to macOS 14 or newer on Apple silicon only.
- Validate resource budgets and supported-host performance on a base 2020 M1
  MacBook Air with 8 GB RAM as the minimum Reference Mac configuration.
- Ship initially through direct Developer ID distribution and notarization.
  The Mac App Store, network catalogues, workshops, payments, and automatic
  content download remain out of scope.
- One process-owned Native Shell may host one live Game Surface and one live
  simulation session. Auxiliary native windows do not create sessions.

The Swift package and Xcode targets fixed by the Native Architecture remain:

| Target | Owns | Must not own |
| --- | --- | --- |
| `GameResources` | MCJ-1 preflight, package admission, schema decoding, overlay resolution, immutable `ResourceGraph` | Game Semantics, AppKit, Metal, Lua execution |
| `GameCore` | deterministic kernel, Session State projection, Transition Log, commands, random streams, snapshots, events, state codec | host UI, physical devices, file paths, Metal |
| `GameScripting` | pinned Lua, minimal host ABI, capability and budget enforcement | files, network, host frameworks, private PRNG state |
| `ReferenceRendering` | integer CPU projection and clipping oracle | visible-truth verdicts, host UI |
| `SimulationService` | sandboxed composition of resources, core, and scripting behind XPC | filesystem/network/device/automation entitlements |
| `MetalGameSurface` | native-resolution presentation of immutable snapshots | Session State or Semantic Action policy |
| `MacGameShell` | windows, menus, input mapping, package storage/consent, documents, slots, diagnostics | Lua, Session State decoding, gameplay outcomes |

Dependency direction remains one-way. Platform-neutral targets import only the
dependencies named above and Foundation where explicitly allowed.

## Production dependencies

The implementation uses Apple Foundation, CryptoKit, SwiftUI, AppKit,
GameController, Metal, and MetalKit from the pinned Xcode SDK. It additionally
uses only:

- the official Lua 5.5.1 source at upstream commit
  `7579fc9d7ed90240487251dfb69168f8e64e9294`, vendored with its license and
  source hash;
- `valpackett/SwiftCBOR` at commit
  `fd929a6d8f7651ce0f63fc99397fd5762358cc29`, kept behind a project-owned
  integer-only deterministic wrapper; and
- development-only `jsonschema==4.26.0` and the locked `cddl==0.12.13` bundle
  for independent contract validation.

`SwiftCBOR` is not trusted to enforce the Mercenary profile by itself. The
wrapper rejects disallowed forms before constructing domain values and
re-encodes accepted input to prove byte identity. Foundation JSON decoding is
preceded by a streaming, bounded Swift preflight that rejects BOMs, invalid
UTF-8, duplicate keys, floats, out-of-range integers, excess depth/nodes, and
noncanonical bytes.

All dependencies are exact-revision locked. The repository records origin,
license, checksum, review date, known advisories, and owning target. Release
automation produces SPDX and CycloneDX SBOMs using SwiftPM. A dependency or Lua
release below the current security floor blocks execution even when needed by
an old save.

## Canonical data and identity

### MCJ-1 package JSON

Mercenary Canonical JSON v1 (`MCJ-1`) is the only accepted JSON representation
for production package declarations and typed payloads:

- bytes are UTF-8 without a BOM or trailing bytes;
- object names are unique and ordered by their UTF-16 code units, matching the
  JSON Canonicalization Scheme key rule;
- strings use the shortest JSON escaping allowed by that scheme;
- strings are not Unicode-normalized; two different scalar sequences remain
  different content;
- values are null, booleans, signed 64-bit integer literals, strings, arrays,
  and string-keyed objects only;
- integers use shortest decimal spelling, with no leading plus, leading zero,
  decimal point, exponent, negative zero, or magnitude outside `Int64`;
- floats, NaN, infinities, byte-order marks, comments, and extensions are
  invalid; and
- every object is closed for its declared schema minor.

The project profile deliberately differs from RFC 8785 number handling so a
full `Int64` survives without IEEE-754 coercion. Implementations must call it
MCJ-1, not JCS.

### Deterministic CBOR

Runtime, transition, state, save, migration, diagnostic, and XPC records use
RFC 8949 core deterministic encoding with the additional profile in the CDDL:

- definite lengths only;
- unsigned integer map labels in encoded-byte order;
- shortest integer/length encodings and signed `Int64` values only;
- no tags, floats, bignums, indefinite items, duplicate labels, unknown labels,
  invalid UTF-8, or trailing bytes; and
- maximum nesting depth 64 and the family-specific length ceilings below.

The outermost item is exactly one closed map. Semantic order is represented by
arrays, never map insertion order. Canonical domain records remain string-keyed
as required by the Content and State Model, but cross the CBOR boundary as
arrays of unique `[UTF-8 key, value]` pairs sorted by key bytes; only protocol
structures themselves use integer-labeled maps.

### Domain-separated hashes

Every identity hashes the ASCII domain, including its NUL terminator, followed
by the exact committed bytes:

```text
mercenary/member/v1\0
mercenary/unsigned-manifest/v1\0
mercenary/package/v1\0
mercenary/resolved-content-set/v1\0
mercenary/execution-environment/v1\0
mercenary/save-envelope/v1\0
mercenary/consent/v1\0
mercenary/xpc-envelope/v1\0
mercenary/verification-adapter/v1\0
```

Member digests commit raw regular-file bytes. The unsigned-manifest commitment
contains the MCJ-1 manifest without its signature block and the ordered
`(normalized path, member digest, member size)` tuples. The detached signature
signs that 32-byte commitment. The package digest commits the complete signed
manifest plus the same member tuples, so re-signing produces a new exact
package and invalidates prior consent.

The resolved Content Set digest commits ordered package ancestry, typed overlay
operations, and resolved record/member digests. The Execution Environment
digest commits the exact package chain and resolved digest, Lua release and
security policy, host ABI, every schema version, and host-policy version.
Signature identity and Native Shell preferences are excluded from semantic
state but remain part of exact package identity.

Existing verification records retain their established canonicalization and
digests. MCJ-1 does not retroactively change issue #12 artifacts.

## Package admission and immutable storage

`.mercenarycontent` remains a macOS directory package, not an archive. Package
semantics include only normalized relative paths, directory structure, and
regular-file data. Symlinks, hard links, Finder aliases, sparse files, devices,
sockets, named pipes, executable/native-library members, AppleDouble/resource
forks, and extended-attribute payloads are invalid. Host quarantine metadata is
retained separately during staging but is not content and is not hashed.

Paths use `/`, Unicode scalar values, and the exact manifest spelling. Reject
absolute paths, empty/dot/dot-dot components, backslashes, NULs, control
characters, normalization aliases, and case-insensitive collisions. A path is
at most 240 UTF-8 bytes, one component at most 100 bytes, and eight components
deep.

The shell opens the selected package by descriptor, copies each declared
regular file to a fresh quarantine directory, hashes while copying, and
rechecks descriptor identity and metadata before closing. It never follows a
path discovered after enumeration. Extra or missing members fail admission.
After validation and consent, it atomically renames staging into an immutable
directory addressed by package digest. Cancellation or failure removes only
the fresh staging directory. Installed digest directories are never modified
in place.

Admission applies these ceilings before allocation or execution:

| Limit | v1 ceiling |
| --- | ---: |
| Installed package bytes | 256 MiB |
| Members | 4,096 |
| Directories | 512 |
| One member or asset | 64 MiB |
| One MCJ-1 JSON payload | 8 MiB |
| One Lua module | 512 KiB |
| Lua modules / total source | 64 / 8 MiB |
| JSON/CBOR nesting | 64 |
| Decoded nodes | 1,000,000 |
| One UTF-8 string | 1 MiB |
| Resolved records | 100,000 |
| Resolved reference edges | 1,000,000 |

The validator follows the ten admission stages from the Content and State
Model. Every stage returns either a complete immutable value for the next stage
or one safe diagnostic; partial graphs and partially installed packages do not
exist.

## Author signatures, continuity, and consent

The optional signature block is closed and contains `Ed25519`, a raw 32-byte
public key, its SHA-256 key ID, and a raw 64-byte signature. Binary fields use
unpadded base64url. CryptoKit performs production verification.

On first approval for a logical `ContentSetID`, the Native Shell stores the
author key ID as local continuity metadata. A later package with another key is
`changed-key`, not invalid; it receives a prominent warning and requires fresh
consent. A malformed block or failed signature is `invalid-signature` and
cannot install. Unsigned content remains eligible for explicit sideload
consent. Signatures never grant capabilities, official status, publication
clearance, or an identity claim.

Consent commits the package digest, resolved requested capabilities, signature
status/key ID, host-policy version, and consent-record version. Any change
requires new consent. Revocation disables new sessions but does not delete the
immutable package or saves. Local trust UI may display the exact package digest;
exported diagnostics may not include it without artifact-specific clearance.

## ResourceGraph and version evolution

The JSON schemas cover metadata; worlds, regions, locations, boundaries,
portals and transitions; entities and Property Schemas; presentation bindings;
missions, economy, progression and endings; Semantic Actions and Lua modules;
initial state, save gates and migrations; and traceability.

Record IDs are unique across the resolved graph. Typed references must target
an existing record in the declared family. Composition validates `add`,
`replace`, and `remove` against the prior generation before global reference
validation. Duplicate IDs, family changes on replacement, dangling references,
or orphaned persistent values reject the whole graph.

Every contract family carries major and minor versions. Maps are closed for
their declared minor. Adding a field requires a new minor and an explicit
decoder entry; changing meaning, type, requiredness, ordering, digest material,
or failure behavior requires a new major. Unknown majors/minors fail before a
domain type is constructed. Old headers remain safely inspectable and bytes
remain preserved, but there is no blanket multi-major execution promise.

## Restricted Lua 5.5.1 host ABI

Lua modules compile from UTF-8 source only after static package validation.
Each module returns a closed table of declared hook functions during admission;
the host then freezes the environment. No global or hidden mutable value may
affect later hooks.

The only base functions are `assert`, `error`, `select`, `tonumber` for exact
integers, `tostring` with host-defined canonical output, and `type`. Selected
pure helpers are:

- `string.byte`, `string.char`, `string.find` without patterns,
  `string.len`, `string.rep`, and `string.sub`;
- `utf8.char`, `utf8.codepoint`, `utf8.codes`, `utf8.len`, and `utf8.offset`;
- `ordered.length`, `ordered.get`, `ordered.concat`, and
  `ordered.sortedIntegers`; and
- `fixed.fromInteger`, `fixed.add`, `fixed.subtract`, `fixed.multiply`,
  `fixed.divide`, and `fixed.compare`, with schema-declared scale and rounding.

Host modules expose:

- `query.record`, `query.property`, `query.related`, and `query.orderedIDs`;
- closed command constructors `command.setProperty`,
  `command.clearProperty`, `command.addRelationship`,
  `command.removeRelationship`, `command.schedule`,
  `command.cancelScheduled`, and `command.emitEvent`; and
- `rng.integer` for the current module's staged stream.

There is no `pairs`, `next`, metatable API, protected call, callback sorting,
table mutation library, arbitrary formatting, coroutine, garbage-collector
control, dynamic loading, bytecode, debug/package/io/os/math library, C module,
filesystem, network, clock, locale, environment, or native handle. Budget and
capability violations are uncatchable host errors.

Per-hook results replace complete schema-validated module state and contain an
ordered proposed-command array. Each query, result, command, and random draw is
counted and capability-checked:

| Limit | Per hook | Per tick/session |
| --- | ---: | ---: |
| Lua instructions | 100,000 | 1,000,000/tick |
| Call depth | 64 | 64 |
| New allocation | 1 MiB | 64 MiB Lua heap/session |
| Canonical module state | 256 KiB/module | 8 MiB total |
| Commands | 256 | 2,048/tick |
| Queries | 256 | 2,048/tick |
| Query result records | 4,096 | 16,384/tick |
| Random draws | 1,024 | 4,096/tick |

A module may request lower deterministic ceilings but never higher ones. Any
deterministic limit failure rolls back and suspends at the last committed tick.
A separate containment watchdog terminates the service if a hook takes 250 ms
or a tick takes one second on the monotonic clock. Watchdog termination follows
the fixed XPC-crash outcome and is never a transition, replay fact, or fidelity
observable.

## XPC protocol and state machine

`NSXPCConnection` exposes one Objective-C-compatible method for submitting a
bounded `Data` envelope and one callback for a reply or pushed envelope. It also
exposes cancellation and invalidation handlers. Domain objects never cross
`NSSecureCoding` directly.

The CDDL assigns message types for handshake/reply, bulk begin/chunk/complete,
package validation, session creation, actions, lifecycle, save request/bytes/
acknowledgement, load, migration, cancellation, session end, status, generic
reply, snapshot, event batch/acknowledgement, diagnostic, suspend, resume, and
invalidation notice.

Every envelope contains schema version, message type, 128-bit connection ID,
optional 128-bit session ID, monotonic request sequence, payload digest, and a
closed payload. The maximum envelope and snapshot is 4 MiB. Packages and saves
use one MiB chunks with two chunks in flight and independently verified chunk
and final digests.

After handshake, mutating requests are serial. The shell sends the next exact
sequence only after the previous reply. The service retains the last 64
`(sequence, payload digest, reply)` entries: an exact duplicate replays its
reply; a changed payload, gap, stale request outside the ledger, or second
mutation fails safely. There is no automatic retry across connection
invalidation because the live session is gone.

Snapshots are latest-value and replaceable. Event batches are lossless,
strictly sequenced, and acknowledged cumulatively. At 256 unacknowledged
batches or eight MiB, whichever occurs first, the service completes the current
tick, stops admission and advancement, retains all batches, and emits
`output-backpressure`. It resumes only after the same live connection drains
below both limits. Invalidation ends the session, discards unsaved state, and
offers only explicit documents/slots; it never restarts or reconstructs hidden
state.

Save tokens are 128-bit one-use values bound to the completed projection and
exact emitted bytes. `written` acknowledgement clears dirty state only for an
exact outstanding token. `failed` or `cancelled` leaves it dirty. Duplicate
exact acknowledgements replay the prior result; changed or unknown tokens fail.

## Saves and migration

`SaveEnvelope` is a deterministic-CBOR bulk payload containing its version,
Execution Environment, exact package chain, `StateOrigin`, transition tail,
and domain-separated integrity digest. The shell may decode only the bounded
compatibility header. The simulation service performs integrity, schema,
projection, and replay validation before replacing a live session.

Migration is never implicit compatibility loading. When the exact environment
is missing or blocked, the shell may list only target packages that declare the
exact source digest. It shows source and target identities, signer continuity,
capability changes, and modded status, then asks the user to create a migrated
copy. The source document remains byte-for-byte unchanged.

The service receives source bytes, target definitions, and the declared
migration module; it cannot run source gameplay hooks. Success creates a new
`StateOrigin`, new envelope, and audit record linking source-save digest,
source/target Execution Environments, migration ID, result digest, and safe
verification result. The shell writes a separately named document atomically.
Failure emits no target document or partial audit.

## Diagnostics and disclosure

Diagnostics are created from a stable allowlist, not from exception text. UI
shows code, severity, safe phase, and already-validated public IDs. `safeContext`
contains only bounded booleans, integers, and enumerated strings such as limits,
counts, and version numbers.

No diagnostic, unified log entry, crash annotation, verification adapter, issue
template, or exported bundle may contain payload excerpts, Lua source, decoded
values, host paths, user names, raw bytes, package/save hashes, reconstructed
values, or restricted identifiers. The exact local package digest appears only
in consent/trust UI and app-managed identity lookup.

An explicit user action may export a diagnostic bundle containing app/build and
schema versions, host-policy version, safe codes/counters, dependency versions,
and synthetic-safe traces. Export runs the same allowlist validator. Unknown
fields reject the bundle rather than being passed through.

## Author tooling

The production repository supplies one `mercenary-content` Swift executable
that shares `GameResources` codecs and exposes:

```text
mercenary-content validate <package>
mercenary-content canonicalize <json> --output <json>
mercenary-content digest <package>
mercenary-content sign <package> --key <key-reference>
mercenary-content inspect <package> [--safe-json]
mercenary-content lua-check <package>
mercenary-content fixture build <definition> --output <package>
```

Commands are noninteractive except signing-key authorization, write through a
fresh output path, and return stable exit categories. `validate` follows
production admission without installing or consenting. `canonicalize` refuses
lossy conversion, duplicate keys, floats, or out-of-range integers. `inspect`
uses the diagnostic allowlist. The CLI cannot grant trust, mutate app consent,
execute a session/migration, designate official content, or claim conformance.

## Verification and fuzzing

Production adapters emit neutral records matching the existing Verification
System and never widen claim semantics. BC-0030 through BC-0036 cover content,
Lua, saves, migration, and containment; BC-0037 covers renderer suspension;
BC-0038 covers supported hosts; BC-0039 covers every untrusted decoder and XPC
state; BC-0040 covers dependency and Lua review.

Every boundary receives limit-minus-one, limit, and limit-plus-one tests.
Golden tests cover MCJ-1, deterministic CBOR, all hash domains, Ed25519, overlay
composition, Execution Environment identity, request replay/gaps, output
backpressure, save acknowledgement, migration source preservation, and
diagnostic redaction.

Sanitizer-backed libFuzzer targets cover package enumeration, MCJ-1, every JSON
Schema family, CBOR, CDDL-shaped envelopes, signatures, Lua compilation and
host values, transition/state/save/migration codecs, diagnostics, and protocol
state. PRs run the fixed regression corpus plus 30 seconds per target; nightly
runs use ten minutes; release candidates use two hours. Every discovered crash
is minimized, public-safety reviewed, and permanently replayed. A known crash
or sanitizer finding blocks release.

On the M1/8 GB Reference Mac, representative official and worst-case synthetic
runs must keep p99 hook time below 62.5 ms, p99 tick time below 250 ms, and peak
measured memory below 75 percent of its applicable ceiling. The hard watchdogs
remain 250 ms and one second. Failure of the four-times-headroom gate blocks
supported-host readiness even when hard containment did not fire.

## Candidate evidence and release boundary

Release automation assembles one candidate-evidence manifest containing exact
build and official Content Set digests, the immutable Conformance Report ID,
fuzz duration/crash status, dependency and Lua review, SPDX/CycloneDX SBOMs,
notarization status, and clearance status for every artifact. Missing, stale,
pending, or failed inputs derive `eligible: false`.

The gate does not hold signing/notarization credentials, submit to Apple,
publish artifacts, close legal questions, or designate a Content Set official.
Those remain explicit maintainer actions. Publication automation must not infer
clearance from technical success or infer Fidelity Conformance from Release
Readiness.

## Failure matrix

| Failure | Required result |
| --- | --- |
| Noncanonical/oversized package input | Reject before typed construction; remove only fresh staging |
| Missing/unknown schema or ABI | Preserve bytes; refuse install/session/load |
| Invalid signature | Reject; never downgrade to unsigned |
| Changed/unsigned key | Require exact-digest capability consent |
| Lua deterministic budget/capability failure | Roll back whole tick and suspend |
| Watchdog or XPC invalidation | End session, lose unsaved progress, no hidden recovery |
| Output queue ceiling | Suspend at completed boundary and drain on same connection |
| Missing exact save environment | Preserve save; no substitution or download |
| Migration failure | Preserve source; emit no target save |
| Renderer failure | Suspend before more ticks; no fallback/headless continuation |
| Unsafe diagnostic field | Reject the diagnostic/export itself |
| Security-floor failure | Preserve affected packages/saves but block execution |
| Evidence/clearance gap | Candidate remains ineligible; no automated publication |

## Acceptance

Issue #13 is implemented when the schemas, CDDL, registries, and vectors pass
`lab implementation validate`; every public interface above has a closed
versioned declaration; links to all governing decisions and BC-0030 through
BC-0040 resolve; the existing research, prototype, and verification suites stay
green; and no tracked artifact contains Restricted Material.

This acceptance establishes an executable implementation contract. It does not
claim that the game has been implemented, that provisional Behavior Cases have
passed, that exact content is cleared, or that a release is eligible.
