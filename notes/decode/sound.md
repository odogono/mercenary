# Sound: native SID programs and control paths

This note records the sound facts that can currently be recovered from the
project's configured **Reference Build**. It deliberately does not claim a
closed audible inventory yet. Static control flow and the existing guarded
decoders identify the SID writers and their callers, but the required two-cold-run
WAV/register observations have not been made for all reachable play.

The authority used here is the ABC/1001 build whose SHA-256 is
`ff725f37a7dc131396272d75625f7397aafecc15b158626c0a9165f2607808f3`, as pinned
in [`config/reference-build.json`](../../research/c64-reference-build/config/reference-build.json).
The observations below were re-read from verified initialized RAM
`04076f2abf5d043990cb26c3392ef548bca204df5dfc897a8180d0061f24ca6d`
in run `interactive-20260812T211601Z-3d788cd6`. The Reference Disassembly was
used only to locate and explain routines; no bytes or values were taken from it.
The build remains a provisional crack, so a crack-sensitive contradiction from
preservation-grade retail media still goes through the Fidelity Contract.

No WAV, SID event log, snapshot, RAM dump, or other Restricted Material is
reproduced here. Those artifacts remain under ignored `work/` or the restricted
evidence store, as required by [ADR 0004](../../docs/adr/0004-gate-sensitive-publication-on-qualified-review.md),
[ADR 0017](../../docs/adr/0017-keep-the-research-repository-private.md), and the
laboratory's [artifact policy](../../research/c64-reference-build/README.md#artifact-policy).

## The three Benson stores are stops

The old issue premise was backwards: `benson.soundStores == 3` is not an
inventory of three playable sounds. The guarded decoder recognizes any Benson
`stor` into `$D400-$D41F` as a named SID register write
([`c64lab/benson.py`](../../research/c64-reference-build/c64lab/benson.py),
`SID_BASE`, `SID_TOP`, and `SID_REGISTERS`). Decoding all 51 entries produces
exactly these three reachable writes:

| Benson context | SID write | Meaning established by the written value |
| --- | --- | --- |
| Script 00, after `MANUAL CONTROL` and before the landing verdict | voice 1 control (`$D404`) = `$00` | stop/gate-off request |
| Script 07 Ending loop, after `GAME OVER` | voice 1 control (`$D404`) = `$00` | stop/gate-off request |
| Same Ending loop | voice 2 control (`$D40B`) = `$00` | stop/gate-off request |

The Benson handler at `$8D0D-$8D21` is self-modifying: it copies the script's
16-bit destination into the operand of the store at `$8D1C`, then performs the
write. That is why an initialized live image may show the most recently patched
destination at `$8D1D-$8D1E`; the decoder, rather than that mutable operand, is
the stable census. The terminal pair and its repeating wait are independently
guarded by `census_terminal_dispatches` in
[`c64lab/endgame.py`](../../research/c64-reference-build/c64lab/endgame.py).

Playable sound is therefore native engine behavior. It lives in the selector
dispatcher at `$B93A-$B984`, the two lift profiles at `$AF3A-$AF6D`, the craft
modulation path at `$B5D8-$B61C`, and the Benson Display interrupt at
`$8DC3-$8E1A`.

## SID baseline and reachable writers

`$B910-$B920` copies 25 bytes from `$B921-$B939` into `$D400-$D418`, then writes
`$41` to voice 3 control (`$D412`). Decoded by register, the baseline is:

| Area | Initial values |
| --- | --- |
| voice 1 | frequency `$0080`, pulse width `$0800`, control/AD/SR `$00/$00/$00` |
| voice 2 | frequency `$0080`, pulse width `$0800`, control/AD/SR `$00/$00/$00` |
| voice 3 | frequency `$0000`, pulse width `$0800`, control/AD/SR `$41/$00/$F0` |
| filter and output | cutoff `$000`, resonance/routing `$00`, mode/volume `$0F` |

This routine is reached from `$AED3` when the scene presentation settles. The
effective capture is PAL/50 Hz, 48 kHz, single-SID, filters enabled, SID engine
`1`, SID model `0`, and volume 100. The laboratory pins the PAL `c64` model in
[`config/lab.json`](../../research/c64-reference-build/config/lab.json) and the
capture procedure in
[`c64lab/laboratory.py`](../../research/c64-reference-build/c64lab/laboratory.py).
It dumps the remaining effective VICE resources rather than assuming their
defaults. That exact effective configuration must travel with every listening
comparison; the numeric VICE engine/model values must not be silently translated
into a different browser synthesis model.

The complete locator-confirmed runtime SID write surface in the initialized
program is:

- `$8D1C`: Benson's dynamically addressed SID store.
- `$8DCD` and `$8DF9`: voice 3 frequency-high silence/update during Benson
  Display scanout.
- `$922B` and `$94D3`: voice 1 control `$00` during Room setup and accepted
  Doorway handling.
- `$AF45` and `$AF4E`: bulk lift-profile writes and voice 2 control `$15`.
- `$B607` and `$B613`: continuous craft writes to voice 2 frequency-high and
  sustain/release.
- `$B915` and `$B91D`: baseline copy and voice 3 control `$41`.
- `$B963-$B97D`: bounded selector dispatch to voice 1 or voice 2.
- `$BB33`: voice 2 control `$00` when the lift reaches its lower clamp.

No native writer in this census changes SID filter cutoff or resonance after
the baseline. This is a static initialized-image conclusion, not yet a runtime
proof that self-modification cannot create another target; the register-watch
captures below must close that gap.

## Native one-shot selector programs

`$B958` receives a byte offset in A and targets voice 1. `$B93A` selects voice 2
by setting Y to 7 before joining the same dispatcher. Each request first writes
control `$00`, then writes frequency high, attack/decay, sustain/release, and the
new control value. Frequency low, pulse width, and filter state are retained.
The four values come from `$B987 + selector`; some later entries deliberately
overlap mutable engine bytes, so they must be exported by meaning rather than as
an assumed immutable rectangular table.

These are the selector values whose direct callers are currently proven:

| Selector | Voice/path | Player-observable association | Program tuple `(frequency-high, AD, SR, control)` |
| --- | --- | --- | --- |
| `$00` | voice 1 through `$B945-$B957` | control-dependent request used by the native keyboard/action path; exact audible identity still open | `($59,$09,$09,$41)` |
| `$04` | voice 1, caller `$876C` | Site impact | `($09,$0E,$0A,$81)` |
| `$08` | voice 1, callers `$8880` and `$8945` | Player Projectile and Hostile Projectile launch | `($12,$09,$09,$81)` |
| `$0C` | voice 1, caller `$8981` | hostile hit on the player | `($06,$0B,$0B,$81)` |
| `$10` | voice 1, caller `$8849` | Player Projectile hit on a hostile/object target | `($16,$0B,$0B,$81)` |
| `$14` | voice 1, caller `$9411` | first Wall Contact after the latch was clear | `($04,$09,$09,$81)` |
| `$18` | voice 1, caller `$B24B` | delayed post-crash raster effect | `($0E,$0B,$0B,$81)` |
| `$1C` | voice 1, caller `$AEDA` | special Room-transition presentation | `($0E,$CA,$0A,$41)` |
| `$20` | voice 2, caller `$AEDF` | overlapping second voice of that transition | `($0F,$CA,$0A,$41)` |
| `$24` | voice 2, caller `$B618` | craft modulation retrigger; tuple is supplied by mutable `$B9AB-$B9AE` | dynamic |
| `$30` | voice 2, caller `$B476` | lift trigger/setup | mutable/dynamic; initialized as `($00,$00,$40,$41)` |

The combat associations and guards are already asserted from the same Reference
Build by [`c64lab/endgame.py`](../../research/c64-reference-build/c64lab/endgame.py)
(`IMPACT_SOUND_SITE`, `OBJECT_HIT_SOUND_SITE`, `HOSTILE_SHOT_SOUND_SITE`, and
`HOSTILE_HIT_SOUND_SITE`). The Wall Contact caller and one-shot latch are decoded
at `$9408-$9417` and recorded in
[`notes/decode/underground.md`](underground.md#walking-into-a-wall-is-how-a-doorway-is-opened).
Selector `$18` follows the crash countdown described by the native endgame
decode; it is not a crash message. `$00` and `$30` need targeted runtime traces
before they receive narrower Sound Cue names.

The dispatcher does not encode duration. Gate-off, replacement by a later
request on the same voice, envelope completion, and continuous writers can all
end or reshape a request. Duration, retrigger, interruption, and overlap are
therefore runtime evidence obligations, not values that may be inferred from
the selector table alone.

## Continuous and profile-driven behavior

### Benson Display

The 50 Hz display interrupt at `$8DC3` changes voice 3 alongside the 23-cell
scanout. During each active shift it derives a frequency-high byte from the
incoming display code at `$FC`: mask to six bits, map code `$20` through `$D0`,
then add `$30` with byte wrap, and write the result to `$D40F`. Once the active
26-frame window is over it writes zero to `$D40F` and leaves the control register
alone. The voice 3 control baseline is `$41`, so this is a persistent voice whose
pitch follows the Benson Display, not a sequence of calls to the one-shot
dispatcher. The display's independently observed 50 Hz cadence is documented in
[`notes/decode/benson-scripts.md`](benson-scripts.md#the-benson-display-cadence).

### Craft

The outdoor presentation path at `$B5D8-$B61C` skips modulation underground and
for craft/mover `$0A`. Otherwise it derives a byte from live values `$26/$27`,
writes the low nibble of `$26` into voice 2 frequency-high (`$D408`) together
with the derived upper nibble, and writes the derived envelope byte to voice 2
sustain/release (`$D40D`) when it changes. An upward change also invokes selector
`$24`, which gates voice 2 off and back on using the freshly written mutable
tuple at `$B9AB-$B9AE`. This proves continuous modulation and edge-triggered
retriggering; the player-facing relationship between `$26/$27`, Occupancy, and
throttle still needs a synchronized state/register capture.

### Lift and Room transition

`$AF3E` and `$AF3A` select two 14-byte source profiles. `$AF40-$AF51` copies
registers `$D401-$D40D` (leaving voice 1 frequency-low untouched) and then sets
voice 2 control to `$15`. Both profiles configure voice 1 with frequency-high
`$09`, pulse width `$0800`, and control/AD/SR `$00/$00/$00`; voice 2 receives
frequency `$0550` in the `$AF3E` profile or `$05E4` in the `$AF3A` profile,
pulse width `$0800`, control/AD/SR `$15/$00/$A0`. The scene-transition paths at
`$AE96-$AED3` and `$AEF3-$AF37` choose the profiles around their raster-timed
visual work. At the lift's lower clamp, `$A302` calls `$BB2F`, which clears the
lift state byte and writes voice 2 control `$00`.

Direction labels for the two profiles are intentionally withheld until runtime
capture correlates `$AF3E` and `$AF3A` with ascent and descent. Static proximity
to the visual transition is insufficient evidence for a player-facing name.

## What is still unknown

The current static census closes where sound can be written and which direct
native selectors are requested. It does **not** yet close the Sound Cue inventory:

- no accepted pair of cold-run, unwarped WAV plus SID-register traces exists for
  startup, ordinary movement, craft/thrust, both lift directions, Benson Display,
  all interactions, combat, Mission reactions, recoverable failures, and the
  Ending;
- selector `$00` and the dynamic `$24`/`$30` programs need state-correlated names,
  and lift profile direction needs observation;
- exact onset, duration, envelope completion, retrigger, same-voice interruption,
  cross-voice overlap, and every stop path remain to be measured;
- runtime watchpoints must prove that the self-modifying Benson store is the only
  dynamically retargeted SID writer and that no reachable code writes an
  unsupported register or waveform mode;
- no music program has been found by the initialized-image writer census, but
  absence of music is not closed until the two-run register traces cover all
  reachable terminal and idle paths;
- the configured VICE model/engine numbers need an explicit, pinned semantic
  interpretation before a browser renderer can claim model fidelity.

The existing `TR-0004` is only a smoke trace: it restores `interactive`, waits
10,000 instructions without a gameplay action, and asks for audio/SID artifacts
([`TR-0004-audio-smoke.json`](../../research/c64-reference-build/catalogue/traces/TR-0004-audio-smoke.json)).
The retained run `catalogue-tr-0004-ab0ec316` has a zero-byte `sid-events.log`
and no finalized WAV. It is not evidence for silence, timing, or inventory.
Moreover, the runner currently treats `audio_start`, `audio_stop`, `sid_start`,
and `sid_stop` as timeline markers while VICE recording is configured for the
whole branch; see
[`c64lab/catalogue.py`](../../research/c64-reference-build/c64lab/catalogue.py),
`_run_catalogue_branch`. The issue #118 laboratory work must repair and guard
that capture path before relying on it.

## Reproduction and next captures

The present static findings can be reproduced without publishing restricted
outputs:

```sh
research/c64-reference-build/lab doctor --prg roms/c64.ABC/MERCENARY.PRG

research/c64-reference-build/lab capture \
  --prg roms/c64.ABC/MERCENARY.PRG --checkpoint interactive

research/c64-reference-build/lab verify \
  --run research/c64-reference-build/work/<interactive-run>

research/c64-reference-build/lab benson decode \
  --run research/c64-reference-build/work/<interactive-run> \
  --output research/c64-reference-build/work/issue118-benson.json

research/c64-reference-build/lab endgame decode \
  --run research/c64-reference-build/work/<interactive-run>

research/c64-reference-build/lab sound decode \
  --run research/c64-reference-build/work/<interactive-run> \
  --output research/c64-reference-build/work/issue118-sound.json
```

Run `capture` twice from independent cold VICE processes and retain both run
identities. Until the comprehensive traces replace it, the existing unwarped
smoke branch is reproduced with:

```sh
research/c64-reference-build/lab catalogue run \
  --prg roms/c64.ABC/MERCENARY.PRG \
  --trace research/c64-reference-build/catalogue/traces/TR-0004-audio-smoke.json
```

The replacement trace set must keep `-speed 100`, `+warp`, sound enabled, and an
effective-configuration artifact, as enforced for audio branches by
[`c64lab/catalogue.py`](../../research/c64-reference-build/c64lab/catalogue.py).
Each branch must begin from a named clean checkpoint, perform a bounded semantic
action or state transition, capture synchronized state and absolute CPU/PAL
timing, and finalize both a non-empty SID-register log and valid RIFF WAV. Run
every branch twice from distinct cold starts. Store exact logs and media only in
ignored/restricted storage; the tracked result should contain hashes, the closed
cue/caller/voice/stop census, and prose conclusions.

The minimum branch matrix is: post-baseline idle; Benson printable and space
scanout; each selector `$00,$04,$08,$0C,$10,$14,$18,$1C,$20`; craft start,
steady modulation, increase, decrease, stop, Occupancy change, and indoor
suppression; lift trigger, both profile directions, both terminal clamps;
same-voice retrigger and interruption; cross-voice overlap; script 00 stop; and
the complete script 07 Ending loop. Arrival is authored Browser Shell
presentation and remains silent; it is not a Reference Build capture target.
