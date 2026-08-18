# The Trace Oracle

The macOS application is the reference implementation until the browser reaches the
opening loop, and the deterministic traces it emits are what the canonical TypeScript
implementation must reproduce to be believed (ADR 0019). This document is the contract
those traces are written against. It is what the browser's replay harness is written
from, and it cannot live in `/traces/`, because that directory is derived from the Data
Payload and is never tracked.

A trace pins behaviour that has been signed off, not behaviour under construction. The
set of scenarios is therefore itself a record: `trace-scenarios.json` at the repository
root is tracked and hand-edited, and a diff to it is the visible moment a maintainer
accepted a new one (ADR 0016).

## Emitting

```sh
swift run mercenary --emit-traces                       # regenerate the whole set
swift run mercenary --emit-traces --only flight         # one emitter
swift run mercenary --emit-traces --scenario opening    # one scenario
swift run mercenary --emit-traces --verify              # re-emit and compare
```

Every diagnostic also takes `--trace PATH`, which writes a Golden Trace of that single
invocation beside its printed report. The report is unchanged either way: `--output`
writes what a person reads and `--trace` writes what a comparison reads, and a command
may be given both. Nothing infers one from the other's file extension.

`--verify` re-emits every selected scenario in memory and compares the bytes against what is
on disk, reporting the first differing line. Nothing is written, so a failed check cannot
leave a half-file behind for the next run to compare against. It also rebuilds the manifest
and compares that, which is a second check on the same claim: the manifest carries every
trace's digest, so a trace compared against a file the manifest never described would still
be caught. A partial run neither writes nor checks `traces/manifest.json`, because a manifest
describing part of the set would claim to describe all of it.

## Two claims, kept apart

**Byte-identity is a claim about this implementation.** The same payload, the same
settings and the same inputs produce byte-identical files. That is what `--verify`
asserts and what #66 asks for.

**Cross-language equivalence is a claim about values.** A TypeScript replay parses the
JSON and compares numbers **bit-for-bit against the recorded ones**. It must not compare
bytes: Swift and JavaScript do not spell the same `double` the same way, so a byte
comparison across languages would fail on formatting rather than on behaviour, and
"fixing" the replay to compare bytes would be a step backwards.

## Numbers

- A `double` is written at **17 significant digits**, which round-trips every binary64
  value. `0.1` reads as `0.10000000000000001`. That is the value, not noise.
- An integer is written as an integer, never `12.0` (ADR 0012's integer-preserving rule).
- `NaN` and infinity are **refused** with an error naming where they were. JSON carries
  neither, and a trace that wrote `null` for one would claim a run reproduced when the
  simulation had come apart.
- Formatting is locale-independent. A comma decimal separator would be invalid JSON and a
  determinism failure that appeared only on some machines.

### Float32 binds the port

`ScreenLine` coordinates are `Float` in the kit. Widening to `double` is exact, so a
projection trace records binary32 quantities written in full binary64 precision: a
`Float` of `0.1` reads as `0.10000000149011612`.

**This is a constraint on ported code, not a curiosity.** A TypeScript projection that
carries double precision all the way to the screen will not reproduce these values. The
port must narrow at the `ScreenLine` boundary — `Math.fround` on each of `x1`, `y1`, `x2`,
`y2` — because that is where the Swift implementation narrows.

## File shape

JSON Lines. The first line is the header; every line after it is one record. One record
per line is what makes a divergence report as a line number — "step 412 diverged" — rather
than "the file changed".

Files live at `traces/<emitter>/<id>.jsonl`, with `traces/manifest.json` for the run.

### Object keys

Keys are sorted by the writer, always, so no dictionary's iteration order can reach a
file. Numeric keys sort as numbers, so slot 9 precedes slot 10. `-` is the removal key in
a delta and cannot collide with a field, because every field is a name or a number.

### The clock

- `step` is an **integer** and is the key on every record. A replay drives by it.
- `dt` is in the header. Behavioural emitters use `1/60`.
- `elapsed` is recorded per record as an **asserted output**, not a key. Every diagnostic
  accumulates `elapsed += dt`, so after 1,800 sixtieths it is not `30`, and the core
  consumes that accumulated value. A replay that keyed off it would diverge on the order
  of its additions rather than on anything the simulation did. Recorded as an output, it
  proves the accumulation matched.

### Inputs are recorded, not reimplemented

Every behavioural record carries the **input applied at that step**, and inputs that are
not intents — a scheduled boarding, a throttle notch, a keypress, a facing — get their own
`command` record at the step they were applied.

An *outcome* is not an input, and is not recorded as a command. Boarding reached by walking
to a craft and reaching for it is recorded as a `note` on the step it happened, because the
input was the intent to walk: a replay that fed the recorded intents would reach the craft
by itself, and a `command` telling it to board would let a broken interaction rule pass.

This matters because the drivers are feedback loops rather than input scripts. The flight
circuit corrects toward an attitude it reads back off the craft; the opening rehearsal
steers with an `atan2` and an alignment threshold. A replay that had to reproduce the
*driver* would be testing the driver's arithmetic, and a driver bug would present as a
core divergence. Recording the applied input makes a replay a pure function of the trace.

### Header, then changes

The header carries the full starting state under `initial`. Each record carries `changed`,
a **recursive structural diff** against the previous state: objects diff member by member,
anything else that differs is written whole, and removed members are listed under `-`.

A replay reconstructs by folding changes forward. An absent `changed` means nothing moved.
The reason is the readable diff: `residence` alone is 64 entries that change on a handful
of steps out of eighteen hundred.

## The emitters

Layered in the port's dependency order (#68), so each replay gate can go green with only
its own dependencies ported.

| Emitter | Needs ported | What one record is |
|---|---|---|
| `decode` | payload, text, world | one decoded subject |
| `projection` | + projection | one screen line, or one far point |
| `flight` | + gameCore, flight, orientation | one fixed step of a circuit |
| `game-core` | same | one fixed step of a scripted walk |
| `benson` | benson trio, text — **no world** | one executed instruction |
| `session` | everything | one fixed step of the whole loop |
| `navigation` | everything + rooms | one fixed step of an underground walk |

### `decode`

No clock and no `dt`. Records are `craftParameterBlock`, `controlLoopRules`, `walk`,
`object`, `cell`, `structure`, `room` and `placement`. The Craft Parameter Blocks are here
rather than in `flight` because they are decoded numbers: the decode gate should be able to
check them before a mover exists.

### `projection`

Segments, not pixels. ADR 0011 already refused raster thresholds, and a PNG comparison
fails on antialiasing that means nothing while passing a line drawn in the wrong ink. The
PNG modes stay for visual review.

The header carries the resolved camera, the viewport (explicit — the same pose against a
different viewport is a different trace), and the backdrop: horizon and ground fill
outdoors, the indoor scene and column count underground. Records follow the pipeline's own
order. The renderer batches by ink into two passes; that is a choice about draw calls, not
a property of the projection, so it is not what gets pinned.

**A dark Room has no line records at all.** That is the claim — the Reference Build zeroes
every colour it draws with — and not an omission.

### `benson`

One record per executed instruction, from an observer inside the interpreter. Running with
a one-instruction budget would have traced a *different* execution, because the budget
stands in for the frame boundary the original interpreter had for free.

Instructions are named with the payload's own mnemonics — `msg`, `wfr`, `tstk` — so a trace
reads beside `benson.json`.

**What an instruction read is not recorded.** It does not need to be: the header carries
the whole of the interpreter and host state, each record carries what changed, so every
value an instruction could have consulted is reconstructible at the moment it ran — and
which way a test branched is the next record's `pc`. Recording reads would mean a second
description of every opcode, kept in step with the first and duplicated by anything
reproducing the trace, to say what the operands already say.

There is no world here, so a scenario declares a **synthetic Host Callout** and, optionally,
**writes scheduled at named times**. Without them, `testRoom`, `testCraft`, `testInventory`
and `testObjectInRoom` answer the same way every run and the trace would pin one path
through each script.

`maxInstructions` bounds a trace, and **when it trips the trace says so** in a final
`stopped` record. This is not tidiness: the Reference Build's scripts end on a jump to
themselves, and a parked script spends its whole instruction budget on that jump every
step. Script 1 traced for two minutes is 3.5 million records of `jmp 94`. A trace that
stopped early *silently* would compare clean against a port that stopped early for a
different reason.

## `traces/manifest.json`

Records what the run as a whole was, so a moved trace's first question — the code, the
payload, or the tuning? — is answered by a diff:

- `manifestVersion`, `traceSchemaVersion`, `scenarioSchemaVersion`
- `payload`: `sourceDatasetId`, `sourceCoreDigest`, `decoderVersion`, `schemaVersion`, and
  the `sha256` of `payload/manifest.json`. Taken verbatim from the payload's own manifest
  rather than recomputed; that file lists every payload file's own digest, so one value
  transitively pins the content without a second hashing scheme.
- `settings`: the tuned values **as resolved**, plus the settings file's digest. Resolved
  rather than copied verbatim, because a settings file may name only what it changes and a
  verbatim copy of a file that omits `timeScale` would not record the time scale the run
  used — the number most likely to explain why a trace moved.
- `dt`, `scenarios` (a count per emitter), and `files`: per trace its `emitter`, `id`,
  relative `path`, `sha256`, `size` and `records`.

Paths are relative to the trace root. An absolute path would make every manifest differ
between checkouts and turn a determinism check into a comparison of where the repository
happens to live.

## Where the code is

- `MercenaryCLI/TraceValue.swift` — the canonical writer. Outside the kit, because the kit
  is the surface the browser reproduces and the browser only ever *reads* these files.
  `JSONEncoder` cannot be used: `Encodable` has no way to emit a raw number, so a
  17-digit `double` would have to go out as a string.
- `MercenaryCLI/TraceDelta.swift` — the recursive diff and the fold that undoes it.
- `MercenaryCLI/TraceFile.swift` — JSON Lines, digests, and line-level comparison.
- `MercenaryKit/TraceScenarios.swift` — the catalogue, read strictly: an unknown field is
  refused by name, because a scenario is the same kind of instruction as a command line
  and a misspelled `craft` would otherwise trace the default craft and report success.
- `Mercenary/Trace*.swift`, `Mercenary/*Trace*.swift` — the emitters and the record shapes.
