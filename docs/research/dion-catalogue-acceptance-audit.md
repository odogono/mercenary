# Dion Catalogue acceptance audit

Audited 2026-10-01 against commit `a8a54b94c136ab85bdb7e0a0b7cb8b9f1f38349c`, the merged [#685 delivery](https://github.com/odogono/mercenary/pull/698), and the primary GitHub acceptance text for [#679](https://github.com/odogono/mercenary/issues/679) and [#680](https://github.com/odogono/mercenary/issues/680)–[#685](https://github.com/odogono/mercenary/issues/685). This is an independent evidence audit. It does not certify the integrated original-game/browser comparison work owned by [#686](https://github.com/odogono/mercenary/issues/686).

The recovery and inspection deliveries exist, and all required Geometry Identities have recovered records or evidenced empty dispositions. The audited ledger deliberately remains incomplete: 529 identities have no recorded preview evidence. A regeneration regression also fails after the addition of `render-support.json`. These are concrete remaining completion requirements, alongside the integrated comparison matrix. Sources: [ledger](../../research/mercenary-iii-st/catalogue-ledger.json), [completion rule](../../research/mercenary-iii-st/m3lab/catalogue_ledger.py), [export regression](../../research/mercenary-iii-st/tests/test_catalogue_export.py), [contract](../dion-catalogue-contract.md).

## Scope and evidence rules

This audit applies [ADR 0002](../adr/0002-separate-rom-research-from-implementation.md), [ADR 0043](../adr/0043-admit-damocles-play-alongside-the-second-city.md), [ADR 0060](../adr/0060-share-one-renderer-across-the-titles-with-an-authentic-indexed-mode.md) and [ADR 0061](../adr/0061-admit-a-sessionless-dion-catalogue-under-the-dion-path.md): independently implemented readers and Title-local evidence, ignored Restricted Material, separate Catalogue and Gameplay Session identities, and shared rendering with Dion's own Frame Planner. The [laboratory README](../../research/mercenary-iii-st/README.md) identifies the pinned Mercenary III research baseline and reproduction paths. The verdicts below distinguish delivered bounded work from final milestone verification; a closed child issue alone is not evidence of complete whole-world fidelity.

## Inventory reconciliation

The audited [export](../../payload/dion/catalogue/catalogue.json) and [ledger](../../research/mercenary-iii-st/catalogue-ledger.json) agree on these accounts:

| Account | Audited result |
| --- | --- |
| Persistent object slots | 246: 180 indoor, 38 surface, 25 out-of-world, 3 carried |
| Authored group inventory | 57, each with an explicit disposition |
| Authored nonzero cell bindings | 795; 794 in the initial LOGOS state |
| Selected structure slots | 198 |
| Floor selectors / authored geometry slots | 78 raw selector IDs / 74 authored geometry slots |
| Authored host/Floor bindings | 464 |
| Bodies / island placements / named places | 31 / 63 / 172 |
| Required Geometry Identities | 529: 228 model, 74 structure, 57 detail, 153 ground, 17 island |
| Recovery states | 514 recovered, 15 empty, 0 pending |
| Open blocking recovery gaps | 0 |
| Recorded identity previews | 0; all 529 `preview` values are `null` |
| Stored completion | `complete: false`, `outstanding: 529` |

The 78/74 Floor distinction is an evidenced correction, not a waiver: slot 46 is an eight-byte ground-only alias, and the census's longer read crosses into slot 47. The raw selectors remain recorded separately; the original non-lift refusal supports the authored Floor disposition. Sources: [interior report](dion-interior-recovery.md), [compact-alias study](dion-interior-reader-notes.md#slot-46-is-a-compact-ground-only-alias).

## Parent #679 acceptance

| Acceptance item | Verdict at audited commit | Primary evidence / remaining requirement |
| --- | --- | --- |
| Every object and authored binding reconciled; unused groups, VOID and carried/out-of-world accounted for | Delivered | [Ledger validation and census reconciliation tests](../../research/mercenary-iii-st/tests/test_catalogue_ledger.py); [strict export admission test](../../web/test/dion-catalogue.test.ts). Counts above agree; working slots are separate from persistent residents. |
| All required geometry recovered and previewable, with record families and variants inventoried | Recovery delivered; completion evidence outstanding | [Object report](dion-object-geometry.md), [surface report](dion-surface-recovery.md), [interior report](dion-interior-recovery.md); all stored variants can be prepared/planned in the [preview test](../../web/test/dion-catalogue-preview.test.ts). That test asserts absence of crashes, not absence of reported gaps or visible geometry for each identity. All ledger preview fields remain null. |
| MIDAS repeat rule and evidenced LOGOS states | Delivered | [Contract](../dion-catalogue-contract.md#midas-and-logos), [inspection tests](../../web/test/dion-catalogue-inspection.test.ts), [preview tests](../../web/test/dion-catalogue-preview.test.ts). MIDAS has one seed and `physicalCount: null`; actual residents bind repeated cell 105. LOGOS initial/constructed is selection state, with no campaign execution. |
| Full-census search/filters/previews/host navigation and malformed/foreign diagnostics | Delivered interaction implementation; integrated visual verification outstanding | [Inspection tests](../../web/test/dion-catalogue-inspection.test.ts), [loader tests](../../web/test/dion-catalogue.test.ts), [browser tests](../../web/e2e/dion-catalogue.e2e.ts), [merged delivery](https://github.com/odogono/mercenary/pull/698). Current audit reran the unit tests, not browser interactions. |
| Comparison matrix with original recipes, verdicts, corrected defects and fidelity limits | Outstanding for #686 | Existing [surface](dion-surface-recovery.md), [object](dion-object-geometry.md) and [interior](dion-interior-reader-notes.md#representative-original-scenes) matrices supply starting samples and recipes. Interior comparisons certify reader state/geometry buffers, not integrated browser pixels. Historical surface/object results precede the new preview integration. |
| Reproducible export/checks; decoder, validation, browser and existing journey/persistence/Title regressions pass | Partly verified; regeneration regression open | Current audit: 20 targeted Bun tests pass. Python Catalogue selection: 48 run, 6 skipped, 1 failure comparing export output with all tracked JSON after rendering support was added. [#693](https://github.com/odogono/mercenary/pull/693), [#691](https://github.com/odogono/mercenary/pull/691), [#698](https://github.com/odogono/mercenary/pull/698) document earlier passing broader regressions; final #686 validation must rerun the required suites. |
| No Gameplay Session or Saves/Session Resume access; `/catalogue` preserved and Dion route documented/tested | Delivered boundary and tests | [ADR 0061](../adr/0061-admit-a-sessionless-dion-catalogue-under-the-dion-path.md), [route contract](../dion-catalogue-contract.md#route-and-link), [browser storage/request instrumentation](../../web/e2e/dion-catalogue.e2e.ts). The browser test checks zero Storage operations and no playable payload/session/save/resume/script/title requests during inspection. |

## Child acceptance audit

Each row follows the corresponding issue's acceptance order. “Delivered” describes the bounded child deliverable; preview certification and integrated fidelity stay with the parent and #686.

### #680: contract and coverage ledger

[Issue](https://github.com/odogono/mercenary/issues/680), closed by [#687](https://github.com/odogono/mercenary/pull/687).

| Item | Verdict | Evidence |
| --- | --- | --- |
| Complete census inventory and non-geometric dispositions | Delivered | [Contract inputs](../dion-catalogue-contract.md#inputs), [ledger](../../research/mercenary-iii-st/catalogue-ledger.json), [reconciliation tests](../../research/mercenary-iii-st/tests/test_catalogue_ledger.py). Later geometry recoveries expand identities while preserving census accounts. |
| Stable geometry/model/instance/Floor/Body/place/provenance/variant/gap schemas | Delivered | [Contract identities and export schemas](../dion-catalogue-contract.md); original references and Geometry Identities remain separate from app IDs. |
| MIDAS rule and LOGOS evidenced states | Delivered | [Contract](../dion-catalogue-contract.md), ledger `midas`/`logos`, export `field`/`constructions`. |
| Title-local export, playable compatibility, sessionless route/link, existing `/catalogue` | Delivered | [ADR 0061](../adr/0061-admit-a-sessionless-dion-catalogue-under-the-dion-path.md), [contract route](../dion-catalogue-contract.md#route-and-link). |
| Committed contract/ledger, meaningful validation and decoder/preview/completion rules | Delivered contract; milestone gate remains active | [Ledger validator](../../research/mercenary-iii-st/m3lab/catalogue_ledger.py), [tests](../../research/mercenary-iii-st/tests/test_catalogue_ledger.py). Completion requires recovered state plus non-null preview evidence and zero blocking gaps. |

### #681: objects and visual forms

[Issue](https://github.com/odogono/mercenary/issues/681), closed by [#690](https://github.com/odogono/mercenary/pull/690).

| Item | Verdict | Evidence |
| --- | --- | --- |
| Model references for all 246 slots; shared geometry without resident collapse | Delivered | [Object report](dion-object-geometry.md): 190 object identities, 239 modelled slots and 7 NULL slots; per-slot forms/lettering preserved. Street furniture's 38 models belong to #682. |
| Required primitives/transforms/colour/lettering/forms, unsupported forms documented | Delivered static recovery | [Model reader/header/turn/vehicle study](dion-object-geometry.md), [decoder](../../research/mercenary-iii-st/m3lab/geometry.py), [object tests](../../research/mercenary-iii-st/tests/test_catalogue_objects.py). 208 variants include header-selected states and viewer forms; articulated rest pose, lamp states and procedural-debris disposition are explicit. |
| Ranges, hashes and baseline; static versus observed behavior | Delivered | [Source ledger and runtime-writer qualifications](dion-object-geometry.md), [extraction](../../research/mercenary-iii-st/m3lab/catalogue_objects.py), export geometry provenance. The two-slot explosive-table write is explicitly static evidence, not observed play. |
| Reproducible extraction and per-slot geometry/disposition ledger; no required missing geometry | Delivered recovery | [Reproduction recipe](../../research/mercenary-iii-st/README.md#dion-object-recovery), [ledger](../../research/mercenary-iii-st/catalogue-ledger.json). Slot 74's transient debris is evidenced empty geometry. |
| New-form regressions and representative original comparisons across paths | Delivered recovery comparisons; further forms remain for #686 | [Tests](../../research/mercenary-iii-st/tests/test_catalogue_objects.py), [18-scene object matrix](dion-object-geometry.md#comparison-with-original-scenes). ATTACK SHIP/revealed OBSERVER, transporter inside, passenger/profile forms were not all isolated in that matrix. |

### #682: surfaces and exterior details

[Issue](https://github.com/odogono/mercenary/issues/682), closed by [#688](https://github.com/odogono/mercenary/pull/688); [#689](https://github.com/odogono/mercenary/pull/689) records the pure coast seam evidence.

| Item | Verdict | Evidence |
| --- | --- | --- |
| All groups/bindings/storage and selected geometry/alias/transform/palette/details | Delivered | [Surface report](dion-surface-recovery.md), [extraction](../../research/mercenary-iii-st/m3lab/catalogue_surface.py), ledger; 317 identities and 14 surface empties. |
| Ground/road/templates/attachments/lettering/variants without lost placement bindings | Delivered | [Surface report](dion-surface-recovery.md): 153 ground records, 150 structure alias scales, 152 detail scales, 263 ground transforms; 689 cells with Drawn Record overrides and explicit plain-empty ground. |
| MIDAS repeating rule and LOGOS captured initial/constructed structures | Delivered | [Special-layout evidence and scenes](dion-surface-recovery.md), [surface extraction](../../research/mercenary-iii-st/m3lab/catalogue_surface.py), export states. |
| Provenance/contract/capture recipe/complete recovery ledger | Delivered | [Report source ledger and reproduction](dion-surface-recovery.md), [surface tests](../../research/mercenary-iii-st/tests/test_catalogue_surface.py). |
| Distinct-path tests and originals: aliases/joins/details/special layouts | Delivered recovery checks; coast visual verdict needs integrated rerun | [Original-scene matrix](dion-surface-recovery.md): 12 scenes, plus all 36 Land/Sea probes agreeing. Historical coast frame agreement was about 50% because the old planner omitted sea/islands. [#698](https://github.com/odogono/mercenary/pull/698) adds coast/ground-text rendering; final fidelity is not established by the historical matrix. |

### #683: Floors and residents

[Issue](https://github.com/odogono/mercenary/issues/683), closed by [#691](https://github.com/odogono/mercenary/pull/691).

| Item | Verdict | Evidence |
| --- | --- | --- |
| All Floor selectors/relevant Floors/pitch/alias/regions/details/attachments/lettering/variants | Delivered | [Interior coverage](dion-interior-recovery.md#coverage): all 198 slots, 464 authored Floor bindings, 78 raw IDs/74 authored geometries, 22 interior-only identities. Slot-46 overread explicitly retained. |
| All 180 indoor residents, correct hosts/Floors/hooks/offsets, upper Floors/MIDAS | Delivered placement evidence | [Report](dion-interior-recovery.md), [reader study](dion-interior-reader-notes.md): 101 resident contexts, explicit/dormant association hooks independent of local offsets; 565 original-reader comparisons in total. |
| Title-local provenance/contract and documented decoder paths; no required gaps | Delivered | [Decoder-path table](dion-interior-recovery.md#decoder-paths), [extraction](../../research/mercenary-iii-st/m3lab/catalogue_interiors.py), [ledger](../../research/mercenary-iii-st/catalogue-ledger.json). |
| Selection/alias/association tests and upper-Floor/attachment/lettering original checks | Delivered original-reader/frame-buffer checks; browser pixels outstanding | [Interior tests](../../research/mercenary-iii-st/tests/test_catalogue_interiors.py), [eight original frames](dion-interior-reader-notes.md#representative-original-scenes). These compare reader state and geometry buffers and are explicitly not browser pixel parity claims. |
| Reproducible coverage/capture recipes and separate reachability uncertainty | Delivered | [Reproduction](dion-interior-recovery.md#reproduction), [limits](dion-interior-recovery.md#original-frame-comparisons-and-limits). Every resident's gameplay reachability remains `unverified`; debugger destinations establish placement/selection. |

### #684: export and loader

[Issue](https://github.com/odogono/mercenary/issues/684), closed by [#693](https://github.com/odogono/mercenary/pull/693).

| Item | Verdict | Evidence |
| --- | --- | --- |
| Export all recovered records, provenance and stable cross-links | Delivered | [Exporter](../../research/mercenary-iii-st/m3lab/catalogue_export.py), [tracked export](../../payload/dion/catalogue/catalogue.json), 529 geometry files admitted in current audit's [loader test](../../web/test/dion-catalogue.test.ts). |
| Automatic census/dictionary reconciliation, missing/duplicate/inconsistent detection | Delivered | [Strict loader](../../web/src/dion/catalogue.ts), [corruption tests](../../web/test/dion-catalogue.test.ts), [ledger validator](../../research/mercenary-iii-st/m3lab/catalogue_ledger.py). |
| Dispositions/evidence gaps/MIDAS/LOGOS retained | Delivered | Export `coverage`, `gaps`, `resolvedGaps`, `field`, `constructions`, `workingSlots`, `carriedStack`; [loader tests](../../web/test/dion-catalogue.test.ts). |
| Useful strict title-local diagnostics and unchanged playable identity | Delivered isolation; regeneration check currently fails earlier | [Loader tests](../../web/test/dion-catalogue.test.ts), [export test](../../research/mercenary-iii-st/tests/test_catalogue_export.py), [#693 validation](https://github.com/odogono/mercenary/pull/693). Current Python failure occurs at tracked-Catalogue file-set comparison before the final playable-hash assertion. |
| Deterministic regeneration and meaningful cross-link/disposition/upper-Floor/state tests | Implementation delivered; current regression blocks green verification | [Export tests](../../research/mercenary-iii-st/tests/test_catalogue_export.py) reproduce the exporter twice, but their comparison with all tracked JSON incorrectly includes separately generated rendering support. Resolve ownership and rerun; do not waive deterministic regeneration. |

### #685: sessionless browser inspection

[Issue](https://github.com/odogono/mercenary/issues/685), closed by [#698](https://github.com/odogono/mercenary/pull/698).

| Item | Verdict | Evidence |
| --- | --- | --- |
| Contract route/link, validated Catalogue only, `/catalogue` and Title boundaries | Delivered | [Inspection tests](../../web/test/dion-catalogue-inspection.test.ts), [browser test requests](../../web/e2e/dion-catalogue.e2e.ts), [route contract](../dion-catalogue-contract.md#route-and-link), merged PR. |
| Search original IDs/names; Body/group/place/Floor filters; definitions versus instances | Delivered | [Index/filter code](../../web/src/dionCatalogue/inspection.ts), [inspection tests](../../web/test/dion-catalogue-inspection.test.ts), browser tests. |
| Objects/surfaces/Floor previews, host navigation and direct links | Delivered implementation; comprehensive fidelity outstanding | [Preview code](../../web/src/dionCatalogue/preview.ts), [unit tests](../../web/test/dion-catalogue-preview.test.ts), [host/Floor/direct-link browser interactions](../../web/e2e/dion-catalogue.e2e.ts). |
| Understandable dispositions/gaps, MIDAS and LOGOS without campaign scripts | Delivered | [Dispositions and special-state tests](../../web/e2e/dion-catalogue.e2e.ts), [inspection tests](../../web/test/dion-catalogue-inspection.test.ts), [preview tests](../../web/test/dion-catalogue-preview.test.ts). |
| Sessionless; routing/storage/filter/preview/navigation/failure tests | Delivered tests; audit did not rerun browser suite | [Storage instrumentation and diagnostics/retry browser tests](../../web/e2e/dion-catalogue.e2e.ts); [#698](https://github.com/odogono/mercenary/pull/698) records 44 browser checks and subsequent 14 focused checks. |
| Shared renderer, Dion planning/palette, no independent renderer/parity claim | Delivered architectural seam | [Preview](../../web/src/dionCatalogue/preview.ts) calls `planDionFrame`; [boot](../../web/src/dionCatalogue/boot.ts) uses shared Authentic rendering; [coast seam](../../web/src/coast/islands.ts) consumes Title-local data. [ADR 0060](../adr/0060-share-one-renderer-across-the-titles-with-an-authentic-indexed-mode.md) remains the direction. |

## Current verification and remaining work

Run from `web/`:

```sh
bun test test/dion-catalogue.test.ts test/dion-catalogue-inspection.test.ts test/dion-catalogue-preview.test.ts
```

Result at the audited commit: **20 passed, 0 failed, 931 assertions**. These checks admit all 529 geometry files, reject malformed/foreign content and bad links, exercise census-wide indexing and special layouts, plan every stored variant, and reproduce the 36 original Land/Sea answers. Their implementation and assertions are primary evidence in the [three test files](../../web/test/dion-catalogue-preview.test.ts).

Run from the repository root:

```sh
PYTHONPATH=research/mercenary-iii-st:research/mercenary-iii-st/tests \
  python3 -m unittest discover -s research/mercenary-iii-st/tests -p 'test_catalogue*.py'
```

Result: **48 run, 6 skipped, 1 failure**. The failing `test_full_export_and_repeatable_regeneration_leave_playable_payload_unchanged` compares the exporter-produced Catalogue/geometry JSON set with all tracked JSON, which now also contains `render-support.json` from the separate [render-support generator](../../research/mercenary-iii-st/m3lab/catalogue_render.py). This must be corrected with an explicit ownership/verification rule. Capture-dependent skips are not original-evidence verification. Sources: [export regression](../../research/mercenary-iii-st/tests/test_catalogue_export.py), [render-support tests](../../research/mercenary-iii-st/tests/test_catalogue_render.py).

Before #679 can close, #686 needs to record per-identity/per-variant preview evidence, compare at least one representative per record family and variant axis against reproduced original scenes, update corrected historical planner defects and remaining fidelity limits, and rerun deterministic generation and required existing regressions. Empty identities need evidenced absence rather than invented geometry; static inspection states and rest poses remain distinct from animation and campaign behavior. Sources: [completion contract](../dion-catalogue-contract.md#coverage-and-completion), [object limits](dion-object-geometry.md#remaining-limits), [interior limits](dion-interior-recovery.md#original-frame-comparisons-and-limits), [#686](https://github.com/odogono/mercenary/issues/686).

This audit has not reproduced original scenes, captured browser screenshots or completed the final comparison matrix. Its ledger counts, test results and outstanding preview status are a snapshot of the audited commit; subsequent #686 work should add a dated resolution rather than treat them as the final integrated verdict.

## Follow-up review and resolutions, 2026-10-01

The historical audit above describes `a8a54b9`; this section reviews the subsequent #686 working changes. The final integrated comparison matrix, reproduction commands, regression results and acceptance decisions belong to [Dion Catalogue validation](dion-catalogue-validation.md). Original RAM, PNG comparison sheets and disassembly remain under ignored `restricted/` paths. This review used the `code-review-and-quality` skill to inspect tests first and evaluate correctness, readability, architecture, security and performance independently of the implementation author.

### Three confirmed presentation defects corrected

| Defect | Primary-source finding | Reviewed correction and regression |
| --- | --- | --- |
| Connection sign's viewer-selected front was omitted | Catalogue street-furniture records `model-03a686`/`model-03a762`, entries 349/350, retain `base.alternatives`; ground `ground-01c90e` places both. The adapter overwrote those alternatives with an empty list. The original front at `$3A6E4` carries the blue plane and lettering absent from the browser. | [Model adapter](../../web/src/dionCatalogue/model.ts) retains stored alternatives. [Pixel regression](../../web/test/dion-catalogue-preview.test.ts) checks the original blue front beside the yellow wall. Recorded frame agreement rises from 90.65% to 98.49%. |
| MIDAS wall camera inherited a resident's elevated world height | Original destination `$5A0F8..$5A102` writes resident Y + 63 into world eye `$714A`; `$56E2C` separately resets local structure eye `$703C` to 63. `$5B73E..$5B78A` uses that local eye for wall heights. The MIDAS capture has world eye 93 and local eye 63, explaining the whole-wall 11-pixel vertical displacement. | [Captured-scene preparation](../../research/mercenary-iii-st/m3lab/catalogue_scenes.py) records the independent local eye; [preview adapter](../../web/src/dionCatalogue/preview.ts) applies it to the structure Floor offset while retaining resident/world coordinates. The [pixel regression](../../web/test/dion-catalogue-preview.test.ts) checks the correct orange wall row. Recorded agreement rises from 80.30% to 99.36%. |
| Upper-Floor details were selected and moved with lift-relative wall geometry | Original `$54D62..$54D68` uses negative absolute eye height `$70C6` for detail selection, and `$54EA0..$54EB0` scales authored detail coordinates then adds that camera-relative origin. Floor base is absent from this path. Original `$AA50` is empty in Companies House Floor 4, Enterprise basement, mirrored Floor 9 and VELOS Floor 9. The browser subtracted Floor base, selected ground-height room details and painted an extra dark-blue pane. | [Dion Frame Planner](../../web/src/dion/frame.ts) uses absolute eye height and ground-based Y for detail vertices/text, keeping structure/wall-text offsets separate. The [upper-Floor regression](../../web/test/dion-catalogue-preview.test.ts) requires no detail primitives for the evidenced mirrored Floor 9 camera. Recorded agreement rises from 90.89% to 97.49%. |

The before/after metrics above are observations from the ignored `restricted/mercenary-iii-686/comparisons.json` and comparison sheets reviewed during this follow-up; the final [validation matrix](dion-catalogue-validation.md) owns the published numbers and verdicts. Original instruction-address evidence was checked in the ignored census reader disassembly and the referenced scene RAM. These corrections independently implement documented original behavior and introduce no copied original code or separate renderer.

### Prison lettering discrepancy classification

At this review stage, `prison-lettering` agrees by 94.39%. Its remaining comparison sheet has a missing entire blue object around view columns 156–223, rows 73–92, and a large foreground region; this is broader than the previously documented [one-row and sliver raster residue](mercenary-iii-taxi-projection.md#unsupported-cases-and-remaining-gaps).

The original scene's fixed draw list at `$7422` is `[0,220,219,181,165,16,13,3]`. In the captured RAM, surface residents **219 MAILBOX** and **220 MARGARETS LETTER** are just `(18,163)` from the camera in X/Z, at Y 0 and 60. The current host preview draws only modelled indoor resident 124 COBWEB. The missing blue footprint is consistent with the nearby mailbox. The recovered [Catalogue object inventory](../../payload/dion/catalogue/catalogue.json) retains the surface residents; the [preview's resident selection](../../web/src/dionCatalogue/preview.ts) excludes objects outside the indoor host. This is an original-stage composition omission, independently of the lettering itself. Before accepting this scene, reproduce the relevant fixed residents in the compared composition or clearly establish and document the narrower host-preview comparison scope. Do not classify it as exact-raster parity residue.

### Review findings and five-axis verdict

Tests were read before the implementation: decoder odd-address lettering, recovered group palettes/glyph inventory, deterministic export plus separately generated support, variant certification/corruption rejection, scene pixels for Connection/MIDAS and upper-Floor detail omission, and browser-canvas hashes across families. These assertions target observed failure modes and composition boundaries. Sources: [Python tests](../../research/mercenary-iii-st/tests/test_catalogue_surface.py), [preview certification tests](../../research/mercenary-iii-st/tests/test_catalogue_previews.py), [browser preview regressions](../../web/test/dion-catalogue-preview.test.ts), [canvas comparison test](../../web/e2e/dion-catalogue.e2e.ts).

| Axis | Verdict at this review stage |
| --- | --- |
| Correctness | The three fixes match primary reader evidence. **Required:** live token export must stop at the first NUL rather than remove all zeros, and selected Floor labels must be rebound. **Required:** resolve or accurately scope the prison surrounding-resident omission above. |
| Readability | Original-reader addresses and explicit camera/context comments explain the unusual coordinate seams. Tool formatting is covered by the root's formatting checks. |
| Architecture | Changes retain Title-local Catalogue loading, Dion frame planning and shared Authentic rendering. Exact evidence cameras are a preview capability, independent of Gameplay Session/Saves. Detail Y corrections remain in Dion's planner because they are Title rules. |
| Security | No new dependencies, account writes or executable original instructions. The comparison tool resolves inputs beneath ignored `restricted/` and validates scene IDs before writing comparison images. Browser data continues through strict Title/schema/source admission. |
| Performance | Camera replay adds no unbounded browser fetch or permanent renderer. Coverage traversal is an explicit offline task over the finite recovered census. Stored geometry continues to use the shared bounded cached store. |

The live-token issue is concrete: render support currently turns token `$80`'s four-byte opening read `[71,0,48,48]` into `[71,48,48]` (`G00`) by filtering zeros, although the original string terminates after `G`. The adjacent bytes belong to other mutable buffers. The same token must read the selected Floor's `G`, `1`–`9` or `B`, as the original `$56DFA`/`$56E28` writers do. Sources: [support exporter](../../research/mercenary-iii-st/m3lab/catalogue_render.py), [preview token binding](../../web/src/dionCatalogue/preview.ts), Catalogue `lettering.tokens.$80`, original scene RAM `$B2D0`.

**Review verdict at this stage: request changes** for those remaining correctness findings; final suite execution and any subsequent fixes are recorded by the root agent in the [validation report](dion-catalogue-validation.md). The historical regeneration failure is being addressed by the [export integration test](../../research/mercenary-iii-st/tests/test_catalogue_export.py), which now generates render support explicitly before comparing the complete tracked JSON set. The new [preview coverage report](../../research/mercenary-iii-st/catalogue-previews.json) inventories 529 identities and 791 stored variants, and [ledger admission](../../research/mercenary-iii-st/m3lab/catalogue_ledger.py) checks identity/hash/state/variant agreement and drawable counts; this is static coverage evidence, not exhaustive original-game pixel parity.

### Final follow-up assessment, 2026-10-01

The implementation author addressed both required findings, and this reviewer inspected the resulting changes and regression tests:

- [Live-token export](../../research/mercenary-iii-st/m3lab/catalogue_render.py) now takes the prefix before the first NUL. [Preview token composition](../../web/src/dionCatalogue/preview.ts) supplies the selected Floor's label; an exact evidence camera can explicitly retain the captured original `$B2D0` value. This preserves the distinction between current static inspection selection and a debugger destination's retained mutable label buffer.
- Floor-zero [placement composition](../../web/src/dionCatalogue/preview.ts) includes surface residents in the selected physical Body cell, using their recovered positions and separately pinned opening yaw. [Support admission](../../web/src/dionCatalogue/support.ts) requires exactly the census's surface-slot inventory with yaw bytes in range. Model composition also binds each resident's own lettering, preventing shared opening buffers from substituting another key's letter. The [regressions](../../web/test/dion-catalogue-preview.test.ts) require mailbox/letter models and independent key lettering. Prison lettering now agrees by **97.91%**, and the omitted object regions are accounted for.

The comparison tool also resolves the buffer-timing ambiguity: [scene preparation](../../research/mercenary-iii-st/m3lab/catalogue_scenes.py) records the RAM path and hash; [comparison](../../web/tools/dion-catalogue-compare.ts) verifies that hash and reads the ST bitplanes from the buffer named by `$42C01`, with the frame palette and horizon split. This is the frame drawn from the captured pose. The displayed PNG is the previous buffer and no longer supplies the pixel verdict. Beacon variants are selected from the original frame's actual patched lamp bytes, rejecting inconsistent target colours; the older recovery recipe's requested lamp state did not freeze blinking. Sources: [laboratory loop-top timing](../../research/mercenary-iii-st/README.md), [beacon header behavior](dion-object-geometry.md#beacon-lamps), the two comparison tools.

**Final code-review verdict: approve the reviewed implementation changes.** The three primary-reader corrections and both subsequent required findings are resolved. Independent reruns in this review passed **18 preview tests / 871 assertions** and **2 preview-evidence admission tests**. The root agent reports **119 laboratory tests with no skips, 2,457 web tests and 37 browser tests** passing; its final [validation report](dion-catalogue-validation.md) owns the complete execution record and milestone verdict.

| Axis | Final assessment |
| --- | --- |
| Correctness | Reader semantics, independent camera contexts, exact Floor tokens and nearby residents are covered by concrete regressions. Scene comparisons now use the drawn buffer, verify original RAM identity and bind actual beacon state. Static evidence admission rejects foreign image hashes, missing/duplicate identities, geometry-hash/state differences, absent variants and nonempty geometry with no drawn primitives. |
| Readability | Coordinate exceptions retain source-address comments and named evidence fields; the portable coverage report explicitly labels its scope. No unnecessary permanent rendering abstraction was introduced. |
| Architecture | Catalogue geometry continues through Title-local strict admission, Dion planning and the shared Authentic renderer. Captured-pose overrides remain inspection/evidence inputs; no session or save boundary is widened. |
| Security | Comparison kind/version/source and original RAM hashes are checked. Paths resolve beneath ignored Restricted Material, and scene IDs are checked before constructing output paths. New browser support data is validated at admission. No new dependency or credential handling is introduced. |
| Performance | Runtime loading retains bounded caching and finite per-cell resident selection. Exhaustive identity/variant and placement/Floor/region enumeration is an explicit offline certification tool. |

Remaining constraints require accurate presentation in the final matrix, not another required code correction identified by this review. Exact ST edge rows, lines and zero-area slivers remain [documented raster limits](mercenary-iii-taxi-projection.md#unsupported-cases-and-remaining-gaps). Static articulation, lamp/forms and attachment inspection do not certify animation or campaign reachability. The waived sky Body inventory remains named in coverage. The additional **TOURCRAFT-at-spaceport** original-stage probe currently has **66.82% whole-frame agreement** because its isolated object preview omits the surrounding spaceport roads/apron; the comparison sheet shows the broad road footprint missing, rather than an equivalent craft geometry failure. Its final verdict must explicitly use that narrower object scope or include the surrounding scene, and must not relabel the missing stage as raster error. Sources: [object-scene scope and prior footprint comparison](dion-object-geometry.md#comparison-with-original-scenes), [current comparison tool](../../web/tools/dion-catalogue-compare.ts), ignored `tourcraft-spaceport.png`, final [validation matrix](dion-catalogue-validation.md).

The preview report's geometry hashes prove correspondence with recovered records, and regeneration against the final renderer/support inputs proves current preview coverage. They do not independently hash renderer source or prove every original form in every possible scene. Retain this reproducibility step after any later renderer/support change; a previously admitted positive primitive count alone is not a fresh verification of that change. The root agent's final regeneration and comparison records remain the completion evidence.
