# Mercenary III: taxi night transition and bounded sky presentation

Research for [#646](https://github.com/odogono/mercenary/issues/646), 2026-10-01. This closes the required original-engine night/sky recovery commissioned by the [D1 milestone](mercenary-iii-taxi-milestone-review.md), alongside [R1 journeys](mercenary-iii-taxi-journeys.md), [R2 presentation](mercenary-iii-taxi-content-presentation.md), [R3 persistence](mercenary-iii-taxi-persistence.md) and [R4 mechanisms](mercenary-iii-shared-mechanisms.md). It extends the pinned **Mercenary III research baseline**, not Damocles **Working Authority**. [ADR 0002](../adr/0002-separate-rom-research-from-implementation.md) governs the evidence boundary; [ADR 0058](../adr/0058-run-mercenary-iii-at-50-hz-with-a-confirmed-fixed-frame-cadence.md) governs the adopted timing adaptation.

No application/runtime, Data Payload, payload-schema or Save-format change is proposed. Original media, RAM, emulator states, screenshots, logs, pixel positions and disassembly remain ignored Restricted Material under `restricted/mercenary-iii-646/`. The tracked [probe](../../research/damocles-st/scripts/mercenary-iii-taxi-night-sky.py) embeds no original bytes or geometry, cold-boots locally supplied pinned media, and writes captures only to a git-ignored directory.

## Findings

1. **The day test is confirmed, with an essential correction to R2.** METIS adds **$000003B0 to a long phase per VBL**; the day test uses its **high word**, not a word advancing by $3B0. During these taxi journeys it also uses cached coordinate steps, rather than freshly deriving them from the taxi's current position. Resetting latitude or the phase changes the restored sky; reconstructing the steps from arrival XYZ changes their values.
2. **Every VBL 17850–17900 was captured on both natural 60 Hz journeys.** The extended window is 17820–17900: 81 observations per route, with player X, full phase, cached coordinate steps, longitude/latitude, day, sky, palette and cycle phase. All 18 post-test observations agree with the decoded rule. A single VBL observation per route precedes that VBL's day commit and sees the old day flag with the new longitude. This is frame ordering, not a failed rule.
3. **A flip VBL is not universal.** From one restored NTSC baseline, the solicitor commits night at 17852 and the spaceport at 17847, owing to their frame sampling. A fresh portable spaceport cold boot commits at 17861. Under the synthetic **50 Hz, exactly eleven ticks/frame** probe, both commit at 17074. These are separate measured trajectories, not interchangeable acceptance deadlines.
4. **MIII stars are recovered and checked against both original journeys.** The MIII-specific routine, colour bank and yaw-indexed list were independently bounded and hashed. At on-foot night exits, all 44 solicitor and all 49 spaceport predicted star pixels match their exact coordinates and colours. Cabin views expose 20 matching stars on each route; the cabin covers the remaining predictions. The same counts agree under the adopted timing probe.
5. **METIS contributes no island silhouette geometry in this slice.** The original island/classification pass was decoded far enough to resolve its actual METIS descriptor and draw list: zero projected vertices and zero draw commands. The outdoor view still has its original sky/land fills and occupied-cell geometry. No Damocles island, mountain or horizon model is admitted by resemblance.
6. **Window changes depend on the occupied palette.** The solicitor's palette has five black-by-day/white-by-night entries. The spaceport arrival palette has equal day/night halves, so its windows do not acquire an invented colour flip. Sky selection and star enablement still change there.
7. **Original-engine restore evidence closes this research gate.** Twelve restore/perturbation cases distinguish required phase/coordinate state from reconstructible day/sky/palette/longitude. They do not prove a portable browser Save or Session Resume complete. I2 must implement and validate these facts under its fixed simulation phase.

## Pins and observation phases

The three pins were verified before emulator work:

| Input | SHA-256 |
|---|---|
| Mercenary III STX | `4e8b74122910bcaa109b944eebb6f0ec18fdeb1175c34eea3c932d0e1b18b62c` |
| EmuTOS `emutos206.img` | `154803e3ff4851f3dc358b91b16d6b6110d187a81d8132ecb665af49878939d5` |
| Hatari 2.6.1 Mach-O | `05723606c75a1f0642395974abdce2cbbe48b0a09a747f65cdfca7ef9201e11a` |

The original-engine configuration is the [integration recipe](mercenary-iii-integration.md#cold-boot-and-controlled-probes): ST, 1 MiB, 68000, cycle exact, RGB, WS3 video timing, 8 MHz and sound off. Disassembly used Capstone 5.0.9; optional screenshot checks used Pillow 12.3.0. The CPU/render work and resulting frame phases belong to the emulator baseline, not to a browser timing model.

**Natural 60 Hz controls.** Both begin from R4's NTSC `B0`, VBL 5994, phase `$00125280`; its opening-script start was VBL 4734. The inputs use R4/R3's offsets from this baseline: Enter immediately; call +1296; forward +3996 to +4646; B +4696; selection +5596, additional selection +5896 for spaceport; Start +6196. These presentation trajectories leave at +16000, after dwell. Their capture filenames retain R2's historical nominal labels and the scheduled callbacks subtract six ticks to align the input offsets. **A filename such as `v17850` is not an assertion that capture happened at VBL 17850**: `e VBL` in the callback records its actual loop-top time. The dense comparison uses the actual VBL printed at the VBL interrupt, not those filenames.

**Dense observation.** `$53164` is sampled immediately after the VBL handler has advanced all body phases, before subsequent frame work. Separate probes at `$50B4C` (day return) and `$50B62` (night return) observe the completed test. Each callback prints VBL, cycle counter and the fields listed below. Extending the requested window to 17820 catches the spaceport's earlier frame commit without dropping any of the required 51 VBLs.

**Adopted-cadence control.** Both begin from R4's PAL `B0`, VBL 5204, phase `$00124010`, opening-script start 3949. As in [#642](mercenary-iii-taxi-cadence.md#baseline-and-method), the debugger sidecar sets 32 MHz, forces 50 Hz with `$FF820A=$02`, and uses the authored wait instrumentation at `$F0000` to make each frame exactly eleven VBLs. It is synthetic original-engine instrumentation. Walking is released after 61×11 ticks and B follows 50 ticks later; inputs otherwise keep the baseline-relative offsets. All sampled `$5301E` frame deltas are eleven. This verifies the sky rules at the adopted cadence; it does not reinterpret original CPU work as eleven ticks or identify this STX as originally PAL.

**Portable cold boot.** The tracked capture command also completed without an ignored snapshot. Its opening-script start is VBL 4745, cycle 634006068, phase `$00002FF0`. Its fresh spaceport baseline at the first loop at/after 5994 has phase `$00122DA0`, rather than the restored control's phase. The nine completed tests in its dense window all agree with the rule; night commits at 17861. The two on-foot exit screenshots have the same star field at their unchanged yaw/pitch. The boot-phase difference is retained as evidence, not normalised away.

## Decoded night rule

Addresses are hexadecimal, memory big-endian, ranges half-open. The VBL body-clock loop `$53144..$53164` adds each of 32 **long** rates at `$7AEA+4i` into its **long** phase at `$575A+4i`. METIS is index 15: rate `$7B26=$000003B0`, phase `$5796`. Only the low ten bits of the phase's high word enter the longitude. One visible turn is `$04000000` phase units; the full phase wraps at 2³².

The general pose setup `$5A27C..$5A2B6` writes:

```text
stepX      = (signed(X high word) >> 2) & $3FF
latitude   = ((signed(Z high word) >> 2) + $100) & $3FF
longitude  = (stepX + (METIS phase >> 16)) & $3FF
```

But the taxi follows the on-foot surface-frame path. Its loop `$5A542..$5A552` recomputes longitude from **cached `$70B4`** and the current phase high word. It does not update latitude `$42C70`. The body setup and ordinary craft path update coordinate caches; the taxi's service-owned position changes do not do so on each taxi frame.

For both recovered journeys, cached stepX is `$278`, biased latitude is `$20C`, and sub-stellar longitude `$7052` is `$234`. Solicitor arrival X is `$09DF8080`, whose fresh stepX would be `$277`; spaceport X is `$09E18000`, but freshly deriving its latitude yields `$20A`. Neither fresh coordinate calculation is the observed taxi cache. The parenthetical R2 formula using the current X for every frame is therefore incomplete for passenger play.

The exact test `$50B10..$50B64` is:

```text
longitude = (cachedStepX + (phase >> 16)) & $3FF
isDay = (((($7052 - longitude + $100) & $200) + cachedLatitude) & $200) != 0
```

For these caches it changes at longitude `$335`, which first requires phase high word `$BD`. The low phase word determines when that carry happens: VBL 17844 in the restored NTSC baseline and 17059 in the PAL baseline. A frame then samples the phase and commits its day test after its wait. The cached longitude and day flag can therefore temporarily describe different stages of a frame.

| Selected dense observations | Player X | Phase after VBL increment | Longitude | Day flag at observation | Completed test |
|---|---|---|---|---|---|
| Both routes, 17820 | Solicitor `$09DF8080`; spaceport `$09E18000` | `$00BCAAE0` | `$334` | `$FFFF` | Day |
| Spaceport, 17847 | `$09E18000` | `$00BD0E70` | `$335` | `$FFFF` before test | Night at 17847 |
| Both routes, 17850 | As above | `$00BD1980` | Solicitor `$334`; spaceport `$335` | Solicitor day; spaceport night | Separate sampled frames |
| Solicitor, 17852 | `$09DF8080` | `$00BD20E0` | `$335` | `$FFFF` before test | Night at 17852 |
| Both routes, 17900 | As above | `$00BDD1E0` | `$335` | `0` | Night |

The VBL observation disagrees with the *already updated cached-longitude test* exactly at 17847 on the spaceport and 17852 on the solicitor. In each, the post-test callback later in the **same VBL** reports the correct night flag. The remaining 160 extended-window observations agree. All nine post-test probes per route agree. Under exactly eleven, both post-test sequences are day at 17052/17063 and night at 17074/17085/17096; all ten agree.

The two branches jointly select:

| State | `$70E4` | Sky `$7324` | Active palette low word `$70A6` | Star pass on METIS |
|---|---|---|---|---|
| Day | `$FFFF` | `$6FD6=$0355` | `$70AA` | Suppressed |
| Night | `0` | `$6FD8=$0011` | `$70A8` | Enabled |

Body-atmosphere byte `$6FDD` is nonzero on METIS. The extra day flag `$7182=$20` is set only when that body flag is nonzero; night clears it. Indoor regions retain their region colours for the visible fill even though the day/palette test still runs. There is no independent star timer or window timer.

## Star data and drawing

The recovered MIII main star pass is `$50B66..$50C2A`. Its day/atmosphere guards, yaw index, pitch arithmetic, colour selection, row clip and pixel dispatch were decoded from the MIII RAM, then checked against its own screenshots. No Damocles routine or data is used as the authority for these facts.

- The table at `$5D8C0` begins with 1,024 unsigned word byte offsets, one per yaw step. Every index points to the first star whose column is at least `floor(2 × yaw × $E10E / 65536)`.
- Records are unsigned word pairs: column plus packed row/colour. There are 1,600 stars below column 1800, followed by 268 duplicates of the first records with column +1800. This covers the 320-column view across yaw wrap. The bounded list and all 1,024 index invariants pass inspection.
- The row occupies the low nine bits of the second word; its colour index occupies bits 10–13. The 16-entry colour bank is at `$50D26`, four bytes per entry, colour in the low word. The four distinct literal colours are `$777`, `$411`, `$246` and `$322`. Palette-slot allocation remains original-engine work; the independent presentation facts are the resulting colours and one-pixel positions.
- At the exposed viewport, star x is `column - scroll`, where `scroll = floor(2 × (yaw & $3FF) × $E10E / 65536)`. The routine's intermediate x is reversed; the pixel dispatch reverses it back. Treating the intermediate as screen x mirrors the field and fails the screenshot check.
- The row is `(packed & $1FF) - floor(signed16(4 × ((pitch & $3FF) - $128)) × $6CCC / 65536)`. The multiplication/sign boundaries are part of the rule. The row is admitted only if it is nonnegative and below `$42C74`.
- The taxi and its on-foot exits use this surface pass, with pitch `$1FF`. Solicitor yaw is 0 and spaceport final yaw `$300`; route turns change yaw and therefore the chosen strip of stars. No taxi-specific randomisation or star movement was found.

| Comparison checkpoint | Solicitor | Spaceport | What it establishes |
|---|---|---|---|
| Opening/reveal/boarding/selection, natural captures | Day; stars disabled | Day; stars disabled | Stars do not appear merely because a cabin is drawn |
| Travel/turn, before night | Day sky `$355`, active day palette | Same sky; occupied palette changes with cells and yaw | Route motion is separate from night |
| Natural nominal `v17500` | Day, 0 star pixels admitted | Day, 0 admitted | Both precede transition; filename is nominal |
| Natural nominal `v17900` and `v18000`, cabin | 44 predictions; 20 exposed exact matches | 49 predictions; 20 exposed exact matches | Positions/colours where the cabin does not occlude them |
| Natural on-foot exit `v22500` | **44/44 exact matches** | **49/49 exact matches** | Full predicted field in both yaw directions |
| 50 Hz / eleven, `v17040` | Day; disabled | Day; disabled | Adopted-cadence pre-transition control |
| 50 Hz / eleven, `v17100`, cabin | 44 predictions; 20 exposed matches | 49 predictions; 20 exposed matches | Same rule/content at adopted cadence |
| 50 Hz / eleven, `v23500`, on foot | **44/44 exact matches** | **49/49 exact matches** | Same full field after exit |

Screenshot comparison uses the pinned 2× viewport at image origin (96,58), checks the 1-pixel logical star sample and its literal RGB colour, and does not count cabin-covered predictions as failures. Palette channel values are 0–7 mapped to multiples of 34 in these Hatari PNGs. Fully exposed exit comparisons make no occlusion allowance. This does not claim complete foreground projection or exact ST rasterisation, which remains [#644](mercenary-iii-taxi-milestone-review.md#commissioned-work-and-gates).

## Horizon/island pass and window palettes

`$571A8..$576A0` performs surface occupancy, island choice, edge classification and projected island drawing. The relevant stages are: test core/Y-high-word and cached occupancy; check nested signed high-word rectangles; choose the nearest descriptor if needed; classify remaining encoded edges; draw each descriptor's point list and primitive list. The nearest-descriptor search uses ten-byte records reached through `$70AC`; source offsets are relative to each descriptor. These are MIII facts, rather than an admission of a sibling island format by resemblance.

METIS's list contains one descriptor at `$631C8`: centre high words `$09DF,$042A`, relative offset `$0142`, identity 3 and ground colour `$0411`; the next descriptor position `$631D2` is the `$8000` terminator. The relative pointer is `$6330A`. Its preceding signed rectangle ranges are `$8000..$7FFF`, covering every taxi checkpoint; its first point is immediately `$8000`, ending the vertex list, and its first draw word at `$6330C` is zero. The classifier resolves core occupancy (`$6F56=0`) and the projected pass has **zero vertices and zero primitives** for METIS. All checkpoint captures retain that descriptor/list identity. This is affirmative empty-content recovery, not a placeholder for missing geometry.

Outdoor frames bind the sky fill to frame palette slot 8 and land to slot 16 (`$70B0=$411` on METIS); road and occupied-cell geometry follow R2. Enclosed prison frames use their scene colours. No extra island line, silhouette or model should be drawn for these journeys. Star row clipping is another piece of presentation state: `$5401A..$54038` selects 68 rows on the core when `$713E` is nonzero and `$6F56` nonnegative, otherwise 136; the captured core star fields use 68. The decoded empty island list does not imply that all sky bodies are absent.

At the solicitor, night palette `$C06C` and day palette `$C098` differ by 44 bytes (22 words). Entries 1, 11, 14, 17 and 18 change from day `$8000` (frame black) to night `$0777` (white); their tokens are `$8082`, `$8096`, `$809C`, `$80A2` and `$80A4`. The active palette switches from `$C098` to `$C06C` at the completed night test. A same-position, same-yaw on-foot control obtained by restoring the night exit and resetting only the METIS phase back to a day value produces four white-to-black foreground pixels in the solicitor view (logical x163–164, y65–66), alongside the changed sky and removed stars. This is a limited visible palette sample, not a census of building windows.

At spaceport arrival `$70A8=$70AA=$CE44`. Its active palette does not change its colours when day becomes night; the same-position control has no corresponding white-to-black sample. Other occupied structures with distinct halves use their own palettes. Acceptance must assert each recovered palette's colour rule, rather than forcing every building/window to change everywhere.

## Required state and reconstruction for Save/Session Resume

The state boundary is established by the original writers/readers above and twelve restore controls: two routes, six variants, captured at checkpoint +50, VBL 18000 and 19000. Source checkpoints are R3's spaceport 17700 (pre-night) and solicitor 13730 (settled day). Each source machine is restored with the same subsequent inputs; derived-only and phase/latitude perturbations are isolated from each other.

| State | Required treatment | Evidence |
|---|---|---|
| METIS phase `$5796` long | Preserve full phase, or reconstruct from a preserved phase origin and exact elapsed tick count modulo 2³² | Reset to `$00125280` leaves both restored routes in day at 18000/19000 instead of control night. Dropping the low word changes the next high-word carry and its sampled frame |
| Cached stepX `$70B4`, biased latitude `$42C70`/`$70B8` | Preserve these caches or reproduce the actual setup/history that generated them | Resetting latitude to zero persists and reverses day; deriving from arrival XYZ changes solicitor stepX `$278→$277` and spaceport latitude `$20C→$20A` |
| Sub-stellar longitude `$7052`, body identity/rate | Retain the METIS-specific input or reconstruct from the independently recovered body definition/arrival rule | This slice uses `$234`; a universal Damocles value or zero is unsupported |
| Day `$70E4`, sky `$7324`, active palette `$70A6`, longitude `$42C6C` | Reconstruct jointly at the recovered surface-frame phase from the preserved inputs | Reset all four derived outputs, retain phase/coordinate caches, and both routes return to **byte-identical full RAM and PNGs** at all three comparison captures |
| Yaw/pitch, body/region and palette binding, core occupancy/clip row | Preserve/rebuild through their evidenced pose/content rules before drawing | Stars use yaw/pitch/clip; indoor fill and occupied-cell palette are distinct from day flag |
| Simulation tick/frame phase | Preserve or deterministically reconstruct under ADR 0058 | Original VBL-versus-post-test samples differ temporarily; the browser must choose its fixed phase consistently across restore |

Untouched restore controls at VBL 19000 equal the original uninterrupted R3 full RAM for both routes. Their SHA-256 values are `864c5cf60568fd9cbc0811b49492ebca2b22524a5d13950ef843c6fab09ee90f` (solicitor) and `bbc32fb4cf59ec458d15bd1aaa259ec22cfaed4ca641a36f6f2a3924941dc24c` (spaceport). Thus the positive comparison is against uninterrupted original play, not solely against a second restore. A broader reset that also cleared latitude failed, and was split into the isolated cases rather than cited as successful cache reconstruction.

The browser should advance phase once per 50 Hz tick and perform its day/palette/sky decision at its fixed frame phase using the cached coordinate semantics above. It should rebuild the frame from state, including stars and scene palettes, without depending on old screen pixels. Tests must include a fractional phase immediately before a carry, the frame immediately before and after night, different view yaw, a distinct palette and an equal-half palette, and Save/Resume comparisons against uninterrupted browser play. These are behavioral state requirements; this report decides no serialised field names or Save version.

## Portable reproduction

From a repository checkout, supply only the pinned local STX, TOS and Hatari. Python 3 is sufficient for capture/inspect; install Pillow locally only for `--screenshot`. Original input files need not be in this checkout. `M3_ROM_ROOT` below contains `atarist/Mercenary III.STX` and `atarist/tos/emutos206.img`.

```sh
python3 research/damocles-st/scripts/mercenary-iii-taxi-night-sky.py capture \
  --rom-root "$M3_ROM_ROOT" --route sol
python3 research/damocles-st/scripts/mercenary-iii-taxi-night-sky.py capture \
  --rom-root "$M3_ROM_ROOT" --route sp
```

The default **cold-boots** the pinned media; no ignored snapshot is required. `--hatari` selects the pinned executable at another path. Optional `--baseline` accepts the historical R4 NTSC B0 for accelerated aligned controls and verifies its hash. The command emits the new ignored run directory, exact launch arguments, debugger scripts, RAM/states/screenshots and `hatari.log`. Opening `$59FBA` records boot VBL/cycle/phase for cold boots. Every dense callback records actual VBL/cycles and player `$7146` X, full `$5796` phase, `$70B4` step, `$42C6C` longitude, `$42C70` latitude, `$7052` sub-stellar value, `$70E4` day, `$7324` sky and `$70A4..$70AA` palette. The two valid post-test breakpoints are separate; Hatari does not accept `||` in breakpoint expressions.

To check a captured frame, use its own paired RAM/PNG:

```sh
python3 research/damocles-st/scripts/mercenary-iii-taxi-night-sky.py inspect \
  --ram "$M3_RUN/v22500.ram" --screenshot "$M3_RUN/v22500.png"
```

Inspect validates all bounded MIII source/data pins, every yaw index and wrap record, empty METIS horizon lists, state inputs, the cached day rule and optional pixel matches. It emits summary facts only, not extracted original star/geometry lists. A captured loop-top frame may legitimately have an in-flight day/longitude combination; evaluate the completed-test records for the rule gate. The dense log contains 81 ordered interrupt records per route, including all 51 VBLs 17850–17900. Check +$3B0 phase increments and compare the completed day/sky/palette outputs separately; do not require the same flip VBL across cold boots.

The 50 Hz/exact-eleven control is reproducible with the [#642 exact-cadence recipe](mercenary-iii-taxi-cadence.md#reproduction), adding the same dense callbacks and paired captures around phase high-word `$BD`. This separate synthetic recipe is necessary to validate the accepted cadence; the natural capture command does not patch frame timing. The restore controls use [R3's sidecar restore recipe](mercenary-iii-taxi-persistence.md#reproduction), with isolated byte resets of the fields in the table above, at the checkpoint's own loop top.

## Source and artifact identities

The following bounded source hashes are from R4 PAL `B0.ram` (`5d2e4911ace4e86794f15a44ef2c1e781dcbe5e17d2e45a124d7e5bf0cfed7a8`) and equal the inspected natural journey sources. Research instrumentation does not alter these ranges.

| Range | Role | SHA-256 |
|---|---|---|
| `$50B10..$50B64` | Day test | `42c3dd432135c7891fa9067e78f95222b8ee686313b97a10f7026ab3e6f040aa` |
| `$53144..$53164` | Long body-phase updates | `9b8b8e70e1f3be5c1c769dc0e5abbabe6a1e467645a77c8bd1fb0794bea6715f` |
| `$5A27C..$5A2B6` | Pose/coordinate setup | `3a94e0eae0481dd5c81ba9c7e56bff77578142fe06be65b7fa0ce7d2f639bfd4` |
| `$50B66..$50C2A` | Main surface star pass | `d4b595101b231ca4ea5fd502c4ceee35bd3ac35b40ba822e524db1f4337486d6` |
| `$50D26..$50D66` | Star colour bank | `627e3d0951c7494791038ded098c5ad3150d0c3e6a08fc0038253331b26f42ad` |
| `$5D8C0..$5FDF0` | Yaw index and 1,868 star records | `e4b802d6035968f5665010fecf40b1c1a3a55a60fcee3d18e39eee5af6da5377` |
| `$571A8..$576A0` | Island/classification/draw pass | `0de518fd77b7e24f9109f8116e8cac291642644c3906b2aee778f2e0f33265f2` |
| `$631C8..$631D4` | METIS descriptor and terminator | `90f48465ed74853e964fb7bf0688de84fde37807d702d949846656612d302ea2` |
| `$632F4..$63310` | METIS surface bounds/empty lists | `2bf88175379adab249434a31988c65941498a660eab525b204f7a0641ddbb9b8` |
| `$C06A..$C0C4` | Solicitor palette separation/halves | `bbb4036b10daafc5eaa4d8868f99804a02a754701d4a4f5f55d0aa4b6bd96412` |

Consequential artifacts, all relative to ignored `restricted/mercenary-iii-646/`:

| Artifact | SHA-256 |
|---|---|
| `runs/dense-sol-hcizo1qw/dense.csv` | `d8072a8d911303703c563bc36794f9477ddfdb7a1120c5346325df212b3997e9` |
| `runs/dense-sp-2yefs1t9/dense.csv` | `89543b6809c7ebc3ec506bfbca1827c3044cbcf6252690c5592b4c1a5e5410c5` |
| `runs/ntsc-sol-xg5m7rvy/v22500.ram` | `2ea04b1f0a3f5b1b0e72e026e386ff34fc7cea020b6b43a41dd0074c9f09a10c` |
| `runs/ntsc-sol-xg5m7rvy/v22500.png` | `00396fa1ab0a4322cd6dd134fc0f9be2be957282200a32f6c424174e621184e8` |
| `runs/ntsc-sp-xh1at5ca/v22500.ram` | `95dbfd5674e0509cd8ef7817aec580641d9dd252849bf2f04f39f404195d974d` |
| `runs/ntsc-sp-xh1at5ca/v22500.png` | `25bd0c15597b126d831510a1224fd178533bd9c96f2194bdde184b8a1e60ebd9` |
| `runs/pal11-sol-g2xe6av9/v17100.ram` | `4830329e5ac5adadf7b9fdf55827fc5cf76c889b2e95a10757026edb4aeb2cf3` |
| `runs/pal11-sp-gnell1hp/v17100.ram` | `7d90cfced4c51fbba2ae6402123914db3f8ee386321706f838259e50ec2d4841` |
| `portable-sp-8nxpj96b/v5994.ram` | `418b8a43cc63b593f451b02a934a6fe54ace060d18552f17e778e19e762ce735` |
| R3 solicitor restore source `ck13730.sav` | `ca3e57ee643bc4e7c8bb98226f795229660028ecaeb4ff9620cd5c2dd585e22c` |
| R3 spaceport restore source `ck17700.sav` | `1dc9663fbd24ccb259f5a1a1ea0b5c93d4f65377a0a853fda19cf1b7f2ca0575` |

These local paths identify evidence; they are not portable prerequisites. Fresh research reproduces the bounded rules/content from supplied pinned media, and can have different whole-RAM hashes and flip VBLs.

## Acceptance handoff and limits

R2 admits the recovered MIII surface star field and affirmative empty METIS island geometry, with per-palette window behavior. R3 requires full fractional phase plus cached coordinate semantics and permits the evidenced joint reconstruction of derived outputs. R4's day/night similarity is now bounded by MIII-specific source hashes and runtime checks; it does not admit shared content or mechanically translated original routines. The D1/I2 research night gate is closed by these facts.

I2 must still implement sky/stars/window palette selection and compare uninterrupted versus Save/Session Resume under 50 Hz, eleven ticks/frame and its fixed phase. Do not assert absolute emulator VBL 17850, a simultaneous change of every visible window, fresh taxi-XYZ-derived night coordinates, or pre-render screen pixels as state. Sky/ground fills and occupied-cell geometry still require their R2/#644 presentation rules. Exact ST rasterisation remains waived. **TOURCRAFT and the otherwise complete spaceport sky/body inventory remain waived and unrecovered here; the entire spaceport arrival view is not claimed complete.**
