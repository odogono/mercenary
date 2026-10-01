# Dion Catalogue data contract

This contract lets recovery, export and browser inspection of the whole Mercenary III world proceed independently ([#679](https://github.com/odogono/mercenary/issues/679)). It defines identities, the export documents, the sessionless route, and the rule that decides when coverage is complete. [ADR 0061](adr/0061-admit-a-sessionless-dion-catalogue-under-the-dion-path.md) records the decision. The machine-readable half is the coverage ledger, [`research/mercenary-iii-st/catalogue-ledger.json`](../research/mercenary-iii-st/catalogue-ledger.json).

Every fact comes from the pinned **Mercenary III research baseline**, under ADR 0002 and ADR 0043. Damocles data is not evidence for a Dion record, even where a name, slot or format matches. Original media, RAM and comparison captures stay ignored under `restricted/`.

## Inputs

The [#678](https://github.com/odogono/mercenary/issues/678) census is the inventory. The ledger is generated from its run, `location-census-334983y7`, and reconciled with [Dion object locations](dion-object-locations.md) and [Dion structure locations](dion-structure-locations.md):

| Census item | Count | Ledger section |
| --- | ---: | --- |
| Persistent object slots 1–246 | 246: 180 indoor, 38 surface, 25 out-of-world, 3 carried | `objects`, `carriedStack` |
| Authored groups | 57 | `groups` |
| Distinct nonzero authored cell bindings | 795, or 794 initially | `bindings` |
| Selected structure slots | 198 | `structureSlots` |
| Floor geometry slots, Floor 0 included | 78 | `structureSlots[].floors` |
| Bodies and island placements | 31 and 63 | `bodies` |
| Place labels | 172 | `places` |

Slot 0, the current structure, and slots 247–255, the cell-bound template working slots, are not objects. They are accounted for in `workingSlots`. Street furniture is identified with ground records (#682).

## Identities

There are three kinds of name, and none is parsed to recover another.

- **Original references** are the game's own numbers: object slot, group, cell byte, structure slot, Floor index, Body offset and source address. Records carry them as separate fields, such as `group`, `cell` and `slot`. The census documents' `2:03` notation is for humans only.
- **App IDs** name Catalogue records. They are stable, lower-case and derived once by the exporter. A consumer looks them up and never splits them.
- **Geometry Identities** name shared geometry: one record family plus that record's source address in the pinned image, as `<family>-<6 hex digits>`. The ID never contains a name, so renaming or reinterpreting a model leaves it valid.

| Record | App ID | Original reference fields |
| --- | --- | --- |
| Body | `body-04` (roster index, Body offset ÷ 4) | `offset`, `name` |
| Island placement | `island-04-00` (Body, descriptor ordinal) | `group`, `origin`, `source` |
| Group (area) | `area-02` | `group`, `stream`, `area` |
| Named place | `place-02-03` | `group`, `cell`, `source` |
| Placement of a structure | `placement-02-03` | `group`, `cell`, `slot`, `key`, `dx`, `dz`, `source` |
| Structure slot | `slot-203` | `slot`, `record`, `alias` |
| Object | `object-038` | `slot` |
| Geometry | `model-02edd6`, `structure-011504`, `detail-029e60`, `island-0635c0`, `ground-01bff2` | `family`, `record` |
| Variant | `structure-011504@scale=-2,-2` | the variant axis and value |

Shared geometry is never a placement. Every COMPANIES HOUSE-type cell is its own `placement-*` naming `slot-203`. That slot's Floor Table binds `structure-011504` at Floor 0 and `structure-0116b8` above it, and those Geometry Identities are listed once. A place label names a place, and its structure's geometry gets no name from it.

## Record families and ownership

Each Geometry Identity has one owner. A structure geometry bound at Floor 0 anywhere belongs to #682, even if other slots bind it above Floor 0. A street-furniture model reaches the census only through a ground template, so it belongs to #682 as well; every other model belongs to #681.

| Family | What it covers | Decoder path | Original reader | Owner |
| --- | --- | --- | --- | --- |
| `model` | Object model-table records, including NULL-model handling and alternate forms | `m3lab.geometry.decode_model` | `$545AE..$549BA` | [#681](https://github.com/odogono/mercenary/issues/681); street furniture #682 |
| `structure` at Floor 0 | Surface structure plans, walls, attachments, regions | `m3lab.geometry.decode_structure` | `$5AD2C..$5B2D2` | [#682](https://github.com/odogono/mercenary/issues/682) |
| `detail` | Building details, lettering and live tokens | `m3lab.geometry.decode_detail` | `$54AEE..$54D20` | #682 |
| `ground` | Ground records, road pieces, street-furniture templates, keyed by the record a cell's ground word names | `m3lab.geometry.decode_ground` | `$561AE..$563C4` | #682 |
| `island` | Island records: draw lists and the Land/Sea boxes and edges | `m3lab.geometry.decode_island` | `$5761A..$5769E`, `$571A8..$574A8` | #682 |
| `structure` above Floor 0 | Floor geometry, interior details, resident association hooks | `m3lab.geometry.decode_structure`, `m3lab.census_locations.structure_floors` | `$560F4..$5612A`, `$56D1E..$56E5C` | [#683](https://github.com/odogono/mercenary/issues/683) |

The ledger lists 529 required identities: 190 object models, 38 street-furniture models, 74 structure geometries, 57 details, 153 ground records and 17 island records. The census retains 78 raw Floor selector IDs; 74 are authored geometry. Slot 46 is an eight-byte compact ground-only alias: its later census bytes belong to slot 47, not authored upper Floors. Its raw read remains in `censusFloors`/`nonFloorBytes`, with the original non-lift evidence. [#683's report](research/dion-interior-recovery.md) resolves that gap and recovers all 22 interior-only structure identities. #682 recovered the 317 surface identities; [its report](research/dion-surface-recovery.md) gives the evidence. #681 recovered the 190 object models: 155 that slots draw at the opening, 3 that run-time model-table writers bind into slots, and 32 driver heads that vehicles draw aboard. [Its report](research/dion-object-geometry.md) gives the evidence.

**Variants** are the same geometry under a recovered transform or state. Variant axes are `scale` (from a structure alias), `transform` (a ground orientation 0–7), `form` (an object's header- or viewer-selected face list), `state` (a door or the LOGOS construction) and `palette` (a scene palette, which is presentation only). A `variants` value of `null` means the axis is not inventoried yet, and `[]` means the identity has none. An object model's variants are `form=default` and `form=view-n` (its viewer-selected lists), prefixed by `state=…;` where a header selects between states: `intact`/`blown`, `lamp-lit`/`lamp-dark`, or `passenger`. A variant is previewed in its own right; one form never stands in for another.

## Export documents

[#684](https://github.com/odogono/mercenary/issues/684) writes the Catalogue under **`payload/dion/catalogue/`**, following ADR 0048's shape:

- `catalogue.json` is the shared document, with `kind: "dion-catalogue"`.
- `geometry/<geometry id>.json` holds one geometry record per file, with `kind: "dion-catalogue-geometry"`.

Both are indented, key-sorted JSON, at their own `schemaVersion` starting at 1.

**Header.** `source` carries `title: "dion"`, the pinned `programSha256`, the census `run` and `openingRamSha256`, and the SHA-256 of the ledger it was exported against. A geometry file repeats the shared document's `source`. A reader refuses any document whose title, program, schema, kind or source differs. Each refusal is a diagnostic that names the document path and the field, in the manner of `DionDocumentError`.

**Shared document sections.** Each record keeps its original reference fields beside its app ID, as listed above.

- `bodies`: `id`, `offset`, `name`, and `islands`, each with `id`, `group`, `origin`, `landColour` and a `geometry` ID.
- `areas`: one record per group, with `disposition` (see below), its islands, its area label or `null`, and authored and initial binding counts.
- `places`: `id`, `name`, `area`, `cell`, and `placement` or `null` for a label-only place.
- `placements`: the original fields, plus `body`, `bodyCell`, exact `origin`, the `slot-*` it selects, and `state`. The state is `present`, `initially-absent`, `storage` or `field-seed`.
- `structures`: one record per selected slot, with `alias`, `scale`, `palette`, `detail`, `pitch`, and `floors`. Each floor gives `floor` (0–10), `label` (`G`, `1`…`9`, `B`) and `geometry`, or `null` under a blocking gap. A Floor label is not a height. The arrival eye is Floor × pitch + 63. `floorBindings` resolves each Floor's geometry variant, palette and base height with provenance. A Floor inherits the host's scale and detail; zero alias palette selects the parallel per-Floor palette. `censusFloors` and `nonFloorBytes` retain a compact alias's census overread separately from authored Floors.
- `objects`: `slot`, `name` (or `null`), `residence`, and for a placed object `body`, `bodyCell`, `position` and `floor`. An indoor resident also has `host`, which is `{placement}` or `{field: "midas", cell}`. The ledger's `indoor` record supplies the original group/cell, structure slot, association, region/queue hooks, dormant hooks, world-relative local position, origin, Floor base and provenance. Association hooks order drawing; they never offset coordinates. Reachability remains separately `unverified`. Every object has `geometry` (its opening model ID, or `null` with `disposition: "null-model"`) and an optional `initialChange`. `forms` lists the further models the slot can draw, each with its `entry`, `geometry`, `role` (`model`, `driver-head`, `driver-head-profile`) and `writers`. `lettering` is the token text the slot's header writes, such as a DOOR KEY's letter. Carried and out-of-world objects have no coordinates. Their dummy positions are never exported.
- `field`, `constructions`: the MIDAS rule and the LOGOS states (below).
- `geometryIndex`: per identity, its `family`, `record`, `state`, `variants`, the original slots or indices that reach it, and the per-Body lists a consumer needs before reading any geometry file.
- `coverage` and `gaps`: copied from the ledger (below).

**A geometry file** holds `id`, `family`, `record`, `provenance` (half-open source ranges with SHA-256), and one entry per variant: its vertices, faces or primitives in authored order, and colours as palette indices or ST colours. The file is checked on arrival against its `geometryIndex` entry. Where geometry is unrecovered, the Catalogue draws nothing and shows the gap. It never invents a stand-in.

### Compatibility with the playable payload

The playable Metis Data Payload is unchanged. `/dion` still loads exactly `DION_DOCUMENTS` from `payload/dion/*.json` and checks that those six share one capture. It never reads `payload/dion/catalogue/`, and the Catalogue never reads the playable documents. The two can come from different runs, because the census and export captures differ. They must pin the same program image. Saves and Session Resume keep no Catalogue identity, and a Catalogue export changes no `contentSha256`. Promoting Catalogue content into play is later milestone work.

## MIDAS and LOGOS

**MIDAS is a rule, not a list.** Group 56 has one authored seed, `placement-56-00`, which selects slot 68. The original fills all 256 workspace cells with it and selects cells modulo 16. The Catalogue exports the rule:

- origin `1729, 938`, period 16, seed placement;
- the reference `56:HH`, where HH = (x mod 16) + 16(z mod 16);
- the Body cell ((1729 + x) mod 4096, (938 + z) mod 4096).

It never exports 256 placements, and `physicalCount` is `null`. A consumer makes an occurrence on demand for a Body cell: `field-56-<x>-<z>`. The two MIDAS residents, 101 and 118, are hosted by field cell `$69` at Body cell `2122, 3632`. Totals count the seed once.

**LOGOS has two inspection states.** `placement-08-32` selects slot 136 and starts `initially-absent`:

- `initial`: the opening overlay at `$057DA` clears the cell.
- `constructed`: the path `$515FC..$51694` removes the overlay and rebinds slot 136.

Inspection can show either state. It runs no campaign progression, and the state is never written anywhere. Initial totals exclude it, at 794.

**Group dispositions.** Every group has exactly one:

| Disposition | Groups |
| --- | --- |
| `settlement` | 28 groups |
| `bare-islands` | 0 |
| `outline-only` | 29–40, LUCAN's outlines |
| `label-only` | 54, CRONUS MUSEUM |
| `unused` | 1, 10, 13, 19, 25, 41–48, which share one empty record |
| `void-storage` | 49 |
| `repeating-field` | 56 |

VOID's two cells are listed, but they are not navigable.

## Route and link

- **`/dion/catalogue`** is a new browser document, `dion-catalogue`, and `/dion/catalogue/` redirects to it. It is sessionless. It starts no Gameplay Session, takes no session lock, and neither reads nor writes `mercenary.browser-shell.dion.*` Saves or Session Resume. It loads only `payload/dion/catalogue/`.
- **The link** is a CATALOGUE entry in Mercenary III's System Menu. It works the way Damocles's menu reaches `/catalogue`: leaving play keeps the Session Resume, and returning to `/dion` resumes it. `/catalogue` gains one cross-link to `/dion/catalogue` and otherwise stays the Damocles Catalogue, with no change in behaviour.
- **Navigation** works on app IDs. Selecting an object reaches its host placement, or MIDAS field cell, and its Body. Selecting a placement lists its residents by Floor. Search covers names, app IDs and original references, across every Body.
- **Previews** draw through ADR 0060's Authentic path (`web/src/dion/raster.ts`), from a title-neutral description, keeping MIII's palette rules. [#685](https://github.com/odogono/mercenary/issues/685) names any renderer capability it still needs from [#672](https://github.com/odogono/mercenary/issues/672). Recovery is not blocked on #672.

## Coverage and completion

The ledger is regenerated from the census run and validated without original captures:

```sh
cd research/mercenary-iii-st
python3 -m m3lab.catalogue_ledger --run <census run> \
  --surface <surface extraction> --comparisons <comparison results> \
  --objects <object extraction> --object-comparisons <object comparison results> \
  --interiors <interior extraction> --interior-comparisons <reader comparison results> \
  --interior-scenes <original interior scenes>
PYTHONPATH=.:tests python3 -m unittest tests.test_catalogue_ledger
```

The surface extraction and comparison results come from `m3lab.catalogue_surface` and `m3lab.surface_scenes` (#682), the object ones from `m3lab.catalogue_objects` and `m3lab.object_scenes` (#681). The interior extraction and comparisons come from `m3lab.catalogue_interiors`, `m3lab.interior_capture` and `m3lab.interior_scenes` (#683). All of them stay under `restricted/`.

`validate_ledger` recomputes every total from the records. It checks that each reference resolves, that every family has its decoder path, that MIDAS and LOGOS hold their rules, and that the stored `completion` is the rule's result. The tests also reconcile every object row, binding and structure slot with the generated census documents. `M3_CENSUS_RUN` with `M3_SURFACE`, `M3_OBJECTS` and `M3_INTERIORS` proves that the committed file regenerates byte for byte. The ledger also records each live or placement-bound lettering token's kind, and the original-scene comparisons that #686 builds on.

A Geometry Identity's `state` is one of:

- `pending`, which means its recovery is outstanding;
- `recovered`, decoded by its family's decoder path, with the content `sha256` its export must reproduce;
- `empty`, recovered with an evidenced absence of drawable geometry, such as road structure 146;
- `verified`, also compared with an original scene in #686.

An identity cannot leave `pending` while its family has no decoder path. Its `preview` records the evidence: the Catalogue draws it without a reported gap (#685), and the #686 matrix compares at least one identity per family and variant axis with an original-game scene.

**The milestone is complete only when every required identity is recovered and previewed, and no blocking gap remains.** Recovery tickets update `state`, `variants` and `preview`, and close the gaps they own: `island-decoder`, `ground-inventory`, `model-variants`, `detail-lettering`, `association-hooks`, `interior-details` and `floor-table-slot-46`. A closed gap moves to `resolvedGaps`, with its evidence. They never edit totals by hand. Required geometry that is still missing leaves the milestone incomplete. It is not waived.

## Export and loader handoff (#684)

Regenerate the tracked Catalogue from the three recovery handoffs and the committed ledger, from the repository root:

```sh
PYTHONPATH=research/mercenary-iii-st python3 -m m3lab.catalogue_export \
  --objects restricted/mercenary-iii-681/objects.json \
  --surface restricted/mercenary-iii-682/surface.json \
  --interiors restricted/mercenary-iii-683/interiors.json
PYTHONPATH=research/mercenary-iii-st python3 -m unittest discover \
  -s research/mercenary-iii-st/tests -p test_catalogue_export.py
cd web
bun test test/dion-catalogue.test.ts test/catalogue-stored.test.ts test/server-payload.test.ts
```

`--ledger` selects a ledger and `--out` selects a separate export directory; defaults are the committed ledger and `payload/dion/catalogue/`. The exporter checks the ledger, the complete set of identities, each child's handoff digest, overlapping geometry, and each recovered content digest before writing. A second run produces exactly the same bytes. It writes only the Catalogue directory and removes stale geometry files there. The tracked export can be checked by browser tests without the ignored recovery handoffs.

Each geometry file stores the **unchanged recovery record** under `geometry`. Its `sha256`, also held in `geometryIndex`, hashes the record without its own `sha256` using sorted, compact JSON with escaped Unicode. Browser admission recomputes that hash. The file header carries the title-local source; every source field must match the shared document. `geometryIndex[].dataVariants` names the actual stored variant keys. This differs from the binding variants for details: the decoder stores one unscaled `base`, while the ledger inventories the host scales separately. No scaled duplicate replaces the recovered record.

`surfaceCells` preserves all 11,264 recovered ground workspace cells, with Selected Piece, Drawn Record, orientation, joins and template entries; it does not count them as physical places or expand MIDAS into placements. `lettering`, `rebindings`, `services`, `workingSlots` and `carriedStack` preserve the recovery hooks. `placementRule` records the cell spacing derived from the evidenced interior origins and authored offsets. Placement `origin` is in the cell's local frame. Each Body's `geometry` list includes its islands, structure Floors and details, object forms, ground records and street-furniture models; the index carries the inverse `bodies` links. Carried and out-of-world models remain indexed for direct inspection even though no Body selects them.

The browser entry is `loadDionCatalogue(read)` in `web/src/dion/catalogue.ts`, where `read` is the same path-to-JSON transport accepted by Damocles's `readCatalogue`. It admits the shared document and returns a lazy `GeometryStore` with its `catalogue`. `get`, `peek`, `size` and `prefetch` are shared with Damocles through `web/src/payload/documentStore.ts`: requests in flight are shared, successful reads are retained, failed reads can retry, and prefetch runs at most 32 reads concurrently. Damocles retains its structure/detail admission rule. The schemas, baseline pins and cross-reference policies remain title-local.

The loader reconciles the census totals, unique identities, group/cell bindings, raw Floor dictionaries (including slot 46's explicit overread), indoor hosts, special states and Body dependency lists before reading geometry. Errors name the document and field or missing reference. The localhost server admits the additional `/payload/dion/catalogue/geometry/<geometry id>.json` path explicitly; other deeper paths remain refused. This handoff starts no Gameplay Session and imports no playable world loader. The Catalogue route and inspection UI still belong to #685, and preview/comparison completion still belongs to #686.
