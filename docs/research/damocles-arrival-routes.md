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
both ends. There is no destination to choose and no menu: you get the next
transporter along the ring.

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
pose coverage nothing; what they would settle is whether the ring wraps as
`$059130` reads.

### Direction is decided by which side you walk in

`$059152` tests the stick's forward bit and `$05915C` tests bit 9 of the camera
yaw plus `$100`. Walking in forwards, the selector gains four when that bit is
clear and loses four when it is set; walking in backwards inverts it. The two
combine to one rule: **the step depends on the bearing from the player to the
cube**, so the two faces of the cube are the two directions round the ring.
That is what a player sees as two different markers on the front and back.

`$0591C0` raises string 17 `NO OTHER TRANSPORTERS AVAILABLE` when the step lands
on the transporter already occupied, and `$0591F4` raises string 18 when the
walk over unavailable slots runs out — in the first-world state all ten are
available, so neither fires. Transit stages through body selector `$78`, VOID,
which is the same value the board gate refuses at `$05432A`.

### Driven live

From a memstate standing in the Eris basement at cell `$8B`, the probe walks
forward and the player is on **GAEA at cell `$88`** — local (8, 8) — inside one
and a half seconds, on foot the whole way:

```
walk: legs [['0x01', 2.0]]
  t+  0.2s body 0x002c cell 0x008b  pos=(4946298, 1163, 8945118)
  t+  1.5s body 0x0020 cell 0x0088  pos=(17334325, 213, 50890372)
```

The arrival lands within ninety units of slot 70's own entry in the resident
arrays, which is the check that the catalogue's association cell and the live
hop describe the same square.

**Chaining further is not yet automated.** Arriving leaves the player standing
at the destination cube, and the handler only fires on entry, so the next hop
means leaving and walking back in — from the *other* side, or the ring simply
steps back the way it came. Reversing out is what the probe does today, which
oscillates between Eris and Gaea. Walking round the cube to its far face stalls:
these transporters are inside buildings, and the closed-loop walk does not find
its way round the interior. The mechanism is recovered and one hop is
reproducible; the indoor manoeuvre is the gap.

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
| Twenty-seven arrival poses on twenty-three bodies | Twenty-seven Hatari memstates, all rehosted by `memstate-rehost.py`; `location-ledger.py poses --payload` |
| Eight bodies reached by steered craft flight   | Captured in play by the project owner, 2026-09-19; not instrumented, so no per-body flight log exists |
| A body can carry more than one 16×16 window    | `gaea-transporter` against `docs/research/damocles-gaea-ur-city-workspace.md` |
