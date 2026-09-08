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
| Heading       | `$79CD` | raw one-byte heading                             |

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
byte and compares the remaining selectors with current structure state. This
establishes that a nonzero second byte is interior-associated, but it does not
yet identify a named building or room. Association B byte 2 is a level selector
whose exact scale is unresolved. Byte 3 is the surface-cell byte. Association A
byte 1 selects a structure group; its other bytes control draw or interaction
state and are not safe place identifiers.

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
coordinates within a body. The body-local origin and named-place relationship
remain unresolved outside the independently mapped first-world Eris workspace.

## 99 CHEVY

Resident slot 2 names model `$035D98` as `99 CHEVY`. Its records are:

- X/Y/Z `$02077CBD/$00000000/$07017CAE`, or
  `(519.4872589111328, 0, 1793.4870300292969)` grid units;
- Association A `$FF072006`;
- Association B `$20000017`, selecting Gaea's surface and cell `$17`;
- heading `$00`.

The browser therefore plots 99 CHEVY on Gaea without inventing a named place.
Its key in slot 180 remains interior-associated on Eris: Association B
`$2C030126` identifies body, structure-group, level and cell selectors, but no
decoded structure list yet binds those selectors to a named building or room.

## Deferred records

The remaining 195 ordinary-body records have a nonzero Association B byte 1 and
remain unplotted interior-associated residents. Twenty-three records with body
byte `$00`, two VOID staging records with `$78`, and special slot 74 with `$FF`
also remain spatially unresolved. They stay in the searchable census. Decoding
the per-structure association lists is required before any can acquire an
interior, named place, or map position.
