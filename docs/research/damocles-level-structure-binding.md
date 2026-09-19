# The structure a Damocles level binds

Working-Authority Evidence for [#355](https://github.com/odogono/mercenary/issues/355),
part of the location work in [#313](https://github.com/odogono/mercenary/issues/313).
Authoritative Evidence remains bound to the C64 Reference Build. This note records
decoded ST facts only and does not translate the program into a new model.

## Decision

A level selects its structure by **lookup in the cell instance's alias record**, not
by arithmetic on a base slot and not from the Building-detail bank.

```text
boundStructureSlot = aliasRecord[6 + level]      # 0 means the level has no floor
```

The table is twelve bytes, levels 0 to 11. Its first entry is the ground bind, which
is why `$7AF0` reads 90 for a Vesta capture standing on level 10 while the structure
the game actually walked is slot 91.

A plain structure record has no alias header and therefore no table: it offers level 0
alone, and that level is the record itself.

## Working Authority and evidence

| Item | Value |
| --- | --- |
| Program SHA-256 | `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef` |
| Source run | `observe-first-world-20260818T101013Z-c5a32b7d` |
| Observed RAM SHA-256 | `b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967` |
| Independent run | `observe-first-world-20260818T101117Z-010b9ad3` (`0f2dd8c5bd5c25003f2b29986529cffe4cf8f710a80a4a1fa86ece08d744229b`) |
| Probe | `research/damocles-st/scripts/structure-group-probe.py` |
| Captures | the seven #326 on-foot memstates, at levels 0, 1, 1, 4, 9, 10 |

Both first-world runs decode byte-identical floor tables for all 280 structure slots.
The runs and the memstates stay in the ignored research workspace.

## Where the table is, and who reads it

`$054D42`–`$054DCC` is the alias path the
[structure-group research](damocles-dion-vesta-structure-groups.md#the-instances-identity-lives-in-its-alias-record)
already walks for pitch, scale, palette and Building detail. It ends by stepping past
those fields and publishing what remains:

```text
054DAE  addq.w  #$4, a2          ; past the pitch word and the scale pair
054DB4  move.b  (a2)+, d0        ; palette byte; zero defers to the per-level table
054DB6  move.b  (a2)+, $53A85    ; Building detail, patched into the extent reader
054DBC  move.l  a2, $7C1E        ; <- the floor table: the record plus six
054DC2  move.b  (a2), d4         ; level 0's entry
054DC8  move.b  $C(a2), d0       ; level 0's palette, twelve bytes along
054DCC  move.w  d4, $7AF0        ; the ground bind, overwriting the instance's slot
```

So the record's layout is

| Offset | Field |
| --- | --- |
| `+0` word, bit 15 set | storey pitch in the low fifteen bits |
| `+2`, `+3` | signed scale numerator and denominator |
| `+4` | palette; zero defers to the per-level palette table |
| `+5` | Building detail |
| `+6`..`+17` | **floor table**: one structure slot per level, 0 to 11 |
| `+18`..`+29` | per-level palette, present only when `+4` is zero |

The lift is the only other reader. `$055B12`–`$055B28` takes the destination level in
d1, indexes the same table through `$7C1E`, and returns without moving when the byte
is zero — that is what makes a floor the record does not author unreachable rather
than empty:

```text
055B12  move.w  $788A, d1        ; the destination level
055B24  movea.l $7C1E, a0        ; the floor table
055B28  move.b  (a0, d1.w), d0   ; its entry for that level
055B2C  beq.b   $55B8C           ; zero: refuse the move
055B36  move.b  $C(a0, d1.w), d2 ; that level's palette, the same stride
...
055B84  bsr.w   $55BA6           ; re-establish the scene, in the same d0
055BD8  andi.w  #$FF, d0         ; inside $55BA6: still the floor table's entry
055BDC  bsr.w   $59D70           ; assemble that structure
```

Nothing between `$055B28` and `$055BD8` writes d0, so the byte the table supplied is
the slot `$059D70` resolves through `[$04BD0C]`. The scene assembly that follows ends
at `$05A266`, whose region walk `$05A2FA` publishes as `$7B0E`. That is the whole
chain from a level to the association-list root a resident resolves in.

`$7AF0` is never rewritten on a lift move — `$054D70` and `$054DCC` are its only
writers — which is exactly why a live capture above level 0 reports the ground
structure there while `$7B0E` names another.

### The table is twelve bytes

Three independent readings agree:

- `$054DC8` reads level 0's palette at `+$C` past the table base, and `$055B36` reads
  the destination level's at `$C(a0, d1.w)`. The two tables are parallel with a stride
  of twelve.
- Record extents confirm it. An alias record carries no eight-byte prologue, while a
  plain structure's scale and palette bytes at `-8`..`-1` belong to it; taking that
  boundary, 164 of 165 alias records whose palette byte is non-zero are 18 bytes —
  six of header and twelve of floors — and 17 of 18 whose palette byte is zero are 30,
  adding the twelve-byte palette table.
- The lift steps the destination one level at a time and wraps at 10
  (`$055A98`–`$055AB2`), so nothing above level 10 is ever requested, and no authored
  table names one — see below. Twelve bytes is one spare, not an unread tail.

Two records are shorter than the format and run into the record that follows:
`structure-010ea8` (slot 37) omits its palette table, and `structure-0122fa` (slot 46)
ends after two floor bytes. Entries past a record's own extent are not published.

### The level domain is 0 to 10, and the game says so

The lift's own indicator bounds the domain independently of the table. It writes one
character into the `$CD04` panel block that
[the vector-text research](damocles-building-vector-text.md) identifies:

```text
055AB8  bne.b   $55AC4
055ABA  move.b  #$47, $CD04      ; level 0 prints G
055AC4  cmpi.b  #$A, d1
055ACA  move.b  #$42, $CD04      ; level 10 prints B
055AD4  addi.b  #$30, d1         ; otherwise the ASCII digit
```

`$055A98`–`$055AB2` steps the destination one level at a time and wraps at 10, so no
level above 10 is ever requested, and no authored floor table names one. All seven
captures agree with the rule at the byte: `G` at level 0, `1` at level 1, `4` at 4,
`9` at 9 and `B` at 10.

This settles what
[the guide item list](damocles-guide-resident-list.md#floor-notation-corresponds-to-the-level-selector) left
open. A player's `(B)` annotation is the game's own label for selector 10 and `(G)`
for 0 — read off the program rather than inferred from a correspondence.

## The gate

`structure-group-probe.py` no longer reports the interior it read from a live
`$7B0E`; it derives the structure from the floor table at whatever level the capture
stands and **raises** when the derived association root is not the one the running
game published. There is no level-0 special case: the same lookup runs at every level.

All seven #326 captures pass:

| Capture | Group | Cell | Level | Floor table entry | Derived root | Live `$7B0E` |
| --- | --- | --- | ---: | ---: | --- | --- |
| `vesta-parliament-4-6` | `$05` | `$64` | 0 | 90 | `$017834` | `$017834` |
| `vesta-transporter` | `$05` | `$64` | 10 | **91** | `$017B4A` | `$017B4A` |
| `gaea-transporter` | `$0F` | `$88` | 1 | 58 | `$012F3E` | `$012F3E` |
| `dion-transporter` | `$02` | `$E3` | 1 | 58 | `$012F3E` | `$012F3E` |
| `metis-transporter` | `$03` | `$60` | 9 | 58 | `$012F3E` | `$012F3E` |
| `logos-transporter` | `$08` | `$24` | 4 | **67** | `$014282` | `$014282` |
| `pan` | `$0C` | `$14` | 1 | 55 | `$012B40` | `$012B40` |

Vesta cell `$64` is the controlled case the gap was recorded against, and the table
settles it by reading: `90, 92, 92, 93, 0, 0, 0, 0, 0, 0, 91`. Level 10 names slot 91
because that is the eleventh byte, not because 91 is one above 90 — levels 1 and 2
name 92 and level 3 names 93. The two observations #324 offered as candidate rules
were both wrong: slot 58 recurs across Gaea, Dion and Metis because those three cells
place the *same* authored instance, and Logos's level 4 names 67, which is two above
its base 65 and not one.

## Two corroborations the gate did not ask for

**Every Dion and Vesta resident now resolves.** The structure-group probe previously
resolved each resident against the cell instance's own structure, which is the level-0
one, and three residents were left unresolved with their insertion group absent from
the list. Resolving each against the structure *its own level* binds closes all three
without touching the association decoder:

| Slot | Object | Scene | Was | Now |
| ---: | --- | --- | --- | --- |
| 66 | `TRANSPORTER a` | DION `$02`/`$E3`/L1 | base 57's list is empty | slot 58, group `$04` |
| 34 | `DOOR KEY A` | DION `$02`/`$E3`/L9 | same parent, same reason | slot 58, group `$03` |
| 102 | `NOVAGEN SAFE` | DION `$02`/`$B2`/L1 | group `$11` absent | slot 39, group `$11` |

The probe now reports **39 of 39** residents with decoded insertions, against 36 of 39
before.

**Every catalogue resident's insertion group is offered by the floor its level names.**
Across all 195 interior-associated residents in the payload, 185 resolve and none
contradicts: no resident names a level the floor table leaves zero, and no resident
names an insertion group the selected structure does not offer. The ten that do not
resolve fail for two reasons already recorded and both at level 0, so neither touches
this rule: five are the MIDAS residents whose group `$38` authors one cell and none
of theirs — the missing Midas surface workspace the
[location ledger](damocles-gamma-system-location-ledger.md) records against #172 —
and five have slot 94 as the floor their level names, whose association list the
decoder rejects for a duplicate region selector.

## What is published

Each alias structure model in `payload/damocles/catalogue.json` carries `levelBinding`:
the table's address, how many of its twelve bytes lie inside the record's own extent,
and one entry per authored floor naming the structure slot and model id. 184 of the
266 structure models have one; 108 of those author level 0 alone, and 29 distinct
structures are named above level 0.

The association-list root itself stays out of the payload: it is a stream offset this
research derives, as
[the structure-group note](damocles-dion-vesta-structure-groups.md#the-association-list-root-is-derived-not-tabulated)
records.

## What this does not settle

- **Nothing here admits a non-zero level into the port.** `DamoclesSession.worldPosition()`
  still requires `residence.level === 0` and an interior Drop still writes `level: 0`.
  The binding is the prerequisite those need, not the change itself.
- **No floor number is derived from pose height.** The storey pitch is the alias
  record's first word and belongs to the same record as the table, so a height-to-floor
  derivation is now *possible*; it is not performed, published or relied on here.
- **`$26000` is not involved.** The issue's lead pointed at the Building-detail group
  records; the rule is not there. `+5` of the alias record still selects a Building
  detail through `[$04BD22]`, and that selection is per record, not per level.
