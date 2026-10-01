# Mercenary III: opening prison door latch and sound attribution

Research for [#645](https://github.com/odogono/mercenary/issues/645), 2026-10-01. This is a probe accepted by D1 ([#638](https://github.com/odogono/mercenary/issues/638), [milestone review](mercenary-iii-taxi-milestone-review.md)). It closes the prison-door gap left by R2 ([content and presentation](mercenary-iii-taxi-content-presentation.md#defects-uncertainties-and-blockers)) and corrects one R3 classification ([persistence](mercenary-iii-taxi-persistence.md#location-workspace-and-engine-work-areas)). It extends the pinned **Mercenary III research baseline** and proposes no application, public API, Data Payload, Save format, `/dion` admission, glossary or architecture change. Following [ADR 0002](../adr/0002-separate-rom-research-from-implementation.md), RAM, screenshots, logs and disassembly remain ignored Restricted Material under `restricted/mercenary-iii-645/`.

## Outcome

The prison door does not start open. **The game binds it shut, and the opening script then hands the player the key while they stand inside the door's box.** Everything R2 saw follows from one mover rule and one script instruction:

1. **Door.** The prison (structure 132, cell `$62`) has exactly one attachment, slot `$3FC`. It is a two-leaf X door spanning X −150..150 at Z −885..−840, with a proximity box of X −150..150, Z −1200..300 (upper bounds exclusive). Its live word `$406C` holds the constructor byte `$42` and a latch byte: `$00` shut, `$01` moving, `$FF` fully open.
2. **Rule.** In each on-foot substep, the door opens one unit per leaf while the player is inside the box **and** holds the door's key. Otherwise it closes one unit per leaf. The leaves stop eight units inside the outer edges (±142), so the travel is 142. The latch settles one substep after the leaves arrive, so a full swing is 143 substeps in either direction.
3. **Key.** The structure record's control word is `$42F0`. On bind, its low byte `$F0` resolves to object `$7193` + 0 = `$26`, which is one of ten objects named DOOR KEY A. The prison cell's key byte `$12` selects it (`$7192` = `$12`/2 + `$1D`). "Holds" means bit 7 of the object's state byte `$641E`+4·`$26` = `$64B6`, the same bit a pickup sets.
4. **Why it opens.** The location loader binds the door shut (`$4200`) at game start (VBL 4753 in the 60 Hz lab boot), with `$64B6` = `$05` (key not held). For 128 substeps the mover refuses the player, who is in the box without the key. The opening script `$19` then waits 150 VBL and executes op `$20` `$26 $87` at `$6FF5E`: "set bit 7 of object `$26`". The key byte becomes `$85` at VBL 4976. The door opens over 143 substeps, from 4976 to 5197.
5. **Why it closes.** At 10320 the walking player crosses Z = −1200 and leaves the box. The door closes over 143 substeps and latches `$00` at 10520. It stays bound and shut until the taxi leaves the cell; the unbind at 12713 clears the slot, and the solicitor and spaceport loaders bind their own doors shut. No other door moves on either journey.
6. **Sound attribution — confirmed.** Both of R2's "door moving" intervals are this one door. The cell-door sound at 4986–5207 is the opening swing, and the sound at 10317–10517 is the closing swing. The mover's list ends after slot `$3FC`, and every arming of the programme coincides with the first pass of `a0` = `$254` (slot `$3FC`).
7. **Access.** Without the key, the door never opens, the doorway region (flags `$83FC`, gated on slot `$3FC`) is never selectable, and the player is held at the room edge (Z −840). On the first contact the game shows ID message 0, **LOCKED**. Walking back into the box with the key reopens the door at once. The player waits at the doorway region edge (Z −895) until the latch reads `$FF`.
8. **Extraction mismatch — resolved.** R2's world render drew the authored closed rectangle. With the live leaf edges applied (−142/+142 at latch `$FF`), the render of the 5800 capture shows the open doorway as the screenshot does.
9. **Restore.** The latch and the leaf edges are **saved state**, not location-derived, while the player is in the prison cell from VBL 4976 until the close completes. Restoring them shut at 6010 or 10300 produces a door swing and sound that the uninterrupted run does not have. Restoring from a checkpoint is deterministic, and after 10520 the bound door always equals its rebuild value.

## Baseline and method

The pins are R1's and unchanged: STX `4e8b74122910bcaa109b944eebb6f0ec18fdeb1175c34eea3c932d0e1b18b62c`, EmuTOS `emutos206.img` `154803e3ff4851f3dc358b91b16d6b6110d187a81d8132ecb665af49878939d5` and Hatari 2.6.1 `05723606c75a1f0642395974abdce2cbbe48b0a09a747f65cdfca7ef9201e11a`, checked before every run. The machine configuration is the [integration recipe](mercenary-iii-integration.md#cold-boot-and-controlled-probes), and the inputs are R2's journey schedule. Static reads use R1's loaded RAM `94a107412037ce7972a605bfa1355e9fc9751373922df7fbd987d9ff94f1a8ec`.

Runs:

| Run | Start | Purpose |
|---|---|---|
| Cold solicitor, cold spaceport | Reset | Full journeys to 22600 under all breakpoints below |
| No key | Reset | As solicitor to 11000, but every write to `$64B6` is followed by writing `$05` back; no boarding |
| Walk back | Reset | Solicitor to 10650, then stick back (`$7056` ← 2) from 10700 to 11300 |
| PAL | Reset | `$FFFF820A` ← `$02` at VBL 10 (R4 recipe), walk from 9000 for 535 VBL |
| Natural ×2 | R3 `ck10300` | Unmodified continuation to 10800, twice |
| Forced shut | R3 `ck10300`, `ck6010` | After restore: latch byte `$406D` ← 0 and inner leaf edges `$167E`, `$1682`, `$1686`, `$168A` ← 0 |

Persistent `:trace :quiet` breakpoints (each callback begins with a distinct `e` tag so hits can be told apart):

| Condition | Logged | Meaning |
|---|---|---|
| `($406c).w ! ($406c).w` | `e VBL`, `e pc`, `m $406c-$4070`, `m $1674-$1694` | Latch word writers (PC is after the writer) |
| `($64b6).b ! ($64b6).b` | `e VBL`, `e pc`, `m $64b6-$64ba` | DOOR KEY A state byte |
| `pc = $5ba92` | `e VBL`, `r`, latch, leaves, pose `m $7036-$7042` | Closing pass of the slot in `a0` (the probe R2 named) |
| `pc = $5bbee` | same | Opening pass |
| `pc = $5ba18`, `pc = $5b9ca` | `e VBL`, latch | Door-moving / door-stop programme armed |
| `pc = $5af70` | `e VBL`, `r` | Attachment binder writes `$3E18(a3)` |
| `pc = $5ba86` | `e VBL`, pose | In the box without the key |
| `pc = $5a532` | `e VBL` | Contact with refusal → ID message 0 |

A short separate cold run logs the script PC `$6EDA` at the interpreter fetch `$5287E` between 4600 and 5300.

## The door and its mover

### Workspace

- Attachment state lives in parallel word arrays indexed by `a0` = slot − `$1A8`, so slot `$3FC` is `a0` = `$254`. The constructor/latch word is `$3E18(a0)` = `$406C`, and the key word is `$3E1A(a0)` = `$406E` (`$0026`). The geometry offset is `$1FA0(a0)` (`$34`). The box is X `$1640/$1642(a0)` and Z `$1898/$189A(a0)`. The leaf X edges are `$1640+$34` onward, and the inner edges the mover writes are `$167E`/`$1682` (left) and `$1686`/`$168A` (right).
- The mover `$5BA24` runs from slot `$254` downward and stops at the first zero word. In the prison, `$250` is zero, so only slot `$3FC` is processed. The other non-zero words below it are unrelated scratch, not attachments.
- The mover is skipped while the player is a taxi passenger (`$6EB2` ≠ 0) or while `$719A` is negative. It is called from the on-foot loop `$5A4E2..$5A504`, which runs clamp(`$5301E`, 4, 8) substeps per main-loop frame: one per VBL of the previous frame, between 4 and 8. Each substep calls the lift step, the walk, the door mover and the region scan.

### One pass

For the slot in `a0`, with `d7` = constructor/latch word and `d6` = key word:

1. **Opening is allowed** when one of these holds:
   - `d6` is negative with bit 14 set (forced open), or
   - the pose `$7038`/`$7040` is inside the box and either `d6`'s low byte is 0 (no key) or bit 7 of `$641E`+4·key is set (key held).
   
   If the pose is in the box but the key is not held, the pass raises the refusal flag `$5B9C2` and falls through to closing.
2. **Opening pass** (`$5BBE4`): if the latch is `$FF`, nothing happens. Otherwise the pass raises the moving flag `$5B9C0`, writes latch `$01`, and moves each inner leaf edge one unit toward the outer edge (`move.l #1,d4`). When a further step would pass "outer − 8", the edges are set there and the latch becomes `$FF`.
3. **Closing pass** (`$5BA8E`): if the latch is `$00`, nothing happens. Otherwise the pass raises `$5B9C0`, writes `$01`, and moves the edges one unit toward the closed position. For two leaves that is the midpoint. When a further step would pass it, the edges are set to the midpoint and the latch becomes `$00`.
4. **Edges** (`$5B9D6`, once per substep after the loop): a rising edge of `$5B9C0` arms the door-moving programme `$4C7AA` on channel C, and a falling edge arms door-stop `$4C6E8`. The edge is ignored when `$70F8` ≠ 0 and region-flag bit 14 is set. `$5B9C2` is copied to `$5B9C3` for the contact test.

Constructor `$42`: bit 15 clear selects X motion, and bit 9 set selects two leaves splitting at the midpoint. Bit 8 picks the side for a single leaf. These are the same readings as a Damocles Attachment Constructor, and the prison door behaves like Damocles's Capital Spaceport `$4200` two-leaf X entrance: one unit per substep, an 8-unit inset, and a latch one substep after arrival for two leaves (see [door speed](damocles-door-speed.md)). This is a sibling-engine similarity recorded for R4/[#419](https://github.com/odogono/mercenary/issues/419), not a claim of shared code. The key test has no counterpart in the glossary's Entrance Attachment, so it is a gap to raise through `/domain-modeling` before any shared vocabulary is adopted.

### Region gate and contact

- The region scanner `$5B320..$5B34A` accepts a region whose flags name an attachment slot (bits `$3FC`, excluding the reserved `$200`) only while that slot's latch is negative (`$FF`). Prison region 2, the doorway (`$83FC`), names slot `$3FC`.
- When the on-foot region clamp `$5B5EE..$5B616` pushes the player back, it sets `$5B618`. On the rising edge of that flag, `$5A510` arms channel-B programme `$4CA62`, a contact sound that neither journey produces. If `$5B9C3` is also set (the previous substep refused a keyless player in the box), it then shows ID message 0 through `$55B00`. That message is **LOCKED**, observed on screen.

### Binding and the key

- **Cell key base.** The cell bind (`$56002..$56094`) reads the cell workspace key byte `$4CF0`+4·cell, masks it with `$FE` into `$7190`, and for values 1..`$1E` sets `$7192` = value/2 + `$1D`, otherwise 0. The prison cell `$62` holds `$12`, so the base `$7193` is `$26`.
- **Attachment binder** (`$5AE4E..$5AF8E`). It clears the slot's long, then reads the control word's low byte:
  - 0: no key; the word is written as is (latch `$00`).
  - 1..`$0F`: a different attachment kind, not on these journeys.
  - `$80..$EF`: the key is that byte.
  - `$10..$7F` and `$F0..$FF`: the key is base + low nibble. With base 0 the branch writes the word unchanged, leaving the low byte in the latch with no key. This path was not exercised.
  
  For a keyed door the binder searches a 6-byte exception list at `$57DA`. In every capture that list holds one non-METIS record, so that branch is not exercised either. The binder then stores the key in `$3E1B(a3)`, clears the latch byte and writes the word. For the prison that is `$4200` with key `$26` (`$F0` → `$26` + 0).
- **Objects `$1E`–`$27`** all carry the model name DOOR KEY A. The cell base and the attachment's n choose which of them opens a given door. Only `$26` has bit 7 set after the script runs.
- **Script op `$20`** (`$52EF2`): the operands are object o and byte b. If b is negative, the op executes `bset b, ($641E+4·o)`; otherwise `bclr`. The bit number is b mod 8. In the opening script `$19` it sits at `$6FF5E` as `20 26 87`, after a call to the shared 150-VBL wait `$766ED` (op `$04` operand `$69A9`, relative to `$6FD44`). It is followed by another 150-VBL wait and then the first message. This closes R2's unknown "script op `$20` (watch `$641E+$98`)": `$641E+$98` is `$64B6`.

## Observed timelines

60 Hz lab boot (R2's conditions). The solicitor and spaceport cold runs matched VBL for VBL through 10520, with byte-identical RAM at 10550. R2's ±12 VBL session jitter still applies between sessions (R2 saw 4986 and 10317).

| VBL | Event | Evidence |
|---:|---|---|
| 4753–4754 | Prison cell bound four times. Each bind clears the slot (`$5AE5E`) and writes `$4200`, key `$0026` | Latch watch, PC `$5AF74`/`$5AE62` |
| 4755–4963 | 128 refusal passes; player at (9, 116), inside the box without the key | `$5BA86` hits |
| 4760 / 4773 | Script `$19` starts; calls the 150-VBL wait | `$6EDA` = `$6FF57`, `$6FF5C` |
| 4976 | Op `$20` sets `$64B6` `$05` → `$85` (PC `$52F0E`); first opening pass; latch `$4201`; door-moving armed | Key watch, `$5BBEE`, `$5BA18` |
| 4976–5197 | 143 opening passes, leaves 0 → ±142; latch `$42FF`; door-stop armed at 5197 | `$5BBEE` ×143, `$5B9CA` |
| 5175–5250 | First message (MESSAGE FROM THE CHIEF PRISON OFFICER:); the screenshot at 4900 shows the door shut and at 5250 open | Script trace, screenshots |
| 10000 | Stick forward | — |
| 10320 | Pose Z −1204, outside the box: first closing pass, latch `$4201`, door-moving armed | `$5BA92`, `$5BA18` |
| 10320–10520 | 143 closing passes, ±142 → 0, latch `$4200`, door-stop armed at 10520; pose Z −2056 at the last pass | `$5BA92` ×143, `$5B9CA` |
| 12713 / 12705 | Taxi leaves the cell: slot cleared | Latch watch, PC `$5AE62` |
| 13278 onward | Solicitor (and on the spaceport route, each later cell) binds its own doors shut; no door ever opens on either journey | Binder hits, no `$5BBEE` hit after 10520 |

Controls:

| Run | Result |
|---|---|
| No key | Op `$20` still runs (4952), and the key byte is forced back to `$05`. The door never moves; 3,568 refusals by 10233. Walking stops at Z −840 in region 1. **LOCKED** at 10233, still at Z −840 at 11000. Pressed against the shut leaves, the camera lies on their face plane and the frame shows the street through them (a near-plane edge case, not pursued) |
| Walk back | Box re-entered at Z −1198. Opening passes 11028–11226 with door-moving/stop. Player held at Z −895 from 11105 until the latch reads `$FF`, then enters region 1 (Z −577 at 11300) |
| PAL 50 Hz | Same sequence: bind ≈3970, 144 refusals, key at 4180, 143 opening passes 4180–4361, 143 closing passes 9237–9375. Pass counts are rate-independent; VBL durations are not |

**Timing under ADR 0058.** The door counts in substeps. At a fixed 11-VBL frame, clamp(11, 4, 8) = 8 substeps per frame, so each 143-substep swing takes 18 frames (198 VBL). The opening script's waits count VBL, so the key arrives 150 VBL plus the frames the script ops take after the script starts. The door then opens at once, because the player is already in the box.

## Restore evidence

All restores use R3's `U-sol` checkpoints and R3's sidecar method.

| Case | Door outcome | Compared with natural |
|---|---|---|
| `ck10300` natural, twice | Latch `$42FF` at restore (pose Z −1084, inside the box). First closing pass 10323, latch `$00` at 10523 | The two runs match hit for hit (147 tagged hits), and RAM at 10800 is identical (`fc1fe283…`) |
| `ck10300`, latch and leaves forced shut | Opening passes from 10301 (in the box, key held) with the door-moving sound: 19 passes. The box is left at 10323, followed by 20 closing passes and door-stop at 10345 | **Divergent:** a 44-VBL swing and sound that never happen naturally, and the natural close at 10323–10523 is gone |
| `ck6010`, latch and leaves forced shut | Reopens 6015–6210 (143 passes) with sound; doorway region not selectable until 6210 | **Divergent:** natural continuation has no swing or sound; the doorway was open throughout |

Consequences for R3:

- **Correction.** R3 classed `$3E00..$4200`, which includes `$406C`, as location state rebuilt by the loader (L). That holds only after the closing swing completes (10520), and at the solicitor and spaceport checkpoints R3 tested. At the opening checkpoints (6010, 7320, 9000 and 10300 in R3's set), the loader's value `$4200` with shut leaves diverges. The slot's latch byte and leaf edges are **R** state there.
- **What a Save needs** for the bounded slice is the bound cell's door state: latch byte (`$00`/`$01`/`$FF`) plus the inner leaf edge, 0..142. With these, the next frame's pass continues exactly. The key bit (`$64B6` bit 7) is also state. R3 saw carried items unchanged only because `B0` (VBL 6000) is after the handover at 4976. A rule-based rebuild ("open if in the box with the key") is wrong mid-swing (4976–5197, 10320–10520) and after a walk back. Whether I2 stores the latch and edge or the swing progress is an I2 design choice. The Damocles port keeps "open units and the latch" ([door speed](damocles-door-speed.md)).
- **Before 4976** the door is shut with the key not held, so a restore there equals the bind values plus the unexecuted op `$20`. The script PC that R3 already carries brings the key in on time.

## Extraction mismatch

R2's renderer (`render_struct.py`, restricted) drew the attachment from the authored record: leaves X −150..0 and 0..150, which is shut. The live workspace at 5800 holds inner edges −142 and +142 with latch `$42FF`. Moving the two inner X edges to the live values makes the render of the 5800 capture show the open doorway and the street through it, as the screenshot does. At 10400, the capture's camera faces away from the door, so it does not test the leaves. The rule for any extractor or port: **draw the leaves from the live edges (or open units), never from the closed rectangle.** R2's "latch state was not applied" is therefore the whole defect.

## Reproduction

Use the integration recipe's machine configuration and R2's input schedule. No ignored helper is needed.

1. **Latch and sound timeline.** Before `c`, install the breakpoints in the [method table](#baseline-and-method) with `:trace :quiet :file <cb.ini>`. Start each callback with `e $A000n` (n = 0..8) so hits can be separated in the log, followed by the listed commands. Run each route to 22600. Expect the timeline above, ±12 VBL between sessions.
2. **Key rule.** Add `b ($64b6).b ! ($64b6).b` with a callback that runs `w $64b6 $05`, run solicitor to 11000 without B, and capture a screenshot at 10300 (LOCKED). For the walk back, set `w $7056 $02` at 10700 and `w $7056 $00` at 11300.
3. **Rate independence.** Write `w $ff820a $02` at VBL 10, start walking at 9000 and stop at 9535. Count `$5BBEE` and `$5BA92` hits: 143 each.
4. **Restore.** Take R3's `ck6010`/`ck10300` (or save a state at the first loop top `$5A41A` after those VBLs). In the restore sidecar, before re-arming breakpoints, write `w $406d $00`, `w $167e $00 $00`, `w $1682 $00 $00`, `w $1686 $00 $00` and `w $168a $00 $00`. Compare with an unmodified restore.
5. **Static reads.** Hash the slices below in the loaded RAM before decoding. The object name for slot n is the 16 bytes before `$2EAB8` + word(`$2EAB8`+2n).
6. **Render check.** In any structure render, after building the attachment mesh for slot s, take `$1FA0`+(s−`$1A8`) as the geometry offset g and replace the inner X edges (0) with the words at `$1640`+g+10 (left) and +18 (right).

### Inspected slices

From loaded RAM `94a10741…a8ec`. R2's hashes still cover the edge detector `$5B9C4..$5BA24`, the binder/region ranges `$5AE62..$5B2D2`/`$5B2D2..$5B4A2`, the opcode handlers `$528F6..$53002`, the opening script `$6FF57..$7014B` and the model table.

| Half-open range | Meaning | SHA-256 |
|---|---|---|
| `$5BA24..$5BD40` | Door mover (gates, key test, eight motion paths) | `07e5babceea171f95aecca5a02d6a94871a39601f251f2e0426e9b6bd6c27d07` |
| `$5AE4E..$5AF8E` | Attachment binder head and key resolution | `489b27d3b18bc1001c8c0a615198b4079d475674c357af04126361954003c18e` |
| `$56002..$56094` | Cell bind: key base `$7192` | `9c2437aa04ffc4fb6431b56dba50228c398d173c09e14f83788038cd8c9346ac` |
| `$5A4C2..$5A538` | On-foot substep loop and contact/LOCKED edge | `9e95b199781ec8080f535a9fbd775bf8e2b2373fb40b596cfff431d7cc2580d8` |
| `$5B5EE..$5B61C` | Region clamp and contact flag | `1fc5e4fda14a58424bcf50093d3b519dadbb53a366393a680c4997f1c3bc6baf` |
| `$5B320..$5B34E` | Region gate on attachment latch | `0a2a0c7346d0a5f2d4d018b5946d086609dee23fc96e3b9fb0008186601456b4` |
| `$52EF2..$52F14` | Script op `$20` (object state bit) | `5c94b152991064df9993b8159d6759d89f8423a52ea424f8c5ca58bb2cdd6b04` |
| `$6FF57..$6FF68` | Opening script head, including `20 26 87` | `28b1a622071158db7eaa444426a225a89e1204c4802792067ec9e5580a278ef8` |
| `$55388..$55440` | Pickup: sets state bit 7 | `a1a2f2a1178b4d2e3f05b29dab9edf838db3cdcb4b054443ef54a3cd61be9b53` |
| `$305A0..$305AE` | Model name of object `$26` (DOOR KEY A) | `23fd486a193145e3011dd527951b83709316d457e35af614eb91d7ea27cd6fad` |

### Artifact identities

Paths are relative to ignored `restricted/mercenary-iii-645/runs/`. Reproduction depends on the pins and procedures above, not on these files.

| Artifact | SHA-256 |
|---|---|
| `cold-solicitor-1jdlneg9/v4900.ram` (shut, before key) | `094cefb5e6969e8c875aae4769e2a96b878a275a09b78b812af7c3b8ed9e7e98` |
| `cold-solicitor-1jdlneg9/v5250.ram` (open) | `1f14d3b50ec13a7e4779319a70daf53307de9cb36bf6c8c26540d4a4b1a58eae` |
| `cold-solicitor-1jdlneg9/v10550.ram` = `cold-spaceport-_umlf0ka/v10550.ram` | `93e4a20c0f1c0e609a5c3b2f5dea870b56544f58fe3a56a234ae310e606c1e37` |
| `nokey-ljo8tv05/v10300.ram` (LOCKED) | `c64c1cce515be01ecb8588d8c3f8af4e8ae24be31f6237a2dd41dc2f0145ce6d` |
| `back-1o5nhcee/v11300.ram` (reopened) | `a509bd8bd15d520ac0e3f3ffb3ce259b3721bcfed23440204da52113624ae06a` |
| `R-n10300a-zw60wn79/v10800.ram` (= `R-n10300b`) | `fc1fe283c591f3f22bd7ea63f9144ef14817f2f1e4fa05ba9462808f032ffbc1` |
| `R-c6010-nq4naodh/v6400.ram` (forced shut, reopening) | `932aeaaf9ec95d983cc6c5a38a12008d561b48557c6ddd53cf97bbef60c379be` |
| `pal-6stw3c20/v9600.ram` | `c57c23c2fdd47af54534d0d907ebf8a86ec85d2a6e4b87e44b2ff53e50f07899` |

## Handoffs

- **I2 opening ([#648](https://github.com/odogono/mercenary/issues/648)).** Bind the prison door shut, without the key held. Run op `$20` at its script position. Open by the mover rule, 143 substeps, with the door-moving sound on the first pass and door-stop on the settling pass. The doorway region is selectable only at latch `$FF`. Close it when the player leaves the box. Draw the leaves from the live edges.
- **I2 sound.** The two door intervals are one door's opening and closing swings. The contact sound `$4CA62` and LOCKED belong to the keyless path, which the bounded journeys never reach.
- **I2 restore acceptance.** Carry the latch, the leaf edge and the key bit. Add restore cases at 6010 (open, at rest) and mid-close (about 10400) to the R3 comparison, both of which must continue without an extra swing.
- **Open, not needed for the slice.** The binder's exception list `$57DA` and its `$DF` marker; attachment low bytes 1..`$0F`; forced-open/forced-closed key words (`$C0xx`/`$80xx`, written by the lift path `$56D8A`); `$70F8`'s sound mute; and the `$B301` byte the binder writes per slot.
