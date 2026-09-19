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
research/damocles-st/lab observe --scenario research/damocles-st/scenarios/workspace-selection.json
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

## Rehosting an off-build memstate (#331)

A memstate captured by a Hatari built with CAPS/IPF floppy support does not restore
under the pinned build: it fails with
`Memory snapshot IPF floppy data incompatible with this Hatari version` and the
restore is abandoned. Convert it once, then use it like any other snapshot:

```sh
python3 research/damocles-st/scripts/memstate-rehost.py \
    --input /path/to/captured/dion-2-3.sav \
    --output research/damocles-st/snapshots/dion-2-3.sav
python3 research/damocles-st/scripts/memstate-rehost.py --input ... --inspect
```

Only the snapshot's IPF section changes. The tool re-decodes the 1 MiB ST RAM window
before and after and refuses to write if it differs, so the captured machine is
preserved exactly; the rehosted file is a different container, not a new capture.
Every memstate behind `payload/damocles/arrival-poses.json` was captured this
way and rehosted. All of them are Restricted Material and stay uncommitted; the
repository's `*.sav` rule already ignores them.

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
word, body selector, camera longwords and yaw — and reads the workspace cell
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

**The association list is bound per level.** `$7B0E` identifies whichever
structure the game walked, which at level 0 is the cell's authored instance and
above level 0 is the interior. The probe requires the cell instance's root at
level 0 and, above it, resolves the live root back to its structure slot and
reports it, because the static decode does not yet predict which structure a
level selects. A further gate then requires every catalogue resident naming the
captured scene to name an insertion group the bound structure actually offers.

See [the Dion and Vesta structure-group research](../../docs/research/damocles-dion-vesta-structure-groups.md)
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
