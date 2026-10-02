# Damocles and Mercenary III road lines

Research for [#724](https://github.com/odogono/mercenary/issues/724), 2026-10-02.
The Damocles findings are Working-Authority Evidence; MIII findings come from
its separately pinned ST research baseline. Addresses below are physical RAM
addresses. Under [ADR 0002](../adr/0002-separate-rom-research-from-implementation.md),
only decoded facts and hashes are tracked; RAM and Working Disassembly remain
Restricted Material in the artifact directories below.

## Selection and the own-cell correction

The [existing ground research](damocles-eris-ground.md#the-recovered-curve)
correctly recovers Damocles's altitude table and window builder. The run-grid
longword contains two endpoint words for every cell; the same entire run word
may occur in many cells. Select whole words from the clipped square around the
scene-camera cell, deduplicating exact nonzero words. Retain each cell's actual
longword: later authored runs can overwrite part of an earlier run, so checking
the bounding boxes of a deduplicated run inventory does not recover selection.

The native draw orders the neighboring words backwards, then handles the two
own-cell pairs separately. Crucially, **the own-cell lines are skipped when the
high word of scene-camera Y is zero**. Damocles `$054AFA..$054B00` and MIII
`$055E14..$055E1A` perform this check before their own-cell routines. At positive
world Y this means the own-cell lines begin at 65,536 units. Each own pair also
requires its `$F0` or `$F8` endpoint byte to be nonzero. Neighbor selection still
runs at smaller positive altitudes whenever radius is nonzero, but the own
word is seeded into the dedup search and remains excluded from that pass.

The issue's suggestion that the own pair draws on foot at radius zero is
therefore refuted. The pinned Capital City capture's six nonzero words in
`$84DC` describe five neighboring edges and one own edge; its camera Y is 63,
so the native edge pass draws the five neighboring edges. The sixth is the
own-cell runway, whose ground record can draw it through its own geometry.
The wider radius-three list in that arrival capture is already documented as
an exceptional latched state in the earlier note; normal Damocles on-foot
selection has radius zero.

| Mechanism | Damocles | MIII |
| --- | --- | --- |
| Scene camera XYZ | `$7A2C/$7A30/$7A34` | `$70C2/$70C6/$70CA` |
| Native 256-cell corner grid | `$1E000..$1E400` | `$1AAC0..$1AEC0` |
| Radius table, 256 bytes | `$915A..$925A` | `$7D4A..$7E4A` |
| Radius cache / invalidate on crossing | `$7B62`, `$054B84` | `$71FC`, `$055E9E` |
| Radius lookup / rebuild | `$054BB6..$054BE0` | `$055ED0..$055EFA` |
| Window builder | `$054888` | `$055BA2` |
| Native word list | `$84DC` | `$4270` |
| Project and draw neighboring edges | `$054A64..$054AFA` | `$055D7E..$055E14` |
| Own pairs and high-Y gate | `$054AFA..$054B2E` | `$055E14..$055E48` |
| Two-point line projector/clipper | `$0576C4..$057CC2` | `$05878A..$058D86` |

### Native table difference and requested parity

The native tables **differ only at indices 0, 1 and 2**. Damocles begins
`0,1,2,3,3`; MIII begins `3,3,3,3,3`. Both then have radius 4 for indices 5–9,
5 for 10–15, 6 for 16–23, 7 for 24–31, and increase once per four indices
from index 32 to a maximum of 63. Both index by scene Y shifted right 11,
clamped at 255.

MIII's radius-three minimum is present in both census opening images, the
game-entry image before the first new-game frame, and separately captured
object and surface scenes. No tracked laboratory code writes `$7D4A`. It is
baseline evidence, not inferred from Damocles or from one arrival latch.

**The user explicitly chose Damocles's curve for both titles in this task.**
The independent presentation therefore shares Damocles's radius-zero on-foot
and low-altitude behavior, deliberately departing from the recovered MIII
minimum. MIII's native table remains in the exported road metadata, with its
source hash, so this choice does not rewrite the evidence.

## Height, colour, stroke and draw order

The road lines lie at **world Y zero**. The value in Damocles `$79BA` is an
eye-relative log-float, not an authored world height: `$058F98..$058FAA` negates
scene Y, converts it through `$4BDD4`, and stores the result there. MIII does
the same at `$059D10..$059D26`, storing into `$704A`. Damocles's captured
`$0005E080` decodes to −63 when the eye is 63 above the ground; it does not
mean world height 385,152. Both road projectors load this same relative height
for every run endpoint.

Both passes select **palette index 14**, through their initial line-raster
selector `$1C0 = 14 << 5`. It corresponds to ST planes `0,1,1,1`, and the
generic line routine writes the chosen palette index. The palette's index-14
colour comes from the Settlement's own authored stream word: Damocles
`$04EC0E..$04EC12` binds `$7AEE/$7AEF`, then `$059644` and `$059842` copy it
to palette offset `$1C`; MIII `$04F1A0` binds `$7186/$7187`, then `$05A5C6`
and `$05A7F4` use that same offset. It is a Settlement colour, independent of
the cell's structure palette and the day/night choice. MIII group 2 is `$322`,
group 8 is `$411`, and group 56 is `$555`; they cannot share METIS's colour.

These are thin rasterized segments in the native **320×136 physical-pixel**
viewport, with a one-physical-pixel cross-section. They receive projection
and viewport/near clipping through the ordinary line routine. The road draw
has no horizon-fill test and reads none of the horizon-fill or star-clipping
state. Horizon fill is already painted when it runs. The line routine draws
into the framebuffer; it has no geometric depth buffer.

The native order outdoors is sky/background, island polygons, road lines,
occupied-cell ground records, then structures and objects. Damocles confirms
this at `$0596D0..$0596EC` and `$05985C..$059876`; MIII at
`$05A652..$05A66A` and `$05A80E..$05A82E`. In the flying branch the occupied
ground-record draw is skipped once scene Y's high word is nonzero, while road
lines keep drawing. The enclosed-region branch bypasses this whole outdoor
pass, as [the ground note](damocles-eris-ground.md) already records.

The browser's DPR policy is an authored presentation decision; an ST capture
cannot specify device-pixel behavior on a modern display. Scaling the recovered
320×136 viewport preserves the native visual thickness independently of DPR.

## Artifacts and source hashes

External artifact root on this workstation: `/Users/alex/work/mercenary`.
The primary Damocles input is
`research/damocles-st/work/observe-first-world-20260818T101013Z-c5a32b7d/observed.ram`
under that root, SHA-256
`b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967`.
Its targeted listing is `research/damocles-st/work/geometry-code.txt`.

The inspected MIII loaded input is
`restricted/mercenary-iii-647/runs/location-census-334983y7/v6000.ram`, SHA-256
`43d49116edc364d6fea0fc161a09290a1a635e564cc75275b106dc2380fd67bb`.
The MIII listing is `restricted/mercenary-iii-682/code.txt`. The Catalogue's
opening input at that same run's `start.ram` has SHA-256
`cd697c802472a319fcd8fd5dd7193ad870cf4ff0a7f37cd6fda51893dd899fe4`.
Additional low-radius observations use the full-location census run
`full-location-census-bzjd9ifm/start.ram`, the entry capture at
`location-census-334983y7/entry.ram`, and independent #681/#682 object/surface
`v7000.ram` captures; all give the same radius-table hash below.

| Half-open range | SHA-256 |
| --- | --- |
| Damocles radius `$915A..$925A` | `2920b857a78057ea34075578ab19acf78a8691ca8865dd4aff1cdabf0cf6ec43` |
| MIII radius `$7D4A..$7E4A` | `72ff92f0ccc3a56ac0e4ca81d0670906b3f551b43bc45b52cb053d29097e135c` |
| Damocles road pass `$054A64..$054B2E` | `0271706e6d70121be9e41e1893164b4288701419b10bff00b853fb3e259f660e` |
| MIII road pass `$055D7E..$055E48` | `9a21052e04aef8267383b6602973883ba052b9f046afab5e7a064618a012b98d` |
| Damocles relative height `$058F98..$058FB0` | `7861ca663d9555cd869b282be5605360f5ae96ac76da714825bd4a323f713715` |
| MIII relative height `$059D0E..$059D2A` | `5a2d11c3ed36ddb1fde967134c0035706616c1144a0116488f2580f75577a714` |
| Damocles line routine `$0576C4..$057CC2` | `3b53ad063abb585468acaf11722289f165cc0397b6dfb0ce048b22c28fa1bab0` |
| MIII line routine `$05878A..$058D86` | `c0e1393f0f1a08acf252a66a0cbbd114952f1eaee4beee5f805cab395cb0c741` |
| Damocles group colour reader `$04EC0C..$04EC30` | `2d5207a406a77a5d9c747044567736b444a4799ad008ee12656eb945c5b396b1` |
| MIII group colour reader `$04F19E..$04F1C2` | `a5e9b4b5f4b33c6bd483526994be35475f512195eb42db6727b7123a24a882a0` |

The program-image pins are Damocles
`8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef`
and MIII
`4e8b74122910bcaa109b944eebb6f0ec18fdeb1175c34eea3c932d0e1b18b62c`;
both use the previously pinned EmuTOS image
`154803e3ff4851f3dc358b91b16d6b6110d187a81d8132ecb665af49878939d5`.

## Recovered payload inputs

[`road_line_inputs`](../../research/damocles-st/damocleslab/catalogue.py)
adds `corners` (256 native longwords), `roadColour` (decoded ST RGB), and
`sourceRoadColour` (the authored word) to every Damocles Road Network. It reads
each group's own program-image stream, so image-only workspaces have the same
coverage as captured ones. Existing per-cell Selected Pieces and Drawn Records
remain unchanged.

[`road_lines`](../../research/mercenary-iii-st/m3lab/world.py) exports MIII's
native `corners`, `colour`, world `height: 0`, native `radiusTable`, captured
`ramSha256` and address-range provenance. `world.roads` covers all 256 METIS
cells even though the playable world currently exports only fifteen cells.
[`render_support`](../../research/mercenary-iii-st/m3lab/catalogue_render.py)
exports the same inputs under each Catalogue `groups[group].roads`, from that
group's own census RAM, including the empty MIDAS road grid.

The original playable whole-RAM capture is absent from this workstation. Its
METIS grid is attested separately: every playable cell's existing
`roadPoints.provenance` matches the loaded census RAM's same four-byte range,
and its group and authored road colour match the playable payload. The new
road metadata retains the census RAM hash rather than claiming the old
whole-RAM capture was read. The existing playable source header is unchanged.

Catalogue render-support regeneration remains:

```sh
PYTHONPATH=research/mercenary-iii-st python3 -m m3lab.catalogue_render \
  --catalogue payload/dion/catalogue/catalogue.json \
  --census /Users/alex/work/mercenary/restricted/mercenary-iii-647/runs/location-census-334983y7
```

Full world export through `python3 -m m3lab export --run <capture-run>` and
Damocles Catalogue export through `python3 -m damocleslab.catalogue` include
these new fields automatically. The synthetic recovery tests preserve zero
cells and overlapping-run overwrites; payload checks pin MIII's native radius
table and the independently recovered group colours. No application code is
derived by translating original instructions.

## Verification and remaining screenshot limit

The two MIII road recovery tests, the Damocles overlapping-run recovery test,
all seven existing Settlement Road Network tests, and all six MIII Catalogue
render-support tests pass against the pinned external inputs. The latter also
reproduces the committed render-support document exactly.

A matching-pose aerial Hatari screenshot was attempted by restoring the pinned
on-foot snapshot and setting body and craft coordinates to Capital City
`(4,685,824, 200,000, 8,650,752)`, yaw 512 and pitch 618. The scene-camera
triple and displayed buffer stayed at the prior on-foot pose while the body
triple changed; these results are **not** a matching-pose comparison. The
failed probes remain ignored at
`research/damocles-st/work/craft-control-road724-20261002T135702Z-1b6afa59`
and `craft-control-road724b-20261002T135801Z-45e87ccd`. A valid aerial screenshot
comparison remains outstanding; the static reader and captured grid evidence
above establish selection, height, colour and ordering independently.

## Browser implementation verification

Both planners use `web/src/coast/roads.ts` for the selected words and the
requested Damocles curve. Damocles's triangle renderer paints flat strokes
after island fill and before ground/objects, without depth writes or shadow
casting; MIII emits the same pass as ordered Frame Description lines. A
reference-pixel stroke scales with the view, including DPR and resolution
scaling. Roads bypass the detailed geometry's authored far plane.

The full browser unit suite passed 2,498 tests before the final preview-binding
correction; the final affected planner, Floor, renderer and preview checks
passed 82 tests. Lint, TypeScript and `git diff --check` passed. Three new
Python recovery checks and thirteen existing recovery checks passed.

The T3 collaborative browser rendered the recovered Capital City and METIS
road grids with WebGL error 0. At DPR 2 a synthetic red road at view depth
100 with detailed far plane 10 produced `[255,0,0,255]` in both the flat and
Enhanced paths, including an Enhanced pass with zero illumination. This
checks far reach and flat ink independently of the ordinary scene geometry;
it does not establish the outstanding matching-pose Hatari comparison.
