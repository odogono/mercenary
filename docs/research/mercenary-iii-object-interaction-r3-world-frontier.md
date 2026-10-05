# Mercenary III R3: native destination and world frontier

Primary-source scope review for [R3/#772](https://github.com/odogono/mercenary/issues/772), 2026-10-05, after R2/#784. **Proposed dependency frontier; no additional gameplay or content is admitted.** The already approved native EAGLE consequence cannot be closed by a METIS/TOLOSA/JUNO destination list or the nine acquired item identities. The original scan has 29 nonzero initially eligible destinations, whose authored placements bind 43 distinct groups. A delivery retaining its native arrival and generic Take/Drop readers must account for that frontier, or document an original gate for each omitted edge. Existing ordinary routes establish only their named executions. They do not establish every destination, acquisition, building or campaign future.

## Primary evidence and method

The mutable source is coherent first-top `restricted/mercenary-iii-708/presentation/exact2/start.ram`, SHA-256 `71b957b3b7124959b01bd40b896c921d37902c18cfca042bef1906b155ef0170`. Media/program SHA-256 is `4e8b74122910bcaa109b944eebb6f0ec18fdeb1175c34eea3c932d0e1b18b62c`; [the baseline](../../research/mercenary-iii-st/config/baseline.json) owns emulator/media identities. This pass independently decoded the source's instruction slices with Capstone 5.0.7 / M68K 68000 big-endian, checked the whole RAM identity, and read its numeric records using the laboratory [RAM reader](../../research/mercenary-iii-st/m3lab/ram.py), [resident decoder](../../research/mercenary-iii-st/m3lab/census_objects.py) and [authored placement decoder](../../research/mercenary-iii-st/m3lab/census_locations.py). The historical disassembly was an address aid only. Original expression, names, data and decoded instructions remain in ignored `restricted/mercenary-iii-772/world-frontier/`; the report exports factual numeric scope and references under [ADR 0002](../adr/0002-separate-rom-research-from-implementation.md).

The resident decoder's initial held/stack agreement is a check of this one coherent capture, not a universal invariant: the [R2 native-owner audit](mercenary-iii-object-interaction-r2-scheduler-native.md) independently observes held KEY A38 outside the stack. Static location/model recovery proves record identity, not gameplay access. [ADR 0065](../adr/0065-promote-bounded-dion-catalogue-content-through-an-explicit-export.md) keeps immutable recovery provenance independent of mutable admission.

## Exact native scan and environment dependencies

`$53D32..$53F70` loads the **long** scan endpoint `$72AA=116`, scans offsets116,112,…,0 and computes nearest range. Body centre X/Y/Z are `$5350/$56DA/$53D0 + offset`; a negative stored Y skips that entry before range computation. Every initially scanned stored Y is zero, so this gate excludes none of the 30 initial entries. The physical arrays include VOID120 and sentinel124, but this current scan excludes them. Once hold word `$71A2` is zero, nearest long `$6FB6` is copied to request long `$6FB2`. Offset0 refuses automatic entry. Nonzero entry arms `$70BE` only when **signed range exponent minus radius exponent is strictly below −7**. This is the original packed Euclidean range, not a geometric distance clamp. Radius is encoded long `$5450+offset`; its exponent word alone defines that arrival comparison. ([Pinned scan source](../../restricted/mercenary-iii-772/world-frontier/disassembly.txt), range/hash below; independent retained-source assertion in [the natural encounter observer](../../research/mercenary-iii-st/scripts/eagle-natural-encounters.py).)

Body entry `$5A15E..$5A27C` retains craft parameter identity and installs the destination environment. Sky night/day words are `$7B6A/$7B6C+offset`; four environment bytes are `$7BEA+offset`; colour is word `$54D2+offset & $FFF`; live rotation long is `$575A+offset`. The selected long `$782A+offset` is copied into `$6FAA`. The island list is selected through pointer `$4BD1E` plus its signed table entry at `table+offset/2`; nearest island chooses the actual group. The table below lists all authored groups per Body, not a claim that one landing visits all of them. The environment tuple is the four original bytes, without inventing meanings for each byte. ([Pinned Body-entry source](../../restricted/mercenary-iii-772/world-frontier/disassembly.txt); [location grammar](../../research/mercenary-iii-st/m3lab/census_locations.py); [system field decoder](../../research/mercenary-iii-st/m3lab/tourcraft_export.py).)

| Body offset | Encoded radius | Authored groups | Initial persistent resident count | Environment tuple |
| --- | --- | --- | ---: | --- |
| 0 | `$00161388` | 0 | 22 | [0, 22, 22, 0] |
| 4 | `$000F1F40` | 51 | 1 | [0, 64, 39, 0] |
| 8 | `$00101F40` | 56 | 3 | [0, 43, 35, 0] |
| 12 | `$000E1E00` | 6 | 1 | [0, 43, 35, 0] |
| 16 | `$00111F40` | 2,27,28 | 45 | [255, 26, 25, 24] |
| 20 | `$000E1400` | 55 | 1 | [0, 31, 27, 0] |
| 24 | `$00101680` | 50 | 13 | [0, 31, 27, 0] |
| 28 | `$00101180` | 0,52 | 0 | [0, 31, 27, 0] |
| 32 | `$00111900` | 7,14,15 | 22 | [255, 26, 26, 16] |
| 36 | `$000F1400` | 54 | 1 | [0, 29, 22, 0] |
| 40 | `$00101400` | 0,53 | 1 | [0, 29, 22, 0] |
| 44 | `$001212C0` | 16,17,18,20,21 | 66 | [255, 24, 23, 36] |
| 48 | `$000F1180` | 4 | 1 | [0, 24, 22, 3] |
| 52 | `$000D1400` | 9 | 2 | [0, 27, 18, 0] |
| 56 | `$00101680` | 5 | 16 | [255, 24, 23, 12] |
| 60 | `$000E1680` | 3 | 13 | [0, 25, 23, 3] |
| 64 | `$000E1400` | 29,30,31,32,33,34,35,36,37,38,39,40 | 0 | [0, 27, 18, 0] |
| 68 | `$00121388` | 8 | 9 | [0, 23, 20, 11] |
| 72 | `$000D1400` | 0 | 0 | [0, 22, 6, 0] |
| 76 | `$00141770` | 0 | 0 | [0, 14, 14, 120] |
| 80 | `$00101B80` | 12 | 3 | [0, 18, 14, 2] |
| 84 | `$000F1900` | 11 | 1 | [0, 18, 15, 3] |
| 88 | `$00141F40` | 0 | 0 | [0, 4, 4, 180] |
| 92 | `$00101400` | 24 | 5 | [0, 17, 16, 11] |
| 96 | `$00101400` | 0 | 0 | [0, 8, 4, 0] |
| 100 | `$00101680` | 23 | 8 | [0, 17, 12, 5] |
| 104 | `$001117C0` | 22 | 3 | [255, 6, 5, 7] |
| 108 | `$000F1F40` | 26 | 1 | [0, 9, 2, 0] |
| 112 | `$000D1400` | 0 | 0 | [0, 6, 2, 0] |
| 116 | `$000F1F40` | 0 | 2 | [0, 22, 22, 0] |
| 120 | `$000F1F40` | 49 | 6 | [0, 0, 0, 0] |

Offset0's 22 initial records are absent/reserved/pool identities under the resident census, not 22 naturally reachable DIALIS objects; offset120 includes three initial held items and three other absent identities. The coherent 246-slot census has **218 physically placed residents, three carried and 25 absent**. Its physical resident set spans only a subset of the destination groups. Nameless records and model-table NULL bindings still need their reader dispositions; resident count alone does not mean collectible count. Slots247–255 are cell-bound template workspace identities and must remain separate from persistent resident records. The selected solicitor route already encounters candidate255. ([Resident grammar](../../research/mercenary-iii-st/m3lab/census_objects.py); [R3 route ledger/report](mercenary-iii-object-interaction-r3.md).)

The 29 nonzero initial destinations bind exactly groups `{0,2,3,4,5,6,7,8,9,11,12,14,15,16,17,18,20,21,22,23,24,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,50,51,52,53,54,55,56}`. VOID storage group49 remains an independent carried-object dependency. Groups absent from that authored placement set are not automatically excluded from script/overlay or other later writer domains. MIDAS replication and the LOGOS overlay demonstrate why the initial cell inventory is not the full mutable world contract. ([Primary decoder](../../research/mercenary-iii-st/m3lab/census_locations.py); [original-builder cross-check and overlays](dion-full-location-recovery.md).)

Ordinary original-input native arrival is established for METIS60, JUNO88 and TOLOSA100. METIS return preserves playback0 and live rotation subtraction, but landing/Leave after that return remains unexecuted. JUNO has no initial persistent residents and initializes request0; its group0/region/detail and generic templates still matter. TOLOSA native arrival leads to three passive kills, a hostile incoming shot and unshielded pending failure. The all-destination frontier above is **static eligibility**, not additional ordinary routes. ([R3 return](mercenary-iii-object-interaction-r3-followup.md); [natural arrival/encounter ledger](../../research/mercenary-iii-st/eagle-natural-encounters.json), [report](mercenary-iii-eagle-natural-encounters.md).)

## Item predicates and remote response frontier

These original initial residence records are directly read at `$681C+4×slot` (Body/association/Floor/cell), group/state/zone at `$641D/$641E/$641F+4×slot`. Every row has clear fixed bit4 and heavy bit5 in this initial capture. That fact neither supplies a natural approach/lift route nor guarantees the same state after scripts. In particular PCB218 initially has state4; R2's explicit heavy PCB fixture is a synthetic handling control, not this initial record. ([Pinned numeric extraction](../../restricted/mercenary-iii-772/world-frontier/inventory.json); [original handling reader](../../research/mercenary-iii-st/scripts/object-interaction-r3-inventory.py); [fixture boundary](mercenary-iii-object-interaction-r2-scheduler-native.md).)

| Slot | Body | Group | Association / Floor / cell | Initial state | Required consequence if reached |
| --- | ---: | ---: | --- | ---: | --- |
| 149 detector | 80 | 12 | 3 / 10 / 20 | 4 | Held detector + switch bit1 opens distance/random-rate/PSG path. |
| 40 BLUE locator | 24 | 50 | 3 / 4 / 1 | 4 | Held predicate independently changes BLUE lamp reader. |
| 41 RED locator | 44 | 18 | 6 / 10 / 41 | 4 | Distinct held predicate for RED lamp reader. |
| 89 candidate log | 56 | 5 | 3 / 1 / 69 | 4 | Category7 Enter writes candidacy flag10/starts registration; firing can request script `$12`. |
| 153 disguise | 44 | 17 | 9 / 0 / 100 | 4 | Held predicate suppresses native hostile launch. |
| 193 shield | 44 | 18 | 3 / 10 / 41 | 12 | Held/count guard decrements shield and requests34; absent/exhausted branch requests30 and sets pending failure. |
| 216 CHILD | 56 | 5 | 0 / 0 / 64 | 4 | Successful Take can request response script28. |
| 218 PCB | 100 | 23 | 15 / 10 / 18 | 4 | Successful Take can request response script115; model swap can later suppress the visible model. |
| 127 ORE | 116 | 0 | 0 / 0 / 0 | 4 | Successful Take can request response script24. |
| 157 POWERGLOVE | 44 | 16 | 9 / 0 / 67 | 12 | Held handling bypass changes heavy-object admission. |
| 158 ANTIGRAV | 52 | 9 | 1 / 0 / 50 | 4 | Independent held handling bypass. |

The predicates' primary readers are detector `$4CC46` (state149 `$6672`, switch bit1 `$6F25`), BLUE/RED lamp `$543F0/$543FE` (state40 `$64BE`, state41 `$64C2`), category7 Enter `$567AE..$567DE`, hostile/hit `$52448..$52546` (state153 `$6682`, state193 `$6722`, count `$6ECA`), and generic Take `$55364..$55458` (state157 `$6692`, state158 `$6696`). The response table `$555EE..$555F6` selects the three object-specific scripts. These were independently re-read from pinned source; their complete behavior and execution limits belong to [R2](mercenary-iii-object-interaction-r2-scheduler-native.md), [the owner audit](mercenary-iii-object-interaction-r2-owners.md) and [R3 follow-up](mercenary-iii-object-interaction-r3-followup.md).

None of the eleven rows above has an ordinary acquisition witness in those ledgers. BLUE174's actual acquisition does **not** acquire locator40, nor does holding BLACK165 eliminate world predicates. Synthetic remote pickup/shield/candidacy controls prove finite branches without resolving residence access. Excluding ORE acquisition does not exclude script `$81`: global26-pair exhaustion is an independent launcher for the shared departure/model family. Actual three-kill TOLOSA sum87 fails that zero-sum guard; it does not prove impossibility of later completion. Model swap-B changes slots97/218 to chair/NULL independently of their residence/stack. ([R2 owner audit](mercenary-iii-object-interaction-r2-owners.md); [native conditional graph](mercenary-iii-object-interaction-r3-followup.md); [ordinary count execution](mercenary-iii-eagle-natural-encounters.md).)

## Return, Leave and building/service dependencies

Leave `$5569E..$5573C` is admitted by nonnegative craft slot, contact, nonnegative land word and non-VOID Body, followed by placement `$55970..$559E8`. Placement publishes that one craft's XYZ/yaw, Body, Floor, group, zone, association and cell. It does not have a METIS-only destination test. METIS safe landing/Leave/re-board and native KEY Drop/missing-key refusal are actual controls. A distant arrival cannot omit the same authoritative craft residence or silently replace it with a new craft. TOLOSA and JUNO arrivals do not yet prove Leave/re-board there. ([Pinned Leave/placement source](../../restricted/mercenary-iii-772/world-frontier/disassembly.txt); [R4 ordinary controls](mercenary-iii-eagle-flight.md).)

The existing nine-object evidence includes an unchanged open TAXICARD under another item head. BLACK Read actually requests the retained taxi service after the spaceport arrival. This is a concrete outward edge to onward-service work, even though a second completed journey is unproved. Card/stream ownership cannot be derived solely from the current head. Free waiting preserves the existing campaign clock/script futures while navigating. ([Ordinary BLACK head commands](mercenary-iii-object-interaction-r2-owners.md); [clock/campaign owners](mercenary-iii-tourcraft-campaign.md).)

Static remote residents have indoor associations/Floors that require original structure binding, doors, region admission, lift/floor and service/trigger readers before natural acquisition can be certified. Existing research identifies METIS solicitor Floors1/9 and Transporter67→VESTA68, TOLOSA HQ reception/Floor10 and Transporter64→BACCHUS65, and bus operation on DION/ERIS. Those are concrete unresolved edges, not new natural route claims. The existing exclusions predate approved native EAGLE and cannot themselves prove these edges unreachable. Scope review must determine whether ordinary original controls reach each hook; disabling Enter, a floor, a service response or Take would create an unevidenced denial. ([Primary-reader/fixture handoff](mercenary-iii-services-progression.md); [authored floors and resident matches](dion-full-location-recovery.md); [R3 original scope boundary](mercenary-iii-object-interaction-r3.md).)

## Smallest honest proposal and closure blockers

A concrete first-delivery proposal preserving approved native EAGLE is: retain the original 30-entry scan including non-arrivable0; carry all 29 nonzero initial destinations into the dependency review; retain their exact 43 authored groups and the independent VOID storage/template working families; review all 218 initially physical residents, three carried identities and25 absent identities according to actual reader/writer role; and close later resident/model/group/script mutations reachable from those mechanisms. This is a finite **review frontier**, not permission to promote everything or a certificate that every route is reachable. Each static candidate may narrow only through an original gate and its admitted writer proof. The nine acquired identities remain the ordinary acquisition witness set, not a dispatch whitelist.

The current evidence cannot finalize a smaller exact runtime promotion set. The blockers are concrete:

1. For the 26 nonzero Body identities without ordinary native arrival witnesses, establish original arrival/environment/reference behavior or an original exclusion proof. METIS/TOLOSA/JUNO cannot be turned into a whitelist. All destination rotations, outlines, ground/template/detail/region and actual model forms need provenance/reference closure.
2. For each selected resident/template/cell binding, close native selection/approach/Take/refusal/placement and any corresponding building/service/floor hooks. Resolve the eleven predicate/response rows above first because they change already exposed flight, lamps, handling, sound and scripts.
3. Traverse actual admitted script entries, resumed callers and timed continuations to fix the final resident/model/held writer domain. Detector acquisition or any writer149 reopens I4 random sound/priority omissions; remote responses, candidacy and fleet completion cannot be disposed of merely by excluding their item names.
4. Close reached native surface/space interaction contexts, landing/sea/collision/key recovery, encounter shield/disguise/hostile progression, full failure/menu/restart and ordinary restored futures. Existing synthetic controls and first pending-failure checkpoint keep their stated limits.

This proposal preserves the authorized native mechanics and makes the remaining admission decision reviewable. It keeps I1 blocked on the exact reviewed closure rather than claiming that implementation may discard uncovered native edges. R3 and R2 final admission closure remain open until those dispositions are complete.

## Independently checked source pins

All ranges are half-open slices of the coherent source above. Original instructions/data remain ignored.

| Source owner | Range | SHA-256 |
| --- | --- | --- |
| nearest/arrival | `$53D32..$53F70` | `03f3a88a82ccb68a1859c5716973f9a0235979b1ef348eacd2320913dbc66a7d` |
| Body entry | `$5A15E..$5A27C` | `47b7defe0811a15336c0ba84a60e6ac36c97348eec11f5462bf5d482502154c1` |
| Leave | `$5569E..$5573C` | `b7cd0bfc2a997c1bffcb6c2809fd4b88f580f040be27ca145357a8424fc2c429` |
| placement | `$55970..$559E8` | `8519e1f0f01b0516e142217c9e5fbaeb4aa1790f7711d56dbba049551e575fae` |
| lamp predicate/phase prefix | `$543DE..$54412` | `2ffcf9d5423b497966f3c649fe1d814f9c275069a2343f85d101f81a4b5ea4cc` |
| detector predicate/distance prefix | `$4CC46..$4CCB0` | `2c9d38d0b0343de44a0aa7b7558c7b11b63f00a01b00c7c52e8602e18f222e85` |
| category7 Enter | `$567AE..$567DE` | `e007c69138749659a2caf2d18545a110e03d8b1e1b8a184615270e24af8b42ea` |
| hostile/hit/shield | `$52448..$52546` | `d955286f3ea2e74a3527cc09189b42f02637f3bc2818b61bc4b327010b1fc55d` |
| Take handling/acquisition | `$55364..$55458` | `28c0a29dd1d2fd5e1d94109a236b80a56b364d77032837cd906fd4b8b1a20323` |
| response table | `$555EE..$555F6` | `882ea2b1816b7427fe2eb1e84a980f82fecbae3bf3cd31d00aef24a448b4c817` |
| X/Z/radius/colour arrays | `$05350..$05550` | `0e089bcd11e4ed7b8cb80058ceed91d6a012717e0321c939ce395f5eea696992` |
| Y array | `$056DA..$0575A` | `38723a2e5e8a17aa7950dc008209944e898f69a7bd10a23c839d341e935fd5ca` |
| initial live rotations | `$0575A..$057DA` | `34ad6e7a46d4ad3481928dc72aa3622da280fcd79e48143b8c94ff6ac25f09b4` |
| sky/environment arrays | `$07B6A..$07C6A` | `43236af8276de1a8748ffa564d1e9e3382b77a10d48fc0b013f4065adfd4057c` |
