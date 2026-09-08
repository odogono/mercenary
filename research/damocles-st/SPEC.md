# Specification: Damocles ST Working Authority Laboratory

> Catalogue extension: ADR 0039 now permits a separate geometry/catalogue extractor
> and read-only app viewer. Earlier exclusions below describe the original lab
> scope; the script decoder remains research instrumentation and gameplay is deferred.


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
- Deadline clock (idle dual capture for #81): `research/damocles-st/lab observe --scenario research/damocles-st/scenarios/deadline-clock.json`.
- Outdoor palette dual capture (#79): `research/damocles-st/lab observe --scenario research/damocles-st/scenarios/outdoor-palette.json`.
- Stick walk toward building (#79; drives locomotion by memwriting the joystick-1 soft-copy `$79C2`): `research/damocles-st/lab observe --scenario research/damocles-st/scenarios/walk-toward-building.json`.
- Approach spaceport pad (#79; near cyan-window building): `research/damocles-st/lab observe --scenario research/damocles-st/scenarios/approach-spaceport-pad.json`.
- Script dispatch loop (#81, #85; disassembles the script interpreter at the world-load state): `research/damocles-st/lab observe --scenario research/damocles-st/scenarios/script-dispatch.json`.
- Verify: `research/damocles-st/lab verify --run research/damocles-st/work/<run-id>`.
- Reproduce: `research/damocles-st/lab reproduce`.
- Export addressed RAM windows for a Working Disassembly: `research/damocles-st/lab export --run research/damocles-st/work/<run-id> --window script-bank`.
- Find instructions naming one absolute address: `research/damocles-st/lab xref --run research/damocles-st/work/<run-id> --address 0x781E`.
- Decode the Damocles Script bank into a readable listing: `research/damocles-st/lab script --run research/damocles-st/work/<run-id>`.
- Hatari integration (launches the emulator twice): `DAMOCLAB_INTEGRATION=1 python3 -m unittest research.damocles-st.tests.test_integration -v` from the lab tree, or `DAMOCLAB_INTEGRATION=1 python3 -m unittest discover -s research/damocles-st/tests -v`.

## Structure and style

- `damocleslab/` contains typed Python modules with explicit `LabError` failures at user and process boundaries.
- `config/working-authority.json` identifies the STX and TOS images by size and multi-hash.
- `config/lab.json` pins machine model, Hatari version floor, the title-screen checkpoint, and the named `exportWindows` a Working Disassembly cuts from a RAM dump.
- `work/` contains all generated artifacts and is ignored by Git.
- Documentation uses the domain vocabulary in `CONTEXT.md`.

## Testing strategy

Pure validation and protocol encoding receive unit tests. A local integration test launches real Hatari twice when Restricted Material and the toolchain are present.

## Boundaries

- Always validate the STX and TOS images before emulator launch, bind Hatari to a host timeout, capture the effective tool version, and hash every generated artifact.
- Never commit STX, TOS, RAM dumps, snapshots, or screenshots.
- Do not touch `MercenaryKit`, the Targ gameplay documents, or the Game Surface.
- Do not build a Damocles gameplay Data Payload, extractor, or schema in this laboratory. The
  typography-only exception in ADR 0021 may consume verified display evidence through the
  cross-title typography exporter; its generated glyph data and WOFF2 travel in the tracked
  Data Payload (ADR 0029), while its laboratory inputs stay ignored.
- Reproducible checkpoints and observation scenarios that expose world tables for mapping notes (#79–#81) are allowed. Filled-polygon decode, Gamma System inventory, and script/motion/time findings belong in `docs/research/` notes, not in a payload.
- A Working Disassembly is targeted and question-driven: exported windows, `xref` reports, `disassemble` listings, and `script` decodes stay inside the ignored `work/` tree, and only decoded facts reach `docs/research/` notes with provenance. Read for structure, never copy or mechanically translate (ADR 0002). See `docs/research/damocles-gap.md`.
- `script` is research instrumentation, not an extractor: it may emit a human-readable report only. It must never gain a machine-readable output, a payload writer, or a schema — a Damocles Data Payload stays out of scope until after *The Second City* (ADR 0021).

## Success criteria

1. `doctor` validates the Working Authority STX, TOS image, and Hatari toolchain.
2. `capture` creates a self-verifying title-screen run with RAM, stable RAM ranges, registers, display, debugger log, and manifest.
3. `reproduce` obtains equal normalized evidence (stable RAM ranges, stable registers, display) from two independent cold starts.
4. The title-screen checkpoint is documented and accepts a bounded keyboard scenario.
5. Tracked evidence contains hashes and interpretations only; exact laboratory output stays
   under ignored `work/` or `restricted/` storage. The exported Data Payload is the one
   generated artifact that is tracked (ADR 0029).
