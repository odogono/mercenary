# Mercenary III full location recovery: groups and Body placements

Recovered 2026-10-01 from a fresh boot of the project's pinned Mercenary III STX.
These facts come from the **Mercenary III research baseline**, decoded from its
own loaded readers and records independently of Damocles's Working Authority. [ADR 0002](../adr/0002-separate-rom-research-from-implementation.md)
permits factual data recovery; original RAM, disassembly and probes stay ignored.
The existing [content-boundary report](mercenary-iii-i1-content-boundary.md)
describes the former opening-METIS limit; this note recovers the full static
group/Body inventory.

## Evidence identity

The fresh capture is `restricted/mercenary-iii-647/runs/location-census-334983y7/`.
Its `start.ram` SHA-256 is `cd697c802472a319fcd8fd5dd7193ad870cf4ff0a7f37cd6fda51893dd899fe4`; its `v6000.ram` SHA-256 is `43d49116edc364d6fea0fc161a09290a1a635e564cc75275b106dc2380fd67bb`.
The source media/configuration are pinned by
[`baseline.json`](../../research/mercenary-iii-st/config/baseline.json).
The tracked [location decoder](../../research/mercenary-iii-st/m3lab/census_locations.py)
reads the records below and retains their provenance. The
[census capture harness](../../research/mercenary-iii-st/m3lab/census_capture.py)
executes the original workspace builder under the pinned emulator to verify
those decoded records; no original instructions enter the application.

## Body roster and island identity

The Body-name consumer `$4E1B6..$4E1FC` selects the current Body from `$713C`
(or `$78` while carried) and indexes the eight-character roster at `$796A` by
**Body offset times two**. Thus Body offsets are `0, 4, 8, …, 120`, while roster
indices are `0..30`. Offset `$7C` is an eight-byte `$FF` sentinel, not a named
Body. `$78` names VOID and supplies the carried/out-of-world workspace.

Body setup `$5A178..$5A1EE` halves the Body offset and indexes the signed-word
self-relative pointer table at `long($4BD1E) = $63002`. Each island descriptor is
10 bytes: signed X and Z origin words, a signed relative geometry pointer word,
a group word, and a land-colour word. A first word `$8000` ends a Body's list.
The nearest-island walk `$57544..$575CC` advances ten bytes; `$5751A` reads its
group at `+6`. `$4F0D8` copies its two origin words into `$6F4A/$6F4E` (the high
words of the live X/Z origins). These records therefore bind groups and origins
to Bodies independently of their area-name labels.

The 31 named roster entries are DIALIS, ICARUS, MIDAS, ACHERON, DION, ATROPOS,
CLOTHO, LACHESIS, GAEA, CRONUS, CYCLOPES, ERIS, SOLON, THEON, VESTA, METIS,
LUCAN, LOGOS, AURORA, TRITON, PAN, THALIA, JUNO, BACCHUS, JASON, TOLOSA,
PERSEUS, MENTOR, SAPPHIRE, DAMOCLES and VOID, in that order. This is MIII's own
roster: a shared name does not supply Damocles's island placement.

## All authored groups

The workspace reader `$4F0F2` takes the current group from word `$6FDE`; it needs
no input register. Its table root is
`$1AAC0 + sword($1B10C) = $1AAC0 + $61FC = $20CBC`. Each signed-word table entry
is relative to that root. The first stream offset `$74` leaves 58 words before
the first stream: groups `0..56` and a zero word at index 57. The zero is not a
further authored stream. All 57 decoded groups fit into `$20D30..$23ABD`.

A census reads every group, including empty and unused groups. Groups `1, 10,
13, 19, 25, 41..48` share the empty `$20D3E` record and have no named Body
placement. Group 0 supplies the empty cells of bare islands. Groups 29..40 are
LUCAN's twelve distinct island outlines with empty cell workspaces. CRONUS group
54 has its own museum area label but no authored cell structure: an island
outline or area name is not an occupied-cell structure.

The count column is the number of distinct cells with a nonzero structure slot
**after authored overrides**, before Midas replication. Repeated writes to one
cell count once. Road/ground overrides with slot zero remain ground records.
These source records contain 795 nonzero cells across all groups, including the
two VOID cells. The initial late overlay removes one LOGOS cell, leaving **794**
occupied cells in the ready workspaces with Midas replication disabled: 791
ordinary physical cells, two VOID cells and the one authored MIDAS cell.
Enabling MIDAS's actual 256-cell replication yields **1,049** ready-workspace
bindings, including VOID, or **1,047** non-VOID workspace bindings. MIDAS
repeats beyond that one workspace period. The original runtime captures
cross-check the complete workspaces before publication.

DION group 2 has 143 nonzero override writes but 142 final structure cells:
cell `$82` is written first as slot 146 at `$20DBA`, then as slot 199 at
`$20F9A`. Counting writes would invent a second structure at the same cell.

| Group | Stream | Authored structure cells | Area name | Body offset and origin X/Z |
| --- | --- | ---: | --- | --- |
| `0` / `$00` | `$20D30` | 0 | — | DIALIS `0` (0, 0); LACHESIS `28` (2644, 253); LACHESIS `28` (2644, 353); LACHESIS `28` (2644, 453); LACHESIS `28` (2644, 553); LACHESIS `28` (2644, 653); LACHESIS `28` (2644, 753); LACHESIS `28` (2644, 853); LACHESIS `28` (2644, 953); LACHESIS `28` (2644, 1053); CYCLOPES `40` (3287, 1645); CYCLOPES `40` (3287, 1245); CYCLOPES `40` (3687, 1245); CYCLOPES `40` (3687, 1645); AURORA `72` (1214, 683); TRITON `76` (3337, 3213); JUNO `88` (3475, 854); JASON `96` (366, 2187); SAPPHIRE `112` (3444, 2273); DAMOCLES `116` (3991, 2101) |
| `1` / `$01` | `$20D3E` | 0 | — | No named Body placement |
| `2` / `$02` | `$20D4C` | 142 | BIRMINGHAMISLAND | DION `16` (3252, 1314) |
| `3` / `$03` | `$21410` | 25 | METIS     MOONBASE | METIS `60` (2527, 1066) |
| `4` / `$04` | `$21544` | 1 | SOLON     BASE | SOLON `48` (3974, 1396) |
| `5` / `$05` | `$21581` | 22 | POLITBURO CITY | VESTA `56` (1083, 307) |
| `6` / `$06` | `$21702` | 28 | ACHERON   RETREAT | ACHERON `12` (3419, 298) |
| `7` / `$07` | `$21892` | 22 | UR        CITY | GAEA `32` (512, 1792) |
| `8` / `$08` | `$219D8` | 24 | LOGOS     CITY | LOGOS `68` (1294, 2648) |
| `9` / `$09` | `$21B47` | 5 | THEON     BASE | THEON `52` (2546, 3334) |
| `10` / `$0A` | `$20D3E` | 0 | — | No named Body placement |
| `11` / `$0B` | `$21BF0` | 10 | THALIA    BASE CAMP | THALIA `84` (1999, 3256) |
| `12` / `$0C` | `$21C75` | 7 | PAN HADES LABOURCAMP | PAN `80` (421, 1799) |
| `13` / `$0D` | `$20D3E` | 0 | — | No named Body placement |
| `14` / `$0E` | `$21D42` | 1 | VULCAN    ISLAND | GAEA `32` (3072, 256) |
| `15` / `$0F` | `$21D6E` | 112 | CHALDEA   METROPOLIS | GAEA `32` (256, 768) |
| `16` / `$10` | `$22197` | 23 | SNOW      ISLAND | ERIS `44` (32, 1056) |
| `17` / `$11` | `$22288` | 24 | VELOS     CITY | ERIS `44` (1536, 768) |
| `18` / `$12` | `$22467` | 98 | CAPITAL   CITY | ERIS `44` (64, 128) |
| `19` / `$13` | `$20D3E` | 0 | — | No named Body placement |
| `20` / `$14` | `$229BD` | 30 | BARE      ISLAND | ERIS `44` (3072, 512) |
| `21` / `$15` | `$22B49` | 46 | KEY       WEST | ERIS `44` (2560, 3584) |
| `22` / `$16` | `$22D9D` | 11 | ALKANE    BASE | PERSEUS `104` (3834, 821) |
| `23` / `$17` | `$22E5B` | 14 | ENTERPRISEBASE | TOLOSA `100` (2737, 1571) |
| `24` / `$18` | `$22F1D` | 19 | BACCHUS   WAYSTATION | BACCHUS `92` (1661, 1586) |
| `25` / `$19` | `$20D3E` | 0 | — | No named Body placement |
| `26` / `$1A` | `$2304A` | 23 | MENTOR    WAYSTATION | MENTOR `108` (2817, 268) |
| `27` / `$1B` | `$23120` | 25 | DION      NORTH | DION `16` (3316, 1378) |
| `28` / `$1C` | `$232E9` | 25 | DION      EAST | DION `16` (3316, 1298) |
| `29` / `$1D` | `$234E0` | 0 | — | LUCAN `64` (100, 173) |
| `30` / `$1E` | `$23506` | 0 | — | LUCAN `64` (173, 100) |
| `31` / `$1F` | `$23556` | 0 | — | LUCAN `64` (200, 0) |
| `32` / `$20` | `$23570` | 0 | — | LUCAN `64` (173, -100) |
| `33` / `$21` | `$235BA` | 0 | — | LUCAN `64` (100, -173) |
| `34` / `$22` | `$235EF` | 0 | — | LUCAN `64` (0, -200) |
| `35` / `$23` | `$23621` | 0 | — | LUCAN `64` (-100, -173) |
| `36` / `$24` | `$23641` | 0 | — | LUCAN `64` (-173, -100) |
| `37` / `$25` | `$2366D` | 0 | — | LUCAN `64` (-200, 0) |
| `38` / `$26` | `$2368A` | 0 | — | LUCAN `64` (-173, 100) |
| `39` / `$27` | `$236D4` | 0 | — | LUCAN `64` (-100, 173) |
| `40` / `$28` | `$23712` | 0 | — | LUCAN `64` (0, 200) |
| `41` / `$29` | `$20D3E` | 0 | — | No named Body placement |
| `42` / `$2A` | `$20D3E` | 0 | — | No named Body placement |
| `43` / `$2B` | `$20D3E` | 0 | — | No named Body placement |
| `44` / `$2C` | `$20D3E` | 0 | — | No named Body placement |
| `45` / `$2D` | `$20D3E` | 0 | — | No named Body placement |
| `46` / `$2E` | `$20D3E` | 0 | — | No named Body placement |
| `47` / `$2F` | `$20D3E` | 0 | — | No named Body placement |
| `48` / `$30` | `$20D3E` | 0 | — | No named Body placement |
| `49` / `$31` | `$2374D` | 2 | — | VOID `120` (0, 0) |
| `50` / `$32` | `$23767` | 22 | CLOTHO    NEW TOWN | CLOTHO `24` (2421, 300) |
| `51` / `$33` | `$238BC` | 5 | TAKOUSHI  BASE | ICARUS `4` (624, 688) |
| `52` / `$34` | `$2390B` | 5 | PULVIN    MINES | LACHESIS `28` (2644, 153) |
| `53` / `$35` | `$2395A` | 15 | IDI       CENTRE | CYCLOPES `40` (3487, 1445) |
| `54` / `$36` | `$23A06` | 0 | CRONUS    MUSEUM | CRONUS `36` (2564, 873) |
| `55` / `$37` | `$23A3A` | 8 | ATROPOS   WAYSTATION | ATROPOS `20` (42, 225) |
| `56` / `$38` | `$23A95` | 1 | THE MIDAS PROJECT | MIDAS `8` (1729, 938) |

## Stream and label formats

`$4F114..$4F19E` skips a two-byte header and consumes three-byte extent runs until
a zero byte. Positive run headers select a row (header minus one), and negative
headers select a column (ones' complement); start/end bytes describe the
inclusive run. The builder clears and fills the 256-entry run grid at `$1AAC0`.
Two colour bytes follow, then six selector indices into word table `$1B10E`.
`$4F1C2..$4F224` derives orientations at `$4170` and ground words at `$1AEC0`.

`$4F25A..$4F2A6` consumes overrides until reference byte `$FF`. Each is
`[ground reference, cell, low structure-slot byte]`; when that slot byte is
nonzero, three further bytes give `[high slot/scene selector, dx, dz]`.
A cell workspace at `$4CF0` uses four bytes: selector plus the ninth slot bit,
low slot byte, signed dx and signed dz. Thus the structure identity is the low
nine bits of its first word, and the scene selector is the high byte masked
with `$FE`. This is not an orientation word.

The following area label is twenty bytes, then repeated `[cell, twenty-byte
name]` records, ended by cell zero. An empty list is one zero byte. The builder
publishes the area-label root as `$7100`; after skipping this list it publishes
the subsequent special-cell list as `$70FC`. `$55F52..$55FA8` uses a cell's own
name when present and the area name otherwise. Consequently an area label is
not a structure name, nor is it a Body binding. In particular, MIII's DION
main-island area is **BIRMINGHAMISLAND**, while its descriptors independently
bind group 2 to DION.

The builder's last overlay walk `$4F2DC..$4F304` consumes six-byte records from
`$57DA`: group, cell, replacement structure word, and two trailing bytes. Only
matching groups with a nonnegative replacement word overwrite the workspace's
first word. The fresh opening list has just group 8 / cell `$32` / replacement
zero and a terminator; `start.ram` and `v6000.ram` agree. This clears the authored slot 136 at
LOGOS cell `$32` (source override `$21A31`), reducing that group's count from
24 authored cells to 23 initial ready-workspace cells. This is an evidenced later construction rather than speculative absent data:
`$515FC..$5163E` demands group 8 / cell `$32` and the placed object's bounds;
the continuation `$51664..$51678` eventually shifts the six-byte overlay list,
removing its first record, then `$51690` calls the workspace builder and
`$51694` rebinds the cell. The full original-game structure document therefore
retains authored slot 136 separately as initially cleared and restored by this
control path. Initial-census totals still exclude it.
The ready-workspace
boundary is `$4F304`, immediately before the jump to `$51B82`; subsequent taxi
setup mutates service residents and is outside the static workspace census.

## MIDAS repeats its structure

Body setup compares the half-offset against four at `$5A1D8..$5A1DC`, so Body
8 (MIDAS) sets byte `$70C0` true. `$4F2BC..$4F2D2` then copies cell 0's structure
word to every one of the 256 cells, leaving their dx/dz bytes as authored.
Group 56 has one authored cell, but its Midas runtime workspace therefore has
**256 structure cells**. A group-only capture with `$70C0=0` deliberately reads
the authored stream and cannot by itself describe the actual MIDAS workspace.
The cell selector `$55E90..$55EBC` also masks each cell-coordinate word with
`$F` in this mode, so this 16×16 pattern repeats when a player crosses its
bounds. It is misleading to claim these are 256 unique authored buildings or
that their coordinate period is the whole Body.

## Resident identities, floors and completeness

The [object decoder](../../research/mercenary-iii-st/m3lab/census_objects.py)
accounts for persistent slots **1–246**. The current structure uses draw slot 0;
slots **247–255** are cell-bound template working slots, as independently
established by [the persistence study](mercenary-iii-taxi-persistence.md).
Model-table entries beyond these residents include separate driver forms and
street-furniture definitions, rather than more persistent object identities.

The original resident location record at `$681C + 4 × slot` contains **Body
offset, association, Floor, cell**, in that order. The historical opening
exporter's field names `kind` and `body` do not express those first and third
meanings; the census decoder reads them with the recovered semantics. The
surface reader `$53C2A..$53C5E` matches Body and zero association; the indoor
reader `$53C5E..$53CC4` matches cell, group, Floor and the structure's association
hooks. Surface objects can retain stale group metadata, so their hosts are not
inferred from it.

A held object has bit 7 set in its state byte at `$641E + 4 × slot`. Pickup
`$55418..$55438` clears its former residence and selects Body `$78` (VOID).
`$53CC4..$53D32` gives carried items dummy coordinates in group 49; these are not
navigable positions. The initial Carried Stack is slots **104 TAXICARD, 103 BUS
PASS, 135 ACME UNIVERSAL**, and its membership exactly matches the held bits.
The original object-destination reader `$5A09A..$5A0F0` refuses Body zero and
VOID as absent destinations. The fresh census therefore has **180 indoor,
38 surface, 25 out-of-world, and three carried** slots. NULL-model records keep
their slot identities rather than being dropped from the count.

The opening prison script sets the held bit of slot **38, DOOR KEY A**, at
`$6FF5F`. In the fresh capture before that opcode, this object is still placed
at B. QUEUE LOCKSMITHS on GAEA; its pre-script residence is retained in the
object table. The [prison-door report](mercenary-iii-prison-door.md#binding-and-the-key)
confirms why its held bit enables the prison door.

Alias binding `$560F4..$5612A` reads storey pitch from the first word masked
with `$7FFF`, and stores the Floor Table pointer at alias `+6`. Elevator
selection `$56D66..$56D7A` rejects a zero entry. The supported floor indices are
**0–10** (`$56D1E..$56D36`); the byte at alias `+17` is not Floor 11. Direct
records provide ground geometry without an alias Floor Table. On arrival,
`$56DFE..$56E06` derives the eye height from Floor × pitch + 63, and
`$56E56..$56E5A` assembles that floor's geometry. Floor 0 displays G and Floor
10 displays B; those labels are not absolute Y positions.

Every one of the **180 indoor residents** matched a nonzero floor binding and
its association hook when checked against the original builder's ready
workspace. MIDAS's separately captured uniform workspace is necessary for slots
101 and 118: a group-only authored capture leaves their remote cell empty,
whereas the actual MIDAS mode binds slot 68 and association 1 there. All 57
ready workspaces matched the source stream's selected slot, scene selector,
dx and dz, with the initial LOGOS overlay applied. The eight decoder checks
and four capture-harness checks pass alongside the existing 44 laboratory
checks (**56 total**).

## Source ledger

Ranges are half-open. Agreement between fresh opening and loaded play is checked
for the actual source slices; no claim depends on incidental RAM elsewhere.

| Range | Role | Opening SHA-256 | Same at v6000 |
| --- | --- | --- | --- |
| `$0796A..$07A6A` | Body roster | `4017d74af6074c66905919b453695ab0d893d67f83ec487670d8e48e063c9be6` | yes |
| `$20CBC..$23ABD` | Group table, streams and labels | `741c610872e50272367a8bf7ddcc898e50953fe75f5ebc57d425403060fe0aca` | yes |
| `$63002..$632F4` | Body island lists | `af1fafd38a0b628fd4bf0313b4f452d569a959db2e7b9b62768b7dea9e5212b4` | yes |
| `$4F0D8..$4F30A` | Group selection and workspace builder | `af4560971324fcf70e580626729b110b17f7f8658eaa8f8ce44cb8049e298198` | yes |
| `$5751A..$575D0` | Island selection | `ca68cc92eea0113d3b1da7d51365d2a0a6109a9e3180c1f88e1b15867e763939` | yes |
| `$5A178..$5A1EE` | Body setup and island-list binding | `2534b54fa963dfe4273d093bf9afae36436975a35868a0d79a24844c38b2fb1b` | yes |
| `$4E1B6..$4E1FC` | Body-name consumer | `73fa114c374575aec887a666ba58a2a47506bfde48b1e196c3f78fcb8c482375` | yes |
| `$55E90..$55EC0` | Midas wrapped cell selection | `1cb01266e92686b05d748cffa121acbfe778809f32a8369e57fff37c4d3c1101` | yes |
| `$057DA..$057E2` | Initial override list | `c32e3679ebd194c1680ee81776f305393d4d0fb79869106d55a8ed1d9ff8ce74` | yes |
| `$53C2A..$53D32` | Resident selection and carried storage | `2037ba241533b898cfa218485b5e7a9ae6f4096b638bd5794cf64f3853971b34` | yes |
| `$55418..$55438` | Pickup residence writer | `8dfa2c67eb0278a571ab41695281bfe292290870460a34ed165a71ab194a52aa` | yes |
| `$5A09A..$5A0F0` | Object destination reader | `72ef14b8c14061039913782d23aa51f59d48039a0349e8445ca04d633e5d1008` | yes |
| `$560E2..$5617E` | Alias and floor binding | `ae753d27506792ca6d3e989d860450fa8c8d184121218f96bcee3853b2c569a2` | yes |
| `$56D1E..$56E5C` | Floor selection and arrival | `235e9a6230c6f143b9b7d749fa51ecabb40da29b9702a56d0678d6bb389b6bea` | yes |

The recovered facts support the complete initial resident and authored
surface-cell references. They do not admit additional routes into the currently
bounded playable Dion Data Payload. Subsequent moved-object residences and
scripted changes remain session state, independently of these initial tables.

## Reproduction

From the laboratory directory, `python3 -m m3lab.census_capture` performs a
fresh pinned cold boot, captures the opening residents and all 57 original
workspaces, then captures the separate MIDAS uniform workspace. It writes an
ignored run directory and a source/validation manifest. From the repository
root, regenerate the references with:

```sh
PYTHONPATH=research/mercenary-iii-st python3 research/mercenary-iii-st/scripts/write-location-docs.py --run <run directory>
```

A second fresh capture, `full-location-census-bzjd9ifm`, independently reproduced
the group counts, source ranges, labels and MIDAS's 256 bindings. Original
services can already be circulating at the captured opening; their exact
positions can vary between cold boots. These references retain the identified
`location-census-334983y7` capture's positions rather than treating them as
universal constants.
