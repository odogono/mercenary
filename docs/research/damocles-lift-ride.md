# The Damocles Lift ride between Floors

Working-Authority Evidence for [#472](https://github.com/odogono/mercenary/issues/472),
part of the lift map [#470](https://github.com/odogono/mercenary/issues/470), recovered
2026-09-24. Authoritative Evidence remains bound to the C64 Reference Build. This note
records decoded ST facts only and does not translate the program into a new model
([ADR 0002](../adr/0002-separate-rom-research-from-implementation.md)). Captures, RAM,
the native listing and screenshots stay ignored Restricted Material under
`research/damocles-st/work/`; only addresses, decoded facts and hashes are recorded here.

It builds on [how the player operates a Damocles Lift](damocles-lift-control.md)
(#471), which recovered the order of events but not their timing.

## Decision

The ride was reached and traced VBL by VBL. It has **no ride animation**: the camera
does not move, the palette does not flash, and nothing is drawn beyond the lift car's
own doors and the Floor Label. A ride is five things in sequence:

1. **The doors close.** The key is admitted within a frame of the make code arriving.
   The door is pinned shut and animates closed: about **30 VBLs** in the State Office,
   **80** at Vesta. A door tone starts as the doors start moving, and a noise burst
   plays when they stop.
2. **The Floor Label steps**, one Floor every **25 VBLs**, along B, G, 1, … 9. The
   player's height and the bound structure do not change during this phase.
3. **One more 25-VBL period** after the label shows the destination, the **arrival**:
   the destination Floor's structure is bound, Y becomes
   `Floor × storey pitch + 63`, pitch is levelled (`$1FF`), X/Z and yaw are unchanged.
   When the Floor Table record has no palette of its own, the per-Floor palette is bound
   in the same instant.
4. **Sound on arrival:** channels B and C are silenced and the shared effect `$04C556`
   is played (a channel B tone under the envelope).
5. **The doors open** on the new Floor: 25–32 VBLs in the State Office, 80 at Vesta,
   with the same start tone and stop burst.

At 50 Hz ([display rate](damocles-display-rate.md)) a one-Floor ride in the State
Office is **81 VBLs**, 1.6 s, from the admission to the new structure, and about 110
VBLs, 2.2 s, until the doors are fully open. In general:

```text
arrival ≈ door-close time + 25 × (Floors the label steps + 1) VBLs
```

The Y rule holds at arrival for Floors 1, 2 and 10 in the State Office (Y 213, 363,
1563; storey 150), for Floor 0 on the way back (Y 63), and at Vesta for Floors 2 and 0
(Y 697, 63; storey 317).

## Working Authority and evidence

| Item | Value |
| --- | --- |
| Program SHA-256 | `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef` |
| TOS SHA-256 | `154803e3ff4851f3dc358b91b16d6b6110d187a81d8132ecb665af49878939d5` |
| Hatari | 2.6.1, binary `05723606c75a1f0642395974abdce2cbbe48b0a09a747f65cdfca7ef9201e11a` |
| Static source | `observe-first-world-20260818T101013Z-c5a32b7d/observed.ram`, `b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967` |
| State Office capture | `rehosted/eris-lift.sav`, `7ba0352ffc3b3b0d1195e9cbfaec09598d4edd49f3ae4dc1f9a516cacb3de5a9` ([rehosted by #471](damocles-lift-control.md#the-state-office-capture-rehosted)) |
| Vesta capture | `rehosted/vesta-transporter.sav`, `1590a28cf3d063e9bd5575ede79fc153d78c0f77a45d6a84cea9c2bb5fc1a280` |
| Probe | [`research/damocles-st/scripts/lift-ride-probe.py`](../../research/damocles-st/scripts/lift-ride-probe.py) |

| Window | SHA-256 |
| --- | --- |
| Arrival and rebind `$055B12`–`$055C79` | `bc52f064ae17f624abd3de7bbcb13c989cbcf0c0f08eff812e6c974102fcee56` |
| Substep loop `$059542`–`$059585` | `b0f11f0bef584d4464d95ddc21bf996240e93766ae26a5b6296ef2c12b42c415` |
| Frame wait `$059992`–`$0599B7` | `115447f090cf8542d10b5d83e8a1ed6af9f69a9703a4aad4a62ca1d6e3853fbb` |
| VBL clock `$051E34`–`$051E39` | `55949f44fefa308bbc994c7ccb922371f824966885931029feb98388843a1bba` |
| Sound request `$054848`–`$054883` | `a78724afcc36e687e34c68e6b10dcf5f89d7b4a4fc03d8dc12dfca70c9e20caf` |
| Arrival effect `$04C556`–`$04C5A7` | `e21df528ecdf9e6db1a54f9991e5e62b7a2ff1cb11bcb7e553380a6a46c9ccb5` |
| Door sound edges `$05A9DC`–`$05AA3B` | `95cc56d36ab788c9119e72e99a75c2e28f90371a6abb630668846d2ae1ae8da0` |
| Door start effect `$04C37A`–`$04C3C5` | `1aaf53eaab621f63178ae439e17978c2a03b3047b809d9bb43133a3b00ac5982` |
| Door stop effect `$04C2B8`–`$04C303` | `8db1b9eb4884ea84ceb35617f5490147330b3674a8dd63c18051a20ae6af8af0` |

`lift-ride-probe.py decode` recomputes these hashes and checks 21 instruction sequences
byte for byte before anything below is trusted.

## Why the step is 25 VBLs: substeps

The step countdown `$788E` ticks once per call of the step routine `$055A6E`
([#471](damocles-lift-control.md#stepping)), and the frame loop does not call it once
per drawn frame. It calls it once per **substep**:

```text
059992  ... wait for $051D98 to change      ; $051E34 adds 1 to $051D96 every VBL
0599A0  addq.w  #1, $7ae8                   ; frames drawn
0599B2  move.w  d0, $51d22                  ; VBLs the last frame took
059542  move.w  $51d22, d0                  ; clamp to 4..8
05955C  move.w  d0, $5948a                  ; substeps this frame
059562  tst.w   $788a / bsr $55a6e          ; the lift step, if a ride is pending
05956C  bsr     $57cc2                      ; movement
059570  bsr     $5aa3c                      ; door animation
05957E  subq.w  #1, $5948a / bne $59562
```

So the game runs one substep per VBL elapsed, as long as a frame takes between 4 and 8
VBLs. Every traced frame took 4 to 9 VBLs, so the 25-tick period was 24–26 VBLs
throughout. A frame faster than 4 VBLs would make the ride faster in real time, and a
frame slower than 8 would make it slower. Neither happened in these rides. The door
animation runs in the same substep loop, which is why door times are also stated in
VBLs.

## The ride, VBL by VBL

VBL 0 is the first stop at which `$788A` holds the destination. The stop before it
shows no ride pending, so every admission is bracketed to one VBL. The make code was
first seen in the mailbox `$05558C` 1 to 5 VBLs before that, which is within one drawn
frame.

State Office, run `lift-ride-eris-20260924T160438Z-546c9d42`:

| Ride | Door closed | Label steps (VBL: label) | Arrival | Rebind | Door open |
| --- | ---: | --- | ---: | --- | ---: |
| G → 1 | 28 | 56: `1` | 80–81 | `$014F26` → `$0152EA` | 106 |
| 1 → 2 | 31 | 56: `2` | 81 | `$0152EA` (slot 78 both) | 111 |
| 2 → B | 30 | 55: `1`, 80: `G`, 105: `B` | 130–131 | `$0152EA` → `$0155E6` | 163 |
| B → G | 32 | 56: `G` | 80 | `$0155E6` → `$014F26` | 109 |

Vesta, run `lift-ride-vesta-20260924T160459Z-021895f2`:

| Ride | Door closed | Label steps (VBL: label) | Arrival | Palette | Door open |
| --- | ---: | --- | ---: | --- | ---: |
| B → 2 | 16 | 40: `G`, 64: `1`, 88: `2` | 116 | `$D69A` → `$DC2C` | 197 |
| 2 → G | 80 | 105: `1`, 129: `G` | 154–155 | `$DC2C` → `$D69A` | 235 |

Vesta's first door close is short because the door was already opening when the key
landed. The teleport had just put the player beside it, and the admission reversed it
part-way. The second ride starts from a fully open door: 80 VBLs.

Each case was run four times with the probe. From the admission on, the four State
Office runs gave the same VBLs to the one. The four Vesta runs differ only in the first door close (12 or 16
VBLs, depending on where the key landed against the opening door).

**The arrival can straddle a VBL.** At VBL 80 of G → 1, `$788A` is already `$FFFF` and
Y already 213, but the root is still the old structure and `$7B34` reads `$C000`.
That is the placeholder `$055BA6` writes before `$59D70` assembles the new structure.
One VBL later the new root is bound and the region walk has published the lift car
again (`$2001`). Nothing is drawn in between; the draw that follows shows the new
Floor.

**What is drawn.** A screenshot at every stop shows the State Office lift car from
inside, facing the doors, with the Floor Label beside them. From the key onwards: the
doors close; the view holds still while the label changes at each step; the doors
open on the new Floor's landing. There is no fade, flash, shake or camera movement.
At Vesta the landing seen through the opening doors carries its own `2`. The
palette binding switches at the arrival instant, and the car's own walls look the
same before and after it.

## The arrival, completely

`$055B12`–`$055B88` ([#471](damocles-lift-control.md#arrival)) followed by the rebind
`$055BA6`–`$055C78`:

| Address | Effect |
| --- | --- |
| `$055B16` | `$788A` ← `$FFFF`: no ride pending |
| `$055B1C`, `$055B20` | clear `$7B02` and `$7BC8` (named only) |
| `$055B2E`–`$055B52` | only if the record's palette byte (record+4) is zero: bind palette `$04BD16[record+18+Floor]` into `$7A0E`/`$7A12`/`$7A14` |
| `$055B56`–`$055B72` | `$7AC4` and the Floor Label |
| `$055B78`–`$055B80` | Y low word ← Floor × `$7B00` + 63 |
| `$055BA6` | structure-local eye `$79AA` ← 63; **pitch `$7AC0` ← `$1FF`** (level) |
| `$055BB4`, `$055BBC`, `$055C00` | clear `$070108`, `$070100` (named only) |
| `$055BC4` | `$7AAE` ← 1 (on foot), `$7AB0` ← `$FFFF` |
| `$055BCC` | `$7B34` ← `$C000` until the region walk runs |
| `$055BDC` | `$59D70`: assemble the Floor's structure |
| `$055BE0`–`$055BF8` | structure-local X/Z from the pose, which the arrival does not move |
| `$055BFC`, `$055C08`, `$055C0C` | the region walk `$5A64A`, the resident list `$52C9C`, the throttle preset `$54744` |
| `$055C18`–`$055C72` | YM: register 9 (channel B volume) ← 0, register 10 (channel C volume) ← 0, register 7 (mixer) ← the shadow `$7C04`, register 6 (noise period) ← `$1F`; each skipped if `$033F68` is non-zero |
| `$055B88` | `bra $054848`: the shared sound request |

Yaw (`$7AC2`) is not written: the player faces the same way on the new Floor. Every
lift capture already has pitch `$1FF`, so levelling it changes nothing a player in a
lift would see unless they had looked up or down.

**Palette.** Of the two captured lift structures, only Vesta's record leaves the
palette byte zero. Its per-Floor bytes bind palette index 30 (`$D69A`) on Floors 0, 1,
3 and 10, and index 71 (`$DC2C`) on Floor 2. The State Office's record carries its own
palette (`$1A`), so its rides never rebind one. The probe predicts each arrival's
binding from the capture's record and raises if the trace differs.

## Sound

Hatari runs with sound off in this laboratory. What follows is the PSG programme the
game arms, recovered statically and confirmed armed at the traced VBLs; nothing
audible was heard or is claimed
([as for other effects](damocles-first-offer.md#sound-request-is-not-emitted-sound)).

- **Doors.** The door animation raises `$5A9D8` on every pass in which a door is moving
  (`$05AAA4`, `$05AC00`). `$05A9EE`–`$05AA3A` compares it with the previous pass. On a
  rising edge it arms `$04C37A` in the second sound vector `$04BF58`: channel C tone
  period `$0400`, volume 15, with the mixer's channel C tone and noise both enabled
  (the bits are active-low; `andi #$DB`), then the continuation `$04C3EA`. On a
  falling edge it arms `$04C2B8`: noise period `$1F`, channel C noise on and tone off
  (`andi #$DF`, `ori #$04`), then
  `$04C328`, `$04C220` and `$04C250`. Both set `$04BF20` to the table at `$04C43C`. The
  traces show `start` at VBL 0 and at the arrival, and `stop` when each door stops. So
  a ride is a door tone and burst, silence while the label steps, and then the pair
  again as the doors open. Every door shares this; it is not lift-specific.
- **Arrival.** The YM writes above cut channels B and C. `$054848` then arms `$04C556`
  in `$04BF54` (`$7A0C` was zero in every run): channel B tone period `$60`, envelope
  period `$1F00`, shape 9 ([the shared effect](damocles-script-isa.md#the-native-routines-the-handlers-call-136)).
  The trace sees it armed at the arrival VBL. It disarms itself one VBL later, and
  `$7A78` counts 15 down to 0 over the next 8 VBLs.
- **While the label steps** neither vector is armed. The step routine writes no PSG
  register.

## Runs

```sh
python3 research/damocles-st/scripts/lift-ride-probe.py decode
python3 research/damocles-st/scripts/lift-ride-probe.py live --roms roms --case eris
python3 research/damocles-st/scripts/lift-ride-probe.py live --roms roms --case vesta
```

`live` boots one rehosted memstate with fast-forward off, arms a chain over the command
FIFO that stops on **every VBL**, and saves at each stop `$7800`–`$7CFF`, the
attachment words, the Floor Label, the program's VBL and frame clocks, the substep
count, both sound vectors, the key mailbox, the door-sound flags and a screenshot.
Keys go in as `hatari-event` while the chain runs, each once the previous ride has
settled for 100 VBLs. Host timing only decides which VBL a key lands on. The probe
raises if the program's own VBL clock `$051D98` fails to advance by exactly one
between any two stops, so no VBL is missed.

For each ride it raises unless: the admission is bracketed by two stops and pins the
door; the countdown does not move while the door is moving; the label shows exactly
the route #471 decoded; Y, the root and X/Z do not move before the arrival; at arrival
Y = Floor × storey + 63, X/Z and yaw are unchanged, pitch is `$1FF`, the root changes
whenever the two Floors' slots differ, and the palette is the one the record
predicts. A case whose precondition fails (not in a lift, a key not admitted, no
arrival within 1200 VBLs) raises as *not reached*.

The `vesta` case makes #471's one intervention, at the chain's first stop. It writes
the pose X/Z low words and the structure-local copies to put the player at (−1800,
−285), the middle of lift region 0 (X −2070..−1530, Z −570..0), because the capture
stands in a corridor on Floor 10. It writes nothing else.

**Harness notes (Hatari 2.6.1).** A chain armed during the memstate restore, or from
the `<memstate>.debug` file Hatari replays after one, stops after its first stop. A
state this Hatari saves (from a breakpoint, or over the FIFO after `hatari-stop`)
restored with the same fault, so the probe keeps every case in one process started
from a rehosted memstate. Hatari runs with stdin at `/dev/null`: it re-enters its
prompt after each stop, and a prompt reading an open, empty stdin blocks the chain.

## For #470's ride-presentation task (#476)

What the port can present as recovered:

- **Doors:** on admission, the lift car's door closes (it is pinned shut with the
  `$80` override, [#471](damocles-lift-control.md#the-key-path)); the ride waits until
  it is closed.
- **Label:** it then steps one Floor per 25 VBLs (0.5 s at 50 Hz), showing each Floor
  passed.
- **Arrival:** 25 VBLs after the label shows the destination, rebind the Floor's
  structure in one step, set Y, level the pitch, keep X/Z and yaw, bind the per-Floor
  palette when the record has none, and let the door open.
- **Nothing else is drawn:** no transition, fade or camera motion.
- **Sound:** door-start tone and door-stop noise burst for every door movement; channels B/C
  cut and the shared `$04C556` effect on arrival. The effects' PSG programmes are
  above; what they sound like was not heard.
- **Timing basis:** the port should count 25 substeps per step, and a substep is a VBL
  while frames take 4–8 VBLs. Door speed is the attachment animation's, and it differs
  per door: about 30 VBLs in the State Office, 80 at Vesta.

## What this does not settle

- **Door animation speed per attachment.** Measured for two doors, not decoded: the
  rate lives in the attachment animation at `$05AA3C`, beyond this note.
- **Moving during a ride.** The runs held no input. Movement `$57CC2` still runs every
  substep, and the region is frozen for the ride ([#471](damocles-lift-control.md#who-writes-788a-and-what-ffff-means)).
  Whether the player can walk about the car mid-ride was not examined.
- **`$7BC8`, `$7AB0`, `$070100`, `$070108`**, which the arrival clears or sets, are
  named only.
- **Frames faster than 4 VBLs or slower than 8**, where substeps stop tracking VBLs,
  were not observed.
- **Where the Floor Label is drawn** stays [#473](https://github.com/odogono/mercenary/issues/473).
  The screenshots show it drawn in-world beside the door, changing at each step.
