# VICE research basis

The laboratory uses primary upstream VICE documentation as its source of truth.

- VICE's [command-line documentation](https://vice-emu.sourceforge.io/vice_2.html) defines autostart, console test mode, bounded cycle execution, version/features reporting, and exit screenshots.
- The [monitor manual](https://vice-emu.sourceforge.io/vice_12.html) defines checkpoints, command playback, explicit memory banks, raw `bsave` output, snapshots, and screenshots. Physical RAM and CPU-visible address space must be captured separately because C64 ROM and I/O banking changes what the CPU sees.
- The [binary monitor protocol](https://vice-emu.sourceforge.io/vice_13.html) supplies request-correlated register/memory/display access, keyboard feed, joystick state, checkpoints, and snapshot control. It is bound to loopback only.
- VICE explicitly warns that [snapshots are not permanent storage](https://vice-emu.sourceforge.io/vice_9.html). The laboratory therefore treats raw RAM plus metadata as durable analysis input and VSF snapshots as version-coupled conveniences.
- [Event history](https://vice-emu.sourceforge.io/vice_11.html) covers keyboard and joystick events but may diverge during playback. The laboratory uses bounded binary-monitor scenarios for machine-readable input and retains event history only as optional corroboration.

The supported installation is deliberately pragmatic rather than hermetic: `brew install vice` with a minimum version check. Each run records the exact VICE version, features, and effective configuration, so comparisons are qualified by the observed toolchain.

VICE 3.10 is the verified baseline. On this arm64 macOS host, Homebrew's
`x64sc -version` launcher fails while reconstructing its executable path; the
laboratory therefore requires `-features` to succeed, hashes the actual binary,
and records `brew list --versions vice` as the version source. This is a tested
fallback, not permission to accept an unknown executable.

For an upstream DMG installation, invoke its terminal launcher under `bin/x64sc`
directly. Upstream [bug 2193](https://sourceforge.net/p/vice-emu/bugs/2193/)
reports that macOS `open ... --args` can discard arguments. Also, `-console`
means test-program console behavior rather than a display-free GTK backend;
[bug 2207](https://sourceforge.net/p/vice-emu/bugs/2207/) records GTK startup
failure without a display. The current lab is local macOS automation, not a
claim of headless CI support.

The binary protocol's wait primitive is instruction-counted, so scenarios name
it `wait_instructions`; the emulator-wide `-limitcycles` remains the hard cycle
bound. The protocol exposes control ports with zero-based identifiers even
though scenarios use the C64's user-facing joystick port 2.

## Laboratory keyboard-matrix extension

Host keyboard translation cannot reliably express simultaneous C64 matrix
keys on macOS. For restricted semantic-input experiments, the laboratory may
build the pinned VICE 3.10 source archive after applying
`patches/vice-3.10-keyboard-matrix-monitor.patch`. The generic patch adds binary
monitor command `0xA3`: its request is exactly 16 one-byte row masks, applied
atomically to the emulated matrix, latched immediately, and recorded through
VICE's existing `EVENT_KEYBOARD_MATRIX` history path. Its empty response also
uses type `0xA3`. Readback command `0xA4` takes no body and returns the 16
currently latched row masks for fail-fast injection checks. No game-specific
rows, columns, addresses, or decoded values belong in the patch or tracked
callers.

Command `0xA5` submits one VICE host-key queue event as a little-endian
32-bit key symbol, a 16-bit mask restricted to VICE's seven keyboard modifier
bits, and a one-byte pressed flag. This bypasses macOS focus translation while
retaining VICE keymap, queue, latch, and event-history behavior. Its empty
response also uses type `0xA5`; acknowledgment proves queue admission only,
not semantic dispatch.

`run_phase_aligned_matrix_sequence` applies ignored declarative schedules at
decoded CPU boundaries. It records the scanner entry, each matrix transition,
and the required semantic handler with the actual PAL line and cycle registers.
The generic sequencer contains no Reference-specific addresses or matrix rows,
requires a bounded instruction search, and returns the matrix to neutral on
both success and failure. A chained schedule may declare `startAtCurrent` only
when the prior handler leaves the CPU stopped at the next scanner entry;
the sequencer verifies that PC before accepting any input. Restricted schedules
supply all decoded details. Held-input schedules may require a bounded
`handlerOccurrences` count; every occurrence records its own PAL registers and
the matrix remains active until the final required handler, then neutralizes.

`run_held_host_key_sequence` covers keys that must remain latched across input
scans. It queues one VICE host-key press, requires a bounded number of decoded
handler occurrences through temporary checkpoints, records absolute CPU clocks
and PAL registers, and releases the key even when the sequence fails. Use
`summarize_pal_cadence` to validate retained timeline clock deltas against their
PAL progression and emit only exact public-safe interval summaries.

The source archive must hash to
`8e5bac18cbcb9f192380ad3ef881f8790f5b75c41d7b3da65d831985d864d6d1`.
On current macOS SDKs, apply `patches/vice-3.10-macos-dyld-header.patch` as a
build-only compatibility fix. Evidence must record the source, both applied
patch hashes, built executable hash, effective configuration, and actual input
setup. The extension changes only how laboratory input reaches the existing
emulated matrix; typed semantic observations, repeated cold starts, and event
history replay remain the proof rather than command acknowledgment alone.
