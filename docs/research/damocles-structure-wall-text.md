# Damocles structure wall text that is not a Floor Label

Working-Authority Evidence for [#485](https://github.com/odogono/mercenary/issues/485),
found by [#473](https://github.com/odogono/mercenary/issues/473), recovered 2026-09-24.
Authoritative Evidence remains bound to the C64 Reference Build. This note records decoded
ST facts only ([ADR 0002](../adr/0002-separate-rom-research-from-implementation.md)). The
RAM, the captures and the screenshots stay ignored Restricted Material under
`research/damocles-st/work/`.

The record family, its builder and the `$C8C0` table are in
[the Floor Label note](damocles-floor-label.md#the-record-family). This note settles the
records that note left undrawn.

## Decision

- **Literal wall text is drawn.** The Catalogue bakes each literal record's glyphs at the
  builder's placement and publishes them as `structureSelection.wallTexts`. The port draws
  each one straight after the queue entry it rides on.
- **Font 4 is recovered.** It draws as font 3 while resident slot 49 (READING GLASSES) or
  slot 91 (RED HERRING) is carried. Font 4 is an alien script, so the glasses make the text
  readable. The three font-4 Floor Labels are now published, and so is the font-4
  `68 09 20 33`, each with its fallback.
- **Token text stays withheld.** Each token's target depends on state that is not model
  data. Every such record names its target in its model's reason.

## Working Authority and evidence

| Item | Value |
| --- | --- |
| Program SHA-256 | `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef` |
| Static source | `observe-first-world-20260818T101013Z-c5a32b7d/observed.ram`, `b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967` |
| Probe | [`research/damocles-st/scripts/floor-label-probe.py`](../../research/damocles-st/scripts/floor-label-probe.py) `decode` |

| Window | Role | SHA-256 |
| --- | --- | --- |
| `$054000`–`$0540A3` | font select, font-4 fallback, `$CCA0` token read | `b88dd3e28328d2efa7afd1647400abb3ddd2b78ac1a012f0f2866f1700b7b667` |
| `$059F50`–`$059FFF` | Entrance Attachment key letter into `$CD35 − slot/2` | `f1a1818e9dbb62b27f92c52bbde38d0ff9255c87a83a1d683519c864c3bde851` |
| `$04E05A`–`$04E131` | Trading Post readout into `$CD19` | `78787d49d23c1b532b7be327368abd5ec90d552e6b1778ebe24ae0aacb091fda` |

## The records

The resident bank holds 16 wall-text records that are not a Floor Label, and three
Floor Labels in font 4:

| Text | Structure record | Queue byte | Font | Outcome |
| --- | --- | ---: | ---: | --- |
| `INVENTORY` × 2 | `$010BB4` | 13, 15 | 0 | literal; the structure keeps no selector (its detail is empty), so the model's reason names it |
| `BRIEFCASE` × 2 | `$010D32` | 13, 15 | 0 | literal; the same as `INVENTORY` |
| `NOVAGEN` | `$010EC2` | 19 | 3 | drawn |
| `EXIT` | `$01231C` | 22 | 1 | drawn |
| `EXIT` × 2 | `$01730E` | 1, 6 | 1 | drawn |
| `B A S E M E N T` | `$01532A` | 6 | 3 | drawn (State Office Floor 10) |
| `68 09 20 33` | `$016C86` | 34 | 4 | drawn, with its font-3 fallback |
| `NESBITT LIBRARY` | `$01AAB2` | 71 | 0 | drawn |
| `<$8A>` | `$015EEA` | 28 | 0 | withheld: the Trading Post readout |
| `<$8D>`, `<$8E>` | `$0188D2`, `$01BE44` × 2, `$010908` | 80; 48, 55; 23 | 1 | withheld: a door key letter |
| Floor Label | `$01669E`, `$016990`, `$0170AC` | 20, 20, 13 | 4 | published with the font-3 fallback |

Aliases share their target's records, so the Catalogue publishes 15 wall texts on 13
structure models and 170 Floor Labels on 109. No record sets flags bit 6.

## Literal text

A literal record draws its bytes through the same flags, advance, scale and colour path
the Floor Label takes (`$053FCA`), from the anchor and scales `$059EB6` stores. The
Catalogue lays the glyphs out as `append_vector_text` does for building-detail text:
character *i*'s point (x, y) lands at `anchor + (i·advance + x·sx, y·sy, 0)` on the XY plane,
or `anchor + (0, y·sy, i·advance + x·sx)` on the ZY plane. Here `advance` is the control
word times the glyph X scale, after the builder's mirroring. Every published text lies
exactly in the plane of the face it rides on, and inside that face.

`floor-label-probe.py decode` now also gates this layout. In each capture whose structure
carries literal wall text, it rebuilds every literal record's glyphs from the capture's own
`$C8C0` entry. That means the stored anchor, flags, advance, scales and colour, with the
text read through the entry's pointer. The rebuilt glyphs must equal the Catalogue's mesh,
and its fallback mesh too for font 4. Two captures reach literal text: Clotho (`EXIT` at
scale (−2, −2), structure `$01DCB0`) and Vesta Parliament (both `EXIT`s at (3, 3),
`$01454E`). Both pass.

## Font 4

`$054010`–`$054022`:

```text
andi.w #$f,d0     ; the font
cmpi.w #4,d0
bne    $54024
tst.w  $706e.w
bmi    $54022
tst.w  $7116.w
bpl    $54024
moveq  #3,d0      ; font 3 instead
```

`$706E` and `$7116` have no absolute writer because they are elements of the handling-byte
array: `$706E = $6FAA + 4 × 49` and `$7116 = $6FAA + 4 × 91`. A word test's sign is bit 7
of that slot's handling byte. The Take sets that bit (`$0542A4`) and the Drop clears it
(`$04CAF0`). It is the same carried bit the `$F0` entrance key test reads
([generic entrance attachments](damocles-generic-entrance-attachments.md)). Slot 49 is
READING GLASSES and slot 91 is RED HERRING. The word reads `$0400` and `$0504` in all 33
captures, so neither was ever carried and the fallback branch is recovered statically,
not observed.

Font 4 is an alien script. The browser shows the Acheron wall carrying `68 09 20 33`
unreadable in font 4, and as those digits once READING GLASSES are in the Carried Stack.

## Token text

- **`$8A` → `$CD19`.** `$04E05A` runs only in structure `$52`, room 9 (`$7AF0`, `$7AFC`),
  which is the Trading Post. `$04E0BC`–`$04E130` formats six BCD bytes there as
  `000,000,000-00`, blanking leading zeros. The captures disagree: 32 read
  `000,000,000-00` and `damocles.key-west` reads `        616-50`. The value is live
  state, so the record is withheld.
- **`$8D` → `$CD37` and `$8E` → `$CD39`.** These are the door key letters `$059FC4` writes
  at `$CD35 − slot/2` for the Entrance Attachments in slots `$3FC` and `$3F8`. The letter
  is the low nybble plus the `$7AFB` key base of the cell the Instance stands in, plus
  `$23`, or a space where the cell installs no base. Every such record rides on its own
  structure's `$xxF0` entrance, so it would label that door. The letter belongs to the
  Instance's cell, not to the Model, so it is withheld. The Catalogue already publishes
  each Instance's `keyBase`, so a later task could draw it from that.

## What the Catalogue publishes

`structureSelection.wallTexts`, one entry per literal record:

| Field | Meaning |
| --- | --- |
| `face` | the region queue entry it rides on (`face`, `attachment` or `attachmentFace`) |
| `text` | the record's printable bytes |
| `font`, `plane` | the source font; 0 (XY) or 128 (ZY) |
| `mesh` | glyph fills or strokes in the structure's scaled local frame, colours resolved through the model's palette |
| `fallback` | font 4 only: `{font: 3, whileCarried: [49, 91], mesh}` |

A font-4 entry in `floorLabels` gains the same `fallback`, without a mesh, and
`floorLabelGlyphs` now carries fonts 3 and 4 as well as 1 and 2. Following the `keyBase`
precedent, the schema version stays at 17, because no Save depends on either field. The
payload regenerates byte for byte.

## How the port draws it

`structureMeshes` emits each wall text straight after the queue entry it names, choosing
the fallback mesh while the session carries a named slot. The frame draws its fills with
both windings and its strokes as in-plane quads from both sides. It pulls the text one
face-order step forward (`WALL_TEXT_ORDER`), the same step that settles a ground record's
later face, so the text lies over its coplanar wall the way the game's painter pass leaves
it. The Catalogue's region inspection forms show the text too, in its own font.

The State Office's `B A S E M E N T` shows on Floor 10's lintel since
[#487](https://github.com/odogono/mercenary/issues/487) draws the bound structure at its
Floor's height ([the lift ride note](damocles-lift-ride.md#where-the-floors-structure-is-drawn)).

## What this does not settle

- The door key letter and the Trading Post readout, above.
- Why the Floor Labels on queue byte 20 in slots 84 and 85, and 13 in slot 88, use font 4.
  The data selects it, and the rule above decides what it draws.
