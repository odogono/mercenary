# Dion object geometry: models, forms, lettering and run-time rebinding

Recovered 2026-10-01 for [#681](https://github.com/odogono/mercenary/issues/681) under [#679](https://github.com/odogono/mercenary/issues/679), from the pinned **Mercenary III research baseline**. Every fact is read from MIII's own readers, cited by address. No Damocles record is evidence here. [ADR 0002](../adr/0002-separate-rom-research-from-implementation.md) admits the recovery. Captures, screenshots and disassembly stay under the ignored `restricted/` root.

The [Dion Catalogue contract](../dion-catalogue-contract.md) defines what is recovered. The [coverage ledger](../../research/mercenary-iii-st/catalogue-ledger.json) records the result.

- **Recovered:** 190 object Geometry Identities. 189 are drawable and one is recovered as empty.
  - 155 are the records the 239 modelled slots draw at the opening.
  - 3 are records that run-time writers bind into object slots.
  - 32 are driver heads, which vehicles draw aboard.
- **Variants:** 208 in total. Forms are header-selected (`state=`) and viewer-selected (`form=view-n`).
- **Dispositions:** every object slot is mapped to geometry or to an evidenced non-geometric disposition. The 7 NULL slots are `null-model`; slot 74 draws only transient debris.
- **Gaps closed:** `model-variants` and `tourcraft-appearance`.
- **Previews:** the Catalogue previews (#685) and the #686 matrix are still required before the milestone closes.

## Evidence identity

- **Census run:** `location-census-334983y7`, the #678 run. Its opening `start.ram` has SHA-256 `cd697c802472a319fcd8fd5dd7193ad870cf4ff0a7f37cd6fda51893dd899fe4`. The model table `$2EAB8..$2EDC0` is the same at the run's loaded-play image `v6000.ram`.
- **Extraction:** [`m3lab.catalogue_objects`](../../research/mercenary-iii-st/m3lab/catalogue_objects.py) decodes every identity from the opening, and records each identity's content SHA-256 in the ledger. #684 must export that content unchanged.
- **Comparisons:** [`m3lab.object_scenes`](../../research/mercenary-iii-st/m3lab/object_scenes.py), drawn by [`web/tools/dion-scene.ts`](../../web/tools/dion-scene.ts) (see [below](#comparison-with-original-scenes)).

## The model reader

`$545AE` takes a slot, reads the model-table word at `$4BD10` + 2 × slot, and follows it to the record. A word from `$8000` to `$800F` is a header operation, dispatched at `$5460A`. At most one header is read. Then come:

- **Vertices** (`$54710`): three signed bytes, or `$80` followed by three words on the next even address. A `$8000` word ends the list.
- **Viewer-selected alternatives** (`$54952`): a length word, then six longs giving a minimum and a size on each axis, then a face list. The first alternative whose box holds the model's position minus the viewer's is drawn instead of the default list. The length counts the face bytes after the box. A zero length ends the alternatives.
- **The default face list** (`$54988`):
  - A byte below `$80` is a polygon in model colour *n* (`$2EA40`), followed by vertex references ending in zero.
  - `$FF` ends the list.
  - `$FE` is an inline text record (`$55050`).
  - `$FD` sets the pointer pick mark and ends the list.
  - Any other byte *b* is a line in colour `$FF − b − 3`, followed by two references.

A reference is four times a vertex number (`$5470A` starts the projected buffer at 4). The extraction exports vertex numbers from 1.

### Header operations

| Header | Handler | What it does | Records |
| --- | --- | --- | ---: |
| none | — | Plain record, drawn unturned | 133 |
| `$8000`, `$8006` | `$545AC`, `$543B2` | Return: draws nothing (entry 0, the NULL record) | — |
| `$8001` | `$544FC` | Mode byte at `$543AA`. `$40`: yawed by the resident's yaw byte plus an offset. Negative: articulated about a pivot (below). | 16 |
| `$8002` | `$54596` | Writes `'0'` + (slot & 15) to `$B2DE`, token `$87` | 1 |
| `$8003` | `$543DE` | Beacon lamps (below) | 3 |
| `$8004` | `$4D3B0` | Draws the explosion debris list at `$639C0`; reads no record geometry | 1 |
| `$8005` | `$549BA` | Draws one point at the origin; reads no record geometry | 0 |
| `$8007` | `$5442E` | Writes `'A'` + slot − 30 to `$B2DE`, token `$87` | 1 |
| `$8008` | `$5453C` | Writes its two-character code to `$B300` (token `$8B`), then jumps to shared geometry | 5 |
| `$8009` | `$5452E` | Intact form when `$70F6` is clear; blown form, by its offset, when set | 1 |
| `$800A` | `$543B4` | Writes its value into a colour byte of shared geometry, then jumps there | 23 |
| `$800B` | `$543C0` | View-fixed turn (mode 3) | 1 |
| `$800C` | `$543D4` | Range in cells for the visibility test `$5532E` (default 1) | 1 |
| `$800D` | `$54444` | Vehicle. Exterior form outside, passenger form aboard; route number to token `$9E` | 4 |
| `$800E`, `$800F` | `$5464A` | Jump to shared geometry | 0 |

`$8000`–`$800F` is a signed compare at `$545F8`, so every other word begins vertex data. The decoder's earlier refusal of `$8004` is fixed: like `$8000`, `$8005` and `$8006`, it reads no geometry from the record.

### Shared geometry and patches

The `$800A` and `$8003` headers write into the colour bytes of geometry other records share. The image therefore holds whichever value was drawn last. The extraction applies each record's own patch to its variant, so the four PROCESSORS and EXECUTIVE DESK records that share `$307D6` each keep their colour, at byte `$30884` with values 10, 4, 3 and 5. The comparisons observed this directly. After the EXECUTIVE DESK was drawn, the byte held 3; at the opening it holds 10, from the PROCESSORS DESK.

A record that jumps into shared geometry cites two source ranges: its header, and the shared geometry.

### Turns and articulation

`$543AA` selects the turn the vertex loop applies:

| Value | Turn | Records |
| --- | --- | ---: |
| 0 | None | 168 |
| bit 6 | Yaw by the resident's yaw byte plus the header offset, 256 steps a turn | 11 |
| bit 7 | Articulated | 9 |
| other bits | View-fixed: roll `$7152`, pitch `$7154` + `$200`, heading `$7156` + `$200` | 1 |

Bit 5 scales by 16 on the yaw and view-fixed turns. Only the passenger form sets it.

An articulated record's tagged vertices are stored with Y complemented (`$5480A`). They turn about the header's pivot, on an axis the offset byte selects: negative is X, zero is Y and positive is Z. The angle is `$6E96` (WHEEL OF FORTUNE, mode `$FE`) or `$6F38`, which `$5A466` copies each frame from `$6F36`. The VBL handler adds `$6FD4` to `$6F36` (`$53122`). The extraction exports the rest pose, with Y restored and the tagged vertices listed. The turning is animation and is described, not frozen into geometry.

### Beacon lamps

An `$8003` record writes its value into one face, then writes the lamp index into its lamp faces:

- **Lit:** index 3.
- **Dark:** index 1.

The lamp is chosen by bit 2 of the frame counter `$7180` plus the slot's phase word at `$54400` + 4 × slot. With value 5 (BLUE BEACON) or 4 (RED BEACON), the lamp stays dark unless bit 7 of `$64BE` or `$64C2` is set. Those are byte 2 of the BLUE and RED BEACON LOCATOR residents' state words. Beyond its range, a lit beacon is drawn as one point in the lamp colour (`$5468E..$546F2`). The two lamp states are variants; the blinking is behaviour.

### Vehicles

`$54444` writes the vehicle's `$6DA0` word to `$B346`, which is token `$9E`, the BUS route number. A vehicle the player is not riding (`$6EB2`) draws its exterior form. Aboard, it draws:

- **The passenger form:** ×16, at (0, −63, 0) from the eye, turned with the vehicle. Slots 12–15 are drawn view-fixed.
- **The driver head:** the entry `$6ECE` names, which is the vehicle's `$6D62` copied on boarding. The next entry is drawn in profile (`$544B8..$544DC`).

On the ground the viewer is inside each vehicle's first viewer box (Y from −90 or −120 upwards). INTERCITY and TOURCRAFT therefore draw `form=view-1` from the street; the default list is the view from above.

## Run-time model-table writers

The model table is rewritten during play, so a slot can draw records other than its opening one. Every writer that stores to the table through `$4BD10` was traced. Its operands are read from the pinned code, not restated.

| Writer | Slots | Entry written | When |
| --- | --- | --- | --- |
| `$51C2E`/`$51C3A` via `$51C4A` | 16–27 | 318 TAXI or 319 BUS | Per group, from the route table `$41800` |
| `$51BBC`, `$51C42` | 12–27 | `$6D62` driver head | Per service, from `$51A3E` and `$41800` |
| `$4DB66` | 75–81 | 257 EXPLOSIVE-ARMED! | The carried EXPLOSIVE is armed |
| `$4DB66` (long write) | 76–82 | 258, the NULL record | The slot below is armed |
| `$4DB40` | 75–81 | 256 EXPLOSIVE | Disarmed |
| `$4DB40` (long write) | 76–82 | 257 EXPLOSIVE-ARMED! | The slot below is disarmed |
| `$59BAC`, `$59BC6` | 75–81 | 256, or 257 for the armed slot | Reset (word writes) |
| `$52090` | 56–58 OBSERVER | 321 ATTACK SHIP, or 320 OBSERVER | The OBSERVER script |
| `$52F74`, `$52FAA`, `$52FD2` | 97 | 316 BIL'S CHAIR, or 0 (NULL) | BIL's script |
| `$52F7A`, `$52FB0`, `$52FD8` | 218 | 317 P C BIL, 315 PCB SEATED, or NULL | BIL's script |

`$4DB40` and `$4DB66` store a long, which is two table entries. Arming EXPLOSIVE *s* therefore also makes slot *s* + 1 the NULL record, and disarming makes it EXPLOSIVE-ARMED!. With *s* = 81, slot 82, the SIDEBOARD, is affected. This is read statically from the instructions; it was not observed in play.

Three records are reached only through these writers: EXPLOSIVE-ARMED! (`model-031864`), BIL'S CHAIR (`model-032822`) and P C BIL (`model-036e00`). The ledger lists, for each object, the further models it can draw (`forms`), with their writers. Each identity's `formSlots` counts them in its references.

### Services and driver heads

There are 68 services:

- **The craft table at `$51A3E`:** 19 records for INTERCITY and TOURCRAFT.
- **The route table at `$41800`:** 49 vehicles, bound from slot 16 per group:
  - **17 TAXIs:** each has a negative first word, a driver-head long and a long `$6DA0`.
  - **32 BUSes:** each has a two-character route number in `$6DA0`, for example `11`, `30` and `47` in group 2.

Their heads are entries 259–290, in 16 pairs of front and profile. They are nameless records with no header, and some of them carry the static face tokens `$A0`–`$A6`.

## Lettering

All 41 model text records are inline (`$55050`, flags bit 15). The tokens they name are classed by the #682 lettering inventory:

- **Per slot, by the header:**
  - `$87`: DOOR KEY A–J (slots 30–39) and TRANSPORTER 0–9 (slots 64–73).
  - `$8B`: the five vehicle keys, with codes `DG`, `E9`, `D3`, `TT` and `C3`.
  - `$9E`: the BUS route number.
- **Live:**
  - `$88`: the EXPLOSIVE-ARMED! countdown.
  - `$8C`: AUTHORS COMPUTER.
  - `$99`, `$9A`: FRUIT MACHINE and WHEEL OF FORTUNE.
- **Static:**
  - `$9C`, `$A0`–`$A6`: residents' and heads' faces.
  - Literal text, such as NEWS-STAND's `DAILY COMET` and CHERISHED NUMBER's `PW1`.

The 25 slots with header lettering carry their own text in the ledger. So shared geometry, such as the ten DOOR KEY slots on `model-0305ae`, keeps distinct residents.

## Dispositions without geometry

- **`null-model`, 7 slots (9, 10, 11, 97, 114, 214, 230):** their model-table word equals entry 0's. That is the NULL record, `$8000`, which returns at `$545AC`. Slot 97 can later draw BIL'S CHAIR.
- **Slot 74, `model-0317f6`, recovered as `empty`:** its `$8004` header reads no geometry. `$4D2C8` starts 64 frames of the 24-byte particle list at `$639C0`, with `$6EEE` particles and random velocities. `$4D3B0` draws them as points while `$6EE4` is positive, fading through the 64 colours at `$4D2D8`. It is procedural explosion debris. The extraction records the description and the colour table, and exports no geometry.

## Comparison with original scenes

`m3lab.object_scenes` stands at the #682 empty-structure pose, `placement-02-04` (slot 100, road join only, 99.23% frame agreement). Before the jump to `$5A006`, it moves one object slot in front of the eye as a surface resident of that Body, which puts it on the drawn list the path rebuilds. Other forms are selected the way the game selects them:

- a model-table word copied from the entry a writer names;
- `$70F6` for the safe;
- the viewer's position against a box.

Articulated models are held at rest with `$6FD4` and `$6F36` zero. Because the screenshot is the frame before the loop top (#647), the planner draws at `$7180` − 1.

`dion-scene.ts` reports agreement over the whole frame and over the object's footprint. The footprint is every pixel, within 2 of the box the planner drew the object in, where either frame differs from the planner's frame without the object. Exact ST raster parity is not assumed. The edge rows and slivers from #644 account for most of the remainder.

| Scene | Slot | Identity | Variant | Object agreement | Frame | Planner gap |
| --- | ---: | --- | --- | ---: | ---: | --- |
| `armchair` | 44 | `model-030a1c` | `form=default` | 91.73% of 2,915 | 98.79% | |
| `sights-lines` | 47 | `model-030d48` | `form=default` (lines only) | 62.55% of 275 | 99.11% | |
| `news-stand-literal` | 134 | `model-033d24` | `form=default` (literal text) | 92.22% of 3,175 | 98.66% | |
| `dodge-yaw` | 2 | `model-02ef8a` | `form=default` (`$8001` yaw) | 76.39% of 1,025 | 98.85% | |
| `canine-articulated` | 45 | `model-030b24` | `form=default` (at rest) | 85.07% of 1,058 | 98.87% | reports articulation |
| `processors-desk` | 42 | `model-03075e` | `form=default` (`$800A`) | 81.42% of 1,830 | 98.45% | |
| `executive-desk` | 196 | `model-030796` | `form=default` (`$800A`) | 81.42% of 1,830 | 98.45% | |
| `black-beacon` | 164 | `model-0353f0` | `state=lamp-lit;form=default` | 69.71% of 525 | 98.93% | |
| `door-key-b` | 31 | `model-0305ae` | `form=default` (`$8007`) | 65.32% of 1,338 | 98.16% | `$87` unbound |
| `key-dodge` | 180 | `model-03550e` | `form=default` (`$8008`) | 93.96% of 1,043 | 99.09% | |
| `safe-intact` | 102 | `model-032b40` | `state=intact;form=default` | 92.72% of 2,679 | 98.90% | |
| `safe-blown` | 102 | `model-032b40` | `state=blown;form=default` | 89.90% of 2,763 | 96.28% | |
| `transporter-outside` | 64 | `model-0316f8` | `form=default` (`$8002`) | 97.57% of 13,652 | 98.71% | `$87` unbound |
| `tourcraft-ground` | 13 | `model-03005c` | `form=view-1` (`$800D`) | 72.44% of 849 | 98.93% | |
| `tourcraft-spaceport` | 13 | `model-03005c` | `form=view-1`, in place | 45.90% of 610 | 98.28% | |
| `explosive-armed` | 75 → 257 | `model-031864` | `form=default` | 77.62% of 4,651 | 96.84% | `$88` unbound |
| `bils-chair` | 97 → 316 | `model-032822` | `form=default` | 88.17% of 3,059 | 98.40% | |
| `driver-head` | 44 → 263 | `model-03772a` | `form=default` | 96.80% of 125 | 99.22% | |

Every record the original drew in these scenes has the opening's bytes, with one exception: the EXECUTIVE DESK's shared colour byte, as described above. The visible differences, inspected scene by scene, are:

- **Planner limits:**
  - The planner does not bind tokens `$87` and `$88`, so the key letter, the transporter digit and the countdown are missing from its frames.
  - It drops slivers. TOURCRAFT's 6-unit landing legs, seen edge on, are drawn by the original only.
  - It draws one cell. At the spaceport, the remaining differences are road edges and another cell's furniture, not the craft.
- **Edge rows**, as in #644, on every model.

**TOURCRAFT's appearance at the opening spaceport is confirmed.** The original draws slot 13 in place with its decoded ground form. This closes `tourcraft-appearance`.

Some forms could not be isolated:

- **ATTACK SHIP and the revealed OBSERVER** (`model-031140`): the game's own behaviour moves them out of the world as soon as they are placed.
- **TRANSPORTER from inside** (`form=view-1`): standing inside one transports the player.
- **The passenger forms and profile heads:** these need the player aboard. Taxi rides draw the passenger form in the playable Metis slice (#644, #677).

They remain for the #686 matrix.

## Remaining limits

These are presentation gaps. They are listed for #685 and #672.

- **Tokens.** The planner binds none of `$87`, `$88`, `$8C`, `$99`, `$9A`, `$9E`, `$9C` or `$A0`–`$A6`. The ledger holds each object's header lettering; the live tokens show their opening values.
- **Animation.** It does not draw lamp blinking, articulated turns or debris. The Catalogue shows the evidenced states and the rest pose.
- **Slivers and edges.** It drops slivers and edge rows, as in #644.

## Source ledger

Ranges are half-open and pinned in `catalogue_objects.CODE`. The extraction refuses an image whose bytes differ.

| Range | Role | Opening SHA-256 |
| --- | --- | --- |
| `$545AE..$546F8` | Model draw entry and header dispatch | `592ee4aba29f4285dc026793df0466992d57a7e72bd6290bc882ddeefb524e7e` |
| `$546F8..$549BA` | Vertex loop, turns, alternatives, face list | `28d327e2d07e3f1680ddfc776f3452bd53c9d63874f35a2dd3f1ebe963081186` |
| `$543B4..$545AE` | Header handlers | `170817f5075226009cad07138a09766652deec58a4f6a0a94d7361fd1afbef38` |
| `$55050..$551AA` | Model text record | `9652b0fb0d2e64c9abd7b11c409bf3b6a4872bbb2433ad41ebcae8b38b2f9a43` |
| `$4DB0C..$4DB78` | EXPLOSIVE arming writers | `c1a0e74b3c233328e097322fe4a1571b65aa54aae23919125ce9b4ff20b85a71` |
| `$59BA2..$59BCC` | EXPLOSIVE reset | `0e082dd41f45b52d8a77ef7b883f09e66ff5dd7726e688399d3ebfe66d44bfc6` |
| `$52056..$5209C` | OBSERVER reveal | `a9875fd85eea6fffdd938eb8f780c1302135ee6663506d8c66e1226071f504df` |
| `$52F6A..$52FDE` | BIL's chair | `682cca99699b6ac7c499d5f784ef2eedf90d80e6fd69152eb68b856a90669b91` |
| `$51B82..$51BEE` | Craft services | `7da0f8004bae45f4570cae5d8207ba46caf227b7024fb471139fc67f86b5c5f8` |
| `$51A3E..$51B80` | Craft service table | `f69aa9478b795e0ed0ba26a4767cb6dcca6a074638fcd81b56ca16446b0ab922` |
| `$51C12..$51C9C` | Taxi and bus routes | `368d6e6dd7d547470b22abb8c3512812a322e74f5274c92962cef9fe3f67c059` |
| `$4CE1C..$4CE30` | Safe blown flag | `845f4b3f2583c6436b7b580016f5cb11505953c595c16a62f738ea5a2b468c43` |
| `$4D2C8..$4D2D8` | Debris start | `a1305c999af412c1c1d5f46eb9030bdd3a1c2c6318783a2e599c86d101161142` |
| `$4D2D8..$4D358` | Debris colours | `4af820f832a45130c40a34481ebae17c7a03c33ad98fd30f3da68bc66f201135` |

## Reproduction

From `research/mercenary-iii-st`, with a census run from `python3 -m m3lab.census_capture`:

```sh
python3 -m m3lab.catalogue_objects --census <census run> \
  --out ../../restricted/mercenary-iii-681/objects.json
python3 -m m3lab.object_scenes                 # needs `bun install` in web/
python3 -m m3lab.catalogue_ledger --run <census run> \
  --surface ../../restricted/mercenary-iii-682/surface.json \
  --comparisons ../../restricted/mercenary-iii-682 \
  --objects ../../restricted/mercenary-iii-681/objects.json \
  --object-comparisons ../../restricted/mercenary-iii-681/objects.scenes.json
```

A full run of the object scenes takes about two minutes, with one cold boot per scene. The tests are `tests.test_catalogue_objects` and `tests.test_catalogue_ledger`:

- **Offline:** synthetic records for the plain, `$800A`, `$8009`, articulated, viewer-box and `$8004` paths, and the per-slot lettering.
- **`M3_CENSUS_RUN` and `M3_OBJECTS`** (the directory holding `objects.json` and `objects.scenes.json`): add the check that the extraction equals the ledger's hashes, the writer, service and disposition inventories, and the recorded comparisons.
- **With `M3_SURFACE` as well:** byte-for-byte regeneration of the ledger.
