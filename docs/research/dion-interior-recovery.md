# Dion interior recovery

Recovered for [#683](https://github.com/odogono/mercenary/issues/683), under [#679](https://github.com/odogono/mercenary/issues/679), from the pinned **Mercenary III research baseline**. The recovery covers every authored Floor of the 198 selected structure slots and the bindings of all 180 initial indoor residents. It closes `association-hooks`, `interior-details` and `floor-table-slot-46`. Gameplay access remains independently unverified. The [reader study](dion-interior-reader-notes.md) cites MIII's original reader addresses and records the source hashes; no Damocles data is evidence here.

The [coverage ledger](../../research/mercenary-iii-st/catalogue-ledger.json) and [data contract](../dion-catalogue-contract.md) carry the handoff to #684. Geometry, RAM, original screenshots and debugger scripts remain ignored under `restricted/`, as ADR 0002 requires. The opening Metis Data Payload and browser code are unchanged.

## Coverage

| Account | Result |
| --- | ---: |
| Selected structure slots | 198 |
| Census Floor selector IDs, including overread bytes | 78 |
| Authored Floor geometry slots | 74 |
| Authored host/Floor bindings | 464 |
| Structure Geometry Identities | 74: 52 already recovered by #682, 22 recovered here |
| Building detail identities | All 57 from #682, reused unchanged |
| Initial indoor residents | 180, in 101 distinct group/cell/Floor contexts |
| Original reader comparisons | 565/565: 464 Floor assemblies and 101 resident contexts |
| Representative original frames | 8, including upper Floors, attachments, lettering and MIDAS |

The census's eleven-byte read of slot 46 crosses its eight-byte alias record into slot 47. The original binds its ground geometry 99, which has no lift region, and refuses a Floor key. The raw apparent selectors remain in `censusFloors` and `nonFloorBytes` with provenance and an explicit disposition. Only Floor 0 is authored. This accounts for all 78 raw selector IDs without inventing upper Floors: 128, 240, 252 and 9 occur only in the overread. Geometry `structure-00d368`, formerly required solely by that read, leaves the required inventory. There are now **529 required Geometry Identities**, all recovered; Catalogue previews still gate milestone completion. See the [compact-alias evidence](dion-interior-reader-notes.md#slot-46-is-a-compact-ground-only-alias).

## Decoder paths

| Path | Original reader | Recovered facts |
| --- | --- | --- |
| `catalogue_interiors.floor_binding` | `$560E2..$5617E`, `$56D98..$56E5E` | Floor index, pitch, inherited alias scale/detail, direct geometry lookup and Floor palette |
| `geometry.decode_structure` | `$5AD30..$5B2D0` | Scaled plans, walls, attachments, wall texts, regions, queues and association lists |
| `geometry.decode_detail` | `$54AEE..$54D20`, `$54D24..$54D50` | Both exterior and indoor selection groups, primitives and lettering |
| `catalogue_interiors.association_hooks` | `$53C5E..$53CC4`, `$5B3A6..$5B3F8` | Own-region tail plus explicit region/queue insertions, in original slot order |
| `catalogue_interiors.local_position` | `$5464C..$54668` | World position relative to the host origin and Floor base, independent of hooks |
| `catalogue_surface.lettering` | `$54FA0..$5502E`, `$55188..$55204` | Literal, placement-bound and live tokens; no substituted inscriptions |

A Floor selector names geometry directly. It does not recursively follow another alias or adopt a selected geometry's scale/detail metadata. A zero alias palette selects the parallel palette for that Floor. A zero Floor entry means that particular Floor is absent; it does not terminate a table containing a later basement entry. Floor 10 displays `B` and has base height 10 × pitch, independently of lift travel order.

Resident associations control visibility and ordering. Their implicit `(association, 0)` hook inserts at the end of the association's own region; explicit pairs insert before a region's queue token. They do not move residents. The extraction keeps world position, local position, Floor base, Body, group/cell, host and hooks separately. Residents may sit above the Floor base, for example on a table. It preserves their actual Y, including those offsets. Four residents (31, 96, 130 and 187) have explicit hooks whose insertion token is absent from a particular region queue; `dormantHooks` records those pairs unchanged. The original reader copies them too; they are recovered data, not missing hooks.

MIDAS residents 101 and 118 bind slot 68 at workspace cell `$69` using the original uniform workspace. The extraction validates each resident's actual Body cell against the island origin and modulo-16 selector; it never places them at the authored seed cell. Actual and displaced-period scene captures demonstrate the same workspace selection at different physical Body cells.

Building details retain both selection groups. The 57 detail records and 52 surface structure records have exactly the #682 extraction's content hashes; this recovery adds 22 interior identities without replacing shared geometry. Attachments retain their controls, closed-leaf geometry, motion axis, colours, bounds and queue references for static inspection. Wall lettering retains its face, font, anchor, encoded offset/scaling flag, glyph scales, colours and token bytes. Door operation and live session token updates remain outside this ticket.

## Reproduction

From the repository root, with the pinned media available as described in the [laboratory README](../../research/mercenary-iii-st/README.md):

```sh
export PYTHONPATH=research/mercenary-iii-st:research/mercenary-iii-st/tests
C=restricted/mercenary-iii-647/runs/location-census-334983y7
I=restricted/mercenary-iii-683
python3 -m m3lab.catalogue_interiors --census "$C" --out "$I/interiors.json"
python3 -m m3lab.interior_capture --census "$C"
python3 -m m3lab.interior_scenes --census "$C"
python3 -m m3lab.catalogue_ledger --run "$C" \
  --surface restricted/mercenary-iii-682/surface.json \
  --comparisons restricted/mercenary-iii-682 \
  --objects restricted/mercenary-iii-681/objects.json \
  --object-comparisons restricted/mercenary-iii-681/objects.scenes.json \
  --interiors "$I/interiors.json" --interior-comparisons "$I/readers.json" \
  --interior-scenes "$I/scenes.json"
M3_CENSUS_RUN="$PWD/$C" M3_SURFACE="$PWD/restricted/mercenary-iii-682" \
M3_OBJECTS="$PWD/restricted/mercenary-iii-681" M3_INTERIORS="$PWD/$I" \
  python3 -m unittest discover -s research/mercenary-iii-st/tests -p 'test_catalogue*.py'
python3 -m unittest discover -s research/mercenary-iii-st/tests -p test_interior_scenes.py
```

The census and #681/#682 recipes generate their prerequisite runs. New original captures have new run IDs and RAM hashes; regenerating against the recorded runs proves the committed ledger byte for byte. `interior_capture` runs MIII's binder, upper-Floor selector, assembler and resident selector. It compares inherited metadata, Floor eye height, palette pointer, plan coordinates, wall references/colours, attachment counts, region bounds and queue pointers, wall-text faces/text and association root pointers. Resident contexts compare every copied hook list with the extraction, including scan order. All original instructions execute in Hatari; none are translated into the implementation.

The recorded complete reader run is `interior-readers-jd9h7we9`; the original upper-Floor path executes its own `$56E56` low-byte mask before the assembler lookup.

The extraction source pins the Title, program image, census and opening RAM, with per-record half-open range hashes. The ledger validates every Floor reference/variant, Floor height, host cell, local placement and resident hook against the original-reader comparison records. A missing required interior identity or corrupt content hash is rejected. Raw census counts and authored geometry counts are separate and recomputed from records.

## Original-frame comparisons and limits

The [scene matrix](dion-interior-reader-notes.md#representative-original-scenes) documents the eight matched original frames: prison attachment and wall lettering; Companies House Floor 4; Enterprise basement 10; VELOS Floor 9; mirrored Floor 9; and the actual/displaced MIDAS cells. Original PNGs stay in the ignored runs referenced by `interiorScenes`.

These are exact comparisons of the original frame's selected reader state and geometry buffers, supported by inspection of the original screenshots. They are **not browser pixel comparisons**: the existing browser scene planner has no selected-Floor input. #685 supplies Catalogue Floor previews and #686 compares the integrated renderer; this ticket introduces no permanent renderer.

Reachability is a separate field, `unverified`, for every initial resident. Debugger destinations establish placement and reader selection, not lift operation, door access or campaign progression. An attempted destination to opening resident 67 did not remain at its original host by the capture time even though the resident's placement tables stayed unchanged; the sample uses resident 44 instead and records the destination uncertainty in the reader study. Initial records are not rewritten to fit a later session.

## Verification

All 108 Mercenary III laboratory tests pass with the recorded census, opening, loaded-play, panel-entry and recovery inputs, including exact ledger regeneration. The existing browser regression selection passes 137 tests covering Dion journeys, frame planning, persistence, Saves/Session Resume and Targ/Damocles sessions. Independent review recomputed all 565 reader comparisons from original RAM and found no remaining required changes.
