# Damocles board body and leave path

Working-Authority Evidence for
[#407](https://github.com/odogono/mercenary/issues/407), recovered 2026-09-23 while
bounding the boarding admission contract. [The arrival-routes note](damocles-arrival-routes.md#the-board-gate)
recovered the board gate's guards and its refusal chooser, and
[#404](damocles-vehicle-key-gate.md) settled the key test. Neither note decoded what
the routine does **after** its last guard passes, nor the leave path beyond the two
instructions [the V.I.P. limo note](damocles-vip-limo.md#what-the-draw-path-reads)
needed for the instance angle. This note closes both, because the contract needs
them, and corrects one premise the Occupancy map started from: **the seated eye
height is recovered, not derived.**

[ADR 0002](../adr/0002-separate-rom-research-from-implementation.md) permits factual
recovery, not translation of the Working Authority into application code. Only
decoded facts and hashes are recorded here.

## Evidence identity

Static recovery reads the pinned first-world capture
`observe-first-world-20260818T101013Z-c5a32b7d/observed.ram`, SHA-256
`b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967`, with Capstone's
M68K 68000 big-endian decoder in the laboratory virtual environment.

| Range               | Role                                        | SHA-256                                                            |
| ------------------- | ------------------------------------------- | ------------------------------------------------------------------ |
| `$0542B6`–`$0542D3` | residence removal tail shared with the take | `c41e72da2b77a95ce14ad5807d296bdae7bb0820ab48c249bc9d4718008ed80d` |
| `$0542E0`–`$0543BD` | refusal chooser, board gate and board body  | `9f44e304f1935d17df83644a3175334b1f14e21225fb4a4397ab6ac652861c26` |
| `$05449C`–`$054513` | leave path                                  | `4233e4fcba01dae102dedb2ddf19b545e8ee6def9fead2900bc622be101e1892` |
| `$0546CC`–`$054743` | the drop's direct-placement tail            | `6e17bc5b69f448eb8c50759b606641b088975e241af5102d08be1ec9562c1b85` |
| `$054744`–`$054763` | throttle preset                             | `928c8cb8fcba5cbaa976dc4c0c851c4dc0cc346e0b716a07b5ec69dd11b21384` |
| `$055634`–`$05566D` | key dispatch                                | `fab721a462e1fe20d247fb516b17ce4709dfb7b41cdd4e43e5a43b31d29b8461` |

Runtime readings come from captures already tracked by other notes; no new replay was
run and nothing was poked:

- the four occupancy RAM images in [the V.I.P. limo note](damocles-vip-limo.md#working-authority-and-evidence)
  (`occ-onfoot` `8acceaab…`, `occ-boarded` `5b6b5164…`, `occ-driving` `57df696d…`,
  `occ-left` `bd608b2f…`);
- the `result.json` samples of #404's `vehicle-key-carried-board-20260920T154305Z-fc6f9dbb`,
  `vehicle-key-drop-retake-board-20260920T154334Z-3b9f2d87` and
  `vehicle-key-eagle-carried-board-20260920T154502Z-87f98d86` runs.

## Dispatch

The main key dispatcher reads the scancode from `$7B5E` and branches:

| Address   | Scancode | Key  | Target                        |
| --------- | -------- | ---- | ----------------------------- |
| `$05563C` | `$50`    | Down | `$054520`, the drop           |
| `$055644` | `$26`    | `L`  | **`$05449C`, the leave path** |
| `$05564C` | `$48`    | Up   | `$0541F0`, the take           |
| `$055654` | `$30`    | `B`  | **`$054302`, the board gate** |

`L` enters `$05449C` directly. The only other caller is the touchdown routine at
`$057D38`, which is part of flight and is not needed here.

## The board gate has one more guard

After the key test, the gate does not board at once. `$054338`–`$05434E` reads the
selected slot's model record through the object table at `$4BD10` and refuses
**silently** unless the record opens with `$8001` and its mode byte (record offset 3)
is `$40`:

```text
054338  movea.l  $4bd10.l, a1
05433E  adda.l   (a1,a0.w), a1
054342  cmpi.w   #$8001, (a1)       ; the orientation command
054346  bne.b    $54300             ; absent: refuse, no message
054348  cmpi.b   #$40, $3(a1)       ; single-Y-turn mode
05434E  bne.b    $54300
```

That is the record header [the V.I.P. limo note](damocles-vip-limo.md#what-the-draw-path-reads)
decoded as the model's orientation command, which the Catalogue already publishes as
`instanceOrientation` with `modeByte: 64`. Both the refusal chooser's admissions and a
passed key test reach this guard, so it is the gate's last word. Every placed craft in
slots 1–7, 10, 12 and 13 and `AUTHOR'S CHAIR` (slot 14) carry `modeByte: 64`;
`ATTACK SHIP` (slot 11) and `NEUTRON FUEL` (slots 8 and 15) carry no orientation
command at all.

`$05430A` also tests the whole selection longword before `$05431A` tests the slot, so
"nothing selected" and "slot 0" are one silent refusal.

The reach test at `$054302` admits `$7B42` ≤ 9. Under
[the selection note's float representation](damocles-object-selection.md), where the
exponent is `floor(log2 distance)`, that is **distance < 1024 source units** from the
eye — twice the take's 512. #404's board of `EAGLE NINE S E` from 194 units and the
arrival-routes note's silent press 1.2 cells short are both consistent with it; the
boundary itself was not bracketed at runtime.

## What boarding does

Once every guard has passed, `$054350`–`$0543BA` runs in this order:

| Address             | Effect                                                                                                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$054350`–`$054354` | calls the trigger-table walker `$0543D2` the take also calls; it fires a Damocles Script only for slots 183, 181, 151, 95, 101 and 94, none of which the gate admits, then requests a sound through `$054848` |
| `$054358`–`$05436E` | arms `$7A78` = 3 and the sound vector `$4BF58`, clears bit 7 of `$7A64` and `$5A9D8`                                                                                                                          |
| `$054374`           | `$7AB2` ← the resident X                                                                                                                                                                                      |
| `$05437A`–`$054384` | `$7AB6` ← the resident Y **+ `$3F`**                                                                                                                                                                          |
| `$054388`           | `$7ABA` ← the resident Z                                                                                                                                                                                      |
| `$054390`–`$054396` | `$7AC2` ← the instance angle byte × 4                                                                                                                                                                         |
| `$05439E`           | `$7AB0` ← the slot: Occupancy                                                                                                                                                                                 |
| `$0543A6`           | calls `$042D14`                                                                                                                                                                                               |
| `$0543B0`           | calls `$054744`, which presets the throttle `$7BAC` and `$797A` to `$FF001000`                                                                                                                                |
| `$0543B4`           | `$7AAE` ← 0, not on foot                                                                                                                                                                                      |
| `$0543BA`           | joins the take's tail at `$0542B6`                                                                                                                                                                            |

`$7AB2`/`$7AB6`/`$7ABA` are the staged body position
([the Gamma System note](damocles-gamma-system.md)), so **boarding moves the player to
the craft's own origin**, at the craft's height plus 63. The camera pitch `$7AC0` and
roll `$7ABE` are not written.

The tail at `$0542B6`–`$0542D0` is the take's own residence removal, reached without the
take's Carried Stack insertion and without its `bset` of bit 7:

```text
0542B6  clr.l    $73a8(a0)          ; association B cleared
0542BA  clr.b    $6fa9(a0)          ; association A byte 1 cleared
0542BE  move.b   #$78, $73a8(a0)    ; association B = $78000000
0542C4  cmpi.w   #$1, $7a8e.w
0542CA  bne.b    $542d0
0542CC  bsr.w    $5a30e             ; rebuild the region queue on foot only
```

The occupancy captures agree exactly: slot 5 goes from `$FF122002` / `$2C000087` on foot
to `$FF002002` / `$78000000` boarded, with its coordinates unchanged.

### The seated eye height is 63, the same as on foot

The `+ $3F` at `$05437E` is the same 63 the on-foot height takes at `$057CFC` and that
`web/damocles/eris.json` already carries as the recovered eye height. It is one
instruction for every slot, with no per-model term, so the model's Y bounds play no part.

Three captures confirm it at runtime:

| Capture                                        | Occupancy               | `$7AB0` | Body Y `$7A96` | Scene camera Y `$7A30` |
| ---------------------------------------------- | ----------------------- | ------- | -------------- | ---------------------- |
| `occ-onfoot`                                   | on foot                 | `$FFFF` | 63             | 63                     |
| `occ-boarded`                                  | slot 5 `V.I.P. LIMO`    | `$0005` | 63             | 63                     |
| `occ-driving`                                  | slot 5, after driving   | `$0005` | 63             | 63                     |
| `vehicle-key-carried-board`, samples 2–3       | slot 5                  | `$0005` | 63             | not sampled            |
| `vehicle-key-eagle-carried-board`, samples 2–4 | slot 3 `EAGLE NINE S E` | `$0003` | 63             | not sampled            |

Slot 5's resident Y is 0 in every one. For a craft whose resident Y is not 0 the eye would
be at that Y plus 63; no tracked capture boards such a craft.

## What leaving does

`$05449C` begins by calling `$05906E`, which only classifies the position into `$7A38`
and `$7A3A`, and then refuses **silently** on any of four conditions:

| Address   | Condition        | Meaning                           |
| --------- | ---------------- | --------------------------------- |
| `$0544A0` | `$7AB0` negative | not aboard anything               |
| `$0544A8` | `$7ACA` zero     | no ground contact                 |
| `$0544B0` | `$78A6` negative | the island classifier answers sea |
| `$0544B8` | `$7AA8` = `$78`  | the VOID staging Body             |

All four occupancy captures, driving included, read `$7ACA` = `$3F` (ground contact) and
`$78A6` = 0, so a ground craft that has not flown passes the first three with the player
aboard. The sea test reads the same word [the islands note](damocles-eris-islands.md#what-the-classification-is-used-for)
recovered for the touchdown path. That path masks the word with the per-Body `$794A`
before calling `$05449C`; `L` reaches `$05449C` with whatever the last frame stored.

Then, in order:

| Address             | Effect                                                                                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$0544C2`           | calls `$054744`, the throttle preset                                                                                                                           |
| `$0544C6`           | roll `$7ABE` ← 0                                                                                                                                               |
| `$0544CC`           | pitch `$7AC0` ← `$1FF`, level                                                                                                                                  |
| `$0544D2`           | `$7AAE`/`$7AB0` ← 1 / `$8000`: on foot, aboard nothing                                                                                                         |
| `$0544DA`           | calls the hazard evaluator `$0543FA` [the carry-capacity note](damocles-carry-capacity.md#carried-object-consequences-that-no-handling-bit-predicts) recovered |
| `$0544E0`           | slot 9 branches straight to `$055B8E` and skips everything below                                                                                               |
| `$0544F4`–`$0544FA` | the instance angle byte ← `$7AC2 >> 2`                                                                                                                         |
| `$054504`           | calls `$055B8E`, the level gate and selected-structure bind                                                                                                    |
| `$05450E`           | joins the drop at `$0546CC` with the craft's slot                                                                                                              |

`$0546CC` is the **direct-placement** tail of the drop, the branch
[the drops note](damocles-limo-key-drops.md#direct-placement-and-support-placement-are-different-paths)
distinguishes from support placement. It writes the resident X and Z from
`$7AB2`/`$7ABA`, the resident Y as `$7AB6 − $3F`, association B from the current Body,
level and cell, and the insertion group from the drop's own rule: the current region
byte `$7AFD` when on foot with bit 14 of `$7B34` clear, otherwise 0. Leaving is therefore
**a direct-placement drop of the occupied object at the point under the eye**. The player
stays where the eye was, which is the craft's position.

The `occ-left` capture agrees: slot 5 is restored to `$FF122002` / `$2C000087` at the
player's X/Z, having been driven, with Y 0.

Slot 9's branch is unexplained. Slot 9 is a `NULL` record with no orientation command,
so the gate's model guard refuses it and the branch cannot be reached by boarding.

## The seatable band

The chooser admits slots 14 and above without a key, and the gate's bound at `$05431E`
stops at 22. What those nine slots hold in the Catalogue:

| Slot  | Record           | Residence                                               | Passes the model guard |
| ----- | ---------------- | ------------------------------------------------------- | ---------------------- |
| 14    | `AUTHOR'S CHAIR` | placed, Dion `dion-surface-de` (Authors House), level 0 | yes                    |
| 15    | `NEUTRON FUEL`   | unresolved                                              | no                     |
| 16–22 | `NULL`           | none                                                    | no                     |

So **`AUTHOR'S CHAIR` is the only object the seatable outcome can ever admit.** The
`SETTEE` records sit at slots 27, 185, 186, 187, 217 and 297, every one at or above the
bound at 23, so the gate refuses each of them silently at `$05431E`.

The chair's insertion pairs expose it in Authors House region selectors 11, 12, 26, 27,
28, 33 and 34. Their published region flags, from
`payload/damocles/models/structure-01daa0.json`, are `$8000` for 11 and 12 and `$D000`
for the other five. The region guard at `$054310` needs bit 14, so a board would pass it
from selectors 26–28, 33 and 34 and refuse silently from 11 and 12. That is derived from
published data; no capture has been taken inside Authors House. Its one entrance is
keyed to `DOOR KEY A` (slot 30), which has no recovered placement
([the location ledger](damocles-gamma-system-location-ledger.md#reachability-of-the-fourteen-level-0-placed-residents)).

## Two quirks of the key pairing

Because the key test reads `$6FAA + (slot + 178) × 4` for **any** slot below 23, it
tests objects that are not keys:

- Slot 7 `INTERSTELLARSHIP` tests slot 185, a `SETTEE`, whose handling byte is `$08`.
  That is the `$08` [#404's table](damocles-vehicle-key-gate.md#the-invariant-across-every-tracked-memstate)
  read for slot 7 in every pose. Carrying that settee would set its bit 7 and let slot 7
  board past the chooser. Whether that settee can be carried in play is not established.
- Slot 8 `NEUTRON FUEL` would test slot 186, another `SETTEE`, and on a clear bit would
  take system string 3 before reaching the model guard. Slot 8 has no resolved residence,
  so no route reaches it.

## Confirmed, derived and unresolved

**Confirmed** (static recovery plus existing runtime observation):

- `B` and `L` dispatch to `$054302` and `$05449C`.
- Boarding removes Object Residence with the take's own tail, writing association B
  `$78000000`, and does not touch the Carried Stack.
- Boarding places the eye at the craft's resident position plus 63 in Y, and the
  boarded eye height is 63 for `V.I.P. LIMO` and `EAGLE NINE S E`.
- Leaving restores slot 5 at the player's position with its association words restored.

**Derived from instructions, not reproduced at runtime**:

- The model guard at `$054338`–`$05434E`, which `ATTACK SHIP` and `NEUTRON FUEL` fail
  even when the key test or the chooser has passed them.
- The reach bound of 1024 units.
- The four leave guards, the level pitch and roll on leaving, and leaving as a
  direct-placement drop. The captures show the outcome, not each step.
- That `AUTHOR'S CHAIR` boards from five of its seven exposing regions.

**Unresolved**:

- Slot 9's branch at `$0544E0`.
- What `$042D14` does on boarding; it is also called from the flight path.
- Whether the slot-185 `SETTEE` can be carried, which would admit slot 7.
- The sound the board and leave paths request; the laboratory runs with sound off.

No application behaviour and no live-save behaviour was changed by this research.
