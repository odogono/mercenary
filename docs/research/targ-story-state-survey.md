# Targ story state: a survey for moving it into Talk Scripts

Survey, 2026-10-29. [ADR 0080](../adr/0080-run-targs-scripts-as-talk-scripts.md) runs Targ's scripts as Talk Scripts, and every Benson Script is now ported ([the Benson Script survey](targ-benson-script-survey.md)). The ports kept the Benson host's storage: Talk Scripts still read and write engine flags, object flags and credits through the `world` Capability, which patches `BensonHostState` ([`talk/host.ts`](../../web/src/talk/host.ts):12–14, 466–470). This survey is the first step of moving Targ's **story state** into Talk Scripts as Script Variables, while the simulation stays in TypeScript. It covers each piece of story state in the Save Snapshot, who reads and writes it, and whether it should move. It ends with migration batches, one PR each, and open questions.

## Method

- **Storage.** Read from `SaveSnapshot` and the types it embeds in [`session/save.ts`](../../web/src/session/save.ts) (schema 15), [`benson/host.ts`](../../web/src/benson/host.ts) and [`benson/channel.ts`](../../web/src/benson/channel.ts).
- **Talk readers and writers.** Every `ask world to …` in [`web/src/talk/scripts/`](../../web/src/talk/scripts/), found with `rg`, and the world operation it calls in `talk/host.ts` `defineCapabilities` (474–697).
- **Engine readers and writers.** `rg` over `web/src` with tests excluded, then each hit read. Tests are listed separately, as what a move has to update.
- **Payload facts.** Initial object flags from [`payload/objects.json`](../../payload/objects.json) `instances[].stateFlags`; masks from [`payload/interaction.json`](../../payload/interaction.json) (`carriedMask` 128, `descriptionMask` 12, `fixedMask` 16, `heavyMask` 32); engine message indices from `rooms.json`, `underground.json`, `endgame.json` and `interaction.json`.

Nothing was run. Statements marked **unverified** were not checked against code or behaviour.

## Where story state is stored

Story state sits in three places in the Save:

- `snapshot.benson.host` (`BensonHostSaveSnapshot`, save.ts:58–63): `engineFlags`, `decimals` (credits are decimal 8), `shipInbound`, `attackingShip`, `endingPhase`, `messageInterval`, and the leftovers `canLiftAnything`, `canTakeAnything`, `signedRegister`, `tickCounter`, `messagePlaying`, `currentRoom`, `boardedCraft`. Captured at channel.ts:162–196, restored at channel.ts:198–227, which clears engine bits 0xc0 (213).
- `snapshot.objectFlags`, `snapshot.residence`, `snapshot.rewired` (save.ts:173–176): the session's own maps, captured at [`session/index.ts`](../../web/src/session/index.ts):848–851 and restored at 917–919.
- `snapshot.talk` (save.ts:88–100): the NorthTalk Group, base64, with sources external. The only Script Variable today is the opening's `heard` (opening.talk:12).

The host's object flags, rooms, inventory, location and occupancy are a projection. `GameplaySession.talking` (index.ts:2042–2050) projects the session's maps into the host (`project`, 1087–1100), runs the Talk Script, then copies the result back (`reconcile`, 1102 on). So `objectFlags` is owned by the session; the host's copy lives only for the length of a call.

## Engine flags

`benson.host.engineFlags`, one byte, validated at save.ts:759. Talk names five bits (`FLAGS`, host.ts:75–82) through the operations `flag` (592), `setFlag` (671) and `clearFlag` (528). No Talk Script calls `clearFlag` any more.

No TypeScript engine code in `web/src` reads or writes any of the five story bits. Outside the Talk host, `engineFlags` is touched only by the Save codec, the channel's capture and restore, and the Semantic Observations (`session/observations.ts`:92). The Observations are the browser half of the lab comparison (`research/c64-reference-build/c64lab/benson.py` reads `engineFlags` too). That makes every story bit Talk-only in play, but visible to comparisons and tests.

| Bit | Name | Writers | Readers | Used by | Tests that read the bit |
| --: | --- | --- | --- | --- | --- |
| 1 | `dartBought` | opening.talk:88 (`buyDart`, `setFlag`) | commerce.talk:57 (`flag`, first Dart boarding) | Talk only, **two scripts** | opening.test.ts:135; commerce-talk.test.ts (`DART_BOUGHT`, 29) |
| 2 | `gratitudeGiven` | reactions.talk:78 | reactions.talk:75 | Talk only, one script | reactions-talk.test.ts:18, 302 |
| 4 | `shipHired` | commerce.talk:41 | escape.talk:88 (`canLaunch`) | Talk only, **two scripts** | escape.test.ts:15 and 123–353; hire.test.ts:11; commerce-talk.test.ts:30 |
| 8 | `advertDestroyed` | reactions.talk:9 via 46 | **Nothing** | Talk only, write-only | site-destruction.test.ts:240 (via Observations) |
| 32 | `commanderAnnoyed` | commerce.talk:60; reactions.talk:18 via 46; reactions.talk:59 | escape.talk:65 (the epilogue's extra line) | Talk only, **three scripts** | escape.test.ts:28 (`OPTIONAL_EPILOGUE`), 594; escape-talk.test.ts:25, 143; opening.test.ts:36, 143–153; commerce-talk.test.ts:31 |
| 64 | script running | Only the oracle (test/oracle/machine.ts:607, oracle/session.ts:140) | `BensonHostState.isScriptRunning` (benson/host.ts:203), read by `TalkHost.settleDisplay` (talk/host.ts:441) | Engine (vestigial in live play: nothing live sets it, and restore clears it, channel.ts:213) | shell-session.test.ts:53–60 |
| 128 | input detected | Only the oracle (oracle/session.ts:149) | Nothing in `web/src` | Engine, vestigial | shell-session.test.ts:53–60 |

### Couplings

- **Bit 1, the hire answer.** Benson Script 2 kept its yes/no answer in bit 1, the same bit as `dartBought` ([survey](targ-benson-script-survey.md#engine-flags)). The commerce port separated them: the answer is now the `wait for` race itself (commerce.talk:21–30), and bit 1 is only "bought the Dart". The departure is pinned by commerce-talk.test.ts:261, "a buyer who lets the hire lapse still gets the job offer". Bit 1 now has one writer and one reader, in different scripts.
- **Bit 8 is superseded.** The Escape's advert check reads the Site Ledger, not the flag: `advertIntact` (host.ts:474) asks whether block 50 is missing from `destroyedBlocks`. That is right, because the advert can be restored (`restorationCarried`, index.ts:2379) and the flag would never clear. The bit is kept only for parity with the original.
- **`commanderAnnoyed` has three writers.** Stealing the Dart (commerce), destroying the brother-in-law's house (reactions, Site row) and shooting his new ship (reactions, `struck`). All are monotonic sets; nothing clears it.
- **`gratitudeGiven` is a lock.** It is set before the first suspension so two concurrent `gratitude` Runs can't both pay (reactions.talk:77–78). The Site Ledger raises `gratitude` on every strike past the threshold (session/sites.ts:150–159, index.ts:2394–2398), so the flag, not the engine, makes it once-only.

### Recommendations

| Bit | Recommendation |
| --- | --- |
| `gratitudeGiven` | **Move** into reactions.talk as `script variable gratitudeGiven`. Single script, no engine reader. Script Variable writes are immediate within a Run, so the lock is kept. |
| `advertDestroyed` | **Move** into reactions.talk, or **drop**. It has no reader. Keeping it as a Script Variable preserves the fact for a future reader at no cost. |
| `shipHired` | **Move** into commerce.talk; escape.talk gets it from commerce with `send`. See open question 1. |
| `dartBought` | **Move** into commerce.talk, the reader; the opening has to tell commerce. Moving it into the opening would leave commerce asking. See open question 1. |
| `commanderAnnoyed` | **Move** last, into escape.talk (the one reader) or a story script, after the cross-script mechanism is proven on the two-script flags. Three writers in two scripts. |
| 64, 128 | **Keep as-is** in the engine: display arbitration and the oracle's comparison adapter. |

## Object flags

`snapshot.objectFlags`: one byte per object slot, seeded from `stateFlags` (index.ts:759–763), owned by the session. The payload uses only the values 0, 4, 8, 16, 32, 36, 40 and 48. Bits 2 and 64 are set by no payload object, Talk Script or engine code found.

| Bit | Meaning | Storage and seed | Writers | Readers | Used by | Recommendation |
| --: | --- | --- | --- | --- | --- | --- |
| 1 | **Delivered** (paid for) | Not seeded | Talk `deliver` (host.ts:543), from deliveries.talk:69 | Talk `delivered` (host.ts:558), deliveries.talk:52; engine only via Observations (observations.ts:117) and the Save | Talk only | **Move** into deliveries.talk as a Script Variable list of delivered items. Both factions' rows are in the one script, so "paid once, to whichever side has it first" stays local. |
| 4 | **Armed**: boarding or taking starts the slot's own script. In the description selector (`descriptionMask` 12, selector `>> 3 === 0` = script, interaction/index.ts:207–215) | Seeded on slots 1 (Dart, 36), 7 (Interstellar Ship, 36), 12 (captured Mechanoid, 4) | Talk `arm` (481), opening.talk:17–19; Talk `disarm` (571), commerce.talk:56 | Talk `armed` (496), commerce.talk:54, 80. Engine: `interaction.description` (index.ts:1277–1278, 1320–1321) → `describe` → `start` (2058–2060), which reaches only the oracle adapter, a no-op in live play | Both, but the engine's reading does nothing in live play | **Keep as-is for now.** It is payload-seeded and part of the description selector beside bit 8. The Dart's "first boarding done" could become a commerce variable later (optional batch). The ship's arming has no Talk reader: escape.talk:9 doesn't check it. |
| 8 | Description is a message | Seeded on 21 + 1 objects (8, 40) | Talk `disarm` clears it (no object it disarms has it) | Engine `description` → `show` (index.ts:2066–2068) | Engine | **Keep** (payload). |
| 16 | Fixed in place | Seeded (16, 48) | Talk `deliver` (host.ts:553, `FIXED`) | Engine `isFixedInPlace` (interaction/index.ts:110–117, 141) | Both: Talk writes, the engine enforces | **Keep in engine.** When bit 1 moves, `deliver` still has to fix the object; it becomes a `fix` command, or `deliver` keeps setting only bit 16. |
| 32 | Heavy | Seeded | — | interaction/index.ts:149–152 | Engine | Keep. |
| 128 | Carried | Seeded 0 | interaction/index.ts:164 | session `reconcile` (index.ts:1137–1141), seed (765–767) | Engine | Keep. |

## Credits

`benson.host.decimals[8]` (`BensonHostState.firstNumberDecimal`, benson/host.ts:74), each decimal 0–99,999,999 (save.ts:756–757), added modulo 10⁸ (benson/host.ts `addDecimal`). Seeded to 9000 in `BensonChannel`'s constructor (channel.ts:61–64).

- **Talk readers** (`credits`, host.ts:537): opening.talk:71, commerce.talk:32, deliveries.talk:71, rooms.talk:11, reactions.talk:96.
- **Talk writers:** `spend` (686) at opening.talk:89 and commerce.talk:38; `pay` (638) at deliveries.talk:70 and reactions.talk:95.
- **Engine readers:** `BensonChannel.credits` (channel.ts:78–80) → `SessionSnapshot.credits` (index.ts:2948) → the HUD (shell/boot.ts:949) and the panel's cash readout (shell/panel.ts:154); Observations (observations.ts:89). Engine messages compose number slot 0 from it (`numberSubstitutions`, channel.ts:150), but only messages 17–21 have a number slot, and no engine path shows them: Room entry messages are 9 and 15, dark/locked/refusal are 1/0/57, the endgame's are 48/49, too-heavy is 2, and slots 17–21 have flags 0, so no description.
- **Engine writers:** the seed only.

Used by both. **Keep in engine.** The display reads it every frame, and Talk already reaches it through queries and commands. The one improvement is to move it out of `decimals` into a named session field when the Benson host is retired (see below). That is a storage change, not a Talk one.

## Other rule and narrative facts

| State | Storage | Talk | Engine | Recommendation |
| --- | --- | --- | --- | --- |
| `shipInbound` | `benson.host` | `sendShip` writes 255 (host.ts:665), commerce.talk:40 | Ship Delivery steps it at 50 Hz (index.ts:2822–2879); Observations | **Keep as-is**: a command into the simulation. |
| `attackingShip` (Attack State) | `benson.host` | `sendAttacker` (659): commerce.talk:62, reactions.talk:69 | `advanceHostile` reads it (2559) and clears it (2417, 2627) | **Keep as-is.** |
| `endingPhase` | `benson.host` | `escape` writes 1 (586), escape.talk:60 | The terminal field writes 255 (2792); `endingStateOf` (3009; session/ending.ts:36); shell/boot.ts:983–992 | **Keep as-is.** The Escape's own progress (the epilogue lines) is already the Run's continuation. |
| `messageInterval` | `benson.host` | `setMessageInterval` (680), escape.talk:62 | `BensonChannel.showText` (channel.ts:143) | Keep: presentation. |
| `residence` | `snapshot.residence` | `lies` (607), `carries` (520), `move` (621) at reactions.talk:91 | Owned by the session | Keep. Where things are is simulation. |
| `rewired` | `snapshot.rewired` | — | `applySpecialSetup` writes it (index.ts:1607); `doorwaysOf` reads it (1623) | **Keep as-is**: engine only, Doorway geometry. |
| `game.poweramp` | `snapshot.game` | — | Derived each frame from the Carried Stack (index.ts:2244–2249) | Keep; it is derived. |
| `game.worldFlipped` | `snapshot.game` | — | index.ts:1617–1618 | Keep. |
| Faction counters, `siteTable` | `snapshot.combat` | Heard as `destroyed`/`gratitude` events; `advertIntact` reads `destroyedBlocks` | Site Ledger (session/sites.ts) | Keep: bit-exact, observed. |
| `canLiftAnything`, `canTakeAnything` | `benson.host` | — | Read by interaction/index.ts:113, 149; **no writer in `web/src`** | Keep, or drop with the Benson host. Vestigial: the Benson Script that set them is gone (no `BensonSymbol` names them). |
| `signedRegister`, `tickCounter`, `messagePlaying` | `benson.host` | — | Channel bookkeeping (channel.ts:128, 137, 145) | Keep or drop with the Benson host. Not story. |

## Simulation state that stays in TypeScript

- **`game` (player, flight, `mover`, `touchdown`, cooldowns, wall contact, `colonyCraftFlag`).** 50 Hz flight and walking, checked bit for bit against the Golden Traces (ADR 0029) and the lab's Observations.
- **`combat`.** The Site Ledger, projectiles and the attacker, stepped per frame and checked against the Reference Build. Its counters decide gratitude.
- **`liftJourney`.** A frame-stepped presentation with fractional remainders.
- **`ending`.** The terminal field's continuation (`field`, `loops`), raster-derived and stepped at 50 Hz.
- **`deliveryFrames`.** The fractional part of a Ship Delivery frame.
- **`randomState`** (the session's own stream) and `benson.state.randomState` (the shared stream behind `roll`). Replay needs both to be bit-exact. Talk's rolls draw from the second, so their order is part of replay.
- **`residence`, `carriedStack`, `objectFlags` bits 8–128.** Payload-shaped and enforced by the Interaction every frame.

## Summary

| Category | Count | Items |
| --- | --: | --- |
| Move into a Talk Script | 6 | `gratitudeGiven`, `advertDestroyed` (reactions); delivered bit 1 (deliveries); `dartBought`, `shipHired` (commerce); `commanderAnnoyed` (escape or a story script) |
| Keep in engine, Talk uses a query or command (already exists) | 7 | credits, object bit 16 (fixed), object bit 4 (armed), `shipInbound`, `attackingShip`, `endingPhase`, `messageInterval` |
| Keep as-is, engine only | 12 | engine bits 64, 128; object bits 8, 32, 128; `residence`, `rewired`, `poweramp`, `worldFlipped`, combat counters, `canLift/TakeAnything`, host bookkeeping |
| Simulation, stays in TypeScript | 7 | `game`, `combat`, `liftJourney`, `ending`, `deliveryFrames`, both random states |

## Migration batches

Each batch is one PR. They share three needs.

**How old Saves carry the value over.** The Talk part of a Save is NorthTalk's opaque snapshot, so a Save migration in `save.ts` can't write a Script Variable into it. `@northtalk/ts` 0.4.0's type declarations show no host-side setter on `TsGroup`; only a read from a Session Host snapshot (`session.d.ts`, `Names.variable`). That is **unverified** beyond the `.d.ts` scan. The proposal is a **lazy seed**:

- Declare `script variable gratitudeGiven = nothing`. A changed script reloads with its variables carried, and a new variable takes its default (ADR 0080, "Saves").
- On first read, if it is `nothing`, the script asks `world to takeLegacyFlag "gratitudeGiven"`. The host returns the old bit and clears it in `engineFlags`, and the script stores the answer. A fresh game answers false. So does a schema-14 Save, whose `talk` is `null` and whose scripts load without `begin` but still read the bit.
- Once every engine bit has moved, a schema bump can drop `engineFlags` from new Saves. The migration keeps reading it for old Saves through the same query, or the query retires with a minimum schema.

**What the engine stops doing.** Remove the name from `FLAGS` (host.ts:75–82). `setFlag`/`flag`/`clearFlag` disappear once `FLAGS` is empty.

**Tests.** Each move needs a restore test: a Save with the old bit set restores with the variable true, and a fresh game has it false. The tests listed above that read `engineFlags` move to outcome assertions, the lines shown, as ADR 0080's "player-visible outcome tests" asks. Observations stop reporting moved bits, so anything comparing `engineFlags` against the lab has to mask them (open question 3).

1. **Reactions' own flags: `gratitudeGiven` and `advertDestroyed`.** Single script, no engine reader. Proves the lazy seed and the restore test. Tests: reactions-talk.test.ts:302 (seeds gratitude through `engineFlags`), site-destruction.test.ts:240.
2. **The delivered mark (object bit 1) into deliveries.talk.** A Script Variable list of delivered item names. Split `deliver` into the engine's fixing (bit 16 stays) and the script's record. The lazy seed reads the old bit per item (`takeLegacyDelivered item`). Tests: deliveries-talk.test.ts, deliveries.test.ts; Observations `objectFlags.<slot>` lose bit 1.
3. **`shipHired`, sent between scripts.** Move `shipHired` into commerce.talk, and have commerce and escape.talk exchange it with `send` (open question 1). Tests: escape.test.ts (seeds `HIRED` through `engineFlags` in several places), hire.test.ts, commerce-talk.test.ts.
4. **`dartBought`.** Into commerce.talk; the opening tells commerce on purchase by the same mechanism. Tests: opening.test.ts:135, commerce-talk.test.ts (`setEngineFlags`, 74–79).
5. **`commanderAnnoyed`.** Owner chosen by open question 2. Three writers tell the owner; escape.talk reads it. Tests: escape.test.ts:594, escape-talk.test.ts:143, opening.test.ts:143–153, commerce-talk.test.ts.
6. **Optional: the Dart's first boarding (object bit 4 on slot 1).** Replace `armed "dart"`/`disarm "dart"` with a commerce variable. Keep the payload bit for the engine's description selector.

After batch 5, `engineFlags` holds only the vestigial bits 64 and 128. A follow-up can retire `BensonHostState`'s story fields, and keep credits, `shipInbound`, `attackingShip` and `endingPhase` as named session fields behind the same `world` operations.

## Open questions

1. **How should scripts exchange a fact with `send`?** Talk Scripts message each other with `send`, not `ask` or `tell`, which address Capabilities such as `world`. Scripts today hear only host Broadcasts (`group.broadcast`, host.ts:334–378), so nothing uses `send` yet. Still to settle: does the reader send a request and wait for a message back, or does the owner send the fact to its readers whenever it changes? The second keeps a copy in each reader, and that copy needs seeding after a restore.
2. **Who owns `commanderAnnoyed`?** The Escape, its only reader, or a dedicated story script that owns every cross-script fact (`dartBought`, `shipHired` and it)? A story script makes the batches 3–5 one mechanism, but it is a script with no behaviour of its own.
3. **The lab comparison.** Observations report `engineFlags` and `objectFlags.<slot>` for comparison with the C64 emulator (`c64lab/benson.py`). Should moved bits be projected back into the observation from the variables, or masked out on both sides? Projection needs a host read of Script Variables.
4. **Retiring the legacy seed.** Is the `takeLegacyFlag` query permanent, or does a later schema refuse Saves older than the move? ADR 0026/0030 favour migrating over refusing.
5. **Should `advertDestroyed` be kept at all?** It has no reader, and `advertIntact` is correct where the flag isn't (restoration).
6. **Credits' home.** Keep in `decimals[8]` until the Benson host is retired, or move now into a named session field? The 10⁸ wrap is the original's (`addDecimal`); is it kept?
