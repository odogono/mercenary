# Specification: C64 Reference Build Laboratory

## Objective

Provide researchers and future implementation agents with a repeatable, provenance-backed way to identify, boot, unpack, observe, and inspect the supplied C64 Reference Build. A result is reliable only when it is tied to the exact input hash, emulator build and configuration, scenario, checkpoint state, and artifact hashes.

The supplied program is a crack, not preservation-grade retail media. The laboratory may establish facts about this exact artifact; facts potentially affected by cracking remain provisional until compared with retail media.

## Technology and commands

- macOS 12 or newer, PAL C64 model (`x64sc -model c64`).
- Homebrew VICE 3.10 or newer, using the cycle-accurate `x64sc` executable.
- Homebrew Python 3.13 or newer; laboratory code uses only the standard library.
- Install: `brew bundle --file research/c64-reference-build/Brewfile`.
- Unit tests: `python3 -m unittest discover -s research/c64-reference-build/tests -v`.
- Environment check: `research/c64-reference-build/lab doctor --prg roms/c64.ABC/MERCENARY.PRG`.
- Capture: `research/c64-reference-build/lab capture --prg roms/c64.ABC/MERCENARY.PRG --checkpoint post-unpack`.
- Observe: `research/c64-reference-build/lab observe --prg roms/c64.ABC/MERCENARY.PRG --scenario research/c64-reference-build/scenarios/input-smoke.json`.
- Verify: `research/c64-reference-build/lab verify --run research/c64-reference-build/work/<run-id>`.
- Reproduce: `research/c64-reference-build/lab reproduce --prg roms/c64.ABC/MERCENARY.PRG`.

## Structure and style

- `c64lab/` contains typed Python modules with explicit `LabError` failures at user and process boundaries.
- `config/`, `schemas/`, and `scenarios/` contain versioned, machine-readable contracts.
- `tests/` uses `unittest`; tests describe observable outcomes and use temporary directories for generated data.
- `work/` contains all generated artifacts and is ignored by Git.
- Documentation uses the domain vocabulary in `CONTEXT.md`.

## Testing strategy

Pure validation and protocol encoding receive unit tests. Filesystem verification receives isolated integration tests. A large local test launches the real VICE executable twice and compares normalized post-unpack memory, register, and display evidence. Manual interactive verification supplements this test but does not replace it.

## Boundaries

- Always validate the input before emulator launch, use a bounded cycle limit, bind monitors to loopback, capture the effective tool version/configuration, and hash every generated artifact.
- Ask before committing or publishing any ROM-derived payload or changing the supported machine model.
- Never commit inputs, RAM dumps, snapshots, screenshots, extracted executables, or copied machine code; never describe cracked-build-only evidence as retail-equivalent Authoritative Evidence.

## Success criteria

1. `doctor` validates the supplied PRG and toolchain.
2. `capture` creates a self-verifying post-unpack run with physical RAM, CPU-visible memory, registers, display, monitor log, and a short-lived snapshot.
3. `reproduce` obtains equal normalized evidence from two independent cold starts.
4. The first stable interactive game checkpoint is documented and can accept a bounded keyboard/joystick scenario.
5. Tracked evidence contains hashes and interpretations only; exact laboratory output stays
   under ignored `work/` or `restricted/` storage. The exported Data Payload is the one
   generated artifact that is tracked (ADR 0029).
