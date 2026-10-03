# Recovering the Damocles Benson Panel

Working-Authority Evidence, recovered 2026-10-03 for [#716](https://github.com/odogono/mercenary/issues/716).
Authoritative Evidence remains bound to the C64 Reference Build. Addresses below refer to
Damocles ST unless explicitly labelled Mercenary III. Raw disk files, RAM, working disassembly
and frame crops remain Restricted Material under `restricted/damocles-716/` in the main
checkout, following [ADR 0002](../adr/0002-separate-rom-research-from-implementation.md).

## Recommendation

Adopt recovered artwork and original writer rules for the **actual Damocles Session**. Share
proven bit-plane, glyph and attitude-strip operations, with a Damocles composition owning its
fields, centre content and source words. Do not call `drawDionPanel` wholesale: its METIS/taxicard
composition is not Damocles. Both attitude displays can produce identical pixels across the
Titles, despite the compass's different storage format. The evidence below establishes that
comparison for all 64 compass positions, not just a similar-looking screenshot.

Retain the authored Targ rendition, Damocles-dressed Targ and Flyover choices during the
Damocles port. [The separate ST Targ investigation](targ-st-recovered-panel.md) examines
recovering Targ's own panel artwork; that adoption would need its own presentation-only
decision, preserving the C64 Reference Build's authority. A narrow ADR
should supersede ADR 0027 only for the actual Damocles Session, within ADR 0043's recovered
Damocles scope; this research does not itself change either decision. Preserve the shared
attitude contract from #715 and the existing recovered pitch implementation from #718.

## The artwork is a packed file, not a reconstructed frame

The independent disk reader in [`damocleslab/title.py`](../../research/damocles-st/damocleslab/title.py)
recovers four directory entries: `BOOT`, `ETITLE.NEO`, `DAM0` and `DAM1`. There is no separately
named panel NEO image. Decrypting and unpacking `DAM1` through that reader produces 43,776 bytes;
its first `$2800` bytes are the pristine 320 × 64 panel in interleaved ST bit-planes.

BOOT `$68088` selects the name at `$6809E` (`DAM1`), `$6808C` sets destination `$6D500`, and
`$68092` calls its loader. `$6D500` is screen `$68000` plus row 136. Damocles `$50936` copies
`$6D500..$6FCFF` to `$7D500..$7FCFF`; the copy routine is byte-identical to Mercenary III's
`$50EDC`. Thus the recovered source is the file head, **before** live readouts overwrite it.
The pitch strip is also in DAM1, offset `$9100`, mapping to `$76600`.

| Recovered source | SHA-256 |
| --- | --- |
| Unpacked DAM0, 425,664 bytes | `b25a0f53fe4b8a648e0f34f2ef9489ffc21e2af5f069cf73a2c1b625ee3781e7` |
| Unpacked DAM1, 43,776 bytes | `6b101bc97d14c695e51ffa36a35d5bf3ca1238c5102703dee6beccfdbdff1437` |
| DAM1 panel head, `$0000..$27FF` | `d90473c1442e98ab086c5573c1e34ed738dfbaa813fe0a0f83d88fd0c61928e6` |
| Panel copy `$50936..$5094D` | `ebfe5c369478216c1bf570eef8b6a5d9fe71b640966ac8f961be5632eeb681ff` |

These hashes and loader instructions come from the recovered files and pinned first-world RAM
(`observe-first-world-20260818T101013Z-c5a32b7d/observed.ram`), not a painted reconstruction.

## Compass: different representation, equivalent output

Damocles `$52A0E` reads heading `$7AC2`, negates it, masks `$3F0`, and compares with cache
`$52A0A`. On change it shifts right three and multiplies by 27. This selects one of 64
**54-byte precomputed frames** at `$5CB00`: frame `n = ((-heading) & $3F0) >> 4`.
The table is recovered from DAM0 offset `$5C9C0` (loaded address minus `$140`).

Each frame has nine rows of three words. `$52A3E..$52B1D` writes each row's third word,
second word and low byte of its first word into plane 3 at x 80–119, rows 182–190,
in both screens (destinations `$7F1EE` and `$6F1EE`, row stride 160). The six pixels at
x 80–85 and two at x 118–119 are forced set; x 86–117 hold the visible scale.

Mercenary III `$53A2E` instead windows its 112-pixel strip at `$66104`, with
`m = (-(heading + $70) & $3F0) >> 4`. An exhaustive comparison of **every output bit in
all 64 × 9 × 40 pixels**, using the independently recovered Damocles table and tracked
[`payload/dion/panel.json`](../../payload/dion/panel.json), passes with `m = (n - 7) & 63`.
This includes the forced margins. The different source addresses and representation therefore
produce the same compass for the same raw heading. Keep a Damocles provenance/equivalence
check if the eventual writer normalizes its table into the shared strip representation.

| Range | SHA-256 |
| --- | --- |
| Compass writer `$52A0E..$52B1F` | `c9a60b318f4b5ffea5d756ae821e56eb619baab0e5b3d9794a5ae887c635961b` |
| 64 frames `$5CB00..$5D87F` | `d8af9950d7fedda5030ec8752192bd167c47a51c5d65053f0e7ad122ac319e54` |

The Mercenary III reference rules are independently documented by
[`m3lab/panel.py`](../../research/mercenary-iii-st/m3lab/panel.py), `_fields`.

## Pitch and captured frames

[#718](https://github.com/odogono/mercenary/issues/718) already established
[`$52B24`, strip `$76600`, word `$7AC0`](damocles-pitch-strip.md): twenty rows from
`(pitch & $3F0) >> 4`, planes 1 and 3, x 16–31, rows 171–190. Its 332-byte strip is identical
to Mercenary III's. The original has unsigned `0` and `90` marks, four-row tick spacing and
sixteen strip rows per quarter turn; sky/ground colours express orientation. It does not print
a signed continuous degrees number.

The additional offline check reads actual framebuffer words from captured Hatari memstates,
without running or modifying the game. **Both screens match the pitch and compass writers in
all three captures**, including all twenty pitch rows and all nine compass rows:

| Capture | Raw pitch | Window start | Raw heading | Context |
| --- | --- | --- | --- | --- |
| `eris-spaceport-onfoot` | `$01FF` | 31 | `$0600` | on foot |
| `boarded-limo` | `$01FF` | 31 | `$01E4` | aboard, ground |
| `dion-north-airborne` | `$025F` | 37 | `$0298` | aboard, pitched down |

The airborne frame shows `0` toward the top of the gauge, ground below it, matching the
higher strip window; the on-foot and ground-aboard gauges use the same nearly-level window.
The comparisons establish the same writer aboard and on foot. They do not claim captures at
every possible angle; the level and 45-degree descriptions in the earlier pitch note are
strip decodes, not additional live captures.

Full RAM SHA-256 values are, in table order:

- `1366881c62ab9e80a5fe8b1dcbb5dfa2ccc0142e4a921cd029f9dfc8f6b16465`
- `2e1218cfcd7554520de5f0f56588a9920d976d8efa4b4c97508058e76759b224`
- `faf7a4acb3c7d4bec435bea716ba5626389338b0522bf399e20d11896a8197cc`

`restricted/damocles-716/check.py`, `checks.json` and `*-panel.png` retain the offline probe,
results and framebuffer crops. Run from the repository root with Python and Pillow:

```sh
python3 restricted/damocles-716/check.py
```
The crops visualize decoded framebuffer indices using the captured `$6FD02` palette, without
emulating the colour-1 raster split; they are framebuffer reconstructions, not direct Hatari
screenshots. The attitude strips use colours 0, 2 and 8, unaffected by that split. Byte
comparisons, not PNG rendering, are the verification. Disk recovery uses `title.stx_tracks`, `directory`, `read_file`, `decrypt_file`
and `unpack` on the pinned STX, selecting `DAM1`; these are the same independently tested
primitives already used for #695.

## Other writers and palette

Damocles's Timer B panel palette load is `$522DA`: colours 1–15 from `$6FD02` into `$FF8242`.
It schedules another interrupt sixteen scanlines later (`$522F6`); `$52340` loads colour 1
from `$6FD20`. Together with the row-136 setup at `$51DD2`, this is the same row-136 / row-152
panel split used by Mercenary III. The `$522C4..$5234B` writer hash is
`91516302b6e6d024529de547cc00de236aa9a6410efc5f4a8707a1b9d894e9ac`.
Centre activation changes palette entries (`$529A2`, `$529AA`), so a port must retain live
palette state rather than freeze one captured palette.

Existing primary investigations already identify the following Damocles writers; sharing the
rendering mechanism does not make their source words or meaning interchangeable with MIII:

| Readout | Damocles writer / evidence |
| --- | --- |
| Speed, sign and nine digits | `$4DFF4`, field `$4DFEC`, sign `$797C`; [aboard research](damocles-panel-aboard.md#the-speed-field) |
| Altitude / space range | `$4DF42` / `$4DEEE`, shared printer `$4DF5C`, two whole and four fractional digits, overflow glyphs; [aboard research](damocles-panel-aboard.md#the-altitude-window) |
| Impact clock | VBL `$51E6E`, tick `$521A2`; [aboard research](damocles-panel-aboard.md) |
| Lamps | `$509F6`, `$50A5C`, `$5097C` / `$5099A`; [lamp research](damocles-panel-lamps.md) |
| Scrolling message row | `$52402`; [message reveal research](damocles-message-reveal.md) |
| Centre reveal / palette | `$5293E` family, including `$529A2..$52A06`, decoded here only enough to establish title-specific dispatch |

This investigation does **not** yet supply a complete extracted Damocles font/layout/centre
schema or parity tests for every readout. These are port prerequisites, not a reason to retain
invented artwork. The known speed and centre differences rule out simply supplying Damocles
state to the current MIII composition.

## Follow-up acceptance

1. [#740](https://github.com/odogono/mercenary/issues/740): Extend the independent Damocles payload extractor to recover pristine DAM1 artwork,
   palettes, compass frames, fonts and field layouts with disk/RAM provenance. Keep the
   existing pitch payload stable. Validate all compass positions and both framebuffers of
   the three captures above; recover remaining field/centre writer details before claiming
   complete parity.
2. [#741](https://github.com/odogono/mercenary/issues/741), blocked on #740: Implement a Damocles composition using shared proven drawing primitives. Preserve the
   original raw-word readout rules, row palette split, centre/message behavior and the
   existing browser pointer interactions. Add captured-frame comparisons across on-foot,
   aboard and airborne states. Adopt the narrow ADR change at that point, preserving
   authored Targ/Flyover renditions and #715 attitude tests.
