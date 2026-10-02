# Mercenary III TOURCRAFT: original scenes and comparison coverage (R7)

Research for [#708](https://github.com/odogono/mercenary/issues/708), 2026-10-02. The [promotion report](mercenary-iii-tourcraft-promotion.md) and [versioned promotion manifest](../../research/mercenary-iii-st/tourcraft-promotion-manifest.json) own the exact content admission. This note owns the original-scene recipes, encountered-cell accounting and deterministic comparison matrix. It uses the [R5 route](mercenary-iii-services-progression.md#natural-metis-spaceport--tolosa), the [accepted R6 schedule](mercenary-iii-tourcraft-followup.md#new-probe-results), the [connected campaign controls](mercenary-iii-tourcraft-campaign.md) and the existing [Catalogue validation](dion-catalogue-validation.md). No runtime or playable Data Payload is changed.

## Original recipes and evidence classes

All original runs retain the STX, EmuTOS and Hatari identities in the [baseline manifest](../../research/mercenary-iii-st/config/baseline.json): STX `4e8b74122910bcaa109b944eebb6f0ec18fdeb1175c34eea3c932d0e1b18b62c`, TOS `154803e3ff4851f3dc358b91b16d6b6110d187a81d8132ecb665af49878939d5`, Hatari 2.6.1 `05723606c75a1f0642395974abdce2cbbe48b0a09a747f65cdfca7ef9201e11a`. Raw RAM, media, screenshots, debugger scripts and generated comparisons stay ignored under `restricted/mercenary-iii-708/`, following [ADR 0002](../adr/0002-separate-rom-research-from-implementation.md).

**Natural route:** cold boot the baseline at its ordinary 8 MHz/approximately 60 Hz configuration. Deliver the fourteen R5 input-mailbox/stick writes: Enter at VBL 6000, `*` 7300, forward 10000, release 10650, B 10700, `+` 11600 and 11900, `*` 12200, L 22000, left 22650, release 23075, forward 23100, release 23450, B 23500. Those are original inputs; no pose, cash, time, script, Body or geometry is forced. Stop the approach using resident 13/service reference `$34` and the original proximity guard, rather than treating the VBL recipe as a gameplay deadline. The fresh repeat `presentation/r7-natural60-ceounh33/` records fifteen paired RAM/PNG checkpoints. Its `plan.json` and `command.json` retain the exact configuration. Sound is off in this view run; the separate [presentation report](mercenary-iii-tourcraft-presentation.md) owns audio and sky/flight readers.

**Phase boundaries:** a second fresh natural route, `presentation/traced/r7-traced60-t7ijikuv/`, installs read-only original-PC callbacks and one-shot `$5A41A` captures conditioned on playback frame. `presentation/exact2/` retains frames 138, 139, 140, 461, 462, 463, 883, 884, 926, 927 and 928. A requested frame-1 top was not reached; first-route frame 8 supplies the aboard fixture. These natural frame numbers identify the recovered control stream, not exact wall time or the accepted synthetic atomic schedule. [R6](mercenary-iii-tourcraft-followup.md) independently proves that schedule and its exceptional second interpreter invocation at frame 139.

**Immediate exterior movement:** restore the second natural route's whole-machine `exact2/ck35000.sav`, retaining its actual emulator phase. Deliver forward at VBL 35100, release 35600, right 35700, release 36200, forward 36300, release 36800. Capture the first original top at or after 35050, 35610, 36210 and 36810. `views/movement/r7-movement-xe_b3npb/` records the actual commands and every top. This is an original-input continuation of a naturally reached state, with no forced destination or geometry. It stays on foot, Floor 0, TOLOSA group 23/cell `01-00`. The two walks change XYZ from `[179475394,63,102992879]` to `[179473922,63,102994351]`, then `[179473218,63,102992239]`; the turn changes view yaw `$FD79` to `$0029`. It admits immediate walking and looking, without activating Bil's dialogue/interior, onward service or a return flight.

**Static and synthetic evidence:** Catalogue's 791 form/disposition checks and 19,787 placement/Floor/region contexts establish geometry coverage, not natural visits. R6's strict 32/16 MHz and late-threshold runs are synthetic timing/initial-threshold controls, explicitly separate from these fresh natural captures. Their source-derived cell sequence is used below; their intervention does not become a gameplay prerequisite.

## Encountered cells and bounded surroundings

The original `$55E90..$55EC0` cell-selection reader packs the two relative cell coordinates when both lie in `0..15`; otherwise it selects workspace cell zero. A nonzero `$70C0` first masks both coordinates modulo sixteen. All inspected METIS/TOLOSA natural fixtures have `$70C0=0`. The reader range in R6 `exact-11-14c2p26m/near.ram` has SHA-256 `1cb01266e92686b05d748cffa121acbfe778809f32a8369e57fff37c4d3c1101`; that complete RAM has SHA-256 `0b404a1dd813fc79dc95fbe2b280ec4be6a79060dd3a7bad6844e447ecc04f39`. The original relative-coordinate words `$70C2/$70CA` and `$71F4` agree with the derived Body/cell result in all fifteen first-route RAM samples. The physical island origins come from the Catalogue's original Body descriptors: METIS `[2527,1066]`, TOLOSA `[2737,1571]`. Coordinates preserve the original Body's wrapping; an out-of-core zero is a workspace selection, not a claim that the craft physically occupies the authored `00-00` place.

An independent ignored parser reads every retained original loop-top XYZ, Body and selector sample from the strict 32/16 MHz logs, excludes System-space coordinates, and applies that recovered cell rule. Both strict flights yield the same **sixteen distinct Body/cell pairs: thirteen METIS and three TOLOSA**. These are source-derived all-frame cells, with direct RAM cross-checks at sampled phases; the historical logs do not contain `$71F4` at every frame.

| Body/group | Cell | Flight top frames, strict runs |
| --- | --- | --- |
| METIS / 3 | `02-00` | 2–73; also the preboarding checkpoint |
| METIS / 3 | `02-01` | 74–79 |
| METIS / 3 | `02-02` | 80–82 |
| METIS / 3 | `02-03` | 83–85 |
| METIS / 3 | `02-04` | 86–87 |
| METIS / 3 | `02-05` | 88 |
| METIS / 3 | `02-06` | 89–90 |
| METIS / 3 | `02-07` | 91 |
| METIS / 3 | `02-08` | 92 |
| METIS / 3 | `02-09` | 93 |
| METIS / 3 | `02-0a` | 94 |
| METIS / 3 | `02-0d` | 95 |
| METIS / 3 | `00-00` fallback | 96–139 |
| TOLOSA / 23 | `00-00` fallback | 462–788 |
| TOLOSA / 23 | `02-00` | 789–811 |
| TOLOSA / 23 | `01-00` | 812 through recorded Leave 927 and first on-foot top 928 |

The R6 late-election, both-threshold and active-mining boarding flights retain this same derived outward cell sequence. Their standing/free-wait controls remain at METIS `02-00`; passive programme expiry adds no visited cell. The independent ledger `views/encountered-cells.json` preserves each run's real path, log hash, sample count and first/last frames. An aborted initial active-mining run contributes only its actual checkpoint and is not counted as another successful flight.

[The recovered surface draw order](mercenary-iii-taxi-content-presentation.md#world-structure-static) draws only the occupied cell's structure/ground and its instantiated templates, followed by the fixed resident list and association hooks. Adjacent structures are not drawn merely because they are nearby. The fresh sampled fixed list changes from METIS `[0,220,219,181,165,16,13,3]` to TOLOSA `[0,174,58,57,56,16,13,3]`; space retains a different resident publication while surface structure drawing is absent. These lists must retain their captured identity and updates. R6's admitted campaign/arrival programme also requires the real passive OBSERVER model 320 and trajectories of residents 56–58, including existing trajectories across an override, space suspension and departure. Geometry coverage does not enable hostile phase 321 or firing; [R6's guards](mercenary-iii-tourcraft-campaign.md#passive-encounter-programme-and-phase-ownership) establish that boundary.

The promotion manifest conservatively includes both complete 16×16 workspaces, **512 ground-cell bindings**, and all 39 exterior placements in groups 3/23. This covers free looking, the observed immediate movement and later permitted exterior movement without guessing an artificial radius or dropping default ground cells. It is static drawable closure, not evidence that this flight visited 512 cells or permission to enter each building. Existing D1 interior coverage remains separate. Both Bodies use recovered empty island geometry `island-06330a`; no invented coastline is inserted. Other visible sky Bodies remain drawing dependencies, not playable Destinations.

## Comparison method and phase matrix

Thirty captured states are compared deterministically through the existing Dion Frame Planner and shared Authentic renderer. The ignored `views/prepare.py` reads each capture with the existing MIII world/model decoders, retaining each record's actual source range/digest. The comparison reads decoded geometry from those ignored documents and coast geometry through the validated Catalogue. It is an original-stage diagnostic, not a playable export or a proof that a mutable gameplay capture is immutable Catalogue content. The promotion report separately verifies that compatibility.

Three variants are retained for each state: current planner, actual pilot geometry, and phase-support diagnostic. The latter two explicitly remap decoded model **279** to the planner's existing 263/264 driver lookup in the ignored adapter, retaining the source model/range identity; this is not a claim that 279 is either taxi head. The phase-support variant additionally supplies recovered uniform `$001` space background and a 136-row space star clip. It retains the current planner's D1 star projection and level geometry projection. No application file or permanent renderer is patched.

The state adapter uses presentation eye `$7126/$712A/$712E`, view yaw `$7136`, the original day flag `$70E4`, live resident poses, captured region, sign and frame-relative blink phase. It preserves the surface cabin's **64-unit eye offset**; numeric craft XYZ `$7146/...` alone is not the eye. Comparing palette-pointer equality as a universal day flag would incorrectly select daytime in these nighttime fixtures. Palette records are read to their recovered 64-entry extent, rather than truncating at the old playable document's 22-word schema. The original image is reconstructed from ST bitplanes, the frame palette shadow and the appropriate raster split. In space the stale surface horizon/land words are **not** applied: the original branch supplies a uniform sky palette.

Agreement is over 43,520 pixels at three-bit ST gun depth. It has **no pass threshold** and does not certify small objects. Sheets retain `original drawn buffer | planner | magenta difference`. The rows below use the phase-support diagnostic. Actual current/planner/pilot variants, geometry/model diagnostics, camera, source-document hash and output hashes remain in `views/comparison.json`.

| Phase | Natural fixture / original top frame | Prerequisites and required drawing coverage | Diagnostic agreement |
| --- | --- | --- | ---: |
| Pre-board | `v23450` / 1800 before reset | Foot; METIS `02-00`; spaceport plan/detail/ground/templates; resident 13 exterior, applicable fixed residents; METIS night sky | 96.82% |
| Aboard | `v23600` / 8 | Playback/passenger admitted; same physical stage; cabin form ×16, head 279, presentation eye 127; pilot/message context retained | 93.40% |
| Launch | `v24500` / 78 | METIS `02-01`; craft/cabin, pitched camera, changing height and used surface sky | 53.53% |
| Space | `v25000` / 143 | Selector 2; System eye; cabin/head, actual star programme, full used sky Body drawing; uniform `$001` background | 96.99% |
| Body entry, settled | `v29000` / 499 | TOLOSA Body `$64`, group 23; high altitude, fallback cell zero; actual Body motion/sky matrices, arrival observer programme, cabin/head | 57.25% |
| Descent | `v30000` / 633 | TOLOSA high-altitude fallback cell; pitched sky/ground camera, cabin and programme actors | 41.72% |
| Final approach | `v33000` / 879 | TOLOSA `01-00`; arrival exterior/ground/templates, live actors, pitched cabin and contact prerequisites | 54.06% |
| Landed, before Leave | `f926`, `f927` / 926, 927 | Contact already completed; still passenger/playback; eye 127, cabin/head, arrival surroundings; recorded L remains separate | 94.73%, 94.75% |
| On-foot arrival | `f928` / 928 | Recorded L consumed; selector/slot `1/$FFFF`, playback/passenger zero; eye 63; same `01-00` surroundings and live observer future | 98.47% |
| Immediate forward | `m35610` / 1083 | Same Body/group/cell/Floor; actual walking displacement, exterior camera and residents | 99.32% |
| Immediate right look | `m36210` / 1136 | Same XYZ; actual yaw `$0029`; alternate faces, exterior painter order and resident state | 99.01% |
| Second forward | `m36810` / 1188 | Second actual walk; still on foot/Floor 0/cell `01-00`; no building/service interaction | 97.71% |

The low pitched-flight agreement is a concrete limit of the current D1 planner, which uses `levelCamera` for ordinary world geometry. It does not establish missing original geometry or justify a substitute. The [presentation recovery](mercenary-iii-tourcraft-presentation.md) independently checks the full MIII view matrix, packed coefficient quantization, pitched/rolled sky paths and own-title correspondence with Damocles's numeric helpers. I3 must implement that recovered camera/sky behavior and repeat these fixtures. The current planner also reports that an articulated actor reads an angle the D1 slice does not track; its tagged vertices cannot certify the live OBSERVER pose. Current sky Body omission is a planner limit for R7, not an extended D1 waiver. Static Catalogue form checks cannot replace those live comparisons.

### Transition ownership and valid image fixtures

Read-only frame-139/140 and frame-461/462/463 captures preserve transition state, including the recovered zero-tick reentry and post-wait Body setup. They are **not same-state raster fixtures**. At frame 140 the selector has changed to space while the drawn palette's entry 8 remains surface `$011`; at frame 462 the Body has changed to TOLOSA while the drawn entry remains space `$001`. Frame 463 also retains that space palette in this sampled buffer. R6's accepted post-wait tail changes state after drawing. Applying the new selector's palette rules to these preceding buffers yields a spurious mismatch. The matrix therefore compares settled space/Body phases and retains exact transition captures for state/ordering assertions without publishing their percentages as parity evidence. A future renderer comparison must retain the owning draw-state snapshot or capture after the first completed draw in the new phase.

The PNG at an original loop top is the preceding displayed buffer; even reading `$42C01` and the palette shadow does not repair a pose/Body changed later in the frame's post-wait tail. Static/landed/on-foot fixtures and settled flight diagnostics keep these limitations explicit. No screenshot, audio capture or current percentage proves exact ST raster edges, physical Hatari VBL timing, every possible cabin look or arbitrary later campaign views. Audio triggers/programmes and their deterministic register comparisons are owned by the separate presentation recovery; this view run claims no listening comparison.

## Reproduction and validation handoff

Recreate the original runs from the recipes above and verify baseline pins before each boot/restore. To regenerate this diagnostic, run the existing MIII readers through the documented pose/palette/resident adaptation, then the current `planDionFrame`/`frameRgba` path with the explicit pilot/space adaptations above. Preserve captured hashes and compare complete deterministic outputs, not just rounded percentages. All fixture identities are real captures, not a single synthetic universal state. `views/prepare.py`, `compare.ts`, `coverage.py`, `movement.py`, original run configurations, input documents and results remain ignored research artifacts.

The phase prerequisites, all sixteen used Body/cell pairs, both complete workspaces and the recorded arrival/movement exterior reconcile with the promotion manifest. Original geometry and flight presentation facts are recovered; current browser flight projection, full sky composition, mutable model selection/articulation, raster verification and audio/browser equivalence still require I3/I4. R8 separately owns restore-complete futures, including campaign/encounter state. Neither a static preview nor these natural captures promote Bil's dialogue/interior, onward service, return flight, bus, campaign alternatives or hostile play.

### Capture and tool pins

All paths below are relative to ignored `restricted/mercenary-iii-708/`. Each RAM is the actual whole 1 MiB capture; repeated equal-pose states retain separate identities. The comparison ledger additionally pins the decoded input document, indexed/raster output and comparison sheet for each of all three variants.

| Fixture | Whole-RAM SHA-256 |
| --- | --- |
| `presentation/r7-natural60-ceounh33/v23450.ram` | `e1387ae293098f8d07c3324ec5913fd6ca3ef57c4fd2d4a2630d3c905537c7c0` |
| `presentation/r7-natural60-ceounh33/v23600.ram` | `b992e85c8ad10900e7e36328087b65751ba69ce69801f1b86d7ec330a4098f3f` |
| `presentation/r7-natural60-ceounh33/v24000.ram` | `459505e33eb8510c0b551b2b75c1c24a347fbfc45e338151c3eb7c467f016e22` |
| `presentation/r7-natural60-ceounh33/v24500.ram` | `2529823b034c68e6a79db5cdc483ee3c6f6930b2e06326143a97a792b9552e78` |
| `presentation/r7-natural60-ceounh33/v25000.ram` | `b02b9116f9c0843471c0db9e78dd33e7adfd1795c770a9bedfc62bea7cd4e5e3` |
| `presentation/r7-natural60-ceounh33/v26000.ram` | `94acf2b342995b195b796b88bc8131f8a0353c220646807db07f54b87cc38a6b` |
| `presentation/r7-natural60-ceounh33/v27000.ram` | `0e6c20f6bfd3d9a71d32b024e3b8b8648cbb80df65aebb1d90a81f251175d8cf` |
| `presentation/r7-natural60-ceounh33/v28000.ram` | `81dd533c86be49a1b2dacda46107572099e27bac01b7956029af96c4dcc7d8c3` |
| `presentation/r7-natural60-ceounh33/v29000.ram` | `e0a2bfb739f415e4274e6931c20aa0a8a60524199167560e2b0bcdbbbd308b35` |
| `presentation/r7-natural60-ceounh33/v30000.ram` | `238c7ac0f4add7e560454c785185247ff385e80d8d16f8abe80854ca58b46fb8` |
| `presentation/r7-natural60-ceounh33/v31000.ram` | `57c2be0be046e26671b73603cdec25f8e1dc1729cce98fa810cf1de2d6aa6248` |
| `presentation/r7-natural60-ceounh33/v32000.ram` | `fc892b184b4d589005d8803b38a917e36b42e1c4c9203951d9e90facb0176b6c` |
| `presentation/r7-natural60-ceounh33/v33000.ram` | `eaec25470a0af28d01b660472528bc320da787204ef95231f406ee919d2d7cc3` |
| `presentation/r7-natural60-ceounh33/v33750.ram` | `7f6c504ded606a25036a5abf6f13ea0457432e5d0a28808998a28b9cd0d54184` |
| `presentation/r7-natural60-ceounh33/v35000.ram` | `a211f95ef0793ba2894e0bb3a52498a7c517cd175fef0445bb62ea492ca539ad` |
| `presentation/exact2/f138.ram` | `318a7afd0d5f83b38d687d30b53632ab09f43fae5a267dc6ac1b6accbb5fc962` |
| `presentation/exact2/f139.ram` | `413b194ca7727c5ef8222690eaac4a4c7c4346febf4ff5fa42e751dc8814c3af` |
| `presentation/exact2/f140.ram` | `c6ccf602931d52a5c2ad253cbb24e695d5e5049716c34d5fc55c52493a5a717f` |
| `presentation/exact2/f461.ram` | `9a790b84124046c00e668295f84594ae25d4353d704be56e4a1e0fc2e8038657` |
| `presentation/exact2/f462.ram` | `c67319f59bf3237973068c8c71463b62a2a41c371275fcdd1d575a9fa8042401` |
| `presentation/exact2/f463.ram` | `beed536bef87231e6d3cf07cfcf421e58a7fb0900466b7bfc9dc8974bc83ebb3` |
| `presentation/exact2/f883.ram` | `77f25cc35525877a88f425c579006861535dd5d0b5c8179a6e3f651acfc95b95` |
| `presentation/exact2/f884.ram` | `eb5b8bdd4095c80b835d08deef67dd0e3d2d50df8a1b7888858593d99aeecb12` |
| `presentation/exact2/f926.ram` | `332495fd19998c875dedfd7e74a5131308055faeebe095b9970d85acf5f63ccc` |
| `presentation/exact2/f927.ram` | `574c648698c08cb8772a15ba50881e7e56ed43791a986b6c3ba82e8abe5a7ca7` |
| `presentation/exact2/f928.ram` | `20f8931ddeb7ed895204f0105ffaa5e845208a013caef9cc7a80a5075e61e1e3` |
| `views/m35050.ram` | `7f56c842f89e9d773db18e6f77471a8fffd08ddf2d238861cfa2207445d6ffbd` |
| `views/m35610.ram` | `0a61be756e5c75fbb20cec968c498b29204aa74652f57364ee7e3dcede3d9752` |
| `views/m36210.ram` | `6a1875219db17e2c6c570e219066513d8c19d3cd1d36783b9cc8cb273e87e1e5` |
| `views/m36810.ram` | `38dfd238ea7d07a49c53552553e5ec7378e569ac908753caf543b306e4e0a848` |

| Run/configuration/tool | SHA-256 |
| --- | --- |
| `views/prepare.py` | `9babb7273878aa108f213dff2618541e028573407129bfa307f193e0bc8f5d2d` |
| `views/compare.ts` | `e84a75e7ab9561cbca4fe227deef4fea8a46f6adecb7b3a1c4de4b6d32d53ceb` |
| `views/coverage.py` | `18abfe345aff26c1ca36b472cfb57cf00eb31f7d47e1a878974c0a9aee27c75e` |
| `views/movement.py` | `54b574eee28409f0acf671cde1e4fbe2237fc0d921445a73fbc828a8898798ea` |
| `views/encountered-cells.json` | `f063722285a3c5417b38b44fe041620569bf4375684a13af0f6ece050c6fee11` |
| `views/comparison.json` | `293ea963a156397f95009ad71870e27fbcefd25636d05cc775df99db210d86fd` |
| `presentation/r7-natural60-ceounh33/plan.json` | `b40c6bb71d8820cde04d21d7d99dcc576c4e0b983428a7ce35ebd10a1b0b7a06` |
| `presentation/r7-natural60-ceounh33/command.json` | `169e49660b34be9cc8e372fb32cf1152b11697f03097513749e40c2e0322d6f6` |
| `presentation/r7-natural60-ceounh33/hatari.log` | `bb7fc5d1fe6e83d851d8c67dc5785b0752398b7369d8ed0c6cfbd1d81c8a4825` |
| `presentation/traced/r7-traced60-t7ijikuv/hatari.log` | `c46aa4d80135e707a01ca4e677d54d57671a0624b177dd52e5bff4e212e11357` |
| `presentation/exact2/ck35000.sav` | `91e0163fdf64db5c131409bb98a85177987ab12f9f59963249508029b938e795` |
| `views/movement/r7-movement-xe_b3npb/hatari.log` | `20a4ebf7cb0e3a9f9f0419f2d687efab090173ca635e6517f8d4b4947e8a5b50` |

Validation: all thirty source documents decode through the existing MIII readers; all ninety comparison variants complete; a second complete comparison is byte-identical to the first result ledger. Both CPU-controlled cell reductions agree; all fifteen first-route direct cell reads agree with the recovered selector. The natural movement trace retains foot/Floor/cell admission. Required source/capture distinctions and transition fixture limits are preserved. These are research checks, not application regression or a renderer-fidelity pass.
