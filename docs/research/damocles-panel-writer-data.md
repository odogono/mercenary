# Damocles panel writer data

Working-Authority Evidence recovered 2026-10-03 for [#740](https://github.com/odogono/mercenary/issues/740).
Authoritative Evidence remains bound to the C64 Reference Build. This is payload preparation;
it does not replace the browser panel or establish whole-game display parity.

## Evidence and method

The primary inputs are the pinned first-world RAM
`research/damocles-st/work/observe-first-world-20260818T101013Z-c5a32b7d/observed.ram`
(SHA-256 `b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967`)
and independently unpacked `restricted/damocles-716/DAM0.bin` / `DAM1.bin`.
Their identities and loader offsets are documented in
[the recovered artwork investigation](damocles-recovered-panel.md#the-artwork-is-a-packed-file-not-a-reconstructed-frame).
DAM0 maps file offset zero to RAM `$140`; DAM1 maps it to `$6D500`.
All font and centre source ranges below compare byte-for-byte between disk and pinned RAM.

Bounded offline Capstone 68000 listings, probe scripts and decoded machine-readable facts remain
under the main-checkout-linked `restricted/damocles-740/`. In particular,
`drawer-full.txt`, `fields.txt`, `field-tail.txt`, `clock.txt`, `palette.txt`,
`activation.txt`, `activate-full.txt`, `centre.txt` and `vbl-start.txt` own the facts below.
`geometry.py` interprets the Damocles layout rotations with a single marked glyph bit to recover
cell positions and field masks; `writer-facts.json` records numeric source ranges and hashes.
This is a static instruction-derived geometry check, not a captured-frame comparison for every
text field. Mercenary III's `m3lab/panel.py` supplied a mechanism checklist only; all addresses,
bytes, counts and dispatch facts here come from Damocles.

## Fonts

| Font | Recovered records / actual reader | Shape | Encoding |
| --- | --- | --- | --- |
| Panel text | `$76200..$763FF`; `$4E7C2` uses `$76101 + 8×code` | 64 codes `$20..$5F`, 5×5, six-pixel cells | Five bytes beginning at record byte 1; inverted bits 4..0 |
| Message | `$76400..$765FF`; `$525D2` uses `$76300 + 8×code` | 64 codes `$20..$5F`, 5×6, six-pixel cells | Six bytes beginning at record byte 0; ordinary bits 4..0 |
| Panel digits | `$4C75C..$4C7C3`; `$4E7CA` uses `$4C75C + 8×value` | 13 records, 3×5 | Inverted bits 2..0; values 10 placeholder, 11 plus, 12 minus |
| Centre digits | `$4C7C4..$4C813`; `$4DA8E/$4DB52/$4DB7A` selects this base | 10 records, 5×5 | Inverted bits 4..0 |
| Impact clock | `$5222A..$52279`; `$521E4` selects `$5222A + 8×digit` | 10 records, 8×7 | Inverted full bytes, written into planes 0 and 1 |

The panel and message tables are adjacent, independently recovered 512-byte blocks in DAM1,
offsets `$8D00` and `$8F00`. Existing message research hashed the 59 records used by the bank's
ASCII `$20..$5A` alphabet. The remaining five source records `$5B..$5F` are also present and
contain valid glyph rows: A/O/U umlauts, sharp s and a quote mark. This extends the bounded font
recovery; it does not claim that the current bank's messages exercise those codes. Codes above
`$5F` and digit values above 12 are outside these extracted tables.

## Text fields and native inputs

All listed text rows are five scanlines tall. The drawer sets the selected plane across each
inclusive box, then clears it beneath glyph ink, updating both screen buffers. Cells below name
the glyph's leftmost ink-column position, including spacing left by the native layout table.

| Field | Writer; layout table | Row / plane | Cells | Inclusive boxes |
| --- | --- | --- | --- | --- |
| Location | `$4DBF2`; `$4DBDA..$4DBEF` | 161 / 3 | 17, 23, 29, 35, 41, 47, 53, 59 | 16–63 |
| Speed | `$4DFF4`; `$4DFC4..$4DFE1` | 161 / 3 | 72, 78, 82, 86, 92, 96, 100, 106, 110, 114 | 72–74; 78–120 |
| Inventory | `$4DDE2/$4DE9A`; `$4DD90..$4DDBB` | 161 / 1 | 208 + 6×n, n=0..15 | 208–303 |
| Body position | `$4E390`; `$4E2B8..$4E2C9` | 172 / 3 | 33, 37, 41, 52, 56, 60 | 32–45; 50–63 |
| Altitude / space range | `$4DF42/$4DEEE`; `$4DECE..$4DEE3` | 172 / 3 | 94, 98, 102, 106, 110, 114 | 94–117 |
| Cash | `$4E1B4`; `$4E17E..$4E1A1` | 172 / 1 | 208, 212, 216, 224, 228, 232, 240, 244, 248, 256, 260 | Each cell through cell+2 |
| Centre category 2 | `$4DBBE`; `$4DB84..$4DB9D` | 170 / 2 | 136 + 6×n, n=0..7 | 136–183 |
| Centre category 5 | `$4DA06`; `$4D9D4..$4D9F1` | 170 and 177 / 2 | 130 + 6×n, n=0..9 | 130–189 |

Location reads eight bytes at `$81DC + 2×code`: code `$7AA8` on a Body, `$7922` in space;
an active `$7882` overrides the Body code with `$78`. Inventory's 16-byte window at `$4DDBC`
scrolls one character per VBL when `$4DDD0` is nonzero, using the name pointer `$4DDCC`.
Its records are selected through the Damocles item table rooted at long `$4BD10`; this is a
long-offset table, not Mercenary III's word-offset name lookup.

Speed reads long `$4DFEC`, with sign from `$797C`, followed by nine digits from successive
4.28 fractional multiplication by ten. Altitude/range uses the shared two-whole/four-fractional
digit printer, with six value-10 glyphs on overflow; the detailed arithmetic remains in
[the aboard investigation](damocles-panel-aboard.md).
Position reads `$7A1E/$7A22`, each converted by unsigned multiply `$FA00`, high word, then
three decimal digits. Cash reads six BCD bytes `$7C42..$7C47`; the first of twelve digits is
omitted. Its commas and decimal point belong to pristine artwork.

The Body grid writer `$4E246` reads signed words `$7A2C/$7A34`, clamps magnitudes to 100,
and uses decimal pairs at `$526C2`. Its two windows are x 68–75 and 80–87 on rows 172–176.
Positive ink clears plane 3; negative ink sets plane 0. The frame around the Body position
window is a separate writer `$4E2F2`, including its middle dash.

## Clock, gauges, lamps and message row

The impact clock uses cells x 240, 248, 264, 272, 288 and 296 on rows 186–192, planes 0/1.
`$521EE` writes changed digits only. It starts with the rightmost cell at `$7F4D1` and draws
right-to-left using the six subtraction words at `$52164`; the clock's separators are artwork.
Its signed countdown long is `$793C`, and its timing is established in the aboard note.
`restricted/damocles-740/clock_probe.py` compares all six glyphs, seven rows and both
planes against the cache at `$52170..$52175` on both buffers of all three #716 captures;
all checks pass (`clock-checks.json`). Those captures show 02:23:03, 02:21:32 and
01:56:36, respectively. This additionally confirms the clock placement and font bytes.

The per-VBL gauge writer `$527CC..$52937` moves one row towards its value each call:

- T: `$787E`, clamped to 48; x 6, rows 142–189, planes 1/2.
- P: `$7880`, clamped to 48; x 313, rows 142–189, plane 1.
- Inventory: `$787C`; x 202, rows 159–178, plane 1. This reader has no explicit clamp.

An increasing level clears its plane bits from the bottom upwards; a decreasing level sets
them again. The source-dependent cache words live at `$527C6/$527C8/$527CA`.
The five-pixel lamp interiors are x 199–203, 213–217 and 227–231 on rows 186–192.
These exact writer ranges follow masks `$01F0/$07C0/$1F00` at destinations
`$7F4A6/$7F4A8/$7F4B2` (`restricted/damocles-740/lamps.txt`). The earlier
[lamp investigation](damocles-panel-lamps.md) names artwork edges one pixel earlier; its
recovered meanings and plane changes still apply.
The message row is x 16–303, rows 144–149; its planes, six-pixel character cells,
eight-pixel VBL scroll and hold semantics remain the
[message reveal contract](damocles-message-reveal.md#the-row).

## Palette and centre

Damocles evidence independently establishes the panel split: VBL `$51DD2` selects row 136,
Timer B `$522DA` loads colours 1–15 from `$6FD02..$6FD1F`, and `$522F6` schedules sixteen
more scanlines before `$52340` replaces colour 1 from `$6FD20`, at row 152. Colour 0 remains
from the frame palette, whose pointer is `$7C14`; the panel interrupt never reloads it.
The pinned panel words are mutable initial state, not a fixed palette: `$4D5E8` XORs sixteen
words from `$6FD24..$6FD43` with the word it publishes at `$7A52` to rebuild
`$6FD02..$6FD21`. Activation also copies its selected colour words into that baseline block.
The pinned capture has baseline colour 4 `$707` but active colour 4 `$000`, matching
the centre's `$7862` word. The payload records that difference and both palette sources;
rebuilding a baseline palette alone does not preserve the captured centre colours.

The centre box is x 128–191, rows 160–191 (64×32), independently read from `$52946..$52972`.
The seven-word relative-offset table `$66100..$6610D` selects these interleaved four-plane
art blocks, each `$400` bytes:

| Categories | Art address | Following title bands |
| --- | --- | --- |
| 0 | `$6610E` | None |
| 1, 2 | `$6650E` | `$6690E..$66C05`, nineteen 40-byte slots |
| 3 | `$66C06` | None |
| 4 | `$67006` | None |
| 5 | `$67406` | None |
| 6 | `$67806` | `$67C06..$67D45`, eight 40-byte slots |

The activation definition table is **29 eight-byte records** at `$4D2C4..$4D3AB`, followed
by a zero item sentinel. Each record is item byte, category byte, band byte, padding byte,
colour A word, colour B word. Nineteen records select category 2, three select categories
3/4/5 once each, and seven select category 6. Category 2 bands are 0, 2, …, 36;
category 6 uses 0, 2, 6, 8, 10, 12, 14. The missing category-6 band 4 is source artwork,
not an inferred activation record.

`$58EC8` selects art and stamps a five-row title into art line 1 for categories 2 and 6,
from `art + $400 + 20×band`. Each word becomes plane 0's complement and the same word
in planes 1–3: **paper index 1, ink index 14**. This differs from Mercenary III's title
stamp, which uses index 15 ink and a different category/footer arrangement.

`$5293E` reveals over 64 VBL calls: 32 black incoming rows, then 32 art rows, scrolling
both buffers upwards by one row each call. At count 32, `$7862` replaces colour 4 at
`$6FD08`, and `$7864` replaces lower colour 1 at `$6FD20`. Activation obtains those
words respectively from record colour B/A and XORs each with `$7A52`.
After the count reaches zero, category dispatch is 2 → `$4DBBE`, 3 → `$4DAC6` then
`$4DB66`, 4 → `$4D58E`, 5 → `$4DA06`, 6 → `$4D992`.
These are Damocles content writers, not the METIS/taxicard composition.

## Explicit limits

All category art, reachable activation records and native title bands are recoverable Data
Payload. Naming every centre category's gameplay meaning, reproducing every item's activated
content, and validating all those states against captured frames remain separate work.
The space-specific signed three-number composite `$4E414` has source addresses and writer
identity recovered here, but no normalized composite layout is claimed. Message numeric token
expansion belongs to message research. Runtime comparisons in #740 establish the recovered compass/pitch and the speed, altitude
and clock readouts on both buffers of three captures. They do not establish full parity
for all font, gauge, centre and field combinations. Unsupported fields must retain those gaps.

## Source hashes

Ranges below are inclusive; hashes are SHA-256. `writer-facts.json` records exclusive numeric
ends for automation. Every listed font/art range equals the independently recovered disk bytes.

| Source | Range | SHA-256 |
| --- | --- | --- |
| panel font | `$76200..$763FF` | `c53d4a92f2ab728f71126f920c0b546c28b70ceb2b7067518466024c8c02cbc4` |
| message font | `$76400..$765FF` | `1d59b69e80825c6f811b19088e9bf91004468d3d97294b32d128cb0304230f22` |
| digits font | `$4C75C..$4C7C3` | `b81dfb4d563f5a83b338715e9b96ce4b7cb839dc23d83ab299d5ca97bee4c50d` |
| cardDigits font | `$4C7C4..$4C813` | `f31fe00b43b53f9b30f6f72af7b7a78a77d29ef71642102e37fe45ad7c4d25d3` |
| clock font | `$5222A..$52279` | `3d2a95fc538441a78c20d72be114f8591d1851082401e5113eaf23aa76b7a520` |
| location layout | `$4DBDA..$4DBEF` | `12d97a2904c57a1d01f3a7817c5d29108fd25df39fd4e1500a21df6bd67f0e2f` |
| inventory layout | `$4DD90..$4DDBB` | `d2394421cb55523761b4e98e7cc0496105ecc65fdd6239d795eec9303e00c035` |
| altitude layout | `$4DECE..$4DEE3` | `300991a86674790fa7188ae677321ac2abe9bcd9fdb16193eb7344f49f60c83c` |
| speed layout | `$4DFC4..$4DFE1` | `4489fa9b001710b9befaf5c3035de2daf03981f09743c5b47703c0d72c003d61` |
| cash layout | `$4E17E..$4E1A1` | `9c7b450cf09543e0bf582840696431b799aed2af2dc576abc46829d52c980324` |
| position layout | `$4E2B8..$4E2C9` | `c700c11f8a5f4fdbc7122aa908c82990e5dee86eaa4f84d5d1ffb247ec8be458` |
| centre2 layout | `$4DB84..$4DB9D` | `a59199acb62a20f79c6559444e3087e1ec6ac3dadb362b1927398d7973783fd4` |
| centre5 layout | `$4D9D4..$4D9F1` | `79c636c54cdf408ed7c235c0c5bac6a1078feab65e9fc031808a6cd46340edc5` |
| Centre table | `$66100..$6610D` | `2c3e22d109726157061a961a9646e7652e44fd0770bfa483edfe9d6ca1203e3b` |
| Centre definitions | `$4D2C4..$4D3AD` | `dab478903c040ebe5c8bf1c81c84b3254fdb7d21ebc64396c398a81c1511b704` |
| Centre selector | `$58EC8..$58F2B` | `d40a42a39b14976d9c44c1fd9ee7f21ba7638bf7bff4a1026830d8bec6c6f97e` |
| Centre reveal | `$5293E..$52A09` | `f2532a675c7c9a48ab4a91bbc9f9c5a4b95bb9260cc926f7a1849acbe03c66c0` |
| Palette interrupt | `$522C4..$5234B` | `91516302b6e6d024529de547cc00de236aa9a6410efc5f4a8707a1b9d894e9ac` |
| Palette VBL | `$51D9A..$51DFD` | `6fa3e4e5ef3f22afcb1bfd62e486f08b4d0f956c5548d254587345b54c9a472f` |
| Palette mutation | `$4D5E8..$4D609` | `4a642207364fb4429d70a040f32af5be921db1f28ba761f6ef47d067bb6f30ef` |
| Text drawer | `$4E7C2..$4E935` | `493fd3ca34116d9677c5c76ef03968f05cb9ddf44a8a701f56171bd4dfff2ec2` |
| Gauge writer | `$527CC..$52937` | `9c32c3a5aed27d46bbc4ea09eb02e5c5412e56536c0fb568823e9db5276a8552` |
| Centre category 0 | `$6610E..$6650D` | `1edb71742356933eb52e0185695b46d115a069d1efc11676b688e138d10f9ca5` |
| Centre category 2 | `$6650E..$6690D` | `504a080c3740ec7a60c263c8fc4b35981e9e9661da347a1474b47ef395b80970` |
| Centre category 3 | `$66C06..$67005` | `99530e9ef40a4135ad4b7cc16bcb69283f57377dfd556a749a9997a20b01cb05` |
| Centre category 4 | `$67006..$67405` | `5446524c2ff48cb72bdb0c35585b91df2660c01e261c04f5a486519318189dc0` |
| Centre category 5 | `$67406..$67805` | `893a119f09dd1000bc5f61857b3d6e80fbf04296f559d3ee00cb69a69d295ecd` |
| Centre category 6 | `$67806..$67C05` | `f8d9cf8f7e776f8f07bf4cb898207cd2cacc0c82a396fcf6058bc0a452b92921` |
| Centre bands 2 | `$6690E..$66C05` | `e00ca7fb5c32bb9ca198c28c0233eb64bae1f28cfe4b8fac6483aaaf71da68b3` |
| Centre bands 6 | `$67C06..$67D45` | `7fe179cccf196f3309af813114a6cbcd0e5397fcf101a32ba0c6446ad98d5ab7` |
