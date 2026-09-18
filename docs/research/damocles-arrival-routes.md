# Damocles departure routes from a validated arrival pose

Working-Authority Evidence for
[#326](https://github.com/odogono/mercenary/issues/326). #326 needs one on-foot
capture per celestial body and twenty-six bodies have none. This note answers
the question that comes before any of those captures: **from a pose the
laboratory can restore, what can the player board, and what does the game say
when it refuses?**

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
not the pinned start, are where the remaining twenty-six captures have to begin.

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
response at `$059750` forces it to `$FFF0` every time a move is refused. A
craft parked against something therefore looks inert: the throttle is being
overwritten each frame, not ignored. Re-pressing the speed key each tick is what
distinguishes "refused" from "unset", and it is how the craft gets off the
ground.

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
converged on a landing. **No twenty-seventh arrival pose exists yet**, and the
twenty-six gaps stand.

What remains is a control problem in this probe, not an unknown in the machine:
every gate, word and rule the route depends on is recovered above.

## What an arrival pose publishes without a workspace origin

`location-ledger.py poses --payload` previously required a recovered 16×16
workspace origin for every pose it published, and raised `KeyError` on a body
without one. Only four bodies have an origin, so the first capture on any of the
other twenty-six could not have been published at all.

The tool now publishes such a pose with `cell`, `localCell` and
`workspaceOrigin` null, and the `evidence.cell` field carries the reason — the
capture is evidence that the player stood there, and the cell it does not yield
is reported rather than guessed. That is [#326](https://github.com/odogono/mercenary/issues/326)'s
own requirement, and it is now the tested behaviour rather than an intention.

## Per-body readiness

What a capture would publish today, for the twenty-six bodies with no pose.
`Residents` and `surface` are from the tracked catalogue payload;
`origin` is whether [#172](https://github.com/odogono/mercenary/issues/172) has
recovered that body's 16×16 workspace origin.

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

No body in this table has a recovered workspace origin, so **every one of the
twenty-six would publish with a null cell and a stated reason**. That is a
publishable pose, not a blocked one, and it is why the publication path was
fixed before any capture was attempted. MIDAS and CLOTHO remain the two the
coverage ledger ranks first, on what is waiting there rather than on how
reachable they are.

## Secondary-hypothesis ledger

| Hypothesis                                                        | Status                  | Working-Authority Evidence                                                                  |
| ----------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------- |
| The arrival ship's refusal is conditional on some refit state       | **Disproved for the chooser** | `$0542E0` reads no state: slot 7 is tested against a constant and jumps to message 22. Only its own key byte could pass it earlier, and that byte is `$08` in every tracked pose |
| Boarding is gated by a per-craft key byte                          | **Confirmed**           | `$054332` tests bit 7 of `$7272 + slot × 4`; the limo bit sets when #86 takes the airport key |
| The progressed poses keep a spaceworthy craft on hand              | **Confirmed**           | Slot 3 is within 0.01 cells of all three poses with its key byte set; boarding succeeds live |
| A boarded craft departs on the ground-craft digit-and-stick pair   | **Disproved**           | Speed key registers at `$7B60`; position and `$7A96` unchanged over 20 s with the stick at rest and held forward |
| Some other input departs a boarded craft                           | **Unresolved**          | Not searched: vehicle travel is out of scope for #313                                        |

## Provenance summary

| Fact                                           | Evidence                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------- |
| Board gate conditions and refusal chooser      | `$054302`–`$054338` and `$0542E0`–`$0542FC` in the pinned image           |
| Refusal text for slots 7 and other craft       | System string slots 22 and 3, `payload/damocles/strings.json`             |
| Live refusal at the arrival ship               | `arrival-route-slot7-20260918T095958Z-b80a595d`                           |
| Key byte array and its movement                | `$7272 + slot × 4` across six tracked memstates; #86's limo-key recordings |
| Live board on Vesta                            | `arrival-route-slot3-20260918T100026Z-9c8d751c`                           |
| Departure into space from Vesta                | `arrival-route-slot3-20260918T095824Z-9789a6d7`                           |
| Arrival at another body and the round trip     | Vesta → ERIS (`$002C`) and Vesta → Vesta, both with the player left on foot |
| Craft census per pose                          | `arrival-route-survey-20260918T095931Z-7da4fac7`                          |
| Per-body residents and surface counts          | `payload/damocles/catalogue.json`; `location-ledger.py ledger`            |
