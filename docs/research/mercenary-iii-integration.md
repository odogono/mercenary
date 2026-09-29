# Mercenary III integration: reuse, differences and first playable sequence

Research for [#609](https://github.com/odogono/mercenary/issues/609), 2026-09-29. Compared application revision: `8e46a7679328bc2647503fd460c40319d80b5a5b`. The [confirmed research brief](../plans/mercenary-iii-research-brief.md) governs recommendation strength and the stopping rule. This report admits no implementation, route, shared architecture, payload schema or Save format.

## Recommendation and limits

Damocles is a credible foundation for **selected mechanisms**, with direct evidence for matching arithmetic data, a matching addition routine and recurring craft parameters. It is not yet demonstrated to be a drop-in Mercenary III engine. Passenger travel is a particularly useful counterexample: the original can show the player inside a taxi while the ordinary Mover selector still takes its on-foot branch.

Recommend a sibling Mercenary III Gameplay Session behind the existing Browser Shell boundary as the **planning alternative to evaluate**, with independently identified content and persistence. Share only mechanisms whose bounded claims survive comparison. This is a recommendation for subsequent review, not an ADR extending [ADR 0043](../adr/0043-admit-damocles-play-alongside-the-second-city.md).

The first playable sequence should exercise **TAXICARD activation, calling and entering a taxi, choosing a destination, and completing passenger travel with its observable time and arrival consequences**. The baseline demonstrates both destination choices through completed journeys and on-foot exits. Full service-state, route, economic and persistence recovery remain prerequisites below. A familiar landscape or freely flown craft alone would miss the distinctive player decision agreed in the brief. Deferral remains valid if the blocking recovery cannot bound this sequence.

## Evidence rules

- **Demonstrated** applies to a named data range, meaning or bounded behaviour, never to an entire subsystem by association. Behavioural claims require structural evidence and controlled observations.
- **Plausible** means an identified candidate with evidence still missing. A manual description or familiar name does not establish binary or behavioural compatibility.
- **Incompatible** names a specific conflict, such as a decoder requiring Damocles identity. It does not mean an alternative could never be built.

The **Mercenary III research baseline** below takes precedence for this investigation. **Working Authority** and **Working-Authority Evidence** retain their Damocles meanings. The C64 **Reference Build** is unchanged. Original media, RAM, screenshots and disassembly remain ignored Restricted Material under `restricted/mercenary-iii-609/`; only procedures, hashes and decoded facts enter this report. [ADR 0002](../adr/0002-separate-rom-research-from-implementation.md) continues to prohibit copied or mechanically translated application code.

## Pinned baseline and source inventory

| Input | Identity |
|---|---|
| Mercenary III STX | `Mercenary III.STX`, 512,160 bytes; SHA-256 `4e8b74122910bcaa109b944eebb6f0ec18fdeb1175c34eea3c932d0e1b18b62c` |
| Local source lead | `/Users/alex/work/mercenary/roms/atarist/Mercenary III.STX`; supplied local media, not a portable dependency or independently established release/dump lineage |
| TOS | Existing lab `atarist/tos/emutos206.img`, 1,048,576 bytes; SHA-256 `154803e3ff4851f3dc358b91b16d6b6110d187a81d8132ecb665af49878939d5`; the same lab-pinned EmuTOS image used for Damocles |
| Emulator | Stock Homebrew Hatari 2.6.1, Mach-O `Hatari.app/Contents/MacOS/hatari`; 15,881,424 bytes; SHA-256 `05723606c75a1f0642395974abdce2cbbe48b0a09a747f65cdfca7ef9201e11a` |
| Host | macOS 26.7, build 25G229; headless SDL dummy video/audio |
| Machine | ST, 1 MiB, 68000 at 8 MHz, compatible and cycle-exact CPU, 24-bit addresses, no FPU/blitter, RGB monitor, ws3 video timing; Timer-D patch, fast boot and fast FDC disabled; TOS patches enabled |
| Media/display controls | Write-protected drive A; no drive-B disk, hard disks or extended VDI; sound off; fast-forward on; cropped PNG captures; explicit empty config rather than personal settings |
| Damocles comparison | First-world RAM from `observe-first-world-20260818T101013Z-c5a32b7d/observed.ram`; SHA-256 independently checked as `b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967`; original STX/TOS pins remain in [working-authority.json](../../research/damocles-st/config/working-authority.json) |

The title screen identifies Mercenary III / The Dion Crisis, Paul Woakes, Novagen and 1991. It supplies no independently verified revision or PAL-release identifier. This pins the **available image**, not an assertion that every ST release behaves identically. No other Mercenary III edition or real-TOS configuration was compared.

The existing [STX inventory tool](../../research/damocles-st/scripts/stx-inventory.py) accounts for the entire Pasti v3, revision-2 image: 82 track records, 78 raw-image tracks, two sectored and two unformatted. Its executable boot-sector checksum is `$1234`. Cylinder 1 has a 512-byte fuzzy mask and CRC/unstable-sector indicators. Preserve the STX container; do not treat this as an ordinary sector-only disk. The dump's acquisition history is still unknown. Emulator logs contain boot-time bus/address exceptions, but these runs reach active play; no claim is made that those exceptions are meaningful game behaviour.

### Supporting original documents

These are original Novagen scans hosted by an archive, not archive commentary. Their printing/platform relationship to the pinned STX is unverified, so they establish documentary leads rather than overriding runtime facts. HTTP downloads succeeded; the archive's HTTPS path was unavailable during research.

| ID | Source | SHA-256 of downloaded scan |
|---|---|---|
| M3-23 | [Manual pp. 2–3](http://mercenarysite.free.fr/boxes/m3/mercenary3_manual02.gif) | `d63689514a46d702a60a4c879e3c0821171eb8f399799b9328acbe3bf899fde2` |
| M3-4 | [Manual p. 4, English](http://mercenarysite.free.fr/boxes/m3/mercenary3_manual03.gif) | `b41398c4c8022d0c2292b3984889eaec79c05dfad2b9851fd0e48e3219074406` |
| M3-panel | [Panel guide, pp. 8–9](http://mercenarysite.free.fr/boxes/m3/mercenary3_manual05.gif) | `33cfaf0d6de140f8937ed16b37231452e98fc1d3ea0da2cce7e3a180b9a9af21` |
| M3-keys | [English keyboard summary, p. 16](http://mercenarysite.free.fr/boxes/m3/mercenary3_manual09.gif) | `6e410fad16e39a0149a7b1863d598ce87bbccc2afaab1388c349c4a333a85a9b` |
| M3-outline | [Original outline briefing, English column](http://mercenarysite.free.fr/boxes/m3/mercenary3_brief00b.gif) | `093557b802f888349f085373158aaca0d599061aa72e6f427399000f3521ae3b` |
| M3-transit14 | [Transport leaflet, outer spread](http://mercenarysite.free.fr/boxes/m3/mercenary3_pts01.gif) | `6ec414ef933f99725d8dcb54ba53fb31ba8568fcce32a58d5d419b27e126817d` |
| M3-transit23 | [Transport leaflet, inner spread](http://mercenarysite.free.fr/boxes/m3/mercenary3_pts02.gif) | `b0ca1bd9bee82664329550d4b12c2fb76c5a586246dae2f78edd02e10c004132` |
| D-23 | [Damocles manual pp. 2–3](http://mercenarysite.free.fr/boxes/m2/damocles_manual02.gif) | `d34dc85b46507fc5a22c7806b9410c6ae124ee8f81daa8508ef268dc41f3079a` |
| D-4 | [Damocles manual p. 4](http://mercenarysite.free.fr/boxes/m2/damocles_manual03.gif) | `274e23ffdc6020df0f34a95e7bf0a0b30092c65368cc7bed0f7515c5c704d417` |

Use the original scans rather than typed mirrors: the original best-day target is 500,000,000 within 24 hours, while inspected typed transcriptions lose a zero. Handwritten annotations on transport scans are not original printed evidence. Both games' manuals say the player is never killed; this does not overturn Damocles's recovered death behaviour in [ADR 0055](../adr/0055-run-the-damocles-tolosa-encounter-as-traced-and-kill-the-player-it-zaps.md), or prove Mercenary III's failure rules.

## Whole-title survey

The following separates original-game documentary differences from **current remake capability**. Source IDs refer to the inventory above; code paths refer to the compared revision. Unsurveyed details remain explicit recovery gaps, not claims of absence.

| Area | Original-game comparison / Mercenary III evidence | Current Damocles remake and remaining gap |
|---|---|---|
| Bodies and System | Both manuals advertise nine planets and nineteen moons (D-23, M3-23). MIII runtime begins on METIS and contains a familiar roster string beginning at `$796A`. Names do not establish equal Body values, surfaces or placements. | `world.ts`, `selection.ts` and the Catalogue support Body-aware play. MIII roster meanings, coordinates, System data and geometry coverage require independent recovery. |
| Geometry and interiors | Original manuals describe building exploration and lifts; MIII briefing adds people and political, financial, prison and mining locations (M3-4, M3-outline). Taxi cabin/driver and starting interior are observed. | Current session supports regions, floors, lifts, attachments and wall text. MIII record formats, entrance behaviour, people and placement differences are unproved; current Damocles geometry must not fill MIII gaps. |
| Controls and movement | The manuals describe familiar walking, running, boarding, power and stop controls (D-23, M3-keys). MIII's actual arithmetic/table/dispatch probes are below. | Craft, contact and space movement now exist, including recovered parameters. This is not the early on-foot-only remake described by older issues. End-to-end MIII movement equivalence remains unproved. |
| Occupancy and transport | MIII documents public transport, hiring/purchase and removal of the free Quit craft (M3-23). Runtime taxi entry changes presentation while the normal Mover selector remains on its foot branch. | Damocles's craft/seatable admissions and Vehicle Keys exist. Passenger travel, service choice and delayed disembark rules cannot be assumed to fit those admissions. |
| Objects and economy | Similar carry/use/trade controls are described (D-4, M3-4). MIII transport leaflet requires bus-pass activation. TAXICARD has a live use panel and call action in the baseline. | Carried Stack, take/drop/read and title-specific script effects exist. MIII active-service state, fares, purchases/rental lifecycle and pending transactions need recovery. A pass is not automatically a Vehicle Key. |
| Scripts and progression | Damocles centres on comet impact. MIII outline names election/veto, finance, capture/prison, mining destruction and Battle Craft routes, plus a deliberately unhinted route. These are capability leads, not recovered implementations. | `scripts.ts`/`script.ts` implement a finite named recovered repertoire, not a proven load-any-ST-program VM. MIII dialogue, service and antagonist state remain a major recovery area. |
| Time | Damocles has an impact deadline; MIII panel is elapsed play time (M3-23, M3-panel). Unmodified MIII captures at VBL 6000 and 12000 advance the displayed clock from 25 to 145 seconds. | Existing elapsed/VBL/script/craft mechanisms are useful patterns; an impact-clock meaning is unsuitable. Time during travel, conversation, waiting and pause and event ordering need their own probes. |
| Encounters and failure | Manuals alone cannot establish either game's full failure rules. MIII briefing suggests capture/confinement and several antagonist outcomes. | Current Damocles encounter/death state is implemented from its evidence. MIII damage, capture, recovery and terminal outcomes remain unknown. |
| Presentation | MIII panel documents cash, elapsed time, navigation and environment readouts (M3-panel); observed TAXICARD controls and passenger view add live UI states. | Filled rendering, panel mapping and sound infrastructure exist. Exact MIII font, palette, message timing, panel semantics, people and audio require their own evidence. Sound was disabled in these probes. |
| Persistence | MIII manual describes slots 0–9 (M3-4). It does not establish save-state completeness or prior-title import. | Current `save.ts` is schema 18 and requires literal Damocles identity. MIII service, dialogue, scheduled effects and future-affecting state need a separate inventory and restore tests. |

The transport leaflet lists routes and connections; it does **not** establish periodic departure times. Exact schedules must be observed. Original Damocles lacks the MIII passenger-service story in the compared manuals; that documentary contrast alone is not exhaustive proof of absence in Damocles.

## Targeted Mover probes

### Loading state and repeatability

VBL 3000 shows the title while game loading is incomplete. Searches there found no complete Damocles math-table, float-add or craft-parameter match. A cold boot reaches active play without a Space press by VBL 6000. The apparent initial mismatch was a capture-stage error, not incompatibility.

All six reported math/routine/craft-table ranges are identical across the three loaded captures listed in the evidence ledger below, including VBL 6000 and 12000. Whole RAM is not byte-identical across boots; low machine state and execution position vary. The reproducible claims concern the specified ranges and observed transitions, not a universal whole-machine snapshot hash.

### 1. Branch entries plus craft parameters: demonstrated

MIII's craft table occupies `$56ED6`–`$57016`: ten 32-byte entries, each opening with a word branch to a handler. SHA-256: `85e35e5515aafffb971c8b8f376a0a920654a8f29a9a99ecadcca7ca317f25da`. Damocles has sixteen entries at `$55C80`. Dispatch at `$58D86` indexes MIII's table by slot times 32; handler addresses are common `$5900A`, wheeled `$58EAA`, fall `$58E28`, and space `$59502`.

Readers establish common-pass fields: turn damping `+4` read at `$59046`, acceleration `+8` at `$59066`, pitch step `+C` at `$5908A`, roll exponent `+E` at `$59478`, speed lag `+14` at `$59124`, ceiling `+1A` at `$592F8`, and thrust gain `+1C` at `$590EE`. The zero-pitch distinction is read at `$59368`. This establishes shared meanings for these fields, not only similarly shaped bytes.

### 2. Exponent, logarithm and sine tables: demonstrated data identity

Each half-open range below is byte-identical in the loaded MIII image and the pinned Damocles RAM at the **same address**.

| Range | Meaning | SHA-256 |
|---|---|---|
| `$60000`–`$62000` | Exponent lookup | `f21d7cf049056a87abcb33d18af13b544a50daecb9087cd690f3c63f3698fb6d` |
| `$62000`–`$63002` | Negative normalized-mantissa logarithms, including −4096 endpoint | `79d066dd0f847caa73516119b3b3faaa189e01c18f42f9a23656a50bbaca9ab3` |
| `$64000`–`$65000` | 1,024 half-step sine entries | `79831644423f32a0412588a994c5249b12abd39ceb23dc3130de7440e97495a6` |
| `$65000`–`$66000` | Positive normalized-mantissa logarithms | `2e0d2944a6ed62a211dac1ce8d3acfcb907be0af51cf8f9bfd7527a47cc2ef63` |

The enclosing `$60000`–`$66000` region differs in the gap `$63002`–`$64000`, first at `$63003`. That is not a difference in the lookup domains above. It also does not prove all other data in that gap are irrelevant to all game systems.

### 3. Arithmetic: identical addition routine, eight matching runtime cases

The complete float-add routine `$4BD34`–`$4BDBE` is byte-identical: SHA-256 `f608e622840c587f07f0338e9c1e37255e17b86ca703373ba91d4fa1a571244f`. Its inputs are D1 and D2, its result D2; it clobbers D1/D6/D7 and has no table or other memory input. This is inspected original program material, not code admitted to the app.

An isolated runtime probe cold-boots MIII to VBL 6000, supplies the following packed operands, executes that original routine, and compares D2 to the existing independent [`craftAdd`](../../web/src/damocles/craft.ts). The probe changes registers and a synthetic return stack; it is an arithmetic test, not a natural gameplay trace.

| Case | D1 | D2 input | Original result = current Damocles result |
|---|---|---|---|
| Positive sum | `00001000` | `00001000` | `00011000` |
| Negative sum | `0000f000` | `0000f000` | `0000e000` |
| Cancellation | `00001000` | `0000f000` | `fff01000` |
| Mixed sign | `00011000` | `0000f000` | `00001000` |
| Exponent alignment | `00031000` | `00001800` | `00031300` |
| Gap discards small operand | `00001000` | `000c1000` | `000c1000` |
| Rounding | `00001002` | `ffff1002` | `00001802` |
| Near cancellation | `00001000` | `0000f002` | `fff51000` |

All eight match bit for bit. This demonstrates the bounded addition-reuse claim, including unusual cancellation/rounding results. Multiplication and trigonometric data/reader structure are supported; exhaustive arithmetic, caller contracts and full per-pass craft results were not compared. They retain explicit recovery/test work.

### 4. Aboard cadence: runtime evidence, not a fixed-rate contract

Static decoding finds an ordinary aboard dispatch call at `$5A6B4` and a second call at `$5A6E2` on collision refusal/retry. Foot movement instead uses the `$5A4EC` substep call. The normal Mover selector is `$7142`; its frame copy is `$7122`. A value of 1 takes the foot path, above 1 the space path; zero selects the craft slot at `$7144`, with a negative slot also falling back to foot. **These fields do not completely describe passenger Occupancy**, as the taxi probe demonstrates.

Two controlled probes cold-boot to VBL 6000, then wait for frame root `$5A41A`. They inject synthetic state, preserving original program code, and capture 65 consecutive dispatch entries at `$58D86`. These are not natural boarding routes or proof that either injected pose is a valid player starting state.

Common changes: selectors `$7142`/`$7122` = 0, pitch `$7154` = 511, throttle `$7248` = packed 128 (`$00071000`), turn rate `$7000` and speed `$700A` = packed zero (`$FF001000`), stick `$7056` = 0. X/Z/yaw and other state remain as found. Airborne case: slot 1, Y `$714A` = 131072, contact `$715E` = 0. Ground case: slot 2, Y = 63, contact = 63.

| Case | Measured result | Scope |
|---|---|---|
| Airborne slot 1 | 65 entries, VBL 6002–6258; all 64 frame-counter deltas = 1 and VBL deltas = 4 | One pass per original rendered frame at four VBLs per frame in this scene |
| Ground slot 2 | Same-frame pairs: 32 frame deltas = 0 alternating with 32 = 1; frame-start gaps 10×1, 11×20, 12×5, 13×6 VBLs; throttle/speed mantissas reverse within pairs | A repeat pass occurs on the decoded refusal/retry path; this synthetic ground pose repeatedly exercises it |

Do not carry Damocles's fixed four-tick browser policy into MIII as a recovered fact. VBL tick, original rendered frame and browser-render frame are different units. [ADR 0051](../adr/0051-run-the-damocles-craft-pass-exactly-once-every-four-ticks.md) is a Damocles decision; MIII's rate/adaptation needs its own evidence and later decision. These probes do not establish timings across the whole Title.

### 5. Recurring craft parameters: demonstrated, identities unresolved

Exact equality here covers each entry's 28 bytes after the branch, including currently unread fields. Different branches and roster sizes remain material. Slot names, model associations and boardability have not been recovered.

| MIII slot | Handler | Damping | Acceleration | Pitch | Roll exponent | Lag | Ceiling | Gain | Matching Damocles slot(s) |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---|
| 0 | space | 0.9375 | 1 | 0 | 2 | 0.5 | 90 | 1.5625 | 0 |
| 1 | common | 0.9375 | 1 | 8 | 2 | 0.5 | 900 | 0.78125 | 1, 3 |
| 2 | wheeled | 0.9375 | 1 | 0 | −32 | 0.5 | 90 | 2.40234375 | 2 |
| 3 | common | 0.9375 | 1 | 8 | 2 | 0.5 | 900 | 0.78125 | 1, 3 |
| 4 | common | 0.9375 | 1 | 8 | 2 | 0.5 | 900 | 0.78125 | 1, 3 |
| 5 | common | 0.890625 | 2 | 12 | 2 | 0.75 | 900 | 1.5625 | 12 |
| 6 | common | 0.9375 | 1 | 12 | 2 | 0.5 | 90 | 3.125 | 10 |
| 7 | common | 0.9375 | 1 | 2 | 2 | 0.5 | 900 | 0.78125 | 7 |
| 8 | common | 0.9375 | 1 | 8 | 2 | 0.5 | 900 | 3.125 | 14 |
| 9 | fall | — | — | — | — | — | — | — | 9: raw data only |

The fall handler does not justify assigning ordinary craft-parameter meanings to slot 9's raw data. No model may inherit a Damocles identity just because its parameter bytes recur.

## Representative play probe: TAXICARD and passenger travel

The original manual's keypad-Enter use-panel instruction supplied the initial lead (M3-4, M3-keys). The following actions were then exercised in the pinned ST baseline. Inputs were injected at the game's recovered ACIA key mailbox `$56726` and joystick soft-copy `$7056`; they enter the game's normal input consumer at `$56630`. These are controlled input traces, not host-keyboard timing tests. The natural taxi runs do **not** force money, passengers, route, pose or admissions.

At VBL 6000, the fresh game is on METIS with TAXICARD selected, displayed cash 51,004,000 and clock 25 seconds. Enter opens its use panel. The call action brings a vehicle into view outside the room. Walking through the exit and pressing B changes the view to a cabin and driver, and the panel offers destination selection/start. One keypad-plus selects DOOBERRY'S SOLICITORS; a second selects METIS SPACEPORT. Starting those choices produces different destination coordinates and journeys.

### Input procedure and observed outcomes

Absolute VBLs below start at cold reset, not at first play. Use the same baseline machine configuration. ST scancodes were verified by the resulting panels; the manual supplies key names, not these numeric codes.

| VBL | Input / capture |
|---:|---|
| 6000 | Mailbox `$72`: keypad Enter opens TAXICARD |
| 7300 | Mailbox `$66`: keypad `*` calls taxi |
| 10000 | Stick `$01`: walk forward |
| 10650 | Stick `$00`: stop walking |
| 10700 | Mailbox `$30`: B requests boarding |
| 11600 | Capture boarded state; mailbox `$4E`: keypad `+` selects first destination |
| 11900 | Spaceport branch only: another `$4E` selects second destination |
| 12200 | Capture selected destination; mailbox `$66` starts trip |
| 14000 / 16000 | Capture journey/arrival state |
| 16000 | Solicitor branch: mailbox `$26` (L); capture on-foot result at 16600 |
| 22000 | Spaceport branch: mailbox `$26` (L); capture on-foot result at 22600 |

In `taxi-ride-01`, the solicitor branch has reached raw XYZ `($09DF8080,$0000003F,$04308000)` by VBL 14000 and stays there through 22000; its local panel readout is `00-06`. `taxi-leave-01` repeats that branch and L clears the passenger reference by VBL 16600, restores the ordinary view, and returns the card to its call panel. The displayed balance is unchanged at the observed checkpoints; this does not prove all taxi services are free.

`taxi-leave-02` selects METIS SPACEPORT instead. At VBL 16000 it is still moving: XYZ `($09E34C00,$00000058,$042B8080)`; by 16600, XYZ is `($09E38080,$00000058,$042A9BC7)` and the panel shows `04-00`. An L input at 16000 has **not** cleared the passenger reference at 16600. This is a useful refusal/timing case, not proof of a precise rule about when leaving is allowed. Different destination choice has an actual spatial and journey-duration consequence, rather than merely changing a label.

`taxi-leave-03` repeats the spaceport branch but waits until VBL 22000 before L. It has arrived at XYZ `($09E18000,$0000003F,$042A8080)`; by 22600 the passenger reference is zero, the ordinary on-foot view is restored, and the panel reads `02-00`. The arrival script prompts the next spacecraft boarding action, which is outside this slice. These runs were independent cold boots with the same input sequence, not a claim of byte-identical starting RAM or identical intermediate positions at every VBL.

Earlier approach probes stopped after only 150 or 400 walking VBLs and did not board. The 650-VBL approach with B after releasing movement succeeded. Preserve those failed attempts as evidence about the procedure, not a recovered admission radius.

### A separate passenger reference

The successful natural entry changes `$6EB2` from zero to `$0040`, while `$7142/$7144` remain `$0001/$FFFF`. Static readers corroborate its meaning: `$5191C` follows a resident's position and adjusts heading for references at or above `$40`; `$51A00` writes references for resident indices 16–27 (offsets `$40`–`$6C`); `$5BA24` skips the contact routine while that word is nonzero. The ordinary B craft handler at `$55474` excludes those indices, while the passenger request path at `$519A2` uses request/countdown words `$6EB6`/`$6EB4`.

That combination of player-visible cabin entry, a specific state change, and a pose-following reader establishes a **passenger path separate from the normal craft Mover selection**. It does not establish a complete passenger schema, every service's admissions, or the exact meanings of all request values. Do not redefine Occupancy to equal `$7142`; do not silently broaden Vehicle Key to mean TAXICARD or passenger permission.

## Integration alternatives and reuse classification

[`TitleRuntime`](../../web/src/shell/title.ts) already separates loading, create/restore, panel mapping and storage identity; it has no universal rendering or title-action API, and `TitleSlug` currently admits only `targ` and `damocles`. [`DamoclesTitle`](../../web/src/damocles/title.ts) independently loads content and checks source identities. These are useful established boundaries, not evidence that adding a third enum member completes integration.

| Candidate | Classification and evidence | Remaining condition |
|---|---|---|
| Math lookup data | **Demonstrated** for the four exact ranges and meanings above | Independently extract MIII provenance; sharing storage/implementation still needs review |
| Existing independent `craftAdd` | **Demonstrated within the eight tested operand cases**, supported by exact original-routine identity | Broader arithmetic cases and all relevant caller contracts before claiming a whole numeric layer |
| Craft parameters | **Demonstrated** for listed field meanings and exact matching blocks | Recover model identities, admissions, handlers and full per-pass behaviour; table sizes differ |
| Whole Damocles craft Mover | **Plausible**, with strong structural leads and bounded cadence observations | Controlled state-by-state movement/landing/contact/space comparisons; separate timing decision |
| Browser Shell/TitleRuntime pattern | Existing boundary **demonstrated in current code**; third consumer **plausible** | Explicit admission of `/dion`, route/boot wiring, action/render integration and storage identity |
| Geometry, Catalogue and renderer | **Plausible** structures and pure rendering mechanisms | Independently decode MIII geometry/placements/palette and compare output. `renderer.ts` consumes `ErisFramePlan`, not a generic original-ST display program |
| Object-use and script machinery | **Plausible patterns**, not full bytecode/behaviour compatibility | Recover taxi/service/dialogue operations, waits, triggers and state. Current named scripts are a finite repertoire |
| Reuse ordinary craft admission for all passengers | **Incompatible with observed state interpretation as stated** | Separate passenger requirements first; later interface sharing may still be possible |
| Damocles impact-clock meaning | **Incompatible** with observed MIII elapsed clock | Recover MIII progression/time events and their relationship to travel |
| Direct use of Damocles Save decoder/schema 18 | **Incompatible**: it requires Damocles identity and does not establish MIII state completeness | Separate title identity and recovered restore-complete state; reuse storage patterns where appropriate |

Considered approaches:

1. **Sibling session with selective pure reuse**: recommended planning direction. Preserves live Titles while allowing demonstrated mechanisms to be shared after explicit review. Costs some initial duplication and title adapters.
2. **Generalise DamoclesSession or a universal ST engine now**: premature. It couples clocks, passengers, progression, identity and persistence before those contracts are recovered, and exceeds ADR 0043's accepted sharing. Evidence of identical arithmetic does not justify it.
3. **A separate remake application**: conflicts with the existing one-implementation direction if MIII is admitted; there is no evidence here requiring that cost.
4. **Defer integration**: still legitimate if the bounded taxi sequence's recovery proves too broad. Reconsider after service-state/route/persistence gaps are resolved. There is no evidence for a blanket Damocles-completion gate.

No architecture choice is accepted by this report. [ADR 0021](../adr/0021-unify-mercenary-titles-in-one-independent-implementation.md) binds Damocles only, and [ADR 0041](../adr/0041-partition-titles-under-paths.md) reserves `/dion` without activating it.

## First representative playable milestone

**Proposed scope:** the recovered opening METIS room and necessary streets, TAXICARD and taxi, the two demonstrated destination choices, their journeys and on-foot arrival. Include only the world/interior extent needed to play those journeys honestly. A final world/presentation coverage inventory must bound that extent before implementation.

This exercises on-foot movement, object-use controls, world presentation and title persistence alongside a distinct passenger service whose route is chosen by the player. It does not require a complete MIII campaign or all self-piloted craft. Pure arithmetic reuse can proceed only where the selected sequence actually uses it; isolated craft-probe success is not a reason to add unrelated flight work to this slice.

| Candidate | Evidence / trade-off | Decision |
|---|---|---|
| TAXICARD, two destinations and passenger arrival | Actual opening activation, call, boarding, selected labels and divergent journeys observed | Preferred bounded sequence, subject to the recovery prerequisites |
| Bus-pass activation and next-stop exit | Original transport leaflet directly documents it; no runtime route reproduced here | Useful second service; avoid making a new world/route hunt the first milestone |
| Bil invitation, meeting and Transporter access | Strong narrative consequence supported by manual; grant point, route and access state unobserved | Later candidate with broader multi-Body/script recovery |
| Election and mining veto | Distinctive progression from original briefing | Too much unresolved campaign state for first slice |
| Familiar craft flight or static scenery | Good isolated mechanism tests | Insufficient distinctive play on its own |

Observable acceptance criteria, to be refined against recovered checkpoints rather than invented values:

1. From the recovered opening state, selecting and activating TAXICARD exposes the correct controls; calling, waiting, approaching and boarding produce the evidenced messages, vehicle/cabin views and state transitions.
2. Selecting DOOBERRY'S SOLICITORS versus METIS SPACEPORT produces the corresponding route and distinct final location. Probe waiting with a destination selected but without Start, and use its observed result to define that acceptance case. Characterise any refusal or message gate before codifying it.
3. Passenger pose follows the service; normal craft power/steering cannot be substituted for passenger control. Leaving restores the evidenced on-foot pose and panel only when the recovered rules permit it, including a checked request during travel.
4. Elapsed time, cash, active card, service request and arrival messages match the pinned baseline's recovered rules. The sampled unchanged balance is not a licence to invent a universal zero fare.
5. Save/restore and Session Resume at selection, during travel, while a leave request is pending if supported, and after arrival preserve the same future outcome under the same subsequent inputs/time. Title identity prevents cross-title restore.
6. Required geometry and presentation are recovered or explicitly identified under an accepted presentation policy; missing required content is a blocker. No Damocles placement or model is substituted solely because it looks familiar.
7. Every shared behavioural mechanism has a bounded comparison with provenance; existing Targ traces and Damocles behaviour remain protected. No change to their arithmetic/time models is smuggled in as MIII integration.

The remaining sequence-critical prerequisites are the passenger/service state and route decode, admissions/exit/time edge cases, required content coverage and restore-complete state. The observed journey makes the proposal concrete, but does not complete those prerequisites. If a probe invalidates the proposal, revise or defer the milestone before implementing dependent work.

## Ordered follow-up issue proposals

These are proposals for review, **not created tickets**. Evidence work is separated from implementation; exhaustive recovery and general Damocles completion are not prerequisites.

| Order / ID | Proposed work | Dependencies | Expected output and blocker |
|---|---|---|---|
| 1 / R1 | Recover the two METIS taxi journeys and passenger state | This pinned baseline and input procedures | Decode service/admission/selection/start/exit and message gates; identify resident references, requests, route progress, time/cash effects; turn the observed full journeys into state-level comparisons. Blocks final slice contract if it contradicts observed assumptions |
| 2a / R2 | Recover the taxi slice's content and presentation | R1's bounded routes; baseline inventory can begin now | Independently extracted required models, placements, interiors, text/panel/driver and sound facts with coverage gaps and provenance; no borrowed Damocles world data |
| 2b / R3 | Recover taxi persistence and future-affecting state | R1 | Restore comparisons at selected/in-transit/pending-exit/arrived checkpoints, including service and script state; blocks Save/Resume implementation |
| 2c / R4 | Validate selected reusable mechanisms and feed #419 | Current arithmetic/table findings; specific mechanism needs from R1/R2 | Broader arithmetic and relevant movement/geometry comparisons, craft-versus-passenger admission matrix, explicit unsupported claims. Full self-piloted flight is not a taxi-slice gate unless evidence makes it one |
| 3 / D1 | Review admission, milestone bounds and shared seams | R1–R4 to the extent required by the selected sequence | Accept a bounded plan or defer; create an ADR only for a consequential accepted architectural trade-off. Record any MIII timing adaptation explicitly |
| 4 / I1 | Admit title identity and bounded content/runtime adapters | D1, required R2 coverage | `/dion` boot/content boundary, distinct Save/Resume identity and shell integration; no implementation ticket before findings review |
| 5 / I2 | Implement and validate representative taxi play | I1, R1–R3 and accepted R4 claims | Both choices, passenger progression/exit, time and restore acceptance; no campaign completion requirement |
| Later / R5 | Survey deeper progression and other services | Independent where possible; first-slice lessons inform priorities | Bus/flight/Transporter rules, dialogue, election/economy/confinement/mining/encounter/time state. Ordered by actual dependencies, not one enormous whole-game decoder |

### What this contributes to #419

[#419](https://github.com/odogono/mercenary/issues/419) says Damocles has no Craft Parameter Blocks and seven boarding guards. That account is stale: [`craft.ts`](../../web/src/damocles/craft.ts) consumes recovered `CraftParameters`, and [`session.ts`](../../web/src/damocles/session.ts) documents eight ordered boarding checks plus a death refusal. Current space/launch work and Save schema 18 also postdate historical scope descriptions.

MIII now supplies the missing third-title data point: matching arithmetic and recurring parameters support investigating selected pure reuse. Natural taxi entry simultaneously shows why a common boarding function cannot be inferred from craft similarity. #419 should compare self-piloted craft, seatable objects and passenger services separately, including keys/access, refusal order, pose ownership and leave behaviour. Its Targ trace protection and explicit convergence decision remain necessary. No boarding convergence is performed here.

## Remaining uncertainty and stopping decision

No full geometry/VM/progression decode, audio capture, MIII original-save analysis, ordinary craft take-off/landing/space route, or all-release equivalence claim was attempted. These are visible gaps, with the slice-relevant ones assigned prerequisites above. The whole-title survey covers each requested area, the initial five consequential Mover probes have bounded results, and actual passenger play supports comparison of candidate milestones. Further depth belongs to the ordered recovery work rather than silently expanding this roadmap issue into full recovery.

The deliverable supports a **conditional integration recommendation**. It does not authorise implementation before findings review, and it does not make an unresolved service/persistence hypothesis safe merely by documenting it.

## Reproduction and evidence ledger

All addresses are hexadecimal; binary words/longs are big-endian. Source ranges are half-open. Research used Python 3.13.15, Node 26.10.0 for the existing `craftAdd` comparison, and Capstone 5.0.7 in M68K/68000/big-endian mode for targeted original-program inspection. Disassembly output stays restricted. The input files need to be supplied locally with the hashes above; no repository checkout is expected to contain original media.

### Cold boot and controlled probes

The following standalone recipe recreates the successful method without relying on untracked helper scripts from this worktree. Set `M3_ROM_ROOT` to a directory containing `atarist/Mercenary III.STX` and `atarist/tos/emutos206.img`; optionally set `M3_HATARI` to the pinned Mach-O. Set `M3_PROBE` to `boot`, `taxi-solicitor`, `taxi-spaceport`, `float-add`, `cadence-air` or `cadence-ground`. Run from the repository root. It writes a new ignored evidence directory and prints its path.

```python
import hashlib, json, os, subprocess, tempfile
from pathlib import Path

roms = Path(os.environ['M3_ROM_ROOT']).resolve()
disk = roms / 'atarist/Mercenary III.STX'
tos = roms / 'atarist/tos/emutos206.img'
hatari = Path(os.environ.get('M3_HATARI',
    '/opt/homebrew/Cellar/hatari/2.6.1/Hatari.app/Contents/MacOS/hatari'))
pins = [(disk, '4e8b74122910bcaa109b944eebb6f0ec18fdeb1175c34eea3c932d0e1b18b62c'),
        (tos, '154803e3ff4851f3dc358b91b16d6b6110d187a81d8132ecb665af49878939d5'),
        (hatari, '05723606c75a1f0642395974abdce2cbbe48b0a09a747f65cdfca7ef9201e11a')]
for path, digest in pins:
    assert hashlib.sha256(path.read_bytes()).hexdigest() == digest, path
kind = os.environ.get('M3_PROBE', 'boot')
assert kind in ('boot', 'taxi-solicitor', 'taxi-spaceport',
                'float-add', 'cadence-air', 'cadence-ground')
root = Path('restricted/mercenary-iii-609').resolve()
root.mkdir(parents=True, exist_ok=True)
run = Path(tempfile.mkdtemp(prefix=kind + '-', dir=root))
def script(name, lines):
    path = run / (name + '.ini')
    path.write_text('\n'.join(lines) + '\n')
    return path
def bp(condition, name):
    return f'b {condition} :trace :once :quiet :file {run}/{name}.ini'
def capture(name):
    return [f'savebin {run}/{name}.ram 0 $100000',
            f'screenshot {run}/{name}.png', 'r']

if kind == 'boot':
    script('first', capture('loaded') + [bp('VBL = 12000', 'end')])
    script('end', capture('later') + ['quit'])
elif kind.startswith('taxi-'):
    steps = [(6000, ['w $56726 $72']), (7300, ['w $56726 $66']),
             (10000, ['w $7056 $01']), (10650, ['w $7056 $00']),
             (10700, ['w $56726 $30']),
             (11600, capture('boarded') + ['w $56726 $4e'])]
    if kind == 'taxi-spaceport':
        steps += [(11900, ['w $56726 $4e'])]
    steps += [(12200, capture('selected') + ['w $56726 $66'])]
    leave = 22000 if kind == 'taxi-spaceport' else 16000
    steps += [(leave, capture('arrived') + ['w $56726 $26']),
              (leave + 600, capture('left'))]
    for i, (vbl, lines) in enumerate(steps):
        tail = ([bp(f'VBL = {steps[i+1][0]}', f'step-{i+1}')]
                if i + 1 < len(steps) else ['quit'])
        script('first' if i == 0 else f'step-{i}', lines + tail)
elif kind == 'float-add':
    cases = [(0x1000, 0x1000), (0xf000, 0xf000), (0x1000, 0xf000),
             (0x11000, 0xf000), (0x31000, 0x1800), (0x1000, 0xc1000),
             (0x1002, 0xffff1002), (0x1000, 0xf002)]
    for i, (a, b) in enumerate(cases):
        script('first' if i == 0 else f'case-{i}',
               [f'r d1=${a:08x}', f'r d2=${b:08x}', 'r a7=$ff000',
                'w $ff000 $00 $0f $00 $00', bp('pc = $f0000', f'result-{i}'),
                'r pc=$4bd34'])
        tail = ([f'parse {run}/case-{i+1}.ini']
                if i + 1 < len(cases) else ['quit'])
        script(f'result-{i}', ['r'] + tail)
else:
    ground = kind == 'cadence-ground'
    mods = {0x7142:'0000', 0x7122:'0000', 0x7144:'0002' if ground else '0001',
            0x714a:'0000003f' if ground else '00020000', 0x7154:'01ff',
            0x715e:'003f' if ground else '0000', 0x7248:'00071000',
            0x7000:'ff001000', 0x700a:'ff001000', 0x7056:'00'}
    script('first', [bp('pc = $5a41a', 'inject')])
    writes = [f'w ${a:x} ' + ' '.join('$'+v[j:j+2] for j in range(0,len(v),2))
              for a,v in mods.items()]
    script('inject', capture('before') + writes + [bp('pc = $58d86', 'hit-0')])
    for i in range(65):
        lines = ['e VBL', f'savebin {run}/state-{i:03}.bin $7000 $280',
                 f'savebin {run}/clock-{i:03}.bin $5301c $80']
        if i == 64:
            lines += capture('after') + ['quit']
        else:
            lines += [bp('pc = $58d8c', f'hop-{i}')]
            script(f'hop-{i}', [bp('pc = $58d86', f'hit-{i+1}')])
        script(f'hit-{i}', lines)

boot = script('boot', [bp('VBL = 6000', 'first'), 'c'])
config = run / 'empty.cfg'
config.write_text('')
args = [str(hatari), '--configfile', str(config), '--tos', str(tos),
        '--machine', 'st', '--memsize', '1', '--cpulevel', '0', '--cpuclock', '8',
        '--compatible', 'true', '--cpu-exact', 'true', '--addr24', 'true',
        '--fpu', 'none', '--blitter', 'false', '--monitor', 'rgb',
        '--video-timing', 'ws3', '--timer-d', 'false', '--fast-boot', 'false',
        '--fastfdc', 'false', '--disk-a', str(disk), '--disk-b', 'none',
        '--drive-b', 'false', '--protect-floppy', 'on', '--sound', 'off',
        '--statusbar', 'false', '--drive-led', 'false', '--crop', 'true',
        '--screenshot-format', 'png', '--fast-forward', 'true',
        '--confirm-quit', 'false', '--alert-level', 'fatal', '--log-level', 'warn',
        '--parse', str(boot)]
(run / 'command.json').write_text(json.dumps(args, indent=2) + '\n')
with (run / 'hatari.log').open('w') as log:
    subprocess.run(args, stdout=log, stderr=log, check=True, timeout=120,
                   env={**os.environ, 'SDL_VIDEODRIVER':'dummy',
                        'SDL_AUDIODRIVER':'dummy'})
print(run)
```

For the earlier spaceport leave probe, replace its leave VBL with 16000. Capture while still travelling and again at 16600. Do not label that latter image a completed arrival. The successful spaceport sequence above uses 22000/22600.

### Reading the results

- **Static probes:** validate the Damocles whole-RAM hash, then compare/hash the listed slices against `loaded.ram` and `later.ram`. For each MIII slot compare bytes `[0x56ed6 + 32*s + 4 : 0x56ed6 + 32*s + 32]` to the corresponding Damocles `[0x55c80 + 32*d + 4 : 0x55c80 + 32*d + 32]`. Decode branch destinations as entry address plus 2 plus signed big-endian displacement at `+2`. Inspect readers before assigning field meanings; the locations are specified above.
- **Arithmetic:** `hatari.log` contains eight register blocks. Compare D2 in order against the eight expected words in the table, and against `craftAdd(a,b)` imported from `web/src/damocles/craft.ts` at the compared revision. A result match is not an exhaustive numeric proof.
- **Cadence:** frame counter `$7180` is at offset `$180` of each `state-NNN.bin`; read it as unsigned big-endian word and subtract successive values modulo 65536. Parse each `e VBL` result from the log. Selector and slot are at offsets `$142`/`$144`; contact at `$15E`. Group same-frame entries before computing frame durations. The 65 entries are bounded samples; scene changes can change the observed distribution.
- **Passenger:** inspect `$6EB2`, selectors `$7142/$7144`, XYZ `$7146/$714A/$714E` and the screenshots. The cabin/driver, selected destination, arrival and return to ordinary view provide observable checks independently of the inferred state fields. Record elapsed-clock and balance changes; do not derive a full service contract from a screenshot alone.
- **Container:** run `python3 research/damocles-st/scripts/stx-inventory.py --stx "$M3_ROM_ROOT/atarist/Mercenary III.STX" --json`; keep output with the run metadata. Download original scans by the exact URLs above, verify their hashes and inspect the specified page/column.

Two unsuccessful automation methods matter for repeatability. Early `--memstate` trials restored Hatari's `.sav.debug` breakpoint sidecar and stalled at its breakpoint; later FIFO trials also failed to advance nested callbacks. The successful recipes cold-boot and use `:trace :once :quiet :file`. Without `:trace`, a nested callback can enter the interactive debugger despite a `c` command. These failures concern the harness, not MIII compatibility. Capturing only the title stage likewise gave a false-negative table search; wait for loaded play.

### Recorded artifact identities

Paths below are relative to the ignored `restricted/mercenary-iii-609/` directory. They identify the inspected artifacts, not expected whole-RAM hashes for every replay. The stable data hashes and behavioural bounds above are the reproducibility assertions. Raw captures and logs remain local; a fresh researcher can recreate them using the pinned media and recipe.

| Artifact | SHA-256 |
|---|---|
| `cold-01/ram.bin`, VBL 3000 | `1ee47911d9e4a8baa926b7ba3aa0a21028749261c6ce054ae9af1f5f3aca19af` |
| `cold-02/ram.bin`, VBL 3000 | `ae16eed5e336dc50309240fd7148f8a935fe7e8971f137e6a809507d06e7efba` |
| `loaded-01/ram.bin`, VBL 6000 | `775a8efd025f2a7d705b673223a66a14290b920348fc1d6f23698d7c2996d131` |
| `chain-trace-01/middle.ram`, VBL 6000 | `673261312bc35f90a7fbb3db40dbb21f5f277f075397f14a35f7755301887d14` |
| `chain-trace-01/ram.bin`, VBL 12000 | `894270a0ecff4ededb4fdec1d56c22d04ed98b0244ae4c42eefd305b01b1d2b1` |
| `float-add-01/comparison.json`, eight matching cases | `67b6339745fa73c183e69d17adcb1a67da9867a335592b63c02ce30932d67617` |
| `cadence-01/after.ram`, synthetic airborne | `bb346d2f1b0c5e007cb858644aff879b09ba638316a86102d0342650299becb0` |
| `cadence-02/after.ram`, synthetic ground | `08c7495b8546399768e9d771ef597df8c957dcee0c907eb110acda9a507e1150` |
| `taxi-approach-03/walked.ram`, before passenger entry | `f7b3a3e21325fd76685a047c92dbd4f43f8943eec6a93a2e550bddacfb84428b` |
| `taxi-approach-03/board-result.ram`, cabin/driver | `d31bf9f856f0fc82df1ee4a2cbb44167af81f488daa9cfbc6c1cfa1ef5e7f8c4` |
| `taxi-ride-01/selected.ram`, solicitor selected | `fbc023c8c03999ab57a663cf31b2b80c19981af8264a107604146b5aa430e2b4` |
| `taxi-leave-01/left.ram`, solicitor exit | `09b24ee597a0aa26c500bb2121e5e68b14f7077d086d73f8748362be6f85ad57` |
| `taxi-leave-02/selected.ram`, spaceport selected | `4cfe1f0b6ab8c19ac3c797e511cbcba0faf7e3f23167f3a86c8d111c53d80f9c` |
| `taxi-leave-03/before-leave.ram`, spaceport arrival | `bba46235ea8f6e46ccfa3ad0186b20300554b525c6b4b8025f0dd26fa8142576` |
| `taxi-leave-03/left.ram`, spaceport exit | `7a9b3bbf28a8d045b0faa005e60ff0cb4197303614d2fcf6f1581949dfd436d5` |

The accompanying [cross-title Mover note](craft-mover-across-titles.md) now points here rather than describing MIII as wholly unexamined. No glossary broadening or new architecture ADR is implied by these research findings.

The embedded recipe was exercised again for `boot`, `float-add`, both cadence cases and `taxi-spaceport`: stable routine/table hashes, all eight addition results, the two frame-entry patterns and the spaceport on-foot exit reproduced. Artifact digests and local document links were checked. Application tests were not rerun because this change contains documentation only; those research checks do not claim a newly implemented MIII runtime.
