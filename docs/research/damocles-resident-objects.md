# Damocles resident object associations

Working-Authority Evidence for the Damocles Catalogue. This note records the
bounded interpretation used to place resident objects on per-body maps. It does
not assign unknown interiors, settlements, or named places.

## Evidence set

The coordinate and association arrays occupy one four-byte record per slot; the
heading array occupies one byte per slot:

| Array         | Address | Current interpretation                           |
| ------------- | ------: | ------------------------------------------------ |
| X             | `$63A8` | signed 16.16 surface-grid coordinate             |
| Y             | `$67A8` | signed 16.16 coordinate                          |
| Z             | `$6BA8` | signed 16.16 surface-grid coordinate             |
| Association A | `$6FA8` | draw, structure-group and interaction state      |
| Association B | `$73A8` | body, surface/interior, level and cell selectors |
| Heading       | `$79CD` | one-byte heading, 256/turn, `$00` = north        |

The arrays in the pinned first-world, fresh on-foot, and captured interior runs
are byte-identical over `$63A8..$77A7`, with SHA-256
`9e71dcdc45aba40a7d6db0068f7e5e9076dff7226e31406eb4dffcc0474eae4c`.
The boarded-limo run changes only resident slots 5 and 183, as documented in
[the V.I.P. limo findings](damocles-vip-limo.md).

The native selector at `$52C9C..$52CD2` shifts current body selector `$7AA8`
left eight bits and compares it with the high word of each Association B
record. Its high byte is therefore four times the body-table index, and its
second byte must be zero for a surface resident. Examples include `$2C00` for
Eris (body 11) and `$2000` for Gaea (body 8).

The structure association builder at `$52CDC..$52D40` excludes a zero second
byte and compares the remaining selectors with current structure state. The
selector roles and authored list grammar are now decoded below. A nonzero
second byte is interior-associated, but none of these numeric selectors is by
itself a building, Room, floor, or named-place identity.

## Structure association lists

`$52CDC` first calls `$52D42`, which applies transient resident changes, then
scans resident slots 255 down to 1. For each resident, the builder requires all
of the following byte comparisons:

| Resident field                        | Runtime selector           | Meaning established by the consumer |
| ------------------------------------- | -------------------------- | ----------------------------------- |
| Association B byte 3 (`$73AB+4*slot`) | `$7B5C`                    | surface cell                        |
| Association A byte 1 (`$6FA9+4*slot`) | `$794E`                    | structure-group selector            |
| Association B byte 2 (`$73AA+4*slot`) | `$7AA4`                    | level selector                      |
| Association B byte 1 (`$73A9+4*slot`) | record selector in `$7B0E` | insertion-group selector            |

The names above describe selector roles only. In particular, `$7AA4=$01` is
not evidence for a named or ordinal floor, and an insertion-group or region
selector is not a Room number.

`$7B0E` is not one global table. `$5A25E..$5A2F6` parses the selected
structure's region descriptors; a zero flags word ends that sequence, and
`$5A2FA..$5A2FE` stores the immediately following address in `$7B0E`. The
authored association-list grammar at that address is:

```text
root       := group* 00
group      := insertion-group-selector pair* 00
pair       := nonzero-region-selector insertion-key
```

Both selectors and the insertion key are bytes. The group terminator is a
**zero region selector**, not an arbitrary zero byte: insertion key `$00` is
valid. `$52D14..$52D22` skips nonmatching groups as pairs and stops the root on
a zero group selector. For a matching group, `$52D24..$52D34` writes the
resident slot, its insertion-group selector and a zero sentinel to `$AFDC`,
then copies the authored pairs through their zero-region terminator. `$52D3C`
writes two final zero bytes after the last resident. This also fixes ordering:
matching residents occur in descending slot order.

The queue assembler at `$5A3DE..$5A432` reads `$AFDC`, selects every pair whose
region selector equals `$7AFC`, and inserts the tagged resident value before
the matching byte in that region's authored plan queue. An insertion key of
zero therefore inserts the resident immediately before the queue's terminating
zero; it does not terminate the association group when read from the source.
The renderer later distinguishes tagged residents from plan records at
`$5A7D6..$5A80E`.

The already observed Spaceport instance is a compact check on the grammar.
Its root is `$14AAC`; insertion group `$0C` includes pair `$01,$18`, so resident
slot 183 is inserted before plan key `$18` while region 1 is selected. The
captured `$FFFF00B7` at `$875A` records that result, as detailed in
[the Capital Spaceport note](damocles-spaceport-interior.md).

## Surface census

Of 229 records associated with ordinary landable bodies, 34 have the exact
surface form: a nonzero body selector divisible by four and a zero second byte.
The catalogue emits coordinates and raw headings only for those records.

| Body    | Resident slots and source names                                                                                 |
| ------- | --------------------------------------------------------------------------------------------------------------- |
| Icarus  | 164 BLACK BEACON                                                                                                |
| Acheron | 165 BLACK BEACON                                                                                                |
| Dion    | 6 TARG TOURER                                                                                                   |
| Atropos | 166 BLACK BEACON                                                                                                |
| Gaea    | 2 99 CHEVY; 13 22 CV; 83 EXPLOSIVE; 156 Object 156; 175 BLUE BEACON                                             |
| Cronus  | 112 MUSEUM GUIDE; 168 BLACK BEACON                                                                              |
| Eris    | 1 DART II; 3 EAGLE NINE S E; 4 BESTCUPAND CRAFT; 5 V.I.P. LIMO; 7 INTERSTELLARSHIP; 92 SUNSHADE; 178 RED BEACON |
| Solon   | 173 BLUE BEACON                                                                                                 |
| Theon   | 174 BLUE BEACON                                                                                                 |
| Vesta   | 54 RED BEACON LOCTR                                                                                             |
| Metis   | 171 BLACK BEACON                                                                                                |
| Lucan   | 49 READING GLASSES; 179 RED BEACON                                                                              |
| Logos   | 167 BLACK BEACON                                                                                                |
| Pan     | 177 RED BEACON                                                                                                  |
| Thalia  | 12 BULLET; 176 RED BEACON                                                                                       |
| Bacchus | 10 CONCORD III; 72 TRANSPORTER a; 169 BLACK BEACON                                                              |
| Tolosa  | 172 BLUE BEACON                                                                                                 |
| Mentor  | 73 TRANSPORTER a; 170 BLACK BEACON                                                                              |

The per-body coordinate phases are internally coherent: for all 229 ordinary
body associations, the difference between Association B's cell nibbles and the
integer X/Z grid nibbles is constant per body. This supports comparing raw
coordinates within a body. Eris uses the live first-world `$ABDC` workspace and
`$7A6C` place list. Gaea Birmingham Island uses the authored placement stream
and place list in the same first-world pool, bound to 99 CHEVY's resident phase;
it is not a live Gaea `$ABDC` capture. Gaea UR City uses a live `$ABDC`
workspace from a Hatari memstate (body selector `$7AA8=$0020`, cell `$24`)
with `gaea-ur-city-surface-*` identities so Birmingham IDs stay stable.
Vesta Politburo City uses a live
`$ABDC` workspace from a Hatari memstate (body selector `$7AA8=$0038`). Dion
uses a live `$ABDC` workspace (`$7AA8=$0010`, cell `$32`) without borrowing
Gaea Birmingham place names. Other bodies still have no recovered
surface-assembly map.

## 99 CHEVY

Resident slot 2 names model `$035D98` as `99 CHEVY`. Its records are:

- X/Y/Z `$02077CBD/$00000000/$07017CAE`, or
  `(519.4872589111328, 0, 1793.4870300292969)` grid units;
- Association A `$FF072006`;
- Association B `$20000017`, selecting Gaea's surface and cell `$17`;
- heading `$00`.

The browser therefore plots 99 CHEVY on Gaea without inventing a named place.
Cell `$17` has no structure in the authored Birmingham Island map; neighbouring
cells `$26`, `$27` and `$28` do. Those assemblies share Chevy's 16×16 origin
`(512, 1792)` derived from the resident 16.16 coordinates. Source place names
on that island (ELMDON SPACEPORT, LAWSON BANK, GAEA BANK, and the other four
area-list labels) attach only to their listed cells.

The other four first-world Gaea residents occupy different coordinate phases
and are not Birmingham Island placements.

Its key in slot 180 remains interior-associated on Eris: Association B
`$2C030126` identifies body, insertion-group, level and cell selectors. The
source relationship and local placement are now decoded below, although the
parent structure has no recovered source name.

## KEY - 99 CHEVY

Resident slot 180 selects source model `$03E446`, named `KEY - 99 CHEVY`. Its
records are X `$0C067A98`, Y `$000000C8`, Z `$02027890`, Association A
`$00140404`, Association B `$2C030126`, and raw yaw `$00`. Thus it selects Eris
(body `$2C / 4 = 11`), structure group `$14`, insertion group `$03`, level
`$01`, and cell `$26`.

The static structure-group table supplies the missing parent link. `$1E64C`
contains `$59F8`, making `$239F8` the group-offset root; entry `$14` there is
`$1732`, selecting the authored group record at `$2512A`. The map decoder at
`$4EB60..$4ED14` expands that record. Its cell override at
`$251D7..$251DC` is:

```text
60 26 91 00 DF 83
```

Under the consumer at `$4ECCA..$4ED12`, `$60` is the source-reference selector,
`$26` the cell, `$0091` the structure-table value, and `$DF/$83` signed X/Z
offsets -33/-125. The low nine bits of `$0091` select structure slot 145,
catalogue model `structure-01d188`. This is a reusable-model relationship plus
an authored structure instance at Eris group `$14`, cell `$26`; it is not a
name for the structure.

Slot 145 is an authored alias record at `$1D188`. Its header selects scale 3/2,
palette 44, Building detail slot 58 (`interior-02ce86`), and base structure slot
60 (`structure-012f84`). The native alias path at `$54D82..$54E1C` retains the
instance-specific scale, palette and detail while selecting slot 60's plan.
Consequently the valid identities are the slot-145 surface instance and its
alias model, with slot 60 as the base geometry and detail 58 as its linked
component; collapsing the instance to slot 60 would discard authored identity.

For this assembly, `$5A2FA` resolves the association-list root to `$13218`.
The complete list through its outer terminator is:

```text
03 04 00 05 07 06 07 07 07 08 17 00
04 01 08 02 08 03 00 05 00 06 17 07 17 08 18 00
05 01 08 02 08 03 05 04 00 06 17 07 17 08 18 00
00
```

The bytes `$13218..$13244` have SHA-256
`0b3b3c8403cc100d258afc3d9cb4cc64c519447428bba8cd832a29782aa6b2fb`
in the pinned first-world RAM. Insertion group `$03`, selected by slot 180,
therefore maps region selectors 4→`$00`, 5→`$07`, 6→`$07`, 7→`$07`, and
8→`$17`. These are region selectors and render-queue insertion keys, not five
Rooms.

The world-to-structure transform is the same one established independently for
the Spaceport. `$54D48..$54D6C` sign-extends the cell record's offsets,
multiplies by 30 (the constant at `$4BD14`), and adds `$8000` within the
65,536-unit cell. `$54D2C..$54D3C` preserves the current world coordinate's
high word and replaces its low word with those cell-origin values. Cell `$26`
therefore gives origin lows X `$7C22` and Z `$715A`. Combining those with the
resident's evidenced group-local cell page and subtracting from its X/Y/Z
record yields the slot-145-local placement
**(-394, 200, 1846)**. It lies within the recovered slot-145 assembly bounds;
the catalogue's Z reflection remains a presentation transform and must not be
baked into this placement. Raw yaw `$00` is retained without inventing an
absolute angular convention.

No source name or named-place record has been recovered for this structure.
The correct attachment is therefore “Eris, structure group `$14`, cell `$26`,
structure slot 145, level selector `$01`,” not a speculative building, floor,
or place name.

## Deferred records

The other ordinary-body records with a nonzero Association B byte 1 remain
interior-associated. They require the same structure-group map and selected
structure-root traversal before acquiring a parent or local placement; a raw
selector match alone is insufficient. Twenty-three records with body byte
`$00`, two VOID staging records with `$78`, and special slot 74 with `$FF` also
remain spatially unresolved. They stay in the searchable census. No unresolved
selector is promoted to an interior, named place, or floor.
