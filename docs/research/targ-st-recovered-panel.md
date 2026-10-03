# Escape from Targ ST: recovering the Benson panel

Investigated 2026-10-03 as an expansion of [PR #742](https://github.com/odogono/mercenary/pull/742), alongside [Damocles panel research](damocles-recovered-panel.md). **The original Benson G9-ST panel can be extracted directly from the pinned ST disk.** It is uncompressed artwork in file `M`, not something that needs to be reconstructed from a running screen. Recommend recovering that presentation in a separately scoped implementation, with Targ's own composition and the browser's existing C64 session adapter.

This finding does not admit ST Game Semantics. [ADR 0063](../adr/0063-one-settings-page-across-titles-with-recovered-title-logos.md) admits the ST title logo only; [ADR 0027](../adr/0027-offer-authored-instrument-panels-as-display-compositions.md) supplies the existing authored ST-style panel. A broader presentation admission needs its own decision before shipping panel bytes. No payload, runtime, domain mapping or ADR changes accompany this investigation.

## Sources and reproduction

Primary evidence is the disk pinned by [`research/targ-st/config/baseline.json`](../../research/targ-st/config/baseline.json), its `ESCAPE.PRG`, `E1` and `M` files, and two Hatari RAM captures. The existing [STX/FAT reader](../../research/targ-st/targlab/disk.py) reads the files. Raw evidence and the one-off standard-library probe are Restricted Material under `restricted/targ-st-panel-742/` **in the main checkout** (`/Users/alex/work/mercenary` here), not committed to the PR.

From this repository root:

```sh
python3 restricted/targ-st-panel-742/probe.py
python3 restricted/targ-st-panel-742/probe.py --capture
```

The first command extracts and hashes the artwork offline, checks the relevant machine-code bytes and, if captures exist, verifies them. The second also reproduces both captures using the existing pinned Hatari 2.6.1 and EmuTOS image. Set `TARG_ROM_ROOT` as described by the [Targ tool README](../../research/targ-st/README.md) when using another media root. `report.json` records results; `panel.png` is the decoded disk art; `arrival.png` is the emulator screenshot; `command.json`, debugger `.ini` files and `hatari.log` record the capture recipe. `pristine.ram` is the historical filename of the immediate post-copy capture; its second screen already has some dynamic writes, as quantified below.

| Input / result | SHA-256 |
| --- | --- |
| Pinned STX | `4d9e48d79433d3e1ede888a5dbc94097d569a9014357838807d0de1d3cff2cdd` |
| `ESCAPE.PRG`, 652 bytes | `1632614b19937ef4fb5d3e730c951f0159d2f6870445dec8cb2f32ced5344ee2` |
| `E1`, 38,272 bytes | `afd5e5d3d95655620d53d6228a678b7db7f1ea496c75218ce878179c6870c061` |
| `M`, 60,544 bytes | `7b6569f2f5374220e31a2348a18936b8ea74e6c1e4181e3f45202e3424534d14` |
| Visible panel planar bytes | `1d18eb35125356ad2d6fc488fe5ed8e823eded5d0757dd9e2355315a8fff94be` |
| Decoded indices, one byte per pixel, row-major | `475012e3da3ee53d4b568dbfa21983f10e322249f6e409d5124193b38091279e` |

## Disk-to-screen chain

The [previous loader investigation](targ-st-title-logo.md#the-loader) establishes that `ESCAPE.PRG` loads `E1` at `$40000` and `M` at `$49580`, then enters `$40000`. `E1` jumps to initialization at `$4243A`; its `$42444` call enters `$40E36`.

At `$40ED4..$40EF2`, initialization sets source `$49580`, destinations `$6D500` and `$7D500`, then copies a longword to both destinations until the second destination reaches `$80000`. These addresses and loop instructions are checked byte-for-byte by the probe. This copies `$2B00` (11,008) bytes. **The visible panel is only the first `$2800` (10,240) bytes:** 320 × 64 pixels, four planes, 160 bytes per row, at screen rows 136–199. The loop additionally copies 768 bytes beyond each visible screen end; those bytes must not become extra image rows.

Decode `M[0:0x2800]` in ordinary ST low-resolution layout: twenty groups per row, four big-endian 16-bit plane words per group, most significant bit first, plane 0 contributing the low bit of the colour index. No decompression, mask recovery or screenshot cleaning is needed.

`E1` `$40CF4` selects the palette table at `$40D46`; `$40D08..$40D40` writes its sixteen words to `$FF8240`. The table is:

```text
000 776 332 110 777 700 367 221 001 445 040 733 443 665 474 110
```

The probe renders each ST three-bit channel with `round(channel * 255 / 7)`. That PNG is a convenient preview; the indexed-pixel and planar hashes above are the provenance anchors, independent of PNG compression and monitor colour appearance. This is the selected startup palette, not a claim that every later game palette state is identical.

## What is recovered, and what changes

The disk art visibly contains the complete raised frame, LOCATION / ALTITUDE / SPEED labels, three small annunciator apertures, ELEVATION and COMPASS faces, the text well with spaced MERCENARY lettering, and BENSON G9-ST branding. It also includes initial placeholder digits and instrument markings. Treat this as a base image with dynamic regions, not an immutable finished panel.

A breakpoint at `$40EF2` captures the source and both destinations immediately after the copy routine. The entire 11,008-byte source and first destination match disk bytes exactly. The second destination differs at 92 bytes, so it is **not** used as a pristine source. Interrupt-driven writes are a plausible explanation, but their precise timing was not traced here.

At VBL 2000, the screenshot shows the arrival star field and PRESTINIUM ON COURSE in the message well. The numeric fields still show placeholders during this arrival sample; it establishes no in-play numeric writer parity. The two visible panel buffers differ from disk at 115 and 279 bytes respectively. After excluding deliberately broad dynamic windows in panel-local coordinates, **all 11,756 remaining pixels match the disk art in each buffer**. Half-open excluded boxes `(left, top, right, bottom)` are `(12,8,36,50)`, `(48,8,260,23)`, `(268,8,312,50)`, and `(60,35,252,49)`. These are validation exclusions, not final renderer clipping specifications. Full capture hashes and boxes are in `report.json`.

There is direct code evidence that even small annunciators are painted over the base image: `E1` `$4100A..$41034` modifies six scanlines at both `$7DD80` and `$6DD80` using longword OR/AND masks; `$41066..$4109C` and `$410B8..$410EE` do paired word-mask writes at `$7DD5A` / `$6DD5A`; `$411B6..$411E0` does paired longword-mask writes at `$7DD38` / `$6DD38`. These are presentation-writer examples, **not** a completed inventory or an interpretation of the gameplay conditions selecting their states. The probe checks the artwork-copy path; it does not emulate those instrument writers.

## Implementation recommendation and remaining work

Use a Targ-specific recovered base image and Targ-specific instrument composition. Share low-level indexed-plane decoding, glyph blitting and clipping where contracts truly match the [Damocles investigation](damocles-recovered-panel.md), rather than assuming its layout, compass samples or numeric conventions apply to this older panel.

Keep the current C64-authoritative session behind the adapter. In particular, `web/src/shell/panel.ts`'s yaw offset and altitude conversion, `panelView.ts`'s authored instrument presentation, and the Orrery clock are browser choices; this extraction neither validates nor replaces those mappings with ST values.

[Follow-up #743](https://github.com/odogono/mercenary/issues/743) should first admit the panel as presentation, produce a deterministic restricted-media exporter with payload provenance, inventory the instrument/glyph sources and precise destination regions, then define which original visual conventions to reproduce over C64 state. Validate the resulting renderer against selected ST presentation samples without treating ST state evolution as the C64 oracle. This investigation proves base-art recovery and observed screen use; it does not claim exhaustive compass/elevation poses, full text/number decoding, palette lifecycle coverage, or semantic equivalence between editions.
