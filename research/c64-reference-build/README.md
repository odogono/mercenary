# C64 Reference Build laboratory

This directory is the reproducible research harness for the supplied C64
Reference Build. It establishes facts about one precisely identified ABC/1001
crack; it does not make the crack equivalent to preservation-grade retail
media.

## Quick start

```sh
brew bundle --file research/c64-reference-build/Brewfile
python3 -m venv research/c64-reference-build/.venv
research/c64-reference-build/.venv/bin/python -m pip install \
  -r research/c64-reference-build/requirements.txt
research/c64-reference-build/lab doctor --prg /path/to/MERCENARY.PRG
research/c64-reference-build/lab reproduce --prg /path/to/MERCENARY.PRG
research/c64-reference-build/lab capture --prg /path/to/MERCENARY.PRG --checkpoint interactive
research/c64-reference-build/lab observe --prg /path/to/MERCENARY.PRG \
  --scenario research/c64-reference-build/scenarios/input-smoke.json
research/c64-reference-build/lab verify --run research/c64-reference-build/work/<run-id>
python3 -m unittest discover -s research/c64-reference-build/tests -v
```

### World Geometry Dataset

The geometry commands consume only a verified, conditioned `interactive`
capture. Exact output remains below ignored `work/` or `restricted/` paths.

```sh
research/c64-reference-build/lab geometry extract \
  --run research/c64-reference-build/work/<interactive-run>
research/c64-reference-build/lab geometry verify \
  --dataset research/c64-reference-build/work/<geometry-dataset>
research/c64-reference-build/lab geometry reproduce --prg /path/to/MERCENARY.PRG
research/c64-reference-build/lab geometry compare --prg /path/to/MERCENARY.PRG \
  --dataset research/c64-reference-build/work/<geometry-dataset>
research/c64-reference-build/lab geometry review \
  --comparisons research/c64-reference-build/work/<geometry-dataset>/comparisons \
  --reviewer <maintainer> --decision approved
```

An optional ignored Curated Name overlay may be passed to `extract` with
`--curation`. A verified name must cite Authoritative Evidence. See
[`docs/research/world-geometry-dataset.md`](../../docs/research/world-geometry-dataset.md)
for the schemas, evidence contract, review gate, and redaction rules.

### Behavior Catalogue

Issue #8's public-safe catalogue indexes and trace definitions live under
`catalogue/`. Canonical Behavior Cases live at the repository root under
`verification/cases/`; catalogue validation resolves its BC-0001 through
BC-0021 references there.
Exact evidence is written to ignored content-addressed storage under
`restricted/behavior-catalogue/evidence`; ordinary generated runs stay under
`work/`. Validate the tracked indexes with:

```sh
research/c64-reference-build/lab catalogue verify \
  --catalogue research/c64-reference-build/catalogue
```

`catalogue run` executes a versioned branch trace from the conditioned
interactive checkpoint. Proof traces reject memory injection. Audio traces run
unwarped with an effective configuration capture; D64 media is attached at
branch-process setup in read/write or read-only mode and hashed only after
orderly shutdown. See
[`docs/research/behavior-catalogue.md`](../../docs/research/behavior-catalogue.md).

Semantic proof traces may add typed captures, assertions, and outcome
classification by passing an ignored declarative map with `--observation-map`.
The map supports integer widths and signedness, endianness, masks, shifts,
booleans, enums, and opaque execution-boundary IDs; raw addresses, values, and
reports stay restricted. Stochastic trace
sets use a `stratified-pal` schedule with at least 100 distinct midpoint phases.

Games that scan the C64 keyboard matrix cannot be driven by the monitor's
PETSCII queue. Compile the bounded macOS driver and run it with an ignored
`event-history-capture.schema.json` request against the exact foreground VICE
PID. VICE must be launched with `config/event-history-hotkeys.vhk` and an
isolated `-eventsnapshotdir`; the hotkey file clears VICE's default shortcut
map so the driver's pinned `Command-Shift-R`/`Command-Shift-T` host controls
cannot fall through to media recording. The request contains only the physical
key edges under test and pins the hotkey file by SHA-256. The driver fails
without Accessibility permission, if any modal or auxiliary VICE window is
present, or on any process, executable, focus, timing, identity, or key-balance
mismatch. It emits an identity-bearing JSON report, which remains restricted.

Set `EventStartMode` to `0` (file-save) and `EventImageInclude` to `0` before
recording. For replay, do not use VICE's command-line `-playback` switch: it
can restore the history snapshot before the normal startup reset has settled,
after which that pending reset destroys the restored state. Start each cold
VICE process with `-initbreak ready`, load the pinned hotkey map from the
monitor after `-default` has initialized the UI, resume, and only then invoke
the pinned `history-playback-start` host action. A valid replay log has its
sole `Main CPU: RESET.` before `Unit 8: RESET (For undump).`; a CPU reset after
that restore marker is a hard failure. Compare typed observations with the
recorded end state for two independent replay processes.

```sh
swiftc research/c64-reference-build/tools/capture-keyboard-history.swift \
  -o research/c64-reference-build/work/capture-keyboard-history
research/c64-reference-build/work/capture-keyboard-history \
  restricted/behavior-catalogue/unc-0001/capture-request.json \
  > restricted/behavior-catalogue/unc-0001/capture-report.json
```

### Verification System

Issue #12's platform-neutral schemas and canonical records live under
`verification/`. Validate all tracked cases and their dependency graph with:

```sh
research/c64-reference-build/lab verification validate --root verification
```

The `verification aggregate` command derives applicable cases for an exact
candidate, reuses only matching dependency fingerprints, and writes a
public-safe Conformance Report. `verification render` creates a deterministic
Markdown view on demand; generated Markdown is not tracked. See the
[Verification System](../../docs/verification-system.md).

`doctor` rejects a missing or altered input before VICE starts. It checks the
49,203-byte PRG, its load header/range and all three recorded hashes; Python
3.13+; VICE 3.10+; the PAL `c64` machine model; the fixed seed; and the local
configuration. VICE 3.10's macOS launcher may fail for `-version`, so the
Homebrew formula version is a recorded fallback while the executable and
`-features` output are still hashed.

## Capture procedure

Every emulator process starts with `-default`, `-model c64`, seed `12648430`,
and a 120,000,000-cycle limit. The tool dumps the effective VICE configuration
and records the exact emulator/version/features identity. A 90-second host
timeout is an additional fail-safe.

The deterministic unpack capture boots a clean PAL C64, uses the monitor's
`loadbasic` command, and enters the known packer at `$0820`. This avoids a
macOS command-line autostart readiness race observed in VICE 3.10. Autostart
remains useful for manual observation, but is not the reproducibility path.

At each checkpoint the text monitor explicitly selects `bank ram` for the raw
64 KiB physical-RAM dump, then `bank cpu` for the CPU-visible address space.
This distinction is mandatory: `$0001` banking can expose BASIC/KERNAL ROM or
I/O instead of the underlying RAM. The manifest hashes both views, registers,
monitor logs, effective config, display, snapshot and scripts.

The `interactive` capture stops at `$8477` only after raw RAM `$007F` has become
`$3F`, excluding an earlier startup visit to the same code. `observe` restores
that version-coupled snapshot, waits at the checkpoint through the loopback
binary monitor, and replays bounded PETSCII-buffer and joystick-port-2 actions.
It must not claim physical keyboard holds or matrix-scanned input. The
scenario's human-facing port 2 maps to VICE monitor index 1; the runner selects
VICE's I/O Simulation device and translates pressed bits to active-low lines.

## Artifact policy

Tracked material is limited to tooling, configuration, schemas, scenarios,
hashes, labels/segment maps and prose evidence. `roms/` and `work/` are ignored.
Do not commit or publish PRGs, physical/CPU RAM dumps, VSFs, screenshots,
reconstructed binaries, copied machine code, or any other ROM-derived payload.

Raw physical RAM plus the segment/entrypoint metadata is the durable analyzable
state. VSFs are short-lived replay aids tied to the recorded VICE version;
screenshots are visual corroboration. Issue #5 governs any later decision to
publish reconstructed material.

## Failures and acceptance

A wrong build, invalid scenario, non-loopback monitor, missing dependency,
missed checkpoint, cycle-limit exit, host timeout, malformed monitor response,
escaped artifact path, or artifact hash mismatch is a hard failure. Incomplete
runs are retained under ignored `work/` for diagnosis.

Acceptance requires two independent cold starts with equal post-unpack physical
RAM, CPU-visible memory, registers, checkpoint and selected display data; a
same-version VSF restore; a bounded interactive keyboard/joystick replay; and a
self-verifying manifest for every retained run. The normalized baselines in
`evidence/` record the successful VICE 3.10 run without publishing payloads.
