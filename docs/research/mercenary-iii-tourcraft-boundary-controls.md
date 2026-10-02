# Mercenary III TOURCRAFT: timer, queue and message boundary controls (R6)

> **Status** (as of `405c6e70`, 2026-10-02): Current.
> **Holds:** Timer `$727E` decrements modulo 65,536 each unpaused tick and dispatches only when negative (zero is not due; `$8000` → `$7FFF` waits 32,778 ticks for the wrap), a threshold launch precedes timed dispatch, the interpreter checks busy, then description continuation `$7230`, then queue `$711C`, launch checks availability before the active/queueable decision, and message ticks run before the `$70BC` pause guard.
> **Open:** none within R6; I4 implements these ordering rules and R8 proves their restored futures.
> **Evidence:** `restricted/mercenary-iii-707/runs/exact-near.sav`, `restricted/mercenary-iii-707-followup/` (lost) (`boundary.py`, `boundary-review.py`, `boundary-review.json`, `runs/boundary-*/hatari.log`), `web/src/shell/boot.ts`.

Original-engine controls for [#707](https://github.com/odogono/mercenary/issues/707), following the accepted [D2 scope](mercenary-iii-tourcraft-milestone-review.md#accepted-r6-follow-up) and [connected campaign recovery](mercenary-iii-tourcraft-campaign.md). Fifteen deliberately synthetic initial-state controls confirm the recovered signed-timer, active/busy guard, threshold, queue and continuation ordering. An independent raw-log parser asserts their observed state transitions without importing the parent parser or campaign timing model. These controls supplement the connected campaign runs and exact early-flight cadence comparison; they are not natural campaign routes or an exhaustive enumeration of arbitrary states.

## Fixture and timing ownership

Each control restores the pinned original whole-machine near checkpoint from the [strict follow-up](mercenary-iii-tourcraft-followup.md#reproduction-evidence-pins-and-validation), retaining the same baseline media/emulator identities. The accepted masked wait supplies eleven original game ticks per steady frame. Original script, timer, queue, message, admission and encounter handlers remain unchanged. The harness sets initial state at the first `$5A41A` join: seconds 375 except explicit threshold cases; script PC `$766DC`; valid empty stack pointer `$56D6`; hold 200 unless isolating a held busy bar; timed target `$5CD2`, the bank offset of the genuine default election continuation `$75A16`, unless the queue/continuation case clears it. Individual cases vary timer, flag 6, availability, queued ID, continuation or pause. Short controls capture at physical VBL 23,600; the long sign-window control captures at 61,000. The pause control first captures while paused at 23,510, then clears pause and ends at 23,600. These writes are synthetic controls, not approved playable Save states.

The seed join is frame 1,800, game tick 18,716, physical VBL 23,461. Its restored partial wait has nine game ticks: the next join is frame 1,801/tick 18,725. Every measured subsequent wait-tail interval is eleven game ticks, including the long wrap control. The exact first-decrement controls separately log original PC `$53134`, immediately after `$727E` decrements, at tick 18,717; this avoids inferring a one-tick boundary from eleven-tick frame samples. Physical VBL labels identify captures but do not define the logical cadence.

## Observed controls

| Initial condition | Original-engine result |
| --- | --- |
| Timer `$0000`, inactive, idle bar | First scheduler retains target. At the next individual tick, timer becomes `$FFFF`; next eligible frame dispatches at tick 18,725 with timer `$FFF7`. |
| Timer `$0001`, inactive, idle bar | First scheduler retains target; next eligible frame dispatches at tick 18,725 with timer `$FFF8`. Zero itself is not due. |
| Timer `$FFFF`, inactive, idle bar | Dispatch occurs at seed tick 18,716 without a tick delay; the separately sampled next decrement is `$FFFE`. |
| Timer `$8000`, active guard, held busy bar | Individual next decrement is `$7FFF`. Clearing flag 6 at frame 1,807 does not dispatch while the timer is nonnegative. |
| Same signed-window fixture, continued through wrap | Last pre-dispatch scheduler at tick 51,483 has timer `$0001`. The next eligible scheduler dispatches at tick 51,494/frame 4,780 with `$FFF6`, 32,778 unpaused ticks after the seed. The target is retained throughout the positive half-cycle, then cleared; the original active flag and stack push occur. |
| Negative due timer, flag 6 set | Target stays pending. Clearing flag 6 at frame 1,807 permits dispatch at tick 18,791, with timer `$FFB4`; the held busy bar remains. |
| Negative due timer, flag 6 clear, busy bar held | Scheduler clears target, sets flag 6, changes PC to `$75A16` and pushes old PC (`$56D6` → `$56D2`) at seed tick 18,716. All subsequent interpreter samples retain `$75A16` while busy: admission does not execute an opcode through the busy guard. |
| Election threshold and negative due timer together | At seconds 32,400, threshold starts election `$77` first: PC `$759D2`, flag 6 set, availability `$A0` → `$20`, stack `$56D2`. Timed target remains pending because the newly active script blocks it. |
| Election unavailable, already active, queued mining `$13` | Threshold attempts cannot overwrite the existing queue: `$13`, PC `$766DC` and stack `$56D6` remain. Availability is checked before the active/queueability decision. |
| Available queued election, no continuation | Pickup clears queue, consumes availability `$A0` → `$20`, pushes stack and executes the first opcode in the same interpreter invocation. Next scheduler observes PC `$759D5`. |
| Unavailable queued election, no continuation | Pickup clears queue before refusing the unavailable ID. PC `$766DC`, stack `$56D6` and unavailable byte `$20` remain; no script starts. |
| Positive description continuation and queued election | `$55A7E` wins before queued pickup. The genuine packed body at `$759DD` is decoded; cursor becomes `$759ED`, display mode `$723E=2`, bar becomes busy, and queue `$77`, PC and stack remain. |
| Negative continuation and queued election | First invocation clears continuation and retains queue. Next interpreter invocation starts queued election, consumes availability and pushes stack. |
| Busy bar, positive continuation and queued election | All interpreter samples retain continuation, queue, PC and stack; no continuation-resume call occurs. Busy is the first interpreter guard. |
| Pause set, new message request busy `1` | Paused capture retains game tick 18,716, wait counter 6,028 and timer `$FFFF`; message busy becomes `$FFFF` and count reaches 47. Message ticks run before pause suppresses game-tick/wait/timer updates. Unpausing resumes the eleven-tick waits. |

The long wrap case deliberately supplies a long held bar (hold `$FFFF`, finite 65,535 message counts) and active-state boundary. The finite default campaign routines do not establish naturally reachable 32,768-tick active deferral; this control verifies the original word/sign discontinuity. Likewise, positive continuation is an isolated guard fixture. `$7230` belongs to description/paragraph continuation, distinct from `$7232`'s message-row progression. All admitted default campaign texts fit one row and do not create this continuation. The fixture stops below 201 unpaused ticks after its valid first request, before its hold can complete and the synthetic cursor could treat the next script opcode as another packed paragraph. It proves first-resume priority only.

For message ownership, `$53420` handles the message before the tick's pause check at `$53114`. A new request (`busy=1`) first becomes negative/count zero; subsequent message ticks increment `$7286` and compare exact equality against hold `$533D6`. A completed row reads remaining text at `$7232`: empty clears busy; nonempty restarts count/busy. Positive description resume copies hold `$533D8` to `$533D6`. The pause and continuation captures establish their sampled state/count transitions; these new controls do not independently enumerate every hold value or render a complete long description. The [early-flight comparison](mercenary-iii-tourcraft-followup.md#new-probe-results) remains the full 39-request/hold timing proof.

The original `$70BC` pause control is distinct from the current [Browser Shell System Menu](../../web/src/shell/boot.ts#L938), which suspends session advancement entirely as a modern accommodation. This probe recovers the original engine’s message-versus-game-tick ownership; it does not change the existing Browser Shell menu policy.

## Source and artifact pins

Original code provenance is the pinned R6 near RAM. Half-open reader ranges:

| Reader | Range | SHA-256 |
| --- | --- | --- |
| Interpreter busy/continuation/queue order | `$52860..$52910` | `27c9ec0a2fc86eaf6334a182c17ad05af99ec30139bc2394495c8f8f4dff9539` |
| Launcher and continuation resume | `$55A0E..$55B72` | `a396636bee81d423304e9f6c80e81bb1d2c287354adff1aa9a36916aa5e6761f` |
| Threshold and signed timer dispatch | `$5A3D0..$5A41A` | `1dc78a8beaddb5fd75590489db14e619cece3db6e45b27df84af3348a3927db2` |
| Message tick before pause | `$530C0..$53110` | `569995bd0882c229cfdafd61739899c21987ba7b517dd14ae78e63c7a2b4460f` |
| Pause, wait and timer tick | `$53110..$53196` | `1ae9a72d7dafa8a82fe589edc594b083d2e1aa36e40503d85d515ac96e93e70b` |
| Message hold/start/idle | `$533DA..$5344C` | `cb5baf5fa35ffc87f40f5d2ff74816996ab60a684150de9308f6ae8ae60e2b73` |

Raw logs, debugger scripts, RAM, independent assertions and results remain ignored under `restricted/mercenary-iii-707-followup/`. Paths below are relative to its `runs/`; each pin is the completed `hatari.log`.

| Control directory | SHA-256 |
| --- | --- |
| `boundary-active-due-98_1fycb/` | `ca5aa460ba0b29393dffd65900d0926b0085f2494a51a9f560320760f95c5395` |
| `boundary-busy-continuation-8b8la_7e/` | `243bb429beda7c1e140c49653c3b4dfe32106c4701d0b25f8a90fb3f5ef256d6` |
| `boundary-busy-due-r6gpp66w/` | `a638a755666cd132d002ec4a380891825e45483ecaab6e82c702960f3d3a8b9f` |
| `boundary-continuation-8va2h7dm/` | `418813205f8afdd76cb542144489a708acf96f812a2deacea806317d06c7375f` |
| `boundary-negative-continuation-b6bwp8hm/` | `27a4922e29cd8cde297cadbb4997bed693e1ad92c05a4af8e4ba36cf3481903f` |
| `boundary-negative-hm73wyz9/` | `d45d99837469d46a0cd862b24b90a79f62c5f817431835a935babdae7f3391bb` |
| `boundary-pause-43fa_tl4/` | `120ddfdd15b08ff3426481f424cec1c05dcfe1d398c9d2df8ae7023da8a4bc28` |
| `boundary-positive-x97yxcdl/` | `e117efab79a45c1d6fdb32e3055faa7504cb395b12d75f215ffd8323ab6aff8f` |
| `boundary-queue-available-n30i43th/` | `8d7f681e3368e37f6d33bf34fea56fa3c854a3bf7e1c4733da999d0ea4903de2` |
| `boundary-queue-unavailable-ndkv4__w/` | `8289967ebe2dfe9e4be2e821885c945bb32e69c6617e3a755d47d5750cc45470` |
| `boundary-sign-step-1w6io6xc/` | `61bdbc261c95c20fdc60ce3432b0672ff6becd36eb207653bc3846bca4c68b27` |
| `boundary-sign-wrap-68ebwy6i/` | `ecb48c2e5b9e3caed249dfa677c7d73ccd2bf188960b857a198e2fb81d93b1d6` |
| `boundary-threshold-first-t3gr9k2t/` | `6c6c09b24da02fcc34d01f3a2d120ff446efcfa9a99e5524f6729a9721655826` |
| `boundary-unavailable-3chmaaxw/` | `a866c56e6538f5f2f43a8ebe04fe519879cac7068b86826885ac7c57d5852e4b` |
| `boundary-zero-vzq1tx5e/` | `3064d2fe469c11749f37984d35b1b6f14a072d4de4de882b50e2451a89c69716` |

The independent `boundary-review.py` asserts 58 conditions across these fifteen controls, including actual first-tick differences, modular arithmetic at every sampled timer state, first eligible negative-window dispatch, stack/PC/availability changes, preserved busy futures, queue consumption, pause state and eleven-tick steady intervals. Seven additional assertions check the two earlier duplicate zero/negative runs (65 assertions across all 17 captures); those add reproducibility observations, not extra mechanisms. Its result records all sampled dispatch states and full-RAM digests.

| Additional artifact | SHA-256 |
| --- | --- |
| `boundary.py` | `3f9bf35778306f3e6c86b1a5f98dcbe15a5c1ab42085768715220db0206dcf5e` |
| `boundary-review.py` | `869258f5a71f11b71b6f8b586601f83540f69d12c87e397850eb2db8eb3f31bf` |
| `boundary-review.json` | `076b9c816e7ecd10461dcb1db15edc4109ce04af2462e5ee3666a24ba57b0ba1` |
| `runs/boundary-pause-43fa_tl4/paused.ram` | `2c7761ca55117cf71571cfc5c0bb618affb6078c234bc848ac7ad3c0934ab70b` |

## Implementation and scope handoff

Preserve the two separate timer words, signed dispatch guard, modular unpaused decrement, active guard and threshold-before-timer ordering. Preserve message-before-pause ticks and interpreter busy-before-description-before-queue ownership, availability-before-active launch refusal, and clearing an inactive queue before availability lookup. The connected campaign's existing queue-overwrite controls and script timer writers remain part of the [campaign report](mercenary-iii-tourcraft-campaign.md); this boundary set adds the discontinuities above rather than replacing them.

These finite original-engine outcomes close their identified R6 boundary questions. They do not certify runtime implementation, browser presentation, arbitrary foreign campaign states, all inputs/counter values, or Save/Resume equivalence. R7 owns promoted content/presentation coverage; R8 owns valid-state/restore/migration future comparisons; I4 must retain these observable ordering rules at the accepted cadence. No application, payload or Save schema changed, so application tests were not rerun for this documentation-only research.
