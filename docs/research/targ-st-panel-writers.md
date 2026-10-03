# Escape from Targ ST: panel writers and C64 presentation adapters

The [base-art investigation](targ-st-recovered-panel.md) is extended by a deterministic exporter, a natural in-play capture and two controlled native-writer probes for [#743](https://github.com/odogono/mercenary/issues/743). The browser reproduces the tested numeric, message, compass and elevation bitplanes. [ADR 0072](../adr/0072-render-targs-panel-from-recovered-st-presentation.md) narrowly admits the ST presentation; all Targ Game Semantics remain C64-authoritative. This is Working-Authority Evidence, independently implemented under ADR 0002.

## Reproduction and provenance

```sh
cd research/targ-st
python3 -m targlab export-panel
python3 -m targlab confirm-panel
python3 -m targlab export-panel-proofs  # review and pin bounded writer hashes
PYTHONPATH=. python3 -m unittest discover -s tests
cd ../../web
bun test test/targ-recovered-panel.test.ts
PORT=5194 bun run test:e2e e2e/targ-recovered-panel.e2e.ts
```

The exporter reads `E1` and `M` through the existing pinned STX/FAT reader. `payload/targ-st/panel.json` records the disk and complete input-file hashes, byte-checked writer address facts, decoded indices and each extracted table's source range and hash. It contains 320 × 64 indexed pixels from only `M[0:0x2800]`; the extra 768 bytes in the `$2B00` initialization copy are excluded. The planar and index hashes remain those established by #742. Font and instrument bytes are extracted data; checked code bytes serve only as provenance metadata; the browser executes no original instructions.

The pins and machine options are shared with the existing title confirmation. All raw results and commands live in `restricted/targ-st-panel-743/` in the main checkout. `report.json` lists the RAM hashes. At VBL 6000 the next `$43C12` pitch-writer return captures natural on-foot play with AIRCRAFT ON PAD, location 08-08, altitude 00000, speed +0000, heading word `$0100` and pitch word `$0200`. The selected draw buffer is `$62340 XOR $10000`. The comparison grades only the documented planes and destinations, not the whole scene or the opposite buffer's frame timing.

Two additional probes break in the live loop at `$4371A`, inject numeric source values, capture at `$43812`, inject heading at `$43A0E` and capture at `$43AD2`, then inject pitch at `$43B54` and capture at `$43C12`. These are controlled presentation inputs, not claimed naturally flown routes:

| Sample | Altitude source `$623AA` | Speed source `$62344` | Location words | Numeric result | Heading / pitch words |
| --- | --- | --- | --- | --- | --- |
| positive | `$00123456` | `$00021234` | 12, 34 | 12-34, 18204, +0001 | `$0000` / `$01AB` |
| reverse | `$0000FFFF` | `$0002EDCC` | −12, −34 | red 12-34, 00999, −0001 | `$0300` / `$0255` |

The browser's raw presentation-input probes match every graded pixel. The numeric results above are observed ST outputs, not a proposed conversion of C64 speed words. Source-word evolution and the original variable speed encoding remain outside the C64 adapter.

## Drawing contracts

All destinations below use screen coordinates; the panel starts at row 136.

| Writer | Extracted source | Destination and operation |
| --- | --- | --- |
| numbers `$43826` | `M`, `$4FB80`, 13 glyphs × 8-byte stride, first five rows | Plane 2, 8-pixel cells, rows 149–153. Altitude x=144,152,160,168,176; speed x=216,224,232,240,248. The last two glyphs are + and −; glyph 10 is the overflow star. |
| location `$4384E` | Same number font | Two cells at x=72,80 and x=96,104; separator survives from artwork. Negative axes set plane 2 to `$7F` and write `$7F XOR glyph` to plane 0; positive axes clear plane 0. |
| message `$435D6..$436AA` | `M`, `$4FAF0 + ASCII*8`, printable `$20..$60`, first seven rows | Plane 0, x=64–247, rows 175–181: 23 eight-pixel cells. The original shifts bytes between buffers before entering a new character at the right edge. The browser writes the C64 Benson Display's completed cell contents, retaining its own reveal timing. |
| compass `$43A0E` | `M`, `$4C000`, five-word slots; second 16-pixel group is 16 slots later | Plane 3, x=272–303, rows 170–174. Slot = `(floor((word & 1023)*576/1024) − 15) mod 576`. Sixteen four-word tick patterns at `E1 $43AD4` supply rows 165–168 and mirrored rows 180–177. Tick phase = `−slot mod 16`. |
| elevation `$43B54` | `M`, `$4F200`, 608 pairs of plane words | Planes 2 and 3, x=16–31, rows 149–180; 32 consecutive rows starting at the same slot rule after XORing the source word with 512. |

The 608-row strip includes enough tail for the maximum 575 start plus 32 visible rows. Compass slots and tick patterns belong to Targ; the later Titles' 64-frame compass and 20-row pitch window are different contracts. Only `PanelPlanes` and RGB expansion are shared.

Lamp writers are inventoried separately from their gameplay selectors. `$4100A` paints x=199–203, `$41066/$410B8` x=127–131, and `$411B6` x=55–59, all on rows 149–154. The speed aperture's complete four-plane masks produce indices 15 or 4; the altitude writer clears/sets planes 1 and 3, giving indices 5 or 15 over the pristine image. The location writer's four mask combinations produce 15, 5, 14 and 6. Their ST selection logic is not adopted as C64 behavior.

## Authored Session Snapshot adapters

`panelViewModel` and the #715 attitude contract remain unchanged. `targPanelReadouts` is an explicit presentation boundary:

| C64-derived readout | Recovered presentation mapping |
| --- | --- |
| Heading | Keep the browser's half-turn Targ yaw offset. Map its displayed bearing to `round(−degrees*1024/360) & 1023`; the native tape descends as its source word rises. Thus displayed 0/90/180/270 maps to 0/768/512/256. |
| Pitch | Keep nose-up-positive wrapped degrees. Map to `round(512 − degrees*1024/360) & 1023`; level is word 512. |
| Altitude | Keep `trunc((lift instrument altitude or player y)/256)` and five digits; overflow is five stars. This conversion was already authored for the C64 session and is not the ST fixed-point altitude source. |
| Speed | Keep truncated C64 whole speed units and sign, four magnitude digits; overflow retains its sign beside four stars. Arrival's five stars remain five stars. ST's variable raw speed representation is not substituted. |
| Location | Keep the bounded two-digit C64 surface axes, including stars outside the grid. A room `RM nn` is authored as `nn-**` in the narrow recovered numeric window (rooms above 99 become `**-**`); the semantic readout retains `RM nn`. |
| Lamps | Retain the existing authored ground warning, aboard indicator and on-foot running toggle. Map true/false to location 5/15, altitude 5/15 and speed 4/15 respectively. These are browser meanings and explicit visual colours, not recovered ST selector equivalence. |
| Message | Retain the C64 23-cell Benson Display. Uppercase supported text, clip to the aperture, pad with spaces and use the recovered seven-row font; an unsupported character uses ?. Retain the Metal Detector's authored ink colours in the visible canvas and semantic text. |

The panel uses the selected startup palette at `E1 $40D46`, expanded from three-bit channels. The alternate palette and runtime changes exist in the ST program; no complete palette lifecycle parity is claimed. In particular, C64 Benson colour state retains the existing authored RGB ink for Metal Detector colours 2/5/6 (`#ab3c65`, `#5ed638`, `#3a31ff`), applied only to message ink. It is also retained in the semantic display metadata and is never interpreted as an ST palette index.

## Comparisons and review

The #742 immediate post-copy first buffer equals the complete source; the visible extraction matches its first 10,240 bytes. For both arrival buffers, excluding #742's broad dynamic boxes leaves 11,756 pixels, all equal to pristine art. The new tests repeat these checks when Restricted Material is present. Those broad boxes are validation exclusions only; browser writers use the precise destinations above.

The native-writer comparisons grade location planes 0/2, numeric plane 2, pitch planes 2/3, compass plane 3 and message plane 0. Natural play validates populated readouts and a completed message; controlled probes add signed axes, positive/reverse speed, nonzero altitude, compass quarters and positive/negative pitch. They do not establish exhaustive heading/pitch captures, every message glyph, palette transitions, lamp selector behavior, or full dynamic writer parity. Tracked region hashes keep these samples testable without raw captures.

The deterministic browser fixture produces pristine, arrival, on-foot, airborne, reverse and room/overflow images, with reload equality checks. They are saved as Playwright attachments and retained under `restricted/targ-st-panel-743/browser/` for maintainer review. Live arrival, rendition switching, strip selection, responsive sizing, Benson cell/reveal behavior and running indications are covered by the existing browser suites. Semantic readouts remain beside the pixel canvas, including explicit degree values and lamp states; the canvas is decorative for accessibility.
