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
payload writer, or a schema (ADR 0021, ADR 0002).

See [`SPEC.md`](SPEC.md), [`BOOT-AND-UNPACKING.md`](BOOT-AND-UNPACKING.md), and
[`HATARI-RESEARCH.md`](HATARI-RESEARCH.md).
