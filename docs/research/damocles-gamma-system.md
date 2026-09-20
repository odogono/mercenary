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
place-relative sky transform is **Unresolved**: notably `VOID` has a nonzero
value, so this table must not be published as orbital elements without a VOID
draw-path observation or a controlled perturbation.

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
| `$0082DC` contains orbital angular velocities                          | **Partially confirmed**                               | Values drive a per-slot angular phase, but rotation/orbit/sky-transform semantics are not separated and `VOID` also has a value.                          |
| A parallel record supplies type (star/planet/moon/comet)               | **Partially confirmed**                               | No explicit type byte was found. Confirmed symmetric draw clusters plus relative centres support a structurally inferred star/9-planet/19-moon partition. |
| A parallel record supplies Primary                                     | **Partially confirmed**                               | No explicit parent field was found. Cluster anchors support the Primary assignments below; DAMOCLES's Primary remains Unresolved.                         |
| A parallel record supplies radius                                      | **Confirmed (encoding unresolved)**                   | `$006040 + selector` controls apparent size in the all-body scan and is subtracted from range for arrival/contact; physical units are unknown.            |
| A parallel record supplies orbit radius/elements or Cartesian position | **Partially confirmed**                               | X/Y/Z body-centre arrays are recovered. No orbit centre, plane, eccentricity, or separation of orbital from rotational phase is decoded.                  |
| The game draws bodies at range from VOID                               | **Confirmed (code path), live appearance Unresolved** | The space branch calls the 30-body range/sort/project loop. No live VOID display capture verifies final appearance.                                       |

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

The three exceptional lists are also bounded facts:

- DIALIS (slot 0): no selectors.
- DAMOCLES (slot 29): ERIS through LUCAN, then DIALIS and ICARUS.
- VOID (slot 30): DIALIS only.

Thus the resident records answer one part of “how bodies are drawn at range”:
the current place/body selects an explicit list of other body records, and the
renderer projects the listed records through the ordinary geometry path. The
available run proves that path for Eris. The VOID list's contents are
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
`$052FCA..$052FEA` also subtracts `$006040(selector)` from nearest-body range
for its arrival/contact test. This confirms `$006040` as the engine's
radius/extent parameter, although its numeric encoding and physical unit are
not decoded.

The space branch at `$0598A6..$059912` calls that full scan at `$0598FA`.
Consequently the VOID view does not depend only on VOID's one-entry local draw
list: it range-tests and sorts all 30 physical selectors (`$74` through `$00`),
excluding the VOID sentinel `$78`, before drawing the survivors.

Raw first-cold-run records follow. X/Y/Z and extent are signed/unsigned engine
integers, not authored physical units. Every Y value, the complete extent
table, and slots 0–28 and 30 of X/Z are identical in the second cold run.
DAMOCLES alone moves between captures: X `1879 -> 1406`, Z
`306253 -> 307781`. Normalising only DAMOCLES's X/Z longword to zero yields
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
| Comet          | DAMOCLES                                                     | **Unresolved**; DIALIS is plausible but not encoded by the recovered peer lists |
| Sentinel/place | VOID                                                         | none                                                                            |

The explicit type/Primary _bytes_, if any, remain Unresolved. The table above
is **Partially confirmed / structurally inferred**, not a decoded field:
cluster membership and relative coordinates are Confirmed, while choosing the
first/largest member as Primary is inference. DAMOCLES's Primary is deliberately
not assigned.

`payload/damocles/system.json` publishes only the 30 physical records with
their recovered resident positions, radius/extent values and body colours. It
omits the structurally inferred types and Primaries, marks DAMOCLES's position
as a capture-time sample, and excludes the VOID sentinel. Its `source` block
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
except for Gaea Birmingham Island: the catalogue now recovers that area's
`$FF`-terminated assembly map and seven source names from this pool. See
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
- Meaning of the confirmed per-slot angular phase rate (axial rotation vs
  orbital phase vs place-relative sky transform)
- Orbit centre/distance/plane and physical units for centre/extent values
- Controlled current-body perturbation (the available captures are passive)
- A live VOID observation (the body-at-range code path is decoded)
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
| `payload/damocles/system.json`                         | Direct transcription of those recovered physical records; source and coverage are embedded in the document |
| 31 per-body range-draw lists                           | Same runs; Eris pointer binding and `$0530C8..$0531BC` list readers                                        |
| 31 per-body `0RGB` colours at `$0060C0`                | Same runs; 124 bytes SHA-256 `9fdcf239…273f75aa`; low word of each `index * 4` longword masked at `$0592B0`; 29 of 29 agree with an independent observer |
| VOID all-body drawing                                  | Space branch `$0598A6..$059912` calls 30-body scan `$052DB0`                                               |
| 32×4 phase-rate source at `$0082DC`                    | Same runs; equal bounded SHA-256; `$04D648..$04D660` source-to-derived loop                                |
| Phase-rate slot binding                                | `$051E4E..$051E6A` accumulator loop and current-body indexed reads at `$05935A..$059392`                   |
| Place labels ~`$023E56+`                               | Same runs; ERIS panel on PNG                                                                               |
| `016-283` is `(position >> 18)` an axis, rescaled 1024→1000 | Engine blocks `$05935A`, `$059780`, `$04E390` and the landing inverse `$04E968`; 23 pinned memstates across 15 Bodies; #208's six poke samples (#371) |
| The System Coordinate Readout's cell is `$10000` units | Mode switch `$04D912`; formatter `$04E414`–`$04E4B4`; the space triple `$799A`/`$799E`/`$79A2` copied to the camera longwords at `$058CEA`; high words of the 29 published centres reproduce the secondary source's shared `10-00-05` and its red axes (#382) |
| Object / key labels ~`$03C000+`                        | Same runs                                                                                                  |
| Scenario pin                                           | `scenarios/first-world.json`                                                                               |
