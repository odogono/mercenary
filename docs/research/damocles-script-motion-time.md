# Damocles script VM, occupancy, flight, and time

Working-Authority Evidence for how Damocles drives game logic, walk-or-boarded
state, craft/space motion, and the comet deadline clock in the Atari ST Working
Authority. Inventory-level research note for
[#81](https://github.com/odogono/mercenary/issues/81), not a Data Payload
schema and not an extension of Targ **Benson Script**, **Occupancy**, **Craft
Parameter Block**, or **Host Callout** types (ADR 0020).

Authoritative Evidence remains bound to the C64 Reference Build. Observations
here are Working-Authority Evidence only.

## Scope and non-goals

**In scope:** whether a Benson-or-successor script VM still exists; how
walk-versus-boarded and craft control appear; what orbital/flight/space motion
and time/comet-deadline look like in the ST working authority; what a Host
Callout census against this remake’s named seam would look like.

**Out of scope:** filled-polygon drawing ([#79](https://github.com/odogono/mercenary/issues/79));
Gamma System place topology ([#80](https://github.com/odogono/mercenary/issues/80),
note: `docs/research/damocles-gamma-system.md`); any change to `MercenaryKit` or
the Targ Data Payload; a Damocles extractor or payload; starting a second
Independent Implementation ([#82](https://github.com/odogono/mercenary/issues/82)).

**Language:** research wording (message bank, walk-or-boarded, craft catalogue,
impact clock). This note does not redefine glossary **Benson Script** /
**Occupancy** / **Craft Parameter Block** / **Location**, and it does not mint
Damocles terms in `CONTEXT.md`.

## Working Authority and reproduce path

| Item | Value |
|---|---|
| Program | `roms/atarist/damocles_-_mercenary_ii_novagen_software_(uk).stx` |
| SHA-256 | `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef` |
| TOS pin | EmuTOS 2.06 (`154803e3…8939d5`) |
| Lab | `research/damocles-st/` (`damocleslab`) |
| World load | `scenarios/first-world.json` (SHA-256 `e5383458…8582f96e`) |
| Clock probe | `scenarios/deadline-clock.json` (SHA-256 `32d8a4d3…a5abcc4c`) |

Reproduce:

```sh
research/damocles-st/lab doctor
research/damocles-st/lab observe --scenario research/damocles-st/scenarios/first-world.json
research/damocles-st/lab observe --scenario research/damocles-st/scenarios/deadline-clock.json
```

`deadline-clock` boots like `first-world`, captures RAM/registers/display as
`observed-t0.*`, waits while the player stands still, then captures again as
`observed-t1.*` (lab supports one or two `capture` actions with distinct
`prefix` values; mid-capture uses Hatari `hatari-cont`).

Cited runs:

- `first-world`: `observe-first-world-20260818T101013Z-c5a32b7d`,
  `observe-first-world-20260818T101117Z-010b9ad3`
- `deadline-clock`: `observe-deadline-clock-20260818T103425Z-e36297b7`

## Secondary-hypothesis ledger

Secondary claims from `docs/research/damocles-gap.md` and the Lemon Amiga
manual transcription. Search hypotheses only.

| Hypothesis | Status | Working-Authority Evidence |
|---|---|---|
| 1987 ST demo still carried Mercenary Benson programs; final ST may keep a successor VM | **Unresolved (VM)** | No `SCRIPT` / `INTERPRETER` strings; sole `BENSON` hit is a character name in an easter-egg file (`$073595`), not an interpreter label. Message bank + `(OK?)` prompts exist (see Script VM). |
| Walk with joystick; board with `B` near craft while holding matching key; leave with `L` | **Superseded — Confirmed in #86** | See [`damocles-walk-board-flight.md`](damocles-walk-board-flight.md): `$79C2` locomotion, Shift+Up take, `B`/`L` board/leave, walk flag `$7A8E`. |
| Panel clock counts down to Damocles impact; near-c flight accelerates Eris time | **Partially confirmed** | Standing-still dual capture shows the panel clock counting down (see Time). Near-c dilation not tested (no spaceflight reach in this pass). |
| Orbital mechanics beyond Craft Parameter Blocks | **Unresolved** | Craft names/keys present; no control-rate block decoded; VOID dynamics not entered. |

## Bucket findings

### Script VM — Unresolved (no bytecode census); message system Partially confirmed

**Superseded for existence:** [#85](https://github.com/odogono/mercenary/issues/85) /
[`damocles-script-isa.md`](damocles-script-isa.md) confirms a **successor
bytecode VM** (16-bit opcodes in `$070000+`, live PC at `$00781E`). The
paragraphs below remain the #81 inventory snapshot.

**What was sought:** a table-driven or bytecode interpreter comparable to the
C64 **Benson Script** machine (`notes/decode/benson-scripts.md`).

**Working-Authority Evidence:**

- Dense in-game copy bank roughly `$070000`–`$076000`, absent at title screen,
  including briefing lines, `(OK?)` prompts, `F1=SAVE  F2=LOAD  F10=QUIT`, and
  many `MESSAGE FROM …` strings.
- Big-endian pointers in low RAM (e.g. around `$000AFC`–`$000B50`) into that
  bank — a message/dialogue index, not proof of a bytecode ISA.
- The string `BENSON` at `$073595` sits in Novagen office easter-egg text
  (“BRUCE BENSON … CONFIDENTIAL FILE”), not beside an interpreter.

**Classification (#81):** Damocles clearly has a **scripted message / prompt surface**
(Benson-as-persona in fiction and UI). Whether logic is still a **bytecode VM**,
a native 68k state machine, or a hybrid is **Unresolved** in this pass. Do not
call these **Benson Scripts** until an opcode or dispatch table is shown.

### Occupancy / craft control — Partially confirmed (catalogue); transition Unresolved

Builds on [#80](https://github.com/odogono/mercenary/issues/80): vehicle-key
labels near `$03E430` (`KEY - 99 CHEVY`, `KEY- V.I.P. LIMO`, …) and craft name
strings (`BESTCUPAND CRAFT`, `EAGLE`, …).

**Working-Authority Evidence at first-world / deadline-clock start:**

- Outdoor ERIS view; inventory panel shows `EMPTY` (same address in t0/t1).
- Player is on foot in the starting spaceport approach — no boarded craft name
  in the inventory slot.

**Not shown:** a walk-versus-boarded state word, craft control-rate tables, or a
successful board/leave transition. Stretch attempt: Hatari FIFO has no joystick
event (`control.c` accepts key/mouse events only), and secondary sources require
walk-near + matching key before `B` boards. No adventure harness (enter
building, pick up key, walk to car) was built inside #81.

### Flight / space motion — Unresolved (dynamics); place class already #80

Narrative copy confirms atmosphere entry, spaceflight, and “not equipped for
space travel” vehicle lines. Body slot `VOID` is a place class (#80). This pass
did not reach VOID or decode motion/coordinate encodings behind the navigation
panel (`016-283`, `07-08` visible on PNGs; values stable across the standing
deadline wait). Orbital mechanics and time-dilation-in-flight remain
**Unresolved**.

### Time / comet deadline — Confirmed (panel advances); RAM encoding Unresolved

**Working-Authority Evidence** from `deadline-clock` run
`observe-deadline-clock-20260818T103425Z-e36297b7`:

| Capture | Panel clock (bottom-right) | Notes |
|---|---|---|
| `observed-t0` | `02-29-13` | After world load, player idle |
| `observed-t1` | `02-24-26` | After further host wait; still idle |

Pixel diff between the two PNGs is concentrated on that clock field; location
label `ERIS` and `EMPTY` inventory stay put. So the impact-deadline clock
**runs while the player stands still** — Working-Authority Evidence for a
session time base independent of player motion.

Exact RAM encoding (BCD triple, total seconds, tick counter, …) was **not**
pinned: searches for matching second totals and BCD `HH MM SS` at shared
offsets between t0 and t1 did not land a single clear cell. Display advances;
storage layout stays Unresolved.

Cold `first-world` runs already showed different clock readings (`02-29-05` vs
`02-29-17`) at capture time, consistent with a live countdown.

## Host Callout census (category rows)

Comparison is against this remake’s `BensonHostState` / `BensonEffect` surface
in `app/Sources/MercenaryKit/BensonHost.swift`. Rows describe what a future
Damocles seam *would* need to census — not types to add to `MercenaryKit`.

| Category | Targ Host Callout (reminder) | Damocles Working-Authority Evidence | would-map / would-not-map / unknown |
|---|---|---|---|
| Location / room | `currentRoom` (surface sentinel vs Room) | Multi-body roster + place labels (#80); panel `ERIS` | **would-not-map** as Targ room index; needs own place/body identity |
| Boarded craft | `boardedCraft` / on-foot sentinel | Craft + key catalogues; start on foot (`EMPTY`) | **unknown** until board transition observed |
| Objects / inventory | `objectRooms`, `objectFlags`, `inventory` | Dense object/key label pools; panel inventory slot | **would-map (shape)** at census level; encodings Unresolved |
| Messages / keys / ticks | `messagePlaying`, `pendingKey`, `tickCounter`, `messageInterval` | Message bank, `(OK?)` prompts, save/load HELP text | **would-map (concerns)**; not proven as same bytecode ops |
| Flags / capabilities | `engineFlags`, lift/take overrides, combat/complete | Not decoded | **unknown** |
| Effects | `playMessage`, `keyAcknowledged`, `sound`, `cityLocationChanged`, `scriptFinished` | Messages and prompts exist; script-finished / sound ops Unresolved | **unknown** (message play likely; others unproven) |
| Time / deadline | (no comet deadline on Targ Host Callout) | Impact clock on panel, advances while idle | **would-not-map** onto existing fields; new Damocles-only concern |
| Flight / space | (Craft Parameter Blocks + walking mover) | Space as place (VOID); dynamics Unresolved | **would-not-map** as CPB-only; needs own motion/time model |

## Implications for #82 (shape signals only)

- A Damocles remake cannot reuse Targ **Location** / room Host Callout fields or
  treat Craft Parameter Blocks as the whole physics story — multi-body place
  identity and a live impact clock are first-class.
- Method can still transfer: Host Callout seam, Gameplay Session authority,
  own extractors, Independent Implementation (ADR 0002). Live Targ types cannot.
- Script VM uncertainty is a sizing risk: either port a successor bytecode
  interpreter after a future ISA census, or treat logic as native/table-driven
  and rebuild behind a new seam. This ticket does **not** choose.
- Occupancy/craft transitions and orbital flight remain fog for effort
  estimates; catalogue evidence is enough to reject “Damocles is a Content
  Overlay on Targ.”

## What was tried and left Unresolved

- Full script ISA / dispatch-table decode — follow-on [#85](https://github.com/odogono/mercenary/issues/85); **existence answered** in `damocles-script-isa.md` (successor VM); full semantics still open
- Walk-versus-boarded RAM word and board/leave observe — **answered** in [#86](https://github.com/odogono/mercenary/issues/86) / `damocles-walk-board-flight.md` (walk flag `$7A8E`; VOID / velocity binary / clock-under-flight still Fog there)
- VOID / deep-space flight and near-c time dilation — still open under #86 residual Fog
- Impact-clock RAM cell(s) — still Unresolved
- Craft control-rate / orbital-parameter blocks — partial (number-key panel speed in #86); tables Unresolved

## Provenance summary

| Fact | Evidence |
|---|---|
| Message bank + `(OK?)` after world load | `first-world` RAM vs title-screen RAM |
| `BENSON` string is easter-egg name, not VM label | `$073595` context in `first-world` RAM |
| Craft/key catalogues | `#80` / `$03E430` band; present after load |
| Start on foot | Panel `EMPTY` on `first-world` and `deadline-clock` PNGs |
| Impact clock advances while idle | `deadline-clock` `observed-t0` → `observed-t1` panel `02-29-13` → `02-24-26` |
| Scenario pins | `first-world.json`, `deadline-clock.json` |
