# Bounded TOURCRAFT playable content

The production browser loads `payload/dion/tourcraft/` with `loadTourcraftContent` and runs `TourcraftSession`. The older D1 payload remains an independent dependency and research/test fixture. [The Dion map](agents/dion.md) names current runtime owners and the payload-update recipe.

The export boundary began in [I3 / #710](https://github.com/odogono/mercenary/issues/710) under [ADR 0065](adr/0065-promote-bounded-dion-catalogue-content-through-an-explicit-export.md). [ADR 0075](adr/0075-port-dion-object-interaction-by-rule-not-by-admitted-object.md) adds every resident record and rule-based interaction; [ADR 0076](adr/0076-share-head-commands-through-title-open-tables.md) shares Head Commands; [ADR 0077](adr/0077-share-one-enhanced-planner-across-damocles-and-mercenary-iii.md) shares Enhanced planning. [ADR 0073](adr/0073-drop-pre-release-prototype-save-migration.md) refuses incompatible prototype Saves rather than migrating them.

The [manifest](../payload/dion/tourcraft/manifest.json) is the document inventory; `loadTourcraftContent` is the field schema. Compute current identity with `bun run dion:identity` in `web/`. The Save codec’s `TOURCRAFT_SAVE_SCHEMA_VERSION` is authoritative. I3 comparison results below are dated evidence of the original export, not current runtime acceptance.

## Selection and sources

The research specification `research/mercenary-iii-st/tourcraft-promotion-manifest.json` is an export input, distinct from the served promotion and manifest. The export checks selected records/forms, source ranges and original model/structure references. It writes the historical D1 dependencies, promotion, geometry, presentation and manifest documents enumerated by the manifest. Geometry includes Catalogue identities and the independently recovered System tail. Eight of the Catalogue identities are not in the reviewed manifest: they are the opening models of residents of METIS and TOLOSA and of the carried objects, which the export binds automatically (`residentModels`, [ADR 0075](adr/0075-port-dion-object-interaction-by-rule-not-by-admitted-object.md)). Each is checked against its Catalogue record digest and its source ranges in the gameplay RAM. Selection covers 39 exterior placements, 18 structure slots, all 512 cells in groups 3/23, 385 glyphs, 13 full palettes and ten lettering tokens. Empty cells retain their recovered workspace bindings; no substitute silhouette is authored.

`promotion.json` enumerates Floor-zero bindings, transforms, variants, templates, residents, service scope and dependency/source inventories. Drawing availability does not confer service or script availability. Take and Drop are the exception: they apply to every object, by the original rules ([ADR 0075](adr/0075-port-dion-object-interaction-by-rule-not-by-admitted-object.md)). The admitted service remains the bounded outward TOURCRAFT/pilot path; Bil, interiors, onward services, hostile encounter alternatives and universal boarding stay outside the selected interaction scope.

The mutable source is the fresh `exact2/start.ram` first-loop-top capture, SHA-256 `71b957b3b7124959b01bd40b896c921d37902c18cfca042bef1906b155ef0170`. It supplies opening state, all 246 resident records (the reviewed 17 keep their record pins), each object's sixteen-character label, the Carried Stack's capacity, store and scroll, flags, VM/campaign inputs, model selections, body phases, live strings and animation cursors. Immutable Catalogue records retain the census/workspace source identities and individually selected record/range digests. Historical D1 records retain their historical capture and are immutable dependencies; their incidental opening is not the expanded initial state.

D1 can advance independently: when its current document no longer matches R7's exact file pin, regeneration reads the retained historical document in `payload/dion/tourcraft/` and verifies that same pin. The later road-grid recovery is an additive schema-1 field outside R7's selection; the historical world may omit it, while supplied road records remain strictly validated. Export checks the selected group record without that unselected road grid, preserving the reviewed playable bytes and identity.

All sources pin the same Mercenary III program `4e8b74122910bcaa109b944eebb6f0ec18fdeb1175c34eea3c932d0e1b18b62c`. The gameplay source also pins EmuTOS `154803e3ff4851f3dc358b91b16d6b6110d187a81d8132ecb665af49878939d5` and Hatari `05723606c75a1f0642395974abdce2cbbe48b0a09a747f65cdfca7ef9201e11a`. Whole Catalogue export/ledger hashes are input audit references, excluded from served metadata. An unrelated Catalogue record, font or export timestamp therefore cannot change play identity. Selected source pins and decoded records can.

## Payload files

`loadTourcraftContent` in `web/src/dion/tourcraftContent.ts` validates every field it reads, so its checks are the full schema; this table gives each file's top-level fields.

| File in `payload/dion/tourcraft/` | Top-level fields | Read by |
| --- | --- | --- |
| `manifest.json` | `title`, `destination`, `kind`, `programSha256`, `mutableSource`, `sources`, `playableDocuments` (ordered paths and hashes) | `loadTourcraftContent` |
| `world`, `panel`, `messages`, `scripts`, `sound`, `service` `.json` | the historical D1 documents, byte-identical to their R7 pins | `readDionContent` in `web/src/dion/content.ts` |
| `promotion.json` | `scope`, `sources`, `groups`, `surfaceCells`, `structures`, `placements`, `bodyPlacements`, `residents`, `residentModels`, `services`, `geometry`, `legacyModels`, `skyBodies`, `skyDrawLists`, `spaceScan`, `renderSupportSelection`, `reachableScriptEntries`, and the disposition and closure inventories | `loadTourcraftContent` |
| `geometry/<family>-<address>.json` | `geometry`: one Geometry Identity's forms; `<family>` is `detail`, `ground`, `island`, `model`, `sky-tail` or `structure` | `loadTourcraftContent` |
| `presentation/gameplay.json` | `initial`, `modelBindings`, `modelBindingSources`, `blinkPhase` | `loadTourcraftContent` |
| `presentation/programmes.json` | `entries`, `scripts`, `poll`, `playback`, `faceSequences`, `headSequences`, `encounter`, `collisionTone`, `sharedReturn` | `loadTourcraftContent` |
| `presentation/head.json` | `openTable`, `documents`, `art`, `strips`, `itemField`, `switchField`, `locationLabels`, `random`, `fruitReels` | `loadTourcraftContent` (`readDionHead`) |
| `presentation/support.json` | `bodies`, `groups`, `palettes`, `framePalette`, `modelColours`, `glyphs`, `tokens`, `drawPriority`, `rotationTable` | `loadTourcraftContent` |
| `presentation/system.json` | `bodies`, `drawLists`, `spacePalette`, `spaceScan`, `sine` | `loadTourcraftContent` |
| `presentation/craft.json` | `parameters`, `tables` | `loadTourcraftContent` |
| `presentation/taxi.json` | `title`, `destination`, `programSha256`, `values`, `coverage` | `readDionContent` |

Every document also carries `schemaVersion`. All but `taxi.json` carry `kind`, and all but `manifest.json`, `promotion.json` and `taxi.json` carry `source`; those two carry `sources` instead.

## Admission and identity

The loader fetches and verifies every enumerated document before returning content. It hashes the exact UTF-8 served text and parses that same text; a transport's separately parsed value is not trusted. It rejects wrong Title/program/kind/schema/source/capture, changed bytes, duplicate/escaping/unknown paths, missing or misordered documents, invalid forms and unresolved bindings. It validates placement/Floor/palette/glyph/template closure, original model bindings and complete initial resident records, programme entry/call/branch/message dependencies, face/head sequences, trajectories, collision-tone registers, System membership and arithmetic tables. Both exterior world adapters and the opening adapter are constructed during admission to expose malformed nested dependencies before any Gameplay Session exists. There is no runtime Catalogue fetch.

`contentSha256` hashes the following concatenation with SHA-256:

1. ASCII domain `dion-play-content-v1` followed by one NUL byte.
2. For each document: unsigned 32-bit big-endian UTF-8 path byte length, path bytes, unsigned 64-bit big-endian document byte length, exact document bytes.
3. Document order: `world`, `panel`, `messages`, `scripts`, `sound`, `service`; `promotion`; geometry paths sorted by byte order; presentation paths sorted by byte order; `manifest` last. Paths include `/payload/dion/tourcraft/`.

The manifest contains the ordered document hashes and has no self-referential `contentSha256` field. It is included exactly as served. Python and browser golden fixtures agree: records `('a','bc'),('d','e')` produce `adfbc36f7a52dbc748b6832a1c449671d1513fe055dbd799cd15a265f91b9565`. Selected-record pins use sorted compact ASCII-escaped JSON, also covered by a Unicode cross-language fixture. The identity is derived from the served bytes; use the identity command above.

## I3 rendering and reuse dispositions (historical)

| Mechanism                          | Disposition and Dion evidence                                                                                                                                                                                                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frame planning/raster/presentation | Existing `dion/frame.ts`, Frame Description, Authentic renderer, projection, lettering and palette allocation. No second renderer.                                                                                                                                                          |
| Pitched/rolled geometry            | Dion general camera implements R7's own half-step V matrix. Old D1 level-camera behavior remains the default.                                                                                                                                                                               |
| Sky rotation/phase                 | Reuse Damocles `celestialRotation`/`phaseOf` with Dion System centres, phases, memberships and colours. No Damocles moving-comet rule.                                                                                                                                                      |
| Star bands/roll                    | Reuse Damocles `starPixels`/`rollTangent`; pass Dion's 1,600-star field, colours, scale/offsets, routine, clipping and view.                                                                                                                                                                |
| Craft arithmetic                   | Supply separately recovered Dion exp/sine/arctan/octant tables through `CraftArithmetic` to `rollTangent`. Its `craftDivide` uses the existing regenerated `craftLog` rule checked in R6. Exported original log tables are validated I4 dependencies; flight control and scheduling are I4. |
| Sky Bodies/tail                    | Dion composition uses its own draw lists/range scan, packed sizes, phase colours, space palette and recovered tail; emits shared primitives.                                                                                                                                                |
| Ground/islands/TOLOSA              | Existing Coast helpers and Dion structure/detail/ground readers; exact selected workspace and Body/group bindings.                                                                                                                                                                          |
| Cabin/pilot/OBSERVER               | Existing Dion model grammar, viewer boxes and passenger scale; real head 279/profile 280, live articulated angle and selected passive model 320.                                                                                                                                            |
| Tokens/beacons                     | Pure model adaptation shared by Catalogue and play; play preserves original colour indices and mutable tokens. `$8002` writes the numbered slot digit. Both beacon forms follow phase/state gates, with the recovered lit far point.                                                        |
| Programmes/sound                   | Retain D1 script/message/sound records and export the six TOURCRAFT routines and the pickup-response graph, control stream, animation sequences, collision programme and passive trajectories. Execution, sound tick ownership and restoration belong to I4.                                                                   |
| Storage                            | Existing shell/Title storage contracts; Catalogue remains sessionless. No new Save writer or migration.                                                                                                                                                                                     |

The consequential shared numeric boundary is recorded in [ADR 0067](adr/0067-share-numeric-sky-helpers-with-dion-owned-presentation-data.md).

## Reproduction and comparison evidence

Original RAM/media/screenshots remain under ignored `restricted/` paths under ADR 0002. With R7 evidence available there, regenerate from the repo root:

```sh
PYTHONPATH=research/mercenary-iii-st python3 -m m3lab.tourcraft_export --opening restricted/mercenary-iii-708/presentation/exact2/start.ram
```

The I3 delivery’s two builds reproduced every then-checked-in byte and its identity. The export does not modify Catalogue or historical D1 files. Export tests also change unselected Catalogue objects/glyphs and prove identical selected output; changed selected records and decoded placement strings are refused.

From `web/`, regenerate the 30 comparison sheets and assert the complete output ledger:

```sh
bun tools/dion-tourcraft-compare.ts ../restricted/mercenary-iii-708 ../restricted/mercenary-iii-710 ../research/mercenary-iii-st/tourcraft-play-comparison.json
```

The tool pins whole RAM and scene metadata, reads live view/colours/residents/face outputs/beacon gates from those captures, and uses only admitted playable geometry. It reconstructs the original drawn buffer from the full `$42C00` longword, original bitplanes/palette and the selected surface/space branch. Each sheet is `original | planner | magenta difference`; the tracked numeric/hash ledger contains no image or RAM. A second complete run reproduces indexed pixels, RGBA, sheets and ledger exactly. Every fixture reports no required coverage gap.

| Required checkpoint                    | ST gun-depth pixel agreement |
| -------------------------------------- | ---------------------------: |
| Pre-board / aboard                     |              94.82% / 94.80% |
| Launch `v24500`                        |                       98.62% |
| Space `v25000..v28000`                 |                 97.45–98.46% |
| Settled Body entry / descent           |              98.30% / 98.01% |
| Final approach `v33000`                |                       96.52% |
| Landed before Leave `f926/f927`        |              97.31% / 97.32% |
| On-foot arrival `f928`                 |                       97.64% |
| Immediate forward/right/second forward |     97.04% / 97.20% / 96.57% |

R7 defines no global percentage threshold and explicitly limits exact ST raster rows/packed projection and preceding-buffer phase equivalence. All 65 exposed star samples in the nine applicable flight/space observations match the original. Other fixtures retain foreground occlusion and cannot use that mask to establish star completeness. `v31000/v32000` retain 87.46%/88.77% agreement; contact `f884` retains 66.78%. Those mismatches remain visible in the ledger rather than being treated as missing-geometry waivers. Original loop-top buffers can precede post-wait state changes; `f139/f140/f461/f462/f463` are preserved as transition-state observations, not raster parity evidence, as R7 specifies. Production draw-phase ownership, full live animation and restored-frame equivalence remain I4 checks.

Validation covers adversarial admission, deterministic export/identity, general camera and dynamic tokens/beacons, all existing browser unit regressions, and D1/Catalogue browser Save/Load/Resume/storage flows. The expanded payload also admits through the browser with 94 playable requests and zero Catalogue reads. This establishes I3's content/presentation boundary; it does not certify the expanded production journey before I4's behavior and persistence delivery.

## Pickup response scripts (#794)

Accepted Take requests CHILD216→`$1C`, PCB SEATED218→`$73` and PULVIN ORE127→`$18`
through Dion's ordinary availability/queue launcher. Each seed byte is `$A0`.
The exporter closes the three graphs over both conditional successors, calls,
shared epilogues and direct timed targets; repeating PCB continuations remain in
that finite graph. The source is the same whole-RAM-pinned gameplay opening,
with per-instruction provenance. See [the recovered effects](research/mercenary-iii-object-interaction-r2-effects.md).

PCB reads the live held bit at every continuation. CHILD's candidacy branch
retains both BCD poll bytes and their message substitutions. No admitted gameplay
writer sets candidacy flag10, so its ordinary election alternatives remain excluded;
the branch is exercised by synthetic VM controls. ORE sets flag22, admits mining's
`$75C01` alternative and copies model316 into resident97's model selection while
replacing resident218's model with NULL. The replacement chair is an explicit
playable model binding; Residence and Carried Stack are preserved.

The pickup delivery added Save fields retaining the response availability/queue, poll bytes, direct timed
continuations and admitted model replacements. Synthetic browser/session controls
verify these launches and future equivalence; they do not establish ordinary
routes to the remote objects.

## Cards and switches (#795)

`presentation/head.json` also carries the two original switch-field bitmaps,
the 57 groups' raw two-line location labels, the rotating random table and the
initial fruit-machine reel codes. BUS PASS displays its recovered default;
A TO Z follows the current location. Their keypad keys are ignored by the
original dispatcher. PULVIN DETECTOR's ore/distance gate drives its random
B-channel sound, and ELECTROMAGNET advances an active fruit machine without
setting bit0. See [the source and implementation note](research/mercenary-iii-cards-and-switches.md)
for the bus-service and bankruptcy-script limits.

The devices delivery added Save fields retaining the device random/counter/priority and
fruit-machine owners. Earlier prototype schemas and content identities are
refused, with no migration (ADR 0073).
