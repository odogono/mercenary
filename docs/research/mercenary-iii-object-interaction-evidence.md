# Mercenary III: object interaction evidence

> **Status (2026-10-04):** Bounded research for [#756](https://github.com/odogono/mercenary/issues/756), with the companion [programme plan](mercenary-iii-object-interaction-plan.md). Direct Dion source reads recover selection, Take/Drop, capacity, Carried Stack and pickup-launcher facts. Retained original flight RAM establishes a held-bit exception; new cold-boot input probes establish the observed cases below. Range/capacity/support boundaries, pickup-script futures, accepted eleven-tick timing and browser/Save equivalence remain gates. No application or playable admission changes are made.

These facts belong to the [Mercenary III research baseline](../../research/mercenary-iii-st/config/baseline.json), **not** Damocles Working-Authority Evidence or Authoritative Evidence. Under [ADR 0002](../adr/0002-separate-rom-research-from-implementation.md), raw RAM, screenshots, debugger scripts and disassembly stay in the main checkout's ignored `restricted/mercenary-iii-object-interactions/`. This note states understood rules and their limits; it supplies no translated original code.

## Sources and claim boundary

The primary static source is `restricted/mercenary-iii-708/presentation/exact2/start.ram`, SHA-256 `71b957b3b7124959b01bd40b896c921d37902c18cfca042bef1906b155ef0170`, the coherent first-top seed used by [R8's field contract](mercenary-iii-tourcraft-snapshot-fields.md). The read-only `restricted/mercenary-iii-object-interactions/observe.py` records source-range hashes, decoded state/class membership, special-item identities and the pickup table in `observations.json`. It also reads the retained flight captures `f138.ram` and `f928.ram`; that inspection is **not a new flight run**. Disassembly used Capstone5.0.7's M68K/68000 big-endian decoder through `uv run --with capstone` and the existing ignored `mercenary-iii-681/m68.py` helper.

The new `input_witness.py` and `outdoors_witness.py` use the lab's [cold-boot harness](../../research/mercenary-iii-st/m3lab/boot.py), pinned original media and emulator, PAL/50 Hz physical raster, and debugger-fed ordinary key/joystick mailboxes. The harness writes the key latch `$56726` and joystick copy `$7056`; it does not exercise physical keyboard/IKBD delivery. They set no object, selection, capacity, script or player-pose state. Captures are first main-loop tops after the stated VBL. These are ordinary original-program input witnesses with naturally variable frame cost, **not** controls for the accepted fixed-eleven cadence. Screenshot capture is retained, but this note's asserted outcomes come from RAM, not pixel/audio comparisons.

The [TOURCRAFT milestone entry point](mercenary-iii-tourcraft-milestone-review.md) and [promotion boundary](mercenary-iii-tourcraft-promotion.md#drawing-and-admitted-state-are-separate) still matter: existing drawable content does not admit Pick Up. Current runtime status comes from the [merged I4 report](mercenary-iii-tourcraft-implementation.md), which supersedes older implementation-open status blocks. This evidence supports planning a separate scope addition.

## Selection and reach: direct Dion evidence

The surface candidate builder `$53C2A..$53C5E` scans slots 255 down to 0 for the current Body with zero association. The interior reader `$53C5E..$53CC4` matches cell, group, Floor and the structure association hooks. These are the [Object Residence readers](dion-full-location-recovery.md#resident-identities-floors-and-completeness), rather than a search across every Catalogue placement. Candidate-list membership and render eligibility must precede selection.

The queue builder `$54182..$5430E` constructs its three-axis distance using Dion's resident arrays, eye/view-relative owners and native float/log helpers. The [existing shared-mechanism audit](mercenary-iii-shared-mechanisms.md) independently compared this builder with Damocles modulo relocation. Direct selection writer `$545D6..$545F0` masks the draw-priority bits, accepts a candidate on `<=` the retained key, excludes offset `$128` (**slot 74**), then writes distance `$71DA` and selected slot-times-four `$71DE`. The scene reset at `$5417C` initializes only the distance high word to `$7FFF`; no-candidate state therefore must not trust a stale selected-slot word.

Player Take enters `$55364`: distance exponent must be `<=8`, a nonzero selected offset must exist, slot 0 is refused, current Body `$713C` must differ from `$78` (VOID), and inventory-label scroll `$4E394` must be zero. The native representation interprets exponent `<=8` as distance below 512 source units, or `1/128` surface-grid unit; this is a **static derivation**, consistent with the recovered builder and [Damocles arithmetic study](damocles-object-selection.md), not a Dion boundary sweep. Aboard success, exact threshold rounding, ties and hidden/occluded candidates still need original execution controls.

Original scancode dispatch `$568CE..$5691A` sends Up Arrow `$48` to Take, Down Arrow `$50` to Drop, Left Arrow `$4B` to forward stack rotation and Right Arrow `$4D` to reverse rotation. Browser `T` is the shared Binding/Control Profile Accommodation; the original scancode is not evidence that browser pointer position should choose a different semantic candidate.

Sources: ignored `selection-staging.txt`, `selection-writer.txt`, `take-drop.txt` and `observations.json`, with the address ranges above. No Damocles pointer-projection rule is established by these source reads.

## Carried Stack and the script-only key exception

Stack count is `$563C`; ordered byte identities start at `$563E`. Take calls `$4E2A6` after incrementing the count, inserting the acquired object at the head. Drop removes the head through `$4E1FC`. Forward rotation `$4E230` moves head to tail; reverse `$4E2B8` moves tail to head. Both refuse while `$4E394` is nonzero and do nothing for an empty stack. Label selection starts a signed 16-step scroll and calls the source's sound/description helper. These instruction reads do not yet establish every intermediate panel frame or ordered sound write.

Staging `$53CC4..$53D32` visits **stack entries**, not every held bit. It assigns X `$81D5`, Z `$1831C`, successive Y increments `$12C`, residence starting `$78010010`, and group49. After ten entries it resets Y and moves to Z `$2831C`, with the alternate staging Floor bytes. These are absent-world storage coordinates, not navigable placements. Rotation changes their ordering. No behavior above ordinary capacity is claimed from this loop alone.

The fresh census's statement that stack membership exactly matches held bits is valid for its fresh capture, but **not a universal invariant**:

| Retained original capture | Stack           | Held slots         | DOOR KEY A38 |
| ------------------------- | --------------- | ------------------ | ------------ |
| Coherent `start`          | `[104,103,135]` | `[103,104,135]`    | `$05`        |
| Flight `f138`             | `[104,103,135]` | `[38,103,104,135]` | `$85`        |
| First foot `f928`         | `[104,103,135]` | `[38,103,104,135]` | `$85`        |

In all three, slot38 retains residence bytes `[32,1,0,49]`, group7 and its original coordinates. The [prison-door report](mercenary-iii-prison-door.md#binding-and-the-key) establishes the cause: opening opcode `$20 $26 $87` at `$6FF5E` sets bit7 directly. It neither acquires through Take nor inserts a stack entry. The prison door reads that held bit. Thus the key already opens the prison while never becoming the head the player can Drop through opening play.

[R8's `world.residents/carried/objectBits` row](mercenary-iii-tourcraft-snapshot-fields.md#capture-fields-writer-domains-and-cross-field-rules) says "Carried IDs unique, state bit 7 and absent Residence agree." If interpreted as universal membership or universal absent Residence for every held bit, the retained captures disprove it. The #756 contract must qualify ordinary acquired/staged items separately from script-only object bits. Do not repair the evidence by inserting key38, clearing its bit or moving its Residence. The raw held predicate and ordered Carried Stack are distinct owners. No change to the existing R8 document is made here.

Sources: ignored `stack.txt`, `selection-staging.txt`, `observations.json`; retained flight RAM hashes are `318a7afd0d5f83b38d687d30b53632ab09f43fae5a267dc6ac1b6accbb5fc962` (`f138`) and `20f8931ddeb7ed895204f0105ffaa5e845208a013caef9cc7a80a5075e61e1e3` (`f928`).

## Capacity, refusal and title-specific objects

Direct Take refusal order after the reach/Body/scroll gates is:

1. Held bit on slot0 bypasses both handling refusals.
2. Handling bit4 refuses silently.
3. Held bits on **POWERGLOVE157**, **ANTIGRAV158**, or the long-form absolute operand at `$553A4` bypass the following bit5 refusal only. The inspected images name state address `$641E` (slot0) in that operand; its possible restore-time patch identity is unresolved here.
4. Handling bit5 otherwise requests system string index2.
5. Count equal to capacity `$7098` refuses silently. The instruction compares equality; accepting an injected count above capacity is a static consequence, not a naturally reached state.
6. The current offered slot `$6FEC` additionally requires association9 and successful price subtraction; failure requests index12. Its reachable trade context remains outside this bounded investigation.

BRIEFCASE108 changes capacity from10 to20 when taken. Its take merges `$563A` stored entries from stack-array index10; its Drop resets capacity to10 and, for overflow, stores `count-10`, requests system string1, truncates count to10 and then removes the head. The count/gauge helper `$555C0` doubles the gauge target except at capacity20. The observed opening capacity is10 with zero briefcase store. The briefcase cycle, full/overflow equality and gauge futures still need Dion execution witnesses.

Dion handling bytes cannot be taken from Damocles. The direct census records POWERGLOVE rather than a second ANTIGRAV at157; TRANSPORTER a67 has handling `$20`, while MAN205 has `$10`. TOURCRAFT13, taxi/bus slots16..27, OBSERVER56..58 and MAN205 have bit4 set: the bypass at157/158 cannot make them takeable. The class ledger covers all246 persistent slots, including nameless/absent identities; it is not a visible-object census or reachability certificate.

There is **no explicit TAXICARD104, BUS PASS103 or ACME UNIVERSAL135 Drop refusal** in `$55794..$559E8`. Their byte values are `$88/$84/$84` while held, with required support ranks2/1/1. Local placement/support gates still govern Drop; absence of a special-item comparison alone does not prove a successful drop at any location. Drop's rank bypass reads **slot39** at `$64BA`, not the opening prison's slot38. These identically named DOOR KEY A objects must retain their separate identities.

Sources: ignored `take-drop.txt`, `observations.json`, direct `$55364..$55458`, `$555C0..$555D4`, `$55794..$559E8`.

## Drop: Residence and support are separate branches

Drop first calls the existing mode helper, refuses VOID, nonzero inventory-label scroll and an empty stack, then checks the current indoor association/trading context. A nearby selection uses a stricter exponent `<=6` gate and excludes slot74. Without that support branch, a held slot0 bypasses the ground/contact flag `$715E`; otherwise lack of ground contact refuses.

For a support candidate, the dropped head's required rank comes from handling bits2–3 and the support's rank from bits0–1. A zero required rank or zero support rank refuses with system string9, as does insufficient rank; held slot39 bypasses this comparison. The support geometry walk determines its highest original vertex height, adds the support's resident Y and refuses a surface above the player-eye Y. This source reader has compact/extended/model-reference cases; no generic browser bounding-box approximation is justified by it yet.

On success, `$55914` clears the head's held bit. Support placement copies the support's X/Z, its decoded top Y, full residence record, group and zone. Direct placement writes player X/Z, player Y minus63, current Body/Floor/group/zone/cell and a mode-selected association. These assignments are the primary evidence for mutable Object Residence; neither original placement nor current player Body alone is a sufficient saved owner. INSTANT PRISON213 also sets `$6EDE` when dropped; drop can affect the active head/card selector `$6F0E`. Those effects require explicit closure if the objects become admitted.

Sources: ignored `take-drop.txt`, `$557F4..$559E8`. Execution and natural reachability of support placements, different Floors/Bodies and INSTANT PRISON remain unresolved.

## Pickup responses and the existing narrative queue

The Dion table `$555EE..$555F6` contains exactly three nonzero `(script,object)` word pairs followed by a zero terminator:

| Object        | Script | Original entry | Opening availability | Initial Residence                                           |
| ------------- | ------ | -------------- | -------------------- | ----------------------------------------------------------- |
| CHILD216      | `$1C`  | `$75467`       | `$A0`                | Body56/group5, surface cell`00-04`                          |
| PCB SEATED218 | `$73`  | `$7468B`       | `$A0`                | TOLOSA Body100/group23, association15, Floor10, cell`02-01` |
| PULVIN ORE127 | `$18`  | `$76243`       | `$A0`                | Body116, surface                                            |

Successful Take calls `$555D4` before clearing old Residence. This helper searches by slot, calls ordinary launcher `$55A1A` for a match, then reaches the sound/description helper `$55B6A`. Boarding also calls `$555D4`, so a complete effect contract must distinguish the action that reached it. The table is primary Dion evidence; Damocles's response identities do not substitute for it.

The launcher first requires availability bit7. While flag6 is active, bit5 permits queuing by replacing the single word `$711C`; it does not yet consume availability. When inactive, bit6 determines repeatability, nonrepeatable launch clears bit7, and entry pushes the existing VM PC. Each response starts at `$A0`: available, queueable, nonrepeatable. Therefore acquisition can complete while its narrative response is queued, replaced or unavailable. It must not roll back merely because launch is refused. The [campaign scheduler](mercenary-iii-tourcraft-campaign.md#scheduler-overwriteable-queue-and-signed-timer) already executes and compares this launcher family: busy/description continuation precedes queued pickup, stale/unavailable queued IDs are consumed, and threshold/timed starts interact with the same queue/stack. Those generic scheduler controls do **not** certify these three pickup scripts or their effect closure.

None of127/216/218 currently appears in `payload/dion/tourcraft/presentation/gameplay.json`'s `modelBindings`; PCB's upper-Floor placement is not immediate TOLOSA exterior access. This establishes no natural pickup response reachable in the currently promoted drawable set. It does not establish that all future dropped/acquired items are inert: packed descriptions, Head Commands, model changes, service keys and object-specific readers require their own reachable closure.

Sources: ignored `response.txt`, `scheduler.txt`, `observations.json`; original availability bytes `$7352+id` and entry words `$6FDC4+2*id`; current [gameplay export](../../payload/dion/tourcraft/presentation/gameplay.json).

## Executed controls and remaining acceptance gates

The first new cold-boot run, `runs/opening-drop-retake-ue0uz10c/`, supplies Enter6000, Drop6500, Take7000, Left7500, Drop8000, Take8500, without walking. Its settled main-loop-top captures establish:

- The initial stack remains `[104,103,135]` after TAXICARD Drop and Take; after Left it becomes `[103,135,104]`; subsequent BUS PASS Drop and Take leave it unchanged.
- Selected slot10 has exponent5. Both Drops therefore face a nearby zero-rank support candidate; the static rank gate explains unchanged state, but this run did not trace the exact refused instruction or prove that a message was visible.
- After rotation, BUS PASS/TAXICARD/ACME UNIVERSAL receive the Y/Floor staging order0/2/1, respectively. Key38 remains held outside the stack.

The indoor run retains plan/debugger/log/PNG/RAM and numeric `observations.json`; it does not establish a successful pickup. The second cold-boot control, `runs/outdoors-drop-retake-u6oroc4h/`, adds forward walking6500–6900 and stops before the actions below. It reaches METIS group3, surface cell`02-06`, through the ordinary opening route, without an authored pose or relocation.

| Input VBL / settled capture | Outcome                                 | Stack           |
| --------------------------- | --------------------------------------- | --------------- |
| Before actions /7200        | Nearest selected resident220, exponent8 | `[104,103,135]` |
| Drop7300 /7400              | TAXICARD104 dropped; state `$88→$08`    | `[103,135]`     |
| Take7800 /7900              | TAXICARD104 re-picked; state `$08→$88`  | `[104,103,135]` |
| Left8300 /8400              | Head rotated to tail                    | `[103,135,104]` |
| Drop8800 /8900              | BUS PASS103 dropped; state `$84→$04`    | `[135,104]`     |
| Take9300 /9400              | BUS PASS103 re-picked; state `$04→$84`  | `[103,135,104]` |
| Right9800 /9900             | Tail rotated to head                    | `[104,103,135]` |

Both successful direct Drops place the object at source XYZ `(165773321,0,70287350)`, group3, Residence bytes `[60,0,0,98]` (METIS surface, Floor0, cell`02-06`). The dropped object then becomes selected with exponent5, and Take restores its held/staged form. Key38 stays held outside the stack throughout. This is a reproduced **ordinary route plus input-mailbox** Drop/re-pick witness for TAXICARD and BUS PASS, and both rotations; it is not a physical keyboard/IKBD witness or a support-placement witness. Samples are settled captures after the press, not instruction-exact boundary logs. It confirms neither sounds/panel pixels nor later taxi/pass/card-command futures. ACME UNIVERSAL was not dropped in these controls.

Required follow-up controls before implementation admits a rule:

1. Retain and confirm the outdoor Drop/re-pick witness at the accepted cadence, and freeze an ordinary New Game route to one initially resident acquisition. Record semantic selection immediately at the press and retain the entire prefix. Different locations must distinguish support refusal from direct placement; Catalogue presence is insufficient.
2. Execute selection/no-selection/tie and both sides of Take/Drop range boundaries; capacity9/10 and19/20; handling-bit4/5 and POWERGLOVE/ANTIGRAV bypass order; both rotations, scroll-in-progress and empty/one-item stacks. Injected boundary fixtures must stay labelled synthetic.
3. Execute both placement branches, unsupported/insufficient/too-high support, indoor/surface/Floor/Body changes and re-pick; recover support heights from original geometry, not guessed extents. Include initial card/pass/device futures and key38/slot39 distinction.
4. Decode a finite response/description/Head Command closure for the actual proposed reachable objects, then compare idle/active/busy/unavailable/queue replacement and campaign/timed boundaries at the accepted eleven-tick cadence. Preserve source entry/availability and VM return nesting.
5. Qualify held-bit/stack/residence admission, preserve the script-only key exception, and compare first panel/frame plus ordered futures across Save/Resume before/after each admitted action. Original machine Save behavior and browser schema validation are separate investigations.

These controls are acceptance gates, not a claim that all original objects must be enabled. The proposed first delivery must identify and review its bounded object/effect set before broad Catalogue promotion.

## Reproduction and evidence identities

From the repository root, with the existing pinned captures/media installed by worktree setup:

```sh
PYTHONPATH=research/mercenary-iii-st python3 restricted/mercenary-iii-object-interactions/observe.py
PYTHONPATH=research/mercenary-iii-st python3 restricted/mercenary-iii-object-interactions/input_witness.py
PYTHONPATH=research/mercenary-iii-st python3 restricted/mercenary-iii-object-interactions/outdoors_witness.py
uv run --with capstone python restricted/mercenary-iii-681/m68.py restricted/mercenary-iii-708/presentation/exact2/start.ram 55354 55458
```

The observer writes only its ignored ledger. Each input run creates a fresh ignored run directory and rechecks the pinned STX, EmuTOS and Hatari inputs; run files preserve their generated debugger scripts. Addresses below are half-open, SHA-256 from the coherent `start` source; all listed ranges match retained `f138/f928` unless stated.

| Range            | Role                  | SHA-256                                                            |
| ---------------- | --------------------- | ------------------------------------------------------------------ |
| `$4E1FC..$4E328` | Stack/rotation        | `4093101ac0b6aedf17caa2e74e5916cc1947a93f6c341576ffa341f283733668` |
| `$53C2A..$53D32` | Residence/staging     | `2037ba241533b898cfa218485b5e7a9ae6f4096b638bd5794cf64f3853971b34` |
| `$545AE..$545F0` | Selection writer      | `2745639394dd287d7c8f2b14930f1d82dc0d8c40e3c85bda038a5e47923c0abd` |
| `$55354..$55458` | Take/refusal/capacity | `fd9e62379d54931ed6bc5b4078031fa497b128fc177c781dc69d35a3464db061` |
| `$555D4..$555F6` | Pickup helper/table   | `2c988d652654cbc0289fe4c6422471c6700876aed3f5a9bee279a90a95905ff8` |
| `$55794..$559E8` | Drop/placement        | `ad010dd34776d139f6b7d24159830594700a6305ff99bdd868709a5a4bc8bc53` |
| `$55A0E..$55A7E` | Queue/launcher        | `c1e2c33931582856e1598012f8253d0564a079df6fb60e1ddb34a926c4539754` |
| `$568CE..$5691A` | Input dispatch        | `83639d25da5e91420585860d5afd3e3e3d04f8ac90ac9ff89b1d919cbbbe1985` |

The distance builder ledger begins at `$54182`, excluding mutable count word `$54174` (it changes0→2 across the retained flight). Full RAM/slice/script identities and each probe capture's hash stay in the ignored ledgers; no new Golden Trace or Data Payload export is published here.
