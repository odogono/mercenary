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
| 28-bit world coordinates                 | **Not this panel field**     | `016-283` is `$7A1C`/`$7A20`, independent of the Eris 16.16 camera at `$7A92`/`$7A9A` (#208). Cell `07-08` is the 16.16 pair. A 28-bit world encoding, if any, is not this readout. |
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
their recovered resident positions and radius/extent values. It omits the
structurally inferred types and Primaries, marks DAMOCLES's position as a
capture-time sample, and excludes the VOID sentinel. Its `source` block pins
the first cold run and its `coverage` block carries these limitations for
downstream readers.

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

### Navigation digits `016-283` — Confirmed (RAM pair); display map Partial (#208)

The left NAV triple is **not** the Eris 16.16 camera and **not** a 28-bit
encoding of `$7A92`/`$7A9A`. Those longs are the cell `07-08` pair already
bound in `damocles-walk-board-flight.md`.

**Source.** Unsigned 32-bit words **`$7A1C`** and **`$7A20`**. On the pinned
on-foot snapshot they read `17` and `290` while the panel shows `016-283`.
Writing `$00000099` / `$00000123` (`153` / `291`) redraws `149-284`. Writing
`16` / `283` redraws `015-276`. Walking 800 VBLs north raised `$7A9A` by 10758
and left `$7A1C`/`$7A20` and the `016-283` digits unchanged.

The panel is a 3-digit decimal derivation, not `printf` of the integers. Across
those samples the second field displays as `value - 7`; the first field is
usually `value - 1` (`17→016`, `16→015`) but `153→149` is not that rule.
Closed-form mapping and what quantity the pair measures (bearing, intercept,
…) stay Fog.

Reproduce: `panel-readout-probe.py poke --address 0x7a1c --bytes …` and
`navigation --vbls 800`.

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
- Object residence and coordinate encoding. The `016-283` panel pair is
  bound (#208) and is not the Eris camera; a 28-bit world encoding remains
  Unresolved as a general claim.

## Provenance summary

| Fact                                                   | Evidence                                                                                                   |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| World tables absent at title, present after Space+wait | Title capture vs `first-world` observe RAM                                                                 |
| 31×8 body names at `$0081DC`                           | Two cold `first-world` runs, equal SHA-256                                                                 |
| Body X/Y/Z and radius/extent arrays                    | Same runs; `$052DB0..$053078` range, apparent-size, and arrival/contact consumers                          |
| `payload/damocles/system.json`                         | Direct transcription of those recovered physical records; source and coverage are embedded in the document |
| 31 per-body range-draw lists                           | Same runs; Eris pointer binding and `$0530C8..$0531BC` list readers                                        |
| VOID all-body drawing                                  | Space branch `$0598A6..$059912` calls 30-body scan `$052DB0`                                               |
| 32×4 phase-rate source at `$0082DC`                    | Same runs; equal bounded SHA-256; `$04D648..$04D660` source-to-derived loop                                |
| Phase-rate slot binding                                | `$051E4E..$051E6A` accumulator loop and current-body indexed reads at `$05935A..$059392`                   |
| Place labels ~`$023E56+`                               | Same runs; ERIS panel on PNG                                                                               |
| `016-283` at `$7A1C`/`$7A20`, not `$7A92`/`$7A9A`      | #208 poke and 800-VBL walk; see above                                                                      |
| Object / key labels ~`$03C000+`                        | Same runs                                                                                                  |
| Scenario pin                                           | `scenarios/first-world.json`                                                                               |
