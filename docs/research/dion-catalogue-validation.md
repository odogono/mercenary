# Dion Catalogue integrated validation

Validated 2026-10-01 for [#686](https://github.com/odogono/mercenary/issues/686), under [#679](https://github.com/odogono/mercenary/issues/679). All required geometry is recovered and previewed. The integrated Catalogue comparison now reproduces 38 original-game frames through the same adapter, Dion Frame Planner and Authentic renderer used by `/dion/catalogue`. The remaining differences below are explicit limits, not an exhaustive pixel-parity claim.

Evidence is Mercenary III's own pinned [research baseline](../../research/mercenary-iii-st/config/baseline.json), census `location-census-334983y7`, opening RAM SHA-256 `cd697c802472a319fcd8fd5dd7193ad870cf4ff0a7f37cd6fda51893dd899fe4`. [ADR 0002](../adr/0002-separate-rom-research-from-implementation.md) and [ADR 0043](../adr/0043-admit-damocles-play-alongside-the-second-city.md) apply. Captures, RAM, disassembly, original screenshots and comparison images remain ignored under `restricted/`. No playable Dion payload document changes.

## Full coverage and distinct paths

The [ledger](../../research/mercenary-iii-st/catalogue-ledger.json), [export](../../payload/dion/catalogue/catalogue.json) and [portable preview evidence](../../research/mercenary-iii-st/catalogue-previews.json) reconcile 246 persistent objects, 57 authored groups, 795 authored bindings (794 initially), 198 selected slots, 78 raw Floor selectors / 74 authored geometry slots, 464 host/Floor bindings, 180 indoor residents, 31 Bodies, 63 island placements and 172 place labels. The compact slot-46 alias retains its census overread as non-Floor bytes; it has no invented upper Floors. MIDAS remains a repeat rule with `physicalCount: null`.

| Family | Required identities | Recovered empty | Preview checks |
| --- | ---: | ---: | ---: |
| Object and street-furniture model | 228 | 1 | 247, including one empty-model disposition |
| Structure | 74 | 7 | 207 scale variants |
| Detail | 57 | 2 | 57 base records; placement scales checked separately |
| Ground | 153 | 4 | 263 transform variants |
| Island | 17 | 1 | 17 base records |
| Total | **529** | **15** | **791** |

There are 790 exported forms and one additional check for the model with no forms. Every nonempty identity/form emits geometry from at least one of five inspection headings. Every empty disposition is admitted without a stand-in. The audit also plans **19,787 placement/Floor/region contexts**, rejecting geometry or binding gaps. The existing D1 sky-inventory waiver is the sole admitted diagnostic. These are static coverage checks, not 791 original-frame pixel comparisons. The evidence must be regenerated after changing decoder output, rendering support, adapter or planner code.

| Decoder / composition path | Original reader facts | Representative evidence and verification |
| --- | --- | --- |
| `geometry.decode_model`: byte/word vertices; polygon, line, text and pick records | `$545AE..$549BA`, `$55050` | ARMCHAIR, SIGHTS, NEWS STAND; all 246 nonempty exported model forms plus empty disposition; synthetic reader tests |
| Model headers: empty/procedural dispositions, yaw/view-fixed/articulation, patches/jumps, lamps, safe and vehicle forms, range | [Header dispatch and variant inventory](dion-object-geometry.md#header-operations) | DODGE, CANINE rest pose, SIGHTS, both DESKs, actual beacon state, both SAFE forms, TOURCRAFT, armed EXPLOSIVE, BIL'S CHAIR and driver head; passenger/lit forms drawn in the full static audit, not separately certified original animations |
| Viewer-selected model face lists, including ground-template models | `$54952..$54988` | TOURCRAFT street form, Connection front/rear furniture; alternate faces retained for `base` records |
| Structure resolver/alias, plan/walls, queues and regions | `$560E2..$5617E`, `$5AD30..$5B2D0` | COMPANIES HOUSE, mirrored Connection, FARM, empty slot 100; all alias scales and region contexts |
| Upper Floor selector, inherited detail/scale, palette and pitch; compact alias | `$56D98..$56E5E` | Floor 4, Floor 9, basement 10; 565 existing original-reader checks; slot-46 non-lift evidence retained |
| Attachments and keyed wall lettering | `$5AF8E..$5B212`, `$5AF60`, `$55188..$55204` | PRISON sliding leaves, COMPANIES HOUSE openUnits 64, ENTERPRISE one-leaf vertices; literal/door/Floor labels; corrected odd detail-text alignment regression |
| Detail groups, boxes, vertices, polygons/lines/text, tagged vertices | `$54AEE..$54D20`, `$54D24..$54EAE`, `$54FA0` | DISCO, PRISON, MIDAS and mirrored Floor 9; definition inspection shows the union of referenced lists, placements retain recovered selection groups |
| Ground selector/overrides, transform bitmask, road joins and model templates | `$561AE..$563C4`, selector table `$561FC` | Connection, LOGOS, MIDAS; all 263 transforms and all ground-template model references |
| Island draw lists and Land/Sea classifier | `$5761A..$5769E`, `$571A8..$574A8` | DION coast, VULCAN core, LACHESIS strip; all 17 records and all 36 recorded Land/Sea answers |
| Resident host/Floor/local position versus association hooks and queue insertion | `$5464C..$54668`, `$53C5E..$53CC4`, `$5B3A6..$5B3F8` | PRISON COBWEB and nearby surface MAILBOX/letter, Floor-4 key, VELOS Floor-9 resident, actual/displaced MIDAS; all 180 residence records and 565 reader comparisons |
| Palette, fonts and token binding | `$55144`, `$551C0`, `$56062..$560AE` | Own group road/land colours, complete 64-word scene selectors, all eight printable fonts plus evidenced `2:01` glyph; per-slot keys, placement lettering, selected Floor labels, first-NUL string termination |
| Initial overlay versus constructed binding | `$51664..$51690` | Both LOGOS states; initial absence retains ground; no campaign execution |

The recovery children own the original-reader evidence: [objects](dion-object-geometry.md), [surfaces](dion-surface-recovery.md), [interiors](dion-interior-recovery.md) and [interior reader notes](dion-interior-reader-notes.md). This matrix verifies exported geometry and browser composition, rather than substituting their raw readers for the export.

## Original-frame comparison matrix

[`catalogue_scenes.py`](../../research/mercenary-iii-st/m3lab/catalogue_scenes.py) reproduces the existing 18 object, 12 surface and 8 indoor captures from their recorded RAM. It derives selection, physical cell, camera, palette/day, door opening, resident yaw, Floor-label buffer and the separate structure-local Y. The integrated renderer reads geometry exclusively through the validated Catalogue export. It never decodes geometry from the comparison RAM.

[`dion-catalogue-compare.ts`](../../web/tools/dion-catalogue-compare.ts) verifies each original RAM hash, reads the actual drawn ST bitplanes selected by `$42C01`, and resolves their frame-palette shadow plus horizon split. At loop top the PNG shows the preceding buffer; using the drawn RAM buffer avoids attributing a blink or camera-frame mismatch to geometry. The older BLACK BEACON recipe requested `lamp-lit` without freezing its blink. This comparison admits the actual patched lamp bytes, which are dark in that capture.

Each ignored comparison sheet is **original drawn frame | integrated Catalogue | magenta difference**. Shape, transform, palette, physical placement, associations and painter ordering were examined alongside the reader checks. Agreement is over the full 320×136 frame at three-bit ST gun depth. It is a diagnostic, with **no percentage pass threshold**. High background agreement cannot certify a small object. The object footprint column counts pixels within two pixels of the rendered object's bounds where either image differs from the isolated frame without the object. It measures edge/sliver sensitivity and can include original-stage background missing from an isolated preview, especially at the spaceport; it is not an independent object-shape certificate.

| Case | Path / association examined | Whole frame | Object footprint | Final verdict |
| --- | --- | ---: | ---: | --- |
| `armchair` | Plain model, polygon colours | 98.19% | 91.48% / 2923 px | Known difference: raster edges/slivers |
| `bils-chair` | Run-time model-table rebinding | 97.70% | 88.17% / 3059 px | Known difference: raster edges/slivers |
| `black-beacon` | Actual captured lamp-dark colour patch | 98.25% | 67.53% / 542 px | Known difference: raster edges/slivers |
| `canine-articulated` | Tagged articulated vertices, rest pose | 98.17% | 85.07% / 1058 px | Known difference: raster edges/slivers |
| `dodge-yaw` | Resident yaw and transformed model | 98.26% | 74.50% / 1051 px | Known difference: raster edges/slivers |
| `door-key-b` | Per-slot $87 lettering | 98.11% | 86.32% / 1338 px | Known difference: raster edges/slivers |
| `driver-head` | Driver-head model-table record | 98.52% | 96.80% / 125 px | Known difference: raster edges/slivers |
| `executive-desk` | Shared geometry, own colour patch | 97.75% | 81.42% / 1830 px | Known difference: raster edges/slivers |
| `explosive-armed` | Armed model binding and live countdown opening value | 97.74% | 92.58% / 4651 px | Known difference: raster edges/slivers |
| `key-dodge` | $8008 key-code header | 98.38% | 93.96% / 1043 px | Known difference: raster edges/slivers |
| `news-stand-literal` | Inline literal lettering | 97.96% | 92.22% / 3175 px | Known difference: raster edges/slivers |
| `processors-desk` | Shared geometry, different colour patch | 97.75% | 81.42% / 1830 px | Known difference: raster edges/slivers |
| `safe-blown` | Header-selected blown form | 98.12% | 91.21% / 3868 px | Known difference: raster edges/slivers |
| `safe-intact` | Header-selected intact form | 98.30% | 92.62% / 2682 px | Known difference: raster edges/slivers |
| `sights-lines` | View-fixed turn and line primitives | 98.42% | 53.25% / 323 px | Known difference: raster edges/slivers |
| `tourcraft-ground` | Viewer-selected street form | 98.23% | 64.53% / 953 px | Known difference: raster edges/slivers |
| `tourcraft-spaceport` | Same craft isolated from its spaceport stage | 66.82% | 38.67% / 724 px | Known difference: isolated object; surrounding stage omitted |
| `transporter-outside` | Per-slot transporter lettering | 98.36% | 97.89% / 13656 px | Known difference: raster edges/slivers |
| `companies-house` | Alias scale, walls, detail, ground and attachment | 97.65% | — | Known difference: raster edges/slivers |
| `connection-mirrored` | Mirrored alias and ground orientation | 98.70% | — | Known difference: raster edges/slivers |
| `olearys-farm` | Direct geometry and roof planes | 98.09% | — | Known difference: raster edges/slivers |
| `empty-slot-100` | Evidenced empty structure; ground retained | 99.23% | — | Known difference: raster edges/slivers |
| `connection-lettered` | Street-furniture alternate faces and lettering | 98.49% | — | Known difference: raster edges/slivers |
| `charlenes-disco` | Detail polygons and lines | 98.30% | — | Known difference: raster edges/slivers |
| `midas-field-far` | Physical repeat versus modulo-16 workspace, night presentation | 99.43% | — | Known difference: raster edges and waived sky |
| `logos-initial` | Absent structure with recovered ground | 98.98% | — | Known difference: raster edges/slivers |
| `logos-constructed` | Constructed binding, reflected/swapped ground | 98.28% | — | Known difference: raster edges/slivers |
| `vulcan-island` | Empty coast/core and land/horizon fill | 100.00% | — | Pass |
| `dion-coast` | Island vertices and shared coast pass | 99.26% | — | Known difference: raster edges/slivers |
| `lachesis-strip` | Island/land fill, bounded sky waiver | 99.87% | — | Known difference: raster edges and waived sky |
| `companies-floor-4` | Upper Floor, inherited scale/palette, key resident hook | 97.58% | — | Known difference: raster edges/slivers |
| `enterprise-basement` | Floor 10, palette, one-leaf attachments | 99.42% | — | Known difference: raster edges/slivers |
| `midas-displaced-period` | Same resident selector sixteen physical cells away | 99.36% | — | Known difference: raster edges/slivers |
| `midas-resident` | Actual host cell, independent structure/world camera Y | 99.36% | — | Known difference: raster edges/slivers |
| `mirrored-floor-9` | Negative alias scale, upper Floor, world-height detail selection | 97.49% | — | Known difference: raster edges/slivers |
| `prison-attachments` | Sliding leaves, association hooks and draw order | 98.38% | — | Known difference: raster edges/slivers |
| `prison-lettering` | Wall lettering occluded by nearby surface residents | 97.91% | — | Known difference: raster edges/slivers |
| `velos-floor-9` | Upper Floor, resident placement and hook order | 98.18% | — | Known difference: raster edges/slivers |

All 38 cases admit their required records with no geometry/binding diagnostic. VULCAN's 100% refers only to this single sampled frame. No case has a remaining blocking recovery defect or unresolved required geometry. The spaceport row is explicitly a **known scope difference**, not a passed whole-stage reproduction: the craft is an isolated definition, while the original includes the apron, road and other-cell furniture. Its footprint metric is contaminated by that background difference. TOURCRAFT's thin landing legs and line/edge coverage remain visible losses even in the isolated ground probe; SIGHTS' small line footprint is similarly sensitive. These known raster differences remain limits of Authentic rendering.

## Corrected defects

| Classification | Original fact and correction | Regression / evidence |
| --- | --- | --- |
| Recovery defect | `$54FA0` clears the low pointer bit after an odd detail-lettering command. Align the header before reading it; three detail records and their hashes change. | Synthetic odd-address CLOSED lettering test; all recovery hashes and export regenerated |
| Renderer adapter defect | Ground variant selector 3 means transform mask 5, via `[0,6,3,5,1,4,2,7]`, rather than mask 3. | LOGOS original-camera road pixel regression |
| Renderer adapter defect | `base` street-furniture records retain viewer-selected alternatives. Dropping them omitted Connection's blue lettered front. | Connection original-camera blue-front pixel; 90.65% → 98.49% |
| Renderer defect | Details use absolute world Y for selection and projection (`$54D62`, `$54EAE`), independent of the Floor's wall camera. Subtracting Floor base inserted lower-room details upstairs. | Original mirrored Floor-9 empty detail list; 90.89% → 97.49%; VELOS 94.26% → 98.18% |
| Comparison adapter defect | `$5A102` keeps resident world Y +63, while `$56E2C` sets local structure Y to63. MIDAS world eye93 is not its wall eye63. | Independent exact-pose structure height; original orange-band pixel; 80.30% → 99.36% |
| Renderer support defects | Each group's own road and island land colours; all 64 scene-palette words addressable by `$7E`; opening computer control-byte glyph; stop live strings at the first NUL. | Group 2/8/56 colour checks, palette/glyph admission, exact `G` token regression |
| Renderer adapter defects | Selected Floor labels and each resident's own key/route token; include recovered surface residents in the selected Floor-zero cell. | Floor 4/basement label test, hooked key-B missing-shared-token regression, MAILBOX/letter visibility and order; prison lettering 94.39% → 97.91% |
| Inspection defects | Initial LOGOS absence must retain ground. Cap large-model camera within recovered range; lower ground camera; show all referenced detail lists in independent definition inspection. | Absence/ground regression and large-model/flat-ground/first-group-detail visibility tests |
| Verification defect | `render-support.json` has its own generator. Whole-export regeneration must regenerate and compare it as well. | Two complete generations compared byte for byte, playable documents hashed unchanged |

Only Title-local decoder/planner/adapter logic changes. The shared renderer itself is unchanged. All 529 geometry documents repeat the new ledger source hash; only three detail geometry bodies change. The large rendering-support diff is generated palette coverage, per-group provenance and orientation data.

## Reproduction

Run from the repository root with the pinned media and Hatari specified by the [lab README](../../research/mercenary-iii-st/README.md). Existing recorded recovery handoffs are under the ignored directories below. To capture them afresh, use the children's published [object](dion-object-geometry.md#reproduction), [surface](dion-surface-recovery.md#reproduction) and [interior](dion-interior-recovery.md#reproduction) recipes. New runs have new RAM hashes; do not substitute them for the committed census identity.

```sh
export PYTHONPATH=research/mercenary-iii-st:research/mercenary-iii-st/tests
C=restricted/mercenary-iii-647/runs/location-census-334983y7
S=restricted/mercenary-iii-682
O=restricted/mercenary-iii-681
I=restricted/mercenary-iii-683
python3 -m m3lab.catalogue_surface extract --census "$C"   --construction "$S/runs/logos-construction-98n5a732" --out "$S/surface.json"
python3 -m m3lab.catalogue_ledger --run "$C" --surface "$S/surface.json"   --comparisons "$S" --objects "$O/objects.json"   --object-comparisons "$O/objects.scenes.json" --interiors "$I/interiors.json"   --interior-comparisons "$I/readers.json" --interior-scenes "$I/scenes.json"   --previews research/mercenary-iii-st/catalogue-previews.json
python3 -m m3lab.catalogue_export --objects "$O/objects.json"   --surface "$S/surface.json" --interiors "$I/interiors.json"
python3 -m m3lab.catalogue_render --census "$C"
python3 -m m3lab.catalogue_scenes
(cd web && bun tools/dion-catalogue-compare.ts && bun tools/dion-catalogue-coverage.ts)
```

The preview-evidence attachment rejects missing identities, stale geometry hashes/states, missing forms and nonempty forms that were not drawn. It is a coverage gate; it does not promote representative scene metrics into exhaustive fidelity. Re-run the renderer audit whenever its inputs or implementation change. Generated comparison inputs, sheets and metrics stay under `restricted/mercenary-iii-686/`.

For full verification:

```sh
M3_CENSUS_RUN="$PWD/$C" M3_GROUPS="$PWD/$C/all-groups" M3_CONSTRUCTION_RUN="$PWD/$S/runs/logos-construction-98n5a732" M3_SURFACE="$PWD/$S" M3_OBJECTS="$PWD/$O" M3_INTERIORS="$PWD/$I" M3_RAM="$PWD/$C/v6000.ram" M3_OPENING="$PWD/$C/start.ram" M3_ENTRY_RAM="$PWD/$C/entry.ram"   python3 -m unittest discover -s research/mercenary-iii-st/tests
(cd web && bun test && bun run typecheck && bun run lint && bun run unused)
(cd web && PORT=5187 bun run test:e2e e2e/dion-catalogue.e2e.ts   e2e/dion.e2e.ts e2e/dion-taxi.e2e.ts e2e/dion-enhanced.e2e.ts e2e/catalogue.e2e.ts)
```

Final results: **119 laboratory tests, no skips; 2,457 web tests; 37 browser tests**, all passing. The browser matrix hashes real canvas pixels against the audited adapter for all five geometry families, upper Floors, MIDAS, both LOGOS states and empty dispositions. Existing tests verify Catalogue storage/network isolation, host navigation, failures and retry. Both Metis taxi journeys and all 33 Save/Session Resume controls preserve uninterrupted futures. Full web tests retain relevant Targ/Damocles renderer/session regressions. Type checking, lint and unused-code checks pass. The collaborative preview was also inspected at the prison and selected upper Floor; snapshot automation failed, so browser verification rests on DOM/canvas checks and the reproducible browser suite, not a saved collaborative screenshot.

## Fidelity limits and acceptance readback

Free inspection uses an authored camera. Models expose stored states and rest poses; no scripts, lifts, boarding, explosions, moving vehicles, beacon blink or campaign construction execute. Surface residents use their recovered opening position/yaw; surrounding cells and moving campaign stages are not reconstructed. Most live readouts retain their opening snapshot, while placement tokens, slot lettering and selected Floor labels are bound to the inspected records. Exact comparison poses can retain an original destination's opening Floor-label buffer independently of the selected Floor's ordinary inspection label.

Authentic rendering retains floating projection, raster edge and sliver differences from the original ST arithmetic. Thin landing legs, small line objects and some glyph strokes can lose substantial footprint coverage. The explicitly waived complete sky Body inventory is not recovered here: stars visible in MIDAS/LACHESIS originals are absent. Complete geometry coverage, representative visual comparison and pixel-identical gameplay are different claims. Catalogue placement, debugger destinations and host navigation do not establish gameplay reachability; all resident reachability dispositions remain unverified.

The [acceptance audit](dion-catalogue-acceptance-audit.md) reads every acceptance item on #679 and #680–#685, preserving its pre-change snapshot and dated final review. #686's matrix, original reproduction, per-case verdicts, corrected blocking defects, regressions, census reconciliation, unchanged journeys/persistence and final limits are now recorded. The ledger's **static recovery/preview completion gate is clear**: 529 required, zero outstanding, zero blocking gaps. The milestone has evidence to close within the stated Catalogue scope after this delivery is accepted; this local validation does not itself merge code or change GitHub issue state.
