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

| Item | Value |
|---|---|
| Program | `roms/atarist/damocles_-_mercenary_ii_novagen_software_(uk).stx` |
| SHA-256 | `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef` |
| TOS pin | EmuTOS 2.06 (`154803e3…8939d5`) |
| Lab | `research/damocles-st/` (`damocleslab`) |
| On-foot snapshot | `snapshots/eris-spaceport-onfoot.sav` (SHA-256 `6cee57c4…3d6398c6`) |
| Boarded limo | `snapshots/boarded-car.sav` (SHA-256 `b3cd1c97…c28ce6`) |
| Driving limo | `snapshots/boarded-limo.sav` (SHA-256 `bbcc82de…bfbbab4`) |
| Left limo (on foot, key held) | `snapshots/left-limo.sav` (SHA-256 `5d0ac465…990c1a`) |

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

| Hypothesis | Status | Working-Authority Evidence |
|---|---|---|
| Walk with joystick; board with `B` near craft while holding matching key; leave with `L` | **Confirmed (ground limo)** | Take key with Right-Shift+Up; `B` boards V.I.P. limo; leave recording uses Space then `L`. Arrival ship also responds to `B` but is flight-locked. |
| Number keys set craft speed | **Confirmed (panel)** | Boarded digit presses change the `+ 000 000 NNN` field next to `ERIS` (key 1→`002`, 4→`024`, 9→`400`). |
| Near-c flight accelerates Eris time | **Unresolved** | No spaceworthy craft boarded; VOID not entered. Idle impact-clock advance remains as in #81. |
| Orbital mechanics / VOID dynamics | **Unresolved** | Limo is a ground vehicle; arrival ship announces it is not refitted for further flight. |

## Bucket findings

### Controls — Confirmed (Working Authority)

| Action | Binding | Evidence |
|---|---|---|
| Take object | **Right Shift + Up** | `T` alone does nothing; recording shows Right Shift + Up when the key is acquired |
| Board / enter craft | **`B`** | Boarded limo snapshot; arrival-ship probe message |
| Leave craft | **`L`** (after stop) | Leave recording: digit, Space, then `L`; panel velocity returns to `+ 000 000 000` |
| Craft speed | **Number keys `1`–`9`** | Panel velocity `002` / `024` / `400` for keys 1 / 4 / 9 |

Arrival ship at the pad (`board-probe-…127f768b`): pressing `B` yields message
**`SHIP NOT REFITTED FOR FURTHER FLIGHT`** — boarding works, further flight is
gated. The starting ground path is the airport **key + car** (V.I.P. limo).

### Inventory panel while holding the limo key — Confirmed

Panel inventory buffer at **`$04DDBC`**:

| Pose | Buffer |
|---|---|
| Fresh on-foot | `EMPTY` |
| Boarded / driving / left-with-key | `KEY- V.I.P. LIMO` + big-endian pointer **`$03E484`** into the vehicle-key catalogue |

Holding the key (including after leave) keeps the catalogue string in the panel
slot. Boarded state is **not** shown as a separate craft name there.

### Walk-versus-boarded RAM — Confirmed (words); semantics Partial

Four-way compare: fresh on-foot → boarded → driving → left (on foot, key held).

| Address | On foot | Boarded / driving | Left (on foot) | Role |
|---|---|---|---|---|
| **`$007A8E`** | `$0001` | `$0000` | `$0001` | **Walk flag** (1 = on foot, 0 = boarded) |
| **`$007AAE`** | `$0001` | `$0000` | `$0001` | Mirror / twin of `$7A8E` |
| **`$007A90`** | `$FFFF` | `$0005` | `$FFFF` | Companion word; reverts on leave |
| **`$007AB0`** | `$FFFF` | `$0005` | `$FFFF` | Twin of `$7A90` |

Sticky after first board (still set after leave while key held — **not** pure
walk/board):

| Address | On foot (fresh) | Boarded | Left |
|---|---|---|---|
| `$007A8A` | `$0000` | `$0001` | `$0001` |
| `$0079B2` | `$0000` | `$0001` | `$0001` |
| `$0079B4` | `$0000` | `$FFF6` | `$FFF6` |
| `$007AE6` | `$0000` | `$03FC` | `$03FC` |

So walk-versus-boarded is carried by **`$7A8E` / `$7AAE`** (and companions
`$7A90` / `$7AB0`). `$79B2` looked like a boarded flag until leave proved it
sticky — likely craft/key association, not the mover mode.

### Ground-craft speed — Confirmed (panel); RAM encoding Partial

While boarded, number keys change the large signed field beside `ERIS`:

| Key | Panel (`+ 000 000 NNN`) |
|---:|---|
| 1 | `002` |
| 4 | `024` |
| 9 | `400` |

Exact binary cell for that velocity integer was **not** pinned (no BE16/BE32
equal to 2/24/400 across the digit captures). `$007B60` / `$00797A` track recent
keyboard scancodes during probes and are **not** the velocity word.

Joystick still steers while boarded (`$79C2` poke / stick recording).

### Flight / VOID / time under flight — Unresolved

- V.I.P. limo is a ground vehicle; no VOID transition from these snapshots.
- Arrival ship boards but refuses further flight (`SHIP NOT REFITTED…`).
- Impact-clock idle advance remains as documented in #81; no boarded-vs-flight
  clock comparison was possible without a spaceworthy craft.

Residual Fog: locate and board a space-capable craft; compare impact-clock
advance on surface vs in flight; bind the panel velocity word and craft
control-rate tables.

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

## Provenance summary

| Fact | Evidence |
|---|---|
| Take = Right Shift + Up | board recording keymap; `T` ineffective |
| Board = `B`; leave = `L` (after stop) | boarded / left snapshots + recordings |
| Arrival ship flight-gated | `SHIP NOT REFITTED FOR FURTHER FLIGHT` |
| Inventory `KEY- V.I.P. LIMO` + `$03E484` | `$04DDBC` buffer in boarded/left RAM |
| Walk flag `$7A8E`/`$7AAE` (1 foot / 0 boarded) | four-way RAM compare; reverts on leave |
| Number keys set panel speed | digit probe PNGs `002`/`024`/`400` |
| VOID / flight dynamics not reached | limo ground-only; ship not refitted |
| Snapshots | `eris-spaceport-onfoot`, `boarded-car`, `boarded-limo`, `left-limo` |
