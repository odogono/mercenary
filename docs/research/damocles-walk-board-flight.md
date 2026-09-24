# Damocles walk / board / flight dynamics

Working-Authority Evidence for how Damocles encodes walk-versus-boarded state,
ground-craft control, and (where reached) spaceflight / time-under-flight in
the Atari ST Working Authority. Inventory-level research note for
[#86](https://github.com/odogono/mercenary/issues/86), succeeding the Unresolved
occupancy and flight buckets in
[`damocles-script-motion-time.md`](damocles-script-motion-time.md) (#81).

Authoritative Evidence remains bound to the C64 Reference Build. Observations
here are Working-Authority Evidence only.

## Scope and non-goals

**In scope:** lab path for locomotion and board/leave; walk-versus-boarded RAM
words; ground-craft speed control; impact-clock behaviour while boarded if
observable; whether VOID / spaceflight was reached.

**Out of scope:** filled polygons (#79); Gamma place topology (#80); script ISA
(#85); growing Craft Parameter Blocks into `MercenaryKit`; starting a second
Independent Implementation (#82).

**Language:** research wording (walk-or-boarded, craft control, gear/speed,
impact clock). Does not redefine glossary **Occupancy** / **Craft Parameter
Block**.

## Working Authority and reproduce path

| Item                          | Value                                                               |
| ----------------------------- | ------------------------------------------------------------------- |
| Program                       | `roms/atarist/damocles_-_mercenary_ii_novagen_software_(uk).stx`    |
| SHA-256                       | `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef`  |
| TOS pin                       | EmuTOS 2.06 (`154803e3…8939d5`)                                     |
| Lab                           | `research/damocles-st/` (`damocleslab`)                             |
| On-foot snapshot              | `snapshots/eris-spaceport-onfoot.sav` (SHA-256 `6cee57c4…3d6398c6`) |
| Boarded limo                  | `snapshots/boarded-car.sav` (SHA-256 `b3cd1c97…c28ce6`)             |
| Driving limo                  | `snapshots/boarded-limo.sav` (SHA-256 `bbcc82de…bfbbab4`)           |
| Left limo (on foot, key held) | `snapshots/left-limo.sav` (SHA-256 `5d0ac465…990c1a`)               |

Doorway / board / leave poses are too timing-sensitive for faithful input-trace
replay. Canonical method (same as #79): human walk from a save-state, then
`scripts/record-play.py record --memstate … --snapshot-out …` which
`statesave`s on Ctrl-C. Locomotion under automation uses the joystick-1
soft-copy poke at `$79C2` (see `HATARI-RESEARCH.md`).

Reproduce (boot any pinned pose):

```sh
hatari --memstate research/damocles-st/snapshots/boarded-car.sav
# or left-limo.sav / eris-spaceport-onfoot.sav
```

Cited RAM/PNG runs:

- on-foot: `occ-onfoot-20260818T184106Z-bccaa487`
- boarded: `occ-boarded-20260818T184116Z-6ae44a13`
- driving: `occ-driving-20260818T184125Z-4e1ce2ac`
- left: `occ-left-20260818T185829Z-238e808e`
- digit-speed probe: `speed-keys-20260818T184249Z-fa2335ce`
- arrival-ship board probe: `board-probe-20260818T174438Z-127f768b`

Input traces:

- take + board: `work/stick-record-20260818T174759Z-1b7b3fee`
- velocity keys while boarded: `work/stick-record-20260818T175335Z-60a73c0f`
- leave: `work/stick-record-20260818T185722Z-24942e35`

## Secondary-hypothesis ledger

| Hypothesis                                                                               | Status                      | Working-Authority Evidence                                                                                                                         |
| ---------------------------------------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Walk with joystick; board with `B` near craft while holding matching key; leave with `L` | **Confirmed (ground limo)** | Take key with Right-Shift+Up; `B` boards V.I.P. limo; leave recording uses Space then `L`. Arrival ship also responds to `B` but is flight-locked. |
| Number keys set craft speed                                                              | **Confirmed (panel)**       | Boarded digit presses change the `+ 000 000 NNN` field next to `ERIS`: a live speed, not a fixed value per key (human probe 1→`002`, 4→`024`, 9→`400`; #208 correction below). |
| Near-c flight accelerates Eris time                                                      | **Unresolved**              | No spaceworthy craft boarded; VOID not entered. Idle impact-clock advance remains as in #81.                                                       |
| Orbital mechanics / VOID dynamics                                                        | **Unresolved**              | Limo is a ground vehicle; arrival ship announces it is not refitted for further flight.                                                            |

## Bucket findings

### Controls — Confirmed (Working Authority)

| Action              | Binding                 | Evidence                                                                                                                                                                                             |
| ------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Take object         | **Right Shift + Up**    | `T` alone does nothing; recording shows Right Shift + Up when the key is acquired                                                                                                                    |
| Board / enter craft | **`B`**                 | Boarded limo snapshot; arrival-ship probe message                                                                                                                                                    |
| Leave craft         | **`L`** (after stop)    | Leave recording: digit, Space, then `L`; panel velocity returns to `+ 000 000 000`                                                                                                                   |
| Craft speed         | **Number keys `1`–`9`** | Panel velocity rises after the key; human probe `002` / `024` / `400` for keys 1 / 4 / 9, which depend on when the panel is read                                                                    |
| Run on foot         | **`R` toggle**          | A released tap persists; a second explicit press/release restores walking. Forward step `$30` → `$50` (×`5/3`); initial north-facing right turn `$10` → `$18` (×`3/2`). See #205 measurements below. |

Arrival ship at the pad (`board-probe-…127f768b`): pressing `B` yields message
**`SHIP NOT REFITTED FOR FURTHER FLIGHT`** — boarding works, further flight is
gated. The starting ground path is the airport **key + car** (V.I.P. limo).

### Inventory panel while holding the limo key — Confirmed

Panel inventory buffer at **`$04DDBC`**:

| Pose                              | Buffer                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------ |
| Fresh on-foot                     | `EMPTY`                                                                              |
| Boarded / driving / left-with-key | `KEY- V.I.P. LIMO` + big-endian pointer **`$03E484`** into the vehicle-key catalogue |

Holding the key (including after leave) keeps the catalogue string in the panel
slot. Boarded state is **not** shown as a separate craft name there.

### Walk-versus-boarded RAM — Confirmed (words); semantics Partial

Four-way compare: fresh on-foot → boarded → driving → left (on foot, key held).

| Address       | On foot | Boarded / driving | Left (on foot) | Role                                     |
| ------------- | ------- | ----------------- | -------------- | ---------------------------------------- |
| **`$007A8E`** | `$0001` | `$0000`           | `$0001`        | **Walk flag** (1 = on foot, 0 = boarded) |
| **`$007AAE`** | `$0001` | `$0000`           | `$0001`        | Mirror / twin of `$7A8E`                 |
| **`$007A90`** | `$FFFF` | `$0005`           | `$FFFF`        | Companion word; reverts on leave         |
| **`$007AB0`** | `$FFFF` | `$0005`           | `$FFFF`        | Twin of `$7A90`                          |

Sticky after first board (still set after leave while key held — **not** pure
walk/board):

| Address   | On foot (fresh) | Boarded | Left    |
| --------- | --------------- | ------- | ------- |
| `$007A8A` | `$0000`         | `$0001` | `$0001` |
| `$0079B2` | `$0000`         | `$0001` | `$0001` |
| `$0079B4` | `$0000`         | `$FFF6` | `$FFF6` |
| `$007AE6` | `$0000`         | `$03FC` | `$03FC` |

So walk-versus-boarded is carried by **`$7A8E` / `$7AAE`** (and companions
`$7A90` / `$7AB0`). `$79B2` looked like a boarded flag until leave proved it
sticky — likely craft/key association, not the mover mode.

### Ground-craft speed — Confirmed (panel); RAM encoding still Fog (#208)

While boarded, number keys change the large signed field beside `ERIS`:

| Key | Panel (`+ 000 000 NNN`) |
| --: | ----------------------- |
|   1 | `002`                   |
|   4 | `024`                   |
|   9 | `400`                   |

These readings come from the human digit probe. They are not fixed per-key values: the panel
shows the craft's current speed, which the throttle drives and a collision reverses
([arrival routes](damocles-arrival-routes.md#the-throttle-is-7bac-from-a-scancode-indexed-table)).

**Correction (2026-09-24).** The #208 re-run did not press the keys it named.
`panel-readout-probe.py` sent `hatari-event keydown 2` and `keydown 5`, and Hatari reads a
one-character argument as a host character. So "key 1" pressed `2` and "key 4" pressed `5`.
The recorded `$7B60` of `$0006` for "key 4" is the make code of `5`, which confirms it. Its
`002` / `024` therefore did not reproduce the human readings for keys 1 and 4.

With the probe fixed to send `02`, `05` and `0A`, `$7B60` reads `$0002`, `$0005` and `$000A`.
Starting from `boarded-limo.sav`, 100 VBLs after the key the panel reads `001` for key 1,
`012` for key 4 and `000` for key 9. After 500 VBLs, key 4 has driven the limo into the
building ahead and the panel reads `- 000 000 000`. The runs are
`panel-velocity-key1-100vbl-20260924T151413Z-0b7a5bf1`,
`panel-velocity-key4-100vbl-20260924T151421Z-26404408`,
`panel-velocity-key9-100vbl-20260924T151429Z-f6a5cd15` and
`panel-velocity-key4-500vbl-20260924T151509Z-2029b532`. The field is a live speed, so no
single panel value belongs to a key.

The earlier whole-RAM search found **no** BE16/BE32/packed-BCD cell equal to 2, 24 or 400
that changed with the key. It searched for values from runs that pressed the wrong keys,
so it does not rule out a speed word. `$007B60` and `$00797A` track recent scancodes and
are not the velocity word. A poke of `$4DFE8`, a nearby scratch word that looked like a
digit, did not retarget the panel.

Joystick still steers while boarded (`$79C2` poke / stick recording).

### Camera yaw and world axes — Confirmed (Working Authority)

Research for [#204](https://github.com/odogono/mercenary/issues/204). Probe:
`research/damocles-st/scripts/yaw-probe.py` (`hold`, `period`, `axis`, `heading`
modes),
booting `snapshots/eris-spaceport-onfoot.sav` headless with fast-forward off
and driving the joystick-1 soft-copy `$79C2` over the command FIFO. Runs (all
2026-09-11, gitignored under `work/`): `yaw-probe-20260911T144100Z-e8a58b60`
(hold), `yaw-wrap-20260911T…` and `yaw-period-20260911T144318Z-5edae64b`
(period), `yaw-axis-20260911T144519Z-7adc6807` and
`yaw-axis-20260911T145446Z-e8ff3cfb` (axis).

**The yaw word.** Across rest → right → right → left → left → left holds the
only bytes that change in `$7A00-$7AFF` are `$7AA2`/`$7AA3`, their twin
`$7AC2`/`$7AC3`, and derived words at `$7AE0-$7AE5` and `$7AE8`:

| Hold      | `$7AA2` | Compass tape              |
| --------- | ------- | ------------------------- |
| rest      | `$0600` | `N` centred               |
| right 1 s | `$0650` |                           |
| right 2 s | `$06A0` | `E · N` (N drifting left) |
| left 1 s  | `$0650` |                           |
| left 2 s  | `$0600` | `N` centred               |
| left 3 s  | `$05A0` | `N · W`                   |

A right stick raises the word; a left stick lowers it by the same amount.
Writing `$7AA2`/`$7AC2` directly (`axis` mode) retargets the view and the
compass at once, so the word is the camera yaw and not a readout of it.

**Period and cardinal points.** Holding right for 50 s and comparing every
frame's viewport with the rest frame, the picture recurs at `$0A02`, `$0E14`,
`$1218`, `$161E`: **1024 (`$400`) units per turn**, the word free-running past
`$400` without masking. The compass tape centres `N` at `$0600`, `E` at
`$0700`, `S` at `$0800`, `W` at `$0900` and `N` again at `$0A00`, so

| Cardinal | `$7AA2` mod `$400` |
| -------- | ------------------ |
| S        | `$000`             |
| W        | `$100`             |
| N        | `$200`             |
| E        | `$300`             |

with the word rising clockwise.

**Turn rate.** The earlier wall-clock holds appeared to quicken from `$50` in
the first second to about `$70` per second. Exact-VBL traces under #205 show
that this is not a fixed increment on every VBL: the on-foot Mover executes
between render-loop work, so most VBLs do not change `$7AA2`. At the north
snapshot, each completed plain right-turn update initially adds `$10`; `R`
initially raises that to `$18`. The longer heading-dependent trace below
supersedes treating the wall-clock totals as acceleration.

**World axes.** Walking 6 s at `$0600` (N) raises the camera `z` word `$7A9A`
from `$00886C2D` to `$00886E2D` and leaves `$7A92` (`x`) alone; at `$0700`
(E) the same walk raises `$7A92` from `$004770B1` to `$004776E1` and leaves
`z` alone. So **north is +z and east is +x** in the resident 16.16
coordinates, which with +y up is left-handed seen from above. The remake
mirrors z into its right-handed Camera (`web/damocles/eris.json`,
`orientation`).

**Start pose.** The on-foot snapshot reads `$7AA2 = $0600`: the player starts
facing due north with the Capital Spaceport tower on the right edge of the
view, as the Working Authority capture shows and as the remake now draws.

### On-foot step, turn, and `R` — Confirmed at start pose; long turn Partial

Probe: `research/damocles-st/scripts/walk-step-probe.py`. Every observation
boots `snapshots/eris-spaceport-onfoot.sav`, settles, captures `$7A92` (x),
`$7A9A` (z), and `$7AA2` (yaw), writes the joystick-1 soft-copy `$79C2`, then
arms Hatari's `b VBL = "VBL+N"` breakpoint. The endpoint breakpoint releases
the stick and captures the same words. `--trace` chains one-VBL breakpoints and
captures after every VBL. Keyboard delivery and settling happen before the
baseline, outside the measured leg.

There is **no single nonzero per-VBL delta**. The Mover is called from the
render/game loop rather than once per VBL: most traced VBLs leave all three
words unchanged, and a completed Mover update applies one quantized increment.
The exact start-pose increments are:

| Input at `$0600` (north) |   `$7A92` |     `$7A9A` |               `$7AA2` | Per completed Mover update                              |
| ------------------------ | --------: | ----------: | --------------------: | ------------------------------------------------------- |
| Plain forward            | unchanged | `+$30` (48) |             unchanged | `48 / 65536 = 0.000732421875` surface-cell unit         |
| `R` forward              | unchanged | `+$50` (80) |             unchanged | `80 / 65536 = 0.001220703125`; **`5/3` × plain**        |
| Plain right              | unchanged |   unchanged | initially `+$10` (16) | `16 / 1024 = 1/64` turn = `5.625°`                      |
| `R` right                | unchanged |   unchanged | initially `+$18` (24) | `24 / 1024 = 3/128` turn = `8.4375°`; **`3/2` × plain** |

The paired 128-VBL forward traces isolate the multiplier despite render-loop
pacing. Plain starts at x `4681905`, z `8940589`, yaw `$0600`, receives 11
nonzero updates, and ends at z `8941117`: `528 = 11 × 48`. A released `R` tap
starts at the same words, receives 11 nonzero updates, and ends at z `8941469`:
`880 = 11 × 80`. Thus `880 / 528 = 80 / 48 = 5/3`; x and yaw remain exact.

The nonzero plain-forward VBLs in that invasive trace are
`9,20,31,42,53,64,76,88,100,112,123`; the `R` pair is
`10,21,33,44,56,67,78,89,102,114,126`. Those schedules are evidence that a
VBL-normalized speed is not an original constant, **not** a stable cadence:
stopping in the debugger every VBL changes render-loop throughput. Uninterrupted
300-VBL pairs were reproducible within each condition but completed different
numbers of Mover updates: plain `Δz=3456=72×48` in both repeats; `R`
`Δz=6160=77×80` in both. Report the quantized step to the Independent
Implementation, not `Δ/N` from one scene-dependent hold.

`R` is **toggled, not held**. With explicit `keydown 19`, 80 ms, `keyup 19`,
then a released baseline and 128-VBL leg, two repeats still use `$50`. Holding
the key through the leg also uses `$50`. Repeating the explicit press/release
twice before the baseline restores `$30` in both repeats (`Δz=1200=25×48`);
the corresponding plain pair is also `1200`, while one-tap/held results are
`2080` or `2160`, exact multiples of 80 whose count depends on loop phase.

Turn is more qualified than forward motion. Two 512-VBL plain per-VBL traces
are byte-for-byte equal in their nonzero schedule and total (`Δyaw=866`), but
the observed `$7AA2` increment depends on the reached heading: 24 updates of
`+$10`, then 25 of `+$0E`, four of `+$0C`, then six of `+$0E`. Two 256-VBL
`R` traces have the same total and increment groups despite a two-VBL phase
shift (`Δyaw=618`): 17 updates of `+$18`, then ten of `+$15`. The exact initial
north-facing turn values are therefore `$10` plain and `$18` running; a global
fixed yaw increment would overstate the evidence. Left already has the
opposite sign from the paired left/right observations above, but #205 did not
repeat the full heading sweep to the left.

The browser keeps its existing seconds-based average walk and opening-turn
rates: the Working Authority does not provide a stable per-VBL cadence that
can replace them. `web/damocles/eris.json` now marks the exact `5/3` forward
run multiplier as `recovered`. It applies the initial `3/2` turn ratio across
the existing constant-rate approximation and marks that multiplier `derived`;
the heading-dependent quantized turn sequence itself is not modelled.

**Instance heading byte — superseded by #361.** This section read the parked
limo's heading from `$79D2` and paired its `$00` with the boarded camera yaw
`$01FC`. Both halves were wrong. The byte the draw path turns a resident's mesh
by is the high byte of the long at `$77A8 + 4*slot` — `$77BC` for slot 5, which
holds `$7F` — and boarding publishes it as `$7AC2 = byte × 4` with no offset
(`$054390`), which is where that `$01FC` came from. `$79CD + slot` is not a
table; it lies inside the `$77A8` array. Poking `$79D2` does not rotate the
drawn mesh because nothing reads it; poking `$77BC` does, through every
cardinal (`instance-heading-probe.py sweep`, run
`yaw-instance-heading-20260919T103846Z-561de4cc`). The recovered rule, the
model record's share of it and the `modelZ` consequence are in
[the V.I.P. limo findings](damocles-vip-limo.md#the-drawn-instance-angle).

One claim here is reversed and one survives. Leaving does write the live camera
yaw back to the instance: the leave path at `$05449C` levels the craft's pitch
and roll and then stores `$7AC2 >> 2` into `$77A8(a1)` at `$0544FA`. The
left-limo capture cannot show that, because it leaves at `$7AC2 = $01FC`, which
stores the `$7F` the slot already held; the `$00` this note read at `$79D2` was
never the heading. What survives is the unit: the byte is 256 steps per turn, a
quarter of the camera yaw word, rising clockwise with it.

### Flight / VOID / time under flight — Unresolved

- V.I.P. limo is a ground vehicle; no VOID transition from these snapshots.
- Arrival ship boards but refuses further flight (`SHIP NOT REFITTED…`).
- Impact-clock idle advance remains as documented in #81; no boarded-vs-flight
  clock comparison was possible without a spaceworthy craft.

Residual Fog: locate and board a space-capable craft; compare impact-clock
advance on surface vs in flight; bind the integer behind `+ 000 000 NNN` and
craft control-rate tables. The impact clock's idle cell is `$793C` (#208).

## Implications for #82 (shape signals only)

- Walk-versus-boarded is a **first-class soft state** (clear on-foot vs boarded
  words), not a Content Overlay on Targ room occupancy alone.
- Craft control uses **keyboard speed gears** plus joystick steering — wider
  than Craft Parameter Blocks as the whole physics story.
- Spaceflight / time-dilation still Fog for effort sizing; ground board/leave
  evidence is enough to reject “Damocles occupancy is just Targ `boardedCraft`.”

## What was tried and left Unresolved

- FIFO-only leave (`hatari-event` `L` without a prior human stop) did not clear
  `$7A8E`; human Space-then-`L` did — stop/settle may be required.
- Panel velocity binary encoding
- Spaceworthy craft → VOID / near-c time dilation
- Full craft control-rate / orbital-parameter block decode

## Research Provenance

Primary #205 commands (run from the repository root; this machine's Restricted
Material root was `/Users/alex/work/mercenary/roms`):

```sh
research/damocles-st/lab doctor --roms /Users/alex/work/mercenary/roms
python3 research/damocles-st/scripts/walk-step-probe.py --roms /Users/alex/work/mercenary/roms --vbls 128 --repeats 1 --conditions plain tap --actions forward --trace
python3 research/damocles-st/scripts/walk-step-probe.py --roms /Users/alex/work/mercenary/roms --vbls 128 --repeats 2 --conditions plain tap held double-tap --actions forward
python3 research/damocles-st/scripts/walk-step-probe.py --roms /Users/alex/work/mercenary/roms --vbls 300 --repeats 2 --conditions plain tap --actions forward
python3 research/damocles-st/scripts/walk-step-probe.py --roms /Users/alex/work/mercenary/roms --vbls 512 --repeats 1 --conditions plain --actions turn --trace
python3 research/damocles-st/scripts/walk-step-probe.py --roms /Users/alex/work/mercenary/roms --vbls 256 --repeats 1 --conditions tap --actions turn --trace
```

Principal gitignored runs:

- forward trace pair:
  `walk-step-forward-plain-128vbl-r1-20260912T123744Z-61ac2301`,
  `walk-step-forward-tap-128vbl-r1-20260912T123753Z-85a09e96`
- explicit release/toggle pair set:
  `walk-step-forward-{plain,tap,held,double-tap}-128vbl-r{1,2}-20260912T123031Z…123155Z`
- uninterrupted 300-VBL pairs:
  `walk-step-forward-plain-300vbl-r1-20260912T123550Z-01841d26`,
  `…r2-20260912T123610Z-a993bf38`,
  `walk-step-forward-tap-300vbl-r1-20260912T123629Z-025a1677`,
  `…r2-20260912T123649Z-ec3324b5`
- repeated long turn traces:
  `walk-step-turn-plain-512vbl-r1-20260912T123856Z-d0f076d3`,
  `…20260912T123934Z-4a8bf7ce`;
  `walk-step-turn-tap-256vbl-r1-20260912T123722Z-d9260614`,
  `…20260912T123958Z-ce4c6f58`

All carry program SHA-256 `8d512ac6…a2ef`, EmuTOS SHA-256
`154803e3…39d5`, snapshot SHA-256 `6cee57c4…98c6`, Hatari 2.6.1 binary
SHA-256 `05723606…e11a`, and Python 3.13.15 in `result.json`. Captures and
per-VBL JSON remain under gitignored `research/damocles-st/work/`; no Working
Disassembly was required or produced.

| Fact                                                                                          | Evidence                                                                                         |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Take = Right Shift + Up                                                                       | board recording keymap; `T` ineffective                                                          |
| Board = `B`; leave = `L` (after stop)                                                         | boarded / left snapshots + recordings                                                            |
| Arrival ship flight-gated                                                                     | `SHIP NOT REFITTED FOR FURTHER FLIGHT`                                                           |
| Inventory `KEY- V.I.P. LIMO` + `$03E484`                                                      | `$04DDBC` buffer in boarded/left RAM                                                             |
| Walk flag `$7A8E`/`$7AAE` (1 foot / 0 boarded)                                                | four-way RAM compare; reverts on leave                                                           |
| Number keys set panel speed                                                                   | digit probe PNGs `002`/`024`/`400`; corrected FIFO keys 1/4/9 (2026-09-24)                       |
| Integer RAM cell for `+ 000 000 NNN`                                                          | **Fog** — #208's search used runs that pressed the wrong keys; not re-searched                   |
| VOID / flight dynamics not reached                                                            | limo ground-only; ship not refitted                                                              |
| Camera yaw `$7AA2`/`$7AC2`, 1024 per turn, N = `$200`, clockwise                              | yaw-probe hold/period runs; compass tape frames                                                  |
| North = +z, east = +x (`$7A9A`, `$7A92`)                                                      | yaw-probe axis runs                                                                              |
| Plain / `R` forward increment `$30` / `$50`; multiplier `5/3`                                 | paired 128-VBL per-VBL traces, identical 11-update count                                         |
| `R` is a toggle                                                                               | explicit released tap persists; held agrees; double released tap returns plain, two repeats each |
| Initial north-facing right turn `$10` plain / `$18` under `R`; later heading-dependent values | repeated 512-VBL plain and 256-VBL `R` traces                                                    |
| Instance angle `$77A8+4*slot` high byte, 256 per turn, clockwise; craft yaw = byte × 4        | `$053548`/`$054390`/`$0544FA`; limo `$7F` with occ-boarded `$7AA2=$01FC`; `$77BC` cardinal pokes |
| Snapshots                                                                                     | `eris-spaceport-onfoot`, `boarded-car`, `boarded-limo`, `left-limo`                              |
