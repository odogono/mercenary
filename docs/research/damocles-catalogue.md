# Damocles Catalogue extraction

Working-Authority Evidence, implementing ADR 0039. The catalogue is a read-only
inspection surface at `/catalogue`; it neither starts a Gameplay Session nor
loads Targ's world payload. Exact geometry remains private extracted material.

## Reproduce

From the repository root:

```sh
PYTHONPATH=research/damocles-st python3 -m damocleslab.catalogue \
  --run research/damocles-st/work/observe-first-world-20260818T101013Z-c5a32b7d \
  --workspace research/damocles-st/snapshots/vesta-parliament-4-6.sav \
  --workspace research/damocles-st/snapshots/gaea-ur-city-4-2.sav \
  --workspace research/damocles-st/snapshots/dion-2-3.sav \
  --workspace research/damocles-st/snapshots/damocles.icarus.sav \
  --workspace research/damocles-st/snapshots/damocles.acheron.sav \
  --workspace research/damocles-st/snapshots/damocles.atropos.sav \
  --workspace research/damocles-st/snapshots/damocles.clotho.sav \
  --workspace research/damocles-st/snapshots/damocles.gaea.transporter.sav \
  --workspace research/damocles-st/snapshots/damocles.cronus.sav \
  --workspace research/damocles-st/snapshots/damocles.cyclopes.sav \
  --workspace research/damocles-st/snapshots/damocles.solon.sav \
  --workspace research/damocles-st/snapshots/damocles.theon.sav \
  --workspace research/damocles-st/snapshots/damocles.metis.transporter.sav \
  --workspace research/damocles-st/snapshots/damocles.lucan.sav \
  --workspace research/damocles-st/snapshots/damocles.logos.transporter.sav \
  --workspace research/damocles-st/snapshots/damocles.pan.sav \
  --workspace research/damocles-st/snapshots/damocles.thalia.sav \
  --workspace research/damocles-st/snapshots/damocles.bacchus.transporter.sav \
  --workspace research/damocles-st/snapshots/damocles.tolosa.sav \
  --workspace research/damocles-st/snapshots/damocles.perseus.sav \
  --workspace research/damocles-st/snapshots/damocles.mentor.transporter.sav \
  --output payload/damocles/catalogue.json
cd web
bun run dev
```

`--output` names the shared document. The extractor writes each Model beside it
as `payload/damocles/models/<id>.json` and removes any Model file this run no
longer produces, so a regenerated Model reads as its own file in the diff
([ADR 0048](../adr/0048-store-each-damocles-model-as-its-own-catalogue-file.md)).
The shared document keeps everything else, plus a model index and each Body's
list of the Models it can draw.

The twenty-one `--workspace` inputs are the arrival-pose memstates
(#326). Each contributes one live `$00ABDC` window; twenty bodies are covered,
Gaea by two. The decoder carries no body identity, so adding a body is an input
rather than a code change. Two further poses, `midas` and `damocles`, are
deliberately **not** passed: their camera pair disagrees with the origin their
own cell word implies, so the extractor refuses them rather than placing cells
against a fabricated origin. See
[live surface workspaces beyond Eris](damocles-non-eris-workspaces.md).

Open `http://127.0.0.1:5173/catalogue`, or follow **Damocles catalogue** from the
game menu. `?model=object-035d12` opens DART II;
`?instance=eris-surface-87` opens the Capital Spaceport placement;
`?instance=vesta-surface-64` opens Vesta Parliament;
`?instance=gaea-ur-city-surface-24` opens the live UR City cell 4,2 overlay;
`?instance=dion-surface-32` opens the live Dion cell 2,3 overlay;
`?instance=object-slot-5` opens the V.I.P. LIMO outside the Spaceport.

For body-aware interaction (#345), each resident instance carries `placementClass`, Association A byte 3 (`$6FAB + 4*slot`). It is mutable placement state rather than identity — a Drop rewrites it — so this is the authored value a session departs from. It is not the handling byte's low nibble; the two disagree for 176 of the 241 residents. See [placement class](damocles-placement-class.md).

Each Building detail Model carries `extent`: the header and X and Z word pairs its record holds below its entry, in raw units, or `null` where it holds none (Building detail 1 alone). The cell bind scales them by the structure's scale and translates them by the instance's intra-cell origin into the rectangle at `[$7910]`, and a direct Drop writes the player's 3×3 zone against it as the placement class (#356). The structure selection's `detailModel` names the detail a structure binds. See [placement class](damocles-placement-class.md#where-the-rectangle-comes-from).

Each surface-cell placement carries `keyBase`, the `$7AFB` door-key base its `$ABDC` entry byte installs (`$054CBE`), or null where it installs none. An `$F0` Entrance Attachment in that cell's structure is keyed to object slot `keyBase + keyIndex` and opens only while that slot is in the Carried Stack (#362). The base belongs to the cell, so one structure record is keyed where it stands on Dion and free where it stands on Eris. See [generic entrance attachments](damocles-generic-entrance-attachments.md#the-live-condition-predicate-is-the-carried-stack--confirmed).

A structure selection whose post-plan list carries a wall text reaching the Floor Label (`$CD04`, tokens `$80`/`$81`) carries `floorLabels`: the queue entry the text rides on, the builder's anchor, plane, font, glyph scales and colour at the record's own scale. The document's `floorLabelGlyphs` holds `G`, `1`–`9` and `B` in each font those labels use, so a session draws the label for its current Floor (#473). A font-4 label also carries a `fallback`: it draws in font 3 while slot 49 or 91 is carried. Literal wall text is published as `wallTexts`: the queue entry, the text, font and plane, and glyphs baked at the builder's placement, with a font-3 fallback mesh for font 4. Wall text that prints a live token (a door key letter, or the Trading Post readout) is named in the model reason and not drawn. See [Floor Label](damocles-floor-label.md) and [structure wall text](damocles-structure-wall-text.md) (#485).

The `islands` collection is the whole Gamma System's landmasses: all 62 ten-byte
records of the per-body lists the table at `$04BD1E` roots, one entry a record,
keyed `island-<body-slug>-<recordAddress>` because a record carries no name of its
own. Each names an `origin` in Body Coordinates (the record's `+0`/`+2`, with
`sourceOrigin` keeping the authored words, which Lucan's ring stores negative), a
`coastline` of signed Island-Local vertex pairs together with the edge words
`$0561CE` scans — the edge words carry the swap and axis bits vertex order does not
give — the backwards `boxes` the classifier tests, tagged `extent`, `core` and
`exclusion` in the order `$0560F2` reads them, a `landColour`, the `structureGroup`
at `+6`, the `workspace` group record that group selects, and `areaName`, which is
that group's area name rather than the island's own. `workspace` and `areaName` are
both null where the record names group `$00`, the shared empty record, and 21
records share one coastline-less stub whose extent and core boxes are the whole
coordinate plane: on those bodies the classifier answers `core` everywhere, which is
recovered behaviour rather than an absence. `extent` restates box 0 in Body
Coordinates, where an upper bound below its lower bound is a wrapped span and not an
empty one — Eris's Snow Island and four of Lucan's twelve cross the seam. The VOID
slot's table entry is excluded: VOID is the space-as-place sentinel, not a Body
surface. See [the Eris islands note](damocles-eris-islands.md) and
[the island census](damocles-island-census.md).

The `roadNetworks` collection is one entry an **island record that binds a structure
group**, captured or not: the group's `origin` and `island`, its six road-piece
selectors, every cell the `$04EC30` classifier put on a run — with its `piece`,
`rotation`, `sourceClass`, the `recordAddress` the class selected and the `model` the
cell actually draws when a placement replaced it — and the authored runs deduplicated
as the network's lines. The runs are one-cell-wide roads, not a landmass: an island's
coastline is its own polygon.

All **42** binding records are published and 39 carry a run, across 23 bodies. The
run grid is not capture state a memstate has to supply: `$04EB60`–`$04EC2C` builds it
from a run-length extent stream in the group's own authored record, so #447 expands
it for every group. `attestation` says which of the two a network is — `capture`
where a memstate stood in the workspace and the replay reproduced its live `$0083DC`,
`image` where the grid came from the authored stream. An image-derived cell carries
its Drawn Record too (#460): `load_structure_workspace` replays the whole loader,
`$04EB60`–`$04ED12`, including the placement replacement at `$04ECEE`, so its `model`
is the record the cell draws — oriented, scene-joined and palette-bound as the loader
would leave it — and `overridden` is answered, not null. That adds 475 ground Models;
the replay draws every captured road cell exactly as its live workspace does, and the
extractor raises if it ever does not. A network with no run is a recovered "this
Settlement has no roads", which is SOLON BASE, GAEA `$0E` and THE MIDAS PROJECT.
`coverage.roads` counts them.
`coverage.classifications.roadTemplate` is a different thing and is not that count:
it is how many models still carry the `$7000` road-template omission, and it is 0.
See [the Eris ground note](damocles-eris-ground.md).

Each body carries `bodySurface`: its `baseColour`, the low word of `$0060C0 + 4*body`
masked to twelve bits at `$0592AC`, which is what the surface is drawn in wherever no
island is painted over it; and the extent `$058F64` masks positions onto, 4096 × 4096
Surface Cells wrapping on both axes. It is stated rather than implied so that a
consumer cannot treat a Body surface as a bounded plane. VOID's is null.

Every surface placement's `coordinateSystem` is `Body Coordinates`, and each names
the `island` whose origin the Structure Workspace it sits in was built at — the
origin `$056464` publishes into `$789A`/`$789E` before the workspace loader runs.
Resident coordinates come from the resident arrays, are already Body Coordinates,
and name no record, so their `island` is null. `Damocles Place` gains no island
field: a place is a cell in a workspace and the workspace is bound by a record, so
deriving one from the other would bake in a one-to-one relation Lucan's twelve and
Lachesis's ten disprove.

Four model fields retain recovered native facts.
`storeyHeight` is the alias record's first word masked by `$7FFF`, as written to
`$7B00` at `$054D86`; non-alias models do not claim a pitch. `levelBinding` is the
floor table that follows it at `+6`, which `$054DBC` publishes in `$7C1E` and the lift
indexes by the destination level before assembling that structure: one structure slot
per level, 0 to 11, where zero means the level has no floor. A record has a floor
table exactly when it has a pitch, both coming from bit 15 of the same word, and
`levelsAuthored` records how many of the twelve bytes lie inside the record's own
extent so the two short authored records claim nothing past themselves. Each floor
also carries the `paletteIndex` it is drawn in, which is the alias record's (record+4,
or record+18+level where that byte is zero), and `levelBinding.palettes` resolves each
named palette for the entries the bound structures' `$80xx` words name. See
[the level-to-structure binding](damocles-level-structure-binding.md). Every `$80xx`
colour the Catalogue resolves is the palette's base half, which the terminator binds by
night. Where the palette's day half, the base plus the signed word before it, gives a
different colour, a `dayColour` sits beside it, and a Floor palette carries `dayColours`
for the same entries. Each Body surface also publishes its `sky` pair and `rotationRate`
([the day/night terminator](damocles-day-night-terminator.md)). `supportTop` is the
drop handler's raw-Y maximum at `$0545DE`–`$054610`, or `null` when its model-form
gate refuses. It is not the renderer's mesh maximum: text and articulated forms
must not change it. The signed opening-word comparison admits ordinary vertex
streams; header commands are restricted to low bytes 6, 9 and `$0A`. The maximum
starts at zero. `instanceOrientation` is the record's `$8001` command: the angle bias
`$053548` adds to a placed instance's own angle byte, and the mode byte
`$0536F6` branches on to choose between no turn, one turn about +Y, the
articulation path and the camera-relative path. A record without `$8001` has no
field and is drawn as modelled. See
[the V.I.P. limo findings](damocles-vip-limo.md#the-drawn-instance-angle).
All four fields are extracted from the same attested RAM as the model,
not inferred from resident placement or presentation geometry.

The extractor first verifies the run's artifact hashes, program/TOS pins, and
first-world scenario hash. It uses the standard library only. A missing capture
can be regenerated with the existing `lab observe --scenario
research/damocles-st/scenarios/first-world.json` command. Raw images, RAM and
Working Disassembly stay in ignored research paths; the browser receives only
the separately versioned catalogue JSON. Schema version 15 reads a resident's
angle from `$77A8 + 4*slot` rather than `$79CD + slot` and adds each object
model's `instanceOrientation`. Schema version 11 carries each pointer bank's measured extent as
`tables[].extent` and names the slots a world binds rather than the resident
table, as `models[].worldConditionedSlots`. Schema version 10 turns a placed
articulated building detail in its placing structure's scaled frame and names
that frame on the mesh: `articulation.scale` and `articulation.sampledAngle`.
Schema version 8 makes detail selector lists name source records rather than
drawn polygons, and adds each detail mesh's `recordCount`. Schema version 5 adds the per-cell
ground/pad/road table. Schema version 3 included per-face source indices,
structured evidence, nested instance placements, and source key display metadata.

## Source and census

Source runs:

- `observe-first-world-20260818T101013Z-c5a32b7d`
- `observe-first-world-20260818T101117Z-010b9ad3`

Both are independently captured cold first-world loads. Extracting both gives
identical models, tables, instances, body names and places. Their provenance
records intentionally differ. The emitted source record pins the RAM and
program SHA-256; model identities depend on kind and source address, never names.

Schema 10 adds the structure-scaled articulation frame. Each placed articulated
building detail gains one `palette-<index>-scale-<x>x<z>-angle-<aa>` form per
placing frame per sampled `$7888` angle, and each placing surface assembly gains
`assembly-angle-<aa>` forms beside its neutral `assembly`. The mesh's
`articulation` record carries `scale` and `sampledAngle` for the form it belongs
to; a neutral model-local form has neither. The five details this covers no
longer carry the `articulated` omission.

Schema 9 adds `keyIndex` to an Entrance Attachment whose control carries the
`$F0` low byte: the key index the cell's `$7AFB` base offsets into a door key
letter. See
[generic entrance attachments](damocles-generic-entrance-attachments.md). The
geometry is unaffected, so these 13 structures no longer keep an attachment
omission.

Schema 7 extends `structureSelection` with generic Entrance Attachment records:
raw control word, normalized constructor, runtime slot, closed mesh and scaled
Proximity Box. A closed mesh rises to the soffit spanning its rectangle, since
the constructors leave leaf Y words to the opening the leaves fill; openings
without a soffit fall back to the structure's lower wall band. Regions name their gate kind and resolved inset axis; `$0200`
remains an unconditional passage with no fictitious attachment. Each selector also carries
its original plan mesh, scaled region bounds (signed-word endpoint sentinels stay at
−32768/32767), raw flags, tagged ordered queue, and linked detail model/variant and X/Z
scales. Detail selectors retain two groups of ordered boxes and default **record**
indices in raw model coordinates. Unsupported or truncated selectors are omitted as a whole and explained
in the model reason. The census retains every selector the documented post-plan grammar
accepts (256 in the current first-world extract, including Structure 75 and its Structure 76
alias, and `$xxF0` constructor variants such as `$40F0`/`$42F0`/`$82F0`) and 59 detail
selectors, which is every detail whose geometry decodes. The first detail group starts
on the next word boundary after the byte-sized record stream. Empty plan meshes are valid
when all queues are empty. The spaceport's combined inspection variants also carry
`walkMesh`, excluding the resident key from the authored walk fallback.

Eris document schema 2 uses `structureFallback` only when a selector is absent or no
region matches. The on-foot frame uses group 2 and region flags 15/14/12 for detail
visibility and component order, with per-face triangulation cached across selected lists.
This does not implement the surrounding resident-object stream or the polygon fill
routine's possible facing tests.

`$053BF2` builds a detail's first group into `$C13C` and its second into
`$C2FE`. `$053CC2` picks the second when the player is on foot inside a
structure — `$7A8E` is 1, `$7AF6` and `$7B02` are clear and `$7B34` is negative
— and the first otherwise. `$0539DC` walks the chosen group's boxes in order,
takes the first that contains the player, and otherwise falls back to the list
stored after the box terminator.

The catalogue viewer now offers **each recovered region as its own inspection
form** beside a structure's other views: 3,885 forms across the 256 structures
that retain a selector. A form draws the region's queue in source order (plan
walls, Entrance Attachments and the faces an attachment contributes) and adds
the linked detail when region flag 15 is set, ordered by flags 14 and 12. Free
orbit has no player position, so the detail uses group 2's default record list,
the list the game draws when no detail box contains the player. The reviewed
Capital Spaceport is the cross-check: region 1's queue reproduces the
hand-tuned interior layout's face order exactly, and additionally places the
authored entrance-door attachment where the source puts it, between plan faces
19 and 20.

Building details are offered the same way: **every authored box list and group
default is its own inspection form**, 416 forms across the 59 details that
retain a selector. Free orbit has no player position and no structure scale, so
naming one list would be a guess; listing them all is not. 61 of the 477
authored lists name no record at all — inside those boxes the game draws none of
the detail — and those are left out rather than offered as an empty view. Box
bounds are stated in raw model coordinates, which a placement scales by its
structure X and Z factors. A detail's palette variants share a record count, so
the forms are drawn from the first palette listed.

Each pointer-table extent is now **measured from the capture at both ends**
rather than assumed, and emitted as `tables[].extent`. The entry count is bounded
above because one further entry would overlap authored record data: a zero
longword and the `      NULL      ` name field at `$035CE8`, the first surface
record's eight metadata bytes at `$00ED60`, and the `$8000` vertex-terminator
preamble at `$026208`. It is bounded below because every entry resolves to a
record the extractor decodes or explains. Each bank's last record is followed by
hundreds of zero bytes and then by an independently recognised item — the live
projection workspace at `$042C00`, the `$01E000` ground workspace seed table and
the `$031700` glyph source table — and the extractor raises if a bank ever
reaches its follower. The ground table keeps its own qualification: it is a
256-word workspace index, not a relative-pointer bank, and it is one body's
workspace. Bounding the banks is still not a census of every packed disk file.

Title-screen RAM has zero table bases. Across **ten pinned captures** — two
independent cold first-world loads, Eris on foot and boarded, the occupied
Spaceport interior, and the live Vesta, Gaea UR City and Dion workspaces — the
surface-assembly table and bank, the building-detail table and bank, the ground
record bank and the glyph table are byte identical, all 212 unique object records
decode identically, and no world introduces a record address the first-world
table does not already name. Entering a building, boarding a vehicle and
travelling between bodies do not disk-load a replacement model bank.

The one bank that is not wholly resident is the object pointer table. `$055026`
consumes the world's resident-object stream, writing the 16.16 X/Y/Z arrays at
`$63A8`/`$67A8`/`$6BA8` and then copying one table entry onto the entry's own
slot at `$05503C`, filling slots downwards from `$3FC`. Slots **248–255** are the
block this rewrites; slots 250–255 land on a different model between Eris, Vesta
and Gaea. A world therefore binds an existing model to a slot and never writes a
record. Those models carry the qualification in their reason, and the extractor
raises if a capture repoints a slot below the block or at an address the table
does not already hold.

The Working Authority Pasti STX is an RSY version-3 image (1031930 bytes, SHA-256
`8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef`) of 164 track
records: cylinders 0–79 formatted on both sides, 80–81 unformatted. Only two
tracks carry sector descriptors — cylinder 0 side 0's ten standard sectors with
an executable boot sector, and cylinder 1 side 0's copy-protection track. The
other 158 formatted tracks are raw track images the game reads with its own
loader. No resident table or bank appears verbatim anywhere in that payload, so
the payload is packed and **the protected sectors are not a second, directly
readable model bank**. Printable resident labels such as `DART II` are absent
from the STX and from title-screen RAM; they appear only after the
title-to-world unpack that fills the `$04BD00` base block (`$04BD0C=$00E900`,
`$04BD10=$035700`, `$04BD22=$026000`). See
[disk loads and bank extents](damocles-disk-loads-and-bank-extents.md). The UI
displays each table's qualification. Every slot maps to one model identity;
repeated pointers share a model and retain all slot indices. No pointer scan is
represented as a model census.

Current extraction accounts for **1765 unique records**: **1435 decoded**,
**330 partial**, and **0 unresolved**. “Decoded” means the supported record was
parsed completely; it does not mean every model has received a human fidelity
review. Partial records expose recovered geometry and explain omitted features.
Unresolved records remain searchable and retain their source identity and reason.

A record that parses cleanly to its own terminator and holds no geometry by
construction is authored that way, not a decode failure, so it is **decoded**
with `recordClass` `empty` or `null` whichever bank it came from. An empty
ground record already read that way; the equivalent surface, building-detail
and NULL records read as unresolved, which gave one question three answers. A
record only keeps that settlement while every clause of its reason stays a
settled statement, so anything that appends a real gap drops out. The eight
records this covers are the NULL object, five empty surface records (one of
them an alias of another, now classed `empty` rather than `alias` since
`relatedModels` already carries the alias link) and two empty building
details.
NULL is explicitly accounted for as an empty record (`object-035cfc`, 36 slots),
not a fabricated mesh. Alias, empty, NULL, procedural, view-conditioned, articulated, special
polygon, palette-binding, live-text and attachment omissions are counted separately in
`coverage.classifications`, together with the number of records whose forms the
game selects by viewer position or state (`conditionalForms`). Duplicate pointers share one Damocles Model; scaled
structure aliases keep their own address identity and `recordClass` `alias`.

The coverage ledger in `payload/damocles/catalogue.json` is generated by the
extractor. A unit test fails if this note's unique/decoded/partial/unresolved
totals disagree with that ledger.

| Resident table      | Address   | Slots examined | Meaning                                                                                                                                 |
| ------------------- | --------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Object geometry     | `$035700` | 378            | Relative 32-bit pointers, including shared forms and extra templates. Slots 248–255 are a world binding, not a resident fact            |
| Surface assemblies  | `$00E900` | 280            | Relative 32-bit pointers, including scaled/paletted aliases                                                                             |
| Building detail     | `$026000` | 130            | Relative 32-bit pointers; exterior and interior geometry share this family                                                              |
| Ground / pad / road | `$01E400` | 256            | Word offsets from `$01E000`; shared records, per-cell `$83DC` orientation. Live Vesta fills append after these 256 first-world entries. |

The 31 body labels at `$0081DC` include VOID; this does not imply all entries are
planets. The first 256 resident object slots are represented as instances; later
model slots are not invented as placed objects. The native surface-resident
selector and Association B place 34 resident objects across 18 bodies. Named
places are recovered for the captured Eris workspace, Gaea Birmingham
Island's authored area list, and the live Vesta Politburo City workspace. Slot 5's independently reviewed cell places
the V.I.P. LIMO outside Capital Spaceport. Slot 183's source association and
world-to-structure transform place its key inside Capital Spaceport region 1.
See [resident object associations](damocles-resident-objects.md).

Every resident-slot instance also carries `handling`, the interaction byte at
`$6FAA + 4*slot` decoded into `takeable`, `refusal`, the drop handler's two
ranks and the capture-time `carried` flag, with the raw byte beside them. It is
null on every instance that is not a resident slot. Nothing in the catalogue
selects a candidate: which object a take acts on is the per-frame nearest-drawn
rule in [object selection and the take range gate](damocles-object-selection.md).

Every resident-slot instance also carries `boarding`, what the board gate answers
for it (#408), and it is null on every other instance. The extractor reads the
gate's constants from the refusal chooser and gate at `$0542E0`–`$05434F`,
masking each operand out of an instruction check, so the bound, the `+178` pairing
and the two refusal strings are read from the image rather than written down:

- `boardable` is the gate's two table facts: the slot is below the bound at 23
  and the model record opens with the single-Y-turn orientation command
  (`instanceOrientation.modeByte` 64). The reach, region, Occupancy and VOID
  guards are live state, and the key test asks the Carried Stack.
- Under the bound, `admission` is `unkeyed` for slot 1, `seatable` for slots 14
  and above, and otherwise `paired`, with `pairedSlot` at slot + 178, the
  `pairedInstance` at that slot, and the `refusal` the chooser presents:
  `system-string-22` for slot 7, `system-string-3` for the rest. These are
  published even where the model guard refuses, because the key test runs first.
  A paired slot with no instance, such as slot 11's `NULL` slot 189, keeps its
  `pairedSlot` and has a null `pairedInstance`.
- At slot 23 and above the gate refuses silently before the key test, so
  `admission`, the pair and `refusal` are null.
- Each field has a `…Provenance` beside it under ADR 0043: `derived` for the
  bound, admission and pair, `recovered` for the refusal. `reason` states the
  outcome in words, including an unresolved residence.

Eleven instances are boardable: the placed craft at slots 1–7, 10, 12 and 13, and
`AUTHOR'S CHAIR` at slot 14. `ATTACK SHIP` (slot 11) and `NEUTRON FUEL` (slots 8
and 15) fail the model guard, and every `SETTEE` sits past the bound. No seated
eye height is published: boarding puts the eye at the resident position plus 63
for every slot ([boarding admission](../design/damocles-boarding-admission.md)).

The document also carries `craft`, the numbers the craft Mover runs on (#555,
[ADR 0051](../adr/0051-run-the-damocles-craft-pass-exactly-once-every-four-ticks.md)).
The rules they feed are in [the craft control note](damocles-craft-control.md).
As with the gate, each constant is an instruction's operand: the extractor checks
the instruction with its operand masked, then reads the operand.

- `slots` holds all sixteen 32-byte entries of `$055C80`, the address that the
  dispatch `$057CE8` adds. `class` names the routine each entry's `bra.w` reaches:
  `space` (`$05872E`, slot 0), `flying` (`$057F46`), `wheeled` (`$057DE6`, slots 2,
  5, 6 and 13) or `fall` (`$057D64`, slot 9).
  - An entry other than the fall carries `parameters`, the seven words the pass
    reads, as the table holds them. `turnDamping` (+4), `turnAcceleration` (+8),
    `speedLag` (+14) and `thrustGain` (+1C) are raw floats in the program's number
    system. `pitchStep` (+C), `rollExponent` (+E) and `ceiling` (+1A) are signed
    words.
  - The fall carries `fall`: `yStep`, `tumbleStep`, `pitchStep` and `yawStep`.
  - The unread +10 and +18 are left out.
  - An entry that branches to any other routine stops the extraction.
- `constants` lists each constant with the address of the instruction that holds it
  and its operand:

  | Constant | Operand | What the pass does with it |
  | --- | --- | --- |
  | `throttleDouble`, `contactQuarter`, `altitudeScale` | `$10000`, `$20000`, `$100000` | add to or subtract from a float's exponent: throttle × 2, ÷ 4 in contact, Y ÷ 65,536 |
  | `altitudeCap` | `$00051000` | 32.0, the cap on the altitude factor, checked twice |
  | `groundY`, `groundEye`, `supportEye`, `contact`, `supported` | 64, 63, 63, 63, 63 | the contact test and what contact writes |
  | `landingStep`, `landingPitch` | −100, `$A0` | the hard-landing gates; the pitch is compared after `lsr.w #2`, so `$280` |
  | `levelPitch`, `pitchMask` | `$1FF`, `$3FF` | level, compared and stored (checked twice), and the ten-bit mask |
  | `takeOff` | `$0004FFFF` | the speed long must compare above it to keep a nose-up pitch in contact |
  | `verticalLow`, `verticalHigh` | `$080`, `$180` | the cos⁴ yaw window near the vertical |
  | `wheeledDrop` | `$40` | the wheeled tail's one-pass landing test on `$7A30` |
  | `spaceEntry` | `$1F0` | the high word of Y at which the frame loop enters space |
  | `collisionExponent` | `$FFF0` | the throttle exponent a refused move writes |
  | `zero` | `$FF001000` | the stop preset's zero |
  | `throttleDown`, `throttleUp`, `throttleCap` | `$FFFF1F80`, `$1080`, `$000E0000` | `-` and `=` scaling, and the cap above which `=` is ignored |
  | `throttleKeyBound` | `$44` | the highest scancode the throttle table serves |

- `throttleKeys` lists the non-zero bytes of the table at `$0557D6` by scancode.
  `1`–`0` are entries 8–26, `F1`–`F10` are 9–27, and `Space` is `$80`, which stops
  the craft.
- `arithmetic` carries the exponent table (`$60000`, 4,096 words) and the sine table
  (`$64000`, 1,024 floats) as hex, each with its SHA-256. The log table is not
  carried. Extraction checks that every normalised mantissa's entry follows the rule
  the port regenerates it from, and `log.sha256` is the digest of the image's two
  ranges, `$62000`–`$63002` and `$65000`–`$66000`, in that order.

## Recovered data grammar

These are independently documented functional findings, not translated renderer
code. Targeted disassembly used to establish them remains ignored at
`research/damocles-st/work/geometry-code.txt`.

### Object and interior/detail shapes

- The object selector at `$0535A2` uses the table base held at `$04BD10`,
  currently `$035700`, adding the indexed longword to that base.
- Vertex records consumed at `$0536E6` are signed big-endian X/Y/Z word triples.
  `$8000` in the X position terminates them. Projected slots start at byte offset
  4 and advance by 4; polygon indices are therefore one-based multiples of four.
- Ordinary object geometry has a zero word after the vertex terminator. At
  `$0538F4` a nonzero word is a skip length past a viewer-relative box and its
  face list: six longwords give the minimum and span on X, Y and Z of the
  viewer's position relative to the object, and the list is drawn only while
  the viewer stands inside that box. Groups are tested in order; the zero word
  introduces the list drawn from everywhere else. The catalogue decodes every
  group as its own form (`view-n`, named by its box) alongside the default list,
  records `viewerPosition` in the model's `conditions`, and rejects a skip that
  does not land on the next group. Nineteen objects carry such groups; HI-FI's
  default list is empty, so only its conditional form is offered.
- Polygon records consumed at `$04F8FE` start with a colour word followed by
  nonzero byte vertex references and a zero byte. A zero colour word terminates
  the face list. Special line records (bit 14) carry two references. Bits 14
  and 13 together select the object vector-text record consumed at `$053F96`;
  bit 12 as well (`$7000`, or any `$F000` word) is the target marker at
  `$05394E`, which ends the list.
- Object `$6000` text records align to an even address and hold three signed
  word offsets from the object position, a flags word, the character advance,
  two signed glyph scales, a colour word and NUL-terminated text. Flags bit 15
  selects inline text; a clear bit replaces the record pointer with an indirect
  text pointer and fails closed here. The low nybble is the `$31700` font (font
  4 is state-conditioned and fails closed). Bits 6 and 7 patch the glyph loop
  with `exg` instructions (`$C945`, `$C745`): `$00` keeps glyph X/Y, `$80` puts
  glyph X along Z, `$40` lays the glyph flat with Y along Z, and `$C0` lays it
  flat with X along Z. Authored literal text (for example `LAND X` on Objects
  352–355, the LOTTERY TICKET digits) is baked straight into glyph geometry; a
  `$80..$98` token instead names a `$CCA0` workspace string.
- **The whole census sets the inline flag and none of it selects font 4.** All
  41 `$6000` records — 28 object, 3 ground, 10 building-detail — carry flags bit
  15 and fonts 0, 1, 2, 3 or 5. The indirect text pointer and the
  state-conditioned font 4 are therefore paths the decoder fails closed on
  rather than forms waiting to be recovered; neither adds a catalogue form. A
  unit test re-inventories every record so a later decode cannot quietly
  introduce one.
- `$CCA0` tokens divide into four kinds, only the last of which is live state.
- **Slot-derived labels.** `$8007` (`$053512`) and `$8002` (`$05358A`) derive one
  character from the object's resident slot and store it at `$CD12`, which token
  `$87` points at: a letter `'A' + slot − 30` and a digit `'0' + (slot & 15)`. So
  DOOR KEY A's ten slots draw the labels A to J on the key head, and
  TRANSPORTER's ten draw 0 to 9. Each slot is offered as its own form, crossed
  with any view-conditioned groups the record also has.
- **Frame animations.** `$CD9C` (`$89`), `$CDCE` (`$8C`) and `$CE6A` (`$82`) are
  descriptors `[character][NUL][index word][NUL-terminated frame script]`. In all
  ten independent captures the script is byte-identical and the displayed
  character is exactly `script[index]`, while the index differs between captures
  — the same standing as the free-running articulation angle at `$7888`. The
  script is model data, so it is the complete set of forms the record can draw,
  and no single frame is canonical. The catalogue samples eight evenly-spaced
  frames as `text-frame-n` forms and names the script in the model conditions:
  AUTHORS COMPUTER cycles the 12-frame `IPQRQPIMNONM` in font 2, and TELEVISION
  runs a 697-frame script through all 63 printable font-5 glyphs. `$89`'s script
  is one character repeated, so the two building details reaching it draw the
  same space whatever the index holds; `expand_vector_text` fails closed rather
  than pick a frame if a building detail ever reaches a varying script.
- **Structure-workspace face markers.** `$8D`–`$96` (`$CD37`–`$CD49`) are ten
  two-byte fields the placing structure writes, covered by the live-workspace
  detail variants.
- **Live mission state.** Only EXPLOSIVE-ARMED!'s `$88` (`$CD14`) remains. `$04DAFC`
  formats that field as `M.SS`: `$04DAD0` takes the armed deadline less the clock
  at `$793E`, floors it at zero into `$786A`, divides by 60 for the minute digit
  and indexes the two-digit second pairs at `$0526C2`. Every pinned capture reads
  the floor, so the disarmed `0.00` is drawn as the evidenced reading and the
  running countdown stays the record's one named `liveText` gap.
- Some `$8001` headers control instance orientation; their neutral local geometry
  is decoded without baking in a particular instance heading. A mode byte with
  bit 7 set (`$053572`) is articulation: an axis byte, a pivot X word and pivot
  Y/Z words follow, and at `$0537B0` every vertex with a negative Y is
  complemented and rotated about that pivot by the global angle at `$7888`. The
  `$7888` is a free-running byte: it differs between two cold boots of the same
  scene and in every other capture, so no frame is canonical. It indexes the
  256-entry sine table at `$925A`, where `T[a]` is the sine and `T[a + 64]` the
  cosine of `a × 360/256`. `$0537B0` translates a tagged vertex to the pivot,
  applies `x·cos − y·sin` and `x·sin + y·cos` keeping only each product's high
  word doubled, and translates back; the axis byte picks the plane and
  which of its two coordinates leads: negative Y before Z, zero Z before X, and
  positive X before Y. The catalogue reproduces that fixed point,
  truncation included, and offers **eight sampled angles** as forms for the six
  articulated objects, so NOVABOMB and the beacons can be inspected turning. Supported name/far-marker headers do not change local vertices.
  Relative header jumps and colour patches expose related visual forms with the
  same vertex stream; the browser offers those forms in its selector.
- `$8003` (`$0534B0`) is the beacon flasher: one unconditional byte-pair patch,
  then a zero-terminated list of offsets that receive `$777` while lit or
  `$8000` while dark from the `$7AE8` timer, then a relative jump to shared
  geometry. Records whose first patch is `$246` or `$411` also consult `$707E`
  or `$7082`. BLACK, BLUE and RED BEACON share one body and offer `flash-dark`.
- `$8006` (`$053440`) cycles one colour word through the six-entry table at
  `$53432` (`$8000`, `$321`, `$432`, `$543`, `$654`, `$777`) while bit 0 of
  `$7875` is set; TELEVISION offers frames 0–5.
- `$8009` (`$05355A`) jumps by the following word when `$7A60` is nonzero;
  NOVAGEN SAFE offers the `open` form.
- `$8004` (`$04CFA4`) never returns to the record parser: it projects the
  `$350E0` point field (`$7834` entries) as a particle burst. Object 74 is
  therefore a decoded **procedural** record with no authored polygon geometry.
- Key header `$8008` stores a two-character display code and jumps to shared key
  geometry. Its `$6000` vector-text record supplies the local anchor, character
  advance, scales, colour and text reference. Glyph strokes come from the source
  table at `$31700` and become model-space lines. The `$8000` text configuration
  is not a terminator: twelve further body faces follow the text record, giving
  fourteen faces and eighteen body vertices. Eight key models share this body
  with different source lettering. See the 2026-09-08 correction in the
  [Spaceport findings](damocles-spaceport-interior.md).
- The detail table serves **both exterior and interior** geometry. Building detail 88
  includes the tower and windowed facade seen outside at the spaceport; it is not
  a separate enclosed room. The original “Interiors” label incorrectly treated a source bank as a semantic
  category. The catalogue now calls this family **Building detail**, and the
  `$00E900` family **Surface assemblies**. Neither implies a verified room.
  Legacy `interior`/`structure` dataset keys and URL identities remain unchanged
  for compatibility; generated names now say “Building detail”. Surface previews
  assemble their linked detail geometry using the metadata's signed X/Z scales.
  Negative detail Y values are complemented heights with an articulation tag
  (`$053D4A`); the viewer uses the neutral pose, not a below-ground coordinate.
  An `$8001` X word ends an articulated detail's vertices; `$053B4A` then reads
  an axis word and a pivot scaled by the detail's X/Y/Z factors before the face
  records. Details 6, 7, 8, 68 and 69 decode this way. Detail 69's extra
  projected-slot references are proven unreachable as described below; they no
  longer constitute a decode failure.
- A detail turns in its **placing structure's frame**, not in its own. `$054D98`
  sign-extends the two scale bytes the surface record carries — at `−8`/`−7` from
  a plan record's pointer, or at `+2`/`+3` for an alias — into `$539CE` (X) and
  `$539D2` (Z). Nothing in resident RAM writes the Y factor at `$539D0`, which
  stays 1, so a detail is scaled on X and Z only. `$053D52` multiplies every
  vertex by those three factors *before* `$053D5E` reads the axis, and `$053B4A`
  has already scaled the pivot the same way. A nonuniform or mirrored structure
  therefore changes the shape of the turn, not only its size: the same arm scaled
  ×4 on X sweeps onto a ×2 Z and comes back a different length. The two
  coordinates in the turning plane are words there, sign-extended back to longs
  at `$053DAA`, while the third keeps its full 32-bit product.
  The axis value names which coordinate leads: positive X before Y (`$053D6A`),
  zero **Z before X** (`$053DB2`), negative Y before Z (`$053DF8`). The object
  routine agrees at `$0537C2`/`$053806`/`$05384A`. Leading with X in the zero
  case turns the part backwards; the catalogue did that until this was read off
  the code, and the six articulated objects moved when it was corrected.
  The catalogue now offers each placed articulated detail at eight sampled
  `$7888` angles **per frame it is placed in**, under one reusable detail
  identity: detail 7 is placed by five structures at 3×3, −3×−3, 4×2, −4×−2 and
  −5×−5, and carries all five. Read from run
  `observe-first-world-20260818T101013Z-c5a32b7d`, `observed.ram` SHA-256
  `b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967`, program
  SHA-256 `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef`. Each placing surface assembly offers the same
  eight angles on its own combined form. `$7888` free-runs, so no sampled angle
  is canonical — the same reason the articulated objects are sampled rather than
  pinned. A detail no captured structure places keeps the `articulated` omission,
  naming the missing scale frame as its evidence gap; none of the five does.
- `$053A1E` gives a building detail 63 shared vertex slots and `$053D32` fills
  only the ones the record's own vertex list supplies, so a face record naming a
  higher slot would draw whatever the previous model left behind. Building
  detail 69 has four such records, 17 to 20, referencing slots 56 to 63 past its
  55 vertices. Neither visibility group names any of them — the selector lists
  cover records 0 to 16 and 21 to 45 — so the game never tabulates them into
  `$C040` and never draws them. They are kept as selector ordinals contributing
  no primitives, which is what keeps the later selector bytes aligned, and
  `unreferencedRecords` names them. A record like this is only safe to keep when
  no list selects it; `check_unreferenced` raises if one does.
- Object names are the 16 printable bytes preceding the model pointer. Printable
  labels are source-verified names, not verification of gameplay interpretation.
- Building-detail selection at `$053AA6` uses `$04BD22` → `$026000`. Interior vertex
  triples are followed directly by face records, without the object's visibility
  header.
- A detail selector byte names a **source primitive record**, not a drawn polygon.
  `$053BAE` tabulates one longword per record into `$C040` whatever its kind:
  an ordinary polygon, a two-reference line, or an `$60xx` vector-text record.
  `$053A46` then indexes that table by the selector byte, so the bytes are
  one-based record ordinals. One text record can contribute many filled glyph
  faces, a line record contributes a line rather than a face, and a record whose
  text expands to nothing still occupies a slot. Counting drawn faces instead
  rejected nine details outright and silently misaligned Building detail 84,
  whose text record adds fourteen faces to thirty-nine records. Each detail
  primitive now carries its `sourceIndex` and each mesh its `recordCount`, so a
  live-text variant resolves the same selector against its own glyph count. Drawing every face for free inspection does not reproduce the
  original view-conditioned face list.
- Building-detail `$60xx` records are native vector text, not polygons. Their
  fixed header supplies a model-local anchor, font, advance, glyph scales, plane
  and colour; the following NUL-terminated text may end in a live `$CCA0` token.
  Source glyph `$80` records are filled polygons and `$81` records are strokes.
  Seven formerly unresolved details now retain their preceding geometry and text.
  Vesta Parliament binds token `$91` to the live `E` at `$CD3F`, adding its four
  filled glyph faces to the captured assembly. See
  [building-detail vector text](damocles-building-vector-text.md).

### Colours and surface structures

- Direct colours are ST 3-bit-per-channel `0RGB` words, expanded to RGB8 without
  lighting, new materials or textures. The pinned Hatari capture maps each channel
  in steps of 34: `$777` → `#EEEEEE`, `$066` → `#00CCCC`, `$444` → `#888888`.
  These exact RGB values were checked in both the first-world and interior-window
  viewport captures; normalising the maximum to 255 would brighten the artwork. Palette references resolve through the
  scene's soft colour table; direct hardware-slot references require its palette.
  Objects 333–338 are the only six object records whose faces name the scene
  colour table, and none carries a palette of its own: they are `$7000` ground
  templates, so their colours resolve through the palette the **placing cell's**
  surface record selects. Five are placed by authored `$7000` records in the
  captured workspaces and now carry one variant per evidenced palette: objects
  333–336 bind palette 1 through structureless cells on Vesta and Gaea UR City,
  and object 337 binds palettes 1, 2, 51 and 62 across first-world and Dion
  cells. Object 338 keeps the `paletteBinding` gap; see below.
- Object 338 is object 337's colour variant: identical nine vertices and seven
  face index lists, with `$8092`/`$8094`/`$0322` where 337 has
  `$0444`/`$8082`/`$0333`. Its colours therefore vary far more between palettes
  than 337's do — word 9 is `$411` in palette 1 but `$355` in palette 62 — so
  showing it through palette 0 stays an unverified binding rather than a
  cosmetic detail. The authored `$7000` records that name slot 338 (eleven
  placements, in ground records ending at `$023734`, `$023884` and `$0239C0`)
  sit above `$022A58`, the highest ground record any captured `$1E400` cell
  table selects. The ground record bank `$01E790..$023FFF` is byte-identical in
  all four captures — only the `$1E000..$01E64B` workspace header and the cell
  table change per body — so the records are authored and resident, just
  unselected. The next probe is a surface workspace capture on a further body
  whose cell table reaches `$0236xx..$0239xx`; that cell's surface record names
  the palette. This overlaps the unexamined-workspace follow-up
  [#172](https://github.com/odogono/mercenary/issues/172).
- Scene palette offsets begin at `$00D200`. Selection at `$054E10` establishes
  the relative word offset and `$7A0E` binding. Structure metadata carries the
  palette index and interior index, so a shared interior can expose more than one
  evidenced palette variant. The current spaceport binds palette 21 and interior
  88, consistent with the saved interior RAM's `$053A84` and `$7A0E` values.
- Surface selection at `$054D78` uses `$04BD0C` → `$00E900`. Ordinary records have
  eight preceding metadata bytes, two heights, two scene colours, then signed X/Z
  plan coordinates terminated by zero X. Signed scale factors come from metadata.
  The two scene colours are the **cell background**, not wall colours: `$059DA2`
  resolves them through the structure's scene palette into `$7C82`/`$7C84` and
  the frame loop installs them at `$059600`. They are now decoded onto the model
  as `sceneColours` (265 records), each with a `dayColour` where the palette's day half
  differs ([the day/night terminator](damocles-day-night-terminator.md#the-scene-colours-latch)).
  The viewport itself is a raster block fill at
  `$059CE2`, an unrolled `movem.l` over the 136-line viewport, so the background
  holds no geometry a model could carry.
- Wall records contain two one-based plan references and a type/colour word.
  Types 3–6 contain two additional references; type 7 does not. Supported ordinary
  and lower-height walls, upper wall bands (type 7), and ground/lower/top planes
  become independent polygons.
  Types 2 and 3 use a **third wall height**. `$059D9A` loads a record's two
  heights into `$7B26`/`$7B28`, and `$05A756` projects four levels: ground,
  `$7B26`, `$7B28` and `$7B2A`. No instruction anywhere in the 1 MiB image
  writes `$7B2A`; an exhaustive scan of extension words finds the single read at
  `$05A762`, and the word holds **48** in all seven pinned captures, spanning
  five structures on four bodies with different record heights. The extractor
  therefore binds it from the workspace for every structure rather than for the
  reviewed spaceport alone. Type 2 is a wall from the ground to that height with
  its two plan references swapped (`$05AD52`); type 3 is a flat four-reference
  polygon at it (`$05AEA8`). Together they recover 563 further faces across 106
  records, typically a plinth or window sill under the main wall band.
  An immediate plan terminator and wall-list zero word is an empty placeholder,
  not a failed decode: Structure 100 (`structure-01a618`) and its linked
  building detail 1 (`$02620E`, `$8000` vertex terminator) are accounted that
  way. See [Structure 100](damocles-eris-structure-01a618.md).
- Negative structure headers select an alias, scales, palette and interior.
  Alias indirection which the decoder cannot resolve remains unresolved. Authored
  surface attachments/openings after the basic wall list are retained by the
  supported constructors; no record currently carries an `attachments` omission.
  `$40F0` and `$82F0` use the same geometry as `$4000`/`$8200`. The low byte
  selects a door-key label through the cell-derived `$7AFB` base, not a shape;
  schema 9 retains that rule as `keyIndex`. The `$DF` visual-change branch is
  accounted for: `$059F64` reads the nine-record `$6364` table and, on its
  negative-word records, substitutes character `$DF` for the entrance label glyph
  the `$7AFB` base would otherwise give. It is a glyph code, not a shape change.
  `$04ED4A` replays the same table's non-negative records over the rebuilt
  `$ABDC` cell workspace, replacing or clearing the surface assembly a cell
  places — again without introducing a record. The table is all zero in every
  pinned capture, so neither branch is exercised by an observed state. See
  [disk loads and bank extents](damocles-disk-loads-and-bank-extents.md).
- An Entrance Attachment record is a control word, four rectangle words, its
  leaf colours and a four-word Proximity Box. The **one-leaf** path stores three
  colours at `$05A08A` and so occupies **24 bytes**; the two-leaf path at
  `$05A202` reads a fourth word for its own record slot and occupies 26. Reading
  26 for both drifted every following record, which is why one-leaf structures
  previously reported an invalid Proximity Box and lost their whole selector.
- Each attachment also appends faces to the structure's drawable list: three for
  one leaf (`$05A0D4`) and six for two (`$05A234`). A region queue byte therefore
  names a plan wall, an attachment slot, or a face an attachment contributed.
  Slots count down from `$3FC` in stream order, so a structure with five or six
  attachments names slots as bytes 251 and 250; the byte threshold is the lowest
  assigned slot, not a fixed `$FC`.

### Cell ground, pad and road

- After the structure selector, `$054E40` reads a per-cell orientation byte at
  `$83DC` and a word at `$1E400 + 2×cell`. That word is an offset from `$1E000`.
  The first-world workspace has a record for every cell; 133 cells share one
  empty record. Ten source records contain 56 `$7000` command sites; orientation
  expands them to 74 placements across 13 address-and-transform catalogue
  models. They place six existing object models at cell-local coordinates. See
  [Eris ground findings](damocles-eris-ground.md).
- Plan vertices are unsigned words relative to `$8000` (cell centre), terminated
  by a zero X. A PC-relative nybble table at `$54E8E` optionally swaps and
  negates X/Z from the orientation byte.
- Faces are colour word plus byte vertex references, as in object polygons.
  Direct `$777` is the white pad; `$800e` resolves through the hardware palette
  as the grey apron. `$F0`/`$F4` are **scene points**, not
  neighboring-cell model vertices. `$054A64` fills the slots from `$7B54` to
  `$100` from packed bytes at `$5E40`: one world cell index per nybble, seeded
  from `$80000000` so the swap leaves `$8000` in the low word and every point is
  a cell centre. A reference therefore resolves to `(nybble − cell) × 65,536` in
  the record's own local frame. The four slots a record can name are **authored
  per cell**: `$05493E` reads a longword of four packed bytes at
  `$1E000 + cell × 4` and rotates it by the cell's transform, so `$1E000` holds
  a 1 KiB seed table before the `$1E400` word index and the records themselves.
  Every scene reference in the bank therefore resolves without a capture of the
  player standing in that cell. Because the offsets are cell-relative, cells
  sharing one source record draw different geometry, so a scene-joined ground
  model carries its cell in its identity and names the shared record in its
  evidence. Capital Spaceport cell `$87` is the worked example: `$F0` is the
  centre of the cell four grid steps ahead, which closes the grey apron and the
  white centre line into a runway and restores the centre-line edge the old
  decode dropped. See the [watch run and register evidence](damocles-eris-ground.md). `$C00E` is a two-point edge in
  the same colour family. `$7000` aligns the source address, reads X/Z plus an
  object-table byte offset, applies the cell orientation, and composes that
  address-based model. `$53F76` is the ground vector-text path: it aligns the source address down,
  reads X, Y and Z, and shares the flags, advance, glyph scales, colour and
  inline text tail at `$053FCA` with the object records. X and Z use the same
  `$8000`-relative cell-local encoding as the plan vertices because the consumer
  subtracts only the camera's low word; Y is already a world height. Plane bit 6
  lays the glyphs flat, so the Eris spaceport cells carry their runway
  designations `09-02` and `01-14` painted on the apron, and a Gaea cell carries
  a `3`. The record is copied into the frame stream untransformed, so a cell with
  a nonzero orientation would need separate evidence and stays a named gap.
  This is not the
  source placement consumer. Structure slot zero still indexes surface-table
  entry zero, whose metadata binds palette zero at `$054E10`; this supplies the
  scene colour for the two transformed `object-041b1e` placement groups.
- `/damocles` still paints an authored green plane; recovered ground instances
  are catalogue-only until the separate native surface/background fill path is
  recovered. The shared empty record does not contain that plane: `$056634`
  returns immediately on its initial zero command, so it is a fully decoded
  intentional empty rather than an unresolved default-cell quad.

### Surface placements and captured Eris places

- Authored surface-assembly maps are `$FF`-terminated streams of `selector`,
  `cell`, structure-low. A zero low byte is a three-byte skip. Otherwise
  structure-high, signed `dx` and `dz` follow. The low nine bits of the
  structure word select the surface-assembly slot, matching the consumer at
  `$4ECCA..$4ED12`. The shortest stream that covers a following named-area
  place list is the map for that area; extra cells after the first required
  place remain as unnamed surrounding assemblies. The decoder does not bake
  Eris or Gaea identities into this grammar.
- `$054B98` constructs a cell index as `(z << 4) | x`. `$054CBC` indexes four-byte
  records at `$00ABDC`; the low nine bits select a structure. The last two signed
  bytes offset its origin by 30 raw units, matching `$054D48` and `$054D5C`.
- World/local camera pairs at `$7A92`/`$7A2C` and `$7A9A`/`$7A34` bind the captured
  workspace to its grid origin. The catalogue reports world grid units with
  65,536 raw units per cell, not metres. Unknown headings remain null.
- The first-world view identifies ERIS. Only this pinned scenario is admitted;
  the extractor must not label another body's workspace as Eris.
- `$7A6C` points to the current area's label list. Following the 20-byte area name,
  each nonzero cell byte precedes ten bytes of name and ten bytes of kind. The
  zero cell ends the list. `$054C10` establishes the cell-to-name relationship.
- Association B's first word is compared with `$7AA8 << 8` by the native
  surface-resident selector at `$52C9C..$52CD2`. A nonzero aligned first byte
  identifies the body and a zero second byte identifies a surface resident.
  This yields **34 surface-object placements across 18 bodies**. Coordinates use
  the resident signed 16.16 X/Y/Z arrays and headings retain the raw source byte.
  Other association bytes are not promoted to named places.
- The captured Eris workspace yields 76 surface-assembly placements and 11 named
  places. The separately decoded group-$14 cell-$26 assembly brings Eris to **77
  surface assemblies**; its seven surface objects bring that map to **84
  structure and object placements**. One hundred and twenty-three recovered ground/pad/road
  instances bring the Eris map to **207** plotted locations.
- The authored Birmingham Island map in the same first-world place pool
  (`$23C58..$23E56`, SHA-256
  `e85959b1b659847bb029cc57766ed77ba3822ceb1d1098938619bfa8f96397d9`) yields
  **82** Gaea surface assemblies. Its place list (`$23E57..$23EFE`, SHA-256
  `8bd019976d456c39896408849bd380367815a22eef78fd126dcdb9b0e98763f2`) yields
  **7** source names. Binding that map to 99 CHEVY's resident phase plots those
  assemblies with the five Gaea residents, **87** Gaea map pins. Cell `$17` is
  empty in the stream. This is not a live Gaea `$ABDC` workspace; ground/pad
  records and other Gaea islands remain unresolved except the live UR City
  `$ABDC` overlay. See [Gaea UR City live workspace](damocles-gaea-ur-city-workspace.md).
  Across all bodies the dataset now contains the Eris points, the Birmingham
  Island assemblies, the live Vesta Politburo City `$ABDC` overlay, the live
  Gaea UR City `$ABDC` overlay, the live Dion `$ABDC` overlay, and the
  previously mapped non-Eris residents. This is resident state plus authored
  pool recovery from the pinned first-world capture plus live non-Eris
  workspaces, not a complete body-surface census.
  The slot-180 assembly is recovered from the authored group-$14 map outside the
  captured first-world workspace; other interior-associated and exceptional
  residents remain listed without invented map positions.

## Verification and remaining coverage

The decoder tests signed coordinates, polygon references, colour conversion,
truncation, surface height construction, source pin failures, reproducibility,
dual first-world extract equality, interior-window table identity, and the
generated coverage census. Browser contract tests reject duplicate IDs, missing
references, contradictory slot accounting and inconsistent place membership.
The triangulation test traverses every exposed face, including repeated-corner
triangular roof records and concave faces.

Desktop end-to-end tests cover direct access without loading Targ, search/filter
navigation, Back, orbit/zoom/reset, wireframe, visual variants, structure/interior
links, the Eris placement list, the Gaea placements around 99 CHEVY, the hand-off
into the Gamma Atlas at a placement’s own Body Coordinates, unknown bodies,
unknown records and unavailable or incompatible datasets. A storage sentinel remains unchanged. Targ save/resume
keys are also seeded and checked byte-for-byte so direct catalogue access cannot
alter an existing session or save.

Representative inspection uses the DART II model, the Capital Spaceport structure
at cell `$87`, building detail 88, `KEY- V.I.P. LIMO` in resident slot 183, and
the V.I.P. LIMO in resident slot 5. The limo's recovered world coordinates place
it outside the named Spaceport cell, and the catalogue preserves its raw heading byte (`0`, north under the decoded
256-step convention). A successful keyed
capture and two legal empty-inventory approaches establish that this limo
requires its key and otherwise reports `VEHICLE KEY REQUIRED`. The exact native
comparison branch remains undecoded. The same matching names and `+178` table
relation link all eight recovered vehicle/key pairs without inventing their
unknown residences. See the
[V.I.P. LIMO findings](damocles-vip-limo.md).
The original first-world and
`interior-window-ram-20260818T172346Z-e3772e4d` captures establish the spaceport's
exterior/interior correspondence. The latter records interior pointer `$0303D6`
and palette pointer `$00D54C`. Shape inspection and colour comparison remain
bounded: the catalogue does not reproduce the original camera, scene visibility,
attachments, or exterior seen through the interior's window. These are not
claimed as a completed pixel-fidelity gate.

A Hatari GUI memstate with the player on foot outside Vesta Parliament (local
cell 4,6, `$7B5C=$64`, body selector `$7AA8=$0038`) supplies the live Vesta
`$ABDC` overlay. Structure and building-detail pointer tables match first-world;
object unique addresses are unchanged. The overlay places **19** Vesta surface
assemblies (including `vesta-surface-64` / `place-024101`) and **24** ground
instances, adding **12** workspace-local ground models while keeping Eris
`ground-{addr}-{transform}` identities for byte-identical records. See
[Vesta live workspace](damocles-vesta-workspace.md).

A Hatari GUI memstate with the player on foot in Gaea UR City (local cell 4,2,
`$7B5C=$24`, body selector `$7AA8=$0020`) supplies the live Gaea `$ABDC`
overlay. Structure and building-detail pointer tables match first-world;
object unique addresses are unchanged. The overlay places **22** UR City
surface assemblies (including unnamed `gaea-ur-city-surface-24` and
`gaea-ur-city-surface-17` / HANTZENS NEW HOUSE) and **38** ground instances,
adding **18** workspace-local ground models. Authored Birmingham
`gaea-surface-{cell}` identities are unchanged. See
[Gaea UR City live workspace](damocles-gaea-ur-city-workspace.md).

A Hatari GUI memstate with the player on foot on Dion (local cell 2,3,
`$7B5C=$32`, body selector `$7AA8=$0010`) supplies the live Dion `$ABDC`
overlay. Structure and building-detail pointer tables match first-world;
object unique addresses are unchanged. The overlay places **140** surface
assemblies (including unnamed `dion-surface-32`) and **249** ground instances,
adding **31** workspace-local ground models. `$7A6C` still names first-world
Birmingham Island; those Gaea place identities are not applied to Dion. See
[Dion live workspace](damocles-dion-workspace.md).

The sky and the ground band below the horizon are **excluded as rendering-only
state** rather than left as omitted geometry. `$059CE2` fills the whole 136-line
viewport in colour index 8, and the MFP Timer B handler at `$052280` rewrites
hardware colour 8 (`$FF8250`) at scanline `$7BFC`, so one fill reads as sky
above the horizon and ground below it. The sky colour comes from the world
record's day/night pair through `$7C86`, the band from the body workspace word
at `$7A1A`. The scene slots below `$F0` that `$05499E` allocates are excluded on
the same footing: they are a per-frame slot numbering over the `$1E000` corner
longwords the extractor already decodes, drawn as two-point ground-extent edges
at `$054AD2`. `research/damocles-st/scripts/ground-extent-check.py` reconstructs
the live list, lowest slot and `$5E40` bytes from captured RAM alone and passes
on every captured RAM image in the work tree. See
[Eris ground](damocles-eris-ground.md).

The census gives every discovered record a verdict, but `coverage.complete`
remains **false**. The reconciled census is **832 records: 510 decoded, 322 partial,
0 unresolved**. Open coverage work and documented residual limits are distinguished
below; closing an investigation does not resolve its residual limits.

| Coverage gap or residual limit | Tracking / disposition |
| --- | --- |
| Unexamined `$ABDC` workspaces, Gaea islands, named places and associated residences/transforms beyond the captured coverage | [#172](https://github.com/odogono/mercenary/issues/172) |
| Unverified scene palette binding for object slot 338 (one record) | [#277](https://github.com/odogono/mercenary/issues/277) — closed investigation; residual retained |
| The running EXPLOSIVE-ARMED! `$CD14` countdown, the one remaining live `$CCA0` object-text case | [#279](https://github.com/odogono/mercenary/issues/279) — closed investigation; residual retained |
| The 158 packed custom-format STX tracks, and the `$6364` branches that no capture exercises | [#280](https://github.com/odogono/mercenary/issues/280) — closed investigation; residual retained |
| The scanline `$7BFC` the sky/ground raster split fires on; rendering-only, and not a record the catalogue would carry | [#281](https://github.com/odogono/mercenary/issues/281) — closed investigation; residual retained |
| Representative visual fidelity against Working Authority captures | [#174](https://github.com/odogono/mercenary/issues/174) |

Building detail 69's unreachable projected-slot records, authored empty/NULL
records, the structure-scaled frame the five articulated building details turn
in, and the cell-derived `$7AFB` attachment label are accounted for; they are
not outstanding decode failures. Resident model banks do not change between
first-world and occupied-Spaceport RAM. Partial records still include neutral-pose
assemblies and inspection limits, so the partial total is not a count of distinct
unknown grammars. These explicit limits preserve the boundary between a reconciled
census of examined evidence and a claim that the whole game's extraction is complete.

## Viewer correction after inspection

The initial viewer drew both sides of every polygon. Authored opposite-winding
faces with different colours (for example the PROCESSORS CHAIR legs) occupy the
same plane, so this produced striped depth fighting and incorrect side colours.
The viewer now culls back faces using outward counter-clockwise winding, preserved
by triangulation. It does not reverse vertices or discard authored face pairs.
The orthographic depth sign also now matches a camera looking down negative Z;
positive pitch gives an elevated view rather than exposing undersides.

A production-WebGL browser regression reads rendered pixels for coincident
opposite-winding faces and separated near/far faces. Both previously chose the
wrong colour. Free orbit still does not implement source visibility groups;
remaining artifacts in partial assemblies require separate extraction evidence.

The building categories describe record families, not a proven exterior/interior
partition. Simply swapping them would still mislabel shared geometry. Confirmed
room relationships remain a research gap.

### Specific category counterexamples reported during catalogue review

- **Building detail 84**, `interior-02f7a6` (source `$02F7A6`), visibly
  depicts a sphinx-like form in the catalogue. Alex identified this example;
  inspection of the decoded geometry confirms the resemblance. “Sphinx” is a
  candidate descriptive label, not a recovered game name. This is a concrete
  counterexample to classifying the entire `$026000` bank as interiors.
- **Structure 12**, `structure-00f88e` (source `$00F88E`), was identified
  by Alex as a likely interior room. It links to `interior-02f0ee` and currently
  omits attachments/openings and primitive types 2 and 3. Treat room usage as
  a candidate pending a matching Working Authority view or runtime relationship;
  the surface-table reference alone does not disprove interior use.

These observations identify specific records for further fidelity review. They
do not establish a bank-wide exterior/interior swap.

## Capital Spaceport representative review

Structure 74 now offers separate **exterior form** and **interior layout** views
instead of combining both unconditionally. The captured interior is **region 1
of Structure 74**, with detail 88 still selected; it is not a different model in
the detail bank. See [the addressed evidence and remaining gaps](damocles-spaceport-interior.md).

The interior-layout view follows region 1's recovered source list. It accounts
for all 28 decoded plan faces in source draw order. Its `$FF` entry resolves to
Structure 74's authored dynamic entrance-door attachment. Both views remain partial. The exterior
uses the linked detail's evidenced X/Z scale of 2. Stable identities, map
placement, and table accounting are unchanged. Other buildings retain their
previous assembly pending individual review; this is a representative correction,
not a claim that all bank roles have been resolved.
