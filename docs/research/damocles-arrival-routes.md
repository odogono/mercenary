# Damocles departure routes from a validated arrival pose

Working-Authority Evidence for
[#326](https://github.com/odogono/mercenary/issues/326). #326 needs one on-foot
capture per celestial body, and when this note was opened twenty-six bodies had
none. It answers the question that comes before any of those captures: **from a
pose the laboratory can restore, what can the player board, and what does the
game say when it refuses?**

Coverage now stands at **twenty-three of the thirty physical bodies**, from
twenty-seven captures. Three routes got there: the departure chain, recovered
and driven live here; the transporter network, recovered here and confirmed
against eight captures; and play by the project owner, which supplied every
memstate — including, on 2026-09-19, eight steered craft flights that took the
last eight resident-carrying bodies. **Every body that carries a resident object
now has a validated arrival pose.** Seven bodies remain unposed, and all seven
are bodies with no resident record at all.

Authoritative Evidence remains bound to the C64 Reference Build. Observations
here are Working-Authority Evidence only. This note does not mint Damocles world
terms in `CONTEXT.md`.

**A refusal recorded here is a route that failed. It is not a finding that a
body cannot be stood on**, and no body is reclassified by anything below.

## Scope and non-goals

**In scope:** which craft each restorable pose has within reach; the board
gate's own conditions and its refusals, read from the pinned image and observed
live; which poses hold which vehicle keys; and what an arrival pose publishes on
a body whose 16×16 workspace origin is unrecovered.

**Also in scope, by decision:** departure and space flight. #313 originally
excluded vehicle travel, and #326's twenty-six captures turned out to be blocked
on exactly that, so the exclusion was lifted on 2026-09-18 rather than worked
around. What follows is the departure chain as the machine performs it, recorded
so a capture can be reached; it is not a flight model for the browser
recreation, and ADR 0002 still forbids translating any of it into application
code.

**Out of scope:** how a key is obtained in play, combat, and anything about the
craft beyond reaching another body. Surface workspace recovery stays with
[#172](https://github.com/odogono/mercenary/issues/172) and interior placement
with [#325](https://github.com/odogono/mercenary/issues/325).

## Working Authority and reproduce path

| Item             | Value                                                              |
| ---------------- | ------------------------------------------------------------------ |
| Program          | `roms/atarist/damocles_-_mercenary_ii_novagen_software_(uk).stx`   |
| SHA-256          | `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef` |
| TOS pin          | EmuTOS 2.06                                                        |
| Hatari           | 2.6.1 (`05723606…9201e11a`)                                        |
| Probe            | `research/damocles-st/scripts/arrival-route-probe.py` (`90655b7b…bb3b9fac`) |
| Static reference | `work/observe-first-world-20260818T101013Z-c5a32b7d/observed.ram`  |

Memstates are Restricted Material and are not committed; their SHA-256 values
identify them.

| Pose                    | SHA-256                                                            |
| ----------------------- | ------------------------------------------------------------------ |
| `eris-spaceport-onfoot` | `6cee57c4d4a168792fc3974e786d706fe9f42cf577d6e8b7c63814c93d6398c6` |
| `dion-2-3`              | `4286686917efae04027a9ef4b4fa7cb96f3e2a98865e40e67eb9866fba95d1e6` |
| `gaea-ur-city-4-2`      | `eddc5f1c50cefde3e52c043240506cd17507e8bbbc9f8a1cfdb730d5160e673e` |
| `vesta-parliament-4-6`  | `d6aac9e01c44dad24b92665d1ba51cdcd7b42746aab616c09d68b5a55275a1ac` |

These are the containers the runs in this note booted. Three of the four are no
longer the hashes `payload/damocles/arrival-poses.json` publishes, because
rehosting has since been made byte-reproducible; the same rehosted stream at the
original run's gzip timestamp reproduces each value above, and the RAM SHA-256 is
unchanged either way. See [the rehosting
section](damocles-object-drops.md#rehosting).

```sh
# what the pose can reach, and how far
python3 research/damocles-st/scripts/arrival-route-probe.py --survey

# walk to a craft and press B
python3 research/damocles-st/scripts/arrival-route-probe.py --target 7 --board
python3 research/damocles-st/scripts/arrival-route-probe.py \
    --snapshot research/damocles-st/snapshots/vesta-parliament-4-6.sav \
    --target 3 --board
```

The walk row in the route table below was taken with the probe revision
`751e8f29…ced961b2`, before the departure work extended the tool; the two differ
in the departure functions and in zero-padding the scancode argument, which
leaves every two-digit code — including `B` and `L` — unchanged. Every other run
cited here is the revision in the table above.

Nothing is injected. Walking is the joystick-1 soft-copy byte at `$79C2`,
boarding is a real key event, and every sample is a `savebin` taken while the
machine is stopped. The approach is closed loop: each tick reads the camera
longwords and the target's own entry in the resident arrays and steers, learning
the sign of the yaw response from the machine rather than assuming it.

## The board gate

One routine at **`$054310`–`$054338`** decides every board, and its refusal
chooser sits at **`$0542E0`**. `d3` is the selection longword `$7B46`, which is
four times a resident slot, so the gate's constants are slot numbers multiplied
by four.

| Step      | Instruction                    | Condition                                           |
| --------- | ------------------------------ | --------------------------------------------------- |
| `$054302` | `cmpi.w #$9,$7B42` / `bgt`     | selection distance exponent above 9 — nothing in reach |
| `$054310` | `btst #$E,$7B34`               | region flag bit 14 clear — refuses silently         |
| `$05431A` | `lsr.w #2,d3` / `beq`          | slot 0                                              |
| `$05431E` | `cmpi.b #$17,d3` / `bcc`       | slot 23 and above is not boardable                  |
| `$054324` | `move.w $7AB0,d1` / `bpl`      | already aboard something                            |
| `$05432A` | `cmpi.w #$78,$7AA8` / `beq`    | body selector `$78`, the VOID staging body          |
| `$054332` | `tst.b $7272(a0)` / `bpl`      | **the craft's key byte**: bit 7 clear sends the gate to the refusal chooser |

The refusal chooser is short and answers by slot alone:

| `$0542E0` test          | Slot          | Outcome                                                       |
| ----------------------- | ------------- | ------------------------------------------------------------- |
| `cmpi.w #$04,d1` `beq`  | 1             | boards anyway — DART II needs no key                          |
| `cmpi.w #$38,d1` `bge`  | 14 and above  | boards anyway — the seatable objects, not craft               |
| `cmpi.w #$1C,d1` `beq`  | 7             | system string **22**, `SHIP NOT REFITTED FOR FURTHER FLIGHT`  |
| otherwise               | any other craft | system string **3**, `VEHICLE KEY REQUIRED`                 |

The chooser reads no state at all: it answers from the slot number alone. So
once slot 7 has failed the key-byte test it always gets message 22 and never the
key message — the INTERSTELLARSHIP is refused for its own reason, not for a
missing key. The one thing that could still pass it is bit 7 of its own key byte
at `$7272 + $1C`, which is `$08` in every tracked pose and is never seen set.

**Answered by [#404](damocles-vehicle-key-gate.md).** The byte is not a private
array: `$7272 + slot × 4` is the same address as `$6FAA + (slot + 178) × 4`, the
paired key object's association-A handling byte, and bit 7 is its carried bit.
Boarding is a carried requirement, not a permanent unlock.

### The key byte is a per-craft array at `$7272`

`$7272 + slot × 4` carries one byte per resident slot and bit 7 is the gate's
test. Reading it across the tracked poses shows exactly which keys each capture
holds, and it moves with the key the player is known to have taken:

| Pose                    | Slot 3 `EAGLE NINE S E` | Slot 5 `V.I.P. LIMO` | Slot 7 `INTERSTELLARSHIP` |
| ----------------------- | ----------------------- | -------------------- | ------------------------- |
| `eris-spaceport-onfoot` | `$04`                   | `$04`                | `$08`                     |
| `left-limo`             | `$04`                   | **`$84`**            | `$08`                     |
| `boarded-limo`          | `$04`                   | **`$84`**            | `$08`                     |
| `dion-2-3`              | **`$84`**               | **`$84`**            | `$08`                     |
| `gaea-ur-city-4-2`      | **`$84`**               | **`$84`**            | `$08`                     |
| `vesta-parliament-4-6`  | **`$84`**               | **`$84`**            | `$08`                     |

The limo bit sets exactly when #86's recordings took the airport key, which is
the independent check on the reading. Every other craft slot is `$04` in every
tracked pose.

## Route attempts

Each row is a live run from the pose named, not a reading of the image.

| Run                                        | Pose                    | Route attempted                       | Result                                                                      |
| ------------------------------------------ | ----------------------- | ------------------------------------- | --------------------------------------------------------------------------- |
| `arrival-route-survey-20260918T095931Z-7da4fac7` | `eris-spaceport-onfoot` | census of craft on this body           | four craft on ERIS: slots 7 (0.00 cells), 5 (0.07), 3 (2.08), 4 (6.09); DART II slot 1 is 3455 cells away |
| `arrival-route-slot7-20260918T095958Z-b80a595d`  | `eris-spaceport-onfoot` | board the arrival ship, slot 7         | **refused**, system string 22 `SHIP NOT REFITTED FOR FURTHER FLIGHT`; `$7A8E` stays 1 |
| `arrival-route-slot3-20260918T073634Z-1f3871b3`  | `eris-spaceport-onfoot` | walk to `EAGLE NINE S E`, slot 3       | **incomplete**: 136,052 → 79,587 units in 45 ticks, then the tick budget ran out 1.2 cells short; B there raised nothing |
| `arrival-route-slot3-20260918T100026Z-9c8d751c`  | `vesta-parliament-4-6`  | board `EAGLE NINE S E`, slot 3         | **boarded**: `$7A8E` 1 → 0, `$7AB0` `$FFFF` → `$0003`                       |
| `arrival-route-slot3-20260918T095824Z-9789a6d7`  | `vesta-parliament-4-6`  | board, climb and launch                | **reached space**: airborne after 5 ticks, `$7AAE` → 2, body selector `$FFFF` |

That walk measured the on-foot rate at **300 source units per second**, so one
16×16 cell of ground is about three and a half minutes of walking. It is the
probe's tick budget that ended the run, not the game; pressing B 1.2 cells short
raised no message at all, which is what `$054302`'s reach test predicts. The
same rate is why DART II, 3455 cells away, is not a walking route by any budget.

The survey's distances are Chebyshev distances in source units between the
camera longwords and the craft's own entry in the resident arrays, and they are
only meaningful for a craft whose Association B body byte matches the live body
selector. The probe reports that agreement per row rather than assuming it.

## What this means for #326

**The pinned Eris start cannot leave Eris.** Its only craft in reach are the
arrival ship, which the gate refuses with its own message, and three key-gated
craft for which it holds no key. That is one route attempt recorded per craft, and it
classifies no body.

The one craft the chooser passes without a key, DART II in slot 1, is on ERIS
but **3455 cells** from the pose — far outside the loaded 16×16 workspace, and
so not reachable by the walk this probe can drive. That is a distance, not a
refusal, and it is recorded here so the next attempt does not re-derive it.

**The three progressed poses can.** DION, GAEA and VESTA each restore with
`EAGLE NINE S E` parked within a hundredth of a cell of the player and its key
byte set, and the laboratory boards it from the restored memstate. Those poses,
not the pinned start, are where a captured flight has to begin.

**Departure is recovered, and a craft has flown from one body to another.**
The section below records the chain. The first
attempts looked like a dead end — a speed key registered at `$7B60` and the
craft did not move — and the reason turned out to be two separate things, both
worth stating because either one alone reads as "flight does not work": the
collision response at `$059750` forces the throttle back the instant a move is
refused, so a single press never survives contact; and a one-character argument
to Hatari's `hatari-event keydown` is taken as ASCII, so Esc (`$01`) was
arriving as the "1" key (`$02`). With a held throttle and a zero-padded
scancode the craft lifts, launches and reaches space.

## The departure chain

Four steps, each with its own gate, recovered from the pinned image and driven
live by the probe.

| Step | Input | Gate | Evidence |
| ---- | ----- | ---- | -------- |
| Board | `B` | the board gate above | `$054310` |
| Lift | a speed key, held | none, but the collision response undoes it | `$0556F8`, `$059750` |
| Launch | `Esc` | `$7ACA` must read no ground contact, and the craft's own parameter block must allow space | `$055822` |
| Reach space | none | `$7A30` must pass `$01F0` | `$05976A` → `$05586C` |

### The throttle is `$7BAC`, from a scancode-indexed table

`$0556AA`–`$0556F8` indexes a byte table at **`$0557D6`** by scancode and writes
`$7BAC`. Digits `1`–`0` carry entries 8, 10, … 26; the function keys interleave
the odd values; `-` and `=` (`$0C`, `$0D`) scale the current value through the
log tables at `$05575E` and `$055798` instead of setting it. The written long is
`entry << 15` with its low word forced to `$1000`, so `$7BAC` is the magnitude
and `$7BAE` its sign-ish companion, which the collision response negates.

Speed doubles per step of `$7BAC`. Measured in space against the craft
longwords, key 1 (`$7BAC = 4`) is about **12,000 source units per second** and
key 9 (`$7BAC = 12`) about **3,000,000** — the panel reads the latter as
`- 299 792 224`, the speed of light in metres per second.

**Boarding presets `$7BAC` to `$FF001000`** at `$054744`, and the collision
response at `$059750` forces its exponent to `$FFF0` every time a move is
refused. A craft parked against something therefore looks inert, because its
throttle is now close to zero. (Corrected 2026-09-27 by
[the collision response note](damocles-collision-response.md): the throttle is
written once per refusal, not overwritten each frame. The refusal also reverses
the craft by one step, and a held key is one press.) A fresh speed-key press after
each refusal is what distinguishes "refused" from "unset", and it is how the craft
gets off the ground.

### Launch is gated on ground contact and on the craft's own parameters

`$055822` refuses silently while `$7AAE` is not boarded or `$7ACA` still reads
ground contact (`$3F`). It then indexes a 32-byte-per-slot craft parameter table
at **`$055C80`** and requires the word at `+$1A` to be at least 100; below that
it raises system string **21**, `VEHICLE NOT EQUIPPED FOR SPACE TRAVEL`.

| Craft | Slot | `+$1A` | Space-capable |
| ----- | ---- | ------ | ------------- |
| DART II | 1 | 900 | yes |
| EAGLE NINE S E | 3 | 900 | yes |
| BESTCUPAND CRAFT | 4 | 900 | yes |
| V.I.P. LIMO | 5 | 90 | no |
| TARG TOURER | 6 | 90 | no |
| INTERSTELLARSHIP | 7 | 900 | yes, but the board gate refuses it |
| BULLET | 12 | 900 | yes |
| 99 CHEVY, 22 CV | 2, 13 | 90 | no |

On acceptance it commands `$7BAC = $000E` — faster than any digit key — so the
craft crosses the system in about a second unless the throttle is cut at once.

> **Corrected (#558, [space flight](damocles-space-flight.md#the-launch-handler)):** the launch
> writes `$7BAC = $000EF000`, a *reverse* throttle at exponent 14. The space entry then writes the
> high word `$000E`. Near any Body the space pass scales the speed by `range / (range + 65,536)`.

### Space is a third occupancy, and the destination is the nearest body

`$05586C` sets **`$7AAE = 2`**, a third occupancy beside 1 on foot and 0
boarded, and starts a fifty-frame hold in `$7B0A`. The renderer at `$052E90`
keeps the nearest body of the frame in `$7924`, `$052FCA` publishes it to
`$7920`/`$7922` once the hold expires, and `$04DC0C` is what the panel's
**NAVIGATION** field names. **Nothing selects a destination**: the destination is
whichever body the craft is nearest, which is why aiming before launch is how a
route is chosen.

Arrival is one test, at `$052FDA`: the minimum distance minus the body's own
extent word at `$6040(selector)` below `-7` sets `$7A28`, and `$059920` then
runs the landing routine at `$059268`, which clears the occupancy, writes the
body selector from `$7920` and drops the craft in at `$7AB6 = $1800000`.

> **Corrected (#558, [space flight](damocles-space-flight.md#range-nearest-body-and-arrival-052db0)):**
> the test subtracts the two floats' *exponent words*, and the landing leaves the player aboard,
> over the sub-craft point, with the craft's throttle, speed, pitch and yaw unchanged.

### Attitude

`$7AA2` is yaw and `$7AC0` is pitch, both ten-bit and both on the surface
convention: `$0200` is +z for yaw and level for pitch, rising values turn
clockwise and pitch the nose **down**. Measured against the velocity between
samples, a heading of `$190` gives `dx/dz = -0.82` against a predicted `-0.82`.
Turn rate is about 250 yaw units per second at the ordinary frame rate and forty
times that under fast-forward, which is why the probe aims with fast-forward off.

### One laboratory trap worth recording

`hatari-event keydown 1` does **not** press Esc. A one-character argument is
read as ASCII, so it arrives as the `1` key, ST scancode `$02` — confirmed in
Hatari's own keymap trace (`sym=0x31 to ST-scan=0x02`) and by the throttle
landing on the table entry for `$02`. Two-character arguments are read as ST
scancodes, which is why every other key in this laboratory has always worked.
The probe zero-pads.

## What the departure chain has and has not delivered

**Flown, observed, repeatable.** From the Vesta pose the laboratory boards
`EAGLE NINE S E`, climbs it nose-up off the surface, launches with `Esc`, enters
space as occupancy 2, and is landed by the game on a body — with the player then
stepping out on foot, which is exactly the state an arrival pose is read from.
The panel confirms it independently: after one round trip the NAVIGATION field
reads `VESTA` with the player on foot outdoors, and an earlier flight arrived at
`$002C`, ERIS, having launched from Vesta.

**Not yet delivered: choosing which body.** Arrival fires on whichever body is
nearest, and the closed-loop approach does not yet reliably win that comparison
against the target's neighbours. Two things make it hard, and both are measured
rather than guessed:

- The launch commands `$7BAC = $000E`, so the craft covers roughly twelve
  million source units a second until the throttle is cut, while the Eris
  cluster is six bodies inside seven thousand units.
- The approach has to arrive slowly enough to stop inside a few thousand units
  of one body, which needs the `-` key's scaling below the digit keys' floor of
  about twelve thousand units a second.

The probe implements a standoff approach — fly past the target to a point on the
far side of its nearest neighbour, then turn in — and it reaches the right
neighbourhood: one run closed to **12,534 units of METIS**. It has not yet
converged on a landing.

**The probe still has not converged, and a human pilot has.** The eight captures
of 2026-09-19 — ICARUS, ATROPOS, CRONUS, CYCLOPES, SOLON, THALIA, TOLOSA and
PERSEUS — were flown by the project owner using the machine recovered above,
steering the arrival onto a chosen body by hand. That settles the question this
section left open: a steered arrival is reachable with the gates, words and rules
recorded here, and nothing further about the machine was needed. What is not
settled is the *automated* approach — the standoff controller in
`arrival-route-probe.py` is unchanged and still stops at 12,534 units — and the
eight flights were not instrumented, so this note records the route by which the
captures were reached and does not add a per-body flight log. Reproducing one
under the probe remains open work.

Eleven of the bodies added earlier were reached in play and four by the
transporter ring; none of the seven still without a pose is on the ring, so each
needs a steered flight arrival of the same kind.

## The transporter network

There is a second way between bodies that needs no craft at all, and it was in
the evidence from the start: system strings 18 and 20 are
`INTERMEDIATE TRANSPORTERS NOT AVAILABLE` and `TRANSPORTER NOT AVAILABLE`, and
resident slots **64–73** are all named `TRANSPORTER a`. This note originally
missed the connection; the route was pointed out in play and then confirmed
against the image and driven live.

### A ring of ten, stepped one place at a time

`$059130` takes the current transporter and steps the selector by **plus or
minus four** between `$100` and `$124` — slots 64 to 73 inclusive, wrapping at
both ends. Walking in chooses no destination: you get the next available
transporter along the ring. A digit key pressed while standing in one does
choose; see [A digit key names the destination](#a-digit-key-names-the-destination-1005).

| Order | Slot | Body | Where |
| ----- | ---- | ---- | ----- |
| 1 | 64 | GAEA | cell `$17`, group `$07` |
| 2 | 65 | ERIS | cell `$26`, group `$14` — not in the workspace the pinned pose loads |
| 3 | 66 | DION | cell `$E3`, group `$02` |
| 4 | 67 | **METIS** | cell `$60`, group `$03` |
| 5 | 68 | VESTA | cell `$64`, group `$05` — placed by #325 inside Parliament |
| 6 | 69 | ERIS | cell `$8B`, group `$12` — the starting workspace |
| 7 | 70 | GAEA | cell `$88` |
| 8 | 71 | **LOGOS** | cell `$24`, group `$08` |
| 9 | 72 | **BACCHUS** | surface-placed |
| 10 | 73 | **MENTOR** | surface-placed |

Four of them — METIS, LOGOS, BACCHUS and MENTOR — were bodies with no arrival
pose, and the last two are otherwise the two longest flights in the system.

**All four have since been captured, and the ring is confirmed from the
memstates.** Eight of the ten slots now have a capture standing at them, and in
every case the pose falls on exactly one transporter: between 143 and 603 source
units of that slot's entry in the live resident arrays, with the next-nearest
transporter between 22 and 73 *million* units away. There is no ambiguity about
which slot a pose is standing at.

| Slot | Body | Catalogue cell | Pose | `$7B5C` | Distance to slot |
| ---- | ---- | -------------- | ---- | ------- | ---------------- |
| 66 | DION | 227 = `$E3` | `dion-transporter` | `$E3` | 302 |
| 67 | METIS | 96 = `$60` | `metis-transporter` | `$60` | 283 |
| 68 | VESTA | 100 = `$64` | `vesta-transporter` | `$64` | 200 |
| 69 | ERIS | 139 = `$8B` | `eris-transporter-11-8` | `$8B` | 603 |
| 70 | GAEA | 136 = `$88` | `gaea-transporter` | `$88` | 216 |
| 71 | LOGOS | 36 = `$24` | `logos-transporter` | `$24` | 180 |
| 72 | BACCHUS | surface-placed | `bacchus-transporter` | `$82` | 143 |
| 73 | MENTOR | surface-placed | `mentor-transporter` | `$79` | 142 |

Six of those eight compare a catalogue association cell, decoded statically from
the program image, against the engine's own cell word in a live capture, and all
six agree. That is the strongest cross-check the transporter work has: two
independent derivations of the same eight places.

Slots **64** (Gaea cell `$17`) and **65** (Eris cell `$26`) are the two with no
capture. Both sit on bodies that already have two poses each, so they cost the
pose coverage nothing. A capture at either would let the wrap
[be driven live](#the-wrap).

### What the handlers do (#1005)

[#1005](https://github.com/odogono/mercenary/issues/1005) recovered the rest of
the mechanism from the pinned first-world image and drove it live with
[`transporter-probe.py`](../../research/damocles-st/scripts/transporter-probe.py).
Two handlers share one hop: `$059126`, which the main loop calls once a frame at
`$0594F2`, steps the ring, and `$059184` takes a digit key. Both reach the
common hop at `$0591FA`.

#### Standing in a transporter: `$7882`

`$7882` names the transporter the player is standing in, as four times its slot,
or 0. `$0531F8` clears it at the start of every frame's object pass, and
`$053950` sets it from `$7B40`, the slot being drawn, when that object's region
list puts the player inside a region whose operation word has bits 14, 13 and 12
set and bit 15 clear. `$0538F6` is the test: each region carries six longwords,
a lower bound and an extent on each axis. `$05363A`–`$053656` form the offsets
as the object's resident position minus the camera: X less `$7A92`, Y less the
scene camera height `$7A30`, Z less `$7A9A`. The player is inside when each
offset minus the lower bound is below the extent, unsigned.

The TRANSPORTER model `$038820` (every ring slot uses it) carries one such region:
lower bounds −50, −128 and −50, extents 100, 128 and 100. Its operation stream
ends in `$7000`. Turned round to the player's side of the subtraction, **the
player is in the cube when their X and Z are each within (−50, 50] of the
slot's, and the camera height `$7A30` is more than 0 and at most 128 above the
slot's Y.** That is the cube itself: a 100-unit square, 128 high. The offsets
are in world axes, not the object's own, so the object's heading does not turn
the region. A
transporter is only entered while it is drawn, because the test runs inside the
draw pass.

`$04DBFA` shows the effect on the panel. While `$7882` is non-zero, and the
player is not in space, the location field is drawn with selector `$78`, VOID,
instead of the Body. Live, the field read `$78` while the player stood in the
arrival cube, and returned to the Body once they had left it and the latch had
cleared. The probe reads the field's cached selector `$04DBF0` in the same
debugger stop as the player state.

The Cell Readout is a separate writer. `$04D91E` calls `$04E246` every frame,
which draws the camera cell words `$7A2C` and `$7A34`, each clamped to ±100, and
redraws only when they change. The hop does not write them; they follow the
camera. Live, the readout read 08-08 in the first sample after the Gaea slot 70
arrival, 04-06 after the digit hop to Vesta slot 68, and 11-08 after the hop back
to Eris slot 69: the destination cell, with no intermediate value sampled. **There is no VOID stage in the hop itself.** Earlier text here said
transit staged through `$78`; it is the panel naming the cube, not a Body the
player passes through.

#### Entry fires once: the latch `$7884`

`$059126` returns at once while `$7882` is 0, and clears `$7884` as it does. With
`$7882` non-zero, it returns if `$7884` is already non-zero. Otherwise it copies
`$7882` into `$7884` and steps. **The handler fires on the first frame the player
is inside a cube, and not again until a frame finds them outside every cube.**

The hop puts the player inside the destination cube, and `$7884` still holds the
slot they entered. So the destination does not fire. Live, after Eris slot 69 to
Gaea slot 70, the latch read `$0114` (69 × 4) and `$7882` read `$0118` (70 × 4),
and the player stayed on Gaea for as long as they stood there. A sample taken
between the clear and the draw reads `$7882` as 0, so samples alternate between
0 and the slot while the player stands still; the latch does not.

**A Drop sets the latch.** The drop handler's accepted path writes `$FFFFFFFF`
to `$7882` at `$054662`, a long, so `$7884` reads `$FFFF` too. A TRANSPORTER
dropped where the player stands lands with its slot under them, 63 below the eye,
which is inside its own cube. It does not fire: the latch is already set, and it
clears only on a frame that finds the player outside every cube. Live
([#1007](https://github.com/odogono/mercenary/issues/1007)), from
`eris-transporter-11-8` with TRANSPORTER slot 66 written onto the Carried Stack
as a take writes it, 574 units from slot 69: after Down, `$7884` read `$FFFF` for
the whole eight seconds sampled. `$7882` alternated between 0 and `$0108`
(66 × 4) as above, and the panel named VOID. No hop was counted on `$0591FA`.
Slot 66 lay at the player's X and Z, Y 1100 for an eye at 1163, Association B
`$2C050A8B`: ERIS, Insertion Group 5, Level 10, cell `$8B`. The run held the player
still; that they leave it like an arrival cube, and that walking in again fires, is
inferred from the latch handler above, not observed.

#### Direction

`$05913A` takes the yaw word `$7AC2` and adds `$100`. On foot (`$7AAE` = 1),
`$059152` inverts it unless the stick's forward bit, bit 0 of `$79C4`, is set.
Aboard, `$05914A` inverts it while the speed `$797C` is negative. Then
`$05915C` tests bit 9: clear steps the selector up by four (the next slot), set
steps it down. In yaw units of 1024 a turn, a player facing a yaw from `$300`
round to `$0FF` and walking forwards steps up, and from `$100` to `$2FF` steps
down. Walking backwards reverses both.

On foot, a player moves only along their facing, so the rule is equivalent to
the bearing at which they cross into the cube: the two halves of the compass are
the two directions round the ring. The split is fixed in **world** yaw. It does
not depend on how the cube is turned.

Live, both halves were seen at the same yaw. Walking forwards into slot 69 at
yaw 200 stepped up to slot 70. Walking on out of slot 70's far side, then
backwards into it again at yaw 200, stepped down to slot 69. So **to go on
round the ring in the same direction, back out of the arrival cube the way you
came, then walk forwards in again**. Leaving by the far side and backing in sends
you back where you came from, which is the oscillation the earlier probe found.

#### Availability, and the three strings

After each step `$0591BE` decrements a counter that starts at 1, and tests the
new slot:

| Test | Address | Outcome |
| --- | --- | --- |
| The step is back at the slot the player stands in | `$0591C0` | string 17, `NO OTHER TRANSPORTERS AVAILABLE`; no hop |
| Association B byte 0 is `$00` (unclaimed) or `$78` (VOID) | `$0591D2`–`$0591DC` | skip: step again in the same direction |
| Aboard a craft, Association B byte 1 is non-zero (interior-associated) | `$0591E0`–`$0591EC` | skip |
| Otherwise, if any slot was skipped | `$0591F0`–`$0591F6` | string 18, `INTERMEDIATE TRANSPORTERS NOT AVAILABLE`, **then the hop** |

String 18 is a notice, not a refusal: the player still goes, to the first
available transporter beyond the skipped ones. Only string 17 stops a ring hop.

`$78010010` is the parked Association B a carried object holds
([limo-key pickup](damocles-limo-key-pickup.md)). **A carried transporter is
therefore unavailable**, and the ring passes it with string 18. Nothing else the
player carries is read: neither handler looks at the Carried Stack, so carrying
the EAGLE (as ST Format 20 step 4 does) makes no difference.

##### A destroyed Body's transporters (#1013)

Neither handler tests whether the destination Body is destroyed, and neither
needs to. The destruction marker `$04C98E` walks slots 255 down to 0 and, for
every slot whose Association B byte 0 equals the Body's selector, clears
Association B to `$00000000` and `$6FA9` to 0 (`$04C9D4`–`$04C9EE`). **A
transporter on a destroyed Body is therefore unclaimed**: the ring skips it like
any other unavailable slot, hopping on with string 18 or, if it comes back to
the entry slot, refusing with string 17, and its digit raises string 20. No hop
reaches a destroyed
Body, so what a landing there would do does not arise.

A carried transporter's byte 0 is `$78`, which no selector (`$00`–`$74`)
equals, so it survives its Body's destruction and stays carried. That rests on
the listing; no run carried a transporter through a destruction.

Every destruction reaches this loop. The NOVABOMB (`$04D486`, `$04D498`), the
AUTHORS COMPUTER (`$04D502`) and stacked EXPLOSIVEs (`$04CAEC`) enter through
the dispatcher `$04C8D2`, which falls into the marker. The unravelling
(`$04BF14`), BOOK page 3 (`$04D884`) and zero on the Impact Clock (`$051F58`,
`$051F60`) call the marker directly. The marker's only early exit, `$04C99E`,
is for a Body already destroyed. See
[the endgame note](damocles-endgame.md) for each path.

Live, the four Detonators destroyed GAEA (selector `$20`) from `dion-2-3`:
transporters 64 and 70 went from `$20100017` and `$20040188` to `$00000000`,
65 and 69 were already `$00000000`, the other six were unchanged, and every
carried object kept `$7801ii10`.

#### A digit key names the destination (#1005)

While the player is on foot and `$7882` is non-zero, `$0555E4` sends every
scancode below `$0C` to `$059184`, before the lift keys. That is Esc, the digit
row and nothing else. `$059184` subtracts one from the scancode, returns on Esc,
maps `0` to zero and adds `$40`. **Key `n` names slot 64 + `n`**: `0` is slot 64,
`1` slot 65, through `9` for slot 73. That is the digit `$4E328` draws in place
of the `a` in `TRANSPORTER a` when one is carried. If that slot's body byte is 0,
the key raises string 20, `TRANSPORTER NOT AVAILABLE`. Otherwise it hops.

The digit path checks nothing else. It does not skip VOID or interior
transporters, does not refuse the slot the player is standing in, and neither
reads nor sets the latch.

Live, standing in the Gaea cube after the ring hop, `4` put the player in slot 68
on VESTA, cell `$64`, Floor 10, with the latch still holding `$0114`. In a
separate run the player walked out of the Gaea cube until `$7884` read 0, and
`0` then counted no hop and left the player where they were.

#### Arrival

The common hop at `$0591FA` first writes the player position
`$7AB2`/`$7AB6`/`$7ABA` from the destination's resident X, Y + `$3F` and Z, and
the Floor byte `$7AC5` from Association B byte 2. Two later writes can change
the height and the Floor:

- The Body switch `$05929A` falls through into a support search at `$059324`.
  When it finds a support, `$05932A`–`$059336` replace the low word of Y with
  that support's height + `$3F`.
- On foot, `$059234`–`$059250` then call `$055B92`. If the level word `$7B02` is
  not negative, `$05924A` first replaces it with the level selector `$7AA4`.
  A positive level is admitted against the Floor Table at `$055B1C`–`$055B56`,
  which writes `$7AC4`, and `$055B78`–`$055B80` recompute Y as Floor × storey
  pitch `$7B00` + `$3F`. A level of 0 or below sets Floor 0 at `$055B9A`.

On foot it also recomputes the surface longitude and latitude words at
`$05935A`. It then arms the transporter sound (`$7A78` ← 3, VBL vector `$4BF54`
← `$04C0B4`) and joins the common rebuild at `$0543FA`. **The yaw is not
written.** A port should take the final height and Floor from those two paths,
not from the first write.

Live, for the three placements measured, slot 70 on Gaea, slot 68 on Vesta and
slot 69 on Eris, every arrival sampled before the player moved landed exactly
on the slot's resident X and Z and 63 units above its resident Y. Each was on
the Floor its Association B names (1, 10 and 10), facing the yaw the player
walked in with. So at these three slots the resident Y already equals the
Floor's height, and the two later writes change nothing. That is measured here,
not shown for every slot. The whole hop is one call within one frame. No
intermediate Body or position was sampled.

#### Aboard a craft

`$059126` carries an aboard branch: direction from the speed's sign, and
interior transporters skipped. A craft that enters a surface-placed cube would
therefore hop to the next surface transporter, BACCHUS slot 72 or MENTOR
slot 73, in the first world. The digit keys are on-foot only. **This is read
from the image and not driven live**: no capture has a craft within reach of a
surface transporter.

#### The wrap

`$059164`–`$05916A` turns a step below `$100` into `$124`, and `$059172`–`$059178`
turns a step past `$124` into `$100`, so slot 64 steps down to 73 and 73 steps
up to 64. **The wrap is read from the image and not driven live.** Reaching it on foot
means standing in slot 64 or 73. Slot 73 is MENTOR, where the pose has no air.
Slot 64 is reached by digit `0`, but in these runs the player had always
walked out of the arrival cube before the key could be pressed.

### Driven live

The [#326](https://github.com/odogono/mercenary/issues/326) run first showed the
ring live. From a memstate standing in the Eris basement at cell `$8B`, walking
forward put the player on **GAEA at cell `$88`** — local (8, 8) — on foot the
whole way:

```
walk: legs [['0x01', 2.0]]
  t+  0.2s body 0x002c cell 0x008b  pos=(4946298, 1163, 8945118)
  t+  1.5s body 0x0020 cell 0x0088  pos=(17334325, 213, 50890372)
```

The #1005 runs repeat that hop in short stick pulses, so the player usually
stops where the hop leaves them. A hop is counted only from a tracing breakpoint
on `$0591FA`, armed before the first step, never inferred from a change of Body
or cell. The `digit` case then presses a digit key in the arrival cube. The
`outside` case leaves the cube until the latch reads 0, presses a digit, and
walks back in with the other stick. Each sample records the latch, the panel
field, the Cell Readout words and the Floor in one debugger stop. The cited
runs, the probe that made them and their logs are kept under
`restricted/damocles-1005/`.
`transporter-probe.py` restores a run-local copy of each memstate whose stored
TOS and floppy paths name the pinned images. The captures stored a checkout path
that has since moved, and the Hatari.app bundle's own `tos.img`, which is
byte-identical to the pinned `emutos206.img`. Without the copy, Hatari restores
a machine with no TOS and every sample reads nothing.

Two poses could not be used. MENTOR has no air and the player did not move
before dying. The Gaea slot 70 cube is indoors, and the closed-loop walk could
not reach it from where the pose stands.

## What an arrival pose publishes without a workspace origin

`location-ledger.py poses --payload` previously required a recovered 16×16
workspace origin for every pose it published, and raised `KeyError` on a body
without one. Only four bodies have an origin, so the first capture on any of the
other twenty-six could not have been published at all.

The first fix was to publish such a pose with a null cell and the reason stated.
Fifteen captures then showed that was more conservative than the evidence
required, and in one case actively wrong: the tool derived the cell from the
camera longwords and the workspace origin, and `gaea-transporter` stands in a
Gaea window the recovered origin does not cover, so the derivation threw rather
than reporting anything.

The cell is now **read** from `$7B5C`, the engine's own current-surface-cell
word, which is the same word the resident-object and object-drop matchers
already compare against. Every pose therefore publishes a cell. What can be
missing is the anchor, and that is now said separately:

- `workspaceOrigin` is the recovered origin, or null where the body has none or
  where the pose stands outside the one window that is recovered.
- `impliedWorkspaceOrigin` is what the pose's own longwords and cell imply, and
  is present on every pose.
- `evidence.cell` says which of the three cases applies, in words.

The derivation survives as a cross-check rather than as the method. Seven of the
twenty-seven poses stand on a body with a recovered origin, and all seven reproduce
`$7B5C` exactly from the longwords — including two captured far from the capture
the workspace note was written against, which shows the origin belongs to the
window rather than to whoever found it first.

**A 16×16 workspace is a window, not a body.** Implied origins across the
twenty-seven poses run from `0` to `3974` on an axis, so a body surface spans
thousands of cells and one body carries many windows. `gaea-transporter` implies
a Gaea window at `256,768` where the Gaea note records `512,1792`; its cell `$88`
is corroborated by the catalogue association for slot 70, by the live resident
array, and by the player reading "8-8" off the display, so the cell is settled
and the origin is the open item.

## What twenty-seven captures do to the bank comparison

The catalogue's bank-identity tests compare every `snapshots/*.sav` against the
pinned first-world capture, so each batch of new memstates widens them by
itself. Both results are worth recording.

**The shared banks stay byte-identical.** The surface-assembly table and bank,
the building-detail table and bank, the ground record bank `$01E790`–`$023FFF`
and the `$031700` glyph table agree across all twenty-seven captures and both
first-world loads. That claim was previously carried by eight memstates on four
bodies, then by nineteen across fifteen; it now rests on twenty-seven across
twenty-three.

**All 212 object records still decode to the same mesh in every captured world,
and no world introduces a record address the first-world table does not already
name.** `test_no_captured_world_introduces_an_object_record` was checking three
memstates and now checks every one; widening it changed no decoded mesh.

**The object bank's allowlist of differing bytes was incomplete.** It named
three byte pairs. There are six, and the three new ones are the same kind of
site as the one already understood: `$03E415`, `$03E41B`, `$03E422` and
`$03E429` are four beacon patch slots of a single record at a seven-byte stride.
Each holds either the `$8000` unconditional patch sentinel or a live value, and
which of the four holds the live value varies by world — the pinned capture has
`$0411` in the first and the sentinel in the other three, while ACHERON and
MENTOR have the sentinel in the first and `$0777` in the other three. The mesh
census is what establishes that none of them reaches geometry, and it now runs
over every capture.

`payload/damocles/catalogue.json` still carries the older wording under
`coverage.diskLoad`, as a `ten-capture bank comparison` naming three byte pairs.
That text is generated by the catalogue extraction pipeline, which needs the
pinned first-world manifest and is not rerun here, so it is **understated rather
than wrong** and should be regenerated the next time that pipeline runs. The
test and this note carry the corrected count in the meantime.

## Per-body readiness

Superseded by the captures. Nineteen of the twenty-six bodies listed below now
have a pose — MIDAS, ACHERON, CLOTHO, THEON, METIS, LUCAN, LOGOS, PAN, BACCHUS,
MENTOR and DAMOCLES, joined on 2026-09-19 by ICARUS, ATROPOS, CRONUS, CYCLOPES,
SOLON, THALIA, TOLOSA and PERSEUS — and each publishes an engine-read cell
rather than the null this table predicted. Every row carrying a resident is now
captured. The table is kept for the seven that remain, and as the record of what
the publication path was assumed to be able to do before any capture existed.

`Residents` and `surface` are from the tracked catalogue payload; `origin` is
whether [#172](https://github.com/odogono/mercenary/issues/172) has recovered
that body's 16×16 workspace origin.

| Body      | Residents | Surface | Workspace origin | A capture today would publish |
| --------- | --------- | ------- | ---------------- | ----------------------------- |
| ICARUS    | 2         | 1       | no               | pose, null cell               |
| MIDAS     | 5         | 0       | no               | pose, null cell               |
| ACHERON   | 2         | 1       | no               | pose, null cell               |
| ATROPOS   | 2         | 1       | no               | pose, null cell               |
| CLOTHO    | 17        | 0       | no               | pose, null cell               |
| CRONUS    | 2         | 2       | no               | pose, null cell               |
| CYCLOPES  | 1         | 0       | no               | pose, null cell               |
| SOLON     | 5         | 1       | no               | pose, null cell               |
| THEON     | 4         | 1       | no               | pose, null cell               |
| METIS     | 9         | 1       | no               | pose, null cell               |
| LUCAN     | 2         | 2       | no               | pose, null cell               |
| LOGOS     | 4         | 1       | no               | pose, null cell               |
| PAN       | 2         | 1       | no               | pose, null cell               |
| THALIA    | 2         | 2       | no               | pose, null cell               |
| BACCHUS   | 6         | 3       | no               | pose, null cell               |
| TOLOSA    | 5         | 1       | no               | pose, null cell               |
| PERSEUS   | 6         | 0       | no               | pose, null cell               |
| MENTOR    | 8         | 2       | no               | pose, null cell               |
| DIALIS, LACHESIS, AURORA, TRITON, JUNO, JASON, SAPPHIRE, DAMOCLES | 0 | 0 | no | pose, null cell |

No body in this table has a recovered workspace origin, so the prediction was
that **every one of the twenty-six would publish with a null cell and a stated
reason**. That was right about publishability and wrong about the cell: reading
`$7B5C` yields one for all of them. MIDAS and CLOTHO were the two the coverage
ledger ranked first on what is waiting there, and both are now captured — MIDAS
at cell `$B5`, CLOTHO at `$01`. The prediction held for the eight of 2026-09-19
as well: none of them has a recovered workspace origin, and all eight publish an
engine-read cell with a null `workspaceOrigin` beside the origin their own
longwords imply.

The seven still without a pose are DIALIS, LACHESIS, AURORA, TRITON, JUNO, JASON
and SAPPHIRE — exactly the seven with no resident record. None is on the
transporter ring, so each needs a steered flight arrival of the kind the eight
2026-09-19 captures were flown by hand. **Having no residents is not evidence
that a body cannot be stood on**, and each of the seven is an open gap.

## Secondary-hypothesis ledger

| Hypothesis                                                        | Status                  | Working-Authority Evidence                                                                  |
| ----------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------- |
| The arrival ship's refusal is conditional on some refit state       | **Disproved for the chooser** | `$0542E0` reads no state: slot 7 is tested against a constant and jumps to message 22. Only its own key byte could pass it earlier, and that byte is `$08` in every tracked pose |
| Boarding is gated by a per-craft key byte                          | **Confirmed**           | `$054332` tests bit 7 of `$7272 + slot × 4`; the limo bit sets when #86 takes the airport key |
| That key byte is a permanent unlock rather than a carried requirement | **Disproved**           | [#404](damocles-vehicle-key-gate.md) — `$7272 + slot × 4` *is* `$6FAA + (slot + 178) × 4`, the paired key object's own carried bit; dropping the key clears it and the board is refused with string 3 |
| The progressed poses keep a spaceworthy craft on hand              | **Confirmed**           | Slot 3 is within 0.01 cells of all three poses with its key byte set; boarding succeeds live |
| A boarded craft departs on the ground-craft digit-and-stick pair   | **Disproved**           | Speed key registers at `$7B60`; position and `$7A96` unchanged over 20 s with the stick at rest and held forward |
| Some other input departs a boarded craft                           | **Confirmed**           | `Esc` reaches the launch handler at `$055822` once the scancode is zero-padded; the craft enters space |
| The transporter ring order follows the slot order 64–73            | **Confirmed for eight of ten** | Eight captures each fall within 603 units of exactly one slot, next-nearest 22–73 million units away; six of them match the catalogue's statically decoded association cell |
| One celestial body has one 16×16 workspace                        | **Disproved**           | `gaea-transporter` reports cell `$88` at implied origin `256,768`, while the recovered Gaea window is `512,1792`; implied origins across twenty-seven poses span 0–3974 per axis |
| The arrival cell must be derived from position and origin          | **Superseded**          | `$7B5C` reports it directly and the derivation reproduces it on all seven poses whose body has a recovered origin |
| A steered flight arrival onto a chosen body is not yet demonstrated | **Superseded for play, open for the probe** | Eight bodies captured by hand-steered flight on 2026-09-19; `arrival-route-probe.py`'s standoff controller is unchanged and still stops 12,534 units short |

## Provenance summary

| Fact                                           | Evidence                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------- |
| Board gate conditions and refusal chooser      | `$054302`–`$054338` and `$0542E0`–`$0542FC` in the pinned image           |
| Refusal text for slots 7 and other craft       | System string slots 22 and 3, `payload/damocles/strings.json`             |
| Live refusal at the arrival ship               | `arrival-route-slot7-20260918T095958Z-b80a595d`                           |
| Key byte array and its movement                | `$7272 + slot × 4` across six tracked memstates; #86's limo-key recordings |
| What that byte actually is, and when it clears  | [The Vehicle Key gate note](damocles-vehicle-key-gate.md); `vehicle-key-gate-probe.py` take/drop/board replays |
| Live board on Vesta                            | `arrival-route-slot3-20260918T100026Z-9c8d751c`                           |
| Departure into space from Vesta                | `arrival-route-slot3-20260918T095824Z-9789a6d7`                           |
| Arrival at another body and the round trip     | Vesta → ERIS (`$002C`) and Vesta → Vesta, both with the player left on foot |
| Craft census per pose                          | `arrival-route-survey-20260918T095931Z-7da4fac7`                          |
| Per-body residents and surface counts          | `payload/damocles/catalogue.json`; `location-ledger.py ledger`            |
| Live transporter hop, Eris `$8B` → Gaea `$88`  | `eris-transporter-11-8.sav`; `arrival-route-probe.py --walk`             |
| Transporter ring slots and their bodies        | `$059130`; catalogue resident slots 64–73; eight transporter memstates    |
| Entry box, latch, direction, availability, digit keys, arrival | `$059126`–`$059264`, `$0538F6`–`$053956`, `$0555E4`, `$04DBF2`–`$04DC18` and model `$038820` in the pinned first-world image |
| Live arrival, latch, panel VOID, Cell Readout and digit `4` to Vesta | `restricted/damocles-1005/transporter-digit-20261127T161248Z-0c0e9a06`; `transporter-probe.py digit` |
| Live leave with the latch cleared, digit `0` outside a cube, backwards re-entry Gaea 70 → Eris 69 | `restricted/damocles-1005/transporter-outside-20261127T161401Z-2ea4f482`; `transporter-probe.py outside` |
| A destroyed Body's transporters are unclaimed; carried ones survive | `$04C98E`–`$04CA20`, hashed under `$04C8D2`–`$04CA20` in [the endgame note](damocles-endgame.md); `restricted/damocles-1013/marker-listing.txt` |
| Live GAEA destruction clearing transporters 64 and 70 | `restricted/damocles-1013/endgame-switches-20261128T070657Z-669aa9e7`, samples 038 and 039; `endgame-probe.py switches` from a retargeted `dion-2-3.sav` |
| Twenty-seven arrival poses on twenty-three bodies | Twenty-seven Hatari memstates, all rehosted by `memstate-rehost.py`; `location-ledger.py poses --payload` |
| Eight bodies reached by steered craft flight   | Captured in play by the project owner, 2026-09-19; not instrumented, so no per-body flight log exists |
| A body can carry more than one 16×16 window    | `gaea-transporter` against `docs/research/damocles-gaea-ur-city-workspace.md` |
