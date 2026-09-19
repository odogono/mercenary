# Damocles general object drop and residence rules

Working-Authority Evidence for
[#315](https://github.com/odogono/mercenary/issues/315), recovered 2026-09-17.
It generalises the limo-key work in
[key drops](damocles-limo-key-drops.md) and [key pickup](damocles-limo-key-pickup.md)
to every resident object, and it is bounded by the coverage census in the
[Gamma System location ledger](damocles-gamma-system-location-ledger.md).

[ADR 0002](../adr/0002-separate-rom-research-from-implementation.md) permits factual
recovery, not translation of machine code into application code. Raw RAM, native
listings, screenshots and experimental probe output stay ignored under
`research/damocles-st/work/`. Authoritative Evidence remains bound to the C64
Reference Build; everything here is Working-Authority Evidence.

Extended for [#331](https://github.com/odogono/mercenary/issues/331) on 2026-09-17
with the ordinary-route observations #315 could not reach, from the rehosted VESTA
arrival pose. The three sections whose headings carry "(#331)" are that work; where
it supersedes a #315 statement it says so in place rather than deleting it.

#315's handler rules are delivered and that ticket is closed. What #331 has since
observed, and the one prerequisite the remaining uncertainties share, is in
[Open blockers, and what #331 closed](#open-blockers-and-what-331-closed).

## Evidence identity and runtime

Static recovery reads the pinned first-world RAM
`observe-first-world-20260818T101013Z-c5a32b7d/observed.ram`, SHA-256
`b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967`, decoded with
Capstone M68K 68000 in the laboratory virtual environment.
`research/damocles-st/lab doctor` passed on 2026-09-17: ST with 1 MiB, Hatari
2.6.1, Python 3.13.15, and the STX/TOS identities in
[`working-authority.json`](../../research/damocles-st/config/working-authority.json).

Runtime observations boot the tracked `snapshots/eris-spaceport-onfoot.sav`
memstate and are produced by the tracked
[`scripts/object-drop-probe.py`](../../research/damocles-st/scripts/object-drop-probe.py),
SHA-256 `52e591b0c70b05713ae166554d103d730e64d4ff47917e3328210e247c0b180d`.
Movement is the joystick softcopy byte the laboratory already uses; take and drop
are real key events. No object, player-position, association or script field is
injected.

#331's runs boot the rehosted `snapshots/vesta-parliament-4-6.sav` and are produced
by the tracked
[`scripts/support-drop-probe.py`](../../research/damocles-st/scripts/support-drop-probe.py),
SHA-256 `f5495ef47a71f56ffd4c8193db526faea959d473788f89fa53731fa34ce39676`, with the
memstate prepared by
[`scripts/memstate-rehost.py`](../../research/damocles-st/scripts/memstate-rehost.py).
`lab doctor` passed again on 2026-09-17 with the same toolchain identities.

## Resident state layout used throughout

Each resident slot `n` indexes six parallel arrays at stride four. Field names
below are the ones this note uses.

| Array base | Field | Meaning |
| --- | --- | --- |
| `$63A8`, `$67A8`, `$6BA8` | X, Y, Z | signed 32-bit position; Y increases upward |
| `$6FA8` | Association A byte 0 | per-region draw membership, rebuilt every region change |
| `$6FA9` | Association A byte 1 | structure-group selector |
| `$6FAA` | Association A byte 2 | **handling byte** |
| `$6FAB` | Association A byte 3 | placement class |
| `$73A8` | Association B byte 0 | **body byte**, four times a body index |
| `$73A9` | Association B byte 1 | insertion-group selector; zero means surface |
| `$73AA` | Association B byte 2 | level selector |
| `$73AB` | Association B byte 3 | cell selector |
| `$77A8` | heading | raw heading byte (stride one, not four) |

## The handling byte is four independent fields

`$6FAA` is tested by both handlers. The take handler at `$0541F0` reads bits 4
and 5; the drop handler's support branch reads bits 0–1 and 2–3; bit 7 is the
live carried flag that take sets (`$0542A4`) and drop clears (`$05467C`).

| Bits | Meaning | Where it is read |
| --- | --- | --- |
| 0–1 | **support rank this object supplies** when something is dropped onto it | `$0545BE` |
| 2–3 | **support rank this object requires** of whatever it is dropped onto | `$0545B2` |
| 4 | take refuses silently | `$05421E` |
| 5 | take refuses through the refusal-message helper, index 2 | `$054238`, `$0542DA` |
| 6 | unused in these handlers; zero in the pinned capture | — |
| 7 | carried | `$0542A4`, `$05467C` |

The tracked `payload/damocles/catalogue.json` extracts this byte under names that
state the roles: `suppliedSupportRank` is bits 0–1 and `requiredSupportRank` is
bits 2–3. A placement is admitted when the support's supplied rank is at least
the dropped object's required rank, and refused when either is zero.

Census over the 241 catalogue residents that carry a handling byte:

| Class | Count |
| --- | ---: |
| Takeable | 210 |
| Take refuses silently (bit 4) | 10 |
| Take refuses with a message (bit 5) | 21 |
| Supplies support rank 1/2/3 | 110 in total |
| Takeable, requires support rank 0 | 4 |

The four takeable residents that require rank 0 are `NEUTRON FUEL` slot 8 and the
three `BENCH` instances, slots 115, 215 and 216. They can never be placed on a
support, because the support branch refuses a requirement of zero outright; see
the next section for why that is not the same as "always dropped directly".
Slot 8 is a special case with no drop consequence at all: it is an entry in the
moving-object pool, out of the player's reach for the whole of its flight and
cleared when that flight ends
([moving objects](damocles-moving-objects.md)).

## The drop rank comparison, resolved

The support branch is at `$0545AC`–`$0545D2`:

```
$0545B2  move.b $6FAA(a0),d0   ; a0 = dropped slot * 4
$0545B6  andi.w #$0C,d0        ; required support rank, in place in bits 2-3
$0545BA  beq    refuse         ; requirement zero refuses
$0545BE  move.b $6FAA(a1),d2   ; a1 = selected support slot * 4
$0545C2  andi.w #$03,d2        ; rank the support supplies
$0545C6  beq    refuse         ; a support of rank zero refuses
$0545CA  add.w  d2,d2
$0545CC  add.w  d2,d2          ; scale the supplied rank into bits 2-3
$0545CE  cmp.w  d0,d2
$0545D0  blt    refuse         ; supplied < required refuses
```

So the operands are the *dropped* object's bits 2–3 against the *selected*
object's bits 0–1 shifted left by two, and the meaning is
`supplied >= required`, with zero on either side refusing. All three refusals go
to `$054514`, which shows system-string index 9.

The branch is **not opt-in**. `$054580`–`$054596` enters it whenever a resident is
selected (`$7B46` non-zero) at distance exponent at most 6 and that resident is not
slot 74 (`$128`). There is no fallback: if the selected object is an unsuitable
support, the whole drop is refused rather than placed on the ground. Any port that
treats the support path as an optional refinement of direct placement will accept
drops the original refuses.

A recovered exception sits at `$0545AC`: `tst.b $7046.w` / `bmi $0545D4` skips the
rank comparison entirely when bit 7 of the handling byte at `$7046` is set. `$7046`
is `$6FAA + 4 * 39`, that is resident slot 39, the `DOOR KEY A` instance
[the capacity research](damocles-carry-capacity.md) names for the same bypass. It is
the tenth `DOOR KEY` slot, the one the panel labels `J`: the label code at `$04DD78`
maps slots 30–39 to letters A–J. Why carrying that particular key should relax the
support rules is **unresolved**; the instruction is recorded, its purpose is not
claimed. Do not implement it as a feature on this evidence alone.

## Both placement paths, observed above level 0

The write sets below were recovered from instructions and, until #326, could only
be exercised outdoors at level 0. Both are now observed on an ordinary route
inside a structure at a non-zero level, and both reproduce field for field.

**Direct placement, `vesta-transporter`, level 10.** Nothing selectable was inside
the support distance, so the drop took the direct path:

| Field | Written | Source | Live value |
| --- | --- | --- | --- |
| X, Z | `71269092`, `20547167` | player `$7AB2`/`$7ABA` | identical |
| Y | `3170` | player `$7AB6` − 63 | `3233 − 63` |
| B body byte | `$38` | `$7AC9` | VESTA |
| B level byte | `$0A` | `$7AC5` | **10** |
| B cell byte | `$64` | `$7B5D` | `$64` |
| B insertion group | `$08` | region byte `$7AFD` | `8` |
| A structure-group byte | `$05` | `$794F` | `$05` |
| A class byte | `$04` | `$7A39` | `$04` |

Insertion group `$08` is in the association list of the structure bound at level
10, which is a different structure from the one bound at level 0 in the same
cell — see [workspace selection](damocles-workspace-selection.md).

**Support placement, `metis-transporter`, level 9.** `FILOFAX` slot 133 sits 27
source units from the player and supplies rank 1; the carried `KEY - 22 CV`
requires 1, so the rank check passes and both remaining gates run:

```text
support  slot 133  A=0x00030504  B=0x3c050960  x=165642643 y=1350 z=70288862
player                                          x=165642616 y=1413 z=70288873
placed   slot 191  A=0x00030404  B=0x3c050960  x=165642643 y=1380 z=70288862
```

The placed object takes the support's X and Z rather than the player's, all four
bytes of the support's Association B, and Association A bytes 1 and 3 — keeping
its own class byte `$04`, where the support's is `$05`. Its Y is `1380`, which is
the support's `1350` plus a model maximum of `30`, not the `1350` direct
placement would have written. That is the documented `$0546A4`–`$0546CA` write
set exactly.

**Both gates are therefore reached, and both accept**: the model-form gate,
because the support path completed at all, which requires `FILOFAX`'s model to
open with header type 6, 9 or `$0A`; and the height gate, because the computed
top `1380` is below the player's Y `1413`.

**Neither gate has been observed refusing.** A refusal needs a support whose
model maximum puts its top above the player's eye, or a model whose opening word
is none of the three admitted types. Both remain unobserved, and the refusal
branches stay recovered-from-instructions only.

## Support geometry: the height gate

When the rank check passes (or is skipped), `$0545D4`–`$05461A` reads the support's
model through the pointer table at `$04BD10`, steps over model headers of type 6, 9
or `$0A` (any other opening word refuses), then walks six-byte vertex records taking
the maximum of each record's first word until the `$8000` terminator. That maximum
is added to the support's Y (`$67A8`) and compared with the player's Y (`$7AB6`):
a result greater than the player's Y refuses. Because Y increases upward and direct
placement puts an object at eye height minus 63, this is "you cannot put something
on a surface above your own eye level".

On acceptance (`$0546A4`–`$0546CA`) the dropped object takes the support's X and Z,
the computed top Y, all four bytes of the support's Association B, and Association A
bytes 1 and 3. Its own handling byte and model identity are untouched. The pinned
Vesta capture shows exactly this shape as authored data: `SCROLL` slot 153 and
`TABLE` slot 202 share X `71271032` and Z `20548514` and Association B `380C0264`,
with Y 682 and 634 respectively.

## Direct placement, and the gate before it

`$054620`–`$05462E` takes the direct path when nothing is selected inside the support
distance. It then requires ground/support contact `$7ACA` to be non-zero, unless bit 7
of `$6FAA` (slot 0's handling byte) is set, in which case the contact requirement is
skipped. Slot 0 is not a takeable resident — the take handler rejects it at `$054202`
— and the queue assembler at `$05A448` writes `$FF` through pointers into the same
array, so slot 0's handling byte is plausibly scratch rather than an object. The
instruction is recorded; the interpretation is **not resolved**.

Direct placement itself (`$0546CC`–`$05471C`) is the write set the key research
already established, and it is the same for every object:

| Resident field | Source |
| --- | --- |
| X, Z | player `$7AB2`, `$7ABA` |
| Y | player `$7AB6` minus 63 |
| Association B body byte | `$7AC9` |
| Association B level byte | `$7AC5` |
| Association B cell byte | `$7B5D` |
| Association A structure-group byte | `$794F` |
| Association A class byte | `$7A39`, the 3×3 zone of the intra-cell position against the bound structure's extent rectangle ([placement class](damocles-placement-class.md)) |
| Insertion group | current region byte `$7AFD` when `$7AAE = 1` and bit 6 of `$7B34` is clear, otherwise zero |

Interior direct placement first searches the association-list root `$7B0E` for a
group whose selector equals the current region (`$05454A`–`$054560`); absence refuses
through system-string index 9.

**Level selector: `$7AC5` and `$7AA5` are the same quantity.** Drop writes the
level byte from `$7AC5`, while the association builder at `$052D06` matches
residents on `$7AA5`. Both were zero in every state this note could originally
sample, because every replayable pose was outdoors at level 0. The on-foot
captures published by [#326](https://github.com/odogono/mercenary/issues/326)
include seven poses *inside* structures above level 0, and two of them carry a
Carried Stack, so the drop is now observable where the bytes are non-zero:

| Capture | Level | `$7AC5` | `$7AA5` | Dropped object's recorded level byte |
| --- | ---: | ---: | ---: | ---: |
| `vesta-transporter` | 10 | 10 | 10 | `$0A` |
| `metis-transporter` | 9 | 9 | 9 | `$09` |

The two bytes hold the same non-zero value before and after a live drop, and the
value the drop writes into the object's Association B is that same value. The
placed object then sits in the scene the builder matches, so the caution is
lifted: **treat them as one quantity.**

## Residence is body-scoped, and carrying parks an object in VOID

Take clears the whole of Association B (`clr.l $73A8(a0)` at `$0542B6`), clears the
structure-group byte, and then writes `$78` into the body byte at `$0542BE`. `$78`
is body index 30, VOID — the same value the handlers exclude the player from at
`$054524` and `$054204`. A carried object therefore has no body, no insertion group,
no level and no cell; it is staged in VOID until a drop writes the *player's current*
body from `$7AC9`.

This is the fact a body-aware port needs: **residence is owned by the body byte the
drop writes, not by whatever structure happens to be bound**. The exterior surface
drop in the key research writes insertion group zero while the Spaceport is still
bound, and the surface-resident list builder at `$052C9C` selects residents purely on
"body byte equals the current body and insertion-group byte is zero". The bound
structure is not consulted.

Two related observations from this ticket's runs, which a port must preserve
rather than derive:

- While carried, the observed Association A is `0x00318404` for the key, whose byte 1
  is `$31`, not the zero that take writes. Some later routine overwrites it. Preserve
  the value; do not recompute it from the take path.
- While carried, the key's X and Z read `33237` and `99100`, which are not its
  pre-take world coordinates. Carried coordinates are working state, not residence.

## Render-queue membership and ordering

`$05A30E` resolves the player's region from the descriptor table at `$B23C`, calls the
association builder `$052CDC`, writes `$7AFC`/`$7B34`/`$7B12`, and then **clears
Association A byte 0 for every resident slot** (`$05A3D6`). The queue assembler
`$05A3DE` filters the builder's pairs down to those whose region selector equals the
current region into `$B1DC`, then walks the region's plan queue emitting one
`$FFFF00nn` longword per matching resident into the draw queue at `$8732`.

The builder at `$052CFA`–`$052D34` selects an interior resident when its cell byte
matches `$7B5C`, its structure-group byte matches `$794E`, its level byte matches
`$7AA4` and its insertion-group byte is non-zero; it then emits the implicit
`(group, 0)` pair before copying the group's explicit `(region, key)` pairs. This
independently confirms the implicit-pair finding in the key research: the zero after
the group selector is an insertion key, not a sentinel.

Two consequences for a port. Draw membership is rebuilt from residence on every
region change, so it is derived state and must not be persisted. And because the
drop writes the insertion group from the current region while the authored record
may use a different group, a dropped object's drawing order differs from its
authored order even when both are visible in the same region.

## The Carried Stack is an ordered list with a head the player can rotate

`$61CE` is a byte array of resident slots and `$61CC` is its count.

| Operation | Routine | Effect |
| --- | --- | --- |
| Take | `$04DCE4` | shifts the array right and writes the new slot at the head; scroll counter `$04DDD0` set to `-16` |
| Drop | `$04DC40` | reads the head, shifts the array left, returns the dropped slot in d1; scroll counter set to `+16` |
| Scroll forward | `$04DC74` | rotates the head to the tail; scroll counter `+16` |
| Scroll backward | `$04DCF6` | rotates the tail to the head; scroll counter `-16` |

Drop always acts on the head. The player chooses what to drop by rotating the stack,
so the order is behaviour, not presentation, and it must survive a save. It is **not**
a last-in-first-out stack: the object a drop removes is the one the panel names, which
rotation can make any carried object. [The capacity research](damocles-carry-capacity.md)
records the same rotation and the `CONTEXT.md` glossary amendment it needs.

There is an ordering asymmetry worth preserving. When the dropped object was **not**
the only carried object, `$04DC40` falls through `$04DC9E`–`$04DCC2`, which sets the
new head's panel label, calls the guarded sound helper `$054848`, and — when on foot
— rebuilds the price display and the structure queue. The sole-object path at
`$04DC5E` returns immediately after clearing the label. A multi-object drop therefore
issues one extra sound request and one extra queue rebuild compared with a
sole-object drop, in addition to the drop handler's own calls at `$0546A4`/`$0546CC`
and `$05473C`.

## Capacity and the BRIEFCASE are owned elsewhere

`$7A04` is the capacity the take handler tests at `$054244`, and the `BRIEFCASE`
paths at `$05426C` and `$054632` move it between 10 and 20 while stashing any
overflow in `$61CA`. [The capacity research](damocles-carry-capacity.md) recovered
all of that in full — including that the comparison is an **equality**, so a count
already above capacity is accepted, and that the overflow is an exact round trip it
reproduced at instruction checkpoints. This note does not restate it and does not
contradict it; capacity appears here only as state a drop can change.

## Refusal taxonomy

Every refusal in both handlers, with what the player is shown:

| Handler | Condition | Outcome |
| --- | --- | --- |
| Take | selection exponent above 8, or nothing selected, or slot 0 | silent |
| Take | player body is VOID (`$7AA8 = $78`) | silent |
| Take | scroll counter `$04DDD0` non-zero | silent |
| Take | handling bit 4 | silent |
| Take | Carried Stack already at capacity | silent |
| Take | handling bit 5 | message index 2 |
| Take | Trading Post buy-back with insufficient credit | message index `$0C` |
| Drop | player body is VOID | silent |
| Drop | scroll counter non-zero | silent |
| Drop | Carried Stack empty | silent |
| Drop | direct path without ground contact | silent |
| Drop | interior region has no matching insertion group | message index 9 |
| Drop | support requirement zero, support rank zero, rank too low, unsupported model form, or support top above the player | message index 9 |
| Drop | Trading Post sale while `$795C` already records a sold slot | message index `$0B` |

The take-side overrides are recovered in
[the capacity research](damocles-carry-capacity.md) and its ordering is the one to
follow: the slot-0 test at `$054214` is ahead of the bit-4 check, while the two
`ANTIGRAV` tests at `$054224` and `$05422A` sit **between** the two refusals and can
therefore only reach bit 5. Carrying an ANTIGRAV never makes a bit-4 object takeable.

The rank comparison above was recovered independently by that ticket, which reached
the same assignment of demand and supply, and reproduced refused, met and bypassed
rank cases at instruction checkpoints. What this note adds to it is that the branch
is forced rather than optional, the geometry gate that follows the comparison, and
the residence and draw-queue consequences of an accepted placement.

## Trading Post credit and buy-back

The sale path is drop-side (`$054562`–`$05457A`): structure `$52`, region 9, and
`$795C` clear. It calls the BCD add at `$04E13C` and records the sold slot in `$795D`
**before** the support and placement checks run, so a drop that is later refused has
already credited. The buy-back is take-side (`$05424A`–`$054260`): taking the slot
recorded in `$795C` while in region 9 debits through `$04E158` and clears the marker.
Only one object can be in the sold state at a time. `$04E05A` recomputes the
displayed price from the head carried object's model header whenever region 9 is
entered (`$05A3B0`) or the panel changes.

## Ordinary-route observations recorded here

Four cases, each reproducible from the tracked probe. All boot
`eris-spaceport-onfoot.sav`, SHA-256
`6cee57c4d4a168792fc3974e786d706fe9f42cf577d6e8b7c63814c93d6398c6`.

### A refused take changes nothing but the message gate

`object-drop-take-refusal-20260917T185235Z-15a39108`, `result.json` SHA-256
`6a9a00d057dff8ce4d519d425a220f0ac4c3d17d4aa0aacd0828013816ebdd54`.

At the arrival pose the nearest drawn object is `INTERSTELLARSHIP` slot 7, whose
handling byte is `$20`, at distance exponent 5 — inside the take range of 8. The
ordinary take was refused: the carried count stayed 0, the scroll counter stayed 0,
the script program counter stayed `$0007_03FC`, the key's residence was untouched,
and only the message gate `$7BA0` moved `$0000` → `$FFFF` → `$0000`. A refused take
does **not** arm the scroll counter.

An earlier ignored run with a breakpoint on `$0542DA`
(`drop315-eris-take-refusal-20260917T184821Z-5ce052cd`, `result.json` SHA-256
`bc542b81450810cd91e85e2ae993034032091b4bd1829947011da78970d38b56`) confirms the
refusal took the bit-5 message branch, with slot 7 selected at exponent 5.

### An empty Carried Stack refuses silently before the support branch

`object-drop-empty-drop-20260917T185248Z-9df8db52`, `result.json` SHA-256
`0fa12c2f46a0e5e927ab5eb467126523c3628f6e141c21496b90bc732731e43a`.

The same pose, with the ship still at exponent 5 — that is, inside the nearby-support
distance. The drop left the count at 0 and every field unchanged. The ignored
breakpoint run `drop315-eris-empty-20260917T184005Z-5e37f816`, `result.json` SHA-256
`197dd6fe853f8eab863f353be7838b25ca01d232975589990b00785446c4154e`, caught the
handler at the silent-refusal `rts` `$054512` with carried count 0, scroll counter 0,
body `$2C` and contact 63, which identifies the empty-stack gate and shows it is
evaluated before the support branch is entered.

### The inventory-label scroll window refuses a drop, and it is reachable

This closes a gap the key research listed as unobserved.

`object-drop-scroll-refusal-20260917T185302Z-196521d3`, `result.json` SHA-256
`f3c8c288ec86bfe765cf2bff0b9b10537c6aa54096c3efaa555d3c6c8e7d182b`.
The tracked walk, an ordinary take, then the drop key 0.2 s later. The take landed
(count 1 at t+34.94 s, Association B `$78010010`) and the drop was refused: the count
stayed 1 and Association B stayed `$78010010` through t+48.74 s.

`object-drop-scroll-control-20260917T185356Z-fed33ad8`, `result.json` SHA-256
`26f39d19342eba5f4db5349a800e070457bdd3abec0df14ee0d16eab1c9931f8`.
The same take with the drop 3 s later. The drop placed the key: Association B
`$78010010` → `$2C010087`, count 1 → 0, and the key became the selected object at
exponent 5. Region 1, insertion group 1 — the same group-12-to-1 change the key
research explains.

The ignored run `drop315-eris-scroll-20260917T184200Z-86ff5cda`, `result.json`
SHA-256 `35e8bd7a895f1a46927901888381cb5f382f20e2f9368574f6bcc40955234931`, armed a
breakpoint on `$054512` for the refusing case and caught it with the scroll counter
at `$FFF8` — eight of the sixteen steps still to run — with the key still carried.
The window is short: sixteen VBLs is 0.32 s at the recovered 50 Hz rate. The pair of
tracked runs establishes it as an ordinary-input refusal, not only an instruction
path.

### A surface drop away from the authored spot

The ignored run `drop315-eris-ship-support-20260917T184430Z-f3db8c6a`, `result.json`
SHA-256 `4c8fb9ea7b862bdf91eb89d028a018994c9dff3bd414ea52d0a3113ecb22f450`, carried
the key out of the building and dropped it on the surface at a position the key
research had not visited. Association B became `$2C000087`: body `$2C`, insertion
group zero, level zero, cell `$87`. This is the surface-residence form the list
builder at `$052C9C` selects, written while the Spaceport was still the bound
structure.

That run was an attempt to reach the support branch and it **failed** to do so: the
drop took the direct path because no resident was within exponent 6 at the moment of
the drop. It is recorded as an unsuccessful support attempt and a successful surface
placement, not as a support observation.

## The DION, GAEA and VESTA memstates were an off-build capture, not a lost one (#331)

Recovered for [#331](https://github.com/odogono/mercenary/issues/331) on 2026-09-17.
This **replaces** the claim above that those three memstates cannot be replayed.

The failing message is real and the diagnosis in it was incomplete. The three
memstates were not captured by the pinned laboratory binary at all. Their Hatari
header names the TOS image
`/Users/alex/Applications/Hatari.app/Contents/Resources/tos.img`, while every
memstate that restores names the pinned `roms/atarist/tos/emutos206.img`. Both are
Hatari 2.6.1 and both TOS images have SHA-256
`154803e3ff4851f3dc358b91b16d6b6110d187a81d8132ecb665af49878939d5`, so the
emulated machine is the pinned one; what differs is the build. The application
bundle is built **with** CAPS/IPF floppy support and the pinned binary is not.

`IPF_MemorySnapShot_Capture` in Hatari 2.6.1 writes, in order, an `int32`
`StructSize`, `StructSize` bytes of `IPF_STRUCT`, and then one `int32` track size
for each of `MAX_FLOPPYDRIVES × 84 × 2` raw-stream slots — 1344 bytes, all zero
whenever no `.raw` stream image was ever inserted. `IPF_STRUCT` is 600 bytes in a
CAPS build and 8 bytes without CAPS, because its one unconditional member is
`int64_t FdcClock`; the source comment claiming the struct is empty without CAPS
is wrong. On restore, the mismatch branch logs

```
Memory snapshot IPF floppy data incompatible with this Hatari version -> skip
```

and skips `StructSize` bytes — **but not the 1344-byte trailer**. Every later
section then reads from the wrong offset, the end-of-file magic check fails, and
`MemorySnapShot_Restore_Do` abandons the restore. That is why the emulator never
ran. The uncompressed streams differ by exactly 592 bytes, which is `600 − 8`.

`--alert-level fatal`, added by [#315](https://github.com/odogono/mercenary/issues/315),
is still required and still correct: without it the message opens a modal dialog
that hangs a headless run. It suppresses the dialog; it does not make the restore
succeed.

### Rehosting

The tracked [`scripts/memstate-rehost.py`](../../research/damocles-st/scripts/memstate-rehost.py)
rewrites only that section, from the CAPS form to the pinned form, preserving
`FdcClock` — the member both builds share. It locates the section deterministically
rather than by scanning: `Floppy_MemorySnapShot_Capture` stores the inserted disk
image byte for byte, so the Working Authority STX locates itself in the stream, and
the offset from the end of that buffer to the IPF section is read from the tracked
`eris-spaceport-onfoot` memstate, which the pinned build demonstrably restores. It
refuses to write if the raw-stream trailer is not all zero, and it re-decodes the
1 MiB ST RAM window before and after and refuses to write if it changed.

The IPF state it discards is inert for this Authority. Drive A holds an STX, which
Hatari routes through `floppy_stx.c`; `IPF_Insert` is only called for
`FLOPPY_IMAGE_TYPE_IPF`.

```sh
python3 research/damocles-st/scripts/memstate-rehost.py \
    --input <captured>/dion-2-3.sav \
    --output research/damocles-st/snapshots/dion-2-3.sav
```

This is a **container conversion, not a recapture**. An observation taken from a
rehosted memstate is Working-Authority Evidence from the original capture; what
changed is that the pinned toolchain can now run it. The rehosted files stay
Restricted Material and uncommitted, under the repository's existing `*.sav` rule.

| Memstate | IPF section | Captured SHA-256 | Rehosted SHA-256 | RAM SHA-256 |
| --- | --- | --- | --- | --- |
| `dion-2-3` | `$423201`, 600 → 8 | `38bb0835…b142872` | `42866869…fba95d1e6` | `cefccd95…eabcf3734` |
| `gaea-ur-city-4-2` | `$423201`, 600 → 8 | `de82797d…b8b8f3b3` | `eddc5f1c…5160e673e` | `12798fcb…2a925fab7` |
| `vesta-parliament-4-6` | `$423201`, 600 → 8 | `47d817a9…94f362c1` | `d6aac9e0…55275a1ac` | `7dca6fcb…e539721e` |

The RAM SHA-256 of each is unchanged, and
`payload/damocles/arrival-poses.json` regenerates with only the memstate hashes
different: every decoded position, yaw, body selector and derived cell is
byte-identical to [#314](https://github.com/odogono/mercenary/issues/314)'s static
decode.

### The runtime decode agrees with the static decode

All three now restore and run. Booted through the tracked probe below, the live
player words match the published pose exactly:

| Pose | Live position | Live yaw | Live body | Live cell | Agrees with payload |
| --- | --- | ---: | --- | ---: | --- |
| `dion-2-3` | `213288851, 63, 86343888` | `63008` | `$0010` | 50 | yes |
| `gaea-ur-city-4-2` | `33847828, 63, 117602545` | `559` | `$0020` | 36 | yes |
| `vesta-parliament-4-6` | `71270097, 63, 20544365` | `1556` | `$0038` | 100 | yes |

Runs `support-drop-inventory-20260917T200926Z-3636e862` (DION, `result.json`
SHA-256 `df96b1bd19fb7f94db6e1a696cd4876233e465446a03d6e2152e0adb6fe73ec7`),
`support-drop-inventory-20260917T200956Z-c8202fdc` (GAEA,
`baf6a2edce01c43fbfec4327200af7f0c6ed79ec6b815e00f02baa63c4a54a5a`) and
`support-drop-inventory-20260917T200856Z-ef7eaf88` (VESTA,
`e110d29f9bd4d3b93f4946be9614f6e83bf79f4e2c3c4091aba45d041340d7dc`).

## Ordinary-route observations from the Vesta arrival pose (#331)

Every run in this section boots the rehosted `vesta-parliament-4-6.sav`, SHA-256
`d6aac9e01c44dad24b92665d1ba51cdcd7b42746aab616c09d68b5a55275a1ac`, and is produced
by the tracked
[`scripts/support-drop-probe.py`](../../research/damocles-st/scripts/support-drop-probe.py),
SHA-256 `f5495ef47a71f56ffd4c8193db526faea959d473788f89fa53731fa34ce39676`. Walking
is the joystick softcopy byte; take, drop and inventory scrolling are real key
events; every sample is a `savebin` taken while the machine is stopped. Nothing is
injected.

### What the pose gives

The player stands outdoors on VESTA — body byte `$38`, cell `$64`, region 9 with
region flags `$C000`, bound structure 90, placement mode 1, ground contact 63,
player Y 63 — carrying three objects with capacity 10, Carried Stack
`151, 181, 183`. `$7046` reads `$05`, so the unexplained support-rank bypass is
**not** active in any run here.

| Slot | Object | Handling | Supplies | Requires | Y | Where |
| ---: | --- | --- | ---: | ---: | ---: | --- |
| 151 | `DAMOCLES FILE` | `$85` | 1 | 1 | — | carried |
| 181 | `KEY - EAGLE 9SE` | `$84` | 0 | 1 | — | carried |
| 183 | `KEY- V.I.P. LIMO` | `$84` | 0 | 1 | — | carried |
| 3 | `EAGLE NINE S E` | `$20` | 0 | 0 | 0 | outdoors, 194 units away |
| 108 | `BRIEFCASE` | `$04` | 0 | 1 | 951 | Parliament interior |
| 230 | `PROCESSORS DESK` | `$0E` | 2 | 3 | 317 | Parliament interior |
| 202 | `TABLE` | `$0F` | 3 | 3 | 634 | Parliament interior |
| 153 | `SCROLL` | `$04` | 0 | 1 | 682 | Parliament interior, on slot 202 |

"Supplies" and "requires" are the catalogue's `suppliedSupportRank` and
`requiredSupportRank`.

The one resident that supplies a non-zero support rank and is reachable on foot is
the carried `DAMOCLES FILE`. That is what makes the support branch observable here:
drop it, and it becomes a support.

### The Carried Stack rotates, and rotation re-indexes the carried staging

`support-drop-scroll-right-20260917T201026Z-50155d47`, `result.json` SHA-256
`92bb4100bf5e3bdd65b371a589985479c15b38227aab6b99a9abe327be4d9859`, and
`support-drop-scroll-left-20260917T201102Z-cbb55dc1`, `result.json` SHA-256
`0ae718dc08528b03dce82937f149a2c3091d2446508906b6aad1e484e057788f`.

Right Shift with the right cursor key rotates tail to head; with the left cursor
key, head to tail. Three presses in either direction restore the original order, so
this is a rotation of the whole list, not a swap of two entries:

| Presses | Right | Left |
| ---: | --- | --- |
| 0 | `151, 181, 183` | `151, 181, 183` |
| 1 | `183, 151, 181` | `181, 183, 151` |
| 2 | `181, 183, 151` | `183, 151, 181` |
| 3 | `151, 181, 183` | `151, 181, 183` |

The panel label pointer `$04DDCC` follows the head every time — `$0003DD56` for
slot 151, `$0003E450` for 181, `$0003E484` for 183.

Rotation also rewrites state a port would otherwise treat as fixed. A carried
object is parked at X `33237`, Z `99100` with Association B `$78 01 nn 10`, where
`nn` is its **index in the Carried Stack**, and its Y is `300 × index`. Both follow
the rotation immediately:

| Stack | 151 | 181 | 183 |
| --- | --- | --- | --- |
| `151, 181, 183` | B `…0010`, Y 0 | B `…0110`, Y 300 | B `…0210`, Y 600 |
| `183, 151, 181` | B `…0110`, Y 300 | B `…0210`, Y 600 | B `…0010`, Y 0 |

So the level byte of a **carried** object is its stack index, not a residence
level, and a drop re-indexes every object still carried. This is new: the note
above recorded only that take clears Association B and writes body `$78`.

### A multi-object drop, and the support branch forcing itself on the second one

`support-drop-multi-drop-20260917T201138Z-07f26b0c`, `result.json` SHA-256
`390a1d786750f0fb59a964d0bdc73042a9ad7afae2efa233e9a9ed57f39bcbde`. Four ordinary
drops from the arrival pose, without moving.

| Drop | Head | Outcome | Count | Stack after | Panel label |
| ---: | --- | --- | ---: | --- | --- |
| 1 | 151 | placed directly, Y 0 | 3 → 2 | `181, 183` | `$0003E450` |
| 2 | 181 | placed **on** slot 151, Y 2 | 2 → 1 | `183` | `$0003E484` |
| 3 | 183 | refused | 1 | `183` | `$0003E484` |
| 4 | 183 | refused | 1 | `183` | `$0003E484` |

The landing Y separates the paths, by the matched pair in the next section: direct
placement writes 0 here and a support placement writes the support's top. Drop 1
landed at Y 0 with the only resident inside the take range, slot 3, at exponent 7 —
outside the support range. Drop 2 landed at Y 2, on slot 151. Drops 3 and 4 were
refused with the message gate `$7BA0` moving `$0000` → `$FFFF` → `$0000`, and by then
the selection was slot 181, which supplies rank 0.

This is the "not opt-in" property of the support branch observed rather than derived:
**dropping a second object where you have just dropped a first one is a support
placement, and a third is refused.**

Ordering is the documented one. Each accepted drop takes the head, the list shifts
left, and the panel label pointer moves to the new head. The sole-object path, which
clears the label instead, is not reached here — no run emptied the stack, because the
third drop was refused.

### An accepted support placement, with the field inheritance, and its control

The two runs differ only in how far the player steps between the two drops. That
step is what moves the support across the exponent-6 boundary, so the pair
separates the support path from the direct path on ordinary input alone, with no
breakpoint.

**Accepted.** `support-drop-pair-drop-20260917T201219Z-0a3d554a`, `result.json`
SHA-256 `9c867ba789cff0edafb167ba8ce31dad79a31ea1c52c4038a8c8e7e264107420`
(`--gap 12 --nudge 0.3`). Slot 151 `DAMOCLES FILE` (supplies 1) was dropped at
`71270097, 0, 20544365`. The player then stepped to `71270105, 63, 20544445`,
leaving the support at exponent 6, and dropped slot 181 `KEY - EAGLE 9SE`
(requires 1). Slot 181 landed at

- X `71270097`, Z `20544365` — **the support's**, not the player's;
- Y `2` — the support's Y 0 plus the model top the handler computes;
- Association B `$38000064` — all four bytes copied from the support;
- Association A `$00050401` — byte 1 `$05` and byte 3 `$01` from the support, its
  own handling byte `$04` untouched.

That is the acceptance write set at `$0546A4`–`$0546CA`, observed end to end.

**Control.** `support-drop-pair-drop-20260917T201308Z-653f570f`, `result.json`
SHA-256 `0931937acdc24cce7563cc0c0751026dc03a2e4508bf3d4b532796ff47894865`
(`--nudge 0.4`). The identical sequence with a longer step put the support at
exponent 7. The drop took the direct path: slot 181 landed at the **player's**
`71270113, 20544525` with Y `0`.

Y therefore separates the two paths cleanly at this pose: direct placement writes
player Y minus 63, which is 0 here, and the support placement wrote 2.

### The support-rank refusal

`support-drop-pair-drop-20260917T201358Z-439d4df8`, `result.json` SHA-256
`f80a059a047416f9db30e4589fb0e912935de51e5f8cffe94e5b4111faf8755a`
(`--gap 12 --rotate 1`). One inventory rotation makes slot 183 `KEY- V.I.P. LIMO`
(supplies 0) the head, so the object on the ground supplies nothing. The player
does not move, leaving it selected at exponent 5, and drops slot 151.

Refused. The carried count stayed 2, the Carried Stack stayed `151, 181`, the panel
label pointer stayed `$0003DD56`, every resident field was unchanged, and the
message gate `$7BA0` moved `$0000` → `$FFFF` → `$0000`.

The matched breakpoint run
`support-drop-pair-drop-20260917T201449Z-a02e1a3c`, `result.json` SHA-256
`516263468bec47f473184688179056453cfaaae7973b037124c4a30f7646e384`, armed
`pc = $54514` and caught it:

```
CPU=$54514, VBL=391386
00054514 7209                     moveq #$09,d1
```

— the refusal target loading system-string index 9. Against the acceptance run the
**only** difference is which object is lying on the ground, so this isolates the
`$0545BE`/`$0545C6` comparison and nothing else.

### The exponent the support gate reads is three-dimensional

`$7B42` is not a plan distance. An object dropped at the player's feet reads
exponent 5, not −1: the player's Y is 63 above where a direct drop puts an object,
and that 63 is what the exponent measures. Every run above shows it. A port that
computes the support range from X and Z alone will accept support drops at
distances the original refuses, and will treat an object underfoot as being at
distance zero when the original treats it as 63.

### This pose's drop writes insertion group zero, outdoors, with a structure bound

Both accepted placements wrote Association B `$38000064`: body `$38`, insertion
group `$00`, level `$00`, cell `$64` — the surface form, while structure 90 was
bound and region 9 was current, with region flags `$C000`. Slot 3
`EAGLE NINE S E`, authored outdoors in the same cell, carries exactly the same
Association B. This is the same shape as the Eris surface drop recorded above, at a
second body, and it corroborates the region-flag gate rather than the
current-region write.

## What the Vesta pose still cannot reach, and why (#331)

### The model-form refusal and the height refusal have no route from this pose

Both gates sit **after** the rank comparison, so reaching either needs a support
that supplies a rank at least as high as the dropped object requires. In VESTA cell
`$64` there are exactly three such residents:

- the carried `DAMOCLES FILE` slot 151, supplies 1. Its model passes the form gate
  and its computed top is 2, far below the player's Y of 63, so it exercises the
  accepted path and cannot produce either refusal;
- `PROCESSORS DESK` slot 230, supplies 2, Y 317;
- `TABLE` slot 202, supplies 3, Y 634, with `SCROLL` slot 153 resting on it.

The last two are **inside Vesta Parliament**: Association B `$380A0164` and
`$380C0264`, insertion groups `$0A` and `$0C` and levels 1 and 2, against the
pose's insertion group `$00` and level `$00`. Two on-foot approaches were run and
both stop outside:

- `support-drop-walk-20260917T201539Z-da9dfa02`, `result.json` SHA-256
  `ede003f4d1ecb0ae75087a6bc024ce394de6ea5ae37f02954a061df3ae057423`. Twenty
  seconds of forward walking on the pose's own heading. Z stops advancing at
  `20547564` against an exterior wall — the screenshot is a full-frame flat fill —
  while X keeps sliding along it. `BRIEFCASE` slot 108 gets no closer than
  exponent 7; `TABLE` and `PROCESSORS DESK` stay at exponent 9 and beyond.
- `support-drop-walk-20260917T201629Z-cf006d1c`, `result.json` SHA-256
  `886e7d4146da395ebdbfae1209e800f4248d3f78b4c0c56d5625dff5a496d710`. A one-second
  right turn then twenty-five seconds forward, to try the wall's other side. The
  turn rate is high enough that the route leaves the building behind entirely,
  ending at `71283696, 20550409` with every interior resident at exponent 13.

No entrance to Vesta Parliament has been located from this pose. The
[generic entrance attachments](damocles-generic-entrance-attachments.md) and the
[entrance motion](damocles-spaceport-entrance-motion.md) notes are the route a
later ticket should follow. Until an interior is entered:

- **the model-form refusal is unobserved**, with the specific reason that every
  reachable support that clears the rank comparison is the `DAMOCLES FILE`, whose
  model the handler accepts;
- **the height refusal is unobserved**, with the specific reason that the only
  supports standing above the player's eye — `PROCESSORS DESK` at Y 317 and `TABLE`
  at Y 634 against a player Y of 63 — are both behind that wall. Their authored
  heights make them the right test: the recovered gate predicts that **both refuse**,
  including the table `SCROLL` is already sitting on. A port must not assume the
  authored arrangement is reproducible by dropping.

### The requirement-zero refusal is unobserved for the same shape of reason

The branch refuses when the **dropped** object requires rank 0. Only four residents
in the whole catalogue are takeable and require 0, and none of them can be dropped
from this pose. `NEUTRON FUEL` slot 8 is not a candidate at all: it is an entry in
the moving-object pool, out of the player's reach for the whole of its flight and
cleared when that flight ends ([moving objects](damocles-moving-objects.md)). Of the
three `BENCH` instances, slot 215 is in this cell but 3806 units away and carries
insertion group `$14`, so it is inside a structure and not on the surface the pose
stands on; slot 115 is on ERIS and slot 216 on CLOTHO. Nothing requiring rank 0 is
carried at any replayable pose, so the refusal has no route rather than an untried
one.

### `$7AC5` against `$7AA5` is decided: one quantity

Both read 0 in every sample of every run here, as they did in the #315 captures,
because this pose is outdoors at level 0. The #326 captures put the player inside
a structure at levels 1, 4, 9 and 10 carrying four objects, and live drops from
two of them settle it: `$7AC5` and `$7AA5` hold the same non-zero value, and the
object's recorded level byte is that value. See
[both placement paths, observed above level 0](#both-placement-paths-observed-above-level-0).
This is **no longer a blocker** on [#318](https://github.com/odogono/mercenary/issues/318).

### The two bypasses are still unexplained

`$7046` reads `$05` throughout, so bit 7 is clear and the support-rank bypass never
fired in any run above. Nothing here explains why resident slot 39 — the tenth
`DOOR KEY`, the one the panel labels `J` — should relax the support rules, and
nothing here explains the slot-0 ground-contact bypass. Both remain recorded
instructions with no recovered purpose, alongside the self-modified fourth take-side
test at `$055190` that [the capacity research](damocles-carry-capacity.md) reports.
Reaching the `$7046` bypass needs that key carried, which needs an interior this
programme has not yet entered.

## Ordinary-route coverage from the Eris pose, and what blocked it

This section records what #315 measured from the Eris pose. Its first finding stands;
its second is **superseded** by the rehosting above, which is why the Vesta
observations exist.

The support branch, a multi-object Carried Stack, capacity, and drop/re-pick with more
than one object all need at least two reachable takeable objects in one place. Two
measurements said that no such place was reachable from Eris.

**Only one takeable resident is in reach of the only replayable pose.** Decoding the
tracked Eris memstate's resident arrays for the player's body `$2C` and cell `$87`
gives eight live residents: `DART II`, `EAGLE NINE S E`, `BESTCUPAND CRAFT`,
`V.I.P. LIMO`, `INTERSTELLARSHIP` — all with handling byte `$20`, none takeable — and
`KEY- V.I.P. LIMO`. The only other takeable Eris surface residents are `SUNSHADE`
(cell `$4C`) and `RED BEACON` (cell `$29`), five and four cells away. Measured
on-foot speed on this route is about 120 source units per second and a cell is 65,536
units, so either is roughly forty-five minutes of emulated walking per axis. That is
not a route this ticket should manufacture.

**The other three arrival poses could not be replayed.** Superseded: they are
replayable now, and the cause was the capturing Hatari build, not the memstates.
The original diagnosis, kept because the symptom is worth recognising, was: the
`dion-2-3`,
`gaea-ur-city-4-2` and `vesta-parliament-4-6` memstates that #314 established were
only ever decoded statically. Restoring them in Hatari 2.6.1 emits
`Memory snapshot IPF floppy data incompatible with this Hatari version`, which
`Log_AlertDlg` raises as a modal dialog; a stack sample of the blocked process shows
it parked in `-[NSAlert runModal]` inside `IPF_MemorySnapShot_Capture`, and the
emulator never runs. `eris-spaceport-onfoot.sav` contains no such block and restores
cleanly. This is an evidence-capture defect in those three memstates, not a missing
emulator or ROM, and it blocks every runtime claim about DION, GAEA and VESTA.

Two laboratory changes came out of that diagnosis and are in this change set:

- `build_hatari_command` now passes `--alert-level fatal`, so no log message can open
  a modal dialog in a headless run.
- macOS also blocks Hatari at startup in `NSPersistentUIRestorer` once the app has
  crash history. `defaults write org.hatari-emu.Hatari ApplePersistenceIgnoreState
  -bool YES` clears it; the equivalent environment variable is **not** honoured, so
  this stays a documented machine prerequisite rather than a code change.

What the Vesta memstate does still give, statically, is the authored shape of a
support relationship and of a multi-object stack: three objects carried
(`151, 181, 183`) with capacity 10, and `SCROLL` slot 153 resting on `TABLE` slot 202
at the same X and Z. That corroborates the recovered rules; it is not a reproduction
of a drop.

## Source ranges

Half-open ranges in the pinned first-world RAM.

| Range | SHA-256 |
| --- | --- |
| `$0541F0`–`$0542C4` take handler | `d74b51136472acaf71d4470cba1d15cee281c9d69b3813b88c82aab0f8c01512` |
| `$0542C4`–`$0542E0` take tail and refusal targets | `988d4be336a970575bffe8c8be9267eb666f604f6187e657a500438550cf4a58` |
| `$054520`–`$054744` drop handler | `32ff685b20f7b7a98476499f89b540abbef26150df2adfb297e2016e631d8f5e` |
| `$0545AC`–`$0545D4` rank comparison | `99290c827743735b67d38f0e3ddbcc08f0c9d4993eb821c777fd64a15a4a4e70` |
| `$04DC40`–`$04DD90` Carried Stack and panel label | `38b6d2e4fc22af452eff273d943d65149f4f8820e8aee1bc9be8912eb673c877` |
| `$052C9C`–`$052D42` surface list and association builder | `e971ecc94ff748bdc2f704c678c5b219c197ce9835a7c80f9f78187469837546` |
| `$05A30E`–`$05A3DE` region resolve and membership clear | `a66ed42e20865d824b72b4b8057529aded4ed7b8d751801a5c1add4d931a77f9` |
| `$054770`–`$0547C6` trigger dispatch (see [pickup responses](damocles-pickup-responses.md)) | `0e5267c71f7f6d5985f4971cca82a53268e86ad3909048cefa3b9e87142027f0` |
| `$0543BE`–`$0543FA` carry-dependent panel and effect lookup | `7a3b3721bf94f953f3536b63be6c9de7aa7f9c2bfe41c34793b5596d14e9d059` |
| `$04E05A`–`$04E17E` price, credit and debit | `eb977e835d0a228a83fde200d0c9744c9dcc695b7aefee5d1873c176fb36726e` |

## Deterministic expectations for the port

These are derived acceptance tests, not emulator observations. Each is stated so that
a persistence test can assert it without replaying actions.

1. A take moves the slot to the head of the Carried Stack, sets handling bit 7, clears
   Association B to zero and then writes body `$78`, and clears the structure-group
   byte. A save taken while carrying must restore the same stack order, the same
   carried flags, and the same VOID body byte.
2. A drop writes body, level, cell, structure-group, class and insertion group from
   the player's current state. Restoring a save must reproduce those six fields
   exactly; recomputing them from the authored record is wrong, because the class byte
   and the insertion group both change.
3. A surface drop is body byte equals current body **and** insertion group zero. A
   restore must keep an object dropped outdoors while a structure was bound in the
   surface list, not in that structure.
4. Draw membership and the draw queue are rebuilt from residence at every region
   change, so neither is saved. A restore that reproduces residence must reproduce
   the queue without storing it.
5. A drop with an empty Carried Stack, with the scroll counter non-zero, or onto a
   support that cannot carry the object leaves every field above unchanged. A
   persistence test must be able to assert "no state changed" for a refusal, including
   the panel label pointer and the scroll counter.
6. Drop and re-pick while an initial pickup response is pending neither restarts nor
   cancels it: the one-shot trigger stays disarmed and the script continues. The
   `scroll-control` run above is one instance of the drop half, mid-response, and the
   key research records the full drop-and-re-pick sequence.
7. Capacity is state, not a constant, and a drop can change it. A restore must
   reproduce capacity, count, order and the BRIEFCASE overflow store together; their
   rules are in [the capacity research](damocles-carry-capacity.md).
8. Carried staging is derived from the Carried Stack, not stored. A carried object's
   Association B level byte is its index in the stack and its Y is `300 × index`, and
   both are rewritten by every rotation and every drop. A restore that reproduces the
   stack order must reproduce these without saving them; a save that persists them
   independently will disagree with the stack after the first rotation. Observed at
   the Vesta pose.
9. The support range is a three-dimensional exponent. An object lying where the player
   is standing is 63 units below the player's Y and reads exponent 5, not zero. A port
   that measures the support range in the plan alone diverges from the original at
   every drop onto an object at the player's feet. Observed at the Vesta pose.
10. A drop onto a support writes the support's X and Z, the support's Association B in
    full, and Association A bytes 1 and 3, and leaves the dropped object's handling
    byte alone. A drop with no eligible selection inside the support range writes the
    player's X and Z and Y minus 63 instead. A persistence test can separate the two
    by position alone. Observed at the Vesta pose as a matched pair.

## Open blockers, and what #331 closed

Closed by the Vesta observations above:

- **Nearby-support placement** — observed and accepted, with the full field
  inheritance, against a matched direct-placement control.
- **The support-rank refusal** — observed, with a matched breakpoint run stopping at
  `$054514`.
- **Multiple simultaneously carried ordinary objects, Carried Stack rotation, and
  multi-object drop ordering** — all observed on ordinary input, including the panel
  label following the head and the carried staging being re-indexed.
- **The DION, GAEA and VESTA memstates** — rehosted rather than recaptured, and their
  runtime decode agrees with #314's static decode.

Still open:

- The **model-form refusal** and the **height refusal** have no ordinary-route
  observation. The reason is specific and is recorded above: every reachable support
  that clears the rank comparison is the `DAMOCLES FILE`, and the supports that would
  fail either gate are inside Vesta Parliament, which no route has yet entered.
- The **requirement-zero refusal** likewise has no route: nothing requiring rank 0 is
  carried at any replayable pose.
- Every interior other than Capital Spaceport region 1, every no-structure cell, every
  passage and every unbound placement remain uncovered, as the key research already
  recorded. The Vesta pose adds a second **outdoor** cell, not an interior.
- The `$7046` support-rank bypass and the slot-0 contact bypass are recorded but
  unexplained here and in [the capacity research](damocles-carry-capacity.md), which
  additionally shows that the fourth take-side test's operand is self-modified by the
  unidentified restore path at `$055190`. `$7046` read `$05` in every #331 run, so the
  bypass never fired; reaching it needs `DOOR KEY` slot 39 carried, which needs an
  interior.
- The drop's level byte `$7AC5` and the association builder's `$7AA5` are the same
  quantity, observed through live drops at levels 9 and 10 (#326 captures). What is
  still unobserved is either gate **refusing**: every support reached so far passes
  the model-form and height gates.

The rules above are delivered and
[#315](https://github.com/odogono/mercenary/issues/315) is closed. The observations
it could not reach were tracked as
[#331](https://github.com/odogono/mercenary/issues/331), and most of them are now
made; what is left no longer sits behind the location work in
[#324](https://github.com/odogono/mercenary/issues/324)–[#327](https://github.com/odogono/mercenary/issues/327).

The three remaining uncertainties that affect admitted behaviour — the model-form
gate, the height gate and the `$7AC5`/`$7AA5` identity — shared one prerequisite:
an ordinary route into a structure interior at a non-zero level.

**That prerequisite is met.** [#326](https://github.com/odogono/mercenary/issues/326)
published seven on-foot captures standing inside structures at levels 1, 4, 9 and
10, each carrying four objects. Live drops from two of them exercise both
placement paths above level 0 and settle the `$7AC5`/`$7AA5` identity.

What is left is narrower than a blocker on admitted behaviour: **no reached
support refuses**. The model-form and height gates are observed accepting, and
their refusal branches remain recovered from instructions only. A refusal needs a
support whose model top rises above the player's eye, or one whose model opens
with an unadmitted header type; neither has been found in reach at any captured
pose. That is worth recording against
[#318](https://github.com/odogono/mercenary/issues/318) as a bounded observation
gap rather than as unrecovered behaviour.
