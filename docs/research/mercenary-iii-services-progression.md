# Mercenary III: services and progression after the METIS taxi

Research for [#703](https://github.com/odogono/mercenary/issues/703), 2026-10-02. This is **R5** of the [integration report](mercenary-iii-integration.md). It informs D2; it is neither an implementation contract nor permission to promote Catalogue content into play.

**Decision handoff:** [D2 / #704](mercenary-iii-tourcraft-milestone-review.md) accepts the staffed TOURCRAFT journey to on-foot TOLOSA, with research gates #707–#709 and implementation tickets #710/#711. D2 defers the solicitor shortcut and bus access rather than commissioning them as prerequisites for this flight. The ranking and recommendations below retain R5's evidence and its pre-review alternatives.

## Recommendation

Rank the **METIS spaceport → TOLOSA staffed TOURCRAFT journey** first: two fresh cold boots now demonstrate approach, boarding, launch, another Body and automatic on-foot arrival. It extends the first slice's own spacecraft prompt and introduces original automated craft flight, rather than relying on a familiar craft name. Its recovery cost is greater than another taxi: scripted control playback, the craft Mover, Body changes and accelerated time all enter the path.

Keep the **solicitor's upstairs Transporter → VESTA** as the strongest alternative to commission before D2 chooses. Static readers and an earlier synthetic indoor capture support it, but natural lift access is still unproved. A **bus ride with next-stop exit** is a useful smaller service mechanism once a starting location is justified: this survey reproduces the bus mechanism only after a synthetic relocation. No natural route to a bus-served Body was completed. Do not present Catalogue navigation, relocation, or the flight to TOLOSA as proof of that route.

## Evidence boundary and baseline

The [pinned baseline](../../research/mercenary-iii-st/config/baseline.json) is unchanged: STX SHA-256 `4e8b74122910bcaa109b944eebb6f0ec18fdeb1175c34eea3c932d0e1b18b62c`, EmuTOS `154803e3ff4851f3dc358b91b16d6b6110d187a81d8132ecb665af49878939d5`, Hatari 2.6.1 `05723606c75a1f0642395974abdce2cbbe48b0a09a747f65cdfca7ef9201e11a`. `m3lab.boot` checks all three before running. Compared repository revision: `364b2843`.

- **N — natural input:** only scancodes into `$56726` and held joystick input into `$7056`. The original consumes these; no pose, money, service, script, admission or code is patched. This is not a physical keyboard timing test.
- **P — synthetic probe:** explicitly writes research state or invokes a location reader. It can corroborate a mechanism, not establish a route from New Game.
- **S — static:** original readers, records or decoded scripts. A condition absent from an examined reader is not a proof that every surrounding route is ungated.
- **D — documentary:** original Novagen scans; their printing/platform relationship to this STX remains unverified.

New runs use the integration report's original machine configuration and `Plan(pal=False)`: roughly 60 Hz, with no video-sync or fixed-cadence patch. Absolute VBLs are since reset. The remake's accepted **50 ticks/s, eleven ticks/frame** policy ([ADR 0058](../adr/0058-run-mercenary-iii-at-50-hz-with-a-confirmed-fixed-frame-cadence.md)) remains separate. New slices need their own exact-cadence checks; these VBL schedules are research recipes, not proposed browser timing.

RAM, original media, screenshots, scans, logs and disassembly stay under ignored `restricted/mercenary-iii-703/`, following [ADR 0002](../adr/0002-separate-rom-research-from-implementation.md) and [ADR 0043](../adr/0043-admit-damocles-play-alongside-the-second-city.md). No Damocles record supplies a Dion fact. [Catalogue validation](dion-catalogue-validation.md) establishes content coverage, not gameplay reachability; [ADR 0061](../adr/0061-admit-a-sessionless-dion-catalogue-under-the-dion-path.md) keeps its loader and persistence separate from play.

## Ranked candidate slices

The shipping [Dion session](../../web/src/dion/session.ts) and [taxi service](../../web/src/dion/service.ts) provide the bounded taxi passenger path; the [shared foot Mover](../../web/src/onFoot/index.ts) and [Damocles craft Mover](../../web/src/damocles/craft.ts) are comparison/reuse targets. [#563](https://github.com/odogono/mercenary/issues/563) owns craft work and [#419](https://github.com/odogono/mercenary/issues/419) owns boarding convergence. The table names impacts on those mechanisms; it does not generalise their interfaces or give Damocles data Dion identity.

Ranking weighs a demonstrable fresh-game journey, a useful player consequence, and bounded recovery. It is a recommendation for review, not six implementation commitments.

| Rank / candidate | Evidence and fresh-game reachability | Catalogue content to promote if chosen | Session State and persistence scope | Shared mechanisms, additions and research gates |
| --- | --- | --- | --- | --- |
| **1. Spaceport TOURCRAFT to TOLOSA, ending on foot** | **N + S.** Reproduced twice from New Game; fourteen mailbox/held-input writes including the taxi prefix; airborne on another Body by VBL 29000 and on foot by 35000. No extra Start or Leave after spacecraft B | METIS spaceport surrounds and slot 13's exterior/cabin/head 279; TOLOSA arrival street at group 23, cell `01-00`; recovered ground/structure/resident bindings encountered in flight. Flight sky/System motion, control playback and dialogue need their own recovery | Passenger descriptor, ordinary craft Occupancy, control cursor/latches, craft parameters/velocity/orientation/contact, Body/Location, clock rate/phase, scripts/messages, sound, cash and mutable Object Residence. Restore before B, during launch, space, Body entry and automatic exit | Reuses approach/selection and admission foundations, arithmetic and **craft** Mover candidates (#563); it is not the taxi's position-owning route loop. Adds original prerecorded control flight, Body switching, accelerated clock and automatic leave. Gate playback format, phase transitions and placement writers, complete used craft-parameter comparison, cadence/message outcomes, sound and restore futures |
| **2. Solicitor appointment → upstairs Transporter → VESTA** | **N taxi prefix; S + earlier P onward.** METIS solicitor is naturally reachable. An earlier synthetic Floor-9 capture arrived on VESTA. No natural lift/Transporter route completed | DOOBERRYS SOLICITORS `3:60`, selected slot 155 and its Floors/lift/doors; Transporter 67 on Floor 9; VESTA PARLIAMENT `5:64`, Transporter 68 and arrival Floor 10 (basement) | Appointment availability/payment, cash, lift target/motion, Floor/region/attachments, transporter selection, Body/pose and script/message state. Carry across teleport and restore either side of lift/transition | Existing taxi, on-foot clamp, Catalogue interiors/attachments. Damocles lift/Body-transfer code supplies comparison targets, not Dion rules. Adds usable Floors/lifts, appointment and Transporter transition. Gate a fresh route, whether Floor 1/payment is required versus optional, destination-selection rules and refusal/arrival ordering |
| **3. BUS PASS, board route 42, request next-stop exit** | **P + S + D.** Mechanism reproduced at DION NORTH AIRSTRIP after relocation; New Game route to DION or ERIS **unproved**. TOLOSA and VESTA have taxis, so reaching either alone does not close this gate | BUS PASS 103's panel; BUS model 319, per-group resident binding and route lettering; DION NORTH group 27's airstrip and the tested route prefix to COMPANY STORE `27:25`. An ERIS alternative needs its own route evidence | Carried Stack/active panel, boarding countdown, passenger/yaw, group-local service roster, progress/cursors/increments, shared height/dwell, route control, next-stop label cache and **pending Leave `$717C`**, retained after exit. Clock, dialogue/sound and cash; restore before and after marked stop | Strong reuse of the taxi's passenger pose, deferred admission, route arithmetic and height tables; **no craft Mover** on this route. Adds positive-rate circulation and marked-stop exit, no taxi destination selection or Start. Gate natural access or explicitly authored start, pass-absent behaviour, stop-window/cadence/refusal/audio probes, and full restore futures |
| **4. Bil invitation → reception/meeting → Transporter to BACCHUS** | **N** to TOLOSA; **S** for meeting and Transporter onward. Invitation is opening dialogue, not an acquired invitation item. Reception/meeting depend on script availability; election result disables them. No natural meeting/Transporter completion | Rank 1 plus HQ `23:12`, ground reception, Floor-10 meeting/basement, residents 96/97/99/187/218/224 and Transporter 64; BACCHUS Transporter 65 and its arrival surroundings | Rank 1 plus dialogue availability/flags, location triggers, Floor/lift state, mutable model binding for BIL'S CHAIR, time-triggered election interaction, destination transfer. Do not invent a Transporter-grant flag | Flight plus on-foot/lift/Catalogue mechanisms. Adds triggered dialogue and campaign/time interaction. Gate natural reception/meeting sequence before election, basement access, teleport arrival/refusal and persistence. Larger than ending the first flight on foot |
| **5. A self-piloted craft journey** | **S** admission and bounded arithmetic/parameter comparisons from R4/#563; no fresh natural self-piloted acquisition/flight demonstrated here. The staffed TOURCRAFT is a different control contract | Chosen craft and its actual paired key/hire/ownership context, origin/landing/space content and Body data; select a named Dion record before scoping | Ordinary craft Occupancy, key/hire/cash state, craft and Object Residence, contact/landing/Body state, clock and scripts. Save mid-flight and after leaving | Most direct craft Mover comparison with #563, but taxi admission cannot replace key/hire gates. #419 still owns convergence. Gate a natural acquisition/flight/landing recipe and the specific parameter/control/key/economic rules. Familiar geometry alone supplies no journey |
| **6. Election participation and mining veto** | **S + D.** Result/mining triggers and related state identified; no complete natural election/veto route. Catalogue placement is not campaign access | Registrar, Parliament, party HQs, constituency poll/candidate locations, mine sites and relevant people/documents/objects; not just one model set | Eligibility, candidacy, polls/seats, dialogue availability, money/accounts, elapsed day/rate, mining/capture/encounter state and mutable residences/models/overlays. Campaign persistence substantially exceeds the taxi | Reuses transport/content foundations but adds political/economic progression and time outcomes. Gate minimum natural registration/vote/result/veto path, failure alternatives, trigger ordering and scoped campaign restore. Least bounded second slice |

## Leaving METIS: observed TOURCRAFT journey

The METIS craft record is `$51ADE` in the nineteen-record table `$51A3E`: group 3, slot 13, control stream `$66D2A`, boarding script `$29`, head 279 and zero price descriptor. `$51B82..$51BEC` binds it. B's ordinary admission path `$55474..$5554E` admits service craft 12–15 after proximity/model and a nonzero cash-long test at `$72DE`; `$55528` writes passenger offset, `$5552C` control origin, `$55532` descriptor and `$55538` price. A zero price descriptor does **not** remove that test on the first four cash bytes. Fresh cash suffices. (S; [object services](dion-object-geometry.md#services-and-driver-heads).)

At the taxi exit, TOURCRAFT is present at `($09E17964,0,$042A78B2)` but not close enough for B. The first B-only probe stays on foot. A second probe that simply walks forward at taxi heading `$0300` moves away. Turning and approaching as in the recipe below admits it. These failed approaches concern proximity, not an invitation or BUS PASS requirement. (N.)

Script `$29` starts at `$70579`; its text at `$705CA` identifies TOLOSA/PC BIL HQ as the destination, and `$705F2` advertises 3 h 10 min. The original launch routine `$52742..$5281C` enables control playback `$70A2`, loads `$709E` into the stream cursor `$709A`, initializes pose/control state and restarts the play loop. The craft handler `$5900A` actually executes in the confirmation run. Its `$59014..$5903E` reads prerecorded controls when playback is active; ordinary foot and space handlers also contain playback branches. Thus this is an **automated passenger craft flight using Mover/control playback**, not another taxi route or proof of self-piloted flight. (S + N.)

| Absolute VBL / checkpoint | Confirmation state | Meaning |
| --- | --- | --- |
| 23450, approach finished | METIS, on foot, passenger 0; near `($09E17B80,$3F,$042A7AE0)` | Natural walk, before spacecraft B |
| B at 23500; captured by 23600 | Passenger `$34`, ordinary selector/slot `0/1`, playback `$70A2=1` | Resident 13 is the service; slot 1 is the craft Mover slot, not evidence that the player acquired resident 1 |
| 27000 | Body `$FFFFFFFF` (space/VOID), selector/slot `2/1`, passenger `$34` | Original space-flight phase |
| 29000 | TOLOSA Body `$64`, group 23, airborne, passenger `$34` | Another Body reached, not yet on-foot arrival |
| 33000 | Still aboard, eye Y `$79` | Approaching ground |
| 35000 | TOLOSA `01-00`; passenger 0, selector/slot `1/$FFFF`, playback 0; XYZ `($0AB293C2,$3F,$06238BEF)` | Automatic on-foot exit, without L or a second Start |

Both successful boots have exactly that final pose and cash BCD `005100900000` (51,009,000.00). Whole RAM and intermediate poses vary with frame/raster cost. At 23600 elapsed time is 377 seconds; at 35000 it is 14,896 seconds in both runs. In-flight clock advancement greatly exceeds the VBL interval. Do not turn the pilot's advertised 3 h 10 min into a recovered duration: accelerated rates/phases need targeted recovery. Arrival is bounded between samples 33000 and 35000, not asserted at exactly 35000. (N.)

There are **fourteen input writes**: nine taxi-prefix writes and five additional turn/walk/B writes. On-foot TOLOSA is reached within 35,000 VBL from reset, approximately 583 seconds at this roughly 60 Hz configuration; about 11,500 VBL after spacecraft B. This is a coarse reproduction budget, not emulator wall time under fast-forward. First INTERCITY boarding, a return flight, Bil's building and any bus-served Body remain unobserved natural continuations.

Static onwards leads are concrete: Transporter 64 at the HQ leads towards BACCHUS 65; ERIS's 66 is another placed Transporter; INTERCITY records connect ERIS island groups and DION groups. The [original printed transport leaflet](http://mercenarysite.free.fr/boxes/m3/mercenary3_pts02.gif) gives ERIS and DION bus/inter-island connections, and [its outer spread](http://mercenarysite.free.fr/boxes/m3/mercenary3_pts01.gif) gives interplanetary service pairs. These are S/D leads, not a completed chain from METIS or a periodic departure timetable.

## Buses: mechanism and bounded probe

The group table `$41800` initializes services from slot 16 at `$51BEE..$51CA2`. Negative rates select TAXI; positive rates select BUS, with a two-character route number instead of taxi head/metadata. The opening group 3 has only its taxi; the otherwise absent slots 17–27 are rebound on other groups. The [object recovery](dion-object-geometry.md#services-and-driver-heads) accounts for 17 taxi and 32 bus records, separately from nineteen INTERCITY/TOURCRAFT records. (S.)

The tested group-27 bus is resident 16, route **42**, rate 512, definition `$42B28`, beginning at `07-02`. The other DION group-2 records include two vehicles for route 11, route 30 and route 47; route numbers are service lettering, not globally persistent resident identities. ERIS group 18 binds buses including routes 12, 15 and 29. [BUS STATION `18:89`](../dion-structure-locations.md) is a content location, not a proven call terminal. (S.)

| Mechanism | BUS reader/writer | Difference from recovered METIS taxi |
| --- | --- | --- |
| Pass activation | BUS PASS `$67` at Carried Stack head; `$4D63C..$4D6EA` selects record `$4D7EA` = active descriptor `$67050800` | The printed leaflet instructs carrying/activating it. It supplies a passive next-stop panel, not TAXICARD Call/selection/Start |
| Call/Start | `$4D830..$4D888` special-cases TAXICARD `$68`; BUS PASS type 5 returns without a service action | No bus Call or Start in this dispatcher; buses circulate on their route |
| Boarding | B fallback `$5546C` arms ten passes; `$519A2..$51A4E` admits during counter 2–30, with render candidate/proximity/flag, index 16–27, on-foot and context checks | Shared deferred admission, but no carried/active-pass test in these readers. Negative-rate taxi branch has an extra slot restriction. Pass use and admission are separate claims |
| Pose and route | `$51930..$51999` copies resident pose and heading delta; `$51F40..$52030` advances route pairs; `$51F96` writes their upper-nibble control | Passenger path uses the foot selector; a bus is not a craft-Mover case |
| Next-stop display | `$4DC3E..$4DC9C` needs active `$67`, matching passenger, finished reveal and pending Leave 0; scans to a pair with its second byte negative, then label `$4DD24`, cached `$6EAC` and `$7104` | Next **marked stop**, not each cell boundary. No chosen destination list or taxi Start |
| L | Positive first-service rate at `$55742/$5577C` writes `$717C=1` | Request is queued; taxi requires dwell exactly 2 and drops early L |
| Stop/automatic exit | `$51DA8` retains counter 35 only with passenger, pending Leave and route-control bit 3 (`$6EAF`); `$51D1C/$51D30` advances descent; negative height terminator clears passenger `$51D72` | Exit completes through a height sequence. `$717C` remains 1 after exit; admission `$51A16` clears it |

The first two synthetic scene attempts did not board: the temporary pose object remained the nearest candidate, and the nominal cell centre was over 2,000 units from the stopped bus. Moving the synthetic initial eye near the bus and then walking a short distance supplied an actual eligible render candidate. The successful probe patches only the initial Location/pose through `scene.pose_pokes` (and, in the exploratory run only, clears the temporary object); it does not patch the bus cursor, rate, cash, admission, pending request or program. All play after that relocation is still classified **P**, not a natural fresh-game route.

The clean confirmation uses one B at 6750 and L at 11000. By 6800 passenger is `$40`; by 9000 the BUS PASS shows OLD JOAN'S COTTAGE as the next stop. At 11000 the bus is travelling towards COMPANY STORE; by 11100 pending Leave is 1 while passenger remains `$40`. By 12000 it has automatically put the player on foot at COMPANY STORE `05-02`, XYZ `($0CF97F80,$3F,$05648800)`. Pending Leave remains 1 and the panel returns to its generic BUS PASS label. Cash remains `005100900000`. (P.)

A matched probe omitting **both inventory selection and Enter** also boards by 6800 and leaves at the same endpoint after L. The BUS PASS remains carried, the head stays TAXICARD and active descriptor remains zero. The next-stop display is absent in this control. Individual VBL screenshots can show partial drawing phases; they do not establish an activation-dependent cabin rule. This corroborates **activation is not an admission gate in this supplied scene**; it does not test dropping the pass or every bus/platform. The opening message's TAXICARD instruction still appears aboard the bus, illustrating that relocating the player does not reset or suppress narrative. (P + S.)

## Bil and the Transporter

### Invitation, reception and meeting

Opening script `$19`, entry `$6FF57`, contains the invitation opcode at `$70062` and packed text at `$70063`. It follows the opening account of the BUS PASS/TAXICARD and precedes the personal-craft instruction. In the previously observed R2 solicitor trajectory, the invitation commits at VBL 7462 and the personal-craft message at 7671. These are observed timings of that trace, not a grant flag or a universal appointment time. The existing opening script is already playable content. [R2 opening trace](mercenary-iii-taxi-content-presentation.md#messages-and-scripts), [bounded script payload](../../payload/dion/scripts.json).

The original TOLOSA location-trigger table at `$22F0C` contains:

| Entry | Cell | Region | Floor | Script |
|---|---|---|---|---|
| `$22F0C` | `$12` (`2,1`) | `0`: any indoor region | `0` / G | `$05`, reception, entry `$70B9D` |
| `$22F10` | `$12` (`2,1`) | `4` | `10` / B | `$06`, Bil meeting, entry `$70C4D` |

The table consumer `$5B6BE..$5B714` matches cell, region and Floor, retains the last candidate at `$7282`, and calls the original launcher `$55A1A`. Region zero is conditional on the selected region being indoor. The table is not a command to run the meeting on every Floor change. Exact region-entry and lift-arrival ordering must be observed before implementation. These are original MIII table records, independently read from the group-23 original-builder capture; they are not a Damocles Location Trigger compatibility claim.

Both scripts are initially available with byte `$A0` at `$7352+script`. The launcher requires bit 7, consumes it for these one-shot entries, and can queue an entry with bit 5 when another script runs. Script `$77` at `$759D2/$759D5` sets their availability bytes to zero. Other completion paths also disable them at `$75F0A..$75F35`. Thus **meeting availability depends on campaign history**, even though the meeting text itself has no conditional campaign branch and no access-grant opcode. Original entry/availability readers: `$55A1A..$55A7C`; [existing independent decoder](../../research/mercenary-iii-st/m3lab/scripts.py).

The [initial object census](../dion-object-locations.md) places reception resident 96 and Bil's profile 187 at G, and Transporter 64, chair slot 97, note 99, seated Bil 218 and table 224 at B in P C BIL HQ BUILDING, TOLOSA ENTERPRISE BASE, group 23, cell `2,1` (Body Coordinate `2739,1572`). Their shared host is `placement-23-12`; the basement Geometry Identity is `structure-0106b0`. The chair and Bil have later model forms recorded in the [object recovery](dion-object-geometry.md#run-time-model-table-writers). Promotion would need those distinct residents and forms, not merely the seated model.

### Transporter eligibility is separate

All ten Transporter residents, slots 64–73, exist in the initial census. Slot 64 is at Bil's basement; slot 65 is BACCHUS WAYSTATION; slot 67 is METIS solicitor Floor 9; slot 68 is VESTA PARLIAMENT basement. Their geometry is `model-0316f8`, with per-slot digit token `$87`. [Object census](../dion-object-locations.md), [geometry and lettering](dion-object-geometry.md#lettering).

The inspected original mechanism has three distinct stages:

1. The model's inside-view selection reaches `$549B2`, publishing the current resident offset from `$71D8` to `$6F32`. It is an authored geometric condition, not a general boarding action.
2. `$5A01A` reads that selected resident and `$6F34` interlock. It chooses direction using heading and stepping context, then searches the ten-slot ring in offsets of four, wrapping `$100..$124` (slots 64–73). `$5A078` handles numeric destination selection while inside a Transporter.
3. `$5A0BA..$5A15A` validates residence, takes destination XYZ plus a 63-unit eye height, loads the destination Body/location and establishes arrival. The ring scan rejects a zero/VOID Body; direct numeric selection has a separate nonzero-Body gate. When `$7122 != 1`, the scan also skips a destination whose association byte is nonzero. It can report unavailable or intermediate destinations through IDs `$11/$12/$14`.

There is **no script-flag or meeting-completion test in these inspected selection/destination paths**. The initial residence data is already populated. The reception/meeting scripts contain waits, text and common message epilogues; they do not set a Transporter permission bit. This supports separating dialogue availability from Transporter eligibility. It does not prove every entrance is reachable, every direction leads to a chosen destination, or that no external writer ever changes residence. [Refusal messages](../../payload/dion/messages.json), reader pins below, [prior synthetic METIS-to-VESTA result](dion-interior-reader-notes.md#representative-original-scenes).

At DOOBERRYS SOLICITORS, original location entry `$2153F` is cell `$60` (`0,6`), any indoor region, Floor 1, script `$1E` (entry `$763D9`). The script tests cash against two million at `$7645D`, subtracts that sum at `$76467` on the sufficient-cash branch, and follows with its Transporter invitation. The insufficient-cash branch enters shared account-clearing dialogue at `$75679`. The invitation therefore has a financial consequence; it still does not contain a decoded Transporter grant. Slot 155's lift geometry has Floors G–9, 150-unit pitch; slot 67 is on Floor 9 at Body Coordinate `2527,1072`. [Catalogue structure and resident records](../../payload/dion/catalogue/catalogue.json), [Floor-reader evidence](dion-interior-reader-notes.md#floor-binding-and-presentation).

## Coarse campaign state

These are candidate persistence **dependencies**, not a restore-complete specification. Original-static findings extend the already tested taxi-state inventory; the latter's invariant cash and Carried Stack cease to be invariant once these branches are included. [Taxi persistence inventory](mercenary-iii-taxi-persistence.md#decoded-future-affecting-bytes-r3b).

| Area | Concrete original state/readers | Candidate implications and limit |
|---|---|---|
| Dialogue execution | PC `$6EDA`; return stack/pointer `$56D6/$56D8`; flags `$7270..$7277`; availability `$7352+n`; pending script `$711C`; location candidate `$7282`; timed countdown/target `$727E/$7280`; message wait/busy `$7236/$723A` | Bil and solicitor need repeat/queue rules, key waits, message continuation, restore during dialogue and location-trigger ordering. The existing taxi supports a bounded repertoire, not every script by association. |
| Election participation and result | BCD percentages `$6EAA/$6EAB`, with message ID 7's poll tokens; adjustment handler `$52DE8`; registration script `$0F` entry `$75082`; result script `$77` entry `$759D2`; polling script `$85` entry `$7520F` | Script flag 9 marks result state; flag `$0A` is used in candidate/result branches; flag `$12` is presidential authority on the inspected registration/result/bill paths; `$16/$17` distinguish Bil-barred/Bil-winning branches there. Meanings are bounded to those readers, not a complete flag dictionary. |
| Election choices and spending | Registration asks for CANDIDATE'S LOG; slot 89 and NOTICE BOARD 100 share registrar Floor 1 on VESTA; six advertising scripts use set-flag operations 0–5 and BCD cash changes; set-flag handler `$52CCA` starts script `$10` once all six are set | More advertising is not automatically better: `$10` is an adverse poll narrative. Vote choices, multiple-vote handling, ad purchases and scheduled result timing need natural and branch probes before a winning slice. |
| Economy | Cash `$72DE..$72E3` equals six-byte account `$6B1E+8*$F8`; original opcodes set/add/compare 48-bit BCD accounts at `$52C3A/$52C80/$52C5A`, with account addition `$52D98`; bank/tax scripts `$96/$97/$98/$9F` use flags `$1E/$1F/$07/$0E/$20` | Loans, repayments, changed lending terms, tax debt and solicitor payment affect later choices. The fresh natural cash is `005100900000` (51,009,000.00), not the initial integration report's misread balance. [Balance correction](mercenary-iii-taxi-persistence.md#opening-balance). |
| Parliamentary mining veto | BIL'S BILL slot 123 is in VESTA PARLIAMENT Floor 3; scripts `$6F/$70` entries `$75D25/$75DF3` test carried slot `$7B`, presidential flag `$12`, and flags `$16/$27`; rejection sets `$27` and `$16` | Holding the bill is insufficient without authority. Both adoption/rejection and their delayed consequence need recovery. The original trigger records select region 10/8 on Floor 2, independently of the bill's initial Floor 3 residence; moving the document is an explicit dependency. |
| Mining and alternative outcomes | Time-triggered narrative `$13` entry `$75A75` refuses its action on flag `$16`; explosive handlers and six mining-machine placements are separate evidence; destruction narrative `$7A` at `$76094`; prospecting narrative `$18` at `$76243`; fleet narrative `$81` at `$761EC` | Election/veto is one route among several. Newspaper text does not prove an operational mining simulation. Destruction counts, explosive timing, mineral trades and fleets would each widen the slice substantially. [Explosive model writers](dion-object-geometry.md#run-time-model-table-writers), [placements](../dion-object-locations.md). |
| Confinement and actor state | INSTANT PRISON slot 213; purchase script `$71` entry `$74506`; tax-deputising branch sets flag `$18`; prosecution script `$78` at `$75FA1` tests residence long `$6B84 == $44010032` | `$6B84` is **Bil resident 218's residence**, and `$44` names LOGOS. The condition is not an invented global capture flag. Actor residence, carrying/dropping, prison placement and authority interact. No natural player-capture/release or death rule was recovered here. |
| Bil animation/forms | Chair state `$6E84`; resident-state bytes `$65A2/$679E`; model-table mutations `$52F6A..$52FDE` for chair 97 and actor 218 | A confinement/capture slice needs changing actor forms and residence, not frozen Catalogue previews. The meeting-only script itself does not execute these model-swap opcodes. |
| Encounters | Original dynamic actors/effects update through `$523E0..$527C2`; `$6FF48` request, paired records at `$6E50..$6E82`, cursor `$6E88`, delay `$6E86`, engine response `$70F8`; shooting reader `$511D8` can start election penalty script `$12` | Encounter/shooting state has campaign consequences. These addresses identify the next readers to inspect; they do not admit complete meanings for every pair or a Damocles encounter/death implementation. |
| Time | Seconds/day `$6FCE/$6FD2`; rates/fraction `$6F26/$6F28/$6F2A`; waits and timed dispatch above; original clock/time writers `$530FC..$531D2`, trigger reader `$5A3D0..$5A41A` | Time is future-affecting campaign state. The inspected trigger tries election result `$77` at elapsed **32,400 seconds (9 hours)** while flag 9 is clear; after flag 9 is set, it tries mining narrative `$13` at **61,200 seconds (17 hours)**. Launcher availability and active-dialogue gates still control actual execution. These are static thresholds, not observed universal event VBLs. |

**Flag correction:** `$5A3D0` tests bit 1 of byte `$7272`. In the big-endian flag long at `$7270`, that is **script flag 9**, not script flag 1. The [R3/R3b note](mercenary-iii-taxi-persistence.md) previously called it flag 1 in its main-loop description; the byte/bit address there had been interpreted as a whole-register bit number. The note now links this correction. Script `$77` explicitly sets flag 9, agreeing with this reader. The old taxi conclusions do not depend on a campaign flag dictionary.

## D2 questions and probes to commission or waive

| Decision question | Probe or evidence needed | Possible bounded waiver |
| --- | --- | --- |
| Must the second journey continue from New Game or an existing taxi Save, or may it have an authored starting Location? | Commission a natural route to the chosen service, including controls and time budget. For buses, first try the solicitor Transporter or HQ/BACCHUS/ERIS connection, rather than inventing a direct METIS bus | D2 may explicitly accept an authored bus departure, tagged as such. It cannot call that original fresh-game reachability |
| Is staffed flight to another Body a sufficient second milestone, ending at TOLOSA `01-00`? | Recover only the observed `$29`/`$66D2A` playback path, its Mover parameters, clock-rate writers, Body changes and automatic exit; compare original 50 Hz and accepted eleven-tick cadence | Waive return flight, self-piloting, all other craft services, Bil meeting and campaign completion. Do not waive the phases necessary to reproduce the chosen journey |
| Should the shorter solicitor/Transporter candidate be investigated before choosing flight? | Commission one natural taxi → exterior doorway → lift → Floor 9 → Transporter → VESTA route. Separately try Floor-1 clerk/payment and skipping it; record key/direction and interlock | Waive broader Transporter-ring coverage after choosing one destination, but retain refusal/arrival and persistence evidence for that transition |
| Does a bus slice start at DION NORTH AIRSTRIP, or use ERIS's better-connected capital routes? | Route 42 already has a bounded P mechanism. For either Location commission no-L, early-L, pass-absent, reboarding after pending Leave survives, visible route/label, height and audio checks at chosen cadence | No complete bus-network decode is required. Waive unvisited services and stops; an ERIS route still requires independent data and behaviour, not route-42 extrapolation |
| If Bil is included, does the contract end at meeting, Transporter entry, or BACCHUS arrival? | Commission natural reception/lift/basement/region-4 triggers and late-election variant; check original model forms and whether walking directly to the Transporter bypasses dialogue | Waive later political, tax, prison and mining branches only if campaign/time state cannot incorrectly trigger them inside the bounded slice |
| Which shared mechanisms are actually needed? | Compare used craft handlers/parameters and playback changes with #563; compare passenger admission separately from craft and Transporter geometric activation under #419 | D2 can postpone boarding convergence and all unrelated craft comparisons. Catalogue reuse still needs a title-local promotion document |
| What is saved at the new journey's boundaries? | Commission restore futures before admission, mid-travel/flight/lift, after Body change, with queued Leave/dialogue and immediately after automatic exit. Include clock rates, not just elapsed seconds | Original on-disk save-format decode may remain deferred; a restore-complete browser Save Snapshot for the admitted behaviour may not |
| Is an election/veto journey desirable enough to justify campaign work now? | Commission finite registration/candidacy/voting/result/bill-transfer/veto recipes, plus time-trigger and refusal branches. The original bill and veto trigger are on different Floors | Full economy, alternate mine destruction, fleet and prosecution can be deferred only after their interactions with the selected path are bounded |

**Recommended D2 commission:** a short solicitor/lift/Transporter reachability probe and scoped flight playback/time recovery. If the shortcut closes, compare its smaller movement scope against flight's already demonstrated second service. Bus fresh-game access remains a visible gate, not an implementation prerequisite smuggled into an assumed route.

## Reproduction recipes

Run from the repository root with Python 3 and `PYTHONPATH=research/mercenary-iii-st`. Supply `M3_ROM_ROOT` only if the harness cannot find the pinned media at its documented local lead. `boot.run` pins the disk/TOS/emulator and writes debugger scripts, input plans, commands, logs, RAM and PNGs into the specified ignored root. Keep `pal=False`, sound off and the remaining baseline flags unchanged. Captures precede same-VBL inputs.

### Natural METIS spaceport → TOLOSA

```python
from pathlib import Path
from m3lab.boot import Plan, run, TAXI_SPACEPORT

inputs = TAXI_SPACEPORT + [
    (22650, ('stick', 4)),   # left turn; release at 23075
    (23075, ('stick', 0)),
    (23100, ('stick', 1)),   # approach TOURCRAFT; release at 23450
    (23450, ('stick', 0)),
    (23500, ('key', 0x30)),  # B; wait for automatic flight and exit
]
print(run(Plan('r5-tourcraft', inputs=inputs,
    captures=[22600, 23075, 23450, 23600, 27000, 29000,
              30000, 31000, 32000, 33000, 35000], pal=False),
    root=Path('restricted/mercenary-iii-703/runs').resolve()))
```

The complete inherited prefix is Enter `$72` at 6000, `*` `$66` at 7300, forward `$7056=1` at 10000 and zero at 10650, B `$30` at 10700, `+` `$4E` at 11600 and 11900, `*` `$66` at 12200, L `$26` at 22000. Together those nine writes and the five above are the fourteen inputs. Check admission and arrival RAM fields against the journey table, alongside cabin/flight/TOLOSA screenshots. Do not count a Body name while airborne as completed arrival.

For the traced confirmation, additionally set `pc_captures=[(23400,0x55522,'admit'), (23400,0x52742,'launch'), (23500,0x5900a,'craft-mover')]`. These only capture at original instructions; they do not redirect execution. Small intermediate timing changes are expected; both runs reached the same endpoint/cash.

### Natural solicitor taxi prefix; exterior approach only

Use `Plan(inputs=TAXI_SOLICITOR, captures=[22500], loop_top=True, pal=False)` and the inherited eight-write schedule in `boot.py` (one `+`, unlike the spaceport's two). The new original run `progression/runs/solicitor-natural60-z4x9t4fh` reaches METIS `00-06`, on foot at XYZ `[165642368,63,70287360]`, heading 0. It confirms the existing R1 recipe independently.

In the recorded original-machine continuation from that naturally reached state, backward `$7056=2` at 22600, zero at 22920, then capture at 23000 reaches local `[-22,63,1128]` in exterior region 3. To reproduce that continuation preserve the complete Hatari machine snapshot, as in the [R3 restore procedure](mercenary-iii-taxi-persistence.md#restore-mechanics), including input VBLs; transplanting just RAM is not equivalent. The ground lift's X interval is `[-320,0]`, Z `[1160,1380]`, with doorway X `[-221,-99]`. Straight walking at X −22 therefore does not establish entry. Later steering reached no lift/Transporter completion by 30000. No unreachable claim follows from that failure, and no full natural Transporter recipe is claimed.

A `pal=True` control with the old R1 timestamps stayed at the prison at 22500, without taxi admission. Do not reuse this unchanged input schedule as a 50 Hz assertion.

### Synthetic route-42 bus mechanism

```python
from pathlib import Path
from m3lab.boot import Plan, run
from m3lab.scene import LOOP_CALL, pose_pokes

inputs = [
    (6000, ('key', 0x4b)),  # cursor left selects BUS PASS in fresh stack
    (6300, ('key', 0x72)),  # Enter activates it
    (6600, ('stick', 1)), (6700, ('stick', 0)),
    (6750, ('key', 0x30)),  # B, no Call or Start
    (11000, ('key', 0x26)), # L while travelling; wait for marked stop
]
print(run(Plan('r5-bus42-synthetic', inputs=inputs,
    captures=[6400, 6800, 9000, 11000, 11100, 12000, 13000, 16000],
    pc_commands=[(6500, LOOP_CALL,
        pose_pokes(16, 0x0cfb8080, 0x056479fc, 0))], pal=False),
    root=Path('restricted/mercenary-iii-703/runs').resolve()))
```

`pose_pokes` rewrites temporary NULL resident 9 to the supplied DION pose and invokes original `$5A006` at its existing call boundary. The original performs Body/group setup, rebuilding services. It is explicitly a synthetic relocation. There are no bus-state or campaign writes. Check active descriptor `$67050800`, passenger `$40` by 6800, pending Leave at 11100 while still aboard, on-foot endpoint by 12000 and retained `$717C=1`. Remove the first two inputs for the activation-disabled control; this retains the BUS PASS in the Carried Stack.

The earlier #683 synthetic METIS Floor-9 Transporter outcome is [documented in the representative-scene notes](dion-interior-reader-notes.md#representative-original-scenes). That unexpected transition was excluded from the matched comparison set. It is cited as earlier P evidence; this survey neither reran it nor verified that the current scene command regenerates the excluded case.

### Static progression and reader reproduction

Obtain fresh/group captures with [`m3lab.census_capture`](../../research/mercenary-iii-st/m3lab/census_capture.py), following the [full-census recipe](dion-full-location-recovery.md#reproduction). The surveyed static source is main-checkout `restricted/mercenary-iii-647/runs/full-location-census-bzjd9ifm/start.ram`, SHA-256 `0002e913c0e393cea1f04d02bbfde6ac6092b4626d5bef0774b7a79cfb0c3b90`. New reader/script inventories remain under `restricted/mercenary-iii-703/progression/`.

Read script n's entry word from `$6FDC4+2*n` relative to `$6FD44`, and availability at `$7352+n`. Decode using the MIII `scripts.decode_instruction` and `text.static_strings`, following conditional fall-through/targets and calls/returns; stop on end/halt/unknown. For groups 3, 5 and 23 read `$70FC` from original-builder RAM, then its four-byte records to the zero-cell sentinel, interpreting against `$5B6BE..$5B714`. Inspect Transporter and time readers separately. Capstone 5.0.7 in M68K/68000/big-endian mode supplied targeted disassembly; restart at routine entries rather than interpreting intervening data as code.

## Provenance and validation

Original scans were downloaded over HTTP, visually read and matched to the integration report's pins. The outer and inner transport sheets match SHA-256 `6ec414ef933f99725d8dcb54ba53fb31ba8568fcce32a58d5d419b27e126817d` and `b0ca1bd9bee82664329550d4b12c2fb76c5a586246dae2f78edd02e10c004132`; the [keyboard sheet](http://mercenarysite.free.fr/boxes/m3/mercenary3_manual09.gif) matches `6e410fad16e39a0149a7b1863d598ce87bbccc2afaab1388c349c4a333a85a9b`. Ignore handwritten additions as non-original evidence.

These hashes identify particular artifacts, not universal replay whole-RAM hashes:

| Ignored artifact relative to `restricted/mercenary-iii-703/` | SHA-256 |
| --- | --- |
| `runs/spaceport-near-board-l21spw6h/v35000.ram` | `95e00d9dd95c0dc38d723893172902281bb8b15000388aa2190fa5a5bed4364b` |
| `runs/spaceport-confirm-yfx1oqao/craft-mover.ram` | `8667b776b66cded660ce5ed515e95b5e1bbcfbed4046268e1fc0e8347f739314` |
| `runs/spaceport-confirm-yfx1oqao/v35000.ram` | `cc37aef242da611f949eb19cbab5c8433d6c5e7f724b29fd7c3878c6e9b4f809` |
| `runs/bus42-confirm-synthetic-oo2nbsk9/v11100.ram` | `e3f0c5757495b49cb700ffecdd08e759da5f107409288a85bf3e97beb43d89f2` |
| `runs/bus42-confirm-synthetic-oo2nbsk9/v12000.ram` | `281d70d590ab53bf31ae5d1e690f9b783b05e19ac498d225930a222c5e1e9d11` |
| `runs/bus42-inactive-synthetic-tfvld35u/v13000.ram` | `0db0f9aa744fb17833bf759fd8b1ace659cfc8886cf076f60f5fc46f4bebec1e` |

The following original half-open ranges pin the new reader facts; RAM whole-image variation does not alter these assertions. The service/control table and original record counts also reconcile with `m3lab.catalogue_objects.services` and the existing Catalogue location documents.

| Half-open range | Role | SHA-256 |
|---|---|---|
| `$70B9D..$70DA0` | Reception/meeting scripts | `d6c6359d0b6e39e75196df799892cd54865667b13aecedfd65b5b368ec80f3ba` |
| `$763D9..$76495` | Solicitor script | `c3f201e3bcedfee0190081ccd4bc7a96cebe4cc9cdf13db1e9b29c544c79114e` |
| `$5A01A..$5A15E` | Transporter selection/destination | `865124ec16c0c5d91e3eaca2f5f9faa93e04ab650aeb49a7588b7a242fa6b3ae` |
| `$5B6BE..$5B714` | Original location-script trigger reader | `b7e5864b60b1b6090a69e79bf682068433fc3c608a84b17f59d7aa041575a748` |
| `$759D2..$75A75` | Election entry and immediate branches | `8e3e595186119d8465e610c25c6ca5534dcb77c4f05d7409bb830e627471175e` |
| `$75A75..$75BA6` | Mining-start narrative | `fb0957adefcf36c00f36899f6b85b8bcddd72b8cbc41b6ccc3d002b7e7c0bc80` |
| `$75D25..$75E45` | Bill adoption/rejection | `1997a4fe1d3b7a3b056bf7fcf7512a3ec93dfe9f6befb14a9be7bd4ef410303b` |
| `$52C3A..$52CB0` | BCD-account setters/comparison/addition | `c93bb068c922c3b503d2a94a495a812e343b5ce7a35767b26d8c63508abac007` |
| `$5A3D0..$5A41A` | Campaign time/timed-script gates | `1dc78a8beaddb5fd75590489db14e619cece3db6e45b27df84af3348a3927db2` |
| `$4D63C..$4D6EA` | Head-item activation | `ffd9c9d2603fca36771ff5545732fab032ec2f667b1660c235f57d8217212462` |
| `$4D6EA..$4D80C` | Activation table | `1f8ac5e0c7185a8c62999e5bf5c07d7bbcc021e5486deb82c30e7cf961ea1099` |
| `$4D830..$4D888` | Active-input dispatcher | `89352d4476de302fe6d042dd0c57ceae7418cbe7848f22b3902662fe367ba628` |
| `$4DC3E..$4DC9C` | BUS PASS next-stop reader | `2fa348dd9b728bccda45442f4564c5a81410bfc1b6debdf43f8f83b030911c16` |
| `$519A2..$51A4E` | Passenger admission | `3c6e05c813ae821ef99e6a6af75ab1d21ad6361d4687dc63352290eafd30ce63` |
| `$51CDE..$51E24` | Bus height/stop/movement | `eb6094f9b239ccf365949fb911602815b0351ecaac49afe695907fce8b1a3710` |
| `$5573C..$55788` | Taxi exit/bus Leave dispatch | `618507ec1c2de239001c751354e8d1a95b9b4fdf3a182df3f76f73b4ac09952d` |
| `$55F12..$55F4A` | Passenger route-control cache | `0e55dfe999c0a184f8486d63459c791a952b8f04a94ae0912f3e7cdfa0d579da` |
| `$59E90..$59EF0` | Service/current-cell classifier | `a643c0e12e5e098686ad782e3584e24de908c610af6139b6bcf7d14e860379c3` |
| `$51A3E..$51B80` | Nineteen craft-service records | `f69aa9478b795e0ed0ba26a4767cb6dcca6a074638fcd81b56ca16446b0ab922` |
| `$66D2A..$66E4E` | METIS TOURCRAFT control stream before next service | `aba500dfa1b666e57421b4714ccd897bc780a1604c9bf33e22038c9de1f48a89` |
| `$52742..$5281C` | Automated flight initialization | `ac48f875bd019f93c31faec901e6fd57ee5865666c8883bee2a2d97a0724e210` |
| `$5900A..$59042` | Craft control playback entry | `4907605fd3e56f0120770a57d062638b0b184150c77a5fe87826cd5b3fc4389b` |

Natural/control capture identities (paths relative to `restricted/mercenary-iii-703/progression/`):

| Artifact | SHA-256 |
|---|---|
| `runs/solicitor-natural60-z4x9t4fh/v22500.ram` | `5ffc572d6cf6c69ef6a28721976b05486f52010d0af9c4f9e6aed19117800ed7` |
| `runs/backward-4go1gyny/final.ram` | `2d78234a02c2a9d862f7dab7c36e7d16c0d7584b9d03f567e3b61b10d676f155` |
| `runs/solicitor-lift-l9scq28w/final.ram` (unsuccessful continuation) | `44c7b7bc2786497848ca54c397b227cf7eaf985381f684dec9174e302ad13a6d` |
| `runs/solicitor-natural-kjw93mko/v22500.ram` (PAL negative control) | `f85dae2663434e6ad3b9078a25a43bd786ae2c94032a59025a8b8dc37f415bde` |

Validation: both fresh-game flight runs reached the same on-foot TOLOSA endpoint and cash. The clean bus probe and activation-disabled control agreed on boarding, pending Leave and the COMPANY STORE endpoint; they differed in the active panel. The natural solicitor taxi and failed lift/PAL controls remain explicitly bounded. Stable reader/data and recorded artifact hashes, local document links and diff whitespace were checked. Only research documentation changed; application tests were not rerun. No runtime, payload promotion, full VM, original on-disk save decode or boarding convergence is claimed.
