# Mercenary III: source-derived canonical single-trip reference

Bounded follow-up for [R8/#709](https://github.com/odogono/mercenary/issues/709), 2026-10-02, under the accepted [ADR 0068](../adr/0068-reconcile-known-taxi-saves-with-expanded-campaign-history.md). The [history collision](mercenary-iii-tourcraft-history-ambiguity.md) established that actual late campaign history cannot be reconstructed uniquely from an I2 record. This experiment makes one canonical reference family executable: **derive every possible Start residue for the retained single-trip recipe, require complete source matching, and choose the earliest matching departure**. It reconstructs and checks the independent research scheduler for that reference. It does not implement a Gameplay Session, migrate storage, or establish a universal source eligibility rule.

The experiment discovers a third history for the original collision. Start at frame **16,156**, **81,692** or **147,228**, followed by the same Leave at frame 147,789, produces the same complete source snapshot and Save bytes. The earliest two have identical expanded scheduler state at the common checkpoint; the latest differs. The selected single-trip reference is therefore frame **16,156**, not merely the first of the two previously reported witnesses. [Executable audit](../../research/mercenary-iii-st/scripts/taxi-history-audit.ts), [versioned ledger](../../research/mercenary-iii-st/taxi-history-evidence.json)

## Pinned source and independent replay

The [source loader](../../research/mercenary-iii-st/scripts/taxi-source.ts) archives full revision `e4cba434069ca1fbec6e72b3a99cbf775f1663c4`. It checks all eight previously documented code hashes and admits the exact old served-content digest `c50b402c04c70ab74f95a938c0f867e740ea843157e514764f2bceb84a2f44ed`. Source validation always uses those old documents and their actual decoder. Today's legacy content has a different digest; the historical allowlist is unchanged. Git must contain the pinned revision; missing history is reported explicitly and the disposable archive is removed after success or failure. [Source identity/validator audit](mercenary-iii-tourcraft-taxi-migration.md#exact-allowlisted-source-identity)

Each candidate begins independently from frozen I2 New Game, uses the actual `sp/Start-pre` input prefix, advances by ordinary `1/50`-second calls to its Start frame, presses Start, waits to frame 147,788, then presses ordinary Leave and advances eleven ticks. The audit never sets clock/pose/VM state, restores an old snapshot into the uninterrupted comparator, or writes browser storage. These are accelerated **browser simulation API** inputs, not production keyboard or original-engine natural input. Full Save and independent Session Resume source validation/round trips pass for all three, including complete nested snapshot equality. [Recorded prefix generator](../../web/test/dion-controls.ts), [audit implementation](../../research/mercenary-iii-st/scripts/taxi-history-audit.ts)

The original collision remains pinned: complete source snapshot SHA-256 `5669b4b1c9d5be601acf92f86ca8ccccc0a1b8073ff18f475727484e599b8e07`; Save byte SHA-256 `b36ea9777f49869726624ad1a3e157a9ff7fa4400e8b290d0edeccf904bf5970`. Equal Save metadata is used only to demonstrate byte equality. Reference selection uses the validated state; it reads no `savedAt`, slot, `where`, storage timestamp or browser wall time. Session Resume comparison excludes only its automatically generated `savedAt`. [Ledger](../../research/mercenary-iii-st/taxi-history-evidence.json)

## Candidate derivation and exact-match boundary

The audit observes the last **old interpreter** wait reset without changing any method result or state. In every candidate it occurs 484 atomic frames after the selected pre-Start frame. This is an executed calibration for this single-trip script and idle-prefix family, not an invariant for every I2 journey. The frozen interpreter owns modulo-65536 wait increments and opcode-2 reset. The audit fails if any candidate's actual last reset differs from the calibration. [Frozen-source pins](../../research/mercenary-iii-st/scripts/taxi-source.ts), [interpreter ownership](../../web/src/dion/script.ts), [calibration checks](../../research/mercenary-iii-st/scripts/taxi-history-audit.ts)

At a complete-frame source, let `T` be global ticks, `W` its unsigned old wait and `S` the pre-Start frame. The calibrated family requires:

```text
W ≡ T − 11 × (S + 484)  (mod 65536)
S ≡ (T − W) × 35747 − 484  (mod 65536)
```

`11 × 35747 = 6 × 65536 + 1`. Thus there is one Start residue; enumerate it every 65,536 frames from the retained prefix up to the final Leave. Saved `T = 1,625,679`, frame `147,789`, and `W = 847` give `S ≡ 16,156`. The [candidate enumerator](../../research/mercenary-iii-st/scripts/taxi-canonical-reference.ts) rejects inconsistent/nonintegral timing and invalid wait/calibration values. Its tests derive the three observed candidates from the existing ledger and retain an additional wrap. The arithmetic is a necessary timing condition, not a reachability proof.

Every enumerated candidate must independently reproduce the **entire decoded source**, its source Save round trip and Resume state/identity. A matching counter alone is insufficient. Only after those checks does earliest Start select the finite reference. In this experiment all three candidates match. If calibration or complete matching fails, the experiment fails; it does not install defaults, rewrite cash, or refuse a production Save. The complete contract must still cover naturally produced sources outside this family. [Candidate and full-source checks](../../research/mercenary-iii-st/scripts/taxi-history-audit.ts)

## Reconstructed scheduler and later-input comparison

The independent [R6 rule model](../../research/mercenary-iii-st/scripts/taxi-history-model.ts) runs from the pinned coherent expanded initial facts beside each uninterrupted old replay. It observes old external script/message attempts, then independently applies threshold-before-input ordering, availability, overwriteable queue, return stack, message holds, unsigned wait and signed modular timers. The expanded content digest admitted for these facts is `d31490d7ba44a08949f71267884f1e290074acc5885fdfae747f7aeefcfdf611`. Old routine behavior is preserved by the observational wrappers; the model is a scheduler witness, not an expanded world implementation. [R6 recovery](mercenary-iii-tourcraft-campaign.md), [model limits](mercenary-iii-tourcraft-history-ambiguity.md#independent-scheduler-witness)

| Scheduler owner at the common source checkpoint | Earliest canonical reference | Latest matching source history |
| --- | --- | --- |
| PC / active | null / false | `$75A09` / true |
| Set flags | 9, 13, 15, 23 | 6, 9, 15 |
| Queue / return stack | 0 / empty | `$77` / null sentinel, `$703B4` |
| Message hold remaining | 0 | 25 ticks |
| Timer bits / target | 63,778 / 0 | 12,692 / 0 |
| Unsigned wait | 2,805 | 847 |
| Last script-emitted encounter request | `$FFDB` | none |

The selected reference is replayed again from New Game without restoration. Its reconstructed model state and ordered text-request history are compared with the separate uninterrupted reference at the initial checkpoint and after **every one of 6,600 later neutral ticks** (600 atomic frames). Complete old source captures are also equal throughout. All three matching histories select this same reference, independently of their original Start. The comparator is a separate execution of the same research model; the comparison proves deterministic replay, while the prior R6 model tests supply separate rule checks. These checks establish deterministic scheduler reconstruction for the retained family; they do not certify an independent schema-2 codec. [Executable comparison and ledger](../../research/mercenary-iii-st/scripts/taxi-history-audit.ts)

The model retains only the **last script-emitted** encounter request. It does not advance encounter-reader consumption, programme counts/timers, actors, cabin/face animation, expanded sound, System/Body phases or flight presentation. Their full canonical reconstruction cannot be inferred from this VM result or from the final old source. Their writer domain and independent uninterrupted reconstruction remain necessary under the [state inventory](mercenary-iii-tourcraft-state-inventory.md#mutable-owners-to-serialize).

## Reproduction and completion boundary

From the repository root:

```sh
bun research/mercenary-iii-st/scripts/taxi-migration-audit.ts
bun research/mercenary-iii-st/scripts/taxi-history-audit.ts
bun test web/test/dion-canonical-reference.test.ts web/test/dion-migration-audit.test.ts web/test/dion-history-model.test.ts web/test/dion-persistence.test.ts web/test/dion-tourcraft-content.test.ts
```

The repaired migration audit independently replays all **33** original source prefixes, validates both old codec round trips for each, and reproduces both prior long-idle source digests unchanged. The selected tests pass: **40 tests, 50,482 assertions**. The history audit additionally executes all three matching histories and the separate selected-reference continuation. These finite results supplement the ten independently rechecked archived whole-machine restores; their evidence classes remain separate. [Completion audit](mercenary-iii-tourcraft-r8-audit.md#independently-checked-evidence-and-its-limits)

R8 stays open. Its remaining research contract needs total eligibility/reference selection for all admitted naturally produced early/late taxi records, deterministic construction of every expanded owner with sufficient retained inputs and justified source values, and the complete migration/checkpoint contract. All 33 early controls retain exact preservation and expanded-reference requirements. This experiment neither narrows production migration to one family nor authorizes blanket refusal, fixed flags/cash or campaign deferred until Load. Runtime/codec, first rendered frame, ordered expanded future and storage-transaction execution remain I4 work under the existing [browser acceptance](mercenary-iii-tourcraft-persistence.md#required-independent-browser-comparisons). ADR 0068 already authorizes canonical history; no new permission for that policy is requested.
