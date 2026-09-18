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
| `$0F` | 13 | `$14/00`, `$14/01`, `$65/00`, `$66/01`, `$66/0A`, `$88/01`, `$D4/02` | The static record at `$02479F` authors all requested cells and has place-list pointer `$024AB4`, whose bytes begin `CHALDEA METROPOLIS`. No live capture with `$794E=$0F` ties that record to a named Gaea surface workspace. **Bound to static group `$0F`; named workspace/body identity unresolved.** |

The second row is an explicit identity gap, not a claim that the cell byte is
ambiguous between Birmingham and UR City. The runtime has selected group `$0F`
before it reads the cell; what is not recovered is which named surface map or
body history that static group label represents. The place-list text cannot
close that gap because the Dion example demonstrates that labels can be stale
or shared.

The ledger's individual Gaea rows are the complete resident inventory:

```text
group $07: 64, 84, 141, 197, 205 | 210, 233 | 78 | 211, 232 | 79 |
           152, 163 | 52 | 26
group $0F: 28, 90, 103 | 98 | 86 | 27, 125, 229, 239 | 155 |
           70, 191 | 30
```

Thus all 28 interior residents are bound to one exact static group record:
15 to the live UR City record and 13 to group `$0F` with the named-workspace
identity unresolved for the reason above. This does not yet emit catalogue
placements; the selected structure's local association traversal and the
remaining body-map work are separate delivery work.

## 99 CHEVY and the shared origin

Slot 2, **99 CHEVY**, is a surface resident with Association B `$20000017`.
Its body-local 16.16 coordinates are recovered in the
[resident-object note](damocles-resident-objects.md#99-chevy), and its cell
byte is `$17`. Because its Association B second byte is zero, the surface path
does not consume the structure-group selector used by interior residents.

The recovered Gaea origin `(512, 1792)` is derived from Chevy's coordinate
phase and is also reproduced by the live UR City workspace. It is therefore a
shared grid phase/coordinate frame, not an absolute island identifier. The
authored Birmingham stream is empty at `$17`, while the UR City `$ABDC` table
has HANTZENS NEW HOUSE there. No independent runtime binding selects either
map for Chevy, so its island assignment remains **Unresolved**. The catalogue's
Birmingham binding is a documented map-phase choice, not proof that Chevy is
on Birmingham Island.

This leaves the surface and interior conclusions separate:

- interior Gaea records use `(group, cell, level, insertion-group)` and now
  have a determined group record;
- surface Gaea records have body-local coordinates, but a shared origin does
  not choose between authored/live map streams;
- further Gaea island recovery and authored disambiguation remain out of scope
  for #324.
