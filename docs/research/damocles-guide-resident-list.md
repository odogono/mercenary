# Damocles guide: the item-and-location list as a lead source

Checked 2026-09-19 for [#362](https://github.com/odogono/mercenary/issues/362).

[`damolist.txt`](http://mercenarysite.free.fr/damolist.txt), compiled by Adrian
Hurt, is a player's inventory of Damocles items by building, floor and local
cell. It is a **secondary source of leads**, not recovered runtime data and not
Working-Authority Evidence. Nothing in this note admits a placement, a level
rule or an access rule; every correspondence below is a lead to verify against
the Atari ST Working Authority, and the payload facts it is compared against are
the ones already extracted.

It is worth a note of its own because it does three things the
[guide location checklist](damocles-guide-location-checklist.md) does not: it
covers every body rather than eight, it marks a floor for most items, and it
names things the payload **cannot express**.

## Source and reproduce path

| Item     | Value                                                              |
| -------- | ------------------------------------------------------------------ |
| Source   | `http://mercenarysite.free.fr/damolist.txt`                        |
| Compiler | Adrian Hurt (credited in the file)                                 |
| SHA-256  | `66c3b1103f8f8e8ff0bb65d78190264b3df2445e91e51aa5dcadc1da1e51cb10` |
| Compared against | `payload/damocles/catalogue.json` (tracked)                |
| Tool     | `research/damocles-st/scripts/guide-resident-list-check.py`        |

The list is not vendored. Fetch it and pass the path, so the copy under test is
one you obtained:

```sh
curl -sLO http://mercenarysite.free.fr/damolist.txt
python3 research/damocles-st/scripts/guide-resident-list-check.py damolist.txt
```

A different hash means the source moved; re-read the counts below rather than
assuming them. This check reads no Restricted Material.

## Floor notation corresponds to the level selector

The list marks a floor as `(G)`, `(B)` or a digit, sometimes with a wing letter
(`4S`, `3N`). Read as **`G` → 0, `B` → 10, `n` → n**, every floor the list gives
appears among the `levelSelector` values the catalogue holds for that body and
cell, across **34 of 37 cells with no contradiction anywhere**.

The two richest cells carry the whole correspondence on their own:

| Cell                          | List                                                                            | Catalogue `levelSelector`      |
| ----------------------------- | ------------------------------------------------------------------------------- | ------------------------------ |
| VESTA `04-06` Vesta Parliament | Bench (G), Key-Targ Tourer (1), Scroll (2), Table (2), Briefcase (3), Transporter 4 (B) | 0, 1, 2, 2, 3, 10              |
| ERIS `09-08` State Office      | Damocles File (G), Coffee Table (G), Air Conditioner (1), Bench (2), Settee (2), Key-Eagle 9SE (B) | 0, 0, 1, 2, 2, 10              |

The three cells that do not agree exactly are the list carrying a floor the
catalogue has **no interior resident for**, never the two disagreeing about a
level:

| Cell            | List has | Why                                                              |
| --------------- | -------- | ----------------------------------------------------------------- |
| DION `03-14`    | `(G)`    | `TARG TOURER` is a surface resident (`location`), not interior-associated |
| ERIS `09-02`    | `(G)`    | `RED BEACON` slot 178 is likewise a surface resident              |
| METIS `00-06`   | `(8)`    | "Lose your money" is a trading-post outcome, not an object        |

`B` → 10 is the useful part. The checklist note deliberately left it open —
*"`B` means the guide's basement … native level selectors below remain raw
selectors, not assumed floor numbers"* — and two independent buildings now put a
`(B)` item at selector 10 and nothing else there.

**The program has since said the same thing.** The lift indicator at
`$055AB8`–`$055AD8` writes one character into the `$CD04` panel block: `G` at
level 0, `B` at level 10, and the ASCII digit otherwise. Seven captures agree at
the byte. So `(B)` is not a correspondence this note inferred — it is the game's
own label for selector 10, and the level domain is 0 to 10. See
[the level-to-structure binding](damocles-level-structure-binding.md), which
recovered the rule [#355](https://github.com/odogono/mercenary/issues/355) owned.

## It names door keys the payload cannot tell apart

All ten door-key instances share one model record, so all ten carry the name
`DOOR KEY A`. The payload cannot distinguish key A from key I. The list names
them by location, and the location and floor agree on every one it covers:

| Slot | Body  | Cell    | Level | List      |
| ---: | ----- | ------- | ----: | --------- |
|   30 | GAEA  | `04-13` |     2 | Key **A** |
|   31 | ERIS  | `06-05` |    10 | Key **B** |
|   32 | METIS | `01-03` |     0 | Key **C** |
|   33 | DION  | `06-00` |     0 | Key **D** |
|   34 | DION  | `03-14` |     9 | Key **E** |
|   35 | ERIS  | `15-12` |     2 | Key **F** |
|   38 | DION  | `03-03` |     0 | Key **I** |

Slots 36, 37 and 39 are on MIDAS, which the list does not itemise beyond the
magic crystal.

This is the one place the list supplies an identity the payload has no field
for, so it is also the one place it is most tempting to treat as evidence. It is
not: a per-instance key letter has to come from the Working Authority before any
code may act on it.

## Keyed access matches the residents the port cannot reach, 3 for 3

The [coverage ledger](damocles-gamma-system-location-ledger.md#reachability-of-the-fourteen-level-0-placed-residents)
finds five level-0 placed residents unreachable because every path from their
cell's own region to a region that exposes them crosses a region gated
`attachmentLatch`. They sit in three cells. The list annotates **all three** with
a key requirement, and **none** of the nine reachable residents' cells:

| Cell         | Building         | List      | Unreachable residents            |
| ------------ | ---------------- | --------- | -------------------------------- |
| DION `14-13` | Authors House    | needs key A | 14 `AUTHOR'S CHAIR`, 101 `AUTHORS COMPUTER`, 234 `AUTHORS DESK` |
| DION `02-11` | Novagen Office   | needs key D | 109 `RUBBISH BIN`                |
| VESTA `04-06`| Vesta Parliament | needs key E | 215 `BENCH`                      |

Two independent methods agree: the region-connectivity graph is derived from
recovered region bounds in the payload, and the list is a player's notes. Neither
knew about the other.

**The hypothesis this licensed** was that a region gated `attachmentLatch` opens
while the matching door key is in the Carried Stack.
[#362](https://github.com/odogono/mercenary/issues/362) has since confirmed it
against the Working Authority, and the list's letters survive the check exactly:
the handler tests bit 7 of `$6FAA + 4 * slot`, which the Take sets and the Drop
clears, and the slot is the cell's `$7AFB` base plus the entrance's key nybble —
30 for Authors House, 33 for Novagen Office and 34 for Vesta Parliament, which is
A, D and E. See [the entrance-attachment
note](damocles-generic-entrance-attachments.md#the-live-condition-predicate-is-the-carried-stack--confirmed).

A player's notes and a disassembly agreed on three letters neither could read
from the other. That is a stronger result for this list than for the mechanism,
and it is the reason to keep reading it.

It also orders the work. Key A is on GAEA at level 2 and key E on DION at level
9, so four of the five residents are behind #355 before they are behind #362.
Only key D is at level 0, and it has no recovered placement of its own.

## It separates two Eris cells the catalogue merges

The list has **`09-08` twice**: once under *Eris: Capital City* as State Office,
once under *Eris: Key West* as Lawson Bank. The catalogue holds nine residents at
Eris cell `$89` spanning both — `DAMOCLES FILE` and `COFFEE TABLE` with
`ANTIQUE CLOCK`, `MANAGERS DESK` and `MANAGERS CHAIR`.

This is the same failure of a cell selector to identify a place that
[#324](https://github.com/odogono/mercenary/issues/324) recorded for Gaea, where
one origin qualifier covers two workspaces and cell `$17` names a different place
in each. The ledger states the rule already — *a cell selector is not a place
identity* — and this is a second body exhibiting it.

**Resolved by [#391](https://github.com/odogono/mercenary/issues/391).** Eris's
islands are five island records at five origins, each binding its own structure
group, and a cell label is local to the island rather than to the body. Capital
City 09-08 is body (73,136) and Key West 09-08 is body (2569,3592); both groups
author their own instance at cell `$89`, at different structure slots. The list's
separation was right and the catalogue's merge was the artefact. See
[the island note](damocles-eris-islands.md). The guide's `Lawson Bank` label for
Key West 09-08 is not verified: the only recovered `LAWSON BANK HQ` place record
is on Capital City at 15-12.

## What this note does not license

- No placement, parent or workspace is established. The list gives no
  coordinates, only a building and a floor.
- No access rule is established **from this list**. "Needs key D" is a player's
  observation of a base-game route; the gate it agrees with was recovered
  separately, from the bank.
- No key letter reaches the payload or the port from here. The payload's
  `keyBase` is read from each cell's `$ABDC` entry byte, not from this list.
- Building names remain unrecovered. Where this note writes "Authors House" it is
  quoting the list, and the ledger continues to name a parent by its selectors.
