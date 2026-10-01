# Damocles workspace selection

Working-Authority Evidence for [#324](https://github.com/odogono/mercenary/issues/324),
part of the location work in [#313](https://github.com/odogono/mercenary/issues/313).
Authoritative Evidence remains bound to the C64 Reference Build. This note records
decoded ST facts only and does not translate the program into a new model.

## Decision

For an interior-associated resident, the cell byte is interpreted in the
currently loaded structure-group record. The effective scene key is:

```text
(body, structure-group, cell, level, insertion-group)
```

The structure-group byte is Association A byte 1. The cell, level and
insertion-group bytes are Association B bytes 3, 2 and 1 respectively. The
native interior association builder reads those selectors against the current
group and cell state; the cell byte does not select a group by itself.

For a surface resident, Association B's second byte is zero and the surface
classifier takes the resident's absolute body-local coordinates instead. The
surface path does not use Association A byte 1 to bind the object to a
structure-group workspace. A surface object's coordinate phase can therefore
plot it, while its authored map identity can remain unresolved.

## Working Authority and probe

| Item | Value |
| --- | --- |
| Program SHA-256 | `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef` |
| EmuTOS SHA-256 | `154803e3ff4851f3dc358b91b16d6b6110d187a81d8132ecb665af49878939d5` |
| Tracked scenario | `research/damocles-st/scenarios/workspace-selection.json` |
| Probe run | `observe-workspace-selection-20260918T044427Z-9510a0f4` |
| Observed RAM SHA-256 | `24fec7974398e174df3fc8547fa27050e342f70f4f40edd587fa0bc1d8a7500c` |
| Disassembly SHA-256 | `7b5f197d2bec20079ef6d7a244c31c5dabb43841816568e83f24e39bab37b598` |

The run is Working-Authority Evidence. Its RAM and disassembly remain in the
ignored `research/damocles-st/work/` directory. The loader window was extended
through `$04F000` in the tracked `ground-neighbor-workspace` scenario; that
run's observed RAM is
`a94ecf30e798c86492094a5dedde2ccc57f8a646a0f7f6ba93907f4a6a2ff521` and its
disassembly is
`703ca450be5886b2363a34f81ee7da9d2498b29aea6a909837e82cd66861db1a`.

## What the workspace load writes

The bounded loader at `$04EB02..$04ED72` establishes the workspace before the
resident scene is assembled.

- `$04EB02..$04EB3E` advances or retreats `$794E` until the group-offset table
  at `$1E64C` has a nonzero record for that group. `$04EB46..$04EB5C` copies
  the selected record's fields to `$789A`, `$789E` and `$7A1A`, and installs
  the group in `$794E` when it changes.
- `$04EB60` resolves the selected group through `$1E64C`, skips the group
  record header, and decodes its run-length extent stream into the 16×16
  workspace at `$1E000`. The record also supplies the pair at `$7AEE` / `$7AEF`
  and six selector words copied into `$1E640..$1E64A`.
- `$04EC30..$04EC92` walks the decoded grid to rebuild the ground/index words
  at `$1E400` and the edge/extent flags at `$83DC` before the live cell table
  is rebuilt.
- `$04EC94` clears all 256 four-byte entries at `$ABDC`. The following override
  stream is `[source-reference, cell, low-byte]`, followed by
  `[high-byte, signed-dx, signed-dz]` when the low byte is nonzero. The
  resulting word's low nine bits select a structure slot; its high-byte scene
  bits select the structure scene. The signed offsets are part of the cell
  instance, not a workspace identity.
- `$04ED14` publishes the group record's place-list pointer at `$7A6C` and
  `$04ED26` publishes the end at `$7A68`. `$04ED4A` then scans the six-byte
  records at `$6364`; a record whose first byte matches `$794E` can replace a
  non-negative cell word in `$ABDC`.

This is why `$7A6C` text is useful corroboration but not a sufficient selector:
the Dion capture has `$794E=$02` and a `$7A6C` pointer to **BIRMINGHAM
ISLAND**, even though that label list is known to be stale for Dion. The group
record and the rebuilt `$ABDC`/`$1E000` data are the runtime workspace state;
the place label is not an independent body binding.

## What an interior resident reads

The native interior-association path at `$052CDC..$052D40` accepts a nonzero
Association B second byte, then combines the resident selectors with the
loaded workspace:

- Association A byte 1 must identify the current structure group (`$794E`).
- Association B byte 3 is compared with the current cell (`$7B5C`).
- Association B byte 2 supplies the level (`$7AA4`).
- Association B byte 1 selects the insertion group in the selected structure's
  association list rooted through `$7B0E`.

The body selector (`$7AA8`) classifies the resident and identifies its body;
it is not the 16×16 workspace selector. A cell match without the group match
is therefore not a valid interior placement.

## Gaea consequence

The Gaea rows in the [location ledger](damocles-gamma-system-location-ledger.md)
contain 28 interior residents in two structure-group partitions. Applying the
decoded group-record format to the attested first-world RAM gives every listed
Gaea scene an authored cell instance; no Gaea scene is ambiguous at the raw
cell level once its group byte is included.

| Structure group | Gaea residents | Cell/level scenes | Evidence and disposition |
| ---: | ---: | --- | --- |
| `$07` | 15 | `$17/00`, `$21/00`, `$21/0A`, `$25/00`, `$25/0A`, `$29/0A`, `$31/00`, `$39/00` | The static record at `$024315` has place-list pointer `$024402` (`UR CITY`). The live Gaea capture has `$794E=$07`, `$7A6C=$024402`, and an `$ABDC` table identical to the static decode. **Bound to the live UR City workspace.** |
| `$0F` | 13 | `$14/00`, `$14/01`, `$65/00`, `$66/01`, `$66/0A`, `$88/01`, `$D4/02` | The static record at `$02479F` authors all requested cells and has place-list pointer `$024AB4`, whose bytes begin `CHALDEA METROPOLIS`. **Bound to the live CHALDEA METROPOLIS workspace** — see below. |

### Group `$0F` is bound: CHALDEA METROPOLIS

The second row was an explicit identity gap until #326 produced a live capture
standing in it. `gaea-transporter` restores with:

| Word | Live value | Static decode of group `$0F` |
| --- | --- | --- |
| `$794E` structure group | `$000F` | `$0F` |
| `$7A6C` place list | `$024AB4` | `$024AB4` |
| `$7B5C` cell | `$88` | authored (`$88/01` is a requested scene) |
| `$7AA4` level | `1` | authored |
| `$ABDC` | 256 entries | **identical** |

That is exactly the test that bound group `$07` to UR City in this note: the
place-list pointer the running game published, and an `$ABDC` table the static
decode reproduces entry for entry. The place list reads `CHALDEA   METROPOLIS`,
and the group is now attested by a capture rather than by its label alone — the
Dion staleness caveat does not apply, because the binding rests on `$ABDC` and
`$7A6C`, not on the text.

The capture also explains why the gap persisted. `gaea-transporter` stands in a
16×16 window whose origin its own longwords imply as `256,768`, while the Gaea
origin recorded below is `512,1792`. Group `$0F` was never going to appear in a
capture taken in UR City, because it is a different window of Gaea.

Thirteen Gaea residents hang off this record, including `KEY - 22 CV` (slot
191), which shares cell `$88` level 1 with the transporter the capture is
standing at, and `GOLD` (slot 155) at `$66/0A`.

The ledger's individual Gaea rows are the complete resident inventory:

```text
group $07: 64, 84, 141, 197, 205 | 210, 233 | 78 | 211, 232 | 79 |
           152, 163 | 52 | 26
group $0F: 28, 90, 103 | 98 | 86 | 27, 125, 229, 239 | 155 |
           70, 191 | 30
```

Thus all 28 interior residents are bound to one exact static group record, and
both records are now bound to a live workspace: 15 to UR City and 13 to
CHALDEA METROPOLIS. This does not yet emit catalogue placements; the remaining
body-map work is separate delivery work.

## The association list is bound per level, not per cell

`$7B0E` is not a property of the cell. The native walk at `$05A266` consumes one
structure's region descriptors and `$05A2FA` publishes the address it stopped at,
so the root identifies **whichever structure the game has bound**. At level 0
that is the cell's own authored instance. Above level 0 it is a different
record — the interior — which the cell instance's alias record names in its
floor table at `+6` ([#355](https://github.com/odogono/mercenary/issues/355)).

Vesta cell `$64` is the controlled case, because two captures stand in it at
different levels with everything else equal:

| Capture | Cell | Level | `$7B0E` | Structure | Regions | Insertion groups |
| --- | --- | ---: | --- | --- | ---: | --- |
| `vesta-parliament-4-6` | `$64` | 0 | `$017834` | slot 70, base **90** | 22 | `01 03 04 05 06 07 12 14` |
| `vesta-transporter` | `$64` | 10 | `$017B4A` | slot **91** | 8 | `05 06 07 08` |

Vesta's floor table reads `90, 92, 92, 93, 0, 0, 0, 0, 0, 0, 91`, so level 10
names slot 91 by lookup.

Same body, same group `$05`, same cell, different level, different structure.
This is the prerequisite the drop research recorded as unreached: the seven
Vesta residents above level 0 are placed without insertions because their
insertion group is absent from the list bound at level 0. Group `$08` is the
clearest instance — absent at level 0, present at level 10, and named by
`TRANSPORTER a · slot 68`, which the level-10 capture is standing at.

### The rule, and how it is gated

A resident's insertion group resolves in the structure bound at the **resident's
own level**. Across seven captures on six bodies, every catalogue resident whose
association names the captured scene names an insertion group the bound
structure offers:

| Capture | Group | Cell | Level | Bound structure | Residents resolved |
| --- | --- | --- | ---: | --- | --- |
| `vesta-parliament-4-6` | `$05` | `$64` | 0 | slot 70 (base 90) | BENCH |
| `vesta-transporter` | `$05` | `$64` | 10 | slot 91 | TRANSPORTER a |
| `gaea-transporter` | `$0F` | `$88` | 1 | slot 58 | TRANSPORTER a, KEY - 22 CV |
| `dion-transporter` | `$02` | `$E3` | 1 | slot 58 | TRANSPORTER a |
| `metis-transporter` | `$03` | `$60` | 9 | slot 58 | TRANSPORTER a, FILOFAX, PROCESSORS CHAIR, PROCESSORS DESK |
| `logos-transporter` | `$08` | `$24` | 4 | slot 67 | TRANSPORTER a |
| `pan` | `$0C` | `$14` | 1 | slot 55 | KEY - BULLET |

Ten residents, no misses. `structure-group-probe.py` enforces this as a gate: a
resident naming a captured scene whose insertion group the bound structure does
not offer raises, so the rule is falsifiable rather than a reading. Four
structure groups are bound here for the first time — Gaea `$0F`, Metis `$03`,
Logos `$08` and Pan `$0C`.

**The static rule is now recovered**, by
[#355](https://github.com/odogono/mercenary/issues/355): the alias record's
floor table at the record plus six, which `$054DBC` publishes in `$7C1E` and
the lift indexes by the destination level before assembling that structure. The
probe derives the bound structure at every level and raises when the derived
association root is not the live `$7B0E`; all seven captures pass. Neither
observation offered here was the rule — slot 58 recurs because Gaea, Dion and
Metis place the same authored instance, and Logos's level 4 names 67, two above
its base. See
[the level-to-structure binding](damocles-level-structure-binding.md).

### Eris group `$12` does not yet reproduce

The `$ABDC` gate fails for every Eris capture, at four adjacent cells and
nowhere else:

```text
cell $3C: live 3c 52 ec 00   static 3c 00 ec 00
cell $3D: live 3c 52 00 00   static 3c 00 00 00
cell $3E: live 3c 52 00 00   static 3c 00 00 00
cell $3F: live 3c 52 83 00   static 3c 00 83 00
```

`eris-spaceport-onfoot`, `eris-transporter-11-8`, `interior-window` and
`boarded-limo` all produce the identical live bytes, so this is stable state and
not a gameplay difference between captures: the static decode of group `$12` is
missing a step that writes byte 1 for cells `$3C`–`$3F`. The `$6364` replacement
scan is not the cause — its one non-zero record begins `$46`, which never matches
`$794E=$12`. This is recorded as an open decoder gap; the gate is left in place
rather than relaxed, so Eris memstates are excluded from the probe's standard
invocation until it is closed.

## 99 CHEVY and the shared origin

Slot 2, **99 CHEVY**, is a surface resident with Association B `$20000017`.
Its body-local 16.16 coordinates are recovered in the
[resident-object note](damocles-resident-objects.md#99-chevy), and its cell
byte is `$17`. Because its Association B second byte is zero, the surface path
does not consume the structure-group selector used by interior residents.

The recovered Gaea origin `(512, 1792)` is derived from Chevy's coordinate
phase and is also reproduced by the live UR City workspace. The BIRMINGHAM
ISLAND stream once bound to the same phase is structure group `$02`, Dion's
island ([#673](https://github.com/odogono/mercenary/issues/673)), so UR City is the only Gaea map there and Chevy stands in its
window.

This leaves the surface and interior conclusions separate:

- interior Gaea records use `(group, cell, level, insertion-group)` and now
  have a determined group record;
- surface Gaea records have body-local coordinates, but a shared origin does
  not choose between authored/live map streams;
- further Gaea island recovery and authored disambiguation remain out of scope
  for #324.
