# Mercenary III: TOLOSA HQ source and PCB access gates

Primary-source wayfinding for [R3/#772](https://github.com/odogono/mercenary/issues/772), 2026-10-05, following the [scope review](mercenary-iii-object-interaction-r3-scope-review.md). **Static reader and initial-data evidence only.** This report supplies no ordinary HQ entrance, lift, key acquisition or PCB Take witness. The [ordinary HQ route and execution ledger](mercenary-iii-tolosa-hq-route.md) own those claims. No runtime, Catalogue, Data Payload or playable admission changes are made here.

## Host and initial residents

The coherent first-top source is `restricted/mercenary-iii-708/presentation/exact2/start.ram`, SHA-256 `71b957b3b7124959b01bd40b896c921d37902c18cfca042bef1906b155ef0170`. The ignored [numeric extraction](../../restricted/mercenary-iii-772/hq-source/inventory.json) pins fourteen original reader/data spans, both decoded floor plans and eleven independent resident records. Its [extraction helper](../../restricted/mercenary-iii-772/hq-source/extract.py) also verifies every instruction-source span in the existing reception, meeting and PCB effect graphs against this source. Geometry follows the original [structure reader](../../research/mercenary-iii-st/m3lab/geometry.py), not a transplanted original machine workspace.

[Catalogue placement `placement-23-12`](../../payload/dion/catalogue/catalogue.json) identifies P C BIL HQ BUILDING at TOLOSA Body100, group23, cell18 (`02-01`), Body cell `[2739,1572]`. Original placement `$22E8A` binds structure49 and cell key4, with `(dx,dz)=(100,-40)`. Reader `$560B6..$560DA` gives cell-relative structure origin `[35768,31568]`, using spacing30. These are low-word origins inside the actual Body cell, not standalone world coordinates.

| Floor | Original alias selection | Geometry | Scale | Palette | Pitch / base Y |
| --- | --- | --- | --- | --- | --- |
| G / 0 | `$10C1A+6` → 51 | `structure-010c46` | `[-2,-3]` | 50 | 150 / 0 |
| B / 10 | `$10C1A+16` → 48 | `structure-0106b0` | `[-2,-3]` | 50 | 150 / 1500 |

The native basement label B means Floor10. It is not an eleventh storey. The alias preserves its scale/detail when selecting a floor, as in the [floor-reader report](dion-interior-reader-notes.md#floor-binding-and-presentation).

| Resident | Initial Floor / association | Local XYZ | Relevant owner |
| --- | --- | --- | --- |
| 96 reception | 0 / 4 | `[500,0,-1753]` | Ground reception model |
| 187 profile | 0 / 4 | `[511,28,-1697]` | Separate resident from seated PCB |
| 64 Transporter | 10 / 7 | `[-245,0,-1861]` | Initial destination residence already populated |
| 97 chair slot | 10 / 15 | `[552,0,-2251]` | Initial NULL model; later model swaps |
| 99 note | 10 / 15 | `[633,64,-1937]` | Separate selectable model/description |
| 218 PCB | 10 / 15 | `[533,0,-2463]` | Initial state4; fixed/heavy/held bits clear |
| 224 table | 10 / 15 | `[505,0,-1971]` | Separate support/model owner |

PCB218's original XYZ is `[179539405,1500,103051697]`, Residence `[100,15,10,18]`, group23/zone1. Its independent model-table binding is seated entry218, `model-036fcc`. Drawing hooks for association15 include own region15 and `(3,54),(4,54),(5,54),(6,54),(11,41),(12,54),(13,41),(14,60)`. Hooks publish drawing queues; they neither move the resident nor bypass movement or Take eligibility.

## Ordinary-input probe targets

From the south (+local Z), the ground entrance has a keyless door at local X `[51,269]`, Z `[-960,-840]` (region6). Inside, hall regions3–5 lead to the keyless lift doorway at X `[99,221]`, Z `[-1740,-1710]` (region2), then the lift at X `[0,320]`, Z `[-2100,-1740]` (region1). Local X160 is the centre of both keyless doorways, giving low-word world X35928. These rectangles are route targets, not a proven sequence of walking frames. The native clamp applies an eleven-unit inset and respects door-open latches.

The Floor-key handler `$5684C..$5688C` requires foot selector `$7142=1`, no selected Transporter at `$6F32`, and active region flag `$2000`. B scancode `$30` maps to Floor10; G `$22` maps to Floor0. Thus B must be delivered while the ordinary player is in the lift region, rather than forcing the floor table or target. The target writer `$56D7E` arms the lift attachment. `$56CF4` waits for its door latch to close, then `$56D02..$56D3A` advances the countdown/displayed floor. Arrival `$56D98..$56E5E` binds geometry, places eye Y at `Floor×pitch+63`, rebuilds the scene and re-evaluates region.

The basement hall reaches region4 at X `[340,700]`, Z `[-1710,-1200]`, where the Bil meeting trigger lives. Its northern region12 ends at Z−1920, while PCB's own region15 starts at Z−1935. Those rectangles have a fifteen-unit separation. Native adjacency `$5B4D6..$5B5BC` searches matching rectangle boundaries; direct northward hall access must therefore be observed rather than assumed. The authored alternate path crosses two keyed throats: region10 at X `[-125,-67]`, Z `[-1950,-1920]`, then region13 at X `[-20,0]`, Z `[-2464,-2411]`.

### The door bytes are placeholders

The decoded basement door bytes `$F0/$F1` are **not object slots240/241**. Cell key4 is mapped by `$5602E..$56034` to `(4>>1)+29=31` at `$7192`. During assembly `$5AF10..$5AF20` resolves each placeholder's low nibble against that building key. The two actual door predicates are therefore held31 and held32. The initial coherent state bytes for both have clear held bit7. Catalogue's shared static name for both is DOOR KEY A; use their numeric identities when recording the required route.

| Throat | Attachment offset | Resolved held reader | Initial distant key residence |
| --- | --- | --- | --- |
| Region10 | `$250` / 592 | `$649A`, slot31 | CLOTHO24, group50/cell1, BIL INDUSTRIES, G/association4 |
| Region13 | `$24C` / 588 | `$649E`, slot32 | DION16, group28/cell68, BIL'S MOTHERS, G/association7 |

`$5BA76..$5BA82` reads the resolved held bit. Absent it, `$5BA86` sets the key-lock indicator; it does not authorize opening. Region binding `$5B346` requires the door-open latch to be negative. The first door's control/latch/key bytes are `$4068..$406B`; its key byte is31. For the second they are `$4064..$4067`, key32. A restored initial Catalogue record, a raw placeholder byte or a supplied selected key cannot replace an ordinary acquisition witness.

This gives a concrete potential expansion: a basement corridor/refusal probe can precede remote key routes. It does not yet prove both keys are necessary for every possible PCB selection/Take path. In particular a drawing hook may expose a resident through another region; the native candidate, range and handling must be recorded. The first proposal must not turn the static wall/key evidence into an artificial item denial.

## Dialogue and pickup effects remain separate

The original trigger table `$22F0C` selects reception script5 on cell18/G/any indoor region, and meeting script6 on cell18/B/region4. The trigger reader `$5B6BE..$5B714` retains a candidate and calls the availability/queue launcher. It does not run meeting on every floor change. Both initial availability bytes are `$A0`; election result script119 writes them zero at `$759D2/$759D5`. Default campaign timing therefore belongs in any ordinary continuation. ([Service/campaign evidence](mercenary-iii-services-progression.md#invitation-reception-and-meeting).)

All 34 reception sites and 46 meeting sites, including shared waits and closing helpers, were rechecked against this coherent source. Neither graph writes object bits or model swaps. Meeting dialogue itself supplies no held31/32 grant, PCB acquisition or doorway permission. Transporter64's hall-side residence and eligibility are separate from the PCB room; this report supplies no ordinary Transporter activation or onward route.

Successful PCB Take matches response115 (`$73`) in `$555EE` via helper `$555D4`. The separately verified 28-site [R2 effect graph](mercenary-iii-object-interaction-r2-effects.md) starts at `$7468B`; it arms1500, then held-gated continuations arm1000 and1500, followed by a phase that re-arms3000 repeatedly while218 remains held. False held tests return through `$701DD`. These are game-tick countdowns, not fixed wall-clock or frame durations. The graph clears message flag13, uses packed requests and shared closing helpers, and writes no object bits, accounts, model swap or encounter request.

Model selection is nevertheless mutable through independent campaign families: swap-A `$52F6A` binds chair slot97 to entry316 and PCB218 to standing entry317, clears fixed bits on chair97/table224 and writes the independent model latch `$6E84=$FFFF`; swap-B `$52FC8` binds97 to316 and218 to NULL entry0. Their callers are not admitted by establishing a Take alone. A natural acquisition would add the repeating timed future, held predicate, scheduler/queue/return-stack state, presentation dependencies and restore futures to R2 closure.

## Reader pins and disposition

| Original span | Role | SHA-256 |
| --- | --- | --- |
| `$5600C..$560E2` | Cell key and structure origin | `9fe59aabfc246d737e2e0b5ca98430ca25381d70b682f659669ebf9acc11886a` |
| `$5684C..$5688C` | Floor-key gate | `c6a88df44a8b9a79d7606fd8156a5668e1e5b049bfb8a349dc4a2a8ae683f88f` |
| `$5AF10..$5AF70` | Resolved placeholder door keys | `d9cff9e1a9779f39b73f1a800b2f3db32828008f82e841d88462da043053c966` |
| `$5BA24..$5BA8E` | Door-open predicate | `92ba85b58acba475c2bc3884778ef899b02292342362b0d971a627aece4e0d7a` |
| `$7468B..$74727` | PCB response | `493a9f09011c8c7a4b25038f970201a00dbb3a31da59b1b1af3a2434d6dd4598` |

Live observations should retain region `$7194`, flags `$71CC`, local X/Z `$7038/$7040`, structure `$7188`, origins `$718A/$718C`, building key `$7192`, floor `$7138`, displayed/travel floor `$7158`, lift target `$6F3A`, period/countdown `$6F3C/$6F3E`, attachment offset `$717E`, floor-table pointer `$72BA`, and each door control/latch/key and mutated plan vertex. `$71F6` is candidate proximity and `$6F2C` is panel inventory; neither is the active region flags.

Validation: the extraction verifies the coherent-source digest, fourteen original spans, floor/resident metadata and108 decoded instruction-source spans (34+46+28). No emulator was run for this source report. Ordinary execution, acquisition, exclusion and persistence disposition remain owned by the R3/R2 probe handoff.
