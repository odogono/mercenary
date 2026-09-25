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
| Sound probe | [`research/damocles-st/scripts/lift-sound-probe.py`](../../research/damocles-st/scripts/lift-sound-probe.py) (#508) |

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
| Vector calls `$051DFE`–`$051E1D` | `da17332acf0c6ce1e2829ebc03ca81804e585674e573100761a338704b918762` |
| Tick hold-off `$051D24`–`$051D73` | `3dcd7cda9cfec2e783373210157225fa766de64fa19a41ef370d9bb610fe4fc2` |
| Restore and idle `$04C220`–`$04C2B7` | `997e48cabccb4a650e7a74b4d655623dd7cd93814c50f68ecbf9b2daf9f5ae6c` |
| Burst and its step `$04C2B8`–`$04C379` | `d562cbadec1a5b44a5fa06eb346c5548c44fc11a11503d5ec38ca37de9b0bda6` |
| Door tone and its step `$04C37A`–`$04C43B` | `9465b7a5adb4e025451b6b463bca63e9f45c9926f237ab2947f4a34ef48c4bc1` |
| Door tables `$04C43C`–`$04C46F` | `d58e00f9b677a5cd7f2b2fd0f0d258068dd4f24df20ef1d77ff7f91ba1d7d999` |
| Effect tail `$04C5EC`–`$04C60F` | `08074cfe7fe158cd50c90c4c4387d0fce21b62d508d54047e30b8dbc3d05c87e` |
| Table walks `$04C722`–`$04C75B` | `9032960176eb2adb67023bb4c838e9e9566d94ca3f95c7a62ebd9f132ee422a8` |

`lift-ride-probe.py decode` recomputes the first nine hashes and checks 21 instruction
sequences byte for byte before anything below is trusted. Since #509 it also checks the
movement windows and ten more sequences, for
[moving during a ride](damocles-lift-ride-movement.md). `lift-sound-probe.py decode`
does the same for the driver windows, and checks the 20 byte sequences, the tables among
them, that [the programmes](#what-the-programmes-play) are read from.

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

## Where the Floor's structure is drawn

The arrival moves the eye up a Floor but leaves the structure-local eye height at 63.
The game keeps the structure-local eye as three longs: X at `$79A6`, Y at `$79AA` and
Z at `$79AE`, and reads their low words `$79A8`, `$79AC` and `$79B0`. The structure
draws from that eye, never from the world eye `$799A`–`$79A2`. The region draw
`$05A756` measures its heights `$7B26`–`$7B2A` from `$79AC`, and the wall-text draw
`$053FB4`–`$053FC4` subtracts `$79A8`, `$79AC` and `$79B0` from each vertex. Only two
instructions write `$79AA`, and both write the constant 63: `$055948` on foot and
`$055BA6` on arrival at a Floor. Local X and Z come from the pose less the structure's
origin (`$055BE0`–`$055BF8`, `$059D8C`). Nothing takes the Floor's height off local Y.

So on every Floor the structure is drawn with its local floor 63 below the eye. The eye
stands at Floor × storey + 63, so in world terms the bound structure is drawn Floor ×
storey above its placement. The port draws it there
([#487](https://github.com/odogono/mercenary/issues/487)).

## Sound

What follows is the PSG programme the game arms, recovered statically, confirmed armed
at the traced VBLs, and since [#508](https://github.com/odogono/mercenary/issues/508)
also **heard**: Hatari was run with sound on, and its output was recorded over a ride
([heard in the Working Authority](#heard-in-the-working-authority)). A request is still
not emitted sound ([as for other effects](damocles-first-offer.md#sound-request-is-not-emitted-sound)).
That is why the recording is a separate observation.

- **Doors.** The door animation raises `$5A9D8` on every pass in which a door is moving
  (`$05AAA4`, `$05AC00`). `$05A9EE`–`$05AA3A` compares it with the previous pass. On a
  rising edge it arms `$04C37A` in the second sound vector `$04BF58`, the door tone. On
  a falling edge it arms `$04C2B8`, the noise burst. The traces show `start` at VBL 0
  and at the arrival, and `stop` when each door stops. So a ride is a door tone and
  burst, silence while the label steps, and then the pair again as the doors open.
  Every door shares this; it is not lift-specific.
- **The door edges' guard.** Unlike `$054848`, the edges do not test `$7A0C`. After
  latching the new state into `$5A9D9`, `$05AA18`–`$05AA24` skip the arming only when the
  death state `$7A64` is nonzero and bit 14 of `$7B34` is set. So a door starting or
  stopping while the player is dead outside a structure region is latched but silent. The whole door
  pass `$05AA3C`, edges included, returns before anything when `$7B02` is negative.
  The port presents both cues on every edge, since it has no death state (#499).
- **Arrival.** The YM writes in [the arrival](#the-arrival-completely) cut channels B
  and C. `$054848` then arms `$04C556` in `$04BF54` (`$7A0C` was zero in every run).
  The trace sees it armed at the arrival VBL. It disarms itself one VBL later.
- **While the label steps** neither vector is armed. The step routine writes no PSG
  register.

### What the programmes play

The VBL handler calls both vectors every VBL: `$051E0E` calls `$04BF54`, then `$051E16`
calls `$04BF58`. It skips both, for an alternate native path, when `$033F68` is
nonzero; that word was zero in every capture. An idle vector points at the bare `rts`
at `$051E86`. A programme is an entry that sets registers and then either disarms
itself or re-arms the vector with a continuation. The continuation then runs once a
VBL. The first vector, `$04BF54`, plays on **channel B**. The second, `$04BF58`, plays
on **channel C**. So the shared effect and the door sounds never interrupt one another.
A door edge replaces whatever door programme is running. Each programme keeps its own
copy of the mixer in `$7C04` and edits only its own channel's bits (they are active
low). The YM2149 is clocked at 2 MHz, so a tone period *P* sounds at 2 MHz / 16*P*.

Two step routines walk the programmes' tables. `$04C722` walks words, with its counter
at `$04BF1E` and its pointer at `$04BF20`. `$04C73A` walks bytes, with its counter at
`$04BF25` and its pointer at `$04BF26`. Every VBL the caller decrements the counter.
When the counter reaches zero, the routine reads the next `(count, value)` pair and
reloads the counter with the count. A negative count (`$8000`, or `$80` then an aligned
long) is a jump to the address that follows it. A count of zero ends the table.

| Programme | Writes | Then |
| --- | --- | --- |
| Door tone `$04C37A` | tone C period `$400`; mixer `& $DB` (channel C tone **and** noise on); C level 15; both walks restarted: periods `$04C43C`, levels `$04C44A`, counters 1 | re-arms `$04C3EA` and falls into it the same VBL |
| Door tone step `$04C3EA` | noise period 0, every VBL; a period step writes tone C; a level step writes C's level | runs until a door edge replaces it |
| Noise burst `$04C2B8` | tone C period `$400`; noise period `$1F`; mixer `& $DF \| $04` (channel C noise on, tone off); periods `$04C43C`, levels `$04C466`, counters 1 | re-arms `$04C328` and falls into it |
| Burst step `$04C328` | as the tone step, less the noise write | when the level table ends: re-arms `$04C220`, writing nothing that VBL |
| Restore `$04C220` | mixer `& $DB`; noise period `$1F` (C's level stays 0) | re-arms `$04C250` and falls into it |
| Idle `$04C250` | only while `$797A` is not negative: C's level from its high word (at most 15), tone C period `$10`, noise `$1F`, and `$7C0C` ← `$FFFF`; otherwise, if `$7C0C` is set, C's level 0 and `$7C0C` cleared | stays armed |
| Shared effect `$04C556` | `$7A78` ← 15; envelope period `$1F00`; tone B period `$060`; mixer `& $FD \| $10` (channel B tone on, noise off); tail `$04C5EC`: B's level `$1F` (envelope mode), envelope shape 9 | disarms (`$051E86`) |

| Table | Entries (count, value) |
| --- | --- |
| Door periods `$04C43C` | (1, `$3E8`), (1, `$41A`), then back to `$04C43C` |
| Door tone levels `$04C44A` | (1, 10), (1, 11), (1, 13), (1, 13), (1, 11), (1, 10), (1, 9), (1, 8), (1, 7), (1, 6), (1, 5), then back to `$04C456`, the (1, 9) |
| Burst levels `$04C466` | (1, 12), (1, 8), (1, 4), (1, 0), end |

So, VBL by VBL:

- **The door tone** is channel C's square gated by the fastest noise (period 0 acts
  as 1). Its period alternates `$3E8` and `$41A`, 125.0 and 119.2 Hz. Its level swells
  and falls, 10, 11, 13, 13, 11, 10, 9, 8, 7, 6, 5, then 9, 8, 7, 6, 5 over and over
  until the door stops. The period `$400` and level 15 the entry writes are replaced
  within the same VBL.
- **The burst** is noise alone at period `$1F`, at levels 12, 8, 4 and 0, one VBL each.
  One VBL later the vector moves to `$04C220`, and one VBL after that the idle `$04C250`
  begins. Channel C is left at level 0 with tone and noise enabled.
- **The shared effect** is a 1302 Hz square on channel B under envelope shape 9: one
  decay from full to silence, 256 × `$1F00` / 2 MHz = 1.016 s, and then silence held.
  It runs for a single VBL; the chip's envelope does the rest.
- **The request `$054848` cuts channel C** as soon as it arms the effect. It writes
  C's level 0 at once, unless `$7C0C` or `$033F68` is set. A take or a drop while a
  door tone plays silences it until the next VBL's level step.
- **`$7A78`**, which the effect sets to 15 and every other request to 3, holds off the
  Geiger counter's click `$0004C6B2` ([#514](damocles-sound-programmes.md#the-drivers-rules-completed)).
  `$051D26` decrements it instead of ticking while it is nonzero, so no click rewrites
  channel B while the count runs. After the
  arrival the traces saw it count 15 down to 0 over 8 VBLs.

The idle `$04C250` is the only programme here that depends on something besides the
requests. It reads `$797A`, which was negative in every capture examined, on foot or
aboard (`$FF001000`, and `$FEFE10D0` in the boarded car). There it only clears
`$7C0C`, which nothing in a lift sets. So in a lift channel C is silent between door
sounds.

### Heard in the Working Authority

`lift-sound-probe.py record` boots the State Office capture with sound on at 48 kHz
(`--ym-mixing model`), pokes `$FFFF820A` ← `$02` for the PAL rate the UK release ran
at ([display rate](damocles-display-rate.md)), and records Hatari's own WAV over a
ride from G to 1 and back. Cycles per field read 133604 before the poke and 160256
after it, which is 50.05 Hz. The WAV is filled by the emulation, not by the host audio
device, so host timing decides only which VBL a key lands on. Run
`lift-sound-eris-20260925T081244Z-e1ea8a22`, mono WAV
`41ee76bd0e519f20d39309914ad005b9b698e727429006e0c335caffce7a7c69`.

| Sound | Heard (ride 1, ride 2) | Decoded |
| --- | --- | --- |
| Door tone | a buzz under noise; fundamental 126/122 and 130/120 Hz on alternate VBLs; 8.5 % of its power above 5 kHz | 125.0 / 119.2 Hz, gated by noise |
| Door tone levels | low band per VBL −32.7 −29.5 −22.9 −23.0 −29.6 −32.9 −35.8 −39.0 −42.9 −45.3 −48.0, then −35.7 −39.6 −42.1 −45.2 …, about 3.2 dB a level; the loop restarts every 100 ms | 10, 11, 13, 13, 11, 10, 9, 8, 7, 6, 5, then 9 to 5; 5 VBLs |
| Door tone length | 30 and 32 VBLs as the car's door shuts, 28 and 36 as the new one opens | until the door stops |
| Burst | −21.9, −32.2, −42.6 dB, then a −54 dB tail, then silence | 12, 8, 4, 0, a VBL each |
| While the label steps | silence, 0.92 s: burst to arrival 50.0 and 49.0 VBLs | nothing armed |
| Arrival | 1305.9 Hz (1.46 Hz bins); in its band −12.0 dB at onset, falling about 48 dB in 0.95 s, below −113 dB by 1.0 s | 1302 Hz; envelope 9, 1.016 s of 32 steps of 1.5 dB |
| The new door | starts on the arrival's VBL and plays under it | both vectors in one VBL |

Nothing else sounds. There is no channel A, no engine, and nothing between the rides;
the lead-in never passes 1 LSB. So the programmes above are what a ride plays, VBL by
VBL, in the order decoded. The door lengths differ from ride to ride because
`$05AA3C` runs once a substep and a frame takes 4 to 8 VBLs; they are not a property
of the sound. The recording also has clicks at each onset. These are the chip's
unipolar output stepping, which Hatari's DC filter then removes.

**Limits.** This is Hatari 2.6.1's model of an STF's output, not a real machine's.
Its `model` mixing takes its volume table from sc68; the datasheet's 1.5 dB ladder predicts
3 dB a fixed level, against the 3.2 dB heard. Its C10 low-pass is derived from the STF
schematic for a corner of 7.7 kHz while the chip pulls up and 2.1 kHz while R8 pulls
down. But `sound.c` applies those coefficients, meant for 44.1 or 48 kHz, to every
250 kHz sample (`YM2149_DoSamples_250`). That leaves its effective corners near 43 and
11 kHz, which is why the door tone carries 8.5 % of its power above 5 kHz. A mixed WAV
also cannot say which channel played what; the decode does.

**The port against it.** `web/tools/damocles-sound-render.ts` renders what the
presenter plays for the State Office ride, and the same `analyse` reads it. Pitches,
level steps, lengths and silences agree: door tone 126.1/119.7 Hz, the levels 3 dB
apart, the burst 12 dB a step, the arrival 1302 Hz with the same decay. With its
output gain set to match, the door peak is −21.1 dB against −21.9, and the arrival
−12.1 against −11.3. The port's low-pass keeps the schematic's corners, so it is
darker: 3.2 % of the door tone's power above 5 kHz, and 2.4 % of the arrival's
against 5.7 %.

## Runs

```sh
python3 research/damocles-st/scripts/lift-ride-probe.py decode
python3 research/damocles-st/scripts/lift-ride-probe.py live --roms roms --case eris
python3 research/damocles-st/scripts/lift-ride-probe.py live --roms roms --case vesta
research/damocles-st/.venv/bin/python research/damocles-st/scripts/lift-sound-probe.py decode
research/damocles-st/.venv/bin/python research/damocles-st/scripts/lift-sound-probe.py record --roms roms
research/damocles-st/.venv/bin/python research/damocles-st/scripts/lift-sound-probe.py analyse <mono.wav>
(cd web && bun tools/damocles-sound-render.ts <port.wav>)
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
- **Sound:** door-start tone and door-stop noise burst for every door movement (presented
  as the `door-start` and `door-stop` Sound Cues, #499); channels B/C
  cut and the shared `$04C556` effect on arrival. The programmes are
  [above](#what-the-programmes-play), and they were [heard](#heard-in-the-working-authority).
  #508 presents them.
- **Timing basis:** the port should count 25 substeps per step, and a substep is a VBL
  while frames take 4–8 VBLs. Door speed is the attachment animation's, and it differs
  per door: about 30 VBLs in the State Office, 80 at Vesta. [#498](damocles-door-speed.md)
  found one unit per substep for every door, so the difference is travel.

## What this does not settle

- **Door animation speed per attachment** is settled by [#498](https://github.com/odogono/mercenary/issues/498)
  in [how fast a door moves](damocles-door-speed.md): one unit per substep for every door,
  so the two doors here differ only in travel (32 and 82 units, closing in 33 and 83 substeps).
- **Moving during a ride** is settled by [#509](https://github.com/odogono/mercenary/issues/509)
  in [moving during a Damocles Lift ride](damocles-lift-ride-movement.md). The player walks
  and turns freely inside the car, cannot leave it, and keeps the walked pose and yaw
  across the arrival.
- **`$7BC8`, `$7AB0`, `$070100`, `$070108`**, which the arrival clears or sets, are
  named only.
- **Frames slower than 8 VBLs**, where substeps stop tracking VBLs, were not observed
  here. Frames faster than 4 were seen by #509 while walking in the Vesta car
  ([frames faster than 4 VBLs](damocles-lift-ride-movement.md#cases)).
- **What a real ST sounds like.** The recording is Hatari's model of an STF's output,
  and its low-pass runs at the wrong rate ([limits](#heard-in-the-working-authority)).
  No original machine was recorded.
- **The arrival's own channel B cut.** `$055C1E` zeroes B's level before `$054848`
  runs. A take's request does not. The port presents the arrival as the request alone,
  since the effect rewrites B's level on the next VBL; the difference lasts less than a
  VBL.
- **The idle `$04C250`'s engine sound** is settled by [#514](https://github.com/odogono/mercenary/issues/514)
  in [every sound programme](damocles-sound-programmes.md#what-arms-each-programme): `$797A`
  is the craft's speed as a float, and the engine sounds at speed 1 or more. The port does
  not keep `$797A`, so it is not presented.
- **The tick `$0004C6B2`**, which `$7A78` holds off, is the GEIGER COUNTER's click, not
  the timer path's ([#514](damocles-sound-programmes.md#what-arms-each-programme)).
- **The rest of the driver's bank** and **`$033F68`'s alternate path** are decoded, heard
  and tied to their events by [#514](damocles-sound-programmes.md). The alternate path is
  the GHETTOBLASTER's music.
- **Where the Floor Label is drawn** is settled by [#473](https://github.com/odogono/mercenary/issues/473)
  in [the Floor Label draw site](damocles-floor-label.md): structure wall text beside each
  lift car's door, drawn by the departure Floor's records while the label steps.
