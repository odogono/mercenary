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
  --output payload/damocles/catalogue.json
cd web
bun run dev
```

Open `http://127.0.0.1:5173/catalogue`, or follow **Damocles catalogue** from the
game menu. `?model=object-035d12` opens DART II;
`?instance=eris-surface-87` opens the Capital Spaceport placement;
`?instance=vesta-surface-64` opens Vesta Parliament;
`?instance=gaea-ur-city-surface-24` opens the live UR City cell 4,2 overlay;
`?instance=dion-surface-32` opens the live Dion cell 2,3 overlay;
`?instance=object-slot-5` opens the V.I.P. LIMO outside the Spaceport.

The extractor first verifies the run's artifact hashes, program/TOS pins, and
first-world scenario hash. It uses the standard library only. A missing capture
can be regenerated with the existing `lab observe --scenario
research/damocles-st/scenarios/first-world.json` command. Raw images, RAM and
Working Disassembly stay in ignored research paths; the browser receives only
the separately versioned catalogue JSON. Schema version 5 adds the per-cell
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

Schema 7 extends `structureSelection` with generic Entrance Attachment records:
raw control word, normalized constructor, runtime slot, closed mesh and scaled
Proximity Box. A closed mesh rises to the soffit spanning its rectangle, since
the constructors leave leaf Y words to the opening the leaves fill; openings
without a soffit fall back to the structure's lower wall band. Regions name their gate kind and resolved inset axis; `$0200`
remains an unconditional passage with no fictitious attachment. Each selector also carries
its original plan mesh, scaled region bounds (signed-word endpoint sentinels stay at
−32768/32767), raw flags, tagged ordered queue, and linked detail model/variant and X/Z
scales. Detail selectors retain two groups of ordered boxes and default face indices in raw
model coordinates. Unsupported or truncated selectors are omitted as a whole and explained
in the model reason. The census retains every selector the documented post-plan grammar
accepts (95 in the current first-world extract, including Structure 75 and its Structure 76
alias, and `$xxF0` constructor variants such as `$40F0`/`$42F0`/`$82F0`) and 44 detail selectors. The first detail group starts
on the next word boundary after the byte-sized face stream. Empty plan meshes are valid
when all queues are empty. The spaceport's combined inspection variants also carry
`walkMesh`, excluding the resident key from the authored walk fallback.

Eris document schema 2 uses `structureFallback` only when a selector is absent or no
region matches. The on-foot frame uses group 2 and region flags 15/14/12 for detail
visibility and component order, with per-face triangulation cached across selected lists.
This does not implement the surrounding resident-object stream or the polygon fill
routine's possible facing tests.

These extents are bounded by the next independently recognised data records:
object NULL metadata at `$035CE8`, the first surface metadata at `$00ED60`, and
the interior record preamble after `$026208`. The ground table is a 256-word
workspace index, not a relative-pointer bank. They remain **provisional table
extents**, rather than a proven census of every packed disk file. Title-screen
RAM has zero table bases. Two independent first-world loads and the occupied
Spaceport interior RAM share the same pointer tables and object record heads:
entering a building does not disk-load a replacement model bank. The Working
Authority Pasti STX is an RSY version-3 image (1031930 bytes, SHA-256
`8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef`). Printable
resident labels such as `DART II` are absent from that STX and from title-screen
RAM; they appear only after the title-to-world unpack that fills the `$04BD00`
base block (`$04BD0C=$00E900`, `$04BD10=$035700`, `$04BD22=$026000`). Track
payload remains packed. The UI displays that
qualification for each table. Every slot maps to one model identity; repeated
pointers share a model and retain all slot indices. No pointer scan is
represented as a model census.

Current extraction accounts for **674 unique records**: **198 decoded**,
**467 partial**, and **9 unresolved**. “Decoded” means the supported record was
parsed completely; it does not mean every model has received a human fidelity
review. Partial records expose recovered geometry and explain omitted features.
Unresolved records remain searchable and retain their source identity and reason.
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
| Object geometry     | `$035700` | 378            | Relative 32-bit pointers, including shared forms and extra templates                                                                    |
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
  flat with X along Z. A `$80..$98` token names a live `$CCA0` workspace string
  (DOOR KEY A `$87`, EXPLOSIVE-ARMED! `$88`, AUTHORS COMPUTER `$8C`); the two
  pinned captures differ at `$8C`, so token lettering is a named `liveText` gap
  and only authored literal text (for example `LAND X` on Objects 352–355, the
  LOTTERY TICKET digits) is baked into glyph geometry.
- Some `$8001` headers control instance orientation; their neutral local geometry
  is decoded without baking in a particular instance heading. A mode byte with
  bit 7 set (`$053572`) is articulation: an axis byte, a pivot X word and pivot
  Y/Z words follow, and at `$0537B0` every vertex with a negative Y is
  complemented and rotated about that pivot by the global angle at `$7888`. The
  catalogue shows the rest pose (angle zero) and keeps the record partial with
  the `articulated` omission (six objects, for example WASHING MACHINE and
  NOVABOMB). Supported name/far-marker headers do not change local vertices.
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
  records. Details 6, 7, 8 and 68 decode this way and keep the `articulated`
  omission. Detail 69's faces reference projected slots 56–63 beyond its 55
  vertices, so it stays unresolved with that reason.
- Object names are the 16 printable bytes preceding the model pointer. Printable
  labels are source-verified names, not verification of gameplay interpretation.
- Building-detail selection at `$053AA6` uses `$04BD22` → `$026000`. Interior vertex
  triples are followed directly by face records, without the object's visibility
  header. Drawing every face for free inspection does not reproduce the
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
  Objects 333–338 use scene colours but are not placed by any decoded
  workspace, so they are shown with palette 0 as a named `paletteBinding` gap.
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
  An immediate plan terminator and wall-list zero word is an empty placeholder,
  not a failed decode: Structure 100 (`structure-01a618`) and its linked
  building detail 1 (`$02620E`, `$8000` vertex terminator) are accounted that
  way. See [Structure 100](damocles-eris-structure-01a618.md).
- Negative structure headers select an alias, scales, palette and interior.
  Alias indirection which the decoder cannot resolve remains unresolved. Authored
  surface attachments/openings after the basic wall list are not silently omitted
  from a “decoded” result: their presence makes the model partial. `$40F0` and
  `$82F0` use the same 26-byte constructors as `$4000`/`$8200` when `$7AFB` is
  zero (pinned first-world); the live `$7AFB≠0` predicate remains unresolved.

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
  as the grey apron. `$F0`/`$F4` are preprojected runtime horizon slots, not
  neighboring-cell model vertices; their camera-dependent points are omitted
  while the remaining local polygon is kept. `$C00E` is a two-point edge in
  the same colour family. `$7000` aligns the source address, reads X/Z plus an
  object-table byte offset, applies the cell orientation, and composes that
  address-based model. `$53F76` is a separate runtime vector-text path, not the
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
  structure and object placements**. Ninety recovered ground/pad/road instances
  bring the Eris map to **174** plotted locations.
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
links, the Eris placement map, the Gaea Birmingham Island map around 99 CHEVY,
unknown bodies, unknown records and unavailable or
incompatible datasets. A storage sentinel remains unchanged. Targ save/resume
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

Still unexplored or incomplete: packed Pasti STX track payload, live
`$ABDC` workspaces other than Eris first-world, Vesta Politburo City, Gaea UR City and Dion, Gaea islands other than Birmingham and UR City, remaining
named-place lists, remaining object residences/transforms, live articulation
angles (rest pose only), Building detail 69's extra projected slots, object text
through live `$CCA0` tokens, indirect text pointers and font 4, the palette
binding of unplaced objects 333–338, post-plan attachment forms other than the
documented zero-latch and `$F0` constructors,
the separate native surface/background fill path, and script-created visual
changes. The remaining nine unresolved records are NULL, five empty surface
records, two empty building details and Building detail 69. Resident model banks do not change between first-world and occupied-Spaceport RAM.
The recovery ledger exposes this boundary; it does not declare the whole game's extraction
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
