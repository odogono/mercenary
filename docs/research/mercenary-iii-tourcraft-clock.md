# Mercenary III TOURCRAFT: clock, cash and deferred scripts (R6)

This companion to [R5](mercenary-iii-services-progression.md) records static facts decoded from the pinned Mercenary III executable and bounded observations from R6. It covers the outward resident-13 flight, script `$29`, and interactions that prevent treating arbitrarily late boarding as the same early journey. It supplies no runtime implementation or promoted content. See [D2](mercenary-iii-tourcraft-milestone-review.md), [ADR 0002](../adr/0002-separate-rom-research-from-implementation.md) and [ADR 0065](../adr/0065-promote-bounded-dion-catalogue-content-through-an-explicit-export.md).

The source is R5's `restricted/mercenary-iii-703/runs/spaceport-confirm-yfx1oqao/craft-mover.ram`, SHA-256 `8667b776b66cded660ce5ed515e95b5e1bbcfbed4046268e1fc0e8347f739314`, retained locally in the preceding research worktree. Original program/media/emulator pins are unchanged from [R5's ledger](mercenary-iii-services-progression.md#provenance-and-validation). Addresses below belong to this Mercenary III image; Damocles constants are not evidence for Dion data. The independent decoder is [m3lab/scripts.py](../../research/mercenary-iii-st/m3lab/scripts.py). Original dialogue and RAM remain restricted.

## Clock ownership and arithmetic

The unpaused VBL handler `$53098` runs the message machine first, then tests pause `$70BC`. If unpaused it calls service charging, advances the VBL/script wait counters, decrements the timed-script counter, advances Body turn accumulators, and updates the clock. These are tick operations, not craft substeps. `$53164..$5316C` reads rate `$6F26`, subtracts it from the signed word fraction `$6F2A`, and enters refill when the result is nonpositive. `$531BC..$531C8` increments seconds `$6FCE` and adds period `$6F28` until the fraction is positive. It can advance multiple seconds in one tick. Each subtraction/addition is a 16-bit operation, and the branch tests the resulting signed word. This is a remaining-fraction representation: zero advances the integer second and refills, rather than waiting for a further tick.

At `$5319C`, a nonnegative seconds longword reaching 86,400 is reduced by 86,400 and day `$6FD2` increments. The negative seconds display branch exists but is not used by the recovered opening. The campaign reader below compares the seconds field, not `day * 86400 + seconds`; replacing its literal comparison with total elapsed days would change the original behaviour. [Clock source ranges in the ledger below.]

| Writer | Decoded effect | Used-flight meaning |
|---|---|---|
| `$591AC` in craft handler | Rate `$6F26 = 32` | Ordinary craft restores the ordinary clock rate during craft substeps |
| `$596DA` in space handler | Rate `$6F26 = D3.w` | Flight time accelerates through the space Mover's packed-arithmetic result; not a script duration |
| `$4DA1C..$4DA44` | Period becomes `25 << selected exponent` using `$6F1E`; compares exponent with `$72B8`; on a decrease arithmetic-shifts fraction right once, on an increase shifts it left once; records new exponent | Original rate-selection mechanism; not invoked by the natural input recipe |
| `$4DA44..$4DA6A` | Selects `$6FD4` and arithmetic-shifts all 32 Body increments from `$7A6A` into `$7AEA` by the exponent | Time-rate selection also changes Body-turn progression |
| `$5A2B8` | Seconds longword is zeroed | Initialisation, not a phase-specific flight reset |

For the pinned in-flight capture, rate/period/fraction are `32/1600/1088` and the retained exponent `$72B8` is 6. At ordinary rate, one integer second takes 50 unpaused ticks. `$6F1E` holds a temporary selection and is 0 in this capture; using it as the retained current exponent would misread the active period.

The space writer independently decodes to `rate = spaceWord(sqrt(speed² + 1024), saturate=true)`, where all operations use the original packed arithmetic and log/antilog tables, rather than host floating-point arithmetic. This is the word conventionally called 32γ. `$595D8..$59660` updates speed as `(speed + throttle × gain) × lag × range / (range + 65536)`; `$59664..$5968A` squares that speed through its logarithm and adds packed `$000A1000` (1024); `$5968C..$59698` halves the logarithm and looks up the square root; `$5969C..$596D8` converts its packed sign/exponent/mantissa into a signed integer with underflow handling, saturation and carry rounding; `$596DA` stores it. The final shift uses `14 - exponent`, followed by a right shift of the sign-extended mantissa times four and an increment when the last shifted bit is set. Only the period is rate-selection-controlled here; the per-tick rate is the Mover result.

The entire numeric sequence agrees with the independently recovered Damocles numeric core after address relocation; that justifies reusing arithmetic, not its impact-clock meaning. The existing [space-pass implementation](../../web/src/damocles/space.ts) and [research calculator](../../research/damocles-st/scripts/space-flight-probe.py) name the operations. Recomputing only the dilation expression with **Mercenary III's captured tables and speed** gives exact agreement at all three retained in-space checkpoints:

| R6 checkpoint | Packed speed | Original `$6F26` | Recomputed rate |
|---|---|---|---|
| Ordinary `v25000.ram` | `$00031E3C` | 35 | 35 |
| Ordinary `v27000.ram` | `$000E15AC` | 22,192 | 22,192 |
| Instrumented `v27000.ram` | `$000E15A4` | 22,160 | 22,160 |

At these faster rates a single tick can advance about fourteen seconds with period 1600. The ordinary craft rate of 32 returns after Body entry. A full every-substep rate/clock comparison remains a meaningful regression check; the three checkpoints do not claim that test has already run.

The actual **integer-second** launch-to-automatic-Leave increases are:

| Observation | Launch | Automatic Leave | Increase |
|---|---|---|---|
| R6 ordinary approximately 60 Hz rerun | VBL 23,506; seconds 375 | VBL 33,735; seconds 14,871 | 14,496 s = 4 h 1 min 36 s |
| R6 natural 50 Hz, 8 MHz | VBL 22,552; seconds 372 | VBL 31,160; seconds 12,185 | 11,813 s = 3 h 16 min 53 s |
| R6 instrumented eleven-tick frame end | VBL 23,501; seconds 375 | VBL 33,698; seconds 14,209 | 13,834 s = 3 h 50 min 34 s |

These readings describe the observed integer clock fields, not a claim of subsecond-exact elapsed duration. The runs use the same phase frame counts but different VBL intervals and clock-rate histories. None equals the script's advertised 3 h 10 min. R5's original final sample was seconds 14,896 at VBL 35,000; that sample includes post-exit waiting and is not the flight duration. R6 ordinary approximately 60 Hz final sample repeats 14,896; instrumented final sample is 14,235. Natural 50 Hz reaches the same on-foot endpoint by VBL 34,000 at seconds 12,242; its flight used natural input plus the PAL hardware selection, with no CPU, code, pose or control-stream patch.

R6 checkpoint rate/period/fraction were `32/1600/640` at ordinary `near.ram` (seconds 374) and `32/1600/499` at its VBL-35,000 sample. The instrumented equivalents were `32/1600/1152` and `32/1600/1103` (seconds 374 and 14,235). Natural 50 Hz near VBL 22,492 has `32/1600/128` at seconds 370; final VBL 34,000 has `32/1600/1201` at seconds 12,242. Days remained zero. These are captured phases to preserve, not interchangeable initial seeds.

## Cash and the zero-price service

Admission `$55506..$55538` accepts service craft indices 12–15 only after a nonzero **longword** test of the first four cash bytes at `$72DE`, in addition to the preceding proximity/model/admission tests. Two trailing cash bytes alone cannot satisfy it. On accepted resident 13, the original copies the service's price descriptor to `$6EC6`; it is zero. Zero price therefore prevents subsequent charging but does not waive admission's guard. [R5 service evidence](mercenary-iii-services-progression.md#leaving-metis-observed-tourcraft-journey).

Every unpaused tick, `$5157E` skips charging when `$6EC6` is zero. Otherwise it forms the six-byte subtraction amount at `$6FE6..$6FEB` by prefixing two zero bytes to the four-byte descriptor, then `$4E71C` subtracts it from six-byte BCD cash. Insufficient balance restores the subtraction before reporting failure; the caller then clears cash, passenger, Start and price, resets eye height to 63 and arms the exit sound. Ordinary Leave clears the price at `$556C4`. These nonzero-price/insufficient branches are static findings, not naturally exercised by this sponsored flight.

The used script `$29` and its reachable shared routines have no account-write or cash-test opcode. Cash is `005100900000` (51,009,000.00) before and after the R6 observed flights, matching R5. This is explained by the decoded zero-price and script paths; it is not evidence that campaign scripts cannot change cash while the player waits.

## Outward script, waits and queue ownership

The used script is `$70579..$708BF`: its final instruction at `$708BC` jumps to the shared epilogue. `$708BF` starts another service's script, so decoding linearly through `$70B9D` would admit unused service scripts. The used script contains 24 packed messages, 14 gap-helper calls, three waits of each of 50, 100 and 150 ticks, and cabin-sequence word stores. Its only control flow is the fixed calls and final jump. It contains no campaign condition, account write, timed-script opcode or clock-rate store.

In the reduction below, `W(n)` is call/reset/wait-until-counter-at-least-n/return; `B` is the shared gap helper; `T` is one packed message; `C(value)` stores the cabin-sequence offset. The values are selector facts, not promoted animation data.

```text
W100 C0407 T B T B T
W100 C0407 T B W100 C0415 T T B T T
B C0407 T B C0407 T T B C0415 T
B T T C0410 T B T B W50 C040A T T
B W50 T T B W50 C0410 T
W150 W150 B T T B W150 T
jump closing epilogue
```

`W50` is `$766DF..$766E6`; `W100` is `$766E6..$766ED`; `W150` is `$766ED..$766F4`. The wait counter `$7236` increments once per unpaused tick and compares unsigned. Each opcode still consumes one interpreter invocation; a wait of n is not an n-frame delay. The used gap `$76710..$76721` clears flag 13, sets message hold to 50, requests ID message `$32` (the shared blank), restores hold 200, sets flag 13 and returns. The closing `$766BF..$766D2` also clears script-active flag 6 before returning. Including the closing epilogue, there are 15 blank requests. Script waits and message holds depend on ordinary ticks, not accelerated game seconds. For independent calculation, each `C` consumes one invocation; each `T` requests hold 200; `W(n)` consumes call, reset, as many repeated unsigned wait-test invocations as needed, and return; `B` consumes the seven instructions listed above. The final jump consumes one invocation, then the closing epilogue consumes clear flag 13, hold 50, blank request, hold 200, set flag 13, clear flag 6 and return. Start from hold 200, idle bar, wait counter zero, and an outer return to idle; increment wait and message counters on each tick before script processing. These facts and the reduction are sufficient to rebuild the calculation without the ignored model or original dialogue text.

At `$52860`, a busy message `$723A` suppresses opcode execution. A continuing message `$7230` resumes before a queued script; then `$711C` is checked; only then is one opcode fetched. `$55A1A` first rejects an unavailable script (availability bit 7 clear). While flag 6 is set, a new script is queued only if its availability bit 5 is set; otherwise its start is refused. `$711C` is one overwriteable slot, not an unbounded FIFO. When idle, the launcher consumes availability bit 7 unless bit 6 denotes repeatability, pushes the old PC and starts the selected entry.

The captured availability is `$C0` for flight `$29`, and `$A0` for election `$77` and mining `$13`. Flight `$29` is repeatable but not queueable. Thus a late boarding attempt during active campaign dialogue may admit and arm launch while its pilot script is refused. A campaign threshold crossed during flight can queue election/mining instead. These are decoded possible branches; no universal late-boarding outcome is claimed without original-engine probes.

The message rule already recovered in [R3a](mercenary-iii-taxi-cadence.md#trip-scripts-and-messages) is unchanged: a request becomes busy/count-zero on the next tick; a hold of h clears on the h-count tick, giving h+1 ticks from request to idle. Used packed messages fit one 48-cell row. The independent restricted rule model predicts, with first script fetch on frame 2 and strictly eleven ticks before each atomic frame, the first packed request on frame 16. With the observed extra script invocation at space-entry frame 139, it predicts `$7061E` on frame 152 and the final blank on frame 737. The instrumented original instead requests them on frames 151 and 736: its loop-top interval includes 12 ticks immediately after entry, bringing the 100-tick wait across its boundary one frame earlier. It maintains eleven-tick **frame ends**, but those are not identical to a fixed eleven-tick loop-top phase. The model starts its first call at frame 2 and processes the script twice at frame 139, with no intervening tick; TOLOSA Body setup precedes the single script invocation at frame 462. Direct comparison of all 39 text/blank requests gives exact PC/order/frame agreement for the first seven and the same PC/order exactly one frame later for all 32 requests after the space-entry wait. The instrumented script returns at frame 744; the atomic model returns at 745. The main R6 report must distinguish these counts and compare phase-boundary message acceptance/refusal before declaring the cadence gate confirmed. This note does not relabel the model's missing frame as proved equivalence.

## Campaign/time effects and late waiting

Every loop top calls `$5A3D0` before input and script execution. It tests script flag 9 (bit 1 of byte `$7272`). With the flag clear, seconds at or above 32,400 attempts script `$77`; with it set, seconds at or above 61,200 attempts script `$13`. These are signed longword comparisons. Availability, active-script and queue handling determine execution; they are not unconditional event times.

The same routine then checks timed target `$7280`. If nonzero, signed countdown `$727E` negative, and script-active flag 6 clear, it clears the target and starts `$6FD44 + target` through `$55A3C`, bypassing availability lookup. The opcode `$26` (`$52F54`) stores a countdown and **bank offset**, not a script number. The timer decrements modulo 65,536 each unpaused tick; zero is not due until the following decrement. An active script can postpone dispatch until the counter becomes nonnegative again on wrap, so replacing the two words with an absolute deadline or a FIFO changes behaviour.

| Trigger/continuation | Required relevance or scope conflict |
|---|---|
| Early outward path | All observed early flights remain below 32,400 seconds, with flag 9 clear and timed target/queued script zero at the inspected near/final checkpoints of all three runs. The recovered `$29` never schedules a timer. Time-only election/mining triggers therefore do not fire within this observed path. Monotone clock progression with no day rollover supports exclusion between these endpoints. |
| Wait until 9 h before boarding, or enter flight sufficiently late | `$77` disables Bil reception/meeting availability (`$759D2/$759D5`), sets flag 9 (`$759D8`), and consumes display/script state. Its default no-candidacy/no-veto branch sets flag 23 and schedules 1,500 ticks to `$75A16` (`$75A0E`), which schedules another 750 ticks to `$75B5C` (`$75A6D`); the latter sets encounter request `$DB` (`$75BA1`). These effects are not irrelevant to the player's continued waiting/flight. |
| Wait until 17 h with flag 9 set and flag 22 clear | Mining `$13` at `$75A75` emits narrative and schedules 750 ticks to `$75B24` (`$75B1C`). That continuation writes cash account `$F8` to zero (`$75B34`), affecting future admission. Flag 22 changes this branch. |
| Script-active threshold crossing | Election/mining can occupy or overwrite `$711C`; their availability is queueable. A timed continuation is separately retained in `$7280`. Ordering can therefore affect message acceptance, cash and admission. |
| Later campaign branches | Candidacy/veto/result alternatives depend on earlier campaign state not acquired by the selected fresh path. They are not admitted as implemented gameplay by this report; no universal arbitrary-state exclusion is proved. |

This is a **D2 scope conflict for unrestricted late entry/waiting**. A bounded early recipe has concrete exclusion evidence; a product that keeps the player freely waiting before admission cannot silently freeze the clock, stop the threshold reader or disable every non-flight script. D2 must admit the necessary connected effects, or explicitly settle a bounded-entry contract before implementation. The findings do not prescribe a replacement cadence or invent an election-free universe.

The early TOLOSA entry also writes `$6FF48=$FFFF` and starts the resident-56–58 OBSERVER programme. Its initial timer is 1,000 **frames**, separate from `$727E`'s timed dialogue. The initial programme's trajectory control bytes are nonnegative, so its hostile-launch branch cannot run, and the used Occupancy modes refuse player shooting; there is no demonstrated kill-driven advance to the later hostile programme on this selected early path. This bounds the first programme's cash/damage/control effects, while its moving/drawn objects, active request, cursor and timer remain required state. The [main report](mercenary-iii-tourcraft-playback.md#complete-used-playback-format-and-phase-writers) and [reuse report](mercenary-iii-tourcraft-reuse.md) carry the original programme/guard evidence. A later election encounter request can override this context, reinforcing the late-entry scope conflict rather than making the initial programme dispensable.

Time-associated presentation also remains active: pause, Body turn, day/night and display rules keep their tick/frame owners. Existing [night-sky research](mercenary-iii-taxi-night-sky.md) shows that these already depend on retained fractional and cached state. Scene/cost changes can alter original natural flight timings; they are not grounds to omit presentation or campaign state from future equivalence checks.

## Future-affecting state and remaining verification

Preserve rate, period, fraction, seconds/day, pause, current script PC/return stack, active and relevant campaign flags, availability bytes, queued script, unsigned wait counter, timed target/signed countdown, current hold/busy/message continuation and cabin state, six-byte BCD cash and price descriptor. Clock values alone cannot reconstruct script waits or queued future effects. The ordinary early path permits testing these with empty campaign queues; empty queues are still checkpoint facts, not an invariant of late entry.

Static clock/rate writers, used script, BCD charging and connected threshold/timed branches are recovered. Remaining implementation gates are a fully explicit fixed atomic-frame interpretation across phase reentries and its original-engine message/refusal comparison, and a D2 decision resolving arbitrary late-entry/waiting campaign effects. Natural execution of the complete late campaign branch is not claimed. No emulator was run by this companion research task; R6 observations were supplied by the main experiment and checked against its retained RAM. The three-point dilation calculation reads Dion tables, not Damocles payload data.

## Source-range ledger

Ranges are half-open. Stable hashes pin the decoded reader facts, not an assertion that whole RAM reproduces across boots.

| Range | Role | SHA-256 |
|---|---|---|
| `$4DA1C..$4DA6C` | Period/fraction/Body-rate selection | `d07a0054e3fbe65f629708b0590d268e0dced6a16d2ef69e82ba450a75860f14` |
| `$5319C..$53234` | Clock rollover/refill/display entry | `631f446e95943dee01862c5c326ec00a011e354836bb31388339adac4de3de5c` |
| `$591AC..$591B2` | Craft rate reset | `6255f3dc477d6c68541a19850b6fb536edb5823699d90a023e673a13f06922f5` |
| `$595D8..$596E6` | Space speed/rate arithmetic | `48e63f04870ba8382f54ffce3e1907dd8c7261ad3aeadcfdb2e27bf5ef067275` |
| `$5157E..$515CA` | Charging and exhausted-cash exit | `f0aac370cadf058d825c0e4c4fcd19792d402147009f7caf07b70b9a7aa61ddb` |
| `$4E700..$4E742` | BCD account arithmetic | `4b0f3d8fde0a28368c3ea1603fb6df9d545f6f442a60589f0d120c81c9b422e4` |
| `$70579..$708BF` | Used outward flight script | `970d61ee5b27fb9c6d8ecdd668eade4dabc6570bbcf0227d481d2769edf32f1f` |
| `$766BF..$76721` | Closing, waits, gap helper | `f8f3910c3f570f74030c6da3cf6fd44ab472139e41535c89b4601e7e457a0086` |
| `$55A0E..$55A7E` | Launcher, active/availability/queue | `c1e2c33931582856e1598012f8253d0564a079df6fb60e1ddb34a926c4539754` |
| `$52F54..$52F6A` | Timed-script writer | `497d9016489d52a444b10428436b12743427e41e71e26e90662f18935f61d9ee` |
| `$5A3D0..$5A41A` | Threshold/timed dispatch | `1dc78a8beaddb5fd75590489db14e619cece3db6e45b27df84af3348a3927db2` |
| `$759D2..$75A75` | Election/default deferred chain | `8e3e595186119d8465e610c25c6ca5534dcb77c4f05d7409bb830e627471175e` |
| `$75A75..$75BA6` | Mining, cash clearing, encounter request | `fb0957adefcf36c00f36899f6b85b8bcddd72b8cbc41b6ccc3d002b7e7c0bc80` |

Natural 50 Hz run `runs/natural50-flight-f95mbv94` pins near VBL 22,492 RAM SHA-256 `33853a7db01a918cf9da3ea63b952f06244dc6c10a69294d1af89983728a01ee` and final VBL 34,000 RAM `4a807197b68c789056541cc95428c0a82e0e0f47e49dbbe7fb45a2c20538a8bc`.

The independent rate-check captures additionally pin ordinary `v25000.ram` SHA-256 `f348bd43c2a852c7915c3c2562978f7f65b5333db0628a1c995a259886e2eff8`, ordinary `v27000.ram` `45ad93c4174943a96a832fc518a5af7602ccc3894cbd9b9f907cbc68220d3430`, and instrumented `v27000.ram` `04310e207c5d58c00431af35281037e1521f81f12c329cfabd5fa88ae2df9af2`. The calculation calls `Tables(MIII RAM)`, `fsquare`, `fadd($000A1000, ...)`, `fsqrt` and `space_word(..., True)` from the linked probe calculator.

The restricted symbolic script and independent model are `restricted/mercenary-iii-707/script29-symbolic.json` and `clock-script-model.py`. R6 captures inspected here are `runs/natural-11-4jueev7s/{near,v35000}.ram` and `runs/exact-11-14c2p26m/{near,v35000}.ram`. Retain their exact observation/trace pins with the main R6 experiment ledger; they must not be presented as unmodified natural eleven-tick execution.
