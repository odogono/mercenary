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
# Restricted Material lives under /roms (gitignored); in a worktree, run
# scripts/worktree-setup.sh at the repository root to link it.
research/damocles-st/lab doctor
research/damocles-st/lab reproduce
research/damocles-st/lab capture --checkpoint title-screen
research/damocles-st/lab observe --scenario research/damocles-st/scenarios/title-smoke.json
research/damocles-st/lab observe --scenario research/damocles-st/scenarios/first-world.json
research/damocles-st/lab observe --scenario research/damocles-st/scenarios/workspace-selection.json
research/damocles-st/lab observe --scenario research/damocles-st/scenarios/deadline-clock.json
research/damocles-st/lab observe --scenario research/damocles-st/scenarios/script-dispatch.json
research/damocles-st/lab observe --scenario research/damocles-st/scenarios/horizon-slot-writer.json
research/damocles-st/lab observe --scenario research/damocles-st/scenarios/body-phase.json
research/damocles-st/lab observe --scenario research/damocles-st/scenarios/comet-motion.json
python3 research/damocles-st/scripts/panel-readout-probe.py --roms /path/to/roms \
  --snapshots /path/to/snapshots clock --vbls 250
python3 research/damocles-st/scripts/panel-readout-probe.py --roms /path/to/roms \
  --snapshots /path/to/snapshots poke --address 0x793c --bytes fffff1f0 --vbls 400
python3 research/damocles-st/scripts/panel-readout-probe.py --roms /path/to/roms \
  --snapshots /path/to/snapshots navigation --vbls 800
python3 research/damocles-st/scripts/panel-readout-probe.py --roms /path/to/roms \
  --snapshots /path/to/snapshots velocity --key 4
python3 research/damocles-st/scripts/deadline-start-probe.py --roms /path/to/roms \
  --start-vbls 0 --interval 5 --count 200 --no-space
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

## Modules

| Path | Owns |
| --- | --- |
| `lab` | the entry point: runs `damocleslab` with `.venv` Python when present (`lab --help` lists commands) |
| `damocleslab/cli.py`, `laboratory.py`, `runtime.py`, `toolchain.py`, `core.py` | commands, configuration, Hatari scripts, toolchain checks, hashing and errors |
| `damocleslab/catalogue.py` | the geometric record decoder behind `payload/damocles/catalogue.json` (ADR 0039) |
| `damocleslab/script.py`, `strings.py` | the Damocles Script decoder and its message text |
| `damocleslab/documents.py`, `music.py`, `panel.py`, `panel_writers.py`, `system.py`, `title.py` | extractors for Head Command documents, the tune, panel artwork and writer data, Gamma System Bodies and the Title Logo |
| `scripts/*-probe.py`, `*-check.py` | one Hatari probe or offline check per question; each has a section below, found by its issue number |
| `scenarios/*.json` | `lab observe` scenarios |
| `snapshots/*.sav` | Hatari memory snapshots probes start from |
| `tests/` | `python3 -m unittest discover -s research/damocles-st/tests -v` |
| `work/` | ignored run output, linked to the main checkout in worktrees |

## Rehosting an off-build memstate (#331)

A memstate captured by a Hatari built with CAPS/IPF floppy support does not restore
under the pinned build: it fails with
`Memory snapshot IPF floppy data incompatible with this Hatari version` and the
restore is abandoned. Convert it once, then use it like any other snapshot:

```sh
python3 research/damocles-st/scripts/memstate-rehost.py \
    --input research/damocles-st/snapshots/damocles.icarus.sav \
    --output research/damocles-st/snapshots/rehosted/icarus.sav
python3 research/damocles-st/scripts/memstate-rehost.py --input ... --inspect
```

Only the snapshot's IPF section changes. The tool re-decodes the 1 MiB ST RAM window
before and after and refuses to write if it differs, so the captured machine is
preserved exactly; the rehosted file is a different container, not a new capture.
Nearly every memstate behind `payload/damocles/arrival-poses.json` was captured
this way and rehosted; one, `eris-spaceport-onfoot`, was captured on the pinned
build and its container is copied through byte for byte. All of them are
Restricted Material and stay uncommitted; the repository's `*.sav` rule already
ignores them.

Write rehosted containers under `snapshots/rehosted/`, named for the pose id.
The catalogue's bank-identity tests glob `snapshots/*.sav` and would compare
each capture twice if both forms sat in the same directory.

The output is byte-reproducible: the tool packs with `mtime=0`, because gzip
otherwise stamps the wall clock into the container header and the same captured
memstate would hash differently on every rehost. `tests/test_memstate_rehost.py`
pins that. `ramSha256` identifies the machine and is unaffected either way.

## Support placement and multi-object drops on Vesta (#331)

```sh
python3 research/damocles-st/scripts/support-drop-probe.py --list
python3 research/damocles-st/scripts/support-drop-probe.py --case inventory
python3 research/damocles-st/scripts/support-drop-probe.py --case multi-drop
python3 research/damocles-st/scripts/support-drop-probe.py --case pair-drop --gap 12 --nudge 0.3
python3 research/damocles-st/scripts/support-drop-probe.py --case pair-drop --gap 12 --rotate 1

# Above ground level, from the #326 interior captures.
python3 research/damocles-st/scripts/support-drop-probe.py --case multi-drop \
  --snapshot research/damocles-st/snapshots/vesta-transporter.sav    # level 10, direct
python3 research/damocles-st/scripts/support-drop-probe.py --case multi-drop \
  --snapshot research/damocles-st/snapshots/metis-transporter.sav    # level 9, support
```

Boots the rehosted `vesta-parliament-4-6` pose, which restores with three objects
carried a short walk from an authored support pair, and replays ordinary joystick
and keyboard input. `pair-drop` drops one object, waits for it to become the
selection, and drops a second onto it; `--nudge` walks a fraction of a second
between the two so the same sequence crosses the support branch's exponent-6
boundary, which separates support placement from direct placement on position alone.
See [the object-drop research](../../docs/research/damocles-object-drops.md) for the
pinned runs and what they do and do not close.

`--snapshot` points the same cases at any rehosted memstate. The #326 captures
put the player inside a structure at levels 1, 4, 9 and 10 carrying four objects,
which is what the drop research needed and could not reach: `vesta-transporter`
takes the direct path at level 10, and `metis-transporter` lands on `FILOFAX` at
level 9, where the support supplies the rank the carried key requires, so the
model-form and height gates run.

## Ground contact and the direct-drop gate (#357)

```sh
python3 research/damocles-st/scripts/ground-contact-probe.py
```

Boots the rehosted `dion-2-3` pose, boards `EAGLE NINE S E`, drops once on the
ground, climbs until `$7ACA` has read zero three times, and drops again. `:trace`
markers on the drop handler's entry, its contact test `$05462A` and the
instruction after it say whether each drop reached the gate and got past it.
See [the ground-contact research](../../docs/research/damocles-ground-contact.md).

## Structure Workspace reach and capture (#447)

```sh
# every island record that binds a group, and whether a capture attests it
python3 research/damocles-st/scripts/workspace-capture-probe.py --list

# which pose could fly to which uncaptured group, read without booting anything
python3 research/damocles-st/scripts/workspace-capture-probe.py --routes

# fly a boarded craft to another workspace on the same body and capture the pose
python3 research/damocles-st/scripts/workspace-capture-probe.py \
    --snapshot research/damocles-st/snapshots/rehosted/dion-2-3.sav \
    --group 0x1b --board-slot 3 --capture dion-north
```

**The road networks no longer need this probe.** #447 established that the run
grid at `$01E000` is expanded by `$04EB60` from the group's own authored stream,
so `damocleslab.catalogue` decodes all 42 groups from the image and a flight adds
nothing to them. What the probe still answers is *reach*: `--routes` reads every
tracked memstate and reports, per group with no live attestation, the distance
from each pose and whether the board gate at `$054310` would accept the craft
parked there — bit 7 of the key byte at `$7272 + slot*4`. That is the standing
answer to "could we capture this one", and it is what a future `$ABDC` surface
assembly or resident capture would start from.

The flight itself boards, climbs, and steers a closed loop to an island record's
origin, wrapping the surface at 2^28 source units. Boarding, climb and cruise are
reproducible — 97 cells in 26 seconds on the Dion run — and the descent to ground
contact is not yet: the craft holds height under power, and atmospheric speed is
nothing like the space table, word 4 nose-down losing only about 520 units of
height a second. Runs that ended short are in the ignored `work/` directory.

Two traps worth keeping, both found driving it: Hatari's command FIFO can stop
being read, and a blocking write into it never returns, so the probe writes
through a non-blocking fd with a deadline; and `savebin` reuses one filename per
tick, so a sample taken after the emulator stopped answering silently re-reads
the previous tick and a dead run looks exactly like a slow one. Each window is
removed before it is asked for.

Booting needs the **rehosted** container (`snapshots/rehosted/`). The un-rehosted
memstates the catalogue recipe names are fine as extractor inputs, which only read
their RAM, but Hatari abandons the restore and exits.

## Arrival route probe (#326)

```sh
python3 research/damocles-st/scripts/arrival-route-probe.py --survey
python3 research/damocles-st/scripts/arrival-route-probe.py --target 7 --board
python3 research/damocles-st/scripts/arrival-route-probe.py --target 3 --board --ordinary-rate
python3 research/damocles-st/scripts/arrival-route-probe.py \
  --snapshot research/damocles-st/snapshots/vesta-parliament-4-6.sav --target 3 --board
```

Boots a restorable arrival pose and asks what the player can reach and board from
it. `--survey` lists every craft in the live resident arrays with its distance and
whether its Association B body byte matches the live body selector. `--target`
walks to one closed loop — each tick reads the camera longwords and the target's
own array entry and steers, learning the sign of the yaw response from the machine
and detouring when the distance stops falling — and `--board` then presses B and
resolves whatever message the game raises back to its system-string slot.

Nothing is injected: walking is the `$79C2` soft-copy the laboratory already uses
and boarding is a real key event. See [departure
routes](../../docs/research/damocles-arrival-routes.md) for the board gate, the
per-craft key byte at `$7272`, and the route attempts these runs record.

`--capture-space NAME` statesaves once the craft reaches space — occupancy 2,
body selector `$FFFF` — which is the one live state whose body selector is the
VOID sentinel and whose machine is still running. `--capture` remains the on-foot
capture taken after a landing.

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
counter and return stack, the trigger byte table and the message gate. The cases cover a control run that takes nothing, an ordinary take, repeat attempts,
a drop and re-pick, and a mid-response state save resumed in a second process.
`--case midresponse-drop` drops and re-picks during the initial response;
`--case reverse-surface --settle 2` reverses the recorded movement segments before
dropping and re-picking outside. `--case surface-leave-return --settle 2`
adds a walk into a neighbouring cell and back before re-pick. These host-timed routes can drift: inspect the
sampled region flags and association before claiming a surface arrival.
See [the drop research](../../docs/research/damocles-limo-key-drops.md) for
provenance, location coverage and remaining prerequisites.
`--tick-rate` measures the script wait counter against the machine's VBL count.

The walk stops the player at a slightly different distance on every run and the
take is refused outright when the selection is out of range, so a case that
needs the pickup is retried (`--attempts`). Nothing is written into the guest:
samples are `savebin` windows taken while the emulator is stopped. Results,
captures and screenshots stay in the ignored `work/` run directory. See
[the pickup research](../../docs/research/damocles-limo-key-pickup.md).

## Pickup-response probe (#317)

```sh
python3 research/damocles-st/scripts/pickup-response-probe.py --roms /path/to/roms
python3 research/damocles-st/scripts/pickup-response-probe.py --mode timeline --roms /path/to/roms
python3 research/damocles-st/scripts/pickup-response-probe.py --mode timeline --case run-pending
```

Exercises the five pickup-trigger mappings #298 left as source facts — resident
slots 181, 151, 95, 101 and 94 — with slot 183 replayed as the control. None of
the five objects has a recovered placement, so **no ordinary route reaches any
of them** and the probe drives the program's own dispatch instead of inventing
one.

`--mode checkpoint` (the default) runs the object-to-script table walk at
`$0543D2` with interrupts masked and only `A0` supplied, so each walk is one
atomic pickup: the trigger it selects, the arming byte it clears, the busy flag
it sets and the script it commits. Consecutive walks in a case reproduce busy
arbitration — queue, discard, re-queue, refusal of an already-fired trigger —
and one case shows a second queued index replacing the first. The probe asserts
its expectations and fails the run rather than reporting a mismatch.

`--mode timeline` writes the pending-script word `$7A88` and lets the program
launch and run the response under ordinary interrupts, sampling the interpreter
PC, the message gate, the display duration and the wait counter through to the
return to the idle jump. `run-pending` makes a second trigger pending during a
running script; `run-save-resume` saves whole-machine state mid-response and
resumes it in a second process.

Neither mode performs a pickup or presses the take input, and neither is an
ordinary-route observation. Samples are `savebin` windows taken while the
emulator is stopped, and everything stays in the ignored `work/` run directory.
See [the pickup-response research](../../docs/research/damocles-pickup-responses.md).

## Location ledger (#314)

```sh
python3 research/damocles-st/scripts/location-ledger.py ledger
python3 research/damocles-st/scripts/location-ledger.py poses \
  --memstate midas=research/damocles-st/snapshots/midas.sav \
  --memstate acheron=research/damocles-st/snapshots/acheron.sav \
  --memstate dion-2-3=research/damocles-st/snapshots/dion-2-3.sav \
  --memstate dion-transporter=research/damocles-st/snapshots/dion-transporter.sav \
  --memstate clotho=research/damocles-st/snapshots/clotho.sav \
  --memstate gaea-ur-city-4-2=research/damocles-st/snapshots/gaea-ur-city-4-2.sav \
  --memstate gaea-transporter=research/damocles-st/snapshots/gaea-transporter.sav \
  --memstate eris-spaceport-onfoot=research/damocles-st/snapshots/eris-spaceport-onfoot.sav \
  --memstate eris-transporter-11-8=research/damocles-st/snapshots/eris-transporter-11-8.sav \
  --memstate theon=research/damocles-st/snapshots/theon.sav \
  --memstate vesta-parliament-4-6=research/damocles-st/snapshots/vesta-parliament-4-6.sav \
  --memstate vesta-transporter=research/damocles-st/snapshots/vesta-transporter.sav \
  --memstate metis-transporter=research/damocles-st/snapshots/metis-transporter.sav \
  --memstate lucan=research/damocles-st/snapshots/lucan.sav \
  --memstate logos-transporter=research/damocles-st/snapshots/logos-transporter.sav \
  --memstate pan=research/damocles-st/snapshots/pan.sav \
  --memstate bacchus-transporter=research/damocles-st/snapshots/bacchus-transporter.sav \
  --memstate mentor-transporter=research/damocles-st/snapshots/mentor-transporter.sav \
  --memstate damocles=research/damocles-st/snapshots/damocles.sav \
  --payload
```

`ledger` counts resident object slots per celestial body straight out of the
tracked `payload/damocles/catalogue.json`: residence form, takeability,
recovered placements and the distinct interior scene selectors each unplaced
resident still needs. It reads no Restricted Material.

`poses` decodes one on-foot arrival pose per Hatari memstate — the occupancy
word, body selector, camera longwords, yaw and the Floor `$7AA4` (checked against
`$7AC4` and the eye height, #505) — and reads the workspace cell
from `$7B5C`, the engine's own current-cell word. Where the body has a recovered
body-local origin the camera longwords must reproduce that cell independently,
and `workspaceOrigin` publishes the origin; where they do not, or where the body
has no recovered origin, `workspaceOrigin` is null and `impliedWorkspaceOrigin`
carries the origin the pose's own longwords imply. A 16×16 workspace is a window
onto a much larger surface, so one body can carry several. The memstates stay
ignored; `--payload` writes the tracked `payload/damocles/arrival-poses.json`.
See [the location coverage ledger](../../docs/research/damocles-gamma-system-location-ledger.md).

## Workspace selection probe (#324)

```sh
research/damocles-st/lab observe \
  --scenario research/damocles-st/scenarios/workspace-selection.json
```

Captures the first-world RAM and disassembles the bounded workspace loader and
structure-group decoder around `$04E800..$04EC00`. It records how `$794E`,
`$1E64C`, `$ABDC` and `$7A6C` are populated before interior residents consume
their group/cell/level/insertion selectors. See the
[workspace-selection research](../../docs/research/damocles-workspace-selection.md).

## Carry capacity probe (#316)

```sh
python3 research/damocles-st/scripts/carry-capacity-probe.py --roms /path/to/roms
python3 research/damocles-st/scripts/carry-capacity-probe.py --roms /path/to/roms \
  --case briefcase-drop-overflow --case antigrav-a-craft
```

Runs the original take handler `$0541F0`, the scripted gift entry `$0541E0` and the
drop handler `$054520` at controlled checkpoints, one case per emulator. Each case
boots the on-foot Spaceport snapshot, holds interrupts at IPL 7, writes the Carried
Stack, capacity, selection and refusal words that one gate needs, enters the handler
at its own entry and stops at whichever of its exits it reaches -- silent return,
the system-string helper, the support-rank branch or the accepted tail. The exit and
the refusal index in `d1` come from the register dump; everything else is decoded
from whole-machine captures taken before and after.

Breakpoints do not survive Hatari's `--memstate` restore, so the case script is sent
through the command FIFO after the machine is up, and the debugger's own `quit` does
not return from a breakpoint script, so a case is finished when its last capture is
complete. Cases cover default and expanded capacity, the equality that enforces it,
every handling class, both ANTIGRAV overrides, the BRIEFCASE's expansion, overflow
store and exact round trip, the shared refusal words and the drop's rank comparison.

**These are instruction checkpoints, not ordinary routes.** The probe writes state the
walk and the scene pass would otherwise produce, and none of the three special items
has a recovered placement, so no case is a claim that ordinary play reaches it. See
[the carry capacity research](../../docs/research/damocles-carry-capacity.md).
## General object drop probe (#315)

```sh
python3 research/damocles-st/scripts/object-drop-probe.py --roms /path/to/roms
python3 research/damocles-st/scripts/object-drop-probe.py --case scroll-refusal
python3 research/damocles-st/scripts/object-drop-probe.py --case take-refusal --breakpoint
```

Reproduces the take and drop gates that apply to every resident object rather
than only to the limo key. `take-refusal` and `empty-drop` run from the Eris
arrival pose, where `INTERSTELLARSHIP` is the nearest drawn object at distance
exponent 5: the take is refused through the handling byte's message branch and
the empty-stack drop is refused silently, both with the ship well inside the
nearby-support distance. `scroll-refusal` and `scroll-control` take the key on
the tracked pickup route and press drop 0.2 s and 3 s later, which puts the
inventory-label scroll window's refusal and an ordinary placement on one scale.

`--breakpoint` arms one observational breakpoint on the refusal instruction of
the handler under test; its callback only saves memory windows and continues.
Samples scheduled after a callback have been seen to go missing, so the
breakpoint cases are run separately from the sampled ones.

Nothing is written into the guest. See
[the object drop research](../../docs/research/damocles-object-drops.md).

## Structure-group probe (#325)

```sh
python3 research/damocles-st/scripts/structure-group-probe.py \
    --run research/damocles-st/work/observe-first-world-<id> \
    --memstate research/damocles-st/snapshots/dion-2-3.sav \
    --memstate research/damocles-st/snapshots/vesta-parliament-4-6.sav \
    --memstate research/damocles-st/snapshots/vesta-transporter.sav \
    --memstate research/damocles-st/snapshots/gaea-transporter.sav \
    --memstate research/damocles-st/snapshots/dion-transporter.sav \
    --memstate research/damocles-st/snapshots/metis-transporter.sav \
    --memstate research/damocles-st/snapshots/logos-transporter.sav \
    --memstate research/damocles-st/snapshots/pan.sav
```

**Eris memstates are excluded.** The static decode of group `$12` does not
reproduce `$ABDC` byte 1 for cells `$3C`-`$3F`, and the gate correctly fails.
Every Eris capture produces the same live bytes, so it is an open decoder gap,
not gameplay state; it is recorded in the workspace-selection research.

Walks the static structure-group table at `$1E64C` to the group-offset root, then
parses an authored group record exactly as the map decoder at
`$4EB60`-`$4ED14` does: the run-length cell-extent stream, the two workspace
bytes, the six source-reference selectors, the cell-override list and the place
list. Each override names the authored structure instance in one cell, which is
the parent an interior-associated resident needs.

The override word's low nine bits are the structure slot and its high byte's
bits 1-7 are a scene selector; the instance's scale, palette, Building detail and
base structure come from the alias record, per the consumer at
`$54CB0`-`$54E28`. Scale is a **signed** pair, so it carries reflection.

Three self-checks gate every run and raise rather than print. The decode must
reproduce #172's hand-recovered Eris parent field for field -- group `$14` cell
`$26`, slot 145, offsets -33/-125, alias scale 3/2, palette 44, Building detail
58 resolving to `$02CE86`. For each memstate supplied, the static decode must
reproduce the `$ABDC` override table the running game built, the place-list
pointer at `$7A6C`, and the words `$7AF0`/`$7AF8`/`$7AFA`/`$7AF2`/`$7AF4` for the
cell the player is standing in. Every memstate needs `memstate-rehost.py` first.

**The association list is bound per level, and the level's structure is
derived.** `$7B0E` identifies whichever structure the game walked, which at
level 0 is the cell's authored instance and above level 0 is the interior. The
alias record's floor table at `+6` names one structure slot per level: `$054DBC`
publishes it in `$7C1E`, `$054DC2` takes level 0 as `$7AF0`, and the lift at
`$055B24`-`$055BD8` indexes it by the destination level before assembling that
structure. The probe runs that lookup at whatever level a capture stands and
raises when the derived association root is not the live `$7B0E`; there is no
level-0 special case. A further gate then requires every catalogue resident
naming the captured scene to name an insertion group the bound structure
actually offers.

See [the level-to-structure binding](../../docs/research/damocles-level-structure-binding.md),
[the Dion and Vesta structure-group research](../../docs/research/damocles-dion-vesta-structure-groups.md)
and [workspace selection](../../docs/research/damocles-workspace-selection.md).

## Moving-object probe (#327)

```sh
python3 research/damocles-st/scripts/moving-object-probe.py --roms /path/to/roms
python3 research/damocles-st/scripts/moving-object-probe.py --case fire-boarded
python3 research/damocles-st/scripts/moving-object-probe.py --case attack-armed \
    --samples 220 --period 1.0
```

Checks the reading that resident slots 8..15 are a moving-object pool and that
three of its entries are driven by the scene loop: slot 8 is the shot the player
fires, slot 11 is the `ATTACK SHIP`, and slot 15 is the shot that ship fires
back. Each case boots a tracked memstate, holds the joystick fire bit and
samples Association B, the pool lifetime counters, the launch gates and the
positions from `savebin` windows taken while the machine is stopped.

`fire-boarded`, `fire-onfoot` and `attack-disarmed` inject nothing but the
joystick softcopy byte the laboratory already uses for locomotion, so they are
ordinary routes; `fire-onfoot` is the control that shows the boarded gate
`$7AB0`. `attack-armed` additionally writes `$070104` = `$0001`, the word the
TOLOSA arrival script writes at `$072B16`, and is therefore **an
instruction-level checkpoint, not an ordinary route** — ordinary play only
reaches that word by travelling to TOLOSA. The encounter resolves after about
170 s of sampling against a stationary player, so that case wants a long
`--samples` run.

Results, captures and screenshots stay in the ignored `work/` run directory. See
[the moving-object research](../../docs/research/damocles-moving-objects.md).

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

## Draw reach check (#370)

What bounds each family of Damocles geometry at one pose. Unlike the probes
above it launches nothing: it reads a capture that already exists — a run's
`.ram` or a memstate carved off disk — so every reading is an ordinary-route
observation with nothing written into the guest.

```sh
python3 research/damocles-st/scripts/draw-reach-check.py \
  --memstate research/damocles-st/snapshots/eris-spaceport-onfoot.sav
python3 research/damocles-st/scripts/draw-reach-check.py \
  --run research/damocles-st/work/<run-id> --prefix observed
```

It reports three bounds, because there are three and they differ:

- **ground records** — a `(2r + 1)` cell square, with `r` read at `$054BD4`
  from the table at `$00915A` indexed by the camera altitude `$7A30 >> 11`.
  Entry 0 is `0`, so **on foot the window is the occupied cell alone**. A
  capture may still hold a wider one: a radius latched at altitude stands until
  something recomputes it, and `$054B84` forces that by storing `$FF` on every
  cell change. The report says `settled` or `latched from a higher altitude`.
- **structures** — the occupied cell alone, structurally. `$05A744` and
  `$053CC2` are reachable only from `$0533D4..$053418`, which the object stream
  walk falls into on a zero word, drawing the one bound workspace.
- **objects** — the whole body, no distance test. Recovered at `$052C9C` in
  `docs/research/damocles-object-selection.md` and reported here for contrast,
  not re-derived.

Three checks raise rather than report: `radius-table` refuses a capture whose
`$00915A` is not the canonical curve, which is how a pre-game-load capture is
caught; `radius-reachable` refuses a `$7B62` the table cannot produce; and where
a route list is built the window is delegated to `ground-extent-check.py`. It
passes on all 23 memstates and on 621 of 706 work-tree RAM images, the 85
refusals being title-screen or TOS-only captures.

Findings and evidence identities are in
`docs/research/damocles-eris-ground.md` and
`docs/research/damocles-structure-draw-selection.md`.

## Body phase probe (#439)

Whether the 32-slot phase-rate table at `$0082DC` is each Body's axial rotation
rate — and whether any Body centre other than DAMOCLES ever moves.

```sh
python3 research/damocles-st/scripts/body-phase-probe.py --case rate
python3 research/damocles-st/scripts/body-phase-probe.py --case spin \
  --ordinary-rate --samples 12 --interval 2.0
python3 research/damocles-st/scripts/body-phase-probe.py --case freeze
python3 research/damocles-st/scripts/body-phase-probe.py --case jump
python3 research/damocles-st/scripts/body-phase-probe.py --case stasis --samples 24
python3 research/damocles-st/scripts/body-phase-probe.py --case void \
  --snapshot research/damocles-st/snapshots/rehosted/midas.sav
```

`rate` checks every slot's accumulator at `$0062EA` against its derived rate at
`$00835C` times the elapsed count of the interrupt counter `$051D96`, and
cross-checks that counter against `$007B9C`. `spin`, `freeze` and `jump` poke the
current Body's own entry and sample the sky longitude latch `$042C6C` either side
of the poke, with a screenshot per sample; `spin` on ERIS carries the pose from
night into day without moving the player. `stasis` hashes the X/Y/Z body-centre
arrays across a long run and names every slot that changed. `void` records a pose
whose selector is already the `$78` sentinel.

Several poses restore, or die into, the game's own pause at `$007A26`, which
gates the whole interrupt body and stops every accumulator. `--press-first
SCANCODE` presses a key to clear it the way `$0555C8` does, rather than poking
the flag, and the sampling loop re-presses whenever it sees the gate set.

The pinned scenario `scenarios/body-phase.json` covers the same ground without a
memstate: two RAM captures far enough apart to check every slot's rate and to
hash the centre arrays at both ends. How far apart is not fixed — the harness's
`wait_vbls` is a host sleep — so take the elapsed count from `$051D96` in the
captures themselves rather than from the scenario.

Findings are in
[the Gamma System note](../../docs/research/damocles-gamma-system.md#issue-439-body-rotation-and-orbit-stasis--confirmed).

## Comet motion probe (#440)

What moves DAMOCLES's centre — the one Body centre the resident image writes —
and whether the path it traces is a function of the Impact Clock at `$00793C`.

```sh
python3 research/damocles-st/scripts/comet-motion-probe.py --case path \
  --samples 24 --interval 2.0
python3 research/damocles-st/scripts/comet-motion-probe.py --case path \
  --samples 10 --interval 1.5 \
  --snapshot research/damocles-st/snapshots/rehosted/gaea-ur-city-4-2.sav
python3 research/damocles-st/scripts/comet-motion-probe.py --case waypoint \
  --targets 6 --ordinary-rate --interval 0.05
python3 research/damocles-st/scripts/comet-motion-probe.py --case pose \
  --samples 3 --interval 0.5
```

The mover at `$051E88` holds a cursor at `$00782C` into a table of 31 ten-byte
waypoints at `$052022` — a signed word of seconds to impact and a longword X
and Z each — and interpolates between the two the clock falls between at
1/32-second resolution, writing the result at `$051F36`/`$051F3A`.

`path` samples the centre, the clock, its 1/32-second companion `$007942`, the
cursor and the derived segment rates, recomputes the centre from the table and
the clock alone, and reports the residual. It also searches back two
game-seconds for the single tick that reproduces both axes bit-exactly, which
separates a wrong formula from a stale frame; the runs behind the note find
that tick at lag zero everywhere, so the residual is not a tolerance.
`waypoint` is the one case that injects: it pokes `$00793C` forward onto an
authored waypoint's time and reads back where the comet went, which only makes
sense forward, because the cursor steps on and never back. `pose` reconciles
one restored memstate's held centre against its own clock, which tests the
formula against captures taken by other work, and reports the two gates on the
`$051F26..$051F32` carry.

`snapshots/rehosted/damocles.sav` restores into the game's dead prompt rather
than alive on the comet, so it is usable for `pose` and not for watching the
comet move.

The pinned scenario `scenarios/comet-motion.json` covers the same ground
without a memstate: two RAM captures far enough apart to cross a segment, each
carrying the clock, the cursor, the rates, DAMOCLES's centre and the whole
table. How far apart is not fixed — the harness's `wait_vbls` is a host sleep —
so take the elapsed count from `$051D96` in the captures themselves.

Findings are in
[the motion and time note](../../docs/research/damocles-script-motion-time.md#comet-motion-440--confirmed-damocless-centre-is-a-function-of-the-impact-clock).

## Sound programme probe (#514)

Every sound the program can make: the driver's programmes, the Geiger tick, the
writers outside the vectors and the music player, heard in Hatari at 50 Hz.

```sh
research/damocles-st/.venv/bin/python research/damocles-st/scripts/sound-programme-probe.py decode
research/damocles-st/.venv/bin/python research/damocles-st/scripts/sound-programme-probe.py record --roms roms --case limo
research/damocles-st/.venv/bin/python research/damocles-st/scripts/sound-programme-probe.py analyse <mono.wav>
```

`decode` needs no Hatari. It checks the byte sequences behind every decoded write,
table and arming site in the pinned first-world RAM, prints the window hashes and
decodes the three music voices. `record` boots a case's memstate with sound on,
pokes the PAL field rate as `lift-sound-probe.py` does, arms a non-stopping
`:trace` breakpoint on every programme's entry, records Hatari's WAV while it
plays the case's keys, stick, pokes or live interventions, and writes
`result.json` with the traced programmes placed on the recording's VBL clock.
The cases are `boot` (cold, no memstate), `limo`, `transporter`, `lift-wall`,
`hazard`, `geiger`, `explosive-dropped`, `explosive-carried`, `arm-b`, `music` and
`music-after-thud`. The interventions are named in each case and in the note.

A live intervention reads `$6000`–`$7FFF` and writes back in two separate
stop/continue round trips: Hatari stops reading the command FIFO if it is left
stopped with nothing queued.

Findings are in
[every Damocles sound programme](../../docs/research/damocles-sound-programmes.md).

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

## Gamma System extraction (#529)

```sh
PYTHONPATH=research/damocles-st research/damocles-st/.venv/bin/python -m damocleslab.system \
  --run research/damocles-st/work/observe-first-world-20260818T101013Z-c5a32b7d \
  --output payload/damocles/system.json
```

Extracts the 30 physical Body records: name, centre, colour, the packed size at `$006040`
with its decode and `size / 256` radius, and each Body's sky draw list from `$00809C`, in
the engine's order. It also writes the static sky facts #528 found, and the star list and
colours the three starfields plot from (#578). It fails closed on a list
pointer outside `$00811C..$0081CC`, a byte that is not a Body selector, or an unnormalised
size. `tests/test_system.py` checks the tracked payload reproduces and that every list is
the bytes at its pointer. See [the Gamma System note](../../docs/research/damocles-gamma-system.md)
and [the sky Bodies note](../../docs/research/damocles-sky-bodies.md).

## Music extraction (#514)

```sh
PYTHONPATH=research/damocles-st research/damocles-st/.venv/bin/python -m damocleslab.music \
  --run research/damocles-st/work/observe-first-world-20260818T101013Z-c5a32b7d \
  --output payload/damocles/music.json
```

Extracts the GHETTOBLASTER's tune: the three voice streams of the player at `$033F6A` to the
jump that closes each loop, every volume and pitch table the pointer tables hold, and the
eight bytes at address 0 that a voice with no table walks (the capture's TOS header, not the
game's). It fails closed on voices of different lengths, a jump off an op or entry boundary,
or a table the pointer tables do not hold, and `tests/test_music.py` checks the tracked
payload reproduces byte for byte from the pinned capture. See
[every sound programme](../../docs/research/damocles-sound-programmes.md#the-music-player).

## Panel extraction (#718, #740)

```sh
PYTHONPATH=research/damocles-st python3 -m damocleslab.panel \
  --stx 'roms/atarist/damocles_-_mercenary_ii_novagen_software_(uk).stx' \
  --run research/damocles-st/work/observe-first-world-20260818T101013Z-c5a32b7d \
  --output payload/damocles/panel.json
python3 -m unittest discover -s research/damocles-st/tests -p test_panel.py
```

Reuses the Title Logo's independent STX loader to recover DAM1's pristine panel head,
the native 64 × 54-byte compass frames, the existing pitch strip, five fonts, centre
art and title bands, activation definitions and field layouts. It verifies the run's
manifest, pinned media and exact first-world RAM identity. Each extracted source
range carries a hash; captured palette state is accompanied by its mutation rules.
The schema stays at version 1 and the `pitch` member retains #718's contract.

Tests exhaust all compass headings and compare both buffers of the on-foot,
boarded-limo and airborne captures, including non-level pitch and recovered speed,
altitude and clock readouts. Restricted captures remain optional on machines without
the Working Authority; tracked payload shape and compass equivalence tests always run.
Unsupported fields and centre content remain explicit `gaps`. This extraction does
not replace the browser panel; see [the writer-data note](../../docs/research/damocles-panel-writer-data.md).

## Document extraction (#598)

```sh
PYTHONPATH=research/damocles-st research/damocles-st/.venv/bin/python -m damocleslab.documents \
  --run research/damocles-st/work/observe-first-world-20260818T101013Z-c5a32b7d \
  --output payload/damocles/documents.json
```

Extracts the documents the Head Commands read: every mode-2 row of the Open table at
`$04D2C4` (the object slot, the document index and colours 15 and 3), and each row's items
from the bank at `$073500`, each an 8-character name and a verbatim body. It writes 19
documents and 93 items. It fails closed on a table that does not end at `$04D3AC`, a
document whose header is not `$80 $20 $00` or whose terminator is not at its length plus 4,
or a byte outside the message row's glyphs. `tests/test_documents.py` checks the tracked
payload reproduces byte for byte from the pinned capture. See
[the Head Commands note](../../docs/research/damocles-head-commands.md).

See [`SPEC.md`](SPEC.md), [`BOOT-AND-UNPACKING.md`](BOOT-AND-UNPACKING.md), and
[`HATARI-RESEARCH.md`](HATARI-RESEARCH.md).
