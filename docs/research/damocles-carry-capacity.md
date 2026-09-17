# Damocles carrying capacity, refusal and special carried items

Working-Authority Evidence for [#316](https://github.com/odogono/mercenary/issues/316), recovered 2026-09-17. The Carried Stack has **one authored capacity of 10, one object that raises it to 20, and exactly one comparison that enforces it**. Beyond that comparison the take handler's refusals are all per-object handling bits, and the only things that override them are the **two ANTIGRAV residents** — which make the twenty-one craft-class objects takeable and nothing else — and a **self-modified operand** whose default names resident slot 0. The BRIEFCASE does not merely widen the stack: dropping it **puts the overflow away inside itself** and taking it back restores that overflow exactly.

[ADR 0002](../adr/0002-separate-rom-research-from-implementation.md) permits factual recovery, not translation of the Working Authority into application code. Original captures, RAM, native listings and game text remain ignored Restricted Material under `research/damocles-st/work/`, consistent with the [research boundary](damocles-gap.md); only decoded facts and hashes are recorded here.

## What was already established

[The pickup note](damocles-limo-key-pickup.md) recovered the take handler's gate list and recorded capacity as "**10** in the observed captures, raised to 20 on the one special slot `$6C` path" without recovering what that path does. [The selection note](damocles-object-selection.md) recovered the `$6FAA` handling byte, its census over the 241 resident slots with a model, and stated the ANTIGRAV override as bypassing "the bit 4 and bit 5 refusals". [The drop note](damocles-limo-key-drops.md) resolved three of the refusal words — `$04DDD0` as the inventory-label scroll counter, `$7AA8 = $78` as the VOID body, and the `$795C`/`$04E158` pair as a Trading Post monetary check — and recovered the drop's two placement paths. [The location ledger](damocles-gamma-system-location-ledger.md) established that BRIEFCASE is resident slot 108 and the two ANTIGRAVs slots 157 and 158, and that none of the three has a recovered parent placement.

This note adds the capacity rule and its single enforcement, the BRIEFCASE's whole reversible effect, what each ANTIGRAV actually overrides, the roles either side of the drop's rank comparison, the take and drop paths that are not the input handler at all, and the carried-object consequences that no handling bit predicts.

## Evidence and method

Static recovery reads bounded windows of the pinned first-world capture `observe-first-world-20260818T101013Z-c5a32b7d/observed.ram` (SHA-256 `b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967`) with Capstone's M68K 68000 big-endian decoder, and scans the whole 1 MiB image for every reference to the addresses named below, so the negative results are bounded rather than assumed.

Runtime evidence comes from the tracked [carry capacity probe](../../research/damocles-st/scripts/carry-capacity-probe.py). It is a **checkpoint** probe, not an ordinary-route observation: each case boots `snapshots/eris-spaceport-onfoot.sav` in **its own emulator**, holds interrupts at IPL 7, writes the state one gate needs, sets the program counter to the original handler's own entry, and stops at whichever of the handler's five exits it reaches. The walk, the input path and the scene pass that normally writes the selection are all bypassed, so these cases establish what the handler does with a given state — not that ordinary play can reach that state.

```sh
research/damocles-st/lab doctor --roms /path/to/roms
python3 research/damocles-st/scripts/carry-capacity-probe.py --roms /path/to/roms
python3 research/damocles-st/scripts/carry-capacity-probe.py --roms /path/to/roms \
  --case briefcase-drop-overflow --case antigrav-a-craft
```

## The Carried Stack is rotatable, and its head is what a Drop removes

The stack is a **byte array at `$61CE`** with a count word at `$61CC`, and four routines own it:

| Routine | Operation |
|---|---|
| `$04DCE4` | Take. Shifts entries `0 … n−1` up one and stores the new slot at **index 0**, then refreshes the panel label from the head. |
| `$04DC40` | Drop. Reads the slot at **index 0**, shifts the rest down one, and returns it. With one entry it instead points the label at the blank record and starts the scroll. |
| `$04DC74` | Rotate forward. Moves the head to the tail, refreshes the label, requests a sound and starts the scroll at `+16`. |
| `$04DCF6` | Rotate backward. Moves the tail to the head, with the scroll at `−16`. |

The keyboard dispatcher at `$0555B8` gives all four to the **arrow keys**: `$48` Up takes, `$50` Down drops, `$4B` Left rotates forward and `$4D` Right rotates backward. The take and drop halves of that were already recovered by [the pickup note](damocles-limo-key-pickup.md#the-ordinary-take-is-native); the two rotations complete the set.

So a Drop removes **the object the panel is currently naming**, and the player chooses it by rotating. That is a materially different rule from "the most recently acquired", which is what the [`CONTEXT.md`](../../CONTEXT.md) glossary's Carried Stack entry currently states ("its tail is the next object a Drop removes"). The Damocles storage order is head-first, and rotation means the next Drop is not a function of acquisition order at all. **This contradicts the glossary and needs a `/domain-modeling` amendment before the term is used in implementation work.**

Both rotations and the sole-object drop set `$04DDD0`, the inventory-label scroll counter, to ±16, and **both handlers refuse silently while it is nonzero**. An immediate re-take after a drop, or a drop immediately after a rotation, is therefore refused; the `gate-label-scrolling` cases below reproduce that refusal by setting the counter directly.

## Capacity has one comparison, and it is an equality

`$054240`–`$054248` is the whole rule:

```
d1 = $61CC            ; Carried Stack count
cmp.w $7A04, d1       ; capacity
beq   → return        ; silently
```

`$7A04` holds **10** in the pinned capture and in every checkpoint baseline. The whole image contains **four** references to it and no others: this comparison, the write of `$14` at `$05426C`, the test for `$14` at `$0543C4`, and the write of `$0A` at `$05463C`. There is no initialiser, no save-time write and no per-body variation.

Because the test is `beq` and not a bound, a count **above** capacity is accepted: a stack of 11 against a capacity of 10 takes a twelfth object. That is reproduced below. **No recovered path reaches that state.** Ordinary takes pass through the equality one at a time, and the BRIEFCASE's arithmetic keeps its own totals inside 20 — a drop truncates to ten and then removes one, and the largest store it can leave is ten, which a re-take merges into a stack of nine. So the row below records what the comparison does, not a reachable state; it matters because a port that writes `count >= capacity` and a port that writes `count != capacity` differ only here, and only one of them is the original.

## The panel gauge is why the count is doubled

`$0543BE`, called after every take, every drop and every scripted removal, is three instructions:

```
$787C = $61CC
if $7A04 ≠ $14 then $787C = $787C * 2
```

`$0528CC` consumes `$787C` as the target of a **twenty-segment fullness gauge**, stepping the drawn level at `$527CA` one segment per call toward it and setting or clearing bit 5 of one byte per segment in both screen buffers, at a row taken from the table at `$043190` indexed by `20 − level`. Ten objects at capacity 10 and twenty at capacity 20 both fill the same gauge. The doubling is a display scale, not a weight: nothing else reads `$787C`.

A count above capacity drives the target past 20, which indexes the row table beyond its twenty entries. The probe records the target; with interrupts held the stepper never runs, so **what the gauge draws past full is not observed here** and is recorded as a blocker rather than described.

## The take handler's refusal order

Entry `$0541F0`. Every refusal before the capacity test is silent unless stated.

| Order | Test | Address | Refusal |
|---:|---|---|---|
| 1 | Selection distance exponent ≤ 8 | `$0541F0` | Silent. Recovered as distance under 512 source units by [the selection note](damocles-object-selection.md). |
| 2 | A selection exists, and it is not slot 0 | `$0541F8`, `$054200` | Silent |
| 3 | Body selector ≠ `$78` (VOID) | `$054204` | Silent |
| 4 | Inventory-label scroll counter `$04DDD0` = 0 | `$05420C` | Silent |
| 5 | **Bypass**: slot 0 carried | `$054214` | Skips tests 6 and 7 |
| 6 | Handling bit 4 clear | `$05421E` | Silent |
| 7 | **Bypass**: slot 158, slot 157, or the patched operand carried | `$054224`, `$05422A`, `$054230` | Skips test 8 |
| 8 | Handling bit 5 clear | `$054238` | System string index `$02` |
| 9 | Count ≠ capacity | `$054240` | Silent |
| 10 | If the selection is the Trading Post's offered slot `$795C`: room `$7AFC` = 9, and the price at `$7956` subtracts from the balance at `$7C42` without going negative | `$05424A`–`$05425C` | Silent for the wrong room; system string index `$0C` for an unaffordable price |

**This corrects the selection note.** Its statement that the four tests "bypass the bit 4 and bit 5 refusals entirely when slot 157, slot 158 or slot 0 has bit 7 set" merges two different bypasses. Only the slot-0 test at `$054214` is ahead of bit 4. The ANTIGRAV tests sit **between** the two refusals and can only reach bit 5. Carrying an ANTIGRAV therefore never makes a bit-4 object takeable, and the checkpoint cases reproduce both halves of that.

`$054230` is not a slot-0 test at all. Its operand is a **long absolute address that the restore path at `$055190` writes**: `$0551B4` stores the array base `$6FAA` there as a default, and `$055258` re-points it at the live handling byte of a restored carried object whose source identifier is 27. The identical pattern patches `$05190A`, the operand of the carried test at `$051908`, from `$05526C` for source identifier 40. In the pinned capture both still hold `$6FAA`. What that restore path is, and which objects identifiers 27 and 40 name, is **unresolved**; it rebuilds a Carried Stack from a 64-entry identifier namespace, assigns each entry a fresh resident slot from `$10` upward and restores a six-byte BCD balance, which is not the authored resident-slot namespace the handlers otherwise use.

## What the two ANTIGRAVs do, and what they do not

Slots 157 and 158 are referenced at **exactly one address each in the whole 1 MiB image** — `$05422A` and `$054224`. Carrying either sets the same single override, and the tests are independent `bmi` branches to the same target, so:

- carrying either one is sufficient;
- carrying both is indistinguishable from carrying one;
- removing one while the other is still carried leaves the override in place;
- removing both restores the refusal immediately, because the handler reads the live handling byte rather than the Carried Stack.

The class it unlocks is handling byte `$20`: **all twenty-one craft instances, including every TRANSPORTER and the V.I.P. LIMO in slot 5**. With an ANTIGRAV carried, a craft selected in range is taken onto the Carried Stack like any other object — its handling bit 7 is set, its Association B becomes the carried form, and it stops being drawn. The probe reproduces that. What a carried craft then does — whether it can be dropped, boarded, or flown, and what the paired vehicle-key relation means while it is carried — is **not recovered here and must not be assumed**; this note establishes the take, not a vehicle behaviour.

## The handling-class census

All 241 resident slots that carry a model, from `payload/damocles/catalogue.json` schema 12:

| Byte | Count | Takeable | Refusal | What carries it |
|---:|---:|---|---|---|
| `$00` | 4 | yes | — | Benches and one NEUTRON FUEL; demands no support |
| `$04` | 76 | yes | — | Ordinary objects: keys, lamps, kegs, BRIEFCASE, both ANTIGRAVs |
| `$05` | 85 | yes | — | Ordinary objects that can themselves support rank 1 |
| `$08`–`$0F` | 45 | yes | — | Furniture: chairs, settees, beds, desks, tables, rugs |
| `$10` | 10 | no | silent | Slots 0, 9, 29, 74, 156 and 248–255; only 74 and 156 have a model |
| `$20` | 21 | no | message `$02` | Every craft and all three TRANSPORTERs |

Bit 6 is set on no slot. The low nibble is not one rank but two: bits 0–1 and bits 2–3 are compared against each other by the drop handler, and the payload names them `suppliedSupportRank` and `requiredSupportRank` after those roles.

## The drop handler: which side of the rank comparison is which

`$0545A2`–`$0545D0` loads two handling bytes. `a0` is built from **`$61CE` index 0** — the object being dropped — and `a1` from the live selection. Then:

```
d0 = handling(dropped)   & $0C      ; the support rank the dropped object demands
if d0 = 0 → refuse, system string index 9
d2 = handling(selected)  & $03      ; the rank the selected object supplies
if d2 = 0 → refuse, system string index 9
if d2 * 4 < d0 → refuse, system string index 9
```

So the **demand** is bits 2–3 of the dropped object and the **supply** is bits 0–1 of the support, which is what the payload's `requiredSupportRank` and `suppliedSupportRank` name. An ordinary key (`$04`, `$05`) demands rank 1 and supplies rank 0 or 1; a table (`$0F`) supplies 3. That is why a key can be put on a table and not on another key.

`$0545AC` bypasses the entire comparison when **resident slot 39 — `DOOR KEY A`** — has its carried bit set. Like the ANTIGRAV addresses, `$7046` appears once in the whole image. `$054622` similarly lets a carried **slot 0** skip the ground-contact requirement `$7ACA` on the direct-placement path. Neither has a recovered writer for its carried bit other than an ordinary take, and slot 39's placement is not recovered, so both are reachable-in-principle rather than observed in play.

## Take and drop paths that are not the input handler

A `handling.takeable` flag does not establish the absence of a special path, and three exist:

- **`$0541E0` — the scripted gift.** Entered with a slot in `d0`, it jumps straight to the capacity test, skipping selection, range, body, scroll, handling bits and the monetary check. Its only caller is `$04D838`–`$04D85C`, which removes slot 95 (`MAGIC CRYSTAL`) through the removal path below, gives slot 219 (`CHEESE SANDWICH`), requests a sound and launches trigger `$15`. That is a **different** trigger from the `$14` the MAGIC CRYSTAL's own pickup fires, which [the pickup-responses note](damocles-pickup-responses.md) recovers; this routine is a later consequence, not the pickup. A gift is therefore refused when the Carried Stack is at capacity, and accepted for an object no player could take.
- **`$04CAF4` — the scripted removal.** Clears the carried bit, the Association B long and Association A byte 1, searches the Carried Stack for that slot and closes the gap, decrements the count and refreshes the panel and gauge. It removes **by identity**, not from the head, and it does not place the object anywhere: the object leaves the world. Four callers.
- **Damocles Script opcodes on the handling byte itself.** `$051CBA` ORs and `$051CDC` ANDs a mask into `$6FAA + slot × 4` for the slot in the script register `$7C3E`, and `$051A8C` branches on its bit 7. Scripts can therefore set or clear takeability *and* the carried flag directly, and can ask whether an object is carried.

## Carried-object consequences that no handling bit predicts

`$0543FA`, called after every drop, is an **environment hazard evaluator** conditioned entirely on what is carried. It first recomputes the pressure reading `$7880` from the body's own value and the player's altitude, then:

| Condition | Consequence |
|---|---|
| Slot 135 `ACME UNIVERSAL` carried | No warning at all, whatever the readings |
| Pressure ≤ 10 and neither slot 134 nor slot 144 (`PRESSURE SUIT`) carried | Warning code 6 |
| Temperature `$787E` ≤ 20 and neither slot 137 (`THERMAL UNDIES`) nor slot 124 (`ELECTRIC FIRE`) carried | Warning code 4 |
| Temperature > 34 and neither slot 136 (`HEAT RESIST SUIT`) nor slot 92 (`SUNSHADE`) carried | Warning code 5 |
| None of the above | The warning state `$7A7C` is cleared |

The code is stored in `$7A7C`, `$7A64` is armed, and a sound is requested through `$04BF58`. The take handler does **not** call it. Its four callers are the drop path at `$054696`, `$0544DA`, `$058EC0` and `$059264`, so taking a PRESSURE SUIT does not clear a standing warning at the moment of the take. `$051902` is a second such consequence: carrying slot 57 (`SIGHTS`), or the object the patched operand names, reaches `$051912`, which clears four two-byte fields and sets four others in the panel area of the screen at `$042C00`. Neither consequence is predictable from `handling`, and both are reachable the moment those objects are.

## Observed at the checkpoints

Every row is one case of the probe, from its own emulator and its own restored snapshot. "Exit" names which of the handler's exits it stopped at — a silent return, the system-string helper with the refusal index the handler passed it, the support-rank branch, or the accepted tail. "Gauge" is the target the take or drop left in `$787C`; with interrupts held the gauge stepper never runs, so no drawn level is claimed.

| Case | What it sets up | Exit | Count | Capacity | Store | Gauge |
|---|---|---|---:|---:|---:|---:|
| `capacity-empty` | Ordinary take, empty stack | accepted | 0 → 1 | 10 → 10 | 0 → 0 | 2 |
| `capacity-nine` | Ordinary take, one below capacity | accepted | 9 → 10 | 10 → 10 | 0 → 0 | 20 |
| `capacity-full` | Ordinary take at capacity | silent | 10 → 10 | 10 → 10 | 0 → 0 | 0 |
| `capacity-over` | Ordinary take with the count already above capacity | accepted | 11 → 12 | 10 → 10 | 0 → 0 | 24 |
| `capacity-twenty-nineteen` | Ordinary take at capacity 20, one below | accepted | 19 → 20 | 20 → 20 | 0 → 0 | 20 |
| `capacity-twenty-full` | Ordinary take at capacity 20, full | silent | 20 → 20 | 20 → 20 | 0 → 0 | 0 |
| `class-silent` | Handling `$10`, slot 156 | silent | 0 → 0 | 10 → 10 | 0 → 0 | 0 |
| `class-message` | Handling `$20`, craft slot 7 | message `$02` | 0 → 0 | 10 → 10 | 0 → 0 | 0 |
| `class-support` | Handling `$0F`, table slot 114 | accepted | 0 → 1 | 10 → 10 | 0 → 0 | 2 |
| `antigrav-a-craft` | Craft slot 7 with slot 157 carried | accepted | 1 → 2 | 10 → 10 | 0 → 0 | 4 |
| `antigrav-b-craft` | Craft slot 7 with slot 158 carried | accepted | 1 → 2 | 10 → 10 | 0 → 0 | 4 |
| `antigrav-both-craft` | Craft slot 7 with both carried | accepted | 2 → 3 | 10 → 10 | 0 → 0 | 6 |
| `antigrav-listed-not-carried` | Slot 157 on the stack with its carried bit clear | message `$02` | 1 → 1 | 10 → 10 | 0 → 0 | 0 |
| `antigrav-a-silent` | Handling `$10` with slot 157 carried | silent | 1 → 1 | 10 → 10 | 0 → 0 | 0 |
| `slot-zero-flag` | Handling `$10` with slot 0 carried | accepted | 0 → 1 | 10 → 10 | 0 → 0 | 2 |
| `briefcase-take` | BRIEFCASE taken, empty stack, empty store | accepted | 0 → 1 | 10 → 20 | 0 → 0 | 1 |
| `briefcase-take-with-store` | BRIEFCASE taken over four carried, three stored | accepted | 4 → 8 | 10 → 20 | 3 → 3 | 8 |
| `briefcase-take-when-full` | BRIEFCASE taken at capacity 10 | silent | 10 → 10 | 10 → 10 | 0 → 0 | 0 |
| `briefcase-drop-other-item` | Drop an ordinary head while BRIEFCASE is carried | accepted | 12 → 11 | 20 → 20 | 0 → 0 | 11 |
| `briefcase-drop-exact` | BRIEFCASE dropped from exactly ten | accepted | 10 → 9 | 20 → 10 | 0 → 0 | 18 |
| `briefcase-drop-overflow` | BRIEFCASE dropped from fifteen, stopped at the message | message `$01` | 15 → 15 | 20 → 10 | 0 → 5 | 0 |
| `briefcase-drop-overflow-complete` | The same drop, message gate pre-raised, run to its end | accepted | 15 → 9 | 20 → 10 | 0 → 5 | 18 |
| `briefcase-retake-after-overflow` | That state taken back: the fifteen restored exactly | accepted | 9 → 15 | 10 → 20 | 5 → 5 | 15 |
| `script-give-craft` | Scripted gift of craft slot 7 | accepted | 0 → 1 | 10 → 10 | 0 → 0 | 2 |
| `script-give-when-full` | Scripted gift at capacity | silent | 10 → 10 | 10 → 10 | 0 → 0 | 0 |
| `gate-out-of-range` | Selection exponent 9 | silent | 0 → 0 | 10 → 10 | 0 → 0 | 0 |
| `gate-no-selection` | No selection | silent | 0 → 0 | 10 → 10 | 0 → 0 | 0 |
| `gate-void-body` | Body selector `$78` | silent | 0 → 0 | 10 → 10 | 0 → 0 | 0 |
| `gate-label-scrolling` | Inventory-label scroll counter 16 | silent | 0 → 0 | 10 → 10 | 0 → 0 | 0 |
| `drop-gate-label-scrolling` | Drop with the scroll counter at 16 | silent | 1 → 1 | 10 → 10 | 0 → 0 | 0 |
| `drop-gate-empty-stack` | Drop with an empty Carried Stack | silent | 0 → 0 | 10 → 10 | 0 → 0 | 0 |
| `trade-affordable` | Offered slot, room 9, affordable price | accepted | 0 → 1 | 10 → 10 | 0 → 0 | 2 |
| `trade-unaffordable` | Offered slot, room 9, unaffordable price | message `$0C` | 0 → 0 | 10 → 10 | 0 → 0 | 0 |
| `trade-other-room` | Offered slot outside room 9 | silent | 0 → 0 | 10 → 10 | 0 → 0 | 0 |
| `drop-direct` | Drop with no selection | accepted | 1 → 0 | 10 → 10 | 0 → 0 | 0 |
| `drop-rank-refused` | Drop onto a support that supplies rank 0 | message `$09` | 1 → 1 | 10 → 10 | 0 → 0 | 0 |
| `drop-rank-met` | Drop onto a table, which supplies rank 3 | rank passed | 1 → 1 | 10 → 10 | 0 → 0 | 0 |
| `drop-rank-bypassed` | The same rank-0 support, with `DOOR KEY A` carried | rank passed | 2 → 2 | 10 → 10 | 0 → 0 | 0 |

The Carried Stacks themselves are recorded in the run's `result.json`. Four of them
carry the findings the counts alone do not:

- `briefcase-take-with-store` turned `[30 31 32 33]` with a store of `[201 202 203]`
  into `[108 30 31 32 33 201 202 203]`: the store is merged **at the tail**, and the
  BRIEFCASE is then pushed at the head.
- `briefcase-drop-overflow-complete` turned `[108 30 … 38 40 41 43 44 45]` into a stack
  of nine, `[30 … 38]`, with five put away. Index 9 is left holding a copy of the first
  stored entry, which the re-take overwrites.
- `briefcase-retake-after-overflow` took that exact state and produced
  `[108 30 … 38 40 41 43 44 45]` again — the original fifteen, in the original order.
- `briefcase-drop-other-item` dropped an ordinary head while the BRIEFCASE was still
  carried: capacity stayed 20, the store stayed empty, and the gauge target was the
  undoubled count.

Every accepted take makes the same five changes besides the count, and they are
identical for a craft taken under an ANTIGRAV and for an ordinary object: handling
bit 7 is set on **that object only** (`$05` → `$85`, `$20` → `$A0`), its Association B
becomes the carried form `$78010010`, the panel label pointer moves to the object's
own record, the panel-dirty word `$7A8A` is raised, and a sound is requested by
writing `$3` to `$7A78` and `$04C556` to the callback `$04BF54`. The scroll counter
goes to `−16` on a take and `+16` on the drop that empties the stack. An accepted
drop clears the same handling bit and points the label at the blank record. Every
silent refusal changed **nothing at all** in any sampled field.

## Persistence invariants

For a Gameplay Session that saves and restores this state, the recovered rules give these invariants. They are derived requirements, not emulator observations.

1. **Capacity is not independent state.** It is 20 if and only if the BRIEFCASE is on the Carried Stack, and 10 otherwise. A restore that carries a saved capacity can disagree with the saved stack; a restore that recomputes it cannot. The original's own restore path writes neither `$7A04` nor `$61CA`, which is one reason its identity is recorded as unresolved below.
2. **The Carried Stack is ordered and its head is significant.** Save the order, not a set: the head is what the panel names and what the next Drop removes, and rotation is a player action that changes it.
3. **The briefcase store is separate state.** `$61CA` counts objects held **inside** the dropped BRIEFCASE and they live in the stack array beyond the count, at indices 10 upward. A save must carry both the count and those entries, and a restore must not compact them into the stack.
4. **Carried flags are per-object residence, not a copy of the stack.** Every override in both handlers reads handling bit 7, never the array. A restore that rebuilds one without the other produces objects that are carried but not listed, or listed but not carried, and the probe's `antigrav-listed-not-carried` case shows the handler following the flag.
5. **Special-item consequences are recomputed, never stored.** The ANTIGRAV override, the DOOR KEY A bypass, the hazard warning and the gauge target are all functions of what is carried at the moment they are read. Save the residence; derive the consequence.
6. **The inventory-label scroll counter gates both handlers.** It is short-lived presentation state; a save taken mid-scroll must either restore it or land it at zero, and must not restore it in a way that leaves a session permanently refusing.

## Confirmed, derived and unresolved

**Confirmed** (static recovery plus reproduced checkpoint observation): the single capacity comparison and that it is an equality, with acceptance above capacity; capacity 10 and the BRIEFCASE's 20; the gauge target and its conditional doubling; the take handler's refusal order and which refusals are silent; the four refusal message indices reached here — `$01` for the briefcase overflow, `$02` for the handling-bit refusal, `$09` for the drop rank and `$0C` for an unaffordable purchase — each read from the index the handler passed the system-string helper; that either ANTIGRAV alone overrides the bit-5 refusal, that both together add nothing, and that the override follows the handling bit rather than stack membership; that no ANTIGRAV overrides the bit-4 refusal; that a carried slot 0 does override bit 4; the BRIEFCASE's whole cycle — expansion, overflow merge on take, contraction, overflow store and message index 1 on drop, and an exact round trip; that a BRIEFCASE take is refused at capacity before it can expand; that dropping an ordinary object while the BRIEFCASE is still carried leaves capacity at 20 and the store empty, because the contraction is keyed on the Carried Stack head; the scroll-counter gate on both handlers; the VOID body, out-of-range and no-selection refusals; the monetary check's room condition, both its outcomes and that a refused purchase leaves the balance unchanged; that the scripted gift path is refused at capacity and accepted for a craft; that the drop's rank comparison refuses with index 9 and that carrying `DOOR KEY A` skips it, reaching the support branch with a support the comparison would have rejected.

**Derived from instructions, not reproduced at runtime**: the rotation routines and the scroll counter's ±16 sign; what the support branch does after the rank comparison, which the rank cases stop at rather than run through; the slot-0 ground-contact bypass; the scripted removal path; the script opcodes on the handling byte; the hazard evaluator's table and the `SIGHTS` panel consequence; that `$7A04`, `$61CA` and the two ANTIGRAV addresses have no other references in the image, which is a whole-image scan rather than an observation.

**Unresolved, and blocking**:

- **The restore path at `$055190`.** It rebuilds a Carried Stack and a BCD balance from a 64-entry identifier namespace, assigns fresh resident slots, and self-modifies two handling-byte operands. Its caller was not found, and identifiers 27 and 40 are not resolved to objects. Until it is identified, the patched operand at `$054230` cannot be given a meaning, and **the original's own persistence format for the Carried Stack is not recovered**.
- **What the gauge draws above twenty segments.** The over-capacity take is reproduced; the drawing that follows is not.
- **Whether a carried craft can be dropped, boarded or flown**, and what happens to its paired vehicle key while it is carried.
- **Ordinary reachability of all three special items.** BRIEFCASE, both ANTIGRAVs and DOOR KEY A have selectors and no recovered parent placement ([the ledger](damocles-gamma-system-location-ledger.md)), so nothing here is an ordinary-route observation of picking one up. The behaviour is recovered; the route is not.
- **Bit 6 of the handling byte**, which nothing in the census sets and nothing in the handlers reads.

No temporary authored behaviour is proposed for any of these. Each is a blocker on the implementation that would need it.

## Smallest faithful implementation boundary

The session-facing rule is small: a Carried Stack with a head, a rotate action, a capacity that is derived rather than stored, one equality test before a take, a per-instance handling byte with two refusal bits, one override keyed on carrying either ANTIGRAV, and one object whose drop and re-take move the overflow in and out of itself. Everything else recovered here — the hazard evaluator, the scripted paths, the monetary check — belongs to work that can reach the objects concerned, and none of it should be implemented before its object has a recovered placement.

## Evidence identities

All hashes are SHA-256. Laboratory machine: ST, 1 MiB; program and TOS images are checked against [`working-authority.json`](../../research/damocles-st/config/working-authority.json).

| Input | Hash |
|---|---|
| Working Authority STX | `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef` |
| TOS | `154803e3ff4851f3dc358b91b16d6b6110d187a81d8132ecb665af49878939d5` |
| `eris-spaceport-onfoot.sav` | `6cee57c4d4a168792fc3974e786d706fe9f42cf577d6e8b7c63814c93d6398c6` |
| Tracked probe | `e7ffe7858816957006401c46cb7e9ad3a3a8e1b9b5d8a258d75469185d0db94e` |

Source ranges read for this note, hashed in the pinned first-world capture. The probe fingerprints the take handler, the drop handler and the Carried Stack routines in every capture of every case and fails if any of them differs, which is how it establishes that it edited state and not code:

| Range | Hash |
|---|---|
| Take handler `$0541F0`–`$0542E0` | `e6139be6700a08ff7676ca198aae6808fb2dc9138b29f7b9fe73b3ee63762298` |
| Scripted gift `$0541E0`–`$0541F0` | `a2caa9e30199cc50776197a427cdd8f36227dbdccc58271f0cdff6661842f748` |
| Drop handler `$054520`–`$054744` | `32ff685b20f7b7a98476499f89b540abbef26150df2adfb297e2016e631d8f5e` |
| Gauge target `$0543BE`–`$0543D2` | `1406ba7a054e14d7cbbe88ce75c4df6775600278be1066c3db01e6a591332de1` |
| Hazard evaluator `$0543FA`–`$05449C` | `ecbaf1d1f192eb48d12b9a6ecd6ee3512edfdb58dfafc32d5f7c6f4050bb79df` |
| Carried Stack routines `$04DC40`–`$04DD60` | `33650f51804d734e2fe29461d5d8503719d1d70e0ca71bfe42aa760025a83b43` |
| Arrow-key dispatch `$055634`–`$055680` | `c6c64c0e23450710014e1513cdd3eea3014396f064a57401d058f83c3568514e` |
| Gauge drawing `$0528CC`–`$052932` | `38027ab227adca7d76daad9143626a6c9876796c734d0338207abbc57d7cd8f9` |
| Carried Stack restore `$055190`–`$055298` | `70f958f1553e0be1ba6f0a52292dc5688e703ea349fe7cbc7432e1ed8b52cf9f` |
| Scripted removal `$04CAF4`–`$04CB4C` | `a05bd707936d2871027cfab92332540288bf4ab5800e656423c256c0de1ba577` |
| Scripted gift caller `$04D838`–`$04D860` | `18ef469b59830621d6cfcb14228f988859460abacf3e8c4f93da5acd81cbbbd3` |
| Script carried test `$051A8C`–`$051AA6` | `77b987ddde968e9f8c57ab64ab48a8001a1abb7f603777e409be956b8ee2acc2` |
| Script handling-bit opcodes `$051CBA`–`$051CF8` | `4acd4ab6dedb512e47eb222c8273e4f6e728b2a8de82276299fd2030e6369ffa` |

Runs under `research/damocles-st/work/`. Hatari 2.6.1 (binary `05723606c75a1f0642395974abdce2cbbe48b0a09a747f65cdfca7ef9201e11a`), Python 3.13.15. The run's `result.json` records every case's poked inputs, the exit reached, the decoded state before and after, the window hashes and the toolchain.

| Run | `result.json` hash |
|---|---|
| `carry-capacity-20260917T183852Z-2b845a95` | `a65904786982b602bbdf7559471569bdbef8d30201dc9151179950d30532356e` |

### Claim boundary

These are **instruction checkpoints**, not ordinary gameplay. The probe writes the Carried Stack, capacity, selection and refusal words directly and enters the handler at its own entry point with interrupts held, so it establishes what the recovered handlers do with a given state and not that ordinary play can produce that state — for the three special items it demonstrably cannot yet, because none of them has a recovered placement. No frame timing, input timing or audio is established: Hatari runs with sound off and the sound requests recorded here are writes to the request words, not audible output. Nothing here is a whole-game equivalence claim.
