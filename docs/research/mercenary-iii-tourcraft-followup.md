# Mercenary III TOURCRAFT: R6 follow-up and accepted D2 resolution

Continuation of [#707](https://github.com/odogono/mercenary/issues/707), 2026-10-02. **The user accepted both decisions below on 2026-10-02: the transition interpretation at 50 Hz/eleven ticks, and connected default campaign research while preserving free waiting. [D2](mercenary-iii-tourcraft-milestone-review.md#accepted-r6-follow-up) and [ADR 0058](../adr/0058-run-mercenary-iii-at-50-hz-with-a-confirmed-fixed-frame-cadence.md) record acceptance. The early-flight cadence gate is closed; connected campaign recovery remains an implementation gate.** The [playback report](mercenary-iii-tourcraft-playback.md) and [clock/script report](mercenary-iii-tourcraft-clock.md) establish the complete early outward flight, its used mechanisms and the two remaining decision boundaries: atomic timing across original loop reentries, and campaign effects during free waiting or late boarding.

## Precise timing diagnosis

[ADR 0058](../adr/0058-run-mercenary-iii-at-50-hz-with-a-confirmed-fixed-frame-cadence.md) originally specified 50 ticks per second, eleven ticks per atomic frame, tick rules before frame rules, and one script opcode per frame for the confirmed taxi paths. Its taxi confirmation establishes the opening taxi outcomes. TOURCRAFT adds an original control-flow case that those taxi paths did not exercise.

Original `$5A710` branches to loop top `$5A41A` after surface-to-space setup, without executing the frame-end helper or incrementing playback frame `$7180`. Input and the interpreter `$52860` consequently run again in the same playback frame. P11's retained trace shows frame 139 twice at VBL 25029: first PC `$70616` calls W100, then PC `$766E6` resets its wait. This is a recovered second interpreter invocation, not an additional playback frame or an invented opcode.

The existing synthetic probe controls **frame ends**, not the interpreter's tick phase. The distinction is observable:

| P11 boundary | Primary observation | Consequence |
|---|---|---|
| Space entry | Two tops at frame 139/VBL 25029; frame 140 top at 25041 | Twelve ticks after the reset, although frame-end delta `$5301E` remains eleven |
| W100 test | Wait values 12, 23, …, 89, 100 at frames 140–148 | The wait succeeds at 148; strictly eleven ticks per frame would first reach at least 100 at 149 |
| TOLOSA setup | Frame 462 top at 28583; frame 463 top at 28593 | A ten-tick top interval compensates an earlier phase offset; setup precedes the single interpreter-bearing top of frame 462 |
| Used dialogue | First seven requests agree; all 32 later requests are one frame earlier in P11 | Order alone does not prove exact atomic timing |

The independent rule calculation, with first fetch at frame 2 and both original invocations at frame 139, gives first text 16, post-space text `$7061E` at 152, final text `$70897` at 715, closing blank 737 and return 745. P11 instead gives 16/151/714/736/744. No long-text continuation explains this: the used messages fit the 48-cell row. The natural N50 flight and P11 both reach TOLOSA on playback frame 462 and exit through recorded L at 927 with the recovered endpoint; those agreements do not resolve message-phase interleavings. Sources: [R6 timing comparison](mercenary-iii-tourcraft-playback.md#cadence-supported-counts-and-failed-confirmation-boundary), [script reduction and request comparison](mercenary-iii-tourcraft-clock.md#outward-script-waits-and-queue-ownership), and ignored P11 `runs/exact-11-14c2p26m/hatari.log` under `restricted/mercenary-iii-707/`.

Direct decoding also establishes why adding another wait at every loop top would change the rules. Launch `$52742` clears the frame counter, invokes frame-end helper `$5A8F2`, then jumps through `$5A372`, which resets the frame-end reference from the VBL word. Space entry reenters directly. The space path calls the frame-end helper at `$5A87C` **before** the nearest-Body scan `$53D32`, cabin update and possible Body setup `$5A15E`; the surface path likewise has work after its `$5A56A` call. A probe must specify which side of the atomic boundary owns these tails. Merely checking `$5301E = 11` or pacing every top is insufficient. These source ranges were independently decoded from P11 `near.ram` with Capstone 5.0.7; original bytes and assembly remain Restricted Material under [ADR 0002](../adr/0002-separate-rom-research-from-implementation.md).

## Accepted timing clarification and confirmation probe

Retain 50 Hz and eleven-tick atomic boundaries. Treat recovered loop reentries as explicit ordered subpasses within their owning atomic frame, with no tick advancement, playback-frame increment or new external-input delivery between them. Preserve the original input readers and second script invocation at space-entry frame 139; each reader still consumes any eligible pending input or playback record in its recovered order. The accepted D2 clarification amends ADR 0058's one-opcode-per-frame statement for this evidenced transition. Do not generalize it to unrelated reentries without recovery.

The stricter original-engine probe must retain the pinned STX/TOS/Hatari baseline and a naturally reached near-boarding checkpoint. Its timing instrumentation should:

1. Anchor one logical tick phase across launch, surface-to-space reentry, space and Body setup. A restart must not silently reseed the phase from `$5301C` or the raster.
2. Deliver exactly eleven original unpaused VBL-rule invocations between consecutive atomic boundaries. Deliver no VBL-rule invocation inside an atomic frame, including its reentry subpasses; advancing or overwriting a wait/clock field directly is not equivalent.
3. Retain original script, control playback, Mover, Body, message, queue and clock-rate code. Preserve frame-byte wrapping and the exact interpreter invocation sequence, including the exceptional second invocation at 139.
4. Record both boundary and reader ticks: interpreter entry/fetch, wait reset/test, message request/idle, rate/period writers, frame increment, space transfer and Body setup. Document the ownership of work after the original wait helper. Clock fractions must be accumulated under the rate actually in force on each delivered tick.
5. Compare all 39 text/blank requests, script return, ordered message acceptance/refusal, frame-139 and frame-462 state, recorded exit, endpoint and cash against an independently reduced rule model. Include idle/busy cash-refusal controls at these boundaries and an independent CPU-speed control once a valid schedule exists.

The strict comparisons below establish the early-flight logical schedule. They do not close the newly admitted late-campaign interleaving or browser implementation gates. The early pilot dialogue is idle before exit in both previous models; that narrow fact does not prove queue or busy-message equivalence. R8 must later retain the accepted atomic-frame phase and reentry/subpass state for Save and Session Resume.

### New probe results

Two new **synthetic atomic-timing runs** now match the independent script model through automatic exit. They use the unchanged STX/TOS/Hatari pins in [the baseline manifest](../../research/mercenary-iii-st/config/baseline.json), checked before every run, and restore R6's naturally reached `exact-near.sav`. They remain synthetic timing probes, separate from natural 50 Hz play; the accepted ADR amendment now admits their recovered reentry interpretation.

The independently authored wait instrumentation retains the original unpaused VBL handler. It unmasks interrupts only during the wait, counts exactly eleven increments of original game-tick word `$53096` against a separate boundary word, then masks interrupts through the next atomic frame. The boundary word survives `$5A372`'s launch reset. `$5301E` is supplied as eleven for the original substep selector. A loop-top breakpoint masks interrupts before frame rules; every original reentry stays masked. The post-wait tail, including space scan/Body setup, belongs to the frame whose original `$7180` increment has just occurred. Script, control stream, Mover, message, queue and clock rules are unmodified. No wait, busy, clock, pose, cash or playback state is forced in the neutral runs.

The original raster can advance while interrupts are masked; pending interrupts can coalesce. Consequently **logical game ticks, not physical Hatari VBLs, establish this synthetic adaptation**. It cannot certify physical wall time. The CPU control changes 32 MHz to 16 MHz at `$52742`; both runs have identical logical results and **byte-identical full 1 MiB RAM at the first on-foot top**. Original natural N50 remains the separate continuity evidence. One initial partial preboarding wait has nine ticks because restoration begins inside that old frame; all 928 flight wait intervals (frames 0–927, ending at frame 928) have eleven.

| Check | Both atomic runs |
|---|---|
| Admission/start | Game tick 18,758; script requested before launch; first interpreter fetch remains frame 2 |
| Surface → space | Frame 139, tick 20,287; two interpreter invocations with zero intervening ticks |
| W100 | Frame 148 sees 99; frame 149 sees 110 and passes |
| TOLOSA setup / first top | Frame 462, tick 23,840; one interpreter-bearing top after setup |
| Dialogue | All 39 text/blank request PCs, order and frames exactly match the independent reduction: 16 / 152 / 715 / 737; closing return executes at 745, idle PC at 746 |
| Contact and recorded Leave | Contact completes during 883; recorded L runs at 927, tick 28,955 |
| First on-foot top | Frame 928, tick 28,966; selector/slot `1/$FFFF`, playback/passenger zero |
| Endpoint | TOLOSA Body `$64`, group 23, cell `01-00`; XYZ `[$0AB293C2,$0000003F,$06238BEF]`, yaw `$FD79`; cash `005100900000` |

Launch → L is exactly 10,197 original game-tick updates (`927 × 11`); first on-foot top adds eleven. Integer clock seconds increase from 375 to 14,207: **13,832 seconds**, with period 1,600 and remaining fraction 1,344 → 1,138 at L (786 at the first on-foot top). This is neither the advertised 3 h 10 min nor P11's 13,834-second reading. Independently applying signed 16-bit subtract/refill arithmetic to every logged wait interval reproduces all seconds/fractions in both runs, with no disagreement. The 927 sampled craft/space rate writers occur outside tick-delivery intervals; no mid-frame tick observes an intermediate rate. This verifies clock accumulation for the observed rates, not an exhaustive packed-arithmetic proof of every Mover substep.

Paired preboarding controls under the same timing instrumentation zero the cash bytes: message `$0C` is attempted at tick 18,758 with an idle bar and accepted; with a deliberately held busy bar it is dropped. Both remain on foot with no launch or pilot script. These are synthetic refusal controls, retaining the original guard/helper; no message is forced. They supplement R6's model/proximity/fraction-only and live-view controls, rather than certifying arbitrary phase/campaign interleavings.

**Accepted decision:** the strict experiment resolves the earlier one-frame instrumentation discrepancy under the accepted schedule. The user accepted the explicit transition exception and post-wait ownership; ADR 0058’s early-flight cadence gate is closed. Connected late-campaign recovery remains a separate implementation blocker. Browser runtime, promotion, presentation and restored-future proof remain downstream work.

## Accepted campaign scope clarification

Free waiting before boarding and after arrival exposes original elapsed-time triggers. The early recipe stays below 32,400 seconds and has empty campaign queues, but this is an observed starting path rather than a permanent restriction on play. The [clock report](mercenary-iii-tourcraft-clock.md#campaigntime-effects-and-late-waiting) identifies election `$77` at 32,400 seconds, mining `$13` at 61,200 with flag 9 set, their overwriteable queued script `$711C`, separate signed timed continuation `$727E/$7280`, encounter request `$DB` and the reachable cash-clear continuation. Flight `$29` is repeatable but not queueable, so campaign dialogue can refuse its start while admission still arms playback.

New original-engine controls strengthen the static scope finding. They restore the natural 8 MHz/approximately-60 Hz near checkpoint, change only the specified campaign preconditions, and then deliver ordinary B. These are **synthetic campaign probes**, not natural hours-long waiting recipes:

| Probe | Original-engine result |
|---|---|
| Set seconds to 32,400 at VBL 23,470; B at 23,500 | Election is active when B is consumed at 23,506. Admission and playback start succeed, but script `$29` is attempted with flag 6 set and never executes; no pilot requests occur. The default continuations dispatch at 25,636 and 27,449. The same recorded L exits at frame 927; cash stays unchanged. |
| Set seconds to 61,200 and set flag 9 at VBL 23,470; B at 28,000 | Mining's timed continuation dispatches at 25,600. Cash is zero in the VBL-26,000 capture. B at 28,004 attempts `$0C` with the bar idle and is refused: no admission, playback or pilot script. Other campaign flags are retained from the near checkpoint. |

The election run ends on foot on TOLOSA with OBSERVER request 1. It does not prove the `$DB` request harmless while waiting on METIS or through every ordering of Body entry: the campaign dispatch and destination setup can replace encounter state. The mining probe supplies flag 9 synthetically; the complete naturally reached election → mining closure is still unproved.

The user accepted research and eventual inclusion of the **connected default election/mining dialogue, queue, timer, cash and encounter effects reachable from the accepted fresh-game slice**. Preserve free waiting and recover those effects before implementation. An authored boarding deadline, frozen clock or disabled threshold reader would require a different explicit departure decision. This bounded extension does not admit candidacy/veto alternatives, HQ/Bil interaction, mining gameplay, onward travel or arbitrary foreign campaign states.

Follow-up proof must establish the reachable state closure and original-engine outcomes for waiting across each threshold, boarding during active campaign dialogue, threshold crossing during the outward flight, timed continuation dispatch while active/idle, queue overwrite and timer-wrap behavior, cash clearing before admission, and the `$DB` encounter's actual effect in METIS/space/TOLOSA. Identify every additional required script, resident, trajectory, damage/control effect and presentation dependency; return to D2 if this exceeds the accepted connected closure. Keep the early TOLOSA OBSERVER programme and its frame timer: the nonhostile first programme is already encountered and future-affecting, and a later request may override it.

The [existing Damocles reuse matrix](mercenary-iii-tourcraft-reuse.md#reuse-matrix-and-implementation-handoff) remains the required implementation assessment: retain its title-local script/clock/encounter adapters and shared numeric boundaries, and assess any newly recovered campaign mechanism explicitly. No generic session or boarding convergence is proposed. R7 must enumerate the newly required content before promotion. R8 must include campaign availability/flags, current PC/stack, busy/continuation/hold, overwriteable queue, signed timed countdown/target, encounter state, cash and clock fraction in restored futures. This accepted scope requires recovery before implementation; it changes no runtime or promoted Data Payload.


## Reproduction, evidence pins and validation

All new raw outputs and independently authored instrumentation stay ignored under `restricted/mercenary-iii-707-followup/`; original material is not added to the Data Payload. The source checkpoint is retained in the previous R6 worktree under `restricted/mercenary-iii-707/runs/exact-near.sav`, SHA-256 `f85cd3d5194179324db75e065fb261797e94e62051366656cb3c356d66baef7a`. Campaign controls restore its separate `natural-near.sav`, SHA-256 `efaad6b236d437244115967c2393bd69b3f7e49dcbf6b20eb68e49c2493107dc`. The report's linked R6 ledger pins the program readers and RAM.

For portable reconstruction: independently author the masked wait described above; start from the pinned whole-machine near checkpoint, retaining its emulator phase; seed a private boundary word from the captured game-tick word; preserve the existing wait hook at `$5A952`; arm loop-top masking and `$5301E = 11` instrumentation; deliver B at VBL 23,500. Run the original until playback clears and the first on-foot `$5A41A` top is reached. For the CPU control, switch to 16 MHz at playback start rather than changing the approach. Log original game ticks, interpreter PC/busy/wait, rate/period/fraction/seconds, frame and pose at `$5A41A`, `$52860`, wait entry/exit, rate writers `$591B2/$596DE`, Body setup `$5A178` and Leave `$5569E`. Rebuild the independent 39-request reduction from [R6's documented recipe](mercenary-iii-tourcraft-clock.md#outward-script-waits-and-queue-ownership), with first fetch 2 and reentry 139. Keep original dialogue/control bytes and resulting debugger scripts ignored. Do not compare physical VBL deltas with logical tick counts.

| Local evidence (relative to the new ignored root) | SHA-256 |
|---|---|
| `atomic.py` (independent atomic instrumentation) | `82aa243540c3cbec69d8e80a77780ead1bcc51a15cdc9d0e861044765a820410` |
| `campaign.py` (synthetic campaign controls) | `94d641bc5f4b400dbb24cb9daceb06476ad1f353d56bc0ff0d61e62f2d470b29` |
| `runs/atomic-strict32-3jr8u846/hatari.log` | `36d615df80a1dc5def6dc2a5775211cf98c71daee81fe23ae75dcf274c8430a3` |
| `runs/atomic-strict16-4ccmjg9j/hatari.log` | `b7439d0b34cc64d959e8c42763a6011bb0eef018a73fdf3360a233bfade352c6` |
| Both `runs/strict{32,16}-first-foot.ram` | `eb33716a13b0dd1487e30988e9c1c3959a9b8cabd65add7a4a55b5d899b50095` |
| `runs/atomic-cash-zero-t9zjuq1n/hatari.log` | `1c30b4b45bb4debe363cf6535fd1eefdc8be4bd75ba720b0c7439415e1674416` |
| `runs/atomic-busy-cash-zero-cipl2tso/hatari.log` | `55731d7a48b5c9ab1b8db2124a62bb4cd3a09f0f7253e396299fac1503a91685` |
| `runs/campaign-election-0_77tnpa/hatari.log` | `ac3ac0bbee1c474b035e34c6f5f8371eb4509182f890cd46eef3fc25fc01705c` |
| `runs/campaign-mining-f_tfampi/hatari.log` | `1320c4c4a06d9689bd0c57ffe9b3d5ba05a5ed622e92ee44aa9e1d92a3d8dd4f` |

Validation includes two complete CPU-controlled atomic flights, exact 39-request/model agreement and script return, eleven-tick flight intervals, all sampled rate/clock accumulation, identical first-foot RAM, paired busy cash refusals, and election/mining controls. Documentation links, pins and whitespace are checked separately. The accepted D2/ADR amendment is documentation-only; application tests are not required. Issue #707 remains open for connected campaign recovery and its late-flight interleavings, with the early-flight cadence decision settled.
