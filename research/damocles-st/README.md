# Damocles ST Working Authority laboratory

> Catalogue extension: ADR 0039 now permits a separate geometry/catalogue extractor
> and read-only app viewer. Earlier exclusions below describe the original lab
> scope; the script decoder remains research instrumentation and gameplay is deferred.


This directory is the reproducible Hatari harness for the Damocles Atari ST
Working Authority named in `docs/research/damocles-gap.md`. Results are
Working-Authority Evidence, not Authoritative Evidence.

## Quick start

```sh
brew bundle --file research/damocles-st/Brewfile
# Restricted Material lives under /roms (gitignored). In this worktree:
#   ln -sfn /Users/alex/work/mercenary/roms roms
research/damocles-st/lab doctor
research/damocles-st/lab reproduce
research/damocles-st/lab capture --checkpoint title-screen
research/damocles-st/lab observe --scenario research/damocles-st/scenarios/title-smoke.json
research/damocles-st/lab observe --scenario research/damocles-st/scenarios/first-world.json
research/damocles-st/lab observe --scenario research/damocles-st/scenarios/deadline-clock.json
research/damocles-st/lab observe --scenario research/damocles-st/scenarios/script-dispatch.json
research/damocles-st/lab observe --scenario research/damocles-st/scenarios/horizon-slot-writer.json
python3 research/damocles-st/scripts/panel-readout-probe.py --roms /path/to/roms \
  --snapshots /path/to/snapshots clock --vbls 250
python3 research/damocles-st/scripts/panel-readout-probe.py --roms /path/to/roms \
  --snapshots /path/to/snapshots poke --address 0x793c --bytes fffff1f0 --vbls 400
python3 research/damocles-st/scripts/panel-readout-probe.py --roms /path/to/roms \
  --snapshots /path/to/snapshots navigation --vbls 800
python3 research/damocles-st/scripts/panel-readout-probe.py --roms /path/to/roms \
  --snapshots /path/to/snapshots velocity --key 4
research/damocles-st/lab verify --run research/damocles-st/work/<run-id>
research/damocles-st/lab export --run research/damocles-st/work/<run-id> --window script-bank
research/damocles-st/lab xref --run research/damocles-st/work/<run-id> --address 0x781E
research/damocles-st/lab script --run research/damocles-st/work/<run-id>
python3 -m unittest discover -s research/damocles-st/tests -v
```

Place the Working Authority STX at
`roms/atarist/damocles_-_mercenary_ii_novagen_software_(uk).stx` and the pinned
TOS image at `roms/atarist/tos/emutos206.img`. `doctor` fails if either hash
does not match `config/working-authority.json`.

## First-offer checkpoint probe (#287)

```sh
python3 research/damocles-st/scripts/first-offer-probe.py \
  --roms /path/to/roms \
  --snapshot /path/to/snapshots/eris-spaceport-onfoot.sav
```

Runs 20 controlled cases through the original native handlers, including
499/500 counter ticks, Y/O/N and unrelated input, message gating, and sound
requests. It records hashed evidence under ignored `work/`. Interrupts and
normal host dispatch are held during the checks, so these establish instruction
checkpoint behaviour, not physical-input timing or audible output. See
[the first-offer research](../../docs/research/damocles-first-offer.md) for the
pinned evidence, results and unresolved host meanings.

## Message reveal probe (#307)

```sh
python3 research/damocles-st/scripts/message-reveal-probe.py --roms /path/to/roms
python3 research/damocles-st/scripts/message-reveal-probe.py --roms /path/to/roms --case reveal
```

Recovers what the native display routine `$052402` does to the panel message row
while the gate `$7BA0` is raised. Each traced case runs in two processes: the
first replays a tracked route and saves whole-machine state mid-response, and the
second boots that state, arms one breakpoint and then stops on 215 consecutive
VBLs, saving the message workspace, the routine's own variables and the row's six
scanlines in both screen buffers at every stop. The `reveal`, `clear` and
`system` cases trace an inline message, the clearing line and a native refusal;
`indexed` records the pointer the `$14` opcode publishes; `keys` holds every
plausible input down across the whole response and samples it, because a
breakpoint chain does not arm under held input.

Only structural comparisons of the row leave the run directory -- whether a frame
equals the previous one shifted left eight pixels, and how many pixels are lit.
The pixels themselves are game text. The route stops the player at a slightly
different distance every run, so a run whose take did not land is detected from
phase one and retried (`--attempts`). See
[the reveal research](../../docs/research/damocles-message-reveal.md).

## Limo-key pickup probe (#298)

```sh
python3 research/damocles-st/scripts/limo-key-pickup-probe.py --roms /path/to/roms
python3 research/damocles-st/scripts/limo-key-pickup-probe.py --roms /path/to/roms --tick-rate 20
```

Replays the tracked `scenarios/limo-key-pickup-route.json` walk from the on-foot
Spaceport checkpoint into the room holding `KEY- V.I.P. LIMO`, supplies the take
input, and samples the carried list, the resident slot, the script program
counter and return stack, the trigger byte table and the message gate. The five
cases cover a control run that takes nothing, an ordinary take, repeat attempts,
a drop and re-pick, and a mid-response state save resumed in a second process.
`--tick-rate` measures the script wait counter against the machine's VBL count.

The walk stops the player at a slightly different distance on every run and the
take is refused outright when the selection is out of range, so a case that
needs the pickup is retried (`--attempts`). Nothing is written into the guest:
samples are `savebin` windows taken while the emulator is stopped. Results,
captures and screenshots stay in the ignored `work/` run directory. See
[the pickup research](../../docs/research/damocles-limo-key-pickup.md).

## Object selection probe (#303)

```sh
python3 research/damocles-st/scripts/object-selection-probe.py --roms /path/to/roms --case approach
python3 research/damocles-st/scripts/object-selection-probe.py --roms /path/to/roms \
  --case boundary --take-at 28.2 --take-at 29.5
python3 research/damocles-st/scripts/object-selection-probe.py --roms /path/to/roms --case aboard
```

Observes the two words the take handler tests first: `$7B46`, the selected
object, and `$7B42`, the measure it refuses above 8. `approach` walks the
tracked pickup route with no take input and samples the selection words, the eye
position, both candidate lists and the resident arrays all the way in; every
sample ranks every resident slot by distance, so the rule is checked against the
whole field. `boundary` presses take once at a route time given by `--take-at`,
sampling immediately before the press and after it, which puts successes and
silent refusals on one scale. `aboard` runs the same observation from the
boarded-limo snapshot.

Nothing is written into the guest. See
[the selection research](../../docs/research/damocles-object-selection.md).

## Failures and acceptance

Hard failure on a wrong STX, wrong TOS, missing Hatari, missed title-screen
checkpoint, or hash mismatch. Acceptance is two independent cold starts with
equal normalized title-code RAM, stable registers, and display; a self-verifying
manifest; and a bounded Space-key observation from that checkpoint.

## Working Disassembly commands

`export` cuts addressed RAM windows out of an attested run for external
analysis; a window's file offset is its ST physical address. `xref` reports the
68000 instructions that name one absolute address — the cheap way into unknown
code. A scenario's `watch` action names the code that *writes* one word, which
`xref` cannot do when the write goes through a register-indexed address: it
pokes a sentinel, arms a Hatari change breakpoint whose command file dumps the
registers and the supervisor stack, and optionally walks the player so a value
the renderer only fills at scene setup is written again. One watch per
scenario, last, because the run ends in the debugger. A scenario's `disassemble` action produces a listing with Hatari's own
68000 disassembler at the state the run reached. `script` decodes the Damocles
Script bank into a readable listing, walking it by reachability from its entry
table.

All of them keep their output inside the gitignored run directory. Any Working
Disassembly of the Working Authority follows the rules in
`docs/research/damocles-gap.md`: untracked listings, tracked facts only.

`script` is research instrumentation, **not an extractor**. It prints a report
for a researcher to read and must never grow a machine-readable output, a
payload writer, or a schema (ADR 0021, ADR 0002). Payload writing lives in its
own modules beside it, as the Catalogue does: `damocleslab.strings` (#304)
reuses `script`'s pure decode functions so the instruction grammar has one home,
and writes `payload/damocles/strings.json` itself.

## Message string extraction (#304)

```sh
PYTHONPATH=research/damocles-st python3 -m damocleslab.strings \
  --run research/damocles-st/work/observe-first-world-20260818T101013Z-c5a32b7d \
  --output payload/damocles/strings.json
```

Extracts the 64-slot system string table at `$070000` and all 206 inline `$01`
messages from the resident script bank, verbatim padding included, with per-record
source addresses and digests. See
[the strings note](../../docs/research/damocles-script-strings.md).

See [`SPEC.md`](SPEC.md), [`BOOT-AND-UNPACKING.md`](BOOT-AND-UNPACKING.md), and
[`HATARI-RESEARCH.md`](HATARI-RESEARCH.md).
