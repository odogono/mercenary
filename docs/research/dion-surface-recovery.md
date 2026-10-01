# Dion surface recovery: structures, ground, islands and lettering

Recovered 2026-10-01 for [#682](https://github.com/odogono/mercenary/issues/682) under [#679](https://github.com/odogono/mercenary/issues/679), from the pinned **Mercenary III research baseline**. Every fact is read from MIII's own readers, cited by address. No Damocles record is evidence here. [ADR 0002](../adr/0002-separate-rom-research-from-implementation.md) admits the recovery; captures, screenshots and disassembly stay under the ignored `restricted/` root.

The [Dion Catalogue contract](../dion-catalogue-contract.md) defines what is recovered. The [coverage ledger](../../research/mercenary-iii-st/catalogue-ledger.json) records the result.

- **Recovered:** all 317 surface Geometry Identities. Of these, 303 are drawable and 14 are recovered as empty.
- **Gaps closed:** `island-decoder`, `ground-inventory`, `detail-lettering` and `empty-road-geometry`.
- **Previews:** the Catalogue previews (#685) and the #686 matrix are still required before the milestone closes.

## Evidence identity

- **Census run:** `location-census-334983y7`, the #678 run. It supplies the opening image and the original builder's ready workspace for all 57 groups. The opening `start.ram` SHA-256 is `cd697c802472a319fcd8fd5dd7193ad870cf4ff0a7f37cd6fda51893dd899fe4`.
- **Construction run:** `logos-construction-98n5a732`. It is the builder's result for LOGOS with the initial overlay list emptied (see [LOGOS](#logos-construction)).
- **Extraction:** [`m3lab.catalogue_surface`](../../research/mercenary-iii-st/m3lab/catalogue_surface.py) decodes every identity from these two runs. It records each identity's content SHA-256 in the ledger. #684 must export that content unchanged.

## What is recovered

| Family | Identities | Empty | Variants | Reader |
| --- | ---: | ---: | --- | --- |
| Structure, Floor 0 | 52 | 7 | 150 alias scales | `$5AD2C..$5B2D2` via `decode_structure` |
| Building detail | 57 | 2 | 152 scales its binds apply | `$54AEE..$54D20` via `decode_detail` |
| Ground record | 153 | 4 | 263 transforms | `$561AE..$563C4` via `ground_transform`, `decode_ground` |
| Island record | 17 | 1 | none | `$5761A..$5769E`, `$571A8..$574A8` via `decode_island` (new) |
| Street-furniture model | 38 | 0 | in-record forms | `$545AE..$549BA` via `decode_model` |

Structure geometry is shared and keyed by record address. Its per-placement bindings are the 795 cell bindings already in the ledger, each with its own slot, key, dx and dz. Floor geometry above Floor 0 and resident association hooks belong to [#683](https://github.com/odogono/mercenary/issues/683).

### Islands

An island descriptor's geometry pointer (`+4`, read at `$57524`) names a record that is read in both directions from that pointer.

- **Upwards, for drawing (`$5761A..$5769E`):**
  - X/Z vertex words in Body cells, ending at a `$8000` word.
  - Primitive words, ending at a zero word. A word with bit 14 set is a line with two vertex bytes, drawn through `$5873C`. Any other word is a polygon colour, followed by vertex bytes ending in zero, drawn through `$4FEA0`.
  - A vertex byte is the vertex's offset in the projected buffer, four bytes per vertex. Colour words follow the shared rule: with bit 15 set they index the scene palette, otherwise they are ST colours.
- **Downwards, for the Land/Sea answer (`$571A8..$574A8`):**
  - The outer box, then the core box. Each box is read as X lower, X upper, Z lower and Z upper.
  - Sea boxes, ending at a `$8000` word.
  - Edge words, ending at zero. An edge's low byte is four times its start vertex. Its high byte is the end vertex, with bit 15 swapping the two ends and bit 14 selecting the falling-line test (`$57390`).

The answer goes to `$6F56`:

- **Core (0):** the point is inside the core box.
- **Sea (−1):** the point is outside the outer box, or inside a sea box.
- **Land (+1) or sea (−1) by edge:** the single edge whose bounds hold the point decides, by which side of the edge the point lies; a swapped edge reverses the result.
- **Land (+1):** no edge holds the point.

The 17 records run back to back from `$632F6` to `$639B9`, with one alignment byte in places. Every outline with a coast has as many edges as vertices. One record has no coast: it is shared by DIALIS, ICARUS, MIDAS and 19 more placements. Its outer and core boxes span the whole range, so it answers core everywhere, and it is recovered as `empty`. LACHESIS's strip records have a zero-size core box, so they have no core.

### Ground records and street furniture

`$4F142..$4F19E` writes each group's row and column runs into the 256-cell run grid at `$1AAC0`. From those runs, `$4F1C2..$4F226` builds six class bits for each cell. The class indexes `$1B0C0`, which gives the orientation byte at `$4170` and one of the six selector words. That selector word is the cell's Selected Piece.

`$4F23C..$4F2A6` then applies authored overrides. An override replaces the ground word only with a record of the same class nibble. The extraction recomputes every Selected Piece and compares it with the Drawn Record in the ready workspace. There are 689 differences across the 44 placed groups, and each one has an authored override.

There are 153 ground records. Each is keyed by the record its ground word names, and the transform it is turned by is a variant. The plain record `ground-01b250` draws nothing and accounts for 9,107 of the 11,264 placed cells.

Ground templates (`$56342`) rebind 38 model entries, 304–373, into working slots 247–255. Those models reach the census only through ground. So they are surface identities owned by #682, separate from #681's object models.

### Lettering

Every text record in a surface structure, detail or ground record is one of three kinds:

- **Literal** text, which 19 structures, details and ground records carry.
- **Placement-bound.** For a cell key of `$A0` or above, `$56062..$560AE` binds tokens `$89` and `$9D` to that placement's strings, from `$7542` and `$756E` indexed by (key − `$A0`) / 2. Any other key restores the defaults `$B380` and `$B338`.
- **Live.** The token's pointer names a buffer the game rewrites. The writers identified are:
  - **`$80`, `$81`:** the Floor Label character at `$B2D0`, written by the lift path `$56D40..$56E28`.
  - **`$83`–`$86`:** decimal digits of the player's X and Z cell, which `$563C4..$56406` writes into `$B2D2..$B2DC`. MIDAS's field ground draws them.
  - **`$8A`:** the cash readout at `$B2E5`, written by `$4E6A2`.
  - **`$8D`–`$91`:** keyed-door letters, which `$5AF82` writes from `$B301`.
  - **`$9E`:** a buffer at `$B346`, written by `$54446`.

The extraction lists each live token's pointer, its opening bytes, and every long operand within 16 bytes of that pointer. The Catalogue shows a live token with its opening value and says that the value is live.

### MIDAS and LOGOS

**MIDAS's field.** The uniform capture binds slot 68 in all 256 cells, as the #678 census found. Its ground is recovered per cell from the same capture, and that ground carries the coordinate digits described under live tokens. The field stays a rule in the ledger: `physicalCount` remains `null`.

<a id="logos-construction"></a>**LOGOS construction.** The fresh overlay list at `$57DA` holds only the LOGOS record, group 8 cell `$32` with replacement 0. The construction path removes that first record at `$51664..$51678`, then rebuilds at `$51690`. Emptying the list (`w $57da $00`) before the builder therefore reproduces the constructed state without running the campaign. The two states compare as follows:

- **Initial:** 23 cells; the site is unbound.
- **Constructed:** 24 cells; the site binds slot 136.
- **Everything else** is identical between the two states.

The ledger records both images' SHA-256 values.

### Empty identities

Each of these is recovered and has nothing to draw. The structures have no plan and no walls; the details, ground records and island have no vertices or primitives.

| Identity | Reached by | References |
| --- | --- | ---: |
| `structure-018470` | slot 100 | 100 |
| `structure-019d0e` | slot 146, the empty road | 29 |
| `structure-01a57c` | slot 208 | 16 |
| `structure-01a3b0` | slot 205 | 11 |
| `structure-01a3fa` | slot 206 | 5 |
| `structure-018a2a` | slot 133 | 2 |
| `structure-01844a` | slot 99, VULCAN ISLAND's Floor 0 | 1 |
| `detail-023d0e`, `detail-023de8` | details 1 and 2 | 131, 1 |
| `ground-01b250`, `ground-01d446`, `ground-01d400`, `ground-01d1ee` | plain ground | 9,107, 466, 134, 8 |
| `island-06330a` | the coastless record | 22 |

## Comparison with original scenes

[`m3lab.scene`](../../research/mercenary-iii-st/m3lab/scene.py) puts the original game at an exact pose on any Body, using the game's own object-destination path `$5A006..$5A15A`:

1. Resident slot 9 is NULL-model and out of world in a fresh game. It is rewritten to the target Body and pose.
2. The probe jumps to `$5A006` from the main loop's call of `$5A01A`, so the path returns into the loop.
3. The path runs Body setup, island selection and the workspace builder itself.
4. The frame is captured at the next main-loop top after VBL 7000.

[`web/tools/dion-scene.ts`](../../web/tools/dion-scene.ts) then has the browser planner draw the captured state from that cell's recovered records. It compares the result with the original's screenshot at ST colour depth.

Across the scenes that stand on a binding, every structure, detail and ground record the planner drew is identical to the record the extraction recovered: 30 of 30.

| Scene | Placement | Exercises | Agreement |
| --- | --- | --- | ---: |
| `companies-house` | `2:03` | alias 203 at scale −2,−2, structure 57, detail 56, road joins | 97.65% |
| `connection-mirrored` | `2:23` | mirrored alias 107 at −3,3, detail 92 | 98.70% |
| `olearys-farm` | `2:25` | mirrored alias 212 at −3,5 | 98.09% |
| `empty-slot-100` | `2:04` | empty structure, road join only | 99.23% |
| `connection-lettered` | `2:29` | key `$AA`, placement-bound lettering | 98.53% |
| `charlenes-disco` | `8:36` | alias 268 at 9,9, detail 28 with `$89` lettering | 98.33% |
| `midas-field-far` | field cell `$69` at Body cell 2122, 3632 | MIDAS repetition far from its origin | 98.78% |
| `logos-initial` | `8:32` | LOGOS before construction | 98.92% |
| `logos-constructed` | `8:32` | LOGOS after construction, slot 136 | 98.28% |
| `vulcan-island` | `14:88` | empty Floor-0 geometry | 100.00% |
| `dion-coast` | at sea north of BIRMINGHAM ISLAND | island and sea fill | 50.37% |
| `lachesis-strip` | beside a LACHESIS strip | island and sea fill | 49.87% |

The remaining pixels in the structure scenes are mostly the known horizontal-edge rows from #644. A few come from the planner limits below.

**Land/Sea comparisons.** At 36 teleported points around BIRMINGHAM ISLAND and KEY WEST, the original's answer `$6F56` was compared with `land_sea` over the island record the game had selected (`$6F44`). All 36 agree:

| Rule that decided | Points |
| --- | ---: |
| Edge test | 16 |
| Outside the outer box | 8 |
| No edge, so land | 5 |
| Sea box | 5 |
| Core box | 4 |

Two of the points select DION EAST's island rather than BIRMINGHAM ISLAND's. The observations are fixed in [`tests/test_catalogue_surface.py`](../../research/mercenary-iii-st/tests/test_catalogue_surface.py).

## Islands and horizon fill are Damocles's routines

Coast views can reuse Damocles's port. MIII's routines are Damocles's, relocated. The two images' disassembly was compared instruction by instruction, with every address and literal masked:

| MIII range | Damocles start | Role | Instructions matched |
| --- | --- | --- | --- |
| `$571A8..$576A2` | `$0560F2` | Land/Sea answer, nearest-island walk, island draw | 464 of 466, in order; the first 351 unbroken |
| `$5A996..$5AB62` | `$0599D6` | Ground fill to the horizon at any height (#573) | 159 of 159 |

The only difference is where the island changes. MIII calls its workspace builder there; Damocles has a branch of its own. The answer is published as 0, 1 and `$FFFF` for core, land and sea, at `$6F56` in MIII and `$78A6` in Damocles. The records have the same layout: an outer box, a core box, sea boxes, edges, and one coastless record shared by many placements (22 in MIII, 21 in Damocles).

So the Dion Catalogue (#685) and any later Dion play should draw coasts with the Damocles code that already ports these routines: `web/src/damocles/islands.ts`, the horizon fill from #573, and the any-range island drawing from #578. That code moves behind a pure seam that both Titles call, as walking did under ADR 0043. It reads Dion's own island records and land colours. Damocles's data stays out of Dion: this finding shares code, not evidence, and every Dion record still comes from MIII's own image.

## Remaining limits of the browser planner

These are presentation gaps in today's Metis-only planner. They are not recovery gaps. They are listed for #685 and #672.

- **No sea or islands.** The planner fills every ground with land colour and draws no island polygons, which accounts for the two coast scenes. It needs the recovered Land/Sea answer and island draw lists, drawn by the shared Damocles routines above.
- **Unbound tokens.** It draws no ground text records, and it leaves tokens `$89`, `$9D` and `$9E` unbound outside the Metis slice. The recovered bindings above cover them.
- **Fixed stars.** Night skies away from METIS draw METIS's stars. The sky Body inventory remains waived under D1.

## Source ledger

Ranges are half-open. Each was checked against the fresh opening image and the census run's loaded-play image `v6000.ram`.

| Range | Role | Opening SHA-256 | Same at v6000 |
| --- | --- | --- | --- |
| `$5761A..$576A0` | Island draw | `22429ab1c33a5ae0c6b0cc35e28fccfa4bad25e5e5cbec93edbc7c95301e9230` | yes |
| `$571A8..$574D4` | Land/Sea answer | `ca56d434e30d60b25c7bd4c87d4f31bd0cbe525c31db0d00ec59299fc0e0a61a` | yes |
| `$57544..$575D0` | Nearest island | `ef50cb246bfefd97e55d92174f528885395884c5cbd25eaf1c3a910a492768ed` | yes |
| `$4F142..$4F19E` | Run-grid writer | `89814cb959b20939c9e3df5f5ccd8c689c182b238b9653dc64135ccb6748175c` | yes |
| `$4F1C2..$4F226` | Cell class and Selected Piece | `bb31a1e7eac0dcbe9fa5bf4af999fcbb3d97810ccc57a026947020a9ed75c699` | yes |
| `$4F23C..$4F2A6` | Authored overrides | `b72a70b5f65286585d3bae629d5b7c9b65eb8385d068cd01d8e913ddd1ed3f44` | yes |
| `$5600C..$560B0` | Cell key and token binding | `359a58c25cd48834139149fedb7be930af316c245040ef0cf67c5a348b143936` | yes |
| `$4FEA0..$4FF0C` | Polygon primitive | `6c46ae569b08d6a6eb167360d747497a566367945ea025ebcd6c3f5870ada703` | yes |
| `$5873C..$58784` | Line primitive | `5d958580bff860b94c5376426b283749304a9c4c22328acd0548d30e38fd2684` | yes |
| `$5A006..$5A15E` | Object destination path | `c9f7707e3f359333789abe8d9188da5bc4c411e029fe0b23107850c5d2b82e13` | yes |
| `$0B230..$0B2D0` | Token table | `4c2b93ab68983572abc12ec9c2c2a761cfb67e6ee77e0cf7c42581bfa674c772` | yes |
| `$07542..$0759A` | Placement token bindings | `0e22d0b83d80f387e1de0e1e86a7cf307444c3f486f7ca6c738dfc1d99b43399` | yes |
| `$571A8..$576A2` | Island routines, as compared with Damocles | `0b9aee9f4f2427323162db571c01839025fbe1393e85cde29ee9a8f24ae7a7e7` | yes |
| `$5A996..$5AB62` | Horizon fill | `7ba94d2066180dbe63cd42f8e3d4de9027be4a569f4f755c648587eb146d9384` | yes |
| `$632F6..$639B9` | Island records | `4783407f415415eabf8f297b03b09cd3dad97e1c31bc4dedf68e31f818f1b351` | yes |

## Reproduction

From `research/mercenary-iii-st`, with a census run from `python3 -m m3lab.census_capture`:

```sh
python3 -m m3lab.catalogue_surface capture     # prints the construction run
python3 -m m3lab.catalogue_surface extract --census <census run> \
  --construction <construction run> --out ../../restricted/mercenary-iii-682/surface.json
python3 -m m3lab.surface_scenes scenes         # needs `bun install` in web/
python3 -m m3lab.surface_scenes coasts
python3 -m m3lab.catalogue_ledger --run <census run> \
  --surface ../../restricted/mercenary-iii-682/surface.json \
  --comparisons ../../restricted/mercenary-iii-682
```

A worktree reaches the ignored `restricted/` root of the main checkout through a symbolic link. Exclude that link locally; it is not tracked.

The tests are `tests.test_catalogue_surface` and `tests.test_catalogue_ledger`:

- **Offline:** the synthetic island, Land/Sea and cell-class tests run without captures.
- **`M3_OPENING`:** adds the island record checks and the 36 recorded Land/Sea answers.
- **`M3_CENSUS_RUN` and `M3_CONSTRUCTION_RUN`:** add the check that the extraction equals the ledger's hashes.
- **`M3_SURFACE`** (the directory holding the extraction and comparison results): adds byte-for-byte regeneration of the ledger.
