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
`MercenaryKit` or the Targ Data Payload; a general Damocles extractor. The
provenance-bound `payload/damocles/system.json` is the narrow #181 output once
resident centres were recovered.

**Language:** this note uses research wording (celestial body, place label,
interior, object). It does not redefine glossary **Location** / **Room**, and
it does not mint Damocles world terms in `CONTEXT.md`.

## Working Authority and reproduce path

| Item     | Value                                                                           |
| -------- | ------------------------------------------------------------------------------- |
| Program  | `roms/atarist/damocles_-_mercenary_ii_novagen_software_(uk).stx`                |
| SHA-256  | `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef`              |
| TOS pin  | EmuTOS 2.06 (`154803e3…8939d5`)                                                 |
| Lab      | `research/damocles-st/` (`damocleslab`)                                         |
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

| Hypothesis                               | Status                       | Working-Authority Evidence                                                                                                                                                                  |
| ---------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nine planets and nineteen moons          | **Partially confirmed**      | Nine symmetric draw clusters cover slots 1–28. Choosing each first/largest member as the Primary produces nine planets and nineteen moons, but no explicit type/Primary bytes were decoded. |
| Seamless spaceflight between bodies      | **Unresolved (place side)**  | Narrative copy and a `VOID` body slot support space as a place class; flight dynamics belong to #81.                                                                                        |
| Interiors with outward windows           | **Partially confirmed**      | Enterable buildings/places and door-key objects are present; the string `WINDOW` appears in in-game copy. Outward-window rendering is #79.                                                  |
| Larger city / object set than Targ       | **Confirmed (shape)**        | Dense place-label and takeable-object label pools after load; not a 16×16 / 192-Room / 64-slot Targ layout. Exact censuses left Unresolved.                                                 |
| 28-bit world coordinates                 | **Confirmed (surface axis)** | The engine masks the high word of each body position longword to `$FFF` at `$058F64`/`$058F6A`, so a Body's surface wraps every `$10000000` units an axis. `016-283` is the top ten bits of that pair, four Surface Cells a step (#371); cell `07-08` is the same pair read 16.16. |
| Starting place is Eris Capital spaceport | **Confirmed (panel + copy)** | Post-load panel shows `ERIS`; briefing strings name Capital City Spaceport. Fiction name “Eris” matches the body-table slot, not a Targ Location enum.                                      |

## Bucket findings

### Celestial bodies — Confirmed (pointer + shape)

**Pointer:** `$0081DC`, 31 consecutive 8-byte ASCII name slots
(SHA-256 of the 248-byte block:
`edc7217047567274b863366999b8085c6407b1bdf26df25ae4bd2cd52e44bf83`),
identical on two cold `first-world` loads; absent at title-screen.

**Shape:** fixed-width name roster, not a Targ surface-or-Room Location. Slots
in order:

| Index | Name     |
| ----: | -------- |
|     0 | DIALIS   |
|     1 | ICARUS   |
|     2 | MIDAS    |
|     3 | ACHERON  |
|     4 | DION     |
|     5 | ATROPOS  |
|     6 | CLOTHO   |
|     7 | LACHESIS |
|     8 | GAEA     |
|     9 | CRONUS   |
|    10 | CYCLOPES |
|    11 | ERIS     |
|    12 | SOLON    |
|    13 | THEON    |
|    14 | VESTA    |
|    15 | METIS    |
|    16 | LUCAN    |
|    17 | LOGOS    |
|    18 | AURORA   |
|    19 | TRITON   |
|    20 | PAN      |
|    21 | THALIA   |
|    22 | JUNO     |
|    23 | BACCHUS  |
|    24 | JASON    |
|    25 | TOLOSA   |
|    26 | PERSEUS  |
|    27 | MENTOR   |
|    28 | SAPPHIRE |
|    29 | DAMOCLES |
|    30 | VOID     |

**Interpretation:** the roster includes ordinary bodies, the comet **DAMOCLES**,
and **VOID** (treated here as the space-as-place class — see below). Explicit
type and parent fields were not isolated (Unresolved subclassing); the recovered
centre, radius/extent, phase-rate, and draw-list arrays are documented below.

### Issue #181 resident-record follow-up — one parallel phase-rate table

The resident-record route isolates one further 32-slot table in addition to
the body-centre and radius/extent arrays documented below. It does not recover
explicit type or Primary fields, or a complete orbit record.

At `$0082DC` are 32 consecutive big-endian longwords. The first 31 align with
the 31 name slots by the same `index * 4` selector used by `$7AA8`; slot 31 is
zero and has no name. The `$0082DC`–`$00835B` source block has SHA-256
`164bf36ecd63e1daee9d146a6dc4a4ef18ebdfe0fa673d1149c60ee2252deb6b`
in both independent cold runs named above.

The code establishes a bounded interpretation:

- `$04D648..$04D660` walks exactly 32 source longwords at `$0082DC`,
  arithmetic-shifts each by the current scale in `D0`, and writes the derived
  32-longword table at `$00835C`.
- `$051E4E..$051E6A` walks exactly those 32 derived longwords and adds them to
  32 phase accumulators at `$0062EA` once per main interrupt pass.
- `$05935A..$059392` loads the current body's `index * 4` selector through the
  longword alias at `$7AA6` and reads `$0062EA(selector)` into the view-angle
  path. In the pinned Eris capture `$7AA8 = $002C`, and `$002C / 4 = 11`, the
  Eris name slot.

The source values are therefore **Confirmed per-slot angular phase-rate
sources**. Whether the phase is axial rotation, orbital phase, or a
place-relative sky transform was left Unresolved here and is **decided under
#439 below: it is Body Rotation**, the rate each Body turns about its own axis.
The `VOID` entry, which is what blocked publishing this as orbital elements, is
a dead rate with no reader. The per-Body day, and the disproof of the orbital
reading, are in
[Issue #439 Body Rotation and orbit stasis](#issue-439-body-rotation-and-orbit-stasis--confirmed).

| Index | Name     | Raw phase-rate source (`$0082DC + 4*index`) |
| ----: | -------- | ------------------------------------------: |
|     0 | DIALIS   |                                 `$00000000` |
|     1 | ICARUS   |                                 `$00152400` |
|     2 | MIDAS    |                                 `$000055C0` |
|     3 | ACHERON  |                                 `$000FCA80` |
|     4 | DION     |                                 `$00023F80` |
|     5 | ATROPOS  |                                 `$00219B80` |
|     6 | CLOTHO   |                                 `$00056A80` |
|     7 | LACHESIS |                                 `$0000FD00` |
|     8 | GAEA     |                                 `$0000AC80` |
|     9 | CRONUS   |                                 `$00009E40` |
|    10 | CYCLOPES |                                 `$0006EF40` |
|    11 | ERIS     |                                 `$00005040` |
|    12 | SOLON    |                                 `$00005FC0` |
|    13 | THEON    |                                 `$00326980` |
|    14 | VESTA    |                                 `$000C5D80` |
|    15 | METIS    |                                 `$0000EC00` |
|    16 | LUCAN    |                                 `$0003CC80` |
|    17 | LOGOS    |                                 `$00002CC0` |
|    18 | AURORA   |                                 `$0038FCC0` |
|    19 | TRITON   |                                 `$00003D80` |
|    20 | PAN      |                                 `$00021700` |
|    21 | THALIA   |                                 `$0009EE00` |
|    22 | JUNO     |                                 `$00015B80` |
|    23 | BACCHUS  |                                 `$001ABFC0` |
|    24 | JASON    |                                 `$00020900` |
|    25 | TOLOSA   |                                 `$00039C40` |
|    26 | PERSEUS  |                                 `$00011300` |
|    27 | MENTOR   |                                 `$00008E00` |
|    28 | SAPPHIRE |                                 `$001179C0` |
|    29 | DAMOCLES |                                 `$00002E80` |
|    30 | VOID     |                                 `$00418900` |

In both captures, all 32 derived entries equal the corresponding source entry
shifted right by six (therefore `D0` was 6 when `$04D648` last ran). Its
independent-cold-run hash is
`b7b8587d50d055297e2c781b16e34cd724c6c06b87448adf4c275a42f7932c9d`.
The phase accumulators themselves legitimately differ with capture timing and
are not claimed as a stable table.

#### #181 hypothesis ledger

| Hypothesis                                                             | Status                                                | Working-Authority Evidence                                                                                                                                |
| ---------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One phase-rate source belongs to each named body/place slot            | **Confirmed**                                         | 32-longword bounded loop; `index * 4` selector reaches the matching phase accumulator; two equal cold-run source blocks.                                  |
| `$0082DC` contains orbital angular velocities                          | **Disproved (#439)**                                  | The phase never reaches a Body centre. It is Body Rotation: `$04E970` subtracts it to enter a Body's frame and `$059384`/`$0595C8`/`$0597AA` add it to leave it. |
| A parallel record supplies type (star/planet/moon/comet)               | **Partially confirmed**                               | No explicit type byte was found. Confirmed symmetric draw clusters plus relative centres support a structurally inferred star/9-planet/19-moon partition. |
| A parallel record supplies Primary                                     | **Partially confirmed**                               | No explicit parent field was found. Cluster anchors support the Primary assignments below. DAMOCLES has no Primary to find: #440 shows its centre comes from an authored waypoint table, not from any parent.        |
| A parallel record supplies radius                                      | **Confirmed (encoding decoded, #424)**                | `$006040 + selector` controls apparent size in the all-body scan and its exponent is compared with range's for arrival/contact. The field is a packed binary float; #528 fixes the unit: radius = size / 256 System units ([sky Bodies](damocles-sky-bodies.md#apparent-size-and-the-424-unit)). |
| A parallel record supplies orbit radius/elements or Cartesian position | **Cartesian Confirmed; orbit elements Disproved (#439)** | X/Y/Z body-centre arrays are recovered and are the whole of a Body's placement. No orbit centre, plane, period or eccentricity is read anywhere, and only DAMOCLES's centre is ever written. |
| The game draws bodies at range from VOID                               | **Confirmed (code path), live appearance Unresolved** | The space branch calls the 30-body range/sort/project loop. No live in-flight VOID display capture verifies final appearance; the `$78` selector captured under #439 is the dead prompt, whose view is black. |

#### #181 reproduce path

| Step                              | Command / evidence                                                                                                                                 | Expected result                                                                                                                                                                                                                                                                                                    |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Verify cold run 1                 | `research/damocles-st/lab verify --run research/damocles-st/work/observe-first-world-20260818T101013Z-c5a32b7d`                                    | Manifest and every listed artifact verify.                                                                                                                                                                                                                                                                         |
| Verify cold run 2                 | `research/damocles-st/lab verify --run research/damocles-st/work/observe-first-world-20260818T101117Z-010b9ad3`                                    | Manifest and every listed artifact verify.                                                                                                                                                                                                                                                                         |
| Find source-table reader          | `research/damocles-st/lab xref --run research/damocles-st/work/observe-first-world-20260818T101013Z-c5a32b7d --address 0x82dc`                     | One absolute reference at `$04D648`.                                                                                                                                                                                                                                                                               |
| Find derived-table readers        | same `xref`, address `0x835c`                                                                                                                      | References at `$04D64E`, `$0510AC`, and `$051E4E`.                                                                                                                                                                                                                                                                 |
| Find phase-array base             | same `xref`, address `0x62ea`                                                                                                                      | Reference at `$051E54`; indexed reads also occur at `$04E970`, `$059384`, `$0595C8`, and `$0597AA`.                                                                                                                                                                                                                |
| Confirm bounded source bytes      | SHA-256 exactly 128 bytes at `$0082DC` in each `observed.ram`                                                                                      | Both yield `164bf36e…252deb6b`.                                                                                                                                                                                                                                                                                    |
| Confirm Eris draw-list binding    | inspect `$7920`, `$7918`, `$0080C8`, and `$008150` in either `observed.ram`; read `$059268..$0592AC` and `$0530C8..$0531BC` in the ignored listing | `$7920 = $2C`; table slot 11 points to `$8150`; `$7918 = $8150`; renderer walks its selectors to `$FF`.                                                                                                                                                                                                            |
| Confirm bounded draw-list bytes   | SHA-256 124 bytes at `$00809C` and 177 bytes at `$00811C` in each `observed.ram`                                                                   | Both runs yield `5e80c8d7…5c0909` and `69f9a21d…bbc9a5`.                                                                                                                                                                                                                                                           |
| Confirm body centre/extent arrays | inspect `$052DB0..$053078`; hash the 128-byte Y and extent arrays and X/Z with only slot 29 normalised                                             | Y `38723a2e5e8a17aa7950dc008209944e898f69a7bd10a23c839d341e935fd5ca`; extent `680e707b0a65ea18862308f4c7dfb113dd98530441b49b2325cb9478963b0d7f`; normalised X `6d94a5aa94b9f7334877fee2e08d30e487acc134eac74d29e289e6b351abddac`; normalised Z `800b0a03eda4360d75d1704fb240020685f296b3e8c37a40593de40ea1aff1e1`. |
| Confirm VOID full-scan caller     | read `$0598A6..$059912` and `$052DB0..$053078` in the ignored listing                                                                              | Space branch calls `$052DB0`, which scans `$74` down to `$00`, sorts by range, derives apparent size, and draws.                                                                                                                                                                                                   |

The existing `geometry-code.txt` listing under ignored `work/` supplied the
instruction windows above. It is Working Disassembly / Restricted Material;
only the decoded facts and reproduce addresses are tracked here.

### Issue #439 Body Rotation and orbit stasis — Confirmed

The phase meaning left Unresolved above is now decided. **The per-slot rate at
`$0082DC` is each Body's axial rotation rate**: it turns the Body's own surface
frame under a System whose Body centres never move, so a sun and moons crossing
a surface sky are the observer's Body turning, not the System revolving. One
centre is written during play, DAMOCLES's, and that write is the comet's own
mover, not an orbit integrator.

#### The frame the accumulator rotates

Four instructions read `$0062EA`, and together they bracket the phase as a
rotation between two frames rather than a position in one.

Three are the surface passes. Each takes the Body Coordinate Step pair the
panel shows — `$059384` and `$0597AA`'s passes recompute it from the player's
own body-local position first, `$0595C8`'s reads the `$7A1E` an earlier pass
left — and then writes a **second, phase-shifted copy of the longitude only**
to `$042C6C`:

```text
$059384  add.w  $62ea(a1), d0    ; a1 = the selector alias at $7AA6
$059388  andi.w #$3ff, d0
$05938c  move.w d0, $42c6c.l
```

`$0595C8` and `$0597AA` are the same three instructions in the other two passes;
`$0597AA`'s pass reaches them from `$059780`, the second Body Coordinate Step
block already decoded for #371. The panel words `$7A1E`/`$7A22` never receive
the phase — only the `$042C6C` copy does — which is why the readout holds still
while the sky turns. `add.w` at a longword's own address reads its
**high** word, so the angle the sky uses is `(accumulator >> 16) & $3FF` — the
same ten-bit circle as the yaw word — and one full turn is `$04000000`
accumulator units.

The fourth read is the inverse, inside the arrival block at `$04E936`:

```text
$04e942  move.l $799a.w, d0      ; the craft's System position
$04e94a  sub.l  $5f40(a0), d0    ; minus this Body's centre, a0 = the selector
$04e94e  sub.l  $5fc0(a0), d1
$04e962  jsr    $4ea48.l         ; atan2 -> a ten-bit angle
$04e968  eori.w #$200, d0
$04e96c  move.w d0, $7a1e.w
$04e970  sub.w  $62ea(a0), d0    ; minus the phase: System frame -> Body frame
$04e97c  move.l d0, $7ab2.w      ; the body-local longitude the player lands on
```

Arriving **subtracts** the accumulator to turn a System-frame bearing into a
body-local longitude; standing on the surface **adds** it to turn a body-local
longitude back into a System-frame one. A quantity that converts between a
Body's own frame and the System frame in exactly those two directions is that
Body's rotation about its axis. An orbital phase would move the Body's centre,
and the centres are read here as constants.

#### What consumes the phase-shifted longitude

`$042C6C` and `$042C70` are the sky's own angle pair, and they have two readers:

| Reader    | What it does                                                                                                                                                                             |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$04529C` | Builds the celestial orientation matrix. It indexes the 1024-entry table at `$064000` with `$042C6C` and `$042C6C + $100` — sine and cosine of the phase-shifted longitude — and with `$042C70` and `$042C70 + $100` for the latitude, then composes them with the further angle words at `$042C2C`/`$042C30`/`$042C34`/`$042C38`. Reached through the vector `$042D18`, which the surface pass calls at `$0597E2`. |
| `$050562` | The day/night terminator. `$0079BE - $042C6C + $100`, masked to bit 9, then the same test on `$042C70`, selects `$7946` or `$7948` into `$7C86`, sets or clears `$7A4E`, and binds the scene palette's day half or base in `$7A10` ([the day/night terminator](damocles-day-night-terminator.md)). |

`$0079BE` is written once on arrival, at `$04EA30`, as the atan2 of the Body's
**own centre** about the System origin, EOR `$200`. DIALIS, the only Body whose
centre is the origin and the only Body whose rate is zero, sits at that origin,
so `$0079BE` is the Body's sub-stellar longitude in the System frame. The
terminator therefore compares a System-frame sub-stellar longitude against a
System-frame observer longitude, and the only term that moves between them is
the phase. That is a day.

#### Controlled perturbation

Three runs from the pinned `eris-spaceport-onfoot` pose, each sampling
`$042C6C` either side of one poke ([`body-phase-probe.py`](../../research/damocles-st/scripts/body-phase-probe.py)):

| Case     | Poke                                     | `$042C6C` before      | `$042C6C` after           | Display                          |
| -------- | ---------------------------------------- | --------------------- | ------------------------- | -------------------------------- |
| `spin`   | `$00835C + $2C` := `$00010624`            | 376, 377, 378, 378, 379, 380 | 389, 524, 665, 800, 935, 46 | starfield night → **blue day sky** |
| `freeze` | `$00835C + $2C` := `$00000000`            | 403, 412, 420, 429, 438, 446 | 448, 448, 448, 448, 448, 448 | night holds; only the panel clock moves |
| `jump`   | `$0062EA + $2C` += `$01000000` once       | 404, 412, 421, 430, 439, 448 | 705, 714, 723, 731, 740, 749 | night → **day** in one step      |

`jump` adds exactly a quarter of `$04000000` and `$042C6C` steps by exactly
`$100` of its 1024, which pins the angle's position in the accumulator — and the
day flag `$7A4E` goes from `$0000` to `$FFFF` on that one poke, so a quarter turn
of the accumulator is a quarter turn of the sky.

`spin` gives ERIS VOID's own rate — one turn every 1,000 VBLs — and the observer
crosses the terminator about a quarter of a turn later, within a few seconds of
play, turning the night starfield into daylight. **The Body Coordinate Readout
holds at `016-283` and the Cell Readout at `07-08` throughout.** The observer did
not move; the Body turned under them. That is the distinction the #181 ledger
could not draw.

#### The published rotation table

Raw source, the derived rate the interrupt adds, and the resulting day. One
interrupt is one VBL — the same `$051E4E` handler increments `$007B9C`, already
Confirmed as advancing once per VBL in
[the limo-key research](damocles-limo-key-pickup.md) — and the Working
Authority's PAL field rate is
[50 Hz](damocles-display-rate.md), so a turn in seconds is the VBL count over 50.

| Index | Name     | Raw `$0082DC` | Derived `$00835C` | VBLs a turn | Seconds a turn |
| ----: | -------- | ------------: | ----------------: | ----------: | -------------: |
|     0 | DIALIS   |  `$00000000`  |     `$00000000`   |           — |              — |
|     1 | ICARUS   |  `$00152400`  |     `$00005490`   |     3,100.0 |           62.0 |
|     2 | MIDAS    |  `$000055C0`  |     `$00000157`   |   195,652.7 |        3,913.1 |
|     3 | ACHERON  |  `$000FCA80`  |     `$00003F2A`   |     4,150.2 |           83.0 |
|     4 | DION     |  `$00023F80`  |     `$000008FE`   |    29,152.4 |          583.0 |
|     5 | ATROPOS  |  `$00219B80`  |     `$0000866E`   |     1,950.0 |           39.0 |
|     6 | CLOTHO   |  `$00056A80`  |     `$000015AA`   |    12,100.4 |          242.0 |
|     7 | LACHESIS |  `$0000FD00`  |     `$000003F4`   |    66,313.1 |        1,326.3 |
|     8 | GAEA     |  `$0000AC80`  |     `$000002B2`   |    97,259.2 |        1,945.2 |
|     9 | CRONUS   |  `$00009E40`  |     `$00000279`   |   106,017.2 |        2,120.3 |
|    10 | CYCLOPES |  `$0006EF40`  |     `$00001BBD`   |     9,450.6 |          189.0 |
|    11 | ERIS     |  `$00005040`  |     `$00000141`   |   209,061.9 |        4,181.2 |
|    12 | SOLON    |  `$00005FC0`  |     `$0000017F`   |   175,219.0 |        3,504.4 |
|    13 | THEON    |  `$00326980`  |     `$0000C9A6`   |     1,300.0 |           26.0 |
|    14 | VESTA    |  `$000C5D80`  |     `$00003176`   |     5,300.0 |          106.0 |
|    15 | METIS    |  `$0000EC00`  |     `$000003B0`   |    71,089.9 |        1,421.8 |
|    16 | LUCAN    |  `$0003CC80`  |     `$00000F32`   |    17,251.6 |          345.0 |
|    17 | LOGOS    |  `$00002CC0`  |     `$000000B3`   |   374,909.9 |        7,498.2 |
|    18 | AURORA   |  `$0038FCC0`  |     `$0000E3F3`   |     1,150.0 |           23.0 |
|    19 | TRITON   |  `$00003D80`  |     `$000000F6`   |   272,800.3 |        5,456.0 |
|    20 | PAN      |  `$00021700`  |     `$0000085C`   |    31,359.3 |          627.2 |
|    21 | THALIA   |  `$0009EE00`  |     `$000027B8`   |     6,600.0 |          132.0 |
|    22 | JUNO     |  `$00015B80`  |     `$0000056E`   |    48,279.8 |          965.6 |
|    23 | BACCHUS  |  `$001ABFC0`  |     `$00006AFF`   |     2,450.0 |           49.0 |
|    24 | JASON    |  `$00020900`  |     `$00000824`   |    32,202.0 |          644.0 |
|    25 | TOLOSA   |  `$00039C40`  |     `$00000E71`   |    18,152.2 |          363.0 |
|    26 | PERSEUS  |  `$00011300`  |     `$0000044C`   |    61,008.1 |        1,220.2 |
|    27 | MENTOR   |  `$00008E00`  |     `$00000238`   |   118,149.4 |        2,363.0 |
|    28 | SAPPHIRE |  `$001179C0`  |     `$000045E7`   |     3,750.1 |           75.0 |
|    29 | DAMOCLES |  `$00002E80`  |     `$000000BA`   |   360,800.3 |        7,216.0 |
|    30 | VOID     |  `$00418900`  |     `$00010624`   |     1,000.0 |           20.0 |

Every fast Body lands on a whole second: 62, 83, 39, 242, 189, 26, 106, 23, 132,
49, 75 and — for the sentinel — 20. That is not available as a check on the slow
Bodies, because only `raw >> 6` reaches the accumulator: one step of the derived
rate is ±13 s of ERIS's day and ±42 s of LOGOS's, so a whole-second period there
cannot be told from its neighbours. Read the fast rows as corroborating the
50 Hz field rate rather than the table as authored in seconds throughout.

**DIALIS's rate is zero.** The star at the System origin is the one Body the
engine never turns — and, being at the origin, the one Body for which the
sub-stellar longitude is undefined. Zero here is a star that does not rotate,
not a Body that does not orbit.

#### Orbit stasis — Confirmed

Nothing in the resident image writes the X array at `$005F40` or the Z array at
`$005FC0` except **one instruction pair, for one slot**:

```text
$051F36  move.l d0, $5fb4.w       ; $5F40 + $74 = DAMOCLES X
$051F3A  move.l d1, $6034.w       ; $5FC0 + $74 = DAMOCLES Z
```

`$051E88` is DAMOCLES's own mover, and [#440](https://github.com/odogono/mercenary/issues/440)
has since answered what it reads: the record reached through `$782C` is a cursor
into a 31-entry waypoint table at `$052022`, and the mover interpolates the
comet's centre between the two waypoints the Impact Clock at `$793C` falls
between. The comet's position is a function of the clock and of nothing else,
the path ends on ERIS's own centre at zero on the clock, and `$051F26..$051F32`
carries the player's camera origin along with it behind a gate that wants
`$7AAE` at 2. See [Comet motion](damocles-script-motion-time.md#comet-motion-440--confirmed-damocless-centre-is-a-function-of-the-impact-clock). The exception is accounted for
here only so that orbit stasis can be stated; the path itself belongs to that
note.

Every other reference to `$005F40`, `$005FC0`, `$00626A`, `$0060C0` and
`$006040` in the listing is a source operand. The one apparent exception,
`$05491E movea.l #$5f40, a3` followed by four `move.l d6, -(a3)`, predecrements:
it writes `$005F30..$005F3F`, below the array, and never inside it.

The one write to a Y entry is not motion either:

```text
$04C9B6  move.w #$8000, $626a(a0)
```

That is the destruction marker. `$04C98E` records a Body's centre into
`$0064D0`/`$0068D0`/`$006CD0`, forces its Y negative so the all-body scan's
`tst.w $626a(a0); bmi` skips it, and bumps the count at `$007BEA` toward `$1E`.
A destroyed Body leaves the draw; it does not move.

Observationally, over 35,617 interrupts of the pinned `body-phase` scenario and
again over 40,591 interrupts of a live `stasis` run, the Y array is byte-identical
and **DAMOCLES is the only slot whose X or Z changes**. Normalising slot 29 to
zero reproduces the #181 cold-run hashes
`6d94a5aa…51abddac` (X) and `800b0a03…a1aff1e1` (Z) at both ends of the run, so
the stasis holds within a session as well as across independent cold enters.

#### VOID — rate integrated, no reader

Slot 30 is integrated like every other: in the `body-phase` scenario its
accumulator advanced by exactly `$00010624 × 35,617`. Nothing reads it.

- The three surface readers are the only writers of `$042C6C`, and the space
  branch at `$05989C..$059928` is not one of them: it calls `$042D14` but never
  `$042D18`, so `$04529C` is not reached and `$042C6C` keeps whatever the last
  surface pass left in it.
- The fourth reader, `$04E970`, is the arrival inverse. Its `a0` is the selector
  of the Body being landed on, never the `$78` sentinel.
- `$050562`'s terminator is reached from the surface passes, not from the space
  branch.

So VOID's `$00418900` — a 1,000-VBL turn, the fastest entry in the table — is a
**dead rate**: authored into the slot the sentinel shares with the named Bodies,
integrated every VBL, and consumed by nothing while the selector is `$78`. It is
best read as the table having 32 uniform slots rather than 31 Bodies and an
exception.

A live capture with the selector at `$78` was taken from the `midas` dead-restore
pose: selector `$0078`, the view wholly black, the panel naming `VOID` over the
message `YOU'RE A BIT DEAD — TO QUIT OR LOAD PRESS HELP`, and `$042C6C` frozen at
466 — the value the last surface pass left. That state also sets the pause gate
`$007A26`, so nothing advances in it at all; the VOID rate's advance is evidenced
from the live Eris and scenario runs instead, where the selector is ERIS and
slot 30 still integrates.

**A live in-flight capture was attempted and not obtained**, so the reported
white VOID view is neither reproduced nor contradicted here; the only `$78` view
this note can show is the dead prompt's black. `arrival-route-probe.py` gained
`--capture-space` for it — it statesaves once occupancy reaches 2 — but neither
craft reachable from `eris-spaceport-onfoot` will fly (slot 7 and the nearest
neighbour both answer system string 22, `SHIP NOT REFITTED FOR FURTHER FLIGHT`),
and a `vesta-parliament-4-6` run boarded slot 3 and then sat on the ground with
`$7ACA` still reading contact for the whole climb window. The claim that VOID's
rate is dead does not rest on that capture: it rests on the space branch reading
no `$0062EA` at all.

#### The reset, and the third `$00835C` reference

The #181 reproduce path lists three references to the derived table and explains
two. The third, `$0510AC`, is not a read at all:

```text
$051058  move.w #$1, $7a0c.w
$05105e  move.l #$ffffffff, $7aa6.w   ; no current Body
$051080  move.l #$ffffc338, $793c.w   ; the Impact Clock, back to the start
$0510a8  move.w #$1f, d0
$0510ac  lea.l  $835c.l, a0
$0510b2  clr.l  (a0)+                 ; 32 derived rates
$0510b4  clr.l  -$2076(a0)            ; and the 32 accumulators at $0062EA
$0510b8  dbra   d0, $510b2
```

`$051052` is the reset. It zeroes both the derived table and every accumulator,
and sets the selector alias to `$FFFFFFFF`, so a restarted game starts every
Body's rotation from phase zero rather than carrying the previous session's.
`$04D648` refills the derived table from `$0082DC` on the next world load; the
source table is never written.

#### The pause gate, and why the Bacchus route was not available

`$051E26` tests `$007A26` and skips the whole interrupt body — the accumulate at
`$051E4E` included — when it is set. `$0555BE` sets it on scancode `$1C`
(Return) and `$0555C8` clears it on any other key, and `$05100A` sets it in the
death routine at `$050FF8`, which also forces the selector to `$78`. The probe
therefore presses Left Shift (`$2A`) rather than poking the flag.

Route 2's Bacchus leg did not produce a full turn. `damocles.bacchus.transporter`
restores alive but reaches `$050FF8` and the dead prompt within a few hundred
VBLs: the last live sample of run `body-phase-rate-20260922T094343Z-6f13d75e`
is interrupt 121,635 with the gate clear, and the next is 121,747 with it set.
Its accumulators advance at exactly the derived rate up to that point and then
stop with everything else. A Bacchus day is 2,450 VBLs, so no pose currently
pinned covers one. The full-turn evidence is the `spin` run on ERIS instead,
which crosses a terminator under a rate the engine itself uses.

#### #439 hypothesis ledger

| Hypothesis                                                              | Status                                  | Working-Authority Evidence                                                                                                                                                                                             |
| ----------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `$0082DC` is each Body's axial rotation rate                            | **Confirmed**                           | `$04E970` subtracts the accumulator to enter the Body frame, `$059384`/`$0595C8`/`$0597AA` add it to leave it; `$04529C` and the terminator `$050562` are its only consumers; `spin`, `freeze` and `jump` reproduce.  |
| `$0082DC` contains orbital angular velocities                           | **Disproved**                           | The phase never reaches a Body centre. The centres are read as constants by the same block that subtracts the phase, and only DAMOCLES's is ever written.                                                              |
| A sun and moons crossing a surface sky are the observer's Body turning  | **Confirmed**                           | `spin` carries ERIS from night to day with the Body Coordinate Readout and Cell Readout unchanged.                                                                                                                      |
| Body centres other than DAMOCLES move during play                       | **Disproved**                           | One centre writer in the image, `$051F36`/`$051F3A`, slot 29 only; Y array byte-identical and DAMOCLES the only X/Z change over 35,617 and 40,591 interrupts.                                                          |
| A parallel record supplies orbit elements                                | **Disproved as a live record**           | No orbit centre, plane, period or eccentricity is read anywhere. The System the engine draws is static apart from the comet, so there is nothing for orbital elements to drive. Authored elements outside the resident image are not addressed here. |
| DAMOCLES's centre, the one exception, is driven by the Impact Clock     | **Confirmed (#440)**                    | `$051E88` interpolates the waypoint table at `$052022` from `$00793C`; recomputing the centre from the clock alone reproduces the machine's longwords bit-exactly. See [Comet motion](damocles-script-motion-time.md#comet-motion-440--confirmed-damocless-centre-is-a-function-of-the-impact-clock).                    |
| VOID's rate has a consumer                                              | **Disproved (dead rate)**               | The space branch writes no `$042C6C` and reads no `$0062EA`; the arrival inverse never sees the `$78` selector.                                                                                                        |
| One interrupt of `$051E4E` is one VBL                                    | **Confirmed**                           | `$007B9C` advanced 35,617 against `$051D96`'s 35,617 in the pinned scenario, and `$007B9C` is already Confirmed as one per VBL.                                                                                         |

#### #439 reproduce path

| Step                                | Command / evidence                                                                                                                                                                | Expected result                                                                                                                                                              |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pin the scenario                     | `research/damocles-st/lab observe --scenario research/damocles-st/scenarios/body-phase.json`                                                                                       | Two RAM captures `observed.ram` and `observed-later.ram` about 36,000 interrupts apart; scenario SHA-256 `34298de6…0d66169c`. The gap is not fixed — `wait_vbls` is a host sleep — so read it from `$051D96` rather than assuming it. |
| Verify it                            | `research/damocles-st/lab verify --run research/damocles-st/work/observe-body-phase-20260922T101226Z-a7df7dd5`                                                                     | Manifest and all 22 artifacts verify.                                                                                                                                        |
| Confirm the rate, every slot         | in those two RAM files, `($0062EA + 4i)` delta against `($00835C + 4i) × ($051D96` delta`)`                                                                                        | all 32 slots match exactly, whatever the elapsed count is. The cited run elapsed 35,617 and `$007B9C` advanced 35,617 with it; two earlier runs of the same scenario elapsed 36,800 and 36,271 and matched on every slot as well. |
| Confirm the tables are the #181 ones | SHA-256 of 128 bytes at `$0082DC` and at `$00835C` in `observed.ram`                                                                                                            | `164bf36e…252deb6b` and `b7b8587d…f7932c9d`.                                                                                                                                  |
| Confirm orbit stasis                 | hash 128 bytes at `$005F40`, `$00626A`, `$005FC0` in both captures; then re-hash X and Z with slot 29 zeroed                                                                       | Y equal; X and Z differ; normalised X `6d94a5aa…51abddac` and Z `800b0a03…a1aff1e1` equal in both, and equal to the #181 cold runs.                                           |
| Watch the rate live                  | `python3 research/damocles-st/scripts/body-phase-probe.py --case rate --snapshot research/damocles-st/snapshots/eris-spaceport-onfoot.sav`                                         | `mismatched slots: none`; run `body-phase-rate-20260922T100105Z-0b31dc51`. Every run below defaults to the same pose and probe, SHA-256 `dfbb8375…f7e277cc9`.                 |
| Spin the Body                        | `--case spin --ordinary-rate --samples 12 --interval 2.0`                                                                                                                         | `$042C6C` steps ~136 a sample and the sky goes from starfield to blue; run `body-phase-spin-20260922T100138Z-a3f08f4c`.                                                       |
| Freeze it                            | `--case freeze --samples 12`                                                                                                                                                      | `$042C6C` holds; run `body-phase-freeze-20260922T094849Z-7e8df468`.                                                                                                          |
| Jump it                              | `--case jump --samples 12`                                                                                                                                                        | `$042C6C` steps by `$100` and `$7A4E` goes `$0000` → `$FFFF`; run `body-phase-jump-20260922T094929Z-78fd8c24`.                                                                |
| Confirm stasis live                  | `--case stasis --samples 24`                                                                                                                                                      | `moved: DAMOCLES (slot 29)` and nothing else over 40,591 interrupts; run `body-phase-stasis-20260922T095020Z-31658e46`.                                                       |
| Capture the VOID selector            | `--case void --snapshot research/damocles-st/snapshots/rehosted/midas.sav`                                                                                                        | selector `0x0078`, black view, `$042C6C` frozen; run `body-phase-void-20260922T095309Z-eeae57ad`.                                                                             |
| Account for the readers              | `research/damocles-st/lab xref --run research/damocles-st/work/observe-body-phase-20260922T101226Z-a7df7dd5 --address 0x62ea`, then read `$04E936..$04E97C`, `$05935A..$059392`, `$0595C0..$0595D6`, `$0597A2..$0597B8`, `$04529C..$0452F8`, `$050562..$05057E` in the ignored listing | Four reads: one inverse in the arrival block and three surface passes, all three writing `$042C6C`; two consumers of `$042C6C`, the orientation matrix and the terminator. |

### Issue #181 range-draw lists — Confirmed reader, Primary still unresolved

Immediately before the names, `$00809C` holds 31 big-endian long pointers,
one at `index * 4`. They point into `$00811C`–`$0081CC`, where each list is a
sequence of body selectors (`4 * body index`) terminated by `$FF`. The pointer
block hashes to
`5e80c8d7c46cc1a8fef6215f708d4614be403866a4dd58415a9468debf5c0909`
and the complete list area to
`69f9a21db1c39ac1678a565bc8be685e5bb0a878f06bb8ee75a93dac7abbc9a5`
in both independent cold runs.

This is not a pointer-only inference. On the Eris capture, `$7920 = $002C`.
The current-body setup at `$059268..$0592AC` adds that selector to the resident
parallel-array base `$005F40`; its `$215C` field is therefore
`$005F40 + $215C + $002C = $0080C8`, pointer-table slot 11, and it stores the
resulting `$008150` list pointer at `$7918`. The renderer at
`$0530C8..$053136` walks selector bytes from `$7918` until `$FF`; for every
entry it indexes the resident coordinate arrays `$005F40`, `$00626A`, and
`$005FC0`, transforms the result relative to the viewer, and calls the normal
geometry path. A second pass at `$05313A..$0531BC` walks the same list for
further range/projection work.

The lists form nine symmetric clusters among slots 1–28. For a member of one
cluster, the list contains every _other_ member, plus Dialis and Damocles. The
cluster partition is:

1. ICARUS
2. MIDAS, ACHERON
3. DION, ATROPOS, CLOTHO, LACHESIS
4. GAEA, CRONUS, CYCLOPES
5. ERIS, SOLON, THEON, VESTA, METIS, LUCAN
6. LOGOS, AURORA
7. TRITON, PAN, THALIA
8. JUNO, BACCHUS, JASON, TOLOSA, PERSEUS
9. MENTOR, SAPPHIRE

That is **Confirmed draw grouping** and is consistent with the secondary
9-planets/19-moons hypothesis: treating the first member of each ordered
cluster as a planet leaves the remaining nineteen as moons. It does **not**
by itself prove which member is the Primary, because the peer relation is
symmetric and the renderer does not distinguish parent from child. The
planet/moon typing and the proposed first-member Primary rule therefore remain
**Partially confirmed**, not Confirmed.

Every cluster list starts with DIALIS (`$00`). In each moon's list DAMOCLES comes next,
then the other members in slot order. In each planet's list the moons come next and
DAMOCLES comes last. So ERIS's list is DIALIS, SOLON, THEON, VESTA, METIS, LUCAN,
DAMOCLES, and METIS's is DIALIS, DAMOCLES, ERIS, SOLON, THEON, VESTA, LUCAN.

The three exceptional lists are also bounded facts:

- DIALIS (slot 0): DIALIS only (`00 FF` at `$00811C`).
- DAMOCLES (slot 29): ERIS through LUCAN, then DIALIS and ICARUS.
- VOID (slot 30): DIALIS only (`00 FF` at `$0081CB`).

_(Corrected 2026-09-25, [#529](https://github.com/odogono/mercenary/issues/529).)_ This
note first said DIALIS's list held no selectors. The walker at `$0530EE` stops only at a
negative byte, so `$00` is a DIALIS entry and not padding, and DIALIS's list is the same as
VOID's. No capture stands on either.
`payload/damocles/system.json` publishes every physical Body's list as `drawList`, in
this order, and `research/damocles-st/tests/test_system.py` checks each list against the
bytes at its `$00809C` pointer.

Thus the resident records answer one part of “how bodies are drawn at range”:
the current place/body selects an explicit list of other body records, and the
renderer projects the listed records through the ordinary geometry path. The
available run proves that path for Eris. #528 decodes how each listed Body becomes
pixels, as a disc split by a terminator ellipse
([sky Bodies](damocles-sky-bodies.md)). The VOID list's contents are
Confirmed statically, but its live selection and resulting display remain
Unresolved until VOID is reached or the selector is perturbed under capture.

### Issue #181 body centres, extent, and VOID full-scan path

The same `index * 4` selector addresses structure-of-arrays fields for all 31
slots: X at `$005F40`, Z at `$005FC0`, a radius/extent parameter at `$006040`,
Y at `$00626A`, packed appearance at `$0060C0`, and live angular phase at
`$0062EA`. `$05929A..$0592E2` reads the current record's X/Z and appearance.
More decisively, `$052DB0..$053078` scans selectors `$74` down through `$00`,
reads X/Y/Z, computes and sorts range, derives apparent size from `$006040`,
then submits the body through the normal geometry call at `$04FBAE`.
`$052FCA..$052FEA` also compares `$006040(selector)` with the nearest-body range
for its arrival/contact test. It subtracts the two **exponent words**, not the
values ([#528](damocles-sky-bodies.md#apparent-size-and-the-424-unit)). This
confirms `$006040` as the engine's radius/extent parameter. Its numeric
encoding is decoded below (#424): the field is a packed binary float, not the
integer its raw longword suggests. Its unit is settled by #528: radius =
size / 256 System units.

The space branch at `$0598A6..$059912` calls that full scan at `$0598FA`.
Consequently the VOID view does not depend only on VOID's one-entry local draw
list: it range-tests and sorts all 30 physical selectors (`$74` through `$00`),
excluding the VOID sentinel `$78`, before drawing the survivors.

Raw first-cold-run records follow. X/Y/Z are signed engine integers, not
authored physical units; the extent column is a packed binary float whose
decode is below (#424). Every Y value, the complete extent
table, and slots 0–28 and 30 of X/Z are identical in the second cold run.
DAMOCLES alone moves between captures: X `1879 -> 1406`, Z
`306253 -> 307781`. #440 accounts for that difference exactly: inverting the two
positions through the comet's waypoint table gives clocks of `02-29-04.6` and
`02-29-16.0`, against the `02-29-05` and `02-29-17` the two panels read. The two
captures are one function read at two times, not a nondeterministic record. Normalising only DAMOCLES's X/Z longword to zero yields
equal X and Z hashes
`6d94a5aa94b9f7334877fee2e08d30e487acc134eac74d29e289e6b351abddac`
and `800b0a03eda4360d75d1704fb240020685f296b3e8c37a40593de40ea1aff1e1`,
respectively; the complete extent table hash is
`680e707b0a65ea18862308f4c7dfb113dd98530441b49b2325cb9478963b0d7f`.

| Index | Name     |        X |   Y |        Z | Radius/extent |
| ----: | -------- | -------: | --: | -------: | ------------: |
|     0 | DIALIS   |        0 |   0 |        0 |       1446792 |
|     1 | ICARUS   |    46500 |   0 |    36000 |        991040 |
|     2 | MIDAS    |    90000 |   0 |  -192000 |       1056576 |
|     3 | ACHERON  |    82000 |   0 |  -206400 |        925184 |
|     4 | DION     |  -300000 |   0 |   -72000 |       1122112 |
|     5 | ATROPOS  |  -300000 |   0 |   -69440 |        922624 |
|     6 | CLOTHO   |  -293600 |   0 |   -83200 |       1054336 |
|     7 | LACHESIS |  -311200 |   0 |   -68800 |       1053056 |
|     8 | GAEA     |   180000 |   0 |   390000 |       1120512 |
|     9 | CRONUS   |   176800 |   0 |   388400 |        988160 |
|    10 | CYCLOPES |   184800 |   0 |   393200 |       1053696 |
|    11 | ERIS     |  -630000 |   0 |   390000 |       1184448 |
|    12 | SOLON    |  -628800 |   0 |   388000 |        987520 |
|    13 | THEON    |  -624000 |   0 |   389200 |        857088 |
|    14 | VESTA    |  -630000 |   0 |   392400 |       1054336 |
|    15 | METIS    |  -637200 |   0 |   390000 |        923264 |
|    16 | LUCAN    |  -635600 |   0 |   383600 |        922624 |
|    17 | LOGOS    |  -600000 |   0 |   900000 |       1184648 |
|    18 | AURORA   |  -596480 |   0 |   898400 |        857088 |
|    19 | TRITON   | -1350000 |   0 |  -600000 |       1316720 |
|    20 | PAN      | -1329200 |   0 |  -600000 |       1055616 |
|    21 | THALIA   | -1369200 |   0 |  -576000 |        989440 |
|    22 | JUNO     |  2100000 |   0 | -1200000 |       1318720 |
|    23 | BACCHUS  |  2100000 |   0 | -1225600 |       1053696 |
|    24 | JASON    |  2108000 |   0 | -1171200 |       1053696 |
|    25 | TOLOSA   |  2084000 |   0 | -1182400 |       1054336 |
|    26 | PERSEUS  |  2095200 |   0 | -1180800 |       1120192 |
|    27 | MENTOR   |  2760000 |   0 |  3480000 |        991040 |
|    28 | SAPPHIRE |  2780800 |   0 |  3512000 |        857088 |
|    29 | DAMOCLES |     1879 |   0 |   306253 |        991040 |
|    30 | VOID     | 50135040 |   0 | 50135040 |        991040 |

The coordinates and symmetric draw clusters together give a strong structural
type/Primary hypothesis: in every multi-member cluster, the first member is
far from Dialis while the others are tightly offset around it, and it has the
largest radius/extent in that cluster. Selecting those anchors yields exactly
nine planets and nineteen moons, independently matching the secondary claim.

| Type           | Bodies                                                       | Primary                                                                         |
| -------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Star           | DIALIS                                                       | none                                                                            |
| Planet         | ICARUS, MIDAS, DION, GAEA, ERIS, LOGOS, TRITON, JUNO, MENTOR | DIALIS                                                                          |
| Moon           | ACHERON                                                      | MIDAS                                                                           |
| Moon           | ATROPOS, CLOTHO, LACHESIS                                    | DION                                                                            |
| Moon           | CRONUS, CYCLOPES                                             | GAEA                                                                            |
| Moon           | SOLON, THEON, VESTA, METIS, LUCAN                            | ERIS                                                                            |
| Moon           | AURORA                                                       | LOGOS                                                                           |
| Moon           | PAN, THALIA                                                  | TRITON                                                                          |
| Moon           | BACCHUS, JASON, TOLOSA, PERSEUS                              | JUNO                                                                            |
| Moon           | SAPPHIRE                                                     | MENTOR                                                                          |
| Comet          | DAMOCLES                                                     | **None (#440)**; its centre is interpolated from an authored waypoint table, and the path is one perihelion pass about DIALIS |
| Sentinel/place | VOID                                                         | none                                                                            |

The explicit type/Primary _bytes_, if any, remain Unresolved. The table above
is **Partially confirmed / structurally inferred**, not a decoded field:
cluster membership and relative coordinates are Confirmed, while choosing the
first/largest member as Primary is inference. DAMOCLES is the one row that is
now settled rather than deliberately unassigned: #440 shows the comet's centre
comes from a waypoint table read against the Impact Clock, with no parent, no
centre and no elements anywhere in the path, so it has no Primary to assign.
The path's own geometry — a single close pass of the System origin — is
consistent with the DIALIS reading that was plausible before, but it remains a
shape, not a field.

`payload/damocles/system.json` publishes only the 30 physical records with
their recovered resident positions, radius/extent values and body colours. It
omits the structurally inferred types and Primaries, marks DAMOCLES's position
as a capture-time sample, and excludes the VOID sentinel. That marking is still
right and is now explained rather than merely cautious: the published slot-29
position is the comet's place at the capture's own Impact Clock, and #440 gives
the table and the rule that produce any other ([Comet motion](damocles-script-motion-time.md#comet-motion-440--confirmed-damocless-centre-is-a-function-of-the-impact-clock)). Its `source` block
pins the first cold run and the colour table's own SHA-256, and its `coverage`
block carries these limitations for downstream readers.

### Issue #379 body colour at `$0060C0` — Confirmed (decoded)

The `$0060C0` field the body-centre section above calls "packed appearance" is
a per-body colour table. Each slot is one longword at `index * 4` whose **low
word is an Atari ST `0RGB` palette value**; the table runs the full 31 slots
(124 bytes), not the 32 bytes a partial reading suggests. SHA-256 of those 124
bytes is `9fdcf2395ecaab1413317daebc46c90d1e817610061f365d2a257111273f75aa`.

The consumer was recovered by #391. At arrival, `$0592AC`–`$0592B4` reads the
low word with `a0` at `4 * body`, masks it to twelve bits, and publishes it to
`$7C88`, the surface base colour, and to `$7A1A`, the land colour an island
record's own colour at `+8` then overrides. So the engine itself never reads a
high word, and the base colour is what the surface is drawn in only where no
island covers it: a consumer drawing a Body needs both this colour and the
per-island land colours, and `payload/damocles/catalogue.json` carries the
latter. Triton is the single Body whose record colour (`$0214`) differs from its
base colour (`$740`).

Expanding each `0RGB` nibble by `n * 34` — the expansion
`research/damocles-st/damocleslab/catalogue.py` uses, and therefore the one
both Payload documents publish — over
`observe-first-world-20260818T101013Z-c5a32b7d`:

| Slot | Name     | Raw        | Masked | Expanded  |
| ---- | -------- | ---------- | ------ | --------- |
| 0    | DIALIS   | `00000777` | `$777` | `#eeeeee` |
| 1    | ICARUS   | `00000222` | `$222` | `#444444` |
| 2    | MIDAS    | `00000540` | `$540` | `#aa8800` |
| 3    | ACHERON  | `00000444` | `$444` | `#888888` |
| 4    | DION     | `00000055` | `$055` | `#00aaaa` |
| 8    | GAEA     | `00000030` | `$030` | `#006600` |
| 11   | ERIS     | `00000003` | `$003` | `#000066` |
| 14   | VESTA    | `00000246` | `$246` | `#4488cc` |
| 19   | TRITON   | `00000740` | `$740` | `#ee8800` |
| 29   | DAMOCLES | `0030E000` | `$000` | `#000000` |
| 30   | VOID     | `00000777` | `$777` | `#eeeeee` |

Colours are deliberately not unique: `$444` covers six bodies and `$246` four.

Two slots stand apart. **VOID (30) is `$777`, white** — independent
confirmation of a secondary-source claim that VOID has a white ground and a
white sky, from a body that is barely reachable. **DAMOCLES (29) is
`$0030E000`**, the only slot with a nonzero high word and not a plain `0RGB`
value. That needs no policy: the mask at `$0592B0` takes `$E000` to `$000`, so
black is the engine's own answer rather than an accident of expansion, and
`system.json` carries `$000` for the slot. Why slot 29 alone holds a nonzero
high word is still unresolved and not chased; Damocles is the comet, is
special-cased throughout, and is also the one body whose centre is a
capture-time sample, so the two oddities most likely share one cause.

This supersedes the reading in `damocles-filled-polygons.md` that `$0060C0` is
a 32-byte world face-colour palette; that note says so in place. Those 32 bytes
are body slots 0–7, which is why the block is byte-identical indoors and out.

### Secondary-source cross-check (mercenarysite.free.fr)

`http://mercenarysite.free.fr/gamma_system.htm` lists all 30 named bodies with
a colour swatch and a Damocles coordinate triple. It is secondary and partly
self-declared speculation, so nothing here is imported from it; it is recorded
because it was gathered by an observer independent of this project and it
agrees with the Working Authority in two ways worth pinning.

**Colour: 29 of 29 exact.** Its swatches for slots 0–28 name the same twelve-bit
words as `$0060C0`, nibble for nibble; they differ from the expansion above only
in taking each nibble to `n * 36` with `$7` as 255 rather than `n * 34`, which
is a choice about rendering three bits in eight and not a disagreement about the
recovered value. The page therefore describes recovered data, not an artist's
impression.

**Position: 29 of 29 agree in sign, and corroborate structure.** Its triples
are System Coordinate Readout values, not body centres — the page's author flew
to each body and transcribed the panel, including the panel's own red
highlighting, which the page preserves as red digits and which the plain text
loses.

- The **first and third components track X and Z** of the recovered centres,
  quantised to a cell somewhere near 65 536–66 700 units.
- **Red marks a negative axis**: red on the first component matches `x < 0` and
  red on the third matches `z < 0` for all 29 bodies, with no exceptions.
- **Six bodies read `10-00-05`** (Eris, Solon, Theon, Vesta, Metis, Lucan)
  because they share one cell; their recovered centres span about 13 000 units.
- **The middle component is `00` or a red `01`, never a positive `01`.** The
  five reading `-01` are Midas, Acheron, Atropos, Aurora and Triton.

That last point resolves an apparent contradiction with the all-zero Y array at
`$00626A`. The readout describes **the observer, not the body**: an approach
from just below the System's plane floors to `-1`, an approach from just above
floors to `0`. The recovered planar system stands, and
`payload/damocles/system.json` needs no change. Damocles carries no triple on
the page — "(moving)" — matching its `capture-time-sample` position here.

The same observer dependence is why **the System-mode cell size cannot be
recovered from this source**: every reading carries the author's own offset, so
the ±1 disagreements at Gaea, Logos, Juno and Pan are parking positions either
side of a cell boundary, not transcription errors. No single divisor and
rounding rule fits all 29. Pinning it needed the panel's formatting routine,
which the next section reads.

### Issue #382 the System Coordinate Readout cell — Confirmed (decoded)

**The cell is exactly 65 536 units, and the printed field is the high word of
the observer's own position longword.** Nothing is divided or rounded: the
engine reads the top sixteen bits of a signed longword, which is an arithmetic
floor, not a truncation toward zero.

`$04D912` chooses which readout the wide window shows from the scene mode at
`$7A8E`, mode `2` being space:

```text
$04D912  cmpi.w  #$2, $7a8e.w
$04D918  beq.b   $4d944           ; space: $04E414 then $04DEEE
$04D922  bsr.w   $4e390           ; surface: the Body Coordinate Readout
$04D926  bsr.w   $4df42           ; and the altitude window
```

`$04E414` is the System Coordinate Readout. It reads three words and treats
each the same way:

```text
$04E42C  move.w  $799a.w, d1      ; x, and $799E / $79A2 for y and z below
$04E43E  move.w  d1, d0           ; keep the sign
$04E440  bpl.b   $4e444
$04E442  neg.w   d1               ; print the magnitude
$04E444  cmpi.w  #$64, d1
$04E448  blt.b   $4e44e
$04E44A  move.w  #$64, d1         ; 100 or more clamps to the ** entry
$04E44E  bsr.w   $4e4b4           ; two digits from the pair table at $526C2
$04E452  bsr.w   $4e506           ; placed, inverted when d0 was negative
```

**The three words are the high halves of three longwords.** `$799A`, `$799E`
and `$79A2` are four bytes apart and `$058CEA`–`$058CF6` copies all three into
the camera triple:

```text
$058CEA  move.l  $799a.w, $7ab2.w  ; x
$058CF0  move.l  $799e.w, $7ab6.w  ; y
$058CF6  move.l  $79a2.w, $7aba.w  ; z
```

`$7AB2` / `$7AB6` / `$7ABA` are the camera position longwords the surface
readout and the object drops already use, and
[the arrival poses](damocles-gamma-system-location-ledger.md) publish in the
same raw signed 16.16 form. So the System Coordinate Readout prints the
observer's whole-cell part, one word an axis, in x, y, z order.

The **encoding** is shared with the surface work; the **frame** is not. On a
Body the same longwords count body-local surface-grid units, where one Surface
Cell is 65 536 and a Body Coordinate Step is four of them; in space they count
the System frame the resident centre arrays are in, the frame
`payload/damocles/system.json` publishes. A System field and a Surface Cell are
therefore the same arithmetic on two different rulers, and neither number may
be carried into the other's frame.

The pair table at `$526C2` is 101 two-byte entries of packed decimal digits,
`00` through `99`, with entry 100 holding the glyph `$0A` twice — the same `**`
the Cell Readout and the altitude window print past their own range.

**The magnitude is clamped, the sign is not printed.** `$04E4F6` tests the
retained sign and `$04E4FA`–`$04E502` inverts the assembled glyph rows for a
negative axis, which the space panel's palette — `$0598D2` loads `$777`, `$411`
and `$432` where the surface path loads `$654`, `$543` and `$432` — draws red.
That is the highlighting the secondary source preserved.

**Acceptance against the 29 recovered centres.** Taking the high word of each
published centre reproduces the cross-check above exactly. Eris, Solon, Theon,
Vesta, Metis and Lucan all read `10-00-05`, and no seventh body joins them;
red on the first field is `x < 0` and red on the third is `z < 0` for all 29,
because the high word's sign is the longword's sign. The `±1` disagreements the
page shows stay explained by the observer's own offset, which this form makes
exact rather than approximate: a body centre and an observer parked a few
thousand units the far side of a multiple of 65 536 differ by one whole field.

The middle field follows for free. The recovered Y array at `$00626A` is all
zero, so a body sits on `y = 0`; an observer a single unit below it holds
`$FFFFFFFF`, whose high word is `-1`, and an observer anywhere in `[0, 65 535]`
holds a high word of `0`. A positive `01` needs the observer 65 536 units above
the plane, which no approach in the page reaches. `$05110C` sets mode `2` and
seeds the triple directly, so the space position is the master in space and the
camera triple follows it, not the other way about.

Reproduce the acceptance from the tracked payload alone, without the
laboratory:

```sh
python3 -c "import json;d=json.load(open('payload/damocles/system.json'));\
print(sorted((b['position']['x']>>16, b['position']['z']>>16, b['name']) for b in d['bodies']))"
```

**Nothing in `payload/damocles/system.json` changes.** The readout is a
property of the panel and of the observer, not of a Body; the centres it is
checked against are already published, and a cell size is a formatting constant
rather than a recovered per-Body fact. **No consumer exists yet either**: the
Flyover draws no Navigation Readout and flies in raw Cartesian positions, so
this section is a pinned fact waiting for the surface that needs it.

The page also reports a per-body environment string (`No air`, `too hot`, `too
cold at night`, `Pressure too high`, `militarily protected`), distinguishing
Damocles from Mercenary III for Pan, Thalia, Tolosa and Perseus. That per-title
split hints at table flags rather than prose, and is recorded here as a lead for
whoever needs body environment. No such field has been looked for yet.

One structural claim is **not** confirmed: the page states the code has 32
planet entries, the 30 named plus VOID plus one unused. This project recovers
31 name slots at `$0081DC` (0–29 plus VOID at 30). The 32nd is unaccounted for;
the parallel phase-rate source at `$0082DC` is 32 longwords, which may be where
the claim comes from.

### Issue #424 body size at `$006040` — Confirmed (encoding decoded; unit settled by #528)

The `$006040` field the body-centre section above calls a "radius/extent
parameter" is a **packed binary float**, not the integer its raw longword
suggests. The low word is a mantissa normalised into `$1000..$1FFF`, an
implicit 1 at bit 12, and the high word is a binary exponent:

```
size = (raw & $FFFF) / $1000 * 2 ^ (raw >> 16)
```

Four independent lines agree, and none of them was used to construct the
decode:

1. **Every one of the thirty recovered mantissas** lies in `$1000..$1FFF`,
   across only eleven distinct values (`$1180`, `$12C0`, `$1388`, `$1400`,
   `$1680`, `$1770`, `$17C0`, `$1900`, `$1B80`, `$1E00`, `$1F40`). An integer
   field is not normalised by accident.
2. **The antilog table at `$60000` emits exactly that form.** Its entry at
   index `$800` is 5792, which is `4096 * sqrt 2`, so the table holds
   `4096 * 2 ^ (i / 4096)` across one octave and its outputs land in
   `4096..8191` — the same normalised range. This is why the all-body scan at
   `$052EBC` indexes the paired table with `d1.w`, the **mantissa alone**: a
   word-sized index into a 21-bit longword only makes sense if the field is
   packed.
3. **Structural agreement.** Decoded, DIALIS becomes the largest object in the
   System, and in every satellite cluster the member this document's
   structurally inferred table names the Primary outranks its satellites. Read
   as an integer neither holds: PERSEUS outranks MIDAS and the star is
   unremarkable. This is a fourth independent corroboration of the
   type/Primary partition, from a field that partition never consulted.
4. **Agreement with a live frame.** Decoded, ERIS is 3.33 times VESTA.
   Measured off a captured game frame of the ERIS cluster, where the two sit at
   nearly equal range from the viewer, ERIS draws 3.24 times VESTA — 2.8 per
   cent agreement with a number the decode did not see.

Read as an integer the System spans **1.69 times**, from 857,088 to 1,446,792,
and every body is nearly the same size. Decoded it spans **500 times**.

| Index | Name | Raw | Hex | Exponent | Mantissa | Decoded size | Type (inferred) |
| ----: | ---- | --: | --- | -------: | -------- | -----------: | --------------- |
| 0 | DIALIS | 1446792 | `0x161388` | 22 | `0x1388` | 5,120,000 | Star |
| 1 | ICARUS | 991040 | `0x0f1f40` | 15 | `0x1f40` | 64,000 | Planet |
| 2 | MIDAS | 1056576 | `0x101f40` | 16 | `0x1f40` | 128,000 | Planet |
| 3 | ACHERON | 925184 | `0x0e1e00` | 14 | `0x1e00` | 30,720 | Moon |
| 4 | DION | 1122112 | `0x111f40` | 17 | `0x1f40` | 256,000 | Planet |
| 5 | ATROPOS | 922624 | `0x0e1400` | 14 | `0x1400` | 20,480 | Moon |
| 6 | CLOTHO | 1054336 | `0x101680` | 16 | `0x1680` | 92,160 | Moon |
| 7 | LACHESIS | 1053056 | `0x101180` | 16 | `0x1180` | 71,680 | Moon |
| 8 | GAEA | 1120512 | `0x111900` | 17 | `0x1900` | 204,800 | Planet |
| 9 | CRONUS | 988160 | `0x0f1400` | 15 | `0x1400` | 40,960 | Moon |
| 10 | CYCLOPES | 1053696 | `0x101400` | 16 | `0x1400` | 81,920 | Moon |
| 11 | ERIS | 1184448 | `0x1212c0` | 18 | `0x12c0` | 307,200 | Planet |
| 12 | SOLON | 987520 | `0x0f1180` | 15 | `0x1180` | 35,840 | Moon |
| 13 | THEON | 857088 | `0x0d1400` | 13 | `0x1400` | 10,240 | Moon |
| 14 | VESTA | 1054336 | `0x101680` | 16 | `0x1680` | 92,160 | Moon |
| 15 | METIS | 923264 | `0x0e1680` | 14 | `0x1680` | 23,040 | Moon |
| 16 | LUCAN | 922624 | `0x0e1400` | 14 | `0x1400` | 20,480 | Moon |
| 17 | LOGOS | 1184648 | `0x121388` | 18 | `0x1388` | 320,000 | Planet |
| 18 | AURORA | 857088 | `0x0d1400` | 13 | `0x1400` | 10,240 | Moon |
| 19 | TRITON | 1316720 | `0x141770` | 20 | `0x1770` | 1,536,000 | Planet |
| 20 | PAN | 1055616 | `0x101b80` | 16 | `0x1b80` | 112,640 | Moon |
| 21 | THALIA | 989440 | `0x0f1900` | 15 | `0x1900` | 51,200 | Moon |
| 22 | JUNO | 1318720 | `0x141f40` | 20 | `0x1f40` | 2,048,000 | Planet |
| 23 | BACCHUS | 1053696 | `0x101400` | 16 | `0x1400` | 81,920 | Moon |
| 24 | JASON | 1053696 | `0x101400` | 16 | `0x1400` | 81,920 | Moon |
| 25 | TOLOSA | 1054336 | `0x101680` | 16 | `0x1680` | 92,160 | Moon |
| 26 | PERSEUS | 1120192 | `0x1117c0` | 17 | `0x17c0` | 194,560 | Moon |
| 27 | MENTOR | 991040 | `0x0f1f40` | 15 | `0x1f40` | 64,000 | Planet |
| 28 | SAPPHIRE | 857088 | `0x0d1400` | 13 | `0x1400` | 10,240 | Moon |
| 29 | DAMOCLES | 991040 | `0x0f1f40` | 15 | `0x1f40` | 64,000 | Comet |

**The unit is settled by #528**
([sky Bodies](damocles-sky-bodies.md#apparent-size-and-the-424-unit)). The sky
renderer draws a listed Body with pixel radius `size / depth`, while positions
project as `256 · u / depth`, so a Body is a sphere of radius **`size / 256`
System units**. 24 pinned frames match that pixel for pixel. The arrival test
agrees: it fires when the range's exponent is at least 8 below the size's, i.e.
within about two radii. What follows was written before that and is kept as
the record:
the decode yields sizes in their own unit, and nothing recovered at the time
tied that unit to the positional one. For a
consumer drawing a body against the distance scale, non-overlap of all thirty
bodies bounds the divisor below at **166.4** (tightest pair ERIS and VESTA,
2,400 units apart). That is a bound, not a decoding, and must be labelled
derived wherever it is used (ADR 0014).

`payload/damocles/system.json` continues to publish the raw longword as
`radiusExtent`, unchanged. Since #529 it also publishes the decode as `size` and
`size / 256` as `radius`. Neither is a field a Save reads, so `schemaVersion` stays 1.
Before #528, its `coverage` block said that the encoding was decoded and the physical unit
is not.

The provenance is worth recording: the packing was found because an Atlas
prototype drew every body from the raw integer and TRITON came out barely
larger than PAN, which cannot be right for a planet beside its satellite. The
working is in `docs/research/atlas-system-camera-prototype.md`.

### Cities / named places — Confirmed (pointer + shape)

**Pointer:** densest label pool observed around `$023E56`–`$0257xx` after
`first-world` load (region `$023E00`–`$025800` SHA-256
`8ce0dda809a18b20722ac8ce0487982a3e7bd434e006b11213d142de82312c70`),
stable across the two cold runs; absent at title-screen.

**Shape:** packed place records of the form leading control byte followed by a
10-byte name and a 10-byte kind (21 bytes when contiguous), for example:

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
**Unresolved** after one follow-up on the best lead (control-byte meaning),
except for BIRMINGHAM ISLAND: that area's `$FF`-terminated assembly map and
seven source names in this pool are structure group `$02`, Dion's island, which
the live Dion capture places ([#673](https://github.com/odogono/mercenary/issues/673)). See
[catalogue extraction](damocles-catalogue.md).

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

### Navigation digits `016-283` — Confirmed (source, quantity and closed form) (#371)

The Body Coordinate Readout is the top ten bits of the player's body world
position, one field an axis, printed rescaled from 1024 to 1000. It is a pure
function of the camera longwords, so a Damocles Session computes it from the
Pose it already holds.

**Closed form.** With `x` and `z` the body-local surface position in engine
units (`$7A92` / `$7A9A`, 65,536 units a Surface Cell, wrapped to 28 bits by
`$058F64`):

```text
stepX = (x >> 18) & $3FF
stepZ = ((z >> 18) + $100) & $3FF
field = (step * 1000) >> 10          # three decimal digits, zero-padded
```

Both shifts are arithmetic. One step is `$40000` units — **four Surface
Cells** — so a Body spans 1024 steps an axis and a 16-cell workspace spans
four. On the pinned Eris start pose `x = 4,681,905` and `z = 8,940,589` give
steps `17` and `290`, which print `016-283`.

**Where the engine does it.** At `$05935A`, once per surface pass:

```text
$05935A  move.w  $7aba.w, d1      ; high word of the body z longword
$05935E  asr.w   #$2, d1
$059360  addi.w  #$100, d1
$059364  andi.w  #$3ff, d1
$059368  move.w  d1, $7a22.w
$059372  move.w  $7ab2.w, d0      ; high word of the body x longword
$059376  asr.w   #$2, d0
$059378  andi.w  #$3ff, d0
$05937C  move.w  d0, $7a1e.w
```

`$059780` is the same block in the second pass. Reading the high word and
shifting by two is the `>> 18` above. `$7AB2` / `$7ABA` equal `$7A92` / `$7A9A`
in all 23 pinned memstates, and the block writes `$42C6C` / `$42C70` beside the
readout words, the x field first having the current body's phase accumulator at
`$62EA(a1)` added — so the same ten-bit quantity drives the sky transform.

The digits come from `$04E390`, which redraws only when the pair changes:

```text
$04E394  move.w  $7a1e.w, d0
$04E398  move.w  $7a22.w, d1
$04E3BC  mulu.w  #$fa00, d0       ; 64000/65536 = 1000/1024
$04E3C0  swap    d0
$04E3C4  divu.w  #$64, d0         ; hundreds, then tens, then units
```

`mulu.w #$FA00` followed by `swap` **is** the 1024-to-1000 rescale, which is
why the samples in #208 looked like an offset that would not hold: `17→016`,
`16→015` and `153→149` are all `(step * 1000) >> 10`, and so are `290→283`,
`291→284` and `283→276`. All six poke samples reproduce.

**The inverse confirms the encoding.** The landing path at `$04E968` takes a
ten-bit value, stores it to `$7A1E`, and expands it back into `$7AB2` with
`asl.w #$6` / `asr.w #$4` / `swap` / `clr.w` — a multiply by four then a shift
into the high word, which is `step << 18`. The body coordinate is therefore the
1024-step angular coordinate the landing code works in, a whole turn an axis,
the same 1024-step turn the yaw word counts; the z axis carries a fixed
quarter-turn (`$100`) bias. No body radius or extent is involved.

**Source, corrected.** The readout words are **16-bit**, at **`$7A1E`** and
**`$7A22`**. #208 read them as longwords at `$7A1C` / `$7A20`, which agrees
numerically — `$7A20` is never written and stays zero, and `$7A1C` is zero
whenever the readout is drawn — but `$7A1C` is not a coordinate high half. It
is an independent boolean the key dispatcher toggles with
`eori.w #$ffff, $7a1c.w` at `$055714` and clears at `$0556D8`, `$0556FC` and
five other sites, and it selects the sign of the `±3` nudge the throttle path
applies to `$7BAC`. `arrival-route-probe.py`'s deleted `THROTTLE_TOGGLE =
0x7A1C` was therefore reading the right address, and #367's desk reasoning
against it was wrong on that point even though its conclusion — that #208's
readout binding survives — is right. Restoring that probe field is left to a
throttle ticket.

**Evidence.** Thirty-one pinned Hatari memstates spanning twenty-three Bodies,
decoded without an emulator: in every one, `$7A1E` and `$7A22` equal the closed
form applied to `$7A92` / `$7A9A`, and the high halves at `$7A1C` / `$7A20` are
zero. Reproduce with `scripts/location-ledger.py poses --memstate NAME=PATH`,
or sweep them directly through
`damocleslab.catalogue.hatari_memstate_ram`. The twenty-seven attested arrival
Poses are published with their memstate SHA-256 in
`payload/damocles/arrival-poses.json`, and `web/test/damocles-panel.test.ts`
asserts the printed pair for each one, so the browser's readout is checked
against the Working Authority Pose by Pose.

| Pose                    | Body     | Body Coordinate Readout | Cell Readout |
| ----------------------- | -------- | ----------------------- | ------------ |
| `eris-spaceport-onfoot` | ERIS     | `016-283`               | `07-08`      |
| `eris-transporter-11-8` | ERIS     | `017-283`               | `11-08`      |
| `dion-2-3`              | DION     | `793-571`               | `02-03`      |
| `dion-transporter`      | DION     | `793-574`               | `03-14`      |
| `lucan`                 | LUCAN    | `951-250`               | `01-03`      |
| `damocles`              | DAMOCLES | `060-048`               | `00-00`      |

**Both of #367's residuals are closed.** The two Eris Poses stand in **one
workspace** — both carry workspace origin `64,128` — four cells apart, and read
different first fields, so the pair is not the workspace origin and moves
within a workspace. And because the readout is computed from the camera
longwords in code, with nothing else in the expression, the nearest-Site
reading is excluded outright: no Site, city or land base enters it. The
upgrade from Partial to Confirmed does not rest on the three supplied frames,
which stay uncommitted Restricted Material; the two frames that could be
checked (`016-283` at the start pose, `017-283` about two cells away) are
reproduced by the pinned Poses above.

**The manual's window labels stay loose.** The original names the wide window
"Planet/Moon co-ordinates" and the window beside it "Near City, or land base,
co-ordinates", but the second is bound to `$7A92`/`$7A9A`, the camera's own
16.16 pair, which is the player's Surface Cell and not a position relative to
any city. The wide window is now proved to be the player's own body position,
so the first label is apt and the second is not. The project keeps naming the
windows for what is proved — Body Coordinate Readout and Cell Readout.

The 800-VBL walk of #208 was never evidence either way: it moved `$7A9A` by
10,758, which is 0.16 of a Surface Cell and 1/25 of a Body Coordinate Step.

**Computability — the gate passes.** The form needs the player's body-local
position and two constants, and no body extent, body centre or Site data. A
Damocles Session holds the position already: `Pose.position` is in whole
surface-grid units anchored at the Body's workspace origin, the same units
`payload/damocles/arrival-poses.json` publishes. `web/src/damocles/panel.ts`
computes the readout from it, and the Damocles Panel Rendition no longer
stands it at nought.

Reproduce the original: `panel-readout-probe.py poke --address 0x7a1c
--bytes …` and `navigation --vbls 800`.

## Location coverage for #313

Which of these bodies carries reachable objects, and which has a validated
on-foot arrival pose, is counted in
[the Gamma System location coverage ledger](damocles-gamma-system-location-ledger.md)
([#314](https://github.com/odogono/mercenary/issues/314)). A roster entry in
this note is not evidence that a body is landable or walkable.

## Boundary handoff to #81

| #80 (this note)                                                           | #81 ([damocles-script-motion-time.md](damocles-script-motion-time.md))                     |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Celestial roster, VOID, place labels, interior-as-building, object labels | Script VM (if any), occupancy, craft control, orbital/flight motion, time / comet deadline |
| Where the player _can be_                                                 | How the player _moves and ages_ while there                                                |

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
- Inventory-level gaps left Unresolved (an explicit type/Primary field,
  place→body links, interior graph, object residence/coordinates) are enough
  to size risk for #82 without building an extractor now.

## What was tried and left Unresolved

One honest pass per bucket from `first-world` RAM, plus a short follow-up on
best leads (21-byte place stride, ~0x1A key stride, pointer scan into the body
name table). Not completed here:

- An explicit per-body type / Primary field
- Physical units for centre values (the extent unit is settled by #528: radius =
  size / 256 System units). Orbit centre, distance and plane are
  no longer among them: #439 shows the engine holds no orbital elements at all,
  because the System it draws is static apart from the comet
- A live in-flight VOID observation with the craft in space (the body-at-range
  code path is decoded, and the `$78` selector has now been captured, but only
  in the dead prompt, whose view is black rather than the reported white).
  `arrival-route-probe.py --capture-space` exists for it; what is missing is a
  pinned pose whose craft will actually leave the ground
- The attempted boarded-craft memory perturbation and launch replay remained on
  Eris; it therefore supplies no affirmative live-VOID evidence
- Direct metadata confirmation of the structurally inferred 9+19 partition
- Place-record control-byte semantics and body-index binding
- Interior doorway graph
- Object residence and coordinate encoding. The `016-283` panel pair is no
  longer among them: it is the top ten bits of the player's body position,
  four Surface Cells a step, decoded in full (#371).

## Provenance summary

| Fact                                                   | Evidence                                                                                                   |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| World tables absent at title, present after Space+wait | Title capture vs `first-world` observe RAM                                                                 |
| 31×8 body names at `$0081DC`                           | Two cold `first-world` runs, equal SHA-256                                                                 |
| Body X/Y/Z and radius/extent arrays                    | Same runs; `$052DB0..$053078` range, apparent-size, and arrival/contact consumers                          |
| `payload/damocles/system.json`                         | Extracted from those recovered physical records by `damocleslab.system` (#529); source and coverage are embedded in the document |
| 31 per-body range-draw lists                           | Same runs; Eris pointer binding and `$0530C8..$0531BC` list readers                                        |
| 31 per-body `0RGB` colours at `$0060C0`                | Same runs; 124 bytes SHA-256 `9fdcf239…273f75aa`; low word of each `index * 4` longword masked at `$0592B0`; 29 of 29 agree with an independent observer |
| VOID all-body drawing                                  | Space branch `$0598A6..$059912` calls 30-body scan `$052DB0`                                               |
| 32×4 phase-rate source at `$0082DC`                    | Same runs; equal bounded SHA-256; `$04D648..$04D660` source-to-derived loop                                |
| Phase-rate slot binding                                | `$051E4E..$051E6A` accumulator loop and current-body indexed reads at `$05935A..$059392`                   |
| Phase rate is Body Rotation, not orbit                 | The frame pair `$04E970` (subtract) and `$059384`/`$0595C8`/`$0597AA` (add); consumers `$04529C` and the terminator `$050562`; `spin`/`freeze`/`jump` perturbation runs (#439) |
| Body centres are static apart from DAMOCLES            | One centre writer in the image, `$051F36`/`$051F3A` for slot 29; `body-phase` scenario and a live `stasis` run leave the Y array byte-identical and change only slot 29's X/Z (#439) |
| Place labels ~`$023E56+`                               | Same runs; ERIS panel on PNG                                                                               |
| `016-283` is `(position >> 18)` an axis, rescaled 1024→1000 | Engine blocks `$05935A`, `$059780`, `$04E390` and the landing inverse `$04E968`; 23 pinned memstates across 15 Bodies; #208's six poke samples (#371) |
| The System Coordinate Readout's cell is `$10000` units | Mode switch `$04D912`; formatter `$04E414`–`$04E4B4`; the space triple `$799A`/`$799E`/`$79A2` copied to the camera longwords at `$058CEA`; high words of the 29 published centres reproduce the secondary source's shared `10-00-05` and its red axes (#382) |
| Object / key labels ~`$03C000+`                        | Same runs                                                                                                  |
| Scenario pin                                           | `scenarios/first-world.json`                                                                               |
