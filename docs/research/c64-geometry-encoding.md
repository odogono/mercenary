# C64 geometry encoding and transform pipeline

Research for [Determine the C64 geometry encoding and transform pipeline](https://github.com/odogono/mercenary/issues/6).

## Answer

The Reference Build does not contain one mesh bank. It has three geometry systems which converge on the same 64-point camera-space work arrays and wireframe line renderer:

1. **Objects** use 64 instance slots and 55 unique explicit model records. Each model is a list of signed 8-bit local vertices followed by either packed or wide edge indices. Instances have 24-bit world positions and, for the first 16 slots, optional three-axis orientation.
2. **The surface** is a 16-by-16 world grid. Each cell selects one of 98 unique structure records through a 256-entry pointer table. Four additional 256-byte tables describe as many as two road/map segments per cell using nibble-packed grid points. Structure records contain edge lists and compact point coordinates, including a small rotated-point extension.
3. **The underground** has 192 room IDs backed by 174 unique, overlapping room records. Rooms are not stored as explicit meshes: a record selects and places primitive templates which the engine expands into vertices and edges at runtime. The same records also carry navigation/collision information, so raw room commands must remain in the World Geometry Dataset alongside derived geometry.

Vehicles and the high-altitude/orbital entities use the ordinary object system. There is no separate orbital geometry bank. The high-altitude instance in object slot `$3F` points at a 22-vertex, 23-edge wide-index model at `$3F8D`; its semantic identification as the orbital station is a strong inference from its position and scale, but should be confirmed against an observed orbital encounter before assigning that name in the dataset.

The safe extraction boundary is therefore the **initialized C64 RAM image**, not byte ranges copied directly from the PRG. The PRG is compressed and its startup code rearranges data into the final layout. A reproducible extractor should boot the hashed PRG, stop after initialization, dump RAM with the C64 ROMs banked out, and decode records by following the runtime pointer tables.

## Authoritative evidence and capture

The primary source was the supplied `roms/c64.ABC/MERCENARY.PRG`:

| Property | Value |
|---|---|
| Size | 49,203 bytes |
| SHA-256 | `ff725f37a7dc131396272d75625f7397aafecc15b158626c0a9165f2607808f3` |
| PRG load address | `$0801` (file bytes `$0000-$0001` are `01 08`) |
| BASIC entry | `SYS 2080`, i.e. `$0820` |
| Packer signature | `COMPACKER V2.0` in the BASIC line |

Two independent observations were made from this exact file:

- A 6502-only execution of the depacker reached `$A871` after 1,903,343 instructions. The startup at `$0820` copies the depacker from `$0832-$091A` (PRG file offsets `$0033-$011B`) to `$00FF-$01E7`, executes it from `$0100`, and ultimately transfers to `$A871`. This proves that final runtime addresses are not PRG file offsets.
- VICE 3.8 was launched in PAL C64 mode with direct PRG injection. After game initialization, the monitor stopped at `$A984` with processor port `$01 = $35` and dumped `$0000-$FFFF`. The 65,536-byte dump has SHA-256 `e96c9ac5d6c5bd013c8157f94f0b87683b9150cf569565f0cd02811ee8b30297`. The VICE `x64sc` binary used has SHA-256 `0ae4443a02f6d97c624a6b3b31f9216800a35fb33d462a158c60d292e9f5e26d`.

`$01 = $35` matters: it exposes RAM underneath BASIC and KERNAL ROM while retaining I/O. Surface records pointed to in `$C000-$FFFF` must be read from underlying RAM, not from a naïve C64 address-space read that returns ROM bytes.

For corroboration and routine naming only, the runtime bytes were compared with Ian McGowan's independent Mercenary disassembly at commit [`9571e68`](https://github.com/Ian-McG-1970/c64/tree/9571e68d80465d73d14afbcd81be6a70a2bf8eee). Representative sequences at the pointer tables and rendering routines matched their runtime addresses. That disassembly is not treated as Authoritative Evidence; all format claims below were checked against the supplied PRG's initialized memory and the renderer's reads of it.

## Initialized memory map

| Runtime addresses | Meaning |
|---|---|
| `$1700-$2098`, `$3B25-$3FFE` | Explicit object model records |
| `$2300-$23BF` | Low bytes of 192 underground room pointers |
| `$23C0-$247F` | High bytes of 192 underground room pointers |
| `$2480/$24C0/$2500` | Middle bytes of object X/Y/Z positions |
| `$2540/$2580/$25C0` | High bytes of object X/Y/Z positions |
| `$2600-$26FF` | Low bytes of 256 surface-structure pointers |
| `$2700-$27FF` | High bytes of 256 surface-structure pointers |
| `$2800-$283F` | Low bytes of 64 object-model pointers |
| `$2840-$287F` | High bytes of 64 object-model pointers |
| `$2880/$28C0/$2900` | Low bytes of object X/Y/Z positions |
| `$2940-$297F` | Object room/membership IDs |
| `$29C0-$29FF` | Object state, interaction, and display flags |
| `$2A00-$2AFF` | Altitude-to-surface-detail/radius lookup |
| `$2B00-$2BFF` | Per-cell structure/display flags |
| `$2C00/$2D00` | First surface road segment's packed endpoints |
| `$2E00/$2F00` | Second surface road segment's packed endpoints |
| `$3000-$3B16` | Overlapping underground room records |
| `$800A/$801A/$802A` | Orientation values for object slots `$00-$0F` |
| `$C000-$CDA4`, `$E01D-$FFB5` | Surface-structure records in RAM under ROM |

Several low-memory arrays are transient render state rather than source data: `$0100-$07FF` holds rotated coordinates, projected screen positions, classifications, expanded structure points, and expanded line endpoints. These should be useful for dynamic validation but should not be mistaken for the source geometry.

## Object models and instances

### Model record

For each object slot `i`, the model pointer is:

```text
pointer = RAM[$2800 + i] | (RAM[$2840 + i] << 8)
```

There are 64 pointer slots and 55 distinct pointed-to records. All 55 records parse cleanly and every edge index is within the record's vertex count.

A model record is:

```text
u8 highest_vertex_index               // vertex_count = value + 1
repeat vertex_count:
    i8 local_x
    i8 local_y
    i8 local_z
u8 edge_header
if edge_header.bit7 == 0:
    repeat ((edge_header & $7F) + 1):
        u8 packed_edge                 // start = high nibble, end = low nibble
else:
    repeat ((edge_header & $7F) + 1):
        u8 start
        u8 end
```

The wide form is used when a model needs vertex indices above 15. As a concrete check, the record at `$1700` has 18 vertices and 13 wide edges; the record at `$1752` has 13 vertices and 22 packed edges.

Local coordinate bytes are signed two's-complement values. The renderer first subtracts `$0800` from each instance-relative axis, then flips each byte's sign bit and shifts it four places. Those two operations combine to the exact local displacement:

```text
local_component = signed8(raw_byte) << 4
```

This follows from the four shifts at `$A6F1-$A725` together with the `$0800` subtraction at `$9788-$97AB`; interpreting either operation alone gives the wrong centre. `$00` is zero, `$7F` is `+2032`, `$80` is `-2048`, and `$FF` is `-16`.

### Instance record

Instances are stored structure-of-arrays. For slot `i`:

```text
x24 = RAM[$2880+i] | RAM[$2480+i]<<8 | RAM[$2540+i]<<16
y24 = RAM[$28C0+i] | RAM[$24C0+i]<<8 | RAM[$2580+i]<<16
z24 = RAM[$2900+i] | RAM[$2500+i]<<8 | RAM[$25C0+i]<<16
```

Interpret each result as signed two's-complement 24-bit when doing relative-position arithmetic. Position entries are mutable game state, so a dataset needs both the initial value and provenance for state-dependent changes.

Object slots below `$10` may additionally be rotated by values in `$800A+i`, `$801A+i`, and `$802A+i`. The model decoder applies three plane rotations in sequence before scaling the signed local bytes. The affected coordinate pairs show that these are rotations around the Z, X, and Y axes respectively. Other object slots are emitted without model-local rotation.

`$2940+i` associates an object with an underground room or the surface context. `$29C0+i` participates in visibility, pickup/vehicle state, and other behaviour. These bytes are not geometry, but omitting them would make instance placement and visibility impossible to reproduce.

### Vehicle and orbital geometry

Vehicle slots are ordinary object slots. Entering a vehicle copies its 24-bit position into the camera state and uses its three orientation bytes; leaving it copies the camera position back to the instance arrays. No vehicle-specific mesh format exists.

The high-altitude slots also use the same tables. In the observed initialized state, slot `$3F` had model pointer `$3F8D` and position `X=$087000`, `Y=$40FCC0`, `Z=$087000`. Its model is encoded in the wide form with 22 vertices and 23 edges. This supports treating orbital content as object instances, while preserving the semantic-name uncertainty until runtime comparison.

## Surface world and structure records

### Grid, structures, and road graph

The surface cell index is formed directly from the high position bytes:

```text
cell = ((camera_z_high & $0F) << 4) | (camera_x_high & $0F)
```

The map is therefore a 16-by-16 toroidal-looking address space at the data level; gameplay boundary logic separately rejects positions whose high nibbles are nonzero.

`$2600/$2700` map every cell to a surface-structure record. The 256 slots reference 98 distinct records. Repeated pointers are intentional instance reuse: placement comes from the selected cell and the record holds local geometry.

Road/map lines are separate from the detailed structures. For each table index,
`$2C00/$2D00` hold the first full segment's endpoints and `$2E00/$2F00` the
second. The index selects an entry; it does not confer geometry ownership on a
cell. A nonzero endpoint byte packs `Z` in its high nibble and `X` in its low
nibble. A packed point becomes world `(X, 0, Z)` with each horizontal component
`(nibble << 16) + $8000`, placing it at a grid-cell centre. The initialized data
contains 135 first-table and 136 second-table entries; normalized globally, the
271 entries describe 32 unique undirected lines.

The engine indexes `$2A00` with `clamp(floor(camera_y / 2048), 0, 255)` and uses
the resulting extent to select a square around the current lookup cell, clipped
to the 16-by-16 table. It deduplicates packed points and undirected segments and
suppresses endpoints belonging to the current detailed structure. Above the
first 64 KiB it handles the current lookup cell separately. Once the camera Y
high byte reaches `$20`, table selection is replaced by the fixed map encoded at
`$902A`. These are real level-of-detail rules and belong in the World Geometry
Dataset's visibility metadata, not merely in renderer code.

Cell `8:8` is the important ownership regression: its road-table entries are
empty. The parallel ground lines seen there come from surface structure
`surface-structure:cef6` (the airstrip), so they remain structure geometry when
map lines are disabled and disappear when structures are disabled.

Only the current cell's detailed surface structure is expanded. Neighbouring
cells contribute through the altitude-selected road workspace; drawing their
detailed structures produces geometry the Reference Build never places in the
same frame. That workspace assigns deduplicated road points from indices
`$3F` downward. 83 shared structure records deliberately join some of their
edges to those indices, so the 956 affected cell-edge instances are reported as
road-workspace links until camera-dependent workspace expansion is reproduced;
they are not malformed local indices.

The Mac presentation intentionally keeps the immediately surrounding ring of
surface structures visible as well. This is not a decoded C64 selection claim:
it prevents an entire building from popping into existence at a cell boundary.
Placed objects remain governed independently by their decoded detail cube.

An altitude-table value of zero is a no-roads sentinel. `L8EC2` returns before
scanning the road tables in that case; it does not select a square containing
only the current cell. The extracted table therefore hides road-table geometry
below Y=2048 and selects the surrounding square beginning at Y=2048.

### Surface-structure record

A record begins:

```text
u8 highest_point_index
u8 highest_line_index
u8 white_black_split_index
u8 rotated_point_descriptor
if rotated_point_descriptor != 0:
    u8 rotation_center_x
    u8 rotation_center_z
```

`highest_* + 1` gives the counts. Lines follow the header. Initially, each
nonzero line byte packs two four-bit point indices. A zero marker permanently
switches the remainder of that record to pairs of full-byte indices; the marker
is not repeated for each pair. The renderer walks the line list backwards and
changes line operation at `white_black_split_index`, reproducing the
characteristic two-colour/erase wireframe behaviour.

If `rotated_point_descriptor` is nonzero, its low nibble plus one is the number of leading rotated points. Four of the 98 unique records use this extension. Each such point consumes three bytes; X and Z are signed middle-byte offsets, Y is an unsigned middle-byte height, and the engine rotates the X/Z pair about the two-byte centre before joining it to the ordinary points.

The rotation update adds `(descriptor & $F0) >> 1` to a 16-bit phase once per PAL update. The sine routine treats the low byte as the position within a quadrant and the low two bits of the high byte as the quadrant, so `$0400` phase units make a full turn. For `surface-structure:cef6`, descriptor `$32` therefore means three leading rotated points and a 24-unit phase step. Its first six white edges join those points into the rotating inverted pyramid; the remaining eight black edges are the fixed airstrip outline.

Ordinary points use two bytes, `qx` and `qz`:

- `qx & $3F` and `qz & $3F` encode within-cell X and Z. Code 0 maps to middle byte `$00`, code 63 maps to `$FF`, and codes 1-62 map to `$61-$9E`.
- `((qx >> 6) << 2) | (qz >> 6)` is a four-bit height code.
- Height code 15 escapes to an additional byte, permitting extended height.
- The cell's X/Z nibbles provide the high position bytes, yielding 24-bit world points.

Some small records deliberately reference synthetic/shared point indices such as `$1F-$21` which are initialized outside the local record. An extractor must reproduce those initializer points before validating indices; rejecting every edge above `highest_point_index` would incorrectly reject valid records.

## Underground rooms

The two 192-byte pointer planes at `$2300` and `$23C0` address 192 room IDs. They resolve to 174 unique records in `$3000-$3B16`. Records overlap by design: several room pointers enter shared suffixes, so “bytes until the next pointer” is not a valid record-length rule.

A room starts with five header bytes. The first three carry bounded X/Y/Z dimensions (with flag bits in their high portions); the next two feed room presentation/state. Geometry commands begin at byte 5 and continue until opcode `$00` or `$80`:

```text
u8 opcode
u8 linked_room_or_behaviour
u8 x_middle
u8 z_middle
```

The observed 174 unique records contain 427 commands, from 1 to 8 commands per record. The opcode's low nibble selects a primitive from the template table at `$928A` via offsets at `$932B`. A positive opcode emits the template in its native X/Y plane; a negative opcode emits the corresponding rotated Z/Y placement. The two middle-coordinate operands place it in the room. `$00` ends an ordinary record and `$80` invokes the special empty/dynamic-room path.

The byte after the opcode is skipped by mesh expansion but read by navigation/collision code. Opcode sign and high bits also affect boundary orientation and door handling. Consequently the faithful representation is not just the expanded room wireframe: it is the raw command stream, the primitive/template identity, the linked-room/behaviour byte, placement operands, and the derived vertices/edges.

The room setup routine seeds a small standard boundary point/line set, expands each selected primitive into the shared point arrays, and constructs line-index ranges. That procedural expansion explains why underground geometry cannot be recovered correctly by looking only for triples of vertex bytes.

## Camera transform, culling, and rasterization

All three geometry families eventually populate the same point arrays and pass through this pipeline:

1. Subtract the 24-bit camera position from an instance or world point.
2. Convert the 24-bit difference to the engine's two-byte floating representation.
3. For object slots below `$10`, apply model-local orientation first.
4. Build camera sine/cosine values from roll, pitch, and yaw, then a 3-by-3 camera rotation matrix (`$A320-$A4B1`).
5. Transform points and project them into a 160-by-136 viewport centred at
   `(80, 68)` (`$50`, `$44`). The live FOCUS value at zero-page `$21` is `$18`:
   adding it to the floating exponent multiplies X/Z by 64. The Y path adds one
   further exponent step at `$A8E9` before the same perspective operation, so
   the reference-pixel projection is `x = 80 + 64 X/Z`,
   `y = 68 - 128 Y/Z` (before the original's integer approximation and clipping).
6. Store per-point classification bits and clip lines crossing the near plane or viewport borders.
7. Draw edges with one of eight octant-specific incremental line loops into alternating bitmap buffers.

Object detail culling is axis-aligned and deliberately coarse. The object path compares the absolute X, Y, and Z difference against `$010000`; when all three components are within that cube, it decodes and draws the wireframe. Farther objects are reduced to a projected point if other visibility rules allow. This point-versus-lines transition is part of the Reference Build's look.

Surface detail is selected by current cell and height, while road extent is selected through the altitude lookup. Underground draw lists are filtered by room membership. The line renderer performs clipping, but there is no mesh-face or hidden-surface format in these wireframe records: the source geometry is vertices plus explicitly ordered edges.

## Required extraction and validation contract

A reproducible World Geometry Dataset extractor should:

1. Verify the PRG's SHA-256 before starting.
2. Boot it in a deterministic PAL C64 environment and wait for the initialized runtime layout rather than treating packed PRG offsets as geometry offsets.
3. Capture all 64 KiB of RAM with ROM banked out, and record emulator version, emulator hash, processor port, stop PC/cycle, and dump hash.
4. Follow pointer tables; never infer records from adjacency because object models alias, surface structures are shared, and room records overlap.
5. Preserve both raw record bytes/runtime addresses and normalized derived data.
6. Represent 24-bit positions without truncation and retain mutable initial state separately from static model data.
7. Preserve road LOD rules, object point-LOD rules, room membership, structure colour split, and synthetic points as visibility/presentation provenance.
8. Validate all 55 object models programmatically, expand all 98 unique surface structures with their initializer points, and expand all 174 unique room records from the primitive library.
9. Render and compare at least: a surface cell with roads and a detailed structure; an underground room with a portal; a rotatable vehicle; and the slot `$3F` high-altitude encounter.

Each normalized vertex, edge, instance, or room command should carry at minimum: source PRG hash, runtime-dump hash, pointer-table slot, runtime address/span, raw bytes, decoder version, normalized interpretation, and an uncertainty field. For compressed data, a PRG file offset alone is neither possible nor sufficient; the depacker/capture trace is the provenance bridge.

## Remaining uncertainties

- The semantic names of all 64 object slots are not encoded beside the model pointers. Slot `$3F` should remain an “orbital-station candidate” until verified through an observed encounter or authoritative text/behaviour correlation.
- Several synthetic surface point indices are initialized by surrounding engine state. Their exact semantic names should be established while implementing the extractor, although their runtime coordinates can already be captured and validated.
- Room command byte 1 and opcode high bits combine geometry with portal/collision/game-state behaviour. Geometry expansion is resolved, but full behavioural naming belongs with the player-observable content catalogue.

These uncertainties do not block geometry extraction: the raw bytes, pointers, transforms, and expansion paths are identified. They do require provenance-preserving fields instead of premature semantic labels.
