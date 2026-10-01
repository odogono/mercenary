# Blender workflows for editing geometry (#671)

**Question:** should canonical geometry JSON give way to a format that is easier to edit visually
in Blender? The two candidates are Blender-native `.blend` sources with a generated game binary,
and a canonical GLB edited through a small project-specific add-on.

**Verdict (spike):** both candidates meet every requirement in #671, but only through the add-on,
and they do it equally. The add-on and its contract make the workflow work, not the binary.
Without the add-on, Blender's ordinary glTF path fails the requirements outright. Between the two
candidates, **the canonical GLB (B) is the better canonical format.** It is an open, versioned
standard that the TypeScript side reads directly, any glTF viewer draws, and the writer emits
byte-stably. A `.blend` file is opaque, 0.5–1.3 MB per asset, and tied to Blender's release
cadence.

Neither candidate beats the current JSON on compressed size or load time. A replacement ADR
should therefore weigh a third arrangement the spike makes possible: **keep canonical JSON and
edit through the same add-on**, with GLB as an exchange or preview form. [ADR 0048](../adr/0048-store-each-damocles-model-as-its-own-catalogue-file.md)
stands until that choice is made.

**Owner direction (2026-10-01):** after review, JSON remains the way to go. The Blender add-on's
import and export are what make visual editing workable, so a future ADR would keep canonical JSON
and adopt the add-on workflow, rather than replace the format.

Recorded 2026-10-01 with Blender 5.2.2 LTS (hash `d13f752e3b9c`) and Bun 1.4.2. The commands are in
[research/blender-geometry-spike/README.md](../../research/blender-geometry-spike/README.md).
`run-all.sh` regenerates every number below from the tracked payload in about three minutes.
The evidence is in [`research/blender-geometry-spike/evidence/`](../../research/blender-geometry-spike/evidence/).
The live game, the Catalogue reader and the extractor are unchanged, and nothing in them imports
the spike.

## What was built

- **One logical contract for both candidates** (`web/src/geometrySpike/contract.ts`). It holds
  integer game-unit coordinates, polygon loops in source winding and start, explicit two-point
  lines with direction, and integer identities for every vertex, face and line. It also holds
  colours (Damocles colour word, night colour, day colour; Targ Ink), sidedness, source record,
  scene slots, closing repeats, Targ rotated inputs and Road Workspace endpoints. A Geometry
  Asset is split into **parts**: display variants, walking geometry, plan, attachments and glyphs
  for Damocles, and one wireframe for Targ.
- **An Asset Sidecar per asset.** It is the payload record with each part's geometry replaced
  by `{ "$mesh": id }`, and each geometry reference replaced by `{ "$ref": n }` into a reference
  table that names its target by identity. The geometry carries the SHA-256 of its canonical
  sidecar.
- **Baseline recovery and composition** (`baseline.ts`, `compose.ts`). They turn a payload record
  into a contract plus sidecar, and back into the identical record.
- **A Blender add-on** (`research/blender-geometry-spike/mercenary_geometry/`). It provides
  Import, Validate, Export Game Binary (`.mgeo`) and Export Canonical GLB. It also provides
  three small helpers: Snap to Game Units, Set Game Colour, and Mark/Clear Lines. Editing
  itself uses ordinary Blender tools. Both candidates use the same scene representation: one
  collection per asset, one mesh object per part, Blender faces with the source loop order, and
  identities in `mc_*` mesh attributes.
- **Candidate A**: the `.blend` is the source. MGEO is a minimal, documented, little-endian game
  binary that stores polygon loops rather than triangles (`mgeo.py`).
- **Candidate B**: the GLB is the source. Standard content is display only: one shared POSITION
  accessor, triangles per colour and sidedness, and lines. The `MERCENARY_geometry` extension
  holds the loops, identities, colours and runtime data (`glb.py`).
- **Loading adapters** (`adapter.ts`, `mgeo.ts`, `glb.ts`). They read either candidate,
  compose it with the sidecar and return the existing payload types. Damocles records go through
  the Catalogue's own `parseModelFile`.
- **Previews** go through the existing renderers. Targ: the composed record replaces its payload
  record in a real `World`, then `visible` and `projectFrame` project it to SVG. Damocles: the
  parsed Model goes into the catalogue's WebGL viewer, screenshotted in headless Chromium.
- **Review tools** (`diff.ts`): the semantic diff, and the three-way comparison of a fresh
  baseline against an edited asset.

## Fixtures and requirements

The seven fixtures from #671 are covered, with the Capital Spaceport's interior as its own asset
(eight assets in all).

| Acceptance criterion | Result | Evidence |
| --- | --- | --- |
| Both workflows runnable with recorded commands and Blender version | Yes | README, `run-all.sh` |
| Untouched import → save → reopen → export keeps coordinates, winding, boundaries, lines, coincident vertices, identities, colours and sidedness | **Both pass** on all eight assets: exact contract, byte-exact payload record. Each Blender step runs in its own process | [roundtrip-report](../../research/blender-geometry-spike/evidence/reports/roundtrip-report.md) |
| …beyond the fixtures | 1,713 of 1,766 Damocles Models round-trip exactly through Blender, including with Edit Mode entered and left on every part. The other 53 carry mesh fields the spike contract does not model and are refused, not dropped | [corpus-report](../../research/blender-geometry-spike/evidence/reports/corpus-report.md) |
| Real Blender edits: move a vertex, add/remove a face and a line, change colours | Yes, with ordinary operators, identical on both candidates | [edits-report](../../research/blender-geometry-spike/evidence/reports/edits-report.md) |
| Referenced-face edits preserve/remap bindings or fail actionably | Yes: rebuilt faces keep their record binding, positional references follow their face, and deletions are refused at every referencing site | below |
| Variants, attachments, display/walking, runtime geometry keep their meaning | Yes | below |
| Deterministic exports; malformed assets and broken references rejected | Yes: byte-identical across sessions and re-imports; readers refuse truncation, trailing bytes, foreign or stripped files | roundtrip-report, tests |
| Semantic diffs with before/after previews | Yes | [evidence/edits](../../research/blender-geometry-spike/evidence/edits/) |
| Fresh baseline leaves edited assets untouched; separates corrections from authored changes | Yes | [fresh-baseline-report](../../research/blender-geometry-spike/evidence/reports/fresh-baseline-report.md) |
| Comparison of editing, fidelity, reviewability, maintenance, size and load time | This document | |
| Mercenary III assessed without Damocles content | [Below](#mercenary-iii) | |
| Terminology in `CONTEXT.md`; ADR 0048 implications | Geometry Asset, Asset Sidecar, Recovered Baseline, Recovery Correction, Creative Change, Change Ledger; [below](#adr-0048) | |
| Production geometry and loading/extraction unchanged | Yes: spike-only modules, no production import | |

## Fidelity

### Ordinary Blender glTF, without the add-on

#671 asked for the standard path to be tested first. Two paths were measured by position against
the contract. S1 is the canonical GLB through stock import and stock export. S2 is the add-on's
`.blend` through stock export and stock import.
[standard-report](../../research/blender-geometry-spike/evidence/reports/standard-report.md):

- **Polygon boundaries are lost.** Every polygon is triangulated: COFFIN's 7 faces return as 16
  triangles and the Spaceport's 465 as 942. The only "kept" polygons are the source's own
  triangles.
- **Vertex identity is lost.** Flat-shaded normals split vertices (COFFIN 12 → 30, Spaceport
  1,080 → 1,632). No identity attribute survives: Blender exports only `_`-prefixed point
  attributes, and never face or edge attributes.
- **Lines that lie on a face edge become indistinguishable from it.** ATROPOS ground's line runs
  along its quad's diagonal and comes back as a triangle edge (S2: 0 of 1 lines kept).
- **Runtime semantics are flattened.** Road Workspace endpoints become two ordinary vertices
  (20 → 22). Rotated inputs become static positions.
- **Records and scene slots are gone.** Per-face sidedness survives only as far as materials
  are split by it.
- **What does survive:** Targ wireframes as loose edges, coincident-but-distinct vertices where
  no normal split intervenes, and game colours. Colours survive only where the material carries
  them as custom properties (exported as glTF `extras`).
- Our reader refuses every stock export, naming what was lost, so a stock round trip cannot pass
  silently as a valid asset.
- A probe also found that the stock importer drops one face of an opposite-wound coincident pair.
  The corpus holds 1,186 faces that share a vertex set with another face.

A custom preservation approach is therefore required, and the `MERCENARY_geometry` extension
with the add-on is that approach. Its cost is listed under [maintenance](#tooling-maintenance).

### With the add-on

Blender holds what the contract needs once it is used carefully:

- **Coincident faces.** Faces with the same vertex set, in either winding, survive
  `from_pydata`, save, reopen and Edit Mode. `Mesh.validate()` would merge them, so the add-on
  never calls it. BMesh refuses to *create* a duplicate face, so a person cannot add one with F.
- **Repeated vertices.** A face that repeats a vertex is deleted by `validate()` and refused by
  BMesh. All six in the corpus are closing repeats (`[a … a]`), carried as a `closingRepeat` flag.
- **Lines on face edges.** Blender has one edge per vertex pair, so an explicit line on a face
  edge is that edge with a line identity. 139 corpus lines are like this.
- **Unused vertices** (118 corpus meshes) are kept as loose vertices.
- **Integer coordinates** are exact as float32 (all below 2²⁴). Export refuses fractional
  values and offers Snap to Game Units.
- **Axes.** Game (x, y, z) is shown as Blender (x, z, y): the catalogue viewer's mirror, so
  models read the same way round. Object transforms must stay identity.

## Editing steps

Once an asset is open, editing is **identical** for both candidates: the same objects, the same
attributes, the same ordinary tools.

| Step | A — `.blend` | B — canonical GLB |
| --- | --- | --- |
| Open | *File ▸ Open* the asset's `.blend` | *Sidebar ▸ Mercenary ▸ Import* the GLB. Never the stock glTF importer |
| Move a vertex | G, then Snap to Game Units after a free move | same |
| Remove a face | X ▸ Faces (X ▸ Only Faces leaves wire edges, which are refused until marked or deleted) | same |
| Add a face | Select its vertices, F. Blender chooses the winding from neighbouring faces; the diff reports it | same |
| Add a line | Select two vertices, F, then Set Game Colour (which marks the edge a line) | same |
| Remove a line | X ▸ Edges (this also deletes vertices only that line used; the diff names them), or Clear Lines on a face edge | same |
| Recolour | Material slot *Assign*, or Set Game Colour for a new colour word | same |
| Give a rebuilt face its record | *Set Attribute* `mc_record` = record + 1 | same |
| Save | Ctrl+S keeps the working state, including hidden parts and view | Export Canonical GLB; view state is not kept |
| Produce game data | Export Game Binary (`.mgeo`) | the GLB is the game data |
| Review | Export, then semantic diff; the `.blend` itself is opaque | semantic diff of GLB against GLB; any glTF viewer for a look |

Issues every editor meets, found by the scripted edits and kept as findings:

- Deselecting a face or edge in BMesh deselects its vertices. Scripts must only ever select.
- Delete ▸ Edges also deletes vertices that only the deleted line used. Damocles vertex lists are
  source records, so this shows in the diff as removed vertices.
- F after Delete ▸ Only Faces rebuilt the Spaceport's plan face with the opposite winding. The
  face's new identity is appended last in face order, and the diff says which removed face it
  stands in for.
- *Merge by Distance* would collapse coincident-but-distinct vertices. The add-on cannot prevent
  it, but the diff shows the removed vertex identities.

## References after topology edits

Geometry references live in the sidecar and name their target by identity:

- A **source record** is the Damocles `sourceIndex` that region queues, wall texts and detail
  selections bind. It is a record and not an array position.
- A **face identity** is used for the 18 positional `attachmentFace` references in the corpus.
  It is written back as a position on composition.
- A **Road Workspace slot** names one of a Targ surface cell's external endpoints.

| Edit | Result |
| --- | --- |
| Delete a plan face the region queues draw (Spaceport record 0) | Refused, naming every site, e.g. `structureSelection.regions[0].queue[20]: references source record 0 in plan, which no longer exists. Restore a primitive carrying it, or remap ref 20 in the sidecar to an existing target.` |
| Rebuild that face with F and set its record | Accepted; every queue still draws it |
| Remap the references in the sidecar to record 1 | Accepted; the composed queues name record 1 (test) |
| Delete an unreferenced attachment face before a referenced one | Positional references follow their faces (test) |
| Delete one palette variant's face for a record the detail selection names | Refused: a detail record must stay drawable in every palette variant the binding structure may choose |
| Give a Targ surface cell more than 60 local vertices | Refused: indices 60–63 address the Road Workspace |

A reference that never resolved in the Recovered Baseline is a recovered fact, not a break, and
is not refused. An example is a record that a detail holds but never draws.

## Variants, attachments, display and walking, runtime geometry

- **Variants are separate parts and nothing propagates between them.** Each is a separately
  evidenced form. In the Spaceport's combined variant, raising two vertices left five coincident
  vertices in five sibling parts where they were. The diff lists each one, so a reviewer decides
  whether to follow.
- **Walking geometry stays separate.** A display edit leaves `walk:*` parts and the sidecar's
  game bounds (`boxes`, `supportTop`, `extent`, `bounds`, `proximityBox`) unchanged, and the diff
  says so every time.
- **Entrance Attachments** are their own parts. Their Attachment Constructor and Proximity Box
  stay in the sidecar.
- **Runtime-dependent Targ geometry.** Dragging a rotated vertex is refused: its position is
  computed. Its input is changed through the `mc_input` attribute instead. Dragging a Road
  Workspace endpoint is refused too, because the road table places it. Both appear in Blender at
  the positions the `World` itself resolves.
- **Coordinate-placed metadata.** A Room's doorways are placed by coordinates, not identity. The
  sidecar records which frame vertices stood at each doorway, and the diff warns when they move
  away from the metadata (`room-move-doorway-frame`).

## Reviewability

The [edit evidence](../../research/blender-geometry-spike/evidence/edits/) holds, for each case,
the diagnostics from both candidates and a semantic diff such as:

```text
- vertex v6 moved (-60, 20, -10) → (-60, 30, -10)
- face f0: colour #ccaa88 ($654) → #664422 ($321)
- face f7 added: [v9 v3 v4 v10] #664422 ($321), last in face order — same boundary as removed f5, loop starts elsewhere
- face f5 removed: [v10 v9 v3 v4] #664422 ($321)
- line l0 added: v0–v3 #ccaa88 ($654)
```

Each case also has before/after previews from the existing renderers. Ground records are shown
clamped to their cell for display, because their strips run to ±32,767. The diff is semantic and
by identity, which a text diff of either binary cannot be. It also reads better than a text diff
of today's JSON, where removing one vertex renumbers every later index. Today's process trusts an
extraction "only after regenerating it and reading the diff". Under either candidate that step
becomes this tool.

## Fresh recovered baseline

`cli.ts baseline` recovers into its own directory. It refuses any directory that holds, or lies
inside, an asset with a ledger. `freshness.ts` edits the COFFIN, then simulates a re-extraction
with a payload that differs only in that Model. One change touches an element the asset never
edited, one matches an authored edit, and one conflicts with one. Result:

- **Recovery change** (v0): can be adopted as a deliberate edit; nothing was written.
- **Converged** (v6): the extractor now recovers what the asset authored, so the ledger entry
  can retire.
- **Conflict** (f0): adopted, fresh and edited values are all different.
- **Creative changes** (f5, f7), classified by the Change Ledger.
- **Unclassified** (l0): there is no ledger entry, so a review should refuse it. A Recovery
  Correction without cited evidence is reported the same way.
- Every file of the edited asset (`.blend`, `.glb`, ledger, sidecar, adopted baseline) is
  byte-identical after re-extraction. A fresh export of the `.blend` agrees with the asset's GLB.

## Size and load time

[measure-report](../../research/blender-geometry-spike/evidence/reports/measure-report.md),
summarised for the 1,713 Damocles Models the contract represents:

| | Raw | gzip -9 | Load to parsed Models |
| --- | --- | --- | --- |
| Payload JSON model files (today) | 38.9 MiB | **2.9 MiB** | **90 ms** |
| MGEO + sidecar | 34.1 MiB (geometry 5.3) | 3.7 MiB (geometry 1.3) | 306 ms |
| GLB + sidecar | 47.1 MiB (geometry 18.3) | 5.5 MiB (geometry 3.1) | 350 ms |
| `.blend` (fixtures only) | 487 KiB – 1.3 MiB each | 84–131 KiB each | not loadable by the game |

- **Geometry alone** is far smaller in binary: MGEO is 7× smaller than JSON raw. Decoding it is
  2–3× faster than parsing the JSON and reading the Model.
- **The sidecar outweighs that gain.** It is today's record minus its geometry, with a reference
  table, and both candidates must ship it.
- **Reaching the existing types costs more than it saves.** Composing back into the existing
  record, then through `parseModelFile`, makes load about 3.5× slower than today's JSON. Part of
  that is the spike's per-load sidecar hash and reference checks, which a production loader could
  do at build time.
- The `.blend` candidate would add at least 0.85 GB of sources for the corpus (at the smallest
  fixture's 487 KiB each). They are binary, and each is mostly Blender's own file overhead.

The sidecar is larger than it needs to be. Across the corpus it is 28.9 MiB: 13.1 MiB is the
reference table and 12.7 MiB the indented record. Each reference entry takes about 190 bytes,
where today's JSON stores a two-digit `"index"`. Most entries are redundant:

- Region-queue and detail references already name a source record that survives editing, so they
  could stay inline and be checked in place. Only the 18 positional `attachmentFace` references
  need rewriting.
- `site` can be derived from where the reference sits.
- `baselineResolved` is needed only for references that never resolved.

Minified, the record alone falls to 4.8 MiB. A slimmer sidecar would narrow the binary
candidates' size and load gap; this is estimated, not measured. It would not change the verdict.

As #671 anticipated, binary is not a reason to choose either candidate.
[ADR 0048](../adr/0048-store-each-damocles-model-as-its-own-catalogue-file.md)'s point that gzip
already delivers most of the saving holds.

## Tooling maintenance

| | A — `.blend` + MGEO | B — canonical GLB |
| --- | --- | --- |
| Project code to keep | Add-on (scene representation, validation, helpers); MGEO writer and TS reader | Add-on (same); GLB writer with extension and TS reader |
| Blender coupling | **High.** The canonical source is a Blender file. Old Blender versions do not reliably open newer files, CI needs Blender to read sources, and a behaviour change in a Blender release (attribute domains, BMesh rules, validate defaults) reaches the source of truth | **Lower.** Blender is an editor only. CI reads GLB with plain TS/Python. A Blender change can break import/export, but not the stored assets |
| Format risk | MGEO is the spike's own format; it is small and documented beside its writer | glTF 2.0 is a ratified standard. The extension is private (unregistered `MERCENARY_` prefix), so third-party tools preserve display but not loops or identities |
| Misuse failure | Saving a `.blend` from a Blender without the add-on keeps the attributes; exporting without it is impossible | The stock glTF importer/exporter silently loses the contract. The reader refuses the result, so the loss is loud, not silent |
| Tests without Blender | Python writer and TS reader only; the `.blend` cannot be checked | Everything except the edit itself |
| Packaging | As a Blender extension, the add-on needs a declared licence. This spike installs it as a legacy add-on, so the licence is the owner's decision | same |

Measured spike code: about 1,600 lines of Python add-on and formats, 800 lines of Blender drivers
and Python tests, and 4,000 lines of TypeScript (contract, baseline, composition, readers, diff,
tools, tests). Most of it is shared
by both candidates. A production version would also need the 53 unmodelled Models' fields and the
Mercenary III additions below.

## Mercenary III

Mercenary III's geometry was assessed against its researched records: the I1 `/dion` world
document and the [taxi projection](mercenary-iii-taxi-projection.md) and
[content and presentation](mercenary-iii-taxi-content-presentation.md) reports. No Mercenary III
payload pipeline was built and no Damocles content stands in for it.

| Mercenary III record | Fits the contract? | What it needs |
| --- | --- | --- |
| 25 models: vertices, `polygon` (colour index plus slot selectors `4k`, slot 0 the origin) and `line` primitives, provenance address per primitive | Mostly | Selectors map to vertex identity k − 1; the address is a natural source identity, like `record` |
| One face list drawn in **authored stream order**, polygons, lines and `text` interleaved, no depth sort | **No** | The contract keeps faces and lines in two lists, as Damocles stores them. Mercenary III needs one ordered primitive list or an order key, plus a placeholder for each in-stream text record |
| Viewer-selected **alternatives** (a box, then a face list) sharing one vertex stream | **No** | The contract gives each part its own vertices. Alternatives need face-list membership over shared vertices, not duplicated parts |
| Per-polygon cull ("clockwise-only", on/off per entry) | Partly | Maps to sidedness only if "cull off" is shown to equal double-sided |
| Colours as palette indices and `$80xx` words, resolved through the frame palette | Partly | The contract requires a resolved `#rrggbb` per primitive. Mercenary III records carry words only, so the colour model should take the source word, with display colour optional |
| Structures: a 2D plan, walls as point pairs with a **form** (0, 2–7) extruded between the record's heights, region queues naming walls **by position**, occupant hooks | **No, not as a mesh** | A plan-type part with 2D vertices, wall lines and form polygons carrying a per-primitive `form`, with heights in the sidecar. Positional queue references remap the way `attachmentFace` does |
| Details (primitives plus groups, supports, walls, extent), attachments, wall texts | Yes | The same shape as Damocles detail and attachments |
| Grounds with 2D vertices, glyphs | Yes | Planar vertices with y = 0, glyph parts |

The spike's mechanisms carry over: identities in attributes, references in the sidecar, refusal
of broken references, and the semantic diff. The contract would need three generalisations before
Mercenary III could use it: an ordered primitive stream, face lists over shared vertices, and
open per-primitive integer attributes (form, cull, flags). These are format-independent, so they
do not favour either candidate.

## ADR 0048

[ADR 0048](../adr/0048-store-each-damocles-model-as-its-own-catalogue-file.md) chose indented,
key-sorted JSON, one file per Model. It rejected binary geometry because binary "breaks the
regenerate-and-diff step, the tests' JSON loaders and the hand-written parser". This spike neither
selects a format nor supersedes the ADR. A replacement ADR would have to settle the following.

- **Regenerate-and-diff becomes a semantic diff.** Review moves from `git diff` to
  `cli.ts diff`/`compare`. That is a better review of geometry, but the tool must exist wherever
  review happens.
- **One Model becomes two files**: geometry and sidecar, linked by the sidecar's hash. This is in
  addition to ADR 0048's own model-file source check against the shared document. The sidecar
  would need to be a smaller form than the spike's verbose one.
- **The shared document is unaffected.** The model index, the per-Body Model lists, storey
  heights and support tops stay in `catalogue.json`. So do ADR 0048's rule that a missing Model
  leaves its Instances undrawn, and its batching of reads.
- **Payload route and schema version.** The dev server's route admits `.json` only and would
  need the new extension. The layout change would move `schemaVersion`.
- **Extraction must stop overwriting edited geometry**, and needs a home for Recovered Baselines
  and a Change Ledger beside the assets.
- **Tests' JSON loaders** would read through the adapters, as `measure.ts` and the spike tests
  already do.

If the decision is to keep JSON canonical and edit through the add-on, most of ADR 0048 stands
unchanged. Only the extractor's overwrite and the ledger would need new decisions.

## Gaps and limits

- 53 Damocles Models carry mesh fields the spike contract does not model: `alternates` (26),
  `texts` (16), `articulation` (11). They are refused, not dropped. Each references geometry and
  would need its own reference kind.
- Face order is preserved, and new faces are appended last. Draw order cannot be *changed* with
  ordinary tools, and Damocles display variants and Mercenary III depend on it.
- Plan, attachment and detail faces drawn only through queues are not drawn by the game until a
  queue names them. Adding one requires a sidecar edit, which the diff shows but the add-on does
  not offer.
- Rotated inputs edited through `mc_input` keep a stale display position until re-baselined.
- Load-time figures come from Bun's JavaScriptCore in one process; browser numbers will differ.
- The scripted edits run Blender headless. The operators are the ones the UI binds, but nobody
  did the edits by hand in this session.

## Next steps

1. Owner direction: keep JSON canonical and edit through the add-on (above). Of the other two
   arrangements, canonical GLB + add-on was the spike's pick between the candidates, and `.blend` +
   MGEO is not recommended.
2. Slim the sidecar as described under size and load time. Generalise the contract for the three Mercenary III needs and the 53
   unmodelled Models. Then decide where Recovered Baselines and Change Ledgers live, and stop the
   extractor overwriting edited geometry.
3. Record the choice in an ADR that supersedes or amends ADR 0048.
