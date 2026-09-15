# Damocles building-detail vector text

Working-Authority Evidence for the `$60xx` records embedded among Damocles
building-detail faces. Research note for
[#173](https://github.com/odogono/mercenary/issues/173).

Authoritative Evidence remains bound to the C64 Reference Build. These findings
are Working-Authority Evidence only. The targeted Working Disassembly and RAM
captures remain ignored Restricted Material.

## Scope

This note establishes enough of the native grammar to retain the surrounding
building geometry and render the evidenced inline text forms. Indirect text,
other text planes, and glyph forms outside those encountered here remain
unresolved rather than guessed.

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
The native routine indexes the low seven bits, renders the pointed
NUL-terminated workspace string, and returns after the token. `$97` and `$98`
point to the current ten-character place name and kind at `$CD4C`/`$CD58`.
`$91` points to the current one-character face marker at `$CD3F`.

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
view-conditioned selection, articulated forms, unsupported text planes,
remaining special commands, and non-captured dynamic token states are still
explicit gaps.
