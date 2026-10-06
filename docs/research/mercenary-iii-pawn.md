# Mercenary III pawn transactions

[#796](https://github.com/odogono/mercenary/issues/796) ports the transaction
rules at BARGAIN TRADERS, structure `$52`, region 9. This follows
[ADR 0075](../adr/0075-port-dion-object-interaction-by-rule-not-by-admitted-object.md):
synthetic setups can exercise a rule without promoting its destination.
BARGAIN TRADERS belongs to ERIS group 18, cell `$3C`; the current playable
world does not include it.

## Original readers

The own-title disassembly is retained in
[`restricted/mercenary-iii-796/pawn-disassembly.txt`](../../restricted/mercenary-iii-796/pawn-disassembly.txt).
The pricing data comes from the pinned gameplay-opening RAM used by the
existing exporter, also retained as
[`restricted/mercenary-iii-795/opening.ram`](../../restricted/mercenary-iii-795/opening.ram),
SHA-256 `71b957b3b7124959b01bd40b896c921d37902c18cfca042bef1906b155ef0170`.
These are Mercenary III research-baseline observations, not evidence for
another Title. No new original-input route is claimed.

- `$4E61E` prices the head while the counter is empty. Its base price is the
  four BCD bytes at model record minus twenty, immediately before the name.
  `$6FF2` supplies multiplier 5; the last shop-loaded object `$6FEE` instead
  uses multiplier 15 from `$6FF0`. The result occupies six BCD bytes `$6FE6`.
- `$56286` loads the shop's offered slot, scanning downward for a resident
  matching group, cell and association 9, independently of Floor. It stores
  the slot in both `$6FEC` and `$6FEE`, then computes its price at multiplier 15.
- Drop `$557D6` runs after the ordinary body, scroll, stack and association
  gates. An existing offered slot refuses with message 11. Otherwise `$4E700`
  credits the cached price, wrapping at twelve decimal digits, and records
  the head in `$6FEC`. **This precedes the support/contact checks**: a later
  placement refusal still retains the cash credit and offered slot.
- Take `$553BE` runs after the ordinary handling and capacity gates. Only
  the offered slot requires region 9 and price subtraction `$4E71C`. Failure
  tests the sign bit of the high BCD result byte (leading digits 8/9),
  restores cash and requests message 12; success clears `$6FEC` before the
  ordinary acquisition and pickup response.

## Port and regression coverage

`m3lab.head.pawn_prices` exports named model price headers, alias entries,
the multipliers and the opening owners with source-range hashes. Model entries
without a price/name header are not price records. The browser uses the current
model-swap identity for PCB SEATED/NULL and BIL'S CHAIR.

`dion/pawn.ts` owns workspace repricing and `dion/carry.ts` keeps the cash
transfers at their original Take/Drop boundaries. The Gameplay Session applies
an early-credit outcome even when placement refuses. Schema 7 adds offered
slot, last loaded slot and cached price; restoration preserves the cached
price without rerunning a transaction. As ADR 0073 requires, incompatible
prototype records are refused instead of migrated.

`web/test/dion-pawn.test.ts` covers sale/reclaim, exact and insufficient cash,
occupied counter, ordinary/invalid regions, early credit and duplicate-payment
refusal, rotation, workspace repricing and Save/Resume futures. These are
synthetic rule controls over the real session, not an ERIS reachability claim.
