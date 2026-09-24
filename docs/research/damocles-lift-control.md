# How the player operates a Damocles Lift

Working-Authority Evidence for [#471](https://github.com/odogono/mercenary/issues/471),
part of the lift map [#470](https://github.com/odogono/mercenary/issues/470), recovered
2026-09-24. Authoritative Evidence remains bound to the C64 Reference Build. This note
records decoded ST facts only and does not translate the program into a new model
([ADR 0002](../adr/0002-separate-rom-research-from-implementation.md)). Captures, RAM,
the native listing and screenshots stay ignored Restricted Material under
`research/damocles-st/work/`; only addresses, decoded facts and hashes are recorded here.

## Decision

A Damocles Lift is **a structure region whose flags word has bit 13 (`$2000`) set**.
There is no lift object, attachment or structure type. While the player is on foot in
such a region, and the word `$7882` is zero, the keyboard dispatcher turns eleven ST
keys into a Floor request:

| Key (ST make code) | Floor requested |
| --- | --- |
| `1`–`9` (`$02`–`$0A`) | 1–9 |
| `0` (`$0B`) | 10 |
| `B` (`$30`) | 10 |
| `G` (`$22`) | 0 |
| `Esc` (`$01`) | 0 |

A request is **refused** when its Floor is the one the Floor Label shows now, or when
the Floor Table leaves that Floor zero. An admitted request writes the Floor to the
destination word `$788A`, pins the lift's door shut, and the lift then steps the Floor
Label one Floor at a time, one step every **25 ticks** of the countdown, until it shows
the destination. One step later it binds the destination Floor's structure and moves
the player to `Floor × storey pitch + 63`. `$788A = $FFFF` means **no ride is pending**.

The step order is **B, G, 1, 2, … 9**: Floor 10 sits *below* Floor 0 in the lift's
order, even though it is the highest Floor in the structure's coordinates
([level binding](damocles-level-structure-binding.md#the-level-domain-is-0-to-10-and-the-game-says-so)).
Stepping never reads the Floor Table, but every authored table is contiguous in that
order, so no ride passes an unbound Floor. The player can only leave a building on
Floor 0: no structure bound above Floor 0 has a region the player can walk outdoors
from.

## Working Authority and evidence

| Item | Value |
| --- | --- |
| Program SHA-256 | `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef` |
| TOS SHA-256 | `154803e3ff4851f3dc358b91b16d6b6110d187a81d8132ecb665af49878939d5` |
| Hatari | 2.6.1, binary `05723606c75a1f0642395974abdce2cbbe48b0a09a747f65cdfca7ef9201e11a` |
| Static source | `observe-first-world-20260818T101013Z-c5a32b7d/observed.ram`, `b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967` |
| Probe | [`research/damocles-st/scripts/lift-control-probe.py`](../../research/damocles-st/scripts/lift-control-probe.py) |

Static recovery disassembles bounded windows of the pinned first-world RAM with
Capstone's M68K decoder, and scans `$10000`–`$5FFFF` for every reference to the words
named here, so each "only writer" below is bounded rather than assumed.

| Window | SHA-256 |
| --- | --- |
| Dispatch `$0555DC`–`$055611` | `a3e900fd56435d6cc2dc4854575f16215f95312aa638422b0928d86e07d787b4` |
| Step and request `$055A6E`–`$055B11` | `b41c1aebbb6b67dd7dbd2e935691e34e4f8ebb7ae1d37aca7fb4d8493144bbf3` |
| Arrival `$055B12`–`$055B8D` | `f9b6be99de73b1821f366b3f80c248598a7540f03fd0e82bf8a18948d2dee1ab` |
| Entry at Floor 0 `$055B8E`–`$055BA5` | `f7dc9951f8f7e132073397304f31640830b8e205d590677ebdf1442337151b0e` |
| Frame gate `$059562`–`$05956B` | `59346dc6977db3b1a974680f73dd28053a56e2ef89b224040690c2424e8bc718` |
| Region freeze `$05A35C`–`$05A385` | `074b409416f11de731b36a5acdbffc132a3b932cc23ca04613d9583b5e8c2969` |
| Pose mirror `$058F78`–`$058F87` | `42672a59a4fba45ad2de3422c5d2eb5ad386dfe09c9ff114b02f37a043e75fdd` |

### The State Office capture, rehosted

`damocles.eris.lift.sav` stands inside the Eris State Office lift (cell 9,8,
`eris-surface-89`) on Floor 0. It was saved on the IPF-capable Hatari build, so the
pinned build cannot restore it as-is. It is rehosted by the tracked container
conversion, which rewrites only the IPF section and refuses to write if the 1 MiB RAM
window changes ([rehosting](damocles-object-drops.md#rehosting)):

```sh
python3 research/damocles-st/scripts/memstate-rehost.py --roms roms \
  --input research/damocles-st/snapshots/damocles.eris.lift.sav \
  --output research/damocles-st/snapshots/rehosted/eris-lift.sav
```

| Artifact | SHA-256 |
| --- | --- |
| `damocles.eris.lift.sav` (original) | `e2443c3bfa05f3755e67289d5e332cf03b57675b189fb5a3a8258aa2a69cc126` |
| `rehosted/eris-lift.sav` | `7ba0352ffc3b3b0d1195e9cbfaec09598d4edd49f3ae4dc1f9a516cacb3de5a9` |
| RAM window, both files | `6bbc01606058f805a54a8497469f571099889e3f6407eeef1166ceb11e3b9567` |

A second run of the same command wrote a byte-identical file. The Vesta runs use the
existing `rehosted/vesta-transporter.sav`
(`1590a28cf3d063e9bd5575ede79fc153d78c0f77a45d6a84cea9c2bb5fc1a280`). Both files live
in the main checkout's ignored `snapshots/rehosted/`.

## What marks a lift: bit 13 of the region flags

The region walk at `$05A332` tests the player's structure-local X/Z (`$79A8`/`$79B0`)
against the fourteen-byte records at `$B23C` (flags, then `x0, x1, z0, z1`, then a
pointer) and publishes the flags of the region it accepts in `$7B34` (`$05A3C0`). The
dispatcher's `btst #$D,$7B34` addresses a byte, so it tests bit 5 of the high byte:
bit 13 of the word, `$2000`.

In the State Office capture the player stands at (−879, 0), inside region 4
(X −890..−610, Z −95..100), flags `$2001`. Regions 3 and 4 are the two lift cars;
regions 1 and 2 (`$03F9`, `$03F5`) are the doorways into them at X −610..−600.
`$7AE6` holds `$3F4`, the attachment slot of region 2's doorway, with its latch
`$5A41 + $3F4` at `$FF`, fully open.

The Catalogue's published region flags agree across every structure:

- Every structure a Floor Table binds above Floor 0, and whose regions the Catalogue
  publishes, has at least one region with bit 13 set. Five records publish no regions
  at all and cannot be checked this way.
- No structure bound only at Floor 0 has a bit-13 region. The Capital Spaceport has
  none, and its captures (`eris-spaceport-onfoot`, `interior-window`) have none.
- No structure bound above Floor 0 has a region with bit 14 set, the outdoor bit the
  board gate tests ([vehicle key gate](damocles-vehicle-key-gate.md)). See
  [Leaving on a Floor above 0](#leaving-on-a-floor-above-0).

## The key path

The ACIA handler stores each make code in the mailbox `$05558C`. The dispatcher at
`$0555B8` reads it through `$7B5E`:

```text
0555DC  cmpi.w  #$1, $7aae.w     ; on foot?
0555E2  bne.b   $5561c           ; no: not a lift key
0555E4  tst.w   $7882.w          ; another digit-key mode?
0555E8  bne.b   $55614           ; yes: $59184 takes digits instead
0555EA  btst.b  #$d, $7b34.w     ; current region's lift bit
0555F0  beq.b   $5561c           ; clear: not a lift key
0555F2  move.b  d0, d1
0555F4  cmpi.b  #$c, d1
0555F8  bmi.w   $55ae0           ; $01..$0B: Esc, 1..9, 0
0555FC  subi.b  #$21, d1
055600  cmpi.b  #$1, d1
055604  beq.w   $55ae0           ; $22: G, reaching $055AE0 with d1 = 1
055608  subq.b  #$4, d1
05560A  cmpi.b  #$b, d1
05560E  beq.w   $55ae0           ; $30: B, with d1 = $B
```

`$7AAE` is 1 on foot ([board and leave](damocles-board-leave-paths.md)). A lift key
that fails a test falls through to the ordinary dispatch at `$05561C`. While `$7882` is non-zero, `$059184` takes the digit keys instead; that handler
indexes the resident association bytes at `$73A8`. `$053950` copies `$7B40` into
`$7882`, and `$0531F8` and `$05A730` clear it. This note does not recover what that mode
is. Every lift capture reads `$7882` as 0.

The three branches are the only references to `$055AE0`. It turns the key into a
Floor and decides whether to admit it:

```text
055AE0  ext.w   d1
055AE2  subq.w  #$1, d1          ; the Floor: make code minus one, or 1-1, or $B-1
055AE4  cmp.w   $7ac4.w, d1
055AE8  beq.w   $55b8c           ; the Floor the Floor Label shows now: refuse
055AEC  movea.l $7c1e.w, a0
055AF0  move.b  (a0, d1.w), d0
055AF4  beq.w   $55b8c           ; the Floor Table leaves it zero: refuse
055AF8  move.w  d1, $788a.w      ; admit: the destination
055B04  move.b  #$80, $5a42(a0)  ; a0 = $7AE6: pin that door shut
055B0A  move.b  #$1, $5a41(a0)   ;          and set its latch moving
```

Both refusals branch to `$055B8C`, a bare `rts`, so a refusal changes nothing and
requests nothing. `$055AE8` compares
with `$7AC4`, the Floor the label shows, not with `$788A`. During a ride that is the
Floor the label is passing through. A key for any other bound Floor, the pending
destination included, is admitted again and replaces `$788A`.

`$7AE6` is the attachment slot of the last doorway region the walk accepted
(`$05A372`). `$80` in the high byte of `$5A42 + slot` is the "negative, bit 14 clear"
override that re-closes the leaves whether or not the player is in the Proximity Box
([entrance attachments](damocles-generic-entrance-attachments.md#the-live-condition-predicate-is-the-carried-stack--confirmed)).

## Who writes `$788A`, and what `$FFFF` means

A scan of `$10000`–`$5FFFF` finds four writers and four readers:

| Address | Operation |
| --- | --- |
| `$05597E` | `$FFFF`, in the routine at `$0558F4` that the Help menu (`$62` to `$0558AE`) enters on F10 (`$44`) |
| `$05944C` | `$FFFF`, in the reset at `$05942E` |
| `$055AF8` | the requested Floor, the only non-negative write |
| `$055B16` | `$FFFF`, on arrival |
| `$059562` | the frame loop's gate: `bmi` skips the step routine |
| `$05A35C` | the region walk: `bpl` skips region reselection for the whole ride |
| `$055A88`, `$055B12` | the step routine and arrival read the destination |

So `$FFFF` is "no ride pending", not a Floor. `$05A35C` means the player's region, and
with it `$7B34` and `$7AE6`, stays frozen from the request to the arrival. That is why
a second key is still admitted during a ride.

## Stepping

`$059562` calls `$055A6E` once per frame loop while `$788A` is non-negative:

```text
055A6E  lea/adda $7ae6 -> a0
055A76  tst.b   $5a41(a0)        ; door still moving?
055A7A  bne.b   $55ade           ; wait
055A7C  subq.w  #$1, $788e.w     ; step countdown
055A80  bne.b   $55ade
055A82  move.w  $788c.w, $788e.w ; reload: 25
055A88  move.w  $788a.w, d0      ; destination
055A8C  move.w  $7ac4.w, d1      ; the Floor the label shows
055A90  cmp.w   d1, d0
055A92  beq.w   $55b12           ; there: arrive
055A96  bmi.b   $55a9e           ; destination below: down
055A98  cmpi.w  #$a, d0          ; destination 10 is always down
055A9C  bne.b   $55ab2           ; otherwise: up
055A9E  cmpi.w  #$a, d1          ; down from 10 is 0
055AA4  subq.w  #$1, d1          ; down from 0 is 10
055AB2  addq.w  #$1, d1          ; up
055AB4  move.w  d1, $7ac4.w
055AB8  ...                      ; the Floor Label into $CD04
```

As a function of the Floor the label shows (`c`) and the destination (`d`):

```text
if d < c or d == 10:  next = 0 if c == 10 else (10 if c == 0 else c - 1)
else:                 next = c + 1
```

That is a walk along **B, G, 1, …, 9**, with B below G. The State Office's 2 → B goes
2, 1, G, B, and B → 1 goes G, 1. `$788C` is 25 in every capture and in the first-world
RAM, and nothing in the scanned range writes it, so the period is a constant. The
countdown runs only once the door latch reads 0 (closed). The step writes only `$7AC4`
and `$CD04`. The player's height, the bound structure and the region stay as they were
until arrival.

**Floors the table leaves at zero.** Stepping never reads the Floor Table. The
Catalogue's multi-Floor records author thirteen distinct sets of Floors, from `{0, 1}`
through `{0, …, 10}`, and each is `{0, 1, …, n}` or that set plus 10. Each is
therefore contiguous in step order, and no ride between two bound Floors passes an
unbound one. The State Office is `{0, 1, 2, 10}`: its zeros, 3 to 9, lie beyond 2 in
step order and B is next to G, so the lift never shows them. The probe's `decode`
checks the step rule against the routes quoted here.

## Arrival

When the label reaches the destination, the next expiry takes `$055A92` to `$055B12`:

```text
055B12  move.w  $788a.w, d1
055B16  move.w  #$ffff, $788a.w  ; no ride pending
055B1C  clr.w   $7b02.w
055B24  ... table[d1]; zero returns without moving (not reachable from a ride)
055B2E  ... per-Floor palette when the record's own palette byte is zero
055B56  move.w  d1, $7ac4.w
055B5A  ... the Floor Label into $CD04 again
055B78  mulu.w  $7b00.w, d1      ; Floor x storey pitch
055B7C  addi.w  #$3f, d1         ; + 63
055B80  move.w  d1, $7ab8.w      ; the eye height's low word
055B84  bsr.w   $55ba6           ; rebind the Floor's structure (level binding)
```

X and Z are not written, so the player arrives where they stood. `$058F78` copies the
pose block `$7AAE`–`$7ACD` to `$7A8E`–`$7AAD` every frame, which is why `$7AA4` always
equals `$7AC4` in a settled capture. `$7AC4` is the live Floor and `$7AA4` its
committed copy.

## Entering, leaving, and Floor 0

`$055B8E` sets the Floor on entering a structure, from the cell-change path at
`$054BB2` (on foot) and from the leave path at `$0544E4`/`$054504`. If `$7B02` is
positive, it arrives at that Floor through `$055B1C`. Otherwise it clears `$7AC4`, sets
the label to `G` and rebinds the ground structure. `$7B02` is set from `$7AA4` when the
player leaves a craft (`$05924A`, `$05947C`), after `$059216` has copied the craft's
resident level byte (`$73AA` + slot × 4) into `$7AC5`. `$7B02` reads 0 in every
capture, so a walk into a building starts on Floor 0. The runs here did not observe an
entry.

### Leaving on a Floor above 0

The player cannot. On Floor 2 of the State Office (slot 78) the structure has ten
regions: four flagged `$0001`, the two lift cars (`$2001`), and four doorways. None
has bit 14 or bit 15, and the ground structure's `$8000` hall and `$C000` surroundings
do not exist there. Walking straight out of the lift on Floor 2 crosses the doorway and
the landing, then stops at X −412, against the ten-unit wall between region 8
(X −600..−400) and region 7 (X −390..290). The Floor stays 2 and nothing rebinds. Floor 10 (slot 79) has seven: two `$0001`, the two lift cars and three
doorways, again with neither bit. Across the
Catalogue, no structure bound above Floor 0 has a bit-14 region. The only way down is
the lift.

## Runs

`lift-control-probe.py live` boots one rehosted memstate with fast-forward off, sends
make codes through the command FIFO, and samples `$7800`–`$7CFF`, the attachment words,
`$CD00`, the region table and `$10000`–`$1FFFF` while the emulator is stopped. Nothing
is written into the guest except in `vesta-teleport`. Each case raises when a sample
contradicts the decode, and raises as *not reached* when its starting state is wrong.
All eight commands below pass.

```sh
python3 research/damocles-st/scripts/lift-control-probe.py decode
python3 research/damocles-st/scripts/lift-control-probe.py live --roms roms --case ride
python3 research/damocles-st/scripts/lift-control-probe.py live --roms roms --case keys
python3 research/damocles-st/scripts/lift-control-probe.py live --roms roms --case retarget
python3 research/damocles-st/scripts/lift-control-probe.py live --roms roms --case walk-out-0
python3 research/damocles-st/scripts/lift-control-probe.py live --roms roms --case walk-out-2
python3 research/damocles-st/scripts/lift-control-probe.py live --roms roms --case vesta-outside
python3 research/damocles-st/scripts/lift-control-probe.py live --roms roms --case vesta-teleport
```

| Run | Case | Observed |
| --- | --- | --- |
| `lift-control-ride-20260924T145521Z-0dc6bde1` | State Office, Floor 0 | `3` refused (table zero); `G` refused (current). `2`: `$788A` 2, door override `$80`, latch 1 then 0; label G, 1, 2; then `$788A` `$FFFF`, Y 363, root `$014F26` → `$0152EA`. `B`: label 2, 1, G, B; Y 1563, root `$0155E6`. `1`: label B, G, 1; Y 213, root `$0152EA` |
| `lift-control-keys-20260924T145541Z-1809f4a8` | State Office | `0` requests 10 and arrives at B; `Esc` requests 0 and arrives at G |
| `lift-control-retarget-20260924T145550Z-84d6822e` | State Office | `2` then `1` while the door closes: `$788A` 1, arrives at Floor 1 |
| `lift-control-walk-out-0-20260924T145701Z-a8d6e51d` | State Office, Floor 0 | stick up: from (−879, 0) to (278, 0), region `$8000`, Floor 0 |
| `lift-control-walk-out-2-20260924T145727Z-ea9c9793` | State Office, Floor 2 | stick up: stops at (−412, 0), region `$0001`, Floor 2 |
| `lift-control-vesta-outside-20260924T145558Z-e862e027` | Vesta, Floor 10, corridor | `1` refused although Floor 1 is bound: region flags `$0001` |
| `lift-control-vesta-teleport-20260924T145640Z-be8171d0` | Vesta, Floor 10, in the lift | `G`: label B, G in **one** step; Y 3233 → 63, root `$017B4A` → `$017834`. `3`: label G, 1, 2, 3; Y 1014, region `$A000`, root `$0182EC`. `5` refused (table zero) |

**The one intervention.** The Vesta transporter capture stands on Floor 10 in a
corridor (region 7, `$0001`), not in the lift. `vesta-teleport` writes the pose's X/Z
low words (`$7AB4`, `$7ABC`) and the structure-local copies (`$79A8`, `$79B0`) to put the
player at (−1800, −285), the middle of lift region 0 (X −2070..−1530, Z −570..0).
Movement advances both copies together (`$057DCA`–`$057DE0`, `$058E10`–`$058E1C`). Only
this case writes anything, and it writes nothing else. The region walk published
`$2001` from that position by itself, and `$7AE6` already named the lift's doorway,
`$3FC`. The keys and the ride that follow are ordinary gameplay from that state. Writing
the pose low words alone left the region at `$0001`: the walk reads the local copy.

Host timing is not emulator time, so these runs show the order of events, not how long
they take. The step period is the constant 25 read from RAM. Its duration in frames and
the ride's presentation belong to
[#472](https://github.com/odogono/mercenary/issues/472).

### The decode gate reproduces every in-structure capture

`decode` reads eleven memstates without Hatari and raises unless each reproduces the
rules above: Floor 0–10, `$7AA4` = `$7AC4`, the label rule, Y = Floor × `$7B00` + 63,
a non-zero Floor Table entry for that Floor, `$788A` = `$FFFF`, `$788C` = 25, and a
region-table walk from the stored position that yields the stored `$7B34`.

| Capture | Floor | Label | Y | Storey | `$7B34` | In a lift | Lift regions |
| --- | ---: | --- | ---: | ---: | --- | --- | --- |
| `damocles.eris.lift` | 0 | G | 63 | 150 | `$2001` | yes | 3, 4 |
| `damocles.vesta.transporter` | 10 | B | 3233 | 317 | `$0001` | no | 0, 2 |
| `vesta-parliament-4-6` | 0 | G | 63 | 317 | `$C000` | no | 15, 20 |
| `damocles.eris.transporter.11-8` | 10 | B | 1163 | 110 | `$0001` | no | 0 |
| `damocles.dion.transporter` | 1 | 1 | 213 | 150 | `$8000` | no | 0 |
| `damocles.gaea.transporter` | 1 | 1 | 213 | 150 | `$8000` | no | 0 |
| `damocles.metis.transporter` | 9 | 9 | 1413 | 150 | `$8000` | no | 0 |
| `damocles.logos.transporter` | 4 | 4 | 703 | 160 | `$8000` | no | 0, 5 |
| `damocles.pan` | 1 | 1 | 213 | 150 | `$8000` | no | 0 |
| `interior-window` | 0 | G | 63 | 180 | `$8000` | no | — |
| `eris-spaceport-onfoot` | 0 | G | 63 | 180 | `$C000` | no | — |

## For #470's lift-control task

What the port can bind and implement from this note without inventing anything:

- **Where:** the player is in a Damocles Lift while on foot in a structure region whose
  flags have bit 13. The Catalogue already publishes region flags.
- **Keys:** `1`–`9` for Floors 1–9; `0` and `B` for Floor 10; `G` and `Esc` for Floor 0.
  The port's key map chooses the host keys; these are the ST's.
- **Refusal:** silently, when the Floor is the one the label shows or the Floor Table
  leaves it zero.
- **Stepping:** along B, G, 1, …, 9, one Floor per step, the label showing each Floor
  passed. A new admitted key replaces the destination mid-ride; the key for the Floor
  the label currently shows is refused.
- **Arrival:** `$788A` cleared, the Floor's structure bound, Y = Floor × storey pitch + 63,
  X/Z unchanged.
- **Entry:** a walk into a building starts on Floor 0 (decoded, not observed live).

## What this does not settle

- **Ride presentation and timing** ([#472](https://github.com/odogono/mercenary/issues/472)):
  how many frames a countdown tick is, what the door does on arrival (the samples show
  the new structure's latch at 1, moving), and whether anything besides the label is
  drawn during the ride.
- **Where `$CD04` is drawn** ([#473](https://github.com/odogono/mercenary/issues/473)).
- **What `$7882` means**, the mode in which digit keys go to `$059184` instead of the lift.
- **Sound.** Not examined. The runs had sound off.
