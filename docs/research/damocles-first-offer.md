# Damocles first offer: recovered behaviour and runtime probe

Working-Authority Evidence for [#287](https://github.com/odogono/mercenary/issues/287), verified 2026-09-16. Static recovery and two repeat runs of the original native handlers confirm the first offer’s 500-counter timeout, ordered Y/O/N checks, message gate and key handling. Runtime claims are limited to debugger-controlled instruction checkpoints; they do not establish frame-exact gameplay timing. [ADR 0002](../adr/0002-separate-rom-research-from-implementation.md) permits factual recovery, not translation of the Working Authority into application code. [ADR 0043](../adr/0043-admit-damocles-play-alongside-the-second-city.md) supersedes the old sequencing restriction still present in the decoder's docstring; this task remains research only.

## Evidence and method

Source: `observe-first-world-20260818T101013Z-c5a32b7d/observed.ram`, 1,048,576 bytes, SHA-256 `b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967`, matching that run's manifest. Available in the restricted lab under `/Users/alex/work/mercenary/research/damocles-st/work/`. Script facts below were re-decoded with [`damocleslab/script.py`](../../research/damocles-st/damocleslab/script.py), seeding `decode_scripts` with `read_script_table(data)[4]`. Native facts were read from bounded windows of the same capture using Capstone's M68K 68000 big-endian decoder. No RAM, verbatim game text or native listings belong in this tracked note. Earlier findings and their original run identities are in the [ISA provenance summary](damocles-script-isa.md#provenance-summary).

## Segment boundary and control flow

Slot `$04` in the entry table at `$070080` resolves to **`$070650`**. `$0707DC` is the first reward setup inside that script, not its slot entry. These facts are decoded directly from the source capture above:

| Address | Recovered fact |
|---|---|
| `$0707DC` | `$0D` writes six bytes `$0010 $0000 $0000` into record `$00F9` of the eight-byte-stride table at `$7482`; the destination begins at `$7C4A`. |
| `$0707E6` | `$1C` writes word `$00FF` to `$7B60`: byte `$7B60` becomes zero and key byte `$7B61` becomes `$FF`. |
| `$0707E8` | Inline message; its aligned successor is `$070816`. |
| `$070816` | `$02` clears the word counter `$7B9C`. |
| `$070818`, `$07081E` | Key predicates for `$15` and `$18`, both targeting `$0709AA`. The prior catalogue identifies these as Y and O. |
| `$070824` | Key predicate for `$31` (N in the prior catalogue), targeting `$070830`. |
| `$07082A` | `$07` compares counter against `$01F4` (500), targeting `$070818` while the unsigned counter is less than 500; otherwise falls through to `$070830`. |
| `$070830` | Next offer writes `$0015 $0000 $0000` to record `$00F9`. This is the decline/timeout handoff, outside the first segment. |
| `$0709AA` | Acceptance handoff sets flag bit `$0001`; subsequent `$0709AE` writes word-table entry `$00FE` to `$0026`, and `$0709B4` applies record-bit operand `$0080`. Their broader world meanings are not established here. |

The comparison direction is established by native `$051A42`–`$051A4A`: load `$7B9C`, compare to the operand, take the branch epilogue on unsigned carry, otherwise use the polarity-inverting epilogue. For the unmodified `$0007` word at `$07082A`, equality falls through. The decoder's mnemonic `if.wait` alone does **not** express this distinction. The catalogue's claim that this arrangement waits indefinitely is therefore incorrect; a 500-counter threshold exists. Static control flow does not establish which instruction observes an input that arrives mid-cycle.

## Native state and scheduling

| Provenance in source capture | Confirmed meaning and boundary |
|---|---|
| `$05193E`–`$05196E`; native caller `$0594FA` | One dispatch checks message gate `$7BA0`, then message-resume state `$7B96`, then pending-script state `$7A88`, then fetches one opcode. The pertinent handlers return to the native caller. A whole Y/O/N/wait cycle is not one atomic dispatch. |
| `$0519BC`–`$0519E0` | Message stores a **long** source pointer at `$7B98`, finds its terminator, loads display timer `$0523B8` from `$070102`, raises word gate `$7BA0`, aligns and commits the successor PC. Here it commits `$070816`; reset-wait cannot execute until the gate permits dispatch. |
| `$0519E2`–`$0519EC` | Reset clears only counter `$7B9C`, commits PC and returns. It does not clear the key. |
| `$051A7E`–`$051A8A` | Key handler compares the operand's low byte to `$7B61`. A match calls `$054848`, then takes the branch. It does not consume or clear `$7B61`. |
| `$051C74`–`$051C7E` | `$1C` clears the key via a **word** write `$00FF` at `$7B60`, before the first prompt. |
| `$0594DC`, `$055496`–`$0554B6`, `$0555B8`–`$0555D8` | Main-loop input polling precedes dispatch. The poll resets `$7B5E`, reads and clears mailbox byte `$05558C` when populated, and the ordinary input path writes word `$7B60`. An empty mailbox does not itself clear persistent key `$7B61`. Full physical-key make/break and repeat behaviour remains outside this bounded review. |
| Vector `$000070`; `$051D9A`–`$051E84` | The capture's vector points to the register-preserving interrupt routine at `$051D9A`. Its `$051E3A` increments word `$7B9C`; the nonzero `$7A26` branch at `$051E26` bypasses that increment. This is distinct from the main-loop opcode dispatch. |

These findings explain why probes must distinguish a stable checkpoint at `$070818` from input injected at `$07082A` or between individual key tests. Seconds per counter tick are **not established by this review**: use counter ticks. The interrupt vector and increment site do not alone prove the active refresh configuration, elapsed-time conversion or pause semantics.

## Sound request is not emitted sound

The [ISA sound description](damocles-script-isa.md#the-native-routines-the-handlers-call-136) now corrects its earlier guard ordering. Direct recovery from this capture shows:

- `$054848` tests `$7A0C`; if nonzero, it returns before arming anything.
- If that guard passes, `$054850` sets `$7A78` to 3 and `$054856` arms vector `$04BF54` with `$04C556` **before** testing `$7C0C` at `$054860` and `$033F68` at `$054868`. Those later guards skip the immediate PSG writes, not the already-completed vector assignment.
- `$051DFE` tests `$033F68` and chooses its alternate native sound path when nonzero; only the other path reaches vector invocation `$051E0E`/`$051E14`.
- `$04C556` programs the channel-B tone/envelope and reaches tail `$04C5EC`, which disarms the vector. The key-handler call alone establishes a **request**. Arming, PSG register activity, and audible output are separate observations.

The runtime probe below records request entry, guard state and vector changes separately from audio. Nothing here establishes a consumed-key acknowledgement event or guarantees an audible effect on every matching key.

## Repeatable original-runtime probe

Run the tracked [first-offer probe](../../research/damocles-st/scripts/first-offer-probe.py)
from the repository root with the restricted STX, pinned TOS, and the existing
on-foot snapshot described in [the laboratory notes](../../research/damocles-st/HATARI-RESEARCH.md#save-states-pin-destinations-not-input-traces-solved):

```sh
research/damocles-st/lab doctor --roms /path/to/roms
python3 research/damocles-st/scripts/first-offer-probe.py \
  --roms /path/to/roms \
  --snapshot /path/to/snapshots/eris-spaceport-onfoot.sav
```

The command verifies 20 cases and prints its new ignored `work/first-offer-*`
directory. `result.json` records the measured state after every dispatch,
case inputs, toolchain identity, and SHA-256 hashes of the RAM, debugger command
files and log. No capture, native listing, snapshot or generated report is
tracked. Run it twice; compare `result.json`’s `results` arrays rather than all
RAM bytes, since the initial snapshot settling interval leaves unrelated
machine state different.

### Interventions and claim boundary

This executes original 68000 instructions in Hatari; it is not a replacement
interpreter. The probe restores the snapshot, waits three host seconds, and
uses a debugger command file to set CPU interrupt mask 7 (`SR=$2700`). Each
case supplies the resident script PC, counter and key latch, clears message
and pending-script state, and initializes reward/sound observation fields.
It drives dispatch by setting native PC to `$05193E`, stopping at each relevant
handler’s `rts` **before that return executes**, then dispatching the next
opcode. Native subroutine calls inside a handler execute normally.

Consequently the normal main loop and timer interrupt do not run between these
dispatches. Inputs and counters are held stable. Sound guards `$7A0C`, `$7C0C`
and `$033F68` are supplied as zero except for the explicit suppressed case;
the sound vector is initialized to its recovered idle target `$051E86`.
The probe asserts the expected handoffs, state changes and total sound-request
count. It fingerprints the relevant native and script windows against the
attested static capture, and checks that every runtime capture preserves them.
It edits state, not original instructions.

These are **polling-checkpoint observations**. Starting at `$07081E` or
`$07082A` with an injected key represents input already latched at that
instruction; it does not reproduce physical IKBD arrival timing. Likewise,
`message-completed` supplies gate zero at `$070816`; it does not measure the
renderer’s natural completion event. The probe does not execute either exit’s
downstream mission effects. Hatari runs with sound off and dummy SDL audio;
no audible output is observed or claimed.

### Evidence identities

All hashes below are SHA-256. Laboratory machine: ST, 1 MiB; Hatari 2.6.1,
Python 3.13.15. Program/TOS files are checked against
[`working-authority.json`](../../research/damocles-st/config/working-authority.json).

| Input | Hash |
|---|---|
| STX | `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef` |
| TOS | `154803e3ff4851f3dc358b91b16d6b6110d187a81d8132ecb665af49878939d5` |
| `eris-spaceport-onfoot.sav` | `6cee57c4d4a168792fc3974e786d706fe9f42cf577d6e8b7c63814c93d6398c6` |
| Hatari binary | `05723606c75a1f0642395974abdce2cbbe48b0a09a747f65cdfca7ef9201e11a` |
| Tracked probe | `ba4a57f49fa2819993bb1f94e0fa50f6d9f6360f12b2e785245668f1bb1c4c3e` |

| Run under `research/damocles-st/work/` | `result.json` hash |
|---|---|
| `first-offer-20260916T122518Z-ea8fbc0f` | `e3c58dfe981abbe1c89559f94ea07fcd00bebea69e893b4167638c9715a2fbaa` |
| `first-offer-20260916T122551Z-cdc2d02d` | `7afbef5cb4cbdcfbe55f1857e4bfb653e1a5a273f5a9c91c7b3399293338c610` |

Both runs passed all 20 cases and produced identical measured `results` arrays.
The hashed reports identify every per-step RAM capture; their hashes differ
between runs because unrelated machine state is not normalized. Independent
re-reading checked every artifact hash, all captured relevant code windows
against the attested source, and the nine `$054848` request trace hits per run.

### Observed results

At the first polling checkpoint `$070818`, with gate zero and a stable key:

| Input at `$7B61` | 499 counter ticks | 500 counter ticks | Sound request |
|---|---|---|---|
| None (`$FF`) | Returns to `$070818` after Y/O/N/wait | Next offer `$070830` | No |
| Unrelated X (`$2D`) | Returns to `$070818` after Y/O/N/wait | Next offer `$070830` | No |
| Y (`$15`) | Accepted `$0709AA` after one dispatch | Accepted `$0709AA` | Yes |
| O (`$18`) | Accepted `$0709AA` after two dispatches | Accepted `$0709AA` | Yes |
| N (`$31`) | Next offer `$070830` after three dispatches | Next offer `$070830` | Yes |

Counter and key word remain unchanged throughout these controlled cases.
The key matches request `$054848`, arm `$04BF54=$04C556` and set `$7A78=3`.
The nonmatches/timeout leave the initialized idle vector and zero countdown.
Acceptance and decline therefore have a native sound request; timeout does not
have that request in this segment.

Additional observations:

- At `$07082A` with counter 500, all five inputs advance to `$070830` without
  requesting sound. The counter instruction does not look back for keys.
- Y supplied at `$07081E` (after its own check) advances to `$070830` at 500.
  The same checkpoint at 499 passes O/N, loops at the counter check, and accepts
  Y at the next `$070818`. Thus “Y wins at 500” is true only when Y is present
  before its check, not for every possible instruction-time arrival.
- Entry `$0707DC` writes exactly `$0010 $0000 $0000` at `$7C4A`; the next
  dispatch clears the key word to `$00FF`. Message dispatch sets source pointer
  `$0707EA`, loads the display timer from `$070102`, raises gate 1, and commits
  `$070816`. Two more dispatch attempts leave that PC, counter 499, key `$FF`
  and reward unchanged. This proves the gate prevents reset-wait from executing;
  it does **not** prove the real interrupt counter freezes during a message.
- With gate zero supplied at `$070816` and Y already latched, reset-wait clears
  the counter to zero without clearing Y. The next dispatch accepts and requests
  sound. An input latched during presentation can therefore survive reset-wait;
  its natural physical-key timing has not been measured.
- With `$7A0C=1`, Y still accepts and the trace still reaches `$054848`, but the
  sound vector stays idle and countdown stays zero. This establishes a requested
  but unarmed effect. No case measures stage-two PSG programming or sound emitted
  by the host audio device.

## Supported slice and remaining host meanings

The supported bounded segment **enters at `$0707DC` and stops before executing
`$0709AA` or `$070830`**. It establishes the proposed reward record, resets the
key, requests its prompt, suspends on the message gate, resets the wait counter,
and polls in Y/O/N/counter order. Slot launch at `$070650`, arrival at the offer,
prior briefing, later bargaining, acceptance consequences and random branches
are outside this segment.

A future isolated harness can supply counter ticks and a key latch at explicit
instruction boundaries, represent pending message completion and the saved
execution position, record the six-byte reward assignment, and expose an
accepted/next-offer handoff. A single atomic “poll at tick 500” operation would
need to state its checkpoint assumption. A key acknowledgement may denote the
matched-key sound request, but **must not silently consume the key**: no such
consumption was recovered here. The pre-prompt clear is a separate operation.

The following are deliberately unresolved rather than replaced with invented
semantics:

- Seconds per script-counter tick, exact interrupt/dispatch cadence, and the
  full meanings of `$7A26` and native sound guards. The separately recovered
  impact clock at `$793C` does not establish the rate of counter `$7B9C`.
- Full message presentation, gate-clear timing and message-resume/pending-script
  arbitration. Static gate priority is established; the probe clears `$7B96`
  and `$7A88` to isolate this segment.
- Physical key make/break/repeat timing, input interleaving with counter
  increments, and races within one native handler.
- The reward record’s complete economic representation/scale and the wider
  world meaning of accepted-path flag/table writes. Its bytes, location and
  relation to the proposed reward are established; actual payment is excluded.
- Sound identity/duration, execution under later guards, and audible output.

No application implementation, Gameplay Session integration or Save Snapshot
change is part of this research. The unresolved scheduler and host details
narrow any subsequent demonstration to the explicit checkpoints above; these
results are not a whole-game or frame-exact equivalence claim.
