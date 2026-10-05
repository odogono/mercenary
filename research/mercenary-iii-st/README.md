# Mercenary III ST laboratory

The reproducible Hatari harness and MIII-only decoders behind `payload/dion/` (#647, #648). Facts from it belong to the **Mercenary III research baseline** pinned in [`config/baseline.json`](config/baseline.json). They are neither Damocles Working-Authority Evidence nor Authoritative Evidence.

Nothing here borrows the Damocles laboratory's code, catalogue or assets. Each format is read from Mercenary III's own reader, and that reader's address is cited in the decoder. Under [ADR 0002](../../docs/adr/0002-separate-rom-research-from-implementation.md), the decoders emit data with Research Provenance and translate no code. RAM, screenshots, logs and disassembly are Restricted Material, kept under the ignored `restricted/` root.

Each issue's runs live in the main checkout's `restricted/mercenary-iii-<issue>/`; `scripts/worktree-setup.sh` at the repository root links that root into a worktree.

## Modules

| Path | Owns |
| --- | --- |
| `m3lab/__main__.py` | the `capture` and `export` commands; other modules run as `python3 -m m3lab.<module>` |
| `m3lab/boot.py` | cold boot of the pinned baseline and RAM capture at chosen VBLs |
| `m3lab/ram.py` | reading a loaded RAM image, with the source of every value |
| `m3lab/scene.py` | standing at an exact surface pose and capturing the original's frame |
| `m3lab/geometry.py`, `world.py`, `panel.py`, `scripts.py`, `service.py`, `sound.py`, `sky.py`, `text.py` | the METIS taxi slice decoders behind `payload/dion/*.json` |
| `m3lab/census_capture.py`, `census_locations.py`, `census_objects.py` | the full original location and resident census |
| `m3lab/catalogue_*.py` | the Dion Catalogue: surface, objects, interiors, ledger, render inputs, export, preview scenes |
| `m3lab/surface_scenes.py`, `object_scenes.py`, `interior_capture.py`, `interior_scenes.py` | original-scene comparisons for the Catalogue |
| `m3lab/tourcraft_export.py` | the bounded TOURCRAFT export into `payload/dion/tourcraft/` (ADR 0065) |
| `scripts/taxi-*.ts` | R8 taxi Save audits, pinned by `taxi-source.ts` and run under `bun test` in `web/` |
| `scripts/taxi-source-eligibility.ts`, `scripts/taxi-eligibility-audit.ts` | R8a necessary source checks and 11 additional ordinary input witnesses; [source eligibility/reference rule](../../docs/research/mercenary-iii-tourcraft-source-eligibility.md), with universal proof gaps retained |
| `scripts/taxi-early-cursor-audit.ts` | R8a ordinary early full-record collision with different retained face cursors; [accepted early canonical policy and witness](../../docs/research/mercenary-iii-tourcraft-source-eligibility.md#ordinary-early-cursor-collision-returned-to-d2), `taxi-early-cursor-evidence.json` and `web/test/dion-early-cursor-ambiguity.test.ts` |
| `scripts/taxi-canonical-reference.ts` | R8a universal departure-order selector with explicit unresolved reachability; fixed-family wait candidates remain separately scoped; [selection proof](../../docs/research/mercenary-iii-tourcraft-source-eligibility.md#direct-decision-procedure-and-safe-reductions) and `web/test/dion-canonical-reference.test.ts` |
| `scripts/taxi-request-count-audit.ts` | R8a exhaustive narrative request-count abstraction: all 33 external counts and eight face-cursor certificates; [scope and matrix](../../docs/research/mercenary-iii-tourcraft-source-eligibility.md#complete-request-count-analysis-for-the-33-controls), `taxi-request-count-evidence.json` and `web/test/dion-request-counts.test.ts` |
| `scripts/taxi-timed-face-audit.ts`, `scripts/taxi-first-id-bound.ts` | R8a exhausted timed narrative classes, eight tagged face certificates and four additional natural sources, with a proved relaxed first-ID bound; [classification scope](../../docs/research/mercenary-iii-tourcraft-source-eligibility.md#timed-face-owner-classification-after-736), `taxi-timed-face-evidence.json` and `taxi-first-id-bound-evidence.json` |
| `scripts/taxi-face-rebuild-audit.ts`, `scripts/taxi-face-snapshot.ts` | R8c accepted shared face-selection tag, nonadvancing output rebuild, original collision and tagged restore/future comparisons; [#736 findings](../../docs/research/mercenary-iii-tourcraft-face-rebuild.md), `taxi-face-rebuild-evidence.json` and `web/test/dion-face-rebuild.test.ts` |
| `m3lab/snapshot_owners.py` | R8b raw unsigned owner observer, coherent opening seeds, actor slots50–63/trajectories, all32 Body phases, VM/input/view/animation and sound-driver fields; [#737 contract](../../docs/research/mercenary-iii-tourcraft-snapshot-fields.md), `tourcraft-snapshot-owner-seeds.json`, `tourcraft-snapshot-sound-seed.json` and `tourcraft-snapshot-restore-evidence.json` |
| `tests/` | unit tests: `PYTHONPATH=.:tests python3 -m unittest discover -s tests` |
| `object-interaction-r1-followup.json` | R1 synthetic selection/clipping/native-key, refusal and BRIEFCASE boundary assertions with selected capture hashes; [follow-up and reproduction](../../docs/research/mercenary-iii-object-interaction-r1-followup.md), [prior acceptance audit](../../docs/research/mercenary-iii-object-interaction-r1-audit.md); R1 remains open |
| `object-interaction-r1-placement.json` | R1 synthetic support/direct Drop with native selection/re-pick, refusal placement-owner preservation and retained zone; [report and reproduction](../../docs/research/mercenary-iii-object-interaction-r1-placement.md); R1 remains open |
| `object-interaction-r1-operand.json` | R1 original disk Save/Load, imported prefix and reached Take operand reader; [report and reproduction](../../docs/research/mercenary-iii-object-interaction-r1-operand.md); general writer policy remains open |
| `object-interaction-r2-presentation.json` | R2 numeric source/capture pins, card/description/ACME owners, eleven-tick observations and six original-machine restored-future comparisons; [R2 handoff](../../docs/research/mercenary-iii-object-interaction-r2.md) and [pickup effects](../../docs/research/mercenary-iii-object-interaction-r2-effects.md). No gameplay admission or browser Save equivalence. |
| `object-interaction-r2-effects-audit.json`, `scripts/object-interaction-r2-effects-audit.py` | Independent read-only audit of eighteen retained synthetic pickup families: availability, acquisition retention, nested Returns, native timer writes and ordered message requests; [acceptance audit](../../docs/research/mercenary-iii-object-interaction-r2-audit.md), with exact regeneration and unexecuted boundaries. |
| `object-interaction-r2-owners.json`, `scripts/object-interaction-r2-owners.py` | Ordinary Head Commands on acquired COBWEB/MAILBOX/KEY/BLACK BEACON; successful BLACK Drop/re-pick, lamp phase versus BLUE locator predicate, sound-request order and four exact original-machine restored cuts; [owner follow-up](../../docs/research/mercenary-iii-object-interaction-r2-owners.md). Final admitted writer/reader closure remains with R2/R3/R4. |
| `object-interaction-r2-scheduler.json`, `scripts/object-interaction-r2-scheduler.py` | Per-response active/busy/unavailable/description/queue controls, all six ordered replacement pairs and PCB/ORE competing campaign/timed starts; [scheduler/native handoff](../../docs/research/mercenary-iii-object-interaction-r2-scheduler-native.md). Synthetic acquisition certifies no remote ordinary route. |
| `object-interaction-r2-native-owners.json`, `scripts/object-interaction-r2-native-owners.py` | Item/card/description/ACME/detector/sound owners at all143 retained R4 EAGLE cuts, plus static native script `$12/$81` graphs and their campaign/model exposure; [native owner audit](../../docs/research/mercenary-iii-object-interaction-r2-scheduler-native.md#actual-native-eagle-cuts). No final world/script-writer or browser Save closure. |
| `object-interaction-r2-expanded-owners.json`, `scripts/object-interaction-r2-expanded-owners.py` | R2 owners at435 later R3/R4 BLUE, arrival, natural encounter and separately classified synthetic cuts; regenerated route/input provenance and26 pinned reader spans. [Current-set closure audit](../../docs/research/mercenary-iii-object-interaction-r2-closure-audit.md) retains final admitted world/script gates. |
| `object-interaction-r2-current-owners.json`, `scripts/object-interaction-r2-current-owners.py` | Six ordinary-input BLUE lamp and landed-EAGLE ACME Drop/Leave/recovery continuations,66 cuts and16 full-RAM restored cuts; raw evidence under `restricted/mercenary-iii-771/current-owners/`. Seven synthetic observer rejection/owner tests in `tests/test_r2_expanded_owners.py`. [Evidence and boundaries](../../docs/research/mercenary-iii-object-interaction-r2-closure-audit.md). |
| `object-interaction-r3-frontier.json`, `scripts/object-interaction-r3-frontier.py` | Exact coherent initial native dependency candidates: 29 eligible destinations/43 groups, 246 persistent records plus nine working templates, 523 immutable geometry references and36 Open definitions. [Scope review](../../docs/research/mercenary-iii-object-interaction-r3-scope-review.md) and [primary native frontier](../../docs/research/mercenary-iii-object-interaction-r3-world-frontier.md) retain ordinary-access, final promotion and I1 gates. Five synthetic provenance/boundary tests in `tests/test_r3_frontier.py`. |
| `object-interaction-r3-followup.json`, `scripts/object-interaction-r3-followup.py`                                        | Ordinary BLUE acquisition/Drop/re-pick and manual METIS arrival with exact suffix replays; separately classified synthetic hit/kill/shield/conditional script launches; [scope follow-up](../../docs/research/mercenary-iii-object-interaction-r3-followup.md). Final destination/content/Save admission remains open.                                                                                                      |
| `object-interaction-r3-routes.json`, `object-interaction-r3-inventory.json`, `scripts/object-interaction-r3-inventory.py` | R3 complete ordinary-input route prefixes, candidate/action/pose boundaries and original capture pins; independently pinned mutable initial records and selected immutable geometry/card/document references. [R3 handoff](../../docs/research/mercenary-iii-object-interaction-r3.md) records natural acquisition, KEY181→EAGLE3 boarding and remaining scope/effect gates. No interaction promotion or runtime admission. |
| `tolosa-hq-evidence.json`, `scripts/tolosa-hq-evidence.py` | Ordinary TOLOSA HQ entrance/B lift, reception/meeting requests, fixed-table Take and absent-key31 corridor barrier;36 full-RAM restored futures. [HQ route handoff](../../docs/research/mercenary-iii-tolosa-hq-route.md) retains remote key acquisitions, PCB selection/response115 and final admission gates; [source report](../../docs/research/mercenary-iii-tolosa-hq-source.md) separates static keys31/32 and graph evidence. |
| `clotho-key31-evidence.json`, `scripts/clotho-key31-evidence.py` | Ordinary CLOTHO arrival/landing and interior/exterior key31 acquisition; BIL hostile programme/failure, election119, native TOLOSA/HQ return, held31 door/117 and absent32/selected-PCB range probes.67 families/720 cuts/70 complete-RAM restored futures. [Route handoff](../../docs/research/mercenary-iii-clotho-key31-route.md) and [source report](../../docs/research/mercenary-iii-clotho-key31-source.md) retain key32/PCB/model/response115 and final admission gates. Seven synthetic observer tests in `tests/test_clotho_key31_evidence.py`. |
| `eagle-natural-encounters.json`, `scripts/eagle-natural-encounters.py` | Ordinary native EAGLE arrival at JUNO and TOLOSA, three passive kills, hostile launch and unshielded pending failure; full-RAM checkpoint futures. [Natural-encounter report](../../docs/research/mercenary-iii-eagle-natural-encounters.md) retains final destination/content/effect/Save gates. |
| `eagle-flight-routes.json`, `scripts/eagle-flight-evidence.py` | R4 original-input EAGLE flight/turn/brake, airborne Leave refusal, gentle landing/Leave/re-board, hard touchdown, key Drop/missing-key Board, player-shot allocation and space entry with zero-tick re-entry. Flight repeat matches17 captures; a midflight checkpoint matches ten later captures. [R4 handoff](../../docs/research/mercenary-iii-eagle-flight.md) retains world/effect/Save gates. |
| `*.json` here | checked-in evidence ledgers; [the TOURCRAFT milestone index](../../docs/research/mercenary-iii-tourcraft-milestone-review.md#where-each-tickets-work-lives) says which ticket owns each |

## Quick start

Supply the pinned media under a directory named by `M3_ROM_ROOT`, containing `atarist/Mercenary III.STX` and `atarist/tos/emutos206.img`. The pinned Hatari 2.6.1 binary is checked by hash. Every module uses only the Python standard library.

```sh
cd research/mercenary-iii-st
python3 -m m3lab capture --name export      # cold boot; prints the run directory
python3 -m m3lab export --run <run directory>   # writes payload/dion/*.json
R=<run directory>
M3_RAM=$R/v6000.ram M3_OPENING=$R/start.ram M3_ENTRY_RAM=$R/entry.ram \
  PYTHONPATH=.:tests python3 -m unittest discover -s tests
```

`capture` replays R1's spaceport schedule. It saves RAM at the game entry (`entry.ram`, PC `$6AC32`, where the panel artwork DAM6 has just loaded) and at a fresh game's first main-loop top (`start.ram`). It also saves at the loaded-play and journey checkpoints (`v<VBL>.ram`, with screenshots). A run takes about twenty seconds. Pass `loop_top=True` to `boot.Plan` to capture at the main-loop top instead. There, the buffer that `$42C01` names holds the frame drawn from the pose in RAM. The displayed buffer, which a screenshot shows, is the frame before it.

`export` checks every stable slice the research reports published before it decodes anything. Documents from one run share one `source` block. The browser refuses a document from another run, another Title or another program image.

## Full original-game location census

```sh
python3 -m m3lab.census_capture   # prints an ignored full-location-census-* directory
```

This cold-boots the pinned inputs, saves fresh `start.ram`, and executes the
original workspace builder for all 57 groups. Results are saved as
`all-groups/group-00.ram` through `group-56.ram`; the separate
`midas/group-56-uniform.ram` captures MIDAS's 256-cell repetition. Each result
must match its claimed group and authored label pointer. `manifest.json` records
RAM and workspace hashes, source pins and the validated 794 initial group cells
(1,049 with MIDAS repetition, including VOID). All debugger scripts, commands
and captures stay under `restricted/`; this command does not update the Data
Payload. See [the recovery note](../../docs/research/dion-full-location-recovery.md).

Generate the two navigation documents from that capture, from the repository root:

```sh
PYTHONPATH=research/mercenary-iii-st python3 research/mercenary-iii-st/scripts/write-location-docs.py --run <run directory>
```

This writes `docs/dion-object-locations.md` and `docs/dion-structure-locations.md`.
It accounts for all persistent slots, authored groups and named places, including
MIDAS's repeat and the initially absent LOGOS construction. The exact initial
position of a circulating service can differ between fresh boots.

## Dion Catalogue coverage ledger

```sh
python3 -m m3lab.catalogue_ledger --run <census run directory>
PYTHONPATH=.:tests python3 -m unittest tests.test_catalogue_ledger
```

This writes the tracked [`catalogue-ledger.json`](catalogue-ledger.json) from the
census run. It holds every object slot, group, cell binding and selected
structure slot, the Geometry Identities they require, and each identity's owner
ticket, decoder path and recovery state. It decodes no geometry and contains no
RAM. The tests validate the committed ledger and reconcile it with the two
location documents without captures; with `M3_CENSUS_RUN` set they also prove
that it regenerates exactly. Recovery tickets move identities out of `pending`;
see [the data contract](../../docs/dion-catalogue-contract.md).

## Dion surface recovery

```sh
python3 -m m3lab.catalogue_surface capture         # the LOGOS constructed workspace
python3 -m m3lab.catalogue_surface extract --census <census run> \
  --construction <construction run> --out ../../restricted/mercenary-iii-682/surface.json
python3 -m m3lab.surface_scenes scenes             # original scenes against the planner
python3 -m m3lab.surface_scenes coasts             # Land/Sea answers against islands
```

`catalogue_surface` decodes every surface Geometry Identity the Dion Catalogue
needs: structures per alias scale, details, ground records per transform,
islands, street-furniture models and lettering. It writes them only under
`restricted/` and records their hashes in the ledger, which #684 exports from.
`scene` stands the original at any pose through its own object-destination
path; `web/tools/dion-scene.ts` compares that frame with the browser planner.
See [the surface report](../../docs/research/dion-surface-recovery.md).

## Dion object recovery

```sh
python3 -m m3lab.catalogue_objects --census <census run> \
  --out ../../restricted/mercenary-iii-681/objects.json
python3 -m m3lab.object_scenes                   # original scenes against the planner
```

`catalogue_objects` decodes every object Geometry Identity: each record's
header- and viewer-selected forms, colour patches into shared geometry, the
articulated rest pose, and per-slot lettering. It also inventories every
run-time model-table writer, the taxi, bus and craft services, and their driver
heads. `object_scenes` moves one slot in front of the eye at an empty structure
and compares the original's frame with the planner over the object's footprint.
See [the object report](../../docs/research/dion-object-geometry.md).

## Dion interior recovery

```sh
python3 -m m3lab.catalogue_interiors --census <census run> \
  --out ../../restricted/mercenary-iii-683/interiors.json
python3 -m m3lab.interior_capture --census <census run>
python3 -m m3lab.interior_scenes --census <census run>
```

The extraction covers all 198 selected slots, 464 authored Floors and 180 initial
indoor residents, with inherited scale/detail, per-Floor palettes and explicit
association hooks. It accounts separately for slot 46's compact-alias overread:
78 raw census selector IDs, 74 authored geometries. `interior_capture` compares
all 565 original reader contexts; `interior_scenes` captures upper Floors,
attachments, lettering and MIDAS's repeated selector in original frames. Use
`--interiors`, `--interior-comparisons` and `--interior-scenes` when regenerating
the ledger. See [the recovery report](../../docs/research/dion-interior-recovery.md)
for capture and verification recipes. Gameplay reachability stays unverified.

## Integrated Catalogue validation

The [#686 matrix](../../docs/research/dion-catalogue-validation.md) records 38
original-frame comparisons, the corrected decoder/planner defects and the
remaining raster, static-state and reachability limits. From the repository root,
`python3 -m m3lab.catalogue_scenes` prepares ignored exact-pose inputs; from `web/`,
`bun tools/dion-catalogue-compare.ts` compares the drawn RAM buffer with the
Catalogue adapter, and `bun tools/dion-catalogue-coverage.ts` regenerates portable
evidence for all 529 identities and 791 preview checks. Pass that evidence with
`catalogue_ledger --previews research/mercenary-iii-st/catalogue-previews.json`.
Regenerate it after rendering changes; static coverage is not pixel parity.

## Modules

The bounded TOURCRAFT export is implemented by `m3lab.tourcraft_export`, with its source inputs, deterministic identity, admission boundary and comparison command documented in [the I3 content contract](../../docs/dion-tourcraft-content-contract.md). Its numeric comparison ledger is `tourcraft-play-comparison.json`; original RAM and comparison sheets stay ignored under `restricted/`.

| Module | Exports | Readers |
|---|---|---|
| `census_capture.py` | Full original-builder census captures | `$4F0F2..$4F304` |
| `census_locations.py`, `census_objects.py` | All groups, Body placements, residents and names | Full location recovery note |
| `catalogue_ledger.py` | `catalogue-ledger.json`: Dion Catalogue coverage | Census decoders above |
| `catalogue_surface.py` | Surface Geometry Identities, cell grounds, lettering, MIDAS and LOGOS | `$4F142..$4F2A6`, `$5600C..$560B0`, readers below |
| `catalogue_interiors.py`, `interior_capture.py`, `interior_scenes.py` | Authored Floors, resident bindings and original-reader/frame comparisons | `$560E2..$5617E`, `$56D98..$56E5E`, `$53C5E..$53CC4` |
| `catalogue_objects.py` | Object Geometry Identities, forms, lettering, model-table writers, services | `$545AE..$549BA`, `$543B4..$545AE`, `$55050`, writers in the report |
| `scene.py`, `surface_scenes.py`, `object_scenes.py` | Original scenes at exact poses; the #682 and #681 comparisons | `$5A006..$5A15A` |
| `boot.py` | Cold-boot plans and captures | Integration recipe |
| `ram.py` | Provenance-carrying reads | — |
| `geometry.py` | Cells, structures, regions, details, ground, islands, models | `$5600C`, `$5AD2C..$5B2D2`, `$54AEE..$54D20`, `$56204`, `$5761A`, `$571A8`, `$545AE..$549BA` |
| `world.py` | `world.json`: the fifteen occupied cells, residents, palettes, glyphs, frame facts | Above, plus `$55C58`, `$5A578`, `$7CA2`, `$3E000` |
| `sky.py` | `world.json`: METIS observer/phase, 1,868 star records, colours and empty horizon | #646, `$50B10`, `$50B66`, `$571A8` |
| `panel.py` | `panel.json`: artwork, centre box, fonts, strings, readout fields | `$59C2C`, `$4ED8E`, `$53294`, per-field writers |
| `text.py`, `scripts.py` | `messages.json`, `scripts.json` | `$52AC4`, `$52860..$53002` |
| `sound.py` | `sound.json` | `$530FC`, `$4CB54`/`$4CB6C` |
| `service.py` | `service.json` | `$41F18`, `$51CA2`, `$518AC` |

The findings and their comparisons are reported in [the I1 content-boundary report](../../docs/research/mercenary-iii-i1-content-boundary.md) and [the I2 implementation report](../../docs/research/mercenary-iii-i2-taxi-implementation.md).

## Expanded snapshot owner observations (R8b)

```sh
cd research/mercenary-iii-st
python3 -m m3lab.snapshot_owners ../../restricted/mercenary-iii-708/presentation/exact2/start.ram \
  --opening --out tourcraft-snapshot-owner-seeds.json
PYTHONPATH=.:tests python3 -m unittest discover -s tests -p test_snapshot_owners.py
```

`--opening` requires the exact pinned coherent first-top RAM hash. Without it the same observer reads progressed captures without resetting their owners. The JSON is a numeric research ledger, not a portable Save record; raw source pointers still need the contract's admitted content adapters. PSG registers come from the independent cold-boot trace, rather than absent RAM shadows. Restricted `owner_probe.py`, `scopes.json` and `compare_owners.py` retain the whole-machine continuation recipe; the tracked restore ledger records sampled ranges, hashes, outcomes and limits. These controls do not run the #711 browser codec or the expanded 33-checkpoint matrix.
