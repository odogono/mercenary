# Damocles Gamma System representation

Working-Authority Evidence for how the Gamma System is stored in the Damocles
Atari ST Working Authority: celestial bodies, cities/places, interiors, and
objects. This is an inventory-level research note for
[#80](https://github.com/odogono/mercenary/issues/80), not a Data Payload schema
and not an extension of Targ `Location`, `world.json`, or `rooms.json`
(ADR 0020).

Authoritative Evidence remains bound to the C64 Reference Build. Observations
here are Working-Authority Evidence only.

## Scope and non-goals

**In scope:** place topology — what kinds of places exist and how they are
identified in ST RAM after world load.

**Out of scope:** filled-polygon drawing ([#79](https://github.com/odogono/mercenary/issues/79));
script VM, occupancy, flight dynamics, orbital mechanics, and time
([#81](https://github.com/odogono/mercenary/issues/81)); any change to
`MercenaryKit` or the Targ Data Payload; a Damocles extractor or payload.

**Language:** this note uses research wording (celestial body, place label,
interior, object). It does not redefine glossary **Location** / **Room**, and
it does not mint Damocles world terms in `CONTEXT.md`.

## Working Authority and reproduce path

| Item | Value |
|---|---|
| Program | `roms/atarist/damocles_-_mercenary_ii_novagen_software_(uk).stx` |
| SHA-256 | `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef` |
| TOS pin | EmuTOS 2.06 (`154803e3…8939d5`) |
| Lab | `research/damocles-st/` (`damocleslab`) |
| Scenario | `research/damocles-st/scenarios/first-world.json` (SHA-256 `e5383458…8582f96e`) |

Reproduce:

```sh
research/damocles-st/lab doctor
research/damocles-st/lab observe --scenario research/damocles-st/scenarios/first-world.json
```

The scenario boots to the `title-screen` checkpoint, presses Space (scancode
57), waits long enough for world tables to unpack, then captures RAM,
registers, and a cropped PNG. Captures stay under ignored
`research/damocles-st/work/`.

**Title screen alone is insufficient.** The body-name table and place/object
label pools are absent from title-screen RAM and present after `first-world`.

### Observed first-world state

Across two independent cold `first-world` observes
(`observe-first-world-20260818T101013Z-c5a32b7d`,
`observe-first-world-20260818T101117Z-010b9ad3`):

- Display: outdoor first-person view with a dashboard panel naming **ERIS**,
  navigation readouts, and an empty inventory slot.
- CPU PC is **not** stable across cold enters (observed `$4BC26` vs `$0A900`);
  do not pin a PC-only checkpoint for this state.
- The body-name table, place-label region, and vehicle-key label region hashed
  equal across those two runs (see below).

## Secondary-hypothesis ledger

Secondary claims from `docs/research/damocles-gap.md` (Wikipedia, Lemon Amiga
manual transcription, Mercenary Site). They are search hypotheses only.

| Hypothesis | Status | Working-Authority Evidence |
|---|---|---|
| Nine planets and nineteen moons | **Unresolved** | A 31-slot celestial-name table is present (see Bodies). Planet-vs-moon type bytes were not decoded in this pass, so 9+19 is not confirmed or refuted. |
| Seamless spaceflight between bodies | **Unresolved (place side)** | Narrative copy and a `VOID` body slot support space as a place class; flight dynamics belong to #81. |
| Interiors with outward windows | **Partially confirmed** | Enterable buildings/places and door-key objects are present; the string `WINDOW` appears in in-game copy. Outward-window rendering is #79. |
| Larger city / object set than Targ | **Confirmed (shape)** | Dense place-label and takeable-object label pools after load; not a 16×16 / 192-Room / 64-slot Targ layout. Exact censuses left Unresolved. |
| 28-bit world coordinates | **Unresolved** | Not proven from the inventory pass; navigation panel digits were observed but not bound to a coordinate encoding. |
| Starting place is Eris Capital spaceport | **Confirmed (panel + copy)** | Post-load panel shows `ERIS`; briefing strings name Capital City Spaceport. Fiction name “Eris” matches the body-table slot, not a Targ Location enum. |

## Bucket findings

### Celestial bodies — Confirmed (pointer + shape)

**Pointer:** `$0081DC`, 31 consecutive 8-byte ASCII name slots
(SHA-256 of the 248-byte block:
`edc7217047567274b863366999b8085c6407b1bdf26df25ae4bd2cd52e44bf83`),
identical on two cold `first-world` loads; absent at title-screen.

**Shape:** fixed-width name roster, not a Targ surface-or-Room Location. Slots
in order:

| Index | Name |
|---:|---|
| 0 | DIALIS |
| 1 | ICARUS |
| 2 | MIDAS |
| 3 | ACHERON |
| 4 | DION |
| 5 | ATROPOS |
| 6 | CLOTHO |
| 7 | LACHESIS |
| 8 | GAEA |
| 9 | CRONUS |
| 10 | CYCLOPES |
| 11 | ERIS |
| 12 | SOLON |
| 13 | THEON |
| 14 | VESTA |
| 15 | METIS |
| 16 | LUCAN |
| 17 | LOGOS |
| 18 | AURORA |
| 19 | TRITON |
| 20 | PAN |
| 21 | THALIA |
| 22 | JUNO |
| 23 | BACCHUS |
| 24 | JASON |
| 25 | TOLOSA |
| 26 | PERSEUS |
| 27 | MENTOR |
| 28 | SAPPHIRE |
| 29 | DAMOCLES |
| 30 | VOID |

**Interpretation:** the roster includes ordinary bodies, the comet **DAMOCLES**,
and **VOID** (treated here as the space-as-place class — see below). A parallel
type/parent/orbit record for each slot was not isolated in this pass
(Unresolved subclassing).

### Cities / named places — Confirmed (pointer + shape)

**Pointer:** densest label pool observed around `$023E56`–`$0257xx` after
`first-world` load (region `$023E00`–`$025800` SHA-256
`8ce0dda809a18b20722ac8ce0487982a3e7bd434e006b11213d142de82312c70`),
stable across the two cold runs; absent at title-screen.

**Shape:** packed place records of the form leading control byte + 10-byte name
+ 10-byte kind (21 bytes when contiguous), for example:

- `BIRMINGHAM` / `ISLAND`
- `ELMDON` / `SPACEPORT`
- `CAPITAL` / `CITY`, `CAPITAL` / `SPACEPORT`
- `METIS` / `MOONBASE`
- `VESTA` / `PARLIAMENT`
- `LOGOS` / `CITY`
- `MENTOR` / `WAYSTATION`

A resync walk found on the order of **~100** such label pairs in that band.
Many kinds are city-scale (`CITY`, `SPACEPORT`, `AIRPORT`, `BANK`, `MOONBASE`);
others are building-scale. This is a named-place catalogue bound to bodies by
label text, not a Targ `world.json` road grid.

Exact city census and the binary link from place record → body index remain
**Unresolved** after one follow-up on the best lead (control-byte meaning).

### Interiors — Partially confirmed / graph Unresolved

**What is confirmed:**

- Place kinds include indoor-capable buildings (banks, offices, prisons,
  studios, stores, “HOUSE”, “MOONBASE”, etc.).
- Takeable **DOOR KEY** and generic **KEY** object labels exist in the object
  pool (see Objects).
- In-game copy references rooms/windows (`ROOM`, `WINDOW` string hits in the
  loaded message area around `$070000`).

**What stays Unresolved:**

- No Targ-style `rooms.json` wireframe room list was found (expected: Damocles
  is not that layout).
- The directed interior graph (how one interior connects to another, doorway
  tables analogous to Doorway / Room Link) was not decoded in this pass.

Inventory answer for #80: interiors exist as enterable named places/buildings
with key objects, not as the C64 underground Room model. Full interior
topology remains Fog for later work if #82 needs it.

### Objects — Confirmed (pointer + shape)

**Pointer:** takeable / prop label pool in roughly `$03C000`–`$040000`, with a
dense vehicle-key band near `$03E430` (bytes `$03E430`–`$03E500` identical on
two cold loads).

**Shape:** human-readable object labels (often ~16 characters) embedded in
small records, including:

- Vehicle keys: `KEY - 99 CHEVY`, `KEY - EAGLE 9SE`, `KEY- TARG TOURER`, …
- Props: `ANTIQUE SEXTANT`, `HEAT RESIST SUIT`, `TIMED DETONATOR`,
  `DAMOCLES FILE`, `NOVADRIVE`, `METAL DETECTOR`, …

Key strings in the vehicle band sit about **0x1A** bytes apart. Exact slot
count, residence encoding (surface / interior / carried / out-of-world), and
any 28-bit coordinate fields remain **Unresolved**.

This is enough to say Damocles keeps a large labelled object census in RAM
after load, separate from Targ’s 64-slot Object Residence payload.

### Space-as-place — Confirmed (as a place class)

Owned by this ticket as topology; dynamics stay with #81.

- Body slot 30 is named **`VOID`**.
- Loaded copy includes `ENTERING THE GAMMA SYSTEM`, spaceflight / atmosphere /
  spaceport arrival lines, and “not equipped for space travel” vehicle copy.
- The first-world capture itself is an outdoor body surface (ERIS), not VOID;
  VOID is present in the roster before the player goes there.

So “in space” is a first-class named place in the celestial roster, not merely
a flight mode word. How occupancy and motion behave there is covered in
[#81](https://github.com/odogono/mercenary/issues/81) /
`docs/research/damocles-script-motion-time.md`.

## Boundary handoff to #81

| #80 (this note) | #81 ([damocles-script-motion-time.md](damocles-script-motion-time.md)) |
|---|---|
| Celestial roster, VOID, place labels, interior-as-building, object labels | Script VM (if any), occupancy, craft control, orbital/flight motion, time / comet deadline |
| Where the player *can be* | How the player *moves and ages* while there |

Do not extend Targ **Occupancy** / Craft Parameter Block conclusions from this
note alone. #81’s inventory note keeps those findings research-local.


## Implications for #82 (shape signals only)

- The Gamma System is a **multi-body named roster plus dense place and object
  catalogues**, not a Content Overlay on Targ `Location` / `world.json` /
  `rooms.json`. Stretching the live Targ Gameplay Session to load Damocles
  remains the wrong shape (ADR 0020).
- A future Independent Implementation would need its **own** extractors and
  payload documents for bodies, places, interiors, and objects; method can
  transfer, live types cannot.
- Inventory-level gaps left Unresolved (planet/moon typing, place→body links,
  interior graph, object residence/coordinates) are enough to size risk for
  #82 without building an extractor now.

## What was tried and left Unresolved

One honest pass per bucket from `first-world` RAM, plus a short follow-up on
best leads (21-byte place stride, ~0x1A key stride, pointer scan into the body
name table). Not completed here:

- Per-body type / parent / orbital parameter records
- Authoritative planet vs moon partition matching 9+19
- Place-record control-byte semantics and body-index binding
- Interior doorway graph
- Object residence and coordinate encoding (including the 28-bit claim)

## Provenance summary

| Fact | Evidence |
|---|---|
| World tables absent at title, present after Space+wait | Title capture vs `first-world` observe RAM |
| 31×8 body names at `$0081DC` | Two cold `first-world` runs, equal SHA-256 |
| Place labels ~`$023E56+` | Same runs; ERIS panel on PNG |
| Object / key labels ~`$03C000+` | Same runs |
| Scenario pin | `scenarios/first-world.json` |
