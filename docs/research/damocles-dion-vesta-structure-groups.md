# Damocles Dion and Vesta structure-group maps

Working-Authority Evidence for
[#325](https://github.com/odogono/mercenary/issues/325), recovered 2026-09-18.
It generalises the single parent link [#172](https://github.com/odogono/mercenary/issues/172)
recovered by hand for `KEY - 99 CHEVY`, recorded in
[resident objects](damocles-resident-objects.md#key---99-chevy), to every Dion and
Vesta interior scene the [Gamma System location ledger](damocles-gamma-system-location-ledger.md)
counts.

[ADR 0002](../adr/0002-separate-rom-research-from-implementation.md) permits factual
recovery, not translation of machine code into application code. Raw RAM, native
listings and probe output stay ignored under `research/damocles-st/work/`.
Authoritative Evidence remains bound to the C64 Reference Build; everything here is
Working-Authority Evidence.

**Most of this note is delivered into the payload.** Vesta's ten residents and
sixteen of Dion's nineteen group-`$02` residents are published with parents and
parent-local placements. Thirteen are not, in two distinct groups, and
[What is not published](#what-is-not-published) says which and why.

This note was first written while #324 was open, and held Dion back because group
`$02`'s place list names BIRMINGHAM ISLAND. [#324](https://github.com/odogono/mercenary/issues/324)
has since resolved that: the scene key is
`(body, structure-group, cell, level, insertion-group)`, the group record and the
rebuilt `$ABDC` are the runtime workspace, and the `$7A6C` label is corroboration
rather than a body binding — it cites the Dion capture's stale BIRMINGHAM ISLAND
pointer as the example. So Dion group `$02` is published here on #324's decision,
not on a guess of mine.

## Evidence identity

Static recovery reads the pinned first-world RAM
`observe-first-world-20260818T101013Z-c5a32b7d/observed.ram`, SHA-256
`b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967`, decoded with
Capstone M68K 68000 in the laboratory virtual environment. Runtime cross-checks
boot the rehosted `dion-2-3` and `vesta-parliament-4-6` memstates that
[#331](https://github.com/odogono/mercenary/issues/331) made restorable.

The tracked [`scripts/structure-group-probe.py`](../../research/damocles-st/scripts/structure-group-probe.py)
performs the whole traversal and gates every run on the checks in
[Self-checks](#self-checks).

## The traversal

`$04EB60` loads the current structure group from `$794E`, indexes the word table at
`$1E64C` — `$59F8`, making the group-offset root `$0239F8` — and adds the group's
entry to reach its authored record. The record is then:

```
+0   word     header (the decoder skips it)
+2            run-length cell-extent stream, building the 16x16 grid at $1E000;
              each run is three bytes and a zero byte ends the stream
     2 bytes  -> $7AEE / $7AEF
     6 bytes  -> indices into $1E64E, words copied to $1E640..
              cell-override list, until a source-reference byte of $FF:
                  [srcRef, cell, b1] and, when b1 is non-zero, [b0, dx, dz]
              place list -> $7A6C
```

The extent stream's row form is at `$04EBB6` and its column form at `$04EBDE`; each
writes a run's start and end into a 4-byte grid entry, rows into bytes 0–1 and
columns into bytes 2–3. The override consumer at `$04ECCA` writes each record into
`$ABDC + cell * 4` as `[b0, b1, dx, dz]`, in the stream order `b1, b0, dx, dz`.

The group-offset root table is **resident, not per-body**: it is byte-identical in
the pinned first-world RAM and in all four tracked memstates. Every group these
bodies need has a live entry.

| Group | Body | Entry | Record | Cells with a structure | Place list |
| --- | --- | --- | --- | ---: | --- |
| `$02` | DION; bound by `dion-2-3` | `$0090` | `$023A88` | 140 | `$023E57` (stale BIRMINGHAM ISLAND label, per #324) |
| `$05` | VESTA | `$0668` | `$024060` | 19 | `$0240ED` |
| `$14` | ERIS (#172 reference) | `$1732` | `$02512A` | 28 | `$025208` |
| `$1B` | Dion residents; no capture binds it | `$1D15` | `$02570D` | 25 | `$0257D9` |
| `$1C` | Dion residents; no capture binds it | `$1E0C` | `$025804` | 25 | `$0258D0` |

## The override word is a structure slot and a scene selector

The consumer is `$054CB0`–`$054E28`, the only reader of `$ABDC` besides the
decoder's own clear.

- **Bits 0–8** are the structure slot. Bit 8 is bit 0 of the high byte, which is why
  `$054D44` masks nine bits and not eight. Dion group `$1B` cell `$06` is `$0103`,
  selecting slot 259, and is the case that shows it.
- **Bits 1–7 of the high byte** are a scene selector, written to `$7AF8` and
  dispatched in three disjoint ranges:

| Range | Effect |
| --- | --- |
| `$00` | no scene; `$7AFA` cleared and the default pointers `$CD9C`/`$CD9E` installed |
| `$02`–`$1E` | `$7AFA = (b0 & $FE) / 2 + $1D` |
| `$20`–`$9E` | index `b0 − $20` into the table at `root + word(root − 2)` = `$0339C0`, two bytes to `$7963` and `$7961` |
| `$A0`+ | index `(b0 − $A0) × 2` into the longword table at `$CD74`, to `$CCC4` and `$CD6C` |

The word is **not** an instance transform. Dion cells `$E9` and `$41` both select
base structure 182 with selectors `$48` and `$26`: two scenes on one structure, not
two orientations.

`$7AFA`'s low byte is read at exactly one place, `$059F56`, inside the attachment
walk: for a control byte at or above `$F0` it is added to the byte's low nibble,
selecting an attachment variant. That is the `$F0` form the catalogue already flags
as a live selector. The `$20`–`$9E` range's two bytes are read as a long at
`$04E076`, inside the price and credit block
[the drop research](damocles-object-drops.md#trading-post-credit-and-buy-back)
recovered. Neither path redirects an association list.

## The instance's identity lives in its alias record

Every one of the seventeen parents these scenes need is an alias record — none is a
plain structure — so #172's Eris slot 145 was not a special case. The alias path is
`$054D84`–`$054DCC`:

| Offset | Field | Consumer |
| --- | --- | --- |
| `+0` word, bit 15 set | **storey height** in the low fifteen bits | `$054D86` → `$7B00` |
| `+2`, `+3` signed bytes | scale numerator and denominator | `$054D8E`, `$054D9E` → `$79B6`/`$79B8` |
| `+4` | palette | `$054DB4` → the table at `$04BD16` = `$D200` |
| `+5` | Building detail | `$054DB6` → patched into `$053A85`, dereferenced through `$026000` |
| `+6`..`+17` | **floor table**: one structure slot per level, 0 to 11 | `$054DBC` → `$7C1E`; `$054DC2` takes level 0 as `$7AF0`, the lift takes the rest |
| `+18`..`+29` | per-level palette, present only when `+4` is zero | `$054DC8`, `$055B36` |

`+6` was read as the base structure slot alone. It is the first entry of a
twelve-byte table, and the level indexes it — see
[the level-to-structure binding](damocles-level-structure-binding.md).

Decoding Eris slot 145 with this layout reproduces #172's published values exactly —
scale 3/2, palette 44, Building detail 58 — and Building detail 58 resolves through
`$026000` to `$02CE86`, the `interior-02ce86` that note names. The scale pair is
**signed**: Dion carries `-4/-3`, `-3/-3`, `2/-2` and `-2/-3`, so authored
reflection exists in this data.

`$7AF0` holding the base slot is why the live Vesta capture reads 90 for a cell whose
authored instance is slot 70.

## The level selector is a floor index, and the alias's first word is the pitch

This resolves a question [the drop research](damocles-object-drops.md) left open.
For **all 39** Dion and Vesta interior residents:

```
0 <= Y − (level × storeyHeight) < storeyHeight
```

holds with no exceptions. So the level byte is a storey number, the alias's first
word is that structure's floor pitch, and a resident's Y is its floor's Y plus its
own elevation above that floor.

| Structure | Storey pitch | Observed |
| --- | ---: | --- |
| Vesta base 90 (VESTA PARLIAMENT) | 317 | L1 → 317, L2 → 634, L3 → 951, L10 → 3170 |
| Dion base 43 | 200 | L10 → 2000 |
| Dion base 57 | 150 | L1 → 150, L9 → 1350 |
| Dion/Vesta base 141 | 160 | L1 → 160 |

The residual elevations are all object-shaped: 48 for `SCROLL` on `TABLE`, 48 for
`NOTE PAD`, 48 for `CASH REGISTER`, 38 for `AUTHORS COMPUTER` on `AUTHORS DESK`, 30
for `ANSAFONE`.

`$052CFA` matches a resident's level byte against the player's current level `$7AA4`,
so level is a filter on what is drawn, not something the association list resolves.

## The association-list root is derived, not tabulated

Nothing tabulates it. `$05A266` walks the bound structure's region descriptors — a
selector word, four bounds words, a zero-terminated byte run, word-aligned — and
`$05A2FA` publishes whatever address the walk stopped at as `$7B0E`. The catalogue
extractor's region loop stops on the same zero selector, so its reader position is
that root; `decode_structure_selection` now returns it as `associationRoot`. It is
not published in the payload: it is a stream offset this research reads, not a
catalogue fact.

For Eris instance slot 145 it gives base slot 60 and root `$013218`, and insertion
group `$03` maps region selectors 4→`$00`, 5→`$07`, 6→`$07`, 7→`$07`, 8→`$17` —
#172's published list, byte for byte.

## Local placements

`$054D48`–`$054D6C` sign-extends the override's offsets, multiplies by the 30 at
`$04BD14` and biases by `$8000`; `$054D2C`–`$054D3C` keeps the world coordinate's
high word and replaces its low word. So a resident's parent-local placement is its
own coordinate's low word minus the cell-origin low word, needing no assumption
about which workspace the cell belongs to.

Thirty-six of the thirty-nine residents land inside their parent structure's
recovered vertex extent. The three that do not are **the same three** the
association-list walk could not resolve, which is two independent methods agreeing:

| Slot | Object | Scene | Local placement | Why it is reported, not published |
| ---: | --- | --- | --- | --- |
| 102 | `NOVAGEN SAFE` | DION `$02`/`$B2`/L`$01` | `(746, 150, 861)` | insertion group `$11` absent from the parent's list, and X/Z outside the parent extent, while its three level-`$01` neighbours at group `$07` resolve |
| 66 | `TRANSPORTER a` | DION `$02`/`$E3`/L`$01` | `(-587, 150, 1074)` | base structure 57's association list is empty at its first byte; X/Z outside the extent |
| 34 | `DOOR KEY A` | DION `$02`/`$E3`/L`$09` | `(-49, 1350, 765)` | same parent, same reason |

All three have a correct floor Y under the storey rule, so only their plan position
and their draw membership are in question.

**All three are since resolved.** They were resolved against the cell instance's own
structure, which is the level-0 one. Resolving each against the structure its own
level binds — slot 58 for the two on DION `$E3`, slot 39 for `NOVAGEN SAFE` — closes
all three without touching the association decoder, and the probe now reports 39 of
39 residents with decoded insertions. See
[the level-to-structure binding](damocles-level-structure-binding.md).

Two placements corroborate #331 from an independent path: `SCROLL` lands at local
`(632, 682, 878)` and `TABLE` at `(632, 634, 878)` — the same X and Z, 48 units
apart in Y — which is the authored support pair that ticket observed at runtime.

## Every scene, with its outcome

Twenty-four scenes, seventeen distinct parents; several levels share one parent.

| Body | Group/cell/level | Instance | Base | Scene | Association root | Residents | Insertions |
| --- | --- | ---: | ---: | --- | --- | --- | --- |
| VESTA | `$05`/`$64`/L`$00` | 70 | 90 | sceneIndex `$22` | `$017834` | 215 | 1 of 1 |
| VESTA | `$05`/`$64`/L`$01` | 70 | 90 | sceneIndex `$22` | `$017834` | 184, 225, 230 | 0 of 3 |
| VESTA | `$05`/`$64`/L`$02` | 70 | 90 | sceneIndex `$22` | `$017834` | 153, 202 | 0 of 2 |
| VESTA | `$05`/`$64`/L`$03` | 70 | 90 | sceneIndex `$22` | `$017834` | 108 | 0 of 1 |
| VESTA | `$05`/`$64`/L`$0A` | 70 | 90 | sceneIndex `$22` | `$017834` | 68 | 0 of 1 |
| VESTA | `$05`/`$73`/L`$01` | 252 | 141 | none | `$01CE92` | 94, 203 | 2 of 2 |
| DION | `$02`/`$09`/L`$00` | 204 | 141 | none | `$01CE92` | 50, 51 | 2 of 2 |
| DION | `$02`/`$22`/L`$00` | 198 | 141 | none | `$01CE92` | 128 | 1 of 1 |
| DION | `$02`/`$33`/L`$00` | 107 | 12 | none | `$00FA9A` | 38 | 1 of 1 |
| DION | `$02`/`$A0`/L`$00` | 195 | 60 | none | `$013218` | 154, 195, 204 | 3 of 3 |
| DION | `$02`/`$B2`/L`$00` | 37 | 38 | sceneIndex `$21` | `$011302` | 109 | 1 of 1 |
| DION | `$02`/`$B2`/L`$01` | 37 | 38 | sceneIndex `$21` | `$011302` | 102, 111, 148, 220 | 3 of 4 |
| DION | `$02`/`$C2`/L`$01` | 197 | 141 | none | `$01CE92` | 63 | 1 of 1 |
| DION | `$02`/`$DE`/L`$00` | 216 | 95 | sceneIndex `$1E` | `$019154` | 14, 101, 234 | 3 of 3 |
| DION | `$02`/`$E3`/L`$01` | 56 | 57 | none | `$012D24` | 66 | 0 of 1 |
| DION | `$02`/`$E3`/L`$09` | 56 | 57 | none | `$012D24` | 34 | 0 of 1 |
| DION | `$02`/`$E9`/L`$00` | 182 | 82 | sceneTable `$28` | `$016574` | 135 | 1 of 1 |
| DION | `$1B`/`$06`/L`$00` | 259 | 43 | none | `$011F40` | 240, 243 | 2 of 2 |
| DION | `$1B`/`$06`/L`$0A` | 259 | 43 | none | `$011F40` | 198 | 1 of 1 |
| DION | `$1B`/`$41`/L`$00` | 182 | 82 | sceneTable `$06` | `$016574` | 120 | 1 of 1 |
| DION | `$1B`/`$50`/L`$00` | 260 | 80 | none | `$015B5E` | 77 | 1 of 1 |
| DION | `$1C`/`$06`/L`$00` | 259 | 43 | none | `$011F40` | 33, 241, 244 | 3 of 3 |
| DION | `$1C`/`$06`/L`$0A` | 259 | 43 | none | `$011F40` | 196 | 1 of 1 |
| DION | `$1C`/`$30`/L`$00` | 261 | 45 | none | `$0122EE` | 104 | 1 of 1 |

No scene is unresolved: all 24 have a decoded parent. Twenty-nine of the 39
residents also have a decoded insertion mapping.

Structures are reused across bodies rather than per body. Dion cell `$A0` resolves
to base slot 60 and root `$013218` — the same interior as the Eris
`KEY - 99 CHEVY` assembly — and base 141 / root `$01CE92` serves Dion cells `$09`,
`$22` and `$C2` and Vesta `$73`.

## The three named objects

| Object | Slot | Scene | Parent | Local placement | State |
| --- | ---: | --- | --- | --- | --- |
| `BRIEFCASE` | 108 | VESTA `$05`/`$64`/L`$03` | `vesta-surface-64`, **VESTA PARLIAMENT** | `(337, 951, -210)` | published |
| `CASH REGISTER` | 94 | VESTA `$05`/`$73`/L`$01` | `vesta-surface-73`, **GUM STORE** | `(453, 208, 256)` | published |
| `AUTHORS COMPUTER` | 101 | DION `$02`/`$DE`/L`$00` | `dion-surface-de`, group `$02` cell `$DE`, instance slot 216 | `(-1630, 38, -81)` | published |

## What is not published

Twenty-six of the thirty-nine residents are published. Thirteen are not, and the two
reasons are unrelated.

**Ten Dion residents in groups `$1B` and `$1C`.** Seven scenes sit in these groups,
and neither is a group any pinned capture binds — the `dion-2-3` memstate reads
`$794E = $02`. Their parents decode from the static group records, and their local
placements compute, but nothing names the workspace or body either group represents.
They therefore keep the disposition
[#324](https://github.com/odogono/mercenary/issues/324) records for Gaea group
`$0F`: bound to a static group record, named workspace identity unresolved, no
placement emitted. Publishing them would assert a workspace identity this evidence
does not have.

**Three Dion records whose placement falls outside the parent extent** — slots 102,
66 and 34, in [Local placements](#local-placements). Each has a decoded parent and a
correct floor Y; what is wrong is the plan position, and for slots 66 and 34 the
parent's association list is also empty. They are reported with that reason on the
instance rather than published.

The place names group `$02`'s list recovers — `ELMDON SPACEPORT` at cell `$40`,
`AUTHORS HOUSE` at `$DE`, `NOVAGEN OFFICE` at `$B2` — are corroborated by the
furniture in those cells: AUTHORS COMPUTER, AUTHORS DESK and AUTHOR'S CHAIR in
`$DE`, and NOVAGEN SAFE, NOVAGEN CABINET and an ANSAFONE in `$B2`. Per #324 the
labels can be stale or shared, so the payload keeps the parents' own
`dion-surface-*` identities and does not re-attach those names.

Vesta has neither problem. Group `$05` is bound by the `vesta-parliament-4-6`
capture, and its place list names `POLITBURO CITY` as the area with
`VESTA PARLIAMENT` at cell `$64` and `GUM STORE` at cell `$73`.

## Self-checks

The probe raises rather than prints. Every run must reproduce:

1. #172's Eris parent, field for field: group `$14` cell `$26` → source ref `$60`,
   word `$0091`, slot 145, offsets `-33`/`-125`; the override stream at `$0251D7`
   is `60269100df83`; slot 145's alias gives plan 200, scale 3/2, palette 44,
   Building detail 58; detail 58 resolves to `$02CE86`; the association root is
   `$013218` and insertion group `$03` maps as #172 published.
2. For each memstate: the static decode of the bound group `$794E` reproduces the
   live `$ABDC` table byte for byte, the place-list pointer matches `$7A6C`, the
   words `$7AF0`/`$7AF8`/`$7AFA`/`$7AF2`/`$7AF4` match the prediction for the cell
   the player stands in, and the derived association root matches live `$7B0E`.

Both memstates pass. `$7B0E` agreeing is what separates "the derivation is wrong"
from "the resident's insertion group lives in another structure's list".

## Open items

- **Ten residents have no insertion mapping.** Seven are Vesta cell `$64` at levels
  `$01`–`$0A`, whose insertion groups `$08`, `$0A` and `$0C` are absent from base
  structure 90's list. That list is complete — the walk past its terminator at
  `$0178C4` reaches the next structure's header, not a second list — and it is the
  list the game itself bound while the player stood outdoors at level `$00`. The
  list those groups live in belongs to whatever structure is bound inside the
  Parliament, and no ordinary route has entered it. That is the same blocker
  [#331](https://github.com/odogono/mercenary/issues/331) ended on.
- **Dion cell `$E3`** is a different case: base structure 57's association list is
  empty at its first byte. Either that parent is wrong for the cell or the authored
  list genuinely is empty, and this evidence does not distinguish them.
- **`NOVAGEN SAFE`** stands alone: insertion group `$11` absent, plan position
  outside the parent extent, three neighbours in the same scene resolving.
- **The ten Dion residents in groups `$1B` and `$1C`** need a capture that binds
  either group, or another route to its workspace identity. #324 leaves the
  equivalent Gaea group `$0F` in the same state.
- The `$A0`+ scene range is decoded from the listing but no Dion or Vesta parent
  selects it, so it is unexercised by this evidence.
