# Residence-conditioned effects audit

## Question and boundary

This audit asks a deliberately narrower question than the open, eight-family
Object-Conditioned Predicate programme: **where does the Reference Build select a
distinct behavior because a particular object is carried, is in the current Room,
or is in a specified Room?** A _Residence-Conditioned Effect_ is that pairing of an
object identity, a Residence predicate, and the resulting observable behavior.

The census includes native 6502 code and Benson Scripts. It excludes the generic
rules that apply equally to every object (drawing an object at its Residence,
Take/Drop distance, the inventory limit, and Board), and object state tests that do
not inspect Residence (for example, a delivery's already-claimed bit). Those rules
remain inside the broader programme; this document does not resolve `UNC-0002`.

The disposition vocabulary is:

- **implemented** — the browser has the effect and focused automated coverage;
- **confirmed-missing** — the Reference behavior is established and the browser
  has no corresponding behavior;
- **governed-departure** — a deliberate divergence has an approved Departure
  Record; and
- **unresolved** — the census found a predicate but its behavior or browser status
  is not yet established strongly enough to classify otherwise.

No effect in this census is a governed departure or unresolved. Three Reference
behaviors were confirmed missing from the pre-change browser: Sights, Metal
Detector feedback, and the Pass-controlled lift. All three are now implemented.

## Native effects

The Reference Disassembly locations below refer to
`research/reference-disassembly/snapshot/Mercenary notzed/mercenary_v260411.lst`.
That file is the annotated listing of the locally verified Reference Build. The
tracked decoders independently fingerprint the instruction shapes before exporting
their constants; for example, the interaction/endgame checks cover the Take, Drop,
Poweramp, and restoration sites
([`c64lab/endgame.py:588-596`](../../research/c64-reference-build/c64lab/endgame.py#L588-L596),
[`c64lab/endgame.py:685`](../../research/c64-reference-build/c64lab/endgame.py#L685)).

| Object | Residence predicate | Reference behavior and source | Browser disposition and verification |
| --- | --- | --- | --- |
| Photon Emitter (slot 16) | carried **or** lying in the current dark Room | Room setup calls the inventory and Room searches at listing lines 9494-9505 (`$91F2-$9208`); absent Emitter zeros all three Room colours. | **implemented** — live Residence is supplied to `indoorScene`, whose carried/same-Room predicate controls darkness ([`web/src/session/index.ts:1377`](../../web/src/session/index.ts#L1377), [`web/src/scene/index.ts:135`](../../web/src/scene/index.ts#L135)). |
| Anti Time Bomb (slot 24) | carried when an otherwise qualifying Site strike commits | The carried flag read at listing lines 6954-6957 (`$87AF-$87B2`) diverts to `$8816`, clearing destruction and skipping counters/reaction. | **implemented** — the session derives `restorationCarried` from the current Carried Stack and the Site ledger restores the prior byte ([`web/src/session/index.ts:1779`](../../web/src/session/index.ts#L1779), [`web/src/session/sites.ts:88`](../../web/src/session/sites.ts#L88)); focused browser scenarios begin at [`web/test/site-destruction.test.ts:267`](../../web/test/site-destruction.test.ts#L267). |
| Metal Detector (slot 26) | carried, outdoors, lift idle, with the altitude high byte zero and a nonzero Structure selected | Listing lines 18255-18279 (`$B53D-$B565`) select red for neutral/no reading, green for Palyar, and blue for Mechanoid, then recolour the Benson Display. A focused Reference capture confirmed the colour update completes in the same display pass. | **implemented** — the Gameplay Session reads the live occupied-cell flags, retains the last colour during a Lift Journey, and exposes one colour for all 23 display cells and the communications strip. Focused coverage is in [`web/test/lift-journey.test.ts`](../../web/test/lift-journey.test.ts) and [`web/test/shell-panel.test.ts`](../../web/test/shell-panel.test.ts). |
| Antigrav (slot 27) | carried during Take | Listing lines 10981-10990 (`$9817-$9823`) bypass only the heavy-object refusal. | **implemented** — Take checks slot 27 independently of the fixed-object check ([`web/src/interaction/index.ts:115`](../../web/src/interaction/index.ts#L115)); the focused assertion is [`web/test/interaction.test.ts:137`](../../web/test/interaction.test.ts#L137). |
| Poweramp (slot 28) | carried while aboard the Dominion Dart (craft slot 1) | Two live carried-flag reads double the Dart's throttle contribution and replace its ceiling with `$5A`: listing lines 12735-12749 (`$9F8A-$9F98`) and 12925-12939 (`$A050-$A05D`). | **implemented** — the session re-derives the fitted state every frame ([`web/src/session/index.ts:1656`](../../web/src/session/index.ts#L1656)), and the flight core applies the decoded scale and ceiling ([`web/src/gameCore/index.ts:374`](../../web/src/gameCore/index.ts#L374)). |
| Sights (slot **40**) | carried | Listing lines 9735-9740 (`$9374-$937D`) read `OBJECT_SIGHTS` at `$29E8` and enable sprite 0. Startup configures X=160, Y=116 and expands both axes (`mercenary_v260411.tas:2380-2393`); surface palette setup writes light grey `$0F` at `$B23C-$B240`, while ordinary Room setup writes white `$01` (`mercenary_v260411.tas:4911-4918`). | **implemented by this change** — the fixed-screen bitmap overlay is selected directly from the live Carried Stack. The independently decoded sprite data is payload-owned; browser code does not substitute slot 39 or redraw it as world geometry. The two observed colour phases are why focused capture and browser visual checks remain part of visual acceptance. |
| Door keys (slots 17-23) | the key required by a locked Doorway is carried | Listing lines 10048-10059 (`$9493-$94A1`) derive the lock class and index the corresponding key's flag. | **implemented** — `DoorwayPredicate.opens` tests the Doorway's payload-selected object ([`web/src/navigation/index.ts:133`](../../web/src/navigation/index.ts#L133)); focused doorway coverage is at [`web/test/doorway.test.ts:86`](../../web/test/doorway.test.ts#L86). |
| Skeleton key (slot 48, `OBJECT_WEB`) | carried at any locked Doorway | The direct read at listing lines 10040-10045 (`$948E-$9493`) bypasses the lock-class test. | **implemented** — the skeleton-key slot is tested before the ordinary Doorway key ([`web/src/navigation/index.ts:133`](../../web/src/navigation/index.ts#L133)). |
| Kitchen Sink (slot 47) | carried during Take | The direct read at listing lines 10971-10980 (`$980B-$9810`) bypasses both fixed and heavy refusals. | **implemented** — both refusal branches exclude a carried Sink ([`web/src/interaction/index.ts:115`](../../web/src/interaction/index.ts#L115)); the take-override tests begin at [`web/test/interaction.test.ts:118`](../../web/test/interaction.test.ts#L118). |
| Pyramid (slot 56) | carried during an airborne Drop | Listing lines 11215-11223 (`$98FE-$9907`) permit Drop despite the airborne state. | **implemented** — Drop consults the decoded exemption slot ([`web/src/session/index.ts:1508`](../../web/src/session/index.ts#L1508)); focused coverage is [`web/test/object-state.test.ts:262`](../../web/test/object-state.test.ts#L262). |
| Pass (slot 46) | carried at the restricted surface-to-hangar lift | Listing lines 17995-18004 (`$B430-$B43E`) permit hangar 5's lift; otherwise they emit `PASS HOLDERS ONLY`. | **implemented** — entrance 5 requires slot 46 in the Carried Stack. Absence or a nearby dropped Pass emits message 57 without starting sound or travel; other entrances and upward exits are unchanged. Focused coverage is in [`web/test/lift-journey.test.ts`](../../web/test/lift-journey.test.ts). |

### The two Sights objects are not interchangeable

A focused VICE monitor run against the verified interactive capture set slot 40's
carried bit and stopped immediately after `$937D`. It observed sprite zero enabled
(`$D015=$01`), expanded on both axes (`$D017=$01`, `$D01D=$01`), positioned at
VIC coordinates X=160/Y=116 (`$D000=$A0`, `$D001=$74`), with surface colour
`$D027=$0F`. The gameplay screen's sprite-zero pointer was `$D9`, resolving to
`$7640`; its 63-byte mask was `FF 00 FF` followed by zeroes. Subtracting the VIC
border origin (24, 50) yields Reference Viewport origin (136, 66). Browser visual
checks at 1280-wide and 800×600 layouts confirmed the resulting two expanded bars
remain fixed and pixel-aligned, and disappear on the frame after Drop.

The decoded object table contains two objects named Sights: slot 39 starts in Room
168 and slot 40 starts in Room 09
([`docs/object-locations.md:57-58`](../object-locations.md#L57-L58)). The executable
predicate is not name-based: the only Sights flag read is the absolute read from
`$29E8`, which is object slot 40 (listing lines 9735-9740). Slot 39's flag byte is
`$29E7`; no Sights-display path reads it. Therefore slot 40 activates the overlay
and slot 39 must not.

### Metal Detector transition capture

A focused VICE monitor replay of verified interactive run
`interactive-20260812T123135Z-00d12f22` exercised `$B53D` with the lift idle,
surface Room selected, an altitude whose high byte was zero, and a nonzero Structure. Stopping at
`$B56D` showed the selected colour in `BENSON_DISPLAY_COLOUR` and in the low
nibbles of all 23 Benson colour cells (`$DB78-$DB8E`) before the routine
continued: `$05` for Palyar, `$06` for Mechanoid, and `$02` for neutral. Clearing
the carried flag also selected `$02` in that invocation.

There is no separate detector timer or progressive transition. The outdoor
composition calls the detector routine once at `$AFC0`; a changed colour writes
the complete row before that same call returns, while an unchanged colour skips
the row rewrite. Browser implementation can therefore update on the next frame
without recreating an intermediate cadence.

The guard at `$B547-$B54B` reads only `CUR_Y_HSB` and requires it to be zero.
The accepted band is therefore `$000000-$00FFFF`; it is not an exact-ground
predicate. The browser test covers both `$00FFFF` and the first rejected value,
`$010000`.

### Lift Journey capture

`lab lift capture` restored verified run `interactive-20260812T123135Z-00d12f22`,
admitted each guarded trigger state at the real `$BA54` PAL interrupt boundary,
and then left the Reference main loop and raster interrupt to complete the ride.
It captured every frame's lift position, camera altitude, scene flag, palette and
SID registers, plus raw displays at start, scene crossing and completion. A
second run produced the same boundaries.

| Route | Down: scene / complete | Up: scene / complete |
| --- | ---: | ---: |
| Room 1 | 193 / 340 | 206 / 338 |
| Room 2 | 193 / 336 | 207 / 338 |
| Room 3 | 193 / 340 | 208 / 338 |
| Room 4 | 193 / 336 | 206 / 338 |
| Room 5 | 193 / 340 | 204 / 338 |
| Colony Craft / Room 8 | 191 / 339 | 209 / 338 |

The route-dependent scene frames are main-loop observations, not values guessed
from the motion table. The decoded motion, pitch, colour and raster tables still
drive every intermediate phase. The capture also confirms voice 2 starts from
program selector `$30`, receives its high frequency byte from `$BBA5` each lift
frame, and is stopped through `$D40B` only on completion.

## Benson-driven effects

The decoded Benson payload is the executable evidence for this section
([`payload/benson.json:1`](../../web/test/oracle/benson.json#L1)). Its instruction indices
are stable within schema version 1. The decoder pins the object Room/flag tables
and the 64-slot bound ([`c64lab/benson.py:170-178`](../../research/c64-reference-build/c64lab/benson.py#L170-L178)),
names every indexed access rather than leaking an address
([`c64lab/benson.py:288-307`](../../research/c64-reference-build/c64lab/benson.py#L288-L307)),
and rejects any newly used, unmodelled opcode
([`c64lab/benson.py:335-352`](../../research/c64-reference-build/c64lab/benson.py#L335-L352)).
The browser implements `tsti` (not carried) and `inrm` (not in selected Room) in
the Benson machine ([`web/src/benson/machine.ts:390-407`](../../web/test/oracle/machine.ts#L390-L407)).

| Object(s) | Residence predicate | Observable behavior and decoded source | Browser disposition and verification |
| --- | --- | --- | --- |
| Antenna (slot 30) | carried **or** in Room 16 while the player is in Room 16 | Script 2 loads object 30/Room 16 and combines `inrm` with `tsti` at instruction indices 262-265. Presence activates the Hertz terminal and exposes the hire transaction. | **implemented** — both residence alternatives and absence are exercised at [`web/test/hire.test.ts:51-73`](../../web/test/hire.test.ts#L51-L73). |
| Delivery goods (16 buyer rows listed below) | carried into the buyer Room, or already lying there; completion occurs once the object is lying in that Room | Shared instructions 381-397 use `tsti`/`inrm` to ask the player to leave carried goods, wait for the matching Residence, then claim the object and credit the balance. | **implemented** — every row, one-shot behavior, and shared-goods exclusion are exercised at [`web/test/deliveries.test.ts:187-238`](../../web/test/deliveries.test.ts#L187-L238). |
| Captured Mechanoid (slot 12) | specifically in Room 102 | Before each Mechanoid delivery, instructions 398-410 temporarily select slot 12/Room 102; if the leader is elsewhere the sale is refused. | **implemented** — absence, replacement, and the Palyar hand-in that closes Mechanoid trade are covered at [`web/test/deliveries.test.ts:241-292`](../../web/test/deliveries.test.ts#L241-L292). |
| Novadrive (slot 25) | carried at both authorization checks, unless the hired flag is already set | Script 7 selects slot 25 at instructions 411-418 and tests it again at 430-432. This authorizes launch of craft 7; dropping it between prompt and recheck refuses launch. | **implemented** — no-authorization and live recheck behavior are exercised at [`web/test/escape.test.ts:274-324`](../../web/test/escape.test.ts#L274-L324). |
| Pass (slot 46) | still in its initial Room 80 when the one-time Palyar Gratitude reward runs | Script 10 selects slot 46/Room 80 at instructions 484-490. If present, it moves the Pass to Room 1; otherwise the alternative 500,000-credit reward applies. | **implemented** — this Benson Residence effect is separate from the carried-Pass lift gate. Both reward branches are exercised at [`web/test/faction-objective.test.ts:35-80`](../../web/test/faction-objective.test.ts#L35-L80); the decode is summarized at [`notes/decode/endgame.md:647-651`](../../notes/decode/endgame.md#L647-L651). |

The delivery family expands to the following 16 independently confirmed
object/buyer predicates. These are separate effects even when two factions want
the same object, because buyer Room, reward, and downstream exclusivity differ.
The browser's expectation table is a readable projection of the decoded scripts
([`web/test/deliveries.test.ts:18-125`](../../web/test/deliveries.test.ts#L18-L125)).

| Faction | Buyer Room | Object slot and identity | Credit |
| --- | ---: | --- | ---: |
| Palyar | 136 | 29, Neutron Fuel | 200,000 |
| Palyar | 155 | 42, Essential 12939 Supply | 50,000 |
| Palyar | 162 | 38, Gold | 100,000 |
| Palyar | 163 | 44, Catering Provisions | 60,000 |
| Palyar | 165 | 41, Medical Supplies | 40,000 |
| Palyar | 173 | 31, Energy Crystal | 100,000 |
| Palyar | 147 | 34, Large Box | 35,000 |
| Palyar | 146 | 35, Useful Armament | 65,000 |
| Palyar | 144 | 43, Winchester | 100,000 |
| Palyar | 170 | 45, Databank | 100,000 |
| Palyar | 154 | 12, Captured Mechanoid | 250,000 |
| Mechanoid | 70 | 29, Neutron Fuel | 250,000 |
| Mechanoid | 50 | 31, Energy Crystal | 100,000 |
| Mechanoid | 48 | 34, Large Box | 80,000 |
| Mechanoid | 34 | 35, Useful Armament | 120,000 |
| Mechanoid | 18 | 43, Winchester | 250,000 |

## Completeness method and limits

The result is a code census, not an inference from remembered gameplay:

1. Scan the Reference listing for every absolute or indexed access to the object
   flags table `$29C0-$29FF`. Separate generic table mutation and Benson handlers
   from fixed-slot reads. The fixed reads are exactly Anti Time Bomb, Sights,
   Skeleton key, Sink, Antigrav, Pyramid, Poweramp (two sites), Pass, and Metal
   Detector. Ordinary keyed Doorways are the sole identity-indexed native read.
2. Scan all callers of the native inventory and Room search helpers. Outside the
   Benson `tsti` handler, the only identity-specific carried/same-Room combination
   is the Photon Emitter at `$91F2-$9208`.
3. Census every decoded Benson `tsti`, `inrm`, `tsto`, `modf`, and object-table
   `stor`, then trace register 14 (object) and register 15 (Room) to each predicate.
   This yields Antenna, the delivery family, the Captured Mechanoid gate,
   Novadrive authorization, and the Pass reward. The decoder's closed opcode and
   address vocabularies make a new script-side object access fail extraction rather
   than disappear silently.
4. For each effect, inspect browser production code and focused tests. A generic
   Benson implementation counts as implemented only where a scenario exercises the
   decoded Residence branch; mere support for the opcode is not enough.

The census establishes predicate shape and deterministic outcomes. It does not
replace focused Reference captures where audiovisual timing is the remaining
question. Sights composition and Metal Detector recolouring therefore retain
capture evidence alongside their static decode. Nor does this audit
claim completeness for non-Residence object predicates such as description flags,
combat target identity, craft occupancy, or delivery claimed state; those remain
within the broader Object-Conditioned Predicate work and `UNC-0002`.
