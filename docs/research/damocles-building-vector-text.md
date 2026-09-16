# Damocles building-detail vector text

Working-Authority Evidence for the `$60xx` records embedded among Damocles
building-detail faces. Research note for
[#173](https://github.com/odogono/mercenary/issues/173).

Authoritative Evidence remains bound to the C64 Reference Build. These findings
are Working-Authority Evidence only. The targeted Working Disassembly and RAM
captures remain ignored Restricted Material.

## Scope

This note establishes enough of the native grammar to retain the surrounding
building geometry and render the evidenced inline text forms. Other text planes
and glyph forms outside those encountered here remain unresolved rather than
guessed. [#279](https://github.com/odogono/mercenary/issues/279) added the
`$CCA0` token census below and settled the indirect-text and font 4 questions.

Evidence uses:

- first-world RAM
  `observe-first-world-20260818T101013Z-c5a32b7d/observed.ram`, SHA-256
  `b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967`;
- Vesta Parliament Hatari memstate, SHA-256
  `47d817a931e54eeb1999cc5ca62c7ee3891e44464191741e3bcfffca94f362c1`;
- targeted disassembly of `$053A98..$05416A`.

## Native grammar

The building-detail setup at `$053AA6` selects a relative pointer from the
`$026000` table. After transforming the vertex stream, `$053B68` indexes each
post-vertex record. A record whose first byte has bits 6 and 5 set is retained
as a special pointer; setup advances 18 bytes from the record start and then
scans a NUL-terminated text stream. It is not a polygon failure.

The renderer at `$053E78` dispatches that pointer to `$053EE8`. The recovered
layout is:

| Field             | Encoding                                                    |
| ----------------- | ----------------------------------------------------------- |
| command           | `$60xx`; the low byte does not alter the evidenced dispatch |
| horizontal offset | signed word                                                 |
| anchor X/Y/Z      | three signed words                                          |
| flags/font        | word; sign selects inline text, low nibble selects font     |
| character advance | signed word                                                 |
| glyph X/Y scales  | two signed bytes                                            |
| colour            | word using the ordinary direct/scene palette grammar        |
| text              | NUL-terminated literal bytes or a terminal `$80..$98` token |

The accepted records use XY and ZY planes selected by flag bits 6–7. Font
pointers are signed words relative to `$31700`; the glyph index is character
plus `font × 64 − 32`. Glyph terminator `$80` selects filled polygons whose
byte references use the normal one-based multiples-of-four convention.
Terminator `$81` selects stroke pairs.

Negative text bytes are substitutions through the longword table at `$CCA0`.
The native routine at `$05408E` indexes the low seven bits, renders the pointed
NUL-terminated workspace string, and returns after the token. The table runs
`$80`–`$98`; entry 25 onwards is already the `$CD04` panel block, so the token
range is bounded by the workspace it points into. `$97` and `$98` point to the
current ten-character place name and kind at `$CD4C`/`$CD58`. `$91` points to
the current one-character face marker at `$CD3F`.

## `$CCA0` token census

Ten independent captures — two first-world observation runs and eight Hatari
memstates taken on foot, in a car, in a limousine, inside a building and on
three bodies — agree on everything in the `$CC00`–`$D000` workspace except
`$CC00`–`$CC1B`, `$CD3F`, `$CD4C`–`$CD52`, `$CD58`–`$CD61`, `$CD9F`, `$CDCE`,
`$CDD1`, `$CE6A` and `$CE6C`–`$CE6D`. That short difference list is what divides
the tokens:

| Kind | Tokens | Evidence |
| --- | --- | --- |
| Slot-derived label | `$87` (`$CD12`) | Written by the record's own `$8007`/`$8002` header |
| Frame animation | `$89` (`$CD9C`), `$8C` (`$CDCE`), `$82` (`$CE6A`) | Descriptor plus static script; see below |
| Structure-workspace face marker | `$8D`–`$96` (`$CD37`–`$CD49`) | Written by the placing structure |
| Place name and kind | `$97`, `$98` (`$CD4C`, `$CD58`) | Written by the current workspace |
| Live mission state | `$88` (`$CD14`) | Formatted at `$04DAFC`; see below |

### Frame animations

Three targets are descriptors, not strings:

| Field | Encoding |
| --- | --- |
| character | the byte the renderer draws |
| terminator | NUL, so the renderer stops after one character |
| index | unsigned word |
| script | NUL-terminated printable bytes |

In every one of the ten captures the script is byte-identical and the character
is exactly `script[index]`, while the index differs between captures — including
between two cold starts of the same scenario. The script is therefore model
data and the index is a free-running phase, the same standing as the
articulation angle at `$7888`. Nothing in RAM names `$CDD0` or `$CE6C`
absolutely, so the routine that advances the index reaches it through a
register; the advance rule is not claimed here, only that the character is
always the frame the index names.

- `$CDCE` (`$8C`) is AUTHORS COMPUTER's screen: 12 frames, `IPQRQPIMNONM`, drawn
  in font 2.
- `$CE6A` (`$82`) is TELEVISION's screen: 697 frames running through all 63
  printable font 5 glyphs.
- `$CD9C` (`$89`) has a 19-frame script of nothing but spaces, so the two
  building details that reach it draw the same space in every frame.

The catalogue offers eight evenly-spaced frames of each object script as
`text-frame-n` forms. A building detail reaching a script with more than one
distinct character would need per-frame detail forms, which no captured detail
requires, so that case fails closed instead of picking a frame.

### The explosive countdown

`$04DAFC` loads `$CD14` and formats four characters `M.SS`. `$04DAD0` subtracts
the clock at `$793E` from the armed deadline; a result at or below zero clears
the value, sets `$7A78` to 3, patches `$4BF54` and sets `$7834` to −1 — the
detonation path — and either way the remainder is stored at `$786A`. The
formatter divides it by 60 for the minute digit and indexes the two-digit second
pairs at `$0526C2` for the rest, adding `$30` to each.

All ten captures read `0.00`, which is both the disarmed reading and the
formatter's floor. The catalogue draws that reading and keeps the running
countdown as the record's one named `liveText` gap.

### Indirect text and font 4

Both were named as unresolved because the decoder fails closed on them, not
because a record was seen selecting either. Inventorying all 41 `$6000` records
in the census — 28 object, 3 ground, 10 building-detail — shows every one sets
the inline flag (bit 15) and selects font 0, 1, 2, 3 or 5. Neither path is
reached, so neither hides a catalogue form. A unit test re-runs the inventory so
a later decode cannot quietly introduce one.

## Vesta Parliament

Building detail 70 (`interior-02e910`) contains 50 ordinary faces followed by:

- command `$6000`;
- offset −210 and local anchor `(0, 90, 0)`;
- inline font 1, advance 24, glyph scales `(3, 4)`;
- direct white `$0777`;
- terminal token `$91`.

First-world RAM has a space at `$CD3F`, so the resident model contributes no
glyph there. In the live Vesta Parliament workspace `$CD3F` contains `E`.
The font-1 `E` is a filled glyph with 12 vertices and four faces. This matches
the supplied Working-Authority view: a white `E` appears left of the entrance
while the panel compass reads `E:N:`.

The catalogue therefore keeps a palette-30 resident variant with 50 faces and
a `palette-30-live-vesta` variant with 54. `structure-01454e` combines the
63-face plan with the live detail, yielding 117 faces. The live binding belongs
only to the current Vesta Structure Workspace; it is not applied globally to
other instances.

## Coverage effect

The same established parser preserves seven details formerly dropped at their
first `$60xx` record:

- `interior-027592`
- `interior-02a18c`
- `interior-02cab0`
- `interior-02d656`
- `interior-02db92`
- `interior-02e910`
- `interior-02fcb6`

All seven move from unresolved to partial. The census remains incomplete:
view-conditioned selection, articulated forms, unsupported text planes and
remaining special commands are still explicit gaps. Of the dynamic token states,
only the running explosive countdown is still one.
