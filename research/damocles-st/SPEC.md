# Specification: Damocles ST Working Authority Laboratory

## Objective

Provide researchers with a repeatable, provenance-backed way to identify, boot, observe, and inspect the Damocles Atari ST Working Authority. A result is reliable only when it is tied to the exact STX hash, TOS image hash, Hatari build and configuration, scenario, checkpoint, and artifact hashes.

Observations from this laboratory are Working-Authority Evidence. They are not Authoritative Evidence. Authoritative Evidence remains bound to the C64 Reference Build.

The TOS pin is Hatari's bundled EmuTOS 2.06. Real TOS 1.04 is not required for this laboratory. Revisit only if a later mapping ticket shows an EmuTOS-specific mismatch, then re-run `reproduce`.

## Technology and commands

- macOS 12 or newer, Atari ST model (`--machine st`), 1 MiB RAM.
- Homebrew Hatari 2.6.0 or newer. Stock Hatari only; no emulator patches.
- Homebrew Python 3.13 or newer; laboratory code uses only the standard library.
- Install: `brew bundle --file research/damocles-st/Brewfile`.
- Unit tests: `python3 -m unittest discover -s research/damocles-st/tests -v`.
- Environment check: `research/damocles-st/lab doctor`.
- Capture: `research/damocles-st/lab capture --checkpoint title-screen`.
- Observe: `research/damocles-st/lab observe --scenario research/damocles-st/scenarios/title-smoke.json`.
- First world (post-title load for mapping notes): `research/damocles-st/lab observe --scenario research/damocles-st/scenarios/first-world.json`.
- Verify: `research/damocles-st/lab verify --run research/damocles-st/work/<run-id>`.
- Reproduce: `research/damocles-st/lab reproduce`.
- Hatari integration (launches the emulator twice): `DAMOCLAB_INTEGRATION=1 python3 -m unittest research.damocles-st.tests.test_integration -v` from the lab tree, or `DAMOCLAB_INTEGRATION=1 python3 -m unittest discover -s research/damocles-st/tests -v`.

## Structure and style

- `damocleslab/` contains typed Python modules with explicit `LabError` failures at user and process boundaries.
- `config/working-authority.json` identifies the STX and TOS images by size and multi-hash.
- `config/lab.json` pins machine model, Hatari version floor, and the title-screen checkpoint.
- `work/` contains all generated artifacts and is ignored by Git.
- Documentation uses the domain vocabulary in `CONTEXT.md`.

## Testing strategy

Pure validation and protocol encoding receive unit tests. A local integration test launches real Hatari twice when Restricted Material and the toolchain are present.

## Boundaries

- Always validate the STX and TOS images before emulator launch, bind Hatari to a host timeout, capture the effective tool version, and hash every generated artifact.
- Never commit STX, TOS, RAM dumps, snapshots, or screenshots.
- Do not touch `MercenaryKit`, the Targ Data Payload, or the Game Surface.
- Do not build a Damocles Data Payload, extractor, or schema in this laboratory.
- Reproducible checkpoints and observation scenarios that expose world tables for mapping notes (#79–#81) are allowed. Filled-polygon decode, Gamma System inventory, and script/motion/time findings belong in `docs/research/` notes, not in a payload.

## Success criteria

1. `doctor` validates the Working Authority STX, TOS image, and Hatari toolchain.
2. `capture` creates a self-verifying title-screen run with RAM, stable RAM ranges, registers, display, debugger log, and manifest.
3. `reproduce` obtains equal normalized evidence (stable RAM ranges, stable registers, display) from two independent cold starts.
4. The title-screen checkpoint is documented and accepts a bounded keyboard scenario.
5. Tracked evidence contains hashes and interpretations only; generated payloads remain ignored.
