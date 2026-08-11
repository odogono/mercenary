# C64 Reference Build laboratory

This directory is the reproducible research harness for the supplied C64
Reference Build. It establishes facts about one precisely identified ABC/1001
crack; it does not make the crack equivalent to preservation-grade retail
media.

## Quick start

```sh
brew bundle --file research/c64-reference-build/Brewfile
research/c64-reference-build/lab doctor --prg /path/to/MERCENARY.PRG
research/c64-reference-build/lab reproduce --prg /path/to/MERCENARY.PRG
research/c64-reference-build/lab capture --prg /path/to/MERCENARY.PRG --checkpoint interactive
research/c64-reference-build/lab observe --prg /path/to/MERCENARY.PRG \
  --scenario research/c64-reference-build/scenarios/input-smoke.json
research/c64-reference-build/lab verify --run research/c64-reference-build/work/<run-id>
python3 -m unittest discover -s research/c64-reference-build/tests -v
```

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
binary monitor, and replays bounded PETSCII and joystick-port-2 actions. The
scenario's human-facing port 2 maps to VICE monitor index 1.

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
