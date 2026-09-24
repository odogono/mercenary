# Where the Damocles Floor Label is drawn

Working-Authority Evidence for [#473](https://github.com/odogono/mercenary/issues/473),
part of the lift map [#470](https://github.com/odogono/mercenary/issues/470), recovered
2026-09-24. Authoritative Evidence remains bound to the C64 Reference Build. This note
records decoded ST facts only and does not translate the program into a new model
([ADR 0002](../adr/0002-separate-rom-research-from-implementation.md)). Captures, RAM,
the native listing and screenshots stay ignored Restricted Material under
`research/damocles-st/work/`. Only addresses, decoded facts and hashes are recorded here.

## Decision

The Floor Label is drawn in the 3D scene as **structure wall text**: a post-plan record in
the structure record itself, not a building-detail `$60xx` record and not a HUD element.
The record's text is the single token `$80` or `$81`. Both `$CCA0` entries for those tokens
point at `$CD04`, the byte the lift writes
([lift control](damocles-lift-control.md#stepping)), so the glyph is whatever the label
shows at that frame.

In the Eris State Office, each Floor's structure (slots 76, 78 and 79) carries two such
records, one beside each lift car's doorway:

| Queue byte | Anchor (X, Y, Z) | Plane | Font | Glyph scale | Colour |
| ---: | --- | --- | ---: | --- | --- |
| 15 | (−610, 70, −260) | ZY | 2 | (−4, 4) | `$0777` |
| 26 | (−610, 70, −60) | ZY | 2 | (−4, 4) | `$0777` |

Each record rides on a plan face. The game draws the label straight after that face,
whenever a region queue draws that face. The records are identical on all three Floors,
so the label shows the lift's current Floor wherever it is drawn. Slot 78 also carries a
large `$81` label on the Floor 1/2 landing (queue byte 43, (−400, 70, −100), scale
(−8, 16)). Slot 79 adds the literal wall text `B A S E M E N T`.

The Catalogue now publishes these records as `structureSelection.floorLabels`, plus one
document-level `floorLabelGlyphs` table (see [What the Catalogue publishes](#what-the-catalogue-publishes)).

This corrects #470's recorded decision that the label is "live building-detail vector
text". It is live vector text, but it belongs to the structure, and the Catalogue skipped
exactly this record family (`skip_other_post_plan`). That is why the port drew no `G`.

## Working Authority and evidence

| Item | Value |
| --- | --- |
| Program SHA-256 | `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef` |
| TOS SHA-256 | `154803e3ff4851f3dc358b91b16d6b6110d187a81d8132ecb665af49878939d5` |
| Static source | `observe-first-world-20260818T101013Z-c5a32b7d/observed.ram`, `b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967` |
| Live capture | `rehosted/eris-lift.sav`, `7ba0352ffc3b3b0d1195e9cbfaec09598d4edd49f3ae4dc1f9a516cacb3de5a9` ([rehosting](damocles-lift-control.md#the-state-office-capture-rehosted)) |
| Probe | [`research/damocles-st/scripts/floor-label-probe.py`](../../research/damocles-st/scripts/floor-label-probe.py) |

| Window | Role | SHA-256 |
| --- | --- | --- |
| `$059E94`–`$059F4F` | post-plan wall-text builder | `77f019ff43af0e562bb0df0d5d117ec4852c3f78d5ee588e71d44ec4559d1282` |
| `$05A41A`–`$05A4BB` | draw-list build: face, then its wall text | `93df03f963ced07a0f7dc803711b7ef5b61dba942b8c8e951022351da0e6f495` |
| `$05A7D6`–`$05A80D` | draw pass dispatch | `21d79bb6004c1c292424a7b26811a3cec54b44d27e9a1b397240ed21b6327d29` |
| `$053FAC`–`$053FEB` | structure text consumer | `d53470afcbf4c10569c3c646647725199f46bf9d2e12047dd2e62dd3ab78eb49` |
| `$054000`–`$0540A3` | font select and `$CCA0` token read | `b88dd3e28328d2efa7afd1647400abb3ddd2b78ac1a012f0f2866f1700b7b667` |

The structure bank `$10000`–`$1DFFF` is byte-identical in the first-world RAM and all 33
memstates. The building-detail and font banks `$20000`–`$356FF` are identical too. One
image therefore holds every record discussed here.

## How it was found

A byte scan of every capture for `$60xx` records ending in token `$80` or `$81` found none,
in either the building-detail or the object layout. `$CD04` has no absolute reader: the
five writers at `$055ABA`–`$055B9E` are its only references in `$40000`–`$5FFFF`. The
one reader of the token table is `lea $CCA0,a0` at `$05408E`.

The #471 screenshots show a white `G`, later `B`, on the lift's back wall. So a record *was*
reaching the token. A live breakpoint on `$054098`, the `$CCA0` index
(`movea.l (a0,d0.w),a0`), with `d0 < 8` (tokens `$80` and `$81`) fired inside the State
Office lift. The pushed text pointer was `$014CD2`: the token sits at `$014CD0`, inside
structure record `$014AEC` (slot 76). The draw-list entry that led there was `$8000C8D6`.

## The record family

`$059E9E` walks the post-plan list, which follows the plan faces. A control word whose low
byte is zero or `$F0` is an Entrance Attachment
([entrance attachments](damocles-generic-entrance-attachments.md)). Any other low byte of
`$10` or more also goes to `$059F50`. A low byte from 1 to 15 is wall text:

| Offset | Field |
| --- | --- |
| `+0` word | control: the character advance in glyph units (the whole word is multiplied, and every record's high byte is zero) |
| `+2` byte | flags: bit 7 selects the ZY plane, bit 6 would select the `$C945` exchange, low nibble is the font |
| `+3` byte | queue byte of the face the text rides on |
| `+4` word | offset along the text; bit 0 asks for the rest to be multiplied by the placement scale |
| `+6`..`+11` | X, Y, Z |
| `+12`, `+13` | glyph X and Y scales, signed bytes |
| `+14` word | colour, ordinary direct/scene grammar |
| `+16` | NUL-terminated text, then padding to an even address |

The builder writes one 20-byte entry per record into the table at `$C8C0`, ending with
`$FFFF`. The entry holds the queue byte × 4, then an 18-byte block: X and Z multiplied by
the placement scale (`$79B6`/`$79B8`), Y unscaled, the flags *byte* as a word, the advance,
both glyph scales, the colour, and a **pointer to the text**, not the text.

Because the flags word's bit 15 is always clear, `$054078` takes the indirect path and
reads the text through that pointer. That is why no inline scan finds it. The offset is
halved, multiplied by the absolute placement scale along the text if its low bit was set,
and subtracted along the text. A negative placement scale *across* the text negates the
glyph X scale, the advance and the offset.

`$05A41A` builds the draw list from the region queue. After appending a queue entry, it
scans `$C8C0` for keys equal to that entry's byte × 4 and appends each match as
`$80000000 | block`. So a wall text is drawn exactly when its face is. The key is a queue
byte, so it resolves the way a region queue byte does: plan face `byte − 1`, or an
attachment slot or face. `$05A7F6` sends a negative entry with bit 30 clear to `$053FAC`.
That routine subtracts the player's structure-local position (`$79A8`/`$79AC`/`$79B0`) and
falls into the same flags, advance, scale and colour path the object and ground records
use (`$053FCA`).

### Census

The resident bank holds 89 wall-text records in 42 structure records:

- **73 are a Floor Label**: text exactly `$80` or `$81`, in 39 structure records. Fonts 1
  and 2 draw 70 of them. Three select font 4 (queue byte 20 in slots 84 and 85, queue byte
  13 in slot 88). For font 4, `$054016` substitutes font 3 when `$706E` or `$7116` is
  negative. [#485](damocles-structure-wall-text.md#font-4) recovered that condition: those
  words are the handling bytes of slots 49 and 91, READING GLASSES and RED HERRING, and
  bit 7 is the carried flag.
- **16 are other wall text**: `NOVAGEN`, `EXIT`, `INVENTORY`, `BRIEFCASE`,
  `NESBITT LIBRARY`, `B A S E M E N T`, `68 09 20 33`, and the tokens `$8A` (`$CD19`),
  `$8D` and `$8E` (structure-workspace face markers). #473 drew none of it.
  [#485](damocles-structure-wall-text.md) draws the literal records and names each token
  record's target in its model's reason.

Every record uses plane 0 (XY) or `$80` (ZY). None sets bit 6.

No instruction in `$40000`–`$5FFFF` names `$CCA0` or `$CCA4` as a destination. Both hold
`$CD04` in the first-world RAM and in all 33 memstates. The earlier
[`$CCA0` census](damocles-building-vector-text.md#cca0-token-census) inventoried `$60xx`
model records only, which is why it never met these two tokens.

## Runs

```sh
python3 research/damocles-st/scripts/floor-label-probe.py decode
python3 research/damocles-st/scripts/floor-label-probe.py live --roms roms --case lift
python3 research/damocles-st/scripts/floor-label-probe.py live --roms roms --case lift-ride
```

All three pass.

**`decode`** reads all 33 memstates without Hatari, and raises on any of these failures:

- either token pointer is not `$CD04`;
- `$CD04` is not the label for the Floor at `$7AC4`;
- the capture's `$C8C0` table differs, byte for byte, from the table rebuilt out of the
  post-plan records of the structure the game assembled (identified by association root,
  `$7B0E`) at the live placement scale;
- the Catalogue's `floorLabels` for that structure and scale are not the table's `$CD04`
  records.

It also raises *not reached* unless both named captures stand in a structure carrying a
Floor Label: `damocles.eris.lift` on Floor 0 and `damocles.vesta.transporter` on Floor 10.

23 captures stand in an identifiable structure, and all 23 reproduce `$C8C0`. The other
ten have a `$7B0E` outside the structure bank. Twelve of the 23 carry Floor Labels, in nine
distinct structures at placement scales (1, 1), (2, 2), (3, 3), (−3, −3), (−2, −2) and
(−4, −3). The Catalogue agrees with every one.

**`live`** boots the rehosted State Office capture and arms one breakpoint on `$054098`
with `d0 < 8` and `($CD04).b` equal to the label the case expects. It writes nothing into
the guest.

| Run | Case | Observed |
| --- | --- | --- |
| `floor-label-lift-20260924T162319Z-dcebb4f4` | Floor 0, at rest | token `$80` at `$014CD0` read while `$CD04` = `G`; draw-list entry `$8000C8D6`, the `$C8C0` entry for queue byte 26: (−610, 70, −60), flags `$0082`, advance −24, scale (−4, 4), `$0777` |
| `floor-label-lift-ride-20260924T162330Z-8541d6bd` | key `2`, mid-ride | the same record read while `$CD04` = `1`, `$788A` = 2, `$7AC4` = 1, root still `$014F26` (Floor 0's structure) |

The ride run adds to [the lift ride](damocles-lift-ride.md) ([#472](https://github.com/odogono/mercenary/issues/472)). During a ride the label is drawn by the *departure* Floor's own records, and
it shows each Floor passed, before the destination structure is bound. The screenshot a
breakpoint saves shows the last displayed frame, not the one being drawn, so the ride
run's picture still shows `G`. The RAM at the hit is the evidence. #471's ride
screenshots show the drawn label stepping.

## What the Catalogue publishes

`read_wall_text` replaces `skip_other_post_plan` and reads the same bytes, so every
selector the Catalogue kept is unchanged. `wall_text_placement` is the builder's rule
above. `decode_structure_selection` publishes each Floor Label record whose font is not 4
as a `structureSelection.floorLabels` entry:

| Field | Meaning |
| --- | --- |
| `face` | the queue entry it rides on, in the region queue's own form (`face`, `attachment` or `attachmentFace`) |
| `anchor` | X, Y, Z in the structure's scaled local frame, the builder's result |
| `plane` | 0 (XY) or 128 (ZY) |
| `font` | the source font |
| `scale` | glyph X and Y scales after the builder's mirroring |
| `colour`, `sourceColour` | resolved through the model's palette, and the raw word |

The document gains `floorLabelGlyphs`: for each font a published label uses, the eleven
characters `G`, `1`–`9` and `B`, read from `$31700` in unscaled glyph units. That was
fonts 1 and 2; #485 adds 3 and 4, because a font-4 label now carries a font-3 `fallback`.
A glyph point (x, y) draws at `anchor + (x·sx, y·sy, 0)` on the XY plane, or
`anchor + (0, y·sy, x·sx)` on the ZY plane. The label is always one character, so the
advance is not needed.

Following the `keyBase` precedent, the schema version stays at 17. No Save depends on
either field. 109 structure models publish 165 labels, and 170 since #485 published the
font-4 ones. Four selections that carry labels
are later dropped for want of a detail binding, and their reasons say their labels went
with them. The State Office publishes the table above on slots 76, 78 and 79, and on its
alias `structure-014ad2`.

To reproduce, regenerate the Catalogue with the tracked command in
[the Catalogue note](damocles-catalogue.md#reproduce). `git status --porcelain` stays
empty afterwards: the payload reproduces byte for byte.

## For #477

- Draw each `floorLabels` entry of the bound structure right after its `face` whenever a
  region queue draws that entry. Use the glyph of the session Floor's label in the entry's
  font, placed by the rule above, in the entry's colour.
- The same label appears on every structure that carries one, not only inside a Damocles
  Lift. On a ride it follows the stepping label, not the destination.
- Where no `floorLabels` entry exists, draw no label.
- A label with a `fallback` draws in `fallback.font` while any slot in
  `fallback.whileCarried` is carried ([#485](damocles-structure-wall-text.md#font-4)).

## What this does not settle

- **Font 4's condition** and **other wall text** were left open here and are settled in
  [#485](damocles-structure-wall-text.md).
