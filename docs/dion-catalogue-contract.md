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

The ledger lists 530 required identities: 190 object models, 38 street-furniture models, 75 structure geometries, 57 details, 153 ground records and 17 island records. The 78 floor geometry slots resolve to 75 structure geometries. The other three are Floor Table bytes of slot 46 that name further alias slots 9, 240 and 252, and they stay unresolved under `floor-table-slot-46`. #682 recovered the 317 surface identities; [its report](research/dion-surface-recovery.md) gives the evidence. #681 recovered the 190 object models: 155 that slots draw at the opening, 3 that run-time model-table writers bind into slots, and 32 driver heads that vehicles draw aboard. [Its report](research/dion-object-geometry.md) gives the evidence.

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
- `structures`: one record per selected slot, with `alias`, `scale`, `palette`, `detail`, `pitch`, and `floors`. Each floor gives `floor` (0–10), `label` (`G`, `1`…`9`, `B`) and `geometry`, or `null` under a blocking gap. A Floor label is not a height. The arrival eye is Floor × pitch + 63.
- `objects`: `slot`, `name` (or `null`), `residence`, and for a placed object `body`, `bodyCell`, `position` and `floor`. An indoor resident also has `host`, which is `{placement}` or `{field: "midas", cell}`. Every object has `geometry` (its opening model ID, or `null` with `disposition: "null-model"`) and an optional `initialChange`. `forms` lists the further models the slot can draw, each with its `entry`, `geometry`, `role` (`model`, `driver-head`, `driver-head-profile`) and `writers`. `lettering` is the token text the slot's header writes, such as a DOOR KEY's letter. Carried and out-of-world objects have no coordinates. Their dummy positions are never exported.
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
  --objects <object extraction> --object-comparisons <object comparison results>
PYTHONPATH=.:tests python3 -m unittest tests.test_catalogue_ledger
```

The surface extraction and comparison results come from `m3lab.catalogue_surface` and `m3lab.surface_scenes` (#682), the object ones from `m3lab.catalogue_objects` and `m3lab.object_scenes` (#681). All of them stay under `restricted/`.

`validate_ledger` recomputes every total from the records. It checks that each reference resolves, that every family has its decoder path, that MIDAS and LOGOS hold their rules, and that the stored `completion` is the rule's result. The tests also reconcile every object row, binding and structure slot with the generated census documents. `M3_CENSUS_RUN` with `M3_SURFACE` and `M3_OBJECTS` proves that the committed file regenerates byte for byte. The ledger also records each live or placement-bound lettering token's kind, and the original-scene comparisons that #686 builds on.

A Geometry Identity's `state` is one of:

- `pending`, which is the state of all of them now;
- `recovered`, decoded by its family's decoder path, with the content `sha256` its export must reproduce;
- `empty`, recovered with an evidenced absence of drawable geometry, such as road structure 146;
- `verified`, also compared with an original scene in #686.

An identity cannot leave `pending` while its family has no decoder path. Its `preview` records the evidence: the Catalogue draws it without a reported gap (#685), and the #686 matrix compares at least one identity per family and variant axis with an original-game scene.

**The milestone is complete only when every required identity is recovered and previewed, and no blocking gap remains.** Recovery tickets update `state`, `variants` and `preview`, and close the gaps they own: `island-decoder`, `ground-inventory`, `model-variants`, `detail-lettering`, `association-hooks`, `interior-details` and `floor-table-slot-46`. A closed gap moves to `resolvedGaps`, with its evidence. They never edit totals by hand. Required geometry that is still missing leaves the milestone incomplete. It is not waived.
