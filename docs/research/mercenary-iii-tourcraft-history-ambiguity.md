# Mercenary III: late taxi records lose campaign history

Follow-up for [R8/#709](https://github.com/odogono/mercenary/issues/709) and [I4/#711](https://github.com/odogono/mercenary/issues/711), 2026-10-02. The user accepted [ADR 0068](../adr/0068-reconcile-known-taxi-saves-with-expanded-campaign-history.md): valid late taxi records should match expanded campaign history, allowing the required cash/script changes. This report checks the separate assumption that the old record determines that history.

**Two ordinary I2 input histories produce the same complete Save Snapshot and the same validated Save bytes, while an independent application of R6's admitted scheduler rules produces different script state.** Allowing cash/script changes does not recover the missing history. Under those recovered rules, a function of the old record alone cannot match both actual uninterrupted expanded histories. This established the need for a separate reference-history decision. The user has now accepted a documented canonical expanded history for ambiguous late records under ADR 0068; the collision remains evidence of why exact actual-history equality cannot be required for that domain.

## Executable comparison

From the repository root:

```sh
bun research/mercenary-iii-st/scripts/taxi-history-audit.ts
bun test web/test/dion-history-model.test.ts web/test/dion-persistence.test.ts web/test/dion-tourcraft-content.test.ts
```

The [audit](../../research/mercenary-iii-st/scripts/taxi-history-audit.ts) archives source revision `e4cba434` into a disposable directory and checks all eight I2 code hashes from the [source audit](mercenary-iii-tourcraft-taxi-migration.md). It loads the exact allowlisted old content identity and independently validates the current promoted export. It uses the actual `sp/Start-pre` control's recorded prefix, with each advance delivered as ordinary `1/50`-second calls. It never constructs or restores a fabricated source snapshot, changes a source clock/pose/flag, writes browser storage or starts TOURCRAFT remotely.

Both histories begin from New Game, call and approach the taxi, board and select the spaceport. At that checkpoint they wait before pressing the ordinary Start action:

| Input/checkpoint | Earlier departure | Later departure |
| --- | ---: | ---: |
| Global frame immediately before Start | 81,692 | 147,228 |
| Source clock seconds before Start | 17,972 | 32,390 |
| Start invocation | Next atomic frame | Next atomic frame |
| Completion check / ordinary Leave | Frame 147,788 / next frame | Frame 147,788 / next frame |
| Captured global tick / frame | 1,625,679 / 147,789 | 1,625,679 / 147,789 |

The Start times differ by 65,536 atomic frames, or 720,896 ticks. The old unsigned wait counter therefore loses that timing difference. Both taxis naturally finish before the shared Leave checkpoint. The common Leave also gives identical retained sound state. These facts explain the collision; the audit nevertheless compares the **entire** captured state, not just these selected counters.

Both source snapshots have day 0, seconds 32,514, clock accumulator 1,344, cash `005100900000`, idle PC and wait 847. Their SHA-256 over `JSON.stringify(captureResume())` is `5669b4b1c9d5be601acf92f86ca8ccccc0a1b8073ff18f475727484e599b8e07`. With identical explicit `savedAt`/`where` metadata, both Save byte strings hash to `b36ea9777f49869726624ad1a3e157a9ff7fa4400e8b290d0edeccf904bf5970`. Full old identity/nested validation and Save/Session Resume round trips pass for both. Session Resume state/identity/envelopes are identical after excluding only automatic `savedAt` wall-time metadata; that timestamp does not encode taxi Start timing.

## Independent scheduler witness

The [research model](../../research/mercenary-iii-st/scripts/taxi-history-model.ts) reads admitted decoded instructions and the coherent initial VM/availability facts. It independently applies R6's threshold-before-input ordering, availability bits, overwriteable queue, return stack, one-invocation interpreter, message holds, unsigned wait and signed modulo timer. Observational wrappers feed actual old external script/message attempts to the model and preserve every source method's return value and Session State.

There is no flight in these two prefixes. The taxi trajectory and ordinary clock supply the same documented preflight environment. The admitted passive encounter closure supplies no additional hostile/candidacy/veto writer that could erase this VM distinction. The model records the last encounter request emitted by a script; it does **not** model the encounter reader's subsequent consumption or actor state.

| Required script owner at the common checkpoint | Earlier departure | Later departure |
| --- | --- | --- |
| PC | null | `$75A09` |
| Active flag 6 | false | true |
| Set flags | 9, 13, 15, 23 | 6, 9, 15 |
| Queued ID | 0 | `$77` |
| Return stack | empty | null sentinel, `$703B4` |
| Message hold remaining | 0 | 25 ticks |
| Timed target / countdown bits | 0 / 63,778 | 0 / 12,692 |
| Unsigned wait | 2,805 | 847 |
| Last script-emitted encounter request | `$FFDB` | none |

The earlier history completes the taxi script before election becomes due. The later history starts that script just before the threshold, so the recovered active/queue/clear-before-return ordering delays and nests election. The distinction includes active script state and flag 23, not merely an unobservable expired timer. The complete deterministic summary is retained in the [evidence ledger](../../research/mercenary-iii-st/taxi-history-evidence.json).

The model's tests check threshold-before-timer priority, queue admission without availability consumption, zero versus negative timer dispatch, retained return stacks, bounded default election/mining completion and cash clearing. They also retain 39 pilot requests and independently match R6's frame 16/152/715 text checkpoints with its frame-139 zero-tick reentry. These are checks against documented facts, not a full original-machine or browser fidelity certification.

## Consequence for D2/R8

Let the two input histories be `h1` and `h2`. The executed source comparison gives `O(h1) = O(h2)`. The independent recovered scheduler witness gives `E(h1).VM != E(h2).VM`. Any deterministic migration `M` receiving only that identical old record must choose the same output for both. It therefore cannot satisfy both `M(O(h1)) = E(h1)` and `M(O(h2)) = E(h2)` under the exact actual-history contract, even with authorization to change saved cash/script state.

The old schema stores no input history. Its `savedAt`, tick count and source validation do not recover the lost Start time. Adding a history recorder now cannot retrofit these records. Source storage remains protected until a validated replacement transaction succeeds. No VM migration, delayed-at-Load campaign, arbitrary clock cutoff or blanket taxi-Save refusal is implemented by this research audit.

On 2026-10-02 the user accepted an explicitly documented canonical expanded history for ambiguous late records. That reference replaces equality with the unknowable actual history only for this domain. Its selection must be deterministic for identical validated source state; R8/I4 must document the rule and eligibility, reconstruct against uninterrupted canonical expanded execution, and prove first-frame and identical-input future comparisons. All 33 early taxi controls retain their existing full preservation and exact independent expanded-play comparisons. This report establishes the collision and records the accepted reference policy; it does not implement the reconstruction algorithm.

## Evidence limits and validation

Executed: two uninterrupted old simulations, exact full-state/Save-byte collision, both original codecs' round trips, the pinned-source checks, strict promoted-content admission, four scheduler-model tests, and the existing 33-control persistence and content admission tests. Type checking and lint cover the new test/model; the CLI is additionally checked as a standalone TypeScript entry. No shared runtime or payload changes are included.

The prefix inputs are accelerated ordinary browser **simulation API** inputs, not production keyboard checks or natural original-machine input. The scheduler is an independent research witness over already recovered facts. No full expanded Gameplay Session, original-engine run of this exact history pair, actor/audio/raster comparison, flight Save codec, migration transaction or production-browser check is claimed. #709 and #711 remain open for reconstruction and their other implementation/proof gates under the now accepted canonical-reference policy.
