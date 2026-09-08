# Damocles Catalogue extraction

Working-Authority Evidence, implementing ADR 0039. The catalogue is a read-only
inspection surface at `/catalogue`; it neither starts a Gameplay Session nor
loads Targ's world payload. Exact geometry remains private extracted material.

## Reproduce

From the repository root:

```sh
PYTHONPATH=research/damocles-st python3 -m damocleslab.catalogue \
  --run research/damocles-st/work/observe-first-world-20260818T101013Z-c5a32b7d \
  --output payload/damocles/catalogue.json
cd web
bun run dev
```

Open `http://127.0.0.1:5173/catalogue`, or follow **Damocles catalogue** from the
game menu. `?model=object-035d12` opens DART II;
`?instance=eris-surface-87` opens the Capital Spaceport placement;
`?instance=object-slot-5` opens the V.I.P. LIMO outside it.

The extractor first verifies the run's artifact hashes, program/TOS pins, and
first-world scenario hash. It uses the standard library only. A missing capture
can be regenerated with the existing `lab observe --scenario
research/damocles-st/scenarios/first-world.json` command. Raw images, RAM and
Working Disassembly stay in ignored research paths; the browser receives only
the separately versioned catalogue JSON. Schema version 3 includes per-face
source indices, structured evidence, nested instance placements, and source key
display metadata.

## Source and census

Source runs:

- `observe-first-world-20260818T101013Z-c5a32b7d`
- `observe-first-world-20260818T101117Z-010b9ad3`

Both are independently captured cold first-world loads. Extracting both gives
identical models, tables, instances, body names and places. Their provenance
records intentionally differ. The emitted source record pins the RAM and
program SHA-256; model identities depend on kind and source address, never names.

| Resident table           | Address   | Slots examined | Meaning                                                              |
| ------------------------ | --------- | -------------- | -------------------------------------------------------------------- |
| Object geometry          | `$035700` | 378            | Relative 32-bit pointers, including shared forms and extra templates |
| Surface assemblies       | `$00E900` | 280            | Relative 32-bit pointers, including scaled/paletted aliases          |
| Building detail geometry | `$026000` | 130            | Relative 32-bit pointers, with many aliases                          |

These extents are bounded by the next independently recognised data records:
object NULL metadata at `$035CE8`, the first surface metadata at `$00ED60`, and
the interior record preamble after `$026208`. They remain **provisional table
extents**, rather than a proven census of every disk-loaded asset or every
runtime-selectable index. The UI displays that qualification for each table.
Every slot maps to one model identity; repeated pointers share a model and retain
all slot indices. No pointer scan is represented as a model census.

Current extraction accounts for **539 unique records**: **166 decoded**,
**306 partial**, and **67 unresolved**. “Decoded” means the supported record was
parsed completely; it does not mean every model has received a human fidelity
review. Partial records expose recovered geometry and explain omitted features.
Unresolved records remain searchable and retain their source identity and reason.
NULL is explicitly accounted for as an empty record, not a fabricated mesh.

The 31 body labels at `$0081DC` include VOID; this does not imply all entries are
planets. The first 256 resident object slots are represented as instances; later
model slots are not invented as placed objects. Residence remains unknown except
for slot 5, whose source association and captured world coordinates place the
V.I.P. LIMO outside Capital Spaceport, and slot 183, whose source association and
world-to-structure transform place its key inside Capital Spaceport region 1.

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
- Ordinary object geometry has a zero word after the vertex terminator. Nonzero
  view-conditioned groups are retained as unresolved instead of guessing which
  branch should be shown.
- Polygon records consumed at `$04F8FE` start with a colour word followed by
  nonzero byte vertex references and a zero byte. A zero colour word terminates
  the face list. Special line records carry two references. Other special
  commands fail closed.
- Some `$8001` headers control instance orientation; their neutral local geometry
  is decoded without baking in a particular instance heading. Articulated header
  modes remain unresolved. Supported name/far-marker headers do not change local
  vertices. Relative header jumps and colour patches expose related visual forms
  with the same vertex stream; the browser offers those forms in its selector.
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
- Object names are the 16 printable bytes preceding the model pointer. Printable
  labels are source-verified names, not verification of gameplay interpretation.
- Building-detail selection at `$053AA6` uses `$04BD22` → `$026000`. Interior vertex
  triples are followed directly by face records, without the object's visibility
  header. Articulated interior terminators remain unresolved. Drawing every face
  for free inspection does not reproduce the original view-conditioned face list.

### Colours and surface structures

- Direct colours are ST 3-bit-per-channel `0RGB` words, expanded to RGB8 without
  lighting, new materials or textures. The pinned Hatari capture maps each channel
  in steps of 34: `$777` → `#EEEEEE`, `$066` → `#00CCCC`, `$444` → `#888888`.
  These exact RGB values were checked in both the first-world and interior-window
  viewport captures; normalising the maximum to 255 would brighten the artwork. Palette references resolve through the
  scene's soft colour table; direct hardware-slot references require its palette.
- Scene palette offsets begin at `$00D200`. Selection at `$054E10` establishes
  the relative word offset and `$7A0E` binding. Structure metadata carries the
  palette index and interior index, so a shared interior can expose more than one
  evidenced palette variant. The current spaceport binds palette 21 and interior
  88, consistent with the saved interior RAM's `$053A84` and `$7A0E` values.
- Surface selection at `$054D78` uses `$04BD0C` → `$00E900`. Ordinary records have
  eight preceding metadata bytes, two heights, two scene colours, then signed X/Z
  plan coordinates terminated by zero X. Signed scale factors come from metadata.
- Wall records contain two one-based plan references and a type/colour word.
  Types 3–6 contain two additional references; type 7 does not. Supported ordinary
  and lower-height walls, upper wall bands (type 7), and ground/lower/top planes
  become independent polygons.
  Types requiring the third height remain gaps except for the reviewed spaceport,
  whose captured height binding now recovers the lower window wall and sill.
- Negative structure headers select an alias, scales, palette and interior.
  Alias indirection which the decoder cannot resolve remains unresolved. Authored
  surface attachments/openings after the basic wall list are not silently omitted
  from a “decoded” result: their presence makes the model partial.

### Captured Eris placements and places

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
- This yields **76 surface-assembly placements and 11 named places**. Resident
  slot 5 adds one recovered surface-object placement, so the Eris map displays
  **77 placements**. This covers the loaded workspace, not all of Eris. Other
  bodies show an explicit empty map. Object instances whose residence is unknown
  are listed but never plotted at zero.

## Verification and remaining coverage

The decoder tests signed coordinates, polygon references, colour conversion,
truncation, surface height construction, source pin failures, reproducibility,
and the recovered census. Browser contract tests reject duplicate IDs, missing
references, contradictory slot accounting and inconsistent place membership.
The triangulation test traverses every exposed face, including repeated-corner
triangular roof records and concave faces.

Desktop end-to-end tests cover direct access without loading Targ, search/filter
navigation, Back, orbit/zoom/reset, wireframe, visual variants, structure/interior
links, the Eris placement map, unknown bodies, unknown records and unavailable or
incompatible datasets. A storage sentinel remains unchanged. Targ save/resume
keys are also seeded and checked byte-for-byte so direct catalogue access cannot
alter an existing session or save.

Representative inspection uses the DART II model, the Capital Spaceport structure
at cell `$87`, building detail 88, `KEY- V.I.P. LIMO` in resident slot 183, and
the V.I.P. LIMO in resident slot 5. The limo's recovered world coordinates place
it outside the named Spaceport cell, and the catalogue preserves its raw zero
heading byte without claiming a decoded world orientation. The on-foot and boarded
captures establish that boarding occurred while its key was held; they do not by
themselves isolate the key-check instruction. See the
[V.I.P. LIMO findings](damocles-vip-limo.md).
The original first-world and
`interior-window-ram-20260818T172346Z-e3772e4d` captures establish the spaceport's
exterior/interior correspondence. The latter records interior pointer `$0303D6`
and palette pointer `$00D54C`. Shape inspection and colour comparison remain
bounded: the catalogue does not reproduce the original camera, scene visibility,
attachments, or exterior seen through the interior's window. These are not
claimed as a completed pixel-fidelity gate.

Still unexplored or incomplete: other-body placement workspaces and named-place
lists, disk-load reachability beyond resident tables, remaining object residences/transforms,
view-conditioned object groups, articulated geometry, special primitives,
surface attachments/openings, and script-created visual changes. The recovery
ledger exposes this boundary; it does not declare the whole game's extraction
complete. Further research can replace unresolved records without changing their
identities or requiring a playable Damocles session.

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
