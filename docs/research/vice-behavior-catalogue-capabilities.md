# VICE 3.10 capabilities for the Behavior Catalogue

## Question and source basis

This note records which VICE 3.10 facilities can support issue #8's repeatable
behavior traces: machine-state capture, timing, audio and SID evidence, and
writable D64 save media. It is based only on VICE's upstream manual and the
official `vice-3.10.tar.gz` release (SHA-256
`8e5bac18cbcb9f192380ad3ef881f8790f5b75c41d7b3da65d831985d864d6d1`).
The release archive was checked directly where the manual does not expose an
implementation detail. [VICE 3.10 release archive](https://sourceforge.net/projects/vice-emu/files/releases/vice-3.10.tar.gz/download)

## Binary-monitor evidence

VICE's binary monitor API v2 is sufficient for deterministic, request-correlated
state capture. It can discover bank and register identifiers, read or write an
inclusive memory range in a named bank, read or set registers, create conditional
load/store/execute checkpoints, get the indexed display buffer and palette, feed
PETSCII keyboard input, drive a configured joyport I/O Simulation device, advance a requested number of
instructions, save or restore a snapshot, reset or power-cycle the machine, and
autostart a file. Responses echo the client's request ID; unsolicited events such
as checkpoint hits use request ID `0xffffffff`. Clients must use the advertised
register and bank names rather than assuming numeric IDs are stable.
[Binary monitor protocol and command index](https://vice-emu.sourceforge.io/vice_13.html#SEC345)
[memory and bank discovery](https://vice-emu.sourceforge.io/vice_13.html#SEC350)
[register discovery](https://vice-emu.sourceforge.io/vice_13.html#SEC369)
[display capture](https://vice-emu.sourceforge.io/vice_13.html#SEC370)

The joyport monitor command does not drive VICE's ordinary host-joystick device.
The runner must select VICE 3.10's `Joyport I/O simulation` device for control
port 2 and translate the trace's pressed-bit mask to the C64's active-low
electrical lines. A successful monitor response without that device selection
does not prove that the emulated machine observed the requested input.

## Physical keyboard and VICE event history

The binary monitor's PETSCII feed writes VICE's keyboard buffer; it cannot prove
software that scans the C64 keyboard matrix directly, nor can it represent an
exact host key down, key up, chord, or hold. VICE event recording, by contrast,
records keyboard activity and writes start/end snapshots around a history. The
laboratory therefore supplies a bounded macOS `CGEvent` driver plus an isolated
hotkey file for starting, stopping, and replaying VICE event history.
[keyboard feed](https://vice-emu.sourceforge.io/vice_13.html#SEC365)
[event history](https://vice-emu.sourceforge.io/vice_11.html)

The driver refuses to run without Accessibility permission, an exact positive
VICE PID and executable digest, the `x64sc` window owner, continuous foreground
focus, ordered balanced key edges, and a duration no longer than 60 seconds. Its
request is validated by `event-history-capture.schema.json`; its report records
the VICE and driver executable identities, requested and actual event times, and
the number of focus checks. Requests and resulting histories are Restricted
Material. Proof replays start from the reproduced checkpoint and exact recorded
VICE configuration and compare typed semantic observations, not playback success
or snapshot hashes alone. `lab catalogue verify-history` enforces exactly two
distinct cold starts, capture/replay executable and start-state identity,
effective-configuration and opaque input-setup equality, reset ordering, and
identical typed end observations; its result omits raw histories, paths, logs,
physical keys, and the restricted input setup itself.
The bounded `replay-keyboard-history.swift` helper activates only the pinned
VICE PID, verifies the executable, start snapshot, hotkey map, sole main
window, and Accessibility grant, triggers playback after monitor preparation,
and checks foreground focus throughout the requested replay interval.

The C64/6510 register list in the 3.10 source includes `LIN` and `CYC`, so each
stopped boundary can record PAL raster line and cycle alongside the CPU
registers. `Advance Instructions` counts instructions, not cycles. VICE 3.10
also added `CPU History`, whose records include an eight-byte CPU clock and the
instruction's register state and bytes, but CPU history is a compile-time
option (`--enable-cpuhistory`) and uses a bounded cyclic buffer. The catalogue
runner requests the latest history record at each stopped action boundary and
records its absolute clock alongside `LIN`, `CYC`, and client instruction
counts. It rejects a missing or malformed clock, and does not make CPU history
the only source of boundary ordering. [register and instruction commands](https://vice-emu.sourceforge.io/vice_13.html#SEC358)
[CPU History](https://vice-emu.sourceforge.io/vice_13.html#SEC372)
[VICE 3.10 release source](https://sourceforge.net/projects/vice-emu/files/releases/vice-3.10.tar.gz/download)

There is no binary-monitor command for "wait N frames" or "wait until this
memory value satisfies a predicate." Those trace actions need to compile to
bounded instruction advances plus register/memory reads, or to a checkpoint on
the responsible code or memory access followed by a condition. Sending a
binary command itself enters the monitor and pauses emulation, so host elapsed
time around monitor traffic is not emulated elapsed time. Record host monotonic
time only as orchestration telemetry; use CPU clock, raster position, requested
instruction counts, and game state for reproducible evidence.
[Advance Instructions](https://vice-emu.sourceforge.io/vice_13.html#SEC364)
[checkpoint set](https://vice-emu.sourceforge.io/vice_13.html#SEC353)
[binary-monitor exchange semantics](https://vice-emu.sourceforge.io/vice_13.html#SEC348)

`Memory set` makes injected discovery states feasible, but the protocol does
not distinguish a legitimate action from a probe. The laboratory must enforce
`probe` mode itself and propagate that provenance so injected evidence cannot
verify a Catalogue Entry. Memory reads also carry a side-effects flag and a
bank ID; normal capture should use side-effect-free reads and explicitly select
physical RAM versus CPU-visible memory, preserving the repository's existing
banking rule. [Memory get and set](https://vice-emu.sourceforge.io/vice_13.html#SEC350)

The monitor `Dump` and `Undump` commands save and restore VSF snapshots; `Dump`
can request ROM and attached-disk state. Snapshots include the machine's memory
configuration, but upstream explicitly rejects the idea of snapshots as
permanent storage because module compatibility cannot be maintained reliably.
Use VSFs only as same-build branch accelerators, record whether disks/ROMs were
embedded, and retain raw state plus metadata as the durable evidence.
[binary snapshot commands](https://vice-emu.sourceforge.io/vice_13.html#SEC360)
[snapshot compatibility warning](https://vice-emu.sourceforge.io/vice_9.html#SEC288)

## Unwarped WAV and SID-write capture

VICE exposes command-line resources for sound enablement, sample rate, channel
mode, playback device, recording device, and their file arguments. The `wav`
recording driver writes 16-bit RIFF/WAV samples. SID engine, chip model, filter,
and reSID sampling options are independently selectable, so a run can pin and
then record the effective values. Available sound drivers depend on how VICE was
compiled and the requested sample rate may be replaced by the nearest supported
rate; the laboratory must feature-test the drivers and inspect the produced WAV
header/effective configuration instead of trusting requested values.
[sound resources and recording drivers](https://vice-emu.sourceforge.io/vice_6.html#SEC105)
[sound command-line options](https://vice-emu.sourceforge.io/vice_6.html#SEC106)
[SID resources](https://vice-emu.sourceforge.io/vice_7.html#SEC171)
[SID command-line options](https://vice-emu.sourceforge.io/vice_7.html#SEC172)

For a single run that produces both rendered audio and register events, configure
`dump` as the playback device and `wav` as the distinct recording device. In the
3.10 source, `dump` receives every sound-chip register write and writes
`clock address value` records, while the WAV recorder receives the generated
sample buffer. The dump device is mono and its clock is formatted after a cast
to C `int`, so long traces can wrap the textual clock (roughly 36 minutes at
PAL C64 frequency on a 32-bit `int`). Segment captures well below that bound,
record the segment's starting CPU clock, and parse the event file as restricted
evidence rather than a portable SID format.
[documented `dump` and `wav` drivers](https://vice-emu.sourceforge.io/vice_6.html#SEC105)
[VICE 3.10 `sounddump.c` and `soundwav.c` in the release archive](https://sourceforge.net/projects/vice-emu/files/releases/vice-3.10.tar.gz/download)

Audio-fidelity runs should explicitly disable warp (`+warp`) and cap speed at
100 percent. Warp removes the speed limit, turns sound output off, and reduces
display refresh; `SoundEmulateOnWarp` can keep chip emulation active but does
not make a warped capture real-time audio evidence. End recording through a
clean resource change or orderly VICE shutdown because the WAV driver patches
RIFF and data lengths when it closes; a killed process can leave an invalid
header. [performance and warp behavior](https://vice-emu.sourceforge.io/vice_6.html#SEC90)
[sound in warp mode](https://vice-emu.sourceforge.io/vice_6.html#SEC105)
[VICE 3.10 WAV writer source](https://sourceforge.net/projects/vice-emu/files/releases/vice-3.10.tar.gz/download)

## Disposable D64 media and save/load automation

VICE supports D64 images as attached writable storage on units 8 through 11.
At process start, `-8 <path>` attaches unit 8, while `-attach8rw` requests
read/write operation and `-attach8ro` requests read-only operation. A host file
without write permission is presented as a write-protected disk. The bundled
`c1541` tool can deterministically create a formatted disposable image with
`c1541 -format "name,id" d64 disk.d64`, list it, validate it, and read files
back for assertions. [command-line disk attachment](https://vice-emu.sourceforge.io/vice_2.html#SEC50)
[disk-image behavior](https://vice-emu.sourceforge.io/vice_4.html#SEC77)
[c1541 commands and examples](https://vice-emu.sourceforge.io/vice_14.html#SEC391)

The binary protocol has no attach-only or detach command. Its `Autostart /
autoload` command loads a program and is not a neutral media swap. Therefore a
catalogue trace should treat disk identity as branch setup: make a fresh D64
copy, attach it on VICE launch (or before the branch's same-version snapshot),
then drive the game's save/load UI through ordinary keyboard/joystick input.
Runtime disk swapping would require a separately controlled text monitor or a
new VICE integration surface and should not be implied by the binary trace
schema. [binary command index](https://vice-emu.sourceforge.io/vice_13.html#SEC349)
[Autostart / autoload](https://vice-emu.sourceforge.io/vice_13.html#SEC379)

Save tests should cover a writable fresh disk, a write-protected image, no
attached image, and an invalid/non-D64 input as separate cold starts. For each
case, retain VICE logs and hashes of the image before and after the run. Stop
VICE cleanly before hashing or inspecting a D64 with `c1541`, so the test never
reads media concurrently with the emulator. For future-state equivalence, load
from an independently copied saved D64 in a new process and compare selected
semantic memory and display observations; do not use the VSF that produced the
save as proof of the disk load path.

## Reproducibility constraints for the catalogue runner

- Start every evidence process with `-default`, an explicit `-model c64`, fixed
  seed, bounded `-limitcycles`, explicit PAL/model/SID/audio settings, and an
  isolated run directory. Dump and hash the effective configuration, executable,
  VICE version/revision/features, trace definition, PRG, and any D64 input.
  VICE documents `-default`, `-features`, `-seed`, `-limitcycles`, and
  `-dumpconfig` as command-line controls.
  [initialization options](https://vice-emu.sourceforge.io/vice_2.html#SEC50)
- Bind the binary monitor to a newly allocated IPv4 loopback port and reject any
  non-loopback address. VICE allows the address to be configured and does not
  itself impose that safety policy.
  [monitor command-line options](https://vice-emu.sourceforge.io/vice_6.html#SEC139)
- Discover registers/banks and verify required commands at startup. In
  particular, treat CPU history and recording-driver availability as optional
  build features, and fail a requested evidence mode rather than silently
  degrading it.
- Bound every resume with a checkpoint, instruction budget, cycle limit, and
  host timeout. A frame or memory wait implemented by polling must also have an
  explicit maximum instruction count.
- Hash captures immediately into the ignored content-addressed evidence store.
  Keep WAV, SID event logs, VSFs, displays, disk images, memory, and decoded
  payloads restricted; tracked records should expose only safe semantics,
  configuration identities, hashes, sizes/durations, and opaque store pointers.
- Repeat deterministic traces from two independent power cycles. Snapshots may
  fan out branches only after that cold-start checkpoint has itself been
  reproduced and only under the exact recorded VICE build and configuration.

## Implementation-impacting caveats

1. Frame waits and memory predicates are catalogue-runner abstractions, not
   native binary-monitor primitives.
2. The binary monitor pauses execution for command processing; host wall-clock
   intervals cannot stand in for emulated timing.
3. Total CPU clock is available through CPU history only when that optional
   feature is compiled in. `LIN`/`CYC` and client-counted instruction advances
   remain the portable boundary measurements.
4. Runtime disk attachment is absent from the binary API. Prefer disk-per-process
   branch setup; do not overload autostart as a media swap.
5. WAV plus SID-write capture is possible with `dump` playback plus `wav`
   recording, but is mono, build-dependent, and the dump clock can wrap.
6. WAV headers require orderly close, D64 evidence requires orderly emulator
   shutdown before inspection, and VSFs are version-coupled temporary aids.
7. VICE can perform memory injection but cannot enforce evidentiary legitimacy;
   `probe` provenance and the prohibition on verification are laboratory rules.
