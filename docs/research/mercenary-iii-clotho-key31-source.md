# Mercenary III: CLOTHO key31 source and route dependencies

Primary-source wayfinding for the next [R3/#772](https://github.com/odogono/mercenary/issues/772) continuation, 2026-10-05, after the [ordinary TOLOSA HQ barrier](mercenary-iii-tolosa-hq-route.md). **Static data/readers and previously witnessed departure checkpoints only.** This report supplies no ordinary CLOTHO arrival, landing, entrance, key31 acquisition or acquired-key return. It identifies a keyless ground-floor approach and a consequential original encounter trigger that the execution must retain. The [ordinary route handoff](mercenary-iii-clotho-key31-route.md) supplies the subsequent execution, acquired-key return and finite HQ gate outcomes. No content promotion or runtime admission follows.

The coherent first-top is `restricted/mercenary-iii-708/presentation/exact2/start.ram`, SHA-256 `71b957b3b7124959b01bd40b896c921d37902c18cfca042bef1906b155ef0170`. The ignored numeric source packet (historical `restricted/mercenary-iii-772/clotho-key31-source/inventory.json`) and extractor (historical `restricted/mercenary-iii-772/clotho-key31-source/extract.py`) pin sixteen reader/data spans, the original island/group/floor/resident records, and all twelve instruction spans of script140. Raw disassembly and decoded geometry remain in that ignored directory in the main checkout. The graph metadata itself is independently pinned, rather than trusting a changed decoded name against unchanged bytes.

## Native destination and existing departure choices

CLOTHO's Body offset24 is nonzero and inside the coherent scan endpoint `$72AA=116`. Its System centre is integer `[65600,0,-288800]`, read at `$5350/$56DA/$53D0+24`; its radius bits are `$00101680` (nominal92160). Its Y record is nonnegative. Thus the initial native scanner considers it: this is eligibility, not a flight witness. The scanner `$53D6A..$53E5E` chooses the nearest unrotated Body automatically; it does not require a supplied target identity. After the arrival hold expires, `$53F3C..$53F70` requires packed range exponent minus radius exponent **strictly below−7**. For radius exponent16, a range exponent9 refuses and8 can arm arrival. The original packed norm/rounding, not an assumed Euclidean cutoff, owns the boundary. ([Native frontier](mercenary-iii-object-interaction-r3-world-frontier.md); [ordinary encounter/arrival evidence](mercenary-iii-eagle-natural-encounters.md).)

| Already witnessed complete checkpoint | Relevant retained state | Use and limitation |
| --- | --- | --- |
| `restricted/mercenary-iii-778/landing/f300` | Frame963/ticks10607, occupied EAGLE3, METIS60; eye `[165796555,63,70300831]`, contact63; held181 and stack `[181,104,103,135]` | Ordinary landed/re-boarded craft, usable as a departure lead; a new launch must retain original controls. RAM SHA `63dbd455603ad9b53f7e973865cb74b01189735c936b462a0d1bae41fba26c83`. |
| `restricted/mercenary-iii-778/space/f100` | Frame763/ticks8407, selector2/craft3; System `[239445,64,726955]`, yaw700/pitch512, held181 | Already in native space, avoiding a new service or teleport assumption. RAM SHA `a6c190a0dcd8baf39a09506aea02b3f37696d0202a2453bcdc3e5fc6470f0ad8`. |
| `restricted/mercenary-iii-772/followup/native-return/f230` | Frame993/ticks10937; stopped native space at `[239336,64,726907]`, yaw700 | Parent's selected planning source, retained by the [native return ledger/report](mercenary-iii-object-interaction-r3-followup.md). Its complete ordinary KEY181/Board/flight prefix remains required. |

Each choice restores its complete original machine checkpoint; transplanting RAM alone supplies no equivalent execution. The already reached EAGLE route permits a direct manual flight lead without claiming ordinary transport from unkeyed TOLOSA HQ. A service or Transporter alternative must establish its own entrance, selection, transition and future.

Live space controls are read at `$59502`: stick4/8 applies left/right yaw acceleration, while bits0/1 act on pitch rate; yaw and pitch damp through the space parameter block. Digit/F-key throttle and Space braking use the existing [R4 input table](mercenary-iii-eagle-flight.md#static-controls-and-selected-numeric-contract). Space pitch512 has a small nonzero sine, and braking lets speed settle. Foot yaw's sixteen-unit steps cannot be applied as a space-turn recipe. The approximate straight heading from the selected stopped source to CLOTHO is yaw28, with integer delta `[-173736,-64,-1015707]`; this is a planning estimate requiring original-input pulses and observations, not a recovered frame schedule or destination request.

## Arrival does not place the craft at BIL's doorstep

Native Body entry `$5A15E..$5A27C` first assigns eyeY `$01800000` (25,165,824), invokes destination coordinate conversion and binds the environment/island table. It clears actors/request through `$511A8`; CLOTHO has no later destination-specific request among the explicit TOLOSA/PERSEUS/THALIA/PAN cases. That absence does not suppress later campaign, location or firing readers.

`$4EF02..$4F0D6` converts relative System X/Z through the original packed arithmetic/angle table. It XORs longitude with512, and, when playback is inactive, subtracts the destination's **current integer phase**, the high word of the live rotation long at `$575A+offset`. The stored initial surface X is the resulting angle multiplied by4 Body cells, modulo4096; its low word is zero at the store. Surface Z is `(latitudeAngle−256)×8` Body cells, modulo4096. The coordinate conversion and subsequent craft movement must be observed separately.

For planning BIL's Body cellX2422, the desired longitude modulo1024 is approximately `(integer phase word at `$575A+24` modulo1024)+605.5`. The initial coherent CLOTHO rotation is `$00027442`, but subsequent original clock/rotation updates invalidate a fixed source-phase approach angle. The latitude computation uses the original radius and signed SystemY; an approximate inverse for target cellZ300 gives incoming SystemY near−82. These inverse-angle hints help choose a final approach/dogleg; they are not parity-tested numeric flight facts. The original `BODY_ROTATION`/`BODY_X_STORE`, first surface frame and later group/land/contact owners must establish actual placement.

The single authored island is group50 at Body-cell origin `[2421,300]`, descriptor `$6309E`, outline `$636AC`, land colour `$0555`. BIL INDUSTRIES cell1 is therefore Body cell `[2422,300]`. A direct nearest-Body arrival may begin outside that island or very high above it. Native landing/Leave requires the original contact and nonnegative land state, and publishes the same EAGLE3 residence. A body name, static island outline or supplied ground pose cannot close landing or approach. ([Original placement reader](mercenary-iii-eagle-flight.md#contact-space-and-placement-dependencies).)

## BIL INDUSTRIES ground key

The original group50 override at `$23802` names structure244 at cell1 with cell key0 and `(dx,dz)=(-5,-82)`. Building bind `$5600C..$560E2` gives low-word origin `[32618,30308]`, using spacing30. The independent [Catalogue placement](../../payload/dion/catalogue/catalogue.json) is `placement-50-01`; recovered metadata is not access proof.

| Original field | Ground-floor binding or key31 value |
| --- | --- |
| Structure244 alias | `$1A858`, pitch150, scale `[-2,-2]`, palette22/detail51 |
| G / Floor0 | Geometry51, record `$10C46`, `structure-010c46` |
| Key31 Residence | `[24,4,0,1]`: CLOTHO / association4 / G / cell1 |
| Independent state/group/zone | State5 (supply/demand ranks1/1; fixed/heavy/held clear), group50, zone4 |
| World XYZ / local XYZ | `[158761185,0,19690456]` / `[375,0,-652]` |
| Initial model | Record `$305AE`, shared `model-0305ae`; Catalogue's static name is DOOR KEY A |

The plan is the same ground geometry as HQ with Z scale−2 rather than−3. From the south (+localZ), the **keyless** entrance throat is X `[51,269]`, Z `[-640,-560]` (region6). Local X160 gives low-word X32778. Through it, hall3 is X `[-20,340]`, Z `[-1140,-640]`; eastern region4 is X `[340,700]`, Z `[-1280,-640]`, containing key31 near its southeast corner. The lift is farther north at X `[0,320]`, Z `[-1400,-1160]`; it is not needed to reach key31's initial Floor0 residence. Both ground attachments are keyless. The original clamp still applies eleven-unit insets and open-door latches.

Association4 has own region4 plus hooks `(1,8),(2,8),(3,4),(5,4),(6,19),(7,19),(9,20),(15,19)`; the region15 hook is dormant in the authored queue. Indoor binding `$53C7C..$53CBE` matches group/cell/Floor/association independently of these coordinates. The ordinary candidate, native distance key, Take gates and accepted stack/residence writer remain required; initial clear handling bits alone do not certify acquisition. Slot31 does not match the three-entry response table at `$555EE` (216→28,218→115,127→24), so an accepted key Take has no matched pickup-response launch there. Other Head Commands, descriptions, presentation and world predicates remain separate.

The same building has initial Transporter71 on Floor1/association5 and BLUE locator40 on Floor4/association3. Their authored floor selectors and keyless lift are additional exposed route candidates, not key31 acquisition requirements or ordinary onward witnesses. Holding locator40 changes BLUE's independent lamp reader; acquiring key31 does not acquire it.

## Ground entrance triggers a campaign-dependent programme

This entrance has a consequential native location hook. Builder `$4F2A6..$4F2BC` advances past the group labels to `$70FC`; group50's table at `$238B7` contains bytes `[1,0,0,140]`, followed by zero. Trigger reader `$5B6BE..$5B714` matches cell1, any indoor region, Floor0 and requests script140 (`$8C`). It retains the last trigger candidate; this is not an unconditional launch on every walking frame.

Script140 starts at `$761C8`, initially availability `$E0` (available, repeatable and queueable). Its complete twelve-site graph was rechecked against the coherent original and pinned progression metadata. It tests flag22 and returns via `$701DD` when that flag is set. Otherwise opcode `$2A` at `$761CC` requests word `$6FF48=$FFE3`, then jumps to the shared closing helper. The graph grants no key, writes no object bit/account/model swap, and has no invitation/payment gate. Existing active-script, availability, queue and busy-message rules still control actual execution.

The programme consumer `$523E0..$52446` interprets signed `$FFE3`, complements it to offset28 in `$6E50`'s26 paired records, and initializes the programme. In the coherent initial data, pair28 is `[0,1]`; it skips to pair30 `[4,$FE]`, writing timer `$FFFF`, budget4, cursor `$6E6E` and low request byte `$FE`. Native actor selector `$52056..$520A6` chooses the two hostile paths and ATTACK SHIP entry321 for `$FE`. These are initial-data/source consequences, not an observed four-kill programme or ordinary doorway outcome. Changed global pair counts, flag22 or active dialogue can change that future.

Default campaign dispatch `$5A3D0..$5A41A` tries election result119 at32,400 seconds while flag9 is clear; after it is set, mining19 is tried at61,200 seconds. Availability and active-script gates still apply. Flight can advance the clock at an accelerated rate, so calendar/flags/queue/VM/request state must be captured before arrival, ground entrance, Take and departure rather than freezing it to the opening state. Actor pool, programme cursor/count/request/timer/budget, shot/hit/failure, sound owners and life-support context join the effects if actually exposed. ([Campaign reader handoff](mercenary-iii-tourcraft-campaign.md); [R2 owner closure](mercenary-iii-object-interaction-r2-closure-audit.md).)

## Return to HQ and validation boundary

The ordinary HQ probe establishes absent-held31, a closed first door and its native locked branch. The [HQ source report](mercenary-iii-tolosa-hq-source.md) resolves that authored `$F0` placeholder to31, and the later `$F1` door to32. An ordinary key31 acquisition and retained return can test the first door's actual held reader/open latch and corridor transition. It does not by itself open the second door, select PCB218 or launch its repeating response115. Key32 initially resides on DION at BIL'S MOTHERS/G/association7. Keep that onward route and all possible PCB paths unclosed until original execution supplies their dispositions.

| Source span | Role | SHA-256 |
| --- | --- | --- |
| `$53F3C..$53F70` | Native arrival guard | `a6970036e2adfd3e501c75c087db30e2731c294635052c5feca49664aaaf24fe` |
| `$4EF02..$4F0D6` | Arrival conversion/angle reader | `30760ce57aa315a6ca7d7ba634064a88763cd0fa4bed1cebeda8d5edfcf96873` |
| `$761C8..$761D1` | BIL ground script | `868970409cd7aa163275970e7b6c44311b069a83c71c00a521f7d4feff63cffd` |
| `$523E0..$52448` | Programme request consumption | `9fd5691782815bcea3c23c6530dad09f584571007ec3d9d63ccd137286fc9e6c` |
| `$1A858..$1A875` | BIL alias and Floor selectors | `3350c521f5656fcd11b8eb1a7617b212e2c01b60632d884174851d6e267baef2` |

Validation reread the coherent source, sixteen pinned ranges, original location/body/resident/floor geometry and all twelve pinned script140 instruction spans. No emulator was run for this source investigation. The parent execution must retain full ordinary input/checkpoint provenance and restored futures through arrival/landing, key Take, campaign/encounter exposure, departure, return and acquired-key door opening. These source findings neither close the broader #772 inventory nor admit I1.
